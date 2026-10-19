import React, { useState } from "react";
import { PlusCircle, Sparkles, Check } from "lucide-react";
import { cn, safeParseDate } from "../../lib/utils";

interface TopicLogSessionCardProps {
  topicCycle: {
    phase: string;
    phaseLabel: string;
    phaseBadgeClass: string;
    nextActionTitle: string;
    refrescosCount: number;
    refrescoDayLabel: string;
  };
  logType: "estudio_inicial" | "repaso" | "refresco" | "canto" | "simulacro";
  setLogType: (val: "estudio_inicial" | "repaso" | "refresco" | "canto" | "simulacro") => void;
  logDate: string;
  setLogDate: (val: string) => void;
  logDurationHours: string;
  setLogDurationHours: (val: string) => void;
  logDurationMinutes: string;
  setLogDurationMinutes: (val: string) => void;
  logDurationSeconds: string;
  setLogDurationSeconds: (val: string) => void;
  logDifficulty: number | "";
  setLogDifficulty: (val: number | "") => void;
  logCompletesVuelta: boolean;
  setLogCompletesVuelta: (val: boolean) => void;
  logNotes: string;
  setLogNotes: (val: string) => void;
  logMistakes: string;
  setLogMistakes: (val: string) => void;
  logCantoGrade: number | "";
  setLogCantoGrade: (val: number | "") => void;
  futureNextReviewDate: string | null;
  isSavingSession: boolean;
  saveSuccess: boolean;
  onAddSession: () => Promise<void>;
}

