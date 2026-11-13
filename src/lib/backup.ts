/** Offline backup validation. No Firebase imports, network calls, writes, or field-value logging. */
export interface BackupIssue {
  severity: 'error' | 'warning';
  code: string;
  path: string;
  message: string;
}

export type BackupRecord = Record<string, unknown>;
export interface BackupProgress extends BackupRecord { topicId: string }
export interface BackupSession extends BackupRecord { id: string; topicId: string; date: string; durationMinutes: number }
export interface BackupData extends BackupRecord {
  progress: BackupProgress[];
  sessions: BackupSession[];
  schemaVersion?: number;
  settings?: Record<string, BackupRecord>;
  quarantine?: BackupRecord[];
}
export interface BackupValidation {
  valid: boolean;
  backup: BackupData | null;
  issues: BackupIssue[];
  counts: { progress: number; sessions: number; progressTopics: number; sessionTopics: number };
}

function isRecord(value: unknown): value is BackupRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
function validDocumentId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && !value.includes('/') && value !== '.' && value !== '..' && new TextEncoder().encode(value).length <= 1500;
}
function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isSerializedBackupTimestamp(value: unknown): value is { seconds: number; nanoseconds: number; type?: string } {
  return isRecord(value)
    && Object.keys(value).every(key => ['seconds', 'nanoseconds', 'type'].includes(key))
    && Number.isInteger(value.seconds) && isFiniteNumber(value.seconds)
    && Number.isInteger(value.nanoseconds) && isFiniteNumber(value.nanoseconds)
    && value.nanoseconds >= 0 && value.nanoseconds < 1_000_000_000
    && value.seconds >= -62_135_596_800 && value.seconds <= 253_402_300_799
    && (value.type === undefined || value.type === 'firestore/timestamp/1.0');
}

/** Rebuild SDK timestamps through an injected factory, keeping this module usable offline. */
export function rehydrateBackupTimestamps<T>(value: T, factory: (seconds: number, nanoseconds: number) => unknown): T {
  if (isSerializedBackupTimestamp(value)) return factory(value.seconds, value.nanoseconds) as T;
  if (Array.isArray(value)) return value.map(item => rehydrateBackupTimestamps(item, factory)) as T;
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rehydrateBackupTimestamps(item, factory)])) as T;
  }
  return value;
}

export function parseBackup(jsonText: string): BackupValidation {
  try {
    return validateBackup(JSON.parse(jsonText));
  } catch {
    return { valid: false, backup: null, issues: [{ severity: 'error', code: 'invalid_json', path: '$', message: 'El archivo no contiene JSON válido.' }], counts: { progress: 0, sessions: 0, progressTopics: 0, sessionTopics: 0 } };
  }
}

