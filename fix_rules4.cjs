const fs = require('fs');
let rules = fs.readFileSync('firestore.rules', 'utf8');

// replace the createdAt equality check
rules = rules.replace(
    /&& incoming\(\)\.createdAt == existing\(\)\.createdAt/g,
    "&& (incoming().get('createdAt', null) == existing().get('createdAt', null))"
);

fs.writeFileSync('firestore.rules', rules);
