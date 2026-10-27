import { 
  corsHeaders, 
  isAuthorizedWebhookRequest, 
  processIncomingAeroFocusPayload,
  getWebhookHealthOrSessions
} from '../../src/lib/webhookStorage';

export const config = {
  api: {
    bodyParser: true,
  },
};

export default async function handler(req: any, res: any) {
  // 1. Universal CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key, X-Event, X-Flight-Id, X-Transaction-Id, X-Test-Mode, X-Source, X-Test-Ping, X-Token, X-Webhook-Token');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // GET / Healthcheck: Consultar sesiones pendientes para el Dashboard o Frontend
  if (req.method === 'GET') {
    try {
      const health = getWebhookHealthOrSessions();
      return res.status(200).json(health);
    } catch (e: any) {
      return res.status(200).json({
        ok: true,
        status: 'ok',
        service: 'wellsprep_aerofocus_webhook',
        sessionsCount: 0,
        latestSessions: [],
        ready: true
      });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // 2. Authentication
  const headers = req.headers || {};
  if (!isAuthorizedWebhookRequest(headers)) {
    return res.status(401).json({ error: 'Token no autorizado' });
  }

  // 3. Payload extraction robustly handling Object, Buffer, String or Stream
  let payload: any = req.body;

  if (Buffer.isBuffer(payload)) {
    try {
      payload = JSON.parse(payload.toString('utf-8'));
    } catch {
      payload = {};
    }
  } else if (typeof payload === 'string') {
    try { 
      payload = JSON.parse(payload); 
    } catch { 
      payload = {}; 
    }
  } else if (!payload && req.readable) {
    try {
      const chunks: any[] = [];
      for await (const chunk of req) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      }
      const rawText = Buffer.concat(chunks).toString('utf-8');
      if (rawText) {
        try {
          payload = JSON.parse(rawText);
        } catch {
          payload = { rawText };
        }
      }
    } catch {
      payload = {};
    }
  }

  if (!payload || typeof payload !== 'object') {
    payload = {};
  }

  if (typeof payload.payload === 'string') {
    try { 
      payload = JSON.parse(payload.payload); 
    } catch {}
  }

  // 4. Test connection handshake immediate bypass
  if (payload.isTest || payload.event === 'test_connection' || headers['x-test-ping'] || payload.event === 'ping') {
    return res.status(200).json({
      success: true,
      status: 'ok',
      message: 'Enlace operativo AeroFocus Pro <-> WellsPrep',
      timestamp: new Date().toISOString(),
      ready: true
    });
  }

  try {
    const { statusCode, responseData } = processIncomingAeroFocusPayload(payload, headers);
    return res.status(statusCode).json(responseData);
  } catch (err: any) {
    console.error('[AeroFocus Serverless Webhook] Error processing request:', err);
    return res.status(500).json({
      error: err?.message || 'Error interno',
      status: 'error',
      synced: false
    });
  }
}
