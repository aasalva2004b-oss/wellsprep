const fs = require('fs');
let code = fs.readFileSync('src/components/DashboardView.tsx', 'utf8');

const oldAgenda = `                        {/* Smart Action Queue */}
                        <div className="bg-slate-900 p-1 rounded-[2rem] shadow-xl relative overflow-hidden flex-shrink-0">
                            <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-500/30 via-transparent to-transparent pointer-events-none"></div>
                            
                            <div className="bg-slate-900/90 backdrop-blur-3xl rounded-[1.85rem] p-6 h-full relative z-10 border border-slate-700/50">
                                <h3 className="text-lg font-black text-white flex items-center gap-2 mb-6">
                                    <Zap size={20} className="text-amber-400" fill="currentColor"/>
                                    Agenda Inteligente (SRS)
                                </h3>
                                
                                <div className="space-y-3 max-h-[300px] overflow-y-auto no-scrollbar pr-1">
                                    {smartQueue.length > 0 ? (
                                        smartQueue.map((item, idx) => (
                                            <div key={idx} className="bg-slate-800/80 hover:bg-slate-800 border border-slate-700/50 p-4 rounded-2xl transition-colors cursor-pointer group">
                                                <div className="flex justify-between items-start mb-1.5">
                                                    <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">
                                                        Tema {item.topic.number}
                                                    </span>
                                                    {item.urgency === 3 && <span className="flex h-2 w-2 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]"></span>}
                                                    {item.urgency === 2 && <span className="flex h-2 w-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]"></span>}
                                                </div>
                                                <h4 className="text-sm font-bold text-white line-clamp-1 group-hover:text-indigo-400 transition-colors">
                                                    {item.topic.title}
                                                </h4>
                                                <p className={cn("text-xs font-semibold mt-2 flex items-center gap-1", item.urgency === 3 ? "text-rose-400" : item.urgency === 2 ? "text-amber-400" : "text-emerald-400")}>
                                                    {item.urgency === 3 ? <AlertOctagon size={12}/> : <Clock size={12}/>}
                                                    {item.reason}
                                                </p>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="py-8 text-center">
                                            <CheckCircle2 size={32} className="mx-auto text-emerald-500 mb-3" />
                                            <p className="text-sm font-bold text-white">¡Todo al día!</p>
                                            <p className="text-xs text-slate-400 mt-1">No tienes repasos pendientes.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>`;

const newAgenda = `                        {/* Smart Action Queue */}
                        <div className="bg-white/80 backdrop-blur-xl p-6 lg:p-8 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-slate-900/5 relative overflow-hidden flex-shrink-0 group">
                            <div className="absolute -right-6 -top-6 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl pointer-events-none group-hover:scale-150 transition-transform duration-700"></div>
                            
                            <div className="relative z-10">
                                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2 mb-1">
                                    <Zap size={20} className="text-amber-500" fill="currentColor"/>
                                    Agenda Inteligente
                                </h3>
                                <p className="text-sm text-slate-500 font-medium mb-6">Repasos priorizados por SRS</p>
                                
                                <div className="space-y-3 max-h-[300px] overflow-y-auto no-scrollbar pr-1">
                                    {smartQueue.length > 0 ? (
                                        smartQueue.map((item, idx) => (
                                            <div key={idx} className="bg-slate-50/80 hover:bg-white border border-slate-100 p-4 rounded-2xl transition-all cursor-pointer group/item shadow-sm hover:shadow-md">
                                                <div className="flex justify-between items-start mb-1.5">
                                                    <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-white text-slate-500 ring-1 ring-slate-900/5 shadow-sm">
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
                        </div>`;

code = code.replace(oldAgenda, newAgenda);

// Refine Radar as well
code = code.replace(
    '<div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex-1 flex flex-col">',
    '<div className="bg-white/80 backdrop-blur-xl p-6 lg:p-8 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-slate-900/5 flex-1 flex flex-col group relative overflow-hidden">'
);
code = code.replace(
    '<Target size={20} className="text-rose-500" />',
    '<Target size={20} className="text-rose-500" />\n                                    <div className="absolute -left-6 -bottom-6 w-32 h-32 bg-rose-500/10 rounded-full blur-3xl pointer-events-none group-hover:scale-150 transition-transform duration-700"></div>'
);

fs.writeFileSync('src/components/DashboardView.tsx', code);
