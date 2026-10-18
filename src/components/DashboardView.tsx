import { useState, useMemo } from "react";
import { Topic } from "../types";
import { toast } from "sonner";

import { LineChart as RechartsLineChart, Line, AreaChart, Area, BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ComposedChart, ReferenceLine, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Scatter, ScatterChart, ZAxis } from "recharts";
import { getLocalDateString } from "../lib/utils";

import { BrainCircuit, Mic, Target, TrendingUp, AlertTriangle, CheckCircle2, Flame, Calendar, Clock, BookOpen, AlertOctagon, Zap, Layers, ChevronRight, Activity, ChevronLeft, Filter, Search, Trash2, Plus, X, Award, BarChart3, AlertCircle, Sparkles, Check, ArrowUpRight, ArrowDownRight, Minus, Timer, CheckCircle, Sliders } from 'lucide-react';
import { cn } from "../lib/utils";
import { calculateNextSRSState } from "../lib/srs";
import { useFirebase } from "../lib/FirebaseProvider";
import { initialTopics } from "../data/initialData";
import { TopicsEvolutionSection } from "./TopicsEvolutionSection";

export function DashboardView({ onSelectTopic }: { onSelectTopic?: (topicId: string) => void }) {
    const { userProgress, recentSessions, deleteStudySession, addStudySession } = useFirebase();
    
    // Conmutador de Sección del Dashboard: Temas, Cantos, General o Todo
    const [dashboardSection, setDashboardSection] = useState<'temas' | 'cantos' | 'general' | 'todo'>('temas');
    
    // Unir temas iniciales con temas personalizados para que nunca falte el título o número
    const allTopics = useMemo(() => {
        const customList = Object.entries(userProgress || {})
            .filter(([id, data]: [string, any]) => data.isCustom && !data.isDeleted)
            .map(([id, data]: [string, any]) => ({
                id,
                subjectId: data.subjectId || "custom",
                number: data.number || 999,
                title: data.customTitle || "Tema Personalizado",
                shortTitle: data.customTitle || "Tema Personalizado",
            } as unknown as Topic));
        return [...initialTopics, ...customList];
    }, [userProgress]);

    const topics = allTopics;

    // Estados para la sección de Cantos
    const [cantoTimeRange, setCantoTimeRange] = useState<'all' | '30d' | '20' | '10'>('all');
    const [selectedTopicCantoFilter, setSelectedTopicCantoFilter] = useState<string>('all');
    const [isManagingCantos, setIsManagingCantos] = useState(false);
    const [cantoSearchTerm, setCantoSearchTerm] = useState('');
    const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);

    // Modal de Registro Rápido de Canto
    const [isLoggingCanto, setIsLoggingCanto] = useState(false);
    const [newCantoTopicId, setNewCantoTopicId] = useState('');
    const [newCantoDate, setNewCantoDate] = useState(getLocalDateString());
    const [newCantoMin, setNewCantoMin] = useState('14');
    const [newCantoSec, setNewCantoSec] = useState('0');
    const [newCantoGrade, setNewCantoGrade] = useState('7.0');
    const [newCantoDifficulty, setNewCantoDifficulty] = useState(5);
    const [newCantoMistakes, setNewCantoMistakes] = useState('');
    const [newCantoNotes, setNewCantoNotes] = useState('');
    const [isSavingCanto, setIsSavingCanto] = useState(false);
    
    // --- ADVANCED ANALYTICS ENGINE ---
    
    const rawSessions = useMemo(() => {
        const mapped = (recentSessions || []).map(s => ({
            id: s.id,
            date: s.date,
            duration: s.durationMinutes || s.duration || 0,
            durationMinutes: s.durationMinutes || s.duration || 0,
            cantoSeconds: s.cantoSeconds || 0,
            type: s.type,
            topicId: s.topicId,
            grade: typeof s.cantoGrade === 'number' ? s.cantoGrade : (typeof s.grade === 'number' ? s.grade : null),
            cantoGrade: typeof s.cantoGrade === 'number' ? s.cantoGrade : (typeof s.grade === 'number' ? s.grade : null),
            difficulty: s.difficulty,
            createdAt: s.createdAt,
            completesVuelta: s.completesVuelta,
            notes: s.notes || '',
            mistakes: s.mistakes || ''
        }));
        
        // Deduplicar envíos dobles en O(N) lineal mediante Map compuesto
        const unique: typeof mapped = [];
        const seenIds = new Set<string>();
        const recentByKey = new Map<string, number>();

        mapped.forEach(s => {
            if (seenIds.has(s.id)) return;
            seenIds.add(s.id);

            const timeS = s.createdAt && typeof s.createdAt.toMillis === 'function' 
                ? s.createdAt.toMillis() 
                : (typeof s.createdAt === 'number' ? s.createdAt : 0);

            const compositeKey = `${s.topicId}_${s.type}_${s.date}_${s.duration}_${s.grade || 0}`;
            const prevTime = recentByKey.get(compositeKey);

            if (prevTime !== undefined && timeS > 0 && Math.abs(timeS - prevTime) < 3000) {
                // Doble submit descartado
                return;
            }

            if (timeS > 0) {
                recentByKey.set(compositeKey, timeS);
            }
            unique.push(s);
        });
        
        return unique.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }, [recentSessions]);

    const groupedSessions = useMemo(() => {
        const byTopic: Record<string, any[]> = {};
        rawSessions.forEach(s => {
           if (!byTopic[s.topicId]) byTopic[s.topicId] = [];
           byTopic[s.topicId].push(s);
        });

        const groupedResult: any[] = [];

        Object.keys(byTopic).forEach(topicId => {
            const chronological = byTopic[topicId].sort((a, b) => {
                const dateCmp = (a.date || "").localeCompare(b.date || "");
                if (dateCmp !== 0) return dateCmp;
                const timeA = a.createdAt && typeof a.createdAt.toMillis === 'function' ? a.createdAt.toMillis() : (a.createdAt || 0);
                const timeB = b.createdAt && typeof b.createdAt.toMillis === 'function' ? b.createdAt.toMillis() : (b.createdAt || 0);
                return timeA - timeB;
            });

            let activeGroups: Record<string, any> = {};

            chronological.forEach((s) => {
              // Los cantos y simulacros son evaluaciones orales discretas: NUNCA se agrupan
              if (s.type === 'canto' || s.type === 'simulacro') {
                groupedResult.push(s);
                return;
              }

              let currentGroup = activeGroups[s.type];

              if (!currentGroup) {
                currentGroup = {
                  date: s.date,
                  duration: s.duration,
                  type: s.type,
                  topicId: s.topicId,
                  grade: s.grade,
                  difficultySum: s.difficulty || 0,
                  difficultyCount: s.difficulty ? 1 : 0,
                  completesVuelta: s.completesVuelta
                };
                activeGroups[s.type] = currentGroup;
              } else {
                currentGroup.duration += s.duration;
                if (s.difficulty) {
                  currentGroup.difficultySum += s.difficulty;
                  currentGroup.difficultyCount += 1;
                }
                currentGroup.completesVuelta = s.completesVuelta;
                currentGroup.date = s.date;
                if (s.grade) currentGroup.grade = s.grade;
              }

              if (s.completesVuelta !== false) {
                if (currentGroup.difficultyCount > 0) currentGroup.difficulty = Math.round(currentGroup.difficultySum / currentGroup.difficultyCount);
                groupedResult.push(currentGroup);
                activeGroups[s.type] = null;
              }
            });

            Object.values(activeGroups).forEach((group: any) => {
              if (group) {
                if (group.difficultyCount > 0) group.difficulty = Math.round(group.difficultySum / group.difficultyCount);
                groupedResult.push(group);
              }
            });
        });

        return groupedResult.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }, [rawSessions]);


    // 1. Consistency Heatmap (Last 12 weeks)
    const heatmapData = useMemo(() => {
        const today = new Date();
        const days = [];
        for (let i = 83; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            const daySessions = rawSessions.filter(s => s.date === dateStr);
            const totalDuration = daySessions.reduce((acc, s) => acc + (s.duration || 0), 0);
            days.push({ date: dateStr, duration: totalDuration, count: daySessions.length });
        }
        return days;
    }, [groupedSessions]);

    
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

    const currentStreak = useMemo(() => {
        let streak = 0;
        const today = new Date();
        today.setHours(0,0,0,0);
        
        for (let i = 0; i < 300; i++) { // check up to 300 days back
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            if (rawSessions.some(s => s.date === dateStr)) {
                streak++;
            } else if (i > 0) { // allow skipping today if haven't studied yet, but if missed yesterday, break
                break;
            }
        }
        return streak;
    }, [groupedSessions]);

    // 2. Smart Queue (Agenda)
    const smartQueue = useMemo(() => {
        const queue: { topic: Topic, reason: string, urgency: number, nextDate: string }[] = [];
        const today = new Date().getTime();

        topics.forEach(t => {
            const prog = userProgress[t.id];
            if (!prog || !prog.firstStudyDate) return;

            const srsState = {
                easinessFactor: prog.srsEasinessFactor || 2.5,
                interval: prog.srsInterval || 0,
                repetitions: prog.srsRepetitions || 0
            };
            const nextDateStr = calculateNextSRSState(prog.difficulty || 5, srsState, prog.lastReviewDate).nextReviewDate;
            const nextDate = new Date(nextDateStr).getTime();
            
            const diffDays = Math.round((nextDate - today) / (1000 * 3600 * 24));
            
            if (diffDays <= 7) {
                let reasonStr = "En " + diffDays + " días";
                if (diffDays === 1) reasonStr = "Mañana";
                else if (diffDays === 0) reasonStr = "Hoy";
                else if (diffDays < 0) reasonStr = `Atrasado ${Math.abs(diffDays)} ${Math.abs(diffDays) === 1 ? 'día' : 'días'}`;
                
                queue.push({
                    topic: t,
                    reason: reasonStr,
                    urgency: diffDays < 0 ? 3 : diffDays === 0 ? 2 : 1,
                    nextDate: nextDateStr
                });
            }
        });

        return queue.sort((a, b) => b.urgency - a.urgency);
    }, [topics, userProgress]);


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
        
        Object.values(userProgress).forEach((prog: any) => {
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


    // 3. Burn-up (Cumulative topics studied)
    const cumulativeProgress = useMemo(() => {
        const dates = groupedSessions.filter(s => s.type === "estudio_inicial").map(s => s.date).sort();
        if (dates.length === 0) return [];
        
        const start = new Date(dates[0]);
        const end = new Date();
        const data = [];
        let accumulated = 0;

        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 7)) {
            const dStr = d.toISOString().split('T')[0];
            accumulated = dates.filter(date => date <= dStr).length;
            data.push({
                date: dStr.slice(5), // MM-DD
                estudiados: accumulated,
                objetivo: Math.min(topics.length, accumulated + 2) // Fake dynamic target for visual baseline
            });
        }
        return data;
    }, [groupedSessions, topics]);

    // 4. Domain Radar
    const radarData = useMemo(() => {
        const blocks: Record<string, { total: number, studied: number, score: number }> = {};
        topics.forEach(t => {
            if (!blocks[t.subjectId]) blocks[t.subjectId] = { total: 0, studied: 0, score: 0 };
            blocks[t.subjectId].total++;
            const p = userProgress[t.id];
            if (p && p.firstStudyDate) {
                blocks[t.subjectId].studied++;
                let s = 5;
                if (p.difficulty) s += (5 - p.difficulty/2); // inverted difficulty
                if (p.srsRepetitions) s += p.srsRepetitions * 0.5;
                blocks[t.subjectId].score += Math.min(10, s);
            }
        });

        return Object.entries(blocks).map(([name, data]) => ({
            materia: name.length > 15 ? name.substring(0, 15) + "..." : name,
            dominio: data.studied > 0 ? (data.score / data.studied).toFixed(1) : 0,
            cobertura: ((data.studied / data.total) * 10).toFixed(1)
        }));
    }, [topics, userProgress]);


    // --- MOTOR TELEMÉTRICO DE CANTOS Y EVALUACIONES ORALES ---
    // Extracción limpia y atómica de todos los cantos de la oposición
    const allCantos = useMemo(() => {
        const mapped = (recentSessions || [])
            .filter(s => s.type === 'canto' || s.type === 'simulacro')
            .map(s => {
                const durMin = s.durationMinutes || s.duration || 0;
                const durSec = s.cantoSeconds || 0;
                const totalMin = durMin + (durSec / 60);
                const grade = typeof s.cantoGrade === 'number' ? s.cantoGrade : (typeof s.grade === 'number' ? s.grade : null);
                
                const topic = allTopics.find(t => t.id === s.topicId) 
                    || allTopics.find(t => String(t.number) === String(s.topicId))
                    || (s.topicId ? allTopics.find(t => t.id.endsWith(`-${s.topicId}`)) : undefined);

                const customTitle = s.topicId ? (userProgress[s.topicId]?.customTitle || userProgress[s.topicId]?.title) : undefined;
                const topicNumber = topic?.number ?? (s.topicId && !isNaN(Number(s.topicId)) ? Number(s.topicId) : (s.topicId ? s.topicId.split('-').pop() : '?'));
                let resolvedTitle = customTitle || topic?.title;

                if (!resolvedTitle) {
                    if (s.topicId && s.topicId.includes('-')) {
                        const parts = s.topicId.split('-');
                        const subj = parts[0];
                        const num = parts.slice(1).join('-');
                        resolvedTitle = `Tema ${num} (${subj.charAt(0).toUpperCase() + subj.slice(1)})`;
                    } else if (s.topicId) {
                        resolvedTitle = `Tema ${s.topicId}`;
                    } else {
                        resolvedTitle = 'Tema sin título';
                    }
                }

                const createdMs = s.createdAt && typeof s.createdAt.toMillis === 'function'
                    ? s.createdAt.toMillis()
                    : (typeof s.createdAt === 'number' ? s.createdAt : 0);

                return {
                    id: s.id,
                    topicId: s.topicId,
                    topicNumber: topicNumber,
                    topicTitle: resolvedTitle,
                    topicSubject: topic?.subjectId || '',
                    date: s.date || getLocalDateString(),
                    durationMinutes: durMin,
                    durationSeconds: durSec,
                    totalMinutes: Math.round(totalMin * 10) / 10,
                    grade,
                    difficulty: s.difficulty || 5,
                    notes: s.notes || '',
                    mistakes: s.mistakes || '',
                    createdMs,
                    type: s.type
                };
            });

        // Ordenar cronológicamente ascendente (del más antiguo al más reciente para ver la evolución)
        mapped.sort((a, b) => {
            const dateCmp = (a.date || "").localeCompare(b.date || "");
            if (dateCmp !== 0) return dateCmp;
            return (a.createdMs || 0) - (b.createdMs || 0);
        });

        // Filtrar exclusivamente dobles clicks en el botón (creados en < 3s de diferencia con mismos datos)
        const deduped: typeof mapped = [];
        const seenIds = new Set<string>();

        for (const c of mapped) {
            if (!seenIds.has(c.id)) {
                const isDoubleSubmit = deduped.some(existing =>
                    existing.topicId === c.topicId &&
                    existing.date === c.date &&
                    existing.durationMinutes === c.durationMinutes &&
                    existing.durationSeconds === c.durationSeconds &&
                    existing.grade === c.grade
                );

                if (!isDoubleSubmit) {
                    seenIds.add(c.id);
                    deduped.push(c);
                }
            }
        }

        return deduped;
    }, [recentSessions, allTopics, userProgress]);

    // Lista de temas únicos presentes en los cantes para el filtro temático
    const uniqueTopicsInCantos = useMemo(() => {
        const map = new Map<string, { id: string; number: number | string; title: string; count: number }>();
        allCantos.forEach(c => {
            const key = c.topicId || String(c.topicNumber);
            if (!map.has(key)) {
                map.set(key, {
                    id: key,
                    number: c.topicNumber,
                    title: c.topicTitle,
                    count: 0
                });
            }
            map.get(key)!.count += 1;
        });
        return Array.from(map.values()).sort((a, b) => {
            const numA = Number(a.number) || 999;
            const numB = Number(b.number) || 999;
            return numA - numB;
        });
    }, [allCantos]);

    // Filtrado por alcance temporal y/o tema específico
    const filteredCantos = useMemo(() => {
        let base = allCantos;
        if (selectedTopicCantoFilter !== 'all') {
            base = base.filter(c => c.topicId === selectedTopicCantoFilter || String(c.topicNumber) === selectedTopicCantoFilter);
        }
        if (cantoTimeRange === '10') return base.slice(-10);
        if (cantoTimeRange === '20') return base.slice(-20);
        if (cantoTimeRange === '30d') {
            const limit = new Date();
            limit.setDate(limit.getDate() - 30);
            const limitStr = getLocalDateString(limit);
            return base.filter(c => c.date >= limitStr);
        }
        return base; // 'all': Toda la oposición
    }, [allCantos, cantoTimeRange, selectedTopicCantoFilter]);

    // Cálculo del Estado de Forma Actual del Opositor
    const estadoDeForma = useMemo(() => {
        if (allCantos.length === 0) {
            return {
                diagnostico: "Sin cantos registrados",
                badgeClass: "bg-slate-100 text-slate-500 border-slate-200",
                consejo: "Registra tus cantes para monitorizar tu estado de forma y control del cronómetro.",
                notaMediaReciente: 0,
                notaMediaHistorica: 0,
                tiempoMedioRecienteMin: 0,
                tiempoMedioRecienteSec: 0,
                porcentajeEnTiempoOptimo: 0,
                tendenciaNota: 0,
                diasUltimoCanto: null,
                totalCantos: 0,
                aprobadosPorcentaje: 0
            };
        }

        // Últimos 5 cantos para evaluar el pico de forma reciente
        const recientes = allCantos.slice(-5);
        const recientesConNota = recientes.filter(c => c.grade !== null);
        const mediaReciente = recientesConNota.length > 0
            ? (recientesConNota.reduce((acc, c) => acc + (c.grade || 0), 0) / recientesConNota.length)
            : 0;

        const todosConNota = allCantos.filter(c => c.grade !== null);
        const mediaHistorica = todosConNota.length > 0
            ? (todosConNota.reduce((acc, c) => acc + (c.grade || 0), 0) / todosConNota.length)
            : 0;

        const totalSecsRecientes = recientes.reduce((acc, c) => acc + (c.durationMinutes * 60 + c.durationSeconds), 0);
        const avgSecs = recientes.length > 0 ? Math.round(totalSecsRecientes / recientes.length) : 0;
        const avgMins = Math.floor(avgSecs / 60);
        const avgRemSecs = avgSecs % 60;
        const avgTotalSecs = avgMins * 60 + avgRemSecs;

        // Ventana oficial para aprobar un cante: entre 11:00 y 13:40 min (660s a 820s). Más de 13:40 es suspenso directo.
        const enTiempo = recientes.filter(c => {
            const s = c.durationMinutes * 60 + c.durationSeconds;
            return s >= 660 && s <= 820;
        }).length;
        const pctEnTiempo = recientes.length > 0 ? Math.round((enTiempo / recientes.length) * 100) : 0;

        // Para contabilizar como aprobados: nota >= 5.0 y duración entre 11 y 13:40 minutos (660s a 820s). Si supera 13:40 es suspenso.
        const aprobados = todosConNota.filter(c => {
            const durSecs = c.durationMinutes * 60 + c.durationSeconds;
            const notaAprobada = (c.grade || 0) >= 5;
            const enTiempoValido = durSecs >= 660 && durSecs <= 820;
            return notaAprobada && enTiempoValido;
        }).length;
        const pctAprobados = todosConNota.length > 0 ? Math.round((aprobados / todosConNota.length) * 100) : 0;

        const ultimo = allCantos[allCantos.length - 1];
        const lastDate = new Date(ultimo.date);
        const today = new Date();
        const diffDays = Math.max(0, Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 3600 * 24)));

        let diagnostico = "Ritmo Competitivo";
        let badgeClass = "bg-blue-50 text-blue-700 border-blue-200/80";
        let consejo = "Ritmo sólido. Continúa ajustando transiciones y dicción para afianzar el 8+.";

        if (mediaReciente >= 7.5 && pctEnTiempo >= 60) {
            diagnostico = "Pico de Forma";
            badgeClass = "bg-emerald-50 text-emerald-700 border-emerald-200/80";
            consejo = "Excelente control del tiempo reglamentario (11:00–13:40 min) y rigor expositivo. Nivel de plaza.";
        } else if (avgTotalSecs > 820) {
            diagnostico = "Exceso de Tiempo";
            badgeClass = "bg-rose-50 text-rose-700 border-rose-200/80";
            consejo = "Tiempo medio superior a 13:40 min (suspenso por tiempo). Sintetiza epígrafes para asegurar el aprobado.";
        } else if (avgTotalSecs < 660 && avgTotalSecs > 0) {
            diagnostico = "Cante Breve";
            badgeClass = "bg-amber-50 text-amber-700 border-amber-200/80";
            consejo = "Tiempo medio inferior a 11 min. Desarrolla completamente artículos y conceptos para alcanzar la franja de aprobado.";
        } else if (mediaReciente < 5.0 && recientesConNota.length > 0) {
            diagnostico = "Fase de Rodaje";
            badgeClass = "bg-rose-50 text-rose-700 border-rose-200/80";
            consejo = "Afianza la literalidad y el esquema conceptual antes de exigir mayor velocidad al cronómetro.";
        }

        return {
            diagnostico,
            badgeClass,
            consejo,
            notaMediaReciente: Math.round(mediaReciente * 10) / 10,
            notaMediaHistorica: Math.round(mediaHistorica * 10) / 10,
            tiempoMedioRecienteMin: avgMins,
            tiempoMedioRecienteSec: avgRemSecs,
            porcentajeEnTiempoOptimo: pctEnTiempo,
            tendenciaNota: Math.round((mediaReciente - mediaHistorica) * 10) / 10,
            diasUltimoCanto: diffDays,
            totalCantos: allCantos.length,
            aprobadosPorcentaje: pctAprobados
        };
    }, [allCantos]);

    // Mapeo para el gráfico dual Recharts
    const cantosChartData = useMemo(() => {
        return filteredCantos.map((c, idx) => {
            const dateObj = new Date(c.date);
            const fechaStr = dateObj.toLocaleDateString("es-ES", { day: '2-digit', month: 'short' });
            const totalSecs = c.durationMinutes * 60 + c.durationSeconds;
            const durDec = totalSecs / 60;

            // Ventana reglamentaria: 11:00 a 13:40 min (660s a 820s)
            const isOptimal = totalSecs >= 660 && totalSecs <= 820;
            const isExcess = totalSecs > 820; // >13:40 min: suspenso automático
            const isShort = totalSecs < 660 && totalSecs > 0; // <11:00 min: insuficiente

            const hasGrade = typeof c.grade === 'number';
            const gradeVal = c.grade ?? 0;
            // Para contabilizar como aprobado: nota >= 5 y duración entre 11 y 13:40 min. Si tiene más es suspenso.
            const isAprobado = hasGrade && gradeVal >= 5 && isOptimal;
            const isSuspenso = hasGrade && !isAprobado;

            let estadoCante = "Sin nota";
            let estadoCanteClass = "bg-slate-100 text-slate-600 border-slate-200";
            if (hasGrade) {
                if (isAprobado) {
                    estadoCante = "Aprobado";
                    estadoCanteClass = "bg-emerald-100 text-emerald-800 border-emerald-300";
                } else if (isExcess) {
                    estadoCante = "Suspenso (>13:40)";
                    estadoCanteClass = "bg-rose-100 text-rose-800 border-rose-300";
                } else if (isShort) {
                    estadoCante = "Suspenso (<11:00)";
                    estadoCanteClass = "bg-amber-100 text-amber-800 border-amber-300";
                } else {
                    estadoCante = "Suspenso (<5.0)";
                    estadoCanteClass = "bg-rose-100 text-rose-800 border-rose-300";
                }
            }

            return {
                id: c.id,
                index: idx + 1,
                cantoNum: idx + 1,
                displayX: `T.${c.topicNumber}`,
                fecha: fechaStr,
                fechaStr: fechaStr,
                fullDate: c.date,
                duracion: Math.round(durDec * 10) / 10,
                duracionMinutes: c.durationMinutes,
                duracionSeconds: c.durationSeconds,
                totalSecs,
                duracionStr: `${c.durationMinutes}m ${c.durationSeconds ? c.durationSeconds + 's' : ''}`.trim(),
                nota: c.grade,
                temaNumero: c.topicNumber,
                topicNumber: c.topicNumber,
                temaTitulo: c.topicTitle,
                topicTitle: c.topicTitle,
                topicSubject: c.topicSubject,
                topicId: c.topicId,
                notes: c.notes,
                mistakes: c.mistakes,
                isOptimal,
                isExcess,
                isShort,
                isAprobado,
                isSuspenso,
                estadoCante,
                estadoCanteClass,
                tipoLabel: c.type === 'simulacro' ? 'Simulacro' : 'Canto Oral'
            };
        });
    }, [filteredCantos]);

    // Registro Rápido de Canto
    const handleSaveNewCanto = async () => {
        if (!newCantoTopicId) {
            toast.error("Por favor selecciona un tema.");
            return;
        }
        const mins = parseInt(newCantoMin) || 0;
        const secs = parseInt(newCantoSec) || 0;
        if (mins === 0 && secs === 0) {
            toast.error("Introduce la duración del cante.");
            return;
        }
        const gradeNum = parseFloat(newCantoGrade);
        if (isNaN(gradeNum) || gradeNum < 0 || gradeNum > 10) {
            toast.error("La calificación debe estar entre 0 y 10.");
            return;
        }

        setIsSavingCanto(true);
        try {
            await addStudySession(
                newCantoTopicId,
                mins,
                newCantoDifficulty,
                'canto',
                newCantoDate,
                {
                    cantoGrade: gradeNum,
                    cantoSeconds: secs,
                    mistakes: newCantoMistakes.trim(),
                    notes: newCantoNotes.trim()
                }
            );
            toast.success("Canto registrado correctamente en tu telemetría.");
            setIsLoggingCanto(false);
            setNewCantoMistakes('');
            setNewCantoNotes('');
        } catch (err: any) {
            toast.error("Error al registrar el cante: " + (err.message || err));
        } finally {
            setIsSavingCanto(false);
        }
    };

    // Eliminación de Canto (para corregir duplicados o erróneos directamente)
    const handleDeleteCanto = async (topicId: string, sessionId: string) => {
        setDeletingSessionId(sessionId);
        try {
            await deleteStudySession(topicId, sessionId);
            toast.success("Canto eliminado del registro.");
        } catch (err: any) {
            toast.error("Error al eliminar el cante: " + (err.message || err));
        } finally {
            setDeletingSessionId(null);
        }
    };

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

        groupedSessions.forEach(s => {
            if (s.type === 'refresco') {
                const dayObj = days.find(d => d.dateStr.startsWith(s.date.split('T')[0]));
                if (dayObj) {
                    dayObj.count++;
                }
            }
        });

        return days;
    }, [groupedSessions]);
    
    // Global Vitals
    const totalTopicsStudied = topics.filter(t => userProgress[t.id]?.firstStudyDate).length;
    const globalCompletion = (totalTopicsStudied / topics.length) * 100;
    const totalTimeHours = rawSessions.reduce((acc, s) => acc + (s.duration || 0), 0) / 60;
    
    // Media de Cantos (Calculada directamente sobre los cantos atómicos reales)
    const cantosConNota = allCantos.filter(c => c.grade !== null);
    const recentCantos = cantosConNota.slice(-10);
    const avgRecentCanto = recentCantos.length > 0 ? (recentCantos.reduce((a, b) => a + (b.grade || 0), 0) / recentCantos.length) : 0;

    return (
        <div className="w-full h-full px-2.5 py-3 sm:p-6 lg:p-8 bg-[#F5F5F7] overflow-y-auto no-scrollbar pb-28 md:pb-8">
            <div className="max-w-[100rem] mx-auto space-y-3.5 sm:space-y-6 lg:space-y-8">
                
                {/* HERO HEADER & GLOBAL VITALS */}
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-3 sm:gap-6 mb-1 sm:mb-2">
                    <div>
                        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-slate-900 tracking-tight font-serif">
                            Centro de Comando
                        </h1>
                        <p className="text-slate-500 text-xs sm:text-sm font-medium mt-0.5 sm:mt-1 flex items-center gap-1.5 sm:gap-2">
                            <Activity size={15} className="text-indigo-500 shrink-0" />
                            Telemetría en tiempo real de tu oposición
                        </p>
                    </div>

                    {/* Selector de Sección Analítica Responsive */}
                    <div className="w-full lg:w-auto flex items-center bg-white/90 backdrop-blur-md p-1 sm:p-1.5 rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-sm gap-1 overflow-x-auto no-scrollbar">
                        <button
                            onClick={() => setDashboardSection('temas')}
                            className={cn(
                                "px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shrink-0",
                                dashboardSection === 'temas'
                                    ? "bg-slate-900 text-white shadow-md"
                                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/80"
                            )}
                        >
                            <BookOpen size={14} className={dashboardSection === 'temas' ? "text-indigo-300" : "text-indigo-600"} />
                            <span className="sm:hidden">Temas</span>
                            <span className="hidden sm:inline">Evolución de Temas</span>
                        </button>
                        <button
                            onClick={() => setDashboardSection('cantos')}
                            className={cn(
                                "px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shrink-0",
                                dashboardSection === 'cantos'
                                    ? "bg-slate-900 text-white shadow-md"
                                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/80"
                            )}
                        >
                            <Mic size={14} className={dashboardSection === 'cantos' ? "text-fuchsia-300" : "text-fuchsia-600"} />
                            <span className="sm:hidden">Cantos</span>
                            <span className="hidden sm:inline">Evolución de Cantos</span>
                        </button>
                        <button
                            onClick={() => setDashboardSection('general')}
                            className={cn(
                                "px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shrink-0",
                                dashboardSection === 'general'
                                    ? "bg-slate-900 text-white shadow-md"
                                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/80"
                            )}
                        >
                            <TrendingUp size={14} className={dashboardSection === 'general' ? "text-emerald-300" : "text-emerald-600"} />
                            <span className="sm:hidden">Agenda</span>
                            <span className="hidden sm:inline">Visión General & Agenda</span>
                        </button>
                        <button
                            onClick={() => setDashboardSection('todo')}
                            className={cn(
                                "px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shrink-0",
                                dashboardSection === 'todo'
                                    ? "bg-slate-900 text-white shadow-md"
                                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/80"
                            )}
                        >
                            <Layers size={14} className={dashboardSection === 'todo' ? "text-amber-300" : "text-amber-600"} />
                            <span>Todo</span>
                        </button>
                    </div>
                </div>

                {/* KPI BENTO GRID RESPONSIVE */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4 lg:gap-6">
                    {/* Consistencia */}
                    <div className="bg-white/70 backdrop-blur-2xl rounded-2xl sm:rounded-[2rem] p-3 sm:p-5 lg:p-7 shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-slate-900/5 flex flex-col justify-between relative overflow-hidden group hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:-translate-y-0.5 sm:hover:-translate-y-1 transition-all duration-300">
                        <div className="absolute -right-10 -top-10 w-28 h-28 sm:w-32 sm:h-32 bg-emerald-500/10 rounded-full group-hover:scale-150 transition-transform duration-700 blur-3xl pointer-events-none"></div>
                        <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-6 relative z-10">
                            <div className="bg-emerald-50 text-emerald-500 p-1.5 sm:p-2.5 rounded-xl sm:rounded-[1rem] ring-1 ring-emerald-500/10 shrink-0"><Flame size={17} strokeWidth={2.5}/></div>
                            <span className="text-[10px] sm:text-[11px] font-black text-slate-400 uppercase tracking-wider sm:tracking-[0.15em] truncate">Consistencia</span>
                        </div>
                        <div className="mt-auto relative z-10">
                            <div className="flex items-baseline gap-1">
                                <h3 className="text-2xl sm:text-4xl lg:text-5xl font-black text-slate-900 tracking-tight sm:tracking-tighter">{currentStreak}</h3>
                                <span className="text-xs sm:text-lg text-slate-400 font-bold tracking-tight">días</span>
                            </div>
                            <p className="text-[11px] sm:text-[13px] font-bold text-emerald-500 mt-1 sm:mt-2 flex items-center gap-1"><TrendingUp size={12} strokeWidth={2.5}/> Racha activa</p>
                        </div>
                    </div>

                    {/* Cobertura */}
                    <div className="bg-white/70 backdrop-blur-2xl rounded-2xl sm:rounded-[2rem] p-3 sm:p-5 lg:p-7 shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-slate-900/5 flex flex-col justify-between relative overflow-hidden group hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:-translate-y-0.5 sm:hover:-translate-y-1 transition-all duration-300">
                        <div className="absolute -right-10 -top-10 w-28 h-28 sm:w-32 sm:h-32 bg-indigo-500/10 rounded-full group-hover:scale-150 transition-transform duration-700 blur-3xl pointer-events-none"></div>
                        <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-6 relative z-10">
                            <div className="bg-indigo-50 text-indigo-500 p-1.5 sm:p-2.5 rounded-xl sm:rounded-[1rem] ring-1 ring-indigo-500/10 shrink-0"><Layers size={17} strokeWidth={2.5}/></div>
                            <span className="text-[10px] sm:text-[11px] font-black text-slate-400 uppercase tracking-wider sm:tracking-[0.15em] truncate">Cobertura</span>
                        </div>
                        <div className="mt-auto relative z-10">
                            <div className="flex items-baseline gap-1">
                                <h3 className="text-2xl sm:text-4xl lg:text-5xl font-black text-slate-900 tracking-tight sm:tracking-tighter">{totalTopicsStudied}</h3>
                                <span className="text-xs sm:text-lg text-slate-400 font-bold tracking-tight">/ {topics.length}</span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-100 rounded-full mt-2 sm:mt-3 overflow-hidden shadow-inner">
                                <div className="h-full bg-indigo-500 rounded-full shadow-[0_0_10px_rgba(99,102,241,0.5)] transition-all duration-1000" style={{ width: `${globalCompletion}%`}}></div>
                            </div>
                        </div>
                    </div>

                    {/* Horas de Vuelo */}
                    <div className="bg-white/70 backdrop-blur-2xl rounded-2xl sm:rounded-[2rem] p-3 sm:p-5 lg:p-7 shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-slate-900/5 flex flex-col justify-between relative overflow-hidden group hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:-translate-y-0.5 sm:hover:-translate-y-1 transition-all duration-300">
                        <div className="absolute -right-10 -top-10 w-28 h-28 sm:w-32 sm:h-32 bg-blue-500/10 rounded-full group-hover:scale-150 transition-transform duration-700 blur-3xl pointer-events-none"></div>
                        <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-6 relative z-10">
                            <div className="bg-blue-50 text-blue-500 p-1.5 sm:p-2.5 rounded-xl sm:rounded-[1rem] ring-1 ring-blue-500/10 shrink-0"><Clock size={17} strokeWidth={2.5}/></div>
                            <span className="text-[10px] sm:text-[11px] font-black text-slate-400 uppercase tracking-wider sm:tracking-[0.15em] truncate">Horas Vuelo</span>
                        </div>
                        <div className="mt-auto relative z-10">
                            <div className="flex items-baseline gap-0.5 sm:gap-1">
                                <h3 className="text-2xl sm:text-4xl lg:text-5xl font-black text-slate-900 tracking-tight sm:tracking-tighter">{Math.floor(totalTimeHours)}</h3>
                                <span className="text-xs sm:text-lg text-slate-400 font-bold tracking-tight">h</span>
                                <h3 className="text-2xl sm:text-4xl lg:text-5xl font-black text-slate-900 tracking-tight sm:tracking-tighter ml-1">{Math.round((totalTimeHours % 1) * 60)}</h3>
                                <span className="text-xs sm:text-lg text-slate-400 font-bold tracking-tight">m</span>
                            </div>
                            <p className="text-[10px] sm:text-[13px] font-bold text-slate-400 mt-1 sm:mt-2 truncate">Tiempo efectivo</p>
                        </div>
                    </div>

                    {/* Media Cantos */}
                    <div className="bg-white/70 backdrop-blur-2xl rounded-2xl sm:rounded-[2rem] p-3 sm:p-5 lg:p-7 shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-slate-900/5 flex flex-col justify-between relative overflow-hidden group hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:-translate-y-0.5 sm:hover:-translate-y-1 transition-all duration-300">
                        <div className="absolute -right-10 -top-10 w-28 h-28 sm:w-32 sm:h-32 bg-amber-500/10 rounded-full group-hover:scale-150 transition-transform duration-700 blur-3xl pointer-events-none"></div>
                        <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-6 relative z-10">
                            <div className="bg-amber-50 text-amber-500 p-1.5 sm:p-2.5 rounded-xl sm:rounded-[1rem] ring-1 ring-amber-500/10 shrink-0"><Mic size={17} strokeWidth={2.5}/></div>
                            <span className="text-[10px] sm:text-[11px] font-black text-slate-400 uppercase tracking-wider sm:tracking-[0.15em] truncate">Media Cantos</span>
                        </div>
                        <div className="mt-auto relative z-10">
                            <div className="flex items-baseline gap-1">
                                <h3 className="text-2xl sm:text-4xl lg:text-5xl font-black text-slate-900 tracking-tight sm:tracking-tighter">{avgRecentCanto > 0 ? avgRecentCanto.toFixed(1) : '-'}</h3>
                                <span className="text-xs sm:text-lg text-slate-400 font-bold tracking-tight">/ 10</span>
                            </div>
                            <p className="text-[10px] sm:text-[13px] font-bold text-slate-400 mt-1 sm:mt-2 truncate">Últimos 10 simulacros</p>
                        </div>
                    </div>
                </div>
                
                {/* THE CORE ANALYTICS: BENTO GRID */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 auto-rows-auto gap-3 sm:gap-4 lg:gap-6 mt-3 sm:mt-4 lg:mt-6 pb-6 sm:pb-8">
                    
                    {/* SECCIÓN 1: EVOLUCIÓN DE TEMAS (cuando dashboardSection === 'temas' o 'todo') */}
                    {(dashboardSection === 'temas' || dashboardSection === 'todo') && (
                        <div className="md:col-span-2 xl:col-span-3">
                            <TopicsEvolutionSection
                                topics={topics}
                                userProgress={userProgress}
                                rawSessions={rawSessions}
                                onSelectTopic={onSelectTopic}
                            />
                        </div>
                    )}

                    {/* SECCIÓN 2: PLANIFICACIÓN Y VISIÓN GENERAL - PARTE 1 (cuando dashboardSection === 'general' o 'todo') */}
                    {(dashboardSection === 'general' || dashboardSection === 'todo') && (
                        <>
                            {/* 1. Velocity & Trajectory (Burn-up) - Spans 2 cols */}
                    <div className="md:col-span-2 xl:col-span-2 bg-white/70 backdrop-blur-2xl p-3.5 sm:p-6 lg:p-8 rounded-2xl sm:rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-slate-900/5 flex flex-col relative overflow-hidden group hover:-translate-y-1 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-300">
                        <div className="absolute -left-10 -bottom-10 w-40 h-40 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none group-hover:scale-150 transition-transform duration-700"></div>
                        <div className="flex justify-between items-end mb-6 relative z-10">
                            <div>
                                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                                    <TrendingUp size={20} className="text-indigo-500" />
                                    Trayectoria de Estudio (Burn-up)
                                </h3>
                                <p className="text-sm text-slate-500 font-medium mt-1">Temas acumulados vs. Proyección base</p>
                            </div>
                        </div>
                        
                        <div className="w-full h-[280px] relative z-10">
                            {cumulativeProgress.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={cumulativeProgress} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="colorEstudiados" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4}/>
                                                <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e2e8f0" strokeOpacity={0.6} />
                                        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} dy={10} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} />
                                        <Tooltip 
                                            cursor={{ stroke: '#cbd5e1', strokeWidth: 1, strokeDasharray: '4 4' }}
                                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.15)', backgroundColor: 'rgba(255, 255, 255, 0.98)', backdropFilter: 'blur(12px)', padding: '12px 16px' }}
                                            itemStyle={{ fontWeight: 800, fontSize: '13px' }}
                                            labelStyle={{ color: '#64748b', fontSize: '11px', fontWeight: 700, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                                        />
                                        <Area type="monotone" dataKey="estudiados" name="Temas Estudiados" stroke="#6366f1" strokeWidth={4} fill="url(#colorEstudiados)" activeDot={{ r: 6, strokeWidth: 0, fill: '#4f46e5' }} />
                                        <Line type="monotone" dataKey="objetivo" name="Objetivo Teórico" stroke="#cbd5e1" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                                    <Activity size={32} className="mb-2 opacity-20" />
                                    <p className="text-sm font-bold">Registra estudios iniciales para trazar tu trayectoria.</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 2. Smart Action Queue - Spans 1 col, 2 rows on XL */}
                    <div className="md:col-span-1 xl:col-span-1 xl:row-span-2 bg-white/70 backdrop-blur-2xl p-3.5 sm:p-6 lg:p-8 rounded-2xl sm:rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-slate-900/5 flex flex-col relative overflow-hidden group hover:-translate-y-1 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-300">
                        <div className="absolute -right-6 -top-6 w-40 h-40 bg-amber-500/10 rounded-full blur-3xl pointer-events-none group-hover:scale-150 transition-transform duration-700"></div>
                        <div className="relative z-10 flex-1 flex flex-col">
                            <h3 className="text-lg font-black text-slate-900 flex items-center gap-2 mb-1">
                                <Zap size={20} className="text-amber-500" fill="currentColor"/>
                                Agenda Inteligente
                            </h3>
                            <p className="text-sm text-slate-500 font-medium mb-6">Planificación semanal por SRS</p>
                            
                            <div className="space-y-3 flex-1 overflow-y-auto no-scrollbar pr-1">
                                {smartQueue.length > 0 ? (
                                    smartQueue.map((item, idx) => (
                                        <div key={idx} className="bg-white hover:bg-slate-50 border border-slate-100 p-4 rounded-2xl transition-all cursor-pointer group/item shadow-sm hover:shadow-md ring-1 ring-slate-900/5" >
                                            <div className="flex justify-between items-start mb-1.5">
                                                <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 ring-1 ring-slate-900/5 shadow-sm">
                                                    Tema {item.topic.number}
                                                </span>
                                                {item.urgency === 3 && <span className="flex h-2.5 w-2.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]"></span>}
                                                {item.urgency === 2 && <span className="flex h-2.5 w-2.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]"></span>}
                                            </div>
                                            <h4 className="text-sm font-bold text-slate-900 line-clamp-1 group-hover/item:text-indigo-600 transition-colors">
                                                {item.topic.title}
                                            </h4>
                                            <p className={cn("text-xs font-bold mt-2 flex items-center gap-1", item.urgency === 3 ? "text-rose-500" : item.urgency === 2 ? "text-amber-500" : "text-indigo-500")}>
                                                {item.urgency === 3 ? <AlertOctagon size={12}/> : item.urgency === 2 ? <Flame size={12}/> : <Calendar size={12}/>}
                                                {item.reason}
                                            </p>
                                        </div>
                                    ))
                                ) : (
                                    <div className="py-8 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                                        <CheckCircle2 size={32} className="mx-auto text-emerald-500 mb-3 opacity-50" />
                                        <p className="text-sm font-bold text-slate-700">¡Todo al día!</p>
                                        <p className="text-xs text-slate-400 mt-1">No tienes repasos pendientes.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* 3. Forecast Chart - 1 col */}
                    <div className="md:col-span-1 xl:col-span-1 bg-white/70 backdrop-blur-2xl p-3.5 sm:p-6 lg:p-8 rounded-2xl sm:rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-slate-900/5 flex flex-col relative overflow-hidden group hover:-translate-y-1 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-300">
                        <div className="absolute -left-10 -top-10 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl pointer-events-none group-hover:scale-150 transition-transform duration-700"></div>
                        <div className="mb-6 relative z-10">
                            <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                                <BrainCircuit size={20} className="text-blue-500" />
                                Previsión de Carga (SRS)
                            </h3>
                            <p className="text-sm text-slate-500 font-medium mt-1">Temas programados para repaso en 14 días</p>
                        </div>
                        <div className="w-full h-[250px] relative z-10">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={forecastData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" strokeOpacity={0.6} />
                                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b', fontWeight: 700, textTransform: 'uppercase' }} dy={10} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b', fontWeight: 700 }} allowDecimals={false} />
                                    <Tooltip 
                                        cursor={{fill: 'rgba(241, 245, 249, 0.5)'}}
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.15)', backgroundColor: 'rgba(255, 255, 255, 0.98)', backdropFilter: 'blur(12px)', padding: '12px 16px' }}
                                        itemStyle={{ fontWeight: 800, fontSize: '13px' }}
                                        labelStyle={{ color: '#64748b', fontSize: '11px', fontWeight: 700, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                                        formatter={(value) => [value, 'Temas programados']}
                                    />
                                    <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={24}>
                                      {
                                        forecastData.map((entry, index) => (
                                          <Cell key={`cell-${index}`} fill={index === 0 && entry.count > 0 ? '#ef4444' : '#3b82f6'} />
                                        ))
                                      }
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* 4. Balance de Dominio (Radar) - 1 col */}
                    <div className="md:col-span-1 xl:col-span-1 bg-white/70 backdrop-blur-2xl p-3.5 sm:p-6 lg:p-8 rounded-2xl sm:rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-slate-900/5 flex flex-col relative overflow-hidden group hover:-translate-y-1 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-300">
                        <div className="absolute -left-6 -bottom-6 w-32 h-32 bg-rose-500/10 rounded-full blur-3xl pointer-events-none group-hover:scale-150 transition-transform duration-700"></div>
                        <div className="mb-2 relative z-10">
                            <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                                <Target size={20} className="text-rose-500" />
                                Balance de Dominio
                            </h3>
                            <p className="text-sm text-slate-500 font-medium mt-1">Nivel de madurez por bloque</p>
                        </div>
                        
                        <div className="flex-1 w-full min-h-[250px] relative -mt-4 z-10">
                            {radarData.length > 0 && radarData.some(d => parseFloat(d.dominio) > 0) ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                                        <PolarGrid stroke="#e2e8f0" strokeDasharray="4 4" />
                                        <PolarAngleAxis dataKey="materia" tick={{ fill: '#64748b', fontSize: 10, fontWeight: 700 }} />
                                        <PolarRadiusAxis angle={30} domain={[0, 10]} tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} />
                                        <Radar name="Dominio Actual" dataKey="dominio" stroke="#6366f1" strokeWidth={3} fill="#6366f1" fillOpacity={0.2} />
                                        <Radar name="Cobertura" dataKey="cobertura" stroke="#10b981" strokeWidth={2} fill="#10b981" fillOpacity={0.1} strokeDasharray="3 3"/>
                                        <Tooltip
                                                contentStyle={{ borderRadius: '12px', border: '1px solid rgba(226, 232, 240, 0.8)', boxShadow: '0 10px 40px -10px rgba(0, 0, 0, 0.08)', backgroundColor: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(8px)' }}
                                        />
                                    </RadarChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
                                    <Target size={32} className="mb-2 opacity-20" />
                                    <p className="text-sm font-bold text-center px-4">Estudia temas para calcular balance.</p>
                                </div>
                            )}
                        </div>
                    </div>
                        </>
                    )}

                    {/* SECCIÓN 3: EVOLUCIÓN DE CANTOS Y ESTADO DE FORMA ACTUAL (cuando dashboardSection === 'cantos' o 'todo') */}
                    {(dashboardSection === 'cantos' || dashboardSection === 'todo') && (
                        <div className="md:col-span-2 xl:col-span-3 bg-white/80 backdrop-blur-2xl p-3 sm:p-5 lg:p-8 rounded-2xl sm:rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-slate-900/5 flex flex-col relative overflow-hidden group hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-300">
                        <div className="absolute -left-12 -bottom-12 w-64 h-64 bg-fuchsia-500/10 rounded-full blur-3xl pointer-events-none group-hover:scale-125 transition-transform duration-700"></div>
                        <div className="absolute -right-12 -top-12 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none group-hover:scale-125 transition-transform duration-700"></div>
                        
                        {/* Header & Controles de Rango */}
                        <div className="mb-3 sm:mb-6 relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-2.5 sm:gap-4 border-b border-slate-100 pb-3 sm:pb-5">
                            <div>
                                <div className="flex items-center gap-2.5 sm:gap-3">
                                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-fuchsia-500 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-fuchsia-500/20 shrink-0">
                                        <Mic size={18} className="sm:w-5 sm:h-5" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight flex flex-wrap items-center gap-1.5 sm:gap-2">
                                            <span>Evolución de Cantos y Estado de Forma</span>
                                            <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-fuchsia-100 text-fuchsia-700 border border-fuchsia-200">
                                                {allCantos.length} {allCantos.length === 1 ? 'canto registrado' : 'cantos registrados'}
                                            </span>
                                        </h3>
                                        <p className="text-[11px] sm:text-sm text-slate-500 font-medium mt-0.5">
                                            Control del cronómetro de tribunal (12–15 min) y progresión de notas a lo largo de tu oposición
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Controles de Rango y Acciones Responsive */}
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto justify-start md:justify-end flex-wrap">
                                {/* Selector de Tema Específico */}
                                {uniqueTopicsInCantos.length > 0 && (
                                    <div className="relative">
                                        <select
                                            value={selectedTopicCantoFilter}
                                            onChange={(e) => setSelectedTopicCantoFilter(e.target.value)}
                                            className="w-full sm:w-auto text-xs font-black bg-white border border-slate-200 hover:border-slate-300 text-slate-800 rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/20 focus:border-fuchsia-500 shadow-2xs cursor-pointer max-w-[190px] sm:max-w-[240px] truncate transition-all"
                                            title="Filtrar cantos por tema específico"
                                        >
                                            <option value="all">🎯 Todos los temas ({allCantos.length})</option>
                                            {uniqueTopicsInCantos.map(t => (
                                                <option key={t.id} value={t.id}>
                                                    Tema {t.number}: {t.title.length > 22 ? t.title.substring(0, 22) + '...' : t.title} ({t.count})
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {/* Selector de Rango Temporal Compacto */}
                                <div className="inline-flex items-center justify-between sm:justify-start bg-slate-100/90 p-0.5 sm:p-1 rounded-xl border border-slate-200/80 text-[11px] sm:text-xs font-bold text-slate-600">
                                    <button 
                                        onClick={() => setCantoTimeRange('all')}
                                        className={cn(
                                            "px-2 sm:px-3 py-1 rounded-lg transition-all flex-1 sm:flex-initial text-center",
                                            cantoTimeRange === 'all' 
                                                ? "bg-white text-slate-900 shadow-sm font-black" 
                                                : "hover:text-slate-900 text-slate-500"
                                        )}
                                    >
                                        <span className="sm:hidden">Todos</span>
                                        <span className="hidden sm:inline">Toda la oposición</span>
                                    </button>
                                    <button 
                                        onClick={() => setCantoTimeRange('30d')}
                                        className={cn(
                                            "px-2 sm:px-3 py-1 rounded-lg transition-all flex-1 sm:flex-initial text-center",
                                            cantoTimeRange === '30d' 
                                                ? "bg-white text-slate-900 shadow-sm font-black" 
                                                : "hover:text-slate-900 text-slate-500"
                                        )}
                                    >
                                        <span className="sm:hidden">30d</span>
                                        <span className="hidden sm:inline">Últimos 30 días</span>
                                    </button>
                                    <button 
                                        onClick={() => setCantoTimeRange('20')}
                                        className={cn(
                                            "px-2 sm:px-3 py-1 rounded-lg transition-all flex-1 sm:flex-initial text-center",
                                            cantoTimeRange === '20' 
                                                ? "bg-white text-slate-900 shadow-sm font-black" 
                                                : "hover:text-slate-900 text-slate-500"
                                        )}
                                    >
                                        <span className="sm:hidden">20</span>
                                        <span className="hidden sm:inline">Últimos 20</span>
                                    </button>
                                    <button 
                                        onClick={() => setCantoTimeRange('10')}
                                        className={cn(
                                            "px-2 sm:px-3 py-1 rounded-lg transition-all flex-1 sm:flex-initial text-center",
                                            cantoTimeRange === '10' 
                                                ? "bg-white text-slate-900 shadow-sm font-black" 
                                                : "hover:text-slate-900 text-slate-500"
                                        )}
                                    >
                                        <span className="sm:hidden">10</span>
                                        <span className="hidden sm:inline">Últimos 10</span>
                                    </button>
                                </div>

                                <div className="flex items-center gap-1.5 sm:gap-2">
                                    {/* Botón Gestionar / Depurar Cantos */}
                                    <button 
                                        onClick={() => setIsManagingCantos(true)}
                                        className="flex-1 sm:flex-initial justify-center px-2.5 sm:px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-black flex items-center gap-1.5 shadow-sm transition-all active:scale-95"
                                        title="Ver historial completo y eliminar duplicados o erróneos"
                                    >
                                        <Sliders size={13} className="text-slate-500" />
                                        Gestionar
                                    </button>

                                    {/* Botón Registrar Canto */}
                                    <button 
                                        onClick={() => setIsLoggingCanto(true)}
                                        className="flex-1 sm:flex-initial justify-center px-3 sm:px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black flex items-center gap-1.5 shadow-sm transition-all active:scale-95"
                                    >
                                        <Plus size={14} className="text-white" />
                                        Registrar Canto
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Vitals del Estado de Forma Actual */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 lg:gap-4 mb-3 sm:mb-6 relative z-10">
                            {/* Card 1: Diagnóstico de Estado de Forma */}
                            <div className="bg-slate-50/80 border border-slate-100 rounded-xl sm:rounded-2xl p-2.5 sm:p-4 flex flex-col justify-between">
                                <div className="flex items-center justify-between gap-1 mb-1 sm:mb-2">
                                    <span className="text-[9px] sm:text-[11px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                        <Activity size={12} className="text-fuchsia-500 shrink-0" />
                                        Estado de Forma
                                    </span>
                                    <span className={cn("text-[9px] sm:text-[10px] font-black px-1.5 py-0.5 rounded-full border truncate max-w-[80px] sm:max-w-none", estadoDeForma.badgeClass)}>
                                        {estadoDeForma.diagnostico}
                                    </span>
                                </div>
                                <div>
                                    <p className="text-[11px] sm:text-xs text-slate-600 font-medium leading-relaxed line-clamp-2 sm:line-clamp-none">
                                        {estadoDeForma.consejo}
                                    </p>
                                </div>
                                {estadoDeForma.diasUltimoCanto !== null && (
                                    <div className="mt-1 sm:mt-2 text-[9px] sm:text-[10px] font-bold text-slate-400">
                                        Último cante: {estadoDeForma.diasUltimoCanto === 0 ? 'hoy' : `hace ${estadoDeForma.diasUltimoCanto}d`}
                                    </div>
                                )}
                            </div>

                            {/* Card 2: Nota Media y Tendencia */}
                            <div className="bg-slate-50/80 border border-slate-100 rounded-xl sm:rounded-2xl p-2.5 sm:p-4 flex flex-col justify-between">
                                <span className="text-[9px] sm:text-[11px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1 mb-1 sm:mb-2">
                                    <Target size={12} className="text-purple-500 shrink-0" />
                                    Nota Media
                                </span>
                                <div className="flex items-baseline gap-1 sm:gap-1.5">
                                    <span className={cn(
                                        "text-xl sm:text-2xl lg:text-3xl font-black tracking-tight",
                                        estadoDeForma.notaMediaReciente >= 8 ? "text-emerald-600" :
                                        estadoDeForma.notaMediaReciente >= 5 ? "text-slate-900" :
                                        estadoDeForma.notaMediaReciente > 0 ? "text-rose-600" : "text-slate-400"
                                    )}>
                                        {estadoDeForma.notaMediaReciente > 0 ? estadoDeForma.notaMediaReciente.toFixed(1) : '—'}
                                    </span>
                                    <span className="text-[10px] sm:text-xs font-bold text-slate-400">/ 10</span>
                                    {estadoDeForma.tendenciaNota !== 0 && (
                                        <span className={cn(
                                            "text-[9px] sm:text-[10px] font-black px-1.5 py-0.5 rounded-full ml-auto",
                                            estadoDeForma.tendenciaNota > 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                                        )}>
                                            {estadoDeForma.tendenciaNota > 0 ? `+${estadoDeForma.tendenciaNota}` : estadoDeForma.tendenciaNota}
                                        </span>
                                    )}
                                </div>
                                <div className="mt-1 sm:mt-2 text-[9px] sm:text-[10px] font-bold text-slate-500 truncate">
                                    Histórica: {estadoDeForma.notaMediaHistorica > 0 ? `${estadoDeForma.notaMediaHistorica.toFixed(1)}/10` : '—'}
                                </div>
                            </div>

                            {/* Card 3: Cronómetro y Ritmo de Exposición */}
                            <div className="bg-slate-50/80 border border-slate-100 rounded-xl sm:rounded-2xl p-2.5 sm:p-4 flex flex-col justify-between">
                                <span className="text-[9px] sm:text-[11px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1 mb-1 sm:mb-2">
                                    <Timer size={12} className="text-emerald-500 shrink-0" />
                                    Ritmo Exposición
                                </span>
                                <div className="flex items-baseline gap-1 sm:gap-1.5">
                                    <span className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900 tracking-tight">
                                        {estadoDeForma.tiempoMedioRecienteMin > 0 || estadoDeForma.tiempoMedioRecienteSec > 0
                                            ? `${estadoDeForma.tiempoMedioRecienteMin}m ${estadoDeForma.tiempoMedioRecienteSec > 0 ? `${estadoDeForma.tiempoMedioRecienteSec}s` : ''}`
                                            : '—'}
                                    </span>
                                </div>
                                <div className="mt-1 sm:mt-2 flex items-center justify-between text-[9px] sm:text-[10px] font-bold">
                                    <span className="text-slate-500">En 11–13:40m:</span>
                                    <span className={cn(
                                        "px-1.5 py-0.5 rounded font-black",
                                        estadoDeForma.porcentajeEnTiempoOptimo >= 70 ? "bg-emerald-100 text-emerald-800" :
                                        estadoDeForma.porcentajeEnTiempoOptimo >= 40 ? "bg-amber-100 text-amber-800" :
                                        "bg-slate-200 text-slate-700"
                                    )}>
                                        {estadoDeForma.porcentajeEnTiempoOptimo}%
                                    </span>
                                </div>
                            </div>

                            {/* Card 4: Tasa de Aprobados y Rigor */}
                            <div className="bg-slate-50/80 border border-slate-100 rounded-xl sm:rounded-2xl p-2.5 sm:p-4 flex flex-col justify-between">
                                <span className="text-[9px] sm:text-[11px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1 mb-1 sm:mb-2">
                                    <Award size={12} className="text-amber-500 shrink-0" />
                                    Efectividad
                                </span>
                                <div className="flex items-baseline gap-1.5">
                                    <span className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900 tracking-tight">
                                        {allCantos.length > 0 ? `${estadoDeForma.aprobadosPorcentaje}%` : '—'}
                                    </span>
                                    <span className="text-[10px] sm:text-xs font-bold text-slate-400">aprobados</span>
                                </div>
                                <div className="mt-1 sm:mt-2 text-[9px] sm:text-[10px] font-bold text-slate-500 truncate" title="Para aprobar: nota ≥ 5.0 y duración entre 11:00 y 13:40 min">
                                    Nota ≥ 5 en 11–13:40m
                                </div>
                            </div>
                        </div>

                        {/* Gráfico Dual Recharts */}
                        <div className="w-full relative z-10">
                            {cantosChartData.length > 0 ? (
                                <>
                                    {cantosChartData.length > 16 && (
                                        <div className="flex sm:hidden items-center justify-between text-[10px] font-bold text-slate-400 mb-1.5 px-0.5">
                                            <span>{cantosChartData.length} cantes en el gráfico</span>
                                            <span className="flex items-center gap-1 text-indigo-600 bg-indigo-50/90 border border-indigo-100 px-2 py-0.5 rounded-full font-black">
                                                Desliza para ver todo →
                                            </span>
                                        </div>
                                    )}
                                    <div className="w-full overflow-x-auto no-scrollbar overscroll-x-contain">
                                        <div 
                                            className="h-[270px] sm:h-[320px]"
                                            style={{
                                                minWidth: cantosChartData.length > 12 ? `${Math.max(100, cantosChartData.length * 36)}px` : '100%',
                                                width: '100%'
                                            }}
                                        >
                                            <ResponsiveContainer width="100%" height="100%">
                                                <ComposedChart data={cantosChartData} margin={{ top: 15, right: 4, left: -22, bottom: 4 }}>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" strokeOpacity={0.6} />
                                                    
                                                    <XAxis 
                                                        dataKey="cantoNum" 
                                                        axisLine={false} 
                                                        tickLine={false} 
                                                        interval={0}
                                                        tick={({ x, y, payload }) => {
                                                            const item = cantosChartData.find(d => d.cantoNum === payload.value) || cantosChartData[payload.index];
                                                            if (!item) return null;
                                                            return (
                                                                <g transform={`translate(${x},${y})`}>
                                                                    <text x={0} y={0} dy={10} textAnchor="middle" fill="#0f172a" fontSize={9.5} fontWeight={800}>
                                                                        T.{item.topicNumber}
                                                                    </text>
                                                                    <text x={0} y={0} dy={21} textAnchor="middle" fill="#94a3b8" fontSize={8} fontWeight={600}>
                                                                        #{item.cantoNum}
                                                                    </text>
                                                                </g>
                                                            );
                                                        }}
                                                        height={32}
                                                    />
                                                    
                                                    {/* Eje Izquierdo: Tiempo en minutos */}
                                                    <YAxis 
                                                        yAxisId="left" 
                                                        axisLine={false} 
                                                        tickLine={false} 
                                                        unit="m"
                                                        width={26}
                                                        domain={[0, (dataMax: number) => Math.max(18, Math.ceil((dataMax || 15) + 2))]}
                                                        tick={{ fontSize: 9, fill: '#64748b', fontWeight: 700 }} 
                                                    />
                                                    
                                                    {/* Eje Derecho: Calificación de 0 a 10 */}
                                                    <YAxis 
                                                        yAxisId="right" 
                                                        orientation="right" 
                                                        domain={[0, 10]} 
                                                        ticks={[0, 2.5, 5, 7.5, 10]}
                                                        axisLine={false} 
                                                        tickLine={false} 
                                                        width={22}
                                                        tick={{ fontSize: 9, fill: '#8b5cf6', fontWeight: 700 }} 
                                                    />
                                                    
                                                    {/* Línea de Referencia Máximo Oficial Aprobado (13:40 min = 13.67 min) */}
                                                    <ReferenceLine 
                                                        yAxisId="left" 
                                                        y={13.67} 
                                                        stroke="#f43f5e" 
                                                        strokeDasharray="4 4" 
                                                        strokeWidth={1.5} 
                                                        label={{ value: 'Máx. 13:40 (Suspenso)', position: 'insideTopLeft', fill: '#e11d48', fontSize: 9, fontWeight: 800 }} 
                                                    />

                                                    {/* Línea de Referencia Mínimo Oficial (11:00 min) */}
                                                    <ReferenceLine 
                                                        yAxisId="left" 
                                                        y={11} 
                                                        stroke="#10b981" 
                                                        strokeDasharray="4 4" 
                                                        strokeWidth={1.5} 
                                                        label={{ value: 'Mín. 11:00', position: 'insideBottomLeft', fill: '#059669', fontSize: 9, fontWeight: 800 }} 
                                                    />
                                                    
                                                    {/* Línea de Referencia Aprobado (5.0) */}
                                                    <ReferenceLine 
                                                        yAxisId="right" 
                                                        y={5} 
                                                        stroke="#8b5cf6" 
                                                        strokeDasharray="3 3" 
                                                        strokeWidth={1.5} 
                                                        strokeOpacity={0.6}
                                                        label={{ value: 'Aprobado 5.0', position: 'insideBottomRight', fill: '#7c3aed', fontSize: 9, fontWeight: 800 }} 
                                                    />
                                                    
                                                    <Tooltip 
                                                        content={({ active, payload }) => {
                                                            if (active && payload && payload.length) {
                                                                const data = payload[0].payload as any;
                                                                return (
                                                                    <div className="bg-white/95 backdrop-blur-md p-3.5 rounded-2xl shadow-xl border border-slate-200/80 text-xs min-w-[240px] max-w-[320px] z-50 animate-in fade-in duration-150">
                                                                        <div className="border-b border-slate-100 pb-2 mb-2">
                                                                            <div className="flex items-center justify-between gap-2 mb-1.5">
                                                                                <span className="inline-flex items-center gap-1 bg-indigo-50 border border-indigo-200/80 text-indigo-700 font-black text-xs px-2.5 py-0.5 rounded-lg shadow-2xs">
                                                                                    <BookOpen size={11} className="text-indigo-600" />
                                                                                    Tema {data.topicNumber || data.temaNumero}
                                                                                </span>
                                                                                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                                                                    #{data.cantoNum || data.index} · {data.tipoLabel}
                                                                                </span>
                                                                            </div>
                                                                            <span className="font-extrabold text-slate-900 block text-xs leading-snug truncate" title={data.topicTitle || data.temaTitulo}>
                                                                                {data.topicTitle || data.temaTitulo || `Tema ${data.topicNumber || data.temaNumero}`}
                                                                            </span>
                                                                            <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold mt-1">
                                                                                <span>{data.fechaStr || data.fecha}</span>
                                                                                <span className="text-slate-500 font-medium">Exposición oral</span>
                                                                            </div>
                                                                        </div>
                                                                        <div className="space-y-1.5">
                                                                            <div className="flex items-center justify-between">
                                                                                <span className="text-slate-500 font-medium flex items-center gap-1">
                                                                                    <Clock size={12} className="text-emerald-500" />
                                                                                    Tiempo:
                                                                                </span>
                                                                                <div className="flex items-center gap-1.5">
                                                                                    <span className="font-black text-slate-900">{data.duracionStr}</span>
                                                                                    <span className={cn(
                                                                                        "text-[9px] font-black px-1.5 py-0.5 rounded-md border",
                                                                                        data.isOptimal ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                                                                                        data.isExcess ? "bg-rose-50 text-rose-700 border-rose-200" :
                                                                                        "bg-amber-50 text-amber-700 border-amber-200"
                                                                                    )}>
                                                                                        {data.isOptimal ? "11:00–13:40m (Válido)" : data.isExcess ? ">13:40m (Exceso/Suspenso)" : "<11m (Breve)"}
                                                                                    </span>
                                                                                </div>
                                                                            </div>
                                                                            <div className="flex items-center justify-between">
                                                                                <span className="text-slate-500 font-medium flex items-center gap-1">
                                                                                    <Target size={12} className="text-purple-500" />
                                                                                    Calificación:
                                                                                </span>
                                                                                <div className="flex items-center gap-1.5">
                                                                                    {data.nota !== null ? (
                                                                                        <span className={cn(
                                                                                            "font-black px-2 py-0.5 rounded-lg text-[11px]",
                                                                                            data.nota >= 8 ? "bg-emerald-100 text-emerald-800" :
                                                                                            data.nota >= 5 ? "bg-blue-100 text-blue-800" :
                                                                                            "bg-rose-100 text-rose-800"
                                                                                        )}>
                                                                                            {data.nota.toFixed(1)} / 10
                                                                                        </span>
                                                                                    ) : (
                                                                                        <span className="text-slate-400 italic">Sin nota</span>
                                                                                    )}
                                                                                    {data.nota !== null && (
                                                                                        <span className={cn(
                                                                                            "text-[9px] font-black px-1.5 py-0.5 rounded-md border",
                                                                                            data.estadoCanteClass
                                                                                        )}>
                                                                                            {data.estadoCante}
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                            {data.mistakes && (
                                                                                <div className="mt-2 pt-2 border-t border-slate-100 text-slate-600">
                                                                                    <span className="text-[10px] font-bold text-rose-500 uppercase tracking-wider block mb-0.5">Fallos / Observaciones:</span>
                                                                                    <p className="text-[11px] leading-relaxed italic bg-rose-50/50 p-1.5 rounded-lg border border-rose-100">
                                                                                        {data.mistakes}
                                                                                    </p>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            }
                                                            return null;
                                                        }}
                                                    />

                                                    {/* BARRAS: Tiempo empleado en minutos */}
                                                    <Bar 
                                                        yAxisId="left" 
                                                        dataKey="duracion" 
                                                        name="Tiempo (min)" 
                                                        radius={[4, 4, 0, 0]} 
                                                        barSize={cantosChartData.length > 30 ? 10 : cantosChartData.length > 15 ? 14 : 22}
                                                    >
                                                        {cantosChartData.map((entry, index) => {
                                                            let color = "#10b981"; // Óptimo
                                                            if (entry.isExcess) color = "#f43f5e"; // Exceso
                                                            else if (entry.isShort) color = "#f59e0b"; // Corto
                                                            return (
                                                                <Cell key={`bar-${index}`} fill={color} fillOpacity={0.75} />
                                                            );
                                                        })}
                                                    </Bar>

                                                    {/* LÍNEA: Calificación (Nota 0-10) */}
                                                    <Line 
                                                        yAxisId="right" 
                                                        type="monotone" 
                                                        dataKey="nota" 
                                                        name="Nota (0-10)" 
                                                        stroke="#8b5cf6" 
                                                        strokeWidth={2.5} 
                                                        dot={{ r: cantosChartData.length > 35 ? 2.5 : 3.5, fill: '#8b5cf6', strokeWidth: 1.5, stroke: '#ffffff' }} 
                                                        activeDot={{ r: 6, strokeWidth: 2, stroke: '#ffffff', fill: '#7c3aed' }} 
                                                        connectNulls 
                                                    />
                                                </ComposedChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="w-full h-full min-h-[200px] flex flex-col items-center justify-center text-slate-400 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 p-6">
                                    <Mic size={36} className="mb-2 opacity-25 text-fuchsia-500" />
                                    <p className="text-sm font-bold text-slate-700">No hay cantos registrados en este rango temporal.</p>
                                    <p className="text-xs text-slate-400 mt-1 max-w-sm text-center">Haz clic en "+ Registrar Canto" para asentar tu primer cante o cámbia el filtro a "Toda la oposición".</p>
                                </div>
                            )}
                        </div>

                        {/* Leyenda interactiva e informativa Responsive */}
                        <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 sm:gap-3 text-[10px] sm:text-[11px] font-bold text-slate-500 relative z-10">
                            <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                                <span className="flex items-center gap-1 sm:gap-1.5">
                                    <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-sm bg-emerald-500"></span>
                                    <span>Válido (11:00–13:40 min)</span>
                                </span>
                                <span className="flex items-center gap-1 sm:gap-1.5">
                                    <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-sm bg-rose-500"></span>
                                    <span>Exceso (&gt;13:40 min ➔ Suspenso)</span>
                                </span>
                                <span className="flex items-center gap-1 sm:gap-1.5">
                                    <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-sm bg-amber-500"></span>
                                    <span>Breve (&lt;11 min)</span>
                                </span>
                                <span className="flex items-center gap-1 sm:gap-1.5">
                                    <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-purple-500 ring-2 ring-white"></span>
                                    <span>Nota (≥5.0 para aprobar)</span>
                                </span>
                            </div>

                            <span className="text-slate-400 font-medium text-[10px] sm:text-xs">
                                Mostrando {cantosChartData.length} de {allCantos.length} cantes
                            </span>
                        </div>
                    </div>
                    )}

                    {/* SECCIÓN 4: PLANIFICACIÓN Y VISIÓN GENERAL - PARTE 2 (cuando dashboardSection === 'general' o 'todo') */}
                    {(dashboardSection === 'general' || dashboardSection === 'todo') && (
                        <>
                            {/* Historial de Refrescos - 3 cols */}
                            <div className="md:col-span-2 xl:col-span-3 bg-white/70 backdrop-blur-2xl p-3.5 sm:p-6 lg:p-8 rounded-2xl sm:rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-slate-900/5 flex flex-col relative overflow-hidden group hover:-translate-y-1 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-300">
                        <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none group-hover:scale-150 transition-transform duration-700"></div>
                        <div className="mb-6 relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                            <div>
                                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                                    <Layers size={20} className="text-cyan-500" />
                                    Historial de Refrescos
                                </h3>
                                <p className="text-sm text-slate-500 font-medium mt-1">Volumen de refrescos diarios en los últimos 14 días</p>
                            </div>
                        </div>
                        <div className="w-full h-[220px] relative z-10">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={repasosData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorRepasos" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4}/>
                                            <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" strokeOpacity={0.6} />
                                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b', fontWeight: 700 }} dy={10} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b', fontWeight: 700 }} allowDecimals={false} />
                                    <Tooltip 
                                        cursor={{ stroke: '#cbd5e1', strokeWidth: 1, strokeDasharray: '4 4' }}
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.15)', backgroundColor: 'rgba(255, 255, 255, 0.98)', backdropFilter: 'blur(12px)', padding: '12px 16px' }}
                                        labelStyle={{ color: '#64748b', fontSize: '11px', fontWeight: 700, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                                    />
                                    <Area type="monotone" dataKey="count" name="Temas refrescados" stroke="#06b6d4" strokeWidth={3} fill="url(#colorRepasos)" activeDot={{ r: 6, strokeWidth: 0, fill: '#0891b2' }} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

{/* 5. Consistency Heatmap - Full width (3 cols) */}
                    <div className="md:col-span-2 xl:col-span-3 bg-white/70 backdrop-blur-2xl p-3.5 sm:p-6 lg:p-8 rounded-2xl sm:rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-slate-900/5 flex flex-col relative overflow-hidden group hover:-translate-y-1 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-300">
                        <div className="absolute -right-20 -bottom-20 w-60 h-60 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none group-hover:scale-125 transition-transform duration-700"></div>
                        <div className="flex justify-between items-end mb-6 relative z-10">
                            <div>
                                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                                    <Calendar size={20} className="text-emerald-500" />
                                    Mapa de Consistencia
                                </h3>
                                <p className="text-sm text-slate-500 font-medium mt-1">La disciplina vence al talento. Últimos 84 días.</p>
                            </div>
                        </div>
                        
                        <div className="w-full overflow-x-auto no-scrollbar pb-2 relative z-10">
                            <div className="min-w-[700px] flex gap-1.5 items-start">
                                
                                {Array.from({ length: 12 }).map((_, wIdx) => (
                                    <div key={wIdx} className="flex flex-col gap-1.5">
                                        {heatmapData.slice(wIdx * 7, (wIdx + 1) * 7).map((dayData, dIdx) => {
                                            const hasStudied = dayData.duration > 0;
                                            
                                            let intensityClass = "bg-slate-100 ring-1 ring-slate-900/5";
                                            if (hasStudied) {
                                                const duration = dayData.duration;
                                                if (duration > 120) intensityClass = "bg-emerald-700 shadow-sm ring-1 ring-emerald-900/10";
                                                else if (duration > 60) intensityClass = "bg-emerald-500 shadow-sm ring-1 ring-emerald-900/10";
                                                else if (duration > 30) intensityClass = "bg-emerald-400 shadow-sm ring-1 ring-emerald-900/10";
                                                else intensityClass = "bg-emerald-200 shadow-sm ring-1 ring-emerald-900/10";
                                            }
                                            
                                            return (
                                                <div 
                                                    key={dayData.date} 
                                                    className={cn("w-3.5 h-3.5 rounded-sm transition-all group/day relative cursor-help hover:ring-2 hover:ring-indigo-500 hover:ring-offset-1 z-10 hover:z-20", intensityClass)}
                                                >
                                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-900 text-white text-[10px] font-bold rounded opacity-0 group-hover/day:opacity-100 pointer-events-none whitespace-nowrap z-50">
                                                        {dayData.date}: {hasStudied ? dayData.duration + ' min' : 'Sin registro'}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="mt-4 flex items-center justify-end gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest relative z-10">
                            <span>Menos</span>
                            <div className="w-3 h-3 rounded-sm bg-slate-100 ring-1 ring-slate-900/5"></div>
                            <div className="w-3 h-3 rounded-sm bg-emerald-200 ring-1 ring-emerald-900/10"></div>
                            <div className="w-3 h-3 rounded-sm bg-emerald-400 ring-1 ring-emerald-900/10"></div>
                            <div className="w-3 h-3 rounded-sm bg-emerald-500 ring-1 ring-emerald-900/10"></div>
                            <div className="w-3 h-3 rounded-sm bg-emerald-700 ring-1 ring-emerald-900/10"></div>
                            <span>Más</span>
                        </div>
                    </div>

                    {/* 6. Calendario de Trayectoria */}
                    <div className="md:col-span-2 xl:col-span-3 bg-white/70 backdrop-blur-2xl p-3.5 sm:p-6 lg:p-8 rounded-2xl sm:rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-slate-900/5 flex flex-col relative overflow-hidden group hover:-translate-y-1 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-300">
                        <div className="absolute -left-20 -bottom-20 w-60 h-60 bg-blue-500/5 rounded-full blur-3xl pointer-events-none group-hover:scale-125 transition-transform duration-700"></div>
                        
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 relative z-10 gap-4">
                            <div>
                                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                                    <Calendar size={20} className="text-blue-500" />
                                    Diario de Trayectoria
                                </h3>
                                <p className="text-sm text-slate-500 font-medium mt-1">Tu organización e histórico detallado mensual.</p>
                            </div>
                            
                            <div className="flex items-center gap-3">
                                {/* Filters */}
                                <div className="flex items-center bg-slate-100 p-1 rounded-xl">
                                    <button onClick={() => setDifficultyFilter('all')} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${difficultyFilter === 'all' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>Todos</button>
                                    <button onClick={() => setDifficultyFilter('hard')} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${difficultyFilter === 'hard' ? 'bg-rose-50 shadow-sm text-rose-600' : 'text-slate-500 hover:text-rose-600'}`}>Difícil</button>
                                    <button onClick={() => setDifficultyFilter('medium')} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${difficultyFilter === 'medium' ? 'bg-amber-50 shadow-sm text-amber-600' : 'text-slate-500 hover:text-amber-600'}`}>Medio</button>
                                    <button onClick={() => setDifficultyFilter('easy')} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${difficultyFilter === 'easy' ? 'bg-emerald-50 shadow-sm text-emerald-600' : 'text-slate-500 hover:text-emerald-600'}`}>Fácil</button>
                                </div>
                                
                                {/* Nav */}
                                <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
                                    <button onClick={prevMonth} className="p-1.5 hover:bg-white rounded-lg transition-colors text-slate-600"><ChevronLeft size={16} /></button>
                                    <span className="text-xs font-bold w-24 text-center text-slate-800 uppercase tracking-wide">
                                        {monthNames[calendarDate.getMonth()]} {calendarDate.getFullYear()}
                                    </span>
                                    <button onClick={nextMonth} className="p-1.5 hover:bg-white rounded-lg transition-colors text-slate-600"><ChevronRight size={16} /></button>
                                </div>
                            </div>
                        </div>
                        
                        <div className="relative z-10 border-l border-t border-slate-100 rounded-2xl overflow-hidden bg-white/50">
                            {/* Days Header */}
                            <div className="grid grid-cols-7 bg-slate-50/80 border-b border-slate-100">
                                {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map(d => (
                                    <div key={d} className="px-2 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest border-r border-slate-100 last:border-r-0">
                                        <span className="hidden sm:inline">{d}</span>
                                        <span className="sm:hidden">{d.slice(0,1)}</span>
                                    </div>
                                ))}
                            </div>
                            
                            {/* Grid */}
                            <div className="grid grid-cols-7">
                                {calendarGrid.map((day, idx) => {
                                    // Make local copy of date and format properly
                                    const y = day.dateObj.getFullYear();
                                    const m = String(day.dateObj.getMonth() + 1).padStart(2, '0');
                                    const d = String(day.dateObj.getDate()).padStart(2, '0');
                                    const dStr = `${y}-${m}-${d}`;
                                    
                                    const daySessions = sessionsByDate[dStr] || [];
                                    const hasSessions = daySessions.length > 0;
                                    
                                    return (
                                        <div key={idx} className={cn(
                                            "min-h-[100px] sm:min-h-[120px] p-1.5 sm:p-2.5 border-r border-b border-slate-100 flex flex-col relative group/cell transition-colors",
                                            day.isCurrentMonth ? "bg-white/80 hover:bg-slate-50" : "bg-slate-50/40"
                                        )}>
                                            <div className="flex justify-between items-start mb-2">
                                                <span className={cn(
                                                    "text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full",
                                                    day.isCurrentMonth 
                                                        ? (hasSessions ? "bg-indigo-600 text-white shadow-sm" : "text-slate-700") 
                                                        : "text-slate-400"
                                                )}>
                                                    {day.dateObj.getDate()}
                                                </span>
                                                {hasSessions && (
                                                    <span className="text-[10px] font-bold text-indigo-500 bg-indigo-50/80 px-1.5 py-0.5 rounded-md border border-indigo-100/50 hidden sm:block">
                                                        {daySessions.length} {daySessions.length === 1 ? 'sesión' : 'sesiones'}
                                                    </span>
                                                )}
                                            </div>
                                            
                                            <div className="flex-1 flex flex-col gap-1.5 overflow-y-auto no-scrollbar">
                                                {daySessions.map((s, sIdx) => {
                                                    const topic = topics.find(t => t.id === s.topicId);
                                                    
                                                    let diffColor = "bg-slate-100 text-slate-600 border-slate-200/60";
                                                    if (s.difficulty >= 8) diffColor = "bg-rose-50 text-rose-700 border-rose-200";
                                                    else if (s.difficulty >= 5) diffColor = "bg-amber-50 text-amber-700 border-amber-200";
                                                    else if (s.difficulty > 0) diffColor = "bg-emerald-50 text-emerald-700 border-emerald-200";
                                                    
                                                    const typeMap = {
                                                        estudio_inicial: 'Estudio',
                                                        repaso: 'Repaso',
                                                        refresco: 'Refresco',
                                                        canto: 'Canto',
                                                        simulacro: 'Simulacro'
                                                    };
                                                    
                                                    return (
                                                        <div key={sIdx} className={cn(
                                                            "text-[9px] sm:text-[10px] font-bold px-1.5 py-1 rounded-md border leading-tight truncate cursor-default transition-transform hover:scale-[1.02]",
                                                            diffColor
                                                        )} title={`Tema ${topic?.number || '?'}: ${typeMap[s.type as keyof typeof typeMap] || s.type} | ${s.duration} min${s.difficulty ? ` | Dif: ${s.difficulty}/10` : ''}`}>
                                                            T{topic?.number || '?'} • {typeMap[s.type as keyof typeof typeMap] || s.type}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                        </>
                    )}
                </div>
            </div>

            {/* MODAL 1: GESTIÓN Y DEPURACIÓN DE CANTOS */}
            {isManagingCantos && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[85vh] shadow-2xl border border-slate-200/80 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                        {/* Header */}
                        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-fuchsia-100 text-fuchsia-600 flex items-center justify-center">
                                    <Mic size={20} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-black text-slate-900">Historial y Depuración de Cantos</h3>
                                    <p className="text-xs text-slate-500 font-medium">Revisa todos los cantes de tu oposición y elimina registros duplicados o incorrectos</p>
                                </div>
                            </div>
                            <button 
                                onClick={() => setIsManagingCantos(false)}
                                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        {/* Search & Actions Bar */}
                        <div className="px-6 py-3 border-b border-slate-100 bg-white flex items-center justify-between gap-4">
                            <div className="relative flex-1">
                                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input 
                                    type="text"
                                    value={cantoSearchTerm}
                                    onChange={(e) => setCantoSearchTerm(e.target.value)}
                                    placeholder="Buscar por tema (ej. 14), título o fecha..."
                                    className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/20 focus:border-fuchsia-500"
                                />
                                {cantoSearchTerm && (
                                    <button 
                                        onClick={() => setCantoSearchTerm('')}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                                    >
                                        <X size={13} />
                                    </button>
                                )}
                            </div>
                            <div className="text-xs font-bold text-slate-400 whitespace-nowrap">
                                Total: {allCantos.length} cantes
                            </div>
                        </div>

                        {/* List */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-2.5">
                            {(() => {
                                const term = cantoSearchTerm.toLowerCase().trim();
                                const filtered = allCantos
                                    .slice()
                                    .reverse()
                                    .filter(c => {
                                        if (!term) return true;
                                        return (
                                            c.topicNumber.toString().includes(term) ||
                                            c.topicTitle.toLowerCase().includes(term) ||
                                            c.date.includes(term) ||
                                            (c.mistakes && c.mistakes.toLowerCase().includes(term))
                                        );
                                    });

                                if (filtered.length === 0) {
                                    return (
                                        <div className="text-center py-12 text-slate-400">
                                            <Mic size={32} className="mx-auto mb-2 opacity-30 text-fuchsia-500" />
                                            <p className="text-sm font-bold text-slate-600">No se han encontrado cantes</p>
                                            <p className="text-xs text-slate-400 mt-1">Prueba con otro término de búsqueda.</p>
                                        </div>
                                    );
                                }

                                return filtered.map((c, idx) => {
                                    // Detección de posibles duplicados (mismo tema y misma fecha)
                                    const isPotentialDuplicate = allCantos.filter(other => 
                                        other.id !== c.id && 
                                        other.topicId === c.topicId && 
                                        other.date === c.date
                                    ).length > 0;

                                    return (
                                        <div 
                                            key={c.id} 
                                            className={cn(
                                                "p-3.5 rounded-2xl border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3",
                                                isPotentialDuplicate 
                                                    ? "bg-amber-50/40 border-amber-200/80 hover:bg-amber-50/70" 
                                                    : "bg-slate-50/60 border-slate-200/70 hover:bg-slate-50"
                                            )}
                                        >
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                                    <span className="font-black text-slate-900 text-xs px-2 py-0.5 rounded-md bg-white border border-slate-200 shadow-2xs">
                                                        Tema {c.topicNumber}
                                                    </span>
                                                    <span className="text-xs font-bold text-slate-500">
                                                        {new Date(c.date).toLocaleDateString("es-ES", { day: '2-digit', month: 'short', year: 'numeric' })}
                                                    </span>
                                                    {isPotentialDuplicate && (
                                                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
                                                            <AlertTriangle size={10} />
                                                            Mismo tema y fecha
                                                        </span>
                                                    )}
                                                </div>
                                                <h4 className="text-xs font-bold text-slate-700 truncate" title={c.topicTitle}>
                                                    {c.topicTitle}
                                                </h4>
                                                {c.mistakes && (
                                                    <p className="text-[11px] text-slate-500 mt-1 italic line-clamp-1 bg-white/60 px-2 py-0.5 rounded border border-slate-100">
                                                        "{c.mistakes}"
                                                    </p>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                                                {/* Duración */}
                                                <div className="text-right">
                                                    <span className="text-xs font-black text-slate-900 block">
                                                        {c.durationMinutes}m {c.durationSeconds > 0 ? `${c.durationSeconds}s` : ''}
                                                    </span>
                                                    {(() => {
                                                        const s = c.durationMinutes * 60 + c.durationSeconds;
                                                        const isOpt = s >= 660 && s <= 820;
                                                        const isExc = s > 820;
                                                        return (
                                                            <span className={cn(
                                                                "text-[10px] font-bold block",
                                                                isOpt ? "text-emerald-600 font-black" : isExc ? "text-rose-600 font-extrabold" : "text-amber-600 font-bold"
                                                            )}>
                                                                {isOpt ? '11–13:40m' : isExc ? '>13:40 Exceso' : '<11m Breve'}
                                                            </span>
                                                        );
                                                    })()}
                                                </div>

                                                {/* Nota y Aprobado / Suspenso */}
                                                <div className="text-center min-w-[70px]">
                                                    {c.grade !== null ? (
                                                        (() => {
                                                            const s = c.durationMinutes * 60 + c.durationSeconds;
                                                            const isOpt = s >= 660 && s <= 820;
                                                            const isApproved = c.grade >= 5 && isOpt;
                                                            const isExc = s > 820;
                                                            const isShort = s < 660;

                                                            return (
                                                                <div className="flex flex-col items-center">
                                                                    <span className={cn(
                                                                        "text-xs font-black px-2 py-0.5 rounded-lg block w-full",
                                                                        c.grade >= 8 ? "bg-emerald-100 text-emerald-800" :
                                                                        c.grade >= 5 ? "bg-blue-100 text-blue-800" :
                                                                        "bg-rose-100 text-rose-800"
                                                                    )}>
                                                                        {c.grade.toFixed(1)}
                                                                    </span>
                                                                    <span className={cn(
                                                                        "text-[9px] font-black mt-0.5",
                                                                        isApproved ? "text-emerald-700" : "text-rose-600"
                                                                    )}>
                                                                        {isApproved ? "Aprobado" : isExc ? "Suspenso (>13:40)" : isShort ? "Suspenso (<11m)" : "Suspenso"}
                                                                    </span>
                                                                </div>
                                                            );
                                                        })()
                                                    ) : (
                                                        <span className="text-[10px] text-slate-400 font-bold italic block">Sin nota</span>
                                                    )}
                                                </div>

                                                {/* Eliminar Canto */}
                                                <button 
                                                    onClick={() => handleDeleteCanto(c.topicId, c.id)}
                                                    disabled={deletingSessionId === c.id}
                                                    className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-100 transition-all disabled:opacity-50"
                                                    title="Eliminar este cante del registro"
                                                >
                                                    <Trash2 size={15} />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                });
                            })()}
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex justify-end">
                            <button 
                                onClick={() => setIsManagingCantos(false)}
                                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black transition-all"
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL 2: REGISTRO RÁPIDO DE CANTO */}
            {isLoggingCanto && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200/80 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                        {/* Header */}
                        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-fuchsia-500 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-fuchsia-500/20">
                                    <Mic size={20} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-black text-slate-900">Registrar Canto Oral</h3>
                                    <p className="text-xs text-slate-500 font-medium">Asienta tiempo y nota para alimentar tu estado de forma</p>
                                </div>
                            </div>
                            <button 
                                onClick={() => setIsLoggingCanto(false)}
                                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        {/* Form Body */}
                        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                            {/* Selector de Tema */}
                            <div>
                                <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1.5">
                                    Tema cantado *
                                </label>
                                <select 
                                    value={newCantoTopicId}
                                    onChange={(e) => setNewCantoTopicId(e.target.value)}
                                    className="w-full p-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/20 focus:border-fuchsia-500 bg-white"
                                >
                                    <option value="">-- Selecciona un tema --</option>
                                    {allTopics.map(t => (
                                        <option key={t.id} value={t.id}>
                                            Tema {t.number}: {t.title}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Fecha */}
                            <div>
                                <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1.5">
                                    Fecha del cante *
                                </label>
                                <input 
                                    type="date"
                                    value={newCantoDate}
                                    onChange={(e) => setNewCantoDate(e.target.value)}
                                    className="w-full p-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/20 focus:border-fuchsia-500"
                                />
                            </div>

                            {/* Cronómetro (Minutos y Segundos) */}
                            <div>
                                <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1.5">
                                    Tiempo de exposición (Cronómetro) *
                                </label>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <div className="relative">
                                            <input 
                                                type="number"
                                                min="0"
                                                max="60"
                                                value={newCantoMin}
                                                onChange={(e) => setNewCantoMin(e.target.value)}
                                                className="w-full p-2.5 pr-10 rounded-xl border border-slate-200 text-sm font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/20 focus:border-fuchsia-500"
                                                placeholder="14"
                                            />
                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">min</span>
                                        </div>
                                    </div>
                                    <div>
                                        <div className="relative">
                                            <input 
                                                type="number"
                                                min="0"
                                                max="59"
                                                value={newCantoSec}
                                                onChange={(e) => setNewCantoSec(e.target.value)}
                                                className="w-full p-2.5 pr-10 rounded-xl border border-slate-200 text-sm font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/20 focus:border-fuchsia-500"
                                                placeholder="00"
                                            />
                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">seg</span>
                                        </div>
                                    </div>
                                </div>
                                <p className="text-[11px] text-slate-400 mt-1 font-medium">Ventana oficial de tribunal: entre 11:00 y 13:40 min (más de 13:40 es suspenso).</p>
                            </div>

                            {/* Calificación (Nota 0-10) */}
                            <div>
                                <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1.5">
                                    Calificación estimada / nota del preparador (0 a 10) *
                                </label>
                                <div className="flex items-center gap-2 mb-2">
                                    <input 
                                        type="number"
                                        min="0"
                                        max="10"
                                        step="0.1"
                                        value={newCantoGrade}
                                        onChange={(e) => setNewCantoGrade(e.target.value)}
                                        className="w-24 p-2.5 rounded-xl border border-slate-200 text-sm font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/20 focus:border-fuchsia-500"
                                        placeholder="7.5"
                                    />
                                    <div className="flex gap-1 flex-wrap">
                                        {[5, 6, 7, 8, 9, 10].map(val => (
                                            <button 
                                                key={val}
                                                type="button"
                                                onClick={() => setNewCantoGrade(val.toString())}
                                                className={cn(
                                                    "px-2.5 py-1 rounded-lg text-xs font-bold border transition-all",
                                                    parseFloat(newCantoGrade) === val 
                                                        ? "bg-purple-100 text-purple-800 border-purple-300 font-black" 
                                                        : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                                                )}
                                            >
                                                {val}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Fallos / Observaciones del tribunal */}
                            <div>
                                <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1.5">
                                    Fallos / Observaciones del preparador
                                </label>
                                <textarea 
                                    value={newCantoMistakes}
                                    onChange={(e) => setNewCantoMistakes(e.target.value)}
                                    placeholder="Ej: He dudado en el art. 14 CE, buena introducción pero aceleré al final..."
                                    rows={3}
                                    className="w-full p-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/20 focus:border-fuchsia-500"
                                />
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-2">
                            <button 
                                onClick={() => setIsLoggingCanto(false)}
                                className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all"
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={handleSaveNewCanto}
                                disabled={isSavingCanto}
                                className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black transition-all flex items-center gap-1.5 disabled:opacity-50"
                            >
                                {isSavingCanto ? (
                                    <>
                                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                        Guardando...
                                    </>
                                ) : (
                                    <>
                                        <Check size={14} />
                                        Guardar Canto
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
