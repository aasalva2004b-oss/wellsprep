import React from "react";
import { TrendingUp, Activity } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";

interface TopicDifficultyCardProps {
  diffChartData: { index: string; dificultad: number; date: string }[];
}

export const TopicDifficultyCard: React.FC<TopicDifficultyCardProps> = ({
  diffChartData,
}) => {
  return (
    <div className="bg-white/95 backdrop-blur-xl rounded-2xl p-4 sm:p-5 shadow-xs border border-slate-200/80 flex flex-col min-h-[240px]">
      <div className="mb-3.5 flex items-center justify-between pb-2 border-b border-slate-100">
        <div>
          <h3 className="text-xs font-black text-slate-900 flex items-center gap-2 uppercase tracking-wide">
            <TrendingUp size={15} className="text-indigo-600" /> Curva de Dificultad Subjetiva
          </h3>
          <p className="text-[11px] font-medium text-slate-400 mt-0.5">
            Percepción de dificultad a lo largo de las vueltas
          </p>
        </div>
        <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2.5 py-0.5 rounded-full uppercase tracking-wider font-mono">
          Escala 1–10
        </span>
      </div>

      <div className="flex-1 w-full relative min-h-[160px]">
        {diffChartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={diffChartData}
              margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
            >
              <defs>
                <linearGradient id="colorDiffCurv" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="index"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: "#94a3b8", fontWeight: 700 }}
                dy={6}
              />
              <YAxis
                width={30}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: "#94a3b8", fontWeight: 700 }}
                domain={[0, 10]}
              />
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="#e2e8f0"
                strokeOpacity={0.6}
              />
              <Tooltip
                formatter={(value: any) => [`${value}/10`, "Dificultad"]}
                contentStyle={{
                  borderRadius: "12px",
                  border: "1px solid #e2e8f0",
                  boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.05)",
                  backgroundColor: "rgba(255, 255, 255, 0.98)",
                  backdropFilter: "blur(12px)",
                  padding: "8px 12px",
                  fontSize: "11px",
                  fontWeight: 800,
                }}
              />
              <ReferenceLine
                y={5}
                stroke="#cbd5e1"
                strokeDasharray="3 3"
                strokeWidth={1.5}
                label={{
                  position: "insideTopLeft",
                  value: "Media (5)",
                  fill: "#94a3b8",
                  fontSize: 9,
                  fontWeight: 700,
                }}
              />
              <Area
                type="monotone"
                dataKey="dificultad"
                stroke="#4f46e5"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#colorDiffCurv)"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
            <Activity size={24} className="mb-2 opacity-30" />
            <p className="text-xs font-bold uppercase tracking-wider">Sin datos de dificultad</p>
          </div>
        )}
      </div>
    </div>
  );
};
