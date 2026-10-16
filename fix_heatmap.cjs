const fs = require('fs');

let code = fs.readFileSync('src/components/DashboardView.tsx', 'utf8');

const badHeatmapStart = code.indexOf('{weeks.map((week, wIdx) => (');
const badHeatmapEnd = code.indexOf('</div>\n                        <div className="mt-4 flex items-center justify-end gap-2 text-[10px]');

if (badHeatmapStart !== -1 && badHeatmapEnd !== -1) {
    const fixedHeatmap = `
                                {Array.from({ length: 12 }).map((_, wIdx) => (
                                    <div key={wIdx} className="flex flex-col gap-1.5">
                                        {heatmapData.slice(wIdx * 7, (wIdx + 1) * 7).map((dayData, dIdx) => {
                                            const hasStudied = dayData.duration > 0;
                                            
                                            let intensityClass = "bg-slate-100 ring-1 ring-slate-900/5";
                                            if (hasStudied) {
                                                const duration = dayData.duration;
                                                if (duration > 120) intensityClass = "bg-emerald-700 shadow-sm ring-1 ring-emerald-900/10";
                                                else if (duration > 60) intensityClass = "bg-emerald-500 shadow-sm ring-1 ring-emerald-900/10";
                                                else if (duration > 30) intensityClass = "bg-emerald-400 shadow-sm ring-1 ring-emerald-900/10";
                                                else intensityClass = "bg-emerald-200 shadow-sm ring-1 ring-emerald-900/10";
                                            }
                                            
                                            return (
                                                <div 
                                                    key={dayData.date} 
                                                    className={cn("w-3.5 h-3.5 rounded-sm transition-all group relative cursor-help hover:ring-2 hover:ring-indigo-500 hover:ring-offset-1 z-10 hover:z-20", intensityClass)}
                                                >
                                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-900 text-white text-[10px] font-bold rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50">
                                                        {dayData.date}: {hasStudied ? dayData.duration + ' min' : 'Sin registro'}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ))}
                            `;
    
    code = code.substring(0, badHeatmapStart) + fixedHeatmap + code.substring(badHeatmapEnd);
    fs.writeFileSync('src/components/DashboardView.tsx', code);
    console.log("Fixed heatmap logic");
} else {
    console.log("Could not find bad heatmap code.");
}
