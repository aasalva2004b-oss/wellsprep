const fs = require('fs');

let code = fs.readFileSync('src/components/DashboardView.tsx', 'utf8');

const targetIndex = code.indexOf('{/* 5. Consistency Heatmap');

if (targetIndex !== -1) {
    const newCharts = `
                    {/* NEW: Tiempos de Canto (Cantos Performance) - 2 cols */}
                    <div className="md:col-span-2 xl:col-span-2 bg-white/70 backdrop-blur-2xl p-6 lg:p-8 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-slate-900/5 flex flex-col relative overflow-hidden group hover:-translate-y-1 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-300">
                        <div className="absolute -left-10 -bottom-10 w-40 h-40 bg-fuchsia-500/10 rounded-full blur-3xl pointer-events-none group-hover:scale-150 transition-transform duration-700"></div>
                        <div className="mb-6 relative z-10 flex justify-between items-end">
                            <div>
                                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                                    <Mic size={20} className="text-fuchsia-500" />
                                    Evolución de Cantos
                                </h3>
                                <p className="text-sm text-slate-500 font-medium mt-1">Tiempo (min) vs Nota (0-10) en los últimos 20 intentos</p>
                            </div>
                        </div>
                        <div className="w-full h-[250px] relative z-10">
                            {cantosData.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={cantosData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" strokeOpacity={0.6} />
                                        <XAxis dataKey="fecha" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b', fontWeight: 700 }} dy={10} />
                                        <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b', fontWeight: 700 }} />
                                        <YAxis yAxisId="right" orientation="right" domain={[0, 10]} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 700 }} />
                                        <Tooltip 
                                            cursor={{ fill: 'rgba(241, 245, 249, 0.5)' }}
                                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.15)', backgroundColor: 'rgba(255, 255, 255, 0.98)', backdropFilter: 'blur(12px)', padding: '12px 16px' }}
                                            labelStyle={{ color: '#64748b', fontSize: '11px', fontWeight: 700, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                                        />
                                        <Bar yAxisId="right" dataKey="nota" name="Nota" fill="#cbd5e1" radius={[4, 4, 0, 0]} barSize={16}>
                                            {cantosData.map((entry, index) => (
                                                <Cell key={\`cell-\${index}\`} fill={entry.nota >= 8 ? '#10b981' : entry.nota >= 5 ? '#f59e0b' : '#ef4444'} fillOpacity={0.3} />
                                            ))}
                                        </Bar>
                                        <Line yAxisId="left" type="monotone" dataKey="duracion" name="Tiempo (min)" stroke="#d946ef" strokeWidth={3} dot={{ r: 4, fill: '#d946ef', strokeWidth: 0 }} activeDot={{ r: 6, strokeWidth: 0, fill: '#c026d3' }} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                                    <Mic size={32} className="mb-2 opacity-20" />
                                    <p className="text-sm font-bold">Registra cantos para ver tu evolución.</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* NEW: Historial de Repaso - 1 col */}
                    <div className="md:col-span-1 xl:col-span-1 bg-white/70 backdrop-blur-2xl p-6 lg:p-8 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-slate-900/5 flex flex-col relative overflow-hidden group hover:-translate-y-1 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-300">
                        <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none group-hover:scale-150 transition-transform duration-700"></div>
                        <div className="mb-6 relative z-10">
                            <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                                <Layers size={20} className="text-cyan-500" />
                                Historial de Repaso
                            </h3>
                            <p className="text-sm text-slate-500 font-medium mt-1">Volumen de repaso últimos 14 días</p>
                        </div>
                        <div className="w-full h-[250px] relative z-10">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={repasosData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorRepasos" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4}/>
                                            <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" strokeOpacity={0.6} />
                                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b', fontWeight: 700 }} dy={10} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b', fontWeight: 700 }} allowDecimals={false} />
                                    <Tooltip 
                                        cursor={{ stroke: '#cbd5e1', strokeWidth: 1, strokeDasharray: '4 4' }}
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.15)', backgroundColor: 'rgba(255, 255, 255, 0.98)', backdropFilter: 'blur(12px)', padding: '12px 16px' }}
                                        labelStyle={{ color: '#64748b', fontSize: '11px', fontWeight: 700, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                                    />
                                    <Area type="monotone" dataKey="count" name="Temas repasados" stroke="#06b6d4" strokeWidth={3} fill="url(#colorRepasos)" activeDot={{ r: 6, strokeWidth: 0, fill: '#0891b2' }} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

`;
    code = code.substring(0, targetIndex) + newCharts + code.substring(targetIndex);
    fs.writeFileSync('src/components/DashboardView.tsx', code);
    console.log("Charts JSX injected.");
} else {
    console.log("Target index not found.");
}
