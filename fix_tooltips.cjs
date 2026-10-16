const fs = require('fs');
const file = 'src/components/DashboardView.tsx';
let content = fs.readFileSync(file, 'utf8');

// replace inner group with named group
content = content.replace(
    /className=\{cn\("w-3\.5 h-3\.5 rounded-sm transition-all group relative/g,
    'className={cn("w-3.5 h-3.5 rounded-sm transition-all group/day relative'
);

// replace group-hover with group-hover/day
content = content.replace(
    /opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50/g,
    'opacity-0 group-hover/day:opacity-100 pointer-events-none whitespace-nowrap z-50'
);

fs.writeFileSync(file, content);
