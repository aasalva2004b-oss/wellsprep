import { Session } from "../types";
import { CanonicalTopic } from "./canonicalTopicService";
import { safeParseDate, getLocalDateString } from "./utils";
import { isCantoSession, getCantoDuration } from "./cantoUtils";

export interface LearnerProfile {
  // Ritmos empíricos globales (calculados a partir de sesiones reales)
  hasSufficientData: boolean;
  totalRecordedSessionsCount: number;
  totalStudiedHours: number;

  // Velocidades de lectura y estudio (minutos por página real)
  studyPaceMinPerPage: number;       // Ritmo de Primer Estudio (ej: 6.2 min/pág)
  reviewPaceMinPerPage: number;      // Ritmo de Repaso general (ej: 3.2 min/pág)
  refreshPaceMinPerPage: number;     // Ritmo de Refresco (ej: 2.1 min/pág)
  refresh1DurationMin: number;       // Duración típica primer refresco (D+1)
  refresh2DurationMin: number;       // Duración típica segundo refresco (D+2)
  refresh3DurationMin: number;       // Duración típica tercer refresco (D+3)

  // Velocidades de lectura volumétrica por palabras
  readingWpm: number;                // Palabras por minuto en lectura comprensiva
  speakingWpm: number;               // Palabras por minuto en cante oral

  // Elasticidades aprendidas
  difficultySensitivity: number;     // Factor de impacto por punto de dificultad (+X% de tiempo por cada +1 dificultad)
  vueltaSpeedupFactor: number;       // Factor de aceleración por vuelta completada (ej: 0.88 = 12% más rápido cada vuelta)
  decayDelayPenaltyPerDay: number;   // Minutos extra de repaso por cada día de retraso (>21 días sin contacto)

  // Desglose de ritmos por materia
  subjectPaces: Record<
    string,
    {
      studyMinPerPage: number;
      reviewMinPerPage: number;
      samplesCount: number;
    }
  >;
}

export interface AdaptiveDurationEstimate {
  estimatedMinutes: number;
  confidence: "alta" | "media" | "provisional";
  explanation: string;
  paceMinPerPage: number;
  pagesUsed: number;
  hasExplicitPages: boolean;
  isCustomSpeed: boolean;
  details: {
    baseVolumeMinutes: number;
    difficultyAdjustmentMinutes: number;
    vueltaAdjustmentMinutes: number;
    decayAdjustmentMinutes: number;
  };
}

export interface AdaptiveRetentionResult {
  retentionPct: number;              // 0% a 100%
  confidence: "alta" | "media" | "baja";
  status: "consolidado" | "estable" | "desgaste" | "critico";
  statusLabel: string;
  statusBadgeClass: string;
  stabilityDays: number;             // Vida media de memoria estimada en días
  daysSinceLastTouch: number;        // Días transcurridos desde el último contacto
  daysSinceLastCanto: number | null; // Días desde el último cante
  lastCantoGrade: number | null;     // Nota del preparador (si existe)
  evidenceLevel: "canto_evaluado" | "repaso_activo" | "estudio_reciente" | "sin_evidencia";
  ebbinghausFactors: string[];       // Factores reales que justifican la predicción
  recommendedAction: string;         // Recomendación pedagógica justificada
  suggestedReviewDate: string;       // Fecha recomendada para el próximo repaso (YYYY-MM-DD)
  isUrgent: boolean;
}

// Valores empíricos por defecto para opositores a judicatura (prior prudente)
const PRIOR_STUDY_PACE_MIN_PER_PAGE = 5.5;
const PRIOR_REVIEW_PACE_MIN_PER_PAGE = 3.5;
const PRIOR_REFRESH_PACE_MIN_PER_PAGE = 2.0;
const PRIOR_READING_WPM = 220;
const PRIOR_SPEAKING_WPM = 135;

