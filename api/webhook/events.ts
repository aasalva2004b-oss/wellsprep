import fs from 'fs';
import path from 'path';

function getStoragePath(): string {
  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NOW_REGION);
  if (isServerless) {
    return path.join('/tmp', 'aerofocus_events.json');
  }
  return path.join(process.cwd(), 'uploads', 'aerofocus_events.json');
}

function loadEvents(): any[] {
  try {
    const file = getStoragePath();
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
      if (Array.isArray(data)) return data;
    }
  } catch {}
  return (globalThis as any).__wellsprep_sessions || [];
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    const events = loadEvents();
    const statusFilter = req.query?.status;
    const limit = parseInt(req.query?.limit || '50', 10);

    let filtered = events;
    if (statusFilter) {
      filtered = filtered.filter((e) => e.status === statusFilter);
    }

    const quarantinedCount = events.filter((e) => e.status === 'quarantined' || e.status === 'pending').length;

    return res.status(200).json({
      events: filtered.slice(-limit).reverse(),
      total: events.length,
      quarantinedCount,
      pendingCount: quarantinedCount
    });
  } catch (err: any) {
    return res.status(200).json({
      events: [],
      total: 0,
      quarantinedCount: 0,
      pendingCount: 0
    });
  }
}
