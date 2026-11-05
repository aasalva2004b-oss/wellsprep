/**
 * WELLS PREP — MOTOR DEL PLANIFICADOR INTELIGENTE DE JUDICATURA
 * 
 * Modela las 4 actividades clave de la oposición:
 * 1. Estudio nuevo (Azul): fijación de temas nuevos en días sin cante.
 * 2. Refresco (Naranja): ciclo de 3 refrescos consecutivos (D+1, D+2, D+3).
 * 3. Repaso (Verde): consolidación de temas de meses anteriores y curva de Ebbinghaus.
 * 4. Cante (Morado): compromiso con preparador (Lunes y Jueves).
 */

import { Topic, Session } from "../types";
import { TopicProgressData } from "./prediction";
import { getLocalDateString, safeParseDate } from "./utils";
import { evaluateTopicPreparation } from "./preparationScore";

export type PlannerActivityType = "estudio_nuevo" | "refresco" | "repaso" | "cante";

export type PlannerTaskStatus = "pending" | "completed" | "delayed";

export interface PlannerTask {
  id: string;
  topicId: string;
  topicNumber: number;
  topicTitle: string;
  subjectId: string;
  activityType: PlannerActivityType;
  date: string; // ISO date "YYYY-MM-DD"
  status: PlannerTaskStatus;
  
  // Metadatos de la tarea
  estimatedMinutes: number;
  actualMinutes?: number;
  pagesCount: number;
  fromPage?: number;
  toPage?: number;
  notes?: string;
  
  // Metadatos para refrescos automáticos
  refrescoIndex?: 1 | 2 | 3; // R1, R2 o R3
  sourceStudyTaskId?: string; // ID de la tarea de estudio nuevo que lo originó
  
  // Marcas temporales
  createdAt: string;
  completedAt?: string;
}

export interface DayPlan {
  date: string; // "YYYY-MM-DD"
  dayName: string; // "Lunes", "Martes", ...
  shortName: string; // "LUN", "MAR", ...
  dayNumber: number; // 1-31
  monthName: string; // "Nov", ...
  isToday: boolean;
  isPast: boolean;
  isCanteOfficialDay: boolean; // Lunes o Jueves
  tasks: PlannerTask[];
  totalEstimatedMinutes: number;
  totalActualMinutes: number;
  targetDailyMinutes: number;
  isOverloaded: boolean;
  overloadMinutes: number;
  completedTasksCount: number;
  totalTasksCount: number;
  completionRatePct: number;
  hasCante: boolean;
  hasEstudioNuevo: boolean;
  hasRefresco: boolean;
  hasRepaso: boolean;
  realSessionsCount: number;
}

export interface WeekPlan {
  weekOffset: number; // 0 = actual, -1 = anterior, 1 = siguiente
  startDate: string; // Lunes "YYYY-MM-DD"
  endDate: string; // Domingo "YYYY-MM-DD"
  days: DayPlan[];
  totalEstimatedHours: number;
  totalActualHours: number;
  totalTargetHours: number;
  totalCompletedTasks: number;
  totalTasksCount: number;
  overloadedDaysCount: number;
  delayedTasksCount: number;
  completionRatePct: number;
  hoursVariance: number; // actual - estimated (en horas)
  intensityLevel: "optima" | "exigente" | "sobrecargada";
  proactiveWarnings: string[];
}

export interface PlannerSettings {
  targetDailyHours: number; // Por defecto: 7.5h
  velocidadEstudioNuevoMinPorPagina: number; // Por defecto: 5.5 min/pág
  velocidadRefrescoMinPorPagina: number; // Por defecto: 2.0 min/pág
  velocidadRepasoMinPorPagina: number; // Por defecto: 3.5 min/pág
  duracionEstimadaCantePorTemaMinutos: number; // Por defecto: 30 min (12:30 cante + 17:30 preparación)
  refresco1DuracionMinutos: number; // Por defecto: 45 min
  refresco2DuracionMinutos: number; // Por defecto: 35 min
  refresco3DuracionMinutos: number; // Por defecto: 25 min
}

