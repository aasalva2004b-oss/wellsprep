const fs = require('fs');
let file = fs.readFileSync('src/components/DashboardView.tsx', 'utf8');

file = file.replace(
    /item\.urgency === 3 \? "text-rose-500" : item\.urgency === 2 \? "text-amber-500" : "text-emerald-500"/g,
    'item.urgency === 3 ? "text-rose-500" : item.urgency === 2 ? "text-amber-500" : "text-indigo-500"'
);

file = file.replace(
    /item\.urgency === 3 \? <AlertOctagon size=\{12\}\/> : <Clock size=\{12\}\/>/g,
    'item.urgency === 3 ? <AlertOctagon size={12}/> : item.urgency === 2 ? <Flame size={12}/> : <Calendar size={12}/>'
);

file = file.replace(
    /Repasos priorizados por SRS/,
    "Planificación semanal por SRS"
);

fs.writeFileSync('src/components/DashboardView.tsx', file);
