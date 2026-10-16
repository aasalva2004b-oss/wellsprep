const fs = require('fs');

let code = fs.readFileSync('src/components/DashboardView.tsx', 'utf8');

const forecastLogic = `
    // 5. Forecast 14 Days
    const forecastData = useMemo(() => {
        const today = new Date();
        today.setHours(0,0,0,0);
        
        const days = Array.from({ length: 14 }).map((_, i) => {
            const d = new Date(today);
            d.setDate(d.getDate() + i);
            return {
                date: d,
                dateStr: getLocalDateString(d),
                label: i === 0 ? "Hoy" : i === 1 ? "Mañ" : d.toLocaleDateString("es-ES", { weekday: 'short' }),
                count: 0
            };
        });
        
        Object.values(userProgress).forEach(prog => {
            if(prog?.lastReviewDate) {
               const srsState = {
                  easinessFactor: prog.srsEasinessFactor || 2.5,
                  interval: prog.srsInterval || 0,
                  repetitions: prog.srsRepetitions || 0
               };
               const nextDate = calculateNextSRSState(prog.difficulty || 5, srsState, prog.lastReviewDate).nextReviewDate;
               
               const dayObj = days.find(d => d.dateStr === nextDate);
               if(dayObj) {
                   dayObj.count++;
               } else if (new Date(nextDate).getTime() < today.getTime()) {
                   // Overdue topics count for today
                   days[0].count++;
               }
            }
        });
        
        return days;
    }, [userProgress]);
`;

code = code.replace('}, [topics, userProgress]);', '}, [topics, userProgress]);\n\n' + forecastLogic);
fs.writeFileSync('src/components/DashboardView.tsx', code);
