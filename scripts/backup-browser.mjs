import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from '@playwright/test';

const input = process.argv[2] || process.env.WELLSPREP_BACKUP_PATH;
if (!input) throw new Error('Pass a private backup path; no backup is bundled in the repository.');
const backupPath = resolve(input);
const sourceBytes = await readFile(backupPath);
const sourceHash = createHash('sha256').update(sourceBytes).digest('hex');
const source = JSON.parse(sourceBytes.toString());
assert.ok(Array.isArray(source.progress) && Array.isArray(source.sessions), 'Input must be a WellsPrep JSON backup');
const expectedCounts = { progress: source.progress.length, sessions: source.sessions.length };
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, WELLSPREP_BACKUP_PATH: backupPath, VITE_FIREBASE_MODE: 'emulator', VITE_FIREBASE_PROJECT_ID: 'demo-wellsprep' },
});
let output = '';
server.stdout.on('data', data => { output += data; });
server.stderr.on('data', data => { output += data; });
let browser;
const report = { counts: expectedCounts, screens: [], sourceUnchanged: false, externalRequests: 0, pageErrors: 0, baselineRecordsPreserved: false, exportFieldsPreserved: false, importCountsPreserved: false, transport: 'development-only in-memory SDK replay; not Firebase Emulator' };
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
function recordsPreserved(expected, actual, key) {
  const byId = new Map(actual.map(record => [record[key], record]));
  return expected.every(record => {
    const candidate = byId.get(record[key]);
    return candidate && Object.keys(record).every(field => JSON.stringify(canonical(record[field])) === JSON.stringify(canonical(candidate[field])));
  });
}
try {
  let ready = false;
  for (let i = 0; i < 150; i++) {
    if (server.exitCode !== null) throw new Error('Replay Vite failed to start; port 5173 must be free.');
    if (output.includes('ready in')) { ready = true; break; }
    await delay(100);
  }
  assert.ok(ready, 'Replay Vite startup timed out');
  const executablePath = process.env.CHROMIUM_EXECUTABLE || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  await context.route('**/*', route => {
    const target = new URL(route.request().url());
    if (target.hostname === '127.0.0.1' && target.port === '5173') return route.continue();
    if (target.protocol === 'blob:' || target.protocol === 'data:') return route.continue();
    report.externalRequests++;
    return route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  page.on('pageerror', () => { report.pageErrors++; });
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__WELLSPREP_REPLAY__?.ready === true);
  await page.getByRole('button', { name: 'Temario Oficial', exact: true }).first().waitFor();
  const initial = await page.evaluate(() => JSON.parse(JSON.stringify(window.__WELLSPREP_REPLAY__.snapshot())));
  assert.deepEqual(await page.evaluate(() => window.__WELLSPREP_REPLAY__.counts()), expectedCounts);
  assert.ok(recordsPreserved(source.progress, initial.progress, 'topicId') && recordsPreserved(source.sessions, initial.sessions, 'id'), 'Reading the app changed source records');
  assert.equal(await page.evaluate(() => window.__WELLSPREP_REPLAY__.mutations.filter(change => ['sessions', 'progress'].includes(change.collection)).length), 0, 'Startup mutated study records');
  report.baselineRecordsPreserved = true;
  report.screens.push('weekly planner');

  await page.getByRole('button', { name: 'Temario Oficial', exact: true }).first().click();
  await page.getByRole('heading', { name: 'Temario Oficial', exact: true }).waitFor();
  report.screens.push('syllabus');
  await page.locator('h3[title]').first().click();
  await page.getByText('Historial de Sesiones del Tema', { exact: false }).waitFor();
  assert.ok(await page.locator('[title="Editar / Personalizar sesión"]').count() > 0, 'The selected topic must render its study history');
  report.screens.push('topic editor and study/cante history');
  await page.getByTitle('Cerrar ficha', { exact: true }).click();

  await page.getByRole('button', { name: 'Dashboard & Métricas', exact: true }).first().click();
  await page.getByText('Plan del Día', { exact: false }).first().waitFor();
  report.screens.push('dashboard');

  await page.getByText('Copia local de prueba', { exact: true }).click();
  await page.getByRole('button', { name: 'Datos & Respaldo', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar Backup (.json)', exact: true }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const downloaded = Buffer.concat(chunks);
  const exported = JSON.parse(downloaded.toString());
  assert.equal(exported.progress.length, source.progress.length, 'Export omitted progress documents');
  assert.equal(exported.sessions.length, source.sessions.length, 'Export omitted sessions');
  assert.ok(recordsPreserved(source.progress, exported.progress, 'topicId'), 'Export changed or omitted a progress field');
  assert.ok(recordsPreserved(source.sessions, exported.sessions, 'id'), 'Export changed or omitted a session field');
  report.exportFieldsPreserved = true;
  report.screens.push('backup export');

  await page.locator('input[type="file"][accept=".json"]').setInputFiles({ name: 'local-replay.json', mimeType: 'application/json', buffer: downloaded });
  await page.waitForFunction(({ sessions, progress }) => {
    const state = window.__WELLSPREP_REPLAY__;
    return state?.ready && state.mutations.some(change => change.collection === 'sessions') && state.counts().sessions === sessions && state.counts().progress === progress;
  }, expectedCounts);
  report.importCountsPreserved = true;
  report.screens.push('backup reimport without duplicate IDs');

  assert.equal(exported.schemaVersion, 2, 'Complete exports need a versioned schema');
  assert.ok(exported.settings && Array.isArray(exported.quarantine), 'Export omitted settings/quarantine containers');
  const restoredTimestamps = await page.evaluate(() => window.__WELLSPREP_REPLAY__.snapshot().sessions.every(session =>
    !session.createdAt || typeof session.createdAt.toMillis === 'function'));
  assert.ok(restoredTimestamps, 'Restoration must rebuild timestamp objects');
  report.timestampsRestored = true;
  const beforeInvalid = await page.evaluate(() => window.__WELLSPREP_REPLAY__.mutations.length);
  const invalid = { ...exported, sessions: [...exported.sessions, exported.sessions[0]] };
  await page.locator('input[type="file"][accept=".json"]').setInputFiles({ name: 'invalid-local-replay.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(invalid)) });
  await page.getByText(/Copia no válida:/).first().waitFor();
  assert.equal(await page.evaluate(() => window.__WELLSPREP_REPLAY__.mutations.length), beforeInvalid, 'Invalid imports wrote partial records');
  report.invalidImportWrites = 0;
  await page.getByRole('button', { name: 'Cerrar ajustes', exact: true }).click();

  await page.getByRole('button', { name: 'Temario Oficial', exact: true }).first().click();
  const beforeNewSession = await page.evaluate(() => JSON.parse(JSON.stringify(window.__WELLSPREP_REPLAY__.snapshot())));
  await page.getByTitle('Registrar repaso con tiempo real', { exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Registrar sesión real' });
  await dialog.waitFor();
  assert.equal(await dialog.getByLabel('Minutos reales', { exact: true }).inputValue(), '', 'Estimated time was prefilled as observed');
  assert.equal(await dialog.getByLabel('He completado una vuelta entera').isChecked(), false);
  assert.equal((await page.evaluate(() => window.__WELLSPREP_REPLAY__.counts())).sessions, expectedCounts.sessions);
  await dialog.getByLabel('Minutos reales', { exact: true }).fill('23');
  await dialog.getByLabel('Dificultad', { exact: true }).fill('6');
  await dialog.getByRole('button', { name: 'Guardar sesión real', exact: true }).click();
  await page.waitForFunction(count => window.__WELLSPREP_REPLAY__.counts().sessions === count + 1, expectedCounts.sessions);
  const afterNewSession = await page.evaluate(() => JSON.parse(JSON.stringify(window.__WELLSPREP_REPLAY__.snapshot())));
  assert.ok(recordsPreserved(beforeNewSession.sessions, afterNewSession.sessions, 'id'), 'A new session changed historical session records');
  const originalIds = new Set(beforeNewSession.sessions.map(record => record.id));
  const newSessions = afterNewSession.sessions.filter(record => !originalIds.has(record.id));
  assert.equal(newSessions.length, 1);
  assert.equal(newSessions[0].durationMinutes, 23);
  assert.equal(newSessions[0].durationReal, 23);
  assert.equal(newSessions[0].completesVuelta, false);
  const priorProgress = beforeNewSession.progress.find(record => record.topicId === newSessions[0].topicId);
  const nextProgress = afterNewSession.progress.find(record => record.topicId === newSessions[0].topicId);
  assert.equal(nextProgress.vueltas, priorProgress.vueltas, 'A partial session incorrectly completed a vuelta');
  assert.ok(Math.abs(nextProgress.studyTimeHours - priorProgress.studyTimeHours - 23 / 60) < .011, 'New observed minutes did not reach topic totals');
  report.observedSessionRecorded = true;
  report.historicalSessionsUnchanged = true;
  report.screens.push('observed session form and linked topic totals');

  // Reload discards the in-memory edits and reads the untouched private file again.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(count => window.__WELLSPREP_REPLAY__?.ready && window.__WELLSPREP_REPLAY__.counts().sessions === count, expectedCounts.sessions);
  assert.deepEqual(await page.evaluate(() => window.__WELLSPREP_REPLAY__.counts()), expectedCounts);
  report.reloadRestoredOriginal = true;

  await page.getByTitle('Registrar estudio real en WellsPrep y marcar tarea como completada', { exact: true }).first().waitFor();
  await page.getByTitle('Registrar estudio real en WellsPrep y marcar tarea como completada', { exact: true }).first().click();
  const canteDialog = page.getByRole('dialog', { name: 'Registrar sesión real' });
  await canteDialog.waitFor();
  assert.equal(await canteDialog.getByLabel('Minutos reales', { exact: true }).inputValue(), '');
  await canteDialog.getByLabel('Minutos reales', { exact: true }).fill('12');
  await canteDialog.getByLabel('Segundos del cante', { exact: true }).fill('30');
  await canteDialog.getByLabel('Nota del cante', { exact: true }).fill('7.5');
  await canteDialog.getByRole('button', { name: 'Guardar sesión real', exact: true }).click();
  await canteDialog.waitFor({ state: 'hidden' });
  const plannedSnapshot = await page.evaluate(() => JSON.parse(JSON.stringify(window.__WELLSPREP_REPLAY__.snapshot())));
  const baselineIds = new Set(source.sessions.map(session => session.id));
  const linked = plannedSnapshot.sessions.filter(session => !baselineIds.has(session.id));
  assert.equal(linked.length, 1);
  assert.equal(linked[0].durationMinutes, 12);
  assert.equal(linked[0].cantoSeconds, 30);
  assert.equal(linked[0].cantoGrade, 7.5);
  assert.ok(linked[0].plannerTaskId, 'A planned cante lost its task identity');
  const completedTask = plannedSnapshot.settings.weeklyPlannerState.tasks.find(task => task.id === linked[0].plannerTaskId);
  assert.equal(completedTask.status, 'completed');
  assert.equal(completedTask.actualMinutes, 12.5);
  report.plannedCanteLinked = true;
  // A second submission for the same task must not add another session or progress.
  await page.getByTitle('Registrar estudio real en WellsPrep y marcar tarea como completada', { exact: true }).first().click();
  await canteDialog.getByLabel('Minutos reales', { exact: true }).fill('13');
  await canteDialog.getByLabel('Segundos del cante', { exact: true }).fill('30');
  await canteDialog.getByRole('button', { name: 'Guardar sesión real', exact: true }).click();
  await canteDialog.getByRole('alert').filter({ hasText: 'ya tiene una sesión registrada' }).waitFor();
  assert.equal((await page.evaluate(() => window.__WELLSPREP_REPLAY__.counts())).sessions, expectedCounts.sessions + 1);
  await canteDialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  report.duplicateTaskSubmissionBlocked = true;
  report.screens.push('planned cante, measured seconds/grade and duplicate task rejection');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(count => window.__WELLSPREP_REPLAY__?.ready && window.__WELLSPREP_REPLAY__.counts().sessions === count, expectedCounts.sessions);

  assert.equal(report.externalRequests, 0, 'Replay attempted a request outside its local Vite origin');
  assert.equal(report.pageErrors, 0, 'An unhandled UI error occurred during backup replay');
  report.sourceUnchanged = createHash('sha256').update(await readFile(backupPath)).digest('hex') === sourceHash;
  assert.ok(report.sourceUnchanged, 'The supplied backup file changed');
  await mkdir('.cache/backup-replay', { recursive: true });
  await writeFile('.cache/backup-replay/browser-report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  await browser?.close();
  server.kill('SIGTERM');
  if (server.exitCode === null) await new Promise(resolveExit => server.once('exit', resolveExit));
}
