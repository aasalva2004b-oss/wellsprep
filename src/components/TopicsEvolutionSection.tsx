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
import { useFirebase } from "../lib/FirebaseProvider";
import { getCanonicalTopic, getSessionCategory, sessionDurationMinutes } from "../lib/canonicalTopicService";
import { reportedMetric, reportedNumber } from "../lib/importedAnalyticsPresentation";
import { DS } from "../lib/designSystem";
import { useDialogAccessibility } from "../hooks/useDialogAccessibility";

const measuredDifficulty = (value: unknown): number | null => {
  const number = reportedNumber(value, 10);
  return number !== null && number >= 1 ? number : null;
};
const observedAverage = (values: number[]): number | null =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const observedMinutes = (sessions: any[]): number[] => sessions.map(sessionDurationMinutes).filter(minutes => minutes > 0);
const formatDuration = (minutes: number | null): string => {
  if (minutes === null) return '—';
  const rounded = Math.round(minutes);
  return rounded >= 60 ? `${Math.floor(rounded / 60)}h ${rounded % 60}m` : `${rounded}m`;
};

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
  const { topicState } = useFirebase();
  // Filtros interactivos
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>("all");
  const [rankingFilter, setRankingFilter] = useState<
    "metodo_preparador" | "en_refrescos" | "listos_canto" | "repaso_pendiente" | "dificiles" | "mejorados" | "tiempo" | "dominados" | "todos"
  >("metodo_preparador");
  const [searchTerm, setSearchTerm] = useState("");
  const [activeMetricTab, setActiveMetricTab] = useState<"metodo_preparador" | "aceleracion" | "materias" | "tendencia">("metodo_preparador");
  const [inspectingTopicId, setInspectingTopicId] = useState<string | null>(null);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const historyDialogRef = useDialogAccessibility<HTMLDivElement>({ isOpen: !!inspectingTopicId, onClose: () => setInspectingTopicId(null) });

  // The same read-only topic view used by the other sections resolves aliases,
  // duplicate deliveries, measured coverage and historical units.
  const analyzedTopics = useMemo(() => topics.map((topic) => {
    const canonical = topicState.get(topic.id) || getCanonicalTopic(topic, topics, userProgress, rawSessions || []);
    const studySessions = canonical.sessions.filter(session => getSessionCategory(session) !== 'cante');
    const difficultySamples = studySessions.map(session => measuredDifficulty(session.difficulty)).filter((value): value is number => value !== null);
    const initialDifficulty = difficultySamples[0] ?? null;
    const currentDifficulty = canonical.hasExplicitDifficulty ? measuredDifficulty(canonical.difficulty) : difficultySamples.at(-1) ?? null;
    const difficultyDelta = initialDifficulty !== null && currentDifficulty !== null ? currentDifficulty - initialDifficulty : null;
    const reviewDurations = observedMinutes(canonical.reviewSessions);
    const avgReviewMinutes = observedAverage(reviewDurations);
    const firstStudyMinutes = canonical.totalInitialStudyMinutes;
    const subject = initialSubjects.find(subject => subject.id === canonical.subjectId);
    const cycleInfo = calculateTopicCycle(topic.id, userProgress[topic.id], canonical.sessions, canonical);
    return {
      id: topic.id, number: canonical.number, title: canonical.title,
      subjectId: canonical.subjectId, subjectName: subject?.name || canonical.subjectId,
      subjectColor: subject?.color || 'bg-slate-500',
      hasStudied: canonical.hasStarted,
      firstStudyDate: canonical.firstStudyDate || null,
      lastReviewDate: canonical.lastReviewDate || null,
      initialDifficulty, currentDifficulty, difficultyDelta,
      totalMinutes: canonical.totalRecordedMinutes,
      hasRecordedDuration: canonical.totalRecordedMinutes > 0,
      firstStudyMinutes,
      reviewSessionsCount: reviewDurations.length,
      avgReviewMinutes,
      vueltas: canonical.vueltas, vueltasIsExact: canonical.vueltasIsExact,
      sessionsCount: canonical.sessions.length,
      sessions: canonical.sessions,
      studySessions,
      cycleInfo,
    };
  }), [topics, userProgress, rawSessions, topicState]);

  // Temas estudiados filtrados
  const studiedTopics = useMemo(() => {
    return analyzedTopics.filter((t) => t.hasStudied);
  }, [analyzedTopics]);

  // ============================================================================
  // MÉTRICAS Y PIPELINE OFICIAL DEL PREPARADOR
  // ============================================================================
  const preparadorPipeline = useMemo(() => {
    const sinIniciar = analyzedTopics.filter(topic => !topic.hasStudied);
    const enRefrescos = analyzedTopics.filter(topic => topic.cycleInfo.refrescosCount > 0);
    const listosCantar = analyzedTopics.filter(topic => topic.cycleInfo.lastCantoDate !== null);
    const consolidadoMes = analyzedTopics.filter(topic => topic.cycleInfo.phase === 'consolidado_mes');
    const repasoPendiente = analyzedTopics.filter(topic => topic.cycleInfo.phase === 'repaso_pendiente');
    const repasoVencido = analyzedTopics.filter(topic => topic.cycleInfo.phase === 'repaso_vencido');
    const samples = { initial: [] as number[], refresh: [] as number[], cante: [] as number[], review: [] as number[] };
    analyzedTopics.forEach(topic => topic.sessions.forEach(session => {
      const minutes = sessionDurationMinutes(session);
      if (minutes <= 0) return;
      const category = getSessionCategory(session);
      if (category === 'initial_study') samples.initial.push(minutes);
      else if (category === 'refresh') samples.refresh.push(minutes);
      else if (category === 'cante') samples.cante.push(minutes);
      else if (category === 'review') samples.review.push(minutes);
    }));
    const cycleBreakdownChart = [
      { etapa: 'Estudio inicial', sublabel: 'Por sesión registrada', samples: samples.initial, color: '#6366f1' },
      { etapa: 'Refresco', sublabel: 'Sin cuota fija de contactos', samples: samples.refresh, color: '#f59e0b' },
      { etapa: 'Cante', sublabel: 'Duración oral registrada', samples: samples.cante, color: '#c026d3' },
      { etapa: 'Repaso', sublabel: 'Por sesión registrada', samples: samples.review, color: '#10b981' },
    ].map(({ samples, ...item }) => {
      const minutes = observedAverage(samples);
      return { ...item, minutos: minutes === null ? null : Math.round(minutes), horas: minutes === null ? null : (minutes / 60).toFixed(1), muestras: samples.length };
    });
    return { sinIniciar, enRefrescos, listosCantar, consolidadoMes, repasoPendiente, repasoVencido,
      totalTemas: analyzedTopics.length, cycleBreakdownChart };
  }, [analyzedTopics]);

  // ============================================================================
  // MÉTRICAS GLOBALES DE ESTUDIO Y APRENDIZAJE
  // ============================================================================
  const vitals = useMemo(() => {
    const validFirstStudies = studiedTopics.filter(topic => topic.firstStudyMinutes > 0);
    const validReviews = studiedTopics.filter(topic => topic.avgReviewMinutes !== null);
    const avgNewTopicMins = observedAverage(validFirstStudies.map(topic => topic.firstStudyMinutes));
    const avgReviewMins = observedAverage(validReviews.map(topic => topic.avgReviewMinutes!));
    const comparedTopics = studiedTopics.filter(topic => topic.difficultyDelta !== null);
    const improvedTopics = comparedTopics.filter(topic => topic.difficultyDelta! < 0);
    const initialDifficulties = studiedTopics.map(topic => topic.initialDifficulty).filter((value): value is number => value !== null);
    const currentDifficulties = studiedTopics.map(topic => topic.currentDifficulty).filter((value): value is number => value !== null);
    return {
      studiedCount: studiedTopics.length,
      initialDurationSamples: validFirstStudies.length,
      reviewDurationSamples: validReviews.length,
      avgNewTopicMinutesFormatted: formatDuration(avgNewTopicMins),
      avgReviewMinutesFormatted: formatDuration(avgReviewMins),
      globalTimeReductionPct: avgNewTopicMins !== null && avgReviewMins !== null && avgNewTopicMins > 0
        ? Math.round(((avgNewTopicMins - avgReviewMins) / avgNewTopicMins) * 100) : null,
      improvedTopicsCount: improvedTopics.length,
      comparedTopicsCount: comparedTopics.length,
      improvedPct: comparedTopics.length ? Math.round(improvedTopics.length / comparedTopics.length * 100) : null,
      avgDifficultyDrop: observedAverage(improvedTopics.map(topic => Math.abs(topic.difficultyDelta!))),
      initialAvgDiff: observedAverage(initialDifficulties),
      currentAvgDiff: observedAverage(currentDifficulties),
      difficultySamples: currentDifficulties.length,
      hardTopicsCount: studiedTopics.filter(topic => topic.currentDifficulty !== null && topic.currentDifficulty >= 8).length,
      masteredTopicsCount: studiedTopics.filter(topic => topic.currentDifficulty !== null && topic.currentDifficulty <= 4 && topic.vueltas >= 2).length,
    };
  }, [studiedTopics]);

  // ============================================================================
  // GRÁFICA 1: CURVA DE ACELERACIÓN Y REDUCCIÓN DE TIEMPO POR VUELTA
  // ============================================================================
  const accelerationCurveData = useMemo(() => {
    const groups: number[][] = [[], [], [], []];
    studiedTopics.forEach(topic => topic.studySessions.forEach((session, index) => {
      const minutes = sessionDurationMinutes(session);
      if (minutes > 0) groups[Math.min(index, 3)].push(minutes);
    }));
    return groups.map((samples, index) => {
      const minutes = observedAverage(samples);
      return {
        fase: ['1ª sesión', '2ª sesión', '3ª sesión', '4ª+ sesión'][index],
        sublabel: 'Orden de sesiones no orales; no equivale a vueltas',
        minutos: minutes === null ? null : Math.round(minutes),
        horas: minutes === null ? null : (minutes / 60).toFixed(1),
        muestras: samples.length,
        color: ['#6366f1', '#3b82f6', '#10b981', '#8b5cf6'][index],
      };
    });
  }, [studiedTopics]);

  // ============================================================================
  // GRÁFICA 2: TIEMPO MEDIO DE TEMA NUEVO POR ASIGNATURA
  // ============================================================================
  const subjectTimeComparisonData = useMemo(() => initialSubjects.map(subject => {
    const subjectTopics = analyzedTopics.filter(topic => topic.subjectId === subject.id);
    const studied = subjectTopics.filter(topic => topic.hasStudied);
    const initialDurations = studied.filter(topic => topic.firstStudyMinutes > 0).map(topic => topic.firstStudyMinutes);
    const avgMinutes = observedAverage(initialDurations);
    return {
      id: subject.id, name: subject.name, shortName: subject.name.replace('Derecho ', ''),
      totalTopics: subjectTopics.length, studiedCount: studied.length,
      unstudiedCount: subjectTopics.length - studied.length,
      avgHours: avgMinutes === null ? null : Math.round(avgMinutes / 6) / 10,
      muestras: initialDurations.length,
      color: subject.color,
    };
  }), [analyzedTopics]);

  // ============================================================================
  // GRÁFICA 3: HISTÓRICO DE TENDENCIA DE EFICIENCIA
  // ============================================================================
  const efficiencyTimelineData = useMemo(() => {
    // Agrupar sesiones de estudio y refresco cronológicamente
    const studySessionsOnly = analyzedTopics.flatMap(topic => topic.studySessions)
      .filter((s) => typeof s.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.date))
      .sort((a, b) => (a.date || "").localeCompare(b.date || ""));

    if (studySessionsOnly.length === 0) return [];

    // Detección de rango temporal para granularidad adaptativa
    const uniqueDates = Array.from(new Set<string>(studySessionsOnly.map((s) => String(s.date).slice(0, 10))));
    const uniqueMonths = new Set(uniqueDates.map((d) => d.slice(0, 7)));

    // Granularidad: Días (si pocos días o 1 mes), Semanas (si 2-3 meses) o Meses (si histórico largo)
    const isDaily = uniqueMonths.size <= 1 || uniqueDates.length <= 14;
    const isWeekly = !isDaily && uniqueMonths.size <= 3;

    const buckets: Record<string, { totalMins: number; durationCount: number; totalDiff: number; difficultyCount: number; count: number; label: string }> = {};

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
        buckets[bucketKey] = { totalMins: 0, durationCount: 0, totalDiff: 0, difficultyCount: 0, count: 0, label: bucketLabel };
      }
      const minutes = sessionDurationMinutes(s);
      if (minutes > 0) {
        buckets[bucketKey].totalMins += minutes;
        buckets[bucketKey].durationCount += 1;
      }
      const difficulty = measuredDifficulty(s.difficulty);
      if (difficulty !== null) {
        buckets[bucketKey].totalDiff += difficulty;
        buckets[bucketKey].difficultyCount += 1;
      }
      buckets[bucketKey].count += 1;
    });

    return Object.entries(buckets).map(([key, data]) => {
      const avgMins = data.durationCount ? Math.round(data.totalMins / data.durationCount) : null;
      const avgDiff = data.difficultyCount ? data.totalDiff / data.difficultyCount : null;
      return {
        key,
        periodo: data.label,
        tiempoMedioMin: avgMins,
        dificultadMedia: avgDiff === null ? null : Math.round(avgDiff * 10) / 10,
        sesiones: data.count,
      };
    });
  }, [analyzedTopics]);

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
          return (a.cycleInfo.daysUntilMonthlyReview ?? Number.POSITIVE_INFINITY) - (b.cycleInfo.daysUntilMonthlyReview ?? Number.POSITIVE_INFINITY);
        });
        break;
      }

      case "en_refrescos":
        list = list
          .filter((t) => t.cycleInfo.refrescosCount > 0)
          .sort((a, b) => b.cycleInfo.refrescosCount - a.cycleInfo.refrescosCount);
        break;

      case "listos_canto":
        list = list
          .filter((t) => t.cycleInfo.lastCantoDate !== null)
          .sort((a, b) => (b.firstStudyMinutes || 0) - (a.firstStudyMinutes || 0));
        break;

      case "repaso_pendiente":
        list = list
          .filter((t) => t.cycleInfo.phase === "repaso_pendiente" || t.cycleInfo.phase === "repaso_vencido")
          .sort((a, b) => (a.cycleInfo.daysUntilMonthlyReview ?? Number.POSITIVE_INFINITY) - (b.cycleInfo.daysUntilMonthlyReview ?? Number.POSITIVE_INFINITY));
        break;

      case "dificiles":
        // Primero los que tienen mayor dificultad actual, luego por dificultad inicial
        list = list
          .filter((t) => t.hasStudied)
          .sort((a, b) => {
            if (b.currentDifficulty !== a.currentDifficulty) {
              return (b.currentDifficulty ?? -Infinity) - (a.currentDifficulty ?? -Infinity);
            }
            return (b.initialDifficulty ?? -Infinity) - (a.initialDifficulty ?? -Infinity);
          });
        break;

      case "mejorados":
        // Los que más han reducido su dificultad (difficultyDelta más negativo)
        list = list
          .filter((t) => t.hasStudied && t.difficultyDelta !== null && t.difficultyDelta < 0)
          .sort((a, b) => a.difficultyDelta! - b.difficultyDelta!);
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
          .filter((t) => t.hasStudied && t.currentDifficulty !== null && t.currentDifficulty <= 4 && t.vueltas >= 2)
          .sort((a, b) => b.vueltas - a.vueltas);
        break;

      case "atascados":
        // Dificultad alta (>= 7) tras al menos 2 sesiones de estudio
        list = list
          .filter((t) => t.hasStudied && t.currentDifficulty !== null && t.currentDifficulty >= 7 && t.sessionsCount >= 2)
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
    <div className="min-w-0 space-y-5">
      {/* SECCIÓN PRINCIPAL: EVOLUCIÓN DE TEMAS Y DINÁMICA DE ESTUDIO */}
      <section className={cn(DS.card, "min-w-0 p-4 sm:p-6")}>
        {/* Glow de fondo sofisticado */}

        {/* Cabecera del Módulo */}
        <div className="mb-4 relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-100 pb-5">
          <div className="flex min-w-0 items-start gap-3">
            <div className="hidden sm:flex shrink-0 w-11 h-11 rounded-2xl bg-slate-800 flex items-center justify-center text-white shadow-md shadow-indigo-600/20">
              <BookOpen size={22} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className={DS.titleSection}>
                  Evolución del temario
                </h2>
                <span className="text-xs font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                  {vitals.studiedCount} temas analizados
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
                Consulta las sesiones, el tiempo y la dificultad que has registrado.
              </p>
            </div>
          </div>

          {/* Selector de Materia para todo el bloque */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <select
                aria-label="Materia para la evolución del temario"
                value={selectedSubjectFilter}
                onChange={(e) => setSelectedSubjectFilter(e.target.value)}
                className="min-h-11 max-w-full appearance-none bg-white border border-slate-200 text-slate-800 text-xs font-bold rounded-xl px-3.5 py-2 pr-8 shadow-sm hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
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

        <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50/50">
          <button type="button" aria-expanded={showAnalytics} aria-controls="topic-evolution-analytics" onClick={() => setShowAnalytics(value => !value)} className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold text-slate-800">
            Métricas y gráficos de estudio
            {showAnalytics ? <ChevronUp size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
          </button>
          {showAnalytics && <div id="topic-evolution-analytics" className="min-w-0 p-3 sm:p-4">
          <p className="mb-4 text-sm leading-relaxed text-slate-600">Son resúmenes descriptivos. Menos tiempo o dificultad no demuestra mayor recuerdo. Las actividades sin sesiones muestran —. Los tiempos no son predicciones personales.</p>
        {/* 1. VITALS / DIAGNÓSTICO TELEMÉTRICO BENTO GRID */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5 sm:gap-4 mb-6 relative z-10">
          {/* Card 1: Tiempo Medio de Tema Nuevo */}
          <div className="bg-slate-50/80 border border-slate-200/70 rounded-2xl p-4.5 flex flex-col justify-between">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <span className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Clock size={13} className="text-indigo-600" />
                Estudio inicial
              </span>
              <span className="text-xs font-black px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                Media observada
              </span>
            </div>
            <div>
              <div className="flex items-baseline gap-1.5">
                <h4 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                  {vitals.avgNewTopicMinutesFormatted}
                </h4>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-1 leading-tight">
                Minutos registrados en estudio inicial por tema
              </p>
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-200/50 flex items-center justify-between text-xs font-bold text-slate-400">
              <span>{vitals.studiedCount} temas iniciados</span>
              <span className="text-indigo-600">Ritmo base</span>
            </div>
          </div>

          {/* Card 2: Tiempo Medio de Repaso & Aceleración */}
          <div className="bg-slate-50/80 border border-slate-200/70 rounded-2xl p-4.5 flex flex-col justify-between">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <span className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Zap size={13} className="text-blue-600" />
                Tiempo de Repaso
              </span>
              {vitals.globalTimeReductionPct > 0 && (
                <span className="text-xs font-black px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-0.5">
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
              <p className="text-xs text-slate-500 font-medium mt-1 leading-tight">
                Duración media de sesiones registradas
              </p>
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-200/50 flex items-center justify-between text-xs font-bold text-slate-400">
              <span>{vitals.reviewDurationSamples} temas con duración de repaso medida</span>
              <span className="text-emerald-600 font-black">No mide retención</span>
            </div>
          </div>

          {/* Card 3: Evolución de Dificultad */}
          <div className="bg-slate-50/80 border border-slate-200/70 rounded-2xl p-4.5 flex flex-col justify-between">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <span className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <TrendingDown size={13} className="text-emerald-600" />
                Tasa de Mejora
              </span>
              <span className="text-xs font-black px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                {reportedMetric(vitals.improvedPct, "%")} con menor dificultad
              </span>
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-xl sm:text-2xl font-black text-slate-400 line-through">
                  {reportedMetric(vitals.initialAvgDiff, "", 1)}
                </span>
                <ArrowRight size={14} className="text-slate-400" />
                <span className="text-2xl sm:text-3xl font-black text-emerald-600 tracking-tight">
                  {reportedMetric(vitals.currentAvgDiff, "", 1)}
                </span>
                <span className="text-xs font-bold text-slate-400">/ 10</span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-1 leading-tight">
                {vitals.improvedTopicsCount} temas han reducido dificultad (media -{reportedMetric(vitals.avgDifficultyDrop, "", 1)} pts)
              </p>
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-200/50 flex items-center justify-between text-xs font-bold text-slate-400">
              <span>{vitals.masteredTopicsCount} con dificultad ≤4 y 2+ vueltas</span>
              <span className="text-slate-600 font-black">Escala 1-10</span>
            </div>
          </div>

          {/* Card 4: Alerta Temprana & Focos Rojos */}
          <div className="bg-slate-50/80 border border-slate-200/70 rounded-2xl p-4.5 flex flex-col justify-between">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <span className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle size={13} className="text-amber-500" />
                Temas en Foco
              </span>
              <span className={cn(
                "text-xs font-black px-2 py-0.5 rounded-full border",
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
              <p className="text-xs text-slate-500 font-medium mt-1 leading-tight">
                Prioridad para repaso espaciado y refuerzo de esquemas
              </p>
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-200/50 flex items-center justify-between text-xs font-bold text-slate-400">
              <span>{studiedTopics.filter(t => t.vueltas >= 3).length} en 3ª+ vuelta</span>
              <span className="text-indigo-600 font-black">Historial registrado</span>
            </div>
          </div>
        </div>

        {/* 2. SELECTOR DE VISOR ANALÍTICO DE GRÁFICAS */}
        <div className="mb-4 relative z-10 flex flex-wrap items-center justify-between gap-3 bg-slate-50/80 p-1.5 rounded-2xl border border-slate-200/60">
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            <button
              onClick={() => setActiveMetricTab("metodo_preparador")}
              aria-pressed={activeMetricTab === "metodo_preparador"}
              className={cn(
                "min-h-11 px-3 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5",
                activeMetricTab === "metodo_preparador"
                  ? "bg-white text-slate-900 shadow-sm border border-slate-200/80"
                  : "text-slate-500 hover:text-slate-800"
              )}
            >
              <Sparkles size={14} className="text-amber-500" />
              Etapas de estudio
            </button>
            <button
              onClick={() => setActiveMetricTab("aceleracion")}
              aria-pressed={activeMetricTab === "aceleracion"}
              className={cn(
                "min-h-11 px-3 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5",
                activeMetricTab === "aceleracion"
                  ? "bg-white text-slate-900 shadow-sm border border-slate-200/80"
                  : "text-slate-500 hover:text-slate-800"
              )}
            >
              <TrendingDown size={14} className="text-indigo-600" />
              Tiempos por vuelta
            </button>
            <button
              onClick={() => setActiveMetricTab("materias")}
              aria-pressed={activeMetricTab === "materias"}
              className={cn(
                "min-h-11 px-3 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5",
                activeMetricTab === "materias"
                  ? "bg-white text-slate-900 shadow-sm border border-slate-200/80"
                  : "text-slate-500 hover:text-slate-800"
              )}
            >
              <Clock size={14} className="text-blue-600" />
              Por materia
            </button>
            <button
              onClick={() => setActiveMetricTab("tendencia")}
              aria-pressed={activeMetricTab === "tendencia"}
              className={cn(
                "min-h-11 px-3 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5",
                activeMetricTab === "tendencia"
                  ? "bg-white text-slate-900 shadow-sm border border-slate-200/80"
                  : "text-slate-500 hover:text-slate-800"
              )}
            >
              <Layers size={14} className="text-emerald-600" />
              Por semana
            </button>
          </div>
          <span className="text-xs font-bold text-slate-400 px-3 hidden lg:inline-block">
            Estudio · Refrescos · Cante · Revisiones sugeridas
          </span>
        </div>

        {/* 3. CONTENEDOR DE GRÁFICA DINÁMICA */}
        <div className="w-full min-h-[320px] relative z-10 bg-white rounded-2xl p-4 border border-slate-100 shadow-inner mb-6">
          {activeMetricTab === "metodo_preparador" && (
            <div className="w-full h-full flex flex-col space-y-3">
              {/* Pipeline Cards: Embudo del Preparador */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/60 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs font-black uppercase text-slate-400">
                    <span>1. Estudio Inicial</span>
                    <BookOpen size={13} className="text-indigo-600" />
                  </div>
                  <div className="mt-2">
                    <span className="text-xl font-black text-slate-900">{preparadorPipeline.sinIniciar.length}</span>
                    <span className="text-xs font-bold text-slate-400 ml-1">temas nuevos pendientes</span>
                  </div>
                  <p className="text-xs font-medium text-slate-500 mt-1">Fijación en profundidad</p>
                </div>

                <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200/70 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs font-black uppercase text-amber-700">
                    <span>2. Refrescos observados</span>
                    <Flame size={13} className="text-amber-600" />
                  </div>
                  <div className="mt-2">
                    <span className="text-xl font-black text-amber-900">{preparadorPipeline.enRefrescos.length}</span>
                    <span className="text-xs font-bold text-amber-700 ml-1">temas con contactos registrados</span>
                  </div>
                  <p className="text-xs font-medium text-amber-800 mt-1">Lectura + intento de canto</p>
                </div>

                <div className="p-3 bg-fuchsia-50/60 rounded-xl border border-fuchsia-200/70 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs font-black uppercase text-fuchsia-700">
                    <span>3. Cantes registrados</span>
                    <CheckCircle2 size={13} className="text-fuchsia-600" />
                  </div>
                  <div className="mt-2">
                    <span className="text-xl font-black text-fuchsia-900">{preparadorPipeline.listosCantar.length}</span>
                    <span className="text-xs font-bold text-fuchsia-700 ml-1">temas con cante</span>
                  </div>
                  <p className="text-xs font-medium text-fuchsia-800 mt-1">Actuaciones observadas; no certifican dominio</p>
                </div>

                <div className="p-3 bg-indigo-50/60 rounded-xl border border-indigo-200/70 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs font-black uppercase text-indigo-700">
                    <span>4. Revisión sugerida</span>
                    <Calendar size={13} className="text-indigo-600" />
                  </div>
                  <div className="mt-2">
                    <span className="text-xl font-black text-indigo-900">
                      {preparadorPipeline.repasoPendiente.length + preparadorPipeline.repasoVencido.length}
                    </span>
                    <span className="text-xs font-bold text-indigo-700 ml-1">con fecha orientativa</span>
                  </div>
                  <p className="text-xs font-medium text-indigo-800 mt-1">
                    {preparadorPipeline.consolidadoMes.length} al día / {preparadorPipeline.repasoVencido.length} vencidos
                  </p>
                </div>
              </div>

              {/* Sub-header de la gráfica */}
              <div className="flex flex-wrap justify-between items-center gap-2 px-1 pt-1">
                <span className="text-xs font-black text-slate-700">
                  Duraciones por actividad · medias de sesiones observadas
                </span>
                <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200/60 px-2 py-0.5 rounded-full">
                  Sin muestras se muestra —; las actividades pueden tener distinta cobertura
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
                      tick={{ fontSize: 12, fill: "#334155", fontWeight: 800 }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: "#64748b" }}
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
                              <p className="text-xs text-slate-300 mb-1.5">{data.sublabel}</p>
                              <div className="space-y-1 font-bold">
                                <div className="flex justify-between gap-4">
                                  <span className="text-slate-400">{data.muestras > 0 ? "Tiempo medio observado:" : "Sin mediciones:"}</span>
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
              <div className="flex flex-wrap justify-between items-center gap-2 mb-2 px-2">
                <span className="text-xs font-black text-slate-700">
                  Tiempo medio según el orden de las sesiones
                </span>
                <span className="text-xs font-bold text-indigo-600">
                  Comparación descriptiva; no demuestra una mejora de aprendizaje
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
                      tick={{ fontSize: 12, fill: "#475569", fontWeight: 700 }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: "#64748b", fontWeight: 600 }}
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
                              <p className="text-xs text-slate-400 mb-2">{data.sublabel}</p>
                              <div className="space-y-1 font-bold">
                                <div className="flex justify-between gap-4">
                                  <span className="text-slate-400">{data.muestras > 0 ? "Tiempo medio observado:" : "Sin mediciones:"}</span>
                                  <span className="text-white">{data.horas} horas ({data.minutos} min)</span>
                                </div>
                                <div className="flex justify-between gap-4 text-slate-400 text-xs pt-1 border-t border-slate-800">
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
              <div className="flex flex-wrap justify-between items-center gap-2 mb-2 px-2">
                <span className="text-xs font-black text-slate-700">
                  Tiempo medio de tema nuevo según la rama del Derecho (Horas / tema)
                </span>
                <span className="text-xs font-bold text-blue-600">
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
                      tick={{ fontSize: 12, fill: "#64748b" }}
                      unit="h"
                    />
                    <YAxis
                      dataKey="shortName"
                      type="category"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: "#1e293b", fontWeight: 700 }}
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
              <div className="flex flex-wrap justify-between items-center gap-2 mb-2 px-2">
                <span className="text-xs font-black text-slate-700">
                  Evolución temporal del tiempo medio y dificultad por sesión
                </span>
                <span className="text-xs font-bold text-emerald-600">
                  La técnica y retención aceleran tu velocidad
                </span>
              </div>
              <div className="w-full h-72 min-h-[280px] mt-2">
                {efficiencyTimelineData.length > 0 ? (
                  <div className="w-full h-full flex flex-col">
                    {efficiencyTimelineData.length === 1 && (
                      <div className="mb-2 px-3 py-1.5 rounded-lg bg-indigo-50/70 border border-indigo-100 flex items-center justify-between text-xs">
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
                            tick={{ fontSize: 12, fill: "#64748b", fontWeight: 700 }}
                          />
                          <YAxis
                            yAxisId="left"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 12, fill: "#64748b" }}
                            unit="m"
                          />
                          <YAxis
                            yAxisId="right"
                            orientation="right"
                            domain={[0, 10]}
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 12, fill: "#10b981" }}
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
                    <div className="flex flex-wrap items-center justify-center gap-3 text-xs font-bold">
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

          </div>}
        </div>

        {/* 4. RANKING Y MATRIZ DE TEMAS: DIFICULTAD, MEJORA Y TIEMPO INVERTIDO */}
        <div className="relative z-10">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
            <div>
              <h4 className="text-base font-semibold text-slate-900 tracking-tight flex flex-wrap items-center gap-2">
                Explorar temas
                <span className="text-xs font-bold text-slate-400">
                  ({filteredRankedTopics.length} temas mostrados)
                </span>
              </h4>
              <p className="text-xs text-slate-500">
                Filtra por actividad, dificultad percibida o tiempo registrado.
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
                aria-label="Buscar en la evolución de temas"
                placeholder="Buscar tema por número o título…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="min-h-11 w-full pl-9 pr-12 py-2 bg-slate-50 border border-slate-200/80 rounded-xl text-xs font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  aria-label="Limpiar búsqueda en evolución"
                  className="absolute right-0 top-0 min-h-11 min-w-11 flex items-center justify-center text-slate-400 hover:text-slate-600"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Filtros de Categorías / Ranking */}
          <select aria-label="Filtrar y ordenar la evolución de temas" value={rankingFilter} onChange={event => setRankingFilter(event.target.value as typeof rankingFilter)} className="mb-4 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 sm:hidden">
            <option value="metodo_preparador">Prioridad del preparador</option>
            <option value="en_refrescos">Refrescos</option>
            <option value="listos_canto">Preparación de cante</option>
            <option value="repaso_pendiente">Revisión sugerida pendiente</option>
            <option value="dificiles">Mayor dificultad</option>
            <option value="mejorados">Dificultad reducida</option>
            <option value="tiempo">Mayor tiempo registrado</option>
            <option value="dominados">Dificultad ≤4 y 2+ vueltas</option>
            <option value="todos">Todos</option>
          </select>
          <div role="group" aria-label="Categorías de evolución" className="hidden sm:flex flex-wrap items-center gap-1.5 mb-4">
            <button
              onClick={() => setRankingFilter("metodo_preparador")}
              aria-pressed={rankingFilter === "metodo_preparador"}
              className={cn(
                "min-h-11 px-3 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5",
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
              aria-pressed={rankingFilter === "en_refrescos"}
              className={cn(
                "min-h-11 px-3 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5",
                rankingFilter === "en_refrescos"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              <Flame size={13} className={rankingFilter === "en_refrescos" ? "text-amber-400" : "text-amber-500"} />
              Refrescos ({preparadorPipeline.enRefrescos.length})
            </button>

            <button
              onClick={() => setRankingFilter("listos_canto")}
              aria-pressed={rankingFilter === "listos_canto"}
              className={cn(
                "min-h-11 px-3 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5",
                rankingFilter === "listos_canto"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              <CheckCircle2 size={13} className={rankingFilter === "listos_canto" ? "text-fuchsia-400" : "text-fuchsia-600"} />
              Preparación de cante ({preparadorPipeline.listosCantar.length})
            </button>

            <button
              onClick={() => setRankingFilter("repaso_pendiente")}
              aria-pressed={rankingFilter === "repaso_pendiente"}
              className={cn(
                "min-h-11 px-3 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5",
                rankingFilter === "repaso_pendiente"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              <Calendar size={13} className={rankingFilter === "repaso_pendiente" ? "text-indigo-400" : "text-indigo-500"} />
              Revisión sugerida ({preparadorPipeline.repasoPendiente.length + preparadorPipeline.repasoVencido.length})
            </button>

            <button
              onClick={() => setRankingFilter("dificiles")}
              aria-pressed={rankingFilter === "dificiles"}
              className={cn(
                "min-h-11 px-3 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5",
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
              aria-pressed={rankingFilter === "mejorados"}
              className={cn(
                "min-h-11 px-3 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5",
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
              aria-pressed={rankingFilter === "tiempo"}
              className={cn(
                "min-h-11 px-3 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5",
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
              aria-pressed={rankingFilter === "dominados"}
              className={cn(
                "min-h-11 px-3 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5",
                rankingFilter === "dominados"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              <CheckCircle2 size={13} className={rankingFilter === "dominados" ? "text-emerald-400" : "text-emerald-500"} />
              Dificultad ≤4 y 2+ vueltas
            </button>

            <button
              onClick={() => setRankingFilter("todos")}
              aria-pressed={rankingFilter === "todos"}
              className={cn(
                "min-h-11 px-3 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5",
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
                    className={cn(DS.cardInteractive, "min-w-0 p-4 cursor-pointer group flex flex-col justify-between relative")}
                  >
                    <div>
                      {/* Top badges */}
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-black px-2 py-0.5 rounded-md bg-slate-900 text-white">
                            Tema {t.number}
                          </span>
                          <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 truncate max-w-[110px]">
                            {t.subjectName.replace("Derecho ", "")}
                          </span>
                        </div>

                        {/* Badge de fase del Preparador */}
                        <span className={cn(
                          "text-xs font-black px-2 py-0.5 rounded-full border flex items-center gap-1",
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
                      <h5 className="text-sm font-semibold text-slate-900 leading-snug mb-2.5">
                        <button type="button" onClick={event => { event.stopPropagation(); setInspectingTopicId(t.id); }} aria-label={`Consultar historial del tema ${t.number}`} className="min-h-11 text-left hover:underline">{t.title}</button>
                      </h5>

                      {/* Medidor de Dificultad: Inicial vs Actual */}
                      <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-100 mb-3">
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span className="font-bold text-slate-500">Dificultad:</span>
                          <div className="flex items-center gap-1.5 font-black">
                            <span className="text-slate-400">Dif. {t.initialDifficulty}</span>
                            <ArrowRight size={12} className="text-slate-400" />
                            <span
                              className={cn(
                                "px-1.5 py-0.5 rounded-md text-white text-xs",
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
                    <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-2 items-center justify-between text-xs font-bold text-slate-500">
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
      </section>

      {/* ============================================================================ */}
      {/* MODAL DE HISTORIAL DETALLADO DEL TEMA INSPECCIONADO */}
      {/* ============================================================================ */}
      <AnimatePresence>
        {inspectingTopic && (
          <div ref={historyDialogRef} id="topic-evolution-history-dialog" role="dialog" aria-modal="true" aria-labelledby="topic-evolution-history-title" className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 md:p-6 bg-slate-900/50 backdrop-blur-md animate-in fade-in duration-200">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              className="bg-white rounded-[2rem] shadow-2xl w-full max-w-2xl relative overflow-hidden flex flex-col border border-slate-200 max-h-[88vh]"
            >
              {/* Header Modal */}
              <div className="px-4 sm:px-6 py-4 border-b border-slate-100 flex justify-between items-start bg-slate-50/70">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-black px-2 py-0.5 rounded-md bg-slate-900 text-white">
                      Tema {inspectingTopic.number}
                    </span>
                    <span className="text-xs font-bold text-slate-500">
                      {inspectingTopic.subjectName}
                    </span>
                  </div>
                  <h3 id="topic-evolution-history-title" className="text-base font-semibold text-slate-900 leading-snug">
                    {inspectingTopic.title}
                  </h3>
                </div>
                <button
                  onClick={() => setInspectingTopicId(null)}
                  aria-label="Cerrar historial del tema"
                  className="shrink-0 w-11 h-11 rounded-full bg-slate-200/60 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Contenido Modal */}
              <div className="p-4 sm:p-6 overflow-y-auto space-y-5">
                {/* Stats rápidos */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-center">
                    <span className="text-xs font-black uppercase text-slate-400">Dificultad</span>
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
                    <span className="text-xs font-black uppercase text-slate-400">Tiempo Total</span>
                    <p className="text-base font-black text-slate-900 mt-1">
                      {Math.floor(inspectingTopic.totalMinutes / 60)}h {Math.round(inspectingTopic.totalMinutes % 60)}m
                    </p>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-center">
                    <span className="text-xs font-black uppercase text-slate-400">Vueltas registradas</span>
                    <p className="text-base font-black text-indigo-600 mt-1">
                      {inspectingTopic.vueltas} v • {inspectingTopic.sessionsCount} ses.
                    </p>
                  </div>
                </div>

                {/* Tarjeta Diagnóstico del Método del Preparador */}
                <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-50/70 via-white to-amber-50/30 border border-amber-200/80 shadow-sm">
                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    <span className="text-xs font-black text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles size={14} className="text-amber-600" />
                      Historial de contactos y próxima acción
                    </span>
                    <span className={cn(
                      "text-xs font-black px-2.5 py-0.5 rounded-full border",
                      inspectingTopic.cycleInfo.phaseBadgeClass
                    )}>
                      {inspectingTopic.cycleInfo.phaseLabel}
                    </span>
                  </div>

                  <p className="mb-3 text-sm text-slate-700">
                    {inspectingTopic.cycleInfo.refrescosCount} días de refresco registrados.
                    {inspectingTopic.cycleInfo.refrescoDates.length > 0 && <span className="block mt-1">{inspectingTopic.cycleInfo.refrescoDates.join(', ')}</span>}
                    <span className="block mt-1 text-xs">La agenda muestra las obligaciones del protocolo elegido. Este historial no demuestra dominio ni añade contactos pendientes.</span>
                  </p>

                  {/* Próxima Acción & Repaso Mensual */}
                  <div className="pt-2 border-t border-amber-200/60 flex flex-wrap items-center justify-between text-xs gap-2">
                    <div>
                      <span className="text-slate-500 font-bold">Próxima acción: </span>
                      <span className="font-extrabold text-slate-900">
                        {inspectingTopic.cycleInfo.nextActionTitle}
                      </span>
                    </div>
                    {inspectingTopic.cycleInfo.nextMonthlyReviewDate && (
                      <div className="text-xs font-bold text-amber-800">
                        Revisión sugerida: {inspectingTopic.cycleInfo.nextMonthlyReviewDate} ({(inspectingTopic.cycleInfo.daysUntilMonthlyReview ?? 0) > 0 ? `en ${inspectingTopic.cycleInfo.daysUntilMonthlyReview}d` : `hace ${Math.abs(inspectingTopic.cycleInfo.daysUntilMonthlyReview ?? 0)}d`})
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
                            <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-xs">
                              {idx + 1}
                            </span>
                            <div>
                              <p className="font-bold text-slate-800 capitalize">
                                {s.type ? s.type.replace("_", " ") : "Estudio"}
                              </p>
                              <p className="text-xs text-slate-400">{s.date}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-4 text-right">
                            <div>
                              <span className="font-black text-slate-900">
                                {sessionDurationMinutes(s) > 0 ? `${Number(sessionDurationMinutes(s).toFixed(2))} min` : "Sin duración registrada"}
                              </span>
                              {s.difficulty && (
                                <p className="text-xs font-bold text-slate-500">
                                  Dif: {s.difficulty}/10
                                </p>
                              )}
                            </div>

                            {s.completesVuelta && (
                              <span className="text-xs font-black px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
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
              <div className="px-4 sm:px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setInspectingTopicId(null)}
                  className="min-h-11 px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200/60 transition-colors"
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
                    className="min-h-11 px-4 py-2 rounded-xl text-xs font-black bg-slate-900 hover:bg-black text-white transition-all shadow-sm flex items-center gap-1.5"
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
