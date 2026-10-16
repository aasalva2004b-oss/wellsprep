const fs = require('fs');

let code = fs.readFileSync('src/components/DashboardView.tsx', 'utf8');

// replace lowercase cell with uppercase Cell
code = code.replace(
    'import { LineChart as RechartsLineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ComposedChart, ReferenceLine, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Scatter, ScatterChart, ZAxis } from "recharts";',
    'import { LineChart as RechartsLineChart, Line, AreaChart, Area, BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ComposedChart, ReferenceLine, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Scatter, ScatterChart, ZAxis } from "recharts";'
);

code = code.replace(/<cell/g, '<Cell');

fs.writeFileSync('src/components/DashboardView.tsx', code);
