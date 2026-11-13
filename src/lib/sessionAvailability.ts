import type { Session } from '../types';

const DAY = 86_400_000;

function recordedInstant(value: any): number | null {
  const time = value instanceof Date ? value.getTime() : typeof value?.toMillis === 'function' ? value.toMillis()
    : typeof value?.seconds === 'number' ? value.seconds * 1000 + Number(value.nanoseconds || 0) / 1e6
      : typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? time : null;
}

/**
 * Availability of an observed result, shared by topic projections and memory.
 * A civil date is not an ingestion timestamp. Explicit event clocks handle
 * local midnight; an unfinished session cannot yet supply its final result.
 * Select a stable record's revision before applying this predicate.
 */
export function isSessionAvailableAt(session: Session | Record<string, any>, asOf: Date): boolean {
  if (!session || typeof session !== 'object') return false;
  const raw = session as Record<string, any>;
  if (raw.mergedIntoSessionId) return false;
  const value = session.date;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const day = Date.parse(`${value}T00:00:00Z`), cutoff = asOf.getTime();
  if (!Number.isFinite(day) || new Date(day).toISOString().slice(0, 10) !== value || !Number.isFinite(cutoff)) return false;
  const started = recordedInstant(raw.startedAt), ended = recordedInstant(raw.endedAt), created = recordedInstant(raw.createdAt);
  const localCreatedDay = created === null ? null : [new Date(created).getFullYear(), String(new Date(created).getMonth()+1).padStart(2,'0'), String(new Date(created).getDate()).padStart(2,'0')].join('-');
  const event = started !== null || ended !== null ? Math.max(started ?? -Infinity, ended ?? -Infinity)
    : created !== null && (Math.floor(created / DAY) === Math.floor(day / DAY) || localCreatedDay === value) ? created : day;
  return event < cutoff;
}
