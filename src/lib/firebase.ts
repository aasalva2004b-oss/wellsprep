import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, connectAuthEmulator, signOut as fbSignOut } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { resolveFirebaseEnvironment, SYNTHETIC_USER_EMAIL, SYNTHETIC_USER_PASSWORD } from './firebaseEnvironment';

const browserEnvironment = (import.meta as ImportMeta & { env?: Record<string, string | boolean | undefined> }).env || {};
const nodeEnvironment = typeof process !== 'undefined' ? process.env.NODE_ENV : undefined;
export const firebaseEnvironment = resolveFirebaseEnvironment(browserEnvironment, nodeEnvironment);
export const firebaseMode = firebaseEnvironment.mode;
export const isFirebaseEmulator = firebaseMode === 'emulator';

export const app = initializeApp(isFirebaseEmulator ? {
  projectId: firebaseEnvironment.projectId,
  apiKey: 'demo-api-key',
  authDomain: 'localhost',
  appId: 'demo-wellsprep-local',
} : firebaseConfig);
export const namedDbId = isFirebaseEmulator ? '(default)' : (firebaseConfig as any).firestoreDatabaseId;
export const db = getFirestore(app, namedDbId);
export const defaultDb = isFirebaseEmulator ? db : getFirestore(app);
export const auth = getAuth(app);

// Attach both emulators before exposing any operation. Connection failure never selects production.
if (isFirebaseEmulator) {
  connectFirestoreEmulator(db, firebaseEnvironment.firestore.host, firebaseEnvironment.firestore.port);
  connectAuthEmulator(auth, `http://${firebaseEnvironment.auth.host}:${firebaseEnvironment.auth.port}`);
}

const provider = new GoogleAuthProvider();

export const signIn = () => isFirebaseEmulator
  ? signInWithEmailAndPassword(auth, SYNTHETIC_USER_EMAIL, SYNTHETIC_USER_PASSWORD)
  : signInWithPopup(auth, provider);
export const signOut = () => fbSignOut(auth);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
