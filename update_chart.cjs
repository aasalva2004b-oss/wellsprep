const fs = require('fs');
let content = fs.readFileSync('src/components/DashboardView.tsx', 'utf8');

content = content.replace(
    /if \(s\.type === 'repaso'\) \{/g,
    "if (s.type === 'refresco') {"
);

content = content.replace(
    /Historial de Repaso/g,
    "Historial de Refrescos"
);

content = content.replace(
    /Volumen de repaso últimos 14 días/g,
    "Volumen de refrescos últimos 14 días"
);

content = content.replace(
    /name="Temas repasados"/g,
    'name="Temas refrescados"'
);

fs.writeFileSync('src/components/DashboardView.tsx', content);
