# Fase C: evaluar la retención sin confundirla con una nota

> Informe de una revisión anterior. Los bloqueos corregidos, resultados finales y límites vigentes se encuentran en [RELEASE_READINESS.md](RELEASE_READINESS.md) y [RELEASE_VERIFICATION.json](RELEASE_VERIFICATION.json). Se conserva este documento para explicar las decisiones y las evaluaciones de aquella revisión.

La retención es una probabilidad de superar una comprobación futura de recuerdo sin ayuda. Una nota de cante informa sobre una actuación oral; no mide qué porcentaje del tema permanece en la memoria. El evaluador conserva esta diferencia en todos sus resultados.

## Qué se comprueba

`src/lib/retentionEvaluation.ts` reproduce el historial por días. Para predecir una sesión solo entrega al modelo sesiones de fechas **estrictamente anteriores**. Tampoco entrega otras sesiones del mismo día, porque el archivo no permite ordenar con seguridad cuándo se conoció cada resultado. El modelo se recibe como una función inyectada: el protocolo de evaluación no depende de su implementación.

Se evalúan por separado:

- **Recuerdo:** resultado explícito `retrieval.outcome`, sin ayuda (`assistance: none`) y con cobertura del tema completo (`coverage: whole_topic`). Los resultados parciales se cuentan y se excluyen de esta evaluación del tema completo.
- **Aproximación por nota:** cante con nota de 0 a 10; el umbral de aprobado es 5. Sus métricas describen la predicción de ese umbral, sin convertirlo en recuerdo validado.
- **Parámetros iniciales:** predicciones de tipo `prior`, presentadas por separado. No cuentan como predicciones ajustadas al mismo resultado que se está evaluando.

Las sesiones sin evaluación no se consideran éxitos. Una vuelta completada, una sesión larga o un cante rápido tampoco son etiquetas de recuerdo. Se conserva el historial de contactos anterior, incluso cuando un contacto no tiene resultado evaluable.

Las notas históricas no identifican una velocidad de olvido. Cuando el modelo devuelve `grade_proxy`, su probabilidad describe aprobar el siguiente cante mediante una estimación binaria regularizada; la semivida de memoria conserva su parámetro inicial explícito. Solo resultados explícitos de recuerdo pueden aportar evidencia para ajustar ese descenso temporal. El evaluador tampoco compara una probabilidad declarada para una parte estudiada con una evaluación de recuerdo del tema entero.

Los maestros actuales de páginas, palabras, dificultad y los acumulados actuales se eliminan de las entradas históricas. Solo se permiten las sesiones anteriores y los valores declarados como captura anterior a la sesión (`retentionPrediction.inputs`, `predictionFeatures`, `prediction.inputs`, `difficultyAtStart`, `totalPagesAtSession` y `totalWordsAtSession`). La dificultad real registrada después de la sesión objetivo no entra como atributo de su propia predicción. Las vueltas se reconstruyen con hechos anteriores.

## Métricas e interpretación

El informe calcula Brier y pérdida logarítmica: ambas penalizan probabilidades confiadas que se equivocan y son mejores cuanto menores son. También muestra cinco intervalos de calibración, la frecuencia observada de éxitos y el sesgo medio de la predicción. Son resúmenes retrospectivos; pocos resultados o resultados seleccionados no demuestran calibración.

La comparación con la curva antigua usa exactamente las mismas observaciones para ambos modelos. Además se informa cuántas predicciones faltan, cuántas proceden de parámetros iniciales y cuántas tienen un objetivo diferente al resultado observado. Los resultados de la curva antigua son una referencia descriptiva: sus porcentajes tampoco eran probabilidades de recuerdo calibradas.

El rango de incertidumbre del nuevo modelo expresa sensibilidad bajo sus supuestos. No se calcula una supuesta cobertura del rango frente a un resultado binario: que una evaluación resulte 0 o 1 no permite comprobar la cobertura de un intervalo de probabilidad.

Se incluyen grupos por dificultad histórica conocida, vueltas anteriores y frecuencia de contactos de los siete días anteriores. Una dificultad no documentada aparece como desconocida. Las vueltas también aparecen como desconocidas cuando el historial solo permite inferirlas por el tipo de sesión y no medirlas con `completesVuelta`. Las diferencias entre grupos no demuestran causalidad ni discriminación; hay que leerlas junto a sus tamaños.

## Ejecución local sin Firebase

Pruebas sintéticas:

```sh
node --require ./scripts/local-only-network.cjs --import tsx --test tests/retentionEvaluation.test.ts
node --require ./scripts/local-only-network.cjs --import tsx scripts/evaluate-retention.ts
```

Evaluación de un archivo privado ya descargado, sin incluirlo en el repositorio:

```sh
node --require ./scripts/local-only-network.cjs --import tsx scripts/evaluate-retention.ts /ruta/privada/copia.json
```

