import test from 'node:test';
import assert from 'node:assert/strict';
import type { Session, Topic } from '../src/types';
import { buildCanonicalTopicMap, getCanonicalTopic } from '../src/lib/canonicalTopicService';
import { estimatePersonalizedDuration, getMeasuredSessionPages } from '../src/lib/personalizedEstimator';
import { buildLearnerProfile, estimateAdaptiveDuration } from '../src/lib/adaptiveLearningEngine';
import { extractSessionTelemetry } from '../src/lib/sessionTelemetry';
import { selectSessionVersions } from '../src/lib/sessionVersions';

// Independent synthetic regressions found in the critical review; no SDK or private file.
const definition: Topic = { id: 'civil-990', subjectId: 'civil', number: 990, title: 'Synthetic critical estimate',
  pages: 10, difficulty: 5, tiempoEstudioHoras: 0, fechaPrimerEstudio: '', fechasRepasos: [],
  mejorTiempoCantoMinutos: 0, mejorTiempoCantoSegundos: 0, notas: '' };
const row = (id: string, patch: Record<string, any> = {}): Session => ({ id, topicId: definition.id,
  date: '2026-01-01', type: 'repaso', durationMinutes: 20, pagesCount: 10, notes: '', ...patch });
const asOf = new Date('2026-02-01T00:00:00Z');
function estimate(history: Session[], activity: 'repaso' | 'refresco' | 'estudio_nuevo' = 'repaso') {
  // Current target coverage is a separate input; these forecasts request an
  // explicit future amount rather than pretending count-only history is located.
  const target = getCanonicalTopic(definition, [definition], {}, []);
  return estimatePersonalizedDuration({ topic: target, topics: new Map([[target.id, target]]), history,
    activity, asOf, work: { pages: 10 } });
}
const profile = (history: Array<Session & Record<string, any>>) => buildLearnerProfile(history, buildCanonicalTopicMap([definition], {}, history));

test('an edited future version cannot win a historical forecast through delivery order', () => {
  for (const activity of ['repaso', 'refresco', 'estudio_nuevo'] as const) {
    const earlier = row('versioned', { type: activity === 'estudio_nuevo' ? 'estudio_inicial' : activity,
      durationMinutes: 10, updatedAt: '2026-01-02T00:00:00Z' });
    const later = { ...earlier, durationMinutes: 200, updatedAt: '2026-03-01T00:00:00Z' };
    const first = estimate([later, earlier], activity), last = estimate([earlier, later], activity);
    assert.equal(first.estimatedMinutes, 10);
    assert.equal(last.estimatedMinutes, 10);
    assert.equal(first.evidenceCount, 1);
    assert.equal(last.evidenceCount, 1);
    assert.equal(estimate([later], activity).estimatedMinutes, null, 'an unavailable old version must not be fabricated from a future edit');
  }
});

test('a future observed start is excluded even when the civil study day contradicts it', () => {
  const futureStart = row('future-start-day', { startedAt: '2026-03-01T18:00:00Z' });
  assert.equal(estimate([futureStart]).estimatedMinutes, null);
  const importedLater = row('later-import', { createdAt: '2026-03-01T18:00:00Z' });
  assert.equal(estimate([importedLater]).estimatedMinutes, 20, 'an import timestamp alone does not invent a new study date');
});

test('explicit event clocks handle local midnight and exclude unfinished outcomes', () => {
  const target = getCanonicalTopic(definition, [definition], {}, []);
  const record = row('local-clock', { date: '2026-02-01', startedAt: '2026-01-31T23:05:00Z', endedAt: '2026-01-31T23:25:00Z' });
  const request = { topic: target, topics: new Map([[target.id, target]]), activity: 'repaso' as const,
    asOf: new Date('2026-01-31T23:30:00Z'), work: { pages: 10 } };
  assert.equal(estimatePersonalizedDuration({ ...request, history: [record] }).estimatedMinutes, 20);
  assert.equal(estimatePersonalizedDuration({ ...request, history: [{ ...record, endedAt: '2026-01-31T23:45:00Z' } as any] }).estimatedMinutes, null);
});

test('equal-time conflicting deliveries resolve consistently without increasing evidence', () => {
  const first = row('conflict', { durationMinutes: 10, updatedAt: '2026-01-02T00:00:00Z' });
  const second = { ...first, durationMinutes: 200 };
  assert.deepEqual(estimate([first, second]), estimate([second, first]));
  assert.equal(estimate([first, second]).evidenceCount, 1);
});

test('the profile preserves the latest revision before delegating to the duration model', () => {
  const earlier = row('profile-version', { durationMinutes: 10, updatedAt: '2026-01-02T00:00:00Z' });
  const later = { ...earlier, durationMinutes: 200, updatedAt: '2026-01-03T00:00:00Z' };
  for (const history of [[earlier, later], [later, earlier]]) {
    const canonicalMap = buildCanonicalTopicMap([definition], {}, history);
    const observed = buildLearnerProfile(history, canonicalMap);
    assert.equal(observed.totalRecordedSessionsCount, 1);
    assert.equal(observed.totalStudiedHours, 200 / 60);
    assert.equal(observed.reviewPaceMinPerPage, 20);
    assert.equal(estimateAdaptiveDuration(canonicalMap.get(definition.id), 'repaso', observed).estimatedMinutes, 200);
  }
});

