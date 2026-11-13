import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBackup, validateBackup, rehydrateBackupTimestamps } from '../src/lib/backup';

const timestamp = { seconds: 1_700_000_000, nanoseconds: 123, type: 'firestore/timestamp/1.0' };
function fixture() {
  return {
    progress: [{ topicId: 'synthetic-1', pages: 6, studyTimeHours: 1, vueltas: 0, updatedAt: { ...timestamp }, customField: { preserved: true } }],
    sessions: [{ id: 'synthetic-session-1', topicId: 'synthetic-1', date: '2026-11-01', durationMinutes: 60, type: 'estudio_inicial', completesVuelta: false, createdAt: { ...timestamp }, notes: 'synthetic notes' }],
    timestamp: '2026-11-07T00:00:00.000Z',
  };
}

test('validates a historical backup without mutating or discarding unknown fields', () => {
  const input = fixture();
  const original = JSON.stringify(input);
  const result = validateBackup(input);
  assert.equal(result.valid, true);
  assert.equal(JSON.stringify(result.backup), original);
  assert.equal(JSON.stringify(input), original);
  assert.deepEqual(result.counts, { progress: 1, sessions: 1, progressTopics: 1, sessionTopics: 1 });
  assert.ok(result.issues.some(issue => issue.code === 'settings_missing'));
  assert.ok(result.issues.some(issue => issue.code === 'serialized_timestamp'));
});

test('rejects malformed JSON and structural errors before any restoration', () => {
  for (const text of ['broken', 'null', '{}', '{"progress":{},"sessions":[]}']) assert.equal(parseBackup(text).valid, false);
});

test('rejects duplicate identifiers and missing stable session identifiers', () => {
  const input = fixture();
  input.progress.push({ ...input.progress[0] });
  input.sessions.push({ ...input.sessions[0] });
  const result = validateBackup(input);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some(issue => issue.code === 'duplicate_topic_id'));
  assert.ok(result.issues.some(issue => issue.code === 'duplicate_session_id'));
  const missing = fixture() as any;
  delete missing.sessions[0].id;
  assert.equal(validateBackup(missing).valid, false);
});

test('rejects invalid dates, document paths, negative units, and page ranges', () => {
  const input: any = fixture();
  Object.assign(input.sessions[0], { topicId: '../nested', date: '2026-02-30', durationMinutes: -1, startPage: 5, endPage: 2, cantoGrade: 12 });
  const result = validateBackup(input);
  assert.equal(result.valid, false);
  for (const code of ['invalid_topic_id', 'invalid_date', 'invalid_duration', 'invalid_page_range', 'invalid_number']) assert.ok(result.issues.some(issue => issue.code === code));
});

test('reports contradictory units and aggregates without silently changing the backup', () => {
  const input: any = fixture();
  Object.assign(input.sessions[0], { effectiveHours: 2, durationReal: 90, completesVuelta: true, type: 'primer_estudio' });
  const result = validateBackup(input);
  assert.equal(result.valid, true);
  for (const code of ['duration_conflict', 'effective_hours_conflict', 'aggregate_hours_conflict', 'aggregate_vueltas_conflict', 'legacy_session_type']) assert.ok(result.issues.some(issue => issue.code === code));
  assert.equal(result.backup?.sessions[0].durationMinutes, 60);
});

test('preserves and reports missing relationships rather than fabricating progress', () => {
  const input = fixture();
  input.sessions[0].topicId = 'synthetic-2';
  const result = validateBackup(input);
  assert.equal(result.valid, true);
  assert.ok(result.issues.some(issue => issue.code === 'session_without_progress'));
  assert.ok(result.issues.some(issue => issue.code === 'progress_without_sessions'));
});

test('rehydrates nested serialized timestamps through an injected factory without mutation', () => {
  const input = fixture();
  const original = JSON.stringify(input);
  const result: any = rehydrateBackupTimestamps(input, (seconds, nanoseconds) => ({ converted: [seconds, nanoseconds] }));
  assert.deepEqual(result.sessions[0].createdAt, { converted: [timestamp.seconds, timestamp.nanoseconds] });
  assert.equal(result.sessions[0].notes, input.sessions[0].notes);
  assert.equal(JSON.stringify(input), original);
});

test('issues contain locations and fixed explanations, never private field values', () => {
  const input: any = fixture();
  Object.assign(input.sessions[0], { topicId: 'private/not-a-path', notes: 'PRIVATE_NOTE', userId: 'PRIVATE_OWNER' });
  const output = JSON.stringify(validateBackup(input).issues);
  for (const secret of ['private/not-a-path', 'PRIVATE_NOTE', 'PRIVATE_OWNER']) assert.equal(output.includes(secret), false);
});

test('preserves complete v2 settings and quarantine without interpreting their fields', () => {
  const input = { ...fixture(), schemaVersion: 2, settings: {
    general: { activeSubjects: ['synthetic'] },
    preparador: { lunes: ['synthetic-1'], jueves: [] },
    weeklyCantePlan: { progressOverrides: { 'synthetic-1': { completedPages: 2 } } },
    weeklyPlannerState: { tasks: [], settings: { synthetic: true } },
  }, quarantine: [{ id: 'synthetic-event', status: 'quarantine', topics: [] }] };
  const result = parseBackup(JSON.stringify(input));
  assert.equal(result.valid, true);
  assert.deepEqual(result.backup?.settings, input.settings);
  assert.deepEqual(result.backup?.quarantine, input.quarantine);
  assert.equal(result.issues.some(issue => issue.code === 'settings_missing'), false);
});

test('rejects malformed v2 structures without exposing document identifiers', () => {
  for (const extension of [{ settings: [] }, { settings: { 'private/path': {} } }, { quarantine: {} }, { quarantine: [null] }, { schemaVersion: 3 }]) {
    const result = validateBackup({ ...fixture(), ...extension });
    assert.equal(result.valid, false);
    assert.equal(JSON.stringify(result.issues).includes('private/path'), false);
  }
});
