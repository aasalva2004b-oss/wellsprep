const fs = require('fs');
let file = fs.readFileSync('src/components/DashboardView.tsx', 'utf8');

file = file.replace(
    /if \(diffDays <= 1\) \{/,
    "if (diffDays <= 7) {"
);

file = file.replace(
    /let reasonStr = "Toca mañana";\n                if \(diffDays === 0\) reasonStr = "Toca hoy";\n                else if \(diffDays < 0\) reasonStr = \`Atrasado \$\{Math.abs\(diffDays\)\} \$\{Math.abs\(diffDays\) === 1 \? 'día' : 'días'\}\`;/,
    `let reasonStr = "En " + diffDays + " días";
                if (diffDays === 1) reasonStr = "Mañana";
                else if (diffDays === 0) reasonStr = "Hoy";
                else if (diffDays < 0) reasonStr = \`Atrasado \${Math.abs(diffDays)} \${Math.abs(diffDays) === 1 ? 'día' : 'días'}\`;`
);

file = file.replace(
    /urgency: diffDays < -3 \? 3 : diffDays <= 0 \? 2 : 1/,
    "urgency: diffDays < 0 ? 3 : diffDays === 0 ? 2 : 1"
);

fs.writeFileSync('src/components/DashboardView.tsx', file);
