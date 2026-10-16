const fs = require('fs');

let code = fs.readFileSync('src/components/DashboardView.tsx', 'utf8');

const oldVitals = `<div className="grid grid-cols-2 md:grid-cols-4 gap-4 lg:gap-6">
                    <div className="bg-white rounded-3xl p-5 lg:p-6 shadow-sm border border-slate-100 flex flex-col relative overflow-hidden group">
                        <div className="absolute -right-6 -top-6 w-24 h-24 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-full opacity-10 group-hover:scale-150 transition-transform duration-500 blur-2xl"></div>
                        <div className="flex items-center gap-3 mb-4 relative z-10">
                            <div className="bg-emerald-50 text-emerald-600 p-2.5 rounded-xl"><Flame size={20} strokeWidth={2.5}/></div>
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Consistencia</span>
                        </div>
                        <div className="mt-auto relative z-10">
                            <h3 className="text-4xl lg:text-5xl font-black text-slate-900 tracking-tighter">{currentStreak} <span className="text-xl text-slate-400 font-bold">días</span></h3>
                            <p className="text-sm font-medium text-emerald-600 mt-1 flex items-center gap-1"><TrendingUp size={14}/> Racha actual activa</p>
                        </div>
                    </div>
                    <div className="bg-white rounded-3xl p-5 lg:p-6 shadow-sm border border-slate-100 flex flex-col relative overflow-hidden group">
                        <div className="absolute -right-6 -top-6 w-24 h-24 bg-gradient-to-br from-indigo-400 to-indigo-600 rounded-full opacity-10 group-hover:scale-150 transition-transform duration-500 blur-2xl"></div>
                        <div className="flex items-center gap-3 mb-4 relative z-10">
                            <div className="bg-indigo-50 text-indigo-600 p-2.5 rounded-xl"><Layers size={20} strokeWidth={2.5}/></div>
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Cobertura</span>
                        </div>
                        <div className="mt-auto relative z-10">
                            <h3 className="text-4xl lg:text-5xl font-black text-slate-900 tracking-tighter">{totalTopicsStudied} <span className="text-xl text-slate-400 font-bold">/ {topics.length}</span></h3>
                            <div className="w-full h-1.5 bg-slate-100 rounded-full mt-3 overflow-hidden">
                                <div className="h-full bg-indigo-500 rounded-full" style={{ width: \`\${globalCompletion}%\`}}></div>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white rounded-3xl p-5 lg:p-6 shadow-sm border border-slate-100 flex flex-col relative overflow-hidden group">
                        <div className="absolute -right-6 -top-6 w-24 h-24 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full opacity-10 group-hover:scale-150 transition-transform duration-500 blur-2xl"></div>
                        <div className="flex items-center gap-3 mb-4 relative z-10">
                            <div className="bg-blue-50 text-blue-600 p-2.5 rounded-xl"><Clock size={20} strokeWidth={2.5}/></div>
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Horas de Vuelo</span>
                        </div>
                        <div className="mt-auto relative z-10">
                            <h3 className="text-4xl lg:text-5xl font-black text-slate-900 tracking-tighter">{Math.floor(totalStudyHours)}<span className="text-xl text-slate-400 font-bold">h</span> {Math.round((totalStudyHours % 1) * 60)}<span className="text-xl text-slate-400 font-bold">m</span></h3>
                            <p className="text-sm font-medium text-slate-500 mt-1 flex items-center gap-1">Tiempo de estudio efectivo</p>
                        </div>
                    </div>
                    <div className="bg-white rounded-3xl p-5 lg:p-6 shadow-sm border border-slate-100 flex flex-col relative overflow-hidden group">
                        <div className="absolute -right-6 -top-6 w-24 h-24 bg-gradient-to-br from-amber-400 to-amber-600 rounded-full opacity-10 group-hover:scale-150 transition-transform duration-500 blur-2xl"></div>
                        <div className="flex items-center gap-3 mb-4 relative z-10">
                            <div className="bg-amber-50 text-amber-600 p-2.5 rounded-xl"><Mic size={20} strokeWidth={2.5}/></div>
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Media Cantos</span>
                        </div>
                        <div className="mt-auto relative z-10">
                            <h3 className="text-4xl lg:text-5xl font-black text-slate-900 tracking-tighter">{avgCantoGrade > 0 ? avgCantoGrade.toFixed(1) : '-'} <span className="text-xl text-slate-400 font-bold">/ 10</span></h3>
                            <p className="text-sm font-medium text-slate-500 mt-1 flex items-center gap-1">Calificación promedio</p>
                        </div>
                    </div>
                </div>`;

