import { createHash } from 'node:crypto';
import type { Firestore, DocumentSnapshot, Transaction } from 'firebase-admin/firestore';
import type { WebhookSyncRecord, WellsprepAnalyticsV2 } from '../src/lib/webhookTypes';
import { processIncomingAeroFocusPayload } from '../src/lib/webhookStorage';

export type OwnedAeroFocusEvent = WebhookSyncRecord & { userId: string };
export type AeroFocusIngestResult = { statusCode: number; responseData: Record<string, any>; createdRecord?: OwnedAeroFocusEvent };
export interface AeroFocusStore {
  listEvents(uid: string): Promise<OwnedAeroFocusEvent[]>;
  getEvent(uid: string, id: string): Promise<OwnedAeroFocusEvent | null>;
  putEvent(uid: string, event: WebhookSyncRecord): Promise<{ event: OwnedAeroFocusEvent; created: boolean }>;
  updateEvent(uid: string, id: string, update: (event: OwnedAeroFocusEvent) => WebhookSyncRecord | null): Promise<OwnedAeroFocusEvent | null>;
  deleteEvent(uid: string, id: string): Promise<boolean>;
  clearEvents(uid: string): Promise<number>;
  getAnalytics(uid: string): Promise<WellsprepAnalyticsV2 | null>;
  setAnalytics(uid: string, value: WellsprepAnalyticsV2): Promise<void>;
  processPayload(uid: string, payload: any, headers?: Record<string, any>): Promise<AeroFocusIngestResult>;
  subscribe(uid: string, next: (events: OwnedAeroFocusEvent[]) => void, error?: (error: Error) => void): () => void;
  registerCredential(uid: string, tokenHash: string): Promise<void>;
  resolveCredential(tokenHash: string): Promise<string | null>;
  consumeQuota(uid: string, bucket: string, limit: number): Promise<boolean>;
}

export class AeroFocusStoreError extends Error {
  constructor(message: string, public statusCode = 400) { super(message); }
}
function owner(uid: string): string {
  if (typeof uid !== 'string' || !uid || uid.includes('/') || uid.length > 128) throw new AeroFocusStoreError('Propietario no válido.');
  return uid;
}
function eventId(id: string): string {
  if (typeof id !== 'string' || !id || id.includes('/') || Buffer.byteLength(id) > 1400) throw new AeroFocusStoreError('Identificador de evento no válido.');
  return id;
}
function tokenDigest(hash: string): string {
  if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)) throw new AeroFocusStoreError('Identificador de credencial no válido.');
  return hash;
}
function clean<T>(value: T): T {
  const result = JSON.parse(JSON.stringify(value));
  if (Buffer.byteLength(JSON.stringify(result)) > 850_000) throw new AeroFocusStoreError('El evento supera el tamaño permitido; envía transmisiones menores.', 413);
  return result;
}
function stable(value: any): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
}
function ingestDigest(value: unknown): string { return createHash('sha256').update(stable(value)).digest('hex'); }
function asEvent(snapshot: DocumentSnapshot, uid: string): OwnedAeroFocusEvent | null {
  if (!snapshot.exists) return null;
  const event = snapshot.data()!;
  // The authenticated partition is authoritative. A historical record without a
  // field is readable, but conflicting ownership is never adopted automatically.
  if (event.userId !== undefined && event.userId !== uid) throw new AeroFocusStoreError('El evento no pertenece a este usuario.', 403);
  return { ...event, id: snapshot.id, userId: uid } as OwnedAeroFocusEvent;
}
function ownedEvent(uid: string, event: WebhookSyncRecord): OwnedAeroFocusEvent {
  owner(uid); eventId(event?.id);
  if ('userId' in event && (event as any).userId !== uid) throw new AeroFocusStoreError('El propietario no puede cambiar.', 403);
  if (!Array.isArray(event.topics)) throw new AeroFocusStoreError('El evento necesita una lista de temas.');
  return clean({ ...event, userId: uid });
}

