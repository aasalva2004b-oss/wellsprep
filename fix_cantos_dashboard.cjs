const fs = require('fs');
let file = fs.readFileSync('src/components/DashboardView.tsx', 'utf8');

file = file.replace(
    /const cantos = groupedSessions\s*\.filter\(s => s\.type === 'canto' \|\| s\.type === 'simulacro'\)\s*\.slice\(0, 20\)\.reverse\(\); \/\/ Últimos 20 cantos/g,
    "const cantos = groupedSessions\n            .filter(s => s.type === 'canto' || s.type === 'simulacro')\n            .slice(-20); // Últimos 20 cantos"
);

fs.writeFileSync('src/components/DashboardView.tsx', file);
