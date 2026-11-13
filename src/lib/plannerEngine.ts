/**
 * WELLS PREP — MOTOR DEL PLANIFICADOR INTELIGENTE DE JUDICATURA
 * 
 * Modela las 4 actividades clave de la oposición:
 * 1. Estudio nuevo (Azul): fijación de temas nuevos en días sin cante.
 * 2. Refresco (Naranja): ciclo de 3 refrescos consecutivos (D+1, D+2, D+3).
 * 3. Repaso (Verde): consolidación de temas de meses anteriores y curva de Ebbinghaus.
 * 4. Cante (Morado): compromiso con preparador (Lunes y Jueves).
 */

import { Topic, Session } from "../types";
import { initialTopics } from "../data/initialData";
import { isCantoSession, getCantoDuration, sessionMatchesTopic } from "./cantoUtils";
import { TopicProgressData } from "./prediction";
import { getLocalDateString, safeParseDate } from "./utils";
import { evaluateTopicPreparation } from "./preparationScore";
import { CanonicalTopic, getCanonicalTopic, buildCanonicalTopicMap, getSessionCategory, sessionDurationMinutes } from "./canonicalTopicService";
import { estimateRetention, captureRetentionPrediction, isSessionAvailableAt } from './retentionModel';
import { selectSessionVersions } from './sessionVersions';
import { getInitialStudyCompletionDate } from './topicCoverage';
import { 
  buildLearnerProfile, 
  estimateAdaptiveDuration, 
  LearnerProfile, 
  AdaptiveDurationEstimate 
} from "./adaptiveLearningEngine";

export type PlannerActivityType = "estudio_nuevo" | "refresco" | "repaso" | "cante";

export type PlannerTaskStatus = "pending" | "completed" | "delayed";

export interface PlannerTask {
  id: string;
  topicId: string;
  topicNumber: number;
  topicTitle: string;
  subjectId: string;
  activityType: PlannerActivityType;
  date: string; // ISO date "YYYY-MM-DD"
  status: PlannerTaskStatus;
  
  // Metadatos de la tarea
  estimatedMinutes: number | null;
  prediction?: AdaptiveDurationEstimate;
  actualMinutes?: number;
  pagesCount?: number;
  estimateSource?: "automatic" | "manual";
  manualEstimatedMinutes?: number;
  volumeSource?: "whole_topic" | "explicit_range" | "explicit_count" | "remaining_initial";
  sessionId?: string;
  sessionLinkStatus?: "linked" | "unlinked" | "missing" | "ambiguous" | "mismatch";
  recordedDate?: string;
  fromPage?: number;
  toPage?: number;
  pagesNumbers?: number[];
  notes?: string;
  
  // Metadatos para refrescos automáticos
  refrescoIndex?: 1 | 2 | 3; // R1, R2 o R3
  sourceStudyTaskId?: string; // ID de la tarea de estudio nuevo que lo originó
  
  // Marcas temporales
  createdAt: string;
  completedAt?: string;
  isMemoryRecommendation?: boolean;
  retentionPrediction?: Record<string, any>;
  pinned?: boolean;
  planningOrigin?: 'manual' | 'cante_proposal' | 'automatic';
  confirmed?: boolean;
  commitmentId?: string;
  dependencyTaskIds?: string[];
  requirement?: 'mandatory' | 'recommendation';
  proposalBasis?: 'actual_completion' | 'proposed_completion' | 'cante_goal' | 'retention' | 'overdue';
  proposedOriginalDate?: string;
}

export interface DayPlan {
  date: string; // "YYYY-MM-DD"
  dayName: string; // "Lunes", "Martes", ...
  shortName: string; // "LUN", "MAR", ...
  dayNumber: number; // 1-31
  monthName: string; // "Nov", ...
  isToday: boolean;
  isPast: boolean;
  isCanteOfficialDay: boolean; // Lunes o Jueves
  tasks: PlannerTask[];
  totalEstimatedMinutes: number;
  totalActualMinutes: number;
  targetDailyMinutes: number;
  isOverloaded: boolean;
  overloadMinutes: number;
  completedTasksCount: number;
  totalTasksCount: number;
  completionRatePct: number;
  hasCante: boolean;
  hasEstudioNuevo: boolean;
  hasRefresco: boolean;
  hasRepaso: boolean;
  realSessionsCount: number;
  unknownDurationTaskCount: number;
}