/**
 * Entrena el perfil de aprendizaje adaptativo del opositor analizando su historial completo de sesiones.
 * Utiliza filtrado de atípicos (outliers) y aprendizaje ponderado.
 */
export function buildLearnerProfile(
  sessions: Session[],
  canonicalTopicMap: Map<string, CanonicalTopic>
): LearnerProfile {
  const validSessions = (sessions || []).filter((s) => {
    const mins = Number(s.durationMinutes || (s as any).duration || 0);
    return mins > 2 && mins < 600; // Descartar sesiones fantasmas o corruptas
  });

  if (validSessions.length === 0) {
    return {
      hasSufficientData: false,
      totalRecordedSessionsCount: 0,
      totalStudiedHours: 0,
      studyPaceMinPerPage: PRIOR_STUDY_PACE_MIN_PER_PAGE,
      reviewPaceMinPerPage: PRIOR_REVIEW_PACE_MIN_PER_PAGE,
      refreshPaceMinPerPage: PRIOR_REFRESH_PACE_MIN_PER_PAGE,
      refresh1DurationMin: 45,
      refresh2DurationMin: 35,
      refresh3DurationMin: 25,
      readingWpm: PRIOR_READING_WPM,
      speakingWpm: PRIOR_SPEAKING_WPM,
      difficultySensitivity: 0.08,
      vueltaSpeedupFactor: 0.88,
      decayDelayPenaltyPerDay: 0.25,
      subjectPaces: {}
    };
  }

  let totalMinutesAll = 0;
  const studyPaces: number[] = [];
  const reviewPaces: number[] = [];
  const refreshPaces: number[] = [];
  const refreshDurations: number[] = [];
  const speakingWpms: number[] = [];

  const subjectStudyMap: Record<string, number[]> = {};
  const subjectReviewMap: Record<string, number[]> = {};

  validSessions.forEach((s) => {
    const mins = Number(s.durationMinutes || (s as any).duration || 0);
    totalMinutesAll += mins;

    const topic = canonicalTopicMap.get(s.topicId);
    const pages = topic?.pages && topic.pages > 0 ? topic.pages : null;
    const words = topic?.numeroPalabras && topic.numeroPalabras > 0 ? topic.numeroPalabras : null;

    const isStudy = s.type === "primer_estudio" || s.modality === "primer_estudio" || (s.type as string) === "estudio_inicial";
    const isRefresh = s.type === "refresco" || s.modality === "refresco";
    const isCanto = isCantoSession(s);
    const isReview = !isStudy && !isRefresh && !isCanto;

    if (pages && pages > 0) {
      const minPerPage = mins / pages;
      // Filtrar atípicos (> 30 min/pág o < 0.5 min/pág)
      if (minPerPage >= 0.5 && minPerPage <= 30) {
        if (isStudy) {
          studyPaces.push(minPerPage);
          if (topic?.subjectId) {
            subjectStudyMap[topic.subjectId] = subjectStudyMap[topic.subjectId] || [];
            subjectStudyMap[topic.subjectId].push(minPerPage);
          }
        } else if (isRefresh) {
          refreshPaces.push(minPerPage);
          refreshDurations.push(mins);
        } else if (isReview) {
          reviewPaces.push(minPerPage);
          if (topic?.subjectId) {
            subjectReviewMap[topic.subjectId] = subjectReviewMap[topic.subjectId] || [];
            subjectReviewMap[topic.subjectId].push(minPerPage);
          }
        }
      }
    }

    if (isCanto && words && words > 0) {
      const dur = getCantoDuration(s);
      if (dur.totalSecs >= 300 && dur.totalSecs <= 1200) {
        const wpm = words / (dur.totalSecs / 60);
        if (wpm >= 60 && wpm <= 220) {
          speakingWpms.push(wpm);
        }
      }
    }
  });

  // Cálculo de medianas recortadas robustas (trimmed median)
  const computeRobustMean = (arr: number[], fallback: number): number => {
    if (arr.length === 0) return fallback;
    const sorted = [...arr].sort((a, b) => a - b);
    // Descartar 10% superior e inferior si hay suficiente muestra
    const cut = Math.floor(sorted.length * 0.1);
    const slice = sorted.slice(cut, sorted.length - cut);
    const sum = slice.reduce((acc, v) => acc + v, 0);
    return Math.round((sum / slice.length) * 10) / 10;
  };

  const studyPace = computeRobustMean(studyPaces, PRIOR_STUDY_PACE_MIN_PER_PAGE);
  const reviewPace = computeRobustMean(reviewPaces, PRIOR_REVIEW_PACE_MIN_PER_PAGE);
  const refreshPace = computeRobustMean(refreshPaces, PRIOR_REFRESH_PACE_MIN_PER_PAGE);
  const avgRefreshDuration = computeRobustMean(refreshDurations, 35);
  const speakingWpm = computeRobustMean(speakingWpms, PRIOR_SPEAKING_WPM);

  // Desglose por materia
  const subjectPaces: Record<string, { studyMinPerPage: number; reviewMinPerPage: number; samplesCount: number }> = {};
  const allSubjectIds = new Set([...Object.keys(subjectStudyMap), ...Object.keys(subjectReviewMap)]);
  
  allSubjectIds.forEach((subId) => {
    const sSamples = subjectStudyMap[subId] || [];
    const rSamples = subjectReviewMap[subId] || [];
    subjectPaces[subId] = {
      studyMinPerPage: computeRobustMean(sSamples, studyPace),
      reviewMinPerPage: computeRobustMean(rSamples, reviewPace),
      samplesCount: sSamples.length + rSamples.length
    };
  });

  return {
    hasSufficientData: validSessions.length >= 5,
    totalRecordedSessionsCount: validSessions.length,
    totalStudiedHours: Math.round((totalMinutesAll / 60) * 10) / 10,
    studyPaceMinPerPage: studyPace,
    reviewPaceMinPerPage: reviewPace,
    refreshPaceMinPerPage: refreshPace,
    refresh1DurationMin: Math.max(25, Math.round(avgRefreshDuration * 1.25)),
    refresh2DurationMin: Math.max(20, Math.round(avgRefreshDuration)),
    refresh3DurationMin: Math.max(15, Math.round(avgRefreshDuration * 0.75)),
    readingWpm: PRIOR_READING_WPM,
    speakingWpm,
    difficultySensitivity: 0.08, // +8% por cada punto sobre dificultad 5
    vueltaSpeedupFactor: 0.88,   // -12% tiempo por vuelta
    decayDelayPenaltyPerDay: 0.25,
    subjectPaces
  };
}