export const DEFAULT_PLANNER_SETTINGS: PlannerSettings = {
  targetDailyHours: 7.5,
  velocidadEstudioNuevoMinPorPagina: 5.5,
  velocidadRefrescoMinPorPagina: 2.0,
  velocidadRepasoMinPorPagina: 3.5,
  duracionEstimadaCantePorTemaMinutos: 30,
  refresco1DuracionMinutos: 45,
  refresco2DuracionMinutos: 35,
  refresco3DuracionMinutos: 25
};

export const ACTIVITY_CONFIG: Record<
  PlannerActivityType,
  {
    label: string;
    description: string;
    colorHex: string;
    bgClass: string;
    borderClass: string;
    textClass: string;
    badgeClass: string;
    dotClass: string;
  }
> = {
  estudio_nuevo: {
    label: "Estudio Nuevo",
    description: "Fijación inicial del tema en días sin cante",
    colorHex: "#2563eb",
    bgClass: "bg-blue-50/80",
    borderClass: "border-blue-200 hover:border-blue-300",
    textClass: "text-blue-900",
    badgeClass: "bg-blue-100/80 text-blue-800 border-blue-200",
    dotClass: "bg-blue-600"
  },
  refresco: {
    label: "Refresco",
    description: "Ciclo de 3 días para asentar la memoria a corto plazo",
    colorHex: "#ea580c",
    bgClass: "bg-orange-50/80",
    borderClass: "border-orange-200 hover:border-orange-300",
    textClass: "text-orange-900",
    badgeClass: "bg-orange-100/80 text-orange-800 border-orange-200",
    dotClass: "bg-orange-600"
  },
  repaso: {
    label: "Repaso",
    description: "Renovación de la curva del olvido y temas mensuales",
    colorHex: "#16a34a",
    bgClass: "bg-emerald-50/80",
    borderClass: "border-emerald-200 hover:border-emerald-300",
    textClass: "text-emerald-900",
    badgeClass: "bg-emerald-100/80 text-emerald-800 border-emerald-200",
    dotClass: "bg-emerald-600"
  },
  cante: {
    label: "Cante",
    description: "Simulacro oral ante preparador (Lunes y Jueves)",
    colorHex: "#9333ea",
    bgClass: "bg-purple-50/80",
    borderClass: "border-purple-200 hover:border-purple-300",
    textClass: "text-purple-900",
    badgeClass: "bg-purple-100/80 text-purple-800 border-purple-200",
    dotClass: "bg-purple-600"
  }
};

/**
 * Calcula el tiempo estimado (en minutos) para una actividad y tema específicos,
 * integrando páginas, palabras, dificultad y velocidad histórica.
 */
