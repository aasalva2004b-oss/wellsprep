const fs = require('fs');
let file = fs.readFileSync('src/components/TopicEditorDialog.tsx', 'utf8');

const target = `                         {logType === 'canto' && (
                             <div className="relative">
                                <textarea value={logMistakes} onChange={(e) => setLogMistakes(e.target.value)} placeholder="¿Qué fallaste? (Errores críticos)..." className="w-full bg-rose-50/50 ring-1 ring-rose-900/10 text-slate-800 text-sm font-medium rounded-xl p-3 focus:ring-2 focus:ring-rose-500 outline-none transition-all min-h-[60px] resize-y placeholder:text-rose-400/60" />
                             </div>
                         )}

                         <button type="button"`;

const replacement = `                         {logType === 'canto' && (
                             <div className="relative">
                                <textarea value={logMistakes} onChange={(e) => setLogMistakes(e.target.value)} placeholder="¿Qué fallaste? (Errores críticos)..." className="w-full bg-rose-50/50 ring-1 ring-rose-900/10 text-slate-800 text-sm font-medium rounded-xl p-3 focus:ring-2 focus:ring-rose-500 outline-none transition-all min-h-[60px] resize-y placeholder:text-rose-400/60" />
                             </div>
                         )}

                         {(logType === 'estudio_inicial' || logType === 'repaso' || logType === 'refresco') && (
                             <label className="flex items-center gap-3 p-3 bg-slate-50 ring-1 ring-slate-900/5 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors">
                                 <div className="flex-1">
                                     <span className="block text-sm font-bold text-slate-800">Sesión Completa</span>
                                     <span className="block text-xs font-medium text-slate-500">Desmárcalo si vas a continuar estudiando este tema.</span>
                                 </div>
                                 <div className={cn("w-10 h-6 rounded-full flex items-center px-1 transition-colors", logCompletesVuelta ? "bg-indigo-500" : "bg-slate-300")}>
                                     <div className={cn("w-4 h-4 bg-white rounded-full transition-transform shadow-sm", logCompletesVuelta ? "translate-x-4" : "translate-x-0")} />
                                 </div>
                                 <input type="checkbox" className="hidden" checked={logCompletesVuelta} onChange={(e) => setLogCompletesVuelta(e.target.checked)} />
                             </label>
                         )}

                         <button type="button"`;

file = file.replace(target, replacement);
fs.writeFileSync('src/components/TopicEditorDialog.tsx', file);
