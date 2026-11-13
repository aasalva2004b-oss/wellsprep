# Evaluación temporal de estimaciones

> Informe de una revisión anterior. Los bloqueos corregidos, resultados finales y límites vigentes se encuentran en [RELEASE_READINESS.md](RELEASE_READINESS.md) y [RELEASE_VERIFICATION.json](RELEASE_VERIFICATION.json). Se conserva este documento para explicar las decisiones y las evaluaciones de aquella revisión.

El evaluador compara el estimador personalizado con una referencia sencilla:
la mediana de las duraciones anteriores del mismo tipo de actividad. Estudio,
refresco, repaso y cante se evalúan por separado. Los segundos del cante se
convierten en fracciones de minuto; una duración ausente no es cero.

Cada sesión evaluada se predice utilizando **únicamente sesiones de días
anteriores**. Se excluyen del entrenamiento todas las del mismo día, incluso
si tienen una hora anterior: los backups no garantizan que esa hora represente
el orden real de disponibilidad. La sesión que se evalúa nunca se entrena a sí
misma. El registro pasa al historial para evaluar los días siguientes.

## Métricas y cobertura

- Error absoluto y error porcentual por observación, solo en memoria.
- MAE, mediana del error absoluto y MAPE agregados por actividad y globales.
- El porcentaje de error es nulo cuando la duración real es cero.
- Modelo y referencia se comparan sobre exactamente las mismas sesiones.
- Se publican los casos sin predicción, sin referencia, inválidos y las entregas
  duplicadas; una buena precisión en pocas sesiones no equivale a cobertura total.
- Cobertura del intervalo y anchura media, sin presentarlo como intervalo de
  confianza estadístico calibrado hasta que haya evidencia para ello.
- Los resultados desfavorables y las sesiones atípicas también cuentan. No se
  retiran sesiones a posteriori por producir errores grandes.

## Limitaciones de un backup retrospectivo

Las páginas, palabras y dificultad editadas hoy no prueban qué información había
cuando se realizó una sesión antigua. El protocolo predeterminado elimina esos
valores actuales y permite utilizar snapshots contemporáneos explícitos, como
`totalPagesAtSession` o `predictionFeatures`, cuando existen.

Tampoco se usa la dificultad subjetiva medida **después** de la sesión para
predecir esa misma sesión. Las dificultades observadas de sesiones anteriores
sí son evidencia disponible para el futuro.

Cuando existe volumen trabajado medido, se evalúa condicionalmente a ese volumen:
«¿cuánto habría previsto para estas páginas?». Ese dato puede conocerse al acabar
la sesión y no demuestra que el sistema supiese antes cuántas páginas se iban a
terminar. El resultado se identifica como evaluación condicionada al volumen.

Un backup tampoco reconstruye las ediciones o eliminaciones históricas. Los
resultados son una validación retrospectiva del snapshot disponible, no una
garantía prospectiva de precisión ni de memoria/retención.

Si el desarrollo se ajusta tras observar este benchmark, los siguientes resultados
siguen siendo una comprobación retrospectiva de desarrollo. La confirmación
independiente requiere sesiones posteriores que no hayan intervenido en esas
decisiones, aunque cada predicción de la simulación solo use su pasado.

## Ejecución local

```sh
node --require ./scripts/local-only-network.cjs --import tsx scripts/evaluate-estimator.ts
node --require ./scripts/local-only-network.cjs --import tsx scripts/evaluate-estimator.ts /ruta/privada/backup.json
```

Sin ruta se utilizan exclusivamente fixtures sintéticos. Con ruta se lee la
copia privada en memoria y se comprueba que permanezca intacta. No se importan
SDK Firebase, credenciales ni datos de producción; no se copian sesiones al
repositorio. El informe `.cache/evaluation/estimator-report.json` contiene solo
agregados, sin identificadores, fechas, títulos, notas ni filas individuales.

Si el modelo no mejora la referencia sobre las mismas observaciones, debe
informarse y revisar el enfoque. No se cambia la separación temporal, no se
descartan resultados desfavorables y no se elige retrospectivamente el mejor
modelo para cada fila utilizando su resultado real.

## Resultado vigente tras la revisión crítica del 13 de noviembre