export function estimateTaskDurationMinutes(
  topic: Topic | undefined,
  activityType: PlannerActivityType,
  sessions: Session[],
  settings: PlannerSettings = DEFAULT_PLANNER_SETTINGS,
  refrescoIndex?: 1 | 2 | 3
): number {
  if (!topic) {
    if (activityType === "cante") return settings.duracionEstimadaCantePorTemaMinutos;
    if (activityType === "refresco") return settings.refresco1DuracionMinutos;
    return 60;
  }

  const pages = topic.pages && topic.pages > 0 ? topic.pages : 18;
  const words = topic.numeroPalabras && topic.numeroPalabras > 0 ? topic.numeroPalabras : pages * 320;
  const difficulty = topic.difficulty || 5;

  // Elasticidad por dificultad (un tema de dificultad 8 tarda un 15% más que uno de 5)
  const difficultyMultiplier = 1 + (difficulty - 5) * 0.05;

  if (activityType === "cante") {
    // 12m 30s de cante oficial + 15m de lectura mental y esquema previo
    return settings.duracionEstimadaCantePorTemaMinutos;
  }

  if (activityType === "refresco") {
    if (refrescoIndex === 1) return Math.round(settings.refresco1DuracionMinutos * difficultyMultiplier);
    if (refrescoIndex === 2) return Math.round(settings.refresco2DuracionMinutos * difficultyMultiplier);
    if (refrescoIndex === 3) return Math.round(settings.refresco3DuracionMinutos * difficultyMultiplier);
    // Genérico si no tiene índice
    const refreshMins = pages * settings.velocidadRefrescoMinPorPagina * difficultyMultiplier;
    return Math.max(20, Math.round(refreshMins));
  }

  // Comprobar sesiones históricas de este tema para afinar ritmo real
  const relevantSessions = sessions.filter(
    (s) => s.topicId === topic.id && s.type !== "canto" && (s.durationMinutes || 0) > 0
  );

  if (activityType === "estudio_nuevo") {
    const studySessions = relevantSessions.filter((s) => s.type === "primer_estudio" || (s.type as string) === "estudio_inicial");
    if (studySessions.length > 0) {
      const avgMins = studySessions.reduce((acc, s) => acc + (s.durationMinutes || 0), 0) / studySessions.length;
      return Math.max(45, Math.round(avgMins));
    }
    const computed = pages * settings.velocidadEstudioNuevoMinPorPagina * difficultyMultiplier;
    return Math.max(60, Math.round(computed));
  }

  // Actividad: REPASO
  const reviewSessions = relevantSessions.filter((s) => s.type === "repaso" || s.type === "refresco");
  if (reviewSessions.length > 0) {
    const avgMins = reviewSessions.reduce((acc, s) => acc + (s.durationMinutes || 0), 0) / reviewSessions.length;
    return Math.max(30, Math.round(avgMins));
  }
  const reviewComputed = pages * settings.velocidadRepasoMinPorPagina * difficultyMultiplier;
  return Math.max(30, Math.round(reviewComputed));
}

/**
 * Calcula las 3 fechas hábiles consecutivas para los refrescos posteriores
 * al estudio de un tema nuevo.
 */
export function calculateNextStudyDays(startDateStr: string, count: number = 3): string[] {
  const result: string[] = [];
  const curr = safeParseDate(startDateStr);
  curr.setHours(0, 0, 0, 0);

  // Avanzamos día a día añadiendo días naturales/hábiles de estudio
  while (result.length < count) {
    curr.setDate(curr.getDate() + 1);
    result.push(getLocalDateString(curr));
  }
  return result;
}

/**
 * Genera automáticamente los 3 refrescos posteriores cuando se completa un estudio nuevo.
 * Garantiza que no existan duplicados para el mismo tema y ciclo.
 */
export function generateAutoRefrescos(
  completedStudyTask: PlannerTask,
  topic: Topic | undefined,
  existingTasks: PlannerTask[],
  settings: PlannerSettings = DEFAULT_PLANNER_SETTINGS
): PlannerTask[] {
  if (completedStudyTask.activityType !== "estudio_nuevo") {
    return [];
  }

  const topicId = completedStudyTask.topicId;
  const finishDate = completedStudyTask.date;
  const refreshDates = calculateNextStudyDays(finishDate, 3);

  // Evitar duplicados si ya existen refrescos originados por esta tarea
  const alreadyGenerated = existingTasks.some(
    (t) => t.sourceStudyTaskId === completedStudyTask.id || (t.topicId === topicId && t.activityType === "refresco" && t.date >= finishDate)
  );

  if (alreadyGenerated) {
    return [];
  }

  const newRefrescos: PlannerTask[] = [];
  const refrescoIndices: Array<1 | 2 | 3> = [1, 2, 3];

  refrescoIndices.forEach((idx, i) => {
    const taskDate = refreshDates[i];
    const estimatedMins = idx === 1 
      ? settings.refresco1DuracionMinutos 
      : idx === 2 
      ? settings.refresco2DuracionMinutos 
      : settings.refresco3DuracionMinutos;

    newRefrescos.push({
      id: `refresco-${topicId}-${idx}-${Date.now()}-${i}`,
      topicId,
      topicNumber: completedStudyTask.topicNumber,
      topicTitle: completedStudyTask.topicTitle,
      subjectId: completedStudyTask.subjectId,
      activityType: "refresco",
      date: taskDate,
      status: "pending",
      estimatedMinutes: estimatedMins,
      pagesCount: completedStudyTask.pagesCount || topic?.pages || 18,
      refrescoIndex: idx,
      sourceStudyTaskId: completedStudyTask.id,
      notes: `Refresco ${idx}/3 automático tras completar estudio nuevo el ${finishDate}.`,
      createdAt: new Date().toISOString()
    });
  });

  return newRefrescos;
}

