import { normalizeCategoryToSubjectId, normalizeModality, extractTopicNumber } from './topicResolver';

export interface ParsedAeroFocusResult {
  success: boolean;
  payload: any;
  error?: string;
  isTextParsed?: boolean;
}

/**
 * Parsea cualquier tipo de entrada procedente de AeroFocus Pro:
 * - JSON estándar (Schema 2.2.0, 2.0.0 o 1.0.0)
 * - JSON dentro de bloques Markdown (```json ... ```) o texto circundante
 * - Arrays de objetos
 * - Estructuras con tasksBreakdown, sessions, studySessions, pageBreakdown, etc.
 * - Texto en bruto copiado de resúmenes de sesión o cierres diarios
 */
export function parseAeroFocusInput(input: any): ParsedAeroFocusResult {
  if (!input) {
    return { success: false, payload: null, error: 'Entrada vacía o nula' };
  }

  // 1. Si ya es un objeto o array estructurado
  if (typeof input === 'object') {
    return { success: true, payload: input, isTextParsed: false };
  }

  if (typeof input !== 'string') {
    return { success: false, payload: null, error: 'Formato de entrada no soportado' };
  }

  let text = input.trim();
  if (!text) {
    return { success: false, payload: null, error: 'Texto vacío' };
  }

  // 2. Limpieza de bloques markdown: ```json { ... } ``` o ``` { ... } ```
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }

  // 3. Intento de parseo JSON estándar directo
  if ((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'))) {
    try {
      const parsed = JSON.parse(text);
      return { success: true, payload: parsed, isTextParsed: false };
    } catch {
      // Si el JSON falla (por comillas simples, trailing commas, etc.), intentar sanear
      try {
        const sanitized = text
          .replace(/,\s*([\]}])/g, '$1') // quitar trailing commas
          .replace(/'/g, '"'); // comillas simples a dobles
        const parsed = JSON.parse(sanitized);
        return { success: true, payload: parsed, isTextParsed: false };
      } catch {
        // Fallback
      }
    }
  }

  // 3b. Intento de extraer JSON embebido en texto si contiene llaves o corchetes
  const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      return { success: true, payload: parsed, isTextParsed: false };
    } catch {
      try {
        const sanitized = jsonMatch[1]
          .replace(/,\s*([\]}])/g, '$1')
          .replace(/'/g, '"');
        const parsed = JSON.parse(sanitized);
        return { success: true, payload: parsed, isTextParsed: false };
      } catch {}
    }
  }

  // 4. Parser Inteligente de Texto en Bruto
  const textParsed = parseAeroFocusPlainText(text);
  if (textParsed && textParsed.topics && textParsed.topics.length > 0) {
    return { success: true, payload: textParsed, isTextParsed: true };
  }

  return {
    success: false,
    payload: null,
    error: 'No se pudo interpretar el contenido como JSON ni como reporte de texto de AeroFocus'
  };
}

/**
 * Parser de texto línea a línea para reportes de AeroFocus Pro
 */
