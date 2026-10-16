import { Subject, Topic, Session } from '../types';
import { calculateNextSRSState, SRSState } from './srs';

export interface TopicProgressData {
  pages: number;
  numeroPalabras?: number;
  difficulty: number;
  studyTimeHours: number;
  firstStudyDate: string;
  mejorTiempoCantoMinutos: number;
  mejorTiempoCantoSegundos: number;
  notas?: string;
  updatedAt?: string;
  vueltas?: number;
  reviewCount?: number;
  lastReviewDate?: string;
  nextReviewDate?: string;
  difficultySum?: number;
  difficultyCount?: number;
  customTitle?: string;
  isCustom?: boolean;
  subjectId?: string;
  srsEasinessFactor?: number;
  srsInterval?: number;
  srsRepetitions?: number;
}

export interface PredictionResult {
  predictedStudyHours: number;
  predictedRefreshMinutes: number;
  predictedCantoMinutes: number;
  confidence: number;
}

// Constantes de Ciencia Cognitiva y Fisiología Humana
const WORDS_PER_PAGE = 300;
const HUMAN_MAX_READING_WPM = 250; // Palabras por minuto (límite superior de lectura comprensiva)
const HUMAN_MAX_SPEAKING_WPM = 150; // Palabras por minuto (límite superior de habla clara/cante)
const BASE_MEMORY_STRENGTH = 3.5; // Vida media inicial de la memoria en días (Curva de Ebbinghaus)

/**
 * Motor Predictivo "Big Data" y Ciencia Cognitiva (Corregido).
 */
