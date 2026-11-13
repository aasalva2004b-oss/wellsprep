import assert from 'node:assert/strict';
import test from 'node:test';
import { getUpcomingCanteAssignments, getCanteProposalDrafts } from '../src/lib/canteCommitments';
import type { PlannerTask } from '../src/lib/plannerEngine';
const task = (date: string, topicId = 'synthetic-one'): PlannerTask => ({
  id: `synthetic-${date}-${topicId}`, date, topicId, topicNumber: 1, topicTitle: 'Tema ficticio', subjectId: 'synthetic',
  activityType: 'cante', status: 'pending', estimatedMinutes: null, createdAt: '2026-11-01T00:00:00.000Z',
});
const recurring = { lunes: ['synthetic-recurring-monday'], jueves: ['synthetic-recurring-thursday'] };
test('current dated commitments win over recurring preferences and other weeks', () => {
  const result = getUpcomingCanteAssignments({ tasks: [task('2026-11-09'), task('2026-11-12', 'synthetic-thursday'), task('2026-11-16', 'synthetic-later')] }, recurring, '2026-11-08');
  assert.deepEqual(result.lunes.topicIds, ['synthetic-one']);
  assert.equal(result.lunes.date, '2026-11-09');
  assert.deepEqual(result.jueves.topicIds, ['synthetic-thursday']);
  assert.equal(result.jueves.date, '2026-11-12');
  assert.deepEqual(result.lunes.prefillTopicIds, []);
});
test('recurring preferences only prefill proposals and never appear as confirmed topics', () => {
  const result = getUpcomingCanteAssignments({ tasks: [] }, recurring, '2026-11-08');
  assert.deepEqual(result.lunes.topicIds, []);
  assert.deepEqual(result.lunes.prefillTopicIds, recurring.lunes);
  assert.equal(result.lunes.hasExplicitAssignment, false);
});
test('an explicit empty assignment blocks recurring fallback', () => {
  const result = getUpcomingCanteAssignments({ tasks: [], cantePlanning: { canteGoals: [{ date: '2026-11-09', topicIds: [] }] } }, recurring, '2026-11-08');
  assert.equal(result.lunes.source, 'explicit_empty');
  assert.equal(result.lunes.hasExplicitAssignment, true);
  assert.deepEqual(result.lunes.prefillTopicIds, []);
});
test('old proposal inputs cannot resurrect a task that was moved or deleted', () => {
  const state = { tasks: [task('2026-11-16')], cantePlanning: { canteGoals: [{ date: '2026-11-09', topicIds: ['synthetic-one'] }] } };
  const result = getUpcomingCanteAssignments(state, recurring, '2026-11-08');
  assert.deepEqual(result.lunes.topicIds, []);
  assert.equal(result.lunes.source, 'unassigned');
  assert.deepEqual(getUpcomingCanteAssignments(state, recurring, '2026-11-10').lunes.topicIds, ['synthetic-one']);
});
test('same-day cantes keep their civil date and duplicate task deliveries do not duplicate topics', () => {
  const row = task('2026-11-09');
  const result = getUpcomingCanteAssignments({ tasks: [row, { ...row }] }, recurring, new Date('2026-11-09T22:00:00.000Z'));
  assert.equal(result.lunes.date, '2026-11-09');
  assert.deepEqual(result.lunes.topicIds, ['synthetic-one']);
});

test('an invalid explicit query date is rejected without an implicit clock fallback', () => {
  assert.throws(() => getUpcomingCanteAssignments({}, recurring, 'invalid'));
  assert.throws(() => getUpcomingCanteAssignments({}, recurring, '2026-02-30'));
});

test('a commitment moved from the default Monday cannot lock the old date draft', () => {
  const moved = { ...task('2026-11-16'), commitmentId: 'draft-cante-default-2026-11-09' };
  const result = getCanteProposalDrafts([moved], recurring, '2026-11-08');
  assert.equal(new Set(result.goals.map(goal => goal.id)).size, result.goals.length);
  const oldMonday = result.goals.find(goal => goal.date === '2026-11-09')!;
  const confirmedMonday = result.goals.find(goal => goal.date === '2026-11-16')!;
  assert.equal(result.lockedIds.includes(oldMonday.id), false);
  assert.equal(result.lockedIds.includes(confirmedMonday.id), true);
  assert.deepEqual(confirmedMonday.topicIds, ['synthetic-one']);
});
test('two dated commitments sharing a historical ID still receive separate locked UI rows', () => {
  const rows = [task('2026-11-09'), task('2026-11-16', 'synthetic-two')].map(row => ({ ...row, commitmentId: 'synthetic-old-shared-id' }));
  const result = getCanteProposalDrafts(rows, recurring, '2026-11-08');
  assert.equal(new Set(result.lockedIds).size, 2);
  assert.equal(new Set(result.goals.map(goal => goal.id)).size, result.goals.length);
});
