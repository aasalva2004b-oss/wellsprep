const fs = require('fs');

// Fix TopicEditorDialog (remove the trailing garbage)
let code = fs.readFileSync('src/components/TopicEditorDialog.tsx', 'utf8');
const lastReturn = code.lastIndexOf('return (');
const rest = code.substring(lastReturn);
// Let's just fix it by replacing the whole return block cleanly to avoid div mismatches
