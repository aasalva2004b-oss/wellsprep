import test from 'node:test';
import assert from 'node:assert/strict';
import type { Topic, Session } from '../src/types';
import { buildCanonicalTopicMap } from '../src/lib/canonicalTopicService';
import { DEFAULT_PLANNER_SETTINGS, estimateTaskAdaptiveDetails, type PlannerTask } from '../src/lib/plannerEngine';
import { estimatePersonalizedDuration } from '../src/lib/personalizedEstimator';
import { generateCantePlanProposal, type CantePlanningInput } from '../src/lib/cantePlanningEngine';

const topic = (id: string, pages = 6): Topic => ({ id: `civil-${id}`, subjectId: 'civil', number: Number(id), title: `Synthetic ${id}`,
  pages, difficulty: 5, tiempoEstudioHoras: 0, fechaPrimerEstudio: '', fechasRepasos: [], mejorTiempoCantoMinutos: 0, mejorTiempoCantoSegundos: 0, notas: '' });
const catalogue = [topic('901'), topic('902'), topic('903'), topic('904'), topic('999')];
const session = (topicId: string, date: string, patch: Partial<Session> = {}): Session => ({ id: `synthetic-${topicId}-${date}-${patch.type || 'initial'}`,
  topicId, date, type: 'estudio_inicial', durationMinutes: 60, startPage: 1, endPage: 6, pagesCount: 6, totalPagesAtSession: 6, notes: '', ...patch });
const samples: Session[] = [
  session('civil-999', '2026-10-01'),
  session('civil-999', '2026-10-02', { type: 'refresco', durationMinutes: 12 }),
  session('civil-999', '2026-10-03', { type: 'repaso', durationMinutes: 18 }),
  session('civil-999', '2026-10-04', { type: 'canto', durationMinutes: 12, cantoSeconds: 30 }),
];
function input(patch: Partial<CantePlanningInput> = {}, history: Session[] = samples): CantePlanningInput {
  return { canonicalMap: buildCanonicalTopicMap(catalogue, {}, history), sessions: history, existingTasks: [],
    settings: { ...DEFAULT_PLANNER_SETTINGS, targetDailyHours: 12, autoRefreshProtocol: 'three_days' },
    canteGoals: [{ id: 'next-monday', date: '2026-11-16', topicIds: ['civil-901'] }],
    horizonStart: '2026-11-09', horizonEnd: '2026-11-19', asOf: '2026-11-09', ...patch };
}
function task(patch: Partial<PlannerTask> = {}): PlannerTask {
  return { id: 'existing', topicId: 'civil-901', topicNumber: 901, topicTitle: 'Existing', subjectId: 'civil', activityType: 'repaso',
    date: '2026-11-10', status: 'pending', estimatedMinutes: 25, createdAt: '2026-11-01T00:00:00Z', ...patch };
}
const own = (plan: ReturnType<typeof generateCantePlanProposal>, id = 'civil-901') => plan.candidateTasks.filter(task => task.topicId === id);

