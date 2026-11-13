# Inventario de integración de Wells Prep

Revisión final del 13 de noviembre de 2026. Rama `release/wells-prep-production-fixes`, basada en el borrador original `7188dec` e integrada con `origin/main` (`81321f0`). Incluye el código A–E del borrador y las correcciones autorizadas; no se reconstruyó la aplicación ni se fusionó hacia `main`.

La tabla compara el resultado con `81321f0`, e incluye todos los documentos nuevos. `A`: añadido; `M`: modificado; `D`: retirado del seguimiento. La retirada de `uploads/aerofocus_events.json` no borra un almacén de producción: el archivo local queda ignorado y el runtime ya usa Firestore por UID. La limpieza de artefactos de AI Studio procedente de `main` se conservó.

## Grupos principales

- A–E: modelos y servicios compartidos en `src/lib`, conexiones del Provider y formularios, planificación, retención, telemetría e interfaz móvil.
- Cinco regresiones: `plannerEngine`, `canonicalTopicService`, `observedSession`, `sessionAvailability`, `retentionContext`, `ebbinghaus`, `useLocalDay` y sus pruebas. Las aserciones originales permanecen intactas.
- Seguridad: separación `server.ts`/`server/`, API autenticada, almacenamiento Firestore duradero, cuotas y hashes de credenciales, HTTP/SSE por UID, reglas endurecidas y denegación de rutas antiguas inseguras.
- Runtime: Docker multietapa sin privilegios, salida backend fuera de `dist`, Node fijado, dependencia de construcción solo en desarrollo, arranque remoto explícito y emuladores seguros por defecto.
- Compatibilidad con `main`: alias históricos conocidos y precedencia del maestro canónico. Se preserva la incertidumbre de temas sin materia; no se importa la asignación arbitraria de números sueltos a Constitucional.
- No se incluyen backups, `.env`, claves privadas, cachés, informes temporales ni capturas de datos reales. Los documentos de fases anteriores se conservan como antecedentes y remiten al resultado final.

## Archivos

Total frente a `81321f0`: **182 archivos** (incluida documentación).

