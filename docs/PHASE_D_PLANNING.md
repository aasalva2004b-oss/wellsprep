# Fase D: planificación por fechas de cante

> Informe de una revisión anterior. Los bloqueos corregidos, resultados finales y límites vigentes se encuentran en [RELEASE_READINESS.md](RELEASE_READINESS.md) y [RELEASE_VERIFICATION.json](RELEASE_VERIFICATION.json). Se conserva este documento para explicar las decisiones y las evaluaciones de aquella revisión.

El motor `src/lib/cantePlanningEngine.ts` genera una propuesta en memoria. No usa Firebase, no escribe sesiones y no modifica los objetos recibidos. El usuario revisa la propuesta y confirma expresamente su incorporación al plan existente.

## Contrato y reglas

`generateCantePlanProposal` recibe el mapa canónico de temas de la fase A, sesiones observadas, tareas existentes, disponibilidad, compromisos `{ id, date, topicIds }`, horizonte y fecha de referencia. `forecastAt` permite suministrar el instante exacto de predicción. Si se omite, se realiza una simulación al final del día `asOf`; no debe interpretarse como una predicción registrada por la mañana. Las mismas entradas producen las mismas tareas, fechas, conflictos y firma. Los identificadores no dependen de un reloj aleatorio.

La salida contiene `candidateTasks` (altas y traslados propuestos), `mergedTasks` (lista completa para confirmar), carga diaria, conflictos, alternativas y viabilidad. `totalEstimatedMinutes` suma solo las estimaciones conocidas. `totalMinutes` es `null` si hay duraciones o cobertura necesarias desconocidas. La interfaz debe mostrar ese desconocimiento y no presentar la suma parcial como una carga total.

Las reglas aplicadas son:

1. El cante permanece en su fecha de lunes o jueves. La preparación se sitúa como máximo en el día anterior, porque no se conoce la hora de la cita.
2. Se atiende antes el compromiso más próximo. El estudio inicial utiliza únicamente las páginas pendientes reconstruidas de sesiones reales. Los huecos discontinuos se conservan como listas de páginas; nunca se inventa un intervalo que incluya páginas ya estudiadas.
3. El estudio se puede dividir en varias tareas según la capacidad residual. El último fragmento precede a los refrescos; cada tarea conserva dependencias explícitas.
4. Los tres refrescos naturales D+1, D+2 y D+3 son una obligación de planificación configurada por el usuario. No significan que se haya demostrado una mejora del recuerdo. Para acabar los tres antes del cante hay que terminar el estudio como máximo D−4.
5. Una finalización observada procede de la primera unión completa de rangos iniciales reales (`getInitialStudyCompletionDate`). Una finalización propuesta es condicional: sus refrescos deben recalcularse si el estudio termina en otra fecha. El último fragmento de tres páginas de un tema de seis no genera refrescos de solo tres páginas.
6. Un refresco registrado cumple su día cuando el alcance observado cubre el tema completo. Una sesión parcial o de alcance desconocido se conserva y genera incertidumbre, sin dar por cumplida la obligación completa.
7. Las duraciones llaman a `estimatePersonalizedDuration` de la fase B, con trabajo exacto, ordinal de repaso o refresco e instante de predicción. Los ritmos manuales explícitos siguen siendo ajustes del usuario, etiquetados como tales. No se usan las antiguas constantes de 45/35/25 minutos ni un multiplicador inventado por vuelta.
8. Los repasos incorporan temas de meses anteriores, recomendaciones de la fase C y preparación de los siguientes cantes. Se reutiliza la política de retención canónica; no aparece otra curva de olvido. Un segundo compromiso del mismo tema recibe una preparación condicional entre ambas citas.
9. Las tareas existentes reservan capacidad. Las tareas completas, fijadas, manuales o confirmadas se conservan. Una tarea atrasada sin protección solo cambia en la propuesta revisable, con su fecha original documentada. Las citas de cante nunca se trasladan automáticamente.
10. La capacidad usada suma trabajo realmente registrado y reservas pendientes. Una sesión vinculada no se cuenta dos veces. Disponibilidad, suma de estimaciones y minutos reales son campos separados.
11. Una sobrecarga o una dependencia imposible produce `infeasible`, con alternativas concretas. Un dato necesario desconocido produce `unknown`, no cero. `feasible` significa que las estimaciones disponibles de esta propuesta caben en las restricciones modeladas; no garantiza el resultado académico ni que una estimación futura sea exacta.
12. Las excepciones de refresco usan la clave `tema|fecha original D+n`, exigen justificación y se muestran como conflictos informativos. Permiten omitir o trasladar expresamente una obligación; no alteran el historial real.

## Ejemplo calculado con datos ficticios

El ejemplo se ejecutó directamente mediante el motor, con el bloqueo local de red activo. No utiliza el archivo de respaldo del usuario.

Referencia: 9 de noviembre de 2026 a las 08:00 UTC. Cante: lunes 16 de noviembre. Disponibilidad: 240 minutos diarios. Horizonte: 9–19 de noviembre. Todos los temas tienen seis páginas.

