import assert from 'node:assert/strict';
import test from 'node:test';
import type { Session, Topic } from '../src/types';
import { getCanonicalTopic } from '../src/lib/canonicalTopicService';
import {
  buildRetentionEvidence, captureRetentionPrediction, DEFAULT_RETENTION_CONFIG,
  estimateRetention, extractRetrievalOutcome, RETENTION_MODEL_VERSION,
} from '../src/lib/retentionModel';

const AS_OF = new Date('2025-06-01T00:00:00.000Z');
const base: Topic = {
  id: 'civil-1', subjectId: 'civil', number: 1, title: 'Synthetic retention fixture',
  pages: 10, difficulty: 5, tiempoEstudioHoras: 0, fechaPrimerEstudio: '',
  fechasRepasos: [], mejorTiempoCantoMinutos: 0, mejorTiempoCantoSegundos: 0, notas: '',
};
const session = (id: string, date: string, extra: Record<string, unknown> = {}): Session => ({
  id: `synthetic-${id}`, topicId: base.id, date, type: 'repaso', durationMinutes: 30,
  notes: '', ...extra,
} as Session);
const study = (extra: Record<string, unknown> = {}) => session('study', '2025-01-01', {
  type: 'primer_estudio', startPage: 1, endPage: 10, ...extra,
});
const recall = (id: string, date: string, success: boolean, coverage = 'whole_topic') => session(id, date, {
  retrieval: { assistance: 'none', outcome: success ? 'success' : 'failure', coverage },
});
const request = (history: Session[], topicBase = base) => {
  const topic = getCanonicalTopic(topicBase, [topicBase], {}, history);
  return { topic, topics: new Map([[topic.id, topic]]), history, asOf: AS_OF };
};
const evaluatedHistory = (success: boolean, target: 'recall' | 'grade_proxy' = 'recall') => [
  study(),
  ...Array.from({ length: 20 }, (_, i) => {
    const date = new Date(Date.UTC(2025, 0, 1 + (i + 1) * 7)).toISOString().slice(0, 10);
    return target === 'recall' ? recall(`recall-${i}`, date, success)
      : session(`grade-${i}`, date, { type: 'canto', cantoGrade: success ? 9 : 3 });
  }),
];
const finiteEstimate = (estimate: ReturnType<typeof estimateRetention>) => {
  assert.ok(Number.isFinite(estimate.stabilityDays) && estimate.stabilityDays > 0);
  if (estimate.probability !== null) {
    assert.ok(estimate.probability >= 0 && estimate.probability <= 1);
    assert.ok(estimate.interval);
    assert.ok(estimate.interval.low >= 0 && estimate.interval.low <= estimate.probability);
    assert.ok(estimate.interval.high <= 1 && estimate.interval.high >= estimate.probability);
  }
};

test('only explicit unassisted retrieval or an assessed cante supplies an outcome', () => {
  assert.deepEqual(extractRetrievalOutcome(recall('success', '2025-02-01', true)), { value: 1, target: 'recall', scope: 'whole_topic' });
  assert.deepEqual(extractRetrievalOutcome(recall('failure', '2025-02-01', false, 'partial')), { value: 0, target: 'recall', scope: 'partial' });
  for (const retrieval of [
    { assistance: 'notes', outcome: 'success', coverage: 'whole_topic' },
    { assistance: 'none', outcome: 'unknown', coverage: 'whole_topic' },
    { outcome: 'success', coverage: 'whole_topic' },
    { assistance: 'none', outcome: 'success', coverage: 'unknown' },
  ]) assert.equal(extractRetrievalOutcome(session('unassessed', '2025-02-01', { retrieval })), null);
  assert.equal(extractRetrievalOutcome(session('mere-study', '2025-02-01', { difficulty: 1, completesVuelta: true, durationMinutes: 999 })), null);
  assert.equal(extractRetrievalOutcome(session('no-cante', '2025-02-01', { cantoGrade: 9 })), null);
});

test('oral grades are a separate passing-grade proxy and do not invent recalled percentages', () => {
  for (const grade of [0, 4.9, 5, 10]) {
    assert.deepEqual(extractRetrievalOutcome(session('grade', '2025-02-01', { type: 'canto', cantoGrade: grade })), {
      value: grade >= 5 ? 1 : 0, target: 'grade_proxy', scope: 'unknown',
    });
  }
  for (const grade of [undefined, null, '', -1, 11, Number.NaN, Number.POSITIVE_INFINITY, true, [], {}, Symbol('invalid')]) {
    assert.equal(extractRetrievalOutcome(session('invalid-grade', '2025-02-01', { type: 'canto', cantoGrade: grade })), null);
  }
  const graded = estimateRetention(request(evaluatedHistory(true, 'grade_proxy')));
  assert.equal(graded.target, 'grade_proxy');
  assert.equal(graded.confidence, 'baja');
  assert.ok(graded.reasons.some(reason => reason.includes('señal indirecta')));
});

