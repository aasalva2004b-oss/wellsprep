import test from 'node:test';
import assert from 'node:assert/strict';
import type { Session, Topic } from '../src/types';
import { getCanonicalTopic, type CanonicalTopic } from '../src/lib/canonicalTopicService';
import { estimatePersonalizedDuration, getMeasuredSessionPages, type PersonalizedEstimationRequest } from '../src/lib/personalizedEstimator';

// Fictitious observations only. No SDK, file export, network or database involved.
const date = (offset: number) => new Date(Date.UTC(2026, 0, 1 + offset)).toISOString().slice(0, 10);
const asOf = new Date('2026-05-01T00:00:00Z');
function topic(id = 'civil-1', pages = 6, difficulty = 5, words?: number): CanonicalTopic {
  const master = { id, subjectId: 'civil', number: Number(id.split('-').at(-1)) || 1, title: `Ficticio ${id}`, pages, difficulty, numeroPalabras: words,
    tiempoEstudioHoras: 0, fechaPrimerEstudio: '', fechasRepasos: [], mejorTiempoCantoMinutos: 0, mejorTiempoCantoSegundos: 0, notas: '' } as Topic;
  return getCanonicalTopic(master, [master], {}, []);
}
function session(id: string, type: Session['type'], minutes: number, offset = 0, extra: Record<string, any> = {}): Session {
  return { id, topicId: 'civil-1', date: date(offset), type, durationMinutes: minutes, notes: '', ...extra };
}
function estimate(target: CanonicalTopic, history: Session[], extra: Partial<PersonalizedEstimationRequest> = {}) {
  return estimatePersonalizedDuration({ topic: target, activity: 'estudio_nuevo', history, topics: new Map([[target.id, target]]), asOf, ...extra });
}

test('empty history returns unknown separately for each activity, no generic duration', () => {
  for (const activity of ['estudio_nuevo', 'refresco', 'repaso', 'cante'] as const) {
    const result = estimate(topic(), [], { activity });
    assert.equal(result.estimatedMinutes, null);
    assert.equal(result.confidence, 'sin_datos');
    assert.equal(result.evidenceCount, 0);
    assert.equal(result.interval, null);
  }
});

test('initial study estimates the three remaining pages, not all six', () => {
  const target = topic();
  const history = [session('first', 'primer_estudio', 30, 0, { startPage: 1, endPage: 3 })];
  const result = estimate(target, history);
  assert.equal(result.estimatedMinutes, 30);
  assert.equal(result.method, 'measured_page_rate');
  assert.ok(result.factors.some(factor => factor.includes('3 páginas')));
});

test('page overlap affects remaining work once while review never counts as initial progress', () => {
  const history = [session('a', 'primer_estudio', 30, 0, { startPage: 1, endPage: 3 }),
    session('b', 'primer_estudio', 20, 1, { startPage: 3, endPage: 4 }),
    session('r', 'repaso', 60, 2, { startPage: 1, endPage: 6 })];
  const result = estimate(topic(), history);
  assert.equal(result.estimatedMinutes, 20);
  assert.equal(result.evidenceCount, 2);
  const done = estimate(topic( 'civil-1', 4), history.slice(0, 2));
  assert.equal(done.estimatedMinutes, 0);
  assert.equal(done.method, 'completed');
});

test('count-only history preserves uncertainty; explicit future task can be estimated', () => {
  const history = [session('count', 'primer_estudio', 30, 0, { pagesCount: 3 })];
  assert.equal(estimate(topic(), history).method, 'unknown_work');
  assert.equal(estimate(topic(), history, { work: { pages: 2 } }).estimatedMinutes, 20);
  const legacy = [session('legacy', 'primer_estudio', 60)];
  assert.equal(estimate(topic(), legacy, { work: { pages: 1 } }).estimatedMinutes, null);
});

