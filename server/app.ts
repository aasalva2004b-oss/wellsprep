import express, { type Request, type Response, type NextFunction, type RequestHandler } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import multer from 'multer';
import type { AeroFocusStore } from './aerofocusStore';

export interface VerifiedUser { uid: string; exp?: number }
export interface AppOptions {
  store: AeroFocusStore;
  verifyIdToken: (token: string) => Promise<VerifiedUser>;
  staticDirectory?: string;
  allowedOrigins?: string[];
  parsePdf?: (bytes: Buffer) => Promise<unknown>;
  developmentMiddleware?: RequestHandler;
  isolated?: boolean;
}
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
const asyncRoute = (handler: (req: Request, res: Response) => Promise<any>) => (req: Request, res: Response, next: NextFunction) => { Promise.resolve(handler(req, res)).catch(next); };
const ingestionPaths = ['/api/webhook/aerofocus','/api/webhook/aerofocus/route','/api/webhook/aerofocus/route.ts','/api/webhook/aerofocus.js','/api/webhook/aerofocus.ts','/api/webhook','/api/aerofocus','/api/sync/aerofocus','/api/webhook/touchdown','/api/aerofocus/touchdown','/api/touchdown','/api/webhook/session','/api/webhook/flight','/api/sync','/api/webhook/sync','/webhook/aerofocus','/aerofocus'];