export const TopicLogSessionCard: React.FC<TopicLogSessionCardProps> = ({
  topicCycle,
  logType,
  setLogType,
  logDate,
  setLogDate,
  logDurationHours,
  setLogDurationHours,
  logDurationMinutes,
  setLogDurationMinutes,
  logDurationSeconds,
  setLogDurationSeconds,
  logDifficulty,
  setLogDifficulty,
  logCompletesVuelta,
  setLogCompletesVuelta,
  logNotes,
  setLogNotes,
  logMistakes,
  setLogMistakes,
  logCantoGrade,
  setLogCantoGrade,
  futureNextReviewDate,
  isSavingSession,
  saveSuccess,
  onAddSession,
}) => {
  const [hasManuallyChangedType, setHasManuallyChangedType] = useState(false);

  return (
    <div className="bg-white/95 backdrop-blur-xl rounded-2xl p-4 sm:p-5 shadow-xs border border-slate-200/80">
      <div className="flex items-center justify-between mb-4 pb-2.5 border-b border-slate-100">
        <h3 className="text-xs font-black text-slate-900 flex items-center gap-2 uppercase tracking-wider">
          <PlusCircle size={15} className="text-indigo-600" />
          Registrar Sesión Real
        </h3>
        <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100/80 px-2.5 py-0.5 rounded-full uppercase tracking-wider font-mono">
          Log
        </span>
      </div>

      <div className="space-y-3.5">
        {/* Banner Guía del Método del Preparador */}
        <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/70 flex items-start gap-2.5">
          <div className="p-1.5 rounded-lg bg-amber-100 text-amber-800 shrink-0 mt-0.5">
            <Sparkles size={14} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-1 mb-0.5">
              <span className="text-[10px] font-black uppercase text-amber-900 tracking-wider">
                Método Preparador (Ciclo)
              </span>
              <span className={cn(
                "text-[9px] font-black px-2 py-0.5 rounded-full border",
                topicCycle.phaseBadgeClass
              )}>
                {topicCycle.phaseLabel}
              </span>
            </div>
            <p className="text-xs font-bold text-slate-800">
              Acción recomendada: <span className="text-indigo-900 font-black">{topicCycle.nextActionTitle}</span>
            </p>
            {topicCycle.phase === "en_refrescos" && (
              <div className="flex items-center gap-2 mt-1.5 pt-1.5 border-t border-amber-200/60">
                <span className="text-[10px] text-amber-900 font-black">Fase 3 Refrescos:</span>
                <div className="flex items-center gap-1">
                  {[1, 2, 3].map((s) => (
                    <span
                      key={s}
                      className={cn(
                        "w-4 h-4 rounded-full text-[9px] font-black font-mono flex items-center justify-center",
                        s <= topicCycle.refrescosCount
                          ? "bg-amber-500 text-white"
                          : "bg-amber-200 text-amber-800"
                      )}
                    >
                      {s}
                    </span>
                  ))}
                </div>
                <span className="text-[10px] text-amber-800 font-bold ml-1">
                  {topicCycle.refrescoDayLabel}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Segmented Picker for Session Type */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">
              Tipo de Sesión
            </label>
            {!hasManuallyChangedType && (
              <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                Sugerido por Preparador
              </span>
            )}
          </div>
          <div className="bg-slate-100/90 p-1 rounded-xl grid grid-cols-5 gap-1 border border-slate-200/50">
            {(["estudio_inicial", "repaso", "refresco", "canto", "simulacro"] as const).map((t) => {
              const labels: Record<string, string> = {
                estudio_inicial: "Estudio",
                repaso: "Repaso",
                refresco: "Refresco",
                canto: "Cante",
                simulacro: "Simulacro",
              };
              const isSelected = logType === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setLogType(t);
                    setHasManuallyChangedType(true);
                  }}
                  className={cn(
                    "py-1.5 px-1 text-[10px] font-black rounded-lg transition-all text-center uppercase tracking-tight",
                    isSelected
                      ? "bg-white text-slate-900 shadow-xs border border-slate-200/60"
                      : "text-slate-500 hover:text-slate-900"
                  )}
                >
                  {labels[t]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Date and Duration Grid */}
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">
              Fecha
            </label>
            <input
              type="date"
              value={logDate}
              onChange={(e) => setLogDate(e.target.value)}
              className="w-full bg-slate-50/90 border border-slate-200/80 text-slate-800 text-xs font-bold font-mono tabular-nums rounded-xl px-2.5 py-2 outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-800 transition-all"
            />
          </div>

          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">
              Duración
            </label>
            <div className="flex gap-1.5">
              <div className="relative flex-1">
                <input
                  type="number"
                  placeholder="0"
                  value={logDurationHours}
                  onChange={(e) => setLogDurationHours(e.target.value)}
                  className="w-full bg-slate-50/90 border border-slate-200/80 text-slate-800 text-xs font-black font-mono tabular-nums rounded-xl py-2 pl-1.5 pr-4 text-center outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-800 transition-all"
                />
                <span className="absolute right-1 top-2 text-[9px] font-bold text-slate-400">h</span>
              </div>
              <div className="relative flex-1">
                <input
                  type="number"
                  placeholder="0"
                  value={logDurationMinutes}
                  onChange={(e) => setLogDurationMinutes(e.target.value)}
                  className="w-full bg-slate-50/90 border border-slate-200/80 text-slate-800 text-xs font-black font-mono tabular-nums rounded-xl py-2 pl-1.5 pr-4 text-center outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-800 transition-all"
                />
                <span className="absolute right-1 top-2 text-[9px] font-bold text-slate-400">m</span>
              </div>
              {(logType === "canto" || logType === "simulacro") && (
                <div className="relative flex-1">
                  <input
                    type="number"
                    placeholder="0"
                    value={logDurationSeconds}
                    onChange={(e) => setLogDurationSeconds(e.target.value)}
                    className="w-full bg-slate-50/90 border border-slate-200/80 text-slate-800 text-xs font-black font-mono tabular-nums rounded-xl py-2 pl-1.5 pr-4 text-center outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-800 transition-all"
                  />
                  <span className="absolute right-1 top-2 text-[9px] font-bold text-slate-400">s</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Dificultad Percibida */}
        {(logType === "estudio_inicial" || logType === "repaso" || logType === "refresco") && (
          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5 flex items-center justify-between">
              <span>Dificultad Percibida (1-10)</span>
              <span className="text-slate-400 font-bold lowercase">
                {logDifficulty ? `Nivel ${logDifficulty}` : "Opcional"}
              </span>
            </label>
            <div className="bg-slate-100/90 p-1 rounded-xl flex gap-1 border border-slate-200/50">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((d) => {
                const isActive = logDifficulty === d;
                let activeClass = "bg-white text-slate-900 shadow-xs border border-slate-200/60";
                if (isActive) {
                  if (d <= 3) activeClass = "bg-emerald-600 text-white shadow-xs border-transparent";
                  else if (d <= 6) activeClass = "bg-amber-500 text-white shadow-xs border-transparent";
                  else activeClass = "bg-rose-600 text-white shadow-xs border-transparent";
                }
                return (
                  <button
                    type="button"
                    key={d}
                    onClick={() => setLogDifficulty(isActive ? "" : d)}
                    className={cn(
                      "flex-1 py-1 rounded-lg font-black font-mono tabular-nums text-xs transition-all",
                      isActive ? activeClass : "text-slate-400 hover:text-slate-700"
                    )}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Calificación de Cante */}
        {(logType === "canto" || logType === "simulacro") && (
          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5 flex items-center justify-between">
              <span>Calificación Oral (1-10)</span>
              <span className="text-amber-800 font-bold font-mono tabular-nums">
                {logCantoGrade ? `${logCantoGrade}/10` : "Seleccionar"}
              </span>
            </label>
            <div className="grid grid-cols-10 gap-1 bg-slate-100/90 p-1 rounded-xl border border-slate-200/50">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((d) => {
                const isActive = logCantoGrade === d;
                return (
                  <button
                    type="button"
                    key={d}
                    onClick={() => setLogCantoGrade(isActive ? "" : d)}
                    className={cn(
                      "py-1 rounded-lg font-black font-mono tabular-nums text-xs transition-all",
                      isActive
                        ? d >= 8
                          ? "bg-emerald-600 text-white shadow-xs"
                          : d >= 5
                          ? "bg-indigo-600 text-white shadow-xs"
                          : "bg-rose-500 text-white shadow-xs"
                        : "text-slate-400 hover:text-slate-700"
                    )}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <textarea
            value={logNotes}
            onChange={(e) => setLogNotes(e.target.value)}
            placeholder="Observaciones, dudas o ritmo de estudio..."
            className="w-full bg-slate-50/90 border border-slate-200/80 text-slate-800 text-xs font-medium rounded-xl p-2.5 focus:ring-2 focus:ring-slate-900/10 focus:border-slate-800 outline-none transition-all min-h-[60px] resize-y placeholder:text-slate-400"
          />
        </div>

        {(logType === "canto" || logType === "simulacro") && (
          <div>
            <textarea
              value={logMistakes}
              onChange={(e) => setLogMistakes(e.target.value)}
              placeholder="¿Qué puntos o artículos se fallaron? (Feedback crítico)..."
              className="w-full bg-rose-50/50 border border-rose-200/70 text-slate-800 text-xs font-medium rounded-xl p-2.5 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-400 outline-none transition-all min-h-[50px] resize-y placeholder:text-rose-400"
            />
          </div>
        )}

        {(logType === "estudio_inicial" || logType === "repaso" || logType === "refresco") && (
          <label className="flex items-center gap-3 p-2.5 bg-slate-50/90 border border-slate-200/70 rounded-xl cursor-pointer hover:bg-slate-100/90 transition-colors">
            <div className="flex-1">
              <span className="block text-xs font-black text-slate-800">Completa Vuelta al Tema</span>
              <span className="block text-[10px] font-medium text-slate-500">Avanza el contador oficial de vueltas (+1)</span>
            </div>
            <div className={cn("w-9 h-5 rounded-full flex items-center px-0.5 transition-colors", logCompletesVuelta ? "bg-slate-900" : "bg-slate-300")}>
              <div className={cn("w-4 h-4 bg-white rounded-full transition-transform shadow-xs", logCompletesVuelta ? "translate-x-4" : "translate-x-0")} />
            </div>
            <input type="checkbox" className="hidden" checked={logCompletesVuelta} onChange={(e) => setLogCompletesVuelta(e.target.checked)} />
          </label>
        )}

        {futureNextReviewDate && (
          <div className="p-2.5 bg-indigo-50/70 border border-indigo-100/80 rounded-xl text-[11px] font-bold text-indigo-900 flex items-center gap-2">
            <Sparkles size={13} className="text-indigo-600 shrink-0" />
            <span>
              Próximo repaso proyectado: <strong className="font-black font-mono tabular-nums">{safeParseDate(futureNextReviewDate).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })}</strong>
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={onAddSession}
          disabled={isSavingSession || saveSuccess}
          className={cn(
            "w-full text-white font-black py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-xs text-xs uppercase tracking-wider",
            saveSuccess ? "bg-emerald-600" : "bg-slate-900 hover:bg-slate-800",
            (isSavingSession || saveSuccess) && "pointer-events-none opacity-90"
          )}
        >
          {saveSuccess ? (
            <>
              <Check size={14} className="animate-bounce" />
              <span>¡Sesión Registrada!</span>
            </>
          ) : isSavingSession ? (
            <span>Guardando sesión...</span>
          ) : (
            <span>Registrar Sesión de Estudio</span>
          )}
        </button>
      </div>
    </div>
  );
};
