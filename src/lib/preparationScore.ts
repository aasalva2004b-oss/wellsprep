import { calculateCanonicalRetention } from './ebbinghaus';
import type { CanonicalTopic } from './canonicalTopicService';
import type { RetentionEstimate } from './retentionModel';
/** Observed oral feedback and an independent, uncertain recall estimate. */

export interface TopicPreparationEvaluation {
  // Compatibility score aliases contain only the latest observed grade. Zero is
  // a storage/UI sentinel when scoreAvailable is false, never an inferred grade.
  scoreAvailable: boolean;
  overallScore: number;          // Latest observed grade; gate with scoreAvailable.
  projectedScore: number;        // Compatibility alias; no projected grade is calculated.
  peakScore: number;             // Compatibility alias; not a historical maximum.
  scoreDecay: number;            // Always 0: time does not alter an observed grade.
  isDecayed: boolean;            // Always false: no inferred grade decay.
  decayDiagnosis: string;

  gradeCategory: 'sobresaliente' | 'notable' | 'bien' | 'suficiente' | 'insuficiente' | 'critico';
  gradeLabel: string;            // Ej: "Sobresaliente (Tribunal)", "Notable Alto", etc.
  gradeBadgeClass: string;
  gradeTextColor: string;
  gradeBorderColor: string;
  
  // Factor 1: Cronómetro del Cante (Meta 12:30, ventana 11:50 - 13:40)
  timeScore: number;             // 1.0 a 10.0
  hasCanto: boolean;
  totalCantoSecs: number;
  timeFormatted: string;
  optimalSecs: number;           // 750 (12:30)
  windowMinSecs: number;         // 710 (11:50)
  windowMaxSecs: number;         // 820 (13:40)
  timeDevianceSecs: number;      // diferencia con 750s (+/-)
  timeDevianceFormatted: string; // "+25s", "-40s", "Exacto"
  timeZone: 'perfect' | 'in_window' | 'slightly_short' | 'slightly_long' | 'too_short' | 'too_long' | 'no_canto';
  timeDiagnosis: string;
  
  // Factor 2: Curva de Ebbinghaus / Olvido Dinámica
  retentionAvailable: boolean;
  retentionEstimate?: RetentionEstimate;
  retentionEvidence: 'recorded' | 'legacy' | 'none';
  retentionPct: number;          // 0 a 100%
  retentionScore: number;        // 1.0 a 10.0
  retentionDecayFactor: number;  // 0.04 a 1.0 (R(t))
  effectiveDaysElapsed: number;  // t_eff ponderado por cante 100% vs repaso 50%
  daysSinceCanto: number | null; // Días sin cantar
  daysSinceReview: number | null;// Días sin repasar estudio
  daysSinceTouch: number | null; // Último contacto global
  memoryStabilityDays: number;   // S (vida media neuronal en días)
  ebbinghausDiagnosis: string;
  isUrgentRefresh: boolean;
  
  // Factor 3: Historial de Notas del Preparador
  officialGrade: number | null;
  gradeScore: number;            // 1.0 a 10.0
  gradeDiagnosis: string;
  
  // Factor 4: Maduración y Consolidación (Vueltas + Repasos)
  vueltas: number;
  reviewsCount: number;
  masteryScore: number;          // Neutral 0: no assessment is inferred from counts.
  masteryDiagnosis: string;

  // Consejo ejecutivo para alcanzar el 10
  actionPlan: string;
  stabilityLabel: string;        // "Estable" | "Desgaste leve" | "Alerta olvido"
  isReadyForTribunal: boolean;   // False until readiness has an explicit assessment.
}

export const OPTIMAL_CANTO_SECS = 12 * 60 + 30; // 750s = 12m 30s
export const WINDOW_MIN_SECS = 11 * 60 + 50;    // 710s = 11m 50s
export const WINDOW_MAX_SECS = 13 * 60 + 40;    // 820s = 13m 40s
export const BASELINE_MEMORY_SCORE = 2.0;       // Puntuación basal de retención residual

/**
 * Calcula la puntuación del cronómetro (1-10) en base a la cercanía con 12:30 (750s)
 * y el cumplimiento estricto de la ventana reglamentaria [11:50, 13:40].
 */