test('extent scales only measured page rates, with independent activity data', () => {
  const history = [session('s', 'primer_estudio', 60, 0, { pagesCount: 6 }),
    session('r', 'repaso', 12, 1, { pagesCount: 6 }), session('f', 'refresco', 30, 2, { pagesCount: 6 })];
  assert.equal(estimate(topic(), history, { work: { pages: 3 } }).estimatedMinutes, 30);
  assert.equal(estimate(topic(), history, { activity: 'repaso' }).estimatedMinutes, 12);
  assert.equal(estimate(topic(), history, { activity: 'refresco' }).estimatedMinutes, 30);
  const larger = topic('civil-2', 12);
  assert.equal(estimate(larger, history, { topics: new Map([['civil-1', topic()], [larger.id, larger]]) }).estimatedMinutes, 120);
});

test('oral duration retains minutes and fractional seconds, unrelated to study', () => {
  const history = [session('c', 'canto', 12, 0, { cantoSeconds: 30 }), session('s', 'primer_estudio', 600, 0, { pagesCount: 6 })];
  const result = estimate(topic(), history, { activity: 'cante' });
  assert.equal(result.estimatedMinutes, 12.5);
  assert.equal(result.method, 'oral_duration');
  assert.equal(result.evidenceCount, 1);
  // 120 explicitly labelled minutes must not become 2 minutes.
  assert.equal(estimate(topic(), [session('long', 'canto', 120)], { activity: 'cante' }).estimatedMinutes, 120);
  assert.equal(estimate(topic(), [session('seconds', 'canto', 0, 0, { cantoSeconds: 45 })], { activity: 'cante' }).estimatedMinutes, 1);
});

test('legacy review absolute duration is allowed with low confidence, never a page pace', () => {
  const history = [session('old', 'repaso', 41)];
  const result = estimate(topic(), history, { activity: 'repaso' });
  assert.equal(result.estimatedMinutes, 41);
  assert.equal(result.method, 'topic_duration');
  assert.equal(result.confidence, 'baja');
  assert.equal(estimate(topic(), history, { activity: 'repaso', work: { pages: 1 } }).estimatedMinutes, null);
});

test('different measured difficulty produces different empirical estimates without fixed penalties', () => {
  const easy = topic('civil-2', 6, 2), hard = topic('civil-3', 6, 9);
  const targetEasy = topic('civil-4', 6, 2), targetHard = topic('civil-5', 6, 9);
  const topics = new Map([easy, hard, targetEasy, targetHard].map(item => [item.id, item]));
  const history: Session[] = [];
  for (let index = 0; index < 6; index++) {
    history.push(session(`easy${index}`, 'primer_estudio', 30, index, { pagesCount: 6, topicId: easy.id, difficulty: 2 }));
    history.push(session(`hard${index}`, 'primer_estudio', 90, index, { pagesCount: 6, topicId: hard.id, difficulty: 9 }));
  }
  const low = estimate(targetEasy, history, { topics });
  const high = estimate(targetHard, history, { topics });
  assert.ok(low.estimatedMinutes! < high.estimatedMinutes!);
  assert.ok(high.featuresUsed.includes('difficulty'));
  assert.equal(low.estimatedMinutes, 30);
  assert.equal(high.estimatedMinutes, 90);
});

test('observed first and fifth reviews receive different predictions', () => {
  const targets = [topic('civil-1'), topic('civil-2'), topic('civil-3')];
  const topics = new Map(targets.map(item => [item.id, item]));
  const history: Session[] = [];
  // Interleave series so review number is independent of recording recency.
  for (let index = 0; index < 5; index++) for (const source of targets.slice(0, 2)) {
    history.push(session(`${source.id}-${index}`, 'repaso', 60 / (index + 1), index, { topicId: source.id, pagesCount: 6 }));
  }
  const first = estimate(targets[2], history, { topics, activity: 'repaso', reviewOrdinal: 1 });
  const fifth = estimate(targets[2], history, { topics, activity: 'repaso', reviewOrdinal: 5 });
  assert.ok(first.estimatedMinutes! > fifth.estimatedMinutes!);
  assert.ok(fifth.featuresUsed.includes('ordinal'));
});

