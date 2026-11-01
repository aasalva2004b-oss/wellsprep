import { getLocalDateString, safeParseDate } from './utils';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
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
} from "firebase/firestore";
import { auth, db, defaultDb, handleFirestoreError, OperationType } from "./firebase";
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
  updatedAt?: string;
}

interface FirebaseContextType {
  user: User | null;
  loading: boolean;
  userProgress: Record<string, TopicProgressData>;
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
  addStudySession: (
    topicId: string,
    durationMinutes: number, // planned duration
    difficulty: number,
    type: "estudio_inicial" | "repaso" | "refresco" | "canto" | "simulacro",
    date?: string,
    extraData?: any
  ) => Promise<void>;
  updateStudySession: (
    sessionId: string,
    updatedData: Partial<any>,
    previousSession: any
  ) => Promise<void>;
  deleteStudySession: (topicId: string, sessionId: string) => Promise<void>;
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
  const [userProgress, setUserProgress] = useState<
    Record<string, TopicProgressData>
  >({});
  const [recentSessions, setRecentSessions] = useState<any[]>([]);
  const [userSettings, setUserSettings] = useState<UserSettingsData | null>(
    null,
  );
  const [isSyncingWebhooks, setIsSyncingWebhooks] = useState(false);
  const inFlightSessionLocks = useRef<Set<string>>(new Set());
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
      setUser(u);
      if (!u) {
        setUserProgress({});
        setRecentSessions([]);
        setUserSettings(null);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    // Multi-database real-time sessions and progress maps
    const sessionsMap = new Map<string, any>();
    const progressMap = new Map<string, TopicProgressData>();

    const normalizeSession = (id: string, data: any, originDb: string) => {
      let canonicalTopicId = data.topicId;
      if (canonicalTopicId === "5" || canonicalTopicId === 5) {
        canonicalTopicId = "constitucional-5";
      } else if (canonicalTopicId === "7" || canonicalTopicId === 7) {
        canonicalTopicId = "constitucional-7";
      } else if (canonicalTopicId === "17" || canonicalTopicId === 17) {
        canonicalTopicId = "constitucional-17";
      } else if (typeof canonicalTopicId === "string") {
        const clean = canonicalTopicId.toLowerCase().trim();
        if (clean === "5" || clean === "tema-5" || clean === "tema 5" || clean === "t5" || clean === "t-5") {
          canonicalTopicId = "constitucional-5";
        } else if (clean === "7" || clean === "tema-7" || clean === "tema 7" || clean === "t7" || clean === "t-7") {
          canonicalTopicId = "constitucional-7";
        } else if (clean === "17" || clean === "tema-17" || clean === "tema 17" || clean === "t17" || clean === "t-17") {
          canonicalTopicId = "constitucional-17";
        } else if (clean.startsWith("const-") || clean.startsWith("const_")) {
          canonicalTopicId = `constitucional-${clean.replace(/^const[-_]/, "")}`;
        }
      }

      return {
        id,
        ...data,
        topicId: canonicalTopicId,
        originalTopicId: data.topicId,
        originDb,
      };
    };

    const handleSessionsSnapshot = (snapshot: any, originDb: string) => {
      let hasNewDefaultDbSessions = false;
      snapshot.forEach((docSnap: any) => {
        const s = normalizeSession(docSnap.id, docSnap.data(), originDb);

        // Surgical shield: Reject phantom cante from AeroFocus or 8.5 grade/30s
        const isPhantomAero =
          (s.source === "aerofocus" || s.source === "aerofocus_pro") &&
          (s.type === "canto" || s.modality === "canto" || Number(s.cantoGrade) === 8.5 || Number(s.cantoSeconds) === 30 || s.flightId === "cierre_22h");
        const isPhantomDirect =
          (s.topicId === "constitucional-5" || s.topicId === "5") &&
          Number(s.cantoGrade) === 8.5 && Number(s.cantoSeconds) === 30;

        // Auto-prune phantom 1-minute AeroFocus sessions (pings/distraction artifacts)
        const isPhantomOneMin =
          (s.source === "aerofocus" || s.source === "aerofocus_pro" || s.source === "aerofocus_approved") &&
          (Number(s.durationMinutes || s.durationReal || 0) <= 1) &&
          !s.cantoGrade && Number(s.cantoGrade || 0) === 0;

        if (isPhantomAero || isPhantomDirect || isPhantomOneMin) {
          deleteDoc(doc(db, `users/${user.uid}/sessions`, docSnap.id)).catch(() => {});
          return;
        }

        sessionsMap.set(docSnap.id, s);

        // If session originates from defaultDb and is missing in db, auto-replicate to named db
        if (originDb === "defaultDb") {
          hasNewDefaultDbSessions = true;
          setDoc(doc(db, `users/${user.uid}/sessions`, docSnap.id), cleanForFirestore({
            ...docSnap.data(),
            topicId: s.topicId,
            userId: user.uid,
            updatedAt: serverTimestamp(),
          }), { merge: true }).catch(() => {});
        }
      });

      const sList = Array.from(sessionsMap.values());
      // Sort sessions by date descending
      sList.sort((a, b) => {
        const dateCmp = (b.date || "").localeCompare(a.date || "");
        if (dateCmp !== 0) return dateCmp;
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        return timeB - timeA;
      });

      setRecentSessions(sList);
      setLoading(false);
    };

    const handleProgressSnapshot = (snapshot: any, originDb: string) => {
      snapshot.forEach((docSnap: any) => {
        const rawData = { ...docSnap.data() };
        let tId = docSnap.id;
        if (tId === "5" || tId === 5) {
          tId = "constitucional-5";
        } else if (typeof tId === "string" && (tId.startsWith("const-") || tId.startsWith("const_"))) {
          tId = `constitucional-${tId.replace(/^const[-_]/, "")}`;
        }

        // Surgical shield: Prune phantom cante fields from progress document
        if (Number(rawData.ultimoCantoNota) === 8.5 && Number(rawData.ultimoCantoSegundos) === 30) {
          delete rawData.ultimoCantoNota;
          delete rawData.ultimoCantoMinutos;
          delete rawData.ultimoCantoSegundos;
          delete rawData.ultimoCantoFecha;
          delete rawData.mejorTiempoCantoMinutos;
          delete rawData.mejorTiempoCantoSegundos;
          updateDoc(doc(db, `users/${user.uid}/progress`, tId), {
            ultimoCantoNota: deleteField(),
            ultimoCantoMinutos: deleteField(),
            ultimoCantoSegundos: deleteField(),
            ultimoCantoFecha: deleteField(),
            mejorTiempoCantoMinutos: deleteField(),
            mejorTiempoCantoSegundos: deleteField(),
            updatedAt: serverTimestamp(),
          }).catch(() => {});
        }

        const existing: any = progressMap.get(tId) || {};
        // Intelligent deep merge
        const merged: TopicProgressData = {
          ...existing,
          ...rawData,
          topicId: tId,
          vueltas: Math.max(Number(rawData.vueltas) || 0, Number(existing.vueltas) || 0),
          studyTimeHours: Math.max(Number(rawData.studyTimeHours) || 0, Number(existing.studyTimeHours) || 0),
          mejorTiempoCantoMinutos: rawData.mejorTiempoCantoMinutos ?? existing.mejorTiempoCantoMinutos,
          mejorTiempoCantoSegundos: rawData.mejorTiempoCantoSegundos ?? existing.mejorTiempoCantoSegundos,
          ultimoCantoMinutos: rawData.ultimoCantoMinutos ?? existing.ultimoCantoMinutos,
          ultimoCantoSegundos: rawData.ultimoCantoSegundos ?? existing.ultimoCantoSegundos,
          ultimoCantoFecha: rawData.ultimoCantoFecha || existing.ultimoCantoFecha,
          ultimoCantoNota: rawData.ultimoCantoNota ?? existing.ultimoCantoNota,
          firstStudyDate: existing.firstStudyDate || rawData.firstStudyDate,
          lastReviewDate: rawData.lastReviewDate || existing.lastReviewDate,
        };
        progressMap.set(tId, merged);

        if (originDb === "defaultDb") {
          setDoc(doc(db, `users/${user.uid}/progress`, tId), cleanForFirestore({
            ...merged,
            userId: user.uid,
            updatedAt: serverTimestamp(),
          }), { merge: true }).catch(() => {});
        }
      });

      const pObj: Record<string, TopicProgressData> = {};
      progressMap.forEach((v, k) => {
        pObj[k] = v;
      });
      setUserProgress(pObj);
    };

    // 1. Subscribe to named DB
    const progressRef = collection(db, `users/${user.uid}/progress`);
    const unsubProgress1 = onSnapshot(progressRef, (snap) => handleProgressSnapshot(snap, "namedDb"), (err) => console.error("Error fetching progress (named):", err));

    const sessionsRef = collection(db, `users/${user.uid}/sessions`);
    const unsubSessions1 = onSnapshot(sessionsRef, (snap) => handleSessionsSnapshot(snap, "namedDb"), (err) => console.error("Error fetching sessions (named):", err));

    // 2. Subscribe to default DB (catches data written by another version with the same Google account)
    let unsubProgress2 = () => {};
    let unsubSessions2 = () => {};
    if (defaultDb) {
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
      if (docSnap.exists()) {
        setUserSettings(docSnap.data() as UserSettingsData);
      }
    });