export function calculateCantoTimeScore(totalSecs: number | null | undefined): {
  score: number;
  zone: 'perfect' | 'in_window' | 'slightly_short' | 'slightly_long' | 'too_short' | 'too_long' | 'no_canto';
  diagnosis: string;
  devianceSecs: number;
  devianceFormatted: string;
} {
  if (totalSecs == null || totalSecs <= 0) {
    return {
      score: 2.5,
      zone: 'no_canto',
      diagnosis: 'Sin cante grabado. Es imprescindible cronometrar el cante para evaluar la dicción y ritmo.',
      devianceSecs: 0,
      devianceFormatted: 'Sin datos'
    };
  }

  const deviance = totalSecs - OPTIMAL_CANTO_SECS;
  const absDeviance = Math.abs(deviance);
  const devianceFormatted = absDeviance === 0 
    ? 'Clavado (12:30)' 
    : deviance > 0 
      ? `+${Math.floor(deviance / 60)}m ${(deviance % 60).toString().padStart(2, '0')}s` 
      : `-${Math.floor(absDeviance / 60)}m ${(absDeviance % 60).toString().padStart(2, '0')}s`;

  // 1. Perfección absoluta: dentro de +/- 20 segundos de 12:30 (12:10 a 12:50)
  if (absDeviance <= 20) {
    const penalty = (absDeviance / 20) * 0.4;
    return {
      score: Math.max(9.6, +(10 - penalty).toFixed(1)),
      zone: 'perfect',
      diagnosis: 'Tiempo perfecto de tribunal. Clavado a los 12:30 óptimos.',
      devianceSecs: deviance,
      devianceFormatted
    };
  }

  // 2. Dentro de la ventana reglamentaria [11:50, 13:40] (710s a 820s)
  if (totalSecs >= WINDOW_MIN_SECS && totalSecs <= WINDOW_MAX_SECS) {
    const maxDev = deviance > 0 ? (WINDOW_MAX_SECS - OPTIMAL_CANTO_SECS) : (OPTIMAL_CANTO_SECS - WINDOW_MIN_SECS);
    const ratio = absDeviance / maxDev; // 0.2 a 1.0
    const score = +(9.5 - ratio * 1.5).toFixed(1); // 8.0 a 9.5
    return {
      score: Math.max(8.0, score),
      zone: 'in_window',
      diagnosis: deviance > 0 
        ? `Dentro del margen reglamentario (${devianceFormatted} de 12:30). Ritmo seguro.`
        : `Dentro del margen reglamentario (${devianceFormatted} de 12:30). Buen ritmo.`,
      devianceSecs: deviance,
      devianceFormatted
    };
  }

  // 3. Demasiado corto (< 11:50)
  if (totalSecs < WINDOW_MIN_SECS) {
    if (totalSecs >= 11 * 60) {
      return {
        score: 6.5,
        zone: 'slightly_short',
        diagnosis: `Ligeramente corto (${devianceFormatted}). Desarrolla más los epígrafes para alcanzar los 12:30.`,
        devianceSecs: deviance,
        devianceFormatted
      };
    } else if (totalSecs >= 10 * 60) {
      return {
        score: 4.5,
        zone: 'too_short',
        diagnosis: `Demasiado rápido (${devianceFormatted}). Te estás saltando artículos o conceptos clave.`,
        devianceSecs: deviance,
        devianceFormatted
      };
    } else {
      return {
        score: 2.0,
        zone: 'too_short',
        diagnosis: `Cante incompleto (<10 min). El tribunal exigirá el tiempo oficial.`,
        devianceSecs: deviance,
        devianceFormatted
      };
    }
  }

  // 4. Excedido (> 13:40)
  if (totalSecs <= 14 * 60 + 30) {
    return {
      score: 6.2,
      zone: 'slightly_long',
      diagnosis: `Excedido (${devianceFormatted}). Riesgo de que el preparador o tribunal te corte. Poda detalles secundarios.`,
      devianceSecs: deviance,
      devianceFormatted
    };
  } else if (totalSecs <= 15 * 60) {
    return {
      score: 4.0,
      zone: 'too_long',
      diagnosis: `Peligro alto de corte (${devianceFormatted}). Supera los 14:30 minutos, ajuste obligatorio.`,
      devianceSecs: deviance,
      devianceFormatted
    };
  } else {
    return {
      score: 1.5,
      zone: 'too_long',
      diagnosis: `Corte automático (>15 min). La campana del tribunal descalifica el cante.`,
      devianceSecs: deviance,
      devianceFormatted
    };
  }
}

