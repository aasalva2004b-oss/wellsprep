import { useLocalDay } from '../hooks/useLocalDay';
import { getLocalDateString, safeParseDate } from './utils';
import { playSound } from './sound';
import { authenticatedFetch } from './authenticatedApi';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
  ReactNode,
} from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import {
  serverTimestamp,
  collection,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  query,
  where,
  getDocs,
  writeBatch,
  Timestamp,
  runTransaction,
} from "firebase/firestore";
import { auth, db, defaultDb, handleFirestoreError, OperationType, isFirebaseEmulator } from "./firebase";
import { toast } from "sonner";
import { calculateNextSRSState } from "./srs";
import Papa from "papaparse";
import { Topic } from "../types";
import { TopicProgressData } from "./prediction";
import { WebhookSyncRecord, WebhookResolvedTopic } from "./webhookTypes";
import { isCantoSession, getCantoDuration, sessionMatchesTopic } from "./cantoUtils";
import { resolveAeroFocusTopic, extractMinutesFromAeroItem, extractTopicNumber, normalizeCategoryToSubjectId } from "./topicResolver";
import { parseAeroFocusInput } from "./aeroFocusParser";
import { initialTopics } from "../data/initialData";
import { parseBackup, rehydrateBackupTimestamps } from './backup';
import { extractSessionTelemetry } from './sessionTelemetry';
import { buildTopicData, type TopicDataSnapshot } from './topicData';
import { normalizeSessionRecord, stableSessionId } from './sessionCommands';
import { estimatePersonalizedDuration, type EstimatedActivity, type EstimationWork } from './personalizedEstimator';
import { capturePrediction } from './predictionSnapshot';
import type { PredictionSnapshot } from './observedSession';
import { getSessionCategory, sessionDurationMinutes } from './canonicalTopicService';
import { deriveInitialStudyCoverage } from './topicCoverage';
import { captureRetentionPrediction, estimateRetention, type RetentionConfig } from './retentionModel';

/** Missing subject evidence stays unresolved; a bare number never implies Constitucional. */
function resolveStoredTopicId(value: unknown, subject?: unknown): string {
  const id = String(value ?? '').trim();
  const alias = id.toLowerCase().match(/^const[-_](\d+)$/);
  if (alias) return `constitucional-${Number(alias[1])}`;
  const numeric = id.toLowerCase().match(/^(?:(?:tema|t)[-_ ]*)?(\d+)$/);
  const subjectId = typeof subject === 'string' ? normalizeCategoryToSubjectId(subject) : null;
  return numeric && subjectId ? `${subjectId}-${Number(numeric[1])}` : id;
}

async function rejectHeuristicMaintenance(): Promise<never> {
  throw new Error('Mantenimiento heurístico no disponible; los datos se conservan.');
}

export function cleanForFirestore<T>(data: T): T {
  if (data === null || data === undefined) {
    return data;
  }

  // Handle Arrays: recursively clean each element and discard undefined items
  if (Array.isArray(data)) {
    return data
      .filter((item) => item !== undefined)
      .map((item) => cleanForFirestore(item)) as unknown as T;
  }

  // Handle non-objects or primitives
  if (typeof data !== "object") {
    if (typeof data === "number" && (isNaN(data) || !isFinite(data))) {
      return 0 as unknown as T;
    }
    return data;
  }

  // Preserve Dates
  if (data instanceof Date) {
    return data;
  }

  // Preserve special Firestore types (FieldValue, serverTimestamp, deleteField, GeoPoint, etc.)
  const isPlainObject =
    Object.prototype.toString.call(data) === "[object Object]" &&
    (data.constructor === Object || !data.constructor);

  if (!isPlainObject) {
    return data;
  }

  const cleanObj: Record<string, any> = {};
  for (const [key, value] of Object.entries(data as Record<string, any>)) {
    if (value === undefined) {
      continue;
    }
    if (typeof value === "number") {
      if (isNaN(value) || !isFinite(value)) {
        continue;
      }
      cleanObj[key] = value;
      continue;
    }
    const cleanedVal = cleanForFirestore(value);
    if (cleanedVal !== undefined) {
      cleanObj[key] = cleanedVal;
    }
  }
  return cleanObj as T;
}

export interface UserSettingsData {
  userId: string;
  scheduleStr: string;
  targetDate?: string;
  importedCsv?: string;
  activeSubjects?: string[];
  defaultSubject?: string;
  webhookToken?: string;
  retention?: Partial<RetentionConfig>;
  updatedAt?: string;
}

interface FirebaseContextType {
  user: User | null;
  loading: boolean;
  userProgress: Record<string, TopicProgressData>;
  rawTopicProgress: Record<string, TopicProgressData>;
  topics: Topic[];
  topicState: TopicDataSnapshot['topicState'];
  estimateDuration: (topicId: string, activity: EstimatedActivity, work?: EstimationWork) => PredictionSnapshot;
  estimateRetentionForTopic: (topicId: string) => Record<string, any>;
  recentSessions: any[];
  userSettings: UserSettingsData | null;
  webhookToken: string;
  isSyncingWebhooks: boolean;
  aerofocusBetaEnabled: boolean;
  setAerofocusBetaEnabled: (enabled: boolean) => void;
  generateWebhookToken: () => Promise<string>;
  syncPendingWebhookEvents: (force?: boolean) => Promise<number>;
  updateTopicProgress: (
    topicId: string,
    data: Partial<TopicProgressData>,
  ) => Promise<void>;
  updateUserSettings: (data: Partial<UserSettingsData>) => Promise<void>;
  resetProgress: () => Promise<void>;
  addStudySession: ((
    topicId: string,
    durationMinutes: number,
    difficulty: number,
    type: "estudio_inicial" | "repaso" | "refresco" | "canto" | "simulacro",
    date?: string,
    extraData?: any
  ) => Promise<void>) & ((
    sessionData: {
      topicId: string;
      durationMinutes?: number;
      difficulty?: number;
      type?: "estudio_inicial" | "repaso" | "refresco" | "canto" | "simulacro";
      date?: string;
      completesVuelta?: boolean;
      notes?: string;
      cantoGrade?: number;
      cantoSeconds?: number;
      mistakes?: string;
      [key: string]: any;
    }
  ) => Promise<void>);
  updateStudySession: (
    sessionId: string,
    updatedData: Partial<any>,
    previousSession: any
  ) => Promise<void>;
  deleteStudySession: (arg1: string, arg2?: string) => Promise<void>;
  quickUpdateSessionDifficulty: (
    sessionId: string,
    difficulty: number,
    topicId: string
  ) => Promise<void>;
  mergeStudySessions: (
    targetSessionId: string,
    sourceSessionIds: string[],
    mergedData: {
      durationMinutes: number;
      difficulty?: number;
      completesVuelta: boolean;
      type?: string;
      notes?: string;
      mistakes?: string;
    }
  ) => Promise<void>;
  reconcileAllTopicsAndSessions: () => Promise<{
    updatedTopicsCount: number;
    totalSessionsCount: number;
  }>;
  importProgress: (csvText: string) => Promise<{ success: number, errors: string[] }>;
  exportData: () => Promise<void>;
  importData: (jsonText: string) => Promise<boolean>;
  migrateMercantilToConstitucional: () => Promise<void>;
  auditAndRestoreTopicIntegrity: () => Promise<{ restoredCount: number }>;
  purgeAllAeroFocusData: () => Promise<void>;
  purgePhantomTema5Cante: () => Promise<void>;
  migratePenalSessionsToConstitucional5: (silent?: boolean) => Promise<{ migratedCount: number }>;
  deduplicateUserSessions: (silent?: boolean) => Promise<{ deletedCount: number; affectedTopics: string[] }>;
  recoverHistoricalUserData: (silent?: boolean) => Promise<any>;
  quarantinedEvents: WebhookSyncRecord[];
  isLoadingQuarantine: boolean;
  fetchQuarantinedEvents: () => Promise<WebhookSyncRecord[]>;
  approveQuarantineEvent: (eventId: string) => Promise<boolean>;
  approveAllQuarantineEvents: () => Promise<{ approvedCount: number }>;
  discardQuarantineEvent: (eventId: string) => Promise<boolean>;
  clearAllQuarantine: () => Promise<boolean>;
  addQuarantineEventManually: (rawPayload: any) => Promise<boolean>;
  updateQuarantineEvent: (eventId: string, updatedRecord: Partial<WebhookSyncRecord>) => Promise<void>;
  updateQuarantineTopic: (eventId: string, topicIndex: number, updatedFields: Partial<WebhookResolvedTopic>) => Promise<void>;
  deleteQuarantineTopic: (eventId: string, topicIndex: number) => Promise<boolean>;
  addQuarantineTopic: (eventId: string, topicToAdd?: Partial<WebhookResolvedTopic>) => Promise<boolean>;
  mergeQuarantineTopics: (eventId: string, indexA: number, indexB: number) => Promise<void>;
  cleanTestArtifacts: () => Promise<number>;
}

const FirebaseContext = createContext<FirebaseContextType | undefined>(
  undefined,
);

