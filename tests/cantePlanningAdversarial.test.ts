import test from 'node:test';
import assert from 'node:assert/strict';
import type { Session, Topic } from '../src/types';
import { buildCanonicalTopicMap } from '../src/lib/canonicalTopicService';
import { DEFAULT_PLANNER_SETTINGS, type PlannerTask } from '../src/lib/plannerEngine';
import { generateCantePlanProposal, type CantePlanningInput } from '../src/lib/cantePlanningEngine';

// Independent boundary checks. Every record is synthetic; this file imports no SDK.
const topics: Topic[] = [901, 999].map(number => ({
  id: `civil-${number}`, number, subjectId: 'civil', title: `Synthetic adversarial ${number}`,
  pages: 6, difficulty: 5, tiempoEstudioHoras: 0, fechaPrimerEstudio: '', fechasRepasos: [],
  mejorTiempoCantoMinutos: 0, mejorTiempoCantoSegundos: 0, notas: '',
}));
const observed = (id: string, type: Session['type'], patch: Partial<Session> & Record<string, unknown> = {}): Session => ({
  id, topicId: topics[1].id, date: '2026-11-01', type, durationMinutes: 30,
  startPage: 1, endPage: 6, pagesCount: 6, totalPagesAtSession: 6, notes: '', ...patch,
});
const training: Session[] = [
  observed('synthetic-training-study', 'estudio_inicial'),
  observed('synthetic-training-refresh', 'refresco', { date: '2026-11-02', durationMinutes: 12 }),
  observed('synthetic-training-review', 'repaso', { date: '2026-11-03', durationMinutes: 18 }),
  observed('synthetic-training-oral', 'canto', { date: '2026-11-04', durationMinutes: 12, cantoSeconds: 30 }),
];
function request(history = training, patch: Partial<CantePlanningInput> = {}): CantePlanningInput {
  return { canonicalMap: buildCanonicalTopicMap(topics, {}, history), sessions: history, existingTasks: [],
    settings: { ...DEFAULT_PLANNER_SETTINGS, targetDailyHours: 12, autoRefreshProtocol: 'three_days' },
    canteGoals: [{ id: 'synthetic-next-monday', date: '2026-11-16', topicIds: [topics[0].id] }],
    horizonStart: '2026-11-09', horizonEnd: '2026-11-19', asOf: '2026-11-09', ...patch };
}
const manual = (patch: Partial<PlannerTask> = {}): PlannerTask => ({
  id: 'synthetic-protected-manual', topicId: topics[0].id, topicNumber: 901, topicTitle: 'Synthetic protected task',
  subjectId: 'civil', activityType: 'repaso', date: '2026-11-08', status: 'pending', estimatedMinutes: 30,
  createdAt: '2026-11-01T00:00:00Z', planningOrigin: 'manual', confirmed: true, pinned: true,
  estimateSource: 'manual', manualEstimatedMinutes: 30, ...patch,
});

test('an unattended protected overdue task cannot be certified feasible just because it is outside displayed days', () => {
  const task = manual();
  const plan = generateCantePlanProposal(request([], { existingTasks: [task], canteGoals: [] }));
  assert.deepEqual(plan.mergedTasks.find(candidate => candidate.id === task.id), task);
  assert.equal(plan.candidateTasks.some(candidate => candidate.id === task.id), false);
  assert.ok(plan.conflicts.some(conflict => conflict.code === 'OVERDUE_PROTECTED'));
  assert.notEqual(plan.viability, 'feasible');
});

test('future same-day Firestore timestamps do not establish completed coverage at an earlier exact forecast', () => {
  const future = observed('synthetic-future-timestamp', 'estudio_inicial', {
    topicId: topics[0].id, date: '2026-11-09',
    createdAt: { seconds: Date.parse('2026-11-09T18:00:00Z') / 1000, nanoseconds: 0 } as any,
  });
  const input = request([...training, future], { forecastAt: '2026-11-09T10:00:00Z' });
  const before = JSON.stringify(input.sessions);
  const plan = generateCantePlanProposal(input);
  const studies = plan.candidateTasks.filter(task => task.topicId === topics[0].id && task.activityType === 'estudio_nuevo');
  assert.deepEqual(studies.flatMap(task => task.pagesNumbers || []), [1, 2, 3, 4, 5, 6]);
  assert.equal(plan.days.find(day => day.date === '2026-11-09')?.actualMinutes, 0);
  assert.equal(JSON.stringify(input.sessions), before);
});

test('a future startedAt cannot be made available by an earlier createdAt on the same recorded day', () => {
  const future = observed('synthetic-future-start', 'estudio_inicial', {
    topicId: topics[0].id, date: '2026-11-09',
    createdAt: '2026-11-09T08:00:00Z', startedAt: '2026-11-09T18:00:00Z',
  });
  const plan = generateCantePlanProposal(request([...training, future], { forecastAt: '2026-11-09T10:00:00Z' }));
  assert.deepEqual(plan.candidateTasks.filter(task => task.topicId === topics[0].id && task.activityType === 'estudio_nuevo')
    .flatMap(task => task.pagesNumbers || []), [1, 2, 3, 4, 5, 6]);
});

