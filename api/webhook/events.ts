import { corsHeaders, loadWebhookEvents } from '../../src/lib/webhookStorage';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', corsHeaders['Access-Control-Allow-Headers']);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    const events = loadWebhookEvents();
    const statusFilter = req.query?.status;
    const limit = parseInt(req.query?.limit || '50', 10);

    let filtered = events;
    if (statusFilter) {
      filtered = filtered.filter((e) => e.status === statusFilter);
    }

    const quarantinedCount = events.filter((e) => e.status === 'quarantined' || e.status === 'pending').length;

    return res.status(200).json({
      events: filtered.slice(-limit).reverse(),
      total: events.length,
      quarantinedCount,
      pendingCount: quarantinedCount
    });
  } catch (err: any) {
    return res.status(200).json({
      events: [],
      total: 0,
      quarantinedCount: 0,
      pendingCount: 0
    });
  }
}
