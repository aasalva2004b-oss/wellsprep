const fs = require('fs');
const file = 'src/components/DashboardView.tsx';
let content = fs.readFileSync(file, 'utf8');

// replace the allSessions calculation
content = content.replace(
    /const allSessions = useMemo\(\(\) => \{[\s\S]*?\}, \[userProgress\]\);/g,
    `const allSessions = useMemo(() => {
        return recentSessions.map(s => ({
            date: s.date,
            duration: s.durationMinutes || s.duration || 0,
            type: s.type,
            topicId: s.topicId,
            grade: s.cantoGrade || s.grade,
            difficulty: s.difficulty
        })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }, [recentSessions]);`
);

fs.writeFileSync(file, content);
