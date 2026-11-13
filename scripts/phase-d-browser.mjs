import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from '@playwright/test';

// Every input is invented. Reload uses the exported fixture explicitly; the
// in-memory SDK is not advertised as Firebase persistence or an emulator.
const directory = resolve('.cache/phase-d');
await mkdir(directory, { recursive: true });
const fixturePath = resolve(directory, 'synthetic-input.json');
const today = new Date().toISOString().slice(0, 10);
const shift = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const nextWeekday = (weekday) => shift(today, (weekday - new Date(`${today}T00:00:00Z`).getUTCDay() + 7) % 7 + 7);
const canteDates = [nextWeekday(1), nextWeekday(4)].sort();
const topicA = { topicId: 'synthetic-deadline-a', subjectId: 'civil', number: 990, pages: 6, numeroPalabras: 1800, difficulty: 5, customTitle: '[FICTICIO] Plazo A parcial', isCustom: true, historyVersion: 3 };
const topicB = { topicId: 'synthetic-deadline-b', subjectId: 'civil', number: 991, pages: 4, numeroPalabras: 1200, difficulty: 5, customTitle: '[FICTICIO] Plazo B nuevo', isCustom: true, historyVersion: 3 };
const unknownTopic = { topicId: 'synthetic-deadline-unknown', subjectId: 'civil', number: 992, pages: 0, difficulty: 5, customTitle: '[FICTICIO] Plazo sin extensión', isCustom: true, historyVersion: 3 };
const sessions = [
  { id: 'deadline-initial-a', topicId: topicA.topicId, date: shift(today, -10), type: 'estudio_inicial', durationMinutes: 30, startPage: 1, endPage: 3, pagesCount: 3, totalPagesAtSession: 6, difficulty: 5, completesVuelta: false },
  { id: 'deadline-refresh-a', topicId: topicA.topicId, date: shift(today, -9), type: 'refresco', durationMinutes: 18, startPage: 1, endPage: 6, pagesCount: 6, totalPagesAtSession: 6, difficulty: 5, completesVuelta: false },
  { id: 'deadline-oral-a', topicId: topicA.topicId, date: shift(today, -8), type: 'canto', durationMinutes: 12, cantoSeconds: 30, cantoGrade: 8, difficulty: 5, completesVuelta: false },
];
const fixture = { schemaVersion: 2, progress: [topicA, topicB, unknownTopic], sessions, settings: {
  general: { userId: 'local-backup-replay', scheduleStr: '', activeSubjects: ['civil'], defaultSubject: 'civil' },
  preparador: { lunes: [], jueves: [] }, weeklyPlannerState: { userId: 'local-backup-replay', tasks: [], settings: { targetDailyHours: 4, autoRebalance: false, autoGenerateRefrescos: false } },
}, quarantine: [], timestamp: new Date().toISOString() };
await writeFile(fixturePath, JSON.stringify(fixture));
const port = 5182;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(port)], {
  stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WELLSPREP_BACKUP_PATH: fixturePath, VITE_FIREBASE_MODE: 'emulator', VITE_FIREBASE_PROJECT_ID: 'demo-wellsprep' },
});
let output = '';
server.stdout.on('data', chunk => { output += chunk; });
server.stderr.on('data', chunk => { output += chunk; });
const report = { input: 'entirely synthetic', transport: 'in-memory SDK replay', firebasePersistenceVerified: false,
  reloadSource: 'explicitly exported synthetic fixture, not automatic SDK persistence', externalRequests: 0, checks: [] };