La versión actual es `empirical-local-median-v6`. Se repitió la evaluación local
en modo de solo lectura: 302 registros válidos, 291 con referencia sencilla y
**0 pares evaluables del modelo actual**. Las revisiones conservadas en la copia
son posteriores a los pronósticos históricos y no están disponibles sus versiones
anteriores. El selector causal las excluye antes de entrenar, también dentro de
cada partición interna. La disponibilidad actual del modelo se calcula con el
historial disponible ahora; no se descarta el registro real de la aplicación.

Por tanto, los resultados de v5 que siguen se conservan como historial de
desarrollo y **no acreditan precisión de v6**. No se puede afirmar mejora frente
a la mediana con esta copia bajo el protocolo corregido. Se necesitan capturas
prospectivas y/o un registro de versiones para una evaluación válida. El archivo
permaneció intacto; el informe agregado está en
`.cache/evaluation/estimator-report.private.json`.

## Política implementada del estimador

La tabla histórica posterior corresponde a `empirical-local-median-v5`.

El estudio inicial aprende minutos por página exclusivamente de sesiones con
cantidad trabajada medida. Su tarea utiliza las páginas iniciales pendientes
conocidas, restando solapamientos de rangos; un repaso no reduce esas páginas.
Sin cobertura reconstruible se necesita indicar trabajo futuro explícito. El
cante utiliza sólo tiempos orales, incluidos sus segundos. Las fases PLSEMA se
desglosan sólo cuando se midieron, sin completar las ausentes con porcentajes.

En refresco y repaso la referencia inicial es la mediana empírica de esa
actividad. Si se solicitan páginas y existen cantidades históricas medidas,
la mediana se calcula en minutos por página y se escala al volumen solicitado.
Una mediana de sesiones con alcance desconocido no sirve para una tarea parcial.
No existen duraciones genéricas de población para sustituir datos ausentes.

Se comparan dos refinamientos: mediana por ordinal y mediana local ponderada
por historia del tema, recencia y variables observadas. La selección simula
hasta las doce observaciones anteriores con entrenamiento de días estrictamente
anteriores. Se requieren al menos cuatro predicciones válidas y que el candidato
no empeore ninguna mitad temporal y mejore al menos una. Un empate en la primera
mitad permite reconocer un cambio de rendimiento repetido en la segunda.
Si no demuestra ventaja, se conserva la referencia simple. Si la duración es
idéntica, se puede conservar la procedencia detallada del modelo local.

Un ordinal explícito conserva su número incluso si faltan las sesiones previas
de una serie importada. Se informa cuando se evaluó su efecto y no se demostró.
Sólo las cantidades de trabajo históricas medidas permiten validar aceleración
por ordinal: distintas duraciones con alcance desconocido podrían representar
distintas cantidades de trabajo. No se interpreta esa diferencia como aprendizaje.
La validación interna tampoco utiliza parámetros maestros actuales como si
hubieran existido en el pasado; exige snapshots históricos para esas variables.

El ritmo aprendido conserva precisión sin redondear. Por ejemplo, 0,3 minutos
observados en seis páginas producen 0,05 min/página, sin imponer un mínimo de
un minuto por página. La duración visible se redondea para la agenda sin
modificar ese ritmo aprendido. Este ritmo sigue disponible cuando el estudio
inicial está completo; su tarea pendiente continúa siendo de cero páginas.
Las duraciones ausentes, no finitas, no positivas o superiores a 24 horas no
entrenan ritmos. Los datos originales permanecen intactos.

## Resultado local del 8 de noviembre de 2026

La copia privada se abrió sólo para lectura en memoria. Se comprobó la igualdad
de su SHA-256 antes y después; no se accedió a Firebase ni a red. Sólo se guardaron
agregados en `.cache/evaluation/estimator-report.private.json`, ignorado por Git.
El script también registra métricas agregadas por decisión del selector, sin
identificadores, fechas de sesión, títulos, notas ni filas individuales.

Se encontraron 302 sesiones válidas, sin duplicados de identificador ni registros
inválidos para este protocolo. Once no tenían una referencia anterior y 39 no
permitían predecir estudio inicial con trabajo medido. Se compararon 252 de las
291 sesiones con referencia disponible (86,60%). Sólo nueve peticiones tenían
volumen objetivo medido; no se debe interpretar el resto como predicciones
demostradas de páginas o de temas completos.

