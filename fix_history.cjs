const fs = require('fs');

let code = fs.readFileSync('src/components/DashboardView.tsx', 'utf8');

// Fix the 'history' error by asserting any
code = code.replace(
    'if (prog.history) {',
    'if ((prog as any).history) {'
);
code = code.replace(
    'sessions.push(...prog.history.map(h => ({ ...h, topicId })));',
    'sessions.push(...(prog as any).history.map((h: any) => ({ ...h, topicId })));'
);

fs.writeFileSync('src/components/DashboardView.tsx', code);

// For TopicEditorDialog, let's fix the trailing divs properly
let dialogCode = fs.readFileSync('src/components/TopicEditorDialog.tsx', 'utf8');
// Keep replacing \s*<\/div> at the end until we only have the exact amount needed. Actually, let's rewrite the render function again, it's safer.
