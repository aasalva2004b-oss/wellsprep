import React from "react";
import { BrainCircuit } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { EbbinghausAnalysis } from "../../lib/ebbinghaus";

interface TopicEbbinghausCardProps {
  ebbinghausAnalysis: EbbinghausAnalysis;
}

export const TopicEbbinghausCard: React.FC<TopicEbbinghausCardProps> = ({
  ebbinghausAnalysis,
}) => {
  const adaptive = ebbinghausAnalysis.adaptive;
  if (adaptive) {
    const percentage = (value: number) => Math.round(value * 20) * 5;
    const confidence = { baja: 'baja', media: 'media', alta: 'alta', sin_datos: 'sin datos' }[adaptive.confidence];
    const targetLabel = adaptive.target === 'recall' ? 'Recuerdo estimado'
      : adaptive.target === 'grade_proxy' ? 'Cante ≥5/10 (aproximación al recuerdo)'
      : 'Referencia provisional sin evaluación';
    return (
      <section className="bg-slate-900 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-xl border border-slate-800 text-slate-200 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2"><BrainCircuit size={18} /> Retención estimada</h3>
            <p className="text-xs text-slate-400 mt-1">Orientación para decidir cuándo repasar según tu historial.</p>
          </div>
          <span className="text-xs text-indigo-200 rounded-full border border-indigo-400/30 px-2 py-1">Confianza: {confidence}</span>
        </div>

        {adaptive.probability !== null && ebbinghausAnalysis.hasData ? (
          <>
            <div className="rounded-xl bg-slate-800 border border-slate-700 p-4">
              <p className="text-xs text-slate-300">{targetLabel}</p>
              <p className="text-3xl font-bold font-mono text-white mt-1">≈{percentage(adaptive.probability)}%</p>
              {adaptive.interval && <p className="text-xs text-slate-300 mt-1">Rango orientativo: {percentage(adaptive.interval.low)}–{percentage(adaptive.interval.high)}%</p>}
              <p className="text-xs text-slate-400 mt-2">
                {adaptive.target === 'grade_proxy'
                  ? 'Las notas de cante se usan como aproximación al recuerdo; no son una prueba directa de memoria.'
                  : adaptive.target === 'prior'
                    ? 'Todavía no hay evaluaciones suficientes para ajustar esta referencia a tu recuerdo real.'
                    : 'La estimación se basa en evaluaciones registradas de recuerdo.'}
              </p>
              <p className="text-xs text-slate-400 mt-1">La precisión debe contrastarse con evaluaciones futuras.</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-lg bg-slate-800 px-2 py-1">{adaptive.topicEvidenceCount} evaluaciones de este tema · {adaptive.evidenceCount} en total</span>
              <span className="rounded-lg bg-slate-800 px-2 py-1">{adaptive.coverageScope === 'whole_topic' ? 'Cobertura inicial completa'
                : adaptive.coverageScope === 'studied_portion' ? 'Solo la parte estudiada' : 'Cobertura sin confirmar'}</span>
            </div>
            {adaptive.reasons.length > 0 && <ul className="list-disc pl-5 text-xs text-slate-300 space-y-1">{adaptive.reasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul>}
            <div className="rounded-xl border border-indigo-400/30 bg-indigo-400/10 p-3 text-xs">
              <span className="font-bold text-indigo-200">{adaptive.recommendedDate ? `Revisión sugerida: ${adaptive.recommendedDate}` : 'Fecha de revisión por determinar'}</span>
              <p className="text-slate-300 mt-1">{ebbinghausAnalysis.actionAdvice}</p>
            </div>
            {ebbinghausAnalysis.chartData.length > 0 && <div className="h-[200px]" aria-label="Proyección orientativa de retención">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={ebbinghausAnalysis.chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <Tooltip formatter={(value: number) => [`≈${Math.round(value / 5) * 5}%`, 'Estimación']} contentStyle={{ backgroundColor: '#0f172a', borderColor: '#475569', fontSize: 12 }} />
                  <Area type="monotone" dataKey="retention" stroke="#818cf8" fill="#6366f1" fillOpacity={0.15} />
                </AreaChart>
              </ResponsiveContainer>
            </div>}
          </>
        ) : <p className="text-sm text-slate-300">No hay evidencia suficiente para estimar la retención. Registra el estudio realizado y, cuando puedas, una evaluación de recuerdo.</p>}
      </section>
    );
  }
  return <section className="bg-slate-900 rounded-2xl p-5 text-slate-300">
    <h3 className="text-sm font-bold text-white">Retención estimada</h3>
    <p className="mt-2 text-xs">No hay una estimación disponible. Registra el estudio y una comprobación de recuerdo sin apuntes.</p>
  </section>;
};
