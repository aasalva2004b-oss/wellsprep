export * from '../types/aerofocusWebhook';

import {
  PlsemaPhase,
  TaskStudyType,
  WellsprepPlsemaBreakdown,
  WellsprepPageStatV2,
  WellsprepSubtaskStatV2,
  WellsprepTaskDetailV2,
  WellsprepTopicBreakdownV2,
  WellsprepSessionTelemetryV2,
  WellsprepAnalyticsV2,
  WellsprepSubjectSummaryV2,
  AeroFocusWebhookPayloadV2,
  AeroFocusWebhookResponseV2
} from '../types/aerofocusWebhook';

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
  effectiveSeconds?: number;
  segundosEfectivos?: number;
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
  minutesPerPage?: number | null;
  minutosPorPagina?: number | null;
  secondsPerPage?: number | null;
  segundosPorPagina?: number | null;
  plsema?: WellsprepPlsemaBreakdown;
  pageBreakdown?: WellsprepPageStatV2[];
  tasksBreakdown?: WellsprepTaskDetailV2[];
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

export type AeroFocusWebhookPayload = AeroFocusWebhookPayloadV2;

export interface WebhookResolvedTopic {
  resolvedTopicId: string;
  resolvedSubjectId: string;
  resolvedTopicNumber: number;
  resolvedTopicTitle: string;
  modality: 'primer_estudio' | 'repaso' | 'refresco' | 'canto';
  effectiveHours: number;
  effectiveMinutes: number;
  effectiveSeconds?: number;
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
  minutesPerPage?: number | null;
  minutosPorPagina?: number | null;
  secondsPerPage?: number | null;
  segundosPorPagina?: number | null;
  plsema?: WellsprepPlsemaBreakdown;
  pageBreakdown?: WellsprepPageStatV2[];
  tasksBreakdown?: WellsprepTaskDetailV2[];
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
  flightIdsIncluded?: string[];
  syncScope?: 'single_session' | 'daily' | 'full_history' | string;
  schemaVersion?: string;
  dailyTotalEffectiveHours?: number;
  dailyTotalEffectiveMinutes?: number;
  totalFlightEffectiveMinutes: number;
  totalFlightEffectiveHours: number;
  status: 'pending' | 'quarantined' | 'processed' | 'error';
  errorMessage?: string;
  topics: WebhookResolvedTopic[];
  pageBreakdown?: WellsprepPageStatV2[];
  tasksBreakdown?: WellsprepTaskDetailV2[];
  sessionsTelemetry?: WellsprepSessionTelemetryV2[];
  plsema?: WellsprepPlsemaBreakdown;
  analytics?: WellsprepAnalyticsV2;
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
  avgMinutesPerPage?: number;
  totalPagesWorked?: number;
}