| Actividad | Sesiones válidas | Pares evaluados | MAE modelo, min | MAE referencia, min | Cambio del MAE |
| --- | ---: | ---: | ---: | ---: | ---: |
| Estudio inicial | 48 | 8 | 64,63 | 150,63 | −57,09% |
| Refresco | 52 | 49 | 48,43 | 48,65 | −0,45% |
| Repaso | 25 | 24 | 52,50 | 55,44 | −5,30% |
| Cante | 177 | 171 | 2,36 | 3,08 | −23,38% |
| Total | 302 | 252 | 18,07 | 21,61 | −16,38% |

Las comparaciones utilizan exactamente los mismos pares por fila. El MAE de
36,34 minutos de la referencia sobre sus 291 casos disponibles corresponde a
otra población y no se compara con el MAE del modelo sobre 252 casos.

La mediana global del error absoluto fue 2,80 frente a 3,88 minutos y el MAPE
36,46% frente a 44,94%. La cobertura de los intervalos fue 93,25%, con anchura
media de 98,40 minutos. En estudio, sólo ocho pares y una anchura media de
619,50 minutos impiden afirmar una predicción precisa. En refresco la mejora
de MAE es mínima y su mediana de error empeora de 37,50 a 41,00 minutos. No hay
evidencia suficiente de una mejora práctica general para esa actividad.

La prueba sintética separada tiene doce sesiones y siete pares: MAE 5,50 frente
a 6,64 minutos. Su MAPE empeora de 36,48% a 38,67%. Es una comprobación
reproducible del funcionamiento, con una muestra demasiado pequeña para
establecer precisión en uso real.

## Fallos encontrados y corregidos durante la evaluación

El selector anterior podía reemplazar un ordinal solicitado por una mediana
global sin explicarlo, descartar cambios recientes porque la primera mitad
temporal empataba y sustituir procedencia, PLSEMA y soporte efectivo aunque las
duraciones coincidieran. La primera corrección de ordinales dejó pasar modelos
locales escasos sin validar; otra variante aceptaba medianas por ordinal con
alcance histórico desconocido. Ambas dieron resultados desfavorables que se
investigaron, sin eliminar sus observaciones del benchmark.

El diagnóstico agregado identificó que parte de la aparente aceleración por
ordinal procedía de sesiones sin cantidad medida. La política final exige
validación causal y unidades comparables; conserva una mediana sencilla de
duración cuando no se puede separar rendimiento de cantidad trabajada.
Estos ajustes se desarrollaron observando el benchmark retrospectivo. Por ello
su mejora final necesita confirmación con futuras sesiones no utilizadas en
este desarrollo, aunque cada selección simulada sólo consulte su pasado.

## Pruebas y límites pendientes

Se ejecutaron 60 pruebas automatizadas del núcleo de estimación, su integración
con Temario/planificador, planificación semanal, evaluación temporal y ritmos
históricos. Todas pasaron. Incluyen rangos parciales solapados, páginas pendientes,
ordinales explícitos de series incompletas, ausencia de efecto con alcance no
medido, cambios recientes, elección de referencia para una preferencia local
sin validar, datos vacíos, duplicados, segundos orales, fases PLSEMA ausentes,
ritmos inferiores a un minuto y ausencia de mutaciones de los registros.

```sh
node --require ./scripts/local-only-network.cjs --import tsx --test \
  tests/personalizedEstimator.test.ts tests/estimatorIntegration.test.ts \
  tests/weeklyEstimator.test.ts tests/estimationEvaluation.test.ts \
  tests/learningConsistency.test.ts
```

Las dos pruebas antiguas de consistencia que imponían multiplicadores fijos de
Ebbinghaus y de nota oral se actualizaron para comprobar invariancia al orden,
separación de actividades y ausencia de una duración de repaso inventada con
sólo cantes. Una nota oral no equivale a minutos reales de repaso.

Queda obtener cobertura medida en las sesiones futuras, snapshots de parámetros
al planificar, y validación prospectiva de errores e intervalos por actividad.
La mayoría de los resultados disponibles son orales; el agregado no demuestra
la misma calidad para estudio, refresco y repaso. No se necesita modificar ni
migrar los registros privados para ejecutar estas pruebas.
