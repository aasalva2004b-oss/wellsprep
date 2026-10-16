const fs = require('fs');

const code = `import { useState, useMemo } from "react";
import { UserProgress, Topic } from "../types";
import { LineChart as RechartsLineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ComposedChart, ReferenceLine, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Scatter, ScatterChart, ZAxis } from "recharts";
import { BrainCircuit, Target, TrendingUp, AlertTriangle, CheckCircle2, Flame, Calendar, Clock, BookOpen, AlertOctagon, Zap, Layers, ChevronRight, Activity } from "lucide-react";
import { cn } from "../lib/utils";
import { calculateNextSRSState } from "../lib/srs";

export function DashboardView({ userProgress, topics }: { userProgress: Record<string, UserProgress>; topics: Topic[] }) {
    
    // --- ADVANCED ANALYTICS ENGINE ---
    const allSessions = useMemo(() => {
        let sessions: { date: string, duration: number, type: string, topicId: string, grade?: number, difficulty?: number }[] = [];
        Object.entries(userProgress).forEach(([topicId, prog]) => {
           if (prog.history) {
               sessions.push(...prog.history.map(h => ({ ...h, topicId })));
           }
        });
        return sessions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }, [userProgress]);

    // 1. Consistency Heatmap (Last 12 weeks)
    const heatmapData = useMemo(() => {
        const today = new Date();
        const days = [];
        for (let i = 83; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            const daySessions = allSessions.filter(s => s.date === dateStr);
            const totalDuration = daySessions.reduce((acc, s) => acc + (s.duration || 0), 0);
            days.push({ date: dateStr, duration: totalDuration, count: daySessions.length });
        }
        return days;
    }, [allSessions]);

    const currentStreak = useMemo(() => {
        let streak = 0;
        const today = new Date();
        today.setHours(0,0,0,0);
        
        for (let i = 0; i < 300; i++) { // check up to 300 days back
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            if (allSessions.some(s => s.date === dateStr)) {
                streak++;
            } else if (i > 0) { // allow skipping today if haven't studied yet, but if missed yesterday, break
                break;
            }
        }
        return streak;
    }, [allSessions]);

    // 2. Smart Queue (Agenda)
    const smartQueue = useMemo(() => {
        const queue: { topic: Topic, reason: string, urgency: number, nextDate: string }[] = [];
        const today = new Date().getTime();

        topics.forEach(t => {
            const prog = userProgress[t.id];
            if (!prog || !prog.firstStudyDate) return;

            const srsState = {
                easinessFactor: prog.srsEasinessFactor || 2.5,
                interval: prog.srsInterval || 0,
                repetitions: prog.srsRepetitions || 0
            };
            const nextDateStr = calculateNextSRSState(prog.difficulty || 5, srsState, prog.lastReviewDate).nextReviewDate;
            const nextDate = new Date(nextDateStr).getTime();
            
            const diffDays = (nextDate - today) / (1000 * 3600 * 24);
            
            if (diffDays <= 1) {
                queue.push({
                    topic: t,
                    reason: diffDays < -3 ? "Olvido Crítico (Atrasado)" : "Repaso Programado",
                    urgency: diffDays < -3 ? 3 : diffDays <= 0 ? 2 : 1,
                    nextDate: nextDateStr
                });
            }
        });

        return queue.sort((a, b) => b.urgency - a.urgency);
    }, [topics, userProgress]);

    // 3. Burn-up (Cumulative topics studied)
    const cumulativeProgress = useMemo(() => {
        const dates = allSessions.filter(s => s.type === "estudio_inicial").map(s => s.date).sort();
        if (dates.length === 0) return [];
        
        const start = new Date(dates[0]);
        const end = new Date();
        const data = [];
        let accumulated = 0;

        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 7)) {
            const dStr = d.toISOString().split('T')[0];
            accumulated = dates.filter(date => date <= dStr).length;
            data.push({
                date: dStr.slice(5), // MM-DD
                estudiados: accumulated,
                objetivo: Math.min(topics.length, accumulated + 2) // Fake dynamic target for visual baseline
            });
        }
        return data;
    }, [allSessions, topics]);

    // 4. Domain Radar
    const radarData = useMemo(() => {
        const blocks: Record<string, { total: number, studied: number, score: number }> = {};
        topics.forEach(t => {
            if (!blocks[t.block]) blocks[t.block] = { total: 0, studied: 0, score: 0 };
            blocks[t.block].total++;
            const p = userProgress[t.id];
            if (p && p.firstStudyDate) {
                blocks[t.block].studied++;
                let s = 5;
                if (p.difficulty) s += (5 - p.difficulty/2); // inverted difficulty
                if (p.srsRepetitions) s += p.srsRepetitions * 0.5;
                blocks[t.block].score += Math.min(10, s);
            }
        });

        return Object.entries(blocks).map(([name, data]) => ({
            materia: name.length > 15 ? name.substring(0, 15) + "..." : name,
            dominio: data.studied > 0 ? (data.score / data.studied).toFixed(1) : 0,
            cobertura: ((data.studied / data.total) * 10).toFixed(1)
        }));
    }, [topics, userProgress]);

    // Global Vitals
    const totalTopicsStudied = topics.filter(t => userProgress[t.id]?.firstStudyDate).length;
    const globalCompletion = (totalTopicsStudied / topics.length) * 100;
    const totalTimeHours = allSessions.reduce((acc, s) => acc + (s.duration || 0), 0) / 60;
    
    // Recent Cantos Performance (Last 10)
    const recentCantos = allSessions.filter(s => (s.type === 'canto' || s.type === 'simulacro') && s.grade).slice(-10);
    const avgRecentCanto = recentCantos.length > 0 ? (recentCantos.reduce((a, b) => a + (b.grade || 0), 0) / recentCantos.length) : 0;

    return (
        <div className="w-full h-full p-4 sm:p-6 lg:p-8 bg-[#F5F5F7] overflow-y-auto no-scrollbar">
            <div className="max-w-[100rem] mx-auto space-y-6 lg:space-y-8">
                
                {/* HERO HEADER & GLOBAL VITALS */}
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6 mb-2">
                    <div>
                        <h1 className="text-3xl lg:text-4xl font-black text-slate-900 tracking-tight font-serif">
                            Centro de Comando
                        </h1>
                        <p className="text-slate-500 font-medium mt-1 flex items-center gap-2">
                            <Activity size={16} className="text-indigo-500" />
                            Telemetría en tiempo real de tu oposición
                        </p>
                    </div>
                </div>

                {/* KPI BENTO GRID */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 lg:gap-6">
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
                        <div className="absolute -right-6 -top-6 w-24 h-24 bg-gradient-to-br from-amber-400 to-amber-600 rounded-full opacity-10 group-hover:scale-150 transition-transform duration-500 blur-2xl"></div>
                        <div className="flex items-center gap-3 mb-4 relative z-10">
                            <div className="bg-amber-50 text-amber-600 p-2.5 rounded-xl"><Clock size={20} strokeWidth={2.5}/></div>
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Inversión Total</span>
                        </div>
                        <div className="mt-auto relative z-10">
                            <h3 className="text-4xl lg:text-5xl font-black text-slate-900 tracking-tighter">{totalTimeHours.toFixed(0)} <span className="text-xl text-slate-400 font-bold">hrs</span></h3>
                            <p className="text-sm font-medium text-slate-500 mt-1">Tiempo de estudio efectivo</p>
                        </div>
                    </div>

                    <div className="bg-white rounded-3xl p-5 lg:p-6 shadow-sm border border-slate-100 flex flex-col relative overflow-hidden group">
                        <div className="absolute -right-6 -top-6 w-24 h-24 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full opacity-10 group-hover:scale-150 transition-transform duration-500 blur-2xl"></div>
                        <div className="flex items-center gap-3 mb-4 relative z-10">
                            <div className="bg-blue-50 text-blue-600 p-2.5 rounded-xl"><Target size={20} strokeWidth={2.5}/></div>
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Media Cantos</span>
                        </div>
                        <div className="mt-auto relative z-10">
                            <h3 className="text-4xl lg:text-5xl font-black text-slate-900 tracking-tighter">{avgRecentCanto.toFixed(1)} <span className="text-xl text-slate-400 font-bold">/ 10</span></h3>
                            <p className="text-sm font-medium text-slate-500 mt-1">En los últimos 10 simulacros</p>
                        </div>
                    </div>
                </div>

                {/* THE CORE ANALYTICS: 2 COLUMNS */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 lg:gap-8">
                    
                    {/* LEFT: Charts & Trends */}
                    <div className="xl:col-span-2 space-y-6 lg:space-y-8">
                        
                        {/* 1. Velocity & Trajectory (Burn-up) */}
                        <div className="bg-white p-6 lg:p-8 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col">
                            <div className="flex justify-between items-end mb-6">
                                <div>
                                    <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                                        <TrendingUp size={20} className="text-indigo-500" />
                                        Trayectoria de Estudio (Burn-up)
                                    </h3>
                                    <p className="text-sm text-slate-500 font-medium mt-1">Temas acumulados vs. Proyección base</p>
                                </div>
                            </div>
                            
                            <div className="w-full h-[280px]">
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
                                                contentStyle={{ borderRadius: '16px', border: '1px solid rgba(226, 232, 240, 0.8)', boxShadow: '0 10px 40px -10px rgba(0, 0, 0, 0.08)', backgroundColor: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(8px)' }}
                                                itemStyle={{ fontWeight: 700 }}
                                            />
                                            <Area type="monotone" dataKey="estudiados" name="Temas Estudiados" stroke="#6366f1" strokeWidth={4} fill="url(#colorEstudiados)" activeDot={{ r: 6, strokeWidth: 0, fill: '#4f46e5' }} />
                                            <Line type="monotone" dataKey="objetivo" name="Objetivo Teórico" stroke="#cbd5e1" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                                        <Activity size={32} className="mb-2 opacity-20" />
                                        <p className="text-sm font-bold">Registra estudios iniciales para trazar tu trayectoria.</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 2. Consistency Heatmap */}
                        <div className="bg-white p-6 lg:p-8 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col">
                            <div className="flex justify-between items-end mb-6">
                                <div>
                                    <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                                        <Calendar size={20} className="text-emerald-500" />
                                        Mapa de Consistencia (Últimos 84 días)
                                    </h3>
                                    <p className="text-sm text-slate-500 font-medium mt-1">La disciplina vence al talento. Visualiza tus días de estudio activo.</p>
                                </div>
                            </div>
                            
                            <div className="w-full overflow-x-auto no-scrollbar pb-2">
                                <div className="min-w-[700px] flex gap-1.5 items-start">
                                    {/* Create 12 columns (weeks), each with 7 rows (days) */}
                                    {Array.from({ length: 12 }).map((_, weekIdx) => (
                                        <div key={weekIdx} className="flex flex-col gap-1.5">
                                            {Array.from({ length: 7 }).map((_, dayIdx) => {
                                                const dayData = heatmapData[weekIdx * 7 + dayIdx];
                                                if (!dayData) return <div key={dayIdx} className="w-[14px] h-[14px] sm:w-4 sm:h-4 rounded-sm bg-transparent" />;
                                                
                                                const d = dayData.duration;
                                                let bgClass = "bg-slate-100";
                                                if (d > 0 && d <= 60) bgClass = "bg-emerald-200";
                                                else if (d > 60 && d <= 180) bgClass = "bg-emerald-400";
                                                else if (d > 180 && d <= 300) bgClass = "bg-emerald-500";
                                                else if (d > 300) bgClass = "bg-emerald-700 shadow-[0_0_8px_rgba(4,120,87,0.5)]";

                                                return (
                                                    <div 
                                                        key={dayIdx} 
                                                        className={cn("w-[14px] h-[14px] sm:w-4 sm:h-4 rounded-[3px] transition-all hover:scale-125 hover:z-10 relative group cursor-pointer", bgClass)}
                                                        title={\`\${dayData.date}: \${dayData.duration} min\`}
                                                    >
                                                        {/* Custom Tooltip on hover */}
                                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-900 text-white text-[10px] font-bold rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50">
                                                            {dayData.duration} min
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="mt-4 flex items-center justify-end gap-2 text-xs font-bold text-slate-400 uppercase">
                                <span>Menos</span>
                                <div className="w-3 h-3 rounded-sm bg-slate-100"></div>
                                <div className="w-3 h-3 rounded-sm bg-emerald-200"></div>
                                <div className="w-3 h-3 rounded-sm bg-emerald-400"></div>
                                <div className="w-3 h-3 rounded-sm bg-emerald-500"></div>
                                <div className="w-3 h-3 rounded-sm bg-emerald-700"></div>
                                <span>Más</span>
                            </div>
                        </div>

                    </div>

                    {/* RIGHT: Action Queue & Radar */}
                    <div className="xl:col-span-1 space-y-6 lg:space-y-8 flex flex-col">
                        
                        {/* Smart Action Queue */}
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
                        </div>

                        {/* Balance de Dominio (Radar) */}
                        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex-1 flex flex-col">
                            <div className="mb-2">
                                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                                    <Target size={20} className="text-rose-500" />
                                    Balance de Dominio
                                </h3>
                                <p className="text-sm text-slate-500 font-medium mt-1">Nivel de madurez (0-10) por bloque</p>
                            </div>
                            
                            <div className="flex-1 w-full min-h-[250px] relative -mt-4">
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
                                        <p className="text-sm font-bold text-center px-4">Estudia temas para calcular tu balance de bloques.</p>
                                    </div>
                                )}
                            </div>
                        </div>

                    </div>
                </div>

            </div>
        </div>
    );
}
`;
fs.writeFileSync('src/components/DashboardView.tsx', code);
