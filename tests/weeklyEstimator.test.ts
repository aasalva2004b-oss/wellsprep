import assert from 'node:assert/strict';
import test from 'node:test';
import type { Session, Topic } from '../src/types';
import { getCanonicalTopic, buildCanonicalTopicMap } from '../src/lib/canonicalTopicService';
import { estimatePersonalizedDuration } from '../src/lib/personalizedEstimator';
import { buildOrRebalanceWeeklyCantePlan, calculateTopicHistoricalPace } from '../src/lib/weeklyCanteEngine';

const topic: Topic = {
  id: 'synthetic-civil-955', subjectId: 'civil', number: 955, title: 'Synthetic estimator topic',
  pages: 6, difficulty: 5, tiempoEstudioHoras: 0, fechaPrimerEstudio: '', fechasRepasos: [],
  mejorTiempoCantoMinutos: 0, mejorTiempoCantoSegundos: 0, notas: '',
};
const observed = (patch: Partial<Session> = {}): Session => ({
  id: 'synthetic-initial', topicId: topic.id, type: 'estudio_inicial', date: '2026-11-01',
  durationMinutes: 30, startPage: 1, endPage: 3, pagesCount: 3, notes: '', ...patch,
});
const asOf = new Date(2026, 10, 2, 10);
const plan = (sessions: Session[]) => buildOrRebalanceWeeklyCantePlan({
  assignedTopicIds: [topic.id], targetDay: 'jueves', allTopics: [topic], sessions,
  referenceDate: asOf,
});

test('weekly preparation never substitutes a generic pace for missing initial-study evidence', () => {
  const pace = calculateTopicHistoricalPace(topic.id, topic, [], 999, {}, [topic], asOf);
  assert.equal(pace.minutesPerPage, null);
  assert.equal(pace.sampleCount, 0);
  const result = plan([]);
  const tasks = Object.values(result.dailyQuotas).flatMap(day => day.tasks);
  assert.ok(tasks.length > 0, 'known pending pages can be scheduled without pretending their duration is known');
  assert.ok(tasks.every(task => task.estimatedMinutes === null));
  assert.equal(result.unknownDurationTaskCount, tasks.length);
  assert.equal(result.historicalAverageMinPerPage, null);
});

test('review and oral observations cannot train the weekly initial-study pace', () => {
  const history = [observed({ id: 'synthetic-review', type: 'repaso' }), observed({ id: 'synthetic-oral', type: 'canto', durationMinutes: 12, cantoSeconds: 30 })];
  assert.equal(calculateTopicHistoricalPace(topic.id, topic, history, 999, {}, [topic], asOf).minutesPerPage, null);
});

test('weekly pace retains valid sub-minute rates independently of displayed duration rounding', () => {
  const history = [observed({ durationMinutes: .3, startPage: 1, endPage: 6, pagesCount: 6 })];
  const pace = calculateTopicHistoricalPace(topic.id, topic, history, undefined, {}, [topic], asOf);
  assert.equal(pace.minutesPerPage, .3 / 6);
  assert.ok(pace.minutesPerPage! > 0);
  assert.equal(pace.sampleCount, 1);
  assert.equal(getCanonicalTopic(topic, [topic], {}, history).initialStudyCoverage.remainingPages, 0);
});

test('weekly task duration uses the shared estimator for precisely its pending range', () => {
  const history = [observed()];
  const result = plan(history);
  const topics = buildCanonicalTopicMap([topic], {}, history);
  const canonical = topics.get(topic.id)!;
  const tasks = Object.values(result.dailyQuotas).flatMap(day => day.tasks);
  assert.deepEqual(tasks.flatMap(task => Array.from({ length: task.pagesCount }, (_, index) => task.fromPage + index)).sort(), [4, 5, 6]);
  for (const task of tasks) {
    const pageNumbers = Array.from({ length: task.pagesCount }, (_, index) => task.fromPage + index);
    const expected = estimatePersonalizedDuration({
      topic: canonical, activity: 'estudio_nuevo', history, topics, asOf,
      work: { pages: pageNumbers.length, pageNumbers, fromPage: task.fromPage, toPage: task.toPage },
    });
    assert.equal(task.estimatedMinutes, expected.estimatedMinutes);
    assert.deepEqual(task.estimateInterval, expected.interval);
    assert.equal(task.estimateEvidenceCount, expected.evidenceCount);
    assert.equal(task.estimateMethod, expected.method);
  }
});

test('duplicate session IDs do not duplicate observed weekly totals or training evidence', () => {
  const session = observed();
  const single = plan([session]);
  const duplicate = plan([session, session]);
  assert.deepEqual(duplicate.topicGoals, single.topicGoals);
  assert.deepEqual(duplicate.dailyQuotas, single.dailyQuotas);
});

test('unknown historical initial coverage does not fabricate ranges or durations', () => {
  const history = [observed({ startPage: undefined, endPage: undefined, pagesCount: undefined })];
  const result = plan(history);
  assert.equal(getCanonicalTopic(topic.id, [topic], {}, history).initialStudyCoverage.remainingPages, null);
  assert.equal(result.hasUnknownProgress, true);
  assert.deepEqual(Object.values(result.dailyQuotas).flatMap(day => day.tasks), []);
});
