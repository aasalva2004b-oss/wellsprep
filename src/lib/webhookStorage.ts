import fs from 'fs';
import path from 'path';
import { WebhookSyncRecord, WebhookResolvedTopic, AeroFocusWebhookPayload } from './webhookTypes';
import { resolveAeroFocusTopic, extractMinutesFromAeroItem } from './topicResolver';

export const EXPECTED_WEBHOOK_TOKEN = 'wp_qLXi6WFkFY_live';

// Buffer en memoria persistente en el entorno serverless de Vercel y local
declare global {
  var __wellsprep_sessions: any[] | undefined;
}
if (!globalThis.__wellsprep_sessions) {
  globalThis.__wellsprep_sessions = [];
}

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key, X-Event, X-Flight-Id, X-Transaction-Id, X-Test-Mode, X-Source, X-Test-Ping, X-Token, X-Webhook-Token',
};

/**
 * Consulta de estado y sesiones pendientes para el Dashboard o Frontend
 */
export function getWebhookHealthOrSessions() {
  let sessions = globalThis.__wellsprep_sessions || [];
  if (sessions.length === 0) {
    const stored = loadWebhookEvents();
    if (stored.length > 0) {
      sessions = stored.map(s => ({
        id: s.flightId || s.transactionId || s.id,
        receivedAt: s.receivedAt,
        payload: s.rawPayload || s
      }));
      globalThis.__wellsprep_sessions = sessions;
    }
  }
  return {
    ok: true,
    status: 'ok',
    service: 'wellsprep_aerofocus_webhook',
    sessionsCount: sessions.length,
    latestSessions: sessions.slice(-15),
    ready: true
  };
}

// In-memory fallback in case of strict read-only serverless filesystems
let memoryEvents: WebhookSyncRecord[] = [];

/**
 * Returns safe file path for event storage across environments (Local Node vs Vercel Serverless)
 */
export function getWebhookEventsFilePath(): string {
  try {
    const primary = path.join(process.cwd(), 'uploads', 'aerofocus_events.json');
    const dir = path.dirname(primary);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return primary;
  } catch {
    const fallback = path.join('/tmp', 'aerofocus_events.json');
    try {
      const dir = path.dirname(fallback);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    } catch {}
    return fallback;
  }
}

/**
 * Read stored events
 */
export function loadWebhookEvents(): WebhookSyncRecord[] {
  try {
    const filePath = getWebhookEventsFilePath();
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        memoryEvents = parsed;
        return parsed;
      }
    }
  } catch (e) {
    console.warn('[AeroFocus Webhook] Fallback reading events from memory:', e);
  }
  return memoryEvents;
}

/**
 * Save events safely
 */
export function saveWebhookEvents(events: WebhookSyncRecord[]): void {
  const trimmed = events.slice(-150);
  memoryEvents = trimmed;
  if (events.length === 0) {
    globalThis.__wellsprep_sessions = [];
  }
  try {
    const filePath = getWebhookEventsFilePath();
    fs.writeFileSync(filePath, JSON.stringify(trimmed, null, 2), 'utf-8');
  } catch (e) {
    console.warn('[AeroFocus Webhook] Error writing events to file, preserved in memory:', e);
  }
}

/**
 * Validates request token against expected token
 */
export function isAuthorizedWebhookRequest(headers: Record<string, any>): boolean {
  const authHeader = headers['authorization'] || headers['Authorization'];
  const apiKey = headers['x-api-key'] || headers['x-token'] || headers['x-webhook-token'];
  const token = apiKey || (typeof authHeader === 'string' && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null);

  // If a token was provided, it must match
  if (token && token !== EXPECTED_WEBHOOK_TOKEN) {
    return false;
  }
  return true;
}

/**
 * Core processor for AeroFocus Pro transmissions (Schema 2.0.0 & universal aliases)
 */
