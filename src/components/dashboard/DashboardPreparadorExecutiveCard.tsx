import React, { useMemo } from "react";
import { Award, Clock, ArrowRight, Brain, Target, Calendar, CheckCircle2 } from "lucide-react";
import { useFirebase } from "../../lib/FirebaseProvider";
import { initialTopics } from "../../data/initialData";
import { getDefaultPreparadorDay, getPreparadorScheduleStatus, evaluateTopicPreparation, TopicPreparationEvaluation } from "../../lib/preparationScore";
import { getLatestCantoForTopic, sessionMatchesTopic } from "../../lib/cantoUtils";
import { playSound } from "../../lib/sound";
import { cn, safeParseDate } from "../../lib/utils";

interface DashboardPreparadorExecutiveCardProps {
  onNavigateToPreparador?: () => void;
}

export const DashboardPreparadorExecutiveCard: React.FC<DashboardPreparadorExecutiveCardProps> = ({
  onNavigateToPreparador,
}) => {
  const { userProgress, recentSessions } = useFirebase();

  // Active cante day (Lunes or Jueves)
  const defaultDay = useMemo(() => getDefaultPreparadorDay(), []);
  const scheduleStatus = useMemo(() => getPreparadorScheduleStatus(), []);

  // Read schedule from local storage
  const schedule = useMemo(() => {
    try {
      const saved = localStorage.getItem("wellsprep_preparador_schedule_v2");
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      lunes: ["constitucional-1", "constitucional-2"],
      jueves: ["constitucional-3", "constitucional-4", "constitucional-5"],
    };
  }, []);

  const assignedIds = defaultDay === "historial" ? [] : (schedule[defaultDay] || []);

  const topicMap = useMemo(() => {
    const map = new Map<string, any>();
    initialTopics.forEach((t) => map.set(t.id, t));
    Object.entries(userProgress || {}).forEach(([id, data]: [string, any]) => {
      if (data.isCustom && !data.isDeleted) {
        map.set(id, {
          id,
          subjectId: data.subjectId || "custom",
          number: data.number || 999,
          title: data.customTitle || "Tema Personalizado",
          difficulty: data.difficulty || 5,
        });
      }
    });
    return map;
  }, [userProgress]);

  const assignedTopics = useMemo(() => {
    return assignedIds
      .map((id: string) => topicMap.get(id))
      .filter((t: any): t is typeof initialTopics[0] => Boolean(t));
  }, [assignedIds, topicMap]);

  // Compute readiness
  const evaluationList = useMemo(() => {
    return assignedTopics.map((topic: typeof initialTopics[0]) => {
      const prog = userProgress[topic.id];
      const sessions = (recentSessions || []).filter((s) => sessionMatchesTopic(s, topic));
      const cantoData = getLatestCantoForTopic(recentSessions || [], topic, prog);
      
      const lastSessionDate = sessions[0]?.date || prog?.lastReviewDate || prog?.firstStudyDate;
      const daysSinceTouch = lastSessionDate 
        ? Math.max(0, Math.floor((new Date().getTime() - safeParseDate(lastSessionDate).getTime()) / (1000 * 3600 * 24)))
        : null;
      const daysSinceCanto = cantoData.date
        ? Math.max(0, Math.floor((new Date().getTime() - safeParseDate(cantoData.date).getTime()) / (1000 * 3600 * 24)))
        : null;

      return evaluateTopicPreparation({
        topicNumber: topic.number,
        topicTitle: topic.title,
        totalCantoSecs: cantoData.hasCanto ? cantoData.totalSecs : null,
        lastGrade: cantoData.grade,
        daysSinceCanto,
        daysSinceReview: daysSinceTouch,
        daysSinceTouch,
        vueltas: prog?.vueltas || 0,
        reviewsCount: sessions.length,
        difficulty: topic.difficulty || 5,
      });
    });
  }, [assignedTopics, userProgress, recentSessions]);

  const stats = useMemo(() => {
    if (evaluationList.length === 0) {
      return {
        total: 0,
        avgScore: null,
        listos: 0,
        ajuste: 0,
        riesgo: 0,
        totalMinutes: 0,
        avgRetention: null,
      };
    }

    const total = evaluationList.length;
    const sumScore = evaluationList.reduce((acc, ev) => acc + ev.projectedScore, 0);
    const avgScore = Math.round((sumScore / total) * 10) / 10;
    const listos = evaluationList.filter((ev) => ev.isReadyForTribunal).length;
    const ajuste = evaluationList.filter((ev) => ev.overallScore >= 5.0 && !ev.isReadyForTribunal).length;
    const riesgo = evaluationList.filter((ev) => ev.overallScore < 5.0).length;
    const totalMinutes = Math.round(evaluationList.reduce((acc, ev) => acc + (ev.totalCantoSecs || 750), 0) / 60);

    const retList = evaluationList.map((ev) => ev.retentionPct).filter((r) => r !== null) as number[];
    const avgRetention = retList.length > 0 ? Math.round(retList.reduce((a, b) => a + b, 0) / retList.length) : null;

    return {
      total,
      avgScore,
      listos,
      ajuste,
      riesgo,
      totalMinutes,
      avgRetention,
    };
  }, [evaluationList]);

  const dayLabel = defaultDay === "lunes" ? "Lunes" : "Jueves";

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
        {/* 1. Nota Proyectada */}
        <div className="p-3 bg-slate-50/90 rounded-2xl border border-slate-100">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block truncate">
            Nota Proyectada
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

        {/* 2. Estado Tribunal */}
        <div className="p-3 bg-slate-50/90 rounded-2xl border border-slate-100">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block truncate">
            Estado Tribunal
          </span>
          <div className="flex items-center gap-1.5 mt-1 text-xs font-black tabular-nums">
            <span className="text-emerald-700 font-bold bg-emerald-100/70 px-1.5 py-0.5 rounded-md">
              {stats.listos} Listos
            </span>
            <span className="text-amber-700 font-bold bg-amber-100/70 px-1.5 py-0.5 rounded-md">
              {stats.ajuste} Ajuste
            </span>
          </div>
        </div>

        {/* 3. Retención Ebbinghaus */}
        <div className="p-3 bg-slate-50/90 rounded-2xl border border-slate-100">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block truncate">
            Ebbinghaus
          </span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-xl sm:text-2xl font-black text-slate-900 tabular-nums">
              {stats.avgRetention !== null ? `${stats.avgRetention}%` : "—"}
            </span>
            <span className="text-[10px] font-bold text-slate-400 ml-1">retención</span>
          </div>
        </div>

        {/* 4. Duración Estimada */}
        <div className="p-3 bg-slate-50/90 rounded-2xl border border-slate-100">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block truncate">
            Tiempo Cante
          </span>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-xl sm:text-2xl font-black text-slate-900 tabular-nums">
              ~{stats.totalMinutes}m
            </span>
            <span className="text-[10px] font-bold text-slate-400 ml-1">({stats.total} temas)</span>
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
          <p className="text-xs text-slate-400 italic py-1">No hay temas asignados para el {dayLabel}.</p>
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
