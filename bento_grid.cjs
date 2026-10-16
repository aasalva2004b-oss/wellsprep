const fs = require('fs');

let code = fs.readFileSync('src/components/DashboardView.tsx', 'utf8');

const startTag = '{/* KPI BENTO GRID */}';
const endTag = '{/* THE CORE ANALYTICS: 2 COLUMNS */}';

const startIndex = code.indexOf(startTag);
const endIndex = code.indexOf(endTag);

if (startIndex !== -1 && endIndex !== -1) {
    const newKpis = `{/* KPI BENTO GRID */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
                    {/* Consistencia */}
                    <div className="bg-white/70 backdrop-blur-2xl rounded-[2rem] p-6 lg:p-7 shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-slate-900/5 flex flex-col relative overflow-hidden group hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:-translate-y-1 transition-all duration-300">
                        <div className="absolute -right-10 -top-10 w-32 h-32 bg-emerald-500/10 rounded-full group-hover:scale-150 transition-transform duration-700 blur-3xl pointer-events-none"></div>
                        <div className="flex items-center gap-3 mb-6 relative z-10">
                            <div className="bg-emerald-50 text-emerald-500 p-2.5 rounded-[1rem] ring-1 ring-emerald-500/10"><Flame size={20} strokeWidth={2.5}/></div>
                            <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.15em]">Consistencia</span>
                        </div>
                        <div className="mt-auto relative z-10">
                            <div className="flex items-baseline gap-1.5">
                                <h3 className="text-4xl lg:text-5xl font-black text-slate-900 tracking-tighter">{currentStreak}</h3>
                                <span className="text-lg text-slate-400 font-bold tracking-tight">días</span>
                            </div>
                            <p className="text-[13px] font-bold text-emerald-500 mt-2 flex items-center gap-1.5"><TrendingUp size={14} strokeWidth={2.5}/> Racha activa</p>
                        </div>
                    </div>

                    {/* Cobertura */}
                    <div className="bg-white/70 backdrop-blur-2xl rounded-[2rem] p-6 lg:p-7 shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-slate-900/5 flex flex-col relative overflow-hidden group hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:-translate-y-1 transition-all duration-300">
                        <div className="absolute -right-10 -top-10 w-32 h-32 bg-indigo-500/10 rounded-full group-hover:scale-150 transition-transform duration-700 blur-3xl pointer-events-none"></div>
                        <div className="flex items-center gap-3 mb-6 relative z-10">
                            <div className="bg-indigo-50 text-indigo-500 p-2.5 rounded-[1rem] ring-1 ring-indigo-500/10"><Layers size={20} strokeWidth={2.5}/></div>
                            <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.15em]">Cobertura</span>
                        </div>
                        <div className="mt-auto relative z-10">
                            <div className="flex items-baseline gap-1.5">
                                <h3 className="text-4xl lg:text-5xl font-black text-slate-900 tracking-tighter">{totalTopicsStudied}</h3>
                                <span className="text-lg text-slate-400 font-bold tracking-tight">/ {topics.length}</span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-100 rounded-full mt-3 overflow-hidden shadow-inner">
                                <div className="h-full bg-indigo-500 rounded-full shadow-[0_0_10px_rgba(99,102,241,0.5)] transition-all duration-1000" style={{ width: \`\${globalCompletion}%\`}}></div>
                            </div>
                        </div>
                    </div>

                    {/* Horas de Vuelo */}
                    <div className="bg-white/70 backdrop-blur-2xl rounded-[2rem] p-6 lg:p-7 shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-slate-900/5 flex flex-col relative overflow-hidden group hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:-translate-y-1 transition-all duration-300">
                        <div className="absolute -right-10 -top-10 w-32 h-32 bg-blue-500/10 rounded-full group-hover:scale-150 transition-transform duration-700 blur-3xl pointer-events-none"></div>
                        <div className="flex items-center gap-3 mb-6 relative z-10">
                            <div className="bg-blue-50 text-blue-500 p-2.5 rounded-[1rem] ring-1 ring-blue-500/10"><Clock size={20} strokeWidth={2.5}/></div>
                            <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.15em]">Horas de Vuelo</span>
                        </div>
                        <div className="mt-auto relative z-10">
                            <div className="flex items-baseline gap-1">
                                <h3 className="text-4xl lg:text-5xl font-black text-slate-900 tracking-tighter">{Math.floor(totalTimeHours)}</h3>
                                <span className="text-lg text-slate-400 font-bold tracking-tight">h</span>
                                <h3 className="text-4xl lg:text-5xl font-black text-slate-900 tracking-tighter ml-1">{Math.round((totalTimeHours % 1) * 60)}</h3>
                                <span className="text-lg text-slate-400 font-bold tracking-tight">m</span>
                            </div>
                            <p className="text-[13px] font-bold text-slate-400 mt-2 flex items-center gap-1.5">Tiempo de estudio efectivo</p>
                        </div>
                    </div>

                    {/* Media Cantos */}
                    <div className="bg-white/70 backdrop-blur-2xl rounded-[2rem] p-6 lg:p-7 shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-slate-900/5 flex flex-col relative overflow-hidden group hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:-translate-y-1 transition-all duration-300">
                        <div className="absolute -right-10 -top-10 w-32 h-32 bg-amber-500/10 rounded-full group-hover:scale-150 transition-transform duration-700 blur-3xl pointer-events-none"></div>
                        <div className="flex items-center gap-3 mb-6 relative z-10">
                            <div className="bg-amber-50 text-amber-500 p-2.5 rounded-[1rem] ring-1 ring-amber-500/10"><Mic size={20} strokeWidth={2.5}/></div>
                            <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.15em]">Media Cantos</span>
                        </div>
                        <div className="mt-auto relative z-10">
                            <div className="flex items-baseline gap-1.5">
                                <h3 className="text-4xl lg:text-5xl font-black text-slate-900 tracking-tighter">{avgRecentCanto > 0 ? avgRecentCanto.toFixed(1) : '-'}</h3>
                                <span className="text-lg text-slate-400 font-bold tracking-tight">/ 10</span>
                            </div>
                            <p className="text-[13px] font-bold text-slate-400 mt-2 flex items-center gap-1.5">Últimos 10 simulacros</p>
                        </div>
                    </div>
                </div>
                
                `;
    
    code = code.substring(0, startIndex) + newKpis + code.substring(endIndex);
    fs.writeFileSync('src/components/DashboardView.tsx', code);
    console.log("Successfully applied KPI bento updates.");
} else {
    console.log("Could not find start/end tags.");
}