test('Monday with four different topic states plans actual missing work before the appointment', () => {
  const history = [...samples,
    session('civil-902', '2026-11-08', { endPage: 3, pagesCount: 3, durationMinutes: 30 }),
    session('civil-903', '2026-11-08'),
    session('civil-904', '2026-10-15'),
    ...[16, 17, 18].map(day => session('civil-904', `2026-10-${day}`, { type: 'refresco', durationMinutes: 12 })),
    session('civil-904', '2026-10-20', { type: 'repaso', durationMinutes: 18 }),
  ];
  const plan = generateCantePlanProposal(input({ canteGoals: [{ id: 'four-states', date: '2026-11-16', topicIds: catalogue.slice(0, 4).map(t => t.id) }] }, history));
  assert.equal(plan.viability, 'feasible');
  assert.equal(plan.candidateTasks.filter(t => t.activityType === 'cante').length, 4);
  assert.deepEqual(own(plan).filter(t => t.activityType === 'estudio_nuevo').flatMap(t => t.pagesNumbers!), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(own(plan, 'civil-902').filter(t => t.activityType === 'estudio_nuevo').flatMap(t => t.pagesNumbers!), [4, 5, 6]);
  assert.ok(own(plan, 'civil-903').some(t => t.activityType === 'refresco' && t.proposalBasis === 'actual_completion'));
  assert.ok(own(plan, 'civil-904').some(t => t.activityType === 'repaso'));
  assert.ok(plan.candidateTasks.filter(t => t.activityType !== 'cante').every(t => t.date < '2026-11-16'));
});

test('Thursday partial topic estimates exactly the three remaining pages', () => {
  const history = [...samples, session('civil-901', '2026-11-05', { endPage: 3, pagesCount: 3, durationMinutes: 30 })];
  const request = input({ asOf: '2026-11-06', horizonStart: '2026-11-06', horizonEnd: '2026-11-15', canteGoals: [{ id: 'thursday', date: '2026-11-12', topicIds: ['civil-901'] }] }, history);
  const plan = generateCantePlanProposal(request);
  const study = own(plan).find(t => t.activityType === 'estudio_nuevo')!;
  assert.deepEqual(study.pagesNumbers, [4, 5, 6]);
  const expected = estimatePersonalizedDuration({ topic: request.canonicalMap.get('civil-901')!, activity: 'estudio_nuevo', history,
    topics: request.canonicalMap, asOf: new Date('2026-11-07T00:00:00Z'), work: { pages: 3, pageNumbers: [4, 5, 6] } });
  assert.equal(study.estimatedMinutes, expected.estimatedMinutes);
  assert.deepEqual(study.prediction?.interval, expected.interval);
  assert.equal(plan.viability, 'feasible');
});

test('three refreshes follow actual completion, use whole volume and stable protocol IDs', () => {
  const history = [...samples,
    session('civil-901', '2026-11-01', { endPage: 3, pagesCount: 3, durationMinutes: 30 }),
    session('civil-901', '2026-11-08', { startPage: 4, pagesCount: 3, durationMinutes: 30 }),
  ];
  const plan = generateCantePlanProposal(input({}, history));
  const refreshes = own(plan).filter(t => t.activityType === 'refresco');
  assert.deepEqual(refreshes.map(t => t.date), ['2026-11-09', '2026-11-10', '2026-11-11']);
  assert.ok(refreshes.every(t => t.pagesCount === 6 && t.estimatedMinutes === 12 && t.proposalBasis === 'actual_completion'));
  assert.deepEqual(refreshes.map(t => t.id), [1, 2, 3].map(index => `refresco-civil-901-2026-11-08-${index}`));
});

test('observed full refresh fulfills only its real day; partial refresh cannot fulfill a whole-topic obligation', () => {
  const history = [...samples, session('civil-901', '2026-11-08'),
    session('civil-901', '2026-11-09', { type: 'refresco', endPage: 3, pagesCount: 3, durationMinutes: 6 })];
  const partial = generateCantePlanProposal(input({}, history));
  assert.ok(partial.conflicts.some(c => c.code === 'UNKNOWN_REFRESH_COVERAGE'));
  assert.equal(own(partial).filter(t => t.activityType === 'refresco').length, 3);
  assert.equal(partial.viability, 'unknown');
  const fullHistory = [...history.slice(0, -1), session('civil-901', '2026-11-09', { type: 'refresco', durationMinutes: 12 })];
  const full = generateCantePlanProposal(input({}, fullHistory));
  assert.equal(own(full).filter(t => t.activityType === 'refresco').length, 2);
});

test('proposed initial completion has conditional refresh dependencies, never observed status', () => {
  const plan = generateCantePlanProposal(input());
  const studies = own(plan).filter(t => t.activityType === 'estudio_nuevo');
  const refreshes = own(plan).filter(t => t.activityType === 'refresco');
  assert.equal(refreshes.length, 3);
  assert.ok(refreshes.every(t => t.status === 'pending' && t.proposalBasis === 'proposed_completion'));
  assert.ok(refreshes.every(t => studies.every(s => t.dependencyTaskIds?.includes(s.id))));
  assert.ok(refreshes.every(t => !t.sessionId && !t.actualMinutes && !t.completedAt));
});

test('discontiguous remaining pages are preserved and split without restudying completed pages', () => {
  const history = [...samples, session('civil-901', '2026-11-08', { startPage: undefined, endPage: undefined, pagesNumbers: [2, 4, 6], pagesCount: 3, durationMinutes: 30 })];
  const request = input({ settings: { ...DEFAULT_PLANNER_SETTINGS, targetDailyHours: 1 / 3, autoRefreshProtocol: 'three_days' } }, history);
  const plan = generateCantePlanProposal(request);
  const studyTasks = own(plan).filter(t => t.activityType === 'estudio_nuevo');
  assert.deepEqual(studyTasks.flatMap(t => t.pagesNumbers!).sort((a, b) => a - b), [1, 3, 5]);
  assert.ok(studyTasks.length >= 2);
  assert.ok(studyTasks.every(t => !t.pagesNumbers!.includes(2) && !t.pagesNumbers!.includes(4) && !t.pagesNumbers!.includes(6)));
  for (const task of studyTasks.filter(t => t.pagesNumbers!.length > 1)) assert.equal(task.fromPage, undefined, 'no bounding interval may include studied holes');
});

test('insufficient capacity is explicitly infeasible, retains all required tasks and offers alternatives', () => {
  const request = input({ settings: { ...DEFAULT_PLANNER_SETTINGS, targetDailyHours: 0, autoRefreshProtocol: 'three_days' } });
  const plan = generateCantePlanProposal(request);
  assert.equal(plan.viability, 'infeasible');
  assert.ok(plan.conflicts.some(c => c.code === 'DAY_OVERLOAD'));
  assert.ok(plan.conflicts.some(c => c.code === 'INITIAL_WORK_DOES_NOT_FIT'));
  assert.ok(plan.alternatives.length > 0);
  assert.deepEqual(own(plan).filter(t => t.activityType === 'estudio_nuevo').flatMap(t => t.pagesNumbers!), [1, 2, 3, 4, 5, 6]);
});

test('Sunday start for next Monday cannot fit initial study plus three prior refresh days', () => {
  const plan = generateCantePlanProposal(input({ asOf: '2026-11-15', horizonStart: '2026-11-15' }));
  assert.equal(plan.viability, 'infeasible');
  assert.ok(plan.conflicts.some(c => c.code === 'REFRESH_AFTER_DEADLINE'));
  assert.equal(own(plan).find(t => t.activityType === 'cante')!.date, '2026-11-16');
});

test('unknown durations remain null and cannot certify feasibility', () => {
  const plan = generateCantePlanProposal(input({}, []));
  assert.equal(plan.viability, 'unknown');
  assert.equal(plan.totalMinutes, null);
  assert.ok(plan.unknownDurationTaskCount > 0);
  assert.ok(own(plan).every(t => t.estimatedMinutes === null));
  assert.ok(own(plan).every(t => t.prediction?.paceMinPerPage === null && t.prediction?.details.baseVolumeMinutes === null));
});

test('unknown initial locations cannot be converted into zero remaining work', () => {
  const history = [...samples, session('civil-901', '2026-11-08', { startPage: undefined, endPage: undefined, pagesCount: 3 })];
  const plan = generateCantePlanProposal(input({}, history));
  assert.equal(plan.viability, 'unknown');
  assert.ok(plan.conflicts.some(c => c.code === 'UNKNOWN_COVERAGE'));
  assert.equal(own(plan).filter(t => t.activityType === 'estudio_nuevo').length, 0);
});

test('overdue pending tasks are only moved in the explicit proposal; protected manual tasks stay unchanged', () => {
  const overdue = task({ id: 'overdue', date: '2026-11-07' });
  const manual = task({ id: 'pinned', date: '2026-11-08', pinned: true, planningOrigin: 'manual', confirmed: true });
  const request = input({ existingTasks: [overdue, manual] });
  const before = JSON.stringify(request.existingTasks);
  const plan = generateCantePlanProposal(request);
  assert.equal(JSON.stringify(request.existingTasks), before);
  assert.equal(plan.mergedTasks.find(t => t.id === overdue.id)?.proposedOriginalDate, overdue.date);
  assert.notEqual(plan.mergedTasks.find(t => t.id === overdue.id)?.date, overdue.date);
  assert.deepEqual(plan.mergedTasks.find(t => t.id === manual.id), manual);
  assert.ok(plan.conflicts.some(c => c.code === 'OVERDUE_PROTECTED'));
});

test('multiple commitments preserve each appointment and prepare common topics without duplicate study', () => {
  const plan = generateCantePlanProposal(input({ horizonEnd: '2026-11-22', canteGoals: [
    { id: 'monday', date: '2026-11-16', topicIds: ['civil-901'] },
    { id: 'thursday', date: '2026-11-19', topicIds: ['civil-901', 'civil-902'] },
  ] }));
  assert.equal(plan.candidateTasks.filter(t => t.activityType === 'cante').length, 3);
  assert.deepEqual(own(plan).filter(t => t.activityType === 'cante').map(t => t.date), ['2026-11-16', '2026-11-19']);
  assert.equal(own(plan).filter(t => t.activityType === 'estudio_nuevo').flatMap(t => t.pagesNumbers!).length, 6);
});

test('proposal reloaded as confirmed JSON retains tasks, IDs and appointments without any duplicate session', () => {
  const request = input();
  const beforeSessions = JSON.stringify(request.sessions);
  const first = generateCantePlanProposal(request);
  const saved = JSON.parse(JSON.stringify(first.mergedTasks.map(t => ({ ...t, confirmed: true }))));
  const second = generateCantePlanProposal({ ...request, existingTasks: saved });
  assert.equal(second.mergedTasks.length, saved.length);
  assert.equal(new Set(second.mergedTasks.map(t => t.id)).size, saved.length);
  for (const previous of saved) assert.deepEqual(second.mergedTasks.find(t => t.id === previous.id), previous);
  assert.equal(JSON.stringify(request.sessions), beforeSessions);
});

test('deterministic generation is detached, stable and signature changes when capacity or inputs change', () => {
  const request = input();
  const initialTopics = JSON.stringify([...request.canonicalMap]);
  const first = generateCantePlanProposal(request), second = generateCantePlanProposal(request);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify([...request.canonicalMap]), initialTopics);
  assert.notEqual(generateCantePlanProposal({ ...request, settings: { ...request.settings, targetDailyHours: 2 } }).signature, first.signature);
  first.mergedTasks[0].notes = 'changed outside';
  assert.notEqual(second.mergedTasks[0].notes, first.mergedTasks[0].notes);
});

