const fs = require('fs');

let code = fs.readFileSync('src/components/TopicEditorDialog.tsx', 'utf8');

const retentionDataLogic = `
    const retentionData = useMemo(() => {
        if (!progress?.firstStudyDate || !nextDate || !progress.lastReviewDate) return [];
        
        const lastReview = new Date(progress.lastReviewDate);
        const nextReview = new Date(nextDate);
        
        // Let's generate a 14 point curve
        const daysTotal = Math.max(1, (nextReview.getTime() - lastReview.getTime()) / (1000 * 3600 * 24));
        const today = new Date();
        const daysSinceReview = Math.max(0, (today.getTime() - lastReview.getTime()) / (1000 * 3600 * 24));
        
        const data = [];
        for(let i = 0; i <= 14; i++) {
            const pointDate = new Date(lastReview);
            const daysToAdd = (i / 14) * (daysTotal * 1.5); // go up to 150% of the interval to show dropping below 80%
            pointDate.setDate(pointDate.getDate() + daysToAdd);
            
            // Formula: R = e^(-t/S). We know R=0.8 when t=daysTotal
            // 0.8 = e^(-daysTotal/S) => S = -daysTotal / ln(0.8)
            const S = -daysTotal / Math.log(0.8);
            const retention = Math.exp(-daysToAdd / S) * 100;
            
            data.push({
               index: i,
               label: daysToAdd === 0 ? "Repaso" : \`+\${Math.round(daysToAdd)}d\`,
               retention: Math.max(0, retention).toFixed(1),
               isToday: Math.abs(daysToAdd - daysSinceReview) < (daysTotal * 1.5 / 28) // approximate marker
            });
        }
        return data;
    }, [progress, nextDate]);
`;

const chartLocation = '{/* History Timeline */}';
const newChartHTML = `
                 {/* Retention Projection */}
                 <div className="bg-slate-900 rounded-3xl p-6 shadow-xl ring-1 ring-slate-800 flex flex-col relative overflow-hidden group mb-6">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl opacity-50 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"></div>
                    
                    <div className="mb-6 relative z-10 flex justify-between items-end">
                        <div>
                            <h3 className="text-sm font-black text-white flex items-center gap-2 uppercase tracking-wide">
                                <BrainCircuit size={16} className="text-indigo-400" /> Proyección de Retención (Curva del Olvido)
                            </h3>
                            <p className="text-[11px] font-bold text-slate-400 mt-1">Decaimiento simulado de memoria hasta el próximo repaso</p>
                        </div>
                        {daysUntilNextReview > 0 && (
                            <div className="text-right">
                                <span className="text-2xl font-black text-emerald-400">{daysUntilNextReview}</span>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Días restantes</span>
                            </div>
                        )}
                        {daysUntilNextReview <= 0 && progress?.firstStudyDate && (
                             <div className="text-right">
                                <span className="text-2xl font-black text-rose-400">¡Hoy!</span>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Repaso Pendiente</span>
                            </div>
                        )}
                    </div>
                    
                    <div className="w-full h-[220px] relative z-10">
                        {retentionData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={retentionData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorRetention" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#818cf8" stopOpacity={0.4}/>
                                            <stop offset="95%" stopColor="#818cf8" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b', fontWeight: 700 }} dy={10} />
                                    <YAxis width={40} domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b', fontWeight: 700 }} tickFormatter={(val) => \`\${val}%\`} />
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" strokeOpacity={0.6} />
                                    
                                    <Tooltip 
                                        formatter={(value) => [\`\${value}%\`, 'Retención']}
                                        cursor={{ stroke: '#818cf8', strokeWidth: 1, strokeDasharray: '4 4' }}
                                        contentStyle={{ borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.5)', backgroundColor: 'rgba(15, 23, 42, 0.95)', backdropFilter: 'blur(12px)', padding: '12px 16px' }}
                                        itemStyle={{ color: '#fff', fontWeight: 800, fontSize: '13px' }}
                                        labelStyle={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                                    />
                                    
                                    <ReferenceLine y={80} stroke="#f43f5e" strokeDasharray="3 3" strokeWidth={2} label={{ position: 'insideBottomLeft', value: 'Umbral de Repaso (80%)', fill: '#f43f5e', fontSize: 10, fontWeight: 800 }} />
                                    
                                    <Area type="monotone" dataKey="retention" stroke="#818cf8" strokeWidth={3} fillOpacity={1} fill="url(#colorRetention)" activeDot={{ r: 6, fill: '#0f172a', stroke: '#818cf8', strokeWidth: 3 }} />
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500">
                               <BrainCircuit size={32} className="mb-3 opacity-20" />
                               <p className="text-xs font-bold uppercase tracking-wider">Estudia el tema para generar predicciones</p>
                            </div>
                        )}
                    </div>
                 </div>
`;

if (code.includes('const diffChartData')) {
    code = code.replace('const diffChartData', retentionDataLogic + '\n    const diffChartData');
    code = code.replace(chartLocation, newChartHTML + '\n                 ' + chartLocation);
    // don't forget to import BrainCircuit if missing
    if (!code.includes('BrainCircuit')) {
        code = code.replace('import { ', 'import { BrainCircuit, ');
    }
    fs.writeFileSync('src/components/TopicEditorDialog.tsx', code);
    console.log("Retention graph added successfully.");
} else {
    console.log("Could not find insertion points.");
}