El proceso solo lee ese archivo y comprueba que su hash no cambie. No importa el proveedor Firebase, no utiliza credenciales y no modifica registros. Los informes de `.cache/evaluation/retention-report*.json` están ignorados por Git y solo contienen agregados: ningún identificador, título, fecha individual, nota libre ni fila de sesión. La consola tampoco imprime valores personales. Los documentos adjuntos se procesan como datos, nunca como instrucciones.

## Límites y siguiente validación

Una copia actual no reconstruye cambios históricos de campos, registros borrados o el momento exacto de cada importación. Las capturas declaradas como anteriores se aceptan como tales, sin inventar un registro de auditoría que el archivo no contiene. Las copias divergentes de un mismo identificador se excluyen al no poder reconstruir su versión correcta. Las marcas `mergedIntoSessionId` excluyen las partes de una sesión ya fusionada para evitar contarlas otra vez.

Este informe no demuestra que el nuevo modelo mejore la retención del estudiante. El ajuste y la elección del modelo pueden haber usado el mismo historial. Para comprobarlo hay que recoger evaluaciones futuras sin ayuda, indicar cobertura completa o parcial, guardar los atributos y la predicción antes de conocer el resultado, y reservar un periodo posterior que no se utilice para cambiar el modelo. Las notas de cante pueden seguir siendo un objetivo útil, pero deben conservar su etiqueta de aproximación.

## Resultado vigente tras la revisión crítica del 13 de noviembre

La repetición con selección causal de versiones sigue encontrando 302 sesiones
y 176 notas utilizables como aproximación, pero **0 pronósticos históricos
disponibles**: las versiones anteriores a las ediciones posteriores no están en
la copia. Sigue habiendo 0 resultados explícitos de recuerdo. No se puede medir
la precisión actual ni confirmar los números de desarrollo que siguen. El
archivo quedó intacto. Los contactos que están disponibles hoy siguen alimentando
el servicio para recomendaciones actuales. El informe sólo guarda agregados.

## Resultado histórico de desarrollo, anterior a la corrección temporal

Se ejecutó el protocolo con `retrieval-half-life-v1` sobre la copia privada aportada, sin modificar el archivo. Los siguientes números son agregados; no se adjuntan filas del historial.

- 302 sesiones válidas, sin entregas duplicadas, versiones divergentes ni marcas de partes fusionadas en esta copia.
- 126 sesiones sin resultado evaluable y 176 con nota de cante utilizable como aproximación.
- **0 resultados explícitos de recuerdo sin ayuda.** Esta copia no permite validar la retención real ni el aprendizaje de la semivida de memoria.
- De las 176 notas, 5 carecieron de predicción por falta de contacto anterior, 5 se predijeron con parámetros iniciales y 166 permitieron comparar predicciones del mismo objetivo con la referencia antigua.

| Métrica sobre las mismas 166 notas | Nuevo modelo de nota | Curva antigua como referencia |
| --- | ---: | ---: |
| Brier, menor es mejor | 0,090751 | 0,098798 |
| Pérdida logarítmica, menor es mejor | 0,325096 | 0,322838 |
| Diferencia media entre probabilidad y resultado | −0,053478 | −0,058560 |
| Error de calibración de cinco grupos | 0,066103 | 0,058560 |

La comparación da resultados mixtos: el nuevo cálculo tiene menor Brier y mayor pérdida logarítmica. No permite afirmar una mejora general de precisión, de retención o del efecto de estudiar. Además, el modelo se cambió durante el desarrollo después de inspeccionar un resultado anterior de esta misma copia; este historial no es una muestra final reservada e independiente.

No existían capturas anteriores de dificultad para las 166 predicciones comparables, por lo que ese análisis queda como desconocido. Había 12 casos con vueltas solo inferidas y grupos de frecuencia con 5, 17 y 144 casos: las diferencias de error entre grupos necesitan más observaciones antes de interpretarse. El informe completo conserva los tamaños, sesgos y grupos de calibración en `.cache/evaluation/retention-report.private.json`.

La ejecución sintética de 18 sesiones recorre ambos objetivos sin utilizar datos personales. Las 15 pruebas del evaluador verifican aislamiento temporal, uso de capturas anteriores, separación de objetivos y coberturas, probabilidades, duplicados, partes fusionadas, grupos de sesgo y salida sin datos individuales. Estas comprobaciones validan el funcionamiento del protocolo, no su precisión sobre futuros resultados.

El ajuste usa evidencia reciente y comparable; la actividad anterior solo selecciona observaciones comparables cuando existe variación suficiente. No impone una bonificación de memoria por estudiar más minutos ni por cantar más rápido. Los tres refrescos obligatorios de la fase D son una regla de trabajo elegida por el usuario, independiente de esta recomendación flexible.