/** Server-only Firestore store. No global cache, file fallback or production initialization. */
export function createFirestoreAeroFocusStore(db: Firestore): AeroFocusStore {
  const events = (uid: string) => db.collection(`users/${owner(uid)}/quarantine`);
  const analytics = (uid: string) => db.doc(`users/${owner(uid)}/aerofocusAnalytics/latest`);
  const eventRef = (uid: string, id: string) => events(uid).doc(eventId(id));
  const readList = (uid: string, snapshots: DocumentSnapshot[]) => snapshots.map(snapshot => asEvent(snapshot, uid)!)
    .sort((a, b) => String(b.receivedAt || '').localeCompare(String(a.receivedAt || '')) || a.id.localeCompare(b.id));
  const store: AeroFocusStore = {
    async listEvents(uid) { return readList(uid, (await events(uid).get()).docs); },
    async getEvent(uid, id) { return asEvent(await eventRef(uid, id).get(), uid); },
    async putEvent(uid, event) {
      const value = ownedEvent(uid, event), ref = eventRef(uid, value.id);
      return db.runTransaction(async tx => {
        const previous = asEvent(await tx.get(ref), uid);
        if (previous) return { event: previous, created: false };
        tx.create(ref, value); return { event: value, created: true };
      });
    },
    async updateEvent(uid, id, update) {
      const ref = eventRef(uid, id);
      return db.runTransaction(async tx => {
        const previous = asEvent(await tx.get(ref), uid);
        if (!previous) throw new AeroFocusStoreError('Evento no encontrado.', 404);
        const next = update(previous);
        if (next === null) { tx.delete(ref); return null; }
        if (next.id !== id) throw new AeroFocusStoreError('El identificador del evento no puede cambiar.');
        const value = ownedEvent(uid, next); tx.set(ref, value); return value;
      });
    },
    async deleteEvent(uid, id) {
      const ref = eventRef(uid, id);
      return db.runTransaction(async tx => {
        const previous = asEvent(await tx.get(ref), uid);
        if (!previous) return false;
        tx.delete(ref); return true;
      });
    },
    async clearEvents(uid) {
      // Delete only the explicit snapshot of this owner's records. A concurrently
      // received event is preserved rather than swallowed by a global purge.
      const found = (await events(uid).get()).docs;
      let removed = 0;
      for (const chunk of Array.from({ length: Math.ceil(found.length / 200) }, (_, index) => found.slice(index * 200, index * 200 + 200))) {
        removed += await db.runTransaction(async tx => {
          const current = await tx.getAll(...chunk.map(snapshot => snapshot.ref));
          const same = current.filter((snapshot, index) => snapshot.exists && snapshot.updateTime?.isEqual(chunk[index].updateTime!));
          same.forEach(snapshot => { asEvent(snapshot, uid); tx.delete(snapshot.ref); });
          return same.length;
        });
      }
      return removed;
    },
    async getAnalytics(uid) {
      const snapshot = await analytics(uid).get();
      if (!snapshot.exists) return null;
      const value = snapshot.data()!;
      if (value.userId !== uid) throw new AeroFocusStoreError('Snapshot analítico sin propietario verificado.', 403);
      const { userId: _, ...data } = value;
      return data as WellsprepAnalyticsV2;
    },
    async setAnalytics(uid, value) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AeroFocusStoreError('Snapshot analítico no válido.');
      await analytics(uid).set(clean({ ...value, userId: owner(uid) }));
    },
    async processPayload(uid, payload, headers = {}) {
      owner(uid);
      const parsed = processIncomingAeroFocusPayload(payload, headers);
      if (!parsed.createdRecord) return { statusCode: parsed.statusCode, responseData: parsed.responseData };
      const value = ownedEvent(uid, parsed.createdRecord), ref = eventRef(uid, value.id);
      const digest = ingestDigest(value.rawPayload ?? value);
      const result = await db.runTransaction(async tx => {
        const snapshot = await tx.get(ref), previous = asEvent(snapshot, uid);
        if (previous) {
          const oldDigest = snapshot.data()?._ingestDigest ?? ingestDigest(previous.rawPayload ?? previous);
          if (oldDigest !== digest) throw new AeroFocusStoreError('Ese identificador ya contiene otra transmisión. Usa un transactionId nuevo; se conserva el evento anterior.', 409);
          return { event: previous, created: false };
        }
        tx.create(ref, { ...value, _ingestDigest: digest });
        if (value.analytics) tx.set(analytics(uid), clean({ ...value.analytics, userId: uid }));
        return { event: value, created: true };
      });
      return { ...parsed, responseData: { ...parsed.responseData, duplicate: !result.created, eventId: value.id },
        ...(result.created ? { createdRecord: result.event } : { createdRecord: undefined }) };
    },
    subscribe(uid, next, error) {
      return events(uid).onSnapshot(snapshot => {
        try { next(readList(uid, snapshot.docs)); } catch (failure) { error?.(failure as Error); }
      }, failure => error?.(failure));
    },
    async registerCredential(uid, hash) {
      owner(uid); tokenDigest(hash);
      const byUser = db.doc(`_aerofocusCredentialsByUser/${uid}`), byHash = db.doc(`_aerofocusCredentials/${hash}`);
      await db.runTransaction(async tx => {
        const [userSnapshot, hashSnapshot] = await Promise.all([tx.get(byUser), tx.get(byHash)]);
        if (hashSnapshot.exists && hashSnapshot.data()?.userId !== uid) throw new AeroFocusStoreError('Credencial ya asignada.', 409);
        const oldHash = userSnapshot.data()?.tokenHash;
        let oldSnapshot: DocumentSnapshot | undefined;
        if (typeof oldHash === 'string' && oldHash !== hash) oldSnapshot = await tx.get(db.doc(`_aerofocusCredentials/${tokenDigest(oldHash)}`));
        if (oldSnapshot?.exists && oldSnapshot.data()?.userId === uid) tx.delete(oldSnapshot.ref);
        tx.set(byUser, { userId: uid, tokenHash: hash });
        tx.set(byHash, { userId: uid });
      });
    },
    async resolveCredential(hash) {
      tokenDigest(hash);
      const snapshot = await db.doc(`_aerofocusCredentials/${hash}`).get();
      const uid = snapshot.data()?.userId;
      if (typeof uid !== 'string') return null;
      const active = await db.doc(`_aerofocusCredentialsByUser/${owner(uid)}`).get();
      return active.data()?.tokenHash === hash ? uid : null;
    },
    async consumeQuota(uid, bucket, limit) {
      owner(uid);
      if (!/^[a-z_-]+$/.test(bucket) || !Number.isInteger(limit) || limit < 1) throw new AeroFocusStoreError('Cuota no válida.');
      const ref = db.doc(`_serverQuotas/${uid}/days/${new Date().toISOString().slice(0,10)}-${bucket}`);
      return db.runTransaction(async tx => {
        const previous = await tx.get(ref), used = Number(previous.data()?.used || 0);
        if (used >= limit) return false;
        tx.set(ref, { used: used + 1 }); return true;
      });
    },
  };
  return store;
}
