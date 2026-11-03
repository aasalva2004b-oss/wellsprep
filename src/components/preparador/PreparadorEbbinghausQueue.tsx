import React, { useState, useMemo } from "react";
import { 
  Brain, 
  Flame, 
  AlertTriangle, 
  Clock, 
  Plus, 
  Zap, 
  CheckCircle2, 
  Search, 
  Filter, 
  ArrowUpDown, 
  BookOpen, 
  ChevronRight,
  TrendingDown
} from "lucide-react";
import { Topic, Subject } from "../../types";
import { initialTopics, initialSubjects } from "../../data/initialData";
import { evaluateTopicPreparation, TopicPreparationEvaluation } from "../../lib/preparationScore";
import { calculateTopicCycle } from "../../lib/oposicionCycle";
import { safeParseDate, cn } from "../../lib/utils";
import { sessionMatchesTopic, getLatestCantoForTopic, isCantoSession } from "../../lib/cantoUtils";
import { playSound } from "../../lib/sound";

interface PreparadorEbbinghausQueueProps {
  userProgress: Record<string, any>;
  recentSessions: any[];
  onAssignToDay: (topicId: string, day: "lunes" | "jueves") => void;
  onQuickReview: (topicId: string, durationMinutes: number) => void;
  onOpenTopic?: (topicId: string) => void;
  assignedLunesIds: string[];
  assignedJuevesIds: string[];
}

