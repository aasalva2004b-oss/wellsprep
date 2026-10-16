import React, { useState, useMemo, useEffect } from "react";
import { 
  Calendar, Mic, Clock, CheckCircle2, AlertTriangle, 
  XCircle, Plus, Trash2, Play, Pause, RotateCcw, 
  Sparkles, BookOpen, Star, ChevronRight, X, Search,
  Award, ShieldAlert, ArrowUpRight, Flame, Volume2, Save
} from "lucide-react";
import { useFirebase } from "../lib/FirebaseProvider";
import { initialSubjects, initialTopics } from "../data/initialData";
import { Topic, Session } from "../types";
import { calculateTopicCycle } from "../lib/oposicionCycle";
import { getLocalDateString, safeParseDate, cn } from "../lib/utils";
import { getLatestCantoForTopic, isCantoSession, sessionMatchesTopic, getCantoDuration } from "../lib/cantoUtils";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";

type DayOption = "lunes" | "jueves" | "historial";

interface PreparadorSchedule {
  lunes: string[];   // Topic IDs
  jueves: string[];  // Topic IDs
}

const DEFAULT_SCHEDULE: PreparadorSchedule = {
  lunes: ["constitucional-1", "constitucional-2"],
  jueves: ["constitucional-3", "constitucional-4", "constitucional-5"]
};

const LOCAL_STORAGE_KEY = "wellsprep_preparador_schedule_v2";

