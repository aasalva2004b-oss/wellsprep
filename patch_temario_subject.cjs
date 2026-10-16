const fs = require('fs');
const file = 'src/components/TemarioView.tsx';
let content = fs.readFileSync(file, 'utf8');

if (!content.includes('import { useEffect,')) {
    content = content.replace('import { useState, useMemo } from "react";', 'import { useState, useMemo, useEffect } from "react";');
}

// Replace the useState initialization
content = content.replace(
    /const \[selectedSubjectId, setSelectedSubjectId\] = useState<string>\([\s\S]*?\);/,
    `const [selectedSubjectId, setSelectedSubjectId] = useState<string>(
    userSettings?.defaultSubject || (activeSubjectsIds.length > 0 ? activeSubjectsIds[0] : initialSubjects[0].id)
  );

  useEffect(() => {
    if (userSettings?.defaultSubject && activeSubjectsIds.includes(userSettings.defaultSubject)) {
        setSelectedSubjectId(userSettings.defaultSubject);
    }
  }, [userSettings?.defaultSubject]);`
);

fs.writeFileSync(file, content);
