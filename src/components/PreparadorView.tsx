import React, { useState, useMemo, useEffect } from "react";
import { 
  Calendar, Clock, CheckCircle2, AlertTriangle, 
  XCircle, Plus, Trash2, BookOpen, Star, ChevronRight, ChevronDown, ChevronUp, X, Search,
  Award, Sparkles, Save, ArrowUpDown, Brain, Timer, Target, Flame, Info,
  TrendingDown, History, Zap
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
import { playSound } from "../lib/sound";
import { PreparadorTopicCard } from "./preparador/PreparadorTopicCard";
import { PreparadorQuickFeedbackModal } from "./preparador/PreparadorQuickFeedbackModal";

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
  const [showMobileKpiDetails, setShowMobileKpiDetails] = useState(false);

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
  const [isSavingFeedback, setIsSavingFeedback] = useState(false);

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

      // Ensure sessions are sorted chronologically descending
      const sortedSessions = [...sessions].sort(
        (a, b) => safeParseDate(b.date).getTime() - safeParseDate(a.date).getTime()
      );

      // Days since last cante (freno 100% de la curva)
      const daysSinceCanto = lastCantoDate
        ? Math.max(0, Math.floor((new Date().getTime() - safeParseDate(lastCantoDate).getTime()) / (1000 * 3600 * 24)))
        : null;

      // Days since last review / study session (freno 50% de la curva)
      const reviewSession = sortedSessions.find((s) => !isCantoSession(s)) || sortedSessions[0];
      const lastReviewDate = reviewSession?.date || prog?.lastReviewDate || prog?.firstStudyDate;
      const daysSinceReview = lastReviewDate
        ? Math.max(0, Math.floor((new Date().getTime() - safeParseDate(lastReviewDate).getTime()) / (1000 * 3600 * 24)))
        : null;

      // Global last touch date
      const lastSessionDate = sortedSessions[0]?.date || prog?.lastReviewDate || prog?.firstStudyDate;
      const daysSinceTouch = lastSessionDate 
        ? Math.max(0, Math.floor((new Date().getTime() - safeParseDate(lastSessionDate).getTime()) / (1000 * 3600 * 24)))
        : null;

      const subject = initialSubjects.find((s) => s.id === topic.subjectId);
      const vueltas = prog?.vueltas || 0;
      const reviewsCount = sessions.length;

      // Complete master scientific evaluation with continuous Ebbinghaus decay
      const evaluation: TopicPreparationEvaluation = evaluateTopicPreparation({
        topicNumber: topic.number,
        topicTitle: topic.title,
        totalCantoSecs: hasCanto ? lastCantoTotalSecs : null,
        lastGrade: lastGrade,
        daysSinceCanto,
        daysSinceReview,
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
        daysSinceCanto,
        daysSinceReview,
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
        avgPeakScore: null,
        avgDecay: null,
        listosTribunal: 0,
        enAjuste: 0,
        enRiesgo: 0,
        totalMinutes: 0,
        avgRetention: null
      };
    }

    const scores = topicsAnalysis.map((t) => t.evaluation.overallScore);
    const avgScore = scores.reduce((a, b) => a + b, 0) / total;

    const peakScores = topicsAnalysis.map((t) => t.evaluation.peakScore);
    const avgPeakScore = peakScores.reduce((a, b) => a + b, 0) / total;
    const avgDecay = Math.max(0, avgPeakScore - avgScore);

    const listosTribunal = topicsAnalysis.filter((t) => t.evaluation.overallScore >= 7.2).length;
    const enAjuste = topicsAnalysis.filter((t) => t.evaluation.overallScore >= 4.5 && t.evaluation.overallScore < 7.2).length;
    const enRiesgo = topicsAnalysis.filter((t) => t.evaluation.overallScore < 4.5).length;

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
      avgPeakScore,
      avgDecay,
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

  // Save preparador feedback / cante session with double-submit guard
  const handleSavePreparadorFeedback = async (data: {
    topicId: string;
    durationMinutes: number;
    durationSeconds: number;
    grade: number;
    notes: string;
  }) => {
    if (isSavingFeedback) return;
    try {
      setIsSavingFeedback(true);
      await addStudySession(
        data.topicId,
        data.durationMinutes,
        feedbackTopic?.difficulty || 5,
        "canto",
        getLocalDateString(),
        {
          cantoSeconds: data.durationSeconds,
          cantoGrade: data.grade,
          cantoType: "preparador",
          mistakes: data.notes,
          notes: `Sesión de cante ante preparador: ${data.durationMinutes}m ${data.durationSeconds}s. Nota: ${data.grade}. Feedback: ${data.notes}`
        }
      );
      playSound.success();
      toast.success(`Evaluación del preparador guardada (Nota ${data.grade.toFixed(1)})`);
      setFeedbackTopic(null);
      setPrepNotes("");
    } catch (e: any) {
      console.error(e);
      toast.error("Error al registrar el feedback del preparador: " + (e?.message || e));
    } finally {
      setIsSavingFeedback(false);
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

  // All historical sessions with preparador / cantos (with deduplication safeguard)
  const preparadorSessions = useMemo(() => {
    const raw = recentSessions.filter(isCantoSession);
    const unique: any[] = [];
    const seen = new Set<string>();
    for (const s of raw) {
      const key = `${s.topicId}-${s.date}-${s.durationMinutes || s.duration || 0}-${s.cantoSeconds || 0}-${s.cantoGrade ?? s.grade ?? ''}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(s);
      }
    }
    return unique;
  }, [recentSessions]);

  return (
    <div className="flex flex-col h-full bg-[#F5F5F7] overflow-hidden">
      {/* SLIM STICKY HEADER (Compact on mobile) */}
      <div className="bg-white/95 backdrop-blur-2xl border-b border-slate-200/70 px-3.5 py-2.5 sm:px-6 sm:py-3.5 sticky top-0 z-20 shrink-0 shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 max-w-[100rem] mx-auto">
          {/* Title Row */}
          <div className="flex items-center justify-between sm:justify-start gap-2.5">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0 shadow-2xs">
                <Award size={15} strokeWidth={2.2} />
              </div>
              <h1 className="text-sm sm:text-lg font-black text-slate-900 tracking-tight font-serif truncate">
                Panel del Preparador (L/J)
              </h1>
            </div>

            <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/80 shrink-0">
              <Target size={11} className="text-indigo-600" />
              <span>Meta: 12:30 min</span>
            </span>

            {/* Mobile Add Topics Button */}
            {activeDay !== "historial" && (
              <button
                onClick={() => setIsPickerOpen(true)}
                className="sm:hidden px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1 shrink-0 active:scale-95"
              >
                <Plus size={13} strokeWidth={2.5} />
                <span>Añadir</span>
              </button>
            )}
          </div>

          {/* DAY SEGMENTED CONTROLLER (LUNES / JUEVES / HISTORIAL) */}
          <div className="flex items-center gap-2">
            <div className="flex bg-slate-200/70 p-1 rounded-xl border border-slate-300/40 flex-1 sm:flex-initial">
              <button
                onClick={() => setActiveDay("lunes")}
                className={cn(
                  "flex-1 sm:flex-initial px-3 sm:px-4 py-1 sm:py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5",
                  activeDay === "lunes"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                <Calendar size={12} />
                <span>Lunes</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-slate-100 font-bold">
                  {(schedule.lunes || []).length}
                </span>
              </button>

              <button
                onClick={() => setActiveDay("jueves")}
                className={cn(
                  "flex-1 sm:flex-initial px-3 sm:px-4 py-1 sm:py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5",
                  activeDay === "jueves"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                <Calendar size={12} />
                <span>Jueves</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-slate-100 font-bold">
                  {(schedule.jueves || []).length}
                </span>
              </button>

              <button
                onClick={() => setActiveDay("historial")}
                className={cn(
                  "flex-1 sm:flex-initial px-3 sm:px-4 py-1 sm:py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5",
                  activeDay === "historial"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                <Award size={12} />
                <span>Historial</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-slate-100 font-bold">
                  {preparadorSessions.length}
                </span>
              </button>
            </div>

            {/* Desktop Add Topics Button */}
            {activeDay !== "historial" && (
              <button
                onClick={() => setIsPickerOpen(true)}
                className="hidden sm:flex px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs items-center gap-1.5 shrink-0 active:scale-95"
              >
                <Plus size={14} strokeWidth={2.5} />
                <span>Añadir Temas</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* MAIN SCROLLABLE CONTENT AREA (Silky-smooth touch scroll enabled) */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain touch-pan-y -webkit-overflow-scrolling-touch p-3 sm:p-6 md:p-8 pb-44 sm:pb-36 max-w-[100rem] mx-auto w-full">
        {/* Status banner and Overview Benchmark Cards inside scrollable body */}
        {activeDay !== "historial" && (
          <div className="space-y-2 sm:space-y-3 mb-4 sm:mb-5">
            {/* Status explanation & Meta banner (Slim on mobile) */}
            <div className="flex flex-wrap items-center justify-between gap-1.5 p-2 sm:p-3 bg-white rounded-2xl border border-slate-200/80 shadow-2xs">
              <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-semibold text-slate-700">
                <Clock size={12} className="text-slate-500 shrink-0" />
                <span className="truncate">{scheduleStatus.timeRemainingMessage}</span>
              </div>
              <div className="flex items-center gap-1 text-[10px] sm:text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200/60 px-2 sm:px-2.5 py-0.5 rounded-full shrink-0">
                <Target size={11} className="text-indigo-600" />
                <span>Meta Tribunal: 12:30m</span>
              </div>
            </div>

            {/* MOBILE COMPACT KPI STRIP (< sm screens) */}
            <div className="sm:hidden bg-white rounded-2xl p-2.5 border border-slate-200/70 shadow-2xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
                  <div className="flex items-baseline gap-1 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100 shrink-0">
                    <span className="text-[9px] font-bold uppercase text-slate-400">Nota:</span>
                    <span className={cn(
                      "text-xs font-black tabular-nums",
                      kpis.avgScore === null ? "text-slate-400" :
                      kpis.avgScore >= 8.5 ? "text-emerald-700" :
                      kpis.avgScore >= 7.0 ? "text-indigo-700" :
                      kpis.avgScore >= 5.0 ? "text-amber-700" : "text-rose-600"
                    )}>
                      {kpis.avgScore !== null ? `${kpis.avgScore.toFixed(1)}` : "—"}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100 shrink-0 text-[10px] font-bold text-slate-700">
                    <span className="text-emerald-600 font-black">{kpis.listosTribunal}L</span>
                    <span>·</span>
                    <span className="text-amber-600 font-black">{kpis.enAjuste}A</span>
                    <span>·</span>
                    <span className="text-rose-600 font-black">{kpis.enRiesgo}R</span>
                  </div>

                  <div className="flex items-center gap-1 bg-cyan-50/70 px-2 py-1 rounded-lg border border-cyan-100/60 shrink-0 text-[10px] font-bold text-cyan-800">
                    <Brain size={10} className="text-cyan-600" />
                    <span>{kpis.avgRetention !== null ? `${kpis.avgRetention}%` : "—"}</span>
                  </div>

                  <div className="flex items-center gap-1 bg-amber-50/70 px-2 py-1 rounded-lg border border-amber-100/60 shrink-0 text-[10px] font-bold text-amber-800">
                    <Timer size={10} className="text-amber-600" />
                    <span>~{kpis.totalMinutes}m</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowMobileKpiDetails(prev => !prev)}
                  className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors shrink-0 ml-1"
                  title="Expandir / Contraer diagnóstico"
                >
                  {showMobileKpiDetails ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </button>
              </div>

              {/* Collapsible Mobile Detailed Grid */}
              {showMobileKpiDetails && (
                <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-100 animate-in fade-in duration-200">
                  <div className="p-2 bg-slate-50 rounded-xl">
                    <div className="text-[9px] font-bold text-slate-400 uppercase">Nota Proyectada</div>
                    <div className="text-sm font-black text-slate-900 mt-0.5">
                      {kpis.avgScore !== null ? `${kpis.avgScore.toFixed(1)} / 10` : "—"}
                    </div>
                  </div>
                  <div className="p-2 bg-slate-50 rounded-xl">
                    <div className="text-[9px] font-bold text-slate-400 uppercase">Diagnóstico</div>
                    <div className="text-xs font-bold text-slate-800 mt-0.5">
                      <span className="text-emerald-600 font-black">{kpis.listosTribunal}</span> Listos · <span className="text-amber-600 font-black">{kpis.enAjuste}</span> Ajuste
                    </div>
                  </div>
                  <div className="p-2 bg-slate-50 rounded-xl">
                    <div className="text-[9px] font-bold text-slate-400 uppercase">Curva Ebbinghaus</div>
                    <div className="text-xs font-bold text-slate-800 mt-0.5">
                      {kpis.avgRetention !== null ? `${kpis.avgRetention}% retención` : "—"}
                    </div>
                  </div>
                  <div className="p-2 bg-slate-50 rounded-xl">
                    <div className="text-[9px] font-bold text-slate-400 uppercase">Duración Cante</div>
                    <div className="text-xs font-bold text-slate-800 mt-0.5">
                      ~{kpis.totalMinutes} min ({kpis.total} temas)
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* DESKTOP & TABLET BENCHMARK CARDS (hidden on mobile, visible on sm and up) */}
            <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
              {/* 1. Nota Media de Preparación Proyectada (1-10) */}
              <div className="bg-white rounded-2xl p-3 sm:p-3.5 border border-slate-200/70 shadow-2xs flex items-center gap-2.5 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0 text-indigo-600">
                  <Award size={16} strokeWidth={2.2} />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 truncate">
                    Nota Proyectada
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className={cn(
                      "text-base sm:text-xl font-black font-serif tabular-nums",
                      kpis.avgScore === null ? "text-slate-400" :
                      kpis.avgScore >= 8.5 ? "text-emerald-700" :
                      kpis.avgScore >= 7.0 ? "text-indigo-700" :
                      kpis.avgScore >= 5.0 ? "text-amber-700" : "text-rose-600"
                    )}>
                      {kpis.avgScore !== null ? `${kpis.avgScore.toFixed(1)}` : "—"}
                    </span>
                    <span className="text-[10px] sm:text-xs font-bold text-slate-400">/ 10</span>
                  </div>
                </div>
              </div>

              {/* 2. Diagnóstico del Tribunal */}
              <div className="bg-white rounded-2xl p-3 sm:p-3.5 border border-slate-200/70 shadow-2xs flex items-center gap-2.5 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-center shrink-0">
                  <div className="flex -space-x-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-1 ring-white inline-block" />
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500 ring-1 ring-white inline-block" />
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 ring-1 ring-white inline-block" />
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 truncate">
                    Estado Tribunal
                  </div>
                  <div className="text-[11px] sm:text-xs font-bold text-slate-700 truncate">
                    <span className="text-emerald-600 font-black">{kpis.listosTribunal}</span> L · <span className="text-amber-600 font-black">{kpis.enAjuste}</span> A · <span className="text-rose-600 font-black">{kpis.enRiesgo}</span> R
                  </div>
                </div>
              </div>

              {/* 3. Retención Media de Ebbinghaus */}
              <div className="bg-white rounded-2xl p-3 sm:p-3.5 border border-slate-200/70 shadow-2xs flex items-center gap-2.5 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-cyan-50 border border-cyan-100 flex items-center justify-center shrink-0 text-cyan-600">
                  <Brain size={16} strokeWidth={2.2} />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 truncate">
                    Curva Ebbinghaus
                  </div>
                  <div className="text-sm sm:text-lg font-black text-slate-900">
                    {kpis.avgRetention !== null ? `${kpis.avgRetention}%` : "—"}
                    <span className="text-[10px] sm:text-xs font-normal text-slate-500 ml-1">retención</span>
                  </div>
                </div>
              </div>

              {/* 4. Tiempo Estimado Total */}
              <div className="bg-white rounded-2xl p-3 sm:p-3.5 border border-slate-200/70 shadow-2xs flex items-center gap-2.5 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0 text-amber-500">
                  <Timer size={16} strokeWidth={2.2} />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 truncate">
                    Cante Total Estimado
                  </div>
                  <div className="text-sm sm:text-lg font-black text-slate-900">
                    ~{kpis.totalMinutes}m
                    <span className="text-[10px] sm:text-xs font-normal text-slate-500 ml-1">({kpis.total} temas)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3">
              <div>
                <h2 className="text-base sm:text-lg font-black text-slate-900 font-serif flex items-center gap-2">
                  <span>Temas Asignados ({activeDay === "lunes" ? "Lunes" : "Jueves"})</span>
                  <span className="text-xs px-2 py-0.5 bg-slate-200/80 text-slate-700 rounded-lg font-sans font-bold">
                    {assignedTopics.length}
                  </span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5 hidden sm:block">
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
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5 sm:gap-4">
                {sortedTopicsAnalysis.map((item) => (
                  <PreparadorTopicCard
                    key={item.topic.id}
                    topic={item.topic}
                    subject={item.subject}
                    evaluation={item.evaluation}
                    hasCanto={item.hasCanto}
                    lastCantoMins={item.lastCantoMins}
                    lastCantoSecs={item.lastCantoSecs}
                    lastGrade={item.lastGrade}
                    daysSinceTouch={item.daysSinceTouch}
                    vueltas={item.vueltas}
                    reviewsCount={item.reviewsCount}
                    onRemove={handleRemoveTopic}
                    onOpenFeedback={(topic) => {
                      setFeedbackTopic(topic);
                      setPrepGrade(item.lastGrade ?? 7.5);
                      setPrepMinutes(item.lastCantoMins > 0 ? item.lastCantoMins : 12);
                      setPrepSeconds(item.lastCantoSecs >= 0 ? item.lastCantoSecs : 30);
                    }}
                  />
                ))}
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
      <PreparadorQuickFeedbackModal
        topic={feedbackTopic}
        isOpen={Boolean(feedbackTopic)}
        onClose={() => setFeedbackTopic(null)}
        onSave={handleSavePreparadorFeedback}
        initialGrade={prepGrade}
        initialMinutes={prepMinutes}
        initialSeconds={prepSeconds}
        isSaving={isSavingFeedback}
      />
    </div>
  );
}
