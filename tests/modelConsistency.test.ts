import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateTopicCycle } from '../src/lib/oposicionCycle';
import { calculateEstimatedReviewTime } from '../src/lib/repasoPredictor';
import { computeTodayStudyQueue } from '../src/lib/recommendationEngine';
import { sessionMatchesTopic } from '../src/lib/cantoUtils';
import { getLocalDateString } from '../src/lib/utils';
import type { Topic } from '../src/types';
import type { TopicProgressData } from '../src/lib/prediction';

// All examples are generated locally; no backup, Firebase or production imports.
const topic: Topic = {
  id: 'civil-1', subjectId: 'civil', number: 1, title: 'Synthetic topic',
  pages: 12, difficulty: 5, tiempoEstudioHoras: 0, fechaPrimerEstudio: '',
  fechasRepasos: [], mejorTiempoCantoMinutos: 0, mejorTiempoCantoSegundos: 0, notas: '',
};
const daysAgo = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return getLocalDateString(date);
};
const progress = (extra: Partial<TopicProgressData> = {}): TopicProgressData => ({
  pages: 12, difficulty: 5, studyTimeHours: 0, firstStudyDate: '',
  mejorTiempoCantoMinutos: 0, mejorTiempoCantoSegundos: 0, ...extra,
});
const session = (type: string, days: number, extra: Record<string, unknown> = {}) => ({
  id: `synthetic-${type}-${days}`, topicId: topic.id, type, date: daysAgo(days),
  durationMinutes: 30, ...(type === 'primer_estudio' ? { startPage: 1, endPage: 12 } : {}), ...extra,
});

test('unstarted topics cannot become review tasks because their retention is zero', () => {
  for (const history of [{}, { [topic.id]: progress() }]) {
    const queue = computeTodayStudyQueue([topic], history, []);
    assert.equal(queue.repasoTasks.length, 0);
    assert.equal(queue.nuevoTasks.length, 1);
  }
  const cycle = calculateTopicCycle(topic.id, progress(), []);
  assert.equal(cycle.isMonthlyReviewDue, false);
  assert.equal(cycle.isDueToday, false);
});

test('session evidence prevents a studied topic without a progress document being offered as new', () => {
  const queue = computeTodayStudyQueue([topic], {}, [session('primer_estudio', 10)]);
  assert.equal(queue.nuevoTasks.length, 0);
});

test('D0 refresh is deferred until the next day', () => {
  const history = { [topic.id]: progress({ firstStudyDate: daysAgo(0), studyTimeHours: 1 }) };
  const queue = computeTodayStudyQueue([topic], history, [session('primer_estudio', 0)]);
  assert.equal(queue.refrescoTasks.length, 0);
  assert.equal(queue.repasoTasks.length, 0);
});

test('cycle preserves subject identity with a mixed global session history', () => {
  const own = [session('primer_estudio', 10), session('refresco', 8)];
  const mixed = [...own, session('canto', 1, { topicId: 'penal-1', cantoGrade: 9 })];
  assert.deepEqual(calculateTopicCycle(topic.id, undefined, mixed), calculateTopicCycle(topic.id, undefined, own));
});

test('canonical identity cannot be overridden by a number, unrelated notes or another subject', () => {
  const otherSubject = { ...topic, id: 'penal-1', subjectId: 'penal' };
  const otherNumber = { ...topic, id: 'civil-10', number: 10 };
  const record = session('repaso', 1, { topicTitle: 'Tema 10', notes: 'Tema 1 in unrelated free text', topicNumber: 1 });
  assert.equal(sessionMatchesTopic(record, topic), true);
  assert.equal(sessionMatchesTopic(record, otherSubject), false);
  assert.equal(sessionMatchesTopic(record, otherNumber), false);
  assert.equal(sessionMatchesTopic({ ...record, topicId: '1' }, topic), false);
  assert.equal(sessionMatchesTopic({ ...record, topicId: '1', subjectId: 'civil' }, topic), true);
  assert.equal(sessionMatchesTopic({ ...record, topicId: '1', subjectId: 'civil' }, otherSubject), false);
  assert.equal(sessionMatchesTopic({ ...record, topicId: 'const_1' }, { ...topic, id: 'constitucional-1', subjectId: 'constitucional' }), true);
  assert.equal(sessionMatchesTopic({ ...record, topicId: 'penal-12' }, { ...topic, id: 'constitucional-5', number: 5, subjectId: 'constitucional' }), false);
});

