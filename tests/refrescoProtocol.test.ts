import test from 'node:test';
import assert from 'node:assert/strict';
import type { Session, Topic } from '../src/types';
import { getInitialStudyCompletionDate } from '../src/lib/topicCoverage';
import { buildCanonicalTopicMap } from '../src/lib/canonicalTopicService';
import { DEFAULT_PLANNER_SETTINGS, generateAutoRefrescos, type PlannerTask } from '../src/lib/plannerEngine';

const topic = { id: 'synthetic-civil-901', subjectId: 'civil', number: 901, title: 'Ficticio protocolo', pages: 6, difficulty: 5 } as Topic;
const initial = (id: string, date: string, from: number, to: number): Session => ({ id, topicId: topic.id, date, type: 'primer_estudio', durationMinutes: 30, startPage: from, endPage: to, notes: '' });
const task: PlannerTask = { id: 'synthetic-last-block', topicId: topic.id, topicNumber: 901, subjectId: 'civil', topicTitle: topic.title,
  activityType: 'estudio_nuevo', date: '2026-10-20', status: 'completed', estimatedMinutes: 30, pagesCount: 3, fromPage: 4, toPage: 6, createdAt: '2026-10-01' };
const history = [initial('first', '2026-10-01', 1, 3), initial('last', '2026-10-03', 4, 6)];
const generate = (sessions: Session[], existing: PlannerTask[] = [], settings = DEFAULT_PLANNER_SETTINGS) => generateAutoRefrescos(task, topic, existing, settings, {}, sessions, { allTopics: [topic], canonicalMap: buildCanonicalTopicMap([topic], {}, sessions) });

test('completion is the actual full-coverage day, not the first session or the planned finish', () => {
  assert.equal(getInitialStudyCompletionDate(6, history), '2026-10-03');
  assert.equal(getInitialStudyCompletionDate(6, [history[0]]), null);
  const result = generate(history);
  assert.deepEqual(result.map(row => row.date), ['2026-10-04', '2026-10-05', '2026-10-06']);
  assert.ok(result.every(row => row.requirement === 'mandatory' && row.proposalBasis === 'actual_completion'));
});
test('all three refreshes cover the finished topic, not only the final three-page block', () => {
  const result = generate(history);
  assert.equal(result.length, 3);
  assert.ok(result.every(row => row.pagesCount === 6 && row.fromPage === undefined && row.toPage === undefined));
  assert.ok(result.every(row => row.estimatedMinutes === null), 'no refresh evidence must remain unknown, not a fixed default');
});
test('partial initial work, anonymous counts and a whole-topic review cannot create a completion date', () => {
  assert.equal(generate([history[0]]).length, 0);
  assert.equal(getInitialStudyCompletionDate(6, [{ ...history[0], startPage: undefined, endPage: undefined, pagesCount: 6 }]), null);
  assert.equal(getInitialStudyCompletionDate(6, [history[0], { ...history[1], type: 'repaso' }]), null);
});
test('generation is idempotent across source tasks and retains already scheduled obligations', () => {
  const result = generate(history);
  assert.equal(generate(history, result).length, 0);
  const oneAlready = [{ ...result[1], id: 'synthetic-manual-refresh', sourceStudyTaskId: undefined }];
  const remaining = generate(history, oneAlready);
  assert.deepEqual(remaining.map(row => row.refrescoIndex), [1, 3]);
  assert.equal(oneAlready[0].id, 'synthetic-manual-refresh');
});
test('protocol exceptions can disable generation without changing history', () => {
  const before = JSON.stringify(history);
  assert.equal(generate(history, [], { ...DEFAULT_PLANNER_SETTINGS, autoRefreshProtocol: 'off' }).length, 0);
  assert.equal(JSON.stringify(history), before);
});
test('invalid dates and changed master extent never invent historical completion', () => {
  assert.equal(getInitialStudyCompletionDate(8, history), null);
  assert.equal(getInitialStudyCompletionDate(6, [{ ...history[0], date: '2026-99-99' }]), null);
  assert.equal(getInitialStudyCompletionDate(0, history), null);
});
