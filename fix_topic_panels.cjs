const fs = require('fs');
let code = fs.readFileSync('src/components/TopicEditorDialog.tsx', 'utf8');

// Replace standard white panels with frosted glass panels
code = code.replace(
    /className="bg-white rounded-3xl p-6 shadow-sm ring-1 ring-slate-900\/5/g,
    'className="bg-white/80 backdrop-blur-xl rounded-[2rem] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-slate-900/5'
);

code = code.replace(
    /className="bg-white rounded-3xl p-5 shadow-sm ring-1 ring-slate-900\/5/g,
    'className="bg-white/80 backdrop-blur-xl rounded-[2rem] p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-slate-900/5'
);

code = code.replace(
    /className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm ring-1 ring-slate-900\/5/g,
    'className="bg-white/80 backdrop-blur-xl rounded-[2rem] p-6 sm:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-slate-900/5'
);


fs.writeFileSync('src/components/TopicEditorDialog.tsx', code);