test('an explicit recall label takes precedence over an oral-grade proxy without mixing targets', () => {
  const history = [study(),
    session('grade', '2025-02-01', { type: 'canto', cantoGrade: 9 }),
    recall('recall', '2025-02-10', false),
  ];
  const result = estimateRetention(request(history));
  assert.equal(result.target, 'recall');
  assert.equal(result.evidenceCount, 1);
  assert.equal(result.topicEvidenceCount, 1);
  assert.equal(extractRetrievalOutcome({ ...history[2], type: 'canto', cantoGrade: 10 })?.target, 'recall');
});

test('recorded contact alone stays provisional and never proves 100% recall', () => {
  const result = estimateRetention({ ...request([study({ date: '2025-05-31' })]), asOf: AS_OF });
  assert.equal(result.target, 'prior');
  assert.equal(result.confidence, 'baja');
  assert.equal(result.evidenceCount, 0);
  assert.equal(result.recommendation, 'assess_recall');
  assert.ok(result.probability !== null && result.probability > 0 && result.probability < 1);
  assert.ok(result.interval!.high - result.interval!.low > 0.3);
  assert.ok(result.reasons.some(reason => reason.includes('no demuestra dominio')));
  finiteEstimate(result);
});

test('minutes, oral speed and PLSEMA do not manufacture memory efficacy', () => {
  const history = evaluatedHistory(true);
  const changed = history.map(item => ({
    ...item, durationMinutes: 999, cantoSeconds: 59,
    plsema: { activeRecallMinutes: 900, passiveMinutes: 0, schematicMinutes: 0 },
  }));
  const original = request(history);
  assert.deepEqual(estimateRetention(original), estimateRetention({ ...original, history: changed as Session[] }));
});

test('assessed successes and failures learn different half-lives from the same retrieval intervals', () => {
  const successful = estimateRetention(request(evaluatedHistory(true)));
  const unsuccessful = estimateRetention(request(evaluatedHistory(false)));
  assert.equal(successful.target, 'recall');
  assert.equal(successful.evidenceCount, 20);
  assert.equal(unsuccessful.evidenceCount, 20);
  assert.ok(successful.stabilityDays > DEFAULT_RETENTION_CONFIG.initialStabilityDays);
  assert.ok(unsuccessful.stabilityDays <= DEFAULT_RETENTION_CONFIG.initialStabilityDays);
  assert.ok(successful.probability! > unsuccessful.probability!);
  finiteEstimate(successful);
  finiteEstimate(unsuccessful);
});

test('the configured half-life halves the unassessed prior after the stated number of days', () => {
  const input = request([study({ date: '2025-05-25' })]);
  const result = estimateRetention({ ...input, config: { initialStabilityDays: 7, initialRecallProbability: 0.8 } });
  assert.equal(result.stabilityDays, 7);
  assert.ok(Math.abs(result.probability! - 0.4) < 1e-10);
});

test('an unassessed contact cannot renew memory or supply a beneficial intervention effect', () => {
  const history = [study(), recall('assessed', '2025-05-01', true)];
  const input = request(history);
  const before = estimateRetention(input);
  const passive = session('unassessed-contact', '2025-05-31', { durationMinutes: 120 });
  const after = estimateRetention({ ...input, history: [...history, passive] });
  assert.equal(after.probability, before.probability);
  assert.deepEqual(after.interval, before.interval);
  assert.equal(after.stabilityDays, before.stabilityDays);
  assert.equal(after.lastContactDate, '2025-05-31');
  assert.equal(after.lastEvidenceDate, before.lastEvidenceDate);
  assert.equal(after.evidenceCount, before.evidenceCount);
});

