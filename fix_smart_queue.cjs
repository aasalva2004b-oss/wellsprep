const fs = require('fs');
let file = fs.readFileSync('src/components/DashboardView.tsx', 'utf8');

file = file.replace(
    /const diffDays = \(nextDate - today\) \/ \(1000 \* 3600 \* 24\);\s*if \(diffDays <= 1\) \{\s*queue\.push\(\{\s*topic: t,\s*reason: diffDays < -3 \? "Olvido Crítico \(Atrasado\)" : "Repaso Programado",\s*urgency: diffDays < -3 \? 3 : diffDays <= 0 \? 2 : 1,\s*nextDate: nextDateStr\s*\}\);\s*\}/,
    `const diffDays = Math.round((nextDate - today) / (1000 * 3600 * 24));
            
            if (diffDays <= 1) {
                let reasonStr = "Toca mañana";
                if (diffDays === 0) reasonStr = "Toca hoy";
                else if (diffDays < 0) reasonStr = \`Atrasado \${Math.abs(diffDays)} \${Math.abs(diffDays) === 1 ? 'día' : 'días'}\`;
                
                queue.push({
                    topic: t,
                    reason: reasonStr,
                    urgency: diffDays < -3 ? 3 : diffDays <= 0 ? 2 : 1,
                    nextDate: nextDateStr
                });
            }`
);

fs.writeFileSync('src/components/DashboardView.tsx', file);
