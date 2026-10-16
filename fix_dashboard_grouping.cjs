const fs = require('fs');
let file = fs.readFileSync('src/components/DashboardView.tsx', 'utf8');

const rawSessionsLogic = `
    const rawSessions = useMemo(() => {
        return recentSessions.map(s => ({
            date: s.date,
            duration: s.durationMinutes || s.duration || 0,
            type: s.type,
            topicId: s.topicId,
            grade: s.cantoGrade || s.grade,
            difficulty: s.difficulty,
            createdAt: s.createdAt
        })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }, [recentSessions]);

    const groupedSessions = useMemo(() => {
        const byTopic = {};
        rawSessions.forEach(s => {
           if (!byTopic[s.topicId]) byTopic[s.topicId] = [];
           byTopic[s.topicId].push(s);
        });

        const groupedResult = [];

        Object.keys(byTopic).forEach(topicId => {
            const chronological = byTopic[topicId].sort((a, b) => {
                const dateCmp = (a.date || "").localeCompare(b.date || "");
                if (dateCmp !== 0) return dateCmp;
                const timeA = a.createdAt && typeof a.createdAt.toMillis === 'function' ? a.createdAt.toMillis() : (a.createdAt || 0);
                const timeB = b.createdAt && typeof b.createdAt.toMillis === 'function' ? b.createdAt.toMillis() : (b.createdAt || 0);
                return timeA - timeB;
            });

            let currentGroup = null;
            chronological.forEach((s) => {
              if (currentGroup && (currentGroup.type !== s.type || currentGroup.completesVuelta !== false)) {
                if (currentGroup.difficultyCount > 0) currentGroup.difficulty = Math.round(currentGroup.difficultySum / currentGroup.difficultyCount);
                groupedResult.push(currentGroup);
                currentGroup = null;
              }

              if (!currentGroup) {
                currentGroup = {
                  date: s.date,
                  duration: s.duration,
                  type: s.type,
                  topicId: s.topicId,
                  grade: s.grade,
                  difficultySum: s.difficulty || 0,
                  difficultyCount: s.difficulty ? 1 : 0,
                  completesVuelta: s.completesVuelta
                };
              } else {
                currentGroup.duration += s.duration;
                if (s.difficulty) {
                  currentGroup.difficultySum += s.difficulty;
                  currentGroup.difficultyCount += 1;
                }
                currentGroup.completesVuelta = s.completesVuelta;
                currentGroup.date = s.date;
                if (s.grade) currentGroup.grade = s.grade;
              }

              if (s.completesVuelta !== false) {
                if (currentGroup.difficultyCount > 0) currentGroup.difficulty = Math.round(currentGroup.difficultySum / currentGroup.difficultyCount);
                groupedResult.push(currentGroup);
                currentGroup = null;
              }
            });

            if (currentGroup) {
              if (currentGroup.difficultyCount > 0) currentGroup.difficulty = Math.round(currentGroup.difficultySum / currentGroup.difficultyCount);
              groupedResult.push(currentGroup);
            }
        });

        return groupedResult.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }, [rawSessions]);
`;

const replaceAllSessionsDef = /const allSessions = useMemo\(\(\) => \{[\s\S]*?\}, \[recentSessions\]\);/;
file = file.replace(replaceAllSessionsDef, rawSessionsLogic);

// Heatmap and streak should use rawSessions
file = file.replace(/const daySessions = allSessions\.filter/g, "const daySessions = rawSessions.filter");
file = file.replace(/if \(allSessions\.some/g, "if (rawSessions.some");
file = file.replace(/const totalTimeHours = allSessions\.reduce/g, "const totalTimeHours = rawSessions.reduce");

// The rest should use groupedSessions
file = file.replace(/allSessions/g, "groupedSessions");

// Wait, I need to make sure I don't replace the ones I just changed to rawSessions!
// Since I already changed them to rawSessions, replacing allSessions -> groupedSessions will only affect the remaining ones!
// Let's verify:
file = file.replace(/groupedSessions = useMemo\(\(\) => \{[\s\S]*?rawSessions\.forEach/g, (match) => {
    return match; // It won't match allSessions anyway because I used rawSessions in the definition!
});

fs.writeFileSync('src/components/DashboardView.tsx', file);
