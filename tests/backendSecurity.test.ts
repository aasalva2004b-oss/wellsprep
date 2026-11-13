import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createApp } from '../server/app';
import { validateServerEnvironment } from '../server/firebaseRuntime';

const base='http://127.0.0.1:3321';
test('server authentication, owner isolation, external credential scope and static exposure',async(t)=>{
 const data=new Map<string,any[]>(),tokens=new Map<string,string>(),quota=new Map<string,number>();
 const events=(uid:string)=>data.get(uid)||[];
 const store:any={
  listEvents:async(uid:string)=>events(uid),getAnalytics:async()=>null,
  getEvent:async(uid:string,id:string)=>events(uid).find(e=>e.id===id)||null,
  processPayload:async(uid:string,payload:any)=>{const e={...payload,id:payload.flightId,userId:uid,status:'pending',topics:[]};data.set(uid,[...events(uid),e]);return{statusCode:200,responseData:{ok:true},createdRecord:e};},
  registerCredential:async(uid:string,hash:string)=>{for(const [h,u]of tokens)if(u===uid)tokens.delete(h);tokens.set(hash,uid);},resolveCredential:async(h:string)=>tokens.get(h)||null,
  clearEvents:async(uid:string)=>{const n=events(uid).length;data.set(uid,[]);return n;},
  deleteEvent:async(uid:string,id:string)=>{const found=events(uid).some(e=>e.id===id);data.set(uid,events(uid).filter(e=>e.id!==id));return found;},
  updateEvent:async(uid:string,id:string,update:any)=>{const e=events(uid).find(e=>e.id===id);if(!e)throw Object.assign(new Error('Not found'),{statusCode:404});const next=update(e);data.set(uid,events(uid).map(e=>e.id===id?next:e));return next;},
  subscribe:()=>()=>{}, consumeQuota:async(uid:string,bucket:string,limit:number)=>{const key=uid+bucket,n=quota.get(key)||0;if(n>=limit)return false;quota.set(key,n+1);return true;},
 };
 const directory=resolve('.cache/final-fix/static-fixture');await mkdir(directory+'/assets',{recursive:true});
 await writeFile(directory+'/index.html','<html>synthetic</html>');await writeFile(directory+'/server.cjs','private-backend-marker');await writeFile(directory+'/assets/site.css','body{}');
 const app=createApp({store,verifyIdToken:async token=>{if(!['user-a','user-b'].includes(token))throw new Error('Invalid');return{uid:token};},staticDirectory:directory,parsePdf:async()=>{throw new Error('synthetic provider failure');}});
 const server=app.listen(3321,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
 const call=(path:string,user?:string,body?:any,method?:string)=>fetch(base+path,{method:method||(body===undefined?'GET':'POST'),headers:{...(user?{Authorization:`Bearer ${user}`} :{}),...(body!==undefined?{'Content-Type':'application/json'}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 try{
  await t.test('every sensitive endpoint rejects missing or forged authentication',async()=>{
   for(const path of ['/api/webhook/events','/api/webhook/analytics','/api/webhook/stream','/api/webhook/health'])for(const user of [undefined,'forged'])assert.equal((await call(path,user)).status,401);
   for(const path of ['/api/webhook/clear','/api/webhook/ack','/api/webhook/discard','/api/webhook/update-quarantine','/api/webhook/credentials','/api/parse-pdf','/api/webhook/aerofocus'])assert.equal((await call(path,undefined,{})).status,401);
  });
  await t.test('backend, maps, source, uploads and configuration are not static files',async()=>{
   assert.equal((await call('/')).status,200);assert.equal((await call('/assets/site.css')).status,200);
   for(const path of ['/server.cjs','/server.cjs.map','/.env','/firebase-applet-config.json','/package.json','/src/App.tsx','/build/server.cjs','/uploads/private.pdf','/assets/site.css.map','/assets/%2e%2e/server.cjs'])assert.equal((await call(path)).status,404,path);
   const health=await(await call('/api/webhook/health','user-a')).json();assert.equal('expectedToken'in health,false);assert.equal('token'in health,false);
  });
  await t.test('a credential only ingests for its registered owner and rotation revokes it',async()=>{
   const first=(await(await call('/api/webhook/credentials','user-a',{})).json()).token;
   assert.equal((await call('/api/webhook/aerofocus',first,{flightId:'synthetic-a',userId:'user-b'})).status,200);
   assert.equal((await call('/api/webhook/events',first)).status,401);
   assert.equal((await(await call('/api/webhook/events','user-b')).json()).events.length,0);
   assert.equal((await call('/api/webhook/update-quarantine','user-a',{eventId:'synthetic-a',updatedRecord:{userId:'user-b'}})).status,400);
   assert.equal((await call('/api/webhook/discard','user-b',{eventId:'synthetic-a'})).status,200);
   assert.equal((await(await call('/api/webhook/events','user-a')).json()).events.length,1);
   await call('/api/webhook/credentials','user-a',{});
   assert.equal((await call('/api/webhook/aerofocus',first,{flightId:'revoked'})).status,401);
   await call('/api/webhook/clear','user-b',{});assert.equal(events('user-a').length,1);
  });
  await t.test('PDF failures remain controlled without temporary files or anonymous cost',async()=>{
   const pdf=new FormData();pdf.append('pdf',new Blob(['%PDF-synthetic'],{type:'application/pdf'}),'synthetic.pdf');
   const result=await fetch(base+'/api/parse-pdf',{method:'POST',headers:{Authorization:'Bearer user-a'},body:pdf});assert.equal(result.status,500);
   assert.equal((await call('/api/parse-pdf','user-a',{})).status,400);
   assert.equal((await fetch(base+'/api/webhook/events',{headers:{Authorization:'Bearer user-a',Origin:'https://evil.example'}})).status,403);
  });
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('server configuration refuses implicit remote access and test production credentials',()=>{
 assert.throws(()=>validateServerEnvironment({}));
 assert.throws(()=>validateServerEnvironment({FIREBASE_SERVER_MODE:'production',FIREBASE_PROJECT_ID:'real-project',FIREBASE_ALLOW_REMOTE:'true',NODE_ENV:'test'}));
 assert.throws(()=>validateServerEnvironment({FIREBASE_SERVER_MODE:'production',FIREBASE_PROJECT_ID:'real-project'}));
 assert.equal(validateServerEnvironment({FIREBASE_PROJECT_ID:'demo-wellsprep',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099'}).mode,'emulator');
});
