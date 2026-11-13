import assert from 'node:assert/strict';
import test from 'node:test';
import { extractSessionTelemetry } from '../src/lib/sessionTelemetry';
import { syntheticSessions } from './fixtures/syntheticStudyData';

test('preserves synthetic PLSEMA, measured pages and sub-minute telemetry', () => {
  const session = syntheticSessions[0];
  const result = extractSessionTelemetry(session);
  assert.deepEqual(result.plsema?.minutes, session.plsema.minutes);
  assert.deepEqual(result.plsema?.seconds, session.plsema.seconds);
  assert.deepEqual(result.pagesNumbers, session.pagesNumbers);
  assert.equal(result.startPage, session.startPage);
  assert.equal(result.endPage, session.endPage);
  assert.equal(result.pageBreakdown?.length, session.pageBreakdown.length);
  assert.equal(result.pageBreakdown?.[0].plsema?.totalSeconds, session.pageBreakdown[0].plsema.totalSeconds);
});

test('recovers allowlisted telemetry from the resolver original and Spanish aliases', () => {
  const result = extractSessionTelemetry({
    original: {
      pages: { pageStart: '2', pageEnd: '4', pagesCount: '3' },
      minutosPorPagina: '2.5', segundosPorPagina: '150',
      segundosDistraccion: '12.5',
      fasesPlsema: { segundosMemorizar: 90, minutosLectura: 0.5 },
      pageBreakdown: [{ pagina: 2, minutosEfectivos: 1.5, completada: true }],
    },
  });
  assert.equal(result.startPage, 2);
  assert.equal(result.endPage, 4);
  assert.equal(result.pagesCount, 3);
  assert.equal(result.minutesPerPage, 2.5);
  assert.equal(result.secondsPerPage, 150);
  assert.equal(result.distractionSeconds, 12.5);
  assert.equal(result.plsema?.totalMinutes, 2);
  assert.equal(result.plsema?.activeRecallRatio, 75);
  assert.deepEqual(result.plsema?.observedPhases, ['lectura', 'memorizar']);
  assert.deepEqual(result.pageBreakdown, [{ pageNumber: 2, effectiveMinutes: 1.5, completed: true }]);
});

test('keeps reported range and count discrepancies visible and does not infer coverage', () => {
  const result = extractSessionTelemetry({ startPage: 6, endPage: 7, pagesCount: 6 });
  assert.equal(result.pagesNumbers, undefined);
  assert.equal(result.plsema, undefined);
  assert.deepEqual(result, { startPage: 6, endPage: 7, pagesCount: 6 });
});

test('explicit zero remains measured zero and is not replaced by original metadata', () => {
  const result = extractSessionTelemetry({
    minutesPerPage: 0, pagesCount: 0, distractionSeconds: 0,
    original: { minutesPerPage: 9, pagesCount: 8, distractionSeconds: 6 },
  });
  assert.deepEqual(result, { minutesPerPage: 0, pagesCount: 0, distractionSeconds: 0 });
});

test('PLSEMA seconds take precedence over rounded minutes and cached aggregates', () => {
  const result = extractSessionTelemetry({ plsema: {
    seconds: { memorizar: 90.5, cantar: 30 },
    minutes: { memorizar: 2, cantar: 1 },
    totalMinutes: 999, activeRecallRatio: -500,
  } });
  assert.equal(result.plsema?.totalSeconds, 120.5);
  assert.equal(result.plsema?.totalMinutes, 120.5 / 60);
  assert.equal(result.plsema?.minutes.memorizar, 90.5 / 60);
  assert.equal(result.plsema?.activeRecallRatio, 100);
});

test('does not invent phases from a total-only object', () => {
  assert.deepEqual(extractSessionTelemetry({ plsema: { totalMinutes: 60 } }), {});
  assert.deepEqual(extractSessionTelemetry({}), {});
});

test('invalid numbers, arbitrary strings and malformed page data are discarded', () => {
  const result = extractSessionTelemetry({
    startPage: -1, endPage: 3.5, pagesCount: true, minutesPerPage: Infinity,
    secondsPerPage: '', effectiveSeconds: NaN, distractionSeconds: -10,
    pagesNumbers: [3, '1', 3, 0, -1, 1.5, null, true, 'bad'],
    pageBreakdown: [null, { pageNumber: 0 }, { pageNumber: 2, effectiveMinutes: -1, completed: 'true' }],
    plsema: { minutes: { memorizar: -1, cantar: 'Infinity' } },
  });
  assert.deepEqual(result, { pagesNumbers: [1, 3], pageBreakdown: [{ pageNumber: 2 }] });
});

test('does not copy free text, identities, tokens or unrelated nested payloads', () => {
  const result = extractSessionTelemetry({
    notes: 'synthetic note', email: 'nobody@example.test', token: 'synthetic-token',
    rawPayload: { pagesCount: 10 },
    plsema: { minutes: { lectura: 5 }, token: 'synthetic-token' },
    pageBreakdown: [{ pageNumber: 1, notes: 'synthetic note', email: 'nobody@example.test' }],
  });
  assert.deepEqual(Object.keys(result).sort(), ['pageBreakdown', 'plsema']);
  assert.deepEqual(result.pageBreakdown, [{ pageNumber: 1 }]);
  assert.equal(JSON.stringify(result).includes('synthetic-token'), false);
  assert.equal(JSON.stringify(result).includes('nobody@'), false);
});

test('does not mutate inputs and produces JSON-safe independent values', () => {
  const input = structuredClone(syntheticSessions[0]);
  const before = JSON.stringify(input);
  const result = extractSessionTelemetry(input);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  assert.equal(JSON.stringify(input), before);
  if (result.plsema) result.plsema.minutes.lectura = 12345;
  assert.equal(JSON.stringify(input), before);
  for (const value of [null, undefined, false, 'invalid', 4, []]) {
    assert.deepEqual(extractSessionTelemetry(value), {});
  }
});

test('normalising PLSEMA twice preserves missing phases rather than observing zero-filled fields', () => {
  const once = extractSessionTelemetry({ plsema: { minutes: { lectura: 5 } } });
  const twice = extractSessionTelemetry(once);
  assert.deepEqual(twice, once);
  assert.deepEqual(twice.plsema?.observedPhases, ['lectura']);
  assert.equal(twice.plsema?.minutes.memorizar, 0);
  assert.equal(twice.plsema?.observedPhases.includes('memorizar'), false);
});
