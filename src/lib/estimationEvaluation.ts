import type { Session, Topic } from '../types';
import type { TopicProgressData } from './prediction';
import { getCanonicalTopic, getSessionCategory, sessionDurationMinutes, type CanonicalTopic } from './canonicalTopicService';

export type EvaluationActivity = 'estudio_nuevo' | 'refresco' | 'repaso' | 'cante';
export interface EvaluationPrediction {
  estimatedMinutes: number | null;
  interval: { low: number; high: number } | null;
  evidenceCount: number;
  confidence: string;
  method?: string;
  modelVersion?: string;
}
export interface EvaluationRequest {
  topic: CanonicalTopic;
  activity: EvaluationActivity;
  history: Session[];
  topics: Map<string, CanonicalTopic>;
  asOf: Date;
  work?: { pages?: number; pageNumbers?: number[]; fromPage?: number; toPage?: number };
  reviewOrdinal?: number;
  refreshOrdinal?: number;
}
export interface ErrorObservation {
  actualMinutes: number;
  predictedMinutes: number;
  absoluteErrorMinutes: number;
  percentageError: number | null;
}
export interface EvaluationObservation extends ErrorObservation {
  activity: EvaluationActivity;
  baselineMinutes: number;
  baselineAbsoluteErrorMinutes: number;
  baselinePercentageError: number | null;
  evidenceCount: number;
  intervalCovered: boolean | null;
  intervalWidthMinutes: number | null;
}
export interface ErrorMetrics {
  count: number;
  maeMinutes: number | null;
  medianAbsoluteErrorMinutes: number | null;
  mapePercent: number | null;
  percentageErrorCount: number;
}

const activities: EvaluationActivity[] = ['estudio_nuevo', 'refresco', 'repaso', 'cante'];
function activityOf(session: Session): EvaluationActivity | null {
  return ({ initial_study: 'estudio_nuevo', refresh: 'refresco', review: 'repaso', cante: 'cante', unknown: null } as const)[getSessionCategory(session)];
}
function validDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function finitePositive(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}
function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[index] : (sorted[index - 1] + sorted[index]) / 2;
}
function mean(values: number[]): number | null { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; }
function rounded(value: number | null) { return value === null ? null : Math.round(value * 100) / 100; }

/** Percentage error has no mathematical meaning at an actual duration of zero. */
export function measureDurationError(actualMinutes: number, predictedMinutes: number): ErrorObservation {
  if (![actualMinutes, predictedMinutes].every(value => Number.isFinite(value) && value >= 0)) throw new Error('Durations must be finite and nonnegative.');
  const absoluteErrorMinutes = Math.abs(actualMinutes - predictedMinutes);
  return { actualMinutes, predictedMinutes, absoluteErrorMinutes, percentageError: actualMinutes > 0 ? absoluteErrorMinutes / actualMinutes * 100 : null };
}

export function summarizeDurationErrors(observations: ErrorObservation[]): ErrorMetrics {
  const percentages = observations.flatMap(row => row.percentageError === null ? [] : [row.percentageError]);
  return {
    count: observations.length,
    maeMinutes: rounded(mean(observations.map(row => row.absoluteErrorMinutes))),
    medianAbsoluteErrorMinutes: rounded(median(observations.map(row => row.absoluteErrorMinutes))),
    mapePercent: rounded(mean(percentages)), percentageErrorCount: percentages.length,
  };
}

function observedPages(session: Session): EvaluationRequest['work'] {
  const raw = session as Session & Record<string, any>;
  const counts = [raw.pagesStudied, raw.pagesCount].map(finitePositive).filter((value): value is number => value !== undefined);
  if (counts.some(value => Math.abs(value - counts[0]) > 1e-8)) return undefined;
  const count = counts[0];
  const extent = finitePositive(raw.totalPagesAtSession);
  const validCount = (pages: number) => (count === undefined || Math.abs(pages - count) < 1e-8) && (extent === undefined || pages <= extent);
  if (Array.isArray(raw.pagesNumbers) && raw.pagesNumbers.length && raw.pagesNumbers.every((page: unknown) => Number.isInteger(page) && Number(page) >= 1)) {
    const pageNumbers = [...new Set<number>(raw.pagesNumbers)];
    return validCount(pageNumbers.length) ? { pages: pageNumbers.length, pageNumbers } : undefined;
  }
  const from = raw.startPage ?? raw.fromPage;
  const to = raw.endPage ?? raw.toPage;
  if (Number.isInteger(from) && Number.isInteger(to) && from >= 1 && to >= from) {
    const pages = to - from + 1;
    return validCount(pages) ? { pages, fromPage: from, toPage: to } : undefined;
  }
  if (from !== undefined || to !== undefined || raw.pagesNumbers !== undefined) return undefined;
  return count === undefined || !validCount(count) ? undefined : { pages: count };
}

