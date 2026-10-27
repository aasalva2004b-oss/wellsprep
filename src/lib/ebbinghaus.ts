import { TopicProgressData } from "./prediction";
import { getLocalDateString } from "./utils";

export interface EbbinghausFactorBreakdown {
  // 1. Study Hours
  studyHoursTotal: number;
  studyHoursFactor: number;
  studyHoursImpactLabel: string;

  // 2. Difficulty
  difficulty: number;
  difficultyFactor: number;
  difficultyImpactLabel: string;

  // 3. Cantos & Practice
  cantosCount: number;
  cantosFactor: number;
  cantosImpactLabel: string;

  // 4. Canto Duration (Speed / Fluency)
  lastCantoMinutes: number | null;
  lastCantoSeconds: number | null;
  lastCantoTotalMins: number | null;
  bestCantoMinutes: number | null;
  bestCantoSeconds: number | null;
  cantoSpeedFactor: number;
  cantoSpeedLabel: string;
  cantoSpeedImpactLabel: string;

  // 5. Canto Score / Grade
  lastCantoGrade: number | null;
  bestCantoGrade: number | null;
  cantoGradeFactor: number;
  cantoGradeImpactLabel: string;

  // 6. Refrescos & Reviews
  refrescosCompleted: number; // 0..3
  refrescosFactor: number;
  refrescosImpactLabel: string;
  vueltas: number;
  vueltasFactor: number;
  vueltasImpactLabel: string;

  // Mastery bonus
  hasMasteryBonus?: boolean;
  brakeType?: 'cante_total' | 'freno_mixto' | 'repaso_pasivo' | 'estudio_inicial';

  // Overall Stability & Anchors
  stabilityDays: number; // S: memory stability / half-life in days
  anchorDate: string | null;
  anchorType: 'estudio_inicial' | 'refresco' | 'canto' | 'repaso' | 'none';
  daysSinceAnchor: number;
  effectiveDaysElapsed: number;
}

export interface EbbinghausPoint {
  day: number;
  label: string;
  dateStr: string;
  fullDate: string;
  retention: number; // 0 - 100
  isToday: boolean;
  isAnchor: boolean;
  isThreshold80: boolean;
  retentionFormatted: string;
}

export type TopicMemoryStatus = 'excelente' | 'bueno' | 'atencion' | 'critico';

export interface EbbinghausAnalysis {
  hasData: boolean;
  // Current state
  currentRetention: number; // 0 - 100%
  status: TopicMemoryStatus;
  statusTitle: string; // e.g., "Tema Muy Bien Estudiado (Consolidado)"
  statusBadgeClass: string;
  statusBorderClass: string;
  statusIconColor: string;
  statusSummary: string;

  // Days metrics
  daysSinceLastAction: number;
  daysUntilCritical80: number; // positive = days remaining, negative = days overdue
  critical80DateStr: string | null;
  isBelowCritical80: boolean;

  // Synthesis & Advice
  diagnostic: string; // Detailed diagnosis explaining how their study, hours, cantos, speed, score, and refrescos impacted this
  actionAdvice: string; // Clear recommendation: need review today, review in X days, or consolidated
  actionUrgency: 'baja' | 'media' | 'alta' | 'inmediata';

  // Mathematical stability
  stabilityDays: number;

  // Breakdown of all factors
  factors: EbbinghausFactorBreakdown;

  // Curve points for Recharts
  chartData: EbbinghausPoint[];
}

/**
 * Motor Multifactorial de la Curva del Olvido de Hermann Ebbinghaus.
 * 
 * Modela con rigor psicométrico y fisiológico la estabilidad mnemotécnica (S)
 * integrando:
 * 1. Horas de estudio dedicadas (asimilación profunda vs superficial)
 * 2. Dificultad del tema (1-10) y sobrecarga cognitiva
 * 3. Práctica de cante oral (efecto de evocación activa / retrieval testing)
 * 4. Minutos empleados en el cante: velocidad y fluidez (menos minutos = mayor soltura y automatización)
 * 5. Calificación / Nota del cante (altas notas = huella mnemotécnica intacta; suspensos = lagunas críticas)
 * 6. Refrescos diarios (3 primeros días) y vueltas mensuales de repaso espaciado
 */
