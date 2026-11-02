import { useState, useMemo } from "react";
import { Topic } from "../types";
import { toast } from "sonner";
import { BookOpen, Mic, TrendingUp, Layers, Activity, Sparkles, Target } from "lucide-react";
import { cn, getLocalDateString } from "../lib/utils";
import { calculateNextSRSState } from "../lib/srs";
import { useFirebase } from "../lib/FirebaseProvider";
import { initialTopics } from "../data/initialData";
import { playSound } from "../lib/sound";
import {
  computeTodayActivity,
  computeWeeklyConsistency,
  computeTodayStudyQueue,
  getDailyGoalMinutes,
  setDailyGoalMinutes,
  RecommendedStudyTask,
} from "../lib/recommendationEngine";

// Atomic Subcomponents
import { TopicsEvolutionSection } from "./TopicsEvolutionSection";
import { DashboardHeroKPIs } from "./dashboard/DashboardHeroKPIs";
import { DashboardBurnupChart } from "./dashboard/DashboardBurnupChart";
import { DashboardSmartQueue } from "./dashboard/DashboardSmartQueue";
import { DashboardSRSForecastChart } from "./dashboard/DashboardSRSForecastChart";
import { DashboardDomainRadarChart } from "./dashboard/DashboardDomainRadarChart";
import { DashboardCantoScatterChart } from "./dashboard/DashboardCantoScatterChart";
import { DashboardManageCantosModal } from "./dashboard/DashboardManageCantosModal";
import { DashboardQuickCantoModal } from "./dashboard/DashboardQuickCantoModal";
import { DashboardActivityRingsCard } from "./dashboard/DashboardActivityRingsCard";
import { DashboardWeeklyConsistencyCard } from "./dashboard/DashboardWeeklyConsistencyCard";
import { DashboardTodayRecommender } from "./dashboard/DashboardTodayRecommender";
import { DashboardPreparadorExecutiveCard } from "./dashboard/DashboardPreparadorExecutiveCard";

