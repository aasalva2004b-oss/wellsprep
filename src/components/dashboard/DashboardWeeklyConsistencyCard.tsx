import React, { useState } from "react";
import { BarChart3, TrendingUp, Calendar, Info } from "lucide-react";
import { WeeklyConsistencyData, DayConsistencyData } from "../../lib/recommendationEngine";
import { cn } from "../../lib/utils";

interface DashboardWeeklyConsistencyCardProps {
  weeklyData: WeeklyConsistencyData;
}

export const DashboardWeeklyConsistencyCard: React.FC<DashboardWeeklyConsistencyCardProps> = ({
  weeklyData,
}) => {
  const [hoveredDay, setHoveredDay] = useState<DayConsistencyData | null>(null);

  // Maximum value for scaling the bar height
  const maxHours = Math.max(
    8,
    ...weeklyData.days.map((d) => d.totalHours),
    Math.round((weeklyData.days[0]?.goalMinutes || 360) / 60)
  );

  return (
    <div className="bg-white/95 backdrop-blur-xl rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-xs flex flex-col justify-between relative overflow-hidden group hover:border-slate-300 transition-all">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 relative z-10 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-2xl bg-emerald-50 border border-emerald-200/60 flex items-center justify-center text-emerald-600 shadow-xs">
            <BarChart3 size={18} strokeWidth={2.5} />
          </div>
          <div>
            <h3 className="text-base font-black text-slate-900 tracking-tight">
              Constancia Semanal
            </h3>
            <p className="text-xs text-slate-400 font-medium">Últimos 7 días estilo Apple Health</p>
          </div>
        </div>

        {/* Weekly Stats */}
        <div className="text-right">
          <div className="flex items-baseline justify-end gap-1 font-mono">
            <span className="text-lg font-black text-slate-900 tracking-tight">
              {weeklyData.totalWeeklyHours}
            </span>
            <span className="text-xs font-bold text-slate-400">h semana</span>
          </div>
          <p className="text-[11px] font-bold text-slate-500 font-mono">
            Media: <span className="text-emerald-600">{weeklyData.dailyAverageHours}h/día</span>
          </p>
        </div>
      </div>

      {/* Bar Chart Area */}
      <div className="relative my-2 pt-6 pb-2">
        {/* Goal Reference Line */}
        <div
          className="absolute left-0 right-0 border-b border-dashed border-slate-300/80 z-0 pointer-events-none flex items-center justify-end"
          style={{
            bottom: `${Math.min(90, Math.round(((weeklyData.days[0]?.goalMinutes || 360) / 60 / maxHours) * 100))}%`,
          }}
        >
          <span className="text-[9px] font-bold font-mono text-slate-400 bg-white px-1.5 py-0.5 rounded-sm uppercase tracking-wider mr-1 shadow-2xs">
            Meta {(weeklyData.days[0]?.goalMinutes || 360) / 60}h
          </span>
        </div>

        {/* 7 Days Bars Container */}
        <div className="grid grid-cols-7 gap-2 sm:gap-3 items-end h-40 relative z-10">
          {weeklyData.days.map((day) => {
            const heightPercent = Math.min(100, Math.max(6, Math.round((day.totalHours / maxHours) * 100)));
            const isHovered = hoveredDay?.dateStr === day.dateStr;

            return (
              <div
                key={day.dateStr}
                className="flex flex-col items-center h-full justify-end group/bar cursor-pointer"
                onMouseEnter={() => setHoveredDay(day)}
                onMouseLeave={() => setHoveredDay(null)}
              >
                {/* Bar */}
                <div className="w-full flex justify-center items-end flex-1">
                  <div
                    style={{ height: `${heightPercent}%` }}
                    className={cn(
                      "w-full max-w-[28px] rounded-t-xl transition-all duration-300 relative group-hover/bar:brightness-110",
                      day.isToday
                        ? "bg-gradient-to-t from-indigo-600 to-purple-500 shadow-sm shadow-indigo-300/50"
                        : day.goalMet
                        ? "bg-emerald-500 shadow-2xs shadow-emerald-200"
                        : day.totalHours > 0
                        ? "bg-slate-300"
                        : "bg-slate-100"
                    )}
                  >
                    {/* Tiny dot on top if goal met */}
                    {day.goalMet && (
                      <span className="absolute -top-1.5 left-1/2 transform -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-emerald-400 border border-white ring-2 ring-emerald-200/50" />
                    )}
                  </div>
                </div>

                {/* Day Labels */}
                <div className="mt-2 text-center select-none">
                  <span
                    className={cn(
                      "block text-[11px] font-black uppercase tracking-tight",
                      day.isToday ? "text-indigo-600 font-extrabold" : "text-slate-500"
                    )}
                  >
                    {day.dayLabel}
                  </span>
                  <span
                    className={cn(
                      "block text-[10px] font-mono",
                      day.isToday ? "text-indigo-600 font-bold" : "text-slate-400"
                    )}
                  >
                    {day.dayNum}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tooltip or Summary Footer */}
      <div className="mt-3 pt-3 border-t border-slate-100 min-h-[38px] flex items-center justify-between text-xs relative z-10">
        {hoveredDay ? (
          <div className="flex items-center justify-between w-full">
            <span className="font-bold text-slate-700 flex items-center gap-1.5">
              <Calendar size={13} className="text-slate-400" />
              {hoveredDay.dayLabel} {hoveredDay.dayNum} ({hoveredDay.isToday ? "Hoy" : hoveredDay.dateStr})
            </span>
            <div className="flex items-center gap-2 font-mono">
              <span className="font-black text-slate-900">{hoveredDay.totalHours} horas</span>
              <span
                className={cn(
                  "text-[10px] font-bold px-1.5 py-0.5 rounded-md",
                  hoveredDay.goalMet ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                )}
              >
                {hoveredDay.pctOfGoal}% de meta
              </span>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between w-full text-slate-400 text-xs">
            <span className="flex items-center gap-1.5">
              <Info size={13} className="text-slate-400 shrink-0" />
              Pasa el cursor por cada día para ver detalle
            </span>
            <span className="font-bold text-emerald-600 font-mono">
              {weeklyData.completedDaysCount} de 7 días completados
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
