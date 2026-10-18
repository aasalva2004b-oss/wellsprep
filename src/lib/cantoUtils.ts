import { safeParseDate } from "./utils";
import { Topic } from "../types";

export interface NormalizedCantoDuration {
  mins: number;
  secs: number;
  totalSecs: number;
  formatted: string;
}

/**
 * Accurately determines if a session record represents a cante (oral examination),
 * checking all known legacy and current formats (types, grades, notes, simulator).
 */
export function isCantoSession(s: any): boolean {
  if (!s) return false;
  const t = String(s.type || s.modality || "").toLowerCase().trim();
  if (t === "canto" || t === "cante" || t === "simulacro" || t === "cantar" || t === "preparador") {
    return true;
  }
  if (typeof s.cantoGrade === "number" || typeof s.grade === "number") {
    return true;
  }
  if (typeof s.cantoSeconds === "number" && s.cantoSeconds > 0) {
    return true;
  }
  if (s.cantoType === "preparador" || s.cantoType === "solo") {
    return true;
  }
  // Check notes for cante mentions with reasonable short duration (1-25 min)
  const notes = String(s.notes || s.mistakes || "").toLowerCase();
  const dur = Number(s.durationMinutes || s.duration || 0);
  if ((notes.includes("cante") || notes.includes("preparador") || notes.includes("simulacro")) && dur > 0 && dur <= 30) {
    return true;
  }
  return false;
}

/**
 * Extracts and normalizes the precise minutes, seconds, and total seconds of a cante,
 * immune to duration-in-seconds vs duration-in-minutes confusion.
 */
export function getCantoDuration(s: any): NormalizedCantoDuration {
  if (!s) return { mins: 0, secs: 0, totalSecs: 0, formatted: "0m 00s" };

  let rawMinutes = 0;
  let rawSeconds = 0;

  // 1. Check explicit cantoSeconds
  if (typeof s.cantoSeconds === "number" && !isNaN(s.cantoSeconds)) {
    rawSeconds = s.cantoSeconds;
  } else if (typeof s.seconds === "number" && !isNaN(s.seconds)) {
    rawSeconds = s.seconds;
  }

  // 2. Check durationMinutes vs duration
  const dm = typeof s.durationMinutes === "number" && !isNaN(s.durationMinutes) ? s.durationMinutes : null;
  const d = typeof s.duration === "number" && !isNaN(s.duration) ? s.duration : null;

  if (dm !== null) {
    if (dm > 0 && dm < 60) {
      // Normal minutes
      rawMinutes = Math.floor(dm);
      if (rawSeconds === 0 && dm % 1 !== 0) {
        rawSeconds = Math.round((dm % 1) * 60);
      }
    } else if (dm >= 60 && dm <= 1800 && rawSeconds === 0) {
      // Stored in raw seconds by accident (e.g. 780 = 13 min)
      rawMinutes = Math.floor(dm / 60);
      rawSeconds = Math.round(dm % 60);
    } else {
      rawMinutes = Math.floor(dm);
    }
  } else if (d !== null) {
    if (d > 0 && d < 60) {
      rawMinutes = Math.floor(d);
      if (rawSeconds === 0 && d % 1 !== 0) {
        rawSeconds = Math.round((d % 1) * 60);
      }
    } else if (d >= 60 && d <= 1800 && rawSeconds === 0) {
      // e.g. 780s = 13m 00s
      rawMinutes = Math.floor(d / 60);
      rawSeconds = Math.round(d % 60);
    } else {
      rawMinutes = Math.floor(d);
    }
  }

  // 3. Regex recovery from notes if minutes are 0
  if (rawMinutes === 0 && rawSeconds === 0 && s.notes) {
    const text = String(s.notes);
    const mMatch = text.match(/(\d+)\s*m(?:in)?(?:\s*(\d+)\s*s)?/i);
    if (mMatch) {
      rawMinutes = parseInt(mMatch[1], 10);
      if (mMatch[2]) rawSeconds = parseInt(mMatch[2], 10);
    } else {
      const colonMatch = text.match(/(\d{1,2}):(\d{2})/);
      if (colonMatch) {
        rawMinutes = parseInt(colonMatch[1], 10);
        rawSeconds = parseInt(colonMatch[2], 10);
      }
    }
  }

  // Normalize seconds overflow
  if (rawSeconds >= 60) {
    rawMinutes += Math.floor(rawSeconds / 60);
    rawSeconds = rawSeconds % 60;
  }

  const totalSecs = rawMinutes * 60 + rawSeconds;
  const formatted = `${rawMinutes}m ${rawSeconds.toString().padStart(2, "0")}s`;

  return {
    mins: rawMinutes,
    secs: rawSeconds,
    totalSecs,
    formatted,
  };
}

