const fs = require('fs');

let code = fs.readFileSync('src/lib/FirebaseProvider.tsx', 'utf8');

// 1. Add methods to FirebaseContext
const contextDefStart = code.indexOf('export const FirebaseContext');
const contextDefEnd = code.indexOf('});', contextDefStart);

const contextDefOriginal = code.substring(contextDefStart, contextDefEnd);
if (!contextDefOriginal.includes('exportData: () => Promise<void>')) {
    code = code.replace(
        '  importProgress: (csvText: string) => Promise<{ success: number, errors: string[] }>;',
        '  importProgress: (csvText: string) => Promise<{ success: number, errors: string[] }>;\n  exportData: () => Promise<void>;\n  importData: (jsonText: string) => Promise<boolean>;\n  migrateMercantilToConstitucional: () => Promise<void>;'
    );
}

// 2. Add implementations inside FirebaseProvider
const methodsStart = code.indexOf('const updateTopicProgress');

if (methodsStart !== -1) {
    const newMethods = `
  const exportData = async () => {
    if (!user) return;
    try {
      const progressSnap = await getDocs(query(collection(db, \`users/\${user.uid}/progress\`)));
      const sessionsSnap = await getDocs(query(collection(db, \`users/\${user.uid}/sessions\`)));
      
      const progress = progressSnap.docs.map(d => d.data());
      const sessions = sessionsSnap.docs.map(d => {
         const data = d.data();
         return { id: d.id, ...data };
      });
      
      const backup = { progress, sessions, timestamp: new Date().toISOString() };
      
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = \`backup_wellsprep_\${new Date().toISOString().split('T')[0]}.json\`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("Copia de seguridad descargada correctamente.");
    } catch(e: any) {
      console.error(e);
      toast.error("Error al exportar datos: " + e.message);
    }
  };

  const importData = async (jsonText: string) => {
    if (!user) throw new Error("No user");
    try {
      const data = JSON.parse(jsonText);
      if (!data.progress || !data.sessions) throw new Error("El archivo no tiene el formato de copia de seguridad de WellsPrep.");
      
      const toastId = toast.loading("Restaurando copia de seguridad...");
      let batch = writeBatch(db);
      let count = 0;
      
      // Import progress
      for (const p of data.progress) {
         if (!p.topicId) continue;
         const ref = doc(db, \`users/\${user.uid}/progress\`, p.topicId);
         batch.set(ref, p, { merge: true });
         count++;
         if (count >= 400) { await batch.commit(); batch = writeBatch(db); count = 0; }
      }
      
      // Import sessions
      for (const s of data.sessions) {
         if (!s.topicId) continue;
         const ref = s.id ? doc(db, \`users/\${user.uid}/sessions\`, s.id) : doc(collection(db, \`users/\${user.uid}/sessions\`));
         // Don't save the id inside the document itself if we can avoid it, but it's fine
         const sData = { ...s };
         delete sData.id; 
         batch.set(ref, sData, { merge: true });
         count++;
         if (count >= 400) { await batch.commit(); batch = writeBatch(db); count = 0; }
      }
      
      if (count > 0) await batch.commit();
      
      toast.dismiss(toastId);
      toast.success("Copia de seguridad restaurada correctamente.");
      setTimeout(() => window.location.reload(), 1500);
      return true;
    } catch (e: any) {
      console.error(e);
      toast.error("Error al restaurar: " + e.message);
      return false;
    }
  };

  const migrateMercantilToConstitucional = async () => {
    if (!user) return;
    const toastId = toast.loading("Migrando temas de Mercantil a Constitucional...");
    try {
      let batch = writeBatch(db);
      let count = 0;

      const pSnap = await getDocs(query(collection(db, \`users/\${user.uid}/progress\`)));
      pSnap.docs.forEach(d => {
        if (d.id.startsWith('mercantil-')) {
          const num = d.id.split('-')[1];
          const newId = \`constitucional-\${num}\`;
          const data = d.data();
          data.topicId = newId;
          batch.set(doc(db, \`users/\${user.uid}/progress\`, newId), data, { merge: true });
          batch.delete(d.ref); 
          count+=2;
        }
      });
      
      if (count > 400) { await batch.commit(); batch = writeBatch(db); count = 0; }

      const sSnap = await getDocs(query(collection(db, \`users/\${user.uid}/sessions\`), where("topicId", ">=", "mercantil-"), where("topicId", "<=", "mercantil-\\uf8ff")));
      sSnap.docs.forEach(d => {
         const data = d.data();
         if (data.topicId.startsWith('mercantil-')) {
             const num = data.topicId.split('-')[1];
             data.topicId = \`constitucional-\${num}\`;
             batch.set(d.ref, data, { merge: true });
             count++;
         }
      });
      
      await batch.commit();
      toast.dismiss(toastId);
      toast.success("Migración completada con éxito.");
      setTimeout(() => window.location.reload(), 1500);
    } catch(e: any) {
      console.error(e);
      toast.dismiss(toastId);
      toast.error("Error en la migración: " + e.message);
    }
  };

`;
    code = code.substring(0, methodsStart) + newMethods + code.substring(methodsStart);
}

// 3. Add to provider context value
code = code.replace(
    '        importProgress,',
    '        importProgress,\n        exportData,\n        importData,\n        migrateMercantilToConstitucional,'
);

fs.writeFileSync('src/lib/FirebaseProvider.tsx', code);
console.log("Firebase provider patched!");
