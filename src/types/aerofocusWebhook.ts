/**
 * AeroFocus Pro <-> WellsPrep Webhook Protocol v2.2.0
 * Contrato oficial de tipos para sincronización e idempotencia de ultra-alta precisión
 */

export type PlsemaPhase = 'prelectura' | 'lectura' | 'subrayado' | 'esquema' | 'memorizar' | 'cantar';
export type TaskStudyType = 'estudio' | 'repaso' | 'refresco' | 'canto';

export interface WellsprepPlsemaBreakdown {
  minutes: Record<PlsemaPhase, number>;      // Minutos exactos (2 decimales) por fase
  seconds: Record<PlsemaPhase, number>;      // Segundos exactos por fase
  hours: Record<PlsemaPhase, number>;        // Horas por fase
  percentages: Record<PlsemaPhase, number>;  // 0-100%
  totalMinutes: number;
  totalSeconds: number;
  dominantPhase: PlsemaPhase;
  activeRecallMinutes: number;               // memorizar + cantar
  passiveMinutes: number;                    // prelectura + lectura + subrayado
  schematicMinutes: number;                  // esquema
  activeRecallRatio: number;                 // % recuerdo activo (M + A)
  passiveRatio: number;                      // % asimilación pasiva (P + L + S)
  // Alias planos en español incluidos siempre:
  minutosPrelectura: number;
  minutosLectura: number;
  minutosSubrayado: number;
  minutosEsquema: number;
  minutosMemorizar: number;
  minutosCantar: number;
  segundosPrelectura: number;
  segundosLectura: number;
  segundosSubrayado: number;
  segundosEsquema: number;
  segundosMemorizar: number;
  segundosCantar: number;
}

export interface WellsprepPageStatV2 {
  pageKey: string;            // Clave canónica única: "${topicId}_p${pageNumber}" (ej. "jud-28_p4")
  pageNumber: number;         // Número de página (ej. 4)
  pagina: number;
  pageLabel: string;          // "Pág. 4"
  topicId: string;            // Ej. "jud-28"
  topicNumber?: number;       // Número dentro de su bloque/materia (ej. 1 para Civil Tema 1)
  temaNumero?: number;
  topicTitle: string;
  tema: string;
  subjectId: string;          // Ej. "derecho_civil"
  subjectName: string;        // Ej. "Derecho Civil"
  materia: string;
  modality: TaskStudyType;    // 'estudio' | 'repaso' | 'refresco'
  modalidad: TaskStudyType;
  effectiveMinutes: number;   // Minutos netos invertidos en esta página
  minutesPerPage: number;     // Ritmo exacto min/pág en esta página
  minutosPorPagina: number;
  effectiveSeconds: number;   // Segundos netos exactos en esta página
  secondsPerPage: number;
  segundosPorPagina: number;
  timeFormatted: string;      // Ej. "14m"
  completed: boolean;
  completada: boolean;
  densityTier: 'rapida' | 'media' | 'densa'; // Clasificación automática frente a la media del tema
  date: string;               // YYYY-MM-DD
  plsema: WellsprepPlsemaBreakdown; // Fases PLSEMA exactas invertidas en ESTA página
  fasesPlsema: WellsprepPlsemaBreakdown;
}

export interface WellsprepSubtaskStatV2 {
  id: string;
  text: string;
  phase: PlsemaPhase | null;
  fase: PlsemaPhase | null;
  completed: boolean;
  sessionSeconds: number;     // Segundos cronometrados en este vuelo específico
  cumulativeSeconds: number;  // Segundos acumulados totales en la subtarea
  minutes: number;
}

export interface WellsprepTaskDetailV2 {
  flightId: string;
  date: string;               // YYYY-MM-DD
  taskId: string;
  text: string;
  topicId: string;
  topicNumber?: number;
  topicTitle: string;
  subjectName: string;
  modality: TaskStudyType;
  effectiveMinutes: number;
  effectiveSeconds: number;
  minutesPerPage: number | null;
  minutosPorPagina: number | null;
  pagesNumbers: number[];     // Lista explícita de páginas trabajadas en la tarea, ej. [1, 2, 3]
  pagesCount: number;
  pagesText: string;          // Ej. "Págs. 1-3" o "Pág. 4"
  completed: boolean;
  isTopicCompleted: boolean;  // TRUE solo si el alumno marcó el TEMA ENTERO como finalizado
  plsema: WellsprepPlsemaBreakdown;
  subtasks: WellsprepSubtaskStatV2[];
}

