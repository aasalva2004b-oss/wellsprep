import type { Session, Topic } from '../types';
import { getSessionCategory, sessionDurationMinutes, buildCanonicalTopicMap, type CanonicalTopic } from './canonicalTopicService';
import { sessionMatchesTopic } from './cantoUtils';
import { deriveInitialStudyCoverage, getInitialStudyCompletionDate } from './topicCoverage';
import { estimatePersonalizedDuration, type PersonalizedDurationEstimate } from './personalizedEstimator';
import { estimateRetention, captureRetentionPrediction, isSessionAvailableAt, recommendPostStudyCheck } from './retentionModel';
import { DEFAULT_PLANNER_SETTINGS, type PlannerTask, type PlannerSettings, type PlannerActivityType } from './plannerEngine';
import type { AdaptiveDurationEstimate } from './adaptiveLearningEngine';
import { selectSessionVersions } from './sessionVersions';

export interface CanteCommitment { id: string; date: string; topicIds: string[] }
export interface RefreshException { skip?: boolean; date?: string; reason: string }
export interface CantePlanningInput {
  canonicalMap: ReadonlyMap<string, CanonicalTopic>;
  sessions: readonly Session[];
  existingTasks: readonly PlannerTask[];
  settings: PlannerSettings;
  canteGoals: readonly CanteCommitment[];
  horizonStart: string;
  horizonEnd: string;
  /** Civil date, also used as the explicit, reproducible forecast cutoff. */
  asOf: string;
  /** Exact forecast clock when known. Otherwise this is an end-of-day simulation. */
  forecastAt?: string;
  /** Keys are `${topicId}|${original D+n date}`. Exceptions are never implicit. */
  refreshExceptions?: Readonly<Record<string, RefreshException>>;
}
export interface PlanningConflict {
  id: string; code: string; severity: 'error' | 'warning'; message: string;
  topicId?: string; taskIds: string[]; date?: string;
}
export interface PlanningAlternative { id: string; conflictId: string; description: string }
export interface ProposalDay {
  date: string; capacityMinutes: number; plannedMinutes: number; actualMinutes: number;
  /** Actual work plus remaining reservations, without counting a linked session twice. */
  capacityUsedMinutes: number;
  unknownDurationTaskCount: number; overloadMinutes: number; tasks: PlannerTask[];
}
export interface CantePlanProposal {
  signature: string; generatedAt: string;
  candidateTasks: PlannerTask[];
  /** Confirmation can persist this complete list; no previous task is discarded. */
  mergedTasks: PlannerTask[];
  days: ProposalDay[]; conflicts: PlanningConflict[]; alternatives: PlanningAlternative[];
  viability: 'feasible' | 'infeasible' | 'unknown';
  /** Sum of known estimates. Consult unknownDurationTaskCount before using as a total. */
  totalEstimatedMinutes: number;
  totalMinutes: number | null;
  unknownDurationTaskCount: number;
  explanations: string[];
}

const DAY = 86_400_000;
function dateTime(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : null;
}
function shift(date: string, days: number): string { return new Date(dateTime(date)! + days * DAY).toISOString().slice(0, 10); }
function stable(value: any): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (value instanceof Map) return stable([...value].sort(([a], [b]) => String(a).localeCompare(String(b))));
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
}
function hash(value: unknown): string {
  let result = 2166136261;
  for (const character of stable(value)) result = Math.imul(result ^ character.charCodeAt(0), 16777619);
  return (result >>> 0).toString(36);
}
function copy<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }
function number(value: unknown): number | null { return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null; }
function instant(value: any): number | null {
  const time = value instanceof Date ? value.getTime() : typeof value?.toMillis === 'function' ? value.toMillis()
    : typeof value?.seconds === 'number' ? value.seconds * 1000 + Number(value.nanoseconds || 0) / 1e6
      : typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? time : null;
}
function protectedTask(task: PlannerTask): boolean {
  return task.status === 'completed' || !!task.pinned || !!task.confirmed || task.planningOrigin === 'manual' || task.estimateSource === 'manual' || task.manualEstimatedMinutes !== undefined;
}
function capacity(date: string, settings: PlannerSettings): number {
  const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  const hours = settings.dailyAvailabilityOverrides?.[date] ?? settings.dailyAvailabilityOverrides?.[String(weekday)] ?? settings.targetDailyHours;
  return Math.max(0, number(hours) ?? 0) * 60;
}
function pageSelection(pages: number[]): Pick<PlannerTask, 'pagesCount' | 'pagesNumbers' | 'fromPage' | 'toPage' | 'volumeSource'> {
  const contiguous = pages.length > 0 && pages.every((page, index) => index === 0 || page === pages[index - 1] + 1);
  return { pagesCount: pages.length, pagesNumbers: [...pages], volumeSource: contiguous ? 'explicit_range' : 'explicit_count',
    ...(contiguous ? { fromPage: pages[0], toPage: pages[pages.length - 1] } : {}) };
}