export function FirebaseProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [rawTopicProgress, setUserProgress] = useState<
    Record<string, TopicProgressData>
  >({});
  const [recentSessions, setRecentSessions] = useState<any[]>([]);
  const [userSettings, setUserSettings] = useState<UserSettingsData | null>(null);
  const localDay = useLocalDay();
  // Write paths see stored metadata; all UI reads receive the single derived domain snapshot.
  const userProgress = rawTopicProgress;
  const topicData = useMemo(() => buildTopicData(initialTopics, rawTopicProgress, recentSessions, userSettings?.retention), [rawTopicProgress, recentSessions, userSettings?.retention, localDay]);
  const estimateDuration = (topicId: string, activity: EstimatedActivity, work?: EstimationWork) => {
    const topic = topicData.topicState.get(topicId);
    if (!topic) throw new Error('El tema no está definido en la fuente de datos compartida.');
    const asOf = new Date();
    const estimate = estimatePersonalizedDuration({ topic, activity, work, history: recentSessions, topics: topicData.topicState, asOf });
    return capturePrediction(estimate, topic, activity, asOf, work);
  };
  const estimateRetentionForTopic = (topicId: string) => {
    const topic = topicData.topicState.get(topicId);
    if (!topic) throw new Error('El tema no está definido en la fuente de datos compartida.');
    const asOf = new Date();
    const estimate = topic.retentionEstimate?.generatedAt.slice(0, 10) === asOf.toISOString().slice(0, 10)
      ? topic.retentionEstimate : estimateRetention({ topic, history: recentSessions, topics: topicData.topicState, asOf, config: userSettings?.retention });
    return captureRetentionPrediction(estimate);
  };
  const [isSyncingWebhooks, setIsSyncingWebhooks] = useState(false);
  const inFlightSessionLocks = useRef<Set<string>>(new Set());
  const deletedSessionIds = useRef<Set<string>>(new Set());
  const activeUserId = useRef<string | null>(null);
  const [aerofocusBetaEnabled, setAerofocusBetaEnabledState] = useState<boolean>(() => {
    return localStorage.getItem("aerofocus_beta_enabled") !== "false";
  });

  const setAerofocusBetaEnabled = (enabled: boolean) => {
    setAerofocusBetaEnabledState(enabled);
    localStorage.setItem("aerofocus_beta_enabled", enabled ? "true" : "false");
    if (!enabled) {
      toast.info("AeroFocus puesto en Cuarentena (desactivado por defecto)");
    } else {
      toast.warning("Modo Beta de AeroFocus activado");
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      const nextUserId = u?.uid ?? null;
      if (activeUserId.current !== nextUserId) {
        activeUserId.current = nextUserId;
        setUserProgress({});
        setRecentSessions([]);
        setUserSettings(null);
        setQuarantinedEvents([]);
        setIsLoadingQuarantine(false);
        setIsSyncingWebhooks(false);
        inFlightSessionLocks.current.clear();
        deletedSessionIds.current.clear();
        setLoading(!!u);
      }
      if (!u) setLoading(false);
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const ownerId = user.uid;
    let active = true;
    let progressLoaded = false;
    let sessionsLoaded = false;
    const isCurrentUser = () => active && activeUserId.current === ownerId;
    const finishLoading = () => {
      if (isCurrentUser() && progressLoaded && sessionsLoaded) setLoading(false);
    };

    // Database-scoped real-time maps to cleanly handle deletions across namedDb and defaultDb
    const dbSessions: {
      namedDb: Map<string, any>;
      defaultDb: Map<string, any>;
    } = {
      namedDb: new Map(),
      defaultDb: new Map(),
    };

    const dbProgress: {
      namedDb: Map<string, TopicProgressData>;
      defaultDb: Map<string, TopicProgressData>;
    } = {
      namedDb: new Map(),
      defaultDb: new Map(),
    };

    const normalizeSession = (id: string, data: any, originDb: string) => {
      return {
        ...data,
        id,
        topicId: resolveStoredTopicId(data.topicId, data.subjectId),
        originalTopicId: data.originalTopicId ?? data.topicId,
        originDb,
      };
    };

    const handleSessionsSnapshot = (snapshot: any, originDb: "namedDb" | "defaultDb") => {
      if (!isCurrentUser()) return;
      const currentMap = new Map<string, any>();

      snapshot.forEach((docSnap: any) => {
        // If explicitly deleted by user, purge and do not process
        if (deletedSessionIds.current.has(docSnap.id)) {
          return;
        }

        const s = normalizeSession(docSnap.id, docSnap.data(), originDb);

        // A matching duration/grade/source is not proof that a historical session is false.
        // Snapshot reads must preserve every record; maintenance is never performed here.

        currentMap.set(docSnap.id, s);
      });

      // Update the database-specific slice
      dbSessions[originDb] = currentMap;

      // Merge: defaultDb first, namedDb takes priority
      const mergedSessions = new Map<string, any>();
      dbSessions.defaultDb.forEach((s, id) => {
        if (!deletedSessionIds.current.has(id) && !s.mergedIntoSessionId) {
          mergedSessions.set(id, s);
        }
      });
      dbSessions.namedDb.forEach((s, id) => {
        if (s.mergedIntoSessionId) mergedSessions.delete(id);
        else if (!deletedSessionIds.current.has(id)) {
          mergedSessions.set(id, s);
        }
      });

      const sList = Array.from(mergedSessions.values());
      // Sort sessions by date descending
      sList.sort((a, b) => {
        const dateCmp = (b.date || "").localeCompare(a.date || "");
        if (dateCmp !== 0) return dateCmp;
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        return timeB - timeA;
      });

      setRecentSessions(sList);
      if (originDb === 'namedDb') sessionsLoaded = true;
      finishLoading();
    };

    const handleProgressSnapshot = (snapshot: any, originDb: "namedDb" | "defaultDb") => {
      if (!isCurrentUser()) return;
      const currentMap = new Map<string, TopicProgressData>();

      snapshot.forEach((docSnap: any) => {
        const rawData = { ...docSnap.data() };
        const tId = resolveStoredTopicId(docSnap.id, rawData.subjectId);

        // Surgical shield: Prune phantom cante fields from progress document
        // Historical fields are data, not a trigger for deleting documents or fields.

        // A direct master document wins over its alias independent of snapshot order.
        if (docSnap.id === tId || !currentMap.has(tId)) {
          currentMap.set(tId, { ...rawData, topicId: tId, originalTopicId: rawData.originalTopicId ?? docSnap.id });
        }
      });

      dbProgress[originDb] = currentMap;

      const mergedProgress = new Map<string, TopicProgressData>();
      dbProgress.defaultDb.forEach((v, k) => mergedProgress.set(k, v));
      dbProgress.namedDb.forEach((v, k) => mergedProgress.set(k, v));

      const pObj: Record<string, TopicProgressData> = {};
      mergedProgress.forEach((v, k) => {
        pObj[k] = v;
      });
      setUserProgress(pObj);
      if (originDb === 'namedDb') progressLoaded = true;
      finishLoading();
    };

    // 1. Subscribe to named DB
    const progressRef = collection(db, `users/${user.uid}/progress`);
    const unsubProgress1 = onSnapshot(progressRef, (snap) => handleProgressSnapshot(snap, "namedDb"), (err) => console.error("Error fetching progress (named):", err));

    const sessionsRef = collection(db, `users/${user.uid}/sessions`);
    const unsubSessions1 = onSnapshot(sessionsRef, (snap) => handleSessionsSnapshot(snap, "namedDb"), (err) => console.error("Error fetching sessions (named):", err));

    // 2. Subscribe to default DB (catches data written by another version with the same Google account)
    let unsubProgress2 = () => {};
    let unsubSessions2 = () => {};
    if (defaultDb && defaultDb !== db) {
      try {
        const progressRefDef = collection(defaultDb, `users/${user.uid}/progress`);
        unsubProgress2 = onSnapshot(progressRefDef, (snap) => handleProgressSnapshot(snap, "defaultDb"), () => {});

        const sessionsRefDef = collection(defaultDb, `users/${user.uid}/sessions`);
        unsubSessions2 = onSnapshot(sessionsRefDef, (snap) => handleSessionsSnapshot(snap, "defaultDb"), () => {});
      } catch (e) {
        console.warn("Could not attach defaultDb listeners:", e);
      }
    }

    // 3. Subscribe to settings
    const settingsRef = doc(db, `users/${user.uid}/settings/general`);
    const unsubSettings = onSnapshot(settingsRef, (docSnap) => {
      if (!isCurrentUser()) return;
      setUserSettings(docSnap.exists() ? docSnap.data() as UserSettingsData : null);
    });

    return () => {
      active = false;
      unsubProgress1();
      unsubSessions1();
      unsubProgress2();
      unsubSessions2();
      unsubSettings();
    };
  }, [user?.uid]);

  const addStudySession = async (arg1: any, arg2?: number, arg3?: number, arg4?: any, arg5?: string, arg6?: any) => {
    if (!user) throw new Error('Debes iniciar sesión para registrar una sesión.');
    const input = typeof arg1 === 'object' && arg1 !== null ? { ...arg1 } : {
      ...arg6, topicId: arg1, durationMinutes: arg2, difficulty: arg3, type: arg4, date: arg5,
    };
    if (!input.retentionPrediction && topicData.topicState.has(input.topicId)) {
      // Fallback capture precedes this write, but may follow entry of its outcome.
      // generatedAt prevents backdated observations being scored as historical forecasts.
      input.retentionPrediction = { ...estimateRetentionForTopic(input.topicId), captureStage: 'before_persistence' };
    }
    const record = normalizeSessionRecord({ ...input, date: input.date || getLocalDateString() }, user.uid);
    const generated = doc(collection(db, `users/${user.uid}/sessions`));
    const id = stableSessionId(record, generated.id);
    const ref = doc(db, `users/${user.uid}/sessions`, id);
    const lockId = `${user.uid}:${id}`;
    if (inFlightSessionLocks.current.has(lockId)) throw new Error('Esta sesión ya se está guardando.');
    inFlightSessionLocks.current.add(lockId);
    try {
      // No cached hours/vueltas are written. One transactional fact drives every projection.
      await runTransaction(db, async transaction => {
        const existing = await transaction.get(ref);
        if (existing.exists()) throw new Error('Esta tarea ya tiene una sesión registrada. Edita su sesión existente.');
        transaction.set(ref, cleanForFirestore({ ...record, createdAt: serverTimestamp() }));
        transaction.set(doc(db, `users/${user.uid}/progress`, record.topicId), {
          userId: user.uid, topicId: record.topicId, historyVersion: 3,
        }, { merge: true });
      });
      toast.success('Sesión real guardada. Historial y progreso actualizados.');
    } finally {
      inFlightSessionLocks.current.delete(lockId);
    }
  };

  const refreshSessionHistory = async () => {
    if (!user) return [];
    const ownerId = user.uid;
    const merged = new Map<string, any>();
    for (const client of defaultDb && defaultDb !== db ? [defaultDb, db] : [db]) {
      const snapshot = await getDocs(collection(client, `users/${user.uid}/sessions`));
      snapshot.docs.forEach(record => {
        const data = record.data();
        if (data.mergedIntoSessionId) merged.delete(record.id);
        else merged.set(record.id, { ...data, id: record.id, topicId: resolveStoredTopicId(data.topicId, data.subjectId), originalTopicId: data.originalTopicId ?? data.topicId, originDb: client === db ? 'namedDb' : 'defaultDb' });
      });
    }
    const sessions = [...merged.values()];
    if (activeUserId.current === ownerId) setRecentSessions(sessions);
    return sessions;
  };

  const recalculateTopicFromSessions = async (_targetTopicId: string) => {
    // Compatibility command: recomputation is a pure projection of persisted facts.
    await refreshSessionHistory();
  };

  const isLikelyTopicId = (val: string) => {
    if (!val || typeof val !== "string") return false;
    const clean = val.toLowerCase().trim();
    return (
      clean.includes("constitucional") ||
      clean.includes("civil") ||
      clean.includes("penal") ||
      clean.includes("procesal") ||
      clean.includes("mercantil") ||
      clean.includes("administrativo") ||
      clean.includes("laboral") ||
      clean.startsWith("const-") ||
      clean.startsWith("civ-") ||
      clean.startsWith("pen-") ||
      clean.startsWith("proc-") ||
      clean.startsWith("merc-") ||
      clean.startsWith("adm-") ||
      /^[a-z]+-\d+$/.test(clean)
    );
  };

  const deleteStudySession = async (arg1: string, arg2?: string) => {
    if (!user) throw new Error('No user');
    const first = recentSessions.find(session => session.id === arg1);
    const second = arg2 && recentSessions.find(session => session.id === arg2);
    const selected = first?.id || second?.id || arg2 || arg1;
    const ids = String(selected).replace(/^group-[a-zA-Z0-9_]+-/, '').split(',').filter(Boolean);
    for (const client of defaultDb && defaultDb !== db ? [db, defaultDb] : [db]) {
      await runTransaction(client, async transaction => {
        const snapshots = await Promise.all(ids.map(id => transaction.get(doc(client, `users/${user.uid}/sessions`, id))));
        for (const snapshot of snapshots) {
          const snapshotId = snapshot.id;
          const record = snapshot.exists() ? snapshot.data() : recentSessions.find(session => session.id === snapshotId);
          if (record?.topicId) transaction.set(doc(client, `users/${user.uid}/progress`, record.topicId), { userId: user.uid, topicId: record.topicId, historyVersion: 3 }, { merge: true });
          if (snapshot.exists()) transaction.delete(snapshot.ref);
        }
      });
    }
    toast.success('Sesión eliminada. La vista se recalcula desde los registros restantes.');
  };

  const updateStudySession = async (sessionId: string, updatedData: Partial<any>, _previousSession: any) => {
    if (!user) throw new Error('No user');
    const client = recentSessions.find(session => session.id === sessionId)?.originDb === 'defaultDb' ? defaultDb : db;
    const ref = doc(client, `users/${user.uid}/sessions`, sessionId);
    await runTransaction(client, async transaction => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists()) throw new Error('La sesión ya no existe.');
      const stored = snapshot.data();
      const record = normalizeSessionRecord({ ...stored, ...updatedData }, user.uid);
      // Correcting observations must never rewrite what the model predicted before them.
      for (const field of ['prediction', 'retentionPrediction', 'estimatedMinutes']) {
        if (stored[field] !== undefined) record[field] = stored[field];
        else delete record[field];
      }
      if (stored.completesVuelta === undefined && updatedData.completesVuelta === undefined) delete record.completesVuelta;
      transaction.set(ref, cleanForFirestore({ ...record, createdAt: stored.createdAt, updatedAt: serverTimestamp() }));
      for (const id of new Set([stored.topicId, record.topicId])) {
        transaction.set(doc(client, `users/${user.uid}/progress`, String(id)), { userId: user.uid, topicId: id, historyVersion: 3 }, { merge: true });
      }
    });
    toast.success('Sesión actualizada. Las vistas se derivan del historial actualizado.');
  };

  const quickUpdateSessionDifficulty = async (sessionId: string, difficulty: number, _topicId: string) => {
    await updateStudySession(sessionId, { difficulty, dificultadReal: difficulty }, undefined);
  };

  const mergeStudySessions = async (
    targetSessionId: string,
    sourceSessionIds: string[],
    mergedData: {
      durationMinutes: number;
      difficulty?: number;
      completesVuelta: boolean;
      type?: string;
      notes?: string;
      mistakes?: string;
    }
  ) => {
    if (!user) throw new Error('Debes iniciar sesión para fusionar sesiones.');
    try {
      const ids = [...new Set([targetSessionId, ...sourceSessionIds])];
      if (ids.length < 2 || ids.length > 400 || ids.some(id => !id || id.includes('/'))) throw new Error('Selecciona entre dos y cuatrocientas sesiones válidas.');
      const selected = ids.map(id => recentSessions.find(session => session.id === id));
      if (selected.some(session => !session)) throw new Error('El historial ha cambiado. Recarga las sesiones antes de fusionarlas.');
      const origin = selected[0].originDb || 'namedDb';
      if (selected.some(session => (session.originDb || 'namedDb') !== origin)) throw new Error('Las sesiones pertenecen a bases distintas. No se pueden fusionar de forma atómica.');
      const client = origin === 'defaultDb' ? defaultDb : db;
      const refs = ids.map(id => doc(client, `users/${user.uid}/sessions`, id));
      await runTransaction(client, async transaction => {
        // Firestore requires every read before the first write. A failure keeps all parts intact.
        const snapshots = await Promise.all(refs.map(ref => transaction.get(ref)));
        if (snapshots.some(snapshot => !snapshot.exists())) throw new Error('Una de las sesiones ya no existe. No se ha aplicado la fusión.');
        const parts: Array<Record<string, any> & { id: string }> = snapshots.map(snapshot => ({ ...snapshot.data(), id: snapshot.id }));
        if (parts.some(part => part.mergedIntoSessionId)) throw new Error('Una sesión ya fue fusionada. Recarga el historial.');
        const target = parts[0];
        const topicId = resolveStoredTopicId(target.topicId, target.subjectId);
        const category = getSessionCategory(target);
        if (category === 'unknown' || parts.some(part => resolveStoredTopicId(part.topicId, part.subjectId) !== topicId || getSessionCategory(part) !== category || part.date !== target.date)) {
          throw new Error('Solo pueden fusionarse partes de la misma actividad, tema y fecha; así se conserva su cronología.');
        }
        const measuredMinutes = parts.reduce((sum, part) => sum + sessionDurationMinutes(part), 0);
        if (parts.some(part => sessionDurationMinutes(part) <= 0)) throw new Error('Indica la duración real de cada parte antes de fusionarlas.');
        if (!Number.isFinite(mergedData.durationMinutes) || Math.abs(mergedData.durationMinutes - measuredMinutes) > 1 / 60) throw new Error('Las duraciones han cambiado. Recarga el historial antes de fusionarlo.');
        const type = category === 'initial_study' ? 'estudio_inicial' : category === 'refresh' ? 'refresco' : category === 'cante' ? 'canto' : 'repaso';
        if (mergedData.type && getSessionCategory({ type: mergedData.type }) !== category) throw new Error('La fusión no puede convertir una actividad en otra.');
        const merged: Record<string, any> = {
          ...target, topicId, type, durationMinutes: category === 'cante' ? Math.floor(measuredMinutes) : measuredMinutes,
          ...(category === 'cante' ? { cantoSeconds: Math.round(measuredMinutes * 60) % 60 } : {}),
          difficulty: mergedData.difficulty ?? target.difficulty,
          completesVuelta: (category === 'review' || category === 'cante') && mergedData.completesVuelta === true,
          notes: mergedData.notes ?? target.notes ?? '', mistakes: mergedData.mistakes ?? target.mistakes,
          mergedFromSessionIds: [...new Set(parts.flatMap(part => [part.id, ...(part.mergedFromSessionIds || [])]))],
          // Originals remain recoverable, including per-page/phase telemetry and predictions.
          mergedSessionParts: parts,
          updatedAt: serverTimestamp(),
        };
        for (const field of ['pagesNumbers', 'pageNumbers', 'pageRanges', 'startPage', 'endPage', 'fromPage', 'toPage', 'pagesCount', 'pagesStudied', 'pages', 'coverage', 'pageBreakdown', 'plsema', 'fasesPlsema', 'studyBlocks', 'isTopicCompleted', 'minutesPerPage', 'secondsPerPage', 'effectiveSeconds', 'estimatedMinutes', 'predictionSnapshot', 'prediction', 'retentionPrediction', 'retrieval']) delete merged[field];
        const extent = topicData.topicState.get(topicId)?.pages || undefined;
        const coverage = deriveInitialStudyCoverage(extent, parts.map(part => ({ ...part, type: 'estudio_inicial' })) as any);
        if (category === 'initial_study' && (coverage.status === 'conflict' || coverage.studiedPages === null)) throw new Error('Precisa los rangos de las partes de estudio inicial antes de fusionarlas para conservar su cobertura.');
        if (coverage.studiedPages !== null && coverage.knownStudiedPages > 0) {
          merged.pageRanges = coverage.intervals.map(interval => ({ startPage: interval.start + 1, endPage: interval.end }));
          merged.pagesCount = coverage.knownStudiedPages;
          if (extent) merged.totalPagesAtSession = extent;
        }
        const telemetry = parts.map(part => extractSessionTelemetry(part));
        const phaseSeconds: Record<string, number> = {};
        for (const phase of ['prelectura', 'lectura', 'subrayado', 'esquema', 'memorizar', 'cantar'] as const) {
          if (telemetry.every(item => item.plsema?.observedPhases.includes(phase))) phaseSeconds[phase] = telemetry.reduce((sum, item) => sum + item.plsema!.seconds[phase], 0);
        }
        if (Object.keys(phaseSeconds).length) merged.plsema = extractSessionTelemetry({ plsema: { seconds: phaseSeconds } }).plsema;
        const record = normalizeSessionRecord(merged, user.uid);
        if (JSON.stringify(record).length > 750_000) throw new Error('La fusión contiene demasiado detalle para un único documento. Conserva las sesiones por separado.');
        transaction.set(refs[0], cleanForFirestore(record));
        snapshots.slice(1).forEach(snapshot => {
          // Keep the stable ID as a tombstone: event replay cannot recreate a merged part.
          transaction.set(snapshot.ref, { mergedIntoSessionId: targetSessionId, mergedAt: serverTimestamp() }, { merge: true });
        });
        transaction.set(doc(client, `users/${user.uid}/progress`, topicId), { userId: user.uid, topicId, historyVersion: 3 }, { merge: true });
      });
      toast.success('Sesiones fusionadas de forma atómica; originales conservados y vistas recalculadas.');
    } catch (e: any) {
      console.error("Error merging sessions:", e);
      toast.error("Error al fusionar sesiones: " + e.message);
      throw e;
    }
  };

  const reconcileAllTopicsAndSessions = async (): Promise<{ updatedTopicsCount: number; totalSessionsCount: number }> => {
    const sessions = await refreshSessionHistory();
    const snapshot = buildTopicData(initialTopics, rawTopicProgress, sessions);
    const updatedTopicsCount = [...snapshot.topicState.values()].filter(topic => topic.sessions.length > 0).length;
    toast.success('Vista recalculada desde el historial, sin modificar ni duplicar registros.');
    return { updatedTopicsCount, totalSessionsCount: sessions.length };
  };

  const resetProgress = async () => {
    if (!user) return;
    try {
      const q = query(collection(db, `users/${user.uid}/progress`));
      const snap = await getDocs(q);
      const deletePromises: Promise<void>[] = [];
      snap.forEach(d => {
        deletePromises.push(deleteDoc(d.ref));
      });
      
      const q2 = query(collection(db, `users/${user.uid}/sessions`));
      const snap2 = await getDocs(q2);
      snap2.forEach(d => {
        deletePromises.push(deleteDoc(d.ref));
      });
      
      await Promise.all(deletePromises);
      localStorage.removeItem("ai_studio_calendar_tasks");
      localStorage.removeItem("ai_studio_study_sessions");
      setUserProgress({});
    } catch(e) {
      console.error(e);
    }
  };

  
  const exportData = async () => {
    if (!user) return;
    try {
      // Export the same database union as the UI, plus every settings/quarantine document.
      const clients = defaultDb && defaultDb !== db ? [defaultDb, db] : [db];
      const progressById = new Map<string, any>();
      const sessionsById = new Map<string, any>();
      for (const client of clients) {
        const [progressSnap, sessionsSnap] = await Promise.all([
          getDocs(collection(client, `users/${user.uid}/progress`)),
          getDocs(collection(client, `users/${user.uid}/sessions`)),
        ]);
        progressSnap.docs.forEach(d => progressById.set(d.id, { ...d.data(), topicId: d.id }));
        sessionsSnap.docs.forEach(d => sessionsById.set(d.id, { ...d.data(), id: d.id }));
      }
      const [settingsSnap, quarantineSnap] = await Promise.all([
        getDocs(collection(db, `users/${user.uid}/settings`)),
        getDocs(collection(db, `users/${user.uid}/quarantine`)),
      ]);
      const backup = {
        schemaVersion: 2,
        progress: [...progressById.values()], sessions: [...sessionsById.values()],
        settings: Object.fromEntries(settingsSnap.docs.map(d => [d.id, d.data()])),
        quarantine: quarantineSnap.docs.map(d => ({ ...d.data(), id: d.id })),
        timestamp: new Date().toISOString(),
      };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `backup_wellsprep_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success('Copia de seguridad descargada con sesiones, progreso y configuración.');
    } catch (e: any) {
      toast.error('No se pudo exportar la copia completa: ' + e.message);
    }
  };

  const importData = async (jsonText: string) => {
    if (!user) throw new Error('No user');
    // Validate the ENTIRE file before the first write; preserve historical warnings as data.
    const validation = parseBackup(jsonText);
    if (!validation.valid || !validation.backup) {
      toast.error('Copia no válida: ' + validation.issues.filter(issue => issue.severity === 'error').map(issue => issue.message).slice(0, 3).join(' '));
      return false;
    }
    const backup = validation.backup;
    const toastId = toast.loading('Importando copia de seguridad...');
    try {
      const writes: Array<{ ref: ReturnType<typeof doc>; data: any }> = [];
      const restore = (record: Record<string, unknown>): Record<string, any> => cleanForFirestore({
        ...rehydrateBackupTimestamps(record, (seconds, nanoseconds) => new Timestamp(seconds, nanoseconds)),
        userId: user.uid,
      });
      for (const progress of backup.progress) {
        writes.push({ ref: doc(db, `users/${user.uid}/progress`, progress.topicId), data: restore(progress) });
      }
      for (const session of backup.sessions) {
        const data = restore(session);
        delete data.id;
        writes.push({ ref: doc(db, `users/${user.uid}/sessions`, session.id), data });
      }
      for (const [id, settings] of Object.entries(backup.settings || {})) {
        writes.push({ ref: doc(db, `users/${user.uid}/settings`, id), data: restore(settings) });
      }
      for (const record of backup.quarantine || []) {
        writes.push({ ref: doc(db, `users/${user.uid}/quarantine`, String(record.id)), data: restore(record) });
      }
      for (let offset = 0; offset < writes.length; offset += 400) {
        const batch = writeBatch(db);
        writes.slice(offset, offset + 400).forEach(({ ref, data }) => batch.set(ref, data));
        await batch.commit();
      }
      // Stable IDs make reimport idempotent. Unrelated documents are never deleted.
      toast.success(`Importadas ${backup.progress.length} fichas y ${backup.sessions.length} sesiones.`);
      if (validation.issues.some(issue => issue.severity === 'warning')) {
        toast.info('Se han conservado los datos históricos con advertencias; no se han corregido ni eliminado automáticamente.');
      }
      return true;
    } catch (e: any) {
      toast.error('Error al importar: ' + e.message);
      return false;
    } finally {
      toast.dismiss(toastId);
    }
  };

  
  const recoverHistoricalUserData = async (silent: boolean = false) => {
    if (!user) return { recoveredProgress: 0, recoveredSessions: 0 };
    const toastId = silent ? null : toast.loading("Comprobando y vinculando datos históricos de Google...");
    try {
      let recoveredProgress = 0;
      let recoveredSessions = 0;
      const logs: string[] = [];

      // Bases de datos a escanear (Named DB actual y Default DB histórica)
      const databasesToQuery = [
        { name: "Named DB (ai-studio-remixopotrackerj)", client: db },
        { name: "Default DB ((default))", client: defaultDb },
      ];

      // Identificadores de usuario a buscar
      const userIdentifiers = [user.uid];
      if (user.email && !userIdentifiers.includes(user.email)) {
        userIdentifiers.push(user.email);
      }

      for (const { name: dbName, client: dbClient } of databasesToQuery) {
        if (!dbClient) continue;

        // 1. Escanear subcolecciones: users/{identifier}/progress y users/{identifier}/[sessions, cantos, cantes...]
        const userSubcollections = ["sessions", "cantos", "cantes", "cante_sessions", "study_sessions", "preparador_sessions"];

        for (const uid of userIdentifiers) {
          try {
            const pSnap = await getDocs(collection(dbClient, `users/${uid}/progress`));
            for (const d of pSnap.docs) {
              const incomingData = { ...d.data() };
              const targetTopicId = resolveStoredTopicId(d.id, incomingData.subjectId);
              const targetDocRef = doc(db, `users/${user.uid}/progress`, targetTopicId);
              const existingData = userProgress[targetTopicId] || {};

              // Protect against phantom cante
              if (Number(incomingData.ultimoCantoNota) === 8.5 && Number(incomingData.ultimoCantoSegundos) === 30) {
                delete incomingData.ultimoCantoNota;
                delete incomingData.ultimoCantoMinutos;
                delete incomingData.ultimoCantoSegundos;
                delete incomingData.ultimoCantoFecha;
                delete incomingData.mejorTiempoCantoMinutos;
                delete incomingData.mejorTiempoCantoSegundos;
              }

              // Fusión inteligente: preservar datos y que incomingData actualice campos si existen
              const merged = cleanForFirestore({
                ...existingData,
                ...incomingData,
                userId: user.uid,
                topicId: targetTopicId,
                vueltas: Math.max(Number(incomingData.vueltas) || 0, Number(existingData.vueltas) || 0),
                studyTimeHours: Math.max(Number(incomingData.studyTimeHours) || 0, Number(existingData.studyTimeHours) || 0),
                firstStudyDate: existingData.firstStudyDate || incomingData.firstStudyDate || undefined,
                lastReviewDate: incomingData.lastReviewDate || existingData.lastReviewDate || undefined,
                mejorTiempoCantoMinutos: incomingData.mejorTiempoCantoMinutos ?? existingData.mejorTiempoCantoMinutos ?? undefined,
                mejorTiempoCantoSegundos: incomingData.mejorTiempoCantoSegundos ?? existingData.mejorTiempoCantoSegundos ?? undefined,
                ultimoCantoMinutos: incomingData.ultimoCantoMinutos ?? existingData.ultimoCantoMinutos ?? undefined,
                ultimoCantoSegundos: incomingData.ultimoCantoSegundos ?? existingData.ultimoCantoSegundos ?? undefined,
                ultimoCantoNota: incomingData.ultimoCantoNota ?? existingData.ultimoCantoNota ?? undefined,
                ultimoCantoFecha: incomingData.ultimoCantoFecha || existingData.ultimoCantoFecha || undefined,
                updatedAt: serverTimestamp(),
              });

              await setDoc(targetDocRef, merged, { merge: true });
              recoveredProgress++;
            }
          } catch (e: any) {
            logs.push(`Scan progress ${dbName} users/${uid}: ${e.message}`);
          }

          // Scan all user study & cante subcollections
          for (const subCol of userSubcollections) {
            try {
              const sSnap = await getDocs(collection(dbClient, `users/${uid}/${subCol}`));
              const isCanteCol = subCol === "cantos" || subCol === "cantes" || subCol === "cante_sessions" || subCol === "preparador_sessions";

              for (const d of sSnap.docs) {
                // Skip if deleted by student
                if (deletedSessionIds.current.has(d.id)) {
                  continue;
                }
                const dClean = String(d.id).replace(/^group-[a-zA-Z0-9_]+-/, "").trim();
                if (deletedSessionIds.current.has(dClean)) {
                  continue;
                }

                const sData = d.data();
                const sTopicId = resolveStoredTopicId(sData.topicId, sData.subjectId);

                // Skip phantom cante
                const isPhantomAero =
                  (sData.source === "aerofocus" || sData.source === "aerofocus_pro") &&
                  (sData.type === "canto" || sData.modality === "canto" || Number(sData.cantoGrade) === 8.5 || Number(sData.cantoSeconds) === 30 || sData.flightId === "cierre_22h");
                const isPhantomDirect =
                  (sTopicId === "constitucional-5" || sTopicId === "5") &&
                  Number(sData.cantoGrade) === 8.5 && Number(sData.cantoSeconds) === 30;

                if (isPhantomAero || isPhantomDirect) {
                  continue;
                }

                const targetDocRef = doc(db, `users/${user.uid}/sessions`, d.id);
                await setDoc(
                  targetDocRef,
                  cleanForFirestore({
                    ...sData,
                    topicId: sTopicId,
                    userId: user.uid,
                    type: sData.type || (isCanteCol ? "canto" : "repaso"),
                    updatedAt: serverTimestamp(),
                  }),
                  { merge: true }
                );
                recoveredSessions++;
              }
            } catch (e: any) {
              logs.push(`Scan ${subCol} ${dbName} users/${uid}: ${e.message}`);
            }
          }

          // Ajustes de usuario
          try {
            const settingsSnap = await getDocs(collection(dbClient, `users/${uid}/settings`));
            for (const d of settingsSnap.docs) {
              if (d.id === "general") {
                await setDoc(
                  doc(db, `users/${user.uid}/settings/general`),
                  cleanForFirestore({
                    ...d.data(),
                    userId: user.uid,
                  }),
                  { merge: true }
                );
              }
            }
          } catch {
            // ignore
          }
        }

        // 2. Escanear colecciones raíz históricas
        const rootCollections = ["progress", "sessions", "study_sessions", "cante_sessions", "cantos", "cantes", "user_sessions", "preparador_sessions"];
        for (const colName of rootCollections) {
          for (const uid of userIdentifiers) {
            const queryFields = ["userId", "uid", "user_id"];
            for (const field of queryFields) {
              try {
                const q = query(collection(dbClient, colName), where(field, "==", uid));
                const snap = await getDocs(q);
                for (const d of snap.docs) {
                  const data = d.data();
                  if (colName === "progress") {
                    const targetTopicId = resolveStoredTopicId(data.topicId || d.id, data.subjectId);

                    if (Number(data.ultimoCantoNota) === 8.5 && Number(data.ultimoCantoSegundos) === 30) {
                      delete data.ultimoCantoNota;
                      delete data.ultimoCantoMinutos;
                      delete data.ultimoCantoSegundos;
                      delete data.ultimoCantoFecha;
                    }

                    const targetDocRef = doc(db, `users/${user.uid}/progress`, targetTopicId);
                    await setDoc(
                      targetDocRef,
                      cleanForFirestore({ ...data, userId: user.uid, topicId: targetTopicId }),
                      { merge: true }
                    );
                    recoveredProgress++;
                  } else {
                    const sTopicId = resolveStoredTopicId(data.topicId, data.subjectId);

                    const isPhantomAero =
                      (data.source === "aerofocus" || data.source === "aerofocus_pro") &&
                      (data.type === "canto" || data.modality === "canto" || Number(data.cantoGrade) === 8.5 || Number(data.cantoSeconds) === 30 || data.flightId === "cierre_22h");
                    const isPhantomDirect =
                      (sTopicId === "constitucional-5" || sTopicId === "5") &&
                      Number(data.cantoGrade) === 8.5 && Number(data.cantoSeconds) === 30;

                    if (isPhantomAero || isPhantomDirect) {
                      continue;
                    }

                    const isCanteCol = colName === "cante_sessions" || colName === "cantos" || colName === "cantes" || colName === "preparador_sessions";
                    const targetDocRef = doc(db, `users/${user.uid}/sessions`, d.id);
                    await setDoc(
                      targetDocRef,
                      cleanForFirestore({
                        ...data,
                        topicId: sTopicId,
                        userId: user.uid,
                        type: data.type || (isCanteCol ? "canto" : "repaso"),
                      }),
                      { merge: true }
                    );
                    recoveredSessions++;
                  }
                }
              } catch (e: any) {
                logs.push(`Query root ${colName} [${field}] on ${dbName}: ${e.message}`);
              }
            }
          }
        }
      }

      // 3. Recalcular temas si se vincularon sesiones
      if (recoveredSessions > 0) {
        await reconcileAllTopicsAndSessions();
      }

      if (toastId) toast.dismiss(toastId);
      if (recoveredProgress > 0 || recoveredSessions > 0) {
        toast.success(`¡Historial vinculado! ${recoveredProgress} temas y ${recoveredSessions} sesiones recuperadas desde tu cuenta de Google.`);
      } else if (!silent) {
        toast.info("Todos tus datos de Google ya están correctamente vinculados.");
      }

      return { recoveredProgress, recoveredSessions, logs };
    } catch (err: any) {
      console.error("Error en recuperación de historial:", err);
      if (toastId) {
        toast.dismiss(toastId);
        toast.error("Aviso al vincular historial: " + err.message);
      }
      return { recoveredProgress: 0, recoveredSessions: 0, error: err.message };
    }
  };

  // Restauración y protección de sesiones legítimas de Derecho Penal
  const restoreLegitimatePenalSessions = async (silent: boolean = false): Promise<{ restoredCount: number }> => {
    if (!user) return { restoredCount: 0 };
    try {
      let restoredCount = 0;
      const snap = await getDocs(collection(db, `users/${user.uid}/sessions`));

      for (const d of snap.docs) {
        const data = d.data();
        const sNotes = String(data.notes || "");
        
        // Detectar si fue forzada erróneamente en el pasado
        if (sNotes.includes("[Migrado de Penal a Constitucional 5]")) {
          const originalNum = sNotes.includes("penal 12") || sNotes.includes("penal-12") ? 12 : 5;
          const targetTopicId = `penal-${originalNum}`;
          const officialTopic = initialTopics.find(t => t.id === targetTopicId);

          await updateDoc(d.ref, {
            topicId: targetTopicId,
            subjectId: "penal",
            topicTitle: officialTopic ? `Tema ${officialTopic.number} - ${officialTopic.title}` : `Tema ${originalNum} Penal`,
            category: "Derecho Penal",
            notes: sNotes.replace("[Migrado de Penal a Constitucional 5]", "").trim(),
            updatedAt: serverTimestamp(),
          });
          await recalculateTopicFromSessions(targetTopicId);
          restoredCount++;
        }
      }

      if (restoredCount > 0) {
        await recalculateTopicFromSessions("constitucional-5");
        const refreshedSnap = await getDocs(collection(db, `users/${user.uid}/sessions`));
        setRecentSessions(refreshedSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      }
      return { restoredCount };
    } catch (err: any) {
      console.warn("Notice restoring penal sessions:", err);
      return { restoredCount: 0 };
    }
  };

  const migratePenalSessionsToConstitucional5 = restoreLegitimatePenalSessions;

  // Purgado exhaustivo de cante ficticio de test y mantenimiento seguro
  const purgePhantomTema5Cante = async () => {
    if (!user) return;
    try {
      // 1. Restaurar sesiones legítimas de Penal que hubieran sido forzadas en versiones anteriores
      await restoreLegitimatePenalSessions(true);

      const snap = await getDocs(collection(db, `users/${user.uid}/sessions`));
      for (const d of snap.docs) {
        const data = d.data();
        const sTopic = String(data.topicId || "").toLowerCase().trim();
        const sNotes = String(data.notes || "").toLowerCase();
        const sType = String(data.type || data.modality || "").toLowerCase();

        // 2. Eliminar exclusivamente cantes ficticios/inventados de prueba
        const isTopic5 =
          sTopic === "constitucional-5" ||
          sTopic === "5" ||
          sTopic === "tema-5" ||
          sTopic === "tema 5" ||
          sTopic === "const-5";

        const isExactMockDemo =
          isTopic5 &&
          sType === "canto" &&
          Number(data.cantoGrade) === 8.5 &&
          Number(data.cantoSeconds) === 30 &&
          data.flightId === "FLIGHT_TEST_AERO_99";

        const isInvented =
          sNotes.includes("inventado") ||
          sNotes.includes("mock") ||
          sNotes.includes("simulado test") ||
          data.flightId === "FLIGHT_TEST_AERO_99";

        if (isExactMockDemo || isInvented) {
          await deleteDoc(d.ref);
        }
      }

      // Limpiar datos residuales del cante en progreso de Constitucional 5 si coincide con la marca de prueba
      const progRef = doc(db, `users/${user.uid}/progress`, "constitucional-5");
      const progSnapDoc = await getDoc(progRef);
      if (progSnapDoc.exists()) {
        const pData = progSnapDoc.data();
        if (
          Number(pData.ultimoCantoNota) === 8.5 &&
          Number(pData.ultimoCantoSegundos) === 30 &&
          pData.ultimoCantoFecha === "2026-10-16"
        ) {
          await updateDoc(progRef, {
            ultimoCantoNota: deleteField(),
            ultimoCantoMinutos: deleteField(),
            ultimoCantoSegundos: deleteField(),
            ultimoCantoFecha: deleteField(),
            mejorTiempoCantoMinutos: deleteField(),
            mejorTiempoCantoSegundos: deleteField(),
            updatedAt: serverTimestamp(),
          });
        }
      }

      // Check legacy "5" progress doc
      const prog5Ref = doc(db, `users/${user.uid}/progress`, "5");
      const prog5Snap = await getDoc(prog5Ref);
      if (prog5Snap.exists()) {
        await deleteDoc(prog5Ref).catch(() => {});
      }

      // Recalcular Constitucional 5 con datos estrictamente reales
      await recalculateTopicFromSessions("constitucional-5");
    } catch (err) {
      console.warn("Purge notice:", err);
    }
  };

  // Deduplicación quirúrgica de sesiones: elimina dobles clicks y cantes duplicados (Temas 7 y 17)
  const deduplicateUserSessions = async (silent: boolean = true): Promise<{ deletedCount: number; affectedTopics: string[] }> => {
    if (!user) return { deletedCount: 0, affectedTopics: [] };
    const toastId = silent ? null : toast.loading("Auditando sesiones en busca de registros duplicados...");
    try {
      const snap = await getDocs(collection(db, `users/${user.uid}/sessions`));
      const seenGroups = new Map<string, string>();
      const toDeleteDocIds: string[] = [];
      const affectedTopics = new Set<string>();

      // Normalizar y agrupar sesiones
      snap.docs.forEach((d) => {
        const data = d.data();
        const topicId = resolveStoredTopicId(data.topicId, data.subjectId);

        const date = String(data.date || "").trim();
        const type = String(data.type || data.modality || "repaso").toLowerCase();
        const durMin = Math.round(Number(data.durationMinutes || data.durationReal || data.duration || 0));
        const durSec = Number(data.cantoSeconds || data.seconds || 0);
        const grade = typeof data.cantoGrade === "number" ? data.cantoGrade : (typeof data.grade === "number" ? data.grade : null);
        const isCante = isCantoSession(data);

        // Si es una sesión fantasma de 1 minuto o menos procedente de AeroFocus sin nota de cante
        const isAeroGhostOneMin =
          (data.source === "aerofocus" || data.source === "aerofocus_pro" || data.source === "aerofocus_approved") &&
          durMin <= 1 &&
          grade === null;

        if (isAeroGhostOneMin) {
          toDeleteDocIds.push(d.id);
          affectedTopics.add(topicId);
          return;
        }

        // Clave de firma unívoca para detectar duplicados (mismo tema, misma fecha, misma duración y nota)
        const dedupKey = isCante
          ? `${topicId}__${date}__canto__${durMin}m_${durSec}s__${grade !== null ? grade.toFixed(1) : "nograde"}`
          : `${topicId}__${date}__${type}__${durMin}m`;

        if (seenGroups.has(dedupKey)) {
          // Sesión idéntica duplicada encontrada -> Programar para eliminación
          toDeleteDocIds.push(d.id);
          affectedTopics.add(topicId);
        } else {
          seenGroups.set(dedupKey, d.id);
        }
      });

      // Eliminar documentos duplicados en Firestore
      for (const docId of toDeleteDocIds) {
        await deleteDoc(doc(db, `users/${user.uid}/sessions`, docId)).catch(() => {});
      }

      // Recalcular todos los temas afectados
      for (const tId of affectedTopics) {
        await recalculateTopicFromSessions(tId);
      }

      // Garantizar recálculo de Constitucional 7 y Constitucional 17
      await recalculateTopicFromSessions("constitucional-7");
      await recalculateTopicFromSessions("constitucional-17");

      if (toastId) toast.dismiss(toastId);
      if (toDeleteDocIds.length > 0) {
        toast.success(`Deduplicación completada: Se eliminaron ${toDeleteDocIds.length} cantes/sesiones duplicadas (Temas 7 y 17 corregidos).`);
      } else if (!silent) {
        toast.info("No se encontraron sesiones duplicadas. Todo tu temario está limpio.");
      }

      return { deletedCount: toDeleteDocIds.length, affectedTopics: Array.from(affectedTopics) };
    } catch (e: any) {
      console.error("Error deduplicating sessions:", e);
      if (toastId) {
        toast.dismiss(toastId);
        toast.error("Error al deduplicar sesiones: " + e.message);
      }
      return { deletedCount: 0, affectedTopics: [] };
    }
  };

  // Purgar todos los datos frutos de la asociación con AeroFocus y recalcular temas
  const purgeAllAeroFocusData = async () => {
    if (!user) return;
    const toastId = toast.loading("Eliminando sesiones de AeroFocus y recalculando...");
    try {
      const sessionsRef = collection(db, `users/${user.uid}/sessions`);
      const snap = await getDocs(sessionsRef);
      const affectedTopicIds = new Set<string>();
      const toDeleteIds: string[] = [];

      snap.forEach((docSnap) => {
        const data = docSnap.data();
        const isAero =
          data.source === "aerofocus" ||
          data.source === "aerofocus_pro" ||
          !!data.flightId ||
          !!data.sourceFlightId ||
          (data.notes && String(data.notes).toLowerCase().includes("aerofocus")) ||
          (data.notes && String(data.notes).toLowerCase().includes("vuelo #"));

        if (isAero) {
          toDeleteIds.push(docSnap.id);
          if (data.topicId) {
            affectedTopicIds.add(data.topicId);
          }
        }
      });

      if (toDeleteIds.length > 0) {
        for (const sId of toDeleteIds) {
          await deleteDoc(doc(db, `users/${user.uid}/sessions`, sId));
        }

        // Recalcular temas afectados
        for (const tId of affectedTopicIds) {
          await recalculateTopicFromSessions(tId);
        }
      }

      // Limpiar también eventos en el servidor (quarantine purge)
      try {
        await authenticatedFetch("/api/webhook/clear", { method: "POST" });
      } catch {
        // ignore
      }

      toast.dismiss(toastId);
      if (toDeleteIds.length > 0) {
        toast.success(`Purgadas ${toDeleteIds.length} sesiones de AeroFocus. Temario oficial recalculado.`);
      } else {
        toast.info("No se encontraron sesiones de AeroFocus en tu temario.");
      }
    } catch (err: any) {
      console.error("Error purgando AeroFocus:", err);
      toast.dismiss(toastId);
      toast.error("Error al purgar AeroFocus: " + err.message);
    }
  };

  // Auditoría y Corrección de Integridad: Mercantil vs Constitucional
  const auditAndRestoreTopicIntegrity = async () => {
    if (!user) return { restoredCount: 0 };
    const toastId = toast.loading("Verificando integridad del temario (Mercantil / Constitucional)...");
    try {
      let restoredCount = 0;
      const sessionsRef = collection(db, `users/${user.uid}/sessions`);
      const sSnap = await getDocs(sessionsRef);

      for (const d of sSnap.docs) {
        const data = d.data();
        const tid = String(data.topicId || "");

        // Detectar si una sesión de Mercantil fue erróneamente renombrada a constitucional
        if (tid.startsWith("constitucional-")) {
          const num = parseInt(tid.split("-")[1], 10);
          if (num >= 1 && num <= 17) {
            const textCorpus = `${data.topicTitle || ""} ${data.notes || ""} ${data.subjectName || ""}`.toLowerCase();
            const isMercantilKeywords =
              textCorpus.includes("mercantil") ||
              textCorpus.includes("sociedad") ||
              textCorpus.includes("comercio") ||
              textCorpus.includes("contabilidad") ||
              textCorpus.includes("quiebra") ||
              textCorpus.includes("concurso") ||
              textCorpus.includes("título") ||
              textCorpus.includes("letra de cambio") ||
              textCorpus.includes("pagaré");

            if (isMercantilKeywords) {
              const targetMercantilId = `mercantil-${num}`;
              await updateDoc(d.ref, {
                topicId: targetMercantilId,
                topicTitle: data.topicTitle || `Tema ${num} Mercantil`,
                updatedAt: serverTimestamp(),
              });
              await recalculateTopicFromSessions(targetMercantilId);
              await recalculateTopicFromSessions(tid);
              restoredCount++;
            }
          }
        }
      }

      toast.dismiss(toastId);
      if (restoredCount > 0) {
        toast.success(`Auditoría completada: ${restoredCount} sesiones restauradas a Derecho Mercantil.`);
      } else {
        toast.info("Integridad verificada: El temario de Mercantil y Constitucional es correcto.");
      }
      return { restoredCount };
    } catch (err: any) {
      toast.dismiss(toastId);
      toast.error("Error en auditoría de integridad: " + err.message);
      return { restoredCount: 0 };
    }
  };

  // Mantener firma segura por retrocompatibilidad redirigiendo a auditoría
  const migrateMercantilToConstitucional = async () => {
    await auditAndRestoreTopicIntegrity();
  };

  // Sincronización automática de cuenta Google, deduplicación de cantes y blindaje de cuarentena
  useEffect(() => {
    // Synthetic scenarios must not trigger legacy recovery or destructive maintenance.
    if (isFirebaseEmulator) return;
    if (user) {
      // Recovery/purge/deduplication are explicit maintenance actions, never login effects.
      fetchQuarantinedEvents();
    }
  }, [user?.uid]);

  const updateTopicProgress = async (topicId: string, data: Partial<TopicProgressData>) => {
    if (!user) return;
    try {
      const masters = new Set(['pages', 'numeroPalabras', 'difficulty', 'epigrafes', 'customTitle', 'notas', 'isCustom', 'subjectId', 'number', 'isDeleted']);
      const patch: Record<string, any> = {};
      for (const [key, value] of Object.entries(data)) {
        if (!masters.has(key)) throw new Error('Los contadores y las fechas se derivan del historial; no se editan como parámetros del tema.');
        if (value === undefined || value === null || value === '') { patch[key] = deleteField(); continue; }
        if (['pages', 'numeroPalabras', 'epigrafes'].includes(key) && (!Number.isFinite(Number(value)) || Number(value) < 0)) throw new Error('La extensión debe ser un número no negativo.');
        if (key === 'difficulty' && (!Number.isFinite(Number(value)) || Number(value) < 1 || Number(value) > 10)) throw new Error('La dificultad debe estar entre 1 y 10.');
        patch[key] = value;
      }
      const cleanData = cleanForFirestore({
        ...patch,
        updatedAt: serverTimestamp(),
        userId: user.uid,
        topicId: topicId,
      });
      await setDoc(doc(db, `users/${user.uid}/progress`, topicId), cleanData, { merge: true });
    } catch (e: any) {
      console.error("Error updating topic progress:", e);
      handleFirestoreError(e, OperationType.WRITE, `users/${user.uid}/progress/${topicId}`);
    }
  };

  
  const importProgress = async (csvText: string) => {
    if (!user) throw new Error("No user");
    
    return new Promise<{ success: number, errors: string[] }>((resolve) => {
      Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
          const errors: string[] = [];
          let success = 0;
          
          try {
            let batch = writeBatch(db);
            let count = 0;
            
            for (const row of results.data as any[]) {
              try {
                if (!row.id || typeof row.id !== 'string') {
                  errors.push(`Fila omitida: Falta ID válido. Datos: ${JSON.stringify(row)}`);
                  continue;
                }
                
                const topicId = row.id.trim().toLowerCase();
                const progressRef = doc(db, `users/${user.uid}/progress`, topicId);
                
                const dataToSave: any = {
                  userId: user.uid,
                  topicId,
                  updatedAt: serverTimestamp(),
                };
                
                if (row.vueltas) dataToSave.vueltas = parseInt(row.vueltas);
                if (row.difficulty) dataToSave.difficulty = parseInt(row.difficulty);
                if (row.studyTimeHours) dataToSave.studyTimeHours = parseFloat(row.studyTimeHours);
                if (row.firstStudyDate) dataToSave.firstStudyDate = row.firstStudyDate;
                if (row.lastReviewDate) dataToSave.lastReviewDate = row.lastReviewDate;
                if (row.mejorTiempoCantoMinutos) dataToSave.mejorTiempoCantoMinutos = parseInt(row.mejorTiempoCantoMinutos);
                if (row.mejorTiempoCantoSegundos) dataToSave.mejorTiempoCantoSegundos = parseInt(row.mejorTiempoCantoSegundos);
                if (row.notas) dataToSave.notas = row.notas;
                if (row.srsEasinessFactor) dataToSave.srsEasinessFactor = parseFloat(row.srsEasinessFactor);
                if (row.srsInterval) dataToSave.srsInterval = parseInt(row.srsInterval);
                if (row.srsRepetitions) dataToSave.srsRepetitions = parseInt(row.srsRepetitions);
                
                batch.set(progressRef, dataToSave, { merge: true });
                success++;
                count++;
                
                if (count >= 490) {
                  await batch.commit();
                  batch = writeBatch(db);
                  count = 0;
                }
              } catch (err: any) {
                errors.push(`Error en fila ${row.id}: ${err.message}`);
              }
            }
            
            if (count > 0) {
              await batch.commit();
            }
            resolve({ success, errors });
          } catch (e: any) {
            errors.push(`Error de lote: ${e.message}`);
            resolve({ success, errors });
          }
        },
        error: (error) => {
          resolve({ success: 0, errors: [error.message] });
        }
      });
    });
  };

  const updateUserSettings = async (data: Partial<any>) => {
    if (!user) return;
    try {
      if (data.retention !== undefined) {
        if (!data.retention || typeof data.retention !== 'object' || Array.isArray(data.retention)) throw new Error('Configuración de retención no válida.');
        const bounds = { initialStabilityDays: [.25, 365], initialRecallProbability: [.05, .99], reviewThreshold: [.05, .95], priorStrength: [1, 1000], recencyHalfLifeDays: [1, 3650], maxIntervalDays: [1, 3650] };
        for (const [key, [minimum, maximum]] of Object.entries(bounds)) {
          const value = data.retention[key];
          if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum)) throw new Error(`Parámetro de retención fuera de rango: ${key}.`);
        }
      }
      const cleanData = cleanForFirestore({
        userId: user.uid,
        ...data,
        updatedAt: serverTimestamp()
      });
      await setDoc(doc(db, `users/${user.uid}/settings/general`), cleanData, { merge: true });
    } catch (e: any) {
      console.error("Error updating settings:", e);
      handleFirestoreError(e, OperationType.WRITE, `users/${user.uid}/settings/general`);
    }
  };

  const webhookToken = userSettings?.webhookToken?.startsWith('wpa_') ? userSettings.webhookToken : '';
  const generateWebhookToken = async () => {
    if (!user) { toast.error('Inicia sesión para generar la credencial.'); return ''; }
    try {
      const ownerId = user.uid;
      const response = await authenticatedFetch('/api/webhook/credentials', { method: 'POST' });
      if (!response.ok) throw new Error('El servidor no ha podido registrar la credencial.');
      const result = await response.json();
      if (activeUserId.current !== ownerId || typeof result.token !== 'string' || !/^wpa_[A-Za-z0-9_-]{43}$/.test(result.token)) throw new Error('La sesión ha cambiado o la credencial no es válida.');
      await updateUserSettings({ webhookToken: result.token });
      toast.success('Credencial personal registrada. Actualiza AeroFocus con el nuevo valor.');
      return result.token;
    } catch (error) { toast.error(error instanceof Error ? error.message : 'No se ha podido registrar la credencial.'); return ''; }
  };

  const LOCAL_STORAGE_QUARANTINE_KEY = "wp_quarantined_events";

  const loadLocalQuarantinedEvents = useCallback((): WebhookSyncRecord[] => {
    try {
      if (!user?.uid || typeof window === "undefined" || !window.localStorage) return [];
      const raw = localStorage.getItem(`${LOCAL_STORAGE_QUARANTINE_KEY}:${user.uid}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.filter((e: any) => e.status === "quarantined" || e.status === "pending");
        }
      }
    } catch {}
    return [];
  }, [user?.uid]);

  const saveLocalQuarantinedEvents = useCallback((events: WebhookSyncRecord[]) => {
    try {
      if (!user?.uid || typeof window === "undefined" || !window.localStorage) return;
      const pending = events.filter((e: any) => e.status === "quarantined" || e.status === "pending");
      const key = `${LOCAL_STORAGE_QUARANTINE_KEY}:${user.uid}`;
      if (pending.length) localStorage.setItem(key, JSON.stringify(pending));
      else localStorage.removeItem(key);
    } catch {}
  }, [user?.uid]);

  const [quarantinedEvents, setQuarantinedEvents] = useState<WebhookSyncRecord[]>([]);
  const [isLoadingQuarantine, setIsLoadingQuarantine] = useState(false);

  // Detector de artefactos de prueba antiguos para mantener la bandeja limpia sin descartar sesiones de estudio
  const isTestArtifact = useCallback((rec: any) => {
    if (!rec) return true;
    const idStr = String(rec.id || "").toLowerCase();
    const flightStr = String(rec.flightId || "").toLowerCase();
    const eventStr = String(rec.rawPayload?.event || rec.event || "").toLowerCase();
    
    // Si tiene temas con tiempo o minutos reales de estudio, NUNCA es un artefacto
    const mins = Number(rec.totalFlightEffectiveMinutes || rec.dailyTotalEffectiveMinutes || rec.minutosEfectivos || 0);
    const hasRealTopics = Array.isArray(rec.topics) && rec.topics.length > 0;
    if (mins > 0 || hasRealTopics) {
      return false;
    }

    // Pings diagnósticos de conectividad puros SIN datos de estudio
    if (
      rec.isDiagnosticPing === true ||
      rec.isTestPing === true ||
      rec.rawPayload?.isDiagnosticPing === true ||
      rec.rawPayload?.isTestPing === true ||
      eventStr === "test_connection" ||
      eventStr === "ping" ||
      eventStr === "test_ping"
    ) {
      return true;
    }

    // Registros explícitamente marcados de test sin minutos reales
    if ((rec.isTest === true || rec.rawPayload?.isTest === true) && mins === 0 && !hasRealTopics) {
      return true;
    }

    // Artefactos de desarrollo conocidos
    if (idStr === "test_curl_1" || flightStr === "flight_test_aero_99") {
      return true;
    }

    return false;
  }, []);

  // Carga reactiva de eventos retenidos en cuarentena (Triple redundancia: LocalStorage + Servidor + Firestore)
  const fetchQuarantinedEvents = useCallback(async () => {
    if (!user) return [];
    const ownerId = user.uid;
    setIsLoadingQuarantine(true);
    try {
      const snapshot = await getDocs(collection(db, `users/${ownerId}/quarantine`));
      const events = snapshot.docs.map(item => ({ ...item.data(), id: item.id }))
        .filter((event: any) => (event.userId === undefined || event.userId === ownerId) && !isTestArtifact(event) && ['pending','quarantined'].includes(event.status))
        .map((event: any) => ({ ...event, userId: ownerId })) as WebhookSyncRecord[];
      if (activeUserId.current !== ownerId) return [];
      saveLocalQuarantinedEvents(events); setQuarantinedEvents(events); return events;
    } finally { if (activeUserId.current === ownerId) setIsLoadingQuarantine(false); }
  }, [user, saveLocalQuarantinedEvents, isTestArtifact]);

  // The backend and client share this UID-owned collection. No file/server mirror,
  // polling copy, heuristic adoption or cache union can resurrect deleted events.
  useEffect(() => {
    if (!user) return;
    const ownerId = user.uid;
    return onSnapshot(collection(db, `users/${ownerId}/quarantine`), snapshot => {
      if (activeUserId.current !== ownerId) return;
      const events = snapshot.docs.map(item => ({ ...item.data(), id: item.id }))
        .filter((event: any) => (event.userId === undefined || event.userId === ownerId) && !isTestArtifact(event) && ['pending','quarantined'].includes(event.status))
        .map((event: any) => ({ ...event, userId: ownerId })) as WebhookSyncRecord[];
      saveLocalQuarantinedEvents(events); setQuarantinedEvents(events);
    }, () => toast.error('No se ha podido sincronizar la cuarentena. Comprueba la conexión y los permisos.'));
  }, [user, saveLocalQuarantinedEvents, isTestArtifact]);

  // Importación e inserción manual de transmisiones de AeroFocus a la Bandeja de Cuarentena
  const addQuarantineEventManually = useCallback(async (rawInput: any): Promise<boolean> => {
    if (!user) return false;
    const ownerId = user.uid;
    try {
      const parsedRes = parseAeroFocusInput(rawInput);
      if (!parsedRes.success || !parsedRes.payload) {
        toast.error(parsedRes.error || "No se pudo interpretar el formato de AeroFocus.");
        return false;
      }

      const rawPayload = parsedRes.payload;
      let rawTopics: any[] = [];
      if (Array.isArray(rawPayload)) {
        rawTopics = rawPayload;
      } else if (Array.isArray(rawPayload.topics)) {
        rawTopics = rawPayload.topics;
      } else if (Array.isArray(rawPayload.tasksBreakdown)) {
        rawTopics = rawPayload.tasksBreakdown;
      } else if (Array.isArray(rawPayload.sessions)) {
        rawTopics = rawPayload.sessions;
      } else if (Array.isArray(rawPayload.studySessions)) {
        rawTopics = rawPayload.studySessions;
      } else if (Array.isArray(rawPayload.study_sessions)) {
        rawTopics = rawPayload.study_sessions;
      } else if (Array.isArray(rawPayload.items)) {
        rawTopics = rawPayload.items;
      } else if (Array.isArray(rawPayload.tasks)) {
        rawTopics = rawPayload.tasks;
      } else if (Array.isArray(rawPayload.pageBreakdown)) {
        rawTopics = rawPayload.pageBreakdown;
      } else if (Array.isArray(rawPayload.analytics?.topicsGlobal?.topics)) {
        rawTopics = rawPayload.analytics.topicsGlobal.topics;
      } else if (
        rawPayload.topicId ||
        rawPayload.topicTitle ||
        rawPayload.topicNumber ||
        rawPayload.tema ||
        rawPayload.topic ||
        rawPayload.materia ||
        rawPayload.subject ||
        rawPayload.title
      ) {
        rawTopics = [rawPayload];
      }

      // Si no hay temas individuales pero sí tiempo total de estudio registrado
      const detectedFlightMins = [
        rawPayload.minutosEfectivos, rawPayload.totalEffectiveStudyMinutes, rawPayload.effectiveMinutes,
        rawPayload.dailyTotalEffectiveMinutes, rawPayload.totalFlightEffectiveMinutes,
        Number(rawPayload.dailyTotalEffectiveHours) * 60, Number(rawPayload.effectiveHours) * 60, Number(rawPayload.horasEfectivas) * 60,
      ].filter(value => typeof value === 'number' || typeof value === 'string').map(Number).find(value => Number.isFinite(value) && value > 0) ?? 0;

      if (rawTopics.length === 0) {
        const fallbackSub = rawPayload.materia || rawPayload.subject || rawPayload.category || "";
        const fallbackMins = detectedFlightMins;
        rawTopics = [{
          materia: fallbackSub,
          topicTitle: rawPayload.topicTitle || rawPayload.title || `Sesión de Estudio (${fallbackSub})`,
          topicNumber: extractTopicNumber(rawPayload.topicNumber) || undefined,
          effectiveMinutes: fallbackMins,
          effectiveHours: Math.round((fallbackMins / 60) * 100) / 100,
          modality: rawPayload.modality || "repaso"
        }];
      }

      const resolvedTopics: WebhookResolvedTopic[] = [];

      // Filtrar temas que sean meras marcas de distracción o pausa
      const filteredRawTopics = rawTopics.filter(t => {
        const mod = String(t.modalidad || t.modality || t.type || '').toLowerCase();
        if (mod === 'distraction' || mod === 'distraccion' || mod === 'pausa' || mod === 'break' || mod === 'descanso') {
          return false;
        }
        const title = String(t.tema || t.topic || t.topicTitle || '').toLowerCase();
        if ((title.includes('distracci') || title.includes('pausa') || title.includes('descanso')) && !title.match(/(?:tema|civil|penal|const)/i)) {
          return false;
        }
        return true;
      });

      const effectiveTopicsList = filteredRawTopics.length > 0 ? filteredRawTopics : rawTopics;
      // A flight total can describe its sole row; it cannot allocate minutes among several topics.
      const singleTopicFlightMinutes = effectiveTopicsList.length === 1 ? detectedFlightMins : 0;

      for (const t of effectiveTopicsList) {
        const materia = t.materia || t.subject || t.subjectName || t.category || rawPayload.materia || rawPayload.subject || "";
        const modalidad = t.modalidad || t.modality || t.type || rawPayload.modalidad || rawPayload.modality || "repaso";
        
        // Extracción precisa de los minutos del tema
        const directMins = extractMinutesFromAeroItem(t, 0);
        const minutos = directMins > 0 ? directMins : singleTopicFlightMinutes;
        const horas = Math.round((minutos / 60) * 100) / 100;

        const startPage = t.startPage ?? t.pages?.pageStart ?? null;
        const endPage = t.endPage ?? t.pages?.pageEnd ?? null;
        const pagesCount = t.pagesCount ?? t.pages?.pagesCount ?? (startPage != null && endPage != null ? Math.max(0, endPage - startPage + 1) : 0);
        const pagesText = t.pagesText ?? t.pages?.rawText ?? t.paginas ?? (startPage != null && endPage != null ? `Págs. ${startPage}-${endPage}` : undefined);
        const isCompleted = Boolean(t.completado || t.completed || t.isTopicCompleted || t.status === 'completed');

        const enriched = {
          ...t,
          category: materia,
          materia,
          modality: modalidad,
          modalidad,
          effectiveHours: horas,
          horasEfectivas: horas,
          effectiveMinutes: minutos,
          minutosEfectivos: minutos,
          startPage,
          endPage,
          pagesCount,
          pagesText,
          isTopicCompleted: isCompleted,
          completesVuelta: isCompleted || Boolean(t.completesVuelta)
        };
        const resolved = resolveAeroFocusTopic(enriched);
        if (resolved) {
          resolvedTopics.push({
            ...resolved,
            effectiveMinutes: minutos,
            effectiveHours: horas,
            startPage: startPage !== null ? Number(startPage) : resolved.startPage,
            endPage: endPage !== null ? Number(endPage) : resolved.endPage,
            pagesCount: pagesCount || resolved.pagesCount,
            pagesText: pagesText || resolved.pagesText,
            isTopicCompleted: isCompleted || resolved.isTopicCompleted,
            completesVuelta: isCompleted || resolved.completesVuelta
          });
        } else {
          const rawTitleStr = t.topicTitle || t.tema || t.topic || t.title || t.text || "";
          const subId = normalizeCategoryToSubjectId(materia) || normalizeCategoryToSubjectId(rawTitleStr);
          const parsedNum = extractTopicNumber(t.topicNumber) || extractTopicNumber(t.temaNumero) || extractTopicNumber(rawTitleStr) || extractTopicNumber(t.id);
          const matchedOfficial = parsedNum && subId ? initialTopics.find(it => it.subjectId === subId && it.number === parsedNum) : undefined;

          const finalSubId = matchedOfficial ? matchedOfficial.subjectId : (subId || 'unknown');
          const finalNum = matchedOfficial ? matchedOfficial.number : (parsedNum && parsedNum > 0 ? parsedNum : 0);
          const finalTopicId = matchedOfficial ? matchedOfficial.id : (subId && finalNum ? `${finalSubId}-${finalNum}` : `unresolved-${Date.now()}-${resolvedTopics.length}`);
          const finalTitle = matchedOfficial
            ? `Tema ${matchedOfficial.number} - ${matchedOfficial.title}`
            : (rawTitleStr || (finalNum ? `Tema ${finalNum} (${finalSubId})` : 'Sesión pendiente de clasificar'));

          const fallbackTopic: WebhookResolvedTopic = {
            resolvedTopicId: finalTopicId,
            resolvedSubjectId: finalSubId,
            resolvedTopicNumber: finalNum,
            resolvedTopicTitle: finalTitle,
            effectiveMinutes: minutos,
            effectiveHours: horas,
            modality: (modalidad as any) || "repaso",
            startPage: startPage !== null ? Number(startPage) : undefined,
            endPage: endPage !== null ? Number(endPage) : undefined,
            pagesCount: pagesCount || undefined,
            pagesText: pagesText || undefined,
            isTopicCompleted: isCompleted,
            completesVuelta: isCompleted || Boolean(t.completesVuelta),
            notes: t.notes || "Importado desde AeroFocus Pro",
            original: t,
          };
          if (t.cantoGrade !== undefined || t.grade !== undefined) fallbackTopic.cantoGrade = t.cantoGrade ?? t.grade;
          if (t.cantoSeconds !== undefined) fallbackTopic.cantoSeconds = t.cantoSeconds;
          if (t.cantoType !== undefined) fallbackTopic.cantoType = t.cantoType;
          if (t.mistakes !== undefined) fallbackTopic.mistakes = t.mistakes;
          if (t.difficulty !== undefined) {
            fallbackTopic.difficulty = Number(t.difficulty);
            fallbackTopic.dificultadReal = Number(t.difficulty);
          }
          resolvedTopics.push(fallbackTopic);
        }
      }

      const totalEffectiveMinutes =
        Number(rawPayload.totalFlightEffectiveMinutes) ||
        detectedFlightMins ||
        resolvedTopics.reduce((acc, t) => acc + (t.effectiveMinutes || 0), 0);
      const totalEffectiveHours =
        Number(rawPayload.dailyTotalEffectiveHours) ||
        Number(rawPayload.totalFlightEffectiveHours) ||
        Math.round((totalEffectiveMinutes / 60) * 100) / 100;

      const record: WebhookSyncRecord & { userId: string } = {
        userId: ownerId,
        id: `af_manual_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        receivedAt: new Date().toISOString(),
        date: rawPayload.date || rawPayload.flightDate || getLocalDateString(),
        source: rawPayload.source || "aerofocus_manual",
        flightId: String(rawPayload.flightId || rawPayload.id || `vuelo_${Date.now()}`),
        totalFlightEffectiveMinutes: totalEffectiveMinutes,
        totalFlightEffectiveHours: totalEffectiveHours,
        status: "pending",
        topics: resolvedTopics,
        rawPayload: rawPayload,
        summary: rawPayload.summary || {
          estudioHours: resolvedTopics.filter(t => t.modality === "primer_estudio").reduce((a, b) => a + b.effectiveHours, 0),
          repasoHours: resolvedTopics.filter(t => t.modality === "repaso").reduce((a, b) => a + b.effectiveHours, 0),
          refrescoHours: resolvedTopics.filter(t => t.modality === "refresco").reduce((a, b) => a + b.effectiveHours, 0),
          cantoHours: resolvedTopics.filter(t => t.modality === "canto").reduce((a, b) => a + b.effectiveHours, 0),
          totalHours: totalEffectiveHours,
        },
      };

      // Confirm creation only after the durable write succeeds. On failure the
      // caller keeps the original import input and can retry it explicitly.
      const qDocRef = doc(db, `users/${ownerId}/quarantine`, record.id);
      await setDoc(qDocRef, cleanForFirestore(record));
      if (activeUserId.current !== ownerId) return true;

      // Keep the account-scoped cache in sync after persistence, not before it.
      setQuarantinedEvents(prev => {
        if (activeUserId.current !== ownerId) return prev;
        const updated = [record, ...prev.filter(e => e.id !== record.id)];
        saveLocalQuarantinedEvents(updated);
        return updated;
      });

      toast.success("¡Transmisión de AeroFocus incorporada a la Bandeja de Cuarentena!");
      return true;
    } catch (e: any) {
      console.error("Error adding manual quarantine event:", e);
      toast.error("Error al procesar la sesión de AeroFocus: " + e.message);
      return false;
    }
  }, [user, webhookToken, saveLocalQuarantinedEvents]);

  // Incorpora un evento de AeroFocus de forma completa y oficial a las sesiones del usuario y actualiza progreso
  const incorporateAeroFocusEvent = useCallback(async (
    event: WebhookSyncRecord,
    source: 'aerofocus_auto' | 'aerofocus_approved' = 'aerofocus_auto',
    notifyToast = true,
  ): Promise<boolean> => {
    if (!user) return false;
    try {
      if ((event as WebhookSyncRecord & { userId?: string }).userId !== user.uid) throw new Error('El evento no tiene un propietario verificado para esta cuenta. Se conserva en cuarentena.');
      const eventIdentity = String(event.flightId || event.transactionId || event.id);
      if (!eventIdentity || !event.topics?.length) throw new Error('Evento sin identidad o sin sesiones.');
      const entries = event.topics.map((topic, index) => {
        if (!topicData.topicState.has(topic.resolvedTopicId) || !topic.resolvedSubjectId || topic.resolvedSubjectId === 'unknown') throw new Error('Hay temas pendientes de identificar con materia e identificador estable. Se conserva el evento en cuarentena.');
        const duration = extractMinutesFromAeroItem(topic, 0);
        const record = normalizeSessionRecord({
          ...extractSessionTelemetry(topic), topicId: topic.resolvedTopicId,
          topicTitle: topic.resolvedTopicTitle, date: event.date || getLocalDateString(),
          durationMinutes: duration, difficulty: topic.difficulty ?? topic.dificultadReal,
          type: topic.modality, cantoGrade: topic.cantoGrade, cantoSeconds: topic.cantoSeconds,
          cantoType: topic.cantoType, mistakes: topic.mistakes, notes: topic.notes || '',
          completesVuelta: topic.completesVuelta === true,
          source, flightId: event.flightId, sourceEventId: eventIdentity,
          sourceSegmentId: `${topic.resolvedTopicId}:${topic.modality}:${(topic.original as any)?.sessionId || (topic.original as any)?.taskId || index}`,
        }, user.uid);
        return { record, ref: doc(db, `users/${user.uid}/sessions`, stableSessionId(record, '')) };
      });
      const topicIds = [...new Set(entries.map(entry => entry.record.topicId))];
      if (entries.length + topicIds.length + 1 > 450) throw new Error('El evento es demasiado grande para una incorporación atómica; debe dividirse en entregas con identidad estable.');
      await runTransaction(db, async transaction => {
        const existing = await Promise.all(entries.map(entry => transaction.get(entry.ref)));
        entries.forEach((entry, index) => {
          if (!existing[index].exists()) transaction.set(entry.ref, cleanForFirestore({ ...entry.record, createdAt: serverTimestamp() }));
        });
        topicIds.forEach(topicId => transaction.set(doc(db, `users/${user.uid}/progress`, topicId), { userId: user.uid, topicId, historyVersion: 3 }, { merge: true }));
        transaction.set(doc(db, `users/${user.uid}/quarantine`, event.id), cleanForFirestore({ ...event, status: 'processed', userId: user.uid }), { merge: true });
      });
      await refreshSessionHistory();
      setQuarantinedEvents(previous => previous.filter(item => item.id !== event.id));
      if (notifyToast) toast.success('Evento incorporado con identidades estables. No se han duplicado sesiones.');
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo incorporar el evento.');
      return false;
    }
  }, [user, topicData.topicState]);

  // Auto-incorporación transparente: SOLO si el usuario ha habilitado explícitamente autoIncorporateAeroFocus en sus ajustes
  const isAutoIncorporating = useRef(false);
  useEffect(() => {
    if (!user || !userSettings?.autoIncorporateAeroFocus || isAutoIncorporating.current) return;
    const pendingToIncorporate = quarantinedEvents.filter(
      (e: any) =>
        e.userId === user.uid &&
        (e.status === "pending" || e.status === "quarantined") &&
        !isTestArtifact(e) &&
        Array.isArray(e.topics) &&
        e.topics.length > 0
    );
    if (pendingToIncorporate.length === 0) return;

    isAutoIncorporating.current = true;
    (async () => {
      try {
        for (const ev of pendingToIncorporate) {
          await incorporateAeroFocusEvent(ev, "aerofocus_auto", true);
        }
      } catch (err) {
        console.warn("Auto-incorporate event error:", err);
      } finally {
        isAutoIncorporating.current = false;
      }
    })();
  }, [user, userSettings?.autoIncorporateAeroFocus, quarantinedEvents, isTestArtifact, incorporateAeroFocusEvent]);

  // Aprobación manual y explícita por parte del estudiante
  const approveQuarantineEvent = useCallback(async (eventId: string): Promise<boolean> => {
    if (!user) return false;
    const toastId = toast.loading("Aprobando e incorporando evento a tu expediente...");
    try {
      const event = quarantinedEvents.find(e => e.id === eventId);
      if (!event) throw new Error("Evento no encontrado en cuarentena");

      const success = await incorporateAeroFocusEvent(event, "aerofocus_approved", false);
      toast.dismiss(toastId);
      if (success) {
        setQuarantinedEvents(prev => {
          const remaining = prev.filter(e => e.id !== eventId);
          saveLocalQuarantinedEvents(remaining);
          return remaining;
        });
        toast.success("Evento validado e integrado en tu expediente oficial.");
      } else {
        toast.error("Error al integrar el evento.");
      }
      return success;
    } catch (err: any) {
      toast.dismiss(toastId);
      toast.error("Error al aprobar evento: " + err.message);
      return false;
    }
  }, [user, quarantinedEvents, incorporateAeroFocusEvent, saveLocalQuarantinedEvents]);

  // Aprobar todas las sesiones retenidas en cuarentena en un solo clic
  const approveAllQuarantineEvents = useCallback(async (): Promise<{ approvedCount: number }> => {
    if (!user) return { approvedCount: 0 };
    let approvedCount = 0;
    for (const event of quarantinedEvents) {
      if (await incorporateAeroFocusEvent(event, 'aerofocus_approved', false)) approvedCount++;
    }
    await fetchQuarantinedEvents();
    return { approvedCount };
  }, [user, quarantinedEvents, incorporateAeroFocusEvent, fetchQuarantinedEvents]);

  const discardQuarantineEvent = useCallback(async (eventId: string): Promise<boolean> => {
    try {
      const event = quarantinedEvents.find(record => record.id === eventId);
      if (!user || (event as (WebhookSyncRecord & { userId?: string }) | undefined)?.userId !== user.uid) throw new Error('El evento no tiene un propietario verificado. Se conserva en cuarentena.');
      await deleteDoc(doc(db, `users/${user.uid}/quarantine`, eventId));

      setQuarantinedEvents(prev => {
        const remaining = prev.filter(e => e.id !== eventId);
        saveLocalQuarantinedEvents(remaining);
        return remaining;
      });
      toast.info("Evento descartado de la cuarentena.");
      return true;
    } catch (err: any) {
      toast.error("Error al descartar evento: " + err.message);
      return false;
    }
  }, [user, quarantinedEvents, saveLocalQuarantinedEvents]);

  // Vaciar toda la bandeja de cuarentena
  const clearAllQuarantine = useCallback(async (): Promise<boolean> => {
    try {
      if (!user || quarantinedEvents.some(event => (event as WebhookSyncRecord & { userId?: string }).userId !== user.uid)) throw new Error('Hay eventos sin propietario verificado. Se conservan en cuarentena.');
      if (user) {
        const qSnap = await getDocs(collection(db, `users/${user.uid}/quarantine`));
        if (qSnap.docs.some(record => record.data().userId !== user.uid)) throw new Error('Hay registros sin propietario verificado. No se ha vaciado la cuarentena.');
        const batch = writeBatch(db);
        qSnap.forEach(record => batch.delete(record.ref));
        await batch.commit();
      }
      saveLocalQuarantinedEvents([]);
      setQuarantinedEvents([]);
      toast.success("Bandeja de cuarentena de AeroFocus vaciada.");
      return true;
    } catch (err: any) {
      toast.error("Error al vaciar cuarentena: " + err.message);
      return false;
    }
  }, [user, quarantinedEvents, saveLocalQuarantinedEvents]);

  // Firestore is the durable record. A rejected write must not look saved in the UI.
  const updateQuarantineEvent = useCallback(async (eventId: string, updatedRecord: Partial<WebhookSyncRecord>) => {
    const existing = quarantinedEvents.find(event => event.id === eventId);
    if (!user || (existing as (WebhookSyncRecord & { userId?: string }) | undefined)?.userId !== user.uid) throw new Error('El evento no tiene un propietario verificado. No se ha modificado.');
    if ('userId' in updatedRecord && (updatedRecord as any).userId !== user.uid) throw new Error('La edición no puede cambiar el propietario del evento.');
    if ('id' in updatedRecord && updatedRecord.id !== eventId) throw new Error('La edición no puede cambiar el identificador del evento.');
    const ownerId = user.uid;
    await setDoc(doc(db, `users/${ownerId}/quarantine`, eventId), cleanForFirestore(updatedRecord), { merge: true });
    // An account switch during the write never brings the previous owner's record
    // into the next account's state or local cache.
    if (activeUserId.current !== ownerId) return;
    setQuarantinedEvents(prev => {
      if (activeUserId.current !== ownerId) return prev;
      const updated = prev.map(e => e.id === eventId ? { ...e, ...updatedRecord } : e);
      saveLocalQuarantinedEvents(updated);
      return updated;
    });
  }, [user, quarantinedEvents, saveLocalQuarantinedEvents]);

  // Actualizar un tema concreto dentro de una transmisión en cuarentena (ej. dificultad, modalidad, horas, completesVuelta)
  const updateQuarantineTopic = useCallback(async (eventId: string, topicIndex: number, updatedFields: Partial<WebhookResolvedTopic>) => {
    const event = quarantinedEvents.find(e => e.id === eventId);
    if (!event || !event.topics || !event.topics[topicIndex]) throw new Error('No se ha encontrado el tema en cuarentena. No se ha modificado.');

    const newTopics = [...event.topics];
    newTopics[topicIndex] = {
      ...newTopics[topicIndex],
      ...updatedFields
    };

    const totalMinutes = newTopics.reduce((acc, t) => acc + (t.effectiveMinutes || 0), 0);
    const totalHours = Math.round((totalMinutes / 60) * 100) / 100;

    const updatedRecord: WebhookSyncRecord = {
      ...event,
      topics: newTopics,
      totalFlightEffectiveMinutes: totalMinutes,
      totalFlightEffectiveHours: totalHours
    };

    await updateQuarantineEvent(eventId, updatedRecord);
  }, [quarantinedEvents, updateQuarantineEvent]);

  // Fusionar dos repasos/bloques del mismo tema dentro de una transmisión
  const mergeQuarantineTopics = useCallback(async (eventId: string, indexA: number, indexB: number) => {
    const event = quarantinedEvents.find(e => e.id === eventId);
    if (!event || !event.topics) return;
    const topicA = event.topics[indexA];
    const topicB = event.topics[indexB];
    if (!topicA || !topicB) return;

    const combinedMins = (topicA.effectiveMinutes || 0) + (topicB.effectiveMinutes || 0);
    const combinedHours = Math.round(((topicA.effectiveHours || 0) + (topicB.effectiveHours || 0)) * 100) / 100;
    const mergedNotes = [topicA.notes, topicB.notes].filter(Boolean).join(" | ");

    const mergedTopic: WebhookResolvedTopic = {
      ...topicA,
      effectiveMinutes: combinedMins,
      effectiveHours: combinedHours,
      notes: mergedNotes,
      completesVuelta: topicA.completesVuelta || topicB.completesVuelta || false,
      difficulty: topicA.difficulty || topicB.difficulty,
      dificultadReal: topicA.dificultadReal || topicB.dificultadReal
    };

    const newTopics = event.topics.filter((_, idx) => idx !== indexB);
    newTopics[indexA] = mergedTopic;

    const totalMinutes = newTopics.reduce((acc, t) => acc + (t.effectiveMinutes || 0), 0);
    const totalHours = Math.round((totalMinutes / 60) * 100) / 100;

    const updatedRecord: WebhookSyncRecord = {
      ...event,
      topics: newTopics,
      totalFlightEffectiveMinutes: totalMinutes,
      totalFlightEffectiveHours: totalHours
    };

    await updateQuarantineEvent(eventId, updatedRecord);
    toast.success(`Repasos unificados: ${mergedTopic.resolvedTopicTitle} (${combinedMins} min)`);
  }, [quarantinedEvents, updateQuarantineEvent]);

  // Eliminar un único tema de un vuelo en cuarentena sin perder el resto del vuelo
  const deleteQuarantineTopic = useCallback(async (eventId: string, topicIndex: number): Promise<boolean> => {
    const event = quarantinedEvents.find(e => e.id === eventId);
    if (!event || !event.topics) return false;

    const newTopics = event.topics.filter((_, idx) => idx !== topicIndex);

    if (newTopics.length === 0) {
      await discardQuarantineEvent(eventId);
      toast.info("Vuelo eliminado al retirar su único tema.");
      return true;
    }

    const totalMinutes = newTopics.reduce((acc, t) => acc + (t.effectiveMinutes || 0), 0);
    const totalHours = Math.round((totalMinutes / 60) * 100) / 100;

    const updatedRecord: WebhookSyncRecord = {
      ...event,
      topics: newTopics,
      totalFlightEffectiveMinutes: totalMinutes,
      totalFlightEffectiveHours: totalHours,
      dailyTotalEffectiveMinutes: totalMinutes,
      dailyTotalEffectiveHours: totalHours
    };

    await updateQuarantineEvent(eventId, updatedRecord);



    toast.success("Tema retirado de la sesión.");
    return true;
  }, [quarantinedEvents, updateQuarantineEvent, discardQuarantineEvent]);

  // Añadir un nuevo tema a un vuelo en cuarentena
  const addQuarantineTopic = useCallback(async (eventId: string, topicToAdd?: Partial<WebhookResolvedTopic>): Promise<boolean> => {
    const event = quarantinedEvents.find(e => e.id === eventId);
    if (!event) return false;

    const observedMinutes = extractMinutesFromAeroItem(topicToAdd || {}, 0);
    const defaultNewTopic: WebhookResolvedTopic = {
      resolvedTopicId: topicToAdd?.resolvedTopicId || `unresolved-${Date.now()}`,
      resolvedSubjectId: topicToAdd?.resolvedSubjectId || "unknown",
      resolvedTopicNumber: topicToAdd?.resolvedTopicNumber || 0,
      resolvedTopicTitle: topicToAdd?.resolvedTopicTitle || "Tema pendiente de identificar",
      effectiveMinutes: observedMinutes,
      effectiveHours: observedMinutes / 60,
      modality: topicToAdd?.modality || "repaso",
      completesVuelta: topicToAdd?.completesVuelta === true,
      difficulty: topicToAdd?.difficulty,
      dificultadReal: topicToAdd?.dificultadReal,
      notes: topicToAdd?.notes || "Añadido manualmente al vuelo",
      startPage: topicToAdd?.startPage,
      endPage: topicToAdd?.endPage,
      pagesCount: topicToAdd?.pagesCount,
      pagesText: topicToAdd?.pagesText
    };

    const newTopics = [...(event.topics || []), defaultNewTopic];
    const totalMinutes = newTopics.reduce((acc, t) => acc + (t.effectiveMinutes || 0), 0);
    const totalHours = Math.round((totalMinutes / 60) * 100) / 100;

    const updatedRecord: WebhookSyncRecord = {
      ...event,
      topics: newTopics,
      totalFlightEffectiveMinutes: totalMinutes,
      totalFlightEffectiveHours: totalHours,
      dailyTotalEffectiveMinutes: totalMinutes,
      dailyTotalEffectiveHours: totalHours
    };

    await updateQuarantineEvent(eventId, updatedRecord);



    if (observedMinutes <= 0 || defaultNewTopic.resolvedSubjectId === 'unknown') toast.info('Tema pendiente: indica su materia, tema y minutos reales antes de incorporarlo.');
    else toast.success("Tema añadido al vuelo.");
    return true;
  }, [quarantinedEvents, updateQuarantineEvent]);

  // Limpiar vuelos de prueba o artefactos del Tema 1 de test
  const cleanTestArtifacts = useCallback(async (): Promise<number> => {
    let count = 0;
    const cleanList = quarantinedEvents.filter(e => !isTestArtifact(e));
    count = quarantinedEvents.length - cleanList.length;
    setQuarantinedEvents(cleanList);

    if (user) {
      try {
        const qSnap = await getDocs(collection(db, `users/${user.uid}/quarantine`));
        qSnap.forEach(d => {
          if (isTestArtifact({ id: d.id, ...d.data() })) {
            deleteDoc(d.ref).catch(() => {});
            count++;
          }
        });
      } catch {}
    }

    authenticatedFetch("/api/webhook/clean-tests", { method: "POST" }).catch(() => {});
    if (count > 0) {
      toast.success(`Se eliminaron ${count} vuelos de prueba/test.`);
    } else {
      toast.info("No se detectaron vuelos de prueba.");
    }
    return count;
  }, [quarantinedEvents, user, isTestArtifact]);

  // Mantener syncPendingWebhookEvents para compatibilidad sin auto-forzado
  const syncPendingWebhookEvents = useCallback(async (force: boolean = false) => {
    await fetchQuarantinedEvents();
    return 0;
  }, [fetchQuarantinedEvents]);

  return (
    <FirebaseContext.Provider
      value={{
        user,
        loading,
        userProgress: topicData.progressView,
        rawTopicProgress,
        topics: topicData.topics,
        topicState: topicData.topicState,
        estimateDuration,
        estimateRetentionForTopic,
        recentSessions,
        userSettings,
        webhookToken,
        isSyncingWebhooks,
        aerofocusBetaEnabled,
        setAerofocusBetaEnabled,
        generateWebhookToken,
        syncPendingWebhookEvents,
        updateTopicProgress,
        updateUserSettings,
        addStudySession,
        updateStudySession,
        deleteStudySession,
        quickUpdateSessionDifficulty,
        mergeStudySessions,
        reconcileAllTopicsAndSessions,
        resetProgress,
        importProgress,
        exportData,
        importData,
        migrateMercantilToConstitucional: rejectHeuristicMaintenance,
        auditAndRestoreTopicIntegrity: rejectHeuristicMaintenance,
        purgeAllAeroFocusData: rejectHeuristicMaintenance,
        purgePhantomTema5Cante: rejectHeuristicMaintenance,
        migratePenalSessionsToConstitucional5: rejectHeuristicMaintenance,
        deduplicateUserSessions: rejectHeuristicMaintenance,
        recoverHistoricalUserData: rejectHeuristicMaintenance,
        quarantinedEvents,
        isLoadingQuarantine,
        fetchQuarantinedEvents,
        approveQuarantineEvent,
        approveAllQuarantineEvents,
        discardQuarantineEvent,
        clearAllQuarantine,
        addQuarantineEventManually,
        updateQuarantineEvent,
        updateQuarantineTopic,
        deleteQuarantineTopic,
        addQuarantineTopic,
        mergeQuarantineTopics,
        cleanTestArtifacts: rejectHeuristicMaintenance,
      }}
    >
      {children}
    </FirebaseContext.Provider>
  );
}

export function useFirebase() {
  const context = useContext(FirebaseContext);
  if (context === undefined) {
    throw new Error("useFirebase must be used within a FirebaseProvider");
  }
  return context;
}