- Tema 901: sin estudio inicial; quedan las páginas 1–6.
- Tema 902: páginas 1–3 estudiadas el día 8; quedan exactamente 4–6.
- Tema 903: estudio completo observado el día 8; necesita D+1/D+2/D+3 los días 9, 10 y 11.
- Tema 904: estudio y tres refrescos observados en octubre, más un repaso; se propone preparación previa al cante.
- Tema 999: aporta mediciones ficticias de estudio, refresco, repaso y cante; también recibe una revisión del mes anterior.

Las mediciones de este ejemplo dan 60 minutos por seis páginas iniciales, 12 por refresco completo, 18 por repaso y 12 minutos y 30 segundos por cante. Son resultados de esas observaciones, no valores fijados en el planificador.

| Fecha | Trabajo propuesto | Minutos previstos | Disponibilidad |
| --- | --- | ---: | ---: |
| Lun 9 | Estudio 901: páginas 1–6; estudio 902: páginas 4–6; R1 de 903 | 102 | 240 |
| Mar 10 | R1 de 901 y 902; R2 de 903 | 36 | 240 |
| Mié 11 | R2 de 901 y 902; R3 de 903 | 36 | 240 |
| Jue 12 | R3 de 901 y 902 | 24 | 240 |
| Vie 13 | Repaso de 904 para el cante | 18 | 240 |
| Sáb 14 | Revisión recomendada de 999 | 18 | 240 |
| Lun 16 | Cuatro cantes de 12,5 minutos | 50 | 240 |
| **Total** | **17 tareas: 2 estudios, 9 refrescos, 2 repasos y 4 cantes** | **284 (4 h 44 min)** | |

Salida calculada: `feasible`, ninguna duración desconocida y ningún conflicto. La suma comprobada es `90 + 108 + 36 + 50 = 284` minutos. Los refrescos de 901 y 902 están condicionados a acabar realmente el estudio el día 9; los de 903 proceden de una finalización ya observada.

Si ese mismo tema sin estudiar se introduce el domingo anterior al cante del lunes, el motor conserva el cante, muestra el estudio y los refrescos que faltan, y devuelve `infeasible`: tres días naturales posteriores al estudio no caben antes de la cita. No cambia la cita ni declara una viabilidad imposible.

## Pruebas y límites

La suite `tests/cantePlanningEngine.test.ts` cubre cantes de lunes con cuatro estados, jueves con estudio parcial, tres refrescos y fecha real de finalización, refresco parcial, dependencias propuestas, páginas discontinuas y división de trabajo, capacidad insuficiente, inicio demasiado tardío, desconocimiento, tareas atrasadas, protección manual, varios compromisos, recarga JSON, ausencia de sesiones ficticias, determinismo, contabilización del trabajo real, excepciones, sumas, fechas futuras, ordinales de repaso e instante exacto de predicción.

La revisión independiente añade `tests/cantePlanningAdversarial.test.ts`: tareas vencidas protegidas, relojes Firestore y comienzo real, cero capacidad, sesiones vinculadas, entregas repetidas, identificadores duplicados, fechas imposibles e invariancia al reordenar el historial. Resultado conjunto: **41/41 pruebas correctas** (32 del motor y 9 adversariales), además de TypeScript sin errores.

Comando local: `node --require ./scripts/local-only-network.cjs --import tsx --test tests/cantePlanningEngine.test.ts tests/cantePlanningAdversarial.test.ts`. Las pruebas de persistencia JSON verifican que el contrato conserva tareas e identificadores al confirmar y recargar. La prueba de navegador sintética comprueba confirmación, exportación y recarga desde archivo local. Actualización del 13 de noviembre: ya se pudo descargar Firestore Emulator. Las 9 pruebas Auth/Firestore con SDK real pasan, incluida la persistencia local de la propuesta y de capturas de retención. Esto no valida la configuración desplegada ni la atomicidad entre bases físicas distintas. Ninguna comprobación conecta a producción.

La distribución utiliza una heurística determinista de prioridad por plazo y capacidad residual, no una búsqueda exhaustiva de todas las combinaciones posibles. Un conflicto significa que esta propuesta necesita cambios; no demuestra que ninguna otra distribución imaginable pueda funcionar. La planificación tiene granularidad diaria: no conoce desplazamientos, horas exactas de cita, descansos ni solapamientos dentro de una hora. Esas obligaciones deben reservarse mediante la disponibilidad o tareas existentes. Las duraciones son estimaciones y los rangos del modelo no son garantías estadísticas calibradas. El motor no convierte la mera confirmación o marca visual de una tarea en estudio realizado.

## Revisión crítica del 13 de noviembre

El protocolo `adaptive` ya se distingue de `three_days`: propone un único contacto flexible calculado por el servicio de retención. Si el estudio inicial aún no ha terminado, usa parámetros iniciales explícitos y una fecha condicional, con probabilidad nula; no crea una sesión ni un resultado de recuerdo. `off` no programa refrescos automáticos. Los tres días obligatorios siguen siendo una elección de agenda, no una ley de memoria.

Antes de sumar minutos o reconstruir cobertura, se elige la revisión disponible de cada ID a la hora del pronóstico. Una parte fusionada no revive porque el filtro haya descartado su tombstone. El mapa canónico se reconstruye con ese historial temporal, evitando que la caché actual o una sesión posterior complete retrospectivamente páginas pendientes. Las regresiones están en `tests/criticalRetentionPlanning.test.ts`.