export const PreparadorEbbinghausQueue: React.FC<PreparadorEbbinghausQueueProps> = ({
  userProgress,
  recentSessions,
  onAssignToDay,
  onQuickReview,
  onOpenTopic,
  assignedLunesIds,
  assignedJuevesIds
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>("all");
  const [filterSeverity, setFilterSeverity] = useState<"all" | "critical" | "warning">("all");
  const [reviewingTopicId, setReviewingTopicId] = useState<string | null>(null);

  // Subject lookup
  const subjectMap = useMemo(() => {
    const map = new Map<string, Subject>();
    for (const s of initialSubjects) {
      map.set(s.id, s);
    }
    return map;
  }, []);

  // Compute evaluations for all studied topics
  const analyzedQueue = useMemo(() => {
    const results: Array<{
      topic: Topic;
      subject?: Subject;
      evaluation: TopicPreparationEvaluation;
      vueltas: number;
      daysSinceTouch: number | null;
      lastDateFormatted: string;
      isAssignedLunes: boolean;
      isAssignedJueves: boolean;
    }> = [];

    for (const topic of initialTopics) {
      const prog = userProgress[topic.id];
      const sessions = recentSessions.filter((s) => sessionMatchesTopic(s, topic));

      // Only consider topics that have at least 1 session or progress record
      if (!prog && sessions.length === 0) continue;

      const cantoData = getLatestCantoForTopic(recentSessions, topic, prog);
      const sortedSessions = [...sessions].sort(
        (a, b) => safeParseDate(b.date).getTime() - safeParseDate(a.date).getTime()
      );

      const daysSinceCanto = cantoData.date
        ? Math.max(0, Math.floor((new Date().getTime() - safeParseDate(cantoData.date).getTime()) / (1000 * 3600 * 24)))
        : null;

      const reviewSession = sortedSessions.find((s) => !isCantoSession(s)) || sortedSessions[0];
      const lastReviewDate = reviewSession?.date || prog?.lastReviewDate || prog?.firstStudyDate;
      const daysSinceReview = lastReviewDate
        ? Math.max(0, Math.floor((new Date().getTime() - safeParseDate(lastReviewDate).getTime()) / (1000 * 3600 * 24)))
        : null;

      const lastDate = sortedSessions[0]?.date || prog?.lastReviewDate || prog?.firstStudyDate;
      const daysSinceTouch = lastDate
        ? Math.max(0, Math.floor((new Date().getTime() - safeParseDate(lastDate).getTime()) / (1000 * 3600 * 24)))
        : null;

      const vueltas = prog?.vueltas || 0;
      const reviewsCount = sessions.length;

      const evaluation = evaluateTopicPreparation({
        topicNumber: topic.number,
        topicTitle: topic.title,
        totalCantoSecs: cantoData.hasCanto ? cantoData.totalSecs : null,
        lastGrade: cantoData.grade,
        daysSinceCanto,
        daysSinceReview,
        daysSinceTouch,
        vueltas,
        reviewsCount,
        difficulty: topic.difficulty || 5
      });

      results.push({
        topic,
        subject: subjectMap.get(topic.subjectId),
        evaluation,
        vueltas,
        daysSinceTouch,
        lastDateFormatted: lastDate ? lastDate.split("T")[0] : "Sin fecha",
        isAssignedLunes: assignedLunesIds.includes(topic.id),
        isAssignedJueves: assignedJuevesIds.includes(topic.id)
      });
    }

    // Sort by urgency: lowest retention first and highest decay first
    return results.sort((a, b) => {
      // Priority 1: High decay
      const decayDiff = b.evaluation.scoreDecay - a.evaluation.scoreDecay;
      if (Math.abs(decayDiff) > 0.5) return decayDiff;
      // Priority 2: Lowest retention
      return a.evaluation.retentionPct - b.evaluation.retentionPct;
    });
  }, [userProgress, recentSessions, subjectMap, assignedLunesIds, assignedJuevesIds]);

  // Filtered topics
  const filteredQueue = useMemo(() => {
    return analyzedQueue.filter((item) => {
      // Subject filter
      if (selectedSubjectId !== "all" && item.topic.subjectId !== selectedSubjectId) {
        return false;
      }
      // Severity filter
      if (filterSeverity === "critical" && (item.evaluation.retentionPct >= 50 && item.evaluation.scoreDecay < 1.0)) {
        return false;
      }
      if (filterSeverity === "warning" && item.evaluation.retentionPct >= 70 && !item.evaluation.isDecayed) {
        return false;
      }
      // Text search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesTitle = item.topic.title.toLowerCase().includes(q);
        const matchesNum = item.topic.number.toString().includes(q);
        const matchesSubj = item.subject?.name.toLowerCase().includes(q) || false;
        if (!matchesTitle && !matchesNum && !matchesSubj) return false;
      }
      return true;
    });
  }, [analyzedQueue, selectedSubjectId, filterSeverity, searchQuery]);

  const handleExecuteQuickReview = async (topicId: string, mins: number) => {
    setReviewingTopicId(topicId);
    try {
      await onQuickReview(topicId, mins);
    } finally {
      setReviewingTopicId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Informative Header Banner */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-2xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-800 flex items-center justify-center shrink-0">
              <Brain size={20} className="text-amber-600" />
            </div>
            <div>
              <h3 className="text-base font-black font-serif text-slate-900 tracking-tight flex items-center gap-2">
                <span>Cola Inteligente de Repaso (Curva de Ebbinghaus)</span>
                <span className="text-xs font-mono font-bold text-amber-800 bg-amber-100/70 px-2 py-0.5 rounded-full">
                  {filteredQueue.length} temas en seguimiento
                </span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Detecta automáticamente los temas con retención neuronal en declive para frenar la curva del olvido antes de tu próximo cante.
              </p>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-xl border border-slate-200/60 shrink-0 text-xs font-bold text-slate-700">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span>{analyzedQueue.filter(i => i.evaluation.retentionPct < 50).length} Críticos</span>
            </div>
            <span>·</span>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span>{analyzedQueue.filter(i => i.evaluation.retentionPct >= 50 && i.evaluation.retentionPct < 70).length} Alerta</span>
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 flex-1 min-w-[220px]">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar tema por número o título..."
                className="w-full pl-8 pr-3 py-1.5 bg-slate-100/80 hover:bg-slate-100 focus:bg-white rounded-xl text-xs text-slate-900 placeholder-slate-400 border border-transparent focus:border-slate-300 focus:outline-none transition-all"
              />
            </div>

            <select
              value={selectedSubjectId}
              onChange={(e) => setSelectedSubjectId(e.target.value)}
              className="py-1.5 px-2.5 bg-slate-100 rounded-xl text-xs font-bold text-slate-700 border border-slate-200/60 focus:outline-none"
            >
              <option value="all">Todas las materias</option>
              {initialSubjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name.split(" ")[0]}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl border border-slate-200/60">
            <button
              type="button"
              onClick={() => setFilterSeverity("all")}
              className={cn(
                "px-2.5 py-1 rounded-lg text-xs font-bold transition-all",
                filterSeverity === "all" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-600 hover:text-slate-900"
              )}
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => setFilterSeverity("critical")}
              className={cn(
                "px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1",
                filterSeverity === "critical" ? "bg-white text-rose-700 shadow-2xs" : "text-slate-600 hover:text-rose-700"
              )}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
              <span>Críticos</span>
            </button>
            <button
              type="button"
              onClick={() => setFilterSeverity("warning")}
              className={cn(
                "px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1",
                filterSeverity === "warning" ? "bg-white text-amber-700 shadow-2xs" : "text-slate-600 hover:text-amber-700"
              )}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              <span>En Desgaste</span>
            </button>
          </div>
        </div>
      </div>

      {/* Topics Queue List */}
      <div className="space-y-2.5">
        {filteredQueue.length > 0 ? (
          filteredQueue.map(({ topic, subject, evaluation, vueltas, daysSinceTouch, isAssignedLunes, isAssignedJueves }) => {
            const isCrit = evaluation.retentionPct < 50;
            const isWarn = evaluation.retentionPct < 70;
            const isBusy = reviewingTopicId === topic.id;

            return (
              <div
                key={topic.id}
                className={cn(
                  "bg-white rounded-2xl p-4 border transition-all duration-200 shadow-2xs hover:shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4 group",
                  isCrit 
                    ? "border-rose-200/90 hover:border-rose-300" 
                    : isWarn 
                    ? "border-amber-200/90 hover:border-amber-300" 
                    : "border-slate-200/80 hover:border-slate-300"
                )}
              >
                {/* Topic Info & Status */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200/60 font-mono">
                      {subject?.name.split(" ")[0] || "Bloque"} · Tema {topic.number}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      V{vueltas} · {daysSinceTouch !== null ? `${daysSinceTouch} días sin tocar` : "Sin contacto"}
                    </span>
                    {isAssignedLunes && (
                      <span className="text-[9px] font-black uppercase text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
                        Asignado a Lunes
                      </span>
                    )}
                    {isAssignedJueves && (
                      <span className="text-[9px] font-black uppercase text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
                        Asignado a Jueves
                      </span>
                    )}
                  </div>

                  <h4 
                    onClick={() => onOpenTopic && onOpenTopic(topic.id)}
                    className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors cursor-pointer truncate"
                  >
                    {topic.title}
                  </h4>

                  {/* Retention Gauge Line */}
                  <div className="mt-2.5 flex items-center gap-3">
                    <div className="w-32 sm:w-44 h-1.5 bg-slate-100 rounded-full overflow-hidden shrink-0">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-500",
                          isCrit ? "bg-rose-500" : isWarn ? "bg-amber-500" : "bg-emerald-500"
                        )}
                        style={{ width: `${Math.max(5, Math.min(100, evaluation.retentionPct))}%` }}
                      />
                    </div>
                    <span className={cn(
                      "text-xs font-black font-mono tabular-nums",
                      isCrit ? "text-rose-600" : isWarn ? "text-amber-600" : "text-emerald-700"
                    )}>
                      {evaluation.retentionPct}% retención
                    </span>
                    {evaluation.isDecayed && (
                      <span className="text-[11px] font-mono text-rose-600 font-bold flex items-center gap-0.5">
                        <TrendingDown size={11} />
                        -{evaluation.scoreDecay.toFixed(1)} pts
                      </span>
                    )}
                  </div>
                </div>

                {/* Direct Action Cockpit */}
                <div className="flex items-center gap-2 flex-wrap shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
                  {/* 1-Click Frenar Olvido (+45m) */}
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => {
                      playSound.click();
                      handleExecuteQuickReview(topic.id, 45);
                    }}
                    className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-all shadow-2xs flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                    title="Registra un repaso de 45 minutos y reinicia la curva de retención neuronal"
                  >
                    <Zap size={13} fill="currentColor" />
                    <span>{isBusy ? "Guardando..." : "Frenar Olvido (+45m)"}</span>
                  </button>

                  {/* Assign to Lunes */}
                  {!isAssignedLunes && (
                    <button
                      type="button"
                      onClick={() => {
                        playSound.click();
                        onAssignToDay(topic.id, "lunes");
                      }}
                      className="px-2.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 rounded-xl text-xs font-bold transition-all border border-slate-200/60 active:scale-95"
                      title="Asignar al cante del próximo Lunes"
                    >
                      + Lunes
                    </button>
                  )}

                  {/* Assign to Jueves */}
                  {!isAssignedJueves && (
                    <button
                      type="button"
                      onClick={() => {
                        playSound.click();
                        onAssignToDay(topic.id, "jueves");
                      }}
                      className="px-2.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 rounded-xl text-xs font-bold transition-all border border-slate-200/60 active:scale-95"
                      title="Asignar al cante del próximo Jueves"
                    >
                      + Jueves
                    </button>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="bg-white rounded-2xl p-10 text-center border border-dashed border-slate-200">
            <CheckCircle2 size={36} className="mx-auto text-emerald-500 mb-2 opacity-60" />
            <h4 className="text-sm font-bold text-slate-800">¡Retención neuronal óptima!</h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
              No tienes temas en zona crítica de olvido con los filtros actuales. Todos tus temas estudiados mantienen una retención consolidada.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
