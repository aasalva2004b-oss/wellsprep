const fs = require('fs');
let code = fs.readFileSync('src/components/TopicEditorDialog.tsx', 'utf8');

code = code.replace(
    '<span>{session.duration} min</span>',
    '<span>{session.durationMinutes} min</span>'
);

fs.writeFileSync('src/components/TopicEditorDialog.tsx', code);
