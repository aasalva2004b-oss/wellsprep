import test from 'node:test';
import assert from 'node:assert/strict';
import { reportedMetric, reportedNumber, reportedPhaseMinutes, reportedRecords, reportedText } from '../src/lib/importedAnalyticsPresentation';

test('partial external analytics cannot turn absent data into reported focus, duration or feasibility', () => {
  for (const value of [undefined, null, '', ' ', false, true, NaN, Infinity, -1, {}, []]) {
    assert.equal(reportedMetric(value, '%'), '—');
    assert.equal(reportedNumber(value), null);
  }
  assert.equal(reportedText(undefined), 'No disponible');
  assert.equal(reportedText(''), 'No disponible');
  assert.equal(reportedText('Viable'), 'Viable');
});

test('a real zero remains zero and never activates a positive fallback', () => {
  assert.equal(reportedMetric(0, '%', 0, 100), '0%');
  assert.equal(reportedMetric('0', ' min'), '0 min');
  assert.equal(reportedMetric(12.5, ' min/pág', 1), '12.5 min/pág');
  assert.equal(reportedMetric(101, '%', 0, 100), '—');
});

test('zero-filled phases remain unavailable unless their observation is declared', () => {
  const phases = { minutes: { lectura: 10, memorizar: 0 }, observedPhases: ['lectura'] };
  assert.equal(reportedPhaseMinutes(phases, 'lectura'), 10);
  assert.equal(reportedPhaseMinutes(phases, 'memorizar'), null);
  assert.equal(reportedPhaseMinutes({ phaseMinutes: { lectura: 0 } }, 'lectura'), 0);
  assert.equal(reportedPhaseMinutes({ phaseMinutes: {} }, 'lectura'), null);
});

test('malformed lists cannot crash the external analytics view or create invented rows', () => {
  for (const value of [undefined, null, 'not a list', {}, 8]) assert.deepEqual(reportedRecords(value), []);
  assert.deepEqual(reportedRecords([null, false, 'row', [], { effectiveMinutes: 0 }, {}]), [{ effectiveMinutes: 0 }, {}]);
});
