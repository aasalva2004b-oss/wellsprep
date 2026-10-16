const fs = require('fs');

let code = fs.readFileSync('src/components/DashboardView.tsx', 'utf8');

code = code.replace(
    '                            </div>\n                        <div className="mt-4 flex items-center',
    '                            </div>\n                        </div>\n                        <div className="mt-4 flex items-center'
);

fs.writeFileSync('src/components/DashboardView.tsx', code);
