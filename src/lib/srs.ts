import { getLocalDateString } from './utils';
export interface SRSState {
  easinessFactor: number;
  interval: number;
  repetitions: number;
}

export function calculateNextSRSState(
  difficulty: number,
  currentState: SRSState,
  lastReviewDateStr?: string
): { state: SRSState; nextReviewDate: string } {
  let { easinessFactor, interval, repetitions } = currentState;
  
  let quality = 3;
  if (difficulty <= 3) quality = 5; // Fácil -> Perfect
  else if (difficulty <= 6) quality = 4; // Normal -> Good
  else if (difficulty <= 8) quality = 3; // Difícil -> Hard, but remembered
  else quality = 1; // 9-10 Muy Difícil -> Failed

  if (quality < 3) {
    repetitions = 0;
    interval = 1; 
    easinessFactor = Math.max(1.3, easinessFactor - 0.2);
  } else {
    if (repetitions === 0) {
      interval = 1;
    } else if (repetitions === 1) {
      interval = 3;
    } else {
      interval = Math.round(interval * easinessFactor);
      easinessFactor = easinessFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    }
    repetitions += 1;
  }

  if (easinessFactor < 1.3) easinessFactor = 1.3;
  if (easinessFactor > 3.0) easinessFactor = 3.0; 

  const lastDate = lastReviewDateStr ? new Date(lastReviewDateStr) : new Date();
  if (isNaN(lastDate.getTime())) {
    lastDate.setTime(Date.now());
  }
  
  lastDate.setDate(lastDate.getDate() + interval);
  const nextReviewDate = getLocalDateString(lastDate);

  return {
    state: { easinessFactor, interval, repetitions },
    nextReviewDate
  };
}
