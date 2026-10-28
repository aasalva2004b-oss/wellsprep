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

    const { eventId, updatedRecord } = body;
    if (!eventId || !updatedRecord) return res.status(400).json({ error: 'Faltan parámetros' });

    const events = loadEvents();
    const updated = events.map((e: any) => String(e.id) === String(eventId) ? { ...e, ...updatedRecord } : e);
    saveEvents(updated);
    return res.status(200).json({ status: 'ok', event: updatedRecord });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Error actualizando registro' });
  }
}
