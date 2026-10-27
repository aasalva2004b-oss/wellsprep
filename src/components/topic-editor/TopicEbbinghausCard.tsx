import React from "react";
import { BrainCircuit, CheckCircle2, ShieldCheck, AlertTriangle, AlertCircle, Zap, Clock, Scale, Mic, RefreshCw, Award, Sparkles } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";
import { cn } from "../../lib/utils";
import { EbbinghausAnalysis, formatTimeMins } from "../../lib/ebbinghaus";

interface TopicEbbinghausCardProps {
  ebbinghausAnalysis: EbbinghausAnalysis;
}

export const TopicEbbinghausCard: React.FC<TopicEbbinghausCardProps> = ({
  ebbinghausAnalysis,
}) => {
  return (
    <div className="bg-slate-900 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-xl border border-slate-800 flex flex-col relative overflow-hidden group">
      {/* Dynamic ambient glow based on status */}
      <div
        className={cn(
          "absolute -top-16 -right-16 w-80 h-80 rounded-full blur-3xl opacity-25 pointer-events-none transition-all duration-700",
          ebbinghausAnalysis.status === "excelente"
            ? "bg-emerald-500/30"
            : ebbinghausAnalysis.status === "bueno"
            ? "bg-indigo-500/30"
            : ebbinghausAnalysis.status === "atencion"
            ? "bg-amber-500/30"
            : "bg-rose-500/30"
        )}
      />

      {/* Header */}
      <div className="mb-4 relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border-b border-slate-800/80 pb-3.5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
              <BrainCircuit size={14} />
            </div>
            <h3 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
              Curva del Olvido de Ebbinghaus
            </h3>
            <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-mono">
              Fijadores Ponderados (Cantos & Vueltas)
            </span>
          </div>
          <p className="text-xs font-medium text-slate-400">
            Freno de olvido diferencial: cante oral 100%, repasos 50% y multiplicación sináptica por vueltas
          </p>
        </div>

        {/* Status Badges */}
        <div className="flex items-center gap-2 flex-wrap self-stretch md:self-auto justify-start md:justify-end">
          {ebbinghausAnalysis.hasData ? (
            <>
              <div
                className={cn(
                  "px-3 py-1.5 rounded-xl border flex items-center gap-2 backdrop-blur-md",
                  ebbinghausAnalysis.statusBadgeClass
                )}
              >
                <span className="w-2 h-2 rounded-full animate-pulse bg-current" />
                <div className="text-left">
                  <div className="flex items-center gap-1.5 leading-none">
                    <span className="text-base font-black font-mono tabular-nums text-white">
                      {ebbinghausAnalysis.currentRetention}%
                    </span>
                    <span className="text-[9px] font-black uppercase tracking-wider opacity-90">
                      Retención Hoy
                    </span>
                  </div>
                  <p className="text-[9px] font-bold opacity-80 mt-0.5">
                    {ebbinghausAnalysis.statusTitle}
                  </p>
                </div>
              </div>

              <div className="bg-slate-800/90 border border-slate-700/80 px-3 py-1.5 rounded-xl text-left md:text-right backdrop-blur-md">
                {ebbinghausAnalysis.daysUntilCritical80 > 0 ? (
                  <>
                    <div className="flex items-center md:justify-end gap-1 leading-none font-mono tabular-nums">
                      <span className="text-sm font-black text-emerald-400">
                        +{ebbinghausAnalysis.daysUntilCritical80}d
                      </span>
                      <span className="text-[9px] font-black text-slate-300 uppercase tracking-wider">
                        de margen
                      </span>
                    </div>
                    <p className="text-[9px] font-bold text-slate-400 mt-0.5 font-mono">
                      {ebbinghausAnalysis.critical80DateStr ? `Límite 80%: ${ebbinghausAnalysis.critical80DateStr}` : "Sobre umbral 80%"}
                    </p>
                  </>
                ) : (
                  <>
                    <div className="flex items-center md:justify-end gap-1 leading-none">
                      <span className="text-xs font-black text-rose-400 uppercase tracking-wider">
                        Repaso Prioritario
                      </span>
                    </div>
                    <p className="text-[9px] font-bold text-rose-300/80 mt-0.5">Bajo el umbral 80%</p>
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="bg-slate-800/80 border border-slate-700 px-3 py-1.5 rounded-xl text-slate-400 text-xs font-bold">
              Sin estudio registrado
            </div>
          )}
        </div>
      </div>

      {/* Diagnostic & Advice */}
      {ebbinghausAnalysis.hasData && (
        <div className="mb-4 p-3.5 rounded-xl bg-white/[0.04] border border-white/10 backdrop-blur-md flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 text-xs relative z-10">
          <div className="flex items-start gap-3 flex-1">
            <div
              className={cn(
                "w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border mt-0.5 shadow-xs",
                ebbinghausAnalysis.statusBadgeClass
              )}
            >
              {ebbinghausAnalysis.status === "excelente" ? (
                <CheckCircle2 size={16} />
              ) : ebbinghausAnalysis.status === "bueno" ? (
                <ShieldCheck size={16} />
              ) : ebbinghausAnalysis.status === "atencion" ? (
                <AlertTriangle size={16} />
              ) : (
                <AlertCircle size={16} />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="font-black text-white text-xs uppercase tracking-wide">
                  Diagnóstico:
                </span>
                <span
                  className={cn(
                    "px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border",
                    ebbinghausAnalysis.statusBadgeClass
                  )}
                >
                  {ebbinghausAnalysis.statusTitle}
                </span>
                <span className="text-[10px] font-bold text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded-full border border-slate-700 font-mono tabular-nums">
                  Vida media: <strong className="text-slate-200">{ebbinghausAnalysis.stabilityDays} d</strong>
                </span>
                <span className="text-[10px] font-bold text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded-full border border-slate-700 font-mono tabular-nums">
                  Días efectivos: <strong className="text-indigo-300">{ebbinghausAnalysis.factors.effectiveDaysElapsed} d</strong>
                </span>
                {ebbinghausAnalysis.factors.hasMasteryBonus && (
                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded-full border border-amber-500/30 flex items-center gap-1">
                    <Award size={11} className="text-amber-400" />
                    Maestría +15%
                  </span>
                )}
                {ebbinghausAnalysis.factors.brakeType && (
                  <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-300 bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/30">
                    {ebbinghausAnalysis.factors.brakeType === 'cante_total'
                      ? 'Freno Cante 100%'
                      : ebbinghausAnalysis.factors.brakeType === 'freno_mixto'
                        ? 'Freno Mixto 50%'
                        : 'Repaso Pasivo'}
                  </span>
                )}
              </div>
              <p className="text-slate-300 font-medium text-[11px] leading-relaxed">
                {ebbinghausAnalysis.diagnostic}
              </p>
            </div>
          </div>

          <div className="w-full lg:w-auto shrink-0 lg:pl-3 lg:border-l lg:border-white/10">
            <div
              className={cn(
                "px-3 py-2 rounded-xl border text-left flex items-start gap-2",
                ebbinghausAnalysis.isBelowCritical80 || ebbinghausAnalysis.currentRetention < 75
                  ? "bg-rose-500/10 border-rose-500/30 text-rose-200"
                  : "bg-indigo-500/10 border-indigo-500/30 text-indigo-200"
              )}
            >
              <div className="w-5 h-5 rounded-lg bg-white/10 flex items-center justify-center shrink-0 mt-0.5">
                <Zap size={12} className="text-amber-400" />
              </div>
              <div>
                <span className="text-[9px] font-black uppercase tracking-wider block opacity-80">
                  Acción Recomendada
                </span>
                <span className="text-xs font-black text-white block mt-0.5">
                  {ebbinghausAnalysis.actionAdvice}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Projection Chart */}
      <div className="w-full h-[200px] relative z-10">
        {ebbinghausAnalysis.chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={ebbinghausAnalysis.chartData}
              margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
            >
              <defs>
                <linearGradient id="colorRetentionAdv" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor={
                      ebbinghausAnalysis.status === "excelente"
                        ? "#10b981"
                        : ebbinghausAnalysis.status === "bueno"
                        ? "#6366f1"
                        : ebbinghausAnalysis.status === "atencion"
                        ? "#f59e0b"
                        : "#ef4444"
                    }
                    stopOpacity={0.4}
                  />
                  <stop offset="95%" stopColor="#0f172a" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: "#64748b", fontWeight: 700 }}
                dy={6}
              />
              <YAxis
                width={32}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: "#64748b", fontWeight: 700 }}
                domain={[0, 100]}
              />
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="#1e293b"
                strokeOpacity={0.8}
              />
              <ReferenceLine
                y={80}
                stroke="#f59e0b"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{
                  position: "insideTopLeft",
                  value: "Umbral 80%",
                  fill: "#f59e0b",
                  fontSize: 9,
                  fontWeight: 800,
                }}
              />
              <Tooltip
                formatter={(val: any) => [`${val}%`, "Retención"]}
                contentStyle={{
                  borderRadius: "12px",
                  border: "1px solid #334155",
                  backgroundColor: "#0f172a",
                  color: "#fff",
                  fontSize: "11px",
                  fontWeight: 700,
                }}
              />
              <Area
                type="monotone"
                dataKey="retention"
                stroke={
                  ebbinghausAnalysis.status === "excelente"
                    ? "#34d399"
                    : ebbinghausAnalysis.status === "bueno"
                    ? "#818cf8"
                    : ebbinghausAnalysis.status === "atencion"
                    ? "#fbbf24"
                    : "#fb7185"
                }
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#colorRetentionAdv)"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500">
            <BrainCircuit size={24} className="mb-2 opacity-30" />
            <p className="text-xs font-bold uppercase tracking-wider">
              Registra tu primer estudio o repaso para calibrar la retención
            </p>
          </div>
        )}
      </div>

      {/* 5 Multi-Factor Breakdown */}
      {ebbinghausAnalysis.hasData && (
        <div className="mt-4 pt-3.5 border-t border-slate-800/80 relative z-10 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {/* Factor 1: Horas */}
          <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/60 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Clock size={12} className="text-indigo-400" /> Horas Mesa
              </span>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono tabular-nums">
                {ebbinghausAnalysis.factors.studyHoursFactor}x
              </span>
            </div>
            <div>
              <h5 className="text-xs font-black text-white font-mono tabular-nums tracking-tight">
                {ebbinghausAnalysis.factors.studyHoursTotal}h dedicadas
              </h5>
              <p className="text-[10px] font-semibold text-slate-400 mt-0.5">
                {ebbinghausAnalysis.factors.studyHoursImpactLabel}
              </p>
            </div>
          </div>

          {/* Factor 2: Dificultad */}
          <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/60 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Scale size={12} className="text-amber-400" /> Dificultad
              </span>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono tabular-nums">
                {ebbinghausAnalysis.factors.difficultyFactor}x
              </span>
            </div>
            <div>
              <h5 className="text-xs font-black text-white font-mono tabular-nums tracking-tight">
                Nivel {ebbinghausAnalysis.factors.difficulty}/10
              </h5>
              <p className="text-[10px] font-semibold text-slate-400 mt-0.5">
                {ebbinghausAnalysis.factors.difficultyImpactLabel}
              </p>
            </div>
          </div>

          {/* Factor 3: Cantos */}
          <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/60 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Mic size={12} className="text-fuchsia-400" /> Cantos Orales
              </span>
              <span
                className={cn(
                  "text-[9px] font-bold px-1.5 py-0.5 rounded font-mono tabular-nums",
                  ebbinghausAnalysis.factors.cantosCount > 0
                    ? "bg-fuchsia-500/20 text-fuchsia-300"
                    : "bg-slate-700 text-slate-400"
                )}
              >
                {ebbinghausAnalysis.factors.cantosFactor}x
              </span>
            </div>
            <div>
              <div className="flex items-center justify-between gap-1">
                <h5 className="text-xs font-black text-white font-mono tabular-nums tracking-tight">
                  {ebbinghausAnalysis.factors.cantosCount}{" "}
                  {ebbinghausAnalysis.factors.cantosCount === 1 ? "cante" : "cantes"}
                </h5>
                {ebbinghausAnalysis.factors.lastCantoGrade !== null && (
                  <span
                    className={cn(
                      "text-[10px] font-black font-mono tabular-nums px-1.5 py-0.2 rounded",
                      ebbinghausAnalysis.factors.lastCantoGrade >= 5
                        ? "bg-emerald-500/20 text-emerald-300"
                        : "bg-rose-500/20 text-rose-300"
                    )}
                  >
                    {ebbinghausAnalysis.factors.lastCantoGrade.toFixed(1)}
                  </span>
                )}
              </div>
              <p className="text-[10px] font-semibold text-slate-400 mt-0.5 truncate" title={ebbinghausAnalysis.factors.cantosImpactLabel}>
                {ebbinghausAnalysis.factors.cantosImpactLabel}
              </p>
            </div>
          </div>

          {/* Factor 4: Vueltas (Fijador Sináptico de Largo Plazo) */}
          <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/60 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Sparkles size={12} className="text-purple-400" /> Vueltas
              </span>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono tabular-nums">
                {ebbinghausAnalysis.factors.vueltasFactor}x
              </span>
            </div>
            <div>
              <h5 className="text-xs font-black text-white font-mono tabular-nums tracking-tight">
                {ebbinghausAnalysis.factors.vueltas}{" "}
                {ebbinghausAnalysis.factors.vueltas === 1 ? "vuelta" : "vueltas"}
              </h5>
              <p className="text-[10px] font-semibold text-slate-400 mt-0.5">
                {ebbinghausAnalysis.factors.vueltasImpactLabel}
              </p>
            </div>
          </div>

          {/* Factor 5: Refrescos & Freno */}
          <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/60 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <RefreshCw size={12} className="text-emerald-400" /> Refrescos & Freno
              </span>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono tabular-nums">
                {ebbinghausAnalysis.factors.refrescosFactor}x
              </span>
            </div>
            <div>
              <h5 className="text-xs font-black text-white font-mono tabular-nums tracking-tight">
                {ebbinghausAnalysis.factors.refrescosCompleted}/3 Refrescos
              </h5>
              <p className="text-[10px] font-semibold text-slate-400 mt-0.5">
                {ebbinghausAnalysis.factors.refrescosImpactLabel}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
