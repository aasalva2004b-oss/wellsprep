import { Session } from "../types";
import { CanonicalTopic, sessionDurationMinutes, getSessionCategory } from "./canonicalTopicService";
import { safeParseDate, getLocalDateString } from "./utils";
import { isCantoSession, getCantoDuration, compareSessionsAsc } from "./cantoUtils";
import { calculateCanonicalRetention, getCanonicalReviewDate } from "./ebbinghaus";
import { estimatePersonalizedDuration, getMeasuredSessionPages } from "./personalizedEstimator";
import { extractSessionTelemetry } from './sessionTelemetry';
import { selectSessionVersions } from './sessionVersions';

export interface LearnerProfile {
  // Ritmos empíricos globales (calculados a partir de sesiones reales)
  hasSufficientData: boolean;
  totalRecordedSessionsCount: number;
  totalStudiedHours: number;
  paceSampleCounts?: { study: number; review: number; refresh: number };

  // Explicit user settings override empirical rates, never the measured history.
  manualPaces?: { study?: number; review?: number; refresh?: number };
  manualDurations?: { cante?: number; refresh1?: number; refresh2?: number; refresh3?: number };

  // Velocidades de lectura y estudio (minutos por página real)
  studyPaceMinPerPage: number | null;       // Ritmo de Primer Estudio (ej: 6.2 min/pág)
  reviewPaceMinPerPage: number | null;      // Ritmo de Repaso general (ej: 3.2 min/pág)
  refreshPaceMinPerPage: number | null;     // Ritmo de Refresco (ej: 2.1 min/pág)
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
      studySamplesCount?: number;
      reviewSamplesCount?: number;
    }
  >;

  // Métricas avanzadas PLSEMA aprendidas del usuario
  plsemaProfile?: {
    dominantPhase: string;
    activeRecallRatio: number; // % M + A
    phaseAverages: Record<string, number>; // minutos medios por fase
  };

  // Evaluación y calibración empírica de predicciones (MAE / Precisión)
  predictionAccuracy?: {
    totalEvaluatedSessions: number;
    meanAbsoluteErrorMinutes: number; // Error medio absoluto
    accuracyPct: number; // 100 menos error absoluto relativo medio a la duración observada, limitado a 0-100
    sampleConfidence: "alta" | "media" | "provisional";
  };
}

export interface AdaptiveDurationEstimate {
  estimatedMinutes: number | null;
  available: boolean;
  interval: { low: number; high: number } | null;
  evidenceCount: number;
  effectiveSampleSize: number;
  method: string;
  modelVersion: string;
  factors: string[];
  featuresUsed: string[];
  excludedCount: number;
  personalizedPrediction: Record<string, any>;
  phaseEstimates?: Partial<Record<string, { estimatedMinutes: number; evidenceCount: number }>>;
  confidence: "alta" | "media" | "provisional";
  explanation: string;
  paceMinPerPage: number;
  pagesUsed: number;
  totalPages: number;
  fromPage?: number;
  toPage?: number;
  isPartialStudy: boolean;
  hasExplicitPages: boolean;
  isCustomSpeed: boolean;
  details: {
    baseVolumeMinutes: number;
    difficultyAdjustmentMinutes: number;
    vueltaAdjustmentMinutes: number;
    decayAdjustmentMinutes: number;
    plsemaAdjustmentMinutes?: number;
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
  suggestedReviewDate: string | null;       // Fecha recomendada para el próximo repaso (YYYY-MM-DD)
  isUrgent: boolean;
}

const profileContexts = new WeakMap<LearnerProfile, { history: Session[]; topics: Map<string, CanonicalTopic> }>();

const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const center = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[center] : (sorted[center - 1] + sorted[center]) / 2;
};

function recordedInstant(value: any): number | null {
  const time = value instanceof Date ? value.getTime() : typeof value?.toMillis === 'function' ? value.toMillis()
    : typeof value?.seconds === 'number' ? value.seconds * 1000 + Number(value.nanoseconds || 0) / 1e6
      : typeof value === 'number' ? value : typeof value === 'string' && value ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? time : null;
}

