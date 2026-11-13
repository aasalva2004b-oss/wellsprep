/** A browser notification is only a hint to reload the authenticated API. */
export function allowedAeroFocusNotice(origin: string, data: any, uid: string, selfOrigin: string, configured: string[]): boolean {
  if (!uid || data?.userId !== uid || !['AEROFOCUS_TOUCHDOWN_SYNC','AEROFOCUS_WELLSPREP_SYNC','AEROFOCUS_WELLSPREP_DAILY_SYNC'].includes(data?.type)) return false;
  if (origin === selfOrigin) return true;
  try { const parsed=new URL(origin); return parsed.origin===origin && parsed.protocol==='https:' && configured.includes(origin); } catch { return false; }
}
