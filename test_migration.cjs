const fs = require('fs');
let provider = fs.readFileSync('src/lib/FirebaseProvider.tsx', 'utf8');

provider = provider.replace(
    /let count = 0;\s+console.log\("Starting migration!"\);\s+const pSnap = await getDocs\(query\(collection\(db, \`users\/\$\{user.uid\}\/progress\`\)\)\);[\s\S]*?toast.success\("Migración completada con éxito."\);/g,
    `let count = 0;
      console.log("Starting migration!");
      const pSnap = await getDocs(query(collection(db, \`users/\${user.uid}/progress\`)));
      
      for (const d of pSnap.docs) {
        if (d.id.startsWith('mercantil-')) {
          try {
              const num = d.id.split('-')[1];
              const newId = \`constitucional-\${num}\`;
              const data = d.data();
              data.topicId = newId;
              await setDoc(doc(db, \`users/\${user.uid}/progress\`, newId), data, { merge: true });
              await deleteDoc(d.ref);
              console.log("Migrated progress: " + d.id);
          } catch (e) {
              console.error("Failed to migrate progress " + d.id, e, d.data());
              throw e;
          }
        }
      }

      const sSnap = await getDocs(query(collection(db, \`users/\${user.uid}/sessions\`), where("topicId", ">=", "mercantil-"), where("topicId", "<=", "mercantil-\\uf8ff")));
      for (const d of sSnap.docs) {
         const data = d.data();
         if (data.topicId.startsWith('mercantil-')) {
             try {
                 const num = data.topicId.split('-')[1];
                 data.topicId = \`constitucional-\${num}\`;
                 await setDoc(d.ref, data, { merge: true });
                 console.log("Migrated session: " + d.id);
             } catch(e) {
                 console.error("Failed to migrate session " + d.id, e, data);
                 throw e;
             }
         }
      }
      
      toast.dismiss(toastId);
      toast.success("Migración completada con éxito.");`
);

fs.writeFileSync('src/lib/FirebaseProvider.tsx', provider);
