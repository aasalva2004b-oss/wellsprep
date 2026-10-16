const fs = require('fs');
let provider = fs.readFileSync('src/lib/FirebaseProvider.tsx', 'utf8');

const autoMigrateCode = `
  useEffect(() => {
    if (user && localStorage.getItem('auto_migrate_mercantil_v2') !== 'true') {
      localStorage.setItem('auto_migrate_mercantil_v2', 'true');
      migrateMercantilToConstitucional();
    }
  }, [user]);
`;

if (!provider.includes('auto_migrate_mercantil_v2')) {
    provider = provider.replace(/(const migrateMercantilToConstitucional = async \(\) => \{)/, autoMigrateCode + '\n  $1');
    fs.writeFileSync('src/lib/FirebaseProvider.tsx', provider);
}

let settings = fs.readFileSync('src/components/SettingsDialog.tsx', 'utf8');
settings = settings.replace(/<button\s*onClick=\{migrateMercantilToConstitucional\}[\s\S]*?Migrar Mercantil → Constitucional[\s\S]*?<\/button>\s*/, '');
fs.writeFileSync('src/components/SettingsDialog.tsx', settings);
