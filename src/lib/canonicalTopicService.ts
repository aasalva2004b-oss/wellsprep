import type { Topic, Session } from "../types";
import type { TopicProgressData } from "./prediction";
import { sessionMatchesTopic, isCantoSession, getCantoDuration, compareSessionsAsc } from "./cantoUtils";
import { deriveInitialStudyCoverage, type InitialStudyCoverage } from './topicCoverage';
import type { RetentionEstimate } from './retentionModel';
import { selectSessionVersions } from './sessionVersions';
import { isSessionAvailableAt } from './sessionAvailability';

export type SessionCategory = 'initial_study' | 'review' | 'refresh' | 'cante' | 'unknown';
export type DataProvenance = 'user' | 'catalogue' | 'sessions' | 'session_inferred' | 'legacy_aggregate' | 'fallback' | 'unknown';
export interface CanonicalTopic {
  id: string;
  subjectId: string;
  number: number;
  title: string;
  officialTitle: string;
  fullTitle?: string;
  pages: number;
  hasExplicitPages: boolean;
  numeroPalabras?: number;
  hasExplicitWords: boolean;
  epigrafes?: number;
  difficulty: number;
  hasExplicitDifficulty: boolean;
  vueltas: number;
  vueltasIsExact: boolean;
  reviewCount: number;
  lastReviewDate?: string;
  lastContactDate?: string;
  firstStudyDate?: string;
  notas?: string;
  customTitle?: string;
  totalCantoCount: number;
  lastCantoGrade?: number;
  lastCantoSeconds?: number;
  lastCantoDate?: string;
  mejorTiempoCantoSegundos?: number;
  /** Total recorded elapsed minutes, including oral seconds; retained legacy name. */
  totalStudyMinutes: number;
  totalRecordedMinutes: number;
  totalInitialStudyMinutes: number;
  totalReviewMinutes: number;
  totalRefreshMinutes: number;
  totalCantoMinutes: number;
  initialStudyMinutes: number;
  reviewMinutes: number;
  refreshMinutes: number;
  cantoMinutes: number;
  sessions: Session[];
  initialStudySessions: Session[];
  reviewSessions: Session[];
  refreshSessions: Session[];
  cantoSessions: Session[];
  initialStudyCoverage: InitialStudyCoverage;
  hasStarted: boolean;
  historyIsAuthoritative: boolean;
  provenance: Record<string, DataProvenance>;
  conflicts: string[];
  legacyProgress?: Readonly<Record<string, any>>;
  /** Rebuildable prediction, never persisted as topic metadata. */
  retentionEstimate?: RetentionEstimate;
}

export function getSessionCategory(session: Session | Record<string, any>): SessionCategory {
  const type = String(session.type || session.modality || '').toLowerCase().trim();
  if (['primer_estudio', 'estudio_inicial', 'estudio'].includes(type)) return 'initial_study';
  if (type === 'repaso') return 'review';
  if (type === 'refresco') return 'refresh';
  if (['canto', 'cante', 'simulacro', 'cantar', 'preparador'].includes(type)) return 'cante';
  return isCantoSession(session) ? 'cante' : 'unknown';
}

export function sessionDurationMinutes(session: Session | Record<string, any>): number {
  if (getSessionCategory(session) === 'cante') {
    const raw = session as Record<string, any>;
    const explicitMinutes = numeric(raw.durationMinutes);
    // A field explicitly named durationMinutes is never reinterpreted as seconds.
    if (explicitMinutes !== undefined) return explicitMinutes + Number(numeric(raw.cantoSeconds ?? raw.seconds) ?? 0) / 60;
    const seconds = getCantoDuration(session).totalSecs;
    return Number.isFinite(seconds) && seconds > 0 ? seconds / 60 : 0;
  }
  const raw = session as Record<string, any>;
  const minutes = Number(raw.durationMinutes ?? raw.durationReal ?? raw.duration ?? 0);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 0;
}

function numeric(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}
function positive(value: unknown): number | undefined { const number = numeric(value); return number !== undefined && number > 0 ? number : undefined; }
function timestamp(value: any): number {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000 + Number(value.nanoseconds || 0) / 1e6;
  if (typeof value === 'number') return value;
  const number = Date.parse(value || '');
  return Number.isFinite(number) ? number : 0;
}
function stableRecord(value: any): string {
  const order = (item: any): any => Array.isArray(item) ? item.map(order)
    : item && typeof item === 'object' ? Object.fromEntries(Object.keys(item).sort().map(key => [key, order(item[key])])) : item;
  return JSON.stringify(order(value));
}
function date(value: unknown): string | undefined {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : undefined;
}

