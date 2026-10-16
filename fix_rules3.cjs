const fs = require('fs');
let rules = fs.readFileSync('firestore.rules', 'utf8');

// replace the size limits
rules = rules.replace(/incoming\(\)\.keys\(\)\.size\(\) <= 20/g, "incoming().keys().size() <= 40");

fs.writeFileSync('firestore.rules', rules);