/** A stored estimate alone is not proof that it preceded the observed result. */
function prospectiveDurationPrediction(session: Session): number | null {
  const raw = session as Session & Record<string, any>;
  const prediction = raw.prediction;
  if (!prediction || typeof prediction !== 'object') return null;
  const stages = [prediction.captureStage, prediction.predictionStage, raw.predictionStage, raw.predictionCaptureStage];
  if (stages.some(stage => ['before_persistence', 'posthoc', 'post_hoc', 'after_outcome', 'after_observation'].includes(String(stage).toLowerCase()))
    || prediction.modelVersion === 'manual' || String(prediction.method || '').startsWith('manual')) return null;
  const generated = recordedInstant(prediction.generatedAt);
  const explicitOutcome = recordedInstant(raw.startedAt) ?? recordedInstant(raw.endedAt) ?? recordedInstant(raw.completedAt);
  const dayStart = /^\d{4}-\d{2}-\d{2}$/.test(session.date || '') ? recordedInstant(`${session.date}T00:00:00.000Z`) : null;
  // A persistence timestamp is not the time at which the real outcome became
  // known. With no observed clock, require a forecast from an earlier civil day.
  const outcome = explicitOutcome ?? dayStart;
  const minutes = prediction.estimatedMinutes;
  return generated !== null && outcome !== null && generated < outcome && typeof minutes === 'number'
    && Number.isFinite(minutes) && minutes > 0 ? minutes : null;
}

/** Diagnostics and context only. All forecasts are delegated to personalizedEstimator. */
export function buildLearnerProfile(sessions: Session[], canonicalTopicMap: Map<string, CanonicalTopic>): LearnerProfile {
  const valid = selectSessionVersions(sessions, new Date()).filter(session => {
    if (!session || typeof session !== 'object' || (session as Session & Record<string, any>).mergedIntoSessionId) return false;
    const minutes = sessionDurationMinutes(session);
    // A single-session elapsed time cannot exceed a whole day; retain slower
    // measured page rates within that limit rather than imposing a speed floor.
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 24 * 60) return false;
    return true;
  });
  const paces = { study: [] as number[], review: [] as number[], refresh: [] as number[] };
  const refreshDurations: number[] = [];
  const phaseTotals: Record<string, { minutes: number; count: number }> = {};
  let phaseMinutes = 0, activeMinutes = 0;
  let absoluteError = 0, relativeError = 0, evaluated = 0;
  const subjectSamples: Record<string, { study: number[]; review: number[] }> = {};
  for (const session of valid) {
    const category = getSessionCategory(session);
    const activity = category === 'initial_study' ? 'study' : category === 'review' ? 'review' : category === 'refresh' ? 'refresh' : undefined;
    const topic = canonicalTopicMap.get(session.topicId);
    // An unlocated legacy session cannot establish minutes per page.
    const pages = getMeasuredSessionPages(session);
    const minutes = sessionDurationMinutes(session);
    if (activity && pages !== null && pages > 0) {
      paces[activity].push(minutes / pages);
      if (topic && activity !== 'refresh') {
        const bucket = subjectSamples[topic.subjectId] ||= { study: [], review: [] };
        bucket[activity].push(minutes / pages);
      }
    }
    if (category === 'refresh') refreshDurations.push(minutes);
    const plsema = extractSessionTelemetry(session).plsema;
    if (plsema) {
      for (const phase of plsema.observedPhases) {
        const value = plsema.minutes[phase];
        const bucket = phaseTotals[phase] ||= { minutes: 0, count: 0 };
        bucket.minutes += value; bucket.count++;
        phaseMinutes += value;
        if (phase === 'memorizar' || phase === 'cantar') activeMinutes += value;
      }
    }
    const expected = prospectiveDurationPrediction(session);
    if (expected !== null) {
      absoluteError += Math.abs(minutes - expected);
      relativeError += Math.abs(minutes - expected) / minutes;
      evaluated++;
    }
  }
  const phaseAverages = Object.fromEntries(Object.entries(phaseTotals).map(([phase, value]) => [phase, value.minutes / value.count]));
  const dominant = Object.entries(phaseTotals).sort((a, b) => b[1].minutes - a[1].minutes)[0]?.[0];
  const profile: LearnerProfile = {
    hasSufficientData: paces.study.length + paces.review.length + paces.refresh.length >= 5,
    totalRecordedSessionsCount: valid.length,
    totalStudiedHours: valid.reduce((sum, session) => sum + sessionDurationMinutes(session), 0) / 60,
    paceSampleCounts: { study: paces.study.length, review: paces.review.length, refresh: paces.refresh.length },
    studyPaceMinPerPage: median(paces.study), reviewPaceMinPerPage: median(paces.review), refreshPaceMinPerPage: median(paces.refresh),
    // Legacy display fields are unknown without observations, never population priors.
    refresh1DurationMin: median(refreshDurations), refresh2DurationMin: median(refreshDurations), refresh3DurationMin: median(refreshDurations),
    readingWpm: null, speakingWpm: null,
    difficultySensitivity: 0, vueltaSpeedupFactor: 1, decayDelayPenaltyPerDay: 0,
    subjectPaces: Object.fromEntries(Object.entries(subjectSamples).map(([subject, values]) => [subject, {
      studyMinPerPage: median(values.study), reviewMinPerPage: median(values.review),
      samplesCount: values.study.length + values.review.length,
      studySamplesCount: values.study.length, reviewSamplesCount: values.review.length,
    }])),
    plsemaProfile: dominant && phaseMinutes > 0 ? { dominantPhase: dominant, activeRecallRatio: activeMinutes / phaseMinutes * 100, phaseAverages } : undefined,
    predictionAccuracy: evaluated ? {
      totalEvaluatedSessions: evaluated,
      meanAbsoluteErrorMinutes: absoluteError / evaluated,
      accuracyPct: Math.max(0, 100 * (1 - relativeError / evaluated)),
      sampleConfidence: evaluated >= 10 ? 'alta' : evaluated >= 3 ? 'media' : 'provisional',
    } : undefined,
  };
  profileContexts.set(profile, { history: valid, topics: canonicalTopicMap });
  return profile;
}

