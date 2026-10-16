const fs = require('fs');

let code = fs.readFileSync('src/components/DashboardView.tsx', 'utf8');

const importRecharts = 'import { LineChart as RechartsLineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ComposedChart, ReferenceLine, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Scatter, ScatterChart, ZAxis } from "recharts";';

const newImports = `
import { LineChart as RechartsLineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ComposedChart, ReferenceLine, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Scatter, ScatterChart, ZAxis } from "recharts";
import { getLocalDateString } from "../lib/utils";
`;

if(!code.includes('getLocalDateString')) {
    code = code.replace(importRecharts, newImports);
}

// Let's add the forecast data logic
const radarDataEnd = `
    const radarData = useMemo(() => {
        const blocks = Array.from(new Set(topics.map(t => t.subjectId)));
        return blocks.map(block => {
            const blockTopics = topics.filter(t => t.subjectId === block);
            const blockProgress = blockTopics.map(t => userProgress[t.id]).filter(Boolean);
            
            const count = blockTopics.length;
            const studied = blockProgress.filter(p => !!p?.firstStudyDate).length;
            const coverage = count > 0 ? (studied / count) * 10 : 0;
            
            const totalDiff = blockProgress.reduce((acc, p) => acc + (p?.difficulty || 0), 0);
            const avgDiff = studied > 0 ? totalDiff / studied : 0;
            const dominio = studied > 0 ? Math.max(0, 10 - avgDiff) : 0;
            
            return {
                materia: initialSubjects.find(s => s.id === block)?.name.split(" ")[0] || block,
                cobertura: coverage.toFixed(1),
                dominio: dominio.toFixed(1)
            };
        });
    }, [userProgress, topics]);
`;

const forecastLogic = `
    // 5. Forecast 14 Days
    const forecastData = useMemo(() => {
        const today = new Date();
        today.setHours(0,0,0,0);
        
        const days = Array.from({ length: 14 }).map((_, i) => {
            const d = new Date(today);
            d.setDate(d.getDate() + i);
            return {
                date: d,
                dateStr: getLocalDateString(d),
                label: i === 0 ? "Hoy" : i === 1 ? "Mañ" : d.toLocaleDateString("es-ES", { weekday: 'short' }),
                count: 0
            };
        });
        
        Object.values(userProgress).forEach(prog => {
            if(prog?.lastReviewDate) {
               const srsState = {
                  easinessFactor: prog.srsEasinessFactor || 2.5,
                  interval: prog.srsInterval || 0,
                  repetitions: prog.srsRepetitions || 0
               };
               const nextDate = calculateNextSRSState(prog.difficulty || 5, srsState, prog.lastReviewDate).nextReviewDate;
               
               const dayObj = days.find(d => d.dateStr === nextDate);
               if(dayObj) {
                   dayObj.count++;
               } else if (new Date(nextDate).getTime() < today.getTime()) {
                   // Overdue topics count for today
                   days[0].count++;
               }
            }
        });
        
        return days;
    }, [userProgress]);
`;

code = code.replace(radarDataEnd, radarDataEnd + forecastLogic);

// Now let's render the forecast chart. I will add it next to the radar chart or cumulative progress.
// The cumulative progress chart takes up full width in the left col. I'll put it below cumulative progress.

const targetCumulativeRender = `
                    <div className="bg-white p-6 lg:p-8 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col">
                        <div className="mb-6">
                            <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                                <TrendingUp size={20} className="text-indigo-500" />
                                Progresión Acumulada
                            </h3>
                            <p className="text-sm text-slate-500 font-medium mt-1">Comparativa de avance real vs. objetivo teórico</p>
                        </div>
`;

// Actually let's just use string replacement for the charts, we will inject the Forecast chart right after Cumulative Progress.

const replacementChart = `
                    {/* Forecast Chart */}
                    <div className="bg-white p-6 lg:p-8 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col relative overflow-hidden group">
                        <div className="absolute -right-10 -top-10 w-40 h-40 bg-blue-50 rounded-full opacity-50 group-hover:scale-110 transition-transform duration-500 pointer-events-none"></div>
                        <div className="mb-6 relative z-10">
                            <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                                <BrainCircuit size={20} className="text-blue-500" />
                                Previsión de Carga (SRS)
                            </h3>
                            <p className="text-sm text-slate-500 font-medium mt-1">Temas programados para repaso en los próximos 14 días</p>
                        </div>
                        <div className="w-full h-[250px] relative z-10">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={forecastData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" strokeOpacity={0.6} />
                                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b', fontWeight: 700, textTransform: 'uppercase' }} dy={10} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b', fontWeight: 700 }} allowDecimals={false} />
                                    <Tooltip 
                                        cursor={{fill: 'rgba(241, 245, 249, 0.5)'}}
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.15)', backgroundColor: 'rgba(255, 255, 255, 0.98)', backdropFilter: 'blur(12px)', padding: '12px 16px' }}
                                        itemStyle={{ fontWeight: 800, fontSize: '13px' }}
                                        labelStyle={{ color: '#64748b', fontSize: '11px', fontWeight: 700, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                                        formatter={(value) => [value, 'Temas programados']}
                                    />
                                    <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={24}>
                                      {
                                        forecastData.map((entry, index) => (
                                          <cell key={\`cell-\${index}\`} fill={index === 0 && entry.count > 0 ? '#ef4444' : '#3b82f6'} />
                                        ))
                                      }
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
`;

// Insert the forecast chart before the consistency heatmap
const findHeatmap = '{/* 2. Consistency Heatmap */}';
code = code.replace(findHeatmap, replacementChart + '\n                        ' + findHeatmap);

// Also upgrade the tooltips on the Cumulative progress chart
const oldCumulativeTooltip = `<Tooltip 
                                                contentStyle={{ borderRadius: '16px', border: '1px solid rgba(226, 232, 240, 0.8)', boxShadow: '0 10px 40px -10px rgba(0, 0, 0, 0.08)', backgroundColor: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(8px)' }}
                                                itemStyle={{ fontWeight: 700 }}
                                            />`;
                                            
const newCumulativeTooltip = `<Tooltip 
                                        cursor={{ stroke: '#cbd5e1', strokeWidth: 1, strokeDasharray: '4 4' }}
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.15)', backgroundColor: 'rgba(255, 255, 255, 0.98)', backdropFilter: 'blur(12px)', padding: '12px 16px' }}
                                        itemStyle={{ fontWeight: 800, fontSize: '13px' }}
                                        labelStyle={{ color: '#64748b', fontSize: '11px', fontWeight: 700, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                                    />`;

code = code.replace(oldCumulativeTooltip, newCumulativeTooltip);

// And upgrade the tooltip on the Radar chart
const oldRadarTooltip = `<Tooltip
                                                contentStyle={{ borderRadius: '12px', border: '1px solid rgba(226, 232, 240, 0.8)', boxShadow: '0 10px 40px -10px rgba(0, 0, 0, 0.08)', backgroundColor: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(8px)' }}
                                            />`;
const newRadarTooltip = `<Tooltip
                                                cursor={{fill: 'rgba(241, 245, 249, 0.5)'}}
                                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.15)', backgroundColor: 'rgba(255, 255, 255, 0.98)', backdropFilter: 'blur(12px)', padding: '12px 16px' }}
                                                itemStyle={{ fontWeight: 800, fontSize: '13px' }}
                                                labelStyle={{ color: '#64748b', fontSize: '11px', fontWeight: 700, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                                            />`;

code = code.replace(oldRadarTooltip, newRadarTooltip);

fs.writeFileSync('src/components/DashboardView.tsx', code);