/** Deterministic proposal only: no persistence, clock reads, session writes or hidden capacity. */
export function generateCantePlanProposal(input: CantePlanningInput): CantePlanProposal {
  const { settings } = input;
  let topics = input.canonicalMap;
  const signature = `cante-plan-v1-${hash({ ...input, canonicalMap: topics })}`;
  const forecastTime = input.forecastAt ? Date.parse(input.forecastAt) : dateTime(input.asOf) === null ? NaN : dateTime(input.asOf)! + DAY - 1;
  const generatedAt = Number.isFinite(forecastTime) ? new Date(forecastTime).toISOString() : 'invalid-date';
  const conflicts: PlanningConflict[] = [], alternatives: PlanningAlternative[] = [];
  const candidates = new Map<string, PlannerTask>();
  const merged = new Map(input.existingTasks.map(task => [task.id, copy(task)]));
  const conflict = (code: string, message: string, details: Partial<PlanningConflict> = {}, suggestion?: string) => {
    const item: PlanningConflict = { id: `conflict-${hash([code, details.topicId, details.date, details.taskIds, message])}`, code, severity: 'warning', message, taskIds: [], ...details };
    if (!conflicts.some(previous => previous.id === item.id)) {
      conflicts.push(item);
      if (suggestion) alternatives.push({ id: `alternative-${item.id}`, conflictId: item.id, description: suggestion });
    }
  };
  const result = (days: ProposalDay[] = []): CantePlanProposal => {
    const unknownDurationTaskCount = days.reduce((sum, date) => sum + date.unknownDurationTaskCount, 0);
    const totalEstimatedMinutes = days.reduce((sum, date) => sum + date.plannedMinutes, 0);
    const unknownState = conflicts.some(item => ['UNKNOWN_COVERAGE', 'UNKNOWN_REFRESH_COVERAGE', 'UNKNOWN_DURATION', 'UNKNOWN_COMPLETION', 'MISSING_TOPIC', 'UNLINKED_COMPLETION', 'OVERDUE_PROTECTED', 'CONDITIONAL_REFRESH_DATE'].includes(item.code));
    return { signature, generatedAt, candidateTasks: [...candidates.values()].sort(taskOrder), mergedTasks: [...merged.values()].sort(taskOrder),
      days, conflicts, alternatives,
      viability: conflicts.some(item => item.severity === 'error') ? 'infeasible' : unknownDurationTaskCount > 0 || unknownState ? 'unknown' : 'feasible',
      totalEstimatedMinutes, totalMinutes: unknownDurationTaskCount || unknownState ? null : totalEstimatedMinutes, unknownDurationTaskCount,
      explanations: [
        'Propuesta calculada en memoria: confirmar conserva los registros previos y no crea sesiones.',
        'Se atienden primero las fechas de cante más próximas. El estudio inicial se divide por páginas realmente pendientes y precede a los tres refrescos.',
        'Los refrescos D+1, D+2 y D+3 son una regla de planificación configurable, no una predicción de retención.',
        'Las duraciones proceden del motor de la fase B; las recomendaciones flexibles de recuerdo proceden del modelo de la fase C.',
        'La capacidad reserva también las tareas existentes. Un tiempo desconocido impide certificar la viabilidad; las sobrecargas se muestran con alternativas.',
        'La viabilidad comprueba las tareas propuestas y sus dependencias; no garantiza el rendimiento futuro ni la asistencia al cante.',
      ] };
  };
  const startTime = dateTime(input.horizonStart), endTime = dateTime(input.horizonEnd), asOfTime = dateTime(input.asOf);
  if (new Set(input.existingTasks.map(task => task.id)).size !== input.existingTasks.length) {
    conflict('DUPLICATE_TASK_IDS', 'Hay tareas con el mismo identificador. Se conserva íntegramente la entrada y se detiene la generación para evitar perder decisiones manuales.', { severity: 'error' }, 'Revisa los identificadores duplicados antes de confirmar otra propuesta.');
    return { ...result(), mergedTasks: copy([...input.existingTasks]) };
  }
  if (startTime === null || endTime === null || asOfTime === null || !Number.isFinite(forecastTime) || endTime < startTime || endTime - startTime > 370 * DAY) {
    conflict('INVALID_HORIZON', 'El horizonte debe contener fechas válidas y abarcar como máximo 371 días.', { severity: 'error' });
    return result();
  }
  const dates: string[] = [];
  for (let time = startTime; time <= endTime; time += DAY) dates.push(new Date(time).toISOString().slice(0, 10));
  const firstDate = input.horizonStart > input.asOf ? input.horizonStart : input.asOf;
  // Observations recorded on asOf are available; no event after that civil day is used.
  const asOf = new Date(forecastTime);
  const eligibleSession = (session: Session): boolean => isSessionAvailableAt(session, asOf) && session.date <= input.asOf;
  const sessions = selectSessionVersions(input.sessions, asOf).filter(eligibleSession);
  // Anonymous historical records still consume time. Without a stable identity
  // they cannot safely be declared duplicates or linked to a task.
  const uniqueSessions = sessions;
  // Rebuild historical projections at this forecast instant; today's cached
  // canonical counts must not conceal an older available version of a session.
  const masters = [...input.canonicalMap.values()];
  const definitions = masters.map(topic => ({ ...topic, pages: topic.hasExplicitPages ? topic.pages : 0,
    difficulty: topic.hasExplicitDifficulty ? topic.difficulty : 0,
    numeroPalabras: topic.hasExplicitWords ? topic.numeroPalabras : undefined } as unknown as Topic));
  const metadata = Object.fromEntries(masters.map(topic => [topic.id, { ...topic.legacyProgress,
    pages: topic.hasExplicitPages ? topic.pages : 0, difficulty: topic.hasExplicitDifficulty ? topic.difficulty : 0,
    numeroPalabras: topic.hasExplicitWords ? topic.numeroPalabras : undefined,
    historyVersion: topic.historyIsAuthoritative ? 3 : topic.legacyProgress?.historyVersion }]));
  const historicalTopics = buildCanonicalTopicMap(definitions, metadata as any, sessions);
  for (const [id, topic] of historicalTopics) topic.retentionEstimate = input.canonicalMap.get(id)?.retentionEstimate;
  topics = historicalTopics;
  const actual = (date: string): number => uniqueSessions.filter(session => session.date === date).reduce((sum, session) => sum + sessionDurationMinutes(session), 0);
  const linkedActual = (task: PlannerTask): Session[] => uniqueSessions.filter(session => {
    const category = getSessionCategory(session);
    const activity = category === 'initial_study' ? 'estudio_nuevo' : category === 'review' ? 'repaso' : category === 'refresh' ? 'refresco' : category;
    const canonical = topics.get(task.topicId);
    return (session.id === task.sessionId || session.id === `planner-${encodeURIComponent(task.id)}` || session.plannerTaskId === task.id) && activity === task.activityType
      && !!canonical && sessionMatchesTopic(session, canonical);
  });
  const hasActual = (task: PlannerTask): boolean => linkedActual(task).length === 1;
  const nextReviewOrdinal = (topic: CanonicalTopic): number => {
    let count = 0;
    for (const session of topic.reviewSessions.filter(eligibleSession).slice().sort((a, b) => a.date.localeCompare(b.date) || String(a.id || '').localeCompare(String(b.id || '')))) {
      const explicit = Number((session as Session & Record<string, any>).reviewOrdinal ?? (session as Session & Record<string, any>).reviewNumber);
      count = Math.max(count + 1, Number.isFinite(explicit) && explicit > 0 ? explicit : 0);
    }
    return count + 1;
  };
  const estimate = (topic: CanonicalTopic, activity: PlannerActivityType, pages?: number[], ordinal?: number): AdaptiveDurationEstimate => {
    const details = estimatePersonalizedDuration({ topic, activity, history: sessions, topics, asOf,
      ...(pages ? { work: { pageNumbers: pages, pages: pages.length } } : {}),
      ...(activity === 'repaso' ? { reviewOrdinal: ordinal ?? nextReviewOrdinal(topic) } : activity === 'refresco' ? { refreshOrdinal: ordinal } : {}) });
    const paceKey = activity === 'estudio_nuevo' ? 'velocidadEstudioNuevoMinPorPagina' : activity === 'refresco' ? 'velocidadRefrescoMinPorPagina' : activity === 'repaso' ? 'velocidadRepasoMinPorPagina' : undefined;
    const pagesUsed = pages?.length ?? (activity === 'estudio_nuevo' ? topic.initialStudyCoverage.remainingPages : topic.pages) ?? 0;
    const manualPace = paceKey && settings[paceKey] !== DEFAULT_PLANNER_SETTINGS[paceKey] ? number(settings[paceKey]) : null;
    const durationKey = activity === 'cante' ? 'duracionEstimadaCantePorTemaMinutos' : activity === 'refresco' && ordinal ? `refresco${ordinal}DuracionMinutos` as const : undefined;
    const manualDuration = durationKey && settings[durationKey] !== DEFAULT_PLANNER_SETTINGS[durationKey] ? number(settings[durationKey]) : null;
    return durationAdapter(details, topic, activity, pagesUsed, generatedAt, manualPace, manualDuration);
  };
  const load = (date: string): number => {
    const tasks = [...merged.values()].filter(task => task.date === date);
    const remaining = tasks.filter(task => task.status !== 'completed' && !hasActual(task)).reduce((sum, task) => sum + (number(task.estimatedMinutes) ?? 0), 0);
    const unlinkedCompleted = tasks.filter(task => task.status === 'completed' && !hasActual(task)).reduce((sum, task) => sum + (number(task.actualMinutes) ?? number(task.estimatedMinutes) ?? 0), 0);
    return actual(date) + remaining + unlinkedCompleted;
  };
  const free = (date: string): number => Math.max(0, capacity(date, settings) - load(date));
  const add = (task: PlannerTask) => {
    const previous = merged.get(task.id);
    if (previous && protectedTask(previous)) {
      if (previous.date !== task.date || previous.activityType !== task.activityType || previous.pagesCount !== task.pagesCount) {
        conflict('PROTECTED_REQUIREMENT_CONFLICT', 'Una obligación coincide con una tarea protegida que tiene otra fecha o alcance; se conserva la decisión manual.', { severity: 'error', topicId: task.topicId, date: task.date, taskIds: [task.id] }, 'Revisa expresamente la fecha o el alcance de la tarea fijada; la propuesta no la sobrescribe.');
      }
      return;
    }
    candidates.set(task.id, task); merged.set(task.id, task);
  };
  const makeTask = (topic: CanonicalTopic, activity: PlannerActivityType, date: string, key: unknown, patch: Partial<PlannerTask> = {}, pages?: number[], ordinal?: number): PlannerTask => {
    const prediction = estimate(topic, activity, pages, ordinal);
    return { id: `cante-plan-${hash([topic.id, activity, key])}`, topicId: topic.id, topicNumber: topic.number,
      topicTitle: topic.title, subjectId: topic.subjectId, activityType: activity, date, status: 'pending',
      estimatedMinutes: prediction.estimatedMinutes, prediction, createdAt: generatedAt,
      estimateSource: prediction.method.startsWith('manual_') ? 'manual' : 'automatic',
      planningOrigin: 'cante_proposal', confirmed: false, requirement: 'mandatory',
      volumeSource: 'whole_topic', ...(pages ? pageSelection(pages) : {}), ...patch };
  };
  const fitDay = (minutes: number | null, latest: string, earliest = firstDate): string | null => {
    const eligible = dates.filter(date => date >= earliest && date <= latest);
    if (!eligible.length) return null;
    if (minutes === null) return eligible[0];
    return eligible.filter(date => free(date) >= minutes).sort((a, b) => {
      const ratioA = load(a) / Math.max(1, capacity(a, settings)), ratioB = load(b) / Math.max(1, capacity(b, settings));
      return ratioA - ratioB || a.localeCompare(b);
    })[0] || null;
  };
  const existingFor = (topicId: string, activity: PlannerActivityType, earliest: string, latest: string) => [...merged.values()].filter(task => task.topicId === topicId && task.activityType === activity && task.date >= earliest && task.date <= latest);

  // Only overdue, unprotected tasks are moved, and only inside this reviewable proposal.
  for (const original of input.existingTasks.slice().sort(taskOrder)) {
    if (dateTime(original.date) === null) {
      conflict('INVALID_TASK_DATE', 'Una tarea existente tiene una fecha imposible o inválida. Se conserva íntegramente y necesita corrección antes de certificar el plan.', { severity: 'error', taskIds: [original.id], topicId: original.topicId, date: original.date }, 'Corrige explícitamente la fecha de esta tarea; no se elimina ni se desplaza automáticamente.');
      continue;
    }
    if (original.status === 'completed') {
      if (!hasActual(original)) {
        conflict('UNLINKED_COMPLETION', 'Hay una tarea marcada completa sin una sesión real vinculada; se conserva y no demuestra trabajo realizado.', { taskIds: [original.id], topicId: original.topicId, date: original.date });
      }
      continue;
    }
    if (original.date >= firstDate) continue;
    if (protectedTask(original) || original.activityType === 'cante') {
      conflict('OVERDUE_PROTECTED', 'Una tarea atrasada o cita protegida se conserva en su fecha; requiere una decisión explícita.', { taskIds: [original.id], date: original.date, topicId: original.topicId }, 'Reprograma manualmente esta tarea o amplía la disponibilidad; su fecha no se modifica automáticamente.');
      continue;
    }
    const destination = fitDay(original.estimatedMinutes, input.horizonEnd) || firstDate;
    add({ ...copy(original), date: destination, status: 'pending', proposedOriginalDate: original.date, proposalBasis: 'overdue' });
    conflict('OVERDUE_RESCHEDULE', `Se propone trasladar una tarea pendiente de ${original.date} a ${destination}; no se ha cambiado el plan guardado.`, { taskIds: [original.id], topicId: original.topicId, date: destination });
  }

  const goals = input.canteGoals.slice().sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const topicDeadline = new Map<string, CanteCommitment>();
  for (const goal of goals) {
    const time = dateTime(goal.date), weekday = time === null ? -1 : new Date(time).getUTCDay();
    if (time === null || ![1, 4].includes(weekday)) {
      conflict('INVALID_CANTE_DATE', 'Los compromisos deben tener una fecha válida de lunes o jueves.', { severity: 'error', date: goal.date }); continue;
    }
    if (goal.date < firstDate || goal.date > input.horizonEnd) {
      conflict('DEADLINE_OUTSIDE_HORIZON', 'La fecha del cante queda fuera del horizonte que puede planificarse.', { severity: 'error', date: goal.date }, 'Amplía el horizonte o revisa expresamente la fecha del compromiso.'); continue;
    }
    for (const topicId of [...new Set(goal.topicIds)].sort()) {
      const topic = topics.get(topicId);
      if (!topic) { conflict('MISSING_TOPIC', 'Un tema asignado no existe en la fuente canónica; no se inventa su estado.', { topicId, date: goal.date }); continue; }
      if (!topicDeadline.has(topicId)) topicDeadline.set(topicId, goal);
      if (!existingFor(topicId, 'cante', goal.date, goal.date).length) {
        add(makeTask(topic, 'cante', goal.date, [goal.id, goal.date], { commitmentId: goal.id, proposalBasis: 'cante_goal', notes: 'Compromiso de cante: la fecha no se desplaza automáticamente.' }));
      }
    }
  }

  const scheduleRefreshes = (topic: CanonicalTopic, completion: string, basis: 'actual_completion' | 'proposed_completion', studyIds: string[], goal?: CanteCommitment) => {
    if (settings.autoRefreshProtocol === 'off') {
      conflict('REFRESH_POLICY_EXCEPTION', 'El protocolo de tres refrescos está desactivado explícitamente en la configuración.', { topicId: topic.id, date: completion }); return;
    }
    if (settings.autoRefreshProtocol === 'adaptive') {
      const conditional = recommendPostStudyCheck(completion, topic.retentionEstimate?.policy, goal?.date);
      if (!conditional) return;
      const memory = basis === 'actual_completion' ? estimateRetention({ topic, history: sessions, topics, asOf,
        config: topic.retentionEstimate?.policy, canteDate: goal?.date }) : null;
      const suggested = memory?.recommendedDate || conditional.date;
      const date = [suggested, shift(completion, 1), firstDate].sort().at(-1)!;
      if (date > input.horizonEnd) {
        conflict('ADAPTIVE_CHECK_OUTSIDE_HORIZON', 'La comprobación flexible sugerida queda fuera del horizonte; no se inventan tres refrescos obligatorios.', { topicId: topic.id, date }, 'Amplía el horizonte si quieres incorporar esa recomendación.'); return;
      }
      if (existingFor(topic.id, 'refresco', date, date).some(task => task.status !== 'completed' || hasActual(task))) return;
      const id = `refresco-${encodeURIComponent(topic.id)}-${completion}-adaptive`;
      if (merged.has(id)) return;
      const prediction = memory ? captureRetentionPrediction(memory) : {
        modelVersion: 'conditional-initial-prior-v1', generatedAt, target: 'prior', probability: null, evidenceCount: 0,
        policy: conditional.policy, conditionalOnCompletion: completion,
      };
      const task = makeTask(topic, 'refresco', date, [completion, 'adaptive'], { id,
        requirement: 'recommendation', isMemoryRecommendation: true, proposalBasis: basis,
        sourceStudyTaskId: studyIds.at(-1), dependencyTaskIds: [...studyIds], commitmentId: goal?.id,
        retentionPrediction: prediction, notes: memory ? `Recomendación flexible. ${memory.reasons.join(' ')}` : conditional.reason,
      }, undefined, 1);
      add(task);
      if (goal && date >= goal.date) conflict('ADAPTIVE_CHECK_AFTER_DEADLINE', 'La comprobación orientativa queda después del plazo de preparación; no se mueve el cante ni se da esa comprobación por realizada.', { topicId: topic.id, date, taskIds: [task.id] });
      return;
    }
    for (const ordinal of [1, 2, 3] as const) {
      const originalDate = shift(completion, ordinal);
      const exception = input.refreshExceptions?.[`${topic.id}|${originalDate}`];
      if (exception && !exception.reason?.trim()) conflict('INVALID_REFRESH_EXCEPTION', 'Una excepción de refresco necesita una justificación; se mantiene la obligación original.', { severity: 'error', topicId: topic.id, date: originalDate });
      const validException = !!exception?.reason?.trim();
      if (validException && exception.skip) {
        conflict('REFRESH_POLICY_EXCEPTION', `Excepción explícita de refresco: ${exception.reason}`, { topicId: topic.id, date: originalDate }); continue;
      }
      const validExceptionDate = validException && exception.date !== undefined && dateTime(exception.date) !== null && exception.date > completion;
      if (validException && exception.date !== undefined && !validExceptionDate) conflict('INVALID_REFRESH_EXCEPTION', 'La fecha excepcional del refresco debe ser válida y posterior a la finalización del estudio. Se mantiene su obligación original.', { severity: 'error', topicId: topic.id, date: originalDate });
      let date = validExceptionDate ? exception!.date! : originalDate;
      if (validExceptionDate) conflict('REFRESH_POLICY_EXCEPTION', `Refresco trasladado expresamente desde ${originalDate}: ${exception.reason}`, { topicId: topic.id, date });
      const observed = topic.refreshSessions.filter(session => session.date === originalDate && eligibleSession(session));
      const observedCoverage = deriveInitialStudyCoverage(topic.pages, observed.map(session => ({ ...session, type: 'estudio_inicial' as const })));
      if (basis === 'actual_completion' && observedCoverage.remainingPages === 0) continue;
      if (basis === 'actual_completion' && observed.length) conflict('UNKNOWN_REFRESH_COVERAGE', 'El refresco registrado es parcial o no identifica toda la cobertura del tema; no se da por cumplida la obligación completa.', { topicId: topic.id, date: originalDate }, 'Registra el alcance real del refresco o una excepción explícita; la sesión existente se conserva.');
      const matching = existingFor(topic.id, 'refresco', date, date);
      const coversTopic = (task: PlannerTask) => task.pagesNumbers?.length === topic.pages && new Set(task.pagesNumbers).size === topic.pages && task.pagesNumbers.every(page => Number.isSafeInteger(page) && page >= 1 && page <= topic.pages)
        || task.fromPage === 1 && task.toPage === topic.pages
        || task.volumeSource === 'whole_topic' && (task.pagesCount === undefined || task.pagesCount === topic.pages);
      if (matching.some(task => coversTopic(task) && (task.status !== 'completed' || hasActual(task)))) continue;
      if (date < firstDate) {
        date = fitDay(estimate(topic, 'refresco', undefined, ordinal).estimatedMinutes, goal ? shift(goal.date, -1) : input.horizonEnd) || firstDate;
        conflict('MISSED_REFRESH', `Falta el refresco obligatorio del ${originalDate}; se propone recuperarlo el ${date}. Recuperarlo no equivale a haberlo realizado en su fecha.`, { topicId: topic.id, date }, 'Confirma una recuperación o registra una excepción justificada; el historial original se conserva.');
      }
      const equivalent = existingFor(topic.id, 'refresco', date, date).find(task => task.proposedOriginalDate === originalDate || task.refrescoIndex === ordinal && task.sourceStudyTaskId === studyIds.at(-1));
      if (equivalent && coversTopic(equivalent)) continue;
      const task = makeTask(topic, 'refresco', date, [completion, ordinal], { id: `refresco-${encodeURIComponent(topic.id)}-${completion}-${ordinal}`, refrescoIndex: ordinal,
        pagesCount: topic.pages,
        sourceStudyTaskId: studyIds.at(-1), dependencyTaskIds: [...studyIds], proposalBasis: basis,
        ...(date !== originalDate ? { proposedOriginalDate: originalDate } : {}), commitmentId: goal?.id,
        notes: basis === 'actual_completion' ? `D+${ordinal} desde finalización observada ${completion}.` : `D+${ordinal} condicionado a terminar realmente el estudio el ${completion}; la fecha deberá recalcularse si cambia la finalización.` }, undefined, ordinal);
      add(task);
      if (date > input.horizonEnd) conflict('REFRESH_OUTSIDE_HORIZON', 'Un refresco obligatorio queda fuera del horizonte y se conserva en la propuesta para revisarlo.', { severity: 'error', topicId: topic.id, date, taskIds: [task.id] }, 'Amplía el horizonte hasta incluir los tres días posteriores al estudio.');
      if (goal && date >= goal.date) conflict('REFRESH_AFTER_DEADLINE', 'No caben los tres refrescos en los días anteriores al cante con esta fecha de finalización.', { severity: 'error', topicId: topic.id, date, taskIds: [task.id] }, `Adelanta la finalización inicial al ${shift(goal.date, -4)} o revisa explícitamente el compromiso o el protocolo.`);
    }
  };

  // Obligations from observed completion also apply to topics without a new cante.
  const relevant = [...topics.values()].filter(topic => topicDeadline.has(topic.id) || topic.initialStudySessions.some(session => session.date >= shift(firstDate, -3) && eligibleSession(session)));
  relevant.sort((a, b) => (topicDeadline.get(a.id)?.date || input.horizonEnd).localeCompare(topicDeadline.get(b.id)?.date || input.horizonEnd) || a.id.localeCompare(b.id));
  for (const topic of relevant) {
    const goal = topicDeadline.get(topic.id);
    const studySessions = topic.initialStudySessions.filter(eligibleSession).slice().sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const coverage = deriveInitialStudyCoverage(topic.pages, studySessions, topic.historyIsAuthoritative ? undefined : topic.legacyProgress);
    if (coverage.remainingPages === null || coverage.status === 'conflict' || !Number.isSafeInteger(topic.pages) || topic.pages > 10_000) {
      if (goal) conflict('UNKNOWN_COVERAGE', 'No se conocen con seguridad las páginas iniciales pendientes. Se conserva el cante, pero no se inventa un estudio de cero minutos ni se certifica viabilidad.', { topicId: topic.id, date: goal.date }, 'Registra los rangos iniciales reales y la extensión del tema; vuelve a generar la propuesta.');
      continue;
    }
    if (coverage.remainingPages === 0) {
      const completion = getInitialStudyCompletionDate(topic.pages, studySessions);
      if (completion) scheduleRefreshes(topic, completion, 'actual_completion', [], goal);
      else if (goal) conflict('UNKNOWN_COMPLETION', 'La cobertura figura completa, pero no puede reconstruirse una fecha real de finalización; no se inventan fechas D+1/D+2/D+3.', { topicId: topic.id, date: goal.date });
    } else if (goal) {
      const remaining: number[] = [];
      for (let page = 1; page <= topic.pages; page++) if (!coverage.intervals.some(range => page - 1 >= range.start && page <= range.end)) remaining.push(page);
      const preparationDays = settings.autoRefreshProtocol === 'off' ? 1 : settings.autoRefreshProtocol === 'adaptive' ? 2 : 4;
      const latestCompletion = shift(goal.date, -preparationDays);
      const availableDates = dates.filter(date => date >= firstDate && date <= latestCompletion);
      const studyIds: string[] = [];
      let completion = firstDate;
      // Existing pending initial tasks cover explicit page identities only; they remain fixed.
      const existingStudies = existingFor(topic.id, 'estudio_nuevo', firstDate, shift(goal.date, -1)).filter(task => task.status !== 'completed');
      for (const task of existingStudies) {
        const selected = task.pagesNumbers || (task.fromPage !== undefined && task.toPage !== undefined ? Array.from({ length: Math.max(0, task.toPage - task.fromPage + 1) }, (_, index) => task.fromPage! + index) : []);
        if (!selected.length || selected.some(page => !Number.isSafeInteger(page) || page < 1 || page > topic.pages)) { conflict('UNKNOWN_COVERAGE', 'Un estudio ya planificado no identifica páginas válidas: se conserva y no se usa para dar por cubierta la preparación.', { topicId: topic.id, taskIds: [task.id], date: task.date }); continue; }
        let coversPending = false;
        for (const page of selected) { const index = remaining.indexOf(page); if (index >= 0) { remaining.splice(index, 1); coversPending = true; } }
        if (coversPending) { studyIds.push(task.id); if (task.date > completion) completion = task.date; }
      }
      while (remaining.length) {
        let selection: { date: string; count: number } | null = null;
        for (const date of availableDates) {
          let low = 0, high = remaining.length;
          while (low < high) {
            const middle = Math.ceil((low + high) / 2), minutes = estimate(topic, 'estudio_nuevo', remaining.slice(0, middle)).estimatedMinutes;
            if (minutes === null) { low = remaining.length; break; }
            if (minutes <= free(date)) low = middle; else high = middle - 1;
          }
          if (low > 0) { selection = { date, count: low }; break; }
        }
        if (!selection) {
          // Keep all required work visible even when the capacity/deadline cannot fit it.
          selection = { date: availableDates.at(-1) || firstDate, count: remaining.length };
          conflict('INITIAL_WORK_DOES_NOT_FIT', 'El estudio inicial pendiente no cabe antes de los tres refrescos y el cante.', { severity: 'error', topicId: topic.id, date: selection.date }, 'Añade disponibilidad en los días previos, empieza antes o reduce expresamente los temas del compromiso.');
        }
        const pages = remaining.splice(0, selection.count);
        const task = makeTask(topic, 'estudio_nuevo', selection.date, [goal.id, pages], { commitmentId: goal.id, proposalBasis: 'proposed_completion',
          dependencyTaskIds: studyIds.filter(id => (merged.get(id)?.date || selection.date) <= selection.date), notes: 'Solo páginas iniciales pendientes identificadas; finalizar la tarea requiere una sesión real.' }, pages);
        add(task); studyIds.push(task.id); if (task.date > completion) completion = task.date;
      }
      if (studyIds.length) scheduleRefreshes(topic, completion, 'proposed_completion', studyIds, goal);
    }
  }

  // One explainable review can serve a cante and an overdue memory recommendation.
  for (const topic of [...topics.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    const goal = topicDeadline.get(topic.id);
    const coverage = deriveInitialStudyCoverage(topic.pages, topic.initialStudySessions.filter(eligibleSession), topic.historyIsAuthoritative ? undefined : topic.legacyProgress);
    if (coverage.remainingPages !== 0 || !topic.hasStarted) continue;
    const memory = estimateRetention({ topic, history: sessions, topics, asOf,
      config: topic.retentionEstimate?.policy, canteDate: goal?.date });
    const recommended = memory.recommendedDate;
    const latestReview = topic.reviewSessions.filter(eligibleSession).map(session => session.date).sort().at(-1);
    const earliestStudy = topic.initialStudySessions.filter(eligibleSession).map(session => session.date).sort()[0];
    const previousMonth = input.asOf.slice(0, 7) > (latestReview || earliestStudy || input.asOf).slice(0, 7);
    const memoryDue = !!recommended && recommended <= input.horizonEnd;
    if (!goal && !memoryDue && !previousMonth) continue;
    const latest = goal ? shift(goal.date, -1) : memoryDue ? (recommended! < firstDate ? input.horizonEnd : recommended!) : input.horizonEnd;
    if (existingFor(topic.id, 'repaso', firstDate, latest).some(task => task.status !== 'completed')) continue;
    // Fresh topics already have a three-day preparation sequence; do not add a gratuitous fourth contact.
    if (goal && [...merged.values()].some(task => task.topicId === topic.id && task.activityType === 'refresco' && task.date >= firstDate && task.date <= latest)) continue;
    const prediction = estimate(topic, 'repaso');
    const earliest = recommended && recommended > firstDate && recommended <= latest ? recommended : firstDate;
    const date = fitDay(prediction.estimatedMinutes, latest, earliest) || (latest >= firstDate ? latest : firstDate);
    const task = makeTask(topic, 'repaso', date, [goal?.id || 'memory', recommended || input.asOf.slice(0, 7)], {
      commitmentId: goal?.id, requirement: goal ? 'mandatory' : 'recommendation', proposalBasis: goal ? 'cante_goal' : 'retention',
      isMemoryRecommendation: memoryDue, retentionPrediction: captureRetentionPrediction(memory),
      notes: `${goal ? 'Preparación previa al cante.' : previousMonth ? 'Repaso de un tema trabajado en un mes anterior.' : 'Comprobación de recuerdo recomendada.'} ${memory.reasons.join(' ')}` });
    add(task);
    if (goal && date >= goal.date) conflict('REVIEW_AFTER_DEADLINE', 'No queda un día de preparación anterior al cante.', { severity: 'error', topicId: topic.id, date, taskIds: [task.id] });
  }

  // A second appointment for the same topic is a separate deadline. Its review
  // is conditional on the preceding preparation, not on an invented session.
  for (const [topicId, firstGoal] of topicDeadline) {
    const topic = topics.get(topicId)!;
    const later = goals.filter(goal => goal.date > firstGoal.date && goal.topicIds.includes(topicId) && goal.date <= input.horizonEnd);
    let previousDate = firstGoal.date;
    for (const goal of later) {
      const earliest = shift(previousDate, 1), latest = shift(goal.date, -1);
      if (!existingFor(topicId, 'repaso', earliest, latest).length) {
        const ordinal = nextReviewOrdinal(topic) + [...merged.values()].filter(task => task.topicId === topicId && task.activityType === 'repaso' && task.date < earliest && task.status !== 'completed').length;
        const prediction = estimate(topic, 'repaso', undefined, ordinal);
        const date = fitDay(prediction.estimatedMinutes, latest, earliest) || (latest >= earliest ? latest : earliest);
        const preparation = [...merged.values()].filter(task => task.topicId === topicId && task.activityType !== 'cante' && task.date < earliest).map(task => task.id);
        add(makeTask(topic, 'repaso', date, [goal.id, 'following-cante'], { commitmentId: goal.id, proposalBasis: 'cante_goal', dependencyTaskIds: preparation,
          notes: `Preparación para el siguiente compromiso del ${goal.date}; ordinal previsto ${ordinal}, condicionado a realizar los repasos anteriores.` }, undefined, ordinal));
        if (date >= goal.date) conflict('REVIEW_AFTER_DEADLINE', 'No existe un día de preparación entre los dos compromisos.', { severity: 'error', topicId, date });
      }
      previousDate = goal.date;
    }
  }

  // Wire fixed appointments to the preparations, without changing their dates.
  for (const task of candidates.values()) if (task.activityType === 'cante') {
    task.dependencyTaskIds = [...merged.values()].filter(prior => prior.topicId === task.topicId && prior.id !== task.id && prior.activityType !== 'cante' && prior.date <= task.date && prior.status !== 'completed').map(prior => prior.id).sort();
  }
  const all = [...merged.values()];
  const days: ProposalDay[] = dates.map(date => {
    const tasks = all.filter(task => task.date === date).sort(taskOrder);
    const plannedMinutes = tasks.reduce((sum, task) => sum + (number(task.estimatedMinutes) ?? 0), 0);
    const actualMinutes = actual(date);
    const unknownDurationTaskCount = tasks.filter(task => number(task.estimatedMinutes) === null).length;
    const capacityMinutes = capacity(date, settings), capacityUsedMinutes = load(date), overloadMinutes = Math.max(0, capacityUsedMinutes - capacityMinutes);
    if (overloadMinutes > 0) conflict('DAY_OVERLOAD', `La carga conocida supera la disponibilidad en ${Math.ceil(overloadMinutes)} minutos.`, { severity: 'error', date, taskIds: tasks.map(task => task.id) }, `Añade al menos ${Math.ceil(overloadMinutes)} minutos el ${date}, redistribuye tareas no obligatorias o revisa el compromiso; ninguna tarea se elimina.`);
    if (unknownDurationTaskCount > 0) conflict('UNKNOWN_DURATION', `${unknownDurationTaskCount} tareas tienen duración desconocida; la carga mostrada solo suma estimaciones disponibles.`, { date, taskIds: tasks.filter(task => number(task.estimatedMinutes) === null).map(task => task.id) }, 'Registra duraciones y cantidades de trabajo reales o establece un ritmo manual explícito antes de certificar capacidad.');
    return { date, tasks, capacityMinutes, plannedMinutes, actualMinutes, capacityUsedMinutes, unknownDurationTaskCount, overloadMinutes };
  });
  for (const task of all) for (const dependencyId of task.dependencyTaskIds || []) {
    const dependency = merged.get(dependencyId);
    if (!dependency || dependency.date > task.date) conflict('DEPENDENCY_CONFLICT', 'Una actividad depende de una preparación ausente o posterior; no se considera viable.', { severity: 'error', date: task.date, taskIds: [task.id, dependencyId], topicId: task.topicId }, 'Revisa las fechas de las actividades dependientes antes de confirmar.');
  }
  return result(days);
}

function taskOrder(a: PlannerTask, b: PlannerTask): number { return a.date.localeCompare(b.date) || a.id.localeCompare(b.id); }

/** Presentation adapter only; the duration model remains personalizedEstimator. */
function durationAdapter(details: PersonalizedDurationEstimate, topic: CanonicalTopic, activity: PlannerActivityType, pages: number, generatedAt: string, manualPace: number | null, suppliedDuration: number | null): AdaptiveDurationEstimate {
  const manualRate = manualPace !== null && manualPace > 0 && pages > 0 && activity !== 'cante';
  const manualDuration = suppliedDuration !== null && suppliedDuration > 0;
  const manual = manualRate || manualDuration;
  const minutes = manualDuration ? suppliedDuration : manualRate ? Math.max(1, Math.round(pages * manualPace!)) : details.estimatedMinutes;
  const factors = manualDuration ? ['Duración introducida por el usuario; no es una predicción estadística.'] : manualRate ? ['Ritmo introducido por el usuario; no es una predicción estadística.'] : details.factors;
  const manualFeatures = manualDuration ? ['manual_duration'] : ['manual_rate', 'requested_pages'];
  const method = manualDuration ? 'manual_duration' : manualRate ? 'manual_rate' : details.method;
  return { estimatedMinutes: minutes, available: minutes !== null, interval: manual ? null : details.interval,
    evidenceCount: manual ? 0 : details.evidenceCount, effectiveSampleSize: manual ? 0 : details.effectiveSampleSize,
    method, modelVersion: manual ? 'manual' : details.modelVersion, factors, featuresUsed: manual ? manualFeatures : details.featuresUsed,
    excludedCount: details.excludedCount, phaseEstimates: manual ? undefined : details.phaseEstimates,
    personalizedPrediction: { modelVersion: manual ? 'manual' : details.modelVersion, generatedAt, activity, estimatedMinutes: minutes, interval: manual ? null : details.interval, evidenceCount: manual ? 0 : details.evidenceCount, method, featuresUsed: manual ? manualFeatures : details.featuresUsed, factors,
      ...(pages > 0 ? { workPages: pages } : {}),
      inputs: { totalPages: topic.hasExplicitPages ? topic.pages : undefined, totalWords: topic.hasExplicitWords ? topic.numeroPalabras : undefined, difficulty: topic.hasExplicitDifficulty ? topic.difficulty : undefined } },
    confidence: manual ? 'provisional' : details.confidence === 'alta' ? 'alta' : details.confidence === 'media' ? 'media' : 'provisional',
    explanation: factors.join(' '), paceMinPerPage: minutes !== null && pages > 0 ? minutes / pages : null,
    pagesUsed: pages, totalPages: topic.pages, isPartialStudy: pages > 0 && pages < topic.pages,
    hasExplicitPages: topic.hasExplicitPages, isCustomSpeed: manual || details.evidenceCount > 0,
    details: { baseVolumeMinutes: minutes, difficultyAdjustmentMinutes: 0, vueltaAdjustmentMinutes: 0, decayAdjustmentMinutes: 0 } };
}
