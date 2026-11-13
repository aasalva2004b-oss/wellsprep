# Revisión crítica de Wells Prep — 13 de noviembre de 2026

> Informe de una revisión anterior. Los bloqueos corregidos, resultados finales y límites vigentes se encuentran en [RELEASE_READINESS.md](RELEASE_READINESS.md) y [RELEASE_VERIFICATION.json](RELEASE_VERIFICATION.json). Se conserva este documento para explicar las decisiones y las evaluaciones de aquella revisión.

Se corrigieron defectos reales del borrador y se añadieron regresiones. Esto no certifica que todas las fases estén terminadas: faltan seguridad del servidor heredado, consolidación física entre bases y validación prospectiva de los modelos. No se publicó nada, no se ejecutaron migraciones y no se conectó con Firebase de producción.

## Contraste de requisitos con la implementación

| Requisitos | Implementado y evidencia | Límite pendiente |
| --- | --- | --- |
| A: identidad, título oficial, extensión, dificultad y epígrafes | `CanonicalTopic` conserva `id`, `officialTitle`, título personal, maestros y procedencia. `topicData`/Provider exponen un mapa común a Temario, ficha, Preparador, Dashboard y planificador | `epigrafes` es un conteo, no un índice completo de apartados. Las dos bases físicas siguen existiendo |
| A: progreso parcial e historial | `topicCoverage` une rangos iniciales; repasar no estudia páginas nuevas; conteos anónimos conservan incertidumbre. El recorrido de navegador cambia 6→8 páginas y verifica 3 estudiadas/5 pendientes en ficha y Preparador | Un porcentaje histórico no identifica páginas. No se han inventado rangos ni reparado registros reales |
| A: sesiones, estadísticas y persistencia | Identidades estables, comandos de sesión, transacciones, tombstones y `historyVersion` separan hechos de proyecciones. Pruebas de proveedor, SDK real y reglas locales | Atomicidad entre bases y restauraciones de varios lotes no queda demostrada por el emulador de una sola base |
| B: estudio, refresco, repaso y cante independientes | `personalizedEstimator` v6 usa actividad, páginas medidas/pendientes, palabras y dificultad cuando existen, historial comparable, recencia y ordinales validados. Cante usa duración oral y segundos. PLSEMA sólo desglosa fases medidas | Sin trabajo medido puede faltar predicción; no se sustituyen ausencias por una duración genérica |
| B: robustez y precisión | Medianas, pesos robustos, validación temporal interna y referencia sencilla. Se capturan previsión, evidencia, intervalo y error separado del tiempo real | La copia no permite demostrar precisión retrospectiva de v6 tras excluir revisiones futuras. No se traslada la mejora de v5 a v6 |
| C: retención adaptativa y explicable | `retentionModel` separa recuerdo sin ayuda, nota de cante como señal indirecta y parámetros iniciales; recomienda fechas con confianza y motivos. Minutos, rapidez o vueltas no son resultados de recuerdo | 0 evaluaciones explícitas de recuerdo en la copia; no se ha demostrado una mejora de calibración ni de memoria |
| C: actualización y persistencia | Evidencia temporal, política ajustable, capturas y resultado observado separados; recuperación parcial no renueva el tema entero. Persistencia sintética probada con SDK local | Se necesitan observaciones futuras y versiones/capturas históricas fiables para validar el aprendizaje |
| D: planificar antes del cante | Propuestas deterministas por plazo, páginas pendientes, estimador B, disponibilidad, dependencias, tareas protegidas, conflictos y confirmación. Ejemplo calculado: 17 tareas, 284 min conocidos, 0 conflictos, 240 min/día disponibles | Distribuye por días; no asigna horas concretas ni garantiza ausencia de solapamientos entre franjas. La interfaz declara ese alcance |
| D: refrescos y recomendaciones | `three_days` conserva D+1/D+2/D+3 obligatorios; `adaptive` propone un contacto C; `off` no genera refrescos. Una finalización propuesta produce una recomendación condicional, sin sesión ni probabilidad inventadas | Una recomendación no es un compromiso de cante. La confirmación del usuario no convierte un plan imposible en viable |
| D: tareas, sesiones e incumplimientos | Vínculos estables, minutos reales separados, preservación de ajustes y propuestas sin escritura hasta confirmar. Pruebas de recarga/exportación sintética y transacciones locales | Concurrencia y fallos parciales de todos los recorridos heredados requieren más cobertura |
| E: interfaz y móvil | Sistema de diseño, navegación, Hoy antes de controles, tarjetas/formularios compactos, modales y teclado compartidos; captura de pantallas y recorrido automatizado en cuatro anchos | Sin certificación WCAG completa, dispositivos físicos o revisión exhaustiva de todos los temas visuales y gráficos secundarios |