export interface WeekPlan {
  weekOffset: number; // 0 = actual, -1 = anterior, 1 = siguiente
  startDate: string; // Lunes "YYYY-MM-DD"
  endDate: string; // Domingo "YYYY-MM-DD"
  days: DayPlan[];
  totalEstimatedHours: number;
  unknownDurationTaskCount: number;
  totalActualHours: number;
  totalTargetHours: number;
  totalCompletedTasks: number;
  totalTasksCount: number;
  overloadedDaysCount: number;
  delayedTasksCount: number;
  completionRatePct: number;
  hoursVariance: number; // actual - estimated (en horas)
  intensityLevel: "optima" | "exigente" | "sobrecargada";
  proactiveWarnings: string[];
}

export interface PlannerSettings {
  autoRefreshProtocol?: 'adaptive' | 'three_days' | 'off';
  targetDailyHours: number; // Por defecto: 7.5h
  velocidadEstudioNuevoMinPorPagina: number; // Por defecto: 5.5 min/pág
  velocidadRefrescoMinPorPagina: number; // Por defecto: 2.0 min/pág
  velocidadRepasoMinPorPagina: number; // Por defecto: 3.5 min/pág
  duracionEstimadaCantePorTemaMinutos: number; // Por defecto: 30 min (12:30 cante + 17:30 preparación)
  refresco1DuracionMinutos: number; // Por defecto: 45 min
  refresco2DuracionMinutos: number; // Por defecto: 35 min
  refresco3DuracionMinutos: number; // Por defecto: 25 min
  // Disponibilidad específica por día de la semana o fecha (0=Dom, 1=Lun, ..., 6=Sáb) o clave ISO "YYYY-MM-DD"
  dailyAvailabilityOverrides?: Record<string, number>;
}

export const DEFAULT_PLANNER_SETTINGS: PlannerSettings = {
  autoRefreshProtocol: 'three_days',
  targetDailyHours: 7.5,
  velocidadEstudioNuevoMinPorPagina: 5.5,
  velocidadRefrescoMinPorPagina: 2.0,
  velocidadRepasoMinPorPagina: 3.5,
  duracionEstimadaCantePorTemaMinutos: 30,
  refresco1DuracionMinutos: 45,
  refresco2DuracionMinutos: 35,
  refresco3DuracionMinutos: 25,
  dailyAvailabilityOverrides: {}
};

export const ACTIVITY_CONFIG: Record<
  PlannerActivityType,
  {
    label: string;
    description: string;
    colorHex: string;
    bgClass: string;
    borderClass: string;
    textClass: string;
    badgeClass: string;
    dotClass: string;
  }
> = {
  estudio_nuevo: {
    label: "Estudio Nuevo",
    description: "Fijación inicial del tema en días sin cante",
    colorHex: "#2563eb",
    bgClass: "bg-blue-50/80",
    borderClass: "border-blue-200 hover:border-blue-300",
    textClass: "text-blue-900",
    badgeClass: "bg-blue-100/80 text-blue-800 border-blue-200",
    dotClass: "bg-blue-600"
  },
  refresco: {
    label: "Refresco",
    description: "Contacto de consolidación, con fecha orientativa",
    colorHex: "#ea580c",
    bgClass: "bg-orange-50/80",
    borderClass: "border-orange-200 hover:border-orange-300",
    textClass: "text-orange-900",
    badgeClass: "bg-orange-100/80 text-orange-800 border-orange-200",
    dotClass: "bg-orange-600"
  },
  repaso: {
    label: "Repaso",
    description: "Revisión y comprobación del recuerdo",
    colorHex: "#16a34a",
    bgClass: "bg-emerald-50/80",
    borderClass: "border-emerald-200 hover:border-emerald-300",
    textClass: "text-emerald-900",
    badgeClass: "bg-emerald-100/80 text-emerald-800 border-emerald-200",
    dotClass: "bg-emerald-600"
  },
  cante: {
    label: "Cante",
    description: "Simulacro oral ante preparador (Lunes y Jueves)",
    colorHex: "#9333ea",
    bgClass: "bg-purple-50/80",
    borderClass: "border-purple-200 hover:border-purple-300",
    textClass: "text-purple-900",
    badgeClass: "bg-purple-100/80 text-purple-800 border-purple-200",
    dotClass: "bg-purple-600"
  }
};

/**
 * Calcula el tiempo estimado (en minutos) para una actividad y tema específicos,
 * integrando la Fuente Única de Verdad (páginas y palabras reales del tema),
 * el soporte para estudio de páginas parciales y el perfil de aprendizaje empírico.
 */
