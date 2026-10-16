const fs = require('fs');
let file = fs.readFileSync('src/components/DashboardView.tsx', 'utf8');

file = file.replace(
    /export function DashboardView\(\) \{/,
    "export function DashboardView({ onSelectTopic }: { onSelectTopic?: (topicId: string) => void }) {"
);

file = file.replace(
    /className="bg-white hover:bg-slate-50 border border-slate-100 p-4 rounded-2xl transition-all cursor-pointer group\/item shadow-sm hover:shadow-md ring-1 ring-slate-900\/5"/g,
    'className="bg-white hover:bg-slate-50 border border-slate-100 p-4 rounded-2xl transition-all cursor-pointer group/item shadow-sm hover:shadow-md ring-1 ring-slate-900/5" onClick={() => onSelectTopic?.(item.topic.id)}'
);

fs.writeFileSync('src/components/DashboardView.tsx', file);