test('actual work reserves capacity, including sessions without a planner task, and linked work is not counted twice', () => {
  const real = session('civil-999', '2026-11-09', { id: 'today-real', type: 'repaso', durationMinutes: 200 });
  const history = [...samples, real];
  const existing = task({ date: '2026-11-09', estimatedMinutes: 100 });
  const request = input({ canteGoals: [], existingTasks: [existing], settings: { ...DEFAULT_PLANNER_SETTINGS, targetDailyHours: 4 } }, history);
  const plan = generateCantePlanProposal(request), day = plan.days.find(d => d.date === '2026-11-09')!;
  assert.ok(day.capacityUsedMinutes >= 300);
  assert.ok(day.overloadMinutes >= 60);
  assert.equal(plan.viability, 'infeasible');
  const linked = generateCantePlanProposal({ ...request, existingTasks: [task({ topicId: 'civil-999', topicNumber: 999, date: '2026-11-09', status: 'completed', sessionId: real.id, estimatedMinutes: 100 })] });
  const linkedDay = linked.days.find(d => d.date === '2026-11-09')!;
  assert.equal(linkedDay.capacityUsedMinutes, 200);
  assert.equal(linkedDay.actualMinutes, 200);
});

test('date-specific availability overrides weekday hours and refresh exceptions are explicit and retained', () => {
  const plan = generateCantePlanProposal(input({ settings: { ...DEFAULT_PLANNER_SETTINGS, targetDailyHours: 12, dailyAvailabilityOverrides: { '2026-11-10': 0, '2': 2 } },
    refreshExceptions: { 'civil-901|2026-11-10': { date: '2026-11-12', reason: 'Excepción de agenda sintética' } } }));
  assert.equal(plan.days.find(d => d.date === '2026-11-10')?.capacityMinutes, 0);
  assert.ok(own(plan).some(t => t.activityType === 'refresco' && t.date === '2026-11-12' && t.proposedOriginalDate === '2026-11-10'));
  assert.ok(plan.conflicts.some(c => c.code === 'REFRESH_POLICY_EXCEPTION'));
});

