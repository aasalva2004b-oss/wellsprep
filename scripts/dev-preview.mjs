import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Hosting previews do not have Java or a managed Firebase server identity.
// Use the existing isolated in-memory SDK; never select a remote fallback.
const root = fileURLToPath(new URL('../', import.meta.url));
const directory = path.join(root, '.cache', 'synthetic-preview');
mkdirSync(directory, { recursive: true });
const fixture = path.join(directory, 'synthetic.json');
writeFileSync(fixture, JSON.stringify({ schemaVersion: 2,
  progress: [{ topicId: 'civil-1', pages: 6, numeroPalabras: 1800, difficulty: 5, historyVersion: 3 }],
  sessions: [{ id: 'preview-initial-1', topicId: 'civil-1', date: '2026-10-01', type: 'estudio_inicial', durationMinutes: 45, startPage: 1, endPage: 3, pagesCount: 3, totalPagesAtSession: 6 }],
  settings: { general: { userId: 'local-backup-replay', activeSubjects: ['civil'], defaultSubject: 'civil', scheduleStr: '' } },
  quarantine: [], timestamp: '2026-10-01T12:00:00Z',
}));
const env = { ...process.env };
for (const key of Object.keys(env)) {
  if (/^(VITE_FIREBASE_|FIREBASE_|FIRESTORE_|GOOGLE_|GCLOUD_|GEMINI_|CLOUDSDK_)/.test(key)) delete env[key];
}
Object.assign(env, { VITE_FIREBASE_MODE: 'emulator', VITE_FIREBASE_PROJECT_ID: 'demo-wellsprep',
  VITE_DEMO_PREVIEW: 'true', WELLSPREP_BACKUP_PATH: fixture, DISABLE_HMR: 'true' });
console.log('Vista previa sintética: sin Java ni Firebase real. Los cambios se pierden al recargar. API externa deshabilitada.');
const child = spawn(process.execPath, ['node_modules/vite/bin/vite.js', ...process.argv.slice(2)], {
  cwd: root, env, stdio: 'inherit',
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
