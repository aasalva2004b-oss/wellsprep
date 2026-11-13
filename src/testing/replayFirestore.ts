/** Development-only SDK replay. This is an in-memory transport, NOT Firebase Emulator. */
type Reference = { kind: 'document' | 'collection' | 'query'; path: string; id: string; filters?: any[] };
type ReplayState = {
  ready: boolean;
  mutations: Array<{ operation: string; collection: string }>;
  counts: () => { progress: number; sessions: number };
  snapshot: () => { progress: any[]; sessions: any[]; settings: Record<string, any> };
};
declare global { interface Window { __WELLSPREP_REPLAY__?: ReplayState } }

const uid = 'local-backup-replay';
const prefix = `users/${uid}/`;
const records = new Map<string, any>();
const subscribers = new Set<{ ref: Reference; next: (snapshot: any) => void; error?: (error: unknown) => void }>();
const deletion = Symbol('replay-delete-field');
let generated = 0;
const mutations: ReplayState['mutations'] = [];

export class Timestamp {
  constructor(public seconds: number, public nanoseconds: number) {}
  static now() { return Timestamp.fromMillis(Date.now()); }
  static fromMillis(ms: number) { return new Timestamp(Math.floor(ms / 1000), Math.round((ms % 1000) * 1e6)); }
  static fromDate(date: Date) { return Timestamp.fromMillis(date.getTime()); }
  toMillis() { return this.seconds * 1000 + this.nanoseconds / 1e6; }
  toDate() { return new Date(this.toMillis()); }
  toJSON() { return { seconds: this.seconds, nanoseconds: this.nanoseconds, type: 'firestore/timestamp/1.0' }; }
}

function copy(value: any): any {
  if (value === deletion) return deletion;
  if (value instanceof Date) return new Date(value);
  if (Array.isArray(value)) return value.map(copy);
  if (value && typeof value === 'object') {
    if (typeof value.seconds === 'number' && typeof value.nanoseconds === 'number' && Object.keys(value).every(k => ['seconds', 'nanoseconds', 'type'].includes(k))) {
      return new Timestamp(value.seconds, value.nanoseconds);
    }
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)]));
  }
  return value;
}

function checkPath(path: string) {
  if (path !== `users/${uid}` && !path.startsWith(prefix)) throw new Error('Replay SDK refuses a path outside its isolated local user.');
}
function reference(kind: Reference['kind'], path: string): Reference {
  path = path.replace(/^\/+|\/+$/g, '');
  checkPath(path);
  return { kind, path, id: path.split('/').at(-1)! };
}
export function getFirestore(app: any, databaseId = '(default)') {
  if (app?.options?.projectId !== 'demo-wellsprep' || databaseId !== '(default)') throw new Error('Replay SDK requires the demo project and default local database.');
  return { replay: true, app, databaseId };
}
export function connectFirestoreEmulator(db: any, host: string, port: number) {
  if (!db?.replay || host !== '127.0.0.1' || port !== 8080) throw new Error('Replay SDK refuses non-local Firebase configuration.');
}
export function collection(parent: any, ...parts: string[]): Reference {
  if (!parent?.replay && !parent?.path) throw new Error('Replay collection requires a local database/reference.');
  return reference('collection', [parent.path, ...parts].filter(Boolean).join('/'));
}
export function doc(parent: any, ...parts: string[]): Reference {
  if (!parent?.replay && !parent?.path) throw new Error('Replay document requires a local database/reference.');
  if (parent.kind === 'collection' && parts.length === 0) parts = [`replay-generated-${++generated}`];
  return reference('document', [parent.path, ...parts].filter(Boolean).join('/'));
}
export function where(field: string, operator: string, value: unknown) {
  if (!['==', 'in'].includes(operator)) throw new Error(`Replay query operator is not implemented: ${operator}`);
  return { field, operator, value };
}
export function query(ref: Reference, ...filters: any[]): Reference {
  return { ...ref, kind: 'query', filters };
}

function documentSnapshot(ref: Reference) {
  return { id: ref.id, ref, exists: () => records.has(ref.path), data: () => copy(records.get(ref.path)) };
}
function querySnapshot(ref: Reference) {
  const pathPrefix = `${ref.path}/`;
  const docs = [...records.keys()].filter(path => path.startsWith(pathPrefix) && !path.slice(pathPrefix.length).includes('/'))
    .filter(path => (ref.filters || []).every(filter => {
      const value = records.get(path)?.[filter.field];
      return filter.operator === '==' ? value === filter.value : filter.value.includes(value);
    }))
    .sort().map(path => documentSnapshot(reference('document', path)));
  return { docs, size: docs.length, empty: docs.length === 0, forEach: (fn: any) => docs.forEach(fn) };
}
function snapshot(ref: Reference) { return ref.kind === 'document' ? documentSnapshot(ref) : querySnapshot(ref); }
function emit() {
  queueMicrotask(() => subscribers.forEach(listener => {
    try { listener.next(snapshot(listener.ref)); } catch (error) { if (listener.error) listener.error(error); else throw error; }
  }));
}

