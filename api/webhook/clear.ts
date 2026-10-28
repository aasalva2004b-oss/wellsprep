import fs from 'fs';
import path from 'path';

function getStoragePath(): string {
  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NOW_REGION);
  if (isServerless) return path.join('/tmp', 'aerofocus_events.json');
  return path.join(process.cwd(), 'uploads', 'aerofocus_events.json');
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    (globalThis as any).__wellsprep_sessions = [];
    const file = getStoragePath();
    if (fs.existsSync(file)) {
      fs.writeFileSync(file, '[]', 'utf-8');
    }
    return res.status(200).json({ status: 'ok', message: 'Todos los eventos de AeroFocus en servidor han sido eliminados.' });
  } catch (e: any) {
    return res.status(500).json({ error: e.message || 'Error limpiando sesiones' });
  }
}
