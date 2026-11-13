import assert from 'node:assert/strict';
import test from 'node:test';
import type { Session, Topic } from '../src/types';
import { syntheticTopics } from './fixtures/syntheticStudyData';
import { evaluateEstimatorTemporally, measureDurationError, summarizeDurationErrors, summarizeTemporalEvaluation, type EvaluationRequest } from '../src/lib/estimationEvaluation';

const topic: Topic = { ...syntheticTopics[0], pages: 99, numeroPalabras: 99000, difficulty: 10 };
function session(id: string, date: string, durationMinutes: number, extras: Record<string, any> = {}): Session {
  return { id, topicId: topic.id, date, durationMinutes, type: 'repaso', notes: 'Synthetic evaluation record', ...extras };
}
const prediction = (estimatedMinutes: number | null, evidenceCount = 1) => ({ estimatedMinutes, evidenceCount,
  interval: estimatedMinutes === null ? null : { low: Math.max(0, estimatedMinutes - 5), high: estimatedMinutes + 5 }, confidence: 'baja', method: 'synthetic-test', modelVersion: 'test-only' });

test('absolute error is defined at zero actual time while percentage error is explicitly missing', () => {
  assert.deepEqual(measureDurationError(0, 10), { actualMinutes: 0, predictedMinutes: 10, absoluteErrorMinutes: 10, percentageError: null });
  const metrics = summarizeDurationErrors([measureDurationError(0, 10), measureDurationError(20, 10)]);
  assert.equal(metrics.count, 2);
  assert.equal(metrics.maeMinutes, 10);
  assert.equal(metrics.medianAbsoluteErrorMinutes, 10);
  assert.equal(metrics.mapePercent, 50);
  assert.equal(metrics.percentageErrorCount, 1);
  assert.throws(() => measureDurationError(-1, 20));
  assert.throws(() => measureDurationError(20, Infinity));
});

test('day-forward requests cannot train on themselves, another same-day record or a later outcome', () => {
  const history = [session('first', '2026-01-01', 20), session('same-day-a', '2026-01-02', 30), session('same-day-b', '2026-01-02', 40), session('future', '2026-01-03', 50)];
  const requests: EvaluationRequest[] = [];
  const result = evaluateEstimatorTemporally({ topics: [topic], history, predict: request => {
    requests.push(request);
    assert.ok(request.history.every(row => row.date < request.asOf.toISOString().slice(0, 10)));
    return prediction(20, request.history.length);
  } });
  assert.equal(requests.length, 3);
  assert.deepEqual(requests.slice(0, 2).map(request => request.history.map(row => row.id)), [['first'], ['first']]);
  assert.equal(result.skipped.noBaseline, 1);
  assert.equal(result.observations.length, 3);
});

test('current masters and actual post-session difficulty never leak into a historical target', () => {
  const history = [session('prior', '2026-01-01', 20), session('target', '2026-01-02', 30, { pagesCount: 3, difficulty: 9 })];
  const result = evaluateEstimatorTemporally({ topics: [topic], history, predict: request => {
    assert.equal(request.topic.hasExplicitPages, false);
    assert.equal(request.topic.hasExplicitWords, false);
    assert.equal(request.topic.hasExplicitDifficulty, false);
    assert.equal(request.work?.pages, 3);
    return prediction(25);
  } });
  assert.equal(result.conditionalVolumeCount, 1);
});

test('explicit prediction-time snapshots can restore available historical feature values', () => {
  const history = [session('prior', '2026-01-01', 20), session('target', '2026-01-02', 30, { pagesCount: 3,
    predictionFeatures: { totalPages: 6, totalWords: 1800, difficulty: 4 } })];
  evaluateEstimatorTemporally({ topics: [topic], history, predict: request => {
    assert.equal(request.topic.pages, 6);
    assert.equal(request.topic.numeroPalabras, 1800);
    assert.equal(request.topic.difficulty, 4);
    return prediction(25);
  } });
});

