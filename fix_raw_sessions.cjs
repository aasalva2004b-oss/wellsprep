const fs = require('fs');
let file = fs.readFileSync('src/components/DashboardView.tsx', 'utf8');

file = file.replace(
    /createdAt: s\.createdAt/g,
    "createdAt: s.createdAt,\n            completesVuelta: s.completesVuelta"
);

fs.writeFileSync('src/components/DashboardView.tsx', file);
