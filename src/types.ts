export interface Session {
  id: string;
  topicId: string;
  date: string;
  type: 'primer_estudio' | 'estudio_inicial' | 'estudio' | 'repaso' | 'refresco' | 'canto' | 'simulacro';
  durationMinutes: number; // Duration in minutes
  
  // Measured historical coverage. Counts alone never identify unique pages.
  startPage?: number;
  endPage?: number;
  fromPage?: number;
  toPage?: number;
  pagesCount?: number;
  pagesStudied?: number;
  pagesNumbers?: number[];
  pageRanges?: Array<{ startPage: number; endPage: number }>;
  studyBlocks?: Array<{ id: string; completed: boolean; startPage?: number; endPage?: number }>;
  totalPagesAtSession?: number;
  isTopicCompleted?: boolean;
  plannerTaskId?: string;
  // Advanced Metadata
  difficulty?: number; // 1-10 scale
  dificultadReal?: number; // 1-10 scale
  cantoSeconds?: number;
  cantoType?: 'solo' | 'preparador';
  completesVuelta?: boolean; // Is this a solo practice or a mock exam with the preparer?
  cantoGrade?: number; // Score for canto (0-10)
  mistakes?: string; // Specific notes on failures/errors
  notes: string; // General notes

  // Integration & Sync Metadata
  source?: 'aerofocus' | 'manual' | string;
  flightId?: string;
  sourceFlightId?: string;
  modality?: 'estudio' | 'primer_estudio' | 'repaso' | 'refresco' | 'canto' | string;
  topicTitle?: string;
  effectiveHours?: number;
  createdAt?: any;
  updatedAt?: any;
}

export type TopicDifficulty = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10; // Expanding to 1-10 scale as per prediction logic

export interface Topic {
  id: string;
  subjectId: string;
  number: number;
  title: string;
  officialTitle?: string;
  fullTitle?: string;
  pages: number;
  difficulty: TopicDifficulty;
  
  // Custom Metadata
  numeroPalabras?: number;
  epigrafes?: number; // Number of epigraphs/sections
  
  // Legacy / Cached data (handled by Firestore / prediction engine now, but kept for compatibility)
  tiempoEstudioHoras: number;
  fechaPrimerEstudio: string;
  fechasRepasos: string[];
  mejorTiempoCantoMinutos: number;
  mejorTiempoCantoSegundos: number;
  notas: string;
}

export interface Subject {
  id: string;
  name: string;
  color: string; // for the bar chart
  activeClass: string; // for the tabs
  totalTopics: number;
}
