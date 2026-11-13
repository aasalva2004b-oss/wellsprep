import type { Session } from '../types';
import { getSessionCategory, type CanonicalTopic } from './canonicalTopicService';
import { deriveInitialStudyCoverage } from './topicCoverage';
import { selectSessionVersions } from './sessionVersions';
import { isSessionAvailableAt } from './sessionAvailability';
export { isSessionAvailableAt } from './sessionAvailability';

export const RETENTION_MODEL_VERSION = 'retrieval-half-life-v1';
const DAY = 86_400_000;
export interface RetentionConfig {
  initialStabilityDays: number;
  initialRecallProbability: number;
  priorStrength: number;
  recencyHalfLifeDays: number;
  reviewThreshold: number;
  maxIntervalDays: number;
}
/** Policy priors, NOT measurements of this user's memory. All are adjustable. */
export const DEFAULT_RETENTION_CONFIG: Readonly<RetentionConfig> = Object.freeze({
  initialStabilityDays: 7, initialRecallProbability: .8, priorStrength: 8,
  recencyHalfLifeDays: 180, reviewThreshold: .7, maxIntervalDays: 365,
});
export type RetrievalTarget = 'recall' | 'grade_proxy';
export type CoverageScope = 'whole_topic' | 'studied_portion' | 'unknown';
export interface RetrievalOutcome {
  value: 0 | 1;
  target: RetrievalTarget;
  scope: 'whole_topic' | 'partial' | 'unknown';
}
export interface RetentionEstimate {
  modelVersion: string;
  generatedAt: string;
  probability: number | null;
  /** Sensitivity range under the fitted model; not validated calibration coverage. */
  interval: { low: number; high: number } | null;
  target: RetrievalTarget | 'prior';
  confidence: 'sin_datos' | 'baja' | 'media' | 'alta';
  evidenceCount: number;
  topicEvidenceCount: number;
  stabilityDays: number;
  lastContactDate: string | null;
  lastEvidenceDate?: string | null;
  daysSinceContact: number | null;
  coverageScope: CoverageScope;
  recommendedDate: string | null;
  recommendation: 'assess_recall' | 'review' | 'continue_study' | 'none';
  reasons: string[];
  featuresUsed: string[];
  policy: RetentionConfig;
  /** Oral appointments remain commitments outside this flexible recommendation. */
  canteDate: string | null;
}
interface Features { difficulty?: number; reviews: number; vueltas: number; contacts: number; activity: string }
interface Contact { session: Session; time: number; memoryTime: number; partialMemoryTime: number; features: Features; outcome: RetrievalOutcome | null }
interface Observation { topicId: string; time: number; elapsed: number; value: 0 | 1; target: RetrievalTarget; scope: RetrievalOutcome['scope']; features: Features }
export interface RetentionEvidence { observations: Observation[]; contacts: Map<string, Contact[]>; cutoff: number }
export interface RetentionRequest {
  topic: CanonicalTopic;
  history: readonly Session[];
  topics: ReadonlyMap<string, CanonicalTopic>;
  asOf?: Date;
  config?: Partial<RetentionConfig>;
  canteDate?: string;
  evidence?: RetentionEvidence;
}
const numeric = (value: unknown): number | undefined => {
  if ((typeof value !== 'number' && typeof value !== 'string') || value === '') return undefined;
  const result = Number(value); return Number.isFinite(result) ? result : undefined;
};
function dayTime(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : null;
}
const dateString = (time: number) => new Date(time).toISOString().slice(0, 10);
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

/** A session is not a retrieval result. Minutes, speed and vueltas cannot supply a label. */
export function extractRetrievalOutcome(session: Session | Record<string, any>): RetrievalOutcome | null {
  if (!session || typeof session !== 'object') return null;
  const raw = session as Record<string, any>;
  const retrieval = raw.retrieval;
  if (retrieval && retrieval.assistance === 'none' && ['success', 'failure'].includes(retrieval.outcome)
    && ['whole_topic', 'partial'].includes(retrieval.coverage)) {
    return { value: retrieval.outcome === 'success' ? 1 : 0, target: 'recall', scope: retrieval.coverage };
  }
  const grade = numeric(raw.cantoGrade);
  if (getSessionCategory(raw) === 'cante' && grade !== undefined && grade >= 0 && grade <= 10) {
    // A passing oral grade is a proxy label, never a measured fraction remembered.
    return { value: grade >= 5 ? 1 : 0, target: 'grade_proxy', scope: 'unknown' };
  }
  return null;
}

