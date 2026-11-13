import type { Session, Topic } from '../types';
import type { TopicProgressData } from './prediction';
import { getCanonicalTopic, getSessionCategory, type CanonicalTopic } from './canonicalTopicService';

export type RetrievalTarget = 'recall' | 'grade_proxy';
export interface EvaluationRetrievalOutcome {
  value: 0 | 1;
  target: RetrievalTarget;
  scope: 'whole_topic' | 'partial' | 'unknown';
}
export interface RetentionEvaluationRequest {
  topic: CanonicalTopic;
  history: Session[];
  topics: ReadonlyMap<string, CanonicalTopic>;
  asOf: Date;
}
export interface RetentionEvaluationPrediction {
  probability: number | null;
  interval: { low: number; high: number } | null;
  target: RetrievalTarget | 'prior';
  confidence: string;
  evidenceCount: number;
  topicEvidenceCount: number;
  modelVersion: string;
  coverageScope?: 'whole_topic' | 'studied_portion' | 'unknown';
}
export interface ProbabilityObservation {
  outcome: 0 | 1;
  probability: number;
}
export interface RetentionEvaluationObservation extends ProbabilityObservation {
  target: RetrievalTarget;
  predictionTarget: RetrievalTarget | 'prior';
  legacyProbability: number | null;
  evidenceCount: number;
  topicEvidenceCount: number;
  intervalWidth: number | null;
  coverageScope: 'whole_topic' | 'studied_portion' | 'unknown';
  difficultyBand: 'low' | 'medium' | 'high' | 'unknown';
  vueltasBand: 'zero' | 'one_to_two' | 'three_or_more' | 'unknown';
  frequencyBand: 'zero' | 'one' | 'two_or_more';
}

const targets: RetrievalTarget[] = ['recall', 'grade_proxy'];
const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const round = (value: number | null) => value === null ? null : Math.round(value * 1e6) / 1e6;
const probability = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
function validDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function recordString(value: unknown): string {
  const sort = (item: any): any => Array.isArray(item) ? item.map(sort) : item && typeof item === 'object'
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, sort(item[key])])) : item;
  return JSON.stringify(sort(value));
}
function neutralDefinition(topic: Topic): Topic {
  // Stable identity joins are retained locally; current numerical masters, free
  // text and present-day progress cannot reconstruct historical model inputs.
  return { id: topic.id, subjectId: topic.subjectId, number: topic.number, title: 'Local evaluation topic',
    pages: 0, difficulty: 0, tiempoEstudioHoras: 0, fechaPrimerEstudio: '', fechasRepasos: [],
    mejorTiempoCantoMinutos: 0, mejorTiempoCantoSegundos: 0, notas: '' };
}
function inputSnapshot(session: Session): Record<string, number> {
  const raw = session as Session & Record<string, any>;
  const context = raw.retentionPrediction?.inputs ?? raw.predictionFeatures ?? raw.prediction?.inputs ?? {};
  const metadata: Record<string, number> = {};
  const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
  const pages = context.totalPages ?? raw.totalPagesAtSession;
  const words = context.totalWords ?? raw.totalWordsAtSession;
  const difficulty = context.difficulty ?? raw.difficultyAtStart;
  if (positive(pages)) metadata.pages = pages;
  if (positive(words)) metadata.numeroPalabras = words;
  if (positive(difficulty) && difficulty <= 10) metadata.difficulty = difficulty;
  return metadata;
}

