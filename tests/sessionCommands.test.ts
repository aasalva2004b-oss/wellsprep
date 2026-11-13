import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeSessionRecord, stableSessionId } from '../src/lib/sessionCommands';

const input = { topicId: 'synthetic-1', date: '2026-11-08', type: 'estudio_inicial', durationMinutes: 20, startPage: 1, endPage: 3, pagesCount: 3 };
test('new session facts use one duration unit and never write derived topic totals', () => {
  const record = normalizeSessionRecord(input, 'synthetic-user');
  assert.equal(record.durationMinutes, 20);
  assert.equal(record.durationReal, undefined);
  assert.equal(record.vueltas, undefined);
  assert.equal(record.studyTimeHours, undefined);
  assert.equal(record.schemaVersion, 3);
  assert.equal(record.completesVuelta, false);
});
test('task and delivery identities are stable but identical measurements remain distinct facts', () => {
  assert.equal(stableSessionId({ plannerTaskId: 'task-1' }, 'random-a'), stableSessionId({ plannerTaskId: 'task-1' }, 'random-b'));
  assert.equal(stableSessionId({ sourceEventId: 'event', sourceSegmentId: 'topic-1:0' }, 'random-a'), stableSessionId({ sourceEventId: 'event', sourceSegmentId: 'topic-1:0' }, 'random-b'));
  assert.notEqual(stableSessionId(input, 'random-a'), stableSessionId(input, 'random-b'));
});
test('new initial/refresco facts cannot complete a review vuelta', () => {
  assert.equal(normalizeSessionRecord({ ...input, completesVuelta: true }, 'test').completesVuelta, false);
  assert.equal(normalizeSessionRecord({ ...input, type: 'refresco', completesVuelta: true }, 'test').completesVuelta, false);
  assert.equal(normalizeSessionRecord({ ...input, type: 'repaso', completesVuelta: true }, 'test').completesVuelta, true);
});
test('legacy activity aliases, explicit oral seconds and coverage remain compatible', () => {
  assert.equal(normalizeSessionRecord({ ...input, type: 'primer_estudio' }, 'test').type, 'estudio_inicial');
  const oral = normalizeSessionRecord({ ...input, type: 'simulacro', durationMinutes: 12, cantoSeconds: 30, cantoGrade: 7 }, 'test');
  assert.equal(oral.type, 'canto');
  assert.equal(oral.durationMinutes, 12);
  assert.equal(oral.cantoSeconds, 30);
});
test('invalid or ambiguous session facts fail before any persistence operation', () => {
  for (const patch of [{ topicId: '5' }, { topicId: 'a/b' }, { durationMinutes: -1 }, { durationMinutes: Infinity }, { date: '2026-02-31' }, { difficulty: 99 }, { cantoGrade: -1 }]) {
    assert.throws(() => normalizeSessionRecord({ ...input, ...patch }, 'test'));
  }
});
