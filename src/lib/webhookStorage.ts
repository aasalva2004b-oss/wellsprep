import fs from 'fs';
import path from 'path';
import { WebhookSyncRecord, WebhookResolvedTopic, AeroFocusWebhookPayload } from './webhookTypes';
import { resolveAeroFocusTopic } from './topicResolver';

export const EXPECTED_WEBHOOK_TOKEN = 'wp_qLXi6WFkFY_live';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Event, X-API-Key, X-Source, X-Test-Ping, X-Token, X-Webhook-Token',
};

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

  const transactionId = payload.transactionId || payload.flightId;
  const totalHours = Number(payload.horasEfectivas ?? payload.dailyTotalEffectiveHours ?? payload.totalEffectiveHours ?? 0);
  const totalMins = Number(payload.minutosEfectivos ?? payload.dailyTotalEffectiveMinutes ?? payload.totalFlightEffectiveMinutes ?? Math.round(totalHours * 60));

  // 3. Normalizar array de temas desde cualquier variante de AeroFocus
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

  for (const t of rawTopics) {
    const materia = t.materia || t.subject || t.subjectName || t.asignatura || t.category || payload.materia || payload.subject || 'Derecho Constitucional';
    const numeroTema = t.temaNumero ?? t.topicNumber ?? null;
    const titulo = t.tema || t.topic || t.topicTitle || (numeroTema ? `Tema ${numeroTema}` : 'Tema');
    const modalidad = t.modalidad || t.modality || t.type || 'repaso';
    const horas = Number(t.horasEfectivas ?? t.effectiveHours ?? (t.effectiveMinutes ? t.effectiveMinutes / 60 : 0));
    const minutos = Number(t.minutosEfectivos ?? t.effectiveMinutes ?? Math.round(horas * 60));
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
          effectiveMinutes: minutos || resolved.effectiveMinutes,
          effectiveHours: horas || resolved.effectiveHours,
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
          effectiveMinutes: minutos || 30,
          effectiveHours: horas || 0.5,
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
  const flightId = String(payload.flightId || transactionId || `vuelo_${sessionDate}`);

  const record: WebhookSyncRecord = {
    id: `af_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    receivedAt: new Date().toISOString(),
    date: sessionDate,
    source: payload.source || 'aerofocus_pro',
    flightId,
    transactionId: transactionId || flightId,
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
      message: payload.message || 'Cierre diario sincronizado con éxito en WellsPrep'
    },
    createdRecord: record
  };
}
