import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCanonicalTopicMap, getCanonicalTopic } from '../src/lib/canonicalTopicService';
import { buildLearnerProfile, estimateAdaptiveDuration } from '../src/lib/adaptiveLearningEngine';
import { buildWeekPlan, DEFAULT_PLANNER_SETTINGS, generateAutoRefrescos } from '../src/lib/plannerEngine';
import type { PlannerTask } from '../src/lib/plannerEngine';
import { getCantoDuration, getLatestCantoForTopic } from '../src/lib/cantoUtils';
import {
  syntheticPhases,
  syntheticProgress,
  syntheticScenario,
  syntheticSessions,
  syntheticTopics,
  syntheticUser,
  otherSyntheticUser,
} from './fixtures/syntheticStudyData';

const closeTo = (actual: number, expected: number, label: string) => {
  assert.ok(Math.abs(actual - expected) < 1e-8, `${label}: expected ${expected}, got ${actual}`);
};

test('fixtures contain only independent synthetic accounts and serialisable finite data', () => {
  assert.notEqual(syntheticUser.uid, otherSyntheticUser.uid);
  assert.notEqual(syntheticUser.email, otherSyntheticUser.email);
  assert.match(syntheticUser.email, /@example\.test$/);
  assert.match(otherSyntheticUser.email, /@example\.test$/);
  assert.deepEqual(JSON.parse(JSON.stringify(syntheticScenario)), syntheticScenario);
  const check = (value: unknown) => {
    assert.notEqual(value, undefined);
    if (typeof value === 'number') assert.ok(Number.isFinite(value));
    if (Array.isArray(value)) value.forEach(check);
    else if (value && typeof value === 'object') Object.values(value).forEach(check);
  };
  check(syntheticScenario);
  assert.equal(new Set(syntheticSessions.map(item => item.id)).size, syntheticSessions.length);
  for (const item of syntheticSessions) {
    assert.equal(item.userId, syntheticUser.uid);
    assert.match(item.id, /^synthetic-/);
    assert.ok(syntheticTopics.some(topic => topic.id === item.topicId));
  }
});

test('first-study coverage distinguishes six of twelve pages from an entire eight-page topic', () => {
  const [partial, full] = syntheticTopics;
  assert.equal(partial.pages, 12);
  assert.equal(full.pages, 8);
  assert.deepEqual(syntheticProgress[partial.id].completedPages, [1, 2, 3, 4, 5, 6]);
  assert.equal(syntheticProgress[partial.id].coveragePct, 50);
  assert.equal(syntheticProgress[full.id].coveragePct, 100);
  for (const topic of syntheticTopics) {
    const studied = new Set(syntheticSessions.filter(item => item.topicId === topic.id && item.type === 'primer_estudio').flatMap(item => item.pagesNumbers));
    assert.equal(syntheticProgress[topic.id].totalPagesStudied, studied.size);
    assert.equal(syntheticProgress[topic.id].lastPageStudied, Math.max(...studied));
    for (const page of studied) assert.ok(page >= 1 && page <= topic.pages);
  }
});

test('PLSEMA and page telemetry preserve session minutes, seconds and phase totals', () => {
  for (const item of syntheticSessions) {
    const phases = item.plsema;
    closeTo(syntheticPhases.reduce((sum, phase) => sum + phases.minutes[phase], 0), item.durationMinutes, `${item.id} phase minutes`);
    closeTo(phases.totalSeconds, item.durationMinutes * 60, `${item.id} seconds`);
    closeTo(phases.activeRecallMinutes + phases.passiveMinutes + phases.schematicMinutes, item.durationMinutes, `${item.id} phase groups`);
    closeTo(item.pageBreakdown.reduce((sum, page) => sum + page.effectiveMinutes, 0), item.durationMinutes, `${item.id} page minutes`);
    for (const phase of syntheticPhases) {
      closeTo(phases.seconds[phase], phases.minutes[phase] * 60, `${item.id} ${phase} seconds`);
      closeTo(phases.hours[phase], phases.minutes[phase] / 60, `${item.id} ${phase} hours`);
      closeTo(item.pageBreakdown.reduce((sum, page) => sum + page.plsema.minutes[phase], 0), phases.minutes[phase], `${item.id} ${phase} page aggregation`);
    }
    closeTo(syntheticPhases.reduce((sum, phase) => sum + phases.percentages[phase], 0), 100, `${item.id} phase percentages`);
    assert.deepEqual(item.pageBreakdown.map(page => page.pageNumber), item.pagesNumbers);
    assert.equal(item.pagesStudied, item.endPage - item.startPage + 1);
  }
});

