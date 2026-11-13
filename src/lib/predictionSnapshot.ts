import type { CanonicalTopic } from './canonicalTopicService';
import type { PersonalizedDurationEstimate, EstimatedActivity, EstimationWork } from './personalizedEstimator';
import type { PredictionSnapshot } from './observedSession';

/** JSON-only evidence captured before the real duration is entered. */
export function capturePrediction(estimate: PersonalizedDurationEstimate, topic: CanonicalTopic, activity: EstimatedActivity, generatedAt: Date, work?: EstimationWork): PredictionSnapshot {
  return {
    modelVersion: estimate.modelVersion, generatedAt: generatedAt.toISOString(), activity,
    estimatedMinutes: estimate.estimatedMinutes, interval: estimate.interval ? { ...estimate.interval } : null,
    evidenceCount: estimate.evidenceCount, method: estimate.method,
    featuresUsed: [...estimate.featuresUsed], factors: [...estimate.factors],
    inputs: {
      ...(topic.hasExplicitPages ? { totalPages: topic.pages } : {}),
      ...(topic.hasExplicitWords ? { totalWords: topic.numeroPalabras } : {}),
      ...(topic.hasExplicitDifficulty ? { difficulty: topic.difficulty } : {}),
      ...(work ? { work: JSON.parse(JSON.stringify(work)) } : {}),
    },
  };
}
