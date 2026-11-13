import type { PlsemaPhase, WellsprepPlsemaBreakdown } from '../types/aerofocusWebhook';

const phases: PlsemaPhase[] = ['prelectura', 'lectura', 'subrayado', 'esquema', 'memorizar', 'cantar'];
const suffixes = ['Prelectura', 'Lectura', 'Subrayado', 'Esquema', 'Memorizar', 'Cantar'];
type Data = Record<string, unknown>;

export type SessionPlsemaTelemetry = WellsprepPlsemaBreakdown & {
  /** Missing phases are zero-filled for the wire shape, not claimed as observed. */
  observedPhases: PlsemaPhase[];
};

export interface SessionPageTelemetry {
  pageNumber: number;
  effectiveMinutes?: number;
  effectiveSeconds?: number;
  minutesPerPage?: number;
  secondsPerPage?: number;
  completed?: boolean;
  plsema?: SessionPlsemaTelemetry;
}

export interface SessionTelemetry {
  startPage?: number;
  endPage?: number;
  pagesCount?: number;
  pagesStudied?: number;
  pagesNumbers?: number[];
  minutesPerPage?: number;
  secondsPerPage?: number;
  effectiveSeconds?: number;
  distractionSeconds?: number;
  plsema?: SessionPlsemaTelemetry;
  pageBreakdown?: SessionPageTelemetry[];
}

function object(value: unknown): Data {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Data : {};
}

