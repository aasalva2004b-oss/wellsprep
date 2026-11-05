/**
 * Engine de Organización y Planificación Semanal Dinámica para Cantes de Oposición
 * 
 * Basado en las directrices del opositor:
 * 1. Recálculo automático en tiempo real: Si un día se estudia más o menos de lo previsto,
 *    la carga de páginas restantes se redistribuye equilibradamente en los días previos al cante.
 * 2. Métrica de esfuerzo ponderada: Páginas ponderadas por el ritmo histórico personal (minutos/página).
 * 3. Protocolo de Día de Cante: La mañana del día de cante se reserva estrictamente para repaso general,
 *    salvo un buffer de 1-2 horas si a un tema le falta poco para terminarse (>= 80% completado).
 */

import { Topic, Session } from "../types";
import { getLocalDateString, safeParseDate } from "./utils";

export interface TopicCanteGoal {
  topicId: string;
  topicNumber: number;
  topicTitle: string;
  subjectId: string;
  totalPages: number;           // Total de páginas del tema (personalizable)
  completedPages: number;        // Páginas ya estudiadas para este cante
  currentStartPage: number;     // Página de partida
  isComplete: boolean;
  minutesPerPage: number;       // Ritmo histórico personal (min/pág)
  difficulty: number;
}

export interface DayTopicTask {
  topicId: string;
  topicNumber: number;
  topicTitle: string;
  subjectId: string;
  totalPages: number;
  fromPage: number;
  toPage: number;
  pagesCount: number;
  estimatedMinutes: number;
  minutesPerPage: number;
  isCanteMorningBuffer: boolean; // Si se permite en la mañana de cante para rematar
  isCompleted: boolean;
  actualPagesCompleted?: number;
}

export interface DayStudyQuota {
  date: string;                  // "YYYY-MM-DD"
  dayName: string;               // "Lunes", "Martes", etc.
  shortName: string;             // "LUN", "MAR", etc.
  isCanteDay: boolean;           // Si es día oficial de cante (Lunes o Jueves)
  isCanteMorningReview: boolean; // Mañana de repaso mental y oral
  isToday: boolean;
  isPast: boolean;
  isFuture: boolean;
  totalPlannedPages: number;
  totalPlannedMinutes: number;
  totalActualPagesCompleted: number;
  totalActualMinutesStudied: number;
  tasks: DayTopicTask[];
  status: "pending" | "completed" | "underperformed" | "overperformed" | "resting";
  rebalanceNote?: string;
}

export interface WeeklyCantePlan {
  id: string;
  targetCanteDay: "lunes" | "jueves";
  targetCanteDate: string;       // "YYYY-MM-DD"
  daysRemaining: number;
  cycleStartDate: string;        // "YYYY-MM-DD"
  cycleEndDate: string;          // "YYYY-MM-DD"
  assignedTopicIds: string[];
  topicGoals: Record<string, TopicCanteGoal>;
  dailyQuotas: Record<string, DayStudyQuota>; // Keyed by ISO date
  historicalAverageMinPerPage: number;
  totalTargetPages: number;
  totalCompletedPages: number;
  overallProgressPct: number;
  lastRebalancedAt: string;
  status: "on_track" | "ahead" | "behind" | "urgent";
}

export const CANTE_PLAN_STORAGE_KEY = "wellsprep_weekly_cante_plan_v2";

/**
 * Ritmo por defecto en minutos por página cuando no hay suficientes datos históricos.
 * Basado en oposiciones jurídicas de alta exigencia (Judicatura / Fiscal / Notarías).
 */
export const DEFAULT_PACE_MINUTES_PER_PAGE = {
  primer_estudio: 5.5,
  repaso: 3.5,
  refresco: 2.0,
  general: 3.8
};

/**
 * Calcula el ritmo histórico personal (minutos/página) para un tema específico
 * o la media general del opositor a partir de sus sesiones reales.
 */
