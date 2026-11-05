import React, { useMemo, useState } from "react";
import { X, Brain, Plus, AlertCircle, TrendingDown, Clock, Check } from "lucide-react";
import { Topic } from "../../types";
import { TopicProgressData } from "../../lib/prediction";
import { evaluateTopicPreparation } from "../../lib/preparationScore";
import { getLatestCantoForTopic, sessionMatchesTopic } from "../../lib/cantoUtils";
import { safeParseDate, cn } from "../../lib/utils";
import { playSound } from "../../lib/sound";
import { DayPlan } from "../../lib/plannerEngine";
import { motion } from "motion/react";

interface EbbinghausRecommendationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  allTopics: Topic[];
  userProgress: Record<string, TopicProgressData>;
  recentSessions: any[];
  weekDays: DayPlan[];
  onAddReviewTask: (topicId: string, dateStr: string) => void;
}

export const EbbinghausRecommendationsModal: React.FC<EbbinghausRecommendationsModalProps> = ({
  isOpen,
  onClose,
  allTopics,
  userProgress,
  recentSessions,
  weekDays,
  onAddReviewTask
}) => {
  const [selectedTargetDay, setSelectedTargetDay] = useState<string>(
    weekDays[1]?.date || weekDays[0]?.date || ""
  );

  // Analizar todos los temas y extraer los que tienen mayor necesidad de repaso
  const urgentTopics = useMemo(() => {
    const list: Array<{
      topic: Topic;
      retentionPct: number;
      overallScore: number;
      daysSinceTouch: number;
      isUrgent: boolean;
      diagnosis: string;
    }> = [];

    for (const topic of allTopics) {
      const prog = userProgress[topic.id];
      const sessions = recentSessions.filter((s) => sessionMatchesTopic(s, topic));
      if (!prog && sessions.length === 0) continue;

      const cantoData = getLatestCantoForTopic(recentSessions, topic, prog);
      const sortedSessions = [...sessions].sort(
        (a, b) => safeParseDate(b.date).getTime() - safeParseDate(a.date).getTime()
      );
      const lastSessionDate = sortedSessions[0]?.date || prog?.lastReviewDate || prog?.firstStudyDate;
      const daysSinceTouch = lastSessionDate 
        ? Math.max(0, Math.floor((new Date().getTime() - safeParseDate(lastSessionDate).getTime()) / (1000 * 3600 * 24)))
        : 0;

      const evaluation = evaluateTopicPreparation({
        topicNumber: topic.number,
        topicTitle: topic.title,
        totalCantoSecs: cantoData.hasCanto ? cantoData.totalSecs : null,
        lastGrade: cantoData.grade,
        daysSinceCanto: cantoData.hasCanto ? daysSinceTouch : null,
        daysSinceReview: daysSinceTouch,
        daysSinceTouch,
        vueltas: prog?.vueltas || 0,
        reviewsCount: sessions.length,
        difficulty: topic.difficulty || 5
      });

      // Incluir si la retención es baja (< 75%) o lleva más de 25 días sin repasar o nota baja
      if (evaluation.retentionPct < 75 || daysSinceTouch >= 25 || evaluation.isDecayed) {
        list.push({
          topic,
          retentionPct: evaluation.retentionPct,
          overallScore: evaluation.overallScore,
          daysSinceTouch,
          isUrgent: evaluation.retentionPct < 60 || daysSinceTouch >= 35,
          diagnosis: evaluation.ebbinghausDiagnosis
        });
      }
    }

    return list.sort((a, b) => a.retentionPct - b.retentionPct).slice(0, 20);
  }, [allTopics, userProgress, recentSessions]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/40 backdrop-blur-xs">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/90 shadow-2xl max-w-xl w-full max-h-[85vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
              <Brain size={18} />
            </div>
            <div>
              <h3 className="text-base font-black font-serif text-slate-900">
                Repasos Recomendados (Curva de Ebbinghaus)
              </h3>
              <p className="text-xs text-slate-500">
                Temas con decaimiento de retención neuronal o plazo mensual vencido
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>

        {/* Target Day Selector */}
        <div className="py-3 px-1 border-b border-slate-100 shrink-0 flex items-center justify-between gap-3">
          <span className="text-xs font-bold text-slate-700">
            Día para programar:
          </span>
          <select
            value={selectedTargetDay}
            onChange={(e) => setSelectedTargetDay(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-indigo-600"
          >
            {weekDays.map((d) => (
              <option key={d.date} value={d.date}>
                {d.dayName} ({d.date}) — {Math.round(d.totalEstimatedMinutes / 60 * 10) / 10}h ocupadas
              </option>
            ))}
          </select>
        </div>

        {/* Topics List */}
        <div className="flex-1 overflow-y-auto py-3 space-y-2 pr-1">
          {urgentTopics.length === 0 ? (
            <div className="p-8 text-center border border-dashed border-slate-200 rounded-2xl text-xs text-slate-500">
              ¡Excelente! No tienes temas con decaimiento crítico de retención ni repasos mensuales vencidos.
            </div>
          ) : (
            urgentTopics.map((item) => (
              <div
                key={item.topic.id}
                className="p-3.5 rounded-2xl border border-slate-200/80 bg-slate-50/60 hover:bg-white transition-all flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs font-bold px-1.5 py-0.5 rounded-md bg-slate-900 text-white">
                      T.{item.topic.number}
                    </span>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      {item.topic.subjectId}
                    </span>
                    {item.isUrgent && (
                      <span className="text-[9px] font-black uppercase px-1.5 py-0.2 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
                        Urgente
                      </span>
                    )}
                  </div>

                  <h4 className="text-xs font-bold text-slate-900 truncate">
                    {item.topic.title}
                  </h4>

                  <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1 font-mono">
                    <span className={cn(
                      "font-bold",
                      item.retentionPct < 60 ? "text-rose-600" : "text-amber-600"
                    )}>
                      Retención: {item.retentionPct}%
                    </span>
                    <span>·</span>
                    <span>Hace {item.daysSinceTouch} días</span>
                    <span>·</span>
                    <span>Nota: {item.overallScore.toFixed(1)}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    playSound.success();
                    onAddReviewTask(item.topic.id, selectedTargetDay);
                  }}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1 shrink-0 active:scale-95"
                >
                  <Plus size={13} strokeWidth={2.5} />
                  <span>Programar</span>
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end pt-3 border-t border-slate-100 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800"
          >
            Cerrar
          </button>
        </div>
      </motion.div>
    </div>
  );
};
