const fs = require('fs');

let code = fs.readFileSync('src/components/TopicEditorDialog.tsx', 'utf8');

const oldHistory = `<div className="space-y-4">
                        {sessions.length === 0 ? (
                            <div className="py-8 text-center text-slate-400">
                                <History size={32} className="mx-auto mb-3 opacity-20" />
                                <p className="text-sm font-medium">No hay sesiones registradas.</p>
                            </div>
                        ) : (
                            sessions.map((session, idx) => {
                                const isRefresco = session.type === "refresco";
                                const isEstudio = session.type === "estudio_inicial";
                                const isCanto = session.type === "canto";
                                const isSimulacro = session.type === "simulacro";
                                
                                return (
                                    <div key={session.id} className="relative group">
                                        <div className="bg-slate-50 hover:bg-slate-100 transition-colors p-4 rounded-2xl flex items-center justify-between border border-slate-100">
                                            <div className="flex items-center gap-4">
                                                <div className={cn(
                                                    "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
                                                    isRefresco ? "bg-emerald-100 text-emerald-600" :
                                                    isEstudio ? "bg-blue-100 text-blue-600" :
                                                    isCanto ? "bg-amber-100 text-amber-600" :
                                                    isSimulacro ? "bg-rose-100 text-rose-600" :
                                                    "bg-indigo-100 text-indigo-600"
                                                )}>
                                                    {isRefresco ? <Clock size={18} /> :
                                                     isEstudio ? <BookOpen size={18} /> :
                                                     isCanto ? <Mic size={18} /> :
                                                     isSimulacro ? <Target size={18} /> :
                                                     <History size={18} />}
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-slate-900 capitalize text-sm">
                                                        {session.type.replace("_", " ")}
                                                    </h4>
                                                    <div className="flex items-center gap-3 text-xs font-medium text-slate-500 mt-0.5">
                                                        <span>{new Date(session.date).toLocaleDateString("es-ES", { year: "numeric", month: "short", day: "2-digit" })}</span>
                                                        <span>•</span>
                                                        <span>{session.durationMinutes} min</span>
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            <div className="flex items-center gap-3">
                                                {session.grade !== undefined && (
                                                    <span className={cn(
                                                        "text-xs font-black px-2 py-1 rounded-md",
                                                        session.grade >= 8 ? "bg-emerald-100 text-emerald-700" :
                                                        session.grade >= 5 ? "bg-amber-100 text-amber-700" :
                                                        "bg-rose-100 text-rose-700"
                                                    )}>
                                                        {session.grade.toFixed(1)}
                                                    </span>
                                                )}
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); deleteSession(session.id); }}
                                                    className="w-8 h-8 rounded-full bg-white border border-slate-200 text-slate-400 hover:text-rose-500 hover:border-rose-200 flex items-center justify-center transition-colors shadow-sm opacity-0 group-hover:opacity-100"
                                                    title="Eliminar sesión"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                     </div>`;

const newHistory = `<div className="relative border-l-2 border-slate-100 ml-4 pl-6 space-y-6 mt-4">
                        {sessions.length === 0 ? (
                            <div className="py-8 -ml-10 text-center text-slate-400">
                                <History size={32} className="mx-auto mb-3 opacity-20" />
                                <p className="text-sm font-medium">No hay sesiones registradas.</p>
                            </div>
                        ) : (
                            sessions.map((session, idx) => {
                                const isRefresco = session.type === "refresco";
                                const isEstudio = session.type === "estudio_inicial";
                                const isCanto = session.type === "canto";
                                const isSimulacro = session.type === "simulacro";
                                
                                const iconColor = isRefresco ? "bg-emerald-500" : isEstudio ? "bg-blue-500" : isCanto ? "bg-amber-500" : isSimulacro ? "bg-rose-500" : "bg-indigo-500";
                                const lightBg = isRefresco ? "bg-emerald-50" : isEstudio ? "bg-blue-50" : isCanto ? "bg-amber-50" : isSimulacro ? "bg-rose-50" : "bg-indigo-50";
                                const textColor = isRefresco ? "text-emerald-600" : isEstudio ? "text-blue-600" : isCanto ? "text-amber-600" : isSimulacro ? "text-rose-600" : "text-indigo-600";
                                
                                return (
                                    <div key={session.id} className="relative group">
                                        {/* Timeline Dot */}
                                        <div className={cn("absolute -left-[31px] top-3 w-3.5 h-3.5 rounded-full border-2 border-white shadow-sm ring-1 ring-slate-900/5", iconColor)} />
                                        
                                        <div className="bg-white hover:bg-slate-50 transition-colors p-4 rounded-[1.25rem] flex flex-col sm:flex-row sm:items-center justify-between ring-1 ring-slate-900/5 shadow-sm gap-4">
                                            <div className="flex items-center gap-4">
                                                <div className={cn("w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ring-1 ring-black/5", lightBg, textColor)}>
                                                    {isRefresco ? <Clock size={18} /> :
                                                     isEstudio ? <BookOpen size={18} /> :
                                                     isCanto ? <Mic size={18} /> :
                                                     isSimulacro ? <Target size={18} /> :
                                                     <History size={18} />}
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-slate-900 capitalize text-sm">
                                                        {session.type.replace("_", " ")}
                                                    </h4>
                                                    <div className="flex items-center gap-3 text-xs font-bold text-slate-400 mt-0.5">
                                                        <span>{new Date(session.date).toLocaleDateString("es-ES", { year: "numeric", month: "short", day: "2-digit" })}</span>
                                                        <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                                                        <span>{session.durationMinutes} min</span>
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            <div className="flex items-center gap-3 justify-end">
                                                {session.grade !== undefined && (
                                                    <span className={cn(
                                                        "text-xs font-black px-2.5 py-1 rounded-lg",
                                                        session.grade >= 8 ? "bg-emerald-50 text-emerald-600 ring-1 ring-emerald-900/10" :
                                                        session.grade >= 5 ? "bg-amber-50 text-amber-600 ring-1 ring-amber-900/10" :
                                                        "bg-rose-50 text-rose-600 ring-1 ring-rose-900/10"
                                                    )}>
                                                        {session.grade.toFixed(1)}
                                                    </span>
                                                )}
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); deleteSession(session.id); }}
                                                    className="w-8 h-8 rounded-full bg-white border border-slate-200 text-slate-300 hover:text-rose-500 hover:border-rose-200 flex items-center justify-center transition-colors shadow-sm opacity-0 group-hover:opacity-100"
                                                    title="Eliminar sesión"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                     </div>`;

code = code.replace(oldHistory, newHistory);
fs.writeFileSync('src/components/TopicEditorDialog.tsx', code);
