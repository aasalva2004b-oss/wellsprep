import { useDialogAccessibility } from '../../hooks/useDialogAccessibility';
import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Plus, AlertTriangle, CalendarDays } from 'lucide-react';
import type { Topic } from '../../types';
import type { PlannerSettings, PlannerTask } from '../../lib/plannerEngine';
import { ACTIVITY_CONFIG } from '../../lib/plannerEngine';
import type { CanteCommitment, CantePlanProposal } from '../../lib/cantePlanningEngine';
import { getCanteProposalDrafts } from '../../lib/canteCommitments';
import { getLocalDateString, safeParseDate } from '../../lib/utils';

export type RefreshExceptions = Record<string, { skip?: boolean; date?: string; reason: string }>;
export interface CanteProposalConfig {
  canteGoals: CanteCommitment[];
  horizonStart: string;
  horizonEnd: string;
  refreshExceptions: RefreshExceptions;
}
interface ExceptionDraft { topicId: string; dueDate: string; action: 'skip' | 'move'; date: string; reason: string }
interface Props {
  isOpen: boolean;
  suspended?: boolean;
  onClose: () => void;
  topics: Topic[];
  existingTasks: PlannerTask[];
  scheduleLunes: string[];
  scheduleJueves: string[];
  settings: PlannerSettings;
  basisVersion: string;
  initialExceptions?: RefreshExceptions;
  draftGoal?: { date: string; topicIds: string[] };
  explicitEmptyDates?: string[];
  onGenerate: (config: CanteProposalConfig) => CantePlanProposal;
  onConfirm: (proposal: CantePlanProposal, config: CanteProposalConfig, basisVersion: string) => Promise<void>;
  onOpenSettings: () => void;
}
const addDays = (date: string, days: number) => {
  const value = safeParseDate(date); value.setDate(value.getDate() + days); return getLocalDateString(value);
};
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

