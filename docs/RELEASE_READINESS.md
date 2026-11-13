# Wells Prep: resultado de las correcciones finales

Revisión del 13 de noviembre de 2026. **Código preparado para revisión e integración; publicación real condicionada a la configuración y al ensayo remoto indicados abajo.** No se ha desplegado, migrado ni accedido a Firebase de producción.

Este documento sustituye el diagnóstico anterior de cinco regresiones y API pública sin protección. Los resultados reproducibles están en `RELEASE_VERIFICATION.json`; el inventario de archivos, en `RELEASE_CHANGE_INVENTORY.md`. Los informes de fases anteriores describen su momento de ejecución y no sustituyen esta verificación final.

## Correcciones comprobadas

| Bloqueo anterior | Corrección |
| --- | --- |
| Refresco con solo las páginas del último bloque | Al completar la cobertura inicial, el refresco abarca la extensión completa del tema. |
| Tarea parcial iniciaba el protocolo de finalización | Se exige cobertura inicial completa. Repasar no convierte páginas pendientes en estudiadas. |
| Sesión futura completaba el tema en unas vistas y en otras no | Canonicalización, estimadores y retención comparten el criterio temporal. El formulario rechaza fechas futuras; el historial conservado no se borra. |
| Tarea seguía enlazada a una sesión editada de otro tema o actividad | Se comprueba la identidad y actividad del vínculo y se eliminan los minutos reales y estados engañosos del vínculo inválido. |
| Cambio de día perdía parámetros personales de retención | Se conserva el contexto de política e historial al caducar la caché. Las vistas se recalculan al cambiar de día y al volver a una pestaña suspendida. |

Las cinco aserciones originales de `scripts/release-regression-probes.ts` se conservaron y ahora se ejecutan también mediante `npm test`. Se añadieron regresiones de fechas locales y alias históricos: un número sin materia no se transforma arbitrariamente en Constitucional y el documento maestro canónico prevalece sobre su alias.

## Seguridad y persistencia

- El backend se compila en `build/server.cjs`, fuera de `dist`. La carpeta pública sirve una lista limitada de archivos. Código, mapas, `.env`, configuración JSON y `uploads` responden 404.
- Leer, modificar, borrar, consultar salud privada, abrir SSE o importar PDF exige un ID token válido de Firebase y aplica el UID autenticado. El token externo de AeroFocus solo permite ingresar eventos para su propietario registrado; no permite leer el historial.
- Se retiró el token compartido del código. La credencial personal se genera en el servidor, se registra mediante hash y puede rotarse. Una instalación externa debe sustituir el token antiguo; el código no modifica otros servicios ni elimina secretos de su historial Git.
- AeroFocus utiliza `users/{uid}/quarantine` en Firestore como almacenamiento común. No depende de archivos locales ni de la memoria de una instancia. Las transacciones evitan duplicados y rechazan contenidos contradictorios con el mismo identificador. Credenciales y cuotas son compartidas entre instancias.
- Se verificaron reinicio de conexión, dos instancias concurrentes, aislamiento entre usuarios y reglas negativas con Auth y Firestore reales **emulados**. Las implementaciones HTTP antiguas de `api/` y `app/api/` devuelven 410; el runtime admitido es Express.
- PDF: autenticación previa, límite de tamaño, almacenamiento en memoria, cuota por usuario y manejo de errores. No se ha llamado a Gemini con un PDF real ni certificado su modelo externo.
- Reglas: las rutas UID mantienen aislamiento. Las rutas raíz antiguas solo admiten propietario UID explícito y coherente; no se permite apropiarse de registros sin dueño o cambiar de dueño. Las colecciones internas del servidor no son accesibles desde el SDK cliente.

## Verificaciones

| Comprobación final | Resultado |
| --- | --- |
| Núcleo (`npm test`) | 321/321, incluidas las cinco regresiones originales |
| Auth/Firestore/backend reales emulados | 15/15 y recorrido navegador → Express → Firebase local |
| Compatibilidad de la copia privada | 5/5, archivo sin cambios |
| Navegador A / Provider / D | 6 / 14 / 6 comprobaciones y aserción de precedencia de alias |
| Interfaz E | 29 comprobaciones, 40 capturas, 320/390/768/1440 px; cero errores JS y solicitudes externas |
| TypeScript y compilación | Correctos en modo local y remoto; no se arrancó contra Firebase remoto |
| Docker compilado sin red | Arranque correcto, UID 1000, 11 rutas verificadas, sin herramientas de desarrollo |
| Dependencias de producción / desarrollo | 0 avisos / 19 moderados; 0 altos y críticos en ambos |

No quedan pruebas funcionales fallidas en estos recorridos. La auditoría del árbol completo termina con salida 1 por los avisos de desarrollo descritos abajo.

