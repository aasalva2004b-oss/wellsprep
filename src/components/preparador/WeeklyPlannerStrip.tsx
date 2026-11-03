import React, { useMemo } from "react";
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  Award, 
  Clock, 
  Sparkles, 
  Brain, 
  CheckCircle2, 
  AlertCircle,
  Timer
} from "lucide-react";
import { cn, safeParseDate } from "../../lib/utils";
import { playSound } from "../../lib/sound";

export type ActivePlannerView = "lunes" | "jueves" | "ebbinghaus" | "historial" | "dia_estudio";

interface WeeklyPlannerStripProps {
  activeView: ActivePlannerView;
  onSelectView: (view: ActivePlannerView, selectedDate?: string) => void;
  lunesTopicsCount: number;
  juevesTopicsCount: number;
  ebbinghausAlertCount: number;
  totalCantosCount: number;
  selectedDateStr?: string;
  recentSessions: any[];
}

export const WeeklyPlannerStrip: React.FC<WeeklyPlannerStripProps> = ({
  activeView,
  onSelectView,
  lunesTopicsCount,
  juevesTopicsCount,
  ebbinghausAlertCount,
  totalCantosCount,
  selectedDateStr,
  recentSessions
}) => {
  // Compute current week Monday to Sunday
  const [weekOffset, setWeekOffset] = React.useState(0);

  const weekDays = useMemo(() => {
    const today = new Date();
    const currentDay = today.getDay(); // 0 is Sunday, 1 is Monday
    // Distance to Monday
    const distanceToMonday = currentDay === 0 ? -6 : 1 - currentDay;
    const monday = new Date(today);
    monday.setDate(today.getDate() + distanceToMonday + weekOffset * 7);
    monday.setHours(0, 0, 0, 0);

    const days = [];
    const dayNames = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
    const shortNames = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];

    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const dateNum = String(d.getDate()).padStart(2, "0");
      const iso = `${year}-${month}-${dateNum}`;

      const isToday = today.toDateString() === d.toDateString();
      const isPreparadorDay = i === 0 || i === 3; // Lunes (0) or Jueves (3)
      const preparadorKey: "lunes" | "jueves" | null = i === 0 ? "lunes" : i === 3 ? "jueves" : null;

      // Count study sessions recorded for this day
      const daySessions = recentSessions.filter((s) => (s.date || "").startsWith(iso));
      const totalMinutesStudied = daySessions.reduce(
        (acc, s) => acc + (s.durationMinutes || s.duration || 0),
        0
      );

      days.push({
        index: i,
        dayName: dayNames[i],
        shortName: shortNames[i],
        dateNum: d.getDate(),
        monthName: d.toLocaleDateString("es-ES", { month: "short" }),
        iso,
        isToday,
        isPreparadorDay,
        preparadorKey,
        sessionsCount: daySessions.length,
        totalMinutesStudied,
        hoursFormatted: totalMinutesStudied > 0 
          ? (totalMinutesStudied >= 60 
              ? `${(totalMinutesStudied / 60).toFixed(1)}h` 
              : `${totalMinutesStudied}m`)
          : null
      });
    }

    return days;
  }, [weekOffset, recentSessions]);

  // Determine next cante countdown
  const nextCanteInfo = useMemo(() => {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 Sun, 1 Mon, 2 Tue, 3 Wed, 4 Thu, 5 Fri, 6 Sat
    const hour = now.getHours();

    if (dayOfWeek === 1) { // Monday
      if (hour < 22) {
        return { message: "¡Hoy es Lunes de Cante! Sesión abierta hasta las 22:00h", urgent: true };
      }
      return { message: "Cante de Lunes completado · Próximo cante: Jueves", urgent: false };
    }
    if (dayOfWeek === 4) { // Thursday
      if (hour < 22) {
        return { message: "¡Hoy es Jueves de Cante! Sesión abierta hasta las 22:00h", urgent: true };
      }
      return { message: "Cante de Jueves completado · Próximo cante: Lunes", urgent: false };
    }
    if (dayOfWeek === 2 || dayOfWeek === 3) {
      const daysLeft = 4 - dayOfWeek;
      return { message: `Próximo cante oficial: Jueves (faltan ${daysLeft} ${daysLeft === 1 ? 'día' : 'días'})`, urgent: false };
    }
    // Fri, Sat, Sun
    const daysLeft = dayOfWeek === 0 ? 1 : (8 - dayOfWeek);
    return { message: `Próximo cante oficial: Lunes (faltan ${daysLeft} ${daysLeft === 1 ? 'día' : 'días'})`, urgent: false };
  }, []);

  return (
    <div className="bg-white/95 backdrop-blur-xl border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden mb-4">
      {/* Header Bar with Week Controls and Countdown */}
      <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-xs shadow-xs">
            <CalendarIcon size={15} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-black font-serif text-slate-900 tracking-tight">
                Planificador Semanal del Opositor
              </h2>
              {weekOffset === 0 ? (
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/60">
                  Semana Actual
                </span>
              ) : (
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                  {weekOffset > 0 ? `+${weekOffset} sem` : `${weekOffset} sem`}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 font-medium flex items-center gap-1.5 mt-0.5">
              <Clock size={11} className={cn(nextCanteInfo.urgent ? "text-amber-600 animate-pulse" : "text-slate-400")} />
              <span className={cn(nextCanteInfo.urgent && "font-bold text-amber-900")}>
                {nextCanteInfo.message}
              </span>
            </p>
          </div>
        </div>

        {/* View Mode Pills (Cante / Ebbinghaus / Historial) & Week Nav */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Direct Navigation to Ebbinghaus Queue */}
          <button
            type="button"
            onClick={() => {
              playSound.click();
              onSelectView("ebbinghaus");
            }}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border active:scale-95",
              activeView === "ebbinghaus"
                ? "bg-amber-500 text-white border-amber-600 shadow-xs"
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:text-slate-900"
            )}
            title="Temas en riesgo según la curva de retención Ebbinghaus"
          >
            <Brain size={13} className={activeView === "ebbinghaus" ? "text-white" : "text-amber-500"} />
            <span>Cola de Olvido</span>
            {ebbinghausAlertCount > 0 && (
              <span className={cn(
                "text-[10px] font-mono font-black px-1.5 py-0.2 rounded-full",
                activeView === "ebbinghaus" ? "bg-amber-700 text-white" : "bg-rose-100 text-rose-700"
              )}>
                {ebbinghausAlertCount}
              </span>
            )}
          </button>

          {/* Historial Tab */}
          <button
            type="button"
            onClick={() => {
              playSound.click();
              onSelectView("historial");
            }}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border active:scale-95",
              activeView === "historial"
                ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:text-slate-900"
            )}
          >
            <Award size={13} className={activeView === "historial" ? "text-amber-400" : "text-slate-400"} />
            <span>Historial</span>
            <span className={cn(
              "text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full",
              activeView === "historial" ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600"
            )}>
              {totalCantosCount}
            </span>
          </button>

          {/* Week Arrows */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/60 ml-1">
            <button
              type="button"
              onClick={() => {
                playSound.click();
                setWeekOffset((w) => w - 1);
              }}
              className="p-1 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-white transition-colors"
              title="Semana anterior"
            >
              <ChevronLeft size={14} />
            </button>
            {weekOffset !== 0 && (
              <button
                type="button"
                onClick={() => {
                  playSound.click();
                  setWeekOffset(0);
                }}
                className="px-1.5 text-[10px] font-bold text-slate-600 hover:text-slate-900"
                title="Volver a la semana actual"
              >
                Hoy
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                playSound.click();
                setWeekOffset((w) => w + 1);
              }}
              className="p-1 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-white transition-colors"
              title="Semana siguiente"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* 7-Day Interactive Ribbon Grid */}
      <div className="grid grid-cols-7 divide-x divide-slate-100 bg-slate-50/50">
        {weekDays.map((day) => {
          const isLunesActive = activeView === "lunes" && day.preparadorKey === "lunes";
          const isJuevesActive = activeView === "jueves" && day.preparadorKey === "jueves";
          const isSelectedDate = activeView === "dia_estudio" && selectedDateStr === day.iso;
          const isSelected = isLunesActive || isJuevesActive || isSelectedDate;

          const topicsCount = day.preparadorKey === "lunes" 
            ? lunesTopicsCount 
            : day.preparadorKey === "jueves" 
            ? juevesTopicsCount 
            : 0;

          return (
            <button
              key={day.iso}
              type="button"
              onClick={() => {
                playSound.click();
                if (day.preparadorKey === "lunes") {
                  onSelectView("lunes");
                } else if (day.preparadorKey === "jueves") {
                  onSelectView("jueves");
                } else {
                  onSelectView("dia_estudio", day.iso);
                }
              }}
              className={cn(
                "p-2.5 sm:p-3 text-left transition-all relative flex flex-col justify-between min-h-[92px] group focus:outline-none cursor-pointer",
                isSelected
                  ? "bg-white shadow-sm ring-2 ring-slate-900 z-10"
                  : "hover:bg-white/80",
                day.isToday && !isSelected && "bg-indigo-50/30"
              )}
            >
              {/* Day Name & Date Number */}
              <div>
                <div className="flex items-center justify-between">
                  <span className={cn(
                    "text-[10px] font-black uppercase tracking-wider font-mono",
                    isSelected 
                      ? "text-slate-900" 
                      : day.isPreparadorDay 
                      ? "text-indigo-600" 
                      : "text-slate-400"
                  )}>
                    {day.shortName}
                  </span>

                  {day.isToday && (
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 ring-2 ring-indigo-200" title="Hoy" />
                  )}
                </div>

                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className={cn(
                    "text-base sm:text-lg font-black font-serif tabular-nums tracking-tight leading-none",
                    isSelected ? "text-slate-900" : "text-slate-700 group-hover:text-slate-900"
                  )}>
                    {day.dateNum}
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium lowercase">
                    {day.monthName}
                  </span>
                </div>
              </div>

              {/* Status or Counter Bottom Marker */}
              <div className="mt-2 pt-1 border-t border-slate-100 flex flex-col gap-0.5">
                {day.isPreparadorDay ? (
                  <div className="flex items-center justify-between">
                    <span className={cn(
                      "text-[9px] font-black uppercase tracking-wider flex items-center gap-1",
                      isSelected ? "text-indigo-700" : "text-indigo-600"
                    )}>
                      <Award size={10} className="shrink-0" />
                      <span className="hidden sm:inline">Cante</span>
                    </span>
                    <span className={cn(
                      "text-[10px] font-mono font-black tabular-nums px-1.5 py-0.2 rounded-md",
                      topicsCount > 0 
                        ? (isSelected ? "bg-slate-900 text-white" : "bg-indigo-100 text-indigo-800")
                        : "bg-slate-100 text-slate-400"
                    )}>
                      {topicsCount} {topicsCount === 1 ? "t" : "t"}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span className="text-[9px] font-mono">
                      {day.hoursFormatted ? (
                        <span className="text-emerald-700 font-black">{day.hoursFormatted}</span>
                      ) : (
                        <span>Estudio</span>
                      )}
                    </span>
                    {day.sessionsCount > 0 && (
                      <span className="text-[9px] font-mono text-slate-500 font-bold">
                        {day.sessionsCount}s
                      </span>
                    )}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