export function calculateTopicHistoricalPace(
  topicId: string,
  topic: Topic | undefined,
  sessions: Session[],
  defaultPace = DEFAULT_PACE_MINUTES_PER_PAGE.repaso
): { minutesPerPage: number; isEstimated: boolean; sampleCount: number } {
  const topicSessions = sessions.filter(
    (s) => s.topicId === topicId && (s.durationMinutes || 0) > 0 && s.type !== "canto"
  );

  const topicPages = topic?.pages && topic.pages > 0 ? topic.pages : 20;

  if (topicSessions.length > 0) {
    const totalMinutes = topicSessions.reduce((acc, s) => acc + (s.durationMinutes || 0), 0);
    // Si tenemos sesiones de estudio completas
    const estimatedPace = Math.max(1.5, Math.min(10, totalMinutes / topicPages));
    return {
      minutesPerPage: Math.round(estimatedPace * 10) / 10,
      isEstimated: false,
      sampleCount: topicSessions.length
    };
  }

  // Si no hay datos específicos de este tema, calcular la media global del opositor
  const allStudySessions = sessions.filter(
    (s) => (s.durationMinutes || 0) > 0 && s.type !== "canto"
  );
  if (allStudySessions.length >= 5) {
    const totalMins = allStudySessions.reduce((acc, s) => acc + (s.durationMinutes || 0), 0);
    const avgSessionMins = totalMins / allStudySessions.length;
    // Estimación empírica: una sesión media de repaso cubre aproximadamente 12-15 páginas
    const globalPace = Math.max(2.0, Math.min(7.0, avgSessionMins / 13));
    return {
      minutesPerPage: Math.round(globalPace * 10) / 10,
      isEstimated: true,
      sampleCount: allStudySessions.length
    };
  }

  return {
    minutesPerPage: defaultPace,
    isEstimated: true,
    sampleCount: 0
  };
}

/**
 * Obtiene el objetivo del próximo cante (Lunes o Jueves) y la fecha de referencia.
 */
export function getNextCanteTarget(referenceDate: Date = new Date()): {
  targetDay: "lunes" | "jueves";
  targetDate: string;
  daysRemaining: number;
  cycleStartDate: string;
} {
  const now = new Date(referenceDate);
  const dayOfWeek = now.getDay(); // 0 Dom, 1 Lun, 2 Mar, 3 Mié, 4 Jue, 5 Vie, 6 Sáb
  const currentHour = now.getHours();

  let targetDay: "lunes" | "jueves" = "jueves";
  let daysToAdd = 0;
  let cycleStartDaysAgo = 0;

  if (dayOfWeek === 1) { // Lunes
    if (currentHour < 21) {
      targetDay = "lunes";
      daysToAdd = 0;
      cycleStartDaysAgo = 4; // Empezó el jueves pasado tras el cante
    } else {
      targetDay = "jueves";
      daysToAdd = 3;
      cycleStartDaysAgo = 0;
    }
  } else if (dayOfWeek === 2) { // Martes
    targetDay = "jueves";
    daysToAdd = 2;
    cycleStartDaysAgo = 1; // Empezó el lunes tras el cante
  } else if (dayOfWeek === 3) { // Miércoles
    targetDay = "jueves";
    daysToAdd = 1;
    cycleStartDaysAgo = 2;
  } else if (dayOfWeek === 4) { // Jueves
    if (currentHour < 21) {
      targetDay = "jueves";
      daysToAdd = 0;
      cycleStartDaysAgo = 3; // Empezó el lunes
    } else {
      targetDay = "lunes";
      daysToAdd = 4;
      cycleStartDaysAgo = 0;
    }
  } else if (dayOfWeek === 5) { // Viernes
    targetDay = "lunes";
    daysToAdd = 3;
    cycleStartDaysAgo = 1;
  } else if (dayOfWeek === 6) { // Sábado
    targetDay = "lunes";
    daysToAdd = 2;
    cycleStartDaysAgo = 2;
  } else { // Domingo (0)
    targetDay = "lunes";
    daysToAdd = 1;
    cycleStartDaysAgo = 3;
  }

  const targetDateObj = new Date(now);
  targetDateObj.setDate(now.getDate() + daysToAdd);
  const targetDate = getLocalDateString(targetDateObj);

  const cycleStartObj = new Date(now);
  cycleStartObj.setDate(now.getDate() - cycleStartDaysAgo);
  const cycleStartDate = getLocalDateString(cycleStartObj);

  return {
    targetDay,
    targetDate,
    daysRemaining: daysToAdd,
    cycleStartDate
  };
}

