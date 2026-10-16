const fs = require('fs');
let file = fs.readFileSync('src/components/DashboardView.tsx', 'utf8');

file = file.replace(
    /onClick=\{\(\) => onSelectTopic\?\.\(item\.topic\.id\)\}/g,
    ''
);

fs.writeFileSync('src/components/DashboardView.tsx', file);