export interface PlannerEstimateContext {
  allTopics?: Topic[];
  canonicalMap?: Map<string, CanonicalTopic>;
}

function plannerEstimateInputs(
  topic: Topic | CanonicalTopic | undefined,
  sessions: Session[],
  userProgress: Record<string, TopicProgressData>,
  settings: PlannerSettings,
  context: PlannerEstimateContext,
) {
  const catalogue = context.allTopics || initialTopics;
  const topics = topic ? [...catalogue.filter(item => item.id !== topic.id), topic as Topic] : catalogue;
  const canonicalMap = context.canonicalMap || buildCanonicalTopicMap(topics, userProgress, sessions);
  const canonical = topic ? canonicalMap.get(topic.id) || getCanonicalTopic(topic.id, topics, userProgress, sessions) : undefined;
  const profile = buildLearnerProfile(sessions, canonicalMap);
  // Explicit settings take precedence over empirical subject/global rates in both APIs.
  profile.manualPaces = {
    ...(settings.velocidadEstudioNuevoMinPorPagina !== DEFAULT_PLANNER_SETTINGS.velocidadEstudioNuevoMinPorPagina ? { study: settings.velocidadEstudioNuevoMinPorPagina } : {}),
    ...(settings.velocidadRepasoMinPorPagina !== DEFAULT_PLANNER_SETTINGS.velocidadRepasoMinPorPagina ? { review: settings.velocidadRepasoMinPorPagina } : {}),
    ...(settings.velocidadRefrescoMinPorPagina !== DEFAULT_PLANNER_SETTINGS.velocidadRefrescoMinPorPagina ? { refresh: settings.velocidadRefrescoMinPorPagina } : {}),
  };
  profile.manualDurations = {
    ...(settings.duracionEstimadaCantePorTemaMinutos !== DEFAULT_PLANNER_SETTINGS.duracionEstimadaCantePorTemaMinutos ? { cante: settings.duracionEstimadaCantePorTemaMinutos } : {}),
    ...(settings.refresco1DuracionMinutos !== DEFAULT_PLANNER_SETTINGS.refresco1DuracionMinutos ? { refresh1: settings.refresco1DuracionMinutos } : {}),
    ...(settings.refresco2DuracionMinutos !== DEFAULT_PLANNER_SETTINGS.refresco2DuracionMinutos ? { refresh2: settings.refresco2DuracionMinutos } : {}),
    ...(settings.refresco3DuracionMinutos !== DEFAULT_PLANNER_SETTINGS.refresco3DuracionMinutos ? { refresh3: settings.refresco3DuracionMinutos } : {}),
  };
  return { canonical, profile };
}

export function estimateTaskDurationMinutes(
  topic: Topic | CanonicalTopic | undefined,
  activityType: PlannerActivityType,
  sessions: Session[] = [],
  settings: PlannerSettings = DEFAULT_PLANNER_SETTINGS,
  refrescoIndex?: 1 | 2 | 3,
  userProgress: Record<string, TopicProgressData> = {},
  partialWork?: { fromPage?: number; toPage?: number; targetPages?: number },
  context: PlannerEstimateContext = {},
): number | null {
  return estimateTaskAdaptiveDetails(topic, activityType, sessions, settings, refrescoIndex, userProgress, partialWork, context).estimatedMinutes;
}

/** One calculation supplies both the numeric estimate and its explanation. */
export function estimateTaskAdaptiveDetails(
  topic: Topic | CanonicalTopic | undefined,
  activityType: PlannerActivityType,
  sessions: Session[] = [],
  settings: PlannerSettings = DEFAULT_PLANNER_SETTINGS,
  refrescoIndex?: 1 | 2 | 3,
  userProgress: Record<string, TopicProgressData> = {},
  partialWork?: { fromPage?: number; toPage?: number; targetPages?: number },
  context: PlannerEstimateContext = {},
): AdaptiveDurationEstimate {
  const { canonical, profile } = plannerEstimateInputs(topic, sessions, userProgress, settings, context);
  const estimate = estimateAdaptiveDuration(canonical, activityType, profile, refrescoIndex, partialWork);
  return estimate;
}

function uniquePlannerSessions(sessions: Session[]): Session[] {
  const now = new Date();
  return selectSessionVersions(sessions, now).filter(session => isSessionAvailableAt(session, now));
}

