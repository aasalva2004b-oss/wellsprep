import assert from 'node:assert/strict';
import test from 'node:test';
import type { Session, Topic } from '../src/types';
import { buildOrRebalanceWeeklyCantePlan } from '../src/lib/weeklyCanteEngine';
import { getCanonicalTopic } from '../src/lib/canonicalTopicService';

const topic: Topic = {
  id: 'synthetic-civil-701', subjectId: 'civil', number: 701, title: 'Synthetic coverage',
  pages: 6, difficulty: 5, tiempoEstudioHoras: 0, fechaPrimerEstudio: '',
  fechasRepasos: [], mejorTiempoCantoMinutos: 0, mejorTiempoCantoSegundos: 0, notas: '',
};
const observed = (extra: Record<string, unknown> = {}): Session => ({
  id: 'synthetic-initial', topicId: topic.id, type: 'estudio_inicial', date: '2026-11-02',
  durationMinutes: 30, notes: '', startPage: 1, endPage: 3, pagesCount: 3,
  ...extra,
});
const build = (sessions: Session[] = [], extra: Record<string, any> = {}) => buildOrRebalanceWeeklyCantePlan({
  assignedTopicIds: [topic.id], targetDay: 'jueves', allTopics: [topic], sessions,
  referenceDate: new Date(2026, 10, 2, 10), ...extra,
});
const plannedPages = (plan: ReturnType<typeof build>) => Object.values(plan.dailyQuotas).flatMap(day =>
  day.tasks.flatMap(task => Array.from({ length: task.pagesCount }, (_, index) => task.fromPage + index))).sort((a, b) => a - b);

test('weekly preparation keeps initial-study coverage separate from review, refresh and cante', () => {
  const sessions = [observed(), observed({ id: 'synthetic-review', type: 'repaso', startPage: 4, endPage: 6 }),
    observed({ id: 'synthetic-refresh', type: 'refresco', startPage: 4, endPage: 6 }),
    observed({ id: 'synthetic-cante', type: 'canto', startPage: 4, endPage: 6 })];
  const plan = build(sessions);
  const goal = plan.topicGoals[topic.id];
  assert.equal(goal.totalPages, 6);
  assert.equal(goal.completedPages, 3);
  assert.equal(goal.remainingPages, 3);
  assert.equal(goal.hasKnownProgress, true);
  assert.equal(goal.isComplete, false);
  assert.deepEqual(plannedPages(plan), [4, 5, 6]);
});

test('weekly goals use canonical masters instead of custom/cache/manual copies', () => {
  const plan = build([observed()], {
    userProgress: { [topic.id]: { pages: 8 } }, customTopicPages: { [topic.id]: 90 },
    progressOverrides: { [topic.id]: { completedPages: 8 } },
  });
  assert.equal(plan.topicGoals[topic.id].totalPages, 8);
  assert.equal(plan.topicGoals[topic.id].completedPages, 3);
  assert.equal(plan.topicGoals[topic.id].remainingPages, 5);
  assert.deepEqual(plannedPages(plan), [4, 5, 6, 7, 8]);
  assert.ok(plan.evidenceWarnings.length > 0);
});

test('noncontiguous observed pages schedule their actual holes without restudying completed pages', () => {
  const plan = build([observed({ startPage: undefined, endPage: undefined, pagesCount: 2, pagesNumbers: [2, 4] })]);
  assert.deepEqual(plan.topicGoals[topic.id].studiedPageNumbers, [2, 4]);
  assert.deepEqual(plannedPages(plan), [1, 3, 5, 6]);
});

test('anonymous counts, legacy dates and manual percentages preserve uncertainty without invented tasks', () => {
  const anonymous = build([observed({ startPage: undefined, endPage: undefined })]);
  const legacy = build([], { userProgress: { [topic.id]: { pages: 6, firstStudyDate: '2026-11-01', coveragePct: 50 } }, progressOverrides: { [topic.id]: { completedPages: 3 } } });
  for (const plan of [anonymous, legacy]) {
    assert.equal(plan.status, 'needs_evidence');
    assert.equal(plan.overallProgressKnown, false);
    assert.equal(plan.hasUnknownProgress, true);
    assert.equal(plan.topicGoals[topic.id].remainingPages, null);
    assert.equal(plan.topicGoals[topic.id].hasKnownProgress, false);
    assert.deepEqual(plannedPages(plan), []);
  }
});

test('unknown extent never becomes an already-completed zero-page topic or a cached size', () => {
  const plan = build([], { userProgress: { [topic.id]: { pages: 0 } }, customTopicPages: { [topic.id]: 90 } });
  assert.equal(plan.topicGoals[topic.id].totalPages, 0);
  assert.equal(plan.topicGoals[topic.id].isComplete, false);
  assert.equal(plan.status, 'needs_evidence');
  assert.equal(plan.overallProgressPct, 0);
});

test('selected Monday and Thursday produce their own dates and day counts', () => {
  const referenceDate = new Date(2026, 10, 3, 10); // Tuesday
  const monday = build([], { referenceDate, targetDay: 'lunes' });
  const thursday = build([], { referenceDate, targetDay: 'jueves' });
  assert.equal(monday.targetCanteDate, '2026-11-09');
  assert.equal(monday.daysRemaining, 6);
  assert.equal(monday.cycleStartDate, '2026-11-05');
  assert.equal(thursday.targetCanteDate, '2026-11-05');
  assert.equal(thursday.daysRemaining, 2);
});

test('duplicate IDs do not duplicate actual minutes or pages and repeated coverage is only credited once', () => {
  const first = observed();
  const repeated = observed({ id: 'synthetic-repeated', date: '2026-11-03' });
  const review = observed({ id: 'synthetic-review-day', type: 'repaso', date: '2026-11-03' });
  const plan = build([first, first, repeated, review]);
  assert.equal(plan.dailyQuotas['2026-11-02'].totalActualMinutesStudied, 30);
  assert.equal(plan.dailyQuotas['2026-11-02'].totalActualPagesCompleted, 3);
  assert.equal(plan.dailyQuotas['2026-11-03'].totalActualPagesCompleted, 0);
  assert.equal(plan.topicGoals[topic.id].completedPages, 3);
});

test('a provided canonical map governs extension and title in every goal', () => {
  const canonical = getCanonicalTopic(topic.id, [topic], { [topic.id]: { pages: 12, customTitle: 'Synthetic display override' } } as any, []);
  const plan = build([], { topicState: new Map([[topic.id, canonical]]), userProgress: { [topic.id]: { pages: 3 } } });
  assert.equal(plan.topicGoals[topic.id].totalPages, 12);
  assert.equal(plan.topicGoals[topic.id].topicTitle, 'Synthetic display override');
});
