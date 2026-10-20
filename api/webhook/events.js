import fs from 'fs';
import path from 'path';

function getEventsFilePath() {
  try {
    const primary = path.join(process.cwd(), 'uploads', 'aerofocus_events.json');
    const dir = path.dirname(primary);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return primary;
  } catch (e) {
    return path.join('/tmp', 'aerofocus_events.json');
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    const filePath = getEventsFilePath();
    let events = [];
    if (fs.existsSync(filePath)) {
      events = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }

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
  } catch (err) {
    return res.status(200).json({
      events: [],
      total: 0,
      quarantinedCount: 0,
      pendingCount: 0
    });
  }
}
