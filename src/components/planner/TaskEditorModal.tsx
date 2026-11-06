import React, { useState, useMemo } from "react";
import { X, Search, Clock, BookOpen, Sparkles, Check, Calendar, Info, Edit3 } from "lucide-react";
import { Topic } from "../../types";
import { 
  PlannerTask, 
  PlannerActivityType, 
  ACTIVITY_CONFIG, 
  PlannerSettings, 
  DEFAULT_PLANNER_SETTINGS,
  estimateTaskAdaptiveDetails
} from "../../lib/plannerEngine";
import { 
  getCanonicalTopic, 
  buildCanonicalTopicMap, 
  CanonicalTopic 
} from "../../lib/canonicalTopicService";
import { cn, formatMinutesToHours } from "../../lib/utils";
import { playSound } from "../../lib/sound";
import { motion } from "motion/react";

interface TaskEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveTask: (taskData: Omit<PlannerTask, "id" | "createdAt"> & { id?: string }) => void;
  initialTask?: PlannerTask | null;
  initialDate: string; // "YYYY-MM-DD"
  allTopics: Topic[];
  sessions: any[];
  userProgress?: Record<string, any>;
  settings?: PlannerSettings;
  onUpdateTopicProgress?: (topicId: string, updates: any) => Promise<void>;
}

