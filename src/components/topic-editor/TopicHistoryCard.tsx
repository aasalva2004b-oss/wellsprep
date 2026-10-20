import React, { useState } from "react";
import { History, Clock, BookOpen, Mic, Target, Trash2, Layers, Edit2, CheckCircle2, RotateCw, AlertTriangle, Sparkles, Check, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn, safeParseDate } from "../../lib/utils";

interface TopicHistoryCardProps {
  sessionsCount: number;
  groupedSessions: any[];
  sessionToDelete: string | null;
  setSessionToDelete: (id: string | null) => void;
  onDeleteSession: (ids: string[]) => void;
  onEditSession?: (session: any) => void;
  onQuickRateDifficulty?: (sessionId: string, difficulty: number, topicId: string) => Promise<void>;
  onMergeSessions?: (
    targetSessionId: string,
    sourceSessionIds: string[],
    mergedData: {
      durationMinutes: number;
      difficulty?: number;
      completesVuelta: boolean;
      type?: string;
      notes?: string;
    }
  ) => Promise<void>;
}

export const TopicHistoryCard: React.FC<TopicHistoryCardProps> = ({
  sessionsCount,
  groupedSessions,
  sessionToDelete,
  setSessionToDelete,
  onDeleteSession,
  onEditSession,
  onQuickRateDifficulty,
  onMergeSessions,
}) => {
  // Merge mode state
  const [isMergeMode, setIsMergeMode] = useState(false);
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([]);
  const [isMerging, setIsMerging] = useState(false);
  const [mergeCompletesVuelta, setMergeCompletesVuelta] = useState(true);
  const [mergeDifficulty, setMergeDifficulty] = useState<number>(5);

  // Extract all individual flat sessions
  const flatSessions: any[] = [];
  groupedSessions.forEach((group) => {
    if (group.subSessions && group.subSessions.length > 0) {
      group.subSessions.forEach((sub: any) => flatSessions.push(sub));
    } else {
      flatSessions.push(group);
    }
  });

  const toggleSelectSession = (id: string) => {
    setSelectedSessionIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleExecuteMerge = async () => {
    if (selectedSessionIds.length < 2 || !onMergeSessions) return;
    try {
      setIsMerging(true);
      const chosenSessions = flatSessions.filter((s) => selectedSessionIds.includes(s.id));
      const totalMinutes = chosenSessions.reduce(
        (acc, s) => acc + (s.durationMinutes || s.durationReal || s.duration || 0),
        0
      );
      const combinedNotes = chosenSessions
        .map((s) => s.notes)
        .filter(Boolean)
        .join(" | ");

      // Target is the first session in the list
      const targetSession = chosenSessions[0];
      const otherIds = selectedSessionIds.filter((id) => id !== targetSession.id);

      await onMergeSessions(targetSession.id, selectedSessionIds, {
        durationMinutes: totalMinutes,
        difficulty: mergeDifficulty || undefined,
        completesVuelta: mergeCompletesVuelta,
        type: targetSession.type || "repaso",
        notes: combinedNotes ? `[Fusión]: ${combinedNotes}` : `Sesión unificada de ${chosenSessions.length} partes`,
      });

      setSelectedSessionIds([]);
      setIsMergeMode(false);
    } catch (e) {
      console.error(e);
    } finally {
      setIsMerging(false);
    }
  };

  const renderItem = (subSession: any, isSubItem = false, parentSession?: any) => {
    const isRefresco = subSession.type === "refresco";
    const isEstudio = subSession.type === "estudio_inicial" || subSession.type === "primer_estudio";
    const isCanto = subSession.type === "canto";
    const isSimulacro = subSession.type === "simulacro";
    const isUnrated = !subSession.difficulty || subSession.difficulty === 0;
    const isSelected = selectedSessionIds.includes(subSession.id);
    const isAero = subSession.source === "aerofocus" || subSession.source === "aerofocus_approved";

    return (
      <div
        key={subSession.id}
        className={cn(
          "relative group transition-all flex flex-col gap-2.5 p-3.5 sm:p-4 rounded-xl border",
          isSelected
            ? "bg-indigo-50/70 border-indigo-400 ring-2 ring-indigo-400/20"
            : isSubItem
            ? "bg-slate-50/60 border-slate-200/60"
            : "bg-white hover:border-slate-300 border-slate-200/80 shadow-xs"
        )}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* Merge Checkbox in merge mode */}
            {isMergeMode && (
              <button
                type="button"
                onClick={() => toggleSelectSession(subSession.id)}
                className={cn(
                  "w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors",
                  isSelected
                    ? "bg-indigo-600 border-indigo-600 text-white"
                    : "bg-white border-slate-300 hover:border-slate-400"
                )}
              >
                {isSelected && <Check size={13} strokeWidth={3} />}
              </button>
            )}

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
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="font-black text-slate-900 capitalize text-xs">
                  {subSession.type?.replace("_", " ") || "Repaso"}
                </h4>

                {/* Badge: Completa Vuelta vs Sesión Parcial */}
                {subSession.completesVuelta === true ? (
                  <span className="text-[9px] font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/60 flex items-center gap-1 font-mono">
                    <CheckCircle2 size={10} className="text-emerald-600" />
                    Vuelta Completa
                  </span>
                ) : subSession.completesVuelta === false ? (
                  <span className="text-[9px] font-black text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200 flex items-center gap-1 font-mono">
                    Sesión Parcial
                  </span>
                ) : null}

                {/* AeroFocus badge */}
                {isAero && (
                  <span className="text-[9px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200/50 flex items-center gap-0.5">
                    <Sparkles size={9} />
                    AeroFocus
                  </span>
                )}

                {/* Canto Grade */}
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
                <span className="font-bold text-slate-700">
                  {subSession.durationMinutes || subSession.durationReal || subSession.duration || 0} min
                </span>

                {/* Difficulty display or tag */}
                {subSession.difficulty ? (
                  <>
                    <span>•</span>
                    <span className={cn(
                      "font-bold px-1.5 py-0.2 rounded",
                      subSession.difficulty <= 3 ? "text-emerald-700 bg-emerald-50" :
                      subSession.difficulty <= 6 ? "text-amber-700 bg-amber-50" :
                      "text-rose-700 bg-rose-50"
                    )}>
                      Dif. {subSession.difficulty}/10
                    </span>
                  </>
                ) : (
                  <>
                    <span>•</span>
                    <span className="text-amber-600 font-bold bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200/50">
                      Sin calificar
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Action buttons: Edit & Delete */}
          <div className="flex items-center justify-end gap-1 shrink-0">
            {onEditSession && (
              <button
                onClick={() => onEditSession(subSession)}
                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors active:scale-95"
                title="Editar / Personalizar sesión"
              >
                <Edit2 size={14} />
              </button>
            )}

            {!isSubItem && (
              <button
                onClick={() => setSessionToDelete(subSession.id)}
                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors active:scale-95"
                title="Eliminar sesión"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>

        {/* QUICK RATING BAR for unrated sessions (e.g. newly synced from AeroFocus) */}
        {isUnrated && onQuickRateDifficulty && (
          <div className="mt-1 p-2 bg-amber-50/70 border border-amber-200/70 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="text-[11px] font-black text-amber-900 flex items-center gap-1">
              <Sparkles size={12} className="text-amber-600 shrink-0" />
              ¿Qué tal fue este repaso? Califica dificultad:
            </span>
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => onQuickRateDifficulty(subSession.id, num, subSession.topicId)}
                  className="w-6 h-6 rounded-md bg-white hover:bg-amber-500 hover:text-white border border-amber-200 text-[10px] font-mono font-black text-slate-700 transition-colors shadow-2xs active:scale-95"
                  title={`Asignar dificultad ${num}/10`}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Notes / Mistakes if any */}
        {(subSession.notes || subSession.mistakes) && (
          <div className="text-[11px] font-medium text-slate-600 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100 max-w-full">
            {subSession.notes && <p className="italic">"{subSession.notes}"</p>}
            {subSession.mistakes && (
              <p className="text-rose-600 font-bold mt-0.5">Fallos: {subSession.mistakes}</p>
            )}
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
      <div className="flex items-center justify-between mb-4 pb-2.5 border-b border-slate-100 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <History size={15} className="text-slate-600" />
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-wide">
            Historial de Sesiones del Tema
          </h3>
          <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full font-mono tabular-nums">
            {sessionsCount} {sessionsCount === 1 ? "registro" : "registros"}
          </span>
        </div>

        {/* Action: Toggle Fusión de Sesiones */}
        {flatSessions.length >= 2 && onMergeSessions && (
          <button
            type="button"
            onClick={() => {
              setIsMergeMode(!isMergeMode);
              setSelectedSessionIds([]);
            }}
            className={cn(
              "px-3 py-1 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5",
              isMergeMode
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
            )}
          >
            <Layers size={13} className={isMergeMode ? "text-indigo-300" : "text-indigo-600"} />
            <span>{isMergeMode ? "Cancelar Fusión" : "Unificar Repasos Partidos"}</span>
          </button>
        )}
      </div>

      {/* Floating Toolbar when merging sessions */}
      <AnimatePresence>
        {isMergeMode && selectedSessionIds.length >= 2 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-4 p-4 bg-indigo-50 border border-indigo-200 rounded-2xl space-y-3"
          >
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-black text-indigo-950">
                  Unificar {selectedSessionIds.length} sesiones seleccionadas en 1 sola
                </h4>
                <p className="text-[11px] text-indigo-700">
                  Se sumarán los minutos de estudio y se consolidarán las notas.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSessionIds([])}
                className="text-xs text-indigo-600 hover:text-indigo-900 font-bold"
              >
                Limpiar selección
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="space-y-1">
                <label className="text-[11px] font-black uppercase tracking-wider text-indigo-950">
                  ¿La sesión unificada completa vuelta?
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setMergeCompletesVuelta(true)}
                    className={cn(
                      "px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1",
                      mergeCompletesVuelta
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : "bg-white text-slate-600 border-slate-200"
                    )}
                  >
                    <CheckCircle2 size={13} />
                    <span>Sí (1 Vuelta)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMergeCompletesVuelta(false)}
                    className={cn(
                      "px-3 py-1.5 rounded-xl text-xs font-bold border transition-all",
                      !mergeCompletesVuelta
                        ? "bg-slate-800 text-white border-slate-800"
                        : "bg-white text-slate-600 border-slate-200"
                    )}
                  >
                    <span>No (Parcial)</span>
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-black uppercase tracking-wider text-indigo-950">
                  Dificultad Global (1 - 10): <span className="font-mono">{mergeDifficulty}/10</span>
                </label>
                <div className="flex gap-1 overflow-x-auto no-scrollbar">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setMergeDifficulty(num)}
                      className={cn(
                        "w-6 h-6 rounded-md text-[10px] font-mono font-black border transition-colors",
                        mergeDifficulty === num
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"
                      )}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={handleExecuteMerge}
                disabled={isMerging}
                className="px-4 py-2 rounded-xl text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm flex items-center gap-1.5 transition-all disabled:opacity-50"
              >
                <Layers size={13} />
                <span>{isMerging ? "Fusionando..." : "Confirmar y Unificar Sesiones"}</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