test('total estimated minutes equals both the daily and task sums; unknown minutes stay separate', () => {
  const plan = generateCantePlanProposal(input());
  const sum = plan.days.flatMap(d => d.tasks).reduce((total, task) => total + (task.estimatedMinutes ?? 0), 0);
  assert.equal(plan.totalEstimatedMinutes, sum);
  assert.equal(plan.totalEstimatedMinutes, plan.days.reduce((total, day) => total + day.plannedMinutes, 0));
  assert.equal(plan.totalMinutes, sum);
});

test('future initial completion cannot provide preparation or training to the present proposal', () => {
  const history = [...samples, session('civil-901', '2026-11-18')];
  const plan = generateCantePlanProposal(input({}, history));
  assert.equal(own(plan).filter(t => t.activityType === 'estudio_nuevo').flatMap(t => t.pagesNumbers!).length, 6);
  assert.ok(own(plan).filter(t => t.activityType === 'refresco').every(t => t.proposalBasis === 'proposed_completion'));
});

test('invalid calendar or Tuesday cante is rejected without silently moving the appointment', () => {
  assert.equal(generateCantePlanProposal(input({ horizonStart: '2026-02-30' })).viability, 'infeasible');
  const plan = generateCantePlanProposal(input({ canteGoals: [{ id: 'tuesday', date: '2026-11-17', topicIds: ['civil-901'] }] }));
  assert.ok(plan.conflicts.some(c => c.code === 'INVALID_CANTE_DATE'));
  assert.equal(plan.candidateTasks.filter(t => t.activityType === 'cante').length, 0);
});

