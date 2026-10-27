import React, { useState, useMemo, useEffect } from "react";
import {
  X,
  RefreshCw,
  Search,
  Filter,
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
  Trash,
  Send,
  ExternalLink,
  HelpCircle,
  BarChart2,
  Copy,
  Plane,
  Radio,
  Check,
  Zap
} from "lucide-react";
import { useFirebase } from "../lib/FirebaseProvider";
import { initialSubjects, initialTopics } from "../data/initialData";
import { EditSessionDialog } from "./EditSessionDialog";
import { toast } from "sonner";
import { cn } from "../lib/utils";
import { WebhookSyncRecord } from "../lib/webhookTypes";
import { simulateAeroFocusFlight } from "../hooks/useAeroFocusSync";

interface SyncControlCenterDialogProps {
  onClose: () => void;
}

export function SyncControlCenterDialog({ onClose }: SyncControlCenterDialogProps) {
  const {
    user,
    recentSessions = [],
    userProgress,
    deleteStudySession,
    quickUpdateSessionDifficulty,
    reconcileAllTopicsAndSessions,
    syncPendingWebhookEvents,
    isSyncingWebhooks,
    webhookToken,
    purgeAllAeroFocusData,
    purgePhantomTema5Cante,
    migratePenalSessionsToConstitucional5,
    deduplicateUserSessions,
    recoverHistoricalUserData,
    quarantinedEvents = [],
    isLoadingQuarantine,
    fetchQuarantinedEvents,
    approveQuarantineEvent,
    discardQuarantineEvent,
    clearAllQuarantine,
    addQuarantineEventManually,
    updateQuarantineEvent,
    updateQuarantineTopic,
    mergeQuarantineTopics,
    aerofocusBetaEnabled,
    setAerofocusBetaEnabled,
  } = useFirebase();

  const [activeTab, setActiveTab] = useState<"quarantine" | "sessions" | "raw_logs">("quarantine");
  const [searchQuery, setSearchQuery] = useState("");
  const [subjectFilter, setSubjectFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<"all" | "aerofocus" | "manual">("all");
  const [difficultyFilter, setDifficultyFilter] = useState<"all" | "pending" | "rated">("all");
  
  // Selected session for full editing
  const [editingSession, setEditingSession] = useState<any | null>(null);

  // Reconciling state
  const [isReconciling, setIsReconciling] = useState(false);
  const [isTestingWebhook, setIsTestingWebhook] = useState(false);

  // Manual Paste Modal state
  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
  const [pasteJsonText, setPasteJsonText] = useState("");
  const [isImportingPaste, setIsImportingPaste] = useState(false);
  const [showConnectionInfo, setShowConnectionInfo] = useState(true);
  const [isSimulatingFlight, setIsSimulatingFlight] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);

  // Topic Reassign state
  const [reassigningItem, setReassigningItem] = useState<{ eventId: string; topicIndex: number } | null>(null);
  const [reassignSearch, setReassignSearch] = useState("");

  // Raw logs state
  const [rawEvents, setRawEvents] = useState<WebhookSyncRecord[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [selectedRawEvent, setSelectedRawEvent] = useState<WebhookSyncRecord | null>(null);

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

  // Topic lookup helper
  const getTopicInfo = (topicId: string) => {
    const base = initialTopics.find((t) => t.id === topicId);
    if (base) {
      const sub = initialSubjects.find((s) => s.id === base.subjectId);
      return {
        title: base.title,
        number: base.number,
        subjectName: sub ? sub.name : base.subjectId,
        subjectColor: sub ? sub.color : "#64748B",
      };
    }
    const prog = userProgress[topicId];
    if (prog) {
      const sub = initialSubjects.find((s) => s.id === prog.subjectId);
      return {
        title: prog.customTitle || "Tema Personalizado",
        number: prog.number || 999,
        subjectName: sub ? sub.name : prog.subjectId || "Personalizado",
        subjectColor: sub ? sub.color : "#64748B",
      };
    }
    return {
      title: topicId,
      number: 0,
      subjectName: "Desconocido",
      subjectColor: "#94A3B8",
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

  // Filtered sessions
  const filteredSessions = useMemo(() => {
    return recentSessions.filter((s) => {
      const isAero = s.source === "aerofocus" || s.source === "aerofocus_pro";
      // Source filter
      if (sourceFilter === "aerofocus" && !isAero) return false;
      if (sourceFilter === "manual" && isAero) return false;

      // Difficulty filter
      const diff = s.dificultadReal || s.difficulty;
      const isPending = !diff || diff === 0;
      if (difficultyFilter === "pending" && !isPending) return false;
      if (difficultyFilter === "rated" && isPending) return false;

      // Subject filter
      const info = getTopicInfo(s.topicId);
      if (subjectFilter !== "all") {
        const baseTopic = initialTopics.find((t) => t.id === s.topicId);
        const prog = userProgress[s.topicId];
        const subId = baseTopic?.subjectId || prog?.subjectId;
        if (subId !== subjectFilter) return false;
      }

      // Search query
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
    if (!confirm("¿Deseas ejecutar la Reconciliación Maestra? Esto auditará todas las sesiones registradas, eliminará sesiones fantasma de 1 minuto o duplicadas y recalculará las horas exactas de cada tema.")) {
      return;
    }
    try {
      setIsReconciling(true);
      await deduplicateUserSessions(false);
      await reconcileAllTopicsAndSessions();
    } catch (e: any) {
      console.error(e);
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
          toast.success("✅ Cierre de AeroFocus importado desde el portapapeles y depositado en cuarentena.");
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

  // Handle Webhook Connection Test (Ping handshake without inserting fake sessions)
  const handleTestWebhook = async () => {
    try {
      setIsTestingWebhook(true);
      const res = await fetch("/api/webhook/aerofocus", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${webhookToken || "wp_qLXi6WFkFY_live"}`
        },
        body: JSON.stringify({
          isTest: true,
          event: "test_connection"
        })
      });

      let data: any = {};
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        data = await res.json();
      } else {
        const text = await res.text();
        try {
          data = JSON.parse(text);
        } catch {
          data = { error: text || `Error HTTP ${res.status}` };
        }
      }

      if (res.ok && (data.success || data.status === 'ok')) {
        toast.success("✅ Enlace operativo AeroFocus Pro <-> WellsPrep. La pasarela está lista para recibir tus transmisiones de estudio reales sin generar datos ficticios.");
      } else {
        toast.error("Fallo de enlace: " + (data.error || data.message || "Respuesta no autorizada"));
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
          description: "La sesión ha aterrizado en la Bandeja de Cuarentena en tiempo real.",
        });
        await fetchQuarantinedEvents();
      } else {
        toast.error("Fallo al simular: " + res.message);
      }
    } catch (e: any) {
      toast.error("Error: " + (e?.message || e));
    } finally {
      setIsSimulatingFlight(false);
    }
  };

  // Handle Manual Paste JSON / Text
  const handleImportPaste = async () => {
    if (!pasteJsonText.trim()) {
      toast.error("Pega el JSON o reporte de texto de la sesión primero.");
      return;
    }
    try {
      setIsImportingPaste(true);
      const success = await addQuarantineEventManually(pasteJsonText.trim());
      if (success) {
        toast.success("¡Sesión de AeroFocus cargada con éxito en Cuarentena!");
        setPasteJsonText("");
        setIsPasteModalOpen(false);
        setActiveTab("quarantine");
      }
    } catch (e: any) {
      toast.error("Error al procesar: " + (e?.message || e));
    } finally {
      setIsImportingPaste(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-hidden">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/90 w-full max-w-5xl h-[92vh] max-h-[850px] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* TOP HEADER */}
        <div className="px-6 py-4 border-b border-slate-200/70 bg-slate-50/70 flex flex-wrap items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-md shadow-slate-900/10">
              <SlidersHorizontal size={18} strokeWidth={2.2} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black text-slate-900 tracking-tight">
                  Centro de Control de Estudio · AeroFocus Pro
                </h1>
                <span className="text-xs text-emerald-700 font-semibold flex items-center gap-1">
                  <span>·</span>
                  <span>Webhook Activo</span>
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Gestión de sesiones sincronizadas y conciliación de expediente oficial
              </p>
            </div>
          </div>

          {/* Clean Header Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleReconcile}
              disabled={isReconciling}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50"
              title="Audita todas las sesiones y recalcula determinísticamente horas, vueltas y temas"
            >
              <RefreshCw size={13} className={cn(isReconciling && "animate-spin")} />
              <span>{isReconciling ? "Reconciliando..." : "Reconciliar Todo"}</span>
            </button>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors ml-1"
              title="Cerrar panel"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* METRICS STRIP */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-6 py-3.5 bg-white border-b border-slate-100 shrink-0">
          <div className="p-2.5 rounded-2xl bg-slate-50/80 border border-slate-100">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Sesiones Totales</div>
            <div className="text-lg font-black font-mono tabular-nums text-slate-900 mt-0.5">
              {metrics.totalSessions}
            </div>
          </div>

          <div className="p-2.5 rounded-2xl bg-slate-50/80 border border-slate-100">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Horas Auditadas</div>
            <div className="text-lg font-black font-mono tabular-nums text-blue-600 mt-0.5">
              {metrics.totalHours} h
            </div>
          </div>

          <div className="p-2.5 rounded-2xl bg-slate-50/80 border border-slate-100">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Vía AeroFocus Pro</div>
            <div className="text-lg font-black font-mono tabular-nums text-indigo-600 mt-0.5 flex items-center gap-1">
              {metrics.aeroCount}
              <Sparkles size={14} className="text-indigo-400" />
            </div>
          </div>

          <div className="p-2.5 rounded-2xl bg-amber-50/60 border border-amber-200/60">
            <div className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Dificultad Pendiente</div>
            <div className="text-lg font-black font-mono tabular-nums text-amber-800 mt-0.5 flex items-center justify-between">
              <span>{metrics.pendingDiffCount}</span>
              {metrics.pendingDiffCount > 0 && (
                <span className="text-[10px] font-bold text-amber-600 bg-amber-100/80 px-2 py-0.5 rounded-full">
                  Evaluar
                </span>
              )}
            </div>
          </div>
        </div>

        {/* TABS SELECTOR */}
        <div className="flex border-b border-slate-200 px-6 bg-slate-50/40 shrink-0 gap-2">
          <button
            onClick={() => setActiveTab("quarantine")}
            className={cn(
              "py-3 px-4 text-xs font-black tracking-tight border-b-2 transition-all flex items-center gap-2",
              activeTab === "quarantine"
                ? "border-amber-600 text-amber-900 bg-amber-50/40"
                : "border-transparent text-slate-500 hover:text-slate-800"
            )}
          >
            <ShieldAlert size={15} className="text-amber-600" />
            <span>Bandeja de Cuarentena ({quarantinedEvents.length})</span>
            {quarantinedEvents.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            )}
          </button>

          <button
            onClick={() => setActiveTab("sessions")}
            className={cn(
              "py-3 px-4 text-xs font-black tracking-tight border-b-2 transition-all flex items-center gap-2",
              activeTab === "sessions"
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-400 hover:text-slate-700"
            )}
          >
            <Layers size={15} />
            <span>Auditoría de Sesiones ({filteredSessions.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("raw_logs")}
            className={cn(
              "py-3 px-4 text-xs font-black tracking-tight border-b-2 transition-all flex items-center gap-2",
              activeTab === "raw_logs"
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-400 hover:text-slate-700"
            )}
          >
            <Database size={15} />
            <span>Logs Brutos ({rawEvents.length})</span>
          </button>
        </div>

        {/* TAB: QUARANTINE STAGING BUFFER */}
        {activeTab === "quarantine" && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-slate-50/50">
            {/* Quarantine Info Banner & Actions */}
            <div className="p-4 border-b border-amber-200/60 bg-amber-50/50 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-xl bg-amber-100 text-amber-800 shrink-0">
                  <Shield size={18} />
                </div>
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-amber-900">
                    Modo Cuarentena Activo — Blindaje de Expediente Oficial
                  </h4>
                  <p className="text-xs text-amber-800/80 mt-0.5 max-w-2xl leading-relaxed">
                    Las sesiones enviadas por AeroFocus se retienen aquí. Puedes <strong>calificar su dificultad (1-10)</strong>, 
                    <strong> ajustar si completan o no vuelta oficial</strong>, y <strong>unificar repasos partidos</strong> antes de incorporarlas a tu expediente.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  onClick={handleQuickClipboardPaste}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-all flex items-center gap-1.5"
                  title="Importar automáticamente el cierre diario copiado al portapapeles"
                >
                  <Send size={12} className="text-indigo-200" />
                  <span>Pegar Cierre (Portapapeles)</span>
                </button>

                <button
                  onClick={() => setIsPasteModalOpen(true)}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 shadow-xs transition-all flex items-center gap-1.5"
                  title="Pegar JSON o reporte de AeroFocus manualmente"
                >
                  <Edit2 size={12} className="text-slate-500" />
                  <span>Pegar Manual</span>
                </button>

                <button
                  onClick={handleTestWebhook}
                  disabled={isTestingWebhook}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 shadow-xs transition-all flex items-center gap-1.5"
                  title="Comprobar enlace de conexión con AeroFocus Pro (Ping de test sin datos ficticios)"
                >
                  <ShieldCheck size={12} className="text-emerald-600" />
                  <span>{isTestingWebhook ? "Comprobando..." : "Test Enlace"}</span>
                </button>

                <button
                  onClick={() => setShowConnectionInfo(!showConnectionInfo)}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-xs font-bold border shadow-xs transition-all flex items-center gap-1.5",
                    showConnectionInfo
                      ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                      : "bg-white hover:bg-slate-100 text-slate-700 border-slate-200"
                  )}
                  title="Ver Endpoint y Token para configurar la sincronización en AeroFocus Pro"
                >
                  <HelpCircle size={12} className={showConnectionInfo ? "text-indigo-600" : "text-slate-500"} />
                  <span>{showConnectionInfo ? "Ocultar Conexión" : "Ver Datos Webhook"}</span>
                </button>

                <button
                  onClick={() => fetchQuarantinedEvents()}
                  disabled={isLoadingQuarantine}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 shadow-xs transition-all flex items-center gap-1.5"
                  title="Refrescar lista de cuarentena"
                >
                  <RefreshCw size={12} className={cn(isLoadingQuarantine && "animate-spin")} />
                  <span>Actualizar</span>
                </button>

                {quarantinedEvents.length > 0 && (
                  <button
                    onClick={() => {
                      if (confirm("¿Deseas vaciar por completo la bandeja de cuarentena? Se eliminarán todos los registros retenidos.")) {
                        clearAllQuarantine();
                      }
                    }}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200/80 shadow-xs transition-all flex items-center gap-1.5"
                    title="Vaciar todos los registros de la cuarentena"
                  >
                    <Trash2 size={12} className="text-rose-600" />
                    <span>Vaciar Cuarentena ({quarantinedEvents.length})</span>
                  </button>
                )}
              </div>
            </div>

            {/* AeroFocus Pro Live Link & Webhook Configuration Card */}
            {showConnectionInfo && (
              <div className="px-5 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white border-b border-indigo-900/50 flex flex-col gap-4 animate-in fade-in duration-200 shrink-0 shadow-inner">
                {/* Header with live status and quick actions */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="relative flex items-center justify-center">
                      <span className="w-3 h-3 rounded-full bg-emerald-500 animate-ping absolute opacity-75"></span>
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black tracking-wider uppercase text-white font-mono">
                          Enlace en Vivo AeroFocus Pro
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                          <Zap size={10} className="text-emerald-400" />
                          SSE 0ms · Automático
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300 mt-0.5">
                        Al aterrizar un vuelo en AeroFocus Pro, los minutos y temas entran solos aquí sin tocar nada.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleSimulateFlight}
                      disabled={isSimulatingFlight}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50"
                      title="Genera un vuelo de prueba para verificar que la recepción automática en tiempo real funciona perfectamente"
                    >
                      <Plane size={13} className={cn("text-slate-950", isSimulatingFlight && "animate-bounce")} />
                      <span>{isSimulatingFlight ? "Aterrizando..." : "Simular Aterrizaje en Vivo"}</span>
                    </button>

                    <button
                      onClick={() => setShowConnectionInfo(false)}
                      className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded-lg transition-colors"
                    >
                      Ocultar
                    </button>
                  </div>
                </div>

                {/* Webhook Parameters (URL + Token) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  {/* Webhook URL Card */}
                  <div className="bg-slate-800/80 p-3.5 rounded-2xl border border-indigo-500/20 shadow-sm flex flex-col justify-between backdrop-blur-xs">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-black uppercase text-indigo-300 tracking-wider">
                          1. URL del Webhook (POST)
                        </span>
                        <span className="text-[10px] text-slate-400 font-sans">
                          AeroFocus &gt; Ajustes &gt; Webhook URL
                        </span>
                      </div>
                      <div className="font-mono text-emerald-300 select-all text-[11px] bg-slate-950/70 p-2.5 rounded-xl border border-slate-700/60 break-all">
                        {typeof window !== "undefined" ? `${window.location.origin}/api/webhook/aerofocus` : "/api/webhook/aerofocus"}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        const url = typeof window !== "undefined" ? `${window.location.origin}/api/webhook/aerofocus` : "/api/webhook/aerofocus";
                        navigator.clipboard.writeText(url);
                        setCopiedUrl(true);
                        setTimeout(() => setCopiedUrl(false), 2500);
                        toast.success("URL del Webhook copiada al portapapeles.");
                      }}
                      className={cn(
                        "mt-2.5 px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 self-start transition-all",
                        copiedUrl
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          : "bg-indigo-600/50 hover:bg-indigo-600 text-indigo-100 border border-indigo-400/30"
                      )}
                    >
                      {copiedUrl ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                      <span>{copiedUrl ? "¡URL Copiada!" : "Copiar URL del Webhook"}</span>
                    </button>
                  </div>

                  {/* Token Card */}
                  <div className="bg-slate-800/80 p-3.5 rounded-2xl border border-indigo-500/20 shadow-sm flex flex-col justify-between backdrop-blur-xs">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-black uppercase text-indigo-300 tracking-wider">
                          2. Token de Autorización
                        </span>
                        <span className="text-[10px] text-slate-400 font-sans">
                          AeroFocus &gt; Ajustes &gt; Token / API Key
                        </span>
                      </div>
                      <div className="font-mono text-emerald-300 select-all text-[11px] bg-slate-950/70 p-2.5 rounded-xl border border-slate-700/60 break-all">
                        {webhookToken || "wp_qLXi6WFkFY_live"}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        const tok = webhookToken || "wp_qLXi6WFkFY_live";
                        navigator.clipboard.writeText(tok);
                        setCopiedToken(true);
                        setTimeout(() => setCopiedToken(false), 2500);
                        toast.success("Token copiado al portapapeles.");
                      }}
                      className={cn(
                        "mt-2.5 px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 self-start transition-all",
                        copiedToken
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          : "bg-indigo-600/50 hover:bg-indigo-600 text-indigo-100 border border-indigo-400/30"
                      )}
                    >
                      {copiedToken ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                      <span>{copiedToken ? "¡Token Copiado!" : "Copiar Token"}</span>
                    </button>
                  </div>
                </div>

                {/* 3-Step Setup Quick Note */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800/80 text-[11px] text-slate-300">
                  <div className="flex items-center gap-3">
                    <span className="text-indigo-300 font-bold">Guía en 3 pasos:</span>
                    <span>1. En AeroFocus Pro ve a Ajustes</span>
                    <span>&rarr;</span>
                    <span>2. Pega la URL y el Token</span>
                    <span>&rarr;</span>
                    <span>3. ¡Al aterrizar, la sesión aparece sola aquí!</span>
                  </div>
                  <button
                    onClick={handleTestWebhook}
                    disabled={isTestingWebhook}
                    className="text-xs text-indigo-300 hover:text-white underline font-semibold transition-colors"
                  >
                    {isTestingWebhook ? "Verificando..." : "Comprobar Enlace (Ping)"}
                  </button>
                </div>
              </div>
            )}

            {/* Quarantine List */}
            <div className="flex-1 p-6 overflow-y-auto min-h-0">
              {quarantinedEvents.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-8">
                  <div className="w-14 h-14 rounded-3xl bg-emerald-50 text-emerald-600 border border-emerald-200/80 flex items-center justify-center shadow-xs mb-3">
                    <ShieldCheck size={28} />
                  </div>
                  <h3 className="text-base font-black text-slate-800 font-serif">
                    Bandeja de Cuarentena Limpia y Lista
                  </h3>
                  <p className="text-xs text-slate-500 max-w-md mt-1 leading-relaxed">
                    No hay sesiones retenidas pendientes. Puedes recibir transmisiones automáticas vía Webhook o pulsar abajo para pegar tu cierre diario de AeroFocus.
                  </p>
                  <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
                    <button
                      onClick={handleSimulateFlight}
                      disabled={isSimulatingFlight}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Plane size={13} className={cn("text-slate-950", isSimulatingFlight && "animate-bounce")} />
                      <span>{isSimulatingFlight ? "Aterrizando vuelo..." : "Simular Aterrizaje en Vivo"}</span>
                    </button>
                    <button
                      onClick={handleQuickClipboardPaste}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition-all flex items-center gap-1.5"
                    >
                      <Send size={13} className="text-indigo-200" />
                      <span>Pegar Cierre (Portapapeles)</span>
                    </button>
                    <button
                      onClick={() => setIsPasteModalOpen(true)}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 transition-all flex items-center gap-1.5"
                    >
                      <Edit2 size={13} className="text-slate-500" />
                      <span>Pegar JSON Manual</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-6 max-w-4xl mx-auto">
                  {quarantinedEvents.map((evt) => {
                    // Check for duplicate topics within this transmission (e.g. split reviews of same topic)
                    const topicFrequency = new Map<string, number[]>();
                    (evt.topics || []).forEach((t, index) => {
                      const tid = t.resolvedTopicId;
                      if (tid) {
                        const existing = topicFrequency.get(tid) || [];
                        existing.push(index);
                        topicFrequency.set(tid, existing);
                      }
                    });

                    const duplicateEntries = Array.from(topicFrequency.entries()).filter(([_, indices]) => indices.length > 1);

                    return (
                      <div
                        key={evt.id}
                        className="bg-white rounded-3xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all flex flex-col overflow-hidden"
                      >
                        {/* Event Card Header */}
                        <div className="px-5 py-4 bg-slate-50/80 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5">
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-200">
                              En Cuarentena
                            </span>
                            <span className="font-mono text-xs font-bold text-slate-700">
                              Vuelo #{evt.flightId || evt.id.slice(-6)}
                            </span>
                            <span className="text-slate-300">·</span>
                            <span className="text-xs text-slate-500 flex items-center gap-1">
                              <Clock size={12} />
                              {evt.date || "Hoy"}
                            </span>
                            <span className="text-slate-300">·</span>
                            <span className="text-xs font-bold text-slate-700">
                              {evt.totalFlightEffectiveHours || (evt.totalFlightEffectiveMinutes ? (evt.totalFlightEffectiveMinutes / 60).toFixed(1) : 0)} horas netas
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => discardQuarantineEvent(evt.id)}
                              className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200/70 transition-all flex items-center gap-1"
                              title="Descartar sin alterar tu expediente"
                            >
                              <Trash2 size={13} />
                              <span>Denegar / Descartar</span>
                            </button>
                            <button
                              onClick={() => approveQuarantineEvent(evt.id)}
                              className="px-4 py-1.5 rounded-xl text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm transition-all flex items-center gap-1.5"
                            >
                              <CheckCircle2 size={14} />
                              <span>Aprobar e Incorporar</span>
                            </button>
                          </div>
                        </div>

                        {/* Split Review Merge Notice Banner if duplicates exist */}
                        {duplicateEntries.length > 0 && (
                          <div className="px-5 py-3 bg-indigo-50/70 border-b border-indigo-100 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 text-xs text-indigo-950 font-bold">
                              <Layers size={14} className="text-indigo-600 shrink-0" />
                              <span>
                                Se han detectado {duplicateEntries.length} temas divididos en varias sesiones (repasos partidos).
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {duplicateEntries.map(([tid, indices]) => {
                                const firstTopic = evt.topics[indices[0]];
                                return (
                                  <button
                                    key={tid}
                                    onClick={() => mergeQuarantineTopics(evt.id, indices[0], indices[1])}
                                    className="px-3 py-1 rounded-lg text-xs font-black text-indigo-700 bg-white hover:bg-indigo-100 border border-indigo-200 shadow-2xs transition-all flex items-center gap-1.5"
                                  >
                                    <Sparkles size={11} className="text-indigo-600" />
                                    <span>Fusionar {firstTopic?.resolvedTopicTitle?.split(":")[0] || tid} ({indices.length} partes)</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Interactive Topics List */}
                        <div className="p-5 space-y-4">
                          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                            <span>Personalización previa de temas ({evt.topics?.length || 0}):</span>
                            <span className="text-[10px] text-slate-400 font-normal">
                              Puedes calificar dificultad y ajustar si suma vuelta antes de aprobar
                            </span>
                          </div>

                          <div className="space-y-3">
                            {(evt.topics || []).map((t, idx) => {
                              const durationMins = t.effectiveMinutes || Math.round((t.effectiveHours || 0) * 60) || 45;
                              const currentDiff = t.dificultadReal !== undefined ? t.dificultadReal : t.difficulty;
                              const isRated = currentDiff !== undefined && currentDiff > 0;
                              const completesVuelta = t.completesVuelta !== undefined ? t.completesVuelta : (t.modality === 'repaso' || t.modality === 'canto');

                              return (
                                <div
                                  key={idx}
                                  className="p-4 rounded-2xl bg-slate-50/70 border border-slate-200/80 hover:border-slate-300 transition-all flex flex-col gap-3.5"
                                >
                                  {/* Row 1: Topic Title, Badge & Reassign */}
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-slate-200 font-bold text-slate-700 shrink-0">
                                        {t.resolvedTopicId}
                                      </span>
                                      <span className="text-xs font-black text-slate-900 truncate">
                                        {t.resolvedTopicTitle || "Tema no especificado"}
                                      </span>
                                    </div>

                                    <button
                                      onClick={() => {
                                        setReassigningItem({ eventId: evt.id, topicIndex: idx });
                                        setReassignSearch("");
                                      }}
                                      className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-slate-600 bg-white hover:bg-slate-100 border border-slate-200 transition-all flex items-center gap-1"
                                      title="Cambiar tema asignado"
                                    >
                                      <Edit2 size={11} />
                                      <span>Cambiar tema</span>
                                    </button>
                                  </div>

                                  {/* Row 2: Modality, Duration & Vuelta Toggle */}
                                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
                                    {/* Modality Selector */}
                                    <div>
                                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                                        Modalidad
                                      </label>
                                      <select
                                        value={t.modality || "repaso"}
                                        onChange={(e) => updateQuarantineTopic(evt.id, idx, { modality: e.target.value as any })}
                                        className="w-full px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none"
                                      >
                                        <option value="repaso">Repaso</option>
                                        <option value="primer_estudio">Primer Estudio</option>
                                        <option value="refresco">Refresco</option>
                                        <option value="canto">Cante</option>
                                      </select>
                                    </div>

                                    {/* Duration Adjuster */}
                                    <div>
                                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                                        Duración Efectiva (minutos)
                                      </label>
                                      <div className="flex items-center gap-1">
                                        <button
                                          onClick={() => {
                                            const newMins = Math.max(5, durationMins - 15);
                                            updateQuarantineTopic(evt.id, idx, { 
                                              effectiveMinutes: newMins,
                                              effectiveHours: Math.round((newMins / 60) * 100) / 100 
                                            });
                                          }}
                                          className="w-7 h-7 rounded-lg bg-white border border-slate-200 text-xs font-black text-slate-600 hover:bg-slate-100 flex items-center justify-center shrink-0"
                                        >
                                          -
                                        </button>
                                        <input
                                          type="number"
                                          min="1"
                                          max="600"
                                          value={durationMins}
                                          onChange={(e) => {
                                            const val = parseInt(e.target.value, 10) || 0;
                                            updateQuarantineTopic(evt.id, idx, { 
                                              effectiveMinutes: val,
                                              effectiveHours: Math.round((val / 60) * 100) / 100 
                                            });
                                          }}
                                          className="w-full text-center px-2 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-mono font-bold text-slate-900"
                                        />
                                        <button
                                          onClick={() => {
                                            const newMins = durationMins + 15;
                                            updateQuarantineTopic(evt.id, idx, { 
                                              effectiveMinutes: newMins,
                                              effectiveHours: Math.round((newMins / 60) * 100) / 100 
                                            });
                                          }}
                                          className="w-7 h-7 rounded-lg bg-white border border-slate-200 text-xs font-black text-slate-600 hover:bg-slate-100 flex items-center justify-center shrink-0"
                                        >
                                          +
                                        </button>
                                      </div>
                                    </div>

                                    {/* Vuelta Toggle (Critical for partial reviews) */}
                                    <div>
                                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                                        ¿Suma Vuelta Oficial?
                                      </label>
                                      <button
                                        type="button"
                                        onClick={() => updateQuarantineTopic(evt.id, idx, { completesVuelta: !completesVuelta })}
                                        className={cn(
                                          "w-full px-3 py-1.5 rounded-xl text-xs font-black border transition-all flex items-center justify-between gap-1.5",
                                          completesVuelta
                                            ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                                            : "bg-amber-50 text-amber-800 border-amber-300"
                                        )}
                                        title="Si fue un repaso partido que no terminó el tema, marca 'No' para sumar horas sin falsear tus vueltas"
                                      >
                                        <span>{completesVuelta ? "✓ Sí, completa vuelta" : "⚠️ No, repaso parcial"}</span>
                                        <span className="text-[10px] underline font-normal">Cambiar</span>
                                      </button>
                                    </div>
                                  </div>

                                  {/* Row 3: Difficulty Rating Selector (1 to 10) */}
                                  <div className="pt-2 border-t border-slate-200/60">
                                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                                        Calificación de Dificultad (1 = Fácil, 10 = Máxima dificultad):
                                      </span>
                                      <button
                                        onClick={() => updateQuarantineTopic(evt.id, idx, { difficulty: undefined, dificultadReal: undefined })}
                                        className={cn(
                                          "text-[10px] font-bold px-2 py-0.5 rounded-md transition-all",
                                          !isRated ? "bg-amber-100 text-amber-800 font-black" : "text-slate-400 hover:text-slate-700"
                                        )}
                                      >
                                        {!isRated ? "⚠️ Sin calificar (Pendiente)" : "Dejar sin calificar"}
                                      </button>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-1.5">
                                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((score) => {
                                        const isSelected = currentDiff === score;
                                        return (
                                          <button
                                            key={score}
                                            onClick={() => updateQuarantineTopic(evt.id, idx, { difficulty: score, dificultadReal: score })}
                                            className={cn(
                                              "w-7 h-7 rounded-lg text-xs font-black transition-all flex items-center justify-center font-mono cursor-pointer",
                                              isSelected
                                                ? "bg-slate-900 text-white shadow-xs scale-105 ring-2 ring-slate-900/20"
                                                : "bg-white hover:bg-slate-200 text-slate-700 border border-slate-200"
                                            )}
                                          >
                                            {score}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>

                                  {/* Row 4: Custom Notes */}
                                  <div>
                                    <input
                                      type="text"
                                      placeholder="Notas u observaciones de este repaso..."
                                      value={t.notes || ""}
                                      onChange={(e) => updateQuarantineTopic(evt.id, idx, { notes: e.target.value })}
                                      className="w-full px-3 py-1 bg-white border border-slate-200 rounded-lg text-[11px] text-slate-700 focus:outline-none"
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 1: AUDIT & SESSIONS */}
        {activeTab === "sessions" && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Filter controls */}
            <div className="p-4 border-b border-slate-100 bg-white flex flex-wrap items-center justify-between gap-3 shrink-0">
              {/* Search input */}
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

              {/* Segmented Filter Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Subject dropdown */}
                <select
                  value={subjectFilter}
                  onChange={(e) => setSubjectFilter(e.target.value)}
                  className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none"
                >
                  <option value="all">Todos los bloques</option>
                  {initialSubjects.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>

                {/* Source filter */}
                <select
                  value={sourceFilter}
                  onChange={(e) => setSourceFilter(e.target.value as any)}
                  className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none"
                >
                  <option value="all">Origen: Todos</option>
                  <option value="aerofocus">Solo AeroFocus Pro</option>
                  <option value="manual">Solo Manuales</option>
                </select>

                {/* Difficulty filter */}
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
            <div className="flex-1 overflow-y-auto no-scrollbar">
              {filteredSessions.length === 0 ? (
                <div className="py-20 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center mb-3">
                    <Clock size={20} />
                  </div>
                  <h3 className="text-sm font-bold text-slate-800">No hay sesiones que coincidan</h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                    Prueba a cambiar los filtros de búsqueda o simula un test de webhook arriba.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {filteredSessions.map((session) => {
                    const info = getTopicInfo(session.topicId);
                    const diff = session.dificultadReal || session.difficulty;
                    const isPendingDiff = !diff || diff === 0;
                    const durationMins = session.durationMinutes || session.durationReal || Math.round((session.effectiveHours || 0) * 60) || 0;
                    const durationHours = (durationMins / 60).toFixed(1);

                    return (
                      <div
                        key={session.id}
                        className="px-6 py-4 hover:bg-slate-50/80 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3 group"
                      >
                        {/* Left: Date, Topic, Modality */}
                        <div className="flex items-start gap-3.5 flex-1 min-w-0">
                          <div className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: info.subjectColor }} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold text-slate-400">
                                {session.date}
                              </span>
                              <span className="text-[11px] font-bold text-slate-600">
                                {info.subjectName}
                              </span>
                              <span className="text-slate-300">·</span>
                              <span className="text-xs font-black text-slate-900 truncate">
                                Tema {info.number}: {info.title}
                              </span>
                            </div>

                            <div className="flex items-center gap-2.5 mt-1 text-xs text-slate-500 flex-wrap">
                              <span className="capitalize font-bold text-slate-700">
                                {session.modality || session.type || "Repaso"}
                              </span>
                              <span>·</span>
                              <span className="font-mono tabular-nums font-bold text-slate-800">
                                {durationMins} min ({durationHours} h)
                              </span>
                              {(session.source === "aerofocus" || session.source === "aerofocus_pro") ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-black text-blue-700 bg-blue-50 border border-blue-200/60 px-2 py-0.5 rounded-md">
                                  <Sparkles size={11} /> AeroFocus
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">
                                  Manual
                                </span>
                              )}
                              {session.completesVuelta === true ? (
                                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/50">
                                  Vuelta completa
                                </span>
                              ) : session.completesVuelta === false ? (
                                <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                                  Sesión parcial
                                </span>
                              ) : null}
                              {session.notes && (
                                <span className="text-slate-400 italic truncate max-w-xs">
                                  "{session.notes}"
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Right: Quick Difficulty Rater + Action Buttons */}
                        <div className="flex items-center gap-3 shrink-0 self-end md:self-center">
                          {/* Difficulty rating pill or interactive quick selector */}
                          <div className="flex items-center gap-1.5">
                            {isPendingDiff ? (
                              <div className="flex items-center gap-1 bg-amber-50 border border-amber-200/80 px-2 py-1 rounded-xl">
                                <span className="text-[10px] font-black uppercase text-amber-700 mr-1">
                                  Calificar:
                                </span>
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((score) => (
                                  <button
                                    key={score}
                                    onClick={() => quickUpdateSessionDifficulty(session.id, score, session.topicId)}
                                    className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-mono font-black bg-white hover:bg-slate-900 hover:text-white border border-amber-200/60 transition-colors shadow-2xs"
                                    title={`Calificar con dificultad ${score}/10`}
                                  >
                                    {score}
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <div
                                onClick={() => setEditingSession(session)}
                                className={cn(
                                  "px-2.5 py-1 rounded-xl text-xs font-black font-mono tabular-nums cursor-pointer hover:opacity-80 transition-opacity border",
                                  diff <= 3 ? "bg-emerald-50 text-emerald-800 border-emerald-200" :
                                  diff <= 6 ? "bg-amber-50 text-amber-800 border-amber-200" :
                                  "bg-rose-50 text-rose-800 border-rose-200"
                                )}
                                title="Dificultad (clic para cambiar)"
                              >
                                Dif: {diff}/10
                              </div>
                            )}
                          </div>

                          {/* Edit Button */}
                          <button
                            onClick={() => setEditingSession(session)}
                            className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                            title="Editar y reasignar sesión"
                          >
                            <Edit2 size={15} />
                          </button>

                          {/* Delete Button */}
                          <button
                            onClick={async () => {
                              if (confirm(`¿Eliminar sesión del Tema ${info.number}? Las horas se restarán del progreso.`)) {
                                await deleteStudySession(session.topicId, session.id);
                              }
                            }}
                            className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Eliminar sesión"
                          >
                            <Trash2 size={15} />
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

        {/* TAB 2: RAW WEBHOOK LOGS */}
        {activeTab === "raw_logs" && (
          <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden divide-y md:divide-y-0 md:divide-x divide-slate-200">
            {/* Logs List */}
            <div className="w-full md:w-1/2 flex flex-col overflow-hidden bg-slate-50/50">
              <div className="p-3 border-b border-slate-200 flex items-center justify-between shrink-0 bg-white">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Eventos Recibidos por el Servidor
                </span>
                <button
                  onClick={fetchLogs}
                  disabled={isLoadingLogs}
                  className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
                  title="Refrescar logs"
                >
                  <RefreshCw size={13} className={cn(isLoadingLogs && "animate-spin")} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-slate-100 no-scrollbar">
                {rawEvents.length === 0 ? (
                  <div className="py-16 text-center text-xs text-slate-400">
                    No se han registrado eventos webhook aún.
                  </div>
                ) : (
                  rawEvents.map((evt) => (
                    <div
                      key={evt.id}
                      onClick={() => setSelectedRawEvent(evt)}
                      className={cn(
                        "p-3 cursor-pointer transition-colors text-left",
                        selectedRawEvent?.id === evt.id
                          ? "bg-blue-50/80 border-l-4 border-blue-600"
                          : "hover:bg-slate-100/60"
                      )}
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-slate-800">
                          {evt.event || "study_session_completed"}
                        </span>
                        <span className="text-slate-400 font-mono text-[10px]">
                          {new Date(evt.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
                        <span className="font-mono">Vuelo: {evt.payload?.flightId || "N/A"}</span>
                        <span>·</span>
                        <span>{evt.payload?.topics?.length || 0} tema(s)</span>
                        <span>·</span>
                        <span className="font-bold text-slate-700">
                          {evt.payload?.totalFlightEffectiveHours || 0} h
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* JSON Payload Inspector */}
            <div className="w-full md:w-1/2 flex flex-col overflow-hidden bg-slate-900 text-slate-200">
              <div className="p-3 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-950">
                <span className="text-xs font-mono font-bold text-slate-400">
                  {selectedRawEvent ? `Payload: ${selectedRawEvent.id}` : "Selecciona un evento para ver su JSON"}
                </span>
                {selectedRawEvent && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-900 text-blue-200">
                    Status 200 OK
                  </span>
                )}
              </div>

              <div className="flex-1 p-4 overflow-auto font-mono text-xs">
                {selectedRawEvent ? (
                  <pre className="text-emerald-400 whitespace-pre-wrap">
                    {JSON.stringify(selectedRawEvent, null, 2)}
                  </pre>
                ) : (
                  <div className="text-slate-500 py-16 text-center text-xs">
                    Haz clic en un evento de la izquierda para examinar el JSON exacto recibido de AeroFocus Pro.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* BOTTOM STATUS BAR */}
        <div className="px-6 py-3 border-t border-slate-200/80 bg-slate-50/60 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 shrink-0">
          <div className="flex items-center gap-2">
            <ShieldCheck size={14} className="text-emerald-600" />
            <span>Sistema Anti-Errores Activo: Recálculo determinista en cascada</span>
          </div>

          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px] text-slate-400">
              Token API: {webhookToken ? `${webhookToken.slice(0, 10)}...` : "Configurado"}
            </span>
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl font-bold bg-slate-200 hover:bg-slate-300 text-slate-800 transition-colors"
            >
              Cerrar Panel
            </button>
          </div>
        </div>

      </div>

      {/* Manual Paste Modal */}
      {isPasteModalOpen && (
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg p-6 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Send size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">Pegar Transmisión de AeroFocus Pro</h3>
                  <p className="text-[11px] text-slate-500">Acepta JSON, bloques Markdown o reporte de texto</p>
                </div>
              </div>
              <button
                onClick={() => setIsPasteModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X size={16} />
              </button>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                  Contenido de la sesión o reporte
                </label>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      if (navigator?.clipboard?.readText) {
                        const clip = await navigator.clipboard.readText();
                        if (clip) setPasteJsonText(clip);
                      }
                    } catch {}
                  }}
                  className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                >
                  <Copy size={10} /> Pegar del portapapeles
                </button>
              </div>
              <textarea
                rows={9}
                value={pasteJsonText}
                onChange={(e) => setPasteJsonText(e.target.value)}
                placeholder={'// Pega aquí el JSON o reporte copiado de AeroFocus:\n{\n  "date": "2026-10-23",\n  "topics": [\n    {\n      "materia": "Constitucional",\n      "tema": "Tema 5",\n      "effectiveMinutes": 90,\n      "modality": "repaso"\n    }\n  ]\n}\n\n// O también texto:\nConstitucional Tema 5 - 90 min - Repaso'}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 placeholder:text-slate-400/80"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsPasteModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleImportPaste}
                disabled={isImportingPaste}
                className="px-4 py-2 rounded-xl text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50"
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
                <h3 className="text-sm font-black text-slate-900">Reasignar Tema Oficial</h3>
                <p className="text-[11px] text-slate-500">Selecciona el tema oficial correspondiente para esta sesión</p>
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
                  placeholder="Buscar por número o título del tema..."
                  value={reassignSearch}
                  onChange={(e) => setReassignSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-1.5">
              {initialTopics
                .filter((t) => {
                  if (!reassignSearch) return true;
                  const q = reassignSearch.toLowerCase();
                  return t.title.toLowerCase().includes(q) || t.id.toLowerCase().includes(q) || String(t.number).includes(q);
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
                          resolvedSubjectId: t.subjectId
                        });
                        setReassigningItem(null);
                        toast.success(`Tema reasignado a: ${t.title}`);
                      }}
                      className="w-full text-left p-3 rounded-xl hover:bg-indigo-50/60 border border-slate-100 hover:border-indigo-200 transition-all flex items-center justify-between gap-3 group"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-black text-slate-900 group-hover:text-indigo-900 truncate">
                          {t.title}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {sub?.name || t.subjectId} · Tema #{t.number}
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
