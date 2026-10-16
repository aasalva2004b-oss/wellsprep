const fs = require('fs');
const file = fs.readFileSync('src/components/DashboardView.tsx', 'utf8');
const lines = file.split('\n');
const start = lines.findIndex(l => l.includes("const cantosData = useMemo"));
const end = lines.findIndex((l, i) => i > start && l.includes("}, [groupedSessions, topics]);"));
console.log(lines.slice(start, end + 1).join('\n'));
