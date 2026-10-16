const fs = require('fs');

let code = fs.readFileSync('src/components/TopicEditorDialog.tsx', 'utf8');

// Replace the session type buttons
const oldSessionType = `<div className="grid grid-cols-2 gap-2">
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
                            </div>`;

const newSessionType = `<div className="bg-slate-100/80 p-1.5 rounded-[1.25rem] flex flex-wrap gap-1 shadow-inner">
                                {(["estudio_inicial", "repaso", "refresco", "canto", "simulacro"] as const).map(t => (
                                    <button
                                      key={t}
                                      onClick={() => { setLogType(t); setHasManuallyChangedType(true); }}
                                      className={cn(
                                        "flex-1 min-w-[70px] py-2 px-2 text-[10px] md:text-xs font-bold rounded-xl transition-all",
                                        logType === t 
                                          ? "bg-white text-indigo-700 shadow-sm ring-1 ring-slate-900/5"
                                          : "bg-transparent text-slate-500 hover:text-slate-700"
                                      )}
                                    >
                                      {t.replace("_", " ").toUpperCase()}
                                    </button>
                                ))}
                            </div>`;

code = code.replace(oldSessionType, newSessionType);

// Replace the difficulty picker
const oldDifficulty = `<div className="flex gap-1">
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
                                </div>`;

const newDifficulty = `<div className="bg-slate-100/80 p-1 rounded-2xl flex gap-0.5 shadow-inner">
                                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((d) => {
                                        const isActive = logDifficulty === d;
                                        let activeClass = "bg-white text-slate-900 shadow-sm ring-1 ring-slate-900/5";
                                        if (isActive) {
                                            if (d <= 3) activeClass = "bg-emerald-500 text-white shadow-sm";
                                            else if (d <= 7) activeClass = "bg-amber-500 text-white shadow-sm";
                                            else activeClass = "bg-rose-500 text-white shadow-sm";
                                        }
                                        return (
                                          <button type="button" key={d} onClick={() => setLogDifficulty(isActive ? "" : d)} className={cn("flex-1 py-1.5 rounded-xl font-bold text-xs transition-all", isActive ? activeClass : "bg-transparent text-slate-400 hover:text-slate-600")}>
                                            {d}
                                          </button>
                                        );
                                    })}
                                </div>`;
                                
code = code.replace(oldDifficulty, newDifficulty);

// Refine inputs
code = code.replace(/className="w-full bg-slate-50 border-none ring-1 ring-slate-900\/5 text-slate-700 text-sm font-bold rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-indigo-500 outline-none"/g, 
'className="w-full bg-slate-100/50 border-none ring-1 ring-slate-900/5 text-slate-700 text-sm font-bold rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all outline-none"');

code = code.replace(/className="w-full bg-slate-50 border-none ring-1 ring-slate-900\/5 text-slate-700 text-sm font-bold rounded-xl px-2 py-2.5 text-center focus:ring-2 focus:ring-indigo-500 outline-none"/g, 
'className="w-full bg-slate-100/50 border-none ring-1 ring-slate-900/5 text-slate-700 text-sm font-bold rounded-xl px-2 py-3 text-center focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all outline-none"');


fs.writeFileSync('src/components/TopicEditorDialog.tsx', code);
