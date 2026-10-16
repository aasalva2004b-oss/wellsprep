const fs = require('fs');
let code = fs.readFileSync('src/components/SettingsDialog.tsx', 'utf8');

code = code.replace(
    'import { useTheme } from "./ThemeProvider";',
    'import { useTheme } from "../lib/ThemeProvider";\nimport React from "react";'
);

fs.writeFileSync('src/components/SettingsDialog.tsx', code);
