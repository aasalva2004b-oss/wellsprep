import React from "react";
import { TrendingUp, Activity } from "lucide-react";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface DashboardBurnupChartProps {
  cumulativeProgress: { date: string; estudiados: number; objetivo: number }[];
}

export const DashboardBurnupChart: React.FC<DashboardBurnupChartProps> = ({
  cumulativeProgress,
}) => {
  return (
    <div className="md:col-span-2 xl:col-span-2 bg-white/95 backdrop-blur-xl p-4 sm:p-6 rounded-2xl shadow-xs border border-slate-200/80 flex flex-col relative overflow-hidden group">
      <div className="flex justify-between items-end mb-4 relative z-10">
        <div>
          <h3 className="text-sm sm:text-base font-black text-slate-900 flex items-center gap-2 tracking-tight">
            <TrendingUp size={18} className="text-indigo-600" />
            Trayectoria de Estudio (Burn-up)
          </h3>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Temas acumulados vs. Proyección teórica base
          </p>
        </div>
      </div>

      <div className="w-full h-[260px] relative z-10">
        {cumulativeProgress.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={cumulativeProgress}
              margin={{ top: 10, right: 10, left: -22, bottom: 0 }}
            >
              <defs>
                <linearGradient id="colorEstudiados" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" strokeOpacity={0.6} />
              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: "#64748b", fontWeight: 700 }}
                dy={6}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: "#64748b", fontWeight: 700 }}
                width={26}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: "12px",
                  border: "1px solid #e2e8f0",
                  boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.08)",
                  backgroundColor: "rgba(255, 255, 255, 0.98)",
                  padding: "10px 14px",
                  fontSize: "12px",
                  fontWeight: 800,
                }}
              />
              <Area
                type="monotone"
                dataKey="estudiados"
                name="Temas Estudiados"
                stroke="#4f46e5"
                strokeWidth={3}
                fill="url(#colorEstudiados)"
                activeDot={{ r: 5, fill: "#4f46e5" }}
              />
              <Line
                type="monotone"
                dataKey="objetivo"
                name="Objetivo Teórico"
                stroke="#cbd5e1"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
            <Activity size={28} className="mb-2 opacity-25" />
            <p className="text-xs font-bold">Registra estudios iniciales para trazar tu trayectoria.</p>
          </div>
        )}
      </div>
    </div>
  );
};
