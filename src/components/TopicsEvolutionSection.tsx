import { useState, useMemo } from "react";
import { Topic, Subject } from "../types";
import { initialSubjects } from "../data/initialData";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
  Line,
  ComposedChart,
  Area,
  AreaChart,
} from "recharts";
import {
  BookOpen,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Zap,
  ArrowRight,
  Filter,
  Search,
  Sparkles,
  Layers,
  ChevronDown,
  ChevronUp,
  Flame,
  Minus,
  Timer,
  SlidersHorizontal,
  X,
  Calendar,
  Eye,
  FileText,
} from "lucide-react";
import { cn } from "../lib/utils";
import { TopicProgressData } from "../lib/prediction";
import { calculateTopicCycle, TopicCycleInfo } from "../lib/oposicionCycle";
import { motion, AnimatePresence } from "motion/react";

interface TopicsEvolutionSectionProps {
  topics: Topic[];
  userProgress: Record<string, TopicProgressData>;
  rawSessions: any[];
  onSelectTopic?: (topicId: string) => void;
}

export function TopicsEvolutionSection({
  topics,
  userProgress,
  rawSessions,
  onSelectTopic,
}: TopicsEvolutionSectionProps) {
  // Filtros interactivos
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>("all");
  const [rankingFilter, setRankingFilter] = useState<
    "metodo_preparador" | "en_refrescos" | "listos_canto" | "repaso_pendiente" | "dificiles" | "mejorados" | "tiempo" | "dominados" | "todos"
  >("metodo_preparador");
  const [searchTerm, setSearchTerm] = useState("");
  const [activeMetricTab, setActiveMetricTab] = useState<"metodo_preparador" | "aceleracion" | "materias" | "tendencia">("metodo_preparador");
  const [inspectingTopicId, setInspectingTopicId] = useState<string | null>(null);

  // Normalización y cálculo de telemetría por cada tema
  const analyzedTopics = useMemo(() => {
    return topics.map((topic) => {
      const prog = userProgress[topic.id];
      // Sesiones de estudio (excluyendo cantos y simulacros orales)
      const studySessions = (rawSessions || [])
        .filter((s) => s.topicId === topic.id && s.type !== "canto" && s.type !== "simulacro")
        .sort((a, b) => {
          const dateCmp = (a.date || "").localeCompare(b.date || "");
          if (dateCmp !== 0) return dateCmp;
          const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt || 0);
          const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt || 0);
          return timeA - timeB;
        });

      const hasStudied = !!(prog?.firstStudyDate || studySessions.length > 0);

      // Primera sesión de estudio
      const firstSession = studySessions[0];
      const lastSession = studySessions[studySessions.length - 1];

      // Dificultad inicial registrada (de la primera sesión, o metadata del tema)
      const initialDifficulty = firstSession?.difficulty ?? topic.difficulty ?? (prog?.difficulty || 5);
      
      // Dificultad actual / última registrada
      const currentDifficulty = prog?.difficulty ?? lastSession?.difficulty ?? initialDifficulty;
      
      // Variación de dificultad (negativo = mejoró/redujo dificultad; positivo = aumentó dificultad)
      const difficultyDelta = hasStudied ? currentDifficulty - initialDifficulty : 0;

      // Tiempo total invertido
      const totalMinutesFromSessions = studySessions.reduce(
        (acc, s) => acc + (s.durationMinutes || s.duration || 0),
        0
      );
      const totalMinutes =
        totalMinutesFromSessions > 0
          ? totalMinutesFromSessions
          : Math.round((prog?.studyTimeHours || 0) * 60);

      // Tiempo de primer estudio (1ª vuelta)
      const firstStudySessions = studySessions.filter((s) => s.type === "estudio_inicial");
      const firstStudyMinutes =
        firstStudySessions.length > 0
          ? firstStudySessions.reduce((acc, s) => acc + (s.durationMinutes || s.duration || 0), 0)
          : firstSession
          ? (firstSession.durationMinutes || firstSession.duration || 0)
          : totalMinutes > 0 && !studySessions.length
          ? totalMinutes
          : 0;

      // Sesiones de repaso o refresco
      const reviewSessions = studySessions.filter(
        (s) => s.type === "repaso" || s.type === "refresco" || (s !== firstSession && s.type !== "estudio_inicial")
      );
      const reviewMinutesTotal = reviewSessions.reduce(
        (acc, s) => acc + (s.durationMinutes || s.duration || 0),
        0
      );
      const avgReviewMinutes =
        reviewSessions.length > 0 ? Math.round(reviewMinutesTotal / reviewSessions.length) : 0;

      // Reducción porcentual de tiempo de repaso vs primer estudio
      const timeReductionPct =
        firstStudyMinutes > 0 && avgReviewMinutes > 0
          ? Math.round(((firstStudyMinutes - avgReviewMinutes) / firstStudyMinutes) * 100)
          : 0;

      // Vueltas dadas
      const vueltas = prog?.vueltas ?? Math.max(hasStudied ? 1 : 0, studySessions.filter((s) => s.completesVuelta).length);

      // Clasificación de estado
      let status: "sin_estudiar" | "dificil" | "muy_mejorado" | "dominado" | "en_progreso" = "sin_estudiar";
      if (!hasStudied) {
        status = "sin_estudiar";
      } else if (currentDifficulty >= 8) {
        status = "dificil";
      } else if (difficultyDelta <= -2) {
        status = "muy_mejorado";
      } else if (currentDifficulty <= 4 && vueltas >= 2) {
        status = "dominado";
      } else {
        status = "en_progreso";
      }

      const subject = initialSubjects.find((s) => s.id === topic.subjectId);

      // Metodología oficial del Preparador: 3 refrescos + cante + repaso mensual (~30d)
      const cycleInfo: TopicCycleInfo = calculateTopicCycle(topic.id, prog, rawSessions);

      return {
        id: topic.id,
        number: topic.number,
        title: topic.title,
        subjectId: topic.subjectId,
        subjectName: subject?.name || topic.subjectId,
        subjectColor: subject?.color || "bg-slate-500",
        hasStudied,
        firstStudyDate: prog?.firstStudyDate || firstSession?.date || null,
        lastReviewDate: prog?.lastReviewDate || lastSession?.date || null,
        initialDifficulty,
        currentDifficulty,
        difficultyDelta,
        totalMinutes,
        firstStudyMinutes,
        reviewSessionsCount: reviewSessions.length,
        avgReviewMinutes,
        timeReductionPct,
        vueltas: cycleInfo.vueltas,
        sessionsCount: studySessions.length,
        sessions: studySessions,
        status,
        cycleInfo,
      };
    });
  }, [topics, userProgress, rawSessions]);

  // Temas estudiados filtrados
  const studiedTopics = useMemo(() => {
    return analyzedTopics.filter((t) => t.hasStudied);
  }, [analyzedTopics]);

  // ============================================================================
  // MÉTRICAS Y PIPELINE OFICIAL DEL PREPARADOR
  // ============================================================================
  const preparadorPipeline = useMemo(() => {
    const sinIniciar = analyzedTopics.filter((t) => t.cycleInfo.phase === 'sin_iniciar');
    const enRefrescos = analyzedTopics.filter((t) => t.cycleInfo.phase === 'en_refrescos');
    const listosCantar = analyzedTopics.filter((t) => t.cycleInfo.phase === 'listo_para_cantar');
    const consolidadoMes = analyzedTopics.filter((t) => t.cycleInfo.phase === 'consolidado_mes');
    const repasoPendiente = analyzedTopics.filter((t) => t.cycleInfo.phase === 'repaso_pendiente');
    const repasoVencido = analyzedTopics.filter((t) => t.cycleInfo.phase === 'repaso_vencido');

    // Tiempos reales en cada una de las fases del método del preparador
    const initialStudyTimes: number[] = [];
    const refresco1Times: number[] = [];
    const refresco2Times: number[] = [];
    const refresco3Times: number[] = [];
    const cantosTimes: number[] = [];
    const monthlyReviewTimes: number[] = [];

    (rawSessions || []).forEach((s) => {
      const duration = s.durationMinutes || s.duration || 0;
      if (duration <= 0) return;

      if (s.type === 'estudio_inicial' || s.type === 'primer_estudio') {
        initialStudyTimes.push(duration);
      } else if (s.type === 'canto') {
        cantosTimes.push(duration);
      } else if (s.type === 'repaso') {
        monthlyReviewTimes.push(duration);
      }
    });

    // Desglose de los 3 refrescos por orden en el historial de cada tema
    analyzedTopics.forEach((t) => {
      const topicRefrescos = (rawSessions || [])
        .filter((s) => s.topicId === t.id && s.type === 'refresco')
        .sort((a, b) => (a.date || "").localeCompare(b.date || ""));

      if (topicRefrescos[0]) refresco1Times.push(topicRefrescos[0].durationMinutes || topicRefrescos[0].duration || 0);
      if (topicRefrescos[1]) refresco2Times.push(topicRefrescos[1].durationMinutes || topicRefrescos[1].duration || 0);
      if (topicRefrescos[2]) refresco3Times.push(topicRefrescos[2].durationMinutes || topicRefrescos[2].duration || 0);
    });

    const avgInitial = initialStudyTimes.length > 0
      ? Math.round(initialStudyTimes.reduce((a, b) => a + b, 0) / initialStudyTimes.length)
      : 240;

    const avgR1 = refresco1Times.length > 0
      ? Math.round(refresco1Times.reduce((a, b) => a + b, 0) / refresco1Times.length)
      : Math.round(avgInitial * 0.22); // ~50 min

    const avgR2 = refresco2Times.length > 0
      ? Math.round(refresco2Times.reduce((a, b) => a + b, 0) / refresco2Times.length)
      : Math.round(avgR1 * 0.75); // ~38 min

    const avgR3 = refresco3Times.length > 0
      ? Math.round(refresco3Times.reduce((a, b) => a + b, 0) / refresco3Times.length)
      : Math.round(avgR2 * 0.75); // ~28 min

    const avgCanto = cantosTimes.length > 0
      ? Math.round(cantosTimes.reduce((a, b) => a + b, 0) / cantosTimes.length)
      : 15;

    const avgMonthlyReview = monthlyReviewTimes.length > 0
      ? Math.round(monthlyReviewTimes.reduce((a, b) => a + b, 0) / monthlyReviewTimes.length)
      : Math.round(avgInitial * 0.35); // ~85 min

    const cycleBreakdownChart = [
      {
        etapa: "Estudio Inicial",
        sublabel: "Fijación profunda",
        minutos: avgInitial,
        horas: (avgInitial / 60).toFixed(1),
        muestras: initialStudyTimes.length,
        color: "#6366f1",
      },
      {
        etapa: "Refresco D1",
        sublabel: "Leer + Intentar cantar",
        minutos: avgR1,
        horas: (avgR1 / 60).toFixed(1),
        muestras: refresco1Times.length,
        color: "#f59e0b",
      },
      {
        etapa: "Refresco D2",
        sublabel: "Afianzar y fluidez",
        minutos: avgR2,
        horas: (avgR2 / 60).toFixed(1),
        muestras: refresco2Times.length,
        color: "#d97706",
      },
      {
        etapa: "Refresco D3",
        sublabel: "Último pulido oral",
        minutos: avgR3,
        horas: (avgR3 / 60).toFixed(1),
        muestras: refresco3Times.length,
        color: "#b45309",
      },
      {
        etapa: "Canto Oficial",
        sublabel: "Examen preparador",
        minutos: avgCanto,
        horas: (avgCanto / 60).toFixed(1),
        muestras: cantosTimes.length,
        color: "#c026d3",
      },
      {
        etapa: "Repaso Mensual",
        sublabel: "Vuelta periódica (~30d)",
        minutos: avgMonthlyReview,
        horas: (avgMonthlyReview / 60).toFixed(1),
        muestras: monthlyReviewTimes.length,
        color: "#10b981",
      },
    ];

    return {
      sinIniciar,
      enRefrescos,
      listosCantar,
      consolidadoMes,
      repasoPendiente,
      repasoVencido,
      totalTemas: analyzedTopics.length,
      cycleBreakdownChart,
      avgInitialMins: avgInitial,
      avgRefresco1Mins: avgR1,
      avgRefresco3Mins: avgR3,
      refrescoSavingPct: avgInitial > 0 ? Math.round(((avgInitial - avgR3) / avgInitial) * 100) : 85,
    };
  }, [analyzedTopics, rawSessions]);

  // ============================================================================
  // MÉTRICAS GLOBALES DE ESTUDIO Y APRENDIZAJE
  // ============================================================================
  const vitals = useMemo(() => {
    const studiedCount = studiedTopics.length;
    if (studiedCount === 0) {
      return {
        studiedCount: 0,
        avgNewTopicHours: 0,
        avgNewTopicMinutesFormatted: "—",
        avgReviewMinutesFormatted: "—",
        globalTimeReductionPct: 0,
        improvedTopicsCount: 0,
        improvedPct: 0,
        avgDifficultyDrop: 0,
        initialAvgDiff: 0,
        currentAvgDiff: 0,
        hardTopicsCount: 0,
        masteredTopicsCount: 0,
      };
    }

    // Tiempo medio tema nuevo (1er estudio)
    const validFirstStudies = studiedTopics.filter((t) => t.firstStudyMinutes > 0);
    const totalNewTopicMinutes = validFirstStudies.reduce((acc, t) => acc + t.firstStudyMinutes, 0);
    const avgNewTopicMins = validFirstStudies.length > 0 ? totalNewTopicMinutes / validFirstStudies.length : 0;
    const newHours = Math.floor(avgNewTopicMins / 60);
    const newMins = Math.round(avgNewTopicMins % 60);
    const avgNewTopicMinutesFormatted = `${newHours}h ${newMins}m`;

    // Tiempo medio de repaso
    const validReviews = studiedTopics.filter((t) => t.avgReviewMinutes > 0);
    const totalReviewMinutes = validReviews.reduce((acc, t) => acc + t.avgReviewMinutes, 0);
    const avgReviewMins = validReviews.length > 0 ? totalReviewMinutes / validReviews.length : 0;
    const revHours = Math.floor(avgReviewMins / 60);
    const revMins = Math.round(avgReviewMins % 60);
    const avgReviewMinutesFormatted = revHours > 0 ? `${revHours}h ${revMins}m` : `${revMins}m`;

    // Reducción porcentual global
    const globalTimeReductionPct =
      avgNewTopicMins > 0 && avgReviewMins > 0
        ? Math.round(((avgNewTopicMins - avgReviewMins) / avgNewTopicMins) * 100)
        : 0;

    // Temas que han mejorado de dificultad
    const improvedTopics = studiedTopics.filter((t) => t.difficultyDelta < 0);
    const improvedTopicsCount = improvedTopics.length;
    const improvedPct = Math.round((improvedTopicsCount / studiedCount) * 100);

    const totalDrop = improvedTopics.reduce((acc, t) => acc + Math.abs(t.difficultyDelta), 0);
    const avgDifficultyDrop = improvedTopicsCount > 0 ? (totalDrop / improvedTopicsCount).toFixed(1) : "0.0";

    // Medias de dificultad inicial vs actual
    const initialAvgDiff = (
      studiedTopics.reduce((acc, t) => acc + t.initialDifficulty, 0) / studiedCount
    ).toFixed(1);
    const currentAvgDiff = (
      studiedTopics.reduce((acc, t) => acc + t.currentDifficulty, 0) / studiedCount
    ).toFixed(1);

    // Temas difíciles vs dominados
    const hardTopicsCount = studiedTopics.filter((t) => t.currentDifficulty >= 8).length;
    const masteredTopicsCount = studiedTopics.filter((t) => t.currentDifficulty <= 4 && t.vueltas >= 2).length;

    return {
      studiedCount,
      avgNewTopicHours: avgNewTopicMins / 60,
      avgNewTopicMinutesFormatted,
      avgReviewMinutesFormatted,
      globalTimeReductionPct,
      improvedTopicsCount,
      improvedPct,
      avgDifficultyDrop,
      initialAvgDiff,
      currentAvgDiff,
      hardTopicsCount,
      masteredTopicsCount,
    };
  }, [studiedTopics]);

  // ============================================================================
  // GRÁFICA 1: CURVA DE ACELERACIÓN Y REDUCCIÓN DE TIEMPO POR VUELTA
  // ============================================================================
  const accelerationCurveData = useMemo(() => {
    // Calculamos los promedios reales por vuelta según el historial de sesiones de cada tema
    const vuelta1Times: number[] = [];
    const vuelta2Times: number[] = [];
    const vuelta3Times: number[] = [];
    const vuelta4PlusTimes: number[] = [];

    studiedTopics.forEach((t) => {
      if (t.sessions && t.sessions.length > 0) {
        if (t.sessions[0]) vuelta1Times.push(t.sessions[0].durationMinutes || t.sessions[0].duration || 0);
        if (t.sessions[1]) vuelta2Times.push(t.sessions[1].durationMinutes || t.sessions[1].duration || 0);
        if (t.sessions[2]) vuelta3Times.push(t.sessions[2].durationMinutes || t.sessions[2].duration || 0);
        if (t.sessions.length >= 4) {
          t.sessions.slice(3).forEach((s: any) => {
            vuelta4PlusTimes.push(s.durationMinutes || s.duration || 0);
          });
        }
      } else if (t.firstStudyMinutes > 0) {
        vuelta1Times.push(t.firstStudyMinutes);
      }
    });

    const avgV1 = vuelta1Times.length > 0 ? vuelta1Times.reduce((a, b) => a + b, 0) / vuelta1Times.length : 240;
    const avgV2 = vuelta2Times.length > 0 ? vuelta2Times.reduce((a, b) => a + b, 0) / vuelta2Times.length : avgV1 * 0.55;
    const avgV3 = vuelta3Times.length > 0 ? vuelta3Times.reduce((a, b) => a + b, 0) / vuelta3Times.length : avgV2 * 0.65;
    const avgV4 = vuelta4PlusTimes.length > 0 ? vuelta4PlusTimes.reduce((a, b) => a + b, 0) / vuelta4PlusTimes.length : avgV3 * 0.7;

    const baseMin = Math.max(1, avgV1);

    return [
      {
        fase: "1ª Vuelta",
        sublabel: "Estudio Nuevo",
        minutos: Math.round(avgV1),
        horas: (avgV1 / 60).toFixed(1),
        ahorroPct: 0,
        muestras: vuelta1Times.length,
        color: "#6366f1",
      },
      {
        fase: "2ª Vuelta",
        sublabel: "Primer Repaso",
        minutos: Math.round(avgV2),
        horas: (avgV2 / 60).toFixed(1),
        ahorroPct: Math.max(0, Math.round(((baseMin - avgV2) / baseMin) * 100)),
        muestras: vuelta2Times.length,
        color: "#3b82f6",
      },
      {
        fase: "3ª Vuelta",
        sublabel: "Segundo Repaso",
        minutos: Math.round(avgV3),
        horas: (avgV3 / 60).toFixed(1),
        ahorroPct: Math.max(0, Math.round(((baseMin - avgV3) / baseMin) * 100)),
        muestras: vuelta3Times.length,
        color: "#10b981",
      },
      {
        fase: "4ª+ Vuelta",
        sublabel: "Consolidación / Refresco",
        minutos: Math.round(avgV4),
        horas: (avgV4 / 60).toFixed(1),
        ahorroPct: Math.max(0, Math.round(((baseMin - avgV4) / baseMin) * 100)),
        muestras: vuelta4PlusTimes.length,
        color: "#8b5cf6",
      },
    ];
  }, [studiedTopics]);

  // ============================================================================
  // GRÁFICA 2: TIEMPO MEDIO DE TEMA NUEVO POR ASIGNATURA
  // ============================================================================
  const subjectTimeComparisonData = useMemo(() => {
    return initialSubjects.map((subj) => {
      const subjTopics = analyzedTopics.filter((t) => t.subjectId === subj.id);
      const subjStudied = subjTopics.filter((t) => t.hasStudied);
      const studiedFirstTime = subjStudied.filter((t) => t.firstStudyMinutes > 0);

      const totalFirstTimeMinutes = studiedFirstTime.reduce((acc, t) => acc + t.firstStudyMinutes, 0);
      const avgMinutes =
        studiedFirstTime.length > 0 ? totalFirstTimeMinutes / studiedFirstTime.length : 0;

      const avgHours = Math.round((avgMinutes / 60) * 10) / 10;
      const unstudiedCount = subj.totalTopics - subjStudied.length;
      const estimatedRemainingHours = Math.round(unstudiedCount * (avgHours > 0 ? avgHours : 4.0));

      return {
        id: subj.id,
        name: subj.name,
        shortName: subj.name.replace("Derecho ", ""),
        totalTopics: subj.totalTopics,
        studiedCount: subjStudied.length,
        unstudiedCount,
        avgMinutes: Math.round(avgMinutes),
        avgHours,
        estimatedRemainingHours,
        color: subj.color,
      };
    });
  }, [analyzedTopics]);

  // ============================================================================
  // GRÁFICA 3: HISTÓRICO DE TENDENCIA DE EFICIENCIA
  // ============================================================================
  const efficiencyTimelineData = useMemo(() => {
    // Agrupar sesiones de estudio y refresco cronológicamente
    const studySessionsOnly = (rawSessions || [])
      .filter((s) => s.type !== "canto" && s.type !== "simulacro" && s.date)
      .sort((a, b) => (a.date || "").localeCompare(b.date || ""));

    if (studySessionsOnly.length === 0) return [];

    // Detección de rango temporal para granularidad adaptativa
    const uniqueDates = Array.from(new Set(studySessionsOnly.map((s) => s.date.slice(0, 10))));
    const uniqueMonths = new Set(uniqueDates.map((d) => d.slice(0, 7)));

    // Granularidad: Días (si pocos días o 1 mes), Semanas (si 2-3 meses) o Meses (si histórico largo)
    const isDaily = uniqueMonths.size <= 1 || uniqueDates.length <= 14;
    const isWeekly = !isDaily && uniqueMonths.size <= 3;

    const buckets: Record<string, { totalMins: number; totalDiff: number; count: number; label: string }> = {};

    studySessionsOnly.forEach((s) => {
      const d = s.date.slice(0, 10);
      let bucketKey = d.slice(0, 7);
      let bucketLabel = d.slice(0, 7);

      if (isDaily) {
        bucketKey = d;
        const parts = d.split("-");
        bucketLabel = parts.length === 3 ? `${parts[2]}/${parts[1]}` : d;
      } else if (isWeekly) {
        const parts = d.split("-");
        const day = parts.length === 3 ? parseInt(parts[2], 10) : 1;
        const weekNum = Math.min(4, Math.ceil(day / 7));
        bucketKey = `${d.slice(0, 7)}-W${weekNum}`;
        const monthNum = parts.length === 3 ? parseInt(parts[1], 10) : 1;
        const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
        bucketLabel = `S${weekNum} ${monthNames[monthNum - 1] || ""}`;
      } else {
        const parts = d.split("-");
        const monthNum = parts.length >= 2 ? parseInt(parts[1], 10) : 1;
        const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
        bucketLabel = `${monthNames[monthNum - 1] || ""} ${parts[0]?.slice(2) || ""}`;
      }

      if (!buckets[bucketKey]) {
        buckets[bucketKey] = { totalMins: 0, totalDiff: 0, count: 0, label: bucketLabel };
      }
      buckets[bucketKey].totalMins += s.durationMinutes || s.duration || 0;
      if (typeof s.difficulty === "number" && s.difficulty > 0) {
        buckets[bucketKey].totalDiff += s.difficulty;
      }
      buckets[bucketKey].count += 1;
    });

    return Object.entries(buckets).map(([key, data]) => {
      const avgMins = Math.round(data.totalMins / data.count);
      const avgDiff = data.count > 0 && data.totalDiff > 0 ? (data.totalDiff / data.count).toFixed(1) : null;
      return {
        key,
        periodo: data.label,
        tiempoMedioMin: avgMins,
        tiempoMedioHoras: (avgMins / 60).toFixed(1),
        dificultadMedia: avgDiff ? parseFloat(avgDiff) : 5,
        sesiones: data.count,
      };
    });
  }, [rawSessions]);

  // ============================================================================
  // RANKING Y MATRIZ FILTRADA DE TEMAS
  // ============================================================================
  const filteredRankedTopics = useMemo(() => {
    let list = [...analyzedTopics];

    // Filtro por materia
    if (selectedSubjectFilter !== "all") {
      list = list.filter((t) => t.subjectId === selectedSubjectFilter);
    }

    // Filtro por término de búsqueda (número o título)
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      list = list.filter(
        (t) =>
          t.number.toString().includes(term) ||
          t.title.toLowerCase().includes(term) ||
          t.subjectName.toLowerCase().includes(term)
      );
    }

    // Filtro y ordenación por categoría analítica
    switch (rankingFilter) {
      case "metodo_preparador": {
        // Orden de prioridad del preparador:
        // 1. Repasos vencidos (urgente antes del cante)
        // 2. Listos para cantar
        // 3. En refrescos diarios (3 días)
        // 4. Repasos pendientes del mes
        // 5. Consolidados al día
        // 6. Sin iniciar
        const priorityOrder: Record<string, number> = {
          repaso_vencido: 1,
          listo_para_cantar: 2,
          en_refrescos: 3,
          repaso_pendiente: 4,
          consolidado_mes: 5,
          sin_iniciar: 6,
        };
        list.sort((a, b) => {
          const pA = priorityOrder[a.cycleInfo.phase] || 99;
          const pB = priorityOrder[b.cycleInfo.phase] || 99;
          if (pA !== pB) return pA - pB;
          // Dentro de la misma fase, ordenar por días para el repaso o dificultad
          return a.cycleInfo.daysUntilMonthlyReview - b.cycleInfo.daysUntilMonthlyReview;
        });
        break;
      }

      case "en_refrescos":
        list = list
          .filter((t) => t.cycleInfo.phase === "en_refrescos")
          .sort((a, b) => b.cycleInfo.refrescosCount - a.cycleInfo.refrescosCount);
        break;

      case "listos_canto":
        list = list
          .filter((t) => t.cycleInfo.phase === "listo_para_cantar")
          .sort((a, b) => (b.firstStudyMinutes || 0) - (a.firstStudyMinutes || 0));
        break;

      case "repaso_pendiente":
        list = list
          .filter((t) => t.cycleInfo.phase === "repaso_pendiente" || t.cycleInfo.phase === "repaso_vencido")
          .sort((a, b) => a.cycleInfo.daysUntilMonthlyReview - b.cycleInfo.daysUntilMonthlyReview);
        break;

      case "dificiles":
        // Primero los que tienen mayor dificultad actual, luego por dificultad inicial
        list = list
          .filter((t) => t.hasStudied)
          .sort((a, b) => {
            if (b.currentDifficulty !== a.currentDifficulty) {
              return b.currentDifficulty - a.currentDifficulty;
            }
            return b.initialDifficulty - a.initialDifficulty;
          });
        break;

      case "mejorados":
        // Los que más han reducido su dificultad (difficultyDelta más negativo)
        list = list
          .filter((t) => t.hasStudied && t.difficultyDelta < 0)
          .sort((a, b) => a.difficultyDelta - b.difficultyDelta);
        break;

      case "tiempo":
        // Los temas con más horas acumuladas de estudio
        list = list
          .filter((t) => t.hasStudied)
          .sort((a, b) => b.totalMinutes - a.totalMinutes);
        break;

      case "dominados":
        // Dificultad baja y vueltas >= 2
        list = list
          .filter((t) => t.hasStudied && t.currentDifficulty <= 4)
          .sort((a, b) => b.vueltas - a.vueltas);
        break;

      case "atascados":
        // Dificultad alta (>= 7) tras al menos 2 sesiones de estudio
        list = list
          .filter((t) => t.hasStudied && t.currentDifficulty >= 7 && t.sessionsCount >= 2)
          .sort((a, b) => b.currentDifficulty - a.currentDifficulty);
        break;

      case "todos":
      default:
        // Todos los estudiados por número de tema
        list = list.filter((t) => t.hasStudied).sort((a, b) => a.number - b.number);
        break;
    }

    return list;
  }, [analyzedTopics, selectedSubjectFilter, searchTerm, rankingFilter]);

  // Tema seleccionado para modal de historial detallado
  const inspectingTopic = useMemo(() => {
    if (!inspectingTopicId) return null;
    return analyzedTopics.find((t) => t.id === inspectingTopicId) || null;
  }, [inspectingTopicId, analyzedTopics]);

  return (
    <div className="space-y-6">
      {/* SECCIÓN PRINCIPAL: EVOLUCIÓN DE TEMAS Y DINÁMICA DE ESTUDIO */}
      <div className="bg-white/80 backdrop-blur-2xl p-6 lg:p-8 rounded-[2.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-slate-900/5 flex flex-col relative overflow-hidden group hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-300">
        {/* Glow de fondo sofisticado */}
        <div className="absolute -left-12 -bottom-12 w-72 h-72 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none group-hover:scale-125 transition-transform duration-700"></div>
        <div className="absolute -right-12 -top-12 w-72 h-72 bg-blue-500/10 rounded-full blur-3xl pointer-events-none group-hover:scale-125 transition-transform duration-700"></div>

        {/* Cabecera del Módulo */}
        <div className="mb-6 relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-100 pb-5">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-600 flex items-center justify-center text-white shadow-md shadow-indigo-600/20">
              <BookOpen size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-black text-slate-900 tracking-tight">
                  Evolución del Temario & Rendimiento de Estudio
                </h3>
                <span className="text-xs font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                  {vitals.studiedCount} temas analizados
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
                Curva de aprendizaje, aceleración de tiempos de repaso y seguimiento de dificultad tema a tema
              </p>
            </div>
          </div>

          {/* Selector de Materia para todo el bloque */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <select
                value={selectedSubjectFilter}
                onChange={(e) => setSelectedSubjectFilter(e.target.value)}
                className="appearance-none bg-white border border-slate-200 text-slate-800 text-xs font-bold rounded-xl px-3.5 py-2 pr-8 shadow-sm hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
              >
                <option value="all">Todas las materias</option>
                {initialSubjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={14}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
            </div>
          </div>
        </div>

        {/* 1. VITALS / DIAGNÓSTICO TELEMÉTRICO BENTO GRID */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4 mb-6 relative z-10">
          {/* Card 1: Tiempo Medio de Tema Nuevo */}
          <div className="bg-slate-50/80 border border-slate-200/70 rounded-2xl p-4.5 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[11px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Clock size={13} className="text-indigo-600" />
                Tema Nuevo (1ª Vuelta)
              </span>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                Media Real
              </span>
            </div>
            <div>
              <div className="flex items-baseline gap-1.5">
                <h4 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                  {vitals.avgNewTopicMinutesFormatted}
                </h4>
              </div>
              <p className="text-[11px] text-slate-500 font-medium mt-1 leading-tight">
                Tiempo de asimilación inicial y preparación del tema
              </p>
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-200/50 flex items-center justify-between text-[10px] font-bold text-slate-400">
              <span>{vitals.studiedCount} temas iniciados</span>
              <span className="text-indigo-600">Ritmo base</span>
            </div>
          </div>

          {/* Card 2: Tiempo Medio de Repaso & Aceleración */}
          <div className="bg-slate-50/80 border border-slate-200/70 rounded-2xl p-4.5 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[11px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Zap size={13} className="text-blue-600" />
                Tiempo de Repaso
              </span>
              {vitals.globalTimeReductionPct > 0 && (
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-0.5">
                  <TrendingDown size={11} strokeWidth={3} />
                  -{vitals.globalTimeReductionPct}%
                </span>
              )}
            </div>
            <div>
              <div className="flex items-baseline gap-1.5">
                <h4 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                  {vitals.avgReviewMinutesFormatted}
                </h4>
              </div>
              <p className="text-[11px] text-slate-500 font-medium mt-1 leading-tight">
                Aceleración promedio en vueltas sucesivas
              </p>
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-200/50 flex items-center justify-between text-[10px] font-bold text-slate-400">
              <span>Ahorro: ~{Math.max(0, Math.round((vitals.avgNewTopicHours - 1.3) * 10) / 10)}h / tema</span>
              <span className="text-emerald-600 font-black">Alta Retención</span>
            </div>
          </div>

          {/* Card 3: Evolución de Dificultad */}
          <div className="bg-slate-50/80 border border-slate-200/70 rounded-2xl p-4.5 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[11px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <TrendingDown size={13} className="text-emerald-600" />
                Tasa de Mejora
              </span>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                {vitals.improvedPct}% mejorados
              </span>
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-xl sm:text-2xl font-black text-slate-400 line-through">
                  {vitals.initialAvgDiff}
                </span>
                <ArrowRight size={14} className="text-slate-400" />
                <span className="text-2xl sm:text-3xl font-black text-emerald-600 tracking-tight">
                  {vitals.currentAvgDiff}
                </span>
                <span className="text-xs font-bold text-slate-400">/ 10</span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium mt-1 leading-tight">
                {vitals.improvedTopicsCount} temas han reducido dificultad (media -{vitals.avgDifficultyDrop} pts)
              </p>
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-200/50 flex items-center justify-between text-[10px] font-bold text-slate-400">
              <span>{vitals.masteredTopicsCount} dominados</span>
              <span className="text-slate-600 font-black">Escala 1-10</span>
            </div>
          </div>

          {/* Card 4: Alerta Temprana & Focos Rojos */}
          <div className="bg-slate-50/80 border border-slate-200/70 rounded-2xl p-4.5 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[11px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle size={13} className="text-amber-500" />
                Temas en Foco
              </span>
              <span className={cn(
                "text-[10px] font-black px-2 py-0.5 rounded-full border",
                vitals.hardTopicsCount > 0
                  ? "bg-amber-50 text-amber-700 border-amber-200"
                  : "bg-emerald-50 text-emerald-700 border-emerald-200"
              )}>
                {vitals.hardTopicsCount > 0 ? `${vitals.hardTopicsCount} difíciles` : "Sin alertas"}
              </span>
            </div>
            <div>
              <div className="flex items-baseline gap-1.5">
                <h4 className={cn(
                  "text-2xl sm:text-3xl font-black tracking-tight",
                  vitals.hardTopicsCount > 0 ? "text-amber-600" : "text-emerald-600"
                )}>
                  {vitals.hardTopicsCount}
                </h4>
                <span className="text-xs font-bold text-slate-400">temas (dif ≥ 8)</span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium mt-1 leading-tight">
                Prioridad para repaso espaciado y refuerzo de esquemas
              </p>
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-200/50 flex items-center justify-between text-[10px] font-bold text-slate-400">
              <span>{studiedTopics.filter(t => t.vueltas >= 3).length} en 3ª+ vuelta</span>
              <span className="text-indigo-600 font-black">Auto-optimizado</span>
            </div>
          </div>
        </div>

        {/* 2. SELECTOR DE VISOR ANALÍTICO DE GRÁFICAS */}
        <div className="mb-4 relative z-10 flex flex-wrap items-center justify-between gap-3 bg-slate-50/80 p-1.5 rounded-2xl border border-slate-200/60">
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setActiveMetricTab("metodo_preparador")}
              className={cn(
                "px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 whitespace-nowrap",
                activeMetricTab === "metodo_preparador"
                  ? "bg-white text-slate-900 shadow-sm border border-slate-200/80"
                  : "text-slate-500 hover:text-slate-800"
              )}
            >
              <Sparkles size={14} className="text-amber-500" />
              Método Preparador (3 Refrescos & Vueltas)
            </button>
            <button
              onClick={() => setActiveMetricTab("aceleracion")}
              className={cn(
                "px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 whitespace-nowrap",
                activeMetricTab === "aceleracion"
                  ? "bg-white text-slate-900 shadow-sm border border-slate-200/80"
                  : "text-slate-500 hover:text-slate-800"
              )}
            >
              <TrendingDown size={14} className="text-indigo-600" />
              Curva de Aceleración
            </button>
            <button
              onClick={() => setActiveMetricTab("materias")}
              className={cn(
                "px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 whitespace-nowrap",
                activeMetricTab === "materias"
                  ? "bg-white text-slate-900 shadow-sm border border-slate-200/80"
                  : "text-slate-500 hover:text-slate-800"
              )}
            >
              <Clock size={14} className="text-blue-600" />
              Tema Nuevo por Materia
            </button>
            <button
              onClick={() => setActiveMetricTab("tendencia")}
              className={cn(
                "px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 whitespace-nowrap",
                activeMetricTab === "tendencia"
                  ? "bg-white text-slate-900 shadow-sm border border-slate-200/80"
                  : "text-slate-500 hover:text-slate-800"
              )}
            >
              <Layers size={14} className="text-emerald-600" />
              Histórico de Eficiencia
            </button>
          </div>
          <span className="text-[11px] font-bold text-slate-400 px-3 hidden lg:inline-block">
            Protocolo: Estudio ➔ 3 Refrescos ➔ Cante ➔ Repaso Mensual (~30d)
          </span>
        </div>

        {/* 3. CONTENEDOR DE GRÁFICA DINÁMICA */}
        <div className="w-full min-h-[320px] relative z-10 bg-white rounded-2xl p-4 border border-slate-100 shadow-inner mb-6">
          {activeMetricTab === "metodo_preparador" && (
            <div className="w-full h-full flex flex-col space-y-3">
              {/* Pipeline Cards: Embudo del Preparador */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/60 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-[10px] font-black uppercase text-slate-400">
                    <span>1. Estudio Inicial</span>
                    <BookOpen size={13} className="text-indigo-600" />
                  </div>
                  <div className="mt-2">
                    <span className="text-xl font-black text-slate-900">{preparadorPipeline.sinIniciar.length}</span>
                    <span className="text-[10px] font-bold text-slate-400 ml-1">temas nuevos pendientes</span>
                  </div>
                  <p className="text-[10px] font-medium text-slate-500 mt-1">Fijación en profundidad</p>
                </div>

                <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200/70 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-[10px] font-black uppercase text-amber-700">
                    <span>2. Ciclo 3 Refrescos</span>
                    <Flame size={13} className="text-amber-600" />
                  </div>
                  <div className="mt-2">
                    <span className="text-xl font-black text-amber-900">{preparadorPipeline.enRefrescos.length}</span>
                    <span className="text-[10px] font-bold text-amber-700 ml-1">en 3 días seguidos</span>
                  </div>
                  <p className="text-[10px] font-medium text-amber-800 mt-1">Lectura + intento de canto</p>
                </div>

                <div className="p-3 bg-fuchsia-50/60 rounded-xl border border-fuchsia-200/70 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-[10px] font-black uppercase text-fuchsia-700">
                    <span>3. Listos p/ Cantar</span>
                    <CheckCircle2 size={13} className="text-fuchsia-600" />
                  </div>
                  <div className="mt-2">
                    <span className="text-xl font-black text-fuchsia-900">{preparadorPipeline.listosCantar.length}</span>
                    <span className="text-[10px] font-bold text-fuchsia-700 ml-1">3/3 completados</span>
                  </div>
                  <p className="text-[10px] font-medium text-fuchsia-800 mt-1">Examen ante preparador (V1)</p>
                </div>

                <div className="p-3 bg-indigo-50/60 rounded-xl border border-indigo-200/70 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-[10px] font-black uppercase text-indigo-700">
                    <span>4. Repaso Mensual</span>
                    <Calendar size={13} className="text-indigo-600" />
                  </div>
                  <div className="mt-2">
                    <span className="text-xl font-black text-indigo-900">
                      {preparadorPipeline.repasoPendiente.length + preparadorPipeline.repasoVencido.length}
                    </span>
                    <span className="text-[10px] font-bold text-indigo-700 ml-1">en fecha (~30d)</span>
                  </div>
                  <p className="text-[10px] font-medium text-indigo-800 mt-1">
                    {preparadorPipeline.consolidadoMes.length} al día / {preparadorPipeline.repasoVencido.length} vencidos
                  </p>
                </div>
              </div>

              {/* Sub-header de la gráfica */}
              <div className="flex justify-between items-center px-1 pt-1">
                <span className="text-xs font-black text-slate-700">
                  Desglose de Tiempo del Método (Estudio Inicial ➔ 3 Refrescos Consecutivos ➔ Canto ➔ Repaso Mensual)
                </span>
                <span className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200/60 px-2 py-0.5 rounded-full">
                  Ahorro en Refresco 3: -{preparadorPipeline.refrescoSavingPct}% vs estudio inicial
                </span>
              </div>

              {/* Gráfico de barras del ciclo del preparador */}
              <div className="w-full h-52 min-h-[200px] mt-1">
                <ResponsiveContainer width="100%" height="100%" minHeight={190}>
                  <BarChart data={preparadorPipeline.cycleBreakdownChart} margin={{ top: 10, right: 15, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis
                      dataKey="etapa"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: "#334155", fontWeight: 800 }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: "#64748b" }}
                      unit="m"
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(241, 245, 249, 0.6)" }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl border border-slate-800 text-xs">
                              <p className="font-black text-amber-400">{data.etapa}</p>
                              <p className="text-[11px] text-slate-300 mb-1.5">{data.sublabel}</p>
                              <div className="space-y-1 font-bold">
                                <div className="flex justify-between gap-4">
                                  <span className="text-slate-400">Tiempo medio:</span>
                                  <span className="text-white">{data.minutos} min ({data.horas}h)</span>
                                </div>
                                <div className="flex justify-between gap-4">
                                  <span className="text-slate-400">Muestras registradas:</span>
                                  <span className="text-white">{data.muestras} sesiones</span>
                                </div>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="minutos" radius={[8, 8, 0, 0]} barSize={36}>
                      {preparadorPipeline.cycleBreakdownChart.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {activeMetricTab === "aceleracion" && (
            <div className="w-full h-full flex flex-col">
              <div className="flex justify-between items-center mb-2 px-2">
                <span className="text-xs font-black text-slate-700">
                  Evolución del tiempo medio por vuelta (Curva de aprendizaje)
                </span>
                <span className="text-[11px] font-bold text-indigo-600">
                  Mayor reducción: 1ª vuelta ➔ 2ª vuelta (-{accelerationCurveData[1]?.ahorroPct || 0}%)
                </span>
              </div>
              <div className="w-full h-72 min-h-[280px] mt-2">
                <ResponsiveContainer width="100%" height="100%" minHeight={260}>
                  <BarChart data={accelerationCurveData} margin={{ top: 15, right: 20, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis
                      dataKey="fase"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fill: "#475569", fontWeight: 700 }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fill: "#64748b", fontWeight: 600 }}
                      unit=" min"
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(241, 245, 249, 0.6)" }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-slate-900 text-white p-3.5 rounded-2xl shadow-xl border border-slate-800 text-xs">
                              <p className="font-black text-sm text-indigo-300">{data.fase}</p>
                              <p className="text-[11px] text-slate-400 mb-2">{data.sublabel}</p>
                              <div className="space-y-1 font-bold">
                                <div className="flex justify-between gap-4">
                                  <span className="text-slate-400">Tiempo medio:</span>
                                  <span className="text-white">{data.horas} horas ({data.minutos} min)</span>
                                </div>
                                {data.ahorroPct > 0 && (
                                  <div className="flex justify-between gap-4 text-emerald-400">
                                    <span>Ahorro respecto a 1ª vuelta:</span>
                                    <span>-{data.ahorroPct}%</span>
                                  </div>
                                )}
                                <div className="flex justify-between gap-4 text-slate-400 text-[10px] pt-1 border-t border-slate-800">
                                  <span>Muestras registradas:</span>
                                  <span>{data.muestras} sesiones</span>
                                </div>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="minutos" radius={[8, 8, 0, 0]} barSize={44}>
                      {accelerationCurveData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {activeMetricTab === "materias" && (
            <div className="w-full h-full flex flex-col">
              <div className="flex justify-between items-center mb-2 px-2">
                <span className="text-xs font-black text-slate-700">
                  Tiempo medio de tema nuevo según la rama del Derecho (Horas / tema)
                </span>
                <span className="text-[11px] font-bold text-blue-600">
                  Referencia para estimar las vueltas restantes
                </span>
              </div>
              <div className="w-full h-80 min-h-[300px] mt-2">
                <ResponsiveContainer width="100%" height="100%" minHeight={280}>
                  <BarChart
                    data={subjectTimeComparisonData}
                    layout="vertical"
                    margin={{ top: 10, right: 30, left: 60, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                    <XAxis
                      type="number"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: "#64748b" }}
                      unit="h"
                    />
                    <YAxis
                      dataKey="shortName"
                      type="category"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fill: "#1e293b", fontWeight: 700 }}
                      width={110}
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(241, 245, 249, 0.6)" }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-slate-900 text-white p-3.5 rounded-2xl shadow-xl border border-slate-800 text-xs">
                              <p className="font-black text-sm text-blue-300">{data.name}</p>
                              <div className="space-y-1 font-bold mt-2">
                                <div className="flex justify-between gap-4">
                                  <span className="text-slate-400">Media tema nuevo:</span>
                                  <span className="text-white">{data.avgHours > 0 ? `${data.avgHours} horas` : "Estimado ~4.0h"}</span>
                                </div>
                                <div className="flex justify-between gap-4">
                                  <span className="text-slate-400">Temas estudiados:</span>
                                  <span>{data.studiedCount} de {data.totalTopics}</span>
                                </div>
                                <div className="flex justify-between gap-4 text-amber-400 pt-1 border-t border-slate-800">
                                  <span>Pendiente para 1ª vuelta:</span>
                                  <span>~{data.estimatedRemainingHours} horas ({data.unstudiedCount} temas)</span>
                                </div>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="avgHours" fill="#3b82f6" radius={[0, 8, 8, 0]} barSize={18}>
                      {subjectTimeComparisonData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={index % 2 === 0 ? "#6366f1" : "#3b82f6"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {activeMetricTab === "tendencia" && (
            <div className="w-full h-full flex flex-col">
              <div className="flex justify-between items-center mb-2 px-2">
                <span className="text-xs font-black text-slate-700">
                  Evolución temporal del tiempo medio y dificultad por sesión
                </span>
                <span className="text-[11px] font-bold text-emerald-600">
                  La técnica y retención aceleran tu velocidad
                </span>
              </div>
              <div className="w-full h-72 min-h-[280px] mt-2">
                {efficiencyTimelineData.length > 0 ? (
                  <div className="w-full h-full flex flex-col">
                    {efficiencyTimelineData.length === 1 && (
                      <div className="mb-2 px-3 py-1.5 rounded-lg bg-indigo-50/70 border border-indigo-100 flex items-center justify-between text-[11px]">
                        <span className="font-bold text-indigo-900">
                          📍 {efficiencyTimelineData[0].periodo}: {efficiencyTimelineData[0].tiempoMedioMin} min de media ({efficiencyTimelineData[0].sesiones} sesiones).
                        </span>
                        <span className="text-indigo-600 font-semibold">
                          Registra sesiones en más días para proyectar la curva de aceleración.
                        </span>
                      </div>
                    )}
                    <div className="flex-1 w-full min-h-[220px]">
                      <ResponsiveContainer width="100%" height="100%" minHeight={220}>
                        <ComposedChart data={efficiencyTimelineData} margin={{ top: 15, right: 20, left: -10, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis
                            dataKey="periodo"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 10, fill: "#64748b", fontWeight: 700 }}
                          />
                          <YAxis
                            yAxisId="left"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 10, fill: "#64748b" }}
                            unit="m"
                          />
                          <YAxis
                            yAxisId="right"
                            orientation="right"
                            domain={[0, 10]}
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 10, fill: "#10b981" }}
                          />
                          <Tooltip
                            contentStyle={{
                              borderRadius: "14px",
                              border: "none",
                              backgroundColor: "rgba(15, 23, 42, 0.95)",
                              color: "#fff",
                              fontSize: "12px",
                              fontWeight: 700,
                            }}
                          />
                          <Area
                            yAxisId="left"
                            type="monotone"
                            dataKey="tiempoMedioMin"
                            name="Minutos por sesión"
                            fill="#6366f1"
                            fillOpacity={0.15}
                            stroke="#6366f1"
                            strokeWidth={3}
                            dot={{ r: 4, fill: "#6366f1" }}
                          />
                          <Line
                            yAxisId="right"
                            type="monotone"
                            dataKey="dificultadMedia"
                            name="Dificultad media (1-10)"
                            stroke="#10b981"
                            strokeWidth={2.5}
                            dot={{ r: 4, fill: "#10b981" }}
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                ) : (
                  <div className="w-full h-full min-h-[260px] flex flex-col items-center justify-center text-center p-6 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200/60 flex items-center justify-center text-emerald-600 mb-3 shadow-sm">
                      <Layers size={22} />
                    </div>
                    <h4 className="text-sm font-black text-slate-800 mb-1">
                      Histórico Temporal de Eficiencia
                    </h4>
                    <p className="text-xs text-slate-500 max-w-md mb-4 leading-relaxed font-medium">
                      Esta gráfica traza la evolución de tus minutos de estudio frente a la dificultad percibida a medida que avanzas por semanas de preparación.
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-3 text-[11px] font-bold">
                      <span className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full border border-indigo-200/60 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-indigo-600 inline-block" />
                        Minutos por sesión (eje izq.)
                      </span>
                      <span className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200/60 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-600 inline-block" />
                        Dificultad subjetiva (eje der.)
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 4. RANKING Y MATRIZ DE TEMAS: DIFICULTAD, MEJORA Y TIEMPO INVERTIDO */}
        <div className="relative z-10">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
            <div>
              <h4 className="text-base font-black text-slate-900 tracking-tight flex items-center gap-2">
                Ranking y Diagnóstico por Tema
                <span className="text-[11px] font-bold text-slate-400">
                  ({filteredRankedTopics.length} temas mostrados)
                </span>
              </h4>
              <p className="text-xs text-slate-500">
                Consulta qué temas fueron más difíciles, cómo han mejorado y cuántas horas les has dedicado
              </p>
            </div>

            {/* Búsqueda rápida */}
            <div className="relative w-full sm:w-64">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                placeholder="Buscar tema por nº o título..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200/80 rounded-xl text-xs font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Filtros de Categorías / Ranking */}
          <div className="flex flex-wrap items-center gap-1.5 mb-4">
            <button
              onClick={() => setRankingFilter("metodo_preparador")}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5",
                rankingFilter === "metodo_preparador"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "bg-amber-50 text-amber-900 hover:bg-amber-100 border border-amber-200/60"
              )}
            >
              <Sparkles size={13} className={rankingFilter === "metodo_preparador" ? "text-amber-400" : "text-amber-600"} />
              Prioridad Preparador
            </button>

            <button
              onClick={() => setRankingFilter("en_refrescos")}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5",
                rankingFilter === "en_refrescos"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              <Flame size={13} className={rankingFilter === "en_refrescos" ? "text-amber-400" : "text-amber-500"} />
              En 3 Refrescos ({preparadorPipeline.enRefrescos.length})
            </button>

            <button
              onClick={() => setRankingFilter("listos_canto")}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5",
                rankingFilter === "listos_canto"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              <CheckCircle2 size={13} className={rankingFilter === "listos_canto" ? "text-fuchsia-400" : "text-fuchsia-600"} />
              Listos p/ Canto ({preparadorPipeline.listosCantar.length})
            </button>

            <button
              onClick={() => setRankingFilter("repaso_pendiente")}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5",
                rankingFilter === "repaso_pendiente"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              <Calendar size={13} className={rankingFilter === "repaso_pendiente" ? "text-indigo-400" : "text-indigo-500"} />
              Repasos Mensuales (~30d) ({preparadorPipeline.repasoPendiente.length + preparadorPipeline.repasoVencido.length})
            </button>

            <button
              onClick={() => setRankingFilter("dificiles")}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5",
                rankingFilter === "dificiles"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              <AlertTriangle size={13} className={rankingFilter === "dificiles" ? "text-amber-400" : "text-amber-500"} />
              Más Difíciles
            </button>

            <button
              onClick={() => setRankingFilter("mejorados")}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5",
                rankingFilter === "mejorados"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              <TrendingDown size={13} className={rankingFilter === "mejorados" ? "text-emerald-400" : "text-emerald-500"} />
              Más Mejorados
            </button>

            <button
              onClick={() => setRankingFilter("tiempo")}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5",
                rankingFilter === "tiempo"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              <Clock size={13} className={rankingFilter === "tiempo" ? "text-blue-400" : "text-blue-500"} />
              Mayor Tiempo
            </button>

            <button
              onClick={() => setRankingFilter("dominados")}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5",
                rankingFilter === "dominados"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              <CheckCircle2 size={13} className={rankingFilter === "dominados" ? "text-emerald-400" : "text-emerald-500"} />
              Dominados
            </button>

            <button
              onClick={() => setRankingFilter("todos")}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5",
                rankingFilter === "todos"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              Ver Todos
            </button>
          </div>

          {/* LISTA / GRID DE TEMAS */}
          {filteredRankedTopics.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filteredRankedTopics.slice(0, 30).map((t) => {
                const totalH = Math.floor(t.totalMinutes / 60);
                const totalM = Math.round(t.totalMinutes % 60);

                return (
                  <div
                    key={t.id}
                    onClick={() => setInspectingTopicId(t.id)}
                    className="bg-white hover:bg-slate-50 border border-slate-200/80 hover:border-indigo-300 p-4 rounded-2xl transition-all cursor-pointer shadow-sm hover:shadow-md group flex flex-col justify-between relative"
                  >
                    <div>
                      {/* Top badges */}
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-slate-900 text-white">
                            Tema {t.number}
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 truncate max-w-[110px]">
                            {t.subjectName.replace("Derecho ", "")}
                          </span>
                        </div>

                        {/* Badge de fase del Preparador */}
                        <span className={cn(
                          "text-[10px] font-black px-2 py-0.5 rounded-full border flex items-center gap-1",
                          t.cycleInfo.phaseBadgeClass
                        )}>
                          {t.cycleInfo.phase === "en_refrescos" && (
                            <span className="flex items-center gap-0.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                              <span>{t.cycleInfo.refrescoDayLabel}</span>
                            </span>
                          )}
                          {t.cycleInfo.phase !== "en_refrescos" && t.cycleInfo.phaseLabel}
                        </span>
                      </div>

                      {/* Título del tema */}
                      <h5 className="text-xs font-black text-slate-900 line-clamp-2 group-hover:text-indigo-600 transition-colors mb-2.5">
                        {t.title}
                      </h5>

                      {/* Pill interactiva del ciclo preparador si está en proceso */}
                      {t.cycleInfo.phase === "en_refrescos" && (
                        <div className="mb-2.5 px-2.5 py-1.5 rounded-xl bg-amber-50/80 border border-amber-200/60 flex items-center justify-between">
                          <span className="text-[10px] font-bold text-amber-900">Progreso 3 Refrescos:</span>
                          <div className="flex items-center gap-1">
                            {[1, 2, 3].map((step) => (
                              <div
                                key={step}
                                className={cn(
                                  "w-2 h-2 rounded-full",
                                  step <= t.cycleInfo.refrescosCount
                                    ? "bg-amber-500"
                                    : "bg-amber-200"
                                )}
                              />
                            ))}
                            <span className="text-[10px] font-black text-amber-700 ml-1">
                              {t.cycleInfo.refrescosCount}/3
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Medidor de Dificultad: Inicial vs Actual */}
                      <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-100 mb-3">
                        <div className="flex items-center justify-between text-[11px] mb-1.5">
                          <span className="font-bold text-slate-500">Dificultad:</span>
                          <div className="flex items-center gap-1.5 font-black">
                            <span className="text-slate-400">Dif. {t.initialDifficulty}</span>
                            <ArrowRight size={12} className="text-slate-400" />
                            <span
                              className={cn(
                                "px-1.5 py-0.5 rounded-md text-white text-[10px]",
                                t.currentDifficulty >= 8
                                  ? "bg-rose-500"
                                  : t.currentDifficulty >= 5
                                  ? "bg-amber-500"
                                  : "bg-emerald-500"
                              )}
                            >
                              Dif. {t.currentDifficulty} / 10
                            </span>
                          </div>
                        </div>

                        {/* Barra de progreso de dificultad */}
                        <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all duration-500",
                              t.currentDifficulty >= 8
                                ? "bg-rose-500"
                                : t.currentDifficulty >= 5
                                ? "bg-amber-500"
                                : "bg-emerald-500"
                            )}
                            style={{ width: `${(t.currentDifficulty / 10) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Vitals inferiores del tema */}
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold text-slate-500">
                      <div className="flex items-center gap-1">
                        <Clock size={12} className="text-slate-400" />
                        <span>Total: {totalH > 0 ? `${totalH}h ${totalM}m` : `${totalM}m`}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-indigo-600 font-extrabold">{t.vueltas} {t.vueltas === 1 ? "vuelta" : "vueltas"}</span>
                        <span className="text-slate-300">•</span>
                        <span className="text-slate-400">{t.sessionsCount} ses.</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-12 text-center bg-slate-50/60 rounded-2xl border border-dashed border-slate-200">
              <BookOpen size={32} className="mx-auto text-slate-300 mb-2" />
              <p className="text-sm font-bold text-slate-600">No se encontraron temas con los filtros aplicados.</p>
              <p className="text-xs text-slate-400 mt-0.5">Prueba a seleccionar "Todas las materias" o cambiar de categoría.</p>
            </div>
          )}

          {filteredRankedTopics.length > 30 && (
            <div className="text-center mt-4">
              <p className="text-xs font-bold text-slate-400">
                Mostrando los primeros 30 temas destacados de {filteredRankedTopics.length}. Usa el buscador para filtrar temas específicos.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ============================================================================ */}
      {/* MODAL DE HISTORIAL DETALLADO DEL TEMA INSPECCIONADO */}
      {/* ============================================================================ */}
      <AnimatePresence>
        {inspectingTopic && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 md:p-6 bg-slate-900/50 backdrop-blur-md animate-in fade-in duration-200">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              className="bg-white rounded-[2rem] shadow-2xl w-full max-w-2xl relative overflow-hidden flex flex-col border border-slate-200 max-h-[88vh]"
            >
              {/* Header Modal */}
              <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-start bg-slate-50/70">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-slate-900 text-white">
                      Tema {inspectingTopic.number}
                    </span>
                    <span className="text-[10px] font-bold text-slate-500">
                      {inspectingTopic.subjectName}
                    </span>
                  </div>
                  <h3 className="text-base font-black text-slate-900 leading-snug">
                    {inspectingTopic.title}
                  </h3>
                </div>
                <button
                  onClick={() => setInspectingTopicId(null)}
                  className="w-8 h-8 rounded-full bg-slate-200/60 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Contenido Modal */}
              <div className="p-6 overflow-y-auto space-y-5">
                {/* Stats rápidos */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-center">
                    <span className="text-[10px] font-black uppercase text-slate-400">Dificultad</span>
                    <div className="flex items-center justify-center gap-1.5 mt-1">
                      <span className="text-xs text-slate-400 font-bold">{inspectingTopic.initialDifficulty}</span>
                      <ArrowRight size={12} className="text-slate-400" />
                      <span className={cn(
                        "text-base font-black",
                        inspectingTopic.currentDifficulty >= 8 ? "text-rose-600" :
                        inspectingTopic.currentDifficulty >= 5 ? "text-amber-600" : "text-emerald-600"
                      )}>
                        {inspectingTopic.currentDifficulty} / 10
                      </span>
                    </div>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-center">
                    <span className="text-[10px] font-black uppercase text-slate-400">Tiempo Total</span>
                    <p className="text-base font-black text-slate-900 mt-1">
                      {Math.floor(inspectingTopic.totalMinutes / 60)}h {Math.round(inspectingTopic.totalMinutes % 60)}m
                    </p>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-center">
                    <span className="text-[10px] font-black uppercase text-slate-400">Vueltas Consolidadas</span>
                    <p className="text-base font-black text-indigo-600 mt-1">
                      {inspectingTopic.vueltas} v • {inspectingTopic.sessionsCount} ses.
                    </p>
                  </div>
                </div>

                {/* Tarjeta Diagnóstico del Método del Preparador */}
                <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-50/70 via-white to-amber-50/30 border border-amber-200/80 shadow-sm">
                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    <span className="text-[11px] font-black text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles size={14} className="text-amber-600" />
                      Método Preparador (Ciclo Activo)
                    </span>
                    <span className={cn(
                      "text-[10px] font-black px-2.5 py-0.5 rounded-full border",
                      inspectingTopic.cycleInfo.phaseBadgeClass
                    )}>
                      {inspectingTopic.cycleInfo.phaseLabel}
                    </span>
                  </div>

                  {/* Pasos de los 3 refrescos */}
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {[1, 2, 3].map((step) => {
                      const isCompleted = step <= inspectingTopic.cycleInfo.refrescosCount;
                      const isCurrent = step === inspectingTopic.cycleInfo.refrescosCount + 1 && inspectingTopic.cycleInfo.phase === 'en_refrescos';
                      return (
                        <div
                          key={step}
                          className={cn(
                            "p-2 rounded-xl border text-center transition-all",
                            isCompleted
                              ? "bg-amber-100/80 border-amber-300 text-amber-950 font-bold"
                              : isCurrent
                              ? "bg-white border-amber-500 ring-2 ring-amber-400/20 text-slate-900 font-extrabold"
                              : "bg-slate-50 border-slate-200 text-slate-400"
                          )}
                        >
                          <span className="text-[10px] block uppercase font-black">Refresco {step}/3</span>
                          <span className="text-[10px] font-medium">
                            {isCompleted ? "✓ Completado" : isCurrent ? "→ Toca hoy" : "Pendiente"}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Próxima Acción & Repaso Mensual */}
                  <div className="pt-2 border-t border-amber-200/60 flex flex-wrap items-center justify-between text-xs gap-2">
                    <div>
                      <span className="text-slate-500 font-bold">Próxima acción: </span>
                      <span className="font-extrabold text-slate-900">
                        {inspectingTopic.cycleInfo.nextActionTitle}
                      </span>
                    </div>
                    {inspectingTopic.cycleInfo.nextMonthlyReviewDate && (
                      <div className="text-[11px] font-bold text-amber-800">
                        Repaso mensual: {inspectingTopic.cycleInfo.nextMonthlyReviewDate} ({inspectingTopic.cycleInfo.daysUntilMonthlyReview > 0 ? `en ${inspectingTopic.cycleInfo.daysUntilMonthlyReview}d` : `hace ${Math.abs(inspectingTopic.cycleInfo.daysUntilMonthlyReview)}d`})
                      </div>
                    )}
                  </div>
                </div>

                {/* Historial de Sesiones Registradas */}
                <div>
                  <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                    <FileText size={14} className="text-indigo-600" />
                    Bitácora de Sesiones de Estudio
                  </h4>

                  {inspectingTopic.sessions && inspectingTopic.sessions.length > 0 ? (
                    <div className="space-y-2">
                      {inspectingTopic.sessions.map((s: any, idx: number) => (
                        <div
                          key={s.id || idx}
                          className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex items-center justify-between text-xs"
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-[10px]">
                              {idx + 1}
                            </span>
                            <div>
                              <p className="font-bold text-slate-800 capitalize">
                                {s.type ? s.type.replace("_", " ") : "Estudio"}
                              </p>
                              <p className="text-[10px] text-slate-400">{s.date}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-4 text-right">
                            <div>
                              <span className="font-black text-slate-900">
                                {s.durationMinutes || s.duration || 0} min
                              </span>
                              {s.difficulty && (
                                <p className="text-[10px] font-bold text-slate-500">
                                  Dif: {s.difficulty}/10
                                </p>
                              )}
                            </div>

                            {s.completesVuelta && (
                              <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                                Vuelta +1
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">No hay detalle de sesiones individuales guardado para este tema.</p>
                  )}
                </div>
              </div>

              {/* Footer Modal */}
              <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setInspectingTopicId(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200/60 transition-colors"
                >
                  Cerrar
                </button>
                {onSelectTopic && (
                  <button
                    type="button"
                    onClick={() => {
                      const id = inspectingTopic.id;
                      setInspectingTopicId(null);
                      onSelectTopic(id);
                    }}
                    className="px-4 py-2 rounded-xl text-xs font-black bg-slate-900 hover:bg-black text-white transition-all shadow-sm flex items-center gap-1.5"
                  >
                    <span>Abrir en Temario</span>
                    <ArrowRight size={13} />
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
