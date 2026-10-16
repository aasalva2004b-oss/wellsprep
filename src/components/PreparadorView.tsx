import React, { useState, useMemo, useEffect } from "react";
import { 
  Calendar, Clock, CheckCircle2, AlertTriangle, 
  XCircle, Plus, Trash2, BookOpen, Star, ChevronRight, X, Search,
  Award, Sparkles, Save, ArrowUpDown, Brain, Timer, Target, Flame, Info
} from "lucide-react";
import { useFirebase } from "../lib/FirebaseProvider";
import { initialSubjects, initialTopics } from "../data/initialData";
import { Topic } from "../types";
import { calculateTopicCycle } from "../lib/oposicionCycle";
import { getLocalDateString, safeParseDate, cn } from "../lib/utils";
import { getLatestCantoForTopic, isCantoSession, sessionMatchesTopic, getCantoDuration } from "../lib/cantoUtils";
import { 
  evaluateTopicPreparation, 
  getDefaultPreparadorDay, 
  getPreparadorScheduleStatus,
  OPTIMAL_CANTO_SECS,
  WINDOW_MIN_SECS,
  WINDOW_MAX_SECS,
  TopicPreparationEvaluation
} from "../lib/preparationScore";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";

type DayOption = "lunes" | "jueves" | "historial";
type SortOption = "menor_nota" | "mayor_nota" | "orden_numero";

interface PreparadorSchedule {
  lunes: string[];   // Topic IDs
  jueves: string[];  // Topic IDs
}

const DEFAULT_SCHEDULE: PreparadorSchedule = {
  lunes: ["constitucional-1", "constitucional-2"],
  jueves: ["constitucional-3", "constitucional-4", "constitucional-5"]
};

const LOCAL_STORAGE_KEY = "wellsprep_preparador_schedule_v2";

