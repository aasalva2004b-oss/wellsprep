import type { Session } from '../types';
import { getSessionCategory, type CanonicalTopic } from './canonicalTopicService';
import { sessionMatchesTopic } from './cantoUtils';
import { deriveInitialStudyCoverage } from './topicCoverage';
import { extractSessionTelemetry } from './sessionTelemetry';
import { selectSessionVersions } from './sessionVersions';

export type EstimatedActivity = 'estudio_nuevo' | 'refresco' | 'repaso' | 'cante';
export interface EstimationWork {
  pages?: number;
  pageNumbers?: number[];
  fromPage?: number;
  toPage?: number;
}
export interface PersonalizedEstimationRequest {
  topic: CanonicalTopic;
  activity: EstimatedActivity;
  history: readonly Session[];
  topics: ReadonlyMap<string, CanonicalTopic>;
  /** Only events strictly before this instant are available to the model. */
  asOf?: Date;
  work?: EstimationWork;
  reviewOrdinal?: number;
  refreshOrdinal?: number;
}
export interface PersonalizedDurationEstimate {
  estimatedMinutes: number | null;
  /** Unrounded learned rate; a rounded zero-minute display is never a zero pace. */
  estimatedMinutesPerPage?: number;
  /** Empirical plausible range, not a calibrated probability guarantee. */
  interval: { low: number; high: number } | null;
  confidence: 'alta' | 'media' | 'baja' | 'sin_datos';
  evidenceCount: number;
  effectiveSampleSize: number;
  factors: string[];
  modelVersion: string;
  method: 'no_evidence' | 'unknown_work' | 'completed' | 'measured_page_rate' | 'topic_duration' | 'oral_duration' | 'activity_median';
  featuresUsed: string[];
  /** Relevant records rejected for dates, units, coverage, duplication or duration. */
  excludedCount: number;
  /** Only measured phases are returned; absence never means zero minutes. */
  phaseEstimates?: Partial<Record<string, { estimatedMinutes: number; evidenceCount: number }>>;
}

export const PERSONALIZED_ESTIMATOR_VERSION = 'empirical-local-median-v6';
const day = 86_400_000;
const maxSessionMinutes = 24 * 60;
type Raw = Record<string, any>;
type Feature = 'difficulty' | 'words_per_page' | 'extent' | 'ordinal' | 'vueltas' | 'gap_days' | 'days_since_initial';
interface Observation {
  id: string;
  topicId: string;
  time: number;
  minutes: number;
  pages: number | null;
  features: Partial<Record<Feature, number>>;
  phaseMinutes: Partial<Record<string, number>>;
}
interface WeightedValue { value: number; weight: number }

