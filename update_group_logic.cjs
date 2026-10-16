const fs = require('fs');
let file = fs.readFileSync('src/components/TopicEditorDialog.tsx', 'utf8');

file = file.replace(
    /originalIds: \[s\.id\],/g,
    "originalIds: [s.id],\n          subSessions: [s],"
);

file = file.replace(
    /currentGroup\.originalIds\.push\(s\.id\);/g,
    "currentGroup.originalIds.push(s.id);\n        currentGroup.subSessions.push(s);"
);

fs.writeFileSync('src/components/TopicEditorDialog.tsx', file);
