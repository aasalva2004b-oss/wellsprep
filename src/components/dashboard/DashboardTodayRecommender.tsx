import React, { useState } from "react";
import { Sparkles, CheckCircle2, ArrowRight, Play, Mic, RefreshCw, BookOpen, Clock, ChevronRight } from "lucide-react";
import { RecommendedStudyTask, RecommendedTaskCategory } from "../../lib/recommendationEngine";
import { playSound } from "../../lib/sound";
import { cn } from "../../lib/utils";
import { initialSubjects } from "../../data/initialData";
import { DS } from "../../lib/designSystem";

interface DashboardTodayRecommenderProps {
  tasks: RecommendedStudyTask[];
  onSelectTopic?: (topicId: string) => void;
  onQuickReview?: (task: RecommendedStudyTask) => void;
  onQuickRefresco?: (task: RecommendedStudyTask) => void;
  onQuickCanto?: (task: RecommendedStudyTask) => void;
}

export const DashboardTodayRecommender: React.FC<DashboardTodayRecommenderProps> = ({
  tasks,
  onSelectTopic,
  onQuickReview,
  onQuickRefresco,
  onQuickCanto,
}) => {
  const [activeFilter, setActiveFilter] = useState<"all" | RecommendedTaskCategory>("all");
  const [showAll, setShowAll] = useState(false);

  const filteredTasks = tasks.filter((t) => {
    if (activeFilter === "all") return true;
    return t.category === activeFilter;
  });

  const refrescoCount = tasks.filter((t) => t.category === "refresco").length;
  const repasoCount = tasks.filter((t) => t.category === "repaso").length;
  const cantoCount = tasks.filter((t) => t.category === "canto").length;
  const nuevoCount = tasks.filter((t) => t.category === "nuevo").length;

  const getSubjectName = (subjectId: string) => {
    const s = initialSubjects.find((subj) => subj.id === subjectId);
    return s?.name || subjectId;
  };

  const handleAction = (task: RecommendedStudyTask, e: React.MouseEvent) => {
    e.stopPropagation();
    playSound.click();

    if (task.actionType === "repaso" && onQuickReview) {
      onQuickReview(task);
    } else if (task.actionType === "refresco" && onQuickRefresco) {
      onQuickRefresco(task);
    } else if (task.actionType === "canto" && onQuickCanto) {
      onQuickCanto(task);
    } else if (onSelectTopic) {
      onSelectTopic(task.topic.id);
    }
  };

  const filters: Array<{ id: "all" | RecommendedTaskCategory; label: string; count: number }> = [
    { id: "all", label: "Todos", count: tasks.length },
    { id: "refresco", label: "Refrescos", count: refrescoCount },
    { id: "repaso", label: "Repasos", count: repasoCount },
    { id: "canto", label: "Cantes", count: cantoCount },
    { id: "nuevo", label: "Nuevos", count: nuevoCount },
  ];
  const visibleTasks = showAll ? filteredTasks : filteredTasks.slice(0, 5);

  return (
    <section aria-labelledby="today-recommendations-title" className={cn(DS.card, "min-w-0 p-4 sm:p-6")}>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="today-recommendations-title" className={cn(DS.titleSection, "flex flex-wrap items-center gap-2")}>
            <Sparkles size={18} className="shrink-0 text-amber-700" aria-hidden="true" />
            Plan del Día
            <span className="text-xs font-normal text-slate-600">{tasks.length} {tasks.length === 1 ? "recomendación" : "recomendaciones"}</span>
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">Elige una actividad. Registra el tiempo y el trabajo que hayas realizado.</p>
        </div>
      </header>

      <div role="group" aria-label="Filtrar recomendaciones" className="mb-4 flex flex-wrap gap-1.5">
        {filters.filter(filter => filter.id === "all" || filter.count > 0).map(filter => (
          <button key={filter.id} type="button" aria-pressed={activeFilter === filter.id}
            onClick={() => { playSound.toggle(); setActiveFilter(filter.id); setShowAll(false); }}
            className={cn("min-h-11 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors", activeFilter === filter.id ? "border-slate-800 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50")}>
            {filter.label} <span className="tabular-nums">({filter.count})</span>
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filteredTasks.length === 0 ? (
          <div role="status" className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
            <BookOpen size={28} className="mx-auto mb-3 text-slate-500" aria-hidden="true" />
            <p className="text-sm font-semibold text-slate-800">No hay recomendaciones en este filtro</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">Puedes consultar el temario y elegir otra actividad. Esta lista no confirma que hayas terminado tus objetivos.</p>
            {activeFilter !== "all" && <button type="button" onClick={() => setActiveFilter("all")} className={cn(DS.btnSecondary, "mx-auto mt-4 min-h-11")}>Ver todas</button>}
          </div>
        ) : visibleTasks.map(task => (
          <article key={task.id} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
              <span className={cn("rounded-lg border px-2 py-1 font-semibold", task.badgeTheme.bg, task.badgeTheme.text, task.badgeTheme.border)}>{task.badgeLabel}</span>
              <span className="text-slate-600">Tema {task.topic.number} · {getSubjectName(task.topic.subjectId)}</span>
            </div>
            <h3 className="text-base font-semibold leading-snug text-slate-900">
              {onSelectTopic ? <button type="button" onClick={() => onSelectTopic(task.topic.id)} className="min-h-11 text-left underline-offset-4 hover:underline">{task.topic.title}</button> : task.topic.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{task.reason} <span>{task.subReason}</span></p>
            <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs leading-relaxed text-slate-600">
              <Clock size={14} className="shrink-0" aria-hidden="true" />
              {task.estimatedMinutes === null ? "Duración todavía sin estimar" : `Estimación: ≈ ${task.estimatedMinutes} min`}
              {task.estimateInterval && <span>· rango orientativo {task.estimateInterval.low}–{task.estimateInterval.high} min</span>}
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3">
              <button type="button" onClick={event => handleAction(task, event)}
                aria-label={`${task.actionLabel}: tema ${task.topic.number}, ${task.topic.title}`}
                className={cn(DS.btnPrimary, "min-h-11 flex-1 sm:flex-none")}>
                {task.actionType === "canto" ? <Mic size={16} aria-hidden="true" /> : task.actionType === "refresco" ? <RefreshCw size={16} aria-hidden="true" /> : task.actionType === "repaso" ? <BookOpen size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
                {task.actionLabel}
              </button>
              {onSelectTopic && <button type="button" onClick={() => { playSound.click(); onSelectTopic(task.topic.id); }} aria-label={`Ver ficha del tema ${task.topic.number}`} className={cn(DS.btnSecondary, "min-h-11")}>
                Ficha <ChevronRight size={16} aria-hidden="true" />
              </button>}
            </div>
          </article>
        ))}
      </div>
      {filteredTasks.length > 5 && <button type="button" aria-expanded={showAll} onClick={() => setShowAll(value => !value)} className={cn(DS.btnSecondary, "mt-4 min-h-11 w-full")}>
        {showAll ? "Mostrar las primeras 5" : `Ver las ${filteredTasks.length} recomendaciones`}
      </button>}
    </section>
  );
};
