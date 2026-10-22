import { 
  corsHeaders, 
  isAuthorizedWebhookRequest, 
  processIncomingAeroFocusPayload 
} from '../../src/lib/webhookStorage';

export default async function handler(req: any, res: any) {
  // 1. Universal CORS headers
  res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
  res.setHeader('Access-Control-Allow-Methods', corsHeaders['Access-Control-Allow-Methods']);
  res.setHeader('Access-Control-Allow-Headers', corsHeaders['Access-Control-Allow-Headers']);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // Health check (GET)
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'ok', service: 'wellsprep_aerofocus_webhook', ready: true });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // 2. Authentication
  if (!isAuthorizedWebhookRequest(req.headers)) {
    return res.status(401).json({ error: 'Token no autorizado' });
  }

  // 3. Payload extraction
  let payload = req.body || {};
  if (typeof payload === 'string') {
    try { 
      payload = JSON.parse(payload); 
    } catch { 
      payload = {}; 
    }
  }
  if (typeof payload.payload === 'string') {
    try { 
      payload = JSON.parse(payload.payload); 
    } catch {}
  }

  try {
    const { statusCode, responseData } = processIncomingAeroFocusPayload(payload, req.headers);
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
