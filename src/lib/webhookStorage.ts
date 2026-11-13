import type { WebhookSyncRecord, WebhookResolvedTopic, WellsprepAnalyticsV2, WellsprepPageStatV2, WellsprepPlsemaBreakdown, WellsprepSessionTelemetryV2, WellsprepTaskDetailV2, AeroFocusWebhookResponseV2 } from './webhookTypes';
import { resolveAeroFocusTopic, extractMinutesFromAeroItem, normalizeCategoryToSubjectId, extractTopicNumber } from './topicResolver';

// Pure normalization only. Persistence and authentication are server-only and
// partitioned by verified UID in server/aerofocusStore.ts. No file/global fallback.
/**
 * Motor central de ingesta, idempotencia y reconciliación para AeroFocus Pro v2.2.0
 */
export function processIncomingAeroFocusPayload(
  rawPayload: any,
  headers: Record<string, any> = {}
): { statusCode: number; responseData: any; createdRecord?: WebhookSyncRecord } {
  // 1. Dual parse: Si llega como texto/string por failover de AeroFocus
  let payload: any = rawPayload;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
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

  // 2. Filtro estricto de Pings de Diagnóstico (Solo para comprobaciones puras sin tiempo ni temas)
  const hasStudyData = Boolean(
    (Array.isArray(payload.topics) && payload.topics.length > 0) ||
    (Array.isArray(payload.tasksBreakdown) && payload.tasksBreakdown.length > 0) ||
    (Array.isArray(payload.tasks) && payload.tasks.length > 0) ||
    (Array.isArray(payload.sessions) && payload.sessions.length > 0) ||
    (Array.isArray(payload.items) && payload.items.length > 0) ||
    (Array.isArray(payload.pageBreakdown) && payload.pageBreakdown.length > 0) ||
    Number(payload.dailyTotalEffectiveMinutes || payload.minutosEfectivos || payload.totalEffectiveStudyMinutes || payload.effectiveMinutes || payload.totalFlightEffectiveMinutes || 0) > 0 ||
    Number(payload.dailyTotalEffectiveHours || payload.horasEfectivas || payload.effectiveHours || 0) > 0 ||
    payload.topicId || payload.topicTitle || payload.tema
  );

  const isDiagnosticPing =
    !hasStudyData && (
      payload.isDiagnosticPing === true ||
      payload.isTestPing === true ||
      headers['x-test-ping'] === 'true' ||
      headers['X-Test-Ping'] === 'true' ||
      payload.event === 'test_connection' ||
      payload.event === 'ping' ||
      payload.event === 'test_ping' ||
      (payload.isTest === true && !hasStudyData)
    );

  if (isDiagnosticPing) {
    return {
      statusCode: 200,
      responseData: {
        ok: true,
        status: 'connected',
        schemaSupported: '2.2.0',
        message: 'Enlace AeroFocus Pro <-> WellsPrep operativo'
      }
    };
  }

  // 3. Extracción de Identificadores y Fechas
  const eventName = payload.event || (payload.syncScope === 'full_history' ? 'full_history_sync' : 'daily_sync');
  const syncScope = payload.syncScope || (eventName === 'full_history_sync' || payload.isFullHistorySync ? 'full_history' : eventName === 'study_session_completed' ? 'single_session' : 'daily');
  const isFullHistory = eventName === 'full_history_sync' || syncScope === 'full_history' || Boolean(payload.isFullHistorySync);

  const sessionDate =
    payload.date ||
    payload.fecha ||
    (payload.timestamp ? new Date(payload.timestamp).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);

  const suppliedId = payload.transactionId || payload.flightId || headers['x-transaction-id'] || headers['x-flight-id'];
  if (typeof suppliedId !== 'string' || !suppliedId.trim() || suppliedId.length > 400) return { statusCode: 400, responseData: { ok: false, error: 'Se requiere flightId o transactionId estable.' } };
  if (typeof sessionDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(sessionDate) || !Number.isFinite(Date.parse(sessionDate))) return { statusCode: 400, responseData: { ok: false, error: 'Fecha no válida.' } };
  const flightId = suppliedId.trim();
  const transactionId = String(payload.transactionId || flightId);

  // 4. Métricas de Tiempo de la transmisión
  const totalMins = Number(
    payload.dailyTotalEffectiveMinutes ??
    payload.minutosEfectivos ??
    payload.totalEffectiveStudyMinutes ??
    payload.effectiveMinutes ??
    payload.totalFlightEffectiveMinutes ??
    0
  );
  const totalHours = Number(
    payload.dailyTotalEffectiveHours ??
    payload.horasEfectivas ??
    payload.effectiveHours ??
    payload.totalEffectiveHours ??
    (totalMins > 0 ? Math.round((totalMins / 60) * 100) / 100 : 0)
  );

  // 5. Extraer y persistir snapshot global si viene en el payload
  const analyticsSnapshot: WellsprepAnalyticsV2 | undefined =
    payload.analytics || payload.estadisticasGlobales;


  // 6. Normalizar y resolver temas de la transmisión
  let incomingRawTopics: any[] = [];
  if (Array.isArray(payload.topics)) {
    incomingRawTopics = payload.topics;
  } else if (Array.isArray(payload.sessions)) {
    incomingRawTopics = payload.sessions;
  } else if (Array.isArray(payload.items)) {
    incomingRawTopics = payload.items;
  } else if (Array.isArray(payload.tasks)) {
    incomingRawTopics = payload.tasks;
  } else if (Array.isArray(payload.tasksBreakdown)) {
    incomingRawTopics = payload.tasksBreakdown;
  } else if (Array.isArray(payload)) {
    incomingRawTopics = payload;
  } else if (payload.topicId || payload.topicTitle || payload.topicNumber || payload.tema) {
    incomingRawTopics = [payload];
  }

  // Filtrar distracciones / pausas explícitas
  const filteredTopics = incomingRawTopics.filter(t => {
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

  const topicsCount = filteredTopics.length || 1;
  const fallbackMins = Number.isFinite(totalMins) && totalMins > 0 && topicsCount === 1 ? totalMins : 0;

  const resolvedTopics: WebhookResolvedTopic[] = [];
  for (const t of filteredTopics) {
    const resolved = resolveAeroFocusTopic(t);
    const directMins = extractMinutesFromAeroItem(t, 0);
    const mins = directMins > 0 ? directMins : fallbackMins;
    const hrs = Math.round((mins / 60) * 100) / 100;

    if (resolved) {
      resolvedTopics.push({
        ...resolved,
        effectiveMinutes: mins,
        effectiveHours: hrs,
        plsema: t.plsema || resolved.plsema,
        minutesPerPage: t.minutesPerPage ?? t.minutosPorPagina ?? resolved.minutesPerPage,
        secondsPerPage: t.secondsPerPage ?? t.segundosPorPagina ?? resolved.secondsPerPage,
        pageBreakdown: t.pageBreakdown || resolved.pageBreakdown,
        tasksBreakdown: t.tasksBreakdown || resolved.tasksBreakdown,
      });
    } else {
      const rawTitle = t.topicTitle || t.tema || t.topic || t.title || '';
      const materia = t.materia || t.subject || t.category || '';
      const subId = normalizeCategoryToSubjectId(materia) || normalizeCategoryToSubjectId(rawTitle);
      const parsedNum = extractTopicNumber(t.temaNumero) || extractTopicNumber(t.topicNumber) || extractTopicNumber(rawTitle) || extractTopicNumber(t.id);
      
      const num = parsedNum && parsedNum > 0 ? parsedNum : undefined;
      const targetSub = subId || 'unknown';
      const topicId = num && subId ? `${targetSub}-${num}` : (rawTitle ? `pendiente_${Date.now()}` : 'pendiente_clasificacion');
      const topicTitle = rawTitle || (num ? `Tema ${num} (${targetSub})` : 'Sesión pendiente de clasificar');

      resolvedTopics.push({
        resolvedTopicId: topicId,
        resolvedSubjectId: targetSub,
        resolvedTopicNumber: num,
        resolvedTopicTitle: topicTitle,
        modality: (t.modalidad || t.modality || t.type || 'repaso') as any,
        effectiveMinutes: mins,
        effectiveHours: hrs,
        plsema: t.plsema,
        minutesPerPage: t.minutesPerPage ?? t.minutosPorPagina,
        pageBreakdown: t.pageBreakdown,
        tasksBreakdown: t.tasksBreakdown,
        original: t
      });
    }
  }

  // Desglose de páginas y tareas en raíz
  const pageBreakdown: WellsprepPageStatV2[] =
    Array.isArray(payload.pageBreakdown) ? payload.pageBreakdown : [];
  const tasksBreakdown: WellsprepTaskDetailV2[] =
    Array.isArray(payload.tasksBreakdown) ? payload.tasksBreakdown : [];
  const sessionsTelemetry: WellsprepSessionTelemetryV2[] =
    Array.isArray(payload.sessions) ? payload.sessions : [];
  const plsemaRoot: WellsprepPlsemaBreakdown | undefined =
    payload.plsema || payload.fasesPlsema;

  const calculatedEffectiveMinutes =
    totalMins > 0
      ? totalMins
      : resolvedTopics.reduce((acc, t) => acc + (t.effectiveMinutes || 0), 0);
  const calculatedEffectiveHours =
    totalHours > 0
      ? totalHours
      : Math.round((calculatedEffectiveMinutes / 60) * 100) / 100;

  // 7. IDEMPOTENCIA DETERMINISTA (CERO DUPLICADOS)
  const currentEvents: WebhookSyncRecord[] = [];
  let updatedEvents: WebhookSyncRecord[] = [];

  const newRecord: WebhookSyncRecord = {
    id: `af_${sessionDate}_${flightId}`,
    receivedAt: new Date().toISOString(),
    date: sessionDate,
    source: payload.source || 'aerofocus_pro',
    flightId: flightId,
    transactionId: transactionId,
    flightIdsIncluded: Array.isArray(payload.flightIdsIncluded) ? payload.flightIdsIncluded : [flightId],
    syncScope: syncScope,
    schemaVersion: '2.2.0',
    dailyTotalEffectiveHours: calculatedEffectiveHours,
    dailyTotalEffectiveMinutes: calculatedEffectiveMinutes,
    totalFlightEffectiveMinutes: calculatedEffectiveMinutes,
    totalFlightEffectiveHours: calculatedEffectiveHours,
    status: 'pending',
    topics: resolvedTopics,
    pageBreakdown: pageBreakdown.length > 0 ? pageBreakdown : undefined,
    tasksBreakdown: tasksBreakdown.length > 0 ? tasksBreakdown : undefined,
    sessionsTelemetry: sessionsTelemetry.length > 0 ? sessionsTelemetry : undefined,
    plsema: plsemaRoot,
    analytics: analyticsSnapshot,
    rawPayload: payload,
    reportMarkdown: payload.reportMarkdown,
    pilotCallsign: payload.pilotCallsign || payload.callsignName,
    focusScore: payload.focusScore,
    avgMinutesPerPage: payload.avgMinutesPerPage ?? payload.minutosPorPagina,
    totalPagesWorked: payload.totalPagesWorked ?? payload.paginasTrabajadas,
    summary: payload.summary || {
      estudioHours: resolvedTopics.filter(t => t.modality === 'primer_estudio').reduce((a, b) => a + (b.effectiveHours || 0), 0),
      repasoHours: resolvedTopics.filter(t => t.modality === 'repaso').reduce((a, b) => a + (b.effectiveHours || 0), 0),
      refrescoHours: resolvedTopics.filter(t => t.modality === 'refresco').reduce((a, b) => a + (b.effectiveHours || 0), 0),
      cantoHours: resolvedTopics.filter(t => t.modality === 'canto').reduce((a, b) => a + (b.effectiveHours || 0), 0),
      totalHours: calculatedEffectiveHours
    }
  };

  // 8. Respuesta estandarizada requerida por AeroFocus Pro (Sección 5)
  const avgPace = Number(
    payload.avgMinutesPerPage ??
    payload.minutosPorPagina ??
    analyticsSnapshot?.pagesPace?.avgMinutesPerPage ??
    (pageBreakdown.length > 0 && calculatedEffectiveMinutes > 0
      ? Math.round((calculatedEffectiveMinutes / pageBreakdown.length) * 100) / 100
      : 0)
  );

  const responseData: AeroFocusWebhookResponseV2 & Record<string, any> = {
    ok: true,
    success: true,
    synced: true,
    status: 'ok',
    quarantined: true,
    isQuarantined: true,
    schemaVersion: '2.2.0',
    receivedEvent: eventName,
    transactionId: transactionId,
    flightId: flightId,
    date: sessionDate,
    reconciledFlightsCount: Array.isArray(payload.flightIdsIncluded) ? payload.flightIdsIncluded.length : 1,
    effectiveMinutesAssigned: calculatedEffectiveMinutes,
    effectiveHoursAssigned: calculatedEffectiveHours,
    pagesAssigned: pageBreakdown.length || Number(payload.totalPagesWorked || 0),
    avgMinutesPerPage: avgPace,
    plsemaAssigned: Boolean(plsemaRoot || resolvedTopics.some(t => Boolean(t.plsema))),
    globalAnalyticsUpdated: Boolean(analyticsSnapshot),
    message: 'Transmisión recibida en cuarentena; las sesiones requieren validación.'
  };

  return {
    statusCode: 200,
    responseData,
    createdRecord: newRecord
  };
}
