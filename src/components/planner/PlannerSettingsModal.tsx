import { useDialogAccessibility } from '../../hooks/useDialogAccessibility';
import React, { useEffect, useState } from "react";
import { X, Sliders, Clock, Sparkles, Check, RotateCcw } from "lucide-react";
import { PlannerSettings, DEFAULT_PLANNER_SETTINGS } from "../../lib/plannerEngine";
import { playSound } from "../../lib/sound";
import { motion } from "motion/react";

interface PlannerSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: PlannerSettings;
  onSaveSettings: (newSettings: PlannerSettings) => void;
}

export const PlannerSettingsModal: React.FC<PlannerSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSaveSettings
}) => {
  const [form, setForm] = useState<PlannerSettings>({ ...settings });
  useEffect(() => { if (isOpen) setForm({ ...settings }); }, [isOpen, settings]);

  const dialogRef = useDialogAccessibility({ isOpen: isOpen, onClose });
  if (!isOpen) return null;

  const handleReset = () => {
    playSound.click();
    setForm({ ...DEFAULT_PLANNER_SETTINGS });
  };

  const handleSave = () => {
    playSound.success();
    onSaveSettings(form);
    onClose();
  };

  return (
    <div className="wp-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/40 backdrop-blur-xs">
      <motion.div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Ajustes del planificador"
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="wp-modal-panel bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/90 shadow-2xl max-w-lg w-full max-h-[90dvh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-800 flex items-center justify-center font-bold">
              <Sliders size={18} />
            </div>
            <div>
              <h3 className="text-base font-black font-serif text-slate-900">
                Parámetros del Planificador
              </h3>
              <p className="text-xs text-slate-500">
                Ajusta las horas de jornada y velocidades de cálculo
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
              aria-label="Cerrar diálogo"
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4">
          <label className="block text-xs font-bold text-slate-700">
            Contactos después del estudio
            <select aria-label="Protocolo de refrescos" value={form.autoRefreshProtocol || 'adaptive'} onChange={event => setForm({ ...form, autoRefreshProtocol: event.target.value as PlannerSettings['autoRefreshProtocol'] })} className="block w-full mt-2 rounded-xl border p-2">
              <option value="adaptive">Una recomendación flexible según el modelo</option>
              <option value="three_days">Protocolo elegido: tres días consecutivos</option>
              <option value="off">Sin propuestas automáticas</option>
            </select>
            <span className="block mt-1 font-normal">Son propuestas de trabajo. Las fechas de cante se conservan como compromisos independientes.</span>
          </label>
          {/* 1. Meta Diaria de Horas */}
          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-900">
                Capacidad Base Diaria (Horas)
              </label>
              <span className="text-xs font-mono font-black text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                {form.targetDailyHours}h
              </span>
            </div>
            <input
              type="range"
              min={4}
              max={12}
              step={0.5}
              value={form.targetDailyHours}
              onChange={(e) => setForm({ ...form, targetDailyHours: parseFloat(e.target.value) })}
              className="w-full accent-indigo-600"
            />
            <p className="text-[11px] text-slate-500">
              Si la suma de tareas de un día supera su umbral disponible, el sistema lo marcará como sobrecargado.
            </p>

            {/* Ajuste personalizado por día de la semana */}
            <div className="mt-3 pt-2.5 border-t border-slate-200">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono block mb-1.5">
                Disponibilidad por Día (Modificaciones Excepcionales)
              </span>
              <div className="grid grid-cols-7 gap-1 text-center">
                {[
                  { key: "1", label: "L" },
                  { key: "2", label: "M" },
                  { key: "3", label: "X" },
                  { key: "4", label: "J" },
                  { key: "5", label: "V" },
                  { key: "6", label: "S" },
                  { key: "0", label: "D" }
                ].map(({ key, label }) => {
                  const currentVal = form.dailyAvailabilityOverrides?.[key] !== undefined 
                    ? form.dailyAvailabilityOverrides[key] 
                    : form.targetDailyHours;
                  return (
                    <div key={key} className="bg-white p-1 rounded-xl border border-slate-200">
                      <span className="text-[10px] font-mono font-bold block text-slate-500">{label}</span>
                      <input
                        type="number"
                        step={0.5}
                        min={0}
                        max={14}
                        value={currentVal}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          const updated = { ...(form.dailyAvailabilityOverrides || {}) };
                          if (isNaN(val)) {
                            delete updated[key];
                          } else {
                            updated[key] = val;
                          }
                          setForm({ ...form, dailyAvailabilityOverrides: updated });
                        }}
                        className="w-full text-center text-xs font-mono font-bold text-slate-900 border-0 p-0 focus:outline-hidden"
                      />
                      <span className="text-[8px] font-mono text-slate-400 block">h</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 2. Velocidades en Minutos por Página */}
          <div className="space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 font-mono">
              Ritmo de Estudio por Actividad (min/pág)
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="p-3 rounded-2xl border border-blue-200 bg-blue-50/50">
                <span className="text-[11px] font-bold text-blue-900 block mb-1">
                  Estudio Nuevo
                </span>
                <input
                  type="number"
                  step={0.1}
                  min={1}
                  max={15}
                  value={form.velocidadEstudioNuevoMinPorPagina}
                  onChange={(e) => setForm({ ...form, velocidadEstudioNuevoMinPorPagina: parseFloat(e.target.value) || 5.5 })}
                  className="w-full px-2 py-1 bg-white border border-blue-300 rounded-lg text-xs font-mono font-bold text-slate-900"
                />
              </div>

              <div className="p-3 rounded-2xl border border-orange-200 bg-orange-50/50">
                <span className="text-[11px] font-bold text-orange-900 block mb-1">
                  Refresco
                </span>
                <input
                  type="number"
                  step={0.1}
                  min={0.5}
                  max={10}
                  value={form.velocidadRefrescoMinPorPagina}
                  onChange={(e) => setForm({ ...form, velocidadRefrescoMinPorPagina: parseFloat(e.target.value) || 2.0 })}
                  className="w-full px-2 py-1 bg-white border border-orange-300 rounded-lg text-xs font-mono font-bold text-slate-900"
                />
              </div>

              <div className="p-3 rounded-2xl border border-emerald-200 bg-emerald-50/50">
                <span className="text-[11px] font-bold text-emerald-900 block mb-1">
                  Repaso
                </span>
                <input
                  type="number"
                  step={0.1}
                  min={1}
                  max={10}
                  value={form.velocidadRepasoMinPorPagina}
                  onChange={(e) => setForm({ ...form, velocidadRepasoMinPorPagina: parseFloat(e.target.value) || 3.5 })}
                  className="w-full px-2 py-1 bg-white border border-emerald-300 rounded-lg text-xs font-mono font-bold text-slate-900"
                />
              </div>
            </div>
          </div>

          {/* 3. Duración de los 3 Refrescos Automáticos */}
          <div className="space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 font-mono">
              Duración Predeterminada de Refrescos (minutos)
            </h4>

            <div className="grid grid-cols-3 gap-2.5">
              <div className="p-2.5 bg-slate-50 rounded-2xl border border-slate-200 text-center">
                <span className="text-[10px] font-mono text-slate-500 block mb-1">R1 (D+1)</span>
                <input
                  type="number"
                  min={10}
                  max={120}
                  value={form.refresco1DuracionMinutos}
                  onChange={(e) => setForm({ ...form, refresco1DuracionMinutos: parseInt(e.target.value) || 45 })}
                  className="w-full text-center py-1 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold"
                />
              </div>

              <div className="p-2.5 bg-slate-50 rounded-2xl border border-slate-200 text-center">
                <span className="text-[10px] font-mono text-slate-500 block mb-1">R2 (D+2)</span>
                <input
                  type="number"
                  min={10}
                  max={120}
                  value={form.refresco2DuracionMinutos}
                  onChange={(e) => setForm({ ...form, refresco2DuracionMinutos: parseInt(e.target.value) || 35 })}
                  className="w-full text-center py-1 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold"
                />
              </div>

              <div className="p-2.5 bg-slate-50 rounded-2xl border border-slate-200 text-center">
                <span className="text-[10px] font-mono text-slate-500 block mb-1">R3 (D+3)</span>
                <input
                  type="number"
                  min={10}
                  max={120}
                  value={form.refresco3DuracionMinutos}
                  onChange={(e) => setForm({ ...form, refresco3DuracionMinutos: parseInt(e.target.value) || 25 })}
                  className="w-full text-center py-1 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-100 shrink-0">
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 font-bold"
          >
            <RotateCcw size={13} />
            <span>Restablecer</span>
          </button>

          <div className="flex items-center gap-2">
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
              Guardar Configuración
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