/** Rebuild projections only; this never writes cached estimates or creates sessions. */
export function reconcilePlannerTasks(
  tasks: PlannerTask[], sessions: Session[], settings: PlannerSettings,
  userProgress: Record<string, TopicProgressData> = {}, allTopics: Topic[] = [],
  canonicalMap = buildCanonicalTopicMap(allTopics, userProgress, sessions),
): PlannerTask[] {
  const unique = uniquePlannerSessions(sessions);
  return tasks.map(task => {
    const canonical = canonicalMap.get(task.topicId);
    const exactId = task.sessionId || `planner-${encodeURIComponent(task.id)}`;
    const candidates = unique.filter(session => session.id === exactId || (session as any).plannerTaskId === task.id);
    // Identity establishes the candidate, not its meaning. Editing the observed
    // topic/activity must not credit its minutes to a different planned task.
    const compatible = candidates.filter(session => {
      const category = getSessionCategory(session);
      const activity = category === 'initial_study' ? 'estudio_nuevo' : category === 'review' ? 'repaso'
        : category === 'refresh' ? 'refresco' : category;
      return activity === task.activityType && sessionMatchesTopic(session, canonical || {
        id: task.topicId, subjectId: task.subjectId, number: task.topicNumber, title: task.topicTitle,
      });
    });
    const linked = compatible.find(session => session.id === exactId) || (compatible.length === 1 ? compatible[0] : undefined);
    const hadObservedLink = !!task.sessionId || task.sessionLinkStatus === 'linked' || candidates.length > 0;
    const automatic = task.estimateSource !== 'manual' && task.manualEstimatedMinutes === undefined;
    const explicitRange = task.fromPage !== undefined && task.toPage !== undefined;
    const volumeSource = task.volumeSource || (explicitRange ? 'explicit_range' : 'whole_topic');
    const partial = explicitRange ? { fromPage: task.fromPage, toPage: task.toPage }
      : volumeSource === 'explicit_count' && task.pagesCount ? { targetPages: task.pagesCount } : undefined;
    const estimate = canonical && automatic && !linked ? estimateTaskAdaptiveDetails(canonical, task.activityType, unique, settings, task.refrescoIndex, userProgress, partial, { allTopics, canonicalMap }) : undefined;
    const actualMinutes = linked ? sessionDurationMinutes(linked) : undefined;
    return {
      ...task,
      topicTitle: canonical?.title || task.topicTitle,
      subjectId: canonical?.subjectId || task.subjectId,
      topicNumber: canonical?.number || task.topicNumber,
      estimateSource: automatic ? 'automatic' : 'manual', volumeSource,
      estimatedMinutes: automatic ? (estimate ? estimate.estimatedMinutes : linked ? task.estimatedMinutes : null) : task.manualEstimatedMinutes ?? task.estimatedMinutes,
      prediction: estimate || task.prediction,
      pagesCount: estimate ? (estimate.pagesUsed > 0 ? estimate.pagesUsed : undefined) : task.pagesCount,
      ...(linked ? { sessionId: linked.id, sessionLinkStatus: 'linked' as const, actualMinutes, recordedDate: linked.date, status: 'completed' as const }
        : { sessionLinkStatus: candidates.length && !compatible.length ? 'mismatch' as const : compatible.length > 1 ? 'ambiguous' as const : task.sessionId ? 'missing' as const : 'unlinked' as const,
            actualMinutes: undefined, recordedDate: undefined,
            ...(hadObservedLink ? { status: 'pending' as const, completedAt: undefined } : {}) }),
    };
  });
}

/**
 * Calcula las 3 fechas hábiles consecutivas para los refrescos posteriores
 * al estudio de un tema nuevo.
 */
export function calculateNextStudyDays(startDateStr: string, count: number = 3): string[] {
  const result: string[] = [];
  const curr = safeParseDate(startDateStr);
  curr.setHours(0, 0, 0, 0);

  // Avanzamos día a día añadiendo días naturales/hábiles de estudio
  while (result.length < count) {
    curr.setDate(curr.getDate() + 1);
    result.push(getLocalDateString(curr));
  }
  return result;
}

/**
 * Genera automáticamente los 3 refrescos posteriores cuando se completa un estudio nuevo.
 * Garantiza que no existan duplicados y utiliza la volumetría real exacta del tema.
 */
