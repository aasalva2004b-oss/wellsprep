const fs = require('fs');
let file = fs.readFileSync('src/components/DashboardView.tsx', 'utf8');

const regex = /const cantosData = useMemo\(\(\) => \{\s*const cantos = groupedSessions\s*\.filter\(s => s\.type === 'canto' \|\| s\.type === 'simulacro'\)\s*\.slice\(-20\);/;

console.log(regex.test(file));
