import React, { useState } from "react";
import { 
  Target, 
  Clock, 
  BookOpen, 
  Sparkles, 
  RefreshCw, 
  Sliders, 
  CheckCircle2, 
  AlertCircle,
  ChevronRight,
  TrendingUp,
  X
} from "lucide-react";
import { WeeklyCantePlan, TopicCanteGoal } from "../../lib/weeklyCanteEngine";
import { cn, formatMinutesToHours } from "../../lib/utils";
import { playSound } from "../../lib/sound";
import { motion, AnimatePresence } from "motion/react";

interface CanteGoalCockpitProps {
  plan: WeeklyCantePlan;
  onUpdateTopicPages: (topicId: string, newTotalPages: number) => void;
  onUpdateTopicProgress: (topicId: string, newCompletedPages: number) => void;
  onForceRebalance: () => void;
  onOpenTopicPicker?: () => void;
}

export const CanteGoalCockpit: React.FC<CanteGoalCockpitProps> = ({
  plan,
  onUpdateTopicPages,
  onUpdateTopicProgress,
  onForceRebalance,
  onOpenTopicPicker
}) => {
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
  const [tempPages, setTempPages] = useState<number>(20);
  const [tempCompleted, setTempCompleted] = useState<number>(0);

  const goals: TopicCanteGoal[] = Object.values(plan.topicGoals || {});
  const remainingPages = Math.max(0, plan.totalTargetPages - plan.totalCompletedPages);
  const remainingMinutes = Math.round(remainingPages * plan.historicalAverageMinPerPage);

  const startEdit = (goal: TopicCanteGoal) => {
    setEditingTopicId(goal.topicId);
    setTempPages(goal.totalPages);
    setTempCompleted(goal.completedPages);
  };

  const saveEdit = (topicId: string) => {
    onUpdateTopicPages(topicId, Math.max(1, tempPages));
    onUpdateTopicProgress(topicId, Math.max(0, Math.min(tempPages, tempCompleted)));
    setEditingTopicId(null);
    playSound.success();
  };

  const getStatusBadge = () => {
    switch (plan.status) {
      case "ahead":
        return { label: "¡Objetivo Superado!", bg: "bg-emerald-50 text-emerald-800 border-emerald-200" };
      case "on_track":
        return { label: "Ritmo Óptimo", bg: "bg-blue-50 text-blue-800 border-blue-200" };
      case "behind":
        return { label: "Carga Reubicada", bg: "bg-amber-50 text-amber-800 border-amber-200" };
      case "urgent":
        return { label: "Sprint Final", bg: "bg-rose-50 text-rose-800 border-rose-200" };
      default:
        return { label: "Planificado", bg: "bg-slate-50 text-slate-700 border-slate-200" };
    }
  };

  const statusBadge = getStatusBadge();

  return (
    <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs p-4 sm:p-5 mb-5 relative overflow-hidden transition-all">
      {/* Background Accent Subtle Glow */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-br from-indigo-50/40 via-blue-50/20 to-transparent rounded-full blur-3xl pointer-events-none" />

      {/* Top Cockpit Header */}
      <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-slate-900 text-white flex items-center justify-center shrink-0 shadow-xs">
            <Target size={20} className="text-amber-400" />
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-black font-serif text-slate-900 tracking-tight">
                Objetivo de Cante · {plan.targetCanteDay === "lunes" ? "Lunes" : "Jueves"}
              </h2>
              <span className={cn("text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border", statusBadge.bg)}>
                {statusBadge.label}
              </span>
              <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                {plan.daysRemaining === 0 ? "¡Hoy es el Cante!" : `Faltan ${plan.daysRemaining} ${plan.daysRemaining === 1 ? "día" : "días"}`}
              </span>
            </div>

            <p className="text-xs text-slate-500 mt-0.5 font-medium flex items-center gap-2 flex-wrap">
              <span>{goals.length} temas asignados</span>
              <span className="text-slate-300">·</span>
              <span>Ritmo personal: <strong className="font-mono text-slate-700">{plan.historicalAverageMinPerPage} min/pág</strong></span>
              <span className="text-slate-300">·</span>
              <span className="text-indigo-600 font-semibold">Recolocación automática activa</span>
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <button
            type="button"
            onClick={() => {
              playSound.click();
              setIsAdjustModalOpen(true);
            }}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs"
            title="Ajustar páginas y progreso manual por tema"
          >
            <Sliders size={13} />
            <span>Ajustar Páginas</span>
          </button>

          <button
            type="button"
            onClick={() => {
              playSound.click();
              onForceRebalance();
            }}
            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 rounded-xl transition-all"
            title="Recalcular redistribución ahora"
          >
            <RefreshCw size={14} />
          </button>

          {onOpenTopicPicker && (
            <button
              type="button"
              onClick={() => {
                playSound.click();
                onOpenTopicPicker();
              }}
              className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 active:scale-95"
            >
              <span>+ Asignar Temas</span>
            </button>
          )}
        </div>
      </div>

      {/* Main KPI Strip & Progress Bar */}
      <div className="relative z-10 pt-4 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
        {/* Progress Bar & Summary (7 cols) */}
        <div className="md:col-span-7 space-y-2">
          <div className="flex items-baseline justify-between text-xs">
            <span className="font-bold text-slate-700 flex items-center gap-1.5">
              <BookOpen size={13} className="text-indigo-600" />
              <span>Avance Global del Cante</span>
            </span>
            <div className="flex items-center gap-2">
              <span className="font-mono font-black text-slate-900 text-sm">
                {plan.totalCompletedPages} / {plan.totalTargetPages} págs
              </span>
              <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-100">
                {plan.overallProgressPct}%
              </span>
            </div>
          </div>

          {/* Precision Progress Bar */}
          <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200/60 shadow-inner">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500 ease-out",
                plan.overallProgressPct >= 100
                  ? "bg-gradient-to-r from-emerald-500 to-teal-500"
                  : plan.overallProgressPct >= 65
                  ? "bg-gradient-to-r from-indigo-500 to-blue-600"
                  : "bg-gradient-to-r from-amber-500 to-indigo-600"
              )}
              style={{ width: `${Math.min(100, Math.max(0, plan.overallProgressPct))}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
            <span>
              Restan: <strong className="font-mono text-slate-800">{remainingPages} páginas</strong>
            </span>
            <span>
              Tiempo neto estimado: <strong className="font-mono text-slate-800">{formatMinutesToHours(remainingMinutes)}</strong>
            </span>
          </div>
        </div>

        {/* Topic Breakdown Pills (5 cols) */}
        <div className="md:col-span-5 flex flex-wrap gap-1.5 md:justify-end">
          {goals.map((g) => {
            const pct = g.totalPages > 0 ? Math.round((g.completedPages / g.totalPages) * 100) : 100;
            const isDone = g.completedPages >= g.totalPages;
            return (
              <div
                key={g.topicId}
                onClick={() => {
                  startEdit(g);
                  setIsAdjustModalOpen(true);
                }}
                className={cn(
                  "px-2.5 py-1.5 rounded-xl border text-xs flex items-center gap-2 cursor-pointer transition-all hover:scale-102",
                  isDone 
                    ? "bg-emerald-50/70 border-emerald-200 text-emerald-900" 
                    : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-800"
                )}
                title={`Haz clic para ajustar páginas de Tema ${g.topicNumber}`}
              >
                <div className="flex items-center gap-1.5">
                  {isDone ? (
                    <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                  )}
                  <span className="font-black font-serif">T.{g.topicNumber}</span>
                </div>
                <span className="font-mono text-[10px] text-slate-500 font-semibold">
                  {g.completedPages}/{g.totalPages}p
                </span>
                <span className={cn(
                  "text-[9px] font-mono font-bold px-1 rounded-sm",
                  isDone ? "bg-emerald-200/60 text-emerald-800" : "bg-slate-200/70 text-slate-700"
                )}>
                  {pct}%
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ADJUST TOPIC PAGES MODAL */}
      <AnimatePresence>
        {isAdjustModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-3xl p-6 border border-slate-200 shadow-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold">
                    <Sliders size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-black font-serif text-slate-900">
                      Páginas y Progreso de los Temas
                    </h3>
                    <p className="text-xs text-slate-500">
                      Configura las páginas exactas de tu temario y tu avance actual
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsAdjustModalOpen(false);
                    setEditingTopicId(null);
                  }}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-3">
                {goals.map((g) => {
                  const isEditing = editingTopicId === g.topicId;

                  return (
                    <div
                      key={g.topicId}
                      className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-white transition-all space-y-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-black px-2 py-0.5 rounded-md bg-slate-900 text-white">
                              T.{g.topicNumber}
                            </span>
                            <h4 className="text-sm font-bold text-slate-900 line-clamp-1">
                              {g.topicTitle}
                            </h4>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            Ritmo medido: <strong className="font-mono text-slate-700">{g.minutesPerPage} min/pág</strong>
                          </p>
                        </div>

                        {!isEditing && (
                          <button
                            type="button"
                            onClick={() => startEdit(g)}
                            className="px-2.5 py-1 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 text-xs font-bold rounded-lg shadow-2xs"
                          >
                            Modificar
                          </button>
                        )}
                      </div>

                      {isEditing ? (
                        <div className="pt-2 border-t border-slate-200/80 space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-[11px] font-bold text-slate-600 block mb-1">
                                Total Páginas Tema
                              </label>
                              <input
                                type="number"
                                min={1}
                                max={200}
                                value={tempPages}
                                onChange={(e) => setTempPages(parseInt(e.target.value) || 1)}
                                className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-sm font-mono font-bold text-slate-900 focus:outline-indigo-600"
                              />
                            </div>
                            <div>
                              <label className="text-[11px] font-bold text-slate-600 block mb-1">
                                Páginas ya leídas
                              </label>
                              <input
                                type="number"
                                min={0}
                                max={tempPages}
                                value={tempCompleted}
                                onChange={(e) => setTempCompleted(parseInt(e.target.value) || 0)}
                                className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-sm font-mono font-bold text-slate-900 focus:outline-indigo-600"
                              />
                            </div>
                          </div>

                          <div className="flex items-center justify-end gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => setEditingTopicId(null)}
                              className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:text-slate-900"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={() => saveEdit(g.topicId)}
                              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs"
                            >
                              Guardar y Recalcular
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between text-xs text-slate-600 pt-1">
                          <span className="font-mono">
                            {g.completedPages} de {g.totalPages} págs completadas
                          </span>
                          <span className="font-mono font-bold text-slate-800">
                            {g.totalPages > 0 ? Math.round((g.completedPages / g.totalPages) * 100) : 0}%
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => setIsAdjustModalOpen(false)}
                  className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800"
                >
                  Cerrar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
