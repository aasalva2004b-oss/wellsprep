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

  // Webhook endpoint for AeroFocus Pro (supports /api/webhook/aerofocus, /route, .js, .ts)
  app.all([
    "/api/webhook/aerofocus",
    "/api/webhook/aerofocus/",
    "/api/webhook/aerofocus/route",
    "/api/webhook/aerofocus/route.ts",
    "/api/webhook/aerofocus.js",
    "/api/webhook/aerofocus.ts"
  ], async (req, res) => {
    // 1. Cabeceras CORS obligatorias para peticiones web y Vercel
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Event, X-API-Key, X-Source, X-Test-Ping');

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
      // 2. Extracción y normalización de Payload (admite JSON, string crudo, URL-encoded)
      let payload = req.body;
      if (typeof payload === 'string') {
        try {
          payload = JSON.parse(payload);
        } catch {
          // Si no es JSON puro, mantener objeto vacío o buscar en req.body
          payload = {};
        }
      } else if (!payload || typeof payload !== 'object') {
        payload = {};
      }

      // Si venía empaquetado en payload.payload
      if (typeof payload.payload === 'string') {
        try { payload = JSON.parse(payload.payload); } catch {}
      }

      // Verificación de Token permisiva para evitar descartar sesiones reales del opositor
      const authHeader = req.headers.authorization;
      const token = req.headers['x-api-key'] || req.headers['x-token'] || req.headers['x-webhook-token'] || (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null) || (req.query.token as string);
      console.log(`[AeroFocus Webhook] Recibida petición desde ${req.ip}. Evento: ${payload.event || 'estudio'}. Token provisto: ${Boolean(token)}`);

      // 3. Respuesta al test de conexión / Handshake de AeroFocus
      if (payload.isTest || payload.event === 'test_connection' || req.headers['x-test-ping']) {
        return res.status(200).json({
          success: true,
          status: 'ok',
          message: 'Enlace operativo AeroFocus Pro <-> WellsPrep'
        });
      }

      // 4. Extracción exhaustiva de temas/sesiones de cualquier formato AeroFocus
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
      } else if (Array.isArray(payload.pomodoros)) {
        rawTopics = payload.pomodoros;
      } else if (Array.isArray(payload.records)) {
        rawTopics = payload.records;
      } else if (Array.isArray(payload.logs)) {
        rawTopics = payload.logs;
      } else if (Array.isArray(payload.history)) {
        rawTopics = payload.history;
      } else if (payload.data && Array.isArray(payload.data)) {
        rawTopics = payload.data;
      } else if (payload.data && Array.isArray(payload.data.topics)) {
        rawTopics = payload.data.topics;
      } else if (payload.data && Array.isArray(payload.data.sessions)) {
        rawTopics = payload.data.sessions;
      } else if (payload.flight && Array.isArray(payload.flight.topics)) {
        rawTopics = payload.flight.topics;
      } else if (payload.flight && Array.isArray(payload.flight.sessions)) {
        rawTopics = payload.flight.sessions;
      } else if (payload.topicId || payload.topicTitle || payload.topicNumber || payload.topic || payload.subject || payload.tema || payload.duration || payload.minutes || payload.effectiveHours || payload.hours) {
        rawTopics = [payload];
      }

      // Si es un ping explícito sin contenido de estudio
      if (payload.event === 'ping') {
        return res.status(200).json({
          status: "ok",
          synced: true,
          date: payload.date || new Date().toISOString().split("T")[0],
          processedTopics: 0,
          message: "Conexión probada con éxito entre AeroFocus Pro y Wellsprep"
        });
      }

      // Si no se encontraron temas pero venía una sesión genérica con tiempo
      if (rawTopics.length === 0) {
        console.warn("[AeroFocus Webhook] Payload sin lista de temas explícita. Creando registro de estudio general para no perder horas:", payload);
        rawTopics = [{
          topicTitle: payload.title || payload.topicTitle || payload.name || "Sesión AeroFocus (Revisar tema)",
          effectiveMinutes: Number(payload.effectiveMinutes) || Number(payload.minutes) || Number(payload.duration) || 45,
          effectiveHours: Number(payload.effectiveHours) || Number(payload.hours) || ((Number(payload.effectiveMinutes) || 45) / 60),
          category: payload.category || payload.subject || "Constitucional",
          modality: payload.modality || "repaso",
          notes: payload.notes || "Sesión de estudio recibida de AeroFocus"
        }];
      }

      // Dynamic import to ensure clean resolution
      const { resolveAeroFocusTopic } = await import("./src/lib/topicResolver");

      const date = payload.date || payload.flightDate || payload.sessionDate || (payload.timestamp ? new Date(payload.timestamp).toISOString().split("T")[0] : new Date().toISOString().split("T")[0]);
      const flightId = String(payload.flightId || payload.id || payload.flightNumber || `vuelo_${Date.now()}`);

      const resolvedTopics: any[] = [];
      for (const t of rawTopics) {
        const enriched = {
          ...t,
          category: t.category || payload.category || payload.subject || payload.subjectName || 'Constitucional',
          modality: t.modality || payload.modality || 'repaso',
        };
        const resolved = resolveAeroFocusTopic(enriched);
        const effMins = Number(t.effectiveMinutes) || Number(t.minutes) || Number(t.duration) || Math.round((Number(t.effectiveHours) || Number(t.hours) || 0) * 60) || 30;
        const effHours = Number(t.effectiveHours) || Number(t.hours) || (effMins / 60);

        if (resolved) {
          resolvedTopics.push({
            ...resolved,
            effectiveMinutes: effMins,
            effectiveHours: effHours,
            difficulty: t.difficulty !== undefined ? Number(t.difficulty) : undefined,
            dificultadReal: t.dificultadReal !== undefined ? Number(t.dificultadReal) : (t.difficulty !== undefined ? Number(t.difficulty) : undefined),
            completesVuelta: t.completesVuelta !== undefined ? Boolean(t.completesVuelta) : undefined,
          });
        } else {
          resolvedTopics.push({
            resolvedTopicId: String(t.topicId || t.topicNumber || t.id || 'topic-unknown'),
            resolvedSubjectId: 'general',
            resolvedTopicNumber: Number(t.topicNumber || 0),
            resolvedTopicTitle: t.topicTitle || t.title || t.name || `Tema ${t.topicNumber || ''}`,
            effectiveMinutes: effMins,
            effectiveHours: effHours,
            modality: t.modality || 'repaso',
            difficulty: t.difficulty !== undefined ? Number(t.difficulty) : undefined,
            dificultadReal: t.dificultadReal !== undefined ? Number(t.dificultadReal) : (t.difficulty !== undefined ? Number(t.difficulty) : undefined),
            completesVuelta: t.completesVuelta !== undefined ? Boolean(t.completesVuelta) : undefined,
            cantoGrade: t.cantoGrade ?? t.grade,
            cantoSeconds: t.cantoSeconds,
            cantoType: t.cantoType,
            mistakes: t.mistakes,
            notes: t.notes || 'Sincronizado vía AeroFocus Webhook'
          });
        }
      }

      const totalEffectiveMinutes = Number(payload.totalFlightEffectiveMinutes) || 
        resolvedTopics.reduce((acc, t) => acc + (t.effectiveMinutes || 0), 0);
      const totalEffectiveHours = Number(payload.dailyTotalEffectiveHours) || Number(payload.totalFlightEffectiveHours) || 
        Math.round((totalEffectiveMinutes / 60) * 100) / 100;

      const record = {
        id: `af_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        receivedAt: new Date().toISOString(),
        date,
        source: payload.source || "aerofocus",
        flightId,
        dailyTotalEffectiveHours: Number(payload.dailyTotalEffectiveHours) || totalEffectiveHours,
        totalFlightEffectiveMinutes: totalEffectiveMinutes,
        totalFlightEffectiveHours: totalEffectiveHours,
        status: "quarantined",
        topics: resolvedTopics,
        rawPayload: payload,
        summary: payload.summary || {
          estudioHours: resolvedTopics.filter(t => t.modality === 'primer_estudio').reduce((a, b) => a + (b.effectiveHours || 0), 0),
          repasoHours: resolvedTopics.filter(t => t.modality === 'repaso').reduce((a, b) => a + (b.effectiveHours || 0), 0),
          refrescoHours: resolvedTopics.filter(t => t.modality === 'refresco').reduce((a, b) => a + (b.effectiveHours || 0), 0),
          cantoHours: resolvedTopics.filter(t => t.modality === 'canto').reduce((a, b) => a + (b.effectiveHours || 0), 0),
          totalHours: totalEffectiveHours
        }
      };

      const currentEvents = loadWebhookEvents();
      currentEvents.push(record);
      saveWebhookEvents(currentEvents);

      // Notificar a todos los clientes web conectados en tiempo real mediante SSE
      broadcastWebhookEvent(record);

      console.log(`[AeroFocus Webhook] Evento ${record.id} retenido en CUARENTENA con éxito (${resolvedTopics.length} temas).`);

      return res.status(200).json({
        status: 'ok',
        synced: true,
        quarantined: true,
        date: payload.date || date,
        processedTopics: resolvedTopics.length,
        effectiveHours: totalEffectiveHours,
        receivedTopics: rawTopics.length,
        flightId,
        recordId: record.id,
        message: 'Evento recibido y retenido en CUARENTENA de seguridad. No se altera el expediente oficial.'
      });
    } catch (err: any) {
      console.error("[AeroFocus Webhook] Error processing request:", err);
      return res.status(200).json({
        status: "ok",
        synced: false,
        error: err.message,
        processedTopics: 0
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