export interface WellsprepTopicBreakdownV2 {
  topicId: string;            // ID canónico en AeroFocus (ej. "jud-1" .. "jud-328")
  subjectId?: string;         // Ej. "derecho_constitucional", "derecho_civil"
  subjectName?: string;       // Ej. "Derecho Civil"
  category?: string;          // Categoría oficial del bloque
  materia?: string;
  topicNumber?: number;       // Número del tema DENTRO de su bloque (ej. Civil Tema 1 -> 1)
  temaNumero?: number;
  topicTitle: string;
  modality: TaskStudyType;    // 'estudio' | 'repaso' | 'refresco'
  effectiveMinutes: number;   // Calibrado con método del resto mayor: sum(topics) === totalEffectiveMinutes
  effectiveSeconds?: number;
  effectiveHours: number;
  grossMinutes: number;
  distractionSeconds: number;
  pages?: {
    pageStart?: number;
    pageEnd?: number;
    pagesCount?: number;
    rawText?: string;
  };
  startPage?: number | null;
  endPage?: number | null;
  pagesCount?: number | null;
  pagesText?: string;
  minutesPerPage?: number | null;
  minutosPorPagina?: number | null;
  secondsPerPage?: number | null;
  segundosPorPagina?: number | null;
  plsema?: WellsprepPlsemaBreakdown;
  pageBreakdown?: WellsprepPageStatV2[];
  tasksBreakdown?: WellsprepTaskDetailV2[];
  isTopicCompleted: boolean;
  status?: 'completed' | 'in_progress';
  summaryLine?: string;
}

export interface WellsprepSubjectSummaryV2 {
  subjectId: string;
  subjectName: string;
  category?: string;
  materia?: string;
  effectiveMinutes: number;
  effectiveHours: number;
  topicsCount: number;
  topicsCompletedCount: number;
  avgMinutesPerPage?: number;
  plsema?: WellsprepPlsemaBreakdown;
}

export interface WellsprepSessionTelemetryV2 {
  flightId: string;
  date: string;               // YYYY-MM-DD
  startTime?: number;         // Epoch ms
  endTime?: number;           // Epoch ms
  from: string;               // ICAO origen (ej. "LEMD")
  to: string;                 // ICAO destino (ej. "LFPG")
  aircraftId: string;
  grossMinutes: number;
  effectiveMinutes: number;   // Tiempo neto real (-1 min por distracción)
  effectiveSeconds: number;
  distractionsCount: number;
  firstDistractionMinute: number | null; // Minuto exacto en que cayó la atención por 1ª vez
  distractionMinutes: number[];          // Minutos exactos de cada distracción (ej. [18, 34])
  focusScore: number;                    // 0-100%
  xpEarned: number;
  creditsEarned: number;
  pagesWorkedCount: number;
  avgMinutesPerPage: number;
  minutosPorPagina: number;
  plsema: WellsprepPlsemaBreakdown;
  tasksCount: number;
}

export interface WellsprepAnalyticsV2 {
  overview?: {
    totalFlights?: number;
    totalEffectiveMinutes?: number;
    totalEffectiveHours?: number;
    totalGrossMinutes?: number;
    totalGrossHours?: number;
    focusScoreAverage?: number;
    purezaFocoGlobal?: number;
    streakDays?: number;
    currentStreak?: number;
    xpTotal?: number;
    rankTitle?: string;
  };
  pagesPace?: {
    avgMinutesPerPage?: number;
    avgSecondsPerPage?: number;
    totalPagesTracked?: number;
    fastestPage?: { pageKey: string; topicTitle: string; pageNumber: number; minutesPerPage: number };
    slowestPage?: { pageKey: string; topicTitle: string; pageNumber: number; minutesPerPage: number };
    pages?: WellsprepPageStatV2[];
  };
  plsemaGlobal?: {
    totalHours?: number;
    totalMinutes?: number;
    dominantPhase?: PlsemaPhase;
    activeRecallRatio?: number;
    passiveRatio?: number;
    phaseMinutes?: Record<PlsemaPhase, number>;
    phaseSeconds?: Record<PlsemaPhase, number>;
    phaseBreakdown?: Array<{
      phase: PlsemaPhase;
      label: string;
      minutes: number;
      percentage: number;
    }>;
    evaluation?: {
      diagnosis?: string;
      recommendation?: string;
      activeRecallRatio?: number;
      passiveRatio?: number;
    };
  };
  topicsGlobal?: {
    totalTopicsWorked?: number;
    avgHoursPerTopic?: number;
    hardestTopics?: Array<{ topicId: string; topicTitle: string; minutesPerPage?: number; hours?: number }>;
    easiestTopics?: Array<{ topicId: string; topicTitle: string; minutesPerPage?: number; hours?: number }>;
    topics?: Array<{
      topicId: string;
      topicTitle: string;
      subjectName: string;
      effectiveHours: number;
      minutesPerPage?: number;
      difficultyTier?: 'exigente' | 'medio' | 'rapido';
      isCompleted: boolean;
    }>;
  };
  modalities?: {
    estudio?: {
      effectiveMinutes: number;
      effectiveHours: number;
      pagesCount: number;
      avgMinutesPerPage: number;
    };
    repaso?: {
      effectiveMinutes: number;
      effectiveHours: number;
      avgMinutesPerTopic: number;
    };
    refresco?: {
      effectiveMinutes: number;
      effectiveHours: number;
      avgMinutesPerTopic: number;
    };
    canto?: {
      effectiveMinutes: number;
      effectiveHours: number;
      cantosCount: number;
    };
    dailyTrend?: Array<{ date: string; estudioHours: number; repasoHours: number; refrescoHours: number }>;
  };
  chronobiology?: {
    peakHour?: number;
    peakTimeBlock?: string;
    peakDay?: string;
    lowestDay?: string;
    hourly?: Array<{ hour: number; minutes: number; focusScore: number }>;
    daysOfWeek?: Array<{ day: string; minutes: number; sessionsCount: number }>;
    cognitiveFatigue?: {
      recommendedSessionMinutes?: number;
      averageFirstDistractionMinute?: number;
      resilienceScore?: number;
      morningShift?: { avgMinutes: number; focusScore: number };
      afternoonShift?: { avgMinutes: number; focusScore: number };
      fatigueValley?: string;
      durationDropoffCurve?: Array<{ durationMinute: number; retainedFocusPercentage: number }>;
    };
  };
  trendsAndConsistency?: {
    weekly?: { thisWeekHours: number; lastWeekHours: number; deltaHours: number; deltaPercentage: number };
    monthly?: { thisMonthHours: number; lastMonthHours: number; deltaPercentage: number };
    sameDayLastMonth?: { date: string; hours: number; minutesPerPage: number };
  };
  memoryDecay?: {
    overallRetentionHealthScore?: number;
    freshCount?: number;
    warningCount?: number;
    coolingCount?: number;
    criticalCount?: number;
    topPriorityReviewList?: Array<{
      topicId: string;
      topicTitle: string;
      subjectName: string;
      daysSinceLastReview: number;
      retentionScore: number;
      urgency: 'critica' | 'alta' | 'media';
    }>;
  };
  examProjection?: {
    estimatedDateVuelta1?: string;
    estimatedDateVuelta2?: string;
    targetExamDate?: string;
    daysRemaining?: number;
    dailyHoursRequired?: number;
    feasibility?: 'holgado' | 'viable' | 'critico' | 'inviable';
    simulations?: {
      plus1HourDaily?: { finishDate: string; daysSaved: number };
      plus2HoursDaily?: { finishDate: string; daysSaved: number };
    };
  };
  cantes?: {
    totalCantos?: number;
    passedPercentage?: number;
    averageGrade?: number;
    averageMinutesPerTopic?: number;
    records?: Array<{
      date: string;
      topicTitle: string;
      durationSeconds: number;
      grade?: number;
      tribunalStatus?: string;
    }>;
  };
}

