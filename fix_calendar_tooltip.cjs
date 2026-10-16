const fs = require('fs');
let file = fs.readFileSync('src/components/DashboardView.tsx', 'utf8');

file = file.replace(
    /title=\{`\$\{topic\?\.number \|\| '\?'\}: \$\{typeMap\[s\.type as keyof typeof typeMap\] \|\| s\.type\} \(\$\{s\.duration\}m\)`\}/,
    "title={`Tema ${topic?.number || '?'}: ${typeMap[s.type as keyof typeof typeMap] || s.type} | ${s.duration} min${s.difficulty ? ` | Dif: ${s.difficulty}/10` : ''}`}"
);

fs.writeFileSync('src/components/DashboardView.tsx', file);
