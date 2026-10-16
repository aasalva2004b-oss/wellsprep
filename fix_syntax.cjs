const fs = require('fs');
let file = fs.readFileSync('src/components/DashboardView.tsx', 'utf8');

file = file.replace(
    /} , ChevronLeft, Filter, Search } from "lucide-react";/,
    ", ChevronLeft, Filter, Search } from 'lucide-react';"
);

fs.writeFileSync('src/components/DashboardView.tsx', file);
