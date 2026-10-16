const fs = require('fs');

const bentoJSX = `
                {/* THE CORE ANALYTICS: BENTO GRID */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 auto-rows-auto gap-4 lg:gap-6 mt-4 lg:mt-6 pb-8">
                    
                    {/* 1. Velocity & Trajectory (Burn-up) - Spans 2 cols */}
                    <div className="md:col-span-2 xl:col-span-2 bg-white/70 backdrop-blur-2xl p-6 lg:p-8 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-slate-900/5 flex flex-col relative overflow-hidden group hover:-translate-y-1 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-300">
                        <div className="absolute -left-10 -bottom-10 w-40 h-40 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none group-hover:scale-150 transition-transform duration-700"></div>
                        <div className="flex justify-between items-end mb-6 relative z-10">
                            <div>
                                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                                    <TrendingUp size={20} className="text-indigo-500" />
                                    Trayectoria de Estudio (Burn-up)
                                </h3>
                                <p className="text-sm text-slate-500 font-medium mt-1">Temas acumulados vs. Proyección base</p>
                            </div>
                        </div>
                        
                        <div className="w-full h-[280px] relative z-10">
                            {cumulativeProgress.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={cumulativeProgress} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="colorEstudiados" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4}/>
                                                <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e2e8f0" strokeOpacity={0.6} />
                                        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} dy={10} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} />
                                        <Tooltip 
                                            cursor={{ stroke: '#cbd5e1', strokeWidth: 1, strokeDasharray: '4 4' }}
                                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.15)', backgroundColor: 'rgba(255, 255, 255, 0.98)', backdropFilter: 'blur(12px)', padding: '12px 16px' }}
                                            itemStyle={{ fontWeight: 800, fontSize: '13px' }}
                                            labelStyle={{ color: '#64748b', fontSize: '11px', fontWeight: 700, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                                        />
                                        <Area type="monotone" dataKey="estudiados" name="Temas Estudiados" stroke="#6366f1" strokeWidth={4} fill="url(#colorEstudiados)" activeDot={{ r: 6, strokeWidth: 0, fill: '#4f46e5' }} />
                                        <Line type="monotone" dataKey="objetivo" name="Objetivo Teórico" stroke="#cbd5e1" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                                    <Activity size={32} className="mb-2 opacity-20" />
                                    <p className="text-sm font-bold">Registra estudios iniciales para trazar tu trayectoria.</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 2. Smart Action Queue - Spans 1 col, 2 rows on XL */}
                    <div className="md:col-span-1 xl:col-span-1 xl:row-span-2 bg-white/70 backdrop-blur-2xl p-6 lg:p-8 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-slate-900/5 flex flex-col relative overflow-hidden group hover:-translate-y-1 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-300">
                        <div className="absolute -right-6 -top-6 w-40 h-40 bg-amber-500/10 rounded-full blur-3xl pointer-events-none group-hover:scale-150 transition-transform duration-700"></div>
                        <div className="relative z-10 flex-1 flex flex-col">
                            <h3 className="text-lg font-black text-slate-900 flex items-center gap-2 mb-1">
                                <Zap size={20} className="text-amber-500" fill="currentColor"/>
                                Agenda Inteligente
                            </h3>
                            <p className="text-sm text-slate-500 font-medium mb-6">Repasos priorizados por SRS</p>
                            
                            <div className="space-y-3 flex-1 overflow-y-auto no-scrollbar pr-1">
                                {smartQueue.length > 0 ? (
                                    smartQueue.map((item, idx) => (
                                        <div key={idx} className="bg-white hover:bg-slate-50 border border-slate-100 p-4 rounded-2xl transition-all cursor-pointer group/item shadow-sm hover:shadow-md ring-1 ring-slate-900/5">
                                            <div className="flex justify-between items-start mb-1.5">
                                                <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 ring-1 ring-slate-900/5 shadow-sm">
                                                    Tema {item.topic.number}
                                                </span>
                                                {item.urgency === 3 && <span className="flex h-2.5 w-2.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]"></span>}
                                                {item.urgency === 2 && <span className="flex h-2.5 w-2.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]"></span>}
                                            </div>
                                            <h4 className="text-sm font-bold text-slate-900 line-clamp-1 group-hover/item:text-indigo-600 transition-colors">
                                                {item.topic.title}
                                            </h4>
                                            <p className={cn("text-xs font-bold mt-2 flex items-center gap-1", item.urgency === 3 ? "text-rose-500" : item.urgency === 2 ? "text-amber-500" : "text-emerald-500")}>
                                                {item.urgency === 3 ? <AlertOctagon size={12}/> : <Clock size={12}/>}
                                                {item.reason}
                                            </p>
                                        </div>
                                    ))
                                ) : (
                                    <div className="py-8 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                                        <CheckCircle2 size={32} className="mx-auto text-emerald-500 mb-3 opacity-50" />
                                        <p className="text-sm font-bold text-slate-700">¡Todo al día!</p>
                                        <p className="text-xs text-slate-400 mt-1">No tienes repasos pendientes.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* 3. Forecast Chart - 1 col */}
                    <div className="md:col-span-1 xl:col-span-1 bg-white/70 backdrop-blur-2xl p-6 lg:p-8 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-slate-900/5 flex flex-col relative overflow-hidden group hover:-translate-y-1 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-300">
                        <div className="absolute -left-10 -top-10 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl pointer-events-none group-hover:scale-150 transition-transform duration-700"></div>
                        <div className="mb-6 relative z-10">
                            <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                                <BrainCircuit size={20} className="text-blue-500" />
                                Previsión de Carga (SRS)
                            </h3>
                            <p className="text-sm text-slate-500 font-medium mt-1">Temas programados para repaso en 14 días</p>
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
                                          <Cell key={\`cell-\${index}\`} fill={index === 0 && entry.count > 0 ? '#ef4444' : '#3b82f6'} />
                                        ))
                                      }
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* 4. Balance de Dominio (Radar) - 1 col */}
                    <div className="md:col-span-1 xl:col-span-1 bg-white/70 backdrop-blur-2xl p-6 lg:p-8 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-slate-900/5 flex flex-col relative overflow-hidden group hover:-translate-y-1 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-300">
                        <div className="absolute -left-6 -bottom-6 w-32 h-32 bg-rose-500/10 rounded-full blur-3xl pointer-events-none group-hover:scale-150 transition-transform duration-700"></div>
                        <div className="mb-2 relative z-10">
                            <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                                <Target size={20} className="text-rose-500" />
                                Balance de Dominio
                            </h3>
                            <p className="text-sm text-slate-500 font-medium mt-1">Nivel de madurez por bloque</p>
                        </div>
                        
                        <div className="flex-1 w-full min-h-[250px] relative -mt-4 z-10">
                            {radarData.length > 0 && radarData.some(d => parseFloat(d.dominio) > 0) ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                                        <PolarGrid stroke="#e2e8f0" strokeDasharray="4 4" />
                                        <PolarAngleAxis dataKey="materia" tick={{ fill: '#64748b', fontSize: 10, fontWeight: 700 }} />
                                        <PolarRadiusAxis angle={30} domain={[0, 10]} tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} />
                                        <Radar name="Dominio Actual" dataKey="dominio" stroke="#6366f1" strokeWidth={3} fill="#6366f1" fillOpacity={0.2} />
                                        <Radar name="Cobertura" dataKey="cobertura" stroke="#10b981" strokeWidth={2} fill="#10b981" fillOpacity={0.1} strokeDasharray="3 3"/>
                                        <Tooltip
                                                contentStyle={{ borderRadius: '12px', border: '1px solid rgba(226, 232, 240, 0.8)', boxShadow: '0 10px 40px -10px rgba(0, 0, 0, 0.08)', backgroundColor: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(8px)' }}
                                        />
                                    </RadarChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
                                    <Target size={32} className="mb-2 opacity-20" />
                                    <p className="text-sm font-bold text-center px-4">Estudia temas para calcular balance.</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 5. Consistency Heatmap - Full width (3 cols) */}
                    <div className="md:col-span-2 xl:col-span-3 bg-white/70 backdrop-blur-2xl p-6 lg:p-8 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-slate-900/5 flex flex-col relative overflow-hidden group hover:-translate-y-1 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-300">
                        <div className="absolute -right-20 -bottom-20 w-60 h-60 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none group-hover:scale-125 transition-transform duration-700"></div>
                        <div className="flex justify-between items-end mb-6 relative z-10">
                            <div>
                                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                                    <Calendar size={20} className="text-emerald-500" />
                                    Mapa de Consistencia
                                </h3>
                                <p className="text-sm text-slate-500 font-medium mt-1">La disciplina vence al talento. Últimos 84 días.</p>
                            </div>
                        </div>
                        
                        <div className="w-full overflow-x-auto no-scrollbar pb-2 relative z-10">
                            <div className="min-w-[700px] flex gap-1.5 items-start">
                                {weeks.map((week, wIdx) => (
                                    <div key={wIdx} className="flex flex-col gap-1.5">
                                        {week.map((day, dIdx) => {
                                            if (!day) return <div key={\`empty-\${dIdx}\`} className="w-3.5 h-3.5 rounded-sm bg-transparent"></div>;
                                            
                                            const dayData = Array.isArray(progress.studyDates) 
                                                ? progress.studyDates.find(d => typeof d === 'object' && d !== null ? d.date === day : d === day)
                                                : null;
                                            
                                            const hasStudied = !!dayData;
                                            
                                            let intensityClass = "bg-slate-100 ring-1 ring-slate-900/5";
                                            if (hasStudied) {
                                                const duration = typeof dayData === 'object' && dayData !== null ? (dayData.duration || 0) : 30;
                                                if (duration > 120) intensityClass = "bg-emerald-700 shadow-sm ring-1 ring-emerald-900/10";
                                                else if (duration > 60) intensityClass = "bg-emerald-500 shadow-sm ring-1 ring-emerald-900/10";
                                                else if (duration > 30) intensityClass = "bg-emerald-400 shadow-sm ring-1 ring-emerald-900/10";
                                                else intensityClass = "bg-emerald-200 shadow-sm ring-1 ring-emerald-900/10";
                                            }
                                            
                                            return (
                                                <div 
                                                    key={day} 
                                                    className={cn("w-3.5 h-3.5 rounded-sm transition-all group relative cursor-help hover:ring-2 hover:ring-indigo-500 hover:ring-offset-1 z-10 hover:z-20", intensityClass)}
                                                    title={\`\${day}: \${hasStudied ? (typeof dayData === 'object' && dayData !== null ? dayData.duration : 30) + ' min' : 'Sin registro'}\`}
                                                >
                                                </div>
                                            );
                                        })}
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="mt-4 flex items-center justify-end gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest relative z-10">
                            <span>Menos</span>
                            <div className="w-3 h-3 rounded-sm bg-slate-100 ring-1 ring-slate-900/5"></div>
                            <div className="w-3 h-3 rounded-sm bg-emerald-200 ring-1 ring-emerald-900/10"></div>
                            <div className="w-3 h-3 rounded-sm bg-emerald-400 ring-1 ring-emerald-900/10"></div>
                            <div className="w-3 h-3 rounded-sm bg-emerald-500 ring-1 ring-emerald-900/10"></div>
                            <div className="w-3 h-3 rounded-sm bg-emerald-700 ring-1 ring-emerald-900/10"></div>
                            <span>Más</span>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
`;

let source = fs.readFileSync('dashboard_top.txt', 'utf8');
fs.writeFileSync('src/components/DashboardView.tsx', source + bentoJSX);
console.log("Successfully rebuilt DashboardView.tsx");
