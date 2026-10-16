/**
 * Engine de Evaluación Científica de Preparación para el Cante
 * 
 * Basado en las exigencias reales de oposiciones orales (Jueces, Fiscales, Notarías, etc.):
 * - Duración reglamentaria óptima: 12:30 (750s).
 * - Ventana reglamentaria admisible: 11:50 (710s) a 13:40 (820s).
 * - Curva de retención y del olvido de Ebbinghaus (R = e^(-t/S)).
 * - Vueltas y repasos de consolidación neuronal.
 * - Calificaciones previas del preparador o simulacros.
 */

export interface TopicPreparationEvaluation {
  overallScore: number;          // Nota global de 1.0 a 10.0
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
  
  // Factor 2: Curva de Ebbinghaus / Olvido
  retentionPct: number;          // 0 a 100%
  retentionScore: number;        // 1.0 a 10.0
  daysSinceTouch: number | null;
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
}

export const OPTIMAL_CANTO_SECS = 12 * 60 + 30; // 750s = 12m 30s
export const WINDOW_MIN_SECS = 11 * 60 + 50;    // 710s = 11m 50s
export const WINDOW_MAX_SECS = 13 * 60 + 40;    // 820s = 13m 40s

/**
 * Calcula la puntuación del cronómetro (1-10) en base a la cercanía con 12:30 (750s)
 * y el cumplimiento estricto de la ventana [11:50, 13:40].
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
    // Si está entre 710 y 750 (11:50 a 12:30)
    // O entre 750 y 820 (12:30 a 13:40)
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
      // 11:00 a 11:49: Leves recortes
      return {
        score: 6.5,
        zone: 'slightly_short',
        diagnosis: `Ligeramente corto (${devianceFormatted}). Desarrolla más los epígrafes para alcanzar los 12:30.`,
        devianceSecs: deviance,
        devianceFormatted
      };
    } else if (totalSecs >= 10 * 60) {
      // 10:00 a 10:59
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
    // 13:41 a 14:30
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

/**
 * Curva del Olvido de Hermann Ebbinghaus:
 * R = e^(-t / S)
 * S = Estabilidad de la memoria, reforzada por número de vueltas y repasos.
 */
export function calculateEbbinghausRetention(
  daysSinceTouch: number | null | undefined,
  vueltas: number = 0,
  reviewsCount: number = 0
): {
  retentionPct: number;
  retentionScore: number;
  diagnosis: string;
  isUrgentRefresh: boolean;
} {
  if (daysSinceTouch == null) {
    return {
      retentionPct: 30,
      retentionScore: 3.0,
      diagnosis: 'Sin fecha de estudio reciente. La huella de memoria está desdibujada.',
      isUrgentRefresh: true
    };
  }

  // Estabilidad de la memoria en días:
  // Vuelta 0 -> 2.5 días base
  // Cada vuelta aumenta la vida media de la memoria
  // Cada repaso consolida el trazado sináptico
  const stabilityDays = 2.5 * (1 + 0.8 * Math.max(0, vueltas) + 0.35 * Math.min(8, reviewsCount));

  // Fórmula exponencial de Ebbinghaus
  const retention = Math.exp(-daysSinceTouch / stabilityDays);
  const retentionPct = Math.min(100, Math.max(5, Math.round(retention * 100)));

  // Puntuación de 1 a 10 basada en la retención
  let retentionScore = +(retentionPct / 10).toFixed(1);
  if (daysSinceTouch === 0) retentionScore = 10.0;
  else if (daysSinceTouch === 1) retentionScore = Math.max(9.5, retentionScore);

  let diagnosis = '';
  let isUrgentRefresh = false;

  if (retentionPct >= 90) {
    diagnosis = `Memoria fresca y activa (${daysSinceTouch === 0 ? 'repasado hoy' : `hace ${daysSinceTouch}d`}). Máxima retención neuronal.`;
  } else if (retentionPct >= 75) {
    diagnosis = `Buen nivel de asimilación (${daysSinceTouch}d sin tocar). Repaso ligero recomendado.`;
  } else if (retentionPct >= 60) {
    diagnosis = `Curva del olvido en descenso (${daysSinceTouch}d). Conviene una lectura rápida antes del cante.`;
    isUrgentRefresh = true;
  } else {
    diagnosis = `Alerta de olvido: han pasado ${daysSinceTouch} días. Es necesario un repaso a fondo urgente.`;
    isUrgentRefresh = true;
  }

  return {
    retentionPct,
    retentionScore,
    diagnosis,
    isUrgentRefresh
  };
}