export function calculateEbbinghausCurve(
  topicId: string,
  pages: number = 15,
  difficulty: number = 5,
  progress?: TopicProgressData,
  sessions: any[] = []
): EbbinghausAnalysis {
  const todayStr = getLocalDateString();
  const todayDate = new Date(todayStr);

  // Filtrar y ordenar sesiones cronológicas de este tema
  // Nota: si las sesiones ya vienen filtradas desde el diálogo, s.topicId puede ser undefined, por lo que se acepta !s.topicId || s.topicId === topicId
  const topicSessions = (sessions || [])
    .filter((s) => !s.topicId || s.topicId === topicId)
    .sort((a, b) => {
      const dateCmp = (a.date || "").localeCompare(b.date || "");
      if (dateCmp !== 0) return dateCmp;
      const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt || 0);
      const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt || 0);
      return timeA - timeB;
    });

  const estudioSessions = topicSessions.filter(
    (s) => s.type === "estudio_inicial" || s.type === "primer_estudio"
  );
  const cantosSessions = topicSessions.filter((s) => {
    const t = (s.type || '').toLowerCase();
    return t === "canto" || t === "simulacro" || t === "cantar";
  });
  const repasosSessions = topicSessions.filter((s) => s.type === "repaso");
  const refrescosSessions = topicSessions.filter((s) => s.type === "refresco");

  const hasProgressCanto = ((progress?.mejorTiempoCantoMinutos || 0) > 0 || (progress?.mejorTiempoCantoSegundos || 0) > 0);
  const hasInitialStudy = estudioSessions.length > 0 || !!progress?.firstStudyDate || cantosSessions.length > 0 || hasProgressCanto || repasosSessions.length > 0;
  const firstStudyDate = estudioSessions[0]?.date || progress?.firstStudyDate || (cantosSessions[0]?.date) || null;

  // Caso: Tema sin iniciar
  if (!hasInitialStudy) {
    return createEmptyAnalysis(difficulty, pages);
  }

  // 1. Identificar la última interacción y eventos específicos (Cante, Repaso, Estudio)
  const lastSession = topicSessions[topicSessions.length - 1];
  let anchorDateStr = lastSession?.date || progress?.lastReviewDate || progress?.firstStudyDate || todayStr;
  let anchorType: EbbinghausFactorBreakdown['anchorType'] = 'estudio_inicial';

  if (lastSession) {
    const lt = (lastSession.type || '').toLowerCase();
    if (lt === 'canto' || lt === 'simulacro' || lt === 'cantar') anchorType = 'canto';
    else if (lt === 'repaso') anchorType = 'repaso';
    else if (lt === 'refresco') anchorType = 'refresco';
    else anchorType = 'estudio_inicial';
  } else if (progress?.lastReviewDate) {
    anchorType = 'repaso';
  } else if (hasProgressCanto) {
    anchorType = 'canto';
  }

  const anchorDateObj = new Date(anchorDateStr);
  const rawDaysSince = Math.max(0, (todayDate.getTime() - anchorDateObj.getTime()) / (1000 * 3600 * 24));
  const daysSinceAnchor = Math.round(rawDaysSince * 10) / 10;

  // Días específicos por tipo de evento para el freno diferencial
  const lastCantoSession = cantosSessions[cantosSessions.length - 1];
  const lastCantoDateStr = lastCantoSession?.date || (hasProgressCanto && progress?.lastReviewDate ? progress.lastReviewDate : null);
  const daysSinceCanto = lastCantoDateStr 
    ? Math.max(0, (todayDate.getTime() - new Date(lastCantoDateStr).getTime()) / (1000 * 3600 * 24))
    : null;

  const lastReviewSession = repasosSessions[repasosSessions.length - 1];
  const lastReviewDateStr = lastReviewSession?.date || progress?.lastReviewDate || null;
  const daysSinceReview = lastReviewDateStr
    ? Math.max(0, (todayDate.getTime() - new Date(lastReviewDateStr).getTime()) / (1000 * 3600 * 24))
    : null;

  // Cálculo de días efectivos (t_eff) con FRENO DIFERENCIAL:
  // - El cante oral (retrieval practice activa) frena el 100% de la curva.
  // - Los repasos de estudio amortiguan el 50% del olvido posterior si hubo cante previo.
  // - Los repasos de estudio sin cante tienen un decaimiento un 25% más acelerado.
  let effectiveDays = daysSinceAnchor;
  let brakeType: EbbinghausFactorBreakdown['brakeType'] = 'estudio_inicial';

  if (daysSinceCanto !== null && daysSinceReview !== null) {
    if (daysSinceReview < daysSinceCanto) {
      effectiveDays = daysSinceReview + 0.5 * (daysSinceCanto - daysSinceReview);
      brakeType = 'freno_mixto';
    } else {
      effectiveDays = daysSinceCanto;
      brakeType = 'cante_total';
    }
  } else if (daysSinceCanto !== null) {
    effectiveDays = daysSinceCanto;
    brakeType = 'cante_total';
  } else if (daysSinceReview !== null) {
    effectiveDays = daysSinceReview * 1.25;
    brakeType = 'repaso_pasivo';
  } else {
    effectiveDays = daysSinceAnchor;
    brakeType = 'estudio_inicial';
  }
  const effectiveDaysElapsed = Math.max(0, Math.round(effectiveDays * 10) / 10);

  // =========================================================================
  // FACTOR 1: HORAS DE ESTUDIO TOTALES (Asimilación e Inversión Cognitiva)
  // =========================================================================
  let studyHoursTotal = progress?.studyTimeHours || 0;
  if (studyHoursTotal <= 0) {
    const totalMinsEstudio = topicSessions
      .filter((s) => s.type === 'estudio_inicial' || s.type === 'primer_estudio' || s.type === 'repaso')
      .reduce((acc, s) => acc + (s.duration || s.durationMinutes || 0), 0);
    studyHoursTotal = Math.round((totalMinsEstudio / 60) * 10) / 10;
  }
  const expectedHours = Math.max(2, (pages || 15) * 0.55);
  const hoursRatio = studyHoursTotal > 0 ? (studyHoursTotal / expectedHours) : 0.7;
  
  const studyHoursFactor = Math.min(1.75, Math.max(0.70, 0.70 + 0.45 * Math.sqrt(Math.max(0.1, hoursRatio))));
  const studyHoursImpactLabel = studyHoursFactor >= 1.25 
    ? `+${Math.round((studyHoursFactor - 1) * 100)}% (Estudio profundo)` 
    : studyHoursFactor >= 1.0 
      ? `+${Math.round((studyHoursFactor - 1) * 100)}% (Tiempo óptimo)` 
      : `${Math.round((studyHoursFactor - 1) * 100)}% (Horas justas)`;

  // =========================================================================
  // FACTOR 2: DIFICULTAD DEL TEMA (Sobrecarga de Trabajo)
  // =========================================================================
  const effDifficulty = Math.min(10, Math.max(1, progress?.difficulty || difficulty || 5));
  const difficultyFactor = Math.min(1.40, Math.max(0.55, 1.40 - (effDifficulty * 0.08)));
  const difficultyImpactLabel = effDifficulty <= 4 
    ? `+${Math.round((difficultyFactor - 1) * 100)}% (Tema accesible)` 
    : effDifficulty <= 6 
      ? `Neutro (Dificultad media)` 
      : `${Math.round((difficultyFactor - 1) * 100)}% (Alta exigencia conceptual)`;

  // =========================================================================
  // FACTOR 3: CANTOS REALIZADOS (Efecto de Evocación Oral Activa Ponderado)
  // REFORZADO: Cante oral actúa como el fijador sináptico más potente
  // 0 cantos: 1.0x | 1 cante: 2.10x | 2 cantos: 3.30x | 3 cantos: 4.40x | 4+ cantos: hasta 5.20x
  // =========================================================================
  let cantosCount = cantosSessions.length;
  if (cantosCount === 0 && hasProgressCanto) {
    cantosCount = Math.max(1, progress?.vueltas || 1);
  }

  let cantosFactor = 1.0;
  if (cantosCount === 1) {
    cantosFactor = 2.10;
  } else if (cantosCount === 2) {
    cantosFactor = 3.30;
  } else if (cantosCount === 3) {
    cantosFactor = 4.40;
  } else if (cantosCount >= 4) {
    cantosFactor = Math.min(5.20, 4.40 + (cantosCount - 3) * 0.40);
  }

  // =========================================================================
  // FACTOR 4: MINUTOS EMPLEADOS EN EL CANTE (Velocidad y Automatización Fluida)
  // =========================================================================
  let lastCantoMinutes: number | null = null;
  let lastCantoSeconds: number | null = null;
  let lastCantoTotalMins: number | null = null;
  let bestCantoMinutes: number | null = progress?.mejorTiempoCantoMinutos ?? null;
  let bestCantoSeconds: number | null = progress?.mejorTiempoCantoSegundos ?? null;

  if (cantosSessions.length > 0) {
    const latestCanto = cantosSessions[cantosSessions.length - 1];
    lastCantoMinutes = latestCanto.durationMinutes ?? latestCanto.duration ?? 0;
    lastCantoSeconds = latestCanto.cantoSeconds ?? (latestCanto as any).seconds ?? 0;
    lastCantoTotalMins = lastCantoMinutes + (lastCantoSeconds / 60);

    if (lastCantoTotalMins === 0 && hasProgressCanto) {
      lastCantoMinutes = progress?.mejorTiempoCantoMinutos || 0;
      lastCantoSeconds = progress?.mejorTiempoCantoSegundos || 0;
      lastCantoTotalMins = lastCantoMinutes + (lastCantoSeconds / 60);
    }
  } else if (hasProgressCanto) {
    lastCantoMinutes = progress?.mejorTiempoCantoMinutos || 0;
    lastCantoSeconds = progress?.mejorTiempoCantoSegundos || 0;
    lastCantoTotalMins = lastCantoMinutes + (lastCantoSeconds / 60);
  }

  let cantoSpeedFactor = 1.0;
  let cantoSpeedLabel = "Sin registro de cante";
  let cantoSpeedImpactLabel = "Neutro";

  if (lastCantoTotalMins !== null && lastCantoTotalMins > 0) {
    if (lastCantoTotalMins <= 12.0) {
      cantoSpeedFactor = 1.35;
      cantoSpeedLabel = `Muy rápido y fluido (≤ 12:00 min)`;
      cantoSpeedImpactLabel = "+35% estabilidad (máxima fluidez y retención)";
    } else if (lastCantoTotalMins <= 13.0) {
      cantoSpeedFactor = 1.22;
      cantoSpeedLabel = "Ágil y en ventana (12:01–13:00 min)";
      cantoSpeedImpactLabel = "+22% estabilidad (ritmo firme y seguro)";
    } else if (lastCantoTotalMins <= 13.67) {
      cantoSpeedFactor = 1.08;
      cantoSpeedLabel = "En ventana límite (13:01–13:40 min)";
      cantoSpeedImpactLabel = "+8% estabilidad (aprobado en tiempo)";
    } else if (lastCantoTotalMins <= 15.0) {
      cantoSpeedFactor = 0.86;
      cantoSpeedLabel = "Lento con pausas (13:41–15:00 min)";
      cantoSpeedImpactLabel = "-14% estabilidad (titubeos detectados)";
    } else {
      cantoSpeedFactor = 0.70;
      cantoSpeedLabel = "Exceso crítico (> 15:00 min)";
      cantoSpeedImpactLabel = "-30% estabilidad (inseguridad mnemotécnica)";
    }
  }

  // =========================================================================
  // FACTOR 5: CALIFICACIÓN / NOTA DEL CANTE
  // =========================================================================
  let lastCantoGrade: number | null = null;
  let bestCantoGrade: number | null = null;

  if (cantosCount > 0) {
    const cantosWithGrade = cantosSessions
      .map((c) => {
        const g = typeof c.cantoGrade === 'number' ? c.cantoGrade
          : typeof (c as any).grade === 'number' ? (c as any).grade
          : typeof (c as any).score === 'number' ? (c as any).score
          : typeof (c as any).nota === 'number' ? (c as any).nota
          : null;
        return { ...c, effectiveGrade: g };
      })
      .filter((c) => c.effectiveGrade !== null && c.effectiveGrade >= 0);

    if (cantosWithGrade.length > 0) {
      lastCantoGrade = cantosWithGrade[cantosWithGrade.length - 1].effectiveGrade;
      bestCantoGrade = Math.max(...cantosWithGrade.map((c) => c.effectiveGrade as number));
    }
  }

  let cantoGradeFactor = 1.0;
  let cantoGradeImpactLabel = "Neutro (Sin nota registrada)";

  if (lastCantoGrade !== null) {
    if (lastCantoGrade >= 9.0) {
      cantoGradeFactor = 1.60;
      cantoGradeImpactLabel = `+60% estabilidad (Sobresaliente: ${lastCantoGrade.toFixed(1)}/10)`;
    } else if (lastCantoGrade >= 7.5) {
      cantoGradeFactor = 1.35;
      cantoGradeImpactLabel = `+35% estabilidad (Notable alto: ${lastCantoGrade.toFixed(1)}/10)`;
    } else if (lastCantoGrade >= 6.0) {
      cantoGradeFactor = 1.12;
      cantoGradeImpactLabel = `+12% estabilidad (Bien: ${lastCantoGrade.toFixed(1)}/10)`;
    } else if (lastCantoGrade >= 5.0) {
      cantoGradeFactor = 0.95;
      cantoGradeImpactLabel = `Aprobado justo (${lastCantoGrade.toFixed(1)}/10)`;
    } else if (lastCantoGrade >= 4.0) {
      cantoGradeFactor = 0.65;
      cantoGradeImpactLabel = `-35% estabilidad (Suspenso leve: ${lastCantoGrade.toFixed(1)}/10)`;
    } else {
      cantoGradeFactor = 0.40;
      cantoGradeImpactLabel = `-60% estabilidad (Suspenso grave: ${lastCantoGrade.toFixed(1)}/10)`;
    }
  }

  // BONUS DE MAESTRÍA ANTE TRIBUNAL:
  // Cante en ventana reglamentaria (11:50 a 13:40 min = 11.83 a 13.67 min) con nota >= 7.5
  const hasMasteryBonus = cantosCount > 0 &&
    lastCantoTotalMins !== null &&
    lastCantoTotalMins >= 11.83 &&
    lastCantoTotalMins <= 13.67 &&
    lastCantoGrade !== null &&
    lastCantoGrade >= 7.5;

  if (hasMasteryBonus) {
    cantosFactor = +(cantosFactor * 1.15).toFixed(2);
  }

  const cantosImpactLabel = cantosCount === 0 
    ? "Sin cantos (Solo memoria de lectura)" 
    : hasMasteryBonus
      ? `+${Math.round((cantosFactor - 1) * 100)}% (${cantosCount} ${cantosCount === 1 ? 'cante' : 'cantes'} · Bonus Maestría Tribunal +15%)`
      : `+${Math.round((cantosFactor - 1) * 100)}% (${cantosCount} ${cantosCount === 1 ? 'cante realizado' : 'cantos realizados'})`;

  // =========================================================================
  // FACTOR 6: REFRESCOS Y REPASOS (La Ley de los 3 Refrescos y Repetición Espaciada)
  // =========================================================================
  const refrescosCompleted = Math.min(3, refrescosSessions.length);
  let refrescosFactor = 1.0;
  let refrescosImpactLabel = "Sin refrescos iniciales";

  if (refrescosCompleted === 3) {
    refrescosFactor = 2.10;
    refrescosImpactLabel = "+110% estabilidad (3/3 Refrescos completados)";
  } else if (refrescosCompleted === 2) {
    refrescosFactor = 1.55;
    refrescosImpactLabel = "+55% estabilidad (2/3 Refrescos realizados)";
  } else if (refrescosCompleted === 1) {
    refrescosFactor = 1.25;
    refrescosImpactLabel = "+25% estabilidad (1/3 Refresco realizado)";
  } else {
    refrescosFactor = 0.85;
    refrescosImpactLabel = "-15% estabilidad (Falta consolidación de refresco)";
  }

  // =========================================================================
  // FACTOR 7: VUELTAS MENSUALES (Consolidador Sináptico de Largo Plazo)
  // REFORZADO: V0: 1.0x | V1: 1.85x | V2: 3.10x | V3: 4.60x | V4+: hasta 6.20x
  // =========================================================================
  const vueltas = Math.max(0, progress?.vueltas || (repasosSessions.length + (cantosCount > 0 ? 1 : 0)));
  let vueltasFactor = 1.0;
  if (vueltas === 1) {
    vueltasFactor = 1.85;
  } else if (vueltas === 2) {
    vueltasFactor = 3.10;
  } else if (vueltas === 3) {
    vueltasFactor = 4.60;
  } else if (vueltas >= 4) {
    vueltasFactor = Math.min(6.20, 4.60 + (vueltas - 3) * 0.80);
  }

  const vueltasImpactLabel = vueltas === 0
    ? "Vuelta inicial (Sin vueltas completas)"
    : `+${Math.round((vueltasFactor - 1) * 100)}% (${vueltas} ${vueltas === 1 ? 'vuelta consolidada' : 'vueltas consolidadas'})`;

  // =========================================================================
  // CÁLCULO DE LA ESTABILIDAD MNÉMICA TOTAL (S en días)
  // S = S_base * F_horas * F_dificultad * F_cantos * F_velocidad * F_nota * F_refrescos * F_vueltas
  // =========================================================================
  const baseMemoryStrength = 3.5;

  let stabilityDays = baseMemoryStrength 
    * studyHoursFactor 
    * difficultyFactor 
    * cantosFactor 
    * cantoSpeedFactor 
    * cantoGradeFactor 
    * refrescosFactor 
    * vueltasFactor;

  // Límite de seguridad fisiológica: mínimo 1.5 días, máximo 180 días
  stabilityDays = Math.min(180, Math.max(1.5, stabilityDays));
  stabilityDays = Math.round(stabilityDays * 10) / 10;

  // =========================================================================
  // CÁLCULO DE LA RETENCIÓN ACTUAL (R_hoy en %)
  // Fórmula: R(t) = 100 * e^(-t_eff / S)
  // =========================================================================
  const rawRetention = 100 * Math.exp(-effectiveDaysElapsed / stabilityDays);
  const currentRetention = Math.min(100, Math.max(5, Math.round(rawRetention * 10) / 10));

  // Días hasta el Umbral Crítico del 80% (t_80 = -S * ln(0.80) ≈ 0.22314 * S)
  const daysTotalTo80 = Math.max(0.5, -stabilityDays * Math.log(0.80));
  const daysUntilCritical80 = Math.round(daysTotalTo80 - effectiveDaysElapsed);
  const isBelowCritical80 = currentRetention < 80;

  // Fecha proyectada de cruce del umbral 80% a partir de hoy
  const critDate = new Date(todayDate);
  critDate.setDate(critDate.getDate() + daysUntilCritical80);
  const critical80DateStr = getLocalDateString(critDate);

  // =========================================================================
  // ESTADO, DIAGNÓSTICO Y CONSEJO ACCIONABLE
  // "para que sea lo más preciso posible y poder ver si tengo el tema bien estudiado
  //  si yo tengo mal estudiado si tengo que repasarlo y estas cosas"
  // =========================================================================
  let status: TopicMemoryStatus = 'bueno';
  let statusTitle = "Bien Estudiado (Estable)";
  let statusBadgeClass = "bg-indigo-500/20 text-indigo-300 border-indigo-500/30";
  let statusBorderClass = "border-indigo-500/40";
  let statusIconColor = "text-indigo-400";
  let statusSummary = "Tema retenido en memoria activa con estabilidad suficiente.";
  let actionUrgency: EbbinghausAnalysis['actionUrgency'] = 'baja';

  if (currentRetention >= 85) {
    status = 'excelente';
    statusTitle = "Excelente (Consolidado)";
    statusBadgeClass = "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
    statusBorderClass = "border-emerald-500/40";
    statusIconColor = "text-emerald-400";
    statusSummary = "Tema perfectamente grabado en memoria a largo plazo.";
    actionUrgency = 'baja';
  } else if (currentRetention >= 80) {
    status = 'bueno';
    statusTitle = "Bien Estudiado (Seguro)";
    statusBadgeClass = "bg-blue-500/20 text-blue-300 border-blue-500/30";
    statusBorderClass = "border-blue-500/40";
    statusIconColor = "text-blue-400";
    statusSummary = "Tema sólido, próximo al punto de control periódico.";
    actionUrgency = 'media';
  } else if (currentRetention >= 70) {
    status = 'atencion';
    statusTitle = "En Decaimiento (Conviene Refrescar)";
    statusBadgeClass = "bg-amber-500/20 text-amber-300 border-amber-500/30";
    statusBorderClass = "border-amber-500/40";
    statusIconColor = "text-amber-400";
    statusSummary = "Pérdida de retención activa iniciada. Bajo el umbral del 80%.";
    actionUrgency = 'alta';
  } else {
    status = 'critico';
    statusTitle = "Olvido Crítico / Mal Asimilado";
    statusBadgeClass = "bg-rose-500/20 text-rose-300 border-rose-500/30";
    statusBorderClass = "border-rose-500/40";
    statusIconColor = "text-rose-400";
    statusSummary = "Retención comprometida. Alto riesgo de bloqueo mental en cante.";
    actionUrgency = 'inmediata';
  }

  // Si la última nota fue un suspenso grave (< 4.0), forzar status de atención o crítico
  if (lastCantoGrade !== null && lastCantoGrade < 5.0 && status === 'excelente') {
    status = 'atencion';
    statusTitle = "Suspenso Reciente (Requiere Refuerzo)";
    statusBadgeClass = "bg-amber-500/20 text-amber-300 border-amber-500/30";
  }

  // Generar Diagnóstico Pedagógico y Detallado
  const diagParts: string[] = [];

  // Fijadores principales: Cantos y Vueltas
  if (vueltas > 0 || cantosCount > 0) {
    const anchors: string[] = [];
    if (vueltas > 0) anchors.push(`${vueltas} ${vueltas === 1 ? 'vuelta completada' : 'vueltas consolidadas'} (+${Math.round((vueltasFactor - 1) * 100)}% estabilidad)`);
    if (cantosCount > 0) anchors.push(`${cantosCount} ${cantosCount === 1 ? 'cante oral' : 'cantes orales'} (+${Math.round((cantosFactor - 1) * 100)}% retención)`);
    diagParts.push(`Fijación sináptica reforzada por ${anchors.join(" y ")}: vida media ampliada a ${stabilityDays} días.`);
  }

  // Freno diferencial
  if (brakeType === 'freno_mixto') {
    diagParts.push(`Freno diferencial activo: tu repaso de estudio amortigua el 50% del decaimiento acumulado (${effectiveDaysElapsed}d efectivos).`);
  } else if (brakeType === 'cante_total') {
    diagParts.push(`Evocación oral dominante: el cante oral fijó el 100% de la curva mnémica.`);
  }

  // Diagnóstico sobre cantos, velocidad y nota
  if (cantosCount > 0) {
    if (hasMasteryBonus) {
      diagParts.push(`¡Maestría ante tribunal! Cantaste en ventana (${formatTimeMins(lastCantoTotalMins!)} min) con nota ${lastCantoGrade!.toFixed(1)}/10 (+15% bonus de fijación de élite).`);
    } else if (lastCantoGrade !== null && lastCantoGrade >= 7.0 && lastCantoTotalMins && lastCantoTotalMins <= 13.0) {
      diagParts.push(`Dominio oral destacado: cantaste en ${formatTimeMins(lastCantoTotalMins)} con nota ${lastCantoGrade.toFixed(1)}/10. Tu rapidez sin titubeos consolida la memoria.`);
    } else if (lastCantoTotalMins && lastCantoTotalMins > 13.67) {
      diagParts.push(`Cante lento (${formatTimeMins(lastCantoTotalMins)}): superaste los 13:40 min reglamentarios, lo que evidencia pausas para recordar epígrafes.`);
    } else if (lastCantoGrade !== null && lastCantoGrade < 5.0) {
      diagParts.push(`Calificación suspensa (${lastCantoGrade.toFixed(1)}/10) en tu último cante: refleja lagunas conceptuales que debilitan la huella de memoria.`);
    } else {
      diagParts.push(`Has cantado este tema ${cantosCount === 1 ? '1 vez' : `${cantosCount} veces`}. Tu último tiempo fue ${lastCantoTotalMins ? formatTimeMins(lastCantoTotalMins) : '—'}${lastCantoGrade !== null ? ` con nota ${lastCantoGrade.toFixed(1)}/10` : ''}.`);
    }
  } else {
    diagParts.push(`Aún no has cantado este tema ante cronómetro: el cante oral es la prueba de fuego de evocación activa que triplica la resistencia al olvido.`);
  }

  // Diagnóstico sobre refrescos y horas
  if (refrescosCompleted === 3) {
    diagParts.push(`Completaste con éxito los 3 refrescos diarios consecutivos, protegiendo el tema del olvido inicial.`);
  } else if (refrescosCompleted > 0 && vueltas === 0) {
    diagParts.push(`Llevas ${refrescosCompleted}/3 refrescos iniciales: termina los refrescos pendientes para afianzar la estructura.`);
  } else if (refrescosCompleted === 0 && vueltas === 0) {
    diagParts.push(`No realizaste refrescos en los primeros días, lo que ha provocado una caída más pronunciada en la curva.`);
  }

  // Diagnóstico sobre tiempo transcurrido
  if (effectiveDaysElapsed === 0) {
    diagParts.push(`Interacción registrada hoy: la retención se encuentra al ${Math.round(currentRetention)}%.`);
  } else if (effectiveDaysElapsed <= 7) {
    diagParts.push(`Último contacto hace ${effectiveDaysElapsed} ${effectiveDaysElapsed === 1 ? 'día efectivo' : 'días efectivos'} (${anchorType}).`);
  } else {
    diagParts.push(`Han transcurrido ${effectiveDaysElapsed} días efectivos sin contacto, reduciendo la retención al ${Math.round(currentRetention)}%.`);
  }

  const diagnostic = diagParts.join(" ");

  // Consejo de Acción Inmediato
  let actionAdvice = "";
  if (isBelowCritical80 || currentRetention < 75) {
    if (cantosCount > 0 && lastCantoGrade !== null && lastCantoGrade < 5.0) {
      actionAdvice = "Repaso urgente hoy: revisa los epígrafes donde fallaste en el cante y realiza una lectura cronometrada.";
    } else {
      actionAdvice = `Repaso prioritario: retención estimada en ${Math.round(currentRetention)}% (bajo el umbral de seguridad del 80%). Programa un repaso de vuelta hoy o mañana.`;
    }
  } else if (daysUntilCritical80 <= 3) {
    actionAdvice = `Toca repaso en los próximos ${daysUntilCritical80} días para renovar la curva antes de descender del 80%.`;
  } else if (cantosCount === 0 && refrescosCompleted >= 2) {
    actionAdvice = "El tema está bien asimilado: momento idóneo para cantar ante cronómetro (objetivo 11:50–13:40 min).";
  } else {
    actionAdvice = `Memoria estable: tienes ${daysUntilCritical80} días de margen de retención segura antes de necesitar un nuevo repaso.`;
  }

  // =========================================================================
  // GENERAR PUNTOS DE LA GRÁFICA DE EBBINGHAUS (0 a 30-45 días)
  // =========================================================================
  const chartDaysTotal = Math.max(28, Math.min(60, Math.ceil(Math.max(effectiveDaysElapsed + 14, daysTotalTo80 + 7))));
  const chartData: EbbinghausPoint[] = [];

  // Generamos puntos con mayor resolución en los primeros días
  const sampleDays: number[] = [];
  for (let d = 0; d <= chartDaysTotal; d++) {
    if (d <= 14 || d % 2 === 0 || d === Math.round(effectiveDaysElapsed) || d === Math.round(daysTotalTo80)) {
      if (!sampleDays.includes(d)) sampleDays.push(d);
    }
  }
  sampleDays.sort((a, b) => a - b);

  sampleDays.forEach((dayNum) => {
    const ptDate = new Date(anchorDateObj);
    ptDate.setDate(ptDate.getDate() + dayNum);
    const dateStr = ptDate.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
    const fullDate = getLocalDateString(ptDate);

    const ret = Math.min(100, Math.max(0, 100 * Math.exp(-dayNum / stabilityDays)));
    const isToday = Math.abs(dayNum - effectiveDaysElapsed) < 0.8;
    const isAnchor = dayNum === 0;
    const isThreshold80 = Math.abs(dayNum - daysTotalTo80) < 0.9;

    let label = dayNum === 0 ? "Último hito" : `+${dayNum}d`;
    if (isToday) label = "Hoy";

    chartData.push({
      day: dayNum,
      label,
      dateStr,
      fullDate,
      retention: Number(ret.toFixed(1)),
      isToday,
      isAnchor,
      isThreshold80,
      retentionFormatted: `${ret.toFixed(1)}%`
    });
  });

  const factors: EbbinghausFactorBreakdown = {
    studyHoursTotal,
    studyHoursFactor: Number(studyHoursFactor.toFixed(2)),
    studyHoursImpactLabel,
    difficulty: effDifficulty,
    difficultyFactor: Number(difficultyFactor.toFixed(2)),
    difficultyImpactLabel,
    cantosCount,
    cantosFactor: Number(cantosFactor.toFixed(2)),
    cantosImpactLabel,
    lastCantoMinutes,
    lastCantoSeconds,
    lastCantoTotalMins: lastCantoTotalMins !== null ? Number(lastCantoTotalMins.toFixed(2)) : null,
    bestCantoMinutes,
    bestCantoSeconds,
    cantoSpeedFactor: Number(cantoSpeedFactor.toFixed(2)),
    cantoSpeedLabel,
    cantoSpeedImpactLabel,
    lastCantoGrade,
    bestCantoGrade,
    cantoGradeFactor: Number(cantoGradeFactor.toFixed(2)),
    cantoGradeImpactLabel,
    refrescosCompleted,
    refrescosFactor: Number(refrescosFactor.toFixed(2)),
    refrescosImpactLabel,
    vueltas,
    vueltasFactor: Number(vueltasFactor.toFixed(2)),
    vueltasImpactLabel,
    hasMasteryBonus,
    brakeType,
    stabilityDays,
    anchorDate: anchorDateStr,
    anchorType,
    daysSinceAnchor,
    effectiveDaysElapsed
  };

  return {
    hasData: true,
    currentRetention,
    status,
    statusTitle,
    statusBadgeClass,
    statusBorderClass,
    statusIconColor,
    statusSummary,
    daysSinceLastAction: Math.round(daysSinceAnchor),
    daysUntilCritical80,
    critical80DateStr,
    isBelowCritical80,
    diagnostic,
    actionAdvice,
    actionUrgency,
    stabilityDays,
    factors,
    chartData
  };
}

