import assert from 'node:assert/strict';
import test from 'node:test';
import type { Session, Topic } from '../src/types';
import { buildCanonicalTopicMap, getCanonicalTopic } from '../src/lib/canonicalTopicService';
import { buildLearnerProfile, estimateAdaptiveDuration } from '../src/lib/adaptiveLearningEngine';
import { calculateTopicHistoricalPace } from '../src/lib/weeklyCanteEngine';
import { syntheticTopics } from './fixtures/syntheticStudyData';

const topic: Topic = { ...syntheticTopics[0], difficulty: 5, pages: 12 };
const recorded = (extras: Record<string, unknown> = {}): Session => ({
  id: 'synthetic-consistency-session', topicId: topic.id, date: '2026-10-01',
  type: 'repaso', durationMinutes: 30, notes: 'Synthetic consistency regression.',
  ...extras,
});
const profileFor = (sessions: Session[]) => buildLearnerProfile(sessions, buildCanonicalTopicMap([topic], {}, sessions));

test('a three-page session learns ten minutes per page, not a whole-topic denominator', () => {
  const profile = profileFor([recorded({ pagesCount: 3 })]);
  assert.equal(profile.reviewPaceMinPerPage, 10);
});

test('worked-page ranges and explicit page lists preserve partial-session pace', () => {
  for (const coverage of [
    { startPage: 4, endPage: 6 },
    { fromPage: 4, toPage: 6 },
    { pagesStudied: 3 },
    { pagesNumbers: [4, 5, 6] },
    { pageBreakdown: [{ pageNumber: 4 }, { pageNumber: 5 }, { pageNumber: 6 }] },
  ]) {
    assert.equal(profileFor([recorded(coverage)]).reviewPaceMinPerPage, 10);
  }
});

test('legacy sessions without measured pages preserve unknown pace despite known current topic size', () => {
  const profile = profileFor([recorded({ durationMinutes: 24 })]);
  assert.equal(profile.reviewPaceMinPerPage, null);
  assert.equal(profile.totalRecordedSessionsCount, 1, 'observed duration remains in the history');
  assert.equal(profile.paceSampleCounts!.review, 0);
});

test('invalid explicit page coverage does not train a plausible but false whole-topic pace', () => {
  for (const coverage of [
    { pagesCount: 0 },
    { pagesCount: 13 },
    { startPage: 0, endPage: 3 },
    { startPage: 5, endPage: 3 },
    { startPage: 10, endPage: 14 },
    { pagesNumbers: [0, 1, 2] },
  ]) {
    assert.equal(profileFor([recorded({ ...coverage, totalPagesAtSession: topic.pages })]).reviewPaceMinPerPage, null);
  }
});

test('weekly initial-study preparation learns measured study pace without accumulating exposure counts', () => {
  const once = recorded({ type: 'primer_estudio', durationMinutes: 24, pagesCount: 12 });
  const history = [once, { ...once, id: 'synthetic-second-review' }, { ...once, id: 'synthetic-third-review' }];
  const single = calculateTopicHistoricalPace(topic.id, topic, [once], 3.5, {}, [topic]);
  const repeated = calculateTopicHistoricalPace(topic.id, topic, history, 3.5, {}, [topic]);
  assert.equal(single.minutesPerPage, 2);
  assert.equal(repeated.minutesPerPage, single.minutesPerPage);
  assert.equal(repeated.sampleCount, 3);
});

test('weekly preparation uses initial-study worked pages and excludes review and oral sessions from its pace', () => {
  const history = [
    recorded({ id: 'synthetic-short-study', type: 'primer_estudio', durationMinutes: 12, pagesCount: 3 }),
    recorded({ id: 'synthetic-long-study', type: 'primer_estudio', durationMinutes: 36, startPage: 4, endPage: 12 }),
    recorded({ id: 'synthetic-oral', type: 'canto', durationMinutes: 12, cantoType: 'preparador', cantoGrade: 8 }),
    recorded({ id: 'synthetic-fast-review', type: 'repaso', durationMinutes: 1, pagesCount: 12 }),
  ];
  const pace = calculateTopicHistoricalPace(topic.id, topic, history, 3.5, {}, [topic]);
  assert.equal(pace.minutesPerPage, 4);
  assert.equal(pace.sampleCount, 2);
});

test('calibration is absent when no session stored its prediction', () => {
  assert.equal(profileFor([recorded(), recorded({ estimatedMinutes: 0 })]).predictionAccuracy, undefined);
  assert.equal(profileFor([recorded({ estimatedMinutes: 30 })]).predictionAccuracy, undefined, 'a legacy estimate without capture chronology is not prospective evidence');
});

