const fs = require('fs');
let file = fs.readFileSync('src/components/DashboardView.tsx', 'utf8');

// The place to insert is after const currentStreak = ...
// Let's find currentStreak

const calendarLogic = `
    // -- CALENDAR LOGIC --
    const [calendarDate, setCalendarDate] = useState(new Date());
    const [difficultyFilter, setDifficultyFilter] = useState('all');

    const calendarGrid = useMemo(() => {
        const year = calendarDate.getFullYear();
        const month = calendarDate.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);

        let startOffset = firstDay.getDay() - 1;
        if (startOffset === -1) startOffset = 6; // Adjust so Monday is 0, Sunday is 6

        const days = [];
        const prevMonthLastDay = new Date(year, month, 0).getDate();
        
        // Add previous month's trailing days
        for (let i = startOffset - 1; i >= 0; i--) {
            days.push({
                dateObj: new Date(year, month - 1, prevMonthLastDay - i),
                isCurrentMonth: false
            });
        }
        
        // Add current month's days
        for (let i = 1; i <= lastDay.getDate(); i++) {
            days.push({
                dateObj: new Date(year, month, i),
                isCurrentMonth: true
            });
        }
        
        // Add next month's leading days to complete the week
        const remaining = days.length % 7;
        if (remaining !== 0) {
            for (let i = 1; i <= 7 - remaining; i++) {
                days.push({
                    dateObj: new Date(year, month + 1, i),
                    isCurrentMonth: false
                });
            }
        }
        return days;
    }, [calendarDate]);

    const sessionsByDate = useMemo(() => {
        const grouped = {};
        rawSessions.forEach(s => {
            if (difficultyFilter === 'all' || 
               (difficultyFilter === 'hard' && s.difficulty >= 8) ||
               (difficultyFilter === 'medium' && s.difficulty >= 5 && s.difficulty <= 7) ||
               (difficultyFilter === 'easy' && s.difficulty <= 4 && s.difficulty > 0)) {
                
                const dStr = s.date;
                if (!grouped[dStr]) grouped[dStr] = [];
                grouped[dStr].push(s);
            }
        });
        return grouped;
    }, [rawSessions, difficultyFilter]);

    const prevMonth = () => {
        setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1));
    };
    
    const nextMonth = () => {
        setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1));
    };
    
    const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
`;

file = file.replace(
    /const currentStreak = useMemo\(\(\) => \{/,
    calendarLogic + "\n    const currentStreak = useMemo(() => {"
);

fs.writeFileSync('src/components/DashboardView.tsx', file);
