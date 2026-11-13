import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { createUserWithEmailAndPassword, getIdToken } from 'firebase/auth';
import { doc, setDoc, getDoc, terminate } from 'firebase/firestore';
import { deleteApp } from 'firebase/app';
import { createServerFirebase } from '../server/firebaseRuntime';
import { createFirestoreAeroFocusStore } from '../server/aerofocusStore';
import { createApp } from '../server/app';
import { assertEmulatorEnvironment, requireLocalEmulators, createEmulatorClient } from './helpers/emulatorClient';

const hash=(text:string)=>createHash('sha256').update(text).digest('hex');
test('durable AeroFocus and hardened rules with real local SDKs', {timeout:60000},async(t)=>{
 assertEmulatorEnvironment();await requireLocalEmulators();
 const first=createServerFirebase(),second=createServerFirebase();
 const a=createEmulatorClient('secure-a'),b=createEmulatorClient('secure-b');
 const unique=randomUUID();
 const ua=await createUserWithEmailAndPassword(a.auth,`a-${unique}@example.test`,'synthetic-password-only');
 const ub=await createUserWithEmailAndPassword(b.auth,`b-${unique}@example.test`,'synthetic-password-only');
 const uid=ua.user.uid,other=ub.user.uid;
 const one=createFirestoreAeroFocusStore(first.db),two=createFirestoreAeroFocusStore(second.db);
 const payload={flightId:`synthetic-${unique}`,transactionId:`synthetic-${unique}`,event:'study_session_completed',date:'2026-10-01',topics:[{topicId:'civil-1',effectiveMinutes:30,modality:'repaso',difficulty:5}]};
 const seeded=[second.db.doc(`sessions/synthetic-owned-${unique}`),second.db.doc(`sessions/synthetic-unowned-${unique}`)];
 let server: ReturnType<ReturnType<typeof createApp>['listen']> | undefined;
 try{
  await t.test('concurrent delivery across independent instances creates exactly one owned record',async()=>{
   const results=await Promise.all([one.processPayload(uid,payload),two.processPayload(uid,payload)]);
   assert.equal(results.filter(r=>r.createdRecord).length,1);
   assert.equal((await one.listEvents(uid)).length,1);assert.equal((await two.listEvents(uid)).length,1);
   assert.equal((await two.listEvents(other)).length,0);
   await assert.rejects(one.processPayload(uid,{...payload,topics:[{...payload.topics[0],effectiveMinutes:90}]}),/identificador/);
   assert.equal((await one.listEvents(uid))[0].topics[0].effectiveMinutes,30);
  });
  await t.test('a new connection retains edits after the original instance is closed',async()=>{
   const event=(await one.listEvents(uid))[0];
   await one.updateEvent(uid,event.id,e=>({...e,status:'quarantined',reportMarkdown:'synthetic persisted review'}));
   await first.close();
   const restarted=createServerFirebase();
   try{const records=await createFirestoreAeroFocusStore(restarted.db).listEvents(uid);assert.equal(records.length,1);assert.equal(records[0].reportMarkdown,'synthetic persisted review');}finally{await restarted.close();}
  });
  await t.test('credential rotation and quotas are shared across instances',async()=>{
   await two.registerCredential(uid,hash('synthetic-old'));assert.equal(await two.resolveCredential(hash('synthetic-old')),uid);
   const another=createServerFirebase();try{
    const three=createFirestoreAeroFocusStore(another.db);await three.registerCredential(uid,hash('synthetic-new'));
    assert.equal(await two.resolveCredential(hash('synthetic-old')),null);assert.equal(await two.resolveCredential(hash('synthetic-new')),uid);
    const quotas=await Promise.all([two.consumeQuota(uid,'test',1),three.consumeQuota(uid,'test',1)]);assert.deepEqual(quotas.sort(),[false,true]);
   }finally{await another.close();}
  });
  await t.test('real HTTP ID tokens isolate users and external tokens cannot read histories',async()=>{
   const app=createApp({store:two,verifyIdToken:token=>second.auth.verifyIdToken(token,true)});
   server=app.listen(3322,'127.0.0.1');await new Promise<void>(resolve=>server!.once('listening',resolve));
   const base='http://127.0.0.1:3322';const tokenA=await getIdToken(ua.user),tokenB=await getIdToken(ub.user);
   assert.equal((await fetch(base+'/api/webhook/events')).status,401);
   const own=await(await fetch(base+'/api/webhook/events',{headers:{Authorization:`Bearer ${tokenA}`}})).json();assert.equal(own.events.length,1);
   const otherData=await(await fetch(base+'/api/webhook/events',{headers:{Authorization:`Bearer ${tokenB}`}})).json();assert.equal(otherData.events.length,0);
   const credential=await(await fetch(base+'/api/webhook/credentials',{method:'POST',headers:{Authorization:`Bearer ${tokenA}`}})).json();
   assert.equal((await fetch(base+'/api/webhook/events',{headers:{Authorization:`Bearer ${credential.token}`}})).status,401);
   const incoming=await fetch(base+'/api/webhook/aerofocus',{method:'POST',headers:{'X-Webhook-Token':credential.token,'Content-Type':'application/json'},body:JSON.stringify({...payload,flightId:payload.flightId+'-forged-owner',transactionId:payload.transactionId+'-forged-owner',userId:other})});assert.equal(incoming.status,200);
   assert.equal((await two.listEvents(other)).length,0);
  });
  await t.test('legacy roots reject unowned claims and ownership changes',async()=>{
   await seeded[0].set({userId:uid,synthetic:true});await seeded[1].set({synthetic:true});
   const ownRef=doc(a.db,seeded[0].path),attackRef=doc(b.db,seeded[0].path),unowned=doc(b.db,seeded[1].path);
   assert.equal((await getDoc(ownRef)).data()?.userId,uid);
   await assert.rejects(getDoc(attackRef),e=>(e as any).code==='permission-denied');
   await assert.rejects(setDoc(attackRef,{userId:other}),e=>(e as any).code==='permission-denied');
   await assert.rejects(setDoc(unowned,{userId:other}),e=>(e as any).code==='permission-denied');
   await assert.rejects(getDoc(unowned),e=>(e as any).code==='permission-denied');
   await assert.rejects(setDoc(doc(a.db,`users/${uid}/settings/ownership`),{userId:other}),e=>(e as any).code==='permission-denied');
   await assert.rejects(getDoc(doc(a.db,`_aerofocusCredentialsByUser/${uid}`)),e=>(e as any).code==='permission-denied');
  });
 }finally{
  if(server){server.closeAllConnections();await new Promise<void>(resolve=>server!.close(()=>resolve()));}
  await two.clearEvents(uid);
  for(const ref of seeded)await second.db.doc(ref.path).delete();
  const creds=second.db.doc(`_aerofocusCredentialsByUser/${uid}`);const current=(await creds.get()).data()?.tokenHash;if(current)await second.db.doc(`_aerofocusCredentials/${current}`).delete();await creds.delete();
  await second.db.doc(`_serverQuotas/${uid}/days/${new Date().toISOString().slice(0,10)}-test`).delete();
  await second.db.doc(`_serverQuotas/${uid}/days/${new Date().toISOString().slice(0,10)}-ingest`).delete();
  await Promise.all([terminate(a.db),terminate(b.db),second.close()]);await Promise.all([deleteApp(a.app),deleteApp(b.app)]);
 }
});
