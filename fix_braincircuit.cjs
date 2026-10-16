const fs = require('fs');
let code = fs.readFileSync('src/components/TopicEditorDialog.tsx', 'utf8');

code = code.replace('import { LineChart', 'import { BrainCircuit, LineChart');

fs.writeFileSync('src/components/TopicEditorDialog.tsx', code);
