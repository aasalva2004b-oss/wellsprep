/**
 * Entirely fictitious, deterministic records for offline tests and local emulators.
 * These are not exports or anonymised copies of any learner's production data.
 * Passwords below are public test constants and must only be used in Auth Emulator.
 */
import type { Session, Topic } from '../../src/types';
import type { TopicProgressData } from '../../src/lib/prediction';
import type { PlsemaPhase, WellsprepPlsemaBreakdown } from '../../src/types/aerofocusWebhook';

export const syntheticUser = {
  uid: 'synthetic-student',
  email: 'synthetic-student@example.test',
  password: 'synthetic-only-password',
};

export const otherSyntheticUser = {
  uid: 'synthetic-other',
  email: 'synthetic-other@example.test',
  password: 'synthetic-other-password',
};

export const syntheticPhases: PlsemaPhase[] = [
  'prelectura', 'lectura', 'subrayado', 'esquema', 'memorizar', 'cantar',
];

export interface SyntheticPageBreakdown {
  pageNumber: number;
  durationMinutes: number;
  effectiveMinutes: number;
  plsema: WellsprepPlsemaBreakdown;
}

export interface SyntheticSession extends Session {
  isSynthetic: true;
  userId: string;
  subjectId: string;
  startPage: number;
  endPage: number;
  pagesStudied: number;
  pagesNumbers: number[];
  isTopicCompleted: boolean;
  plsema: WellsprepPlsemaBreakdown;
  pageBreakdown: SyntheticPageBreakdown[];
}

export interface SyntheticProgress extends TopicProgressData {
  isSynthetic: true;
  userId: string;
  topicId: string;
  completedPages: number[];
  lastPageStudied: number;
  totalPagesStudied: number;
  coveragePct: number;
}

const baseTopic = {
  tiempoEstudioHoras: 0,
  fechaPrimerEstudio: '',
  fechasRepasos: [],
  mejorTiempoCantoMinutos: 0,
  mejorTiempoCantoSegundos: 0,
  notas: 'FICTICIO: datos de prueba generados a mano, sin conexión con producción.',
};

export const syntheticTopics: Topic[] = [
  {
    ...baseTopic,
    id: 'synthetic-constitucional-901',
    subjectId: 'constitucional',
    number: 901,
    title: '[FICTICIO] Instituciones de la isla imaginaria',
    pages: 12,
    numeroPalabras: 3600,
    difficulty: 6,
    epigrafes: 4,
  },
  {
    ...baseTopic,
    id: 'synthetic-civil-902',
    subjectId: 'civil',
    number: 902,
    title: '[FICTICIO] Contratos de ejemplo en una ciudad inventada',
    pages: 8,
    numeroPalabras: 2400,
    difficulty: 4,
    epigrafes: 3,
  },
];

/** Build the public PLSEMA wire shape without timestamps, undefined or SDK objects. */
function plsema(minutes: Record<PlsemaPhase, number>): WellsprepPlsemaBreakdown {
  const totalMinutes = syntheticPhases.reduce((sum, phase) => sum + minutes[phase], 0);
  const seconds = Object.fromEntries(syntheticPhases.map(phase => [phase, minutes[phase] * 60])) as Record<PlsemaPhase, number>;
  const hours = Object.fromEntries(syntheticPhases.map(phase => [phase, minutes[phase] / 60])) as Record<PlsemaPhase, number>;
  const percentages = Object.fromEntries(syntheticPhases.map(phase => [phase, totalMinutes ? minutes[phase] / totalMinutes * 100 : 0])) as Record<PlsemaPhase, number>;
  const activeRecallMinutes = minutes.memorizar + minutes.cantar;
  const passiveMinutes = minutes.prelectura + minutes.lectura + minutes.subrayado;
  const dominantPhase = syntheticPhases.reduce((best, phase) => minutes[phase] > minutes[best] ? phase : best, syntheticPhases[0]);
  return {
    minutes, seconds, hours, percentages, totalMinutes, totalSeconds: totalMinutes * 60,
    dominantPhase, activeRecallMinutes, passiveMinutes, schematicMinutes: minutes.esquema,
    activeRecallRatio: totalMinutes ? activeRecallMinutes / totalMinutes * 100 : 0,
    passiveRatio: totalMinutes ? passiveMinutes / totalMinutes * 100 : 0,
    minutosPrelectura: minutes.prelectura,
    minutosLectura: minutes.lectura,
    minutosSubrayado: minutes.subrayado,
    minutosEsquema: minutes.esquema,
    minutosMemorizar: minutes.memorizar,
    minutosCantar: minutes.cantar,
    segundosPrelectura: seconds.prelectura,
    segundosLectura: seconds.lectura,
    segundosSubrayado: seconds.subrayado,
    segundosEsquema: seconds.esquema,
    segundosMemorizar: seconds.memorizar,
    segundosCantar: seconds.cantar,
  };
}

type PhaseMinutes = [number, number, number, number, number, number];

