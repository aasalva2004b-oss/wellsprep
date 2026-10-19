import { useMemo } from "react";
import { isCantoSession, getCantoDuration } from "../lib/cantoUtils";

export interface CantoItem {
  id: string;
  topicId: string;
  topicNumber?: number;
  topicTitle?: string;
  date: string;
  durationMinutes: number;
  durationSeconds: number;
  totalMinutes: number;
  grade: number | null;
  difficulty?: number;
  notes?: string;
  mistakes?: string;
  type?: string;
  cantoType?: "solo" | "preparador";
  createdMs?: number;
}

export interface CantoTelemetryStats {
  totalCantos: number;
  avgGrade: number | null;
  avgDurationMinutes: number;
  bestGrade: number | null;
  bestDurationMinutes: number | null;
  preparadorCount: number;
  soloCount: number;
  gradeTrend: "improving" | "stable" | "declining" | "insufficient_data";
  recentCantos: CantoItem[];
}

export function useCantoTelemetry(sessions: any[]): CantoTelemetryStats {
  return useMemo(() => {
    const raw = (sessions || []).filter(isCantoSession);
    const cantos: CantoItem[] = raw.map((s) => {
      const dur = getCantoDuration(s);
      const grade =
        typeof s.cantoGrade === "number"
          ? s.cantoGrade
          : typeof s.grade === "number"
          ? s.grade
          : null;
      return {
        id: s.id,
        topicId: s.topicId,
        topicNumber: s.topicNumber ? Number(s.topicNumber) : undefined,
        topicTitle: s.topicTitle,
        date: s.date || "",
        durationMinutes: dur.mins,
        durationSeconds: dur.secs,
        totalMinutes: Math.round((dur.totalSecs / 60) * 10) / 10,
        grade,
        difficulty: s.difficulty,
        notes: s.notes,
        mistakes: s.mistakes,
        type: s.type || "canto",
        cantoType: s.cantoType || (s.type === "simulacro" ? "preparador" : "solo"),
        createdMs: s.createdAt?.toMillis
          ? s.createdAt.toMillis()
          : typeof s.createdAt === "number"
          ? s.createdAt
          : new Date(s.createdAt || s.date || 0).getTime(),
      };
    });

    // Chronological sort
    cantos.sort((a, b) => (b.createdMs || 0) - (a.createdMs || 0));

    const totalCantos = cantos.length;
    if (totalCantos === 0) {
      return {
        totalCantos: 0,
        avgGrade: null,
        avgDurationMinutes: 0,
        bestGrade: null,
        bestDurationMinutes: null,
        preparadorCount: 0,
        soloCount: 0,
        gradeTrend: "insufficient_data",
        recentCantos: [],
      };
    }

    const rated = cantos.filter((c) => c.grade !== null);
    const avgGrade =
      rated.length > 0
        ? Math.round((rated.reduce((acc, c) => acc + (c.grade || 0), 0) / rated.length) * 10) / 10
        : null;

    const bestGrade =
      rated.length > 0 ? Math.max(...rated.map((c) => c.grade || 0)) : null;

    const totalDuration = cantos.reduce((acc, c) => acc + c.totalMinutes, 0);
    const avgDurationMinutes = Math.round((totalDuration / totalCantos) * 10) / 10;

    const bestDurationMinutes =
      cantos.length > 0
        ? Math.min(...cantos.map((c) => (c.totalMinutes > 0 ? c.totalMinutes : 999)))
        : null;

    const preparadorCount = cantos.filter((c) => c.cantoType === "preparador").length;
    const soloCount = totalCantos - preparadorCount;

    // Determine trend from last 4 rated cantos
    let gradeTrend: "improving" | "stable" | "declining" | "insufficient_data" =
      "insufficient_data";
    if (rated.length >= 3) {
      const recent3 = rated.slice(0, 3).map((c) => c.grade!);
      const older = rated.slice(3, 6).map((c) => c.grade!);
      if (older.length > 0) {
        const recentAvg = recent3.reduce((a, b) => a + b, 0) / recent3.length;
        const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
        if (recentAvg - olderAvg >= 0.5) gradeTrend = "improving";
        else if (olderAvg - recentAvg >= 0.5) gradeTrend = "declining";
        else gradeTrend = "stable";
      }
    }

    return {
      totalCantos,
      avgGrade,
      avgDurationMinutes,
      bestGrade,
      bestDurationMinutes: bestDurationMinutes === 999 ? null : bestDurationMinutes,
      preparadorCount,
      soloCount,
      gradeTrend,
      recentCantos: cantos.slice(0, 10),
    };
  }, [sessions]);
}
