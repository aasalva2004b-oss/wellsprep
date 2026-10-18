import { useState, useEffect, useMemo } from "react";
import { initialTopics } from "../data/initialData";
import { toast } from "sonner";
import { BrainCircuit, LineChart, TrendingUp, BarChart2, Activity, FileText, Sparkles, Loader2, Check, PlusCircle, Clock, BookOpen, Mic, Target, AlertTriangle, X, History, Trash2, Layers, CalendarDays, Key, ListTree, Scale, Gavel, ChevronDown, ChevronUp, List, User, Star, Plus, Timer, Sliders, Award, Flame, CheckCircle2, AlertCircle, ShieldCheck, Zap, Info, RefreshCw, Save } from "lucide-react";
import { Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ComposedChart, ReferenceLine, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Cell } from "recharts";
import { motion, AnimatePresence } from "motion/react";
import { cn , safeParseDate, getLocalDateString } from "../lib/utils";
import { useFirebase } from "../lib/FirebaseProvider";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { Topic } from "../types";
import { calculateNextReviewDate } from "../lib/prediction";
import { useWellsProgressFactor } from "../hooks/useWellsProgressFactor";
import { calculateNextSRSState } from "../lib/srs";
import { calculateTopicCycle } from "../lib/oposicionCycle";
import { calculateEbbinghausCurve, EbbinghausAnalysis, formatTimeMins } from "../lib/ebbinghaus";
import { isCantoSession, getCantoDuration, sessionMatchesTopic, compareSessionsDesc, compareSessionsAsc } from "../lib/cantoUtils";

