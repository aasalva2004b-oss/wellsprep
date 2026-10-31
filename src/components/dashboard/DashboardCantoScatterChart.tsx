import React, { useState, useMemo } from "react";
import {
  Mic,
  Activity,
  Target,
  Timer,
  Award,
  Sliders,
  Plus,
  Clock,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Flame,
  ArrowRight,
  TrendingUp,
  X,
  Compass,
  BarChart3,
  Calendar,
  Layers,
  ChevronRight,
} from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  ScatterChart,
  Scatter,
  Bar,
  Line,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
  Cell,
} from "recharts";
import { cn } from "../../lib/utils";

export interface DashboardCantoScatterChartProps {
  allCantos: any[];
  cantosChartData: any[];
  uniqueTopicsInCantos: { id: string; number: number; title: string; count: number }[];
  selectedTopicCantoFilter: string;
  setSelectedTopicCantoFilter: (val: string) => void;
  cantoTimeRange: "all" | "30d" | "20" | "10";
  setCantoTimeRange: (val: "all" | "30d" | "20" | "10") => void;
  estadoDeForma: {
    diagnostico: string;
    consejo: string;
    badgeClass: string;
    diasUltimoCanto: number | null;
    notaMediaReciente: number;
    tendenciaNota: number;
    notaMediaHistorica: number;
    tiempoMedioRecienteMin: number;
    tiempoMedioRecienteSec: number;
    porcentajeEnTiempoOptimo: number;
    aprobadosPorcentaje: number;
  };
  onManageCantos: () => void;
  onLogCanto: () => void;
  onSelectTopic?: (topicId: string) => void;
}

type ViewMode = "matrix" | "timeline" | "distribution";
type StatusFilter = "all" | "in_time" | "passed" | "with_mistakes";

