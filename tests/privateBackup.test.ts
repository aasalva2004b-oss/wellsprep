import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseBackup } from '../src/lib/backup';
import { initialTopics } from '../src/data/initialData';
import { sessionMatchesTopic } from '../src/lib/cantoUtils';
import { computeTodayStudyQueue } from '../src/lib/recommendationEngine';
import { calculateEstimatedReviewTime } from '../src/lib/repasoPredictor';
import { buildCanonicalTopicMap } from '../src/lib/canonicalTopicService';
import { buildLearnerProfile } from '../src/lib/adaptiveLearningEngine';

const file = process.env.WELLSPREP_LOCAL_BACKUP;
assert.ok(file, 'Supply WELLSPREP_LOCAL_BACKUP; no private backup is bundled.');
const original = readFileSync(file, 'utf8');
const validation = parseBackup(original);
assert.ok(validation.valid && validation.backup, 'The entire backup must validate before tests.');
const backup = validation.backup;
const sessions = backup.sessions as any[];
const progress = Object.fromEntries(backup.progress.map(record => [record.topicId, record])) as any;

test('every private backup session has one authoritative syllabus identity', () => {
  for (const session of sessions) {
    assert.equal(initialTopics.filter(topic => sessionMatchesTopic(session, topic)).length, 1, 'A session must never attach to multiple subjects.');
  }
});
test('private backup recommendations never prescribe reviews for unstarted topics', () => {
  const queue = computeTodayStudyQueue(initialTopics, progress, sessions);
  for (const task of queue.repasoTasks) {
    const p = progress[task.topic.id];
    assert.ok(p && (p.firstStudyDate || p.studyTimeHours > 0 || p.vueltas > 0), 'An unstarted topic was recommended as a review.');
  }
});
test('all private backup review estimates are invariant to input session order', () => {
  for (const topic of initialTopics.filter(topic => progress[topic.id])) {
    const history = sessions.filter(session => session.topicId === topic.id);
    const a = calculateEstimatedReviewTime(topic, progress[topic.id], history, initialTopics, progress, sessions);
    const b = calculateEstimatedReviewTime(topic, progress[topic.id], [...history].reverse(), initialTopics, progress, [...sessions].reverse());
    assert.equal(a.predictedMinutes, b.predictedMinutes, 'Chronological sorting must not depend on database order.');
  }
});
test('missing private calibration and PLSEMA remain unknown instead of invented metrics', () => {
  const profile = buildLearnerProfile(sessions, buildCanonicalTopicMap(initialTopics, progress, sessions));
  if (!sessions.some(session => session.estimatedMinutes || session.tiempoEstimado)) assert.equal(profile.predictionAccuracy, undefined);
  if (!sessions.some(session => session.plsema || session.fasesPlsema)) assert.equal(profile.plsemaProfile, undefined);
});
test('private backup input remains byte-for-byte unchanged after model checks', () => {
  assert.equal(readFileSync(file, 'utf8') === original, true, 'Original backup changed.');
});