export function TopicEditorDialog({
  topic,
  onClose,
}: {
  topic: Topic;
  onClose: () => void;
}) {
  const { userProgress, updateTopicProgress, addStudySession, deleteStudySession, user, recentSessions = [] } =
    useFirebase();
  const topicId = topic.id;
  const progress = userProgress[topicId];

  if (!user) return null;

  let initialDifficulty =
    progress?.difficulty || (topic.difficulty ? topic.difficulty * 2 : 5);

  const [numeroPalabras, setNumeroPalabras] = useState((progress?.numeroPalabras || topic.numeroPalabras || "").toString());
  const [epigrafes, setEpigrafes] = useState((progress?.epigrafes || topic.epigrafes || "").toString());
  const [pages, setPages] = useState(
    (progress?.pages || topic.pages).toString(),
  );
  const [difficulty, setDifficulty] = useState<number>(initialDifficulty);

  const [notas, setNotas] = useState("");
  const [customTitle, setCustomTitle] = useState(
    progress?.customTitle || topic.title,
  );

  const [sessions, setSessions] = useState<{ id: string; topicId?: string; date: string; type: string; duration: number; durationMinutes?: number; difficulty?: number; notes?: string; cantoGrade?: number; createdAt?: any; completesVuelta?: boolean; cantoSeconds?: number; mistakes?: string; }[]>([]);
  
  const [logDate, setLogDate] = useState(
    getLocalDateString(),
  );
  const [logType, setLogType] = useState<
    "estudio_inicial" | "repaso" | "refresco" | "canto" | "simulacro"
  >("repaso");

  const topicCycle = useMemo(() => {
    return calculateTopicCycle(topicId, progress, sessions as any);
  }, [topicId, progress, sessions]);

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
      if (suggestedType === "refresco" || suggestedType === "estudio_inicial") {
        setLogCompletesVuelta(false);
      } else {
        setLogCompletesVuelta(true);
      }
    }
  }, [suggestedType, hasManuallyChangedType]);

  const [logDurationHours, setLogDurationHours] = useState("");
  const [logDurationMinutes, setLogDurationMinutes] = useState("");
  const [logDurationSeconds, setLogDurationSeconds] = useState("");
  const [logDifficulty, setLogDifficulty] = useState<number | "">("");
  const [logCantoGrade, setLogCantoGrade] = useState<number | "">("");
  const [logCantoType, setLogCantoType] = useState<"solo" | "preparador">("solo");
  const [logMistakes, setLogMistakes] = useState("");
  const [logNotes, setLogNotes] = useState("");
  const [logCompletesVuelta, setLogCompletesVuelta] = useState(true);
  const [cantoTimeRange, setCantoTimeRange] = useState<"all" | "10" | "5">("all");

  const futureNextReviewDate = useMemo(() => {
    if (logType === "estudio_inicial" || logType === "repaso") {
       const v = (progress?.vueltas || 0) + 1;
       const d = logDifficulty !== "" ? (logDifficulty as number) : (progress?.difficulty || difficulty || 3);
       return calculateNextReviewDate(logDate, v, d);
    }
    return null;
  }, [logType, logDifficulty, logDate, progress, difficulty]);

  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [isSavingSession, setIsSavingSession] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);
  const [isConfirmingDeleteTopic, setIsConfirmingDeleteTopic] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const groupedSessions = useMemo(() => {
    const uniqueSessions: typeof sessions = [];
    const seenIds = new Set<string>();

    [...sessions].forEach(s => {
      if (!seenIds.has(s.id)) {
        // Only skip exact duplicate submissions created within 3 seconds
        const timeS = s.createdAt && typeof s.createdAt.toMillis === 'function' ? s.createdAt.toMillis() : (typeof s.createdAt === 'number' ? s.createdAt : 0);
        const isDoubleSubmit = uniqueSessions.some(existing => {
          const timeE = existing.createdAt && typeof existing.createdAt.toMillis === 'function' ? existing.createdAt.toMillis() : (typeof existing.createdAt === 'number' ? existing.createdAt : 0);
          return existing.type === s.type &&
            existing.date === s.date &&
            existing.duration === s.duration &&
            (existing.cantoGrade || 0) === (s.cantoGrade || 0) &&
            timeS > 0 && timeE > 0 &&
            Math.abs(timeS - timeE) < 3000;
        });

        if (!isDoubleSubmit) {
          seenIds.add(s.id);
          uniqueSessions.push(s);
        }
      }
    });

    const chronological = [...uniqueSessions].reverse();
    const result: any[] = [];
    
    let activeGroups: Record<string, any> = {};

    chronological.forEach((s) => {
      // Cantos and simulacros are discrete oral evaluations - NEVER merge or group them!
      if (s.type === 'canto' || s.type === 'simulacro') {
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
          difficultyCount: s.difficulty ? 1 : 0
        };
        activeGroups[s.type] = currentGroup;
      } else {
        currentGroup.duration += (s.duration || 0);
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
        
        const timeA = a.createdAt && typeof a.createdAt.toMillis === 'function' ? a.createdAt.toMillis() : (a.createdAt || 0);
        const timeB = b.createdAt && typeof b.createdAt.toMillis === 'function' ? b.createdAt.toMillis() : (b.createdAt || 0);
        return timeA - timeB;
    });

    return result.reverse();
  }, [sessions]);
  const livePrediction = useWellsProgressFactor(
    { ...topic, pages: parseFloat(String(pages).replace(",", ".")) || 0, numeroPalabras: parseInt(numeroPalabras) || undefined, difficulty: difficulty as any, title: customTitle },
    progress,
    groupedSessions,
    userProgress
  );
  
  const srsState = {
    easinessFactor: progress?.srsEasinessFactor || 2.5,
    interval: progress?.srsInterval || 0,
    repetitions: progress?.srsRepetitions || 0
  };
  const nextReviewDate = !!progress?.firstStudyDate ? calculateNextSRSState(progress?.difficulty || 5, srsState, progress?.lastReviewDate).nextReviewDate : null;
  const daysUntilReview = nextReviewDate ? Math.ceil((new Date(nextReviewDate).getTime() - new Date().getTime()) / (1000 * 3600 * 24)) : 0;

  useEffect(() => {
    // 1. Immediately sync from reactive recentSessions using universal topic matching
    const matched = recentSessions.filter((s) => sessionMatchesTopic(s, topic));
    const processed = matched.map((s) => {
      const isCante = isCantoSession(s);
      const dur = isCante ? getCantoDuration(s) : {
        mins: Math.round(Number(s.durationMinutes || s.duration || 0)),
        secs: Number(s.cantoSeconds || s.seconds || 0),
        totalSecs: Math.round(Number(s.durationMinutes || s.duration || 0) * 60) + Number(s.cantoSeconds || s.seconds || 0),
        formatted: `${Math.round(Number(s.durationMinutes || s.duration || 0))}m`
      };
      const effectiveGrade =
        typeof s.cantoGrade === 'number'
          ? s.cantoGrade
          : typeof s.grade === 'number'
          ? s.grade
          : typeof s.score === 'number'
          ? s.score
          : typeof s.nota === 'number'
          ? s.nota
          : undefined;

      return {
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
    // Deduplicate exact duplicate sessions
    const dedupedSessions: any[] = [];
    const seenSessionKeys = new Set<string>();
    for (const s of processed) {
      const key = `${s.date}-${s.type}-${s.durationMinutes}-${s.cantoSeconds || 0}-${s.cantoGrade ?? ''}`;
      if (!seenSessionKeys.has(key)) {
        seenSessionKeys.add(key);
        dedupedSessions.push(s);
      }
    }
    setSessions(dedupedSessions);
  }, [topic.id, topic.number, recentSessions]);

  
    
  const ebbinghausAnalysis = useMemo(() => {
    const p = parseFloat(String(pages).replace(",", ".")) || topic.pages || 15;
    return calculateEbbinghausCurve(
      topic.id,
      p,
      difficulty,
      progress,
      sessions
    );
  }, [topic.id, pages, difficulty, progress, sessions]);

  const retentionData = ebbinghausAnalysis.chartData;

    const diffChartData = useMemo(() => {
    return groupedSessions.filter((s) => s.type === "estudio_inicial" || s.type === "repaso" || s.type === "refresco")
      .map((s) => ({
        date: s.date.slice(5),
        dificultad: s.difficulty || 0,
        index: s.date.slice(5),
      }))
      .reverse();
  }, [sessions]);

  const estudioRepasoChartData = useMemo(() => {
    return groupedSessions.filter((s) => s.type === "estudio_inicial" || s.type === "repaso")
      .map((s) => {
        const p = parseFloat(String(pages).replace(",", ".")) || 0;
        const duracionHoras = s.duration / 60;
        const pace = p > 0 ? (s.duration / p).toFixed(1) : 0;
        return {
          date: s.date.slice(5),
          index: s.date.slice(5),
          duracion: parseFloat(duracionHoras.toFixed(1)),
          pace: parseFloat(pace as string),
        };
      })
      .reverse();
  }, [sessions, pages]);

  // Cantos Intelligence Engine for this Topic
  const topicCantosAll = useMemo(() => {
    return sessions
      .filter(isCantoSession)
      .slice()
      .sort(compareSessionsAsc);
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
        diagnostico: "Sin Cantos Registrados",
        consejo: "Aún no has expuesto este tema ante el tribunal. Programa un cante cuando afiances los repasos para calibrar tu cronómetro.",
        badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
      };
    }

    const conNota = topicCantosAll.filter(c => typeof c.cantoGrade === 'number' && (c.cantoGrade as number) >= 0);
    const notaMedia = conNota.length > 0 
      ? conNota.reduce((acc, c) => acc + (c.cantoGrade as number), 0) / conNota.length 
      : 0;

    const notas = conNota.map(c => c.cantoGrade as number);
    const mejorNota = notas.length > 0 ? Math.max(...notas) : null;
    const peorNota = notas.length > 0 ? Math.min(...notas) : null;

    // Duraciones en segundos y minutos calculadas exactamente
    const duracionesSec = topicCantosAll.map(c => getCantoDuration(c).totalSecs);
    const duracionesMin = duracionesSec.map(s => s / 60);
    const duracionMediaTotal = duracionesMin.length > 0 ? (duracionesMin.reduce((a, b) => a + b, 0) / duracionesMin.length) : 0;
    const duracionMediaSecs = Math.round(duracionMediaTotal * 60);
    const tiempoMedioMin = Math.floor(duracionMediaTotal);
    const tiempoMedioSec = Math.round((duracionMediaTotal % 1) * 60);
    const tiempoMedioStr = `${tiempoMedioMin}:${tiempoMedioSec.toString().padStart(2, "0")} min`;

    // Ventana oficial para aprobar un cante: entre 11:00 y 13:40 min (660s a 820s)
    const enVentana = duracionesSec.filter(s => s >= 660 && s <= 820).length;
    const porcentajeEnVentana = total > 0 ? Math.round((enVentana / total) * 100) : 0;

    // Para contabilizar como aprobados: nota >= 5 y duración entre 11 y 13:40 minutos (660s a 820s). Si tiene más es suspenso.
    const aprobados = conNota.filter(c => {
      const durSecs = getCantoDuration(c).totalSecs;
      const notaAprobada = (c.cantoGrade as number) >= 5;
      const enTiempoValido = durSecs >= 660 && durSecs <= 820;
      return notaAprobada && enTiempoValido;
    }).length;
    const aprobadosPorcentaje = conNota.length > 0 ? Math.round((aprobados / conNota.length) * 100) : 0;

    // Tendencia: último cante vs penúltimo
    let tendenciaNota = 0;
    if (conNota.length >= 2) {
      const ultimo = conNota[conNota.length - 1].cantoGrade as number;
      const penultimo = conNota[conNota.length - 2].cantoGrade as number;
      tendenciaNota = Math.round((ultimo - penultimo) * 10) / 10;
    }

    // Días desde el último cante
    const ultimoCanto = topicCantosAll[topicCantosAll.length - 1];
    let diasUltimoCanto: number | null = null;
    if (ultimoCanto?.date) {
      const lastDate = safeParseDate(ultimoCanto.date);
      const today = new Date();
      diasUltimoCanto = Math.max(0, Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 3600 * 24)));
    }

    // Diagnóstico
    let diagnostico = "En Evaluación";
    let consejo = "Mantén la regularidad y revisa las observaciones del tribunal.";
    let badgeClass = "bg-slate-100 text-slate-700 border-slate-200";

    const ultimoConNota = conNota[conNota.length - 1];
    const ultimaNota = ultimoConNota ? (ultimoConNota.cantoGrade as number) : null;
    const ultimasSecs = ultimoCanto ? getCantoDuration(ultimoCanto).totalSecs : 0;

    if (ultimaNota !== null && ultimaNota >= 8 && duracionMediaSecs >= 660 && duracionMediaSecs <= 820) {
      diagnostico = "Tribunal Consolidado";
      consejo = "Excelente solvencia jurídica y cronómetro clavado en la ventana oficial (11:00–13:40 min).";
      badgeClass = "bg-emerald-50 text-emerald-800 border-emerald-200";
    } else if (duracionMediaSecs > 820) {
      diagnostico = "Exceso de Tiempo";
      consejo = "Media superior a 13:40 min (suspenso reglamentario). Sintetiza epígrafes para asegurar el aprobado.";
      badgeClass = "bg-rose-50 text-rose-800 border-rose-200";
    } else if (duracionMediaSecs > 0 && duracionMediaSecs < 660) {
      diagnostico = "Exposición Breve";
      consejo = "Media por debajo de 11 min. Te falta tiempo reglamentario: amplía articulado y fundamentación.";
      badgeClass = "bg-amber-50 text-amber-800 border-amber-200";
    } else if (ultimaNota !== null && ultimaNota >= 5 && ultimasSecs >= 660 && ultimasSecs <= 820) {
      diagnostico = "Aprobado en Progreso";
      consejo = "Tema superado en tiempo oficial (11:00–13:40 min). Afianza artículos clave para alcanzar el 8+.";
      badgeClass = "bg-indigo-50 text-indigo-800 border-indigo-200";
    } else if (ultimaNota !== null && (ultimaNota < 5 || ultimasSecs > 820 || ultimasSecs < 660)) {
      diagnostico = "Suspenso / Refuerzo";
      consejo = ultimasSecs > 820 
        ? "Último simulacro suspendido por exceso de tiempo (>13:40 min). Agiliza transiciones para entrar en tiempo."
        : ultimaNota < 5 
          ? "Último simulacro por debajo de 5.0. Repasa el esquema mental antes del siguiente cante."
          : "Cante por debajo de 11 min. Amplía el contenido de los epígrafes para alcanzar el mínimo.";
      badgeClass = "bg-rose-50 text-rose-800 border-rose-200";
    }

    return {
      total,
      notaMedia,
      notaMediaStr: conNota.length > 0 ? notaMedia.toFixed(1) : "—",
      mejorNota,
      peorNota,
      tiempoMedioTotalMin: duracionMediaTotal,
      tiempoMedioMin,
      tiempoMedioSec,
      tiempoMedioStr: `${tiempoMedioMin}m ${tiempoMedioSec > 0 ? `${tiempoMedioSec}s` : ""}`.trim(),
      porcentajeEnVentana,
      aprobadosPorcentaje,
      tendenciaNota,
      diasUltimoCanto,
      diagnostico,
      consejo,
      badgeClass,
    };
  }, [topicCantosAll]);

  const topicCantosChartData = useMemo(() => {
    const rawList = cantoTimeRange === "5"
      ? topicCantosAll.slice(-5)
      : cantoTimeRange === "10"
        ? topicCantosAll.slice(-10)
        : topicCantosAll;

    return rawList.map((s, idx) => {
      const origIndex = topicCantosAll.indexOf(s);
      const durSec = (s.duration || 0) * 60 + (s.cantoSeconds || 0);
      const durMin = durSec / 60;
      const isOptimal = durSec >= 660 && durSec <= 820; // 11:00 a 13:40 min
      const isExcess = durSec > 820; // >13:40 min: suspenso automático
      const isBrief = durSec > 0 && durSec < 660; // <11:00 min: insuficiente

      const hasGrade = typeof s.cantoGrade === "number";
      const gradeVal = (s.cantoGrade as number) ?? 0;
      // Para contabilizar como aprobado: nota >= 5 y duración entre 11 y 13:40 min. Si tiene más es suspenso.
      const isAprobado = hasGrade && gradeVal >= 5 && isOptimal;
      const isSuspenso = hasGrade && !isAprobado;

      let estadoCante = "Sin nota";
      let estadoCanteClass = "bg-slate-100 text-slate-600 border-slate-200";
      if (hasGrade) {
        if (isAprobado) {
          estadoCante = "Aprobado";
          estadoCanteClass = "bg-emerald-100 text-emerald-800 border-emerald-300";
        } else if (isExcess) {
          estadoCante = "Suspenso (>13:40)";
          estadoCanteClass = "bg-rose-100 text-rose-800 border-rose-300";
        } else if (isBrief) {
          estadoCante = "Suspenso (<11:00)";
          estadoCanteClass = "bg-amber-100 text-amber-800 border-amber-300";
        } else {
          estadoCante = "Suspenso (<5.0)";
          estadoCanteClass = "bg-rose-100 text-rose-800 border-rose-300";
        }
      }

      let barColor = "#6366f1"; // default indigo
      if (isOptimal) barColor = "#10b981"; // emerald (11:00 - 13:40 min)
      else if (isExcess) barColor = "#f43f5e"; // rose (suspenso por exceso)
      else if (isBrief) barColor = "#f59e0b"; // amber (breve)

      return {
        id: s.id,
        cantoNum: origIndex + 1,
        displayX: `#${origIndex + 1} (${s.date ? s.date.slice(5) : ""})`,
        fecha: s.date || "",
        duracion: Math.round(durMin * 10) / 10,
        duracionMinutos: s.duration || 0,
        duracionSegundos: s.cantoSeconds || 0,
        duracionStr: `${s.duration || 0}m${s.cantoSeconds ? ` ${s.cantoSeconds}s` : ""}`,
        nota: typeof s.cantoGrade === "number" ? s.cantoGrade : null,
        isOptimal,
        isExcess,
        isBrief,
        isAprobado,
        isSuspenso,
        estadoCante,
        estadoCanteClass,
        barColor,
        mistakes: s.mistakes,
        notes: s.notes,
        type: s.type,
      };
    });
  }, [topicCantosAll, cantoTimeRange]);

  const cantosChartData = topicCantosChartData;

  const totalRepasos = groupedSessions.filter((s) => s.type === "refresco" || s.type === "repaso").length;
  const totalCantos = groupedSessions.filter((s) => s.type === "canto" || s.type === "simulacro").length;
  
  const totalTimeMinutes = sessions.reduce((acc, s) => acc + (s.duration || 0), 0);
  const totalTimeStr = totalTimeMinutes > 60 
    ? `${Math.floor(totalTimeMinutes / 60)}h ${totalTimeMinutes % 60}m`
    : `${totalTimeMinutes}m`;

  const bestCanto = groupedSessions
    .filter((s) => s.type === "canto" || s.type === "simulacro")
    .sort((a, b) => (b.cantoGrade || 0) - (a.cantoGrade || 0))[0];
    
  const bestCantoStr = bestCanto && bestCanto.cantoGrade ? `${bestCanto.cantoGrade}/10` : "-";

  const addSession = async () => {
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
        typeof logDifficulty === 'number' ? logDifficulty : (Number(progress?.difficulty) || 5), 
        logType as any, 
        logDate || getLocalDateString(), 
        {
          cantoGrade: (logType === 'canto' || logType === 'simulacro') && typeof logCantoGrade === 'number' ? logCantoGrade : undefined,
          notes: (logNotes || "").trim(),
          completesVuelta: logCompletesVuelta,
          cantoSeconds: (logType === 'canto' || logType === 'simulacro') ? s : undefined,
          mistakes: (logType === 'canto' || logType === 'simulacro') && logMistakes ? logMistakes.trim() : undefined,
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


  const deleteSessionHandler = async (ids: string[]) => {
    try {
      for (const i of ids) { await deleteStudySession(topicId, i); }
      toast.success("Sesión eliminada");
      setSessionToDelete(null);
    } catch(e) {
      toast.error("Error eliminando sesión");
    }
  };

return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-2xl p-0 sm:p-4 md:p-6 animate-in fade-in duration-300">
      <motion.div 
        initial={{ scale: 0.96, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0, y: 12 }}
        transition={{ type: "spring", stiffness: 350, damping: 30 }}
        className="bg-[#F5F5F7] w-full max-w-[92rem] h-[100dvh] sm:h-full sm:max-h-[96vh] rounded-none sm:rounded-[2.5rem] flex flex-col shadow-[0_25px_70px_-15px_rgba(0,0,0,0.35)] overflow-hidden ring-1 ring-slate-900/10 relative"
      >
        
        {/* Sticky Translucent Header */}
        <header className="flex-shrink-0 px-4 py-3 sm:px-6 sm:py-4 md:px-8 md:py-5 bg-white/80 backdrop-blur-2xl border-b border-slate-200/60 flex items-center justify-between z-50">
            <div className="flex-1 min-w-0 pr-4">
               <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <span className="bg-indigo-50 text-indigo-700 border border-indigo-200/60 px-3 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm">
                      <Target size={12} className="text-indigo-600" /> Tema {topic.number === 999 ? "Extra" : topic.number}
                  </span>
                  {/* Fase Ciclo Preparador */}
                  <span className={cn(
                    "px-3 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm border",
                    topicCycle.phaseBadgeClass
                  )}>
                    <Sparkles size={12} /> {topicCycle.phaseLabel}
                  </span>

                  {(progress?.vueltas ?? 0) > 0 && (
                    <span className="bg-emerald-50 text-emerald-700 border border-emerald-200/60 px-3 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm">
                        <Check size={12} className="text-emerald-600" /> Vuelta {progress?.vueltas}
                    </span>
                  )}
                  {daysUntilReview <= 0 && progress?.firstStudyDate ? (
                    <span className="bg-rose-50 text-rose-700 border border-rose-200/80 px-3 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm animate-pulse">
                        <AlertTriangle size={12} className="text-rose-600" /> Repaso Pendiente (Hoy)
                    </span>
                  ) : nextReviewDate ? (
                    <span className="bg-slate-100 text-slate-700 border border-slate-200/60 px-3 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5">
                        <CalendarDays size={12} className="text-slate-500" /> Próximo: en {daysUntilReview} d
                    </span>
                  ) : null}
               </div>
               <h2 className="text-base sm:text-xl md:text-2xl font-black font-serif text-slate-900 tracking-tight">
                  {customTitle || topic.title}
               </h2>
               {topic.fullTitle && topic.fullTitle !== (customTitle || topic.title) && (
                 <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed line-clamp-2 hover:line-clamp-none transition-all" title={topic.fullTitle}>
                   {topic.fullTitle}
                 </p>
               )}
            </div>
            
            <button 
               type="button" 
               onClick={onClose}
               className="w-9 h-9 sm:w-10 sm:h-10 bg-slate-100/80 hover:bg-slate-200 text-slate-500 hover:text-slate-800 rounded-full transition-all flex items-center justify-center flex-shrink-0 active:scale-95 shadow-sm"
               title="Cerrar ficha"
            >
               <X size={18} strokeWidth={2.5} />
            </button>
        </header>

        {/* Scrollable Dashboard Body */}
        <div className="flex-1 overflow-y-auto p-2.5 sm:p-6 md:p-8 pb-20 sm:pb-8 no-scrollbar relative">
           
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-3.5 sm:gap-6 max-w-[90rem] mx-auto">
              
              {/* LEFT COLUMN: Data Input (Log Session & Settings) - Col Span 4 */}
              <div className="col-span-1 xl:col-span-4 flex flex-col gap-3.5 sm:gap-6">
                 
                 {/* Detalles del Tema Bento Card */}
                 <div className="bg-white/90 backdrop-blur-2xl rounded-2xl sm:rounded-[2rem] p-3.5 sm:p-6 shadow-[0_8px_30px_rgb(0,0,0,0.03)] border border-slate-200/70">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-black text-slate-900 flex items-center gap-2 uppercase tracking-wide">
                          <BookOpen size={16} className="text-indigo-600"/>
                          Parámetros del Tema
                      </h3>
                      <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                        Configuración
                      </span>
                    </div>
                    
                    <div className="space-y-4">
                        <div>
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5 block">Título Oficial / Personalizado</label>
                            <input 
                              type="text" 
                              value={customTitle} 
                              onChange={(e) => setCustomTitle(e.target.value)} 
                              className="w-full text-xs font-bold text-slate-800 bg-slate-50/80 border border-slate-200/80 rounded-xl px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all" 
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5 block">Extensión (Páginas)</label>
                                <div className="relative">
                                  <input 
                                    type="number" 
                                    step="0.5" 
                                    value={pages} 
                                    onChange={(e) => setPages(e.target.value)} 
                                    className="w-full text-xs font-bold text-slate-800 bg-slate-50/80 border border-slate-200/80 rounded-xl px-3.5 py-2.5 pr-8 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all" 
                                  />
                                  <span className="absolute right-3 top-2.5 text-[10px] font-bold text-slate-400 uppercase">pág</span>
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5 block">Palabras Aprox.</label>
                                <div className="relative">
                                  <input 
                                    type="number" 
                                    value={numeroPalabras} 
                                    onChange={(e) => setNumeroPalabras(e.target.value)} 
                                    className="w-full text-xs font-bold text-slate-800 bg-slate-50/80 border border-slate-200/80 rounded-xl px-3.5 py-2.5 pr-8 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all" 
                                  />
                                  <span className="absolute right-3 top-2.5 text-[10px] font-bold text-slate-400 uppercase">pal</span>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5 block">Nº Epígrafes</label>
                                <div className="relative">
                                  <input 
                                    type="number" 
                                    value={epigrafes} 
                                    onChange={(e) => setEpigrafes(e.target.value)} 
                                    placeholder="5"
                                    className="w-full text-xs font-bold text-slate-800 bg-slate-50/80 border border-slate-200/80 rounded-xl px-3.5 py-2.5 pr-8 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all" 
                                  />
                                  <span className="absolute right-3 top-2.5 text-[10px] font-bold text-slate-400 uppercase">epíg</span>
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5 block">Dificultad (1-10)</label>
                                <div className="relative">
                                  <input 
                                    type="number" 
                                    min="1"
                                    max="10"
                                    value={difficulty} 
                                    onChange={(e) => setDifficulty(Math.max(1, Math.min(10, parseInt(e.target.value) || 5)))} 
                                    className="w-full text-xs font-bold text-slate-800 bg-slate-50/80 border border-slate-200/80 rounded-xl px-3.5 py-2.5 pr-8 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all" 
                                  />
                                  <span className="absolute right-3 top-2.5 text-[10px] font-bold text-slate-400 uppercase">/10</span>
                                </div>
                            </div>
                        </div>

                        <button 
                          type="button" 
                          onClick={async () => {
                            try {
                              const parsedPages = parseFloat(String(pages).replace(",", ".")) || 0;
                              const parsedPalabras = numeroPalabras.trim() ? parseInt(numeroPalabras, 10) : undefined;
                              const parsedEpigrafes = epigrafes.trim() ? parseInt(epigrafes, 10) : undefined;
                              await updateTopicProgress(topic.id, { 
                                customTitle: customTitle.trim() || topic.title, 
                                pages: parsedPages, 
                                numeroPalabras: parsedPalabras,
                                epigrafes: parsedEpigrafes,
                                difficulty: Number(difficulty) || 5,
                              });
                              toast.success("Parámetros del tema guardados en la nube");
                            } catch (err: any) {
                              toast.error("Error guardando parámetros: " + (err.message || err));
                            }
                          }} 
                          className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition-all active:scale-[0.98] shadow-sm flex items-center justify-center gap-1.5"
                        >
                            <Save size={14} /> Guardar Parámetros
                        </button>
                    </div>
                 </div>

                 {/* Registro de Sesión Bento Card */}
                 <div className="bg-white/90 backdrop-blur-2xl rounded-2xl sm:rounded-[2rem] p-3.5 sm:p-6 shadow-[0_8px_30px_rgb(0,0,0,0.03)] border border-slate-200/70">
                     <div className="flex items-center justify-between mb-5">
                       <h3 className="text-sm font-black text-slate-900 flex items-center gap-2 uppercase tracking-wide">
                          <PlusCircle size={16} className="text-indigo-600"/>
                          Registrar Sesión Real
                       </h3>
                       <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full uppercase">
                         Log
                       </span>
                     </div>
                     
                     <div className="space-y-4">
                         {/* Banner Guía del Método del Preparador */}
                         <div className="p-3.5 rounded-2xl bg-amber-50/80 border border-amber-200/80 flex items-start gap-3 shadow-sm">
                           <div className="p-2 rounded-xl bg-amber-100 text-amber-800 shrink-0 mt-0.5">
                             <Sparkles size={15} />
                           </div>
                           <div className="flex-1 min-w-0">
                             <div className="flex items-center justify-between gap-1 mb-1">
                               <span className="text-[10px] font-black uppercase text-amber-900 tracking-wider">
                                 Método Preparador (Ciclo)
                               </span>
                               <span className={cn(
                                 "text-[9px] font-black px-2 py-0.5 rounded-full border",
                                 topicCycle.phaseBadgeClass
                               )}>
                                 {topicCycle.phaseLabel}
                               </span>
                             </div>
                             <p className="text-xs font-bold text-slate-800">
                               Acción recomendada: <span className="text-indigo-900 font-black">{topicCycle.nextActionTitle}</span>
                             </p>
                             {topicCycle.phase === "en_refrescos" && (
                               <div className="flex items-center gap-2 mt-2 pt-2 border-t border-amber-200/60">
                                 <span className="text-[10px] text-amber-900 font-extrabold">Fase 3 Refrescos:</span>
                                 <div className="flex items-center gap-1.5">
                                   {[1, 2, 3].map((s) => (
                                     <span
                                       key={s}
                                       className={cn(
                                         "w-4 h-4 rounded-full text-[9px] font-black flex items-center justify-center",
                                         s <= topicCycle.refrescosCount
                                           ? "bg-amber-500 text-white"
                                           : "bg-amber-200 text-amber-800"
                                       )}
                                     >
                                       {s}
                                     </span>
                                   ))}
                                 </div>
                                 <span className="text-[10px] text-amber-800 font-bold ml-1">
                                   {topicCycle.refrescoDayLabel}
                                 </span>
                               </div>
                             )}
                           </div>
                         </div>

                         {/* Segmented Picker for Session Type */}
                         <div>
                            <div className="flex items-center justify-between mb-2">
                              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">
                                  Tipo de Sesión
                              </label>
                              {!hasManuallyChangedType && (
                                <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                                  Sugerido por Preparador
                                </span>
                              )}
                            </div>
                            <div className="bg-slate-100/90 p-1 rounded-2xl grid grid-cols-5 gap-1 border border-slate-200/50">
                                {(["estudio_inicial", "repaso", "refresco", "canto", "simulacro"] as const).map(t => {
                                    const labels: Record<string, string> = {
                                      estudio_inicial: "Estudio",
                                      repaso: "Repaso",
                                      refresco: "Refresco",
                                      canto: "Cante",
                                      simulacro: "Simulacro",
                                    };
                                    const isSelected = logType === t;
                                    return (
                                      <button
                                        key={t}
                                        type="button"
                                        onClick={() => { setLogType(t); setHasManuallyChangedType(true); }}
                                        className={cn(
                                          "py-2 px-1 text-[10px] font-black rounded-xl transition-all text-center uppercase tracking-tight",
                                          isSelected 
                                            ? "bg-white text-indigo-700 shadow-sm border border-slate-200/60"
                                            : "text-slate-500 hover:text-slate-900 hover:bg-slate-200/40"
                                        )}
                                      >
                                        {labels[t]}
                                      </button>
                                    );
                                })}
                            </div>
                            {/* Ayuda contextual por tipo */}
                            <p className="text-[10px] text-slate-500 font-medium mt-2 px-1">
                              {logType === "estudio_inicial" && "📖 Estudio inicial: memorización y comprensión en profundidad del tema."}
                              {logType === "refresco" && "⚡ Refresco (3 días seguidos): leerlo e intentar cantarlo hasta retenerlo."}
                              {logType === "canto" && "🎙️ Cante ante el preparador: valida el tema y cierra la Vuelta 1."}
                              {logType === "repaso" && "🔄 Repaso mensual (~30 días): vuelta periódica para afianzar en memoria a largo plazo."}
                              {logType === "simulacro" && "🎯 Simulacro de examen: prueba cronometrada bajo condiciones reales."}
                            </p>
                         </div>
                         
                         {/* Date and Duration Grid */}
                         <div className="grid grid-cols-2 gap-3">
                             <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5 block">Fecha</label>
                                <input 
                                  type="date" 
                                  value={logDate} 
                                  onChange={e => setLogDate(e.target.value)} 
                                  className="w-full bg-slate-50/80 border border-slate-200/80 text-slate-800 text-xs font-bold rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all" 
                                />
                             </div>
                             <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5 block">Duración</label>
                                <div className="flex gap-1.5">
                                    <div className="relative flex-1">
                                      <input 
                                        type="number" 
                                        placeholder="0" 
                                        value={logDurationHours} 
                                        onChange={e => setLogDurationHours(e.target.value)} 
                                        className="w-full bg-slate-50/80 border border-slate-200/80 text-slate-800 text-xs font-black rounded-xl py-2.5 pl-2 pr-5 text-center outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all" 
                                      />
                                      <span className="absolute right-1.5 top-2.5 text-[9px] font-bold text-slate-400">h</span>
                                    </div>
                                    <div className="relative flex-1">
                                      <input 
                                        type="number" 
                                        placeholder="0" 
                                        value={logDurationMinutes} 
                                        onChange={e => setLogDurationMinutes(e.target.value)} 
                                        className="w-full bg-slate-50/80 border border-slate-200/80 text-slate-800 text-xs font-black rounded-xl py-2.5 pl-2 pr-5 text-center outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all" 
                                      />
                                      <span className="absolute right-1.5 top-2.5 text-[9px] font-bold text-slate-400">m</span>
                                    </div>
                                    {(logType === 'canto' || logType === 'simulacro') && (
                                      <div className="relative flex-1">
                                        <input 
                                          type="number" 
                                          placeholder="0" 
                                          value={logDurationSeconds} 
                                          onChange={e => setLogDurationSeconds(e.target.value)} 
                                          className="w-full bg-slate-50/80 border border-slate-200/80 text-slate-800 text-xs font-black rounded-xl py-2.5 pl-2 pr-5 text-center outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all" 
                                        />
                                        <span className="absolute right-1.5 top-2.5 text-[9px] font-bold text-slate-400">s</span>
                                      </div>
                                    )}
                                </div>
                                {(logType === 'canto' || logType === 'simulacro') && (
                                  <p className="text-[10px] text-slate-400 mt-1 font-medium">
                                    Ventana oficial: 11:00 a 13:40 min (más de 13:40 es suspenso).
                                  </p>
                                )}
                             </div>
                         </div>

                         {/* Dificultad Percibida */}
                         {(logType === 'estudio_inicial' || logType === 'repaso' || logType === 'refresco') && (
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2 flex items-center justify-between">
                                    <span>Dificultad Percibida (1-10)</span>
                                    <span className="text-slate-400 font-bold lowercase">
                                      {logDifficulty ? `Nivel ${logDifficulty}` : "Opcional"}
                                    </span>
                                </label>
                                <div className="bg-slate-100/90 p-1 rounded-2xl flex gap-1 border border-slate-200/50">
                                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((d) => {
                                        const isActive = logDifficulty === d;
                                        let activeClass = "bg-white text-slate-900 shadow-sm border border-slate-200/60";
                                        if (isActive) {
                                            if (d <= 3) activeClass = "bg-emerald-600 text-white shadow-sm border-transparent";
                                            else if (d <= 6) activeClass = "bg-amber-500 text-white shadow-sm border-transparent";
                                            else activeClass = "bg-rose-600 text-white shadow-sm border-transparent";
                                        }
                                        return (
                                          <button 
                                            type="button" 
                                            key={d} 
                                            onClick={() => setLogDifficulty(isActive ? "" : d)} 
                                            className={cn(
                                              "flex-1 py-1.5 rounded-xl font-black text-xs transition-all", 
                                              isActive ? activeClass : "text-slate-400 hover:text-slate-700 hover:bg-slate-200/40"
                                            )}
                                          >
                                            {d}
                                          </button>
                                        );
                                    })}
                                </div>
                            </div>
                         )}

                         {/* Calificación de Cante */}
                         {(logType === 'canto' || logType === 'simulacro') && (
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2 flex items-center justify-between">
                                    <span>Calificación Oral (1-10)</span>
                                    <span className="text-indigo-600 font-bold">
                                      {logCantoGrade ? `${logCantoGrade}/10` : "Seleccionar"}
                                    </span>
                                </label>
                                <div className="grid grid-cols-10 gap-1 bg-slate-100/90 p-1 rounded-2xl border border-slate-200/50">
                                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((d) => {
                                        const isActive = logCantoGrade === d;
                                        return (
                                          <button 
                                            type="button" 
                                            key={d} 
                                            onClick={() => setLogCantoGrade(isActive ? "" : d)} 
                                            className={cn(
                                              "py-1.5 rounded-xl font-black text-xs transition-all", 
                                              isActive 
                                                ? d >= 8 
                                                  ? "bg-emerald-600 text-white shadow-sm" 
                                                  : d >= 5 
                                                    ? "bg-indigo-600 text-white shadow-sm" 
                                                    : "bg-rose-500 text-white shadow-sm"
                                                : "text-slate-400 hover:text-slate-700 hover:bg-slate-200/40"
                                            )}
                                          >
                                            {d}
                                          </button>
                                        );
                                    })}
                                </div>
                            </div>
                         )}

                         <div className="relative">
                            <textarea 
                              value={logNotes} 
                              onChange={(e) => setLogNotes(e.target.value)} 
                              placeholder="Observaciones, dudas o ritmo de estudio..." 
                              className="w-full bg-slate-50/80 border border-slate-200/80 text-slate-800 text-xs font-medium rounded-xl p-3 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all min-h-[70px] resize-y placeholder:text-slate-400" 
                            />
                         </div>

                         {(logType === 'canto' || logType === 'simulacro') && (
                             <div className="relative">
                                <textarea 
                                  value={logMistakes} 
                                  onChange={(e) => setLogMistakes(e.target.value)} 
                                  placeholder="¿Qué puntos o artículos se fallaron? (Feedback crítico)..." 
                                  className="w-full bg-rose-50/40 border border-rose-200/60 text-slate-800 text-xs font-medium rounded-xl p-3 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-400 outline-none transition-all min-h-[60px] resize-y placeholder:text-rose-400" 
                                />
                             </div>
                         )}

                         {(logType === 'estudio_inicial' || logType === 'repaso' || logType === 'refresco') && (
                             <label className="flex items-center gap-3 p-3 bg-slate-50/80 border border-slate-200/60 rounded-xl cursor-pointer hover:bg-slate-100/80 transition-colors">
                                 <div className="flex-1">
                                     <span className="block text-xs font-black text-slate-800">Completa Vuelta al Tema</span>
                                     <span className="block text-[11px] font-medium text-slate-500">Avanza el contador oficial de vueltas (+1)</span>
                                 </div>
                                 <div className={cn("w-10 h-6 rounded-full flex items-center px-1 transition-colors", logCompletesVuelta ? "bg-indigo-600" : "bg-slate-300")}>
                                     <div className={cn("w-4 h-4 bg-white rounded-full transition-transform shadow-sm", logCompletesVuelta ? "translate-x-4" : "translate-x-0")} />
                                 </div>
                                 <input type="checkbox" className="hidden" checked={logCompletesVuelta} onChange={(e) => setLogCompletesVuelta(e.target.checked)} />
                             </label>
                         )}

                         {futureNextReviewDate && (
                           <div className="p-3 bg-indigo-50/60 border border-indigo-100/60 rounded-xl text-[11px] font-bold text-indigo-900 flex items-center gap-2">
                             <Sparkles size={14} className="text-indigo-600 shrink-0" />
                             <span>Próximo repaso proyectado: <strong className="font-black">{safeParseDate(futureNextReviewDate).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })}</strong></span>
                           </div>
                         )}

                         <button 
                             type="button" 
                             onClick={addSession}
                             disabled={isSavingSession || saveSuccess}
                             className={cn(
                               "w-full text-white font-black py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 transform transition-all active:scale-[0.98] shadow-sm text-xs uppercase tracking-wider",
                               saveSuccess ? "bg-emerald-600" : "bg-slate-900 hover:bg-slate-800",
                               (isSavingSession || saveSuccess) && "pointer-events-none opacity-90"
                             )}
                         >
                             {isSavingSession ? (
                               <><Loader2 size={16} className="animate-spin" /> Registrando...</>
                             ) : saveSuccess ? (
                               <><Check size={16} /> Sesión Registrada</>
                             ) : (
                               <><Plus size={16} /> Añadir a Historial</>
                             )}
                         </button>
                     </div>
                 </div>

              </div>

              {/* RIGHT COLUMN: Dashboard & History - Col Span 8 */}
              <div className="col-span-1 xl:col-span-8 flex flex-col gap-3.5 sm:gap-6">
                 
                 {/* Apple Health Vitals Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3.5">
                      <div className="bg-white/90 backdrop-blur-2xl rounded-2xl sm:rounded-[1.75rem] p-3.5 sm:p-5 shadow-[0_8px_30px_rgb(0,0,0,0.03)] border border-slate-200/70 flex flex-col justify-between">
                          <div className="flex items-center justify-between mb-2 sm:mb-3">
                              <span className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-wider">Inversión Total</span>
                              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100 shrink-0">
                                <Clock size={14}/>
                              </div>
                          </div>
                          <div>
                            <h4 className="text-xl sm:text-2xl font-black font-serif text-slate-900 tracking-tight">{totalTimeStr || "0m"}</h4>
                            <p className="text-[10px] font-bold text-slate-500 mt-0.5">Tiempo en mesa</p>
                          </div>
                      </div>
                      
                      <div className="bg-white/90 backdrop-blur-2xl rounded-2xl sm:rounded-[1.75rem] p-3.5 sm:p-5 shadow-[0_8px_30px_rgb(0,0,0,0.03)] border border-slate-200/70 flex flex-col justify-between">
                          <div className="flex items-center justify-between mb-2 sm:mb-3">
                              <span className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-wider">Repasos</span>
                              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 shrink-0">
                                <BookOpen size={14}/>
                              </div>
                          </div>
                          <div>
                            <h4 className="text-xl sm:text-2xl font-black font-serif text-slate-900 tracking-tight">{totalRepasos}</h4>
                            <p className="text-[10px] font-bold text-slate-500 mt-0.5">Ciclos completados</p>
                          </div>
                      </div>
                      
                      <div className="bg-white/90 backdrop-blur-2xl rounded-2xl sm:rounded-[1.75rem] p-3.5 sm:p-5 shadow-[0_8px_30px_rgb(0,0,0,0.03)] border border-slate-200/70 flex flex-col justify-between">
                          <div className="flex items-center justify-between mb-2 sm:mb-3">
                              <span className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-wider">Cantos</span>
                              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100 shrink-0">
                                <Mic size={14}/>
                              </div>
                          </div>
                          <div>
                            <h4 className="text-xl sm:text-2xl font-black font-serif text-slate-900 tracking-tight">{totalCantos}</h4>
                            <p className="text-[10px] font-bold text-slate-500 mt-0.5">Exposiciones orales</p>
                          </div>
                      </div>
                      
                      <div className="bg-white/90 backdrop-blur-2xl rounded-2xl sm:rounded-[1.75rem] p-3.5 sm:p-5 shadow-[0_8px_30px_rgb(0,0,0,0.03)] border border-slate-200/70 flex flex-col justify-between">
                          <div className="flex items-center justify-between mb-2 sm:mb-3">
                              <span className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-wider">Mejor Nota</span>
                              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100 shrink-0">
                                <Target size={14}/>
                              </div>
                          </div>
                          <div>
                            <h4 className="text-xl sm:text-2xl font-black font-serif text-slate-900 tracking-tight">{bestCantoStr}</h4>
                            <p className="text-[10px] font-bold text-slate-500 mt-0.5">Récord de cante</p>
                          </div>
                      </div>

                      <div className="bg-white/90 backdrop-blur-2xl rounded-2xl sm:rounded-[1.75rem] p-3.5 sm:p-5 shadow-[0_8px_30px_rgb(0,0,0,0.03)] border border-slate-200/70 flex flex-col justify-between">
                          <div className="flex items-center justify-between mb-2 sm:mb-3">
                              <span className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-wider">Retención Ebbinghaus</span>
                              <div className={cn(
                                "w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center border shrink-0",
                                ebbinghausAnalysis.status === "excelente" ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                                ebbinghausAnalysis.status === "bueno" ? "bg-indigo-50 text-indigo-600 border-indigo-100" :
                                ebbinghausAnalysis.status === "atencion" ? "bg-amber-50 text-amber-600 border-amber-100" : "bg-rose-50 text-rose-600 border-rose-100"
                              )}>
                                <BrainCircuit size={14}/>
                              </div>
                          </div>
                          <div>
                            <div className="flex items-baseline gap-1.5">
                              <h4 className="text-xl sm:text-2xl font-black font-serif text-slate-900 tracking-tight">
                                {ebbinghausAnalysis.hasData ? `${ebbinghausAnalysis.currentRetention}%` : "—"}
                              </h4>
                              {ebbinghausAnalysis.hasData && (
                                <span className={cn(
                                  "text-[9px] font-black uppercase px-1.5 py-0.5 rounded",
                                  ebbinghausAnalysis.statusBadgeClass
                                )}>
                                  {ebbinghausAnalysis.status === "excelente" ? "Fijado" :
                                   ebbinghausAnalysis.status === "bueno" ? "Estable" :
                                   ebbinghausAnalysis.status === "atencion" ? "Refrescar" : "Crítico"}
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] font-bold text-slate-500 mt-0.5">Memoria activa hoy</p>
                          </div>
                      </div>
                  </div>

                  {/* Curva del Olvido de Ebbinghaus (Modelo Multifactorial de Vanguardia) */}
                  <div className="bg-slate-900 rounded-2xl sm:rounded-[2rem] p-4 sm:p-7 shadow-2xl border border-slate-800 flex flex-col relative overflow-hidden group">
                     {/* Ambient dynamic glow based on retention status */}
                     <div className={cn(
                       "absolute -top-16 -right-16 w-96 h-96 rounded-full blur-3xl opacity-30 pointer-events-none transition-all duration-700",
                       ebbinghausAnalysis.status === 'excelente' ? "bg-emerald-500/30" :
                       ebbinghausAnalysis.status === 'bueno' ? "bg-indigo-500/30" :
                       ebbinghausAnalysis.status === 'atencion' ? "bg-amber-500/30" : "bg-rose-500/30"
                     )}></div>

                     {/* Encabezado Principal y Badges de Retención */}
                     <div className="mb-4 relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-3.5 border-b border-slate-800/80 pb-4">
                         <div>
                             <div className="flex items-center gap-2 mb-1">
                               <div className="w-6 h-6 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
                                 <BrainCircuit size={14} />
                                </div>
                               <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                                 Curva del Olvido de Ebbinghaus
                               </h3>
                               <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                                 Modelo Multifactorial
                               </span>
                             </div>
                             <p className="text-xs font-medium text-slate-400">
                               Cálculo biométrico adaptativo: horas de estudio, dificultad (1–10), cantes, velocidad (minutos), notas y ciclo de refrescos
                             </p>
                         </div>

                         {/* Badges de Estado Actual */}
                         <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap self-stretch md:self-auto justify-start md:justify-end">
                             {ebbinghausAnalysis.hasData ? (
                               <>
                                 <div className={cn(
                                   "px-3 py-1.5 rounded-xl border flex items-center gap-2 backdrop-blur-md",
                                   ebbinghausAnalysis.statusBadgeClass
                                 )}>
                                     <span className="w-2.5 h-2.5 rounded-full animate-pulse bg-current"></span>
                                     <div className="text-left">
                                         <div className="flex items-center gap-1.5 leading-none">
                                           <span className="text-lg font-black font-serif text-white">{ebbinghausAnalysis.currentRetention}%</span>
                                           <span className="text-[9px] font-black uppercase tracking-wider opacity-90">Retención Hoy</span>
                                         </div>
                                         <p className="text-[9px] font-bold opacity-80 mt-0.5">{ebbinghausAnalysis.statusTitle}</p>
                                     </div>
                                 </div>

                                 <div className="bg-slate-800/90 border border-slate-700/80 px-3 py-1.5 rounded-xl text-left md:text-right backdrop-blur-md">
                                     {ebbinghausAnalysis.daysUntilCritical80 > 0 ? (
                                       <>
                                         <div className="flex items-center md:justify-end gap-1 leading-none">
                                           <span className="text-base font-black font-serif text-emerald-400">+{ebbinghausAnalysis.daysUntilCritical80}d</span>
                                           <span className="text-[9px] font-black text-slate-300 uppercase tracking-wider">de margen</span>
                                         </div>
                                         <p className="text-[9px] font-bold text-slate-400 mt-0.5">Sobre umbral 80%</p>
                                       </>
                                     ) : (
                                       <>
                                         <div className="flex items-center md:justify-end gap-1 leading-none">
                                           <span className="text-xs font-black text-rose-400 uppercase tracking-wider">Repaso Prioritario</span>
                                         </div>
                                         <p className="text-[9px] font-bold text-rose-300/80 mt-0.5">Bajo el umbral 80%</p>
                                       </>
                                     )}
                                 </div>
                               </>
                             ) : (
                               <div className="bg-slate-800/80 border border-slate-700 px-3 py-1.5 rounded-xl text-slate-400 text-xs font-bold">
                                 Sin estudio registrado
                               </div>
                             )}
                         </div>
                     </div>

                     {/* Diagnóstico Pedagógico y Acción Inmediata (Saber si el tema está bien o mal estudiado) */}
                     {ebbinghausAnalysis.hasData && (
                       <div className="mb-4 p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur-md flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 text-xs relative z-10">
                          <div className="flex items-start gap-3 flex-1">
                             <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border mt-0.5 shadow-sm", ebbinghausAnalysis.statusBadgeClass)}>
                                {ebbinghausAnalysis.status === 'excelente' ? <CheckCircle2 size={18} /> :
                                 ebbinghausAnalysis.status === 'bueno' ? <ShieldCheck size={18} /> :
                                 ebbinghausAnalysis.status === 'atencion' ? <AlertTriangle size={18} /> :
                                 <AlertCircle size={18} />}
                             </div>
                             <div>
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <span className="font-black text-white text-xs uppercase tracking-wide">
                                    Diagnóstico del Tema:
                                  </span>
                                  <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border", ebbinghausAnalysis.statusBadgeClass)}>
                                    {ebbinghausAnalysis.statusTitle}
                                  </span>
                                  <span className="text-[10px] font-bold text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded-full border border-slate-700">
                                    Estabilidad (S): <strong className="text-slate-200">{ebbinghausAnalysis.stabilityDays} días</strong>
                                  </span>
                                </div>
                                <p className="text-slate-300 font-medium text-[11px] sm:text-xs leading-relaxed">
                                  {ebbinghausAnalysis.diagnostic}
                                </p>
                             </div>
                          </div>
                          
                          <div className="w-full lg:w-auto shrink-0 lg:pl-4 lg:border-l lg:border-white/10">
                             <div className={cn(
                               "px-3.5 py-2.5 rounded-xl border text-left flex items-start gap-2.5",
                               ebbinghausAnalysis.isBelowCritical80 || ebbinghausAnalysis.currentRetention < 75
                                 ? "bg-rose-500/10 border-rose-500/30 text-rose-200"
                                 : "bg-indigo-500/10 border-indigo-500/30 text-indigo-200"
                             )}>
                                <div className="w-5 h-5 rounded-lg bg-white/10 flex items-center justify-center shrink-0 mt-0.5">
                                  <Zap size={12} className="text-amber-400" />
                                </div>
                                <div>
                                  <span className="text-[9px] font-black uppercase tracking-wider block opacity-80">
                                    Acción Recomendada
                                  </span>
                                  <span className="text-xs font-black text-white block mt-0.5">
                                    {ebbinghausAnalysis.actionAdvice}
                                  </span>
                                </div>
                             </div>
                          </div>
                       </div>
                     )}
                     
                     {/* Gráfica de Retención Proyectada */}
                     <div className="w-full h-[220px] relative z-10">
                         {ebbinghausAnalysis.chartData.length > 0 ? (
                             <ResponsiveContainer width="100%" height="100%">
                                 <AreaChart data={ebbinghausAnalysis.chartData} margin={{ top: 12, right: 12, left: -22, bottom: 0 }}>
                                     <defs>
                                         <linearGradient id="colorRetentionAdv" x1="0" y1="0" x2="0" y2="1">
                                             <stop 
                                               offset="5%" 
                                               stopColor={
                                                 ebbinghausAnalysis.status === 'excelente' ? '#10b981' :
                                                 ebbinghausAnalysis.status === 'bueno' ? '#6366f1' :
                                                 ebbinghausAnalysis.status === 'atencion' ? '#f59e0b' : '#f43f5e'
                                               } 
                                               stopOpacity={0.45}
                                             />
                                             <stop 
                                               offset="95%" 
                                               stopColor={
                                                 ebbinghausAnalysis.status === 'excelente' ? '#10b981' :
                                                 ebbinghausAnalysis.status === 'bueno' ? '#6366f1' :
                                                 ebbinghausAnalysis.status === 'atencion' ? '#f59e0b' : '#f43f5e'
                                               } 
                                               stopOpacity={0.0}
                                             />
                                         </linearGradient>
                                     </defs>
                                     <XAxis 
                                       dataKey="label" 
                                       axisLine={false} 
                                       tickLine={false} 
                                       tick={{ fontSize: 10, fill: '#64748b', fontWeight: 700 }} 
                                       dy={10} 
                                     />
                                     <YAxis 
                                       width={40} 
                                       domain={[0, 100]} 
                                       axisLine={false} 
                                       tickLine={false} 
                                       tick={{ fontSize: 10, fill: '#64748b', fontWeight: 700 }} 
                                        tickFormatter={(val) => `${val}%`}
                                     />
                                     <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" strokeOpacity={0.8} />
                                     
                                     <Tooltip 
                                         content={({ active, payload }) => {
                                           if (active && payload && payload.length) {
                                             const d = payload[0].payload as any;
                                             return (
                                               <div className="bg-slate-900/95 border border-slate-700/80 backdrop-blur-xl p-3 rounded-xl shadow-2xl text-xs min-w-[200px]">
                                                 <div className="flex justify-between items-center border-b border-slate-800 pb-1.5 mb-1.5">
                                                   <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">{d.dateStr} ({d.label})</span>
                                                   {d.isToday && <span className="bg-indigo-500 text-white font-black text-[9px] px-1.5 py-0.5 rounded">HOY</span>}
                                                 </div>
                                                 <div className="flex items-center justify-between gap-3 my-1">
                                                   <span className="text-slate-300 font-medium">Retención estimada:</span>
                                                   <span className={cn(
                                                     "text-sm font-black font-serif", 
                                                     d.retention >= 80 ? "text-emerald-400" : d.retention >= 70 ? "text-amber-400" : "text-rose-400"
                                                   )}>
                                                     {d.retention}%
                                                   </span>
                                                 </div>
                                                 <div className="text-[10px] font-bold text-slate-400 pt-1 border-t border-slate-800/80">
                                                   {d.retention >= 85 ? "🟢 Consolidado en memoria a largo plazo" : 
                                                    d.retention >= 80 ? "🔵 En memoria segura (> 80%)" : 
                                                    d.retention >= 70 ? "🟡 Decaimiento sináptico activo" : 
                                                    "🔴 Olvido crítico: requiere repaso urgente"}
                                                 </div>
                                               </div>
                                             );
                                           }
                                           return null;
                                         }}
                                     />
                                     
                                     <ReferenceLine 
                                       y={80} 
                                       stroke="#f43f5e" 
                                       strokeDasharray="4 4" 
                                       strokeWidth={2} 
                                       label={{ 
                                         position: 'insideBottomLeft', 
                                         value: 'Umbral Crítico de Olvido (80%)', 
                                         fill: '#f43f5e', 
                                         fontSize: 10, 
                                         fontWeight: 800 
                                       }} 
                                     />

                                     {ebbinghausAnalysis.chartData.some(d => d.isToday) && (
                                       <ReferenceLine 
                                         x="Hoy" 
                                         stroke="#818cf8" 
                                         strokeDasharray="3 3" 
                                         strokeWidth={1.5} 
                                         label={{ 
                                           position: 'insideTop', 
                                           value: 'HOY', 
                                           fill: '#818cf8', 
                                           fontSize: 10, 
                                           fontWeight: 900 
                                         }} 
                                       />
                                     )}
                                     
                                     <Area 
                                       type="monotone" 
                                       dataKey="retention" 
                                       stroke={
                                         ebbinghausAnalysis.status === 'excelente' ? '#34d399' :
                                         ebbinghausAnalysis.status === 'bueno' ? '#818cf8' :
                                         ebbinghausAnalysis.status === 'atencion' ? '#fbbf24' : '#fb7185'
                                       } 
                                       strokeWidth={3} 
                                       fillOpacity={1} 
                                       fill="url(#colorRetentionAdv)" 
                                       activeDot={{ r: 5, fill: '#0f172a', stroke: '#818cf8', strokeWidth: 3 }} 
                                     />
                                 </AreaChart>
                             </ResponsiveContainer>
                         ) : (
                             <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500">
                                <BrainCircuit size={28} className="mb-2 opacity-30" />
                                <p className="text-xs font-bold uppercase tracking-wider">Registra tu primer estudio o repaso para calibrar la retención</p>
                             </div>
                         )}
                     </div>

                     {/* Desglose de Factores Calibrados (Horas, Dificultad, Cantos/Minutos/Nota, Refrescos) */}
                     {ebbinghausAnalysis.hasData && (
                       <div className="mt-4 pt-4 border-t border-slate-800/80 relative z-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                          {/* Factor 1: Horas de Estudio */}
                          <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/60 flex flex-col justify-between">
                             <div className="flex items-center justify-between mb-1.5">
                                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                                  <Clock size={12} className="text-indigo-400" /> Horas de Estudio
                                </span>
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300">
                                  {ebbinghausAnalysis.factors.studyHoursFactor}x
                                </span>
                             </div>
                             <div>
                                <h5 className="text-sm font-black text-white font-serif tracking-tight">
                                  {ebbinghausAnalysis.factors.studyHoursTotal}h dedicadas
                                </h5>
                                <p className="text-[10px] font-semibold text-slate-400 mt-0.5 leading-snug">
                                  {ebbinghausAnalysis.factors.studyHoursImpactLabel}
                                </p>
                             </div>
                          </div>

                          {/* Factor 2: Dificultad Evaluada */}
                          <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/60 flex flex-col justify-between">
                             <div className="flex items-center justify-between mb-1.5">
                                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                                  <Scale size={12} className="text-amber-400" /> Dificultad (1–10)
                                </span>
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
                                  {ebbinghausAnalysis.factors.difficultyFactor}x
                                </span>
                             </div>
                             <div>
                                <h5 className="text-sm font-black text-white font-serif tracking-tight">
                                  Nivel {ebbinghausAnalysis.factors.difficulty}/10
                                </h5>
                                <p className="text-[10px] font-semibold text-slate-400 mt-0.5 leading-snug">
                                  {ebbinghausAnalysis.factors.difficultyImpactLabel}
                                </p>
                             </div>
                          </div>

                          {/* Factor 3: Cante (Minutos y Calificación) */}
                          <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/60 flex flex-col justify-between">
                             <div className="flex items-center justify-between mb-1.5">
                                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                                  <Mic size={12} className="text-fuchsia-400" /> Cante (Minutos y Nota)
                                </span>
                                <span className={cn(
                                  "text-[9px] font-bold px-1.5 py-0.5 rounded",
                                  ebbinghausAnalysis.factors.cantosCount > 0 ? "bg-fuchsia-500/20 text-fuchsia-300" : "bg-slate-700 text-slate-400"
                                )}>
                                  {ebbinghausAnalysis.factors.cantosCount} {ebbinghausAnalysis.factors.cantosCount === 1 ? 'cante' : 'cantes'}
                                </span>
                             </div>
                             <div>
                                <div className="flex items-center justify-between gap-1">
                                  <h5 className="text-sm font-black text-white font-serif tracking-tight">
                                    {ebbinghausAnalysis.factors.lastCantoTotalMins !== null ? formatTimeMins(ebbinghausAnalysis.factors.lastCantoTotalMins) : 'Sin cante'}
                                  </h5>
                                  {ebbinghausAnalysis.factors.lastCantoGrade !== null && (
                                    <span className={cn(
                                      "text-xs font-black font-serif px-1.5 py-0.5 rounded",
                                      ebbinghausAnalysis.factors.lastCantoGrade >= 5 ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"
                                    )}>
                                      Nota: {ebbinghausAnalysis.factors.lastCantoGrade.toFixed(1)}
                                    </span>
                                  )}
                                </div>
                                <p className="text-[10px] font-semibold text-slate-400 mt-0.5 leading-snug">
                                  {ebbinghausAnalysis.factors.cantoSpeedImpactLabel}
                                </p>
                             </div>
                          </div>

                          {/* Factor 4: Refrescos y Repasos */}
                          <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/60 flex flex-col justify-between">
                             <div className="flex items-center justify-between mb-1.5">
                                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                                  <RefreshCw size={12} className="text-emerald-400" /> Refrescos y Vueltas
                                </span>
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                                  {ebbinghausAnalysis.factors.refrescosFactor}x
                                </span>
                             </div>
                             <div>
                                <h5 className="text-sm font-black text-white font-serif tracking-tight">
                                  {ebbinghausAnalysis.factors.refrescosCompleted}/3 Refrescos • Vuelta {ebbinghausAnalysis.factors.vueltas}
                                </h5>
                                <p className="text-[10px] font-semibold text-slate-400 mt-0.5 leading-snug">
                                  {ebbinghausAnalysis.factors.refrescosImpactLabel}
                                </p>
                             </div>
                          </div>
                       </div>
                     )}
                  </div>

                  {/* Curva de Dificultad Subjetiva */}
                 <div className="bg-white/90 backdrop-blur-2xl rounded-2xl sm:rounded-[2rem] p-4 sm:p-6 shadow-[0_8px_30px_rgb(0,0,0,0.03)] border border-slate-200/70 flex flex-col min-h-[260px] sm:min-h-[290px]">
                     <div className="mb-4 flex items-center justify-between">
                         <div>
                             <h3 className="text-xs font-black text-slate-900 flex items-center gap-2 uppercase tracking-wide">
                                 <TrendingUp size={15} className="text-indigo-600" /> Curva de Dificultad Subjetiva
                             </h3>
                             <p className="text-[11px] font-medium text-slate-400 mt-0.5">Percepción subjetiva a lo largo de las vueltas</p>
                         </div>
                         <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                           Escala 1–10
                         </span>
                     </div>
                     <div className="flex-1 w-full relative">
                         {diffChartData.length > 0 ? (
                             <ResponsiveContainer width="100%" height="100%">
                                 <AreaChart data={diffChartData} margin={{ top: 15, right: 10, left: -25, bottom: 0 }}>
                                 <defs>
                                     <linearGradient id="colorDiffCurv" x1="0" y1="0" x2="0" y2="1">
                                         <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.4}/>
                                         <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                                     </linearGradient>
                                 </defs>
                                 <XAxis dataKey="index" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 700 }} dy={10} />
                                 <YAxis width={30} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 700 }} domain={[0, 10]} />
                                 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" strokeOpacity={0.6} />
                                 <Tooltip 
                                     formatter={(value: any) => [`${value}/10`, 'Dificultad']}
                                     cursor={{ stroke: '#4f46e5', strokeWidth: 1.5, strokeDasharray: '4 4', opacity: 0.5 }}
                                     contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.1)', backgroundColor: 'rgba(255, 255, 255, 0.98)', backdropFilter: 'blur(12px)', padding: '10px 14px' }}
                                     itemStyle={{ fontWeight: 800, fontSize: '12px' }}
                                 />
                                 <ReferenceLine y={5} stroke="#cbd5e1" strokeDasharray="3 3" strokeWidth={1.5} label={{ position: 'insideTopLeft', value: 'Media (5)', fill: '#94a3b8', fontSize: 9, fontWeight: 700 }} />
                                 <Area type="monotone" dataKey="dificultad" stroke="#4f46e5" strokeWidth={3} fillOpacity={1} fill="url(#colorDiffCurv)" activeDot={{ r: 5, fill: '#fff', stroke: '#4f46e5', strokeWidth: 3 }} />
                                 </AreaChart>
                             </ResponsiveContainer>
                         ) : (
                             <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
                                <Activity size={28} className="mb-2 opacity-30" />
                                <p className="text-xs font-bold uppercase tracking-wider">Sin datos de dificultad</p>
                             </div>
                         )}
                     </div>
                 </div>

                {/* SECCIÓN PRO: EVOLUCIÓN DE CANTOS Y ESTADO DE TRIBUNAL DEL TEMA */}
                <div className="bg-white/80 backdrop-blur-2xl p-3 sm:p-5 lg:p-7 rounded-2xl sm:rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-slate-900/5 flex flex-col relative overflow-hidden group hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-300">
                    <div className="absolute -left-12 -bottom-12 w-64 h-64 bg-fuchsia-500/10 rounded-full blur-3xl pointer-events-none group-hover:scale-125 transition-transform duration-700"></div>
                    <div className="absolute -right-12 -top-12 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none group-hover:scale-125 transition-transform duration-700"></div>
                    
                    {/* Header & Controles de Rango Responsive */}
                    <div className="mb-3 sm:mb-6 relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-2.5 sm:gap-4 border-b border-slate-100 pb-3 sm:pb-5">
                        <div>
                            <div className="flex items-center gap-2.5 sm:gap-3">
                                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-fuchsia-500 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-fuchsia-500/20 shrink-0">
                                    <Mic size={18} className="sm:w-5 sm:h-5" />
                                </div>
                                <div>
                                    <h3 className="text-base sm:text-xl font-black text-slate-900 tracking-tight flex flex-wrap items-center gap-1.5 sm:gap-2">
                                        <span>Evolución de Cantos y Ritmo de Tribunal</span>
                                        <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-fuchsia-100 text-fuchsia-700 border border-fuchsia-200">
                                            {topicCantosAll.length} {topicCantosAll.length === 1 ? 'canto registrado' : 'cantos registrados'}
                                        </span>
                                    </h3>
                                    <p className="text-[11px] sm:text-sm text-slate-500 font-medium mt-0.5">
                                        Cronómetro oficial de tribunal (12–15 min) y progresión de notas en este tema
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Controles de Rango y Acciones Responsive */}
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto justify-start md:justify-end">
                            <div className="inline-flex items-center justify-between sm:justify-start bg-slate-100/90 p-0.5 sm:p-1 rounded-xl border border-slate-200/80 text-[11px] sm:text-xs font-bold text-slate-600">
                                <button
                                    onClick={() => setCantoTimeRange('all')}
                                    className={cn(
                                        "px-2 sm:px-3 py-1 rounded-lg transition-all flex-1 sm:flex-initial text-center",
                                        cantoTimeRange === 'all'
                                            ? "bg-white text-slate-900 shadow-sm font-black"
                                            : "hover:text-slate-900 text-slate-500"
                                    )}
                                >
                                    <span className="sm:hidden">Todos</span>
                                    <span className="hidden sm:inline">Toda la preparación</span>
                                </button>
                                <button
                                    onClick={() => setCantoTimeRange('10')}
                                    className={cn(
                                        "px-2 sm:px-3 py-1 rounded-lg transition-all flex-1 sm:flex-initial text-center",
                                        cantoTimeRange === '10'
                                            ? "bg-white text-slate-900 shadow-sm font-black"
                                            : "hover:text-slate-900 text-slate-500"
                                    )}
                                >
                                    <span className="sm:hidden">10</span>
                                    <span className="hidden sm:inline">Últimos 10</span>
                                </button>
                                <button
                                    onClick={() => setCantoTimeRange('5')}
                                    className={cn(
                                        "px-2 sm:px-3 py-1 rounded-lg transition-all flex-1 sm:flex-initial text-center",
                                        cantoTimeRange === '5'
                                            ? "bg-white text-slate-900 shadow-sm font-black"
                                            : "hover:text-slate-900 text-slate-500"
                                    )}
                                >
                                    <span className="sm:hidden">5</span>
                                    <span className="hidden sm:inline">Últimos 5</span>
                                </button>
                            </div>

                            <button
                                onClick={() => {
                                    setLogType("canto");
                                    setHasManuallyChangedType(true);
                                    toast.info("Formulario ajustado para registrar Canto");
                                }}
                                className="px-3 sm:px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black flex items-center justify-center gap-1.5 shadow-sm transition-all active:scale-95"
                            >
                                <Plus size={14} className="text-white" />
                                Registrar Canto
                            </button>
                        </div>
                    </div>

                    {/* Vitals Cards del Tema: Bento 2x2 en móvil / 4 columnas en desktop */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 lg:gap-4 mb-3 sm:mb-6 relative z-10">
                        {/* Card 1: Diagnóstico de Tribunal */}
                        <div className="bg-slate-50/80 border border-slate-100 rounded-xl sm:rounded-2xl p-2.5 sm:p-4 flex flex-col justify-between">
                            <div className="flex items-center justify-between gap-1 mb-1 sm:mb-2">
                                <span className="text-[9px] sm:text-[11px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                    <Activity size={12} className="text-fuchsia-500 shrink-0" />
                                    Diagnóstico
                                </span>
                                <span className={cn("text-[9px] sm:text-[10px] font-black px-1.5 py-0.5 rounded-full border truncate max-w-[80px] sm:max-w-none", topicCantosStats.badgeClass)}>
                                    {topicCantosStats.diagnostico}
                                </span>
                            </div>
                            <div>
                                <p className="text-[11px] sm:text-xs text-slate-600 font-medium leading-relaxed line-clamp-2 sm:line-clamp-none">
                                    {topicCantosStats.consejo}
                                </p>
                            </div>
                            {topicCantosStats.diasUltimoCanto !== null && (
                                <div className="mt-1 sm:mt-2 text-[9px] sm:text-[10px] font-bold text-slate-400">
                                    Último cante: {topicCantosStats.diasUltimoCanto === 0 ? 'hoy' : `hace ${topicCantosStats.diasUltimoCanto} ${topicCantosStats.diasUltimoCanto === 1 ? 'día' : 'días'}`}
                                </div>
                            )}
                        </div>

                        {/* Card 2: Calificación Media & Tendencia */}
                        <div className="bg-slate-50/80 border border-slate-100 rounded-xl sm:rounded-2xl p-2.5 sm:p-4 flex flex-col justify-between">
                            <span className="text-[9px] sm:text-[11px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1 mb-1 sm:mb-2">
                                <Target size={12} className="text-purple-500 shrink-0" />
                                Nota Media
                            </span>
                            <div className="flex items-baseline gap-1 sm:gap-1.5">
                                <span className={cn(
                                    "text-xl sm:text-2xl lg:text-3xl font-black tracking-tight",
                                    topicCantosStats.notaMedia >= 8 ? "text-emerald-600" :
                                    topicCantosStats.notaMedia >= 5 ? "text-slate-900" :
                                    topicCantosStats.notaMedia > 0 ? "text-rose-600" : "text-slate-400"
                                )}>
                                    {topicCantosStats.notaMediaStr}
                                </span>
                                <span className="text-[10px] sm:text-xs font-bold text-slate-400">/ 10</span>
                                {topicCantosStats.tendenciaNota !== 0 && (
                                    <span className={cn(
                                        "text-[9px] sm:text-[10px] font-black px-1.5 py-0.5 rounded-full ml-auto",
                                        topicCantosStats.tendenciaNota > 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                                    )}>
                                        {topicCantosStats.tendenciaNota > 0 ? `+${topicCantosStats.tendenciaNota}` : topicCantosStats.tendenciaNota}
                                    </span>
                                )}
                            </div>
                            <div className="mt-1 sm:mt-2 text-[9px] sm:text-[10px] font-bold text-slate-500 truncate">
                                Récord: {topicCantosStats.mejorNota !== null ? `${topicCantosStats.mejorNota.toFixed(1)}/10` : '—'}
                            </div>
                        </div>

                        {/* Card 3: Cronómetro y Ritmo de Exposición */}
                        <div className="bg-slate-50/80 border border-slate-100 rounded-xl sm:rounded-2xl p-2.5 sm:p-4 flex flex-col justify-between">
                            <span className="text-[9px] sm:text-[11px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1 mb-1 sm:mb-2">
                                <Clock size={12} className="text-emerald-500 shrink-0" />
                                Ritmo Exposición
                            </span>
                            <div className="flex items-baseline gap-1 sm:gap-1.5">
                                <span className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900 tracking-tight">
                                    {topicCantosStats.tiempoMedioStr}
                                </span>
                            </div>
                            <div className="mt-1 sm:mt-2 flex items-center justify-between text-[9px] sm:text-[10px] font-bold">
                                <span className="text-slate-500">En 11–13:40m:</span>
                                <span className={cn(
                                    "px-1.5 py-0.5 rounded font-black",
                                    topicCantosStats.porcentajeEnVentana >= 70 ? "bg-emerald-100 text-emerald-800" :
                                    topicCantosStats.porcentajeEnVentana >= 40 ? "bg-amber-100 text-amber-800" :
                                    "bg-slate-200 text-slate-700"
                                )}>
                                    {topicCantosStats.porcentajeEnVentana}%
                                </span>
                            </div>
                        </div>

                        {/* Card 4: Efectividad del Tribunal */}
                        <div className="bg-slate-50/80 border border-slate-100 rounded-xl sm:rounded-2xl p-2.5 sm:p-4 flex flex-col justify-between">
                            <span className="text-[9px] sm:text-[11px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1 mb-1 sm:mb-2">
                                <Award size={12} className="text-amber-500 shrink-0" />
                                Efectividad
                            </span>
                            <div className="flex items-baseline gap-1.5">
                                <span className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900 tracking-tight">
                                    {topicCantosAll.length > 0 ? `${topicCantosStats.aprobadosPorcentaje}%` : '—'}
                                </span>
                                <span className="text-[10px] sm:text-xs font-bold text-slate-400">aprobados</span>
                            </div>
                            <div className="mt-1 sm:mt-2 text-[9px] sm:text-[10px] font-bold text-slate-500 truncate" title="Para aprobar: nota ≥ 5.0 y duración entre 11:00 y 13:40 min">
                                Nota ≥ 5 en 11–13:40m
                            </div>
                        </div>
                    </div>

                    {/* Gráfico Dual Recharts de Alta Gama Responsive */}
                    <div className="w-full relative z-10">
                        {topicCantosChartData.length > 0 ? (
                            <>
                                {topicCantosChartData.length > 12 && (
                                    <div className="flex sm:hidden items-center justify-between text-[10px] font-bold text-slate-400 mb-1.5 px-0.5">
                                        <span>{topicCantosChartData.length} cantes</span>
                                        <span className="flex items-center gap-1 text-indigo-600 bg-indigo-50/90 border border-indigo-100 px-2 py-0.5 rounded-full font-black">
                                            Desliza para explorar →
                                        </span>
                                    </div>
                                )}
                                <div className="w-full overflow-x-auto no-scrollbar overscroll-x-contain">
                                    <div 
                                        className="h-[260px] sm:h-[320px]"
                                        style={{
                                            minWidth: topicCantosChartData.length > 12 ? `${Math.max(100, topicCantosChartData.length * 24)}px` : '100%',
                                            width: '100%'
                                        }}
                                    >
                                        <ResponsiveContainer width="100%" height="100%">
                                            <ComposedChart data={topicCantosChartData} margin={{ top: 15, right: 4, left: -22, bottom: 4 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" strokeOpacity={0.6} />
                                                
                                                <XAxis 
                                                    dataKey="displayX" 
                                                    axisLine={false} 
                                                    tickLine={false} 
                                                    tick={{ fontSize: 9, fill: '#64748b', fontWeight: 700 }} 
                                                    dy={6} 
                                                />
                                                
                                                {/* Eje Izquierdo: Tiempo en minutos */}
                                                <YAxis 
                                                    yAxisId="left" 
                                                    axisLine={false} 
                                                    tickLine={false} 
                                                    unit="m"
                                                    width={26}
                                                    domain={[0, (dataMax: number) => Math.max(18, Math.ceil((dataMax || 15) + 2))]}
                                                    tick={{ fontSize: 9, fill: '#64748b', fontWeight: 700 }} 
                                                />
                                                
                                                {/* Eje Derecho: Calificación de 0 a 10 */}
                                                <YAxis 
                                                    yAxisId="right" 
                                                    orientation="right" 
                                                    domain={[0, 10]} 
                                                    ticks={[0, 2.5, 5, 7.5, 10]}
                                                    axisLine={false} 
                                                    tickLine={false} 
                                                    width={22}
                                                    tick={{ fontSize: 9, fill: '#8b5cf6', fontWeight: 700 }} 
                                                />
                                                {/* Línea de Referencia Máximo Oficial Aprobado (13:40 min = 13.67 min) */}
                                                <ReferenceLine 
                                                    yAxisId="left" 
                                                    y={13.67} 
                                                    stroke="#f43f5e" 
                                                    strokeDasharray="4 4" 
                                                    strokeWidth={1.5}
                                                    label={{ value: 'Máx. 13:40 (Suspenso)', position: 'insideTopLeft', fill: '#e11d48', fontSize: 9, fontWeight: 800 }} 
                                                />
                                                {/* Línea de Referencia Mínimo Oficial (11:00 min) */}
                                                <ReferenceLine 
                                                    yAxisId="left" 
                                                    y={11} 
                                                    stroke="#10b981" 
                                                    strokeDasharray="4 4" 
                                                    strokeWidth={1.5}
                                                    label={{ value: 'Mín. 11:00', position: 'insideBottomLeft', fill: '#059669', fontSize: 9, fontWeight: 800 }} 
                                                />
                                                {/* Línea de Referencia Aprobado (5.0) */}
                                                <ReferenceLine 
                                                    yAxisId="right" 
                                                    y={5} 
                                                    stroke="#8b5cf6" 
                                                    strokeDasharray="3 3" 
                                                    strokeWidth={1.5} 
                                                    strokeOpacity={0.6}
                                                    label={{ position: 'insideBottomRight', value: 'Aprobado (5.0)', fill: '#7c3aed', fontSize: 9, fontWeight: 800 }} 
                                                />
                                                {/* Línea de Referencia Meta (8.0) */}
                                                <ReferenceLine 
                                                    yAxisId="right" 
                                                    y={8} 
                                                    stroke="#10b981" 
                                                    strokeDasharray="3 3" 
                                                    strokeWidth={1.5} 
                                                    label={{ position: 'insideTopRight', value: 'Meta (8.0)', fill: '#10b981', fontSize: 9, fontWeight: 800 }} 
                                                />
                                                <Tooltip 
                                                    cursor={{ fill: 'rgba(241, 245, 249, 0.6)' }}
                                                    content={({ active, payload }) => {
                                                        if (active && payload && payload.length) {
                                                            const data = payload[0].payload;
                                                            return (
                                                                <div className="bg-white/95 backdrop-blur-md p-3.5 rounded-2xl shadow-xl border border-slate-200/90 text-slate-800 text-xs min-w-[220px] max-w-[280px] z-50 animate-in fade-in duration-150">
                                                                    <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-slate-100">
                                                                        <span className="font-black text-slate-900 text-sm">
                                                                            Canto #{data.cantoNum}
                                                                        </span>
                                                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                                                            {data.fecha}
                                                                        </span>
                                                                    </div>
                                                                    <div className="space-y-1.5">
                                                                        <div className="flex items-center justify-between">
                                                                            <span className="text-slate-500 font-medium flex items-center gap-1">
                                                                                <Clock size={12} className="text-emerald-500" />
                                                                                Tiempo:
                                                                            </span>
                                                                            <div className="flex items-center gap-1.5">
                                                                                <span className="font-black text-slate-900">{data.duracionStr}</span>
                                                                                <span className={cn(
                                                                                    "text-[9px] font-black px-1.5 py-0.5 rounded-md border",
                                                                                    data.isOptimal ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                                                                                    data.isExcess ? "bg-rose-50 text-rose-700 border-rose-200" :
                                                                                    "bg-amber-50 text-amber-700 border-amber-200"
                                                                                )}>
                                                                                    {data.isOptimal ? "11:00–13:40m (Válido)" : data.isExcess ? ">13:40m (Exceso/Suspenso)" : "<11m (Breve)"}
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex items-center justify-between">
                                                                            <span className="text-slate-500 font-medium flex items-center gap-1">
                                                                                <Target size={12} className="text-purple-500" />
                                                                                Calificación:
                                                                            </span>
                                                                            <div className="flex items-center gap-1.5">
                                                                                {data.nota !== null ? (
                                                                                    <span className={cn(
                                                                                        "font-black px-2 py-0.5 rounded-lg text-[11px]",
                                                                                        data.nota >= 8 ? "bg-emerald-100 text-emerald-800" :
                                                                                        data.nota >= 5 ? "bg-blue-100 text-blue-800" :
                                                                                        "bg-rose-100 text-rose-800"
                                                                                    )}>
                                                                                        {data.nota.toFixed(1)} / 10
                                                                                    </span>
                                                                                ) : (
                                                                                    <span className="text-slate-400 italic">Sin nota</span>
                                                                                )}
                                                                                {data.nota !== null && (
                                                                                    <span className={cn(
                                                                                        "text-[9px] font-black px-1.5 py-0.5 rounded-md border",
                                                                                        data.estadoCanteClass
                                                                                    )}>
                                                                                        {data.estadoCante}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                        {data.mistakes && (
                                                                            <div className="mt-2 pt-2 border-t border-slate-100 text-slate-600">
                                                                                <span className="text-[10px] font-bold text-rose-500 uppercase tracking-wider block mb-0.5">Fallos / Observaciones:</span>
                                                                                <p className="text-[11px] leading-relaxed italic bg-rose-50/50 p-1.5 rounded-lg border border-rose-100">
                                                                                    {data.mistakes}
                                                                                </p>
                                                                            </div>
                                                                        )}
                                                                        {data.notes && !data.mistakes && (
                                                                            <div className="mt-2 pt-2 border-t border-slate-100 text-slate-500 text-[11px] italic">
                                                                                "{data.notes}"
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            );
                                                        }
                                                        return null;
                                                    }}
                                                />
                                                {/* Barras de duración con colores semánticos por celda */}
                                                <Bar yAxisId="left" dataKey="duracion" radius={[4, 4, 0, 0]} barSize={topicCantosChartData.length > 20 ? 10 : topicCantosChartData.length > 10 ? 14 : 20}>
                                                    {topicCantosChartData.map((entry: any, index: number) => (
                                                        <Cell key={`cell-${index}`} fill={entry.barColor} fillOpacity={0.85} />
                                                    ))}
                                                </Bar>
                                                {/* Línea de Calificación con dots */}
                                                <Line 
                                                    yAxisId="right"
                                                    type="monotone"
                                                    dataKey="nota"
                                                    stroke="#8b5cf6"
                                                    strokeWidth={2.5}
                                                    dot={{ r: topicCantosChartData.length > 25 ? 2.5 : 3.5, fill: '#fff', stroke: '#8b5cf6', strokeWidth: 2 }}
                                                    activeDot={{ r: 6, fill: '#8b5cf6', stroke: '#fff', strokeWidth: 2 }}
                                                />
                                            </ComposedChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="w-full h-full min-h-[220px] flex flex-col items-center justify-center text-center p-6 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                                <div className="w-12 h-12 rounded-2xl bg-fuchsia-50 border border-fuchsia-200/60 flex items-center justify-center text-fuchsia-600 mb-3 shadow-sm">
                                    <Mic size={22} />
                                </div>
                                <h4 className="text-sm font-black text-slate-800 mb-1">
                                    Sin Cantos Registrados en este Tema
                                </h4>
                                <p className="text-xs text-slate-500 max-w-md mb-4 leading-relaxed font-medium">
                                    El tribunal evalúa tiempo (ventana oficial 11:00–13:40 minutos) y calificación literal. Registra tu primera exposición para calibrar tu ritmo oral.
                                </p>
                                <button
                                    onClick={() => {
                                        setLogType("canto");
                                        setHasManuallyChangedType(true);
                                        toast.info("Formulario ajustado para registrar Canto");
                                    }}
                                    className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-black hover:bg-slate-800 transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
                                >
                                    <Plus size={14} /> Registrar Primer Canto
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Leyenda y Explicación de Ventanas Responsive */}
                    <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 sm:gap-3 text-[10px] sm:text-[11px] font-bold text-slate-500">
                        <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                            <span className="flex items-center gap-1 sm:gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block"></span>
                                <span>Válido (11:00–13:40m)</span>
                            </span>
                            <span className="flex items-center gap-1 sm:gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-sm bg-rose-500 inline-block"></span>
                                <span>Exceso (&gt;13:40m ➔ Suspenso)</span>
                            </span>
                            <span className="flex items-center gap-1 sm:gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block"></span>
                                <span>Breve (&lt;11m)</span>
                            </span>
                            <span className="flex items-center gap-1 sm:gap-1.5 text-purple-600">
                                <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-purple-500 inline-block ring-2 ring-white"></span>
                                <span>Calificación (≥5.0 para aprobar)</span>
                            </span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-semibold">
                            Regla Tribunal: 11:00 a 13:40m (Más de 13:40 es suspenso)
                        </span>
                    </div>

                     {/* Historial Detallado de Cantos del Tema */}
                     {topicCantosAll.length > 0 && (
                         <div className="mt-6 pt-5 border-t border-slate-100">
                             <div className="flex items-center justify-between mb-3">
                                 <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                                     <History size={13} className="text-slate-500" />
                                     Historial de Exposiciones de este Tema
                                 </h4>
                                 <span className="text-[10px] font-bold text-slate-400">
                                     {topicCantosAll.length} registros
                                 </span>
                             </div>
                             <div className="space-y-2 max-h-[220px] overflow-y-auto no-scrollbar pr-1">
                                 {topicCantosAll.slice().reverse().map((canto, idx) => {
                                     const originalNum = topicCantosAll.length - idx;
                                     const durSecs = (canto.duration || 0) * 60 + (canto.cantoSeconds || 0);
                                     const isOptimal = durSecs >= 660 && durSecs <= 820;
                                     const isExcess = durSecs > 820;
                                     const isBrief = durSecs > 0 && durSecs < 660;
                                     const durStr = `${canto.duration || 0}m${canto.cantoSeconds ? ` ${canto.cantoSeconds}s` : ''}`;

                                     const hasGrade = typeof canto.cantoGrade === 'number';
                                     const isApproved = hasGrade && (canto.cantoGrade as number) >= 5 && isOptimal;

                                     return (
                                         <div 
                                             key={canto.id} 
                                             className="p-3 rounded-xl bg-slate-50/70 border border-slate-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:bg-slate-50 transition-all text-xs"
                                         >
                                             <div className="flex items-center gap-2.5 min-w-0">
                                                 <span className="w-6 h-6 rounded-lg bg-white border border-slate-200 text-[10px] font-black text-slate-600 flex items-center justify-center shrink-0 shadow-xs">
                                                     #{originalNum}
                                                 </span>
                                                 <span className="text-[11px] font-bold text-slate-500 shrink-0">
                                                     {canto.date}
                                                 </span>
                                                 <span className="font-black text-slate-800">
                                                     {durStr}
                                                 </span>
                                                 <span className={cn(
                                                     "text-[9px] font-black px-1.5 py-0.5 rounded border shrink-0",
                                                     isOptimal ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                                                     isExcess ? "bg-rose-50 text-rose-700 border-rose-200 font-extrabold" :
                                                     "bg-amber-50 text-amber-700 border-amber-200"
                                                 )}>
                                                     {isOptimal ? "11–13:40m" : isExcess ? ">13:40 Exceso" : "<11m Breve"}
                                                 </span>
                                             </div>

                                             <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0">
                                                 {hasGrade ? (
                                                     <div className="flex items-center gap-1.5">
                                                         <span className={cn(
                                                             "font-black px-2 py-0.5 rounded-lg text-xs",
                                                             (canto.cantoGrade as number) >= 8 ? "bg-emerald-100 text-emerald-800" :
                                                             (canto.cantoGrade as number) >= 5 ? "bg-blue-100 text-blue-800" :
                                                             "bg-rose-100 text-rose-800"
                                                         )}>
                                                             {(canto.cantoGrade as number).toFixed(1)} / 10
                                                         </span>
                                                         <span className={cn(
                                                             "text-[9px] font-black px-1.5 py-0.5 rounded border",
                                                             isApproved ? "bg-emerald-100 text-emerald-800 border-emerald-300" :
                                                             isExcess ? "bg-rose-100 text-rose-800 border-rose-300" :
                                                             isBrief ? "bg-amber-100 text-amber-800 border-amber-300" :
                                                             "bg-rose-100 text-rose-800 border-rose-300"
                                                         )}>
                                                             {isApproved ? "Aprobado" : isExcess ? "Suspenso (>13:40)" : isBrief ? "Suspenso (<11m)" : "Suspenso"}
                                                         </span>
                                                     </div>
                                                 ) : (
                                                     <span className="text-slate-400 italic text-[11px]">Sin nota</span>
                                                 )}
                                                 {canto.mistakes && (
                                                     <span className="text-[10px] font-bold text-rose-600 max-w-[200px] truncate" title={canto.mistakes}>
                                                         ⚠️ {canto.mistakes}
                                                     </span>
                                                 )}
                                             </div>
                                         </div>
                                     );
                                 })}
                             </div>
                         </div>
                     )}
                 </div>

                 {/* Apple Timeline: Historial de Actividad */}
                 <div className="bg-white/90 backdrop-blur-2xl rounded-[2rem] p-6 sm:p-7 shadow-[0_8px_30px_rgb(0,0,0,0.03)] border border-slate-200/70">
                     <div className="flex items-center justify-between mb-6">
                       <h3 className="text-sm font-black text-slate-900 flex items-center gap-2 uppercase tracking-wide">
                           <History size={16} className="text-slate-600" />
                           Historial de Sesiones del Tema
                       </h3>
                       <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full">
                         {sessions.length} registros
                       </span>
                     </div>
                     
                     <div className="space-y-3">
                        {groupedSessions.length === 0 ? (
                            <div className="py-12 text-center text-slate-400">
                                <History size={32} className="mx-auto mb-2 opacity-25" />
                                <p className="text-xs font-bold uppercase tracking-wider">Sin sesiones registradas</p>
                            </div>
                        ) : (
                            groupedSessions.map((session) => {
                                const renderItem = (subSession: any, isSubItem = false) => {
                                    const isRefresco = subSession.type === "refresco";
                                    const isEstudio = subSession.type === "estudio_inicial";
                                    const isCanto = subSession.type === "canto";
                                    const isSimulacro = subSession.type === "simulacro";
                                    
                                    return (
                                        <div 
                                          key={subSession.id} 
                                          className={cn(
                                            "relative group transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl border",
                                            isSubItem 
                                              ? "bg-slate-50/50 border-slate-100" 
                                              : "bg-white hover:border-slate-300 border-slate-200/70 shadow-sm"
                                          )}
                                        >
                                            <div className="flex items-center gap-3.5">
                                                <div className={cn(
                                                    "w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border",
                                                    isRefresco ? "bg-emerald-50 text-emerald-700 border-emerald-200/60" :
                                                    isEstudio ? "bg-blue-50 text-blue-700 border-blue-200/60" :
                                                    isCanto ? "bg-amber-50 text-amber-700 border-amber-200/60" :
                                                    isSimulacro ? "bg-rose-50 text-rose-700 border-rose-200/60" :
                                                    "bg-indigo-50 text-indigo-700 border-indigo-200/60"
                                                )}>
                                                    {isRefresco ? <Clock size={16} /> :
                                                     isEstudio ? <BookOpen size={16} /> :
                                                     isCanto ? <Mic size={16} /> :
                                                     isSimulacro ? <Target size={16} /> :
                                                     <History size={16} />}
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                      <h4 className="font-black text-slate-900 capitalize text-xs">
                                                          {subSession.type.replace("_", " ")}
                                                      </h4>
                                                      {subSession.completesVuelta && (
                                                        <span className="text-[9px] font-black text-emerald-700 bg-emerald-50 px-2 py-0.2 rounded-full border border-emerald-200/50">
                                                          Vuelta
                                                        </span>
                                                      )}
                                                      {typeof subSession.cantoGrade === 'number' && (
                                                        <span className="text-[10px] font-black text-indigo-700 bg-indigo-50 px-2 py-0.2 rounded-full border border-indigo-200/50">
                                                          Nota: {subSession.cantoGrade}/10
                                                        </span>
                                                      )}
                                                    </div>
                                                    <div className="flex items-center gap-2 font-semibold text-slate-400 mt-1 text-[11px]">
                                                        <span>{safeParseDate(subSession.date).toLocaleDateString("es-ES", { year: "numeric", month: "short", day: "2-digit" })}</span>
                                                        <span>•</span>
                                                        <span>{subSession.duration} min</span>
                                                        {subSession.difficulty && (
                                                            <>
                                                              <span>•</span>
                                                              <span className="font-bold text-slate-600">Dif. {subSession.difficulty}/10</span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Notes / Mistakes if any */}
                                            {(subSession.notes || subSession.mistakes) && (
                                              <div className="text-[11px] font-medium text-slate-600 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100 max-w-sm">
                                                {subSession.notes && <p className="italic">"{subSession.notes}"</p>}
                                                {subSession.mistakes && <p className="text-rose-600 font-bold mt-0.5">Fallos: {subSession.mistakes}</p>}
                                              </div>
                                            )}

                                            {!isSubItem && (
                                              <div className="flex items-center justify-end gap-1 shrink-0">
                                                  <button 
                                                    onClick={() => setSessionToDelete(session.id)} 
                                                    className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                                                    title="Eliminar sesión"
                                                  >
                                                      <Trash2 size={15} />
                                                  </button>
                                              </div>
                                            )}
                                            
                                            {/* Inline Delete Confirmation */}
                                            {!isSubItem && (
                                              <AnimatePresence>
                                                  {sessionToDelete === session.id && (
                                                      <motion.div 
                                                        initial={{ opacity: 0 }} 
                                                        animate={{ opacity: 1 }} 
                                                        exit={{ opacity: 0 }} 
                                                        className="absolute inset-0 bg-white/95 backdrop-blur-sm rounded-2xl border border-rose-200 flex items-center justify-between px-5 z-10"
                                                      >
                                                          <span className="text-xs font-black text-slate-800">¿Eliminar registro de sesión?</span>
                                                          <div className="flex items-center gap-2">
                                                              <button onClick={() => setSessionToDelete(null)} className="px-3 py-1 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancelar</button>
                                                              <button onClick={() => deleteSessionHandler(session.originalIds)} className="px-3 py-1 text-xs font-black text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors shadow-sm">Eliminar</button>
                                                          </div>
                                                      </motion.div>
                                                  )}
                                              </AnimatePresence>
                                            )}
                                        </div>
                                    );
                                };

                                if (session.subSessions && session.subSessions.length > 1) {
                                    return (
                                        <div key={session.id} className="relative group bg-slate-50/70 border border-slate-200/80 rounded-2xl p-3 shadow-sm">
                                            <div className="flex items-center justify-between px-2 pt-1 pb-3">
                                                <div className="flex items-center gap-2">
                                                   <Layers size={14} className="text-indigo-600" />
                                                   <h4 className="text-xs font-black text-indigo-950 uppercase tracking-wider">Ciclo Parcial Acumulado</h4>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <span className="text-xs font-bold text-slate-600">{session.duration} min totales</span>
                                                    <button onClick={() => setSessionToDelete(session.id)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                            
                                            <div className="space-y-2 relative pl-2">
                                                {[...session.subSessions].reverse().map(sub => renderItem(sub, true))}
                                            </div>
                                            
                                            <AnimatePresence>
                                                {sessionToDelete === session.id && (
                                                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-white/95 backdrop-blur-sm rounded-2xl border border-rose-200 flex flex-col items-center justify-center z-20">
                                                        <span className="text-xs font-black text-slate-800 mb-2">¿Eliminar este ciclo de {session.subSessions.length} sesiones?</span>
                                                        <div className="flex items-center gap-3">
                                                            <button onClick={() => setSessionToDelete(null)} className="px-3 py-1 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">Cancelar</button>
                                                            <button onClick={() => deleteSessionHandler(session.originalIds)} className="px-3 py-1 text-xs font-black text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors shadow-sm">Eliminar Todo</button>
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    );
                                }

                                return renderItem(session, false);
                            })
                        )}
                     </div>
                 </div>
              </div>
           </div>
        </div>
      </motion.div>
    </div>
  );
}
