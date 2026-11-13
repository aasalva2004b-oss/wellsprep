import assert from 'node:assert/strict';
import test from 'node:test';
import type { Session, Topic } from '../src/types';
import { buildCanonicalTopicMap, getCanonicalTopic, getSessionCategory, sessionDurationMinutes } from '../src/lib/canonicalTopicService';
import { deriveInitialStudyCoverage } from '../src/lib/topicCoverage';

const topic: Topic = {
  id: 'civil-999', subjectId: 'civil', number: 999, title: 'Synthetic official title', pages: 6, difficulty: 5,
  tiempoEstudioHoras: 0, fechaPrimerEstudio: '', fechasRepasos: [], mejorTiempoCantoMinutos: 0,
  mejorTiempoCantoSegundos: 0, notas: '',
};
const session = (extra: Partial<Session> & Record<string, any> = {}): Session => ({
  id: 'synthetic-observation', topicId: topic.id, date: '2026-10-01', type: 'estudio_inicial', durationMinutes: 30, notes: '', ...extra,
});
const state = (rows: Session[], progress: Record<string, any> = {}) => getCanonicalTopic(topic.id, [topic], { [topic.id]: progress } as any, rows);

test('initial study uses a union of page identities rather than summed ranges or review coverage', () => {
  const coverage = state([
    session({ startPage: 1, endPage: 3 }),
    session({ id: 'synthetic-overlap', startPage: 3, endPage: 4 }),
    session({ id: 'synthetic-repeat', type: 'repaso', startPage: 1, endPage: 6 }),
    session({ id: 'synthetic-refresh', type: 'refresco', startPage: 1, endPage: 6 }),
  ]).initialStudyCoverage;
  assert.equal(coverage.status, 'partial');
  assert.deepEqual(coverage.pageNumbers, [1, 2, 3, 4]);
  assert.equal(coverage.studiedPages, 4);
  assert.equal(coverage.remainingPages, 2);
});

test('unlocated initial counts and legacy percentages keep remaining pages uncertain', () => {
  const rows = [session({ pagesCount: 3 }), session({ id: 'synthetic-unlocated-second', pagesCount: 3 })];
  const coverage = state(rows).initialStudyCoverage;
  assert.equal(coverage.status, 'unknown');
  assert.equal(coverage.remainingPages, null);
  assert.deepEqual(coverage.pageNumbers, []);
  const legacy = state([], { coveragePct: 50, completedPages: 3 });
  assert.equal(legacy.initialStudyCoverage.studiedPages, null);
  assert.deepEqual(legacy.initialStudyCoverage.pageNumbers, []);
});

test('blocks without mapped pages preserve block identity without fabricated page locations', () => {
  const coverage = state([session({ studyBlocks: [{ id: 'synthetic-block-A', completed: true }, { id: 'synthetic-block-A', completed: true }] })]).initialStudyCoverage;
  assert.deepEqual(coverage.blockIds, ['synthetic-block-A']);
  assert.equal(coverage.remainingPages, null);
  assert.deepEqual(coverage.pageNumbers, []);
});

test('metadata edits recalculate pending extent without rewriting past coverage', () => {
  const rows = [session({ startPage: 1, endPage: 3 })];
  const original = JSON.stringify(rows);
  assert.equal(state(rows, { pages: 6 }).initialStudyCoverage.remainingPages, 3);
  assert.equal(state(rows, { pages: 8 }).initialStudyCoverage.remainingPages, 5);
  assert.equal(state(rows, { pages: 2 }).initialStudyCoverage.status, 'conflict');
  assert.equal(JSON.stringify(rows), original);
});

test('full-topic coverage declaration needs its measured historical extent', () => {
  const vague = state([session({ isTopicCompleted: true })]);
  assert.equal(vague.initialStudyCoverage.remainingPages, null);
  const measured = state([session({ isTopicCompleted: true, totalPagesAtSession: 6 })], { pages: 8 });
  assert.equal(measured.initialStudyCoverage.studiedPages, 6);
  assert.equal(measured.initialStudyCoverage.remainingPages, 2);
});

test('different stable IDs preserve legitimate equal-valued sessions and duplicate delivery is collapsed', () => {
  const one = session({ type: 'repaso', completesVuelta: true });
  const two = { ...one, id: 'synthetic-independent' };
  const result = state([one, { ...one }, two]);
  assert.equal(result.sessions.length, 2);
  assert.equal(result.reviewCount, 2);
  assert.equal(result.vueltas, 2);
  assert.equal(result.totalRecordedMinutes, 60);
});

