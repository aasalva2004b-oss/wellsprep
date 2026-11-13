import React, { useState } from "react";
import { 
  Star, Timer, Brain, Sparkles, Trash2, 
  ChevronDown, ChevronUp, AlertCircle, CheckCircle2,
  Zap
} from "lucide-react";
import { Topic, Subject } from "../../types";
import { TopicPreparationEvaluation, WINDOW_MIN_SECS, WINDOW_MAX_SECS } from "../../lib/preparationScore";
import { playSound } from "../../lib/sound";
import { cn } from "../../lib/utils";

interface PreparadorTopicCardProps {
  topic: Topic;
  subject?: Subject;
  evaluation: TopicPreparationEvaluation;
  hasCanto: boolean;
  lastCantoMins: number;
  lastCantoSecs: number;
  lastGrade: number | null;
  daysSinceTouch: number | null;
  vueltas: number;
  reviewsCount: number;
  onRemove: (topicId: string) => void;
  onOpenFeedback: (topic: Topic) => void;
  onQuickReview?: (topicId: string, durationMinutes?: number) => void;
}

export const PreparadorTopicCard: React.FC<PreparadorTopicCardProps> = ({
  topic,
  subject,
  evaluation,
  hasCanto,
  lastCantoMins,
  lastCantoSecs,
  lastGrade,
  daysSinceTouch,
  vueltas,
  reviewsCount,
  onRemove,
  onOpenFeedback,
  onQuickReview,
}) => {
  const [showPlan, setShowPlan] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);

  // Gauge calculations for the 10:00 (600s) to 15:00 (900s) scale
  const minGaugeSecs = 600;
  const maxGaugeSecs = 900;
  const clampSecs = Math.max(minGaugeSecs, Math.min(maxGaugeSecs, evaluation.totalCantoSecs || 750));
  const needlePct = ((clampSecs - minGaugeSecs) / (maxGaugeSecs - minGaugeSecs)) * 100;
  const windowMinPct = ((WINDOW_MIN_SECS - minGaugeSecs) / (maxGaugeSecs - minGaugeSecs)) * 100; // ~36.6%
  const windowMaxPct = ((WINDOW_MAX_SECS - minGaugeSecs) / (maxGaugeSecs - minGaugeSecs)) * 100; // ~73.3%
  const optimalPct = 50; // 750s / (900 - 600) = 50%

  const handleQuickReview = async () => {
    if (!onQuickReview) return;
    setIsReviewing(true);
    try {
      await onQuickReview(topic.id);
    } finally {
      setIsReviewing(false);
    }
  };

  return (
    <div
      className={cn(
        "bg-white rounded-2xl p-4 sm:p-5 border transition-all duration-200 shadow-2xs hover:shadow-xs flex flex-col justify-between relative group",
        !evaluation.scoreAvailable ? 'border-slate-200/80 hover:border-slate-300' : evaluation.isReadyForTribunal
          ? "border-emerald-200/90 hover:border-emerald-300"
          : evaluation.overallScore >= 7.0
          ? "border-indigo-200/80 hover:border-indigo-300"
          : evaluation.overallScore >= 5.0
          ? "border-amber-200/80 hover:border-amber-300"
          : "border-rose-200/80 hover:border-rose-300"
      )}
    >
      <div>
        {/* Top Header Row: Clean unboxed metadata (Zero-Pill discipline) + Dual Score + Remove Button */}
        <div className="flex items-start justify-between gap-3 mb-2.5">
          <div className="flex items-center gap-1.5 flex-wrap text-[11px] font-bold text-slate-500">
            <span className="text-slate-800 font-black">
              {subject?.name.split(" ")[0] || "Bloque"}
            </span>
            <span>·</span>
            <span className="text-slate-900 font-bold font-mono">Tema {topic.number}</span>
            <span>·</span>
            <span className="font-mono tabular-nums text-slate-500">V{vueltas}</span>
            <span>·</span>
            <span className="font-mono tabular-nums text-slate-400">
              {reviewsCount} {reviewsCount === 1 ? "repaso" : "repasos"}
            </span>
            {evaluation.isReadyForTribunal && (
              <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 size={10} strokeWidth={3} />
                Tribunal
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Observed examiner feedback, never a predicted current grade. */}
            <div className="flex items-baseline gap-1.5 px-2.5 py-1 rounded-xl bg-slate-50 border border-slate-200/60" title={evaluation.gradeDiagnosis}>
              <span className="text-[9px] text-slate-500">Última nota</span>
              <span
                className={cn(
                  "text-lg font-black font-serif tabular-nums tracking-tight leading-none",
                  !evaluation.scoreAvailable ? 'text-slate-400' : evaluation.overallScore >= 8.5
                    ? "text-emerald-700"
                    : evaluation.overallScore >= 7.0
                    ? "text-indigo-700"
                    : evaluation.overallScore >= 5.0
                    ? "text-amber-700"
                    : "text-rose-600"
                )}
              >
                {evaluation.scoreAvailable ? evaluation.officialGrade!.toFixed(1) : 'Sin nota'}
              </span>
              {evaluation.scoreAvailable && <span className="text-[10px] font-bold text-slate-400 leading-none">/ 10</span>}
            </div>

            <button
              type="button"
              onClick={() => {
                playSound.click();
                onRemove(topic.id);
              }}
              className="text-slate-300 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition-colors"
              title="Quitar tema de la sesión"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        {/* Topic Title */}
        <h4
          className="text-sm font-bold text-slate-900 leading-snug line-clamp-1 mb-2.5 group-hover:text-indigo-600 transition-colors"
          title={topic.fullTitle || topic.title}
        >
          {topic.title}
        </h4>

        {/* Compact 3-Pillar Telemetry Grid */}
        <div className="grid grid-cols-3 gap-1.5 sm:gap-2 p-2.5 rounded-xl bg-slate-50/80 border border-slate-100 mb-2.5">
          {/* Pillar 1: Cronómetro Cante */}
          <div className="flex flex-col justify-between">
            <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider flex items-center gap-1">
              <Timer size={10} className="text-slate-500" />
              Cante 12:30
            </span>
            <div className="mt-1 flex items-baseline gap-1">
              <span
                className={cn(
                  "text-xs font-black font-mono tabular-nums",
                  !hasCanto
                    ? "text-slate-400 font-normal"
                    : evaluation.timeZone === "perfect"
                    ? "text-emerald-700 font-extrabold"
                    : evaluation.timeZone === "in_window"
                    ? "text-indigo-700"
                    : "text-amber-700"
                )}
              >
                {hasCanto ? `${lastCantoMins}:${lastCantoSecs.toString().padStart(2, "0")}` : "Sin cante"}
              </span>
              {hasCanto && (
                <span className="text-[9px] font-mono font-bold text-slate-400 tabular-nums">
                  ({evaluation.timeDevianceFormatted})
                </span>
              )}
            </div>
          </div>

          {/* Pillar 2: Retención Ebbinghaus */}
          <div className="flex flex-col justify-between border-x border-slate-200/50 px-1.5 sm:px-2" title={evaluation.retentionEstimate
            ? `Confianza ${evaluation.retentionEstimate.confidence}. ${evaluation.retentionEstimate.interval ? `Rango orientativo ${Math.round(evaluation.retentionEstimate.interval.low * 20) * 5}–${Math.round(evaluation.retentionEstimate.interval.high * 20) * 5}%.` : ''}`
            : 'Estimación orientativa según el historial disponible.'}>
            <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider flex items-center gap-1">
              <Brain size={10} className="text-cyan-600" />
              Estimación
            </span>
            <div className="mt-1 flex items-baseline gap-1">
              <span
                className={cn(
                  "text-xs font-black font-mono tabular-nums",
                  !evaluation.retentionAvailable ? "text-slate-400" : evaluation.retentionPct >= 80
                    ? "text-emerald-600"
                    : evaluation.retentionPct >= 65
                    ? "text-indigo-600"
                    : "text-amber-600"
                )}
              >
                {evaluation.retentionAvailable ? `≈${evaluation.retentionPct}%` : 'Sin datos'}
              </span>
              <span className="text-[9px] text-slate-400 font-mono tabular-nums">
                {daysSinceTouch !== null ? `${daysSinceTouch}d` : "—"}
              </span>
            </div>
            {evaluation.retentionAvailable && <span className="text-[9px] text-slate-500 mt-0.5">{evaluation.retentionEstimate?.target === 'grade_proxy' ? 'Aproximación por nota' : evaluation.retentionEstimate?.target === 'prior' ? 'Sin evaluación' : 'Recuerdo evaluado'}</span>}
          </div>

          {/* Pillar 3: Nota Oficial Preparador */}
          <div className="flex flex-col justify-between pl-1">
            <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider flex items-center gap-1">
              <Star size={10} className="text-amber-500" />
              Nota Prep.
            </span>
            <div className="mt-1 flex items-baseline gap-1">
              <span
                className={cn(
                  "text-xs font-black font-mono tabular-nums",
                  evaluation.officialGrade === null
                    ? "text-slate-400 font-normal"
                    : evaluation.officialGrade >= 8.5
                    ? "text-emerald-600"
                    : evaluation.officialGrade >= 7.0
                    ? "text-indigo-600"
                    : evaluation.officialGrade >= 5.0
                    ? "text-amber-600"
                    : "text-rose-600"
                )}
              >
                {evaluation.scoreAvailable ? evaluation.officialGrade!.toFixed(1) : "Sin nota"}
              </span>
              {evaluation.scoreAvailable && <span className="text-[9px] font-bold text-slate-400 font-mono">/10</span>}
            </div>
          </div>
        </div>

        {/* Mini Canto Gauge Track (Compact 4px) */}
        <div className="mb-2 px-1">
          <div className="relative w-full h-1.5 bg-slate-200/70 rounded-full overflow-hidden">
            {/* Window 11:50 to 13:40 */}
            <div
              className="absolute top-0 bottom-0 bg-emerald-200"
              style={{
                left: `${windowMinPct}%`,
                width: `${windowMaxPct - windowMinPct}%`,
              }}
            />
            {/* Optimal 12:30 mark */}
            <div className="absolute top-0 bottom-0 w-0.5 bg-indigo-600 z-10" style={{ left: `${optimalPct}%` }} />
            {/* User needle */}
            {hasCanto && (
              <div
                className="absolute top-0 bottom-0 w-1.5 bg-slate-900 rounded-full ring-1 ring-white z-20"
                style={{ left: `${needlePct}%` }}
              />
            )}
          </div>
          <div className="flex justify-between text-[8px] text-slate-400 font-mono mt-0.5 tabular-nums">
            <span>10:00</span>
            <span className="text-emerald-700 font-bold">11:50 - 13:40</span>
            <span>15:00</span>
          </div>
        </div>

        {/* Expandable Action Plan (Plan para el 10) */}
        <div className="mb-2">
          <button
            type="button"
            onClick={() => setShowPlan(!showPlan)}
            className="w-full text-left flex items-center justify-between text-[11px] font-bold text-slate-500 hover:text-slate-800 py-1 transition-colors"
          >
            <span className="flex items-center gap-1.5 text-indigo-600">
              <Sparkles size={11} className="shrink-0" />
              <span>Siguiente evaluación</span>
            </span>
            {showPlan ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          {showPlan && (
            <p className="text-[11px] text-slate-600 bg-indigo-50/50 p-2 rounded-xl border border-indigo-100/70 mt-1 leading-relaxed animate-in fade-in duration-200">
              {evaluation.actionPlan}
            </p>
          )}
        </div>
      </div>

      {/* Footer Primary Actions: 1-Click Repaso Rápido + Registrar Nota / Cante */}
      <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
        {onQuickReview && (
          <button
            type="button"
            disabled={isReviewing}
            onClick={() => {
              playSound.click();
              handleQuickReview();
            }}
            className="py-2 px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/80 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 active:scale-98 disabled:opacity-50"
            title="Indica la duración y las páginas del repaso realizado"
          >
            <Zap size={12} className="text-emerald-600 fill-emerald-600" />
            <span>{isReviewing ? "..." : "Registrar repaso"}</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            playSound.click();
            onOpenFeedback(topic);
          }}
          className="flex-1 py-2 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center justify-center gap-1.5 active:scale-98"
        >
          <Star size={12} className="text-amber-400 fill-amber-400" />
          <span>Registrar Nota / Cante</span>
        </button>
      </div>
    </div>
  );
};