test('distinct next review ordinals use the phase B model instead of a fixed duration', () => {
  const history = [...samples];
  for (const id of ['civil-901', 'civil-902']) {
    history.push(session(id, '2026-09-01'));
    for (const date of ['2026-09-02', '2026-09-03', '2026-09-04']) history.push(session(id, date, { type: 'refresco', durationMinutes: 12 }));
  }
  for (let index = 0; index < 5; index++) for (const id of ['civil-904', 'civil-999']) {
    history.push(session(id, `2026-10-${10 + index}`, { type: 'repaso', durationMinutes: 60 / (index + 1) }));
  }
  for (let index = 0; index < 4; index++) history.push(session('civil-902', `2026-10-${20 + index}`, { type: 'repaso', durationMinutes: 60 / (index + 1) }));
  const request = input({ canteGoals: [{ id: 'ordinal-comparison', date: '2026-11-16', topicIds: ['civil-901', 'civil-902'] }] }, history);
  const plan = generateCantePlanProposal(request);
  const first = own(plan).find(t => t.activityType === 'repaso')!;
  const fifth = own(plan, 'civil-902').find(t => t.activityType === 'repaso')!;
  assert.ok(first && fifth);
  assert.ok(first.estimatedMinutes! > fifth.estimatedMinutes!, `${first.estimatedMinutes} vs ${fifth.estimatedMinutes}`);
  for (const [id, ordinal, planned] of [['civil-901', 1, first], ['civil-902', 5, fifth]] as const) {
    const expected = estimatePersonalizedDuration({ topic: request.canonicalMap.get(id)!, activity: 'repaso', history, topics: request.canonicalMap,
      asOf: new Date('2026-11-09T23:59:59.999Z'), reviewOrdinal: ordinal });
    assert.equal(planned.estimatedMinutes, expected.estimatedMinutes);
  }
});

test('a second cante receives its own conditional preparation on an intervening day', () => {
  const plan = generateCantePlanProposal(input({ horizonEnd: '2026-11-22', canteGoals: [
    { id: 'monday', date: '2026-11-16', topicIds: ['civil-901'] },
    { id: 'thursday', date: '2026-11-19', topicIds: ['civil-901'] },
  ] }));
  const laterPreparation = own(plan).find(t => t.activityType === 'repaso' && t.commitmentId === 'thursday');
  assert.ok(laterPreparation && laterPreparation.date > '2026-11-16' && laterPreparation.date < '2026-11-19');
  assert.ok(laterPreparation.dependencyTaskIds!.length > 0);
});

