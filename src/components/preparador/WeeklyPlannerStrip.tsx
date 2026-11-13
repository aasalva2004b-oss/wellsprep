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
import { DS } from "../../lib/designSystem";

import { DayStudyQuota } from "../../lib/weeklyCanteEngine";

export type ActivePlannerView = "lunes" | "jueves" | "ebbinghaus" | "historial" | "dia_estudio" | "semana_completa";

interface WeeklyPlannerStripProps {
  activeView: ActivePlannerView;
  onSelectView: (view: ActivePlannerView, selectedDate?: string) => void;
  lunesTopicsCount: number;
  juevesTopicsCount: number;
  ebbinghausAlertCount: number;
  totalCantosCount: number;
  selectedDateStr?: string;
  recentSessions: any[];
  dailyQuotas?: Record<string, DayStudyQuota>;
}

export const WeeklyPlannerStrip: React.FC<WeeklyPlannerStripProps> = ({
  activeView,
  onSelectView,
  lunesTopicsCount,
  juevesTopicsCount,
  ebbinghausAlertCount,
  totalCantosCount,
  selectedDateStr,
  recentSessions,
  dailyQuotas
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
        return { message: "Hoy es lunes de cante", urgent: true };
      }
      return { message: "Próxima jornada de cante: jueves", urgent: false };
    }
    if (dayOfWeek === 4) { // Thursday
      if (hour < 22) {
        return { message: "Hoy es jueves de cante", urgent: true };
      }
      return { message: "Próxima jornada de cante: lunes", urgent: false };
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
    <div className="mb-3 space-y-2">
      <nav aria-label="Vistas del planificador" className="flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white p-1.5">
        {([
          { view: "semana_completa", label: "Semana", accessible: "Vista Semanal (7 Días)", icon: CalendarIcon, count: null },
          { view: "lunes", label: "Lunes", accessible: "Cante Lunes", icon: Award, count: lunesTopicsCount },
          { view: "jueves", label: "Jueves", accessible: "Cante Jueves", icon: Award, count: juevesTopicsCount },
        ] as const).map(item => {
          const selected = activeView === item.view;
          const Icon = item.icon;
          return <button
            key={item.view}
            type="button"
            aria-label={`${item.accessible}${item.count === null ? "" : `, ${item.count} temas`}`}
            aria-current={selected ? "page" : undefined}
            onClick={() => { playSound.click(); onSelectView(item.view); }}
            className={cn("flex min-h-[44px] min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl px-2 text-sm font-bold transition-colors", selected ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900")}
            title={item.accessible}
          >
            <Icon size={16} aria-hidden="true" className="hidden sm:block" />
            <span>{item.label}</span>
            {item.count !== null && <span className={cn("rounded-full px-1.5 font-mono text-xs", selected ? "bg-white/15" : "bg-slate-100 text-slate-600")}>{item.count}</span>}
          </button>;
        })}
        <details className="relative shrink-0">
          <summary className={cn("flex min-h-[44px] cursor-pointer list-none items-center gap-1 rounded-xl px-3 text-sm font-bold", activeView === "ebbinghaus" || activeView === "historial" ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:bg-slate-100")}>
            <span>{activeView === "ebbinghaus" ? "Retención" : activeView === "historial" ? "Historial" : "Más"}</span>
            <ChevronRight size={14} aria-hidden="true" className="rotate-90" />
          </summary>
          <div className="absolute right-0 top-full z-30 mt-2 w-64 space-y-1 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg">
            <button type="button" aria-current={activeView === "ebbinghaus" ? "page" : undefined}
              onClick={event => { playSound.click(); onSelectView("ebbinghaus"); event.currentTarget.closest("details")?.removeAttribute("open"); }}
              className={cn(DS.btnGhost, "min-h-[44px] w-full justify-between text-left")} title="Temas en riesgo según la curva de retención Ebbinghaus">
              <span className="flex items-center gap-2"><Brain size={16} aria-hidden="true" />Curva de Olvido</span>
              <span className="rounded-full bg-amber-50 px-2 font-mono text-xs text-amber-900">{ebbinghausAlertCount}</span>
            </button>
            <button type="button" aria-current={activeView === "historial" ? "page" : undefined}
              onClick={event => { playSound.click(); onSelectView("historial"); event.currentTarget.closest("details")?.removeAttribute("open"); }}
              className={cn(DS.btnGhost, "min-h-[44px] w-full justify-between text-left")}>
              <span className="flex items-center gap-2"><Award size={16} aria-hidden="true" />Historial de cantes</span>
              <span className="font-mono text-xs">{totalCantosCount}</span>
            </button>
          </div>
        </details>
      </nav>

      {activeView !== "semana_completa" && <details className="rounded-2xl border border-slate-200 bg-white">
        <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-2 px-4 text-sm font-semibold text-slate-700">
          <span className="flex items-center gap-2"><CalendarIcon size={16} aria-hidden="true" />Elegir día de estudio</span>
          <ChevronRight size={16} aria-hidden="true" className="rotate-90" />
        </summary>
        <p className="px-4 pb-3 text-sm text-slate-600">{nextCanteInfo.message}</p>
        <div className="grid grid-cols-7 gap-1 border-t border-slate-100 p-1.5" aria-label="Días de esta semana">
          {weekDays.map(day => {
            const selected = (activeView === "lunes" && day.preparadorKey === "lunes")
              || (activeView === "jueves" && day.preparadorKey === "jueves")
              || (activeView === "dia_estudio" && selectedDateStr === day.iso);
            const count = day.preparadorKey === "lunes" ? lunesTopicsCount : day.preparadorKey === "jueves" ? juevesTopicsCount : 0;
            return <button key={day.iso} type="button" aria-pressed={selected}
              aria-label={`${day.dayName} ${day.dateNum} ${day.monthName}${day.isToday ? ", hoy" : ""}${day.isPreparadorDay ? `, cante, ${count} temas` : `, ${day.sessionsCount} sesiones`}`}
              onClick={() => { playSound.click(); onSelectView(day.preparadorKey || "dia_estudio", day.iso); }}
              className={cn("flex min-h-[72px] min-w-[36px] flex-col items-center justify-center gap-1 rounded-xl px-1 text-center transition-colors", selected ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100", day.isToday && !selected && "bg-amber-50 text-slate-900")}>
              <span className="text-[11px] font-semibold">{day.shortName}</span>
              <span className="font-serif text-lg font-bold tabular-nums">{day.dateNum}</span>
              <span className="text-[11px]">{day.isPreparadorDay ? `${count} t.` : day.hoursFormatted || "—"}</span>
            </button>;
          })}
        </div>
      </details>}
    </div>
  );
};
