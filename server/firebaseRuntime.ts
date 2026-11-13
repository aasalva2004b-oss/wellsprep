import { initializeApp, applicationDefault, deleteApp, type Credential } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import clientConfiguration from '../firebase-applet-config.json';

export function validateServerEnvironment(env: NodeJS.ProcessEnv) {
  const mode = env.FIREBASE_SERVER_MODE || 'emulator';
  if (!['emulator', 'production'].includes(mode)) throw new Error('Invalid FIREBASE_SERVER_MODE.');
  if (mode === 'emulator') {
    if ((env.FIREBASE_PROJECT_ID || 'demo-wellsprep') !== 'demo-wellsprep'
      || env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080'
      || env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099') throw new Error('Server requires explicit local demo emulators.');
    return { mode, projectId: 'demo-wellsprep', databaseId: '(default)' };
  }
  if (env.NODE_ENV === 'test' || env.FIREBASE_ALLOW_REMOTE !== 'true'
    || !env.FIREBASE_PROJECT_ID || env.FIREBASE_PROJECT_ID.startsWith('demo-')
    || env.FIRESTORE_EMULATOR_HOST || env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('Remote server requires an explicit project and opt-in, outside tests.');
  return { mode, projectId: env.FIREBASE_PROJECT_ID, databaseId: env.FIREBASE_DATABASE_ID || '(default)' };
}

export function createServerFirebase(env: NodeJS.ProcessEnv = process.env) {
  const config = validateServerEnvironment(env);
  if (config.mode === 'production' && (config.projectId !== clientConfiguration.projectId
    || config.databaseId !== ((clientConfiguration as any).firestoreDatabaseId || '(default)'))) {
    throw new Error('Server and browser Firebase project/database must match before startup.');
  }
  const credential: Credential = config.mode === 'emulator'
    ? { getAccessToken: async () => ({ access_token: 'owner', expires_in: 3600 }) }
    : applicationDefault();
  const app = initializeApp({ projectId: config.projectId, credential }, `wellsprep-server-${randomUUID()}`);
  const db = config.mode === 'emulator'
    ? new Firestore({ projectId: config.projectId, databaseId: config.databaseId, host: '127.0.0.1:8080', ssl: false })
    : getFirestore(app, config.databaseId);
  return { auth: getAuth(app), db, close: async () => { await db.terminate(); await deleteApp(app); }, config };
}
