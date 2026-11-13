import { FormEvent, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { getLocalDateString } from '../lib/utils';
import { buildObservedSession, StudySessionTarget } from '../lib/observedSession';
import { useDialogAccessibility } from '../hooks/useDialogAccessibility';
import { DS } from '../lib/designSystem';

export type { StudySessionTarget } from '../lib/observedSession';

export function StudySessionDialog({ target, onClose, onSave }: {
  target: StudySessionTarget;
  onClose: () => void;
  onSave: (session: Record<string, any>) => Promise<void>;
}) {
  const [minutes, setMinutes] = useState('');
  const [difficulty, setDifficulty] = useState(target.difficulty && target.difficulty >= 1 && target.difficulty <= 10 ? String(target.difficulty) : '');
  const [date, setDate] = useState(getLocalDateString());
  const [notes, setNotes] = useState('');
  const [completesVuelta, setCompletesVuelta] = useState(false);
  const [cantoGrade, setCantoGrade] = useState('');
  const [cantoSeconds, setCantoSeconds] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [startPage, setStartPage] = useState('');
  const [endPage, setEndPage] = useState('');
  const [confirmPlannedPages, setConfirmPlannedPages] = useState(false);
  const [recallOutcome, setRecallOutcome] = useState<"" | "success" | "failure">("");
  const [recallCoverage, setRecallCoverage] = useState<"whole_topic" | "partial">("partial");
  const dialogId = useId();
  const minutesRef = useRef<HTMLInputElement>(null);
  const dialogRef = useDialogAccessibility<HTMLElement>({ onClose, initialFocusRef: minutesRef, disabled: saving });
  const canComplete = (target.type === 'repaso' || target.type === 'canto') && !target.metadata?.isPartial;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      const form = { minutes, difficulty, date, notes, completesVuelta, cantoGrade, cantoSeconds, startPage, endPage, confirmPlannedPages, recallOutcome, recallCoverage };
      const session = buildObservedSession(target, form);
      setSaving(true);
      await onSave(session);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido guardar la sesión.');
    } finally {
      setSaving(false);
    }
  };
  const inputClass = `mt-1 ${DS.field}`;
  return (
    <div className="wp-modal-overlay fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/60 p-3 sm:p-5" style={{ paddingTop: 'max(.75rem, env(safe-area-inset-top))', paddingBottom: 'max(.75rem, env(safe-area-inset-bottom))' }}>
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={`${dialogId}-title`} aria-describedby={`${dialogId}-topic`} className={`wp-modal-panel flex w-full max-w-lg max-h-[calc(100dvh-2rem)] flex-col overflow-hidden text-slate-900 ${DS.modalContainer}`}>
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 p-4 sm:p-5">
          <div className="min-w-0"><h2 id={`${dialogId}-title`} className="font-bold text-lg">Registrar sesión real</h2><p id={`${dialogId}-topic`} className="mt-1 text-sm text-slate-600 line-clamp-2">{target.title}</p></div>
          <button type="button" aria-label="Cerrar registro de sesión" disabled={saving} onClick={onClose} className={`${DS.iconButton} shrink-0`}><X size={20} /></button>
        </div>
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-4">
        {Number.isFinite(target.estimatedMinutes) && target.estimatedMinutes > 0 && <p className="mt-3 rounded-xl bg-indigo-50 p-3 text-sm text-indigo-900">Estimación orientativa: {Math.round(target.estimatedMinutes)} min. Introduce el tiempo realizado para registrar esta sesión.</p>}
          <label className="block text-sm font-medium">Minutos reales<input ref={minutesRef} type="number" inputMode="decimal" min={target.type === 'canto' ? '0' : '0.01'} max="1440" step="0.01" required value={minutes} onChange={e => setMinutes(e.target.value)} className={inputClass} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium">Dificultad<input type="number" min="1" max="10" step="0.1" required value={difficulty} onChange={e => setDifficulty(e.target.value)} className={inputClass} /><span className="mt-1 block text-xs font-normal text-slate-500">{target.difficulty ? 'Valor del tema; ajústalo a esta sesión.' : 'Valora la dificultad de esta sesión, de 1 a 10.'}</span></label>
            <label className="block text-sm font-medium">Fecha<input type="date" required value={date} onChange={e => setDate(e.target.value)} className={inputClass} /></label>
          </div>
          {target.type !== 'canto' && <fieldset className="space-y-2 rounded-xl border border-slate-200 p-3">
            <legend className="text-sm font-semibold">Páginas realmente trabajadas</legend>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">Primera página real<input type="number" min="1" step="1" value={startPage} onChange={e => setStartPage(e.target.value)} className={inputClass} /></label>
              <label className="text-sm">Última página real<input type="number" min="1" step="1" value={endPage} onChange={e => setEndPage(e.target.value)} className={inputClass} /></label>
            </div>
            {(target.metadata?.pagesNumbers?.length || target.metadata?.startPage && target.metadata?.endPage) ? <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={confirmPlannedPages} onChange={e => setConfirmPlannedPages(e.target.checked)} className="size-5 shrink-0" />Confirmo que he trabajado las páginas concretas previstas</label> : null}
            <p className="text-xs text-slate-600">Si no indicas páginas, guardaremos el tiempo con cobertura desconocida. Un repaso no completa páginas pendientes de estudio inicial.</p>
          </fieldset>}
          {target.type === 'canto' && <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium">Nota del cante<input type="number" min="0" max="10" step="0.1" value={cantoGrade} onChange={e => setCantoGrade(e.target.value)} className={inputClass} /></label>
            <label className="block text-sm font-medium">Segundos del cante<input type="number" min="0" max="59" step="1" value={cantoSeconds} onChange={e => setCantoSeconds(e.target.value)} className={inputClass} /></label>
          </div>}
          <fieldset className="space-y-2 rounded-xl border border-slate-200 p-3">
            <legend className="text-sm font-semibold">Comprobación de memoria sin apuntes (opcional)</legend>
            <p className="text-xs text-slate-600">Indica el resultado solo si has intentado recordar el contenido sin consultar material. La nota del cante se guarda por separado.</p>
            <label className="block text-sm">Resultado<select aria-label="Resultado de recuerdo sin apuntes" value={recallOutcome} onChange={e => setRecallOutcome(e.target.value as "" | "success" | "failure")} className={inputClass}>
              <option value="">Sin evaluación de recuerdo</option><option value="success">He recordado el contenido evaluado</option><option value="failure">No he recordado el contenido evaluado</option>
            </select></label>
            {recallOutcome && <label className="block text-sm">Contenido evaluado<select aria-label="Alcance del recuerdo evaluado" value={recallCoverage} onChange={e => setRecallCoverage(e.target.value as "whole_topic" | "partial")} className={inputClass}>
              <option value="partial">Una parte del tema</option><option value="whole_topic">El tema completo</option>
            </select></label>}
          </fieldset>
          <label className="block text-sm font-medium">Notas<textarea value={notes} onChange={e => setNotes(e.target.value)} className={inputClass} rows={2} /></label>
          {canComplete ? <label className="flex min-h-11 gap-3 items-center text-sm"><input type="checkbox" checked={completesVuelta} onChange={e => setCompletesVuelta(e.target.checked)} className="size-5 shrink-0" />He completado una vuelta entera</label> : <p className="text-sm text-slate-600">Esta sesión de estudio, refresco o trabajo parcial no suma una vuelta completa.</p>}
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-200 bg-white p-4" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}><button type="button" disabled={saving} onClick={onClose} className={DS.btnSecondary}>Cancelar</button><button type="submit" disabled={saving} className={`${DS.btnPrimary} flex-1 sm:flex-none`}>{saving ? 'Guardando…' : 'Guardar sesión real'}</button></div>
        </form>
      </section>
    </div>
  );
}
