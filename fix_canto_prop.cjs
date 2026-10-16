const fs = require('fs');

let code = fs.readFileSync('src/components/DashboardView.tsx', 'utf8');

// The original code used duration, not durationMinutes, let's fix it inside DashboardView.tsx as well
code = code.replace(
    'duracion: h.duration || 0,',
    'duracion: h.durationMinutes || h.duration || 0,'
);

fs.writeFileSync('src/components/DashboardView.tsx', code);