function session(
  id: string,
  topic: Topic,
  date: string,
  type: Session['type'],
  startPage: number,
  endPage: number,
  phaseMinutes: PhaseMinutes,
  extras: Partial<Pick<Session, 'cantoType' | 'cantoGrade' | 'cantoSeconds' | 'completesVuelta'>> = {},
): SyntheticSession {
  const minutes = Object.fromEntries(syntheticPhases.map((phase, index) => [phase, phaseMinutes[index]])) as Record<PlsemaPhase, number>;
  const phases = plsema(minutes);
  const pagesNumbers = Array.from({ length: endPage - startPage + 1 }, (_, index) => startPage + index);
  const pageBreakdown = pagesNumbers.map(pageNumber => {
    const pagePhases = plsema(Object.fromEntries(syntheticPhases.map(phase => [phase, minutes[phase] / pagesNumbers.length])) as Record<PlsemaPhase, number>);
    return {
      pageNumber,
      durationMinutes: pagePhases.totalMinutes,
      effectiveMinutes: pagePhases.totalMinutes,
      plsema: pagePhases,
    };
  });
  return {
    id: `synthetic-${id}`,
    isSynthetic: true,
    topicId: topic.id,
    userId: syntheticUser.uid,
    subjectId: topic.subjectId,
    topicTitle: topic.title,
    date,
    type,
    modality: type,
    durationMinutes: phases.totalMinutes,
    difficulty: topic.difficulty,
    startPage,
    endPage,
    pagesStudied: pagesNumbers.length,
    pagesNumbers,
    isTopicCompleted: startPage === 1 && endPage === topic.pages,
    plsema: phases,
    pageBreakdown,
    source: 'synthetic-fixture',
    notes: 'FICTICIO: sesión inventada para pruebas locales.',
    createdAt: `${date}T10:00:00.000Z`,
    ...extras,
  };
}

const [partialTopic, completeTopic] = syntheticTopics;

export const syntheticSessions: SyntheticSession[] = [
  session('study-a-1', partialTopic, '2026-10-01', 'primer_estudio', 1, 3, [3, 6, 3, 3, 15, 0]),
  session('study-a-2', partialTopic, '2026-10-02', 'primer_estudio', 4, 6, [3, 9, 3, 3, 18, 0]),
  session('refresh-a', partialTopic, '2026-10-03', 'refresco', 1, 6, [0, 6, 0, 0, 12, 0]),
  session('review-a-partial', partialTopic, '2026-10-05', 'repaso', 1, 3, [0, 3, 0, 3, 12, 0]),
  session('study-b', completeTopic, '2026-10-01', 'primer_estudio', 1, 8, [8, 16, 8, 8, 24, 0]),
  session('refresh-b-1', completeTopic, '2026-10-02', 'refresco', 1, 8, [0, 8, 0, 0, 16, 0]),
  session('refresh-b-2', completeTopic, '2026-10-03', 'refresco', 1, 8, [0, 4, 0, 0, 12, 0]),
  session('refresh-b-3', completeTopic, '2026-10-04', 'refresco', 1, 8, [0, 4, 0, 0, 8, 0]),
  session('review-b-partial', completeTopic, '2026-10-06', 'repaso', 1, 4, [0, 4, 0, 0, 8, 0]),
  session('review-b-full', completeTopic, '2026-10-08', 'repaso', 1, 8, [0, 8, 0, 0, 16, 0], { completesVuelta: true }),
  session('canto-solo', completeTopic, '2026-10-09', 'canto', 1, 8, [0, 0, 0, 0, 0, 12.5], { cantoType: 'solo', cantoSeconds: 30 }),
  session('canto-preparador', completeTopic, '2026-10-12', 'canto', 1, 8, [0, 0, 0, 0, 0, 11.75], { cantoType: 'preparador', cantoSeconds: 45, cantoGrade: 7.5 }),
];

export const syntheticProgress: Record<string, SyntheticProgress> = Object.fromEntries(syntheticTopics.map(topic => {
  const history = syntheticSessions.filter(item => item.topicId === topic.id);
  const completedPages = [...new Set(history.filter(item => item.type === 'primer_estudio').flatMap(item => item.pagesNumbers))].sort((a, b) => a - b);
  const bestCanto = history.filter(item => item.type === 'canto').sort((a, b) => a.durationMinutes - b.durationMinutes)[0];
  return [topic.id, {
    isSynthetic: true,
    userId: syntheticUser.uid,
    topicId: topic.id,
    pages: topic.pages,
    numeroPalabras: topic.numeroPalabras!,
    difficulty: topic.difficulty,
    subjectId: topic.subjectId,
    customTitle: topic.title,
    isCustom: true,
    studyTimeHours: history.reduce((sum, item) => sum + item.durationMinutes, 0) / 60,
    firstStudyDate: history[0].date,
    lastReviewDate: history.at(-1)!.date,
    vueltas: history.filter(item => item.completesVuelta).length,
    reviewCount: history.filter(item => item.type === 'repaso' || item.type === 'refresco').length,
    mejorTiempoCantoMinutos: bestCanto ? Math.floor(bestCanto.durationMinutes) : 0,
    mejorTiempoCantoSegundos: bestCanto?.cantoSeconds ?? 0,
    completedPages,
    lastPageStudied: Math.max(...completedPages),
    totalPagesStudied: completedPages.length,
    coveragePct: completedPages.length / topic.pages * 100,
    notas: 'FICTICIO: cobertura calculada solo a partir de los primeros estudios inventados.',
  }];
}));

export const syntheticScenario = {
  user: syntheticUser,
  otherUser: otherSyntheticUser,
  topics: syntheticTopics,
  sessions: syntheticSessions,
  progress: syntheticProgress,
};
