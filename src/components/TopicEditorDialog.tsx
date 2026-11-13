import React, { useState, useEffect, useMemo, useId, useRef } from "react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Topic } from "../types";
import { useFirebase } from "../lib/FirebaseProvider";
import { safeParseDate, getLocalDateString } from "../lib/utils";
import { calculateTopicCycle } from "../lib/oposicionCycle";
import { calculateCanonicalRetention } from "../lib/ebbinghaus";
import { buildObservedSession } from "../lib/observedSession";
import {
  isCantoSession,
  getCantoDuration,
  compareSessionsDesc,
  compareSessionsAsc,
} from "../lib/cantoUtils";

// Atomic Subcomponents
import { TopicEditorHeader } from "./topic-editor/TopicEditorHeader";
import { TopicParametersCard } from "./topic-editor/TopicParametersCard";
import { TopicLogSessionCard } from "./topic-editor/TopicLogSessionCard";
import { TopicVitalsGrid } from "./topic-editor/TopicVitalsGrid";
import { TopicEbbinghausCard } from "./topic-editor/TopicEbbinghausCard";
import { TopicDifficultyCard } from "./topic-editor/TopicDifficultyCard";
import { TopicCantoRadarCard } from "./topic-editor/TopicCantoRadarCard";
import { TopicHistoryCard } from "./topic-editor/TopicHistoryCard";
import { EditSessionDialog } from "./EditSessionDialog";
import { useDialogAccessibility } from "../hooks/useDialogAccessibility";
import { DS } from "../lib/designSystem";

