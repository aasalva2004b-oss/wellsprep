import { initialTopics, initialSubjects } from '../data/initialData';
import { AeroFocusTopicItem, WebhookResolvedTopic } from './webhookTypes';

/**
 * Normaliza nombres de asignaturas/categorías para un mapeo robusto
 */
export function normalizeCategoryToSubjectId(category?: string): string | null {
  if (!category) return null;
  const clean = category.toLowerCase().trim()
    .replace(/[._\-]/g, ' ')
    .replace(/\s+/g, ' ');

  // Procesal Civil y Penal (comprobar SIEMPRE antes que civil/penal simples)
  if (
    clean.includes('proc civ') ||
    clean.includes('procesal civ') ||
    clean.includes('proc. civ') ||
    clean.includes('dpc') ||
    clean.includes('d.p.c') ||
    clean.includes('d. proc. civ') ||
    (clean.includes('procesal') && clean.includes('civil')) ||
    clean === 'pciv' ||
    clean === 'proc_civ'
  ) {
    return 'procesal-civil';
  }

  if (
    clean.includes('proc pen') ||
    clean.includes('procesal pen') ||
    clean.includes('proc. pen') ||
    clean.includes('dpp') ||
    clean.includes('d.p.p') ||
    clean.includes('d. proc. pen') ||
    (clean.includes('procesal') && clean.includes('penal')) ||
    clean === 'ppen' ||
    clean === 'proc_pen'
  ) {
    return 'procesal-penal';
  }

  // Constitucional
  if (
    clean.includes('const') ||
    clean.includes('constitucion') ||
    clean.includes('europa') ||
    clean.includes('unión europea') ||
    clean.includes('union europea') ||
    clean.includes('dce') ||
    clean.includes('d.const') ||
    clean === 'dcon' ||
    clean === 'con'
  ) {
    return 'constitucional';
  }

  // Civil puro (sin procesal)
  if (
    clean.includes('civil') ||
    clean === 'civ' ||
    clean === 'dc' ||
    clean === 'd. civ' ||
    clean === 'd.civ' ||
    clean === 'd civil'
  ) {
    return 'civil';
  }

  // Penal puro (sin procesal)
  if (
    clean.includes('penal') ||
    clean === 'pen' ||
    clean === 'dp' ||
    clean === 'd. pen' ||
    clean === 'd.pen' ||
    clean === 'd penal'
  ) {
    return 'penal';
  }

  // Mercantil
  if (
    clean.includes('merc') ||
    clean.includes('mercantil') ||
    clean === 'dm' ||
    clean === 'd. merc' ||
    clean === 'd.merc'
  ) {
    return 'mercantil';
  }

  // Administrativo y Laboral
  if (
    clean.includes('admin') ||
    clean.includes('laboral') ||
    clean.includes('lab') ||
    clean === 'da' ||
    clean === 'dl' ||
    clean.includes('contencioso')
  ) {
    return 'administrativo-laboral';
  }

  return null;
}

/**
 * Mapeo canónico oficial de AeroFocus Pro Judicatura (jud-1 a jud-328)
 * 328 temas divididos en 7 bloques deterministas:
 * - Constitucional: jud-1 a jud-27 (Temas 1..27)
 * - Civil: jud-28 a jud-121 (Temas 1..94)
 * - Penal: jud-122 a jud-185 (Temas 1..64)
 * - Procesal Civil: jud-186 a jud-243 (Temas 1..58)
 * - Procesal Penal: jud-244 a jud-283 (Temas 1..40)
 * - Mercantil: jud-284 a jud-299 (Temas 1..16)
 * - Administrativo y Laboral: jud-300 a jud-328 (Temas 1..29)
 */