test('an explicit ordinal is not erased by the activity-median selector when series are incomplete', () => {
  const target = topic('civil-99');
  const sources = Array.from({ length: 12 }, (_, index) => topic(`civil-${index + 2}`));
  const topics = new Map([target, ...sources].map(source => [source.id, source]));
  // Each imported series retains an explicit number even when its earlier
  // reviews are absent. Counting only the imported rows would turn every one
  // into a first review and select the wrong unconditional fallback.
  const history = sources.map((source, index) => session(`incomplete-series-${index}`, 'repaso', index % 2 ? 12 : 60, index, {
    topicId: source.id, pagesCount: 6, reviewOrdinal: index % 2 ? 5 : 1,
  }));
  const first = estimate(target, history, { topics, activity: 'repaso', reviewOrdinal: 1 });
  const fifth = estimate(target, history, { topics, activity: 'repaso', reviewOrdinal: 5 });
  assert.equal(first.estimatedMinutes, 60);
  assert.equal(fifth.estimatedMinutes, 12);
  assert.ok(first.featuresUsed.includes('ordinal'));
  assert.ok(fifth.featuresUsed.includes('ordinal'));
});

test('a sparse explicit ordinal is evaluated without claiming an unvalidated speedup', () => {
  const target = topic('civil-99');
  const sources = Array.from({ length: 4 }, (_, index) => topic(`civil-${index + 2}`));
  const topics = new Map([target, ...sources].map(source => [source.id, source]));
  const history = sources.map((source, index) => session(`sparse-ordinal-${index}`, 'repaso', index % 2 ? 12 : 60, 0, {
    topicId: source.id, pagesCount: 6, reviewOrdinal: index % 2 ? 5 : 1,
  }));
  const result = estimate(target, history, { topics, activity: 'repaso', reviewOrdinal: 1 });
  assert.equal(result.estimatedMinutes, 12); // Simple measured-rate median; no earlier validation days exist.
  assert.equal(result.confidence, 'baja');
  assert.ok(result.featuresUsed.includes('ordinal_evaluated'));
  assert.ok(result.factors.some(factor => factor.includes('ordinal explícito 1') && factor.includes('no mejoró')));
});

test('an unvalidated topic preference falls back to measured rates scaled to the requested partial work', () => {
  const target = topic('civil-99');
  const sources = Array.from({ length: 4 }, (_, index) => topic(`civil-${index + 2}`));
  const topics = new Map([target, ...sources].map(source => [source.id, source]));
  const history = sources.map((source, index) => session(`comparable-rate-${index}`, 'repaso', 30, index, {
    topicId: source.id, pagesCount: 6,
  }));
  history.push(session('one-topic-outlier', 'repaso', 60, 4, { topicId: target.id, pagesCount: 6 }));
  const result = estimate(target, history, { topics, activity: 'repaso', work: { pages: 3 } });
  assert.equal(result.estimatedMinutes, 15);
  assert.equal(result.method, 'measured_page_rate');
  assert.equal(result.evidenceCount, 5);
  assert.equal(result.confidence, 'baja');
  assert.ok(result.factors.some(factor => factor.includes('3 páginas')));
  assert.ok(result.factors.some(factor => factor.includes('Evidencia insuficiente')));
});

test('unknown session amounts cannot validate an ordinal speedup from incomparable durations', () => {
  const target = topic('civil-99');
  const sources = Array.from({ length: 12 }, (_, index) => topic(`civil-${index + 2}`));
  const topics = new Map([target, ...sources].map(source => [source.id, source]));
  const history = sources.map((source, index) => session(`unmeasured-ordinal-${index}`, 'refresco', index % 2 ? 12 : 60, index, {
    topicId: source.id, refreshOrdinal: index % 2 ? 5 : 1,
  }));
  const first = estimate(target, history, { topics, activity: 'refresco', refreshOrdinal: 1 });
  const fifth = estimate(target, history, { topics, activity: 'refresco', refreshOrdinal: 5 });
  assert.equal(first.estimatedMinutes, 12);
  assert.equal(fifth.estimatedMinutes, 12);
  assert.equal(first.method, 'activity_median');
  assert.equal(first.confidence, 'baja');
  assert.ok(first.featuresUsed.includes('ordinal_evaluated'));
  assert.ok(first.factors.some(factor => factor.includes('cantidades de trabajo medidas')));
});

