const fs = require('fs');
let settings = fs.readFileSync('src/components/SettingsDialog.tsx', 'utf8');

// Remove the handleMigrate function
settings = settings.replace(/const handleMigrate = \(\) => \{[\s\S]*?migrateMercantilToConstitucional\(\);\s*\}\s*\};\s*/, '');

// Remove the button
settings = settings.replace(/<button\s*onClick=\{handleMigrate\}[\s\S]*?Migrar Mercantil → Constitucional[\s\S]*?<\/button>\s*/, '');

fs.writeFileSync('src/components/SettingsDialog.tsx', settings);

let provider = fs.readFileSync('src/lib/FirebaseProvider.tsx', 'utf8');

// Add the auto-migrate useEffect
const autoMigrateCode = `
  useEffect(() => {
    if (user && localStorage.getItem('auto_migrate_mercantil_done') !== 'true') {
      localStorage.setItem('auto_migrate_mercantil_done', 'true');
      migrateMercantilToConstitucional();
    }
  }, [user]);
`;

if (!provider.includes('auto_migrate_mercantil_done')) {
    provider = provider.replace(/(const migrateMercantilToConstitucional = async \(\) => \{)/, autoMigrateCode + '\n  $1');
    fs.writeFileSync('src/lib/FirebaseProvider.tsx', provider);
}
