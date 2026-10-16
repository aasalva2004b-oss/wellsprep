const fs = require('fs');

let code = fs.readFileSync('src/components/TopicEditorDialog.tsx', 'utf8');

code = code.replace(
    'bg-[#f8fafc] w-full max-w-[90rem] h-full max-h-[95vh] rounded-[2rem] sm:rounded-[2.5rem] flex flex-col shadow-2xl overflow-hidden ring-1 ring-slate-900/5 relative',
    'bg-[#F5F5F7] w-full max-w-[90rem] h-full max-h-[95vh] rounded-[2rem] sm:rounded-[2.5rem] flex flex-col shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] overflow-hidden ring-1 ring-black/5 relative'
);

code = code.replace(
    'bg-slate-900/40 backdrop-blur-md',
    'bg-slate-900/40 backdrop-blur-xl'
);

// Close button refine
code = code.replace(
    '<button onClick={onClose} className="p-2.5 bg-slate-100 text-slate-500 hover:bg-rose-50 hover:text-rose-500 rounded-full transition-colors">',
    '<button onClick={onClose} className="p-2.5 bg-slate-100/80 text-slate-500 hover:bg-slate-200 hover:text-slate-900 rounded-full transition-colors ring-1 ring-slate-900/5">'
);

fs.writeFileSync('src/components/TopicEditorDialog.tsx', code);
