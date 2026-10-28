import fs from 'fs';
import path from 'path';

function getStoragePath(): string {
  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NOW_REGION);
  if (isServerless) return path.join('/tmp', 'aerofocus_events.json');
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

function saveEvents(events: any[]): void {
  const trimmed = events.slice(-150);
  (globalThis as any).__wellsprep_sessions = trimmed;
  try {
    const file = getStoragePath();
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(trimmed, null, 2), 'utf-8');
  } catch {}
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    let body = req.body || {};
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch {}
    }

    const { eventIds, eventId } = body;
    const idsToAck = new Set<string>();
    if (Array.isArray(eventIds)) {
      eventIds.forEach((id: any) => idsToAck.add(String(id)));
    }
    if (eventId) {
      idsToAck.add(String(eventId));
    }

    if (idsToAck.size === 0) {
      return res.status(400).json({ error: 'No event IDs provided' });
    }

    const events = loadEvents();
    let updatedCount = 0;
    const updated = events.map((e: any) => {
      if (idsToAck.has(String(e.id))) {
        updatedCount++;
        return { ...e, status: 'processed', processedAt: new Date().toISOString() };
      }
      return e;
    });

    saveEvents(updated);
    return res.status(200).json({ status: 'ok', acknowledged: updatedCount });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Error processing ack' });
  }
}
