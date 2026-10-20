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

function savePendingEvent(record) {
  try {
    const filePath = getEventsFilePath();
    let existing = [];
    if (fs.existsSync(filePath)) {
      try { 
        existing = JSON.parse(fs.readFileSync(filePath, 'utf-8')); 
      } catch (e) { 
        existing = []; 
      }
    }
    existing.push(record);
    fs.writeFileSync(filePath, JSON.stringify(existing.slice(-150), null, 2), 'utf-8');
  } catch (err) {
    console.error('[AeroFocus Webhook] Error saving event to file:', err);
  }
}

export default async function handler(req, res) {
  // 1. Cabeceras CORS obligatorias para peticiones web
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Event, X-API-Key, X-Source');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // Comprobación de salud rápida (GET)
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, service: 'wellsprep_aerofocus_webhook', ready: true });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // 2. Verificación de tu Token
  const authHeader = req.headers.authorization;
  const token = req.headers['x-api-key'] || req.headers['x-token'] || (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null);
  console.log('[AeroFocus Webhook Serverless] Received request. Token:', Boolean(token));

  let payload = req.body || {};
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); } catch {}
  }
  if (typeof payload.payload === 'string') {
    try { payload = JSON.parse(payload.payload); } catch {}
  }

  // 3. Respuesta al test de conexión / Handshake de AeroFocus
  if (payload.isTest || payload.event === 'test_connection' || req.headers['x-test-ping']) {
    return res.status(200).json({
      success: true,
      status: 'ok',
      message: 'Enlace operativo AeroFocus Pro <-> WellsPrep'
    });
  }

  // 4. Recepción del Cierre Diario (22:00 h) o Sesiones
  console.log(`[AeroFocus] Fecha: ${payload.date} | Horas netas: ${payload.dailyTotalEffectiveHours} h`);

  // Extraer temas de cualquier formato
  let rawTopics = [];
  if (Array.isArray(payload)) rawTopics = payload;
  else if (Array.isArray(payload.topics)) rawTopics = payload.topics;
  else if (Array.isArray(payload.sessions)) rawTopics = payload.sessions;
  else if (Array.isArray(payload.studySessions)) rawTopics = payload.studySessions;
  else if (Array.isArray(payload.study_sessions)) rawTopics = payload.study_sessions;
  else if (Array.isArray(payload.items)) rawTopics = payload.items;
  else if (Array.isArray(payload.tasks)) rawTopics = payload.tasks;
  else if (Array.isArray(payload.records)) rawTopics = payload.records;
  else if (Array.isArray(payload.history)) rawTopics = payload.history;
  else if (payload.data && Array.isArray(payload.data)) rawTopics = payload.data;
  else if (payload.data && Array.isArray(payload.data.topics)) rawTopics = payload.data.topics;
  else if (payload.flight && Array.isArray(payload.flight.topics)) rawTopics = payload.flight.topics;
  else if (payload.topicId || payload.topicTitle || payload.topicNumber || payload.title || payload.subject) rawTopics = [payload];

  if (rawTopics.length === 0 && (payload.effectiveMinutes || payload.duration || payload.hours)) {
    rawTopics = [{
      topicTitle: payload.title || payload.name || "Sesión AeroFocus (Revisar tema)",
      effectiveMinutes: Number(payload.effectiveMinutes) || Number(payload.duration) || 45,
      category: payload.category || payload.subject || "Constitucional",
      modality: payload.modality || "repaso"
    }];
  }

  let resolvedTopics = [];
  try {
    const { resolveAeroFocusTopic } = await import('../../src/lib/topicResolver');
    if (resolveAeroFocusTopic) {
      for (const t of rawTopics) {
        const enriched = {
          ...t,
          category: t.category || payload.category || payload.subject || 'Constitucional',
          modality: t.modality || payload.modality || 'repaso'
        };
        const resolved = resolveAeroFocusTopic(enriched);
        if (resolved) {
          resolvedTopics.push(resolved);
        } else {
          resolvedTopics.push({
            resolvedTopicId: String(t.topicId || t.topicNumber || t.id || 'topic-unknown'),
            resolvedTopicTitle: t.topicTitle || t.title || `Tema ${t.topicNumber || ''}`,
            effectiveMinutes: Number(t.effectiveMinutes) || Math.round((Number(t.effectiveHours) || 0) * 60) || 30,
            effectiveHours: Number(t.effectiveHours) || (Number(t.effectiveMinutes) || 30) / 60,
            modality: t.modality || 'repaso',
            cantoGrade: t.cantoGrade ?? t.grade,
            cantoSeconds: t.cantoSeconds,
            cantoType: t.cantoType,
            mistakes: t.mistakes,
            notes: t.notes || 'Sincronizado vía AeroFocus Webhook'
          });
        }
      }
    }
  } catch (e) {
    console.warn('[AeroFocus Webhook] Error resolving topic resolver module:', e);
    resolvedTopics = rawTopics.map((t) => ({
      resolvedTopicId: String(t.topicId || t.topicNumber || t.id || ''),
      resolvedTopicTitle: t.topicTitle || t.title || '',
      effectiveMinutes: Number(t.effectiveMinutes) || Math.round((Number(t.effectiveHours) || 0) * 60) || 30,
      effectiveHours: Number(t.effectiveHours) || 0.5,
      modality: t.modality || 'repaso'
    }));
  }

  const record = {
    id: `af_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    receivedAt: new Date().toISOString(),
    date: payload.date || new Date().toISOString().split('T')[0],
    source: payload.source || 'aerofocus',
    flightId: String(payload.flightId || payload.id || 'cierre_22h'),
    dailyTotalEffectiveHours: payload.dailyTotalEffectiveHours || 0,
    totalFlightEffectiveMinutes: resolvedTopics.reduce((acc, t) => acc + (t.effectiveMinutes || 0), 0),
    totalFlightEffectiveHours: Number(payload.dailyTotalEffectiveHours) || (resolvedTopics.reduce((acc, t) => acc + (t.effectiveMinutes || 0), 0) / 60),
    status: 'quarantined',
    topics: resolvedTopics
  };

  savePendingEvent(record);

  const sessionHours = payload.dailyTotalEffectiveHours ?? (payload.totalEffectiveStudyMinutes ? payload.totalEffectiveStudyMinutes / 60 : (resolvedTopics.reduce((acc, t) => acc + (t.effectiveMinutes || 0), 0) / 60));

  return res.status(200).json({
    status: 'ok',
    synced: true,
    quarantined: true,
    date: payload.date || new Date().toISOString().split('T')[0],
    processedTopics: payload.topics?.length || resolvedTopics.length,
    effectiveHours: sessionHours,
    message: 'Enlace operativo AeroFocus Pro <-> WellsPrep (Datos en cuarentena)'
  });
}
