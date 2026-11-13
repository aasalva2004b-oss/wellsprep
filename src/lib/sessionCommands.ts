import { extractSessionTelemetry } from './sessionTelemetry';

/** Stable task/event identity is the only safe basis for idempotence. */
export function stableSessionId(input: Record<string, any>, generatedId: string): string {
  if (input.plannerTaskId) return `planner-${encodeURIComponent(String(input.plannerTaskId))}`;
  if (input.sourceEventId && input.sourceSegmentId !== undefined) {
    return `event-${encodeURIComponent(String(input.sourceEventId))}-${encodeURIComponent(String(input.sourceSegmentId))}`;
  }
  return generatedId;
}

export function normalizeSessionRecord(input: Record<string, any>, userId: string) {
  const aliases: Record<string, string> = { primer_estudio: 'estudio_inicial', estudio: 'estudio_inicial', simulacro: 'canto', cante: 'canto' };
  const type = aliases[input.type] || input.type;
  if (!['estudio_inicial', 'repaso', 'refresco', 'canto'].includes(type)) throw new Error('Tipo de sesión no válido.');
  const topicId = String(input.topicId || '').trim();
  if (!topicId || topicId.includes('/') || /^\d+$/.test(topicId)) throw new Error('La sesión necesita un identificador completo de tema y materia.');
  const date = String(input.date || '');
  const dateObject = new Date(`${date}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(dateObject.getTime()) || dateObject.toISOString().slice(0, 10) !== date) throw new Error('Fecha de sesión no válida.');
  const minutes = Number(input.durationMinutes ?? input.duration);
  const seconds = type === 'canto' ? Number(input.cantoSeconds ?? 0) : 0;
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > 1440 || !Number.isInteger(seconds) || seconds < 0 || seconds > 59 || minutes + seconds / 60 <= 0) throw new Error('Duración real de sesión no válida.');
  if (type === 'canto' && seconds > 0 && !Number.isInteger(minutes)) throw new Error('Minutos y segundos del cante deben indicarse por separado.');
  const difficulty = input.difficulty === undefined ? undefined : Number(input.difficulty);
  if (difficulty !== undefined && (!Number.isFinite(difficulty) || difficulty < 1 || difficulty > 10)) throw new Error('Dificultad de sesión no válida.');
  if (input.cantoGrade !== undefined && (!Number.isFinite(Number(input.cantoGrade)) || Number(input.cantoGrade) < 0 || Number(input.cantoGrade) > 10)) throw new Error('Nota de cante no válida.');
  if (input.retrieval !== undefined && (!input.retrieval || input.retrieval.assistance !== 'none'
    || !['success', 'failure'].includes(input.retrieval.outcome) || !['whole_topic', 'partial'].includes(input.retrieval.coverage))) throw new Error('Evaluación de recuperación no válida.');
  const result: Record<string, any> = {
    ...input, ...extractSessionTelemetry(input), userId, topicId, date, type,
    durationMinutes: minutes,
    difficulty, dificultadReal: difficulty,
    completesVuelta: (type === 'repaso' || type === 'canto') && input.completesVuelta === true,
    schemaVersion: 3,
  };
  delete result.id;
  // Retain imported aliases only for compatibility; new observations have one duration field.
  if ('durationReal' in input) result.durationReal = minutes;
  if ('effectiveHours' in input) result.effectiveHours = (minutes + seconds / 60) / 60;
  if (type === 'canto') result.cantoSeconds = seconds;
  else { delete result.cantoSeconds; delete result.cantoGrade; delete result.cantoType; }
  return result;
}