/**
 * Construye la estructura semanal completa de Lunes a Domingo para una semana determinada.
 */
export function buildWeekPlan(
  tasks: PlannerTask[],
  weekOffset: number = 0,
  settings: PlannerSettings = DEFAULT_PLANNER_SETTINGS,
  referenceDate: Date = new Date(),
  sessions: Session[] = []
): WeekPlan {
  const today = new Date(referenceDate);
  const todayStr = getLocalDateString(today);
  const currentDayOfWeek = today.getDay(); // 0 Dom, 1 Lun, ...
  
  // Calcular Lunes de la semana seleccionada
  const distToMonday = currentDayOfWeek === 0 ? -6 : 1 - currentDayOfWeek;
  const monday = new Date(today);
  monday.setDate(today.getDate() + distToMonday + weekOffset * 7);
  monday.setHours(0, 0, 0, 0);

  const dayNames = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
  const shortNames = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];

  const days: DayPlan[] = [];
  let totalWeekEstMins = 0;
  let totalWeekActMins = 0;
  let totalWeekCompleted = 0;
  let totalWeekTasks = 0;
  let overloadedDaysCount = 0;
  let delayedTasksCount = 0;

  const targetDailyMinutes = Math.round(settings.targetDailyHours * 60);

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dateStr = getLocalDateString(d);
    
    const isToday = dateStr === todayStr;
    const isPast = dateStr < todayStr;
    const isCanteOfficialDay = i === 0 || i === 3; // Lunes o Jueves

    // Filtrar tareas correspondientes a este día
    const dayTasks = tasks.filter((t) => t.date === dateStr);

    // Actualizar estado 'delayed' si está en el pasado y sigue pendiente
    const processedTasks = dayTasks.map((t) => {
      if (isPast && t.status === "pending") {
        delayedTasksCount++;
        return { ...t, status: "delayed" as PlannerTaskStatus };
      }
      return t;
    });

    const dayEstMins = processedTasks.reduce((acc, t) => acc + (t.estimatedMinutes || 0), 0);
    
    // Telemetría real de sesiones registradas en WellsPrep/AeroFocus
    const realDaySessions = (sessions || []).filter((s) => (s.date || "").startsWith(dateStr));
    const sessionMins = realDaySessions.reduce((acc, s) => acc + (s.durationMinutes || (s as any).duration || 0), 0);
    const recordedTaskMins = processedTasks.reduce((acc, t) => acc + (t.actualMinutes || 0), 0);
    const dayActMins = Math.max(recordedTaskMins, sessionMins);

    const completedCount = processedTasks.filter((t) => t.status === "completed").length;
    const completionRatePct = processedTasks.length > 0 
      ? Math.round((completedCount / processedTasks.length) * 100) 
      : 0;

    const isOverloaded = dayEstMins > targetDailyMinutes;
    const overloadMinutes = Math.max(0, dayEstMins - targetDailyMinutes);
    if (isOverloaded) overloadedDaysCount++;

    totalWeekEstMins += dayEstMins;
    totalWeekActMins += dayActMins;
    totalWeekCompleted += completedCount;
    totalWeekTasks += processedTasks.length;

    const hasCante = processedTasks.some((t) => t.activityType === "cante") || isCanteOfficialDay;
    const hasEstudioNuevo = processedTasks.some((t) => t.activityType === "estudio_nuevo");
    const hasRefresco = processedTasks.some((t) => t.activityType === "refresco");
    const hasRepaso = processedTasks.some((t) => t.activityType === "repaso");

    days.push({
      date: dateStr,
      dayName: dayNames[i],
      shortName: shortNames[i],
      dayNumber: d.getDate(),
      monthName: d.toLocaleDateString("es-ES", { month: "short" }),
      isToday,
      isPast,
      isCanteOfficialDay,
      tasks: processedTasks,
      totalEstimatedMinutes: dayEstMins,
      totalActualMinutes: dayActMins,
      targetDailyMinutes,
      isOverloaded,
      overloadMinutes,
      completedTasksCount: completedCount,
      totalTasksCount: processedTasks.length,
      completionRatePct,
      hasCante,
      hasEstudioNuevo,
      hasRefresco,
      hasRepaso,
      realSessionsCount: realDaySessions.length
    });
  }

  const totalEstimatedHours = Math.round((totalWeekEstMins / 60) * 10) / 10;
  const totalActualHours = Math.round((totalWeekActMins / 60) * 10) / 10;
  const totalTargetHours = Math.round(settings.targetDailyHours * 6 * 10) / 10;
  const completionRatePct = totalWeekTasks > 0 ? Math.round((totalWeekCompleted / totalWeekTasks) * 100) : 0;
  const hoursVariance = Math.round((totalActualHours - totalEstimatedHours) * 10) / 10;

  let intensityLevel: "optima" | "exigente" | "sobrecargada" = "optima";
  if (totalEstimatedHours > 48) {
    intensityLevel = "sobrecargada";
  } else if (totalEstimatedHours > 42) {
    intensityLevel = "exigente";
  }

  // Generar advertencias y diagnósticos preventivos
  const proactiveWarnings: string[] = [];
  
  // Miércoles víspera de Cante con estudio nuevo
  const miercoles = days[2];
  if (miercoles && miercoles.hasEstudioNuevo) {
    proactiveWarnings.push("Víspera de cante (Miércoles): tienes programado estudio nuevo. Se recomienda reservar la tarde para repaso y cante oral.");
  }

  // Domingo con alta carga antes del cante de Lunes
  const domingo = days[6];
  if (domingo && domingo.totalEstimatedMinutes > 360) {
    proactiveWarnings.push("Domingo previo al cante de Lunes con carga elevada (>6h). Conviene dejar margen de descanso para rendir con agilidad mental.");
  }

  if (overloadedDaysCount > 0) {
    proactiveWarnings.push(`Detectados ${overloadedDaysCount} ${overloadedDaysCount === 1 ? "día sobrecargado" : "días sobrecargados"} sobre el límite de ${settings.targetDailyHours}h.`);
  }

  if (delayedTasksCount > 0) {
    proactiveWarnings.push(`${delayedTasksCount} ${delayedTasksCount === 1 ? "tarea pendiente acumulada" : "tareas pendientes acumuladas"} de jornadas anteriores.`);
  }

  return {
    weekOffset,
    startDate: days[0].date,
    endDate: days[6].date,
    days,
    totalEstimatedHours,
    totalActualHours,
    totalTargetHours,
    totalCompletedTasks: totalWeekCompleted,
    totalTasksCount: totalWeekTasks,
    overloadedDaysCount,
    delayedTasksCount,
    completionRatePct,
    hoursVariance,
    intensityLevel,
    proactiveWarnings
  };
}

