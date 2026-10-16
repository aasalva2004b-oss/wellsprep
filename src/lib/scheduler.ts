import { getLocalDateString } from './utils';
import { Topic } from '../types';
import { TopicProgressData, predictTopic } from './prediction';

export interface TimeBlock {
  start: string; // "HH:MM"
  end: string;
}

export interface DaySchedule {
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, ...
  blocks: TimeBlock[];
}

export interface ScheduleConfig {
  days: DaySchedule[];
}

export interface PlanRequirement {
  subjectId: string;
  topicCount: number;
  refreshDays?: number; // Days after initial study for the first refresh (refresco)
}

export interface ScheduledTask {
  id: string; // unique
  type: 'estudio_inicial' | 'repaso' | 'refresco';
  topicId: string;
  topicTitle: string;
  subjectId: string;
  date: string; // 'YYYY-MM-DD'
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
  durationMinutes: number;
  isUrgent?: boolean;
  color?: string;
  isCompleted?: boolean;
  notes?: string;
}

export interface WeeklyPlanResult {
  startDate: string;
  endDate: string;
  tasks: ScheduledTask[];
  unassignedTasks?: any[];
  totalScheduledHours: number;
  availableHours: number;
}

// Helpers
function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = Math.floor(mins % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

export function generateGeniusWeeklyPlan(
  startDateStr: string, // "YYYY-MM-DD" of Monday
  config: ScheduleConfig,
  plannerReqs: PlanRequirement[],
  allTopics: Topic[],
  userProgress: Record<string, TopicProgressData>
): WeeklyPlanResult {
  const startDate = new Date(startDateStr);
  const tasks: ScheduledTask[] = [];
  let availableHours = 0;

  // 1. Understand Available Time slots per day for next 7 days
  const dailySlots: { date: string, availableBlocks: { startMin: number, endMin: number, currentStartMin: number, remainingDuration: number }[] }[] = [];
  
  for (let i = 0; i < 7; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];
    const dayOfWeek = date.getDay(); // 0-6

    const dayConfig = config.days.find(d => d.dayOfWeek === dayOfWeek);
    const availableBlocks = [];
    if (dayConfig && dayConfig.blocks) {
      for (const b of dayConfig.blocks) {
        const startMin = timeToMinutes(b.start);
        const endMin = timeToMinutes(b.end);
        if (endMin > startMin) {
          availableBlocks.push({ startMin, endMin, currentStartMin: startMin, remainingDuration: endMin - startMin });
          availableHours += (endMin - startMin) / 60;
        }
      }
    }
    // ensure chronological
    availableBlocks.sort((a, b) => a.startMin - b.startMin);
    dailySlots.push({ date: dateStr, availableBlocks });
  }

  // 2. Identify Queued tasks (Spaced Repetition) for this week
  // Overdue and Due this week
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 6);
  const endDateStr = endDate.toISOString().split('T')[0];
  const todayStr = getLocalDateString();

  const dueTopics = allTopics.filter(t => {
    const p = userProgress[t.id];
    if (!p || !p.nextReviewDate) return false;
    return p.nextReviewDate <= endDateStr;
  });

  // Sort due topics by nextReviewDate (urgency)
  dueTopics.sort((a, b) => {
    return new Date(userProgress[a.id].nextReviewDate!).getTime() - new Date(userProgress[b.id].nextReviewDate!).getTime();
  });

  // 3. Identify New Topics based on plannerReqs
  const newTopicsNeeded: Topic[] = [];
  // (We will extract req.refreshDays when creating pending tasks)

  // 4. Create Task list with predicted durations
  const pendingTasks: { type: 'estudio_inicial' | 'repaso' | 'refresco', topic: Topic, durationMins: number, preferredDate?: string, refreshDays?: number }[] = [];

  for (const t of dueTopics) {
    const pDate = userProgress[t.id].nextReviewDate!;
    const pred = predictTopic(t, userProgress, t.subjectId, true); // true = hasStarted
    const reviewMins = Math.round(pred.predictedStudyHours * 60) || 30; // fallback to 30 mins
    
    // if date is before startDate (overdue), preferred date is start date
    pendingTasks.push({
      type: 'repaso',
      topic: t,
      durationMins: reviewMins,
      preferredDate: pDate < startDateStr ? startDateStr : pDate
    });
  }

  // Iterate over planner requirements to capture their specific settings
  for (const req of plannerReqs) {
    const subjectTopics = allTopics.filter(t => t.subjectId === req.subjectId);
    const unstudied = subjectTopics.filter(t => !userProgress[t.id] || !userProgress[t.id].firstStudyDate);
    unstudied.sort((a, b) => a.number - b.number);
    const topicsToAdd = unstudied.slice(0, req.topicCount);
    
    for (const t of topicsToAdd) {
      const pred = predictTopic(t, userProgress, t.subjectId, false);
      const studyMins = Math.round(pred.predictedStudyHours * 60) || 120; // fallback 2 hrs
      pendingTasks.push({
        type: 'estudio_inicial',
        topic: t,
        durationMins: studyMins,
        refreshDays: req.refreshDays ?? 3
      });
    }
  }

  // 5. Pack tasks into the week
  // We want to pack reviews on their preferred date if possible, then distribute new studies.
  
  let totalScheduledHours = 0;
  
  // Helper to schedule a task across days starting from a specific day
  const scheduleTaskAcrossDays = (task: typeof pendingTasks[0], preferredDayIndex: number): boolean => {
    let remainingMins = task.durationMins;
    let partsCount = 0;
    
    // Check days starting from preferred, then wrapping around if needed
    for (let phase = 0; phase < 2; phase++) {
      for (let i = 0; i < 7; i++) {
        let dIndex = -1;
        if (phase === 0) {
          if (preferredDayIndex + i < 7) dIndex = preferredDayIndex + i;
        } else {
          if (i < preferredDayIndex) dIndex = i;
        }
        
        if (dIndex === -1) continue;
        if (remainingMins <= 0) break;
        
        const day = dailySlots[dIndex];
        
        for (const block of day.availableBlocks) {
          if (remainingMins <= 0) break;
          
          if (block.currentStartMin < block.endMin && block.remainingDuration > 0) {
            const timeAvailableInBlock = block.endMin - block.currentStartMin;
            const minsToSchedule = Math.min(remainingMins, timeAvailableInBlock);
            if (minsToSchedule < 10) continue; 
            
            let taskStartMin = block.currentStartMin;
            let taskEndMin = taskStartMin + minsToSchedule;
            
            partsCount++;
            let suffix = '';
            if (minsToSchedule < task.durationMins) {
              suffix = partsCount === 1 ? ' (Parte 1)' : ' (Cont.)';
            }
            
            tasks.push({
              id: `${day.date}-${task.topic.id}-${taskStartMin}`,
              type: task.type,
              topicId: task.topic.id,
              topicTitle: task.topic.title + suffix,
              subjectId: task.topic.subjectId,
              date: day.date,
              startTime: minutesToTime(taskStartMin),
              endTime: minutesToTime(taskEndMin),
              durationMinutes: minsToSchedule
            });
            
            block.currentStartMin = taskEndMin;
            block.remainingDuration -= minsToSchedule;
            totalScheduledHours += minsToSchedule / 60;
            
            remainingMins -= minsToSchedule;
          }
        }
      }
    }
    
    // Return true if fully scheduled, false if it could not entirely fit (so it appears as unassigned/warning)
    return remainingMins <= 0;
  };

  // 5.1 Try to schedule reviews on preferred date or later
  const unassignedTasks = [];
  for (const t of pendingTasks.filter(x => x.type === 'repaso')) {
    // Find index of preferredDate
    const prefIndex = dailySlots.findIndex(d => d.date === t.preferredDate);
    const startIndex = prefIndex !== -1 ? prefIndex : 0;
    
    if (!scheduleTaskAcrossDays(t, startIndex)) {
      unassignedTasks.push(t);
    }
  }

  // 5.2 Distribute new studies throughout the week
  // Assign sequentially to prioritize finishing earlier in the week
  for (const t of pendingTasks.filter(x => x.type === 'estudio_inicial')) {
    if (!scheduleTaskAcrossDays(t, 0)) {
       unassignedTasks.push(t);
    } else {
       // Schedule 'refresco' (refresh) for this newly studied topic in this same week
       const parts = tasks.filter(x => x.topicId === t.topic.id && x.type === 'estudio_inicial');
       if (parts.length > 0) {
           const lastPart = parts[parts.length - 1];
           const lastDateIndex = dailySlots.findIndex(d => d.date === lastPart.date);
           const rOffset = t.refreshDays ?? 3;
           const refreshDayIndex = Math.min(6, lastDateIndex + rOffset); // offset days later, capped at week end
           
           const pred = predictTopic(t.topic, userProgress, t.topic.subjectId, false);
           const refreshMins = Math.round((pred.predictedStudyHours * 60) * 0.3) + 15; // roughly 30% of study time + 15 mins
           
           const refreshTask = {
               type: 'refresco' as const,
               topic: t.topic,
               durationMins: refreshMins,
           };
           
           if (!scheduleTaskAcrossDays(refreshTask, refreshDayIndex)) {
               unassignedTasks.push(refreshTask);
           }
       }
    }
  }

  // Sort tasks chronologically
  tasks.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
  });

  return {
    startDate: startDateStr,
    endDate: endDateStr,
    tasks,
    unassignedTasks,
    totalScheduledHours,
    availableHours
  };
}
