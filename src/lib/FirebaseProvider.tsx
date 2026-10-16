import { getLocalDateString, safeParseDate } from './utils';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import {
  serverTimestamp,
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
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

export function cleanForFirestore<T extends Record<string, any>>(obj: T): T {
  if (!obj || typeof obj !== "object") return obj;
  const clean: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
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
  recoverHistoricalUserData: (silent?: boolean) => Promise<any>;
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
  const [aerofocusBetaEnabled, setAerofocusBetaEnabledState] = useState<boolean>(() => {
    return localStorage.getItem("aerofocus_beta_enabled") === "true";
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
    
    // Subscribe to progress
    const progressRef = collection(db, `users/${user.uid}/progress`);
    const unsubProgress = onSnapshot(progressRef, (snapshot) => {
      const p: Record<string, TopicProgressData> = {};
      snapshot.forEach(doc => {
        p[doc.id] = doc.data() as TopicProgressData;
      });
      setUserProgress(p);
    }, (error) => console.error("Error fetching progress:", error));

    // Subscribe to sessions (for charts and recent activity)
    const sessionsRef = collection(db, `users/${user.uid}/sessions`);
    const unsubSessions = onSnapshot(sessionsRef, (snapshot) => {
      const s: any[] = [];
      snapshot.forEach(doc => {
        s.push({ id: doc.id, ...doc.data() });
      });
      // Sort sessions by date descending
      s.sort((a, b) => {
        // First by date string comparison, then by createdAt if dates are same
        const dateCmp = (b.date || "").localeCompare(a.date || "");
        if (dateCmp !== 0) return dateCmp;
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        return timeB - timeA;
      });
      setRecentSessions(s);
      
      // Once data is loaded, set loading false
      setLoading(false);
    }, (error) => {
      console.error("Error fetching sessions:", error);
      setLoading(false);
    });

    // Subscribe to settings
    const settingsRef = doc(db, `users/${user.uid}/settings/general`);
    const unsubSettings = onSnapshot(settingsRef, (docSnap) => {
      if (docSnap.exists()) {
        setUserSettings(docSnap.data() as UserSettingsData);
      }
    });

    return () => {
      unsubProgress();
      unsubSessions();
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
      const cleanTopicId = topicId.trim();
      const today = (providedDate && typeof providedDate === "string" && providedDate.trim()) 
        ? providedDate.trim() 
        : getLocalDateString();
      const durMinutes = Math.max(0, Number(durationMinutes) || 0);
      const safeDiff = Math.min(10, Math.max(1, Math.round(Number(difficulty) || 5)));

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
      const sessionsQ = query(
        collection(db, `users/${user.uid}/sessions`),
        where("topicId", "==", targetTopicId)
      );
      const sessionsSnap = await getDocs(sessionsQ);
      
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

      sessionsSnap.forEach((docSnap) => {
        const s = docSnap.data();
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
        } else if (sessionType === "canto") {
          vueltasCount += 1;
        }

        if (s.completesVuelta) {
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

        if (sessionType === 'canto' && (durationMins > 0 || s.cantoSeconds > 0)) {
          const secs = Math.floor(durationMins * 60) + (s.cantoSeconds || 0);
          if (bestCantoTotalSecs === 0 || secs < bestCantoTotalSecs) {
            bestCantoTotalSecs = secs;
          }
        }
      });

      const avgDiff = diffCount > 0 ? Math.round((diffSum / diffCount) * 10) / 10 : 5;
      const bestCantoMins = Math.floor(bestCantoTotalSecs / 60);
      const bestCantoSecs = bestCantoTotalSecs % 60;

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
        mejorTiempoCantoMinutos: bestCantoMins,
        mejorTiempoCantoSegundos: bestCantoSecs,
        updatedAt: serverTimestamp(),
      };

      if (earliestDate) progressUpdate.firstStudyDate = earliestDate;
      if (latestDate) {
        progressUpdate.lastReviewDate = latestDate;
        // Calcular fecha del próximo repaso modulada por dificultad
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
        if (s.topicId) {
          if (!topicSessionsMap[s.topicId]) topicSessionsMap[s.topicId] = [];
          topicSessionsMap[s.topicId].push(s);
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
          } else if (sessionType === "canto") {
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

          if (sessionType === 'canto' && (durationMins > 0 || s.cantoSeconds > 0)) {
            const secs = Math.floor(durationMins * 60) + (s.cantoSeconds || 0);
            if (bestCantoTotalSecs === 0 || secs < bestCantoTotalSecs) {
              bestCantoTotalSecs = secs;
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
          mejorTiempoCantoMinutos: bestCantoMins,
          mejorTiempoCantoSegundos: bestCantoSecs,
          updatedAt: serverTimestamp(),
        };

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

        // 1. Escanear subcolecciones: users/{identifier}/progress y users/{identifier}/sessions
        for (const uid of userIdentifiers) {
          try {
            const pSnap = await getDocs(collection(dbClient, `users/${uid}/progress`));
            for (const d of pSnap.docs) {
              const targetDocRef = doc(db, `users/${user.uid}/progress`, d.id);
              const incomingData = d.data();
              const existingData = userProgress[d.id] || {};

              // Fusión inteligente: preservar vueltas más altas y no sobreescribir con datos en blanco
              const merged = cleanForFirestore({
                ...incomingData,
                ...existingData,
                userId: user.uid,
                topicId: d.id,
                vueltas: Math.max(Number(incomingData.vueltas) || 0, Number(existingData.vueltas) || 0),
                studyTimeHours: Math.max(Number(incomingData.studyTimeHours) || 0, Number(existingData.studyTimeHours) || 0),
                firstStudyDate: existingData.firstStudyDate || incomingData.firstStudyDate || undefined,
                lastReviewDate: existingData.lastReviewDate || incomingData.lastReviewDate || undefined,
                mejorTiempoCantoMinutos: incomingData.mejorTiempoCantoMinutos || existingData.mejorTiempoCantoMinutos || undefined,
                mejorTiempoCantoSegundos: incomingData.mejorTiempoCantoSegundos || existingData.mejorTiempoCantoSegundos || undefined,
                updatedAt: serverTimestamp(),
              });

              await setDoc(targetDocRef, merged, { merge: true });
              recoveredProgress++;
            }
          } catch (e: any) {
            logs.push(`Scan progress ${dbName} users/${uid}: ${e.message}`);
          }

          try {
            const sSnap = await getDocs(collection(dbClient, `users/${uid}/sessions`));
            for (const d of sSnap.docs) {
              const sData = d.data();
              // Descartar sesiones contaminadas de AeroFocus
              const isAero =
                sData.source === "aerofocus" ||
                sData.source === "aerofocus_pro" ||
                !!sData.flightId ||
                !!sData.sourceFlightId ||
                (sData.notes && String(sData.notes).toLowerCase().includes("aerofocus"));

              if (isAero) continue;

              const targetDocRef = doc(db, `users/${user.uid}/sessions`, d.id);
              await setDoc(
                targetDocRef,
                cleanForFirestore({
                  ...sData,
                  userId: user.uid,
                  updatedAt: serverTimestamp(),
                }),
                { merge: true }
              );
              recoveredSessions++;
            }
          } catch (e: any) {
            logs.push(`Scan sessions ${dbName} users/${uid}: ${e.message}`);
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
                    const targetTopicId = data.topicId || d.id;
                    const targetDocRef = doc(db, `users/${user.uid}/progress`, targetTopicId);
                    await setDoc(
                      targetDocRef,
                      cleanForFirestore({ ...data, userId: user.uid, topicId: targetTopicId }),
                      { merge: true }
                    );
                    recoveredProgress++;
                  } else {
                    const isAero =
                      data.source === "aerofocus" ||
                      data.source === "aerofocus_pro" ||
                      !!data.flightId ||
                      (data.notes && String(data.notes).toLowerCase().includes("aerofocus"));

                    if (isAero) continue;

                    const isCanteCol = colName === "cante_sessions" || colName === "cantos" || colName === "cantes" || colName === "preparador_sessions";
                    const targetDocRef = doc(db, `users/${user.uid}/sessions`, d.id);
                    await setDoc(
                      targetDocRef,
                      cleanForFirestore({
                        ...data,
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

  // Sincronización automática de datos históricos al iniciar sesión
  useEffect(() => {
    if (user) {
      recoverHistoricalUserData(true);

      // Purgar AeroFocus automáticamente una vez si aún no se ha purgado
      if (localStorage.getItem("aerofocus_purged_clean_v2") !== "true") {
        localStorage.setItem("aerofocus_purged_clean_v2", "true");
        purgeAllAeroFocusData();
      }
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

  const syncPendingWebhookEvents = useCallback(async (force: boolean = false) => {
    if (!user) return 0;
    // Si está en cuarentena y no se ha forzado manualmente en modo beta, no sincronizar
    if (!force && !aerofocusBetaEnabled) {
      console.log("[AeroFocus Quarantine] Sincronización bloqueada: función en cuarentena y beta desactivada.");
      return 0;
    }
    try {
      setIsSyncingWebhooks(true);
      const res = await fetch("/api/webhook/events?status=pending");
      if (!res.ok) return 0;
      const data = await res.json();
      const events: WebhookSyncRecord[] = data.events || [];
      if (events.length === 0) return 0;

      let processedTopicsCount = 0;
      const ackIds: string[] = [];

      for (const event of events) {
        if (!event.topics || event.topics.length === 0) {
          ackIds.push(event.id);
          continue;
        }

        for (const topic of event.topics) {
          const topicId = topic.resolvedTopicId;
          if (!topicId) continue;

          const durationMins = topic.effectiveMinutes || Math.round((topic.effectiveHours || 0) * 60) || 60;
          const modalityType = topic.modality === 'primer_estudio'
            ? 'estudio_inicial'
            : (topic.modality === 'refresco' ? 'refresco' : (topic.modality === 'canto' ? 'canto' : 'repaso'));

          // Registrar sesión en Firestore
          const sessionRef = doc(collection(db, `users/${user.uid}/sessions`));
          const sessionDoc: any = cleanForFirestore({
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
            notes: topic.notes || `Sincronizado vía AeroFocus Pro (Vuelo #${event.flightId || 'N/A'})`,
            source: 'aerofocus',
            flightId: String(event.flightId || ''),
            effectiveHours: topic.effectiveHours || (durationMins / 60),
            cantoGrade: topic.cantoGrade,
            cantoSeconds: topic.cantoSeconds,
            cantoType: topic.cantoType,
            mistakes: topic.mistakes,
            completesVuelta: modalityType === 'repaso' || modalityType === 'canto',
            createdAt: serverTimestamp()
          });
          await setDoc(sessionRef, sessionDoc);

          // Recalcular el progreso consolidado completo del tema con máxima precisión
          await recalculateTopicFromSessions(topicId);
          processedTopicsCount++;
        }

        ackIds.push(event.id);
      }

      if (ackIds.length > 0) {
        await fetch("/api/webhook/ack", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventIds: ackIds })
        });
      }

      if (processedTopicsCount > 0) {
        toast.success(`⚡ AeroFocus Pro (Beta): ${processedTopicsCount} temas sincronizados`);
      }

      return processedTopicsCount;
    } catch (err: any) {
      console.error("Error al sincronizar eventos de webhook:", err);
      return 0;
    } finally {
      setIsSyncingWebhooks(false);
    }
  }, [user, userProgress, aerofocusBetaEnabled]);

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
        recoverHistoricalUserData,
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
