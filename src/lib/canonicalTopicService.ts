import { Topic, Session } from "../types";
import { TopicProgressData } from "./prediction";
import { sessionMatchesTopic, isCantoSession, getCantoDuration } from "./cantoUtils";

export interface CanonicalTopic {
  id: string;
  subjectId: string;
  number: number;
  title: string;
  fullTitle?: string;
  
  // Volumetría unificada (Fuente Única de Verdad)
  pages: number;                 // Páginas reales exactas (ej: 6.5). 0 si no se ha medido aún.
  hasExplicitPages: boolean;     // True si el opositor o el temario indicaron páginas reales > 0
  numeroPalabras?: number;       // Número de palabras exacto (ej: 3516). undefined si no se ha medido.
  hasExplicitWords: boolean;     // True si se introdujo número de palabras real > 0
  epigrafes?: number;            // Número de epígrafes del tema
  difficulty: number;            // 1 a 10 (por defecto 5 si no se ha evaluado)
  
  // Estado de preparación y progreso real
  vueltas: number;               // Vueltas completadas al tema
  reviewCount: number;           // Número total de repasos/sesiones registradas
  lastReviewDate?: string;       // Fecha del último repaso (YYYY-MM-DD)
  firstStudyDate?: string;       // Fecha del primer estudio (YYYY-MM-DD)
  notas?: string;                // Notas del tema
  customTitle?: string;          // Título personalizado por el usuario
  
  // Historial de Cante consolidado
  totalCantoCount: number;       // Número de exposiciones orales
  lastCantoGrade?: number;       // Calificación del último cante (1.0 - 10.0)
  lastCantoSeconds?: number;     // Duración del último cante en segundos
  lastCantoDate?: string;        // Fecha del último cante
  mejorTiempoCantoSegundos?: number;

  // Sesiones históricas agregadas
  totalStudyMinutes: number;     // Minutos totales dedicados al tema
  hasStarted: boolean;           // Ha comenzado al menos con primer estudio
}

/**
 * Resuelve la ficha canónica de un tema integrando la definición base,
 * los overrides del usuario en userProgress (Firestore) y las sesiones reales.
 * Esta función es la ÚNICA FUENTE DE VERDAD para volumetría y metadata del tema.
 */