export function PreparadorView() {
  const { user, userProgress, recentSessions, addStudySession } = useFirebase();

  // Active day: Lunes or Jueves or Historial
  const [activeDay, setActiveDay] = useState<DayOption>(() => {
    // Pick upcoming day based on current day of week (0 Sun, 1 Mon, 2 Tue, 3 Wed, 4 Thu, 5 Fri, 6 Sat)
    const day = new Date().getDay();
    if (day >= 1 && day <= 3) return "jueves"; // Mon-Wed -> target Thursday
    return "lunes"; // Thu-Sun -> target Monday
  });

  const [schedule, setSchedule] = useState<PreparadorSchedule>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    return DEFAULT_SCHEDULE;
  });

  // Sync schedule with Firestore when user is loaded
  useEffect(() => {
    if (!user) return;
    const loadSchedule = async () => {
      try {
        const ref = doc(db, `users/${user.uid}/settings/preparador`);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data() as PreparadorSchedule;
          if (data && (Array.isArray(data.lunes) || Array.isArray(data.jueves))) {
            const merged = {
              lunes: data.lunes || [],
              jueves: data.jueves || []
            };
            setSchedule(merged);
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(merged));
          }
        }
      } catch (e) {
        console.error("Error loading preparador schedule:", e);
      }
    };
    loadSchedule();
  }, [user]);

  const saveSchedule = async (newSchedule: PreparadorSchedule) => {
    setSchedule(newSchedule);
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(newSchedule));
      if (user) {
        const ref = doc(db, `users/${user.uid}/settings/preparador`);
        await setDoc(ref, {
          userId: user.uid,
          lunes: newSchedule.lunes || [],
          jueves: newSchedule.jueves || [],
          updatedAt: serverTimestamp()
        }, { merge: true });
      }
    } catch (e) {
      console.error("Error saving preparador schedule:", e);
    }
  };

  // State for Topic Picker modal
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerSubjectId, setPickerSubjectId] = useState<string>("constitucional");

  // State for recording feedback / cante directly from external stopwatch or preparador
  const [feedbackTopic, setFeedbackTopic] = useState<Topic | null>(null);
  const [prepGrade, setPrepGrade] = useState<number>(7.5);
  const [prepMinutes, setPrepMinutes] = useState<number>(13);
  const [prepSeconds, setPrepSeconds] = useState<number>(0);
  const [prepNotes, setPrepNotes] = useState("");

  // Topic lookup map
  const topicMap = useMemo(() => {
    const map = new Map<string, Topic>();
    for (const t of initialTopics) {
      map.set(t.id, t);
    }
    return map;
  }, []);

  // Assigned topics for current day
  const assignedTopicIds = activeDay === "historial" ? [] : (schedule[activeDay] || []);

  const assignedTopics = useMemo(() => {
    return assignedTopicIds
      .map((id) => topicMap.get(id))
      .filter((t): t is Topic => Boolean(t));
  }, [assignedTopicIds, topicMap]);

  // Detailed preparation analysis for each assigned topic
  const topicsAnalysis = useMemo(() => {
    return assignedTopics.map((topic) => {
      const prog = userProgress[topic.id];
      const sessions = recentSessions.filter((s) => sessionMatchesTopic(s, topic));
      const cycle = calculateTopicCycle(topic.id, prog, sessions);

      // Extract accurate cante metrics via rock-solid engine
      const cantoData = getLatestCantoForTopic(recentSessions, topic, prog);
      const hasCanto = cantoData.hasCanto;
      const lastCantoMins = cantoData.mins;
      const lastCantoSecs = cantoData.secs;
      const lastCantoTotalSecs = cantoData.totalSecs;
      const lastGrade = cantoData.grade;
      const lastCantoDate = cantoData.date;
      const cantoCount = cantoData.count;

      // Benchmark against 13 minutes (780 seconds)
      const targetSecs = 13 * 60; // 780s
      const diffSecs = hasCanto ? lastCantoTotalSecs - targetSecs : 0;
      const diffMinsFormatted = diffSecs === 0 ? "Exacto (13m 00s)" :
        diffSecs > 0 
          ? `+${Math.floor(diffSecs / 60)}m ${(diffSecs % 60).toString().padStart(2, "0")}s`
          : `-${Math.floor(Math.abs(diffSecs) / 60)}m ${(Math.abs(diffSecs) % 60).toString().padStart(2, "0")}s`;

      // Status classification
      // 🟢 OPTIMAL: 12:00 <= time <= 13:30 AND (grade >= 7 or no grade)
      // 🟡 WARNING: 13:31 <= time <= 15:00 OR time < 12:00 OR grade 5-6.9
      // 🔴 CRITICAL: time > 15:00 OR no canto OR grade < 5
      let status: "green" | "yellow" | "red" = "red";
      let statusText = "Crítico: Sin cante grabado";
      let statusAdvice = "No se ha registrado ningún cante previo. Es urgente realizar un ensayo cronometrado antes del preparador.";

      if (!hasCanto) {
        status = "red";
        statusText = "Sin cante grabado";
        statusAdvice = "Debes registrar el cante para calibrar si entra en la ventana oficial de 13 minutos.";
      } else if (lastCantoTotalSecs > 15 * 60) {
        status = "red";
        statusText = `Excedido (+${Math.floor(diffSecs / 60)}m)`;
        statusAdvice = "Tiempo muy largo (>15m). El preparador o el tribunal te cortará. Urge podar epígrafes secundarios.";
      } else if (lastGrade !== null && lastGrade < 5) {
        status = "red";
        statusText = `Suspenso (${lastGrade.toFixed(1)})`;
        statusAdvice = "La última calificación fue suspensa. Repasa los artículos clave y jurisprudencia antes de ir.";
      } else if (lastCantoTotalSecs >= 12 * 60 && lastCantoTotalSecs <= 13.5 * 60 && (lastGrade === null || lastGrade >= 7)) {
        status = "green";
        statusText = "Listo para el Tribunal";
        statusAdvice = "Tiempo impecable clavado a ~13 minutos y solvencia demostrada. ¡Listo para cantar!";
      } else {
        status = "yellow";
        if (lastCantoTotalSecs > 13.5 * 60) {
          statusText = `Algo largo (+${Math.floor(diffSecs / 60)}m)`;
          statusAdvice = "Se pasa 1-2 minutos de la meta de 13m. Ajusta el ritmo de dicción para entrar sin agobio.";
        } else if (lastCantoTotalSecs < 12 * 60) {
          statusText = `Tiempo escaso (${lastCantoMins}m)`;
          statusAdvice = "Ha durado menos de 12 minutos. Asegúrate de desarrollar los fundamentos y no saltarte epígrafes.";
        } else {
          statusText = "Aprobado justo";
          statusAdvice = "Asegura la estructura y los números de los artículos para subir la nota con el preparador.";
        }
      }

      // Check last touch date
      const lastSessionDate = sessions[0]?.date || prog?.lastReviewDate || prog?.firstStudyDate;
      const daysSinceTouch = lastSessionDate 
        ? Math.floor((new Date().getTime() - safeParseDate(lastSessionDate).getTime()) / (1000 * 3600 * 24))
        : null;

      const subject = initialSubjects.find((s) => s.id === topic.subjectId);

      return {
        topic,
        subject,
        prog,
        cycle,
        hasCanto,
        lastCantoMins,
        lastCantoSecs,
        lastCantoTotalSecs,
        lastGrade,
        lastCantoDate,
        cantoCount,
        diffSecs,
        diffMinsFormatted,
        status,
        statusText,
        statusAdvice,
        daysSinceTouch,
        vueltas: prog?.vueltas || 0
      };
    });
  }, [assignedTopics, userProgress, recentSessions]);

  // Overall KPIs for the day
  const kpis = useMemo(() => {
    const total = topicsAnalysis.length;
    const green = topicsAnalysis.filter((t) => t.status === "green").length;
    const yellow = topicsAnalysis.filter((t) => t.status === "yellow").length;
    const red = topicsAnalysis.filter((t) => t.status === "red").length;
    const totalMinutes = total * 13; // 13 min per topic
    const grades = topicsAnalysis.map((t) => t.lastGrade).filter((g): g is number => g !== null);
    const avgGrade = grades.length > 0 ? grades.reduce((a, b) => a + b, 0) / grades.length : null;

    return {
      total,
      green,
      yellow,
      red,
      totalMinutes,
      avgGrade
    };
  }, [topicsAnalysis]);

  // Handler to add topic to day
  const handleAddTopic = (topicId: string) => {
    if (activeDay === "historial") return;
    const currentList = schedule[activeDay] || [];
    if (!currentList.includes(topicId)) {
      const updated = {
        ...schedule,
        [activeDay]: [...currentList, topicId]
      };
      saveSchedule(updated);
      toast.success("Tema añadido a la sesión");
    } else {
      toast.info("Este tema ya está asignado para este día");
    }
  };

  // Handler to remove topic from day
  const handleRemoveTopic = (topicId: string) => {
    if (activeDay === "historial") return;
    const currentList = schedule[activeDay] || [];
    const updated = {
      ...schedule,
      [activeDay]: currentList.filter((id) => id !== topicId)
    };
    saveSchedule(updated);
    toast.success("Tema retirado de la sesión");
  };

  // Quick preset loader (e.g. Constitucional 3, 16, 17)
  const handleLoadUserExample = () => {
    const exampleIds = ["constitucional-3", "constitucional-16", "constitucional-17"];
    saveSchedule({
      ...schedule,
      jueves: exampleIds
    });
    setActiveDay("jueves");
    toast.success("Temas cargados para el Jueves: 3, 16 y 17 de Constitucional");
  };

  // Save preparador feedback
  const handleSavePreparadorFeedback = async () => {
    if (!feedbackTopic) return;
    try {
      await addStudySession(
        feedbackTopic.id,
        prepMinutes,
        feedbackTopic.difficulty || 5,
        "canto",
        getLocalDateString(),
        {
          cantoSeconds: prepSeconds,
          cantoGrade: prepGrade,
          cantoType: "preparador",
          mistakes: prepNotes,
          notes: `Sesión de cante ante preparador: ${prepMinutes}m ${prepSeconds}s. Nota: ${prepGrade}. Feedback: ${prepNotes}`
        }
      );
      toast.success(`Feedback del preparador registrado: Nota ${prepGrade}`);
      setFeedbackTopic(null);
      setPrepNotes("");
    } catch (e) {
      console.error(e);
      toast.error("Error al registrar el feedback del preparador");
    }
  };

  // Filter topics in the picker modal
  const pickerFilteredTopics = useMemo(() => {
    const list = initialTopics.filter((t) => t.subjectId === pickerSubjectId);
    if (!pickerSearch.trim()) return list;
    const q = pickerSearch.toLowerCase().trim();
    return list.filter((t) => 
      t.title.toLowerCase().includes(q) ||
      (t.fullTitle && t.fullTitle.toLowerCase().includes(q)) ||
      t.number.toString().includes(q)
    );
  }, [pickerSubjectId, pickerSearch]);

  // All historical sessions with preparador / cantos
  const preparadorSessions = useMemo(() => {
    return recentSessions.filter(isCantoSession);
  }, [recentSessions]);

  return (
    <div className="flex flex-col h-full bg-[#F5F5F7] overflow-hidden select-none">
      {/* APPLE FROSTED HEADER */}
      <div className="bg-white/85 backdrop-blur-2xl border-b border-slate-200/60 px-4 py-4 md:px-8 md:py-6 sticky top-0 z-20 shrink-0 shadow-[0_4px_24px_rgba(0,0,0,0.02)]">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 md:w-9 md:h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-md shadow-slate-900/10">
                <Award size={18} strokeWidth={2.2} />
              </div>
              <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight font-serif">
                Sección del Preparador
              </h1>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200/80">
                Lunes & Jueves · Meta 13 min
              </span>
            </div>
            <p className="text-slate-500 text-xs md:text-sm font-medium mt-1">
              Selecciona los temas para tu cante semanal y comprueba por colores, tiempos y notas si estás listo para el tribunal.
            </p>
          </div>

          {/* DAY SEGMENTED CONTROLLER (LUNES / JUEVES / HISTORIAL) */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="flex bg-slate-200/70 p-1 rounded-2xl border border-slate-300/40 w-full sm:w-auto">
              <button
                onClick={() => setActiveDay("lunes")}
                className={cn(
                  "flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2",
                  activeDay === "lunes"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                <Calendar size={13} />
                <span>Lunes</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-100 font-black">
                  {(schedule.lunes || []).length}
                </span>
              </button>

              <button
                onClick={() => setActiveDay("jueves")}
                className={cn(
                  "flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2",
                  activeDay === "jueves"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                <Calendar size={13} />
                <span>Jueves</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-100 font-black">
                  {(schedule.jueves || []).length}
                </span>
              </button>

              <button
                onClick={() => setActiveDay("historial")}
                className={cn(
                  "flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2",
                  activeDay === "historial"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                <Award size={13} />
                <span>Historial</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-100 font-black">
                  {preparadorSessions.length}
                </span>
              </button>
            </div>

            {activeDay !== "historial" && (
              <button
                onClick={() => setIsPickerOpen(true)}
                className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 shrink-0 active:scale-95"
              >
                <Plus size={14} strokeWidth={2.5} />
                <span className="hidden sm:inline">Añadir Temas</span>
              </button>
            )}
          </div>
        </div>

        {/* OVERVIEW BENCHMARK CARDS */}
        {activeDay !== "historial" && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3.5 mt-4">
            {/* Total temas */}
            <div className="bg-slate-50/80 rounded-2xl p-3 border border-slate-200/60 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-white border border-slate-200/80 flex items-center justify-center text-slate-700 shadow-sm">
                <BookOpen size={16} />
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Temas a Cantar
                </div>
                <div className="text-lg font-black text-slate-900">
                  {kpis.total} <span className="text-xs font-medium text-slate-500">temas</span>
                </div>
              </div>
            </div>

            {/* Tiempo Estimado Total */}
            <div className="bg-slate-50/80 rounded-2xl p-3 border border-slate-200/60 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-white border border-slate-200/80 flex items-center justify-center text-indigo-600 shadow-sm">
                <Clock size={16} />
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Tiempo de Cante
                </div>
                <div className="text-lg font-black text-indigo-700">
                  ~{kpis.totalMinutes}m <span className="text-xs font-medium text-slate-500">(13m c/u)</span>
                </div>
              </div>
            </div>

            {/* Semáforo de Preparación */}
            <div className="bg-slate-50/80 rounded-2xl p-3 border border-slate-200/60 flex items-center gap-3">
              <div className="flex -space-x-1">
                <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 ring-2 ring-white inline-block" />
                <span className="w-3.5 h-3.5 rounded-full bg-amber-500 ring-2 ring-white inline-block" />
                <span className="w-3.5 h-3.5 rounded-full bg-rose-500 ring-2 ring-white inline-block" />
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Diagnóstico 13m
                </div>
                <div className="text-xs font-bold text-slate-700">
                  <span className="text-emerald-600 font-black">{kpis.green} Listos</span> · <span className="text-amber-600 font-black">{kpis.yellow} Justos</span> · <span className="text-rose-600 font-black">{kpis.red} Riesgo</span>
                </div>
              </div>
            </div>

            {/* Calificación Media */}
            <div className="bg-slate-50/80 rounded-2xl p-3 border border-slate-200/60 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-white border border-slate-200/80 flex items-center justify-center text-amber-500 shadow-sm">
                <Star size={16} />
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Nota Media
                </div>
                <div className="text-lg font-black text-slate-900">
                  {kpis.avgGrade !== null ? `${kpis.avgGrade.toFixed(2)}/10` : "Pendiente"}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8 pb-28 max-w-[100rem] mx-auto w-full">
        {activeDay === "historial" ? (
          /* HISTORIAL VIEW */
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-slate-900 font-serif">
                  Histórico de Evaluaciones con el Preparador
                </h2>
                <p className="text-xs text-slate-500">
                  Registro de cantes oficiales, calificaciones obtenidas y correcciones del preparador.
                </p>
              </div>
            </div>

            {preparadorSessions.length === 0 ? (
              <div className="bg-white rounded-3xl p-12 text-center border border-slate-200/70 shadow-sm">
                <Award size={36} className="text-slate-300 mx-auto mb-3" />
                <h3 className="text-base font-bold text-slate-800">No hay cantes registrados con el preparador todavía</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-4">
                  Cuando cantes un tema el Lunes o el Jueves, pulsa en &quot;Anotar Nota del Preparador&quot; en la tarjeta del tema para registrar el feedback y notas.
                </p>
                <button
                  onClick={() => setActiveDay("jueves")}
                  className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-all"
                >
                  Ir a preparar la sesión del Jueves
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {preparadorSessions.map((session, idx) => {
                  const topic = topicMap.get(session.topicId) 
                    || initialTopics.find((t) => String(t.number) === String(session.topicId) || sessionMatchesTopic(session, t));
                  const dur = getCantoDuration(session);
                  const mins = dur.mins;
                  const secs = dur.secs;
                  const grade = session.cantoGrade ?? session.grade ?? null;

                  return (
                    <div 
                      key={session.id || idx}
                      className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 bg-slate-100 rounded-md text-slate-600">
                            {session.date || "Fecha no registrada"}
                          </span>
                          {grade !== null && (
                            <span className={cn(
                              "text-xs font-black px-2.5 py-0.5 rounded-full border",
                              grade >= 7 ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                              grade >= 5 ? "bg-amber-50 text-amber-700 border-amber-200" :
                              "bg-rose-50 text-rose-700 border-rose-200"
                            )}>
                              Nota: {grade.toFixed(1)} / 10
                            </span>
                          )}
                        </div>

                        <h3 className="font-bold text-slate-900 text-sm mb-1">
                          {topic ? (topic.number === 999 ? "Tema Extra" : `Tema ${topic.number}: ${topic.title}`) : `Tema ${session.topicId}`}
                        </h3>

                        <div className="flex items-center gap-3 text-xs text-slate-500 mt-2 mb-3">
                          <span className="flex items-center gap-1 font-semibold text-slate-700">
                            <Clock size={13} className="text-indigo-600" />
                            {dur.formatted}
                          </span>
                          <span>·</span>
                          <span className="text-[11px] text-slate-400">
                            Meta: 13m 00s ({dur.totalSecs > 13 * 60 ? `+${dur.totalSecs - 780}s` : `-${780 - dur.totalSecs}s`})
                          </span>
                        </div>

                        {session.mistakes && (
                          <div className="p-3 bg-amber-50/70 border border-amber-100 rounded-xl text-xs text-amber-900">
                            <span className="font-bold block mb-0.5 text-[10px] uppercase tracking-wider text-amber-700">
                              Observaciones del Preparador:
                            </span>
                            {session.mistakes}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* ASSIGNED TOPICS CARDS LIST */
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-slate-900 font-serif flex items-center gap-2">
                  <span>Temas Asignados para el {activeDay === "lunes" ? "Lunes" : "Jueves"}</span>
                  <span className="text-xs px-2 py-0.5 bg-slate-200/80 text-slate-700 rounded-lg font-sans font-bold">
                    {assignedTopics.length} seleccionados
                  </span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Revisa el semáforo de tiempo (objetivo 13 minutos) y la última nota antes de ir al cante.
                </p>
              </div>

              {assignedTopics.length === 0 && (
                <button
                  onClick={handleLoadUserExample}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1.5 self-start sm:self-auto px-3 py-1.5 bg-indigo-50 rounded-xl border border-indigo-200/60"
                >
                  <Sparkles size={13} />
                  <span>Cargar ejemplo: Temas 3, 16 y 17 de Constitucional</span>
                </button>
              )}
            </div>

            {assignedTopics.length === 0 ? (
              <div className="bg-white rounded-3xl p-12 text-center border border-slate-200/70 shadow-sm">
                <BookOpen size={36} className="text-slate-300 mx-auto mb-3" />
                <h3 className="text-base font-bold text-slate-800">
                  No hay temas asignados para el {activeDay === "lunes" ? "Lunes" : "Jueves"}
                </h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-5">
                  Añade los temas que vas a cantar en tu próxima sesión para ver al instante cómo los llevas de tiempo, nota y solidez.
                </p>
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={() => setIsPickerOpen(true)}
                    className="px-4 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
                  >
                    <Plus size={14} />
                    <span>Seleccionar Temas del Temario</span>
                  </button>
                  <button
                    onClick={handleLoadUserExample}
                    className="px-4 py-2.5 bg-white text-slate-700 border border-slate-200 rounded-xl text-xs font-bold hover:bg-slate-50 transition-all"
                  >
                    Cargar Temas 3, 16 y 17
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {topicsAnalysis.map((item) => {
                  const { topic, subject, status, statusText, statusAdvice, diffMinsFormatted, hasCanto, lastCantoMins, lastCantoSecs, lastGrade, daysSinceTouch, vueltas } = item;

                  // Status badge colors
                  const statusConfig = {
                    green: {
                      bg: "bg-emerald-500",
                      badge: "bg-emerald-50 text-emerald-800 border-emerald-200",
                      border: "border-emerald-200/80 hover:border-emerald-300",
                      icon: CheckCircle2,
                      label: "ÓPTIMO PARA CANTE (13 min)"
                    },
                    yellow: {
                      bg: "bg-amber-500",
                      badge: "bg-amber-50 text-amber-900 border-amber-200",
                      border: "border-amber-200/80 hover:border-amber-300",
                      icon: AlertTriangle,
                      label: "EN OBSERVACIÓN / AJUSTAR"
                    },
                    red: {
                      bg: "bg-rose-500",
                      badge: "bg-rose-50 text-rose-900 border-rose-200",
                      border: "border-rose-200/80 hover:border-rose-300",
                      icon: XCircle,
                      label: "EN RIESGO PARA EL CANTE"
                    }
                  }[status];

                  const StatusIcon = statusConfig.icon;

                  return (
                    <motion.div
                      key={topic.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className={cn(
                        "bg-white rounded-3xl p-6 border shadow-sm transition-all relative overflow-hidden flex flex-col justify-between",
                        statusConfig.border
                      )}
                    >
                      {/* Top Color Accent Ribbon */}
                      <div className={cn("absolute top-0 left-0 right-0 h-1.5", statusConfig.bg)} />

                      <div>
                        {/* Header metadata row */}
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 bg-slate-100 rounded-lg text-slate-700 border border-slate-200/60">
                              {subject?.name.split(" ")[0] || "Bloque"} · Tema {topic.number}
                            </span>
                            <span className="text-[10px] font-bold text-slate-400">
                              {vueltas > 0 ? `Vuelta ${vueltas}` : "Sin vuelta"}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border",
                              statusConfig.badge
                            )}>
                              <StatusIcon size={12} />
                              <span>{statusConfig.label}</span>
                            </span>

                            <button
                              onClick={() => handleRemoveTopic(topic.id)}
                              className="text-slate-400 hover:text-rose-600 p-1 rounded-lg hover:bg-rose-50 transition-colors"
                              title="Quitar tema de la sesión"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        {/* Topic Title */}
                        <h3 
                          className="text-base font-black font-serif text-slate-900 leading-snug mb-4"
                          title={topic.fullTitle || topic.title}
                        >
                          {topic.title}
                        </h3>

                        {/* DIAGNOSTIC BENCHMARK GRID */}
                        <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50/80 rounded-2xl border border-slate-200/60 mb-4">
                          {/* 1. Cante Time vs 13m target */}
                          <div className="flex flex-col items-center justify-center text-center p-1.5">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                              Último Cante
                            </span>
                            <span className={cn(
                              "text-xs font-black",
                              !hasCanto ? "text-slate-400" :
                              status === "green" ? "text-emerald-700" :
                              status === "yellow" ? "text-amber-700" : "text-rose-600"
                            )}>
                              {hasCanto ? `${lastCantoMins}m ${lastCantoSecs.toString().padStart(2, "0")}s` : "Sin cante"}
                            </span>
                            <span className="text-[9px] font-bold text-slate-400 mt-0.5">
                              {hasCanto ? diffMinsFormatted : "Meta: 13m 00s"}
                            </span>
                          </div>

                          {/* 2. Last Grade */}
                          <div className="flex flex-col items-center justify-center text-center p-1.5 border-x border-slate-200/60">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                              Última Nota
                            </span>
                            <span className={cn(
                              "text-xs font-black",
                              lastGrade === null ? "text-slate-400" :
                              lastGrade >= 7 ? "text-emerald-600" :
                              lastGrade >= 5 ? "text-amber-600" : "text-rose-600"
                            )}>
                              {lastGrade !== null ? `${lastGrade.toFixed(1)}/10` : "Sin nota"}
                            </span>
                            <span className="text-[9px] font-bold text-slate-400 mt-0.5">
                              {lastGrade !== null ? (lastGrade >= 8 ? "Sobresaliente" : lastGrade >= 7 ? "Notable" : lastGrade >= 5 ? "Aprobado" : "Suspenso") : "Sin examen"}
                            </span>
                          </div>

                          {/* 3. Frescura / Último Repaso */}
                          <div className="flex flex-col items-center justify-center text-center p-1.5">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                              Frescura
                            </span>
                            <span className={cn(
                              "text-xs font-black",
                              daysSinceTouch === null ? "text-slate-400" :
                              daysSinceTouch <= 3 ? "text-emerald-600" :
                              daysSinceTouch <= 7 ? "text-blue-600" : "text-amber-600"
                            )}>
                              {daysSinceTouch === null ? "Sin datos" :
                               daysSinceTouch === 0 ? "Hoy" :
                               daysSinceTouch === 1 ? "Ayer" : `Hace ${daysSinceTouch}d`}
                            </span>
                            <span className="text-[9px] font-bold text-slate-400 mt-0.5">
                              {daysSinceTouch !== null && daysSinceTouch > 7 ? "Conviene repasar" : "Memoria fresca"}
                            </span>
                          </div>
                        </div>

                        {/* Actionable Advice Pill */}
                        <div className={cn(
                          "p-3 rounded-xl border text-xs mb-4 flex items-start gap-2",
                          status === "green" ? "bg-emerald-50/70 border-emerald-200/60 text-emerald-900" :
                          status === "yellow" ? "bg-amber-50/70 border-amber-200/60 text-amber-900" :
                          "bg-rose-50/70 border-rose-200/60 text-rose-900"
                        )}>
                          <StatusIcon size={14} className="shrink-0 mt-0.5" />
                          <div className="leading-relaxed">
                            <strong className="font-black mr-1">{statusText}:</strong>
                            <span>{statusAdvice}</span>
                          </div>
                        </div>
                      </div>

                      {/* ACTION BUTTONS ROW */}
                      <div className="pt-2 border-t border-slate-100">
                        {/* Registrar Feedback del Preparador / Cante Manual */}
                        <button
                          onClick={() => {
                            setFeedbackTopic(topic);
                            setPrepGrade(lastGrade || 7.5);
                            setPrepMinutes(lastCantoMins || 13);
                            setPrepSeconds(lastCantoSecs || 0);
                          }}
                          className="w-full px-3.5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2 active:scale-95"
                        >
                          <Star size={13} className="text-amber-400" />
                          <span>Registrar Cante / Nota Preparador</span>
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* TOPIC PICKER MODAL */}
      <AnimatePresence>
        {isPickerOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-3xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-200/80 overflow-hidden"
            >
              {/* Header */}
              <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black font-serif text-slate-900">
                    Añadir Temas para el {activeDay === "lunes" ? "Lunes" : "Jueves"}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Selecciona los temas oficiales del programa para llevar a tu próxima sesión.
                  </p>
                </div>
                <button
                  onClick={() => setIsPickerOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Subject Tabs */}
              <div className="px-5 pt-3 pb-2 border-b border-slate-100 overflow-x-auto no-scrollbar flex gap-1.5">
                {initialSubjects.map((s) => {
                  const isSel = pickerSubjectId === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setPickerSubjectId(s.id)}
                      className={cn(
                        "px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0",
                        isSel
                          ? "bg-slate-900 text-white shadow-sm"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200/70"
                      )}
                    >
                      {s.name.split(" ")[0]} ({s.totalTopics})
                    </button>
                  );
                })}
              </div>

              {/* Search Bar */}
              <div className="p-4 border-b border-slate-100">
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-3 text-slate-400" />
                  <input
                    type="text"
                    value={pickerSearch}
                    onChange={(e) => setPickerSearch(e.target.value)}
                    placeholder="Buscar por número o texto (ej: 3, 16, Constitución, Tutela)..."
                    className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200/80 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-slate-900/10 text-slate-800"
                  />
                </div>
              </div>

              {/* Topics List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {pickerFilteredTopics.map((topic) => {
                  const isAssigned = (schedule[activeDay as "lunes" | "jueves"] || []).includes(topic.id);
                  const prog = userProgress[topic.id];
                  const vueltas = prog?.vueltas || 0;

                  return (
                    <div
                      key={topic.id}
                      onClick={() => {
                        if (isAssigned) {
                          handleRemoveTopic(topic.id);
                        } else {
                          handleAddTopic(topic.id);
                        }
                      }}
                      className={cn(
                        "p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 group",
                        isAssigned
                          ? "bg-indigo-50/70 border-indigo-200"
                          : "bg-white border-slate-200/70 hover:border-slate-300 hover:bg-slate-50"
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                            Tema {topic.number}
                          </span>
                          {vueltas > 0 && (
                            <span className="text-[10px] font-bold text-emerald-600">
                              Vuelta {vueltas}
                            </span>
                          )}
                        </div>
                        <h4 className="text-xs font-bold text-slate-900 truncate" title={topic.fullTitle || topic.title}>
                          {topic.title}
                        </h4>
                      </div>

                      <div className="shrink-0">
                        {isAssigned ? (
                          <span className="px-3 py-1 bg-indigo-600 text-white text-xs font-bold rounded-xl flex items-center gap-1 shadow-sm">
                            <CheckCircle2 size={12} />
                            <span>Asignado</span>
                          </span>
                        ) : (
                          <span className="px-3 py-1 bg-slate-100 text-slate-700 group-hover:bg-slate-900 group-hover:text-white text-xs font-bold rounded-xl transition-all">
                            Añadir
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
                <span className="text-xs text-slate-500 font-medium">
                  {(schedule[activeDay as "lunes" | "jueves"] || []).length} temas asignados para el {activeDay}
                </span>
                <button
                  onClick={() => setIsPickerOpen(false)}
                  className="px-5 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-all shadow-sm"
                >
                  Listo
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>



      {/* RECORD PREPARADOR FEEDBACK MODAL */}
      <AnimatePresence>
        {feedbackTopic && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 flex flex-col shadow-2xl border border-slate-200/80 relative overflow-hidden"
            >
              <button
                onClick={() => setFeedbackTopic(null)}
                className="absolute top-5 right-5 p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100"
              >
                <X size={18} />
              </button>

              <div className="mb-5">
                <span className="text-[10px] font-black uppercase tracking-wider px-3 py-1 bg-amber-50 text-amber-800 rounded-full border border-amber-200">
                  Feedback Oficial del Preparador
                </span>
                <h3 className="text-xl font-black font-serif text-slate-900 mt-2">
                  Tema {feedbackTopic.number}: {feedbackTopic.title}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Introduce la nota oficial y observaciones que te dio el preparador en tu sesión de cante.
                </p>
              </div>

              <div className="space-y-4">
                {/* Nota del preparador */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/60">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-700">Nota del Preparador (0 - 10):</span>
                    <span className="text-lg font-black text-amber-600">{prepGrade.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    step="0.25"
                    value={prepGrade}
                    onChange={(e) => setPrepGrade(parseFloat(e.target.value))}
                    className="w-full accent-amber-500"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400 font-bold mt-1">
                    <span>1 (Suspenso)</span>
                    <span>5 (Aprobado)</span>
                    <span>7 (Notable)</span>
                    <span>10 (Sobresaliente)</span>
                  </div>
                </div>

                {/* Tiempo cantado */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/60">
                  <span className="text-xs font-bold text-slate-700 block mb-2">
                    Tiempo de Cante con el Preparador:
                  </span>
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <label className="text-[10px] font-bold text-slate-400 block mb-1 uppercase">Minutos</label>
                      <input
                        type="number"
                        min="0"
                        max="30"
                        value={prepMinutes}
                        onChange={(e) => setPrepMinutes(parseInt(e.target.value) || 0)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-800"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] font-bold text-slate-400 block mb-1 uppercase">Segundos</label>
                      <input
                        type="number"
                        min="0"
                        max="59"
                        value={prepSeconds}
                        onChange={(e) => setPrepSeconds(parseInt(e.target.value) || 0)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-800"
                      />
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-400 font-medium mt-2">
                    Meta de examen oral: 13 minutos clavados.
                  </div>
                </div>

                {/* Comentarios del preparador */}
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Consejos y Correcciones del Preparador:
                  </label>
                  <textarea
                    rows={3}
                    value={prepNotes}
                    onChange={(e) => setPrepNotes(e.target.value)}
                    placeholder="Ej: Faltó hilar el art. 53.2 de la CE, buena dicción y postura, recortar epígrafe 3 para entrar en 13 minutos..."
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-slate-900/10 text-slate-800"
                  />
                </div>

                {/* Botón guardar */}
                <button
                  onClick={handleSavePreparadorFeedback}
                  className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-xs font-black shadow-md transition-all flex items-center justify-center gap-2 active:scale-95"
                >
                  <Save size={14} />
                  <span>Guardar Evaluación del Preparador</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
