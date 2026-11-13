import { useLocalDay } from '../../hooks/useLocalDay';
import React, { useState, useMemo, useEffect, useRef } from "react";
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Clock, 
  Brain, 
  Sparkles, 
  AlertTriangle, 
  CheckCircle2, 
  Sliders, 
  MoveRight, 
  Trash2, 
  Edit3, 
  Award, 
  Zap, 
  Check, 
  ArrowRight,
  RefreshCw,
  Layers,
  ChevronDown,
  Info
} from "lucide-react";
import { Topic, Session } from "../../types";
import { 
  PlannerTask, 
  PlannerActivityType, 
  PlannerSettings, 
  DEFAULT_PLANNER_SETTINGS, 
  ACTIVITY_CONFIG, 
  buildWeekPlan, 
  generateAutoRefrescos, 
  estimateTaskDurationMinutes,
  estimateTaskAdaptiveDetails
} from "../../lib/plannerEngine";
import { getCanonicalTopic, buildCanonicalTopicMap } from "../../lib/canonicalTopicService";
import { buildLearnerProfile } from "../../lib/adaptiveLearningEngine";
import { TaskEditorModal } from "./TaskEditorModal";
import { CantePlanProposalModal, type CanteProposalConfig, type RefreshExceptions } from "./CantePlanProposalModal";
import { generateCantePlanProposal, type CantePlanProposal } from "../../lib/cantePlanningEngine";
import { EbbinghausRecommendationsModal } from "./EbbinghausRecommendationsModal";
import { PlannerSettingsModal } from "./PlannerSettingsModal";
import { cn, formatMinutesToHours, getLocalDateString, safeParseDate } from "../../lib/utils";
import { playSound } from "../../lib/sound";
import { DS } from "../../lib/designSystem";
import { toast } from "sonner";
import { doc, onSnapshot, setDoc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useFirebase } from "../../lib/FirebaseProvider";
import { StudySessionDialog, StudySessionTarget } from '../StudySessionDialog';

const STORAGE_TASKS_KEY = "wellsprep_judicial_planner_tasks_v2";
const STORAGE_SETTINGS_KEY = "wellsprep_judicial_planner_settings_v2";

function plannerStoredFingerprint(data: Record<string, any>): string {
  const ordered = (value: any): any => Array.isArray(value) ? value.map(ordered) : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])])) : value;
  return JSON.stringify(ordered({ tasks: Array.isArray(data.tasks) ? data.tasks : [], settings: data.settings || null, cantePlanning: data.cantePlanning || null }));
}

interface WeeklyPlannerViewProps {
  allTopics: Topic[];
  scheduleLunes?: string[];
  scheduleJueves?: string[];
  onOpenPreparadorSession?: (day: "lunes" | "jueves", date?: string) => void;
  focusDate?: string;
  canteProposalRequested?: boolean;
  draftCanteGoal?: { date: string; topicIds: string[] };
  onCanteProposalRequestHandled?: () => void;
}

