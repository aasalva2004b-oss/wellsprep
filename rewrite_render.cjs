const fs = require('fs');
let code = fs.readFileSync('src/components/TopicEditorDialog.tsx', 'utf8');

const returnStart = code.indexOf('return (');
const newReturn = `return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-2 sm:p-4 md:p-6 animate-in fade-in zoom-in-95 duration-300">
      <div className="bg-[#f8fafc] w-full max-w-[90rem] h-full max-h-[95vh] rounded-[2rem] sm:rounded-[2.5rem] flex flex-col shadow-2xl overflow-hidden ring-1 ring-slate-900/5 relative">
        
        {/* Sticky Header */}
        <div className="flex-shrink-0 px-6 py-4 md:px-8 md:py-6 bg-white/90 backdrop-blur-2xl border-b border-slate-200/50 flex items-center justify-between z-50">
            <div>
               <div className="flex items-center gap-2 mb-1.5">
                  <span className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-widest flex items-center gap-1.5">
                      <Target size={12} /> Tema {topic.number}
                  </span>
                  {daysUntilNextReview <= 0 && progress?.firstStudyDate && (
                    <span className="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-widest flex items-center gap-1.5">
                        <AlertTriangle size={12} /> Repaso Pendiente
                    </span>
                  )}
               </div>
               <h2 className="text-xl md:text-3xl font-black font-serif text-slate-900 tracking-tight line-clamp-1">
                  {customTitle || topic.title}
               </h2>
            </div>
            <button type="button" 
               onClick={onClose}
               className="p-3 bg-slate-100/80 hover:bg-slate-200 text-slate-500 hover:text-slate-700 rounded-full transition-colors flex-shrink-0"
            >
               <X size={20} />
            </button>
        </div>

        {/* Scrollable Dashboard Body */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 no-scrollbar relative">
           
           <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 max-w-[90rem] mx-auto">
              
              {/* LEFT COLUMN: Data Input (Log Session & Settings) - Col Span 4 */}
              <div className="col-span-1 xl:col-span-4 flex flex-col gap-6">
                 
                 {/* Registro de Sesión (Log Form) */}
                 <div className="bg-white rounded-3xl p-6 shadow-sm ring-1 ring-slate-900/5">
                     <h3 className="text-lg font-black text-slate-900 mb-6 flex items-center gap-2">
                        <PlusCircle size={20} className="text-indigo-500"/>
                        Registrar Sesión
                     </h3>
                     
                     <div className="space-y-5">
                         <div>
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">
                                Tipo de Sesión
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                {(["estudio_inicial", "repaso", "refresco", "canto", "simulacro"] as const).map(t => (
                                    <button
                                      key={t}
                                      onClick={() => { setLogType(t); setHasManuallyChangedType(true); }}
                                      className={cn(
                                        "py-2 px-2 text-xs font-bold rounded-xl transition-all border",
                                        logType === t 
                                          ? "bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm"
                                          : "bg-slate-50 border-transparent text-slate-500 hover:bg-slate-100"
                                      )}
                                    >
                                      {t.replace("_", " ").toUpperCase()}
                                    </button>
                                ))}
                            </div>
                         </div>
                         
                         <div className="grid grid-cols-2 gap-4">
                             <div>
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Fecha</label>
                                <input type="date" value={logDate} onChange={e => setLogDate(e.target.value)} className="w-full bg-slate-50 border-none ring-1 ring-slate-900/5 text-slate-700 text-sm font-bold rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-indigo-500 outline-none" />
                             </div>
                             <div>
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Duración</label>
                                <div className="flex gap-1">
                                    <input type="number" placeholder="h" value={logDurationHours} onChange={e => setLogDurationHours(e.target.value)} className="w-full bg-slate-50 border-none ring-1 ring-slate-900/5 text-slate-700 text-sm font-bold rounded-xl px-2 py-2.5 text-center focus:ring-2 focus:ring-indigo-500 outline-none" />
                                    <input type="number" placeholder="m" value={logDurationMinutes} onChange={e => setLogDurationMinutes(e.target.value)} className="w-full bg-slate-50 border-none ring-1 ring-slate-900/5 text-slate-700 text-sm font-bold rounded-xl px-2 py-2.5 text-center focus:ring-2 focus:ring-indigo-500 outline-none" />
                                    {logType === 'canto' && (
                                        <input type="number" placeholder="s" value={logDurationSeconds} onChange={e => setLogDurationSeconds(e.target.value)} className="w-full bg-slate-50 border-none ring-1 ring-slate-900/5 text-slate-700 text-sm font-bold rounded-xl px-2 py-2.5 text-center focus:ring-2 focus:ring-indigo-500 outline-none" />
                                    )}
                                </div>
                             </div>
                         </div>

                         {(logType === 'estudio_inicial' || logType === 'repaso' || logType === 'canto') && (
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center justify-between">
                                    Dificultad Percibida
                                </label>
                                <div className="flex gap-1">
                                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((d) => {
                                        const isActive = logDifficulty === d;
                                        const colorClass = d <= 3 ? "hover:bg-emerald-50 hover:text-emerald-600" : d <= 7 ? "hover:bg-amber-50 hover:text-amber-600" : "hover:bg-rose-50 hover:text-rose-600";
                                        const activeClass = d <= 3 ? "bg-emerald-500 text-white" : d <= 7 ? "bg-amber-500 text-white" : "bg-rose-500 text-white";
                                        return (
                                          <button type="button" key={d} onClick={() => setLogDifficulty(isActive ? "" : d)} className={cn("flex-1 py-1.5 rounded-lg font-bold text-xs transition-colors", isActive ? activeClass : "bg-slate-50 text-slate-400 ring-1 ring-slate-900/5 " + colorClass)}>
                                            {d}
                                          </button>
                                        );
                                    })}
                                </div>
                            </div>
                         )}

                         {(logType === 'canto' || logType === 'simulacro') && (
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center justify-between">
                                    Calificación (Nota)
                                </label>
                                <div className="flex gap-1">
                                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((d) => {
                                        const isActive = logCantoGrade === d;
                                        return (
                                          <button type="button" key={d} onClick={() => setLogCantoGrade(isActive ? "" : d)} className={cn("flex-1 py-1.5 rounded-lg font-bold text-xs transition-colors", isActive ? "bg-indigo-500 text-white" : "bg-slate-50 text-slate-400 ring-1 ring-slate-900/5 hover:bg-indigo-50")}>
                                            {d}
                                          </button>
                                        );
                                    })}
                                </div>
                            </div>
                         )}

                         <div className="relative">
                            <textarea value={logNotes} onChange={(e) => setLogNotes(e.target.value)} placeholder="Anotaciones o detalles de la sesión..." className="w-full bg-slate-50 ring-1 ring-slate-900/5 text-slate-800 text-sm font-medium rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 outline-none transition-all min-h-[80px] resize-y placeholder:text-slate-400" />
                         </div>

                         {logType === 'canto' && (
                             <div className="relative">
                                <textarea value={logMistakes} onChange={(e) => setLogMistakes(e.target.value)} placeholder="¿Qué fallaste? (Errores críticos)..." className="w-full bg-rose-50/50 ring-1 ring-rose-900/10 text-slate-800 text-sm font-medium rounded-xl p-3 focus:ring-2 focus:ring-rose-500 outline-none transition-all min-h-[60px] resize-y placeholder:text-rose-400/60" />
                             </div>
                         )}

                         <button type="button" 
                             onClick={addSession}
                             disabled={isSavingSession || saveSuccess}
                             className={cn(
                               "w-full text-white font-extrabold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 transform transition-all active:scale-95",
                               saveSuccess ? "bg-emerald-500" : "bg-slate-900 hover:bg-black shadow-md shadow-slate-900/20",
                               (isSavingSession || saveSuccess) && "pointer-events-none"
                             )}
                         >
                             {isSavingSession ? <><Loader2 size={18} className="animate-spin" /> Guardando...</> : saveSuccess ? <><Check size={18} /> Registrado</> : <><Plus size={18} /> Guardar Sesión</>}
                         </button>
                     </div>
                 </div>

                 {/* Detalles del Tema */}
                 <div className="bg-white rounded-3xl p-6 shadow-sm ring-1 ring-slate-900/5">
                    <h3 className="text-lg font-black text-slate-900 mb-5 flex items-center gap-2">
                        <BookOpen size={20} className="text-indigo-500"/>
                        Detalles del Tema
                    </h3>
                    
                    <div className="space-y-4">
                        <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Título</label>
                            <input type="text" value={customTitle} onChange={(e) => setCustomTitle(e.target.value)} className="w-full text-sm font-bold text-slate-800 bg-slate-50 ring-1 ring-slate-900/5 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Páginas</label>
                                <input type="number" step="0.5" value={pages} onChange={(e) => setPages(e.target.value)} className="w-full text-sm font-bold text-slate-800 bg-slate-50 ring-1 ring-slate-900/5 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500" />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Palabras (aprox)</label>
                                <input type="number" value={numeroPalabras} onChange={(e) => setNumeroPalabras(e.target.value)} className="w-full text-sm font-bold text-slate-800 bg-slate-50 ring-1 ring-slate-900/5 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500" />
                            </div>
                        </div>
                        <button type="button" onClick={() => updateTopicProgress(topic.id, { customTitle, pages: parseFloat(String(pages).replace(",", ".")) || 0, numeroPalabras: parseInt(numeroPalabras) || undefined })} className="w-full py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-xl text-sm transition-colors mt-2">
                            Actualizar Detalles
                        </button>
                    </div>
                 </div>

              </div>

              {/* RIGHT COLUMN: Dashboard & History - Col Span 8 */}
              <div className="col-span-1 xl:col-span-8 flex flex-col gap-6">
                 
                 {/* KPIs / Metrics Cards */}
                 <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                     <div className="bg-white rounded-3xl p-5 shadow-sm ring-1 ring-slate-900/5 flex flex-col">
                         <div className="flex items-center gap-2 mb-3">
                             <div className="bg-indigo-100 text-indigo-600 p-2 rounded-xl"><Clock size={16}/></div>
                         </div>
                         <h4 className="text-2xl font-black text-slate-900 tracking-tight">{totalTimeStr || "0m"}</h4>
                         <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-1">Tiempo Total</p>
                     </div>
                     <div className="bg-white rounded-3xl p-5 shadow-sm ring-1 ring-slate-900/5 flex flex-col">
                         <div className="flex items-center gap-2 mb-3">
                             <div className="bg-emerald-100 text-emerald-600 p-2 rounded-xl"><BookOpen size={16}/></div>
                         </div>
                         <h4 className="text-2xl font-black text-slate-900 tracking-tight">{totalRepasos}</h4>
                         <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-1">Repasos</p>
                     </div>
                     <div className="bg-white rounded-3xl p-5 shadow-sm ring-1 ring-slate-900/5 flex flex-col">
                         <div className="flex items-center gap-2 mb-3">
                             <div className="bg-amber-100 text-amber-600 p-2 rounded-xl"><Mic size={16}/></div>
                         </div>
                         <h4 className="text-2xl font-black text-slate-900 tracking-tight">{totalCantos}</h4>
                         <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-1">Cantos</p>
                     </div>
                     <div className="bg-white rounded-3xl p-5 shadow-sm ring-1 ring-slate-900/5 flex flex-col">
                         <div className="flex items-center gap-2 mb-3">
                             <div className="bg-rose-100 text-rose-600 p-2 rounded-xl"><Target size={16}/></div>
                         </div>
                         <h4 className="text-2xl font-black text-slate-900 tracking-tight">{bestCantoStr}</h4>
                         <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-1">Mejor Nota</p>
                     </div>
                 </div>

                 {/* Charts */}
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Dificultad Evolución */}
                    <div className="bg-white rounded-3xl p-6 shadow-sm ring-1 ring-slate-900/5 flex flex-col min-h-[250px]">
                        <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                            <TrendingUp size={16} className="text-indigo-500" /> Dificultad Percibida
                        </h3>
                        <div className="flex-1 w-full relative">
                            {diffChartData.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={diffChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorDiff" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <XAxis dataKey="index" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 600 }} dy={10} />
                                    <YAxis width={30} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 600 }} domain={[0, 10]} />
                                    <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e2e8f0" strokeOpacity={0.6} />
                                    <Tooltip 
                                        formatter={(value: any) => [\`\${value}/10\`, 'Dificultad']}
                                        cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '4 4' }}
                                        contentStyle={{ borderRadius: '12px', border: '1px solid rgba(226, 232, 240, 0.8)', boxShadow: '0 10px 40px -10px rgba(0, 0, 0, 0.08)', backgroundColor: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(8px)' }}
                                    />
                                    <Area type="monotone" dataKey="dificultad" stroke="#4f46e5" strokeWidth={3} fillOpacity={1} fill="url(#colorDiff)" activeDot={{ r: 6, fill: '#4f46e5', stroke: '#fff', strokeWidth: 2 }} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
                                   <TrendingUp size={24} className="mb-2 opacity-30" />
                                   <p className="text-xs font-medium">Sin datos.</p>
                                </div>
                            )}
                        </div>
                    </div>
                    
                    {/* Cantos Evolución */}
                    <div className="bg-white rounded-3xl p-6 shadow-sm ring-1 ring-slate-900/5 flex flex-col min-h-[250px]">
                        <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                            <BarChart2 size={16} className="text-amber-500" /> Cantos y Simulacros
                        </h3>
                        <div className="flex-1 w-full relative">
                            {cantosChartData.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={cantosChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <XAxis dataKey="index" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 600 }} dy={10} />
                                    <YAxis yAxisId="left" width={30} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 600 }} />
                                    <YAxis yAxisId="right" orientation="right" width={30} domain={[0, 10]} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 600 }} />
                                    <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e2e8f0" strokeOpacity={0.6} />
                                    <Tooltip 
                                        cursor={{fill: 'rgba(241, 245, 249, 0.5)'}}
                                        contentStyle={{ borderRadius: '12px', border: '1px solid rgba(226, 232, 240, 0.8)', boxShadow: '0 10px 40px -10px rgba(0, 0, 0, 0.08)', backgroundColor: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(8px)' }}
                                        formatter={(value: any, name: any, props: any) => {
                                        if (name === "duracion") return [\`\${value} min\`, 'Tiempo'];
                                        if (name === "nota") return [\`\${value}/10\`, 'Nota'];
                                        return [value, name];
                                        }}
                                    />
                                    <Bar yAxisId="left" dataKey="duracion" fill="#f59e0b" radius={[6, 6, 0, 0]} barSize={24} />
                                    <Line yAxisId="right" type="monotone" dataKey="nota" stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: '#10b981', stroke: '#fff', strokeWidth: 2 }} activeDot={{r: 6}} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
                                   <Mic size={24} className="mb-2 opacity-30" />
                                   <p className="text-xs font-medium">Sin datos.</p>
                                </div>
                            )}
                        </div>
                    </div>
                 </div>

                 {/* History Timeline */}
                 <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm ring-1 ring-slate-900/5">
                     <h3 className="text-lg font-black text-slate-900 mb-6 flex items-center gap-2">
                         <History size={20} className="text-slate-500" />
                         Historial de Actividad
                     </h3>
                     
                     <div className="space-y-4">
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
                                                        <span>{session.duration} min</span>
                                                        {session.difficulty && (
                                                            <>
                                                              <span>•</span>
                                                              <span>Dif. {session.difficulty}/10</span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button onClick={() => setSessionToDelete(session.id)} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-colors">
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                        
                                        {/* Delete Confirmation Overlay inside item */}
                                        <AnimatePresence>
                                            {sessionToDelete === session.id && (
                                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-white/90 backdrop-blur-sm rounded-2xl border border-rose-100 flex items-center justify-between px-6 z-10">
                                                    <span className="text-sm font-bold text-slate-700">¿Eliminar sesión?</span>
                                                    <div className="flex items-center gap-2">
                                                        <button onClick={() => setSessionToDelete(null)} className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-lg transition-colors">Cancelar</button>
                                                        <button onClick={() => deleteSessionHandler(session.id)} className="px-3 py-1.5 text-xs font-bold text-white bg-rose-500 hover:bg-rose-600 rounded-lg transition-colors shadow-sm">Eliminar</button>
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                );
                            })
                        )}
                     </div>
                 </div>

              </div>
           </div>
        </div>
      </div>
    </div>
  );
}
`;

code = code.substring(0, returnStart) + newReturn;

fs.writeFileSync('src/components/TopicEditorDialog.tsx', code);