/**
 * Pages covered by one observation, rather than the size of its whole topic.
 * Legacy sessions without coverage retain the known topic-size fallback.
 * Explicit but invalid coverage is not silently treated as a complete reading.
 */
export function getSessionWorkedPages(session: Session, topicPages?: number): number | null {
  const raw = session as Session & Record<string, any>;
  const positive = (value: unknown): number | null => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  };
  const total = positive(topicPages);
  const validCount = (value: unknown): number | null => {
    const count = positive(value);
    return count !== null && (total === null || count <= total) ? count : null;
  };

  const pageList = raw.pagesNumbers ?? (Array.isArray(raw.pageBreakdown) ? raw.pageBreakdown.map((page: any) => page.pageNumber) : undefined);
  if (Array.isArray(pageList) && pageList.length > 0) {
    const pages = pageList.map(Number);
    if (pages.some(page => !Number.isInteger(page) || page < 1 || (total !== null && page > total))) return null;
    return new Set(pages).size;
  }

  const from = raw.startPage ?? raw.fromPage ?? raw.pages?.pageStart;
  const to = raw.endPage ?? raw.toPage ?? raw.pages?.pageEnd;
  if (from !== undefined && from !== null && to !== undefined && to !== null) {
    const first = Number(from);
    const last = Number(to);
    if (!Number.isInteger(first) || !Number.isInteger(last) || first < 1 || last < first || (total !== null && last > total)) return null;
    return last - first + 1;
  }

  const explicitCount = raw.pagesStudied ?? raw.pagesCount;
  if (explicitCount !== undefined && explicitCount !== null) return validCount(explicitCount);
  return total;
}

