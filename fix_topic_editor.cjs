const fs = require('fs');
let file = fs.readFileSync('src/components/TopicEditorDialog.tsx', 'utf8');

file = file.replace(
    /const chronological = \[\.\.\.sessions\]\.reverse\(\);/,
    `const uniqueSessions = [];
    const seen = new Set();
    [...sessions].forEach(s => {
      const key = \`\${s.topicId}-\${s.date}-\${s.type}-\${s.duration || s.durationMinutes}-\${s.cantoGrade || s.grade || 0}\`;
      if (!seen.has(key)) {
          seen.add(key);
          uniqueSessions.push(s);
      }
    });
    const chronological = uniqueSessions.reverse();`
);

fs.writeFileSync('src/components/TopicEditorDialog.tsx', file);