test('an archived or reassigned latest revision cannot resurrect an older active delivery', () => {
  const earlier = row('archive-version', { durationMinutes: 10, updatedAt: '2026-01-02T00:00:00Z' });
  const archived = { ...earlier, updatedAt: '2026-01-03T00:00:00Z', mergedIntoSessionId: 'synthetic-kept' };
  for (const history of [[earlier, archived], [archived, earlier]]) {
    assert.equal(estimate(history).estimatedMinutes, null);
    assert.equal(profile(history).totalRecordedSessionsCount, 0);
    assert.equal(buildCanonicalTopicMap([definition], {}, history).get(definition.id)!.sessions.length, 0);
    const target = getCanonicalTopic(definition, [definition], {}, []);
    assert.equal(estimatePersonalizedDuration({ topic: target, topics: new Map([[target.id, target]]), history,
      activity: 'repaso', work: { pages: 10 }, asOf: new Date('2026-01-02T12:00:00Z') }).estimatedMinutes, 10,
    'a future merge cannot remove the version that actually existed at the earlier cutoff');
  }
  const reclassified = { ...earlier, type: 'refresco' as const, updatedAt: '2026-01-03T00:00:00Z', durationMinutes: 30 };
  assert.equal(estimate([earlier, reclassified], 'repaso').estimatedMinutes, null);
  assert.equal(estimate([earlier, reclassified], 'refresco').estimatedMinutes, 30);
  const moved = { ...earlier, topicId: 'penal-990', updatedAt: '2026-01-03T00:00:00Z' };
  assert.equal(getCanonicalTopic(definition, [definition], {}, [earlier, moved]).sessions.length, 0);
});

test('same-revision archive conflicts fail conservatively and anonymous records keep their identities unknown', () => {
  const earlier = row('tie-archive', { updatedAt: '2026-01-02T00:00:00Z' });
  const archived = { ...earlier, mergedIntoSessionId: 'kept' };
  assert.equal((selectSessionVersions([earlier, archived])[0] as any).mergedIntoSessionId, 'kept');
  assert.equal((selectSessionVersions([archived, earlier])[0] as any).mergedIntoSessionId, 'kept');
  const first = { ...row('unknown'), id: undefined } as Session;
  const second = { ...first };
  const selected = selectSessionVersions([first, second]);
  assert.equal(selected.length, 2);
  assert.ok(selected.every(record => record.id === undefined));
});

test('ordinal model selection cannot train historical folds on later revisions', () => {
  const history = [100, 90, 80, 70, 60, 50, 40, 30].map((minutes, index) => row(`late-revision-${index}`, {
    date: `2026-01-${String(index + 1).padStart(2, '0')}`, durationMinutes: minutes,
    updatedAt: '2026-01-20T00:00:00Z',
  }));
  const target = getCanonicalTopic(definition, [definition], {}, []);
  const result = estimatePersonalizedDuration({ topic: target, topics: new Map([[target.id, target]]), history,
    activity: 'repaso', reviewOrdinal: 9, work: { pages: 10 }, asOf });
  assert.equal(result.estimatedMinutes, 60, 'all current observations are available, but their ordinal effect has no earlier validation folds');
  assert.ok(!result.factors.some(factor => factor.includes('mejora la referencia en validación temporal previa')));
});

test('an integer page range cannot silently exceed a recorded fractional extent', () => {
  assert.equal(getMeasuredSessionPages(row('fractional-excess', { startPage: 1, endPage: 7, pagesCount: 7, totalPagesAtSession: 6.5 })), null);
  assert.equal(getMeasuredSessionPages(row('fractional-count', { pagesCount: 6.5, totalPagesAtSession: 6.5 })), 6.5);
});

test('merged parts never train initial, review or refresh forecasts or inflate diagnostic totals', () => {
  for (const activity of ['repaso', 'refresco', 'estudio_nuevo'] as const) {
    const type = activity === 'estudio_nuevo' ? 'estudio_inicial' : activity;
    const part = row('merged-part', { type, durationMinutes: 100, mergedIntoSessionId: 'kept' });
    const kept = row('kept', { type, durationMinutes: 10 });
    const before = JSON.stringify([part, kept]);
    const result = estimate([part, kept], activity);
    assert.equal(result.estimatedMinutes, 10);
    assert.equal(result.evidenceCount, 1);
    assert.equal(profile([part, kept]).totalRecordedSessionsCount, 1);
    assert.equal(profile([part, kept]).totalStudiedHours, 10 / 60);
    assert.equal(JSON.stringify([part, kept]), before);
  }
});

