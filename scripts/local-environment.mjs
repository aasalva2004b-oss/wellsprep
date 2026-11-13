import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const mode = process.argv[2];
if (!['test', 'auth-test', 'dev', 'emulators'].includes(mode)) {
  throw new Error('Usage: node scripts/local-environment.mjs test|auth-test|dev|emulators');
}
// Never consult a real project alias or inherit administrator/CLI credentials.
const env = { ...process.env };
for (const name of Object.keys(env)) {
  if (/^(GOOGLE_APPLICATION_CREDENTIALS|GOOGLE_OAUTH_ACCESS_TOKEN|FIREBASE_TOKEN|FIREBASE_CONFIG|CLOUDSDK_AUTH_ACCESS_TOKEN|GOOGLE_CLOUD_QUOTA_PROJECT|VITE_FIREBASE_.*)$/.test(name)) delete env[name];
}
Object.assign(env, {
  GCLOUD_PROJECT: 'demo-wellsprep',
  GOOGLE_CLOUD_PROJECT: 'demo-wellsprep',
  FIREBASE_PROJECT_ID: 'demo-wellsprep',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
  VITE_FIREBASE_MODE: 'emulator',
  VITE_FIREBASE_PROJECT_ID: 'demo-wellsprep',
  FIREBASE_SERVER_MODE: 'emulator',
  FIREBASE_DATABASE_ID: '(default)',
  FIREBASE_ALLOW_REMOTE: 'false',
  FIREBASE_CLI_DISABLE_MOTD: '1',
  NO_GCE_CHECK: 'true',
  CI: 'true',
  XDG_CONFIG_HOME: path.join(root, '.cache/firebase/config'),
  FIREBASE_EMULATORS_PATH: path.join(root, '.cache/firebase/emulators'),
});
mkdirSync(env.XDG_CONFIG_HOME, { recursive: true });
const args = [
  path.join(root, 'node_modules/firebase-tools/lib/bin/firebase.js'),
  mode === 'emulators' ? 'emulators:start' : 'emulators:exec',
  '--config', 'firebase.local.json', '--project', 'demo-wellsprep',
  '--only', mode === 'auth-test' ? 'auth' : 'auth,firestore', '--non-interactive',
];
if (mode !== 'emulators') args.push(`node scripts/${mode === 'test' ? 'run-local-checks' : mode === 'auth-test' ? 'run-auth-checks' : 'dev-local'}.mjs`);
const child = spawn(process.execPath, args, { cwd: root, env, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', (error) => { console.error(error); process.exitCode = 1; });
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