export function TopicEditorDialog({
  topic,
  onClose,
}: {
  topic: Topic;
  onClose: () => void;
}) {
  const {
    userProgress,
    topicState,
    updateTopicProgress,
    addStudySession,
    estimateDuration,
    estimateRetentionForTopic,
    deleteStudySession,
    quickUpdateSessionDifficulty,
    mergeStudySessions,
    user,
    recentSessions = []
  } = useFirebase();
  const topicId = topic.id;
  const progress = userProgress[topicId];
  const canonicalTopic = topicState.get(topicId);
  const initialCoverage = canonicalTopic?.initialStudyCoverage;

  const [sessionToEdit, setSessionToEdit] = useState<any | null>(null);

  const initialDifficulty = canonicalTopic?.hasExplicitDifficulty ? canonicalTopic.difficulty : "";

  const [numeroPalabras, setNumeroPalabras] = useState((canonicalTopic?.numeroPalabras ?? "").toString());
  const [pages, setPages] = useState(canonicalTopic?.hasExplicitPages ? String(canonicalTopic.pages) : "");
  const [difficulty, setDifficulty] = useState<number | "">(initialDifficulty);
  const [customTitle, setCustomTitle] = useState(canonicalTopic?.title ?? topic.title);

  useEffect(() => setPages(canonicalTopic?.hasExplicitPages ? String(canonicalTopic.pages) : ""), [topicId, canonicalTopic?.pages, canonicalTopic?.hasExplicitPages]);
  useEffect(() => setNumeroPalabras(canonicalTopic?.numeroPalabras === undefined ? "" : String(canonicalTopic.numeroPalabras)), [topicId, canonicalTopic?.numeroPalabras]);
  useEffect(() => setDifficulty(canonicalTopic?.hasExplicitDifficulty ? canonicalTopic.difficulty : ""), [topicId, canonicalTopic?.difficulty, canonicalTopic?.hasExplicitDifficulty]);
  useEffect(() => setCustomTitle(canonicalTopic?.title ?? topic.title), [topicId, canonicalTopic?.title]);

  const [sessions, setSessions] = useState<any[]>([]);
  const [logDate, setLogDate] = useState(getLocalDateString());
  const [logType, setLogType] = useState<"estudio_inicial" | "repaso" | "refresco" | "canto" | "simulacro">("repaso");

  const topicCycle = useMemo(() => {
    return calculateTopicCycle(topicId, progress, sessions as any, canonicalTopic);
  }, [topicId, progress, sessions, canonicalTopic]);

  const suggestedType = useMemo(() => {
    if (topicCycle.phase === "sin_iniciar") return "estudio_inicial";
    if (topicCycle.phase === "en_refrescos") return "refresco";
    if (topicCycle.phase === "listo_para_cantar") return "canto";
    return "repaso";
  }, [topicCycle.phase]);

  const [hasManuallyChangedType, setHasManuallyChangedType] = useState(false);
  useEffect(() => {
    if (!hasManuallyChangedType) {
      setLogType(suggestedType);
      setLogCompletesVuelta(false);
    }
  }, [suggestedType, hasManuallyChangedType]);

  const [logDurationHours, setLogDurationHours] = useState("");
  const [logDurationMinutes, setLogDurationMinutes] = useState("");
  const [logDurationSeconds, setLogDurationSeconds] = useState("");
  const [logDifficulty, setLogDifficulty] = useState<number | "">("");
  const [logCantoGrade, setLogCantoGrade] = useState<number | "">("");
  const [logMistakes, setLogMistakes] = useState("");
  const [logNotes, setLogNotes] = useState("");
  const [logStartPage, setLogStartPage] = useState("");
  const [logEndPage, setLogEndPage] = useState("");
  const [logRecallOutcome, setLogRecallOutcome] = useState<"" | "success" | "failure">("");
  const [logRecallCoverage, setLogRecallCoverage] = useState<"whole_topic" | "partial">("partial");
  const [predictionRevision, setPredictionRevision] = useState(0);
  const predictionSnapshot = useMemo(() => canonicalTopic ? estimateDuration(topicId, logType === "estudio_inicial" ? "estudio_nuevo" : logType === "canto" || logType === "simulacro" ? "cante" : logType) : undefined, [topicId, logType, predictionRevision]);
  const retentionPrediction = useMemo(() => canonicalTopic ? estimateRetentionForTopic(topicId) : undefined, [topicId, logType, predictionRevision]);
  const [logCompletesVuelta, setLogCompletesVuelta] = useState(false);
  const [cantoTimeRange, setCantoTimeRange] = useState<"all" | "10" | "5">("all");

  // La próxima fecha se deriva del historial guardado, después de registrar la sesión.
  const futureNextReviewDate = null;

  const [isSavingSession, setIsSavingSession] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const dialogId = useId();
  const dialogRef = useDialogAccessibility<HTMLDivElement>({ isOpen: !!user && !!canonicalTopic, onClose, disabled: isSavingSession });
  const logSectionRef = useRef<HTMLElement>(null);

  // Synchronize and deduplicate sessions for this specific topic
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
    const dedupedSessions: any[] = [];
    const seenSessionKeys = new Set<string>();
    for (const s of processed) {
      // Different document IDs can be legitimate sessions with identical measured values.
      const key = s.id;
      if (!seenSessionKeys.has(key)) {
        seenSessionKeys.add(key);
        dedupedSessions.push(s);
      }
    }
    setSessions(dedupedSessions);
  }, [topicId, canonicalTopic?.sessions]);

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
          id: `group-${s.type}-${s.id}`,
          originalIds: [s.id],
          type: s.type,
          date: s.date,
          duration: s.duration,
          difficulty: s.difficulty,
          completesVuelta: s.completesVuelta,
          subSessions: [s],
          isGroup: true,
          groupDates: [s.date],
        };
        activeGroups[s.type] = currentGroup;
        result.push(currentGroup);
      } else {
        currentGroup.duration += s.duration;
        currentGroup.originalIds.push(s.id);
        currentGroup.subSessions.push(s);
        currentGroup.groupDates.push(s.date);
        currentGroup.date = s.date;
      }

      if (s.completesVuelta) {
        delete activeGroups[s.type];
      }
    });

    return result.reverse();
  }, [sessions]);

  // Retención e historial comparten la misma ficha canónica persistida.
  const ebbinghausAnalysis = useMemo(() => {
    return calculateCanonicalRetention(canonicalTopic);
  }, [canonicalTopic]);

  // Subjective difficulty chart data
  const diffChartData = useMemo(() => {
    return groupedSessions
      .filter((s) => s.type === "estudio_inicial" || s.type === "repaso" || s.type === "refresco")
      .map((s) => ({
        date: s.date.slice(5),
        dificultad: s.difficulty || 0,
        index: s.date.slice(5),
      }))
      .reverse();
  }, [groupedSessions]);

  // Cantos telemetry for this topic
  const topicCantosAll = useMemo(() => {
    return sessions.filter(isCantoSession).slice().sort(compareSessionsAsc);
  }, [sessions]);

  const topicCantosStats = useMemo(() => {
    const total = topicCantosAll.length;
    if (total === 0) {
      return {
        total: 0,
        notaMedia: 0,
        notaMediaStr: "—",
        mejorNota: null as number | null,
        tiempoMedioTotalMin: 0,
        tiempoMedioMin: 0,
        tiempoMedioSec: 0,
        tiempoMedioStr: "—",
        porcentajeEnVentana: 0,
        aprobadosPorcentaje: 0,
        tendenciaNota: 0,
        diasUltimoCanto: null as number | null,
        diagnostico: "Sin Cantos",
        consejo: "Aún no has expuesto este tema ante el tribunal. Registra tu primer cante.",
        badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
      };
    }

    const conNota = topicCantosAll.filter(
      (c) => typeof c.cantoGrade === "number" && (c.cantoGrade as number) >= 0
    );
    const notaMedia =
      conNota.length > 0
        ? conNota.reduce((acc, c) => acc + (c.cantoGrade as number), 0) / conNota.length
        : 0;

    const notas = conNota.map((c) => c.cantoGrade as number);
    const mejorNota = notas.length > 0 ? Math.max(...notas) : null;

    const duracionesSec = topicCantosAll.map((c) => getCantoDuration(c).totalSecs);
    const duracionesMin = duracionesSec.map((s) => s / 60);
    const duracionMediaTotal =
      duracionesMin.length > 0 ? duracionesMin.reduce((a, b) => a + b, 0) / duracionesMin.length : 0;
    const duracionMediaSecs = Math.round(duracionMediaTotal * 60);
    const tiempoMedioMin = Math.floor(duracionMediaTotal);
    const tiempoMedioSec = Math.round((duracionMediaTotal % 1) * 60);
    const tiempoMedioStr = `${tiempoMedioMin}m ${tiempoMedioSec > 0 ? `${tiempoMedioSec}s` : ""}`.trim();

    const enVentana = duracionesSec.filter((s) => s >= 660 && s <= 820).length;
    const porcentajeEnVentana = total > 0 ? Math.round((enVentana / total) * 100) : 0;

    const aprobados = conNota.filter((c) => {
      const durSecs = getCantoDuration(c).totalSecs;
      return (c.cantoGrade as number) >= 5 && durSecs >= 660 && durSecs <= 820;
    }).length;
    const aprobadosPorcentaje = conNota.length > 0 ? Math.round((aprobados / conNota.length) * 100) : 0;

    let tendenciaNota = 0;
    if (conNota.length >= 2) {
      const ultimo = conNota[conNota.length - 1].cantoGrade as number;
      const penultimo = conNota[conNota.length - 2].cantoGrade as number;
      tendenciaNota = Math.round((ultimo - penultimo) * 10) / 10;
    }

    const ultimoCanto = topicCantosAll[topicCantosAll.length - 1];
    let diasUltimoCanto: number | null = null;
    if (ultimoCanto?.date) {
      const lastDate = safeParseDate(ultimoCanto.date);
      const today = new Date();
      diasUltimoCanto = Math.max(0, Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 3600 * 24)));
    }

    let diagnostico = "En Evaluación";
    let consejo = "Mantén la regularidad y revisa las observaciones del tribunal.";
    let badgeClass = "bg-slate-100 text-slate-700 border-slate-200";

    const ultimoConNota = conNota[conNota.length - 1];
    const ultimaNota = ultimoConNota ? (ultimoConNota.cantoGrade as number) : null;
    const ultimasSecs = ultimoCanto ? getCantoDuration(ultimoCanto).totalSecs : 0;

    if (ultimaNota !== null && ultimaNota >= 8 && duracionMediaSecs >= 660 && duracionMediaSecs <= 820) {
      diagnostico = "Consolidado";
      consejo = "Excelente solvencia jurídica y cronómetro en ventana oficial (11:00–13:40 min).";
      badgeClass = "bg-emerald-50 text-emerald-800 border-emerald-200";
    } else if (duracionMediaSecs > 820) {
      diagnostico = "Exceso de Tiempo";
      consejo = "Media superior a 13:40 min (suspenso reglamentario). Sintetiza epígrafes.";
      badgeClass = "bg-rose-50 text-rose-800 border-rose-200";
    } else if (duracionMediaSecs > 0 && duracionMediaSecs < 660) {
      diagnostico = "Exposición Breve";
      consejo = "Media por debajo de 11 min. Amplía articulado y fundamentación.";
      badgeClass = "bg-amber-50 text-amber-800 border-amber-200";
    } else if (ultimaNota !== null && ultimaNota >= 5 && ultimasSecs >= 660 && ultimasSecs <= 820) {
      diagnostico = "Aprobado";
      consejo = "Tema superado en tiempo oficial. Afianza artículos para llegar al 8+.";
      badgeClass = "bg-indigo-50 text-indigo-800 border-indigo-200";
    }

    return {
      diagnostico,
      consejo,
      badgeClass,
      diasUltimoCanto,
      notaMedia,
      notaMediaStr: conNota.length > 0 ? notaMedia.toFixed(1) : "—",
      tendenciaNota,
      mejorNota,
      tiempoMedioStr,
      porcentajeEnVentana,
      aprobadosPorcentaje,
    };
  }, [topicCantosAll]);

  const topicCantosChartData = useMemo(() => {
    const rawList =
      cantoTimeRange === "5"
        ? topicCantosAll.slice(-5)
        : cantoTimeRange === "10"
        ? topicCantosAll.slice(-10)
        : topicCantosAll;

    return rawList.map((s) => {
      const origIndex = topicCantosAll.indexOf(s);
      const durSec = (s.duration || 0) * 60 + (s.cantoSeconds || 0);
      const durMin = durSec / 60;
      const isOptimal = durSec >= 660 && durSec <= 820;
      const isExcess = durSec > 820;
      const isBrief = durSec > 0 && durSec < 660;

      let barColor = "#6366f1";
      if (isOptimal) barColor = "#10b981";
      else if (isExcess) barColor = "#f43f5e";
      else if (isBrief) barColor = "#f59e0b";

      return {
        id: s.id,
        cantoNum: origIndex + 1,
        displayX: `#${origIndex + 1} (${s.date ? s.date.slice(5) : ""})`,
        fecha: s.date || "",
        duracion: Math.round(durMin * 10) / 10,
        duracionStr: `${s.duration || 0}m${s.cantoSeconds ? ` ${s.cantoSeconds}s` : ""}`,
        nota: typeof s.cantoGrade === "number" ? s.cantoGrade : null,
        isOptimal,
        isExcess,
        isBrief,
        barColor,
        mistakes: s.mistakes,
        notes: s.notes,
      };
    });
  }, [topicCantosAll, cantoTimeRange]);

  const totalRepasos = groupedSessions.filter((s) => s.type === "refresco" || s.type === "repaso").length;
  const totalCantos = groupedSessions.filter((s) => s.type === "canto" || s.type === "simulacro").length;
  const totalTimeMinutes = sessions.reduce((acc, s) => acc + (s.duration || 0), 0);
  const totalTimeStr =
    totalTimeMinutes > 60
      ? `${Math.floor(totalTimeMinutes / 60)}h ${totalTimeMinutes % 60}m`
      : `${totalTimeMinutes}m`;

  const bestCanto = groupedSessions
    .filter((s) => s.type === "canto" || s.type === "simulacro")
    .sort((a, b) => (b.cantoGrade || 0) - (a.cantoGrade || 0))[0];
  const bestCantoStr = bestCanto && bestCanto.cantoGrade ? `${bestCanto.cantoGrade}/10` : "-";

  const daysUntilReview = useMemo(() => {
    if (!progress?.nextReviewDate) return 999;
    const diff = safeParseDate(progress.nextReviewDate).getTime() - new Date().getTime();
    return Math.ceil(diff / (1000 * 3600 * 24));
  }, [progress?.nextReviewDate]);

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
      const form = {
        minutes: String(totalMinutes), difficulty: String(typeof logDifficulty === "number" ? logDifficulty : canonicalTopic?.difficulty ?? 5),
        date: logDate || getLocalDateString(), notes: logNotes || "", completesVuelta: logCompletesVuelta,
        cantoGrade: logCantoGrade === "" ? "" : String(logCantoGrade), cantoSeconds: String(s),
        startPage: logType !== "canto" && logType !== "simulacro" ? logStartPage : "",
        endPage: logType !== "canto" && logType !== "simulacro" ? logEndPage : "",
        recallOutcome: logRecallOutcome, recallCoverage: logRecallCoverage,
      };
      const session = buildObservedSession({
        topicId, title: canonicalTopic?.title ?? topic.title,
        type: logType === "simulacro" ? "canto" : logType,
        predictionSnapshot,
        retentionPrediction,
        metadata: {
          totalPages: predictionSnapshot?.inputs?.totalPages as number | undefined,
          totalWords: predictionSnapshot?.inputs?.totalWords as number | undefined,
        },
      }, form);
      if (logType === "simulacro") session.type = "simulacro";
      if ((logType === "canto" || logType === "simulacro") && logMistakes.trim()) session.mistakes = logMistakes.trim();
      await addStudySession(session as any);
      setLogRecallOutcome(""); setLogRecallCoverage("partial");
      setPredictionRevision(value => value + 1);

      setLogStartPage("");
      setLogEndPage("");
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

  const handleDeleteSession = async (ids: string[]) => {
    try {
      const cleanIds = (Array.isArray(ids) ? ids : [ids])
        .map((id) => String(id).replace(/^group-[^-]+-/, "").trim())
        .filter(Boolean);

      if (cleanIds.length === 0) {
        setSessionToDelete(null);
        return;
      }

      // 1. Desalojo optimista instantáneo en el estado local de la ficha del tema
      setSessions((prev) =>
        prev.filter((s) => {
          const sCleanId = String(s.id).replace(/^group-[a-zA-Z0-9_]+-/, "").trim();
          const hasOriginalMatch = Array.isArray(s.originalIds) && s.originalIds.some((origId: string) => cleanIds.includes(origId));
          return !cleanIds.includes(s.id) && !cleanIds.includes(sCleanId) && !hasOriginalMatch;
        })
      );
      setSessionToDelete(null);

      // 2. Borrado definitivo en base de datos y recálculo
      for (const id of cleanIds) {
        await deleteStudySession(topicId, id);
      }
    } catch (e: any) {
      console.error("Error al eliminar sesión:", e);
      toast.error("Error eliminando sesión: " + (e?.message || e));
    }
  };

  if (!user || !canonicalTopic) return null;

  return (
    <div 
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSavingSession) onClose();
      }}
      className="wp-modal-overlay fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 sm:p-4 md:p-6"
    >
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${dialogId}-title`}
        initial={{ scale: 0.97, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.97, opacity: 0, y: 10 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="wp-modal-panel bg-[var(--wp-surface-muted)] w-full max-w-[92rem] h-[100dvh] sm:h-full sm:max-h-[96dvh] rounded-none sm:rounded-3xl flex flex-col shadow-xl overflow-hidden border border-slate-200/90 relative [&_header_button]:min-h-11 [&_header_button]:min-w-11"
      >
        <span id={`${dialogId}-title`} className="sr-only">Ficha del tema {topic.number}: {customTitle || topic.title}</span>
        {/* Sticky Editorial Header */}
        <TopicEditorHeader
          topic={topic}
          progress={progress}
          customTitle={customTitle}
          topicCycle={topicCycle}
          daysUntilReview={daysUntilReview}
          nextReviewDate={progress?.nextReviewDate || null}
          onClose={onClose}
          disabled={isSavingSession}
        />

        {/* Scrollable Layout Body */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-6 md:p-8 relative">
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 sm:gap-6 max-w-[90rem] mx-auto">
            {/* LEFT COLUMN: Topic Settings & Log Form (Span 4) */}
            <div className="col-span-1 xl:col-span-4 flex flex-col gap-4 sm:gap-6">
              <TopicParametersCard
                topic={topic}
                customTitle={customTitle}
                officialTitle={canonicalTopic.officialTitle}
                setCustomTitle={setCustomTitle}
                pages={pages}
                setPages={setPages}
                numeroPalabras={numeroPalabras}
                setNumeroPalabras={setNumeroPalabras}
                difficulty={difficulty}
                setDifficulty={setDifficulty}
                initialEpigrafes={canonicalTopic.epigrafes === undefined ? "" : String(canonicalTopic.epigrafes)}
                updateTopicProgress={updateTopicProgress}
              />

              <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-700" role="status" data-testid="initial-study-coverage">
                <p className="font-bold">
                  {initialCoverage?.studiedPages !== null && initialCoverage?.studiedPages !== undefined && initialCoverage.remainingPages !== null
                    ? `Estudio inicial: ${initialCoverage.studiedPages} de ${canonicalTopic.pages} páginas · ${initialCoverage.remainingPages} pendientes`
                    : "Estudio inicial: cobertura pendiente de medir"}
                </p>
                {initialCoverage?.pageNumbers.length ? <p className="mt-1">Páginas identificadas: {initialCoverage.pageNumbers.join(", ")}</p> : null}
                {initialCoverage?.unlocatedStudy && <p className="mt-1">Hay estudio histórico sin páginas identificadas. Los nuevos rangos no reconstruyen esa parte del historial.</p>}
                {initialCoverage?.issues.length ? <p className="mt-1">{initialCoverage.issues.join(" · ")}</p> : null}
              </div>

              {logType !== "canto" && logType !== "simulacro" && <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-700">
                <p className="font-bold">Páginas trabajadas en esta sesión</p>
                <p className="mt-1">Opcional. Identifica el rango realizado; el estudio inicial y los repasos se contabilizan por separado.</p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <label>Página inicial<input aria-label="Página inicial de la sesión" type="number" min="1" step="1" value={logStartPage} onChange={e => setLogStartPage(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2" /></label>
                  <label>Página final<input aria-label="Página final de la sesión" type="number" min="1" step="1" value={logEndPage} onChange={e => setLogEndPage(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2" /></label>
                </div>
              </div>}

              <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-700">
                <p className="font-bold">Comprobación de memoria sin apuntes (opcional)</p>
                <p className="mt-1">Completa estos campos solo si has intentado recordar el contenido sin consultar material. La nota del cante se guarda por separado.</p>
                <label className="mt-3 block">Resultado<select aria-label="Resultado de recuerdo sin apuntes" value={logRecallOutcome} onChange={e => setLogRecallOutcome(e.target.value as "" | "success" | "failure")} className="mt-1 w-full rounded-lg border border-slate-300 p-2">
                  <option value="">Sin evaluación de recuerdo</option><option value="success">He recordado el contenido evaluado</option><option value="failure">No he recordado el contenido evaluado</option>
                </select></label>
                {logRecallOutcome && <label className="mt-3 block">Contenido evaluado<select aria-label="Alcance del recuerdo evaluado" value={logRecallCoverage} onChange={e => setLogRecallCoverage(e.target.value as "whole_topic" | "partial")} className="mt-1 w-full rounded-lg border border-slate-300 p-2">
                  <option value="partial">Una parte del tema</option><option value="whole_topic">El tema completo</option>
                </select></label>}
              </div>

              <section ref={logSectionRef} aria-label="Registro de una sesión real">
              <TopicLogSessionCard
                topicCycle={topicCycle}
                logType={logType}
                setLogType={(t) => {
                  setLogType(t);
                  setHasManuallyChangedType(true);
                }}
                logDate={logDate}
                setLogDate={setLogDate}
                logDurationHours={logDurationHours}
                setLogDurationHours={setLogDurationHours}
                logDurationMinutes={logDurationMinutes}
                setLogDurationMinutes={setLogDurationMinutes}
                logDurationSeconds={logDurationSeconds}
                setLogDurationSeconds={setLogDurationSeconds}
                logDifficulty={logDifficulty}
                setLogDifficulty={setLogDifficulty}
                logCompletesVuelta={logCompletesVuelta}
                setLogCompletesVuelta={setLogCompletesVuelta}
                logNotes={logNotes}
                setLogNotes={setLogNotes}
                logMistakes={logMistakes}
                setLogMistakes={setLogMistakes}
                logCantoGrade={logCantoGrade}
                setLogCantoGrade={setLogCantoGrade}
                futureNextReviewDate={futureNextReviewDate}
                isSavingSession={isSavingSession}
                saveSuccess={saveSuccess}
                onAddSession={handleAddSession}
              />
              </section>
            </div>

            {/* RIGHT COLUMN: KPIs, Ebbinghaus, Charts, History (Span 8) */}
            <div className="col-span-1 xl:col-span-8 flex flex-col gap-4 sm:gap-6">
              <TopicVitalsGrid
                totalTimeStr={totalTimeStr}
                totalRepasos={totalRepasos}
                totalCantos={totalCantos}
                bestCantoStr={bestCantoStr}
                ebbinghausAnalysis={ebbinghausAnalysis}
              />

              <TopicEbbinghausCard ebbinghausAnalysis={ebbinghausAnalysis} />

              <TopicDifficultyCard diffChartData={diffChartData} />

              <TopicCantoRadarCard
                topicCantosAll={topicCantosAll}
                topicCantosStats={topicCantosStats}
                topicCantosChartData={topicCantosChartData}
                cantoTimeRange={cantoTimeRange}
                setCantoTimeRange={setCantoTimeRange}
                onSelectCantoMode={() => {
                  setLogType("canto");
                  setHasManuallyChangedType(true);
                  toast.info("Formulario ajustado para registrar Canto");
                }}
              />

              <TopicHistoryCard
                sessionsCount={sessions.length}
                groupedSessions={groupedSessions}
                sessionToDelete={sessionToDelete}
                setSessionToDelete={setSessionToDelete}
                onDeleteSession={handleDeleteSession}
                onEditSession={(s) => setSessionToEdit(s)}
                onQuickRateDifficulty={quickUpdateSessionDifficulty}
                onMergeSessions={mergeStudySessions}
              />
            </div>
          </div>
        </div>
        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-200 bg-white px-3 py-2 sm:px-6" style={{ paddingBottom: 'max(.5rem, env(safe-area-inset-bottom))' }}>
          <button type="button" onClick={onClose} disabled={isSavingSession} className={DS.btnSecondary}>Cerrar ficha</button>
          <button type="button" onClick={() => logSectionRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })} className={DS.btnPrimary}>Ir al registro de sesión</button>
        </footer>
      </motion.div>

      {/* MODAL DE PERSONALIZACIÓN DE SESIÓN */}
      {sessionToEdit && (
        <EditSessionDialog
          session={sessionToEdit}
          onClose={() => setSessionToEdit(null)}
          onSessionUpdated={() => {
            setSessionToEdit(null);
            toast.success("Sesión actualizada correctamente.");
          }}
        />
      )}
    </div>
  );
}
