export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  return res.status(200).json({
    status: 'ok',
    success: true,
    service: 'wellsprep_aerofocus_webhook',
    message: 'Pong! Enlace operativo con WellsPrep',
    timestamp: new Date().toISOString(),
    ready: true
  });
}
