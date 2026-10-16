const fs = require('fs');

let code = fs.readFileSync('src/components/DashboardView.tsx', 'utf8');

// DashboardView expects { userProgress, topics } props now, but App.tsx renders <DashboardView /> without props.
// Let's modify DashboardView to pull from useFirebase()

code = code.replace(
  'import { calculateNextSRSState } from "../lib/srs";',
  'import { calculateNextSRSState } from "../lib/srs";\nimport { useFirebase } from "../lib/FirebaseProvider";\nimport { initialTopics } from "../data/initialData";'
);

// We need to import UserProgress manually or bypass it
code = code.replace('import { UserProgress, Topic } from "../types";', 'import { Topic } from "../types";');

code = code.replace(
  'export function DashboardView({ userProgress, topics }: { userProgress: Record<string, UserProgress>; topics: Topic[] }) {',
  'export function DashboardView() {\n    const { userProgress } = useFirebase();\n    const topics = initialTopics;'
);

code = code.replace(/t\.block/g, "t.subjectId");

fs.writeFileSync('src/components/DashboardView.tsx', code);
