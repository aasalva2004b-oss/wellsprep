import { corsHeaders, loadWebhookEvents, saveWebhookEvents } from '../../src/lib/webhookStorage';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', corsHeaders['Access-Control-Allow-Headers']);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const { eventIds, eventId } = req.body || {};
  const idsToAck = new Set<string>();
  if (Array.isArray(eventIds)) {
    eventIds.forEach(id => idsToAck.add(String(id)));
  }
  if (eventId) {
    idsToAck.add(String(eventId));
  }

  if (idsToAck.size === 0) {
    return res.status(400).json({ error: 'No event IDs provided' });
  }

  const events = loadWebhookEvents();
  let updatedCount = 0;
  const updated = events.map((e: any) => {
    if (idsToAck.has(e.id)) {
      updatedCount++;
      return { ...e, status: 'processed', processedAt: new Date().toISOString() };
    }
    return e;
  });

  saveWebhookEvents(updated);
  return res.status(200).json({ status: 'ok', acknowledged: updatedCount });
}
