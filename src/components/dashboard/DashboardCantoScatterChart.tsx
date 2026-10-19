import React from "react";
import { Mic, Activity, Target, Timer, Award, Sliders, Plus, Clock } from "lucide-react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { cn } from "../../lib/utils";

interface DashboardCantoScatterChartProps {
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
}

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
}) => {
  return (
    <div className="md:col-span-2 xl:col-span-3 bg-white/95 backdrop-blur-xl p-4 sm:p-6 lg:p-7 rounded-2xl shadow-xs border border-slate-200/80 flex flex-col relative overflow-hidden group">
      {/* Header & Controls */}
      <div className="mb-4 relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-3 sm:gap-4 border-b border-slate-100 pb-3.5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-fuchsia-50 text-fuchsia-700 flex items-center justify-center border border-fuchsia-200/60 shrink-0">
            <Mic size={18} />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight flex flex-wrap items-center gap-2">
              <span>Evolución de Cantos y Estado de Forma</span>
              <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200 font-mono tabular-nums">
                {allCantos.length} {allCantos.length === 1 ? "canto" : "cantos"}
              </span>
            </h3>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Control del cronómetro de tribunal (11:00–13:40 min) y progresión de notas
            </p>
          </div>
        </div>

        {/* Filter Controls & Actions */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto justify-start md:justify-end flex-wrap">
          {uniqueTopicsInCantos.length > 0 && (
            <select
              value={selectedTopicCantoFilter}
              onChange={(e) => setSelectedTopicCantoFilter(e.target.value)}
              className="text-xs font-bold bg-white border border-slate-200 hover:border-slate-300 text-slate-800 rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/20 max-w-[200px] truncate shadow-2xs cursor-pointer"
            >
              <option value="all">🎯 Todos los temas ({allCantos.length})</option>
              {uniqueTopicsInCantos.map((t) => (
                <option key={t.id} value={t.id}>
                  Tema {t.number}: {t.title.length > 20 ? t.title.substring(0, 20) + "..." : t.title} ({t.count})
                </option>
              ))}
            </select>
          )}

          <div className="inline-flex items-center bg-slate-100/90 p-0.5 rounded-xl border border-slate-200/80 text-[11px] font-bold text-slate-600">
            <button
              onClick={() => setCantoTimeRange("all")}
              className={cn(
                "px-2.5 py-1 rounded-lg transition-all text-center",
                cantoTimeRange === "all" ? "bg-white text-slate-900 shadow-2xs font-black" : "hover:text-slate-900 text-slate-500"
              )}
            >
              Todos
            </button>
            <button
              onClick={() => setCantoTimeRange("30d")}
              className={cn(
                "px-2.5 py-1 rounded-lg transition-all text-center",
                cantoTimeRange === "30d" ? "bg-white text-slate-900 shadow-2xs font-black" : "hover:text-slate-900 text-slate-500"
              )}
            >
              30d
            </button>
            <button
              onClick={() => setCantoTimeRange("20")}
              className={cn(
                "px-2.5 py-1 rounded-lg transition-all text-center",
                cantoTimeRange === "20" ? "bg-white text-slate-900 shadow-2xs font-black" : "hover:text-slate-900 text-slate-500"
              )}
            >
              20
            </button>
            <button
              onClick={() => setCantoTimeRange("10")}
              className={cn(
                "px-2.5 py-1 rounded-lg transition-all text-center",
                cantoTimeRange === "10" ? "bg-white text-slate-900 shadow-2xs font-black" : "hover:text-slate-900 text-slate-500"
              )}
            >
              10
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={onManageCantos}
              className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all active:scale-[0.98]"
            >
              <Sliders size={13} className="text-slate-500" />
              Gestionar
            </button>
            <button
              onClick={onLogCanto}
              className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black flex items-center gap-1.5 shadow-2xs transition-all active:scale-[0.98]"
            >
              <Plus size={13} className="text-white" />
              Registrar Canto
            </button>
          </div>
        </div>
      </div>

      {/* 4 Vitals Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5 mb-4 relative z-10">
        {/* Card 1: Diagnóstico */}
        <div className="bg-slate-50/80 border border-slate-200/70 rounded-xl p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1 mb-1.5">
            <span className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1">
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
          {estadoDeForma.diasUltimoCanto !== null && (
            <div className="mt-1 text-[9px] font-bold text-slate-400 font-mono tabular-nums">
              Último: {estadoDeForma.diasUltimoCanto === 0 ? "hoy" : `hace ${estadoDeForma.diasUltimoCanto}d`}
            </div>
          )}
        </div>

        {/* Card 2: Nota Media */}
        <div className="bg-slate-50/80 border border-slate-200/70 rounded-xl p-3 flex flex-col justify-between">
          <span className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1 mb-1.5">
            <Target size={12} className="text-purple-500 shrink-0" />
            Nota Media
          </span>
          <div className="flex items-baseline gap-1.5 font-mono tabular-nums">
            <span
              className={cn(
                "text-2xl font-black tracking-tight",
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
            <span className="text-[10px] font-bold text-slate-400">/ 10</span>
            {estadoDeForma.tendenciaNota !== 0 && (
              <span
                className={cn(
                  "text-[9px] font-black px-1.5 py-0.5 rounded-full ml-auto",
                  estadoDeForma.tendenciaNota > 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                )}
              >
                {estadoDeForma.tendenciaNota > 0 ? `+${estadoDeForma.tendenciaNota}` : estadoDeForma.tendenciaNota}
              </span>
            )}
          </div>
          <div className="mt-1 text-[9px] font-bold text-slate-500 font-mono tabular-nums">
            Histórica: {estadoDeForma.notaMediaHistorica > 0 ? `${estadoDeForma.notaMediaHistorica.toFixed(1)}/10` : "—"}
          </div>
        </div>

        {/* Card 3: Ritmo */}
        <div className="bg-slate-50/80 border border-slate-200/70 rounded-xl p-3 flex flex-col justify-between">
          <span className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1 mb-1.5">
            <Timer size={12} className="text-emerald-500 shrink-0" />
            Ritmo Exposición
          </span>
          <div className="flex items-baseline gap-1 font-mono tabular-nums">
            <span className="text-2xl font-black text-slate-900 tracking-tight">
              {estadoDeForma.tiempoMedioRecienteMin > 0 || estadoDeForma.tiempoMedioRecienteSec > 0
                ? `${estadoDeForma.tiempoMedioRecienteMin}m ${estadoDeForma.tiempoMedioRecienteSec > 0 ? `${estadoDeForma.tiempoMedioRecienteSec}s` : ""}`
                : "—"}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between text-[9px] font-bold font-mono tabular-nums">
            <span className="text-slate-500">En 11–13:40m:</span>
            <span
              className={cn(
                "px-1.5 py-0.5 rounded font-black",
                estadoDeForma.porcentajeEnTiempoOptimo >= 70
                  ? "bg-emerald-100 text-emerald-800"
                  : estadoDeForma.porcentajeEnTiempoOptimo >= 40
                  ? "bg-amber-100 text-amber-800"
                  : "bg-slate-200 text-slate-700"
              )}
            >
              {estadoDeForma.porcentajeEnTiempoOptimo}%
            </span>
          </div>
        </div>

        {/* Card 4: Efectividad */}
        <div className="bg-slate-50/80 border border-slate-200/70 rounded-xl p-3 flex flex-col justify-between">
          <span className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1 mb-1.5">
            <Award size={12} className="text-amber-500 shrink-0" />
            Efectividad
          </span>
          <div className="flex items-baseline gap-1.5 font-mono tabular-nums">
            <span className="text-2xl font-black text-slate-900 tracking-tight">
              {allCantos.length > 0 ? `${estadoDeForma.aprobadosPorcentaje}%` : "—"}
            </span>
            <span className="text-[10px] font-bold text-slate-400">aprobados</span>
          </div>
          <div className="mt-1 text-[9px] font-bold text-slate-500 truncate" title="Para aprobar: nota ≥ 5.0 y duración entre 11:00 y 13:40 min">
            Nota ≥ 5 en 11–13:40m
          </div>
        </div>
      </div>

      {/* Dual Chart */}
      <div className="w-full relative z-10">
        {cantosChartData.length > 0 ? (
          <div className="w-full overflow-x-auto no-scrollbar overscroll-x-contain">
            <div
              className="h-[270px] sm:h-[310px]"
              style={{
                minWidth: cantosChartData.length > 12 ? `${Math.max(100, cantosChartData.length * 34)}px` : "100%",
                width: "100%",
              }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={cantosChartData} margin={{ top: 15, right: 4, left: -22, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" strokeOpacity={0.6} />
                  <XAxis
                    dataKey="cantoNum"
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                    tick={({ x, y, payload }) => {
                      const item = cantosChartData.find((d) => d.cantoNum === payload.value) || cantosChartData[payload.index];
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
                    height={32}
                  />
                  <YAxis
                    yAxisId="left"
                    axisLine={false}
                    tickLine={false}
                    unit="m"
                    width={26}
                    domain={[0, (dataMax: number) => Math.max(18, Math.ceil((dataMax || 15) + 2))]}
                    tick={{ fontSize: 9, fill: "#64748b", fontWeight: 700 }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    domain={[0, 10]}
                    ticks={[0, 2.5, 5, 7.5, 10]}
                    axisLine={false}
                    tickLine={false}
                    width={22}
                    tick={{ fontSize: 9, fill: "#8b5cf6", fontWeight: 700 }}
                  />
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
                    y={11}
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
                    y={5}
                    stroke="#8b5cf6"
                    strokeDasharray="3 3"
                    strokeWidth={1.5}
                    strokeOpacity={0.6}
                    label={{
                      position: "insideBottomRight",
                      value: "Aprobado (5.0)",
                      fill: "#7c3aed",
                      fontSize: 9,
                      fontWeight: 800,
                    }}
                  />
                  <ReferenceLine
                    yAxisId="right"
                    y={8}
                    stroke="#10b981"
                    strokeDasharray="3 3"
                    strokeWidth={1.5}
                    label={{
                      position: "insideTopRight",
                      value: "Meta (8.0)",
                      fill: "#10b981",
                      fontSize: 9,
                      fontWeight: 800,
                    }}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(241, 245, 249, 0.6)" }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
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
                      }
                      return null;
                    }}
                  />
                  <Bar
                    yAxisId="left"
                    dataKey="duracion"
                    radius={[4, 4, 0, 0]}
                    barSize={cantosChartData.length > 20 ? 10 : cantosChartData.length > 10 ? 14 : 20}
                  >
                    {cantosChartData.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={entry.barColor} fillOpacity={0.85} />
                    ))}
                  </Bar>
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="nota"
                    stroke="#8b5cf6"
                    strokeWidth={2.5}
                    dot={{
                      r: cantosChartData.length > 25 ? 2.5 : 3.5,
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
          <div className="w-full h-full min-h-[220px] flex flex-col items-center justify-center text-center p-6 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
            <div className="w-10 h-10 rounded-2xl bg-fuchsia-50 border border-fuchsia-200/60 flex items-center justify-center text-fuchsia-600 mb-2.5 shadow-2xs">
              <Mic size={18} />
            </div>
            <h4 className="text-xs font-black text-slate-800 mb-1">
              Sin Cantos Registrados en la Oposición
            </h4>
            <p className="text-[11px] text-slate-500 max-w-md mb-3 leading-relaxed font-medium">
              El tribunal evalúa tiempo (ventana oficial 11:00–13:40 min) y nota. Registra tu primera exposición.
            </p>
            <button
              onClick={onLogCanto}
              className="px-3.5 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-black hover:bg-slate-800 transition-all flex items-center gap-1.5 shadow-2xs active:scale-[0.98]"
            >
              <Plus size={13} /> Registrar Primer Canto
            </button>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[10px] font-bold text-slate-500">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-xs bg-emerald-500 inline-block" />
            <span>Válido (11:00–13:40m)</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-xs bg-rose-500 inline-block" />
            <span>Exceso (&gt;13:40m)</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-xs bg-amber-500 inline-block" />
            <span>Breve (&lt;11m)</span>
          </span>
          <span className="flex items-center gap-1 text-purple-600">
            <span className="w-2 h-2 rounded-full bg-purple-500 inline-block ring-2 ring-white" />
            <span>Calificación (≥5.0)</span>
          </span>
        </div>
      </div>
    </div>
  );
};
