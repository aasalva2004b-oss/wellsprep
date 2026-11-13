/**
 * Engine de Organización y Planificación Semanal Dinámica para Cantes de Oposición
 * 
 * Basado en las directrices del opositor:
 * 1. Recálculo automático en tiempo real: Si un día se estudia más o menos de lo previsto,
 *    la carga de páginas restantes se redistribuye equilibradamente en los días previos al cante.
 * 2. Métrica de esfuerzo ponderada: Páginas ponderadas por el ritmo histórico personal (minutos/página).
 * 3. Protocolo de Día de Cante: La mañana del día de cante se reserva estrictamente para repaso general,
 *    salvo un buffer de 1-2 horas si a un tema le falta poco para terminarse (>= 80% completado).
 */

import { Topic, Session } from "../types";
import { getLocalDateString, safeParseDate } from "./utils";
import { getCanonicalTopic, buildCanonicalTopicMap, type CanonicalTopic } from "./canonicalTopicService";
import { isCantoSession, sessionMatchesTopic } from "./cantoUtils";
import { deriveInitialStudyCoverage } from "./topicCoverage";
import { estimatePersonalizedDuration } from "./personalizedEstimator";

export interface TopicCanteGoal {
  topicId: string;
  topicNumber: number;
  topicTitle: string;
  subjectId: string;
  totalPages: number;           // Total de páginas del tema (personalizable)
  completedPages: number;        // Páginas ya estudiadas para este cante
  currentStartPage: number;     // Página de partida
  isComplete: boolean;
  minutesPerPage: number | null; // Unknown until observed initial-study evidence exists
  difficulty: number;
  /** Initial-study evidence only. Numeric legacy fields below are not exact when false. */
  hasKnownProgress: boolean;
  coverageStatus: 'known' | 'partial' | 'unknown' | 'conflict';
  remainingPages: number | null;
  studiedPageNumbers: number[];
  canLocateRemainingPages: boolean;
  progressIssues: string[];
  paceIsEstimated: boolean;
  paceSampleCount: number;
}

export interface DayTopicTask {
  topicId: string;
  topicNumber: number;
  topicTitle: string;
  subjectId: string;
  totalPages: number;
  fromPage: number;
  toPage: number;
  pagesCount: number;
  estimatedMinutes: number | null;
  minutesPerPage: number | null;
  estimateInterval?: { low: number; high: number } | null;
  estimateEvidenceCount?: number;
  estimateMethod?: string;
  estimateFactors?: string[];
  isCanteMorningBuffer: boolean; // Si se permite en la mañana de cante para rematar
  isCompleted: boolean;
  actualPagesCompleted?: number;
}

export interface DayStudyQuota {
  date: string;                  // "YYYY-MM-DD"
  dayName: string;               // "Lunes", "Martes", etc.
  shortName: string;             // "LUN", "MAR", etc.
  isCanteDay: boolean;           // Si es día oficial de cante (Lunes o Jueves)
  isCanteMorningReview: boolean; // Mañana de repaso mental y oral
  isToday: boolean;
  isPast: boolean;
  isFuture: boolean;
  totalPlannedPages: number;
  totalPlannedMinutes: number;
  unknownDurationTaskCount: number;
  totalActualPagesCompleted: number;
  totalActualMinutesStudied: number;
  tasks: DayTopicTask[];
  status: "pending" | "completed" | "underperformed" | "overperformed" | "resting";
  rebalanceNote?: string;
}

export interface WeeklyCantePlan {
  id: string;
  targetCanteDay: "lunes" | "jueves";
  targetCanteDate: string;       // "YYYY-MM-DD"
  daysRemaining: number;
  cycleStartDate: string;        // "YYYY-MM-DD"
  cycleEndDate: string;          // "YYYY-MM-DD"
  assignedTopicIds: string[];
  topicGoals: Record<string, TopicCanteGoal>;
  dailyQuotas: Record<string, DayStudyQuota>; // Keyed by ISO date
  historicalAverageMinPerPage: number | null;
  unknownDurationTaskCount: number;
  totalTargetPages: number;
  totalCompletedPages: number;
  overallProgressPct: number;
  lastRebalancedAt: string;
  status: "on_track" | "ahead" | "behind" | "urgent" | "needs_evidence";
  hasUnknownProgress: boolean;
  overallProgressKnown: boolean;
  evidenceWarnings: string[];
}

