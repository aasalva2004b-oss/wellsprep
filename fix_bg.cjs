const fs = require('fs');

let codeApp = fs.readFileSync('src/App.tsx', 'utf8');
codeApp = codeApp.replace('bg-[#f4f7f9]', 'bg-[#F5F5F7]');
fs.writeFileSync('src/App.tsx', codeApp);

let codeTemario = fs.readFileSync('src/components/TemarioView.tsx', 'utf8');
codeTemario = codeTemario.replace('bg-slate-50', 'bg-transparent');
fs.writeFileSync('src/components/TemarioView.tsx', codeTemario);

