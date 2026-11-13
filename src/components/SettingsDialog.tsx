import { authenticatedFetch } from '../lib/authenticatedApi';
import { motion } from "motion/react";
import {
  X,
  Palette,
  Sun,
  Monitor,
  Download,
  Upload,
  Database,
  Server,
  Settings,
  AlertTriangle,
  Radio,
  Copy,
  Check,
  RefreshCw,
  Zap,
  Key,
  ShieldCheck,
  CheckCircle2,
  ExternalLink,
  Layers,
  ArrowRight
} from "lucide-react";
import { useTheme } from "../lib/ThemeProvider";
import React, { ReactNode, useId, useRef, useState, useEffect } from "react";
import { cn, getLocalDateString } from "../lib/utils";
import { toast } from "sonner";
import { useFirebase } from "../lib/FirebaseProvider";
import { initialSubjects } from "../data/initialData";
import { WebhookSyncRecord } from "../lib/webhookTypes";
import { DEFAULT_RETENTION_CONFIG } from "../lib/retentionModel";
import { useDialogAccessibility } from "../hooks/useDialogAccessibility";
import { DS } from "../lib/designSystem";

export function SettingsDialog({ onClose, returnFocusRef }: { onClose: () => void; returnFocusRef?: React.RefObject<HTMLElement | null> }) {
  const [activeTab, setActiveTab] = useState<'webhook' | 'general' | 'data'>('general');
  const dialogId = useId();
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isCopiedUrl, setIsCopiedUrl] = useState(false);
  const [isCopiedToken, setIsCopiedToken] = useState(false);
  const [isTestingWebhook, setIsTestingWebhook] = useState(false);
  const [webhookLogs, setWebhookLogs] = useState<WebhookSyncRecord[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const { theme, setTheme } = useTheme();
  const {
    user,
    userProgress = {},
    recentSessions = [],
    userSettings,
    updateUserSettings,
    resetProgress,
    exportData,
    importData,
    webhookToken,
    generateWebhookToken,
    syncPendingWebhookEvents,
    isSyncingWebhooks,
    aerofocusBetaEnabled,
    setAerofocusBetaEnabled,
  } = useFirebase();

  const [retentionForm, setRetentionForm] = useState({ stability: '', initialRecall: '', threshold: '' });
  const [savingRetention, setSavingRetention] = useState(false);
  const savingChanges = isImporting || savingRetention;
  const dialogRef = useDialogAccessibility<HTMLDivElement>({ onClose, returnFocusRef, disabled: savingChanges });
  useEffect(() => {
    const policy = { ...DEFAULT_RETENTION_CONFIG, ...userSettings?.retention };
    setRetentionForm({ stability: String(policy.initialStabilityDays), initialRecall: String(policy.initialRecallProbability * 100), threshold: String(policy.reviewThreshold * 100) });
  }, [user?.uid, userSettings?.retention]);

  const saveRetentionSettings = async () => {
    const initialStabilityDays = Number(retentionForm.stability);
    const initialRecallProbability = Number(retentionForm.initialRecall) / 100;
    const reviewThreshold = Number(retentionForm.threshold) / 100;
    if (!retentionForm.stability.trim() || !retentionForm.initialRecall.trim() || !retentionForm.threshold.trim()
      || !Number.isFinite(initialStabilityDays) || initialStabilityDays < .25 || initialStabilityDays > 365
      || !Number.isFinite(initialRecallProbability) || initialRecallProbability < .05 || initialRecallProbability > .99
      || !Number.isFinite(reviewThreshold) || reviewThreshold < .05 || reviewThreshold > .95) {
      toast.error('Indica una semivida entre 0,25 y 365 días, recuerdo inicial entre 5 y 99%, y umbral entre 5 y 95%.');
      return;
    }
    setSavingRetention(true);
    try {
      await updateUserSettings({ retention: { ...userSettings?.retention, initialStabilityDays, initialRecallProbability, reviewThreshold } });
      toast.success('Criterios de retención guardados. Las estimaciones se han recalculado.');
    } catch {
      toast.error('No se han podido guardar los criterios de retención.');
    } finally {
      setSavingRetention(false);
    }
  };

  const activeSubjects = userSettings?.activeSubjects || initialSubjects.map((s) => s.id);
  const defaultSubject = userSettings?.defaultSubject || activeSubjects[0] || initialSubjects[0].id;

  // Compute public webhook URL
  const webhookUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/webhook/aerofocus`
    : '/api/webhook/aerofocus';

  // Fetch recent webhook sync logs
  const fetchWebhookLogs = async () => {
    try {
      setLoadingLogs(true);
      const res = await authenticatedFetch('/api/webhook/events?limit=15');
      if (res.ok) {
        const text = await res.text();
        try {
          const data = JSON.parse(text);
          if (Array.isArray(data.events)) {
            setWebhookLogs(data.events);
            try { localStorage.setItem("wellsprep_webhook_logs", JSON.stringify(data.events)); } catch {}
            return;
          }
        } catch {
          // Response was not JSON
        }
      }
      // Fallback from localStorage
      const cached = localStorage.getItem("wellsprep_webhook_logs");
      if (cached) {
        try { setWebhookLogs(JSON.parse(cached)); } catch {}
      }
    } catch (e) {
      console.error("Error fetching webhook logs:", e);
      const cached = localStorage.getItem("wellsprep_webhook_logs");
      if (cached) {
        try { setWebhookLogs(JSON.parse(cached)); } catch {}
      }
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'webhook') {
      fetchWebhookLogs();
    }
  }, [activeTab]);

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    setIsCopiedUrl(true);
    toast.success("URL del Webhook copiada al portapapeles");
    setTimeout(() => setIsCopiedUrl(false), 2000);
  };

  const handleCopyToken = () => {
    navigator.clipboard.writeText(webhookToken);
    setIsCopiedToken(true);
    toast.success("Token API copiado al portapapeles");
    setTimeout(() => setIsCopiedToken(false), 2000);
  };

  const handleSimulateTest = async () => {
    try {
      setIsTestingWebhook(true);
      const res = await authenticatedFetch("/api/webhook/aerofocus", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
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
        toast.success("✅ ¡Enlace verificado con éxito! Conexión operativa con AeroFocus Pro (No se insertan sesiones ficticias).");
      } else {
        toast.error("Fallo de enlace: " + (data.error || data.message || "Respuesta no autorizada"));
      }
      await fetchWebhookLogs();
    } catch (e: any) {
      toast.error("Error al comprobar enlace: " + (e?.message || "Error desconocido"));
    } finally {
      setIsTestingWebhook(false);
    }
  };

  const handleManualSync = async () => {
    const synced = await syncPendingWebhookEvents();
    await fetchWebhookLogs();
    if (synced === 0) {
      toast.info("No hay nuevas sesiones pendientes de sincronizar.");
    }
  };

  const toggleSubject = (id: string) => {
    let newSubjects = [...activeSubjects];
    if (newSubjects.includes(id)) {
      newSubjects = newSubjects.filter((s) => s !== id);
    } else {
      newSubjects.push(id);
    }
    if (newSubjects.length === 0) newSubjects = [id];

    const updates: any = { activeSubjects: newSubjects };
    if (!newSubjects.includes(defaultSubject)) {
      updates.defaultSubject = newSubjects[0];
    }
    updateUserSettings(updates);
  };

  const handleDefaultSubjectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    updateUserSettings({ defaultSubject: e.target.value });
  };

  const handleJsonImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const text = event.target?.result as string;
        if (text) {
          await importData(text);
          if (jsonInputRef.current) jsonInputRef.current.value = "";
          setIsImporting(false);
        }
      };
      reader.readAsText(file);
    } catch (err: any) {
      toast.error(`Error de lectura: ${err.message}`);
      setIsImporting(false);
    }
  };

  const handleReset = () => {
    if (
      confirm(
        "¿Estás seguro de que quieres BORRAR TODO tu progreso y sesiones de estudio? Esta acción no se puede deshacer."
      )
    ) {
      resetProgress();
    }
  };

  return (
    <div className="wp-modal-overlay fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 md:p-6 bg-slate-900/50 backdrop-blur-sm">
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${dialogId}-title`}
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }}
        transition={{ type: "spring", stiffness: 350, damping: 30 }}
        className="wp-modal-panel bg-white rounded-2xl shadow-xl w-full max-w-2xl relative overflow-hidden flex flex-col border border-slate-200/70 max-h-[calc(100dvh-2rem)]"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200/60 flex justify-between items-center bg-white/80 backdrop-blur-xl sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center border border-indigo-100 shadow-xs">
              <Settings size={18} />
            </div>
            <div>
              <h2 id={`${dialogId}-title`} className="text-lg font-semibold text-slate-900 tracking-tight">
                Ajustes & Conexiones
              </h2>
              <p className="text-xs text-slate-500">
                Preferencias, datos e integración con AeroFocus
              </p>
            </div>
          </div>
          <button
            aria-label="Cerrar ajustes"
            onClick={onClose}
            disabled={savingChanges}
            className="size-11 shrink-0 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-all flex items-center justify-center"
          >
            <X size={16} strokeWidth={2.5} />
          </button>
        </div>

        {/* Tab Navigation */}
        <nav aria-label="Secciones de ajustes" className="flex shrink-0 items-center gap-1 px-4 sm:px-6 py-2 border-b border-slate-100 bg-slate-50/50 overflow-x-auto whitespace-nowrap">
          {([['general', 'Materias & Apariencia', Layers], ['data', 'Datos & Respaldo', Server], ['webhook', 'AeroFocus', Radio]] as const).map(([tab, label, Icon]) => <button key={tab} type="button" onClick={() => setActiveTab(tab)} aria-pressed={activeTab === tab} className={`${activeTab === tab ? DS.btnPrimary : DS.btnGhost} shrink-0`}><Icon size={16} aria-hidden="true" />{label}</button>)}
        </nav>

        {/* Tab Content */}
        <div className="min-h-0 flex-1 p-4 sm:p-6 overflow-y-auto overscroll-contain space-y-6">
          {activeTab === 'webhook' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Quarantine Status & Beta Toggle Card */}
              <section className={`${DS.cardSubtle} p-4 space-y-3`}>
                <div><h3 className={DS.titleSection}>Recepción de AeroFocus</h3><p className={`${DS.subtitle} mt-1`}>Revisa los temas y minutos recibidos en la bandeja antes de incorporarlos a tu historial.</p></div>
                <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-2"><span className="text-sm font-medium text-slate-700">Recepción beta</span><button type="button" role="switch" aria-label="Recepción beta de AeroFocus" aria-checked={aerofocusBetaEnabled} onClick={() => setAerofocusBetaEnabled(!aerofocusBetaEnabled)} className={`${DS.iconButton} gap-2`}><span className="text-xs">{aerofocusBetaEnabled ? 'Habilitada' : 'Deshabilitada'}</span><span aria-hidden="true" className={cn('flex h-6 w-11 items-center rounded-full p-1', aerofocusBetaEnabled ? 'justify-end bg-slate-900' : 'justify-start bg-slate-300')}><span className="size-4 rounded-full bg-white" /></span></button></div>
              </section>

              <details className={`${DS.cardSubtle} p-4`}>
                <summary className="min-h-11 cursor-pointer text-sm font-semibold text-slate-800">Configurar conexión</summary>
                <div className="mt-3 space-y-4">
              {/* Endpoint URL Field */}
              <div className="bg-slate-50/80 rounded-2xl p-5 border border-slate-200/70 space-y-3">
                <div className="flex items-center justify-between">
                  <label htmlFor={`${dialogId}-url`} className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                    <Radio size={13} className="text-indigo-600" /> URL del Endpoint Webhook
                  </label>
                  <span className="text-[10px] font-bold text-slate-400">Método POST</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    id={`${dialogId}-url`}
                    type="text"
                    readOnly
                    value={webhookUrl}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-mono text-slate-800 font-semibold focus:outline-none select-all"
                  />
                  <button
                    type="button"
                    onClick={handleCopyUrl}
                    className={cn(
                      "flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-black transition-all shrink-0 active:scale-95 shadow-xs border",
                      isCopiedUrl
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : "bg-slate-900 hover:bg-slate-800 text-white border-slate-900"
                    )}
                  >
                    {isCopiedUrl ? <Check size={14} /> : <Copy size={14} />}
                    {isCopiedUrl ? "Copiado" : "Copiar"}
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 font-medium">
                  Pega esta dirección en el campo <span className="font-bold text-slate-700">"URL del Endpoint Webhook"</span> en AeroFocus Pro.
                </p>
              </div>

              {/* API Token Field */}
              <div className="bg-slate-50/80 rounded-2xl p-5 border border-slate-200/70 space-y-3">
                <div className="flex items-center justify-between">
                  <label htmlFor={`${dialogId}-token`} className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                    <Key size={13} className="text-indigo-600" /> Token de Autorización / API Key
                  </label>
                  <button
                    type="button"
                    onClick={generateWebhookToken}
                    className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1"
                  >
                    <RefreshCw size={11} /> Regenerar Token
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    id={`${dialogId}-token`}
                    type="password"
                    readOnly
                    value={webhookToken}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-mono text-slate-800 font-semibold focus:outline-none select-all"
                  />
                  <button
                    type="button"
                    onClick={handleCopyToken}
                    className={cn(
                      "flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-black transition-all shrink-0 active:scale-95 shadow-xs border",
                      isCopiedToken
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : "bg-white hover:bg-slate-100 text-slate-800 border-slate-200"
                    )}
                  >
                    {isCopiedToken ? <Check size={14} /> : <Copy size={14} />}
                    {isCopiedToken ? "Copiado" : "Copiar"}
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 font-medium">
                  Opcional pero recomendado para proteger tu endpoint. Se envía como cabecera <code className="bg-slate-200/70 px-1 py-0.5 rounded text-[10px] text-slate-800">Bearer &lt;token&gt;</code> o como parámetro <code className="bg-slate-200/70 px-1 py-0.5 rounded text-[10px] text-slate-800">?token=&lt;token&gt;</code>.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={handleSimulateTest}
                  disabled={isTestingWebhook}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-black border border-indigo-200/80 transition-all shadow-xs active:scale-[0.98] disabled:opacity-50"
                >
                  <Zap size={15} className="text-indigo-600" />
                  {isTestingWebhook ? "Comprobando…" : "Comprobar conexión"}
                </button>
                <button
                  type="button"
                  onClick={handleManualSync}
                  disabled={isSyncingWebhooks}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-white hover:bg-slate-100 text-slate-800 rounded-xl text-xs font-black border border-slate-200/80 transition-all shadow-xs active:scale-[0.98] disabled:opacity-50"
                >
                  <RefreshCw size={14} className={cn("text-slate-600", isSyncingWebhooks && "animate-spin")} />
                  {isSyncingWebhooks ? "Actualizando…" : "Buscar transmisiones pendientes"}
                </button>
              </div>
                </div>
              </details>

              {/* Recent Sync Logs */}
              <div className="bg-slate-50/70 rounded-2xl p-5 border border-slate-200/60">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-[11px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldCheck size={13} className="text-emerald-600" /> Historial de Transmisiones Recibidas
                  </h4>
                  <button
                    type="button"
                    onClick={fetchWebhookLogs}
                    className="text-[10px] font-bold text-slate-400 hover:text-slate-700 flex items-center gap-1"
                  >
                    <RefreshCw size={10} /> Actualizar
                  </button>
                </div>

                {loadingLogs ? (
                  <p className="text-xs text-slate-400 py-3 text-center">Cargando registros...</p>
                ) : webhookLogs.length === 0 ? (
                  <div className="py-6 text-center text-slate-400 space-y-1">
                    <p className="text-xs font-bold text-slate-500">Aún no se han recibido transmisiones</p>
                    <p className="text-[11px]">
                      Haz clic en "Probar Conexión" o completa una sesión en AeroFocus Pro para verla aquí.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto no-scrollbar">
                    {webhookLogs.map((log) => (
                      <div
                        key={log.id}
                        className="bg-white p-3 rounded-xl border border-slate-200/70 flex items-center justify-between text-xs shadow-xs"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900">
                              Vuelo #{log.flightId || 'N/A'}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {log.date} · {new Date(log.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-600 font-medium">
                            {log.topics && log.topics.length > 0 ? (
                              <span>
                                {log.topics.map(t => t.resolvedTopicTitle || t.resolvedTopicId).join(', ')}
                              </span>
                            ) : (
                              <span className="text-slate-400">Test de conexión (Ping)</span>
                            )}
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="font-mono font-black text-slate-800 text-[11px]">
                            +{log.totalFlightEffectiveHours || Math.round(log.totalFlightEffectiveMinutes / 60)}h
                          </div>
                          <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                            {log.status === 'processed' ? 'Incorporado' : 'Por revisar'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'general' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <section className="bg-slate-50/70 rounded-2xl p-5 border border-slate-200/60">
                <h3 className="text-sm font-bold text-slate-800 mb-2">Criterios de retención y repaso</h3>
                <p className="text-xs text-slate-600 mb-4">Estos valores son supuestos iniciales y criterios de planificación. No son mediciones de tu memoria. Las recuperaciones sin ayuda registradas permiten ajustar el modelo con evidencia.</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <label className="text-xs font-bold text-slate-700">Semivida inicial (días)
                    <input aria-label="Semivida inicial en días" type="number" min="0.25" max="365" step="0.25" value={retentionForm.stability} onChange={event => setRetentionForm(previous => ({ ...previous, stability: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-2.5 font-mono" />
                  </label>
                  <label className="text-xs font-bold text-slate-700">Recuerdo inicial supuesto (%)
                    <input aria-label="Recuerdo inicial supuesto en porcentaje" type="number" min="5" max="99" step="1" value={retentionForm.initialRecall} onChange={event => setRetentionForm(previous => ({ ...previous, initialRecall: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-2.5 font-mono" />
                  </label>
                  <label className="text-xs font-bold text-slate-700">Umbral para proponer repaso (%)
                    <input aria-label="Umbral para proponer repaso en porcentaje" type="number" min="5" max="95" step="1" value={retentionForm.threshold} onChange={event => setRetentionForm(previous => ({ ...previous, threshold: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-2.5 font-mono" />
                  </label>
                </div>
                <button type="button" disabled={savingRetention || !user} onClick={saveRetentionSettings} className="mt-4 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">{savingRetention ? 'Guardando…' : 'Guardar criterios de retención'}</button>
              </section>
              {/* APARIENCIA */}
              <section className="bg-slate-50/70 rounded-2xl p-5 border border-slate-200/60">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3.5 flex items-center gap-2">
                  <Palette size={13} className="text-indigo-600" /> Modo de Visualización
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <ThemeButton
                    active={theme === "light"}
                    onClick={() => setTheme("light")}
                    icon={<Sun size={18} />}
                    label="Luz Natural"
                    subtitle="Alto contraste nítido"
                  />
                  <ThemeButton
                    active={theme === "beige"}
                    onClick={() => setTheme("beige")}
                    icon={<Monitor size={18} />}
                    label="Tono Cálido"
                    subtitle="Menor fatiga visual"
                  />
                </div>
              </section>

              {/* ASIGNATURAS */}
              <section className="bg-slate-50/70 rounded-2xl p-5 border border-slate-200/60">
                <div className="flex items-center justify-between mb-3.5">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Database size={13} className="text-indigo-600" /> Asignaturas de Estudio
                  </h3>
                  <span className="text-[10px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200">
                    {activeSubjects.length} activas
                  </span>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-black text-slate-700 mb-2">
                      Selecciona las materias visibles en temario
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {initialSubjects.map((subj) => {
                        const isActive = activeSubjects.includes(subj.id);
                        return (
                          <button
                            key={subj.id}
                            type="button"
                            onClick={() => toggleSubject(subj.id)}
                            className={cn(
                              "px-3 py-1.5 rounded-xl text-xs font-bold transition-all border shadow-xs",
                              isActive
                                ? "bg-slate-900 text-white border-slate-900"
                                : "bg-white text-slate-600 border-slate-200/80 hover:bg-slate-100"
                            )}
                          >
                            {subj.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-black text-slate-700 mb-1.5">
                      Materia predeterminada al iniciar
                    </label>
                    <select
                      className="w-full bg-white border border-slate-200/80 text-slate-800 text-xs rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 block p-2.5 font-bold transition-all outline-none"
                      value={defaultSubject}
                      onChange={handleDefaultSubjectChange}
                    >
                      {initialSubjects
                        .filter((s) => activeSubjects.includes(s.id))
                        .map((subj) => (
                          <option key={subj.id} value={subj.id}>
                            {subj.name}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
              </section>
            </div>
          )}

          {activeTab === 'data' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* BACKUP Y RESTAURACIÓN (JSON) */}
              <section className="bg-slate-50/70 rounded-2xl p-5 border border-slate-200/60">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                  <Server size={13} className="text-indigo-600" /> Respaldo y Portabilidad de Datos
                </h3>
                <p className="text-[11px] text-slate-500 mb-4 font-medium leading-relaxed">
                  Exporta una copia íntegra con todo tu historial de sesiones, notas y progresos para restaurarla cuando quieras.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={exportData}
                    className="flex items-center justify-center gap-2 px-4 py-3 bg-white hover:bg-slate-100 text-slate-800 rounded-xl text-xs font-bold border border-slate-200/80 transition-all shadow-xs active:scale-[0.98]"
                  >
                    <Download size={15} className="text-indigo-600" />
                    Descargar Backup (.json)
                  </button>

                  <input
                    type="file"
                    accept=".json"
                    ref={jsonInputRef}
                    onChange={handleJsonImport}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => jsonInputRef.current?.click()}
                    disabled={isImporting}
                    className="flex items-center justify-center gap-2 px-4 py-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold border border-indigo-200/80 transition-all shadow-xs active:scale-[0.98] disabled:opacity-50"
                  >
                    <Upload size={15} />
                    {isImporting ? "Restaurando..." : "Importar Backup"}
                  </button>
                </div>
              </section>

              {/* ZONA DE PELIGRO */}
              <section className="bg-rose-50/40 p-4 rounded-2xl border border-rose-200/60">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-black text-rose-900 flex items-center gap-1.5">
                      <AlertTriangle size={14} className="text-rose-600" />
                      Reinicio Completo de Datos
                    </h4>
                    <p className="text-[10px] text-rose-700/80 mt-0.5">
                      Elimina tu base de datos de estudio local/nube permanentemente.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleReset}
                    className="px-3 py-2 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs font-black transition-all shadow-xs active:scale-95 shrink-0"
                  >
                    Reiniciar
                  </button>
                </div>
              </section>
            </div>
          )}
        </div>
        <footer className="flex shrink-0 justify-end border-t border-slate-200 bg-white px-4 py-3 sm:px-6" style={{ paddingBottom: 'max(.75rem, env(safe-area-inset-bottom))' }}><button type="button" onClick={onClose} disabled={savingChanges} className={DS.btnPrimary}>Listo</button></footer>
      </motion.div>
    </div>
  );
}

function ThemeButton({
  active,
  onClick,
  icon,
  label,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-start p-4 rounded-2xl border transition-all text-left shadow-xs",
        active
          ? "bg-slate-900 border-slate-900 text-white ring-2 ring-slate-900/20"
          : "bg-white border-slate-200/80 text-slate-700 hover:border-slate-300 hover:bg-slate-50"
      )}
    >
      <div
        className={cn(
          "p-2 rounded-xl mb-3",
          active ? "bg-white/10 text-white" : "bg-slate-100 text-slate-700"
        )}
      >
        {icon}
      </div>
      <span className="text-xs font-black tracking-tight">{label}</span>
      <span
        className={cn(
          "text-[10px] font-medium mt-0.5",
          active ? "text-slate-300" : "text-slate-400"
        )}
      >
        {subtitle}
      </span>
    </button>
  );
}
