import { mkdir, writeFile } from 'node:fs/promises';
import type { Session, Topic } from '../src/types';
import { buildCanonicalTopicMap } from '../src/lib/canonicalTopicService';
import { generateCantePlanProposal } from '../src/lib/cantePlanningEngine';
import { DEFAULT_PLANNER_SETTINGS } from '../src/lib/plannerEngine';

// Independent invented measurements. No backup, Firebase SDK or credentials.
const topics = [901, 902, 903, 904, 999].map(number => ({ id: `civil-${number}`, subjectId: 'civil', number,
  title: `[FICTICIO] Ejemplo ${number}`, pages: 6, difficulty: 5 } as Topic));
const observed = (number: number, date: string, extra: Partial<Session> = {}): Session => ({
  id: `synthetic-example-${number}-${date}-${extra.type || 'initial'}`, topicId: `civil-${number}`, date,
  type: 'estudio_inicial', durationMinutes: 60, startPage: 1, endPage: 6, pagesCount: 6, totalPagesAtSession: 6, notes: '', ...extra,
});
const sessions = [
  observed(999, '2026-10-01'),
  observed(999, '2026-10-02', { type: 'refresco', durationMinutes: 12 }),
  observed(999, '2026-10-03', { type: 'repaso', durationMinutes: 18 }),
  observed(999, '2026-10-04', { type: 'canto', durationMinutes: 12, cantoSeconds: 30 }),
  observed(902, '2026-11-08', { endPage: 3, pagesCount: 3, durationMinutes: 30 }),
  observed(903, '2026-11-08'), observed(904, '2026-10-15'),
  ...[16, 17, 18].map(day => observed(904, `2026-10-${day}`, { type: 'refresco', durationMinutes: 12 })),
  observed(904, '2026-10-20', { type: 'repaso', durationMinutes: 18 }),
];
const plan = generateCantePlanProposal({ canonicalMap: buildCanonicalTopicMap(topics, {}, sessions), sessions, existingTasks: [],
  settings: { ...DEFAULT_PLANNER_SETTINGS, targetDailyHours: 4 },
  canteGoals: [{ id: 'synthetic-example-monday', date: '2026-11-16', topicIds: topics.slice(0, 4).map(topic => topic.id) }],
  asOf: '2026-11-09', forecastAt: '2026-11-09T08:00:00.000Z', horizonStart: '2026-11-09', horizonEnd: '2026-11-19' });
await mkdir('.cache/examples', { recursive: true });
await writeFile('.cache/examples/cante-plan.synthetic.json', JSON.stringify(plan, null, 2));
console.log(JSON.stringify({ input: 'synthetic only', viability: plan.viability, tasks: plan.candidateTasks.length,
  totalEstimatedMinutes: plan.totalEstimatedMinutes, unknownDurationTaskCount: plan.unknownDurationTaskCount,
  days: plan.days.filter(day => day.tasks.length).map(day => ({ date: day.date, plannedMinutes: day.plannedMinutes,
    capacityMinutes: day.capacityMinutes, activities: day.tasks.map(task => ({ topic: task.topicNumber, activity: task.activityType, pages: task.pagesNumbers, minutes: task.estimatedMinutes })) })),
  conflicts: plan.conflicts.length }, null, 2));