export function getCanonicalTopic(
  topicIdOrTopic: string | Topic | CanonicalTopic,
  allTopics: (Topic | CanonicalTopic)[],
  userProgress: Record<string, TopicProgressData> = {},
  sessions: Session[] = []
): CanonicalTopic {
  let baseTopic: Topic | undefined;
  let topicId: string;

  if (typeof topicIdOrTopic === "string") {
    topicId = topicIdOrTopic;
    baseTopic = allTopics.find((t) => t.id === topicId) as Topic | undefined;
  } else {
    baseTopic = topicIdOrTopic as Topic;
    topicId = baseTopic.id;
  }

  const prog = userProgress[topicId];

  // 1. Resuelve páginas: prioridad userProgress -> baseTopic -> 0 (sin inventar números)
  let pages = 0;
  let hasExplicitPages = false;

  if (prog?.pages !== undefined && prog.pages !== null && Number(prog.pages) > 0) {
    pages = Number(prog.pages);
    hasExplicitPages = true;
  } else if (baseTopic?.pages !== undefined && baseTopic.pages !== null && Number(baseTopic.pages) > 0) {
    pages = Number(baseTopic.pages);
    hasExplicitPages = true;
  }

  // 2. Resuelve palabras
  let numeroPalabras: number | undefined = undefined;
  let hasExplicitWords = false;

  if (prog?.numeroPalabras !== undefined && prog.numeroPalabras !== null && Number(prog.numeroPalabras) > 0) {
    numeroPalabras = Number(prog.numeroPalabras);
    hasExplicitWords = true;
  } else if (baseTopic?.numeroPalabras !== undefined && baseTopic.numeroPalabras !== null && Number(baseTopic.numeroPalabras) > 0) {
    numeroPalabras = Number(baseTopic.numeroPalabras);
    hasExplicitWords = true;
  }

  // 3. Resuelve dificultad (1-10)
  let difficulty = 5;
  if (prog?.difficulty !== undefined && prog.difficulty !== null && Number(prog.difficulty) > 0) {
    difficulty = Math.max(1, Math.min(10, Number(prog.difficulty)));
  } else if (baseTopic?.difficulty !== undefined && baseTopic.difficulty !== null && Number(baseTopic.difficulty) > 0) {
    difficulty = Math.max(1, Math.min(10, Number(baseTopic.difficulty)));
  }

  // 4. Resuelve epígrafes
  const epigrafes = (prog as any)?.epigrafes || baseTopic?.epigrafes;

  // 5. Título y materia
  const title = prog?.customTitle || baseTopic?.title || topicId;
  const fullTitle = baseTopic?.fullTitle || title;
  const subjectId = prog?.subjectId || baseTopic?.subjectId || "constitucional";
  const number = baseTopic?.number || parseInt(topicId.replace(/[^\d]/g, ""), 10) || 1;

  // 6. Análisis granular de sesiones reales de este tema
  const topicSessions = sessions.filter((s) => {
    if (baseTopic) return sessionMatchesTopic(s, baseTopic);
    return s.topicId === topicId;
  });

  let totalStudyMinutes = 0;
  let totalCantoCount = 0;
  let lastCantoGrade: number | undefined = undefined;
  let lastCantoSeconds: number | undefined = undefined;
  let lastCantoDate: string | undefined = undefined;
  let vueltasFromSessions = 0;
  let lastReviewDate = prog?.lastReviewDate;
  let firstStudyDate = prog?.firstStudyDate || (baseTopic as any)?.fechaPrimerEstudio;

  // Ordenar sesiones por fecha ascendente para rastrear progreso cronológico
  const sortedSessions = [...topicSessions].sort((a, b) => {
    return (a.date || "").localeCompare(b.date || "");
  });

  sortedSessions.forEach((s) => {
    const mins = Number(s.durationMinutes || (s as any).duration || 0);
    totalStudyMinutes += mins;

    if (s.type === "primer_estudio" || s.modality === "primer_estudio" || (s.type as string) === "estudio_inicial") {
      if (!firstStudyDate || s.date < firstStudyDate) {
        firstStudyDate = s.date;
      }
    }

    if (s.completesVuelta) {
      vueltasFromSessions++;
    }

    if (isCantoSession(s)) {
      totalCantoCount++;
      const dur = getCantoDuration(s);
      lastCantoSeconds = dur.totalSecs;
      lastCantoDate = s.date;
      const g = typeof s.cantoGrade === "number" ? s.cantoGrade : typeof (s as any).grade === "number" ? (s as any).grade : undefined;
      if (g !== undefined) {
        lastCantoGrade = g;
      }
    }

    if (s.date && (!lastReviewDate || s.date > lastReviewDate)) {
      lastReviewDate = s.date;
    }
  });

  const vueltas = Math.max(prog?.vueltas || 0, vueltasFromSessions);
  const reviewCount = Math.max(prog?.reviewCount || 0, topicSessions.length);
  const hasStarted = Boolean(firstStudyDate || totalStudyMinutes > 0 || vueltas > 0);

  return {
    id: topicId,
    subjectId,
    number,
    title,
    fullTitle,
    pages,
    hasExplicitPages,
    numeroPalabras,
    hasExplicitWords,
    epigrafes,
    difficulty,
    vueltas,
    reviewCount,
    lastReviewDate,
    firstStudyDate,
    notas: prog?.notas || (baseTopic as any)?.notas || "",
    customTitle: prog?.customTitle,
    totalCantoCount,
    lastCantoGrade,
    lastCantoSeconds,
    lastCantoDate,
    mejorTiempoCantoSegundos: (prog?.mejorTiempoCantoMinutos || 0) * 60 + (prog?.mejorTiempoCantoSegundos || 0) || lastCantoSeconds,
    totalStudyMinutes,
    hasStarted
  };
}

/**
 * Crea un mapa O(1) de todos los temas canónicos indexados por ID.
 */
export function buildCanonicalTopicMap(
  allTopics: Topic[],
  userProgress: Record<string, TopicProgressData> = {},
  sessions: Session[] = []
): Map<string, CanonicalTopic> {
  const map = new Map<string, CanonicalTopic>();
  allTopics.forEach((t) => {
    map.set(t.id, getCanonicalTopic(t, allTopics, userProgress, sessions));
  });

  // Incluir posibles temas personalizados creados en userProgress que no estén en allTopics
  Object.keys(userProgress).forEach((id) => {
    if (!map.has(id)) {
      map.set(id, getCanonicalTopic(id, allTopics, userProgress, sessions));
    }
  });

  return map;
}
