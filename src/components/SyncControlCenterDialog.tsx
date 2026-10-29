import React, { useState, useMemo, useEffect } from "react";
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
  BookOpen
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
import { WebhookSyncRecord } from "../lib/webhookTypes";
import { simulateAeroFocusFlight } from "../hooks/useAeroFocusSync";

interface SyncControlCenterDialogProps {
  onClose: () => void;
}

type ControlCenterTab = "quarantine" | "sessions" | "webhook" | "raw_logs";

export function SyncControlCenterDialog({ onClose }: SyncControlCenterDialogProps) {
  const {
    user,
    recentSessions = [],
    userProgress,
    deleteStudySession,
    quickUpdateSessionDifficulty,
    reconcileAllTopicsAndSessions,
    webhookToken,
    purgeAllAeroFocusData,
    deduplicateUserSessions,
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

  // Topic Reassign state
  const [reassigningItem, setReassigningItem] = useState<{ eventId: string; topicIndex: number } | null>(null);
  const [reassignSearch, setReassignSearch] = useState("");

  // Raw logs state
  const [rawEvents, setRawEvents] = useState<WebhookSyncRecord[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  // Fetch raw webhook events
  const fetchLogs = async () => {
    try {
      setIsLoadingLogs(true);
      const res = await fetch("/api/webhook/events?limit=30");
      if (res.ok) {
        const data = await res.json();
        setRawEvents(data.events || []);
      }
    } catch (e) {
      console.error("Error fetching logs:", e);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  useEffect(() => {
    if (activeTab === "raw_logs") {
      fetchLogs();
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
      const mins = s.durationMinutes || s.durationReal || Math.round((s.effectiveHours || 0) * 60) || 0;
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
    if (
      !confirm(
        "¿Deseas ejecutar la Reconciliación Maestra? Esto auditará todas las sesiones registradas, eliminará sesiones duplicadas y recalculará las horas exactas de cada tema."
      )
    ) {
      return;
    }
    try {
      setIsReconciling(true);
      await deduplicateUserSessions(false);
      await reconcileAllTopicsAndSessions();
      toast.success("✅ Reconciliación completada con éxito.");
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
          setActiveTab("quarantine");
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
      const res = await fetch("/api/webhook/ping", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${webhookToken || "wp_qLXi6WFkFY_live"}`,
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
        setActiveTab("quarantine");
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
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-md flex items-center justify-center p-0 sm:p-4 md:p-6 overflow-hidden">
      <div className="bg-white rounded-none sm:rounded-3xl shadow-2xl border-0 sm:border border-slate-200/80 w-full max-w-5xl h-full sm:h-[92vh] max-h-none sm:max-h-[850px] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* TOP HEADER */}
        <div className="px-3.5 py-2.5 sm:px-6 sm:py-3.5 border-b border-slate-100 bg-white flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-xs shrink-0">
              <SlidersHorizontal size={16} strokeWidth={2.2} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight font-serif truncate">
                  Centro de Control · AeroFocus
                </h1>
                <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Enlace Activo
                </span>
              </div>
              <p className="hidden sm:block text-xs text-slate-500 mt-0.5 truncate">
                Conciliación y auditoría de sesiones para tu expediente oficial de Judicatura
              </p>
            </div>
          </div>

          {/* Top Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              onClick={handleReconcile}
              disabled={isReconciling}
              className="px-2.5 sm:px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 transition-colors flex items-center gap-1 disabled:opacity-50"
              title="Audita todas las sesiones y recalcula determinísticamente horas, vueltas y temas"
            >
              <RefreshCw size={12} className={cn(isReconciling && "animate-spin text-slate-600")} />
              <span className="hidden sm:inline">{isReconciling ? "Reconciliando..." : "Reconciliar Expediente"}</span>
              <span className="sm:hidden">{isReconciling ? "..." : "Reconciliar"}</span>
            </button>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              title="Cerrar panel"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* STATS STRIP (Compact horizontal scroll on mobile to conserve viewport) */}
        <div className="flex sm:grid sm:grid-cols-4 overflow-x-auto no-scrollbar gap-2 px-3 py-2 sm:px-6 sm:py-3 bg-slate-50/70 border-b border-slate-100 shrink-0">
          <div className="shrink-0 min-w-[125px] sm:min-w-0 px-2.5 py-1.5 sm:px-3.5 sm:py-2 rounded-xl bg-white border border-slate-200/60 shadow-2xs">
            <div className="text-[9px] sm:text-[10px] font-semibold text-slate-400 uppercase tracking-wider truncate">Sesiones Totales</div>
            <div className="text-base sm:text-lg font-bold font-mono tabular-nums text-slate-900 mt-0.5">
              {metrics.totalSessions}
            </div>
          </div>

          <div className="shrink-0 min-w-[125px] sm:min-w-0 px-2.5 py-1.5 sm:px-3.5 sm:py-2 rounded-xl bg-white border border-slate-200/60 shadow-2xs">
            <div className="text-[9px] sm:text-[10px] font-semibold text-slate-400 uppercase tracking-wider truncate">Horas Auditadas</div>
            <div className="text-base sm:text-lg font-bold font-mono tabular-nums text-blue-600 mt-0.5">
              {metrics.totalHours} <span className="text-[10px] sm:text-xs font-normal text-slate-400 font-sans">h netas</span>
            </div>
          </div>

          <div className="shrink-0 min-w-[125px] sm:min-w-0 px-2.5 py-1.5 sm:px-3.5 sm:py-2 rounded-xl bg-white border border-slate-200/60 shadow-2xs">
            <div className="text-[9px] sm:text-[10px] font-semibold text-slate-400 uppercase tracking-wider truncate">Vía AeroFocus</div>
            <div className="text-base sm:text-lg font-bold font-mono tabular-nums text-indigo-600 mt-0.5 flex items-center gap-1">
              {metrics.aeroCount}
              <Sparkles size={12} className="text-indigo-400" />
            </div>
          </div>

          <div className="shrink-0 min-w-[135px] sm:min-w-0 px-2.5 py-1.5 sm:px-3.5 sm:py-2 rounded-xl bg-amber-50/60 border border-amber-200/70 shadow-2xs">
            <div className="text-[9px] sm:text-[10px] font-semibold text-amber-700 uppercase tracking-wider truncate">Dificultad Pendiente</div>
            <div className="text-base sm:text-lg font-bold font-mono tabular-nums text-amber-900 mt-0.5 flex items-center justify-between gap-1">
              <span>{metrics.pendingDiffCount}</span>
              {metrics.pendingDiffCount > 0 && (
                <span className="text-[9px] sm:text-[10px] font-semibold text-amber-700 bg-amber-100/90 px-1.5 py-0.2 rounded-full">
                  Evaluar
                </span>
              )}
            </div>
          </div>
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
                >
                  <ShieldCheck size={11} className="text-emerald-600" />
                  <span>{isTestingWebhook ? "..." : "Ping"}</span>
                </button>

                <button
                  onClick={() => fetchQuarantinedEvents()}
                  disabled={isLoadingQuarantine}
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
                    title="Vaciar cuarentena"
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

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => discardQuarantineEvent(evt.id)}
                              className="px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-700 bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-200 transition-colors flex items-center gap-1"
                              title="Descartar este vuelo"
                            >
                              <Trash2 size={12} />
                              <span>Descartar</span>
                            </button>

                            <button
                              onClick={() => approveQuarantineEvent(evt.id)}
                              className="px-4 py-1.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-xs transition-colors flex items-center gap-1.5"
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
                            const durationMins =
                              t.effectiveMinutes || Math.round((t.effectiveHours || 0) * 60) || 45;
                            const currentDiff =
                              t.dificultadReal !== undefined ? t.dificultadReal : t.difficulty;
                            const completesVuelta =
                              t.completesVuelta !== undefined
                                ? t.completesVuelta
                                : t.modality === "repaso" || t.modality === "canto";

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

                                  <button
                                    onClick={() => {
                                      setReassigningItem({ eventId: evt.id, topicIndex: idx });
                                      setReassignSearch("");
                                    }}
                                    className="px-2.5 py-1 rounded-lg text-xs font-medium text-slate-600 bg-white hover:bg-slate-100 border border-slate-200 transition-colors flex items-center gap-1"
                                    title="Reasignar a otro tema del temario oficial"
                                  >
                                    <BookOpen size={11} className="text-slate-400" />
                                    <span>Cambiar tema</span>
                                  </button>
                                </div>

                                {/* Row 2: Duration, Difficulty rating (1-10) and Vuelta Toggle */}
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 pt-2 border-t border-slate-100 text-xs">
                                  <div className="flex items-center justify-between sm:justify-start gap-4">
                                    {/* Duration Stepper */}
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-slate-400 font-medium text-[11px] uppercase tracking-wider">Tiempo:</span>
                                      <div className="flex items-center gap-1">
                                        <button
                                          onClick={() =>
                                            updateQuarantineTopic(evt.id, idx, {
                                              effectiveMinutes: Math.max(5, durationMins - 5),
                                              effectiveHours: Math.max(5, durationMins - 5) / 60,
                                            })
                                          }
                                          className="w-6 h-6 rounded-md bg-white border border-slate-200 hover:bg-slate-100 active:scale-95 text-slate-700 flex items-center justify-center font-bold text-xs"
                                        >
                                          -
                                        </button>
                                        <span className="font-mono font-bold text-slate-900 px-1.5 tabular-nums text-xs">
                                          {durationMins} min
                                        </span>
                                        <button
                                          onClick={() =>
                                            updateQuarantineTopic(evt.id, idx, {
                                              effectiveMinutes: durationMins + 5,
                                              effectiveHours: (durationMins + 5) / 60,
                                            })
                                          }
                                          className="w-6 h-6 rounded-md bg-white border border-slate-200 hover:bg-slate-100 active:scale-95 text-slate-700 flex items-center justify-center font-bold text-xs"
                                        >
                                          +
                                        </button>
                                      </div>
                                    </div>

                                    {/* Vuelta Checkbox */}
                                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                                      <input
                                        type="checkbox"
                                        checked={completesVuelta}
                                        onChange={(e) =>
                                          updateQuarantineTopic(evt.id, idx, {
                                            completesVuelta: e.target.checked,
                                          })
                                        }
                                        className="rounded text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5"
                                      />
                                      <span className={cn("text-[11px] font-semibold", completesVuelta ? "text-emerald-700" : "text-slate-500")}>
                                        {completesVuelta ? "✓ Vuelta Oficial" : "Parcial"}
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
                                            onClick={() =>
                                              updateQuarantineTopic(evt.id, idx, {
                                                difficulty: num,
                                                dificultadReal: num,
                                              })
                                            }
                                            className={cn(
                                              "w-6 h-6 rounded-md text-[11px] font-bold font-mono transition-colors flex items-center justify-center shrink-0",
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
                  type="text"
                  placeholder="Buscar por tema, número o notas..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-all"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
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
                  value={sourceFilter}
                  onChange={(e) => setSourceFilter(e.target.value as any)}
                  className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none"
                >
                  <option value="all">Origen: Todos</option>
                  <option value="aerofocus">Solo AeroFocus Pro</option>
                  <option value="manual">Solo Manuales</option>
                </select>

                <select
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
                              <span className="font-mono">{session.durationMinutes || 0} min</span>
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
                                deleteStudySession(session.id);
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

        {/* TAB 3: CONEXIÓN & WEBHOOK (DEDICATED, CLEAN) */}
        {activeTab === "webhook" && (
          <div className="flex-1 p-8 overflow-y-auto bg-slate-50/50">
            <div className="max-w-2xl mx-auto space-y-6">
              <div>
                <h3 className="text-base font-bold text-slate-900 font-serif">
                  Ajustes de Sincronización Webhook · AeroFocus Pro
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Copia estas credenciales en AeroFocus Pro para que tus sesiones aterricen en tiempo real sin pasos intermedios.
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
                    readOnly
                    value={webhookToken || "wp_qLXi6WFkFY_live"}
                    className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-emerald-700 font-bold select-all focus:outline-none"
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(webhookToken || "wp_qLXi6WFkFY_live");
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

              {/* Clean Maintenance Section */}
              <div className="p-5 rounded-2xl bg-slate-100/60 border border-slate-200 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                  <Wrench size={13} className="text-slate-500" />
                  <span>Mantenimiento & Limpieza de Datos</span>
                </div>
                <p className="text-xs text-slate-500">
                  Si deseas eliminar datos de prueba antiguos o reiniciar tu bandeja de sincronización:
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    onClick={() => {
                      if (confirm("¿Deseas purgar todas las sesiones de prueba de AeroFocus?")) {
                        setIsPurging(true);
                        purgeAllAeroFocusData()
                          .then(() => toast.success("Sesiones de AeroFocus purgadas."))
                          .finally(() => setIsPurging(false));
                      }
                    }}
                    disabled={isPurging}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white hover:bg-rose-50 text-rose-700 border border-slate-200 hover:border-rose-200 transition-colors"
                  >
                    Purgar datos de prueba
                  </button>

                  <button
                    onClick={handleReconcile}
                    disabled={isReconciling}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 transition-colors"
                  >
                    Reconciliación Maestra
                  </button>
                </div>
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
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 font-serif">Pegar Reporte o Cierre de AeroFocus</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Interpreta cualquier formato JSON, texto o tabla de temas y minutos
                </p>
              </div>
              <button
                onClick={() => setIsPasteModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X size={16} />
              </button>
            </div>

            <textarea
              rows={9}
              value={pasteJsonText}
              onChange={(e) => setPasteJsonText(e.target.value)}
              placeholder={'// Pega aquí el JSON o reporte copiado de AeroFocus:\n{\n  "date": "2026-10-28",\n  "topics": [\n    {\n      "materia": "Civil",\n      "tema": "Tema 14",\n      "effectiveMinutes": 90,\n      "modality": "repaso"\n    }\n  ]\n}\n\n// O también texto libre:\nCivil Tema 14 - 90 min - Repaso'}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/10 placeholder:text-slate-400"
            />

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
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
                <span>Interpretar y Cargar en Cuarentena</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Topic Reassignment Modal */}
      {reassigningItem && (
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg h-[80vh] max-h-[600px] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 font-serif">Reasignar Tema Oficial</h3>
                <p className="text-xs text-slate-500 mt-0.5">Selecciona el tema oficial correspondiente</p>
              </div>
              <button
                onClick={() => setReassigningItem(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 border-b border-slate-100 bg-slate-50/50">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar por número o título..."
                  value={reassignSearch}
                  onChange={(e) => setReassignSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  autoFocus
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
