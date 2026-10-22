import { corsHeaders } from '../../src/lib/webhookStorage';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', corsHeaders['Access-Control-Allow-Headers']);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  return res.status(200).json({
    status: 'ok',
    success: true,
    message: 'Enlace operativo AeroFocus Pro <-> WellsPrep',
    ready: true
  });
}
