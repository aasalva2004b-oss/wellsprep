import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from '@playwright/test';
import { tsImport } from 'tsx/esm/api';

// No user backup is accepted by this test. Every input is an invented fixture.
const { syntheticTopics, syntheticSessions } = await tsImport('../tests/fixtures/syntheticStudyData.ts', import.meta.url);
const topic = { ...syntheticTopics[0], id: 'synthetic-phase-a-6', number: 990, pages: 6, title: '[FICTICIO] Tema central seis páginas' };
const topicId = topic.id;
const today = new Date();
const day = new Date(today.getTime() - today.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
const upcomingMonday = new Date(today);
upcomingMonday.setDate(today.getDate() + (1 - today.getDay() + 7) % 7);
const monday = new Date(upcomingMonday.getTime() - upcomingMonday.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
const history = [
  { ...syntheticSessions[0], id: 'phase-a-initial', topicId, topicTitle: topic.title, durationMinutes: 30, date: '2026-10-01', startPage: 1, endPage: 3, pagesNumbers: [1, 2, 3], pagesCount: 3, pagesStudied: 3 },
  { id: 'phase-a-review', topicId, topicTitle: topic.title, type: 'repaso', durationMinutes: 30, date: '2026-10-02', startPage: 1, endPage: 6, pagesNumbers: [1, 2, 3, 4, 5, 6], pagesCount: 6, difficulty: 6, completesVuelta: true, notes: 'FICTICIO: repasar todo no completa estudio inicial pendiente.' },
];
const source = {
  schemaVersion: 2,
  progress: [{
    topicId, userId: 'synthetic-student', pages: 6, numeroPalabras: 1800, epigrafes: 3,
    difficulty: 6, isCustom: true, subjectId: 'constitucional', number: 990, customTitle: topic.title,
    studyTimeHours: 999, vueltas: 99, reviewCount: 99, firstStudyDate: '2026-10-01',
  }],
  sessions: history,
  settings: {
    general: { userId: 'synthetic-student', activeSubjects: ['constitucional'], defaultSubject: 'constitucional', scheduleStr: '' },
    preparador: { userId: 'synthetic-student', lunes: [topicId], jueves: [topicId] },
    weeklyCantePlan: { customTopicPages: { [topicId]: 77 }, progressOverrides: { [topicId]: { completedPages: 6 } }, manualDayCompletions: {} },
    weeklyPlannerState: { userId: 'synthetic-student', tasks: [
      { id: 'phase-a-planned-initial', topicId, topicNumber: 990, topicTitle: topic.title, subjectId: 'constitucional', activityType: 'estudio_nuevo', date: day, status: 'pending', estimatedMinutes: 30, estimateSource: 'automatic', createdAt: `${day}T08:00:00.000Z` },
      { id: 'phase-a-confirmed-cante', topicId, topicNumber: 990, topicTitle: topic.title, subjectId: 'constitucional', activityType: 'cante', date: monday, status: 'pending', estimatedMinutes: 12.5, manualEstimatedMinutes: 12.5, estimateSource: 'manual', pinned: true, confirmed: true, planningOrigin: 'manual', createdAt: `${day}T08:00:00.000Z` },
    ] },
  },
  quarantine: [], timestamp: `${day}T08:00:00.000Z`,
};
await mkdir('.cache/phase-a', { recursive: true });
const fixturePath = resolve('.cache/phase-a/synthetic-input.json');
await writeFile(fixturePath, JSON.stringify(source, null, 2));
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, WELLSPREP_BACKUP_PATH: fixturePath, VITE_FIREBASE_MODE: 'emulator', VITE_FIREBASE_PROJECT_ID: 'demo-wellsprep' },
});
let output = '';
server.stdout.on('data', chunk => { output += chunk; });
server.stderr.on('data', chunk => { output += chunk; });
let browser;
let page;
const errors = [];
const report = {
  input: 'entirely synthetic', transport: 'in-memory SDK replay, not Firebase Emulator',
  externalRequests: 0, pageErrors: 0, checks: [], masterPagesBefore: 6, masterPagesAfter: 8,
  initialPagesStudied: 3, initialPagesRemainingBefore: 3, initialPagesRemainingAfter: 5,
  firebasePersistenceVerified: false,
};
try {
  let ready = false;
  for (let attempt = 0; attempt < 150; attempt++) {
    if (server.exitCode !== null) throw new Error('Synthetic UI server failed; port 5173 must be free.');
    if (output.includes('ready in')) { ready = true; break; }
    await delay(100);
  }
  assert.ok(ready, 'Synthetic UI startup timed out');
  const executablePath = process.env.CHROMIUM_EXECUTABLE || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
  await context.route('**/*', route => {
    const target = new URL(route.request().url());
    if (target.hostname === '127.0.0.1' && target.port === '5173') return route.continue();
    if (['blob:', 'data:'].includes(target.protocol)) return route.continue();
    report.externalRequests++;
    return route.abort();
  });
  page = await context.newPage();
  page.setDefaultTimeout(20_000);
  page.on('pageerror', error => { report.pageErrors++; errors.push(error.message); });
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__WELLSPREP_REPLAY__?.ready);
  await page.getByRole('button', { name: 'Temario Oficial', exact: true }).first().waitFor();
  assert.equal((await page.evaluate(() => window.__WELLSPREP_REPLAY__.counts())).sessions, history.length);

  // Inspect the real topic editor, not a stand-alone mock of the coverage component.
  await page.getByRole('button', { name: 'Temario Oficial', exact: true }).first().click();
  await page.locator('#temario-search-input').fill(topic.title);
  await page.getByRole('button', { name: `Abrir tema ${topic.number}: ${topic.title}`, exact: true }).click();
  const coverage = page.getByTestId('initial-study-coverage');
  await coverage.getByText('Estudio inicial: 3 de 6 páginas · 3 pendientes', { exact: true }).waitFor();
  report.checks.push('initial range union excludes full-topic review and stale aggregate counters');
  const parameters = page.locator('div').filter({ has: page.getByRole('heading', { name: 'Parámetros del Tema', exact: false }) }).last();
  const pageInput = page.locator('input[type="number"]').filter({ visible: true }).first();
  // The parameter card's page input is the first visible numeric field in the topic sheet.
  assert.equal(await pageInput.inputValue(), '6');
  await pageInput.fill('8');
  await page.getByRole('button', { name: 'Guardar Parámetros', exact: true }).click();
  await page.waitForFunction(id => window.__WELLSPREP_REPLAY__.snapshot().progress.find(record => record.topicId === id)?.pages === 8, topicId);
  await coverage.getByText('Estudio inicial: 3 de 8 páginas · 5 pendientes', { exact: true }).waitFor();
  assert.equal(await pageInput.inputValue(), '8');
  report.checks.push('master page edit persists locally and updates the same open topic coverage');
  await page.getByTitle('Cerrar ficha', { exact: true }).click();
  await page.getByRole('button', { name: `Abrir tema ${topic.number}: ${topic.title}`, exact: true }).waitFor();

  await page.getByRole('button', { name: 'Planificador & Cantes', exact: true }).first().click();
  await page.getByTitle('Editar tarea', { exact: true }).first().click();
  await page.getByRole('heading', { name: 'Editar Tarea del Plan', exact: true }).waitFor();
  await page.getByText('Volumen: 8 págs', { exact: false }).waitFor();
  report.checks.push('weekly task editor consumes the updated master extent');
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.getByRole('button', { name: /^Cante Lunes/ }).first().click();
  const cantePill = page.getByRole('button', { name: 'Ajustar páginas de Tema 990', exact: true });
  if (!await cantePill.isVisible()) await page.getByText('Detalle y páginas de los temas', { exact: true }).click();
  await cantePill.waitFor();
  assert.match(await cantePill.innerText(), /3\/8p/);
  report.checks.push('Preparador ignores legacy page77/complete6 caches and uses canonical3/8');

  // A new full review remains distinct and does not study the five pending initial pages.
  await page.getByRole('button', { name: 'Temario Oficial', exact: true }).first().click();
  await page.locator('#temario-search-input').fill(topic.title);
  await page.getByTitle('Registrar repaso con tiempo real', { exact: true }).first().click();
  const realSession = page.getByRole('dialog', { name: 'Registrar sesión real' });
  assert.equal(await realSession.getByLabel('Minutos reales', { exact: true }).inputValue(), '');
  await realSession.getByLabel('Minutos reales', { exact: true }).fill('19');
  await realSession.getByRole('button', { name: 'Guardar sesión real', exact: true }).click();
  await realSession.waitFor({ state: 'hidden' });
  await page.waitForFunction(count => window.__WELLSPREP_REPLAY__.counts().sessions === count + 1, history.length);
  await page.getByRole('button', { name: `Abrir tema ${topic.number}: ${topic.title}`, exact: true }).click();
  await coverage.getByText('Estudio inicial: 3 de 8 páginas · 5 pendientes', { exact: true }).waitFor();
  report.checks.push('new review reaches history once and does not advance first-study pages');
  await page.getByTitle('Cerrar ficha', { exact: true }).click();
  await page.getByRole('button', { name: 'Dashboard & Métricas', exact: true }).first().click();
  await page.getByText('Plan del Día', { exact: false }).first().waitFor();
  report.checks.push('Dashboard renders from the same updated history');

  assert.equal(report.externalRequests, 0);
  assert.equal(report.pageErrors, 0);
  await writeFile('.cache/phase-a/browser-report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} catch (error) {
  if (page) await writeFile('.cache/phase-a/failure-dom.txt', await page.locator('body').innerText());
  await writeFile('.cache/phase-a/browser-failure.json', JSON.stringify({ error: String(error), pageErrors: errors, checks: report.checks }, null, 2));
  console.error(JSON.stringify({ syntheticBrowserFailure: String(error), pageErrors: errors, checks: report.checks }));
  throw error;
} finally {
  await browser?.close();
  server.kill('SIGTERM');
  if (server.exitCode === null) await new Promise(done => server.once('exit', done));
}