export const TaskEditorModal: React.FC<TaskEditorModalProps> = ({
  isOpen,
  onClose,
  onSaveTask,
  initialTask,
  initialDate,
  allTopics,
  sessions,
  userProgress = {},
  settings = DEFAULT_PLANNER_SETTINGS,
  onUpdateTopicProgress
}) => {
  const [selectedTopicId, setSelectedTopicId] = useState<string>(
    initialTask?.topicId || (allTopics[0]?.id || "constitucional-1")
  );
  const [activityType, setActivityType] = useState<PlannerActivityType>(
    initialTask?.activityType || "repaso"
  );
  const [date, setDate] = useState<string>(initialTask?.date || initialDate);
  const [search, setSearch] = useState("");
  const [notes, setNotes] = useState(initialTask?.notes || "");
  const [customMinutes, setCustomMinutes] = useState<number | null>(
    initialTask?.estimatedMinutes || null
  );

  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>("todos");
  const [isEditingPagesInline, setIsEditingPagesInline] = useState(false);
  const [inlinePagesInput, setInlinePagesInput] = useState<string>("");

  // Map canónico de todos los temas con fuente de verdad única
  const canonicalMap = useMemo(() => {
    return buildCanonicalTopicMap(allTopics, userProgress, sessions);
  }, [allTopics, userProgress, sessions]);

  const selectedCanonicalTopic = useMemo<CanonicalTopic>(() => {
    return getCanonicalTopic(selectedTopicId, allTopics, userProgress, sessions);
  }, [selectedTopicId, allTopics, userProgress, sessions]);

  // Cálculo adaptativo con explicación transparente
  const adaptiveDetails = useMemo(() => {
    return estimateTaskAdaptiveDetails(selectedCanonicalTopic, activityType, sessions, settings);
  }, [selectedCanonicalTopic, activityType, sessions, settings]);

  const autoEstimatedMinutes = adaptiveDetails.minutes;
  const finalEstimatedMinutes = customMinutes !== null ? customMinutes : autoEstimatedMinutes;

  // Lista única de materias para pestañas rápidas
  const availableSubjects = useMemo(() => {
    const subs = new Set<string>();
    allTopics.forEach((t) => {
      if (t.subjectId) subs.add(t.subjectId);
    });
    return Array.from(subs);
  }, [allTopics]);

  // Filtrado de temas con datos canónicos
  const filteredTopics = useMemo(() => {
    let list = allTopics;
    if (selectedSubjectFilter !== "todos") {
      list = list.filter((t) => t.subjectId === selectedSubjectFilter);
    }
    if (!search.trim()) return list.slice(0, 50);
    const q = search.toLowerCase().trim();
    return list.filter((t) => {
      const c = canonicalMap.get(t.id);
      const title = (c?.title || t.title).toLowerCase();
      const fullTitle = (t.fullTitle || "").toLowerCase();
      const num = t.number.toString();
      const sub = (t.subjectId || "").toLowerCase();
      return title.includes(q) || fullTitle.includes(q) || num.includes(q) || sub.includes(q);
    }).slice(0, 50);
  }, [allTopics, search, selectedSubjectFilter, canonicalMap]);

  if (!isOpen) return null;

  const handleSaveInlinePages = async () => {
    const num = parseFloat(inlinePagesInput.replace(",", "."));
    if (isNaN(num) || num <= 0) return;
    if (onUpdateTopicProgress) {
      await onUpdateTopicProgress(selectedCanonicalTopic.id, { pages: num });
      playSound.success();
    }
    setIsEditingPagesInline(false);
  };

  const handleSave = () => {
    if (!selectedCanonicalTopic) return;
    playSound.success();
    onSaveTask({
      id: initialTask?.id,
      topicId: selectedCanonicalTopic.id,
      topicNumber: selectedCanonicalTopic.number,
      topicTitle: selectedCanonicalTopic.title,
      subjectId: selectedCanonicalTopic.subjectId,
      activityType,
      date,
      status: initialTask?.status || "pending",
      estimatedMinutes: finalEstimatedMinutes,
      pagesCount: selectedCanonicalTopic.pages > 0 ? selectedCanonicalTopic.pages : undefined,
      notes: notes.trim() || undefined
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/40 backdrop-blur-xs">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/90 shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
          <div>
            <h3 className="text-base font-black font-serif text-slate-900">
              {initialTask ? "Editar Tarea del Plan" : "Nueva Tarea de Estudio"}
            </h3>
            <p className="text-xs text-slate-500">
              Asigna tema, tipo de actividad y duración estimada para la semana
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
          {/* 1. Selector de Tipo de Actividad (Los 4 Pilares con Colores Oficiales) */}
          <div>
            <label className="text-xs font-black uppercase tracking-wider text-slate-500 font-mono block mb-2">
              Tipo de Actividad
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(["estudio_nuevo", "refresco", "repaso", "cante"] as PlannerActivityType[]).map((type) => {
                const cfg = ACTIVITY_CONFIG[type];
                const isSelected = activityType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      playSound.click();
                      setActivityType(type);
                    }}
                    className={cn(
                      "p-2.5 rounded-2xl border text-left transition-all flex items-start gap-2.5",
                      isSelected
                        ? `${cfg.bgClass} ${cfg.borderClass} ring-2 ring-slate-900 shadow-xs`
                        : "bg-slate-50/70 hover:bg-white border-slate-200"
                    )}
                  >
                    <span className={cn("w-3 h-3 rounded-full shrink-0 mt-0.5", cfg.dotClass)} />
                    <div className="min-w-0">
                      <span className={cn("text-xs font-black block truncate", isSelected ? cfg.textClass : "text-slate-900")}>
                        {cfg.label}
                      </span>
                      <span className="text-[10px] text-slate-500 line-clamp-1">
                        {cfg.description}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Fecha Programada */}
          <div>
            <label className="text-xs font-black uppercase tracking-wider text-slate-500 font-mono block mb-1.5">
              Fecha Programada
            </label>
            <div className="flex items-center gap-2">
              <Calendar size={16} className="text-slate-400" />
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-indigo-600"
              />
            </div>
          </div>

          {/* 3. Selección de Tema */}
          <div>
            <label className="text-xs font-black uppercase tracking-wider text-slate-500 font-mono block mb-1.5">
              Seleccionar Tema ({allTopics.length} disponibles)
            </label>

            {/* Chips de Materia */}
            {availableSubjects.length > 1 && (
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-2 mb-1">
                <button
                  type="button"
                  onClick={() => setSelectedSubjectFilter("todos")}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider font-mono shrink-0 transition-all",
                    selectedSubjectFilter === "todos"
                      ? "bg-slate-900 text-white shadow-2xs"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  )}
                >
                  Todas
                </button>
                {availableSubjects.map((sub) => (
                  <button
                    key={sub}
                    type="button"
                    onClick={() => setSelectedSubjectFilter(sub)}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider font-mono shrink-0 transition-all",
                      selectedSubjectFilter === sub
                        ? "bg-indigo-600 text-white shadow-2xs"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    )}
                  >
                    {sub}
                  </button>
                ))}
              </div>
            )}

            <div className="relative mb-2">
              <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por número o título..."
                className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-indigo-600"
              />
            </div>

            <div className="max-h-40 overflow-y-auto space-y-1 border border-slate-200/80 rounded-2xl p-1 bg-slate-50/50">
              {filteredTopics.map((topic) => {
                const isSelected = selectedTopicId === topic.id;
                const canonical = canonicalMap.get(topic.id);
                const pagesDisplay = canonical?.hasExplicitPages && canonical.pages > 0
                  ? `${canonical.pages}p`
                  : "Sin págs";
                return (
                  <button
                    key={topic.id}
                    type="button"
                    onClick={() => {
                      playSound.click();
                      setSelectedTopicId(topic.id);
                      setIsEditingPagesInline(false);
                    }}
                    className={cn(
                      "w-full text-left px-3 py-2 rounded-xl text-xs transition-all flex items-center justify-between gap-2",
                      isSelected
                        ? "bg-slate-900 text-white font-bold shadow-xs"
                        : "hover:bg-white text-slate-700"
                    )}
                  >
                    <div className="min-w-0 flex items-center gap-2">
                      <span className={cn(
                        "font-mono text-[10px] px-1.5 py-0.5 rounded-md shrink-0 font-bold",
                        isSelected ? "bg-slate-800 text-slate-200" : "bg-slate-200 text-slate-700"
                      )}>
                        T.{topic.number}
                      </span>
                      <span className="truncate">{canonical?.title || topic.title}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={cn(
                        "text-[10px] font-mono",
                        isSelected ? "text-slate-300" : canonical?.hasExplicitPages ? "text-slate-500 font-bold" : "text-amber-500"
                      )}>
                        {pagesDisplay}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Inline Quick-Add Pages if Topic is Missing Official Pages */}
            {!selectedCanonicalTopic.hasExplicitPages && onUpdateTopicProgress && (
              <div className="mt-2 p-2.5 rounded-xl bg-amber-50/90 border border-amber-200 text-amber-900 text-xs">
                {!isEditingPagesInline ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium">
                      Este tema no tiene páginas en el temario oficial.
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setInlinePagesInput("");
                        setIsEditingPagesInline(true);
                      }}
                      className="px-2 py-1 rounded-lg bg-amber-200/80 hover:bg-amber-300 text-amber-950 text-[10px] font-bold flex items-center gap-1 shrink-0"
                    >
                      <Edit3 size={11} />
                      <span>Fijar páginas</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-bold block">
                      Introduce las páginas oficiales de T.{selectedCanonicalTopic.number}:
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="0.5"
                        min="1"
                        placeholder="Ej: 6.5"
                        value={inlinePagesInput}
                        onChange={(e) => setInlinePagesInput(e.target.value)}
                        className="w-24 px-2 py-1 bg-white border border-amber-300 rounded-lg text-xs font-mono font-bold text-slate-900 focus:outline-amber-600"
                      />
                      <button
                        type="button"
                        onClick={handleSaveInlinePages}
                        className="px-2.5 py-1 bg-amber-700 hover:bg-amber-800 text-white rounded-lg text-xs font-bold shadow-2xs"
                      >
                        Guardar en Ficha
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsEditingPagesInline(false)}
                        className="px-2 py-1 text-xs text-amber-800 hover:text-amber-950 font-bold"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 4. Duración Estimada Adaptativa y Ritmo */}
          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Clock size={14} className="text-indigo-600" />
                <span>Tiempo Estimado Adaptativo</span>
              </span>
              <div className="flex items-center gap-1.5">
                <span className={cn(
                  "text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full font-mono",
                  adaptiveDetails.confidence === "alta" && "bg-emerald-100 text-emerald-800 border border-emerald-200",
                  adaptiveDetails.confidence === "media" && "bg-indigo-100 text-indigo-800 border border-indigo-200",
                  adaptiveDetails.confidence === "baja" && "bg-slate-200 text-slate-700 border border-slate-300"
                )}>
                  {adaptiveDetails.confidence === "alta" ? "Calibración Empírica" : adaptiveDetails.confidence === "media" ? "Estimación Materia" : "Base Estándar"}
                </span>
                <span className="text-xs font-mono font-black text-slate-900">
                  {formatMinutesToHours(finalEstimatedMinutes)} ({finalEstimatedMinutes}m)
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-0.5">
              <button
                type="button"
                onClick={() => setCustomMinutes(Math.max(10, finalEstimatedMinutes - 15))}
                className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                -15m
              </button>
              <input
                type="number"
                min={5}
                max={480}
                value={finalEstimatedMinutes}
                onChange={(e) => setCustomMinutes(parseInt(e.target.value) || 30)}
                className="w-20 text-center py-1 bg-white border border-slate-300 rounded-lg text-xs font-mono font-black text-slate-900"
              />
              <button
                type="button"
                onClick={() => setCustomMinutes(finalEstimatedMinutes + 15)}
                className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                +15m
              </button>
              {customMinutes !== null && customMinutes !== autoEstimatedMinutes && (
                <button
                  type="button"
                  onClick={() => setCustomMinutes(null)}
                  className="text-[10px] text-indigo-600 hover:underline ml-auto font-bold"
                >
                  Restablecer adaptativo
                </button>
              )}
            </div>

            {/* Desglose explicativo de la estimación */}
            <div className="pt-2 border-t border-slate-200/60 space-y-1">
              <p className="text-[11px] text-slate-700 font-medium leading-relaxed">
                {adaptiveDetails.explanation}
              </p>
              <div className="flex items-center gap-2 text-[10px] font-mono text-slate-500 pt-0.5 flex-wrap">
                <span className="px-1.5 py-0.5 rounded-md bg-white border border-slate-200">
                  Volumen: {selectedCanonicalTopic.pages > 0 ? `${selectedCanonicalTopic.pages} págs` : "Sin registrar"}
                </span>
                <span className="px-1.5 py-0.5 rounded-md bg-white border border-slate-200">
                  Vuelta {selectedCanonicalTopic.vueltas || 0}
                </span>
                <span className="px-1.5 py-0.5 rounded-md bg-white border border-slate-200">
                  Dificultad {selectedCanonicalTopic.difficulty}/10
                </span>
              </div>
            </div>
          </div>

          {/* 5. Notas u Observaciones */}
          <div>
            <label className="text-xs font-black uppercase tracking-wider text-slate-500 font-mono block mb-1">
              Notas u Objetivos del Día (Opcional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej: Incidir en epígrafe 3 o hacer esquema rápido..."
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-indigo-600"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 rounded-xl"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-xs active:scale-95 transition-all"
          >
            {initialTask ? "Guardar Cambios" : "Añadir al Planificador"}
          </button>
        </div>
      </motion.div>
    </div>
  );
};
