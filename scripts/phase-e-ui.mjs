import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from '@playwright/test';

// Only independent invented observations. Never accepts a private backup path.
const stage = process.argv.includes('--before') ? 'before' : 'after';
const directory = resolve('.cache/phase-e');
await mkdir(directory, { recursive: true });
const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(new Date());
const shift = days => new Date(Date.parse(`${today}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
const monday = shift((1 - weekday + 7) % 7), thursday = shift((4 - weekday + 7) % 7);
const topics = [
  { topicId: 'synthetic-ux-901', number: 901, customTitle: '[FICTICIO] Fuentes del Derecho y aplicación de las normas', pages: 6, numeroPalabras: 1800, difficulty: 6 },
  { topicId: 'synthetic-ux-902', number: 902, customTitle: '[FICTICIO] La persona y los derechos de la personalidad', pages: 8, numeroPalabras: 2400, difficulty: 5 },
  { topicId: 'synthetic-ux-903', number: 903, customTitle: '[FICTICIO] La interpretación de los contratos', pages: 5, numeroPalabras: 1500, difficulty: 7 },
].map(topic => ({ ...topic, subjectId: 'civil', isCustom: true, historyVersion: 3 }));
const session = (id, topicId, days, type, durationMinutes, extra = {}) => ({ id, topicId, date: shift(days), type, durationMinutes, notes: '', difficulty: 5, ...extra });
const sessions = [
  session('ux-initial', topics[0].topicId, -5, 'estudio_inicial', 45, { startPage: 1, endPage: 3, pagesCount: 3, totalPagesAtSession: 6 }),
  session('ux-review', topics[0].topicId, -2, 'repaso', 24, { startPage: 1, endPage: 3, pagesCount: 3, completesVuelta: false }),
  session('ux-oral', topics[0].topicId, -1, 'canto', 12, { cantoSeconds: 30, cantoGrade: 7.5, completesVuelta: true }),
  session('ux-full', topics[1].topicId, -6, 'estudio_inicial', 80, { startPage: 1, endPage: 8, pagesCount: 8, totalPagesAtSession: 8 }),
  ...[5, 4, 3].map((days, index) => session(`ux-refresh-${index}`, topics[1].topicId, -days, 'refresco', 16, { startPage: 1, endPage: 8, pagesCount: 8 })),
];
const task = (id, topic, activityType, date, minutes, extra = {}) => ({ id, topicId: topic.topicId, topicTitle: topic.customTitle, topicNumber: topic.number,
  subjectId: 'civil', activityType, date, status: 'pending', estimatedMinutes: minutes, estimateSource: 'manual', manualEstimatedMinutes: minutes,
  confirmed: true, createdAt: `${today}T07:00:00Z`, ...extra });
const fixture = { schemaVersion: 2, progress: topics, sessions, settings: {
  general: { userId: 'local-backup-replay', activeSubjects: ['civil'], defaultSubject: 'civil', scheduleStr: '', webhookToken: 'only-synthetic-local-token' },
  preparador: { lunes: [topics[0].topicId], jueves: [topics[1].topicId] },
  weeklyPlannerState: { userId: 'local-backup-replay', tasks: [
    task('ux-task-review', topics[1], 'repaso', today, 24), task('ux-task-study', topics[0], 'estudio_nuevo', today, 45, { fromPage: 4, toPage: 6, pagesCount: 3 }),
    task('ux-cante-mon', topics[0], 'cante', monday, 12.5), task('ux-cante-thu', topics[1], 'cante', thursday, 13),
  ], settings: { targetDailyHours: 4, autoRefreshProtocol: 'three_days' } },
}, quarantine: [], timestamp: new Date().toISOString() };
const fixturePath = resolve(directory, 'synthetic-input.json');
await writeFile(fixturePath, JSON.stringify(fixture));
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--force'], {
  stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WELLSPREP_BACKUP_PATH: fixturePath, VITE_FIREBASE_MODE: 'emulator', VITE_FIREBASE_PROJECT_ID: 'demo-wellsprep' },
});
let output = '', browser;
server.stdout.on('data', chunk => { output += chunk; }); server.stderr.on('data', chunk => { output += chunk; });
const report = { stage, syntheticOnly: true, transport: 'in-memory SDK replay', productionAccess: false, externalRequests: 0, errors: [], screens: [], checks: [] };
try {
  for (let i = 0; i < 150 && !output.includes('ready in'); i++) { if (server.exitCode !== null) throw new Error('UI audit server failed; port 5173 must be free.'); await delay(100); }
  assert.ok(output.includes('ready in'), 'UI audit server startup timeout');
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  for (const width of stage === 'before' ? [390, 1440] : [320, 390, 768, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 1050 }, timezoneId: 'Europe/Paris', reducedMotion: 'reduce' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === '127.0.0.1' && url.port === '5173' || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
      report.externalRequests++; return route.abort();
    });
    const page = await context.newPage(); page.setDefaultTimeout(12000);
    page.on('pageerror', error => report.errors.push(error.message));
    await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded', timeout: 90000 }); await page.waitForFunction(() => window.__WELLSPREP_REPLAY__?.ready, null, { timeout: 90000 });
    await page.getByRole('button', { name: /Temario/ }).filter({ visible: true }).first().waitFor();
    const nav = async name => {
      let target = page.getByRole('button', { name }).filter({ visible: true }).first();
      if (!await target.count() && stage === 'before' && /Ajustes|Preferencias/.test(name.source)) await page.getByText('Preferencias', { exact: true }).click();
      else {
        if (!await target.count()) { await page.getByRole('button', { name: /Más/ }).filter({ visible: true }).first().click(); target = page.getByRole('button', { name }).filter({ visible: true }).first(); }
        await target.click();
      }
      await delay(250);
    };
    const capture = async name => {
      await delay(200);
      const metrics = await page.evaluate(() => {
        const visible = element => { const r = element.getBoundingClientRect(), css = getComputedStyle(element); return r.width > 0 && r.height > 0 && css.visibility !== 'hidden' && css.display !== 'none'; };
        return { viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth,
          headings: [...document.querySelectorAll('h1,h2,h3')].filter(visible).map(element => ({ level: element.tagName, text: element.textContent.trim(), top: Math.round(element.getBoundingClientRect().top) })),
          overflow: [...document.querySelectorAll('main *')].filter(visible).filter(element => { const r = element.getBoundingClientRect(); return r.left < -2 || r.right > innerWidth + 2; }).slice(0, 12).map(element => ({ tag: element.tagName, text: element.textContent.trim().slice(0, 70) })),
        };
      });
      if (stage === 'after') assert.ok(metrics.scrollWidth <= width + 1, `Document overflow at ${width}px: ${name}`);
      await page.screenshot({ path: resolve(directory, `${stage}-${width}-${name}.png`), fullPage: false });
      report.screens.push({ width, name, ...metrics });
    };
    await capture('planner');
    if (stage === 'after' && width === 320) {
      await page.clock.install({ time: new Date(`${today}T22:59:59Z`) });
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await page.clock.fastForward(2000);
      const nextDay = Number(shift(1).slice(-2));
      await page.getByTestId('planner-today').getByRole('heading', { name: new RegExp(`Hoy.* ${nextDay}$`) }).waitFor();
      report.checks.push('320px: today and shared projections refresh across local midnight without reloading');
      await page.clock.setSystemTime(new Date());
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    }

    const checkDialog = async (dialog, name) => {
      await dialog.waitFor();
      const bounds = await dialog.boundingBox();
      assert.ok(bounds && bounds.x >= -1 && bounds.x + bounds.width <= width + 1 && bounds.y >= -1 && bounds.y + bounds.height <= (width < 768 ? 844 : 1050) + 1, `${name} fits viewport`);
      for (let index = 0; index < 18; index++) {
        await page.keyboard.press(index % 3 === 0 ? 'Shift+Tab' : 'Tab');
        assert.ok(await dialog.evaluate(element => element.contains(document.activeElement)), `${name} contains keyboard focus`);
      }
      report.checks.push(`${width}px: ${name} fits viewport and contains forward/reverse keyboard focus`);
    };
    if (stage === 'after') {
      const primary = page.getByTestId('planner-next-task').getByRole('button');
      assert.ok((await primary.boundingBox()).y < 600, 'Today action is visible before the calendar');
      const before = await page.evaluate(() => JSON.stringify(window.__WELLSPREP_REPLAY__.snapshot()));
      await primary.click();
      const register = page.getByRole('dialog', { name: 'Registrar sesión real', exact: true });
      await checkDialog(register, 'real session form');
      assert.equal(await register.getByLabel('Minutos reales', { exact: true }).inputValue(), '');
      await capture('registration');
      await page.keyboard.press('Escape');
      await register.waitFor({ state: 'hidden' });
      assert.equal(await page.evaluate(() => JSON.stringify(window.__WELLSPREP_REPLAY__.snapshot())), before, 'opening/cancelling a real-session form does not fabricate observations');
      assert.ok(await primary.evaluate(element => element === document.activeElement), 'focus returns to Register');
      await page.getByRole('button', { name: 'Añadir tarea', exact: true }).click();
      const taskEditor = page.getByRole('dialog', { name: 'Añadir tarea al plan', exact: true });
      await checkDialog(taskEditor, 'task editor');
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Planificar cantes', exact: true }).click();
      await checkDialog(page.getByRole('dialog', { name: 'Planificación por cantes', exact: true }), 'cante proposal');
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: /^Cante Lunes/ }).click();
      await capture('cante');
      await page.getByRole('button', { name: 'Vista Semanal (7 Días)', exact: true }).click();
    }
    await nav(/Temario/); await page.locator('#temario-search-input').fill('[FICTICIO]'); await capture('syllabus');
    const topicTrigger = stage === 'before' ? page.getByRole('heading', { name: topics[0].customTitle, exact: true }) : page.getByRole('button', { name: `Abrir tema 901: ${topics[0].customTitle}`, exact: true });
    await topicTrigger.click(); await capture('topic');
    if (stage === 'after') {
      const edit = page.getByTitle('Editar / Personalizar sesión', { exact: true }).first();
      await edit.click();
      const sessionEditor = page.getByRole('dialog', { name: 'Editar sesión real', exact: true });
      await checkDialog(sessionEditor, 'nested session editor');
      await capture('edit-session');
      await page.keyboard.press('Escape');
      await sessionEditor.waitFor({ state: 'hidden' });
      assert.ok(await page.getByTitle('Cerrar ficha', { exact: true }).isVisible(), 'Escape closes only nested editor');
      assert.ok(await edit.evaluate(element => element === document.activeElement), 'nested editor restores focus to edit action');
    }
    const retention = page.getByText('Retención estimada', { exact: true }).first();
    if (await retention.count()) { await retention.scrollIntoViewIfNeeded(); await capture('retention'); }
    await page.getByTitle('Cerrar ficha', { exact: true }).click();
    await nav(/Dashboard|Resumen/); await capture('dashboard');
    await nav(/AeroFocus/); await capture('aerofocus');
    await page.keyboard.press('Escape');
    if (stage === 'after') await page.getByRole('dialog', { name: /Centro de Control/ }).waitFor({ state: 'hidden' });
    const closeSync = page.getByTitle('Cerrar panel', { exact: true }); if (await closeSync.count()) await closeSync.click();
    await nav(/ajustes|preferencias/i); await capture('settings');
    if (stage === 'after') {
      await checkDialog(page.getByRole('dialog', { name: /Ajustes/ }), 'settings');
      await page.keyboard.press('Escape');
      await page.getByRole('dialog', { name: /Ajustes/ }).waitFor({ state: 'hidden' });
      const returnedFocus = await page.evaluate(() => ({ tag: document.activeElement?.tagName, name: document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent?.trim() }));
      assert.equal(returnedFocus.tag, 'BUTTON', 'settings restores keyboard focus to its persistent trigger');
      report.checks.push(`${width}px: closing settings restores keyboard focus to its persistent trigger`);
      await nav(/Buscar|Búsqueda rápida/);
      const search = page.getByRole('combobox', { name: 'Buscar tema, asignatura o acción', exact: true });
      await search.fill('[FICTICIO]');
      await page.getByRole('option').first().waitFor();
      await page.keyboard.press('ArrowDown');
      assert.ok(await search.getAttribute('aria-activedescendant'), 'global search exposes active result');
      await page.keyboard.press('Escape');
      report.checks.push(`${width}px: global search supports keyboard results and Escape`);
    }
    await context.close();
  }
  await writeFile(resolve(directory, `${stage}-report.json`), JSON.stringify(report, null, 2));
  assert.equal(report.externalRequests, 0); assert.deepEqual(report.errors, []);
  console.log(JSON.stringify({ stage, screens: report.screens.length, checks: report.checks, externalRequests: report.externalRequests, errors: report.errors }));
} catch (error) {
  const failedPage = browser?.contexts().at(-1)?.pages().at(-1);
  if (failedPage) { await failedPage.screenshot({ path: resolve(directory, `${stage}-failure.png`) }); await writeFile(resolve(directory, `${stage}-failure.html`), await failedPage.content()); }
  await writeFile(resolve(directory, `${stage}-failure.json`), JSON.stringify({ error: String(error), report, serverOutput: output }, null, 2));
  throw error;
} finally {
  await browser?.close(); server.kill('SIGTERM');
  if (server.exitCode === null) await new Promise(done => server.once('exit', done));
}
