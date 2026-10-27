import { normalizeCategoryToSubjectId, normalizeModality, extractTopicNumber } from './topicResolver';

export interface ParsedAeroFocusResult {
  success: boolean;
  payload: any;
  error?: string;
  isTextParsed?: boolean;
}

/**
 * Parsea cualquier tipo de entrada procedente de AeroFocus Pro:
 * - JSON estándar (Schema 2.0.0 o 1.0.0)
 * - JSON dentro de bloques Markdown (```json ... ```)
 * - Arrays de objetos
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

  // 3. Intento de parseo JSON estándar
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
        // Fallback a parser de texto
      }
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

  // Buscar fecha global (ej. 23/10/2026 o 2026-10-23)
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

  for (const line of lines) {
    // Descartar explícitamente líneas de distracciones, pausas, descansos, checklists o métricas de vuelo
    if (/\b(?:distracci[oó]n(?:es)?|distractions?|pausa|descanso|break|checklist|touchdown|landing|takeoff|vuelo|flight|callsign|aircraft)\b/i.test(line)) {
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
    if (!topicNum) {
      continue;
    }

    // Extraer materia de la línea o usar la del contexto
    const lineSubId = normalizeCategoryToSubjectId(line);
    const materia = lineSubId || currentSubject;

    // Limpiar notas de totales o distracciones entre paréntesis antes de extraer la duración del tema
    const cleanLineForDuration = line
      .replace(/\((?:total|vuelo|efectivo|distracci[oó]n|pausa)[^)]*\)/gi, '')
      .replace(/\[(?:total|vuelo|efectivo|distracci[oó]n|pausa)[^\]]*\]/gi, '');

    // Extraer duración
    let minutes = 60;
    const hoursMatch = cleanLineForDuration.match(/(\d+(?:[.,]\d+)?)\s*(?:horas?|h|hrs?)/i);
    const minsMatch = cleanLineForDuration.match(/(\d+)\s*(?:minutos?|mins?|m\b)/i);
    
    if (hoursMatch && minsMatch) {
      minutes = Math.round(parseFloat(hoursMatch[1].replace(',', '.')) * 60) + parseInt(minsMatch[1], 10);
    } else if (hoursMatch) {
      minutes = Math.round(parseFloat(hoursMatch[1].replace(',', '.')) * 60);
    } else if (minsMatch) {
      minutes = parseInt(minsMatch[1], 10);
    }

    // Descartar sesiones fantasmas de 1 minuto o menos (artefactos de pings / clics accidentales)
    if (minutes <= 1 && !line.match(/(?:canto|cante|oral|simulacro)/i)) {
      continue;
    }

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