La auditoría del esquema y de las rutas está en `ARCHITECTURE_AND_MIGRATION.md`; el detalle visual y los archivos de E, en `PHASE_E_UX_AUDIT.md`.

## Defectos encontrados y corregidos en esta revisión

1. Una entrega antigua podía ganar según su posición, o reaparecer al filtrar primero un tombstone, tipo o tema. `sessionVersions.ts` selecciona la revisión antes de esos filtros, con desempate determinista y conservador para archivos. Los registros sin ID no se deduplican por semejanza.
2. El entrenamiento podía usar una edición posterior al pronóstico. Se excluyen revisiones futuras también dentro de cada partición interna del selector de modelos. Si no existe la versión anterior, se conserva esa ausencia.
3. El perfil descartaba entregas repetidas antes de elegir la revisión correcta. Ahora comparte el selector de versiones con el núcleo y la proyección canónica.
4. Medianas PLSEMA independientes podían superar el tiempo total. Las proporciones observadas se ajustan y redondean conjuntamente; fases no medidas siguen ausentes.
5. Una predicción capturada después de la sesión podía contarse como prospectiva y las fases rellenadas a cero como mediciones. Se validan cronología y `observedPhases`.
6. El planificador podía sumar partes fusionadas, utilizar cobertura actual en un pronóstico pasado o tratar una sesión posterior del mismo día como conocida. Reconstruye el mapa a su fecha de corte y filtra relojes reales. Un comienzo anterior y final posterior no aporta todavía un resultado conocido. Los relojes explícitos permiten atravesar medianoche local sin confundirla con la fecha UTC.
7. El protocolo adaptativo podía producir los tres refrescos obligatorios. Ahora diferencia los tres modos; la fecha condicional futura procede de una política explícita, sin crear una sesión ficticia.
8. Editar una sesión podía rellenar 60 minutos y confirmar una vuelta sin intervención. La edición conserva desconocidos, nota cero y segundos; la fusión comienza sin nueva dificultad y sin vuelta confirmada. La suma y la validación de cantes usan las mismas unidades: 12:30 + 1:15 = 13:45.
9. Edición y creación manual de cuarentena podían anunciar éxito antes de persistir o tragarse el error. Esperan a Firestore y preservan entrada/estado al fallar. Una escritura pendiente no contamina otra cuenta al cambiar UID.
10. Los diálogos anidados competían por foco y Escape. Se comparte una pila modal; cerrar el editor conserva la ficha. Más→Ajustes/AeroFocus restaura el foco al botón persistente.
11. Había afirmaciones de memoria, precisión, enfoque o viabilidad sin evidencia. Se sustituyen por ausencia, objetivo explícito, confianza o motivo real. El resumen de la ficha ya no presenta «Memoria activa hoy» o «Fijado» como hechos.
12. El Dashboard reconstruía catálogo y perfil por cada tema. La telemetría reutiliza un mapa y un perfil por pantalla, sin caché global que pueda mezclar cuentas. Una regresión compara las predicciones con el adaptador anterior. En la prueba local de recomendaciones con 302 sesiones, ese caso pasó de aproximadamente 130 s a 1,7 s; es una medida del entorno de prueba, no una garantía para dispositivos reales.

## Pruebas y evidencia

Los comandos trabajan con el proyecto ficticio `demo-wellsprep`, loopback y datos sintéticos. Las evaluaciones privadas únicamente leen el JSON aportado y guardan agregados locales. El hash de la copia se conserva. Ninguna prueba usa credenciales de administrador.

| Comprobación | Resultado |
| --- | --- |
| `npm test` | 302/302 correctas, ninguna omitida |
| Auth + Firestore Emulator, SDK real | 9/9 correctas: propietarios, rechazo de otro usuario/anónimo, persistencia, capturas y transacciones concurrentes |
| `npm run lint` | TypeScript sin errores |
| `npm run build` | Compila; permanece la advertencia de paquete inicial grande |
| `tests/privateBackup.test.ts` | 5/5 correctas con copia local intacta: identidad, recomendaciones, invariancia de orden, ausencia de métricas inventadas |
| `scripts/phase-a-browser.mjs` | 6 comprobaciones: extensión compartida, cambio de páginas, progreso, nueva sesión única e historial/Dashboard |
| `scripts/provider-synthetic-browser.mjs` | 14 comprobaciones: edición/creación fallida, memoria/caché/persistencia, cambio UID, fusión con segundos, capturas, exportación y recalculado |
| `scripts/phase-d-browser.mjs` | 6 comprobaciones: propuesta, cancelación, conflictos, confirmación, conservación de cambios, exportación y recarga sintética |
| `scripts/phase-e-ui.mjs` | 40 capturas y 28 comprobaciones en 320/390/768/1440 px; 0 errores JavaScript y 0 solicitudes externas; documento sin desbordamiento horizontal |
| `scripts/browser-isolation.mjs --with-emulators` | Login y lectura con SDK real local; emulador no disponible provoca error sin fallback a producción |
| `git diff --check` | Sin errores de espacios |

