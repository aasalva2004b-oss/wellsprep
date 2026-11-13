import assert from 'node:assert/strict';
import test from 'node:test';
import type { Session, Topic } from '../src/types';
import { syntheticTopics } from './fixtures/syntheticStudyData';
import { extractRetrievalOutcome, estimateRetention } from '../src/lib/retentionModel';
import { evaluateRetentionTemporally, summarizeProbabilityErrors, summarizeRetentionEvaluation,
  type RetentionEvaluationPrediction, type RetentionEvaluationRequest } from '../src/lib/retentionEvaluation';

const topic: Topic = { ...syntheticTopics[0], pages: 99, numeroPalabras: 99000, difficulty: 10 };
const legacyPredict = () => ({ hasData: true, currentRetention: 60 });
const prediction = (probability: number | null, target: RetentionEvaluationPrediction['target'] = 'recall'): RetentionEvaluationPrediction => ({
  probability, interval: probability === null ? null : { low: Math.max(0, probability - .1), high: Math.min(1, probability + .1) },
  target, evidenceCount: 2, topicEvidenceCount: 1, confidence: 'baja', modelVersion: 'synthetic-retention-test',
});
function session(id: string, date: string, extra: Record<string, any> = {}): Session {
  return { id, topicId: topic.id, date, type: 'repaso', durationMinutes: 15, notes: 'Synthetic retention record',
    retrieval: { outcome: 'success', coverage: 'whole_topic', assistance: 'none' }, ...extra } as Session;
}
const evaluate = (history: Session[], predict: (request: RetentionEvaluationRequest) => RetentionEvaluationPrediction = () => prediction(.7)) =>
  evaluateRetentionTemporally({ topics: [topic], history, predict, legacyPredict, extractOutcome: extractRetrievalOutcome });

test('Brier/log loss and calibration bins use probabilities including finite endpoints', () => {
  const metrics = summarizeProbabilityErrors([{ outcome: 1, probability: .8 }, { outcome: 0, probability: .2 }]);
  assert.equal(metrics.brier, .04);
  assert.equal(metrics.logLoss, .223144);
  assert.equal(metrics.predictionBias, 0);
  assert.equal(metrics.expectedCalibrationError, .2);
  const endpoints = summarizeProbabilityErrors([{ outcome: 1, probability: 0 }, { outcome: 0, probability: 1 }]);
  assert.equal(endpoints.brier, 1);
  assert.ok(Number.isFinite(endpoints.logLoss));
  assert.equal(endpoints.calibrationBins[0].count, 1);
  assert.equal(endpoints.calibrationBins[4].count, 1);
  assert.equal(summarizeProbabilityErrors([]).brier, null);
  assert.throws(() => summarizeProbabilityErrors([{ outcome: 1, probability: 1.1 }]));
});

test('target, same-day neighbours and future outcomes never train the prediction', () => {
  const history = [session('first', '2026-01-01'), session('same-a', '2026-01-02'), session('same-b', '2026-01-02'), session('future', '2026-01-03')];
  const requests: RetentionEvaluationRequest[] = [];
  evaluate(history, request => {
    requests.push(request);
    const day = request.asOf.toISOString().slice(0, 10);
    assert.ok(request.history.every(row => row.date < day));
    for (const canonical of request.topics.values()) assert.ok(canonical.sessions.every(row => row.date < day));
    return prediction(.7);
  });
  assert.deepEqual(requests[0].history, []);
  assert.deepEqual(requests.slice(1, 3).map(request => request.history.map(row => row.id)), [['first'], ['first']]);
  assert.equal(requests.length, 4);
});

test('current masters, aggregate rounds and target post-session difficulty are excluded', () => {
  evaluate([session('prior', '2026-01-01', { completesVuelta: false }), session('target', '2026-01-02', { difficulty: 9, completesVuelta: true, vueltas: 50 })], request => {
    assert.equal(request.topic.hasExplicitPages, false);
    assert.equal(request.topic.hasExplicitWords, false);
    assert.equal(request.topic.hasExplicitDifficulty, false);
    assert.equal(request.topic.vueltas, 0);
    return prediction(.7);
  });
});

test('pre-session snapshots restore historical features and difficulty bands only when available', () => {
  const result = evaluate([session('prior', '2026-01-01', { predictionFeatures: { totalPages: 6, totalWords: 1800, difficulty: 3 } }),
    session('target', '2026-01-02', { difficultyAtStart: 7, difficulty: 2 })], request => {
    assert.equal(request.topic.pages, 6);
    assert.equal(request.topic.numeroPalabras, 1800);
    assert.equal(request.topic.difficulty, request.history.length ? 7 : 3);
    return prediction(.7);
  });
  assert.deepEqual(result.observations.map(row => row.difficultyBand), ['low', 'high']);
});

test('recall and grade proxies stay separate; partial recall never becomes whole-topic success', () => {
  const history = [session('full', '2026-01-01'), session('partial', '2026-01-02', { retrieval: { outcome: 'success', coverage: 'partial', assistance: 'none' } }),
    session('grade', '2026-01-03', { type: 'canto', retrieval: undefined, cantoGrade: 6 }),
    session('no-outcome', '2026-01-04', { retrieval: undefined, completesVuelta: true, difficulty: 2 })];
  const result = evaluate(history, request => prediction(.7, request.history.length > 1 ? 'grade_proxy' : 'recall'));
  const report = summarizeRetentionEvaluation(result);
  assert.equal(result.skipped.partialRecall, 1);
  assert.equal(result.skipped.noOutcome, 1);
  assert.equal(report.byTarget.recall.modelOnAllAvailable.count, 1);
  assert.equal(report.byTarget.grade_proxy.modelOnAllAvailable.count, 1);
  assert.deepEqual(extractRetrievalOutcome(history[2]), { value: 1, target: 'grade_proxy', scope: 'unknown' });
});