| Estado | Archivo | Área |
| --- | --- | --- |
| A | `.dockerignore` | Configuración, reglas, dependencias o empaquetado |
| M | `.env.example` | Configuración, reglas, dependencias o empaquetado |
| M | `.gitignore` | Configuración, reglas, dependencias o empaquetado |
| A | `.nvmrc` | Configuración, reglas, dependencias o empaquetado |
| A | `Dockerfile` | Configuración, reglas, dependencias o empaquetado |
| M | `api/parse-pdf.ts` | Backend, autenticación y persistencia |
| M | `api/webhook/ack.ts` | Backend, autenticación y persistencia |
| M | `api/webhook/aerofocus.ts` | Backend, autenticación y persistencia |
| M | `api/webhook/clear.ts` | Backend, autenticación y persistencia |
| M | `api/webhook/discard.ts` | Backend, autenticación y persistencia |
| M | `api/webhook/events.ts` | Backend, autenticación y persistencia |
| M | `api/webhook/health.ts` | Backend, autenticación y persistencia |
| M | `api/webhook/index.ts` | Backend, autenticación y persistencia |
| M | `api/webhook/ping.ts` | Backend, autenticación y persistencia |
| M | `api/webhook/test.ts` | Backend, autenticación y persistencia |
| M | `api/webhook/update-quarantine.ts` | Backend, autenticación y persistencia |
| M | `app/api/webhook/aerofocus/route.ts` | Backend, autenticación y persistencia |
| A | `docs/ARCHITECTURE_AND_MIGRATION.md` | Documentación y evidencias |
| A | `docs/BACKUP_VALIDATION.md` | Documentación y evidencias |
| A | `docs/FINAL_CRITICAL_REVIEW.md` | Documentación y evidencias |
| A | `docs/GOOGLE_AI_STUDIO_RELEASE_GUIDE.md` | Documentación y evidencias |
| A | `docs/LOCAL_TESTING.md` | Documentación y evidencias |
| A | `docs/PHASE_B_EVALUATION.md` | Documentación y evidencias |
| A | `docs/PHASE_C_RETENTION.md` | Documentación y evidencias |
| A | `docs/PHASE_D_PLANNING.md` | Documentación y evidencias |
| A | `docs/PHASE_E_UX_AUDIT.md` | Documentación y evidencias |
| A | `docs/PULL_REQUEST_BODY.md` | Documentación y evidencias |
| A | `docs/RELEASE_CHANGE_INVENTORY.md` | Documentación y evidencias |
| A | `docs/RELEASE_READINESS.md` | Documentación y evidencias |
| A | `docs/RELEASE_VERIFICATION.json` | Documentación y evidencias |
| A | `firebase.local.json` | Configuración, reglas, dependencias o empaquetado |
| M | `firestore.rules` | Configuración, reglas, dependencias o empaquetado |
| M | `package-lock.json` | Configuración, reglas, dependencias o empaquetado |
| M | `package.json` | Configuración, reglas, dependencias o empaquetado |
| A | `scripts/backup-browser.mjs` | Pruebas, evaluación y arranque aislado |
| A | `scripts/browser-isolation.mjs` | Pruebas, evaluación y arranque aislado |
| A | `scripts/dev-local.mjs` | Pruebas, evaluación y arranque aislado |
| A | `scripts/evaluate-estimator.ts` | Pruebas, evaluación y arranque aislado |
| A | `scripts/evaluate-retention.ts` | Pruebas, evaluación y arranque aislado |
| A | `scripts/example-cante-plan.ts` | Pruebas, evaluación y arranque aislado |
| A | `scripts/local-environment.mjs` | Pruebas, evaluación y arranque aislado |
| A | `scripts/local-only-network.cjs` | Pruebas, evaluación y arranque aislado |
| A | `scripts/phase-a-browser.mjs` | Pruebas, evaluación y arranque aislado |
| A | `scripts/phase-d-browser.mjs` | Pruebas, evaluación y arranque aislado |
| A | `scripts/phase-e-ui.mjs` | Pruebas, evaluación y arranque aislado |
| A | `scripts/provider-synthetic-browser.mjs` | Pruebas, evaluación y arranque aislado |
| A | `scripts/release-regression-probes.ts` | Pruebas, evaluación y arranque aislado |
| A | `scripts/run-auth-checks.mjs` | Pruebas, evaluación y arranque aislado |
| A | `scripts/run-local-checks.mjs` | Pruebas, evaluación y arranque aislado |
| A | `scripts/run-unit-tests.mjs` | Pruebas, evaluación y arranque aislado |
| A | `scripts/seed-emulator.ts` | Pruebas, evaluación y arranque aislado |
| A | `scripts/start.mjs` | Pruebas, evaluación y arranque aislado |
| A | `scripts/test-backup.mjs` | Pruebas, evaluación y arranque aislado |
| M | `server.ts` | Backend, autenticación y persistencia |
| A | `server/aerofocusStore.ts` | Backend, autenticación y persistencia |
| A | `server/app.ts` | Backend, autenticación y persistencia |
| A | `server/firebaseRuntime.ts` | Backend, autenticación y persistencia |
| M | `src/App.tsx` | Interfaz y conexiones de formularios |
| M | `src/components/AuthGate.tsx` | Interfaz y conexiones de formularios |
| M | `src/components/CommandPalette.tsx` | Interfaz y conexiones de formularios |
| M | `src/components/DashboardView.tsx` | Interfaz y conexiones de formularios |
| M | `src/components/EditSessionDialog.tsx` | Interfaz y conexiones de formularios |
| M | `src/components/PreparadorView.tsx` | Interfaz y conexiones de formularios |
| M | `src/components/SettingsDialog.tsx` | Interfaz y conexiones de formularios |
| A | `src/components/StudySessionDialog.tsx` | Interfaz y conexiones de formularios |
| M | `src/components/SyncControlCenterDialog.tsx` | Interfaz y conexiones de formularios |
| M | `src/components/TemarioView.tsx` | Interfaz y conexiones de formularios |
| M | `src/components/TopicEditorDialog.tsx` | Interfaz y conexiones de formularios |
| M | `src/components/TopicsEvolutionSection.tsx` | Interfaz y conexiones de formularios |
| M | `src/components/dashboard/DashboardPreparadorExecutiveCard.tsx` | Interfaz y conexiones de formularios |
| M | `src/components/dashboard/DashboardQuickCantoModal.tsx` | Interfaz y conexiones de formularios |
| M | `src/components/dashboard/DashboardTodayRecommender.tsx` | Interfaz y conexiones de formularios |
| A | `src/components/planner/CantePlanProposalModal.tsx` | Interfaz y conexiones de formularios |
| M | `src/components/planner/EbbinghausRecommendationsModal.tsx` | Interfaz y conexiones de formularios |
| M | `src/components/planner/PlannerSettingsModal.tsx` | Interfaz y conexiones de formularios |
| M | `src/components/planner/TaskEditorModal.tsx` | Interfaz y conexiones de formularios |
| M | `src/components/planner/WeeklyPlannerView.tsx` | Interfaz y conexiones de formularios |
| M | `src/components/preparador/CanteGoalCockpit.tsx` | Interfaz y conexiones de formularios |
| M | `src/components/preparador/DailyActionPlanView.tsx` | Interfaz y conexiones de formularios |
| M | `src/components/preparador/PreparadorEbbinghausQueue.tsx` | Interfaz y conexiones de formularios |
| M | `src/components/preparador/PreparadorQuickFeedbackModal.tsx` | Interfaz y conexiones de formularios |
| M | `src/components/preparador/PreparadorTopicCard.tsx` | Interfaz y conexiones de formularios |
| M | `src/components/preparador/WeeklyPlannerStrip.tsx` | Interfaz y conexiones de formularios |
| M | `src/components/topic-editor/TopicEbbinghausCard.tsx` | Interfaz y conexiones de formularios |
| M | `src/components/topic-editor/TopicEditorHeader.tsx` | Interfaz y conexiones de formularios |
| M | `src/components/topic-editor/TopicHistoryCard.tsx` | Interfaz y conexiones de formularios |
| M | `src/components/topic-editor/TopicParametersCard.tsx` | Interfaz y conexiones de formularios |
| M | `src/components/topic-editor/TopicVitalsGrid.tsx` | Interfaz y conexiones de formularios |
| M | `src/hooks/useAeroFocusSync.ts` | Modelo común, estimación, retención y adaptadores |
| A | `src/hooks/useDialogAccessibility.ts` | Modelo común, estimación, retención y adaptadores |
| A | `src/hooks/useLocalDay.ts` | Modelo común, estimación, retención y adaptadores |
| A | `src/hooks/useTopicData.ts` | Modelo común, estimación, retención y adaptadores |
| M | `src/hooks/useTopicEditor.ts` | Modelo común, estimación, retención y adaptadores |
| M | `src/index.css` | Interfaz y conexiones de formularios |
| M | `src/lib/FirebaseProvider.tsx` | Modelo común, estimación, retención y adaptadores |
| M | `src/lib/adaptiveLearningEngine.ts` | Modelo común, estimación, retención y adaptadores |
| A | `src/lib/aeroFocusMessagePolicy.ts` | Modelo común, estimación, retención y adaptadores |
| A | `src/lib/apiSecurity.ts` | Modelo común, estimación, retención y adaptadores |
| A | `src/lib/authenticatedApi.ts` | Modelo común, estimación, retención y adaptadores |
| A | `src/lib/backup.ts` | Modelo común, estimación, retención y adaptadores |
| M | `src/lib/canonicalTopicService.ts` | Modelo común, estimación, retención y adaptadores |
| A | `src/lib/canteCommitments.ts` | Modelo común, estimación, retención y adaptadores |
| A | `src/lib/cantePlanningEngine.ts` | Modelo común, estimación, retención y adaptadores |
| M | `src/lib/cantoUtils.ts` | Modelo común, estimación, retención y adaptadores |
| M | `src/lib/designSystem.ts` | Modelo común, estimación, retención y adaptadores |
| M | `src/lib/ebbinghaus.ts` | Modelo común, estimación, retención y adaptadores |
| A | `src/lib/estimationEvaluation.ts` | Modelo común, estimación, retención y adaptadores |
| M | `src/lib/firebase.ts` | Modelo común, estimación, retención y adaptadores |
| A | `src/lib/firebaseEnvironment.ts` | Modelo común, estimación, retención y adaptadores |
| A | `src/lib/importedAnalyticsPresentation.ts` | Modelo común, estimación, retención y adaptadores |
| A | `src/lib/observedSession.ts` | Modelo común, estimación, retención y adaptadores |
| M | `src/lib/oposicionCycle.ts` | Modelo común, estimación, retención y adaptadores |
| M | `src/lib/performanceCache.ts` | Modelo común, estimación, retención y adaptadores |
| A | `src/lib/personalizedEstimator.ts` | Modelo común, estimación, retención y adaptadores |
| M | `src/lib/plannerEngine.ts` | Modelo común, estimación, retención y adaptadores |
| A | `src/lib/predictionSnapshot.ts` | Modelo común, estimación, retención y adaptadores |
| M | `src/lib/preparationScore.ts` | Modelo común, estimación, retención y adaptadores |
| A | `src/lib/quarantineTopicInput.ts` | Modelo común, estimación, retención y adaptadores |
| M | `src/lib/recommendationEngine.ts` | Modelo común, estimación, retención y adaptadores |
| M | `src/lib/repasoPredictor.ts` | Modelo común, estimación, retención y adaptadores |
| A | `src/lib/retentionContext.ts` | Modelo común, estimación, retención y adaptadores |
| A | `src/lib/retentionEvaluation.ts` | Modelo común, estimación, retención y adaptadores |
| A | `src/lib/retentionModel.ts` | Modelo común, estimación, retención y adaptadores |
| A | `src/lib/sessionAvailability.ts` | Modelo común, estimación, retención y adaptadores |
| A | `src/lib/sessionCommands.ts` | Modelo común, estimación, retención y adaptadores |
| A | `src/lib/sessionEditInput.ts` | Modelo común, estimación, retención y adaptadores |
| A | `src/lib/sessionTelemetry.ts` | Modelo común, estimación, retención y adaptadores |
| A | `src/lib/sessionVersions.ts` | Modelo común, estimación, retención y adaptadores |
| A | `src/lib/topicCoverage.ts` | Modelo común, estimación, retención y adaptadores |
| A | `src/lib/topicData.ts` | Modelo común, estimación, retención y adaptadores |
| M | `src/lib/topicResolver.ts` | Modelo común, estimación, retención y adaptadores |
| M | `src/lib/webhookStorage.ts` | Modelo común, estimación, retención y adaptadores |
| M | `src/lib/weeklyCanteEngine.ts` | Modelo común, estimación, retención y adaptadores |
| A | `src/testing/replayAuth.ts` | Modelo común, estimación, retención y adaptadores |
| A | `src/testing/replayFirestore.ts` | Modelo común, estimación, retención y adaptadores |
| M | `src/types.ts` | Configuración, reglas, dependencias o empaquetado |
| A | `tests/adaptive.synthetic.test.ts` | Pruebas, evaluación y arranque aislado |
| A | `tests/aeroFocusMessagePolicy.test.ts` | Pruebas, evaluación y arranque aislado |
| A | `tests/aeroIngestion.test.ts` | Pruebas, evaluación y arranque aislado |
| A | `tests/apiSecurity.test.ts` | Pruebas, evaluación y arranque aislado |
| A | `tests/auth.emulator.test.ts` | Pruebas, evaluación y arranque aislado |
| A | `tests/backend.emulator.test.ts` | Pruebas, evaluación y arranque aislado |
| A | `tests/backendSecurity.test.ts` | Pruebas, evaluación y arranque aislado |
| A | `tests/backup.test.ts` | Pruebas, evaluación y arranque aislado |
| A | `tests/canteCommitments.test.ts` | Pruebas, evaluación y arranque aislado |
| A | `tests/cantePlanningAdversarial.test.ts` | Pruebas, evaluación y arranque aislado |
| A | `tests/cantePlanningEngine.test.ts` | Pruebas, evaluación y arranque aislado |
| A | `tests/criticalEstimation.test.ts` | Pruebas, evaluación y arranque aislado |
| A | `tests/criticalRetentionPlanning.test.ts` | Pruebas, evaluación y arranque aislado |
| A | `tests/durationResolution.test.ts` | Pruebas, evaluación y arranque aislado |
| A | `tests/emulatorGuard.test.ts` | Pruebas, evaluación y arranque aislado |
| A | `tests/estimationEvaluation.test.ts` | Pruebas, evaluación y arranque aislado |
| A | `tests/estimatorIntegration.test.ts` | Pruebas, evaluación y arranque aislado |
| A | `tests/firebaseEnvironment.test.ts` | Pruebas, evaluación y arranque aislado |
| A | `tests/firestore.emulator.test.ts` | Pruebas, evaluación y arranque aislado |
| A | `tests/fixtures/syntheticStudyData.ts` | Pruebas, evaluación y arranque aislado |
| A | `tests/helpers/emulatorClient.ts` | Pruebas, evaluación y arranque aislado |
| A | `tests/importedAnalyticsPresentation.test.ts` | Pruebas, evaluación y arranque aislado |
| A | `tests/learningConsistency.test.ts` | Pruebas, evaluación y arranque aislado |
| A | `tests/localDayAvailability.test.ts` | Pruebas, evaluación y arranque aislado |
| A | `tests/modelConsistency.test.ts` | Pruebas, evaluación y arranque aislado |
| A | `tests/networkIsolation.test.ts` | Pruebas, evaluación y arranque aislado |
| A | `tests/observedSession.test.ts` | Pruebas, evaluación y arranque aislado |
| A | `tests/personalizedEstimator.test.ts` | Pruebas, evaluación y arranque aislado |
| A | `tests/phaseA.synthetic.test.ts` | Pruebas, evaluación y arranque aislado |
| A | `tests/preparationScore.test.ts` | Pruebas, evaluación y arranque aislado |
| A | `tests/privateBackup.test.ts` | Pruebas, evaluación y arranque aislado |
| A | `tests/quarantineTopicInput.test.ts` | Pruebas, evaluación y arranque aislado |
| A | `tests/refrescoProtocol.test.ts` | Pruebas, evaluación y arranque aislado |
| A | `tests/releaseRegression.test.ts` | Pruebas, evaluación y arranque aislado |
| A | `tests/retentionEvaluation.test.ts` | Pruebas, evaluación y arranque aislado |
| A | `tests/retentionModel.test.ts` | Pruebas, evaluación y arranque aislado |
| A | `tests/sessionCommands.test.ts` | Pruebas, evaluación y arranque aislado |
| A | `tests/sessionEditInput.test.ts` | Pruebas, evaluación y arranque aislado |
| A | `tests/sessionTelemetry.test.ts` | Pruebas, evaluación y arranque aislado |
| A | `tests/topicDomain.test.ts` | Pruebas, evaluación y arranque aislado |
| A | `tests/topicIdentityCompatibility.test.ts` | Pruebas, evaluación y arranque aislado |
| A | `tests/weeklyCoverage.test.ts` | Pruebas, evaluación y arranque aislado |
| A | `tests/weeklyEstimator.test.ts` | Pruebas, evaluación y arranque aislado |
| M | `tsconfig.json` | Configuración, reglas, dependencias o empaquetado |
| D | `uploads/aerofocus_events.json` | Configuración, reglas, dependencias o empaquetado |
| M | `vite.config.ts` | Configuración, reglas, dependencias o empaquetado |


## Corrección posterior de arranque — 14 de noviembre

La rama `fix/ai-studio-startup` modifica `package.json`, `vite.config.ts`, `src/components/AuthGate.tsx` y la documentación de arranque; añade `scripts/dev-preview.mjs`, `scripts/test-hosted-preview.mjs` y `docs/AI_STUDIO_STARTUP_FIX.md`. La tabla anterior conserva el inventario de la entrega inicial. La vista previa sin Java es sintética, sin API externa ni persistencia.