export function parseAeroFocusPlainText(rawText: string): any {
  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const topics: any[] = [];
  
  let detectedDate: string | null = null;
  let detectedFlightId: string | null = null;
  let currentSubject: string = 'Constitucional';
  let totalMinutesAccumulated = 0;

  // Buscar fecha global (ej. 23/10/2026 o 2026-10-23 o 23-10-2026)
  const dateMatch = rawText.match(/(\d{4}[-/]\d{1,2}[-/]\d{1,2})|(\d{1,2}[-/]\d{1,2}[-/]\d{4})/);
  if (dateMatch) {
    const rawD = dateMatch[0];
    if (rawD.includes('-') && rawD.split('-')[0].length === 4) {
      detectedDate = rawD;
    } else {
      const parts = rawD.split(/[-/]/);
      if (parts[2].length === 4) {
        detectedDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    }
  }

  // Buscar ID de vuelo (ej. Vuelo #1234 o Flight 1234)
  const flightMatch = rawText.match(/(?:vuelo|flight|cierre|sesi[oó]n)\s*[#:]*\s*([a-zA-Z0-9_\-]+)/i);
  if (flightMatch) {
    detectedFlightId = flightMatch[1];
  }

  // Buscar minutos totales globales si vienen expresados
  const totalDurationMatch = rawText.match(/(?:tiempo\s*total|total\s*tiempo|tiempo\s*neto|duraci[oó]n|efectivo)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(?:horas?|h|hrs?)?(?:\s*(\d+)\s*(?:minutos?|mins?|m\b))?/i);
  if (totalDurationMatch) {
    const hrs = totalDurationMatch[1] && (rawText.toLowerCase().includes('h') || rawText.toLowerCase().includes('hora')) ? parseFloat(totalDurationMatch[1].replace(',', '.')) : 0;
    const mins = totalDurationMatch[2] ? parseInt(totalDurationMatch[2], 10) : (hrs === 0 && totalDurationMatch[1] ? parseInt(totalDurationMatch[1], 10) : 0);
    totalMinutesAccumulated = Math.round(hrs * 60) + mins;
  }

  for (const rawLine of lines) {
    // Limpiar viñetas comunes de markdown y listas
    const line = rawLine.replace(/^[-*•\d+.]\s*/, '').trim();

    // Descartar solo si la línea es EXCLUSIVAMENTE una marca de distracción, pausa o descanso sin temas
    if (/^(?:distracci[oó]n(?:es)?|distractions?|pausa|descanso|break|checklist|touchdown|landing|takeoff)\b/i.test(line) && !line.match(/(?:tema|t\d+|civil|penal|const|procesal|dpc|dpp)/i)) {
      continue;
    }

    // Si la línea es solo un encabezado de asignatura, actualizar currentSubject
    const subId = normalizeCategoryToSubjectId(line);
    if (subId && line.length < 35 && !line.match(/\d+/)) {
      currentSubject = line;
      continue;
    }

    // Buscar si la línea contiene un tema
    const topicNum = extractTopicNumber(line);
    
    // Extraer materia de la línea o usar la del contexto
    const lineSubId = normalizeCategoryToSubjectId(line);
    const materia = lineSubId || currentSubject;

    // Limpiar notas de totales o distracciones entre paréntesis antes de extraer la duración del tema
    const cleanLineForDuration = line
      .replace(/\((?:total|vuelo|efectivo|distracci[oó]n|pausa)[^)]*\)/gi, '')
      .replace(/\[(?:total|vuelo|efectivo|distracci[oó]n|pausa)[^\]]*\]/gi, '');

    // Extraer duración
    let minutes = 45;
    const hoursMatch = cleanLineForDuration.match(/(\d+(?:[.,]\d+)?)\s*(?:horas?|h|hrs?)/i);
    const minsMatch = cleanLineForDuration.match(/(\d+)\s*(?:minutos?|mins?|m\b)/i);
    
    if (hoursMatch && minsMatch) {
      minutes = Math.round(parseFloat(hoursMatch[1].replace(',', '.')) * 60) + parseInt(minsMatch[1], 10);
    } else if (hoursMatch) {
      minutes = Math.round(parseFloat(hoursMatch[1].replace(',', '.')) * 60);
    } else if (minsMatch) {
      minutes = parseInt(minsMatch[1], 10);
    }

    // Asegurar mínimo de 1 minuto para nunca descartar por completo
    if (minutes <= 0) minutes = 45;

    // Extraer modalidad
    let modalidad = 'repaso';
    if (line.match(/primer\s*estudio|estudio\s*inicial|1[ªa]\s*vuelta/i)) {
      modalidad = 'primer_estudio';
    } else if (line.match(/refresco|refresh|r[123]/i)) {
      modalidad = 'refresco';
    } else if (line.match(/canto|cante|simulacro|oral/i)) {
      modalidad = 'canto';
    } else if (line.match(/repaso|vuelta|revisi[oó]n/i)) {
      modalidad = 'repaso';
    }

    // Extraer páginas (ej. págs. 1-25 o p. 10 a 30)
    let startPage: number | null = null;
    let endPage: number | null = null;
    let pagesText: string | undefined = undefined;
    const pagesMatch = line.match(/(?:p[áa]gs?\.?|p\.?|p[áa]ginas?)\s*(\d+)\s*(?:-|a|al|hasta)\s*(\d+)/i);
    if (pagesMatch) {
      startPage = parseInt(pagesMatch[1], 10);
      endPage = parseInt(pagesMatch[2], 10);
      pagesText = `Págs. ${startPage}-${endPage}`;
    }

    // Extraer nota o tiempo de canto si aplica
    let cantoGrade: number | undefined = undefined;
    const gradeMatch = line.match(/(?:nota|calificaci[oó]n|puntos?)\s*[:=]?\s*(\d+(?:[.,]\d+)?)/i);
    if (gradeMatch) {
      cantoGrade = parseFloat(gradeMatch[1].replace(',', '.'));
    }

    if (topicNum) {
      topics.push({
        topicNumber: topicNum,
        temaNumero: topicNum,
        materia,
        category: materia,
        topicTitle: `Tema ${topicNum}`,
        effectiveMinutes: minutes,
        minutosEfectivos: minutes,
        effectiveHours: Math.round((minutes / 60) * 100) / 100,
        horasEfectivas: Math.round((minutes / 60) * 100) / 100,
        modality: modalidad,
        modalidad,
        startPage,
        endPage,
        pagesText,
        cantoGrade,
        notes: line,
        isTopicCompleted: true,
        completesVuelta: modalidad === 'repaso' || modalidad === 'canto'
      });
    } else if (lineSubId && (hoursMatch || minsMatch)) {
      // Línea con asignatura y tiempo pero sin número explícito de tema
      topics.push({
        topicNumber: 1,
        temaNumero: 1,
        materia: lineSubId,
        category: lineSubId,
        topicTitle: `Tema 1 (${lineSubId})`,
        effectiveMinutes: minutes,
        minutosEfectivos: minutes,
        effectiveHours: Math.round((minutes / 60) * 100) / 100,
        horasEfectivas: Math.round((minutes / 60) * 100) / 100,
        modality: modalidad,
        modalidad,
        startPage,
        endPage,
        pagesText,
        cantoGrade,
        notes: line,
        isTopicCompleted: true,
        completesVuelta: false
      });
    }
  }

  // Fallback si no se detectó ningún tema explícito pero hay texto con mención de estudio
  if (topics.length === 0) {
    const fallbackMins = totalMinutesAccumulated > 0 ? totalMinutesAccumulated : 60;
    const fallbackSub = normalizeCategoryToSubjectId(rawText) || currentSubject || 'constitucional';
    topics.push({
      topicNumber: 1,
      temaNumero: 1,
      materia: fallbackSub,
      category: fallbackSub,
      topicTitle: `Sesión AeroFocus (${fallbackSub})`,
      effectiveMinutes: fallbackMins,
      minutosEfectivos: fallbackMins,
      effectiveHours: Math.round((fallbackMins / 60) * 100) / 100,
      horasEfectivas: Math.round((fallbackMins / 60) * 100) / 100,
      modality: 'repaso',
      modalidad: 'repaso',
      notes: rawText.slice(0, 200),
      isTopicCompleted: false,
      completesVuelta: false
    });
  }

  const totalMinutes = topics.reduce((acc, t) => acc + (t.effectiveMinutes || 0), 0);
  const totalHours = Math.round((totalMinutes / 60) * 100) / 100;

  return {
    date: detectedDate || new Date().toISOString().split('T')[0],
    flightId: detectedFlightId || `vuelo_${Date.now()}`,
    source: 'aerofocus_text_report',
    totalFlightEffectiveMinutes: totalMinutes,
    totalFlightEffectiveHours: totalHours,
    dailyTotalEffectiveHours: totalHours,
    topics
  };
}
