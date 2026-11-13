import React, { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, RefreshCw, Sliders, X } from "lucide-react";
import { WeeklyCantePlan, TopicCanteGoal } from "../../lib/weeklyCanteEngine";
import { cn, formatMinutesToHours } from "../../lib/utils";
import { playSound } from "../../lib/sound";
import { DS } from "../../lib/designSystem";
import { motion, AnimatePresence } from "motion/react";

interface CanteGoalCockpitProps {
  plan: WeeklyCantePlan;
  onUpdateTopicPages: (topicId: string, newTotalPages: number) => void;
  onForceRebalance: () => void;
  onOpenTopicPicker?: () => void;
  coverageOnly?: boolean;
}

export const CanteGoalCockpit: React.FC<CanteGoalCockpitProps> = ({
  plan,
  onUpdateTopicPages,
  onForceRebalance,
  onOpenTopicPicker,
  coverageOnly = false,
}) => {
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
  const [tempPages, setTempPages] = useState<string>("");
  const dialogId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  const goals: TopicCanteGoal[] = Object.values(plan.topicGoals || {});
  const remainingPages = plan.overallProgressKnown ? Math.max(0, plan.totalTargetPages - plan.totalCompletedPages) : null;
  const remainingMinutes = remainingPages === null || goals.some(goal => goal.remainingPages === null || (goal.remainingPages > 0 && goal.minutesPerPage === null))
    ? null
    : Math.round(goals.reduce((sum, goal) => sum + (goal.remainingPages || 0) * (goal.minutesPerPage ?? 0), 0));

  const startEdit = (goal: TopicCanteGoal) => {
    setEditingTopicId(goal.topicId);
    setTempPages(goal.totalPages > 0 ? String(goal.totalPages) : "");
  };

  const saveEdit = (topicId: string) => {
    const pages = Number(tempPages.replace(",", "."));
    if (!Number.isFinite(pages) || pages <= 0) return;
    onUpdateTopicPages(topicId, pages);
    setEditingTopicId(null);
    playSound.success();
  };

  const closeModal = () => {
    setIsAdjustModalOpen(false);
    setEditingTopicId(null);
  };

  useEffect(() => {
    if (!isAdjustModalOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = (): HTMLElement[] => {
      const dialog = dialogRef.current;
      return dialog ? Array.from(dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex="0"]',
      )) : [];
    };
    focusable()[0]?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeModal();
      }
      if (event.key !== 'Tab') return;
      const controls = focusable();
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus();
    };
  }, [isAdjustModalOpen]);

  const getStatusBadge = () => {
    if (coverageOnly) return { label: plan.overallProgressKnown ? "Estudio inicial registrado" : "Cobertura pendiente de medir", bg: "bg-slate-50 text-slate-700 border-slate-200" };
    switch (plan.status) {
      case "ahead":
        return { label: "Estudio inicial completo", bg: "bg-emerald-50 text-emerald-800 border-emerald-200" };
      case "on_track":
        return { label: "Estudio en curso", bg: "bg-blue-50 text-blue-800 border-blue-200" };
      case "behind":
        return { label: "Estudio pendiente", bg: "bg-amber-50 text-amber-800 border-amber-200" };
      case "urgent":
        return { label: "Estudio pendiente próximo al cante", bg: "bg-rose-50 text-rose-800 border-rose-200" };
      case "needs_evidence":
        return { label: "Cobertura pendiente de medir", bg: "bg-slate-50 text-slate-700 border-slate-200" };
      default:
        return { label: "Estudio planificado", bg: "bg-slate-50 text-slate-700 border-slate-200" };
    }
  };

  const statusBadge = getStatusBadge();
  const rebalanceLabel = coverageOnly ? "Generar una propuesta de planificación por cantes" : "Recalcular redistribución ahora";

  return (
    <section aria-labelledby={`${dialogId}-heading`} className={cn(DS.card, "p-4 sm:p-5 mb-4")}>
      <div className={cn(DS.sectionHeader, "items-start")}>
        <div className="min-w-0">
          <h2 id={`${dialogId}-heading`} className={cn(DS.titleSection, "text-xl sm:text-xl")}>
            Preparación del cante · {plan.targetCanteDay === "lunes" ? "Lunes" : "Jueves"}
          </h2>
          <p className="mt-1 text-sm text-[var(--wp-muted)]">
            {goals.length} temas asignados · {plan.daysRemaining === 0 ? "Cante hoy" : `Faltan ${plan.daysRemaining} ${plan.daysRemaining === 1 ? "día" : "días"}`}
          </p>
        </div>
        {onOpenTopicPicker && <button type="button" onClick={() => { playSound.click(); onOpenTopicPicker(); }} className={cn(DS.btnSecondary, "min-h-[44px] text-sm")}>
          Asignar temas
        </button>}
      </div>

      <div className="mt-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <p className="text-sm font-medium text-[var(--wp-text)]">
            {plan.overallProgressKnown ? `${plan.totalCompletedPages} de ${plan.totalTargetPages} páginas de estudio inicial` : "Cobertura de estudio pendiente de medir"}
          </p>
          {plan.overallProgressKnown && <span className="text-sm font-semibold font-mono text-[var(--wp-text)]">{plan.overallProgressPct}%</span>}
        </div>
        {plan.overallProgressKnown && <div role="progressbar" aria-label="Cobertura de estudio inicial de los temas asignados" aria-valuemin={0} aria-valuemax={100} aria-valuenow={plan.overallProgressPct} className="h-2 rounded-full bg-[var(--wp-surface-muted)] overflow-hidden">
          <div className="h-full rounded-full bg-indigo-600 transition-[width]" style={{ width: `${Math.min(100, Math.max(0, plan.overallProgressPct))}%` }} />
        </div>}
        <p className="text-sm text-[var(--wp-muted)]">
          {remainingPages === null ? "Páginas pendientes: sin medir" : `${remainingPages} páginas pendientes`}
          {" · "}{remainingMinutes === null ? "Tiempo: sin estimación suficiente" : `${formatMinutesToHours(remainingMinutes)} de tiempo estimado`}
        </p>
      </div>

      <details className="mt-3 border-t border-[var(--wp-border)]">
        <summary className="min-h-[44px] flex cursor-pointer items-center justify-between gap-3 py-2 text-sm font-medium text-[var(--wp-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
          Detalle y páginas de los temas <ChevronDown size={16} aria-hidden="true" />
        </summary>
        <div className="pb-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("rounded-full border px-2 py-1 text-xs font-medium", statusBadge.bg)}>{statusBadge.label}</span>
            <p className="text-sm text-[var(--wp-muted)]">Ritmo orientativo: {plan.historicalAverageMinPerPage === null ? "sin evidencia suficiente" : `${plan.historicalAverageMinPerPage} min/pág`}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {goals.map(goal => <button key={goal.topicId} type="button" onClick={() => { startEdit(goal); setIsAdjustModalOpen(true); }} aria-label={`Ajustar páginas de Tema ${goal.topicNumber}`} className={cn(DS.btnSecondary, "min-h-[44px] justify-start text-left text-sm font-medium")}>
              <span className="font-semibold">T.{goal.topicNumber}</span>
              <span className="font-mono text-xs text-[var(--wp-muted)]">{goal.hasKnownProgress ? `${goal.completedPages}/${goal.totalPages}p` : `${goal.totalPages || "?"}p · sin medir`}</span>
            </button>)}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => { playSound.click(); setIsAdjustModalOpen(true); }} title="Ajustar la extensión del tema" className={cn(DS.btnSecondary, "min-h-[44px] text-sm")}><Sliders size={16} aria-hidden="true" /> Ajustar páginas</button>
            <button type="button" onClick={() => { playSound.click(); onForceRebalance(); }} title={rebalanceLabel} aria-label={rebalanceLabel} className={DS.iconButton}><RefreshCw size={17} aria-hidden="true" /></button>
          </div>
        </div>
      </details>

      <AnimatePresence>
        {isAdjustModalOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <motion.div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={`${dialogId}-title`} aria-describedby={`${dialogId}-description`} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }} className={cn(DS.modalContainer, "w-full max-w-lg max-h-[85vh] overflow-y-auto p-4 sm:p-5")}>
            <div className="flex items-start justify-between gap-3 border-b border-[var(--wp-border)] pb-4">
              <div><h3 id={`${dialogId}-title`} className={cn(DS.titleSection, "text-xl sm:text-xl")}>Páginas del tema</h3><p id={`${dialogId}-description`} className="mt-1 text-sm text-[var(--wp-muted)]">Configura la extensión. El progreso procede de las páginas registradas en sesiones reales.</p></div>
              <button type="button" onClick={closeModal} aria-label="Cerrar ajuste de páginas" className={cn(DS.iconButton, "shrink-0")}><X size={20} aria-hidden="true" /></button>
            </div>
            <div className="divide-y divide-slate-200">
              {goals.map(goal => <div key={goal.topicId} className="py-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><h4 className="text-base font-semibold text-[var(--wp-text)]"><span className="font-mono">T.{goal.topicNumber}</span> · {goal.topicTitle}</h4><p className="mt-1 text-sm text-[var(--wp-muted)]">Ritmo orientativo: {goal.minutesPerPage === null ? "sin evidencia suficiente" : `${goal.minutesPerPage} min/pág`}</p></div>
                  {editingTopicId !== goal.topicId && <button type="button" onClick={() => startEdit(goal)} aria-label={`Modificar páginas de Tema ${goal.topicNumber}`} className={cn(DS.btnSecondary, "min-h-[44px] shrink-0 text-sm")}>Modificar</button>}
                </div>
                {editingTopicId === goal.topicId ? <div className="space-y-3">
                  <label htmlFor={`${dialogId}-pages`} className="block text-sm font-medium text-[var(--wp-text)]">Páginas totales del tema</label>
                  <input id={`${dialogId}-pages`} type="number" min={1} step="0.5" aria-label="Páginas totales del tema en Preparador" value={tempPages} onChange={event => setTempPages(event.target.value)} className={cn(DS.field, "font-mono")} />
                  <div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setEditingTopicId(null)} className={cn(DS.btnSecondary, "min-h-[44px] text-sm")}>Cancelar</button><button type="button" onClick={() => saveEdit(goal.topicId)} className={cn(DS.btnPrimary, "min-h-[44px] text-sm")}>Guardar extensión</button></div>
                </div> : <p className="text-sm text-[var(--wp-muted)]">{goal.hasKnownProgress ? `${goal.completedPages} de ${goal.totalPages} páginas estudiadas · ${goal.remainingPages} pendientes` : "Estudio inicial: cobertura pendiente de medir"}</p>}
              </div>)}
            </div>
            <div className="flex justify-end border-t border-[var(--wp-border)] pt-4"><button type="button" onClick={closeModal} className={cn(DS.btnPrimary, "min-h-[44px] text-sm")}>Cerrar</button></div>
          </motion.div>
        </div>}
      </AnimatePresence>
    </section>
  );
};
