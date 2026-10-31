import React from "react";
import { Flame, TrendingUp, Layers, Clock, Mic, CheckCircle2, Sparkles } from "lucide-react";
import { cn } from "../../lib/utils";

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
  const hours = Math.floor(totalTimeHours);
  const minutes = Math.round((totalTimeHours % 1) * 60);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4 lg:gap-5">
      {/* 1. Consistencia / Racha */}
      <div className="bg-white/95 backdrop-blur-xl rounded-2xl p-3.5 sm:p-5 shadow-xs border border-slate-200/80 flex flex-col justify-between relative overflow-hidden group hover:border-emerald-300/80 hover:shadow-md transition-all duration-200">
        <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-emerald-500/10 to-transparent rounded-full -mr-8 -mt-8 pointer-events-none group-hover:scale-125 transition-transform duration-300" />
        
        <div className="flex items-center justify-between mb-2 sm:mb-4 relative z-10">
          <div className="flex items-center gap-2">
            <div className="bg-emerald-50 text-emerald-600 p-2 rounded-xl border border-emerald-200/60 shrink-0 shadow-2xs group-hover:bg-emerald-100 transition-colors">
              <Flame size={16} strokeWidth={2.5} className="animate-pulse" />
            </div>
            <span className="text-[10px] sm:text-[11px] font-black text-slate-400 uppercase tracking-wider truncate font-sans">
              Consistencia
            </span>
          </div>
          <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono">
            Racha
          </span>
        </div>

        <div className="mt-auto relative z-10">
          <div className="flex items-baseline gap-1.5 font-mono tabular-nums">
            <h3 className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight">
              {currentStreak}
            </h3>
            <span className="text-xs sm:text-sm text-slate-400 font-bold">
              {currentStreak === 1 ? "día" : "días"}
            </span>
          </div>
          <p className="text-[11px] font-bold text-emerald-600 mt-1 flex items-center gap-1 font-mono">
            <TrendingUp size={12} strokeWidth={2.5} />
            <span>{currentStreak > 0 ? "Ritmo sostenido" : "Inicia hoy"}</span>
          </p>
        </div>
      </div>

      {/* 2. Cobertura Temario */}
      <div className="bg-white/95 backdrop-blur-xl rounded-2xl p-3.5 sm:p-5 shadow-xs border border-slate-200/80 flex flex-col justify-between relative overflow-hidden group hover:border-indigo-300/80 hover:shadow-md transition-all duration-200">
        <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-indigo-500/10 to-transparent rounded-full -mr-8 -mt-8 pointer-events-none group-hover:scale-125 transition-transform duration-300" />

        <div className="flex items-center justify-between mb-2 sm:mb-4 relative z-10">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-50 text-indigo-600 p-2 rounded-xl border border-indigo-200/60 shrink-0 shadow-2xs group-hover:bg-indigo-100 transition-colors">
              <Layers size={16} strokeWidth={2.5} />
            </div>
            <span className="text-[10px] sm:text-[11px] font-black text-slate-400 uppercase tracking-wider truncate font-sans">
              Temario Activo
            </span>
          </div>
          <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-mono">
            {globalCompletion.toFixed(0)}%
          </span>
        </div>

        <div className="mt-auto relative z-10">
          <div className="flex items-baseline gap-1.5 font-mono tabular-nums">
            <h3 className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight">
              {totalTopicsStudied}
            </h3>
            <span className="text-xs sm:text-sm text-slate-400 font-bold">
              / {totalTopicsCount}
            </span>
          </div>
          <div className="w-full h-1.5 bg-slate-100 rounded-full mt-2.5 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-indigo-600 rounded-full transition-all duration-700"
              style={{ width: `${Math.min(100, Math.max(3, globalCompletion))}%` }}
            />
          </div>
        </div>
      </div>

      {/* 3. Horas de Vuelo */}
      <div className="bg-white/95 backdrop-blur-xl rounded-2xl p-3.5 sm:p-5 shadow-xs border border-slate-200/80 flex flex-col justify-between relative overflow-hidden group hover:border-blue-300/80 hover:shadow-md transition-all duration-200">
        <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-blue-500/10 to-transparent rounded-full -mr-8 -mt-8 pointer-events-none group-hover:scale-125 transition-transform duration-300" />

        <div className="flex items-center justify-between mb-2 sm:mb-4 relative z-10">
          <div className="flex items-center gap-2">
            <div className="bg-blue-50 text-blue-600 p-2 rounded-xl border border-blue-200/60 shrink-0 shadow-2xs group-hover:bg-blue-100 transition-colors">
              <Clock size={16} strokeWidth={2.5} />
            </div>
            <span className="text-[10px] sm:text-[11px] font-black text-slate-400 uppercase tracking-wider truncate font-sans">
              Horas de Vuelo
            </span>
          </div>
          <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-mono">
            Neto
          </span>
        </div>

        <div className="mt-auto relative z-10">
          <div className="flex items-baseline gap-1 font-mono tabular-nums">
            <h3 className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight">
              {hours}
            </h3>
            <span className="text-xs sm:text-sm text-slate-400 font-bold">h</span>
            <h3 className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight ml-1.5">
              {minutes}
            </h3>
            <span className="text-xs sm:text-sm text-slate-400 font-bold">m</span>
          </div>
          <p className="text-[11px] font-bold text-slate-400 mt-1 truncate">
            Tiempo efectivo en mesa
          </p>
        </div>
      </div>

      {/* 4. Media Cantos */}
      <div className="bg-white/95 backdrop-blur-xl rounded-2xl p-3.5 sm:p-5 shadow-xs border border-slate-200/80 flex flex-col justify-between relative overflow-hidden group hover:border-amber-300/80 hover:shadow-md transition-all duration-200">
        <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-amber-500/10 to-transparent rounded-full -mr-8 -mt-8 pointer-events-none group-hover:scale-125 transition-transform duration-300" />

        <div className="flex items-center justify-between mb-2 sm:mb-4 relative z-10">
          <div className="flex items-center gap-2">
            <div className="bg-amber-50 text-amber-600 p-2 rounded-xl border border-amber-200/60 shrink-0 shadow-2xs group-hover:bg-amber-100 transition-colors">
              <Mic size={16} strokeWidth={2.5} />
            </div>
            <span className="text-[10px] sm:text-[11px] font-black text-slate-400 uppercase tracking-wider truncate font-sans">
              Calidad Cantos
            </span>
          </div>
          <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-mono">
            Tribunal
          </span>
        </div>

        <div className="mt-auto relative z-10">
          <div className="flex items-baseline gap-1.5 font-mono tabular-nums">
            <h3 className={cn(
              "text-2xl sm:text-4xl font-black tracking-tight",
              avgRecentCanto >= 8 ? "text-emerald-600" : avgRecentCanto >= 5 ? "text-slate-900" : avgRecentCanto > 0 ? "text-rose-600" : "text-slate-400"
            )}>
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
