const fs = require('fs');
let file = fs.readFileSync('src/components/TopicEditorDialog.tsx', 'utf8');

const targetRegex = /\{sessions\.length === 0 \? \([\s\S]*?No hay sesiones registradas\.\<\/p\>\s*\<\/div\>\s*\) : \([\s\S]*?\}\)\s*\)\}/;

// Wait, the previous script changed it to groupedSessions.length === 0 ?
const currentTargetRegex = /\{groupedSessions\.length === 0 \? \([\s\S]*?No hay sesiones registradas\.\<\/p\>\s*\<\/div\>\s*\) : \([\s\S]*?\}\)\s*\)\}/;

const replacement = `{groupedSessions.length === 0 ? (
                            <div className="py-8 text-center text-slate-400">
                                <History size={32} className="mx-auto mb-3 opacity-20" />
                                <p className="text-sm font-medium">No hay sesiones registradas.</p>
                            </div>
                        ) : (
                            groupedSessions.map((session, idx) => {
                                const renderItem = (subSession, isSubItem = false) => {
                                    const isRefresco = subSession.type === "refresco";
                                    const isEstudio = subSession.type === "estudio_inicial";
                                    const isCanto = subSession.type === "canto";
                                    const isSimulacro = subSession.type === "simulacro";
                                    
                                    return (
                                        <div key={subSession.id} className={cn("relative group transition-colors flex items-center justify-between", isSubItem ? "bg-white p-3 rounded-xl border border-slate-100/50 shadow-[0_2px_10px_rgb(0,0,0,0.02)]" : "bg-slate-50 hover:bg-slate-100 p-4 rounded-2xl border border-slate-100")}>
                                            <div className="flex items-center gap-4">
                                                <div className={cn(
                                                    "rounded-full flex items-center justify-center shrink-0",
                                                    isSubItem ? "w-8 h-8" : "w-10 h-10",
                                                    isRefresco ? "bg-emerald-100 text-emerald-600" :
                                                    isEstudio ? "bg-blue-100 text-blue-600" :
                                                    isCanto ? "bg-amber-100 text-amber-600" :
                                                    isSimulacro ? "bg-rose-100 text-rose-600" :
                                                    "bg-indigo-100 text-indigo-600"
                                                )}>
                                                    {isRefresco ? <Clock size={isSubItem ? 14 : 18} /> :
                                                     isEstudio ? <BookOpen size={isSubItem ? 14 : 18} /> :
                                                     isCanto ? <Mic size={isSubItem ? 14 : 18} /> :
                                                     isSimulacro ? <Target size={isSubItem ? 14 : 18} /> :
                                                     <History size={isSubItem ? 14 : 18} />}
                                                </div>
                                                <div>
                                                    <h4 className={cn("font-bold text-slate-900 capitalize", isSubItem ? "text-xs" : "text-sm")}>
                                                        {subSession.type.replace("_", " ")} {isSubItem && subSession.completesVuelta === false ? "(Parcial)" : ""}
                                                    </h4>
                                                    <div className={cn("flex items-center gap-2 font-medium text-slate-500 mt-0.5", isSubItem ? "text-[10px]" : "text-xs")}>
                                                        <span>{new Date(subSession.date).toLocaleDateString("es-ES", { year: "numeric", month: "short", day: "2-digit" })}</span>
                                                        <span>•</span>
                                                        <span>{subSession.duration} min</span>
                                                        {subSession.difficulty && (
                                                            <>
                                                              <span>•</span>
                                                              <span>Dif. {subSession.difficulty}/10</span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            {!isSubItem && (
                                              <div className="flex items-center gap-2">
                                                  <button onClick={() => setSessionToDelete(session.id)} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-colors">
                                                      <Trash2 size={16} />
                                                  </button>
                                              </div>
                                            )}
                                            
                                            {/* Delete Confirmation Overlay inside main item */}
                                            {!isSubItem && (
                                              <AnimatePresence>
                                                  {sessionToDelete === session.id && (
                                                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-white/90 backdrop-blur-sm rounded-2xl border border-rose-100 flex items-center justify-between px-6 z-10">
                                                          <span className="text-sm font-bold text-slate-700">¿Eliminar ciclo completo?</span>
                                                          <div className="flex items-center gap-2">
                                                              <button onClick={() => setSessionToDelete(null)} className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-lg transition-colors">Cancelar</button>
                                                              <button onClick={() => deleteSessionHandler(session.originalIds)} className="px-3 py-1.5 text-xs font-bold text-white bg-rose-500 hover:bg-rose-600 rounded-lg transition-colors shadow-sm">Eliminar</button>
                                                          </div>
                                                      </motion.div>
                                                  )}
                                              </AnimatePresence>
                                            )}
                                        </div>
                                    );
                                };

                                if (session.subSessions && session.subSessions.length > 1) {
                                    return (
                                        <div key={session.id} className="relative group bg-slate-50/50 border border-slate-200/60 rounded-[1.5rem] p-3 mb-2 shadow-sm">
                                            <div className="flex items-center justify-between px-2 pt-1 pb-3">
                                                <div className="flex items-center gap-2">
                                                   <Layers size={14} className="text-indigo-500" />
                                                   <h4 className="text-xs font-bold text-indigo-900 tracking-wide uppercase">Ciclo Acumulado</h4>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <span className="text-xs font-bold text-slate-600">{session.duration} min totales</span>
                                                    <button onClick={() => setSessionToDelete(session.id)} className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors">
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                            
                                            <div className="space-y-2 relative">
                                                <div className="absolute left-7 top-4 bottom-4 w-0.5 bg-slate-200/80 -z-10"></div>
                                                {[...session.subSessions].reverse().map(sub => renderItem(sub, true))}
                                            </div>
                                            
                                            <AnimatePresence>
                                                {sessionToDelete === session.id && (
                                                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-white/95 backdrop-blur-sm rounded-[1.5rem] border border-rose-200 flex flex-col items-center justify-center z-20">
                                                        <span className="text-sm font-bold text-slate-800 mb-3">¿Eliminar este ciclo de {session.subSessions.length} sesiones?</span>
                                                        <div className="flex items-center gap-3">
                                                            <button onClick={() => setSessionToDelete(null)} className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">Cancelar</button>
                                                            <button onClick={() => deleteSessionHandler(session.originalIds)} className="px-4 py-2 text-xs font-bold text-white bg-rose-500 hover:bg-rose-600 rounded-xl transition-colors shadow-sm">Eliminar Todo</button>
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    );
                                }

                                // Normal single item
                                return renderItem(session, false);
                            })
                        )}`;

file = file.replace(currentTargetRegex, replacement);

fs.writeFileSync('src/components/TopicEditorDialog.tsx', file);