Los números finales, comandos, alcance y resultados se guardan en `RELEASE_VERIFICATION.json`. Las pruebas de navegador con replay verifican interfaz y Provider; las de emuladores verifican persistencia y permisos reales locales. Ninguna de ellas certifica permisos ya desplegados en tu proyecto real.

La comprobación de la copia privada es de solo lectura: 302 sesiones y 29 fichas del archivo aportado. Su hash se comprueba antes y después. No es un inventario completo de producción ni se importó a Firebase.

La evaluación de precisión tiene un límite independiente de la corrección del software: faltan resultados de recuperación y predicciones históricas comparables del modelo actual para afirmar una mejora medida. No se presenta la retención estimada como memoria observada.

## Dependencias

`npm audit --omit=dev`: **0 vulnerabilidades conocidas en el árbol de producción** en la comprobación registrada. Se actualizaron Firebase, Admin SDK, multer, Vite y dependencias transitivas mediante versiones compatibles y un lockfile probado.

El árbol completo conserva **19 avisos moderados**, sin altos ni críticos. Proceden de herramientas de desarrollo, principalmente `firebase-tools` y sus dependencias de CLI/ESLint: OpenTelemetry Baggage, glob/minimatch, uuid y las cadenas que los incluyen. No se instalan en la imagen de ejecución (`npm ci --omit=dev`). No se forzaron cambios de versión mayor para ocultarlos. No usar la CLI de pruebas como servicio público; revisar nuevas versiones antes de la siguiente entrega. Una auditoría es una foto de avisos conocidos, no una garantía permanente de ausencia de vulnerabilidades.

## Firebase: compatibilidad y cambios externos

No hay migración destructiva ni reescritura masiva requerida para las rutas activas `users/{uid}`. Los modelos siguen leyendo registros antiguos, mantienen minutos y segundos separados y dejan desconocidos los rangos que un porcentaje histórico no permite reconstruir.

Cambios aditivos del backend:

- `users/{uid}/quarantine`: cola compartida existente, con propietario e identificador estable.
- `users/{uid}/aerofocusAnalytics/latest`: resumen de importación.
- `_aerofocusCredentials` y `_aerofocusCredentialsByUser`: registro privado de hashes y propietario.
- `_serverQuotas/{uid}/days/{bucket}`: cuotas transaccionales del servidor.

No se ha identificado un nuevo índice compuesto obligatorio: las consultas nuevas se limitan a rutas de un usuario o accesos por documento. Conservar los índices existentes y comprobar las consultas en el proyecto remoto de pruebas.

**Antes de producción:** inventariar ambas bases y sus propietarios, ensayar las reglas nuevas y aplicarlas expresamente a las bases utilizadas. Registros raíz sin UID o bajo un correo requieren conciliación aparte y aprobación previa; las reglas seguras no los reasignan por similitud. Un problema de permisos no debe resolverse abriendo toda la base.

El servidor remoto necesita una identidad administrada con permisos de datos Firestore y consulta de usuarios Auth para verificar revocaciones. No subir claves JSON de administrador. Proyecto y base del servidor deben coincidir con `firebase-applet-config.json`; el arranque rechaza discrepancias.

## Pendiente antes de autorizar la publicación

1. Revisar la rama/PR y ejecutar el mismo commit en un proyecto Firebase remoto **de pruebas**, con datos sintéticos y dos cuentas.
2. Configurar identidad del servidor, dominios Auth, secretos opcionales y credencial externa de AeroFocus; probar su integración real y el reinicio del servicio.
3. Conservar respaldo/exportación de las bases y reglas reales. Revisar UID y rutas históricas antes de aplicar reglas; no importar el backup para actualizar el código.
4. Confirmar manualmente la configuración del proyecto real, construir el cliente en modo remoto y desplegar solo después de aprobación. Retirar los despliegues antiguos que sigan exponiendo la API insegura.

La imagen local y los emuladores no prueban OAuth de Google en un dominio publicado, IAM remoto, Gemini, las reglas desplegadas ni la interfaz de importación de tu cuenta de AI Studio. Permanece una advertencia de tamaño del bundle inicial; es una optimización pendiente, no se oculta como prueba fallida.

La guía exacta de continuidad es `GOOGLE_AI_STUDIO_RELEASE_GUIDE.md`. No se recomienda conectar directamente esta primera vista previa a tus registros para probarla.


## Entrega en GitHub

Rama subida: [release/wells-prep-production-fixes](https://github.com/aasalva2004b-oss/wellsprep/tree/release/wells-prep-production-fixes). El intento automático de crear la PR fue rechazado con `Forbidden`, tanto por GraphQL como por REST; no se afirma que la PR exista. [Abrir la comparación y crear la PR](https://github.com/aasalva2004b-oss/wellsprep/compare/main...release/wells-prep-production-fixes?expand=1), usando `PULL_REQUEST_BODY.md` como descripción. Seleccionar `main` como base y conservar la revisión manual. No se fusionó ni desplegó.
