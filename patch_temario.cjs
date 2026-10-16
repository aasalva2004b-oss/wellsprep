const fs = require('fs');

let code = fs.readFileSync('src/components/TemarioView.tsx', 'utf8');

code = code.replace(
    'const [selectedSubjectId, setSelectedSubjectId] = useState<string>(\n    activeSubjectsIds.length > 0 ? activeSubjectsIds[0] : initialSubjects[0].id\n  );',
    'const [selectedSubjectId, setSelectedSubjectId] = useState<string>(\n    userSettings?.defaultSubject || (activeSubjectsIds.length > 0 ? activeSubjectsIds[0] : initialSubjects[0].id)\n  );'
);

fs.writeFileSync('src/components/TemarioView.tsx', code);
console.log("TemarioView patched.");