const newVitals = `<div className="grid grid-cols-2 md:grid-cols-4 gap-4 lg:gap-6">
                    <div className="bg-white/80 backdrop-blur-xl rounded-[2rem] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-slate-900/5 flex flex-col relative overflow-hidden group hover:-translate-y-1 transition-transform duration-300">
                        <div className="absolute -right-6 -top-6 w-32 h-32 bg-emerald-500/10 rounded-full group-hover:scale-150 transition-transform duration-700 blur-3xl pointer-events-none"></div>
                        <div className="flex items-center gap-3 mb-4 relative z-10">
                            <div className="bg-emerald-50 text-emerald-500 p-2.5 rounded-[14px] ring-1 ring-emerald-500/10"><Flame size={20} strokeWidth={2.5}/></div>
                            <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.1em]">Consistencia</span>
                        </div>
                        <div className="mt-auto relative z-10">
                            <div className="flex items-baseline gap-1">
                                <h3 className="text-4xl lg:text-5xl font-black text-slate-900 tracking-tighter">{currentStreak}</h3>
                                <span className="text-lg text-slate-400 font-bold tracking-tight">días</span>
                            </div>
                            <p className="text-[13px] font-bold text-emerald-500 mt-2 flex items-center gap-1.5"><TrendingUp size={14}/> Racha activa</p>
                        </div>
                    </div>
                    <div className="bg-white/80 backdrop-blur-xl rounded-[2rem] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-slate-900/5 flex flex-col relative overflow-hidden group hover:-translate-y-1 transition-transform duration-300">
                        <div className="absolute -right-6 -top-6 w-32 h-32 bg-indigo-500/10 rounded-full group-hover:scale-150 transition-transform duration-700 blur-3xl pointer-events-none"></div>
                        <div className="flex items-center gap-3 mb-4 relative z-10">
                            <div className="bg-indigo-50 text-indigo-500 p-2.5 rounded-[14px] ring-1 ring-indigo-500/10"><Layers size={20} strokeWidth={2.5}/></div>
                            <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.1em]">Cobertura</span>
                        </div>
                        <div className="mt-auto relative z-10">
                            <div className="flex items-baseline gap-1">
                                <h3 className="text-4xl lg:text-5xl font-black text-slate-900 tracking-tighter">{totalTopicsStudied}</h3>
                                <span className="text-lg text-slate-400 font-bold tracking-tight">/ {topics.length}</span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-100 rounded-full mt-3 overflow-hidden shadow-inner">
                                <div className="h-full bg-indigo-500 rounded-full shadow-[0_0_10px_rgba(99,102,241,0.5)]" style={{ width: \`\${globalCompletion}%\`}}></div>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white/80 backdrop-blur-xl rounded-[2rem] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-slate-900/5 flex flex-col relative overflow-hidden group hover:-translate-y-1 transition-transform duration-300">
                        <div className="absolute -right-6 -top-6 w-32 h-32 bg-blue-500/10 rounded-full group-hover:scale-150 transition-transform duration-700 blur-3xl pointer-events-none"></div>
                        <div className="flex items-center gap-3 mb-4 relative z-10">
                            <div className="bg-blue-50 text-blue-500 p-2.5 rounded-[14px] ring-1 ring-blue-500/10"><Clock size={20} strokeWidth={2.5}/></div>
                            <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.1em]">Horas de Vuelo</span>
                        </div>
                        <div className="mt-auto relative z-10">
                            <div className="flex items-baseline gap-1">
                                <h3 className="text-4xl lg:text-5xl font-black text-slate-900 tracking-tighter">{Math.floor(totalStudyHours)}</h3>
                                <span className="text-lg text-slate-400 font-bold tracking-tight">h</span>
                                <h3 className="text-4xl lg:text-5xl font-black text-slate-900 tracking-tighter ml-1">{Math.round((totalStudyHours % 1) * 60)}</h3>
                                <span className="text-lg text-slate-400 font-bold tracking-tight">m</span>
                            </div>
                            <p className="text-[13px] font-bold text-slate-400 mt-2 flex items-center gap-1.5">Tiempo efectivo</p>
                        </div>
                    </div>
                    <div className="bg-white/80 backdrop-blur-xl rounded-[2rem] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-slate-900/5 flex flex-col relative overflow-hidden group hover:-translate-y-1 transition-transform duration-300">
                        <div className="absolute -right-6 -top-6 w-32 h-32 bg-amber-500/10 rounded-full group-hover:scale-150 transition-transform duration-700 blur-3xl pointer-events-none"></div>
                        <div className="flex items-center gap-3 mb-4 relative z-10">
                            <div className="bg-amber-50 text-amber-500 p-2.5 rounded-[14px] ring-1 ring-amber-500/10"><Mic size={20} strokeWidth={2.5}/></div>
                            <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.1em]">Media Cantos</span>
                        </div>
                        <div className="mt-auto relative z-10">
                            <div className="flex items-baseline gap-1">
                                <h3 className="text-4xl lg:text-5xl font-black text-slate-900 tracking-tighter">{avgCantoGrade > 0 ? avgCantoGrade.toFixed(1) : '-'}</h3>
                                <span className="text-lg text-slate-400 font-bold tracking-tight">/ 10</span>
                            </div>
                            <p className="text-[13px] font-bold text-slate-400 mt-2 flex items-center gap-1.5">Calificación promedio</p>
                        </div>
                    </div>
                </div>`;

code = code.replace(oldVitals, newVitals);

fs.writeFileSync('src/components/DashboardView.tsx', code);