export const DashboardCantoScatterChart: React.FC<DashboardCantoScatterChartProps> = ({
  allCantos,
  cantosChartData,
  uniqueTopicsInCantos,
  selectedTopicCantoFilter,
  setSelectedTopicCantoFilter,
  cantoTimeRange,
  setCantoTimeRange,
  estadoDeForma,
  onManageCantos,
  onLogCanto,
  onSelectTopic,
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>("matrix");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedCantoId, setSelectedCantoId] = useState<string | null>(null);

  // Filtered chart data based on status filter
  const displayedData = useMemo(() => {
    let data = cantosChartData;
    if (statusFilter === "in_time") {
      data = data.filter((d) => d.isOptimal);
    } else if (statusFilter === "passed") {
      data = data.filter((d) => (d.nota || 0) >= 5);
    } else if (statusFilter === "with_mistakes") {
      data = data.filter((d) => d.mistakes && d.mistakes.trim().length > 0);
    }
    return data;
  }, [cantosChartData, statusFilter]);

  // Quadrant distribution metrics
  const quadrantStats = useMemo(() => {
    let zonaTribunal = 0; // In time (11:00-13:40) & grade >= 5
    let riesgoTiempo = 0; // Grade >= 5 but out of time window
    let riesgoMateria = 0; // In time but grade < 5
    let critico = 0; // Out of time and grade < 5

    cantosChartData.forEach((d) => {
      const inTime = d.isOptimal;
      const pass = (d.nota || 0) >= 5;
      if (inTime && pass) zonaTribunal++;
      else if (!inTime && pass) riesgoTiempo++;
      else if (inTime && !pass) riesgoMateria++;
      else critico++;
    });

    return {
      zonaTribunal,
      riesgoTiempo,
      riesgoMateria,
      critico,
      total: cantosChartData.length,
    };
  }, [cantosChartData]);

  // Rhythm distribution histogram (5 brackets)
  const distributionData = useMemo(() => {
    const bins = [
      {
        id: "short",
        label: "< 11:00 min",
        desc: "Cante Breve (Riesgo de corte)",
        color: "#f59e0b",
        bgBadge: "bg-amber-50 text-amber-700 border-amber-200",
        count: 0,
        grades: [] as number[],
      },
      {
        id: "low_window",
        label: "11:00 – 12:00 min",
        desc: "Zona Baja Reglamentaria",
        color: "#10b981",
        bgBadge: "bg-emerald-50 text-emerald-700 border-emerald-200",
        count: 0,
        grades: [] as number[],
      },
      {
        id: "optimal",
        label: "12:00 – 13:00 min",
        desc: "🎯 Zona Diana (12:30 Objetivo)",
        color: "#059669",
        bgBadge: "bg-emerald-100 text-emerald-800 border-emerald-300",
        count: 0,
        grades: [] as number[],
      },
      {
        id: "high_window",
        label: "13:00 – 13:40 min",
        desc: "Zona Límite Reglamentaria",
        color: "#6366f1",
        bgBadge: "bg-indigo-50 text-indigo-700 border-indigo-200",
        count: 0,
        grades: [] as number[],
      },
      {
        id: "excess",
        label: "> 13:40 min",
        desc: "Exceso Tiempo (Suspenso automático)",
        color: "#f43f5e",
        bgBadge: "bg-rose-50 text-rose-700 border-rose-200",
        count: 0,
        grades: [] as number[],
      },
    ];

    cantosChartData.forEach((d) => {
      const secs = d.totalSecs || d.duracion * 60;
      if (secs < 660) {
        bins[0].count++;
        if (d.nota !== null) bins[0].grades.push(d.nota);
      } else if (secs < 720) {
        bins[1].count++;
        if (d.nota !== null) bins[1].grades.push(d.nota);
      } else if (secs <= 780) {
        bins[2].count++;
        if (d.nota !== null) bins[2].grades.push(d.nota);
      } else if (secs <= 820) {
        bins[3].count++;
        if (d.nota !== null) bins[3].grades.push(d.nota);
      } else {
        bins[4].count++;
        if (d.nota !== null) bins[4].grades.push(d.nota);
      }
    });

    const total = cantosChartData.length || 1;
    return bins.map((b) => ({
      ...b,
      percentage: Math.round((b.count / total) * 100),
      avgGrade: b.grades.length > 0 ? (b.grades.reduce((acc, g) => acc + g, 0) / b.grades.length).toFixed(1) : "—",
    }));
  }, [cantosChartData]);

  // Selected Canto details for inspector
  const activeCanto = useMemo(() => {
    if (!selectedCantoId) return null;
    return cantosChartData.find((c) => c.id === selectedCantoId) || null;
  }, [selectedCantoId, cantosChartData]);

  // Scatter chart data formatted for Recharts Scatter
  const scatterPoints = useMemo(() => {
    return displayedData.map((d) => {
      const durMin = d.duracionMinDec || d.duracion;
      const nota = d.nota !== null ? d.nota : 0;
      const hasGrade = d.nota !== null;

      // Color coding according to tribunal rules
      let color = "#10b981"; // Emerald: Zona Tribunal
      let label = "Zona Tribunal";
      if (!d.isOptimal && hasGrade && nota >= 5) {
        color = "#f59e0b"; // Amber: Riesgo Tiempo
        label = "Riesgo Tiempo";
      } else if (d.isOptimal && (!hasGrade || nota < 5)) {
        color = "#8b5cf6"; // Violet: Riesgo Materia
        label = "Riesgo Materia";
      } else if (!d.isOptimal && (!hasGrade || nota < 5)) {
        color = "#f43f5e"; // Rose: Crítico
        label = "Crítico";
      }

      return {
        ...d,
        x: durMin,
        y: nota,
        z: 1,
        nodeColor: color,
        statusLabel: label,
      };
    });
  }, [displayedData]);

  // Dynamic X Domain for scatter
  const xDomain = useMemo(() => {
    if (scatterPoints.length === 0) return [8, 16];
    const minVal = Math.min(...scatterPoints.map((p) => p.x));
    const maxVal = Math.max(...scatterPoints.map((p) => p.x));
    return [Math.max(6, Math.floor(minVal - 1)), Math.min(20, Math.ceil(maxVal + 1))];
  }, [scatterPoints]);

  return (
    <div className="md:col-span-2 xl:col-span-3 bg-white/95 backdrop-blur-xl p-4 sm:p-6 lg:p-7 rounded-2xl shadow-xs border border-slate-200/80 flex flex-col relative overflow-hidden group">
      {/* Background ambient lighting */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-fuchsia-50/50 via-indigo-50/20 to-transparent rounded-full -mr-32 -mt-32 pointer-events-none blur-3xl" />

      {/* Header & Controls */}
      <div className="mb-4 relative z-10 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-fuchsia-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-fuchsia-500/20 shrink-0">
            <Mic size={20} strokeWidth={2.2} />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight flex flex-wrap items-center gap-2 font-serif">
              <span>Evolución de Cantos & Matriz de Tribunal</span>
              <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200 font-mono tabular-nums">
                {allCantos.length} {allCantos.length === 1 ? "canto" : "cantos"}
              </span>
            </h3>
            <p className="text-xs text-slate-500 font-medium mt-0.5 flex items-center gap-1.5">
              <span>Ventana reglamentaria oficial:</span>
              <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                11:00 – 13:40 min
              </span>
              <span className="text-slate-400">• Diana: 12:30 min</span>
            </p>
          </div>
        </div>

        {/* View Mode Switcher + Filters */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full xl:w-auto justify-start xl:justify-end flex-wrap">
          {/* View Mode Toggle */}
          <div className="inline-flex items-center bg-slate-100/90 p-1 rounded-xl border border-slate-200/80 text-xs font-bold text-slate-600 shadow-2xs">
            <button
              onClick={() => setViewMode("matrix")}
              className={cn(
                "px-2.5 py-1 rounded-lg transition-all text-center flex items-center gap-1.5",
                viewMode === "matrix" ? "bg-white text-slate-900 shadow-xs font-black" : "hover:text-slate-900 text-slate-500"
              )}
              title="Dispersión en 4 cuadrantes con ventana de tribunal"
            >
              <Compass size={13} className={viewMode === "matrix" ? "text-fuchsia-600" : "text-slate-400"} />
              <span>Matriz Tribunal</span>
            </button>
            <button
              onClick={() => setViewMode("timeline")}
              className={cn(
                "px-2.5 py-1 rounded-lg transition-all text-center flex items-center gap-1.5",
                viewMode === "timeline" ? "bg-white text-slate-900 shadow-xs font-black" : "hover:text-slate-900 text-slate-500"
              )}
              title="Evolución temporal con barras de duración y línea de calificación"
            >
              <TrendingUp size={13} className={viewMode === "timeline" ? "text-indigo-600" : "text-slate-400"} />
              <span>Temporal</span>
            </button>
            <button
              onClick={() => setViewMode("distribution")}
              className={cn(
                "px-2.5 py-1 rounded-lg transition-all text-center flex items-center gap-1.5",
                viewMode === "distribution" ? "bg-white text-slate-900 shadow-xs font-black" : "hover:text-slate-900 text-slate-500"
              )}
              title="Histograma de cadencia y distribución de ritmos"
            >
              <BarChart3 size={13} className={viewMode === "distribution" ? "text-emerald-600" : "text-slate-400"} />
              <span>Cadencia</span>
            </button>
          </div>

          {/* Topic selector */}
          {uniqueTopicsInCantos.length > 0 && (
            <select
              value={selectedTopicCantoFilter}
              onChange={(e) => setSelectedTopicCantoFilter(e.target.value)}
              className="text-xs font-bold bg-white border border-slate-200 hover:border-slate-300 text-slate-800 rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/20 max-w-[190px] truncate shadow-2xs cursor-pointer"
            >
              <option value="all">🎯 Todos los temas ({allCantos.length})</option>
              {uniqueTopicsInCantos.map((t) => (
                <option key={t.id} value={t.id}>
                  Tema {t.number}: {t.title.length > 18 ? t.title.substring(0, 18) + "..." : t.title} ({t.count})
                </option>
              ))}
            </select>
          )}

          {/* Time range */}
          <div className="inline-flex items-center bg-slate-100/90 p-0.5 rounded-xl border border-slate-200/80 text-[11px] font-bold text-slate-600">
            <button
              onClick={() => setCantoTimeRange("all")}
              className={cn(
                "px-2 py-1 rounded-lg transition-all",
                cantoTimeRange === "all" ? "bg-white text-slate-900 shadow-2xs font-black" : "hover:text-slate-900 text-slate-500"
              )}
            >
              Todos
            </button>
            <button
              onClick={() => setCantoTimeRange("30d")}
              className={cn(
                "px-2 py-1 rounded-lg transition-all",
                cantoTimeRange === "30d" ? "bg-white text-slate-900 shadow-2xs font-black" : "hover:text-slate-900 text-slate-500"
              )}
            >
              30d
            </button>
            <button
              onClick={() => setCantoTimeRange("20")}
              className={cn(
                "px-2 py-1 rounded-lg transition-all",
                cantoTimeRange === "20" ? "bg-white text-slate-900 shadow-2xs font-black" : "hover:text-slate-900 text-slate-500"
              )}
            >
              20
            </button>
            <button
              onClick={() => setCantoTimeRange("10")}
              className={cn(
                "px-2 py-1 rounded-lg transition-all",
                cantoTimeRange === "10" ? "bg-white text-slate-900 shadow-2xs font-black" : "hover:text-slate-900 text-slate-500"
              )}
            >
              10
            </button>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={onManageCantos}
              className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all active:scale-[0.98]"
            >
              <Sliders size={13} className="text-slate-500" />
              <span className="hidden sm:inline">Historial</span>
            </button>
            <button
              onClick={onLogCanto}
              className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black flex items-center gap-1.5 shadow-xs transition-all active:scale-[0.98]"
            >
              <Plus size={13} className="text-white" />
              <span>Registrar</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4 Apple Glass Vitals Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5 mb-4 relative z-10">
        {/* Card 1: Diagnóstico de Estado de Forma */}
        <div className="bg-slate-50/70 border border-slate-200/70 hover:border-slate-300 rounded-xl p-3 sm:p-3.5 flex flex-col justify-between transition-all group/vital">
          <div className="flex items-center justify-between gap-1 mb-1.5">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Activity size={12} className="text-fuchsia-500 shrink-0" />
              Estado de Forma
            </span>
            <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded-full border truncate", estadoDeForma.badgeClass)}>
              {estadoDeForma.diagnostico}
            </span>
          </div>
          <p className="text-[11px] text-slate-600 font-medium leading-relaxed line-clamp-2">
            {estadoDeForma.consejo}
          </p>
          <div className="mt-2 pt-1.5 border-t border-slate-200/60 flex items-center justify-between text-[10px] font-bold text-slate-400 font-mono tabular-nums">
            <span>Último cante:</span>
            <span className="text-slate-700 font-black">
              {estadoDeForma.diasUltimoCanto === null
                ? "—"
                : estadoDeForma.diasUltimoCanto === 0
                ? "Hoy"
                : `Hace ${estadoDeForma.diasUltimoCanto}d`}
            </span>
          </div>
        </div>

        {/* Card 2: Calificación Media */}
        <div className="bg-slate-50/70 border border-slate-200/70 hover:border-slate-300 rounded-xl p-3 sm:p-3.5 flex flex-col justify-between transition-all group/vital">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Target size={12} className="text-purple-500 shrink-0" />
              Nota Media
            </span>
            {estadoDeForma.tendenciaNota !== 0 && (
              <span
                className={cn(
                  "text-[9px] font-black px-1.5 py-0.5 rounded-full font-mono",
                  estadoDeForma.tendenciaNota > 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                )}
              >
                {estadoDeForma.tendenciaNota > 0 ? `+${estadoDeForma.tendenciaNota}` : estadoDeForma.tendenciaNota}
              </span>
            )}
          </div>
          <div className="flex items-baseline gap-1.5 font-mono tabular-nums">
            <span
              className={cn(
                "text-2xl sm:text-3xl font-black tracking-tight",
                estadoDeForma.notaMediaReciente >= 8
                  ? "text-emerald-600"
                  : estadoDeForma.notaMediaReciente >= 5
                  ? "text-slate-900"
                  : estadoDeForma.notaMediaReciente > 0
                  ? "text-rose-600"
                  : "text-slate-400"
              )}
            >
              {estadoDeForma.notaMediaReciente > 0 ? estadoDeForma.notaMediaReciente.toFixed(1) : "—"}
            </span>
            <span className="text-xs font-bold text-slate-400">/ 10</span>
          </div>
          <div className="mt-2 pt-1.5 border-t border-slate-200/60 flex items-center justify-between text-[10px] font-bold text-slate-500 font-mono tabular-nums">
            <span>Media histórica:</span>
            <span className="text-slate-700 font-black">
              {estadoDeForma.notaMediaHistorica > 0 ? `${estadoDeForma.notaMediaHistorica.toFixed(1)}/10` : "—"}
            </span>
          </div>
        </div>

        {/* Card 3: Ritmo y Cronómetro */}
        <div className="bg-slate-50/70 border border-slate-200/70 hover:border-slate-300 rounded-xl p-3 sm:p-3.5 flex flex-col justify-between transition-all group/vital">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Timer size={12} className="text-emerald-500 shrink-0" />
              Ritmo de Exposición
            </span>
            <span
              className={cn(
                "text-[9px] font-black px-1.5 py-0.5 rounded-full font-mono",
                estadoDeForma.porcentajeEnTiempoOptimo >= 70
                  ? "bg-emerald-100 text-emerald-800"
                  : estadoDeForma.porcentajeEnTiempoOptimo >= 40
                  ? "bg-amber-100 text-amber-800"
                  : "bg-slate-200 text-slate-700"
              )}
            >
              {estadoDeForma.porcentajeEnTiempoOptimo}% en ventana
            </span>
          </div>
          <div className="flex items-baseline gap-1 font-mono tabular-nums">
            <span className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              {estadoDeForma.tiempoMedioRecienteMin > 0 || estadoDeForma.tiempoMedioRecienteSec > 0
                ? `${estadoDeForma.tiempoMedioRecienteMin}m ${estadoDeForma.tiempoMedioRecienteSec.toString().padStart(2, "0")}s`
                : "—"}
            </span>
          </div>
          <div className="mt-2 pt-1.5 border-t border-slate-200/60 flex items-center justify-between text-[10px] font-bold text-slate-500 font-mono tabular-nums">
            <span>Objetivo diana:</span>
            <span className="text-emerald-700 font-black">12:30 min</span>
          </div>
        </div>

        {/* Card 4: Efectividad Tribunal */}
        <div className="bg-slate-50/70 border border-slate-200/70 hover:border-slate-300 rounded-xl p-3 sm:p-3.5 flex flex-col justify-between transition-all group/vital">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Award size={12} className="text-amber-500 shrink-0" />
              Efectividad Tribunal
            </span>
            <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-slate-200/70 text-slate-700 font-mono">
              Reglamento
            </span>
          </div>
          <div className="flex items-baseline gap-1.5 font-mono tabular-nums">
            <span className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              {allCantos.length > 0 ? `${estadoDeForma.aprobadosPorcentaje}%` : "—"}
            </span>
            <span className="text-xs font-bold text-slate-400">aptos</span>
          </div>
          <div className="mt-2 pt-1.5 border-t border-slate-200/60 flex items-center justify-between text-[10px] font-bold text-slate-500 font-mono tabular-nums">
            <span>Zona Tribunal:</span>
            <span className="text-emerald-700 font-black">
              {quadrantStats.zonaTribunal}/{quadrantStats.total}
            </span>
          </div>
        </div>
      </div>

      {/* Quadrants Mini Pills (Only shown in Matrix mode) */}
      {viewMode === "matrix" && cantosChartData.length > 0 && (
        <div className="flex items-center gap-2 mb-3 px-1 overflow-x-auto no-scrollbar text-[11px] font-bold font-mono">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider font-sans font-black mr-1 shrink-0">
            Cuadrantes:
          </span>
          <button
            onClick={() => setStatusFilter(statusFilter === "in_time" ? "all" : "in_time")}
            className={cn(
              "px-2.5 py-1 rounded-xl border flex items-center gap-1.5 shrink-0 transition-all",
              statusFilter === "in_time"
                ? "bg-emerald-600 text-white border-emerald-600 shadow-2xs"
                : "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
            )}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse" />
            <span>Zona Tribunal: {quadrantStats.zonaTribunal}</span>
          </button>

          <button
            onClick={() => setStatusFilter(statusFilter === "passed" ? "all" : "passed")}
            className={cn(
              "px-2.5 py-1 rounded-xl border flex items-center gap-1.5 shrink-0 transition-all",
              statusFilter === "passed"
                ? "bg-amber-600 text-white border-amber-600 shadow-2xs"
                : "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100"
            )}
          >
            <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
            <span>Riesgo Tiempo: {quadrantStats.riesgoTiempo}</span>
          </button>

          <div className="px-2.5 py-1 rounded-xl border bg-purple-50 text-purple-800 border-purple-200 flex items-center gap-1.5 shrink-0">
            <span className="w-2 h-2 rounded-full bg-purple-500 inline-block" />
            <span>Riesgo Materia: {quadrantStats.riesgoMateria}</span>
          </div>

          <div className="px-2.5 py-1 rounded-xl border bg-rose-50 text-rose-800 border-rose-200 flex items-center gap-1.5 shrink-0">
            <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />
            <span>Crítico: {quadrantStats.critico}</span>
          </div>

          {statusFilter !== "all" && (
            <button
              onClick={() => setStatusFilter("all")}
              className="text-[10px] text-slate-500 hover:text-slate-800 underline underline-offset-2 ml-1"
            >
              Limpiar filtro
            </button>
          )}
        </div>
      )}

      {/* Main Visual Presentation */}
      <div className="w-full relative z-10">
        {cantosChartData.length === 0 ? (
          <div className="w-full h-full min-h-[260px] flex flex-col items-center justify-center text-center p-6 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
            <div className="w-12 h-12 rounded-2xl bg-fuchsia-50 border border-fuchsia-200/60 flex items-center justify-center text-fuchsia-600 mb-2.5 shadow-2xs">
              <Mic size={22} />
            </div>
            <h4 className="text-sm font-black text-slate-800 mb-1">
              Sin Cantos Registrados en la Oposición
            </h4>
            <p className="text-xs text-slate-500 max-w-md mb-3 leading-relaxed font-medium">
              El tribunal exige estricto control de tiempo (ventana reglamentaria 11:00–13:40 min) y calidad expositiva. Registra tu primer simulacro.
            </p>
            <button
              onClick={onLogCanto}
              className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-black hover:bg-slate-800 transition-all flex items-center gap-1.5 shadow-xs active:scale-[0.98]"
            >
              <Plus size={14} /> Registrar Primer Canto
            </button>
          </div>
        ) : viewMode === "matrix" ? (
          /* ======================================================== */
          /* 1. SCATTER CHART (MATRIZ DE DISPERSIÓN & VENTANA TRIBUNAL) */
          /* ======================================================== */
          <div className="w-full">
            <div className="h-[300px] sm:h-[350px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.6} />

                  {/* Shaded Green Area for Official Regulatory Window [11:00 - 13:40 min] */}
                  <ReferenceArea
                    x1={11.0}
                    x2={13.667}
                    y1={0}
                    y2={10}
                    shape={(props: any) => (
                      <rect
                        x={props.x}
                        y={props.y}
                        width={props.width}
                        height={props.height}
                        fill="#10b981"
                        fillOpacity={0.08}
                        stroke="#10b981"
                        strokeOpacity={0.4}
                        strokeDasharray="3 3"
                        rx={4}
                      />
                    )}
                  />

                  {/* Optimal Line 12:30 min */}
                  <ReferenceLine
                    x={12.5}
                    stroke="#f59e0b"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    label={{
                      value: "🎯 12:30 Diana",
                      position: "top",
                      fill: "#d97706",
                      fontSize: 10,
                      fontWeight: 800,
                    }}
                  />

                  {/* Lower bound 11:00 min */}
                  <ReferenceLine
                    x={11.0}
                    stroke="#10b981"
                    strokeWidth={1.5}
                    strokeDasharray="3 3"
                    label={{
                      value: "Mín 11:00",
                      position: "insideTopLeft",
                      fill: "#059669",
                      fontSize: 9,
                      fontWeight: 800,
                    }}
                  />

                  {/* Upper bound 13:40 min */}
                  <ReferenceLine
                    x={13.667}
                    stroke="#f43f5e"
                    strokeWidth={1.5}
                    strokeDasharray="3 3"
                    label={{
                      value: "Máx 13:40",
                      position: "insideTopRight",
                      fill: "#e11d48",
                      fontSize: 9,
                      fontWeight: 800,
                    }}
                  />

                  {/* Cutoff Grade 5.0 */}
                  <ReferenceLine
                    y={5.0}
                    stroke="#8b5cf6"
                    strokeWidth={1.5}
                    strokeDasharray="3 3"
                    strokeOpacity={0.7}
                    label={{
                      value: "Corte (5.0)",
                      position: "insideBottomLeft",
                      fill: "#7c3aed",
                      fontSize: 9,
                      fontWeight: 800,
                    }}
                  />

                  {/* Excellence Grade 8.5 */}
                  <ReferenceLine
                    y={8.5}
                    stroke="#10b981"
                    strokeWidth={1.5}
                    strokeDasharray="3 3"
                    strokeOpacity={0.7}
                    label={{
                      value: "Excelencia (8.5)",
                      position: "insideTopLeft",
                      fill: "#059669",
                      fontSize: 9,
                      fontWeight: 800,
                    }}
                  />

                  <XAxis
                    type="number"
                    dataKey="x"
                    name="Duración"
                    domain={xDomain}
                    unit="m"
                    tickCount={8}
                    axisLine={{ stroke: "#cbd5e1" }}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: "#64748b", fontWeight: 700 }}
                  />

                  <YAxis
                    type="number"
                    dataKey="y"
                    name="Calificación"
                    domain={[0, 10]}
                    ticks={[0, 2.5, 5, 7.5, 10]}
                    unit=""
                    axisLine={{ stroke: "#cbd5e1" }}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: "#8b5cf6", fontWeight: 700 }}
                  />

                  <ZAxis type="number" dataKey="z" range={[90, 120]} />

                  <Tooltip
                    cursor={{ strokeDasharray: "3 3", stroke: "#94a3b8" }}
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      const pt = payload[0].payload;
                      const dev = pt.deviationSecs;
                      const devStr =
                        dev === 0
                          ? "Clavado en 12:30"
                          : dev > 0
                          ? `+${dev}s vs 12:30`
                          : `${dev}s vs 12:30`;

                      return (
                        <div className="bg-white/98 backdrop-blur-xl p-3.5 rounded-2xl shadow-2xl border border-slate-200 text-slate-800 text-xs min-w-[220px] max-w-[260px] z-50">
                          <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-slate-100">
                            <span className="font-black text-slate-900 font-mono flex items-center gap-1.5">
                              <span
                                className="w-2.5 h-2.5 rounded-full inline-block"
                                style={{ backgroundColor: pt.nodeColor }}
                              />
                              Tema {pt.topicNumber} • Canto #{pt.cantoNum}
                            </span>
                            <span className="text-[10px] font-bold text-slate-400 font-mono">
                              {pt.fecha}
                            </span>
                          </div>

                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-slate-500 font-medium flex items-center gap-1">
                                <Clock size={12} className="text-emerald-500" /> Tiempo:
                              </span>
                              <div className="text-right">
                                <span className="font-black font-mono tabular-nums text-slate-900">
                                  {pt.duracionStr}
                                </span>
                                <span className="block text-[9px] font-bold text-slate-400 font-mono">
                                  {devStr}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center justify-between">
                              <span className="text-slate-500 font-medium flex items-center gap-1">
                                <Target size={12} className="text-purple-500" /> Nota:
                              </span>
                              <span className="font-black font-mono tabular-nums text-slate-900">
                                {pt.nota !== null ? `${pt.nota.toFixed(1)}/10` : "Sin nota"}
                              </span>
                            </div>

                            <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                              <span className="text-slate-400 text-[10px] font-bold">Estado:</span>
                              <span
                                className="text-[10px] font-black px-1.5 py-0.5 rounded-md font-mono"
                                style={{
                                  backgroundColor: `${pt.nodeColor}15`,
                                  color: pt.nodeColor,
                                }}
                              >
                                {pt.statusLabel}
                              </span>
                            </div>

                            {pt.mistakes && (
                              <p className="text-[10px] text-rose-700 bg-rose-50/70 p-1.5 rounded-lg border border-rose-100 mt-1 line-clamp-2">
                                {pt.mistakes}
                              </p>
                            )}

                            <p className="text-[9px] text-slate-400 text-center pt-1 italic">
                              Haz clic para inspeccionar detalles
                            </p>
                          </div>
                        </div>
                      );
                    }}
                  />

                  <Scatter
                    name="Cantos"
                    data={scatterPoints}
                    onClick={(entry) => {
                      if (entry && entry.id) {
                        setSelectedCantoId(selectedCantoId === entry.id ? null : entry.id);
                      }
                    }}
                    cursor="pointer"
                  >
                    {scatterPoints.map((entry, index) => (
                      <Cell
                        key={`scatter-cell-${index}`}
                        fill={entry.nodeColor}
                        stroke="#fff"
                        strokeWidth={selectedCantoId === entry.id ? 3 : 2}
                        className="transition-all hover:opacity-100 duration-150"
                      />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : viewMode === "timeline" ? (
          /* ======================================================== */
          /* 2. COMPOSED CHART (EVOLUCIÓN TEMPORAL CRONOLÓGICA)       */
          /* ======================================================== */
          <div className="w-full overflow-x-auto no-scrollbar overscroll-x-contain">
            <div
              className="h-[300px] sm:h-[350px]"
              style={{
                minWidth: displayedData.length > 12 ? `${Math.max(100, displayedData.length * 36)}px` : "100%",
                width: "100%",
              }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={displayedData} margin={{ top: 20, right: 10, left: -20, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" strokeOpacity={0.6} />
                  <XAxis
                    dataKey="cantoNum"
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                    tick={({ x, y, payload }) => {
                      const item = displayedData.find((d) => d.cantoNum === payload.value) || displayedData[payload.index];
                      if (!item) return null;
                      return (
                        <g transform={`translate(${x},${y})`}>
                          <text x={0} y={0} dy={10} textAnchor="middle" fill="#0f172a" fontSize={9.5} fontWeight={800}>
                            T.{item.topicNumber}
                          </text>
                          <text x={0} y={0} dy={21} textAnchor="middle" fill="#94a3b8" fontSize={8} fontWeight={600}>
                            #{item.cantoNum}
                          </text>
                        </g>
                      );
                    }}
                    height={34}
                  />
                  <YAxis
                    yAxisId="left"
                    axisLine={false}
                    tickLine={false}
                    unit="m"
                    width={28}
                    domain={[0, (dataMax: number) => Math.max(18, Math.ceil((dataMax || 15) + 2))]}
                    tick={{ fontSize: 9.5, fill: "#64748b", fontWeight: 700 }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    domain={[0, 10]}
                    ticks={[0, 2.5, 5, 7.5, 10]}
                    axisLine={false}
                    tickLine={false}
                    width={24}
                    tick={{ fontSize: 9.5, fill: "#8b5cf6", fontWeight: 700 }}
                  />

                  {/* Regulatory reference lines */}
                  <ReferenceLine
                    yAxisId="left"
                    y={13.67}
                    stroke="#f43f5e"
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                    label={{
                      value: "Máx. 13:40 (Suspenso)",
                      position: "insideTopLeft",
                      fill: "#e11d48",
                      fontSize: 9,
                      fontWeight: 800,
                    }}
                  />
                  <ReferenceLine
                    yAxisId="left"
                    y={12.5}
                    stroke="#f59e0b"
                    strokeDasharray="3 3"
                    strokeWidth={1.5}
                    label={{
                      value: "Diana 12:30",
                      position: "insideTopLeft",
                      fill: "#d97706",
                      fontSize: 9,
                      fontWeight: 800,
                    }}
                  />
                  <ReferenceLine
                    yAxisId="left"
                    y={11.0}
                    stroke="#10b981"
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                    label={{
                      value: "Mín. 11:00",
                      position: "insideBottomLeft",
                      fill: "#059669",
                      fontSize: 9,
                      fontWeight: 800,
                    }}
                  />
                  <ReferenceLine
                    yAxisId="right"
                    y={5.0}
                    stroke="#8b5cf6"
                    strokeDasharray="3 3"
                    strokeWidth={1.5}
                    strokeOpacity={0.7}
                    label={{
                      position: "insideBottomRight",
                      value: "Aprobado (5.0)",
                      fill: "#7c3aed",
                      fontSize: 9,
                      fontWeight: 800,
                    }}
                  />

                  <Tooltip
                    cursor={{ fill: "rgba(241, 245, 249, 0.6)" }}
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      const data = payload[0].payload;
                      return (
                        <div className="bg-white/98 backdrop-blur-md p-3 rounded-2xl shadow-xl border border-slate-200 text-slate-800 text-xs min-w-[210px] z-50">
                          <div className="flex items-center justify-between gap-2 pb-1.5 mb-1.5 border-b border-slate-100">
                            <span className="font-black text-slate-900 font-mono">
                              Tema {data.topicNumber} • Canto #{data.cantoNum}
                            </span>
                            <span className="text-[10px] font-bold text-slate-400 font-mono">
                              {data.fecha}
                            </span>
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-slate-500 font-medium flex items-center gap-1">
                                <Clock size={11} className="text-emerald-500" /> Tiempo:
                              </span>
                              <span className="font-black font-mono tabular-nums text-slate-900">
                                {data.duracionStr}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-slate-500 font-medium flex items-center gap-1">
                                <Target size={11} className="text-purple-500" /> Nota:
                              </span>
                              <span className="font-black font-mono tabular-nums text-slate-900">
                                {data.nota !== null ? `${data.nota.toFixed(1)}/10` : "Sin nota"}
                              </span>
                            </div>
                            {data.mistakes && (
                              <p className="text-[10px] text-rose-600 bg-rose-50/60 p-1.5 rounded-lg border border-rose-100 mt-1">
                                {data.mistakes}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    }}
                  />

                  <Bar
                    yAxisId="left"
                    dataKey="duracion"
                    radius={[4, 4, 0, 0]}
                    barSize={displayedData.length > 20 ? 10 : displayedData.length > 10 ? 14 : 20}
                    onClick={(entry) => {
                      if (entry && entry.id) {
                        setSelectedCantoId(selectedCantoId === entry.id ? null : entry.id);
                      }
                    }}
                    cursor="pointer"
                  >
                    {displayedData.map((entry: any, index: number) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.barColor}
                        fillOpacity={selectedCantoId === entry.id ? 1 : 0.85}
                      />
                    ))}
                  </Bar>

                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="nota"
                    stroke="#8b5cf6"
                    strokeWidth={2.5}
                    dot={{
                      r: displayedData.length > 25 ? 2.5 : 3.5,
                      fill: "#fff",
                      stroke: "#8b5cf6",
                      strokeWidth: 2,
                    }}
                    activeDot={{ r: 5, fill: "#8b5cf6", stroke: "#fff", strokeWidth: 2 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          /* ======================================================== */
          /* 3. HISTOGRAM & RHYTHM DISTRIBUTION VIEW                  */
          /* ======================================================== */
          <div className="py-2 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-2.5">
              {distributionData.map((bin) => (
                <div
                  key={bin.id}
                  className="bg-slate-50/70 border border-slate-200/80 rounded-xl p-3 flex flex-col justify-between hover:border-slate-300 transition-all"
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="text-[10px] font-black text-slate-500 font-mono">
                      {bin.label}
                    </span>
                    <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded-full border", bin.bgBadge)}>
                      {bin.count}
                    </span>
                  </div>

                  <p className="text-[10px] text-slate-400 font-medium mb-2 truncate">
                    {bin.desc}
                  </p>

                  <div>
                    <div className="flex items-baseline justify-between mb-1 text-xs font-mono tabular-nums">
                      <span className="font-black text-slate-900 text-lg">
                        {bin.percentage}%
                      </span>
                      <span className="text-[10px] text-slate-400 font-bold">
                        Nota: <strong className="text-slate-700">{bin.avgGrade}</strong>
                      </span>
                    </div>

                    <div className="w-full h-1.5 bg-slate-200/70 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${bin.percentage}%`,
                          backgroundColor: bin.color,
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Rhythm Analysis Callout */}
            <div className="bg-gradient-to-r from-emerald-50/80 via-indigo-50/50 to-purple-50/80 border border-emerald-200/70 rounded-xl p-3 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Sparkles size={16} />
                </div>
                <div>
                  <h5 className="text-xs font-black text-slate-900">
                    Diagnóstico de Cadencia de Tribunal
                  </h5>
                  <p className="text-[11px] text-slate-600 font-medium mt-0.5">
                    {distributionData[1].percentage + distributionData[2].percentage + distributionData[3].percentage >= 70
                      ? "Control magistral: Más del 70% de tus cantos caen dentro del margen legal. Mantén el cronómetro en 12:30 min para absorber imprevistos."
                      : "Ajuste necesario: Dispersión alta de cronómetro. Practica con metrónomo vocal y fija marcas temporales en cada epígrafe."}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto shrink-0 font-mono text-xs">
                <span className="text-slate-500 font-bold">Objetivo legal:</span>
                <span className="bg-white px-2.5 py-1 rounded-lg border border-slate-200 font-black text-emerald-700 shadow-2xs">
                  ≥ 80% en 11–13:40m
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Selected Canto Telemetry Inspector Panel */}
      {activeCanto && (
        <div className="mt-4 p-3.5 sm:p-4 rounded-xl bg-gradient-to-r from-slate-900 to-slate-800 text-white shadow-lg relative z-20 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center justify-between gap-3 pb-2.5 mb-2.5 border-b border-slate-700/60">
            <div className="flex items-center gap-2.5">
              <div
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: activeCanto.barColor }}
              />
              <h4 className="text-xs sm:text-sm font-black tracking-tight flex items-center gap-2">
                <span>Tema {activeCanto.topicNumber}: {activeCanto.topicTitle}</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/10 text-slate-300 font-bold">
                  Canto #{activeCanto.cantoNum}
                </span>
              </h4>
            </div>

            <div className="flex items-center gap-1.5">
              {onSelectTopic && activeCanto.topicId && (
                <button
                  onClick={() => onSelectTopic(activeCanto.topicId)}
                  className="px-2.5 py-1 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 text-[11px] font-bold border border-indigo-400/30 flex items-center gap-1 transition-all"
                >
                  <span>Abrir Tema</span>
                  <ChevronRight size={12} />
                </button>
              )}
              <button
                onClick={() => setSelectedCantoId(null)}
                className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-all"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
            <div>
              <span className="text-[10px] text-slate-400 block font-sans">Duración Registrada</span>
              <span className="text-base font-black text-white">{activeCanto.duracionStr}</span>
              <span className="text-[10px] text-slate-400 block">
                {activeCanto.deviationSecs === 0
                  ? "En el objetivo exacto"
                  : activeCanto.deviationSecs > 0
                  ? `+${activeCanto.deviationSecs}s sobre 12:30`
                  : `${activeCanto.deviationSecs}s bajo 12:30`}
              </span>
            </div>

            <div>
              <span className="text-[10px] text-slate-400 block font-sans">Calificación</span>
              <span className="text-base font-black text-purple-300">
                {activeCanto.nota !== null ? `${activeCanto.nota.toFixed(1)} / 10` : "Sin calificar"}
              </span>
              <span className="text-[10px] text-slate-400 block">
                {activeCanto.isApproved ? "Aprobado" : "Suspenso"}
              </span>
            </div>

            <div>
              <span className="text-[10px] text-slate-400 block font-sans">Ventana Tribunal</span>
              <span
                className={cn(
                  "text-xs font-black px-2 py-0.5 rounded-md inline-block mt-0.5",
                  activeCanto.isOptimal
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                    : activeCanto.isExcess
                    ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                    : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                )}
              >
                {activeCanto.isOptimal ? "En Tiempo Legal" : activeCanto.isExcess ? "Exceso (+13:40)" : "Breve (-11:00)"}
              </span>
            </div>

            <div>
              <span className="text-[10px] text-slate-400 block font-sans">Fecha Exposición</span>
              <span className="text-xs font-bold text-slate-200 mt-1 block">
                {activeCanto.fecha || activeCanto.date}
              </span>
            </div>
          </div>

          {(activeCanto.mistakes || activeCanto.notes) && (
            <div className="mt-2.5 pt-2 border-t border-slate-700/60 text-xs">
              {activeCanto.mistakes && (
                <p className="text-rose-300 text-[11px] font-medium flex items-start gap-1.5 mb-1">
                  <AlertTriangle size={13} className="shrink-0 text-rose-400 mt-0.5" />
                  <span><strong>Observaciones / Fallos:</strong> {activeCanto.mistakes}</span>
                </p>
              )}
              {activeCanto.notes && (
                <p className="text-slate-300 text-[11px] font-medium">
                  <strong>Notas preparador:</strong> {activeCanto.notes}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Footer Legend */}
      <div className="mt-3.5 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[10px] font-bold text-slate-500">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block shadow-2xs" />
            <span>Zona Tribunal (11:00–13:40m)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block shadow-2xs" />
            <span>Riesgo Tiempo (Fuera margen)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block shadow-2xs" />
            <span>Riesgo Materia (&lt;5.0)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block shadow-2xs" />
            <span>Crítico</span>
          </span>
          <span className="flex items-center gap-1 text-amber-600 font-mono">
            <span className="w-3 h-0.5 bg-amber-500 inline-block" />
            <span>Diana 12:30</span>
          </span>
        </div>

        <div className="flex items-center gap-2 font-mono text-[10px] text-slate-400">
          <span>Oposición Judicatura</span>
        </div>
      </div>
    </div>
  );
};
