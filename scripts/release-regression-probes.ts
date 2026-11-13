// Original release audit assertions, also executed by tests/releaseRegression.test.ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { Session, Topic } from '../src/types';
import { buildCanonicalTopicMap } from '../src/lib/canonicalTopicService';
import { estimateRetention } from '../src/lib/retentionModel';
import { generateAutoRefrescos, reconcilePlannerTasks, DEFAULT_PLANNER_SETTINGS, type PlannerTask } from '../src/lib/plannerEngine';

// Independent invented observations. No SDK imports, private file, network or writes.
const topic: Topic = { id: 'civil-990', subjectId: 'civil', number: 990, title: '[FICTICIO] Audit probe', pages: 6, difficulty: 5,
 tiempoEstudioHoras: 0, fechaPrimerEstudio: '', fechasRepasos: [], mejorTiempoCantoMinutos: 0, mejorTiempoCantoSegundos: 0, notas: '' };
const task: PlannerTask = { id: 'synthetic-audit-task', topicId: topic.id, topicNumber: topic.number, topicTitle: topic.title,
 subjectId: topic.subjectId, activityType: 'estudio_nuevo', date: '2026-10-03', status: 'completed',
 estimatedMinutes: 30, fromPage: 4, toPage: 6, pagesCount: 3, createdAt: '2026-10-01' };
const first: Session = { id: 'synthetic-audit-first', topicId: topic.id, date: '2026-10-01', type: 'estudio_inicial', durationMinutes: 30,
 startPage: 1, endPage: 3, pagesCount: 3, notes: '' };
const last: Session = { id: 'synthetic-audit-last', topicId: topic.id, date: task.date, type: 'estudio_inicial', durationMinutes: 30,
 startPage: 4, endPage: 6, pagesCount: 3, plannerTaskId: task.id, notes: '' } as Session;
const adaptive = (sessions: Session[], completedTask = task) => generateAutoRefrescos(completedTask, topic, [],
 {...DEFAULT_PLANNER_SETTINGS,autoRefreshProtocol:'adaptive'}, {}, sessions,
 {allTopics:[topic],canonicalMap:buildCanonicalTopicMap([topic],{},sessions)});

test('after full six-page completion the automatic adaptive refresh must not inherit the final three-page block', () => {
 const history = [first,last];
 const state = buildCanonicalTopicMap([topic],{},history).get(topic.id)!;
 assert.equal(state.initialStudyCoverage.remainingPages,0);
 const result = adaptive(history);
 assert.equal(result.length,1);
 assert.equal(result[0].pagesCount,6,'a whole-topic completion refresh must use the same six-page extent as cantePlanningEngine');
 assert.equal(result[0].fromPage,undefined);
 assert.equal(result[0].toPage,undefined);
});

test('completion protocol consistency: a completed partial task is not a completed theme', () => {
 const history = [{...first,plannerTaskId:task.id} as Session];
 const state = buildCanonicalTopicMap([topic],{},history).get(topic.id)!;
 assert.equal(state.initialStudyCoverage.remainingPages,3);
 // This is specifically the D completion protocol. A separate, explicitly
 // labelled C studied-portion memory recommendation could be a valid feature.
 const result = adaptive(history,{...task,date:first.date,fromPage:1,toPage:3});
 assert.equal(result.length,0,'the completion protocol must await whole initial coverage, as the deadline engine does');
});

test('a future-only study cannot be complete in canonical views but absent from the retention history', () => {
 const future = {...first,id:'synthetic-audit-future',date:'2099-01-01',startPage:1,endPage:6,pagesCount:6};
 const map = buildCanonicalTopicMap([topic],{},[future]);
 const state = map.get(topic.id)!;
 const memory = estimateRetention({topic:state,history:[future],topics:map,asOf:new Date('2026-11-13T00:00:00Z')});
 assert.equal(memory.lastContactDate,null);
 assert.equal(memory.probability,null);
 assert.equal(state.initialStudyCoverage.remainingPages,6,'the same future-only record must not consume initial pages today');
 assert.equal(state.lastContactDate,undefined);
});

test('editing a linked session into another topic or activity must invalidate the original task link', () => {
 const other = {...topic,id:'civil-991',number:991};
 const moved: Session = {id:`planner-${encodeURIComponent(task.id)}`,plannerTaskId:task.id,topicId:other.id,type:'canto',date:task.date,durationMinutes:12,cantoSeconds:30,notes:''} as Session;
 const projected = reconcilePlannerTasks([{...task,sessionId:moved.id}],[moved],DEFAULT_PLANNER_SETTINGS,{},[topic,other])[0];
 assert.notEqual(projected.sessionLinkStatus,'linked','an ID alone cannot prove topic/activity compatibility');
 assert.notEqual(projected.status,'completed');
 assert.equal(projected.actualMinutes,undefined);
});

test('retention recalculation after midnight must retain the configured policy', async () => {
 const { buildTopicData } = await import('../src/lib/topicData');
 const { calculateCanonicalRetention } = await import('../src/lib/ebbinghaus');
 const policy = { initialStabilityDays: 14, initialRecallProbability: .75, reviewThreshold: .65 };
 const state = buildTopicData([topic], {}, [{...first,startPage:1,endPage:6,pagesCount:6}], policy).topicState.get(topic.id)!;
 const before = {...state.retentionEstimate!.policy};
 const prior = new Date(); prior.setUTCDate(prior.getUTCDate()-1);
 // Advance only the fixture cache age: this simulates retaining a canonical
 // object across midnight. No global clock, source file or stored data changes.
 state.retentionEstimate = {...state.retentionEstimate!,generatedAt:prior.toISOString()};
 const after = calculateCanonicalRetention(state).adaptive!.policy;
 assert.deepEqual(after,before,'cache expiry must not replace user policy with default priors');
});