/** Strict day-level ordering: an outcome cannot train its own forecast. */
export function buildRetentionEvidence(history: readonly Session[], topics: ReadonlyMap<string, CanonicalTopic>, asOf: Date): RetentionEvidence {
  const cutoff = asOf.getTime();
  const unique = new Map<string, Session>();
  for (const session of selectSessionVersions(history, asOf)) {
    if (!session || typeof session !== 'object') continue;
    const time = dayTime(session.date);
    if (typeof session.id !== 'string' || !session.id.trim() || typeof session.topicId !== 'string' || !topics.has(session.topicId) || time === null || !isSessionAvailableAt(session, asOf) || getSessionCategory(session) === 'unknown') continue;
    unique.set(session.id, session);
  }
  const contacts = new Map<string, Contact[]>();
  const observations: Observation[] = [];
  for (const session of [...unique.values()].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))) {
    const time = dayTime(session.date)!;
    const list = contacts.get(session.topicId) || [];
    const prior = [...list].reverse().find(contact => contact.time < time);
    const master = topics.get(session.topicId)!;
    const previousDifficulty = prior ? numeric((prior.session as any).difficulty ?? (prior.session as any).dificultadReal) : undefined;
    const features: Features = {
      ...(previousDifficulty !== undefined && previousDifficulty >= 1 && previousDifficulty <= 10 ? { difficulty: previousDifficulty }
        : master.hasExplicitDifficulty ? { difficulty: master.difficulty } : {}),
      reviews: list.filter(contact => ['review', 'refresh'].includes(getSessionCategory(contact.session))).length,
      vueltas: list.filter(contact => contact.session.completesVuelta === true).length,
      contacts: list.length, activity: prior ? getSessionCategory(prior.session) : 'none',
    };
    const outcome = extractRetrievalOutcome(session);
    if (outcome && prior) observations.push({ topicId: session.topicId, time, elapsed: (time - (outcome.scope === 'partial' ? prior.partialMemoryTime : prior.memoryTime)) / DAY, ...outcome, features });
    const isInitial = getSessionCategory(session) === 'initial_study';
    const priorMemory = list.at(-1)?.memoryTime;
    const previousCoverage = isInitial ? deriveInitialStudyCoverage(master.pages, list.map(contact => contact.session)) : null;
    // An unevaluated refresh/review is a contact, not proof of restored recall.
    // A first historical contact provides only a low-confidence starting prior.
    const startsNewCoverage = isInitial && previousCoverage?.remainingPages !== 0;
    const memoryTime = startsNewCoverage || (outcome?.target === 'recall' && outcome.value === 1 && outcome.scope === 'whole_topic') || priorMemory === undefined ? time : priorMemory;
    const partialMemoryTime = isInitial || (outcome?.target === 'recall' && outcome.value === 1) || !list.length ? time : list.at(-1)!.partialMemoryTime;
    list.push({ session, time, memoryTime, partialMemoryTime, features, outcome }); contacts.set(session.topicId, list);
  }
  return { contacts, observations, cutoff };
}
function policyOf(input: Partial<RetentionConfig> = {}): RetentionConfig {
  const config = { ...DEFAULT_RETENTION_CONFIG };
  for (const key of Object.keys(config) as Array<keyof RetentionConfig>) {
    if (typeof input[key] === 'number' && Number.isFinite(input[key]) && input[key]! > 0) config[key] = input[key]!;
  }
  config.initialStabilityDays = clamp(config.initialStabilityDays, .25, 365);
  config.initialRecallProbability = clamp(config.initialRecallProbability, .05, .99);
  config.reviewThreshold = clamp(config.reviewThreshold, .05, .95);
  config.priorStrength = clamp(config.priorStrength, 1, 1000);
  config.recencyHalfLifeDays = clamp(config.recencyHalfLifeDays, 1, 3650);
  config.maxIntervalDays = clamp(config.maxIntervalDays, 1, 3650);
  return config;
}

function reviewIntervalDays(probability: number, stability: number, policy: RetentionConfig): number {
  const crossing = probability > policy.reviewThreshold ? stability * Math.log(policy.reviewThreshold / probability) / Math.log(.5) : 0;
  return Math.min(policy.maxIntervalDays, Math.max(1, Math.floor(crossing)));
}