function nonnegative(value: unknown): number | null {
  if ((typeof value !== 'number' && typeof value !== 'string') || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}
function positive(value: unknown): number | null {
  const number = nonnegative(value);
  return number !== null && number > 0 ? number : null;
}
function instant(value: any): number | null {
  let number: number;
  if (value instanceof Date) number = value.getTime();
  else if (typeof value?.toMillis === 'function') number = value.toMillis();
  else if (typeof value?.seconds === 'number') number = value.seconds * 1000 + Number(value.nanoseconds || 0) / 1e6;
  else if (typeof value === 'number') number = value;
  else number = typeof value === 'string' && value ? Date.parse(value) : NaN;
  return Number.isFinite(number) ? number : null;
}
function eventTime(session: Session): number | null {
  if (!session || typeof session !== 'object') return null;
  const raw = session as Session & Raw;
  const date = instant(raw.date);
  if (date === null) return null;
  // Explicit event clocks also handle a local civil date across UTC midnight.
  // A known result is unavailable while its session has not ended.
  const started = instant(raw.startedAt);
  const ended = instant(raw.endedAt);
  if (started !== null || ended !== null) return Math.max(started ?? -Infinity, ended ?? -Infinity);
  // Created-at describes ingestion, not necessarily study. Use its clock only
  // when it agrees with the recorded study day; never move an old import ahead.
  const created = instant(raw.createdAt);
  const localCreatedDay = created === null ? null : [new Date(created).getFullYear(), String(new Date(created).getMonth()+1).padStart(2,'0'), String(new Date(created).getDate()).padStart(2,'0')].join('-');
  return created !== null && (Math.floor(created / day) === Math.floor(date / day) || localCreatedDay === raw.date) ? created : date;
}
function activityOf(session: Session): EstimatedActivity | null {
  if (!session || typeof session !== 'object') return null;
  const category = getSessionCategory(session);
  return category === 'initial_study' ? 'estudio_nuevo' : category === 'refresh' ? 'refresco'
    : category === 'review' ? 'repaso' : category === 'cante' ? 'cante' : null;
}
function measuredMinutes(session: Session, activity: EstimatedActivity): number | null {
  const raw = session as Session & Raw;
  // An explicitly labelled minute field is never interpreted as hours/seconds.
  const minutes = nonnegative(raw.durationMinutes);
  if (activity !== 'cante') return minutes !== null && minutes > 0 && minutes <= maxSessionMinutes ? minutes : null;
  const seconds = nonnegative(raw.cantoSeconds);
  if (minutes === null && seconds === null) return null;
  const total = (minutes ?? 0) + (seconds ?? 0) / 60;
  return Number.isFinite(total) && total > 0 && total <= maxSessionMinutes ? total : null;
}

/** Observed amount of work only. In particular NO topic-size legacy fallback. */
export function getMeasuredSessionPages(session: Session): number | null {
  if (!session || typeof session !== 'object') return null;
  const raw = session as Session & Raw;
  const ranges: Array<{ start: number; end: number }> = [];
  let invalid = false;
  const addRange = (first: unknown, last: unknown) => {
    const from = positive(first), to = positive(last);
    if (from === null || to === null || !Number.isSafeInteger(from) || !Number.isSafeInteger(to) || to < from) { invalid = true; return; }
    ranges.push({ start: from, end: to + 1 });
  };
  const list = raw.pagesNumbers ?? raw.pageNumbers ?? (Array.isArray(raw.pageBreakdown) ? raw.pageBreakdown.map((page: Raw) => page.pageNumber ?? page.pagina) : undefined);
  if (Array.isArray(list) && list.length) list.forEach((page: unknown) => addRange(page, page));
  else {
    const measuredRanges = raw.pageRanges ?? raw.coverage?.ranges;
    if (Array.isArray(measuredRanges) && measuredRanges.length) measuredRanges.forEach((range: Raw) => addRange(range.startPage ?? range.fromPage ?? range.start, range.endPage ?? range.toPage ?? range.end));
    else {
      const from = raw.startPage ?? raw.fromPage ?? raw.pages?.pageStart;
      const to = raw.endPage ?? raw.toPage ?? raw.pages?.pageEnd;
      if (from !== undefined || to !== undefined) addRange(from, to);
    }
  }
  const counts = ([raw.pagesStudied, raw.pagesCount] as unknown[]).filter(value => value !== undefined && value !== null && value !== '').map(positive);
  // Zero is an unknown sentinel in older records, never a measured page count.
  const actualCounts = counts.filter((count): count is number => count !== null);
  if (actualCounts.length > 1 && Math.abs(actualCounts[0] - actualCounts[1]) > 1e-8) invalid = true;
  if (invalid) return null;
  if (ranges.length) {
    ranges.sort((a, b) => a.start - b.start || a.end - b.end);
    let units = 0, end = -Infinity;
    for (const range of ranges) {
      units += Math.max(0, range.end - Math.max(end, range.start));
      end = Math.max(end, range.end);
    }
    if (actualCounts.some(count => Math.abs(count - units) > 1e-8)) return null;
    const recordedExtent = positive(raw.totalPagesAtSession ?? raw.coverage?.totalPagesAtSession);
    if (recordedExtent !== null && end - 1 > recordedExtent) return null;
    return units > 0 && Number.isFinite(units) ? units : null;
  }
  if (actualCounts.length) {
    const recordedExtent = positive(raw.totalPagesAtSession ?? raw.coverage?.totalPagesAtSession);
    return recordedExtent !== null && actualCounts[0] > recordedExtent ? null : actualCounts[0];
  }
  if (raw.isTopicCompleted === true || raw.coverage?.kind === 'whole_topic') return positive(raw.totalPagesAtSession ?? raw.coverage?.totalPagesAtSession);
  return null;
}
function measuredPhases(session: Session): Partial<Record<string, number>> {
  const telemetry = extractSessionTelemetry(session);
  const phases: Partial<Record<string, number>> = {};
  if (telemetry.plsema) {
    for (const phase of telemetry.plsema.observedPhases) phases[phase] = telemetry.plsema.minutes[phase];
  }
  return phases;
}
function topicFor(session: Session, topics: ReadonlyMap<string, CanonicalTopic>): CanonicalTopic | undefined {
  const direct = topics.get(session.topicId);
  if (direct && sessionMatchesTopic(session, direct)) return direct;
  const matches = [...topics.values()].filter(topic => sessionMatchesTopic(session, topic));
  return matches.length === 1 ? matches[0] : undefined;
}
function quantile(values: WeightedValue[], probability: number): number {
  const sorted = values.filter(item => item.weight > 0 && Number.isFinite(item.value)).sort((a, b) => a.value - b.value);
  if (!sorted.length) return NaN;
  const total = sorted.reduce((sum, item) => sum + item.weight, 0);
  const cutoff = Math.max(0, Math.min(1, probability)) * total;
  let accumulated = 0;
  for (const item of sorted) {
    accumulated += item.weight;
    if (accumulated >= cutoff) return item.value;
  }
  return sorted[sorted.length - 1].value;
}
function median(values: number[]): number { return quantile(values.map(value => ({ value, weight: 1 })), .5); }
function scaleOf(values: number[]): number {
  if (values.length < 4) return 0;
  // IQR works without claiming that an unobserved numeric default is measured.
  return quantile(values.map(value => ({ value, weight: 1 })), .75) - quantile(values.map(value => ({ value, weight: 1 })), .25);
}
// Whole-minute planning resolution: positive work must never become a free task.
// The unrounded learned page rate remains available separately.
function roundMinutes(value: number): number { return value > 0 ? Math.max(1, Math.round(value)) : 0; }
function unknown(method: 'no_evidence' | 'unknown_work', excludedCount: number, factors: string[]): PersonalizedDurationEstimate {
  return { estimatedMinutes: null, interval: null, confidence: 'sin_datos', evidenceCount: 0, effectiveSampleSize: 0,
    factors, modelVersion: PERSONALIZED_ESTIMATOR_VERSION, method, featuresUsed: [], excludedCount };
}

/**
 * Independent activity models. Robust empirical medians are localised using
 * observed feature variation; no fixed difficulty/round/retention multiplier.
 * The function is pure: it neither persists predictions nor changes observations.
 */
function estimateLocalDuration(request: PersonalizedEstimationRequest): PersonalizedDurationEstimate {
  const { topic, activity } = request;
  const cutoff = request.asOf?.getTime() ?? Date.now();
  if (!Number.isFinite(cutoff)) return unknown('no_evidence', 0, ['Fecha de predicción no válida.']);
  const topics = new Map(request.topics); topics.set(topic.id, topic);
  const known = selectSessionVersions(request.history, new Date(cutoff));
  let excludedCount = Math.max(0, request.history.filter(session => activityOf(session) === activity).length
    - known.filter(session => !(session as Session & Raw).mergedIntoSessionId && activityOf(session) === activity).length);
  const events: Array<{ session: Session; time: number }> = [];
  for (const session of known) {
    if ((session as Session & Raw).mergedIntoSessionId) continue;
    const relevant = activityOf(session) === activity;
    const time = eventTime(session);
    if (time === null || time >= cutoff) { if (relevant) excludedCount++; continue; }
    events.push({ session, time });
  }
  events.sort((a, b) => a.time - b.time || String(a.session.id || '').localeCompare(String(b.session.id || '')));
  const observations: Observation[] = [];
  const counters = new Map<string, { review: number; refresh: number; vueltas: number; last?: number; initial?: number }>();
  const topicHistory: Session[] = [];
  for (const { session, time } of events) {
    const source = topicFor(session, topics);
    if (!source) { if (activityOf(session) === activity) excludedCount++; continue; }
    if (source.id === topic.id) topicHistory.push(session);
    const previous = counters.get(source.id) ?? { review: 0, refresh: 0, vueltas: 0 };
    const kind = activityOf(session);
    if (kind === activity) {
      const minutes = measuredMinutes(session, activity);
      if (minutes === null) excludedCount++;
      else {
        const raw = session as Session & Raw;
        const features: Observation['features'] = {};
        const difficulty = positive(raw.dificultadReal ?? raw.difficulty) ?? (source.hasExplicitDifficulty ? source.difficulty : null);
        if (difficulty !== null && difficulty <= 10) features.difficulty = difficulty;
        const extent = positive(raw.totalPagesAtSession) ?? (source.hasExplicitPages ? positive(source.pages) : null);
        const words = positive(raw.totalWordsAtSession ?? raw.wordsAtSession) ?? (source.hasExplicitWords ? positive(source.numeroPalabras) : null);
        if (extent !== null) features.extent = Math.log(extent);
        if (words !== null && extent !== null) features.words_per_page = Math.log(words / extent);
        if (activity === 'repaso') features.ordinal = Math.log(positive(raw.reviewOrdinal ?? raw.reviewNumber) ?? previous.review + 1);
        if (activity === 'refresco') features.ordinal = Math.log(positive(raw.refreshOrdinal ?? raw.refreshNumber) ?? previous.refresh + 1);
        if (previous.vueltas > 0) features.vueltas = Math.log1p(previous.vueltas);
        if (previous.last !== undefined) features.gap_days = Math.log1p(Math.max(0, (time - previous.last) / day));
        if (previous.initial !== undefined) features.days_since_initial = Math.log1p(Math.max(0, (time - previous.initial) / day));
        observations.push({ id: session.id, topicId: source.id, time, minutes, pages: getMeasuredSessionPages(session), features, phaseMinutes: measuredPhases(session) });
      }
    }
    const raw = session as Session & Raw;
    if (kind === 'repaso') previous.review = Math.max(previous.review + 1, positive(raw.reviewOrdinal ?? raw.reviewNumber) ?? 0);
    if (kind === 'refresco') previous.refresh = Math.max(previous.refresh + 1, positive(raw.refreshOrdinal ?? raw.refreshNumber) ?? 0);
    if ((kind === 'repaso' || kind === 'cante') && session.completesVuelta === true) previous.vueltas++;
    if (kind === 'estudio_nuevo' && previous.initial === undefined) previous.initial = time;
    previous.last = time;
    counters.set(source.id, previous);
  }

  let requestedPages: number | null = null;
  let completedEstimate: PersonalizedDurationEstimate | null = null;
  const initialCoverage = activity === 'estudio_nuevo' ? (request.asOf
    ? deriveInitialStudyCoverage(topic.hasExplicitPages ? topic.pages : null, topicHistory, topic.historyIsAuthoritative ? undefined : topic.legacyProgress)
    : topic.initialStudyCoverage) : null;
  if (activity !== 'cante') {
    if (request.work !== undefined) {
      const work = request.work;
      // Reuse exactly the historical coverage validator for explicit task work.
      const explicit = { pagesNumbers: work.pageNumbers, startPage: work.fromPage, endPage: work.toPage, pagesCount: work.pages, totalPagesAtSession: topic.hasExplicitPages ? topic.pages : undefined };
      requestedPages = getMeasuredSessionPages(explicit as unknown as Session);
      if (work.pages === 0 && !work.pageNumbers?.length && work.fromPage === undefined && work.toPage === undefined) requestedPages = 0;
      if (requestedPages === null || (topic.hasExplicitPages && requestedPages > topic.pages)) return unknown('unknown_work', excludedCount, ['La cantidad de trabajo solicitada no es válida o no está medida.']);
      if (activity === 'estudio_nuevo' && initialCoverage) {
        // Named work already studied is not new work. Counts alone cannot tell
        // which pages were selected, so do not invent their intersection.
        const namedRanges: Array<{ start: number; end: number }> = [];
        if (work.pageNumbers?.length) {
          for (const page of new Set(work.pageNumbers)) namedRanges.push({ start: page - 1, end: page });
        } else if (work.fromPage !== undefined && work.toPage !== undefined) namedRanges.push({ start: work.fromPage - 1, end: work.toPage });
        if (namedRanges.length) {
          let overlap = 0;
          for (const selected of namedRanges) for (const studied of initialCoverage.intervals) {
            overlap += Math.max(0, Math.min(selected.end, studied.end) - Math.max(selected.start, studied.start));
          }
          requestedPages = Math.max(0, requestedPages - overlap);
        } else if (initialCoverage.remainingPages !== null) requestedPages = Math.min(requestedPages, initialCoverage.remainingPages);
      }
    } else if (activity === 'estudio_nuevo') {
      // A historical cutoff must not read future completion from the current view.
      requestedPages = initialCoverage!.remainingPages;
      if (requestedPages === null) return unknown('unknown_work', excludedCount, ['No se pueden reconstruir las páginas pendientes; indica el trabajo real sin inventar rangos históricos.']);
    } else requestedPages = topic.hasExplicitPages ? positive(topic.pages) : null;
    if (requestedPages === 0) completedEstimate = { estimatedMinutes: 0, interval: { low: 0, high: 0 }, confidence: 'alta', evidenceCount: 0, effectiveSampleSize: 0,
      factors: ['No quedan páginas de estudio inicial pendientes.'], modelVersion: PERSONALIZED_ESTIMATOR_VERSION, method: 'completed', featuresUsed: ['remaining_pages'], excludedCount };
  }

  let method: PersonalizedDurationEstimate['method'];
  let samples: Observation[];
  if (activity === 'cante') { method = 'oral_duration'; samples = observations; }
  else {
    const measured = observations.filter(sample => sample.pages !== null);
    if (requestedPages !== null && measured.length) { method = 'measured_page_rate'; samples = measured; }
    else {
      // Legacy durations are empirical whole-session observations, not page rates.
      // They can inform a full-topic refresh/review, with low confidence and an
      // explicit warning that historical coverage was not recorded.
      const fullTask = request.work === undefined || requestedPages === topic.pages;
      samples = activity !== 'estudio_nuevo' && fullTask ? observations.filter(sample => sample.topicId === topic.id) : [];
      method = 'topic_duration';
    }
  }
  excludedCount += observations.length - samples.length;
  if (!samples.length) return completedEstimate || unknown('no_evidence', excludedCount, ['No hay sesiones comparables con duración y cantidad de trabajo observadas para esta actividad.']);
  const target: Partial<Record<Feature, number>> = {};
  if (topic.hasExplicitDifficulty) target.difficulty = topic.difficulty;
  if (topic.hasExplicitPages && topic.pages > 0) target.extent = Math.log(topic.pages);
  if (topic.hasExplicitWords && topic.hasExplicitPages && positive(topic.numeroPalabras) !== null && topic.pages > 0) target.words_per_page = Math.log(topic.numeroPalabras! / topic.pages);
  const previous = counters.get(topic.id);
  if (activity === 'repaso') target.ordinal = Math.log(positive(request.reviewOrdinal) ?? (previous?.review ?? 0) + 1);
  if (activity === 'refresco') target.ordinal = Math.log(positive(request.refreshOrdinal) ?? (previous?.refresh ?? 0) + 1);
  if (previous?.vueltas) target.vueltas = Math.log1p(previous.vueltas);
  if (previous?.last !== undefined) target.gap_days = Math.log1p(Math.max(0, (cutoff - previous.last) / day));
  if (previous?.initial !== undefined) target.days_since_initial = Math.log1p(Math.max(0, (cutoff - previous.initial) / day));

  const featureScales = new Map<Feature, number>();
  const possible: Feature[] = ['difficulty', 'words_per_page', 'ordinal', 'vueltas', 'gap_days', 'days_since_initial'];
  if (method === 'oral_duration') possible.push('extent');
  for (const feature of possible) {
    if (target[feature] === undefined) continue;
    const values = samples.map(sample => sample.features[feature]).filter((value): value is number => value !== undefined);
    const scale = scaleOf(values);
    // With too little variation we explicitly decline to invent an effect.
    if (values.length >= 4 && scale > 1e-8) featureScales.set(feature, scale);
  }
  // Recent samples have a data-relative half-life of one quarter of the observed
  // history span. No duration is fabricated and old evidence retains nonzero weight.
  const first = samples[0].time, last = samples[samples.length - 1].time;
  const halfLife = Math.max(day, (last - first) / 4);
  const rawValues = samples.map(sample => method === 'measured_page_rate' ? sample.minutes / sample.pages! : sample.minutes);
  const logs = rawValues.map(value => Math.log(value));
  const center = median(logs);
  const mad = median(logs.map(value => Math.abs(value - center)));
  const iqr = scaleOf(logs);
  const robustScale = Math.max(mad * 1.4826, iqr / 1.349);
  const weighted: WeightedValue[] = samples.map((sample, index) => {
    let weight = Math.pow(.5, (last - sample.time) / halfLife);
    let distances = 0, dimensions = 0;
    for (const [feature, scale] of featureScales) {
      const value = sample.features[feature];
      if (value === undefined) continue;
      distances += Math.pow((value - target[feature]!) / scale, 2); dimensions++;
    }
    if (dimensions) weight *= 1 / (1 + distances);
    // Same-topic evidence is progressively preferred, but remains pooled with
    // comparables until enough observations exist. This is a statistical weight,
    // never a fixed duration or difficulty multiplier.
    if (sample.topicId === topic.id) weight *= 1 + Math.sqrt(samples.filter(row => row.topicId === topic.id).length);
    const distance = Math.abs(logs[index] - center);
    if (samples.length >= 5) {
      const bound = robustScale > 1e-8 ? 3 * robustScale : Math.log(2);
      if (distance > bound) weight *= Math.pow(bound / distance, 2);
    }
    return { value: rawValues[index], weight };
  });
  const sum = weighted.reduce((total, item) => total + item.weight, 0);
  const squared = weighted.reduce((total, item) => total + item.weight * item.weight, 0);
  const effectiveSampleSize = squared > 0 ? sum * sum / squared : 0;
  const predictedUnit = quantile(weighted, .5);
  if (completedEstimate) return { ...completedEstimate,
    ...(method === 'measured_page_rate' ? { estimatedMinutesPerPage: predictedUnit } : {}),
    evidenceCount: samples.length, effectiveSampleSize: Math.round(effectiveSampleSize * 10) / 10 };
  const multiplier = method === 'measured_page_rate' ? requestedPages! : 1;
  const rawPrediction = predictedUnit * multiplier;
  if (!Number.isFinite(rawPrediction) || rawPrediction < 0) return unknown('no_evidence', excludedCount + samples.length, ['Las mediciones no permiten un resultado finito.']);
  const lowUnit = quantile(weighted, .1), highUnit = quantile(weighted, .9);
  // Statistical sampling uncertainty broadens a sparse/identical empirical range.
  // Bounds are descriptive; calibration is measured separately by temporal tests.
  const uncertainty = Math.exp(1 / Math.sqrt(Math.max(1, effectiveSampleSize)));
  const low = Math.min(rawPrediction, lowUnit * multiplier / uncertainty);
  const high = Math.max(rawPrediction, highUnit * multiplier * uncertainty);
  const confidence: PersonalizedDurationEstimate['confidence'] = method === 'topic_duration' ? 'baja'
    : effectiveSampleSize >= 12 && high / Math.max(low, Number.MIN_VALUE) < 3 ? 'alta'
    : effectiveSampleSize >= 4 ? 'media' : 'baja';
  const featuresUsed = [method === 'measured_page_rate' ? 'measured_pages' : 'measured_duration', ...featureScales.keys(), 'recency'];
  if (samples.some(sample => sample.topicId === topic.id)) featuresUsed.push('topic_history');
  const factors = [
    `${samples.length} sesiones de ${activity} observadas; evidencia efectiva ${Math.round(effectiveSampleSize * 10) / 10}.`,
    method === 'measured_page_rate' ? `${requestedPages} páginas de trabajo; ritmo aprendido sólo de páginas medidas.`
      : method === 'oral_duration' ? 'Duraciones orales en minutos y segundos; sin equipararlas al estudio.'
      : 'Duraciones anteriores del mismo tema; cobertura histórica sin medir, confianza baja.',
    'Mediana robusta con mayor peso para el rendimiento reciente y los temas comparables.',
  ];
  if (featureScales.size) factors.push(`Variables con variación observada: ${[...featureScales.keys()].join(', ')}; sin multiplicadores fijos.`);
  const phaseEstimates: PersonalizedDurationEstimate['phaseEstimates'] = {};
  if (method === 'measured_page_rate') {
    const phases = new Set(samples.flatMap(sample => Object.keys(sample.phaseMinutes)));
    const phaseShares: Array<{ phase: string; share: number; evidenceCount: number }> = [];
    for (const phase of phases) {
      const evidence = samples.flatMap((sample, index) => sample.phaseMinutes[phase] !== undefined
        ? [{ value: sample.phaseMinutes[phase]! / sample.minutes, weight: weighted[index].weight }] : []);
      const share = quantile(evidence, .5);
      if (Number.isFinite(share) && share >= 0) phaseShares.push({ phase, share, evidenceCount: evidence.length });
    }
    const shareTotal = phaseShares.reduce((sum, row) => sum + row.share, 0);
    const fullPhaseBudget = samples.every(sample => Object.keys(sample.phaseMinutes).length > 0
      && Math.abs(Object.values(sample.phaseMinutes).reduce((sum, minutes) => sum + minutes, 0) - sample.minutes) <= Math.max(1e-8, sample.minutes * 1e-8));
    // Independent phase medians can add up to more than the overall median.
    // Reconcile measured shares inside one budget; missing phases are never
    // added, and incomplete phase measurements do not get scaled up to a total.
    const totalMinutes = roundMinutes(rawPrediction);
    const scale = shareTotal > 0 && (shareTotal > 1 || fullPhaseBudget) ? 1 / shareTotal : 1;
    const desiredTotal = Math.min(totalMinutes, fullPhaseBudget && shareTotal > 0 ? totalMinutes : Math.floor(totalMinutes * Math.min(1, shareTotal) + 1e-8));
    const allocations = phaseShares.map(row => {
      const exact = totalMinutes * row.share * scale;
      return { ...row, minutes: Math.floor(exact), fraction: exact - Math.floor(exact) };
    });
    let unallocated = desiredTotal - allocations.reduce((sum, row) => sum + row.minutes, 0);
    for (const row of allocations.slice().sort((a, b) => b.fraction - a.fraction || a.phase.localeCompare(b.phase))) {
      if (unallocated <= 0) break;
      row.minutes++; unallocated--;
    }
    for (const row of allocations) phaseEstimates[row.phase] = { estimatedMinutes: row.minutes, evidenceCount: row.evidenceCount };
    if (Object.keys(phaseEstimates).length) {
      featuresUsed.push('observed_plsema');
      factors.push('Las proporciones PLSEMA medidas se ajustan al tiempo total y se redondean conjuntamente. Las fases ausentes no se rellenan; con mediciones incompletas su suma puede ser menor que el total.');
    }
  }
  return {
    estimatedMinutes: activity === 'cante' ? Math.max(.5, Math.round(rawPrediction * 2) / 2) : roundMinutes(rawPrediction),
    ...(method === 'measured_page_rate' ? { estimatedMinutesPerPage: predictedUnit } : {}),
    interval: { low: Math.max(0, Math.floor(low)), high: Math.ceil(high) }, confidence,
    evidenceCount: samples.length, effectiveSampleSize: Math.round(effectiveSampleSize * 10) / 10,
    factors, modelVersion: PERSONALIZED_ESTIMATOR_VERSION, method, featuresUsed, excludedCount,
    ...(Object.keys(phaseEstimates).length ? { phaseEstimates } : {}),
  };
}


interface ActivityObservation { session: Session; time: number; minutes: number; pages: number | null; ordinal: number }

function activityObservations(request: PersonalizedEstimationRequest): ActivityObservation[] {
  const cutoff = request.asOf?.getTime() ?? Date.now();
  const topics = new Map(request.topics); topics.set(request.topic.id, request.topic);
  const selected: Array<{ session: Session; time: number; minutes: number }> = [];
  for (const session of selectSessionVersions(request.history, new Date(cutoff))) {
    if ((session as Session & Raw).mergedIntoSessionId) continue;
    const time = eventTime(session), minutes = measuredMinutes(session, request.activity);
    if (activityOf(session) !== request.activity || time === null || time >= cutoff || minutes === null || !topicFor(session, topics)) continue;
    // Sessions without stable identity cannot strengthen a pooled fallback.
    if (typeof session.id !== 'string' || !session.id.trim()) continue;
    selected.push({ session, time, minutes });
  }
  const counters = new Map<string, number>();
  return selected.sort((a, b) => a.time - b.time || a.session.id.localeCompare(b.session.id)).map(row => {
    const source = topicFor(row.session, topics)!;
    const raw = row.session as Session & Raw;
    const explicit = positive(request.activity === 'repaso' ? raw.reviewOrdinal ?? raw.reviewNumber : raw.refreshOrdinal ?? raw.refreshNumber);
    const ordinal = explicit ?? (counters.get(source.id) ?? 0) + 1;
    counters.set(source.id, Math.max((counters.get(source.id) ?? 0) + 1, ordinal));
    return { ...row, pages: getMeasuredSessionPages(row.session), ordinal };
  });
}

/** A median of comparable measured units; an unknown full-session amount is never a page rate. */
function estimateActivityMedian(request: PersonalizedEstimationRequest, observations: ActivityObservation[]): PersonalizedDurationEstimate | null {
  if (!observations.length) return null;
  let requestedPages: number | null = request.topic.hasExplicitPages ? positive(request.topic.pages) : null;
  if (request.work !== undefined) {
    requestedPages = getMeasuredSessionPages({ pagesCount: request.work.pages, pagesNumbers: request.work.pageNumbers,
      startPage: request.work.fromPage, endPage: request.work.toPage,
      totalPagesAtSession: request.topic.hasExplicitPages ? request.topic.pages : undefined } as unknown as Session);
    if (requestedPages === null) return null;
  }
  const requestedOrdinal = positive(request.activity === 'repaso' ? request.reviewOrdinal : request.refreshOrdinal);
  let comparable = observations;
  let ordinalDistance = 0;
  if (requestedOrdinal !== null) {
    ordinalDistance = Math.min(...observations.map(row => Math.abs(Math.log(row.ordinal / requestedOrdinal))));
    comparable = observations.filter(row => Math.abs(Math.log(row.ordinal / requestedOrdinal)) <= ordinalDistance + 1e-8);
  }
  const measured = comparable.filter(row => row.pages !== null);
  const pageRate = requestedPages !== null && measured.length > 0;
  // A partial volume cannot be evaluated against an unknown whole-session amount.
  if (!pageRate && request.work !== undefined && requestedPages !== request.topic.pages) return null;
  if (pageRate) comparable = measured;
  const values = comparable.map(row => ({ value: pageRate ? row.minutes / row.pages! : row.minutes, weight: 1 }));
  const multiplier = pageRate ? requestedPages! : 1;
  const minutes = quantile(values, .5) * multiplier;
  const uncertainty = Math.exp(1 / Math.sqrt(comparable.length));
  const featuresUsed = [pageRate ? 'measured_pages' : 'measured_duration', 'activity'];
  const factors = [
    `${comparable.length} sesiones reales comparables de ${request.activity}; mediana empírica por actividad.`,
    pageRate ? `${requestedPages} páginas de trabajo; referencia calculada sólo con páginas medidas.`
      : 'Predicción de duración de una sesión; sin cobertura histórica medida no demuestra duración de un tema completo.',
  ];
  if (requestedOrdinal !== null) {
    featuresUsed.push('ordinal');
    factors.push(ordinalDistance <= 1e-8 ? `Referencia del ordinal ${requestedOrdinal} observado.`
      : `El ordinal ${requestedOrdinal} no tiene observaciones exactas: se usa el ordinal observado más cercano, sin asegurar un efecto de esa vuelta.`);
  }
  return { estimatedMinutes: roundMinutes(minutes),
    ...(pageRate ? { estimatedMinutesPerPage: quantile(values, .5) } : {}),
    interval: { low: Math.max(0, Math.floor(quantile(values, .1) * multiplier / uncertainty)), high: Math.ceil(quantile(values, .9) * multiplier * uncertainty) },
    confidence: 'baja', evidenceCount: comparable.length, effectiveSampleSize: comparable.length,
    factors, modelVersion: PERSONALIZED_ESTIMATOR_VERSION, method: pageRate ? 'measured_page_rate' : 'activity_median', featuresUsed,
    excludedCount: Math.max(0, request.history.filter(session => activityOf(session) === request.activity).length - comparable.length) };
}

/**
 * Localisation is used only after causal validation against a compatible median.
 * Every candidate preserves explicit volume. Ordinal and local effects must
 * demonstrate improvement using past observations before they replace the
 * simple reference. An earlier tie cannot erase a later performance change.
 */
export function estimatePersonalizedDuration(request: PersonalizedEstimationRequest): PersonalizedDurationEstimate {
  const local = estimateLocalDuration(request);
  if (!['refresco', 'repaso'].includes(request.activity) || local.method === 'unknown_work' || local.method === 'completed') return local;
  const cutoff = request.asOf?.getTime() ?? Date.now();
  if (!Number.isFinite(cutoff)) return local;
  const observations = activityObservations(request);
  const baseline = estimateActivityMedian({ ...request, reviewOrdinal: undefined, refreshOrdinal: undefined }, observations);
  const ordinalBaseline = estimateActivityMedian(request, observations);
  if (!baseline || !ordinalBaseline) return local;
  const topics = new Map(request.topics); topics.set(request.topic.id, request.topic);
  // Current masters were not necessarily available on a past validation day.
  // Historical features must come from contemporaneous recorded snapshots.
  const historicalTopics = new Map([...topics].map(([id, topic]) => [id, { ...topic, pages: 0, difficulty: 0, numeroPalabras: undefined,
    hasExplicitPages: false, hasExplicitDifficulty: false, hasExplicitWords: false }]));
  const validation: Array<{ candidate: number | null; ordinal: number; baseline: number; comparableOrdinalWork: boolean }> = [];
  for (const row of observations.slice(-12)) {
    const dayStart = Math.floor(row.time / day) * day;
    // Reconstruct the versions known in EACH historical fold. The outer
    // forecast's latest revisions are not necessarily available in that fold.
    const prior = activityObservations({ ...request, asOf: new Date(dayStart) });
    if (prior.length < 3) continue;
    const source = topicFor(row.session, historicalTopics)!;
    const raw = row.session as Session & Raw;
    const snapshot = raw.predictionFeatures ?? raw.prediction?.inputs ?? {};
    const extent = positive(snapshot.totalPages ?? raw.totalPagesAtSession);
    const words = positive(snapshot.totalWords ?? raw.totalWordsAtSession ?? raw.wordsAtSession);
    const difficulty = positive(snapshot.difficulty ?? raw.difficultyAtStart);
    const historicalTopic = { ...source, pages: extent ?? 0, numeroPalabras: words ?? undefined, difficulty: difficulty ?? 0,
      hasExplicitPages: extent !== null, hasExplicitWords: words !== null, hasExplicitDifficulty: difficulty !== null && difficulty <= 10 };
    const historicalRequest = { ...request, topic: historicalTopic, topics: historicalTopics,
      history: request.history.filter(session => { const time = eventTime(session); return time !== null && time < dayStart; }),
      asOf: new Date(dayStart), work: row.pages !== null ? { pages: row.pages } : undefined,
      reviewOrdinal: request.activity === 'repaso' ? row.ordinal : undefined,
      refreshOrdinal: request.activity === 'refresco' ? row.ordinal : undefined };
    const candidate = estimateLocalDuration(historicalRequest);
    const reference = estimateActivityMedian({ ...historicalRequest, reviewOrdinal: undefined, refreshOrdinal: undefined }, prior);
    const ordinalReference = estimateActivityMedian(historicalRequest, prior);
    if (reference?.estimatedMinutes == null || ordinalReference?.estimatedMinutes == null) continue;
    // Unknown session coverage cannot validate a page-scaled full-topic estimate.
    const candidateMinutes = candidate.method === 'measured_page_rate' && row.pages === null ? null : candidate.estimatedMinutes;
    validation.push({ candidate: candidateMinutes === null ? null : Math.abs(candidateMinutes - row.minutes),
      ordinal: Math.abs(ordinalReference.estimatedMinutes - row.minutes), baseline: Math.abs(reference.estimatedMinutes - row.minutes),
      comparableOrdinalWork: row.pages !== null && reference.method === 'measured_page_rate' && ordinalReference.method === 'measured_page_rate' });
  }
  const improves = (rows: Array<{ candidate: number; baseline: number }>) => {
    const half = Math.floor(rows.length / 2);
    const difference = (part: typeof rows) => part.reduce((sum, row) => sum + row.candidate - row.baseline, 0);
    const early = difference(rows.slice(0, half)), late = difference(rows.slice(half));
    return rows.length >= 4 && early <= 0 && late <= 0 && (early < 0 || late < 0);
  };
  const requestedOrdinal = positive(request.activity === 'repaso' ? request.reviewOrdinal : request.refreshOrdinal);
  // Unknown historical amounts can masquerade as an ordinal speedup. Only
  // measured, volume-comparable work can validate that conditional effect.
  const ordinalValidation = validation.filter(row => row.comparableOrdinalWork);
  const ordinalValidated = requestedOrdinal !== null && ordinalBaseline.method === 'measured_page_rate'
    && improves(ordinalValidation.map(row => ({ candidate: row.ordinal, baseline: row.baseline })));
  const selectedReference = ordinalValidated ? ordinalBaseline : baseline;
  const localValidation = validation.flatMap(row => row.candidate === null ? [] : [{ candidate: row.candidate, baseline: ordinalValidated ? row.ordinal : row.baseline }]);
  const validatedImprovement = improves(localValidation);
  const ordinalFactor = requestedOrdinal !== null ? ordinalValidated
    ? `El ordinal explícito ${requestedOrdinal} mejora la referencia en validación temporal previa.`
    : `Se evaluó el ordinal explícito ${requestedOrdinal}; su efecto no mejoró de forma consistente la referencia previa con cantidades de trabajo medidas y no se impone un multiplicador.` : null;
  // Equal numerical predictions do not justify replacing precise provenance,
  // phase measurements or effective support with an unrelated pooled method.
  const samePrediction = local.estimatedMinutes !== null && local.estimatedMinutes === selectedReference.estimatedMinutes;
  if (local.estimatedMinutes !== null && (validatedImprovement || samePrediction)) {
    return { ...local, factors: [...local.factors, ...(ordinalFactor ? [ordinalFactor] : []), validatedImprovement
      ? `Modelo local seleccionado usando ${localValidation.length} predicciones anteriores: no empeora ninguna mitad temporal y mejora al menos una.`
      : 'La referencia da la misma duración; se conserva la evidencia y el contexto del modelo local.'] };
  }
  return {
    ...selectedReference,
    featuresUsed: [...selectedReference.featuresUsed, ...(requestedOrdinal !== null && !ordinalValidated ? ['ordinal_evaluated'] : [])],
    factors: [...selectedReference.factors, ...(ordinalFactor ? [ordinalFactor] : []),
      localValidation.length >= 4 ? 'El modelo local no mejoró de forma consistente la referencia en la validación temporal previa.' : 'Evidencia insuficiente para demostrar mejora del modelo local frente a la referencia.',
    ],
  };
}
