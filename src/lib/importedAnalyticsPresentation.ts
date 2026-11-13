/** Presentation of externally reported values. Missing data is never a measurement of zero. */
export function reportedNumber(value: unknown, maximum = Infinity): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !/^\d+(?:\.\d+)?$/.test(value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= maximum ? number : null;
}

export function reportedMetric(value: unknown, unit = '', fractionDigits = 0, maximum = Infinity): string {
  const number = reportedNumber(value, maximum);
  return number === null ? '—' : `${number.toFixed(fractionDigits)}${unit}`;
}

export function reportedText(value: unknown, missing = 'No disponible'): string {
  return typeof value === 'string' && value.trim() ? value.trim() : missing;
}

/** External lists may be absent or malformed; only record-shaped entries can be rendered. */
export function reportedRecords(value: unknown): Record<string, any>[] {
  return Array.isArray(value) ? value.filter(item => item !== null && typeof item === 'object' && !Array.isArray(item)) : [];
}

/** A normalised phase object can contain zero-filled fields that were never observed. */
export function reportedPhaseMinutes(value: unknown, phase: string): number | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  if (Array.isArray(source.observedPhases) && !source.observedPhases.includes(phase)) return null;
  const values = source.phaseMinutes ?? source.minutes;
  return values && typeof values === 'object' ? reportedNumber((values as Record<string, unknown>)[phase]) : null;
}
