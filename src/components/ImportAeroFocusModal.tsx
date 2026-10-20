import React, { useState } from "react";
import { X, Sparkles, Send, FileText, CheckCircle2, BookOpen, Clock, Calendar, AlertCircle } from "lucide-react";
import { useFirebase } from "../lib/FirebaseProvider";
import { initialSubjects, initialTopics } from "../data/initialData";
import { toast } from "sonner";
import { cn, getLocalDateString } from "../lib/utils";

interface ImportAeroFocusModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function ImportAeroFocusModal({ isOpen, onClose, onSuccess }: ImportAeroFocusModalProps) {
  const { addQuarantineEventManually, userProgress } = useFirebase();

  const [mode, setMode] = useState<"assisted" | "raw">("assisted");

  // Assisted mode fields
  const [date, setDate] = useState(getLocalDateString());
  const [selectedSubjectId, setSelectedSubjectId] = useState("constitucional");
  const [topicNumber, setTopicNumber] = useState("7");
  const [modality, setModality] = useState<"repaso" | "primer_estudio" | "refresco" | "canto">("repaso");
  const [minutes, setMinutes] = useState("90");
  const [flightId, setFlightId] = useState(`vuelo_${new Date().getHours()}h`);
  const [completesVuelta, setCompletesVuelta] = useState(true);
  const [notes, setNotes] = useState("");

