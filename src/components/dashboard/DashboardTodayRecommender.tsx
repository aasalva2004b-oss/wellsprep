import React, { useState } from "react";
import { Sparkles, CheckCircle2, ArrowRight, Play, Mic, RefreshCw, BookOpen, Clock, ChevronRight } from "lucide-react";
import { RecommendedStudyTask, RecommendedTaskCategory } from "../../lib/recommendationEngine";
import { playSound } from "../../lib/sound";
import { cn } from "../../lib/utils";
import { initialSubjects } from "../../data/initialData";

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

  return (
    <div className="bg-white/95 backdrop-blur-xl rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-xs flex flex-col justify-between relative overflow-hidden group hover:border-slate-300 transition-all">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-2xl bg-amber-50 border border-amber-200/60 flex items-center justify-center text-amber-600 shadow-xs">
            <Sparkles size={18} strokeWidth={2.5} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-black text-slate-900 tracking-tight">
                Plan del Día · Recomendador Inteligente
              </h3>
              <span className="text-xs font-mono font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                {tasks.length} {tasks.length === 1 ? "tarea" : "tareas"}
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium">
              Priorizado según el método de preparadores (Refrescos → Repasos SRS → Cantes → Nuevo Tema)
            </p>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar bg-slate-100/80 p-1 rounded-2xl border border-slate-200/60">
          <button
            type="button"
            onClick={() => {
              playSound.toggle();
              setActiveFilter("all");
            }}
            className={cn(
              "px-2.5 py-1 rounded-xl text-xs font-black transition-all shrink-0 active:scale-95",
              activeFilter === "all" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-600 hover:text-slate-900"
            )}
          >
            Todos ({tasks.length})
          </button>

          {refrescoCount > 0 && (
            <button
              type="button"
              onClick={() => {
                playSound.toggle();
                setActiveFilter("refresco");
              }}
              className={cn(
                "px-2.5 py-1 rounded-xl text-xs font-black transition-all shrink-0 active:scale-95 flex items-center gap-1",
                activeFilter === "refresco" ? "bg-white text-amber-600 shadow-2xs" : "text-slate-600 hover:text-amber-600"
              )}
            >
              <RefreshCw size={11} className="shrink-0" />
              Refrescos ({refrescoCount})
            </button>
          )}

          {repasoCount > 0 && (
            <button
              type="button"
              onClick={() => {
                playSound.toggle();
                setActiveFilter("repaso");
              }}
              className={cn(
                "px-2.5 py-1 rounded-xl text-xs font-black transition-all shrink-0 active:scale-95 flex items-center gap-1",
                activeFilter === "repaso" ? "bg-white text-indigo-600 shadow-2xs" : "text-slate-600 hover:text-indigo-600"
              )}
            >
              <BookOpen size={11} className="shrink-0" />
              Repasos ({repasoCount})
            </button>
          )}

          {cantoCount > 0 && (
            <button
              type="button"
              onClick={() => {
                playSound.toggle();
                setActiveFilter("canto");
              }}
              className={cn(
                "px-2.5 py-1 rounded-xl text-xs font-black transition-all shrink-0 active:scale-95 flex items-center gap-1",
                activeFilter === "canto" ? "bg-white text-fuchsia-600 shadow-2xs" : "text-slate-600 hover:text-fuchsia-600"
              )}
            >
              <Mic size={11} className="shrink-0" />
              Cantes ({cantoCount})
            </button>
          )}

          {nuevoCount > 0 && (
            <button
              type="button"
              onClick={() => {
                playSound.toggle();
                setActiveFilter("nuevo");
              }}
              className={cn(
                "px-2.5 py-1 rounded-xl text-xs font-black transition-all shrink-0 active:scale-95 flex items-center gap-1",
                activeFilter === "nuevo" ? "bg-white text-emerald-600 shadow-2xs" : "text-slate-600 hover:text-emerald-600"
              )}
            >
              <Play size={11} className="shrink-0" />
              Nuevo ({nuevoCount})
            </button>
          )}
        </div>
      </div>

      {/* Task List */}
      <div className="space-y-2.5">
        {filteredTasks.length === 0 ? (
          <div className="py-10 text-center flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50">
            <CheckCircle2 size={36} className="text-emerald-500 mb-2 stroke-[1.5]" />
            <p className="text-sm font-black text-slate-800">¡Al día! No hay tareas pendientes en este filtro</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Has cubierto los objetivos programados o puedes iniciar un nuevo tema del programa.
            </p>
          </div>
        ) : (
          filteredTasks.map((task) => {
            const subjectName = getSubjectName(task.topic.subjectId);

            return (
              <div
                key={task.id}
                onClick={() => onSelectTopic && onSelectTopic(task.topic.id)}
                className="group/task p-3.5 sm:p-4 rounded-2xl border border-slate-200/80 hover:border-indigo-300/80 bg-white hover:bg-slate-50/80 transition-all flex flex-col md:flex-row md:items-center justify-between gap-3 cursor-pointer shadow-2xs"
              >
                {/* Left info */}
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  {/* Topic Number Tag */}
                  <div className="w-10 h-10 rounded-xl bg-slate-100 group-hover/task:bg-indigo-50 border border-slate-200 group-hover/task:border-indigo-200 flex flex-col items-center justify-center shrink-0 transition-colors">
                    <span className="text-[9px] font-black uppercase text-slate-400 group-hover/task:text-indigo-500 leading-none">
                      Tema
                    </span>
                    <span className="text-sm font-black text-slate-900 group-hover/task:text-indigo-600 font-mono leading-tight">
                      {task.topic.number}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                      {/* Priority Tag */}
                      <span
                        className={cn(
                          "text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border",
                          task.badgeTheme.bg,
                          task.badgeTheme.text,
                          task.badgeTheme.border
                        )}
                      >
                        {task.badgeLabel}
                      </span>
                      {/* Subject Name */}
                      <span className="text-[11px] font-semibold text-slate-400 truncate">
                        {subjectName}
                      </span>
                      {/* Time estimate */}
                      <span className="text-[11px] font-mono font-medium text-slate-400 flex items-center gap-1 ml-auto md:ml-0">
                        <Clock size={11} className="shrink-0" />
                        ~{task.estimatedMinutes} min
                      </span>
                    </div>

                    {/* Topic Title */}
                    <h4 className="text-sm font-bold text-slate-900 group-hover/task:text-indigo-600 transition-colors line-clamp-1">
                      {task.topic.title}
                    </h4>

                    {/* Pedagogical reason */}
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">
                      {task.reason}{" "}
                      <span className="text-slate-400 font-normal">· {task.subReason}</span>
                    </p>
                  </div>
                </div>

                {/* Right Actions */}
                <div className="flex items-center gap-2 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100 justify-end">
                  <button
                    type="button"
                    onClick={(e) => handleAction(task, e)}
                    className={cn(
                      "px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 active:scale-95 shadow-2xs",
                      task.actionType === "repaso"
                        ? "bg-indigo-600 hover:bg-indigo-700 text-white"
                        : task.actionType === "canto"
                        ? "bg-fuchsia-600 hover:bg-fuchsia-700 text-white"
                        : task.actionType === "refresco"
                        ? "bg-amber-600 hover:bg-amber-700 text-white"
                        : "bg-slate-900 hover:bg-slate-800 text-white"
                    )}
                  >
                    {task.actionType === "canto" && <Mic size={13} className="shrink-0" />}
                    {task.actionType === "refresco" && <RefreshCw size={13} className="shrink-0" />}
                    {task.actionType === "repaso" && <BookOpen size={13} className="shrink-0" />}
                    {task.actionType === "estudio" && <Play size={13} className="shrink-0" />}
                    <span>{task.actionLabel}</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      playSound.click();
                      if (onSelectTopic) onSelectTopic(task.topic.id);
                    }}
                    className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                    title="Ver ficha del tema"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
