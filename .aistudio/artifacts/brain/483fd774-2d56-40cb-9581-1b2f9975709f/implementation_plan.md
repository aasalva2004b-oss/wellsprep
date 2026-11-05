# Plan de Implementación: Planificador Semanal de Judicatura — Fase 2: Perfeccionamiento y Mejora Continua

## 1. Resumen de la Fase 2 y Objetivos Alcanzados

En esta segunda fase, se ha elevado el sistema de organización y planificación semanal de **Wells Prep** a un estándar superior de calidad UX/UI, inteligencia preventiva y sincronización con el historial de estudio y AeroFocus Pro.

### Logros Implementados:

1. **Balance Semanal de Rendimiento (Previsto vs Real)**:
   - Integración directa de la telemetría de sesiones reales (`recentSessions` de WellsPrep y AeroFocus) dentro de `buildWeekPlan`.
   - Comparativa visual en tiempo real de **Horas Previstas** vs **Horas Reales Estudiadas**.
   - Cálculo automático de varianza horaria (`+/- X.X h`) y porcentaje de cumplimiento (`%`).
   - Diagnóstico automático del nivel de intensidad semanal (`Óptima` [verde], `Exigente` [azul] o `Sobrecargada` [ámbar]).

2. **Radar de Próximo Cante**:
   - Detección inteligente del cante oficial más próximo (Lunes o Jueves).
   - Cuenta atrás de días restantes (*¡Hoy es el cante!*, *Mañana cante*, o *En N días*).
   - Listado de temas asignados al cante con números de tema y títulos.
   - Acceso directo con 1 clic para abrir la sesión de cante con el preparador.

3. **Barra de Filtros de Actividad y Búsqueda**:
   - Filtros rápidos segmentados con los 4 colores oficiales:
     - 🔵 **Estudio Nuevo** (conteo de tareas)
     - 🟠 **Refresco** (conteo de tareas)
     - 🟢 **Repaso** (conteo de tareas)
     - 🟣 **Cante** (conteo de tareas)
     - ⏳ **Solo Pendientes** (conteo de tareas pendientes)
     - **Todos**
   - Buscador rápido dentro de la semana por número de tema o texto.

4. **Registro Directo de Estudio (1-Click Study Log)**:
   - Botón directo `Registrar` en cada tarjeta de tarea.
   - Registra de forma instantánea una sesión de estudio real en Firebase (`addStudySession`), sincronizando el historial, el dashboard y la Curva de Ebbinghaus, y marcando la tarea como completada con sonido de éxito.

5. **Puntos de Color Indicadores de Actividad en Móvil**:
   - En el selector de días de la vista móvil, cada botón de día muestra mini-indicadores de color (🔵, 🟠, 🟢, 🟣) con las actividades planificadas para ese día, evitando tener que navegar a ciegas.

6. **Selector Rápido de Materias en el Modal de Tareas**:
   - Pestañas/chips de materias (Constitucional, Civil, Penal, etc.) en `TaskEditorModal` para explorar y seleccionar temas entre los 300 disponibles sin fricción.

7. **Avisos de Inteligencia Preventiva (Consejos de Preparación)**:
   - Detección de cuellos de botella:
     - Aviso si se programa estudio de tema nuevo en la víspera del cante (miércoles/domingo), recomendando reservar ese tiempo para repaso y descanso de voz.
     - Aviso si el domingo supera las 4 horas de carga, aconsejando proteger el descanso previo al cante del lunes.

---

## 2. Componentes y Módulos Clave

- `src/lib/plannerEngine.ts`: Motor de cálculo semanal, estimación ponderada por páginas y ritmos, generación de los 3 refrescos automáticos, propuestas de redistribución con confirmación y telemetría de sesiones reales.
- `src/components/planner/WeeklyPlannerView.tsx`: Vista principal de la cuadrícula de 7 días, Radar de Cante, Balance Previsto vs Real, avisos inteligentes, filtros de actividad y tarjetas interactivas.
- `src/components/planner/TaskEditorModal.tsx`: Modal para crear/editar tareas con chips de materias, estimaciones ajustables y notas.
- `src/components/planner/RebalanceConfirmModal.tsx`: Modal de confirmación previa a cualquier redistribución masiva.
- `src/components/planner/EbbinghausRecommendationsModal.tsx`: Recomendaciones proactivas basadas en temas en zona de riesgo de olvido.
- `src/components/planner/PlannerSettingsModal.tsx`: Configuración personalizada de horas diarias y ritmos de estudio por actividad.

---

## 3. Estado de Verificación

- Compilación de TypeScript (`tsc --noEmit`): **0 errores**.
- Build de Vite (`compile_applet`): **Éxito**.
