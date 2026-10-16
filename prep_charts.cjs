const fs = require('fs');

let code = fs.readFileSync('src/components/DashboardView.tsx', 'utf8');

const importRecharts = 'import { LineChart as RechartsLineChart, Line, AreaChart, Area, BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ComposedChart, ReferenceLine, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Scatter, ScatterChart, ZAxis } from "recharts";';

// We already have Recharts imports. 

// We need to inject the data preparation before "return ("
const dataStart = code.indexOf('    // Global Vitals');
if (dataStart !== -1) {
    const dataPrep = `
    // --- NUEVOS GRÁFICOS: RENDIMIENTO Y REPASOS ---
    const cantosData = useMemo(() => {
        const cantos = allSessions
            .filter(s => s.type === 'canto' || s.type === 'simulacro')
            .slice(-20); // Últimos 20 cantos
        
        return cantos.map((c, idx) => {
            const dateObj = new Date(c.date);
            return {
                id: idx + 1,
                fecha: dateObj.toLocaleDateString("es-ES", { day: '2-digit', month: 'short' }),
                duracion: c.duration || 0,
                nota: c.grade || 0,
                tema: topics.find(t => t.id === c.topicId)?.number || '?'
            };
        });
    }, [allSessions, topics]);

    const repasosData = useMemo(() => {
        const today = new Date();
        today.setHours(0,0,0,0);
        
        const days = Array.from({ length: 14 }).map((_, i) => {
            const d = new Date(today);
            d.setDate(d.getDate() - (13 - i));
            return {
                dateObj: d,
                dateStr: getLocalDateString(d),
                label: d.toLocaleDateString("es-ES", { day: '2-digit', month: 'short' }),
                count: 0
            };
        });

        allSessions.forEach(s => {
            if (s.type === 'repaso') {
                const dayObj = days.find(d => d.dateStr.startsWith(s.date.split('T')[0]));
                if (dayObj) {
                    dayObj.count++;
                }
            }
        });

        return days;
    }, [allSessions]);
    
`;
    code = code.substring(0, dataStart) + dataPrep + code.substring(dataStart);
    fs.writeFileSync('src/components/DashboardView.tsx', code);
    console.log("Data prep injected.");
}
