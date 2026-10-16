import { useMemo } from 'react';
import { Topic, Session } from '../types';
import { TopicProgressData, predictTopic } from '../lib/prediction';

export interface WellsPredictionResult {
  wellsFactor: number;
  predictedRefreshMinutes: number;
  predictedCantoMinutes: number;
  initialStudyMinutes: number;
}

const WORDS_PER_PAGE = 300;
const HUMAN_MAX_READING_WPM = 250;

export function useWellsProgressFactor(
  topic: Topic,
  progress: TopicProgressData | undefined,
  sessions: Session[],
  userHistory: Record<string, TopicProgressData>
): WellsPredictionResult {
  return useMemo(() => {
    // 1. Extraer metadata básica
    const tPages = topic.pages > 0 ? topic.pages : (progress?.pages && progress.pages > 0 ? progress.pages : 15);
    const totalWords = topic.numeroPalabras ? topic.numeroPalabras : (tPages * WORDS_PER_PAGE);
    const kWords = totalWords / 1000;
    const difficulty = topic.difficulty > 0 ? topic.difficulty : (progress?.difficulty && progress.difficulty > 0 ? progress.difficulty : 5);

    // 2. Extraer o inferir el tiempo de estudio inicial
    const sortedSessions = [...sessions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const initialStudySessions = sortedSessions.filter(s => s.type === 'primer_estudio');
    
    let initialStudyMinutes = 0;
    if (initialStudySessions.length > 0) {
      initialStudyMinutes = initialStudySessions.reduce((acc, s) => acc + (s.durationMinutes || s.durationMinutes || 0), 0);
    } else if (progress && progress.studyTimeHours > 0) {
      initialStudyMinutes = progress.studyTimeHours * 60;
    } else {
      // Si no hay datos, inferimos de la media global del usuario
      
      let globalStudyMinsPerKWord = 120;
      let sumStudy = 0, countStudy = 0;
      
      // FASE 2: BIG DATA - Factor de Madurez del Opositor (Evolución Longitudinal)
      const historicalTopics = Object.values(userHistory)
          .filter(h => h.studyTimeHours > 0 && h.firstStudyDate)
          .sort((a, b) => new Date(a.firstStudyDate).getTime() - new Date(b.firstStudyDate).getTime());
          
      historicalTopics.forEach(h => {
        const hWords = h.numeroPalabras ? h.numeroPalabras : ((h.pages || 15) * WORDS_PER_PAGE);
        if (hWords > 0) {
           sumStudy += (h.studyTimeHours * 60) / (hWords / 1000);
           countStudy++;
        }
      });
      
      if (countStudy > 3) {
          globalStudyMinsPerKWord = sumStudy / countStudy;
          
          // Calcular la inercia (Maturity Factor)
          // Comparamos el rendimiento de la primera mitad histórica vs la segunda mitad (más reciente)
          if (countStudy >= 6) {
              const half = Math.floor(countStudy / 2);
              const firstHalf = historicalTopics.slice(0, half);
              const secondHalf = historicalTopics.slice(-half);
              
              const getAvgSpeed = (tArr) => {
                  let sum = 0, count = 0;
                  tArr.forEach(h => {
                      const hw = h.numeroPalabras ? h.numeroPalabras : ((h.pages || 15) * WORDS_PER_PAGE);
                      if(hw > 0) { sum += (h.studyTimeHours * 60) / (hw / 1000); count++; }
                  });
                  return sum / count;
              };
              
              const avgOld = getAvgSpeed(firstHalf);
              const avgRecent = getAvgSpeed(secondHalf);
              
              if (avgOld > 0 && avgRecent > 0) {
                  // Si avgRecent es menor que avgOld, ha ganado velocidad.
                  // Aplicamos este factor (capándolo entre 0.6 y 1.2 para evitar locuras)
                  const maturityFactor = Math.max(0.6, Math.min(1.2, avgRecent / avgOld));
                  globalStudyMinsPerKWord = globalStudyMinsPerKWord * maturityFactor;
              }
          }
      }
            
      initialStudyMinutes = kWords * globalStudyMinsPerKWord * (1 + ((difficulty - 5) * 0.12));

    }

    // Safety net: Si por algún motivo el initial study es 0 o NaN
    if (!initialStudyMinutes || initialStudyMinutes <= 0) initialStudyMinutes = 120;

    // 3. Intervalo de repetición desde la última sesión
    let lastSessionTs = Date.now();
    if (sortedSessions.length > 0) {
      lastSessionTs = new Date(sortedSessions[sortedSessions.length - 1].date).getTime();
    } else if (progress?.firstStudyDate) {
      lastSessionTs = new Date(progress.firstStudyDate).getTime();
    }
    
    const daysSinceLastSession = Math.max(0, (Date.now() - lastSessionTs) / (1000 * 3600 * 24));

    // 4. Calcular el Wells Progress Factor (0 a 1)
    // El factor representa la integridad cognitiva de la memoria.
    const reviewSessions = sortedSessions.filter(s => s.type === 'repaso' || s.type === 'refresco');
    const repetitionMultiplier = Math.min(3, 1 + (reviewSessions.length * 0.3)); // Cada repaso fortifica la memoria
    
    // Tasa de decaimiento ajustada por dificultad y repasos previos
    const memoryDecayRate = (0.05 * (1 + ((difficulty - 5) * 0.1))) / repetitionMultiplier;
    
    // Wells Factor: decae exponencialmente según los días transcurridos
    let wellsFactor = Math.exp(-daysSinceLastSession * memoryDecayRate);
    wellsFactor = Math.max(0.01, Math.min(1, wellsFactor)); // Entre 1% y 100%

    // Utilize the core prediction engine for minutes calculation
    const corePredictions = predictTopic(topic, userHistory, topic.subjectId || "", false, sessions);
    let predictedRefreshMinutes = corePredictions.predictedRefreshMinutes;
    let predictedCantoMinutes = corePredictions.predictedCantoMinutes;

    return {
      wellsFactor: Number(wellsFactor.toFixed(3)),
      predictedRefreshMinutes: Number(predictedRefreshMinutes.toFixed(0)),
      predictedCantoMinutes: Number(predictedCantoMinutes.toFixed(1)),
      initialStudyMinutes: Number(initialStudyMinutes.toFixed(0))
    };
  }, [topic, progress, sessions, userHistory]);
}
