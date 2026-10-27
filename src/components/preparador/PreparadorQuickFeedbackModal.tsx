import React, { useState, useEffect } from "react";
import { X, Star, Timer, Save, CheckCircle2, AlertTriangle, Sparkles } from "lucide-react";
import { Topic } from "../../types";
import { playSound } from "../../lib/sound";
import { WINDOW_MIN_SECS, WINDOW_MAX_SECS } from "../../lib/preparationScore";
import { cn } from "../../lib/utils";

interface PreparadorQuickFeedbackModalProps {
  topic: Topic | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: {
    topicId: string;
    durationMinutes: number;
    durationSeconds: number;
    grade: number;
    notes: string;
  }) => Promise<void>;
  initialGrade?: number | null;
  initialMinutes?: number;
  initialSeconds?: number;
  isSaving?: boolean;
}

export const PreparadorQuickFeedbackModal: React.FC<PreparadorQuickFeedbackModalProps> = ({
  topic,
  isOpen,
  onClose,
  onSave,
  initialGrade,
  initialMinutes = 12,
  initialSeconds = 30,
  isSaving = false,
}) => {
  const [grade, setGrade] = useState<number>(7.5);
  const [minutes, setMinutes] = useState<number>(12);
  const [seconds, setSeconds] = useState<number>(30);
  const [notes, setNotes] = useState<string>("");

  useEffect(() => {
    if (topic) {
      setGrade(initialGrade ?? 7.5);
      setMinutes(initialMinutes > 0 ? initialMinutes : 12);
      setSeconds(initialSeconds >= 0 ? initialSeconds : 30);
      setNotes("");
    }
  }, [topic, initialGrade, initialMinutes, initialSeconds]);

  if (!isOpen || !topic) return null;

  const totalSecs = minutes * 60 + seconds;
  const isInWindow = totalSecs >= WINDOW_MIN_SECS && totalSecs <= WINDOW_MAX_SECS;
  const isTooShort = totalSecs > 0 && totalSecs < WINDOW_MIN_SECS;
  const isTooLong = totalSecs > WINDOW_MAX_SECS;

  const quickGradePresets = [5.0, 6.5, 7.5, 8.5, 9.5];
  const quickCorrectionTags = [
    "Buena dicción y soltura",
    "Faltaron artículos clave",
    "Ajustar tiempo epígrafe 3",
    "Ritmo perfecto de 12:30",
    "Cuidar postura y tono",
  ];

  const handleAddTag = (tag: string) => {
    playSound.click();
    setNotes((prev) => (prev ? `${prev}. ${tag}` : tag));
  };

  const handleSelectGrade = (val: number) => {
    playSound.toggle();
    setGrade(val);
  };

  const handleSetTime = (m: number, s: number) => {
    playSound.toggle();
    setMinutes(m);
    setSeconds(s);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    playSound.click();
    await onSave({
      topicId: topic.id,
      durationMinutes: minutes,
      durationSeconds: seconds,
      grade,
      notes,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="bg-white rounded-3xl max-w-lg w-full p-5 sm:p-7 flex flex-col shadow-2xl border border-slate-200/80 relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={() => {
            playSound.click();
            onClose();
          }}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-colors"
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div className="mb-4 pr-6">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
              Evaluación Posterior del Preparador
            </span>
          </div>
          <h3 className="text-lg font-black font-serif text-slate-900">
            Tema {topic.number}: {topic.title}
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Registra la nota oficial y el tiempo cantado en tu sesión de cante.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 1. Nota del Preparador (Slider + Presets rápidos) */}
          <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200/60">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Star size={13} className="text-amber-500 fill-amber-500" />
                Nota Oficial (0 - 10):
              </span>
              <span className="text-xl font-black font-serif text-slate-900 tabular-nums">
                {grade.toFixed(1)}
                <span className="text-xs text-slate-400 font-sans ml-0.5">/ 10</span>
              </span>
            </div>

            {/* Quick Presets */}
            <div className="grid grid-cols-5 gap-1.5 mb-3">
              {quickGradePresets.map((val) => {
                const isSelected = Math.abs(grade - val) < 0.1;
                return (
                  <button
                    key={val}
                    type="button"
                    onClick={() => handleSelectGrade(val)}
                    className={cn(
                      "py-1 rounded-xl text-xs font-black transition-all active:scale-95",
                      isSelected
                        ? "bg-slate-900 text-white shadow-2xs"
                        : "bg-white text-slate-700 border border-slate-200/80 hover:bg-slate-100"
                    )}
                  >
                    {val.toFixed(1)}
                  </button>
                );
              })}
            </div>

            {/* Range Slider */}
            <input
              type="range"
              min="1"
              max="10"
              step="0.1"
              value={grade}
              onChange={(e) => setGrade(parseFloat(e.target.value))}
              className="w-full accent-slate-900 cursor-pointer"
            />
          </div>

          {/* 2. Tiempo de Cante */}
          <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200/60">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Timer size={13} className="text-indigo-600" />
                Tiempo de Cante:
              </span>

              {/* Window Status Badge */}
              {isInWindow ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                  <CheckCircle2 size={11} strokeWidth={2.5} />
                  Ventana Tribunal (11:50 - 13:40)
                </span>
              ) : isTooShort ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-black text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                  <AlertTriangle size={11} strokeWidth={2.5} />
                  Cante Corto (&lt;11:50)
                </span>
              ) : isTooLong ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-black text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
                  <AlertTriangle size={11} strokeWidth={2.5} />
                  Excedido (&gt;13:40)
                </span>
              ) : null}
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="text-[10px] font-bold text-slate-400 block mb-1 uppercase">Minutos</label>
                <input
                  type="number"
                  min="0"
                  max="30"
                  value={minutes}
                  onChange={(e) => setMinutes(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-800 text-center font-mono"
                />
              </div>
              <div className="flex-1">
                <label className="text-[10px] font-bold text-slate-400 block mb-1 uppercase">Segundos</label>
                <input
                  type="number"
                  min="0"
                  max="59"
                  value={seconds}
                  onChange={(e) => setSeconds(Math.min(59, Math.max(0, parseInt(e.target.value, 10) || 0)))}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-800 text-center font-mono"
                />
              </div>

              {/* Quick Preset Buttons for Target Time */}
              <div className="flex flex-col gap-1 shrink-0 pt-3">
                <button
                  type="button"
                  onClick={() => handleSetTime(12, 30)}
                  className="px-2.5 py-1 text-[10px] font-black bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg border border-indigo-200/60 active:scale-95"
                >
                  Meta 12:30
                </button>
              </div>
            </div>
          </div>

          {/* 3. Observaciones y Correcciones */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Observaciones del Preparador:
            </label>
            {/* Quick tags */}
            <div className="flex flex-wrap gap-1 mb-2">
              {quickCorrectionTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => handleAddTag(tag)}
                  className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900 active:scale-95 transition-colors"
                >
                  + {tag}
                </button>
              ))}
            </div>

            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej: Buena dicción, recortar epígrafe 3 para no apurar tiempo..."
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-slate-900/10 text-slate-800 resize-none"
            />
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSaving}
            className={cn(
              "w-full py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-xs font-black shadow-md transition-all flex items-center justify-center gap-2 active:scale-98",
              isSaving && "opacity-60 cursor-not-allowed"
            )}
          >
            <Save size={14} className={cn(isSaving && "animate-spin")} />
            <span>{isSaving ? "Guardando Evaluación..." : "Guardar Evaluación del Preparador"}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