test('prior and incompatible targets cannot inflate compatible model performance', () => {
  const result = evaluate([session('prior', '2026-01-01'), session('mismatch', '2026-01-02'), session('match', '2026-01-03')],
    request => prediction(.7, request.history.length === 0 ? 'prior' : request.history.length === 1 ? 'grade_proxy' : 'recall'));
  const report = summarizeRetentionEvaluation(result);
  assert.equal(report.byTarget.recall.modelOnAllAvailable.count, 1);
  assert.equal(report.byTarget.recall.priorPredictions.modelOnAllAvailable.count, 1);
  assert.equal(result.skipped.incompatibleTarget, 1);
  assert.equal(report.byTarget.recall.availability.validOutcomes, 3);
});

test('a prediction about a studied portion is not scored as whole-topic recall', () => {
  const result = evaluate([session('whole-topic-outcome', '2026-01-01')], () => ({ ...prediction(.7), coverageScope: 'studied_portion' }));
  assert.equal(result.skipped.incompatibleScope, 1);
  assert.equal(result.observations.length, 0);
});

test('paired scores use identical observations while missing predictions stay visible', () => {
  const result = evaluate([session('missing', '2026-01-01'), session('available', '2026-01-02', { retrieval: { outcome: 'failure', coverage: 'whole_topic', assistance: 'none' } })],
    request => prediction(request.history.length ? .7 : null));
  const report = summarizeRetentionEvaluation(result);
  const scores = report.byTarget.recall;
  assert.equal(scores.paired.model.count, 1);
  assert.equal(scores.paired.legacy.count, 1);
  assert.equal(scores.paired.model.brier, .49);
  assert.equal(scores.paired.legacy.brier, .36);
  assert.equal(scores.legacyOnAllEligible.count, 2);
  assert.equal(report.counts.skipped.modelUnavailable, 1);
});

test('invalid intervals are counted without treating binary outcomes as probability coverage', () => {
  const result = evaluate([session('bad-interval', '2026-01-01')], () => ({ ...prediction(.7), interval: { low: .8, high: 1 } }));
  const report = summarizeRetentionEvaluation(result);
  assert.equal(result.skipped.invalidInterval, 1);
  assert.equal(report.byTarget.recall.probabilityIntervalCount, 0);
  assert.equal('intervalCoverage' in report.byTarget.recall, false);
});

test('duplicate deliveries count once and ambiguous conflicting IDs are excluded', () => {
  const first = session('one', '2026-01-01');
  const conflict = session('conflict', '2026-01-02');
  const result = evaluate([first, { ...first }, conflict, { ...conflict, durationMinutes: 99 }, session('invalid', '2026-02-31')]);
  assert.equal(result.duplicateDeliveries, 2);
  assert.equal(result.conflictingDeliveries, 1);
  assert.equal(result.invalidRecords, 1);
  assert.equal(result.validCount, 1);
});

test('merged-session tombstones do not supply contacts or outcomes a second time', () => {
  const result = evaluate([session('merged-part', '2026-01-01', { mergedIntoSessionId: 'retained' }), session('retained', '2026-01-02')], request => {
    assert.equal(request.history.length, 0);
    return prediction(.7);
  });
  assert.equal(result.mergedTombstones, 1);
  assert.equal(result.validCount, 1);
  assert.equal(summarizeRetentionEvaluation(result).counts.mergedTombstones, 1);
});

test('inferred legacy rounds are labelled unknown in bias groups', () => {
  const result = evaluate([session('legacy-prior', '2026-01-01'), session('target', '2026-01-02')]);
  assert.equal(result.observations[1].vueltasBand, 'unknown');
});

test('bias subgroups use only prior observed rounds and prior seven-day contacts', () => {
  const result = evaluate([session('one', '2026-01-01', { completesVuelta: true }),
    session('two', '2026-01-02', { completesVuelta: true }), session('three', '2026-01-12')]);
  assert.deepEqual(result.observations.map(row => row.vueltasBand), ['zero', 'one_to_two', 'one_to_two']);
  assert.deepEqual(result.observations.map(row => row.frequencyBand), ['zero', 'one', 'zero']);
  assert.ok(result.observations.every(row => row.difficultyBand === 'unknown'));
});

test('the actual estimator runs through the independent temporal protocol on synthetic data', () => {
  const history = [session('contact', '2026-01-01', { retrieval: undefined }), session('success', '2026-01-03'),
    session('failure', '2026-01-06', { retrieval: { outcome: 'failure', coverage: 'whole_topic', assistance: 'none' } })];
  const result = evaluate(history, estimateRetention);
  assert.equal(result.observations.length, 2);
  assert.ok(result.observations.every(row => row.probability >= 0 && row.probability <= 1));
  assert.equal(result.observations[0].predictionTarget, 'prior');
  assert.equal(result.observations[1].predictionTarget, 'recall');
});

test('shareable reports contain no identifiers, titles, notes, dates or raw session rows', () => {
  const report = summarizeRetentionEvaluation(evaluate([session('private-id-sentinel', '2026-01-01', { notes: 'private-note-sentinel' })]));
  const text = JSON.stringify(report);
  for (const value of ['private-id-sentinel', 'private-note-sentinel', topic.id, topic.title, '2026-01-01', 'topicId', 'sessionId']) assert.equal(text.includes(value), false);
  assert.equal(report.byTarget.recall.modelOnAllAvailable.count, 1);
});
