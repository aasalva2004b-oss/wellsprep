import test from 'node:test';
import assert from 'node:assert/strict';
import type { Session, Topic } from '../src/types';
import { buildCanonicalTopicMap } from '../src/lib/canonicalTopicService';
import { buildRetentionEvidence, estimateRetention, isSessionAvailableAt } from '../src/lib/retentionModel';
import { generateCantePlanProposal, type CantePlanningInput } from '../src/lib/cantePlanningEngine';
import { DEFAULT_PLANNER_SETTINGS } from '../src/lib/plannerEngine';

// Independent invented observations only; no SDK, private backup or network.
type RecordedSession = Session & Record<string, any>;
const AS_OF = new Date('2026-11-09T10:00:00.000Z');

test('an explicit event clock accepts a past contact across local midnight and rejects a future one', () => {
  const cutoff = new Date('2026-11-08T23:30:00Z'); // 00:30 in Paris on the 9th
  assert.equal(isSessionAvailableAt(row('local-midnight', '2026-11-09', { startedAt: '2026-11-08T23:05:00Z' }), cutoff), true);
  assert.equal(isSessionAvailableAt(row('future-local', '2026-11-09', { startedAt: '2026-11-08T23:45:00Z' }), cutoff), false);
  assert.equal(isSessionAvailableAt(row('unknown-time', '2026-11-09'), cutoff), false);
  assert.equal(isSessionAvailableAt(row('still-in-progress', '2026-11-09', { startedAt: '2026-11-08T23:05:00Z', endedAt: '2026-11-08T23:50:00Z' }), cutoff), false);
});
const catalogue: Topic[] = [901, 902].map(number => ({
  id: `civil-${number}`, subjectId: 'civil', number, title: `[FICTICIO] Revisión crítica ${number}`,
  pages: 6, difficulty: 5, tiempoEstudioHoras: 0, fechaPrimerEstudio: '', fechasRepasos: [],
  mejorTiempoCantoMinutos: 0, mejorTiempoCantoSegundos: 0, notas: '',
}));
function row(id: string, date: string, patch: Partial<RecordedSession> = {}): RecordedSession {
  return { id: `synthetic-critical-${id}`, topicId: 'civil-901', date, type: 'estudio_inicial',
    durationMinutes: 60, startPage: 1, endPage: 6, pagesCount: 6, totalPagesAtSession: 6, notes: '', ...patch };
}
const sourceMeasurements: RecordedSession[] = [
  row('source-initial', '2026-10-01', { topicId: 'civil-902' }),
  row('source-refresh', '2026-10-02', { topicId: 'civil-902', type: 'refresco', durationMinutes: 12 }),
  row('source-review', '2026-10-03', { topicId: 'civil-902', type: 'repaso', durationMinutes: 18 }),
  row('source-oral', '2026-10-04', { topicId: 'civil-902', type: 'canto', durationMinutes: 12, cantoSeconds: 30 }),
];
const mapFor = (history: RecordedSession[]) => buildCanonicalTopicMap(catalogue, {}, history);
const evidence = (history: RecordedSession[]) => buildRetentionEvidence(history, mapFor(history), AS_OF);
const forecast = (history: RecordedSession[]) => {
  const topics = mapFor(history);
  return estimateRetention({ topic: topics.get('civil-901')!, history, topics, asOf: AS_OF });
};
function planning(history: RecordedSession[], patch: Partial<CantePlanningInput> = {}) {
  return generateCantePlanProposal({ canonicalMap: mapFor(history), sessions: history, existingTasks: [],
    settings: { ...DEFAULT_PLANNER_SETTINGS, targetDailyHours: 4 },
    canteGoals: [{ id: 'synthetic-critical-monday', date: '2026-11-16', topicIds: ['civil-901'] }],
    horizonStart: '2026-11-09', horizonEnd: '2026-11-19', asOf: '2026-11-09', forecastAt: AS_OF.toISOString(), ...patch });
}
const own = (plan: ReturnType<typeof planning>) => plan.candidateTasks.filter(task => task.topicId === 'civil-901');
const refreshes = (plan: ReturnType<typeof planning>) => own(plan).filter(task => task.activityType === 'refresco');
const sketch = (plan: ReturnType<typeof planning>) => own(plan).map(task => ({
  id: task.id, activity: task.activityType, date: task.date, pages: task.pagesNumbers,
  minutes: task.estimatedMinutes, requirement: task.requirement, basis: task.proposalBasis,
}));

test('retention excludes future same-day event clocks in ISO and Firestore timestamp forms', () => {
  const initial = row('initial', '2026-11-01');
  const futureTime = Date.parse('2026-11-09T18:00:00Z');
  for (const startedAt of ['2026-11-09T18:00:00Z', { seconds: futureTime / 1000, nanoseconds: 0 }, new Date(futureTime)]) {
    const future = row('future-recall', '2026-11-09', { type: 'repaso', startedAt,
      retrieval: { assistance: 'none', coverage: 'whole_topic', outcome: 'success' } });
    assert.equal(evidence([initial, future]).observations.length, 0);
    assert.deepEqual(forecast([initial, future]), forecast([initial]));
  }
  const available = row('available-recall', '2026-11-09', { type: 'repaso', startedAt: '2026-11-09T09:00:00Z',
    retrieval: { assistance: 'none', coverage: 'whole_topic', outcome: 'failure' } });
  assert.equal(evidence([initial, available]).observations.length, 1);
});

