/** Configuration only: importing this module never initializes Firebase or connects to a service. */
export type FirebaseMode = 'emulator' | 'production';

export const SYNTHETIC_PROJECT_ID = 'demo-wellsprep';
// Public fixture account for the local Auth emulator; these are not production credentials.
export const SYNTHETIC_USER_EMAIL = 'synthetic-student@example.test';
export const SYNTHETIC_USER_PASSWORD = 'synthetic-only-password';

type Environment = Record<string, string | boolean | undefined>;

export interface FirebaseEnvironment {
  mode: FirebaseMode;
  projectId: typeof SYNTHETIC_PROJECT_ID | undefined;
  firestore: { host: string; port: number };
  auth: { host: string; port: number };
}

function emulatorEndpoint(value: unknown, port: number, name: string) {
  const input = value === undefined || value === '' ? `127.0.0.1:${port}` : value;
  if (typeof input !== 'string') throw new Error(`${name} must be a loopback host:port.`);
  const match = /^(127\.0\.0\.1|localhost):(\d+)$/.exec(input);
  if (!match || Number(match[2]) !== port) {
    throw new Error(`${name} must use loopback and port ${port}; remote services are forbidden in emulator mode.`);
  }
  return { host: '127.0.0.1', port };
}

export function resolveFirebaseEnvironment(
  env: Environment = {},
  nodeEnvironment?: string,
): FirebaseEnvironment {
  const mode = env.VITE_FIREBASE_MODE === undefined || env.VITE_FIREBASE_MODE === ''
    ? 'emulator'
    : env.VITE_FIREBASE_MODE;
  if (mode !== 'emulator' && mode !== 'production') {
    throw new Error('VITE_FIREBASE_MODE must be emulator or production.');
  }
  if (mode === 'production' && (nodeEnvironment === 'test' || env.NODE_ENV === 'test' || env.MODE === 'test')) {
    throw new Error('Production Firebase is forbidden during tests.');
  }
  if (mode === 'emulator' && env.VITE_FIREBASE_PROJECT_ID !== undefined && env.VITE_FIREBASE_PROJECT_ID !== SYNTHETIC_PROJECT_ID) {
    throw new Error(`Emulator mode requires project ${SYNTHETIC_PROJECT_ID}.`);
  }
  return {
    mode,
    projectId: mode === 'emulator' ? SYNTHETIC_PROJECT_ID : undefined,
    firestore: emulatorEndpoint(env.VITE_FIRESTORE_EMULATOR_HOST, 8080, 'VITE_FIRESTORE_EMULATOR_HOST'),
    auth: emulatorEndpoint(env.VITE_FIREBASE_AUTH_EMULATOR_HOST, 9099, 'VITE_FIREBASE_AUTH_EMULATOR_HOST'),
  };
}
