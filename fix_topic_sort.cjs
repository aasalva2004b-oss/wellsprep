const fs = require('fs');
let file = fs.readFileSync('src/components/TopicEditorDialog.tsx', 'utf8');

file = file.replace(
    /return b\.createdAt - a\.createdAt;/g,
    `const timeB = b.createdAt && typeof b.createdAt.toMillis === 'function' ? b.createdAt.toMillis() : (b.createdAt || 0);
        const timeA = a.createdAt && typeof a.createdAt.toMillis === 'function' ? a.createdAt.toMillis() : (a.createdAt || 0);
        return timeB - timeA;`
);

fs.writeFileSync('src/components/TopicEditorDialog.tsx', file);