export const CANTE_PLAN_STORAGE_KEY = "wellsprep_weekly_cante_plan_v2";

/**
 * Ritmo por defecto en minutos por página cuando no hay suficientes datos históricos.
 * Basado en oposiciones jurídicas de alta exigencia (Judicatura / Fiscal / Notarías).
 */
export const DEFAULT_PACE_MINUTES_PER_PAGE = {
  primer_estudio: 5.5,
  repaso: 3.5,
  refresco: 2.0,
  general: 3.8
};

/**
 * Calcula el ritmo histórico personal (minutos/página) para un tema específico
 * o la media general del opositor a partir de sus sesiones reales.
 */
export function calculateTopicHistoricalPace(
  topicId: string,
  topic: Topic | undefined,
  sessions: Session[],
  _legacyDefaultPace?: number,
  userProgress?: Record<string, any>,
  allTopics: Topic[] = [],
  asOf: Date = new Date(),
  topicState?: Map<string, CanonicalTopic>,
): { minutesPerPage: number | null; isEstimated: boolean; sampleCount: number } {
  const definitions = allTopics.length ? allTopics : topic ? [topic] : [];
  const topics = topicState || buildCanonicalTopicMap(definitions, userProgress, sessions);
  const canonical = topics.get(topicId) || getCanonicalTopic(topicId, definitions, userProgress, sessions);
  const estimate = estimatePersonalizedDuration({
    topic: canonical, activity: 'estudio_nuevo', history: sessions, topics, asOf,
    work: { pages: 1 },
  });
  return {
    minutesPerPage: estimate.estimatedMinutesPerPage ?? null,
    isEstimated: estimate.estimatedMinutes === null || !sessions.some(session => session.topicId === topicId && ['primer_estudio', 'estudio_inicial', 'estudio'].includes(session.type)),
    sampleCount: estimate.evidenceCount,
  };
}

/**
 * Obtiene el objetivo del próximo cante (Lunes o Jueves) y la fecha de referencia.
 */
export function getNextCanteTarget(referenceDate: Date = new Date()): {
  targetDay: "lunes" | "jueves";
  targetDate: string;
  daysRemaining: number;
  cycleStartDate: string;
} {
  const now = new Date(referenceDate);
  const dayOfWeek = now.getDay(); // 0 Dom, 1 Lun, 2 Mar, 3 Mié, 4 Jue, 5 Vie, 6 Sáb
  const currentHour = now.getHours();

  let targetDay: "lunes" | "jueves" = "jueves";
  let daysToAdd = 0;
  let cycleStartDaysAgo = 0;

  if (dayOfWeek === 1) { // Lunes
    if (currentHour < 21) {
      targetDay = "lunes";
      daysToAdd = 0;
      cycleStartDaysAgo = 4; // Empezó el jueves pasado tras el cante
    } else {
      targetDay = "jueves";
      daysToAdd = 3;
      cycleStartDaysAgo = 0;
    }
  } else if (dayOfWeek === 2) { // Martes
    targetDay = "jueves";
    daysToAdd = 2;
    cycleStartDaysAgo = 1; // Empezó el lunes tras el cante
  } else if (dayOfWeek === 3) { // Miércoles
    targetDay = "jueves";
    daysToAdd = 1;
    cycleStartDaysAgo = 2;
  } else if (dayOfWeek === 4) { // Jueves
    if (currentHour < 21) {
      targetDay = "jueves";
      daysToAdd = 0;
      cycleStartDaysAgo = 3; // Empezó el lunes
    } else {
      targetDay = "lunes";
      daysToAdd = 4;
      cycleStartDaysAgo = 0;
    }
  } else if (dayOfWeek === 5) { // Viernes
    targetDay = "lunes";
    daysToAdd = 3;
    cycleStartDaysAgo = 1;
  } else if (dayOfWeek === 6) { // Sábado
    targetDay = "lunes";
    daysToAdd = 2;
    cycleStartDaysAgo = 2;
  } else { // Domingo (0)
    targetDay = "lunes";
    daysToAdd = 1;
    cycleStartDaysAgo = 3;
  }

  const targetDateObj = new Date(now);
  targetDateObj.setDate(now.getDate() + daysToAdd);
  const targetDate = getLocalDateString(targetDateObj);

  const cycleStartObj = new Date(now);
  cycleStartObj.setDate(now.getDate() - cycleStartDaysAgo);
  const cycleStartDate = getLocalDateString(cycleStartObj);

  return {
    targetDay,
    targetDate,
    daysRemaining: daysToAdd,
    cycleStartDate
  };
}

