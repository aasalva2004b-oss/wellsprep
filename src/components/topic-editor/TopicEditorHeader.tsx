import React from "react";
import { Target, Sparkles, Check, AlertTriangle, CalendarDays, X } from "lucide-react";
import { Topic } from "../../types";
import { TopicProgressData } from "../../lib/prediction";
import { cn } from "../../lib/utils";

interface TopicEditorHeaderProps {
  topic: Topic;
  progress: TopicProgressData | undefined;
  customTitle: string;
  topicCycle: {
    phaseLabel: string;
    phaseBadgeClass: string;
  };
  daysUntilReview: number;
  nextReviewDate: string | null;
  onClose: () => void;
  disabled?: boolean;
}

export const TopicEditorHeader: React.FC<TopicEditorHeaderProps> = ({
  topic,
  progress,
  customTitle,
  topicCycle,
  daysUntilReview,
  nextReviewDate,
  onClose,
  disabled = false,
}) => {
  return (
    <header className="flex-shrink-0 px-4 py-3 sm:px-6 sm:py-4 md:px-8 md:py-5 bg-white/90 backdrop-blur-2xl border-b border-slate-200/80 flex items-center justify-between z-50">
      <div className="flex-1 min-w-0 pr-4">
        <div className="flex flex-wrap items-center gap-2 mb-1.5">
          <span className="bg-indigo-50 text-indigo-700 border border-indigo-200/60 px-3 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 shadow-xs font-mono tabular-nums">
            <Target size={12} className="text-indigo-600" /> Tema {topic.number === 999 ? "Extra" : topic.number}
          </span>
          
          {/* Fase Ciclo Preparador */}
          <span className={cn(
            "px-3 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 shadow-xs border",
            topicCycle.phaseBadgeClass
          )}>
            <Sparkles size={12} /> {topicCycle.phaseLabel}
          </span>

          {(progress?.vueltas ?? 0) > 0 && (
            <span className="bg-emerald-50 text-emerald-700 border border-emerald-200/60 px-3 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 shadow-xs font-mono tabular-nums">
              <Check size={12} className="text-emerald-600" /> Vuelta {progress?.vueltas}
            </span>
          )}

          {daysUntilReview <= 0 && progress?.firstStudyDate ? (
            <span className="bg-rose-50 text-rose-700 border border-rose-200/80 px-3 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 shadow-xs animate-pulse">
              <AlertTriangle size={12} className="text-rose-600" /> Repaso Pendiente (Hoy)
            </span>
          ) : nextReviewDate ? (
            <span className="bg-slate-100 text-slate-700 border border-slate-200/60 px-3 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 font-mono tabular-nums">
              <CalendarDays size={12} className="text-slate-500" /> Próximo: en {daysUntilReview} d
            </span>
          ) : null}
        </div>

        <h2 className="text-base sm:text-xl md:text-2xl font-black font-serif text-slate-900 tracking-tight">
          {customTitle || topic.title}
        </h2>
        
        {topic.fullTitle && topic.fullTitle !== (customTitle || topic.title) && (
          <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed line-clamp-2 hover:line-clamp-none transition-all" title={topic.fullTitle}>
            {topic.fullTitle}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={onClose}
        disabled={disabled}
        aria-label="Cerrar ficha"
        className="h-11 w-11 bg-slate-100/90 hover:bg-slate-200 text-slate-500 hover:text-slate-800 rounded-full transition-all flex items-center justify-center flex-shrink-0 disabled:opacity-50"
        title="Cerrar ficha"
      >
        <X size={18} strokeWidth={2.5} />
      </button>
    </header>
  );
};
