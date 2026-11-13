import type { TopicProgressData } from './prediction';
import { getLocalDateString } from './utils';
import { getCanonicalTopic, type CanonicalTopic } from './canonicalTopicService';
import { calculateCanonicalRetention, getCanonicalReviewDate } from './ebbinghaus';
import type { Topic } from '../types';
import { parseAeroFocusTopicIdPrefix } from './topicResolver';
import { getInitialStudyCompletionDate } from './topicCoverage';

/** Legacy identifiers retained for consumers; labels describe evidence and flexible dates. */
export type PreparadorPhase =
  | 'estudio_parcial'
  | 'cobertura_desconocida'
  | 'sin_iniciar'
  | 'en_refrescos'
  | 'listo_para_cantar'
  | 'consolidado_mes'
  | 'repaso_pendiente'
  | 'repaso_vencido';

export interface TopicCycleInfo {
  topicId: string;
  phase: PreparadorPhase;
  phaseLabel: string;
  phaseColor: string;
  phaseBadgeClass: string;
  vueltas: number;
  /** Distinct observed refresh days. They do not establish mastery. */
  refrescosCount: number;
  /** Compatibility fields: zero means there is no fixed refresh quota. */
  targetRefrescos: number;
  refrescosProgressPct: number;
  refrescoDayLabel: string;
  refrescoDates: string[];
  firstStudyDate: string | null;
  initialStudyCompletionDate: string | null;
  lastStudyOrReviewDate: string | null;
  lastCantoDate: string | null;
  lastCantoScore: number | null;
  daysSinceLastCantoOrReview: number;
  /** Legacy names; the date is the shared, flexible retention recommendation. */
  nextMonthlyReviewDate: string | null;
  daysUntilMonthlyReview: number | null;
  isMonthlyReviewDue: boolean;
  isMonthlyReviewOverdue: boolean;
  isDueToday: boolean;
  isRefreshedToday: boolean;
  daysSinceFirstStudy: number | null;
  nextActionTitle: string;
  nextActionDescription: string;
  nextActionType: 'estudio_inicial' | 'refresco' | 'canto' | 'repaso';
}

function dayTime(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : null;
}

/**
 * Study coverage and memory evidence are separate. This adapter keeps its old
 * public shape while using the same review policy as every other view. Counts,
 * elapsed days and oral grades never make a topic automatically ready to sing.
 */
