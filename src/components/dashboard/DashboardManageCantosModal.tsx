import React, { useState } from "react";
import { Mic, Search, X, AlertTriangle, Trash2 } from "lucide-react";
import { cn } from "../../lib/utils";

interface DashboardManageCantosModalProps {
  isOpen: boolean;
  onClose: () => void;
  allCantos: any[];
  onDeleteCanto: (topicId: string, sessionId: string) => Promise<void>;
  deletingSessionId: string | null;
}

export const DashboardManageCantosModal: React.FC<DashboardManageCantosModalProps> = ({
  isOpen,
  onClose,
  allCantos,
  onDeleteCanto,
  deletingSessionId,
}) => {
  const [cantoSearchTerm, setCantoSearchTerm] = useState("");

  if (!isOpen) return null;

  const term = cantoSearchTerm.toLowerCase().trim();
  const filtered = allCantos
    .slice()
    .reverse()
    .filter((c) => {
      if (!term) return true;
      return (
        c.topicNumber?.toString().includes(term) ||
        (c.topicTitle && c.topicTitle.toLowerCase().includes(term)) ||
        (c.date && c.date.includes(term)) ||
        (c.mistakes && c.mistakes.toLowerCase().includes(term))
      );
    });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[85vh] shadow-2xl border border-slate-200/80 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-5 py-4 sm:px-6 sm:py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-fuchsia-100 text-fuchsia-600 flex items-center justify-center">
              <Mic size={18} />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-slate-900">
                Historial y Depuración de Cantos
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Revisa los cantes de tu oposición y elimina registros duplicados
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Search & Actions Bar */}
        <div className="px-5 py-2.5 sm:px-6 sm:py-3 border-b border-slate-100 bg-white flex items-center justify-between gap-4">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={cantoSearchTerm}
              onChange={(e) => setCantoSearchTerm(e.target.value)}
              placeholder="Buscar por tema (ej. 7 o 17), título o fecha..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/20"
            />
            {cantoSearchTerm && (
              <button
                onClick={() => setCantoSearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
              >
                <X size={13} />
              </button>
            )}
          </div>
          <div className="text-xs font-bold text-slate-400 whitespace-nowrap font-mono tabular-nums">
            Total: {allCantos.length} cantes
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-2.5">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Mic size={28} className="mx-auto mb-2 opacity-30 text-fuchsia-500" />
              <p className="text-xs font-bold text-slate-600">No se han encontrado cantes</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Prueba con otro término de búsqueda.</p>
            </div>
          ) : (
            filtered.map((c) => {
              const isPotentialDuplicate =
                allCantos.filter(
                  (other) =>
                    other.id !== c.id &&
                    other.topicId === c.topicId &&
                    other.date === c.date
                ).length > 0;

              const totalSec = c.durationMinutes * 60 + c.durationSeconds;
              const isOpt = totalSec >= 660 && totalSec <= 820;
              const isExc = totalSec > 820;

              return (
                <div
                  key={c.id}
                  className={cn(
                    "p-3 sm:p-3.5 rounded-xl border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5",
                    isPotentialDuplicate
                      ? "bg-amber-50/40 border-amber-200/80"
                      : "bg-slate-50/60 border-slate-200/70"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-black text-slate-900 text-xs px-2 py-0.5 rounded-md bg-white border border-slate-200 font-mono tabular-nums">
                        Tema {c.topicNumber}
                      </span>
                      <span className="text-xs font-bold text-slate-500 font-mono tabular-nums">
                        {c.date}
                      </span>
                      {isPotentialDuplicate && (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
                          <AlertTriangle size={10} />
                          Mismo tema y fecha (posible duplicado)
                        </span>
                      )}
                    </div>
                    <h4 className="text-xs font-bold text-slate-800 truncate" title={c.topicTitle}>
                      {c.topicTitle}
                    </h4>
                    {c.mistakes && (
                      <p className="text-[11px] text-slate-500 mt-1 italic line-clamp-1 bg-white/60 px-2 py-0.5 rounded border border-slate-100">
                        "{c.mistakes}"
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                    <div className="text-right font-mono tabular-nums">
                      <span className="text-xs font-black text-slate-900 block">
                        {c.durationMinutes}m {c.durationSeconds > 0 ? `${c.durationSeconds}s` : ""}
                      </span>
                      <span
                        className={cn(
                          "text-[10px] font-bold block",
                          isOpt ? "text-emerald-600 font-black" : isExc ? "text-rose-600" : "text-amber-600"
                        )}
                      >
                        {isOpt ? "11–13:40m" : isExc ? ">13:40 Exceso" : "<11m Breve"}
                      </span>
                    </div>

                    <div className="text-center min-w-[65px] font-mono tabular-nums">
                      {c.grade !== null ? (
                        <div>
                          <span
                            className={cn(
                              "text-xs font-black px-2 py-0.5 rounded-lg block",
                              c.grade >= 8
                                ? "bg-emerald-100 text-emerald-800"
                                : c.grade >= 5
                                ? "bg-blue-100 text-blue-800"
                                : "bg-rose-100 text-rose-800"
                            )}
                          >
                            {c.grade.toFixed(1)}
                          </span>
                          <span
                            className={cn(
                              "text-[9px] font-black mt-0.5 block",
                              c.grade >= 5 && isOpt ? "text-emerald-700" : "text-rose-600"
                            )}
                          >
                            {c.grade >= 5 && isOpt ? "Aprobado" : "Suspenso"}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-400 font-bold italic block">Sin nota</span>
                      )}
                    </div>

                    <button
                      onClick={() => onDeleteCanto(c.topicId, c.id)}
                      disabled={deletingSessionId === c.id}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all disabled:opacity-50 active:scale-95"
                      title="Eliminar este cante"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black transition-all active:scale-95"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