test('fixtures exercise study, three descending refreshes, partial/full reviews and oral feedback', () => {
  assert.ok(syntheticSessions.some(item => item.type === 'primer_estudio' && !item.isTopicCompleted));
  const completeTopic = syntheticTopics[1];
  const refreshes = syntheticSessions.filter(item => item.topicId === completeTopic.id && item.type === 'refresco');
  assert.deepEqual(refreshes.map(item => item.date), ['2026-10-02', '2026-10-03', '2026-10-04']);
  assert.ok(refreshes[0].durationMinutes > refreshes[1].durationMinutes);
  assert.ok(refreshes[1].durationMinutes > refreshes[2].durationMinutes);
  assert.ok(syntheticSessions.some(item => item.type === 'repaso' && item.completesVuelta && item.isTopicCompleted));
  assert.ok(syntheticSessions.some(item => item.type === 'repaso' && !item.isTopicCompleted && !item.completesVuelta));
  const solo = syntheticSessions.find(item => item.cantoType === 'solo')!;
  const evaluated = syntheticSessions.find(item => item.cantoType === 'preparador')!;
  assert.equal(solo.cantoGrade, undefined, 'solo practice does not invent a preparer grade');
  assert.equal(evaluated.cantoGrade, 7.5);
  assert.equal(getCantoDuration(solo).totalSecs, 750);
  assert.equal(getCantoDuration(evaluated).totalSecs, 705);
  const latest = getLatestCantoForTopic(syntheticSessions, completeTopic, syntheticProgress[completeTopic.id]);
  assert.equal(latest.grade, 7.5);
  assert.equal(latest.date, '2026-10-12');
});

test('canonical metadata respects explicit user edits and attaches topic history', () => {
  const [topic] = syntheticTopics;
  const overrides = { ...syntheticProgress, [topic.id]: { ...syntheticProgress[topic.id], pages: 14, numeroPalabras: 4200, difficulty: 8 } };
  const canonical = getCanonicalTopic(topic.id, syntheticTopics, overrides, syntheticSessions);
  assert.equal(canonical.pages, 14);
  assert.equal(canonical.numeroPalabras, 4200);
  assert.equal(canonical.difficulty, 8);
  assert.equal(canonical.hasExplicitPages, true);
  closeTo(canonical.totalStudyMinutes, syntheticSessions.filter(item => item.topicId === topic.id).reduce((sum, item) => sum + item.durationMinutes, 0), 'canonical recorded minutes');
  const map = buildCanonicalTopicMap(syntheticTopics, syntheticProgress, syntheticSessions);
  assert.equal(map.size, 2);
  assert.equal(map.get(syntheticTopics[1].id)!.lastCantoGrade, 7.5);
});

