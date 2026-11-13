import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from '@playwright/test';

// Actual Provider and Firestore transaction code, using only an in-memory SDK.
// This check does not claim Firebase Emulator or remote persistence verification.
const port = 5181;
const directory = resolve('.cache/provider-synthetic');
await mkdir(directory, { recursive: true });
const topicId = 'civil-1';
const record = (id, extra = {}) => ({ id, topicId, date: '2026-10-01', type: 'estudio_inicial', durationMinutes: 30, ...extra });
const fixture = {
  schemaVersion: 2,
  progress: [{ topicId, pages: 6, difficulty: 5, historyVersion: 3 }, { topicId: 'civil_1', pages: 77 }, { topicId: '5', pages: 5, firstStudyDate: '2026-10-01' }],
  sessions: [
    record('provider-part-1', { startPage: 1, endPage: 3, pagesCount: 3 }),
    record('provider-part-2', { startPage: 4, endPage: 6, pagesCount: 3 }),
    record('provider-bare-five', { topicId: '5', type: 'canto', durationMinutes: 12, cantoGrade: 8 }),
    record('provider-penal-seven', { topicId: '7', subjectId: 'penal', type: 'repaso', durationMinutes: 20 }),
    record('provider-const-alias', { topicId: 'const_17', type: 'repaso', durationMinutes: 20 }),
  ],
  settings: { general: { userId: 'local-backup-replay', scheduleStr: '', activeSubjects: ['civil'], defaultSubject: 'civil' } },
  quarantine: [], timestamp: '2026-11-08T00:00:00Z',
};
const fixturePath = resolve(directory, 'input.json');
await writeFile(fixturePath, JSON.stringify(fixture));
await writeFile(resolve(directory, 'probe.tsx'), `
import { createElement, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { FirebaseProvider, useFirebase } from '../../src/lib/FirebaseProvider';
function Probe() {
  const context = useFirebase();
  useEffect(() => { (window as any).__PROVIDER_PROBE__ = context; }, [context]);
  return null;
}
export function mount() {
  const container = document.createElement('div'); document.body.appendChild(container);
  createRoot(container).render(createElement(FirebaseProvider, null, createElement(Probe)));
}
`);
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(port)], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, WELLSPREP_BACKUP_PATH: fixturePath, VITE_FIREBASE_MODE: 'emulator', VITE_FIREBASE_PROJECT_ID: 'demo-wellsprep' },
});
let output = '';
server.stdout.on('data', chunk => { output += chunk; });
server.stderr.on('data', chunk => { output += chunk; });
let browser;
const report = { input: 'synthetic only', transport: 'in-memory SDK replay', firebasePersistenceVerified: false, externalRequests: 0, checks: [] };
try {
  for (let attempt = 0; attempt < 150 && !output.includes('ready in'); attempt++) {
    if (server.exitCode !== null) throw new Error('Provider synthetic UI server failed.');
    await delay(100);
  }
  assert.ok(output.includes('ready in'), 'Provider UI startup timeout');
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const context = await browser.newContext();
  await context.route('**/*', async route => {
    const target = new URL(route.request().url());
    if (target.hostname !== '127.0.0.1' || target.port !== String(port)) {
      if (['blob:', 'data:'].includes(target.protocol)) return route.continue();
      report.externalRequests++;
      return route.abort();
    }
    // Manual fixture creation may mirror a webhook locally. No server transport
    // or credential is exercised by this SDK replay check.
    if (target.pathname.startsWith('/api/webhook/')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"synthetic-test-only"}' });
    }
    // Extend the local replay only inside this browser test with a second synthetic
    // identity; no SDK/auth implementation used by the application is modified.
    if (target.pathname === '/src/testing/replayAuth.ts') {
      const response = await route.fetch();
      return route.fulfill({ response, body: `${await response.text()}\nexport function switchSyntheticUser(uid) { const next = { uid, displayName: 'Synthetic account', email: uid + '@example.test' }; auth.currentUser = next; listeners.forEach(listener => listener(next)); }\n` });
    }
    if (target.pathname === '/src/testing/replayFirestore.ts') {
      const response = await route.fetch();
      const source = await response.text();
      const withSecondUser = source.replace('if (path !== `users/${uid}` && !path.startsWith(prefix))', 'if (path !== `users/${uid}` && !path.startsWith(prefix) && path !== "users/synthetic-secondary" && !path.startsWith("users/synthetic-secondary/"))');
      assert.notEqual(withSecondUser, source, 'Test-only second synthetic user guard must be installed explicitly');
      const setDocStart = 'export async function setDoc(ref, data, options) {';
      const patched = withSecondUser.replace(setDocStart, `${setDocStart}
        if (ref.path.includes('/quarantine/')) {
          if (window.__FAIL_QUARANTINE_WRITE__) throw new Error('Synthetic quarantine persistence failure');
          if (window.__DELAY_QUARANTINE_WRITE__) await new Promise(resolve => { window.__RESUME_QUARANTINE_WRITE__ = resolve; });
        }
      `);
      assert.notEqual(patched, withSecondUser, 'Test-only quarantine failure/delay injection must be installed explicitly');
      return route.fulfill({ response, body: patched });
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__WELLSPREP_REPLAY__?.ready);
  await page.evaluate(async () => (await import('/.cache/provider-synthetic/probe.tsx')).mount());
  await page.waitForFunction(() => window.__PROVIDER_PROBE__?.loading === false && window.__PROVIDER_PROBE__.recentSessions.length === 5);
  const masterIdentity = await page.evaluate(() => ({
    pages: window.__PROVIDER_PROBE__.rawTopicProgress['civil-1'].pages,
    duplicate: window.__PROVIDER_PROBE__.topicState.has('civil_1'),
  }));
  assert.deepEqual(masterIdentity, { pages: 6, duplicate: false }, 'Canonical master wins over historical aliases without creating another topic');
  const identities = await page.evaluate(() => {
    const probe = window.__PROVIDER_PROBE__;
    return {
      bare: probe.recentSessions.find(session => session.id === 'provider-bare-five').topicId,
      explicit: probe.recentSessions.find(session => session.id === 'provider-penal-seven').topicId,
      alias: probe.recentSessions.find(session => session.id === 'provider-const-alias').topicId,
      constitutionalFiveCount: probe.topicState.get('constitucional-5')?.sessions.length,
      ambiguousMasterRetained: !!probe.rawTopicProgress['5'],
    };
  });
  assert.deepEqual(identities, { bare: '5', explicit: 'penal-7', alias: 'constitucional-17', constitutionalFiveCount: 0, ambiguousMasterRetained: true });
  report.checks.push('bare numeric identities stay unresolved; an explicit subject and a known alias resolve correctly');

  const rejectedQuarantineCreation = await page.evaluate(async () => {
    const { getDocs, collection } = await import('/src/testing/replayFirestore.ts');
    const { db } = await import('/src/lib/firebase.ts');
    const input = { flightId: 'provider-rejected-synthetic', date: '2026-10-01', topics: [{ topicId: 'civil-1', subject: 'civil', topicNumber: 1, effectiveMinutes: 30, modality: 'repaso' }] };
    const original = JSON.stringify(input);
    const cacheBefore = localStorage.getItem('wp_quarantined_events:local-backup-replay');
    window.__FAIL_QUARANTINE_WRITE__ = true;
    let accepted;
    try { accepted = await window.__PROVIDER_PROBE__.addQuarantineEventManually(input); }
    finally { window.__FAIL_QUARANTINE_WRITE__ = false; }
    return { accepted, inputUnchanged: original === JSON.stringify(input), visibleCount: window.__PROVIDER_PROBE__.quarantinedEvents.length,
      storedCount: (await getDocs(collection(db, 'users/local-backup-replay/quarantine'))).size,
      cacheUnchanged: cacheBefore === localStorage.getItem('wp_quarantined_events:local-backup-replay') };
  });
  assert.deepEqual(rejectedQuarantineCreation, { accepted: false, inputUnchanged: true, visibleCount: 0, storedCount: 0, cacheUnchanged: true });
  report.checks.push('manual quarantine creation returns false on persistence failure, preserves the original input for retry and does not create a local or stored phantom event');
  const quarantineAdded = await page.evaluate(() => window.__PROVIDER_PROBE__.addQuarantineEventManually({
    flightId: 'provider-quarantine-synthetic', date: '2026-10-01',
    topics: [{ topicId: 'civil-1', subject: 'civil', topicNumber: 1, effectiveMinutes: 30, modality: 'repaso' }],
  }));
  assert.equal(quarantineAdded, true);
  await page.waitForFunction(() => window.__PROVIDER_PROBE__.quarantinedEvents.length === 1);
  const readQuarantine = async () => page.evaluate(async () => {
    const event = window.__PROVIDER_PROBE__.quarantinedEvents[0];
    const { getDoc, doc } = await import('/src/testing/replayFirestore.ts');
    const { db } = await import('/src/lib/firebase.ts');
    return { event, stored: (await getDoc(doc(db, `users/local-backup-replay/quarantine/${event.id}`))).data(), cache: localStorage.getItem('wp_quarantined_events:local-backup-replay') };
  });
  const beforeQuarantineFailure = await readQuarantine();
  const rejectedQuarantine = await page.evaluate(async () => {
    window.__FAIL_QUARANTINE_WRITE__ = true;
    try { await window.__PROVIDER_PROBE__.updateQuarantineTopic(window.__PROVIDER_PROBE__.quarantinedEvents[0].id, 0, { effectiveMinutes: 42, effectiveHours: .7 }); return false; }
    catch (error) { return error.message === 'Synthetic quarantine persistence failure'; }
    finally { window.__FAIL_QUARANTINE_WRITE__ = false; }
  });
  assert.equal(rejectedQuarantine, true);
  assert.deepEqual(await readQuarantine(), beforeQuarantineFailure);
  const invalidQuarantineEdits = await page.evaluate(async () => {
    const probe = window.__PROVIDER_PROBE__, id = probe.quarantinedEvents[0].id;
    const operations = [() => probe.updateQuarantineTopic(id, 99, {}), () => probe.updateQuarantineEvent(id, { userId: 'synthetic-secondary' }), () => probe.updateQuarantineEvent(id, { id: 'another-synthetic-event' })];
    const rejected = [];
    for (const operation of operations) { try { await operation(); rejected.push(false); } catch { rejected.push(true); } }
    return rejected;
  });
  assert.deepEqual(invalidQuarantineEdits, [true, true, true]);
  assert.deepEqual(await readQuarantine(), beforeQuarantineFailure);
  await page.evaluate(() => window.__PROVIDER_PROBE__.updateQuarantineTopic(window.__PROVIDER_PROBE__.quarantinedEvents[0].id, 0, { effectiveMinutes: 42, effectiveHours: .7 }));
  await page.waitForFunction(() => window.__PROVIDER_PROBE__.quarantinedEvents[0].topics[0].effectiveMinutes === 42);
  const afterQuarantineSave = await readQuarantine();
  assert.equal(afterQuarantineSave.event.totalFlightEffectiveMinutes, 42);
  assert.equal(afterQuarantineSave.stored.topics[0].effectiveMinutes, 42);
  assert.equal(JSON.parse(afterQuarantineSave.cache)[0].topics[0].effectiveMinutes, 42);
  report.checks.push('quarantine edits reject persistence failures and invalid identity/ownership without changing memory, cache or stored data; a successful write updates all three');

  const beforeMaintenance = await page.evaluate(() => JSON.stringify(window.__WELLSPREP_REPLAY__.snapshot()));
  const blockedMaintenance = await page.evaluate(async () => {
    const methods = ['migrateMercantilToConstitucional', 'auditAndRestoreTopicIntegrity', 'purgeAllAeroFocusData', 'purgePhantomTema5Cante', 'migratePenalSessionsToConstitucional5', 'deduplicateUserSessions', 'recoverHistoricalUserData', 'cleanTestArtifacts'];
    const results = [];
    for (const method of methods) {
      try { await window.__PROVIDER_PROBE__[method](); results.push(false); }
      catch (error) { results.push(error.message.includes('los datos se conservan')); }
    }
    return results;
  });
  assert.deepEqual(blockedMaintenance, Array(8).fill(true));
  assert.equal(await page.evaluate(() => JSON.stringify(window.__WELLSPREP_REPLAY__.snapshot())), beforeMaintenance);
  report.checks.push('all eight deprecated heuristic maintenance commands reject without changing any stored record');
  await page.evaluate(() => window.__PROVIDER_PROBE__.updateUserSettings({ retention: { initialStabilityDays: 14, initialRecallProbability: .75, reviewThreshold: .65 } }));
  await page.waitForFunction(() => window.__PROVIDER_PROBE__.userSettings?.retention?.initialStabilityDays === 14);
  const configured = await page.evaluate(() => ({ policy: window.__PROVIDER_PROBE__.estimateRetentionForTopic('civil-1').policy,
    cached: window.__PROVIDER_PROBE__.topicState.get('civil-1').retentionEstimate.policy }));
  assert.equal(configured.policy.initialStabilityDays, 14);
  assert.equal(configured.policy.initialRecallProbability, .75);
  assert.equal(configured.policy.reviewThreshold, .65);
  assert.deepEqual(configured.policy, configured.cached);
  report.checks.push('the saved retention policy feeds the global canonical cache and prospective capture consistently');

  await page.evaluate(() => window.__PROVIDER_PROBE__.mergeStudySessions('provider-part-1', ['provider-part-2'], { durationMinutes: 60, completesVuelta: false, type: 'estudio_inicial' }));
  await page.waitForFunction(() => window.__PROVIDER_PROBE__.recentSessions.length === 4);
  const merged = await page.evaluate(() => {
    const probe = window.__PROVIDER_PROBE__;
    const state = probe.topicState.get('civil-1');
    const data = window.__WELLSPREP_REPLAY__.snapshot().sessions;
    return {
      minutes: state.totalInitialStudyMinutes, studied: state.initialStudyCoverage.studiedPages,
      sources: data.find(session => session.id === 'provider-part-1').mergedSessionParts.length,
      tombstone: data.find(session => session.id === 'provider-part-2').mergedIntoSessionId,
      physicalCount: data.length, visibleCount: probe.recentSessions.length,
    };
  });
  assert.deepEqual(merged, { minutes: 60, studied: 6, sources: 2, tombstone: 'provider-part-1', physicalCount: 5, visibleCount: 4 });
  report.checks.push('atomic merge preserves both originals, their page union and minutes, with a stable replay tombstone');
  const beforeFailure = await page.evaluate(() => JSON.stringify(window.__WELLSPREP_REPLAY__.snapshot()));
  const failedMerge = await page.evaluate(async () => {
    try { await window.__PROVIDER_PROBE__.mergeStudySessions('provider-part-1', ['provider-penal-seven'], { durationMinutes: 80, completesVuelta: false, type: 'estudio_inicial' }); return false; }
    catch { return true; }
  });
  assert.equal(failedMerge, true);
  assert.equal(await page.evaluate(() => JSON.stringify(window.__WELLSPREP_REPLAY__.snapshot())), beforeFailure);
  report.checks.push('a cross-topic merge rejects before every write and leaves the full stored snapshot unchanged');

  await page.evaluate(() => window.__PROVIDER_PROBE__.addStudySession({ topicId: 'civil-1', type: 'repaso', durationMinutes: 25, date: '2026-10-02', difficulty: 5, completesVuelta: false }));
  await page.waitForFunction(() => window.__PROVIDER_PROBE__.recentSessions.length === 5);
  const capture = await page.evaluate(() => window.__WELLSPREP_REPLAY__.snapshot().sessions.find(session => session.id.startsWith('replay-generated-')).retentionPrediction);
  assert.equal(capture.captureStage, 'before_persistence');
  assert.ok(Number.isFinite(Date.parse(capture.generatedAt)));
  assert.ok(Date.parse(capture.generatedAt) > Date.parse('2026-10-02T23:59:59Z'));
  report.checks.push('a backdated recorded session retains the real forecast timestamp rather than claiming a historical forecast');

  const retrievalPrediction = await page.evaluate(() => window.__PROVIDER_PROBE__.estimateRetentionForTopic('civil-1'));
  await page.evaluate(prediction => window.__PROVIDER_PROBE__.addStudySession({
    topicId: 'civil-1', type: 'repaso', durationMinutes: 19, date: new Date().toISOString().slice(0, 10), difficulty: 5, completesVuelta: false,
    retentionPrediction: prediction, retrieval: { outcome: 'success', assistance: 'none', coverage: 'whole_topic' },
  }), retrievalPrediction);
  await page.waitForFunction(() => window.__PROVIDER_PROBE__.recentSessions.length === 6);
  const retrievalRecord = await page.evaluate(() => window.__WELLSPREP_REPLAY__.snapshot().sessions.find(session => session.retrieval?.outcome === 'success'));
  assert.equal(retrievalRecord.durationMinutes, 19);
  assert.deepEqual(retrievalRecord.retentionPrediction, retrievalPrediction);
  assert.deepEqual(retrievalRecord.retrieval, { outcome: 'success', assistance: 'none', coverage: 'whole_topic' });
  const downloadPromise = page.waitForEvent('download');
  await page.evaluate(() => window.__PROVIDER_PROBE__.exportData());
  const download = await downloadPromise;
  const exportPath = resolve(directory, 'synthetic-export.json');
  await download.saveAs(exportPath);
  const exported = JSON.parse(await readFile(exportPath, 'utf8'));
  assert.deepEqual(exported.sessions.find(session => session.id === retrievalRecord.id).retentionPrediction, retrievalPrediction);
  assert.deepEqual(exported.sessions.find(session => session.id === retrievalRecord.id).retrieval, retrievalRecord.retrieval);
  report.checks.push('a prospective recall snapshot and its separate observed outcome survive persistence and the actual export command');

  await page.evaluate(id => window.__PROVIDER_PROBE__.updateStudySession(id, {
    durationMinutes: 27, retentionPrediction: { probability: 0 },
    retrieval: { outcome: 'failure', assistance: 'none', coverage: 'whole_topic' },
  }), retrievalRecord.id);
  await page.waitForFunction(id => window.__PROVIDER_PROBE__.recentSessions.find(session => session.id === id)?.durationMinutes === 27, retrievalRecord.id);
  const editedRecord = await page.evaluate(id => window.__WELLSPREP_REPLAY__.snapshot().sessions.find(session => session.id === id), retrievalRecord.id);
  assert.equal(editedRecord.durationMinutes, 27);
  assert.equal(editedRecord.retrieval.outcome, 'failure');
  assert.deepEqual(editedRecord.retentionPrediction, retrievalPrediction);
  const shared = await page.evaluate(async () => {
    const probe = window.__PROVIDER_PROBE__;
    const canonical = probe.topicState.get('civil-1');
    const { calculateCanonicalRetention, getCanonicalReviewDate } = await import('/src/lib/ebbinghaus.ts');
    const { evaluateTopicPreparation } = await import('/src/lib/preparationScore.ts');
    const { buildSubjectTelemetryIndex } = await import('/src/lib/performanceCache.ts');
    const memory = calculateCanonicalRetention(canonical);
    const preparation = evaluateTopicPreparation({ canonicalTopic: canonical, topicNumber: 1, topicTitle: 'Synthetic' });
    const telemetry = buildSubjectTelemetryIndex([probe.topics.find(topic => topic.id === 'civil-1')], probe.userProgress, probe.recentSessions, probe.topicState).get('civil-1');
    return { memory: memory.currentRetention, preparation: preparation.retentionPct, telemetry: telemetry.memory.currentRetention,
      date: getCanonicalReviewDate(canonical), telemetryDate: telemetry.srs.nextDate, projectedDate: probe.userProgress['civil-1'].nextReviewDate ?? null,
      reviewCount: canonical.reviewCount, reviewMinutes: canonical.totalReviewMinutes };
  });
  assert.equal(shared.memory, shared.preparation);
  assert.equal(shared.memory, shared.telemetry);
  assert.equal(shared.date, shared.telemetryDate);
  assert.equal(shared.date, shared.projectedDate);
  assert.equal(shared.reviewCount, 2);
  assert.equal(shared.reviewMinutes, 52);
  report.checks.push('editing real minutes/outcome preserves the original forecast and recalculates the same retention and date in every shared consumer');
  const generatedIds = await page.evaluate(() => window.__PROVIDER_PROBE__.recentSessions.filter(session => session.id.startsWith('replay-generated-')).map(session => session.id));
  for (const id of generatedIds) await page.evaluate(id => window.__PROVIDER_PROBE__.deleteStudySession(id), id);
  await page.waitForFunction(() => window.__PROVIDER_PROBE__.recentSessions.length === 4);
  assert.deepEqual(await page.evaluate(() => {
    const topic = window.__PROVIDER_PROBE__.topicState.get('civil-1');
    return { count: topic.reviewCount, minutes: topic.totalReviewMinutes, initial: topic.initialStudyCoverage.studiedPages };
  }), { count: 0, minutes: 0, initial: 6 });
  report.checks.push('deleting the two recorded reviews recomputes counts/minutes while preserving initial coverage and the archived merge');

  await page.evaluate(async () => {
    const { doc, setDoc } = await import('/src/testing/replayFirestore.ts');
    const { db } = await import('/src/lib/firebase.ts');
    for (const [id, minutes, seconds] of [['synthetic-merge-oral-a', 12, 30], ['synthetic-merge-oral-b', 1, 15]]) {
      await setDoc(doc(db, 'users/local-backup-replay/sessions', id), { topicId: 'civil-1', date: '2026-10-03', type: 'canto', durationMinutes: minutes, cantoSeconds: seconds, completesVuelta: false });
    }
  });
  await page.waitForFunction(() => window.__PROVIDER_PROBE__.recentSessions.length === 6);
  await page.evaluate(() => window.__PROVIDER_PROBE__.mergeStudySessions('synthetic-merge-oral-a', ['synthetic-merge-oral-b'], { durationMinutes: 13.75, completesVuelta: false, type: 'canto' }));
  await page.waitForFunction(() => window.__PROVIDER_PROBE__.recentSessions.length === 5);
  const oralMerge = await page.evaluate(() => window.__WELLSPREP_REPLAY__.snapshot().sessions.find(session => session.id === 'synthetic-merge-oral-a'));
  assert.equal(oralMerge.durationMinutes, 13); assert.equal(oralMerge.cantoSeconds, 45);
  assert.equal(oralMerge.completesVuelta, false); assert.equal(oralMerge.difficulty, undefined);
  await page.evaluate(() => window.__PROVIDER_PROBE__.deleteStudySession('synthetic-merge-oral-a'));
  await page.waitForFunction(() => window.__PROVIDER_PROBE__.recentSessions.length === 4);
  report.checks.push('oral merge preserves 12:30 + 1:15 as 13:45 without inventing a vuelta or difficulty');

  await page.evaluate(() => {
    window.__DELAY_QUARANTINE_WRITE__ = true;
    window.__PENDING_QUARANTINE_EDIT__ = window.__PROVIDER_PROBE__.updateQuarantineTopic(window.__PROVIDER_PROBE__.quarantinedEvents[0].id, 0, { effectiveMinutes: 77, effectiveHours: 77 / 60 });
  });
  await page.waitForFunction(() => typeof window.__RESUME_QUARANTINE_WRITE__ === 'function');
  await page.evaluate(async () => (await import('/src/testing/replayAuth.ts')).switchSyntheticUser('synthetic-secondary'));
  await page.waitForFunction(() => window.__PROVIDER_PROBE__?.user?.uid === 'synthetic-secondary' && window.__PROVIDER_PROBE__.loading === false);
  const secondary = await page.evaluate(() => ({ progress: Object.keys(window.__PROVIDER_PROBE__.rawTopicProgress).length, sessions: window.__PROVIDER_PROBE__.recentSessions.length, settings: window.__PROVIDER_PROBE__.userSettings, quarantine: window.__PROVIDER_PROBE__.quarantinedEvents.length }));
  assert.deepEqual(secondary, { progress: 0, sessions: 0, settings: null, quarantine: 0 });
  await page.evaluate(async () => { window.__DELAY_QUARANTINE_WRITE__ = false; window.__RESUME_QUARANTINE_WRITE__(); await window.__PENDING_QUARANTINE_EDIT__; });
  assert.equal(await page.evaluate(() => window.__PROVIDER_PROBE__.quarantinedEvents.length), 0);
  assert.equal(await page.evaluate(() => localStorage.getItem('wp_quarantined_events:synthetic-secondary')), null);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('wp_quarantined_events:local-backup-replay'))[0].topics[0].effectiveMinutes), 42);
  report.checks.push('a pending quarantine write for the previous account never enters the next account state or cache after changing UID');
  await page.evaluate(async () => (await import('/src/testing/replayAuth.ts')).switchSyntheticUser('local-backup-replay'));
  await page.waitForFunction(() => window.__PROVIDER_PROBE__?.user?.uid === 'local-backup-replay' && window.__PROVIDER_PROBE__.recentSessions.length === 4 && window.__PROVIDER_PROBE__.loading === false);
  report.checks.push('switching UID clears all study/settings/quarantine state and switching back reloads only the original account');
  assert.equal(report.externalRequests, 0);
  assert.deepEqual(pageErrors, []);
  await writeFile(resolve(directory, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
