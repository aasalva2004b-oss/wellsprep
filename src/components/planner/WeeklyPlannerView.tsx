import React, { useState, useMemo, useEffect } from "react";
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
import { TopicProgressData } from "../../lib/prediction";
import { 
  PlannerTask, 
  PlannerActivityType, 
  PlannerSettings, 
  DEFAULT_PLANNER_SETTINGS, 
  ACTIVITY_CONFIG, 
  buildWeekPlan, 
  generateAutoRefrescos, 
  proposeSmartRebalance, 
  RebalanceProposal,
  estimateTaskDurationMinutes
} from "../../lib/plannerEngine";
import { TaskEditorModal } from "./TaskEditorModal";
import { RebalanceConfirmModal } from "./RebalanceConfirmModal";
import { EbbinghausRecommendationsModal } from "./EbbinghausRecommendationsModal";
import { PlannerSettingsModal } from "./PlannerSettingsModal";
import { cn, formatMinutesToHours, getLocalDateString, safeParseDate } from "../../lib/utils";
import { playSound } from "../../lib/sound";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useFirebase } from "../../lib/FirebaseProvider";

const STORAGE_TASKS_KEY = "wellsprep_judicial_planner_tasks_v2";
const STORAGE_SETTINGS_KEY = "wellsprep_judicial_planner_settings_v2";

interface WeeklyPlannerViewProps {
  allTopics: Topic[];
  scheduleLunes?: string[];
  scheduleJueves?: string[];
  onOpenPreparadorSession?: (day: "lunes" | "jueves") => void;
}