test('partial initial coverage is labelled partial and does not become whole-topic evidence', () => {
  const history = [study({ endPage: 5 }), recall('partial-recall', '2025-02-01', true, 'partial')];
  const result = estimateRetention(request(history));
  assert.equal(result.coverageScope, 'studied_portion');
  assert.equal(result.target, 'recall');
  assert.equal(result.confidence, 'baja');
  assert.ok(result.reasons.some(reason => reason.includes('parcial')));
  const completed = request([study(), ...history.slice(1)]);
  const fullResult = estimateRetention(completed);
  assert.equal(fullResult.coverageScope, 'whole_topic');
  assert.equal(fullResult.topicEvidenceCount, 0, 'a partial recall test cannot train a whole-topic forecast');
});

test('a successful partial recall does not renew the whole topic memory anchor', () => {
  const history = [study()];
  const original = estimateRetention(request(history));
  const partial = recall('partial-success', '2025-05-31', true, 'partial');
  const after = estimateRetention(request([...history, partial]));
  assert.equal(after.coverageScope, 'whole_topic');
  assert.equal(after.topicEvidenceCount, 0);
  assert.equal(after.lastEvidenceDate, original.lastEvidenceDate);
  assert.equal(after.probability, original.probability);
});

test('future and cutoff-day outcomes cannot train a historical forecast', () => {
  const before = [study(), recall('past', '2025-05-01', true)];
  const input = request(before);
  const future = [recall('cutoff', '2025-06-01', false), recall('future', '2025-06-02', false)];
  assert.deepEqual(estimateRetention(input), estimateRetention({ ...input, history: [...before, ...future] }));
  const evidence = buildRetentionEvidence([...before, ...future], input.topics, AS_OF);
  assert.equal(evidence.observations.length, 1);
});

test('future initial-study coverage cannot leak into a historical forecast', () => {
  const partial = study({ endPage: 5 });
  const futureCompletion = session('future-completion', '2025-06-02', { type: 'primer_estudio', startPage: 6, endPage: 10 });
  const earlier = estimateRetention(request([partial]));
  const withFuture = estimateRetention(request([partial, futureCompletion]));
  assert.equal(earlier.coverageScope, 'studied_portion');
  assert.equal(withFuture.coverageScope, 'studied_portion');
  assert.equal(withFuture.probability, earlier.probability);
});

test('same-day assessments have no invented elapsed interval and first contact cannot train itself', () => {
  const history = [study(), recall('same-day', '2025-01-01', true), recall('later', '2025-02-01', false)];
  const input = request(history);
  const evidence = buildRetentionEvidence(history, input.topics, AS_OF);
  assert.equal(evidence.observations.length, 1);
  assert.equal(evidence.observations[0].elapsed, 31);
});

test('stable identity deduplicates deliveries, not legitimate equal-content observations', () => {
  const history = [study(), recall('one', '2025-02-01', true), recall('two', '2025-02-01', true)];
  const input = request(history);
  const duplicates = [...history, ...history.map(item => ({ ...item }))];
  assert.deepEqual(estimateRetention(input), estimateRetention({ ...input, history: duplicates }));
  assert.equal(buildRetentionEvidence(duplicates, input.topics, AS_OF).observations.length, 2);
  const conflict = { ...history[1], notes: 'synthetic conflicting delivery' };
  assert.deepEqual(estimateRetention({ ...input, history: [...history, conflict] }),
    estimateRetention({ ...input, history: [conflict, ...history].reverse() }));
});

test('unknown topics, invalid calendar days and unknown activities do not train the model', () => {
  const history = [study(), recall('known', '2025-02-01', true)];
  const input = request(history);
  const invalid = [
    recall('invalid-day', '2025-02-30', true), recall('no-date', '', true),
    { ...recall('other', '2025-02-01', true), topicId: 'unrecognised-topic' },
    { ...recall('no-id', '2025-02-01', true), id: '' },
    { ...recall('activity', '2025-02-01', true), type: 'unsupported' },
  ] as Session[];
  assert.deepEqual(estimateRetention(input), estimateRetention({ ...input, history: [...history, ...invalid] }));
  const badDate = estimateRetention({ ...input, asOf: new Date('invalid') });
  assert.equal(badDate.probability, null);
  assert.equal(badDate.confidence, 'sin_datos');
});

test('malformed input records are ignored before identity sorting or outcome extraction', () => {
  for (const value of [null, undefined, false, 1, 'unstructured']) {
    assert.equal(extractRetrievalOutcome(value as any), null);
  }
  const history = [study(), recall('known', '2025-02-01', true)];
  const input = request(history);
  const malformed = [null, undefined, false, 1, 'unstructured',
    { ...history[1], id: 42 }, { ...history[1], id: '' },
    { ...history[1], id: 'synthetic-bad-topic', topicId: {} },
  ];
  assert.deepEqual(estimateRetention(input), estimateRetention({ ...input, history: [...history, ...malformed] as Session[] }));
});