export function predictTopic(
  topic: Topic, 
  userHistory: Record<string, TopicProgressData>, 
  subjectId: string, 
  isRepaso: boolean,
  topicSessions: any[] = [] // Historial cronológico granular del tema
): PredictionResult {
  
  // ============================================================================
  // FASE 1: NORMALIZACIÓN VOLUMÉTRICA
  // ============================================================================
  const pastData = userHistory[topic.id];
  const tPages = topic.pages > 0 ? topic.pages : (pastData?.pages && pastData.pages > 0 ? pastData.pages : 15);
  
  const totalWords = topic.numeroPalabras ? topic.numeroPalabras : (tPages * WORDS_PER_PAGE);
  const kWords = totalWords / 1000; 
  const topicDifficulty = topic.difficulty > 0 ? topic.difficulty : (pastData?.difficulty && pastData.difficulty > 0 ? pastData.difficulty : 5); 

  // ============================================================================
  // FASE 2: EXTRACCIÓN DE PATRONES GLOBALES
  // ============================================================================
  let globalStudyMinsPerKWord = 120; 
  let globalCantoMinsPerKWord = 10;  
  
  let sumStudyPace = 0, countStudy = 0;
  let sumCantoPace = 0, countCanto = 0;
  let difficultyElasticity = 0.12; 

  Object.values(userHistory).forEach(h => {
    const hWords = h.numeroPalabras ? h.numeroPalabras : ((h.pages || 15) * WORDS_PER_PAGE);
    const hKWords = hWords / 1000;
    
    if (h.studyTimeHours > 0 && hKWords > 0) {
      let decaySum = 1;
      const reps = h.srsRepetitions || h.vueltas || 0;
      for (let i = 1; i <= reps; i++) decaySum += Math.max(0.2, Math.pow(0.7, i));
      
      const initialStudyMins = (h.studyTimeHours * 60) / decaySum;
      const pace = initialStudyMins / hKWords;
      if (pace > 10 && pace < 500) { sumStudyPace += pace; countStudy++; }
    }
    
    const hCantoMins = (h.mejorTiempoCantoMinutos || 0) + (h.mejorTiempoCantoSegundos || 0) / 60;
    if (hCantoMins > 0 && hKWords > 0) {
      const cPace = hCantoMins / hKWords;
      if (cPace > 2 && cPace < 30) { sumCantoPace += cPace; countCanto++; }
    }
  });

  if (countStudy > 3) globalStudyMinsPerKWord = sumStudyPace / countStudy;
  if (countCanto > 3) globalCantoMinsPerKWord = sumCantoPace / countCanto;

  // ============================================================================
  // AISLAR EL TIEMPO REAL DE ESTUDIO DE *ESTE* TEMA
  // ============================================================================
  const sortedSessions = [...topicSessions].sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const initialStudySessions = sortedSessions.filter(s => s.type === 'estudio_inicial' || s.type === 'primer_estudio');
  
  let thisTopicInitialStudyMins = 0;
  if (initialStudySessions.length > 0) {
      thisTopicInitialStudyMins = initialStudySessions.reduce((acc, s) => acc + (s.duration || 0), 0);
  } else {
      // Si nunca ha registrado un estudio inicial, usamos el tiempo teórico 
      // (ya que usar todo el historial de studyTimeHours incluye cantos cortos y falsea la métrica)
      thisTopicInitialStudyMins = kWords * globalStudyMinsPerKWord * (1 + ((topicDifficulty - 5) * difficultyElasticity));
  }

  // ============================================================================
  // FASE 3: MOTOR DE RETENCIÓN Y "SAVINGS SCORE" (PREDICCIÓN DE REFRESCO)
  // ============================================================================
  let memoryStrength = BASE_MEMORY_STRENGTH * Math.pow(0.85, Math.max(0, topicDifficulty - 5)); 
  let currentRetention = 0;
  
  // Buscar el momento de T0 (Cuándo se estudió por primera vez)
  let lastReviewTs = Date.now();
  if (initialStudySessions.length > 0) {
      lastReviewTs = new Date(initialStudySessions[initialStudySessions.length - 1].date).getTime();
  } else if (pastData?.firstStudyDate) {
      lastReviewTs = new Date(pastData.firstStudyDate).getTime();
  }

  const reviewSessions = sortedSessions.filter(s => s.type === 'repaso' || s.type === 'refresco');

  if (reviewSessions.length > 0) {
      reviewSessions.forEach(session => {
          const sessionTs = new Date(session.date).getTime();
          const daysDelta = Math.max(0.1, (sessionTs - lastReviewTs) / (1000 * 3600 * 24));
          const retentionBefore = Math.exp(-daysDelta / memoryStrength);
          const spacingBenefit = Math.exp(1 - retentionBefore);
          const sessionDiff = session.difficulty || topicDifficulty;
          const encodingQuality = 1.2 - (sessionDiff * 0.05); 
          
          memoryStrength = memoryStrength * spacingBenefit * encodingQuality;
          lastReviewTs = sessionTs;
      });
  }
  
  // Retención final a día de hoy
  const daysSinceFinalReview = Math.max(0, (Date.now() - lastReviewTs) / (1000 * 3600 * 24));
  currentRetention = Math.exp(-daysSinceFinalReview / memoryStrength);

  // === LA CORRECCIÓN CLAVE: "SAVINGS SCORE" ===
  // Según Ebbinghaus, el "ahorro" al reaprender algo olvidado es, como mínimo, del 60%.
  // Esto significa que un refresco NUNCA puede durar más del 40% del tiempo de estudio inicial, 
  // independientemente de que la retención sea del 0% (amnesia total).
  
  const minReadingMins = totalWords / HUMAN_MAX_READING_WPM; // Límite inferior: solo leer por encima.
  const theoreticalMaxRelearnMins = thisTopicInitialStudyMins * 0.40; // Límite superior estricto: 40% del estudio inicial.
  
  // Aseguramos que el tiempo máximo sea mayor que el tiempo de lectura (safety check).
  const safeMaxRelearn = Math.max(theoreticalMaxRelearnMins, minReadingMins * 1.1);

  // Fórmula: Interpola entre el mínimo (lectura) y el máximo permitido (40% de tu estudio inicial).
  let predictedRefreshMinutes = minReadingMins + ((safeMaxRelearn - minReadingMins) * Math.pow(1 - currentRetention, 1.5));


  // ============================================================================
  // FASE 4: LEY DE POTENCIA DE LA PRÁCTICA (PREDICCIÓN DE CANTE)
  // ============================================================================
  let predictedCantoMinutes = 0;
  const cantoSessions = sortedSessions.filter(s => s.type === 'canto');

  if (cantoSessions.length > 0) {
      const learningRateB = 0.35 - (topicDifficulty * 0.015); 
      // Account for exact seconds if available
      const firstAttemptMins = cantoSessions[0].duration + ((cantoSessions[0] as any).cantoSeconds || 0) / 60;
      
      const absolutePhysiologicalMinMins = totalWords / HUMAN_MAX_SPEAKING_WPM;
      
      // Trust the user's first attempt, unless it's literally impossible (faster than max human speaking speed).
      // However, don't penalize them if they naturally speak faster than 150 WPM.
      // 150 is conservative. Let's set a hard physical limit of 200 WPM for speaking very fast.
      const hardPhysicalMin = totalWords / 200;
      
      let T1 = firstAttemptMins;
      if (T1 < hardPhysicalMin) {
          T1 = Math.max(T1, hardPhysicalMin);
      }

      const N = cantoSessions.length + 1; 
      predictedCantoMinutes = T1 * Math.pow(N, -learningRateB);
      predictedCantoMinutes = Math.max(hardPhysicalMin, predictedCantoMinutes);

  } else {
      predictedCantoMinutes = kWords * globalCantoMinsPerKWord * (1 + ((topicDifficulty - 5) * difficultyElasticity));
  }

  return {
    predictedStudyHours: Number(Math.max(0.1, thisTopicInitialStudyMins / 60).toFixed(2)),
    predictedRefreshMinutes: Number(Math.max(1, predictedRefreshMinutes).toFixed(0)),
    predictedCantoMinutes: Number(Math.max(1, predictedCantoMinutes).toFixed(1)),
    confidence: (countStudy > 5 || reviewSessions.length > 2) ? 0.98 : 0.70
  };
}

export function calculateNextReviewDate(lastReviewDate: string, vueltas: number, difficulty: number): string {
    const { nextReviewDate } = calculateNextSRSState(
      difficulty, 
      { easinessFactor: 2.5, interval: vueltas === 0 ? 0 : 1, repetitions: vueltas }, 
      lastReviewDate
    );
    return nextReviewDate;
}

export interface PlanRequirement {
  subjectId: string;
  topicCount: number;
  refreshDays?: number;
}