export const WeeklyPlannerView: React.FC<WeeklyPlannerViewProps> = ({
  allTopics,
  scheduleLunes = [],
  scheduleJueves = [],
  onOpenPreparadorSession
}) => {
  const { user, userProgress, recentSessions, addStudySession } = useFirebase();

  // 1. Estados de Navegación Semanal
  const [weekOffset, setWeekOffset] = useState<number>(0);
  const [mobileSelectedDate, setMobileSelectedDate] = useState<string>(() => getLocalDateString());
  const [activityFilter, setActivityFilter] = useState<PlannerActivityType | "todos" | "pendientes">("todos");
  const [searchTopicQuery, setSearchTopicQuery] = useState<string>("");

  // 2. Ajustes configurables del planificador
  const [settings, setSettings] = useState<PlannerSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_SETTINGS_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    return DEFAULT_PLANNER_SETTINGS;
  });

  // 3. Tareas almacenadas del planificador
  const [tasks, setTasks] = useState<PlannerTask[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_TASKS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error(e);
    }
    return [];
  });

  // 4. Modales
  const [isTaskEditorOpen, setIsTaskEditorOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<PlannerTask | null>(null);
  const [targetDateForNewTask, setTargetDateForNewTask] = useState<string>(getLocalDateString());

  const [isRebalanceModalOpen, setIsRebalanceModalOpen] = useState(false);
  const [currentProposal, setCurrentProposal] = useState<RebalanceProposal | null>(null);

  const [isEbbinghausModalOpen, setIsEbbinghausModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // Mapa de temas para acceso O(1)
  const topicMap = useMemo(() => {
    const map = new Map<string, Topic>();
    allTopics.forEach((t) => map.set(t.id, t));
    return map;
  }, [allTopics]);

  // Sincronizar tareas y configuración con Firestore
  useEffect(() => {
    if (!user) return;
    const loadFromFirestore = async () => {
      try {
        const ref = doc(db, `users/${user.uid}/settings/weeklyPlannerState`);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data();
          if (Array.isArray(data.tasks) && data.tasks.length > 0) {
            setTasks(data.tasks);
            localStorage.setItem(STORAGE_TASKS_KEY, JSON.stringify(data.tasks));
          }
          if (data.settings) {
            setSettings(data.settings);
            localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(data.settings));
          }
        }
      } catch (e) {
        console.error("Error loading planner state from Firestore:", e);
      }
    };
    loadFromFirestore();
  }, [user]);

  // Guardar en Firestore y LocalStorage
  const persistTasks = async (updatedTasks: PlannerTask[]) => {
    setTasks(updatedTasks);
    try {
      localStorage.setItem(STORAGE_TASKS_KEY, JSON.stringify(updatedTasks));
      if (user) {
        const ref = doc(db, `users/${user.uid}/settings/weeklyPlannerState`);
        await setDoc(ref, {
          userId: user.uid,
          tasks: updatedTasks,
          updatedAt: serverTimestamp()
        }, { merge: true });
      }
    } catch (e) {
      console.error("Error saving planner tasks:", e);
    }
  };

  const persistSettings = async (newSettings: PlannerSettings) => {
    setSettings(newSettings);
    try {
      localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(newSettings));
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

  // Sembrado inicial inteligente con los temas oficiales de cante si la lista está vacía
  useEffect(() => {
    if (tasks.length === 0) {
      let effectiveLunes = scheduleLunes;
      let effectiveJueves = scheduleJueves;
      if (effectiveLunes.length === 0 && effectiveJueves.length === 0) {
        try {
          const saved = localStorage.getItem("wellsprep_preparador_schedule_v2");
          if (saved) {
            const parsed = JSON.parse(saved);
            effectiveLunes = parsed.lunes || [];
            effectiveJueves = parsed.jueves || [];
          }
        } catch (e) {
          console.error(e);
        }
      }
      if (effectiveLunes.length === 0 && effectiveJueves.length === 0) {
        effectiveLunes = ["constitucional-1", "constitucional-2"];
        effectiveJueves = ["constitucional-3", "constitucional-4", "constitucional-5"];
      }

      const today = new Date();
      const distToMon = today.getDay() === 0 ? -6 : 1 - today.getDay();
      const monday = new Date(today);
      monday.setDate(today.getDate() + distToMon);

      const thursday = new Date(monday);
      thursday.setDate(monday.getDate() + 3);

      const monStr = getLocalDateString(monday);
      const thuStr = getLocalDateString(thursday);

      const initialList: PlannerTask[] = [];

      effectiveLunes.forEach((id) => {
        const t = topicMap.get(id);
        if (t) {
          initialList.push({
            id: `cante-lunes-${id}`,
            topicId: t.id,
            topicNumber: t.number,
            topicTitle: t.title,
            subjectId: t.subjectId,
            activityType: "cante",
            date: monStr,
            status: "pending",
            estimatedMinutes: settings.duracionEstimadaCantePorTemaMinutos,
            pagesCount: t.pages || 18,
            createdAt: new Date().toISOString()
          });
        }
      });

      effectiveJueves.forEach((id) => {
        const t = topicMap.get(id);
        if (t) {
          initialList.push({
            id: `cante-jueves-${id}`,
            topicId: t.id,
            topicNumber: t.number,
            topicTitle: t.title,
            subjectId: t.subjectId,
            activityType: "cante",
            date: thuStr,
            status: "pending",
            estimatedMinutes: settings.duracionEstimadaCantePorTemaMinutos,
            pagesCount: t.pages || 18,
            createdAt: new Date().toISOString()
          });
        }
      });

      if (initialList.length > 0) {
        persistTasks(initialList);
      }
    }
  }, [scheduleLunes, scheduleJueves, topicMap, tasks.length, settings]);

  // Construcción del modelo de la semana actual con telemetría real (AeroFocus y WellsPrep)
  const weekPlan = useMemo(() => {
    return buildWeekPlan(tasks, weekOffset, settings, new Date(), recentSessions);
  }, [tasks, weekOffset, settings, recentSessions]);

  // Identificar jornada de hoy
  const todayStr = useMemo(() => getLocalDateString(), []);
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
    let canteTasks = tasks.filter(
      (t) => t.date === targetDateStr && t.activityType === "cante"
    );

    // Si aún no hay tareas creadas para esa fecha, asociar los temas oficiales del horario
    if (canteTasks.length === 0) {
      let scheduleTopicIds: string[] = [];
      try {
        const saved = localStorage.getItem("wellsprep_preparador_schedule_v2");
        if (saved) {
          const parsed = JSON.parse(saved);
          scheduleTopicIds = (canteKey === "lunes" ? parsed.lunes : parsed.jueves) || [];
        }
      } catch (e) {
        console.error(e);
      }
      if (scheduleTopicIds.length === 0) {
        scheduleTopicIds = canteKey === "lunes"
          ? (scheduleLunes.length > 0 ? scheduleLunes : ["constitucional-1", "constitucional-2"])
          : (scheduleJueves.length > 0 ? scheduleJueves : ["constitucional-3", "constitucional-4", "constitucional-5"]);
      }

      canteTasks = scheduleTopicIds.map((id) => {
        const t = topicMap.get(id);
        return {
          id: `virtual-cante-${id}-${targetDateStr}`,
          topicId: id,
          topicNumber: t?.number || 1,
          topicTitle: t?.title || id,
          subjectId: t?.subjectId || "constitucional",
          activityType: "cante",
          date: targetDateStr,
          status: "pending",
          estimatedMinutes: 30,
          pagesCount: t?.pages || 18,
          createdAt: new Date().toISOString()
        } as PlannerTask;
      });
    }

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
      const updated = tasks.map((t) => (t.id === taskData.id ? { ...t, ...taskData } : t));
      persistTasks(updated);
      toast.success("Tarea actualizada correctamente.");
    } else {
      // Nueva tarea
      const newTask: PlannerTask = {
        ...taskData,
        id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        createdAt: new Date().toISOString()
      };
      persistTasks([...tasks, newTask]);
      toast.success(`Tarea añadida a la jornada de ${taskData.date}.`);
    }
  };

  // Manejador: Marcar tarea como completada (o pendiente)
  const handleToggleTaskStatus = (task: PlannerTask) => {
    const nextStatus = task.status === "completed" ? "pending" : "completed";
    let updatedTasks = tasks.map((t) => {
      if (t.id === task.id) {
        return {
          ...t,
          status: nextStatus as any,
          completedAt: nextStatus === "completed" ? new Date().toISOString() : undefined
        };
      }
      return t;
    });

    if (nextStatus === "completed") {
      playSound.success();
      toast.success(`¡Completado: T.${task.topicNumber}!`, {
        description: `${ACTIVITY_CONFIG[task.activityType].label} marcado como realizado.`
      });

      // GENERACIÓN AUTOMÁTICA DE LOS 3 REFRESCOS (Regla 3)
      if (task.activityType === "estudio_nuevo") {
        const topic = topicMap.get(task.topicId);
        const autoRefrescos = generateAutoRefrescos(task, topic, updatedTasks, settings);
        if (autoRefrescos.length > 0) {
          updatedTasks = [...updatedTasks, ...autoRefrescos];
          setTimeout(() => {
            playSound.bell();
            toast.info("✨ Refrescos generados automáticamente", {
              description: `Se han programado los 3 refrescos de T.${task.topicNumber} para los próximos 3 días hábiles.`
            });
          }, 300);
        }
      }
    } else {
      playSound.click();
    }

    persistTasks(updatedTasks);
  };

  // Manejador: Registrar sesión real de estudio en WellsPrep y sincronizar con historial y curvas
  const handleQuickRegisterStudy = async (task: PlannerTask) => {
    try {
      const minutes = task.estimatedMinutes || 30;
      const typeMapping: Record<PlannerActivityType, "estudio_inicial" | "refresco" | "repaso" | "canto"> = {
        estudio_nuevo: "estudio_inicial",
        refresco: "refresco",
        repaso: "repaso",
        cante: "canto"
      };
      const sessionType = typeMapping[task.activityType] || "repaso";

      await addStudySession(
        task.topicId,
        minutes,
        4,
        sessionType,
        task.date
      );

      // Si la tarea aún no estaba completada, completarla
      if (task.status !== "completed") {
        handleToggleTaskStatus(task);
      } else {
        playSound.bell();
        toast.success(`Sesión de ${minutes}m registrada para T.${task.topicNumber}`, {
          description: "Sincronizada con el historial de estudio y AeroFocus."
        });
      }
    } catch (e) {
      console.error(e);
      toast.error("Error al registrar la sesión de estudio.");
    }
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
    const updated = tasks.map((t) => (t.id === taskId ? { ...t, date: newDate } : t));
    persistTasks(updated);
    toast.success(`Tarea reubicada al ${newDate}.`);
  };

  // Manejador: Lanzar análisis de sobrecarga y propuesta de redistribución
  const handleTriggerRebalance = () => {
    const proposal = proposeSmartRebalance(weekPlan, tasks, settings);
    setCurrentProposal(proposal);
    setIsRebalanceModalOpen(true);
  };

  // Manejador: Confirmar propuesta de redistribución
  const handleConfirmRebalance = () => {
    if (!currentProposal || currentProposal.moves.length === 0) return;
    const movesMap = new Map<string, string>();
    currentProposal.moves.forEach((m) => movesMap.set(m.taskId, m.toDate));

    const updated = tasks.map((t) => {
      const newTarget = movesMap.get(t.id);
      if (newTarget) {
        return { ...t, date: newTarget };
      }
      return t;
    });

    persistTasks(updated);
    toast.success("¡Redistribución inteligente aplicada con éxito!", {
      description: `Se han reubicado ${currentProposal.moves.length} tareas para evitar sobrecargas.`
    });
  };

  // Manejador: Añadir recomendación de Ebbinghaus
  const handleAddEbbinghausReview = (topicId: string, dateStr: string) => {
    const topic = topicMap.get(topicId);
    if (!topic) return;
    const estMins = estimateTaskDurationMinutes(topic, "repaso", recentSessions, settings);
    const newTask: PlannerTask = {
      id: `ebbinghaus-review-${topicId}-${Date.now()}`,
      topicId: topic.id,
      topicNumber: topic.number,
      topicTitle: topic.title,
      subjectId: topic.subjectId,
      activityType: "repaso",
      date: dateStr,
      status: "pending",
      estimatedMinutes: estMins,
      pagesCount: topic.pages || 18,
      notes: "Repaso sugerido por decaimiento de retención en la Curva de Ebbinghaus.",
      createdAt: new Date().toISOString()
    };
    persistTasks([...tasks, newTask]);
    toast.success(`Repaso de T.${topic.number} programado para el ${dateStr}.`);
  };

  // Manejador: Reubicar todas las tareas retrasadas a hoy
  const handleRescheduleDelayedTasks = () => {
    playSound.success();
    const updated = tasks.map((t) => {
      if (t.date < todayStr && t.status !== "completed") {
        return { ...t, date: todayStr };
      }
      return t;
    });
    persistTasks(updated);
    toast.success("Tareas retrasadas trasladadas a la jornada de hoy.");
  };

  return (
    <div className="space-y-4 max-w-[105rem] mx-auto w-full pb-32">
      {/* 1. TOP HEADER & CONTROLS BAR */}
      <div className="bg-white/95 backdrop-blur-xl border border-slate-200/90 rounded-3xl p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Logo & Week Range */}
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-bold shadow-xs shrink-0">
              <CalendarIcon size={20} className="text-amber-400" />
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-black font-serif text-slate-900 tracking-tight">
                  Planificador Semanal de Judicatura
                </h2>
                {weekOffset === 0 ? (
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200/80">
                    Semana Actual
                  </span>
                ) : (
                  <span className="text-[10px] font-mono font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                    {weekOffset > 0 ? `+${weekOffset} sem` : `${weekOffset} sem`}
                  </span>
                )}
              </div>

              <p className="text-xs text-slate-500 font-medium mt-0.5 flex items-center gap-2">
                <span>{weekPlan.startDate} al {weekPlan.endDate}</span>
                <span className="text-slate-300">·</span>
                <span>Objetivo diario: <strong className="font-mono text-slate-700">{settings.targetDailyHours}h</strong></span>
              </p>
            </div>
          </div>

          {/* Action Tools & Week Navigation */}
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {/* Ebbinghaus Integration Button */}
            <button
              type="button"
              onClick={() => {
                playSound.click();
                setIsEbbinghausModalOpen(true);
              }}
              className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/80 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs"
              title="Añadir temas que necesitan repaso según la curva del olvido"
            >
              <Brain size={14} className="text-emerald-600" />
              <span>Sugerencias Ebbinghaus</span>
            </button>

            {/* Smart Rebalance Button */}
            <button
              type="button"
              onClick={() => {
                playSound.click();
                handleTriggerRebalance();
              }}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs",
                weekPlan.overloadedDaysCount > 0
                  ? "bg-amber-500 text-white hover:bg-amber-600 animate-pulse"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-700"
              )}
              title="Detectar sobrecargas y proponer redistribución inteligente"
            >
              <Sparkles size={14} />
              <span>Redistribuir Semana</span>
              {weekPlan.overloadedDaysCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-white ring-1 ring-amber-300" />
              )}
            </button>

            {/* Settings Button */}
            <button
              type="button"
              onClick={() => {
                playSound.click();
                setIsSettingsModalOpen(true);
              }}
              className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 rounded-xl transition-all"
              title="Configurar velocidades y horas"
            >
              <Sliders size={16} />
            </button>

            {/* Week Offset Switcher */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/80 ml-1">
              <button
                type="button"
                onClick={() => {
                  playSound.click();
                  setWeekOffset((w) => w - 1);
                }}
                className="p-1 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-white transition-colors"
                title="Semana anterior"
              >
                <ChevronLeft size={16} />
              </button>
              {weekOffset !== 0 && (
                <button
                  type="button"
                  onClick={() => {
                    playSound.click();
                    setWeekOffset(0);
                  }}
                  className="px-2 text-[11px] font-bold text-slate-700 hover:text-slate-900 font-mono"
                  title="Volver a la semana actual"
                >
                  Hoy
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  playSound.click();
                  setWeekOffset((w) => w + 1);
                }}
                className="p-1 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-white transition-colors"
                title="Semana siguiente"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* 2. ACTIVITY FILTER AND SEARCH BAR */}
        <div className="mt-4 pt-3.5 border-t border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Activity Filters */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 mr-1 shrink-0">
              Filtrar:
            </span>

            {/* Todos */}
            <button
              type="button"
              onClick={() => setActivityFilter("todos")}
              className={cn(
                "px-2.5 py-1 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5",
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
              onClick={() => setActivityFilter("estudio_nuevo")}
              className={cn(
                "px-2.5 py-1 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5",
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
              onClick={() => setActivityFilter("refresco")}
              className={cn(
                "px-2.5 py-1 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5",
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
              onClick={() => setActivityFilter("repaso")}
              className={cn(
                "px-2.5 py-1 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5",
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
              onClick={() => setActivityFilter("cante")}
              className={cn(
                "px-2.5 py-1 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5",
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
              onClick={() => setActivityFilter("pendientes")}
              className={cn(
                "px-2.5 py-1 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ml-1",
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
              placeholder="Buscar tema en la semana..."
              value={searchTopicQuery}
              onChange={(e) => setSearchTopicQuery(e.target.value)}
              className="px-3 py-1 bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-indigo-600 w-full sm:w-56 transition-all"
            />
            {searchTopicQuery && (
              <button
                type="button"
                onClick={() => setSearchTopicQuery("")}
                className="text-xs text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2.5 DUAL COMPLEMENTARY CARDS: RADAR DE PRÓXIMO CANTE & BALANCE SEMANAL */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
        {/* Radar de Próximo Cante (Columna 5/12 en desktop) */}
        <div className="lg:col-span-5 bg-gradient-to-br from-purple-950/90 to-slate-900 text-white rounded-3xl p-4 sm:p-5 border border-purple-500/20 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-200 border border-purple-400/30 flex items-center gap-1">
                <Award size={11} />
                <span>Radar de Próximo Cante</span>
              </span>

              {nextCanteInfo && (
                <span className={cn(
                  "text-[10px] font-mono font-bold px-2 py-0.5 rounded-full",
                  nextCanteInfo.isToday
                    ? "bg-rose-500/30 text-rose-200 border border-rose-400/30 animate-pulse"
                    : nextCanteInfo.isTomorrow
                    ? "bg-amber-500/30 text-amber-200 border border-amber-400/30"
                    : "bg-white/10 text-white/80"
                )}>
                  {nextCanteInfo.isToday ? "¡Hoy es el cante!" : nextCanteInfo.isTomorrow ? "Mañana cante" : `En ${nextCanteInfo.diffDays} días`}
                </span>
              )}
            </div>

            {nextCanteInfo ? (
              <div className="mt-3">
                <h3 className="text-base font-black font-serif text-white tracking-tight flex items-baseline gap-2">
                  <span>{nextCanteInfo.dayName} {nextCanteInfo.dayNumber} {nextCanteInfo.monthName}</span>
                  <span className="text-xs font-mono text-purple-300 font-normal">
                    ({nextCanteInfo.tasks.length} temas asignados)
                  </span>
                </h3>

                <div className="mt-2.5 space-y-1.5">
                  {nextCanteInfo.tasks.length === 0 ? (
                    <p className="text-xs text-purple-200/70 italic">
                      No has asignado temas para este día de cante todavía. Usa el botón Añadir para programar los temas.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {nextCanteInfo.tasks.map((task) => (
                        <span
                          key={task.id}
                          className="text-[11px] font-bold px-2.5 py-1 rounded-xl bg-purple-800/60 text-purple-100 border border-purple-500/30 flex items-center gap-1"
                        >
                          <span className="font-mono text-amber-300">T.{task.topicNumber}</span>
                          <span className="truncate max-w-[120px]">{task.topicTitle}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-3 text-xs text-purple-200/80">
                <p>No hay jornadas de cante oficiales en esta vista semanal.</p>
                <p className="text-[11px] text-purple-300/60 mt-1">Los cantes oficiales se realizan habitualmente los lunes y jueves.</p>
              </div>
            )}
          </div>

          {nextCanteInfo && onOpenPreparadorSession && (
            <div className="mt-3.5 pt-3 border-t border-purple-500/20 flex items-center justify-between">
              <span className="text-[11px] text-purple-300">¿Listo para cantar con el preparador?</span>
              <button
                type="button"
                onClick={() => onOpenPreparadorSession(nextCanteInfo.canteKey)}
                className="px-3 py-1 bg-white text-slate-900 hover:bg-purple-50 rounded-xl text-xs font-bold transition-all shadow-xs"
              >
                Abrir Sesión de Cante
              </button>
            </div>
          )}
        </div>

        {/* Balance Semanal Previsto vs Real (Columna 7/12 en desktop) */}
        <div className="lg:col-span-7 bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/90 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">
                  Balance Semanal de Rendimiento
                </span>
                <span className="text-[10px] font-mono text-slate-400">· Telemetría AeroFocus</span>
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
                  {weekPlan.totalEstimatedHours}h
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  {weekPlan.totalTasksCount} tareas
                </span>
              </div>

              {/* Real (AeroFocus + Manual) */}
              <div className="p-2.5 rounded-2xl bg-indigo-50/70 border border-indigo-100/80">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-indigo-700 block">
                  Estudio Real
                </span>
                <span className="text-lg font-black font-serif text-indigo-950 block mt-0.5">
                  {weekPlan.totalRealHours}h
                </span>
                <span className="text-[10px] text-indigo-700/80 font-mono">
                  sincronizado
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
                  {weekPlan.hoursVariance >= 0 ? `+${weekPlan.hoursVariance}h` : `${weekPlan.hoursVariance}h`}
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
          </div>

          {/* Progress Bar */}
          <div className="mt-3 pt-2.5 border-t border-slate-100">
            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
              <div
                className="bg-emerald-600 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, weekPlan.completionRatePct)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 2.8 PROACTIVE DIAGNOSTICS & ADVICE (Avisos de Inteligencia Preventiva) */}
      {weekPlan.proactiveWarnings && weekPlan.proactiveWarnings.length > 0 && (
        <div className="space-y-2">
          {weekPlan.proactiveWarnings.map((warn, idx) => (
            <div
              key={idx}
              className="p-3 rounded-2xl bg-indigo-50/80 border border-indigo-200/80 text-xs text-indigo-950 flex items-start gap-2.5"
            >
              <Info size={16} className="text-indigo-600 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium leading-relaxed">
                <strong className="font-bold mr-1">Consejo de preparación:</strong>
                {warn}
              </div>
            </div>
          ))}
        </div>
      )}

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
            className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold transition-all shadow-2xs shrink-0"
          >
            Mover a Hoy
          </button>
        </div>
      )}

      {/* 4. MODO HOY BANNER (Si estamos en la semana actual) */}
      {todayDayPlan && (
        <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-3xl p-4 sm:p-5 shadow-sm relative overflow-hidden">
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/20 text-white">
                  Jornada de Hoy
                </span>
                <span className="text-xs font-mono text-slate-300">
                  {todayDayPlan.dayName} {todayDayPlan.dayNumber} {todayDayPlan.monthName}
                </span>
              </div>
              <h3 className="text-base sm:text-lg font-black font-serif mt-1 tracking-tight">
                {todayDayPlan.tasks.length === 0
                  ? "Día libre o sin tareas programadas para hoy."
                  : `${todayDayPlan.tasks.length} ${todayDayPlan.tasks.length === 1 ? "tarea programada" : "tareas programadas"} · ${formatMinutesToHours(todayDayPlan.totalEstimatedMinutes)} de estudio previsto.`}
              </h3>
            </div>

            <button
              type="button"
              onClick={() => {
                setTargetDateForNewTask(todayStr);
                setEditingTask(null);
                setIsTaskEditorOpen(true);
              }}
              className="px-3.5 py-2 bg-white text-slate-900 hover:bg-slate-100 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 self-start sm:self-center shadow-xs"
            >
              <Plus size={14} strokeWidth={2.5} />
              <span>+ Añadir Tarea a Hoy</span>
            </button>
          </div>
        </div>
      )}

      {/* 5. MOBILE DAY SELECTOR (Visible en pantallas pequeñas con puntos de color de actividad) */}
      <div className="md:hidden flex items-center justify-between gap-1 overflow-x-auto no-scrollbar p-1.5 bg-white rounded-2xl border border-slate-200">
        {weekPlan.days.map((day) => {
          const isSelected = mobileSelectedDate === day.date;
          return (
            <button
              key={day.date}
              type="button"
              onClick={() => setMobileSelectedDate(day.date)}
              className={cn(
                "flex-1 py-2 px-1 text-center rounded-xl transition-all min-w-[44px]",
                isSelected
                  ? "bg-slate-900 text-white shadow-xs font-bold"
                  : "text-slate-600 hover:bg-slate-100"
              )}
            >
              <span className="text-[9px] font-mono block uppercase">{day.shortName}</span>
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
                "bg-white rounded-3xl border transition-all flex flex-col min-h-[380px] sm:min-h-[520px] shadow-2xs relative overflow-hidden",
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
                        onClick={() => onOpenPreparadorSession(day.shortName === "LUN" ? "lunes" : "jueves")}
                        className="hover:underline text-[9px] font-mono text-purple-900"
                      >
                        Abrir
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Tasks List inside Day Column */}
              <div className="p-2 sm:p-2.5 flex-1 space-y-2 overflow-y-auto max-h-[580px] no-scrollbar">
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
                            ~{task.estimatedMinutes}m
                          </span>
                        </div>

                        {/* Topic Title */}
                        <div className="flex items-start gap-2">
                          <button
                            type="button"
                            onClick={() => handleToggleTaskStatus(task)}
                            className={cn(
                              "w-5 h-5 rounded-lg flex items-center justify-center transition-all shrink-0 mt-0.5",
                              isDone
                                ? "bg-emerald-600 text-white"
                                : "border border-slate-300 hover:border-indigo-600 bg-white"
                            )}
                            title={isDone ? "Marcar pendiente" : "Marcar completado"}
                          >
                            {isDone && <Check size={12} strokeWidth={3} />}
                          </button>

                          <div className="min-w-0 flex-1">
                            <h4 className={cn(
                              "text-xs font-bold leading-snug line-clamp-2",
                              isDone ? "line-through text-slate-500" : "text-slate-900"
                            )}>
                              <span className="font-mono text-slate-700 mr-1">T.{task.topicNumber}</span>
                              <span>{task.topicTitle}</span>
                            </h4>

                            <div className="flex items-center gap-1.5 mt-1 text-[10px] text-slate-500 font-mono">
                              <span>{task.pagesCount} págs</span>
                              {task.notes && (
                                <>
                                  <span>·</span>
                                  <span className="italic line-clamp-1">{task.notes}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Task Action Bar */}
                        <div className="mt-2 pt-1.5 border-t border-slate-200/50 flex items-center justify-between text-[10px]">
                          <div className="flex items-center gap-1">
                            {/* 1-Click Registrar Estudio en WellsPrep */}
                            <button
                              type="button"
                              onClick={() => handleQuickRegisterStudy(task)}
                              className="px-1.5 py-0.5 rounded-md bg-white/90 hover:bg-emerald-50 text-emerald-800 hover:text-emerald-900 border border-emerald-200/70 font-mono font-bold text-[9px] transition-all flex items-center gap-1 shadow-2xs"
                              title="Registrar estudio real en WellsPrep y marcar tarea como completada"
                            >
                              <Zap size={10} className="text-emerald-600" />
                              <span>Registrar</span>
                            </button>

                            {/* Mover al día siguiente */}
                            <button
                              type="button"
                              onClick={() => {
                                const nextDay = new Date(safeParseDate(day.date));
                                nextDay.setDate(nextDay.getDate() + 1);
                                handleMoveTask(task.id, getLocalDateString(nextDay));
                              }}
                              className="p-1 rounded-md text-slate-400 hover:text-slate-800 hover:bg-white/80 transition-colors"
                              title="Pasar al día siguiente"
                            >
                              <MoveRight size={12} />
                            </button>

                            {/* Editar */}
                            <button
                              type="button"
                              onClick={() => {
                                setEditingTask(task);
                                setTargetDateForNewTask(task.date);
                                setIsTaskEditorOpen(true);
                              }}
                              className="p-1 rounded-md text-slate-400 hover:text-slate-800 hover:bg-white/80 transition-colors"
                              title="Editar tarea"
                            >
                              <Edit3 size={12} />
                            </button>
                          </div>

                          {/* Eliminar */}
                          <button
                            type="button"
                            onClick={() => handleDeleteTask(task.id)}
                            className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                            title="Eliminar tarea"
                          >
                            <Trash2 size={12} />
                          </button>
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
                  className="w-full py-1.5 px-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200/80 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 shadow-2xs hover:shadow-xs active:scale-98"
                >
                  <Plus size={13} strokeWidth={2.5} />
                  <span>Añadir</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* 7. MODALS */}
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
        settings={settings}
      />

      {/* B. Rebalance Confirm Modal (Regla: no modificar sin confirmación) */}
      <RebalanceConfirmModal
        isOpen={isRebalanceModalOpen}
        onClose={() => setIsRebalanceModalOpen(false)}
        proposal={currentProposal}
        onConfirm={handleConfirmRebalance}
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
