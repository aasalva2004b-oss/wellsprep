import type { IncomingMessage, ServerResponse } from 'http';

const EXPECTED_TOKEN = 'wp_qLXi6WFkFY_live';

export default async function handler(req: any, res: any) {
  // 1. Cabeceras CORS obligatorias para peticiones web y Vercel
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Event, X-API-Key, X-Source, X-Test-Ping');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // Comprobación de salud rápida (GET)
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, status: 'ok', service: 'wellsprep_aerofocus_webhook', ready: true });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // 2. Verificación del Token de Seguridad
    const authHeader = req.headers.authorization;
    const apiKey = req.headers['x-api-key'];
    const token = apiKey || (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null);

    if (token && token !== EXPECTED_TOKEN) {
      return res.status(401).json({ error: 'Token no autorizado' });
    }

    const payload = req.body || {};

    // 3. Handshake / Test de conexión de AeroFocus (NUNCA altera la base de datos)
    if (payload.isTest || payload.event === 'test_connection') {
      return res.status(200).json({
        success: true,
        message: 'Enlace operativo AeroFocus Pro <-> WellsPrep'
      });
    }

    // 4. Procesamiento de sesiones reales enviadas por AeroFocus
    const { date, topics, summary, dailyTotalEffectiveHours, totalEffectiveStudyMinutes, transactionId } = payload;
    const sessionHours = dailyTotalEffectiveHours ?? (totalEffectiveStudyMinutes ? totalEffectiveStudyMinutes / 60 : 0);

    console.log(`[WellsPrep Webhook] Sincronización recibida de AeroFocus para ${date}: ${sessionHours}h en ${topics?.length || 0} temas.`);

    return res.status(200).json({
      status: 'ok',
      synced: true,
      date: date || new Date().toISOString().split('T')[0],
      processedTopics: topics?.length || 0,
      effectiveHours: sessionHours
    });
  } catch (error: any) {
    console.error('[WellsPrep Webhook Error]:', error);
    return res.status(500).json({
      error: 'Error interno en webhook',
      details: error?.message
    });
  }
}