test('an explicit prediction instant excludes later same-day coverage and retains input snapshots', () => {
  const history = [...samples, session('civil-901', '2026-11-09', { createdAt: '2026-11-09T20:00:00.000Z' })];
  const plan = generateCantePlanProposal(input({ forecastAt: '2026-11-09T10:00:00.000Z' }, history));
  assert.equal(plan.generatedAt, '2026-11-09T10:00:00.000Z');
  assert.deepEqual(own(plan).filter(t => t.activityType === 'estudio_nuevo').flatMap(t => t.pagesNumbers!), [1, 2, 3, 4, 5, 6]);
  assert.equal(own(plan).find(t => t.activityType === 'estudio_nuevo')?.prediction?.personalizedPrediction.inputs.totalPages, 6);
});

test('a completed task linked to another topic cannot certify work or avoid capacity reservations', () => {
  const history = [...samples, session('civil-999', '2026-11-09', { id: 'foreign', type: 'repaso', durationMinutes: 100 })];
  const plan = generateCantePlanProposal(input({ canteGoals: [], existingTasks: [task({ date: '2026-11-09', status: 'completed', sessionId: 'foreign' })] }, history));
  assert.ok(plan.conflicts.some(c => c.code === 'UNLINKED_COMPLETION'));
  assert.ok(plan.days.find(d => d.date === '2026-11-09')!.capacityUsedMinutes >= 125);
});

test('explicit manual oral duration overrides evidence while the default is not treated as an observation', () => {
  const request = input({ settings: { ...DEFAULT_PLANNER_SETTINGS, targetDailyHours: 12, duracionEstimadaCantePorTemaMinutos: 20 } });
  const manual = own(generateCantePlanProposal(request)).find(t => t.activityType === 'cante')!;
  assert.equal(manual.estimatedMinutes, 20);
  assert.equal(manual.prediction?.method, 'manual_duration');
  assert.equal(manual.prediction?.evidenceCount, 0);
  assert.equal(manual.prediction?.interval, null);
  assert.equal(manual.estimateSource, 'manual');
  const automatic = own(generateCantePlanProposal(input())).find(t => t.activityType === 'cante')!;
  assert.equal(automatic.estimatedMinutes, 12.5);
  assert.notEqual(automatic.estimatedMinutes, DEFAULT_PLANNER_SETTINGS.duracionEstimadaCantePorTemaMinutos);
});

test('a moved pinned refresh with the same protocol ID cannot be silently overwritten', () => {
  const history = [...samples, session('civil-901', '2026-11-08')];
  const pinned = task({ id: 'refresco-civil-901-2026-11-08-1', activityType: 'refresco', refrescoIndex: 1,
    date: '2026-11-12', pinned: true, confirmed: true, pagesCount: 6, volumeSource: 'whole_topic' });
  const plan = generateCantePlanProposal(input({ existingTasks: [pinned] }, history));
  assert.deepEqual(plan.mergedTasks.find(t => t.id === pinned.id), pinned);
  assert.ok(plan.conflicts.some(c => c.code === 'PROTECTED_REQUIREMENT_CONFLICT'));
  assert.equal(plan.viability, 'infeasible');
});

test('a refresh exception before initial completion is rejected and cannot satisfy its dependency', () => {
  const plan = generateCantePlanProposal(input({ refreshExceptions: { 'civil-901|2026-11-10': { date: '2026-11-08', reason: 'Invalid synthetic move' } } }));
  assert.ok(plan.conflicts.some(c => c.code === 'INVALID_REFRESH_EXCEPTION' && c.severity === 'error'));
  assert.equal(own(plan).find(t => t.activityType === 'refresco' && t.refrescoIndex === 1)?.date, '2026-11-10');
});