export const WeeklyPlannerView: React.FC<WeeklyPlannerViewProps> = ({
  allTopics: suppliedTopics,
  scheduleLunes = [],
  scheduleJueves = [],
  onOpenPreparadorSession,
  focusDate,
  canteProposalRequested = false,
  draftCanteGoal,
  onCanteProposalRequestHandled,
}) => {
  const { user, userSettings, userProgress, recentSessions, addStudySession, updateTopicProgress, estimateRetentionForTopic, topics: sharedTopics, topicState } = useFirebase();
  const allTopics = sharedTopics || suppliedTopics;
  const currentOwner = useRef(user?.uid);
  currentOwner.current = user?.uid;
  const storageTasksKey = `${STORAGE_TASKS_KEY}:${user?.uid || 'signed-out'}`;
  const storageSettingsKey = `${STORAGE_SETTINGS_KEY}:${user?.uid || 'signed-out'}`;
  const [plannerLoaded, setPlannerLoaded] = useState(false);
  const [plannerStoredBasis, setPlannerStoredBasis] = useState("");

  // 1. Estados de Navegación Semanal
  const [weekOffset, setWeekOffset] = useState<number>(0);
  const [mobileSelectedDate, setMobileSelectedDate] = useState<string>(() => getLocalDateString());
  const [activityFilter, setActivityFilter] = useState<PlannerActivityType | "todos" | "pendientes">("todos");
  const [searchTopicQuery, setSearchTopicQuery] = useState<string>("");

  // 2. Ajustes configurables del planificador
  const [settings, setSettings] = useState<PlannerSettings>(DEFAULT_PLANNER_SETTINGS);
  // Remote planner documents are authoritative. Caches are scoped by UID.
  const [tasks, setTasks] = useState<PlannerTask[]>([]);

  // 4. Modales
  const [isTaskEditorOpen, setIsTaskEditorOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<PlannerTask | null>(null);
  const [observedTask, setObservedTask] = useState<{ task: PlannerTask; target: StudySessionTarget } | null>(null);
  const [targetDateForNewTask, setTargetDateForNewTask] = useState<string>(getLocalDateString());


  const [isEbbinghausModalOpen, setIsEbbinghausModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isCanteProposalOpen, setIsCanteProposalOpen] = useState(false);
  const [savedRefreshExceptions, setSavedRefreshExceptions] = useState<RefreshExceptions>({});
  const [explicitEmptyDates, setExplicitEmptyDates] = useState<string[]>([]);

  // Mapa de temas para acceso O(1)
  const topicMap = useMemo(() => {
    const map = new Map<string, Topic>();
    allTopics.forEach((t) => map.set(t.id, t));
    return map;
  }, [allTopics]);

  // Perfil de aprendizaje empírico adaptativo
  const learnerProfile = useMemo(() => {
    const cMap = buildCanonicalTopicMap(allTopics, userProgress, recentSessions);
    return buildLearnerProfile(recentSessions, cMap);
  }, [allTopics, userProgress, recentSessions]);

  useEffect(() => {
    let active = true;
    setIsCanteProposalOpen(false); setExplicitEmptyDates([]);
    setTasks([]); setSettings(DEFAULT_PLANNER_SETTINGS); setSavedRefreshExceptions({}); setPlannerStoredBasis(""); setPlannerLoaded(false);
    if (!user) return;
    const ref = doc(db, `users/${user.uid}/settings/weeklyPlannerState`);
    const unsubscribe = onSnapshot(ref, snap => {
      if (!active) return;
      const data = snap.exists() ? snap.data() : {};
      const nextTasks = Array.isArray(data.tasks) ? data.tasks : [];
      const nextSettings = data.settings ? { ...DEFAULT_PLANNER_SETTINGS, ...data.settings } : DEFAULT_PLANNER_SETTINGS;
      setExplicitEmptyDates(Array.isArray(data.cantePlanning?.canteGoals) ? data.cantePlanning.canteGoals.filter((goal: any) => Array.isArray(goal?.topicIds) && goal.topicIds.length === 0).map((goal: any) => goal.date) : []);
      setTasks(nextTasks); setSettings(nextSettings); setSavedRefreshExceptions(data.cantePlanning?.refreshExceptions || {}); setPlannerStoredBasis(plannerStoredFingerprint(data)); setPlannerLoaded(true);
      localStorage.setItem(storageTasksKey, JSON.stringify(nextTasks));
      localStorage.setItem(storageSettingsKey, JSON.stringify(nextSettings));
    }, error => {
      if (!active) return;
      setPlannerLoaded(false);
      console.error('No se pudo cargar el planificador:', error);
      toast.error('No se pudo cargar la planificación guardada.');
    });
    return () => { active = false; unsubscribe(); };
  }, [user?.uid, storageTasksKey, storageSettingsKey]);

  useEffect(() => {
    if (plannerLoaded && canteProposalRequested) {
      setIsCanteProposalOpen(true);
      onCanteProposalRequestHandled?.();
    }
  }, [plannerLoaded, canteProposalRequested]);
  useEffect(() => {
    if (!focusDate) return;
    const selected = safeParseDate(focusDate), today = new Date();
    if (!Number.isFinite(selected.getTime())) return;
    const monday = (date: Date) => { const value = new Date(date); value.setHours(0, 0, 0, 0); value.setDate(value.getDate() + (value.getDay() === 0 ? -6 : 1 - value.getDay())); return value; };
    setMobileSelectedDate(focusDate);
    setWeekOffset(Math.round((monday(selected).getTime() - monday(today).getTime()) / (7 * 86_400_000)));
  }, [focusDate]);

  // Guardar en Firestore y LocalStorage
  const persistTasks = async (updatedTasks: PlannerTask[], planning?: { proposal: CantePlanProposal; config: CanteProposalConfig }) => {
    if (!user) throw new Error("Inicia sesión para guardar la planificación.");
    const ownerUid = user.uid;
    try {
      const payload = JSON.parse(JSON.stringify(updatedTasks));
      const ref = doc(db, `users/${user.uid}/settings/weeklyPlannerState`);
      const update = {
        userId: user.uid,
        tasks: payload,
        ...(planning ? { cantePlanning: {
          signature: planning.proposal.signature,
          canteGoals: planning.config.canteGoals,
          refreshExceptions: planning.config.refreshExceptions,
          horizonStart: planning.config.horizonStart,
          horizonEnd: planning.config.horizonEnd,
          generatedAt: planning.proposal.generatedAt,
          confirmedAt: new Date().toISOString(),
          viability: planning.proposal.viability,
        } } : {}),
        updatedAt: serverTimestamp(),
      };
      if (planning) {
        const loadedBasis = plannerStoredBasis;
        await runTransaction(db, async transaction => {
          const current = await transaction.get(ref);
          if (currentOwner.current !== ownerUid) throw new Error("La cuenta activa ha cambiado. Genera otra propuesta.");
          const currentData = current.exists() ? current.data() : {};
          if (plannerStoredFingerprint(currentData) !== loadedBasis) {
            throw new Error("La planificación ha cambiado en otra pestaña o dispositivo. Recarga los datos y genera otra propuesta.");
          }
          transaction.set(ref, update, { merge: true });
        });
      } else {
        await setDoc(ref, update, { merge: true });
      }
      if (currentOwner.current !== ownerUid) return;
      setTasks(updatedTasks);
      localStorage.setItem(storageTasksKey, JSON.stringify(updatedTasks));
      if (planning) setSavedRefreshExceptions(planning.config.refreshExceptions);
    } catch (error) {
      console.error("Error saving planner tasks:", error);
      toast.error("No se pudo guardar la planificación.");
      throw error;
    }
  };

  const persistSettings = async (newSettings: PlannerSettings) => {
    setSettings(newSettings);
    try {
      localStorage.setItem(storageSettingsKey, JSON.stringify(newSettings));
      if (user) {
        const ref = doc(db, `users/${user.uid}/settings/weeklyPlannerState`);
        await setDoc(ref, {
          userId: user.uid,
          settings: newSettings,
          updatedAt: serverTimestamp()
        }, { merge: true });
      }
    } catch (e) {
      console.error("Error saving planner settings:", e);
    }
  };

  // Construcción del modelo de la semana actual con telemetría real (AeroFocus y WellsPrep)
  const weekPlan = useMemo(() => {
    return buildWeekPlan(tasks, weekOffset, settings, new Date(), recentSessions, userProgress, allTopics);
  }, [tasks, weekOffset, settings, recentSessions, userProgress, allTopics]);

  // Identificar jornada de hoy
  const todayStr = useLocalDay();
  const todayDayPlan = useMemo(() => {
    return weekPlan.days.find((d) => d.date === todayStr);
  }, [weekPlan, todayStr]);

  // Asegurar que en móvil siempre haya un día visible y coherente al cambiar de semana
  useEffect(() => {
    if (weekPlan.days.length > 0 && !weekPlan.days.some((d) => d.date === mobileSelectedDate)) {
      setMobileSelectedDate(weekPlan.days[0].date);
    }
  }, [weekPlan.days, mobileSelectedDate]);

  // Radar de Próximo Cante (Lunes o Jueves más próximo, con anticipación de semana)
  const nextCanteInfo = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. Intentar encontrar en los días cargados de la semana actual
    const candidateDays = weekPlan.days.filter((d) => {
      const dDate = new Date(safeParseDate(d.date));
      dDate.setHours(0, 0, 0, 0);
      return d.isCanteOfficialDay && dDate >= today;
    });

    let targetDateStr: string;
    let targetDayName: string;
    let targetDayNumber: number;
    let targetMonthName: string;
    let diffDays: number;
    let canteKey: "lunes" | "jueves";

    if (candidateDays.length > 0) {
      const d = candidateDays[0];
      targetDateStr = d.date;
      targetDayName = d.dayName;
      targetDayNumber = d.dayNumber;
      targetMonthName = d.monthName;
      const diffMs = new Date(safeParseDate(d.date)).getTime() - today.getTime();
      diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
      canteKey = d.shortName === "LUN" ? "lunes" : "jueves";
    } else {
      // Si ya pasó el jueves de la semana actual, calcular el próximo Lunes
      const dayOfWeek = today.getDay(); // 0: Dom, 1: Lun, 2: Mar, 3: Mié, 4: Jue, 5: Vie, 6: Sáb
      let daysToAdd = 1;
      if (dayOfWeek === 0) daysToAdd = 1; // Dom -> Lun (+1)
      else if (dayOfWeek === 5) daysToAdd = 3; // Vie -> Lun (+3)
      else if (dayOfWeek === 6) daysToAdd = 2; // Sáb -> Lun (+2)
      else if (dayOfWeek < 4) daysToAdd = 4 - dayOfWeek; // Mar/Mié -> Jue
      else daysToAdd = 8 - dayOfWeek; // Jueves noche -> Lun

      const nextCanteDate = new Date(today);
      nextCanteDate.setDate(today.getDate() + daysToAdd);
      targetDateStr = getLocalDateString(nextCanteDate);
      canteKey = nextCanteDate.getDay() === 1 ? "lunes" : "jueves";
      targetDayName = canteKey === "lunes" ? "Lunes" : "Jueves";
      targetDayNumber = nextCanteDate.getDate();
      const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
      targetMonthName = monthNames[nextCanteDate.getMonth()];
      diffDays = daysToAdd;
    }

    // Buscar tareas de cante programadas para esa fecha específica
    const canteTasks = tasks.filter(
      (t) => t.date === targetDateStr && t.activityType === "cante"
    );

    return {
      date: targetDateStr,
      dayName: targetDayName,
      dayNumber: targetDayNumber,
      monthName: targetMonthName,
      diffDays,
      tasks: canteTasks,
      canteKey,
      isToday: diffDays === 0,
      isTomorrow: diffDays === 1
    };
  }, [weekPlan.days, tasks, topicMap, scheduleLunes, scheduleJueves]);

  // Conteo de tareas por filtro para los botones superiores
  const filterCounts = useMemo(() => {
    let estudioNuevo = 0;
    let refresco = 0;
    let repaso = 0;
    let cante = 0;
    let pendientes = 0;

    // Consideramos las tareas de la semana visible
    const weekDateSet = new Set(weekPlan.days.map((d) => d.date));
    tasks.forEach((t) => {
      if (weekDateSet.has(t.date)) {
        if (t.activityType === "estudio_nuevo") estudioNuevo++;
        if (t.activityType === "refresco") refresco++;
        if (t.activityType === "repaso") repaso++;
        if (t.activityType === "cante") cante++;
        if (t.status !== "completed") pendientes++;
      }
    });

    return {
      todos: weekPlan.totalTasksCount,
      estudio_nuevo: estudioNuevo,
      refresco,
      repaso,
      cante,
      pendientes
    };
  }, [tasks, weekPlan]);

  // Manejador: Añadir o Editar Tarea
  const handleSaveTask = (taskData: Omit<PlannerTask, "id" | "createdAt"> & { id?: string }) => {
    if (taskData.id) {
      // Edición
      const updated = tasks.map((t) => (t.id === taskData.id ? { ...t, ...taskData, pinned: true, planningOrigin: "manual" as const, confirmed: true } : t));
      persistTasks(updated);
      toast.success("Tarea actualizada correctamente.");
    } else {
      // Nueva tarea
      const newTask: PlannerTask = {
        ...taskData,
        pinned: true, planningOrigin: "manual", confirmed: true,
        id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        createdAt: new Date().toISOString()
      };
      persistTasks([...tasks, newTask]);
      toast.success(`Tarea añadida a la jornada de ${taskData.date}.`);
    }
  };

  // A completion requires its observed session; changing a checkbox never invents history.
  const handleToggleTaskStatus = (task: PlannerTask) => {
    if (task.status === "completed") {
      toast.info("La tarea está vinculada a una sesión real. Corrige esa sesión desde el historial si es necesario.");
      return;
    }
    handleQuickRegisterStudy(task);
  };

  // Manejador: Registrar sesión real de estudio en WellsPrep y sincronizar con historial y curvas
  const handleQuickRegisterStudy = (task: PlannerTask) => {
    const types = { estudio_nuevo: 'estudio_inicial', refresco: 'refresco', repaso: 'repaso', cante: 'canto' } as const;
    const canonical = getCanonicalTopic(task.topicId, allTopics, userProgress, recentSessions);
    setObservedTask({ task, target: {
      topicId: task.topicId, title: task.topicTitle, type: types[task.activityType],
      difficulty: canonical.difficulty, estimatedMinutes: task.estimatedMinutes,
      retentionPrediction: estimateRetentionForTopic(task.topicId),
      predictionSnapshot: (task.prediction || estimateTaskAdaptiveDetails(canonical, task.activityType, recentSessions, settings, task.refrescoIndex, userProgress, task.fromPage !== undefined && task.toPage !== undefined ? { fromPage: task.fromPage, toPage: task.toPage } : task.pagesCount ? { targetPages: task.pagesCount } : undefined, { allTopics, canonicalMap: topicState })).personalizedPrediction,
      metadata: {
        plannerTaskId: task.id, plannedDate: task.date, totalPages: canonical.pages || undefined, totalWords: canonical.numeroPalabras, pagesNumbers: task.pagesNumbers,
        startPage: task.fromPage, endPage: task.toPage, pagesCount: task.pagesCount,
        isPartial: Boolean(task.pagesCount && canonical.pages && task.pagesCount < canonical.pages),
      },
    } });
  };

  // Manejador: Eliminar tarea
  const handleDeleteTask = (taskId: string) => {
    playSound.click();
    const updated = tasks.filter((t) => t.id !== taskId);
    persistTasks(updated);
    toast.info("Tarea eliminada del planificador.");
  };

  // Manejador: Mover tarea a otro día
  const handleMoveTask = (taskId: string, newDate: string) => {
    playSound.click();
    const updated = tasks.map((t) => (t.id === taskId ? { ...t, date: newDate, pinned: true, planningOrigin: "manual" as const, confirmed: true } : t));
    persistTasks(updated);
    toast.success(`Tarea reubicada al ${newDate}.`);
  };

  // Manejador: Lanzar análisis de sobrecarga y propuesta de redistribución
  const handleTriggerRebalance = () => setIsCanteProposalOpen(true);

  // Manejador: Añadir recomendación de Ebbinghaus
  const handleAddEbbinghausReview = (topicId: string, dateStr: string) => {
    const canonical = getCanonicalTopic(topicId, allTopics, userProgress, recentSessions);
    const estMins = estimateTaskDurationMinutes(canonical, "repaso", recentSessions, settings, undefined, userProgress, undefined, { allTopics, canonicalMap: topicState });
    const newTask: PlannerTask = {
      id: `ebbinghaus-review-${topicId}-${Date.now()}`,
      topicId: canonical.id,
      topicNumber: canonical.number,
      topicTitle: canonical.title,
      subjectId: canonical.subjectId,
      activityType: "repaso",
      date: dateStr,
      status: "pending",
      estimatedMinutes: estMins,
      pagesCount: canonical.hasExplicitPages && canonical.pages > 0 ? canonical.pages : undefined,
      notes: "Repaso sugerido por decaimiento de retención en la Curva de Ebbinghaus.",
      createdAt: new Date().toISOString()
    };
    persistTasks([...tasks, newTask]);
    toast.success(`Repaso de T.${canonical.number} programado para el ${dateStr}.`);
  };

  const canteProposalBasis = useMemo(() => JSON.stringify({ tasks, settings, recentSessions, allTopics, plannerStoredBasis, retentionPolicy: userSettings?.retention }), [tasks, settings, recentSessions, allTopics, plannerStoredBasis, userSettings?.retention]);
  const handleGenerateCanteProposal = (config: CanteProposalConfig) => generateCantePlanProposal({
    canonicalMap: topicState,
    sessions: recentSessions,
    existingTasks: tasks,
    settings,
    canteGoals: config.canteGoals,
    horizonStart: config.horizonStart,
    horizonEnd: config.horizonEnd,
    asOf: config.horizonStart,
    forecastAt: new Date().toISOString(),
    refreshExceptions: config.refreshExceptions,
  });
  const handleConfirmCanteProposal = async (proposal: CantePlanProposal, config: CanteProposalConfig, basis: string) => {
    if (!plannerLoaded || !user) throw new Error("Espera a que se cargue la planificación guardada.");
    if (config.horizonStart !== getLocalDateString()) throw new Error("Ha cambiado el día desde que se calculó la propuesta. Genérala de nuevo para las fechas actuales.");
    if (basis !== canteProposalBasis) throw new Error("Los datos han cambiado. Genera de nuevo la propuesta antes de confirmar.");
    const candidateIds = new Set(proposal.candidateTasks.map(task => task.id));
    const confirmed = proposal.mergedTasks.map(task => candidateIds.has(task.id) ? { ...task, confirmed: true } : task);
    await persistTasks(confirmed, { proposal, config });
    toast.success(proposal.viability === "feasible" ? "Planificación confirmada y guardada." : "Planificación guardada con los conflictos indicados.");
  };

  // Deadline planning and delayed work use the same reviewable proposal flow.
  const handleSchedulePreCanteReviews = () => setIsCanteProposalOpen(true);
  const handleRescheduleDelayedTasks = () => setIsCanteProposalOpen(true);

  // A presentation shortcut into the existing real-session form. It never marks
  // a task complete or records time before the user enters an observation.
  const firstPendingToday = todayDayPlan?.tasks.find(task => task.status !== "completed" && task.activityType !== "cante")
    || todayDayPlan?.tasks.find(task => task.status !== "completed");

  return (
    <div className="mx-auto w-full max-w-[105rem] space-y-3 pb-6">
      <section aria-label="Hoy y próximo cante" data-testid="planner-today" className={cn(DS.card, "divide-y divide-slate-100 px-3 sm:px-4 lg:grid lg:grid-cols-2 lg:divide-x lg:divide-y-0")}>
        <div className="min-w-0 py-3 lg:pr-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
            <h2 className="text-sm font-bold text-slate-900">Hoy{todayDayPlan ? ` · ${todayDayPlan.dayName} ${todayDayPlan.dayNumber}` : ""}</h2>
            {todayDayPlan && <p className="text-xs text-slate-600">{todayDayPlan.tasks.length} tareas · {formatMinutesToHours(todayDayPlan.totalEstimatedMinutes)} estimados{todayDayPlan.unknownDurationTaskCount > 0 ? " · tiempo incompleto" : ""}</p>}
          </div>
          {firstPendingToday ? <div data-testid="planner-next-task" className="mt-2 flex min-w-0 items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 break-words text-sm font-semibold leading-snug text-slate-900" title={firstPendingToday.topicTitle}>T.{firstPendingToday.topicNumber} · {firstPendingToday.topicTitle}</p>
              <p className="mt-1 text-xs text-slate-600">{ACTIVITY_CONFIG[firstPendingToday.activityType].label} · {firstPendingToday.estimatedMinutes === null ? "Tiempo sin estimar" : `${formatMinutesToHours(firstPendingToday.estimatedMinutes)} previstos`}</p>
            </div>
            <button type="button" onClick={() => handleQuickRegisterStudy(firstPendingToday)} aria-label={`Registrar sesión real de T.${firstPendingToday.topicNumber}`} title="Registrar sesión real de la primera tarea de hoy" className={cn(DS.btnPrimary, "shrink-0 px-3")}>Registrar</button>
          </div> : <p className="mt-2 text-sm text-slate-600">{!todayDayPlan ? "Consulta hoy desde la semana actual." : todayDayPlan.tasks.length ? "Todas las tareas de hoy están marcadas como completadas." : "No hay tareas programadas para hoy."}</p>}
          {!todayDayPlan && <button type="button" onClick={() => { setWeekOffset(0); setMobileSelectedDate(todayStr); }} className={cn(DS.btnGhost, "mt-1")}>Volver a hoy</button>}
        </div>
        {nextCanteInfo && <div className="flex min-w-0 items-center justify-between gap-3 py-2 lg:pl-4">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-900">{nextCanteInfo.isToday ? "Cante de hoy" : "Próximo cante"} · {nextCanteInfo.dayName} {nextCanteInfo.dayNumber} {nextCanteInfo.monthName}</h2>
            <p className="mt-1 text-xs text-slate-600">{nextCanteInfo.tasks.length} temas asignados{nextCanteInfo.isTomorrow ? " · mañana" : ""}</p>
          </div>
          {onOpenPreparadorSession && <button type="button" onClick={() => onOpenPreparadorSession(nextCanteInfo.canteKey, nextCanteInfo.date)} aria-label={`Ver temas del cante del ${nextCanteInfo.dayName} ${nextCanteInfo.date}`} title="Cantar ante Preparador" className={cn(DS.iconButton, "shrink-0 border border-slate-200")}><ArrowRight size={18} aria-hidden="true" /></button>}
        </div>}
      </section>
      <section aria-labelledby="planner-week-title" data-testid="planner-week-controls" className={cn(DS.card, "p-3 sm:p-4")}>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 id="planner-week-title" className={cn(DS.titleSection, "text-sm sm:text-base")}>
              {safeParseDate(weekPlan.startDate).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
              {" – "}{safeParseDate(weekPlan.endDate).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
            </h2>
            <p className="mt-1 text-xs text-slate-600">{weekOffset === 0 ? "Semana actual" : `Semana ${weekOffset > 0 ? "+" : ""}${weekOffset}`} · {settings.targetDailyHours} h/día</p>
          </div>
          <div className="flex shrink-0 items-center gap-0.5 rounded-xl bg-slate-100 p-1" aria-label="Cambiar semana">
            <button type="button" aria-label="Semana anterior" title="Semana anterior"
              onClick={() => { playSound.click(); setWeekOffset(value => value - 1); }}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-700 hover:bg-white"><ChevronLeft size={18} aria-hidden="true" /></button>
            {weekOffset !== 0 && <button type="button" title="Volver a la semana actual"
              onClick={() => { playSound.click(); setWeekOffset(0); }}
              className="min-h-[44px] rounded-lg px-2 text-sm font-bold text-slate-700 hover:bg-white">Hoy</button>}
            <button type="button" aria-label="Semana siguiente" title="Semana siguiente"
              onClick={() => { playSound.click(); setWeekOffset(value => value + 1); }}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-700 hover:bg-white"><ChevronRight size={18} aria-hidden="true" /></button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" disabled={!plannerLoaded} onClick={() => setIsCanteProposalOpen(true)}
            className={cn(DS.btnPrimary, "min-h-[44px] min-w-0 px-2")} aria-label="Planificar cantes" title="Preparar los temas antes de sus fechas de cante">
            <CalendarIcon size={16} aria-hidden="true" className="shrink-0" /><span className="sm:hidden">Planificar</span><span className="hidden sm:inline">Planificar cantes</span>
          </button>
          <button type="button" onClick={() => {
            setTargetDateForNewTask(weekPlan.days.some(day => day.date === mobileSelectedDate) ? mobileSelectedDate : weekPlan.startDate);
            setEditingTask(null); setIsTaskEditorOpen(true);
          }} className={cn(DS.btnSecondary, "min-h-[44px] min-w-0 px-2")}>
            <Plus size={16} aria-hidden="true" className="shrink-0" /><span>Añadir tarea</span>
          </button>

        </div>
        <div className="mt-2 grid grid-cols-2 items-start gap-2">
        <details className="min-w-0 open:col-span-2">
          <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold text-slate-600">
            <span>Filtrar tareas{activityFilter !== "todos" || searchTopicQuery ? " · Filtro activo" : ""}</span><ChevronDown size={16} aria-hidden="true" />
          </summary>
        {/* 2. ACTIVITY FILTER AND SEARCH BAR */}
        <div className="pt-3 border-t border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Activity Filters */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 mr-1 shrink-0">
              Filtrar:
            </span>

            {/* Todos */}
            <button
              type="button"
              aria-pressed={activityFilter === "todos"}
              onClick={() => setActivityFilter("todos")}
              className={cn(
                "min-h-[44px] px-3 py-2 rounded-xl text-sm font-bold transition-all shrink-0 flex items-center gap-1.5",
                activityFilter === "todos"
                  ? "bg-slate-900 text-white shadow-2xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              <span>Todos</span>
              <span className={cn(
                "text-[10px] px-1 rounded-md font-mono",
                activityFilter === "todos" ? "bg-slate-800 text-slate-200" : "bg-slate-200/80 text-slate-600"
              )}>
                {filterCounts.todos}
              </span>
            </button>

            {/* Estudio Nuevo */}
            <button
              type="button"
              aria-pressed={activityFilter === "estudio_nuevo"}
              onClick={() => setActivityFilter("estudio_nuevo")}
              className={cn(
                "min-h-[44px] px-3 py-2 rounded-xl text-sm font-bold transition-all shrink-0 flex items-center gap-1.5",
                activityFilter === "estudio_nuevo"
                  ? "bg-blue-600 text-white shadow-2xs"
                  : "bg-blue-50 text-blue-800 hover:bg-blue-100 border border-blue-200/60"
              )}
            >
              <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
              <span>Estudio Nuevo</span>
              <span className="text-[10px] px-1 rounded-md font-mono bg-blue-900/20">
                {filterCounts.estudio_nuevo}
              </span>
            </button>

            {/* Refresco */}
            <button
              type="button"
              aria-pressed={activityFilter === "refresco"}
              onClick={() => setActivityFilter("refresco")}
              className={cn(
                "min-h-[44px] px-3 py-2 rounded-xl text-sm font-bold transition-all shrink-0 flex items-center gap-1.5",
                activityFilter === "refresco"
                  ? "bg-orange-600 text-white shadow-2xs"
                  : "bg-orange-50 text-orange-800 hover:bg-orange-100 border border-orange-200/60"
              )}
            >
              <span className="w-2 h-2 rounded-full bg-orange-500 shrink-0" />
              <span>Refresco</span>
              <span className="text-[10px] px-1 rounded-md font-mono bg-orange-900/20">
                {filterCounts.refresco}
              </span>
            </button>

            {/* Repaso */}
            <button
              type="button"
              aria-pressed={activityFilter === "repaso"}
              onClick={() => setActivityFilter("repaso")}
              className={cn(
                "min-h-[44px] px-3 py-2 rounded-xl text-sm font-bold transition-all shrink-0 flex items-center gap-1.5",
                activityFilter === "repaso"
                  ? "bg-emerald-600 text-white shadow-2xs"
                  : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200/60"
              )}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <span>Repaso</span>
              <span className="text-[10px] px-1 rounded-md font-mono bg-emerald-900/20">
                {filterCounts.repaso}
              </span>
            </button>

            {/* Cante */}
            <button
              type="button"
              aria-pressed={activityFilter === "cante"}
              onClick={() => setActivityFilter("cante")}
              className={cn(
                "min-h-[44px] px-3 py-2 rounded-xl text-sm font-bold transition-all shrink-0 flex items-center gap-1.5",
                activityFilter === "cante"
                  ? "bg-purple-600 text-white shadow-2xs"
                  : "bg-purple-50 text-purple-800 hover:bg-purple-100 border border-purple-200/60"
              )}
            >
              <span className="w-2 h-2 rounded-full bg-purple-500 shrink-0" />
              <span>Cante</span>
              <span className="text-[10px] px-1 rounded-md font-mono bg-purple-900/20">
                {filterCounts.cante}
              </span>
            </button>

            {/* Solo Pendientes */}
            <button
              type="button"
              aria-pressed={activityFilter === "pendientes"}
              onClick={() => setActivityFilter("pendientes")}
              className={cn(
                "min-h-[44px] px-3 py-2 rounded-xl text-sm font-bold transition-all shrink-0 flex items-center gap-1.5 ml-1",
                activityFilter === "pendientes"
                  ? "bg-amber-600 text-white shadow-2xs"
                  : "bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200/60"
              )}
            >
              <span>Pendientes</span>
              <span className="text-[10px] px-1 rounded-md font-mono bg-amber-900/20">
                {filterCounts.pendientes}
              </span>
            </button>
          </div>

          {/* Quick Search in Week */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              aria-label="Buscar tema en la semana"
              placeholder="Buscar tema en la semana..."
              value={searchTopicQuery}
              onChange={(e) => setSearchTopicQuery(e.target.value)}
              className="min-h-[44px] px-3 py-2 bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-indigo-600 w-full sm:w-56 transition-all"
            />
            {searchTopicQuery && (
              <button
                type="button"
                onClick={() => setSearchTopicQuery("")}
                aria-label="Borrar búsqueda de tareas"
                className="min-h-[44px] min-w-[44px] text-xs text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            )}
          </div>
        </div>
        </details>
          <details className="relative justify-self-end">
            <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-1 rounded-xl px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100">
              Opciones <ChevronDown size={16} aria-hidden="true" />
            </summary>
            <div className="absolute right-0 top-full z-30 mt-2 w-72 space-y-1 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg">
              <button type="button" onClick={event => { playSound.click(); setIsEbbinghausModalOpen(true); event.currentTarget.closest("details")?.removeAttribute("open"); }}
                className={cn(DS.btnGhost, "min-h-[44px] w-full text-left")} title="Añadir temas que necesitan repaso según la curva del olvido">
                <Brain size={16} aria-hidden="true" />Sugerencias Ebbinghaus
              </button>
              <button type="button" onClick={event => { playSound.click(); handleTriggerRebalance(); event.currentTarget.closest("details")?.removeAttribute("open"); }}
                className={cn(DS.btnGhost, "min-h-[44px] w-full text-left")} title="Detectar sobrecargas y proponer redistribución inteligente">
                <Sparkles size={16} aria-hidden="true" />Redistribuir Semana
                {weekPlan.overloadedDaysCount > 0 && <span className="rounded-full bg-amber-100 px-2 text-xs text-amber-900">{weekPlan.overloadedDaysCount}</span>}
              </button>
              <button type="button" onClick={event => { playSound.click(); setIsSettingsModalOpen(true); event.currentTarget.closest("details")?.removeAttribute("open"); }}
                className={cn(DS.btnGhost, "min-h-[44px] w-full text-left")} title="Configurar velocidades y horas">
                <Sliders size={16} aria-hidden="true" />Disponibilidad y tiempos
              </button>
            </div>
          </details>
        </div>
      </section>


      {weekPlan.proactiveWarnings && weekPlan.proactiveWarnings.length > 0 && <details className="rounded-2xl border border-amber-200 bg-amber-50 px-4">
        <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold text-amber-900">
          <span className="flex items-center gap-2"><AlertTriangle size={16} aria-hidden="true" />{weekPlan.proactiveWarnings.length} avisos de la semana{weekPlan.unknownDurationTaskCount > 0 ? " · faltan estimaciones" : ""}</span><ChevronDown size={16} aria-hidden="true" />
        </summary>
        <ul className="space-y-2 pb-3 text-sm leading-relaxed text-amber-950">{weekPlan.proactiveWarnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>
      </details>}

      {/* 3. ALERT FOR DELAYED TASKS (IF ANY) */}
      {weekPlan.delayedTasksCount > 0 && (
        <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5 text-amber-950 font-medium">
            <AlertTriangle size={16} className="text-amber-600 shrink-0" />
            <span>
              Tienes <strong className="font-bold">{weekPlan.delayedTasksCount} tareas pendientes</strong> de días anteriores que no se han completado.
            </span>
          </div>
          <button
            type="button"
            onClick={handleRescheduleDelayedTasks}
            className="min-h-[44px] px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold transition-all shadow-2xs shrink-0"
          >
            Revisar atrasadas
          </button>
        </div>
      )}

      {/* 5. MOBILE DAY SELECTOR (Visible en pantallas pequeñas con puntos de color de actividad) */}
      <div aria-label="Seleccionar día de la semana"
      className="md:hidden flex items-center justify-between gap-1 overflow-x-auto no-scrollbar p-1.5 bg-white rounded-2xl border border-slate-200">
        {weekPlan.days.map((day) => {
          const isSelected = mobileSelectedDate === day.date;
          return (
            <button
              key={day.date}
              type="button"
              aria-pressed={isSelected}
              aria-label={`${day.dayName} ${day.dayNumber} ${day.monthName}${day.isToday ? ", hoy" : ""}, ${day.tasks.length} tareas`}
              onClick={() => setMobileSelectedDate(day.date)}
              className={cn(
                "flex-1 min-h-[64px] py-2 px-1 text-center rounded-xl transition-all min-w-[44px]",
                isSelected
                  ? "bg-slate-900 text-white shadow-xs font-bold"
                  : "text-slate-600 hover:bg-slate-100"
              )}
            >
              <span className="text-[11px] font-semibold block uppercase">{day.shortName}</span>
              <span className="text-sm font-black font-serif tabular-nums block mt-0.5">{day.dayNumber}</span>
              
              {/* Activity Indicator Dots on Mobile */}
              <div className="flex items-center justify-center gap-0.5 mt-1">
                {day.hasEstudioNuevo && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" title="Estudio Nuevo" />}
                {day.hasRefresco && <span className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" title="Refresco" />}
                {day.hasRepaso && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" title="Repaso" />}
                {day.hasCante && <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0" title="Cante" />}
              </div>
            </button>
          );
        })}
      </div>

      {/* 6. MASTER 7-DAY VISUAL CALENDAR GRID */}
      <div className="grid grid-cols-1 md:grid-cols-7 gap-3 sm:gap-3.5 items-start">
        {weekPlan.days.map((day) => {
          const isMobileVisible = mobileSelectedDate === day.date;

          // Filtrar tareas según el filtro superior activo y el buscador
          const visibleTasks = day.tasks.filter((task) => {
            if (activityFilter === "pendientes" && task.status === "completed") return false;
            if (activityFilter !== "todos" && activityFilter !== "pendientes" && task.activityType !== activityFilter) return false;
            if (searchTopicQuery.trim()) {
              const q = searchTopicQuery.toLowerCase().trim();
              const matchNumber = task.topicNumber.toString().includes(q);
              const matchTitle = task.topicTitle.toLowerCase().includes(q);
              if (!matchNumber && !matchTitle) return false;
            }
            return true;
          });

          return (
            <div
              key={day.date}
              className={cn(
                "bg-[var(--wp-surface)] rounded-2xl border transition-colors flex flex-col min-h-[260px] md:min-h-[400px] relative overflow-hidden",
                day.isToday ? "border-indigo-400 ring-2 ring-indigo-200/60" : "border-slate-200/85",
                day.isOverloaded && "border-amber-300 ring-1 ring-amber-200",
                !isMobileVisible && "hidden md:flex"
              )}
            >
              {/* Day Column Header */}
              <div className={cn(
                "p-3.5 border-b flex flex-col gap-1 transition-colors",
                day.isToday ? "bg-indigo-50/50 border-indigo-100" : "bg-slate-50/70 border-slate-100"
              )}>
                <div className="flex items-center justify-between">
                  <span className={cn(
                    "text-[10px] font-black uppercase font-mono tracking-wider",
                    day.isCanteOfficialDay ? "text-purple-700" : "text-slate-500"
                  )}>
                    {day.dayName}
                  </span>

                  {day.isToday && (
                    <span className="text-[9px] font-black uppercase px-1.5 py-0.2 rounded-md bg-indigo-600 text-white font-mono">
                      Hoy
                    </span>
                  )}
                </div>

                <div className="flex items-baseline justify-between mt-0.5">
                  <div className="flex items-baseline gap-1">
                    <span className="text-xl font-black font-serif text-slate-900 tabular-nums">
                      {day.dayNumber}
                    </span>
                    <span className="text-xs text-slate-400 font-medium">
                      {day.monthName}
                    </span>
                  </div>

                  <span className={cn(
                    "font-mono text-xs font-bold",
                    day.isOverloaded ? "text-amber-700" : "text-slate-600"
                  )}>
                    {formatMinutesToHours(day.totalEstimatedMinutes)}
                  </span>
                </div>

                {/* Overload Alert Badge */}
                {day.isOverloaded && (
                  <div className="mt-1 p-1 px-2 rounded-lg bg-amber-100 text-amber-900 text-[10px] font-bold flex items-center justify-between">
                    <span>Sobrecarga:</span>
                    <span>+{Math.round(day.overloadMinutes)} min</span>
                  </div>
                )}

                {/* Cante Official Day Badge */}
                {day.isCanteOfficialDay && (
                  <div className="mt-1 flex items-center justify-between text-[10px] text-purple-800 font-bold px-2 py-0.5 bg-purple-100/70 rounded-lg">
                    <span className="flex items-center gap-1">
                      <Award size={11} />
                      <span>Cante</span>
                    </span>
                    {onOpenPreparadorSession && (
                      <button
                        type="button"
                        onClick={() => onOpenPreparadorSession(day.shortName === "LUN" ? "lunes" : "jueves", day.date)}
                        aria-label={`Abrir cante del ${day.dayName}`}
                        className="min-h-[44px] min-w-[44px] px-1 text-sm font-semibold text-purple-900 hover:underline"
                      >
                        Abrir
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Tasks List inside Day Column */}
              <div className="flex-1 space-y-2 p-2 md:max-h-[640px] md:overflow-y-auto">
                {visibleTasks.length === 0 ? (
                  <div className="p-4 text-center border border-dashed border-slate-200 rounded-2xl text-[11px] text-slate-400 mt-2">
                    {day.tasks.length > 0 ? "Sin coincidencias con el filtro" : "Sin tareas programadas"}
                  </div>
                ) : (
                  visibleTasks.map((task) => {
                    const cfg = ACTIVITY_CONFIG[task.activityType];
                    const isDone = task.status === "completed";
                    const isDelayed = task.status === "delayed";

                    return (
                      <div
                        key={task.id}
                        role="group"
                        aria-labelledby={`task-title-${task.id}`}
                        className={cn(
                          "p-2.5 sm:p-3 rounded-2xl border transition-all text-left relative group",
                          cfg.bgClass,
                          cfg.borderClass,
                          isDone && "opacity-60 saturate-50 bg-slate-50 border-slate-200",
                          isDelayed && "border-amber-400 shadow-2xs"
                        )}
                      >
                        {/* Task Top Meta */}
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className={cn("w-2 h-2 rounded-full shrink-0", cfg.dotClass)} />
                            <span className={cn("text-[10px] font-bold uppercase tracking-wider truncate", cfg.textClass)}>
                              {task.refrescoIndex ? `Refresco ${task.refrescoIndex}/3` : cfg.label}
                            </span>
                          </div>

                          <span className="font-mono text-[10px] text-slate-500 font-bold shrink-0">
                            {task.estimatedMinutes === null || task.estimatedMinutes === undefined ? 'Sin estimación' : `~${task.estimatedMinutes}m`}
                            {task.prediction?.interval && <span className="block font-normal">{Math.round(task.prediction.interval.low)}–{Math.round(task.prediction.interval.high)}m · n={task.prediction.evidenceCount}</span>}
                          </span>
                        </div>

                        {/* Topic Title */}
                        <div className="flex items-start gap-2">
                          <button
                            type="button"
                            onClick={() => handleToggleTaskStatus(task)}
                            aria-label={`${isDone ? "Marcar pendiente" : "Marcar completada"} la tarea del tema ${task.topicNumber}`}
                            aria-pressed={isDone}
                            className="flex min-h-[44px] min-w-[44px] shrink-0 items-start justify-center rounded-lg pt-1 text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"
                            title={isDone ? "Marcar pendiente" : "Marcar completado"}
                          >
                            <span className={cn("flex h-5 w-5 items-center justify-center rounded-md border", isDone ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-400 bg-white")}>
                              {isDone && <Check size={12} strokeWidth={3} aria-hidden="true" />}
                            </span>
                          </button>

                          <div className="min-w-0 flex-1">
                            <h4 id={`task-title-${task.id}`} className={cn(
                              "text-sm font-semibold leading-snug line-clamp-3",
                              isDone ? "line-through text-slate-500" : "text-slate-900"
                            )}>
                              <span className="font-mono text-slate-700 mr-1">T.{task.topicNumber}</span>
                              <span>{task.topicTitle}</span>
                            </h4>

                            <div className="flex items-center gap-1.5 mt-1 text-[10px] text-slate-500 font-mono">
                              {task.pagesCount && task.pagesCount > 0 ? (
                                <span>{task.pagesCount} págs</span>
                              ) : (
                                <span className="text-slate-400 italic">Págs sin registrar</span>
                              )}
                              {task.notes && (
                                <>
                                  <span>·</span>
                                  <span className="italic line-clamp-1">{task.notes}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 space-y-1 border-t border-slate-200/70 pt-2">
                          <button type="button" onClick={() => handleQuickRegisterStudy(task)}
                            aria-label={`Registrar sesión real para el tema ${task.topicNumber}`}
                            className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-white px-2 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-50"
                            title="Registrar estudio real en WellsPrep y marcar tarea como completada">
                            <Clock size={15} aria-hidden="true" /><span>Registrar</span>
                          </button>
                          <div className="flex items-start gap-1">
                            <button type="button" onClick={() => { setEditingTask(task); setTargetDateForNewTask(task.date); setIsTaskEditorOpen(true); }}
                              aria-label={`Editar tarea del tema ${task.topicNumber}`} title="Editar tarea" className={DS.iconButton}>
                              <Edit3 size={16} aria-hidden="true" />
                            </button>
                            <details className="min-w-0 flex-1">
                              <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-center gap-1 rounded-xl px-2 text-sm font-medium text-slate-700 hover:bg-white/80">
                                Más <ChevronDown size={14} aria-hidden="true" />
                              </summary>
                              <div className="space-y-1 border-t border-slate-200/70 pt-1">
                                <button type="button" onClick={() => {
                                  const nextDay = new Date(safeParseDate(day.date)); nextDay.setDate(nextDay.getDate() + 1);
                                  handleMoveTask(task.id, getLocalDateString(nextDay));
                                }} aria-label={`Pasar la tarea del tema ${task.topicNumber} al día siguiente`} title="Pasar al día siguiente"
                                  className="flex min-h-[44px] w-full items-center justify-center gap-1 rounded-lg px-2 py-2 text-sm text-slate-700 hover:bg-white/80">
                                  <MoveRight size={15} aria-hidden="true" /><span>Mover</span>
                                </button>
                                <button type="button" onClick={() => handleDeleteTask(task.id)} aria-label={`Eliminar tarea del tema ${task.topicNumber}`} title="Eliminar tarea"
                                  className="flex min-h-[44px] w-full items-center justify-center gap-1 rounded-lg px-2 py-2 text-sm text-rose-800 hover:bg-rose-50">
                                  <Trash2 size={15} aria-hidden="true" /><span>Eliminar</span>
                                </button>
                              </div>
                            </details>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Bottom Quick Add Button */}
              <div className="p-2 border-t border-slate-100 bg-slate-50/50">
                <button
                  type="button"
                  onClick={() => {
                    setTargetDateForNewTask(day.date);
                    setEditingTask(null);
                    setIsTaskEditorOpen(true);
                  }}
                  aria-label={`Añadir tarea al ${day.dayName} ${day.dayNumber}`}
                  className="min-h-[44px] w-full py-2 px-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200/80 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 shadow-2xs hover:shadow-xs active:scale-98"
                >
                  <Plus size={13} strokeWidth={2.5} />
                  <span>Añadir</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <details className={cn(DS.card, "p-4")}>
        <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-2 text-sm font-bold text-slate-700">
          Balance de la semana y ritmo personal <ChevronDown size={16} aria-hidden="true" />
        </summary>
        {/* Balance Semanal Previsto vs Real (Columna 7/12 en desktop) */}
        <div className="space-y-3 pt-3">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">
                  Tiempo y tareas de esta semana
                </span>
              </div>

              {/* Intensity Badge */}
              <span className={cn(
                "text-[10px] font-black uppercase tracking-wider font-mono px-2.5 py-0.5 rounded-full border",
                weekPlan.intensityLevel === "optima" && "bg-emerald-50 text-emerald-800 border-emerald-200",
                weekPlan.intensityLevel === "exigente" && "bg-blue-50 text-blue-800 border-blue-200",
                weekPlan.intensityLevel === "sobrecargada" && "bg-amber-50 text-amber-900 border-amber-200"
              )}>
                Carga {weekPlan.intensityLevel === "optima" ? "Óptima" : weekPlan.intensityLevel === "exigente" ? "Exigente" : "Sobrecargada"}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
              {/* Previsto */}
              <div className="p-2.5 rounded-2xl bg-slate-50 border border-slate-100">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 block">
                  Previsto
                </span>
                <span className="text-lg font-black font-serif text-slate-900 block mt-0.5">
                  {weekPlan.totalEstimatedHours}h{weekPlan.unknownDurationTaskCount > 0 ? ' conocidas' : ''}
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  {weekPlan.totalTasksCount} tareas{weekPlan.unknownDurationTaskCount > 0 ? ` · ${weekPlan.unknownDurationTaskCount} sin estimación` : ''}
                </span>
              </div>

              {/* Real (AeroFocus + Manual) */}
              <div className="p-2.5 rounded-2xl bg-indigo-50/70 border border-indigo-100/80">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-indigo-700 block">
                  Estudio Real
                </span>
                <span className="text-lg font-black font-serif text-indigo-950 block mt-0.5">
                  {weekPlan.totalActualHours}h
                </span>
                <span className="text-[10px] text-indigo-700/80 font-mono">
                  registradas en sesiones
                </span>
              </div>

              {/* Variación */}
              <div className="p-2.5 rounded-2xl bg-slate-50 border border-slate-100">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 block">
                  Diferencia
                </span>
                <span className={cn(
                  "text-lg font-black font-serif block mt-0.5",
                  weekPlan.hoursVariance >= 0 ? "text-emerald-700" : "text-amber-700"
                )}>
                  {weekPlan.unknownDurationTaskCount > 0 ? 'Sin comparación completa' : weekPlan.hoursVariance >= 0 ? `+${weekPlan.hoursVariance}h` : `${weekPlan.hoursVariance}h`}
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  vs estimado
                </span>
              </div>

              {/* Tasa Cumplimiento */}
              <div className="p-2.5 rounded-2xl bg-slate-50 border border-slate-100">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 block">
                  Avance
                </span>
                <span className="text-lg font-black font-serif text-emerald-800 block mt-0.5">
                  {weekPlan.completionRatePct}%
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  {weekPlan.totalCompletedTasks}/{weekPlan.totalTasksCount} hechas
                </span>
              </div>
            </div>

            {/* Ciclo de Aprendizaje Empírico & Calibración de Tiempos */}
            {learnerProfile && (
              <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-600 flex-wrap gap-2">
                <div className="flex items-center gap-1.5 font-mono">
                  <span className="font-bold text-slate-800">Ritmo personal:</span>
                  <span className="bg-blue-50 text-blue-800 px-1.5 py-0.2 rounded border border-blue-200">
                    Estudio: {learnerProfile.studyPaceMinPerPage === null ? 'sin datos' : `${learnerProfile.studyPaceMinPerPage}m/p`}
                  </span>
                  <span className="bg-emerald-50 text-emerald-800 px-1.5 py-0.2 rounded border border-emerald-200">
                    Repaso: {learnerProfile.reviewPaceMinPerPage === null ? 'sin datos' : `${learnerProfile.reviewPaceMinPerPage}m/p`}
                  </span>
                  <span className="bg-orange-50 text-orange-800 px-1.5 py-0.2 rounded border border-orange-200">
                    Refresco: {learnerProfile.refreshPaceMinPerPage === null ? 'sin datos' : `${learnerProfile.refreshPaceMinPerPage}m/p`}
                  </span>
                </div>

                {learnerProfile.predictionAccuracy && (
                  <div className="flex items-center gap-1 text-[10px] font-mono font-bold text-indigo-700 bg-indigo-50/80 px-2 py-0.5 rounded-full border border-indigo-200">
                    <span>Error medio: {learnerProfile.predictionAccuracy.meanAbsoluteErrorMinutes} min</span>
                    <span>· {learnerProfile.predictionAccuracy.totalEvaluatedSessions} sesiones · {learnerProfile.predictionAccuracy.sampleConfidence}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Progress Bar */}
          <div className="mt-3 pt-2.5 border-t border-slate-100">
            <div role="progressbar" aria-label="Tareas de la semana completadas" aria-valuemin={0} aria-valuemax={100} aria-valuenow={weekPlan.completionRatePct} className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
              <div
                className="bg-emerald-600 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, weekPlan.completionRatePct)}%` }}
              />
            </div>
          </div>
        </div>
      </details>

      {/* 7. MODALS */}
      {observedTask && <StudySessionDialog target={observedTask.target} onClose={() => setObservedTask(null)} onSave={async session => {
        const recordedId = await addStudySession(session as any);
        const task = observedTask.task;
        let updated = tasks.map(item => item.id === task.id ? {
          ...item, status: 'completed' as const, actualMinutes: session.durationMinutes + Number(session.cantoSeconds || 0) / 60,
          completedAt: new Date().toISOString(), recordedDate: session.date,
          sessionId: recordedId || `planner-${encodeURIComponent(task.id)}`, sessionLinkStatus: "linked" as const,
        } : item);
        if (task.activityType === 'estudio_nuevo') {
          const nextHistory = [...recentSessions, { ...session, id: recordedId || `planner-${encodeURIComponent(task.id)}` } as Session];
          const nextCanonicalMap = buildCanonicalTopicMap(allTopics, userProgress, nextHistory);
          updated = [...updated, ...generateAutoRefrescos({ ...task, date: session.date }, topicMap.get(task.topicId), updated, settings, userProgress, nextHistory, { allTopics, canonicalMap: nextCanonicalMap })];
        }
        await persistTasks(updated);
      }} />}
      {/* A. Task Editor Modal */}
      <TaskEditorModal
        isOpen={isTaskEditorOpen}
        onClose={() => {
          setIsTaskEditorOpen(false);
          setEditingTask(null);
        }}
        onSaveTask={handleSaveTask}
        initialTask={editingTask}
        initialDate={targetDateForNewTask}
        allTopics={allTopics}
        sessions={recentSessions}
        userProgress={userProgress}
        settings={settings}
        onUpdateTopicProgress={updateTopicProgress}
      />

      <CantePlanProposalModal
        isOpen={isCanteProposalOpen}
        suspended={isSettingsModalOpen}
        onClose={() => setIsCanteProposalOpen(false)}
        topics={allTopics}
        existingTasks={tasks}
        scheduleLunes={scheduleLunes}
        scheduleJueves={scheduleJueves}
        settings={settings}
        basisVersion={canteProposalBasis}
        initialExceptions={savedRefreshExceptions}
        draftGoal={draftCanteGoal}
        explicitEmptyDates={explicitEmptyDates}
        onGenerate={handleGenerateCanteProposal}
        onConfirm={handleConfirmCanteProposal}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
      />

      {/* C. Ebbinghaus Recommendations Modal */}
      <EbbinghausRecommendationsModal
        isOpen={isEbbinghausModalOpen}
        onClose={() => setIsEbbinghausModalOpen(false)}
        allTopics={allTopics}
        userProgress={userProgress}
        recentSessions={recentSessions}
        weekDays={weekPlan.days}
        onAddReviewTask={(topicId, dateStr) => {
          handleAddEbbinghausReview(topicId, dateStr);
          setIsEbbinghausModalOpen(false);
        }}
      />

      {/* D. Planner Settings Modal */}
      <PlannerSettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        settings={settings}
        onSaveSettings={persistSettings}
      />
    </div>
  );
};