test('a future-only contact cannot leak back through current canonical dates as a legacy anchor', () => {
  const future = row('future-only', '2026-11-09', { startedAt: '2026-11-09T18:00:00Z' });
  const estimate = forecast([future]);
  assert.equal(estimate.probability, null);
  assert.equal(estimate.lastContactDate, null);
  assert.equal(estimate.recommendedDate, null);
});

test('revision selection precedes retention filtering: an available tombstone hides the old active copy in either order', () => {
  const initial = row('initial', '2026-11-01');
  const old = row('revised-recall', '2026-11-05', { type: 'repaso', updatedAt: '2026-11-05T09:00:00Z',
    retrieval: { assistance: 'none', coverage: 'whole_topic', outcome: 'success' } });
  const archived = { ...old, updatedAt: '2026-11-08T09:00:00Z', mergedIntoSessionId: 'synthetic-merged-target' };
  for (const copies of [[old, archived], [archived, old]]) {
    assert.equal(evidence([initial, ...copies]).observations.length, 0);
    assert.deepEqual(forecast([initial, ...copies]), forecast([initial]));
  }
});

test('a future tombstone cannot erase an earlier available retrieval revision', () => {
  const initial = row('initial', '2026-11-01');
  const available = row('revised-recall', '2026-11-05', { type: 'repaso', updatedAt: '2026-11-05T09:00:00Z',
    retrieval: { assistance: 'none', coverage: 'whole_topic', outcome: 'failure' } });
  const future = { ...available, updatedAt: '2026-11-10T09:00:00Z', mergedIntoSessionId: 'synthetic-merged-target' };
  for (const copies of [[available, future], [future, available]]) {
    assert.deepEqual(evidence([initial, ...copies]).observations.map(outcome => outcome.value), [0]);
    assert.deepEqual(forecast([initial, ...copies]), forecast([initial, available]));
  }
});

test('the latest available reassignment cannot resurrect a stale recall under its former topic', () => {
  const first = row('initial-first', '2026-11-01');
  const second = row('initial-second', '2026-11-01', { topicId: 'civil-902' });
  const old = row('moved-recall', '2026-11-05', { type: 'repaso', updatedAt: '2026-11-05T09:00:00Z',
    retrieval: { assistance: 'none', coverage: 'whole_topic', outcome: 'success' } });
  const reassigned = { ...old, topicId: 'civil-902', updatedAt: '2026-11-08T09:00:00Z' };
  for (const copies of [[old, reassigned], [reassigned, old]]) {
    const result = evidence([first, second, ...copies]);
    assert.deepEqual(result.observations.map(outcome => outcome.topicId), ['civil-902']);
  }
});

test('an available edit moving a recall into the future removes it instead of reviving its old date', () => {
  const initial = row('initial', '2026-11-01');
  const old = row('redated-recall', '2026-11-05', { type: 'repaso', updatedAt: '2026-11-05T09:00:00Z',
    retrieval: { assistance: 'none', coverage: 'whole_topic', outcome: 'success' } });
  const redated = { ...old, date: '2026-11-10', updatedAt: '2026-11-08T09:00:00Z' };
  for (const copies of [[old, redated], [redated, old]]) {
    assert.equal(evidence([initial, ...copies]).observations.length, 0);
    assert.deepEqual(forecast([initial, ...copies]), forecast([initial]));
  }
});

test('raw archived deliveries consume no duplicate calendar minutes', () => {
  const old = row('old-part', '2026-11-09', { durationMinutes: 100, updatedAt: '2026-11-09T08:00:00Z' });
  const archived = { ...old, mergedIntoSessionId: 'synthetic-merged-target', updatedAt: '2026-11-09T09:00:00Z' };
  const retained = row('merged-target', '2026-11-09', { durationMinutes: 10, startedAt: '2026-11-09T08:00:00Z' });
  for (const copies of [[old, archived], [archived, old]]) {
    const plan = planning([...sourceMeasurements, ...copies, retained]);
    assert.equal(plan.days.find(day => day.date === '2026-11-09')!.actualMinutes, 10);
  }
});

test('a merge changes calendar accounting only when its revision and replacement become available', () => {
  const old = row('merge-timeline-part', '2026-11-09', { durationMinutes: 100, updatedAt: '2026-11-09T08:00:00Z' });
  const archived = { ...old, mergedIntoSessionId: 'synthetic-critical-merge-timeline-target', updatedAt: '2026-11-09T13:00:00Z' };
  const replacement = row('merge-timeline-target', '2026-11-09', { durationMinutes: 10, createdAt: '2026-11-09T13:00:00Z' });
  const history = [...sourceMeasurements, old, archived, replacement];
  assert.equal(planning(history).days.find(day => day.date === '2026-11-09')!.actualMinutes, 100);
  const afterMerge = planning(history, { forecastAt: '2026-11-09T14:00:00Z' });
  assert.equal(afterMerge.days.find(day => day.date === '2026-11-09')!.actualMinutes, 10);
});

