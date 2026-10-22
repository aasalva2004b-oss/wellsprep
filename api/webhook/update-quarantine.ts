import { corsHeaders, loadWebhookEvents, saveWebhookEvents } from '../../src/lib/webhookStorage';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', corsHeaders['Access-Control-Allow-Headers']);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const { eventId, updatedRecord } = req.body || {};
  if (!eventId || !updatedRecord) return res.status(400).json({ error: 'Faltan parámetros' });

  const events = loadWebhookEvents();
  const updated = events.map((e: any) => e.id === eventId ? { ...e, ...updatedRecord } : e);
  saveWebhookEvents(updated);
  return res.status(200).json({ status: 'ok', event: updatedRecord });
}