export interface ProposedRebalanceMove {
  taskId: string;
  topicTitle: string;
  topicNumber: number;
  activityType: PlannerActivityType;
  fromDate: string;
  toDate: string;
  fromDayName: string;
  toDayName: string;
  minutesSaved: number;
  reason: string;
}

export interface RebalanceProposal {
  moves: ProposedRebalanceMove[];
  originalOverloadedDays: number;
  projectedOverloadedDays: number;
  explanation: string;
}

/**
 * Propone una redistribución inteligente para resolver sobrecargas y tareas retrasadas,
 * respetando estrictamente las prioridades (Cantes inamovibles, Refrescos secuenciales)
 * y solicitando confirmación al usuario antes de aplicar ningún cambio.
 */
export function proposeSmartRebalance(
  weekPlan: WeekPlan,
  allTasks: PlannerTask[],
  settings: PlannerSettings = DEFAULT_PLANNER_SETTINGS
): RebalanceProposal {
  const targetDailyMins = Math.round(settings.targetDailyHours * 60);
  const moves: ProposedRebalanceMove[] = [];

  // Copia de trabajo de los minutos por día
  const dayMinutesMap: Record<string, number> = {};
  weekPlan.days.forEach((d) => {
    dayMinutesMap[d.date] = d.totalEstimatedMinutes;
  });

  // 1. Identificar días sobrecargados
  const overloadedDays = weekPlan.days.filter((d) => d.totalEstimatedMinutes > targetDailyMins);

  for (const overloadedDay of overloadedDays) {
    let excessMinutes = dayMinutesMap[overloadedDay.date] - targetDailyMins;
    if (excessMinutes <= 15) continue;

    // Candidatos a mover: repasos libres o estudios nuevos (NUNCA mover cantes oficiales)
    const movableTasks = overloadedDay.tasks.filter(
      (t) => t.status !== "completed" && t.activityType !== "cante"
    ).sort((a, b) => {
      // Priorizar mover repasos antes que estudio nuevo
      if (a.activityType === "repaso" && b.activityType !== "repaso") return -1;
      if (b.activityType === "repaso" && a.activityType !== "repaso") return 1;
      return a.estimatedMinutes - b.estimatedMinutes;
    });

    for (const task of movableTasks) {
      if (excessMinutes <= 15) break;

      // Buscar un día receptor en la misma semana que tenga capacidad disponible
      const targetDay = weekPlan.days.find((candidate) => {
        if (candidate.date <= overloadedDay.date) return false; // Hacia adelante
        const currentMins = dayMinutesMap[candidate.date] || 0;
        return currentMins + task.estimatedMinutes <= targetDailyMins + 15;
      });

      if (targetDay) {
        moves.push({
          taskId: task.id,
          topicTitle: task.topicTitle,
          topicNumber: task.topicNumber,
          activityType: task.activityType,
          fromDate: overloadedDay.date,
          toDate: targetDay.date,
          fromDayName: overloadedDay.dayName,
          toDayName: targetDay.dayName,
          minutesSaved: task.estimatedMinutes,
          reason: `Aliviar sobrecarga de ${overloadedDay.dayName} (+${Math.round(excessMinutes)} min)`
        });

        // Actualizar mapa simulado
        dayMinutesMap[overloadedDay.date] -= task.estimatedMinutes;
        dayMinutesMap[targetDay.date] = (dayMinutesMap[targetDay.date] || 0) + task.estimatedMinutes;
        excessMinutes -= task.estimatedMinutes;
      }
    }
  }

  // Contar días sobrecargados resultantes
  let projectedOverloaded = 0;
  Object.values(dayMinutesMap).forEach((mins) => {
    if (mins > targetDailyMins) projectedOverloaded++;
  });

  return {
    moves,
    originalOverloadedDays: overloadedDays.length,
    projectedOverloadedDays: projectedOverloaded,
    explanation: moves.length > 0 
      ? `Se propone reubicar ${moves.length} tareas para equilibrar la semana por debajo de ${settings.targetDailyHours}h diarias.`
      : "La semana se encuentra actualmente bien distribuida o los compromisos fijos no admiten traslado automático."
  };
}
