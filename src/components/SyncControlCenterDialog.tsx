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
  BarChart2
} from "lucide-react";
import { useFirebase } from "../lib/FirebaseProvider";
import { initialSubjects, initialTopics } from "../data/initialData";
import { EditSessionDialog } from "./EditSessionDialog";
import { toast } from "sonner";
import { cn } from "../lib/utils";
import { WebhookSyncRecord } from "../lib/webhookTypes";

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
    deduplicateUserSessions,
    recoverHistoricalUserData,
    quarantinedEvents = [],
    isLoadingQuarantine,
    fetchQuarantinedEvents,
    approveQuarantineEvent,
    discardQuarantineEvent,
    clearAllQuarantine,
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
    if (!confirm("¿Deseas ejecutar la Reconciliación Maestra? Esto auditará todas las sesiones registradas y recalculará las horas exactas, vueltas y dificultad de cada tema.")) {
      return;
    }
    try {
      setIsReconciling(true);
      await reconcileAllTopicsAndSessions();
    } catch (e: any) {
      console.error(e);
    } finally {
      setIsReconciling(false);
    }
  };

  // Handle Quick Webhook Test
  const handleTestWebhook = async () => {
    try {
      setIsTestingWebhook(true);
      const res = await fetch("/api/webhook/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topicId: "jud-const-01",
          topicNumber: 1,
          topicTitle: "Derecho Constitucional - Tema 1: La Constitución Española de 1978",
          category: "Derecho Constitucional",
          effectiveHours: 1.5,
          modality: "repaso",
        }),
      });
      if (res.ok) {
        toast.success("Webhook de prueba enviado a la Bandeja de Cuarentena (expediente intacto).");
        await fetchQuarantinedEvents();
        if (activeTab === "raw_logs") fetchLogs();
      } else {
        toast.error("Error al enviar test de webhook.");
      }
    } catch (e: any) {
      toast.error("Fallo al probar webhook: " + e.message);
    } finally {
      setIsTestingWebhook(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-hidden">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/90 w-full max-w-5xl h-[92vh] max-h-[850px] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* TOP HEADER */}
        <div className="px-6 py-5 border-b border-slate-200/70 bg-slate-50/70 flex flex-wrap items-center justify-between gap-4 shrink-0">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-md shadow-slate-900/10">
                <SlidersHorizontal size={18} strokeWidth={2.2} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-black text-slate-900 font-serif tracking-tight">
                    Centro de Control y Auditoría de Sincronización
                  </h1>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border bg-emerald-50 text-emerald-700 border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    AeroFocus Webhook Conectado (wp_qLXi6WFkFY_live)
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-medium">
                  Auditoría completa de cuenta Google, recálculo retroactivo y motor anti-errores
                </p>
              </div>
            </div>
          </div>

          {/* Quick Header Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => purgePhantomTema5Cante()}
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200/80 shadow-xs transition-all flex items-center gap-1.5"
              title="Elimina cualquier cante ficticio o no realizado en Tema 5"
            >
              <ShieldAlert size={13} className="text-rose-600" />
              <span>Limpiar Cante Tema 5</span>
            </button>

            <button
              onClick={() => deduplicateUserSessions(false)}
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300/80 shadow-xs transition-all flex items-center gap-1.5"
              title="Elimina cantes y sesiones duplicadas (especialmente en Temas 7 y 17) y recalcula los temas"
            >
              <RefreshCw size={13} className="text-amber-700" />
              <span>Deduplicar Cantes</span>
            </button>

            <button
              onClick={() => recoverHistoricalUserData(false)}
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80 shadow-xs transition-all flex items-center gap-1.5"
              title="Escanear y vincular todos los datos de tu cuenta de Google"
            >
              <Database size={13} className="text-indigo-600" />
              <span>Vincular Google</span>
            </button>

            <button
              onClick={handleTestWebhook}
              disabled={isTestingWebhook}
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50"
              title="Simular envío de sesión desde AeroFocus Pro"
            >
              <Send size={13} className="text-blue-600" />
              <span>{isTestingWebhook ? "Simulando..." : "Test Webhook"}</span>
            </button>

            <button
              onClick={purgeAllAeroFocusData}
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200/80 shadow-sm transition-all flex items-center gap-1.5"
              title="Eliminar todas las sesiones de prueba de AeroFocus y recalcular temas"
            >
              <AlertTriangle size={13} className="text-amber-600" />
              <span>Purgar AeroFocus</span>
            </button>

            <button
              onClick={handleReconcile}
              disabled={isReconciling}
              className="px-3.5 py-1.5 rounded-xl text-xs font-black bg-slate-900 hover:bg-slate-800 text-white shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50"
              title="Recalcula el 100% de los temas a partir de las sesiones reales"
            >
              <RefreshCw size={13} className={cn(isReconciling && "animate-spin")} />
              <span>{isReconciling ? "Reconciliando..." : "Reconciliar Todo"}</span>
            </button>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors ml-1"
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
            {/* Quarantine Info Banner */}
            <div className="p-4 border-b border-amber-200/60 bg-amber-50/50 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-xl bg-amber-100 text-amber-800 shrink-0">
                  <Shield size={18} />
                </div>
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-amber-900">
                    Modo Cuarentena Activo — Blindaje de Expediente
                  </h4>
                  <p className="text-xs text-amber-800/80 mt-0.5 max-w-2xl leading-relaxed">
                    Los eventos enviados por AeroFocus Pro (vía cierre diario de las 22:00h o sincronización de vuelos) se retienen aquí de forma aislada. 
                    <strong> No modifican tus notas oficiales, cantos, ni vueltas</strong> hasta que tú los revises y pulses <em>"Aprobar"</em>.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => fetchQuarantinedEvents()}
                  disabled={isLoadingQuarantine}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 shadow-xs transition-all flex items-center gap-1.5"
                >
                  <RefreshCw size={12} className={cn(isLoadingQuarantine && "animate-spin")} />
                  <span>Actualizar</span>
                </button>

                {quarantinedEvents.length > 0 && (
                  <button
                    onClick={() => clearAllQuarantine()}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200/80 shadow-xs transition-all flex items-center gap-1.5"
                  >
                    <Trash2 size={12} className="text-rose-600" />
                    <span>Vaciar Cuarentena</span>
                  </button>
                )}
              </div>
            </div>

            {/* Quarantine List */}
            <div className="flex-1 p-6 overflow-y-auto min-h-0">
              {quarantinedEvents.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-8">
                  <div className="w-14 h-14 rounded-3xl bg-emerald-50 text-emerald-600 border border-emerald-200/80 flex items-center justify-center shadow-xs mb-3">
                    <ShieldCheck size={28} />
                  </div>
                  <h3 className="text-base font-black text-slate-800 font-serif">
                    Bandeja de Cuarentena Limpia y Protegida
                  </h3>
                  <p className="text-xs text-slate-500 max-w-md mt-1 leading-relaxed">
                    No hay ningún evento pendiente de revisión. Tu expediente oficial está 100% libre de datos sospechosos o simulaciones no deseadas.
                  </p>
                  <div className="mt-4 flex items-center gap-2 text-[11px] text-slate-400 font-mono">
                    <span>Token activo: wp_qLXi6WFkFY_live</span>
                    <span>·</span>
                    <span>Cierre: 22:00h</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 max-w-4xl mx-auto">
                  {quarantinedEvents.map((evt) => (
                    <div
                      key={evt.id}
                      className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-4 hover:shadow-md transition-all flex flex-col gap-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                        <div className="flex items-center gap-2.5">
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-50 text-amber-800 border border-amber-200">
                            En Cuarentena
                          </span>
                          <span className="font-mono text-xs font-bold text-slate-800">
                            ID: {evt.id}
                          </span>
                          <span className="text-slate-300">·</span>
                          <span className="text-xs text-slate-500 flex items-center gap-1">
                            <Clock size={12} />
                            {evt.date || "Hoy"}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => discardQuarantineEvent(evt.id)}
                            className="px-3 py-1 rounded-xl text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200/70 transition-all flex items-center gap-1"
                          >
                            <Trash2 size={12} />
                            <span>Descartar</span>
                          </button>
                          <button
                            onClick={() => approveQuarantineEvent(evt.id)}
                            className="px-3.5 py-1 rounded-xl text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 shadow-xs transition-all flex items-center gap-1.5"
                          >
                            <CheckCircle2 size={13} />
                            <span>Aprobar e Incorporar</span>
                          </button>
                        </div>
                      </div>

                      {/* Topics inside this quarantined event */}
                      <div className="space-y-2">
                        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                          Temas incluidos en este evento ({evt.topics?.length || 0}):
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {(evt.topics || []).map((t, idx) => (
                            <div
                              key={idx}
                              className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between gap-2"
                            >
                              <div className="min-w-0">
                                <div className="text-xs font-bold text-slate-800 truncate">
                                  {t.resolvedTopicTitle || t.resolvedTopicId || "Tema"}
                                </div>
                                <div className="text-[10px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                                  <span className="uppercase font-semibold text-indigo-600">
                                    {t.modality || "repaso"}
                                  </span>
                                  <span>·</span>
                                  <span>{t.effectiveMinutes || Math.round((t.effectiveHours || 0) * 60)} min</span>
                                  {t.cantoGrade !== undefined && (
                                    <>
                                      <span>·</span>
                                      <span className="text-amber-700 font-bold">Nota: {t.cantoGrade}/10</span>
                                    </>
                                  )}
                                </div>
                              </div>

                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-200 text-slate-700 shrink-0">
                                {t.resolvedTopicId}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
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