export function calculateTopicCycle(
  topicId: string,
  progress: TopicProgressData | undefined,
  sessions: any[] = [],
  canonicalTopic?: CanonicalTopic,
): TopicCycleInfo {
  const todayStr = getLocalDateString();
  const todayTime = dayTime(todayStr)!;
  const identity = parseAeroFocusTopicIdPrefix(topicId);
  const canonical = canonicalTopic || getCanonicalTopic({
    id: topicId, subjectId: identity?.subjectId || progress?.subjectId || '',
    number: identity?.number || 0, title: progress?.customTitle || topicId,
    pages: progress?.pages || 0, difficulty: progress?.difficulty || 0,
  } as Topic, [], progress ? { [topicId]: progress } : {}, sessions);
  const memory = calculateCanonicalRetention(canonical);
  const suggestedDate = getCanonicalReviewDate(canonical, memory);
  const nextMonthlyReviewDate = suggestedDate && dayTime(suggestedDate) !== null ? suggestedDate : null;
  const daysUntilMonthlyReview = nextMonthlyReviewDate ? Math.round((dayTime(nextMonthlyReviewDate)! - todayTime) / 86_400_000) : null;
  const isMonthlyReviewDue = daysUntilMonthlyReview !== null && daysUntilMonthlyReview <= 0;
  const isMonthlyReviewOverdue = daysUntilMonthlyReview !== null && daysUntilMonthlyReview < 0;
  const firstStudyDate = canonical.firstStudyDate || null;
  const initialStudyCompletionDate = getInitialStudyCompletionDate(canonical.pages, canonical.sessions.filter(session => session.date <= todayStr));
  const firstStudyTime = dayTime(firstStudyDate);
  const daysSinceFirstStudy = firstStudyTime !== null ? Math.max(0, Math.floor((todayTime - firstStudyTime) / 86_400_000)) : null;
  const lastCantoDate = canonical.lastCantoDate || null;
  const lastCantoScore = canonical.lastCantoGrade ?? null;
  const lastMajorAnchorDate = [lastCantoDate, canonical.lastReviewDate, firstStudyDate]
    .filter((value): value is string => !!value && dayTime(value) !== null && value <= todayStr).sort().at(-1) || null;
  const daysSinceLastCantoOrReview = lastMajorAnchorDate ? Math.max(0, Math.floor((todayTime - dayTime(lastMajorAnchorDate)!) / 86_400_000)) : 0;
  const refrescoDates = [...new Set(canonical.refreshSessions.map(session => session.date)
    .filter(date => dayTime(date) !== null && date <= todayStr && (!initialStudyCompletionDate || date > initialStudyCompletionDate)))].sort();
  const refrescosCount = refrescoDates.length;
  const refrescoDayLabel = `${refrescosCount} ${refrescosCount === 1 ? 'día de refresco registrado' : 'días de refresco registrados'}`;
  const isRefreshedToday = refrescoDates.includes(todayStr);
  const coverage = canonical.initialStudyCoverage;
  const reason = memory.adaptive?.reasons.join(' ') || memory.diagnostic || 'Todavía no hay una evaluación de recuerdo suficiente para orientar la siguiente comprobación.';
  const dateReason = nextMonthlyReviewDate ? `Fecha orientativa: ${nextMonthlyReviewDate}. Puede ajustarse con el siguiente resultado.` : 'No hay una fecha de revisión sugerida.';

  let phase: PreparadorPhase = 'sin_iniciar';
  let phaseLabel = 'Pendiente de estudio inicial';
  let phaseColor = 'text-slate-500';
  let phaseBadgeClass = 'bg-slate-100 text-slate-700 border-slate-200';
  let nextActionTitle = 'Comenzar estudio inicial';
  let nextActionDescription = 'Registra las páginas que trabajes y el tiempo real. Una sesión realizada no demuestra todavía recuerdo sin ayuda.';
  let nextActionType: TopicCycleInfo['nextActionType'] = 'estudio_inicial';

  if (canonical.hasStarted) {
    if (coverage.remainingPages === null || coverage.status === 'conflict') {
      phase = 'cobertura_desconocida';
      phaseLabel = coverage.status === 'conflict' ? 'Cobertura inicial por aclarar' : 'Cobertura inicial sin medir';
      nextActionTitle = isMonthlyReviewDue ? 'Comprobar recuerdo de lo trabajado' : 'Registrar la cobertura inicial';
      nextActionType = isMonthlyReviewDue ? 'refresco' : 'estudio_inicial';
      nextActionDescription = `El historial no permite calcular las páginas iniciales pendientes. Registra rangos reales; no se deducen de tiempos, notas o vueltas. ${reason} ${dateReason}`;
    } else if (coverage.remainingPages > 0) {
      phase = 'estudio_parcial';
      phaseLabel = `Estudio inicial parcial (${coverage.remainingPages} páginas pendientes)`;
      nextActionTitle = isMonthlyReviewDue ? 'Comprobar recuerdo de la parte estudiada' : 'Continuar estudio inicial';
      nextActionType = isMonthlyReviewDue ? 'refresco' : 'estudio_inicial';
      nextActionDescription = `Quedan ${coverage.remainingPages} páginas de estudio inicial identificadas. Los repasos y cantes no reducen esa cobertura pendiente. La orientación de recuerdo se refiere a lo trabajado. ${reason} ${dateReason}`;
    } else if (isMonthlyReviewOverdue) {
      phase = 'repaso_vencido';
      phaseLabel = 'Comprobación sugerida pendiente';
      phaseColor = 'text-amber-700';
      phaseBadgeClass = 'bg-amber-50 text-amber-900 border-amber-200';
      nextActionTitle = 'Comprobar recuerdo sin ayuda';
      nextActionDescription = `${reason} ${dateReason}`;
      nextActionType = 'repaso';
    } else if (isMonthlyReviewDue) {
      phase = 'repaso_pendiente';
      phaseLabel = 'Comprobación sugerida hoy';
      phaseColor = 'text-indigo-600';
      phaseBadgeClass = 'bg-indigo-50 text-indigo-800 border-indigo-200';
      nextActionTitle = 'Comprobar recuerdo sin ayuda';
      nextActionDescription = `${reason} ${dateReason}`;
      nextActionType = 'repaso';
    } else {
      // The historical identifier means "no review currently due", not mastery
      // or a monthly interval. No refresh count or round count selects it.
      phase = 'consolidado_mes';
      phaseLabel = daysUntilMonthlyReview === null ? 'Sin comprobación fechada' : `Próxima comprobación en ${daysUntilMonthlyReview} días`;
      phaseColor = 'text-blue-600';
      phaseBadgeClass = 'bg-blue-50 text-blue-800 border-blue-200';
      nextActionTitle = daysUntilMonthlyReview === null ? 'Registrar una comprobación de recuerdo' : 'Comprobación de recuerdo sugerida';
      nextActionDescription = `${reason} ${dateReason}`;
      nextActionType = 'repaso';
    }
  }

  return {
    topicId, phase, phaseLabel, phaseColor, phaseBadgeClass, vueltas: canonical.vueltas,
    refrescosCount, targetRefrescos: 0, refrescosProgressPct: 0, refrescoDayLabel, refrescoDates,
    firstStudyDate, initialStudyCompletionDate, lastStudyOrReviewDate: lastMajorAnchorDate, lastCantoDate, lastCantoScore,
    daysSinceLastCantoOrReview, nextMonthlyReviewDate, daysUntilMonthlyReview,
    isMonthlyReviewDue, isMonthlyReviewOverdue,
    isDueToday: canonical.hasStarted && isMonthlyReviewDue,
    isRefreshedToday, daysSinceFirstStudy,
    nextActionTitle, nextActionDescription, nextActionType,
  };
}
