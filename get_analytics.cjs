const fs = require('fs');
let code = fs.readFileSync('src/components/DashboardView.tsx', 'utf8');

// I will output the file starting from "export function DashboardView" up to "{/* THE CORE ANALYTICS"
const startCore = code.indexOf('{/* THE CORE ANALYTICS');
if (startCore !== -1) {
    fs.writeFileSync('dashboard_top.txt', code.substring(0, startCore));
    console.log("Got top of file");
}
