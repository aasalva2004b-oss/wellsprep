const fs = require('fs');
let file = fs.readFileSync('src/components/TopicEditorDialog.tsx', 'utf8');

file = file.replace(
    /Trash2, /g,
    "Trash2, Layers, "
);

fs.writeFileSync('src/components/TopicEditorDialog.tsx', file);