export interface EbbinghausCalculationOptions {
  canonicalTopic?: CanonicalTopic;
  daysSinceCanto?: number | null;
  daysSinceReview?: number | null;
  daysSinceTouch?: number | null;
  vueltas?: number;
  reviewsCount?: number;
  difficulty?: number;
}

/**
 * Curva del Olvido de Hermann Ebbinghaus Continua y Diferencial:
 * R = e^(-t_eff / S)
 * - t_eff ponderado: Cante frena al 100%, Repasos de estudio al 50%.
 * - S = Estabilidad de memoria reforzada por vueltas y repasos.
 */
/** Scalar legacy arguments do not contain enough evidence to reconstruct a topic history. */
export function calculateEbbinghausRetention(
  arg1?: number | null | EbbinghausCalculationOptions,
  _vueltasArg = 0,
  _reviewsCountArg = 0,
) {
  const canonical = typeof arg1 === 'object' && arg1 !== null ? arg1.canonicalTopic : undefined;
  const analysis = calculateCanonicalRetention(canonical);
  return {
    hasData: analysis.hasData,
    adaptive: analysis.adaptive,
    evidence: analysis.evidence,
    retentionPct: analysis.currentRetention,
    retentionScore: analysis.currentRetention / 10,
    retentionDecayFactor: analysis.hasData ? analysis.currentRetention / 100 : 1,
    effectiveDaysElapsed: analysis.factors.effectiveDaysElapsed,
    memoryStabilityDays: analysis.stabilityDays,
    diagnosis: analysis.hasData ? analysis.diagnostic : 'Sin historial canónico suficiente para estimar retención.',
    isUrgentRefresh: analysis.hasData && analysis.isBelowCritical80,
    decayDiagnosis: analysis.hasData ? analysis.statusTitle : 'Retención desconocida',
  };
}

/** Calendar recency is displayed separately from the grade observation. */
function daysSinceDate(date?: string): number | null {
  if (!date) return null;
  const time = new Date(`${date}T00:00:00`).getTime();
  if (!Number.isFinite(time)) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((today.getTime() - time) / 86_400_000));
}

