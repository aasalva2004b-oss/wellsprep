const fs = require('fs');

let code = fs.readFileSync('src/components/DashboardView.tsx', 'utf8');

// Find the start of the analytics section
const startSearch = '{/* THE CORE ANALYTICS: 2 COLUMNS */}';
const startIndex = code.indexOf(startSearch);
if (startIndex === -1) {
    console.error("Could not find core analytics start.");
    process.exit(1);
}

// We need to replace everything from startSearch down to the end of the DashboardView rendering.
// Let's just do a big regex or string extraction.
const fileEndIndex = code.indexOf('    );', startIndex);
if (fileEndIndex === -1) {
    console.error("Could not find end of render.");
    process.exit(1);
}

// We will recreate the layout. I'll need to grab the inner contents of each chart.

// 1. Burn-up inner
const burnUpRegex = /<h3 className="text-lg font-black text-slate-900 flex items-center gap-2">[\s\S]*?(?=<\!-- Forecast Chart -->|{\/\* Forecast Chart \*\/})/i;
const burnUpMatch = code.match(/{\/\* 1\. Velocity & Trajectory \(Burn-up\) \*\/}[\s\S]*?(?={\/\* Forecast Chart \*\/)/);
const burnUpContent = burnUpMatch ? burnUpMatch[0].replace(/<div className="bg-white\/80[^>]+>/, '').replace(/{\/\* 1\. Velocity & Trajectory \(Burn-up\) \*\/}/, '').trim().slice(0, -6) : ''; // slice to remove closing div

// 2. Forecast inner
const forecastMatch = code.match(/{\/\* Forecast Chart \*\/}[\s\S]*?(?={\/\* 2\. Consistency Heatmap \*\/)/);
const forecastContent = forecastMatch ? forecastMatch[0].replace(/<div className="bg-white\/80[^>]+>/, '').replace(/{\/\* Forecast Chart \*\/}/, '').trim().slice(0, -6) : '';

// 3. Heatmap inner
const heatmapMatch = code.match(/{\/\* 2\. Consistency Heatmap \*\/}[\s\S]*?(?=<\/div>\s*<\/div>\s*{\/\* RIGHT: Action Queue & Radar \*\/})/);
const heatmapContent = heatmapMatch ? heatmapMatch[0].replace(/<div className="bg-white\/80[^>]+>/, '').replace(/{\/\* 2\. Consistency Heatmap \*\/}/, '').trim().slice(0, -6) : '';

// 4. Action Queue inner
const queueMatch = code.match(/{\/\* Smart Action Queue \*\/}[\s\S]*?(?={\/\* Balance de Dominio \(Radar\) \*\/})/);
const queueContent = queueMatch ? queueMatch[0].replace(/<div className="bg-white\/80[^>]+>/, '').replace(/{\/\* Smart Action Queue \*\/}/, '').trim().slice(0, -6) : '';

// 5. Radar inner
const radarMatch = code.match(/{\/\* Balance de Dominio \(Radar\) \*\/}[\s\S]*?(?=<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*\);)/);
const radarContent = radarMatch ? radarMatch[0].replace(/<div className="bg-white\/80[^>]+>/, '').replace(/{\/\* Balance de Dominio \(Radar\) \*\/}/, '').trim().slice(0, -6) : '';


// Assemble the new Bento Grid
const newBento = `{/* THE CORE ANALYTICS: BENTO GRID */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 auto-rows-auto gap-4 lg:gap-6 mt-4 lg:mt-6 pb-8">
                    
                    {/* 1. Velocity & Trajectory (Burn-up) - Spans 2 cols */}
                    <div className="md:col-span-2 xl:col-span-2 bg-white/70 backdrop-blur-2xl p-6 lg:p-8 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-slate-900/5 flex flex-col relative overflow-hidden group hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-300">
                        <div className="absolute -left-10 -bottom-10 w-40 h-40 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none group-hover:scale-150 transition-transform duration-700"></div>
                        ${burnUpContent}
                    </div>

                    {/* 2. Smart Action Queue - Spans 1 col, 2 rows on XL */}
                    <div className="md:col-span-1 xl:col-span-1 xl:row-span-2 bg-white/70 backdrop-blur-2xl p-6 lg:p-8 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-slate-900/5 flex flex-col relative overflow-hidden group hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-300">
                        ${queueContent.replace('<div className="absolute -right-6 -top-6 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl pointer-events-none group-hover:scale-150 transition-transform duration-700"></div>', '<div className="absolute -right-6 -top-6 w-40 h-40 bg-amber-500/10 rounded-full blur-3xl pointer-events-none group-hover:scale-150 transition-transform duration-700"></div>')}
                    </div>

                    {/* 3. Forecast Chart - 1 col */}
                    <div className="md:col-span-1 xl:col-span-1 bg-white/70 backdrop-blur-2xl p-6 lg:p-8 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-slate-900/5 flex flex-col relative overflow-hidden group hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-300">
                        ${forecastContent.replace('<div className="absolute -right-10 -top-10 w-40 h-40 bg-blue-50 rounded-full opacity-50 group-hover:scale-110 transition-transform duration-500 pointer-events-none"></div>', '<div className="absolute -left-10 -top-10 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl pointer-events-none group-hover:scale-150 transition-transform duration-700"></div>')}
                    </div>

                    {/* 4. Balance de Dominio (Radar) - 1 col */}
                    <div className="md:col-span-1 xl:col-span-1 bg-white/70 backdrop-blur-2xl p-6 lg:p-8 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-slate-900/5 flex flex-col relative overflow-hidden group hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-300">
                        ${radarContent}
                    </div>

                    {/* 5. Consistency Heatmap - Full width (3 cols) */}
                    <div className="md:col-span-2 xl:col-span-3 bg-white/70 backdrop-blur-2xl p-6 lg:p-8 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-slate-900/5 flex flex-col relative overflow-hidden group hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-300">
                        <div className="absolute -right-20 -bottom-20 w-60 h-60 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none group-hover:scale-125 transition-transform duration-700"></div>
                        ${heatmapContent}
                    </div>

                </div>
`;

// Now replace from startSearch to fileEndIndex + 6
const newCode = code.substring(0, startIndex) + newBento + code.substring(fileEndIndex);

fs.writeFileSync('src/components/DashboardView.tsx', newCode);
console.log("Applied Bento Layout to Dashboard");