/** Build a read-only, reconstructible view from masters and historical facts. */
export function getCanonicalTopic(
  topicIdOrTopic: string | Topic | CanonicalTopic,
  allTopics: (Topic | CanonicalTopic)[],
  userProgress: Record<string, TopicProgressData> = {},
  sessions: Session[] = [],
  asOf = new Date(),
): CanonicalTopic {
  const topicId = typeof topicIdOrTopic === 'string' ? topicIdOrTopic : topicIdOrTopic.id;
  const base = typeof topicIdOrTopic === 'string' ? allTopics.find(topic => topic.id === topicId) : topicIdOrTopic;
  const progress = userProgress[topicId] as TopicProgressData & Record<string, any> | undefined;
  const provenance: Record<string, DataProvenance> = {};
  const conflicts = new Set<string>();
  const master = (key: string, fallback: unknown) => {
    if (progress && Object.prototype.hasOwnProperty.call(progress, key)) {
      provenance[key] = positive(progress[key]) !== undefined ? 'user' : 'unknown';
      return positive(progress[key]);
    }
    const value = positive(fallback);
    provenance[key] = value !== undefined ? 'catalogue' : 'unknown';
    return value;
  };
  const pages = master('pages', base?.pages) ?? 0;
  const numeroPalabras = master('numeroPalabras', base?.numeroPalabras);
  const epigrafes = master('epigrafes', base?.epigrafes);
  const measuredDifficulty = master('difficulty', base?.difficulty);
  const difficulty = measuredDifficulty !== undefined ? Math.min(10, Math.max(1, measuredDifficulty)) : 5;
  if (measuredDifficulty === undefined) provenance.difficulty = 'fallback';
  const officialTitle = base?.officialTitle || base?.title || progress?.officialTitle || topicId;
  const title = progress?.customTitle || base?.title || topicId;
  const subjectId = progress?.subjectId || base?.subjectId || '';
  const number = positive(progress?.number) ?? positive(base?.number) ?? Number(topicId.match(/(\d+)$/)?.[1] || 0);
  const target = { id: topicId, number, subjectId, title: officialTitle };

  // A repeated delivery of the SAME stable ID is not a new historical fact.
  // Different IDs are preserved even when all measured values happen to match.
  const delivered = new Map<string, Session>();
  for (const session of sessions || []) {
    if (!session || typeof session !== 'object') continue;
    const id = typeof session.id === 'string' && session.id ? session.id : undefined;
    if (!id) {
      if (sessionMatchesTopic(session, target)) conflicts.add('session_without_stable_id');
      continue;
    }
    const previous = delivered.get(id);
    if (previous && stableRecord(previous) !== stableRecord(session)
      && (sessionMatchesTopic(previous, target) || sessionMatchesTopic(session, target))) conflicts.add('conflicting_session_delivery');
    if (!previous) delivered.set(id, session);
  }
  const hasRecordedTopicHistory = (sessions || []).some(session => session && typeof session === 'object' && sessionMatchesTopic(session, target));
  const selectedTopicSessions = selectSessionVersions(sessions, asOf).filter(session => sessionMatchesTopic(session, target));
  const topicSessions = selectedTopicSessions.filter(session => isSessionAvailableAt(session, asOf)).sort(compareSessionsAsc);
  if (selectedTopicSessions.some(session => !(session as any).mergedIntoSessionId && !isSessionAvailableAt(session, asOf))) conflicts.add('unavailable_session_excluded');
  const initialStudySessions = topicSessions.filter(session => getSessionCategory(session) === 'initial_study');
  const reviewSessions = topicSessions.filter(session => getSessionCategory(session) === 'review');
  const refreshSessions = topicSessions.filter(session => getSessionCategory(session) === 'refresh');
  const cantoSessions = topicSessions.filter(session => getSessionCategory(session) === 'cante');
  const sum = (rows: Session[]) => rows.reduce((minutes, session) => minutes + sessionDurationMinutes(session), 0);
  const hasHistory = topicSessions.length > 0;
  // An unavailable/future or archived record must not revive obsolete aggregate
  // progress. The original records and metadata remain untouched by this view.
  const historyIsAuthoritative = Number(progress?.historyVersion) >= 3 || hasRecordedTopicHistory;
  const useHistory = hasHistory || historyIsAuthoritative;
  const last = (rows: Session[]) => rows.length ? rows[rows.length - 1] : undefined;
  const initialStudyMinutes = useHistory ? sum(initialStudySessions) : Number(positive(progress?.estudioHours) ?? 0) * 60;
  const reviewMinutes = useHistory ? sum(reviewSessions) : Number(positive(progress?.repasoHours) ?? 0) * 60;
  const refreshMinutes = useHistory ? sum(refreshSessions) : Number(positive(progress?.refrescoHours) ?? 0) * 60;
  const cantoMinutes = sum(cantoSessions);
  const totalRecordedMinutes = useHistory ? sum(topicSessions) : Number(positive(progress?.studyTimeHours) ?? positive((base as Topic)?.tiempoEstudioHoras) ?? 0) * 60;
  const inferredVueltas = [...reviewSessions, ...cantoSessions].filter(session => session.completesVuelta === undefined).length;
  const observedVueltas = [...reviewSessions, ...cantoSessions].filter(session => session.completesVuelta === true).length;
  const vueltas = useHistory ? observedVueltas + inferredVueltas : numeric(progress?.vueltas) ?? 0;
  const vueltasIsExact = useHistory ? inferredVueltas === 0 : !Number(progress?.vueltas);
  provenance.vueltas = useHistory ? inferredVueltas ? 'session_inferred' : 'sessions' : progress?.vueltas !== undefined ? 'legacy_aggregate' : 'unknown';
  provenance.history = useHistory ? 'sessions' : 'unknown';
  provenance.totals = useHistory ? 'sessions' : progress?.studyTimeHours !== undefined ? 'legacy_aggregate' : 'unknown';
  provenance.reviewCount = useHistory ? 'sessions' : progress?.reviewCount !== undefined ? 'legacy_aggregate' : 'unknown';
  provenance.totalCantoCount = useHistory ? 'sessions' : progress?.cantosCount !== undefined || progress?.mejorTiempoCantoMinutos || progress?.mejorTiempoCantoSegundos ? 'legacy_aggregate' : 'unknown';
  provenance.firstStudyDate = useHistory ? initialStudySessions.length ? 'sessions' : 'unknown' : progress?.firstStudyDate ? 'legacy_aggregate' : 'unknown';
  provenance.lastReviewDate = useHistory ? reviewSessions.length ? 'sessions' : 'unknown' : progress?.lastReviewDate ? 'legacy_aggregate' : 'unknown';
  const reviewCount = useHistory ? reviewSessions.length : numeric(progress?.reviewCount) ?? 0;
  const firstStudyDate = useHistory ? date(initialStudySessions[0]?.date) : date(progress?.firstStudyDate) ?? date((base as Topic)?.fechaPrimerEstudio);
  const lastReviewDate = useHistory ? date(last(reviewSessions)?.date) : date(progress?.lastReviewDate);
  const lastContactDate = useHistory ? date(last(topicSessions)?.date) : date(progress?.lastContactDate) ?? lastReviewDate ?? firstStudyDate;
  const latestCanto = last(cantoSessions);
  const lastCantoSeconds = latestCanto ? sessionDurationMinutes(latestCanto) * 60 : undefined;
  const latestGrade = latestCanto?.cantoGrade ?? (latestCanto as any)?.grade;
  const lastCantoGrade = typeof latestGrade === 'number' && Number.isFinite(latestGrade) ? latestGrade : undefined;
  const bestCantoSeconds = cantoSessions.map(session => sessionDurationMinutes(session) * 60).filter(seconds => Number.isFinite(seconds) && seconds > 0);
  const legacyBestSeconds = Number(progress?.mejorTiempoCantoMinutos || 0) * 60 + Number(progress?.mejorTiempoCantoSegundos || 0);
  const totalCantoCount = useHistory ? cantoSessions.length : numeric(progress?.cantosCount) ?? (legacyBestSeconds > 0 ? 1 : 0);
  if (useHistory) {
    if (numeric(progress?.vueltas) !== undefined && Number(progress?.vueltas) !== vueltas) conflicts.add('legacy_vueltas_disagree_with_history');
    if (numeric(progress?.reviewCount) !== undefined && Number(progress?.reviewCount) !== reviewCount) conflicts.add('legacy_review_count_disagrees_with_history');
    if (numeric(progress?.studyTimeHours) !== undefined && Math.abs(Number(progress?.studyTimeHours) * 60 - totalRecordedMinutes) > .61) conflicts.add('legacy_total_minutes_disagree_with_history');
    if ([...initialStudySessions, ...refreshSessions].some(session => session.completesVuelta === true)) conflicts.add('initial_or_refresh_session_marked_as_vuelta');
    if (progress?.firstStudyDate && progress.firstStudyDate !== firstStudyDate) conflicts.add('legacy_initial_date_disagrees_with_history');
    if (progress?.lastReviewDate && progress.lastReviewDate !== lastReviewDate) conflicts.add('legacy_review_date_disagrees_with_history');
  }
  const initialStudyCoverage = deriveInitialStudyCoverage(pages, topicSessions, historyIsAuthoritative ? undefined : progress);
  initialStudyCoverage.issues.forEach(issue => conflicts.add(issue));
  return {
    id: topicId, subjectId, number, title, officialTitle, fullTitle: base?.fullTitle || officialTitle,
    pages, hasExplicitPages: pages > 0, numeroPalabras, hasExplicitWords: numeroPalabras !== undefined,
    difficulty, hasExplicitDifficulty: measuredDifficulty !== undefined, epigrafes,
    vueltas, vueltasIsExact, reviewCount, firstStudyDate, lastReviewDate, lastContactDate,
    customTitle: progress?.customTitle, notas: progress?.notas || (base as Topic)?.notas || '',
    totalCantoCount, lastCantoGrade: useHistory ? lastCantoGrade : numeric(progress?.ultimoCantoNota),
    lastCantoSeconds: useHistory ? lastCantoSeconds : positive(progress?.ultimoCantoMinutos) !== undefined || positive(progress?.ultimoCantoSegundos) !== undefined ? Number(progress?.ultimoCantoMinutos || 0) * 60 + Number(progress?.ultimoCantoSegundos || 0) : undefined,
    lastCantoDate: useHistory ? date(latestCanto?.date) : date(progress?.ultimoCantoFecha),
    mejorTiempoCantoSegundos: bestCantoSeconds.length ? Math.min(...bestCantoSeconds) : !useHistory && legacyBestSeconds > 0 ? legacyBestSeconds : undefined,
    totalStudyMinutes: totalRecordedMinutes, totalRecordedMinutes,
    totalInitialStudyMinutes: initialStudyMinutes, initialStudyMinutes,
    totalReviewMinutes: reviewMinutes, reviewMinutes,
    totalRefreshMinutes: refreshMinutes, refreshMinutes,
    totalCantoMinutes: cantoMinutes, cantoMinutes,
    sessions: topicSessions, initialStudySessions, reviewSessions, refreshSessions, cantoSessions,
    initialStudyCoverage, hasStarted: useHistory ? topicSessions.length > 0 : !!firstStudyDate || totalRecordedMinutes > 0 || vueltas > 0,
    historyIsAuthoritative,
    provenance, conflicts: [...conflicts], legacyProgress: progress,
  };
}

export function buildCanonicalTopicMap(
  allTopics: Topic[],
  userProgress: Record<string, TopicProgressData> = {},
  sessions: Session[] = [],
  asOf = new Date(),
): Map<string, CanonicalTopic> {
  const map = new Map<string, CanonicalTopic>();
  for (const topic of allTopics) map.set(topic.id, getCanonicalTopic(topic, allTopics, userProgress, sessions, asOf));
  for (const id of Object.keys(userProgress)) if (!map.has(id)) map.set(id, getCanonicalTopic(id, allTopics, userProgress, sessions, asOf));
  return map;
}
