const fs = require('fs');
let code = fs.readFileSync('tsconfig.app.json', 'utf8');

// Exclude dist from tsconfig
code = code.replace(
    '"include": ["src"]',
    '"include": ["src"], "exclude": ["dist", "node_modules"]'
);
fs.writeFileSync('tsconfig.app.json', code);
