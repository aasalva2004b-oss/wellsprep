import { TopicProgressData } from "./prediction";
import { getLocalDateString, safeParseDate } from "./utils";
import { sessionMatchesTopic } from "./cantoUtils";

export type PreparadorPhase = 
  | 'sin_iniciar'          // Tema nuevo sin estudio inicial
  | 'en_refrescos'         // En el ciclo de 3 días de refresco consecutivos
  | 'listo_para_cantar'    // Ha completado los 3 refrescos, esperando cante
  | 'consolidado_mes'      // Cantado recientemente, en ventana de asimilación mensual (< 30 días)
  | 'repaso_pendiente'     // Llegó el plazo de ~30 días: toca repaso mensual
  | 'repaso_vencido';      // Han pasado más de 35 días desde el último cante o repaso

export interface TopicCycleInfo {
  topicId: string;
  phase: PreparadorPhase;
  phaseLabel: string;
  phaseColor: string;
  phaseBadgeClass: string;
  
  // Vueltas oficiales del preparador
  vueltas: number;
  
  // Detalle del ciclo de 3 refrescos
  refrescosCount: number;         // 0, 1, 2, 3 o más
  targetRefrescos: number;        // Siempre 3
  refrescosProgressPct: number;   // 0%, 33%, 66%, 100%
  refrescoDayLabel: string;       // Ej: "Refresco 1/3 (Día 1)", "Refresco 2/3", "Refresco 3/3"
  refrescoDates: string[];        // Fechas en que se hicieron los refrescos
  
  // Fechas clave
  firstStudyDate: string | null;
  lastStudyOrReviewDate: string | null;
  lastCantoDate: string | null;
  lastCantoScore: number | null;
  
  // Repaso mensual (~30 días)
  daysSinceLastCantoOrReview: number;
  nextMonthlyReviewDate: string;
  daysUntilMonthlyReview: number; // Positivo = faltan días, Negativo = días de retraso
  isMonthlyReviewDue: boolean;
  isMonthlyReviewOverdue: boolean;
  // Detección de acción para HOY
  isDueToday: boolean;            // Toca refresco (D1, D2, D3) o repaso mensual hoy/vencido
  isRefreshedToday: boolean;      // Ya ha registrado sesión de refresco hoy
  daysSinceFirstStudy: number | null; // Días de calendario desde estudio inicial

  // Próxima acción según el método de los preparadores
  nextActionTitle: string;
  nextActionDescription: string;
  nextActionType: 'estudio_inicial' | 'refresco' | 'canto' | 'repaso';
}

/**
 * Calcula el estado exacto del tema de acuerdo con el método del preparador:
 * 1. Estudio Inicial (Fijación inicial del tema nuevo)
 * 2. 3 Refrescos en días consecutivos (Leer + cantar hasta dominarlo)
 * 3. Canto (ante preparador o en solitario) -> Culmina la Vuelta 1
 * 4. Repaso mensual (~30 días después) -> Cada ciclo suma Vuelta 2, 3...
 */
