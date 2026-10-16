const fs = require('fs');
let provider = fs.readFileSync('src/lib/FirebaseProvider.tsx', 'utf8');

provider = provider.replace(
    /const updateUserSettings = async \(data: Partial<any>\) => \{\s*if \(\!user\) return;\s*await setDoc\(doc\(db, \`users\/\$\{user\.uid\}\/settings\/general\`\), data, \{ merge: true \}\);\s*\};/,
    `const updateUserSettings = async (data: Partial<any>) => {
    if (!user) return;
    await setDoc(doc(db, \`users/\${user.uid}/settings/general\`), {
      ...data,
      updatedAt: serverTimestamp()
    }, { merge: true });
  };`
);

fs.writeFileSync('src/lib/FirebaseProvider.tsx', provider);
