import React, { useState, useMemo } from "react";
import { X, Search, Clock, BookOpen, Sparkles, Check, Calendar } from "lucide-react";
import { Topic } from "../../types";
import { 
  PlannerTask, 
  PlannerActivityType, 
  ACTIVITY_CONFIG, 
  PlannerSettings, 
  DEFAULT_PLANNER_SETTINGS,
  estimateTaskDurationMinutes 
} from "../../lib/plannerEngine";
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
  settings?: PlannerSettings;
}

export const TaskEditorModal: React.FC<TaskEditorModalProps> = ({
  isOpen,
  onClose,
  onSaveTask,
  initialTask,
  initialDate,
  allTopics,
  sessions,
  settings = DEFAULT_PLANNER_SETTINGS
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

  const selectedTopic = useMemo(() => {
    return allTopics.find((t) => t.id === selectedTopicId) || allTopics[0];
  }, [allTopics, selectedTopicId]);

  // Recalcular estimación automática según actividad y tema
  const autoEstimatedMinutes = useMemo(() => {
    return estimateTaskDurationMinutes(selectedTopic, activityType, sessions, settings);
  }, [selectedTopic, activityType, sessions, settings]);

  const finalEstimatedMinutes = customMinutes !== null ? customMinutes : autoEstimatedMinutes;

  // Lista única de materias para pestañas rápidas
  const availableSubjects = useMemo(() => {
    const subs = new Set<string>();
    allTopics.forEach((t) => {
      if (t.subjectId) subs.add(t.subjectId);
    });
    return Array.from(subs);
  }, [allTopics]);

  // Filtrado de temas en el buscador y por materia
  const filteredTopics = useMemo(() => {
    let list = allTopics;
    if (selectedSubjectFilter !== "todos") {
      list = list.filter((t) => t.subjectId === selectedSubjectFilter);
    }
    if (!search.trim()) return list.slice(0, 45);
    const q = search.toLowerCase().trim();
    return list.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.fullTitle && t.fullTitle.toLowerCase().includes(q)) ||
        t.number.toString().includes(q) ||
        t.subjectId.toLowerCase().includes(q)
    ).slice(0, 50);
  }, [allTopics, search, selectedSubjectFilter]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (!selectedTopic) return;
    playSound.success();
    onSaveTask({
      id: initialTask?.id,
      topicId: selectedTopic.id,
      topicNumber: selectedTopic.number,
      topicTitle: selectedTopic.title,
      subjectId: selectedTopic.subjectId,
      activityType,
      date,
      status: initialTask?.status || "pending",
      estimatedMinutes: finalEstimatedMinutes,
      pagesCount: selectedTopic.pages || 18,
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
                return (
                  <button
                    key={topic.id}
                    type="button"
                    onClick={() => {
                      playSound.click();
                      setSelectedTopicId(topic.id);
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
                      <span className="truncate">{topic.title}</span>
                    </div>
                    <span className={cn("text-[10px] shrink-0 font-mono", isSelected ? "text-slate-300" : "text-slate-400")}>
                      {topic.pages || 18}p
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. Duración Estimada y Ritmo */}
          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Clock size={14} className="text-indigo-600" />
                <span>Tiempo Estimado de Estudio</span>
              </span>
              <span className="text-xs font-mono font-black text-slate-900">
                {formatMinutesToHours(finalEstimatedMinutes)} ({finalEstimatedMinutes}m)
              </span>
            </div>

            <div className="flex items-center gap-2 pt-1">
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
                  Restablecer automático
                </button>
              )}
            </div>
            <p className="text-[11px] text-slate-500 font-medium">
              Calculado según volumen ({selectedTopic?.pages || 18} págs) y tu ritmo para <em>{ACTIVITY_CONFIG[activityType].label}</em>.
            </p>
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