function stableDefinition(topic: Topic): Topic {
  // Current edited masters are not historical evidence about a past prediction.
  return { ...topic, pages: 0, numeroPalabras: undefined, difficulty: 0, epigrafes: undefined,
    tiempoEstudioHoras: 0, fechaPrimerEstudio: '', fechasRepasos: [], mejorTiempoCantoMinutos: 0, mejorTiempoCantoSegundos: 0, notas: '' };
}

/**
 * Day-forward, prequential benchmark. No same-day or future observation trains a prediction.
 * Per-session rows remain in memory; use summarizeTemporalEvaluation for shareable reports.
 */
export function evaluateEstimatorTemporally(options: {
  topics: Topic[];
  history: Session[];
  predict: (request: EvaluationRequest) => EvaluationPrediction;
}) {
  const predict = options.predict;
  const seen = new Set<string>();
  let duplicateDeliveries = 0;
  let invalidRecords = 0;
  const history = options.history.filter(session => {
    const actual = sessionDurationMinutes(session);
    if (!session.id || !session.topicId || !validDay(session.date) || !activityOf(session) || !Number.isFinite(actual) || actual <= 0) { invalidRecords++; return false; }
    if (seen.has(session.id)) { duplicateDeliveries++; return false; }
    seen.add(session.id); return true;
  }).slice().sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const definitions = options.topics.map(stableDefinition);
  const byTopic = new Map(definitions.map(topic => [topic.id, topic]));
  // Unobserved catalogue entries have no numerical masters in this protocol and
  // cannot supply training evidence. Avoid rebuilding hundreds of empty topics.
  const observedTopicIds = new Set(history.map(session => session.topicId));
  const activeDefinitions = definitions.filter(topic => observedTopicIds.has(topic.id));
  const observations: EvaluationObservation[] = [];
  const skipped: Record<string, number> = { noBaseline: 0, unknownTopic: 0, modelUnavailable: 0, invalidPrediction: 0 };
  const availability = Object.fromEntries(activities.map(activity => [activity, { valid: 0, baselineEligible: 0, paired: 0, unavailable: 0 }])) as Record<EvaluationActivity, { valid: number; baselineEligible: number; paired: number; unavailable: number }>;
  let availableBaselineCount = 0;
  let conditionalVolumeCount = 0;
  const baselineEligible: ErrorObservation[] = [];
  const modelVersions = new Set<string>();
  for (const target of history) {
    const activity = activityOf(target)!;
    availability[activity].valid++;
    const training = history.filter(session => session.date < target.date);
    const baseline = median(training.filter(session => activityOf(session) === activity).map(sessionDurationMinutes));
    if (baseline === null) { skipped.noBaseline++; continue; }
    const actual = sessionDurationMinutes(target);
    availableBaselineCount++;
    availability[activity].baselineEligible++;
    baselineEligible.push(measureDurationError(actual, baseline));
    const definition = byTopic.get(target.topicId);
    if (!definition) { skipped.unknownTopic++; continue; }
    const raw = target as Session & Record<string, any>;
    // A prediction snapshot may contain inputs recorded before the outcome. Actual
    // post-session difficulty is deliberately NOT used as the target feature.
    const context = raw.predictionFeatures || raw.prediction?.inputs || {};
    const metadata: Record<string, any> = {};
    const historicalPages = finitePositive(context.totalPages ?? raw.totalPagesAtSession);
    const historicalWords = finitePositive(context.totalWords ?? raw.totalWordsAtSession ?? raw.wordsAtSession);
    const historicalDifficulty = finitePositive(context.difficulty ?? raw.difficultyAtStart);
    if (historicalPages !== undefined) metadata.pages = historicalPages;
    if (historicalWords !== undefined) metadata.numeroPalabras = historicalWords;
    if (historicalDifficulty !== undefined && historicalDifficulty <= 10) metadata.difficulty = historicalDifficulty;
    const map = new Map<string, CanonicalTopic>();
    for (const topic of activeDefinitions) map.set(topic.id, getCanonicalTopic(topic, activeDefinitions,
      (topic.id === target.topicId ? { [topic.id]: metadata } : {}) as Record<string, TopicProgressData>, training));
    const topic = map.get(target.topicId)!;
    const work = observedPages(target);
    if (work) conditionalVolumeCount++;
    const sameTopic = training.filter(session => session.topicId === target.topicId);
    const result = predict({
      topic, activity, history: training, topics: map,
      asOf: new Date(`${target.date}T00:00:00.000Z`), work,
      reviewOrdinal: sameTopic.filter(session => activityOf(session) === 'repaso').length + 1,
      refreshOrdinal: sameTopic.filter(session => activityOf(session) === 'refresco').length + 1,
    });
    if (result.modelVersion) modelVersions.add(result.modelVersion);
    if (result.estimatedMinutes === null) { skipped.modelUnavailable++; availability[activity].unavailable++; continue; }
    if (!Number.isFinite(result.estimatedMinutes) || result.estimatedMinutes < 0) { skipped.invalidPrediction++; continue; }
    const measured = measureDurationError(actual, result.estimatedMinutes);
    const baselineMeasured = measureDurationError(actual, baseline);
    const interval = result.interval && Number.isFinite(result.interval.low) && Number.isFinite(result.interval.high)
      && result.interval.low >= 0 && result.interval.high >= result.interval.low ? result.interval : null;
    observations.push({ ...measured, activity, baselineMinutes: baseline,
      baselineAbsoluteErrorMinutes: baselineMeasured.absoluteErrorMinutes, baselinePercentageError: baselineMeasured.percentageError,
      evidenceCount: Number.isFinite(result.evidenceCount) ? Math.max(0, result.evidenceCount) : 0,
      intervalCovered: interval ? actual >= interval.low && actual <= interval.high : null,
      intervalWidthMinutes: interval ? interval.high - interval.low : null,
    });
    availability[activity].paired++;
  }
  return { observations, baselineEligible, availableBaselineCount, conditionalVolumeCount,
    inputCount: options.history.length, validCount: history.length, duplicateDeliveries, invalidRecords, skipped,
    modelVersions: [...modelVersions], activities, availability };
}

