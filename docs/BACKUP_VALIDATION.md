# Validación local con el backup aportado

> Informe de una revisión anterior. Los bloqueos corregidos, resultados finales y límites vigentes se encuentran en [RELEASE_READINESS.md](RELEASE_READINESS.md) y [RELEASE_VERIFICATION.json](RELEASE_VERIFICATION.json). Se conserva este documento para explicar las decisiones y las evaluaciones de aquella revisión.

Se probó una copia privada del backup del 7 de noviembre de 2026. Contiene 29
fichas de progreso y 302 sesiones de 28 temas. No se conectó con Firebase de
producción, no se usaron credenciales privadas ni se modificó el archivo original.
El backup no se incluye entre los archivos del repositorio.

## Fallos reproducidos y corregidos

| Comprobación con la copia en memoria | Antes | Después |
| --- | ---: | ---: |
| Sesiones asociadas a más de una materia/tema | 302 | 0 |
| Temas sin datos recomendados como repasos | 301 | 0 |
| Temas cuya estimación dependía del orden de entrega de sesiones | 22 | 0 |
| Temas listos para cantar sin tres días registrados de refresco | 1 | 0 |
| Discrepancias de ciclo al pasar historial global frente a historial filtrado | 73 | 0 |

La identidad completa del tema prevalece sobre números sueltos, títulos o notas.
Los identificadores históricos numéricos sin materia son ambiguos: no se les
asigna automáticamente una materia. Se conservan los registros originales.

Los ritmos usan las páginas trabajadas cuando están medidas, y sumar varias
exposiciones ya no equivale a tratar todo el historial como un único repaso.
Las páginas desconocidas siguen siendo desconocidas. Los límites arbitrarios
que excluían sesiones válidas de 600 minutos o recortaban ritmos personales se
han retirado; se mantienen validaciones de números y duración.

No se muestra precisión ni proporción PLSEMA cuando faltan observaciones. El
registro rápido ahora pide minutos reales y permite indicar expresamente si se
completó una vuelta. Conserva la estimación separada para evaluaciones futuras.
Las tareas del planificador guardan su vínculo con la sesión, tiempo medido,
fecha real, rango de páginas y segundos del cante.

Se han retirado las purgas y deduplicaciones automáticas del inicio de sesión y
las heurísticas destructivas de las suscripciones. Dos IDs distintos con igual
duración y fecha no se ocultan como si estuviera probado que son duplicados.
Las herramientas de mantenimiento explícitas no se han ejecutado.

## Exportación e importación

El formato v2 incluye progreso, sesiones, documentos de ajustes y cuarentena. La
exportación considera ambas bases que combina la interfaz. La importación
valida el archivo completo antes de escribir, conserva IDs y campos históricos,
restaura Timestamp y asigna los documentos al usuario local que realiza la
importación. Reimportar no añade IDs aleatorios. No elimina registros ajenos a
la copia; para archivos grandes puede requerir varios lotes y no constituye una
transacción global entre lotes.

El backup aportado no incluye ajustes de planificación, cuarentena ni PLSEMA.
No se han inventado ni reconstruido esos datos ausentes. Se conserva una
discrepancia histórica de vueltas y se avisa de ella, sin decidir automáticamente
que un registro del usuario sea erróneo. Las diferencias entre horas efectivas
redondeadas y minutos tampoco se corrigen silenciosamente.

## Pruebas realizadas

- Pruebas puras de identidad, cronología, cálculo, páginas parciales, telemetría,
  importación, parámetros observados y aislamiento de red.
- 29 comprobaciones del flujo de validación del backup, sin pruebas omitidas.
- Chromium con las pantallas reales y el proveedor real de la aplicación:
  planificador semanal, Temario, ficha/historial/cantes, Dashboard y respaldo.
- Exportación preservando todos los campos originales; reimportación sin
  duplicados, Timestamp restaurados y archivo inválido rechazado sin escrituras.
- Registro por formulario de 23 minutos reales, actualización de horas del tema
  sin sumar una vuelta no completada y conservación del historial anterior.
- Cante de 12:30 con nota, vínculo y tiempo real de tarea; rechazo de una segunda
  sesión para la misma tarea. Al recargar se recupera la copia original.
- Cero solicitudes fuera del servidor local y cero errores no controlados del
  navegador. Se verifica la integridad del archivo antes y después.

El navegador usa un transporte SDK **en memoria**, identificado expresamente en
el informe. No es Firestore Emulator ni prueba las reglas, la concurrencia o la
durabilidad de Firebase. En una comprobación separada del 13 de noviembre ya
pasaron las 9 pruebas con SDK real de Auth/Firestore Emulator y datos sintéticos.
No se cargó la copia privada en el emulador. No se publicó ni desplegó nada.

El servicio de retención está unificado, pero su calibración real sigue pendiente.
Estas pruebas no demuestran una probabilidad real de recuerdo ni certifican todos
los flujos posibles. Los resultados históricos de esta página describen aquella
comprobación; véase `FINAL_CRITICAL_REVIEW.md` para las verificaciones actuales.

## Repetir las pruebas

```sh
npm test
npm run test:backup -- /ruta/privada/al/backup.json
npm run lint
npm run build
```

`test:backup` ejecuta comprobaciones sobre el archivo y las pantallas reales en
un navegador nuevo. El fichero se sirve únicamente desde Vite en loopback; no
se incorpora a la compilación. El informe local en
`.cache/backup-replay/browser-report.json` contiene solo resultados agregados,
sin sesiones, notas, identificadores de usuario ni credenciales.
