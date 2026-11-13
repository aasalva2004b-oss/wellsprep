import { randomUUID } from 'node:crypto';
import { createConnection } from 'node:net';
import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  connectAuthEmulator,
  initializeAuth,
  inMemoryPersistence,
  type Auth,
} from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  type Firestore,
} from 'firebase/firestore';

export const EMULATOR_PROJECT_ID = 'demo-wellsprep';

/** Refuse all I/O unless both SDKs are explicitly bound to the local demo. */
export function assertEmulatorEnvironment(env: NodeJS.ProcessEnv = process.env): void {
  const required = {
    GCLOUD_PROJECT: EMULATOR_PROJECT_ID,
    FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
    FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
  };
  for (const [name, expected] of Object.entries(required)) {
    if (env[name] !== expected) {
      throw new Error(`Refusing Firebase I/O: ${name} must equal ${expected}.`);
    }
  }
  for (const name of ['GOOGLE_CLOUD_PROJECT', 'FIREBASE_PROJECT_ID']) {
    if (env[name] && env[name] !== EMULATOR_PROJECT_ID) {
      throw new Error(`Refusing Firebase I/O: conflicting ${name}.`);
    }
  }
}

export async function requireLocalEmulators(): Promise<void> {
  assertEmulatorEnvironment();
  await Promise.all([8080, 9099].map(port => new Promise<void>((resolve, reject) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    socket.setTimeout(1500);
    socket.once('connect', () => { socket.destroy(); resolve(); });
    socket.once('error', () => { socket.destroy(); reject(new Error(`Local emulator is unavailable on 127.0.0.1:${port}.`)); });
    socket.once('timeout', () => { socket.destroy(); reject(new Error(`Local emulator timed out on 127.0.0.1:${port}.`)); });
  })));
}

export interface EmulatorClient {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
}

export function createEmulatorClient(label: string): EmulatorClient {
  assertEmulatorEnvironment();
  // Deliberately invalid for real Firebase. No application configuration or secret.
  const app = initializeApp(
    { projectId: EMULATOR_PROJECT_ID, apiKey: 'demo-emulator-only-key' },
    `synthetic-${label}-${randomUUID()}`,
  );
  const auth = initializeAuth(app, { persistence: inMemoryPersistence });
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = initializeFirestore(app, {});
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  return { app, auth, db };
}