test('PLSEMA proportions reconcile independent phase medians to a single conserved total', () => {
  const history = [
    row('phase-one', { type: 'estudio_inicial', durationMinutes: 100, plsema: { minutes: { lectura: 60, memorizar: 40, cantar: 0 } } }),
    row('phase-two', { type: 'estudio_inicial', durationMinutes: 100, plsema: { minutes: { lectura: 0, memorizar: 60, cantar: 40 } } }),
    row('phase-three', { type: 'estudio_inicial', durationMinutes: 100, plsema: { minutes: { lectura: 40, memorizar: 0, cantar: 60 } } }),
  ];
  const before = JSON.stringify(history);
  const result = estimate(history, 'estudio_nuevo');
  const phases = result.phaseEstimates!;
  assert.equal(result.estimatedMinutes, 100);
  assert.equal(Object.values(phases).reduce((sum, phase) => sum + phase.estimatedMinutes, 0), 100);
  assert.ok(Object.values(phases).every(phase => Number.isInteger(phase.estimatedMinutes) && phase.evidenceCount === 3));
  assert.equal(phases.prelectura, undefined);
  assert.equal(phases.subrayado, undefined);
  assert.equal(phases.esquema, undefined);
  assert.deepEqual(estimate([...history].reverse(), 'estudio_nuevo').phaseEstimates, phases);
  assert.equal(JSON.stringify(history), before);
});

test('incomplete PLSEMA never allocates missing phases or scales measured parts up to the total', () => {
  const result = estimate([row('partial-phases', { type: 'estudio_inicial', durationMinutes: 60,
    plsema: { minutes: { lectura: 20 }, seconds: { memorizar: 1800 } } })], 'estudio_nuevo');
  assert.equal(result.estimatedMinutes, 60);
  assert.deepEqual(result.phaseEstimates?.lectura, { estimatedMinutes: 20, evidenceCount: 1 });
  assert.deepEqual(result.phaseEstimates?.memorizar, { estimatedMinutes: 30, evidenceCount: 1 });
  assert.equal(result.phaseEstimates?.cantar, undefined);
  assert.equal(Object.values(result.phaseEstimates!).reduce((sum, phase) => sum + phase.estimatedMinutes, 0), 50);
});

test('joint phase rounding cannot turn a one-minute total into six minutes', () => {
  const result = estimate([row('tiny-budget', { type: 'estudio_inicial', durationMinutes: 1,
    plsema: { minutes: { prelectura: 1 / 6, lectura: 1 / 6, subrayado: 1 / 6, esquema: 1 / 6, memorizar: 1 / 6, cantar: 1 / 6 } } })], 'estudio_nuevo');
  assert.equal(result.estimatedMinutes, 1);
  assert.equal(Object.values(result.phaseEstimates!).reduce((sum, phase) => sum + phase.estimatedMinutes, 0), 1);
});

test('calibration rejects post-outcome, missing-date, persistence-stage and manual estimates', () => {
  const base = row('observed', { durationMinutes: 10, startedAt: '2026-01-01T10:00:00Z', endedAt: '2026-01-01T10:10:00Z' });
  const prior = { estimatedMinutes: 10, generatedAt: '2026-01-01T09:00:00Z', modelVersion: 'synthetic-test' };
  for (const patch of [
    { estimatedMinutes: 10 },
    { prediction: { estimatedMinutes: 10 } },
    { prediction: { ...prior, generatedAt: '2026-03-01T00:00:00Z' } },
    { prediction: { ...prior, generatedAt: '2026-01-01T10:00:00Z' } },
    { prediction: { ...prior, captureStage: 'before_persistence' } },
    { prediction: { ...prior, predictionStage: 'posthoc' } },
    { prediction: { ...prior }, predictionStage: 'posthoc' },
    { prediction: { ...prior, modelVersion: 'manual' } },
  ]) assert.equal(profile([{ ...base, ...patch }]).predictionAccuracy, undefined);
  assert.equal(profile([{ ...base, prediction: prior }]).predictionAccuracy?.totalEvaluatedSessions, 1);
});

test('a civil date without an observed clock permits only a prediction from an earlier day', () => {
  const actual = row('civil-only', { durationMinutes: 10 });
  const prediction = { estimatedMinutes: 10, generatedAt: '2025-12-31T23:59:59Z' };
  assert.equal(profile([{ ...actual, prediction } as Session]).predictionAccuracy?.totalEvaluatedSessions, 1);
  assert.equal(profile([{ ...actual, prediction: { ...prediction, generatedAt: '2026-01-01T01:00:00Z' } } as Session]).predictionAccuracy, undefined);
});

test('PLSEMA profile averages count only observed phases in normalized records', () => {
  const first = { ...row('only-reading'), ...extractSessionTelemetry({ plsema: { minutes: { lectura: 10 } } }) };
  const second = { ...row('only-memory'), ...extractSessionTelemetry({ plsema: { minutes: { memorizar: 20 } } }) };
  const result = profile([first, second]);
  assert.deepEqual(result.plsemaProfile?.phaseAverages, { lectura: 10, memorizar: 20 });
  const measuredZero = { ...row('measured-zero'), ...extractSessionTelemetry({ plsema: { minutes: { lectura: 0, memorizar: 10 } } }) };
  assert.deepEqual(profile([first, measuredZero]).plsemaProfile?.phaseAverages, { lectura: 5, memorizar: 10 }, 'an explicitly observed zero remains a measurement');
});
