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

  app.use(express.json());

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
      // 2. Verificación de Token
      const authHeader = req.headers.authorization;
      const token = req.headers['x-api-key'] || (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null) || (req.query.token as string);
      const expectedToken = 'wp_qLXi6WFkFY_live';

      if (token && token !== expectedToken && !token.startsWith('wp_')) {
        return res.status(401).json({ error: 'Token no autorizado' });
      }

      const payload = req.body || {};

      console.log(`[AeroFocus Webhook] Request from ${req.ip}. Event: ${payload.event || 'unspecified'}. Date: ${payload.date || 'today'}`);

      // 3. Respuesta al test de conexión / Handshake de AeroFocus
      if (payload.isTest || payload.event === 'test_connection' || req.headers['x-test-ping']) {
        return res.status(200).json({
          success: true,
          message: 'Enlace operativo AeroFocus Pro <-> WellsPrep'
        });
      }

      // 4. Recepción del Cierre Diario (22:00 h) o Sesiones de Vuelo
      console.log(`[AeroFocus] Fecha: ${payload.date} | Horas netas: ${payload.dailyTotalEffectiveHours} h`);
      console.log(`[AeroFocus] Temas recibidos:`, payload.topics?.length || (Array.isArray(payload) ? payload.length : 0));

      // Extract raw topics from any potential payload structure
      let rawTopics: any[] = [];
      if (Array.isArray(payload)) {
        rawTopics = payload;
      } else if (Array.isArray(payload.topics)) {
        rawTopics = payload.topics;
      } else if (Array.isArray(payload.sessions)) {
        rawTopics = payload.sessions;
      } else if (Array.isArray(payload.items)) {
        rawTopics = payload.items;
      } else if (Array.isArray(payload.tasks)) {
        rawTopics = payload.tasks;
      } else if (payload.flight && Array.isArray(payload.flight.topics)) {
        rawTopics = payload.flight.topics;
      } else if (payload.flight && Array.isArray(payload.flight.sessions)) {
        rawTopics = payload.flight.sessions;
      } else if (payload.data && Array.isArray(payload.data.topics)) {
        rawTopics = payload.data.topics;
      } else if (payload.data && Array.isArray(payload.data.sessions)) {
        rawTopics = payload.data.sessions;
      } else if (payload.topicId || payload.topicTitle || payload.topicNumber) {
        rawTopics = [payload];
      }

      // Handle ping / connection check
      if (rawTopics.length === 0 || payload.event === 'ping') {
        return res.status(200).json({
          status: "ok",
          synced: true,
          date: payload.date || new Date().toISOString().split("T")[0],
          processedTopics: 0,
          message: "Conexión probada con éxito entre AeroFocus Pro y Wellsprep"
        });
      }

      // Dynamic import to ensure clean resolution
      const { resolveAeroFocusTopic } = await import("./src/lib/topicResolver");

      const date = payload.date || payload.flightDate || payload.sessionDate || (payload.timestamp ? new Date(payload.timestamp).toISOString().split("T")[0] : new Date().toISOString().split("T")[0]);
      const flightId = String(payload.flightId || payload.id || payload.flightNumber || 'cierre_22h');

      const resolvedTopics: any[] = [];
      for (const t of rawTopics) {
        const enriched = {
          ...t,
          category: t.category || payload.category || payload.subject || payload.subjectName || 'Constitucional',
          modality: t.modality || payload.modality || 'repaso',
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
        summary: payload.summary || {
          estudioHours: resolvedTopics.filter(t => t.modality === 'primer_estudio').reduce((a, b) => a + b.effectiveHours, 0),
          repasoHours: resolvedTopics.filter(t => t.modality === 'repaso').reduce((a, b) => a + b.effectiveHours, 0),
          refrescoHours: resolvedTopics.filter(t => t.modality === 'refresco').reduce((a, b) => a + b.effectiveHours, 0),
          cantoHours: resolvedTopics.filter(t => t.modality === 'canto').reduce((a, b) => a + b.effectiveHours, 0),
          totalHours: totalEffectiveHours
        }
      };

      const currentEvents = loadWebhookEvents();
      currentEvents.push(record);
      saveWebhookEvents(currentEvents);

      // Notify any connected clients in real-time
      broadcastWebhookEvent(record);

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
