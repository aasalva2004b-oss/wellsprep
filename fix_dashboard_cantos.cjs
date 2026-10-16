const fs = require('fs');
let file = fs.readFileSync('src/components/DashboardView.tsx', 'utf8');

file = file.replace(
    /\.slice\(-20\);\s*\/\/\s*Últimos 20 cantos/g,
    ".slice(0, 20).reverse(); // Últimos 20 cantos"
);

file = file.replace(
    /const recentCantos = allSessions\.filter\(s => \(s\.type === 'canto' \|\| s\.type === 'simulacro'\) && s\.grade\)\.slice\(-10\);/g,
    "const recentCantos = allSessions.filter(s => (s.type === 'canto' || s.type === 'simulacro') && s.grade).slice(0, 10);"
);

fs.writeFileSync('src/components/DashboardView.tsx', file);