/**
 * Obtiene la lista ordenada de fechas ISO desde cycleStartDate hasta targetDate inclusive.
 */
function getDateRange(startDateStr: string, endDateStr: string): string[] {
  const dates: string[] = [];
  const start = safeParseDate(startDateStr);
  const end = safeParseDate(endDateStr);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  const curr = new Date(start);
  while (curr <= end) {
    dates.push(getLocalDateString(curr));
    curr.setDate(curr.getDate() + 1);
  }
  return dates;
}

const SPANISH_DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const SPANISH_SHORT_DAYS = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];

/**
 * REBALANCE ENGINE:
 * Construye o recalcula el plan de estudio diario para cumplir con todos los temas asignados.
 * 
 * Reglas fundamentales:
 * 1. Cada día tiene una asignación clara de páginas ("Págs. X a Y") y tiempo estimado.
 * 2. Si un día pasado o actual tuvo menos páginas completadas, el remanente se distribuye automáticamente
 *    entre los días restantes antes del cante.
 * 3. En el día de cante, la mañana se destina a REPASO GENERAL de todos los temas.
 *    Excepción: si a algún tema le falta <= 6 páginas o está >= 80% completado, se le reserva un
 *    buffer de máximo 60-90 minutos en la mañana para rematarlo antes del repaso general.
 */
