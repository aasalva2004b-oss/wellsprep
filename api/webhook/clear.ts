import { corsHeaders, saveWebhookEvents } from '../../src/lib/webhookStorage';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', corsHeaders['Access-Control-Allow-Headers']);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    saveWebhookEvents([]);
    return res.status(200).json({ status: 'ok', message: 'Todos los eventos de AeroFocus en servidor han sido eliminados.' });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
}