/** Brier and log loss score probabilities; binary outcomes do not validate probability intervals. */
export function summarizeProbabilityErrors(rows: ProbabilityObservation[]) {
  for (const row of rows) if (!probability(row.probability) || ![0, 1].includes(row.outcome)) throw new Error('Invalid probability evaluation observation.');
  const bins = Array.from({ length: 5 }, (_, index) => {
    const members = rows.filter(row => Math.min(4, Math.floor(row.probability * 5)) === index);
    const predicted = mean(members.map(row => row.probability));
    const observed = mean(members.map(row => row.outcome));
    return { low: index / 5, high: (index + 1) / 5, count: members.length,
      meanProbability: round(predicted), observedFrequency: round(observed),
      absoluteCalibrationGap: round(predicted === null || observed === null ? null : Math.abs(predicted - observed)) };
  });
  const bias = mean(rows.map(row => row.probability - row.outcome));
  const epsilon = 1e-15;
  return { count: rows.length,
    brier: round(mean(rows.map(row => (row.probability - row.outcome) ** 2))),
    logLoss: round(mean(rows.map(row => {
      const clipped = Math.min(1 - epsilon, Math.max(epsilon, row.probability));
      return -(row.outcome * Math.log(clipped) + (1 - row.outcome) * Math.log(1 - clipped));
    }))),
    meanProbability: round(mean(rows.map(row => row.probability))), observedFrequency: round(mean(rows.map(row => row.outcome))),
    predictionBias: round(bias),
    expectedCalibrationError: round(rows.length ? bins.reduce((sum, bin) => sum + bin.count * (bin.absoluteCalibrationGap ?? 0), 0) / rows.length : null),
    calibrationBins: bins };
}

/**
 * Day-forward replay: a target and every other session on its date are absent
 * from training. Identifiers and private text never appear in the returned rows.
 * Injected functions keep the evaluation protocol independent from the model.
 */
