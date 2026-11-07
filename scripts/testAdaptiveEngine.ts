/**
 * Script de Verificación y Validación Programática del Motor de Planificación Adaptativa
 * Ejecución: npx tsx scripts/testAdaptiveEngine.ts
 */

import { getCanonicalTopic } from "../src/lib/canonicalTopicService";
import { 
  buildLearnerProfile, 
  estimateAdaptiveDuration 
} from "../src/lib/adaptiveLearningEngine";
import { 
  generateAutoRefrescos, 
  proposeSmartRebalance, 
  buildWeekPlan, 
  DEFAULT_PLANNER_SETTINGS,
  PlannerTask,
  PlannerSettings
} from "../src/lib/plannerEngine";
import { Topic } from "../src/types";
import { TopicProgressData } from "../src/lib/prediction";

console.log("================================================================================");
console.log("  INICIANDO SUITE DE VALIDACIÓN RIGUROSA: MOTOR ADAPTATIVO WELLS PREP");
console.log("================================================================================\n");

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string, details?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  [PASS] Test ${totalTests}: ${testName}`);
    if (details) console.log(`         -> ${details}`);
  } else {
    console.error(`  [FAIL] Test ${totalTests}: ${testName}`);
    if (details) console.error(`         -> Detalle del fallo: ${details}`);
    process.exitCode = 1;
  }
}

// --------------------------------------------------------------------------------
// SETUP DE MUESTRA
// --------------------------------------------------------------------------------
const mockBaseTopic: Topic = {
  id: "constitucional-6",
  number: 6,
  title: "La Corona. Funciones constitucionales del Rey.",
  subjectId: "constitucional",
  difficulty: 6,
  pages: 6,
  epigrafes: 4,
  tiempoEstudioHoras: 0,
  fechaPrimerEstudio: "2026-11-01",
  fechasRepasos: [],
  mejorTiempoCantoMinutos: 0,
  mejorTiempoCantoSegundos: 0,
  notas: ""
};

const mockTopics: Topic[] = [mockBaseTopic];

// --------------------------------------------------------------------------------
// VALIDACIÓN 1: Tema de 6 páginas con 3 estudiadas
// El cálculo de trabajo restante debe realizarse estrictamente sobre 3 páginas (no sobre 6)
// --------------------------------------------------------------------------------
console.log("--- 1. VERIFICACIÓN DE TRABAJO PARCIAL (PÁGINAS PENDIENTES VS TOTALES) ---");
{
  const mockUserProgress: Record<string, TopicProgressData> = {
    "constitucional-6": {
      pages: 6,
      vueltas: 0,
      difficulty: 6,
      studyTimeHours: 1.5,
      firstStudyDate: "2026-11-01",
      mejorTiempoCantoMinutos: 0,
      mejorTiempoCantoSegundos: 0
    }
  };

  const canonical = getCanonicalTopic("constitucional-6", mockTopics, mockUserProgress, []);
  const profile = buildLearnerProfile([], new Map([[canonical.id, canonical]]));

  // Estimación para tema completo (6 páginas)
  const fullEstimate = estimateAdaptiveDuration(canonical, "estudio_nuevo", profile);

  // Estimación para trabajo parcial (páginas 4 a 6 = 3 páginas restantes)
  const partialEstimate = estimateAdaptiveDuration(canonical, "estudio_nuevo", profile, undefined, {
    fromPage: 4,
    toPage: 6,
    targetPages: 3
  });

  const ratio = partialEstimate.estimatedMinutes / fullEstimate.estimatedMinutes;
  
  assert(
    partialEstimate.pagesUsed === 3 && partialEstimate.isPartialStudy === true,
    "El estimador reconoce exactamente 3 páginas pendientes de estudio",
    `Páginas usadas: ${partialEstimate.pagesUsed} de ${partialEstimate.totalPages} totales.`
  );

  assert(
    ratio >= 0.45 && ratio <= 0.55,
    "La duración estimada es proporcional a las 3 páginas restantes (~50% del total)",
    `Total: ${fullEstimate.estimatedMinutes}m | Parcial (págs 4-6): ${partialEstimate.estimatedMinutes}m (Ratio: ${(ratio * 100).toFixed(1)}%)`
  );
}

// --------------------------------------------------------------------------------
// VALIDACIÓN 2: Estudio completado genera exactamente 3 refrescos en D+1, D+2, D+3
// Con duraciones decrecientes y sin duplicados
// --------------------------------------------------------------------------------
console.log("\n--- 2. GENERACIÓN AUTOMÁTICA DE REFRESCOS TRAS ESTUDIO NUEVO ---");
{
  const completedStudyTask: PlannerTask = {
    id: "task-estudio-constitucional-6",
    topicId: "constitucional-6",
    topicNumber: 6,
    topicTitle: "La Corona",
    subjectId: "constitucional",
    activityType: "estudio_nuevo",
    date: "2026-11-09", // Lunes
    status: "completed",
    estimatedMinutes: 60,
    pagesCount: 6,
    createdAt: new Date().toISOString()
  };

  const existingTasks: PlannerTask[] = [completedStudyTask];
  const refrescos = generateAutoRefrescos(
    completedStudyTask,
    mockBaseTopic,
    existingTasks,
    DEFAULT_PLANNER_SETTINGS,
    {},
    []
  );

  assert(
    refrescos.length === 3,
    "Se generan exactamente 3 tareas de refresco",
    `Cantidad generada: ${refrescos.length}`
  );

  const datesCorrect = 
    refrescos[0].date === "2026-11-10" && // D+1
    refrescos[1].date === "2026-11-11" && // D+2
    refrescos[2].date === "2026-11-12";   // D+3

  assert(
    datesCorrect,
    "Los refrescos se asignan estrictamente a D+1, D+2 y D+3",
    `Fechas: ${refrescos.map(r => r.date).join(", ")}`
  );

  // Comprobar que no genera duplicados si ya existen
  const tasksWithRefrescos = [...existingTasks, ...refrescos];
  const duplicateCheck = generateAutoRefrescos(
    completedStudyTask,
    mockBaseTopic,
    tasksWithRefrescos,
    DEFAULT_PLANNER_SETTINGS,
    {},
    []
  );

  assert(
    duplicateCheck.length === 0,
    "No se generan refrescos duplicados cuando ya están programados",
    `Refrescos adicionales generados: ${duplicateCheck.length}`
  );
}

// --------------------------------------------------------------------------------
// VALIDACIÓN 3: Vuelta 1 vs Vuelta 5 (Curva de aceleración de repaso)
// --------------------------------------------------------------------------------
console.log("\n--- 3. ACELERACIÓN EMPÍRICA POR VUELTAS (VUELTA 1 VS VUELTA 5) ---");
{
  const mockV1Progress: Record<string, TopicProgressData> = {
    "constitucional-6": {
      pages: 12,
      vueltas: 1,
      difficulty: 5,
      studyTimeHours: 3.0,
      firstStudyDate: "2026-09-01",
      mejorTiempoCantoMinutos: 0,
      mejorTiempoCantoSegundos: 0
    }
  };

  const mockV5Progress: Record<string, TopicProgressData> = {
    "constitucional-6": {
      pages: 12,
      vueltas: 5,
      difficulty: 5,
      studyTimeHours: 10.0,
      firstStudyDate: "2026-05-01",
      mejorTiempoCantoMinutos: 0,
      mejorTiempoCantoSegundos: 0
    }
  };

  const canonicalV1 = getCanonicalTopic("constitucional-6", [{ ...mockBaseTopic, pages: 12 }], mockV1Progress, []);
  const canonicalV5 = getCanonicalTopic("constitucional-6", [{ ...mockBaseTopic, pages: 12 }], mockV5Progress, []);

  const profile = buildLearnerProfile([], new Map([[canonicalV1.id, canonicalV1]]));

  const estV1 = estimateAdaptiveDuration(canonicalV1, "repaso", profile);
  const estV5 = estimateAdaptiveDuration(canonicalV5, "repaso", profile);

  assert(
    estV5.estimatedMinutes < estV1.estimatedMinutes,
    "El tiempo estimado de repaso en Vuelta 5 es significativamente menor que en Vuelta 1",
    `Vuelta 1: ${estV1.estimatedMinutes}m | Vuelta 5: ${estV5.estimatedMinutes}m (Ahorro: ${(100 - (estV5.estimatedMinutes / estV1.estimatedMinutes) * 100).toFixed(1)}%)`
  );

  assert(
    estV5.estimatedMinutes >= Math.round(estV1.estimatedMinutes * 0.40),
    "La aceleración de vueltas respeta el límite de consolidación segura (floor no inferior al 40% de V1)",
    `Mínimo de consolidación verificado: ${estV5.estimatedMinutes}m vs base ${estV1.estimatedMinutes}m`
  );
}

// --------------------------------------------------------------------------------
// VALIDACIÓN 4: Sensibilidad a la dificultad (Dificultad 2 vs Dificultad 9)
// --------------------------------------------------------------------------------
console.log("\n--- 4. MODULACIÓN POR DIFICULTAD COGNITIVA (DIFICULTAD 2 VS 9) ---");
{
  const easyTopic: Topic = { ...mockBaseTopic, id: "easy-topic", difficulty: 2, pages: 10 };
  const hardTopic: Topic = { ...mockBaseTopic, id: "hard-topic", difficulty: 9, pages: 10 };

  const canonicalEasy = getCanonicalTopic("easy-topic", [easyTopic], {}, []);
  const canonicalHard = getCanonicalTopic("hard-topic", [hardTopic], {}, []);

  const profile = buildLearnerProfile([], new Map([
    [canonicalEasy.id, canonicalEasy],
    [canonicalHard.id, canonicalHard]
  ]));

  const estEasy = estimateAdaptiveDuration(canonicalEasy, "estudio_nuevo", profile);
  const estHard = estimateAdaptiveDuration(canonicalHard, "estudio_nuevo", profile);

  assert(
    estHard.estimatedMinutes > estEasy.estimatedMinutes,
    "El tema de dificultad 9 requiere más tiempo que el tema de dificultad 2 para el mismo volumen de páginas",
    `Dificultad 2 (10 págs): ${estEasy.estimatedMinutes}m | Dificultad 9 (10 págs): ${estHard.estimatedMinutes}m (+${((estHard.estimatedMinutes / estEasy.estimatedMinutes - 1) * 100).toFixed(1)}%)`
  );
}

// --------------------------------------------------------------------------------
// VALIDACIÓN 5: Detección de sobrecarga y propuesta de redistribución
// --------------------------------------------------------------------------------
console.log("\n--- 5. DETECCIÓN DE SOBRECARGA Y REDISTRIBUCIÓN INTELIGENTE ---");
{
  const heavyTasks: PlannerTask[] = [
    {
      id: "task-heavy-1",
      topicId: "constitucional-6",
      topicNumber: 6,
      topicTitle: "Tema 6",
      subjectId: "constitucional",
      activityType: "estudio_nuevo",
      date: "2026-11-10", // Martes
      status: "pending",
      estimatedMinutes: 240, // 4 horas
      pagesCount: 6,
      createdAt: new Date().toISOString()
    },
    {
      id: "task-heavy-2",
      topicId: "constitucional-6",
      topicNumber: 6,
      topicTitle: "Tema 6 Repaso",
      subjectId: "constitucional",
      activityType: "repaso",
      date: "2026-11-10", // Martes
      status: "pending",
      estimatedMinutes: 240, // 4 horas -> Total 8 horas en Martes (objetivo diario 5h)
      pagesCount: 6,
      createdAt: new Date().toISOString()
    }
  ];

  const settings: PlannerSettings = {
    ...DEFAULT_PLANNER_SETTINGS,
    targetDailyHours: 5
  };

  const weekPlan = buildWeekPlan(heavyTasks, 0, settings, new Date("2026-11-09T08:00:00Z"), [], {}, mockTopics);
  const proposal = proposeSmartRebalance(weekPlan, heavyTasks, settings);

  assert(
    weekPlan.overloadedDaysCount > 0,
    "El planificador detecta que el día supera el límite máximo de horas disponible",
    `Días sobrecargados identificados: ${weekPlan.overloadedDaysCount}`
  );

  assert(
    proposal.moves.length > 0,
    "El motor genera una propuesta de redistribución con movimientos a días con disponibilidad",
    `Movimientos recomendados: ${proposal.moves.length} (Origen: ${proposal.moves[0]?.fromDate} -> Destino: ${proposal.moves[0]?.toDate})`
  );
}

// --------------------------------------------------------------------------------
// VALIDACIÓN 6: Cambio dinámico de páginas en temario / userProgress
// --------------------------------------------------------------------------------
console.log("\n--- 6. REACTIVIDAD DE FUENTE ÚNICA DE VERDAD (CANONICAL TOPIC UPDATE) ---");
{
  const originalCanonical = getCanonicalTopic("constitucional-6", mockTopics, {}, []);
  
  // Usuario personaliza el número de páginas a 15 (en vez de 6 iniciales)
  const userProgressWithOverride: Record<string, TopicProgressData> = {
    "constitucional-6": {
      pages: 15,
      difficulty: 6,
      studyTimeHours: 3.5,
      firstStudyDate: "2026-11-01",
      mejorTiempoCantoMinutos: 0,
      mejorTiempoCantoSegundos: 0
    }
  };

  const updatedCanonical = getCanonicalTopic("constitucional-6", mockTopics, userProgressWithOverride, []);
  const profile = buildLearnerProfile([], new Map([[updatedCanonical.id, updatedCanonical]]));

  const origEst = estimateAdaptiveDuration(originalCanonical, "estudio_nuevo", profile);
  const updatedEst = estimateAdaptiveDuration(updatedCanonical, "estudio_nuevo", profile);

  assert(
    updatedCanonical.pages === 15 && updatedCanonical.hasExplicitPages === true,
    "El registro canónico asume de forma inmediata el valor personalizado de páginas",
    `Páginas canónicas: ${updatedCanonical.pages}`
  );

  assert(
    updatedEst.estimatedMinutes > origEst.estimatedMinutes && updatedEst.pagesUsed === 15,
    "La estimación del planificador escala automáticamente reflejando la nueva extensión sin desfases",
    `Original (6 págs): ${origEst.estimatedMinutes}m | Actualizado (15 págs): ${updatedEst.estimatedMinutes}m`
  );
}

// --------------------------------------------------------------------------------
// RESUMEN FINAL
// --------------------------------------------------------------------------------
console.log("\n================================================================================");
console.log(`  RESULTADO FINAL DE LAS VALIDACIONES: ${passedTests}/${totalTests} TESTS PASADOS CORRECTAMENTE`);
console.log("================================================================================\n");

if (passedTests === totalTests) {
  console.log("  >>> TODOS LOS REQUISITOS DEL MOTOR ADAPTATIVO HAN SIDO SATISFECHOS.");
} else {
  console.error("  >>> SE ENCONTRARON FALLOS EN LA SUITE DE VALIDACIÓN.");
  process.exit(1);
}