export function validateBackup(input: unknown): BackupValidation {
  const issues: BackupIssue[] = [];
  const counts = { progress: 0, sessions: 0, progressTopics: 0, sessionTopics: 0 };
  const add = (severity: BackupIssue['severity'], code: string, path: string, message: string) => issues.push({ severity, code, path, message });
  const error = (code: string, path: string, message: string) => add('error', code, path, message);
  const warn = (code: string, path: string, message: string) => add('warning', code, path, message);

  if (!isRecord(input)) {
    error('invalid_root', '$', 'La copia debe ser un objeto con listas progress y sessions.');
    return { valid: false, backup: null, issues, counts };
  }
  for (const key of ['progress', 'sessions']) {
    if (!Array.isArray(input[key])) error('invalid_collection', `$.${key}`, 'Se requiere una lista de registros.');
  }
  if (issues.length) return { valid: false, backup: null, issues, counts };
  const progress = input.progress as unknown[];
  const sessions = input.sessions as unknown[];
  counts.progress = progress.length;
  counts.sessions = sessions.length;
  if ('schemaVersion' in input && input.schemaVersion !== 1 && input.schemaVersion !== 2) error('unsupported_schema_version', '$.schemaVersion', 'La versión del formato no es compatible con este lector.');
  if (!('settings' in input)) warn('settings_missing', '$.settings', 'Esta copia no incluye la configuración de planificación ni preparador.');
  else if (!isRecord(input.settings)) error('invalid_settings', '$.settings', 'La configuración debe ser un mapa de documentos.');
  else {
    for (const [id, value] of Object.entries(input.settings)) {
      // Never include an unknown document ID in diagnostic text: it may contain private data.
      if (!validDocumentId(id) || !isRecord(value)) error('invalid_settings_document', '$.settings', 'Cada ajuste debe tener un identificador válido y un documento como valor.');
    }
  }
  if ('quarantine' in input && (!Array.isArray(input.quarantine) || input.quarantine.some(value => !isRecord(value)))) error('invalid_quarantine', '$.quarantine', 'La cuarentena debe ser una lista de documentos.');
  if (!('schemaVersion' in input)) warn('schema_version_missing', '$', 'Copia histórica sin versión de esquema explícita.');

  const progressByTopic = new Map<string, { record: BackupRecord; index: number }>();
  const sessionsByTopic = new Map<string, BackupRecord[]>();
  const sessionIds = new Set<string>();
  const owners = new Set<string>();
  const checkNumber = (row: BackupRecord, key: string, path: string, minimum = 0, maximum = Infinity) => {
    const value = row[key];
    if (value === undefined || value === null) return;
    if (!isFiniteNumber(value) || value < minimum || value > maximum) error('invalid_number', `${path}.${key}`, 'El valor debe ser un número finito dentro del rango permitido.');
  };
  const checkTimestamp = (row: BackupRecord, key: string, path: string) => {
    const value = row[key];
    if (value === undefined || value === null) return;
    if (isSerializedBackupTimestamp(value)) warn('serialized_timestamp', `${path}.${key}`, 'Restaurar este objeto como Timestamp antes de guardarlo en Firestore.');
    else if (isRecord(value) && ('seconds' in value || 'nanoseconds' in value)) error('invalid_timestamp', `${path}.${key}`, 'La marca temporal serializada no es válida.');
  };
  const checkOwner = (row: BackupRecord) => {
    if (typeof row.userId === 'string' && row.userId) owners.add(row.userId);
  };

  progress.forEach((value, index) => {
    const path = `$.progress[${index}]`;
    if (!isRecord(value)) { error('invalid_record', path, 'Se requiere un objeto de progreso.'); return; }
    checkOwner(value);
    if (!validDocumentId(value.topicId)) error('invalid_topic_id', `${path}.topicId`, 'Se requiere un identificador de tema válido.');
    else if (progressByTopic.has(value.topicId)) error('duplicate_topic_id', `${path}.topicId`, 'Hay más de un progreso para el mismo tema.');
    else progressByTopic.set(value.topicId, { record: value, index });
    for (const key of ['pages', 'numeroPalabras', 'epigrafes', 'studyTimeHours', 'estudioHours', 'repasoHours', 'refrescoHours', 'vueltas', 'reviewCount', 'difficultySum', 'difficultyCount', 'srsInterval', 'srsRepetitions']) checkNumber(value, key, path);
    checkNumber(value, 'difficulty', path, 0, 10);
    if (!(isFiniteNumber(value.pages) && value.pages > 0)) warn('missing_pages', `${path}.pages`, 'No hay una extensión positiva medida para este tema.');
    for (const key of ['firstStudyDate', 'lastReviewDate', 'nextReviewDate', 'ultimoCantoFecha']) {
      if (value[key] !== undefined && value[key] !== null && value[key] !== '' && !validDate(value[key])) error('invalid_date', `${path}.${key}`, 'La fecha debe ser un día real con formato AAAA-MM-DD.');
    }
    checkTimestamp(value, 'updatedAt', path);
  });

  const knownTypes = new Set(['estudio_inicial', 'primer_estudio', 'estudio', 'repaso', 'refresco', 'canto', 'simulacro']);
  sessions.forEach((value, index) => {
    const path = `$.sessions[${index}]`;
    if (!isRecord(value)) { error('invalid_record', path, 'Se requiere un objeto de sesión.'); return; }
    checkOwner(value);
    if (!validDocumentId(value.id)) error('invalid_session_id', `${path}.id`, 'Se requiere un identificador de sesión estable para evitar duplicados.');
    else if (sessionIds.has(value.id)) error('duplicate_session_id', `${path}.id`, 'Hay más de una sesión con el mismo identificador.');
    else sessionIds.add(value.id);
    if (!validDocumentId(value.topicId)) error('invalid_topic_id', `${path}.topicId`, 'Se requiere un identificador de tema válido.');
    else {
      const rows = sessionsByTopic.get(value.topicId) || [];
      rows.push(value);
      sessionsByTopic.set(value.topicId, rows);
      if (!progressByTopic.has(value.topicId)) warn('session_without_progress', `${path}.topicId`, 'La sesión no tiene un documento de progreso en esta copia.');
    }
    if (!validDate(value.date)) error('invalid_date', `${path}.date`, 'La fecha debe ser un día real con formato AAAA-MM-DD.');
    if (!isFiniteNumber(value.durationMinutes) || value.durationMinutes < 0) error('invalid_duration', `${path}.durationMinutes`, 'Se requiere duración en minutos finitos y no negativos.');
    for (const key of ['durationReal', 'effectiveHours', 'cantoSeconds', 'pagesCount', 'startPage', 'endPage', 'distractionSeconds']) checkNumber(value, key, path);
    for (const key of ['difficulty', 'dificultadReal', 'cantoGrade']) checkNumber(value, key, path, 0, 10);
    if (value.completesVuelta !== undefined && typeof value.completesVuelta !== 'boolean') error('invalid_completion', `${path}.completesVuelta`, 'La finalización de vuelta debe ser verdadera o falsa.');
    if (typeof value.type !== 'string' || !knownTypes.has(value.type)) warn('unknown_session_type', `${path}.type`, 'La actividad no coincide con los tipos reconocidos; se conserva sin reinterpretarla.');
    if (value.type === 'primer_estudio' || value.type === 'estudio') warn('legacy_session_type', `${path}.type`, 'La actividad usa un alias histórico de estudio inicial.');
    if (isFiniteNumber(value.startPage) && isFiniteNumber(value.endPage) && value.startPage > value.endPage) error('invalid_page_range', path, 'El inicio del intervalo de páginas supera su final.');
    if (isFiniteNumber(value.durationMinutes) && isFiniteNumber(value.durationReal) && Math.abs(value.durationMinutes - value.durationReal) > .01) warn('duration_conflict', path, 'Las dos duraciones en minutos difieren; no se elige una automáticamente.');
    if (isFiniteNumber(value.durationMinutes) && isFiniteNumber(value.effectiveHours) && Math.abs(value.durationMinutes - value.effectiveHours * 60) > .1) warn('effective_hours_conflict', path, 'Las horas efectivas y los minutos de duración no son equivalentes.');
    checkTimestamp(value, 'createdAt', path);
    checkTimestamp(value, 'updatedAt', path);
  });

  counts.progressTopics = progressByTopic.size;
  counts.sessionTopics = sessionsByTopic.size;
  if (owners.size > 1) warn('multiple_owners', '$', 'Hay más de un propietario histórico; debe revisarse antes de restaurar.');
  for (const [topicId, { record, index }] of progressByTopic) {
    const path = `$.progress[${index}]`;
    const rows = sessionsByTopic.get(topicId) || [];
    if (!rows.length) { warn('progress_without_sessions', path, 'Este progreso no tiene sesiones en la copia.'); continue; }
    const hours = rows.reduce((sum, row) => sum + (isFiniteNumber(row.durationReal) ? row.durationReal : isFiniteNumber(row.durationMinutes) ? row.durationMinutes : 0) / 60, 0);
    if (isFiniteNumber(record.studyTimeHours) && Math.abs(record.studyTimeHours - hours) > .025) warn('aggregate_hours_conflict', `${path}.studyTimeHours`, 'Las horas agregadas difieren de la suma del historial.');
    const vueltas = rows.filter(row => row.completesVuelta === true || (row.completesVuelta === undefined && (row.type === 'repaso' || row.type === 'canto'))).length;
    if (isFiniteNumber(record.vueltas) && record.vueltas !== vueltas) warn('aggregate_vueltas_conflict', `${path}.vueltas`, 'Las vueltas agregadas difieren de las banderas del historial; no se recalculan automáticamente.');
  }
  const valid = !issues.some(issue => issue.severity === 'error');
  return { valid, backup: valid ? input as BackupData : null, issues, counts };
}
