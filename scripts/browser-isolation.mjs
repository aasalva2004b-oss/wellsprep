import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from '@playwright/test';

const full = process.argv.includes('--with-emulators');
const backend = process.argv.includes('--with-server');
const url = 'http://127.0.0.1:5173/';
const server = spawn(process.execPath, backend ? ['--import','tsx','server.ts'] : ['node_modules/vite/bin/vite.js'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, NODE_ENV: 'development', PORT: '5173', DISABLE_HMR: 'true', VITE_FIREBASE_MODE: 'emulator', VITE_FIREBASE_PROJECT_ID: 'demo-wellsprep' },
});
let output = '';
server.stdout.on('data', data => { output += data; });
server.stderr.on('data', data => { output += data; });
let browser;
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(`Local Vite failed (port 5173 must be free): ${output}`);
    if (output.includes(backend ? 'Wells Prep server ready' : 'ready in')) { ready = true; break; }
    await delay(100);
  }
  assert.ok(ready, `Vite startup timed out: ${output}`);
  const executablePath = process.env.CHROMIUM_EXECUTABLE || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const context = await browser.newContext();
  const external = [];
  const firebaseDestinations = [];
  const errors = [];
  await context.route('**/*', route => {
    const target = new URL(route.request().url());
    const local = ['127.0.0.1', 'localhost'].includes(target.hostname)
      && ['5173', '8080', '9099'].includes(target.port);
    if (!local) { external.push(target.origin); return route.abort(); }
    if (['8080', '9099'].includes(target.port)) firebaseDestinations.push(target.origin);
    return route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const response = await page.goto(url);
  assert.ok(response.headers()['content-security-policy'].includes('http://127.0.0.1:8080'));
  await page.getByRole('button', { name: 'Entrar con datos sintéticos' }).waitFor();
  // Force Auth Emulator to be unavailable, even if it is running. No cloud fallback is allowed.
  await page.route('http://127.0.0.1:9099/**', route => route.abort());
  await page.getByRole('button', { name: 'Entrar con datos sintéticos' }).click();
  await page.getByRole('alert').filter({ hasText: 'no se conectará a producción' }).waitFor();
  await page.unroute('http://127.0.0.1:9099/**');
  console.log('Browser: synthetic login, CSP and unavailable-emulator fail-closed check passed.');
  if (full) {
    await page.getByRole('button', { name: 'Entrar con datos sintéticos' }).click();
    await page.getByRole('status').filter({ hasText: 'Datos sintéticos' }).waitFor({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Temario Oficial', exact: false }).first().click();
    await page.getByText('[FICTICIO] Instituciones de la isla imaginaria', { exact: false }).first().waitFor();
    assert.ok(firebaseDestinations.some(origin => origin.endsWith(':8080')));
    assert.ok(firebaseDestinations.some(origin => origin.endsWith(':9099')));
    console.log('Browser: synthetic Auth login and Firestore topic rendered successfully.');
    if (backend) {
      const roundTrip = await page.evaluate(async () => {
        const { authenticatedFetch } = await import('/src/lib/authenticatedApi.ts');
        const credential = await (await authenticatedFetch('/api/webhook/credentials', {method:'POST'})).json();
        const incoming = await fetch('/api/webhook/aerofocus', {method:'POST',headers:{'Content-Type':'application/json','X-Webhook-Token':credential.token},body:JSON.stringify({flightId:'synthetic-browser-runtime',date:'2026-10-01',topics:[{topicId:'civil-1',effectiveMinutes:20,modality:'repaso'}]})});
        const events = await (await authenticatedFetch('/api/webhook/events')).json();
        const privateStatuses = await Promise.all(['/server.ts','/server/app.ts','/@fs'+location.pathname+'server.ts','/.env','/build/server.cjs','/uploads/private.json'].map(async path => (await fetch(path)).status));
        return {status: incoming.status, count: events.events.filter(event=>event.flightId==='synthetic-browser-runtime'||event.id==='synthetic-browser-runtime').length,privateStatuses};
      });
      assert.equal(roundTrip.status,200);assert.equal(roundTrip.count,1);
      assert.ok(roundTrip.privateStatuses.every(status=>status===404||status===403));
      console.log('Browser: real Express credentials/ingestion/read round-trip passed; private development sources denied.');
    }
  }
  assert.deepEqual(external, [], 'Browser attempted an external HTTP request');
  assert.deepEqual(errors, [], 'Browser reported an unhandled application error');
  console.log('Browser isolation: zero external requests and zero unhandled errors.');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
  if (server.exitCode === null) await new Promise(resolve => server.once('exit', resolve));
}
