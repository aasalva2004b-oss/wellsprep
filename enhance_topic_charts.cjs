const fs = require('fs');

let code = fs.readFileSync('src/components/TopicEditorDialog.tsx', 'utf8');

// Replace Dificultad Percibida with Maduración del Conocimiento (Combining Difficulty & Vueltas)
// Actually, let's keep the data processing but just heavily style the charts and add reference lines.

const diffChartStart = code.indexOf('{/* Dificultad Evolución */}');
const cantosChartStart = code.indexOf('{/* Cantos Evolución */}');
const historyStart = code.indexOf('{/* History Timeline */}');

if (diffChartStart !== -1 && cantosChartStart !== -1 && historyStart !== -1) {

    // First replace the entire charts grid structure. We have two charts. Let's make them more advanced.
    let newCharts = `
                 {/* ANALYTICAL CHARTS */}
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    
                    {/* Retención y Dificultad (Curva Ebbinghaus) */}
                    <div className="bg-white rounded-3xl p-6 shadow-sm ring-1 ring-slate-900/5 flex flex-col min-h-[320px] relative overflow-hidden group">
                        <div className="absolute -right-10 -top-10 w-40 h-40 bg-indigo-50 rounded-full opacity-50 group-hover:scale-110 transition-transform duration-500 pointer-events-none"></div>
                        <div className="mb-6 relative z-10">
                            <h3 className="text-sm font-black text-slate-900 flex items-center gap-2 uppercase tracking-wide">
                                <TrendingUp size={16} className="text-indigo-500" /> Curva de Dificultad
                            </h3>
                            <p className="text-[11px] font-bold text-slate-400 mt-1">Evolución de la percepción del tema a lo largo de los repasos</p>
                        </div>
                        <div className="flex-1 w-full relative z-10">
                            {diffChartData.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={diffChartData} margin={{ top: 20, right: 10, left: -25, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorDiffAdv" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.5}/>
                                            <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <XAxis dataKey="index" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 700 }} dy={10} />
                                    <YAxis width={30} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 700 }} domain={[0, 10]} />
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" strokeOpacity={0.6} />
                                    <Tooltip 
                                        formatter={(value: any) => [\`\${value}/10\`, 'Nivel Dificultad']}
                                        cursor={{ stroke: '#4f46e5', strokeWidth: 2, strokeDasharray: '4 4', opacity: 0.5 }}
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.15)', backgroundColor: 'rgba(255, 255, 255, 0.98)', backdropFilter: 'blur(12px)', padding: '12px 16px' }}
                                        itemStyle={{ fontWeight: 800, fontSize: '13px' }}
                                        labelStyle={{ color: '#64748b', fontSize: '11px', fontWeight: 700, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                                    />
                                    <ReferenceLine y={5} stroke="#cbd5e1" strokeDasharray="3 3" strokeWidth={2} label={{ position: 'insideTopLeft', value: 'Control', fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} />
                                    <Area type="monotone" dataKey="dificultad" stroke="#4f46e5" strokeWidth={4} fillOpacity={1} fill="url(#colorDiffAdv)" activeDot={{ r: 6, fill: '#fff', stroke: '#4f46e5', strokeWidth: 3, shadow: '0 0 10px rgba(79,70,229,0.5)' }} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
                                   <Activity size={32} className="mb-3 opacity-20" />
                                   <p className="text-xs font-bold uppercase tracking-wider">Sin Telemetría</p>
                                </div>
                            )}
                        </div>
                    </div>
                    
                    {/* Performance de Cantos */}
                    <div className="bg-white rounded-3xl p-6 shadow-sm ring-1 ring-slate-900/5 flex flex-col min-h-[320px] relative overflow-hidden group">
                        <div className="absolute -right-10 -top-10 w-40 h-40 bg-amber-50 rounded-full opacity-50 group-hover:scale-110 transition-transform duration-500 pointer-events-none"></div>
                        <div className="mb-6 relative z-10">
                            <h3 className="text-sm font-black text-slate-900 flex items-center gap-2 uppercase tracking-wide">
                                <Target size={16} className="text-amber-500" /> Desempeño en Cantos
                            </h3>
                            <p className="text-[11px] font-bold text-slate-400 mt-1">Evaluación de las notas en simulacros vs. tiempo invertido</p>
                        </div>
                        <div className="flex-1 w-full relative z-10">
                            {cantosChartData.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={cantosChartData} margin={{ top: 20, right: 10, left: -25, bottom: 0 }}>
                                    <XAxis dataKey="index" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 700 }} dy={10} />
                                    <YAxis yAxisId="left" width={30} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 700 }} />
                                    <YAxis yAxisId="right" orientation="right" width={30} domain={[0, 10]} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 700 }} />
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" strokeOpacity={0.6} />
                                    <Tooltip 
                                        cursor={{fill: 'rgba(241, 245, 249, 0.5)'}}
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.15)', backgroundColor: 'rgba(255, 255, 255, 0.98)', backdropFilter: 'blur(12px)', padding: '12px 16px' }}
                                        itemStyle={{ fontWeight: 800, fontSize: '13px' }}
                                        labelStyle={{ color: '#64748b', fontSize: '11px', fontWeight: 700, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                                        formatter={(value: any, name: any) => {
                                           if (name === "duracion") return [\`\${value} min\`, 'Inversión'];
                                           if (name === "nota") return [\`\${value}/10\`, 'Calificación'];
                                           return [value, name];
                                        }}
                                    />
                                    {/* Linea de Corte Aprobado */}
                                    <ReferenceLine yAxisId="right" y={5} stroke="#f43f5e" strokeDasharray="3 3" strokeWidth={2} label={{ position: 'insideBottomRight', value: 'Corte (5)', fill: '#f43f5e', fontSize: 10, fontWeight: 800 }} />
                                    {/* Linea de Objetivo Excelente */}
                                    <ReferenceLine yAxisId="right" y={8} stroke="#10b981" strokeDasharray="3 3" strokeWidth={2} label={{ position: 'insideTopRight', value: 'Objetivo (8)', fill: '#10b981', fontSize: 10, fontWeight: 800 }} />
                                    
                                    <Bar yAxisId="left" dataKey="duracion" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={12} fillOpacity={0.8} />
                                    <Line yAxisId="right" type="monotone" dataKey="nota" stroke="#10b981" strokeWidth={4} dot={{ r: 5, fill: '#fff', stroke: '#10b981', strokeWidth: 3 }} activeDot={{r: 7, shadow: '0 0 10px rgba(16,185,129,0.5)'}} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
                                   <Target size={32} className="mb-3 opacity-20" />
                                   <p className="text-xs font-bold uppercase tracking-wider">Aún no hay cantos</p>
                                </div>
                            )}
                        </div>
                    </div>
                 </div>
`;

    const beforeCharts = code.substring(0, diffChartStart);
    const afterCharts = code.substring(historyStart);

    const newCode = beforeCharts + newCharts + "\n                 " + afterCharts;
    fs.writeFileSync('src/components/TopicEditorDialog.tsx', newCode);
    console.log("Topic charts updated.");
} else {
    console.log("Could not find chart markers.");
}

