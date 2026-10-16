const fs = require('fs');
let rules = fs.readFileSync('firestore.rules', 'utf8');

rules = rules.replace(
    /&& data\.createdAt == request\.time/g,
    "&& data.createdAt is timestamp"
);

fs.writeFileSync('firestore.rules', rules);
