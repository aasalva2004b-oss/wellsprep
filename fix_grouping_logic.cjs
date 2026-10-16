const fs = require('fs');

// Fix TopicEditorDialog.tsx
let topicFile = fs.readFileSync('src/components/TopicEditorDialog.tsx', 'utf8');

const topicTarget = `  const groupedSessions = useMemo(() => {
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
          subSessions: [s],
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
        currentGroup.subSessions.push(s);
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
  }, [sessions]);`;

const topicReplacement = `  const groupedSessions = useMemo(() => {
    const chronological = [...sessions].reverse();
    const result: any[] = [];
    
    let activeGroups: Record<string, any> = {};

    chronological.forEach((s) => {
      let currentGroup = activeGroups[s.type];

      if (!currentGroup) {
        currentGroup = {
          ...s,
          originalIds: [s.id],
          subSessions: [s],
          isGroup: false,
          groupDates: [s.date],
          groupNotes: s.notes ? [s.notes] : [],
          difficultySum: s.difficulty || 0,
          difficultyCount: s.difficulty ? 1 : 0
        };
        activeGroups[s.type] = currentGroup;
      } else {
        currentGroup.duration += (s.duration || 0);
        if (s.difficulty) {
          currentGroup.difficultySum += s.difficulty;
          currentGroup.difficultyCount += 1;
        }
        currentGroup.originalIds.push(s.id);
        currentGroup.subSessions.push(s);
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
        activeGroups[s.type] = null;
      }
    });

    Object.values(activeGroups).forEach((group) => {
      if (group) {
        if (group.difficultyCount > 0) {
          group.difficulty = Math.round(group.difficultySum / group.difficultyCount);
        }
        group.notes = group.groupNotes.join(" | ");
        result.push(group);
      }
    });

    result.sort((a, b) => {
        const dateCmp = (a.date || "").localeCompare(b.date || "");
        if (dateCmp !== 0) return dateCmp;
        
        const timeA = a.createdAt && typeof a.createdAt.toMillis === 'function' ? a.createdAt.toMillis() : (a.createdAt || 0);
        const timeB = b.createdAt && typeof b.createdAt.toMillis === 'function' ? b.createdAt.toMillis() : (b.createdAt || 0);
        return timeA - timeB;
    });

    return result.reverse();
  }, [sessions]);`;

topicFile = topicFile.replace(topicTarget, topicReplacement);
fs.writeFileSync('src/components/TopicEditorDialog.tsx', topicFile);


// Fix DashboardView.tsx
let dashboardFile = fs.readFileSync('src/components/DashboardView.tsx', 'utf8');

const dashboardTarget = `            let currentGroup = null;
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
            }`;

const dashboardReplacement = `            let activeGroups = {};

            chronological.forEach((s) => {
              let currentGroup = activeGroups[s.type];

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
                activeGroups[s.type] = currentGroup;
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
                activeGroups[s.type] = null;
              }
            });

            Object.values(activeGroups).forEach((group) => {
              if (group) {
                if (group.difficultyCount > 0) group.difficulty = Math.round(group.difficultySum / group.difficultyCount);
                groupedResult.push(group);
              }
            });`;

dashboardFile = dashboardFile.replace(dashboardTarget, dashboardReplacement);
fs.writeFileSync('src/components/DashboardView.tsx', dashboardFile);
