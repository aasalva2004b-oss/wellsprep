import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, X, Clock, FileText, AlertTriangle } from 'lucide-react';
import { ScheduledTask } from '../lib/scheduler';
import { Session } from '../types';
import { cn } from '../lib/utils';
import { v4 as uuidv4 } from 'uuid';

interface SessionEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: ScheduledTask;
  onSave: (sessionData: Partial<Session>) => void;
}

export function SessionEditorModal({ isOpen, onClose, task, onSave }: SessionEditorModalProps) {
  const [startTime, setStartTime] = useState(task?.startTime || "00:00");
  const [endTime, setEndTime] = useState(task?.endTime || "00:00");
  const [difficulty, setDifficulty] = useState<number>(3);
  const [notes, setNotes] = useState('');
  const [failedPlan, setFailedPlan] = useState(false);
  const [completesVuelta, setCompletesVuelta] = useState(true);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="session-editor-modal"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-2xl"
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 12 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 12 }}
          transition={{ type: "spring", stiffness: 350, damping: 30 }}
          className="bg-white rounded-[2.5rem] w-full max-w-lg overflow-hidden shadow-[0_25px_70px_-15px_rgba(0,0,0,0.35)] border border-slate-200/70"
        >
          {/* Header */}
          <div className="flex justify-between items-center px-6 py-5 border-b border-slate-200/60 bg-white/80 backdrop-blur-xl">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center">
                <Check className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-black text-sm text-slate-900 tracking-tight">Registrar Estudio Real</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Bitácora de Sesión</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-all flex items-center justify-center active:scale-95 shadow-sm"
              title="Cerrar"
            >
              <X size={16} strokeWidth={2.5} />
            </button>
          </div>

          <div className="p-6 space-y-5 flex flex-col max-h-[82vh] overflow-y-auto no-scrollbar">
            {/* Topic Info Card */}
            <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200/60">
              <span className="text-[10px] font-black text-indigo-600 uppercase tracking-wider block mb-0.5">Tema Planificado</span>
              <p className="text-sm font-black font-serif text-slate-900 leading-tight">{task.topicTitle}</p>
            </div>

            {/* Time Controls */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <Clock size={11} className="text-indigo-600"/> Hora Inicio
                </label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50/80 border border-slate-200/80 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-bold text-xs text-slate-800 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <Clock size={11} className="text-indigo-600"/> Hora Fin
                </label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50/80 border border-slate-200/80 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-bold text-xs text-slate-800 outline-none transition-all"
                />
              </div>
            </div>

            {/* Plan Alert Switch */}
            <label className="flex items-center gap-3 p-3.5 rounded-2xl border border-rose-200/60 bg-rose-50/40 hover:bg-rose-50/70 transition-colors cursor-pointer">
              <div className="w-8 h-8 rounded-xl bg-rose-100/80 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle size={15}/>
              </div>
              <div className="flex-1 min-w-0">
                <span className="block text-xs font-black text-slate-900">Incumplimiento de horario</span>
                <span className="block text-[11px] font-medium text-rose-700/80 truncate">Empecé más tarde o hubo interrupción</span>
              </div>
              <input 
                type="checkbox" 
                checked={failedPlan}
                onChange={(e) => setFailedPlan(e.target.checked)}
                className="w-4 h-4 text-rose-600 rounded border-slate-300 focus:ring-rose-500"
              />
            </label>

            {/* Perceived Difficulty Picker */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                  Dificultad Percibida (1-10)
                </label>
                <span className="text-[11px] font-black text-slate-700">Nivel {difficulty}</span>
              </div>
              <div className="bg-slate-100/90 p-1 rounded-2xl flex gap-1 border border-slate-200/50">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((d) => {
                  const isActive = difficulty === d;
                  let activeClass = "bg-white text-slate-900 shadow-sm border border-slate-200/60";
                  if (isActive) {
                    if (d <= 3) activeClass = "bg-emerald-600 text-white shadow-sm border-transparent";
                    else if (d <= 6) activeClass = "bg-indigo-600 text-white shadow-sm border-transparent";
                    else if (d <= 8) activeClass = "bg-amber-500 text-white shadow-sm border-transparent";
                    else activeClass = "bg-rose-600 text-white shadow-sm border-transparent";
                  }
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDifficulty(d)}
                      className={cn(
                        "flex-1 py-2 rounded-xl text-xs font-black transition-all",
                        isActive ? activeClass : "text-slate-400 hover:text-slate-700 hover:bg-slate-200/40"
                      )}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
              <div className="flex justify-between mt-1.5 px-1 text-[9px] font-black uppercase tracking-wider">
                <span className="text-emerald-600">Fluido (1-3)</span>
                <span className="text-indigo-600">Estándar (4-6)</span>
                <span className="text-rose-600">Complejo (7-10)</span>
              </div>
            </div>

            {/* Vuelta Check Switch */}
            <label className="flex items-center gap-3 p-3.5 rounded-2xl border border-slate-200/70 bg-slate-50/80 hover:bg-slate-100/80 transition-colors cursor-pointer">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-slate-900">Completa Vuelta al Tema</span>
                  <span className="text-[10px] font-black text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
                    {completesVuelta ? "+1 Vuelta" : "Solo Tiempo"}
                  </span>
                </div>
                <span className="block text-[11px] font-medium text-slate-500 mt-0.5">
                  Incrementa el ciclo del temario
                </span>
              </div>
              <div className={cn("w-10 h-6 rounded-full flex items-center px-1 transition-colors", completesVuelta ? "bg-indigo-600" : "bg-slate-300")}>
                <div className={cn("w-4 h-4 bg-white rounded-full transition-transform shadow-sm", completesVuelta ? "translate-x-4" : "translate-x-0")} />
              </div>
              <input 
                type="checkbox"
                checked={completesVuelta}
                onChange={(e) => setCompletesVuelta(e.target.checked)}
                className="hidden"
              />
            </label>

            {/* Notes */}
            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <FileText size={11} className="text-slate-400"/> Observaciones del Preparador o de la Sesión
              </label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Puntos a reforzar, ritmo de exposición o dudas surgidas..."
                className="w-full p-3 bg-slate-50/80 border border-slate-200/80 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium text-xs text-slate-800 outline-none transition-all resize-none placeholder:text-slate-400"
              />
            </div>

            {/* CTA Button */}
            <button
              type="button"
              onClick={() => {
                const timeToMinutes = (t: string) => {
                  const [h, m] = t.split(":").map(Number);
                  return (h || 0) * 60 + (m || 0);
                };
                const durReal = Math.max(0, timeToMinutes(endTime) - timeToMinutes(startTime));

                onSave({
                  completesVuelta,
                  durationMinutes: durReal > 0 ? durReal : 60,
                  dificultadReal: difficulty,
                  notes: notes,
                });
              }}
              className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 active:scale-[0.98] transition-all text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-sm flex items-center justify-center gap-2"
            >
              <Check size={16} /> Guardar y Marcar Completado
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
