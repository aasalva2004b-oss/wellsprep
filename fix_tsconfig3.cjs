const fs = require('fs');
let code = fs.readFileSync('tsconfig.json', 'utf8');

code = code.replace(/  "exclude": \["dist", "node_modules", "server.ts", "server.js"\]\n  \}\n\}/s, '  "exclude": ["dist", "node_modules", "server.ts", "server.js"]\n}');

fs.writeFileSync('tsconfig.json', code);
