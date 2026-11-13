import { getLocalDateString } from './utils';

export type ObservedSessionType = 'estudio_inicial' | 'repaso' | 'refresco' | 'canto';
export interface PredictionSnapshot {
  modelVersion: string;
  generatedAt: string;
  activity: string;
  estimatedMinutes: number | null;
  interval: { low: number; high: number } | null;
  evidenceCount: number;
  method: string;
  featuresUsed: string[];
  factors: string[];
  workPages?: number;
  inputs?: Record<string, unknown>;
}
export interface StudySessionTarget {
  topicId: string;
  title: string;
  type: ObservedSessionType;
  difficulty?: number;
  estimatedMinutes?: number | null;
  predictionSnapshot?: PredictionSnapshot;
  retentionPrediction?: Record<string, any>;
  metadata?: { plannerTaskId?: string; plannedDate?: string; startPage?: number; endPage?: number; pagesCount?: number; pagesNumbers?: number[]; totalPages?: number; totalWords?: number; isPartial?: boolean };
}
export interface ObservedSessionForm {
  minutes: string;
  difficulty: string;
  date: string;
  notes: string;
  completesVuelta: boolean;
  cantoGrade: string;
  cantoSeconds: string;
  startPage?: string;
  endPage?: string;
  confirmPlannedPages?: boolean;
  recallOutcome?: '' | 'success' | 'failure';
  recallCoverage?: 'whole_topic' | 'partial';
}

/** Estimates are retained for calibration but can never supply an observed duration. */
export function buildObservedSession(target: StudySessionTarget, form: ObservedSessionForm, now = new Date()) {
  const minutes = Number(form.minutes);
  const seconds = form.cantoSeconds.trim() ? Number(form.cantoSeconds) : 0;
  if (!form.minutes.trim() || !Number.isFinite(minutes) || minutes < 0 || (minutes === 0 && !(target.type === 'canto' && seconds > 0))) throw new Error('Introduce los minutos que has dedicado realmente.');
  const difficulty = Number(form.difficulty);
  if (!Number.isFinite(difficulty) || difficulty < 1 || difficulty > 10) throw new Error('La dificultad debe estar entre 1 y 10.');
  const date = new Date(`${form.date}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== form.date) throw new Error('Introduce una fecha válida.');
  if (!Number.isFinite(now.getTime()) || form.date > getLocalDateString(now)) throw new Error('Una sesión realizada no puede tener una fecha futura. Programa el trabajo en el planificador.');
  const session: Record<string, any> = {
    topicId: target.topicId,
    type: target.type,
    durationMinutes: minutes,
    difficulty,
    date: form.date,
    notes: form.notes.trim(),
    source: 'manual',
    completesVuelta: (target.type === 'repaso' || target.type === 'canto') && !target.metadata?.isPartial && form.completesVuelta === true,
  };
  if (Number.isFinite(target.estimatedMinutes) && target.estimatedMinutes > 0) session.estimatedMinutes = target.estimatedMinutes;
  if (target.predictionSnapshot) {
    // Captured before the observation is entered; never train a prediction on its own outcome.
    session.prediction = JSON.parse(JSON.stringify(target.predictionSnapshot));
    if (target.predictionSnapshot.estimatedMinutes !== null) session.estimatedMinutes = target.predictionSnapshot.estimatedMinutes;
  }
  if (target.retentionPrediction) session.retentionPrediction = JSON.parse(JSON.stringify(target.retentionPrediction));
  if (form.recallOutcome) {
    if (!['success', 'failure'].includes(form.recallOutcome) || !['whole_topic', 'partial'].includes(form.recallCoverage || '')) throw new Error('Indica el resultado y el alcance de la recuperación sin apuntes.');
    session.retrieval = { outcome: form.recallOutcome, coverage: form.recallCoverage, assistance: 'none', method: 'self_report' };
  }
  for (const key of ['plannerTaskId', 'plannedDate'] as const) {
    if (target.metadata?.[key] !== undefined) session[key] = target.metadata[key];
  }
  const firstText = form.startPage?.trim() || '';
  const lastText = form.endPage?.trim() || '';
  if (firstText || lastText) {
    const first = Number(firstText), last = Number(lastText);
    if (!firstText || !lastText || !Number.isInteger(first) || !Number.isInteger(last) || first < 1 || last < first || (target.metadata?.totalPages && last > target.metadata.totalPages)) throw new Error('Introduce un intervalo real válido dentro de las páginas del tema.');
    session.startPage = first; session.endPage = last; session.pagesCount = last - first + 1;
  } else if (form.confirmPlannedPages) {
    if (target.metadata?.pagesNumbers?.length) session.pagesNumbers = [...new Set(target.metadata.pagesNumbers)];
    else if (target.metadata?.startPage && target.metadata?.endPage) {
      session.startPage = target.metadata.startPage; session.endPage = target.metadata.endPage;
      session.pagesCount = target.metadata.endPage - target.metadata.startPage + 1;
    } else throw new Error('El plan no identifica páginas concretas; registra el intervalo real.');
  }
  if (target.metadata?.totalPages && target.metadata.totalPages > 0) session.totalPagesAtSession = target.metadata.totalPages;
  if (target.metadata?.totalWords && target.metadata.totalWords > 0) session.wordsAtSession = target.metadata.totalWords;
  if (target.type === 'canto') {
    if (!Number.isInteger(minutes)) throw new Error('Indica los minutos enteros del cante y sus segundos por separado.');
    if (!Number.isInteger(seconds) || seconds < 0 || seconds > 59) throw new Error('Los segundos del cante deben estar entre 0 y 59.');
    session.cantoSeconds = seconds;
    if (form.cantoGrade.trim()) {
      const grade = Number(form.cantoGrade);
      if (!Number.isFinite(grade) || grade < 0 || grade > 10) throw new Error('La nota del cante debe estar entre 0 y 10.');
      session.cantoGrade = grade;
    }
  }
  return session;
}
