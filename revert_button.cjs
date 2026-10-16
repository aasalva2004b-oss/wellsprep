const fs = require('fs');
let settings = fs.readFileSync('src/components/SettingsDialog.tsx', 'utf8');

settings = settings.replace(/<div className="space-y-3 mt-4">/, `<div className="space-y-3 mt-4">
                 <button
                     onClick={migrateMercantilToConstitucional}
                    className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-rose-50 border border-rose-200 rounded-xl transition-colors group"
                 >
                     <div className="text-left">
                         <div className="text-sm font-bold text-slate-700 group-hover:text-rose-700 flex items-center gap-2">
                             <AlertTriangle size={16} className="text-rose-500" />
                             Migrar Mercantil → Constitucional
                         </div>
                         <div className="text-[10px] text-slate-500 mt-0.5 pr-4">Mueve todo el progreso y cantos registrados por error.</div>
                     </div>
                 </button>`);

fs.writeFileSync('src/components/SettingsDialog.tsx', settings);