test('calibration reports measured MAE and relative error without an artificial accuracy floor', () => {
  const observedClock = { startedAt: '2026-10-01T10:00:00Z', endedAt: '2026-10-01T10:30:00Z',
    prediction: { estimatedMinutes: 30, generatedAt: '2026-10-01T09:50:00Z', modelVersion: 'synthetic-test' } };
  const perfect = profileFor([recorded({ durationMinutes: 30, ...observedClock })]).predictionAccuracy!;
  assert.equal(perfect.totalEvaluatedSessions, 1);
  assert.equal(perfect.meanAbsoluteErrorMinutes, 0);
  assert.equal(perfect.accuracyPct, 100);
  const inaccurate = profileFor([recorded({ durationMinutes: 90, ...observedClock, endedAt: '2026-10-01T11:30:00Z' })]).predictionAccuracy!;
  assert.equal(inaccurate.meanAbsoluteErrorMinutes, 60);
  assert.ok(Math.abs(inaccurate.accuracyPct - 100 / 3) < 1e-8, '60 minutes error over90 observed minutes is a two-thirds relative error');
});

test('learning does not mutate source sessions or topic progress', () => {
  const sessions = [recorded({ pagesCount: 3 })];
  const before = JSON.stringify(sessions);
  profileFor(sessions);
  calculateTopicHistoricalPace(topic.id, topic, sessions, 3.5, {}, [topic]);
  assert.equal(JSON.stringify(sessions), before);
});

test('measured sessions of 600 minutes and sixty minutes per page remain valid evidence', () => {
  const history = [recorded({ type: 'primer_estudio', durationMinutes: 600, pagesCount: 10 })];
  const profile = profileFor(history);
  assert.equal(profile.totalRecordedSessionsCount, 1);
  assert.equal(profile.studyPaceMinPerPage, 60);
  assert.equal(calculateTopicHistoricalPace(topic.id, topic, history, 3.5, {}, [topic]).minutesPerPage, 60);
});

test('finite positive fast paces are not raised to an arbitrary speed floor', () => {
  const history = [recorded({ durationMinutes: 0.3, pagesCount: 12 })];
  const pace = 0.3 / 12;
  assert.equal(profileFor(history).reviewPaceMinPerPage, pace);
  assert.equal(calculateTopicHistoricalPace(topic.id, topic, history, 3.5, {}, [topic]).minutesPerPage, null, 'review speed cannot substitute for first-study speed');
});

test('unknown zero page coverage and impossible durations do not create usable pace observations', () => {
  const history = [
    recorded({ id: 'synthetic-unmeasured-pages', durationMinutes: 600, pagesCount: 0 }),
    recorded({ id: 'synthetic-impossible-duration', durationMinutes: 1441, pagesCount: 12 }),
  ];
  const profile = profileFor(history);
  assert.equal(profile.totalRecordedSessionsCount, 1);
  assert.equal(profile.reviewPaceMinPerPage, null);
  assert.equal(profile.hasSufficientData, false);
  assert.equal(calculateTopicHistoricalPace(topic.id, topic, history, 3.5, {}, [topic]).sampleCount, 0);
});

test('oral-only history and unrelated activity samples do not create high study confidence', () => {
  const oralHistory = Array.from({ length: 6 }, (_, index) => recorded({ id: `synthetic-oral-${index}`, type: 'canto', cantoType: 'solo', durationMinutes: 12 }));
  const oralProfile = profileFor(oralHistory);
  assert.equal(oralProfile.totalRecordedSessionsCount, 6);
  assert.equal(oralProfile.hasSufficientData, false);
  const canonical = getCanonicalTopic(topic.id, [topic], {}, oralHistory);
  assert.equal(estimateAdaptiveDuration(canonical, 'estudio_nuevo', oralProfile).confidence, 'provisional');
  const reviews = Array.from({ length: 6 }, (_, index) => recorded({ id: `synthetic-review-${index}`, pagesCount: 12 }));
  const reviewProfile = profileFor(reviews);
  assert.equal(reviewProfile.hasSufficientData, true);
  assert.equal(estimateAdaptiveDuration(canonical, 'estudio_nuevo', reviewProfile).confidence, 'provisional');
  const reviewEstimate = estimateAdaptiveDuration(canonical, 'repaso', reviewProfile);
  assert.equal(reviewEstimate.evidenceCount, 6);
  assert.equal(reviewEstimate.confidence, 'media', 'six comparable events retain sampling uncertainty');
  const studyEstimate = estimateAdaptiveDuration(canonical, 'estudio_nuevo', reviewProfile);
  assert.equal(studyEstimate.estimatedMinutes, null);
  assert.equal(studyEstimate.evidenceCount, 0);
});

test('changing present topic size does not reconstruct unmeasured historical work', () => {
  const history = [recorded({ durationMinutes: 24 })];
  const largerTopic = { ...topic, pages: 120 };
  const larger = buildLearnerProfile(history, buildCanonicalTopicMap([largerTopic], {}, history));
  assert.equal(profileFor(history).reviewPaceMinPerPage, null);
  assert.equal(larger.reviewPaceMinPerPage, null);
  const measured = [recorded({ pagesCount: 3, durationMinutes: 30 })];
  const measuredLarger = buildLearnerProfile(measured, buildCanonicalTopicMap([largerTopic], {}, measured));
  assert.equal(measuredLarger.reviewPaceMinPerPage, 10, 'explicit historical work survives current metadata edits');
});