/** A single differentiated, evidence-based model serves every duration consumer. */
export function estimateAdaptiveDuration(
  topic: CanonicalTopic | undefined,
  activityType: 'estudio_nuevo' | 'refresco' | 'repaso' | 'cante',
  profile: LearnerProfile,
  refrescoIndex?: 1 | 2 | 3,
  partialWork?: { fromPage?: number; toPage?: number; targetPages?: number; pageNumbers?: number[] },
): AdaptiveDurationEstimate {
  const context = profileContexts.get(profile) || { history: topic?.sessions || [], topics: new Map(topic ? [[topic.id, topic]] : []) };
  const work = partialWork ? { fromPage: partialWork.fromPage, toPage: partialWork.toPage, pages: partialWork.targetPages, pageNumbers: partialWork.pageNumbers } : undefined;
  const result = topic ? estimatePersonalizedDuration({ topic, activity: activityType, history: context.history, topics: context.topics, asOf: new Date(), work, refreshOrdinal: refrescoIndex }) : undefined;
  const fullPages = topic?.pages || 0;
  const selectedPages = partialWork?.targetPages ?? (partialWork?.pageNumbers?.length || (partialWork?.fromPage !== undefined && partialWork?.toPage !== undefined ? partialWork.toPage - partialWork.fromPage + 1 : undefined));
  const pagesUsed = selectedPages ?? (activityType === 'estudio_nuevo' ? topic?.initialStudyCoverage.remainingPages : fullPages) ?? 0;
  const manualPace = activityType === 'estudio_nuevo' ? profile.manualPaces?.study : activityType === 'repaso' ? profile.manualPaces?.review : activityType === 'refresco' ? profile.manualPaces?.refresh : undefined;
  const suppliedDuration = activityType === 'cante' ? profile.manualDurations?.cante : activityType === 'refresco' && refrescoIndex ? profile.manualDurations?.[`refresh${refrescoIndex}`] : undefined;
  const hasManualDuration = Number.isFinite(suppliedDuration) && suppliedDuration > 0;
  const manual = hasManualDuration || Number.isFinite(manualPace) && manualPace > 0 && pagesUsed > 0;
  const method = hasManualDuration ? 'manual_duration' : manual ? 'manual_rate' : result?.method || 'unavailable';
  const manualFeatures = hasManualDuration ? ['manual_duration'] : ['manual_rate', 'requested_pages'];
  const minutes = hasManualDuration ? suppliedDuration : manual ? Math.max(1, Math.round(pagesUsed * manualPace)) : result?.estimatedMinutes ?? null;
  const factors = manual ? [hasManualDuration ? 'Duración introducida por el usuario; no es una predicción estadística.' : 'Ritmo introducido por el usuario; no es una predicción estadística.'] : result?.factors || ['Falta un tema para estimar.'];
  return {
    estimatedMinutes: minutes, available: minutes !== null,
    interval: manual ? null : result?.interval || null,
    evidenceCount: manual ? 0 : result?.evidenceCount || 0, effectiveSampleSize: manual ? 0 : result?.effectiveSampleSize || 0,
    method, modelVersion: manual ? 'manual' : result?.modelVersion || 'unavailable',
    factors, featuresUsed: manual ? manualFeatures : result?.featuresUsed || [], excludedCount: result?.excludedCount || 0,
    phaseEstimates: manual ? undefined : result?.phaseEstimates,
    personalizedPrediction: {
      modelVersion: manual ? 'manual' : result?.modelVersion || 'unavailable', generatedAt: new Date().toISOString(),
      activity: activityType, estimatedMinutes: minutes, interval: manual ? null : result?.interval || null,
      evidenceCount: manual ? 0 : result?.evidenceCount || 0, method,
      featuresUsed: manual ? manualFeatures : result?.featuresUsed || [], factors, workPages: pagesUsed || null,
    },
    confidence: manual ? 'provisional' : result?.confidence === 'alta' ? 'alta' : result?.confidence === 'media' ? 'media' : 'provisional',
    explanation: factors.join(' '),
    paceMinPerPage: minutes !== null && pagesUsed > 0 ? minutes / pagesUsed : null,
    pagesUsed, totalPages: fullPages, fromPage: partialWork?.fromPage, toPage: partialWork?.toPage,
    isPartialStudy: fullPages > 0 && pagesUsed < fullPages,
    hasExplicitPages: topic?.hasExplicitPages || false, isCustomSpeed: manual || (result?.evidenceCount || 0) > 0,
    details: { baseVolumeMinutes: minutes, difficultyAdjustmentMinutes: 0, vueltaAdjustmentMinutes: 0, decayAdjustmentMinutes: 0 },
  };
}

