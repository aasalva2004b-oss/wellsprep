import type { Session } from '../types';

function recordedInstant(value: any): number | null {
  const time = value instanceof Date ? value.getTime() : typeof value?.toMillis === 'function' ? value.toMillis()
    : typeof value?.seconds === 'number' ? value.seconds * 1000 + Number(value.nanoseconds || 0) / 1e6
      : typeof value === 'number' ? value : typeof value === 'string' && value ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? time : null;
}

function stable(value: any): string {
  const ordered = (item: any): any => item instanceof Date ? item.toJSON() : Array.isArray(item) ? item.map(ordered)
    : item && typeof item === 'object' ? Object.fromEntries(Object.keys(item).sort().map(key => [key, ordered(item[key])])) : item;
  return JSON.stringify(ordered(value));
}

/**
 * Select one known revision per stable identity BEFORE filtering topic, type,
 * validity or archive markers. Otherwise an obsolete active copy can reappear
 * after its latest revision was merged or reassigned to another topic.
 *
 * updatedAt marks a revised value: future revisions are unavailable at asOf.
 * createdAt only orders copies when no update is recorded; an import timestamp
 * does not move the actual study day. This cannot reconstruct missing versions.
 * Tombstones are returned deliberately; each consumer filters them afterwards.
 * Anonymous records remain independent and are never assigned invented IDs.
 */
export function selectSessionVersions(sessions: readonly Session[], asOf?: Date): Session[] {
  const cutoff = asOf?.getTime() ?? Infinity;
  if (Number.isNaN(cutoff)) return [];
  const selected = new Map<string, Session>();
  const anonymous: Session[] = [];
  for (const session of sessions || []) {
    if (!session || typeof session !== 'object') continue;
    const updated = recordedInstant(session.updatedAt);
    if (updated !== null && updated >= cutoff) continue;
    if (typeof session.id !== 'string' || !session.id.trim()) { anonymous.push(session); continue; }
    const previous = selected.get(session.id);
    if (!previous) { selected.set(session.id, session); continue; }
    const nextRevision = recordedInstant(session.updatedAt ?? session.createdAt) ?? 0;
    const oldRevision = recordedInstant(previous.updatedAt ?? previous.createdAt) ?? 0;
    const nextArchived = Boolean((session as Session & Record<string, any>).mergedIntoSessionId);
    const oldArchived = Boolean((previous as Session & Record<string, any>).mergedIntoSessionId);
    if (nextRevision > oldRevision || nextRevision === oldRevision && (
      nextArchived && !oldArchived || nextArchived === oldArchived && stable(session) > stable(previous)
    )) selected.set(session.id, session);
  }
  return [...selected.values(), ...anonymous].sort((first, second) => {
    const firstId = typeof first.id === 'string' ? first.id : '';
    const secondId = typeof second.id === 'string' ? second.id : '';
    return firstId.localeCompare(secondId) || stable(first).localeCompare(stable(second));
  });
}