export function evaluateRetentionTemporally(options: {
  topics: Topic[];
  history: Session[];
  predict: (request: RetentionEvaluationRequest) => RetentionEvaluationPrediction;
  legacyPredict: (topic: CanonicalTopic, asOf: Date) => { hasData: boolean; currentRetention: number };
  extractOutcome: (session: Session) => EvaluationRetrievalOutcome | null;
}) {
  let invalidRecords = 0;
  let duplicateDeliveries = 0;
  let mergedTombstones = 0;
  const byId = new Map<string, Session>();
  const conflictedIds = new Set<string>();
  for (const session of options.history) {
    if (session && (session as Session & Record<string, any>).mergedIntoSessionId) { mergedTombstones++; continue; }
    if (!session || !session.id || !session.topicId || !validDay(session.date) || getSessionCategory(session) === 'unknown') { invalidRecords++; continue; }
    const previous = byId.get(session.id);
    if (previous) {
      duplicateDeliveries++;
      if (recordString(previous) !== recordString(session)) conflictedIds.add(session.id);
    } else byId.set(session.id, session);
  }
  // Conflicting repeated IDs have no reconstructible historical version.
  const history = [...byId.values()].filter(row => !conflictedIds.has(row.id)).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const definitions = options.topics.map(neutralDefinition);
  const definitionsById = new Map(definitions.map(topic => [topic.id, topic]));
  const activeIds = new Set(history.map(session => session.topicId));
  const activeDefinitions = definitions.filter(topic => activeIds.has(topic.id));
  const observations: RetentionEvaluationObservation[] = [];
  const legacyEligible: Record<RetrievalTarget, ProbabilityObservation[]> = { recall: [], grade_proxy: [] };
  const available = Object.fromEntries(targets.map(target => [target, { validOutcomes: 0, knownTopic: 0, modelAvailable: 0, compatiblePredictions: 0, pairedWithLegacy: 0 }])) as Record<RetrievalTarget, { validOutcomes: number; knownTopic: number; modelAvailable: number; compatiblePredictions: number; pairedWithLegacy: number }>;
  const skipped = { noOutcome: 0, invalidOutcome: 0, partialRecall: 0, unknownRecallScope: 0, unknownTopic: 0, modelUnavailable: 0, invalidPrediction: 0, invalidInterval: 0, incompatibleTarget: 0, incompatibleScope: 0 };
  const modelVersions = new Set<string>();
  for (const target of history) {
    const outcome = options.extractOutcome(target);
    if (!outcome) { skipped.noOutcome++; continue; }
    if (![0, 1].includes(outcome.value) || !targets.includes(outcome.target) || !['whole_topic', 'partial', 'unknown'].includes(outcome.scope)) { skipped.invalidOutcome++; continue; }
    if (outcome.target === 'recall' && outcome.scope !== 'whole_topic') {
      if (outcome.scope === 'partial') skipped.partialRecall++; else skipped.unknownRecallScope++;
      continue;
    }
    available[outcome.target].validOutcomes++;
    if (!definitionsById.has(target.topicId)) { skipped.unknownTopic++; continue; }
    available[outcome.target].knownTopic++;
    const training = history.filter(session => session.date < target.date);
    const metadataById: Record<string, Record<string, number>> = {};
    // Past snapshots may update known features. A target's pre-session snapshot
    // is permitted, but its actual difficulty/grade/current masters are not.
    for (const previous of training) metadataById[previous.topicId] = { ...(metadataById[previous.topicId] || {}), ...inputSnapshot(previous) };
    metadataById[target.topicId] = { ...(metadataById[target.topicId] || {}), ...inputSnapshot(target) };
    const topics = new Map<string, CanonicalTopic>();
    for (const definition of activeDefinitions) topics.set(definition.id, getCanonicalTopic(definition, activeDefinitions,
      { [definition.id]: { ...metadataById[definition.id], historyVersion: 3 } } as unknown as Record<string, TopicProgressData>, training));
    const topic = topics.get(target.topicId)!;
    const asOf = new Date(`${target.date}T00:00:00.000Z`);
    const legacy = options.legacyPredict(topic, new Date(asOf));
    const legacyProbability = legacy.hasData && probability(legacy.currentRetention / 100) ? legacy.currentRetention / 100 : null;
    if (legacyProbability !== null) legacyEligible[outcome.target].push({ outcome: outcome.value, probability: legacyProbability });
    const result = options.predict({ topic, history: training, topics, asOf });
    if (result.modelVersion) modelVersions.add(result.modelVersion);
    if (result.probability === null) { skipped.modelUnavailable++; continue; }
    if (!probability(result.probability) || !['recall', 'grade_proxy', 'prior'].includes(result.target)) { skipped.invalidPrediction++; continue; }
    available[outcome.target].modelAvailable++;
    if (outcome.target === 'recall' && result.coverageScope === 'studied_portion') { skipped.incompatibleScope++; continue; }
    const compatible = result.target === outcome.target;
    if (!compatible && result.target !== 'prior') { skipped.incompatibleTarget++; continue; }
    if (compatible) {
      available[outcome.target].compatiblePredictions++;
      if (legacyProbability !== null) available[outcome.target].pairedWithLegacy++;
    }
    const intervalValid = result.interval && probability(result.interval.low) && probability(result.interval.high)
      && result.interval.low <= result.probability && result.interval.high >= result.probability;
    if (result.interval && !intervalValid) skipped.invalidInterval++;
    const recentBoundary = asOf.getTime() - 7 * 864e5;
    const frequency = topic.sessions.filter(session => Date.parse(`${session.date}T00:00:00.000Z`) >= recentBoundary).length;
    observations.push({ outcome: outcome.value, probability: result.probability, target: outcome.target, predictionTarget: result.target,
      legacyProbability, evidenceCount: Number.isFinite(result.evidenceCount) ? Math.max(0, result.evidenceCount) : 0,
      topicEvidenceCount: Number.isFinite(result.topicEvidenceCount) ? Math.max(0, result.topicEvidenceCount) : 0,
      intervalWidth: intervalValid ? result.interval!.high - result.interval!.low : null,
      coverageScope: result.coverageScope || 'unknown',
      difficultyBand: !topic.hasExplicitDifficulty ? 'unknown' : topic.difficulty <= 3 ? 'low' : topic.difficulty <= 6 ? 'medium' : 'high',
      vueltasBand: !topic.vueltasIsExact ? 'unknown' : topic.vueltas === 0 ? 'zero' : topic.vueltas <= 2 ? 'one_to_two' : 'three_or_more',
      frequencyBand: frequency === 0 ? 'zero' : frequency === 1 ? 'one' : 'two_or_more' });
  }
  return { observations, legacyEligible, available, skipped, modelVersions: [...modelVersions],
    inputCount: options.history.length, validCount: history.length, invalidRecords, duplicateDeliveries, mergedTombstones, conflictingDeliveries: conflictedIds.size };
}

