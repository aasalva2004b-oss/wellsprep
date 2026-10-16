const fs = require('fs');
let file = fs.readFileSync('src/components/TopicEditorDialog.tsx', 'utf8');

const groupingLogic = `  const groupedSessions = useMemo(() => {
    const chronological = [...sessions].reverse();
    const result: any[] = [];
    
    let currentGroup: any = null;

    chronological.forEach((s) => {
      if (currentGroup && (currentGroup.type !== s.type || currentGroup.completesVuelta !== false)) {
        if (currentGroup.difficultyCount > 0) {
          currentGroup.difficulty = Math.round(currentGroup.difficultySum / currentGroup.difficultyCount);
        }
        currentGroup.notes = currentGroup.groupNotes.join(" | ");
        result.push(currentGroup);
        currentGroup = null;
      }

      if (!currentGroup) {
        currentGroup = {
          ...s,
          originalIds: [s.id],
          isGroup: false,
          groupDates: [s.date],
          groupNotes: s.notes ? [s.notes] : [],
          difficultySum: s.difficulty || 0,
          difficultyCount: s.difficulty ? 1 : 0
        };
      } else {
        currentGroup.duration += (s.duration || 0);
        if (s.difficulty) {
          currentGroup.difficultySum += s.difficulty;
          currentGroup.difficultyCount += 1;
        }
        currentGroup.originalIds.push(s.id);
        if (!currentGroup.groupDates.includes(s.date)) {
           currentGroup.groupDates.push(s.date);
        }
        if (s.notes) currentGroup.groupNotes.push(s.notes);
        
        currentGroup.completesVuelta = s.completesVuelta;
        currentGroup.isGroup = true;
        currentGroup.date = s.date;
        currentGroup.id = s.id;
        currentGroup.createdAt = s.createdAt;
      }

      if (s.completesVuelta !== false) {
        if (currentGroup.difficultyCount > 0) {
          currentGroup.difficulty = Math.round(currentGroup.difficultySum / currentGroup.difficultyCount);
        }
        currentGroup.notes = currentGroup.groupNotes.join(" | ");
        result.push(currentGroup);
        currentGroup = null;
      }
    });

    if (currentGroup) {
      if (currentGroup.difficultyCount > 0) {
        currentGroup.difficulty = Math.round(currentGroup.difficultySum / currentGroup.difficultyCount);
      }
      currentGroup.notes = currentGroup.groupNotes.join(" | ");
      result.push(currentGroup);
    }

    return result.reverse();
  }, [sessions]);
`;

// Insert the groupedSessions useMemo right before retentionData
file = file.replace(
    /const retentionData = useMemo/g,
    groupingLogic + '\n  const retentionData = useMemo'
);

// Replace mapping sessions in render
file = file.replace(
    /sessions\.map\(\(session, idx\)/g,
    "groupedSessions.map((session, idx)"
);

file = file.replace(
    /sessions\.length === 0 \?/g,
    "groupedSessions.length === 0 ?"
);

// Update diffChartData, estudioRepasoChartData, cantosChartData to use groupedSessions
file = file.replace(
    /return sessions\s*\.filter/g,
    "return groupedSessions.filter"
);

file = file.replace(
    /const cantos = sessions\.filter/g,
    "const cantos = groupedSessions.filter"
);

// totalRepasos, totalCantos
file = file.replace(
    /const totalRepasos = sessions\.filter/g,
    "const totalRepasos = groupedSessions.filter"
);
file = file.replace(
    /const totalCantos = sessions\.filter/g,
    "const totalCantos = groupedSessions.filter"
);
file = file.replace(
    /const bestCanto = sessions/g,
    "const bestCanto = groupedSessions"
);

// Change deleteSessionHandler parameter and usage
file = file.replace(
    /const deleteSessionHandler = async \(id: string\) => \{/g,
    `const deleteSessionHandler = async (ids: string[]) => {`
);

file = file.replace(
    /await deleteStudySession\(topicId, id\);/g,
    `for (const i of ids) { await deleteStudySession(topicId, i); }`
);

file = file.replace(
    /deleteSessionHandler\(session\.id\)/g,
    "deleteSessionHandler(session.originalIds)"
);

// We should also replace the sessionToDelete logic to be array-compatible or just stick to session.id 
// since session.id is the ID of the completed (latest) part, which works perfectly fine for matching state!
// Yes, sessionToDelete === session.id still works!

fs.writeFileSync('src/components/TopicEditorDialog.tsx', file);
