# Fase E: cambios y evidencia de experiencia de uso

> Informe de una revisión anterior. Los bloqueos corregidos, resultados finales y límites vigentes se encuentran en [RELEASE_READINESS.md](RELEASE_READINESS.md) y [RELEASE_VERIFICATION.json](RELEASE_VERIFICATION.json). Se conserva este documento para explicar las decisiones y las evaluaciones de aquella revisión.

Revisión del 13 de noviembre de 2026 sobre el borrador existente. Se preservan React, las pantallas, los modelos compartidos y la identidad cálida de Wells Prep. No se publicaron cambios ni se accedió a Firebase real.

## Problemas y cambios implementados

| Recorrido | Problema observado o reproducido | Cambio |
| --- | --- | --- |
| Planificador | Encabezados y controles consecutivos desplazaban el trabajo de hoy, especialmente en móvil | Un título; Hoy y próximo cante antes del toolbar; Registrar sobre una tarea real; semana, filtros y opciones compactos |
| Navegación | Controles duplicados y barra inferior que interfería con fichas | Navegación inferior en el flujo, cinco destinos y menú Más; sidebar compactable; área segura y acceso al contenido por teclado |
| Temario | Cuatro columnas pequeñas, jerarquía confusa y encabezado usado como control sin semántica | Datos en dos columnas en móvil, resumen secundario plegable, filtro compacto y botón accesible para abrir cada tema |
| Ficha e historial | Formularios y cierres desiguales; editar podía rellenar 60 minutos y vuelta completa no confirmados | Panel adaptable, footer disponible, campos reales sin inventar mediciones, diálogo anidado con foco propio y cierre independiente |
| Dashboard | Estadísticas antes de la acción, recomendaciones con afirmaciones no justificadas | Plan del día prioritario; métricas secundarias plegables; motivo del modelo compartido; acción Registrar repaso sin prometer una vuelta |
| Ebbinghaus | Riesgo de interpretar una estimación o nota como memoria medida | Se preserva el servicio compartido, su incertidumbre y objetivo; no se sustituye por una curva visual nueva |
| AeroFocus | Foco entre modales; métricas de enfoque/retención y viabilidad rellenadas sin observaciones | Mismo ciclo de foco/Escape; ausencia como —; cero observado conservado; segundos orales incluidos; errores de guardado visibles |
| Evolución | Referencias 75/45/35 min, 85% y 4 h sin muestras; tres refrescos presentados como estado universal | Medias observadas con número de muestras; ausencia explícita; contactos observados sin cuota o dominio; orden de sesiones distinguido de vueltas |
| Ajustes | Densidad móvil, campos y foco inconsistentes | Controles de 44 px, entradas móviles de 16 px, panel con scroll propio; parámetros de retención descritos como supuestos ajustables |

Los tokens de `designSystem.ts` y `index.css` consolidan tarjetas, botones, campos, estados vacíos/error, tipografía, colores semánticos y foco visible. `useDialogAccessibility.ts` comparte encierro/restauración de foco, bloqueo de scroll, Escape y prioridad entre diálogos. Los cambios de presentación reutilizan las mismas operaciones de registro y los modelos A–D.

## Verificación reproducible

`node scripts/phase-e-ui.mjs` utiliza exclusivamente tres temas inventados, siete sesiones y tareas sintéticas. El transporte SDK de estas pantallas es un replay **en memoria**, distinto del Firestore Emulator. Bloquea cualquier petición fuera de loopback y guarda capturas/informe en `.cache/phase-e/`.

Se inspeccionaron visualmente planificador, Temario/ficha, retención, Dashboard, AeroFocus y Ajustes. El recorrido automatizado incluye centro de cante, formulario de registro, editor de tareas, propuesta de cantes, editor de sesión anidado y búsqueda global. Prueba 320, 390, 768 y 1440 px, desbordamiento del documento, dimensiones de diálogos, Tab/Shift+Tab, Escape, restauración del foco y cancelación sin fabricar registros. El resultado final y los conteos se registran en `FINAL_CRITICAL_REVIEW.md` y `after-report.json`.

El contraste calculado de los tokens claros es 12,65:1 texto/fondo, 5,75:1 texto secundario/superficie, 13,79:1 botón y 6,82:1 foco/superficie. Esto no certifica todos los elementos, gráficos o temas de color. Hay soporte de movimiento reducido y áreas seguras, pero Chromium redimensionado no sustituye pruebas físicas en iOS/Android o lector de pantalla.

## Archivos de presentación modificados respecto al borrador anterior a E


- `src/App.tsx`
- `src/components/AuthGate.tsx`
- `src/components/CommandPalette.tsx`
- `src/components/DashboardView.tsx`
- `src/components/EditSessionDialog.tsx`
- `src/components/PreparadorView.tsx`
- `src/components/SettingsDialog.tsx`
- `src/components/StudySessionDialog.tsx`
- `src/components/SyncControlCenterDialog.tsx`
- `src/components/TemarioView.tsx`
- `src/components/TopicEditorDialog.tsx`
- `src/components/TopicsEvolutionSection.tsx`
- `src/components/dashboard/DashboardQuickCantoModal.tsx`
- `src/components/dashboard/DashboardTodayRecommender.tsx`
- `src/components/planner/CantePlanProposalModal.tsx`
- `src/components/planner/EbbinghausRecommendationsModal.tsx`
- `src/components/planner/PlannerSettingsModal.tsx`
- `src/components/planner/TaskEditorModal.tsx`
- `src/components/planner/WeeklyPlannerView.tsx`
- `src/components/preparador/CanteGoalCockpit.tsx`
- `src/components/preparador/PreparadorQuickFeedbackModal.tsx`
- `src/components/preparador/WeeklyPlannerStrip.tsx`
- `src/components/topic-editor/TopicEditorHeader.tsx`
- `src/components/topic-editor/TopicHistoryCard.tsx`
- `src/components/topic-editor/TopicVitalsGrid.tsx`
- `src/index.css`
- `src/lib/designSystem.ts`

Además: `src/hooks/useDialogAccessibility.ts`, `src/lib/sessionEditInput.ts`, `src/lib/quarantineTopicInput.ts`, `src/lib/importedAnalyticsPresentation.ts`, sus pruebas y `scripts/phase-e-ui.mjs`. La lista compara el snapshot local previo a E; el diff de Git incluye también las fases A–D que ya estaban en el borrador y no deben interpretarse como reaplicadas.

## Límites

No se declara una certificación completa de accesibilidad, de todos los tamaños o de todos los datos posibles. El editor de evolución y los gráficos secundarios requieren ampliar su cobertura visual. Persisten deuda del paquete inicial y estilos locales que conviene adoptar progresivamente al sistema compartido. Los riesgos de servidor y reglas heredadas se detallan en la revisión crítica; un cambio visual no los resuelve.