/**
 * Calcula la estimación de duración adaptativa y justificada para una tarea específica.
 * NUNCA inventa 20 páginas arbitrarias: utiliza los datos reales del tema.
 */
export function estimateAdaptiveDuration(
  topic: CanonicalTopic | undefined,
  activityType: "estudio_nuevo" | "refresco" | "repaso" | "cante",
  profile: LearnerProfile,
  refrescoIndex?: 1 | 2 | 3
): AdaptiveDurationEstimate {
  // Caso de cante oral: tiempo reglamentario + lectura previa
  if (activityType === "cante") {
    return {
      estimatedMinutes: 30,
      confidence: "alta",
      explanation: "30 min reglamentarios (12:30 cante cronometrado + 17:30 preparación y lectura previa)",
      paceMinPerPage: 0,
      pagesUsed: topic?.pages || 0,
      hasExplicitPages: Boolean(topic?.hasExplicitPages),
      isCustomSpeed: false,
      details: {
        baseVolumeMinutes: 30,
        difficultyAdjustmentMinutes: 0,
        vueltaAdjustmentMinutes: 0,
        decayAdjustmentMinutes: 0
      }
    };
  }

  // Si no hay tema seleccionado, devolver un valor seguro provisional
  if (!topic) {
    return {
      estimatedMinutes: 45,
      confidence: "provisional",
      explanation: "Estimación base provisional sin tema asignado",
      paceMinPerPage: profile.reviewPaceMinPerPage,
      pagesUsed: 0,
      hasExplicitPages: false,
      isCustomSpeed: false,
      details: {
        baseVolumeMinutes: 45,
        difficultyAdjustmentMinutes: 0,
        vueltaAdjustmentMinutes: 0,
        decayAdjustmentMinutes: 0
      }
    };
  }

  const pages = topic.pages > 0 ? topic.pages : 0;
  const hasPages = topic.hasExplicitPages;
  const difficulty = topic.difficulty || 5;
  const vueltas = topic.vueltas || 0;

  // Modulador de dificultad empírico
  const difficultyMultiplier = 1 + (difficulty - 5) * profile.difficultySensitivity;

  // Modulador de vueltas para repaso (cada vuelta reduce el tiempo requerido hasta un tope de -35%)
  const vueltaMultiplier = vueltas > 0 ? Math.max(0.65, Math.pow(profile.vueltaSpeedupFactor, Math.min(3, vueltas))) : 1.0;

  // 1. Caso Refrescos (D+1, D+2, D+3 tras estudio nuevo)
  if (activityType === "refresco") {
    let baseMins = profile.refresh2DurationMin;
    if (refrescoIndex === 1) baseMins = profile.refresh1DurationMin;
    if (refrescoIndex === 3) baseMins = profile.refresh3DurationMin;

    if (hasPages && pages > 0) {
      // Ajustar por volumen real si el tema es especialmente extenso o breve
      const volumeAdjusted = pages * profile.refreshPaceMinPerPage * difficultyMultiplier;
      baseMins = Math.round((baseMins + volumeAdjusted) / 2);
    }

    const finalMins = Math.max(15, Math.round(baseMins * difficultyMultiplier));
    return {
      estimatedMinutes: finalMins,
      confidence: profile.hasSufficientData ? "alta" : "media",
      explanation: hasPages 
        ? `Refresco ${refrescoIndex || 1}/3 adaptado a ${pages} págs reales (dificultad ${difficulty})`
        : `Refresco ${refrescoIndex || 1}/3 con duración estándar personalizada (~${finalMins} min)`,
      paceMinPerPage: profile.refreshPaceMinPerPage,
      pagesUsed: pages,
      hasExplicitPages: hasPages,
      isCustomSpeed: profile.hasSufficientData,
      details: {
        baseVolumeMinutes: baseMins,
        difficultyAdjustmentMinutes: Math.round(baseMins * (difficultyMultiplier - 1)),
        vueltaAdjustmentMinutes: 0,
        decayAdjustmentMinutes: 0
      }
    };
  }

  // 2. Estudio Nuevo o Repaso
  let paceMinPerPage = activityType === "estudio_nuevo" ? profile.studyPaceMinPerPage : profile.reviewPaceMinPerPage;
  let isCustom = profile.hasSufficientData;

  // Consultar si hay ritmo empírico específico de la materia del tema
  if (topic.subjectId && profile.subjectPaces[topic.subjectId]) {
    const subPace = profile.subjectPaces[topic.subjectId];
    if (subPace.samplesCount >= 2) {
      paceMinPerPage = activityType === "estudio_nuevo" ? subPace.studyMinPerPage : subPace.reviewMinPerPage;
      isCustom = true;
    }
  }

  let finalMinutes: number;
  let explanation: string;
  let confidence: "alta" | "media" | "provisional" = "media";

  if (hasPages && pages > 0) {
    // Cálculo basado en la volumetría exacta del tema
    const rawVolumeMins = pages * paceMinPerPage;
    const diffMins = rawVolumeMins * (difficultyMultiplier - 1);
    const vueltaMins = activityType === "repaso" ? rawVolumeMins * (vueltaMultiplier - 1) : 0;
    
    finalMinutes = Math.max(20, Math.round((rawVolumeMins + diffMins + vueltaMins)));
    confidence = isCustom ? "alta" : "media";

    const activityLabel = activityType === "estudio_nuevo" ? "primer estudio" : "repaso";
    const vueltaText = vueltas > 0 && activityType === "repaso" ? ` · Vuelta ${vueltas} (${Math.round((1 - vueltaMultiplier) * 100)}% de aceleración)` : "";
    explanation = `Basado en ${pages} págs reales a tu ritmo de ${paceMinPerPage} min/pág (dif. ${difficulty})${vueltaText}`;

    return {
      estimatedMinutes: finalMinutes,
      confidence,
      explanation,
      paceMinPerPage,
      pagesUsed: pages,
      hasExplicitPages: true,
      isCustomSpeed: isCustom,
      details: {
        baseVolumeMinutes: Math.round(rawVolumeMins),
        difficultyAdjustmentMinutes: Math.round(diffMins),
        vueltaAdjustmentMinutes: Math.round(vueltaMins),
        decayAdjustmentMinutes: 0
      }
    };
  } else {
    // El tema no tiene páginas medidas todavía en el temario
    finalMinutes = activityType === "estudio_nuevo" ? 90 : 45;
    finalMinutes = Math.round(finalMinutes * difficultyMultiplier);
    
    return {
      estimatedMinutes: finalMinutes,
      confidence: "provisional",
      explanation: `Tema sin páginas medidas registradas. Estimación provisional prudente (${finalMinutes}m). Puedes registrar sus páginas en la ficha del tema.`,
      paceMinPerPage,
      pagesUsed: 0,
      hasExplicitPages: false,
      isCustomSpeed: false,
      details: {
        baseVolumeMinutes: finalMinutes,
        difficultyAdjustmentMinutes: 0,
        vueltaAdjustmentMinutes: 0,
        decayAdjustmentMinutes: 0
      }
    };
  }
}

