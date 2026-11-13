import React from "react";
import { Clock, BookOpen, Mic, Target, BrainCircuit } from "lucide-react";
import { cn } from "../../lib/utils";
import { EbbinghausAnalysis } from "../../lib/ebbinghaus";

interface TopicVitalsGridProps {
  totalTimeStr: string;
  totalRepasos: number;
  totalCantos: number;
  bestCantoStr: string;
  ebbinghausAnalysis: EbbinghausAnalysis;
}

export const TopicVitalsGrid: React.FC<TopicVitalsGridProps> = ({
  totalTimeStr,
  totalRepasos,
  totalCantos,
  bestCantoStr,
  ebbinghausAnalysis,
}) => {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3.5">
      {/* 1. Inversión Total */}
      <div className="bg-white/95 backdrop-blur-xl rounded-2xl p-3.5 sm:p-5 shadow-xs border border-slate-200/80 flex flex-col justify-between">
        <div className="flex items-center justify-between mb-2 sm:mb-3">
          <span className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-wider">
            Inversión Total
          </span>
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100 shrink-0">
            <Clock size={14} />
          </div>
        </div>
        <div>
          <h4 className="text-xl sm:text-2xl font-black font-mono tabular-nums text-slate-900 tracking-tight">
            {totalTimeStr || "0m"}
          </h4>
          <p className="text-[10px] font-bold text-slate-500 mt-0.5">Tiempo en mesa</p>
        </div>
      </div>

      {/* 2. Repasos */}
      <div className="bg-white/95 backdrop-blur-xl rounded-2xl p-3.5 sm:p-5 shadow-xs border border-slate-200/80 flex flex-col justify-between">
        <div className="flex items-center justify-between mb-2 sm:mb-3">
          <span className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-wider">
            Repasos
          </span>
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 shrink-0">
            <BookOpen size={14} />
          </div>
        </div>
        <div>
          <h4 className="text-xl sm:text-2xl font-black font-mono tabular-nums text-slate-900 tracking-tight">
            {totalRepasos}
          </h4>
          <p className="text-[10px] font-bold text-slate-500 mt-0.5">Ciclos completados</p>
        </div>
      </div>

      {/* 3. Cantos */}
      <div className="bg-white/95 backdrop-blur-xl rounded-2xl p-3.5 sm:p-5 shadow-xs border border-slate-200/80 flex flex-col justify-between">
        <div className="flex items-center justify-between mb-2 sm:mb-3">
          <span className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-wider">
            Cantos
          </span>
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100 shrink-0">
            <Mic size={14} />
          </div>
        </div>
        <div>
          <h4 className="text-xl sm:text-2xl font-black font-mono tabular-nums text-slate-900 tracking-tight">
            {totalCantos}
          </h4>
          <p className="text-[10px] font-bold text-slate-500 mt-0.5">Exposiciones orales</p>
        </div>
      </div>

      {/* 4. Mejor Nota */}
      <div className="bg-white/95 backdrop-blur-xl rounded-2xl p-3.5 sm:p-5 shadow-xs border border-slate-200/80 flex flex-col justify-between">
        <div className="flex items-center justify-between mb-2 sm:mb-3">
          <span className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-wider">
            Mejor Nota
          </span>
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100 shrink-0">
            <Target size={14} />
          </div>
        </div>
        <div>
          <h4 className="text-xl sm:text-2xl font-black font-mono tabular-nums text-slate-900 tracking-tight">
            {bestCantoStr}
          </h4>
          <p className="text-[10px] font-bold text-slate-500 mt-0.5">Récord de cante</p>
        </div>
      </div>

      {/* 5. Retención Ebbinghaus */}
      <div className="bg-white/95 backdrop-blur-xl rounded-2xl p-3.5 sm:p-5 shadow-xs border border-slate-200/80 flex flex-col justify-between">
        <div className="flex items-center justify-between mb-2 sm:mb-3">
          <span className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-wider">
            Estimación
          </span>
          <div
            className={cn(
              "w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center border shrink-0",
              ebbinghausAnalysis.status === "excelente"
                ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                : ebbinghausAnalysis.status === "bueno"
                ? "bg-indigo-50 text-indigo-600 border-indigo-100"
                : ebbinghausAnalysis.status === "atencion"
                ? "bg-amber-50 text-amber-600 border-amber-100"
                : "bg-rose-50 text-rose-600 border-rose-100"
            )}
          >
            <BrainCircuit size={14} />
          </div>
        </div>
        <div>
          <div className="flex items-baseline gap-1.5">
            <h4 className="text-xl sm:text-2xl font-black font-mono tabular-nums text-slate-900 tracking-tight">
              {ebbinghausAnalysis.hasData ? `≈${Math.round(ebbinghausAnalysis.currentRetention)}%` : "—"}
            </h4>
            {ebbinghausAnalysis.hasData && (
              <span
                className={cn(
                  "text-[9px] font-black uppercase px-1.5 py-0.5 rounded",
                  ebbinghausAnalysis.statusBadgeClass
                )}
              >
                {ebbinghausAnalysis.adaptive?.confidence === 'alta' ? 'Conf. alta' : ebbinghausAnalysis.adaptive?.confidence === 'media' ? 'Conf. media' : 'Conf. baja'}
              </span>
            )}
          </div>
          <p className="text-[10px] font-bold text-slate-500 mt-0.5">{ebbinghausAnalysis.adaptive?.target === 'grade_proxy' ? 'Aprobar cante · señal indirecta' : ebbinghausAnalysis.adaptive?.target === 'recall' ? 'Recuerdo sin ayuda · estimado' : 'Supuestos iniciales del modelo'}</p>
        </div>
      </div>
    </div>
  );
};
