const fs = require('fs');
let code = fs.readFileSync('src/components/TopicEditorDialog.tsx', 'utf8');

// The issue might be a missing closing div due to replacement. Let's trace it.
code = code.replace(/    <\/div>\n  \);\n}\n/s, '      </div>\n    </div>\n  );\n}\n');

fs.writeFileSync('src/components/TopicEditorDialog.tsx', code);