export function generateAutoRefrescos(
  completedStudyTask: PlannerTask,
  topic: Topic | CanonicalTopic | undefined,
  existingTasks: PlannerTask[],
  settings: PlannerSettings = DEFAULT_PLANNER_SETTINGS,
  userProgress: Record<string, TopicProgressData> = {},
  sessions: Session[] = [],
  context: PlannerEstimateContext = {},
): PlannerTask[] {
  if (completedStudyTask.activityType !== "estudio_nuevo") {
    return [];
  }
  if (settings.autoRefreshProtocol === 'off') return [];
  if (!topic || topic.id !== completedStudyTask.topicId) return [];
  // Both protocols start from the same observed, whole-topic completion.
  // A completed block/task alone never completes its parent topic.
  const catalogue = [...(context.allTopics || []).filter(item => item.id !== topic.id), topic as Topic];
  const canonicalMap = buildCanonicalTopicMap(catalogue, userProgress, sessions);
  const canonical = canonicalMap.get(topic.id);
  const finishDate = canonical ? getInitialStudyCompletionDate(canonical.pages, canonical.sessions) : null;
  if (!canonical || !finishDate) return [];
  const realPages = canonical.pages;
  const wholeTopicWork = { targetPages: realPages };
  if (settings.autoRefreshProtocol !== 'three_days') {
    const id = `refresco-${encodeURIComponent(canonical.id)}-${finishDate}-adaptive`;
    if (existingTasks.some(task => task.id === id || task.sourceStudyTaskId === completedStudyTask.id)) return [];
    const canteDate = existingTasks.filter(task => task.topicId === topic.id && task.activityType === 'cante' && task.status !== 'completed' && task.date >= finishDate)
      .map(task => task.date).sort()[0];
    const recommendation = estimateRetention({ topic: canonical, history: sessions, topics: canonicalMap,
      asOf: new Date(), canteDate,
      config: context.canonicalMap?.get(topic.id)?.retentionEstimate?.policy });
    if (!recommendation.recommendedDate) return [];
    if (existingTasks.some(task => task.topicId === canonical.id && task.activityType === 'refresco' && task.date === recommendation.recommendedDate)) return [];
    return [{ id, topicId: canonical.id, topicNumber: canonical.number, topicTitle: canonical.title,
      subjectId: canonical.subjectId, activityType: 'refresco', date: recommendation.recommendedDate,
      status: 'pending', estimatedMinutes: estimateTaskDurationMinutes(canonical, 'refresco', sessions, settings, 1, userProgress, wholeTopicWork, { ...context, canonicalMap }),
      pagesCount: realPages, volumeSource: 'whole_topic', requirement: 'recommendation', proposalBasis: 'actual_completion', planningOrigin: 'automatic',
      sourceStudyTaskId: completedStudyTask.id, estimateSource: 'automatic', isMemoryRecommendation: true,
      retentionPrediction: captureRetentionPrediction(recommendation),
      notes: `Sugerencia flexible, no cita de cante. ${recommendation.reasons.join(' ')}`,
      createdAt: new Date().toISOString() }];
  }

  const topicId = completedStudyTask.topicId;

  // Each origin task/index is stable; missing refreshes can be regenerated individually.
  const refreshDates = calculateNextStudyDays(finishDate, 3);

  // The protocol starts after the topic is complete and refreshes that topic,
  // not merely the final initial-study block that happened to finish it.
  const partialWork = wholeTopicWork;

  const newRefrescos: PlannerTask[] = [];
  const refrescoIndices: Array<1 | 2 | 3> = [1, 2, 3];

  refrescoIndices.forEach((idx, i) => {
    const stableId = `refresco-${encodeURIComponent(topicId)}-${finishDate}-${idx}`;
    if (existingTasks.some(task => task.id === stableId || (task.topicId === topicId && task.date === refreshDates[i] && task.activityType === 'refresco')
      || (task.sourceStudyTaskId === completedStudyTask.id && task.refrescoIndex === idx))) return;
    const taskDate = refreshDates[i];
    const estimatedMins = estimateTaskDurationMinutes(canonical, "refresco", sessions, settings, idx, userProgress, partialWork, context);

    newRefrescos.push({
      id: stableId,
      topicId,
      topicNumber: completedStudyTask.topicNumber,
      topicTitle: completedStudyTask.topicTitle,
      subjectId: completedStudyTask.subjectId,
      activityType: "refresco",
      date: taskDate,
      status: "pending",
      estimatedMinutes: estimatedMins,
      pagesCount: realPages || undefined,
      volumeSource: 'whole_topic',
      estimateSource: 'automatic',
      refrescoIndex: idx,
      sourceStudyTaskId: completedStudyTask.id,
      requirement: 'mandatory', proposalBasis: 'actual_completion', planningOrigin: 'automatic',
      notes: `Protocolo: refresco ${idx}/3 tras completar el estudio inicial el ${finishDate}. No demuestra retención.`,
      createdAt: new Date().toISOString()
    });
  });

  return newRefrescos;
}