const ready = fetch('/__test__/backup.json', { cache: 'no-store' }).then(async response => {
  if (!response.ok) throw new Error('Local backup replay input is unavailable.');
  const backup = await response.json();
  if (!Array.isArray(backup.progress) || !Array.isArray(backup.sessions)) throw new Error('Replay requires a WellsPrep backup.');
  for (const item of backup.progress) {
    if (!item.topicId || records.has(`${prefix}progress/${item.topicId}`)) throw new Error('Replay progress identity is missing or duplicated.');
    records.set(`${prefix}progress/${item.topicId}`, copy(item));
  }
  for (const item of backup.sessions) {
    if (!item.id || records.has(`${prefix}sessions/${item.id}`)) throw new Error('Replay session identity is missing or duplicated.');
    records.set(`${prefix}sessions/${item.id}`, copy(item));
  }
  if (backup.settings && typeof backup.settings === 'object') {
    for (const [key, data] of Object.entries(backup.settings)) records.set(`${prefix}settings/${key}`, copy(data));
  }
  window.__WELLSPREP_REPLAY__!.ready = true;
});

window.__WELLSPREP_REPLAY__ = {
  ready: false, mutations,
  counts: () => ({ progress: querySnapshot(reference('collection', `${prefix}progress`)).size, sessions: querySnapshot(reference('collection', `${prefix}sessions`)).size }),
  snapshot: () => ({
    progress: querySnapshot(reference('collection', `${prefix}progress`)).docs.map(s => ({ ...s.data(), topicId: s.id })),
    sessions: querySnapshot(reference('collection', `${prefix}sessions`)).docs.map(s => ({ ...s.data(), id: s.id })),
    settings: Object.fromEntries(querySnapshot(reference('collection', `${prefix}settings`)).docs.map(s => [s.id, s.data()])),
  }),
};

export async function getDoc(ref: Reference) { await ready; return documentSnapshot(ref); }
export const getDocFromServer = getDoc;
export async function getDocs(ref: Reference) { await ready; return querySnapshot(ref); }
export function onSnapshot(ref: Reference, next: any, error?: any) {
  let active = true;
  const listener = { ref, next, error };
  subscribers.add(listener);
  ready.then(() => { if (active) next(snapshot(ref)); }).catch(failure => { if (active && error) error(failure); });
  return () => { active = false; subscribers.delete(listener); };
}
function setPath(target: any, field: string, value: any) {
  const parts = field.split('.');
  let parent = target;
  for (const segment of parts.slice(0, -1)) parent = parent[segment] ||= {};
  if (value === deletion) delete parent[parts.at(-1)!]; else parent[parts.at(-1)!] = copy(value);
}
function write(ref: Reference, data: any, options?: any) {
  checkPath(ref.path);
  const target = options?.merge ? copy(records.get(ref.path) || {}) : {};
  for (const [field, value] of Object.entries(data)) setPath(target, field, value);
  records.set(ref.path, target);
  mutations.push({ operation: 'set', collection: ref.path.split('/')[2] || 'user' });
}
export async function setDoc(ref: Reference, data: any, options?: any) { await ready; write(ref, data, options); emit(); }
export async function updateDoc(ref: Reference, data: any) {
  await ready;
  if (!records.has(ref.path)) throw new Error('Replay update requires an existing document.');
  write(ref, data, { merge: true }); emit();
}
export async function deleteDoc(ref: Reference) { await ready; checkPath(ref.path); records.delete(ref.path); mutations.push({ operation: 'delete', collection: ref.path.split('/')[2] || 'user' }); emit(); }
export function writeBatch(db: any) {
  if (!db?.replay) throw new Error('Replay batch requires the local database.');
  const operations: Array<() => void> = [];
  const batch = {
    set(ref: Reference, data: any, options?: any) { operations.push(() => write(ref, data, options)); return batch; },
    update(ref: Reference, data: any) { operations.push(() => write(ref, data, { merge: true })); return batch; },
    delete(ref: Reference) { operations.push(() => { checkPath(ref.path); records.delete(ref.path); mutations.push({ operation: 'delete', collection: ref.path.split('/')[2] || 'user' }); }); return batch; },
    async commit() { await ready; operations.forEach(operation => operation()); emit(); },
  };
  return batch;
}
export function serverTimestamp() { return Timestamp.now(); }
export function deleteField() { return deletion; }

// Serialised in-memory transactions are a replay feature, not a Firestore durability test.
let transactionQueue: Promise<unknown> = Promise.resolve();
export async function runTransaction<T>(db: any, callback: (transaction: any) => Promise<T>): Promise<T> {
  const run = async () => {
    await ready;
    const batch = writeBatch(db);
    const transaction = {
      get: getDoc,
      set: batch.set.bind(batch),
      update: batch.update.bind(batch),
      delete: batch.delete.bind(batch),
    };
    const result = await callback(transaction);
    await batch.commit();
    return result;
  };
  const pending = transactionQueue.then(run, run);
  transactionQueue = pending.then(() => undefined, () => undefined);
  return pending;
}
