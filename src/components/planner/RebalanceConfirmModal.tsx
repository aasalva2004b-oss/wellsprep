import React from "react";
import { X, Sparkles, ArrowRight, AlertTriangle, CheckCircle2, ShieldCheck } from "lucide-react";
import { RebalanceProposal, ACTIVITY_CONFIG } from "../../lib/plannerEngine";
import { cn } from "../../lib/utils";
import { playSound } from "../../lib/sound";
import { motion } from "motion/react";

interface RebalanceConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  proposal: RebalanceProposal | null;
  onConfirm: () => void;
}

export const RebalanceConfirmModal: React.FC<RebalanceConfirmModalProps> = ({
  isOpen,
  onClose,
  proposal,
  onConfirm
}) => {
  if (!isOpen || !proposal) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/40 backdrop-blur-xs">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/90 shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold">
              <Sparkles size={18} />
            </div>
            <div>
              <h3 className="text-base font-black font-serif text-slate-900">
                Propuesta de Redistribución Inteligente
              </h3>
              <p className="text-xs text-slate-500">
                Revisión previa obligatoria: confirma o descarta los cambios sugeridos
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

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4">
          <div className="p-3.5 rounded-2xl bg-amber-50/80 border border-amber-200/80 flex items-start gap-2.5 text-xs text-amber-900">
            <AlertTriangle size={17} className="text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Detección de Sobrecarga Semanal</p>
              <p className="text-[11px] text-amber-800 mt-0.5">
                {proposal.explanation}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 font-mono">
              Cambios Propuestos ({proposal.moves.length} reubicaciones)
            </h4>

            {proposal.moves.length === 0 ? (
              <div className="p-6 text-center border border-dashed border-slate-200 rounded-2xl text-xs text-slate-500">
                No se han encontrado reubicaciones viables sin alterar compromisos inamovibles (cantes o refrescos fijados).
              </div>
            ) : (
              <div className="space-y-2">
                {proposal.moves.map((move, idx) => {
                  const cfg = ACTIVITY_CONFIG[move.activityType];
                  return (
                    <div
                      key={`${move.taskId}-${idx}`}
                      className="p-3 rounded-2xl border border-slate-200/80 bg-slate-50/60 hover:bg-white transition-all space-y-1.5 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className={cn("w-2 h-2 rounded-full", cfg.dotClass)} />
                          <span className="font-mono font-bold text-slate-900">
                            T.{move.topicNumber}
                          </span>
                          <span className="font-semibold text-slate-700 truncate max-w-[200px]">
                            {move.topicTitle}
                          </span>
                        </div>
                        <span className="font-mono text-[11px] text-slate-500 font-bold shrink-0">
                          {move.minutesSaved} min
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 text-[11px]">
                        <div className="flex items-center gap-1.5 font-bold">
                          <span className="text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-100">
                            {move.fromDayName}
                          </span>
                          <ArrowRight size={12} className="text-slate-400" />
                          <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                            {move.toDayName}
                          </span>
                        </div>
                        <span className="text-slate-400 italic text-[10px]">
                          {move.reason}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-600 flex items-center gap-2">
            <ShieldCheck size={16} className="text-emerald-600 shrink-0" />
            <span>Los compromisos de cante oficial (Lunes/Jueves) y los refrescos secuenciales se mantienen inalterados.</span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 rounded-xl"
          >
            Cancelar (Mantener Actual)
          </button>
          <button
            type="button"
            disabled={proposal.moves.length === 0}
            onClick={() => {
              playSound.success();
              onConfirm();
              onClose();
            }}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs active:scale-95 transition-all"
          >
            Confirmar y Aplicar Cambios
          </button>
        </div>
      </motion.div>
    </div>
  );
};
