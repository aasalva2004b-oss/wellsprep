import React, { useState, useMemo } from "react";
import { X, Save, AlertCircle, Trash2, Calendar, Clock, BookOpen, Sparkles, CheckCircle2 } from "lucide-react";
import { initialSubjects, initialTopics } from "../data/initialData";
import { useFirebase } from "../lib/FirebaseProvider";
import { toast } from "sonner";
import { cn } from "../lib/utils";

interface EditSessionDialogProps {
  session: any;
  onClose: () => void;
  onSessionUpdated?: () => void;
}

export function EditSessionDialog({ session, onClose, onSessionUpdated }: EditSessionDialogProps) {
  const { updateStudySession, deleteStudySession, userProgress } = useFirebase();

  // Selected topic ID
  const [topicId, setTopicId] = useState<string>(session.topicId || "");
  const [subjectFilter, setSubjectFilter] = useState<string>("");
  const [date, setDate] = useState<string>(session.date || new Date().toISOString().split("T")[0]);
  const [durationMinutes, setDurationMinutes] = useState<number>(
    session.durationMinutes || session.durationReal || Math.round((session.effectiveHours || 0) * 60) || 60
  );
  const [modality, setModality] = useState<string>(
    session.modality || session.type || "repaso"
  );
  const [difficulty, setDifficulty] = useState<number>(
    session.dificultadReal || session.difficulty || 5
  );
  const [notes, setNotes] = useState<string>(session.notes || "");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // All topics available including custom topics
  const allTopics = useMemo(() => {
    const list = [...initialTopics];
    Object.entries(userProgress).forEach(([id, prog]: [string, any]) => {
      if (prog.isCustom && !prog.isDeleted && !list.find((t) => t.id === id)) {
        list.push({
          id,
          subjectId: prog.subjectId || "general",
          number: prog.number || 999,
          title: prog.customTitle || "Tema Personalizado",
          pages: prog.pages || 0,
          difficulty: prog.difficulty || 5,
          tiempoEstudioHoras: prog.studyTimeHours || 0,
          fechaPrimerEstudio: prog.firstStudyDate || "",
          fechasRepasos: [],
          mejorTiempoCantoMinutos: prog.mejorTiempoCantoMinutos || 0,
          mejorTiempoCantoSegundos: prog.mejorTiempoCantoSegundos || 0,
          notas: prog.notas || "",
        });
      }
    });
    return list;
  }, [userProgress]);

  // Current selected topic details
  const selectedTopic = allTopics.find((t) => t.id === topicId);
  const currentSubject = selectedTopic
    ? initialSubjects.find((s) => s.id === selectedTopic.subjectId)
    : null;

  // Filtered topics for the picker
  const filteredTopics = useMemo(() => {
    if (!subjectFilter) return allTopics;
    return allTopics.filter((t) => t.subjectId === subjectFilter);
  }, [allTopics, subjectFilter]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topicId) {
      toast.error("Por favor selecciona un tema válido.");
      return;
    }
    if (durationMinutes <= 0) {
      toast.error("La duración debe ser mayor a 0 minutos.");
      return;
    }

    try {
      setIsSaving(true);
      await updateStudySession(
        session.id,
        {
          topicId,
          date,
          durationMinutes: Number(durationMinutes),
          durationReal: Number(durationMinutes),
          effectiveHours: Math.round((Number(durationMinutes) / 60) * 100) / 100,
          type: modality,
          modality,
          difficulty: Number(difficulty),
          dificultadReal: Number(difficulty),
          notes,
          topicTitle: selectedTopic ? `Tema ${selectedTopic.number} - ${selectedTopic.title}` : session.topicTitle,
        },
        session
      );
      if (onSessionUpdated) onSessionUpdated();
      onClose();
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("¿Seguro que deseas eliminar esta sesión? Las horas se restarán automáticamente del progreso del tema.")) {
      return;
    }
    try {
      setIsDeleting(true);
      await deleteStudySession(session.topicId, session.id);
      if (onSessionUpdated) onSessionUpdated();
      onClose();
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/80 w-full max-w-lg overflow-hidden flex flex-col my-auto animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse" />
              <h2 className="text-lg font-black text-slate-900 tracking-tight font-serif">
                Editar y Reasignar Sesión
              </h2>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Los cambios recalculan automáticamente el tema anterior y el nuevo
            </p>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-6 space-y-5 overflow-y-auto max-h-[75vh]">
          {/* Origin Badge */}
          {(session.source === "aerofocus" || session.source === "aerofocus_pro") && (
            <div className="p-3 bg-blue-50/70 border border-blue-200/70 rounded-2xl flex items-center gap-2.5 text-xs text-blue-900">
              <Sparkles size={16} className="text-blue-600 shrink-0" />
              <div>
                <span className="font-bold">Sincronizada vía AeroFocus Pro:</span> ID Vuelo:{" "}
                <span className="font-mono text-[11px] font-bold">{session.flightId || "N/A"}</span>
              </div>
            </div>
          )}

          {/* Subject & Topic Reassignment */}
          <div className="space-y-2">
            <label className="text-xs font-black uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
              <BookOpen size={14} className="text-slate-400" />
              Reasignar Tema y Asignatura
            </label>
            
            {/* Subject filter tabs */}
            <div className="flex gap-1 overflow-x-auto pb-1 no-scrollbar">
              <button
                type="button"
                onClick={() => setSubjectFilter("")}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-xs font-bold transition-all shrink-0",
                  !subjectFilter
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                )}
              >
                Todos los bloques
              </button>
              {initialSubjects.map((sub) => (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => setSubjectFilter(sub.id)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-bold transition-all shrink-0",
                    subjectFilter === sub.id
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  )}
                >
                  {sub.name}
                </button>
              ))}
            </div>

            {/* Topic selector */}
            <select
              value={topicId}
              onChange={(e) => setTopicId(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            >
              <option value="">-- Seleccionar Tema --</option>
              {filteredTopics.map((t) => {
                const sub = initialSubjects.find((s) => s.id === t.subjectId);
                return (
                  <option key={t.id} value={t.id}>
                    [{sub ? sub.name : t.subjectId}] Tema {t.number}: {t.title}
                  </option>
                );
              })}
            </select>

            {selectedTopic && currentSubject && (
              <div className="text-[11px] text-slate-500 flex items-center gap-1.5 pt-0.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: currentSubject.color }} />
                <span>Bloque actual: <strong className="text-slate-700">{currentSubject.name}</strong> · Tema {selectedTopic.number}</span>
              </div>
            )}
          </div>

          {/* Date & Duration */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                <Calendar size={14} className="text-slate-400" />
                Fecha
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                <Clock size={14} className="text-slate-400" />
                Duración (minutos)
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  max="1440"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  required
                />
                <span className="absolute right-3 top-2 text-[11px] font-bold text-slate-400">
                  {(durationMinutes / 60).toFixed(1)} h
                </span>
              </div>
            </div>
          </div>

          {/* Modality Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-black uppercase tracking-wider text-slate-600">
              Modalidad de Estudio
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { id: "estudio", label: "Estudio" },
                { id: "repaso", label: "Repaso" },
                { id: "refresco", label: "Refresco" },
                { id: "canto", label: "Canto" },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setModality(m.id)}
                  className={cn(
                    "py-2 px-2 rounded-xl text-xs font-bold border transition-all text-center",
                    modality === m.id || (m.id === "estudio" && (modality === "primer_estudio" || modality === "estudio_inicial"))
                      ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                      : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Difficulty Rater 1-10 */}
          <div className="space-y-2 p-4 bg-slate-50 border border-slate-200/70 rounded-2xl">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black uppercase tracking-wider text-slate-700">
                Dificultad Percibida (1 - 10)
              </label>
              <span className={cn(
                "px-2 py-0.5 rounded-lg text-xs font-black font-mono",
                difficulty <= 3 ? "bg-emerald-100 text-emerald-800" :
                difficulty <= 6 ? "bg-amber-100 text-amber-800" :
                "bg-rose-100 text-rose-800"
              )}>
                {difficulty} / 10
              </span>
            </div>
            
            {/* 10-step button selector */}
            <div className="grid grid-cols-10 gap-1 pt-1">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setDifficulty(num)}
                  className={cn(
                    "h-8 rounded-lg font-mono text-xs font-black transition-all flex items-center justify-center",
                    difficulty === num
                      ? num <= 3
                        ? "bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-600/30"
                        : num <= 6
                        ? "bg-amber-500 text-white shadow-sm ring-2 ring-amber-500/30"
                        : "bg-rose-600 text-white shadow-sm ring-2 ring-rose-600/30"
                      : "bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-100"
                  )}
                >
                  {num}
                </button>
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-slate-400 font-bold px-0.5">
              <span>Muy fácil (1-3)</span>
              <span>Medio (4-6)</span>
              <span>Muy denso (7-10)</span>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-xs font-black uppercase tracking-wider text-slate-600">
              Notas u Observaciones del Preparador
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Epígrafes repasados, dudas, comentarios del cante..."
              rows={2}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-between border-t border-slate-100">
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting || isSaving}
              className="px-3.5 py-2 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-all flex items-center gap-1.5 disabled:opacity-50"
            >
              <Trash2 size={14} />
              <span>Eliminar sesión</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSaving || isDeleting}
                className="px-5 py-2 rounded-xl text-xs font-black text-white bg-slate-900 hover:bg-slate-800 shadow-md shadow-slate-900/10 transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                <Save size={14} />
                <span>{isSaving ? "Guardando..." : "Guardar Cambios"}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