/**
 * Obtiene la lista ordenada de fechas ISO desde cycleStartDate hasta targetDate inclusive.
 */
function getDateRange(startDateStr: string, endDateStr: string): string[] {
  const dates: string[] = [];
  const start = safeParseDate(startDateStr);
  const end = safeParseDate(endDateStr);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  const curr = new Date(start);
  while (curr <= end) {
    dates.push(getLocalDateString(curr));
    curr.setDate(curr.getDate() + 1);
  }
  return dates;
}

const SPANISH_DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const SPANISH_SHORT_DAYS = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];

/**
 * REBALANCE ENGINE:
 * Construye o recalcula el plan de estudio diario para cumplir con todos los temas asignados.
 * 
 * Reglas fundamentales:
 * 1. Cada día tiene una asignación clara de páginas ("Págs. X a Y") y tiempo estimado.
 * 2. Si un día pasado o actual tuvo menos páginas completadas, el remanente se distribuye automáticamente
 *    entre los días restantes antes del cante.
 * 3. En el día de cante, la mañana se destina a REPASO GENERAL de todos los temas.
 *    Excepción: si a algún tema le falta <= 6 páginas o está >= 80% completado, se le reserva un
 *    buffer de máximo 60-90 minutos en la mañana para rematarlo antes del repaso general.
 */
