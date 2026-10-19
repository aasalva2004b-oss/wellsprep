import { useMemo } from "react";
import { Topic } from "../types";
import { TopicProgressData } from "../lib/prediction";
import { isCantoSession, getCantoDuration } from "../lib/cantoUtils";
import { getLocalDateString } from "../lib/utils";

export interface UseDashboardMetricsProps {
  recentSessions: any[];
  userProgress: Record<string, TopicProgressData>;
  allTopics: Topic[];
}

export function useDashboardMetrics({
  recentSessions,
  userProgress,
  allTopics,
}: UseDashboardMetricsProps) {
  // 1. All Cantos with robust deduplication
  const allCantos = useMemo(() => {
    const raw = (recentSessions || []).filter(isCantoSession);
    const mapped = raw.map((s) => {
      const dur = getCantoDuration(s);
      const grade = typeof s.cantoGrade === "number" ? s.cantoGrade : (typeof s.grade === "number" ? s.grade : null);
      const topic = allTopics.find((t) => t.id === s.topicId);
      const topicNumber = topic?.number || (s.topicNumber ? Number(s.topicNumber) : 0);
      const resolvedTitle = topic?.title || s.topicTitle || `Tema ${topicNumber}`;
      const createdMs = s.createdAt?.toMillis
        ? s.createdAt.toMillis()
        : typeof s.createdAt === "number"
        ? s.createdAt
        : new Date(s.createdAt || s.date || 0).getTime();

      return {
        id: s.id,
        topicId: s.topicId,
        topicNumber,
        topicTitle: resolvedTitle,
        topicSubject: topic?.subjectId || "",
        date: s.date || getLocalDateString(),
        durationMinutes: dur.mins,
        durationSeconds: dur.secs,
        totalMinutes: Math.round((dur.totalSecs / 60) * 10) / 10,
        grade,
        difficulty: s.difficulty || 5,
        notes: s.notes || "",
        mistakes: s.mistakes || "",
        createdMs,
        type: s.type || "canto",
      };
    });

    // Sort chronologically ascending for analytical progression
    mapped.sort((a, b) => {
      const dateCmp = (a.date || "").localeCompare(b.date || "");
      if (dateCmp !== 0) return dateCmp;
      return (a.createdMs || 0) - (b.createdMs || 0);
    });

    // Deduplicate exact duplicate submissions on same date
    const deduped: typeof mapped = [];
    const seen = new Set<string>();
    for (const c of mapped) {
      const key = `${c.topicId}__${c.date}__${c.durationMinutes}m_${c.durationSeconds}s__${c.grade ?? "nograde"}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(c);
      }
    }

    return deduped;
  }, [recentSessions, allTopics]);

  // 2. High-performance summary KPIs
  const kpis = useMemo(() => {
    let totalMinutes = 0;
    let cantosCount = 0;

    (recentSessions || []).forEach((s) => {
      const m = Number(s.durationMinutes || s.durationReal || s.duration || 0);
      totalMinutes += m;
      if (isCantoSession(s)) cantosCount++;
    });

    const totalHours = Math.round((totalMinutes / 60) * 10) / 10;
    const progressList = Object.values(userProgress || {});
    const topicsStudiedCount = progressList.filter((p) => (p?.vueltas || 0) > 0 || (p?.studyTimeHours || 0) > 0).length;
    const totalVueltas = progressList.reduce((acc, p) => acc + (p?.vueltas || 0), 0);

    // Retention score computation
    const ratedTopics = progressList.filter((p) => p?.difficulty !== undefined);
    const avgDifficulty = ratedTopics.length > 0
      ? Math.round((ratedTopics.reduce((acc, p) => acc + (p.difficulty || 5), 0) / ratedTopics.length) * 10) / 10
      : 5;

    return {
      totalHours,
      topicsStudiedCount,
      totalVueltas,
      cantosCount,
      avgDifficulty,
      totalConstitutionalTopics: allTopics.length || 29,
    };
  }, [recentSessions, userProgress, allTopics]);

  // 3. Estado de Forma Competitiva (Official Judicial Thresholds)
  const estadoDeForma = useMemo(() => {
    if (allCantos.length === 0) {
      return {
        diagnostico: "Sin cantos registrados",
        badgeClass: "bg-slate-100 text-slate-600 border-slate-200",
        consejo: "Registra tus primeros cantes para monitorizar tu ritmo y control reglamentario del cronómetro.",
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
    const mediaReciente = recientesConNota.length > 0
      ? recientesConNota.reduce((acc, c) => acc + (c.grade || 0), 0) / recientesConNota.length
      : 0;

    const todosConNota = allCantos.filter((c) => c.grade !== null);
    const mediaHistorica = todosConNota.length > 0
      ? todosConNota.reduce((acc, c) => acc + (c.grade || 0), 0) / todosConNota.length
      : 0;

    const totalSecsRecientes = recientes.reduce((acc, c) => acc + (c.durationMinutes * 60 + c.durationSeconds), 0);
    const avgSecs = recientes.length > 0 ? Math.round(totalSecsRecientes / recientes.length) : 0;
    const avgMins = Math.floor(avgSecs / 60);
    const avgRemSecs = avgSecs % 60;
    const avgTotalSecs = avgMins * 60 + avgRemSecs;

    // Regla oficial de judicatura: 11:00 a 13:40 min (660s a 820s)
    const enTiempo = recientes.filter((c) => {
      const s = c.durationMinutes * 60 + c.durationSeconds;
      return s >= 660 && s <= 820;
    }).length;
    const pctEnTiempo = Math.round((enTiempo / recientes.length) * 100);

    const aprobados = todosConNota.filter((c) => {
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
    let consejo = "Ritmo sólido. Ajusta transiciones y dicción para consolidar la franja de 8+.";

    if (mediaReciente >= 7.5 && pctEnTiempo >= 60) {
      diagnostico = "Pico de Forma";
      badgeClass = "bg-emerald-50 text-emerald-700 border-emerald-200/80";
      consejo = "Excelente control del tiempo reglamentario (11:00–13:40 min) y rigor expositivo. Nivel de plaza.";
    } else if (avgTotalSecs > 820) {
      diagnostico = "Exceso de Tiempo";
      badgeClass = "bg-rose-50 text-rose-700 border-rose-200/80";
      consejo = "Tiempo medio superior a 13:40 min. Sintetiza epígrafes para asegurar que no se exceda el cronómetro.";
    } else if (avgTotalSecs < 660 && avgTotalSecs > 0) {
      diagnostico = "Cante Breve";
      badgeClass = "bg-amber-50 text-amber-700 border-amber-200/80";
      consejo = "Tiempo medio inferior a 11 min. Desarrolla completamente artículos y conceptos de la Constitución.";
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
      aprobadosPorcentaje: pctAprobados,
    };
  }, [allCantos]);

  return {
    allCantos,
    kpis,
    estadoDeForma,
  };
}
