const fs = require('fs');

let code = fs.readFileSync('src/components/TopicEditorDialog.tsx', 'utf8');
code = code.replace(
    'duracion: h.duration || 0,',
    'duracion: h.durationMinutes || h.duration || 0,'
);

fs.writeFileSync('src/components/TopicEditorDialog.tsx', code);
