import { authenticatedFetch } from '../lib/authenticatedApi';
import React, { useState, useMemo, useEffect, useId, useRef } from "react";
import {
  X,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Sparkles,
  Edit2,
  Trash2,
  SlidersHorizontal,
  Layers,
  ArrowRight,
  Database,
  ShieldCheck,
  ShieldAlert,
  Shield,
  Send,
  Copy,
  Plane,
  Check,
  Zap,
  Key,
  Globe,
  Wrench,
  BookOpen,
  Activity,
  Brain,
  Timer,
  TrendingUp,
  BarChart3,
  Flame,
  Award,
  Plus,
  Save
} from "lucide-react";
import { useFirebase } from "../lib/FirebaseProvider";
import { initialSubjects, initialTopics } from "../data/initialData";
import {
  normalizeCategoryToSubjectId,
  parseAeroFocusTopicIdPrefix,
  extractTopicNumber,
} from "../lib/topicResolver";
import { EditSessionDialog } from "./EditSessionDialog";
import { toast } from "sonner";
import { cn } from "../lib/utils";
import { WebhookSyncRecord, WellsprepAnalyticsV2, WebhookResolvedTopic } from "../lib/webhookTypes";
import { simulateAeroFocusFlight } from "../hooks/useAeroFocusSync";
import { useDialogAccessibility } from "../hooks/useDialogAccessibility";
import { parseQuarantineTopicObservation } from "../lib/quarantineTopicInput";
import { sessionDurationMinutes } from "../lib/canonicalTopicService";
import { reportedMetric, reportedNumber, reportedPhaseMinutes, reportedRecords, reportedText } from "../lib/importedAnalyticsPresentation";

interface SyncControlCenterDialogProps {
  onClose: () => void;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}

type ControlCenterTab = "quarantine" | "sessions" | "analytics" | "webhook" | "raw_logs";