/**
 * Construye la estructura semanal completa de Lunes a Domingo para una semana determinada.
 */
export function buildWeekPlan(
  tasks: PlannerTask[],
  weekOffset: number = 0,
  settings: PlannerSettings = DEFAULT_PLANNER_SETTINGS,
  referenceDate: Date = new Date(),
  sessions: Session[] = [],
  userProgress: Record<string, TopicProgressData> = {},
  allTopics: Topic[] = []
): WeekPlan {
  const uniqueSessions = uniquePlannerSessions(sessions);
  const projectedTasks = reconcilePlannerTasks(tasks, uniqueSessions, settings, userProgress, allTopics);
  const today = new Date(referenceDate);
  const todayStr = getLocalDateString(today);
  const currentDayOfWeek = today.getDay(); // 0 Dom, 1 Lun, ...
  
  // Calcular Lunes de la semana seleccionada
  const distToMonday = currentDayOfWeek === 0 ? -6 : 1 - currentDayOfWeek;
  const monday = new Date(today);
  monday.setDate(today.getDate() + distToMonday + weekOffset * 7);
  monday.setHours(0, 0, 0, 0);

  const dayNames = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
  const shortNames = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];

  const days: DayPlan[] = [];
  let totalWeekEstMins = 0;
  let totalWeekActMins = 0;
  let totalWeekCompleted = 0;
  let totalWeekTasks = 0;
  let overloadedDaysCount = 0;
  let delayedTasksCount = 0;

  const targetDailyMinutes = Math.round(settings.targetDailyHours * 60);

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dateStr = getLocalDateString(d);
    
    const isToday = dateStr === todayStr;
    const isPast = dateStr < todayStr;
    const isCanteOfficialDay = i === 0 || i === 3; // Lunes o Jueves

    // Filtrar tareas correspondientes a este día
    const dayTasks = projectedTasks.filter((t) => t.date === dateStr);

    // Actualizar estado 'delayed' si está en el pasado y sigue pendiente
    const processedTasks = dayTasks.map((t) => {
      if (isPast && t.status === "pending") {
        delayedTasksCount++;
        return { ...t, status: "delayed" as PlannerTaskStatus };
      }
      return t;
    });

    const dayEstMins = processedTasks.reduce((acc, t) => acc + (t.estimatedMinutes || 0), 0);
    
    // Telemetría real de sesiones registradas en WellsPrep/AeroFocus
    const realDaySessions = uniqueSessions.filter((session) => (session.date || "").startsWith(dateStr));
    const dayActMins = realDaySessions.reduce((sum, session) => sum + (isCantoSession(session)
      ? getCantoDuration(session).totalSecs / 60 : Number(session.durationMinutes || (session as any).duration || 0)), 0);

    const completedCount = processedTasks.filter((t) => t.status === "completed").length;
    const completionRatePct = processedTasks.length > 0 
      ? Math.round((completedCount / processedTasks.length) * 100) 
      : 0;

    // Disponibilidad diaria específica (overrides por día de semana o fecha ISO)
    const dayOfWeekIndex = d.getDay(); // 0 Dom, 1 Lun, ...
    let daySpecificHours = settings.targetDailyHours;
    if (settings.dailyAvailabilityOverrides) {
      if (settings.dailyAvailabilityOverrides[dateStr] !== undefined) {
        daySpecificHours = settings.dailyAvailabilityOverrides[dateStr];
      } else if (settings.dailyAvailabilityOverrides[String(dayOfWeekIndex)] !== undefined) {
        daySpecificHours = settings.dailyAvailabilityOverrides[String(dayOfWeekIndex)];
      }
    }
    const dayTargetDailyMinutes = Math.round(daySpecificHours * 60);

    const isOverloaded = dayEstMins > dayTargetDailyMinutes;
    const overloadMinutes = Math.max(0, dayEstMins - dayTargetDailyMinutes);
    if (isOverloaded) overloadedDaysCount++;

    totalWeekEstMins += dayEstMins;
    totalWeekActMins += dayActMins;
    totalWeekCompleted += completedCount;
    totalWeekTasks += processedTasks.length;

    const hasCante = processedTasks.some((t) => t.activityType === "cante") || isCanteOfficialDay;
    const hasEstudioNuevo = processedTasks.some((t) => t.activityType === "estudio_nuevo");
    const hasRefresco = processedTasks.some((t) => t.activityType === "refresco");
    const hasRepaso = processedTasks.some((t) => t.activityType === "repaso");

    days.push({
      date: dateStr,
      dayName: dayNames[i],
      shortName: shortNames[i],
      dayNumber: d.getDate(),
      monthName: d.toLocaleDateString("es-ES", { month: "short" }),
      isToday,
      isPast,
      isCanteOfficialDay,
      tasks: processedTasks,
      totalEstimatedMinutes: dayEstMins,
      totalActualMinutes: dayActMins,
      targetDailyMinutes: dayTargetDailyMinutes,
      isOverloaded,
      overloadMinutes,
      completedTasksCount: completedCount,
      totalTasksCount: processedTasks.length,
      completionRatePct,
      hasCante,
      hasEstudioNuevo,
      hasRefresco,
      hasRepaso,
      realSessionsCount: realDaySessions.length,
      unknownDurationTaskCount: processedTasks.filter(task => task.estimatedMinutes === null || task.estimatedMinutes === undefined).length
    });
  }

  const totalEstimatedHours = Math.round((totalWeekEstMins / 60) * 10) / 10;
  const totalActualHours = Math.round((totalWeekActMins / 60) * 10) / 10;
  const totalTargetHours = Math.round(days.reduce((sum, day) => sum + day.targetDailyMinutes, 0) / 60 * 10) / 10;
  const completionRatePct = totalWeekTasks > 0 ? Math.round((totalWeekCompleted / totalWeekTasks) * 100) : 0;
  const hoursVariance = Math.round((totalActualHours - totalEstimatedHours) * 10) / 10;

  let intensityLevel: "optima" | "exigente" | "sobrecargada" = "optima";
  if (totalEstimatedHours > 48) {
    intensityLevel = "sobrecargada";
  } else if (totalEstimatedHours > 42) {
    intensityLevel = "exigente";
  }

  // Generar advertencias y diagnósticos preventivos
  const proactiveWarnings: string[] = [];
  const unknownDurationTaskCount = days.reduce((sum, day) => sum + day.unknownDurationTaskCount, 0);
  if (unknownDurationTaskCount) proactiveWarnings.push(`${unknownDurationTaskCount} tareas sin duración estimable: la suma de tiempo incluye sólo las estimaciones disponibles.`);
  
  // Miércoles víspera de Cante con estudio nuevo
  const miercoles = days[2];
  if (miercoles && miercoles.hasEstudioNuevo) {
    proactiveWarnings.push("Víspera de cante (Miércoles): tienes programado estudio nuevo. Se recomienda reservar la tarde para repaso y cante oral.");
  }

  // Domingo con alta carga antes del cante de Lunes
  const domingo = days[6];
  if (domingo && domingo.totalEstimatedMinutes > 360) {
    proactiveWarnings.push("Domingo previo al cante de Lunes con carga elevada (>6h). Conviene dejar margen de descanso para rendir con agilidad mental.");
  }

  if (overloadedDaysCount > 0) {
    proactiveWarnings.push(`Detectados ${overloadedDaysCount} ${overloadedDaysCount === 1 ? "día sobrecargado" : "días sobrecargados"} sobre el límite de ${settings.targetDailyHours}h.`);
  }

  if (delayedTasksCount > 0) {
    proactiveWarnings.push(`${delayedTasksCount} ${delayedTasksCount === 1 ? "tarea pendiente acumulada" : "tareas pendientes acumuladas"} de jornadas anteriores.`);
  }

  return {
    weekOffset,
    startDate: days[0].date,
    endDate: days[6].date,
    days,
    totalEstimatedHours,
    unknownDurationTaskCount,
    totalActualHours,
    totalTargetHours,
    totalCompletedTasks: totalWeekCompleted,
    totalTasksCount: totalWeekTasks,
    overloadedDaysCount,
    delayedTasksCount,
    completionRatePct,
    hoursVariance,
    intensityLevel,
    proactiveWarnings
  };
}

