export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  return res.status(200).json({
    status: 'ok',
    service: 'wellsprep_aerofocus_webhook',
    timestamp: new Date().toISOString(),
    expectedToken: 'wp_qLXi6WFkFY_live',
    ready: true
  });
}