test('configuration is explicit, bounded and ignores invalid numeric policy values', () => {
  const input = request([study()]);
  const result = estimateRetention({ ...input, config: {
    initialStabilityDays: -3, priorStrength: Number.NaN, initialRecallProbability: 10,
    reviewThreshold: 10, recencyHalfLifeDays: Number.POSITIVE_INFINITY, maxIntervalDays: 100_000,
  } });
  assert.equal(result.policy.initialStabilityDays, DEFAULT_RETENTION_CONFIG.initialStabilityDays);
  assert.equal(result.policy.priorStrength, DEFAULT_RETENTION_CONFIG.priorStrength);
  assert.equal(result.policy.recencyHalfLifeDays, DEFAULT_RETENTION_CONFIG.recencyHalfLifeDays);
  assert.equal(result.policy.initialRecallProbability, 0.99);
  assert.equal(result.policy.reviewThreshold, 0.95);
  assert.equal(result.policy.maxIntervalDays, 3650);
  assert.deepEqual(DEFAULT_RETENTION_CONFIG, {
    initialStabilityDays: 7, initialRecallProbability: .8, priorStrength: 8,
    recencyHalfLifeDays: 180, reviewThreshold: .7, maxIntervalDays: 365,
  });
  finiteEstimate(result);
});

test('a fixed cante commitment constrains advice without changing the probability or appointment', () => {
  const input = request([study({ date: '2025-05-31' })]);
  const original = estimateRetention(input);
  const scheduled = estimateRetention({ ...input, canteDate: '2025-06-03' });
  assert.equal(scheduled.probability, original.probability);
  assert.deepEqual(scheduled.interval, original.interval);
  assert.equal(scheduled.canteDate, '2025-06-03');
  assert.ok(scheduled.recommendedDate! <= '2025-06-02');
  assert.equal(estimateRetention({ ...input, canteDate: '2025-05-01' }).canteDate, null);
});

test('prediction snapshots are detached from model state and never contain observed outcomes', () => {
  const estimate = estimateRetention(request(evaluatedHistory(true)));
  const snapshot = captureRetentionPrediction(estimate);
  assert.equal(snapshot.modelVersion, RETENTION_MODEL_VERSION);
  assert.ok(!('retrieval' in snapshot));
  assert.ok(!('outcome' in snapshot));
  assert.ok(!('sessions' in snapshot));
  const oldLow = snapshot.interval.low;
  const oldPolicy = snapshot.policy.initialStabilityDays;
  estimate.interval!.low = 0;
  estimate.policy.initialStabilityDays = 1;
  assert.equal(snapshot.interval.low, oldLow);
  assert.equal(snapshot.policy.initialStabilityDays, oldPolicy);
  snapshot.interval.low = 0.2;
  assert.equal(estimate.interval!.low, 0);
});

test('cached evidence must match the forecast cutoff and input histories remain unchanged', () => {
  const history = evaluatedHistory(true);
  const input = request(history);
  const original = JSON.stringify(history);
  const stale = buildRetentionEvidence(history, input.topics, new Date('2025-02-01T00:00:00Z'));
  assert.deepEqual(estimateRetention({ ...input, evidence: stale }), estimateRetention(input));
  const shared = buildRetentionEvidence(history, input.topics, AS_OF);
  assert.deepEqual(estimateRetention({ ...input, evidence: shared }), estimateRetention(input));
  assert.equal(JSON.stringify(history), original);
  assert.equal(input.topics.size, 1);
  assert.equal(AS_OF.toISOString(), '2025-06-01T00:00:00.000Z');
});

test('oral passing-grade labels never fit a memory half-life', () => {
  for (const success of [true, false]) {
    const result = estimateRetention(request(evaluatedHistory(success, 'grade_proxy')));
    assert.equal(result.target, 'grade_proxy');
    assert.equal(result.stabilityDays, DEFAULT_RETENTION_CONFIG.initialStabilityDays);
    assert.ok(result.reasons.some(reason => reason.includes('no identifican una semivida')));
  }
});

test('an absent contact remains unknown rather than inventing zero or perfect retention', () => {
  const result = estimateRetention(request([]));
  assert.equal(result.probability, null);
  assert.equal(result.interval, null);
  assert.equal(result.recommendedDate, null);
  assert.equal(result.confidence, 'sin_datos');
});