    return () => {
      unsubProgress1();
      unsubSessions1();
      unsubProgress2();
      unsubSessions2();
      unsubSettings();
    };
  }, [user]);

  const addStudySession = async (
    topicId: string,
    durationMinutes: number,
    difficulty: number,
    type: "estudio_inicial" | "repaso" | "refresco" | "canto" | "simulacro",
    providedDate?: string,
    extraData?: any
  ) => {
    if (!user) {
      toast.error("Debes iniciar sesión para registrar una sesión.");
      return;
    }
    if (!topicId || typeof topicId !== "string" || !topicId.trim()) {
      toast.error("Error: ID de tema no válido.");
      return;
    }

    try {
      let cleanTopicId = topicId.trim();
      if (cleanTopicId === "7" || cleanTopicId === "tema-7" || cleanTopicId === "t7" || cleanTopicId === "const-7") {
        cleanTopicId = "constitucional-7";
      } else if (cleanTopicId === "17" || cleanTopicId === "tema-17" || cleanTopicId === "t17" || cleanTopicId === "const-17") {
        cleanTopicId = "constitucional-17";
      } else if (cleanTopicId === "5" || cleanTopicId === "tema-5" || cleanTopicId === "t5" || cleanTopicId === "const-5") {
        cleanTopicId = "constitucional-5";
      } else if (cleanTopicId.startsWith("const-") || cleanTopicId.startsWith("const_")) {
        cleanTopicId = `constitucional-${cleanTopicId.replace(/^const[-_]/, "")}`;
      }

      const today = (providedDate && typeof providedDate === "string" && providedDate.trim()) 
        ? providedDate.trim() 
        : getLocalDateString();
      const durMinutes = Math.max(0, Number(durationMinutes) || 0);
      const safeDiff = Math.min(10, Math.max(1, Math.round(Number(difficulty) || 5)));
      const extraSecs = Number(extraData?.cantoSeconds || extraData?.seconds || 0);
      const extraGrade = extraData?.cantoGrade ?? extraData?.grade;

      // ANTI-DUPLICATE GUARD 1: Bloqueo concurrente inmediato (doble click / re-envío en < 6 segundos)
      const lockKey = `${cleanTopicId}_${today}_${type}_${durMinutes}_${extraSecs}_${extraGrade !== undefined ? extraGrade : "nograde"}`;
      if (inFlightSessionLocks.current.has(lockKey)) {
        console.warn(`[Anti-Duplicate] Petición duplicada bloqueada en vuelo:`, lockKey);
        return;
      }
      inFlightSessionLocks.current.add(lockKey);
      setTimeout(() => {
        inFlightSessionLocks.current.delete(lockKey);
      }, 6000);

      // ANTI-DUPLICATE GUARD 2: Comprobar si ya existe una sesión idéntica registrada recientemente en la misma fecha
      const isRecentDuplicate = (recentSessions || []).some((s) => {
        const sTopic = String(s.topicId || "").toLowerCase().trim();
        const sameTopic = sTopic === cleanTopicId || sTopic === cleanTopicId.replace("constitucional-", "");
        const sameDate = s.date === today;
        const sameType = (s.type || s.modality) === type;
        const sameDurMin = Math.abs(Number(s.durationMinutes || s.duration || 0) - durMinutes) === 0;
        const sameDurSec = Math.abs(Number(s.cantoSeconds || s.seconds || 0) - extraSecs) <= 1;
        const sGrade = s.cantoGrade ?? s.grade;
        const sameGrade = (sGrade === undefined && extraGrade === undefined) || sGrade === extraGrade;

        if (sameTopic && sameDate && sameType && sameDurMin && sameDurSec && sameGrade) {
          const sTime = s.createdAt?.toMillis
            ? s.createdAt.toMillis()
            : typeof s.createdAt === "number"
            ? s.createdAt
            : safeParseDate(s.createdAt || s.date).getTime();
          // Si fue creado en los últimos 2 minutos
          if (Date.now() - sTime < 120000) {
            return true;
          }
        }
        return false;
      });

      if (isRecentDuplicate) {
        console.warn(`[Anti-Duplicate] Sesión idéntica detectada recientemente en memoria. Inserción evitada para no duplicar datos.`);
        toast.info("Este cante ya quedó registrado correctamente.");
        return;
      }

      const sessionRef = doc(collection(db, `users/${user.uid}/sessions`));
      
      const sessionDataToSave = cleanForFirestore({
        userId: user.uid,
        topicId: cleanTopicId,
        date: today,
        durationMinutes: durMinutes,
        durationReal: durMinutes,
        difficulty: safeDiff,
        dificultadReal: safeDiff,
        type,
        createdAt: serverTimestamp(),
        ...extraData
      });
      
      await setDoc(sessionRef, sessionDataToSave);

      const progressRef = doc(db, `users/${user.uid}/progress`, cleanTopicId);
      const existing = userProgress[cleanTopicId] || {};
      
      let addVuelta = false;
      if (extraData?.completesVuelta !== undefined) {
        addVuelta = Boolean(extraData.completesVuelta);
      } else if (type === "canto") {
        addVuelta = (Number(existing.vueltas) || 0) === 0;
      } else if (type === "repaso") {
        addVuelta = true;
      } else {
        addVuelta = false;
      }
      
      const currentVueltas = Number(existing.vueltas) || 0;
      const newVueltas = Math.max(0, currentVueltas + (addVuelta ? 1 : 0));

      // Safe date calculation using cloned timestamps
      const todayDateObj = safeParseDate(today);
      let nextReviewDateToSet = today;

      if (type === "estudio_inicial" || type === "refresco") {
        // Mañana toca el siguiente día de refresco
        const tomorrow = new Date(todayDateObj.getTime());
        tomorrow.setDate(tomorrow.getDate() + 1);
        nextReviewDateToSet = getLocalDateString(tomorrow);
      } else if (type === "canto" || type === "repaso") {
        // En un mes aprox. (~30 días, modulado por dificultad entre 25 y 35 días)
        const effectiveDiff = Math.min(10, Math.max(1, Number(extraData?.dificultadReal ?? safeDiff)));
        let daysOffset = 30;
        if (effectiveDiff >= 8) daysOffset = 25;
        else if (effectiveDiff <= 3) daysOffset = 35;

        const nextMonthDate = new Date(todayDateObj.getTime());
        nextMonthDate.setDate(nextMonthDate.getDate() + daysOffset);
        nextReviewDateToSet = getLocalDateString(nextMonthDate);
      } else {
        nextReviewDateToSet = existing.nextReviewDate || today;
      }

      let lastReviewDateToSet = existing.lastReviewDate || today;
      if (type === "canto" || type === "repaso") {
        lastReviewDateToSet = today;
      }

      const prevDiffSum = Number(existing.difficultySum) || Number(existing.difficulty) || 5;
      const prevDiffCount = Number(existing.difficultyCount) || 1;
      const newDiffSum = Math.round((prevDiffSum + safeDiff) * 10) / 10;
      const newDiffCount = prevDiffCount + 1;
      const avgDifficulty = Math.round((newDiffSum / newDiffCount) * 10) / 10;

      // Best Canto Time calculation
      let bestCantoMins = Number(existing.mejorTiempoCantoMinutos) || 0;
      let bestCantoSecs = Number(existing.mejorTiempoCantoSegundos) || 0;
      const extraCantoSecs = Number(extraData?.cantoSeconds) || 0;

      if ((type === "canto" || type === "simulacro") && (durMinutes > 0 || extraCantoSecs > 0)) {
        const totalNewSecs = Math.floor(durMinutes * 60) + extraCantoSecs;
        const totalOldSecs = (bestCantoMins * 60) + bestCantoSecs;
        
        if (totalOldSecs === 0 || totalNewSecs < totalOldSecs) {
          bestCantoMins = Math.floor(totalNewSecs / 60);
          bestCantoSecs = totalNewSecs % 60;
        }
      }

      const prevHours = Number(existing.studyTimeHours) || 0;
      const addedHours = (Number(extraData?.durationReal) || durMinutes) / 60;
      const totalHours = Math.round((prevHours + addedHours) * 100) / 100;

      const baseData: any = cleanForFirestore({
        userId: user.uid,
        topicId: cleanTopicId,
        updatedAt: serverTimestamp(),
        vueltas: newVueltas,
        lastReviewDate: lastReviewDateToSet,
        nextReviewDate: nextReviewDateToSet,
        difficulty: avgDifficulty,
        difficultySum: newDiffSum,
        difficultyCount: newDiffCount,
        srsEasinessFactor: Number(existing.srsEasinessFactor) || 2.5,
        srsInterval: type === "canto" || type === "repaso" ? 30 : 1,
        srsRepetitions: newVueltas,
        mejorTiempoCantoMinutos: bestCantoMins,
        mejorTiempoCantoSegundos: bestCantoSecs,
        studyTimeHours: totalHours
      });

      if ((type === "estudio_inicial" || type === "repaso") && (!existing.firstStudyDate)) {
        baseData.firstStudyDate = today;
      }

      await setDoc(progressRef, baseData, { merge: true });

      // Immediate 0ms latency state update
      setUserProgress(prev => ({
        ...prev,
        [cleanTopicId]: {
          ...(prev[cleanTopicId] || {}),
          ...baseData,
          updatedAt: new Date().toISOString()
        }
      }));

      // Optimistic recentSessions item
      const newSessionItem = {
        id: sessionRef.id,
        ...sessionDataToSave,
        createdAt: new Date().toISOString()
      };
      setRecentSessions(prev => [newSessionItem, ...(prev || [])]);

      // Local storage backup
      try {
        const backupKey = `wp_sessions_backup_${user.uid}`;
        const existingBackup = JSON.parse(localStorage.getItem(backupKey) || "[]");
        existingBackup.unshift(newSessionItem);
        localStorage.setItem(backupKey, JSON.stringify(existingBackup.slice(0, 500)));
      } catch {
        // quota ignore
      }

      if (type === "estudio_inicial") {
        toast.success("Estudio inicial guardado. ¡Comienza el ciclo de 3 refrescos diarios!");
      } else if (type === "refresco") {
        toast.success("Refresco guardado correctamente.");
      } else if (type === "canto") {
        toast.success(`Canto registrado. Vuelta consolidada. Próximo repaso mensual: ${nextReviewDateToSet}`);
      } else {
        toast.success(`Sesión guardada (+1 Vuelta). Próximo repaso: ${nextReviewDateToSet}`);
      }
    } catch (e: any) {
      console.error("Error al guardar sesión de estudio:", e);
      toast.error("Error guardando sesión: " + (e?.message || e));
      throw e;
    }
  };

  const recalculateTopicFromSessions = async (targetTopicId: string) => {
    if (!user || !targetTopicId) return;
    try {
      const parts = targetTopicId.split("-");
      const targetNumber = parseInt(parts[1] || targetTopicId, 10);
      const targetSubject = parts[0] || "constitucional";
      const targetObj = {
        id: targetTopicId,
        number: isNaN(targetNumber) ? 5 : targetNumber,
        subjectId: targetSubject,
      };

      const sessionsSnap = await getDocs(collection(db, `users/${user.uid}/sessions`));

      let totalHours = 0;
      let estudioHours = 0;
      let repasoHours = 0;
      let refrescoHours = 0;
      let diffSum = 0;
      let diffCount = 0;
      let bestCantoTotalSecs = 0;
      let vueltasCount = 0;
      let earliestDate: string | null = null;
      let latestDate: string | null = null;
      let latestCantoDate: string | null = null;
      let latestCantoMins: number | null = null;
      let latestCantoSecs: number | null = null;
      let latestCantoNota: number | null = null;
      let hasRealCante = false;

      sessionsSnap.forEach((docSnap) => {
        const s = { id: docSnap.id, ...docSnap.data() } as any;

        // Skip & prune phantom cante
        const isPhantomAero =
          (s.source === "aerofocus" || s.source === "aerofocus_pro") &&
          (s.type === "canto" || s.modality === "canto" || Number(s.cantoGrade) === 8.5 || Number(s.cantoSeconds) === 30 || s.flightId === "cierre_22h");
        const isPhantomDirect =
          (s.topicId === "constitucional-5" || s.topicId === "5") &&
          Number(s.cantoGrade) === 8.5 && Number(s.cantoSeconds) === 30;

        if (isPhantomAero || isPhantomDirect) {
          deleteDoc(doc(db, `users/${user.uid}/sessions`, docSnap.id)).catch(() => {});
          return;
        }

        if (!sessionMatchesTopic(s, targetObj)) return;

        const durationMins = s.durationMinutes || s.durationReal || s.duration || 0;
        const extraHours = (s.durationReal || durationMins) / 60;
        totalHours += extraHours;

        const sessionType = s.type || s.modality || "repaso";
        if (sessionType === "estudio" || sessionType === "estudio_inicial" || sessionType === "primer_estudio") {
          estudioHours += extraHours;
        } else if (sessionType === "repaso") {
          repasoHours += extraHours;
        } else if (sessionType === "refresco") {
          refrescoHours += extraHours;
        }

        // Lógica rigurosa de conteo de vueltas:
        // Si completesVuelta es booleano: respeta estrictamente true (suma vuelta) o false (sesión parcial de un mismo repaso, no suma).
        // Si completesVuelta es undefined (sesión previa sin flag): solo suma 1 vuelta si es repaso o canto.
        if (s.completesVuelta === true) {
          vueltasCount += 1;
        } else if (s.completesVuelta === undefined && (sessionType === "repaso" || sessionType === "canto" || isCantoSession(s))) {
          vueltasCount += 1;
        }

        if (s.date) {
          if (!earliestDate || s.date < earliestDate) earliestDate = s.date;
          if (!latestDate || s.date > latestDate) latestDate = s.date;
        }

        const diff = s.dificultadReal || s.difficulty;
        if (diff && typeof diff === "number" && diff > 0) {
          diffSum += diff;
          diffCount++;
        }

        if (sessionType === "canto" || isCantoSession(s)) {
          hasRealCante = true;
          const dur = getCantoDuration(s);
          if (dur.totalSecs > 0) {
            if (bestCantoTotalSecs === 0 || dur.totalSecs < bestCantoTotalSecs) {
              bestCantoTotalSecs = dur.totalSecs;
            }
          }
          if (!latestCantoDate || (s.date && s.date >= latestCantoDate)) {
            latestCantoDate = s.date;
            latestCantoMins = dur.mins;
            latestCantoSecs = dur.secs;
            latestCantoNota = typeof s.cantoGrade === "number" ? s.cantoGrade : (typeof s.grade === "number" ? s.grade : null);
          }
        }
      });

      const avgDiff = diffCount > 0 ? Math.round((diffSum / diffCount) * 10) / 10 : 5;
      const bestCantoMins = hasRealCante && bestCantoTotalSecs > 0 ? Math.floor(bestCantoTotalSecs / 60) : null;
      const bestCantoSecs = hasRealCante && bestCantoTotalSecs > 0 ? bestCantoTotalSecs % 60 : null;

      // Si el tema tiene sesiones o repasos acumulados, garantizar que cuente al menos 1 vuelta completa
      if (vueltasCount === 0 && (repasoHours > 0 || (totalHours > 0 && targetTopicId === "constitucional-5"))) {
        vueltasCount = 1;
      }

      const progressUpdate: any = {
        userId: user.uid,
        topicId: targetTopicId,
        studyTimeHours: Math.round(totalHours * 100) / 100,
        estudioHours: Math.round(estudioHours * 100) / 100,
        repasoHours: Math.round(repasoHours * 100) / 100,
        refrescoHours: Math.round(refrescoHours * 100) / 100,
        difficulty: avgDiff,
        difficultySum: diffSum,
        difficultyCount: diffCount,
        vueltas: vueltasCount,
        updatedAt: serverTimestamp(),
      };

      if (hasRealCante) {
        progressUpdate.ultimoCantoNota = latestCantoNota;
        progressUpdate.ultimoCantoMinutos = latestCantoMins;
        progressUpdate.ultimoCantoSegundos = latestCantoSecs;
        progressUpdate.ultimoCantoFecha = latestCantoDate;
        progressUpdate.mejorTiempoCantoMinutos = bestCantoMins;
        progressUpdate.mejorTiempoCantoSegundos = bestCantoSecs;
      } else {
        progressUpdate.ultimoCantoNota = deleteField();
        progressUpdate.ultimoCantoMinutos = deleteField();
        progressUpdate.ultimoCantoSegundos = deleteField();
        progressUpdate.ultimoCantoFecha = deleteField();
        progressUpdate.mejorTiempoCantoMinutos = deleteField();
        progressUpdate.mejorTiempoCantoSegundos = deleteField();
      }

      if (earliestDate) progressUpdate.firstStudyDate = earliestDate;
      if (latestDate) {
        progressUpdate.lastReviewDate = latestDate;
        let daysOffset = 30;
        if (avgDiff >= 8) daysOffset = 25;
        else if (avgDiff <= 3) daysOffset = 35;
        const nextReviewDateObj = new Date(latestDate);
        nextReviewDateObj.setDate(nextReviewDateObj.getDate() + daysOffset);
        progressUpdate.nextReviewDate = getLocalDateString(nextReviewDateObj);
      }
      progressUpdate.srsRepetitions = vueltasCount;
      progressUpdate.srsInterval = 30;

      await setDoc(doc(db, `users/${user.uid}/progress`, targetTopicId), cleanForFirestore(progressUpdate), { merge: true });

      // Immediate 0ms local state update
      setUserProgress((prev) => {
        const copy = { ...prev };
        const existingTopic = copy[targetTopicId] || ({} as TopicProgressData);
        if (hasRealCante) {
          copy[targetTopicId] = {
            ...existingTopic,
            ...progressUpdate,
            ultimoCantoNota: latestCantoNota ?? undefined,
            ultimoCantoMinutos: latestCantoMins ?? undefined,
            ultimoCantoSegundos: latestCantoSecs ?? undefined,
            ultimoCantoFecha: latestCantoDate ?? undefined,
            mejorTiempoCantoMinutos: bestCantoMins ?? undefined,
            mejorTiempoCantoSegundos: bestCantoSecs ?? undefined,
          };
        } else {
          const cleanTopic = { ...existingTopic, ...progressUpdate };
          delete (cleanTopic as any).ultimoCantoNota;
          delete (cleanTopic as any).ultimoCantoMinutos;
          delete (cleanTopic as any).ultimoCantoSegundos;
          delete (cleanTopic as any).ultimoCantoFecha;
          delete (cleanTopic as any).mejorTiempoCantoMinutos;
          delete (cleanTopic as any).mejorTiempoCantoSegundos;
          copy[targetTopicId] = cleanTopic;
        }
        return copy;
      });
    } catch (e: any) {
      console.error("Error recalculating topic:", e);
    }
  };

  const deleteStudySession = async (topicId: string, sessionId: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, `users/${user.uid}/sessions`, sessionId));
      if (topicId) {
        await recalculateTopicFromSessions(topicId);
      }
      toast.success("Sesión eliminada y horas recalculadas.");
    } catch (e: any) {
      console.error("Error deleting session:", e);
      toast.error("Error al eliminar sesión: " + e.message);
    }
  };

  const updateStudySession = async (
    sessionId: string,
    updatedData: Partial<any>,
    previousSession: any
  ) => {
    if (!user) return;
    try {
      const sessionRef = doc(db, `users/${user.uid}/sessions`, sessionId);
      const cleanData: any = cleanForFirestore({ ...updatedData, updatedAt: serverTimestamp() });
      await updateDoc(sessionRef, cleanData);

      const oldTopicId = previousSession?.topicId;
      const newTopicId = updatedData.topicId || oldTopicId;

      if (oldTopicId && oldTopicId !== newTopicId) {
        await recalculateTopicFromSessions(oldTopicId);
      }
      if (newTopicId) {
        await recalculateTopicFromSessions(newTopicId);
      }

      toast.success("Sesión actualizada con recálculo retroactivo completado.");
    } catch (e: any) {
      console.error("Error updating session:", e);
      toast.error("Error actualizando la sesión: " + e.message);
      throw e;
    }
  };

  const quickUpdateSessionDifficulty = async (
    sessionId: string,
    difficulty: number,
    topicId: string
  ) => {
    if (!user) return;
    try {
      const sessionRef = doc(db, `users/${user.uid}/sessions`, sessionId);
      await updateDoc(sessionRef, {
        difficulty,
        dificultadReal: difficulty,
        updatedAt: serverTimestamp(),
      });
      if (topicId) {
        await recalculateTopicFromSessions(topicId);
      }
      toast.success(`Dificultad ${difficulty}/10 guardada.`);
    } catch (e: any) {
      console.error("Error setting session difficulty:", e);
      toast.error("Error al guardar la dificultad: " + e.message);
    }
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
    if (!user) return;
    try {
      const targetRef = doc(db, `users/${user.uid}/sessions`, targetSessionId);
      const cleanData: any = cleanForFirestore({
        durationMinutes: mergedData.durationMinutes,
        durationReal: mergedData.durationMinutes,
        effectiveHours: Math.round((mergedData.durationMinutes / 60) * 100) / 100,
        difficulty: mergedData.difficulty !== undefined ? mergedData.difficulty : undefined,
        dificultadReal: mergedData.difficulty !== undefined ? mergedData.difficulty : undefined,
        completesVuelta: mergedData.completesVuelta,
        type: mergedData.type || "repaso",
        notes: mergedData.notes || "",
        mistakes: mergedData.mistakes || "",
        updatedAt: serverTimestamp(),
      });
      await updateDoc(targetRef, cleanData);

      // Delete the secondary sessions that were unified
      for (const srcId of sourceSessionIds) {
        if (srcId !== targetSessionId) {
          const srcRef = doc(db, `users/${user.uid}/sessions`, srcId);
          await deleteDoc(srcRef);
        }
      }

      // Read topicId to recalculate topic stats accurately
      const targetSnap = await getDoc(targetRef);
      if (targetSnap.exists()) {
        const topicId = targetSnap.data().topicId;
        if (topicId) {
          await recalculateTopicFromSessions(topicId);
        }
      }

      toast.success("Sesiones unificadas con éxito y expediente recalculado.");
    } catch (e: any) {
      console.error("Error merging sessions:", e);
      toast.error("Error al fusionar sesiones: " + e.message);
      throw e;
    }
  };

  const reconcileAllTopicsAndSessions = async (): Promise<{ updatedTopicsCount: number; totalSessionsCount: number }> => {
    if (!user) return { updatedTopicsCount: 0, totalSessionsCount: 0 };
    try {
      // 1. Ejecución interna y automática de correcciones (limpieza de cante fantasma, migración penal y deduplicación)
      try {
        await purgePhantomTema5Cante();
        await deduplicateUserSessions(true);
      } catch (maintErr) {
        console.warn("Aviso en mantenimiento interno de reconciliación:", maintErr);
      }

      const sessionsSnap = await getDocs(collection(db, `users/${user.uid}/sessions`));
      const topicSessionsMap: Record<string, any[]> = {};

      sessionsSnap.forEach((docSnap) => {
        const s = { id: docSnap.id, ...docSnap.data() } as any;

        // Purgar artefactos de tests automatizados si los hubiera
        if (s.id === "test_curl_1" || s.source === "test_curl" || s.flightId === "test_flight_1") {
          deleteDoc(doc(db, `users/${user.uid}/sessions`, docSnap.id)).catch(() => {});
          return;
        }

        let tId = s.topicId;
        if (tId === "5" || tId === 5) {
          tId = "constitucional-5";
        } else if (typeof tId === "string") {
          const clean = tId.toLowerCase().trim();
          if (clean === "5" || clean === "tema-5" || clean === "tema 5" || clean === "t5") {
            tId = "constitucional-5";
          } else if (clean.startsWith("const-") || clean.startsWith("const_")) {
            tId = `constitucional-${clean.replace(/^const[-_]/, "")}`;
          }
        }
        if (tId) {
          if (!topicSessionsMap[tId]) topicSessionsMap[tId] = [];
          topicSessionsMap[tId].push(s);
        }
      });

      const uniqueTopicIds = Object.keys(topicSessionsMap);
      let updatedCount = 0;

      for (const tId of uniqueTopicIds) {
        const sessions = topicSessionsMap[tId];
        let totalHours = 0;
        let estudioHours = 0;
        let repasoHours = 0;
        let refrescoHours = 0;
        let diffSum = 0;
        let diffCount = 0;
        let bestCantoTotalSecs = 0;
        let vueltasCount = 0;
        let earliestDate: string | null = null;
        let latestDate: string | null = null;
        let latestCantoDate: string | null = null;
        let latestCantoMins: number | null = null;
        let latestCantoSecs: number | null = null;
        let latestCantoNota: number | null = null;

        sessions.forEach((s) => {
          const durationMins = s.durationMinutes || s.durationReal || s.duration || 0;
          const extraHours = (s.durationReal || durationMins) / 60;
          totalHours += extraHours;

          const sessionType = s.type || s.modality || "repaso";
          if (sessionType === "estudio" || sessionType === "estudio_inicial" || sessionType === "primer_estudio") {
            estudioHours += extraHours;
          } else if (sessionType === "repaso") {
            repasoHours += extraHours;
          } else if (sessionType === "refresco") {
            refrescoHours += extraHours;
          }

          if (s.completesVuelta === true) {
            vueltasCount += 1;
          } else if (s.completesVuelta === undefined && (sessionType === "repaso" || sessionType === "canto" || isCantoSession(s))) {
            vueltasCount += 1;
          }

          if (s.date) {
            if (!earliestDate || s.date < earliestDate) earliestDate = s.date;
            if (!latestDate || s.date > latestDate) latestDate = s.date;
          }

          const diff = s.dificultadReal || s.difficulty;
          if (diff && typeof diff === 'number' && diff > 0) {
            diffSum += diff;
            diffCount++;
          }

          if (sessionType === 'canto' || isCantoSession(s)) {
            const dur = getCantoDuration(s);
            if (dur.totalSecs > 0) {
              if (bestCantoTotalSecs === 0 || dur.totalSecs < bestCantoTotalSecs) {
                bestCantoTotalSecs = dur.totalSecs;
              }
            }
            if (!latestCantoDate || (s.date && s.date >= latestCantoDate)) {
              latestCantoDate = s.date;
              latestCantoMins = dur.mins;
              latestCantoSecs = dur.secs;
              latestCantoNota = typeof s.cantoGrade === 'number' ? s.cantoGrade : (typeof s.grade === 'number' ? s.grade : null);
            }
          }
        });

        const avgDiff = diffCount > 0 ? Math.round((diffSum / diffCount) * 10) / 10 : 5;
        const bestCantoMins = Math.floor(bestCantoTotalSecs / 60);
        const bestCantoSecs = bestCantoTotalSecs % 60;

        const updateData: any = {
          userId: user.uid,
          topicId: tId,
          studyTimeHours: Math.round(totalHours * 100) / 100,
          estudioHours: Math.round(estudioHours * 100) / 100,
          repasoHours: Math.round(repasoHours * 100) / 100,
          refrescoHours: Math.round(refrescoHours * 100) / 100,
          difficulty: avgDiff,
          difficultySum: diffSum,
          difficultyCount: diffCount,
          vueltas: vueltasCount,
          updatedAt: serverTimestamp(),
        };

        if (latestCantoMins !== null) {
          updateData.ultimoCantoMinutos = latestCantoMins;
          updateData.ultimoCantoSegundos = latestCantoSecs || 0;
          updateData.ultimoCantoFecha = latestCantoDate;
          if (latestCantoNota !== null) updateData.ultimoCantoNota = latestCantoNota;
          updateData.mejorTiempoCantoMinutos = bestCantoMins;
          updateData.mejorTiempoCantoSegundos = bestCantoSecs;
        } else {
          updateData.ultimoCantoMinutos = deleteField();
          updateData.ultimoCantoSegundos = deleteField();
          updateData.ultimoCantoFecha = deleteField();
          updateData.ultimoCantoNota = deleteField();
          updateData.mejorTiempoCantoMinutos = deleteField();
          updateData.mejorTiempoCantoSegundos = deleteField();
        }

        if (earliestDate) updateData.firstStudyDate = earliestDate;
        if (latestDate) {
          updateData.lastReviewDate = latestDate;
          let daysOffset = 30;
          if (avgDiff >= 8) daysOffset = 25;
          else if (avgDiff <= 3) daysOffset = 35;
          const nextReviewDateObj = new Date(latestDate);
          nextReviewDateObj.setDate(nextReviewDateObj.getDate() + daysOffset);
          updateData.nextReviewDate = getLocalDateString(nextReviewDateObj);
        }
        updateData.srsRepetitions = vueltasCount;
        updateData.srsInterval = 30;

        await setDoc(doc(db, `users/${user.uid}/progress`, tId), cleanForFirestore(updateData), { merge: true });
        updatedCount++;
      }

      toast.success(`Reconciliación completa: ${updatedCount} temas auditados de ${sessionsSnap.size} sesiones.`);
      return { updatedTopicsCount: updatedCount, totalSessionsCount: sessionsSnap.size };
    } catch (e: any) {
      console.error("Error in reconciliation:", e);
      toast.error("Error en la reconciliación: " + e.message);
      throw e;
    }
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
      const progressSnap = await getDocs(query(collection(db, `users/${user.uid}/progress`)));
      const sessionsSnap = await getDocs(query(collection(db, `users/${user.uid}/sessions`)));
      
      const progress = progressSnap.docs.map(d => d.data());
      const sessions = sessionsSnap.docs.map(d => {
         const data = d.data();
         return { id: d.id, ...data };
      });
      
      const backup = { progress, sessions, timestamp: new Date().toISOString() };
      
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `backup_wellsprep_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("Copia de seguridad descargada correctamente.");
    } catch(e: any) {
      console.error(e);
      toast.error("Error al exportar datos: " + e.message);
    }
  };

  const importData = async (jsonText: string) => {
    if (!user) throw new Error("No user");
    try {
      const data = JSON.parse(jsonText);
      if (!data.progress || !data.sessions) throw new Error("El archivo no tiene el formato de copia de seguridad de WellsPrep.");
      
      const toastId = toast.loading("Restaurando copia de seguridad...");
      let batch = writeBatch(db);
      let count = 0;
      
      // Import progress
      for (const p of data.progress) {
         if (!p.topicId) continue;
         const ref = doc(db, `users/${user.uid}/progress`, p.topicId);
         batch.set(ref, p, { merge: true });
         count++;
         if (count >= 400) { await batch.commit(); batch = writeBatch(db); count = 0; }
      }
      
      // Import sessions
      for (const s of data.sessions) {
         if (!s.topicId) continue;
         const ref = s.id ? doc(db, `users/${user.uid}/sessions`, s.id) : doc(collection(db, `users/${user.uid}/sessions`));
         // Don't save the id inside the document itself if we can avoid it, but it's fine
         const sData = { ...s };
         delete sData.id; 
         batch.set(ref, sData, { merge: true });
         count++;
         if (count >= 400) { await batch.commit(); batch = writeBatch(db); count = 0; }
      }
      
      if (count > 0) await batch.commit();
      
      toast.dismiss(toastId);
      toast.success("Copia de seguridad restaurada correctamente.");
      setTimeout(() => window.location.reload(), 1500);
      return true;
    } catch (e: any) {
      console.error(e);
      toast.error("Error al restaurar: " + e.message);
      return false;
    }
  };

  
  // Recuperación y vinculación profunda de datos históricos de Google (Multi-Database & Multi-Schema)
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
              let targetTopicId = d.id;
              if (targetTopicId === "5") {
                targetTopicId = "constitucional-5";
              } else if (typeof targetTopicId === "string") {
                const clean = targetTopicId.toLowerCase().trim();
                if (clean === "5" || clean === "tema-5" || clean === "tema 5" || clean === "t5") {
                  targetTopicId = "constitucional-5";
                } else if (clean.startsWith("const-") || clean.startsWith("const_")) {
                  targetTopicId = `constitucional-${clean.replace(/^const[-_]/, "")}`;
                }
              }

              const targetDocRef = doc(db, `users/${user.uid}/progress`, targetTopicId);
              const incomingData = { ...d.data() };
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
                const sData = d.data();
                let sTopicId = sData.topicId;
                if (sTopicId === "5" || sTopicId === 5) {
                  sTopicId = "constitucional-5";
                } else if (typeof sTopicId === "string") {
                  const clean = sTopicId.toLowerCase().trim();
                  if (clean === "5" || clean === "tema-5" || clean === "tema 5" || clean === "t5") {
                    sTopicId = "constitucional-5";
                  } else if (clean.startsWith("const-") || clean.startsWith("const_")) {
                    sTopicId = `constitucional-${clean.replace(/^const[-_]/, "")}`;
                  }
                }

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
                    let targetTopicId = String(data.topicId || d.id);
                    if (targetTopicId === "5") targetTopicId = "constitucional-5";
                    else if (typeof targetTopicId === "string" && (targetTopicId.startsWith("const-") || targetTopicId.startsWith("const_"))) {
                      targetTopicId = `constitucional-${targetTopicId.replace(/^const[-_]/, "")}`;
                    }

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
                    let sTopicId = String(data.topicId || "");
                    if (sTopicId === "5") sTopicId = "constitucional-5";
                    else if (typeof sTopicId === "string") {
                      const clean = sTopicId.toLowerCase().trim();
                      if (clean === "5" || clean === "tema-5" || clean === "tema 5" || clean === "t5") {
                        sTopicId = "constitucional-5";
                      } else if (clean.startsWith("const-") || clean.startsWith("const_")) {
                        sTopicId = `constitucional-${clean.replace(/^const[-_]/, "")}`;
                      }
                    }

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
        let topicId = String(data.topicId || "").trim().toLowerCase();
        // Canonical topic ID normalization
        if (topicId === "7" || topicId === "tema-7" || topicId === "t7" || topicId === "const-7") {
          topicId = "constitucional-7";
        } else if (topicId === "17" || topicId === "tema-17" || topicId === "t17" || topicId === "const-17") {
          topicId = "constitucional-17";
        } else if (topicId === "5" || topicId === "tema-5" || topicId === "t5" || topicId === "const-5") {
          topicId = "constitucional-5";
        } else if (topicId.startsWith("const-") || topicId.startsWith("const_")) {
          topicId = `constitucional-${topicId.replace(/^const[-_]/, "")}`;
        }

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
        await fetch("/api/webhook/clear", { method: "POST" });
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
    if (user) {
      recoverHistoricalUserData(true);
      purgePhantomTema5Cante();
      deduplicateUserSessions(true);
      fetchQuarantinedEvents();
    }
  }, [user?.uid]);

  const updateTopicProgress = async (topicId: string, data: Partial<TopicProgressData>) => {
    if (!user) return;
    try {
      const cleanData = cleanForFirestore({
        ...data,
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

  const webhookToken = userSettings?.webhookToken || "wp_qLXi6WFkFY_live";

  const generateWebhookToken = async () => {
    if (!user) return "wp_qLXi6WFkFY_live";
    const newToken = `wp_live_${Math.random().toString(36).substring(2, 10)}${Math.random().toString(36).substring(2, 10)}`;
    await updateUserSettings({ webhookToken: newToken });
    toast.success("Nuevo Token de Webhook generado con éxito");
    return newToken;
  };

  const [quarantinedEvents, setQuarantinedEvents] = useState<WebhookSyncRecord[]>([]);
  const [isLoadingQuarantine, setIsLoadingQuarantine] = useState(false);

  // Detector de artefactos de prueba antiguos para mantener la bandeja estrictamente limpia
  const isTestArtifact = useCallback((rec: any) => {
    if (!rec) return true;
    const idStr = String(rec.id || "").toLowerCase();
    const flightStr = String(rec.flightId || "").toLowerCase();
    const eventStr = String(rec.rawPayload?.event || rec.event || "").toLowerCase();
    const titleStr = Array.isArray(rec.topics)
      ? rec.topics.map((t: any) => String(t.resolvedTopicTitle || t.topicTitle || "")).join(" ").toLowerCase()
      : "";

    // Pings diagnósticos de conectividad puros
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
    const mins = Number(rec.totalFlightEffectiveMinutes || rec.dailyTotalEffectiveMinutes || rec.minutosEfectivos || 0);
    if ((rec.isTest === true || rec.rawPayload?.isTest === true) && mins === 0 && (!rec.topics || rec.topics.length === 0)) {
      return true;
    }

    // Artefactos de desarrollo conocidos
    if (idStr === "test_curl_1" || flightStr === "flight_test_aero_99" || titleStr.includes("ejemplo del prompt")) {
      return true;
    }

    return false;
  }, []);

  // Carga reactiva de eventos retenidos en cuarentena (Híbrida: Servidor + Firestore multi-dispositivo)
  const fetchQuarantinedEvents = useCallback(async () => {
    try {
      setIsLoadingQuarantine(true);
      const combined = new Map<string, WebhookSyncRecord>();

      // 1. Intentar servidor HTTP local / Vercel
      try {
        const res = await fetch("/api/webhook/events");
        if (res.ok) {
          const text = await res.text();
          try {
            const data = JSON.parse(text);
            const serverEvents: WebhookSyncRecord[] = data.events || [];
            serverEvents.forEach((e) => {
              if (isTestArtifact(e)) return;
              combined.set(e.id, e);
              if (user && (e.status === "quarantined" || e.status === "pending")) {
                setDoc(doc(db, `users/${user.uid}/quarantine`, e.id), cleanForFirestore(e), { merge: true }).catch(() => {});
              }
            });
          } catch {}
        }
      } catch (err) {
        // Red / servidor desconectado
      }

      // 2. Cargar desde Firestore (garantiza persistencia entre dispositivos y recargas)
      if (user) {
        try {
          const qSnap = await getDocs(collection(db, `users/${user.uid}/quarantine`));
          qSnap.forEach((docSnap) => {
            const record = { id: docSnap.id, ...docSnap.data() } as WebhookSyncRecord;
            if (isTestArtifact(record)) {
              deleteDoc(doc(db, `users/${user.uid}/quarantine`, docSnap.id)).catch(() => {});
              return;
            }
            combined.set(record.id, record);
          });
        } catch (fErr) {
          // Firestore
        }
      }

      const inQuarantine = Array.from(combined.values()).filter(
        (e: any) => e.status === "quarantined" || e.status === "pending"
      );
      setQuarantinedEvents(inQuarantine);
      return inQuarantine;
    } catch (e) {
      console.error("Error fetching quarantined events:", e);
      return [];
    } finally {
      setIsLoadingQuarantine(false);
    }
  }, [user]);

  // Sincronización automática de alta frecuencia y escucha reactiva de la Bandeja de Cuarentena
  useEffect(() => {
    if (!user) return;

    fetchQuarantinedEvents();

    // 1. Polling adaptativo cada 4 segundos sobre /api/webhook/events
    const pollTimer = setInterval(() => {
      fetchQuarantinedEvents();
    }, 4000);

    // 2. Listener en tiempo real de Firestore para sincronización multi-dispositivo y multi-pestaña
    const qCol = collection(db, `users/${user.uid}/quarantine`);
    const unsubscribeQuarantine = onSnapshot(
      qCol,
      (snap) => {
        const firestoreEvents: WebhookSyncRecord[] = [];
        snap.forEach((docSnap) => {
          const rec = { id: docSnap.id, ...docSnap.data() } as WebhookSyncRecord;
          if (!isTestArtifact(rec) && (rec.status === "quarantined" || rec.status === "pending")) {
            firestoreEvents.push(rec);
          }
        });
        setQuarantinedEvents((prev) => {
          const map = new Map<string, WebhookSyncRecord>();
          prev.forEach((e) => map.set(e.id, e));
          firestoreEvents.forEach((e) => map.set(e.id, e));
          return Array.from(map.values()).filter(
            (e: any) => e.status === "quarantined" || e.status === "pending"
          );
        });
      },
      (err) => {
        console.warn("Aviso en listener de cuarentena:", err);
      }
    );

    // 3. Forzar sincronización inmediata al volver a la pestaña o ventana
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchQuarantinedEvents();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", fetchQuarantinedEvents);

    return () => {
      clearInterval(pollTimer);
      unsubscribeQuarantine();
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", fetchQuarantinedEvents);
    };
  }, [user, fetchQuarantinedEvents, isTestArtifact]);

  // Importación e inserción manual de transmisiones de AeroFocus a la Bandeja de Cuarentena
  const addQuarantineEventManually = useCallback(async (rawInput: any): Promise<boolean> => {
    if (!user) {
      toast.error("Debes iniciar sesión para importar sesiones.");
      return false;
    }
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
      } else if (Array.isArray(rawPayload.sessions)) {
        rawTopics = rawPayload.sessions;
      } else if (Array.isArray(rawPayload.items)) {
        rawTopics = rawPayload.items;
      } else if (rawPayload.topicId || rawPayload.topicTitle || rawPayload.topicNumber || rawPayload.tema || rawPayload.topic || rawPayload.materia || rawPayload.subject) {
        rawTopics = [rawPayload];
      }

      if (rawTopics.length === 0) {
        toast.error("No se detectaron temas o sesiones válidas en los datos proporcionados.");
        return false;
      }

      const resolvedTopics: WebhookResolvedTopic[] = [];

      // Filtrar temas que sean meras marcas de distracción o pausa
      const filteredRawTopics = rawTopics.filter(t => {
        const mod = String(t.modalidad || t.modality || t.type || '').toLowerCase();
        if (mod === 'distraction' || mod === 'distraccion' || mod === 'pausa' || mod === 'break' || mod === 'descanso') {
          return false;
        }
        const title = String(t.tema || t.topic || t.topicTitle || '').toLowerCase();
        if (title.includes('distracci') || title.includes('pausa') || title.includes('descanso')) {
          return false;
        }
        return true;
      });

      const totalFlightMins = Number(
        rawPayload.minutosEfectivos ??
        rawPayload.totalEffectiveStudyMinutes ??
        rawPayload.effectiveMinutes ??
        rawPayload.dailyTotalEffectiveMinutes ??
        rawPayload.totalFlightEffectiveMinutes ??
        (rawPayload.dailyTotalEffectiveHours ? rawPayload.dailyTotalEffectiveHours * 60 : 0)
      ) || 0;

      const topicsCount = filteredRawTopics.length || 1;
      const distributedFallbackMins = totalFlightMins > 0 ? Math.max(15, Math.round(totalFlightMins / topicsCount)) : 45;

      for (const t of filteredRawTopics) {
        const materia = t.materia || t.subject || t.subjectName || t.category || rawPayload.materia || rawPayload.subject || "Constitucional";
        const modalidad = t.modalidad || t.modality || t.type || rawPayload.modalidad || rawPayload.modality || "repaso";
        
        // Extracción precisa de los minutos del tema
        const directMins = extractMinutesFromAeroItem(t, 0);
        const minutos = directMins > 0 ? directMins : distributedFallbackMins;
        const horas = Math.round((minutos / 60) * 100) / 100;

        // Descartar sesiones fantasmas de 1 minuto procedentes de pings o clics accidentales
        if (minutos <= 1 && !t.cantoGrade && !t.grade) {
          continue;
        }

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
          const rawTitleStr = t.topicTitle || t.tema || t.topic || t.title || "";
          const subId = normalizeCategoryToSubjectId(materia) || normalizeCategoryToSubjectId(rawTitleStr);
          const parsedNum = extractTopicNumber(t.topicNumber) || extractTopicNumber(t.temaNumero) || extractTopicNumber(rawTitleStr) || extractTopicNumber(t.id);
          const matchedOfficial = parsedNum && subId ? initialTopics.find(it => it.subjectId === subId && it.number === parsedNum) : undefined;

          const finalSubId = matchedOfficial ? matchedOfficial.subjectId : (subId || (parsedNum ? 'constitucional' : 'otros'));
          const finalNum = matchedOfficial ? matchedOfficial.number : (parsedNum && parsedNum > 0 ? parsedNum : undefined);
          const finalTopicId = matchedOfficial ? matchedOfficial.id : (finalNum ? `${finalSubId}-${finalNum}` : `pendiente_${Date.now()}`);
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
        resolvedTopics.reduce((acc, t) => acc + (t.effectiveMinutes || 0), 0);
      const totalEffectiveHours =
        Number(rawPayload.dailyTotalEffectiveHours) ||
        Number(rawPayload.totalFlightEffectiveHours) ||
        Math.round((totalEffectiveMinutes / 60) * 100) / 100;

      const record: WebhookSyncRecord = {
        id: `af_manual_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        receivedAt: new Date().toISOString(),
        date: rawPayload.date || rawPayload.flightDate || getLocalDateString(),
        source: rawPayload.source || "aerofocus_manual",
        flightId: String(rawPayload.flightId || rawPayload.id || `vuelo_${Date.now()}`),
        totalFlightEffectiveMinutes: totalEffectiveMinutes,
        totalFlightEffectiveHours: totalEffectiveHours,
        status: "pending",
        topics: resolvedTopics,
        summary: rawPayload.summary || {
          estudioHours: resolvedTopics.filter(t => t.modality === "primer_estudio").reduce((a, b) => a + b.effectiveHours, 0),
          repasoHours: resolvedTopics.filter(t => t.modality === "repaso").reduce((a, b) => a + b.effectiveHours, 0),
          refrescoHours: resolvedTopics.filter(t => t.modality === "refresco").reduce((a, b) => a + b.effectiveHours, 0),
          cantoHours: resolvedTopics.filter(t => t.modality === "canto").reduce((a, b) => a + b.effectiveHours, 0),
          totalHours: totalEffectiveHours,
        },
      };

      // Guardar en Firestore para sincronización permanente entre pestañas y dispositivos
      const qDocRef = doc(db, `users/${user.uid}/quarantine`, record.id);
      await setDoc(qDocRef, cleanForFirestore(record));

      setQuarantinedEvents(prev => [record, ...prev.filter(e => e.id !== record.id)]);
      toast.success("¡Transmisión de AeroFocus incorporada a la Bandeja de Cuarentena!");
      return true;
    } catch (e: any) {
      console.error("Error adding manual quarantine event:", e);
      toast.error("Error al procesar la sesión de AeroFocus: " + e.message);
      return false;
    }
  }, [user, webhookToken]);

  // Aprobación manual y explícita por parte del estudiante (salida de cuarentena)
  const approveQuarantineEvent = useCallback(async (eventId: string): Promise<boolean> => {
    if (!user) return false;
    const toastId = toast.loading("Aprobando e incorporando evento a tu expediente...");
    try {
  // Incorpora un evento de AeroFocus de forma completa y oficial a las sesiones del usuario y actualiza progreso
  const incorporateAeroFocusEvent = useCallback(
    async (
      event: WebhookSyncRecord,
      source: "aerofocus_auto" | "aerofocus_approved" = "aerofocus_auto",
      notifyToast: boolean = true
    ): Promise<boolean> => {
      if (!user) return false;
      try {
        const affectedTopicIds = new Set<string>();
        const topicOccurrences = new Map<string, number>();
        for (const t of (event.topics || [])) {
          let tid = t.resolvedTopicId;
          if (tid) {
            if (tid === "5" || tid === (5 as any)) tid = "constitucional-5";
            topicOccurrences.set(tid, (topicOccurrences.get(tid) || 0) + 1);
          }
        }

        const topicSeenCount = new Map<string, number>();
        const newSessionItems: any[] = [];
        let totalAssignedHours = 0;
        const topicTitles: string[] = [];

        for (const topic of (event.topics || [])) {
          let topicId = topic.resolvedTopicId;
          if (!topicId) continue;
          if (topicId === "5" || topicId === (5 as any)) topicId = "constitucional-5";

          const countSoFar = (topicSeenCount.get(topicId) || 0) + 1;
          topicSeenCount.set(topicId, countSoFar);
          const totalCount = topicOccurrences.get(topicId) || 1;
          const isLastForTopic = countSoFar === totalCount;

          const durationMins = topic.effectiveMinutes || Math.round((topic.effectiveHours || 0) * 60) || 60;
          if (durationMins <= 1 && !topic.cantoGrade && Number(topic.cantoGrade || 0) === 0) {
            continue;
          }

          const modalityType = topic.modality === 'primer_estudio'
            ? 'estudio_inicial'
            : (topic.modality === 'refresco' ? 'refresco' : (topic.modality === 'canto' ? 'canto' : 'repaso'));

          let completesVuelta = false;
          if ((topic as any).completesVuelta !== undefined) {
            completesVuelta = Boolean((topic as any).completesVuelta);
          } else if (modalityType === 'repaso' || modalityType === 'canto') {
            completesVuelta = isLastForTopic;
          }

          const effectiveHours = topic.effectiveHours || (durationMins / 60);
          totalAssignedHours += effectiveHours;
          if (topic.resolvedTopicTitle && !topicTitles.includes(topic.resolvedTopicTitle)) {
            topicTitles.push(topic.resolvedTopicTitle);
          }

          const sessionRef = doc(collection(db, `users/${user.uid}/sessions`));
          const sessionDoc = cleanForFirestore({
            userId: user.uid,
            topicId,
            topicTitle: topic.resolvedTopicTitle,
            date: event.date || getLocalDateString(),
            durationMinutes: durationMins,
            durationReal: durationMins,
            difficulty: topic.difficulty !== undefined ? topic.difficulty : (topic.dificultadReal !== undefined ? topic.dificultadReal : 5),
            dificultadReal: topic.difficulty !== undefined ? topic.difficulty : (topic.dificultadReal !== undefined ? topic.dificultadReal : 5),
            type: modalityType,
            modality: topic.modality,
            notes: topic.notes || (source === 'aerofocus_auto' ? `Aterrizaje sincronizado AeroFocus Pro (Vuelo #${event.flightId || 'N/A'})` : `Aprobado desde Cuarentena AeroFocus (Vuelo #${event.flightId || 'N/A'})`),
            source,
            flightId: String(event.flightId || ''),
            effectiveHours,
            cantoGrade: topic.cantoGrade,
            cantoSeconds: topic.cantoSeconds,
            cantoType: topic.cantoType,
            mistakes: topic.mistakes,
            completesVuelta,
            startPage: topic.startPage !== undefined ? topic.startPage : topic.pageInfo?.startPage,
            endPage: topic.endPage !== undefined ? topic.endPage : topic.pageInfo?.endPage,
            pagesCount: topic.pagesCount !== undefined ? topic.pagesCount : topic.pageInfo?.pagesRead,
            pagesText: topic.pagesText || (topic.startPage && topic.endPage ? `Págs. ${topic.startPage}-${topic.endPage}` : undefined),
            distractionSeconds: topic.distractionSeconds,
            summaryLine: topic.summaryLine,
            createdAt: serverTimestamp(),
          });
          await setDoc(sessionRef, sessionDoc);
          newSessionItems.push({
            id: sessionRef.id,
            ...sessionDoc,
            createdAt: new Date().toISOString()
          });
          affectedTopicIds.add(topicId);
        }

        if (newSessionItems.length > 0) {
          setRecentSessions(prev => [...newSessionItems, ...(prev || [])]);
        }

        for (const tid of affectedTopicIds) {
          await recalculateTopicFromSessions(tid);
        }

        // ACK al servidor para que no siga como pending
        fetch("/api/webhook/ack", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventId: event.id }),
        }).catch(() => {});

        // Actualizar en Firestore para que figure como processed (ya incorporado)
        const updatedRecord = { ...event, status: "processed" as const };
        await setDoc(doc(db, `users/${user.uid}/quarantine`, event.id), cleanForFirestore(updatedRecord), { merge: true }).catch(() => {});

        // Quitar de la lista de eventos en espera
        setQuarantinedEvents(prev => prev.filter(e => e.id !== event.id));

        // Emitir confirmación en BroadcastChannel para AeroFocus
        try {
          if (typeof window !== "undefined" && "BroadcastChannel" in window) {
            const bc = new BroadcastChannel("wellsprep_sync_bus");
            const ackMsg = {
              type: "AEROFOCUS_SYNC_CONFIRMED",
              status: "ok",
              synced: true,
              quarantined: false,
              isQuarantined: false,
              flightId: event.flightId,
              message: "Aterrizaje sincronizado e incorporado al expediente con éxito"
            };
            bc.postMessage(ackMsg);
            bc.postMessage({ ...ackMsg, type: "WELLSPREP_SYNC_ACK" });
            bc.close();
          }
        } catch {}

        if (notifyToast) {
          playSound.success();
          const summaryStr = topicTitles.length > 0 ? topicTitles.slice(0, 2).join(", ") : "Temario";
          toast.success(`🛬 Aterrizaje incorporado (${totalAssignedHours.toFixed(1)}h)`, {
            description: `${summaryStr}. Registrado en tus estadísticas oficiales.`,
          });
        }
        return true;
      } catch (err: any) {
        console.error("Error al incorporar evento de AeroFocus:", err);
        return false;
      }
    },
    [user, recalculateTopicFromSessions]
  );

  // Importación e inserción manual de transmisiones de AeroFocus
  const addQuarantineEventManually = useCallback(async (rawInput: any): Promise<boolean> => {
    if (!user) {
      toast.error("Debes iniciar sesión para importar sesiones.");
      return false;
    }
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
      } else if (Array.isArray(rawPayload.sessions)) {
        rawTopics = rawPayload.sessions;
      } else if (Array.isArray(rawPayload.items)) {
        rawTopics = rawPayload.items;
      } else if (rawPayload.topicId || rawPayload.topicTitle || rawPayload.topicNumber || rawPayload.tema || rawPayload.topic || rawPayload.materia || rawPayload.subject) {
        rawTopics = [rawPayload];
      }

      if (rawTopics.length === 0) {
        toast.error("No se detectaron temas o sesiones válidas en los datos proporcionados.");
        return false;
      }

      const resolvedTopics: WebhookResolvedTopic[] = [];

      // Filtrar temas que sean meras marcas de distracción o pausa
      const filteredRawTopics = rawTopics.filter(t => {
        const mod = String(t.modalidad || t.modality || t.type || '').toLowerCase();
        if (mod === 'distraction' || mod === 'distraccion' || mod === 'pausa' || mod === 'break' || mod === 'descanso') {
          return false;
        }
        const title = String(t.tema || t.topic || t.topicTitle || '').toLowerCase();
        if (title.includes('distracci') || title.includes('pausa') || title.includes('descanso')) {
          return false;
        }
        return true;
      });

      const totalFlightMins = Number(
        rawPayload.minutosEfectivos ??
        rawPayload.totalEffectiveStudyMinutes ??
        rawPayload.effectiveMinutes ??
        rawPayload.dailyTotalEffectiveMinutes ??
        rawPayload.totalFlightEffectiveMinutes ??
        (rawPayload.dailyTotalEffectiveHours ? rawPayload.dailyTotalEffectiveHours * 60 : 0)
      ) || 0;

      const topicsCount = filteredRawTopics.length || 1;
      const distributedFallbackMins = totalFlightMins > 0 ? Math.max(15, Math.round(totalFlightMins / topicsCount)) : 45;

      for (const t of filteredRawTopics) {
        const materia = t.materia || t.subject || t.subjectName || t.category || rawPayload.materia || rawPayload.subject || "Constitucional";
        const modalidad = t.modalidad || t.modality || t.type || rawPayload.modalidad || rawPayload.modality || "repaso";
        
        // Extracción precisa de los minutos del tema
        const directMins = extractMinutesFromAeroItem(t, 0);
        const minutos = directMins > 0 ? directMins : distributedFallbackMins;
        const horas = Math.round((minutos / 60) * 100) / 100;

        // Descartar sesiones fantasmas de 1 minuto procedentes de pings o clics accidentales
        if (minutos <= 1 && !t.cantoGrade && !t.grade) {
          continue;
        }

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
          const rawTitleStr = t.topicTitle || t.tema || t.topic || t.title || "";
          const subId = normalizeCategoryToSubjectId(materia) || normalizeCategoryToSubjectId(rawTitleStr);
          const parsedNum = extractTopicNumber(t.topicNumber) || extractTopicNumber(t.temaNumero) || extractTopicNumber(rawTitleStr) || extractTopicNumber(t.id);
          const matchedOfficial = parsedNum && subId ? initialTopics.find(it => it.subjectId === subId && it.number === parsedNum) : undefined;

          const finalSubId = matchedOfficial ? matchedOfficial.subjectId : (subId || (parsedNum ? 'constitucional' : 'otros'));
          const finalNum = matchedOfficial ? matchedOfficial.number : (parsedNum && parsedNum > 0 ? parsedNum : undefined);
          const finalTopicId = matchedOfficial ? matchedOfficial.id : (finalNum ? `${finalSubId}-${finalNum}` : `pendiente_${Date.now()}`);
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
        resolvedTopics.reduce((acc, t) => acc + (t.effectiveMinutes || 0), 0);
      const totalEffectiveHours =
        Number(rawPayload.dailyTotalEffectiveHours) ||
        Number(rawPayload.totalFlightEffectiveHours) ||
        Math.round((totalEffectiveMinutes / 60) * 100) / 100;

      const record: WebhookSyncRecord = {
        id: `af_manual_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        receivedAt: new Date().toISOString(),
        date: rawPayload.date || rawPayload.flightDate || getLocalDateString(),
        source: rawPayload.source || "aerofocus_manual",
        flightId: String(rawPayload.flightId || rawPayload.id || `vuelo_${Date.now()}`),
        totalFlightEffectiveMinutes: totalEffectiveMinutes,
        totalFlightEffectiveHours: totalEffectiveHours,
        status: "processed",
        topics: resolvedTopics,
        summary: rawPayload.summary || {
          estudioHours: resolvedTopics.filter(t => t.modality === "primer_estudio").reduce((a, b) => a + b.effectiveHours, 0),
          repasoHours: resolvedTopics.filter(t => t.modality === "repaso").reduce((a, b) => a + b.effectiveHours, 0),
          refrescoHours: resolvedTopics.filter(t => t.modality === "refresco").reduce((a, b) => a + b.effectiveHours, 0),
          cantoHours: resolvedTopics.filter(t => t.modality === "canto").reduce((a, b) => a + b.effectiveHours, 0),
          totalHours: totalEffectiveHours,
        },
      };

      // Guardar en Firestore para sincronización permanente entre pestañas y dispositivos
      const qDocRef = doc(db, `users/${user.uid}/quarantine`, record.id);
      await setDoc(qDocRef, cleanForFirestore(record));

      // Incorporar automáticamente las sesiones al expediente oficial
      await incorporateAeroFocusEvent(record, "aerofocus_auto", true);
      return true;
    } catch (e: any) {
      console.error("Error adding manual quarantine event:", e);
      toast.error("Error al procesar la sesión de AeroFocus: " + e.message);
      return false;
    }
  }, [user, incorporateAeroFocusEvent]);

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
  }, [user, quarantinedEvents, incorporateAeroFocusEvent]);
      toast.dismiss(toastId);
      toast.error("Error al aprobar evento: " + err.message);
      return false;
    }
  }, [user, quarantinedEvents]);

  // Aprobar todas las sesiones retenidas en cuarentena en un solo clic
  const approveAllQuarantineEvents = useCallback(async (): Promise<{ approvedCount: number }> => {
    if (quarantinedEvents.length === 0) return { approvedCount: 0 };
    if (!user) {
      toast.error("Debes iniciar sesión para incorporar eventos.");
      return { approvedCount: 0 };
    }

    const toastId = toast.loading(`Aprobando e integrando ${quarantinedEvents.length} sesiones en lote...`);
    try {
      const affectedTopicIds = new Set<string>();
      const ackIds: string[] = [];
      const newSessionItems: any[] = [];

      for (const event of quarantinedEvents) {
        ackIds.push(event.id);
        const topics = event.topics || [];
        for (const topic of topics) {
          const topicId = topic.resolvedTopicId;
          if (!topicId) continue;

          const durationMins = topic.effectiveMinutes || Math.round((topic.effectiveHours || 0) * 60) || 45;
          const modalityType = topic.modality || "repaso";
          const completesVuelta = topic.completesVuelta !== undefined ? topic.completesVuelta : (topic.modality === 'repaso' || topic.modality === 'canto');

          const sessionRef = doc(collection(db, `users/${user.uid}/sessions`));
          const sessionDoc = cleanForFirestore({
            userId: user.uid,
            topicId,
            topicTitle: topic.resolvedTopicTitle,
            date: event.date || getLocalDateString(),
            durationMinutes: durationMins,
            durationReal: durationMins,
            difficulty: topic.difficulty !== undefined ? topic.difficulty : (topic.dificultadReal !== undefined ? topic.dificultadReal : 5),
            dificultadReal: topic.difficulty !== undefined ? topic.difficulty : (topic.dificultadReal !== undefined ? topic.dificultadReal : 5),
            type: modalityType,
            modality: topic.modality,
            notes: topic.notes || `Aprobado en lote desde Cuarentena AeroFocus (Vuelo #${event.flightId || 'N/A'})`,
            source: 'aerofocus_approved',
            flightId: String(event.flightId || ''),
            effectiveHours: topic.effectiveHours || (durationMins / 60),
            cantoGrade: topic.cantoGrade,
            cantoSeconds: topic.cantoSeconds,
            cantoType: topic.cantoType,
            mistakes: topic.mistakes,
            completesVuelta,
            startPage: topic.startPage !== undefined ? topic.startPage : topic.pageInfo?.startPage,
            endPage: topic.endPage !== undefined ? topic.endPage : topic.pageInfo?.endPage,
            pagesCount: topic.pagesCount !== undefined ? topic.pagesCount : topic.pageInfo?.pagesRead,
            pagesText: topic.pagesText || (topic.startPage && topic.endPage ? `Págs. ${topic.startPage}-${topic.endPage}` : undefined),
            distractionSeconds: topic.distractionSeconds,
            summaryLine: topic.summaryLine,
            createdAt: serverTimestamp(),
          });
          await setDoc(sessionRef, sessionDoc);
          newSessionItems.push({
            id: sessionRef.id,
            ...sessionDoc,
            createdAt: new Date().toISOString()
          });
          affectedTopicIds.add(topicId);
        }

        deleteDoc(doc(db, `users/${user.uid}/quarantine`, event.id)).catch(() => {});
      }

      if (newSessionItems.length > 0) {
        setRecentSessions(prev => [...newSessionItems, ...(prev || [])]);
      }

      for (const tid of affectedTopicIds) {
        await recalculateTopicFromSessions(tid);
      }

      await fetch("/api/webhook/ack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventIds: ackIds }),
      }).catch(() => {});

      const totalCount = quarantinedEvents.length;
      setQuarantinedEvents([]);
      toast.dismiss(toastId);
      toast.success(`✅ ${totalCount} sesiones integradas en el expediente con éxito.`);
      return { approvedCount: totalCount };
    } catch (err: any) {
      toast.dismiss(toastId);
      toast.error("Error en aprobación masiva: " + (err?.message || err));
      return { approvedCount: 0 };
    }
  }, [user, quarantinedEvents]);

  // Descartar evento en cuarentena (no altera expediente)
  const discardQuarantineEvent = useCallback(async (eventId: string): Promise<boolean> => {
    try {
      await fetch("/api/webhook/discard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      }).catch(() => {});

      if (user) {
        deleteDoc(doc(db, `users/${user.uid}/quarantine`, eventId)).catch(() => {});
      }

      setQuarantinedEvents(prev => prev.filter(e => e.id !== eventId));
      toast.info("Evento descartado de la cuarentena.");
      return true;
    } catch (err: any) {
      toast.error("Error al descartar evento: " + err.message);
      return false;
    }
  }, [user]);

  // Vaciar toda la bandeja de cuarentena
  const clearAllQuarantine = useCallback(async (): Promise<boolean> => {
    try {
      await fetch("/api/webhook/clear", { method: "POST" }).catch(() => {});
      if (user) {
        const qSnap = await getDocs(collection(db, `users/${user.uid}/quarantine`));
        qSnap.forEach(d => deleteDoc(d.ref).catch(() => {}));
      }
      setQuarantinedEvents([]);
      toast.success("Bandeja de cuarentena de AeroFocus vaciada.");
      return true;
    } catch (err: any) {
      toast.error("Error al vaciar cuarentena: " + err.message);
      return false;
    }
  }, [user]);

  // Actualizar un evento completo en cuarentena (persistir en memoria, Firestore y servidor)
  const updateQuarantineEvent = useCallback(async (eventId: string, updatedRecord: Partial<WebhookSyncRecord>) => {
    setQuarantinedEvents(prev => prev.map(e => e.id === eventId ? { ...e, ...updatedRecord } : e));
    if (user) {
      try {
        await setDoc(doc(db, `users/${user.uid}/quarantine`, eventId), cleanForFirestore(updatedRecord), { merge: true });
      } catch (e) {
        console.error("Error actualizando cuarentena en Firestore:", e);
      }
    }
    fetch("/api/webhook/update-quarantine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, updatedRecord })
    }).catch(() => {});
  }, [user]);

  // Actualizar un tema concreto dentro de una transmisión en cuarentena (ej. dificultad, modalidad, horas, completesVuelta)
  const updateQuarantineTopic = useCallback(async (eventId: string, topicIndex: number, updatedFields: Partial<WebhookResolvedTopic>) => {
    const event = quarantinedEvents.find(e => e.id === eventId);
    if (!event || !event.topics || !event.topics[topicIndex]) return;

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

    fetch("/api/webhook/delete-topic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, topicIndex })
    }).catch(() => {});

    toast.success("Tema retirado de la sesión.");
    return true;
  }, [quarantinedEvents, updateQuarantineEvent, discardQuarantineEvent]);

  // Añadir un nuevo tema a un vuelo en cuarentena
  const addQuarantineTopic = useCallback(async (eventId: string, topicToAdd?: Partial<WebhookResolvedTopic>): Promise<boolean> => {
    const event = quarantinedEvents.find(e => e.id === eventId);
    if (!event) return false;

    const defaultNewTopic: WebhookResolvedTopic = {
      resolvedTopicId: topicToAdd?.resolvedTopicId || "constitucional-1",
      resolvedSubjectId: topicToAdd?.resolvedSubjectId || "constitucional",
      resolvedTopicNumber: topicToAdd?.resolvedTopicNumber || 1,
      resolvedTopicTitle: topicToAdd?.resolvedTopicTitle || "Tema 1: La Constitución Española de 1978",
      effectiveMinutes: topicToAdd?.effectiveMinutes || 45,
      effectiveHours: topicToAdd?.effectiveHours || 0.75,
      modality: topicToAdd?.modality || "repaso",
      completesVuelta: topicToAdd?.completesVuelta !== undefined ? topicToAdd.completesVuelta : true,
      difficulty: topicToAdd?.difficulty !== undefined ? topicToAdd.difficulty : 5,
      dificultadReal: topicToAdd?.dificultadReal !== undefined ? topicToAdd.dificultadReal : 5,
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

    fetch("/api/webhook/add-topic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, topic: defaultNewTopic })
    }).catch(() => {});

    toast.success("Tema añadido al vuelo.");
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

    fetch("/api/webhook/clean-tests", { method: "POST" }).catch(() => {});
    if (count > 0) {
      toast.success(`Se eliminaron ${count} vuelos de prueba/test.`);
    } else {
      toast.info("No se detectaron vuelos de prueba.");
    }
    return count;
  }, [quarantinedEvents, user, isTestArtifact]);

  // Conexión reactiva en tiempo real (SSE + BroadcastChannel + Polling adaptativo)
  useEffect(() => {
    let sse: EventSource | null = null;
    let channel: BroadcastChannel | null = null;

    // 1. Canal entre pestañas / ventanas locales
    try {
      if (typeof window !== "undefined" && "BroadcastChannel" in window) {
        channel = new BroadcastChannel("wellsprep_sync_bus");
        channel.onmessage = async (event) => {
          if (event.data?.type === "AEROFOCUS_TOUCHDOWN_SYNC" && event.data?.payload) {
            toast.info("✈️ Vuelo de AeroFocus recibido por canal en vivo.");
            await addQuarantineEventManually(event.data.payload);
            await fetchQuarantinedEvents();
          }
        };
      }
    } catch {}

    // 2. Conexión reactiva Server-Sent Events (SSE)
    try {
      if (typeof window !== "undefined" && typeof EventSource !== "undefined") {
        sse = new EventSource("/api/webhook/stream");
        sse.onmessage = (msg) => {
          try {
            const data = JSON.parse(msg.data);
            if (data?.type === "ping") return;
            if (data && (data.id || data.type === "quarantine_updated" || data.status === "quarantined")) {
              fetchQuarantinedEvents();
              if (data.id && data.status === "quarantined") {
                toast.info("⚡ Nueva sesión de AeroFocus recibida en Cuarentena.");
              }
            }
          } catch {}
        };
      }
    } catch (err) {
      console.warn("SSE no disponible en este entorno, operando con polling reactivo:", err);
    }

    // 3. Polling de respaldo cada 6 segundos
    const pollTimer = setInterval(() => {
      fetchQuarantinedEvents();
    }, 6000);

    return () => {
      if (sse) sse.close();
      if (channel) channel.close();
      clearInterval(pollTimer);
    };
  }, [fetchQuarantinedEvents, addQuarantineEventManually]);

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
        userProgress,
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
        migrateMercantilToConstitucional,
        auditAndRestoreTopicIntegrity,
        purgeAllAeroFocusData,
        purgePhantomTema5Cante,
        migratePenalSessionsToConstitucional5,
        deduplicateUserSessions,
        recoverHistoricalUserData,
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
        cleanTestArtifacts,
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
