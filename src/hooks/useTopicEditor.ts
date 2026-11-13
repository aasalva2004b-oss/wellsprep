import { useState, useMemo, useEffect } from "react";
import { Topic } from "../types";
import { TopicProgressData } from "../lib/prediction";
import { useFirebase } from "../lib/FirebaseProvider";
import {
  isCantoSession,
  getCantoDuration,
  compareSessionsDesc,
} from "../lib/cantoUtils";
import { calculateCanonicalRetention } from "../lib/ebbinghaus";
import { getLocalDateString } from "../lib/utils";
import { toast } from "sonner";

export interface UseTopicEditorProps {
  topic: Topic;
  topicId: string;
  progress: TopicProgressData | undefined;
  onClose: () => void;
}

export function useTopicEditor({ topic, topicId, progress, onClose }: UseTopicEditorProps) {
  const {
    userProgress,
    topicState,
    updateTopicProgress,
    addStudySession,
    deleteStudySession,
    user,
    recentSessions = [],
  } = useFirebase();

  const canonicalTopic = topicState.get(topicId);

  // Tab State
  const [activeTab, setActiveTab] = useState<"general" | "ebbinghaus" | "canto" | "history">("general");

  // Topic field overrides
  const [pages, setPages] = useState<string>(
    canonicalTopic?.hasExplicitPages ? String(canonicalTopic.pages) : ""
  );
  const [difficulty, setDifficulty] = useState<number>(
    canonicalTopic?.difficulty ?? topic.difficulty
  );
  const [customTitle, setCustomTitle] = useState<string>(
    progress?.customTitle || topic.title || ""
  );
  const [numeroPalabras, setNumeroPalabras] = useState<string>(
    progress?.numeroPalabras ? progress.numeroPalabras.toString() : topic.numeroPalabras ? topic.numeroPalabras.toString() : ""
  );
  const [notas, setNotas] = useState<string>(progress?.notas || "");

  // Form logging state
  const [logType, setLogType] = useState<"estudio_inicial" | "repaso" | "refresco" | "canto" | "simulacro">("repaso");
  const [logDurationHours, setLogDurationHours] = useState("");
  const [logDurationMinutes, setLogDurationMinutes] = useState("");
  const [logDurationSeconds, setLogDurationSeconds] = useState("");
  const [logDifficulty, setLogDifficulty] = useState<number | "">("");
  const [logCompletesVuelta, setLogCompletesVuelta] = useState(true);
  const [logDate, setLogDate] = useState(getLocalDateString());
  const [logNotes, setLogNotes] = useState("");
  const [logMistakes, setLogMistakes] = useState("");
  const [logCantoGrade, setLogCantoGrade] = useState<number | "">("");
  const [logCantoType, setLogCantoType] = useState<"solo" | "preparador">("solo");

  // Status flags
  const [isSavingSession, setIsSavingSession] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);
  const [isConfirmingDeleteTopic, setIsConfirmingDeleteTopic] = useState(false);

  // Sessions normalized and deduplicated for this topic
  const [sessions, setSessions] = useState<any[]>([]);

  useEffect(() => {
    const matched = canonicalTopic?.sessions ?? [];
    const processed = matched.map((s) => {
      const isCante = isCantoSession(s);
      const dur = isCante
        ? getCantoDuration(s)
        : {
            mins: Math.round(Number(s.durationMinutes || s.duration || 0)),
            secs: Number(s.cantoSeconds || s.seconds || 0),
            totalSecs: Math.round(Number(s.durationMinutes || s.duration || 0) * 60) + Number(s.cantoSeconds || s.seconds || 0),
            formatted: `${Math.round(Number(s.durationMinutes || s.duration || 0))}m`,
          };
      const effectiveGrade =
        typeof s.cantoGrade === "number"
          ? s.cantoGrade
          : typeof s.grade === "number"
          ? s.grade
          : undefined;

      return {
        ...s,
        id: s.id,
        topicId: s.topicId || topicId,
        date: s.date || getLocalDateString(),
        type: s.type || "repaso",
        duration: dur.mins,
        durationMinutes: dur.mins,
        difficulty: s.difficulty,
        notes: s.notes,
        cantoGrade: effectiveGrade,
        createdAt: s.createdAt,
        completesVuelta: s.completesVuelta,
        cantoSeconds: dur.secs,
        mistakes: s.mistakes,
      };
    });

    processed.sort(compareSessionsDesc);

    // Deduplicate exact duplicate submissions
    const deduped: any[] = [];
    const seen = new Set<string>();
    for (const s of processed) {
      const key = s.id;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(s);
      }
    }
    setSessions(deduped);
  }, [canonicalTopic?.sessions, topicId]);

  // Grouped sessions calculation
  const groupedSessions = useMemo(() => {
    const chronological = [...sessions].reverse();
    const result: any[] = [];
    let activeGroups: Record<string, any> = {};

    chronological.forEach((s) => {
      if (s.type === "canto" || s.type === "simulacro") {
        result.push({
          ...s,
          originalIds: [s.id],
          subSessions: [s],
          isGroup: false,
          groupDates: [s.date],
          groupNotes: s.notes ? [s.notes] : [],
        });
        return;
      }

      let currentGroup = activeGroups[s.type];
      if (!currentGroup) {
        currentGroup = {
          ...s,
          originalIds: [s.id],
          subSessions: [s],
          isGroup: false,
          groupDates: [s.date],
          groupNotes: s.notes ? [s.notes] : [],
          difficultySum: s.difficulty || 0,
          difficultyCount: s.difficulty ? 1 : 0,
        };
        activeGroups[s.type] = currentGroup;
      } else {
        currentGroup.duration += s.duration || 0;
        if (s.difficulty) {
          currentGroup.difficultySum += s.difficulty;
          currentGroup.difficultyCount += 1;
        }
        currentGroup.originalIds.push(s.id);
        currentGroup.subSessions.push(s);
        if (!currentGroup.groupDates.includes(s.date)) {
          currentGroup.groupDates.push(s.date);
        }
        if (s.notes) currentGroup.groupNotes.push(s.notes);
        currentGroup.completesVuelta = s.completesVuelta;
        currentGroup.isGroup = true;
        currentGroup.date = s.date;
        currentGroup.id = s.id;
        currentGroup.createdAt = s.createdAt;
      }

      if (s.completesVuelta !== false) {
        if (currentGroup.difficultyCount > 0) {
          currentGroup.difficulty = Math.round(currentGroup.difficultySum / currentGroup.difficultyCount);
        }
        currentGroup.notes = currentGroup.groupNotes.join(" | ");
        result.push(currentGroup);
        activeGroups[s.type] = null;
      }
    });

    Object.values(activeGroups).forEach((group) => {
      if (group) {
        if (group.difficultyCount > 0) {
          group.difficulty = Math.round(group.difficultySum / group.difficultyCount);
        }
        group.notes = group.groupNotes.join(" | ");
        result.push(group);
      }
    });

    result.sort((a, b) => {
      const dateCmp = (a.date || "").localeCompare(b.date || "");
      if (dateCmp !== 0) return dateCmp;
      const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt || 0);
      const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt || 0);
      return timeA - timeB;
    });

    return result.reverse();
  }, [sessions]);

  // Ebbinghaus analysis
  const ebbinghausAnalysis = useMemo(() => {
    return calculateCanonicalRetention(canonicalTopic);
  }, [canonicalTopic]);

  // Cante best calculation
  const bestCanto = useMemo(() => {
    return sessions
      .filter((s) => (s.type === "canto" || s.type === "simulacro") && typeof s.cantoGrade === "number")
      .sort((a, b) => (b.cantoGrade || 0) - (a.cantoGrade || 0))[0] || null;
  }, [sessions]);

  // Add study session handler
  const handleAddSession = async () => {
    const h = parseInt(logDurationHours, 10) || 0;
    const m = parseInt(logDurationMinutes, 10) || 0;
    const s = parseInt(logDurationSeconds, 10) || 0;
    const totalMinutes = h * 60 + m;

    if (totalMinutes === 0 && s === 0) {
      toast.error("Introduce la duración de la sesión");
      return;
    }

    try {
      setIsSavingSession(true);
      await addStudySession(
        topicId,
        totalMinutes,
        typeof logDifficulty === "number" ? logDifficulty : (Number(progress?.difficulty) || 5),
        logType as any,
        logDate || getLocalDateString(),
        {
          cantoGrade: (logType === "canto" || logType === "simulacro") && typeof logCantoGrade === "number" ? logCantoGrade : undefined,
          notes: (logNotes || "").trim(),
          completesVuelta: logCompletesVuelta,
          cantoSeconds: (logType === "canto" || logType === "simulacro") ? s : undefined,
          mistakes: (logType === "canto" || logType === "simulacro") && logMistakes ? logMistakes.trim() : undefined,
        }
      );

      setLogDurationHours("");
      setLogDurationMinutes("");
      setLogDurationSeconds("");
      setLogDifficulty("");
      setLogCantoGrade("");
      setLogNotes("");
      setLogMistakes("");
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (e: any) {
      console.error("Error al registrar sesión:", e);
      toast.error("Error al guardar: " + (e?.message || e));
    } finally {
      setIsSavingSession(false);
    }
  };

  // Delete session handler
  const handleDeleteSession = async (ids: string[]) => {
    try {
      const cleanIds = (Array.isArray(ids) ? ids : [ids])
        .map((id) => String(id).replace(/^group-[^-]+-/, "").trim())
        .filter(Boolean);

      if (cleanIds.length === 0) {
        setSessionToDelete(null);
        return;
      }

      setSessions((prev) =>
        prev.filter((s) => {
          const sCleanId = String(s.id).replace(/^group-[^-]+-/, "").trim();
          return !cleanIds.includes(s.id) && !cleanIds.includes(sCleanId);
        })
      );
      setSessionToDelete(null);

      for (const id of cleanIds) {
        await deleteStudySession(topicId, id);
      }
    } catch (e: any) {
      toast.error("Error al eliminar la sesión: " + e.message);
    }
  };

  // La fecha de revisión se deriva del historial confirmado después de guardar.
  const previewNextDate = null;

  return {
    user,
    activeTab,
    setActiveTab,
    pages,
    setPages,
    difficulty,
    setDifficulty,
    customTitle,
    setCustomTitle,
    numeroPalabras,
    setNumeroPalabras,
    notas,
    setNotas,
    logType,
    setLogType,
    logDurationHours,
    setLogDurationHours,
    logDurationMinutes,
    setLogDurationMinutes,
    logDurationSeconds,
    setLogDurationSeconds,
    logDifficulty,
    setLogDifficulty,
    logCompletesVuelta,
    setLogCompletesVuelta,
    logDate,
    setLogDate,
    logNotes,
    setLogNotes,
    logMistakes,
    setLogMistakes,
    logCantoGrade,
    setLogCantoGrade,
    logCantoType,
    setLogCantoType,
    isSavingSession,
    saveSuccess,
    sessionToDelete,
    setSessionToDelete,
    isConfirmingDeleteTopic,
    setIsConfirmingDeleteTopic,
    sessions,
    groupedSessions,
    ebbinghausAnalysis,
    bestCanto,
    previewNextDate,
    handleAddSession,
    handleDeleteSession,
    updateTopicProgress,
  };
}
