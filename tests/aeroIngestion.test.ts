import test from 'node:test';
import assert from 'node:assert/strict';
import { extractMinutesFromAeroItem, resolveAeroFocusTopic } from '../src/lib/topicResolver';

test('missing AeroFocus measurements never become an invented forty-five-minute session', () => {
  assert.equal(extractMinutesFromAeroItem({}), 0);
  assert.equal(extractMinutesFromAeroItem(null), 0);
  assert.equal(extractMinutesFromAeroItem({ durationMinutes: true }), 0);
  assert.equal(extractMinutesFromAeroItem({ durationMinutes: Infinity }), 0);
  assert.equal(extractMinutesFromAeroItem({ duration: '90 apples' }), 0);
});
test('AeroFocus units and sub-minute observations retain their measured precision', () => {
  assert.equal(extractMinutesFromAeroItem({ durationMinutes: .25 }), .25);
  assert.equal(extractMinutesFromAeroItem({ effectiveSeconds: 45 }), .75);
  assert.equal(extractMinutesFromAeroItem({ effectiveHours: 1.5 }), 90);
  assert.equal(extractMinutesFromAeroItem({ effectiveMinutes: 0, effectiveHours: .5 }), 30);
  assert.equal(extractMinutesFromAeroItem({ duration: '1h 30m 15s' }), 90.25);
  assert.equal(extractMinutesFromAeroItem({ duration: '01:30:30' }), 90.5);
});
test('two-part clocks require explicit units instead of confusing oral minutes with hours', () => {
  assert.equal(extractMinutesFromAeroItem({ duration: '12:30' }), 0);
  assert.equal(extractMinutesFromAeroItem({ duration: '12:30', timeFormat: 'mm:ss' }), 12.5);
  assert.equal(extractMinutesFromAeroItem({ duration: '01:30', timeFormat: 'hh:mm' }), 90);
});
test('an ambiguous topic number never silently becomes a Constitucional theme', () => {
  assert.equal(resolveAeroFocusTopic({ topicNumber: 5 } as any), null);
  assert.equal(resolveAeroFocusTopic({ topicId: '5' } as any), null);
  assert.equal(resolveAeroFocusTopic({ topicId: 'civil-5', durationMinutes: 23 } as any)?.resolvedTopicId, 'civil-5');
  assert.equal(resolveAeroFocusTopic({ materia: 'Civil', topicNumber: 5 } as any)?.effectiveMinutes, 0);
});
