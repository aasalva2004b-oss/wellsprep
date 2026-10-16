import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Subject, Topic } from './types';
import { initialSubjects, initialTopics } from './data/initialData';

interface AppState {
  subjects: Subject[];
  topics: Record<string, Topic>;
  updateTopic: (id: string, updates: Partial<Topic>) => void;
  addRepaso: (topicId: string, date: string) => void;
  removeRepaso: (topicId: string, dateIndex: number) => void;
  resetTopic: (id: string) => void;
  resetAll: () => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      subjects: initialSubjects,
      // Map topics by id for fast O(1) updates
      topics: initialTopics.reduce((acc, topic) => {
        acc[topic.id] = topic;
        return acc;
      }, {} as Record<string, Topic>),

      updateTopic: (id, updates) =>
        set((state) => ({
          topics: {
            ...state.topics,
            [id]: { ...state.topics[id], ...updates },
          },
        })),

      addRepaso: (topicId, date) =>
        set((state) => {
          const topic = state.topics[topicId];
          return {
            topics: {
              ...state.topics,
              [topicId]: {
                ...topic,
                fechasRepasos: [...topic.fechasRepasos, date].sort(),
              },
            },
          };
        }),
        
      removeRepaso: (topicId, dateIndex) =>
        set((state) => {
          const topic = state.topics[topicId];
          const newRepasos = [...topic.fechasRepasos];
          newRepasos.splice(dateIndex, 1);
          return {
            topics: {
              ...state.topics,
              [topicId]: {
                ...topic,
                fechasRepasos: newRepasos,
              },
            },
          };
        }),

      resetTopic: (id) =>
        set((state) => {
          const initial = initialTopics.find(t => t.id === id);
          if (!initial) return state;
          return {
            topics: {
              ...state.topics,
              [id]: initial,
            },
          };
        }),

      resetAll: () =>
        set(() => ({
          topics: initialTopics.reduce((acc, topic) => {
            acc[topic.id] = topic;
            return acc;
          }, {} as Record<string, Topic>),
        })),
    }),
    {
      name: 'opo-tracker-storage',
    }
  )
);
