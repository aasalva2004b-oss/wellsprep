export interface AeroFocusTopicItem {
  topicId?: string;
  topicNumber?: number;
  topicTitle?: string;
  category?: string;
  modality: 'estudio' | 'primer_estudio' | 'repaso' | 'refresco' | 'canto';
  effectiveHours: number;
  effectiveMinutes: number;
  grossMinutes?: number;
  pageInfo?: {
    pagesRead?: number;
    startPage?: number;
    endPage?: number;
    currentPage?: number;
  };
}

export interface AeroFocusWebhookPayload {
  event?: string;
  version?: string;
  date: string;
  source?: string;
  flightId?: string;
  totalFlightEffectiveMinutes?: number;
  totalFlightEffectiveHours?: number;
  topics?: AeroFocusTopicItem[];
  summary?: {
    estudioHours?: number;
    repasoHours?: number;
    refrescoHours?: number;
    totalHours?: number;
  };
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
  cantoGrade?: number;
  cantoSeconds?: number;
  cantoType?: 'solo' | 'preparador';
  notes?: string;
  mistakes?: string;
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
}
