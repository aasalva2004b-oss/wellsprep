import { Topic } from "../types";
import { TopicProgressData } from "./prediction";
import { buildSubjectTelemetryIndex, FastTopicTelemetry } from "./performanceCache";
import { getLocalDateString, safeParseDate } from "./utils";

export interface TodayActivityData {
  dateStr: string;
  totalMinutes: number;
  totalHours: number;
  goalMinutes: number;
  goalHours: number;
  progressRatio: number; // 0 to 1+
  progressPercent: number; // 0 to 100+
  isGoalMet: boolean;
  exceededMinutes: number;
  sessionsCount: number;
  studyMinutes: number;
  refrescoMinutes: number;
  repasoMinutes: number;
  cantoMinutes: number;
  topicsTouchedCount: number;
  topicsTouched: string[];
}

export interface DayConsistencyData {
  dateStr: string;
  dayLabel: string; // "Lun", "Mar", etc.
  dayShort: string; // "L", "M", etc.
  dayNum: number; // Day of month 1-31
  totalMinutes: number;
  totalHours: number;
  goalMinutes: number;
  goalMet: boolean;
  pctOfGoal: number;
  sessionsCount: number;
  topicsCount: number;
  isToday: boolean;
  isFuture: boolean;
}

export interface WeeklyConsistencyData {
  days: DayConsistencyData[];
  totalWeeklyMinutes: number;
  totalWeeklyHours: number;
  dailyAverageHours: number;
  completedDaysCount: number;
  currentStreak: number;
  bestStreak: number;
}

export type RecommendedTaskCategory = "refresco" | "repaso" | "canto" | "nuevo";

export interface RecommendedStudyTask {
  id: string;
  topic: Topic;
  priority: 1 | 2 | 3 | 4;
  category: RecommendedTaskCategory;
  categoryTitle: string;
  badgeLabel: string;
  badgeTheme: {
    bg: string;
    text: string;
    border: string;
    accent: string;
  };
  reason: string;
  subReason: string;
  estimatedMinutes: number;
  telemetry?: FastTopicTelemetry;
  actionType: "refresco" | "repaso" | "canto" | "estudio";
  actionLabel: string;
}

const DEFAULT_DAILY_GOAL_MINUTES = 360; // 6 hours

export function getDailyGoalMinutes(): number {
  if (typeof window === "undefined") return DEFAULT_DAILY_GOAL_MINUTES;
  try {
    const saved = localStorage.getItem("wellsprep_daily_goal_minutes");
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed) && parsed > 0 && parsed <= 1440) {
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  return DEFAULT_DAILY_GOAL_MINUTES;
}

export function setDailyGoalMinutes(minutes: number): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("wellsprep_daily_goal_minutes", String(minutes));
  } catch {
    // ignore
  }
}

/**
 * Computes today's net study time and progress against user's daily target
 */
