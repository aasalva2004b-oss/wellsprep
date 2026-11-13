import assert from 'node:assert/strict';
import test from 'node:test';
import type { Session, Topic } from '../src/types';
import { getCanonicalTopic, buildCanonicalTopicMap } from '../src/lib/canonicalTopicService';
import { syntheticTopics } from './fixtures/syntheticStudyData';

const topic: Topic = { ...syntheticTopics[0], id: 'synthetic-phase-a-6', number: 990, title: '[FICTICIO] Tema central seis páginas', pages: 6 };
const study = (id: string, extra: Record<string, unknown> = {}): Session => ({
  id, topicId: topic.id, date: '2026-10-01', type: 'primer_estudio', durationMinutes: 30,
  notes: 'FICTICIO: verificación de arquitectura.', ...extra,
});
const state = (history: Session[], metadata: Record<string, unknown> = {}) => getCanonicalTopic(topic.id, [topic], { [topic.id]: metadata } as any, history);

test('one master override supplies pages, words and difficulty without changing the official title', () => {
  const result = state([], { pages: 8, numeroPalabras: 2400, difficulty: 7, epigrafes: 5, customTitle: 'Título personal ficticio' });
  assert.equal(result.pages, 8);
  assert.equal(result.numeroPalabras, 2400);
  assert.equal(result.difficulty, 7);
  assert.equal(result.epigrafes, 5);
  assert.equal(result.officialTitle, topic.title);
  assert.equal(result.title, 'Título personal ficticio');
});

test('six pages with first study pages one through three leave exactly three initial pages', () => {
  const result = state([study('synthetic-initial', { startPage: 1, endPage: 3 })]);
  assert.equal(result.initialStudyCoverage.studiedPages, 3);
  assert.equal(result.initialStudyCoverage.remainingPages, 3);
  assert.deepEqual(result.initialStudyCoverage.pageNumbers, [1, 2, 3]);
});

test('overlapping initial ranges are a union and reviews do not become initial-study coverage', () => {
  const result = state([
    study('synthetic-initial-1', { startPage: 1, endPage: 3 }),
    study('synthetic-initial-2', { startPage: 2, endPage: 3 }),
    study('synthetic-review', { type: 'repaso', startPage: 4, endPage: 6, completesVuelta: true }),
    study('synthetic-refresh', { type: 'refresco', startPage: 1, endPage: 6 }),
    study('synthetic-cante', { type: 'canto', startPage: 1, endPage: 6, cantoGrade: 8 }),
  ]);
  assert.equal(result.initialStudyCoverage.studiedPages, 3);
  assert.equal(result.initialStudyCoverage.remainingPages, 3);
  assert.deepEqual(result.initialStudyCoverage.pageNumbers, [1, 2, 3]);
});

test('unlocated historical counts and percentages never manufacture page identities', () => {
  const counts = state([study('synthetic-count-1', { pagesCount: 3 }), study('synthetic-count-2', { pagesCount: 3 })]);
  assert.equal(counts.initialStudyCoverage.remainingPages, null);
  assert.deepEqual(counts.initialStudyCoverage.pageNumbers, []);
  const percent = state([], { firstStudyDate: '2026-10-01', coveragePct: 50 });
  assert.equal(percent.initialStudyCoverage.remainingPages, null);
  assert.deepEqual(percent.initialStudyCoverage.pageNumbers, []);
});

test('known page coverage updates on a master change without changing historical records', () => {
  const history = [study('synthetic-initial', { startPage: 1, endPage: 3 })];
  const snapshot = JSON.stringify(history);
  assert.equal(state(history, { pages: 6 }).initialStudyCoverage.remainingPages, 3);
  assert.equal(state(history, { pages: 8 }).initialStudyCoverage.remainingPages, 5);
  assert.equal(JSON.stringify(history), snapshot);
});

test('stable session IDs deduplicate transport replay without hiding distinct observations', () => {
  const a = study('synthetic-stable', { startPage: 1, endPage: 3 });
  const result = state([a, { ...a }, { ...a, id: 'synthetic-independent-observation' }]);
  assert.equal(result.sessions.length, 2);
  assert.equal(result.initialStudySessions.length, 2);
  assert.equal(result.totalStudyMinutes, 60);
});

test('derived history wins over stale caches and separates last review from last contact', () => {
  const history = [
    study('synthetic-initial', { startPage: 1, endPage: 3, completesVuelta: true }),
    study('synthetic-review', { date: '2026-10-02', type: 'repaso', completesVuelta: true }),
    study('synthetic-refresh', { date: '2026-10-03', type: 'refresco' }),
    study('synthetic-cante', { date: '2026-10-04', type: 'canto', durationMinutes: 12, cantoSeconds: 30, completesVuelta: false }),
  ];
  const result = state(history, { vueltas: 999, reviewCount: 999, studyTimeHours: 999, lastReviewDate: '2026-12-31' });
  assert.equal(result.vueltas, 1);
  assert.equal(result.reviewCount, 1);
  assert.equal(result.lastReviewDate, '2026-10-02');
  assert.equal(result.lastContactDate, '2026-10-04');
  assert.equal(result.totalStudyMinutes, 102.5);
  assert.ok(result.conflicts.length > 0, 'Cached conflicts should remain observable.');
});

test('legacy summaries remain compatible when no historical records are available', () => {
  const result = state([], { pages: 6, studyTimeHours: 2, vueltas: 3, reviewCount: 4, firstStudyDate: '2026-10-01' });
  assert.equal(result.vueltas, 3);
  assert.equal(result.reviewCount, 4);
  assert.equal(result.totalStudyMinutes, 120);
  assert.equal(result.initialStudyCoverage.remainingPages, null);
});

test('unknown master volume remains unknown rather than becoming fifteen pages', () => {
  const source = { ...topic, pages: 0 };
  const result = getCanonicalTopic(source.id, [source], {}, []);
  assert.equal(result.pages, 0);
  assert.equal(result.hasExplicitPages, false);
  assert.equal(result.initialStudyCoverage.remainingPages, null);
});

test('catalogue and custom topic maps expose the same selected master data', () => {
  const overrides = { [topic.id]: { pages: 9, numeroPalabras: 3000, difficulty: 8 } } as any;
  const map = buildCanonicalTopicMap([topic], overrides, []);
  const selected = getCanonicalTopic(topic.id, [topic], overrides, []);
  assert.equal(map.get(topic.id)?.pages, selected.pages);
  assert.equal(map.get(topic.id)?.numeroPalabras, selected.numeroPalabras);
  assert.equal(map.get(topic.id)?.difficulty, selected.difficulty);
});