export function resolveCanonicalJudicaturaId(rawId?: string): { subjectId: string; number: number; topicId: string } | null {
  if (!rawId) return null;
  const clean = rawId.toLowerCase().trim();
  const match = clean.match(/^jud[-_]?(\d+)$/);
  if (!match) return null;
  const n = parseInt(match[1], 10);
  if (isNaN(n) || n < 1 || n > 328) return null;

  if (n >= 1 && n <= 27) {
    return { subjectId: 'constitucional', number: n, topicId: `constitucional-${n}` };
  }
  if (n >= 28 && n <= 121) {
    const topicNum = n - 27;
    return { subjectId: 'civil', number: topicNum, topicId: `civil-${topicNum}` };
  }
  if (n >= 122 && n <= 185) {
    const topicNum = n - 121;
    return { subjectId: 'penal', number: topicNum, topicId: `penal-${topicNum}` };
  }
  if (n >= 186 && n <= 243) {
    const topicNum = n - 185;
    return { subjectId: 'procesal-civil', number: topicNum, topicId: `procesal-civil-${topicNum}` };
  }
  if (n >= 244 && n <= 283) {
    const topicNum = n - 243;
    return { subjectId: 'procesal-penal', number: topicNum, topicId: `procesal-penal-${topicNum}` };
  }
  if (n >= 284 && n <= 299) {
    const topicNum = n - 283;
    return { subjectId: 'mercantil', number: topicNum, topicId: `mercantil-${topicNum}` };
  }
  if (n >= 300 && n <= 328) {
    const topicNum = n - 299;
    return { subjectId: 'administrativo-laboral', number: topicNum, topicId: `administrativo-laboral-${topicNum}` };
  }
  return null;
}

/**
 * Mapeo de prefijos e identificadores estándar de AeroFocus Pro (ej. CIV_T12 -> civil-12)
 */
export function parseAeroFocusTopicIdPrefix(rawId?: string): { subjectId: string; number: number } | null {
  if (!rawId) return null;
  const str = rawId.trim();

  // Caso jud-1 .. jud-328 canónico
  const judCanonical = resolveCanonicalJudicaturaId(str);
  if (judCanonical) {
    return { subjectId: judCanonical.subjectId, number: judCanonical.number };
  }

  // Caso directo exacto de Wellsprep: "civil-12", "constitucional-3", etc.
  const directMatch = str.toLowerCase().match(/^([a-z\-]+)[-_](\d+)$/);
  if (directMatch) {
    const sId = normalizeCategoryToSubjectId(directMatch[1]);
    if (sId) return { subjectId: sId, number: parseInt(directMatch[2], 10) };
  }

  // Caso prefijo judicatura oficial AeroFocus: "jud-const-01", "jud_const_1", "jud-constitucional-01"
  const judMatch = str.toLowerCase().match(/^jud[-_]([a-z\-]+)[-_](\d+)$/);
  if (judMatch) {
    const sId = normalizeCategoryToSubjectId(judMatch[1]);
    if (sId) return { subjectId: sId, number: parseInt(judMatch[2], 10) };
  }

  const upper = str.toUpperCase().replace(/\s+/g, '_');

  // Procesal Civil
  const procCivMatch = upper.match(/^(?:PROC_?CIV|PCIV|PROC_C|DPC|PROCESAL_CIVIL)[_\-T\s]*(\d+)$/i);
  if (procCivMatch) return { subjectId: 'procesal-civil', number: parseInt(procCivMatch[1], 10) };

  // Procesal Penal
  const procPenMatch = upper.match(/^(?:PROC_?PEN|PPEN|PROC_P|DPP|PROCESAL_PENAL)[_\-T\s]*(\d+)$/i);
  if (procPenMatch) return { subjectId: 'procesal-penal', number: parseInt(procPenMatch[1], 10) };

  // Constitucional
  const constMatch = upper.match(/^(?:CONST|CON|CONSTI|DCON|DCE|CONSTITUCIONAL)[_\-T\s]*(\d+)$/i);
  if (constMatch) return { subjectId: 'constitucional', number: parseInt(constMatch[1], 10) };

  // Civil
  const civMatch = upper.match(/^(?:CIV|CIVIL|DC)[_\-T\s]*(\d+)$/i);
  if (civMatch) return { subjectId: 'civil', number: parseInt(civMatch[1], 10) };

  // Penal
  const penMatch = upper.match(/^(?:PEN|PENAL|DP)[_\-T\s]*(\d+)$/i);
  if (penMatch) return { subjectId: 'penal', number: parseInt(penMatch[1], 10) };

  // Mercantil
  const mercMatch = upper.match(/^(?:MERC|MERCANTIL|DM|MER)[_\-T\s]*(\d+)$/i);
  if (mercMatch) return { subjectId: 'mercantil', number: parseInt(mercMatch[1], 10) };

  // Administrativo y Laboral
  const admLabMatch = upper.match(/^(?:ADM|LAB|ADMIN|LABORAL|ADM_LAB|DA|DL)[_\-T\s]*(\d+)$/i);
  if (admLabMatch) return { subjectId: 'administrativo-laboral', number: parseInt(admLabMatch[1], 10) };

  // Formato sufijo inverso: "T12_CIV", "12_CIVIL", "TEMA_12_PENAL"
  const reverseMatch = upper.match(/^(?:T|TEMA)?_?(\d+)_?(?:DE_)?(CIVIL|CIV|PENAL|PEN|CONST|CONSTI|PCIV|PROC_CIV|PPEN|PROC_PEN|MERC|MERCANTIL|ADM|LAB)$/i);
  if (reverseMatch) {
    const sId = normalizeCategoryToSubjectId(reverseMatch[2]);
    if (sId) return { subjectId: sId, number: parseInt(reverseMatch[1], 10) };
  }

  return null;
}