export function buildOrRebalanceWeeklyCantePlan(params: {
  assignedTopicIds: string[];
  targetDay: "lunes" | "jueves";
  targetDate?: string;
  allTopics: Topic[];
  sessions: Session[];
  topicState?: Map<string, CanonicalTopic>;
  existingPlan?: WeeklyCantePlan | null;
  referenceDate?: Date;
  /** Legacy copies are retained at the boundary but are not authoritative metadata. */
  customTopicPages?: Record<string, number>;
  userProgress?: Record<string, any>;
  progressOverrides?: Record<string, { completedPages: number }>;
  manualDayCompletions?: Record<string, Record<string, boolean>>;
}): WeeklyCantePlan {
  const now = new Date(params.referenceDate || new Date());
  const todayStr = getLocalDateString(now);
  const today = safeParseDate(todayStr);
  const targetDay = params.targetDay;
  const requestedDay = targetDay === 'lunes' ? 1 : 4;
  const target = params.targetDate ? safeParseDate(params.targetDate) : new Date(today);
  if (!params.targetDate) {
    let offset = (requestedDay - now.getDay() + 7) % 7;
    if (offset === 0 && now.getHours() >= 21) offset = 7;
    target.setDate(target.getDate() + offset);
  }
  const targetDate = getLocalDateString(target);
  const cycleStart = new Date(target);
  cycleStart.setDate(cycleStart.getDate() - (targetDay === 'lunes' ? 4 : 3));
  const cycleStartDate = getLocalDateString(cycleStart);
  const daysRemaining = Math.max(0, Math.round((target.getTime() - today.getTime()) / 86_400_000));
  const dateList = getDateRange(cycleStartDate, targetDate);
  const topicMap = new Map(params.allTopics.map(topic => [topic.id, topic]));
  const assignedIds = [...new Set(params.assignedTopicIds)];
  const evidenceWarnings: string[] = [];
  const topicGoals: Record<string, TopicCanteGoal> = {};
  const missingByTopic = new Map<string, number[]>();
  const canonicalByTopic = params.topicState || buildCanonicalTopicMap(params.allTopics, params.userProgress, params.sessions);
  const seenSessionIds = new Set<string>();
  const sessions = params.sessions.filter(session => {
    if (!session.id) return true;
    if (seenSessionIds.has(session.id)) return false;
    seenSessionIds.add(session.id);
    return true;
  });

  for (const topicId of assignedIds) {
    const canonical = params.topicState?.get(topicId)
      || getCanonicalTopic(topicId, params.allTopics, params.userProgress, sessions);
    canonicalByTopic.set(topicId, canonical);
    const coverage = canonical.initialStudyCoverage;
    const hasKnownProgress = canonical.hasExplicitPages
      && coverage.studiedPages !== null && coverage.remainingPages !== null
      && coverage.status !== 'unknown' && coverage.status !== 'conflict';
    const studied = hasKnownProgress ? coverage.studiedPages! : 0;
    const remaining = hasKnownProgress ? coverage.remainingPages : null;
    const complete = hasKnownProgress && remaining === 0;
    const located = complete || (hasKnownProgress && Number.isInteger(canonical.pages)
      && coverage.pageNumbers.length === studied && !coverage.unlocatedStudy);
    const knownPages = new Set(coverage.pageNumbers);
    const missing = located && !complete
      ? Array.from({ length: canonical.pages }, (_, index) => index + 1).filter(page => !knownPages.has(page))
      : [];
    missingByTopic.set(topicId, missing);
    const issues = [...coverage.issues];
    if (params.customTopicPages?.[topicId] !== undefined && params.customTopicPages[topicId] !== canonical.pages) {
      issues.push('Se ignora una copia antigua de extensión: prevalecen los parámetros del tema.');
    }
    if (params.progressOverrides?.[topicId] !== undefined) {
      issues.push('El contador manual histórico no identifica páginas estudiadas y no sustituye las sesiones.');
    }
    if (!canonical.hasExplicitPages) issues.push('Falta medir la extensión del tema.');
    if (hasKnownProgress && !located && !complete) issues.push('La cantidad pendiente es conocida, pero necesita bloques o rangos explícitos para distribuirse.');
    evidenceWarnings.push(...issues);
    const pace = calculateTopicHistoricalPace(topicId, topicMap.get(topicId), sessions,
      undefined, params.userProgress, params.allTopics, now, canonicalByTopic);
    topicGoals[topicId] = {
      topicId, topicNumber: canonical.number, topicTitle: canonical.title, subjectId: canonical.subjectId,
      totalPages: canonical.pages, completedPages: studied,
      currentStartPage: complete ? canonical.pages + 1 : missing[0] || 0,
      isComplete: complete, minutesPerPage: pace.minutesPerPage, difficulty: canonical.difficulty,
      hasKnownProgress, coverageStatus: coverage.status, remainingPages: remaining,
      studiedPageNumbers: [...coverage.pageNumbers], canLocateRemainingPages: located,
      progressIssues: [...new Set(issues)], paceIsEstimated: pace.isEstimated, paceSampleCount: pace.sampleCount,
    };
  }

  const matchesAssigned = (session: Session) => assignedIds.some(topicId => {
    const canonical = canonicalByTopic.get(topicId)!;
    return sessionMatchesTopic(session, canonical);
  });
  const assignedSessions = sessions.filter(matchesAssigned);
  const dailyQuotas: Record<string, DayStudyQuota> = {};
  for (const date of dateList) {
    const value = safeParseDate(date);
    const daySessions = assignedSessions.filter(session => session.date?.slice(0, 10) === date);
    const minutes = daySessions.reduce((sum, session) => sum + Number(session.durationMinutes || 0)
      + (isCantoSession(session) ? Number(session.cantoSeconds || 0) / 60 : 0), 0);
    dailyQuotas[date] = {
      date, dayName: SPANISH_DAY_NAMES[value.getDay()], shortName: SPANISH_SHORT_DAYS[value.getDay()],
      isCanteDay: date === targetDate, isCanteMorningReview: date === targetDate,
      isToday: date === todayStr, isPast: date < todayStr, isFuture: date > todayStr,
      totalPlannedPages: 0, totalPlannedMinutes: 0, unknownDurationTaskCount: 0, totalActualPagesCompleted: 0,
      totalActualMinutesStudied: minutes, tasks: [],
      status: date < todayStr ? (minutes > 0 ? 'completed' : 'resting') : 'pending',
    };
  }

  // Reuse the domain projection to credit a page only on its first recorded initial-study day.
  // Review/refresco/cante sessions never contribute new initial pages.
  for (const topicId of assignedIds) {
    const canonical = canonicalByTopic.get(topicId)!;
    const topicSessions = assignedSessions.filter(session => sessionMatchesTopic(session, canonical));
    let credited = new Set(deriveInitialStudyCoverage(canonical.pages,
      topicSessions.filter(session => session.date < cycleStartDate)).pageNumbers);
    for (const date of dateList) {
      const through = deriveInitialStudyCoverage(canonical.pages,
        topicSessions.filter(session => session.date <= date && session.date <= todayStr)).pageNumbers;
      const newlyKnown = through.filter(page => !credited.has(page));
      dailyQuotas[date].totalActualPagesCompleted += newlyKnown.length;
      newlyKnown.forEach(page => credited.add(page));
    }
  }

  const studyDays = dateList.filter(date => date >= todayStr && date < targetDate);
  const appendPages = (date: string, goal: TopicCanteGoal, pages: number[], buffer: boolean) => {
    if (!pages.length || !dailyQuotas[date]) return;
    const runs: number[][] = [];
    for (const page of pages) {
      const run = runs.at(-1);
      if (run && page === run.at(-1)! + 1) run.push(page); else runs.push([page]);
    }
    for (const run of runs) {
      const estimate = estimatePersonalizedDuration({
        topic: canonicalByTopic.get(goal.topicId)!, activity: 'estudio_nuevo',
        history: sessions, topics: canonicalByTopic, asOf: now,
        work: { pageNumbers: run, pages: run.length, fromPage: run[0], toPage: run.at(-1)! },
      });
      const estimatedMinutes = estimate.estimatedMinutes;
      dailyQuotas[date].tasks.push({
        topicId: goal.topicId, topicNumber: goal.topicNumber, topicTitle: goal.topicTitle,
        subjectId: goal.subjectId, totalPages: goal.totalPages,
        fromPage: run[0], toPage: run.at(-1)!, pagesCount: run.length,
        estimatedMinutes, minutesPerPage: estimatedMinutes !== null ? estimatedMinutes / run.length : null,
        estimateInterval: estimate.interval, estimateEvidenceCount: estimate.evidenceCount,
        estimateMethod: estimate.method, estimateFactors: estimate.factors,
        isCanteMorningBuffer: buffer, isCompleted: false,
      });
      dailyQuotas[date].totalPlannedPages += run.length;
      if (estimatedMinutes !== null) dailyQuotas[date].totalPlannedMinutes += estimatedMinutes;
      else dailyQuotas[date].unknownDurationTaskCount++;
    }
  };
  let bufferUsed = false;
  for (const goal of Object.values(topicGoals).sort((a, b) => (b.remainingPages || 0) - (a.remainingPages || 0))) {
    let pages = [...(missingByTopic.get(goal.topicId) || [])];
    if (!goal.hasKnownProgress || !goal.canLocateRemainingPages || !pages.length) continue;
    let bufferPages: number[] = [];
    if (!bufferUsed && goal.minutesPerPage !== null && goal.minutesPerPage > 0 && (pages.length <= 6 || goal.completedPages / goal.totalPages >= .8)) {
      const count = Math.min(pages.length, Math.max(0, Math.floor(90 / goal.minutesPerPage)));
      if (count > 0) { bufferPages = pages.splice(pages.length - count); bufferUsed = true; }
    }
    for (let index = 0; index < studyDays.length && pages.length; index++) {
      const count = Math.ceil(pages.length / (studyDays.length - index));
      appendPages(studyDays[index], goal, pages.splice(0, count), false);
    }
    appendPages(targetDate, goal, bufferPages, true);
    if (pages.length) evidenceWarnings.push('Hay páginas iniciales conocidas sin jornada disponible antes del cante.');
  }
  const canteQuota = dailyQuotas[targetDate];
  if (canteQuota) canteQuota.rebalanceNote = canteQuota.tasks.length
    ? 'Sólo los bloques iniciales pendientes conocidos usan el buffer; el resto de la mañana se reserva al repaso.'
    : 'Mañana reservada al repaso y cante; el progreso no medido requiere registrar cobertura explícita.';

  const goals = Object.values(topicGoals);
  const overallProgressKnown = goals.every(goal => goal.hasKnownProgress);
  const totalTargetPages = goals.reduce((sum, goal) => sum + goal.totalPages, 0);
  const totalCompletedPages = goals.reduce((sum, goal) => sum + goal.completedPages, 0);
  const overallProgressPct = overallProgressKnown && totalTargetPages > 0
    ? Math.round(totalCompletedPages / totalTargetPages * 100) : 0;
  let status: WeeklyCantePlan['status'] = 'on_track';
  if (!overallProgressKnown) status = 'needs_evidence';
  else if (goals.length && goals.every(goal => goal.isComplete)) status = 'ahead';
  else if ((daysRemaining === 0 && overallProgressPct < 80) || (daysRemaining === 1 && overallProgressPct < 60)) status = 'urgent';
  else if (overallProgressPct < 30 && daysRemaining <= 2) status = 'behind';
  const measuredPaces = goals.flatMap(goal => goal.minutesPerPage !== null ? [goal.minutesPerPage] : []);
  const averagePace = measuredPaces.length ? measuredPaces.reduce((sum, pace) => sum + pace, 0) / measuredPaces.length : null;
  const unknownDurationTaskCount = Object.values(dailyQuotas).reduce((sum, quota) => sum + quota.unknownDurationTaskCount, 0);
  if (unknownDurationTaskCount) evidenceWarnings.push('Hay tareas sin duración estimable: faltan sesiones comparables de estudio inicial. Los totales de tiempo sólo incluyen estimaciones disponibles.');
  if (unknownDurationTaskCount && status !== 'ahead') status = 'needs_evidence';
  return {
    id: `plan-${targetDay}-${targetDate}`, targetCanteDay: targetDay, targetCanteDate: targetDate,
    daysRemaining, cycleStartDate, cycleEndDate: targetDate, assignedTopicIds: assignedIds,
    topicGoals, dailyQuotas, historicalAverageMinPerPage: averagePace, unknownDurationTaskCount,
    totalTargetPages, totalCompletedPages, overallProgressPct,
    lastRebalancedAt: new Date(now).toISOString(), status,
    hasUnknownProgress: !overallProgressKnown, overallProgressKnown,
    evidenceWarnings: [...new Set(evidenceWarnings)],
  };
}

/**
 * @deprecated A numeric counter cannot establish which initial pages were studied.
 * Retained for older callers: recalculates from sessions and reports that the
 * anonymous manual counter was not incorporated as historical evidence.
 */
export function recordPageProgressAndRebalance(
  currentPlan: WeeklyCantePlan,
  topicId: string,
  newCompletedPages: number,
  allTopics: Topic[],
  sessions: Session[],
  manualCompletions?: Record<string, Record<string, boolean>>,
  userProgress?: Record<string, any>,
  topicState?: Map<string, CanonicalTopic>,
): WeeklyCantePlan {
  const plan = buildOrRebalanceWeeklyCantePlan({
    assignedTopicIds: currentPlan.assignedTopicIds,
    targetDay: currentPlan.targetCanteDay, targetDate: currentPlan.targetCanteDate,
    allTopics, sessions, userProgress, topicState,
    referenceDate: safeParseDate(currentPlan.lastRebalancedAt),
  });
  plan.evidenceWarnings.push('El contador manual no identifica páginas: registra una sesión con rangos o bloques para incorporar el avance.');
  return plan;
}