/** No user IDs, titles, notes, dates or per-session rows leave the local evaluator. */
export function summarizeTemporalEvaluation(result: ReturnType<typeof evaluateEstimatorTemporally>) {
  const summarizePairs = (rows: EvaluationObservation[]) => {
    const model = summarizeDurationErrors(rows);
    const baseline = summarizeDurationErrors(rows.map(row => ({ actualMinutes: row.actualMinutes,
      predictedMinutes: row.baselineMinutes, absoluteErrorMinutes: row.baselineAbsoluteErrorMinutes, percentageError: row.baselinePercentageError })));
    const intervals = rows.filter(row => row.intervalCovered !== null);
    return { model, baseline, maeImprovementPercent: model.maeMinutes !== null && baseline.maeMinutes !== null && baseline.maeMinutes > 0
      ? rounded((baseline.maeMinutes - model.maeMinutes) / baseline.maeMinutes * 100) : null,
      intervalCoveragePercent: intervals.length ? rounded(intervals.filter(row => row.intervalCovered).length / intervals.length * 100) : null,
      intervalCount: intervals.length, meanIntervalWidthMinutes: rounded(mean(intervals.map(row => row.intervalWidthMinutes!))),
      meanEvidenceCount: rounded(mean(rows.map(row => row.evidenceCount))) };
  };
  return {
    evaluationVersion: 'day-forward-volume-consistency-v1',
    protocol: 'day-forward; train only on strictly earlier session dates; same eligible pairs for model/baseline',
    limitations: [
      'Snapshot benchmark, not a prospective clinical or pedagogical validation.',
      'Current master extent, words and difficulty are excluded unless a contemporaneous snapshot was recorded.',
      'Measured target work volume is used when available: volume-conditioned evaluation, not proof of prospective planned-volume accuracy.',
      'The backup does not reconstruct past edits, deleted records or the exact data available when historical sessions occurred.',
      'Unavailable model predictions are reported separately; paired accuracy must be read with coverage.',
      'Model development may iterate on this retrospective benchmark; confirmation requires later untouched observations.',
    ],
    modelVersions: result.modelVersions,
    counts: { input: result.inputCount, valid: result.validCount, duplicateDeliveries: result.duplicateDeliveries,
      invalidRecords: result.invalidRecords, baselineEligible: result.availableBaselineCount,
      paired: result.observations.length, volumeConditionedRequests: result.conditionalVolumeCount, skipped: result.skipped },
    overall: summarizePairs(result.observations),
    byActivity: Object.fromEntries(activities.map(activity => [activity, { availability: result.availability[activity], ...summarizePairs(result.observations.filter(row => row.activity === activity)) }])),
    baselineOnAllEligible: summarizeDurationErrors(result.baselineEligible),
  };
}