export function buildOrRebalanceWeeklyCantePlan(params: {
  assignedTopicIds: string[];
  targetDay: "lunes" | "jueves";
  targetDate?: string;
  allTopics: Topic[];
  sessions: Session[];
  existingPlan?: WeeklyCantePlan | null;
  referenceDate?: Date;
  customTopicPages?: Record<string, number>;
  progressOverrides?: Record<string, { completedPages: number }>; // { [topicId]: { completedPages } }
  manualDayCompletions?: Record<string, Record<string, boolean>>; // { [date]: { [topicId]: isDone } }
}): WeeklyCantePlan {
  const refDate = params.referenceDate || new Date();
  const todayStr = getLocalDateString(refDate);
  const targetInfo = getNextCanteTarget(refDate);

  const targetDay = params.targetDay;
  const targetDate = params.targetDate || (targetDay === targetInfo.targetDay ? targetInfo.targetDate : targetInfo.targetDate);
  const cycleStartDate = targetInfo.cycleStartDate;

  const topicMap = new Map<string, Topic>();
  params.allTopics.forEach((t) => topicMap.set(t.id, t));

  // 1. Construir o actualizar los objetivos por tema
  const topicGoals: Record<string, TopicCanteGoal> = {};
  let totalTargetPages = 0;
  let totalCompletedPages = 0;

  for (const topicId of params.assignedTopicIds) {
    const topic = topicMap.get(topicId);
    const existingGoal = params.existingPlan?.topicGoals?.[topicId];
    
    // Páginas del tema: prioridad a override personalizado, luego topic.pages, luego default 20 págs
    let pages = params.customTopicPages?.[topicId] ||
      existingGoal?.totalPages ||
      (topic?.pages && topic.pages > 0 ? topic.pages : 20);

    const pace = calculateTopicHistoricalPace(topicId, topic, params.sessions);

    // Páginas completadas para este cante
    let completed = 0;
    if (params.progressOverrides?.[topicId] !== undefined) {
      completed = params.progressOverrides[topicId].completedPages;
    } else if (existingGoal) {
      completed = existingGoal.completedPages;
    } else {
      // Calcular a partir de sesiones registradas en este ciclo (cycleStartDate a hoy)
      const cycleSessions = params.sessions.filter((s) => {
        if (s.topicId !== topicId || s.type === "canto") return false;
        const sDate = (s.date || "").substring(0, 10);
        return sDate >= cycleStartDate && sDate <= todayStr;
      });

      if (cycleSessions.length > 0) {
        // Estimar páginas completadas según minutos estudiados y ritmo
        const minsStudied = cycleSessions.reduce((acc, s) => acc + (s.durationMinutes || 0), 0);
        completed = Math.min(pages, Math.round(minsStudied / pace.minutesPerPage));
      }
    }

    completed = Math.max(0, Math.min(pages, completed));
    const isComplete = completed >= pages;

    topicGoals[topicId] = {
      topicId,
      topicNumber: topic?.number || 0,
      topicTitle: topic?.title || `Tema ${topicId}`,
      subjectId: topic?.subjectId || "general",
      totalPages: pages,
      completedPages: completed,
      currentStartPage: Math.min(pages, completed + 1),
      isComplete,
      minutesPerPage: pace.minutesPerPage,
      difficulty: topic?.difficulty || 5
    };

    totalTargetPages += pages;
    totalCompletedPages += completed;
  }

  // 2. Determinar el rango de días del ciclo
  const dateList = getDateRange(cycleStartDate, targetDate);

  // Identificar días futuros o pendientes (incluyendo hoy)
  const remainingStudyDays = dateList.filter((d) => d >= todayStr && d < targetDate);
  const isCanteToday = todayStr === targetDate;

  // 3. Distribuir páginas restantes
  const dailyQuotas: Record<string, DayStudyQuota> = {};

  // Copiar primero datos de días pasados si ya existían en el plan anterior
  dateList.forEach((d) => {
    const dateObj = safeParseDate(d);
    const dayOfWeek = dateObj.getDay();
    const isCante = d === targetDate;
    const isPast = d < todayStr;
    const isToday = d === todayStr;
    const isFuture = d > todayStr;

    // Sesiones reales en este día
    const daySessions = params.sessions.filter((s) => (s.date || "").startsWith(d));
    const dayMins = daySessions.reduce((acc, s) => acc + (s.durationMinutes || 0), 0);

    dailyQuotas[d] = {
      date: d,
      dayName: SPANISH_DAY_NAMES[dayOfWeek],
      shortName: SPANISH_SHORT_DAYS[dayOfWeek],
      isCanteDay: isCante,
      isCanteMorningReview: isCante,
      isToday,
      isPast,
      isFuture,
      totalPlannedPages: 0,
      totalPlannedMinutes: 0,
      totalActualPagesCompleted: 0,
      totalActualMinutesStudied: dayMins,
      tasks: [],
      status: isPast ? (dayMins > 0 ? "completed" : "resting") : "pending"
    };
  });

  // Calcular páginas pendientes por tema a partir de hoy
  interface PendingTopicWork {
    topicId: string;
    remainingPages: number;
    startPage: number;
    goal: TopicCanteGoal;
  }

  const pendingList: PendingTopicWork[] = Object.values(topicGoals)
    .filter((g) => !g.isComplete)
    .map((g) => ({
      topicId: g.topicId,
      remainingPages: g.totalPages - g.completedPages,
      startPage: g.completedPages + 1,
      goal: g
    }))
    .sort((a, b) => b.remainingPages - a.remainingPages);

  // Cuántos días hábiles de estudio intensivo quedan antes del día de cante
  const availableStudyDays = remainingStudyDays.length;

  // DÍA DE CANTE: Regla especial matutina
  // "La mañana del día del cante para repasar únicamente (salvo una o dos horas si me falta poco para terminar un tema)"
  let canteMorningBufferTopicId: string | null = null;
  let canteMorningBufferPages = 0;

  if (pendingList.length > 0) {
    // Si algún tema está al >= 80% completado o le faltan <= 6 páginas, permitimos rematarlo en el cante
    const finishCandidate = pendingList.find(
      (p) => p.remainingPages <= 8 || (p.goal.completedPages / p.goal.totalPages) >= 0.75
    );
    if (finishCandidate) {
      canteMorningBufferTopicId = finishCandidate.topicId;
      // Buffer de 1-2h a su ritmo
      const maxPagesInBuffer = Math.min(
        finishCandidate.remainingPages,
        Math.floor(90 / finishCandidate.goal.minutesPerPage) // máximo ~90 min
      );
      canteMorningBufferPages = Math.max(1, maxPagesInBuffer);
    }
  }

  // Si no hay días de estudio intermedios (ej. hoy es el mismo día del cante o víspera directa)
  if (availableStudyDays === 0) {
    // Hoy es el día de cante o no hay días antes
    const canteDayQuota = dailyQuotas[targetDate];
    if (canteDayQuota) {
      if (canteMorningBufferTopicId && canteMorningBufferPages > 0) {
        const goal = topicGoals[canteMorningBufferTopicId];
        const estMins = Math.round(canteMorningBufferPages * goal.minutesPerPage);
        canteDayQuota.tasks.push({
          topicId: goal.topicId,
          topicNumber: goal.topicNumber,
          topicTitle: goal.topicTitle,
          subjectId: goal.subjectId,
          totalPages: goal.totalPages,
          fromPage: goal.completedPages + 1,
          toPage: Math.min(goal.totalPages, goal.completedPages + canteMorningBufferPages),
          pagesCount: canteMorningBufferPages,
          estimatedMinutes: estMins,
          minutesPerPage: goal.minutesPerPage,
          isCanteMorningBuffer: true,
          isCompleted: false
        });
        canteDayQuota.totalPlannedPages += canteMorningBufferPages;
        canteDayQuota.totalPlannedMinutes += estMins;
        canteDayQuota.rebalanceNote = `Buffer matutino de ${estMins} min para rematar Tema ${goal.topicNumber} previo al repaso general.`;
      } else {
        canteDayQuota.rebalanceNote = "Mañana 100% reservada para repaso mental, esquema y cante oral ante tribunal.";
      }
    }
  } else {
    // DISTRIBUCIÓN EQUITATIVA Y PONDERADA EN LOS DÍAS DE ESTUDIO DISPONIBLES
    // Restamos las páginas que se reserven para el buffer de cante
    if (canteMorningBufferTopicId && canteMorningBufferPages > 0) {
      const p = pendingList.find((item) => item.topicId === canteMorningBufferTopicId);
      if (p) {
        p.remainingPages = Math.max(0, p.remainingPages - canteMorningBufferPages);
      }
    }

    // Distribuir cada tema a lo largo de los días disponibles
    for (const pending of pendingList) {
      if (pending.remainingPages <= 0) continue;

      let currentFrom = pending.startPage;
      let pagesLeftToDistribute = pending.remainingPages;

      // Asignar en bloques diarios razonables
      for (let dayIdx = 0; dayIdx < availableStudyDays; dayIdx++) {
        const dayDate = remainingStudyDays[dayIdx];
        const daysLeftCount = availableStudyDays - dayIdx;
        
        // Cuántas páginas de este tema tocan en este día
        const pagesForDay = Math.ceil(pagesLeftToDistribute / daysLeftCount);
        if (pagesForDay <= 0) break;

        const actualPages = Math.min(pagesForDay, pagesLeftToDistribute);
        const toPage = currentFrom + actualPages - 1;
        const estMins = Math.round(actualPages * pending.goal.minutesPerPage);

        const dayQuota = dailyQuotas[dayDate];
        if (dayQuota) {
          const isDone = params.manualDayCompletions?.[dayDate]?.[pending.topicId] ?? false;

          dayQuota.tasks.push({
            topicId: pending.topicId,
            topicNumber: pending.goal.topicNumber,
            topicTitle: pending.goal.topicTitle,
            subjectId: pending.goal.subjectId,
            totalPages: pending.goal.totalPages,
            fromPage: currentFrom,
            toPage,
            pagesCount: actualPages,
            estimatedMinutes: estMins,
            minutesPerPage: pending.goal.minutesPerPage,
            isCanteMorningBuffer: false,
            isCompleted: isDone
          });

          dayQuota.totalPlannedPages += actualPages;
          dayQuota.totalPlannedMinutes += estMins;
          if (isDone) {
            dayQuota.totalActualPagesCompleted += actualPages;
          }
        }

        currentFrom = toPage + 1;
        pagesLeftToDistribute -= actualPages;
      }
    }

    // Configurar la mañana del día de cante
    const canteDayQuota = dailyQuotas[targetDate];
    if (canteDayQuota) {
      if (canteMorningBufferTopicId && canteMorningBufferPages > 0) {
        const goal = topicGoals[canteMorningBufferTopicId];
        const estMins = Math.round(canteMorningBufferPages * goal.minutesPerPage);
        const fromP = goal.totalPages - canteMorningBufferPages + 1;
        canteDayQuota.tasks.push({
          topicId: goal.topicId,
          topicNumber: goal.topicNumber,
          topicTitle: goal.topicTitle,
          subjectId: goal.subjectId,
          totalPages: goal.totalPages,
          fromPage: fromP,
          toPage: goal.totalPages,
          pagesCount: canteMorningBufferPages,
          estimatedMinutes: estMins,
          minutesPerPage: goal.minutesPerPage,
          isCanteMorningBuffer: true,
          isCompleted: false
        });
        canteDayQuota.totalPlannedPages += canteMorningBufferPages;
        canteDayQuota.totalPlannedMinutes += estMins;
        canteDayQuota.rebalanceNote = `Buffer matutino de ${estMins}m para cerrar Tema ${goal.topicNumber}. Resto de mañana: Repaso de Cante.`;
      } else {
        canteDayQuota.rebalanceNote = "Mañana 100% reservada para repaso mental, esquema y cante oral.";
      }
    }
  }

  // 4. Calcular estado y progreso general
  const overallProgressPct = totalTargetPages > 0 
    ? Math.round((totalCompletedPages / totalTargetPages) * 100) 
    : 100;

  let planStatus: "on_track" | "ahead" | "behind" | "urgent" = "on_track";
  const daysRemaining = targetInfo.daysRemaining;

  if (overallProgressPct >= 100) {
    planStatus = "ahead";
  } else if (daysRemaining === 0) {
    planStatus = overallProgressPct >= 80 ? "on_track" : "urgent";
  } else if (daysRemaining === 1 && overallProgressPct < 60) {
    planStatus = "urgent";
  } else if (overallProgressPct < 30 && daysRemaining <= 2) {
    planStatus = "behind";
  }

  // Ritmo medio del opositor
  const paceValues = Object.values(topicGoals).map((g) => g.minutesPerPage);
  const avgPace = paceValues.length > 0 
    ? Math.round((paceValues.reduce((a, b) => a + b, 0) / paceValues.length) * 10) / 10 
    : DEFAULT_PACE_MINUTES_PER_PAGE.repaso;

  return {
    id: `plan-${targetDay}-${targetDate}`,
    targetCanteDay: targetDay,
    targetCanteDate: targetDate,
    daysRemaining,
    cycleStartDate,
    cycleEndDate: targetDate,
    assignedTopicIds: params.assignedTopicIds,
    topicGoals,
    dailyQuotas,
    historicalAverageMinPerPage: avgPace,
    totalTargetPages,
    totalCompletedPages,
    overallProgressPct,
    lastRebalancedAt: new Date().toISOString(),
    status: planStatus
  };
}

/**
 * Registra avance de páginas leídas en un tema y fecha específica,
 * provocando un recálculo automático instantáneo.
 */
export function recordPageProgressAndRebalance(
  currentPlan: WeeklyCantePlan,
  topicId: string,
  newCompletedPages: number,
  allTopics: Topic[],
  sessions: Session[],
  manualCompletions?: Record<string, Record<string, boolean>>
): WeeklyCantePlan {
  const overrides = {
    ...(currentPlan.topicGoals ? Object.fromEntries(
      Object.entries(currentPlan.topicGoals).map(([id, g]) => [id, { completedPages: g.completedPages }])
    ) : {}),
    [topicId]: { completedPages: newCompletedPages }
  };

  const customPages = Object.fromEntries(
    Object.entries(currentPlan.topicGoals || {}).map(([id, g]) => [id, g.totalPages])
  );

  return buildOrRebalanceWeeklyCantePlan({
    assignedTopicIds: currentPlan.assignedTopicIds,
    targetDay: currentPlan.targetCanteDay,
    targetDate: currentPlan.targetCanteDate,
    allTopics,
    sessions,
    existingPlan: currentPlan,
    customTopicPages: customPages,
    progressOverrides: overrides,
    manualDayCompletions: manualCompletions
  });
}
