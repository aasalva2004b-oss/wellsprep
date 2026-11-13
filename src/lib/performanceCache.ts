import type { Topic } from "../types";
import type { TopicProgressData } from "./prediction";
import { calculateTopicCycle } from "./oposicionCycle";
import { safeParseDate, getLocalDateString } from "./utils";
import { calculateCanonicalReviewTime, type RepasoPredictionResult } from "./repasoPredictor";
import { buildLearnerProfile } from './adaptiveLearningEngine';
import { getLatestCantoForTopic } from "./cantoUtils";
import { calculateCanonicalRetention, getCanonicalReviewDate, type TopicMemoryStatus, type EbbinghausAnalysis } from "./ebbinghaus";
import { buildCanonicalTopicMap, type CanonicalTopic } from './canonicalTopicService';

export interface FastTopicTelemetry {
  canonical: CanonicalTopic;
  sessions: any[];
  lastCanto: {
    hasCanto: boolean; formatted: string; mins: number; secs: number;
    grade: number | null; date: string | null; count: number;
  };
  cycle: ReturnType<typeof calculateTopicCycle>;
  srs: {
    isDueToday: boolean; isOverdue: boolean; nextDate: string | null; daysDiff: number | null;
  };
  reviewEstimate: RepasoPredictionResult;
  memory: EbbinghausAnalysis;
  ebbinghaus: {
    hasData: boolean; retention: number; status: TopicMemoryStatus; statusTitle: string;
    isDue: boolean; daysUntil80: number; stabilityDays: number; critical80DateStr: string | null;
  };
}

/** Shared projections only: never reads Firebase or writes cached derived values. */
export function buildSubjectTelemetryIndex(
  topics: Topic[], userProgress: Record<string, TopicProgressData>, recentSessions: any[],
  topicState?: Map<string, CanonicalTopic>,
): Map<string, FastTopicTelemetry> {
  const canonicalMap = topicState || buildCanonicalTopicMap(topics, userProgress, recentSessions);
  const learnerProfile = buildLearnerProfile(recentSessions, canonicalMap);
  const today = safeParseDate(getLocalDateString());
  const index = new Map<string, FastTopicTelemetry>();
  for (const topic of topics) {
    const canonical = canonicalMap.get(topic.id);
    if (!canonical) continue;
    const sessions = (canonical as CanonicalTopic & { sessions?: any[] }).sessions || [];
    const memory = calculateCanonicalRetention(canonical);
    const nextDate = getCanonicalReviewDate(canonical, memory);
    const next = nextDate ? safeParseDate(nextDate) : null;
    const daysDiff = next ? Math.round((next.getTime() - today.getTime()) / 86_400_000) : null;
    const isOverdue = daysDiff !== null && daysDiff < 0;
    const isDueToday = daysDiff !== null && daysDiff <= 0;
    const progress = userProgress[topic.id];
    const cycle = calculateTopicCycle(topic.id, progress, sessions, canonical);
    const canto = getLatestCantoForTopic(sessions, topic, progress);
    index.set(topic.id, {
      canonical, sessions, cycle, memory,
      lastCanto: { hasCanto: canto.hasCanto, formatted: canto.formatted, mins: canto.mins,
        secs: canto.secs, grade: canto.grade, date: canto.date, count: canto.count },
      srs: { nextDate, daysDiff, isOverdue, isDueToday },
      reviewEstimate: calculateCanonicalReviewTime(canonical, learnerProfile),
      ebbinghaus: {
        hasData: memory.hasData, retention: memory.currentRetention, status: memory.status,
        statusTitle: memory.statusTitle, isDue: memory.hasData && (isDueToday || isOverdue),
        daysUntil80: memory.daysUntilCritical80, stabilityDays: memory.stabilityDays,
        critical80DateStr: memory.critical80DateStr,
      },
    });
  }
  return index;
}