export function DashboardView({ 
  onSelectTopic,
  onNavigateTab 
}: { 
  onSelectTopic?: (topicId: string) => void;
  onNavigateTab?: (tab: "dashboard" | "temario" | "preparador") => void;
}) {
  const { userProgress, recentSessions, deleteStudySession, addStudySession } = useFirebase();

  // Section switcher: 'hoy' | 'temas' | 'cantos' | 'general' | 'todo'
  const [dashboardSection, setDashboardSection] = useState<"hoy" | "temas" | "cantos" | "general" | "todo">("hoy");

  // Daily Study Goal State (Apple Health style, default 6 hours = 360 min)
  const [dailyGoalMinutes, setDailyGoalMinutesState] = useState<number>(() => getDailyGoalMinutes());

  const handleGoalChange = (newGoal: number) => {
    setDailyGoalMinutesState(newGoal);
    setDailyGoalMinutes(newGoal);
  };

  // Merge initial topics with user custom topics
  const allTopics = useMemo(() => {
    const customList = Object.entries(userProgress || {})
      .filter(([_, data]: [string, any]) => data.isCustom && !data.isDeleted)
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

  // Cantos Filters & Modals
  const [cantoTimeRange, setCantoTimeRange] = useState<"all" | "30d" | "20" | "10">("all");
  const [selectedTopicCantoFilter, setSelectedTopicCantoFilter] = useState<string>("all");
  const [isManagingCantos, setIsManagingCantos] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [isLoggingCanto, setIsLoggingCanto] = useState(false);
  const [cantoModalMode, setCantoModalMode] = useState<"simulator" | "manual">("simulator");
  const [activeModalTopicId, setActiveModalTopicId] = useState<string | undefined>(undefined);
  const [isSavingCanto, setIsSavingCanto] = useState(false);

  // --- ANALYTICS ENGINE ---
  const rawSessions = useMemo(() => {
    const mapped = (recentSessions || []).map((s) => ({
      id: s.id,
      date: s.date,
      duration: s.durationMinutes || s.duration || 0,
      durationMinutes: s.durationMinutes || s.duration || 0,
      cantoSeconds: s.cantoSeconds || 0,
      type: s.type,
      topicId: s.topicId,
      grade: typeof s.cantoGrade === "number" ? s.cantoGrade : typeof s.grade === "number" ? s.grade : null,
      difficulty: s.difficulty,
      createdAt: s.createdAt,
      completesVuelta: s.completesVuelta,
      notes: s.notes || "",
      mistakes: s.mistakes || "",
    }));

    // Deduplicate double submits in O(N)
    const unique: typeof mapped = [];
    const seenIds = new Set<string>();
    const recentByKey = new Map<string, number>();

    mapped.forEach((s) => {
      if (seenIds.has(s.id)) return;
      seenIds.add(s.id);

      const timeS = s.createdAt && typeof s.createdAt.toMillis === "function"
        ? s.createdAt.toMillis()
        : typeof s.createdAt === "number"
        ? s.createdAt
        : 0;

      const compositeKey = `${s.topicId}_${s.type}_${s.date}_${s.duration}_${s.grade || 0}`;
      const prevTime = recentByKey.get(compositeKey);

      if (prevTime !== undefined && timeS > 0 && Math.abs(timeS - prevTime) < 3000) {
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
    rawSessions.forEach((s) => {
      if (!byTopic[s.topicId]) byTopic[s.topicId] = [];
      byTopic[s.topicId].push(s);
    });

    const groupedResult: any[] = [];

    Object.keys(byTopic).forEach((topicId) => {
      const chronological = byTopic[topicId].sort((a, b) => {
        const dateCmp = (a.date || "").localeCompare(b.date || "");
        if (dateCmp !== 0) return dateCmp;
        const timeA = a.createdAt && typeof a.createdAt.toMillis === "function" ? a.createdAt.toMillis() : (a.createdAt || 0);
        const timeB = b.createdAt && typeof b.createdAt.toMillis === "function" ? b.createdAt.toMillis() : (b.createdAt || 0);
        return timeA - timeB;
      });

      let activeGroups: Record<string, any> = {};

      chronological.forEach((s) => {
        if (s.type === "canto" || s.type === "simulacro") {
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
            completesVuelta: s.completesVuelta,
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
          if (currentGroup.difficultyCount > 0)
            currentGroup.difficulty = Math.round(currentGroup.difficultySum / currentGroup.difficultyCount);
          groupedResult.push(currentGroup);
          activeGroups[s.type] = null;
        }
      });

      Object.values(activeGroups).forEach((group: any) => {
        if (group) {
          if (group.difficultyCount > 0)
            group.difficulty = Math.round(group.difficultySum / group.difficultyCount);
          groupedResult.push(group);
        }
      });
    });

    return groupedResult.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [rawSessions]);

  // Current Streak (Optimized O(1) Set lookups)
  const currentStreak = useMemo(() => {
    const sessionDates = new Set(rawSessions.map((s) => s.date));
    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      if (sessionDates.has(dateStr)) {
        streak++;
      } else if (i > 0) {
        break;
      }
    }
    return streak;
  }, [rawSessions]);

  // Smart Queue (SRS Agenda)
  const smartQueue = useMemo(() => {
    const queue: { topic: Topic; reason: string; urgency: number; nextDate: string }[] = [];
    const today = new Date().getTime();

    topics.forEach((t) => {
      const prog = userProgress[t.id];
      if (!prog || !prog.firstStudyDate) return;

      const srsState = {
        easinessFactor: prog.srsEasinessFactor || 2.5,
        interval: prog.srsInterval || 0,
        repetitions: prog.srsRepetitions || 0,
      };
      const nextDateStr = calculateNextSRSState(prog.difficulty || 5, srsState, prog.lastReviewDate).nextReviewDate;
      const nextDate = new Date(nextDateStr).getTime();
      const diffDays = Math.round((nextDate - today) / (1000 * 3600 * 24));

      if (diffDays <= 7) {
        let reasonStr = "En " + diffDays + " días";
        if (diffDays === 1) reasonStr = "Mañana";
        else if (diffDays === 0) reasonStr = "Hoy";
        else if (diffDays < 0) reasonStr = `Atrasado ${Math.abs(diffDays)} ${Math.abs(diffDays) === 1 ? "día" : "días"}`;

        queue.push({
          topic: t,
          reason: reasonStr,
          urgency: diffDays < 0 ? 3 : diffDays === 0 ? 2 : 1,
          nextDate: nextDateStr,
        });
      }
    });

    return queue.sort((a, b) => b.urgency - a.urgency);
  }, [topics, userProgress]);

  // Forecast 14 Days
  const forecastData = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const days = Array.from({ length: 14 }).map((_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      return {
        date: d,
        dateStr: getLocalDateString(d),
        label: i === 0 ? "Hoy" : i === 1 ? "Mañ" : d.toLocaleDateString("es-ES", { weekday: "short" }),
        count: 0,
      };
    });

    Object.values(userProgress).forEach((prog: any) => {
      if (prog?.lastReviewDate) {
        const srsState = {
          easinessFactor: prog.srsEasinessFactor || 2.5,
          interval: prog.srsInterval || 0,
          repetitions: prog.srsRepetitions || 0,
        };
        const nextDate = calculateNextSRSState(prog.difficulty || 5, srsState, prog.lastReviewDate).nextReviewDate;
        const dayObj = days.find((d) => d.dateStr === nextDate);
        if (dayObj) {
          dayObj.count++;
        } else if (new Date(nextDate).getTime() < today.getTime()) {
          days[0].count++;
        }
      }
    });

    return days;
  }, [userProgress]);

  // Cumulative Burn-up (Optimized O(N) linear sweep)
  const cumulativeProgress = useMemo(() => {
    const dates = groupedSessions.filter((s) => s.type === "estudio_inicial").map((s) => s.date).sort();
    if (dates.length === 0) return [];

    const start = new Date(dates[0]);
    const end = new Date();
    const data = [];
    let dateIdx = 0;

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 7)) {
      const dStr = d.toISOString().split("T")[0];
      while (dateIdx < dates.length && dates[dateIdx] <= dStr) {
        dateIdx++;
      }
      data.push({
        date: dStr.slice(5),
        estudiados: dateIdx,
        objetivo: Math.min(topics.length, dateIdx + 2),
      });
    }
    return data;
  }, [groupedSessions, topics]);

  // Domain Radar
  const radarData = useMemo(() => {
    const blocks: Record<string, { total: number; studied: number; score: number }> = {};
    topics.forEach((t) => {
      if (!blocks[t.subjectId]) blocks[t.subjectId] = { total: 0, studied: 0, score: 0 };
      blocks[t.subjectId].total++;
      const p = userProgress[t.id];
      if (p && p.firstStudyDate) {
        blocks[t.subjectId].studied++;
        let s = 5;
        if (p.difficulty) s += (5 - p.difficulty / 2);
        if (p.srsRepetitions) s += p.srsRepetitions * 0.5;
        blocks[t.subjectId].score += Math.min(10, s);
      }
    });

    return Object.entries(blocks).map(([name, data]) => ({
      materia: name.length > 15 ? name.substring(0, 15) + "..." : name,
      dominio: data.studied > 0 ? (data.score / data.studied).toFixed(1) : 0,
      cobertura: Number(((data.studied / data.total) * 10).toFixed(1)),
    }));
  }, [topics, userProgress]);

  // O(1) Topic Index Map for zero-latency session resolution
  const topicMap = useMemo(() => {
    const map = new Map<string, Topic>();
    allTopics.forEach((t) => {
      map.set(t.id, t);
      map.set(String(t.number), t);
      const suffix = t.id.split("-").pop();
      if (suffix) map.set(suffix, t);
    });
    return map;
  }, [allTopics]);

  // All Cantos (O(1) lookups)
  const allCantos = useMemo(() => {
    const mapped = (recentSessions || [])
      .filter((s) => s.type === "canto" || s.type === "simulacro")
      .map((s) => {
        const durMin = Number(s.durationMinutes) || Number(s.duration) || 0;
        const durSec = Number(s.cantoSeconds) || Number(s.durationSeconds) || 0;
        const totalMin = durMin + durSec / 60;
        const grade = typeof s.cantoGrade === "number" ? s.cantoGrade : typeof s.grade === "number" ? s.grade : null;

        const topic =
          topicMap.get(s.topicId) ||
          (s.topicId ? topicMap.get(s.topicId.split("-").pop() || "") : undefined);

        const customTitle = s.topicId ? (userProgress[s.topicId]?.customTitle || userProgress[s.topicId]?.title) : undefined;
        const topicNumber =
          topic?.number ?? (s.topicId && !isNaN(Number(s.topicId)) ? Number(s.topicId) : s.topicId ? s.topicId.split("-").pop() : "?");
        const resolvedTitle = customTitle || topic?.title || (s.topicId ? `Tema ${s.topicId}` : "Tema");

        const createdMs =
          s.createdAt && typeof s.createdAt.toMillis === "function"
            ? s.createdAt.toMillis()
            : typeof s.createdAt === "number"
            ? s.createdAt
            : 0;

        return {
          id: s.id,
          topicId: s.topicId,
          topicNumber,
          topicTitle: resolvedTitle,
          topicSubject: topic?.subjectId || "",
          date: s.date || getLocalDateString(),
          durationMinutes: durMin,
          durationSeconds: durSec,
          totalMinutes: Math.round(totalMin * 10) / 10,
          grade,
          difficulty: s.difficulty || 5,
          notes: s.notes || "",
          mistakes: s.mistakes || "",
          createdMs,
          type: s.type,
        };
      });

    mapped.sort((a, b) => {
      const dateCmp = (a.date || "").localeCompare(b.date || "");
      if (dateCmp !== 0) return dateCmp;
      return (a.createdMs || 0) - (b.createdMs || 0);
    });

    const deduped: typeof mapped = [];
    const seenIds = new Set<string>();
    for (const c of mapped) {
      if (!seenIds.has(c.id)) {
        seenIds.add(c.id);
        deduped.push(c);
      }
    }
    return deduped;
  }, [recentSessions, allTopics, userProgress]);

  const uniqueTopicsInCantos = useMemo(() => {
    const map = new Map<string, { id: string; number: number; title: string; count: number }>();
    allCantos.forEach((c) => {
      const key = c.topicId || String(c.topicNumber);
      if (!map.has(key)) {
        map.set(key, {
          id: key,
          number: Number(c.topicNumber) || 999,
          title: c.topicTitle,
          count: 0,
        });
      }
      map.get(key)!.count += 1;
    });
    return Array.from(map.values()).sort((a, b) => a.number - b.number);
  }, [allCantos]);

  const filteredCantos = useMemo(() => {
    let base = allCantos;
    if (selectedTopicCantoFilter !== "all") {
      base = base.filter((c) => c.topicId === selectedTopicCantoFilter || String(c.topicNumber) === selectedTopicCantoFilter);
    }
    if (cantoTimeRange === "10") return base.slice(-10);
    if (cantoTimeRange === "20") return base.slice(-20);
    if (cantoTimeRange === "30d") {
      const limit = new Date();
      limit.setDate(limit.getDate() - 30);
      const limitStr = getLocalDateString(limit);
      return base.filter((c) => c.date >= limitStr);
    }
    return base;
  }, [allCantos, cantoTimeRange, selectedTopicCantoFilter]);

  const estadoDeForma = useMemo(() => {
    if (allCantos.length === 0) {
      return {
        diagnostico: "Sin cantos",
        badgeClass: "bg-slate-100 text-slate-500 border-slate-200",
        consejo: "Registra tus cantes para monitorizar tu estado de forma.",
        notaMediaReciente: 0,
        notaMediaHistorica: 0,
        tiempoMedioRecienteMin: 0,
        tiempoMedioRecienteSec: 0,
        porcentajeEnTiempoOptimo: 0,
        tendenciaNota: 0,
        diasUltimoCanto: null,
        totalCantos: 0,
        aprobadosPorcentaje: 0,
      };
    }

    const recientes = allCantos.slice(-5);
    const recientesConNota = recientes.filter((c) => c.grade !== null);
    const mediaReciente =
      recientesConNota.length > 0
        ? recientesConNota.reduce((acc, c) => acc + (c.grade || 0), 0) / recientesConNota.length
        : 0;

    const todosConNota = allCantos.filter((c) => c.grade !== null);
    const mediaHistorica =
      todosConNota.length > 0
        ? todosConNota.reduce((acc, c) => acc + (c.grade || 0), 0) / todosConNota.length
        : 0;

    const totalSecsRecientes = recientes.reduce((acc, c) => acc + (c.durationMinutes * 60 + c.durationSeconds), 0);
    const avgSecs = recientes.length > 0 ? Math.round(totalSecsRecientes / recientes.length) : 0;
    const avgMins = Math.floor(avgSecs / 60);
    const avgRemSecs = avgSecs % 60;

    const enTiempo = recientes.filter((c) => {
      const s = c.durationMinutes * 60 + c.durationSeconds;
      return s >= 660 && s <= 820;
    }).length;
    const pctEnTiempo = recientes.length > 0 ? Math.round((enTiempo / recientes.length) * 100) : 0;

    const aprobados = todosConNota.filter((c) => {
      const durSecs = c.durationMinutes * 60 + c.durationSeconds;
      return (c.grade || 0) >= 5 && durSecs >= 660 && durSecs <= 820;
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
      consejo = "Excelente control del tiempo reglamentario (11:00–13:40 min) y rigor expositivo.";
    } else if (avgSecs > 820) {
      diagnostico = "Exceso Tiempo";
      badgeClass = "bg-rose-50 text-rose-700 border-rose-200/80";
      consejo = "Media superior a 13:40 min (suspenso por tiempo). Sintetiza epígrafes.";
    } else if (avgSecs < 660 && avgSecs > 0) {
      diagnostico = "Cante Breve";
      badgeClass = "bg-amber-50 text-amber-700 border-amber-200/80";
      consejo = "Media inferior a 11 min. Desarrolla completamente artículos y conceptos.";
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
      aprobadosPorcentaje: pctAprobados,
    };
  }, [allCantos]);

  const cantosChartData = useMemo(() => {
    return filteredCantos.map((c, idx) => {
      const dateObj = new Date(c.date);
      const fechaStr = dateObj.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
      const totalSecs = c.durationMinutes * 60 + c.durationSeconds;
      const durDec = totalSecs > 0 ? Number((totalSecs / 60).toFixed(2)) : 0;
      const isOptimal = totalSecs >= 660 && totalSecs <= 820; // 11:00 to 13:40 min
      const isExcess = totalSecs > 820;
      const isShort = totalSecs < 660 && totalSecs > 0;
      const isApproved = (c.grade || 0) >= 5;

      let barColor = "#6366f1";
      if (isOptimal) barColor = "#10b981";
      else if (isExcess) barColor = "#f43f5e";
      else if (isShort) barColor = "#f59e0b";

      // Quadrant classification
      let status: "zona_tribunal" | "riesgo_tiempo" | "riesgo_materia" | "critico" = "zona_tribunal";
      if (isOptimal && isApproved) {
        status = "zona_tribunal";
      } else if (!isOptimal && isApproved) {
        status = "riesgo_tiempo";
      } else if (isOptimal && !isApproved) {
        status = "riesgo_materia";
      } else {
        status = "critico";
      }

      return {
        id: c.id,
        index: idx + 1,
        cantoNum: idx + 1,
        displayX: `T.${c.topicNumber}`,
        fecha: fechaStr,
        date: c.date,
        totalSecs,
        deviationSecs: totalSecs - 750, // 750s = 12m 30s
        duracion: durDec,
        duracionMinDec: durDec,
        duracionMin: c.durationMinutes,
        duracionSec: c.durationSeconds,
        duracionStr: `${c.durationMinutes}m ${c.durationSeconds ? c.durationSeconds + "s" : "00s"}`.trim(),
        nota: c.grade,
        topicId: c.topicId,
        topicNumber: c.topicNumber,
        topicTitle: c.topicTitle,
        topicSubject: c.topicSubject || "",
        barColor,
        isOptimal,
        isExcess,
        isShort,
        isApproved,
        status,
        mistakes: c.mistakes,
        notes: c.notes,
        difficulty: c.difficulty || 5,
      };
    });
  }, [filteredCantos]);

  // Global KPIs summary
  const totalTopicsStudied = topics.filter((t) => userProgress[t.id]?.firstStudyDate).length;
  const globalCompletion = (totalTopicsStudied / topics.length) * 100;
  const totalTimeHours = rawSessions.reduce((acc, s) => acc + (s.duration || 0), 0) / 60;
  const cantosConNota = allCantos.filter((c) => c.grade !== null);
  const recentCantos = cantosConNota.slice(-10);
  const avgRecentCanto = recentCantos.length > 0 ? recentCantos.reduce((a, b) => a + (b.grade || 0), 0) / recentCantos.length : 0;

  // Apple Health & Daily Activity Engine
  const todayActivity = useMemo(() => {
    return computeTodayActivity(rawSessions, dailyGoalMinutes);
  }, [rawSessions, dailyGoalMinutes]);

  const weeklyConsistency = useMemo(() => {
    return computeWeeklyConsistency(rawSessions, dailyGoalMinutes, currentStreak);
  }, [rawSessions, dailyGoalMinutes, currentStreak]);

  const todayStudyQueue = useMemo(() => {
    return computeTodayStudyQueue(allTopics, userProgress, recentSessions);
  }, [allTopics, userProgress, recentSessions]);

  // Handlers for Plan del Día
  const handleTodayQuickReview = async (task: RecommendedStudyTask) => {
    try {
      playSound.click();
      const currentVueltas = userProgress[task.topic.id]?.vueltas || 0;
      const newVueltas = currentVueltas + 1;
      await addStudySession({
        topicId: task.topic.id,
        date: getLocalDateString(),
        type: "repaso",
        durationMinutes: task.estimatedMinutes || 45,
        difficulty: userProgress[task.topic.id]?.difficulty || task.topic.difficulty || 4,
        completesVuelta: true,
        notes: `Repaso rápido oficial (+1 Vuelta) desde Plan del Día. Estimado: ${task.estimatedMinutes} min.`,
      });
      playSound.success();
      toast.success(`🎉 ¡Vuelta ${newVueltas} consolidada para el Tema ${task.topic.number}!`);
    } catch (err: any) {
      toast.error("Error al registrar repaso: " + (err.message || err));
    }
  };

  const handleTodayQuickRefresco = async (task: RecommendedStudyTask) => {
    try {
      playSound.click();
      await addStudySession({
        topicId: task.topic.id,
        date: getLocalDateString(),
        type: "refresco",
        durationMinutes: task.estimatedMinutes || 30,
        difficulty: userProgress[task.topic.id]?.difficulty || task.topic.difficulty || 4,
        completesVuelta: false,
        notes: `Refresco diario oficial desde Plan del Día.`,
      });
      playSound.success();
      toast.success(`⚡ ¡Refresco registrado para el Tema ${task.topic.number}!`);
    } catch (err: any) {
      toast.error("Error al registrar refresco: " + (err.message || err));
    }
  };

  const handleOpenLogCanto = (mode: "simulator" | "manual" = "simulator", targetTopicId?: string) => {
    playSound.click();
    setCantoModalMode(mode);
    if (targetTopicId) {
      setActiveModalTopicId(targetTopicId);
    } else if (selectedTopicCantoFilter !== "all") {
      setActiveModalTopicId(selectedTopicCantoFilter);
    } else {
      setActiveModalTopicId(undefined);
    }
    setIsLoggingCanto(true);
  };

  const handleTodayQuickCanto = (task: RecommendedStudyTask) => {
    handleOpenLogCanto("simulator", task.topic.id);
  };

  // Handlers
  const handleSaveNewCanto = async (data: any) => {
    setIsSavingCanto(true);
    try {
      await addStudySession(
        data.topicId,
        data.durationMinutes,
        data.difficulty,
        "canto",
        data.date,
        {
          cantoGrade: data.grade,
          cantoSeconds: data.durationSeconds,
          mistakes: data.mistakes,
        }
      );
      toast.success("Canto registrado correctamente");
      setIsLoggingCanto(false);
    } catch (err: any) {
      toast.error("Error al registrar el cante: " + (err.message || err));
    } finally {
      setIsSavingCanto(false);
    }
  };

  const handleDeleteCanto = async (topicId: string, sessionId: string) => {
    setDeletingSessionId(sessionId);
    try {
      await deleteStudySession(topicId, sessionId);
      toast.success("Canto eliminado del registro");
    } catch (err: any) {
      toast.error("Error al eliminar el cante: " + (err.message || err));
    } finally {
      setDeletingSessionId(null);
    }
  };

  return (
    <div className="w-full h-full px-2.5 py-3 sm:p-6 lg:p-8 bg-[#F8FAFC] overflow-y-auto no-scrollbar pb-28 md:pb-8">
      <div className="max-w-[100rem] mx-auto space-y-4 sm:space-y-6 lg:space-y-7">
        {/* Editorial Top Bar */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-3 sm:gap-6 mb-1">
          <div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-slate-900 tracking-tight font-serif">
              Centro de Comando
            </h1>
            <p className="text-slate-500 text-xs sm:text-sm font-medium mt-0.5 flex items-center gap-1.5">
              <Activity size={14} className="text-indigo-600 shrink-0" />
              Telemetría en tiempo real de tu oposición
            </p>
          </div>

          {/* Section Navigation Tabs */}
          <div className="w-full lg:w-auto flex items-center bg-white/95 backdrop-blur-xl p-1 rounded-2xl border border-slate-200/80 shadow-xs gap-1 overflow-x-auto no-scrollbar">
            <button
              onClick={() => {
                playSound.click();
                setDashboardSection("hoy");
              }}
              className={cn(
                "px-3 py-1.5 sm:py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shrink-0 active:scale-[0.98]",
                dashboardSection === "hoy" ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              )}
            >
              <Target size={13} className={dashboardSection === "hoy" ? "text-indigo-300" : "text-indigo-600"} />
              <span className="sm:hidden">Hoy</span>
              <span className="hidden sm:inline">Hoy & Plan de Estudio</span>
            </button>
            <button
              onClick={() => {
                playSound.click();
                setDashboardSection("temas");
              }}
              className={cn(
                "px-3 py-1.5 sm:py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shrink-0 active:scale-[0.98]",
                dashboardSection === "temas" ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              )}
            >
              <BookOpen size={13} className={dashboardSection === "temas" ? "text-indigo-300" : "text-indigo-600"} />
              <span className="sm:hidden">Temas</span>
              <span className="hidden sm:inline">Evolución de Temas</span>
            </button>
            <button
              onClick={() => {
                playSound.click();
                setDashboardSection("cantos");
              }}
              className={cn(
                "px-3 py-1.5 sm:py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shrink-0 active:scale-[0.98]",
                dashboardSection === "cantos" ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              )}
            >
              <Mic size={13} className={dashboardSection === "cantos" ? "text-fuchsia-300" : "text-fuchsia-600"} />
              <span className="sm:hidden">Cantos</span>
              <span className="hidden sm:inline">Evolución de Cantos</span>
            </button>
            <button
              onClick={() => {
                playSound.click();
                setDashboardSection("general");
              }}
              className={cn(
                "px-3 py-1.5 sm:py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shrink-0 active:scale-[0.98]",
                dashboardSection === "general" ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              )}
            >
              <TrendingUp size={13} className={dashboardSection === "general" ? "text-emerald-300" : "text-emerald-600"} />
              <span className="sm:hidden">Agenda</span>
              <span className="hidden sm:inline">Visión General & Agenda</span>
            </button>
            <button
              onClick={() => {
                playSound.click();
                setDashboardSection("todo");
              }}
              className={cn(
                "px-3 py-1.5 sm:py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shrink-0 active:scale-[0.98]",
                dashboardSection === "todo" ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              )}
            >
              <Layers size={13} className={dashboardSection === "todo" ? "text-amber-300" : "text-amber-600"} />
              <span>Todo</span>
            </button>
          </div>
        </div>

        {/* 4 Hero KPIs Cards */}
        <DashboardHeroKPIs
          currentStreak={currentStreak}
          totalTopicsStudied={totalTopicsStudied}
          totalTopicsCount={topics.length}
          globalCompletion={globalCompletion}
          totalTimeHours={totalTimeHours}
          avgRecentCanto={avgRecentCanto}
        />

        {/* BENTO GRID */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 auto-rows-auto gap-4 sm:gap-6 mt-3 sm:mt-4 pb-6 sm:pb-8">
          {/* SECCIÓN 0: HOY & PLAN DE ESTUDIO (APPLE HEALTH & SMART RECOMMENDER) */}
          {(dashboardSection === "hoy" || dashboardSection === "todo") && (
            <>
              {/* Row 1: Apple Health Activity Ring (Col 1) + 7-Day Consistency (Col 2) */}
              <div className="md:col-span-1 xl:col-span-1">
                <DashboardActivityRingsCard
                  activity={todayActivity}
                  currentStreak={currentStreak}
                  onGoalChange={handleGoalChange}
                />
              </div>

              <div className="md:col-span-1 xl:col-span-2">
                <DashboardWeeklyConsistencyCard weeklyData={weeklyConsistency} />
              </div>

              {/* Row 2: Executive Preparador Cante Card */}
              <div className="md:col-span-2 xl:col-span-3">
                <DashboardPreparadorExecutiveCard
                  onNavigateToPreparador={() => onNavigateTab?.("preparador")}
                />
              </div>

              {/* Row 3: Today's Smart Study Queue (Full width) */}
              <div className="md:col-span-2 xl:col-span-3">
                <DashboardTodayRecommender
                  tasks={todayStudyQueue.tasks}
                  onSelectTopic={onSelectTopic}
                  onQuickReview={handleTodayQuickReview}
                  onQuickRefresco={handleTodayQuickRefresco}
                  onQuickCanto={handleTodayQuickCanto}
                />
              </div>

              {/* In 'hoy' mode, also show the SRS Forecast so student sees the 14-day horizon */}
              {dashboardSection === "hoy" && (
                <div className="md:col-span-2 xl:col-span-3">
                  <DashboardSRSForecastChart forecastData={forecastData} />
                </div>
              )}
            </>
          )}

          {/* SECCIÓN 1: EVOLUCIÓN DE TEMAS */}
          {(dashboardSection === "temas" || dashboardSection === "todo") && (
            <div className="md:col-span-2 xl:col-span-3">
              <TopicsEvolutionSection
                topics={topics}
                userProgress={userProgress}
                rawSessions={rawSessions}
                onSelectTopic={onSelectTopic}
              />
            </div>
          )}

          {/* SECCIÓN 2: PLANIFICACIÓN Y AGENDA */}
          {(dashboardSection === "general" || dashboardSection === "todo") && (
            <>
              <DashboardBurnupChart cumulativeProgress={cumulativeProgress} />
              <DashboardSmartQueue smartQueue={smartQueue} onSelectTopic={onSelectTopic} />
              <DashboardSRSForecastChart forecastData={forecastData} />
              <DashboardDomainRadarChart radarData={radarData} />
            </>
          )}

          {/* SECCIÓN 3: EVOLUCIÓN DE CANTOS */}
          {(dashboardSection === "cantos" || dashboardSection === "todo") && (
            <DashboardCantoScatterChart
              allCantos={allCantos}
              cantosChartData={cantosChartData}
              uniqueTopicsInCantos={uniqueTopicsInCantos}
              selectedTopicCantoFilter={selectedTopicCantoFilter}
              setSelectedTopicCantoFilter={setSelectedTopicCantoFilter}
              cantoTimeRange={cantoTimeRange}
              setCantoTimeRange={setCantoTimeRange}
              estadoDeForma={estadoDeForma}
              onManageCantos={() => setIsManagingCantos(true)}
              onLogCanto={handleOpenLogCanto}
              onSelectTopic={onSelectTopic}
              onDeleteCanto={handleDeleteCanto}
            />
          )}
        </div>
      </div>

      {/* MODAL: GESTIÓN DE CANTOS */}
      <DashboardManageCantosModal
        isOpen={isManagingCantos}
        onClose={() => setIsManagingCantos(false)}
        allCantos={allCantos}
        onDeleteCanto={handleDeleteCanto}
        deletingSessionId={deletingSessionId}
      />

      {/* MODAL: REGISTRO RÁPIDO DE CANTO / SIMULADOR */}
      <DashboardQuickCantoModal
        isOpen={isLoggingCanto}
        onClose={() => setIsLoggingCanto(false)}
        allTopics={allTopics}
        onSaveCanto={handleSaveNewCanto}
        isSaving={isSavingCanto}
        initialTopicId={activeModalTopicId}
        initialMode={cantoModalMode}
      />
    </div>
  );
}