/**
 * Sorts sessions chronologically DESCENDING (most recent first at index 0).
 */
export function compareSessionsDesc(a: any, b: any): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;

  // 1. Date string comparison
  const dateA = a.date || "";
  const dateB = b.date || "";
  const dateCmp = dateB.localeCompare(dateA);
  if (dateCmp !== 0) return dateCmp;

  // 2. CreatedAt timestamp comparison
  const timeA = a.createdAt?.toMillis
    ? a.createdAt.toMillis()
    : a.createdAt?.seconds
    ? a.createdAt.seconds * 1000
    : typeof a.createdAt === "number"
    ? a.createdAt
    : safeParseDate(a.createdAt || a.date).getTime();

  const timeB = b.createdAt?.toMillis
    ? b.createdAt.toMillis()
    : b.createdAt?.seconds
    ? b.createdAt.seconds * 1000
    : typeof b.createdAt === "number"
    ? b.createdAt
    : safeParseDate(b.createdAt || b.date).getTime();

  return timeB - timeA;
}

/**
 * Sorts sessions chronologically ASCENDING (oldest first at index 0).
 */
export function compareSessionsAsc(a: any, b: any): number {
  return compareSessionsDesc(b, a);
}

/**
 * Universal topic session matcher.
 * Matches whether a session `s` corresponds to the given `topic` (e.g. Tema 17 Constitucional),
 * handling variations such as:
 * - "constitucional-17"
 * - "17" or 17
 * - "tema-17" or "Tema 17"
 * - legacy "mercantil-17" if it was a mismapped Constitucional topic
 * - topicNumber: 17
 */
import { normalizeCategoryToSubjectId, parseAeroFocusTopicIdPrefix } from "./topicResolver";

/**
 * Universal topic session matcher.
 * Matches whether a session `s` corresponds to the given `topic` (e.g. Tema 5 Constitucional),
 * handling variations such as:
 * - "constitucional-5", "constitucional_5", "const-5", "const_5"
 * - "5" or 5
 * - "tema-5" or "Tema 5" or "t5" or "t-5"
 * - legacy "mercantil-5" if it was a mismapped Constitucional topic
 * - topicNumber: 5
 * - subject name variations ("CONST", "Constitución", "Derecho Constitucional")
 */
export function sessionMatchesTopic(
  s: any,
  topic: { id: string; number: number; subjectId?: string; title?: string }
): boolean {
  if (!s || !topic) return false;

  const sTopicId = String(s.topicId || "").trim().toLowerCase();
  const targetId = String(topic.id || "").trim().toLowerCase();
  const topicNum = Number(topic.number);
  const topicNumStr = String(topicNum);

  // 1. Exact topic ID match
  if (sTopicId === targetId) return true;

  // Normalized subjects
  const targetSubj = normalizeCategoryToSubjectId(topic.subjectId) || String(topic.subjectId || "").toLowerCase();
  const sessionSubj = s.subjectId ? (normalizeCategoryToSubjectId(s.subjectId) || String(s.subjectId).toLowerCase()) : null;

  // Subject compatibility helper
  const subjectCompatible = !sessionSubj || sessionSubj === targetSubj || 
    (targetSubj === 'constitucional' && (sessionSubj === 'general' || sessionSubj === 'const'));

  // 2. Direct numeric ID (e.g. s.topicId === "5" or 5)
  if (sTopicId === topicNumStr) {
    if (subjectCompatible) return true;
  }

  // 3. Match by topicNumber property
  if (s.topicNumber !== undefined && Number(s.topicNumber) === topicNum) {
    if (subjectCompatible) return true;
  }

  // 4. Try parsing prefixes like "CONST_T5", "CONST-5", "CIV_T12"
  const parsedPrefix = parseAeroFocusTopicIdPrefix(sTopicId);
  if (parsedPrefix && parsedPrefix.number === topicNum) {
    if (parsedPrefix.subjectId === targetSubj || (!parsedPrefix.subjectId && subjectCompatible)) {
      return true;
    }
  }

  // 5. Match prefix and variations (e.g. "tema-5", "tema 5", "t5", "tema_5", "const-5", "const_5")
  if (
    sTopicId === `tema-${topicNumStr}` ||
    sTopicId === `tema ${topicNumStr}` ||
    sTopicId === `tema_${topicNumStr}` ||
    sTopicId === `t-${topicNumStr}` ||
    sTopicId === `t${topicNumStr}` ||
    sTopicId === `const-${topicNumStr}` ||
    sTopicId === `const_${topicNumStr}` ||
    sTopicId === `constitucional-${topicNumStr}` ||
    sTopicId === `constitucional_${topicNumStr}`
  ) {
    if (subjectCompatible) return true;
  }

  // 6. Match ending with "-5" or "_5"
  if (sTopicId.endsWith(`-${topicNumStr}`) || sTopicId.endsWith(`_${topicNumStr}`)) {
    const prefix = sTopicId.slice(0, -(topicNumStr.length + 1));
    const prefixSubj = normalizeCategoryToSubjectId(prefix);
    if (!prefixSubj || prefixSubj === targetSubj) {
      if (subjectCompatible) return true;
    }
    // If it was stored under mercantil-5 but active subject is constitucional
    if (targetSubj === "constitucional" && (sTopicId.startsWith("mercantil") || sTopicId.startsWith("constitucional"))) {
      return true;
    }
  }

  // 7. Check notes or title if they explicitly mention "Tema 5"
  const textCorpus = `${s.topicTitle || ""} ${s.notes || ""} ${s.mistakes || ""}`.toLowerCase();
  if (
    textCorpus.includes(`tema ${topicNumStr}`) ||
    textCorpus.includes(`tema: ${topicNumStr}`) ||
    textCorpus.includes(`tema ${topicNumStr}:`) ||
    textCorpus.includes(`tema ${topicNumStr} `)
  ) {
    if (subjectCompatible) return true;
  }

  // 8. Match by topic title key phrase
  if (topic.title && s.topicTitle) {
    const sTitle = String(s.topicTitle).toLowerCase();
    const tTitle = String(topic.title).toLowerCase();
    if (sTitle.length > 8 && tTitle.includes(sTitle.slice(0, 20))) {
      if (subjectCompatible) return true;
    }
  }

  return false;
}



