const fs = require('fs');
let code = fs.readFileSync('tsconfig.json', 'utf8');

// Exclude dist from tsconfig
code = code.replace(
    '"noEmit": true',
    '"noEmit": true\n  },\n  "exclude": ["dist", "node_modules", "server.ts", "server.js"]'
);
fs.writeFileSync('tsconfig.json', code);