/** Conditional planning aid, not a fabricated session or a measured memory score. */
export function recommendPostStudyCheck(completionDate: string, config?: Partial<RetentionConfig>, canteDate?: string) {
  const completion = dayTime(completionDate);
  if (completion === null) return null;
  const policy = policyOf(config);
  let due = completion + reviewIntervalDays(policy.initialRecallProbability, policy.initialStabilityDays, policy) * DAY;
  const oral = dayTime(canteDate);
  if (oral !== null) due = Math.min(due, oral - DAY);
  due = Math.max(completion + DAY, due);
  return { date: dateString(due), policy, conditionalOnCompletion: completionDate,
    reason: 'Comprobación orientativa condicionada a finalizar realmente el estudio; usa parámetros iniciales explícitos, no un resultado de recuerdo observado.' };
}
function weightedQuantile(values: Array<{ value: number; weight: number }>, q: number): number {
  const sorted = [...values].sort((a, b) => a.value - b.value);
  const total = sorted.reduce((sum, row) => sum + row.weight, 0);
  let sum = 0;
  for (const row of sorted) { sum += row.weight; if (sum >= q * total) return row.value; }
  return sorted.at(-1)!.value;
}

/**
 * A small Bayesian half-life grid with empirical local weighting. This predicts
 * the next assessment's success, NOT a measured percentage of retained text.
 * No contact duration, oral speed or fixed round bonus enters the likelihood.
 */
