# Wells Prep: arquitectura, evidencia y compatibilidad

Esta revisión corresponde al código de este borrador. No se consultó Firebase de producción, no se usaron credenciales de administrador ni se publicaron cambios. La copia descargada por el usuario se leyó localmente para las evaluaciones autorizadas; no se convirtió en una semilla ni se incorporó al repositorio.

## Qué se sabe y con qué límites

**Confirmado mediante código:** React 19 y TypeScript, Vite, Tailwind, Recharts, Firebase Auth/Firestore en el cliente; Express y rutas de webhook/PDF en el servidor. La lectura principal ocurre en `FirebaseProvider`; el servidor comparte la cuarentena de cada UID en Firestore mediante `server/aerofocusStore.ts`, sin archivos ni cola global en memoria. El catálogo está en `src/data/initialData.ts`. La interfaz no demuestra por sí sola que una función persista o que un porcentaje prediga memoria.

**Confirmado en la copia local aportada:** 302 sesiones y 29 documentos de progreso, sin resultados explícitos de recuperación sin ayuda ni desglose PLSEMA por página. Hay notas de cante, pero no permiten observar qué fracción del contenido se recuerda. Algunas medidas de cobertura están ausentes o se contradicen. Estos resultados describen esa copia, no el estado actual de producción.

**Requiere otros datos:** precisión futura del motor, versiones históricas de páginas/dificultad, sesiones que se borraron antes de exportar, alcance de algunos repasos, orden intradía fiable y comportamiento real de las reglas desplegadas. No se afirma haber verificado ninguno de esos hechos en producción.

**Hipótesis, no diagnóstico probado:** que un cambio de ritmo se deba a una mejora de aprendizaje, que una nota baja represente olvido y no dificultades de exposición, o que menos minutos equivalgan a mayor dominio. El modelo no debe presentar estas interpretaciones como observaciones.

## Fuentes que consume cada módulo

| Módulo | Entrada compartida | Escritura o salida |
| --- | --- | --- |
| Temario oficial | `topics`, `topicState`, telemetría canónica | Parámetros maestros y formulario de sesión real |
| Ficha del tema | Tema canónico, sesiones por identidad y unión de cobertura inicial | Metadatos, sesiones observadas, capturas previas |
| Registro de sesiones | `sessionCommands`, `observedSession`, `sessionTelemetry` | Hechos con ID estable, minutos reales y medidas opcionales |
| Planificador semanal | Maestros, historial, estimador personalizado, recomendaciones de retención | Tareas y propuestas; completar un estado no fabrica una sesión |
| Preparador y cantes | Mismo mapa canónico y objetivos guardados | Nota y tiempo oral observados; compromiso distinto de recomendación |
| Dashboard y estadísticas | Proyección del historial por categorías | Sumas observadas; desconocidos excluidos de medias |
| Ebbinghaus | `retentionModel` y el mismo historial | Predicciones con objetivo, incertidumbre y fecha orientativa |

`topicData.ts` construye una vista reutilizable. `canonicalTopicService.ts` define la identidad y la precedencia de maestros frente a cachés. `topicCoverage.ts` reconstruye exclusivamente el estudio inicial. `personalizedEstimator.ts` estima tiempos por actividad. `retentionModel.ts` estima resultados de recuperación o, por separado, aprobados de cante. Ninguno escribe automáticamente sus cálculos como nuevos hechos históricos.

Los documentos almacenados se conservan aparte como `rawTopicProgress`. `userProgress` es ahora una proyección de compatibilidad para los componentes antiguos. Los valores derivados pueden reconstruirse al editar, añadir o borrar una sesión.

## Colecciones y campos observados en el código

Las rutas activas son `users/{uid}/progress/{topicId}`, `users/{uid}/sessions/{sessionId}`, `users/{uid}/settings/{documentId}` y `users/{uid}/quarantine/{eventId}`. Hay compatibilidad de lectura entre la base nombrada y la predeterminada configuradas por el cliente. En las pruebas ambas apuntan exclusivamente al emulador local.

Existen lectores antiguos para colecciones raíz y variantes de sesiones/cantes. Su presencia no prueba que contengan datos ni que se usen en el recorrido normal; las herramientas heurísticas de reparación se retiran del flujo operativo. No se ejecutó ninguna de ellas.

| Clase | Campos principales | Significado |
| --- | --- | --- |
| Catálogo | `id`, `subjectId`, `number`, `title`, `pages`, `numeroPalabras`, `difficulty`, `epigrafes` | Datos maestros oficiales, con sobrescrituras personales explícitas |
| Metadatos de usuario | `topicId`, `pages`, `numeroPalabras`, `difficulty`, `epigrafes`, `customTitle`, `notas`, `isCustom`, `isDeleted` | Extensión, descripción y parámetros; cero histórico de páginas significa desconocido |
| Historial | `id`, `topicId`, `type`, `date`, `durationMinutes`, `cantoSeconds`, `cantoGrade`, `difficulty`, `completesVuelta` | Actividad realizada, no tarea prevista |
| Cobertura observada | `startPage`, `endPage`, `pagesNumbers`, rangos/bloques con posiciones, `totalPagesAtSession` | Identidades de páginas cuando se conocen; conteos anónimos no identifican páginas |
| Telemetría | `plsema`, `observedPhases`, `pageBreakdown`, unidades explícitas | Minutos/segundos medidos. Una fase ausente no es una fase medida a cero |
| Predicciones | `prediction`, `retentionPrediction` | Modelo, momento, entradas disponibles, evidencia y resultado previsto antes de la observación |
| Evaluación de recuerdo | `retrieval.outcome`, `coverage`, `assistance`, `method` | Éxito o fallo declarado sin apuntes, separado de la nota oral |