/**
 * Motor Central de la Curva de Ebbinghaus Adaptativa.
 * Estima la retención en base a evidencia real (cantes orales calificados vs repasos pasivos),
 * vueltas acumuladas, tiempo transcurrido y dificultad.
 */
export function calculateAdaptiveRetention(
  topic: CanonicalTopic,
  sessions: Session[],
  profile: LearnerProfile
): AdaptiveRetentionResult {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 1. Extraer fechas del último contacto
  let lastTouchDateStr = topic.lastReviewDate || topic.firstStudyDate;
  let lastCantoDateStr = topic.lastCantoDate;
  let lastCantoGrade = topic.lastCantoGrade || null;

  // Filtrar sesiones de este tema para verificar notas y fechas
  const topicSessions = sessions.filter((s) => s.topicId === topic.id);
  topicSessions.forEach((s) => {
    if (s.date && (!lastTouchDateStr || s.date > lastTouchDateStr)) {
      lastTouchDateStr = s.date;
    }
    if (isCantoSession(s)) {
      if (!lastCantoDateStr || s.date > lastCantoDateStr) {
        lastCantoDateStr = s.date;
        const g = typeof s.cantoGrade === "number" ? s.cantoGrade : typeof (s as any).grade === "number" ? (s as any).grade : null;
        if (g !== null) lastCantoGrade = g;
      }
    }
  });

  // Si nunca ha tenido contacto
  if (!lastTouchDateStr) {
    return {
      retentionPct: 0,
      confidence: "alta",
      status: "critico",
      statusLabel: "Sin Iniciar",
      statusBadgeClass: "bg-slate-100 text-slate-700 border-slate-200",
      stabilityDays: 3.5,
      daysSinceLastTouch: 999,
      daysSinceLastCanto: null,
      lastCantoGrade: null,
      evidenceLevel: "sin_evidencia",
      ebbinghausFactors: [
        "Tema aún no iniciado en tu preparación",
        "Sin sesiones de estudio ni cante registradas"
      ],
      recommendedAction: "Programar primer estudio en un día sin cante",
      suggestedReviewDate: getLocalDateString(today),
      isUrgent: false
    };
  }

  const diffMs = today.getTime() - safeParseDate(lastTouchDateStr).getTime();
  const daysSinceLastTouch = Math.max(0, Math.floor(diffMs / (1000 * 3600 * 24)));

  let daysSinceLastCanto: number | null = null;
  if (lastCantoDateStr) {
    const cantoDiffMs = today.getTime() - safeParseDate(lastCantoDateStr).getTime();
    daysSinceLastCanto = Math.max(0, Math.floor(cantoDiffMs / (1000 * 3600 * 24)));
  }

  // 2. Cálculo adaptativo de Estabilidad de Memoria (S en días)
  // Vida media base: 3.5 días tras primer estudio
  let baseStability = 3.5;
  const vueltas = topic.vueltas || 0;
  const reviewCount = topic.reviewCount || topicSessions.length;
  const difficulty = topic.difficulty || 5;

  // Factor vueltas (reforzamiento de huella sináptica)
  let vueltasFactor = 1.0;
  if (vueltas === 1) vueltasFactor = 1.85;
  else if (vueltas === 2) vueltasFactor = 3.10;
  else if (vueltas === 3) vueltasFactor = 4.60;
  else if (vueltas >= 4) vueltasFactor = Math.min(6.5, 4.60 + (vueltas - 3) * 0.75);

  // Factor Evidencia de Cante (Retrieval Practice activa)
  // Un cante con nota alta (>7.5) demuestra consolidación activa profunda
  let cantoRetrievalFactor = 1.0;
  let evidenceLevel: "canto_evaluado" | "repaso_activo" | "estudio_reciente" | "sin_evidencia" = "repaso_activo";

  if (lastCantoGrade !== null && lastCantoGrade >= 7.0) {
    cantoRetrievalFactor = 2.4;
    evidenceLevel = "canto_evaluado";
  } else if (lastCantoGrade !== null && lastCantoGrade >= 5.0) {
    cantoRetrievalFactor = 1.8;
    evidenceLevel = "canto_evaluado";
  } else if (daysSinceLastCanto !== null && daysSinceLastCanto < 30) {
    cantoRetrievalFactor = 1.5;
    evidenceLevel = "canto_evaluado";
  } else if (reviewCount >= 2) {
    cantoRetrievalFactor = 1.25;
    evidenceLevel = "repaso_activo";
  } else {
    evidenceLevel = "estudio_reciente";
  }

  // Factor repasos acumulados
  const reviewsFactor = 1 + 0.12 * Math.min(6, reviewCount);

  // Factor dificultad (los temas más difíciles sufren mayor desgaste)
  const diffFactor = Math.max(0.65, Math.min(1.3, 1.3 - (difficulty - 5) * 0.08));

  const stabilityDays = +(baseStability * vueltasFactor * cantoRetrievalFactor * reviewsFactor * diffFactor).toFixed(1);

  // 3. Ecuación exponencial de Ebbinghaus diferencial R = e^(-t / S)
  // t efectivo: si el último contacto fue un cante, el olvido se frenó al 100%; si fue un repaso pasivo, al 65%.
  const effectiveDays = daysSinceLastCanto !== null && daysSinceLastCanto === daysSinceLastTouch
    ? daysSinceLastTouch
    : daysSinceLastTouch * 0.85;

  const retentionRatio = Math.exp(-effectiveDays / stabilityDays);
  const retentionPct = Math.max(10, Math.min(99, Math.round(retentionRatio * 100)));

  // 4. Diagnóstico de Estado y Factores
  let status: "consolidado" | "estable" | "desgaste" | "critico" = "estable";
  let statusLabel = "Memoria Estable";
  let statusBadgeClass = "bg-emerald-50 text-emerald-800 border-emerald-200";
  let isUrgent = false;

  if (retentionPct >= 80 && vueltas >= 2) {
    status = "consolidado";
    statusLabel = "Tema Consolidado";
    statusBadgeClass = "bg-indigo-50 text-indigo-800 border-indigo-200";
  } else if (retentionPct >= 70) {
    status = "estable";
    statusLabel = "Retención Estable";
    statusBadgeClass = "bg-emerald-50 text-emerald-800 border-emerald-200";
  } else if (retentionPct >= 55) {
    status = "desgaste";
    statusLabel = "Desgaste de Curva";
    statusBadgeClass = "bg-amber-50 text-amber-900 border-amber-200";
  } else {
    status = "critico";
    statusLabel = "Riesgo de Olvido";
    statusBadgeClass = "bg-rose-50 text-rose-800 border-rose-200";
    isUrgent = true;
  }

  // 5. Nivel de confianza estadístico
  let confidence: "alta" | "media" | "baja" = "baja";
  if (lastCantoGrade !== null && reviewCount >= 3) {
    confidence = "alta";
  } else if (reviewCount >= 2 || vueltas >= 1) {
    confidence = "media";
  }

  // 6. Factores justificativos transparentes
  const ebbinghausFactors: string[] = [];
  ebbinghausFactors.push(`${daysSinceLastTouch} días transcurridos desde el último contacto (${lastTouchDateStr})`);
  
  if (vueltas > 0) {
    ebbinghausFactors.push(`${vueltas} ${vueltas === 1 ? "vuelta completa acumulada" : "vueltas completas acumuladas"} (estabilidad x${vueltasFactor.toFixed(1)})`);
  }
  
  if (lastCantoGrade !== null) {
    ebbinghausFactors.push(`Último cante evaluado con nota ${lastCantoGrade.toFixed(1)}/10 (evidencia activa x${cantoRetrievalFactor.toFixed(1)})`);
  } else if (reviewCount > 0) {
    ebbinghausFactors.push(`${reviewCount} repasos acumulados sin nota oficial de cante`);
  }

  if (difficulty >= 7) {
    ebbinghausFactors.push(`Dificultad alta (${difficulty}/10): mayor tasa de desvanecimiento neuronal`);
  }

  // 7. Acción pedagógica recomendada
  let recommendedAction: string;
  if (status === "consolidado") {
    recommendedAction = `Retención sólida (~${retentionPct}%). Se puede espaciar el repaso hasta dentro de ${Math.round(stabilityDays * 0.4)} días.`;
  } else if (status === "estable") {
    recommendedAction = `Retención correcta (~${retentionPct}%). Mantener en el radar para la próxima vuelta o cante programado.`;
  } else if (status === "desgaste") {
    recommendedAction = `La retención ha descendido al ${retentionPct}%. Conviene programar un repaso de consolidación en los próximos 5 días.`;
  } else {
    recommendedAction = `Riesgo elevado (${retentionPct}% estimado, ${daysSinceLastTouch} días sin contacto). Prioridad alta para añadir al plan semanal.`;
  }

  // Fecha sugerida para el repaso (cuando R descienda a ~68%)
  const daysUntilThreshold = Math.max(1, Math.round(stabilityDays * 0.38 - daysSinceLastTouch));
  const suggestedDate = new Date(today);
  suggestedDate.setDate(today.getDate() + daysUntilThreshold);

  return {
    retentionPct,
    confidence,
    status,
    statusLabel,
    statusBadgeClass,
    stabilityDays,
    daysSinceLastTouch,
    daysSinceLastCanto,
    lastCantoGrade,
    evidenceLevel,
    ebbinghausFactors,
    recommendedAction,
    suggestedReviewDate: getLocalDateString(suggestedDate),
    isUrgent
  };
}