test('conflicting delivery of a stable ID is deterministic and explicitly flagged', () => {
  const one = session({ durationMinutes: 20 });
  const conflict = { ...one, durationMinutes: 30 };
  const forward = state([one, conflict]);
  const reverse = state([conflict, one]);
  assert.equal(forward.totalRecordedMinutes, reverse.totalRecordedMinutes);
  assert.ok(forward.conflicts.includes('conflicting_session_delivery'));
});

test('cached aggregates cannot override actual sessions and activity dates have separate meanings', () => {
  const result = state([
    session({ completesVuelta: true }),
    session({ id: 'synthetic-review', type: 'repaso', date: '2026-10-02', completesVuelta: true }),
    session({ id: 'synthetic-refresh', type: 'refresco', date: '2026-10-03', completesVuelta: true }),
  ], { studyTimeHours: 999, vueltas: 999, reviewCount: 999, firstStudyDate: '2020-01-01', lastReviewDate: '2030-01-01' });
  assert.equal(result.vueltas, 1);
  assert.equal(result.reviewCount, 1);
  assert.equal(result.firstStudyDate, '2026-10-01');
  assert.equal(result.lastReviewDate, '2026-10-02');
  assert.equal(result.lastContactDate, '2026-10-03');
  assert.equal(result.totalRecordedMinutes, 90);
  assert.ok(result.conflicts.includes('initial_or_refresh_session_marked_as_vuelta'));
});

test('after deleting the last authoritative session, legacy aggregates never resurrect history', () => {
  const result = state([], { historyVersion: 3, studyTimeHours: 999, vueltas: 99, firstStudyDate: '2020-01-01', lastReviewDate: '2020-02-01' });
  assert.equal(result.totalRecordedMinutes, 0);
  assert.equal(result.vueltas, 0);
  assert.equal(result.hasStarted, false);
  assert.equal(result.firstStudyDate, undefined);
  assert.equal(result.lastReviewDate, undefined);
  assert.equal(result.initialStudyCoverage.studiedPages, 0);
  assert.equal(result.initialStudyCoverage.remainingPages, 6);
});

test('legacy-only summaries remain available with explicit provenance and unknown coverage', () => {
  const result = state([], { studyTimeHours: 2, vueltas: 4, firstStudyDate: '2026-10-01' });
  assert.equal(result.totalRecordedMinutes, 120);
  assert.equal(result.vueltas, 4);
  assert.equal(result.provenance.totals, 'legacy_aggregate');
  assert.equal(result.initialStudyCoverage.remainingPages, null);
});

test('master zero clears measured extent without resurrecting catalogue defaults', () => {
  const result = state([], { pages: 0, numeroPalabras: 0, difficulty: 0, customTitle: 'Synthetic personal title' });
  assert.equal(result.pages, 0);
  assert.equal(result.hasExplicitPages, false);
  assert.equal(result.initialStudyCoverage.remainingPages, null);
  assert.equal(result.title, 'Synthetic personal title');
  assert.equal(result.officialTitle, topic.title);
  assert.equal(result.hasExplicitDifficulty, false);
});

test('elapsed time preserves explicit minute units and oral seconds', () => {
  const oral = session({ type: 'canto', durationMinutes: 12, cantoSeconds: 30, cantoGrade: 8 });
  const result = state([oral]);
  assert.equal(result.totalCantoMinutes, 12.5);
  assert.equal(result.totalRecordedMinutes, 12.5);
  assert.equal(result.lastCantoSeconds, 750);
  assert.equal(sessionDurationMinutes({ ...oral, durationMinutes: 90, cantoSeconds: 0 }), 90);
  assert.equal(getSessionCategory(session({ type: 'primer_estudio' })), 'initial_study');
});

test('page lists are unioned and fractional total extent remains representable', () => {
  const coverage = deriveInitialStudyCoverage(6.5, [session({ pagesNumbers: [1, 2, 3, 3] }), session({ id: 'synthetic-later', startPage: 3, endPage: 6 })]);
  assert.equal(coverage.studiedPages, 6);
  assert.equal(coverage.remainingPages, .5);
});

test('map construction exposes the same canonical objects for catalogue and custom topics', () => {
  const custom = { topicId: 'synthetic-custom', customTitle: 'Synthetic custom', subjectId: 'civil', pages: 9, numeroPalabras: 999 };
  const map = buildCanonicalTopicMap([topic], { [custom.topicId]: custom } as any, []);
  assert.equal(map.get(custom.topicId)?.pages, 9);
  assert.equal(map.get(custom.topicId)?.title, custom.customTitle);
  assert.equal(map.get(topic.id)?.officialTitle, topic.title);
});