export function CantePlanProposalModal({ isOpen, suspended = false, onClose, topics, existingTasks, scheduleLunes, scheduleJueves,
  settings, basisVersion, initialExceptions = {}, draftGoal, explicitEmptyDates = [], onGenerate, onConfirm, onOpenSettings }: Props) {
  const today = getLocalDateString();
  const draftSequence = useRef(0);
  const [goals, setGoals] = useState<CanteCommitment[]>([]);
  const [lockedIds, setLockedIds] = useState<Set<string>>(new Set());
  const [searches, setSearches] = useState<Record<string, string>>({});
  const [exceptions, setExceptions] = useState<ExceptionDraft[]>([]);
  const [proposal, setProposal] = useState<CantePlanProposal | null>(null);
  const [config, setConfig] = useState<CanteProposalConfig | null>(null);
  const [generatedBasis, setGeneratedBasis] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const topicMap = useMemo(() => new Map(topics.map(topic => [topic.id, topic])), [topics]);

  useEffect(() => {
    if (!isOpen) return;
    const initial = getCanteProposalDrafts(existingTasks, { lunes: scheduleLunes, jueves: scheduleJueves }, today, new Set(topicMap.keys()), explicitEmptyDates);
    const next = initial.goals;
    const locked = new Set(initial.lockedIds);
    if (draftGoal?.topicIds.length) {
      const additional = draftGoal.topicIds.filter(id => !next.some(goal => goal.date === draftGoal.date && locked.has(goal.id) && goal.topicIds.includes(id)));
      const unlocked = next.find(goal => goal.date === draftGoal.date && !locked.has(goal.id));
      if (unlocked) unlocked.topicIds = [...new Set([...unlocked.topicIds, ...additional])];
      else if (additional.length) next.push({ id: `draft-add-${draftGoal.date}`, date: draftGoal.date, topicIds: [...new Set(additional)] });
    }
    setGoals(next.sort((a, b) => a.date.localeCompare(b.date)));
    setLockedIds(locked);
    setExceptions(Object.entries(initialExceptions).map(([key, value]) => {
      const split = key.lastIndexOf('|');
      return { topicId: key.slice(0, split), dueDate: key.slice(split + 1), action: value.skip ? 'skip' : 'move', date: value.date || '', reason: value.reason };
    }));
    setSearches({}); setProposal(null); setConfig(null); setGeneratedBasis(''); setAcknowledged(false); setError('');
  }, [isOpen]);

  const dialogRef = useDialogAccessibility<HTMLElement>({ isOpen: isOpen && !suspended, onClose, disabled: saving });
  if (!isOpen || suspended) return null;
  const inputClass = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900';
  const invalidate = () => { setProposal(null); setConfig(null); setAcknowledged(false); setError(''); };
  const changeGoal = (id: string, patch: Partial<CanteCommitment>) => { invalidate(); setGoals(rows => rows.map(row => row.id === id ? { ...row, ...patch } : row)); };
  const changeException = (index: number, patch: Partial<ExceptionDraft>) => { invalidate(); setExceptions(rows => rows.map((row, i) => i === index ? { ...row, ...patch } : row)); };
  const generate = () => {
    setError('');
    try {
      const active = goals.filter(goal => goal.topicIds.length > 0);
      if (!active.length) throw new Error('Selecciona al menos un tema para un cante.');
      for (const goal of active) {
        if (!validDate(goal.date) || goal.date < today) throw new Error('Los cantes deben tener una fecha válida desde hoy.');
        if (![1, 4].includes(safeParseDate(goal.date).getDay())) throw new Error('La fecha del cante debe ser lunes o jueves.');
      }
      const refreshExceptions: RefreshExceptions = {};
      for (const row of exceptions) {
        if (!row.topicId || !validDate(row.dueDate) || !row.reason.trim() || row.action === 'move' && !validDate(row.date)) throw new Error('Cada excepción necesita tema, fecha original, motivo y, si se mueve, fecha alternativa.');
        refreshExceptions[`${row.topicId}|${row.dueDate}`] = row.action === 'skip' ? { skip: true, reason: row.reason.trim() } : { date: row.date, reason: row.reason.trim() };
      }
      const lastDate = [...active.map(goal => goal.date), today].sort().at(-1)!;
      const nextConfig = { canteGoals: active, horizonStart: today, horizonEnd: addDays(lastDate, 3), refreshExceptions };
      const result = onGenerate(nextConfig);
      setConfig(nextConfig); setProposal(result); setGeneratedBasis(basisVersion); setAcknowledged(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se ha podido generar la propuesta.'); }
  };
  const confirm = async () => {
    if (!proposal || !config) return;
    setSaving(true); setError('');
    try { await onConfirm(proposal, config, generatedBasis); onClose(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'No se ha podido guardar la planificación.'); }
    finally { setSaving(false); }
  };
  const hasUnresolved = !!proposal && (proposal.viability !== 'feasible' || proposal.conflicts.length > 0);
  const stale = !!proposal && generatedBasis !== basisVersion;

  return <div className="wp-modal-overlay fixed inset-0 z-[105] flex items-center justify-center bg-slate-950/60 p-3 sm:p-6">
    <section ref={dialogRef} role="dialog" aria-modal="true" aria-label="Planificación por cantes" className="wp-modal-panel flex max-h-[94dvh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-slate-50 text-slate-900 shadow-xl">
      <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white p-4 sm:p-5">
        <div><h2 className="flex items-center gap-2 text-lg font-bold"><CalendarDays size={20} />Planificación por cantes</h2>
          <p className="mt-1 text-sm text-slate-600">Introduce fechas y temas. Revisa la distribución antes de confirmar.</p></div>
        <button type="button" aria-label="Cerrar propuesta de cantes" disabled={saving} onClick={onClose}><X size={22} /></button>
      </header>
      <div className="space-y-5 overflow-y-auto p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm">
          <p>Disponibilidad habitual: <strong>{settings.targetDailyHours} h/día</strong>. Se aplican las excepciones guardadas de cada fecha.</p>
          <button type="button" onClick={onOpenSettings} className="rounded-lg border border-slate-300 px-3 py-2 font-semibold">Ajustar disponibilidad</button>
          <p className="w-full text-xs text-slate-600">Planificación por días. No asigna horas concretas ni comprueba solapamientos entre franjas horarias. Los cantes confirmados y los cambios manuales conservan su ubicación.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {goals.map((goal, index) => {
            const locked = lockedIds.has(goal.id);
            const query = (searches[goal.id] || '').toLocaleLowerCase();
            const visible = topics.filter(topic => goal.topicIds.includes(topic.id) || query && `${topic.number} ${topic.title} ${topic.subjectId}`.toLocaleLowerCase().includes(query)).slice(0, 40);
            return <fieldset key={goal.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <legend className="px-1 text-sm font-bold">Cante {index + 1}{locked ? ' · confirmado' : ' · por confirmar'}</legend>
              <div className="flex items-end gap-2">
                <label className="flex-1 text-sm">Fecha (lunes o jueves)<input aria-label={`Fecha del cante ${index + 1}`} type="date" min={today} disabled={locked} value={goal.date} onChange={event => changeGoal(goal.id, { date: event.target.value })} className={inputClass} /></label>
                {!locked && <button type="button" aria-label={`Quitar cante ${index + 1}`} onClick={() => { invalidate(); setGoals(rows => rows.filter(row => row.id !== goal.id)); }} className="rounded-lg p-2 text-slate-600"><X size={18} /></button>}
              </div>
              {locked ? <p className="mt-3 text-xs text-slate-600">Fecha y temas confirmados. Los ajustes explícitos de este compromiso se hacen desde su tarea del calendario.</p> : <label className="mt-3 block text-sm">Buscar temas<input aria-label={`Buscar temas para el cante ${index + 1}`} value={searches[goal.id] || ''} onChange={event => setSearches(values => ({ ...values, [goal.id]: event.target.value }))} className={inputClass} placeholder="Número, título o asignatura" /></label>}
              <div aria-label={`Temas del cante ${index + 1}`} className="mt-3 max-h-56 space-y-2 overflow-y-auto">
                {visible.map(topic => <label key={topic.id} className="flex items-start gap-2 rounded-lg p-1 text-sm">
                  <input type="checkbox" disabled={locked} checked={goal.topicIds.includes(topic.id)} onChange={event => changeGoal(goal.id, { topicIds: event.target.checked ? [...goal.topicIds, topic.id] : goal.topicIds.filter(id => id !== topic.id) })} className="mt-1" />
                  <span>T.{topic.number} · {topic.title}<span className="block text-xs text-slate-500">{topic.subjectId}</span></span>
                </label>)}
                {!visible.length && <p className="text-xs text-slate-500">Busca un tema para añadirlo a esta fecha.</p>}
              </div>
              <p className="mt-2 text-xs text-slate-600">{goal.topicIds.length} temas seleccionados.</p>
            </fieldset>;
          })}
        </div>
        <button type="button" onClick={() => { invalidate(); setGoals(rows => [...rows, { id: `draft-cante-${today}-${++draftSequence.current}`, date: '', topicIds: [] }]); }} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold"><Plus size={16} />Añadir otra fecha de cante</button>
        <details className="rounded-xl border border-slate-200 bg-white p-4">
          <summary className="cursor-pointer text-sm font-bold">Excepciones a los refrescos del protocolo elegido</summary>
          <p className="mt-2 text-xs text-slate-600">{settings.autoRefreshProtocol === 'three_days' ? 'El protocolo programa tres días de refresco tras completar el estudio inicial.' : settings.autoRefreshProtocol === 'adaptive' ? 'El protocolo propone un contacto según el modelo de retención; si el estudio aún no ha terminado, la fecha es condicional.' : 'El protocolo automático de refrescos está desactivado.'} Cualquier excepción necesita un motivo y queda visible en la propuesta.</p>
          {exceptions.map((row, index) => <div key={index} className="mt-3 grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-xs">Tema<select aria-label={`Tema de excepción ${index + 1}`} value={row.topicId} onChange={event => changeException(index, { topicId: event.target.value })} className={inputClass}><option value="">Selecciona tema</option>{topics.map(topic => <option key={topic.id} value={topic.id}>T.{topic.number} · {topic.title}</option>)}</select></label>
            <label className="text-xs">Fecha original del refresco<input type="date" value={row.dueDate} onChange={event => changeException(index, { dueDate: event.target.value })} className={inputClass} /></label>
            <label className="text-xs">Excepción<select value={row.action} onChange={event => changeException(index, { action: event.target.value as 'skip' | 'move' })} className={inputClass}><option value="move">Mover con motivo</option><option value="skip">Omitir con motivo</option></select></label>
            {row.action === 'move' && <label className="text-xs">Fecha alternativa<input type="date" value={row.date} onChange={event => changeException(index, { date: event.target.value })} className={inputClass} /></label>}
            <label className="text-xs">Motivo obligatorio<input value={row.reason} onChange={event => changeException(index, { reason: event.target.value })} className={inputClass} /></label>
            <button type="button" onClick={() => { invalidate(); setExceptions(values => values.filter((_, i) => i !== index)); }} className="text-left text-xs font-semibold text-slate-600">Quitar excepción</button>
          </div>)}
          <button type="button" onClick={() => { invalidate(); setExceptions(rows => [...rows, { topicId: '', dueDate: '', action: 'move', date: '', reason: '' }]); }} className="mt-3 rounded-lg border border-slate-300 px-3 py-2 text-sm">Añadir excepción</button>
        </details>
        <button type="button" onClick={generate} disabled={saving} className="rounded-xl bg-indigo-700 px-5 py-3 text-sm font-bold text-white">Generar propuesta</button>
        {proposal && <div className="space-y-4" data-testid="cante-plan-proposal" data-viability={proposal.viability}>
          <div className={`rounded-xl border p-4 ${proposal.viability === 'feasible' ? 'border-emerald-300 bg-emerald-50' : 'border-amber-300 bg-amber-50'}`} role="status">
            <p className="font-bold">{proposal.viability === 'feasible' ? 'Propuesta viable con los datos disponibles' : proposal.viability === 'infeasible' ? 'La carga no cabe con las condiciones actuales' : 'No se puede verificar la viabilidad: faltan datos'}</p>
            <p className="mt-1 text-xs">Período de la propuesta: {config?.horizonStart} al {config?.horizonEnd}.</p>
            <p className="mt-1 text-sm">{proposal.candidateTasks.length} tareas nuevas o reprogramadas. Tiempo previsto conocido: <strong>{proposal.totalEstimatedMinutes} min</strong>. {proposal.unknownDurationTaskCount} tareas con duración pendiente de estimar.</p>
            <p className="mt-1 text-xs">El total conocido coincide con la suma de las duraciones mostradas. Las duraciones desconocidas no cuentan como cero trabajo.</p>
          </div>
          {stale && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Los datos han cambiado desde que se calculó esta propuesta. Genérala de nuevo antes de confirmar.</p>}
          <div className="space-y-3">
            {proposal.days.map(day => <section key={day.date} data-testid="cante-proposal-day" className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">{day.date}</h3><p className="text-sm">Disponibles {day.capacityMinutes} min · Previsto {day.plannedMinutes} min · Realizado {day.actualMinutes} min · Capacidad comprometida {day.capacityUsedMinutes} min</p></div>
              {day.overloadMinutes > 0 && <p className="mt-1 text-sm font-semibold text-rose-700">Sobrecarga: {day.overloadMinutes} min.</p>}
              {day.unknownDurationTaskCount > 0 && <p className="mt-1 text-sm text-amber-800">{day.unknownDurationTaskCount} tareas sin duración estimable.</p>}
              <ul className="mt-2 divide-y divide-slate-100">{day.tasks.map(task => <li key={task.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
                <span><strong>{ACTIVITY_CONFIG[task.activityType].label}</strong> · T.{task.topicNumber} · {task.topicTitle}{task.fromPage !== undefined ? ` · pp. ${task.fromPage}–${task.toPage}` : task.pagesCount ? ` · ${task.pagesCount} páginas` : ''}<span className="ml-2 text-xs text-slate-500">{task.activityType === 'cante' ? 'Compromiso de cante' : task.requirement === 'mandatory' ? 'Obligatoria' : task.requirement === 'recommendation' ? 'Recomendación' : 'Tarea conservada'}</span>{task.proposalBasis === 'proposed_completion' && <span className="block text-xs text-slate-500">Depende de completar el estudio previsto; se ajustará a la sesión real.</span>}</span>
                <span className="font-mono">{task.estimatedMinutes === null ? 'Sin estimación' : `${task.estimatedMinutes} min`}</span>
              </li>)}</ul>
            </section>)}
          </div>
          {proposal.conflicts.length > 0 && <section className="rounded-xl border border-amber-200 bg-amber-50 p-4"><h3 className="flex items-center gap-2 font-bold"><AlertTriangle size={17} />Conflictos y avisos</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{proposal.conflicts.map(conflict => <li key={conflict.id}>{conflict.date ? `${conflict.date}: ` : ''}{conflict.message}</li>)}</ul></section>}
          {proposal.alternatives.length > 0 && <section className="rounded-xl border border-slate-200 bg-white p-4"><h3 className="font-bold">Alternativas concretas</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{proposal.alternatives.map(alternative => <li key={alternative.id}>{alternative.description}</li>)}</ul></section>}
          <details className="rounded-xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer text-sm font-bold">Reglas aplicadas</summary><ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{proposal.explanations.map((explanation, index) => <li key={index}>{explanation}</li>)}</ul></details>
          {hasUnresolved && <label className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm"><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} className="mt-1" />Entiendo que hay conflictos o datos pendientes; guardar esta propuesta no la convierte en viable.</label>}
        </div>}
        {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      </div>
      <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-white p-4">
        <button type="button" disabled={saving} onClick={onClose} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold">Cancelar</button>
        {proposal && <button type="button" onClick={confirm} disabled={saving || stale || hasUnresolved && !acknowledged} className="rounded-xl bg-indigo-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">{saving ? 'Guardando…' : 'Confirmar planificación'}</button>}
      </footer>
    </section>
  </div>;
}