/** Only aggregate scores and fixed category labels are safe to share. */
export function summarizeRetentionEvaluation(result: ReturnType<typeof evaluateRetentionTemporally>) {
  const summarizePairs = (rows: RetentionEvaluationObservation[]) => {
    const paired = rows.filter(row => row.legacyProbability !== null);
    const model = summarizeProbabilityErrors(paired);
    const legacy = summarizeProbabilityErrors(paired.map(row => ({ outcome: row.outcome, probability: row.legacyProbability! })));
    return { modelOnAllAvailable: summarizeProbabilityErrors(rows), paired: { model, legacy,
      brierDifferenceModelMinusLegacy: round(model.brier === null || legacy.brier === null ? null : model.brier - legacy.brier),
      logLossDifferenceModelMinusLegacy: round(model.logLoss === null || legacy.logLoss === null ? null : model.logLoss - legacy.logLoss) },
      meanEvidenceCount: round(mean(rows.map(row => row.evidenceCount))), meanTopicEvidenceCount: round(mean(rows.map(row => row.topicEvidenceCount))),
      probabilityIntervalCount: rows.filter(row => row.intervalWidth !== null).length,
      meanProbabilityIntervalWidth: round(mean(rows.flatMap(row => row.intervalWidth === null ? [] : [row.intervalWidth]))) };
  };
  return { evaluationVersion: 'retention-day-forward-v1',
    protocol: 'Strictly earlier calendar dates only; no same-day outcomes; current masters excluded; model and legacy paired on identical observations.',
    interpretation: {
      recall: 'Whole-topic unaided retrieval outcomes only; retrospective probability scores, not proof of future accuracy.',
      grade_proxy: 'Descriptive prediction of an oral grade threshold, not validated recall or retention.',
      prior: 'Prior predictions are reported separately and excluded from outcome-compatible model comparisons.',
      legacy: 'The old heuristic is scored descriptively; its percentages were not calibrated recall probabilities.',
      intervals: 'Probability uncertainty intervals are not scored as coverage of individual binary outcomes.',
    },
    limitations: [
      'The backup cannot reconstruct historical edits, deleted records or everything known before each session.',
      'Prediction-input snapshots are trusted as pre-session inputs; no captured-at audit trail is assumed.',
      'Sessions on one day are excluded together because reliable within-day event ordering is unavailable.',
      'Current topic extent, words, difficulty, progress and aggregate vueltas are excluded; only earlier facts and explicit snapshots are used.',
      'Partial or unknown-scope recall is excluded from whole-topic scoring; unmeasured sessions do not imply success.',
      'Calibration bins and subgroup differences can be unstable with few or selected observations; no causal interpretation or accuracy gain is asserted.',
      'This retrospective benchmark may be used during model development; confirmation requires later untouched outcomes.',
    ],
    modelVersions: result.modelVersions,
    counts: { input: result.inputCount, valid: result.validCount, invalidRecords: result.invalidRecords, duplicateDeliveries: result.duplicateDeliveries,
      conflictingDeliveries: result.conflictingDeliveries, mergedTombstones: result.mergedTombstones, skipped: result.skipped },
    byTarget: Object.fromEntries(targets.map(target => {
      const rows = result.observations.filter(row => row.target === target && row.predictionTarget === target);
      const bands = <K extends 'difficultyBand' | 'vueltasBand' | 'frequencyBand'>(key: K, values: RetentionEvaluationObservation[K][]) => Object.fromEntries(values.map(value => [value, summarizePairs(rows.filter(row => row[key] === value))]));
      return [target, { availability: result.available[target], ...summarizePairs(rows),
        predictedCoverageScopeCounts: Object.fromEntries(['whole_topic', 'studied_portion', 'unknown'].map(scope => [scope, rows.filter(row => row.coverageScope === scope).length])),
        priorPredictions: summarizePairs(result.observations.filter(row => row.target === target && row.predictionTarget === 'prior')),
        legacyOnAllEligible: summarizeProbabilityErrors(result.legacyEligible[target]),
        byDifficulty: bands('difficultyBand', ['low', 'medium', 'high', 'unknown']),
        byVueltas: bands('vueltasBand', ['zero', 'one_to_two', 'three_or_more', 'unknown']),
        byPriorSevenDayFrequency: bands('frequencyBand', ['zero', 'one', 'two_or_more']) }];
    })) };
}
