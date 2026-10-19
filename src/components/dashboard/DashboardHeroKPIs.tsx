import React from "react";
import { Flame, TrendingUp, Layers, Clock, Mic } from "lucide-react";

interface DashboardHeroKPIsProps {
  currentStreak: number;
  totalTopicsStudied: number;
  totalTopicsCount: number;
  globalCompletion: number;
  totalTimeHours: number;
  avgRecentCanto: number;
}

export const DashboardHeroKPIs: React.FC<DashboardHeroKPIsProps> = ({
  currentStreak,
  totalTopicsStudied,
  totalTopicsCount,
  globalCompletion,
  totalTimeHours,
  avgRecentCanto,
}) => {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4 lg:gap-5">
      {/* 1. Consistencia / Racha */}
      <div className="bg-white/95 backdrop-blur-xl rounded-2xl p-3.5 sm:p-5 shadow-xs border border-slate-200/80 flex flex-col justify-between relative overflow-hidden group hover:border-slate-300 transition-all">
        <div className="flex items-center gap-2 mb-2 sm:mb-4 relative z-10">
          <div className="bg-emerald-50 text-emerald-600 p-2 rounded-xl border border-emerald-200/60 shrink-0">
            <Flame size={16} strokeWidth={2.5} />
          </div>
          <span className="text-[10px] sm:text-[11px] font-black text-slate-400 uppercase tracking-wider truncate">
            Consistencia
          </span>
        </div>
        <div className="mt-auto relative z-10">
          <div className="flex items-baseline gap-1 font-mono tabular-nums">
            <h3 className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight">
              {currentStreak}
            </h3>
            <span className="text-xs sm:text-sm text-slate-400 font-bold">días</span>
          </div>
          <p className="text-[11px] font-bold text-emerald-600 mt-1 flex items-center gap-1 font-mono">
            <TrendingUp size={12} strokeWidth={2.5} /> Racha activa
          </p>
        </div>
      </div>

      {/* 2. Cobertura Temario */}
      <div className="bg-white/95 backdrop-blur-xl rounded-2xl p-3.5 sm:p-5 shadow-xs border border-slate-200/80 flex flex-col justify-between relative overflow-hidden group hover:border-slate-300 transition-all">
        <div className="flex items-center gap-2 mb-2 sm:mb-4 relative z-10">
          <div className="bg-indigo-50 text-indigo-600 p-2 rounded-xl border border-indigo-200/60 shrink-0">
            <Layers size={16} strokeWidth={2.5} />
          </div>
          <span className="text-[10px] sm:text-[11px] font-black text-slate-400 uppercase tracking-wider truncate">
            Cobertura
          </span>
        </div>
        <div className="mt-auto relative z-10">
          <div className="flex items-baseline gap-1 font-mono tabular-nums">
            <h3 className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight">
              {totalTopicsStudied}
            </h3>
            <span className="text-xs sm:text-sm text-slate-400 font-bold">
              / {totalTopicsCount}
            </span>
          </div>
          <div className="w-full h-1.5 bg-slate-100 rounded-full mt-2 overflow-hidden">
            <div
              className="h-full bg-indigo-600 rounded-full transition-all duration-700"
              style={{ width: `${globalCompletion}%` }}
            />
          </div>
        </div>
      </div>

      {/* 3. Horas de Vuelo */}
      <div className="bg-white/95 backdrop-blur-xl rounded-2xl p-3.5 sm:p-5 shadow-xs border border-slate-200/80 flex flex-col justify-between relative overflow-hidden group hover:border-slate-300 transition-all">
        <div className="flex items-center gap-2 mb-2 sm:mb-4 relative z-10">
          <div className="bg-blue-50 text-blue-600 p-2 rounded-xl border border-blue-200/60 shrink-0">
            <Clock size={16} strokeWidth={2.5} />
          </div>
          <span className="text-[10px] sm:text-[11px] font-black text-slate-400 uppercase tracking-wider truncate">
            Horas Vuelo
          </span>
        </div>
        <div className="mt-auto relative z-10">
          <div className="flex items-baseline gap-1 font-mono tabular-nums">
            <h3 className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight">
              {Math.floor(totalTimeHours)}
            </h3>
            <span className="text-xs sm:text-sm text-slate-400 font-bold">h</span>
            <h3 className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight ml-1">
              {Math.round((totalTimeHours % 1) * 60)}
            </h3>
            <span className="text-xs sm:text-sm text-slate-400 font-bold">m</span>
          </div>
          <p className="text-[11px] font-bold text-slate-400 mt-1 truncate">
            Tiempo efectivo
          </p>
        </div>
      </div>

      {/* 4. Media Cantos */}
      <div className="bg-white/95 backdrop-blur-xl rounded-2xl p-3.5 sm:p-5 shadow-xs border border-slate-200/80 flex flex-col justify-between relative overflow-hidden group hover:border-slate-300 transition-all">
        <div className="flex items-center gap-2 mb-2 sm:mb-4 relative z-10">
          <div className="bg-amber-50 text-amber-600 p-2 rounded-xl border border-amber-200/60 shrink-0">
            <Mic size={16} strokeWidth={2.5} />
          </div>
          <span className="text-[10px] sm:text-[11px] font-black text-slate-400 uppercase tracking-wider truncate">
            Media Cantos
          </span>
        </div>
        <div className="mt-auto relative z-10">
          <div className="flex items-baseline gap-1 font-mono tabular-nums">
            <h3 className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight">
              {avgRecentCanto > 0 ? avgRecentCanto.toFixed(1) : "—"}
            </h3>
            <span className="text-xs sm:text-sm text-slate-400 font-bold">/ 10</span>
          </div>
          <p className="text-[11px] font-bold text-slate-400 mt-1 truncate">
            Últimos 10 simulacros
          </p>
        </div>
      </div>
    </div>
  );
};