/**
 * Evalúa la preparación integral de un tema asignado para el preparador (1.0 a 10.0).
 */
export function evaluateTopicPreparation(params: {
  topicNumber: number;
  topicTitle: string;
  totalCantoSecs?: number | null;
  lastGrade?: number | null;
  daysSinceTouch?: number | null;
  vueltas?: number;
  reviewsCount?: number;
  difficulty?: number;
}): TopicPreparationEvaluation {
  const {
    totalCantoSecs,
    lastGrade,
    daysSinceTouch,
    vueltas = 0,
    reviewsCount = 0,
    difficulty = 5
  } = params;

  // 1. Factor Cronómetro / Cante (35% de peso)
  const timeEval = calculateCantoTimeScore(totalCantoSecs);
  const hasCanto = totalCantoSecs != null && totalCantoSecs > 0;
  const timeFormatted = hasCanto 
    ? `${Math.floor(totalCantoSecs! / 60)}m ${(totalCantoSecs! % 60).toString().padStart(2, '0')}s` 
    : 'Sin cante';

  // 2. Factor Ebbinghaus / Curva del Olvido (25% de peso)
  const ebbinghaus = calculateEbbinghausRetention(daysSinceTouch, vueltas, reviewsCount);

  // 3. Factor Notas del Preparador / Tribunal (20% de peso)
  let officialGrade: number | null = null;
  let gradeScore = 6.0; // base neutra si no hay nota
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

  // 4. Factor Maduración y Consolidación (20% de peso)
  // Basado en vueltas y número de sesiones acumuladas
  let masteryScore = 3.0;
  if (vueltas >= 3) masteryScore = 10.0;
  else if (vueltas === 2) masteryScore = 8.5;
  else if (vueltas === 1) masteryScore = 6.5;
  else if (reviewsCount >= 3) masteryScore = 5.0;
  else masteryScore = 3.0;

  // Ajuste por número de repasos
  masteryScore = Math.min(10, +(masteryScore + Math.min(1.5, reviewsCount * 0.3)).toFixed(1));
  const masteryDiagnosis = vueltas >= 2 
    ? `Tema maduro en Vuelta ${vueltas} con ${reviewsCount} repasos acumulados.`
    : vueltas === 1 
      ? `Primera vuelta completada. Proceso de afianzamiento en marcha.`
      : `Tema en fase inicial (${reviewsCount} repasos, sin vuelta consolidada).`;

  // CÁLCULO DE LA NOTA GLOBAL PONDERADA (1.0 a 10.0)
  // Ponderación: 35% Tiempo + 25% Ebbinghaus + 20% Notas + 20% Maduración
  const rawOverall = (
    timeEval.score * 0.35 +
    ebbinghaus.retentionScore * 0.25 +
    gradeScore * 0.20 +
    masteryScore * 0.20
  );

  const overallScore = +Math.min(10, Math.max(1, rawOverall)).toFixed(1);

  // Clasificación de la nota
  let gradeCategory: TopicPreparationEvaluation['gradeCategory'] = 'insuficiente';
  let gradeLabel = 'Insuficiente';
  let gradeBadgeClass = 'bg-rose-50 text-rose-800 border-rose-200';
  let gradeTextColor = 'text-rose-600';
  let gradeBorderColor = 'border-rose-200';

  if (overallScore >= 9.0) {
    gradeCategory = 'sobresaliente';
    gradeLabel = 'Sobresaliente · Nivel Tribunal';
    gradeBadgeClass = 'bg-emerald-50 text-emerald-800 border-emerald-300 ring-1 ring-emerald-400/20';
    gradeTextColor = 'text-emerald-700';
    gradeBorderColor = 'border-emerald-300';
  } else if (overallScore >= 7.5) {
    gradeCategory = 'notable';
    gradeLabel = 'Notable Alto · Listo para Canto';
    gradeBadgeClass = 'bg-indigo-50 text-indigo-800 border-indigo-200';
    gradeTextColor = 'text-indigo-700';
    gradeBorderColor = 'border-indigo-200';
  } else if (overallScore >= 6.0) {
    gradeCategory = 'bien';
    gradeLabel = 'Aprobado · Ajustar Detalles';
    gradeBadgeClass = 'bg-amber-50 text-amber-800 border-amber-200';
    gradeTextColor = 'text-amber-700';
    gradeBorderColor = 'border-amber-200';
  } else if (overallScore >= 5.0) {
    gradeCategory = 'suficiente';
    gradeLabel = 'Aprobado Justo · En Riesgo';
    gradeBadgeClass = 'bg-orange-50 text-orange-800 border-orange-200';
    gradeTextColor = 'text-orange-700';
    gradeBorderColor = 'border-orange-200';
  } else {
    gradeCategory = 'critico';
    gradeLabel = 'Crítico · Atención Inmediata';
    gradeBadgeClass = 'bg-rose-50 text-rose-800 border-rose-200';
    gradeTextColor = 'text-rose-600';
    gradeBorderColor = 'border-rose-200';
  }

  // Plan de acción específico para subir a 10
  let actionPlan = '';
  if (!hasCanto) {
    actionPlan = 'Haz un ensayo cronometrado completo con cronómetro buscando clavarte en 12:30 minutos.';
  } else if (timeEval.zone === 'slightly_long' || timeEval.zone === 'too_long') {
    actionPlan = `Acorta tu exposición ${timeEval.devianceFormatted}. Elimina citas doctrinales menores para entrar en los 12:30.`;
  } else if (timeEval.zone === 'slightly_short' || timeEval.zone === 'too_short') {
    actionPlan = `Amplía la exposición en ${timeEval.devianceFormatted}. Desarrolla con más pausa los artículos troncales.`;
  } else if (ebbinghaus.retentionPct < 80) {
    actionPlan = `Lectura de refresco previa al cante de 15 minutos para elevar la retención de Ebbinghaus al 100%.`;
  } else if (officialGrade != null && officialGrade < 7) {
    actionPlan = `Corrige las observaciones del preparador sobre dicción y artículos para asegurar el Notable.`;
  } else {
    actionPlan = '¡Tema impecable! Mantén la serenidad, vocalización firme y ritmo constante ante el preparador.';
  }

  return {
    overallScore,
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
    daysSinceTouch: daysSinceTouch ?? null,
    ebbinghausDiagnosis: ebbinghaus.diagnosis,
    isUrgentRefresh: ebbinghaus.isUrgentRefresh,
    officialGrade,
    gradeScore,
    gradeDiagnosis,
    vueltas,
    reviewsCount,
    masteryScore,
    masteryDiagnosis,
    actionPlan
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
    // Lunes: hasta las 22:00 sigue siendo Lunes
    return hour < 22 ? 'lunes' : 'jueves';
  }
  if (day === 2 || day === 3) {
    // Martes y Miércoles -> objetivo Jueves
    return 'jueves';
  }
  if (day === 4) {
    // Jueves: hasta las 22:00 sigue siendo Jueves
    return hour < 22 ? 'jueves' : 'lunes';
  }
  // Viernes (5), Sábado (6), Domingo (0) -> objetivo Lunes
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
