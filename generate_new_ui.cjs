const fs = require('fs');

const code = fs.readFileSync('src/components/TopicEditorDialog.tsx', 'utf8');
const returnIdx = code.indexOf('return (');

const imports = code.substring(0, code.indexOf('export function TopicEditorDialog'));
if (!imports.includes('PlusCircle')) {
    // We can just add PlusCircle to lucide-react imports
    const newCode = code.replace('import { LineChart, TrendingUp, BarChart2, Activity, FileText, Sparkles, Loader2, Check } from "lucide-react";', 'import { LineChart, TrendingUp, BarChart2, Activity, FileText, Sparkles, Loader2, Check, PlusCircle, Clock, BookOpen, Mic, Target, AlertTriangle, X, History, Trash2 } from "lucide-react";');
    fs.writeFileSync('src/components/TopicEditorDialog.tsx', newCode);
}