export function computeTodayActivity(
  sessions: any[],
  goalMinutes: number = getDailyGoalMinutes()
): TodayActivityData {
  const todayStr = getLocalDateString();
  const safeGoalMins = Math.max(15, goalMinutes);

  let totalMinutes = 0;
  let sessionsCount = 0;
  let studyMinutes = 0;
  let refrescoMinutes = 0;
  let repasoMinutes = 0;
  let cantoMinutes = 0;
  const topicsTouchedSet = new Set<string>();

  for (let i = 0; i < (sessions || []).length; i++) {
    const s = sessions[i];
    if (!s || s.date !== todayStr) continue;

    const dur = Number(s.durationMinutes || s.duration || 0);
    if (dur <= 0) continue;

    totalMinutes += dur;
    sessionsCount += 1;

    const type = s.type || s.modality || "repaso";
    if (type === "estudio" || type === "primer_estudio" || type === "estudio_inicial") {
      studyMinutes += dur;
    } else if (type === "refresco") {
      refrescoMinutes += dur;
    } else if (type === "repaso") {
      repasoMinutes += dur;
    } else if (type === "canto" || type === "simulacro") {
      cantoMinutes += dur;
    }

    if (s.topicId) {
      topicsTouchedSet.add(String(s.topicId));
    }
  }

  const progressRatio = totalMinutes / safeGoalMins;
  const progressPercent = Math.round(progressRatio * 100);
  const isGoalMet = totalMinutes >= safeGoalMins;
  const exceededMinutes = Math.max(0, totalMinutes - safeGoalMins);

  return {
    dateStr: todayStr,
    totalMinutes,
    totalHours: Math.round((totalMinutes / 60) * 10) / 10,
    goalMinutes: safeGoalMins,
    goalHours: Math.round((safeGoalMins / 60) * 10) / 10,
    progressRatio,
    progressPercent,
    isGoalMet,
    exceededMinutes,
    sessionsCount,
    studyMinutes,
    refrescoMinutes,
    repasoMinutes,
    cantoMinutes,
    topicsTouchedCount: topicsTouchedSet.size,
    topicsTouched: Array.from(topicsTouchedSet),
  };
}

/**
 * Computes Apple Health-style 7-day consistency (Monday through Sunday or trailing 7 days ending today)
 */
export function computeWeeklyConsistency(
  sessions: any[],
  goalMinutes: number = getDailyGoalMinutes(),
  currentStreak: number = 0
): WeeklyConsistencyData {
  const safeGoalMins = Math.max(15, goalMinutes);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Group minutes by date string in O(N)
  const minutesByDate = new Map<string, { total: number; count: number; topics: Set<string> }>();
  for (let i = 0; i < (sessions || []).length; i++) {
    const s = sessions[i];
    if (!s || !s.date) continue;
    const dur = Number(s.durationMinutes || s.duration || 0);
    if (dur <= 0) continue;

    let entry = minutesByDate.get(s.date);
    if (!entry) {
      entry = { total: 0, count: 0, topics: new Set() };
      minutesByDate.set(s.date, entry);
    }
    entry.total += dur;
    entry.count += 1;
    if (s.topicId) entry.topics.add(String(s.topicId));
  }

  const dayNames = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const dayShorts = ["D", "L", "M", "X", "J", "V", "S"];

  const days: DayConsistencyData[] = [];
  let totalWeeklyMinutes = 0;
  let completedDaysCount = 0;

  // Trailing 7 days: [today - 6 days ... today]
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today.getTime());
    d.setDate(d.getDate() - i);
    const dateStr = getLocalDateString(d);
    const entry = minutesByDate.get(dateStr) || { total: 0, count: 0, topics: new Set() };

    const totalMins = entry.total;
    totalWeeklyMinutes += totalMins;

    const goalMet = totalMins >= safeGoalMins;
    if (goalMet) completedDaysCount++;

    const isToday = i === 0;
    const dayOfWeek = d.getDay();

    days.push({
      dateStr,
      dayLabel: dayNames[dayOfWeek],
      dayShort: dayShorts[dayOfWeek],
      dayNum: d.getDate(),
      totalMinutes: totalMins,
      totalHours: Math.round((totalMins / 60) * 10) / 10,
      goalMinutes: safeGoalMins,
      goalMet,
      pctOfGoal: Math.min(200, Math.round((totalMins / safeGoalMins) * 100)),
      sessionsCount: entry.count,
      topicsCount: entry.topics.size,
      isToday,
      isFuture: false,
    });
  }

  const totalWeeklyHours = Math.round((totalWeeklyMinutes / 60) * 10) / 10;
  const dailyAverageHours = Math.round((totalWeeklyHours / 7) * 10) / 10;

  return {
    days,
    totalWeeklyMinutes,
    totalWeeklyHours,
    dailyAverageHours,
    completedDaysCount,
    currentStreak,
    bestStreak: Math.max(currentStreak, completedDaysCount),
  };
}