test('numeric legacy identifiers require an explicit matching subject', () => {
  assert.equal(calculateTopicCycle(topic.id, progress(), [session('primer_estudio', 10, { topicId: '1' })]).phase, 'sin_iniciar');
  assert.equal(calculateTopicCycle(topic.id, progress(), [session('primer_estudio', 10, { topicId: '1', subjectId: 'penal' })]).phase, 'sin_iniciar');
  assert.equal(calculateTopicCycle(topic.id, progress(), [session('primer_estudio', 10, { topicId: '1', subjectId: 'civil' })]).firstStudyDate, daysAgo(10));
  assert.equal(calculateTopicCycle('constitucional-1', progress(), [session('primer_estudio', 10, { topicId: 'const_1' })]).firstStudyDate, daysAgo(10));
});

test('elapsed days and repeated same-day sessions cannot establish three refresh days', () => {
  const study = session('primer_estudio', 10);
  const alone = calculateTopicCycle(topic.id, progress(), [study]);
  assert.notEqual(alone.phase, 'listo_para_cantar');
  assert.equal(alone.refrescosCount, 0);
  assert.equal(alone.isDueToday, true);
  const repeated = calculateTopicCycle(topic.id, progress(), [study,
    session('refresco', 8, { id: 'synthetic-r1' }),
    session('refresco', 8, { id: 'synthetic-r2' }),
    session('refresco', 8, { id: 'synthetic-r3' }),
    session('refresco', 10), session('refresco', -1),
  ]);
  assert.equal(repeated.refrescosCount, 1);
  assert.notEqual(repeated.phase, 'listo_para_cantar');
});

test('three recorded refresh days do not prove readiness and unrelated refreshes cannot supply evidence', () => {
  const study = session('primer_estudio', 10);
  const ready = calculateTopicCycle(topic.id, progress(), [study,
    session('refresco', 9), session('refresco', 8), session('refresco', 7),
  ]);
  assert.notEqual(ready.phase, 'listo_para_cantar');
  assert.equal(ready.refrescosCount, 3);
  assert.equal(ready.isMonthlyReviewDue, true, 'unevaluated refreshes do not reset demonstrated memory');
  const pending = calculateTopicCycle(topic.id, progress(), [study, session('refresco', 0, { topicId: 'penal-1' })]);
  assert.equal(pending.isRefreshedToday, false);
  assert.equal(pending.isDueToday, true);
});

test('review prediction is independent of delivery order and leaves supplied history unchanged', () => {
  const history = Object.freeze([
    Object.freeze(session('canto', 50, { durationMinutes: 17, cantoGrade: 3 })),
    Object.freeze(session('repaso', 20, { durationMinutes: 80 })),
    Object.freeze(session('canto', 2, { durationMinutes: 12, cantoGrade: 9 })),
  ]);
  const estimate = (sessions: any[]) => calculateEstimatedReviewTime(topic, progress({ studyTimeHours: 5, vueltas: 2 }), sessions);
  const actual = estimate(history as unknown as any[]);
  assert.deepEqual(actual, estimate([...history].reverse()));
  assert.deepEqual(actual, estimate([history[1], history[2], history[0]]));
  assert.equal(history[0].date, daysAgo(50));
  assert.equal(actual.predictedMinutes, 80);
  const withoutOral = estimate([history[1]]);
  assert.equal(withoutOral.predictedMinutes, actual.predictedMinutes, 'oral minutes and grades do not manufacture an unmeasured review penalty');
});

test('oral-only observations cannot manufacture a review duration regardless of their delivery order', () => {
  const early = session('canto', 2, { id: 'synthetic-early', durationMinutes: 17, cantoGrade: 3, createdAt: { seconds: 1000 } });
  const late = session('canto', 2, { id: 'synthetic-late', durationMinutes: 12, cantoGrade: 9, createdAt: { seconds: 2000 } });
  const estimate = (sessions: any[]) => calculateEstimatedReviewTime(topic, progress({ studyTimeHours: 5 }), sessions);
  assert.deepEqual(estimate([early, late]), estimate([late, early]));
  assert.equal(estimate([early, late]).predictedMinutes, null);
  assert.equal(estimate([early, late]).evidenceCount, 0);
  assert.equal(estimate([early]).predictedMinutes, null);
});
