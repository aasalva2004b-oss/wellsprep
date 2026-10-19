import React from "react";
import { BrainCircuit } from "lucide-react";
import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

interface DashboardSRSForecastChartProps {
  forecastData: { label: string; count: number }[];
}

export const DashboardSRSForecastChart: React.FC<DashboardSRSForecastChartProps> = ({
  forecastData,
}) => {
  return (
    <div className="md:col-span-1 xl:col-span-1 bg-white/95 backdrop-blur-xl p-4 sm:p-6 rounded-2xl shadow-xs border border-slate-200/80 flex flex-col relative overflow-hidden group">
      <div className="mb-4 relative z-10">
        <h3 className="text-sm sm:text-base font-black text-slate-900 flex items-center gap-2 tracking-tight">
          <BrainCircuit size={18} className="text-blue-600" />
          Previsión de Carga (SRS)
        </h3>
        <p className="text-xs text-slate-500 font-medium mt-0.5">
          Temas programados para repaso en 14 días
        </p>
      </div>

      <div className="w-full h-[230px] relative z-10">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={forecastData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" strokeOpacity={0.6} />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: "#64748b", fontWeight: 700 }}
              dy={6}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: "#64748b", fontWeight: 700 }}
              allowDecimals={false}
              width={26}
            />
            <Tooltip
              contentStyle={{
                borderRadius: "12px",
                border: "1px solid #e2e8f0",
                boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.08)",
                backgroundColor: "rgba(255, 255, 255, 0.98)",
                padding: "8px 12px",
                fontSize: "12px",
                fontWeight: 800,
              }}
              formatter={(value) => [value, "Temas programados"]}
            />
            <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={22}>
              {forecastData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={index === 0 && entry.count > 0 ? "#ef4444" : "#3b82f6"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
