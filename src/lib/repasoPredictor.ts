import type { Topic } from "../types";
import type { TopicProgressData } from "./prediction";
import { getCanonicalTopic, buildCanonicalTopicMap, type CanonicalTopic } from './canonicalTopicService';
import { buildLearnerProfile, estimateAdaptiveDuration, type LearnerProfile } from './adaptiveLearningEngine';

export interface RepasoPredictionResult {
  predictedMinutes: number | null;
  formatted: string;
  hours: number;
  mins: number;
  /** Availability of evidence, never a measured probability of predictive accuracy. */
  confidence: number;
  isProvisional: boolean;
  basis: 'recorded_volume' | 'unmeasured_volume';
  interval: { low: number; high: number } | null;
  evidenceCount: number;
  method: string;
  factorsConsidered: string[];
  factors: {
    studyHoursBaseMins: number;
    difficultyFactor: number;
    cantoImpactFactor: number;
    vueltasFactor: number;
    ebbinghausDecayFactor: number;
    hasHistoricalReviews: boolean;
  };
}

/** Compatibility adapter: Temario and weekly planning use exactly the same duration service. */
export function calculateEstimatedReviewTime(
  topic: Topic, progress?: TopicProgressData, topicSessions: any[] = [],
  allTopics: Topic[] = [], allProgress: Record<string, TopicProgressData> = {}, allSessions: any[] = [],
): RepasoPredictionResult {
  const topics = allTopics.length ? allTopics : [topic];
  const history = allSessions.length ? allSessions : topicSessions;
  const masters = progress ? { ...allProgress, [topic.id]: progress } : allProgress;
  const map = buildCanonicalTopicMap(topics, masters, history);
  const canonical = map.get(topic.id) || getCanonicalTopic(topic, topics, masters, history);
  const profile = buildLearnerProfile(history, map);
  return calculateCanonicalReviewTime(canonical, profile);
}

/** Reuse one immutable topic map and learner context for a whole screen. */
export function calculateCanonicalReviewTime(canonical: CanonicalTopic, profile: LearnerProfile): RepasoPredictionResult {
  const estimate = estimateAdaptiveDuration(canonical, 'repaso', profile);
  const predictedMinutes = estimate.estimatedMinutes;
  const hours = predictedMinutes === null ? 0 : Math.floor(predictedMinutes / 60);
  const mins = predictedMinutes === null ? 0 : predictedMinutes % 60;
  const provisional = !estimate.available || estimate.confidence === 'provisional';
  return {
    predictedMinutes,
    formatted: predictedMinutes === null ? 'Sin evidencia suficiente' : `${hours > 0 ? `${hours}h ` : ''}${mins}m${provisional ? ' (provisional)' : ''}`,
    hours, mins,
    confidence: estimate.confidence === 'alta' ? 1 : estimate.confidence === 'media' ? .5 : 0,
    isProvisional: provisional,
    interval: estimate.interval, evidenceCount: estimate.evidenceCount, method: estimate.method, factorsConsidered: estimate.factors,
    basis: canonical.hasExplicitPages ? 'recorded_volume' : 'unmeasured_volume',
    factors: {
      studyHoursBaseMins: estimate.details.baseVolumeMinutes,
      difficultyFactor: 1,
      cantoImpactFactor: 1,
      vueltasFactor: 1,
      ebbinghausDecayFactor: 1,
      hasHistoricalReviews: (canonical as any).reviewSessions?.length > 0,
    },
  };
}
