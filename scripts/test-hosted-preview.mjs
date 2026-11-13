import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from '@playwright/test';
const child=spawn('npm',['run','dev','--','--port','3000','--host','0.0.0.0'],{detached:true,stdio:['ignore','pipe','pipe'],env:{...process.env,VITE_FIREBASE_MODE:'production',WELLSPREP_BACKUP_PATH:'/must-not-be-read/private.json'}});
let output='',browser;child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);
try {
 for(let i=0;i<200&&!output.includes('ready in');i++){assert.equal(child.exitCode,null,output);await delay(100);}
 assert.ok(output.includes('ready in'),output);assert.ok(!output.includes('emulators:'));
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const context=await browser.newContext();const external=[],errors=[];
 await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname==='127.0.0.1'&&u.port==='3000')return route.continue();external.push(u.origin);return route.abort();});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:3000/');await page.getByRole('status').filter({hasText:'DEMOSTRACIÓN'}).waitFor();
 await page.waitForFunction(()=>window.__WELLSPREP_REPLAY__?.ready);
 assert.equal(await page.evaluate(()=>window.__WELLSPREP_REPLAY__.counts().sessions),1);
 assert.equal((await context.request.get('http://127.0.0.1:3000/api/webhook/events')).status(),503);
 for(const p of ['/server.ts','/server/app.ts','/.env'])assert.ok([403,404].includes((await context.request.get('http://127.0.0.1:3000'+p)).status()),p);
 await page.evaluate(async()=>{
   const {db}=await import('/src/lib/firebase.ts');
   const {setDoc,doc}=await import('/src/testing/replayFirestore.ts');
   await setDoc(doc(db,'users/local-backup-replay/sessions/synthetic-preview-edit'),{topicId:'civil-1',type:'repaso',date:'2026-10-02',durationMinutes:10});
 });
 assert.equal(await page.evaluate(()=>window.__WELLSPREP_REPLAY__.counts().sessions),2);
 await page.reload();await page.getByRole('status').filter({hasText:'Cambios solo en memoria'}).waitFor();
 await page.waitForFunction(()=>window.__WELLSPREP_REPLAY__?.ready);
 assert.equal(await page.evaluate(()=>window.__WELLSPREP_REPLAY__.counts().sessions),1);
 assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
 console.log('PASS: AI Studio command, port 3000, synthetic UI, reload, blocked API/private files, zero external requests; no Java or Firebase connection.');
} finally {await browser?.close(); try { process.kill(-child.pid,'SIGTERM'); } catch {} }