test('positive sub-minute measurements cannot make a plan fit zero available minutes', () => {
  const history: Session[] = training.map(session => ({ ...session, durationMinutes: .1, cantoSeconds: 0 }));
  history.push(observed('synthetic-fast-partial', 'estudio_inicial', {
    topicId: topics[0].id, date: '2026-11-08', durationMinutes: .1, endPage: 3, pagesCount: 3,
  }));
  const plan = generateCantePlanProposal(request(history, {
    settings: { ...DEFAULT_PLANNER_SETTINGS, targetDailyHours: 0, autoRefreshProtocol: 'three_days' },
  }));
  assert.equal(plan.viability, 'infeasible');
  assert.ok(plan.conflicts.some(conflict => conflict.code === 'DAY_OVERLOAD' || conflict.code === 'INITIAL_WORK_DOES_NOT_FIT'));
});

test('today actual minutes replace a linked pending reservation and stable duplicate deliveries count once', () => {
  const task = manual({ date: '2026-11-09', sessionId: 'synthetic-linked-real-session' });
  const session = observed('synthetic-linked-real-session', 'repaso', {
    topicId: topics[0].id, date: '2026-11-09', durationMinutes: 30, plannerTaskId: task.id,
  });
  const plan = generateCantePlanProposal(request([session, { ...session }], {
    existingTasks: [task], canteGoals: [], settings: { ...DEFAULT_PLANNER_SETTINGS, targetDailyHours: .5 },
  }));
  const day = plan.days.find(day => day.date === task.date)!;
  assert.equal(day.actualMinutes, 30);
  assert.equal(day.capacityUsedMinutes, 30);
  assert.equal(day.overloadMinutes, 0);
});

test('legacy deterministic session IDs replace a reservation even without copied link fields', () => {
  const task = manual({ date: '2026-11-09' });
  const session = observed(`planner-${encodeURIComponent(task.id)}`, 'repaso', {
    topicId: topics[0].id, date: '2026-11-09', durationMinutes: 30,
  });
  const plan = generateCantePlanProposal(request([session], { existingTasks: [task], canteGoals: [] }));
  assert.equal(plan.days.find(day => day.date === task.date)!.capacityUsedMinutes, 30);
});

test('conflicting duplicate task IDs retain both originals and block confirmation of a lossy projection', () => {
  const first = manual({ date: '2026-11-10' });
  const second = manual({ date: '2026-11-11', manualEstimatedMinutes: 47, estimatedMinutes: 47 });
  const plan = generateCantePlanProposal(request([], { existingTasks: [first, second], canteGoals: [] }));
  assert.equal(plan.viability, 'infeasible');
  assert.deepEqual(plan.mergedTasks, [first, second]);
  assert.deepEqual(plan.candidateTasks, []);
  assert.ok(plan.conflicts.some(conflict => conflict.code === 'DUPLICATE_TASK_IDS'));
});

test('an invalid date on a protected pending task cannot disappear outside the displayed calendar', () => {
  const task = manual({ date: '2026-02-30' });
  const plan = generateCantePlanProposal(request([], { existingTasks: [task], canteGoals: [] }));
  assert.deepEqual(plan.mergedTasks.find(candidate => candidate.id === task.id), task);
  assert.notEqual(plan.viability, 'feasible');
  assert.ok(plan.conflicts.some(conflict => conflict.taskIds.includes(task.id)));
});

test('reordered equivalent histories preserve candidate task identities and page/dependency requirements', () => {
  const input = request([...training, observed('synthetic-known-three', 'estudio_inicial', {
    topicId: topics[0].id, date: '2026-11-08', durationMinutes: 15, endPage: 3, pagesCount: 3,
  })]);
  const before = JSON.stringify(input.sessions);
  const first = generateCantePlanProposal(input);
  const reordered = generateCantePlanProposal({ ...input, sessions: [...input.sessions].reverse() });
  const project = (plan: ReturnType<typeof generateCantePlanProposal>) => plan.candidateTasks.map(task => ({
    id: task.id, date: task.date, activity: task.activityType, pages: task.pagesNumbers,
    dependencies: task.dependencyTaskIds,
  }));
  assert.deepEqual(project(reordered), project(first));
  const studies = first.candidateTasks.filter(task => task.topicId === topics[0].id && task.activityType === 'estudio_nuevo');
  assert.deepEqual(studies.flatMap(task => task.pagesNumbers || []), [4, 5, 6]);
  const refreshes = first.candidateTasks.filter(task => task.topicId === topics[0].id && task.activityType === 'refresco');
  assert.equal(refreshes.length, 3);
  assert.ok(refreshes.every(task => studies.every(study => task.dependencyTaskIds?.includes(study.id))));
  assert.equal(JSON.stringify(input.sessions), before);
});