/**
 * Motor Central de la Curva de Ebbinghaus Adaptativa.
 * Estima la retención en base a evidencia real (cantes orales calificados vs repasos pasivos),
 * vueltas acumuladas, tiempo transcurrido y dificultad.
 */
export function calculateAdaptiveRetention(
  topic: CanonicalTopic,
  _sessions: Session[],
  _profile: LearnerProfile
): AdaptiveRetentionResult {
  const context = profileContexts.get(_profile);
  const analysis = topic.retentionEstimate ? calculateCanonicalRetention(topic)
    : calculateCanonicalRetention(topic, { history: context?.history || _sessions, topics: context?.topics || new Map([[topic.id, topic]]) });
  const daysSinceLastCanto = topic.lastCantoDate
    ? Math.max(0, Math.floor((Date.now() - safeParseDate(topic.lastCantoDate).getTime()) / 86_400_000)) : null;
  const status = analysis.status === 'excelente' ? 'consolidado'
    : analysis.status === 'bueno' ? 'estable' : analysis.status === 'atencion' ? 'desgaste' : 'critico';
  const grade = analysis.factors.lastCantoGrade;
  return {
    retentionPct: analysis.currentRetention,
    confidence: analysis.adaptive?.confidence === 'alta' ? 'alta' : analysis.adaptive?.confidence === 'media' ? 'media' : 'baja',
    status, statusLabel: analysis.statusTitle, statusBadgeClass: analysis.statusBadgeClass,
    stabilityDays: analysis.stabilityDays,
    daysSinceLastTouch: analysis.daysSinceLastAction,
    daysSinceLastCanto, lastCantoGrade: grade,
    evidenceLevel: !analysis.hasData ? 'sin_evidencia' : grade !== null ? 'canto_evaluado'
      : topic.reviewCount > 0 ? 'repaso_activo' : 'estudio_reciente',
    ebbinghausFactors: [analysis.diagnostic],
    recommendedAction: analysis.actionAdvice,
    suggestedReviewDate: getCanonicalReviewDate(topic, analysis),
    isUrgent: analysis.hasData && analysis.isBelowCritical80,
  };
}
