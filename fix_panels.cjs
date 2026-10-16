const fs = require('fs');
let code = fs.readFileSync('src/components/DashboardView.tsx', 'utf8');

// Replace standard white panels with frosted glass panels
code = code.replace(
    /className="bg-white p-6 lg:p-8 rounded-\[2rem\] shadow-sm border border-slate-100/g,
    'className="bg-white/80 backdrop-blur-xl p-6 lg:p-8 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-slate-900/5'
);

code = code.replace(
    /className="bg-white rounded-3xl p-5 lg:p-6 shadow-sm border border-slate-100/g,
    'className="bg-white/80 backdrop-blur-xl p-5 lg:p-6 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-slate-900/5'
);


fs.writeFileSync('src/components/DashboardView.tsx', code);
