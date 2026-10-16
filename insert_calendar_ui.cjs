const fs = require('fs');
let file = fs.readFileSync('src/components/DashboardView.tsx', 'utf8');

const calendarUI = `                    {/* 6. Calendario de Trayectoria */}
                    <div className="md:col-span-2 xl:col-span-3 bg-white/70 backdrop-blur-2xl p-6 lg:p-8 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-slate-900/5 flex flex-col relative overflow-hidden group hover:-translate-y-1 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-300">
                        <div className="absolute -left-20 -bottom-20 w-60 h-60 bg-blue-500/5 rounded-full blur-3xl pointer-events-none group-hover:scale-125 transition-transform duration-700"></div>
                        
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 relative z-10 gap-4">
                            <div>
                                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                                    <Calendar size={20} className="text-blue-500" />
                                    Diario de Trayectoria
                                </h3>
                                <p className="text-sm text-slate-500 font-medium mt-1">Tu organización e histórico detallado mensual.</p>
                            </div>
                            
                            <div className="flex items-center gap-3">
                                {/* Filters */}
                                <div className="flex items-center bg-slate-100 p-1 rounded-xl">
                                    <button onClick={() => setDifficultyFilter('all')} className={\`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors \${difficultyFilter === 'all' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}\`}>Todos</button>
                                    <button onClick={() => setDifficultyFilter('hard')} className={\`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors \${difficultyFilter === 'hard' ? 'bg-rose-50 shadow-sm text-rose-600' : 'text-slate-500 hover:text-rose-600'}\`}>Difícil</button>
                                    <button onClick={() => setDifficultyFilter('medium')} className={\`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors \${difficultyFilter === 'medium' ? 'bg-amber-50 shadow-sm text-amber-600' : 'text-slate-500 hover:text-amber-600'}\`}>Medio</button>
                                    <button onClick={() => setDifficultyFilter('easy')} className={\`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors \${difficultyFilter === 'easy' ? 'bg-emerald-50 shadow-sm text-emerald-600' : 'text-slate-500 hover:text-emerald-600'}\`}>Fácil</button>
                                </div>
                                
                                {/* Nav */}
                                <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
                                    <button onClick={prevMonth} className="p-1.5 hover:bg-white rounded-lg transition-colors text-slate-600"><ChevronLeft size={16} /></button>
                                    <span className="text-xs font-bold w-24 text-center text-slate-800 uppercase tracking-wide">
                                        {monthNames[calendarDate.getMonth()]} {calendarDate.getFullYear()}
                                    </span>
                                    <button onClick={nextMonth} className="p-1.5 hover:bg-white rounded-lg transition-colors text-slate-600"><ChevronRight size={16} /></button>
                                </div>
                            </div>
                        </div>
                        
                        <div className="relative z-10 border-l border-t border-slate-100 rounded-2xl overflow-hidden bg-white/50">
                            {/* Days Header */}
                            <div className="grid grid-cols-7 bg-slate-50/80 border-b border-slate-100">
                                {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map(d => (
                                    <div key={d} className="px-2 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest border-r border-slate-100 last:border-r-0">
                                        <span className="hidden sm:inline">{d}</span>
                                        <span className="sm:hidden">{d.slice(0,1)}</span>
                                    </div>
                                ))}
                            </div>
                            
                            {/* Grid */}
                            <div className="grid grid-cols-7">
                                {calendarGrid.map((day, idx) => {
                                    // Make local copy of date and format properly
                                    const y = day.dateObj.getFullYear();
                                    const m = String(day.dateObj.getMonth() + 1).padStart(2, '0');
                                    const d = String(day.dateObj.getDate()).padStart(2, '0');
                                    const dStr = \`\${y}-\${m}-\${d}\`;
                                    
                                    const daySessions = sessionsByDate[dStr] || [];
                                    const hasSessions = daySessions.length > 0;
                                    
                                    return (
                                        <div key={idx} className={cn(
                                            "min-h-[100px] sm:min-h-[120px] p-1.5 sm:p-2.5 border-r border-b border-slate-100 flex flex-col relative group/cell transition-colors",
                                            day.isCurrentMonth ? "bg-white/80 hover:bg-slate-50" : "bg-slate-50/40"
                                        )}>
                                            <div className="flex justify-between items-start mb-2">
                                                <span className={cn(
                                                    "text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full",
                                                    day.isCurrentMonth 
                                                        ? (hasSessions ? "bg-indigo-600 text-white shadow-sm" : "text-slate-700") 
                                                        : "text-slate-400"
                                                )}>
                                                    {day.dateObj.getDate()}
                                                </span>
                                                {hasSessions && (
                                                    <span className="text-[10px] font-bold text-indigo-500 bg-indigo-50/80 px-1.5 py-0.5 rounded-md border border-indigo-100/50 hidden sm:block">
                                                        {daySessions.length} {daySessions.length === 1 ? 'sesión' : 'sesiones'}
                                                    </span>
                                                )}
                                            </div>
                                            
                                            <div className="flex-1 flex flex-col gap-1.5 overflow-y-auto no-scrollbar">
                                                {daySessions.map((s, sIdx) => {
                                                    const topic = topics.find(t => t.id === s.topicId);
                                                    
                                                    let diffColor = "bg-slate-100 text-slate-600 border-slate-200/60";
                                                    if (s.difficulty >= 8) diffColor = "bg-rose-50 text-rose-700 border-rose-200";
                                                    else if (s.difficulty >= 5) diffColor = "bg-amber-50 text-amber-700 border-amber-200";
                                                    else if (s.difficulty > 0) diffColor = "bg-emerald-50 text-emerald-700 border-emerald-200";
                                                    
                                                    const typeMap = {
                                                        estudio_inicial: 'Estudio',
                                                        repaso: 'Repaso',
                                                        refresco: 'Refresco',
                                                        canto: 'Canto',
                                                        simulacro: 'Simulacro'
                                                    };
                                                    
                                                    return (
                                                        <div key={sIdx} className={cn(
                                                            "text-[9px] sm:text-[10px] font-bold px-1.5 py-1 rounded-md border leading-tight truncate cursor-default transition-transform hover:scale-[1.02]",
                                                            diffColor
                                                        )} title={\`\${topic?.number || '?'}: \${typeMap[s.type as keyof typeof typeMap] || s.type} (\${s.duration}m)\`}>
                                                            T{topic?.number || '?'} • {typeMap[s.type as keyof typeof typeMap] || s.type}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>`;

file = file.replace(
    /                <\/div>\n            <\/div>\n        <\/div>\n    \);\n\}/,
    calendarUI + "\n                </div>\n            </div>\n        </div>\n    );\n}"
);

fs.writeFileSync('src/components/DashboardView.tsx', file);
