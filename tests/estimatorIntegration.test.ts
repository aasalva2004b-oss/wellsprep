import assert from 'node:assert/strict';
import test from 'node:test';
import type { Session, Topic } from '../src/types';
import { buildCanonicalTopicMap, getCanonicalTopic } from '../src/lib/canonicalTopicService';
import { buildLearnerProfile, estimateAdaptiveDuration } from '../src/lib/adaptiveLearningEngine';
import { estimateTaskAdaptiveDetails, estimateTaskDurationMinutes, DEFAULT_PLANNER_SETTINGS, reconcilePlannerTasks, buildWeekPlan, type PlannerTask } from '../src/lib/plannerEngine';
import { calculateEstimatedReviewTime } from '../src/lib/repasoPredictor';
import { buildSubjectTelemetryIndex } from '../src/lib/performanceCache';

const topic: Topic = {
  id: 'synthetic-civil-970', subjectId: 'civil', number: 970, title: 'Synthetic integration topic',
  pages: 6, difficulty: 5, tiempoEstudioHoras: 0, fechaPrimerEstudio: '', fechasRepasos: [],
  mejorTiempoCantoMinutos: 0, mejorTiempoCantoSegundos: 0, notas: '',
};
const historyFor = (type: Session['type'], durationMinutes = 30): Session[] => Array.from({ length: 6 }, (_, index) => ({
  id: `synthetic-${type}-${index}`, topicId: topic.id, type, durationMinutes,
  date: `2026-10-${String(index + 1).padStart(2, '0')}`, notes: '', difficulty: 5,
  startPage: 1, endPage: 3, pagesCount: 3, totalPagesAtSession: 6,
}));
const task: PlannerTask = {
  id: 'synthetic-integration-task', topicId: topic.id, topicNumber: topic.number,
  topicTitle: topic.title, subjectId: topic.subjectId, activityType: 'estudio_nuevo',
  status: 'pending', date: '2026-11-08', estimatedMinutes: 999,
  estimateSource: 'automatic', volumeSource: 'remaining_initial', createdAt: '2026-10-01',
};

test('initial planner estimate uses three actually pending pages and the same shared service', () => {
  const history = historyFor('primer_estudio');
  const map = buildCanonicalTopicMap([topic], {}, history);
  const canonical = map.get(topic.id)!;
  const direct = estimateAdaptiveDuration(canonical, 'estudio_nuevo', buildLearnerProfile(history, map));
  const planner = estimateTaskAdaptiveDetails(topic, 'estudio_nuevo', history, DEFAULT_PLANNER_SETTINGS, undefined, {}, undefined, { allTopics: [topic], canonicalMap: map });
  assert.equal(canonical.initialStudyCoverage.remainingPages, 3);
  assert.equal(direct.pagesUsed, 3);
  assert.equal(direct.estimatedMinutes, 30);
  assert.equal(planner.estimatedMinutes, direct.estimatedMinutes);
  assert.deepEqual(planner.interval, direct.interval);
  assert.ok(planner.evidenceCount > 0);
});

test('Temario review and planner review expose one prediction and interval', () => {
  const history = historyFor('repaso', 18);
  const map = buildCanonicalTopicMap([topic], {}, history);
  const planner = estimateTaskAdaptiveDetails(topic, 'repaso', history, DEFAULT_PLANNER_SETTINGS, undefined, {}, undefined, { allTopics: [topic], canonicalMap: map });
  const syllabus = calculateEstimatedReviewTime(topic, undefined, history, [topic], {}, history);
  assert.equal(syllabus.predictedMinutes, planner.estimatedMinutes);
  assert.deepEqual(syllabus.interval, planner.interval);
  assert.equal(syllabus.evidenceCount, planner.evidenceCount);
});

test('screen telemetry reuses the canonical context while preserving each review prediction', () => {
  const topics = [topic, { ...topic, id: 'synthetic-civil-971', number: 971, pages: 9 }];
  const history = [...historyFor('repaso', 18), ...historyFor('repaso', 24).map(session => ({ ...session, id: `${session.id}-other`, topicId: topics[1].id }))];
  const before = JSON.stringify(history);
  const map = buildCanonicalTopicMap(topics, {}, history);
  const telemetry = buildSubjectTelemetryIndex(topics, {}, history, map);
  for (const item of topics) {
    const direct = calculateEstimatedReviewTime(item, undefined, history.filter(session => session.topicId === item.id), topics, {}, history);
    const shared = telemetry.get(item.id)!;
    assert.equal(shared.canonical, map.get(item.id));
    assert.equal(shared.reviewEstimate.predictedMinutes, direct.predictedMinutes);
    assert.deepEqual(shared.reviewEstimate.interval, direct.interval);
    assert.equal(shared.reviewEstimate.evidenceCount, direct.evidenceCount);
  }
  assert.equal(JSON.stringify(history), before);
});

