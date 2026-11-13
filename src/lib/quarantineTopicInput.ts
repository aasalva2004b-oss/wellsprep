export interface QuarantineTopicObservationInput {
  minutes: string;
  difficulty: string;
  completesVuelta: boolean;
  modality: string;
}

/** Form observations only. Missing measurements never receive a numeric default. */
export function parseQuarantineTopicObservation(input: QuarantineTopicObservationInput) {
  const minutes = Number(input.minutes.trim());
  if (!input.minutes.trim() || !Number.isFinite(minutes) || minutes <= 0 || minutes > 1440) {
    throw new Error('Indica los minutos reales, mayores que cero y hasta 1440.');
  }
  const difficulty = input.difficulty.trim() ? Number(input.difficulty.trim()) : undefined;
  if (difficulty !== undefined && (!Number.isFinite(difficulty) || difficulty < 1 || difficulty > 10)) {
    throw new Error('La dificultad debe estar entre 1 y 10, o quedar sin calificar.');
  }
  return {
    effectiveMinutes: minutes,
    effectiveHours: minutes / 60,
    difficulty,
    dificultadReal: difficulty,
    completesVuelta: ['repaso', 'canto', 'cante', 'simulacro'].includes(input.modality) && input.completesVuelta === true,
  };
}