/**
 * Finds the latest cante for a given topic across all sessions.
 * Guarantees that the returned cante is the TRUE most recent one,
 * never confusing it with oldest sessions or the best-time record.
 */
export function getLatestCantoForTopic(
  allSessions: any[],
  topic: { id: string; number: number; subjectId?: string },
  progress?: any
) {
  // Filter sessions matching this topic
  const topicSessions = (allSessions || []).filter((s) => sessionMatchesTopic(s, topic));

  // Filter cantes
  const cantos = topicSessions.filter(isCantoSession);

  if (cantos.length > 0) {
    // Sort descending by date & time (newest is index 0)
    const sortedCantos = cantos.slice().sort(compareSessionsDesc);
    const latest = sortedCantos[0];
    const duration = getCantoDuration(latest);

    const grade =
      typeof latest.cantoGrade === "number"
        ? latest.cantoGrade
        : typeof latest.grade === "number"
        ? latest.grade
        : null;

    return {
      hasCanto: true,
      mins: duration.mins,
      secs: duration.secs,
      totalSecs: duration.totalSecs,
      formatted: duration.formatted,
      grade,
      date: latest.date || null,
      notes: latest.notes || "",
      count: cantos.length,
      allCantos: sortedCantos,
      isFallbackBest: false,
    };
  }

  // Fallback: If no session exists but progress has recorded cante
  if (progress?.ultimoCantoMinutos || progress?.ultimoCantoSegundos) {
    const mins = Number(progress.ultimoCantoMinutos || 0);
    const secs = Number(progress.ultimoCantoSegundos || 0);
    const totalSecs = mins * 60 + secs;
    return {
      hasCanto: totalSecs > 0,
      mins,
      secs,
      totalSecs,
      formatted: `${mins}m ${secs.toString().padStart(2, "0")}s`,
      grade: typeof progress.ultimoCantoNota === "number" ? progress.ultimoCantoNota : null,
      date: progress.ultimoCantoFecha || null,
      notes: "",
      count: Number(progress.cantosCount || 1),
      allCantos: [],
      isFallbackBest: false,
    };
  }

  // Final check: if only mejorTiempo exists, we report it but clearly mark it
  if (progress?.mejorTiempoCantoMinutos || progress?.mejorTiempoCantoSegundos) {
    const mins = Number(progress.mejorTiempoCantoMinutos || 0);
    const secs = Number(progress.mejorTiempoCantoSegundos || 0);
    const totalSecs = mins * 60 + secs;
    return {
      hasCanto: totalSecs > 0,
      mins,
      secs,
      totalSecs,
      formatted: `${mins}m ${secs.toString().padStart(2, "0")}s`,
      grade: null,
      date: null,
      notes: "",
      count: 1,
      allCantos: [],
      isFallbackBest: true,
    };
  }

  return {
    hasCanto: false,
    mins: 0,
    secs: 0,
    totalSecs: 0,
    formatted: "Sin cante",
    grade: null,
    date: null,
    notes: "",
    count: 0,
    allCantos: [],
    isFallbackBest: false,
  };
}
