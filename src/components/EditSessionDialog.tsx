import React, { useId, useRef, useState } from 'react';
import { X, Save, Trash2, RotateCw, Sparkles } from 'lucide-react';
import { initialSubjects } from '../data/initialData';
import { useFirebase } from '../lib/FirebaseProvider';
import { useDialogAccessibility } from '../hooks/useDialogAccessibility';
import { buildSessionEditPatch, readSessionEditForm, type EditableSessionActivity } from '../lib/sessionEditInput';
import { DS } from '../lib/designSystem';
import { cn } from '../lib/utils';

interface EditSessionDialogProps {
  session: any;
  onClose: () => void;
  onSessionUpdated?: () => void;
}

export function EditSessionDialog({ session, onClose, onSessionUpdated }: EditSessionDialogProps) {
  const { updateStudySession, deleteStudySession, topics } = useFirebase();
  const initial = readSessionEditForm(session);
  const [topicId, setTopicId] = useState(initial.topicId);
  const [subjectFilter, setSubjectFilter] = useState('');
  const [date, setDate] = useState(initial.date);
  const [durationMinutes, setDurationMinutes] = useState(initial.minutes);
  const [modality, setModality] = useState<EditableSessionActivity>(initial.activity);
  const [difficulty, setDifficulty] = useState(initial.difficulty);
  const [completesVuelta, setCompletesVuelta] = useState(initial.completesVuelta);
  const [cantoGrade, setCantoGrade] = useState(initial.cantoGrade);
  const [cantoSeconds, setCantoSeconds] = useState(initial.cantoSeconds);
  const [mistakes, setMistakes] = useState(initial.mistakes);
  const [notes, setNotes] = useState(initial.notes);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState('');
  const busy = isSaving || isDeleting;
  const dialogId = useId();
  const minutesRef = useRef<HTMLInputElement>(null);
  const dialogRef = useDialogAccessibility<HTMLDivElement>({ onClose, initialFocusRef: minutesRef, disabled: busy });
  const selectedTopic = topics.find(topic => topic.id === topicId);
  const filteredTopics = topics.filter(topic => !subjectFilter || topic.subjectId === subjectFilter);
  const canCompleteVuelta = modality === 'repaso' || modality === 'canto';

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    let patch: ReturnType<typeof buildSessionEditPatch>;
    try {
      patch = buildSessionEditPatch({ topicId, date, minutes: durationMinutes, activity: modality, difficulty,
        completesVuelta, cantoGrade, cantoSeconds, mistakes, notes });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Revisa los datos de la sesión.');
      return;
    }
    setIsSaving(true);
    try {
      await updateStudySession(session.id, { ...patch,
        topicTitle: selectedTopic ? `Tema ${selectedTopic.number} - ${selectedTopic.title}` : session.topicTitle,
      }, session);
      onSessionUpdated?.();
      onClose();
    } catch {
      setError('No se han podido guardar los cambios. La sesión sigue abierta para que puedas intentarlo de nuevo.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('¿Eliminar esta sesión? Su tiempo y progreso se recalcularán desde el historial restante.')) return;
    setError(''); setIsDeleting(true);
    try {
      await deleteStudySession(session.topicId, session.id);
      onSessionUpdated?.(); onClose();
    } catch {
      setError('No se ha podido eliminar la sesión. Inténtalo de nuevo.');
    } finally {
      setIsDeleting(false);
    }
  };

  return <div className="wp-modal-overlay fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/60 p-3 sm:p-5">
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={`${dialogId}-title`}
      className={`wp-modal-panel flex w-full max-w-lg max-h-[calc(100dvh-2rem)] flex-col overflow-hidden ${DS.modalContainer}`}>
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 p-4 sm:p-5">
        <div className="min-w-0"><h2 id={`${dialogId}-title`} className="text-lg font-semibold text-slate-900">Editar sesión real</h2>
          <p className="mt-1 text-sm text-slate-600">Corrige los datos observados. Las estimaciones anteriores se conservan.</p></div>
        <button type="button" onClick={onClose} disabled={busy} aria-label="Cerrar edición de sesión" className={`${DS.iconButton} shrink-0`}><X size={20} /></button>
      </header>
      <form onSubmit={handleSave} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 sm:p-5">
          {String(session.source || '').startsWith('aerofocus') && <p className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900"><Sparkles size={16} className="shrink-0" />Sesión recibida de AeroFocus</p>}
          <div className="space-y-2">
            <label htmlFor={`${dialogId}-subject`} className={DS.fieldLabel}>Filtrar por materia</label>
            <select id={`${dialogId}-subject`} value={subjectFilter} onChange={event => { setSubjectFilter(event.target.value); setTopicId(''); }} className={DS.field}>
              <option value="">Todas las materias</option>{initialSubjects.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
            </select>
            <label htmlFor={`${dialogId}-topic`} className={DS.fieldLabel}>Tema</label>
            <select id={`${dialogId}-topic`} required value={topicId} onChange={event => setTopicId(event.target.value)} className={DS.field}>
              <option value="">Selecciona un tema</option>
              {filteredTopics.map(topic => <option key={topic.id} value={topic.id}>{initialSubjects.find(subject => subject.id === topic.subjectId)?.name || topic.subjectId} · T.{topic.number} · {topic.title}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className={DS.fieldLabel}>Fecha<input type="date" required value={date} onChange={event => setDate(event.target.value)} className={`mt-1 ${DS.field}`} /></label>
            <label className={DS.fieldLabel}>Minutos reales<input ref={minutesRef} type="number" required min="0" max="1440" step="any" value={durationMinutes} onChange={event => setDurationMinutes(event.target.value)} className={`mt-1 ${DS.field}`} /></label>
          </div>
          <fieldset className="space-y-2"><legend className={DS.fieldLabel}>Actividad realizada</legend>
            <div className="grid grid-cols-2 gap-2">{([['estudio_inicial', 'Estudio inicial'], ['repaso', 'Repaso'], ['refresco', 'Refresco'], ['canto', 'Cante']] as const).map(([id, label]) =>
              <button key={id} type="button" aria-pressed={modality === id} onClick={() => setModality(id)} className={modality === id ? DS.btnPrimary : DS.btnSecondary}>{label}</button>)}
            </div>
          </fieldset>
          {canCompleteVuelta ? <fieldset className="space-y-2 rounded-xl border border-slate-200 p-3">
            <legend className="flex items-center gap-2 text-sm font-semibold"><RotateCw size={16} />Vuelta completa</legend>
            <p className={DS.help}>{completesVuelta === undefined ? 'El registro histórico no confirma si terminó una vuelta. Puedes conservar esa incertidumbre o indicar tu respuesta.' : 'Indica si finalizaste una vuelta entera o trabajaste solo una parte.'}</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" aria-pressed={completesVuelta === true} onClick={() => setCompletesVuelta(true)} className={completesVuelta === true ? DS.btnPrimary : DS.btnSecondary}>Sí, vuelta entera</button>
              <button type="button" aria-pressed={completesVuelta === false} onClick={() => setCompletesVuelta(false)} className={completesVuelta === false ? DS.btnPrimary : DS.btnSecondary}>No, sesión parcial</button>
            </div>
          </fieldset> : <p className={DS.help}>El estudio inicial y el refresco no añaden vueltas de repaso.</p>}
          <fieldset className="space-y-2 rounded-xl border border-slate-200 p-3">
            <legend className="text-sm font-semibold">Dificultad percibida</legend>
            <p className={DS.help}>{difficulty === null ? 'Sin calificar.' : `Valor registrado: ${difficulty} de 10.`}</p>
            <div className="grid grid-cols-5 gap-2">{[1,2,3,4,5,6,7,8,9,10].map(number =>
              <button key={number} type="button" aria-label={`Dificultad ${number} de 10`} aria-pressed={difficulty === number} onClick={() => setDifficulty(number)} className={cn(DS.iconButton, 'border', difficulty === number ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200')}>{number}</button>)}
            </div>
            <button type="button" aria-pressed={difficulty === null} onClick={() => setDifficulty(null)} className={DS.btnGhost}>Dejar sin calificar</button>
          </fieldset>
          {modality === 'canto' && <fieldset className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/50 p-3">
            <legend className="text-sm font-semibold">Datos del cante</legend>
            <div className="grid grid-cols-2 gap-3">
              <label className={DS.fieldLabel}>Nota (0 a 10)<input type="number" min="0" max="10" step="0.1" value={cantoGrade} onChange={event => setCantoGrade(event.target.value)} className={`mt-1 ${DS.field}`} /></label>
              <label className={DS.fieldLabel}>Segundos extra<input type="number" min="0" max="59" step="1" value={cantoSeconds} onChange={event => setCantoSeconds(event.target.value)} className={`mt-1 ${DS.field}`} /></label>
            </div>
            <label className={DS.fieldLabel}>Observaciones del cante<input value={mistakes} onChange={event => setMistakes(event.target.value)} className={`mt-1 ${DS.field}`} /></label>
          </fieldset>}
          <label className={DS.fieldLabel}>Notas<textarea value={notes} onChange={event => setNotes(event.target.value)} rows={3} className={`mt-1 ${DS.field}`} /></label>
          <details className="rounded-xl border border-slate-200 p-3">
            <summary className="flex min-h-11 items-center text-sm font-medium text-rose-800">Eliminar esta sesión</summary>
            <p className="mb-2 text-sm text-slate-600">La eliminación afecta solo a este registro. Las estadísticas se recalcularán.</p>
            <button type="button" disabled={busy} onClick={handleDelete} className={DS.btnDanger}><Trash2 size={16} />Eliminar sesión</button>
          </details>
          {error && <p role="alert" className={DS.error}>{error}</p>}
        </div>
        <footer className="grid shrink-0 grid-cols-2 gap-2 border-t border-slate-200 bg-white p-4" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          <button type="button" onClick={onClose} disabled={busy} className={DS.btnSecondary}>Cancelar</button>
          <button type="submit" disabled={busy} className={DS.btnPrimary}><Save size={16} /><span>{isSaving ? 'Guardando…' : 'Guardar cambios'}</span></button>
        </footer>
      </form>
    </div>
  </div>;
}
