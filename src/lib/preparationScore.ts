/**
 * Engine de Evaluación Científica de Preparación para el Cante (Ebbinghaus Dynamic Model)
 * 
 * Basado en las exigencias reales de oposiciones orales (Jueces, Fiscales, Notarías, etc.):
 * - Duración reglamentaria óptima: 12:30 (750s).
 * - Ventana reglamentaria admisible: 11:50 (710s) a 13:40 (820s).
 * - Curva de retención y del olvido continuo de Hermann Ebbinghaus (R = e^(-t_eff / S)).
 * - Freno de olvido diferencial: Cante frena al 100%, Repasos de estudio al 50%.
 * - Modelo multiplicativo continuo: P_actual = P_base + (P_pico - P_base) * R(t).
 * - Doble calificación: Nota proyectada real actual + Nota histórica máxima cuando estaba fresco.
 */

export interface TopicPreparationEvaluation {
  // Doble Calificación de Preparador
  overallScore: number;          // Nota proyectada real actual (1.0 a 10.0)
  projectedScore: number;        // Igual a overallScore (1.0 a 10.0)
  peakScore: number;             // Nota teórica máxima / histórica cuando estaba fresco (1.0 a 10.0)
  scoreDecay: number;            // Puntos perdidos por la curva del olvido (peakScore - projectedScore)
  isDecayed: boolean;            // true si scoreDecay >= 0.8 puntos
  decayDiagnosis: string;        // Explicación concisa del olvido

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
  masteryScore: number;          // 1.0 a 10.0
  masteryDiagnosis: string;

