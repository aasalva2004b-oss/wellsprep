import React, { useState, useMemo, useEffect, memo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { initialSubjects, initialTopics } from "../data/initialData";
import { Topic } from "../types";
import {
  ChevronRight,
  Search,
  FileText,
  CalendarDays,
  Brain,
  Timer,
  LayoutGrid,
  List,
  Sparkles,
  Clock,
  Calendar,
  History,
  ArrowRight,
  Mic,
  Plus,
  BookOpen,
  X,
  Flame,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  Layers,
  BarChart2,
  SlidersHorizontal,
  BookmarkCheck,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { cn, formatDecimalHours, formatCleanStudyHours, safeParseDate, getLocalDateString } from "../lib/utils";
import { calculateEstimatedReviewTime } from "../lib/repasoPredictor";
import { TopicEditorDialog } from "./TopicEditorDialog";
import { useFirebase } from "../lib/FirebaseProvider";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { serverTimestamp, doc, setDoc } from "firebase/firestore";
import {
  TopicProgressData,
  PredictionResult,
  predictTopic,
  calculateNextReviewDate,
} from "../lib/prediction";
import { useWellsProgressFactor } from "../hooks/useWellsProgressFactor";
import { calculateNextSRSState } from "../lib/srs";
import { calculateTopicCycle } from "../lib/oposicionCycle";
import { buildSubjectTelemetryIndex, FastTopicTelemetry } from "../lib/performanceCache";
import { playSound } from "../lib/sound";

export function TemarioView() {
  const { userProgress, user, userSettings, recentSessions = [], addStudySession } = useFirebase();
  const activeSubjectsIds = userSettings?.activeSubjects || initialSubjects.map(s => s.id);
  const activeSubjects = initialSubjects.filter(s => activeSubjectsIds.includes(s.id));
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>(
    userSettings?.defaultSubject || (activeSubjectsIds.length > 0 ? activeSubjectsIds[0] : initialSubjects[0].id)
  );

  useEffect(() => {
    if (userSettings?.defaultSubject && activeSubjectsIds.includes(userSettings.defaultSubject)) {
      setSelectedSubjectId(userSettings.defaultSubject);
    }
  }, [userSettings?.defaultSubject]);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "due_today" | "en_refrescos" | "studied" | "pending"
  >("all");
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  const handleAddCustomTopic = async () => {
    if (!user) return;
    const newId = `custom_${Date.now()}`;
    try {
      await setDoc(doc(db, `users/${user.uid}/progress`, newId), {
        userId: user.uid,
        topicId: newId,
        customTitle: "Nuevo Tema Personalizado",
        isCustom: true,
        subjectId: selectedSubjectId,
        updatedAt: serverTimestamp(),
        pages: 0,
        difficulty: 3,
        studyTimeHours: 0,
        firstStudyDate: "",
        mejorTiempoCantoMinutos: 0,
        mejorTiempoCantoSegundos: 0,
        notas: "",
        vueltas: 0,
        lastReviewDate: "",
        nextReviewDate: "",
      });
      setSelectedTopicId(newId);
    } catch (e) {
      handleFirestoreError(
        e,
        OperationType.WRITE,
        `users/${user.uid}/progress/${newId}`,
      );
    }
  };

  const selectedSubject = initialSubjects.find(
    (s) => s.id === selectedSubjectId,
  );

  // Helper to test if a topic is due today or overdue
  const isTopicDueToday = (topicId: string, prog?: TopicProgressData) => {
    if (!prog?.firstStudyDate) return false;
    const srsState = {
      easinessFactor: prog?.srsEasinessFactor || 2.5,
      interval: prog?.srsInterval || 0,
      repetitions: prog?.srsRepetitions || 0
    };
    const nextDate = prog?.nextReviewDate || calculateNextSRSState(prog?.difficulty || 5, srsState, prog?.lastReviewDate || prog?.firstStudyDate).nextReviewDate;
    if (!nextDate) return false;
    const targetDate = safeParseDate(nextDate);
    const today = new Date(getLocalDateString());
    return targetDate <= today;
  };

  const subjectTopics = useMemo(() => {
    // 1. Base static topics for the selected subject
    const baseTopics = initialTopics.filter(
      (t) => t.subjectId === selectedSubjectId,
    );

    // 2. Add custom topics for the subject (from userProgress where isCustom is true)
    const customTopics = Object.entries(userProgress)
      .filter(
        ([id, data]: [string, any]) =>
          data.isCustom &&
          data.subjectId === selectedSubjectId &&
          !data.isDeleted,
      )
      .map(
        ([id, data]: [string, any], index: number) =>
          ({
            id: id || data.topicId || `custom_${selectedSubjectId}_${data.number ?? index}`,
            subjectId: selectedSubjectId,
            number: data.number || 999,
            title: data.customTitle || "Tema Personalizado",
            pages: data.pages || 0,
            difficulty: (data.difficulty || 0) as any,
            tiempoEstudioHoras: data.studyTimeHours || 0,
            fechaPrimerEstudio: data.firstStudyDate || "",
            fechasRepasos: [],
            mejorTiempoCantoMinutos: data.mejorTiempoCantoMinutos || 0,
            mejorTiempoCantoSegundos: data.mejorTiempoCantoSegundos || 0,
            notas: data.notas || "",
          }) as Topic,
      );

    // 3. Deduplicate by unique key, filter out deleted, and apply custom titles
    const seenKeys = new Set<string>();
    const deduplicatedTopics: Topic[] = [];

    for (const t of [...baseTopics, ...customTopics]) {
      const topicKey = t.id || `${t.subjectId || selectedSubjectId}-tema-${t.number}`;
      if (!seenKeys.has(topicKey)) {
        seenKeys.add(topicKey);
        const prog = userProgress[topicKey] || userProgress[t.id];
        if (!prog?.isDeleted) {
          deduplicatedTopics.push({
            ...t,
            id: topicKey,
            title: prog?.customTitle || t.title,
          });
        }
      }
    }

    let combined = deduplicatedTopics;

    // 4. Filter by search query (including full official syllabus text)
    if (searchQuery) {
      const searchLower = searchQuery.toLowerCase().trim();
      combined = combined.filter(
        (t) =>
          t.title.toLowerCase().includes(searchLower) ||
          (t.fullTitle && t.fullTitle.toLowerCase().includes(searchLower)) ||
          t.number.toString().includes(searchLower) ||
          (t.number === 999 && searchLower.includes("ext")),
      );
    }

    // 5. Filter by streamlined status
    if (statusFilter !== "all") {
      combined = combined.filter((t) => {
        const prog = userProgress[t.id];
        const hasStarted = !!(
          prog &&
          (prog.firstStudyDate ||
            prog.studyTimeHours > 0 ||
            prog.vueltas > 0 ||
            prog.lastReviewDate)
        );

        const cycle = calculateTopicCycle(t.id, prog, recentSessions);
        if (statusFilter === "due_today") return isTopicDueToday(t.id, prog);
        if (statusFilter === "en_refrescos") return cycle.phase === "en_refrescos";
        if (statusFilter === "studied") return hasStarted;
        if (statusFilter === "pending") return !hasStarted;
        return true;
      });
    }

    // Sort by number, then ID for stable sorting
    return combined.sort((a, b) => {
      if (a.number !== b.number) return a.number - b.number;
      return a.id.localeCompare(b.id);
    });
  }, [selectedSubjectId, searchQuery, statusFilter, userProgress, recentSessions]);

  // Command Center Stats for the selected subject
  const subjectStats = useMemo(() => {
    let pending = 0;
    let studying = 0;
    let vuelta1 = 0;
    let vueltas2Plus = 0;
    let withVueltas = 0;
    let totalHours = 0;
    let dueToday = 0;
    let enRefrescos = 0;
    let listosCanto = 0;
    
    const baseTopics = initialTopics.filter((t) => t.subjectId === selectedSubjectId);
    const customTopics = Object.entries(userProgress)
      .filter(([id, data]: [string, any]) => data.isCustom && data.subjectId === selectedSubjectId && !data.isDeleted)
      .map(([id, data]: [string, any], index: number) => ({ id: id || data.topicId || `custom_${selectedSubjectId}_${data.number ?? index}` } as Topic));
      
    const seenKeys = new Set<string>();
    const allSubjectTopics: Topic[] = [];

    for (const t of [...baseTopics, ...customTopics]) {
      const topicKey = t.id || `${selectedSubjectId}-tema-${(t as any).number ?? 'custom'}`;
      if (!seenKeys.has(topicKey)) {
        seenKeys.add(topicKey);
        const prog = userProgress[topicKey] || userProgress[t.id];
        if (!prog?.isDeleted) {
          allSubjectTopics.push({ ...t, id: topicKey });
        }
      }
    }
    
    allSubjectTopics.forEach(t => {
      const prog = userProgress[t.id];
      const hasStarted = !!(
        prog &&
        (prog.firstStudyDate ||
          prog.studyTimeHours > 0 ||
          prog.vueltas > 0 ||
          prog.lastReviewDate)
      );
      const vueltas = prog?.vueltas || 0;
      
      if (prog?.studyTimeHours) {
        totalHours += prog.studyTimeHours;
      }

      if (vueltas >= 2) {
        vueltas2Plus++;
        withVueltas++;
      } else if (vueltas === 1) {
        vuelta1++;
        withVueltas++;
      } else if (hasStarted) {
        studying++;
      } else {
        pending++;
      }

      const cycle = calculateTopicCycle(t.id, prog, recentSessions);
      if (cycle.phase === "en_refrescos") enRefrescos++;
      if (cycle.phase === "listo_para_cantar") listosCanto++;

      if (isTopicDueToday(t.id, prog)) {
        dueToday++;
      }
    });
    
    const total = allSubjectTopics.length;
    const studiedCount = withVueltas + studying;
    const percentage = total > 0 ? Math.round((studiedCount / total) * 100) : 0;
    const vueltasPercentage = total > 0 ? Math.round((withVueltas / total) * 100) : 0;
    const vueltas2PlusPercentage = total > 0 ? Math.round((vueltas2Plus / total) * 100) : 0;
    const vuelta1Percentage = total > 0 ? Math.round((vuelta1 / total) * 100) : 0;
    const studyingPercentage = total > 0 ? Math.round((studying / total) * 100) : 0;

    return {
      total,
      studiedCount,
      withVueltas,
      vuelta1,
      vueltas2Plus,
      studying,
      pending,
      totalHours: Math.round(totalHours * 10) / 10,
      dueToday,
      enRefrescos,
      listosCanto,
      percentage,
      vueltasPercentage,
      vueltas2PlusPercentage,
      vuelta1Percentage,
      studyingPercentage
    };
  }, [selectedSubjectId, userProgress, recentSessions]);

  // High-performance O(1) telemetry index for all visible topics in this subject
  const telemetryIndex = useMemo(() => {
    return buildSubjectTelemetryIndex(subjectTopics, userProgress, recentSessions);
  }, [subjectTopics, userProgress, recentSessions]);

  // Quick 1-click review action (+1 Vuelta) directly from Card or Row
  const handleQuickReview = async (topic: Topic, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;
    const topicId = topic.id;
    const prog = userProgress[topicId];
    const telemetry = telemetryIndex.get(topicId);
    const estimatedMins = telemetry?.reviewEstimate?.predictedMinutes || 45;

    try {
      playSound.click();
      const currentVueltas = prog?.vueltas || 0;
      const newVueltas = currentVueltas + 1;
      await addStudySession({
        topicId,
        date: getLocalDateString(),
        type: "repaso",
        durationMinutes: estimatedMins,
        difficulty: prog?.difficulty || topic.difficulty || 4,
        completesVuelta: true,
        notes: `Repaso rápido oficial (+1 Vuelta). Estimado: ${estimatedMins} min.`,
      });
      playSound.success();
      toast.success(`🎉 ¡Vuelta ${newVueltas} consolidada!`, {
        description: `${topic.title} · Próximo repaso programado en 30 días.`,
      });
    } catch (err: any) {
      toast.error("Error al registrar vuelta: " + (err?.message || err));
    }
  };

  // Apple-grade keyboard navigation in Temario (ArrowLeft/ArrowRight to switch blocks, / to search)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        if (e.key === "Escape") {
          (target as HTMLInputElement).blur();
          setSearchQuery("");
        }
        return;
      }

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        playSound.click();
        const currentIdx = activeSubjects.findIndex(s => s.id === selectedSubjectId);
        if (currentIdx > 0) {
          setSelectedSubjectId(activeSubjects[currentIdx - 1].id);
        } else if (activeSubjects.length > 0) {
          setSelectedSubjectId(activeSubjects[activeSubjects.length - 1].id);
        }
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        playSound.click();
        const currentIdx = activeSubjects.findIndex(s => s.id === selectedSubjectId);
        if (currentIdx < activeSubjects.length - 1) {
          setSelectedSubjectId(activeSubjects[currentIdx + 1].id);
        } else if (activeSubjects.length > 0) {
          setSelectedSubjectId(activeSubjects[0].id);
        }
      } else if (e.key === "/" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        const searchInput = document.getElementById("temario-search-input") as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeSubjects, selectedSubjectId]);

  return (
    <div className="flex flex-col h-full bg-[#F5F5F7] relative pb-20 md:pb-0 overflow-hidden">
      {/* APPLE GLASS HEADER */}
      <div className="bg-white/80 backdrop-blur-2xl border-b border-slate-200/60 px-4 py-4 md:px-8 md:py-6 sticky top-0 z-20 shrink-0 shadow-[0_4px_24px_rgba(0,0,0,0.02)]">
        
        {/* Top title & View switch */}
        <div className="flex justify-between items-start md:items-center gap-3 mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 md:w-9 md:h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-md shadow-slate-900/10">
                <BookOpen size={18} strokeWidth={2.2} />
              </div>
              <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight font-serif truncate">
                Temario Oficial
              </h1>
              <span className="hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200/60">
                {selectedSubject?.name || "Bloque"}
              </span>
            </div>
            <p className="text-slate-500 text-xs md:text-sm font-medium mt-1 ml-0.5 hidden sm:block">
              Control de vueltas, ritmo de estudio y algoritmo de repetición espaciada (SRS)
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Apple-styled View Mode Toggle */}
            <div className="flex bg-slate-200/60 p-1 rounded-xl border border-slate-300/40">
              <button
                onClick={() => setViewMode("table")}
                className={cn(
                  "px-3 py-1.5 rounded-lg transition-all duration-200 flex items-center gap-1.5 font-bold text-xs",
                  viewMode === "table"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                )}
                title="Vista Lista"
              >
                <List size={14} strokeWidth={2.5} />
                <span className="hidden sm:inline">Lista</span>
              </button>
              <button
                onClick={() => setViewMode("grid")}
                className={cn(
                  "px-3 py-1.5 rounded-lg transition-all duration-200 flex items-center gap-1.5 font-bold text-xs",
                  viewMode === "grid"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                )}
                title="Vista Cuadrícula"
              >
                <LayoutGrid size={14} strokeWidth={2.5} />
                <span className="hidden sm:inline">Tarjetas</span>
              </button>
            </div>
          </div>
        </div>

        {/* APPLE COMMAND CENTER: BLOCK METRICS & HEALTH STRIP */}
        <div className="bg-slate-50/70 rounded-2xl p-3 md:p-4 border border-slate-200/60 mb-4">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 md:gap-4">
            
            {/* Progress Gauge */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between text-xs font-bold mb-1.5">
                <span className="text-slate-600 flex items-center gap-1.5 font-semibold">
                  <TrendingUp size={14} className="text-indigo-600" />
                  Progreso del Bloque
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400 font-medium">
                    {subjectStats.studiedCount} de {subjectStats.total} temas iniciados
                  </span>
                  <span className="text-sm font-black text-indigo-600 tracking-tight">
                    {subjectStats.percentage}%
                  </span>
                </div>
              </div>

              {/* Multi-layered Apple Progress Bar */}
              <div className="h-2.5 w-full bg-slate-200/70 rounded-full overflow-hidden flex shadow-inner">
                {/* 2+ Vueltas completadas (dark indigo) */}
                <div 
                  className="bg-indigo-700 h-full transition-all duration-700 ease-out relative"
                  style={{ width: `${subjectStats.vueltas2PlusPercentage}%` }}
                  title={`${subjectStats.vueltas2Plus} temas con 2 o más vueltas consolidadas`}
                />
                {/* 1ª Vuelta completada (vibrant indigo) */}
                <div 
                  className="bg-indigo-500 h-full transition-all duration-700 ease-out relative"
                  style={{ width: `${subjectStats.vuelta1Percentage}%` }}
                  title={`${subjectStats.vuelta1} temas con 1ª vuelta completa`}
                />
                {/* En proceso / refrescos (light indigo) */}
                <div 
                  className="bg-indigo-300 h-full transition-all duration-700 ease-out"
                  style={{ width: `${subjectStats.studyingPercentage}%` }}
                  title={`${subjectStats.studying} temas en estudio inicial o refrescos`}
                />
              </div>

              {/* Progress Bar Micro-Legend */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500 font-medium mt-1.5">
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-700"></span>
                  <span className="font-bold text-slate-700">2ª+ V</span>: {subjectStats.vueltas2Plus}
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                  <span className="font-bold text-slate-700">1ª V</span>: {subjectStats.vuelta1}
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-300"></span>
                  <span className="font-bold text-slate-700">En curso</span>: {subjectStats.studying}
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                  <span className="text-slate-400">Pend</span>: {subjectStats.pending}
                </span>
              </div>
            </div>

            {/* Micro-capsules */}
            <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar py-0.5">
              <div className="flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-xl border border-slate-200/70 shadow-sm shrink-0">
                <BookOpen size={13} className="text-slate-400" />
                <span className="text-xs font-black text-slate-800">{subjectStats.total}</span>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Totales</span>
              </div>

              <div className="flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-xl border border-slate-200/70 shadow-sm shrink-0">
                <BookmarkCheck size={13} className="text-emerald-500" />
                <span className="text-xs font-black text-emerald-600">{subjectStats.withVueltas}</span>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Vueltas</span>
              </div>

              <div className="flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-xl border border-slate-200/70 shadow-sm shrink-0">
                <Clock size={13} className="text-blue-500" />
                <span className="text-xs font-black text-blue-600">{subjectStats.totalHours}h</span>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Inversión</span>
              </div>

              {/* SRS Repasos Hoy Interactive Alert */}
              {subjectStats.dueToday > 0 ? (
                <button
                  onClick={() => setStatusFilter(statusFilter === "due_today" ? "all" : "due_today")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-xl border shadow-sm transition-all shrink-0 active:scale-95 cursor-pointer font-bold text-xs",
                    statusFilter === "due_today"
                      ? "bg-rose-600 text-white border-rose-600 shadow-rose-600/20"
                      : "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100"
                  )}
                  title="Haz clic para ver solo los repasos que tocan hoy"
                >
                  <Flame size={14} className={statusFilter === "due_today" ? "text-white" : "text-rose-600 animate-pulse"} />
                  <span className="font-black">{subjectStats.dueToday}</span>
                  <span className="text-[10px] uppercase tracking-wider">Repasos hoy</span>
                </button>
              ) : (
                <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200/60 px-2.5 py-1.5 rounded-xl text-xs font-bold shrink-0">
                  <CheckCircle2 size={13} className="text-emerald-500" />
                  <span className="text-[11px]">Repasos al día</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* APPLE SEGMENTED SUBJECT TABS WITH SPRING SLIDER */}
        <div className="relative -mx-4 px-4 md:-mx-8 md:px-8 mb-3">
          <div className="flex overflow-x-auto pb-1 gap-2 snap-x no-scrollbar container-snap">
            {activeSubjects.map((subject, sIdx) => {
              const subjectKey = subject.id || `subject-${sIdx}`;
              const isSelected = selectedSubjectId === subject.id;
              const count = initialTopics.filter((t) => t.subjectId === subject.id).length;

              return (
                <button
                  key={subjectKey}
                  onClick={() => {
                    playSound.click();
                    setSelectedSubjectId(subject.id);
                  }}
                  className={cn(
                    "whitespace-nowrap px-4 py-2 rounded-xl text-xs font-bold transition-all snap-start flex items-center gap-2 active:scale-95 shrink-0 border relative",
                    isSelected
                      ? "text-white shadow-sm border-slate-900"
                      : "bg-white/90 text-slate-600 border-slate-200/80 hover:bg-white hover:text-slate-900 hover:border-slate-300"
                  )}
                >
                  {isSelected && (
                    <motion.div
                      layoutId="activeSubjectSlider"
                      className="absolute inset-0 bg-slate-900 rounded-xl -z-0"
                      transition={{ type: "spring", stiffness: 450, damping: 35 }}
                    />
                  )}
                  <span className="relative z-10">{subject.name}</span>
                  <span
                    className={cn(
                      "relative z-10 text-[10px] px-1.5 py-0.5 rounded-md font-black leading-none",
                      isSelected
                        ? "bg-white/20 text-white"
                        : "bg-slate-100 text-slate-500"
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* SEARCH & FILTERS BAR */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 md:gap-3">
          {/* Apple Spotlight Search */}
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400" />
            </div>
            <input
              id="temario-search-input"
              type="text"
              className="block w-full pl-9 pr-12 py-2 rounded-xl border border-slate-200/80 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 text-xs md:text-sm font-medium text-slate-800 transition-all shadow-sm"
              placeholder="Buscar por título, número o palabras clave (pulsa /)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {!searchQuery && (
              <span className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-[10px] font-mono font-bold text-slate-300 hidden sm:flex">
                /
              </span>
            )}
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Quick Segmented Filter Pills (Reordered & Simplified) */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            {[
              { id: "all", label: "Todos", count: subjectStats.total },
              { 
                id: "due_today", 
                label: "Repasos hoy", 
                alert: subjectStats.dueToday > 0,
                count: subjectStats.dueToday > 0 ? subjectStats.dueToday : undefined,
                icon: Flame
              },
              { id: "en_refrescos", label: "En 3 Refrescos", count: subjectStats.enRefrescos },
              { id: "studied", label: "Estudiados", count: subjectStats.studiedCount },
              { id: "pending", label: "Pendientes", count: subjectStats.pending },
            ].map((filter: any) => {
              const isActive = statusFilter === filter.id;
              const IconComponent = filter.icon;
              return (
                <button
                  key={filter.id}
                  onClick={() => setStatusFilter(filter.id as any)}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap active:scale-95 shrink-0 border flex items-center gap-1.5",
                    filter.alert && !isActive
                      ? "bg-rose-50 text-rose-700 border-rose-200/80 hover:bg-rose-100"
                      : isActive
                        ? filter.alert 
                          ? "bg-rose-600 text-white border-rose-600 shadow-sm"
                          : "bg-slate-900 text-white border-slate-900 shadow-sm"
                        : "bg-white text-slate-600 border-slate-200/80 hover:bg-slate-50 hover:text-slate-900"
                  )}
                >
                  {IconComponent && (
                    <IconComponent size={13} className={isActive ? "text-white" : filter.alert ? "text-rose-600" : "text-slate-400"} />
                  )}
                  <span>{filter.label}</span>
                  {filter.count !== undefined && (
                    <span className={cn(
                      "px-1.5 py-0.2 rounded-full text-[9px] font-black",
                      isActive
                        ? "bg-white/20 text-white"
                        : filter.alert 
                          ? "bg-rose-200/80 text-rose-800"
                          : "bg-slate-100 text-slate-600"
                    )}>
                      {filter.count}
                    </span>
                  )}
                </button>
              );
            })}

            {/* Add Custom Topic Primary Action */}
            <button
              onClick={handleAddCustomTopic}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200/80 text-slate-700 border border-slate-200/80 hover:border-slate-300 text-xs font-bold rounded-xl transition-all shadow-sm active:scale-95 shrink-0 ml-1"
              title="Añadir un nuevo tema personalizado a este bloque"
            >
              <Plus size={13} strokeWidth={2.5} />
              <span>Tema</span>
            </button>
          </div>
        </div>
      </div>

      {/* TOPICS CONTAINER */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8 pb-28 relative z-10 w-full max-w-[100rem] mx-auto">
        {viewMode === "grid" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {subjectTopics.map((topic, index) => {
              const progress = userProgress[topic.id];
              const telemetry = telemetryIndex.get(topic.id);
              const uniqueKey = topic.id || `topic-${topic.subjectId || selectedSubjectId}-${topic.number}-${index}`;
              return (
                <TopicCard
                  key={uniqueKey}
                  topic={topic}
                  progress={progress}
                  telemetry={telemetry}
                  onClick={() => setSelectedTopicId(topic.id)}
                  onQuickReview={handleQuickReview}
                />
              );
            })}
          </div>
        ) : (
          /* APPLE MACOS TABLE VIEW */
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.03)] border border-slate-200/60 overflow-hidden relative"
          >
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                    <th className="px-5 py-3.5 whitespace-nowrap w-24">Tema</th>
                    <th className="px-5 py-3.5 min-w-[280px]">Título Oficial</th>
                    <th className="px-5 py-3.5 whitespace-nowrap text-center">Estado</th>
                    <th className="px-5 py-3.5 whitespace-nowrap text-center">Páginas & Dif.</th>
                    <th className="px-5 py-3.5 whitespace-nowrap text-center">Tiempo / Cante</th>
                    <th className="px-5 py-3.5 whitespace-nowrap text-center">Próximo Repaso</th>
                    <th className="px-5 py-3.5 whitespace-nowrap text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {subjectTopics.map((topic, index) => {
                    const progress = userProgress[topic.id];
                    const telemetry = telemetryIndex.get(topic.id);
                    const uniqueKey = topic.id || `topic-${topic.subjectId || selectedSubjectId}-${topic.number}-${index}`;
                    return (
                      <TopicTableRow
                        key={uniqueKey}
                        topic={topic}
                        progress={progress}
                        telemetry={telemetry}
                        onClick={() => setSelectedTopicId(topic.id)}
                        onQuickReview={handleQuickReview}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}

        {/* Empty State */}
        {subjectTopics.length === 0 && (
          <div className="text-center py-20 flex flex-col items-center justify-center bg-white/70 backdrop-blur-md rounded-3xl border border-slate-200/60 p-8 shadow-sm">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 mb-4 shadow-inner">
              <Search size={24} strokeWidth={2} />
            </div>
            <h3 className="text-lg font-black text-slate-900 mb-1 font-serif">
              No se encontraron temas
            </h3>
            <p className="text-slate-500 text-xs sm:text-sm font-medium max-w-sm mb-5">
              No hay ningún tema que coincida con los filtros activos.
            </p>
            <button
              onClick={() => {
                setSearchQuery("");
                setStatusFilter("all");
              }}
              className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all shadow-sm active:scale-95"
            >
              Restablecer Filtros
            </button>
          </div>
        )}
      </div>

      {/* TOPIC EDITOR SHEET MODAL */}
      {selectedTopicId && subjectTopics.find((t) => t.id === selectedTopicId) && (
        <TopicEditorDialog
          topic={subjectTopics.find((t) => t.id === selectedTopicId)!}
          onClose={() => setSelectedTopicId(null)}
        />
      )}
    </div>
  );
}

interface TopicCardProps {
  topic: Topic;
  progress?: TopicProgressData;
  telemetry?: FastTopicTelemetry;
  onClick: () => void;
  onQuickReview?: (topic: Topic, e: React.MouseEvent) => void;
}

// ULTRA-FAST ZERO-WASTE MEMOIZED APPLE CARD
const TopicCard = React.memo(function TopicCard({
  topic,
  progress,
  telemetry,
  onClick,
  onQuickReview,
}: TopicCardProps) {
  const hasStarted =
    !!progress?.firstStudyDate ||
    (progress?.studyTimeHours ?? 0) > 0 ||
    (progress?.vueltas ?? 0) > 0;

  const vueltas = progress?.vueltas || 0;
  const difficulty = progress?.difficulty || topic.difficulty || 0;
  const cycle = telemetry?.cycle || { phase: "no_iniciado", refrescoDayLabel: "" };
  const srs = telemetry?.srs || { isDueToday: false, isOverdue: false, nextDate: null, daysDiff: null };
  const lastCantoData = telemetry?.lastCanto || { hasCanto: false, formatted: "Sin cante", mins: 0, secs: 0, grade: null };
  const repasoEstimate = telemetry?.reviewEstimate || { formatted: "-", predictedMinutes: 0 };
  const ebbinghaus = telemetry?.ebbinghaus;

  return (
    <div
      onClick={onClick}
      className={cn(
        "group bg-white rounded-3xl p-5 md:p-6 cursor-pointer border border-slate-200/80 hover:border-slate-300 hover:shadow-[0_12px_32px_rgba(0,0,0,0.06)] hover:-translate-y-1 active:scale-[0.99] transition-all duration-300 flex flex-col justify-between h-full relative overflow-hidden shadow-xs",
        hasStarted ? "bg-white" : "bg-white/95"
      )}
    >
      {/* Top Accent Strip */}
      <div 
        className={cn(
          "absolute top-0 left-0 right-0 h-1 transition-colors",
          vueltas >= 2
            ? "bg-indigo-700"
            : vueltas === 1
              ? "bg-indigo-500" 
              : hasStarted 
                ? "bg-blue-500" 
                : "bg-slate-200/60"
        )} 
      />

      <div>
        {/* Header Badges & Retention Indicator */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="inline-flex items-center px-2.5 py-0.5 bg-slate-100 text-slate-700 text-[10px] uppercase tracking-wider font-black rounded-lg border border-slate-200/50">
              {topic.number === 999 ? "Extra" : `Tema ${topic.number}`}
            </span>

            {cycle.phase === "en_refrescos" ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-amber-50 text-amber-900 text-[10px] uppercase tracking-wider font-black rounded-full border border-amber-200/80 shadow-2xs">
                <Flame size={11} className="text-amber-500" />
                {cycle.refrescoDayLabel}
              </span>
            ) : cycle.phase === "listo_para_cantar" ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-fuchsia-50 text-fuchsia-800 text-[10px] uppercase tracking-wider font-black rounded-full border border-fuchsia-200/80 shadow-2xs">
                <Mic size={11} className="text-fuchsia-600" />
                Listo Canto
              </span>
            ) : vueltas > 0 ? (
              <span className={cn(
                "inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] uppercase tracking-wider font-black rounded-full border shadow-2xs",
                vueltas >= 2 
                  ? "bg-indigo-50 text-indigo-800 border-indigo-200/80" 
                  : "bg-emerald-50 text-emerald-700 border-emerald-200/60"
              )}>
                <CheckCircle2 size={11} className={vueltas >= 2 ? "text-indigo-600" : "text-emerald-600"} />
                Vuelta {vueltas}
              </span>
            ) : hasStarted ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-blue-50 text-blue-700 text-[10px] uppercase tracking-wider font-black rounded-full border border-blue-200/60 shadow-2xs">
                <Clock size={11} className="text-blue-600" />
                En Proceso
              </span>
            ) : (
              <span className="text-[10px] font-semibold text-slate-400">
                Pendiente
              </span>
            )}
          </div>

          {/* Ebbinghaus Retention & Threshold Indicator (Apple Health Style) */}
          {hasStarted && ebbinghaus && (
            <div
              className={cn(
                "flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border transition-colors shrink-0 font-mono tabular-nums",
                ebbinghaus.retention >= 80
                  ? "bg-emerald-50 text-emerald-800 border-emerald-200/90"
                  : ebbinghaus.retention >= 65
                    ? "bg-amber-50 text-amber-800 border-amber-200/90"
                    : "bg-rose-50 text-rose-800 border-rose-200/90"
              )}
              title={`Curva Ebbinghaus: ${ebbinghaus.retention}% (${ebbinghaus.statusTitle}) · Vida media: ${ebbinghaus.stabilityDays}d · ${ebbinghaus.daysUntil80 > 0 ? `Margen de seguridad: +${ebbinghaus.daysUntil80} días hasta cruzar el 80% (${ebbinghaus.critical80DateStr || ''})` : 'Umbral del 80% superado: conviene repasar'}`}
            >
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full shrink-0",
                  ebbinghaus.retention >= 80
                    ? "bg-emerald-500"
                    : ebbinghaus.retention >= 65
                      ? "bg-amber-500"
                      : "bg-rose-500 animate-pulse"
                )}
              />
              <span className="font-black">{ebbinghaus.retention}%</span>
              <span className="text-[9px] text-slate-400 font-semibold border-l border-slate-200/80 pl-1 ml-0.5">
                {ebbinghaus.daysUntil80 > 0 ? `+${ebbinghaus.daysUntil80}d` : "alerta"}
              </span>
            </div>
          )}
        </div>

        {/* Title */}
        <h3 
          className="text-base font-black font-serif tracking-tight text-slate-900 leading-snug line-clamp-2 group-hover:text-indigo-600 transition-colors"
          title={topic.fullTitle || topic.title}
        >
          {topic.title}
        </h3>

        {/* In-Refresco Step Progression Bar (if in refresco cycle) */}
        {cycle.phase === "en_refrescos" && (
          <div className="mt-3.5 flex items-center gap-2 bg-amber-50/60 px-3 py-1.5 rounded-xl border border-amber-200/60 text-[11px]">
            <Flame size={12} className="text-amber-600 shrink-0" />
            <span className="font-bold text-amber-950">Refrescos diarios:</span>
            <div className="flex items-center gap-1 ml-auto">
              {[1, 2, 3].map((step) => {
                const isPassed = (cycle.refrescosCount || 0) >= step;
                return (
                  <div
                    key={step}
                    className={cn(
                      "w-4 h-1.5 rounded-full transition-all",
                      isPassed ? "bg-amber-500" : "bg-amber-200"
                    )}
                    title={`Día ${step}`}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Vitals Grid (Apple Health Style) */}
        <div className="grid grid-cols-4 gap-1.5 mt-4">
          {/* Difficulty */}
          <div className="flex flex-col p-2 bg-slate-50/80 rounded-xl border border-slate-100/90 items-center justify-center text-center">
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
              Dif.
            </span>
            <span
              className={cn(
                "font-black text-xs font-mono tabular-nums",
                difficulty > 6
                  ? "text-rose-600"
                  : difficulty > 3
                    ? "text-amber-600"
                    : "text-emerald-600"
              )}
            >
              {difficulty > 0 ? `${difficulty}/10` : "-"}
            </span>
          </div>

          {/* 1. Repaso Estimado Mensual */}
          <div 
            className="flex flex-col p-2 bg-slate-50/80 rounded-xl border border-slate-100/90 items-center justify-center text-center" 
            title={hasStarted ? `Tiempo estimado de repaso: ${repasoEstimate.formatted}` : "Tema pendiente"}
          >
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
              Repaso
            </span>
            <span className="font-black text-slate-800 text-xs whitespace-nowrap font-mono tabular-nums">
              {hasStarted ? repasoEstimate.formatted : "-"}
            </span>
          </div>

          {/* 2. Último Cante Realizado */}
          <div 
            className="flex flex-col p-2 bg-slate-50/80 rounded-xl border border-slate-100/90 items-center justify-center text-center" 
            title={lastCantoData.hasCanto ? `Último cante: ${lastCantoData.formatted}${lastCantoData.grade !== null ? ` (Nota: ${lastCantoData.grade.toFixed(1)}/10)` : ''}` : "Sin cantes registrados"}
          >
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
              Cante
            </span>
            <span 
              className={cn(
                "text-xs whitespace-nowrap font-mono tabular-nums",
                lastCantoData.hasCanto ? "font-black text-slate-800" : "font-semibold text-slate-400 text-[11px]"
              )}
            >
              {lastCantoData.formatted}
            </span>
          </div>

          {/* Next SRS Review */}
          <div className="flex flex-col p-2 bg-slate-50/80 rounded-xl border border-slate-100/90 items-center justify-center text-center">
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
              Agenda
            </span>
            <span
              className={cn(
                "font-black text-[11px] whitespace-nowrap tracking-tight font-mono tabular-nums",
                srs.isOverdue
                  ? "text-rose-600"
                  : srs.isDueToday
                    ? "text-amber-600 font-black"
                    : srs.nextDate
                      ? "text-indigo-600"
                      : "text-slate-400"
              )}
            >
              {srs.nextDate
                ? srs.isOverdue
                  ? "Atrasado"
                  : srs.isDueToday
                    ? "HOY"
                    : `en ${srs.daysDiff} d`
                : "-"}
            </span>
          </div>
        </div>
      </div>

      {/* 3. Footer Vitals & Quick Actions */}
      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-semibold gap-2">
        {hasStarted ? (
          <div 
            className="flex items-center gap-1.5 text-indigo-700 bg-indigo-50/70 px-2 py-0.5 rounded-lg border border-indigo-200/50 font-black text-[11px] font-mono tabular-nums"
            title={`Inversión total acumulada en este tema: ${formatCleanStudyHours(progress?.studyTimeHours)}`}
          >
            <Clock size={12} className="text-indigo-600" />
            <span>
              {formatCleanStudyHours(progress?.studyTimeHours)}
            </span>
          </div>
        ) : (
          <div className="text-slate-400 text-xs">
            Sin iniciar
          </div>
        )}

        {/* Quick Action Buttons */}
        <div className="flex items-center gap-1.5">
          {onQuickReview && (
            <button
              type="button"
              onClick={(e) => onQuickReview(topic, e)}
              className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-100 hover:bg-indigo-600 text-slate-700 hover:text-white border border-slate-200/80 hover:border-indigo-600 transition-all flex items-center gap-1 active:scale-95 shadow-2xs"
              title="Registrar repaso rápido (+1 Vuelta oficial) en 1 solo clic"
            >
              <Zap size={11} className="text-amber-500 group-hover:text-amber-300" />
              <span>+1 Vuelta</span>
            </button>
          )}

          <button
            type="button"
            onClick={onClick}
            className="px-2.5 py-1 rounded-lg text-[10px] font-bold text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200/60 transition-colors flex items-center gap-0.5 active:scale-95"
            title="Abrir ficha completa del tema"
          >
            <span>Ficha</span>
            <ChevronRight size={11} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
  );
});

interface TopicTableRowProps {
  topic: Topic;
  progress?: TopicProgressData;
  telemetry?: FastTopicTelemetry;
  onClick: () => void;
  onQuickReview?: (topic: Topic, e: React.MouseEvent) => void;
}

// ULTRA-FAST ZERO-WASTE MEMOIZED TABLE ROW
const TopicTableRow = React.memo(function TopicTableRow({
  topic,
  progress,
  telemetry,
  onClick,
  onQuickReview,
}: TopicTableRowProps) {
  const vueltas = progress?.vueltas || 0;
  const hasStarted =
    !!progress?.firstStudyDate ||
    (progress?.studyTimeHours ?? 0) > 0 ||
    (progress?.vueltas ?? 0) > 0;

  const difficulty = progress?.difficulty || topic.difficulty || 0;
  const pages = progress?.pages || topic.pages || 0;
  const cycle = telemetry?.cycle || { phase: "no_iniciado", refrescoDayLabel: "" };
  const srs = telemetry?.srs || { isDueToday: false, isOverdue: false, nextDate: null, daysDiff: null };
  const lastCantoData = telemetry?.lastCanto || { hasCanto: false, formatted: "Sin cante", mins: 0, secs: 0, grade: null };
  const ebbinghaus = telemetry?.ebbinghaus;

  return (
    <tr
      onClick={onClick}
      className="hover:bg-slate-50/90 transition-colors group cursor-pointer relative"
    >
      {/* Number */}
      <td className="px-5 py-3.5 align-middle whitespace-nowrap">
        <span
          className={cn(
            "font-black text-xs px-2.5 py-1 rounded-lg tracking-wider border inline-block font-mono tabular-nums",
            vueltas >= 2
              ? "text-indigo-800 bg-indigo-100/80 border-indigo-300/80"
              : vueltas === 1
                ? "text-indigo-700 bg-indigo-50/80 border-indigo-200/60"
                : hasStarted
                  ? "text-blue-700 bg-blue-50/80 border-blue-200/60"
                  : "text-slate-500 bg-slate-100/80 border-slate-200/50"
          )}
        >
          {topic.number === 999 ? "EXT" : `T.${topic.number}`}
        </span>
      </td>

      {/* Title */}
      <td className="px-5 py-3.5 align-middle pr-4">
        <div
          title={topic.fullTitle || topic.title}
          className={cn(
            "line-clamp-2 leading-snug text-xs sm:text-sm group-hover:text-indigo-600 transition-colors",
            hasStarted ? "font-bold text-slate-900" : "font-medium text-slate-600"
          )}
        >
          {topic.title}
        </div>
      </td>

      {/* Status & Retention */}
      <td className="px-5 py-3.5 align-middle text-center whitespace-nowrap">
        <div className="flex flex-col items-center gap-1">
          {cycle.phase === "en_refrescos" ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-black text-amber-900 bg-amber-50 border border-amber-200/80 px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-2xs">
              <Flame size={10} className="text-amber-500" />
              {cycle.refrescoDayLabel}
            </span>
          ) : cycle.phase === "listo_para_cantar" ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-black text-fuchsia-800 bg-fuchsia-50 border border-fuchsia-200/80 px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-2xs">
              <Mic size={10} className="text-fuchsia-600" />
              Listo Canto
            </span>
          ) : vueltas > 0 ? (
            <span className={cn(
              "inline-flex items-center gap-1 text-[10px] font-black border px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-2xs",
              vueltas >= 2
                ? "text-indigo-800 bg-indigo-50 border-indigo-200/80"
                : "text-emerald-700 bg-emerald-50 border-emerald-200/60"
            )}>
              <CheckCircle2 size={10} className={vueltas >= 2 ? "text-indigo-600" : "text-emerald-500"} />
              {vueltas} {vueltas === 1 ? "Vuelta" : "Vueltas"}
            </span>
          ) : hasStarted ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-black text-blue-700 bg-blue-50 border border-blue-200/60 px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-2xs">
              <Clock size={10} className="text-blue-500" />
              En Proceso
            </span>
          ) : (
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Pendiente
            </span>
          )}

          {hasStarted && ebbinghaus && (
            <div
              className={cn(
                "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-mono tabular-nums font-bold border transition-colors",
                ebbinghaus.retention >= 80
                  ? "bg-emerald-50 text-emerald-800 border-emerald-200/80"
                  : ebbinghaus.retention >= 65
                    ? "bg-amber-50 text-amber-800 border-amber-200/80"
                    : "bg-rose-50 text-rose-800 border-rose-200/80"
              )}
              title={`Ebbinghaus: ${ebbinghaus.retention}% (${ebbinghaus.statusTitle}) · ${ebbinghaus.daysUntil80 > 0 ? `+${ebbinghaus.daysUntil80}d hasta el 80%` : 'Bajo el 80%'}`}
            >
              <span
                className={cn(
                  "w-1 h-1 rounded-full",
                  ebbinghaus.retention >= 80
                    ? "bg-emerald-500"
                    : ebbinghaus.retention >= 65
                      ? "bg-amber-500"
                      : "bg-rose-500"
                )}
              />
              <span>{ebbinghaus.retention}%</span>
              <span className="text-[8px] text-slate-400 font-normal">
                ({ebbinghaus.daysUntil80 > 0 ? `+${ebbinghaus.daysUntil80}d` : 'urg'})
              </span>
            </div>
          )}
        </div>
      </td>

      {/* Pages & Difficulty */}
      <td className="px-5 py-3.5 align-middle text-center whitespace-nowrap text-xs">
        <span className="font-bold text-slate-700 font-mono tabular-nums">{pages} págs</span>
        <span className="text-slate-300 mx-1.5">·</span>
        <span
          className={cn(
            "font-black font-mono tabular-nums",
            difficulty > 6
              ? "text-rose-600"
              : difficulty > 3
                ? "text-amber-600"
                : "text-emerald-600"
          )}
        >
          {difficulty > 0 ? `D.${difficulty}` : "-"}
        </span>
      </td>

      {/* Study Time / Cante */}
      <td className="px-5 py-3.5 align-middle text-center whitespace-nowrap text-xs">
        <div className="font-black text-slate-800 font-mono tabular-nums">
          {formatCleanStudyHours(progress?.studyTimeHours)}
        </div>
        <div className="text-[10px] text-slate-400 font-semibold mt-0.5 font-mono tabular-nums">
          {lastCantoData.hasCanto ? `Cante: ${lastCantoData.formatted}` : "Sin cante"}
        </div>
      </td>

      {/* Next SRS Review */}
      <td className="px-5 py-3.5 align-middle text-center whitespace-nowrap">
        {srs.nextDate ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border shadow-2xs font-mono tabular-nums",
              srs.isOverdue
                ? "bg-rose-50 text-rose-700 border-rose-200/80"
                : srs.isDueToday
                  ? "bg-amber-50 text-amber-700 border-amber-200/80 animate-pulse"
                  : "bg-indigo-50 text-indigo-700 border-indigo-200/60"
            )}
          >
            {srs.isOverdue ? (
              <>
                <AlertTriangle size={10} className="text-rose-600" />
                Atrasado
              </>
            ) : srs.isDueToday ? (
              <>
                <Flame size={10} className="text-amber-600" />
                HOY
              </>
            ) : (
              <>
                <Calendar size={10} className="text-indigo-500" />
                {srs.daysDiff !== null ? `en ${srs.daysDiff} d` : safeParseDate(srs.nextDate).toLocaleDateString("es-ES", { day: "2-digit", month: "short" })}
              </>
            )}
          </span>
        ) : (
          <span className="text-slate-300 text-xs">-</span>
        )}
      </td>

      {/* Actions */}
      <td className="px-5 py-3.5 align-middle text-right whitespace-nowrap">
        <div className="flex items-center justify-end gap-1.5">
          {onQuickReview && (
            <button
              onClick={(e) => onQuickReview(topic, e)}
              className="text-slate-700 hover:text-white bg-slate-100 hover:bg-indigo-600 border border-slate-200/80 hover:border-indigo-600 text-xs font-bold px-2.5 py-1.5 rounded-lg transition-all active:scale-95 inline-flex items-center gap-1 shadow-2xs"
              title="Registrar repaso rápido (+1 Vuelta oficial)"
            >
              <Zap size={11} className="text-amber-500" />
              <span>+1 Vuelta</span>
            </button>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              playSound.click();
              onClick();
            }}
            className="text-slate-500 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 text-xs font-bold px-3 py-1.5 rounded-lg transition-all active:scale-95 inline-flex items-center gap-1"
          >
            <span>Ficha</span>
            <ChevronRight size={13} strokeWidth={2.5} />
          </button>
        </div>
      </td>
    </tr>
  );
});
