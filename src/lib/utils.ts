import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}m ${s}s`;
}

export function formatMinutesToHours(totalMinutes: number): string {
  if (totalMinutes < 60) return `${Math.round(totalMinutes)} min`;
  const h = Math.floor(totalMinutes / 60);
  const m = Math.round(totalMinutes % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function formatDecimalHours(hoursDecimal: number): string {
  const h = Math.floor(hoursDecimal);
  const m = Math.round((hoursDecimal - h) * 60);
  if (h > 0) {
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${m}m`;
}

export function formatCleanStudyHours(hoursDecimal?: number | null): string {
  if (!hoursDecimal || isNaN(hoursDecimal) || hoursDecimal <= 0) return "0h";
  const h = Math.floor(hoursDecimal);
  const m = Math.round((hoursDecimal - h) * 60);
  if (h > 0) {
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${m}m`;
}

export function safeParseDate(val: any): Date {
  if (!val) return new Date();
  if (val instanceof Date) return val;
  if (typeof val === 'string') {
    // If it's a simple YYYY-MM-DD string, parse it locally so it doesn't offset to yesterday
    const ymdMatch = val.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (ymdMatch) {
      return new Date(parseInt(ymdMatch[1]), parseInt(ymdMatch[2]) - 1, parseInt(ymdMatch[3]));
    }
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d;
  }
  if (typeof val === 'number') {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d;
  }
  if (val && typeof val === 'object') {
    if (typeof val.toDate === 'function') return val.toDate();
    if (val.seconds) return new Date(val.seconds * 1000);
  }
  return new Date();
}


export function getLocalDateString(d?: any): string {
  let date: Date;
  if (d instanceof Date && !isNaN(d.getTime())) {
    date = d;
  } else if (typeof d === "string" || typeof d === "number") {
    date = safeParseDate(d);
  } else {
    date = new Date();
  }
  
  if (isNaN(date.getTime())) {
    date = new Date();
  }
  
  const offset = date.getTimezoneOffset();
  const adjustedDate = new Date(date.getTime() - (offset * 60 * 1000));
  if (isNaN(adjustedDate.getTime())) {
    return new Date().toISOString().split("T")[0];
  }
  return adjustedDate.toISOString().split("T")[0];
}