`epigrafes` es actualmente un **conteo**, no un árbol completo de apartados. La arquitectura admite bloques observados, pero no inventa la correspondencia entre un bloque sin posición y páginas concretas.

## Contradicciones corregidas

- Las páginas ya no salen de copias de Preparador, cachés de planificación, dificultad multiplicada por dos o un valor supuesto de quince páginas.
- Una sesión de repaso, refresco o cante no completa páginas de estudio inicial. Los rangos iniciales solapados se unen una sola vez. Si solo existe un porcentaje o un conteo anónimo, el trabajo pendiente queda desconocido.
- Horas, vueltas y fechas derivadas no se incrementan por duplicado en varias escrituras. Los nuevos registros son hechos; la vista los suma. `historyVersion: 3` impide resucitar resúmenes antiguos después de borrar la última sesión.
- Repetir una entrega del mismo ID no crea evidencia adicional. Dos sesiones distintas con el mismo tiempo no se borran por parecerse.
- Las tareas se vinculan a sesiones por identidad. Marcar una tarea como completada sin una observación no genera minutos reales ni prueba de recuerdo.
- Los minutos etiquetados como minutos no se reinterpretan como segundos; el cante añade sus segundos explícitos. Ya no se rellenan notas ni duraciones observadas con metas del planificador.
- El motor de tiempos separa estudio pendiente, refresco, repaso y cante. Usa páginas medidas para aprender ritmos y conserva la ausencia de estimación.
- La curva anterior aplicaba multiplicadores de horas, rapidez oral, nota, refrescos y vueltas, con porcentajes y promesas de memoria no calibrados. Se conserva como referencia de evaluación; la interfaz activa no atribuye eficacia a la duración.
- Una nota de cante solo entrena la señal indirecta de aprobado. Para aprender una semivida de recuerdo se necesitan evaluaciones explícitas; una recuperación parcial no renueva el tema completo.
- La preparación oral ya no fabrica una nota actual a partir de retención, vueltas y cronómetro. Expone la última nota observada o indica que falta.
- Las cachés se separan por UID y el cambio de cuenta limpia el estado anterior. Los objetivos vacíos no se sustituyen por cinco temas inventados.

## Compatibilidad y cambios de esquema

No hace falta migrar ni eliminar documentos para leer esta versión. Se admiten nombres de actividad y campos históricos; se conserva su incertidumbre. Los campos nuevos son aditivos:

- `schemaVersion: 3` en sesiones y `historyVersion: 3` en metadatos de temas cuyo historial ya es autoritativo.
- Capturas `prediction` y `retentionPrediction`, separadas del resultado observado. Una captura añadida al guardar una sesión atrasada mantiene la fecha real de creación; no se finge una predicción hecha en el pasado.
- `retrieval` opcional; no se rellena retrospectivamente a partir de notas, minutos o vueltas.
- `mergedIntoSessionId` y `mergedSessionParts`: una fusión conserva los originales y sus identidades para impedir su reaparición como nuevas sesiones. La vista omite partes ya fusionadas.
- Ajustes explícitos de retención y protocolo de refrescos. Las tareas antiguas no se borran por no coincidir con una recomendación nueva.

No se propone reconstruir rangos históricos con porcentajes. Si se necesitara una consolidación entre bases, debe empezar por un informe de diferencias y una copia verificable, con decisiones explícitas sobre conflictos; no por una migración destructiva.

## Riesgos pendientes y prioridad

1. **Verificación local de Firebase:** el 13 de noviembre se resolvió la descarga del emulador oficial. Pasaron las 15 pruebas de Auth/Firestore y backend con SDK real, reglas, persistencia local, separación entre usuarios y transacciones concurrentes de ID estable. No validan las reglas desplegadas, dos bases físicas distintas ni todos los fallos parciales posibles. El replay de interfaz sigue siendo una comprobación distinta, en memoria.
2. **Configuración externa de seguridad:** el código corregido autentica la API, limita cada operación al UID, registra hashes de credenciales personales y endurece las reglas raíz. Estas reglas solo se han probado en emuladores: su aplicación a las bases reales, la identidad del servidor y la sustitución de credenciales en emisores externos requieren revisión y actuación del propietario. No se han desplegado reglas ni modificado producción. Véase `RELEASE_READINESS.md`.
3. **Dos bases de datos:** una transacción no abarca la base nombrada y la predeterminada. Las fusiones cruzadas se rechazan; no se promete atomicidad entre ambas. Una eliminación o una restauración por varios lotes necesita verificación de fallos parciales con emuladores antes de consolidar este diseño en una sola base física.
4. **Calidad histórica:** cobertura ausente, versiones de maestros desconocidas y vueltas inferidas limitan los cálculos. La app debe seguir mostrando esa incertidumbre, no corregirla en silencio.
5. **Validación futura:** las evaluaciones locales sirven para desarrollar y detectar fallos. No son una muestra final independiente después de ajustar el modelo con esos mismos resultados. La memoria real todavía no se puede validar con la copia disponible.
6. **Mantenimiento:** `FirebaseProvider` conserva demasiadas responsabilidades; conviene separar adaptadores de persistencia, importación y sincronización después de estabilizar los contratos probados. El paquete inicial del navegador sigue siendo grande y requiere división por pantallas. Son mejoras sobre esta base, no una reconstrucción.

La base coherente está implementada y es revisable. No se certifica una unificación física de producción ni una precisión de retención demostrada. El detalle de evaluación está en `PHASE_B_EVALUATION.md` y `PHASE_C_RETENTION.md`; los comandos y límites de aislamiento están en `LOCAL_TESTING.md`.