function nonnegative(value: unknown): number | undefined {
  if (typeof value !== 'number' && typeof value !== 'string') return undefined;
  if (typeof value === 'string' && !/^\d+(?:\.\d+)?$/.test(value.trim())) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function integer(value: unknown, minimum = 1): number | undefined {
  const parsed = nonnegative(value);
  return parsed !== undefined && Number.isSafeInteger(parsed) && parsed >= minimum ? parsed : undefined;
}

function first<T>(values: unknown[], parse: (value: unknown) => T | undefined): T | undefined {
  for (const value of values) {
    const parsed = parse(value);
    if (parsed !== undefined) return parsed;
  }
}

function extractPlsema(value: unknown): SessionPlsemaTelemetry | undefined {
  const source = object(value);
  const observedPhases: PlsemaPhase[] = [];
  const seconds = {} as Record<PlsemaPhase, number>;
  for (const [index, phase] of phases.entries()) {
    if (Array.isArray(source.observedPhases) && !source.observedPhases.includes(phase)) {
      seconds[phase] = 0;
      continue;
    }
    // Seconds retain sub-minute precision. Never trust inconsistent cached totals.
    const observedSeconds = first([
      object(source.seconds)[phase], source[`segundos${suffixes[index]}`],
    ], nonnegative);
    const observedMinutes = first([
      object(source.minutes)[phase], source[`minutos${suffixes[index]}`], source[phase],
    ], nonnegative);
    const observedHours = nonnegative(object(source.hours)[phase]);
    const measured = observedSeconds ?? (observedMinutes !== undefined ? observedMinutes * 60 : undefined)
      ?? (observedHours !== undefined ? observedHours * 3600 : undefined);
    if (measured !== undefined && Number.isFinite(measured)) observedPhases.push(phase);
    seconds[phase] = measured !== undefined && Number.isFinite(measured) ? measured : 0;
  }
  // A total alone cannot tell us how time was distributed across PLSEMA phases.
  if (!observedPhases.length) return undefined;
  const totalSeconds = phases.reduce((sum, phase) => sum + seconds[phase], 0);
  if (!Number.isFinite(totalSeconds)) return undefined;
  const minutes = Object.fromEntries(phases.map(phase => [phase, seconds[phase] / 60])) as Record<PlsemaPhase, number>;
  const hours = Object.fromEntries(phases.map(phase => [phase, seconds[phase] / 3600])) as Record<PlsemaPhase, number>;
  const percentages = Object.fromEntries(phases.map(phase => [phase, totalSeconds ? seconds[phase] / totalSeconds * 100 : 0])) as Record<PlsemaPhase, number>;
  const totalMinutes = totalSeconds / 60;
  const activeRecallMinutes = minutes.memorizar + minutes.cantar;
  const passiveMinutes = minutes.prelectura + minutes.lectura + minutes.subrayado;
  const dominantPhase = phases.reduce((best, phase) => seconds[phase] > seconds[best] ? phase : best, phases[0]);
  return {
    minutes, seconds, hours, percentages, totalMinutes, totalSeconds, dominantPhase,
    activeRecallMinutes, passiveMinutes, schematicMinutes: minutes.esquema,
    activeRecallRatio: totalMinutes ? activeRecallMinutes / totalMinutes * 100 : 0,
    passiveRatio: totalMinutes ? passiveMinutes / totalMinutes * 100 : 0,
    minutosPrelectura: minutes.prelectura, minutosLectura: minutes.lectura,
    minutosSubrayado: minutes.subrayado, minutosEsquema: minutes.esquema,
    minutosMemorizar: minutes.memorizar, minutosCantar: minutes.cantar,
    segundosPrelectura: seconds.prelectura, segundosLectura: seconds.lectura,
    segundosSubrayado: seconds.subrayado, segundosEsquema: seconds.esquema,
    segundosMemorizar: seconds.memorizar, segundosCantar: seconds.cantar,
    observedPhases,
  };
}

function extractPage(value: unknown): SessionPageTelemetry | undefined {
  const source = object(value);
  const pageNumber = first([source.pageNumber, source.pagina], integer);
  if (pageNumber === undefined) return undefined;
  const result: SessionPageTelemetry = { pageNumber };
  const effectiveSeconds = first([source.effectiveSeconds, source.segundosEfectivos], nonnegative);
  const effectiveMinutes = first([source.effectiveMinutes, source.durationMinutes, source.minutosEfectivos], nonnegative);
  // Keep individually reported units so discrepancies remain observable.
  if (effectiveSeconds !== undefined) result.effectiveSeconds = effectiveSeconds;
  if (effectiveMinutes !== undefined) result.effectiveMinutes = effectiveMinutes;
  const minutesPerPage = first([source.minutesPerPage, source.minutosPorPagina], nonnegative);
  const secondsPerPage = first([source.secondsPerPage, source.segundosPorPagina], nonnegative);
  if (minutesPerPage !== undefined) result.minutesPerPage = minutesPerPage;
  if (secondsPerPage !== undefined) result.secondsPerPage = secondsPerPage;
  const completed = first([source.completed, source.completada], value => typeof value === 'boolean' ? value : undefined);
  if (completed !== undefined) result.completed = completed;
  const plsema = first([source.plsema, source.fasesPlsema], extractPlsema);
  if (plsema) result.plsema = plsema;
  return result;
}

/**
 * Pure allowlist for session telemetry, including the resolver's `original` input.
 * It never copies raw payloads, titles, notes, emails, tokens or arbitrary fields.
 * It preserves independently reported ranges/counts; it does not infer completion,
 * page coverage, rhythm or study time from missing measurements.
 */
export function extractSessionTelemetry(input: unknown): SessionTelemetry {
  const source = object(input);
  const sources = [source, object(source.original)];
  const values = (...keys: string[]) => sources.flatMap(item => keys.map(key => item[key]));
  const result: SessionTelemetry = {};
  for (const name of ['startPage', 'endPage'] as const) {
    const nested = sources.flatMap(item => [object(item.pages)[name === 'startPage' ? 'pageStart' : 'pageEnd'], object(item.pageInfo)[name]]);
    const measured = first([...values(name), ...nested], integer);
    if (measured !== undefined) result[name] = measured;
  }
  const count = first([
    ...values('pagesCount'),
    ...sources.flatMap(item => [object(item.pages).pagesCount, object(item.pageInfo).pagesRead]),
  ], value => integer(value, 0));
  if (count !== undefined) result.pagesCount = count;
  const pagesStudied = first(values('pagesStudied'), value => integer(value, 0));
  if (pagesStudied !== undefined) result.pagesStudied = pagesStudied;
  const pageNumbers = first(values('pagesNumbers', 'pageNumbers'), value => {
    if (!Array.isArray(value)) return undefined;
    const valid = value.map(item => integer(item)).filter((item): item is number => item !== undefined);
    return valid.length ? [...new Set(valid)].sort((a, b) => a - b) : undefined;
  });
  if (pageNumbers) result.pagesNumbers = pageNumbers;
  for (const [name, aliases] of [
    ['minutesPerPage', ['minutesPerPage', 'minutosPorPagina']],
    ['secondsPerPage', ['secondsPerPage', 'segundosPorPagina']],
    ['effectiveSeconds', ['effectiveSeconds', 'segundosEfectivos']],
    ['distractionSeconds', ['distractionSeconds', 'segundosDistraccion']],
  ] as const) {
    const measured = first(values(...aliases), nonnegative);
    if (measured !== undefined) result[name] = measured;
  }
  const plsema = first(values('plsema', 'fasesPlsema'), extractPlsema);
  if (plsema) result.plsema = plsema;
  const pageBreakdown = first(values('pageBreakdown'), value => {
    if (!Array.isArray(value)) return undefined;
    const pages = value.map(extractPage).filter((page): page is SessionPageTelemetry => page !== undefined);
    return pages.length ? pages : undefined;
  });
  if (pageBreakdown) result.pageBreakdown = pageBreakdown;
  return result;
}
