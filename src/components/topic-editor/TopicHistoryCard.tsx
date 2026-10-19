import React from "react";
import { History, Clock, BookOpen, Mic, Target, Trash2, Layers } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn, safeParseDate } from "../../lib/utils";

interface TopicHistoryCardProps {
  sessionsCount: number;
  groupedSessions: any[];
  sessionToDelete: string | null;
  setSessionToDelete: (id: string | null) => void;
  onDeleteSession: (ids: string[]) => void;
}

export const TopicHistoryCard: React.FC<TopicHistoryCardProps> = ({
  sessionsCount,
  groupedSessions,
  sessionToDelete,
  setSessionToDelete,
  onDeleteSession,
}) => {
  const renderItem = (subSession: any, isSubItem = false, parentSession?: any) => {
    const isRefresco = subSession.type === "refresco";
    const isEstudio = subSession.type === "estudio_inicial";
    const isCanto = subSession.type === "canto";
    const isSimulacro = subSession.type === "simulacro";

    return (
      <div
        key={subSession.id}
        className={cn(
          "relative group transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 sm:p-4 rounded-xl border",
          isSubItem
            ? "bg-slate-50/60 border-slate-200/60"
            : "bg-white hover:border-slate-300 border-slate-200/80 shadow-xs"
        )}
      >
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border",
              isRefresco
                ? "bg-emerald-50 text-emerald-700 border-emerald-200/60"
                : isEstudio
                ? "bg-blue-50 text-blue-700 border-blue-200/60"
                : isCanto
                ? "bg-amber-50 text-amber-700 border-amber-200/60"
                : isSimulacro
                ? "bg-rose-50 text-rose-700 border-rose-200/60"
                : "bg-indigo-50 text-indigo-700 border-indigo-200/60"
            )}
          >
            {isRefresco ? (
              <Clock size={15} />
            ) : isEstudio ? (
              <BookOpen size={15} />
            ) : isCanto ? (
              <Mic size={15} />
            ) : isSimulacro ? (
              <Target size={15} />
            ) : (
              <History size={15} />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-black text-slate-900 capitalize text-xs">
                {subSession.type.replace("_", " ")}
              </h4>
              {subSession.completesVuelta && (
                <span className="text-[9px] font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/50">
                  Vuelta
                </span>
              )}
              {typeof subSession.cantoGrade === "number" && (
                <span className="text-[10px] font-black text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200/50 font-mono tabular-nums">
                  Nota: {subSession.cantoGrade}/10
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 font-semibold text-slate-400 mt-1 text-[11px] font-mono tabular-nums">
              <span>
                {safeParseDate(subSession.date).toLocaleDateString("es-ES", {
                  year: "numeric",
                  month: "short",
                  day: "2-digit",
                })}
              </span>
              <span>•</span>
              <span>{subSession.duration} min</span>
              {subSession.difficulty && (
                <>
                  <span>•</span>
                  <span className="font-bold text-slate-600">Dif. {subSession.difficulty}/10</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Notes / Mistakes if any */}
        {(subSession.notes || subSession.mistakes) && (
          <div className="text-[11px] font-medium text-slate-600 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100 max-w-sm">
            {subSession.notes && <p className="italic">"{subSession.notes}"</p>}
            {subSession.mistakes && (
              <p className="text-rose-600 font-bold mt-0.5">Fallos: {subSession.mistakes}</p>
            )}
          </div>
        )}

        {!isSubItem && (
          <div className="flex items-center justify-end gap-1 shrink-0">
            <button
              onClick={() => setSessionToDelete(subSession.id)}
              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors active:scale-95"
              title="Eliminar sesión"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}

        {/* Inline Delete Confirmation */}
        {!isSubItem && (
          <AnimatePresence>
            {sessionToDelete === subSession.id && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-white/95 backdrop-blur-sm rounded-xl border border-rose-200 flex items-center justify-between px-4 z-10"
              >
                <span className="text-xs font-black text-slate-800">¿Eliminar registro de sesión?</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSessionToDelete(null)}
                    className="px-2.5 py-1 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => onDeleteSession(parentSession?.originalIds || [subSession.id])}
                    className="px-2.5 py-1 text-xs font-black text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors shadow-xs active:scale-95"
                  >
                    Eliminar
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
    );
  };

  return (
    <div className="bg-white/95 backdrop-blur-xl rounded-2xl p-4 sm:p-6 shadow-xs border border-slate-200/80">
      <div className="flex items-center justify-between mb-4 pb-2.5 border-b border-slate-100">
        <h3 className="text-xs font-black text-slate-900 flex items-center gap-2 uppercase tracking-wide">
          <History size={15} className="text-slate-600" />
          Historial de Sesiones del Tema
        </h3>
        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full font-mono tabular-nums">
          {sessionsCount} {sessionsCount === 1 ? "registro" : "registros"}
        </span>
      </div>

      <div className="space-y-2.5">
        {groupedSessions.length === 0 ? (
          <div className="py-10 text-center text-slate-400">
            <History size={28} className="mx-auto mb-2 opacity-25" />
            <p className="text-xs font-bold uppercase tracking-wider">Sin sesiones registradas</p>
          </div>
        ) : (
          groupedSessions.map((session) => {
            if (session.subSessions && session.subSessions.length > 1) {
              return (
                <div
                  key={session.id}
                  className="relative group bg-slate-50/60 border border-slate-200/80 rounded-2xl p-3 shadow-xs"
                >
                  <div className="flex items-center justify-between px-2 pt-1 pb-2.5">
                    <div className="flex items-center gap-2">
                      <Layers size={13} className="text-indigo-600" />
                      <h4 className="text-xs font-black text-indigo-950 uppercase tracking-wider">
                        Ciclo Parcial Acumulado
                      </h4>
                    </div>
                    <div className="flex items-center gap-2.5 font-mono tabular-nums">
                      <span className="text-xs font-bold text-slate-600">
                        {session.duration} min totales
                      </span>
                      <button
                        onClick={() => setSessionToDelete(session.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors active:scale-95"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 relative pl-2">
                    {[...session.subSessions]
                      .reverse()
                      .map((sub) => renderItem(sub, true, session))}
                  </div>

                  <AnimatePresence>
                    {sessionToDelete === session.id && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-white/95 backdrop-blur-sm rounded-2xl border border-rose-200 flex flex-col items-center justify-center z-20"
                      >
                        <span className="text-xs font-black text-slate-800 mb-2">
                          ¿Eliminar este ciclo de {session.subSessions.length} sesiones?
                        </span>
                        <div className="flex items-center gap-2.5">
                          <button
                            onClick={() => setSessionToDelete(null)}
                            className="px-3 py-1 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={() => onDeleteSession(session.originalIds)}
                            className="px-3 py-1 text-xs font-black text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors shadow-xs active:scale-95"
                          >
                            Eliminar Todo
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            }

            return renderItem(session, false);
          })
        )}
      </div>
    </div>
  );
};
