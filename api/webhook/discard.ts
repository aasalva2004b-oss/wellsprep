import { corsHeaders, loadWebhookEvents, saveWebhookEvents } from '../../src/lib/webhookStorage';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', corsHeaders['Access-Control-Allow-Headers']);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const { eventId } = req.body || {};
  if (!eventId) return res.status(400).json({ error: 'Falta eventId' });

  const events = loadWebhookEvents();
  const filtered = events.filter((e: any) => e.id !== eventId);
  saveWebhookEvents(filtered);
  return res.status(200).json({ status: 'ok', remaining: filtered.length });
}