/**
 * Recommender Engine: Sorts and categorizes today's actionable study agenda
 * Hierarchy:
 * 1. Refrescos Diarios (D1, D2, D3) - Short-term memory consolidation
 * 2. Repasos Mensuales SRS due today/overdue - Forgetting curve mitigation
 * 3. Listos para Cantar - Topics that finished 3 refrescos and require oral consolidation
 * 4. Avance de Temario - Next syllabus topic in sequence
 */
export function computeTodayStudyQueue(
  topics: Topic[],
  userProgress: Record<string, TopicProgressData>,
  recentSessions: any[]
): {
  tasks: RecommendedStudyTask[];
  refrescoTasks: RecommendedStudyTask[];
  repasoTasks: RecommendedStudyTask[];
  cantoTasks: RecommendedStudyTask[];
  nuevoTasks: RecommendedStudyTask[];
  totalEstimatedMinutes: number;
} {
  const telemetryIndex = buildSubjectTelemetryIndex(topics, userProgress, recentSessions);
  const tasks: RecommendedStudyTask[] = [];

  const refrescoTasks: RecommendedStudyTask[] = [];
  const repasoTasks: RecommendedStudyTask[] = [];
  const cantoTasks: RecommendedStudyTask[] = [];
  const nuevoTasks: RecommendedStudyTask[] = [];

  let nextTopicCandidate: Topic | null = null;

  for (let i = 0; i < topics.length; i++) {
    const topic = topics[i];
    const telemetry = telemetryIndex.get(topic.id);
    if (!telemetry) continue;

    const { cycle, srs, ebbinghaus, reviewEstimate } = telemetry;
    const prog = userProgress[topic.id];
    const hasStarted = !!(prog && (prog.firstStudyDate || prog.studyTimeHours > 0 || prog.vueltas > 0));

    // 1. Refrescos Diarios
    if (cycle.phase === "en_refrescos") {
      if (!cycle.isRefreshedToday) {
        const estMins = 30;
        const task: RecommendedStudyTask = {
          id: `refresco_${topic.id}`,
          topic,
          priority: 1,
          category: "refresco",
          categoryTitle: "Refresco Diario Obligatorio",
          badgeLabel: cycle.refrescoDayLabel || `Refresco ${cycle.refrescosCount + 1}/3`,
          badgeTheme: {
            bg: "bg-amber-500/10",
            text: "text-amber-600 dark:text-amber-400",
            border: "border-amber-500/30",
            accent: "#f59e0b",
          },
          reason: "Fijación activa a corto plazo antes de que la curva de retención decaiga.",
          subReason: `Paso ${cycle.refrescosCount + 1} de 3 hacia la Vuelta 1 oficial`,
          estimatedMinutes: estMins,
          telemetry,
          actionType: "refresco",
          actionLabel: "Iniciar Refresco",
        };
        refrescoTasks.push(task);
      }
    }

    // 2. Repasos Mensuales SRS
    else if (
      cycle.phase === "repaso_pendiente" ||
      cycle.phase === "repaso_vencido" ||
      srs.isDueToday ||
      srs.isOverdue ||
      ebbinghaus.retention < 68
    ) {
      const isUrgent = srs.isOverdue || cycle.phase === "repaso_vencido" || ebbinghaus.retention < 50;
      const estMins = reviewEstimate?.predictedMinutes || 45;
      const daysOverdue = srs.daysDiff !== null && srs.daysDiff < 0 ? Math.abs(srs.daysDiff) : 0;

      const task: RecommendedStudyTask = {
        id: `repaso_${topic.id}`,
        topic,
        priority: 2,
        category: "repaso",
        categoryTitle: "Repaso Mensual Programado",
        badgeLabel: isUrgent ? (daysOverdue > 0 ? `Vencido ${daysOverdue}d` : "Alerta de Memoria") : "Repaso SRS Hoy",
        badgeTheme: {
          bg: isUrgent ? "bg-rose-500/10" : "bg-indigo-500/10",
          text: isUrgent ? "text-rose-600 dark:text-rose-400" : "text-indigo-600 dark:text-indigo-400",
          border: isUrgent ? "border-rose-500/30" : "border-indigo-500/30",
          accent: isUrgent ? "#e11d48" : "#6366f1",
        },
        reason: `Retención estimada: ${ebbinghaus.retention}%. Momento óptimo de reactivación sináptica.`,
        subReason: `Suma 1 Vuelta completa. Tiempo estimado: ${estMins} min`,
        estimatedMinutes: estMins,
        telemetry,
        actionType: "repaso",
        actionLabel: "+1 Vuelta Rápida",
      };
      repasoTasks.push(task);
    }

    // 3. Listo para Cantar
    else if (cycle.phase === "listo_para_cantar") {
      const task: RecommendedStudyTask = {
        id: `canto_${topic.id}`,
        topic,
        priority: 3,
        category: "canto",
        categoryTitle: "Canto Oficial Preparador",
        badgeLabel: "Listo para Cantar",
        badgeTheme: {
          bg: "bg-fuchsia-500/10",
          text: "text-fuchsia-600 dark:text-fuchsia-400",
          border: "border-fuchsia-500/30",
          accent: "#d946ef",
        },
        reason: "Completaste los 3 refrescos. El tema está maduro para cantarse y sellar la Vuelta 1.",
        subReason: "Pon a prueba tu dicción, ritmo (130-150 ppm) y tiempo de exposición",
        estimatedMinutes: 15,
        telemetry,
        actionType: "canto",
        actionLabel: "Cantar Ahora",
      };
      cantoTasks.push(task);
    }

    // 4. Candidate for next unstarted topic
    if (!hasStarted && !nextTopicCandidate) {
      nextTopicCandidate = topic;
    }
  }

  // Add next unstarted topic if we have room or to recommend progression
  if (nextTopicCandidate) {
    const estMins = 90; // Standard deep study session for unstarted topic
    const telemetry = telemetryIndex.get(nextTopicCandidate.id);
    const task: RecommendedStudyTask = {
      id: `nuevo_${nextTopicCandidate.id}`,
      topic: nextTopicCandidate,
      priority: 4,
      category: "nuevo",
      categoryTitle: "Avance de Temario (Nuevo)",
      badgeLabel: "Siguiente Tema",
      badgeTheme: {
        bg: "bg-emerald-500/10",
        text: "text-emerald-600 dark:text-emerald-400",
        border: "border-emerald-500/30",
        accent: "#10b981",
      },
      reason: "Tema nuevo según el orden del programa oficial para mantener la progresión.",
      subReason: "Estudio inicial a fondo. Iniciará automáticamente el ciclo de 3 refrescos.",
      estimatedMinutes: estMins,
      telemetry,
      actionType: "estudio",
      actionLabel: "Iniciar Estudio",
    };
    nuevoTasks.push(task);
  }

  // Sort within categories:
  // Refrescos: by number
  refrescoTasks.sort((a, b) => a.topic.number - b.topic.number);
  // Repasos: most urgent first (lowest retention or overdue)
  repasoTasks.sort((a, b) => {
    const retA = a.telemetry?.ebbinghaus.retention ?? 100;
    const retB = b.telemetry?.ebbinghaus.retention ?? 100;
    return retA - retB;
  });

  const combinedTasks = [...refrescoTasks, ...repasoTasks, ...cantoTasks, ...nuevoTasks];
  const totalEstimatedMinutes = combinedTasks.reduce((acc, t) => acc + t.estimatedMinutes, 0);

  return {
    tasks: combinedTasks,
    refrescoTasks,
    repasoTasks,
    cantoTasks,
    nuevoTasks,
    totalEstimatedMinutes,
  };
}
