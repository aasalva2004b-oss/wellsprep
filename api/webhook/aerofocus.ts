import fs from 'fs';
import path from 'path';

export const EXPECTED_WEBHOOK_TOKEN = 'wp_qLXi6WFkFY_live';

// Global in-memory storage fallback across serverless invocations
declare global {
  var __wellsprep_sessions: any[] | undefined;
}
if (!globalThis.__wellsprep_sessions) {
  globalThis.__wellsprep_sessions = [];
}

function getStoragePath(): string {
  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NOW_REGION);
  if (isServerless) {
    return path.join('/tmp', 'aerofocus_events.json');
  }
  return path.join(process.cwd(), 'uploads', 'aerofocus_events.json');
}

function loadEvents(): any[] {
  try {
    const file = getStoragePath();
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
      if (Array.isArray(data)) {
        return data;
      }
    }
  } catch {}
  return globalThis.__wellsprep_sessions || [];
}

function saveEvents(events: any[]): void {
  const trimmed = events.slice(-150);
  globalThis.__wellsprep_sessions = trimmed;
  try {
    const file = getStoragePath();
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(file, JSON.stringify(trimmed, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[AeroFocus Webhook] Error writing events to storage file:', err);
  }
}

function normalizeCategoryToSubjectId(category?: string): string | null {
  if (!category) return null;
  const clean = category.toLowerCase().trim().replace(/[._\-]/g, ' ').replace(/\s+/g, ' ');

  if (
    clean.includes('proc civ') ||
    clean.includes('procesal civ') ||
    clean.includes('dpc') ||
    (clean.includes('procesal') && clean.includes('civil')) ||
    clean === 'pciv'
  ) {
    return 'procesal-civil';
  }

  if (
    clean.includes('proc pen') ||
    clean.includes('procesal pen') ||
    clean.includes('dpp') ||
    (clean.includes('procesal') && clean.includes('penal')) ||
    clean === 'ppen'
  ) {
    return 'procesal-penal';
  }

  if (
    clean.includes('const') ||
    clean.includes('constitucion') ||
    clean.includes('europa') ||
    clean.includes('dce') ||
    clean === 'dcon' ||
    clean === 'con'
  ) {
    return 'constitucional';
  }

  if (clean.includes('civil') || clean === 'civ' || clean === 'dc') {
    return 'civil';
  }

  if (clean.includes('penal') || clean === 'pen' || clean === 'dp') {
    return 'penal';
  }

  if (clean.includes('merc') || clean === 'dm') {
    return 'mercantil';
  }

  if (clean.includes('admin') || clean.includes('laboral') || clean.includes('lab') || clean === 'da' || clean === 'dl') {
    return 'administrativo-laboral';
  }

  return null;
}

function extractTopicNumber(idOrTitle?: string | number): number | null {
  if (typeof idOrTitle === 'number') return idOrTitle > 0 ? idOrTitle : null;
  if (!idOrTitle) return null;
  const str = String(idOrTitle).trim();

  // 1. Explicit subject + number (e.g. Civil 14, Penal 3, Consti 5, DPC 8, Procesal Civil 12)
  const subjNum = str.match(/(?:civil|penal|consti(?:tucional)?|procesal(?:[-_\s]*(?:civil|penal))?|dpc|dpp|dce|dc|dp|merc(?:antil)?|admin(?:istrativo)?|laboral)\s*[-_:#T]*\s*(\d+)/i);
  if (subjNum) return parseInt(subjNum[1], 10);

  // 2. Tema 12, T12, T-12, #12
  const matchExplicit = str.match(/(?:tema|t|n[ºo°]|#)\s*[-_:]*\s*(\d+)/i);
  if (matchExplicit) return parseInt(matchExplicit[1], 10);

  // 3. Comienzo con número: "12. Las fuentes", "12 - Las fuentes"
  const matchStart = str.match(/^(\d+)[.\s\-_:]+(?!(?:min|hora|h\b|m\b|s\b|seg|distrac|paus|desc))/i);
  if (matchStart) return parseInt(matchStart[1], 10);

  // 4. Número puro
  const matchPure = str.match(/^(\d+)$/);
  if (matchPure) return parseInt(matchPure[1], 10);

  // 5. Número al final entre paréntesis
  const matchParen = str.match(/\((\d+)\)$/);
  if (matchParen) return parseInt(matchParen[1], 10);

  // 6. Generic word + number
  const matchWordNum = str.match(/(?:[a-zA-Záéíóúñ]+)\s*[-_:]+\s*(\d+)(?!\s*(?:min|h|seg|s\b|m\b|p[áa]g))/i);
  if (matchWordNum) return parseInt(matchWordNum[1], 10);

  // 7. Standalone number
  const matchAnyNum = str.match(/(?<!\d)(?<!\b(?:p[áa]gs?\.?|p\.?)\s*)(\d{1,3})(?!\d)(?!\s*(?:min|mins|hora|horas|h\b|m\b|s\b|seg))/i);
  if (matchAnyNum) {
    const n = parseInt(matchAnyNum[1], 10);
    if (n >= 1 && n <= 150) return n;
  }

  return null;
}

function parseAeroFocusTopicId(rawId?: string): { subjectId: string; number: number } | null {
  if (!rawId) return null;
  const str = rawId.trim();

  const directMatch = str.toLowerCase().match(/^([a-z\-]+)[-_](\d+)$/);
  if (directMatch) {
    const sId = normalizeCategoryToSubjectId(directMatch[1]);
    if (sId) return { subjectId: sId, number: parseInt(directMatch[2], 10) };
  }

  const judMatch = str.toLowerCase().match(/^jud[-_]([a-z\-]+)[-_](\d+)$/);
  if (judMatch) {
    const sId = normalizeCategoryToSubjectId(judMatch[1]);
    if (sId) return { subjectId: sId, number: parseInt(judMatch[2], 10) };
  }

  const upper = str.toUpperCase().replace(/\s+/g, '_');
  if (upper.startsWith('PROC_CIV_') || upper.startsWith('DPC_')) {
    const n = parseInt(upper.replace(/^.*_(\d+)$/, '$1'), 10);
    return { subjectId: 'procesal-civil', number: isNaN(n) ? 1 : n };
  }
  if (upper.startsWith('PROC_PEN_') || upper.startsWith('DPP_')) {
    const n = parseInt(upper.replace(/^.*_(\d+)$/, '$1'), 10);
    return { subjectId: 'procesal-penal', number: isNaN(n) ? 1 : n };
  }
  if (upper.startsWith('CIV_') || upper.startsWith('DC_')) {
    const n = parseInt(upper.replace(/^.*_(\d+)$/, '$1'), 10);
    return { subjectId: 'civil', number: isNaN(n) ? 1 : n };
  }
  if (upper.startsWith('PEN_') || upper.startsWith('DP_')) {
    const n = parseInt(upper.replace(/^.*_(\d+)$/, '$1'), 10);
    return { subjectId: 'penal', number: isNaN(n) ? 1 : n };
  }
  if (upper.startsWith('CONST_') || upper.startsWith('DCE_') || upper.startsWith('CON_')) {
    const n = parseInt(upper.replace(/^.*_(\d+)$/, '$1'), 10);
    return { subjectId: 'constitucional', number: isNaN(n) ? 1 : n };
  }

  const sId = normalizeCategoryToSubjectId(str);
  const num = extractTopicNumber(str);
  if (sId && num) {
    return { subjectId: sId, number: num };
  }

  return null;
}

export default async function handler(req: any, res: any) {
  // 1. Universal CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key, X-Event, X-Flight-Id, X-Transaction-Id, X-Test-Mode, X-Source, X-Test-Ping, X-Token, X-Webhook-Token');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    // 2. Healthcheck / Consultation for Dashboard (GET)
    if (req.method === 'GET') {
      const stored = loadEvents();
      return res.status(200).json({
        ok: true,
        status: 'ok',
        service: 'wellsprep_aerofocus_webhook',
        sessionsCount: stored.length,
        latestSessions: stored.slice(-15).reverse(),
        ready: true,
        timestamp: new Date().toISOString()
      });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // 3. Extract Headers
    const headers = req.headers || {};

    // 4. Extract Payload safely (without blocking stream read)
    let payload: any = req.body || {};
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch {
        payload = {};
      }
    } else if (Buffer.isBuffer(payload)) {
      try {
        payload = JSON.parse(payload.toString('utf-8'));
      } catch {
        payload = {};
      }
    }

    if (payload && typeof payload.payload === 'string') {
      try {
        payload = JSON.parse(payload.payload);
      } catch {}
    }

    if (!payload || typeof payload !== 'object') {
      payload = {};
    }

    // 5. IMMEDIATE TEST HANDSHAKE BYPASS (Solo para pings puros SIN minutos ni temas de estudio)
    const hasStudyData = Boolean(
      (Array.isArray(payload.topics) && payload.topics.length > 0) ||
      (Array.isArray(payload.tasksBreakdown) && payload.tasksBreakdown.length > 0) ||
      (Array.isArray(payload.tasks) && payload.tasks.length > 0) ||
      (Array.isArray(payload.sessions) && payload.sessions.length > 0) ||
      (Array.isArray(payload.studySessions) && payload.studySessions.length > 0) ||
      (Array.isArray(payload.items) && payload.items.length > 0) ||
      (Array.isArray(payload.pageBreakdown) && payload.pageBreakdown.length > 0) ||
      Number(payload.minutosEfectivos || payload.effectiveMinutes || payload.dailyTotalEffectiveMinutes || payload.totalEffectiveStudyMinutes || payload.totalFlightEffectiveMinutes || 0) > 0 ||
      Number(payload.horasEfectivas || payload.effectiveHours || payload.dailyTotalEffectiveHours || 0) > 0 ||
      payload.topicId || payload.topicTitle || payload.tema
    );

    const isPureDiagnosticPing = 
      !hasStudyData && (
        payload.event === 'test_connection' ||
        payload.event === 'ping' ||
        payload.event === 'test_ping' ||
        headers['x-test-ping'] === 'true' ||
        payload.isDiagnosticPing === true ||
        (payload.isTest === true && !hasStudyData)
      );

    if (isPureDiagnosticPing) {
      return res.status(200).json({
        success: true,
        status: 'ok',
        message: 'Enlace operativo AeroFocus Pro <-> WellsPrep',
        timestamp: new Date().toISOString(),
        ready: true,
        mode: 'test_handshake'
      });
    }

    // 6. Security & Token Verification
    const authHeader = headers['authorization'] || headers['Authorization'] || '';
    const apiKey = headers['x-api-key'] || headers['x-token'] || headers['x-webhook-token'] || '';
    const token = apiKey || (typeof authHeader === 'string' && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null);

    if (token && token !== EXPECTED_WEBHOOK_TOKEN && !token.startsWith('wp_') && !token.startsWith('live_')) {
      return res.status(401).json({
        error: 'Token no autorizado',
        status: 'unauthorized',
        message: 'El token proporcionado no coincide con el token esperado en WellsPrep.'
      });
    }

    // 7. Extract Flight & Session Details
    const sessionDate =
      payload.date ||
      payload.fecha ||
      (payload.timestamp ? new Date(payload.timestamp).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);

    const flightId = payload.flightId || payload.transactionId || `wp_${Date.now()}`;
    const transactionId = payload.transactionId || payload.flightId;
    const totalHours = Number(
      payload.horasEfectivas ??
      payload.effectiveHours ??
      payload.totalEffectiveHours ??
      payload.dailyTotalEffectiveHours ??
      0
    );
    const totalMins = Number(
      payload.minutosEfectivos ??
      payload.totalEffectiveStudyMinutes ??
      payload.effectiveMinutes ??
      payload.dailyTotalEffectiveMinutes ??
      payload.totalFlightEffectiveMinutes ??
      Math.round(totalHours * 60)
    );

    // Normalize topics
    let rawTopics: any[] = [];
    if (Array.isArray(payload)) {
      rawTopics = payload;
    } else if (Array.isArray(payload.topics)) {
      rawTopics = payload.topics;
    } else if (Array.isArray(payload.tasksBreakdown)) {
      rawTopics = payload.tasksBreakdown;
    } else if (Array.isArray(payload.sessions)) {
      rawTopics = payload.sessions;
    } else if (Array.isArray(payload.studySessions)) {
      rawTopics = payload.studySessions;
    } else if (Array.isArray(payload.study_sessions)) {
      rawTopics = payload.study_sessions;
    } else if (Array.isArray(payload.items)) {
      rawTopics = payload.items;
    } else if (Array.isArray(payload.tasks)) {
      rawTopics = payload.tasks;
    } else if (Array.isArray(payload.pageBreakdown)) {
      rawTopics = payload.pageBreakdown;
    } else if (payload.topicId || payload.topicTitle || payload.tema || payload.topic || payload.subject || payload.materia) {
      rawTopics = [payload];
    }

    // Fallback if no topics were provided but effective study time was registered
    if (rawTopics.length === 0 && (totalHours > 0 || totalMins > 0)) {
      rawTopics = [{
        materia: payload.materia || payload.subject || 'Derecho Constitucional',
        topicTitle: payload.title || payload.topicTitle || payload.name || 'Sesión de Estudio AeroFocus',
        effectiveMinutes: totalMins || 45,
        effectiveHours: totalHours || ((totalMins || 45) / 60),
        modality: payload.modality || 'repaso'
      }];
    }

    // Filter distractions and breaks
    const filteredRaw = rawTopics.filter(t => {
      const mod = String(t.modalidad || t.modality || t.type || '').toLowerCase();
      if (mod === 'distraction' || mod === 'distraccion' || mod === 'pausa' || mod === 'break' || mod === 'descanso') {
        return false;
      }
      const title = String(t.tema || t.topic || t.topicTitle || '').toLowerCase();
      if (title.includes('distracci') || title.includes('pausa') || title.includes('descanso')) {
        return false;
      }
      return true;
    });

    const resolvedTopics: any[] = [];
    const count = filteredRaw.length || 1;
    const fallbackMinsPerTopic = totalMins > 0 ? Math.max(15, Math.round(totalMins / count)) : 45;

    for (const t of filteredRaw) {
      const titleCandidate = t.tema || t.topicTitle || t.topic || t.title || '';
      const rawMateria = t.materia || t.subject || t.subjectName || t.category || payload.materia || payload.subject;
      const parsedPrefix = parseAeroFocusTopicId(t.topicId || t.temaId || t.id) || parseAeroFocusTopicId(titleCandidate);
      
      const subjectId = parsedPrefix?.subjectId || normalizeCategoryToSubjectId(rawMateria) || normalizeCategoryToSubjectId(titleCandidate) || 'constitucional';
      const topicNumber = parsedPrefix?.number || extractTopicNumber(t.temaNumero) || extractTopicNumber(t.topicNumber) || extractTopicNumber(titleCandidate) || 1;
      const title = titleCandidate || `Tema ${topicNumber}`;
      
      const mins = Number(t.minutosEfectivos ?? t.effectiveMinutes ?? t.durationMinutes ?? fallbackMinsPerTopic);
      const hrs = Number(t.horasEfectivas ?? t.effectiveHours ?? (mins / 60));

      const rawMod = String(t.modalidad || t.modality || t.tipo || payload.modality || 'repaso').toLowerCase();
      let modality = 'repaso';
      if (rawMod.includes('primer') || rawMod.includes('primera') || rawMod.includes('estudio') || rawMod === 'study') {
        modality = 'primer_estudio';
      } else if (rawMod.includes('canto') || rawMod.includes('recit') || rawMod.includes('simulacro')) {
        modality = 'canto';
      } else if (rawMod.includes('refresco') || rawMod.includes('flash') || rawMod.includes('quick')) {
        modality = 'refresco';
      }

      resolvedTopics.push({
        resolvedTopicId: `${subjectId}-${topicNumber}`,
        resolvedSubjectId: subjectId,
        resolvedTopicNumber: topicNumber,
        resolvedTopicTitle: title,
        effectiveMinutes: mins,
        effectiveHours: Math.round(hrs * 100) / 100,
        modality,
        isTopicCompleted: Boolean(t.isTopicCompleted || t.completed || t.vueltaCompletada),
        completesVuelta: Boolean(t.completesVuelta || t.vueltaCompletada),
        notes: t.notes || 'Sincronizado vía AeroFocus Webhook',
        original: t
      });
    }

    const calculatedMins = totalMins || resolvedTopics.reduce((acc, t) => acc + (t.effectiveMinutes || 0), 0);
    const calculatedHours = totalHours || Math.round((calculatedMins / 60) * 100) / 100;

    const record = {
      id: `af_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      receivedAt: new Date().toISOString(),
      date: sessionDate,
      source: payload.source || 'aerofocus_pro',
      flightId: String(flightId),
      transactionId: String(transactionId || flightId),
      dailyTotalEffectiveHours: calculatedHours,
      totalFlightEffectiveMinutes: calculatedMins,
      totalFlightEffectiveHours: calculatedHours,
      status: 'pending',
      topics: resolvedTopics,
      rawPayload: payload,
      pilotCallsign: payload.pilotCallsign || payload.callsignName || 'Piloto AeroFocus',
      focusScore: payload.focusScore || 100
    };

    const currentEvents = loadEvents();
    currentEvents.unshift(record);
    saveEvents(currentEvents);

    return res.status(200).json({
      status: 'ok',
      synced: true,
      success: true,
      date: sessionDate,
      transactionId: transactionId || flightId,
      processedTopics: resolvedTopics.length,
      effectiveHours: calculatedHours,
      quarantined: false,
      isQuarantined: false,
      recordId: record.id,
      message: `Aterrizaje sincronizado con éxito. ${calculatedHours}h netas incorporadas en WellsPrep`
    });
  } catch (err: any) {
    console.error('[AeroFocus Serverless Webhook] Catch-all error:', err);
    return res.status(500).json({
      error: err?.message || 'Error interno procesando webhook',
      status: 'error',
      synced: false
    });
  }
}
