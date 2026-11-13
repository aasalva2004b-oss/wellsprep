import React, { useEffect, useMemo, useState } from "react";
import { Award, Clock, ArrowRight, Brain, Target, Calendar, CheckCircle2 } from "lucide-react";
import { useFirebase } from "../../lib/FirebaseProvider";
import type { Topic } from "../../types";
import { getUpcomingCanteAssignments, type CantePlannerState } from "../../lib/canteCommitments";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { getDefaultPreparadorDay, getPreparadorScheduleStatus, evaluateTopicPreparation, TopicPreparationEvaluation } from "../../lib/preparationScore";
import { getLatestCantoForTopic, sessionMatchesTopic } from "../../lib/cantoUtils";
import { playSound } from "../../lib/sound";
import { cn, safeParseDate, getLocalDateString } from "../../lib/utils";

interface DashboardPreparadorExecutiveCardProps {
  onNavigateToPreparador?: () => void;
}

export const DashboardPreparadorExecutiveCard: React.FC<DashboardPreparadorExecutiveCardProps> = ({
  onNavigateToPreparador,
}) => {
  const { user, topics, topicState, userProgress, recentSessions } = useFirebase();

  // Active cante day (Lunes or Jueves)
  const defaultDay = useMemo(() => getDefaultPreparadorDay(), []);
  const scheduleStatus = useMemo(() => getPreparadorScheduleStatus(), []);

  // Both views read actual dated commitments; recurring preferences only prefill a proposal.
  const [recurring, setRecurring] = useState<{ lunes: string[]; jueves: string[] }>({ lunes: [], jueves: [] });
  const [plannerState, setPlannerState] = useState<CantePlannerState | null>(null);
  const [scheduleLoaded, setScheduleLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    setRecurring({ lunes: [], jueves: [] }); setPlannerState(null); setScheduleLoaded(false);
    if (!user) return;
    const stopRecurring = onSnapshot(doc(db, `users/${user.uid}/settings/preparador`), snapshot => {
      if (!active) return;
      const data = snapshot.exists() ? snapshot.data() : {};
      setRecurring({ lunes: Array.isArray(data.lunes) ? data.lunes : [], jueves: Array.isArray(data.jueves) ? data.jueves : [] });
    });
    const stopDated = onSnapshot(doc(db, `users/${user.uid}/settings/weeklyPlannerState`), snapshot => {
      if (!active) return;
      const data = snapshot.exists() ? snapshot.data() : {};
      setPlannerState({ tasks: Array.isArray(data.tasks) ? data.tasks : [], cantePlanning: data.cantePlanning }); setScheduleLoaded(true);
    }, () => { if (active) setScheduleLoaded(false); });
    return () => { active = false; stopRecurring(); stopDated(); };
  }, [user?.uid]);
  const assignments = useMemo(() => getUpcomingCanteAssignments(plannerState, recurring, getLocalDateString()), [plannerState, recurring]);
  const canteDay = defaultDay === "historial" ? (assignments.lunes.date < assignments.jueves.date ? "lunes" : "jueves") : defaultDay;
  const assignment = assignments[canteDay];
  const assignedIds = assignment.topicIds;

  const topicMap = useMemo(() => new Map(topics.map(topic => [topic.id, topic])), [topics]);

  const assignedTopics = useMemo(() => {
    return assignedIds
      .map((id: string) => topicMap.get(id))
      .filter((t: any): t is Topic => Boolean(t));
  }, [assignedIds, topicMap]);

  // Compute readiness
  const evaluationList = useMemo(() => {
    return assignedTopics.map((topic: Topic) => {
      const prog = userProgress[topic.id];
      const canonical = topicState.get(topic.id);
      const sessions = canonical?.sessions || [];
      const cantoData = getLatestCantoForTopic(recentSessions || [], topic, prog);
      
      const lastSessionDate = canonical?.lastContactDate;
      const daysSinceTouch = lastSessionDate 
        ? Math.max(0, Math.floor((new Date().getTime() - safeParseDate(lastSessionDate).getTime()) / (1000 * 3600 * 24)))
        : null;
      const daysSinceCanto = cantoData.date
        ? Math.max(0, Math.floor((new Date().getTime() - safeParseDate(cantoData.date).getTime()) / (1000 * 3600 * 24)))
        : null;

      return evaluateTopicPreparation({
        canonicalTopic: topicState.get(topic.id),
        topicNumber: topic.number,
        topicTitle: topic.title,
        totalCantoSecs: cantoData.hasCanto ? cantoData.totalSecs : null,
        lastGrade: cantoData.grade,
        daysSinceCanto,
        daysSinceReview: daysSinceTouch,
        daysSinceTouch,
        vueltas: prog?.vueltas || 0,
        reviewsCount: canonical?.reviewCount || 0,
        difficulty: topic.difficulty || 5,
      });
    });
  }, [assignedTopics, topicState, userProgress, recentSessions]);

  const stats = useMemo(() => {
    if (evaluationList.length === 0) {
      return {
        total: 0,
        avgScore: null,
        scoreCount: 0,
        passing: 0,
        failing: 0,
        missing: 0,
        durationCount: 0,
        totalMinutes: null,
        avgRetention: null,
      };
    }

    const total = evaluationList.length;
    const knownScores = evaluationList.filter(ev => ev.scoreAvailable);
    const avgScore = knownScores.length ? Math.round(knownScores.reduce((sum, ev) => sum + ev.overallScore, 0) / knownScores.length * 10) / 10 : null;
    const passing = knownScores.filter(ev => ev.overallScore >= 5).length;
    const failing = knownScores.filter(ev => ev.overallScore < 5).length;
    const missing = total - knownScores.length;
    const durations = evaluationList.filter(ev => ev.hasCanto);
    const totalMinutes = durations.length ? Math.round(durations.reduce((sum, ev) => sum + ev.totalCantoSecs, 0) / 60) : null;
    const retList = evaluationList.filter(ev => ev.retentionAvailable).map(ev => ev.retentionPct);
    const avgRetention = retList.length ? Math.round(retList.reduce((sum, retention) => sum + retention, 0) / retList.length) : null;

    return {
      total,
      avgScore,
      scoreCount: knownScores.length,
      passing,
      failing,
      missing,
      durationCount: durations.length,
      totalMinutes,
      avgRetention,
    };
  }, [evaluationList]);

  const dayLabel = `${canteDay === "lunes" ? "Lunes" : "Jueves"} · ${assignment.date}`;

  return (
    <div className="bg-white/95 backdrop-blur-xl rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-xs flex flex-col justify-between relative overflow-hidden group hover:border-slate-300 transition-all">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-2xl bg-indigo-50 border border-indigo-200/60 flex items-center justify-center text-indigo-700 shadow-xs">
            <Award size={18} strokeWidth={2.5} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-black text-slate-900 tracking-tight font-serif">
                Próximo Cante de Preparador
              </h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-900 font-sans uppercase tracking-wider">
                {dayLabel}
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium truncate max-w-sm">
              {scheduleStatus.timeRemainingMessage}
            </p>
          </div>
        </div>

        {onNavigateToPreparador && (
          <button
            onClick={() => {
              playSound.click();
              onNavigateToPreparador();
            }}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-xs shrink-0 active:scale-95"
          >
            <span>Ver Panel Completo</span>
            <ArrowRight size={12} />
          </button>
        )}
      </div>

      {/* Main KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
        {/* 1. Última nota media */}
        <div className="p-3 bg-slate-50/90 rounded-2xl border border-slate-100">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block truncate">
            Última nota media
          </span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span
              className={cn(
                "text-xl sm:text-2xl font-black font-serif tabular-nums",
                stats.avgScore === null
                  ? "text-slate-400"
                  : stats.avgScore >= 8.5
                  ? "text-emerald-700"
                  : stats.avgScore >= 7.0
                  ? "text-indigo-700"
                  : stats.avgScore >= 5.0
                  ? "text-amber-700"
                  : "text-rose-600"
              )}
            >
              {stats.avgScore !== null ? stats.avgScore.toFixed(1) : "—"}
            </span>
            <span className="text-xs font-bold text-slate-400">/ 10</span>
          </div>
        </div>

        {/* 2. Notas registradas */}
        <div className="p-3 bg-slate-50/90 rounded-2xl border border-slate-100">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block truncate">
            Notas registradas
          </span>
          <div className="flex items-center gap-1.5 mt-1 text-xs font-black tabular-nums">
            <span className="text-emerald-700 font-bold bg-emerald-100/70 px-1.5 py-0.5 rounded-md">
              {stats.passing} ≥5
            </span>
            <span className="text-amber-700 font-bold bg-amber-100/70 px-1.5 py-0.5 rounded-md">
              {stats.failing} &lt;5
            </span>
            <span className="text-slate-500 font-medium">{stats.missing} sin nota</span>
          </div>
        </div>

        {/* 3. Retención Ebbinghaus */}
        <div className="p-3 bg-slate-50/90 rounded-2xl border border-slate-100">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block truncate">
            Ebbinghaus
          </span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-xl sm:text-2xl font-black text-slate-900 tabular-nums">
              {stats.avgRetention !== null ? `≈ ${stats.avgRetention}%` : "—"}
            </span>
            <span className="text-[10px] font-bold text-slate-400 ml-1">estimación</span>
          </div>
        </div>

        {/* 4. Duración Estimada */}
        <div className="p-3 bg-slate-50/90 rounded-2xl border border-slate-100">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block truncate">
            Últimos tiempos
          </span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-xl sm:text-2xl font-black text-slate-900 tabular-nums">
              {stats.totalMinutes === null ? "—" : `${stats.totalMinutes}m`}
            </span>
            <span className="text-[10px] font-bold text-slate-400 ml-1">({stats.durationCount}/{stats.total} temas)</span>
          </div>
        </div>
      </div>

      {/* Assigned Topics Mini Preview */}
      <div className="space-y-1.5 pt-1 border-t border-slate-100">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="font-bold text-slate-700">Temas Asignados ({dayLabel})</span>
          <span className="font-mono text-slate-400 text-[11px]">{assignedTopics.length} seleccionados</span>
        </div>

        {assignedTopics.length === 0 ? (
          <p className="text-xs text-slate-400 italic py-1">{scheduleLoaded ? `No hay temas asignados para el ${dayLabel}.` : "Asignación de temas pendiente de cargar."}</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {assignedTopics.slice(0, 8).map((t) => (
              <span
                key={t.id}
                className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 text-[11px] font-bold border border-slate-200/60 font-mono flex items-center gap-1"
              >
                <span>T.{t.number}</span>
                <span className="font-sans font-medium text-slate-500 max-w-[120px] truncate">
                  {t.title.replace(/^tema\s*\d+[\s:.-]*/i, "")}
                </span>
                {(userProgress[t.id]?.pages || t.pages) ? (
                  <span className="text-[9px] text-slate-400 font-normal">
                    ({userProgress[t.id]?.pages || t.pages}p)
                  </span>
                ) : null}
              </span>
            ))}
            {assignedTopics.length > 8 && (
              <span className="px-2 py-1 rounded-lg bg-slate-50 text-slate-500 text-[11px] font-bold font-mono">
                +{assignedTopics.length - 8} más
              </span>
            )}
          </div>
        )}
      </div>

      {/* Mobile Action Button */}
      {onNavigateToPreparador && (
        <button
          onClick={() => {
            playSound.click();
            onNavigateToPreparador();
          }}
          className="sm:hidden mt-3 w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 active:scale-95"
        >
          <span>Abrir Panel del Preparador</span>
          <ArrowRight size={13} />
        </button>
      )}
    </div>
  );
};