test('insufficient evidence is unavailable rather than a generic study, refresh, review or cante duration', () => {
  const canonical = getCanonicalTopic(topic, [topic], {}, []);
  const profile = buildLearnerProfile([], new Map([[topic.id, canonical]]));
  for (const type of ['estudio_nuevo', 'refresco', 'repaso', 'cante'] as const) {
    const result = estimateAdaptiveDuration(canonical, type, profile);
    assert.equal(result.estimatedMinutes, null);
    assert.equal(result.available, false);
    assert.equal(result.interval, null);
    assert.equal(estimateTaskDurationMinutes(topic, type, [], DEFAULT_PLANNER_SETTINGS, undefined, {}, undefined, { allTopics: [topic] }), null);
  }
  const review = calculateEstimatedReviewTime(topic);
  assert.equal(review.predictedMinutes, null);
  assert.equal(review.formatted, 'Sin evidencia suficiente');
});

test('oral forecasts use oral observations and include measured seconds', () => {
  const history = historyFor('canto', 12).map(session => ({ ...session, cantoSeconds: 30 }));
  const canonical = getCanonicalTopic(topic, [topic], {}, history);
  const forecast = estimateAdaptiveDuration(canonical, 'cante', buildLearnerProfile(history, new Map([[topic.id, canonical]])));
  assert.equal(forecast.estimatedMinutes, 12.5); // Oral seconds remain half-minute units in the shared model.
  assert.equal(forecast.method, 'oral_duration');
  assert.ok(forecast.interval!.low <= 12.5 && forecast.interval!.high >= 12.5);
});

test('master extent changes refresh automatic estimates; manual agenda durations remain separate', () => {
  const history = historyFor('primer_estudio');
  const six = reconcilePlannerTasks([task], history, DEFAULT_PLANNER_SETTINGS, {}, [topic])[0];
  const eight = reconcilePlannerTasks([task], history, DEFAULT_PLANNER_SETTINGS, { [topic.id]: { pages: 8 } as any }, [topic])[0];
  assert.equal(six.estimatedMinutes, 30);
  assert.equal(eight.estimatedMinutes, 50);
  const manual = reconcilePlannerTasks([{ ...task, estimateSource: 'manual', manualEstimatedMinutes: 47 }], history, DEFAULT_PLANNER_SETTINGS, {}, [topic])[0];
  assert.equal(manual.estimatedMinutes, 47);
});

test('unknown task durations do not resurrect old cached estimates and make sums explicitly incomplete', () => {
  const projected = reconcilePlannerTasks([task], [], DEFAULT_PLANNER_SETTINGS, {}, [topic])[0];
  assert.equal(projected.estimatedMinutes, null);
  const week = buildWeekPlan([task], 0, DEFAULT_PLANNER_SETTINGS, new Date(2026, 10, 8), [], {}, [topic]);
  assert.equal(week.unknownDurationTaskCount, 1);
  assert.ok(week.proactiveWarnings.some(message => message.includes('sin duración estimable')));
});

test('prediction snapshots retain evidence and version without changing observed sessions', () => {
  const history = historyFor('repaso');
  const before = JSON.stringify(history);
  const canonical = getCanonicalTopic(topic, [topic], {}, history);
  const forecast = estimateAdaptiveDuration(canonical, 'repaso', buildLearnerProfile(history, new Map([[topic.id, canonical]])));
  assert.equal(forecast.personalizedPrediction.estimatedMinutes, forecast.estimatedMinutes);
  assert.equal(forecast.personalizedPrediction.modelVersion, forecast.modelVersion);
  assert.ok(forecast.personalizedPrediction.generatedAt);
  assert.deepEqual(forecast.personalizedPrediction.interval, forecast.interval);
  assert.equal(JSON.stringify(history), before);
});
