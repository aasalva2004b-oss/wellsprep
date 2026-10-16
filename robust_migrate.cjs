const fs = require('fs');
let provider = fs.readFileSync('src/lib/FirebaseProvider.tsx', 'utf8');

provider = provider.replace(
    /const data = d\.data\(\);\s*data\.topicId = newId;/g,
    `const data = d.data();
              data.topicId = newId;
              if (!data.userId) data.userId = user.uid;
              if (!data.updatedAt) data.updatedAt = serverTimestamp();`
);

provider = provider.replace(
    /const num = data\.topicId\.split\('-'\)\[1\];\s*data\.topicId = \`constitucional-\$\{num\}\`;/g,
    `const num = data.topicId.split('-')[1];
                 data.topicId = \`constitucional-\${num}\`;
                 if (!data.userId) data.userId = user.uid;
                 if (!data.date) data.date = new Date().toISOString().split('T')[0];`
);

// We need to trigger the auto-migrate again since it failed.
provider = provider.replace(
    /localStorage\.getItem\('auto_migrate_mercantil_v2'\)/g,
    "localStorage.getItem('auto_migrate_mercantil_v3')"
);
provider = provider.replace(
    /localStorage\.setItem\('auto_migrate_mercantil_v2'/g,
    "localStorage.setItem('auto_migrate_mercantil_v3'"
);

fs.writeFileSync('src/lib/FirebaseProvider.tsx', provider);