test('contradictory target page measurements are not silently replaced by a convenient denominator', () => {
  const history = [session('prior', '2026-01-01', 20), session('target', '2026-01-02', 30, { startPage: 1, endPage: 3, pagesCount: 6 })];
  evaluateEstimatorTemporally({ topics: [topic], history, predict: request => {
    assert.equal(request.work, undefined);
    return prediction(null, 0);
  } });
});

test('model and baseline scores use identical eligible pairs and missing predictions are counted', () => {
  const history = [session('one', '2026-01-01', 10), session('two', '2026-01-02', 20), session('three', '2026-01-03', 30)];
  const result = evaluateEstimatorTemporally({ topics: [topic], history, predict: request => request.history.length === 1 ? prediction(null, 0) : prediction(25, 2) });
  const report = summarizeTemporalEvaluation(result);
  assert.equal(report.counts.baselineEligible, 2);
  assert.equal(report.counts.paired, 1);
  assert.equal(report.counts.skipped.modelUnavailable, 1);
  assert.equal(report.overall.model.count, report.overall.baseline.count);
  assert.equal(report.overall.model.maeMinutes, 5);
  assert.equal(report.overall.baseline.maeMinutes, 15);
});

test('oral seconds and activity-specific median baselines preserve units and categories', () => {
  const history = [session('review-one', '2026-01-01', 100), session('cante-one', '2026-01-01', 12, { type: 'canto', cantoSeconds: 30 }),
    session('cante-two', '2026-01-02', 13, { type: 'canto' }), session('review-two', '2026-01-02', 120)];
  const result = evaluateEstimatorTemporally({ topics: [topic], history, predict: request => prediction(request.activity === 'cante' ? 12.5 : 100) });
  const oral = result.observations.find(row => row.activity === 'cante')!;
  const review = result.observations.find(row => row.activity === 'repaso')!;
  assert.equal(oral.baselineMinutes, 12.5);
  assert.equal(oral.actualMinutes, 13);
  assert.equal(review.baselineMinutes, 100);
});

test('outliers are scored honestly rather than removed using their prediction error', () => {
  const history = [session('one', '2026-01-01', 20), session('two', '2026-01-02', 25), session('outlier', '2026-01-03', 600)];
  const result = evaluateEstimatorTemporally({ topics: [topic], history, predict: () => prediction(20) });
  assert.equal(result.observations.length, 2);
  assert.equal(result.observations.at(-1)?.absoluteErrorMinutes, 580);
  const report = summarizeTemporalEvaluation(result);
  assert.equal(report.overall.model.maeMinutes, 292.5);
  assert.equal(report.overall.intervalCoveragePercent, 50);
});

test('missing units, invalid dates and repeated delivery IDs do not fabricate evaluation rows', () => {
  const first = session('one', '2026-01-01', 20);
  const history = [first, { ...first }, session('bad-date', '2026-02-31', 30), session('missing', '2026-01-02', undefined as any), session('target', '2026-01-03', 30)];
  const result = evaluateEstimatorTemporally({ topics: [topic], history, predict: () => prediction(25) });
  assert.equal(result.duplicateDeliveries, 1);
  assert.equal(result.invalidRecords, 2);
  assert.equal(result.observations.length, 1);
});

test('shareable reports have no private row values, identifiers, titles or notes', () => {
  const history = [session('private-id-a', '2026-01-01', 20, { notes: 'private-note-sentinel' }), session('private-id-b', '2026-01-02', 30)];
  const report = summarizeTemporalEvaluation(evaluateEstimatorTemporally({ topics: [topic], history, predict: () => prediction(25) }));
  const text = JSON.stringify(report);
  for (const value of ['private-id-a', 'private-id-b', 'private-note-sentinel', topic.title, topic.id, '2026-01-01']) assert.equal(text.includes(value), false);
  assert.equal(report.overall.model.maeMinutes, 5);
  assert.equal(report.overall.baseline.maeMinutes, 10);
});
