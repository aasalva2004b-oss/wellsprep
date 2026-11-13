import React, { useState, useMemo, useEffect, useRef } from "react";
import { 
  Calendar, Clock, CheckCircle2, AlertTriangle, 
  XCircle, Plus, Trash2, BookOpen, Star, ChevronRight, ChevronDown, ChevronUp, X, Search,
  Award, Sparkles, Save, ArrowUpDown, Brain, Timer, Target, Flame, Info,
  TrendingDown, History, Zap
} from "lucide-react";
import { useFirebase } from "../lib/FirebaseProvider";
import { initialSubjects } from "../data/initialData";
import { Topic } from "../types";
import { calculateTopicCycle } from "../lib/oposicionCycle";
import { calculateCanonicalRetention } from "../lib/ebbinghaus";
import { getUpcomingCanteAssignments, type CantePlannerState } from "../lib/canteCommitments";
import type { PlannerTask } from "../lib/plannerEngine";
import { getLocalDateString, safeParseDate, cn, formatTime, formatMinutesToHours } from "../lib/utils";
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
import { toast } from "sonner";
import { doc, onSnapshot, runTransaction, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { playSound } from "../lib/sound";
import { DS } from "../lib/designSystem";
import { PreparadorTopicCard } from "./preparador/PreparadorTopicCard";
import { PreparadorQuickFeedbackModal } from "./preparador/PreparadorQuickFeedbackModal";
import { WeeklyPlannerStrip, ActivePlannerView } from "./preparador/WeeklyPlannerStrip";
import { PreparadorEbbinghausQueue } from "./preparador/PreparadorEbbinghausQueue";
import { CanteGoalCockpit } from "./preparador/CanteGoalCockpit";
import { WeeklyPlannerView } from "./planner/WeeklyPlannerView";
import { StudySessionDialog, StudySessionTarget } from "./StudySessionDialog";
import type { PredictionSnapshot } from "../lib/observedSession";
import { 
  buildOrRebalanceWeeklyCantePlan, 
  getNextCanteTarget
} from "../lib/weeklyCanteEngine";

type SortOption = "menor_nota" | "mayor_nota" | "orden_numero";

interface PreparadorSchedule {
  lunes: string[];   // Topic IDs
  jueves: string[];  // Topic IDs
}

const DEFAULT_SCHEDULE: PreparadorSchedule = {
  lunes: [],
  jueves: []
};

const normalizeSchedule = (data: unknown): PreparadorSchedule => {
  const record = data && typeof data === "object" ? data as Record<string, unknown> : {};
  const ids = (value: unknown): string[] => Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === "string" && id.length > 0))] : [];
  return { lunes: ids(record.lunes), jueves: ids(record.jueves) };
};


export interface PreparadorViewProps {
  initialView?: ActivePlannerView;
  onSubViewChange?: (view: ActivePlannerView) => void;
}

