import { predictTopic } from './src/lib/prediction';

const history = {
  "tema1": { pages: 15, studyTimeHours: 4, vueltas: 1, difficulty: 5 },
  "tema2": { pages: 30, studyTimeHours: 12, vueltas: 1, difficulty: 8 },
  "tema3": { pages: 35, studyTimeHours: 15, vueltas: 2, difficulty: 7 }, // Total time = 15. Initial ~ 11, Repaso 1 ~ 4
} as any;

const topic = { id: "tema3", pages: 35, difficulty: 6 } as any;
console.log("Vuelta 3 (Repaso):", predictTopic(topic, history, "sub1", true));
console.log("Vuelta 2 (Repaso on Tema2):", predictTopic({id:"tema2", pages:30, difficulty:8} as any, history, "sub1", true));

