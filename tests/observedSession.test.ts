import assert from 'node:assert/strict';
import test from 'node:test';
import { buildObservedSession, type StudySessionTarget, type ObservedSessionForm } from '../src/lib/observedSession';

const target: StudySessionTarget = { topicId: 'synthetic-topic', title: 'Synthetic', type: 'repaso', estimatedMinutes: 90 };
const form: ObservedSessionForm = { minutes: '23', difficulty: '6', date: '2026-11-07', notes: '', completesVuelta: false, cantoGrade: '', cantoSeconds: '' };
test('an estimate never substitutes an empty observed duration', () => {
  assert.throws(() => buildObservedSession(target, { ...form, minutes: '' }));
  const session = buildObservedSession(target, form);
  assert.equal(session.durationMinutes, 23);
  assert.equal(session.estimatedMinutes, 90);
  assert.equal(session.completesVuelta, false);
});
test('only explicit whole review/cante completion adds a vuelta', () => {
  assert.equal(buildObservedSession(target, { ...form, completesVuelta: true }).completesVuelta, true);
  for (const type of ['estudio_inicial', 'refresco'] as const) {
    assert.equal(buildObservedSession({ ...target, type }, { ...form, completesVuelta: true }).completesVuelta, false);
  }
  const session = buildObservedSession({ ...target, metadata: { isPartial: true, startPage: 4, endPage: 6, pagesCount: 3, plannerTaskId: 'synthetic-task' } }, { ...form, startPage: '4', endPage: '6', completesVuelta: true });
  assert.equal(session.completesVuelta, false);
  assert.equal(session.pagesCount, 3);
  assert.equal(session.plannerTaskId, 'synthetic-task');
});

test('planned pages are never mistaken for observed coverage without explicit confirmation', () => {
  const planned = { ...target, type: 'estudio_inicial' as const, metadata: { startPage: 1, endPage: 3, pagesCount: 3, totalPages: 6 } };
  const unknown = buildObservedSession(planned, form);
  assert.equal(unknown.startPage, undefined);
  assert.equal(unknown.pagesCount, undefined);
  const confirmed = buildObservedSession(planned, { ...form, confirmPlannedPages: true });
  assert.equal(confirmed.pagesCount, 3);
  assert.equal(confirmed.totalPagesAtSession, 6);
});
test('invalid dates, duration, difficulty, grade and seconds fail before writing', () => {
  for (const patch of [{ minutes: '-1' }, { minutes: 'Infinity' }, { date: '2026-02-31' }, { difficulty: '11' }]) {
    assert.throws(() => buildObservedSession(target, { ...form, ...patch }));
  }
  assert.throws(() => buildObservedSession({ ...target, type: 'canto' }, { ...form, cantoGrade: '11' }));
  assert.throws(() => buildObservedSession({ ...target, type: 'canto' }, { ...form, cantoSeconds: '60' }));
});
test('cante minutes, seconds and grade are independent observed fields', () => {
  const session = buildObservedSession({ ...target, type: 'canto' }, { ...form, minutes: '12', cantoSeconds: '30', cantoGrade: '7.5' });
  assert.equal(session.durationMinutes, 12);
  assert.equal(session.cantoSeconds, 30);
  assert.equal(session.cantoGrade, 7.5);
});

test('retention forecasts are independent snapshots and an outcome is never supplied by a grade', () => {
  const retentionPrediction = { modelVersion: 'synthetic-model', probability: .7, interval: { low: .3, high: .9 }, evidenceCount: 2 };
  const session = buildObservedSession({ ...target, retentionPrediction }, { ...form, recallOutcome: 'failure', recallCoverage: 'partial' });
  assert.deepEqual(session.retrieval, { outcome: 'failure', coverage: 'partial', assistance: 'none', method: 'self_report' });
  assert.equal(session.retentionPrediction.probability, .7);
  retentionPrediction.interval.low = .6;
  assert.equal(session.retentionPrediction.interval.low, .3);
  const graded = buildObservedSession({ ...target, type: 'canto' }, { ...form, cantoGrade: '9' });
  assert.equal(graded.retrieval, undefined);
  assert.throws(() => buildObservedSession(target, { ...form, recallOutcome: 'success' }));
});
