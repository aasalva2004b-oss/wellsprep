const fs = require('fs');
let file = fs.readFileSync('src/components/TopicEditorDialog.tsx', 'utf8');

// extract groupedSessions
const match = file.match(/  const groupedSessions = useMemo\(\(\) => \{[\s\S]*?\}, \[sessions\]\);\n/);
if (match) {
    file = file.replace(match[0], '');
    
    // insert right before livePrediction
    file = file.replace(
        /  const livePrediction = useWellsProgressFactor/g,
        match[0] + '  const livePrediction = useWellsProgressFactor'
    );
    
    // change livePrediction to use groupedSessions
    file = file.replace(
        /    sessions,\n    userProgress\n  \);\n/g,
        '    groupedSessions,\n    userProgress\n  );\n'
    );
}

fs.writeFileSync('src/components/TopicEditorDialog.tsx', file);