export function PreparadorView() {
  const { user, userProgress, recentSessions, addStudySession } = useFirebase();

  // Active day: Lunes or Jueves (defaults according to strict 22:00h rule) or Historial
  const [activeDay, setActiveDay] = useState<DayOption>(() => {
    return getDefaultPreparadorDay();
  });

  // Schedule status message (e.g., "Activo hasta las 22:00h")
  const scheduleStatus = useMemo(() => {
    return getPreparadorScheduleStatus();
  }, []);

  const [schedule, setSchedule] = useState<PreparadorSchedule>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    return DEFAULT_SCHEDULE;
  });

  // Sorting state for topic cards
  const [sortOption, setSortOption] = useState<SortOption>("menor_nota");

  // Sync schedule with Firestore when user is loaded
  useEffect(() => {
    if (!user) return;
    const loadSchedule = async () => {
      try {
        const ref = doc(db, `users/${user.uid}/settings/preparador`);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data() as PreparadorSchedule;
          if (data && (Array.isArray(data.lunes) || Array.isArray(data.jueves))) {
            const merged = {
              lunes: data.lunes || [],
              jueves: data.jueves || []
            };
            setSchedule(merged);
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(merged));
          }
        }
      } catch (e) {
        console.error("Error loading preparador schedule:", e);
      }
    };
    loadSchedule();
  }, [user]);

  const saveSchedule = async (newSchedule: PreparadorSchedule) => {
    setSchedule(newSchedule);
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(newSchedule));
      if (user) {
        const ref = doc(db, `users/${user.uid}/settings/preparador`);
        await setDoc(ref, {
          userId: user.uid,
          lunes: newSchedule.lunes || [],
          jueves: newSchedule.jueves || [],
          updatedAt: serverTimestamp()
        }, { merge: true });
      }
    } catch (e) {
      console.error("Error saving preparador schedule:", e);
    }
  };

  // State for Topic Picker modal
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerSubjectId, setPickerSubjectId] = useState<string>("constitucional");

  // State for recording feedback / cante directly
  const [feedbackTopic, setFeedbackTopic] = useState<Topic | null>(null);
  const [prepGrade, setPrepGrade] = useState<number>(7.5);
  const [prepMinutes, setPrepMinutes] = useState<number>(12);
  const [prepSeconds, setPrepSeconds] = useState<number>(30);
  const [prepNotes, setPrepNotes] = useState("");

  // Topic lookup map
  const topicMap = useMemo(() => {
    const map = new Map<string, Topic>();
    for (const t of initialTopics) {
      map.set(t.id, t);
    }
    return map;
  }, []);

  // Assigned topics for current day
  const assignedTopicIds = activeDay === "historial" ? [] : (schedule[activeDay] || []);

  const assignedTopics = useMemo(() => {
    return assignedTopicIds
      .map((id) => topicMap.get(id))
      .filter((t): t is Topic => Boolean(t));
  }, [assignedTopicIds, topicMap]);

  // Master Scientific Preparation Analysis for each assigned topic
  const topicsAnalysis = useMemo(() => {
    return assignedTopics.map((topic) => {
      const prog = userProgress[topic.id];
      const sessions = recentSessions.filter((s) => sessionMatchesTopic(s, topic));
      const cycle = calculateTopicCycle(topic.id, prog, sessions);

      // Extract cante metrics
      const cantoData = getLatestCantoForTopic(recentSessions, topic, prog);
      const hasCanto = cantoData.hasCanto;
      const lastCantoMins = cantoData.mins;
      const lastCantoSecs = cantoData.secs;
      const lastCantoTotalSecs = cantoData.totalSecs;
      const lastGrade = cantoData.grade;
      const lastCantoDate = cantoData.date;
      const cantoCount = cantoData.count;

      // Check last touch date
      const lastSessionDate = sessions[0]?.date || prog?.lastReviewDate || prog?.firstStudyDate;
      const daysSinceTouch = lastSessionDate 
        ? Math.max(0, Math.floor((new Date().getTime() - safeParseDate(lastSessionDate).getTime()) / (1000 * 3600 * 24)))
        : null;

      const subject = initialSubjects.find((s) => s.id === topic.subjectId);
      const vueltas = prog?.vueltas || 0;
      const reviewsCount = sessions.length;

      // Complete master scientific evaluation (1.0 to 10.0)
      const evaluation: TopicPreparationEvaluation = evaluateTopicPreparation({
        topicNumber: topic.number,
        topicTitle: topic.title,
        totalCantoSecs: hasCanto ? lastCantoTotalSecs : null,
        lastGrade: lastGrade,
        daysSinceTouch,
        vueltas,
        reviewsCount,
        difficulty: topic.difficulty || 5
      });

      return {
        topic,
        subject,
        prog,
        cycle,
        hasCanto,
        lastCantoMins,
        lastCantoSecs,
        lastCantoTotalSecs,
        lastGrade,
        lastCantoDate,
        cantoCount,
        daysSinceTouch,
        vueltas,
        reviewsCount,
        evaluation
      };
    });
  }, [assignedTopics, userProgress, recentSessions]);

  // Sorted list of topics according to user preference
  const sortedTopicsAnalysis = useMemo(() => {
    const list = [...topicsAnalysis];
    if (sortOption === "menor_nota") {
      // Urgent focus first (lowest scores first)
      return list.sort((a, b) => a.evaluation.overallScore - b.evaluation.overallScore);
    }
    if (sortOption === "mayor_nota") {
      // Strongest first
      return list.sort((a, b) => b.evaluation.overallScore - a.evaluation.overallScore);
    }
    // By topic number
    return list.sort((a, b) => a.topic.number - b.topic.number);
  }, [topicsAnalysis, sortOption]);

  // Overall KPIs for the day
  const kpis = useMemo(() => {
    const total = topicsAnalysis.length;
    if (total === 0) {
      return {
        total: 0,
        avgScore: null,
        listosTribunal: 0,
        enAjuste: 0,
        enRiesgo: 0,
        totalMinutes: 0,
        avgRetention: null
      };
    }

    const scores = topicsAnalysis.map((t) => t.evaluation.overallScore);
    const avgScore = scores.reduce((a, b) => a + b, 0) / total;

    const listosTribunal = topicsAnalysis.filter((t) => t.evaluation.overallScore >= 7.5).length;
    const enAjuste = topicsAnalysis.filter((t) => t.evaluation.overallScore >= 5.0 && t.evaluation.overallScore < 7.5).length;
    const enRiesgo = topicsAnalysis.filter((t) => t.evaluation.overallScore < 5.0).length;

    // Total estimated time in minutes (based on actual cantes or 12:30 default)
    const totalSecs = topicsAnalysis.reduce((acc, t) => {
      return acc + (t.hasCanto ? t.lastCantoTotalSecs : OPTIMAL_CANTO_SECS);
    }, 0);
    const totalMinutes = Math.round(totalSecs / 60);

    const retentions = topicsAnalysis.map((t) => t.evaluation.retentionPct);
    const avgRetention = Math.round(retentions.reduce((a, b) => a + b, 0) / total);

    return {
      total,
      avgScore,
      listosTribunal,
      enAjuste,
      enRiesgo,
      totalMinutes,
      avgRetention
    };
  }, [topicsAnalysis]);

  // Handler to add topic to day
  const handleAddTopic = (topicId: string) => {
    if (activeDay === "historial") return;
    const currentList = schedule[activeDay] || [];
    if (!currentList.includes(topicId)) {
      const updated = {
        ...schedule,
        [activeDay]: [...currentList, topicId]
      };
      saveSchedule(updated);
      toast.success("Tema añadido a la sesión");
    } else {
      toast.info("Este tema ya está asignado para este día");
    }
  };

  // Handler to remove topic from day
  const handleRemoveTopic = (topicId: string) => {
    if (activeDay === "historial") return;
    const currentList = schedule[activeDay] || [];
    const updated = {
      ...schedule,
      [activeDay]: currentList.filter((id) => id !== topicId)
    };
    saveSchedule(updated);
    toast.success("Tema retirado de la sesión");
  };

  // Quick preset loader (e.g. Constitucional 3, 16, 17)
  const handleLoadUserExample = () => {
    const exampleIds = ["constitucional-3", "constitucional-16", "constitucional-17"];
    saveSchedule({
      ...schedule,
      jueves: exampleIds
    });
    setActiveDay("jueves");
    toast.success("Temas cargados para el Jueves: 3, 16 y 17 de Constitucional");
  };

  // Save preparador feedback / cante session
  const handleSavePreparadorFeedback = async () => {
    if (!feedbackTopic) return;
    try {
      await addStudySession(
        feedbackTopic.id,
        prepMinutes,
        feedbackTopic.difficulty || 5,
        "canto",
        getLocalDateString(),
        {
          cantoSeconds: prepSeconds,
          cantoGrade: prepGrade,
          cantoType: "preparador",
          mistakes: prepNotes,
          notes: `Sesión de cante ante preparador: ${prepMinutes}m ${prepSeconds}s. Nota: ${prepGrade}. Feedback: ${prepNotes}`
        }
      );
      toast.success(`Evaluación del preparador guardada (Nota ${prepGrade.toFixed(1)})`);
      setFeedbackTopic(null);
      setPrepNotes("");
    } catch (e) {
      console.error(e);
      toast.error("Error al registrar el feedback del preparador");
    }
  };

  // Filter topics in the picker modal
  const pickerFilteredTopics = useMemo(() => {
    const list = initialTopics.filter((t) => t.subjectId === pickerSubjectId);
    if (!pickerSearch.trim()) return list;
    const q = pickerSearch.toLowerCase().trim();
    return list.filter((t) => 
      t.title.toLowerCase().includes(q) ||
      (t.fullTitle && t.fullTitle.toLowerCase().includes(q)) ||
      t.number.toString().includes(q)
    );
  }, [pickerSubjectId, pickerSearch]);

  // All historical sessions with preparador / cantos
  const preparadorSessions = useMemo(() => {
    return recentSessions.filter(isCantoSession);
  }, [recentSessions]);

  return (
    <div className="flex flex-col h-full bg-[#F5F5F7] overflow-hidden select-none">
      {/* APPLE FROSTED HEADER */}
      <div className="bg-white/90 backdrop-blur-2xl border-b border-slate-200/70 px-4 py-4 md:px-8 md:py-5 sticky top-0 z-20 shrink-0 shadow-[0_4px_24px_rgba(0,0,0,0.02)]">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="w-8 h-8 md:w-9 md:h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-md shadow-slate-900/10">
                <Award size={18} strokeWidth={2.2} />
              </div>
              <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight font-serif">
                Panel del Preparador (L/J)
              </h1>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200/80">
                <Target size={12} className="text-indigo-600" />
                <span>Meta Tribunal: 12:30 min (Ventana 11:50 - 13:40)</span>
              </span>
            </div>
            
            {/* Status explanation pill (shows that Thursday stays active until 22:00) */}
            <div className="flex items-center gap-2 mt-1.5">
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-md border border-slate-200/60">
                <Clock size={11} className="text-slate-500" />
                <span>{scheduleStatus.timeRemainingMessage}</span>
              </span>
              <span className="text-slate-400 text-xs hidden sm:inline">·</span>
              <p className="text-slate-500 text-xs font-medium hidden sm:inline">
                Evaluación integral 1-10: tiempo óptimo (12:30), curva de olvido Ebbinghaus, vueltas y notas.
              </p>
            </div>
          </div>

          {/* DAY SEGMENTED CONTROLLER (LUNES / JUEVES / HISTORIAL) */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="flex bg-slate-200/70 p-1 rounded-2xl border border-slate-300/40 w-full sm:w-auto">
              <button
                onClick={() => setActiveDay("lunes")}
                className={cn(
                  "flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2",
                  activeDay === "lunes"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                <Calendar size={13} />
                <span>Lunes</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-100 font-black">
                  {(schedule.lunes || []).length}
                </span>
              </button>

              <button
                onClick={() => setActiveDay("jueves")}
                className={cn(
                  "flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2",
                  activeDay === "jueves"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                <Calendar size={13} />
                <span>Jueves</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-100 font-black">
                  {(schedule.jueves || []).length}
                </span>
              </button>

              <button
                onClick={() => setActiveDay("historial")}
                className={cn(
                  "flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2",
                  activeDay === "historial"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                <Award size={13} />
                <span>Historial</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-100 font-black">
                  {preparadorSessions.length}
                </span>
              </button>
            </div>

            {activeDay !== "historial" && (
              <button
                onClick={() => setIsPickerOpen(true)}
                className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 shrink-0 active:scale-95"
              >
                <Plus size={14} strokeWidth={2.5} />
                <span className="hidden sm:inline">Añadir Temas</span>
              </button>
            )}
          </div>
        </div>

        {/* OVERVIEW BENCHMARK CARDS */}
        {activeDay !== "historial" && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3.5 mt-4">
            {/* 1. Nota Media de Preparación (1-10) */}
            <div className="bg-slate-50/90 rounded-2xl p-3.5 border border-slate-200/70 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white border border-slate-200/80 flex items-center justify-center shadow-sm text-indigo-600">
                <Award size={18} strokeWidth={2.2} />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Nota Media Preparación
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className={cn(
                    "text-xl font-black font-serif",
                    kpis.avgScore === null ? "text-slate-400" :
                    kpis.avgScore >= 8.5 ? "text-emerald-700" :
                    kpis.avgScore >= 7.0 ? "text-indigo-700" :
                    kpis.avgScore >= 5.0 ? "text-amber-700" : "text-rose-600"
                  )}>
                    {kpis.avgScore !== null ? `${kpis.avgScore.toFixed(1)}` : "—"}
                  </span>
                  <span className="text-xs font-bold text-slate-400">/ 10</span>
                </div>
              </div>
            </div>

            {/* 2. Diagnóstico del Tribunal */}
            <div className="bg-slate-50/90 rounded-2xl p-3.5 border border-slate-200/70 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white border border-slate-200/80 flex items-center justify-center shadow-sm">
                <div className="flex -space-x-1">
                  <span className="w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white inline-block" />
                  <span className="w-3 h-3 rounded-full bg-amber-500 ring-2 ring-white inline-block" />
                  <span className="w-3 h-3 rounded-full bg-rose-500 ring-2 ring-white inline-block" />
                </div>
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Estado Tribunal
                </div>
                <div className="text-xs font-bold text-slate-700">
                  <span className="text-emerald-600 font-black">{kpis.listosTribunal} Listos</span> · <span className="text-amber-600 font-black">{kpis.enAjuste} Ajustar</span> · <span className="text-rose-600 font-black">{kpis.enRiesgo} Riesgo</span>
                </div>
              </div>
            </div>

            {/* 3. Retención Media de Ebbinghaus */}
            <div className="bg-slate-50/90 rounded-2xl p-3.5 border border-slate-200/70 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white border border-slate-200/80 flex items-center justify-center shadow-sm text-cyan-600">
                <Brain size={18} strokeWidth={2.2} />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Curva de Ebbinghaus
                </div>
                <div className="text-lg font-black text-slate-900">
                  {kpis.avgRetention !== null ? `${kpis.avgRetention}%` : "—"}
                  <span className="text-xs font-medium text-slate-500 ml-1">retención</span>
                </div>
              </div>
            </div>

            {/* 4. Tiempo Estimado Total */}
            <div className="bg-slate-50/90 rounded-2xl p-3.5 border border-slate-200/70 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white border border-slate-200/80 flex items-center justify-center shadow-sm text-amber-500">
                <Timer size={18} strokeWidth={2.2} />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Cante Total Estimado
                </div>
                <div className="text-lg font-black text-slate-900">
                  ~{kpis.totalMinutes}m
                  <span className="text-xs font-medium text-slate-500 ml-1">({kpis.total} temas)</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8 pb-28 max-w-[100rem] mx-auto w-full">
        {activeDay === "historial" ? (
          /* HISTORIAL VIEW */
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-slate-900 font-serif">
                  Histórico de Evaluaciones con el Preparador
                </h2>
                <p className="text-xs text-slate-500">
                  Registro de cantes oficiales, calificaciones obtenidas y correcciones del preparador.
                </p>
              </div>
            </div>

            {preparadorSessions.length === 0 ? (
              <div className="bg-white rounded-3xl p-12 text-center border border-slate-200/70 shadow-sm">
                <Award size={36} className="text-slate-300 mx-auto mb-3" />
                <h3 className="text-base font-bold text-slate-800">No hay cantes registrados con el preparador todavía</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-4">
                  Cuando cantes un tema el Lunes o el Jueves, pulsa en &quot;Registrar Cante / Nota Preparador&quot; en la tarjeta del tema para registrar el feedback y notas.
                </p>
                <button
                  onClick={() => setActiveDay(getDefaultPreparadorDay())}
                  className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-all"
                >
                  Ir a preparar la sesión activa ({getDefaultPreparadorDay()})
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {preparadorSessions.map((session, idx) => {
                  const topic = topicMap.get(session.topicId) 
                    || initialTopics.find((t) => String(t.number) === String(session.topicId) || sessionMatchesTopic(session, t));
                  const dur = getCantoDuration(session);
                  const grade = session.cantoGrade ?? session.grade ?? null;

                  return (
                    <div 
                      key={session.id || idx}
                      className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 bg-slate-100 rounded-md text-slate-600">
                            {session.date || "Fecha no registrada"}
                          </span>
                          {grade !== null && (
                            <span className={cn(
                              "text-xs font-black px-2.5 py-0.5 rounded-full border",
                              grade >= 8.5 ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                              grade >= 7.0 ? "bg-indigo-50 text-indigo-700 border-indigo-200" :
                              grade >= 5.0 ? "bg-amber-50 text-amber-700 border-amber-200" :
                              "bg-rose-50 text-rose-700 border-rose-200"
                            )}>
                              Nota: {grade.toFixed(1)} / 10
                            </span>
                          )}
                        </div>

                        <h3 className="font-bold text-slate-900 text-sm mb-1">
                          {topic ? (topic.number === 999 ? "Tema Extra" : `Tema ${topic.number}: ${topic.title}`) : `Tema ${session.topicId}`}
                        </h3>

                        <div className="flex items-center gap-3 text-xs text-slate-500 mt-2 mb-3">
                          <span className="flex items-center gap-1 font-semibold text-slate-700">
                            <Clock size={13} className="text-indigo-600" />
                            {dur.formatted}
                          </span>
                          <span>·</span>
                          <span className="text-[11px] text-slate-400">
                            Meta óptima: 12m 30s ({dur.totalSecs > OPTIMAL_CANTO_SECS ? `+${dur.totalSecs - OPTIMAL_CANTO_SECS}s` : `-${OPTIMAL_CANTO_SECS - dur.totalSecs}s`})
                          </span>
                        </div>

                        {session.mistakes && (
                          <div className="p-3 bg-amber-50/70 border border-amber-100 rounded-xl text-xs text-amber-900">
                            <span className="font-bold block mb-0.5 text-[10px] uppercase tracking-wider text-amber-700">
                              Observaciones del Preparador:
                            </span>
                            {session.mistakes}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* ASSIGNED TOPICS CARDS LIST */
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-slate-900 font-serif flex items-center gap-2">
                  <span>Temas Asignados para el {activeDay === "lunes" ? "Lunes" : "Jueves"}</span>
                  <span className="text-xs px-2.5 py-0.5 bg-slate-200/80 text-slate-700 rounded-lg font-sans font-bold">
                    {assignedTopics.length} seleccionados
                  </span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Visualiza la nota de preparación del 1 al 10, el cronómetro calibrado a 12:30, la curva del olvido y tus vueltas.
                </p>
              </div>

              {/* Sorting Filter Selector */}
              {assignedTopics.length > 0 && (
                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <ArrowUpDown size={13} className="text-slate-400" />
                  <div className="flex bg-slate-200/70 p-1 rounded-xl text-xs font-semibold">
                    <button
                      onClick={() => setSortOption("menor_nota")}
                      className={cn(
                        "px-2.5 py-1 rounded-lg transition-all",
                        sortOption === "menor_nota" ? "bg-white text-slate-900 font-bold shadow-xs" : "text-slate-600 hover:text-slate-900"
                      )}
                    >
                      Prioritarios (Menor Nota)
                    </button>
                    <button
                      onClick={() => setSortOption("mayor_nota")}
                      className={cn(
                        "px-2.5 py-1 rounded-lg transition-all",
                        sortOption === "mayor_nota" ? "bg-white text-slate-900 font-bold shadow-xs" : "text-slate-600 hover:text-slate-900"
                      )}
                    >
                      Mejor Preparados
                    </button>
                    <button
                      onClick={() => setSortOption("orden_numero")}
                      className={cn(
                        "px-2.5 py-1 rounded-lg transition-all",
                        sortOption === "orden_numero" ? "bg-white text-slate-900 font-bold shadow-xs" : "text-slate-600 hover:text-slate-900"
                      )}
                    >
                      Por Número
                    </button>
                  </div>
                </div>
              )}

              {assignedTopics.length === 0 && (
                <button
                  onClick={handleLoadUserExample}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1.5 self-start sm:self-auto px-3 py-1.5 bg-indigo-50 rounded-xl border border-indigo-200/60"
                >
                  <Sparkles size={13} />
                  <span>Cargar ejemplo: Temas 3, 16 y 17 de Constitucional</span>
                </button>
              )}
            </div>

            {assignedTopics.length === 0 ? (
              <div className="bg-white rounded-3xl p-12 text-center border border-slate-200/70 shadow-sm">
                <BookOpen size={36} className="text-slate-300 mx-auto mb-3" />
                <h3 className="text-base font-bold text-slate-800">
                  No hay temas asignados para el {activeDay === "lunes" ? "Lunes" : "Jueves"}
                </h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-5">
                  Añade los temas que vas a cantar en tu próxima sesión para ver al instante su nota objetiva (1-10), calibración de tiempo y retención.
                </p>
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={() => setIsPickerOpen(true)}
                    className="px-4 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
                  >
                    <Plus size={14} />
                    <span>Seleccionar Temas del Temario</span>
                  </button>
                  <button
                    onClick={handleLoadUserExample}
                    className="px-4 py-2.5 bg-white text-slate-700 border border-slate-200 rounded-xl text-xs font-bold hover:bg-slate-50 transition-all"
                  >
                    Cargar Temas 3, 16 y 17
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {sortedTopicsAnalysis.map((item) => {
                  const { topic, subject, evaluation, hasCanto, lastCantoMins, lastCantoSecs, lastGrade, daysSinceTouch, vueltas, reviewsCount } = item;

                  // Gauge calculations for the 10:00 to 15:00 scale
                  // Range: 600s (10m) to 900s (15m) -> 300s window
                  const minGaugeSecs = 10 * 60; // 600s
                  const maxGaugeSecs = 15 * 60; // 900s
                  const clampCantoSecs = Math.max(minGaugeSecs, Math.min(maxGaugeSecs, evaluation.totalCantoSecs));
                  const cantoGaugePct = ((clampCantoSecs - minGaugeSecs) / (maxGaugeSecs - minGaugeSecs)) * 100;

                  // Target 12:30 pct on gauge: (750 - 600) / 300 = 50%
                  const optimalGaugePct = 50;
                  // Min window 11:50 pct: (710 - 600) / 300 = 36.6%
                  const windowMinGaugePct = ((WINDOW_MIN_SECS - minGaugeSecs) / (maxGaugeSecs - minGaugeSecs)) * 100;
                  // Max window 13:40 pct: (820 - 600) / 300 = 73.3%
                  const windowMaxGaugePct = ((WINDOW_MAX_SECS - minGaugeSecs) / (maxGaugeSecs - minGaugeSecs)) * 100;

                  return (
                    <motion.div
                      key={topic.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className={cn(
                        "bg-white rounded-3xl p-6 border shadow-sm transition-all relative overflow-hidden flex flex-col justify-between",
                        evaluation.gradeBorderColor
                      )}
                    >
                      {/* Top Master Score Accent Ribbon */}
                      <div className={cn(
                        "absolute top-0 left-0 right-0 h-1.5",
                        evaluation.gradeCategory === "sobresaliente" ? "bg-emerald-500" :
                        evaluation.gradeCategory === "notable" ? "bg-indigo-600" :
                        evaluation.gradeCategory === "bien" ? "bg-amber-500" :
                        evaluation.gradeCategory === "suficiente" ? "bg-orange-500" : "bg-rose-500"
                      )} />

                      <div>
                        {/* Header metadata row */}
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 bg-slate-100 rounded-lg text-slate-700 border border-slate-200/60">
                              {subject?.name.split(" ")[0] || "Bloque"} · Tema {topic.number}
                            </span>
                            <span className="text-[10px] font-bold text-slate-500 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-200/50">
                              {vueltas > 0 ? `Vuelta ${vueltas}` : "Vuelta 0"} · {reviewsCount} {reviewsCount === 1 ? "sesión" : "sesiones"}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            {/* MASTER SCORE BADGE (1.0 - 10.0) */}
                            <div className={cn(
                              "flex items-center gap-1.5 px-3 py-1 rounded-full border shadow-2xs",
                              evaluation.gradeBadgeClass
                            )}>
                              <Award size={13} className="shrink-0" />
                              <span className="text-xs font-black">
                                {evaluation.overallScore.toFixed(1)}
                              </span>
                              <span className="text-[10px] font-bold opacity-75">/ 10</span>
                            </div>

                            <button
                              onClick={() => handleRemoveTopic(topic.id)}
                              className="text-slate-400 hover:text-rose-600 p-1 rounded-lg hover:bg-rose-50 transition-colors"
                              title="Quitar tema de la sesión"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        {/* Topic Title & Sub-score Level */}
                        <div className="mb-4">
                          <div className="flex items-baseline justify-between gap-2">
                            <h3 
                              className="text-base font-black font-serif text-slate-900 leading-snug"
                              title={topic.fullTitle || topic.title}
                            >
                              {topic.title}
                            </h3>
                          </div>
                          <span className={cn("text-[11px] font-bold", evaluation.gradeTextColor)}>
                            {evaluation.gradeLabel}
                          </span>
                        </div>

                        {/* CRONÓMETRO GAUGE VISUAL (Window 11:50 - 13:40 | Target 12:30) */}
                        <div className="bg-slate-50/90 rounded-2xl p-3.5 border border-slate-200/70 mb-3.5">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-1.5">
                              <Timer size={13} className="text-slate-600" />
                              <span className="text-[10px] font-black uppercase tracking-wider text-slate-700">
                                Cronómetro Cante
                              </span>
                              <span className="text-[10px] font-medium text-slate-400">
                                (Meta 12:30)
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className={cn(
                                "text-xs font-black",
                                !hasCanto ? "text-slate-400" :
                                evaluation.timeZone === "perfect" ? "text-emerald-700 font-extrabold" :
                                evaluation.timeZone === "in_window" ? "text-indigo-700" :
                                evaluation.timeZone === "slightly_short" || evaluation.timeZone === "slightly_long" ? "text-amber-700" : "text-rose-600"
                              )}>
                                {hasCanto ? `${lastCantoMins}m ${lastCantoSecs.toString().padStart(2, "0")}s` : "Sin cante grabado"}
                              </span>
                              {hasCanto && (
                                <span className={cn(
                                  "text-[10px] font-black px-1.5 py-0.2 rounded-md",
                                  evaluation.timeZone === "perfect" ? "bg-emerald-100 text-emerald-800" :
                                  evaluation.timeZone === "in_window" ? "bg-indigo-100 text-indigo-800" :
                                  "bg-amber-100 text-amber-800"
                                )}>
                                  {evaluation.timeDevianceFormatted}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Visual Time Track */}
                          <div className="relative w-full h-3 bg-slate-200/80 rounded-full overflow-hidden my-2.5">
                            {/* Window zone [11:50, 13:40] */}
                            <div 
                              className="absolute top-0 bottom-0 bg-emerald-100/90 border-x border-emerald-400/40"
                              style={{ 
                                left: `${windowMinGaugePct}%`, 
                                width: `${windowMaxGaugePct - windowMinGaugePct}%` 
                              }}
                              title="Ventana oficial reglamentaria: 11:50 - 13:40"
                            />
                            {/* Perfect line at 12:30 */}
                            <div 
                              className="absolute top-0 bottom-0 w-1 bg-indigo-600 z-10"
                              style={{ left: `${optimalGaugePct}%` }}
                              title="Tiempo óptimo exacto: 12:30"
                            />
                            {/* User's Cante Needle */}
                            {hasCanto && (
                              <div 
                                className="absolute top-0 bottom-0 w-2.5 bg-slate-900 rounded-full shadow-md z-20 -ml-1.25 ring-2 ring-white"
                                style={{ left: `${cantoGaugePct}%` }}
                                title={`Tu tiempo registrado: ${lastCantoMins}m ${lastCantoSecs}s`}
                              />
                            )}
                          </div>

                          {/* Gauge scale markers */}
                          <div className="flex justify-between text-[9px] font-bold text-slate-400 mt-1">
                            <span>10:00 (Corto)</span>
                            <span className="text-emerald-600 font-extrabold">11:50 Min</span>
                            <span className="text-indigo-700 font-black">★ 12:30 Óptimo</span>
                            <span className="text-emerald-600 font-extrabold">13:40 Max</span>
                            <span>15:00 (Corte)</span>
                          </div>
                        </div>

                        {/* DIAGNOSTIC BENCHMARK GRID (4 PILLARS) */}
                        <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50/80 rounded-2xl border border-slate-200/60 mb-3.5">
                          {/* 1. Curva de Ebbinghaus */}
                          <div className="flex flex-col items-center justify-center text-center p-1">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-0.5 flex items-center gap-0.5">
                              <Brain size={10} className="text-cyan-600" />
                              <span>Ebbinghaus</span>
                            </span>
                            <span className={cn(
                              "text-xs font-black",
                              evaluation.retentionPct >= 85 ? "text-emerald-700" :
                              evaluation.retentionPct >= 70 ? "text-indigo-700" :
                              evaluation.retentionPct >= 50 ? "text-amber-700" : "text-rose-600"
                            )}>
                              {evaluation.retentionPct}%
                            </span>
                            <span className="text-[9px] font-bold text-slate-400 mt-0.5">
                              {daysSinceTouch === null ? "Sin datos" : daysSinceTouch === 0 ? "Repasado hoy" : daysSinceTouch === 1 ? "Ayer" : `Hace ${daysSinceTouch}d`}
                            </span>
                          </div>

                          {/* 2. Last Preparador Grade */}
                          <div className="flex flex-col items-center justify-center text-center p-1 border-x border-slate-200/60">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-0.5 flex items-center gap-0.5">
                              <Star size={10} className="text-amber-500" />
                              <span>Nota Prep.</span>
                            </span>
                            <span className={cn(
                              "text-xs font-black",
                              lastGrade === null ? "text-slate-400" :
                              lastGrade >= 8.5 ? "text-emerald-600" :
                              lastGrade >= 7.0 ? "text-indigo-600" :
                              lastGrade >= 5.0 ? "text-amber-600" : "text-rose-600"
                            )}>
                              {lastGrade !== null ? `${lastGrade.toFixed(1)}/10` : "Pendiente"}
                            </span>
                            <span className="text-[9px] font-bold text-slate-400 mt-0.5">
                              {lastGrade !== null ? (lastGrade >= 8 ? "Sobresaliente" : lastGrade >= 7 ? "Notable" : lastGrade >= 5 ? "Aprobado" : "Suspenso") : "Sin examen"}
                            </span>
                          </div>

                          {/* 3. Puntuación Cronómetro */}
                          <div className="flex flex-col items-center justify-center text-center p-1">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-0.5 flex items-center gap-0.5">
                              <Clock size={10} className="text-indigo-600" />
                              <span>Ritmo Cante</span>
                            </span>
                            <span className={cn(
                              "text-xs font-black",
                              !hasCanto ? "text-slate-400" :
                              evaluation.timeScore >= 9.0 ? "text-emerald-700" :
                              evaluation.timeScore >= 7.5 ? "text-indigo-700" :
                              evaluation.timeScore >= 5.0 ? "text-amber-700" : "text-rose-600"
                            )}>
                              {hasCanto ? `${evaluation.timeScore.toFixed(1)}/10` : "—"}
                            </span>
                            <span className="text-[9px] font-bold text-slate-400 mt-0.5">
                              {hasCanto ? evaluation.timeDevianceFormatted : "Cronometrar"}
                            </span>
                          </div>
                        </div>

                        {/* ACTIONABLE EXECUTIVE ADVICE PILL (How to reach 10/10) */}
                        <div className={cn(
                          "p-3 rounded-xl border text-xs mb-3 flex items-start gap-2",
                          evaluation.overallScore >= 8.5 ? "bg-emerald-50/70 border-emerald-200/60 text-emerald-950" :
                          evaluation.overallScore >= 7.0 ? "bg-indigo-50/70 border-indigo-200/60 text-indigo-950" :
                          evaluation.overallScore >= 5.0 ? "bg-amber-50/70 border-amber-200/60 text-amber-950" :
                          "bg-rose-50/70 border-rose-200/60 text-rose-950"
                        )}>
                          <Sparkles size={14} className="shrink-0 mt-0.5 text-indigo-600" />
                          <div className="leading-relaxed">
                            <strong className="font-black mr-1">Plan para el 10:</strong>
                            <span>{evaluation.actionPlan}</span>
                          </div>
                        </div>
                      </div>

                      {/* ACTION BUTTONS ROW */}
                      <div className="pt-2 border-t border-slate-100">
                        {/* Registrar Feedback del Preparador / Cante Manual */}
                        <button
                          onClick={() => {
                            setFeedbackTopic(topic);
                            setPrepGrade(lastGrade || 7.5);
                            setPrepMinutes(lastCantoMins || 12);
                            setPrepSeconds(lastCantoSecs || 30);
                          }}
                          className="w-full px-3.5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2 active:scale-95"
                        >
                          <Star size={13} className="text-amber-400" />
                          <span>Registrar Cante / Nota Preparador</span>
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* TOPIC PICKER MODAL */}
      <AnimatePresence>
        {isPickerOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-3xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-200/80 overflow-hidden"
            >
              {/* Header */}
              <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black font-serif text-slate-900">
                    Añadir Temas para el {activeDay === "lunes" ? "Lunes" : "Jueves"}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Selecciona los temas oficiales del programa para llevar a tu próxima sesión.
                  </p>
                </div>
                <button
                  onClick={() => setIsPickerOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Subject Tabs */}
              <div className="px-5 pt-3 pb-2 border-b border-slate-100 overflow-x-auto no-scrollbar flex gap-1.5">
                {initialSubjects.map((s) => {
                  const isSel = pickerSubjectId === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setPickerSubjectId(s.id)}
                      className={cn(
                        "px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0",
                        isSel
                          ? "bg-slate-900 text-white shadow-sm"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200/70"
                      )}
                    >
                      {s.name.split(" ")[0]} ({s.totalTopics})
                    </button>
                  );
                })}
              </div>

              {/* Search Bar */}
              <div className="p-4 border-b border-slate-100">
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-3 text-slate-400" />
                  <input
                    type="text"
                    value={pickerSearch}
                    onChange={(e) => setPickerSearch(e.target.value)}
                    placeholder="Buscar por número o texto (ej: 3, 16, Constitución, Tutela)..."
                    className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200/80 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-slate-900/10 text-slate-800"
                  />
                </div>
              </div>

              {/* Topics List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {pickerFilteredTopics.map((topic) => {
                  const isAssigned = (schedule[activeDay as "lunes" | "jueves"] || []).includes(topic.id);
                  const prog = userProgress[topic.id];
                  const vueltas = prog?.vueltas || 0;

                  return (
                    <div
                      key={topic.id}
                      onClick={() => {
                        if (isAssigned) {
                          handleRemoveTopic(topic.id);
                        } else {
                          handleAddTopic(topic.id);
                        }
                      }}
                      className={cn(
                        "p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 group",
                        isAssigned
                          ? "bg-indigo-50/70 border-indigo-200"
                          : "bg-white border-slate-200/70 hover:border-slate-300 hover:bg-slate-50"
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                            Tema {topic.number}
                          </span>
                          {vueltas > 0 && (
                            <span className="text-[10px] font-bold text-emerald-600">
                              Vuelta {vueltas}
                            </span>
                          )}
                        </div>
                        <h4 className="text-xs font-bold text-slate-900 truncate" title={topic.fullTitle || topic.title}>
                          {topic.title}
                        </h4>
                      </div>

                      <div className="shrink-0">
                        {isAssigned ? (
                          <span className="px-3 py-1 bg-indigo-600 text-white text-xs font-bold rounded-xl flex items-center gap-1 shadow-sm">
                            <CheckCircle2 size={12} />
                            <span>Asignado</span>
                          </span>
                        ) : (
                          <span className="px-3 py-1 bg-slate-100 text-slate-700 group-hover:bg-slate-900 group-hover:text-white text-xs font-bold rounded-xl transition-all">
                            Añadir
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
                <span className="text-xs text-slate-500 font-medium">
                  {(schedule[activeDay as "lunes" | "jueves"] || []).length} temas asignados para el {activeDay}
                </span>
                <button
                  onClick={() => setIsPickerOpen(false)}
                  className="px-5 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-all shadow-sm"
                >
                  Listo
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* RECORD PREPARADOR FEEDBACK MODAL */}
      <AnimatePresence>
        {feedbackTopic && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 flex flex-col shadow-2xl border border-slate-200/80 relative overflow-hidden"
            >
              <button
                onClick={() => setFeedbackTopic(null)}
                className="absolute top-5 right-5 p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100"
              >
                <X size={18} />
              </button>

              <div className="mb-5">
                <span className="text-[10px] font-black uppercase tracking-wider px-3 py-1 bg-amber-50 text-amber-800 rounded-full border border-amber-200">
                  Feedback Oficial del Preparador
                </span>
                <h3 className="text-xl font-black font-serif text-slate-900 mt-2">
                  Tema {feedbackTopic.number}: {feedbackTopic.title}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Introduce la nota oficial y observaciones que te dio el preparador en tu sesión de cante.
                </p>
              </div>

              <div className="space-y-4">
                {/* Nota del preparador */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/60">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-700">Nota del Preparador (0 - 10):</span>
                    <span className="text-lg font-black text-amber-600">{prepGrade.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    step="0.25"
                    value={prepGrade}
                    onChange={(e) => setPrepGrade(parseFloat(e.target.value))}
                    className="w-full accent-amber-500"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400 font-bold mt-1">
                    <span>1 (Suspenso)</span>
                    <span>5 (Aprobado)</span>
                    <span>7 (Notable)</span>
                    <span>10 (Sobresaliente)</span>
                  </div>
                </div>

                {/* Tiempo cantado */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/60">
                  <span className="text-xs font-bold text-slate-700 block mb-2">
                    Tiempo de Cante con el Preparador:
                  </span>
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <label className="text-[10px] font-bold text-slate-400 block mb-1 uppercase">Minutos</label>
                      <input
                        type="number"
                        min="0"
                        max="30"
                        value={prepMinutes}
                        onChange={(e) => setPrepMinutes(parseInt(e.target.value) || 0)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-800"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] font-bold text-slate-400 block mb-1 uppercase">Segundos</label>
                      <input
                        type="number"
                        min="0"
                        max="59"
                        value={prepSeconds}
                        onChange={(e) => setPrepSeconds(parseInt(e.target.value) || 0)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-800"
                      />
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-400 font-medium mt-2 flex items-center justify-between">
                    <span>Meta óptima: 12m 30s.</span>
                    <span className="text-indigo-600 font-bold">Ventana: 11:50 - 13:40</span>
                  </div>
                </div>

                {/* Comentarios del preparador */}
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Consejos y Correcciones del Preparador:
                  </label>
                  <textarea
                    rows={3}
                    value={prepNotes}
                    onChange={(e) => setPrepNotes(e.target.value)}
                    placeholder="Ej: Faltó hilar el art. 53.2 de la CE, buena dicción y postura, recortar epígrafe 3 para entrar en 12:30 minutos..."
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-slate-900/10 text-slate-800"
                  />
                </div>

                {/* Botón guardar */}
                <button
                  onClick={handleSavePreparadorFeedback}
                  className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-xs font-black shadow-md transition-all flex items-center justify-center gap-2 active:scale-95"
                >
                  <Save size={14} />
                  <span>Guardar Evaluación del Preparador</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
