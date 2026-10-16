const fs = require('fs');
let code = fs.readFileSync('src/lib/FirebaseProvider.tsx', 'utf8');

code = code.replace(
    'activeSubjects?: string[];',
    'activeSubjects?: string[];\n  defaultSubject?: string;'
);

fs.writeFileSync('src/lib/FirebaseProvider.tsx', code);