export function evaluateTopicPreparation(params: {
  canonicalTopic?: CanonicalTopic;
  topicNumber: number;
  topicTitle: string;
  totalCantoSecs?: number | null;
  lastGrade?: number | null;
  daysSinceCanto?: number | null;
  daysSinceReview?: number | null;
  daysSinceTouch?: number | null;
  vueltas?: number;
  reviewsCount?: number;
  difficulty?: number;
}): TopicPreparationEvaluation {
  const {
    totalCantoSecs,
    lastGrade,
    daysSinceCanto,
    daysSinceReview,
    daysSinceTouch,
    vueltas = 0,
    reviewsCount = 0,
    difficulty = 5
  } = params.canonicalTopic ? {
    ...params,
    vueltas: params.canonicalTopic.vueltas,
    reviewsCount: (params.canonicalTopic as any).reviewSessions?.length || 0,
    difficulty: params.canonicalTopic.difficulty,
    totalCantoSecs: params.canonicalTopic.lastCantoSeconds ?? null,
    lastGrade: params.canonicalTopic.lastCantoGrade ?? null,
    daysSinceCanto: daysSinceDate(params.canonicalTopic.lastCantoDate),
    daysSinceReview: daysSinceDate(params.canonicalTopic.lastReviewDate),
    daysSinceTouch: daysSinceDate((params.canonicalTopic as any).lastContactDate),
  } : params;

  // 1. Factor Cronómetro / Cante (Calibrado a 12:30)
  const timeEval = calculateCantoTimeScore(totalCantoSecs);
  const hasCanto = totalCantoSecs != null && totalCantoSecs > 0;
  const timeFormatted = hasCanto 
    ? `${Math.floor(totalCantoSecs! / 60)}m ${(totalCantoSecs! % 60).toString().padStart(2, '0')}s` 
    : 'Sin cante';

  // The shared retention estimate remains separate from the observed grade.
  const ebbinghaus = calculateEbbinghausRetention({
    canonicalTopic: params.canonicalTopic,
    daysSinceCanto: daysSinceCanto ?? (hasCanto ? daysSinceTouch : null),
    daysSinceReview: daysSinceReview ?? daysSinceTouch,
    daysSinceTouch,
    vueltas,
    reviewsCount,
    difficulty
  });

  // An observed grade is an observation, not a forecast. Duration, practice
  // counts and the retention model cannot create or lower an examiner's grade.
  const officialGrade = typeof lastGrade === 'number' && Number.isFinite(lastGrade) && lastGrade >= 0 && lastGrade <= 10
    ? lastGrade : null;
  const scoreAvailable = officialGrade !== null;
  const gradeScore = officialGrade ?? 0;
  const projectedScore = gradeScore;
  const overallScore = gradeScore;
  const peakScore = gradeScore;
  const scoreDecay = 0;
  const isDecayed = false;
  const gradeDiagnosis = scoreAvailable
    ? `Última nota registrada: ${officialGrade}/10. Describe aquella evaluación, no una nota prevista para hoy.`
    : 'No hay una nota evaluada registrada; el tiempo de cante y las vueltas no sustituyen una evaluación.';
  const gradeLabel = scoreAvailable ? 'Última nota observada' : 'Sin nota';
  const gradeCategory: TopicPreparationEvaluation['gradeCategory'] = officialGrade === null ? 'insuficiente'
    : officialGrade >= 9 ? 'sobresaliente' : officialGrade >= 7 ? 'notable'
      : officialGrade >= 6 ? 'bien' : officialGrade >= 5 ? 'suficiente' : 'insuficiente';
  const gradeBadgeClass = !scoreAvailable ? 'bg-slate-100 text-slate-700 border-slate-200'
    : gradeScore >= 5 ? 'bg-indigo-50 text-indigo-800 border-indigo-200' : 'bg-amber-50 text-amber-800 border-amber-200';
  const gradeTextColor = !scoreAvailable ? 'text-slate-500' : gradeScore >= 5 ? 'text-indigo-700' : 'text-amber-700';
  const gradeBorderColor = !scoreAvailable ? 'border-slate-200' : gradeScore >= 5 ? 'border-indigo-200' : 'border-amber-200';
  const masteryScore = 0; // No numeric mastery assessment is inferred from counts.
  const masteryDiagnosis = `${vueltas} vueltas y ${reviewsCount} repasos registrados; estos recuentos no miden por sí solos el dominio actual.`;
  const actionPlan = !scoreAvailable
    ? 'Registra una evaluación de cante o de recuerdo. El cronómetro por sí solo no determina una nota.'
    : 'Consulta las observaciones de la última evaluación y registra el resultado de la siguiente práctica. La nota anterior no garantiza el resultado actual.';
  const stabilityLabel = ebbinghaus.hasData ? 'Estimación orientativa' : 'Sin estimación';
  // An old grade and an acceptable duration cannot establish present readiness.
  const isReadyForTribunal = false;

  return {
    scoreAvailable,
    overallScore,
    projectedScore,
    peakScore,
    scoreDecay,
    isDecayed,
    decayDiagnosis: 'No se estima una pérdida de nota por el tiempo transcurrido.',
    gradeCategory,
    gradeLabel,
    gradeBadgeClass,
    gradeTextColor,
    gradeBorderColor,
    timeScore: timeEval.score,
    hasCanto,
    totalCantoSecs: totalCantoSecs || 0,
    timeFormatted,
    optimalSecs: OPTIMAL_CANTO_SECS,
    windowMinSecs: WINDOW_MIN_SECS,
    windowMaxSecs: WINDOW_MAX_SECS,
    timeDevianceSecs: timeEval.devianceSecs,
    timeDevianceFormatted: timeEval.devianceFormatted,
    timeZone: timeEval.zone,
    timeDiagnosis: timeEval.diagnosis,
    retentionAvailable: ebbinghaus.hasData,
    retentionEstimate: ebbinghaus.adaptive,
    retentionEvidence: ebbinghaus.evidence,
    retentionPct: ebbinghaus.retentionPct,
    retentionScore: ebbinghaus.retentionScore,
    retentionDecayFactor: ebbinghaus.retentionDecayFactor,
    effectiveDaysElapsed: ebbinghaus.effectiveDaysElapsed,
    daysSinceCanto: daysSinceCanto ?? (hasCanto ? daysSinceTouch : null),
    daysSinceReview: daysSinceReview ?? daysSinceTouch,
    daysSinceTouch: daysSinceTouch ?? null,
    memoryStabilityDays: ebbinghaus.memoryStabilityDays,
    ebbinghausDiagnosis: ebbinghaus.diagnosis,
    isUrgentRefresh: ebbinghaus.isUrgentRefresh,
    officialGrade,
    gradeScore,
    gradeDiagnosis,
    vueltas,
    reviewsCount,
    masteryScore,
    masteryDiagnosis,
    actionPlan,
    stabilityLabel,
    isReadyForTribunal,
  };
}

