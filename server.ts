import express from "express";
import path from "path";
import multer from "multer";
import { GoogleGenAI, Type } from "@google/genai";
import fs from "fs";

// NOTE: require Vite explicitly to avoid ts-node / tsx dynamic import issues
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;
  const upload = multer({ dest: 'uploads/' });

  // Robust parsing: JSON, URL-encoded, and raw text (for non-standard webhook senders)
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(express.text({ type: ['text/*', 'application/javascript'], limit: '10mb' }));

  // CORS middleware for external webhooks
  app.use('/api/webhook', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.setHeader('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    next();
  });

  app.post("/api/parse-pdf", upload.single("pdf"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file provided" });
      }

      const ai = new GoogleGenAI({ 
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
      });

      const fileBuffer = fs.readFileSync(req.file.path);
      const base64Data = fileBuffer.toString("base64");
      const mimeType = req.file.mimetype || "application/pdf";

      const prompt = `Extract the study plan table from this document. 
Notice the month/year (like "Sep-26") and the subject code (like "CONST").
Map "CONST" to "constitucional", "CIVIL" to "civil", "PENAL" to "penal", etc.
For each row that has tasks, extract:
- date: calculate the ISO date string based on the month/year and the day number in the first column (e.g., "V-4" -> day 4 of Sep 2026).
- newTopics: array of strings representing the topic numbers from the "Nuevo" column.
- reviewTopics: array of strings representing the topic numbers from the "Refresco" column.
- subjectId: the subject ID mapped from the document.

Return a JSON array of these objects. ONLY valid JSON.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: [
          { inlineData: { data: base64Data, mimeType } },
          prompt
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                date: { type: Type.STRING },
                newTopics: { type: Type.ARRAY, items: { type: Type.STRING } },
                reviewTopics: { type: Type.ARRAY, items: { type: Type.STRING } },
                subjectId: { type: Type.STRING }
              },
              required: ["date", "newTopics", "reviewTopics", "subjectId"]
            }
          }
        }
      });

      fs.unlinkSync(req.file.path);

      res.json(JSON.parse(response.text || "[]"));
    } catch (error: any) {
      console.error("Gemini Parse Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Webhook event store helper
  const eventsFilePath = path.join(process.cwd(), 'uploads', 'aerofocus_events.json');
  function loadWebhookEvents() {
    try {
      if (!fs.existsSync(path.dirname(eventsFilePath))) {
        fs.mkdirSync(path.dirname(eventsFilePath), { recursive: true });
      }
      if (fs.existsSync(eventsFilePath)) {
        const raw = fs.readFileSync(eventsFilePath, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (e) {
      console.error("Error reading webhook events:", e);
    }
    return [];
  }

  function saveWebhookEvents(events: any[]) {
    try {
      if (!fs.existsSync(path.dirname(eventsFilePath))) {
        fs.mkdirSync(path.dirname(eventsFilePath), { recursive: true });
      }
      // Keep last 150 events to avoid unbounded file growth
      const trimmed = events.slice(-150);
      fs.writeFileSync(eventsFilePath, JSON.stringify(trimmed, null, 2), 'utf-8');
    } catch (e) {
      console.error("Error saving webhook events:", e);
    }
  }

  // SSE active listeners
  let sseClients: express.Response[] = [];

  function broadcastWebhookEvent(event: any) {
    sseClients.forEach(client => {
      try {
        client.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch (err) {
        // client closed
      }
    });
  }

  const EXPECTED_TOKEN = 'wp_qLXi6WFkFY_live';
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Event, X-API-Key, X-Source, X-Test-Ping',
  };

  // Webhook endpoint for AeroFocus Pro (supports all variations and routes)
  app.all([
    "/api/webhook/aerofocus",
    "/api/webhook/aerofocus/",
    "/api/webhook/aerofocus/route",
    "/api/webhook/aerofocus/route.ts",
    "/api/webhook/aerofocus.js",
    "/api/webhook/aerofocus.ts",
    "/api/webhook",
    "/api/webhook/",
    "/api/aerofocus",
    "/api/sync/aerofocus"
  ], async (req, res) => {
    // 1. Cabeceras CORS universales obligatorias
    res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
    res.setHeader('Access-Control-Allow-Methods', corsHeaders['Access-Control-Allow-Methods']);
    res.setHeader('Access-Control-Allow-Headers', corsHeaders['Access-Control-Allow-Headers']);

    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }

    // Comprobación de salud rápida (GET)
    if (req.method === 'GET') {
      return res.status(200).json({ status: 'ok', service: 'wellsprep_aerofocus_webhook', ready: true });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
      // 1. Verificación de Seguridad
      const authHeader = req.headers.authorization;
      const apiKey = (req.headers['x-api-key'] || req.headers['x-token'] || req.headers['x-webhook-token']) as string | undefined;
      const token = apiKey || (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null);

      if (token && token !== EXPECTED_TOKEN) {
        console.warn(`[AeroFocus Webhook] Token no autorizado: "${token}". Esperado: "${EXPECTED_TOKEN}"`);
        return res.status(401).json({ error: 'Token no autorizado' });
      }

      // 2. Extracción y normalización de Payload (admite JSON, string crudo, URL-encoded)
      let payload = req.body;
      if (typeof payload === 'string') {
        try {
          payload = JSON.parse(payload);
        } catch {
          payload = {};
        }
      } else if (!payload || typeof payload !== 'object') {
        payload = {};
      }

      if (typeof payload.payload === 'string') {
        try { payload = JSON.parse(payload.payload); } catch {}
      }

      console.log(`[AeroFocus Webhook] Recibida petición desde ${req.ip}. Evento: ${payload.event || 'daily_sync'}. Token provisto: ${Boolean(token)}`);

      // 3. Test de conexión / Handshake de AeroFocus (no toca la base de datos)
      if (payload.isTest || payload.event === 'test_connection' || req.headers['x-test-ping']) {
        return res.status(200).json({
          success: true,
          status: 'ok',
          message: 'Enlace operativo AeroFocus Pro <-> WellsPrep'
        });
      }

      // 4. Extracción universal con aliases planos
      const { date, fecha, transactionId } = payload;
      const sessionDate = date || fecha || (payload.timestamp ? new Date(payload.timestamp).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
      const totalHours = Number(payload.horasEfectivas ?? payload.dailyTotalEffectiveHours ?? payload.totalEffectiveHours ?? 0);
      const totalMins = Number(payload.minutosEfectivos ?? payload.dailyTotalEffectiveMinutes ?? payload.totalFlightEffectiveMinutes ?? Math.round(totalHours * 60));

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
        return res.status(200).json({
          status: "ok",
          synced: true,
          date: sessionDate,
          transactionId: transactionId || `ping_${sessionDate}`,
          processedTopics: 0,
          effectiveHours: 0,
          message: "Conexión probada con éxito entre AeroFocus Pro y Wellsprep"
        });
      }

      // Si no se encontraron temas pero venía tiempo efectivo
      if (rawTopics.length === 0 && (totalHours > 0 || totalMins > 0)) {
        rawTopics = [{
          materia: payload.materia || payload.subject || "Derecho Constitucional",
          topicTitle: payload.title || payload.topicTitle || payload.name || "Sesión AeroFocus Pro",
          effectiveMinutes: totalMins || 45,
          effectiveHours: totalHours || (totalMins / 60),
          modality: payload.modality || "estudio"
        }];
      }

      // Dynamic import to ensure clean resolution
      const { resolveAeroFocusTopic } = await import("./src/lib/topicResolver");
      const resolvedTopics: any[] = [];

      for (const t of rawTopics) {
        const materia = t.materia || t.subject || t.subjectName || t.category || payload.materia || payload.subject || 'Derecho Constitucional';
        const numeroTema = t.temaNumero ?? t.topicNumber ?? null;
        const titulo = t.tema || t.topic || t.topicTitle || (numeroTema ? `Tema ${numeroTema}` : 'Tema');
        const modalidad = t.modalidad || t.modality || t.type || 'estudio';
        const horas = Number(t.horasEfectivas ?? t.effectiveHours ?? (t.effectiveMinutes ? Number(t.effectiveMinutes) / 60 : 0)) || 0;
        const minutos = Number(t.minutosEfectivos ?? t.effectiveMinutes ?? Math.round(horas * 60)) || 0;
        const startPage = t.startPage ?? t.pages?.pageStart ?? null;
        const endPage = t.endPage ?? t.pages?.pageEnd ?? null;
        const pagesCount = t.pagesCount ?? t.pages?.pagesCount ?? (startPage != null && endPage != null ? Math.max(0, endPage - startPage + 1) : 0);
        const pagesText = t.pagesText ?? t.pages?.rawText ?? t.paginas ?? (startPage != null && endPage != null ? `Págs. ${startPage}-${endPage}` : undefined);
        const isCompleted = Boolean(t.completado || t.completed || t.isTopicCompleted || t.status === 'completed');

        const enriched = {
          ...t,
          category: materia,
          materia,
          topicNumber: numeroTema,
          temaNumero: numeroTema,
          topicTitle: titulo,
          tema: titulo,
          topic: titulo,
          modality: modalidad,
          modalidad,
          effectiveHours: horas,
          horasEfectivas: horas,
          effectiveMinutes: minutos,
          minutosEfectivos: minutos,
          startPage,
          endPage,
          pagesCount,
          pagesText,
          isTopicCompleted: isCompleted,
          completesVuelta: isCompleted || Boolean(t.completesVuelta)
        };

        const resolved = resolveAeroFocusTopic(enriched);

        const topicItem: any = resolved
          ? {
              ...resolved,
              effectiveMinutes: minutos || resolved.effectiveMinutes,
              effectiveHours: horas || resolved.effectiveHours,
              startPage,
              endPage,
              pagesCount,
              pagesText,
              isTopicCompleted: isCompleted,
              completesVuelta: isCompleted || resolved.completesVuelta
            }
          : {
              resolvedTopicId: String(t.topicId || (numeroTema ? `constitucional-${numeroTema}` : 'topic-unknown')),
              resolvedSubjectId: 'constitucional',
              resolvedTopicNumber: Number(numeroTema || 0),
              resolvedTopicTitle: titulo,
              effectiveMinutes: minutos || 30,
              effectiveHours: horas || 0.5,
              modality: modalidad,
              startPage,
              endPage,
              pagesCount,
              pagesText,
              isTopicCompleted: isCompleted,
              completesVuelta: isCompleted,
              notes: t.notes || 'Sincronizado vía AeroFocus Webhook'
            };

        resolvedTopics.push(topicItem);
      }

      const calculatedEffectiveMinutes = totalMins || resolvedTopics.reduce((acc, t) => acc + (t.effectiveMinutes || 0), 0);
      const calculatedEffectiveHours = totalHours || Math.round((calculatedEffectiveMinutes / 60) * 100) / 100;
      const flightId = String(payload.flightId || transactionId || `vuelo_${sessionDate}`);

      const record = {
        id: `af_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        receivedAt: new Date().toISOString(),
        date: sessionDate,
        source: payload.source || "aerofocus_pro",
        flightId,
        transactionId: transactionId || flightId,
        dailyTotalEffectiveHours: calculatedEffectiveHours,
        totalFlightEffectiveMinutes: calculatedEffectiveMinutes,
        totalFlightEffectiveHours: calculatedEffectiveHours,
        status: "quarantined",
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

      // Notificar a todos los clientes web conectados en tiempo real mediante SSE
      broadcastWebhookEvent(record);

      console.log(`[AeroFocus Webhook] Evento ${record.id} (${transactionId || flightId}) procesado con éxito (${resolvedTopics.length} temas, ${calculatedEffectiveHours}h).`);

      // Respuesta exacta estandarizada compatible con Next.js y AeroFocus Pro
      return res.status(200).json({
        status: 'ok',
        synced: true,
        date: sessionDate,
        transactionId: transactionId || flightId,
        processedTopics: resolvedTopics.length,
        effectiveHours: calculatedEffectiveHours,
        quarantined: true,
        recordId: record.id,
        message: payload.message || 'Cierre diario sincronizado con éxito en WellsPrep'
      });
    } catch (err: any) {
      console.error("[AeroFocus Webhook] Error processing request:", err);
      return res.status(500).json({
        error: err?.message || 'Error interno',
        status: 'error',
        synced: false
      });
    }
  });

  // Query events / quarantined syncs
  app.get("/api/webhook/events", (req, res) => {
    const events = loadWebhookEvents();
    const statusFilter = req.query.status as string;
    const limit = parseInt((req.query.limit as string) || "50", 10);

    let filtered = events;
    if (statusFilter) {
      filtered = filtered.filter((e: any) => e.status === statusFilter);
    }

    const quarantinedCount = events.filter((e: any) => e.status === "quarantined" || e.status === "pending").length;
    res.json({
      events: filtered.slice(-limit).reverse(),
      total: events.length,
      quarantinedCount,
      pendingCount: quarantinedCount
    });
  });

  // Discard single event from quarantine
  app.post("/api/webhook/discard", (req, res) => {
    const { eventId } = req.body || {};
    if (!eventId) return res.status(400).json({ error: "Falta eventId" });
    const events = loadWebhookEvents();
    const filtered = events.filter((e: any) => e.id !== eventId);
    saveWebhookEvents(filtered);
    res.json({ status: "ok", remaining: filtered.length });
  });

  // Update quarantined event (edit topics, difficulty, modality, completesVuelta, merge topics)
  app.post("/api/webhook/update-quarantine", (req, res) => {
    const { eventId, updatedRecord } = req.body || {};
    if (!eventId || !updatedRecord) return res.status(400).json({ error: "Faltan parámetros" });
    const events = loadWebhookEvents();
    const updated = events.map((e: any) => e.id === eventId ? { ...e, ...updatedRecord } : e);
    saveWebhookEvents(updated);
    broadcastWebhookEvent({ type: "quarantine_updated", eventId });
    res.json({ status: "ok", event: updatedRecord });
  });

  // Acknowledge or approve processed events from frontend
  app.post("/api/webhook/ack", (req, res) => {
    const { eventIds, eventId } = req.body || {};
    const idsToAck = new Set<string>();
    if (Array.isArray(eventIds)) {
      eventIds.forEach(id => idsToAck.add(String(id)));
    }
    if (eventId) {
      idsToAck.add(String(eventId));
    }

    if (idsToAck.size === 0) {
      return res.status(400).json({ error: "No event IDs provided" });
    }

    const events = loadWebhookEvents();
    let updatedCount = 0;
    const updated = events.map((e: any) => {
      if (idsToAck.has(e.id)) {
        updatedCount++;
        return { ...e, status: "processed", processedAt: new Date().toISOString() };
      }
      return e;
    });

    saveWebhookEvents(updated);
    res.json({ status: "ok", acknowledged: updatedCount });
  });

  // Simulate test webhook event from AeroFocus Pro
  app.post("/api/webhook/test", async (req, res) => {
    try {
      const { resolveAeroFocusTopic } = await import("./src/lib/topicResolver");
      const sampleTopic = req.body?.topic || {
        topicId: "jud-const-01",
        topicNumber: 1,
        topicTitle: "Derecho Constitucional - Tema 1: La Constitución Española de 1978",
        category: "Derecho Constitucional",
        modality: "repaso",
        effectiveHours: 1.5,
        effectiveMinutes: 90,
        grossMinutes: 90
      };

      const resolved = resolveAeroFocusTopic(sampleTopic);
      const testRecord = {
        id: `af_test_${Date.now()}`,
        receivedAt: new Date().toISOString(),
        date: new Date().toISOString().split("T")[0],
        source: "aerofocus_pro",
        flightId: String(Date.now()),
        totalFlightEffectiveMinutes: sampleTopic.effectiveMinutes || 90,
        totalFlightEffectiveHours: sampleTopic.effectiveHours || 1.5,
        status: "quarantined",
        topics: resolved ? [resolved] : [],
        summary: {
          estudioHours: 0,
          repasoHours: 1.5,
          refrescoHours: 0,
          totalHours: 1.5
        }
      };

      const events = loadWebhookEvents();
      events.push(testRecord);
      saveWebhookEvents(events);
      broadcastWebhookEvent(testRecord);

      res.json({
        status: "ok",
        synced: true,
        testRecord,
        resolvedTopic: resolved
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Clear/Purge webhook events (Quarantine cleanup)
  app.post("/api/webhook/clear", (req, res) => {
    try {
      saveWebhookEvents([]);
      res.json({ status: "ok", message: "Todos los eventos de AeroFocus en servidor han sido eliminados." });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Server-Sent Events stream for instant client updates
  app.get("/api/webhook/stream", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    res.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);
    sseClients.push(res);

    req.on("close", () => {
      sseClients = sseClients.filter(c => c !== res);
    });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