  // Raw JSON mode fields
  const [rawText, setRawText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const currentSubjectTopics = initialTopics.filter((t) => t.subjectId === selectedSubjectId);

  const handleSubmitAssisted = async (e: React.FormEvent) => {
    e.preventDefault();
    const durMins = Number(minutes);
    if (isNaN(durMins) || durMins <= 0) {
      toast.error("Por favor introduce una duración válida en minutos.");
      return;
    }

    const tNum = Number(topicNumber);
    const matchedTopic = currentSubjectTopics.find((t) => t.number === tNum) || initialTopics.find(t => t.number === tNum);

    const payload = {
      isTest: false,
      source: "aerofocus_pro",
      flightId: flightId.trim() || `manana_${Date.now()}`,
      date: date || getLocalDateString(),
      dailyTotalEffectiveHours: Math.round((durMins / 60) * 100) / 100,
      totalFlightEffectiveMinutes: durMins,
      topics: [
        {
          topicId: matchedTopic?.id || `${selectedSubjectId}-${tNum}`,
          topicNumber: tNum,
          topicTitle: matchedTopic ? matchedTopic.title : `Tema ${tNum}`,
          category: selectedSubjectId,
          modality: modality,
          effectiveMinutes: durMins,
          effectiveHours: Math.round((durMins / 60) * 100) / 100,
          completesVuelta,
          notes: notes.trim() || "Sesión de la mañana vía AeroFocus Pro",
        },
      ],
    };

    try {
      setIsSubmitting(true);
      const ok = await addQuarantineEventManually(payload);
      if (ok) {
        if (onSuccess) onSuccess();
        onClose();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitRaw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawText.trim()) {
      toast.error("Por favor pega el contenido JSON de AeroFocus.");
      return;
    }

    try {
      setIsSubmitting(true);
      let parsed: any;
      try {
        parsed = JSON.parse(rawText.trim());
      } catch (err: any) {
        throw new Error("El texto introducido no es un JSON válido. Comprueba el formato.");
      }

      const ok = await addQuarantineEventManually(parsed);
      if (ok) {
        if (onSuccess) onSuccess();
        onClose();
      }
    } catch (err: any) {
      toast.error(err.message || "Error procesando el JSON.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/90 w-full max-w-lg overflow-hidden flex flex-col my-auto animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-pulse" />
              <h2 className="text-lg font-black text-slate-900 tracking-tight font-serif">
                Importar Sesión de AeroFocus a Cuarentena
              </h2>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Envía la sesión de la mañana a la Bandeja de Cuarentena para revisarla antes de incorporarla
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

        {/* Tab switch: Asistido vs Pegar JSON */}
        <div className="flex border-b border-slate-100 bg-slate-50/30 px-6 pt-3 gap-2">
          <button
            type="button"
            onClick={() => setMode("assisted")}
            className={cn(
              "pb-2.5 text-xs font-black transition-all flex items-center gap-1.5 border-b-2",
              mode === "assisted"
                ? "border-indigo-600 text-indigo-900"
                : "border-transparent text-slate-400 hover:text-slate-700"
            )}
          >
            <Sparkles size={14} className={mode === "assisted" ? "text-indigo-600" : "text-slate-400"} />
            <span>Entrada Rápida del Vuelo</span>
          </button>
          <button
            type="button"
            onClick={() => setMode("raw")}
            className={cn(
              "pb-2.5 text-xs font-black transition-all flex items-center gap-1.5 border-b-2",
              mode === "raw"
                ? "border-indigo-600 text-indigo-900"
                : "border-transparent text-slate-400 hover:text-slate-700"
            )}
          >
            <FileText size={14} className={mode === "raw" ? "text-indigo-600" : "text-slate-400"} />
            <span>Pegar JSON de AeroFocus</span>
          </button>
        </div>

        {/* Body */}
        {mode === "assisted" ? (
          <form onSubmit={handleSubmitAssisted} className="p-6 space-y-4 overflow-y-auto max-h-[75vh]">
            <div className="p-3 bg-amber-50/70 border border-amber-200/70 rounded-2xl flex items-start gap-2.5 text-xs text-amber-900">
              <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong>Modo Prueba Activo:</strong> Esta sesión se retendrá primero en la <strong>Bandeja de Cuarentena</strong>. Podrás revisar el tema, comprobar si cierra vuelta y aceptarla o rechazarla.
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-black uppercase tracking-wider text-slate-600 flex items-center gap-1">
                  <Calendar size={13} className="text-slate-400" /> Fecha del Vuelo
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-black uppercase tracking-wider text-slate-600 flex items-center gap-1">
                  <Clock size={13} className="text-slate-400" /> Minutos de Estudio
                </label>
                <input
                  type="number"
                  min="1"
                  max="1440"
                  placeholder="Ej. 90"
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  required
                />
              </div>
            </div>

            {/* Materia y Número de Tema */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-black uppercase tracking-wider text-slate-600 flex items-center gap-1">
                  <BookOpen size={13} className="text-slate-400" /> Materia
                </label>
                <select
                  value={selectedSubjectId}
                  onChange={(e) => setSelectedSubjectId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none"
                >
                  {initialSubjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-black uppercase tracking-wider text-slate-600">
                  Número de Tema
                </label>
                <select
                  value={topicNumber}
                  onChange={(e) => setTopicNumber(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none"
                >
                  {currentSubjectTopics.map((t) => (
                    <option key={t.id} value={t.number}>
                      Tema {t.number}: {t.title.substring(0, 32)}...
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Modalidad */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-black uppercase tracking-wider text-slate-600">
                Modalidad del Vuelo
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { id: "repaso", label: "Repaso" },
                  { id: "primer_estudio", label: "1er Estudio" },
                  { id: "refresco", label: "Refresco" },
                  { id: "canto", label: "Canto" },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setModality(m.id as any)}
                    className={cn(
                      "py-1.5 text-xs font-bold rounded-xl border transition-all text-center",
                      modality === m.id
                        ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                        : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Completa Vuelta */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
              <label className="text-[11px] font-black uppercase tracking-wider text-slate-700">
                ¿Este vuelo de la mañana completa la vuelta al tema?
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setCompletesVuelta(true)}
                  className={cn(
                    "py-1.5 px-3 rounded-lg text-xs font-bold border transition-all flex items-center justify-center gap-1",
                    completesVuelta
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : "bg-white text-slate-600 border-slate-200"
                  )}
                >
                  <CheckCircle2 size={13} />
                  <span>Sí (Cierra Vuelta)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCompletesVuelta(false)}
                  className={cn(
                    "py-1.5 px-3 rounded-lg text-xs font-bold border transition-all",
                    !completesVuelta
                      ? "bg-slate-800 text-white border-slate-800"
                      : "bg-white text-slate-600 border-slate-200"
                  )}
                >
                  <span>No (Sesión Parcial)</span>
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-black uppercase tracking-wider text-slate-600">
                Notas / ID de Vuelo (Opcional)
              </label>
              <input
                type="text"
                placeholder="Ej. Repaso mañana temas 7 y 8 epígrafes 1-3"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none"
              />
            </div>

            <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 rounded-xl text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 shadow-md flex items-center gap-1.5 transition-all disabled:opacity-50"
              >
                <Send size={13} />
                <span>{isSubmitting ? "Enviando..." : "Enviar a Cuarentena"}</span>
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSubmitRaw} className="p-6 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase tracking-wider text-slate-700">
                Pega el payload JSON de AeroFocus Pro:
              </label>
              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder='{"source":"aerofocus_pro","date":"2026-10-20","topics":[{"topicNumber":7,"effectiveMinutes":90,"modality":"repaso"}]}'
                rows={8}
                className="w-full p-3 bg-slate-900 text-emerald-400 font-mono text-xs rounded-2xl border border-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>

            <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 rounded-xl text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 shadow-md flex items-center gap-1.5 transition-all disabled:opacity-50"
              >
                <Send size={13} />
                <span>{isSubmitting ? "Procesando..." : "Procesar y Poner en Cuarentena"}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
