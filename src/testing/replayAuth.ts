/** Local replay identity only; never delegates to Firebase Auth or Google. */
export type User = any;
const user = { uid: 'local-backup-replay', displayName: 'Copia local de prueba', email: 'backup-replay@example.test', getIdToken: async () => 'synthetic-replay-only-not-a-firebase-token' };
const auth = { currentUser: user };
const listeners = new Set<(user: User | null) => void>();
export function getAuth(app: any) {
  if (app?.options?.projectId !== 'demo-wellsprep') throw new Error('Replay Auth refuses a real Firebase project.');
  return auth;
}
export function connectAuthEmulator(instance: any, url: string) {
  if (instance !== auth || url !== 'http://127.0.0.1:9099') throw new Error('Replay Auth refuses a remote destination.');
}
export function onAuthStateChanged(instance: any, next: (user: User | null) => void) {
  if (instance !== auth) throw new Error('Replay Auth requires its local instance.');
  listeners.add(next);
  queueMicrotask(() => { if (listeners.has(next)) next(auth.currentUser); });
  return () => listeners.delete(next);
}
export class GoogleAuthProvider {}
export async function signInWithPopup() { throw new Error('Google sign-in is disabled in local replay.'); }
export async function signInWithEmailAndPassword(instance: any, email: string, password: string) {
  if (instance !== auth || email !== 'synthetic-student@example.test' || password !== 'synthetic-only-password') throw new Error('Replay Auth accepts only the public local test account.');
  auth.currentUser = user;
  listeners.forEach(listener => listener(user));
  return { user };
}
export async function signOut(instance: any) {
  if (instance !== auth) throw new Error('Replay Auth requires its local instance.');
  auth.currentUser = null;
  listeners.forEach(listener => listener(null));
}
