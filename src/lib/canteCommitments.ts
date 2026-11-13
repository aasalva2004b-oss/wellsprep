import type { PlannerTask } from './plannerEngine';
import { getLocalDateString, safeParseDate } from './utils';

export interface CantePlannerState {
  tasks?: PlannerTask[];
  cantePlanning?: { canteGoals?: Array<{ id?: string; date: string; topicIds: string[] }>; [key: string]: unknown };
}
export interface RecurringCantePreferences { lunes?: string[]; jueves?: string[] }
export interface UpcomingCanteAssignment {
  date: string;
  topicIds: string[];
  /** Preferences only prefill a new proposal; they never become appointments. */
  prefillTopicIds: string[];
  hasExplicitAssignment: boolean;
  source: 'dated_tasks' | 'explicit_empty' | 'unassigned';
}
const uniqueIds = (value: unknown): string[] => Array.isArray(value)
  ? [...new Set(value.filter((id): id is string => typeof id === 'string' && id.length > 0))] : [];

/** Current dated tasks are authoritative. Proposal input snapshots cannot resurrect deleted commitments. */
export function getUpcomingCanteAssignments(
  state: CantePlannerState | null | undefined,
  recurring: RecurringCantePreferences,
  asOf: Date | string,
): { lunes: UpcomingCanteAssignment; jueves: UpcomingCanteAssignment } {
  const reference = typeof asOf === 'string' ? /^\d{4}-\d{2}-\d{2}$/.test(asOf) ? safeParseDate(asOf) : new Date(NaN) : new Date(asOf);
  if (!Number.isFinite(reference.getTime()) || typeof asOf === 'string' && getLocalDateString(reference) !== asOf) throw new Error('Fecha de consulta de cantes inválida.');
  reference.setHours(0, 0, 0, 0);
  const assignment = (key: 'lunes' | 'jueves', weekday: number): UpcomingCanteAssignment => {
    const target = new Date(reference);
    target.setDate(target.getDate() + (weekday - target.getDay() + 7) % 7);
    const date = getLocalDateString(target);
    const tasks = Array.isArray(state?.tasks) ? state!.tasks!.filter(task => task?.activityType === 'cante' && task.date === date) : [];
    const topicIds = uniqueIds(tasks.map(task => task.topicId));
    const explicitEmpty = Array.isArray(state?.cantePlanning?.canteGoals) && state!.cantePlanning!.canteGoals!.some(goal => goal?.date === date && Array.isArray(goal.topicIds) && goal.topicIds.length === 0);
    return {
      date, topicIds,
      prefillTopicIds: topicIds.length || explicitEmpty ? [] : uniqueIds(recurring[key]),
      hasExplicitAssignment: tasks.length > 0 || explicitEmpty,
      source: tasks.length ? 'dated_tasks' : explicitEmpty ? 'explicit_empty' : 'unassigned',
    };
  };
  return { lunes: assignment('lunes', 1), jueves: assignment('jueves', 4) };
}

export interface CanteProposalGoal { id: string; date: string; topicIds: string[] }
/** UI rows have distinct namespaces; a moved historical commitment ID cannot lock another date's draft. */
export function getCanteProposalDrafts(
  tasks: readonly PlannerTask[],
  recurring: RecurringCantePreferences,
  asOf: Date | string,
  knownTopicIds?: ReadonlySet<string>,
  explicitEmptyDates: readonly string[] = [],
): { goals: CanteProposalGoal[]; lockedIds: string[] } {
  const reference = typeof asOf === 'string' ? asOf : getLocalDateString(asOf);
  const assignments = getUpcomingCanteAssignments({ tasks: [...tasks] }, recurring, asOf);
  const grouped = new Map<string, CanteProposalGoal>();
  for (const task of tasks) {
    if (task.activityType !== 'cante' || task.date < reference) continue;
    const row = grouped.get(task.date) || { id: `confirmed-cante-${task.date}`, date: task.date, topicIds: [] };
    if (!row.topicIds.includes(task.topicId)) row.topicIds.push(task.topicId);
    grouped.set(task.date, row);
  }
  const confirmed = [...grouped.values()];
  const goals = [...confirmed];
  for (const key of ['lunes', 'jueves'] as const) {
    const { date } = assignments[key];
    if (grouped.has(date)) continue;
    const topicIds = explicitEmptyDates.includes(date) ? [] : uniqueIds(recurring[key]).filter(id => !knownTopicIds || knownTopicIds.has(id));
    goals.push({ id: `draft-cante-default-${date}`, date, topicIds });
  }
  return { goals: goals.sort((a, b) => a.date.localeCompare(b.date)), lockedIds: confirmed.map(goal => goal.id) };
}