test('words per page help select observed comparable topics', () => {
  const sparse = topic('civil-1', 6, 5, 1200), dense = topic('civil-2', 6, 5, 6000);
  const target = topic('civil-3', 6, 5, 6000);
  const topics = new Map([sparse, dense, target].map(item => [item.id, item]));
  const history: Session[] = [];
  for (let index = 0; index < 6; index++) {
    history.push(session(`s${index}`, 'refresco', 30, index, { pagesCount: 6, topicId: sparse.id }));
    history.push(session(`d${index}`, 'refresco', 90, index, { pagesCount: 6, topicId: dense.id }));
  }
  const result = estimate(target, history, { topics, activity: 'refresco', refreshOrdinal: 1 });
  assert.equal(result.estimatedMinutes, 90);
  assert.ok(result.featuresUsed.includes('words_per_page'));
});

test('measured PLSEMA phases retain their units and missing phases remain absent', () => {
  const history = [session('phase', 'primer_estudio', 60, 0, { pagesCount: 6, plsema: { minutes: { lectura: 20 }, seconds: { memorizar: 1800 } } })];
  const result = estimate(topic(), history, { work: { pages: 3 } });
  assert.equal(result.estimatedMinutes, 30);
  assert.deepEqual(result.phaseEstimates?.lectura, { estimatedMinutes: 10, evidenceCount: 1 });
  assert.deepEqual(result.phaseEstimates?.memorizar, { estimatedMinutes: 15, evidenceCount: 1 });
  assert.equal(result.phaseEstimates?.cantar, undefined);
  assert.ok(result.featuresUsed.includes('observed_plsema'));
  assert.equal(estimate(topic(), [session('no-phases', 'primer_estudio', 60, 0, { pagesCount: 6 })], { work: { pages: 3 } }).phaseEstimates, undefined);
});

test('single outliers do not determine the estimate and intervals/effective support remain empirical', () => {
  const history = Array.from({ length: 10 }, (_, index) => session(`good${index}`, 'refresco', 60, index, { pagesCount: 6 }));
  history.push(session('huge', 'refresco', 6_000_000, 11, { pagesCount: 6 }));
  history.push(session('tiny', 'refresco', .00001, 12, { pagesCount: 6 }));
  const result = estimate(topic(), history, { activity: 'refresco' });
  assert.equal(result.estimatedMinutes, 60);
  assert.ok(result.interval!.low <= 60 && result.interval!.high >= 60);
  assert.ok(result.effectiveSampleSize < result.evidenceCount);
});

test('recent performance shifts supersede older observations with enough repeated evidence', () => {
  const history = Array.from({ length: 12 }, (_, index) => session(`old${index}`, 'refresco', 120, index, { pagesCount: 6 }));
  history.push(...Array.from({ length: 8 }, (_, index) => session(`recent${index}`, 'refresco', 60, 90 + index, { pagesCount: 6 })));
  assert.equal(estimate(topic(), history, { activity: 'refresco' }).estimatedMinutes, 60);
});

test('a recent repeated change is retained when earlier validation errors tie the baseline', () => {
  const history = Array.from({ length: 12 }, (_, index) => session(`stable-${index}`, 'refresco', 120, index, { pagesCount: 6 }));
  history.push(...Array.from({ length: 3 }, (_, index) => session(`changed-${index}`, 'refresco', 60, 90 + index, { pagesCount: 6 })));
  const result = estimate(topic(), history, { activity: 'refresco' });
  assert.equal(result.estimatedMinutes, 60);
  assert.ok(result.featuresUsed.includes('recency'));
  const beforeChange = estimate(topic(), history, { activity: 'refresco', asOf: new Date(`${date(90)}T00:00:00Z`) });
  assert.equal(beforeChange.estimatedMinutes, 120);
});

