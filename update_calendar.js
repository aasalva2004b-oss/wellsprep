const fs = require('fs');

const code = fs.readFileSync('src/components/CalendarView.tsx', 'utf8');

const newContent = code.replace('import { Calendar, Trash2, CheckCircle2, Clock } from "lucide-react";', 'import { Calendar, Trash2, CheckCircle2, Clock, Wand2, RefreshCw } from "lucide-react";');

fs.writeFileSync('src/components/CalendarView.tsx', newContent);
