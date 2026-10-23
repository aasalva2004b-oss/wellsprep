export interface AeroFocusTopicItem {
  topicId?: string;
  topicNumber?: number;
  temaNumero?: number;
  topicTitle?: string;
  topic?: string;
  tema?: string;
  category?: string;
  materia?: string;
  subject?: string;
  subjectName?: string;
  asignatura?: string;
  modality?: 'estudio' | 'primer_estudio' | 'repaso' | 'refresco' | 'canto' | string;
  modalidad?: string;
  type?: string;
  effectiveHours?: number;
  horasEfectivas?: number;
  effectiveMinutes?: number;
  minutosEfectivos?: number;
  grossMinutes?: number;
  minutosBrutos?: number;
  timeFormatted?: string;
  distractionSeconds?: number;
  segundosDistraccion?: number;
  pages?: {
    pageStart?: number;
    pageEnd?: number;
    pagesCount?: number;
    rawText?: string;
  };
  startPage?: number;
  endPage?: number;
  pagesCount?: number;
  pagesText?: string;
  paginas?: string;
  isTopicCompleted?: boolean;
  completed?: boolean;
  completado?: boolean;
  status?: string;
  summaryLine?: string;
  pageInfo?: {
    pagesRead?: number;
    startPage?: number;
    endPage?: number;
    currentPage?: number;
  };
}

export interface AeroFocusWebhookPayload {
  schemaVersion?: string;
  event?: string;
  version?: string;
  transactionId?: string;
  timestamp?: string;
  date?: string;
  fecha?: string;
  source?: string;
  flightId?: string;
  targetDailyHour?: number;
  pilotCallsign?: string;
  callsignName?: string;
  dailyTotalFlightMinutes?: number;
  dailyTotalEffectiveMinutes?: number;
  dailyTotalEffectiveHours?: number;
  totalFlightEffectiveMinutes?: number;
  totalFlightEffectiveHours?: number;
  totalEffectiveHours?: number;
  horasEfectivas?: number;
  minutosEfectivos?: number;
  tiempoFormateado?: string;
  totalDistractionMinutes?: number;
  sessionsCount?: number;
  focusScore?: number;
  subject?: string;
  materia?: string;
  subjects?: any[];
  topics?: AeroFocusTopicItem[];
  sessions?: any[];
  summary?: {
    estudioHours?: number;
    repasoHours?: number;
    refrescoHours?: number;
    cantoHours?: number;
    totalHours?: number;
    horasEstudio?: number;
    horasRepaso?: number;
    horasRefresco?: number;
    totalMinutos?: number;
    minutosEfectivos?: number;
  };
  resumen?: {
    horasEfectivas?: number;
    minutosEfectivos?: number;
    tiempoFormateado?: string;
    horasEstudio?: number;
    horasRepaso?: number;
    horasRefresco?: number;
  };
  reportMarkdown?: string;
  textSummary?: string;
  resumenTexto?: string;
  message?: string;
  telemetry?: {
    appVersion?: string;
    sourceApp?: string;
    environment?: string;
    [key: string]: any;
  };
  isTest?: boolean;
  [key: string]: any;
}

export interface WebhookResolvedTopic {
  resolvedTopicId: string;
  resolvedSubjectId: string;
  resolvedTopicNumber: number;
  resolvedTopicTitle: string;
  modality: 'primer_estudio' | 'repaso' | 'refresco' | 'canto';
  effectiveHours: number;
  effectiveMinutes: number;
  difficulty?: number;
  dificultadReal?: number;
  completesVuelta?: boolean;
  isTopicCompleted?: boolean;
  cantoGrade?: number;
  cantoSeconds?: number;
  cantoType?: 'solo' | 'preparador';
  notes?: string;
  mistakes?: string;
  startPage?: number;
  endPage?: number;
  pagesCount?: number;
  pagesText?: string;
  distractionSeconds?: number;
  summaryLine?: string;
  pageInfo?: {
    pagesRead?: number;
    startPage?: number;
    endPage?: number;
    currentPage?: number;
  };
  original?: AeroFocusTopicItem | any;
}

export interface WebhookSyncRecord {
  id: string;
  receivedAt: string;
  date: string;
  source: string;
  flightId: string;
  transactionId?: string;
  dailyTotalEffectiveHours?: number;
  totalFlightEffectiveMinutes: number;
  totalFlightEffectiveHours: number;
  status: 'pending' | 'quarantined' | 'processed' | 'error';
  errorMessage?: string;
  topics: WebhookResolvedTopic[];
  rawPayload?: any;
  summary?: {
    estudioHours?: number;
    repasoHours?: number;
    refrescoHours?: number;
    cantoHours?: number;
    totalHours?: number;
  };
  reportMarkdown?: string;
  pilotCallsign?: string;
  focusScore?: number;
}
