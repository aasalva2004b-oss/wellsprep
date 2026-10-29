import express from "express";
import path from "path";
import multer from "multer";
import { GoogleGenAI, Type } from "@google/genai";
import fs from "fs";
import {
  corsHeaders,
  isAuthorizedWebhookRequest,
  processIncomingAeroFocusPayload,
  loadWebhookEvents,
  saveWebhookEvents,
  getWebhookHealthOrSessions,
  loadGlobalAnalytics
} from "./src/lib/webhookStorage";

// NOTE: require Vite explicitly to avoid ts-node / tsx dynamic import issues
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
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

    // Consulta de salud y sesiones pendientes (GET)
    if (req.method === 'GET') {
      return res.status(200).json(getWebhookHealthOrSessions());
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
      // 1. Verificación de Seguridad
      if (!isAuthorizedWebhookRequest(req.headers, req.body)) {
        return res.status(401).json({ error: 'Token no autorizado', expected: 'wp_qLXi6WFkFY_live' });
      }

      // 2. Procesamiento idempotente de alta precisión v2.2.0
      const result = processIncomingAeroFocusPayload(req.body, req.headers);

      if (result.createdRecord) {
        broadcastWebhookEvent(result.createdRecord);
        console.log(`[AeroFocus Webhook v2.2.0] Transmisión procesada con éxito: ${result.createdRecord.id} (${result.createdRecord.topics.length} temas, ${result.createdRecord.dailyTotalEffectiveHours}h).`);
      }

      return res.status(result.statusCode).json(result.responseData);
    } catch (err: any) {
      console.error("[AeroFocus Webhook] Error processing request:", err);
      return res.status(500).json({
        ok: false,
        error: err?.message || 'Error interno en ingesta',
        status: 'error',
        synced: false
      });
    }
  });

  // Endpoint para consultar el Snapshot Analítico Global de AeroFocus
  app.get("/api/webhook/analytics", (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const analytics = loadGlobalAnalytics();
    return res.json({ ok: true, analytics });
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

  // Clear all events from quarantine and memory
  app.post("/api/webhook/clear", (req, res) => {
    saveWebhookEvents([]);
    res.json({ status: "ok", message: "Todos los eventos de AeroFocus en servidor han sido eliminados." });
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

  // Webhook test endpoint for AeroFocus Pro
  app.post("/api/webhook/test", async (req, res) => {
    try {
      if (!req.body?.simulateSession) {
        return res.json({
          status: "ok",
          success: true,
          message: "Enlace operativo AeroFocus Pro <-> WellsPrep",
          ready: true
        });
      }
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
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");

    res.write(`data: ${JSON.stringify({ type: "connected", timestamp: new Date().toISOString() })}\n\n`);
    sseClients.push(res);

    req.on("close", () => {
      sseClients = sseClients.filter(c => c !== res);
    });
  });

  // Keep SSE alive with periodic heartbeat pings every 20s
  setInterval(() => {
    sseClients.forEach(client => {
      try {
        client.write(`data: ${JSON.stringify({ type: "ping", timestamp: new Date().toISOString() })}\n\n`);
      } catch {}
    });
  }, 20000);

  // Webhook ping / healthcheck endpoint
  app.all(["/api/webhook/ping", "/api/webhook/health"], (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "*");
    if (req.method === "OPTIONS") return res.status(204).end();
    return res.status(200).json({
      status: "ok",
      service: "wellsprep_aerofocus_webhook",
      timestamp: new Date().toISOString(),
      activeSSEConnections: sseClients.length,
      expectedToken: "wp_qLXi6WFkFY_live",
      ready: true
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