export function calculateTopicCycle(
  topicId: string,
  progress: TopicProgressData | undefined,
  sessions: any[] = []
): TopicCycleInfo {
  const todayStr = getLocalDateString();
  const todayDate = new Date(todayStr);

  // Normalización para concordancia infalible y estrictamente aislada por asignatura
  const cleanTarget = String(topicId || "").toLowerCase().trim();
  const parts = cleanTarget.split("-");
  const targetSubject = parts.length > 1 ? parts[0] : "constitucional";
  const numMatch = cleanTarget.match(/\d+/);
  const targetNumber = numMatch ? parseInt(numMatch[0], 10) : undefined;
  const targetTopicObj = {
    id: cleanTarget,
    subjectId: targetSubject,
    number: targetNumber,
  };

  // Filtrar y ordenar sesiones cronológicamente respetando el aislamiento estricto de asignatura
  const topicSessions = (sessions || [])
    .filter((s) => {
      if (!s) return false;
      return sessionMatchesTopic(s, targetTopicObj);
    })
    .sort((a, b) => {
      const dateCmp = (a.date || "").localeCompare(b.date || "");
      if (dateCmp !== 0) return dateCmp;
      const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt || 0);
      const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt || 0);
      return timeA - timeB;
    });

  const estudioSessions = topicSessions.filter(
    (s) => s.type === "estudio_inicial" || s.type === "primer_estudio"
  );
  const cantosSessions = topicSessions.filter((s) => s.type === "canto" || s.type === "simulacro");
  const repasosSessions = topicSessions.filter((s) => s.type === "repaso");
  const refrescosSessions = topicSessions.filter((s) => s.type === "refresco");

  const hasInitialStudy = estudioSessions.length > 0 || !!progress?.firstStudyDate;
  const firstStudyDate = estudioSessions[0]?.date || progress?.firstStudyDate || null;

  // Encontrar el último hito mayor (último cante o último repaso general)
  const lastCanto = cantosSessions[cantosSessions.length - 1] || null;
  const lastCantoDate = lastCanto?.date || null;
  const lastCantoScore = lastCanto?.cantoGrade ?? (lastCanto as any)?.score ?? null;

  const lastRepaso = repasosSessions[repasosSessions.length - 1] || null;
  const lastRepasoDate = lastRepaso?.date || null;

  // Fecha del último anclaje mayor (para el cómputo del mes de repaso)
  let lastMajorAnchorDate = lastCantoDate;
  if (lastRepasoDate && (!lastMajorAnchorDate || lastRepasoDate > lastMajorAnchorDate)) {
    lastMajorAnchorDate = lastRepasoDate;
  }
  if (!lastMajorAnchorDate && firstStudyDate) {
    lastMajorAnchorDate = firstStudyDate;
  }

  // Refrescos pertenecientes al ciclo actual (posteriores al último cante o estudio inicial)
  let currentCycleRefrescos: any[] = [];
  if (lastCantoDate) {
    // Si ya se ha cantado, los refrescos del ciclo actual son los posteriores al cante
    currentCycleRefrescos = refrescosSessions.filter((s) => s.date >= lastCantoDate);
  } else if (firstStudyDate) {
    // Si aún no se ha cantado, todos los refrescos hechos tras el estudio inicial
    currentCycleRefrescos = refrescosSessions.filter((s) => s.date >= firstStudyDate);
  } else {
    currentCycleRefrescos = refrescosSessions;
  }

  const refrescosCount = currentCycleRefrescos.length;
  const refrescoDates = currentCycleRefrescos.map((s) => s.date);
  const refrescosProgressPct = Math.min(100, Math.round((refrescosCount / 3) * 100));

  // Cómputo de vueltas según el preparador:
  // - Si no se ha cantado nunca: 0 vueltas completadas (en asimilación).
  // - Si se cantó la 1ª vez: Vuelta 1.
  // - Cada repaso posterior (o cante posterior) suma a las vueltas.
  let computedVueltas = 0;
  if (cantosSessions.length > 0) {
    // 1 vuelta por el primer cante + repasos posteriores
    computedVueltas = 1 + repasosSessions.filter(r => lastCantoDate && r.date > cantosSessions[0].date).length;
    // O si en progress se fijó explícitamente una vuelta superior, respetarla
    if (progress?.vueltas && progress.vueltas > computedVueltas) {
      computedVueltas = progress.vueltas;
    }
  } else if (progress?.vueltas && progress.vueltas > 0) {
    computedVueltas = progress.vueltas;
  }

  // Cómputo de días transcurridos desde el último cante o repaso
  let daysSinceLastCantoOrReview = 0;
  if (lastMajorAnchorDate) {
    const anchorDateObj = new Date(lastMajorAnchorDate);
    const diffMs = todayDate.getTime() - anchorDateObj.getTime();
    daysSinceLastCantoOrReview = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  }

  // Intervalo mensual objetivo: 30 días (con modulación por dificultad si existe)
  const topicDifficulty = progress?.difficulty || 5;
  let monthlyIntervalDays = 30;
  if (topicDifficulty >= 8) {
    monthlyIntervalDays = 25; // Los muy difíciles se repasan un poco antes
  } else if (topicDifficulty <= 3) {
    monthlyIntervalDays = 35; // Los muy fluidos se espacian a 35 días
  }

  // Próxima fecha de repaso mensual estimada
  let nextMonthlyReviewDate = progress?.nextReviewDate || todayStr;
  if (lastMajorAnchorDate) {
    const nextDateObj = new Date(lastMajorAnchorDate);
    nextDateObj.setDate(nextDateObj.getDate() + monthlyIntervalDays);
    nextMonthlyReviewDate = getLocalDateString(nextDateObj);
  }

  const nextDateParsed = new Date(nextMonthlyReviewDate);
  const daysUntilMonthlyReview = Math.ceil(
    (nextDateParsed.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  const isMonthlyReviewDue = daysUntilMonthlyReview <= 0;
  const isMonthlyReviewOverdue = daysUntilMonthlyReview <= -5; // Más de 5 días de retraso sobre los 30

  // Días transcurridos desde el primer estudio
  const daysSinceFirstStudy = firstStudyDate
    ? Math.max(0, Math.floor((todayDate.getTime() - safeParseDate(firstStudyDate).getTime()) / (1000 * 60 * 60 * 24)))
    : null;

  // Determinación de la fase actual del método del preparador
  let phase: PreparadorPhase = 'sin_iniciar';
  let phaseLabel = 'Sin Iniciar';
  let phaseColor = 'text-slate-400';
  let phaseBadgeClass = 'bg-slate-100 text-slate-600 border-slate-200';
  let nextActionTitle = 'Estudio Inicial';
  let nextActionDescription = 'Fijar el tema por primera vez con lectura analítica y estructuración.';
  let nextActionType: 'estudio_inicial' | 'refresco' | 'canto' | 'repaso' = 'estudio_inicial';

  if (!hasInitialStudy) {
    phase = 'sin_iniciar';
    phaseLabel = 'Pendiente Estudio Inicial';
    phaseColor = 'text-slate-500';
    phaseBadgeClass = 'bg-slate-100 text-slate-700 border-slate-200';
    nextActionTitle = 'Comenzar Estudio Inicial';
    nextActionDescription = 'Dedica una sesión intensiva a memorizar y asimilar los epígrafes principales.';
    nextActionType = 'estudio_inicial';
  } else if (cantosSessions.length === 0 && computedVueltas === 0) {
    // REGLA SUPREMA: Cada tema nuevo debe ser refrescado en los 3 días siguientes (no 3 veces, sino días: D+1, D+2, D+3)
    if (daysSinceFirstStudy === 0) {
      phase = 'en_refrescos';
      phaseLabel = 'Estudiado Hoy (D0)';
      phaseColor = 'text-blue-600';
      phaseBadgeClass = 'bg-blue-50 text-blue-800 border-blue-200/80 font-bold';
      nextActionTitle = 'Refresco Día 1 Mañana';
      nextActionDescription = 'Tema fijado hoy. Mañana toca el 1er día de refresco para asentar la huella sináptica.';
      nextActionType = 'refresco';
    } else if (daysSinceFirstStudy !== null && daysSinceFirstStudy >= 1 && daysSinceFirstStudy <= 3) {
      phase = 'en_refrescos';
      phaseLabel = `Refresco D${daysSinceFirstStudy} (HOY)`;
      phaseColor = 'text-amber-600';
      phaseBadgeClass = 'bg-amber-50 text-amber-800 border-amber-300 font-black animate-pulse shadow-xs';
      nextActionTitle = `Refresco Día ${daysSinceFirstStudy} de 3 (Toca HOY)`;
      nextActionDescription = `Día ${daysSinceFirstStudy} de 3 tras el estudio nuevo: lectura ágil y evocación activa obligatoria hoy.`;
      nextActionType = 'refresco';
    } else {
      phase = 'listo_para_cantar';
      phaseLabel = 'Listo para Cantar';
      phaseColor = 'text-fuchsia-600';
      phaseBadgeClass = 'bg-fuchsia-50 text-fuchsia-800 border-fuchsia-200/80 font-black';
      nextActionTitle = 'Cantar al Preparador';
      nextActionDescription = 'Han transcurrido los 3 días de refresco consecutivos. Toca exponer el tema con cronómetro para culminar la Vuelta 1.';
      nextActionType = 'canto';
    }
  } else {
    // Ya ha sido cantado al menos una vez (Vuelta >= 1)
    if (isMonthlyReviewOverdue) {
      phase = 'repaso_vencido';
      phaseLabel = 'Repaso Mensual Vencido';
      phaseColor = 'text-rose-600';
      phaseBadgeClass = 'bg-rose-50 text-rose-800 border-rose-200/80 font-black';
      nextActionTitle = 'Repaso Mensual Urgente';
      nextActionDescription = `Han pasado ${daysSinceLastCantoOrReview} días desde el último cante. Repásalo antes de que caiga la curva del olvido.`;
      nextActionType = 'repaso';
    } else if (isMonthlyReviewDue) {
      phase = 'repaso_pendiente';
      phaseLabel = 'Toca Repaso Mensual';
      phaseColor = 'text-indigo-600';
      phaseBadgeClass = 'bg-indigo-50 text-indigo-800 border-indigo-200/80 font-bold';
      nextActionTitle = 'Repaso Mensual de Vuelta';
      nextActionDescription = 'Cumplido el ciclo de ~30 días. Realiza una vuelta de repaso para afianzar retención.';
      nextActionType = 'repaso';
    } else {
      phase = 'consolidado_mes';
      phaseLabel = `Al Día (${daysUntilMonthlyReview}d)`;
      phaseColor = 'text-emerald-600';
      phaseBadgeClass = 'bg-emerald-50 text-emerald-800 border-emerald-200/80';
      nextActionTitle = `Próximo Repaso en ${daysUntilMonthlyReview} días`;
      nextActionDescription = `Tema fijado en Vuelta ${computedVueltas}. En descanso activo hasta el ${nextMonthlyReviewDate}.`;
      nextActionType = 'repaso';
    }
  }

  let refrescoDayLabel = "";
  if (daysSinceFirstStudy === 0) {
    refrescoDayLabel = "Refresco Mañana (D1)";
  } else if (daysSinceFirstStudy !== null && daysSinceFirstStudy >= 1 && daysSinceFirstStudy <= 3) {
    refrescoDayLabel = `Refresco Día ${daysSinceFirstStudy}/3 (HOY)`;
  } else if (daysSinceFirstStudy !== null && daysSinceFirstStudy > 3) {
    refrescoDayLabel = "3 Días Cumplidos (Listo Canto)";
  } else {
    refrescoDayLabel = `Refresco ${refrescosCount}/3`;
  }

  const isRefreshedToday = sessions.some(
    (s) => s.date === todayStr && (s.type === 'refresco' || s.type === 'repaso')
  );

  const isDueToday =
    (phase === 'en_refrescos' &&
      daysSinceFirstStudy !== null &&
      daysSinceFirstStudy >= 1 &&
      daysSinceFirstStudy <= 3 &&
      !isRefreshedToday) ||
    isMonthlyReviewDue;

  return {
    topicId,
    phase,
    phaseLabel,
    phaseColor,
    phaseBadgeClass,
    vueltas: computedVueltas,
    refrescosCount,
    targetRefrescos: 3,
    refrescosProgressPct,
    refrescoDayLabel,
    refrescoDates,
    firstStudyDate,
    lastStudyOrReviewDate: lastMajorAnchorDate,
    lastCantoDate,
    lastCantoScore,
    daysSinceLastCantoOrReview,
    nextMonthlyReviewDate,
    daysUntilMonthlyReview,
    isMonthlyReviewDue,
    isMonthlyReviewOverdue,
    isDueToday,
    isRefreshedToday,
    daysSinceFirstStudy,
    nextActionTitle,
    nextActionDescription,
    nextActionType,
  };
}
