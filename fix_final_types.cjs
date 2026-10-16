const fs = require('fs');

// Fix DashboardView
let codeDash = fs.readFileSync('src/components/DashboardView.tsx', 'utf8');
codeDash = codeDash.replace('Object.values(userProgress).forEach(prog => {', 'Object.values(userProgress).forEach((prog: any) => {');
fs.writeFileSync('src/components/DashboardView.tsx', codeDash);

// Fix TopicEditorDialog
let codeTopic = fs.readFileSync('src/components/TopicEditorDialog.tsx', 'utf8');
if (!codeTopic.includes('BrainCircuit')) {
    codeTopic = codeTopic.replace('import {', 'import { BrainCircuit,');
}
fs.writeFileSync('src/components/TopicEditorDialog.tsx', codeTopic);
