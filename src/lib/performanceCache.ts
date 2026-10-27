import { Topic } from "../types";
import { TopicProgressData } from "./prediction";
import { calculateTopicCycle } from "./oposicionCycle";
import { calculateNextSRSState } from "./srs";
import { safeParseDate, getLocalDateString } from "./utils";
import { calculateEstimatedReviewTime, RepasoPredictionResult } from "./repasoPredictor";
import { getLatestCantoForTopic, sessionMatchesTopic } from "./cantoUtils";
import { calculateEbbinghausCurve, TopicMemoryStatus } from "./ebbinghaus";

export interface FastTopicTelemetry {
  sessions: any[];
  lastCanto: {
    hasCanto: boolean;
    formatted: string;
    mins: number;
    secs: number;
    grade: number | null;
    date: string | null;
    count: number;
  };
  cycle: ReturnType<typeof calculateTopicCycle>;
  srs: {
    isDueToday: boolean;
    isOverdue: boolean;
    nextDate: string | null;
    daysDiff: number | null;
  };
  reviewEstimate: RepasoPredictionResult;
  ebbinghaus: {
    retention: number;
    status: TopicMemoryStatus;
    statusTitle: string;
    isDue: boolean;
  };
}

/**
 * Builds an O(N) indexed telemetry dictionary for all topics in the active subject or entire syllabus.
 * Calling this once per data update reduces O(N * M) nested computations to instant O(1) lookups.
 */
export function buildSubjectTelemetryIndex(
  topics: Topic[],
  userProgress: Record<string, TopicProgressData>,
  recentSessions: any[]
): Map<string, FastTopicTelemetry> {
  // 1. Bucket sessions by topicId and by number for high speed lookup
  const sessionsMap = new Map<string, any[]>();
  for (let i = 0; i < recentSessions.length; i++) {
    const s = recentSessions[i];
    if (!s) continue;
    const key = String(s.topicId || "").trim();
    if (key) {
      let list = sessionsMap.get(key);
      if (!list) {
        list = [];
        sessionsMap.set(key, list);
      }
      list.push(s);
    }
  }

  const todayStr = getLocalDateString();
  const todayDate = new Date(todayStr);
  const nowTime = new Date().getTime();
  const index = new Map<string, FastTopicTelemetry>();

  // 2. Compute telemetry for each topic
  for (let i = 0; i < topics.length; i++) {
    const topic = topics[i];
    const topicId = topic.id;
    const progress = userProgress[topicId];

    // Combine direct topicId matches, numeric topicId matches, and universal matcher
    const directSessions = sessionsMap.get(topicId) || [];
    const numberSessions = topic.number ? sessionsMap.get(String(topic.number)) || [] : [];
    
    // Deduplicate merged sessions by session ID
    const sessionSeen = new Set<string>();
    const topicSessions: any[] = [];

    for (const s of directSessions) {
      const sid = s.id || JSON.stringify(s);
      if (!sessionSeen.has(sid)) {
        sessionSeen.add(sid);
        topicSessions.push(s);
      }
    }

    for (const s of numberSessions) {
      const sid = s.id || JSON.stringify(s);
      if (!sessionSeen.has(sid) && sessionMatchesTopic(s, topic)) {
        sessionSeen.add(sid);
        topicSessions.push(s);
      }
    }

    // Always merge any matches from recentSessions to ensure zero missed records across all topics
    for (const s of recentSessions) {
      const sid = s.id || JSON.stringify(s);
      if (!sessionSeen.has(sid) && sessionMatchesTopic(s, topic)) {
        sessionSeen.add(sid);
        topicSessions.push(s);
      }
    }


    // Cycle computation
    const cycle = calculateTopicCycle(topicId, progress, topicSessions);

    // Canto telemetry using the rock-solid engine
    const latestCantoData = getLatestCantoForTopic(topicSessions, topic, progress);
    const lastCanto = {
      hasCanto: latestCantoData.hasCanto,
      formatted: latestCantoData.hasCanto ? latestCantoData.formatted : "Sin cante",
      mins: latestCantoData.mins,
      secs: latestCantoData.secs,
      grade: latestCantoData.grade,
      date: latestCantoData.date,
      count: latestCantoData.count,
    };

    // SRS computation
    const srsState = {
      easinessFactor: progress?.srsEasinessFactor || 2.5,
      interval: progress?.srsInterval || 0,
      repetitions: progress?.srsRepetitions || 0,
    };

    let nextDate: string | null = null;
    let isOverdue = false;
    let isDueToday = false;
    let daysDiff: number | null = null;

    if (progress?.firstStudyDate) {
      nextDate =
        progress?.nextReviewDate ||
        calculateNextSRSState(
          progress?.difficulty || 5,
          srsState,
          progress?.lastReviewDate || progress?.firstStudyDate
        ).nextReviewDate;

      if (nextDate) {
        const parsed = safeParseDate(nextDate);
        isOverdue = parsed < todayDate;
        isDueToday = parsed.toDateString() === todayDate.toDateString() || isOverdue;
        daysDiff = Math.ceil((parsed.getTime() - nowTime) / (1000 * 3600 * 24));
      }
    }

    // Review prediction (cached)
    const reviewEstimate = calculateEstimatedReviewTime(
      topic,
      progress,
      topicSessions,
      topics,
      userProgress,
      recentSessions
    );

    // Ebbinghaus memory retention calculation
    const ebbAnalysis = calculateEbbinghausCurve(
      topicId,
      progress?.pages || topic.pages || 15,
      progress?.difficulty || topic.difficulty || 5,
      progress,
      topicSessions
    );

    index.set(topicId, {
      sessions: topicSessions,
      lastCanto,
      cycle,
      srs: {
        isDueToday,
        isOverdue,
        nextDate,
        daysDiff,
      },
      reviewEstimate,
      ebbinghaus: {
        retention: Math.round(ebbAnalysis.currentRetention),
        status: ebbAnalysis.status,
        statusTitle: ebbAnalysis.statusTitle,
        isDue: ebbAnalysis.isBelowCritical80 || isDueToday || isOverdue,
      },
    });
  }

  return index;
}