test('explicit partial estimates use only requested pending pages and do not invent a cold-start pace', () => {
  const noHistory = getCanonicalTopic(syntheticTopics[0].id, syntheticTopics, {}, []);
  const emptyProfile = buildLearnerProfile([], new Map([[noHistory.id, noHistory]]));
  const unknown = estimateAdaptiveDuration(noHistory, 'estudio_nuevo', emptyProfile, undefined, { fromPage: 7, toPage: 9 });
  assert.equal(unknown.estimatedMinutes, null);
  assert.equal(unknown.available, false);
  assert.equal(unknown.evidenceCount, 0);

  const topic = getCanonicalTopic(syntheticTopics[0].id, syntheticTopics, syntheticProgress, syntheticSessions);
  const profile = buildLearnerProfile(syntheticSessions, buildCanonicalTopicMap(syntheticTopics, syntheticProgress, syntheticSessions));
  const whole = estimateAdaptiveDuration(topic, 'estudio_nuevo', profile);
  const partial = estimateAdaptiveDuration(topic, 'estudio_nuevo', profile, undefined, { fromPage: 7, toPage: 9 });
  assert.equal(whole.pagesUsed, 6, 'six observed initial pages leave six pending pages');
  assert.equal(partial.pagesUsed, 3);
  assert.equal(partial.totalPages, 12);
  assert.equal(partial.fromPage, 7);
  assert.equal(partial.toPage, 9);
  assert.equal(partial.isPartialStudy, true);
  assert.equal(partial.available, true);
  assert.ok(partial.evidenceCount > 0);
  assert.ok(partial.estimatedMinutes! > 0);
  closeTo(partial.estimatedMinutes! / whole.estimatedMinutes!, 0.5, 'three pending pages use half the six-page workload');
});

test('profile aggregates actual PLSEMA and excludes nonpositive or implausibly long sessions', () => {
  const map = buildCanonicalTopicMap(syntheticTopics, syntheticProgress, syntheticSessions);
  const invalid = [
    { ...syntheticSessions[0], id: 'synthetic-zero', durationMinutes: 0 },
    { ...syntheticSessions[0], id: 'synthetic-too-long', durationMinutes: 1441 },
  ];
  const profile = buildLearnerProfile([...syntheticSessions, ...invalid], map);
  assert.equal(profile.totalRecordedSessionsCount, syntheticSessions.length);
  assert.equal(profile.hasSufficientData, true);
  const total = syntheticSessions.reduce((sum, item) => sum + item.durationMinutes, 0);
  const active = syntheticSessions.reduce((sum, item) => sum + item.plsema.activeRecallMinutes, 0);
  closeTo(profile.plsemaProfile!.activeRecallRatio, active / total * 100, 'unrounded observed active-recall share');
  assert.ok(profile.studyPaceMinPerPage > 0);
  assert.ok(profile.reviewPaceMinPerPage > 0);
  // This verifies aggregation only, not the audited partial-session pace or accuracy bugs.
});

test('full-study completion generates three idempotent refresh tasks and week capacity is honoured', () => {
  const topic = syntheticTopics[1];
  const study: PlannerTask = {
    id: 'synthetic-planner-study', topicId: topic.id, topicNumber: topic.number,
    topicTitle: topic.title, subjectId: topic.subjectId, activityType: 'estudio_nuevo',
    date: '2026-10-01', status: 'completed', estimatedMinutes: 64, actualMinutes: 64,
    pagesCount: 8, createdAt: '2026-10-01T09:00:00.000Z',
  };
  const protocolSettings = { ...DEFAULT_PLANNER_SETTINGS, autoRefreshProtocol: 'three_days' as const };
  const refreshes = generateAutoRefrescos(study, topic, [study], protocolSettings, syntheticProgress, syntheticSessions);
  assert.equal(refreshes.length, 3);
  assert.deepEqual(refreshes.map(item => item.date), ['2026-10-02', '2026-10-03', '2026-10-04']);
  assert.deepEqual(refreshes.map(item => item.refrescoIndex), [1, 2, 3]);
  assert.ok(refreshes.every(item => item.sourceStudyTaskId === study.id));
  assert.equal(generateAutoRefrescos(study, topic, [study, ...refreshes], protocolSettings, syntheticProgress, syntheticSessions).length, 0);
  const settings = { ...protocolSettings, dailyAvailabilityOverrides: { '2026-10-02': 0 } };
  const week = buildWeekPlan([study, ...refreshes], 0, settings, new Date(2026, 9, 1), syntheticSessions, syntheticProgress, syntheticTopics);
  const unavailable = week.days.find(day => day.date === '2026-10-02')!;
  assert.equal(unavailable.targetDailyMinutes, 0);
  assert.equal(unavailable.isOverloaded, true);
  assert.ok(unavailable.overloadMinutes > 0);
});