/**
 * Devuelve el día activo por defecto según la regla estricta:
 * - Lunes: hasta las 22:00h sigue siendo "lunes" (sesión activa). A las 22:00h pasa a "jueves".
 * - Martes y Miércoles: prepara "jueves".
 * - Jueves: hasta las 22:00h sigue siendo "jueves" (sesión activa). A las 22:00h pasa a "lunes".
 * - Viernes, Sábado y Domingo: prepara "lunes".
 */
export function getDefaultPreparadorDay(currentDate = new Date()): 'lunes' | 'jueves' {
  const day = currentDate.getDay(); // 0 Sun, 1 Mon, 2 Tue, 3 Wed, 4 Thu, 5 Fri, 6 Sat
  const hour = currentDate.getHours();

  if (day === 1) {
    return hour < 22 ? 'lunes' : 'jueves';
  }
  if (day === 2 || day === 3) {
    return 'jueves';
  }
  if (day === 4) {
    return hour < 22 ? 'jueves' : 'lunes';
  }
  return 'lunes';
}

/**
 * Devuelve un texto explicativo amigable del estado de la sesión activa
 */
export function getPreparadorScheduleStatus(currentDate = new Date()): {
  activeDay: 'lunes' | 'jueves';
  isSessionDay: boolean;
  timeRemainingMessage: string;
  nextSessionName: string;
} {
  const day = currentDate.getDay();
  const hour = currentDate.getHours();
  const activeDay = getDefaultPreparadorDay(currentDate);

  if (day === 4) {
    if (hour < 22) {
      const hoursLeft = 22 - hour;
      return {
        activeDay: 'jueves',
        isSessionDay: true,
        timeRemainingMessage: `Hoy es día de cante (Jueves). Activo hasta las 22:00h (${hoursLeft}h restantes).`,
        nextSessionName: 'Lunes'
      };
    } else {
      return {
        activeDay: 'lunes',
        isSessionDay: false,
        timeRemainingMessage: 'Sesión del Jueves finalizada (22:00h). Preparando el Lunes.',
        nextSessionName: 'Lunes'
      };
    }
  }

  if (day === 1) {
    if (hour < 22) {
      const hoursLeft = 22 - hour;
      return {
        activeDay: 'lunes',
        isSessionDay: true,
        timeRemainingMessage: `Hoy es día de cante (Lunes). Activo hasta las 22:00h (${hoursLeft}h restantes).`,
        nextSessionName: 'Jueves'
      };
    } else {
      return {
        activeDay: 'jueves',
        isSessionDay: false,
        timeRemainingMessage: 'Sesión del Lunes finalizada (22:00h). Preparando el Jueves.',
        nextSessionName: 'Jueves'
      };
    }
  }

  const daysUntilNext = day === 2 ? '2 días (Jueves)' : day === 3 ? 'Mañana (Jueves)' : day === 5 ? '3 días (Lunes)' : day === 6 ? '2 días (Lunes)' : 'Mañana (Lunes)';
  return {
    activeDay,
    isSessionDay: false,
    timeRemainingMessage: `Preparando cante del ${activeDay === 'lunes' ? 'Lunes' : 'Jueves'} · Faltan ${daysUntilNext}.`,
    nextSessionName: activeDay === 'lunes' ? 'Lunes' : 'Jueves'
  };
}