let browser;
let page;
const errors = [];
const isolate = async (context) => {
  await context.route('**/*', route => {
    const target = new URL(route.request().url());
    if (target.hostname === '127.0.0.1' && target.port === String(port)) {
      if (target.pathname.startsWith('/api/')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{"events":[]}' });
      return route.continue();
    }
    if (['blob:', 'data:'].includes(target.protocol)) return route.continue();
    report.externalRequests++;
    return route.abort();
  });
};
try {
  for (let attempt = 0; attempt < 150 && !output.includes('ready in'); attempt++) {
    if (server.exitCode !== null) throw new Error('Phase D synthetic server failed.');
    await delay(100);
  }
  assert.ok(output.includes('ready in'), 'Phase D synthetic server startup timeout');
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
  await isolate(context);
  page = await context.newPage();
  page.setDefaultTimeout(20_000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__WELLSPREP_REPLAY__?.ready);
  await page.getByRole('button', { name: 'Planificador & Cantes', exact: true }).first().click();
  await page.getByRole('button', { name: 'Planificar cantes', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Planificación por cantes', exact: true });
  const populate = async () => {
    for (const [index, topic] of [topicA, topicB].entries()) {
      await modal.getByLabel(`Fecha del cante ${index + 1}`, { exact: true }).fill(canteDates[index]);
      await modal.getByLabel(`Buscar temas para el cante ${index + 1}`, { exact: true }).fill(topic.customTitle);
      await modal.getByLabel(`Temas del cante ${index + 1}`, { exact: true }).getByRole('checkbox').first().check();
    }
    await modal.getByRole('button', { name: 'Generar propuesta', exact: true }).click();
    await modal.getByTestId('cante-plan-proposal').waitFor();
  };
  const baseline = await page.evaluate(() => JSON.stringify(window.__WELLSPREP_REPLAY__.snapshot()));
  await populate();
  assert.equal(await page.evaluate(() => JSON.stringify(window.__WELLSPREP_REPLAY__.snapshot())), baseline);
  const preview = modal.getByTestId('cante-plan-proposal');
  const uiKnownMinutes = Number.parseFloat(await preview.locator('[role="status"] strong').first().innerText());
  const displayedDays = await preview.getByTestId('cante-proposal-day').count();
  assert.ok(displayedDays > 0);
  await modal.getByRole('button', { name: 'Cancelar', exact: true }).click();
  assert.equal(await page.evaluate(() => JSON.stringify(window.__WELLSPREP_REPLAY__.snapshot())), baseline);
  report.checks.push('generating a dated proposal and cancelling it never writes tasks, settings, sessions or progress');

  await page.getByRole('button', { name: 'Planificar cantes', exact: true }).click();
  await populate();
  const acknowledgement = modal.getByText('Entiendo que hay conflictos o datos pendientes; guardar esta propuesta no la convierte en viable.', { exact: true });
  if (await acknowledgement.count()) {
    assert.equal(await modal.getByRole('button', { name: 'Confirmar planificación', exact: true }).isEnabled(), false);
    await acknowledgement.click();
    report.checks.push('a proposal with unknown estimates/conflicts requires acknowledging them before confirmation');
  }
  await modal.getByRole('button', { name: 'Confirmar planificación', exact: true }).click();
  await modal.waitFor({ state: 'hidden' });
  await page.waitForFunction(() => window.__WELLSPREP_REPLAY__.snapshot().settings.weeklyPlannerState?.tasks?.length > 0);
  const confirmed = await page.evaluate(() => window.__WELLSPREP_REPLAY__.snapshot().settings.weeklyPlannerState);
  assert.equal(confirmed.tasks.length, new Set(confirmed.tasks.map(task => task.id)).size);
  const oral = confirmed.tasks.filter(task => task.activityType === 'cante');
  assert.deepEqual(oral.map(task => ({ topicId: task.topicId, date: task.date })).sort((a, b) => a.date.localeCompare(b.date)), [topicA, topicB].map((topic, index) => ({ topicId: topic.topicId, date: canteDates[index] })));
  assert.ok(oral.every(task => task.confirmed));
  const study = confirmed.tasks.filter(task => task.activityType === 'estudio_nuevo');
  const pagesFor = topic => [...new Set(study.filter(task => task.topicId === topic.topicId).flatMap(task => task.pagesNumbers || Array.from({ length: task.toPage - task.fromPage + 1 }, (_, index) => task.fromPage + index)))].sort((a, b) => a - b);
  assert.deepEqual(pagesFor(topicA), [4, 5, 6]);
  assert.deepEqual(pagesFor(topicB), [1, 2, 3, 4]);
  assert.equal(confirmed.tasks.reduce((sum, task) => sum + (task.estimatedMinutes ?? 0), 0), uiKnownMinutes);
  assert.equal(await page.evaluate(() => window.__WELLSPREP_REPLAY__.snapshot().sessions.length), sessions.length);
  assert.deepEqual(await page.evaluate(() => window.__WELLSPREP_REPLAY__.snapshot().progress), fixture.progress);
  report.checks.push('confirmation stores unique tasks, the two chosen oral commitments and exactly the remaining initial pages; it creates no study observations');
  report.checks.push('known summary minutes equal the sum of the stored task estimates shown in the proposal');

  // Exercise the adjustable priors in the actual Settings dialog, without changing observations.
  await page.getByText('Preferencias', { exact: true }).first().click();
  await page.getByRole('button', { name: 'Materias & Apariencia', exact: true }).click();
  await page.getByLabel('Semivida inicial en días', { exact: true }).fill('14');
  await page.getByLabel('Recuerdo inicial supuesto en porcentaje', { exact: true }).fill('75');
  await page.getByLabel('Umbral para proponer repaso en porcentaje', { exact: true }).fill('65');
  await page.getByRole('button', { name: 'Guardar criterios de retención', exact: true }).click();
  await page.waitForFunction(() => window.__WELLSPREP_REPLAY__.snapshot().settings.general?.retention?.initialStabilityDays === 14);
  assert.deepEqual(await page.evaluate(() => window.__WELLSPREP_REPLAY__.snapshot().settings.general.retention), { initialStabilityDays: 14, initialRecallProbability: .75, reviewThreshold: .65 });
  const beforeInvalid = await page.evaluate(() => JSON.stringify(window.__WELLSPREP_REPLAY__.snapshot()));
  await page.getByLabel('Semivida inicial en días', { exact: true }).fill('1000');
  await page.getByRole('button', { name: 'Guardar criterios de retención', exact: true }).click();
  assert.equal(await page.evaluate(() => JSON.stringify(window.__WELLSPREP_REPLAY__.snapshot())), beforeInvalid);
  report.checks.push('explicit retention priors save in Settings, while out-of-range input leaves the full stored snapshot unchanged');

  await page.getByRole('button', { name: 'Datos & Respaldo', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Vincular y Recuperar Historial de Google', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Limpiar y Purgar Sesiones de AeroFocus', exact: true }).count(), 0);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar Backup (.json)', exact: true }).click();
  const download = await downloadPromise;
  const exportPath = resolve(directory, 'confirmed-synthetic-export.json');
  await download.saveAs(exportPath);
  const exported = JSON.parse(await readFile(exportPath, 'utf8'));
  assert.deepEqual(exported.settings.weeklyPlannerState.tasks, confirmed.tasks);
  assert.deepEqual(exported.sessions.map(session => session.id).sort(), sessions.map(session => session.id).sort());
  await writeFile(fixturePath, JSON.stringify(exported));
  await context.close();
  const restoredContext = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  await isolate(restoredContext);
  page = await restoredContext.newPage();
  page.setDefaultTimeout(20_000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__WELLSPREP_REPLAY__?.ready);
  await page.getByRole('button', { name: 'Planificador & Cantes', exact: true }).first().click();
  assert.deepEqual(await page.evaluate(() => window.__WELLSPREP_REPLAY__.snapshot().settings.weeklyPlannerState.tasks), confirmed.tasks);
  await page.getByRole('button', { name: 'Planificar cantes', exact: true }).click();
  const restoredModal = page.getByRole('dialog', { name: 'Planificación por cantes', exact: true });
  const lockedDates = await restoredModal.locator('input[type="date"]:disabled').evaluateAll(inputs => inputs.map(input => input.value).sort());
  assert.deepEqual(lockedDates, canteDates, 'Only the two actual confirmed dates may be locked; moved-date IDs must not lock a blank default goal');
  report.checks.push('exporting and loading that fixture in a fresh browser restores confirmed tasks and locks their oral commitments; localStorage is absent');
  const beforeUnknown = await page.evaluate(() => JSON.stringify(window.__WELLSPREP_REPLAY__.snapshot()));
  await restoredModal.getByRole('button', { name: 'Añadir otra fecha de cante', exact: true }).click();
  const unknownGoal = restoredModal.locator('fieldset').last();
  await unknownGoal.locator('input[type="date"]').fill(shift(canteDates[1], 11));
  await unknownGoal.locator('input[aria-label^="Buscar temas para el cante"]').fill(unknownTopic.customTitle);
  await unknownGoal.getByRole('checkbox').check();
  await restoredModal.getByRole('button', { name: 'Generar propuesta', exact: true }).click();
  await restoredModal.getByTestId('cante-plan-proposal').waitFor();
  assert.notEqual(await restoredModal.getByTestId('cante-plan-proposal').getAttribute('data-viability'), 'feasible');
  assert.equal(await restoredModal.getByRole('button', { name: 'Confirmar planificación', exact: true }).isEnabled(), false);
  await restoredModal.getByText('Entiendo que hay conflictos o datos pendientes; guardar esta propuesta no la convierte en viable.', { exact: true }).click();
  assert.equal(await restoredModal.getByRole('button', { name: 'Confirmar planificación', exact: true }).isEnabled(), true);
  await restoredModal.getByRole('button', { name: 'Cancelar', exact: true }).click();
  assert.equal(await page.evaluate(() => JSON.stringify(window.__WELLSPREP_REPLAY__.snapshot())), beforeUnknown);
  report.checks.push('unknown topic extent prevents certifying feasibility, requires an explicit acknowledgement, and cancelling preserves the confirmed plan');
  assert.equal(report.externalRequests, 0);
  assert.deepEqual(errors, []);
  await writeFile(resolve(directory, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await page?.screenshot({ path: resolve(directory, 'failure.png'), fullPage: true }).catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