export function processIncomingAeroFocusPayload(
  payload: AeroFocusWebhookPayload | any,
  headers: Record<string, any> = {}
): { statusCode: number; responseData: any; createdRecord?: WebhookSyncRecord } {
  // 1. Handshake / Connection Test
  if (payload.isTest || payload.event === 'test_connection' || headers['x-test-ping']) {
    return {
      statusCode: 200,
      responseData: {
        success: true,
        status: 'ok',
        message: 'Enlace operativo AeroFocus Pro <-> WellsPrep'
      }
    };
  }

  // 2. Extraer fecha de sesión
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

  // 1. Registro en buffer de memoria global (compatible con GET /api/webhook/aerofocus)
  const buffer = globalThis.__wellsprep_sessions || [];
  buffer.unshift({
    id: flightId,
    receivedAt: new Date().toISOString(),
    payload
  });
  if (buffer.length > 50) buffer.pop();
  globalThis.__wellsprep_sessions = buffer;

  // 2. Normalizar array de temas desde cualquier variante de AeroFocus
  let rawTopics: any[] = [];
  if (Array.isArray(payload)) {
    rawTopics = payload;
  } else if (Array.isArray(payload.topics)) {
    rawTopics = payload.topics;
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
  } else if (Array.isArray(payload.blocks)) {
    rawTopics = payload.blocks;
  } else if (payload.data && Array.isArray(payload.data.topics)) {
    rawTopics = payload.data.topics;
  } else if (payload.topicId || payload.topicTitle || payload.topicNumber || payload.tema || payload.topic || payload.subject || payload.materia) {
    rawTopics = [payload];
  }

  // Si es un ping explícito sin contenido de estudio
  if (payload.event === 'ping') {
    return {
      statusCode: 200,
      responseData: {
        status: 'ok',
        synced: true,
        date: sessionDate,
        transactionId: transactionId || `ping_${sessionDate}`,
        processedTopics: 0,
        effectiveHours: 0,
        message: 'Conexión probada con éxito entre AeroFocus Pro y Wellsprep'
      }
    };
  }

  // 4. Mapeo dinámico y resolución de temas
  const resolvedTopics: WebhookResolvedTopic[] = [];

  // Filtrar temas que sean meras marcas de distracción o pausa
  const filteredRawTopics = rawTopics.filter(t => {
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

  const topicsCount = filteredRawTopics.length || 1;
  const distributedFallbackMins = totalMins > 0 ? Math.max(15, Math.round(totalMins / topicsCount)) : 45;

  for (const t of filteredRawTopics) {
    const materia = t.materia || t.subject || t.subjectName || t.asignatura || t.category || payload.materia || payload.subject || 'Derecho Constitucional';
    const numeroTema = t.temaNumero ?? t.topicNumber ?? null;
    const titulo = t.tema || t.topic || t.topicTitle || (numeroTema ? `Tema ${numeroTema}` : 'Tema');
    const modalidad = t.modalidad || t.modality || t.type || 'repaso';
    
    // Extracción robusta de minutos individuales del tema
    const directMins = extractMinutesFromAeroItem(t, 0);
    const minutos = directMins > 0 ? directMins : distributedFallbackMins;
    const horas = Math.round((minutos / 60) * 100) / 100;

    // Descartar sesiones fantasmas de 1 minuto procedentes de pings o clics accidentales
    if (minutos <= 1 && !t.cantoGrade && !t.grade) {
      continue;
    }

    const startPage = t.startPage ?? t.pages?.pageStart ?? null;
    const endPage = t.endPage ?? t.pages?.pageEnd ?? null;
    const pagesCount = Number(t.pagesCount ?? t.pages?.pagesCount ?? (startPage && endPage ? endPage - startPage + 1 : 0));
    const pagesText = t.pagesText ?? t.paginas ?? t.pages?.rawText ?? (startPage && endPage ? `Págs. ${startPage}-${endPage}` : undefined);
    const isCompleted = Boolean(t.completado || t.completed || t.isTopicCompleted || t.status === 'completed');

    const enriched = {
      ...t,
      topicId: t.topicId || (numeroTema ? `tema-${numeroTema}` : undefined),
      topicNumber: numeroTema,
      topicTitle: titulo,
      category: materia,
      materia,
      modality: modalidad,
      effectiveHours: horas,
      effectiveMinutes: minutos,
      startPage,
      endPage,
      pagesCount,
      pagesText,
      isTopicCompleted: isCompleted,
      status: t.status || (isCompleted ? 'completed' : 'in_progress')
    };

    const resolved = resolveAeroFocusTopic(enriched);

    const topicItem: WebhookResolvedTopic = resolved
      ? {
          ...resolved,
          effectiveMinutes: minutos,
          effectiveHours: horas,
          startPage: startPage ?? resolved.startPage,
          endPage: endPage ?? resolved.endPage,
          pagesCount: pagesCount || resolved.pagesCount,
          pagesText: pagesText || resolved.pagesText,
          isTopicCompleted: isCompleted || resolved.isTopicCompleted,
          completesVuelta: isCompleted || resolved.completesVuelta,
          original: t
        }
      : {
          resolvedTopicId: String(t.topicId || (numeroTema ? `constitucional-${numeroTema}` : 'topic-unknown')),
          resolvedSubjectId: 'constitucional',
          resolvedTopicNumber: Number(numeroTema || 0),
          resolvedTopicTitle: titulo,
          effectiveMinutes: minutos,
          effectiveHours: horas,
          modality: 'repaso',
          startPage: startPage ?? undefined,
          endPage: endPage ?? undefined,
          pagesCount: pagesCount || undefined,
          pagesText: pagesText || undefined,
          isTopicCompleted: isCompleted,
          completesVuelta: isCompleted,
          notes: t.notes || 'Sincronizado vía AeroFocus Webhook',
          original: t
        };

    resolvedTopics.push(topicItem);
  }

  const calculatedEffectiveMinutes = totalMins || resolvedTopics.reduce((acc, t) => acc + (t.effectiveMinutes || 0), 0);
  const calculatedEffectiveHours = totalHours || Math.round((calculatedEffectiveMinutes / 60) * 100) / 100;

  const record: WebhookSyncRecord = {
    id: `af_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    receivedAt: new Date().toISOString(),
    date: sessionDate,
    source: payload.source || 'aerofocus_pro',
    flightId: String(flightId),
    transactionId: String(transactionId || flightId),
    dailyTotalEffectiveHours: calculatedEffectiveHours,
    totalFlightEffectiveMinutes: calculatedEffectiveMinutes,
    totalFlightEffectiveHours: calculatedEffectiveHours,
    status: 'quarantined',
    topics: resolvedTopics,
    rawPayload: payload,
    reportMarkdown: payload.reportMarkdown,
    pilotCallsign: payload.pilotCallsign || payload.callsignName,
    focusScore: payload.focusScore,
    summary: payload.summary || {
      estudioHours: resolvedTopics.filter(t => t.modality === 'primer_estudio').reduce((a, b) => a + (b.effectiveHours || 0), 0),
      repasoHours: resolvedTopics.filter(t => t.modality === 'repaso').reduce((a, b) => a + (b.effectiveHours || 0), 0),
      refrescoHours: resolvedTopics.filter(t => t.modality === 'refresco').reduce((a, b) => a + (b.effectiveHours || 0), 0),
      cantoHours: resolvedTopics.filter(t => t.modality === 'canto').reduce((a, b) => a + (b.effectiveHours || 0), 0),
      totalHours: calculatedEffectiveHours
    }
  };

  const currentEvents = loadWebhookEvents();
  currentEvents.push(record);
  saveWebhookEvents(currentEvents);

  return {
    statusCode: 200,
    responseData: {
      status: 'ok',
      synced: true,
      date: sessionDate,
      transactionId: transactionId || flightId,
      processedTopics: resolvedTopics.length,
      effectiveHours: calculatedEffectiveHours,
      quarantined: true,
      recordId: record.id,
      message: payload.message || `Registradas ${calculatedEffectiveHours}h netas en WellsPrep`
    },
    createdRecord: record
  };
}