export function estimateRetention(request: RetentionRequest): RetentionEstimate {
  const { topic } = request;
  const now = request.asOf || new Date();
  const config = policyOf(request.config);
  const empty: RetentionEstimate = {
    modelVersion: RETENTION_MODEL_VERSION, generatedAt: Number.isFinite(now.getTime()) ? now.toISOString() : new Date(0).toISOString(),
    probability: null, interval: null, target: 'prior', confidence: 'sin_datos', evidenceCount: 0, topicEvidenceCount: 0,
    stabilityDays: config.initialStabilityDays, lastContactDate: null, daysSinceContact: null,
    coverageScope: 'unknown', recommendedDate: null, recommendation: 'none', reasons: [], featuresUsed: [], policy: config, canteDate: null,
  };
  if (!Number.isFinite(now.getTime())) return { ...empty, reasons: ['Fecha de estimación no válida.'] };
  const topics = new Map(request.topics); topics.set(topic.id, topic);
  const evidence = request.evidence?.cutoff === now.getTime() ? request.evidence : buildRetentionEvidence(request.history, topics, now);
  const contacts = evidence.contacts.get(topic.id) || [];
  const last = contacts.at(-1);
  // Rebuild coverage at the forecast cutoff; future initial study cannot leak.
  const coverage = deriveInitialStudyCoverage(topic.pages, contacts.map(contact => contact.session),
    contacts.length ? undefined : topic.legacyProgress);
  // A legacy aggregate date can supply a contact, but no assessed outcome.
  // A date derived from unavailable/future sessions is not a legacy fact.
  const legacyTime = !topic.historyIsAuthoritative && topic.sessions.length === 0
    ? dayTime(topic.lastContactDate || topic.firstStudyDate) : null;
  const anchor = (coverage.remainingPages !== null && coverage.remainingPages > 0 ? last?.partialMemoryTime : last?.memoryTime)
    ?? (legacyTime !== null && legacyTime < now.getTime() ? legacyTime : null);
  const lastContact = last?.time ?? anchor;
  if (anchor === null) return { ...empty, reasons: ['No hay un contacto fechado; registra estudio o una evaluación de recuerdo.'] };
  const coverageScope: CoverageScope = coverage?.remainingPages === 0 && coverage?.studiedPages !== null && coverage?.status !== 'conflict' ? 'whole_topic'
    : (coverage?.knownStudiedPages || 0) > 0 ? 'studied_portion' : 'unknown';
  const assessed = contacts.filter(contact => contact.outcome);
  const ownRecall = assessed.some(contact => contact.outcome!.target === 'recall' && (coverageScope !== 'whole_topic' || contact.outcome!.scope === 'whole_topic'));
  const ownProxy = assessed.some(contact => contact.outcome!.target === 'grade_proxy');
  const target: RetentionEstimate['target'] = ownRecall ? 'recall' : ownProxy ? 'grade_proxy'
    : evidence.observations.some(row => row.target === 'recall' && row.scope === 'whole_topic') ? 'recall'
    : evidence.observations.some(row => row.target === 'grade_proxy') ? 'grade_proxy' : 'prior';
  const samples = evidence.observations.filter(row => row.target === target && (target !== 'recall'
    || row.scope === (coverageScope === 'studied_portion' ? 'partial' : 'whole_topic')));
  const topicSamples = samples.filter(row => row.topicId === topic.id);
  const context: Features = {
    ...(topic.hasExplicitDifficulty ? { difficulty: topic.difficulty } : {}),
    reviews: contacts.filter(contact => ['review', 'refresh'].includes(getSessionCategory(contact.session))).length,
    vueltas: contacts.filter(contact => contact.session.completesVuelta === true).length,
    contacts: contacts.length, activity: last ? getSessionCategory(last.session) : 'none',
  };
  const featuresUsed = [target === 'grade_proxy' ? 'oral_grade_pass_rate' : 'elapsed_days', 'contact_history'];
  const scales: Partial<Record<'difficulty' | 'reviews' | 'vueltas' | 'contacts', number>> = {};
  if (samples.length >= 8) for (const key of ['difficulty', 'reviews', 'vueltas', 'contacts'] as const) {
    const values = samples.flatMap(row => row.features[key] !== undefined ? [{ value: row.features[key]!, weight: 1 }] : []);
    if (values.length < 8 || context[key] === undefined) continue;
    const scale = weightedQuantile(values, .75) - weightedQuantile(values, .25);
    if (scale > 0) { scales[key] = scale; featuresUsed.push(key); }
  }
  const usesActivity = samples.length >= 8 && new Set(samples.map(sample => sample.features.activity)).size > 1;
  const rows = samples.map(row => {
    let distance = 0;
    for (const key of Object.keys(scales) as Array<keyof typeof scales>) {
      if (row.features[key] !== undefined) distance += Math.min(9, ((row.features[key]! - context[key]!) / scales[key]!) ** 2);
    }
    if (usesActivity && row.features.activity !== context.activity) distance += 1;
    const recent = Math.pow(.5, Math.max(0, now.getTime() - row.time) / DAY / config.recencyHalfLifeDays);
    // Borrow global evidence while gradually favouring this topic. A single
    // result cannot replace the prior or multiply stability abruptly.
    const local = row.topicId === topic.id ? 1 + Math.sqrt(topicSamples.length) : 1;
    return { ...row, weight: recent * local / (1 + distance) };
  });
  const weightTotal = rows.reduce((sum, row) => sum + row.weight, 0);
  if (usesActivity) featuresUsed.push('previous_activity');
  const successes = rows.reduce((sum, row) => sum + row.weight * row.value, 0);
  const p0 = (config.priorStrength * config.initialRecallProbability + successes) / (config.priorStrength + weightTotal);
  const grid = [...new Set([.5, 1, 2, 3, 5, 7, 10, 14, 21, 30, 45, 60, 90, 120, 180, 365, config.initialStabilityDays])].sort((a, b) => a - b);
  const scores = grid.map(stability => {
    // Log-normal prior centred on the explicit initial half-life.
    let score = -.5 * (Math.log(stability / config.initialStabilityDays)) ** 2;
    for (const row of rows) {
      const p = clamp(p0 * Math.pow(.5, row.elapsed / stability), 1e-6, 1 - 1e-6);
      score += row.weight * (row.value * Math.log(p) + (1 - row.value) * Math.log1p(-p));
    }
    return { value: stability, score };
  });
  const best = Math.max(...scores.map(row => row.score));
  const posterior = scores.map(row => ({ value: row.value, weight: Math.exp(row.score - best) }));
  const stability = target === 'recall' && rows.length ? weightedQuantile(posterior, .5) : config.initialStabilityDays;
  const elapsed = Math.max(0, (Math.floor(now.getTime() / DAY) * DAY - anchor) / DAY);
  // Passing oral grades identify a pass-rate, not a forgetting rate. Fitting a
  // memory half-life to that proxy silently changes the meaning of the labels.
  const probability = target === 'grade_proxy' ? p0 : p0 * Math.pow(.5, elapsed / stability);
  const uncertainty = Math.sqrt(p0 * (1 - p0) / (config.priorStrength + weightTotal + 1));
  const lowH = rows.length && target === 'recall' ? weightedQuantile(posterior, .1) : config.initialStabilityDays / 3;
  const highH = rows.length && target === 'recall' ? weightedQuantile(posterior, .9) : config.initialStabilityDays * 3;
  const interval = {
    low: clamp((p0 - 2 * uncertainty) * (target === 'grade_proxy' ? 1 : Math.pow(.5, elapsed / lowH)), 0, probability),
    high: clamp((p0 + 2 * uncertainty) * (target === 'grade_proxy' ? 1 : Math.pow(.5, elapsed / highH)), probability, 1),
  };
  const lastResult = [...assessed].reverse().find(contact => contact.outcome!.target === target)?.outcome;
  const contactElapsed = lastContact === null ? elapsed : Math.max(0, Math.floor((now.getTime() - lastContact) / DAY));
  const reasons = [`Han pasado ${contactElapsed} días desde el último contacto registrado.`];
  if (target === 'prior' || !samples.length) reasons.push(`Sin intervalos evaluados suficientes: parámetros iniciales explícitos (${config.initialStabilityDays} días de semivida), confianza baja.`);
  else reasons.push(`${samples.length} intervalos evaluados; ${topicSamples.length} del propio tema.`);
  if (target === 'grade_proxy') reasons.push('Se estima la posibilidad de aprobar un cante (nota ≥ 5), una señal indirecta; no el porcentaje de contenido recordado. Las notas no identifican una semivida de memoria: la fecha sugerida usa parámetros iniciales prudentes.');
  if (lastResult?.value === 0) reasons.push(target === 'grade_proxy' ? 'La última nota de cante registrada fue inferior a 5.' : 'La última recuperación evaluada sin apuntes no fue satisfactoria.');
  if (last && !last.outcome) reasons.push('El último contacto no evaluó la recuperación; realizar una sesión no demuestra dominio.');
  if (coverageScope !== 'whole_topic') reasons.push(coverageScope === 'studied_portion' ? 'La cobertura inicial conocida es parcial; la orientación se refiere a lo trabajado.' : 'La cobertura inicial exacta es desconocida.');
  const confidence: RetentionEstimate['confidence'] = target === 'recall' && coverageScope === 'whole_topic' && topicSamples.length >= 5 && samples.length >= 15
    ? interval.high - interval.low < .25 && samples.length >= 40 ? 'alta' : 'media' : 'baja';
  // A conservative date, not an appointment. Uncertainty limits how long to
  // postpone checking recall but never creates a second mandatory cante.
  const reviewAfter = reviewIntervalDays(p0, stability, config);
  let due = anchor + reviewAfter * DAY;
  if (lastResult?.value === 0) due = Math.min(due, Math.floor(now.getTime() / DAY) * DAY);
  const canteTime = dayTime(request.canteDate);
  const today = Math.floor(now.getTime() / DAY) * DAY;
  if (canteTime !== null && canteTime >= today) {
    due = Math.min(due, Math.max(today, canteTime - DAY));
    reasons.push(`Hay un cante previsto para el ${request.canteDate}; conviene comprobar el recuerdo antes.`);
  }
  if (scales.difficulty) reasons.push('La dificultad registrada selecciona evidencia comparable; no aplica una penalización fija.');
  return {
    ...empty, probability, interval, target, confidence, evidenceCount: samples.length, topicEvidenceCount: topicSamples.length,
    stabilityDays: stability, lastContactDate: dateString(lastContact!), lastEvidenceDate: dateString(anchor), daysSinceContact: contactElapsed, coverageScope,
    recommendedDate: dateString(due), recommendation: !samples.length || coverageScope === 'unknown' ? 'assess_recall' : 'review',
    reasons, featuresUsed: [...featuresUsed, ...(samples.length ? ['retrieval_outcomes', 'recent_evidence', ...(topicSamples.length ? ['topic_history'] : [])] : [])],
    canteDate: canteTime !== null && canteTime >= today ? request.canteDate! : null,
  };
}

/** Snapshot contains predictions only; it never substitutes for the observed outcome. */
export function captureRetentionPrediction(estimate: RetentionEstimate) {
  return JSON.parse(JSON.stringify({ modelVersion: estimate.modelVersion, generatedAt: estimate.generatedAt,
    probability: estimate.probability, interval: estimate.interval, target: estimate.target, confidence: estimate.confidence,
    evidenceCount: estimate.evidenceCount, topicEvidenceCount: estimate.topicEvidenceCount, stabilityDays: estimate.stabilityDays,
    lastContactDate: estimate.lastContactDate, lastEvidenceDate: estimate.lastEvidenceDate, coverageScope: estimate.coverageScope, policy: estimate.policy })) as Record<string, any>;
}
