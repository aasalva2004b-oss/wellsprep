const fs = require('fs');
const file = fs.readFileSync('src/components/TopicEditorDialog.tsx', 'utf8');
const lines = file.split('\n');
const start = lines.findIndex(l => l.includes("const groupedSessions = useMemo"));
const end = lines.findIndex((l, i) => i > start && l.includes("}, [sessions]);"));
console.log(lines.slice(start, end + 1).join('\n'));
