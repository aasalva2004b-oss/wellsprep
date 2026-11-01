import React, { useState, useEffect, useRef } from "react";
import {
  Mic,
  X,
  Check,
  Loader2,
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Bell,
  Clock,
  AlertTriangle,
  Award,
  Sparkles,
  Target,
  Flame,
  BookOpen,
} from "lucide-react";
import { Topic } from "../../types";
import { getLocalDateString } from "../../lib/utils";
import { toast } from "sonner";
import { cn } from "../../lib/utils";
import { playSound } from "../../lib/sound";

interface DashboardQuickCantoModalProps {
  isOpen: boolean;
  onClose: () => void;
  allTopics: Topic[];
  onSaveCanto: (data: {
    topicId: string;
    date: string;
    durationMinutes: number;
    durationSeconds: number;
    grade?: number;
    difficulty: number;
    mistakes?: string;
  }) => Promise<void>;
  isSaving: boolean;
  initialTopicId?: string;
  initialMode?: "simulator" | "manual";
}

export const DashboardQuickCantoModal: React.FC<DashboardQuickCantoModalProps> = ({
  isOpen,
  onClose,
  allTopics,
  onSaveCanto,
  isSaving,
  initialTopicId,
  initialMode = "simulator",
}) => {
  const [activeTab, setActiveTab] = useState<"simulator" | "manual">(initialMode);
  const [topicId, setTopicId] = useState(initialTopicId || "");
  const [searchTopicQuery, setSearchTopicQuery] = useState("");
  const [date, setDate] = useState(getLocalDateString());
  const [min, setMin] = useState("12");
  const [sec, setSec] = useState("30");
  const [grade, setGrade] = useState("7.5");
  const [difficulty, setDifficulty] = useState(5);
  const [mistakes, setMistakes] = useState("");

  // Live Stopwatch State
  const [isRunning, setIsRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Real-time live incident tallies
  const [incidentDudas, setIncidentDudas] = useState(0);
  const [incidentArticulos, setIncidentArticulos] = useState(0);
  const [incidentMuletillas, setIncidentMuletillas] = useState(0);
  const [incidentEstructura, setIncidentEstructura] = useState(0);

  // Sound flags to avoid playing multiple bells in the same second
  const hasPlayed11m = useRef(false);
  const hasPlayed1230m = useRef(false);
  const hasPlayed1340m = useRef(false);

  // Reset or initialize when opened
  useEffect(() => {
    if (isOpen) {
      if (initialTopicId) setTopicId(initialTopicId);
      setActiveTab(initialMode);
    } else {
      // Clear interval on close
      if (timerRef.current) clearInterval(timerRef.current);
      setIsRunning(false);
      setElapsedSeconds(0);
      setIncidentDudas(0);
      setIncidentArticulos(0);
      setIncidentMuletillas(0);
      setIncidentEstructura(0);
      hasPlayed11m.current = false;
      hasPlayed1230m.current = false;
      hasPlayed1340m.current = false;
    }
  }, [isOpen, initialTopicId, initialMode]);

  // Live Timer Effect
  useEffect(() => {
    if (isRunning) {
      timerRef.current = setInterval(() => {
        setElapsedSeconds((prev) => {
          const next = prev + 1;

          // Sound triggers for official tribunal benchmarks
          if (soundEnabled) {
            if (next === 660 && !hasPlayed11m.current) {
              // 11:00 min: Entering regulatory window
              hasPlayed11m.current = true;
              playSound.toggle();
            } else if (next === 750 && !hasPlayed1230m.current) {
              // 12:30 min: Bullseye target
              hasPlayed1230m.current = true;
              playSound.success();
            } else if (next === 820 && !hasPlayed1340m.current) {
              // 13:40 min: Maximum regulatory threshold (Tribunal bell)
              hasPlayed1340m.current = true;
              playSound.bell();
            }
          }

          return next;
        });
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning, soundEnabled]);

  if (!isOpen) return null;

  // Formatting Stopwatch
  const timerMins = Math.floor(elapsedSeconds / 60);
  const timerSecs = elapsedSeconds % 60;
  const timerDisplay = `${timerMins.toString().padStart(2, "0")}:${timerSecs.toString().padStart(2, "0")}`;

  // Current Pacing Phase
  let phaseName = "Fase 1: Introducción & Desarrollo";
  let phaseColor = "text-indigo-600 bg-indigo-50 border-indigo-200";
  let targetProgress = Math.min(100, Math.round((elapsedSeconds / 820) * 100));

  if (elapsedSeconds >= 820) {
    phaseName = "🚨 LÍMITE SUPERADO (>13:40m Campana Tribunal)";
    phaseColor = "text-rose-700 bg-rose-50 border-rose-300 animate-pulse";
  } else if (elapsedSeconds >= 750) {
    phaseName = "⚠️ Zona Límite: Conclusión Obligatoria (12:30–13:40m)";
    phaseColor = "text-amber-800 bg-amber-50 border-amber-300";
  } else if (elapsedSeconds >= 660) {
    phaseName = "🎯 ZONA DIANA TRIBUNAL (11:00–12:30m)";
    phaseColor = "text-emerald-800 bg-emerald-50 border-emerald-300 ring-2 ring-emerald-500/20";
  }

  // Filtered topics for search
  const filteredTopics = allTopics.filter((t) => {
    if (!searchTopicQuery.trim()) return true;
    const q = searchTopicQuery.toLowerCase();
    return (
      t.title.toLowerCase().includes(q) ||
      String(t.number).includes(q) ||
      (t.subjectId && t.subjectId.toLowerCase().includes(q))
    );
  });

  const selectedTopic = allTopics.find((t) => t.id === topicId);

  // Stop & Finalize Simulation
  const handleStopAndFinalize = () => {
    setIsRunning(false);
    playSound.success();

    // Auto calculate minutes and seconds
    const m = Math.floor(elapsedSeconds / 60);
    const s = elapsedSeconds % 60;
    setMin(m.toString());
    setSec(s.toString());

    // Generate automatic feedback based on incidents and timer
    const incidentParts: string[] = [];
    if (incidentDudas > 0) incidentParts.push(`${incidentDudas} vacilaciones`);
    if (incidentArticulos > 0) incidentParts.push(`${incidentArticulos} dudas/fallos en artículos`);
    if (incidentMuletillas > 0) incidentParts.push(`${incidentMuletillas} muletillas`);
    if (incidentEstructura > 0) incidentParts.push(`${incidentEstructura} desajustes de epígrafe`);

    const totalIncidents = incidentDudas + incidentArticulos + incidentMuletillas + incidentEstructura;
    const isOptimalTime = elapsedSeconds >= 660 && elapsedSeconds <= 820;

    // Suggest a realistic grade
    let suggestedGrade = 7.5;
    if (isOptimalTime && totalIncidents === 0) suggestedGrade = 9.0;
    else if (isOptimalTime && totalIncidents <= 2) suggestedGrade = 8.0;
    else if (isOptimalTime && totalIncidents <= 4) suggestedGrade = 6.5;
    else if (!isOptimalTime) suggestedGrade = Math.max(3.0, 5.0 - totalIncidents * 0.5);
    else suggestedGrade = Math.max(2.0, 5.0 - totalIncidents * 0.7);

    setGrade(suggestedGrade.toFixed(1));

    const autoSummary = [
      `Simulacro cronometrado oficial (${m}m ${s}s).`,
      incidentParts.length > 0 ? `Incidentes registrados: ${incidentParts.join(", ")}.` : "Sin incidentes destacables.",
      elapsedSeconds > 820 ? "Superó el tiempo de 13:40 min (campana)." : elapsedSeconds < 660 ? "Tiempo inferior a 11 min." : "Tiempo clavado en ventana reglamentaria.",
    ].join(" ");

    setMistakes(autoSummary);
    setActiveTab("manual");
    toast.success("⏱️ Simulacro completado. Revisa y confirma la calificación.");
  };

  const handleResetStopwatch = () => {
    playSound.toggle();
    setIsRunning(false);
    setElapsedSeconds(0);
    setIncidentDudas(0);
    setIncidentArticulos(0);
    setIncidentMuletillas(0);
    setIncidentEstructura(0);
    hasPlayed11m.current = false;
    hasPlayed1230m.current = false;
    hasPlayed1340m.current = false;
  };

  const handleSubmit = async () => {
    if (!topicId) {
      toast.error("Selecciona un tema para el cante");
      return;
    }
    const minsNum = parseInt(min, 10) || 0;
    const secsNum = parseInt(sec, 10) || 0;
    if (minsNum === 0 && secsNum === 0) {
      toast.error("Introduce la duración de la exposición");
      return;
    }

    const gradeNum = parseFloat(grade);
    playSound.success();
    await onSaveCanto({
      topicId,
      date,
      durationMinutes: minsNum,
      durationSeconds: secsNum,
      grade: !isNaN(gradeNum) ? gradeNum : undefined,
      difficulty,
      mistakes: mistakes.trim() || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-xl w-full shadow-2xl border border-slate-200/90 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 via-white to-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-fuchsia-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-fuchsia-500/20">
              <Mic size={18} strokeWidth={2.2} />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 font-serif">
                {activeTab === "simulator" ? "Simulador de Cante en Vivo" : "Registrar Canto Oral"}
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Cronómetro de tribunal con ventana oficial (11:00–13:40 min)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="px-5 pt-3 pb-1 border-b border-slate-100 flex items-center justify-between gap-2 bg-slate-50/50">
          <div className="inline-flex items-center bg-slate-200/80 p-0.5 rounded-xl text-xs font-bold text-slate-600 w-full sm:w-auto">
            <button
              onClick={() => {
                playSound.click();
                setActiveTab("simulator");
              }}
              className={cn(
                "flex-1 sm:flex-initial px-3.5 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5",
                activeTab === "simulator"
                  ? "bg-white text-slate-900 shadow-2xs font-black"
                  : "hover:text-slate-900 text-slate-500"
              )}
            >
              <Clock size={13} className={activeTab === "simulator" ? "text-fuchsia-600" : "text-slate-400"} />
              <span>Simulador en Vivo</span>
            </button>
            <button
              onClick={() => {
                playSound.click();
                setActiveTab("manual");
              }}
              className={cn(
                "flex-1 sm:flex-initial px-3.5 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5",
                activeTab === "manual"
                  ? "bg-white text-slate-900 shadow-2xs font-black"
                  : "hover:text-slate-900 text-slate-500"
              )}
            >
              <Check size={13} className={activeTab === "manual" ? "text-indigo-600" : "text-slate-400"} />
              <span>Entrada Manual</span>
            </button>
          </div>

          {activeTab === "simulator" && (
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={cn(
                "px-2.5 py-1 rounded-xl text-xs font-bold border flex items-center gap-1 transition-all",
                soundEnabled
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-slate-100 text-slate-400 border-slate-200"
              )}
              title={soundEnabled ? "Campanas y avisos sonoros activados" : "Sonido desactivado"}
            >
              {soundEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
              <span className="hidden sm:inline">{soundEnabled ? "Sonido Activo" : "Silenciado"}</span>
            </button>
          )}
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 overflow-y-auto max-h-[70vh]">
          {/* Topic Picker (Common to both modes) */}
          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">
              Tema a Cantar *
            </label>
            <div className="relative">
              <select
                value={topicId}
                onChange={(e) => setTopicId(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/20 bg-white"
              >
                <option value="">-- Selecciona el tema de la oposición --</option>
                {filteredTopics.map((t) => (
                  <option key={t.id} value={t.id}>
                    Tema {t.number}: {t.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {activeTab === "simulator" ? (
            /* ======================================================== */
            /* TAB 1: LIVE TRIBUNAL CHRONOMETER SIMULATOR               */
            /* ======================================================== */
            <div className="space-y-4">
              {/* Big Apple-Style Stopwatch Card */}
              <div className="bg-gradient-to-b from-slate-900 to-slate-950 text-white rounded-3xl p-6 sm:p-7 flex flex-col items-center justify-center relative overflow-hidden shadow-xl border border-slate-800">
                <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-bl from-fuchsia-600/15 via-indigo-600/10 to-transparent rounded-full -mr-16 -mt-16 pointer-events-none blur-2xl" />

                {/* Phase Badge */}
                <div className={cn("px-3 py-1 rounded-full text-xs font-black border uppercase tracking-wider mb-3 transition-all", phaseColor)}>
                  {phaseName}
                </div>

                {/* Big Digital Numbers */}
                <div className="text-5xl sm:text-6xl font-black font-mono tracking-tight tabular-nums text-white drop-shadow-sm my-1">
                  {timerDisplay}
                </div>

                {/* Progress bar towards 13:40 max threshold */}
                <div className="w-full max-w-xs mt-3 mb-1">
                  <div className="flex justify-between text-[10px] font-mono text-slate-400 mb-1">
                    <span>0:00</span>
                    <span className="text-emerald-400 font-bold">11:00m</span>
                    <span className="text-amber-400 font-bold">12:30m</span>
                    <span className="text-rose-400 font-bold">13:40m</span>
                  </div>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden p-0.5">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-300",
                        elapsedSeconds > 820
                          ? "bg-rose-500 animate-pulse"
                          : elapsedSeconds >= 750
                          ? "bg-amber-400"
                          : elapsedSeconds >= 660
                          ? "bg-emerald-400"
                          : "bg-indigo-500"
                      )}
                      style={{ width: `${targetProgress}%` }}
                    />
                  </div>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-3 mt-4">
                  {!isRunning ? (
                    <button
                      onClick={() => {
                        playSound.click();
                        setIsRunning(true);
                      }}
                      className="px-6 py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black flex items-center gap-2 shadow-lg shadow-emerald-500/30 transition-all active:scale-95"
                    >
                      <Play size={16} fill="currentColor" />
                      <span>{elapsedSeconds > 0 ? "Reanudar Cante" : "Comenzar Cante"}</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        playSound.click();
                        setIsRunning(false);
                      }}
                      className="px-6 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black flex items-center gap-2 shadow-lg shadow-amber-500/30 transition-all active:scale-95"
                    >
                      <Pause size={16} fill="currentColor" />
                      <span>Pausar</span>
                    </button>
                  )}

                  {elapsedSeconds > 0 && (
                    <>
                      <button
                        onClick={handleStopAndFinalize}
                        className="px-4 py-2.5 rounded-2xl bg-white text-slate-900 hover:bg-slate-100 text-xs font-black flex items-center gap-1.5 shadow-md transition-all active:scale-95"
                      >
                        <Check size={14} />
                        <span>Terminar & Evaluar</span>
                      </button>
                      <button
                        onClick={handleResetStopwatch}
                        className="p-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all"
                        title="Reiniciar cronómetro"
                      >
                        <RotateCcw size={16} />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Live Incident Logger (Tap while reciting without pausing!) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-500">
                    Incidencias en Vivo (Toca durante el cante)
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    Total: {incidentDudas + incidentArticulos + incidentMuletillas + incidentEstructura}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      playSound.toggle();
                      setIncidentDudas((prev) => prev + 1);
                    }}
                    className="p-2.5 rounded-xl border border-amber-200 bg-amber-50/70 hover:bg-amber-100 text-amber-900 text-left transition-all active:scale-95 flex items-center justify-between"
                  >
                    <span className="text-xs font-bold">⚠️ Duda / Vacilación</span>
                    <span className="w-5 h-5 rounded-full bg-amber-200 text-amber-800 font-mono font-black text-[11px] flex items-center justify-center">
                      {incidentDudas}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      playSound.toggle();
                      setIncidentArticulos((prev) => prev + 1);
                    }}
                    className="p-2.5 rounded-xl border border-rose-200 bg-rose-50/70 hover:bg-rose-100 text-rose-900 text-left transition-all active:scale-95 flex items-center justify-between"
                  >
                    <span className="text-xs font-bold">⚖️ Fallo en Artículo</span>
                    <span className="w-5 h-5 rounded-full bg-rose-200 text-rose-800 font-mono font-black text-[11px] flex items-center justify-center">
                      {incidentArticulos}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      playSound.toggle();
                      setIncidentMuletillas((prev) => prev + 1);
                    }}
                    className="p-2.5 rounded-xl border border-purple-200 bg-purple-50/70 hover:bg-purple-100 text-purple-900 text-left transition-all active:scale-95 flex items-center justify-between"
                  >
                    <span className="text-xs font-bold">🗣️ Coletilla / Muletilla</span>
                    <span className="w-5 h-5 rounded-full bg-purple-200 text-purple-800 font-mono font-black text-[11px] flex items-center justify-center">
                      {incidentMuletillas}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      playSound.toggle();
                      setIncidentEstructura((prev) => prev + 1);
                    }}
                    className="p-2.5 rounded-xl border border-blue-200 bg-blue-50/70 hover:bg-blue-100 text-blue-900 text-left transition-all active:scale-95 flex items-center justify-between"
                  >
                    <span className="text-xs font-bold">⏱️ Epígrafe Acelerado</span>
                    <span className="w-5 h-5 rounded-full bg-blue-200 text-blue-800 font-mono font-black text-[11px] flex items-center justify-center">
                      {incidentEstructura}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* ======================================================== */
            /* TAB 2: MANUAL ENTRY FORM                                 */
            /* ======================================================== */
            <div className="space-y-3.5">
              {/* Date */}
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">
                  Fecha del cante *
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-200 text-xs font-bold font-mono tabular-nums text-slate-800 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/20"
                />
              </div>

              {/* Time Inputs */}
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">
                  Tiempo de exposición *
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      max="60"
                      value={min}
                      onChange={(e) => setMin(e.target.value)}
                      className="w-full p-2.5 pr-10 rounded-xl border border-slate-200 text-sm font-black font-mono tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/20"
                      placeholder="12"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                      min
                    </span>
                  </div>

                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      max="59"
                      value={sec}
                      onChange={(e) => setSec(e.target.value)}
                      className="w-full p-2.5 pr-10 rounded-xl border border-slate-200 text-sm font-black font-mono tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/20"
                      placeholder="30"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                      seg
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1.5 font-mono">
                  <span>Ventana reglamentaria: 11:00 – 13:40 min</span>
                  <span className="text-emerald-700 font-bold">Diana: 12:30 min</span>
                </div>
              </div>

              {/* Grade */}
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">
                  Calificación (0 a 10) *
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max="10"
                    step="0.1"
                    value={grade}
                    onChange={(e) => setGrade(e.target.value)}
                    className="w-24 p-2.5 rounded-xl border border-slate-200 text-sm font-black font-mono tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/20"
                    placeholder="7.5"
                  />
                  <div className="flex gap-1 flex-wrap">
                    {[5, 6, 7, 7.5, 8, 8.5, 9, 10].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => {
                          playSound.click();
                          setGrade(val.toString());
                        }}
                        className={cn(
                          "px-2 py-1 rounded-lg text-xs font-bold border transition-all font-mono tabular-nums",
                          parseFloat(grade) === val
                            ? "bg-purple-600 text-white border-purple-600 font-black shadow-2xs"
                            : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                        )}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Observations / Mistakes */}
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">
                  Observaciones, Dicción o Fallos del Tribunal
                </label>
                <textarea
                  value={mistakes}
                  onChange={(e) => setMistakes(e.target.value)}
                  placeholder="Ej: Buena dicción, omitió art. 1902 CC, ritmo acelerado al final..."
                  rows={2}
                  className="w-full p-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/20"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between">
          <div className="text-[11px] text-slate-400 font-medium">
            {selectedTopic ? `T.${selectedTopic.number} seleccionado` : "Sin tema"}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all"
            >
              Cerrar
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSaving}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black transition-all flex items-center gap-1.5 disabled:opacity-50 active:scale-[0.98] shadow-xs"
            >
              {isSaving ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <Check size={14} />
                  <span>Guardar Canto</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
