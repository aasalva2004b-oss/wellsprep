const fs = require('fs');
let rules = fs.readFileSync('firestore.rules', 'utf8');

rules = rules.replace(
    /&& data\.createdAt is timestamp/g,
    "&& (data.get('createdAt', null) == null || data.get('createdAt', null) is timestamp)"
);

rules = rules.replace(
    /&& data\.updatedAt == request\.time/g,
    "&& (data.get('updatedAt', null) == request.time)"
);

fs.writeFileSync('firestore.rules', rules);