/**
 * Normaliza la modalidad a los tipos aceptados por Wellsprep
 */
export function normalizeModality(modality?: string): 'primer_estudio' | 'repaso' | 'refresco' | 'canto' {
  if (!modality) return 'repaso';
  const m = modality.toLowerCase().trim().replace(/[\s\-_]/g, '');
  if (
    m.includes('primerestudio') ||
    m.includes('estudioinicial') ||
    m.includes('estudio') ||
    m.includes('nuevo') ||
    m.includes('primeravuelta') ||
    m.includes('asimilacion') ||
    m.includes('lectura')
  ) {
    return 'primer_estudio';
  }
  if (
    m.includes('refresco') ||
    m.includes('refresh') ||
    m.includes('r1') ||
    m.includes('r2') ||
    m.includes('r3')
  ) {
    return 'refresco';
  }
  if (
    m.includes('canto') ||
    m.includes('cante') ||
    m.includes('simulacro') ||
    m.includes('preparador') ||
    m.includes('oral') ||
    m.includes('tribunal')
  ) {
    return 'canto';
  }
  return 'repaso';
}

/**
 * Extrae número de tema desde un identificador o título
 */
export function extractTopicNumber(idOrTitle?: string | number): number | null {
  if (typeof idOrTitle === 'number') return idOrTitle > 0 ? idOrTitle : null;
  if (!idOrTitle) return null;
  const str = String(idOrTitle).trim();

  // Descartar si es una línea de métricas, tiempo, distracción o vuelo y no un tema
  if (/\b(?:minutos?|mins?|m\b|segundos?|segs?|horas?|hrs?|h\b|distracci[oó]n(?:es)?|distractions?|pausa|descanso|break|checklist|touchdown|landing|takeoff|vuelo|flight|callsign|aircraft|efectiv[oa]|bloque)\b/i.test(str)) {
    // Solo permitir si explícitamente dice "tema" o "t-" o "#"
    if (!/(?:tema|t\b|t-|\b#)\s*\d+/i.test(str)) {
      return null;
    }
  }

  // 1. Explicit subject + number (e.g. Civil 14, Penal 3, Consti 5, DPC 8, Procesal Civil 12)
  const subjNum = str.match(/(?:civil|penal|consti(?:tucional)?|procesal(?:[-_\s]*(?:civil|penal))?|dpc|dpp|dce|dc|dp|merc(?:antil)?|admin(?:istrativo)?|laboral)\s*[-_:#T]*\s*(\d+)/i);
  if (subjNum) return parseInt(subjNum[1], 10);

  // 2. Tema 12, T12, T-12, #12
  const matchExplicit = str.match(/(?:tema|t|n[ºo°]|#)\s*[-_:]*\s*(\d+)/i);
  if (matchExplicit) return parseInt(matchExplicit[1], 10);

  // 3. Comienzo con número: "12. Las fuentes", "12 - Las fuentes", "12 Las fuentes"
  const matchStart = str.match(/^(\d+)[.\s\-_:]+(?!(?:min|hora|h\b|m\b|s\b|seg|distrac|paus|desc))/i);
  if (matchStart) return parseInt(matchStart[1], 10);

  // 4. Número aislado puro: "12"
  const matchPure = str.match(/^(\d+)$/);
  if (matchPure) return parseInt(matchPure[1], 10);

  // 5. Número al final entre paréntesis: "Las personas jurídicas (12)"
  const matchParen = str.match(/\((\d+)\)$/);
  if (matchParen) return parseInt(matchParen[1], 10);

  // 6. Generic word + number (e.g. Repaso 14, Fuentes 12)
  const matchWordNum = str.match(/(?:[a-zA-Záéíóúñ]+)\s*[-_:]+\s*(\d+)(?!\s*(?:min|h|seg|s\b|m\b|p[áa]g))/i);
  if (matchWordNum) return parseInt(matchWordNum[1], 10);

  // 7. Any standalone number in the string (not preceded/followed by units of time)
  const matchAnyNum = str.match(/(?<!\d)(?<!\b(?:p[áa]gs?\.?|p\.?)\s*)(\d{1,3})(?!\d)(?!\s*(?:min|mins|hora|horas|h\b|m\b|s\b|seg))/i);
  if (matchAnyNum) {
    const n = parseInt(matchAnyNum[1], 10);
    if (n >= 1 && n <= 150) return n;
  }

  return null;
}

/**
 * Extrae minutos netos de estudio desde cualquier objeto de tema o sesión de AeroFocus Pro
 */
export function extractMinutesFromAeroItem(item: any, fallbackMinutes: number = 45): number {
  if (!item || typeof item !== 'object') return fallbackMinutes;

  // 1. Minutos explícitos directos
  const directMins = item.minutosEfectivos ?? item.effectiveMinutes ?? item.effectiveStudyMinutes ??
    item.studyMinutes ?? item.durationMinutes ?? item.duration_minutes ?? item.minutes ?? item.minutos ??
    item.netMinutes ?? item.minutosNetos ?? item.grossMinutes ?? item.minutosBrutos ??
    item.totalMinutes ?? item.minutosTotales;
  if (directMins !== undefined && directMins !== null && !isNaN(Number(directMins)) && Number(directMins) > 0) {
    return Math.round(Number(directMins));
  }

  // 2. Horas explícitas directas
  const directHours = item.horasEfectivas ?? item.effectiveHours ?? item.hours ?? item.horas ?? item.studyHours ?? item.horasEstudio;
  if (directHours !== undefined && directHours !== null && !isNaN(Number(directHours)) && Number(directHours) > 0) {
    return Math.round(Number(directHours) * 60);
  }

  // 3. Cadena de tiempo o duración (ej. "45m", "1h 30m", "01:30:00", "90")
  const timeRaw = item.duration ?? item.time ?? item.tiempo ?? item.timeFormatted ?? item.tiempoFormateado;
  if (typeof timeRaw === 'number' && timeRaw > 0) {
    return Math.round(timeRaw);
  }
  if (typeof timeRaw === 'string' && timeRaw.trim()) {
    const str = timeRaw.trim().toLowerCase();
    const colonMatch = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (colonMatch) {
      return parseInt(colonMatch[1], 10) * 60 + parseInt(colonMatch[2], 10);
    }
    const hMatch = str.match(/(\d+(?:[.,]\d+)?)\s*(?:h|horas?)/);
    const mMatch = str.match(/(\d+)\s*(?:m|mins?|minutos?)/);
    if (hMatch || mMatch) {
      let parsed = 0;
      if (hMatch) parsed += Math.round(parseFloat(hMatch[1].replace(',', '.')) * 60);
      if (mMatch) parsed += parseInt(mMatch[1], 10);
      if (parsed > 0) return parsed;
    }
    const pureNum = parseInt(str, 10);
    if (!isNaN(pureNum) && pureNum > 0) return pureNum;
  }

  return fallbackMinutes;
}

/**
 * Resuelve de forma unívoca y rigurosa un tema de AeroFocus Pro contra el temario de Wellsprep
 * Jerarquía estricta:
 * 1. Coincidencia directa por topicId canónico (jud-1..jud-328)
 * 2. Coincidencia por ID de Wellsprep o prefijo estándar (ej. civil-12, CIV_T12, etc.)
 * 3. Coincidencia compuesta: normalizeCategoryToSubjectId(materia) + topicNumber
 * 4. Coincidencia por título oficial normalizado
 */
export function resolveAeroFocusTopic(
  item: AeroFocusTopicItem,
  customTopics?: typeof initialTopics
): WebhookResolvedTopic | null {
  const topicsList = customTopics || initialTopics;

  // 1. Intento por topicId canónico oficial AeroFocus jud-1..jud-328
  if (item.topicId) {
    const canonical = resolveCanonicalJudicaturaId(item.topicId);
    if (canonical) {
      const match = topicsList.find(t => t.id === canonical.topicId || (t.subjectId === canonical.subjectId && t.number === canonical.number));
      if (match) {
        return buildResolvedTopic(match, item);
      }
    }

    // Intento por topicId directo en Wellsprep (ej. "civil-12", "constitucional-1")
    const cleanId = item.topicId.trim().toLowerCase();
    const exact = topicsList.find(t => t.id.toLowerCase() === cleanId);
    if (exact) {
      return buildResolvedTopic(exact, item);
    }

    // Análisis de prefijo AeroFocus (ej. "CIV_T12", "PROC_CIV_4", "PCIV-12", "T12_CIV")
    const parsed = parseAeroFocusTopicIdPrefix(item.topicId);
    if (parsed) {
      const match = topicsList.find(t => t.subjectId === parsed.subjectId && t.number === parsed.number);
      if (match) {
        return buildResolvedTopic(match, item);
      }
    }
  }

  // 2. Intento por número y categoría combinada (la vía más común en AeroFocus)
  const rawCat = item.materia || item.subject || item.subjectName || item.asignatura || item.category;
  const subjectIdFromCategory = normalizeCategoryToSubjectId(rawCat);
  const topicNum = extractTopicNumber(item.temaNumero) ||
                   extractTopicNumber(item.topicNumber) ||
                   extractTopicNumber(item.topicId) ||
                   extractTopicNumber(item.tema) ||
                   extractTopicNumber(item.topic) ||
                   extractTopicNumber(item.topicTitle);

  if (subjectIdFromCategory && topicNum) {
    const match = topicsList.find(t => t.subjectId === subjectIdFromCategory && t.number === topicNum);
    if (match) {
      return buildResolvedTopic(match, item);
    }
  }

  // 3. Intento por categoría en el título o ID si no venía en el campo category
  const titleText = item.topicTitle || item.tema || item.topic || '';
  const subjectIdFromTitle = normalizeCategoryToSubjectId(titleText) ||
                             normalizeCategoryToSubjectId(item.topicId);

  if (subjectIdFromTitle && topicNum) {
    const match = topicsList.find(t => t.subjectId === subjectIdFromTitle && t.number === topicNum);
    if (match) {
      return buildResolvedTopic(match, item);
    }
  }

  // 4. Intento por similitud de texto del título dentro de la asignatura conocida
  const activeSubject = subjectIdFromCategory || subjectIdFromTitle;
  if (activeSubject && titleText) {
    const cleanTitle = titleText.toLowerCase()
      .replace(/tema\s*\d+\s*[-:.]*/i, '')
      .replace(/^\d+[.:\- ]*/, '')
      .trim();

    if (cleanTitle.length >= 4) {
      const match = topicsList.find(t => {
        if (t.subjectId !== activeSubject) return false;
        const officialTitle = t.title.toLowerCase();
        return officialTitle.includes(cleanTitle) || cleanTitle.includes(officialTitle);
      });
      if (match) {
        return buildResolvedTopic(match, item);
      }
    }
  }

  // 5. Intento global de coincidencia por título exhaustivo
  if (titleText) {
    const cleanTitle = titleText.toLowerCase()
      .replace(/tema\s*\d+\s*[-:.]*/i, '')
      .replace(/^\d+[.:\- ]*/, '')
      .trim();

    if (cleanTitle.length >= 6) {
      const match = topicsList.find(t => {
        const officialTitle = t.title.toLowerCase();
        return officialTitle.includes(cleanTitle) || cleanTitle.includes(officialTitle);
      });
      if (match) {
        return buildResolvedTopic(match, item);
      }
    }
  }

  // 6. Intento por número puro si la asignatura fue identificada
  if (activeSubject && topicNum) {
    const match = topicsList.find(t => t.subjectId === activeSubject && t.number === topicNum);
    if (match) {
      return buildResolvedTopic(match, item);
    }
  }

  // 7. Fallback determinista amigable
  const finalNum = topicNum || 1;
  const finalSubId = activeSubject || 'constitucional';
  const effectiveMins = extractMinutesFromAeroItem(item, 45);

  return {
    resolvedTopicId: `${finalSubId}-${finalNum}`,
    resolvedSubjectId: finalSubId,
    resolvedTopicNumber: finalNum,
    resolvedTopicTitle: titleText ? `Tema ${finalNum} - ${titleText}` : `Tema ${finalNum}`,
    modality: normalizeModality((item as any).modalidad || (item as any).modality || (item as any).type),
    effectiveHours: Math.round((effectiveMins / 60) * 100) / 100,
    effectiveMinutes: effectiveMins,
    plsema: item.plsema,
    minutesPerPage: item.minutesPerPage ?? item.minutosPorPagina,
    secondsPerPage: item.secondsPerPage ?? item.segundosPorPagina,
    pageBreakdown: item.pageBreakdown,
    tasksBreakdown: item.tasksBreakdown,
    original: item
  };
}

function buildResolvedTopic(
  topic: typeof initialTopics[0],
  item: AeroFocusTopicItem | any
): WebhookResolvedTopic {
  const rawAny = item as any;
  const effectiveMinutes = extractMinutesFromAeroItem(rawAny, 45);
  const effectiveHours = Math.round((effectiveMinutes / 60) * 100) / 100;
  const effectiveSeconds = typeof rawAny.effectiveSeconds === 'number' ? rawAny.effectiveSeconds :
                           typeof rawAny.segundosEfectivos === 'number' ? rawAny.segundosEfectivos :
                           effectiveMinutes * 60;

  const grade = typeof rawAny.cantoGrade === 'number' ? rawAny.cantoGrade :
                typeof rawAny.grade === 'number' ? rawAny.grade :
                typeof rawAny.nota === 'number' ? rawAny.nota : undefined;

  const seconds = typeof rawAny.cantoSeconds === 'number' ? rawAny.cantoSeconds :
                  typeof rawAny.seconds === 'number' ? rawAny.seconds : undefined;

  const difficulty = typeof rawAny.difficulty === 'number' ? rawAny.difficulty :
                     typeof rawAny.dificultadReal === 'number' ? rawAny.dificultadReal :
                     typeof rawAny.dificultad === 'number' ? rawAny.dificultad : undefined;

  const notes = rawAny.notes || rawAny.feedback || rawAny.observaciones || undefined;
  const mistakes = rawAny.mistakes || rawAny.fallos || rawAny.errores || undefined;

  const startPage = rawAny.startPage ?? rawAny.pages?.pageStart ?? rawAny.pageInfo?.startPage;
  const endPage = rawAny.endPage ?? rawAny.pages?.pageEnd ?? rawAny.pageInfo?.endPage;
  const pagesCount = rawAny.pagesCount ?? rawAny.pages?.pagesCount ?? rawAny.pageInfo?.pagesRead ?? 
    (startPage != null && endPage != null ? Math.max(0, Number(endPage) - Number(startPage) + 1) : undefined);
  const pagesText = rawAny.pagesText ?? rawAny.pages?.rawText ?? rawAny.paginas ?? 
    (startPage != null && endPage != null ? `Págs. ${startPage}-${endPage}` : undefined);

  const isCompleted = Boolean(rawAny.completado || rawAny.completed || rawAny.isTopicCompleted || rawAny.status === 'completed');

  const resolved: WebhookResolvedTopic = {
    resolvedTopicId: topic.id,
    resolvedSubjectId: topic.subjectId,
    resolvedTopicNumber: topic.number,
    resolvedTopicTitle: `Tema ${topic.number} - ${topic.title}`,
    modality: normalizeModality(rawAny.modalidad || rawAny.modality || rawAny.type),
    effectiveHours: Math.round(effectiveHours * 100) / 100,
    effectiveMinutes: effectiveMinutes,
    effectiveSeconds: effectiveSeconds,
    minutesPerPage: rawAny.minutesPerPage ?? rawAny.minutosPorPagina,
    secondsPerPage: rawAny.secondsPerPage ?? rawAny.segundosPorPagina,
    plsema: rawAny.plsema || rawAny.fasesPlsema,
    pageBreakdown: rawAny.pageBreakdown,
    tasksBreakdown: rawAny.tasksBreakdown,
    original: item
  };

  if (isCompleted || rawAny.completesVuelta !== undefined) {
    resolved.completesVuelta = isCompleted || Boolean(rawAny.completesVuelta);
    resolved.isTopicCompleted = isCompleted;
  }
  if (difficulty !== undefined) {
    resolved.difficulty = difficulty;
    resolved.dificultadReal = difficulty;
  }
  if (grade !== undefined) resolved.cantoGrade = grade;
  if (seconds !== undefined) resolved.cantoSeconds = seconds;
  if (rawAny.cantoType) {
    resolved.cantoType = rawAny.cantoType;
  } else if (rawAny.simulacro) {
    resolved.cantoType = 'preparador';
  }
  if (notes) resolved.notes = notes;
  if (mistakes) resolved.mistakes = mistakes;

  if (startPage !== undefined) resolved.startPage = Number(startPage);
  if (endPage !== undefined) resolved.endPage = Number(endPage);
  if (pagesCount !== undefined) resolved.pagesCount = Number(pagesCount);
  if (pagesText) resolved.pagesText = pagesText;
  if (rawAny.distractionSeconds || rawAny.segundosDistraccion) {
    resolved.distractionSeconds = Number(rawAny.distractionSeconds || rawAny.segundosDistraccion);
  }
  if (rawAny.summaryLine) resolved.summaryLine = rawAny.summaryLine;

  if (rawAny.pageInfo || (startPage !== undefined && endPage !== undefined)) {
    resolved.pageInfo = {
      startPage: startPage !== undefined ? Number(startPage) : undefined,
      endPage: endPage !== undefined ? Number(endPage) : undefined,
      pagesRead: pagesCount !== undefined ? Number(pagesCount) : undefined,
      currentPage: endPage !== undefined ? Number(endPage) : undefined,
    };
  }

  return resolved;
}
