import { getSessionCategory } from './canonicalTopicService';

export type EditableSessionActivity = '' | 'estudio_inicial' | 'repaso' | 'refresco' | 'canto';
export interface SessionEditForm {
  topicId: string;
  date: string;
  minutes: string;
  activity: EditableSessionActivity;
  difficulty: number | null;
  completesVuelta: boolean | undefined;
  cantoGrade: string;
  cantoSeconds: string;
  mistakes: string;
  notes: string;
}

function numeric(value: unknown): number | undefined {
  if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

/** Display stored observations without converting missing fields into measurements. */
export function readSessionEditForm(session: Record<string, any>): SessionEditForm {
  const category = getSessionCategory(session);
  const activity: EditableSessionActivity = category === 'initial_study' ? 'estudio_inicial'
    : category === 'review' ? 'repaso' : category === 'refresh' ? 'refresco' : category === 'cante' ? 'canto' : '';
  const explicit = session.durationMinutes ?? session.durationReal ?? session.duration;
  const hours = numeric(session.effectiveHours);
  const minutes = explicit !== undefined ? numeric(explicit) : hours !== undefined ? hours * 60 : undefined;
  const difficulty = numeric(session.dificultadReal ?? session.difficulty);
  const grade = numeric(session.cantoGrade);
  const seconds = numeric(session.cantoSeconds);
  return {
    topicId: typeof session.topicId === 'string' ? session.topicId : '',
    date: typeof session.date === 'string' ? session.date : '',
    minutes: minutes !== undefined ? String(minutes) : '', activity,
    difficulty: difficulty !== undefined && difficulty >= 1 && difficulty <= 10 ? difficulty : null,
    completesVuelta: typeof session.completesVuelta === 'boolean' ? session.completesVuelta : undefined,
    cantoGrade: grade !== undefined ? String(grade) : '', cantoSeconds: seconds !== undefined ? String(seconds) : '',
    mistakes: typeof session.mistakes === 'string' ? session.mistakes : '', notes: typeof session.notes === 'string' ? session.notes : '',
  };
}

/** An edit supplies facts only. The Provider retains forecasts and rebuilds derived values. */
export function buildSessionEditPatch(form: SessionEditForm) {
  if (!form.topicId.trim() || form.topicId.includes('/') || /^\d+$/.test(form.topicId)) throw new Error('Selecciona un tema válido con materia e identificador completo.');
  if (!['estudio_inicial', 'repaso', 'refresco', 'canto'].includes(form.activity)) throw new Error('Selecciona la actividad que realizaste.');
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(form.date) ? new Date(`${form.date}T00:00:00Z`) : new Date(NaN);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== form.date) throw new Error('Introduce la fecha real de la sesión.');
  const minutes = numeric(form.minutes);
  const seconds = form.activity === 'canto' && form.cantoSeconds.trim() ? numeric(form.cantoSeconds) : 0;
  if (minutes === undefined || minutes < 0 || seconds === undefined || !Number.isInteger(seconds) || seconds < 0 || seconds > 59
    || minutes + seconds / 60 <= 0 || minutes + seconds / 60 > 1440) throw new Error('Introduce una duración real válida, entre más de cero y 1440 minutos.');
  if (form.activity === 'canto' && seconds > 0 && !Number.isInteger(minutes)) throw new Error('Indica los minutos enteros del cante y sus segundos por separado.');
  if (form.difficulty !== null && (!Number.isFinite(form.difficulty) || form.difficulty < 1 || form.difficulty > 10)) throw new Error('La dificultad debe estar entre 1 y 10 o quedar sin calificar.');
  const grade = form.cantoGrade.trim() ? numeric(form.cantoGrade) : undefined;
  if (form.activity === 'canto' && form.cantoGrade.trim() && (grade === undefined || grade < 0 || grade > 10)) throw new Error('La nota del cante debe estar entre 0 y 10.');
  return {
    topicId: form.topicId.trim(), date: form.date, durationMinutes: minutes,
    type: form.activity, modality: form.activity,
    difficulty: form.difficulty ?? undefined, dificultadReal: form.difficulty ?? undefined,
    ...(form.completesVuelta !== undefined ? { completesVuelta: ['repaso', 'canto'].includes(form.activity) && form.completesVuelta === true } : {}),
    cantoGrade: form.activity === 'canto' ? grade : undefined,
    cantoSeconds: form.activity === 'canto' ? seconds : undefined,
    mistakes: form.mistakes, notes: form.notes,
  };
}