export function PreparadorView({
  initialView = "semana_completa",
  onSubViewChange
}: PreparadorViewProps = {}) {
  const { user, topics: allTopics, topicState, userProgress, recentSessions, addStudySession, updateTopicProgress, estimateDuration, estimateRetentionForTopic } = useFirebase();
  const activeOwner = useRef(user?.uid);
  activeOwner.current = user?.uid;
  const [observedSessionTarget, setObservedSessionTarget] = useState<StudySessionTarget | null>(null);

  // Active view in the planner cockpit (defaults to semana_completa for 7-day master view)
  const [activeView, setActiveView] = useState<ActivePlannerView>(() => {
    return initialView === "dia_estudio" ? "semana_completa" : initialView || "semana_completa";
  });

  useEffect(() => {
    if (initialView) {
      setActiveView(initialView === "dia_estudio" ? "semana_completa" : initialView);
    }
  }, [initialView]);

  const handleSelectView = (view: ActivePlannerView, selectedDate?: string) => {
    const nextView = view === "dia_estudio" ? "semana_completa" : view;
    setActiveView(nextView);
    if (view === "lunes" || view === "jueves") setSelectedCanteReference(selectedDate || null);
    if (onSubViewChange) onSubViewChange(nextView);
    if (selectedDate) setSelectedDayDate(selectedDate);
  };

  const [selectedDayDate, setSelectedDayDate] = useState<string>(() => {
    return getLocalDateString();
  });

  // Schedule status message (e.g., "Activo hasta las 22:00h")
  const scheduleStatus = useMemo(() => {
    return getPreparadorScheduleStatus();
  }, []);

  const [schedule, setSchedule] = useState<PreparadorSchedule>(DEFAULT_SCHEDULE);
  const [datedPlannerState, setDatedPlannerState] = useState<CantePlannerState | null>(null);
  const [datedPlannerLoaded, setDatedPlannerLoaded] = useState(false);
  const [selectedCanteReference, setSelectedCanteReference] = useState<string | null>(null);
  const [canteProposalRequested, setCanteProposalRequested] = useState(false);
  const [draftCanteGoal, setDraftCanteGoal] = useState<{ date: string; topicIds: string[] } | undefined>();

  // Sorting state for topic cards
  const [sortOption, setSortOption] = useState<SortOption>("menor_nota");
  const [showMobileKpiDetails, setShowMobileKpiDetails] = useState(false);

  // Dated planner tasks are commitments. The old weekly preferences only prefill proposals.
  useEffect(() => {
    let active = true;
    setSchedule(DEFAULT_SCHEDULE); setDatedPlannerState(null); setDatedPlannerLoaded(false);
    setSelectedCanteReference(null);
    if (!user) return;
    const stopRecurring = onSnapshot(doc(db, `users/${user.uid}/settings/preparador`), snapshot => {
      if (!active) return;
      setSchedule(normalizeSchedule(snapshot.exists() ? snapshot.data() : {}));
    }, error => console.error("No se pudieron cargar las preferencias de cante:", error));
    const stopDated = onSnapshot(doc(db, `users/${user.uid}/settings/weeklyPlannerState`), snapshot => {
      if (!active) return;
      const data = snapshot.exists() ? snapshot.data() : {};
      setDatedPlannerState({ tasks: Array.isArray(data.tasks) ? data.tasks : [], cantePlanning: data.cantePlanning });
      setDatedPlannerLoaded(true);
    }, error => { if (!active) return; setDatedPlannerLoaded(false); console.error("No se pudieron cargar los cantes fechados:", error); });
    return () => { active = false; stopRecurring(); stopDated(); };
  }, [user?.uid]);
  const datedAssignments = useMemo(() => getUpcomingCanteAssignments(datedPlannerState, schedule, selectedCanteReference || getLocalDateString()), [datedPlannerState, schedule, selectedCanteReference]);
  const openCantePlanning = (draft?: { date: string; topicIds: string[] }) => {
    setDraftCanteGoal(draft); setCanteProposalRequested(true); handleSelectView("semana_completa");
  };

  const handleUpdateTopicPages = async (topicId: string, newTotalPages: number) => {
    if (!Number.isFinite(newTotalPages) || newTotalPages <= 0) {
      toast.error("Introduce una extensión válida del tema.");
      return;
    }
    try {
      await updateTopicProgress(topicId, { pages: newTotalPages });
      toast.success(`Extensión del tema actualizada: ${newTotalPages} páginas.`);
    } catch (error) {
      toast.error("No se ha podido guardar la extensión del tema.");
    }
  };

  // State for Topic Picker modal

  // State for recording feedback / cante directly
  const [feedbackTopic, setFeedbackTopic] = useState<Topic | null>(null);
  const [feedbackPrediction, setFeedbackPrediction] = useState<PredictionSnapshot | undefined>();
  const [feedbackRetentionPrediction, setFeedbackRetentionPrediction] = useState<Record<string, any> | undefined>();
  const [prepNotes, setPrepNotes] = useState("");
  const [isSavingFeedback, setIsSavingFeedback] = useState(false);

  // Topic lookup map with full coverage
  const topicMap = useMemo(() => {
    const map = new Map<string, Topic>();
    for (const t of allTopics) {
      map.set(t.id, t);
    }
    return map;
  }, [allTopics]);

  // Target cante detection & plan computation
  const upcomingCanteInfo = useMemo(() => getNextCanteTarget(), []);
  const targetCanteDay: "lunes" | "jueves" = (activeView === "lunes" || activeView === "jueves")
    ? activeView
    : upcomingCanteInfo.targetDay;

  const currentCanteDayKey = activeView === "jueves" ? "jueves" : "lunes";
  const weeklyPlan = useMemo(() => {
    return buildOrRebalanceWeeklyCantePlan({
      assignedTopicIds: datedAssignments[targetCanteDay].topicIds,
      targetDate: datedAssignments[targetCanteDay].date,
      targetDay: targetCanteDay,
      allTopics,
      sessions: recentSessions,
      topicState,
      userProgress,
    });
  }, [datedAssignments, targetCanteDay, allTopics, topicState, recentSessions, userProgress]);

  const assignedTopics = useMemo(() => {
    const listToRender = (activeView === "lunes" || activeView === "jueves")
      ? datedAssignments[currentCanteDayKey].topicIds
      : [];
    return listToRender
      .map((id) => topicMap.get(id))
      .filter((t): t is Topic => Boolean(t));
  }, [activeView, currentCanteDayKey, datedAssignments, topicMap]);

  // Master Scientific Preparation Analysis for each assigned topic
  const topicsAnalysis = useMemo(() => {
    return assignedTopics.map((topic) => {
      const prog = userProgress[topic.id];
      const canonicalTopic = topicState.get(topic.id);
      const sessions = canonicalTopic?.sessions ?? [];
      const cycle = calculateTopicCycle(topic.id, prog, sessions, canonicalTopic);

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
      const reviewsCount = canonicalTopic?.reviewCount ?? 0;

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
        difficulty: topic.difficulty,
        canonicalTopic,
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
  }, [assignedTopics, userProgress, recentSessions, topicState]);

  // Sorted list of topics according to user preference
  const sortedTopicsAnalysis = useMemo(() => {
    const list = [...topicsAnalysis];
    if (sortOption === "menor_nota") {
      return list.sort((a, b) => Number(b.evaluation.scoreAvailable) - Number(a.evaluation.scoreAvailable) || a.evaluation.overallScore - b.evaluation.overallScore);
    }
    if (sortOption === "mayor_nota") {
      return list.sort((a, b) => Number(b.evaluation.scoreAvailable) - Number(a.evaluation.scoreAvailable) || b.evaluation.overallScore - a.evaluation.overallScore);
    }
    return list.sort((a, b) => a.topic.number - b.topic.number);
  }, [topicsAnalysis, sortOption]);

  // Overall KPIs for the active cante day
  const kpis = useMemo(() => {
    const total = topicsAnalysis.length;
    if (total === 0) {
      return {
        total: 0,
        avgScore: null,
        scoreEvidenceCount: 0,
        passingGrades: 0,
        failingGrades: 0,
        unknownGrades: 0,
        totalMinutes: null,
        durationEvidenceCount: 0,
        avgRetention: null,
        retentionEvidenceCount: 0,
      };
    }

    const knownScores = topicsAnalysis.filter(t => t.evaluation.scoreAvailable);
    const avgScore = knownScores.length ? knownScores.reduce((sum, t) => sum + t.evaluation.overallScore, 0) / knownScores.length : null;
    const passingGrades = knownScores.filter(t => t.evaluation.overallScore >= 5).length;
    const failingGrades = knownScores.filter(t => t.evaluation.overallScore < 5).length;
    const unknownGrades = total - knownScores.length;
    const recordedDurations = topicsAnalysis.filter(t => t.hasCanto);
    const totalMinutes = recordedDurations.length ? Math.round(recordedDurations.reduce((sum, t) => sum + t.lastCantoTotalSecs, 0) / 60) : null;

    const retentions = topicsAnalysis.filter(t => t.evaluation.retentionAvailable).map(t => t.evaluation.retentionPct);
    const avgRetention = retentions.length ? Math.round(retentions.reduce((a, b) => a + b, 0) / retentions.length) : null;

    return {
      total,
      avgScore,
      scoreEvidenceCount: knownScores.length,
      passingGrades,
      failingGrades,
      unknownGrades,
      durationEvidenceCount: recordedDurations.length,
      totalMinutes,
      avgRetention,
      retentionEvidenceCount: retentions.length,
    };
  }, [topicsAnalysis]);

  // Alerts follow the shared adaptive recommendation, never a fixed inactivity threshold.
  const ebbinghausAlertCount = useMemo(() => {
    return [...topicState.values()].filter(topic => {
      const memory = calculateCanonicalRetention(topic);
      return memory.hasData && (memory.actionUrgency === "alta" || memory.actionUrgency === "inmediata");
    }).length;
  }, [topicState]);

  // Adding topics starts a reviewable proposal. Removing a dated cante is an explicit user edit.
  const handleAddTopicToDay = (topicId: string, targetDay: "lunes" | "jueves") => {
    openCantePlanning({ date: datedAssignments[targetDay].date, topicIds: [topicId] });
  };
  const handleRemoveTopic = async (topicId: string) => {
    if (!user || !datedPlannerLoaded) return;
    const date = datedAssignments[activeView === "jueves" ? "jueves" : "lunes"].date;
    const ownerUid = user.uid;
    try {
      const ref = doc(db, `users/${ownerUid}/settings/weeklyPlannerState`);
      const removed = await runTransaction(db, async transaction => {
        const snapshot = await transaction.get(ref);
        if (activeOwner.current !== ownerUid) throw new Error("La cuenta activa ha cambiado.");
        const current = snapshot.exists() && Array.isArray(snapshot.data().tasks) ? snapshot.data().tasks as PlannerTask[] : [];
        const updated = current.filter(task => !(task.activityType === "cante" && task.topicId === topicId && task.date === date));
        transaction.set(ref, { tasks: JSON.parse(JSON.stringify(updated)), userId: ownerUid, updatedAt: serverTimestamp() }, { merge: true });
        return current.length - updated.length;
      });
      if (activeOwner.current !== ownerUid) return;
      toast.success(removed ? `Tema retirado del cante del ${date}. Las sesiones y las otras tareas se conservan.` : "Ese tema ya no estaba asignado a esta fecha.");
    } catch { toast.error("No se ha podido retirar el tema del cante."); }
  };

  // Opening the form captures the estimate before the observed duration is entered.
  const handleQuickReview = (topicId: string, _durationMinutes?: number) => {
    const canonical = topicState.get(topicId);
    if (!canonical) return;
    const predictionSnapshot = estimateDuration(topicId, "repaso");
    setObservedSessionTarget({ topicId, title: canonical.title, type: "repaso", difficulty: canonical.difficulty,
      predictionSnapshot, retentionPrediction: estimateRetentionForTopic(topicId), estimatedMinutes: predictionSnapshot.estimatedMinutes,
      metadata: { totalPages: canonical.hasExplicitPages ? canonical.pages : undefined, totalWords: canonical.numeroPalabras },
    });
  };

  // Save preparador feedback
  const handleSavePreparadorFeedback = async (data: {
    grade?: number;
    durationMinutes: number;
    durationSeconds: number;
    notes: string;
  }) => {
    if (!feedbackTopic) return;
    setIsSavingFeedback(true);
    try {
      await addStudySession(
        feedbackTopic.id,
        data.durationMinutes,
        feedbackTopic.difficulty || 5,
        "canto",
        getLocalDateString(),
        {
          prediction: feedbackPrediction,
          retentionPrediction: feedbackRetentionPrediction,
          totalPagesAtSession: feedbackPrediction?.inputs?.totalPages,
          wordsAtSession: feedbackPrediction?.inputs?.totalWords,
          cantoSeconds: data.durationSeconds,
          cantoGrade: data.grade,
          cantoType: "preparador",
          mistakes: data.notes,
          notes: data.notes.trim()
        }
      );
      playSound.success();
      toast.success(data.grade === undefined ? "Cante real guardado sin calificación." : `Evaluación del preparador guardada (Nota ${data.grade.toFixed(1)})`);
      setFeedbackTopic(null);
      setPrepNotes("");
    } catch (e: any) {
      console.error(e);
      toast.error("Error al registrar el feedback del preparador: " + (e?.message || e));
    } finally {
      setIsSavingFeedback(false);
    }
  };

  // Filter topics in the picker modal (including custom topics)
  // All historical sessions with preparador / cantos (with deduplication safeguard)
  const preparadorSessions = useMemo(() => {
    const raw = recentSessions.filter(isCantoSession);
    const unique: any[] = [];
    const seen = new Set<string>();
    for (const s of raw) {
      const key = s.id;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(s);
      }
    }
    return unique;
  }, [recentSessions]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50 overflow-hidden">
      <header className="shrink-0 border-b border-slate-200/70 bg-white px-4 py-3 sm:px-6 sm:py-4">
        <div className="mx-auto max-w-[100rem]">
          <h1 className={cn(DS.titlePage, "text-xl sm:text-2xl")}>Planificador y cantes</h1>
          <p className="mt-1 hidden text-sm text-slate-600 sm:block">Tu estudio de hoy y la preparación de tus próximos cantes.</p>
        </div>
      </header>

      {/* MAIN SCROLLABLE CONTENT */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain touch-pan-y -webkit-overflow-scrolling-touch p-3 sm:p-6 pb-6 max-w-[100rem] mx-auto w-full">
        {/* INTERACTIVE WEEKLY PLANNER RIBBON STRIP AT THE TOP */}
        <WeeklyPlannerStrip
          activeView={activeView}
          onSelectView={handleSelectView}
          lunesTopicsCount={datedAssignments.lunes.topicIds.length}
          juevesTopicsCount={datedAssignments.jueves.topicIds.length}
          ebbinghausAlertCount={ebbinghausAlertCount}
          totalCantosCount={preparadorSessions.length}
          selectedDateStr={selectedDayDate}
          recentSessions={recentSessions}
        />

        {/* VIEW 0: CUADRÍCULA SEMANAL 7 DÍAS INTELIGENTE */}
        {activeView === "semana_completa" && (
          <WeeklyPlannerView
            allTopics={allTopics}
            scheduleLunes={schedule.lunes || []}
            scheduleJueves={schedule.jueves || []}
            onOpenPreparadorSession={(day, date) => handleSelectView(day, date)}
            focusDate={selectedDayDate}
            canteProposalRequested={canteProposalRequested}
            draftCanteGoal={draftCanteGoal}
            onCanteProposalRequestHandled={() => setCanteProposalRequested(false)}
          />
        )}

        {/* VIEW 1: EBBINGHAUS QUEUE */}
        {activeView === "ebbinghaus" && (
          <PreparadorEbbinghausQueue
            userProgress={userProgress}
            recentSessions={recentSessions}
            onAssignToDay={handleAddTopicToDay}
            onQuickReview={handleQuickReview}
            assignedLunesIds={datedAssignments.lunes.topicIds}
            assignedJuevesIds={datedAssignments.jueves.topicIds}
          />
        )}

        {/* VIEW 3: HISTORIAL */}
        {activeView === "historial" && (
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
              <div className={cn(DS.card, "p-6 text-center sm:p-10")}>
                <Award size={36} className="text-slate-300 mx-auto mb-3" />
                <h3 className="text-base font-bold text-slate-800">No hay cantes registrados con el preparador todavía</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-4">
                  Cuando cantes un tema el Lunes o el Jueves, pulsa en &quot;Registrar Nota / Cante&quot; en la tarjeta del tema para registrar el feedback y notas.
                </p>
                <button
                  onClick={() => setActiveView(getDefaultPreparadorDay())}
                  className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-all"
                >
                  Ir a preparar la sesión activa ({getDefaultPreparadorDay()})
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {preparadorSessions.map((session, idx) => {
                  const topic = topicMap.get(session.topicId) 
                    || allTopics.find((t) => sessionMatchesTopic(session, t));
                  const dur = getCantoDuration(session);
                  const grade = session.cantoGrade ?? session.grade ?? null;

                  return (
                    <div 
                      key={session.id || idx}
                      className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 bg-slate-100 rounded-md text-slate-600 font-mono">
                            {session.date || "Fecha no registrada"}
                          </span>
                          {grade !== null && (
                            <span className={cn(
                              "text-xs font-black px-2.5 py-0.5 rounded-full border font-mono tabular-nums",
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
                          <span className="flex items-center gap-1 font-semibold text-slate-700 font-mono tabular-nums">
                            <Clock size={13} className="text-indigo-600" />
                            {dur.formatted}
                          </span>
                          <span>·</span>
                          <span className="text-[11px] text-slate-400 font-mono">
                            Meta: 12m 30s ({dur.totalSecs > OPTIMAL_CANTO_SECS ? `+${dur.totalSecs - OPTIMAL_CANTO_SECS}s` : `-${OPTIMAL_CANTO_SECS - dur.totalSecs}s`})
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
        )}

        {/* VIEW 4 & 5: LUNES O JUEVES SESIÓN OFICIAL */}
        {(activeView === "lunes" || activeView === "jueves") && (
          <div className="space-y-4">
            {/* Top Cante Goal Cockpit with dynamic page pacing & auto-rebalance */}
            <CanteGoalCockpit
              plan={weeklyPlan}
              coverageOnly
              onUpdateTopicPages={handleUpdateTopicPages}
              onForceRebalance={() => openCantePlanning()}
              onOpenTopicPicker={() => openCantePlanning()}
            />

            {/* ASSIGNED TOPICS HEADER & SORTING */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 pt-2">
              <div>
                <h2 className={cn(DS.titleSection, "flex flex-wrap items-center gap-2")}>
                  <span>Temas Asignados · {datedAssignments[activeView === "jueves" ? "jueves" : "lunes"].date}</span>
                  <span className="text-xs px-2 py-0.5 bg-slate-200/80 text-slate-700 rounded-lg font-sans font-bold">
                    {assignedTopics.length}
                  </span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5 hidden sm:block">
                  Consulta la última nota registrada, los tiempos observados, la estimación de recuerdo y las vueltas de cada tema.
                </p>
              </div>

              {/* Sorting Filter Selector */}
              {assignedTopics.length > 0 && (
                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <ArrowUpDown size={13} className="text-slate-400" />
                  <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1 text-sm font-semibold">
                    <button
                      onClick={() => setSortOption("menor_nota")}
                      className={cn(
                        "min-h-[44px] rounded-lg px-3 transition-colors",
                        sortOption === "menor_nota" ? "bg-white text-slate-900 font-bold shadow-xs" : "text-slate-600 hover:text-slate-900"
                      )}
                    >
                      Menor última nota
                    </button>
                    <button
                      onClick={() => setSortOption("mayor_nota")}
                      className={cn(
                        "min-h-[44px] rounded-lg px-3 transition-colors",
                        sortOption === "mayor_nota" ? "bg-white text-slate-900 font-bold shadow-xs" : "text-slate-600 hover:text-slate-900"
                      )}
                    >
                      Mayor última nota
                    </button>
                    <button
                      onClick={() => setSortOption("orden_numero")}
                      className={cn(
                        "min-h-[44px] rounded-lg px-3 transition-colors",
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
                  onClick={() => openCantePlanning()}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1.5 self-start sm:self-auto px-3 py-1.5 bg-indigo-50 rounded-xl border border-indigo-200/60"
                >
                  <Sparkles size={13} />
                  <span>Planificar mis cantes con fechas</span>
                </button>
              )}
            </div>

            {/* TOPIC CARDS GRID */}
            {assignedTopics.length === 0 ? (
              <div className={cn(DS.card, "p-6 text-center sm:p-10")}>
                <BookOpen size={36} className="text-slate-300 mx-auto mb-3" />
                <h3 className="text-base font-bold text-slate-800">
                  {datedPlannerLoaded ? `No hay temas confirmados para el ${datedAssignments[activeView === "jueves" ? "jueves" : "lunes"].date}` : "Cantes pendientes de cargar"}
                </h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-5">
                  Añade los temas que vas a cantar en tu próxima sesión para ver al instante sus notas y tiempos registrados y la estimación de recuerdo disponible.
                </p>
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={() => openCantePlanning()}
                    className="px-4 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
                  >
                    <Plus size={14} />
                    <span>Seleccionar Temas del Temario</span>
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
                    onQuickReview={handleQuickReview}
                    onOpenFeedback={(topic) => {
                      setFeedbackPrediction(estimateDuration(topic.id, "cante"));
                      setFeedbackRetentionPrediction(estimateRetentionForTopic(topic.id));
                      setFeedbackTopic(topic);
                    }}
                  />
                ))}
              </div>
            )}
            <details className={cn(DS.card, "p-4")}>
              <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-2 text-sm font-bold text-slate-700">
                Notas, retención y tiempos de los temas
                <ChevronDown size={16} aria-hidden="true" />
              </summary>
              <div className="space-y-3 pt-3">
            {/* Status explanation & Meta banner */}
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

            {/* BENCHMARK KPI CARDS */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
              {/* 1. Media de últimas notas registradas */}
              <div className="bg-white rounded-2xl p-3 sm:p-3.5 border border-slate-200/70 shadow-2xs flex items-center gap-2.5 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0 text-indigo-600">
                  <Award size={16} strokeWidth={2.2} />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 truncate">
                    Última nota media
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
                    Notas registradas
                  </div>
                  <div className="text-[11px] sm:text-xs font-bold text-slate-700 truncate">
                    <span className="text-emerald-700">{kpis.passingGrades} ≥5</span> · <span className="text-amber-700">{kpis.failingGrades} &lt;5</span> · {kpis.unknownGrades} sin nota
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
                  <div className="text-sm sm:text-lg font-black text-slate-900 font-mono tabular-nums">
                    {kpis.avgRetention !== null ? `≈ ${kpis.avgRetention}%` : "Sin estimación"}
                    <span className="text-[10px] sm:text-xs font-normal text-slate-500 ml-1">estimación</span>
                    <p className="text-[10px] font-normal text-slate-500">{kpis.retentionEvidenceCount}/{kpis.total} temas con estimación; los desconocidos se excluyen</p>
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
                    Últimos tiempos de cante
                  </div>
                  <div className="text-sm sm:text-lg font-black text-slate-900 font-mono tabular-nums">
                    {kpis.totalMinutes === null ? "—" : `${kpis.totalMinutes}m`}
                    <span className="text-[10px] sm:text-xs font-normal text-slate-500 ml-1">({kpis.durationEvidenceCount}/{kpis.total} temas)</span>
                  </div>
                </div>
              </div>
            </div>

              </div>
            </details>
          </div>
        )}
      </div>

      {/* RECORD PREPARADOR FEEDBACK MODAL */}
      <PreparadorQuickFeedbackModal
        topic={feedbackTopic}
        isOpen={Boolean(feedbackTopic)}
        onClose={() => setFeedbackTopic(null)}
        onSave={handleSavePreparadorFeedback}
        isSaving={isSavingFeedback}
      />
      {observedSessionTarget && <StudySessionDialog
        target={observedSessionTarget}
        onClose={() => setObservedSessionTarget(null)}
        onSave={async (session) => {
          await addStudySession(session.topicId, session.durationMinutes, session.difficulty, session.type, session.date, session);
        }}
      />}

    </div>
  );
}