test('planning rebuilds partial coverage from the available revision despite a future full-coverage canonical cache', () => {
  const partial = row('revised-initial', '2026-11-08', { endPage: 3, pagesCount: 3, durationMinutes: 30, updatedAt: '2026-11-08T08:00:00Z' });
  const futureFull = { ...partial, endPage: 6, pagesCount: 6, durationMinutes: 60, updatedAt: '2026-11-10T08:00:00Z' };
  const plans = [[partial, futureFull], [futureFull, partial]].map(copies => {
    const history = [...sourceMeasurements, ...copies];
    assert.equal(mapFor(history).get('civil-901')!.initialStudyCoverage.remainingPages, 0, 'the supplied live cache really contains the later revision');
    const plan = planning(history);
    assert.deepEqual(own(plan).filter(task => task.activityType === 'estudio_nuevo').flatMap(task => task.pagesNumbers!), [4, 5, 6]);
    return plan;
  });
  assert.deepEqual(sketch(plans[0]), sketch(plans[1]));
});

test('a same-day future-only study cannot be treated as an observed completed topic by the planner', () => {
  const future = row('future-study', '2026-11-09', { durationMinutes: 6, startedAt: { seconds: Date.parse('2026-11-09T18:00:00Z') / 1000, nanoseconds: 0 } });
  const plan = planning([...sourceMeasurements, future]);
  const initial = own(plan).filter(task => task.activityType === 'estudio_nuevo');
  assert.deepEqual(initial.flatMap(task => task.pagesNumbers!), [1, 2, 3, 4, 5, 6]);
  assert.equal(plan.days.find(day => day.date === '2026-11-09')!.actualMinutes, 0);
  assert.ok(refreshes(plan).every(task => task.proposalBasis === 'proposed_completion'));
});

test('three-day default remains three whole-topic obligations after actual completion', () => {
  const history = [...sourceMeasurements, row('completed-initial', '2026-11-08')];
  for (const autoRefreshProtocol of ['three_days', undefined] as const) {
    const plan = planning(history, { settings: { ...DEFAULT_PLANNER_SETTINGS, autoRefreshProtocol } });
    const obligations = refreshes(plan);
    assert.deepEqual(obligations.map(task => task.date), ['2026-11-09', '2026-11-10', '2026-11-11']);
    assert.ok(obligations.every(task => task.requirement === 'mandatory' && task.pagesCount === 6 && task.proposalBasis === 'actual_completion'));
  }
});

test('adaptive protocol uses one flexible C recommendation for observed completion rather than three mandatory refreshes', () => {
  const history = [...sourceMeasurements, row('completed-initial', '2026-11-08')];
  const plan = planning(history, { settings: { ...DEFAULT_PLANNER_SETTINGS, autoRefreshProtocol: 'adaptive' } });
  const proposed = refreshes(plan);
  const memory = forecast(history);
  assert.equal(proposed.length, 1);
  assert.equal(proposed[0].date, memory.recommendedDate);
  assert.equal(proposed[0].requirement, 'recommendation');
  assert.equal(proposed[0].proposalBasis, 'actual_completion');
  assert.equal(proposed[0].retentionPrediction?.modelVersion, memory.modelVersion);
  assert.equal(proposed[0].retentionPrediction?.probability, memory.probability);
});

test('adaptive planning for future completion is explicitly conditional and never fabricates a memory observation', () => {
  const history = structuredClone(sourceMeasurements);
  const original = JSON.stringify(history);
  const plan = planning(history, { settings: { ...DEFAULT_PLANNER_SETTINGS, autoRefreshProtocol: 'adaptive' } });
  const study = own(plan).find(task => task.activityType === 'estudio_nuevo')!;
  const proposed = refreshes(plan);
  assert.equal(proposed.length, 1);
  assert.equal(proposed[0].requirement, 'recommendation');
  assert.equal(proposed[0].proposalBasis, 'proposed_completion');
  assert.ok(proposed[0].date > study.date && proposed[0].date < '2026-11-16');
  assert.ok(proposed[0].dependencyTaskIds?.includes(study.id));
  assert.equal(proposed[0].retentionPrediction?.probability, null);
  assert.equal(proposed[0].retentionPrediction?.evidenceCount, 0);
  assert.equal(proposed[0].retentionPrediction?.conditionalOnCompletion, study.date);
  assert.equal(JSON.stringify(history), original);
});

test('disabling the protocol creates no refresh obligation or fabricated observation', () => {
  for (const history of [sourceMeasurements, [...sourceMeasurements, row('completed-initial', '2026-11-08')]]) {
    const original = JSON.stringify(history);
    const plan = planning(history, { settings: { ...DEFAULT_PLANNER_SETTINGS, autoRefreshProtocol: 'off' } });
    assert.equal(refreshes(plan).length, 0);
    assert.ok(plan.conflicts.some(conflict => conflict.code === 'REFRESH_POLICY_EXCEPTION'));
    assert.equal(JSON.stringify(history), original);
  }
});