export function SyncControlCenterDialog({ onClose, returnFocusRef }: SyncControlCenterDialogProps) {
  const {
    user,
    recentSessions = [],
    userProgress,
    deleteStudySession,
    quickUpdateSessionDifficulty,
    reconcileAllTopicsAndSessions,
    webhookToken,
    quarantinedEvents = [],
    isLoadingQuarantine,
    fetchQuarantinedEvents,
    approveQuarantineEvent,
    approveAllQuarantineEvents,
    discardQuarantineEvent,
    clearAllQuarantine,
    addQuarantineEventManually,
    updateQuarantineEvent,
    updateQuarantineTopic,
    deleteQuarantineTopic,
    addQuarantineTopic,
    mergeQuarantineTopics,
  } = useFirebase();

  const [activeTab, setActiveTab] = useState<ControlCenterTab>("quarantine");
  const [searchQuery, setSearchQuery] = useState("");
  const [subjectFilter, setSubjectFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<"all" | "aerofocus" | "manual">("all");
  const [difficultyFilter, setDifficultyFilter] = useState<"all" | "pending" | "rated">("all");

  // Selected session for full editing
  const [editingSession, setEditingSession] = useState<any | null>(null);

  // Operation states
  const [isReconciling, setIsReconciling] = useState(false);
  const [isTestingWebhook, setIsTestingWebhook] = useState(false);
  const [isApprovingAll, setIsApprovingAll] = useState(false);
  const [isSimulatingFlight, setIsSimulatingFlight] = useState(false);
  const [isPurging, setIsPurging] = useState(false);

  // Manual Paste Modal state
  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
  const [pasteJsonText, setPasteJsonText] = useState("");
  const [isImportingPaste, setIsImportingPaste] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);

  // Dedicated Topic Editor in Quarantine
  const [editingTopicModal, setEditingTopicModal] = useState<{
    eventId: string;
    topicIndex: number;
    topic: WebhookResolvedTopic;
  } | null>(null);

  // Add Topic to Flight state
  const [addingTopicFlightId, setAddingTopicFlightId] = useState<string | null>(null);
  const [addTopicSearch, setAddTopicSearch] = useState("");

  // Topic Reassign state
  const [reassigningItem, setReassigningItem] = useState<{ eventId: string; topicIndex: number } | null>(null);
  const [reassignSearch, setReassignSearch] = useState("");

  // Raw logs state
  const [rawEvents, setRawEvents] = useState<WebhookSyncRecord[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const titleId = useId();
  const pasteTitleId = useId();
  const reassignTitleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const pasteInputRef = useRef<HTMLTextAreaElement>(null);
  const reassignInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useDialogAccessibility<HTMLDivElement>({ onClose, returnFocusRef, initialFocusRef: closeButtonRef });
  const pasteDialogRef = useDialogAccessibility<HTMLDivElement>({ isOpen: isPasteModalOpen, onClose: () => setIsPasteModalOpen(false), initialFocusRef: pasteInputRef, disabled: isImportingPaste });
  const reassignDialogRef = useDialogAccessibility<HTMLDivElement>({ isOpen: !!reassigningItem, onClose: () => setReassigningItem(null), initialFocusRef: reassignInputRef });

  // Fetch raw webhook events
  const fetchLogs = async () => {
    try {
      setIsLoadingLogs(true);
      const res = await authenticatedFetch("/api/webhook/events?limit=30");
      if (res.ok) {
        const data = await res.json();
        setRawEvents(reportedRecords(data.events) as unknown as WebhookSyncRecord[]);
      }
    } catch (e) {
      console.error("Error fetching logs:", e);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  // Global Analytics v2.2.0 state
  const [globalAnalytics, setGlobalAnalytics] = useState<WellsprepAnalyticsV2 | null>(null);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);
  const reportedPages = reportedRecords(globalAnalytics?.pagesPace?.pages);
  const reportedReviews = reportedRecords(globalAnalytics?.memoryDecay?.topPriorityReviewList);

  const fetchAnalytics = async () => {
    try {
      setIsLoadingAnalytics(true);
      const res = await authenticatedFetch("/api/webhook/analytics");
      if (res.ok) {
        const data = await res.json();
        if (data?.analytics) {
          setGlobalAnalytics(data.analytics);
        }
      }
    } catch (e) {
      console.warn("Error fetching analytics:", e);
    } finally {
      setIsLoadingAnalytics(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  useEffect(() => {
    if (activeTab === "raw_logs") {
      fetchLogs();
    } else if (activeTab === "analytics") {
      fetchAnalytics();
    }
  }, [activeTab]);

  // Topic lookup helper: ALWAYS returns official subject and topic name, never 'topic-unknown'
  const getTopicInfo = (topicId: string, fallbackTitle?: string) => {
    const raw = (topicId || "").trim();

    // 1. Exact match in initialTopics
    let base = initialTopics.find((t) => t.id.toLowerCase() === raw.toLowerCase());

    // 2. Prefixed id (e.g. CIV_14, jud-pen-03)
    if (!base) {
      const parsed = parseAeroFocusTopicIdPrefix(raw);
      if (parsed) {
        base = initialTopics.find((t) => t.subjectId === parsed.subjectId && t.number === parsed.number);
      }
    }

    // 3. String subject + number parsing from id or fallback title
    if (!base) {
      const num = extractTopicNumber(raw) || extractTopicNumber(fallbackTitle);
      const sub = normalizeCategoryToSubjectId(raw) || normalizeCategoryToSubjectId(fallbackTitle);
      if (num && sub) {
        base = initialTopics.find((t) => t.subjectId === sub && t.number === num);
      } else if (num) {
        base = initialTopics.find((t) => t.number === num);
      }
    }

    if (base) {
      const sub = initialSubjects.find((s) => s.id === base.subjectId);
      return {
        id: base.id,
        title: base.title,
        number: base.number,
        subjectId: base.subjectId,
        subjectName: sub ? sub.name : base.subjectId,
        subjectColor: sub ? sub.color : "#3B82F6",
      };
    }

    const prog = userProgress[topicId];
    if (prog) {
      const sub = initialSubjects.find((s) => s.id === prog.subjectId);
      return {
        id: topicId,
        title: prog.customTitle || fallbackTitle || "Tema de Estudio",
        number: prog.number || 1,
        subjectId: prog.subjectId || "constitucional",
        subjectName: sub ? sub.name : "Temario",
        subjectColor: sub ? sub.color : "#3B82F6",
      };
    }

    // Graceful fallback: clean up if raw had "topic-unknown"
    const fallbackNum = extractTopicNumber(fallbackTitle) || extractTopicNumber(raw) || 1;
    const fallbackSub = normalizeCategoryToSubjectId(fallbackTitle) || normalizeCategoryToSubjectId(raw) || "constitucional";
    const subObj = initialSubjects.find((s) => s.id === fallbackSub);
    const cleanDisplayTitle =
      fallbackTitle && !fallbackTitle.toLowerCase().includes("unknown")
        ? fallbackTitle
        : `Tema ${fallbackNum}`;

    return {
      id: `${fallbackSub}-${fallbackNum}`,
      title: cleanDisplayTitle,
      number: fallbackNum,
      subjectId: fallbackSub,
      subjectName: subObj ? subObj.name : "Temario Oficial",
      subjectColor: subObj ? subObj.color : "#3B82F6",
    };
  };

  // Metrics computation
  const metrics = useMemo(() => {
    let totalMinutes = 0;
    let aeroCount = 0;
    let pendingDiffCount = 0;

    recentSessions.forEach((s) => {
      const mins = sessionDurationMinutes(s);
      totalMinutes += mins;
      const isAero = s.source === "aerofocus" || s.source === "aerofocus_pro";
      if (isAero) aeroCount++;
      const diff = s.dificultadReal || s.difficulty;
      if (!diff || diff === 0) pendingDiffCount++;
    });

    const totalHours = Math.round((totalMinutes / 60) * 10) / 10;
    return {
      totalSessions: recentSessions.length,
      totalHours,
      aeroCount,
      pendingDiffCount,
    };
  }, [recentSessions]);

  // Filtered sessions for Audit tab
  const filteredSessions = useMemo(() => {
    return recentSessions.filter((s) => {
      const isAero = s.source === "aerofocus" || s.source === "aerofocus_pro";
      if (sourceFilter === "aerofocus" && !isAero) return false;
      if (sourceFilter === "manual" && isAero) return false;

      const diff = s.dificultadReal || s.difficulty;
      const isPending = !diff || diff === 0;
      if (difficultyFilter === "pending" && !isPending) return false;
      if (difficultyFilter === "rated" && isPending) return false;

      const info = getTopicInfo(s.topicId);
      if (subjectFilter !== "all") {
        const baseTopic = initialTopics.find((t) => t.id === s.topicId);
        const prog = userProgress[s.topicId];
        const subId = baseTopic?.subjectId || prog?.subjectId || info.subjectId;
        if (subId !== subjectFilter) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchTitle = info.title.toLowerCase().includes(q);
        const matchNum = String(info.number).includes(q);
        const matchNotes = (s.notes || "").toLowerCase().includes(q);
        const matchSubject = info.subjectName.toLowerCase().includes(q);
        if (!matchTitle && !matchNum && !matchNotes && !matchSubject) return false;
      }

      return true;
    });
  }, [recentSessions, sourceFilter, difficultyFilter, subjectFilter, searchQuery, userProgress]);

  // Handle Master Reconciliation
  const handleReconcile = async () => {
    try {
      setIsReconciling(true);
      await reconcileAllTopicsAndSessions();
      toast.success("Vista actualizada desde las sesiones guardadas.");
    } catch (e: any) {
      console.error(e);
      toast.error("Error al reconciliar: " + (e?.message || e));
    } finally {
      setIsReconciling(false);
    }
  };

  // Quick 1-click clipboard paste importer
  const handleQuickClipboardPaste = async () => {
    try {
      let text = "";
      if (typeof navigator !== "undefined" && navigator?.clipboard?.readText) {
        try {
          text = await navigator.clipboard.readText();
        } catch {
          // Clipboard read restricted
        }
      }
      if (text && text.trim()) {
        const success = await addQuarantineEventManually(text.trim());
        if (success) {
          toast.success("✅ Cierre de AeroFocus importado a cuarentena.");
          setSearchQuery("");
          setSubjectFilter("all");
          setSourceFilter("all");
          setDifficultyFilter("all");
          setActiveTab("quarantine");
          if (fetchQuarantinedEvents) {
            fetchQuarantinedEvents();
          }
          return;
        }
      }
      setPasteJsonText(text || "");
      setIsPasteModalOpen(true);
    } catch {
      setIsPasteModalOpen(true);
    }
  };

  // Handle Webhook Connection Test
  const handleTestWebhook = async () => {
    try {
      setIsTestingWebhook(true);
      // Call lightweight ping first to guarantee zero Vercel serverless crashes
      const res = await authenticatedFetch("/api/webhook/ping", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ isTest: true }),
      });

      let data: any = {};
      try {
        const rawText = await res.text();
        try {
          data = JSON.parse(rawText);
        } catch {
          data = { message: res.ok ? "Enlace verificado" : rawText };
        }
      } catch {
        data = {};
      }

      if (res.ok && (data.success || data.status === "ok" || res.status === 200)) {
        toast.success("✅ Enlace operativo AeroFocus Pro <-> WellsPrep.", {
          description: "La pasarela está lista para recibir transmisiones en tiempo real.",
        });
      } else {
        toast.error("Aviso de enlace: " + (data.error || data.message || `HTTP ${res.status}`));
      }
    } catch (e: any) {
      toast.error("Error al comprobar enlace: " + (e?.message || "Error de red"));
    } finally {
      setIsTestingWebhook(false);
    }
  };

  // Simular un aterrizaje de vuelo completo para verificar la recepción reactiva
  const handleSimulateFlight = async () => {
    try {
      setIsSimulatingFlight(true);
      const res = await simulateAeroFocusFlight(1);
      if (res.success) {
        toast.success(res.message, {
          description: "La sesión ha aterrizado en la Bandeja de Cuarentena.",
        });
        setActiveTab("quarantine");
      } else {
        toast.error("Error al simular vuelo: " + res.message);
      }
    } catch (e: any) {
      toast.error("Error: " + (e?.message || e));
    } finally {
      setIsSimulatingFlight(false);
    }
  };

  // Approve all sessions in quarantine at once
  const handleApproveAll = async () => {
    if (quarantinedEvents.length === 0) return;
    if (
      !confirm(
        `¿Deseas aprobar e incorporar las ${quarantinedEvents.length} sesiones de cuarentena a tu expediente oficial con sus temas y horas calculadas?`
      )
    ) {
      return;
    }
    try {
      setIsApprovingAll(true);
      await approveAllQuarantineEvents();
      toast.success("✅ Todas las sesiones han sido incorporadas al expediente.");
    } catch (e: any) {
      toast.error("Error al aprobar en lote: " + (e?.message || e));
    } finally {
      setIsApprovingAll(false);
    }
  };

  // Set difficulty for all topics of a flight
  const handleSetFlightDifficulty = (eventId: string, diff: number) => {
    const evt = quarantinedEvents.find((e) => e.id === eventId);
    if (!evt || !evt.topics) return;
    const updatedTopics = evt.topics.map((t) => ({
      ...t,
      difficulty: diff,
      dificultadReal: diff,
    }));
    updateQuarantineEvent(eventId, { topics: updatedTopics });
    toast.success(`Dificultad ${diff}/10 aplicada a todos los temas del vuelo.`);
  };

  // Set completesVuelta for all topics of a flight
  const handleSetFlightVuelta = (eventId: string, completes: boolean) => {
    const evt = quarantinedEvents.find((e) => e.id === eventId);
    if (!evt || !evt.topics) return;
    const updatedTopics = evt.topics.map((t) => ({
      ...t,
      completesVuelta: completes,
    }));
    updateQuarantineEvent(eventId, { topics: updatedTopics });
    toast.success(
      completes
        ? "Todos los temas marcados como vuelta completada."
        : "Todos los temas marcados como repaso parcial."
    );
  };

  // Manual Paste Importer handler
  const handleImportPaste = async () => {
    if (!pasteJsonText.trim()) {
      toast.error("Por favor, pega el contenido JSON o reporte de AeroFocus.");
      return;
    }
    try {
      setIsImportingPaste(true);
      const success = await addQuarantineEventManually(pasteJsonText.trim());
      if (success) {
        toast.success("✅ Cierre importado y depositado en cuarentena.");
        setIsPasteModalOpen(false);
        setPasteJsonText("");
        setSearchQuery("");
        setSubjectFilter("all");
        setSourceFilter("all");
        setDifficultyFilter("all");
        setActiveTab("quarantine");
        if (fetchQuarantinedEvents) {
          fetchQuarantinedEvents();
        }
      }
    } catch (e: any) {
      toast.error("Error al procesar el texto: " + e.message);
    } finally {
      setIsImportingPaste(false);
    }
  };

  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/webhook/aerofocus`
      : "https://wellsprep-ltii.vercel.app/api/webhook/aerofocus";

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-0 sm:p-4 md:p-6 overflow-hidden">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="bg-white rounded-none sm:rounded-3xl shadow-2xl border-0 sm:border border-slate-200/80 w-full max-w-5xl h-[100dvh] sm:h-[92dvh] max-h-[100dvh] sm:max-h-[850px] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* TOP HEADER */}
        <div className="px-3.5 py-2.5 sm:px-6 sm:py-3.5 border-b border-slate-100 bg-white flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-xs shrink-0">
              <SlidersHorizontal size={16} strokeWidth={2.2} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 id={titleId} className="text-base sm:text-lg font-bold text-slate-900 tracking-tight font-serif">
                  Centro de Control · AeroFocus
                </h2>
              </div>
              <p className="hidden sm:block text-xs text-slate-500 mt-0.5 truncate">
                Revisa importaciones y sesiones antes de incorporarlas al historial.
              </p>
            </div>
          </div>

          {/* Top Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              onClick={handleReconcile}
              disabled={isReconciling}
              className="px-2.5 sm:px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 transition-colors flex items-center gap-1 disabled:opacity-50"
              title="Actualizar la vista desde las sesiones guardadas"
            >
              <RefreshCw size={12} className={cn(isReconciling && "animate-spin text-slate-600")} />
              <span className="hidden sm:inline">{isReconciling ? "Actualizando..." : "Actualizar vista"}</span>
              <span className="sm:hidden">{isReconciling ? "..." : "Actualizar"}</span>
            </button>

            <button
              ref={closeButtonRef}
              type="button"
              aria-label="Cerrar centro de sincronización"
              onClick={onClose}
              className="w-11 h-11 rounded-full flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors shrink-0"
              title="Cerrar panel"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* STATS STRIP (Compact single line on mobile, full grid on desktop) */}
        <div className="hidden sm:grid sm:grid-cols-4 gap-2 px-6 py-3 bg-slate-50/70 border-b border-slate-100 shrink-0">
          <div className="px-3.5 py-2 rounded-xl bg-white border border-slate-200/60 shadow-2xs">
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider truncate">Sesiones Totales</div>
            <div className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-0.5">
              {metrics.totalSessions}
            </div>
          </div>

          <div className="px-3.5 py-2 rounded-xl bg-white border border-slate-200/60 shadow-2xs">
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider truncate">Tiempo registrado</div>
            <div className="text-lg font-bold font-mono tabular-nums text-blue-600 mt-0.5">
              {metrics.totalHours} <span className="text-xs font-normal text-slate-400 font-sans">h netas</span>
            </div>
          </div>

          <div className="px-3.5 py-2 rounded-xl bg-white border border-slate-200/60 shadow-2xs">
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider truncate">Vía AeroFocus</div>
            <div className="text-lg font-bold font-mono tabular-nums text-indigo-600 mt-0.5 flex items-center gap-1">
              {metrics.aeroCount}
              <Sparkles size={12} className="text-indigo-400" />
            </div>
          </div>

          <div className="px-3.5 py-2 rounded-xl bg-amber-50/60 border border-amber-200/70 shadow-2xs">
            <div className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider truncate">Dificultad Pendiente</div>
            <div className="text-lg font-bold font-mono tabular-nums text-amber-900 mt-0.5 flex items-center justify-between gap-1">
              <span>{metrics.pendingDiffCount}</span>
              {metrics.pendingDiffCount > 0 && (
                <span className="text-[10px] font-semibold text-amber-700 bg-amber-100/90 px-1.5 py-0.2 rounded-full">
                  Evaluar
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Mobile ultra-compact stats strip to leave 85% screen height to content */}
        <div className="sm:hidden flex items-center justify-between gap-1.5 px-3 py-1.5 bg-slate-50/90 border-b border-slate-100 shrink-0 text-[11px]">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
            <span className="font-mono font-bold text-slate-900">{metrics.totalSessions} ses.</span>
            <span className="text-slate-300">·</span>
            <span className="font-mono font-bold text-blue-600">{metrics.totalHours}h netas</span>
            <span className="text-slate-300">·</span>
            <span className="font-mono font-bold text-indigo-600 flex items-center gap-0.5">
              {metrics.aeroCount} <Sparkles size={10} className="text-indigo-400" />
            </span>
          </div>
          {metrics.pendingDiffCount > 0 && (
            <span className="font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded-md text-[10px] shrink-0">
              {metrics.pendingDiffCount} por calificar
            </span>
          )}
        </div>

        {/* ELEGANT NAVIGATION TABS (Horizontally scrollable on mobile) */}
        <div className="flex items-center justify-between border-b border-slate-200 px-3 sm:px-6 bg-white shrink-0 overflow-x-auto no-scrollbar">
          <div className="flex gap-1 sm:gap-2">
            <button
              onClick={() => setActiveTab("quarantine")}
              className={cn(
                "py-2.5 sm:py-3 px-3 sm:px-4 text-xs font-bold tracking-tight border-b-2 transition-all flex items-center gap-1.5 sm:gap-2 whitespace-nowrap",
                activeTab === "quarantine"
                  ? "border-amber-600 text-amber-900"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              )}
            >
              <ShieldAlert size={14} className={activeTab === "quarantine" ? "text-amber-600" : "text-slate-400"} />
              <span>Bandeja Cuarentena</span>
              {quarantinedEvents.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 font-mono">
                  {quarantinedEvents.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab("sessions")}
              className={cn(
                "py-2.5 sm:py-3 px-3 sm:px-4 text-xs font-bold tracking-tight border-b-2 transition-all flex items-center gap-1.5 sm:gap-2 whitespace-nowrap",
                activeTab === "sessions"
                  ? "border-slate-900 text-slate-900"
                  : "border-transparent text-slate-400 hover:text-slate-700"
              )}
            >
              <Layers size={14} />
              <span>Auditoría ({filteredSessions.length})</span>
            </button>

            <button
              onClick={() => setActiveTab("analytics")}
              className={cn(
                "py-2.5 sm:py-3 px-3 sm:px-4 text-xs font-bold tracking-tight border-b-2 transition-all flex items-center gap-1.5 sm:gap-2 whitespace-nowrap",
                activeTab === "analytics"
                  ? "border-purple-600 text-purple-900"
                  : "border-transparent text-slate-400 hover:text-slate-700"
              )}
            >
              <Brain size={14} className={activeTab === "analytics" ? "text-purple-600" : "text-slate-400"} />
              <span>Analítica</span>
              {globalAnalytics && (
                <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
              )}
            </button>

            <button
              onClick={() => setActiveTab("webhook")}
              className={cn(
                "py-2.5 sm:py-3 px-3 sm:px-4 text-xs font-bold tracking-tight border-b-2 transition-all flex items-center gap-1.5 sm:gap-2 whitespace-nowrap",
                activeTab === "webhook"
                  ? "border-indigo-600 text-indigo-900"
                  : "border-transparent text-slate-400 hover:text-slate-700"
              )}
            >
              <Zap size={14} className={activeTab === "webhook" ? "text-indigo-600" : "text-slate-400"} />
              <span>Webhook</span>
            </button>

            <button
              onClick={() => setActiveTab("raw_logs")}
              className={cn(
                "py-2.5 sm:py-3 px-3 sm:px-4 text-xs font-bold tracking-tight border-b-2 transition-all flex items-center gap-1.5 sm:gap-2 whitespace-nowrap",
                activeTab === "raw_logs"
                  ? "border-slate-900 text-slate-900"
                  : "border-transparent text-slate-400 hover:text-slate-700"
              )}
            >
              <Database size={14} />
              <span>Logs ({rawEvents.length})</span>
            </button>
          </div>

          {/* Quick Header Short-cut */}
          {activeTab === "quarantine" && quarantinedEvents.length > 0 && (
            <button
              onClick={handleApproveAll}
              disabled={isApprovingAll}
              className="my-1 px-3 py-1 sm:py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors flex items-center gap-1 disabled:opacity-50 whitespace-nowrap shrink-0 ml-2"
            >
              <CheckCircle2 size={12} className={cn(isApprovingAll && "animate-spin")} />
              <span>{isApprovingAll ? "..." : `Aprobar Todo (${quarantinedEvents.length})`}</span>
            </button>
          )}
        </div>

        {/* TAB 1: BANDEJA DE CUARENTENA */}
        {activeTab === "quarantine" && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-slate-50/50">
            {/* Top action bar (compact, single line with horizontal scroll on mobile) */}
            <div className="px-3 sm:px-6 py-2 sm:py-2.5 bg-white border-b border-slate-200/60 flex items-center justify-between gap-2 shrink-0 overflow-x-auto no-scrollbar">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 whitespace-nowrap shrink-0">
                <span>
                  {quarantinedEvents.length === 0
                    ? "Bandeja vacía"
                    : `${quarantinedEvents.length} vuelo${quarantinedEvents.length > 1 ? "s" : ""}`}
                </span>
                <span className="hidden sm:inline text-slate-300">·</span>
                <span className="hidden sm:inline text-xs font-normal text-slate-500">
                  Valida dificultad y vueltas antes de incorporar.
                </span>
              </div>

              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                <button
                  onClick={handleQuickClipboardPaste}
                  className="px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/60 transition-colors flex items-center gap-1 whitespace-nowrap"
                  title="Importar automáticamente el cierre copiado al portapapeles"
                >
                  <Send size={11} className="text-indigo-600" />
                  <span>Pegar Portapapeles</span>
                </button>

                <button
                  onClick={() => setIsPasteModalOpen(true)}
                  className="px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl text-xs font-semibold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 transition-colors flex items-center gap-1 whitespace-nowrap"
                >
                  <Edit2 size={11} className="text-slate-500" />
                  <span>Manual</span>
                </button>

                <button
                  onClick={handleTestWebhook}
                  disabled={isTestingWebhook}
                  className="px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl text-xs font-semibold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 transition-colors flex items-center gap-1 whitespace-nowrap"
                  title="Comprobar enlace ping"
                >
                  <ShieldCheck size={11} className="text-emerald-600" />
                  <span>{isTestingWebhook ? "..." : "Ping"}</span>
                </button>

                <button
                  onClick={() => fetchQuarantinedEvents()}
                  disabled={isLoadingQuarantine}
                  aria-label="Actualizar importaciones pendientes"
                  className="p-1 sm:p-1.5 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-slate-200 transition-colors shrink-0"
                  title="Refrescar lista"
                >
                  <RefreshCw size={12} className={cn(isLoadingQuarantine && "animate-spin")} />
                </button>

                {quarantinedEvents.length > 0 && (
                  <button
                    onClick={() => {
                      if (confirm("¿Deseas vaciar todos los registros retenidos en cuarentena?")) {
                        clearAllQuarantine();
                      }
                    }}
                    className="p-1 sm:p-1.5 rounded-xl text-rose-600 hover:bg-rose-50 border border-rose-200 transition-colors shrink-0"
                    title="Vaciar toda la cuarentena"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            </div>

            {/* Quarantine Cards Container */}
            <div className="flex-1 p-3 sm:p-6 overflow-y-auto overscroll-contain -webkit-overflow-scrolling-touch min-h-0 pb-24 sm:pb-6">
              {quarantinedEvents.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 max-w-md mx-auto">
                  <div className="w-14 h-14 rounded-3xl bg-slate-100 text-slate-500 flex items-center justify-center mb-4">
                    <ShieldCheck size={28} className="text-emerald-600" />
                  </div>
                  <h3 className="text-base font-bold text-slate-900 font-serif">
                    Bandeja de Cuarentena al Día
                  </h3>
                  <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                    No hay sesiones retenidas pendientes. Cuando termines un bloque en AeroFocus Pro, los minutos y temas aparecerán aquí automáticamente para su validación previa.
                  </p>

                  <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
                    <button
                      onClick={handleQuickClipboardPaste}
                      className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 transition-colors flex items-center gap-1.5 shadow-xs"
                    >
                      <Send size={12} />
                      <span>Pegar Cierre (Portapapeles)</span>
                    </button>
                    <button
                      onClick={handleSimulateFlight}
                      disabled={isSimulatingFlight}
                      className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 transition-colors flex items-center gap-1.5"
                    >
                      <Plane size={12} className={cn(isSimulatingFlight && "animate-bounce")} />
                      <span>{isSimulatingFlight ? "Aterrizando..." : "Simular Vuelo de Prueba"}</span>
                    </button>
                    <button
                      onClick={() => setActiveTab("webhook")}
                      className="px-4 py-2 rounded-xl text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/60 transition-colors flex items-center gap-1.5"
                    >
                      <Key size={12} />
                      <span>Ver Credenciales Webhook</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-5 max-w-4xl mx-auto">
                  {quarantinedEvents.map((evt) => {
                    // Check for duplicate topics within this transmission (split reviews)
                    const topicFrequency = new Map<string, number[]>();
                    (evt.topics || []).forEach((t, index) => {
                      const tid = t.resolvedTopicId;
                      if (tid) {
                        const existing = topicFrequency.get(tid) || [];
                        existing.push(index);
                        topicFrequency.set(tid, existing);
                      }
                    });

                    const duplicateEntries = Array.from(topicFrequency.entries()).filter(
                      ([_, indices]) => indices.length > 1
                    );

                    const totalMins =
                      evt.totalFlightEffectiveMinutes ||
                      Math.round((evt.totalFlightEffectiveHours || 0) * 60) ||
                      (evt.topics || []).reduce((acc, t) => acc + (t.effectiveMinutes || 0), 0);
                    const totalHours = (totalMins / 60).toFixed(1);

                    return (
                      <div
                        key={evt.id}
                        className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden transition-all hover:border-slate-300"
                      >
                        {/* FLIGHT CARD HEADER */}
                        <div className="px-5 py-3.5 bg-slate-50/80 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-xs font-bold text-slate-800 bg-slate-200/70 px-2.5 py-0.5 rounded-lg">
                              Vuelo #{evt.flightId || evt.id.slice(-6)}
                            </span>
                            <span className="text-slate-300">·</span>
                            <span className="text-xs text-slate-500 flex items-center gap-1">
                              <Clock size={12} />
                              {evt.date || "Hoy"}
                            </span>
                            <span className="text-slate-300">·</span>
                            <span className="text-xs font-bold font-mono text-slate-900">
                              {totalHours} h netas ({totalMins} min)
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 sm:gap-2">
                            <button
                              onClick={() => {
                                setAddingTopicFlightId(evt.id);
                                setAddTopicSearch("");
                              }}
                              className="px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/60 transition-colors flex items-center gap-1"
                              title="Añadir un tema estudiado a este vuelo"
                            >
                              <Plus size={12} />
                              <span>+ Tema</span>
                            </button>

                            <button
                              onClick={() => discardQuarantineEvent(evt.id)}
                              className="px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-700 bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-200 transition-colors flex items-center gap-1"
                              title="Descartar este vuelo"
                            >
                              <Trash2 size={12} />
                              <span className="hidden sm:inline">Descartar</span>
                            </button>

                            <button
                              onClick={() => approveQuarantineEvent(evt.id)}
                              className="px-3 sm:px-4 py-1.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-xs transition-colors flex items-center gap-1.5"
                            >
                              <CheckCircle2 size={13} />
                              <span>Aprobar Vuelo</span>
                            </button>
                          </div>
                        </div>

                        {/* FLIGHT PRESETS BAR */}
                        <div className="px-5 py-2.5 bg-slate-50/40 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2.5 text-[11px]">
                          <div className="flex flex-wrap items-center gap-2 text-slate-600">
                            <span className="font-semibold text-slate-500">Calificar todo:</span>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleSetFlightDifficulty(evt.id, 3)}
                                className="px-2 py-0.5 rounded-md bg-white hover:bg-emerald-50 text-emerald-800 border border-slate-200 font-bold text-[10px] transition-colors"
                              >
                                Fácil (3)
                              </button>
                              <button
                                onClick={() => handleSetFlightDifficulty(evt.id, 5)}
                                className="px-2 py-0.5 rounded-md bg-white hover:bg-blue-50 text-blue-800 border border-slate-200 font-bold text-[10px] transition-colors"
                              >
                                Media (5)
                              </button>
                              <button
                                onClick={() => handleSetFlightDifficulty(evt.id, 8)}
                                className="px-2 py-0.5 rounded-md bg-white hover:bg-amber-50 text-amber-800 border border-slate-200 font-bold text-[10px] transition-colors"
                              >
                                Difícil (8)
                              </button>
                              <button
                                onClick={() => handleSetFlightDifficulty(evt.id, 10)}
                                className="px-2 py-0.5 rounded-md bg-white hover:bg-rose-50 text-rose-800 border border-slate-200 font-bold text-[10px] transition-colors"
                              >
                                Extrema (10)
                              </button>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-slate-400">Vueltas:</span>
                            <button
                              onClick={() => handleSetFlightVuelta(evt.id, true)}
                              className="px-2 py-0.5 rounded-md bg-white hover:bg-emerald-50 text-emerald-800 border border-slate-200 font-bold text-[10px] transition-colors"
                            >
                              ✓ Suma vuelta oficial
                            </button>
                            <button
                              onClick={() => handleSetFlightVuelta(evt.id, false)}
                              className="px-2 py-0.5 rounded-md bg-white hover:bg-amber-50 text-amber-800 border border-slate-200 font-bold text-[10px] transition-colors"
                            >
                              ⚠️ Repaso parcial
                            </button>
                          </div>
                        </div>

                        {/* SPLIT MERGE BANNER */}
                        {duplicateEntries.length > 0 && (
                          <div className="px-5 py-2.5 bg-indigo-50/70 border-b border-indigo-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                            <span className="text-indigo-900 font-semibold">
                              Se han detectado {duplicateEntries.length} temas con repasos divididos en partes.
                            </span>
                            <div className="flex items-center gap-2">
                              {duplicateEntries.map(([tid, indices]) => {
                                const tInfo = getTopicInfo(tid);
                                return (
                                  <button
                                    key={tid}
                                    onClick={() => mergeQuarantineTopics(evt.id, indices[0], indices[1])}
                                    className="px-2.5 py-1 rounded-lg text-xs font-bold text-indigo-700 bg-white border border-indigo-200 hover:bg-indigo-50 transition-colors flex items-center gap-1 shadow-2xs"
                                  >
                                    <Sparkles size={11} className="text-indigo-600" />
                                    <span>Fusionar {tInfo.title} ({indices.length} partes)</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* TOPICS IN FLIGHT */}
                        <div className="p-4 space-y-3">
                          {(evt.topics || []).map((t, idx) => {
                            const info = getTopicInfo(t.resolvedTopicId, t.resolvedTopicTitle);
                            const durationMins = [t.effectiveMinutes, Number(t.effectiveHours) * 60]
                              .find(value => typeof value === 'number' && Number.isFinite(value) && value > 0) ?? null;
                            const currentDiff =
                              t.dificultadReal !== undefined ? t.dificultadReal : t.difficulty;
                            const canCompleteVuelta = ['repaso', 'canto', 'cante', 'simulacro'].includes(t.modality);
                            const completesVuelta = canCompleteVuelta && t.completesVuelta === true;

                            return (
                              <div
                                key={idx}
                                className="p-3.5 rounded-xl bg-slate-50/60 border border-slate-200/80 hover:bg-white hover:border-slate-300 transition-all flex flex-col gap-3"
                              >
                                {/* Row 1: Official Subject, Title and Reassign Button */}
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <span
                                      className="w-2.5 h-2.5 rounded-full shrink-0"
                                      style={{ backgroundColor: info.subjectColor }}
                                      title={info.subjectName}
                                    />
                                    <span className="text-xs font-semibold text-slate-500 shrink-0">
                                      {info.subjectName}
                                    </span>
                                    <span className="text-xs font-bold text-slate-900 truncate">
                                      Tema {info.number}: {info.title}
                                    </span>
                                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-md bg-slate-200/80 text-slate-700 shrink-0">
                                      {t.modality || "repaso"}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <button
                                      onClick={() => {
                                        setEditingTopicModal({
                                          eventId: evt.id,
                                          topicIndex: idx,
                                          topic: { ...t },
                                        });
                                      }}
                                      className="px-2 py-1 rounded-lg text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 transition-colors flex items-center gap-1 shadow-2xs"
                                      title="Editar todos los campos de este tema"
                                    >
                                      <Edit2 size={11} className="text-slate-500" />
                                      <span>Editar</span>
                                    </button>

                                    <button
                                      onClick={() => {
                                        setReassigningItem({ eventId: evt.id, topicIndex: idx });
                                        setReassignSearch("");
                                      }}
                                      className="px-2 py-1 rounded-lg text-xs font-medium text-slate-600 bg-white hover:bg-slate-100 border border-slate-200 transition-colors flex items-center gap-1"
                                      title="Reasignar a otro tema del temario oficial"
                                    >
                                      <BookOpen size={11} className="text-slate-400" />
                                      <span className="hidden sm:inline">Cambiar tema</span>
                                    </button>

                                    <button
                                      onClick={() => {
                                        deleteQuarantineTopic(evt.id, idx);
                                        toast.info(`Tema retirado del vuelo.`);
                                      }}
                                      className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 transition-colors"
                                      title="Eliminar solo este tema del vuelo"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                </div>

                                {/* Row 2: Duration, Difficulty rating (1-10) and Vuelta Toggle */}
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 pt-2 border-t border-slate-100 text-xs">
                                  <div className="flex items-center justify-between sm:justify-start gap-4">
                                    {/* Duration Stepper */}
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-slate-400 font-medium text-[11px] uppercase tracking-wider">Tiempo:</span>
                                      <div className="flex items-center gap-1">
                                        <button
                                          type="button"
                                          aria-label={`Restar cinco minutos al tema ${info.number}`}
                                          disabled={durationMins === null || durationMins <= 5}
                                          onClick={() => {
                                            if (durationMins !== null && durationMins > 5) updateQuarantineTopic(evt.id, idx, { effectiveMinutes: durationMins - 5, effectiveHours: (durationMins - 5) / 60 });
                                          }}
                                          className="w-11 h-11 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 active:scale-95 text-slate-700 flex items-center justify-center font-bold text-sm disabled:opacity-40"
                                        >
                                          -
                                        </button>
                                        <span className="font-mono font-bold text-slate-900 px-1.5 tabular-nums text-xs">
                                          {durationMins === null ? 'Sin tiempo' : `${durationMins} min`}
                                        </span>
                                        <button
                                          type="button"
                                          aria-label={`Añadir cinco minutos al tema ${info.number}`}
                                          disabled={durationMins === null || durationMins > 1435}
                                          onClick={() => {
                                            if (durationMins !== null && durationMins <= 1435) updateQuarantineTopic(evt.id, idx, { effectiveMinutes: durationMins + 5, effectiveHours: (durationMins + 5) / 60 });
                                          }}
                                          className="w-11 h-11 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 active:scale-95 text-slate-700 flex items-center justify-center font-bold text-sm disabled:opacity-40"
                                        >
                                          +
                                        </button>
                                      </div>
                                    </div>

                                    {/* Vuelta Checkbox */}
                                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                                      <input
                                        type="checkbox"
                                        disabled={!canCompleteVuelta}
                                        checked={completesVuelta}
                                        onChange={(e) =>
                                          updateQuarantineTopic(evt.id, idx, {
                                            completesVuelta: e.target.checked,
                                          })
                                        }
                                        className="rounded text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5"
                                      />
                                      <span className={cn("text-[11px] font-semibold", completesVuelta ? "text-emerald-700" : "text-slate-500")}>
                                        {completesVuelta ? "Vuelta completa" : canCompleteVuelta ? "Vuelta sin completar" : 'No suma vuelta'}
                                      </span>
                                    </label>
                                  </div>

                                  {/* Difficulty 1-10 Chips */}
                                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                                    <span className="text-slate-400 font-medium text-[11px] uppercase tracking-wider shrink-0">Dif:</span>
                                    <div className="flex items-center gap-1 shrink-0">
                                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => {
                                        const isSelected = currentDiff === num;
                                        return (
                                          <button
                                            key={num}
                                            type="button"
                                            aria-label={`Dificultad ${num} de 10 para el tema ${info.number}`}
                                            aria-pressed={isSelected}
                                            onClick={() =>
                                              updateQuarantineTopic(evt.id, idx, {
                                                difficulty: num,
                                                dificultadReal: num,
                                              })
                                            }
                                            className={cn(
                                              "w-11 h-11 rounded-lg text-sm font-bold font-mono transition-colors flex items-center justify-center shrink-0",
                                              isSelected
                                                ? "bg-slate-900 text-white shadow-2xs"
                                                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                                            )}
                                          >
                                            {num}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </div>

                                {/* Row 3: PLSEMA Cognitive Phases and Pages Pace (v2.2.0) */}
                                {(t.plsema || t.minutesPerPage || t.pagesCount || (evt.pageBreakdown && evt.pageBreakdown.length > 0)) && (
                                  <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      {t.minutesPerPage != null && t.minutesPerPage > 0 && (
                                        <span className="px-2 py-0.5 rounded-md font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/60 flex items-center gap-1">
                                          <Timer size={10} />
                                          <span>{t.minutesPerPage.toFixed(1)} min/pág</span>
                                        </span>
                                      )}
                                      {(t.pagesText || t.pagesCount) && (
                                        <span className="px-2 py-0.5 rounded-md font-mono bg-slate-100 text-slate-700 border border-slate-200/60">
                                          📖 {t.pagesText || `${t.pagesCount} págs`}
                                        </span>
                                      )}
                                      {t.plsema && (
                                        <div className="flex items-center gap-1 text-[10px] font-mono">
                                          <span className="text-slate-400 font-bold uppercase text-[9px]">PLSEMA:</span>
                                          <span className="px-1 py-0.2 rounded bg-slate-100 text-slate-600" title="Prelectura">P:{reportedMetric(reportedPhaseMinutes(t.plsema, 'prelectura'), ' min', 1)}</span>
                                          <span className="px-1 py-0.2 rounded bg-slate-100 text-slate-600" title="Lectura">L:{reportedMetric(reportedPhaseMinutes(t.plsema, 'lectura'), ' min', 1)}</span>
                                          <span className="px-1 py-0.2 rounded bg-slate-100 text-slate-600" title="Subrayado">S:{reportedMetric(reportedPhaseMinutes(t.plsema, 'subrayado'), ' min', 1)}</span>
                                          <span className="px-1 py-0.2 rounded bg-slate-100 text-slate-600" title="Esquema">E:{reportedMetric(reportedPhaseMinutes(t.plsema, 'esquema'), ' min', 1)}</span>
                                          <span className="px-1 py-0.2 rounded bg-emerald-50 text-emerald-700 font-bold" title="Memorizar">M:{reportedMetric(reportedPhaseMinutes(t.plsema, 'memorizar'), ' min', 1)}</span>
                                          <span className="px-1 py-0.2 rounded bg-purple-50 text-purple-700 font-bold" title="Cantar">A:{reportedMetric(reportedPhaseMinutes(t.plsema, 'cantar'), ' min', 1)}</span>
                                        </div>
                                      )}
                                    </div>
                                    {t.plsema?.activeRecallRatio != null && (
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200/60">
                                        Recuerdo Activo: {Math.round(t.plsema.activeRecallRatio)}%
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: AUDITORÍA DE SESIONES REGISTRADAS */}
        {activeTab === "sessions" && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Filter controls */}
            <div className="p-4 border-b border-slate-100 bg-white flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  aria-label="Buscar sesiones por tema, número o notas"
                  type="text"
                  placeholder="Buscar por tema, número o notas..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-all"
                />
                {searchQuery && (
                  <button
                    type="button"
                    aria-label="Borrar búsqueda de sesiones"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Filtrar sesiones por materia"
                  value={subjectFilter}
                  onChange={(e) => setSubjectFilter(e.target.value)}
                  className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none"
                >
                  <option value="all">Todos los bloques</option>
                  {initialSubjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>

                <select
                  aria-label="Filtrar sesiones por origen"
                  value={sourceFilter}
                  onChange={(e) => setSourceFilter(e.target.value as any)}
                  className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none"
                >
                  <option value="all">Origen: Todos</option>
                  <option value="aerofocus">Solo AeroFocus Pro</option>
                  <option value="manual">Solo Manuales</option>
                </select>

                <select
                  aria-label="Filtrar sesiones por dificultad"
                  value={difficultyFilter}
                  onChange={(e) => setDifficultyFilter(e.target.value as any)}
                  className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none"
                >
                  <option value="all">Dificultad: Todas</option>
                  <option value="pending">⚠️ Pendientes de evaluar</option>
                  <option value="rated">Evaluadas</option>
                </select>
              </div>
            </div>

            {/* Sessions Table View */}
            <div className="flex-1 overflow-y-auto">
              {filteredSessions.length === 0 ? (
                <div className="py-20 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center mb-3">
                    <Clock size={20} />
                  </div>
                  <h3 className="text-sm font-bold text-slate-800">No hay sesiones que coincidan</h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                    Prueba a cambiar los filtros de búsqueda o revisa la bandeja de cuarentena.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {filteredSessions.map((session) => {
                    const info = getTopicInfo(session.topicId, session.topicTitle);
                    const diff = session.dificultadReal || session.difficulty;
                    const isPending = !diff || diff === 0;

                    return (
                      <div
                        key={session.id}
                        className="px-6 py-3.5 hover:bg-slate-50/70 transition-colors flex items-center justify-between gap-4"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: info.subjectColor }}
                            title={info.subjectName}
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-900 truncate">
                                Tema {info.number}: {info.title}
                              </span>
                              <span className="text-[10px] font-semibold text-slate-400 font-mono">
                                {session.date}
                              </span>
                              {session.source === "aerofocus_pro" && (
                                <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.2 rounded">
                                  AeroFocus
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2">
                              <span>{info.subjectName}</span>
                              <span>·</span>
                              <span className="font-mono">{reportedMetric(sessionDurationMinutes(session) > 0 ? sessionDurationMinutes(session) : null, ' min', 1)}</span>
                              {session.notes && (
                                <>
                                  <span>·</span>
                                  <span className="truncate max-w-xs italic text-slate-400">"{session.notes}"</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          {/* Quick Difficulty Pills */}
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-slate-400 font-semibold mr-1">Dificultad:</span>
                            {[3, 5, 8].map((d) => (
                              <button
                                key={d}
                                onClick={() => quickUpdateSessionDifficulty(session.id, d)}
                                className={cn(
                                  "px-2 py-0.5 rounded text-[10px] font-bold font-mono transition-colors",
                                  diff === d
                                    ? "bg-slate-900 text-white"
                                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                )}
                              >
                                {d}
                              </button>
                            ))}
                          </div>

                          <button
                            onClick={() => setEditingSession(session)}
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                            title="Editar sesión completa"
                          >
                            <Edit2 size={13} />
                          </button>

                          <button
                            onClick={() => {
                              if (confirm("¿Deseas eliminar esta sesión de tu expediente?")) {
                                deleteStudySession(session.topicId || "", session.id);
                              }
                            }}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Eliminar sesión"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB: ANALÍTICA PRO v2.2.0 (PLSEMA, MIN/PÁG, CRONOBIOLOGÍA, RETENCIÓN) */}
        {activeTab === "analytics" && (
          <div className="flex-1 p-4 sm:p-8 overflow-y-auto bg-slate-50/50 space-y-6">
            <div className="max-w-4xl mx-auto space-y-6">
              {/* Header Title & Sync Action */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900 font-serif">
                      Analítica Cognitiva & Telemetría AeroFocus Pro
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-black bg-purple-100 text-purple-800 border border-purple-200">
                      v2.2.0
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Paridad matemática 1:1 con fases PLSEMA, ritmo de páginas al segundo y curva de fatiga.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={fetchAnalytics}
                    disabled={isLoadingAnalytics}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 shadow-2xs transition-colors flex items-center gap-1.5"
                  >
                    <RefreshCw size={12} className={cn(isLoadingAnalytics && "animate-spin")} />
                    <span>Actualizar</span>
                  </button>
                  <button
                    onClick={handleSimulateFlight}
                    disabled={isSimulatingFlight}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white shadow-2xs transition-colors flex items-center gap-1.5"
                  >
                    <Plane size={12} />
                    <span>Simular Telemetría v2.2</span>
                  </button>
                </div>
              </div>

              {!globalAnalytics ? (
                <div className="p-8 rounded-3xl bg-white border border-slate-200/80 shadow-xs text-center space-y-4 max-w-lg mx-auto">
                  <div className="w-14 h-14 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mx-auto">
                    <Brain size={28} />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Snapshot Analítico Pendiente de Sincronización</h4>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      AeroFocus Pro envía este snapshot completo con la opción <strong>"Sincronizar Todo el Historial y Estadísticas"</strong> (`full_history_sync`) o en el cierre diario de las 22:00h.
                    </p>
                  </div>
                  <button
                    onClick={handleSimulateFlight}
                    disabled={isSimulatingFlight}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-xs transition-colors inline-flex items-center gap-1.5"
                  >
                    <Plane size={13} />
                    <span>Generar Telemetría de Prueba Ahora</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">Estadísticas enviadas por AeroFocus. Los guiones indican datos no recibidos; estos indicadores externos no sustituyen las estimaciones de estudio y recuerdo de WellsPrep.</p>
                  {/* Top Stats Overview */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Pureza de Foco</span>
                      <div className="text-xl font-bold font-mono text-slate-900 mt-1">
                        {reportedMetric(globalAnalytics.overview?.focusScoreAverage ?? globalAnalytics.overview?.purezaFocoGlobal, '%', 0, 100)}
                      </div>
                      <span className="text-xs text-slate-500">Valor recibido de AeroFocus</span>
                    </div>

                    <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Ritmo de Asimilación</span>
                      <div className="text-xl font-bold font-mono text-indigo-700 mt-1">
                        {reportedMetric(globalAnalytics.pagesPace?.avgMinutesPerPage, '', 1)} <span className="text-xs font-normal">min/pág</span>
                      </div>
                      <span className="text-[10px] text-slate-500">Páginas de 1ª vuelta</span>
                    </div>

                    <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Racha de Estudio</span>
                      <div className="text-xl font-bold font-mono text-amber-600 mt-1 flex items-center gap-1">
                        <Flame size={18} className="text-amber-500 fill-amber-500" />
                        <span>{reportedMetric(globalAnalytics.overview?.streakDays, ' días')}</span>
                      </div>
                      <span className="text-[10px] text-slate-500">Constancia activa</span>
                    </div>

                    <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Recuerdo Activo</span>
                      <div className="text-xl font-bold font-mono text-purple-700 mt-1">
                        {reportedMetric(globalAnalytics.plsemaGlobal?.activeRecallRatio, '%', 0, 100)}
                      </div>
                      <span className="text-[10px] text-purple-600 font-semibold">Memorizar + Cantar</span>
                    </div>
                  </div>

                  {/* Section 1: PLSEMA Cognitive Breakdown */}
                  <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-3">
                      <div>
                        <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                          <Brain size={14} className="text-purple-600" />
                          <span>Metodología Cognitiva PLSEMA (Fases de Estudio)</span>
                        </h4>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Distribución de tiempos recibidos. Una fase sin medida se muestra con un guion.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-purple-50 text-purple-800 border border-purple-200">
                          Recuerdo Activo: {reportedMetric(globalAnalytics.plsemaGlobal?.activeRecallRatio, '%', 0, 100)}
                        </span>
                        <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-600">
                          Pasivo: {reportedMetric(globalAnalytics.plsemaGlobal?.passiveRatio, '%', 0, 100)}
                        </span>
                      </div>
                    </div>

                    {/* Phase Chips Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 pt-1">
                      {[
                        { key: "prelectura", label: "P · Prelectura", bg: "bg-amber-50 text-amber-900 border-amber-200" },
                        { key: "lectura", label: "L · Lectura", bg: "bg-blue-50 text-blue-900 border-blue-200" },
                        { key: "subrayado", label: "S · Subrayado", bg: "bg-cyan-50 text-cyan-900 border-cyan-200" },
                        { key: "esquema", label: "E · Esquema", bg: "bg-emerald-50 text-emerald-900 border-emerald-200" },
                        { key: "memorizar", label: "M · Memorizar", bg: "bg-purple-50 text-purple-900 border-purple-200 font-bold" },
                        { key: "cantar", label: "A · Cantar", bg: "bg-rose-50 text-rose-900 border-rose-200 font-bold" },
                      ].map((phase) => {
                        const mins = reportedPhaseMinutes(globalAnalytics.plsemaGlobal, phase.key);
                        return (
                          <div key={phase.key} className={cn("p-2.5 rounded-xl border text-center", phase.bg)}>
                            <div className="text-[10px] font-bold uppercase">{phase.label}</div>
                            <div className="text-sm font-black font-mono mt-1">{reportedMetric(mins, ' min', 1)}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Section 2: Chronobiology & Cognitive Fatigue */}
                  {globalAnalytics.chronobiology && (
                    <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-4">
                      <div className="border-b border-slate-100 pb-3">
                        <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                          <Clock size={14} className="text-indigo-600" />
                          <span>Horario y distracciones informados</span>
                        </h4>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Datos enviados por AeroFocus. Los guiones indican medidas no recibidas.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Hora Punta de Atención</span>
                          <div className="text-base font-bold font-mono text-slate-900 mt-1">
                            {reportedNumber(globalAnalytics.chronobiology.peakHour, 23) !== null ? `${globalAnalytics.chronobiology.peakHour}:00h` : '—'}
                          </div>
                          <span className="text-[10px] text-indigo-600 font-medium">Bloque: {reportedText(globalAnalytics.chronobiology.peakTimeBlock)}</span>
                        </div>

                        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Duración sugerida por AeroFocus</span>
                          <div className="text-base font-bold font-mono text-slate-900 mt-1">
                            {reportedMetric(globalAnalytics.chronobiology.cognitiveFatigue?.recommendedSessionMinutes, ' min')}
                          </div>
                          <span className="text-[10px] text-slate-500">Sugerencia recibida; no una medida de memoria</span>
                        </div>

                        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Primera distracción media</span>
                          <div className="text-base font-bold font-mono text-rose-700 mt-1">
                            {reportedMetric(globalAnalytics.chronobiology.cognitiveFatigue?.averageFirstDistractionMinute, ' min')}
                          </div>
                          <span className="text-[10px] text-slate-500">Promedio recibido de AeroFocus</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Section 3: Pages Pace Breakdown Table */}
                  {reportedPages.length > 0 && (
                    <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <div>
                          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                            <Timer size={14} className="text-emerald-600" />
                            <span>Mapa de Densidad y Ritmo Página por Página</span>
                          </h4>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            Tiempos y clasificación de dificultad recibidos por página.
                          </p>
                        </div>
                        <span className="text-xs font-mono font-bold text-slate-600">
                          {reportedPages.length} páginas registradas
                        </span>
                      </div>

                      <div className="overflow-x-auto no-scrollbar max-h-60 overflow-y-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-slate-100 text-slate-400 font-semibold text-[10px] uppercase">
                              <th className="py-2 px-3">Página</th>
                              <th className="py-2 px-3">Tema / Asignatura</th>
                              <th className="py-2 px-3">Tiempo Neto</th>
                              <th className="py-2 px-3">Ritmo (min/pág)</th>
                              <th className="py-2 px-3">Densidad</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {reportedPages.slice(0, 20).map((pg, i) => (
                              <tr key={pg.pageKey || i} className="hover:bg-slate-50/80 transition-colors">
                                <td className="py-2 px-3 font-mono font-bold text-slate-900">
                                  {pg.pageLabel || `Pág. ${pg.pageNumber}`}
                                </td>
                                <td className="py-2 px-3 truncate max-w-xs text-slate-700">
                                  {pg.topicTitle || pg.tema || pg.subjectName}
                                </td>
                                <td className="py-2 px-3 font-mono text-slate-600">
                                  {reportedMetric(pg.effectiveMinutes, ' min', 1)} ({reportedMetric(pg.effectiveSeconds ?? (reportedNumber(pg.effectiveMinutes) !== null ? pg.effectiveMinutes * 60 : null), ' s')})
                                </td>
                                <td className="py-2 px-3 font-mono font-bold text-indigo-700">
                                  {reportedMetric(pg.minutesPerPage, ' min/pág', 1)}
                                </td>
                                <td className="py-2 px-3">
                                  <span className={cn(
                                    "px-2 py-0.5 rounded-md text-[10px] font-bold uppercase",
                                    pg.densityTier === "rapida" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                                    pg.densityTier === "densa" ? "bg-amber-50 text-amber-800 border border-amber-200" :
                                    "bg-blue-50 text-blue-700 border border-blue-200"
                                  )}>
                                    {reportedText(pg.densityTier, 'Sin clasificar')}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Section 4: Memory Decay (Ebbinghaus) & Exam Projection */}
                  {(globalAnalytics.memoryDecay || globalAnalytics.examProjection) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {globalAnalytics.memoryDecay && (
                        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-3">
                          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                            <Brain size={14} className="text-indigo-600" />
                            <span>Señales de memoria recibidas</span>
                          </h4>
                          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                            <span className="text-xs font-medium text-slate-600">Índice informado por AeroFocus</span>
                            <span className="text-lg font-bold font-mono text-slate-900">
                              {reportedMetric(globalAnalytics.memoryDecay.overallRetentionHealthScore, '%', 0, 100)}
                            </span>
                          </div>
                          {reportedReviews.length > 0 && (
                            <div className="space-y-1.5">
                              <span className="text-[10px] font-bold uppercase text-slate-400">Sugerencias recibidas de AeroFocus</span>
                              {reportedReviews.slice(0, 3).map((item, idx) => (
                                <div key={idx} className="p-2 rounded-lg bg-rose-50/60 border border-rose-100 flex items-center justify-between text-xs">
                                  <span className="font-medium text-rose-950 truncate max-w-[200px]">{reportedText(item.topicTitle, 'Tema sin identificar')}</span>
                                  <span className="text-[10px] font-bold text-rose-700">{reportedMetric(item.daysSinceLastReview, ' días')} desde el repaso informado</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {globalAnalytics.examProjection && (
                        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-3">
                          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                            <Award size={14} className="text-purple-600" />
                            <span>Proyección recibida de AeroFocus</span>
                          </h4>
                          <div className="space-y-2 text-xs">
                            <div className="flex justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                              <span className="text-slate-600">Fecha Estimada 1ª Vuelta</span>
                              <span className="font-bold font-mono text-slate-900">{reportedText(globalAnalytics.examProjection.estimatedDateVuelta1)}</span>
                            </div>
                            <div className="flex justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                              <span className="text-slate-600">Horas Diarias Requeridas</span>
                              <span className="font-bold font-mono text-purple-700">{reportedMetric(globalAnalytics.examProjection.dailyHoursRequired, ' h/día', 1)}</span>
                            </div>
                            <div className="flex justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                              <span className="text-slate-600">Viabilidad informada</span>
                              <span className="font-semibold text-xs text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                                {reportedText(globalAnalytics.examProjection.feasibility, 'Sin evaluación recibida')}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB: CONEXIÓN & WEBHOOK (DEDICATED, CLEAN) */}
        {activeTab === "webhook" && (
          <div className="flex-1 p-8 overflow-y-auto bg-slate-50/50">
            <div className="max-w-2xl mx-auto space-y-6">
              <div>
                <h3 className="text-base font-bold text-slate-900 font-serif">
                  Ajustes de Sincronización Webhook · AeroFocus Pro
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Consulta los datos de conexión. Las importaciones pendientes se revisan antes de incorporarlas al historial.
                </p>
              </div>

              {/* Endpoint card */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Globe size={13} className="text-indigo-600" />
                    <span>1. URL del Webhook (POST)</span>
                  </label>
                  <span className="text-[11px] text-slate-400">Pega esto en AeroFocus &gt; Ajustes &gt; Webhook</span>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    aria-label="URL del webhook de AeroFocus"
                    readOnly
                    value={webhookUrl}
                    className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 select-all focus:outline-none"
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(webhookUrl);
                      setCopiedUrl(true);
                      setTimeout(() => setCopiedUrl(false), 2000);
                      toast.success("URL del webhook copiada");
                    }}
                    className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/60 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5"
                  >
                    {copiedUrl ? <Check size={13} /> : <Copy size={13} />}
                    <span>{copiedUrl ? "Copiado" : "Copiar"}</span>
                  </button>
                </div>
              </div>

              {/* Token card */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Key size={13} className="text-emerald-600" />
                    <span>2. Token de Autorización (API Key)</span>
                  </label>
                  <span className="text-[11px] text-slate-400">Pega esto en AeroFocus &gt; Ajustes &gt; Token</span>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    aria-label="Token de autorización de AeroFocus"
                    readOnly
                    value={webhookToken || ""}
                    placeholder="Token no configurado"
                    className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-emerald-700 font-bold select-all focus:outline-none"
                  />
                  <button
                    disabled={!webhookToken}
                    onClick={() => {
                      if (!webhookToken) return;
                      navigator.clipboard.writeText(webhookToken);
                      setCopiedToken(true);
                      setTimeout(() => setCopiedToken(false), 2000);
                      toast.success("Token de autorización copiado");
                    }}
                    className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/60 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5"
                  >
                    {copiedToken ? <Check size={13} /> : <Copy size={13} />}
                    <span>{copiedToken ? "Copiado" : "Copiar"}</span>
                  </button>
                </div>
              </div>

              {/* Handshake Verification */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between gap-4">
                <div>
                  <h4 className="text-xs font-bold text-slate-900">Comprobar Enlace Operativo</h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Envía un ping de verificación para comprobar que la ruta responde correctamente.
                  </p>
                </div>

                <button
                  onClick={handleTestWebhook}
                  disabled={isTestingWebhook}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white transition-colors flex items-center gap-1.5 disabled:opacity-50"
                >
                  <ShieldCheck size={13} className={cn(isTestingWebhook && "animate-spin")} />
                  <span>{isTestingWebhook ? "Verificando..." : "Test de Conexión"}</span>
                </button>
              </div>

            </div>
          </div>
        )}

        {/* TAB 4: LOGS DE RED BRUTOS */}
        {activeTab === "raw_logs" && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-slate-50/50">
            <div className="p-4 bg-white border-b border-slate-200/60 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">Últimas 30 transmisiones recibidas por la API</span>
              <button
                onClick={fetchLogs}
                disabled={isLoadingLogs}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 transition-colors flex items-center gap-1.5"
              >
                <RefreshCw size={12} className={cn(isLoadingLogs && "animate-spin")} />
                <span>Refrescar logs</span>
              </button>
            </div>

            <div className="flex-1 p-6 overflow-y-auto">
              {rawEvents.length === 0 ? (
                <div className="py-20 text-center text-xs text-slate-400">
                  No se registran eventos de red recientes en el búfer.
                </div>
              ) : (
                <div className="space-y-3 font-mono text-xs">
                  {rawEvents.map((log, i) => (
                    <div key={i} className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
                      <div className="flex items-center justify-between text-slate-500 mb-1">
                        <span>{log.receivedAt || log.date}</span>
                        <span className="font-bold text-slate-800">#{log.flightId || log.id}</span>
                      </div>
                      <pre className="text-[11px] text-slate-700 overflow-x-auto p-2 bg-slate-50 rounded-lg">
                        {JSON.stringify(log.rawPayload || log, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {/* Manual Paste Modal */}
      {isPasteModalOpen && (
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div ref={pasteDialogRef} role="dialog" aria-modal="true" aria-labelledby={pasteTitleId} tabIndex={-1} className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg max-h-[92dvh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between gap-3 p-4 sm:p-5 border-b border-slate-200 shrink-0">
              <div>
                <h3 id={pasteTitleId} className="text-base font-bold text-slate-900 font-serif">Pegar reporte de AeroFocus</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Interpreta cualquier formato JSON, texto o tabla de temas y minutos
                </p>
              </div>
              <button
                type="button"
                aria-label="Cerrar importación de reporte"
                disabled={isImportingPaste}
                onClick={() => setIsPasteModalOpen(false)}
                className="text-slate-600 hover:text-slate-900 w-11 h-11 flex items-center justify-center shrink-0 rounded-xl hover:bg-slate-100"
              >
                <X size={16} />
              </button>
            </div>

            <div className="min-h-0 overflow-y-auto p-4 sm:p-5">
            <label htmlFor={`${pasteTitleId}-report`} className="mb-2 block text-sm font-semibold text-slate-700">Reporte para revisar</label>
            <textarea
              ref={pasteInputRef}
              id={`${pasteTitleId}-report`}
              rows={9}
              value={pasteJsonText}
              onChange={(e) => setPasteJsonText(e.target.value)}
              placeholder={'// Pega aquí el JSON o reporte copiado de AeroFocus:\n{\n  "date": "2026-10-28",\n  "topics": [\n    {\n      "materia": "Civil",\n      "tema": "Tema 14",\n      "effectiveMinutes": 90,\n      "modality": "repaso"\n    }\n  ]\n}\n\n// O también texto libre:\nCivil Tema 14 - 90 min - Repaso'}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-base sm:text-sm font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/10 placeholder:text-slate-500"
            />
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 p-4 sm:p-5 border-t border-slate-200 shrink-0" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
              <button
                type="button"
                disabled={isImportingPaste}
                onClick={() => setIsPasteModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleImportPaste}
                disabled={isImportingPaste}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                {isImportingPaste ? <RefreshCw size={12} className="animate-spin" /> : <CheckCircle2 size={13} />}
                <span>{isImportingPaste ? 'Interpretando…' : 'Revisar reporte'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Topic Reassignment Modal */}
      {reassigningItem && (
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div ref={reassignDialogRef} role="dialog" aria-modal="true" aria-labelledby={reassignTitleId} tabIndex={-1} className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg h-[80dvh] max-h-[600px] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 id={reassignTitleId} className="text-base font-bold text-slate-900 font-serif">Reasignar tema oficial</h3>
                <p className="text-xs text-slate-500 mt-0.5">Selecciona el tema oficial correspondiente</p>
              </div>
              <button
                type="button"
                aria-label="Cerrar reasignación de tema"
                onClick={() => setReassigningItem(null)}
                className="text-slate-600 hover:text-slate-900 w-11 h-11 flex items-center justify-center shrink-0 rounded-xl hover:bg-slate-100"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 border-b border-slate-100 bg-slate-50/50">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  ref={reassignInputRef}
                  aria-label="Buscar tema oficial para reasignar"
                  type="text"
                  placeholder="Buscar por número o título..."
                  value={reassignSearch}
                  onChange={(e) => setReassignSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-1.5">
              {initialTopics
                .filter((t) => {
                  if (!reassignSearch) return true;
                  const q = reassignSearch.toLowerCase();
                  return (
                    t.title.toLowerCase().includes(q) ||
                    t.id.toLowerCase().includes(q) ||
                    String(t.number).includes(q)
                  );
                })
                .map((t) => {
                  const sub = initialSubjects.find((s) => s.id === t.subjectId);
                  return (
                    <button
                      key={t.id}
                      onClick={() => {
                        updateQuarantineTopic(reassigningItem.eventId, reassigningItem.topicIndex, {
                          resolvedTopicId: t.id,
                          resolvedTopicTitle: t.title,
                          resolvedTopicNumber: t.number,
                          resolvedSubjectId: t.subjectId,
                        });
                        setReassigningItem(null);
                        toast.success(`Tema reasignado a: Tema ${t.number} - ${t.title}`);
                      }}
                      className="w-full text-left p-3 rounded-xl hover:bg-slate-50 border border-slate-100 hover:border-slate-300 transition-colors flex items-center justify-between gap-3 group"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 group-hover:text-indigo-900 truncate">
                          Tema {t.number}: {t.title}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {sub?.name || t.subjectId}
                        </div>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600 shrink-0">
                        {t.id}
                      </span>
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* Dedicated Topic Editor in Quarantine */}
      {editingTopicModal && (
        <EditQuarantineTopicModal
          item={editingTopicModal}
          onClose={() => setEditingTopicModal(null)}
          onSave={async (updated) => {
            await updateQuarantineTopic(editingTopicModal.eventId, editingTopicModal.topicIndex, updated);
            setEditingTopicModal(null);
            toast.success("Tema actualizado en cuarentena");
          }}
          onDelete={() => {
            if (confirm("¿Eliminar definitivamente solo este tema de la sesión?")) {
              deleteQuarantineTopic(editingTopicModal.eventId, editingTopicModal.topicIndex);
              setEditingTopicModal(null);
            }
          }}
        />
      )}

      {/* Add Topic to Quarantine Flight Modal */}
      {addingTopicFlightId && (
        <AddQuarantineTopicModal
          isOpen={Boolean(addingTopicFlightId)}
          onClose={() => setAddingTopicFlightId(null)}
          onAdd={async (topicData) => {
            const ok = await addQuarantineTopic(addingTopicFlightId, topicData);
            if (ok) {
              setAddingTopicFlightId(null);
              toast.success(`Tema ${topicData.resolvedTopicNumber} añadido al vuelo`);
            }
          }}
        />
      )}

      {/* Edit Session Modal */}
      {editingSession && (
        <EditSessionDialog
          session={editingSession}
          onClose={() => setEditingSession(null)}
          onSessionUpdated={() => {
            setEditingSession(null);
          }}
        />
      )}
    </div>
  );
}

// ==========================================
// DEDICATED TOPIC EDITOR MODAL IN QUARANTINE
// ==========================================
function EditQuarantineTopicModal({
  item,
  onClose,
  onSave,
  onDelete,
}: {
  item: { eventId: string; topicIndex: number; topic: WebhookResolvedTopic };
  onClose: () => void;
  onSave: (updated: Partial<WebhookResolvedTopic>) => Promise<void>;
  onDelete: () => void;
}) {
  const [topic, setTopic] = useState<WebhookResolvedTopic>({ ...item.topic });
  const [isChangingTopic, setIsChangingTopic] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const titleId = useId();
  const minutesInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const dialogRef = useDialogAccessibility<HTMLDivElement>({ onClose, initialFocusRef: minutesInputRef, disabled: saving });
  const [minutes, setMinutes] = useState(() => {
    const actual = [item.topic.effectiveMinutes, Number(item.topic.effectiveHours) * 60].find(value => typeof value === 'number' && Number.isFinite(value) && value > 0);
    return actual === undefined ? '' : String(actual);
  });
  const [difficulty, setDifficulty] = useState(() => {
    const actual = item.topic.dificultadReal ?? item.topic.difficulty;
    return typeof actual === 'number' && Number.isFinite(actual) && actual >= 1 && actual <= 10 ? String(actual) : '';
  });
  const [completesVuelta, setCompletesVuelta] = useState(item.topic.completesVuelta === true);
  const [formError, setFormError] = useState('');
  const durationMins = Number(minutes) || 0;
  const currentDiff = difficulty ? Number(difficulty) : undefined;
  const canCompleteVuelta = ['repaso', 'canto', 'cante', 'simulacro'].includes(topic.modality);
  const save = async () => {
    if (saving) return;
    try {
      const actual = parseQuarantineTopicObservation({ minutes, difficulty, completesVuelta, modality: topic.modality });
      setFormError('');
      setSaving(true);
      await onSave({ ...topic, ...actual });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Revisa los datos reales del tema.');
      minutesInputRef.current?.focus();
    } finally {
      setSaving(false);
    }
  };

  const subject = initialSubjects.find(s => s.id === topic.resolvedSubjectId) || {
    id: topic.resolvedSubjectId || "general",
    name: topic.resolvedSubjectId || "General",
    color: "#6366f1"
  };

  const filteredTopics = useMemo(() => {
    if (!searchQuery.trim()) return initialTopics.slice(0, 40);
    const q = searchQuery.toLowerCase().trim();
    return initialTopics.filter(t => 
      t.title.toLowerCase().includes(q) ||
      t.id.toLowerCase().includes(q) ||
      String(t.number).includes(q)
    );
  }, [searchQuery]);

  return (
    <div className="fixed inset-0 z-60 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-hidden">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="bg-white rounded-3xl shadow-2xl border border-slate-200/80 w-full max-w-lg max-h-[92dvh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3 bg-slate-50/50 shrink-0">
          <div className="min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Revisar importación
            </span>
            <h3 id={titleId} className="text-base font-bold text-slate-900">
              Tema {topic.resolvedTopicNumber}: {topic.resolvedTopicTitle}
            </h3>
          </div>
          <button
            type="button"
            aria-label="Cerrar edición del tema importado"
            disabled={saving}
            onClick={onClose}
            className="w-11 h-11 rounded-full flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Body */}
        <fieldset disabled={saving} className="p-4 sm:p-5 space-y-4 overflow-y-auto overscroll-contain min-h-0 flex-1">
          
          {/* Topic Assignment Box */}
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <BookOpen size={13} className="text-indigo-600" />
                Tema Asignado Oficial
              </span>
              <button
                type="button"
                onClick={() => setIsChangingTopic(!isChangingTopic)}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
              >
                {isChangingTopic ? "Cerrar selector" : "Cambiar tema..."}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: subject.color }}
              />
              <span className="text-xs font-semibold text-slate-600">
                {subject.name}
              </span>
              <span className="text-xs text-slate-300">·</span>
              <span className="text-xs font-bold text-slate-900 truncate">
                Tema {topic.resolvedTopicNumber}: {topic.resolvedTopicTitle}
              </span>
            </div>

            {/* Quick Topic Search Dropdown */}
            {isChangingTopic && (
              <div className="mt-3 pt-3 border-t border-slate-200/80 space-y-2">
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    aria-label="Buscar otro tema para la importación"
                    placeholder="Buscar por número o nombre de tema..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    autoFocus
                  />
                </div>
                <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                  {filteredTopics.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setTopic(prev => ({
                          ...prev,
                          resolvedTopicId: t.id,
                          resolvedTopicTitle: t.title,
                          resolvedTopicNumber: t.number,
                          resolvedSubjectId: t.subjectId,
                        }));
                        setIsChangingTopic(false);
                      }}
                      className={cn(
                        "w-full text-left p-2 rounded-xl text-xs flex items-center justify-between gap-2 transition-colors",
                        topic.resolvedTopicId === t.id
                          ? "bg-indigo-50 text-indigo-900 font-bold border border-indigo-200"
                          : "hover:bg-white text-slate-700"
                      )}
                    >
                      <span className="truncate">Tema {t.number}: {t.title}</span>
                      <span className="text-[10px] font-mono text-slate-400 shrink-0">{t.id}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Modalidad Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Modalidad de Estudio
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {(
                [
                  { id: "primer_estudio", label: "1er Estudio" },
                  { id: "repaso", label: "Repaso" },
                  { id: "refresco", label: "Refresco" },
                  { id: "canto", label: "Cante" },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setTopic(prev => ({ ...prev, modality: m.id }))}
                  aria-pressed={topic.modality === m.id}
                  className={cn(
                    "py-2 px-2.5 rounded-xl text-xs font-bold transition-all text-center border",
                    topic.modality === m.id
                      ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tiempo Efectivo */}
          <div>
            <label htmlFor={`${titleId}-minutes`} className="block text-sm font-semibold text-slate-700 mb-1.5">
              Minutos reales {minutes ? `(${durationMins} min)` : '(obligatorio)'}
            </label>
            <div className="grid grid-cols-4 gap-2 sm:flex sm:items-center">
              <button
                type="button"
                onClick={() => setMinutes(String(Math.max(0, durationMins - 15)))}
                className="px-2 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs"
              >
                -15m
              </button>
              <button
                type="button"
                onClick={() => setMinutes(String(Math.max(0, durationMins - 5)))}
                className="px-2 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs"
              >
                -5m
              </button>
              <input
                ref={minutesInputRef}
                id={`${titleId}-minutes`}
                type="number"
                min="0.01"
                max="1440"
                step="any"
                required
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                aria-invalid={formError ? true : undefined}
                aria-describedby={formError ? `${titleId}-error` : undefined}
                className="order-first col-span-4 min-w-0 w-full sm:order-none sm:w-0 sm:flex-1 py-1.5 px-3 bg-white border border-slate-200 rounded-xl text-center font-mono font-bold text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
              <button
                type="button"
                onClick={() => setMinutes(String(durationMins + 5))}
                className="px-2 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs"
              >
                +5m
              </button>
              <button
                type="button"
                onClick={() => setMinutes(String(durationMins + 15))}
                className="px-2 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs"
              >
                +15m
              </button>
            </div>
            {/* Quick Presets */}
            <div className="flex items-center gap-1.5 mt-2 overflow-x-auto no-scrollbar">
              {[15, 30, 45, 60, 90, 120].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setMinutes(String(preset))}
                  className={cn(
                    "px-2 py-0.5 rounded-lg text-[11px] font-bold shrink-0 transition-colors",
                    durationMins === preset
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  )}
                >
                  {preset}m
                </button>
              ))}
            </div>
          </div>

          {/* Dificultad (1-10) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700">
                Dificultad percibida {currentDiff === undefined ? '(sin calificar)' : `(${currentDiff} / 10)`}
              </label>
              <span className="text-[11px] font-bold text-slate-500">
                {currentDiff === undefined ? 'Opcional' : currentDiff <= 3 ? "Baja / Asimilado" : currentDiff <= 6 ? "Media" : currentDiff <= 8 ? "Alta" : "Extrema"}
              </span>
            </div>
            <div className="grid grid-cols-5 gap-1">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => {
                const isSelected = currentDiff === num;
                return (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setDifficulty(String(num))}
                    aria-label={`Dificultad ${num} de 10`}
                    aria-pressed={isSelected}
                    className={cn(
                      "py-2 rounded-lg text-xs font-black transition-all",
                      isSelected
                        ? num <= 3
                          ? "bg-emerald-600 text-white shadow-xs"
                          : num <= 6
                          ? "bg-blue-600 text-white shadow-xs"
                          : num <= 8
                          ? "bg-amber-600 text-white shadow-xs"
                          : "bg-rose-600 text-white shadow-xs"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    )}
                  >
                    {num}
                  </button>
                );
              })}
            </div>
            {difficulty && <button type="button" onClick={() => setDifficulty('')} className="mt-1 text-xs text-slate-600 underline">Dejar sin calificar</button>}
          </div>

          {/* Vuelta Oficial */}
          <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-3">
            <div>
              <label htmlFor={`${titleId}-vuelta`} className="text-sm font-semibold text-slate-900">He completado una vuelta entera</label>
              <div className="text-[11px] text-slate-500">
                {canCompleteVuelta ? 'Marca esta opción solo si has completado el repaso o cante.' : 'El estudio inicial y el refresco no completan una vuelta.'}
              </div>
            </div>
            <input
              id={`${titleId}-vuelta`}
              type="checkbox"
              disabled={!canCompleteVuelta}
              checked={canCompleteVuelta && completesVuelta}
              onChange={(e) => setCompletesVuelta(e.target.checked)}
              className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
            />
          </div>

          {/* Páginas y Notas */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Pág. Inicio</label>
              <input
                aria-label="Página inicial realmente trabajada"
                type="number"
                value={topic.startPage ?? ""}
                onChange={(e) => setTopic(prev => ({ ...prev, startPage: e.target.value ? parseInt(e.target.value) : undefined }))}
                placeholder="Ej. 1"
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Pág. Fin</label>
              <input
                aria-label="Página final realmente trabajada"
                type="number"
                value={topic.endPage ?? ""}
                onChange={(e) => setTopic(prev => ({ ...prev, endPage: e.target.value ? parseInt(e.target.value) : undefined }))}
                placeholder="Ej. 24"
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Notas / Observaciones</label>
            <textarea
              aria-label="Notas del tema importado"
              rows={2}
              value={topic.notes ?? ""}
              onChange={(e) => setTopic(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Anotaciones sobre este tema..."
              className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none"
            />
          </div>
        </fieldset>

        {/* Footer */}
        <div className="px-4 sm:px-5 py-3.5 border-t border-slate-100 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3 shrink-0" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          {formError && <p id={`${titleId}-error`} role="alert" className="w-full text-sm text-rose-700">{formError}</p>}
          <button
            type="button"
            onClick={onDelete}
            disabled={saving}
            className="px-3 py-2 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 transition-colors flex items-center gap-1.5"
          >
            <Trash2 size={13} />
            <span>Eliminar solo este tema</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 shadow-xs transition-colors flex items-center gap-1.5"
            >
              <Save size={13} />
              <span>{saving ? 'Guardando…' : 'Guardar Cambios'}</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

// ==========================================
// ADD TOPIC TO QUARANTINE FLIGHT MODAL
// ==========================================
function AddQuarantineTopicModal({
  isOpen,
  onClose,
  onAdd,
}: {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (topic: Partial<WebhookResolvedTopic>) => void;
}) {
  const [search, setSearch] = useState("");
  const [selectedSubject, setSelectedSubject] = useState<string>("all");
  const [minutes, setMinutes] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [completesVuelta, setCompletesVuelta] = useState(false);
  const [formError, setFormError] = useState('');
  const [adding, setAdding] = useState(false);
  const titleId = useId();
  const minutesInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useDialogAccessibility<HTMLDivElement>({ isOpen, onClose, initialFocusRef: minutesInputRef, disabled: adding });

  const filtered = useMemo(() => {
    let list = initialTopics;
    if (selectedSubject !== "all") {
      list = list.filter(t => t.subjectId === selectedSubject);
    }
    if (!search.trim()) return list;
    const q = search.toLowerCase().trim();
    return list.filter(t =>
      t.title.toLowerCase().includes(q) ||
      t.id.toLowerCase().includes(q) ||
      String(t.number).includes(q)
    );
  }, [search, selectedSubject]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-60 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-hidden">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="bg-white rounded-3xl shadow-2xl border border-slate-200/80 w-full max-w-lg max-h-[92dvh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3 bg-slate-50/50 shrink-0">
          <div>
            <h3 id={titleId} className="text-base font-bold text-slate-900 font-serif">
              Añadir tema a la importación
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Indica el tiempo real y selecciona el tema. Se conservará en cuarentena para su revisión.
            </p>
          </div>
          <button
            type="button"
            aria-label="Cerrar selección del tema importado"
            disabled={adding}
            onClick={onClose}
            className="w-11 h-11 rounded-full flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* Filters & Search */}
        <div className="p-4 border-b border-slate-100 space-y-3 bg-white shrink-0">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm font-semibold text-slate-700">Minutos reales
              <input ref={minutesInputRef} type="number" required min="0.01" max="1440" step="any" value={minutes} onChange={event => setMinutes(event.target.value)} className="mt-1 w-full min-w-0 rounded-xl border border-slate-300 bg-white p-2.5 text-base" />
            </label>
            <label className="text-sm font-semibold text-slate-700">Dificultad (opcional)
              <input type="number" min="1" max="10" step="0.1" value={difficulty} onChange={event => setDifficulty(event.target.value)} className="mt-1 w-full min-w-0 rounded-xl border border-slate-300 bg-white p-2.5 text-base" />
            </label>
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={completesVuelta} onChange={event => setCompletesVuelta(event.target.checked)} />He completado una vuelta entera de repaso</label>
          {formError && <p role="alert" className="text-sm text-rose-700">{formError}</p>}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
            <input
              aria-label="Buscar tema oficial para añadir a la importación"
              type="text"
              placeholder="Buscar por número o nombre (ej. 14, Obligaciones, Constitucional)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            <button
              onClick={() => setSelectedSubject("all")}
              className={cn(
                "px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0 transition-colors",
                selectedSubject === "all"
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              Todos (328)
            </button>
            {initialSubjects.map(s => (
              <button
                key={s.id}
                onClick={() => setSelectedSubject(s.id)}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0 transition-colors flex items-center gap-1",
                  selectedSubject === s.id
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                )}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.color }} />
                <span>{s.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Topic List */}
        <div className="p-4 overflow-y-auto space-y-1.5 flex-1">
          {filtered.map(t => {
            const sub = initialSubjects.find(s => s.id === t.subjectId);
            return (
              <button
                key={t.id}
                disabled={adding}
                onClick={async () => {
                  if (adding) return;
                  try {
                    const actual = parseQuarantineTopicObservation({ minutes, difficulty, completesVuelta, modality: 'repaso' });
                    setFormError('');
                    setAdding(true);
                    await onAdd({
                      resolvedTopicId: t.id,
                      resolvedTopicTitle: t.title,
                      resolvedTopicNumber: t.number,
                      resolvedSubjectId: t.subjectId,
                      modality: 'repaso',
                      ...actual,
                    });
                  } catch (error) {
                    setFormError(error instanceof Error ? error.message : 'Revisa los datos reales antes de añadir el tema.');
                    minutesInputRef.current?.focus();
                  } finally {
                    setAdding(false);
                  }
                }}
                className="w-full text-left p-2.5 rounded-xl hover:bg-indigo-50/60 border border-slate-100 hover:border-indigo-200 transition-colors flex items-center justify-between gap-3 group"
              >
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 group-hover:text-indigo-950 truncate">
                    Tema {t.number}: {t.title}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: sub?.color || "#94a3b8" }} />
                    <span>{sub?.name || t.subjectId}</span>
                  </div>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600 shrink-0 group-hover:bg-indigo-100 group-hover:text-indigo-800">
                  Añadir
                </span>
              </button>
            );
          })}
        </div>

      </div>
    </div>
  );
}

