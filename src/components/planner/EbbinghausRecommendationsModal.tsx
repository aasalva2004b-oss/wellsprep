import { useDialogAccessibility } from '../../hooks/useDialogAccessibility';
import React, { useMemo, useState } from "react";
import { X, Brain, Plus, AlertCircle, TrendingDown, Clock, Check, Mic, Sparkles } from "lucide-react";
import { Topic } from "../../types";
import { TopicProgressData } from "../../lib/prediction";
import type { CanonicalTopic } from "../../lib/canonicalTopicService";
import { calculateCanonicalRetention, getCanonicalReviewDate } from "../../lib/ebbinghaus";
import { useFirebase } from "../../lib/FirebaseProvider";
import { getLocalDateString, cn } from "../../lib/utils";
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
  const { topicState } = useFirebase();
  const [selectedTargetDay, setSelectedTargetDay] = useState<string>(
    weekDays[1]?.date || weekDays[0]?.date || ""
  );

  // Analizar todos los temas con el motor adaptativo de Ebbinghaus
  const urgentTopics = useMemo(() => {
    const today = getLocalDateString();
    const horizon = weekDays.at(-1)?.date || today;

    const list: Array<{
      canonical: CanonicalTopic;
      retentionPct: number;
      daysSinceTouch: number;
      isUrgent: boolean;
      activeRetrieval: boolean;
      explanation: string;
      retention: ReturnType<typeof calculateCanonicalRetention>;
      recommendedDate: string;
    }> = [];

    for (const topic of allTopics) {
      const canonical = topicState.get(topic.id);
      if (!canonical) continue;
      const retention = calculateCanonicalRetention(canonical);
      const recommendedDate = getCanonicalReviewDate(canonical, retention);
      if (!retention.hasData || !recommendedDate) continue;
      const adaptive = retention.adaptive;
      const daysSinceTouch = adaptive?.daysSinceContact ?? retention.daysSinceLastAction;
      const activeRetrieval = adaptive?.target === 'recall' && adaptive.topicEvidenceCount > 0;

      // Use the same suggestion as every other view, including overdue checks.
      if (recommendedDate <= horizon) {
        list.push({
          canonical,
          retentionPct: retention.currentRetention,
          daysSinceTouch,
          isUrgent: recommendedDate <= today,
          activeRetrieval,
          explanation: retention.actionAdvice,
          retention,
          recommendedDate,
        });
      }
    }

    return list.sort((a, b) => a.recommendedDate.localeCompare(b.recommendedDate) || a.retentionPct - b.retentionPct).slice(0, 25);
  }, [allTopics, topicState, weekDays]);

  const dialogRef = useDialogAccessibility({ isOpen: isOpen, onClose });
  if (!isOpen) return null;

  return (
    <div className="wp-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/40 backdrop-blur-xs">
      <motion.div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Revisiones recomendadas"
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="wp-modal-panel bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/90 shadow-2xl max-w-xl w-full max-h-[90dvh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
              <Brain size={18} />
            </div>
            <div>
              <h3 className="text-base font-black font-serif text-slate-900">
                Revisiones sugeridas según tu historial
              </h3>
              <p className="text-xs text-slate-500">
                Estimaciones orientativas para la semana seleccionada. Los cantes ya fijados mantienen su fecha.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
              aria-label="Cerrar diálogo"
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
              No hay revisiones sugeridas para esta semana con los datos disponibles.
            </div>
          ) : (
            urgentTopics.map((item) => (
              <div
                key={item.canonical.id}
                className="p-3.5 rounded-2xl border border-slate-200/80 bg-slate-50/60 hover:bg-white transition-all flex items-center justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-mono text-xs font-bold px-1.5 py-0.5 rounded-md bg-slate-900 text-white">
                      T.{item.canonical.number}
                    </span>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      {item.canonical.subjectId}
                    </span>
                    <span className="text-[10px] font-mono text-slate-600 bg-white px-1.5 py-0.2 rounded border border-slate-200">
                      {item.canonical.hasExplicitPages && item.canonical.pages > 0
                        ? `${item.canonical.pages} págs`
                        : "Págs s/r"}
                    </span>
                    {item.activeRetrieval && (
                      <span className="text-[9px] font-black uppercase px-1.5 py-0.2 rounded-full bg-purple-100 text-purple-800 border border-purple-200 flex items-center gap-0.5">
                        <Mic size={9} />
                        Recuerdo evaluado
                      </span>
                    )}
                    {item.isUrgent && (
                      <span className="text-[9px] font-black uppercase px-1.5 py-0.2 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
                        Revisión sugerida hoy
                      </span>
                    )}
                  </div>

                  <h4 className="text-xs font-bold text-slate-900 truncate">
                    {item.canonical.title}
                  </h4>

                  <p className="text-[11px] text-slate-600 mt-1 leading-snug line-clamp-1">
                    {item.explanation}
                  </p>

                  <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1.5 font-mono">
                    <span className={cn(
                      "font-bold",
                      item.retentionPct < 60 ? "text-rose-600" : "text-amber-600"
                    )}>
                      Estimación: ≈{item.retentionPct}%
                    </span>
                    <span>·</span>
                    <span>Hace {item.daysSinceTouch} días</span>
                    <span>·</span>
                    <span>V{item.canonical.vueltas || 0}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">Fecha sugerida: {item.recommendedDate}
                    {item.retention.adaptive && ` · ${item.retention.adaptive.target === 'grade_proxy' ? 'Aproximación por nota de cante' : item.retention.adaptive.target === 'prior' ? 'Sin evaluación de recuerdo' : 'Evaluaciones de recuerdo'} · Confianza ${item.retention.adaptive.confidence}`}
                  </p>
                </div>

                <button
                  type="button"
                  disabled={!selectedTargetDay}
                  onClick={() => {
                    playSound.success();
                    onAddReviewTask(item.canonical.id, selectedTargetDay);
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
