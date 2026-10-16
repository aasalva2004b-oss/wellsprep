const fs = require('fs');
let rules = fs.readFileSync('firestore.rules', 'utf8');

rules = rules.replace(
    /&& data\.get\('activeSubjects', \[\]\) is list/g,
    "&& data.get('activeSubjects', []) is list\n        && data.get('defaultSubject', '') is string"
);

rules = rules.replace(
    /\.affectedKeys\(\)\.hasOnly\(\['scheduleStr', 'targetDate', 'importedCsv', 'activeSubjects', 'updatedAt'\]\)/g,
    ".affectedKeys().hasOnly(['scheduleStr', 'targetDate', 'importedCsv', 'activeSubjects', 'defaultSubject', 'updatedAt'])"
);

rules = rules.replace(
    /&& incoming\(\)\.keys\(\)\.size\(\) <= 8/g,
    "&& incoming().keys().size() <= 10"
);

fs.writeFileSync('firestore.rules', rules);
