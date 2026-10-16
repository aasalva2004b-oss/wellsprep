const fs = require('fs');
let file = fs.readFileSync('src/components/DashboardView.tsx', 'utf8');

file = file.replace(
    /return recentSessions\.map\(s => \(\{\n\s*date: s\.date,\n\s*duration: s\.durationMinutes \|\| s\.duration \|\| 0,\n\s*type: s\.type,\n\s*topicId: s\.topicId,\n\s*grade: s\.cantoGrade \|\| s\.grade,\n\s*difficulty: s\.difficulty,\n\s*createdAt: s\.createdAt,\n\s*completesVuelta: s\.completesVuelta\n\s*\}\)\)\.sort\(\(a, b\) => new Date\(a\.date\)\.getTime\(\) - new Date\(b\.date\)\.getTime\(\)\);/,
    `const mapped = recentSessions.map(s => ({
            id: s.id,
            date: s.date,
            duration: s.durationMinutes || s.duration || 0,
            type: s.type,
            topicId: s.topicId,
            grade: s.cantoGrade || s.grade,
            difficulty: s.difficulty,
            createdAt: s.createdAt,
            completesVuelta: s.completesVuelta
        }));
        
        // Deduplicate exact same sessions (double-click bug prevention)
        const unique = [];
        const seen = new Set();
        mapped.forEach(s => {
            const key = \`\${s.topicId}-\${s.date}-\${s.type}-\${s.duration}-\${s.grade || 0}\`;
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(s);
            }
        });
        
        return unique.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());`
);

fs.writeFileSync('src/components/DashboardView.tsx', file);