  // Consejo ejecutivo para alcanzar el 10
  actionPlan: string;
  stabilityLabel: string;        // "Estable" | "Desgaste leve" | "Alerta olvido"
  isReadyForTribunal: boolean;   // true si nota >= 7.5 y entra en la ventana reglamentaria
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
export function calculateEbbinghausRetention(
  arg1?: number | null | EbbinghausCalculationOptions,
  vueltasArg: number = 0,
  reviewsCountArg: number = 0
): {
  retentionPct: number;
  retentionScore: number;
  retentionDecayFactor: number;
  effectiveDaysElapsed: number;
  memoryStabilityDays: number;
  diagnosis: string;
  isUrgentRefresh: boolean;
  decayDiagnosis: string;
} {
  let daysSinceCanto: number | null = null;
  let daysSinceReview: number | null = null;
  let daysSinceTouch: number | null = null;
  let vueltas = vueltasArg;
  let reviewsCount = reviewsCountArg;
  let difficulty = 5;

  if (typeof arg1 === 'object' && arg1 !== null) {
    daysSinceCanto = arg1.daysSinceCanto ?? null;
    daysSinceReview = arg1.daysSinceReview ?? null;
    daysSinceTouch = arg1.daysSinceTouch ?? null;
    vueltas = arg1.vueltas ?? vueltas;
    reviewsCount = arg1.reviewsCount ?? reviewsCount;
    difficulty = arg1.difficulty ?? 5;
  } else if (typeof arg1 === 'number') {
    daysSinceTouch = arg1;
    daysSinceReview = arg1;
  } else if (arg1 === null) {
    daysSinceTouch = null;
    daysSinceReview = null;
  }

  // 1. Estabilidad de la memoria (S en días):
  // Vuelta 0 -> 3.5 días base.
  // Escalamiento reforzado de Vueltas y Cantos como fijadores principales:
  let vueltasFactor = 1.0;
  if (vueltas === 1) vueltasFactor = 1.85;
  else if (vueltas === 2) vueltasFactor = 3.10;
  else if (vueltas === 3) vueltasFactor = 4.60;
  else if (vueltas >= 4) vueltasFactor = Math.min(6.20, 4.60 + (vueltas - 3) * 0.80);

  // Efecto de cante oral: retrieval practice activa
  const hasCanto = daysSinceCanto !== null;
  const cantosFactor = hasCanto ? 2.10 : 1.0;
  const reviewsFactor = 1 + 0.15 * Math.min(6, reviewsCount);
  const diffFactor = Math.min(1.40, Math.max(0.55, 1.40 - (difficulty * 0.08)));

  const memoryStabilityDays = +(3.5 * vueltasFactor * cantosFactor * reviewsFactor * diffFactor).toFixed(1);

  // 2. Días efectivos transcurridos (t_eff) con freno de olvido diferencial:
  // Regla: El cante frena al 100% el olvido y los repasos de estudio al 50%.
  let effectiveDays = 0;

  if (daysSinceCanto == null && daysSinceReview == null && daysSinceTouch == null) {
    effectiveDays = 45; // Sin sesiones: olvido total
  } else if (daysSinceCanto != null && daysSinceReview != null) {
    if (daysSinceReview < daysSinceCanto) {
      // Repasó después del último cante: amortigua 50% del olvido posterior
      effectiveDays = daysSinceReview + 0.5 * (daysSinceCanto - daysSinceReview);
    } else {
      // Cante reciente: freno al 100%
      effectiveDays = daysSinceCanto;
    }
  } else if (daysSinceCanto != null) {
    effectiveDays = daysSinceCanto;
  } else if (daysSinceReview != null) {
    effectiveDays = daysSinceReview * 1.25;
  } else if (daysSinceTouch != null) {
    effectiveDays = daysSinceTouch * 1.2;
  }

  effectiveDays = Math.max(0, +effectiveDays.toFixed(1));

  // 3. Fórmula exponencial de Ebbinghaus R(t) = exp(-t_eff / S)
  const retentionDecayFactor = Math.min(1.0, Math.max(0.04, Math.exp(-effectiveDays / memoryStabilityDays)));
  const retentionPct = Math.round(retentionDecayFactor * 100);
  const retentionScore = +(retentionPct / 10).toFixed(1);

  let diagnosis = '';
  let decayDiagnosis = '';
  let isUrgentRefresh = false;

  const effectiveDisplayDays = Math.round(effectiveDays);

  if (retentionPct >= 85) {
    diagnosis = `Memoria fresca y activa (t_eff: ${effectiveDisplayDays}d · S: ${memoryStabilityDays}d). Retención neuronal óptima.`;
    decayDiagnosis = 'Retención neuronal óptima';
  } else if (retentionPct >= 70) {
    diagnosis = `Buen nivel de asimilación (t_eff: ${effectiveDisplayDays}d). Leve descenso de retención.`;
    decayDiagnosis = 'Olvido leve';
  } else if (retentionPct >= 50) {
    diagnosis = `Curva de Ebbinghaus en descenso marcado (t_eff: ${effectiveDisplayDays}d). Desgaste de artículos y estructura.`;
    decayDiagnosis = `Olvido moderado (-${100 - retentionPct}% retención)`;
    isUrgentRefresh = true;
  } else if (retentionPct >= 30) {
    diagnosis = `Alerta de olvido acusado (${effectiveDisplayDays}d efectivos sin cante). Huella mnémica desdibujada.`;
    decayDiagnosis = `Alerta: Olvido severo (${daysSinceCanto ?? daysSinceTouch}d sin cantar)`;
    isUrgentRefresh = true;
  } else {
    diagnosis = `Olvido crítico: ${effectiveDisplayDays} días efectivos sin afianzar. Requiere rescate antes del cante.`;
    decayDiagnosis = `Crítico: Memoria desvanecida (${daysSinceCanto ?? daysSinceTouch}d sin cantar)`;
    isUrgentRefresh = true;
  }

  return {
    retentionPct,
    retentionScore,
    retentionDecayFactor,
    effectiveDaysElapsed: effectiveDays,
    memoryStabilityDays,
    diagnosis,
    isUrgentRefresh,
    decayDiagnosis
  };
}

/**
 * Evalúa la preparación integral de un tema para el preparador (1.0 a 10.0),
 * aplicando el modelo multiplicativo continuo de Ebbinghaus y exponiendo
 * la Nota Proyectada Real Actual y la Nota Teórica Máxima Histórica.
 */
export function evaluateTopicPreparation(params: {
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
  } = params;

  // 1. Factor Cronómetro / Cante (Calibrado a 12:30)
  const timeEval = calculateCantoTimeScore(totalCantoSecs);
  const hasCanto = totalCantoSecs != null && totalCantoSecs > 0;
  const timeFormatted = hasCanto 
    ? `${Math.floor(totalCantoSecs! / 60)}m ${(totalCantoSecs! % 60).toString().padStart(2, '0')}s` 
    : 'Sin cante';

  // 2. Factor Ebbinghaus Continuo con Freno de Cante (100%) vs Repaso (50%)
  const ebbinghaus = calculateEbbinghausRetention({
    daysSinceCanto: daysSinceCanto ?? (hasCanto ? daysSinceTouch : null),
    daysSinceReview: daysSinceReview ?? daysSinceTouch,
    daysSinceTouch,
    vueltas,
    reviewsCount,
    difficulty
  });

  // 3. Factor Notas del Preparador / Tribunal
  let officialGrade: number | null = null;
  let gradeScore = 6.0;
  let gradeDiagnosis = 'Sin nota oficial registrada aún.';

  if (lastGrade != null && !isNaN(lastGrade)) {
    officialGrade = +lastGrade.toFixed(2);
    gradeScore = Math.min(10, Math.max(1, officialGrade));
    if (officialGrade >= 8.5) {
      gradeDiagnosis = `Calificación sobresaliente con el preparador (${officialGrade.toFixed(1)}/10).`;
    } else if (officialGrade >= 7.0) {
      gradeDiagnosis = `Notable sólido (${officialGrade.toFixed(1)}/10). Nivel de aprobado alto.`;
    } else if (officialGrade >= 5.0) {
      gradeDiagnosis = `Aprobado justo (${officialGrade.toFixed(1)}/10). Refuerza los artículos clave.`;
    } else {
      gradeDiagnosis = `Suspenso (${officialGrade.toFixed(1)}/10). Requiere correcciones estructurales.`;
    }
  } else {
    // Estimación basada en vueltas y dificultad
    gradeScore = +(5.5 + Math.min(3, vueltas * 1.2) - (difficulty > 7 ? 0.5 : 0)).toFixed(1);
    gradeScore = Math.min(8.0, Math.max(4.0, gradeScore));
  }

  // 4. Factor Maduración y Consolidación (Vueltas + Repasos)
  let masteryScore = 3.0;
  if (vueltas >= 3) masteryScore = 10.0;
  else if (vueltas === 2) masteryScore = 8.5;
  else if (vueltas === 1) masteryScore = 6.5;
  else if (reviewsCount >= 3) masteryScore = 5.0;
  else masteryScore = 3.0;

  masteryScore = Math.min(10, +(masteryScore + Math.min(1.5, reviewsCount * 0.3)).toFixed(1));
  const masteryDiagnosis = vueltas >= 2 
    ? `Tema maduro en Vuelta ${vueltas} con ${reviewsCount} repasos acumulados.`
    : vueltas === 1 
      ? `Primera vuelta completada. Proceso de afianzamiento en marcha.`
      : `Tema en fase inicial (${reviewsCount} repasos, sin vuelta consolidada).`;

  // 5. CÁLCULO DE LA NOTA TEÓRICA MÁXIMA / PICO (P_pico)
  // Representa la calificación alcanzada cuando el tema estaba fresco al 100%
  let rawPeakScore: number;
  if (hasCanto) {
    // 40% Tiempo + 35% Nota Oficial + 25% Maduración
    rawPeakScore = (timeEval.score * 0.40) + (gradeScore * 0.35) + (masteryScore * 0.25);
  } else {
    // Sin cante cronometrado: 55% Nota oficial/estimada + 45% Maduración
    rawPeakScore = (gradeScore * 0.55) + (masteryScore * 0.45);
  }
  const peakScore = +Math.min(10.0, Math.max(2.5, rawPeakScore)).toFixed(1);

  // 6. CÁLCULO DE LA NOTA PROYECTADA REAL ACTUAL (P_actual)
  // Modelo Multiplicativo Continuo de Ebbinghaus:
  // P_actual = P_base + (P_pico - P_base) * R(t)
  const rawProjected = BASELINE_MEMORY_SCORE + (peakScore - BASELINE_MEMORY_SCORE) * ebbinghaus.retentionDecayFactor;
  const projectedScore = +Math.min(10.0, Math.max(1.0, rawProjected)).toFixed(1);
  const overallScore = projectedScore;

  // Desgaste por el paso del tiempo
  const scoreDecay = Math.max(0, +(peakScore - projectedScore).toFixed(1));
  const isDecayed = scoreDecay >= 0.8;

  // 7. Clasificación de la Nota Proyectada
  let gradeCategory: TopicPreparationEvaluation['gradeCategory'] = 'insuficiente';
  let gradeLabel = 'Insuficiente';
  let gradeBadgeClass = 'bg-rose-50 text-rose-800 border-rose-200';
  let gradeTextColor = 'text-rose-600';
  let gradeBorderColor = 'border-rose-200';

  if (projectedScore >= 8.8) {
    gradeCategory = 'sobresaliente';
    gradeLabel = 'Sobresaliente · Nivel Tribunal';
    gradeBadgeClass = 'bg-emerald-50 text-emerald-800 border-emerald-300 ring-1 ring-emerald-400/20';
    gradeTextColor = 'text-emerald-700';
    gradeBorderColor = 'border-emerald-300';
  } else if (projectedScore >= 7.2) {
    gradeCategory = 'notable';
    gradeLabel = 'Notable Alto · Listo para Canto';
    gradeBadgeClass = 'bg-indigo-50 text-indigo-800 border-indigo-200';
    gradeTextColor = 'text-indigo-700';
    gradeBorderColor = 'border-indigo-200';
  } else if (projectedScore >= 5.8) {
    gradeCategory = 'bien';
    gradeLabel = 'Aprobado · Ajustar Detalles';
    gradeBadgeClass = 'bg-amber-50 text-amber-800 border-amber-200';
    gradeTextColor = 'text-amber-700';
    gradeBorderColor = 'border-amber-200';
  } else if (projectedScore >= 4.5) {
    gradeCategory = 'suficiente';
    gradeLabel = 'Aprobado Justo · En Riesgo';
    gradeBadgeClass = 'bg-orange-50 text-orange-800 border-orange-200';
    gradeTextColor = 'text-orange-700';
    gradeBorderColor = 'border-orange-200';
  } else {
    gradeCategory = 'critico';
    gradeLabel = 'Crítico · Olvido Acusado';
    gradeBadgeClass = 'bg-rose-50 text-rose-800 border-rose-200';
    gradeTextColor = 'text-rose-600';
    gradeBorderColor = 'border-rose-200';
  }

  // 8. Plan de Acción Ejecutivo
  let actionPlan = '';
  if (!hasCanto) {
    actionPlan = 'Haz un ensayo cronometrado buscando clavarte en 12:30 minutos para activar la nota real del cante.';
  } else if (scoreDecay >= 2.5) {
    const daysAgo = daysSinceCanto ?? daysSinceTouch ?? 30;
    actionPlan = `¡Alerta de olvido! Tema cantado hace ${daysAgo}d (has perdido ${scoreDecay} pts). Un cante de 12:30 hoy devolverá tu nota al ${peakScore.toFixed(1)}.`;
  } else if (scoreDecay >= 1.0) {
    actionPlan = `Curva de Ebbinghaus en descenso (-${scoreDecay} pts). Una lectura rápida (freno 50%) o un cante completo (freno 100%) restaurará la nota.`;
  } else if (timeEval.zone === 'slightly_long' || timeEval.zone === 'too_long') {
    actionPlan = `Acorta tu exposición ${timeEval.devianceFormatted}. Elimina citas doctrinales secundarias para entrar en los 12:30.`;
  } else if (timeEval.zone === 'slightly_short' || timeEval.zone === 'too_short') {
    actionPlan = `Amplía la exposición en ${timeEval.devianceFormatted}. Desarrolla con más pausa los artículos troncales.`;
  } else if (officialGrade != null && officialGrade < 7) {
    actionPlan = `Corrige las observaciones del preparador sobre dicción y artículos para afianzar el Notable.`;
  } else {
    actionPlan = '¡Tema en plenitud! Mantén serenidad, vocalización firme y ritmo constante de 12:30 ante el preparador.';
  }

  // Estabilidad y preparación para Tribunal
  let stabilityLabel = "Estable";
  if (scoreDecay >= 1.5) {
    stabilityLabel = "Alerta olvido";
  } else if (scoreDecay >= 0.6) {
    stabilityLabel = "Desgaste leve";
  }

  const isReadyForTribunal = overallScore >= 7.5 && (timeEval.zone === "perfect" || timeEval.zone === "in_window");

  return {
    overallScore,
    projectedScore,
    peakScore,
    scoreDecay,
    isDecayed,
    decayDiagnosis: ebbinghaus.decayDiagnosis,
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
