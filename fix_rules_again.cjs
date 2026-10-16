const fs = require('fs');
let rules = fs.readFileSync('firestore.rules', 'utf8');

// replace the hasAll for progress create
rules = rules.replace(
    /incoming\(\)\.keys\(\)\.hasAll\(\['userId', 'topicId', 'updatedAt'\]\)/g,
    "incoming().keys().hasAll(['userId', 'topicId'])"
);

// replace hasAll for session create
rules = rules.replace(
    /incoming\(\)\.keys\(\)\.hasAll\(\['userId', 'topicId', 'date', 'createdAt'\]\)/g,
    "incoming().keys().hasAll(['userId', 'topicId', 'date'])"
);

// Also in isValidStudySession
rules = rules.replace(
    /data\.keys\(\)\.hasAll\(\['userId', 'topicId', 'date', 'createdAt'\]\)/g,
    "data.keys().hasAll(['userId', 'topicId', 'date'])"
);

fs.writeFileSync('firestore.rules', rules);
