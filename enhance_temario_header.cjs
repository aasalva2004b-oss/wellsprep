const fs = require('fs');

let code = fs.readFileSync('src/components/TemarioView.tsx', 'utf8');

const oldChipsStart = code.indexOf('<div className="flex items-center gap-2 mt-3 overflow-x-auto no-scrollbar container-snap pb-1 -mx-4 px-4 md:mx-0 md:px-0">');
const oldChipsEnd = code.indexOf('</div>\n          </div>', oldChipsStart); // This might be tricky. Let's just use string replacement for the block.

if (oldChipsStart !== -1) {
    const sectionToReplace = code.substring(oldChipsStart, oldChipsEnd + 6);
    
    const newSection = `
            {/* Command Center Progress Widget */}
            <div className="mt-5 max-w-2xl hidden md:block">
               <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
                   <span>Progreso del Bloque</span>
                   <span className="text-indigo-600">{subjectStats.total > 0 ? Math.round((subjectStats.studied / subjectStats.total) * 100) : 0}%</span>
               </div>
               <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden flex ring-1 ring-slate-900/5 shadow-inner">
                   <div 
                       className="bg-indigo-500 h-full rounded-full shadow-[0_0_10px_rgba(99,102,241,0.5)] transition-all duration-1000 ease-out relative overflow-hidden" 
                       style={{ width: \`\${subjectStats.total > 0 ? (subjectStats.studied / subjectStats.total) * 100 : 0}%\` }}
                   >
                       <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.2)_50%,transparent_75%,transparent_100%)] bg-[length:20px_20px] animate-[shimmer_2s_linear_infinite]" />
                   </div>
               </div>
               <div className="flex items-center gap-4 mt-3">
                   <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 bg-slate-50 px-2 py-1 rounded-md ring-1 ring-slate-900/5">
                       <BookOpen size={12} className="text-slate-400" /> {subjectStats.total} Totales
                   </div>
                   <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md ring-1 ring-emerald-900/5">
                       <Brain size={12} className="text-emerald-500" /> {subjectStats.studied} Estudiados
                   </div>
                   <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded-md ring-1 ring-slate-900/5">
                       <Timer size={12} className="text-slate-400" /> {subjectStats.pending} Pendientes
                   </div>
               </div>
            </div>
            
            {/* Mobile Chips (Keep Simple) */}
            <div className="flex items-center gap-2 mt-3 overflow-x-auto no-scrollbar container-snap pb-1 -mx-4 px-4 md:hidden">
              <div className="flex items-center gap-1.5 bg-slate-100/80 text-slate-600 px-2 py-1 rounded-lg text-[10px] font-bold border border-slate-200/50 shrink-0">
                <BookOpen size={12} className="text-slate-400" />
                {subjectStats.total} Temas
              </div>
              <div className="flex items-center gap-1.5 bg-indigo-50 text-indigo-700 px-2 py-1 rounded-lg text-[10px] font-bold border border-indigo-200/50 shrink-0">
                <Brain size={12} className="text-indigo-500" />
                {subjectStats.studied} Estudiados
              </div>
              <div className="flex items-center gap-1.5 bg-slate-50 text-slate-500 px-2 py-1 rounded-lg text-[10px] font-bold border border-slate-200/50 shrink-0">
                <Timer size={12} className="text-slate-400" />
                {subjectStats.pending} Pendientes
              </div>
            </div>
    `;
    code = code.substring(0, oldChipsStart) + newSection + code.substring(oldChipsEnd + 6);
    fs.writeFileSync('src/components/TemarioView.tsx', code);
    console.log("Replaced Temario header successfully.");
} else {
    console.log("Could not find the target section to replace.");
}

