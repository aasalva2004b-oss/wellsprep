import React from "react";
import { Flame, CheckCircle2, Sparkles, Clock, Target } from "lucide-react";
import { TodayActivityData } from "../../lib/recommendationEngine";
import { playSound } from "../../lib/sound";
import { cn } from "../../lib/utils";

interface DashboardActivityRingsCardProps {
  activity: TodayActivityData;
  currentStreak: number;
  onGoalChange: (newGoalMinutes: number) => void;
}

export const DashboardActivityRingsCard: React.FC<DashboardActivityRingsCardProps> = ({
  activity,
  currentStreak,
  onGoalChange,
}) => {
  const radius = 64;
  const strokeWidth = 12;
  const circumference = 2 * Math.PI * radius;
  // Cap SVG offset at 100% visually, but allow full loop overflow or glow when exceeded
  const normalizedProgress = Math.min(1, Math.max(0, activity.progressRatio));
  const strokeDashoffset = circumference - normalizedProgress * circumference;

  const handleSelectGoal = (minutes: number) => {
    playSound.toggle();
    onGoalChange(minutes);
  };

  return (
    <div className="bg-white/95 backdrop-blur-xl rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-xs flex flex-col justify-between relative overflow-hidden group hover:border-slate-300 transition-all">
      {/* Subtle background glow */}
      <div className="absolute -top-16 -right-16 w-44 h-44 bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-transparent rounded-full blur-2xl pointer-events-none" />

      {/* Header */}
      <div className="flex items-center justify-between gap-3 relative z-10 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-2xl bg-indigo-50 border border-indigo-200/60 flex items-center justify-center text-indigo-600 shadow-xs">
            <Target size={18} strokeWidth={2.5} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-black text-slate-900 tracking-tight">
                Anillo de Actividad
              </h3>
              {activity.isGoalMet && (
                <span className="inline-flex items-center gap-1 text-[11px] font-black text-emerald-600 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-full">
                  <CheckCircle2 size={12} strokeWidth={3} />
                  Meta cumplida
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 font-medium">Objetivo diario de estudio</p>
          </div>
        </div>

        {/* Racha / Streak Badge */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 shadow-2xs">
          <Flame size={15} className="text-amber-500 animate-pulse" strokeWidth={2.5} />
          <span className="text-xs font-black font-mono tracking-tight">{currentStreak}</span>
          <span className="text-[10px] font-black uppercase text-amber-600/80 tracking-wider">
            {currentStreak === 1 ? "día" : "días"}
          </span>
        </div>
      </div>

      {/* Main Center Display: Ring & Typography */}
      <div className="flex flex-col sm:flex-row items-center justify-around gap-6 my-2 relative z-10">
        {/* SVG Circular Ring */}
        <div className="relative w-40 h-40 flex items-center justify-center shrink-0">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 160 160">
            {/* Background Track */}
            <circle
              cx="80"
              cy="80"
              r={radius}
              stroke="currentColor"
              strokeWidth={strokeWidth}
              className="text-slate-100"
              fill="transparent"
            />
            {/* Foreground Progress */}
            <defs>
              <linearGradient id="appleRingGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#6366f1" />
                <stop offset="50%" stopColor="#8b5cf6" />
                <stop offset="100%" stopColor="#ec4899" />
              </linearGradient>
            </defs>
            <circle
              cx="80"
              cy="80"
              r={radius}
              stroke="url(#appleRingGradient)"
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="transparent"
              className="transition-all duration-700 ease-out"
            />
          </svg>

          {/* Center Text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center select-none pointer-events-none">
            <span className="text-2xl font-black font-mono tracking-tight text-slate-900 leading-none">
              {activity.totalHours}
              <span className="text-xs font-bold text-slate-400 ml-0.5">h</span>
            </span>
            <span className="text-[11px] font-black text-slate-400 mt-1 uppercase tracking-wider">
              de {activity.goalHours}h
            </span>
            <div className="mt-1">
              <span
                className={cn(
                  "text-[10px] font-black px-1.5 py-0.5 rounded-md",
                  activity.isGoalMet ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                )}
              >
                {activity.progressPercent}%
              </span>
            </div>
          </div>
        </div>

        {/* Breakdown Breakdown Metric Blocks */}
        <div className="flex-1 w-full space-y-2.5">
          <div className="flex items-center justify-between text-xs py-1.5 px-3 rounded-xl bg-slate-50 border border-slate-100">
            <span className="text-slate-500 font-medium flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              Estudio & Refrescos
            </span>
            <span className="font-mono font-bold text-slate-800">
              {Math.round(((activity.studyMinutes + activity.refrescoMinutes) / 60) * 10) / 10}h
            </span>
          </div>

          <div className="flex items-center justify-between text-xs py-1.5 px-3 rounded-xl bg-slate-50 border border-slate-100">
            <span className="text-slate-500 font-medium flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
              Repasos Mensuales
            </span>
            <span className="font-mono font-bold text-slate-800">
              {Math.round((activity.repasoMinutes / 60) * 10) / 10}h
            </span>
          </div>

          <div className="flex items-center justify-between text-xs py-1.5 px-3 rounded-xl bg-slate-50 border border-slate-100">
            <span className="text-slate-500 font-medium flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-fuchsia-500 shrink-0" />
              Cantos
            </span>
            <span className="font-mono font-bold text-slate-800">
              {Math.round((activity.cantoMinutes / 60) * 10) / 10}h
            </span>
          </div>

          {activity.exceededMinutes > 0 && (
            <div className="text-[11px] font-bold text-indigo-600 bg-indigo-50/80 border border-indigo-200/60 rounded-xl px-3 py-1 flex items-center gap-1.5">
              <Sparkles size={13} className="text-indigo-500 shrink-0" />
              <span>+{activity.exceededMinutes} min extra sobre la meta diaria</span>
            </div>
          )}
        </div>
      </div>

      {/* Goal Preset Selector Footer */}
      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2 relative z-10">
        <span className="text-xs font-bold text-slate-400">Meta diaria:</span>
        <div className="flex items-center gap-1.5">
          {[
            { label: "4h", mins: 240 },
            { label: "6h", mins: 360 },
            { label: "8h", mins: 480 },
          ].map((preset) => {
            const isSelected = activity.goalMinutes === preset.mins;
            return (
              <button
                key={preset.mins}
                type="button"
                onClick={() => handleSelectGoal(preset.mins)}
                className={cn(
                  "px-3 py-1 rounded-xl text-xs font-black transition-all active:scale-95",
                  isSelected
                    ? "bg-slate-900 text-white shadow-2xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900"
                )}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