export interface ProposedRebalanceMove {
  taskId: string;
  topicTitle: string;
  topicNumber: number;
  activityType: PlannerActivityType;
  fromDate: string;
  toDate: string;
  fromDayName: string;
  toDayName: string;
  minutesSaved: number;
  reason: string;
}

export interface RebalanceProposal {
  moves: ProposedRebalanceMove[];
  originalOverloadedDays: number;
  projectedOverloadedDays: number;
  explanation: string;
}

/**
 * Propone una redistribución inteligente para resolver sobrecargas y tareas retrasadas,
 * respetando estrictamente las prioridades (Cantes inamovibles, Refrescos secuenciales)
 * y solicitando confirmación al usuario antes de aplicar ningún cambio.
 */
export function proposeSmartRebalance(
  weekPlan: WeekPlan,
  allTasks: PlannerTask[],
  settings: PlannerSettings = DEFAULT_PLANNER_SETTINGS
): RebalanceProposal {
  const targetDailyMins = Math.round(settings.targetDailyHours * 60);
  const moves: ProposedRebalanceMove[] = [];

  // Copia de trabajo de los minutos por día
  const dayMinutesMap: Record<string, number> = {};
  weekPlan.days.forEach((d) => {
    dayMinutesMap[d.date] = d.totalEstimatedMinutes;
  });

  // 1. Identificar días sobrecargados
  const overloadedDays = weekPlan.days.filter((d) => d.totalEstimatedMinutes > d.targetDailyMinutes);

  for (const overloadedDay of overloadedDays) {
    let excessMinutes = dayMinutesMap[overloadedDay.date] - overloadedDay.targetDailyMinutes;
    if (excessMinutes <= 15) continue;

    // Candidatos a mover: repasos libres o estudios nuevos (NUNCA mover cantes oficiales)
    const movableTasks = overloadedDay.tasks.filter(
      (t) => t.status !== "completed" && t.activityType !== "cante" && t.estimatedMinutes !== null && t.estimatedMinutes !== undefined && t.activityType !== "refresco"
        && !allTasks.some(dependent => dependent.sourceStudyTaskId === t.id)
    ).sort((a, b) => {
      // Priorizar mover repasos antes que estudio nuevo
      if (a.activityType === "repaso" && b.activityType !== "repaso") return -1;
      if (b.activityType === "repaso" && a.activityType !== "repaso") return 1;
      return a.estimatedMinutes - b.estimatedMinutes;
    });

    for (const task of movableTasks) {
      if (excessMinutes <= 15) break;

      // Buscar un día receptor en la misma semana que tenga capacidad disponible
      const targetDay = weekPlan.days.find((candidate) => {
        if (candidate.date <= overloadedDay.date) return false; // Hacia adelante
        const currentMins = dayMinutesMap[candidate.date] || 0;
        return candidate.targetDailyMinutes > 0 && currentMins + task.estimatedMinutes <= candidate.targetDailyMinutes;
      });

      if (targetDay) {
        moves.push({
          taskId: task.id,
          topicTitle: task.topicTitle,
          topicNumber: task.topicNumber,
          activityType: task.activityType,
          fromDate: overloadedDay.date,
          toDate: targetDay.date,
          fromDayName: overloadedDay.dayName,
          toDayName: targetDay.dayName,
          minutesSaved: task.estimatedMinutes,
          reason: `Aliviar sobrecarga de ${overloadedDay.dayName} (+${Math.round(excessMinutes)} min)`
        });

        // Actualizar mapa simulado
        dayMinutesMap[overloadedDay.date] -= task.estimatedMinutes;
        dayMinutesMap[targetDay.date] = (dayMinutesMap[targetDay.date] || 0) + task.estimatedMinutes;
        excessMinutes -= task.estimatedMinutes;
      }
    }
  }

  // Contar días sobrecargados resultantes
  let projectedOverloaded = 0;
  weekPlan.days.forEach(day => {
    if (dayMinutesMap[day.date] > day.targetDailyMinutes) projectedOverloaded++;
  });

  return {
    moves,
    originalOverloadedDays: overloadedDays.length,
    projectedOverloadedDays: projectedOverloaded,
    explanation: moves.length > 0 
      ? `Se propone reubicar ${moves.length} tareas para equilibrar la semana por debajo de ${settings.targetDailyHours}h diarias.`
      : "La semana se encuentra actualmente bien distribuida o los compromisos fijos no admiten traslado automático."
  };
}