Los informes de ejecución están en `.cache/phase-e/`, `.cache/provider-synthetic/`, `.cache/phase-a/` y `.cache/phase-d/`. El replay en memoria permite probar Provider y pantallas; no se presenta como durabilidad Firebase. Las pruebas del SDK y reglas son independientes. Las capturas usan datos inventados, no el historial privado.

## Precisión: resultado vigente

La evaluación corregida encuentra 302 sesiones válidas y 297 con `updatedAt` en el día del estudio o después. La copia sólo conserva las últimas versiones. Excluir las revisiones posteriores al corte deja **0 pares evaluables del estimador actual**, aunque la referencia simple tenga 291 casos. Tampoco quedan predicciones temporales disponibles para las 176 notas de cante. Hay **0 resultados explícitos de recuerdo sin ayuda**.

Por ello no se afirma una mejora de precisión actual. Los resultados numéricos antiguos se conservan como desarrollo previo y están marcados como no vigentes para esta versión. No se relajó el corte temporal para recuperar artificialmente cobertura. Esta limitación de evaluación no elimina las sesiones actuales de la aplicación: el historial disponible hoy sigue siendo utilizable hoy. Para medir precisión se necesitan predicciones capturadas antes del resultado y una etapa posterior reservada para evaluación.

## Modelo y esquema

Se mantienen tres clases de información: maestros del tema; sesiones/resultados observados; proyecciones y predicciones reconstruibles. Esta revisión no necesita una migración destructiva ni una nueva colección. Se conserva compatibilidad con campos anteriores y los campos aditivos ya documentados: `historyVersion`, capturas, `retrieval`, vínculos y partes fusionadas.

El selector de revisiones no es un registro completo de versiones: no puede reconstruir una versión que el backup no contiene. La copia privada no se importa al emulador ni se convierte en fixture del repositorio.

## Pendientes por prioridad

1. **Antes de exponer los recorridos heredados:** autenticar y autorizar por propietario los endpoints AeroFocus/mantenimiento, retirar/rotar el token compartido del código y endurecer las reglas raíz heredadas. No se utilizó el token ni se desplegaron reglas. Que las rutas por UID pasen el emulador no demuestra seguridad de esos otros recorridos.
2. **Antes de declarar unificación física:** resolver diferencias entre base nombrada/predeterminada con un informe y respaldo; probar fallos parciales y restauración por lotes. El servidor AeroFocus aún conserva almacenamiento adicional y lectores redundantes que necesitan un adaptador autorizado por usuario.
3. **Antes de afirmar precisión adaptativa:** reunir cobertura, snapshots contemporáneos y resultados prospectivos; preservar revisiones y reservar un periodo de evaluación. No inferir dominio a partir de duración, rapidez oral o tres refrescos.
4. **Calidad de producto:** ampliar pruebas en iOS/Android, lector de pantalla, todos los temas de color y gráficos secundarios; dividir el paquete inicial y separar responsabilidades del Provider. Existen módulos heredados de referencia que conviene retirar tras revisar sus consumidores; no deben reintroducir cálculos paralelos.

No se da por completado todo el programa A–E ni se califica el resultado de excelente. Lo implementado, lo comprobado localmente y lo que sigue pendiente quedan separados para continuar sobre esta base, sin reconstruir la aplicación.

## Archivos centrales de la revisión crítica

Además de los componentes enumerados en la auditoría UX: `sessionVersions.ts`, `canonicalTopicService.ts`, `personalizedEstimator.ts`, `adaptiveLearningEngine.ts`, `retentionModel.ts`, `cantePlanningEngine.ts`, `repasoPredictor.ts`, `performanceCache.ts` y `FirebaseProvider.tsx`. Las nuevas regresiones principales están en `tests/criticalEstimation.test.ts`, `tests/criticalRetentionPlanning.test.ts`, `tests/learningConsistency.test.ts`, `tests/estimatorIntegration.test.ts`, pruebas de formularios y los scripts de navegador. Los informes B/C/D, arquitectura y pruebas locales se actualizaron para retirar conclusiones o bloqueos que ya no reflejaban la evidencia actual.