test('explicit refresh durations take precedence over manual rates and match the shared adapter', () => {
  const settings = { ...DEFAULT_PLANNER_SETTINGS, targetDailyHours: 12, velocidadRefrescoMinPorPagina: 4, refresco1DuracionMinutos: 20, refresco2DuracionMinutos: 15, refresco3DuracionMinutos: 10 };
  const request = input({ settings });
  const plan = generateCantePlanProposal(request);
  const refreshes = own(plan).filter(t => t.activityType === 'refresco');
  assert.deepEqual(refreshes.map(t => t.estimatedMinutes), [20, 15, 10]);
  for (const task of refreshes) {
    assert.equal(task.prediction?.method, 'manual_duration');
    assert.equal(task.prediction?.evidenceCount, 0);
    const shared = estimateTaskAdaptiveDetails(request.canonicalMap.get('civil-901'), 'refresco', [...request.sessions], settings, task.refrescoIndex, {}, undefined, { canonicalMap: new Map(request.canonicalMap) });
    assert.equal(task.estimatedMinutes, shared.estimatedMinutes);
  }
});

test('a positive manual pace cannot create free zero-minute work in a day without capacity', () => {
  const plan = generateCantePlanProposal(input({ settings: { ...DEFAULT_PLANNER_SETTINGS, targetDailyHours: 0, velocidadEstudioNuevoMinPorPagina: 0.01 } }));
  assert.ok(own(plan).filter(t => t.activityType === 'estudio_nuevo').every(t => t.estimatedMinutes! >= 1));
  assert.equal(plan.viability, 'infeasible');
  assert.ok(plan.conflicts.some(c => c.code === 'DAY_OVERLOAD'));
});

test('recorded work without a stable ID still reserves capacity instead of disappearing', () => {
  const anonymous = session('civil-999', '2026-11-09', { id: '', type: 'repaso', durationMinutes: 200 });
  const plan = generateCantePlanProposal(input({ canteGoals: [], settings: { ...DEFAULT_PLANNER_SETTINGS, targetDailyHours: 4 },
    existingTasks: [task({ date: '2026-11-09', estimatedMinutes: 100 })] }, [...samples, anonymous]));
  assert.equal(plan.days.find(day => day.date === '2026-11-09')!.actualMinutes, 200);
  assert.equal(plan.viability, 'infeasible');
});

test('duplicate task IDs stop generation while preserving both original records', () => {
  const first = task({ id: 'duplicate', pinned: true });
  const second = task({ id: 'duplicate', date: '2026-11-12', planningOrigin: 'manual' });
  const plan = generateCantePlanProposal(input({ existingTasks: [first, second] }));
  assert.equal(plan.viability, 'infeasible');
  assert.deepEqual(plan.mergedTasks, [first, second]);
  assert.deepEqual(plan.candidateTasks, []);
  assert.ok(plan.conflicts.some(c => c.code === 'DUPLICATE_TASK_IDS'));
});

test('legacy deterministic session links reserve actual work once without fabricating history', () => {
  const history = [...samples, session('civil-901', '2026-11-09', { id: 'planner-existing', type: 'repaso', durationMinutes: 40 })];
  const plan = generateCantePlanProposal(input({ canteGoals: [], existingTasks: [task({ date: '2026-11-09', status: 'completed', estimatedMinutes: 20 })] }, history));
  assert.equal(plan.days.find(day => day.date === '2026-11-09')!.capacityUsedMinutes, 40);
  assert.ok(!plan.conflicts.some(c => c.code === 'UNLINKED_COMPLETION'));
});

test('a future pinned study fragment does not prevent earlier work on the other remaining pages', () => {
  const pinned = task({ id: 'future-initial', activityType: 'estudio_nuevo', date: '2026-11-12', pinned: true,
    pagesNumbers: [4, 5, 6], pagesCount: 3, fromPage: 4, toPage: 6, volumeSource: 'explicit_range', estimatedMinutes: 30 });
  const plan = generateCantePlanProposal(input({ existingTasks: [pinned] }));
  assert.deepEqual(plan.mergedTasks.find(t => t.id === pinned.id), pinned);
  assert.equal(plan.viability, 'feasible');
  assert.deepEqual(own(plan).filter(t => t.activityType === 'estudio_nuevo').flatMap(t => t.pagesNumbers!), [1, 2, 3]);
  assert.ok(own(plan).filter(t => t.activityType === 'estudio_nuevo').every(t => !t.dependencyTaskIds?.includes(pinned.id)));
  assert.deepEqual(own(plan).filter(t => t.activityType === 'refresco').map(t => t.date), ['2026-11-13', '2026-11-14', '2026-11-15']);
});
