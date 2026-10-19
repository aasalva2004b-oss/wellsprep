import React, { useState } from "react";
import { Mic, X, Check, Loader2 } from "lucide-react";
import { Topic } from "../../types";
import { getLocalDateString } from "../../lib/utils";
import { toast } from "sonner";
import { cn } from "../../lib/utils";

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
}

export const DashboardQuickCantoModal: React.FC<DashboardQuickCantoModalProps> = ({
  isOpen,
  onClose,
  allTopics,
  onSaveCanto,
  isSaving,
}) => {
  const [topicId, setTopicId] = useState("");
  const [date, setDate] = useState(getLocalDateString());
  const [min, setMin] = useState("14");
  const [sec, setSec] = useState("0");
  const [grade, setGrade] = useState("7.0");
  const [difficulty, setDifficulty] = useState(5);
  const [mistakes, setMistakes] = useState("");

  if (!isOpen) return null;

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200/80 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-fuchsia-500 to-indigo-600 text-white flex items-center justify-center shadow-xs">
              <Mic size={18} />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900">Registrar Canto Oral</h3>
              <p className="text-xs text-slate-500 font-medium">Asienta tiempo y nota para calibrar tu tribunal</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-5 space-y-3.5 max-h-[70vh] overflow-y-auto">
          {/* Selector de Tema */}
          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">
              Tema cantado *
            </label>
            <select
              value={topicId}
              onChange={(e) => setTopicId(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/20 bg-white"
            >
              <option value="">-- Selecciona un tema --</option>
              {allTopics.map((t) => (
                <option key={t.id} value={t.id}>
                  Tema {t.number}: {t.title}
                </option>
              ))}
            </select>
          </div>

          {/* Fecha */}
          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">
              Fecha del cante *
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full p-2 rounded-xl border border-slate-200 text-xs font-bold font-mono tabular-nums text-slate-800 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/20"
            />
          </div>

          {/* Cronómetro */}
          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">
              Tiempo de exposición (Cronómetro) *
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  max="60"
                  value={min}
                  onChange={(e) => setMin(e.target.value)}
                  className="w-full p-2 pr-9 rounded-xl border border-slate-200 text-xs font-black font-mono tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/20"
                  placeholder="14"
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
                  className="w-full p-2 pr-9 rounded-xl border border-slate-200 text-xs font-black font-mono tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/20"
                  placeholder="00"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                  seg
                </span>
              </div>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              Ventana oficial de tribunal: 11:00 a 13:40 min (más de 13:40 es suspenso).
            </p>
          </div>

          {/* Calificación */}
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
                className="w-20 p-2 rounded-xl border border-slate-200 text-xs font-black font-mono tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/20"
                placeholder="7.5"
              />
              <div className="flex gap-1 flex-wrap">
                {[5, 6, 7, 8, 9, 10].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setGrade(val.toString())}
                    className={cn(
                      "px-2 py-1 rounded-lg text-xs font-bold border transition-all font-mono tabular-nums",
                      parseFloat(grade) === val
                        ? "bg-purple-100 text-purple-800 border-purple-300 font-black"
                        : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                    )}
                  >
                    {val}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Fallos / Observaciones */}
          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1">
              Observaciones / Fallos del tribunal
            </label>
            <textarea
              value={mistakes}
              onChange={(e) => setMistakes(e.target.value)}
              placeholder="Ej: Dudas en el art. 14 CE, buena introducción..."
              rows={2}
              className="w-full p-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/20"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSaving}
            className="px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black transition-all flex items-center gap-1.5 disabled:opacity-50 active:scale-[0.98]"
          >
            {isSaving ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <Check size={13} />
                Guardar Canto
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
