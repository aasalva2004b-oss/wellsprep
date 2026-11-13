import type { Session } from '../types';

/** Initial-study evidence only. Page intervals use zero-based, half-open offsets. */
export interface InitialStudyCoverage {
  status: 'known' | 'partial' | 'unknown' | 'conflict';
  totalPages: number | null;
  studiedPages: number | null;
  knownStudiedPages: number;
  remainingPages: number | null;
  percentage: number | null;
  pageNumbers: number[];
  intervals: Array<{ start: number; end: number }>;
  blockIds: string[];
  unlocatedStudy: boolean;
  issues: string[];
}

export function isInitialStudySession(session: Pick<Session, 'type' | 'modality'>): boolean {
  const type = String(session.type || session.modality || '').toLowerCase().trim();
  return ['primer_estudio', 'estudio_inicial', 'estudio'].includes(type);
}

function positive(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

/** Never infer page identities from anonymous counts, percentages, dates or review sessions. */
export function deriveInitialStudyCoverage(
  pages: number | null | undefined,
  sessions: readonly Session[],
  legacyProgress?: Record<string, any>,
): InitialStudyCoverage {
  const totalPages = positive(pages);
  const intervals: Array<{ start: number; end: number }> = [];
  const blockIds = new Set<string>();
  const issues = new Set<string>();
  let unlocatedStudy = false;
  let conflict = false;
  let evidenceCount = 0;
  const addRange = (first: unknown, last: unknown) => {
    const from = positive(first), to = positive(last);
    if (from === null || to === null || !Number.isInteger(from) || !Number.isInteger(to) || to < from) {
      conflict = true; issues.add('invalid_page_range'); return false;
    }
    if (totalPages !== null && to > totalPages) { conflict = true; issues.add('coverage_exceeds_topic_extent'); }
    intervals.push({ start: from - 1, end: to });
    return true;
  };
  const studySessions = sessions.filter(isInitialStudySession);
  for (const original of studySessions) {
    const session = original as Session & Record<string, any>;
    let located = false;
    let rowUnits = 0;
    const explicitPages = session.pagesNumbers ?? session.pageNumbers;
    const breakdown = Array.isArray(session.pageBreakdown) ? session.pageBreakdown : undefined;
    const pageList = explicitPages ?? breakdown?.map((item: any) => item.pageNumber ?? item.pagina);
    if (Array.isArray(pageList) && pageList.length) {
      for (const number of new Set(pageList)) {
        if (addRange(number, number)) { located = true; rowUnits++; }
      }
    } else {
      const ranges = Array.isArray(session.coverage?.ranges) ? session.coverage.ranges
        : Array.isArray(session.pageRanges) ? session.pageRanges : undefined;
      if (ranges?.length) {
        for (const range of ranges) {
          const from = range.startPage ?? range.fromPage ?? range.start;
          const to = range.endPage ?? range.toPage ?? range.end;
          if (addRange(from, to)) { located = true; rowUnits += Number(to) - Number(from) + 1; }
        }
      } else {
        const from = session.startPage ?? session.fromPage ?? session.pages?.pageStart;
        const to = session.endPage ?? session.toPage ?? session.pages?.pageEnd;
        if (from !== undefined || to !== undefined) {
          if (addRange(from, to)) { located = true; rowUnits = Number(to) - Number(from) + 1; }
        }
      }
    }
    const blocks = Array.isArray(session.studyBlocks) ? session.studyBlocks : Array.isArray(session.coverage?.blocks) ? session.coverage.blocks : [];
    for (const block of blocks) {
      if (!block || block.completed !== true || typeof block.id !== 'string' || !block.id.trim()) continue;
      blockIds.add(block.id);
      if (block.startPage !== undefined || block.endPage !== undefined) {
        if (addRange(block.startPage, block.endPage)) located = true;
      } else {
        unlocatedStudy = true; issues.add('completed_blocks_without_page_mapping');
      }
    }
    // A future full-topic declaration needs its measured extent at that moment;
    // otherwise a later metadata edit would incorrectly expand historical coverage.
    const fullExtent = positive(session.totalPagesAtSession ?? session.coverage?.totalPagesAtSession);
    if (!located && (session.isTopicCompleted === true || session.coverage?.kind === 'whole_topic') && fullExtent !== null) {
      intervals.push({ start: 0, end: fullExtent }); located = true; rowUnits = fullExtent;
      if (totalPages !== null && fullExtent > totalPages) { conflict = true; issues.add('coverage_exceeds_topic_extent'); }
    }
    const count = positive(session.pagesStudied ?? session.pagesCount);
    if (located) {
      evidenceCount++;
      if (count !== null && rowUnits > 0 && Math.abs(count - rowUnits) > 1e-8) {
        conflict = true; issues.add('page_count_disagrees_with_locations');
      }
    } else {
      unlocatedStudy = true; issues.add('initial_study_without_page_locations');
    }
  }

  // Legacy aggregate counters may describe progress, but never identify pages.
  // Do not let an aggregate override concrete, reconstructible session history.
  if (!studySessions.length && legacyProgress && (
    !!legacyProgress.firstStudyDate || Number(legacyProgress.estudioHours) > 0 || Number(legacyProgress.initialStudyPercentage) > 0 ||
    Number(legacyProgress.coveragePct) > 0 || Number(legacyProgress.completedPages) > 0 || Array.isArray(legacyProgress.completedPages) && legacyProgress.completedPages.length > 0
  )) {
    unlocatedStudy = true; issues.add('legacy_initial_progress_without_page_locations');
  }

  intervals.sort((a, b) => a.start - b.start || a.end - b.end);
  const union: InitialStudyCoverage['intervals'] = [];
  for (const interval of intervals) {
    const last = union[union.length - 1];
    if (last && interval.start <= last.end) last.end = Math.max(last.end, interval.end);
    else union.push({ ...interval });
  }
  const knownStudiedPages = union.reduce((sum, interval) => sum + interval.end - interval.start, 0);
  const pageNumbers: number[] = [];
  if (knownStudiedPages <= 10_000) {
    for (const interval of union) {
      for (let page = Math.ceil(interval.start) + 1; page <= interval.end; page++) pageNumbers.push(page);
    }
  } else {
    // Intervals still preserve exact coverage without materialising enormous page lists.
    issues.add('page_locations_retained_as_intervals');
  }
  // Fully observed coverage exhausts the extent even if earlier legacy rows were vague.
  const coversAll = totalPages !== null && union.length === 1 && union[0].start === 0 && union[0].end === totalPages;
  const exact = !conflict && (!unlocatedStudy || coversAll);
  const studiedPages = exact ? knownStudiedPages : null;
  const remainingPages = exact && totalPages !== null ? Math.max(0, totalPages - knownStudiedPages) : null;
  const status: InitialStudyCoverage['status'] = conflict ? 'conflict'
    : !exact || totalPages === null ? 'unknown'
    : evidenceCount > 0 && knownStudiedPages > 0 && remainingPages! > 0 ? 'partial' : 'known';
  return {
    status, totalPages, studiedPages, knownStudiedPages, remainingPages,
    percentage: studiedPages !== null && totalPages !== null ? studiedPages / totalPages * 100 : null,
    pageNumbers, intervals: union, blockIds: [...blockIds].sort(), unlocatedStudy, issues: [...issues],
  };
}

/** First observed day on which the current extent was completely covered.
 * Anonymous counts, reviews and task completion flags cannot supply this date.
 * Current extent is used explicitly: an old export cannot reconstruct edits to
 * a master that were never recorded as historical snapshots.
 */
export function getInitialStudyCompletionDate(pages: number, sessions: readonly Session[]): string | null {
  if (!Number.isFinite(pages) || pages <= 0) return null;
  const rows = sessions.filter(session => {
    if (!session || (session as any).mergedIntoSessionId || !isInitialStudySession(session)
      || typeof session.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(session.date)) return false;
    const parsed = new Date(`${session.date}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === session.date;
  })
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.id || '').localeCompare(String(b.id || '')));
  const seen = new Set<string>();
  const prefix: Session[] = [];
  for (const row of rows) {
    if (row.id && seen.has(row.id)) continue;
    if (row.id) seen.add(row.id);
    prefix.push(row);
    const coverage = deriveInitialStudyCoverage(pages, prefix);
    if (coverage.remainingPages === 0 && coverage.status !== 'conflict') return row.date;
  }
  return null;
}