function createEmptyAnalysis(difficulty: number, pages: number): EbbinghausAnalysis {
  return {
    hasData: false,
    currentRetention: 0,
    status: 'critico',
    statusTitle: 'Sin Estudiar',
    statusBadgeClass: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
    statusBorderClass: 'border-slate-700',
    statusIconColor: 'text-slate-400',
    statusSummary: 'Tema virgen: aún no has registrado el primer estudio.',
    daysSinceLastAction: 0,
    daysUntilCritical80: 0,
    critical80DateStr: null,
    isBelowCritical80: true,
    diagnostic: 'Aún no has registrado el estudio inicial de este tema. Para activar el motor de retención de Ebbinghaus y calibrar tu curva con horas, dificultad y cantes, registra tu primera sesión de estudio.',
    actionAdvice: 'Comienza realizando la lectura comprensiva y subrayado del tema (Estudio Inicial).',
    actionUrgency: 'inmediata',
    stabilityDays: 3.5,
    factors: {
      studyHoursTotal: 0,
      studyHoursFactor: 1.0,
      studyHoursImpactLabel: '0h registradas',
      difficulty: difficulty || 5,
      difficultyFactor: 1.0,
      difficultyImpactLabel: 'Dificultad estándar',
      cantosCount: 0,
      cantosFactor: 1.0,
      cantosImpactLabel: 'Sin cantos',
      lastCantoMinutes: null,
      lastCantoSeconds: null,
      lastCantoTotalMins: null,
      bestCantoMinutes: null,
      bestCantoSeconds: null,
      cantoSpeedFactor: 1.0,
      cantoSpeedLabel: 'Sin datos',
      cantoSpeedImpactLabel: 'Neutro',
      lastCantoGrade: null,
      bestCantoGrade: null,
      cantoGradeFactor: 1.0,
      cantoGradeImpactLabel: 'Sin notas',
      refrescosCompleted: 0,
      refrescosFactor: 1.0,
      refrescosImpactLabel: '0/3 Refrescos',
      vueltas: 0,
      vueltasFactor: 1.0,
      vueltasImpactLabel: 'Sin vueltas',
      hasMasteryBonus: false,
      brakeType: 'estudio_inicial',
      stabilityDays: 3.5,
      anchorDate: null,
      anchorType: 'none',
      daysSinceAnchor: 0,
      effectiveDaysElapsed: 0
    },
    chartData: []
  };
}

export function formatTimeMins(minsDecimal: number): string {
  const m = Math.floor(minsDecimal);
  const s = Math.round((minsDecimal - m) * 60);
  return `${m}:${s < 10 ? '0' : ''}${s} min`;
}
