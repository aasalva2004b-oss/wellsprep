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
import { WebhookSyncRecord } from "./webhookTypes";
import { isCantoSession, getCantoDuration, sessionMatchesTopic } from "./cantoUtils";

export function cleanForFirestore<T extends Record<string, any>>(obj: T): T {
  if (!obj || typeof obj !== "object") return obj;
  const clean: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    // Preserve Firestore FieldValues (serverTimestamp, deleteField, etc.)
    if (value !== null && typeof value === "object") {
      const isPlain = Object.prototype.toString.call(value) === "[object Object]" && (value.constructor === Object || !value.constructor);
      if (!isPlain && !(value instanceof Date) && !Array.isArray(value)) {
        clean[key] = value;
        continue;
      }
    }
    if (typeof value === "number") {
      if (isNaN(value) || !isFinite(value)) continue;
    }
    clean[key] = value;
  }
  return clean;
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
  deduplicateUserSessions: (silent?: boolean) => Promise<{ deletedCount: number; affectedTopics: string[] }>;
  recoverHistoricalUserData: (silent?: boolean) => Promise<any>;
  quarantinedEvents: WebhookSyncRecord[];
  isLoadingQuarantine: boolean;
  fetchQuarantinedEvents: () => Promise<WebhookSyncRecord[]>;
  approveQuarantineEvent: (eventId: string) => Promise<boolean>;
  discardQuarantineEvent: (eventId: string) => Promise<boolean>;
  clearAllQuarantine: () => Promise<boolean>;
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

        if (isPhantomAero || isPhantomDirect) {
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
          vueltasCount += 1;
        } else if (sessionType === "refresco") {
          refrescoHours += extraHours;
        } else if (sessionType === "canto" || isCantoSession(s)) {
          vueltasCount += 1;
        }

        if (s.completesVuelta) vueltasCount += 1;

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

  const reconcileAllTopicsAndSessions = async (): Promise<{ updatedTopicsCount: number; totalSessionsCount: number }> => {
    if (!user) return { updatedTopicsCount: 0, totalSessionsCount: 0 };
    try {
      const sessionsSnap = await getDocs(collection(db, `users/${user.uid}/sessions`));
      const topicSessionsMap: Record<string, any[]> = {};

      sessionsSnap.forEach((docSnap) => {
        const s = { id: docSnap.id, ...docSnap.data() } as any;
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
            vueltasCount += 1;
          } else if (sessionType === "refresco") {
            refrescoHours += extraHours;
          } else if (sessionType === "canto" || isCantoSession(s)) {
            vueltasCount += 1;
          }

          if (s.completesVuelta) vueltasCount += 1;

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

  // Purgado exhaustivo de datos inventados: Cante ficticio de 45m de Tema 5 y Derecho Penal
  const purgePhantomTema5Cante = async () => {
    if (!user) return;
    try {
      const snap = await getDocs(collection(db, `users/${user.uid}/sessions`));
      let deletedCount = 0;
      for (const d of snap.docs) {
        const data = d.data();
        const sTopic = String(data.topicId || "").toLowerCase().trim();
        const sSubj = String(data.subjectId || "").toLowerCase().trim();
        const sNotes = String(data.notes || "").toLowerCase();
        const sType = String(data.type || data.modality || "").toLowerCase();
        const dur = Number(data.durationMinutes || data.durationReal || 0);

        // 1. Eliminar cualquier registro de Derecho Penal
        const isPenal =
          sTopic.startsWith("penal-") ||
          sTopic === "penal" ||
          sSubj.includes("penal") ||
          sNotes.includes("derecho penal") ||
          (data.category && String(data.category).toLowerCase().includes("penal"));

        // 2. Eliminar cualquier cante inventado del Tema 5 (45 min, 30s, nota 8.5, o cierre_22h)
        const isTopic5 =
          sTopic === "constitucional-5" ||
          sTopic === "5" ||
          sTopic === "tema-5" ||
          sTopic === "tema 5" ||
          sTopic === "const-5";

        const isFakeTopic5Cante =
          isTopic5 &&
          (sType === "canto" ||
            dur === 45 ||
            Number(data.cantoGrade) === 8.5 ||
            Number(data.cantoSeconds) === 30 ||
            data.flightId === "cierre_22h" ||
            (data.source === "aerofocus" && sType === "canto"));

        // 3. Eliminar cualquier sesión etiquetada como prueba/inventada
        const isInvented =
          sNotes.includes("inventado") ||
          sNotes.includes("mock") ||
          sNotes.includes("simulado test") ||
          data.flightId === "FLIGHT_TEST_AERO_99";

        if (isPenal || isFakeTopic5Cante || isInvented) {
          await deleteDoc(d.ref);
          deletedCount++;
        }
      }

      // Limpiar progreso de temas de Penal si existen
      const progSnap = await getDocs(collection(db, `users/${user.uid}/progress`));
      for (const pDoc of progSnap.docs) {
        const pId = pDoc.id.toLowerCase();
        if (pId.startsWith("penal-") || pId === "penal") {
          await deleteDoc(pDoc.ref);
        }
      }

      // Limpiar datos residuales del cante en progreso de Constitucional 5
      const progRef = doc(db, `users/${user.uid}/progress`, "constitucional-5");
      const progSnapDoc = await getDoc(progRef);
      if (progSnapDoc.exists()) {
        const pData = progSnapDoc.data();
        if (
          Number(pData.ultimoCantoNota) === 8.5 ||
          Number(pData.ultimoCantoSegundos) === 30 ||
          Number(pData.studyTimeHours) === 0.75 ||
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

      // Establecer Constitucional como única asignatura activa del opositor
      await setDoc(
        doc(db, `users/${user.uid}/settings/general`),
        cleanForFirestore({
          activeSubjects: ["constitucional"],
          defaultSubject: "constitucional",
          updatedAt: serverTimestamp(),
        }),
        { merge: true }
      );

      if (deletedCount > 0) {
        toast.success(`Limpieza completada: ${deletedCount} registros ficticios/Penal eliminados. Temario 100% real.`);
      }
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

  const webhookToken = userSettings?.webhookToken || (user ? `wp_${user.uid.slice(0, 10)}_live` : "");

  const generateWebhookToken = async () => {
    if (!user) return "";
    const newToken = `wp_live_${Math.random().toString(36).substring(2, 10)}${Math.random().toString(36).substring(2, 10)}`;
    await updateUserSettings({ webhookToken: newToken });
    toast.success("Nuevo Token de Webhook generado con éxito");
    return newToken;
  };

  const [quarantinedEvents, setQuarantinedEvents] = useState<WebhookSyncRecord[]>([]);
  const [isLoadingQuarantine, setIsLoadingQuarantine] = useState(false);

  // Carga reactiva de eventos retenidos en cuarentena
  const fetchQuarantinedEvents = useCallback(async () => {
    try {
      setIsLoadingQuarantine(true);
      const res = await fetch("/api/webhook/events");
      if (res.ok) {
        const data = await res.json();
        const raw: WebhookSyncRecord[] = data.events || [];
        const inQuarantine = raw.filter((e: any) => e.status === "quarantined" || e.status === "pending");
        setQuarantinedEvents(inQuarantine);
        return inQuarantine;
      }
      return [];
    } catch (e) {
      console.error("Error fetching quarantined events:", e);
      return [];
    } finally {
      setIsLoadingQuarantine(false);
    }
  }, []);

  // Aprobación manual y explícita por parte del estudiante (salida de cuarentena)
  const approveQuarantineEvent = useCallback(async (eventId: string): Promise<boolean> => {
    if (!user) return false;
    const toastId = toast.loading("Aprobando e incorporando evento a tu expediente...");
    try {
      const event = quarantinedEvents.find(e => e.id === eventId);
      if (!event) throw new Error("Evento no encontrado en cuarentena");

      const affectedTopicIds = new Set<string>();

      for (const topic of (event.topics || [])) {
        let topicId = topic.resolvedTopicId;
        if (!topicId) continue;
        if (topicId === "5" || topicId === (5 as any)) topicId = "constitucional-5";

        const durationMins = topic.effectiveMinutes || Math.round((topic.effectiveHours || 0) * 60) || 60;
        const modalityType = topic.modality === 'primer_estudio'
          ? 'estudio_inicial'
          : (topic.modality === 'refresco' ? 'refresco' : (topic.modality === 'canto' ? 'canto' : 'repaso'));

        const sessionRef = doc(collection(db, `users/${user.uid}/sessions`));
        const sessionDoc = cleanForFirestore({
          userId: user.uid,
          topicId,
          topicTitle: topic.resolvedTopicTitle,
          date: event.date || getLocalDateString(),
          durationMinutes: durationMins,
          durationReal: durationMins,
          difficulty: topic.difficulty || 5,
          dificultadReal: topic.difficulty || 5,
          type: modalityType,
          modality: topic.modality,
          notes: topic.notes || `Aprobado desde Cuarentena AeroFocus (Vuelo #${event.flightId || 'N/A'})`,
          source: 'aerofocus_approved',
          flightId: String(event.flightId || ''),
          effectiveHours: topic.effectiveHours || (durationMins / 60),
          cantoGrade: topic.cantoGrade,
          cantoSeconds: topic.cantoSeconds,
          cantoType: topic.cantoType,
          mistakes: topic.mistakes,
          completesVuelta: modalityType === 'repaso' || modalityType === 'canto',
          createdAt: serverTimestamp(),
        });
        await setDoc(sessionRef, sessionDoc);
        affectedTopicIds.add(topicId);
      }

      for (const tid of affectedTopicIds) {
        await recalculateTopicFromSessions(tid);
      }

      await fetch("/api/webhook/ack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });

      setQuarantinedEvents(prev => prev.filter(e => e.id !== eventId));
      toast.dismiss(toastId);
      toast.success("Evento validado e integrado en tu expediente oficial.");
      return true;
    } catch (err: any) {
      toast.dismiss(toastId);
      toast.error("Error al aprobar evento: " + err.message);
      return false;
    }
  }, [user, quarantinedEvents]);

  // Descartar evento en cuarentena (no altera expediente)
  const discardQuarantineEvent = useCallback(async (eventId: string): Promise<boolean> => {
    try {
      await fetch("/api/webhook/discard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      setQuarantinedEvents(prev => prev.filter(e => e.id !== eventId));
      toast.info("Evento descartado de la cuarentena.");
      return true;
    } catch (err: any) {
      toast.error("Error al descartar evento: " + err.message);
      return false;
    }
  }, []);

  // Vaciar toda la bandeja de cuarentena
  const clearAllQuarantine = useCallback(async (): Promise<boolean> => {
    try {
      await fetch("/api/webhook/clear", { method: "POST" });
      setQuarantinedEvents([]);
      toast.success("Bandeja de cuarentena de AeroFocus vaciada.");
      return true;
    } catch (err: any) {
      toast.error("Error al vaciar cuarentena: " + err.message);
      return false;
    }
  }, []);

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
        reconcileAllTopicsAndSessions,
        resetProgress,
        importProgress,
        exportData,
        importData,
        migrateMercantilToConstitucional,
        auditAndRestoreTopicIntegrity,
        purgeAllAeroFocusData,
        purgePhantomTema5Cante,
        deduplicateUserSessions,
        recoverHistoricalUserData,
        quarantinedEvents,
        isLoadingQuarantine,
        fetchQuarantinedEvents,
        approveQuarantineEvent,
        discardQuarantineEvent,
        clearAllQuarantine,
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