export interface AeroFocusWebhookPayloadV2 {
  telemetrySchemaVersion?: '2.2.0' | string;
  schemaVersion?: '2.2.0' | string;
  version?: string;
  event?: 'study_session_completed' | 'daily_sync' | 'full_history_sync' | 'test_connection' | 'ping' | string;
  syncScope?: 'single_session' | 'daily' | 'full_history' | string;
  isFullHistorySync?: boolean;
  isTest?: boolean;
  isDiagnosticPing?: boolean;
  transactionId?: string;
  flightId?: string;
  flightIdsIncluded?: string[];
  timestamp?: number | string;
  date?: string;               // YYYY-MM-DD
  fecha?: string;
  source?: string;
  apiKey?: string;
  token?: string;

  // Totales netos en raíz
  minutosEfectivos?: number;
  dailyTotalEffectiveMinutes?: number;
  totalEffectiveStudyMinutes?: number;
  effectiveMinutes?: number;
  segundosEfectivos?: number;
  effectiveSeconds?: number;
  horasEfectivas?: number;
  effectiveHours?: number;
  dailyTotalEffectiveHours?: number;
  grossMinutes?: number;
  minutosBrutos?: number;
  totalDistractionMinutes?: number;
  focusScore?: number;
  pilotCallsign?: string;
  callsignName?: string;

  // Páginas en raíz
  totalPagesWorked?: number;
  paginasTrabajadas?: number;
  avgMinutesPerPage?: number;
  minutosPorPagina?: number;
  avgSecondsPerPage?: number;
  segundosPorPagina?: number;
  pageBreakdown?: WellsprepPageStatV2[];

  // PLSEMA en raíz
  plsema?: WellsprepPlsemaBreakdown;
  fasesPlsema?: WellsprepPlsemaBreakdown;

  // Tareas, Sesiones y Temas
  tasksBreakdown?: WellsprepTaskDetailV2[];
  sessions?: WellsprepSessionTelemetryV2[];
  sessionTelemetry?: WellsprepSessionTelemetryV2;
  subjects?: WellsprepSubjectSummaryV2[];
  topics?: WellsprepTopicBreakdownV2[];
  items?: any[];

  // Snapshot Global Completo
  analytics?: WellsprepAnalyticsV2;
  estadisticasGlobales?: WellsprepAnalyticsV2;

  // Reporte / Textos
  reportMarkdown?: string;
  summary?: any;
  message?: string;
  [key: string]: any;
}

export interface AeroFocusWebhookResponseV2 {
  ok: boolean;
  success: boolean;
  schemaVersion: '2.2.0';
  receivedEvent: string;
  transactionId: string;
  date: string;
  reconciledFlightsCount: number;
  effectiveMinutesAssigned: number;
  pagesAssigned: number;
  avgMinutesPerPage: number;
  plsemaAssigned: boolean;
  globalAnalyticsUpdated: boolean;
  message?: string;
  status?: string;
}