test('causal cutoff excludes future sessions, their coverage and a session evaluating itself', () => {
  const history = [session('past', 'primer_estudio', 30, 0, { startPage: 1, endPage: 3 }),
    session('future', 'primer_estudio', 3, 2, { startPage: 4, endPage: 6 })];
  const targetWithFuture = getCanonicalTopic(topic(), [topic()], {}, history);
  const result = estimate(targetWithFuture, history, { asOf: new Date(`${date(2)}T00:00:00Z`) });
  assert.equal(result.estimatedMinutes, 30);
  assert.equal(result.evidenceCount, 1);
  assert.equal(result.excludedCount, 1);
});

test('duplicate stable session IDs contribute evidence only once', () => {
  const row = session('same', 'refresco', 60, 0, { pagesCount: 6 });
  const once = estimate(topic(), [row], { activity: 'refresco' });
  const repeated = estimate(topic(), [row, { ...row }], { activity: 'refresco' });
  assert.equal(repeated.evidenceCount, 1);
  assert.equal(repeated.estimatedMinutes, once.estimatedMinutes);
  assert.equal(repeated.effectiveSampleSize, once.effectiveSampleSize);
});

test('incomplete, invalid and conflicting observations never manufacture a rate', () => {
  const invalid = [session('missing', 'primer_estudio', undefined as any, 0, { pagesCount: 6 }),
    session('infinite', 'primer_estudio', Infinity, 0, { pagesCount: 6 }),
    session('negative', 'primer_estudio', -1, 0, { pagesCount: 6 }),
    session('longer-than-day', 'primer_estudio', 1441, 0, { pagesCount: 6 }),
    session('zero', 'primer_estudio', 0, 0, { pagesCount: 6 }),
    session('conflict', 'primer_estudio', 60, 0, { startPage: 1, endPage: 3, pagesCount: 6 }),
    session('no-amount', 'primer_estudio', 60, 0, { pagesCount: 0 })];
  const result = estimate(topic(), invalid, { work: { pages: 1 } });
  assert.equal(result.estimatedMinutes, null);
  assert.equal(result.evidenceCount, 0);
  assert.equal(estimate(topic(), [], { work: { pages: -1 } }).estimatedMinutes, null);
  assert.equal(estimate(topic(), [], { work: { pages: Infinity } }).estimatedMinutes, null);
});

test('precise measured page helper unions ranges and never substitutes topic size', () => {
  assert.equal(getMeasuredSessionPages(session('none', 'repaso', 60)), null);
  assert.equal(getMeasuredSessionPages(session('zero', 'repaso', 60, 0, { pagesCount: 0 })), null);
  assert.equal(getMeasuredSessionPages(session('ranges', 'repaso', 60, 0, { pageRanges: [{ startPage: 1, endPage: 3 }, { startPage: 3, endPage: 5 }] })), 5);
  assert.equal(getMeasuredSessionPages(session('fraction', 'repaso', 60, 0, { pagesCount: 6.5 })), 6.5);
  assert.equal(getMeasuredSessionPages(session('full', 'repaso', 60, 0, { isTopicCompleted: true, totalPagesAtSession: 6 })), 6);
});

test('predictions are finite nonnegative rounded minutes and do not mutate actual records', () => {
  const original = session('immutable', 'primer_estudio', 61.75, 0, { pagesCount: 6 });
  const history = [original];
  const before = JSON.stringify(history);
  const result = estimate(topic(), history, { work: { pages: 2 } });
  assert.equal(Number.isFinite(result.estimatedMinutes), true);
  assert.equal(Number.isInteger(result.estimatedMinutes), true);
  assert.ok(result.estimatedMinutes! >= 0);
  assert.ok(Number.isFinite(result.interval?.low) && Number.isFinite(result.interval?.high));
  assert.equal(JSON.stringify(history), before);
});
