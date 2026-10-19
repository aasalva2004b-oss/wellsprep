import React from "react";
import { Target } from "lucide-react";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface DashboardDomainRadarChartProps {
  radarData: { materia: string; dominio: string | number; cobertura: number }[];
}

export const DashboardDomainRadarChart: React.FC<DashboardDomainRadarChartProps> = ({
  radarData,
}) => {
  const hasData = radarData.length > 0 && radarData.some((d) => parseFloat(String(d.dominio)) > 0);

  return (
    <div className="md:col-span-1 xl:col-span-1 bg-white/95 backdrop-blur-xl p-4 sm:p-6 rounded-2xl shadow-xs border border-slate-200/80 flex flex-col relative overflow-hidden group">
      <div className="mb-2 relative z-10">
        <h3 className="text-sm sm:text-base font-black text-slate-900 flex items-center gap-2 tracking-tight">
          <Target size={18} className="text-rose-600" />
          Balance de Dominio
        </h3>
        <p className="text-xs text-slate-500 font-medium mt-0.5">
          Nivel de madurez y cobertura por bloque
        </p>
      </div>

      <div className="flex-1 w-full min-h-[230px] relative -mt-2 z-10">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
              <PolarGrid stroke="#e2e8f0" strokeDasharray="3 3" />
              <PolarAngleAxis
                dataKey="materia"
                tick={{ fill: "#64748b", fontSize: 10, fontWeight: 700 }}
              />
              <PolarRadiusAxis
                angle={30}
                domain={[0, 10]}
                tick={{ fill: "#94a3b8", fontSize: 9 }}
                axisLine={false}
              />
              <Radar
                name="Dominio Actual"
                dataKey="dominio"
                stroke="#6366f1"
                strokeWidth={2.5}
                fill="#6366f1"
                fillOpacity={0.2}
              />
              <Radar
                name="Cobertura"
                dataKey="cobertura"
                stroke="#10b981"
                strokeWidth={2}
                fill="#10b981"
                fillOpacity={0.1}
                strokeDasharray="3 3"
              />
              <Tooltip
                contentStyle={{
                  borderRadius: "12px",
                  border: "1px solid #e2e8f0",
                  backgroundColor: "rgba(255, 255, 255, 0.98)",
                  padding: "8px 12px",
                  fontSize: "11px",
                  fontWeight: 700,
                }}
              />
            </RadarChart>
          </ResponsiveContainer>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
            <Target size={28} className="mb-2 opacity-25" />
            <p className="text-xs font-bold text-center px-4">Estudia temas para calcular balance.</p>
          </div>
        )}
      </div>
    </div>
  );
};