export function createApp(options: AppOptions) {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    if (options.isolated) res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' http://127.0.0.1:8080 http://127.0.0.1:9099 ws://127.0.0.1:5173; worker-src 'self' blob:");
    next();
  });
  app.get('/healthz', (_req, res) => res.json({ ok: true, service: 'wellsprep' }));
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      let same = false;
      try { same = new URL(origin).host === req.get('host'); } catch {}
      if (!same && !options.allowedOrigins?.includes(origin)) return res.status(403).json({ error: 'Origen no autorizado.' });
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type,X-Webhook-Token,X-Transaction-Id,X-Flight-Id');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  app.use(express.json({ limit: '2mb' }));
  app.use(express.text({ type: 'text/*', limit: '2mb' }));
  const authenticate = async (req: Request, external = false): Promise<VerifiedUser> => {
    const authorization = req.get('authorization') || '';
    const bearer = /^Bearer (\S+)$/i.exec(authorization)?.[1];
    const webhook = req.get('x-webhook-token') || (bearer?.startsWith('wpa_') ? bearer : undefined);
    if (external && webhook && /^wpa_[A-Za-z0-9_-]{43}$/.test(webhook)) {
      const uid = await options.store.resolveCredential(digest(webhook));
      if (uid) return { uid };
    }
    if (bearer && bearer.length <= 8192 && !bearer.startsWith('wpa_')) {
      try { const user = await options.verifyIdToken(bearer); if (user.uid) return user; } catch {}
    }
    throw Object.assign(new Error('Inicia sesión o utiliza una credencial válida para esta operación.'), { statusCode: 401 });
  };
  const health = (_req: Request, res: Response) => res.json({ ok: true, ready: true, schemaSupported: '2.2.0', service: 'wellsprep_aerofocus' });
  app.all(['/api/webhook/ping','/api/webhook/health','/api/webhook/test'], asyncRoute(async (req,res) => { await authenticate(req); health(req,res); }));
  app.post('/api/webhook/credentials', asyncRoute(async (req,res) => {
    const user = await authenticate(req);
    if (!await options.store.consumeQuota(user.uid,'credentials',20)) return res.status(429).json({error:'Límite diario de rotaciones alcanzado.'});
    const token = `wpa_${randomBytes(32).toString('base64url')}`;
    await options.store.registerCredential(user.uid, digest(token));
    res.setHeader('Cache-Control','no-store'); res.json({ token });
  }));
  app.all(ingestionPaths, asyncRoute(async (req,res) => {
    const user = await authenticate(req, req.method === 'POST');
    if (req.method === 'GET') return res.json({ ok: true, ready: true, sessionsCount: (await options.store.listEvents(user.uid)).length });
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido.' });
    if (!await options.store.consumeQuota(user.uid,'ingest',2000)) return res.status(429).json({error:'Límite diario de transmisiones alcanzado.'});
    const result = await options.store.processPayload(user.uid, req.body, req.headers);
    res.status(result.statusCode).json(result.responseData);
  }));
  app.get('/api/webhook/events', asyncRoute(async (req,res) => {
    const { uid } = await authenticate(req), events = await options.store.listEvents(uid);
    const status = String(req.query.status || '');
    const pending = events.filter(e => ['pending','quarantined'].includes(e.status));
    const filtered = ['pending','quarantined','unprocessed'].includes(status) ? pending : status ? events.filter(e=>e.status===status) : events;
    const limit = Math.min(200,Math.max(1,Number(req.query.limit)||50));
    res.json({ events: filtered.slice(0,limit), total: events.length, pendingCount: pending.length, quarantinedCount: pending.length });
  }));
  app.get('/api/webhook/analytics', asyncRoute(async (req,res) => { const {uid}=await authenticate(req); res.json({ok:true,analytics:await options.store.getAnalytics(uid)}); }));
  app.post('/api/webhook/update-quarantine', asyncRoute(async (req,res) => {
    const {uid}=await authenticate(req), {eventId,updatedRecord}=req.body||{};
    if (!updatedRecord || typeof updatedRecord!=='object' || Array.isArray(updatedRecord)
      || updatedRecord.userId!==undefined&&updatedRecord.userId!==uid || updatedRecord.id!==undefined&&updatedRecord.id!==eventId) return res.status(400).json({error:'Edición no válida.'});
    const event=await options.store.updateEvent(uid,eventId,existing=>({...existing,...updatedRecord}));res.json({status:'ok',event});
  }));
  app.post('/api/webhook/discard', asyncRoute(async(req,res)=>{const {uid}=await authenticate(req);res.json({status:'ok',removed:await options.store.deleteEvent(uid,req.body?.eventId)});}));
  app.post('/api/webhook/clear', asyncRoute(async(req,res)=>{const {uid}=await authenticate(req);res.json({status:'ok',removed:await options.store.clearEvents(uid)});}));
  app.post('/api/webhook/ack', asyncRoute(async(req,res)=>{
    const {uid}=await authenticate(req), ids=req.body?.eventIds||[req.body?.eventId];
    if(!Array.isArray(ids)||ids.length>200)return res.status(400).json({error:'Lista no válida.'});
    for(const id of ids)if(await options.store.getEvent(uid,id))await options.store.updateEvent(uid,id,e=>({...e,status:'processed'}));
    res.json({status:'ok'});
  }));
  app.post('/api/webhook/delete-topic',asyncRoute(async(req,res)=>{
    const {uid}=await authenticate(req),{eventId,topicIndex}=req.body||{};
    if(!Number.isInteger(topicIndex)||topicIndex<0)return res.status(400).json({error:'Índice no válido.'});
    const event=await options.store.updateEvent(uid,eventId,e=>{if(topicIndex>=e.topics.length)throw Object.assign(new Error('Tema inexistente.'),{statusCode:400});return {...e,topics:e.topics.filter((_,i)=>i!==topicIndex)};});
    res.json({status:'ok',event});
  }));
  app.post('/api/webhook/add-topic',asyncRoute(async(req,res)=>{
    const {uid}=await authenticate(req),{eventId,topic}=req.body||{};
    if(!topic||typeof topic!=='object')return res.status(400).json({error:'Tema no válido.'});
    const event=await options.store.updateEvent(uid,eventId,e=>({...e,topics:[...e.topics,topic]}));res.json({status:'ok',event});
  }));
  // Automated heuristic purges are deliberately unavailable; no owner's real history is guessed away.
  app.post('/api/webhook/clean-tests',asyncRoute(async(req,res)=>{await authenticate(req);res.status(410).json({error:'La limpieza heurística está deshabilitada.'});}));
  app.get('/api/webhook/stream',asyncRoute(async(req,res)=>{
    const user=await authenticate(req);
    res.setHeader('Content-Type','text/event-stream');res.setHeader('Cache-Control','no-cache, no-store');res.setHeader('Connection','keep-alive');res.flushHeaders();
    const send=(data:unknown)=>{if(!res.writableEnded)res.write(`data: ${JSON.stringify(data)}\n\n`);};
    send({type:'connected'});
    const unsubscribe=options.store.subscribe(user.uid,()=>send({type:'quarantine_updated'}),()=>res.end());
    const heartbeat=setInterval(()=>send({type:'ping'}),20000);heartbeat.unref();
    const lifetime=setTimeout(()=>res.end(),Math.max(1000,Math.min(55*60000,user.exp?user.exp*1000-Date.now():55*60000)));lifetime.unref();
    res.once('close',()=>{unsubscribe();clearInterval(heartbeat);clearTimeout(lifetime);});
  }));
  const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:10*1024*1024,files:1,fields:2},fileFilter:(_req,file,done)=>done(null,file.mimetype==='application/pdf')});
  app.post('/api/parse-pdf',asyncRoute(async(req,res)=>{
    const {uid}=await authenticate(req);
    if(!options.parsePdf)return res.status(503).json({error:'La importación PDF no está configurada.'});
    if(!await options.store.consumeQuota(uid,'pdf',20))return res.status(429).json({error:'Límite diario de importaciones alcanzado.'});
    await new Promise<void>((resolve,reject)=>upload.single('pdf')(req,res,error=>error?reject(error):resolve()));
    if(!req.file)return res.status(400).json({error:'Adjunta un PDF válido.'});
    const result=await options.parsePdf(req.file.buffer);res.json(result);
  }));
  // Explicit static allowlist: no backend, source, config, uploads, env or map files.
  if(options.staticDirectory){
    app.use('/assets',(req,res,next)=>{
      if(!/^\/[A-Za-z0-9_.-]+\.(?:js|css|svg|png|jpe?g|webp|gif|ico|woff2?|ttf)$/i.test(req.path))return res.sendStatus(404);
      express.static(path.join(options.staticDirectory!,'assets'),{dotfiles:'deny',fallthrough:false})(req,res,next);
    });
    app.get(['/', '/index.html'],(_req,res)=>res.sendFile(path.join(options.staticDirectory!,'index.html')));
  }
  if(options.developmentMiddleware)app.use((req,res,next)=>req.path.startsWith('/api/')?next():options.developmentMiddleware!(req,res,next));
  app.use((_req,res)=>res.status(404).json({error:'Ruta no encontrada.'}));
  app.use((error:any,_req:Request,res:Response,_next:NextFunction)=>{
    if(res.headersSent){res.end();return;}
    const status=Number(error.statusCode||error.status)||(error.code==='LIMIT_FILE_SIZE'?413:500);
    res.status(status>=400&&status<600?status:500).json({error:status>=500?'El servicio no ha podido completar la operación.':error.message||'Solicitud no válida.'});
  });
  return app;
}
