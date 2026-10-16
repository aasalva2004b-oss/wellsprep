# Plan Maestro: Vinculación Integral de Google Firebase, Cuarentena AeroFocus y Rendimiento Supremo

Plan de ingeniería integral para diagnosticar y solucionar la vinculación de datos históricos de la cuenta de Google (Firebase), purgar y poner en cuarentena estricta la sincronización con AeroFocus, preservar el registro manual de cantes y blindar el estado de Wellsprep Judicatura con rendimiento de latencia cero y cero re-renders innecesarios.

> [!IMPORTANT]
> **Decisiones Críticas Confirmadas con el Usuario**:
> - **AeroFocus Pro en Cuarentena**: Desactivado por defecto. Ningún evento externo alterará el temario sin aprobación manual explícita en modo prueba/beta.
> - **Datos Históricos Esenciales**: Tolerancia cero a pérdida de datos. Diagnóstico exhaustivo y vinculación profunda de todas las colecciones, bases de datos (`defaultDb` y base nombrada) y esquemas previos asociados a la cuenta de Google.
> - **Registro Manual de Cantes Conservado**: Se eliminó la interfaz intrusiva de cronómetro de cante (el usuario usa su propio cronómetro físico), pero se mantiene al 100% el tipo de sesión "Cante" en el editor y registro manual de sesiones.

---

## 1. Diagnóstico de Errores y Matriz de Soluciones

| # | Causa Raíz del Error Detectado | Impacto en la App | Solución de Ingeniería Suprema |
|---|---|---|---|
| **E1** | **Divergencia Multi-Base de Datos en Firestore** (`(default)` vs Base Nombrada `ai-studio-remixopotrackerj-...`) | Los datos guardados hace meses se registraron en la instancia por defecto `(default)` o viceversa; la app actual solo escuchaba activamente la base de datos nombrada. | **Multi-Database Deep Linker**: Escaneo cruzado sistemático y reactivo de ambas instancias (`defaultDb` y `namedDb`). Detección automática y migración transparente de documentos de progreso y sesiones sin sobreescritura destructiva. |
| **E2** | **Desplazamiento de Esquemas de Colecciones** (`/users/{uid}/*` vs `/progress`, `/sessions`, `/study_sessions`) | Versiones anteriores almacenaban documentos en la raíz o con identificadores `${uid}_${topicId}` o `study_sessions`. Los queries actuales fallaban al no encontrar rutas canónicas modernas. | **Bridge de Esquemas Históricos**: Búsqueda universal que explora subcolecciones de usuario y colecciones raíz históricas con normalización de claves (`userId`, `user_id`, `topicId`). |
| **E3** | **Silenciado de Excepciones y Permisos Firestore** (`try { ... } catch { // ignore }`) | Si una consulta histórica arrojaba un error de permisos o de índice ausente, el código previo capturaba el error y continuaba en silencio sin alertar al usuario. | **Diagnóstico Transparente y Auditoría Visual**: Panel de telemetría de cuenta donde el usuario puede ver exactamente qué colecciones existen, recuento de documentos detectados y botón de sincronización forzada con feedback detallado. |
| **E4** | **Reglas de Seguridad Restrictivas para Consultas Raíz** | Reglas con validación estricta de campos impedían a usuarios autenticados listar colecciones legadas que carecían de ciertos metadatos obligatorios modernos. | **Reglas Fortalecidas**: Actualización y despliegue de `firestore.rules` que permiten lectura/escritura unívoca del propietario para sus colecciones históricas y modernas. |
| **E5** | **Código Heredado Erróneo de "Migración Mercantil → Constitucional"** | Un script erróneo intentaba transformar temas `mercantil-*` en `constitucional-*`, generando discordancia con el temario real de Derecho Mercantil (17 temas). | **Erradicación del Script y Blindaje de Temario**: Supresión total de mutaciones destructivas entre materias. Auditoría de integridad para temas mercantiles y constitucionales. |
| **E6** | **Contaminación y Descuadre de Horas por AeroFocus** | Webhooks automáticos inyectaban vuelos directamente en las sesiones del usuario, distorsionando tiempos acumulados, vueltas y algoritmos SRS. | **Purga Profunda y Cuarentena Beta**: Eliminación total de sesiones marcadas con `source: 'aerofocus'` o `flightId`, recálculo idempotente de vueltas y horas por tema, y desactivación del webhook automático (modo prueba en cuarentena aislado en Ajustes). |
| **E7** | **Invasión del Módulo CantoStudio** | Elementos visuales del cronómetro de cante recargaban la vista de temario cuando el opositor ya dispone de cronómetro propio. | **Limpieza Quirúrgica**: Conservación exclusiva del selector `type: "canto"` en el modal de registro manual de sesiones, eliminando botones redundantes de cronómetro. |

---

## 2. Experiencia de Usuario & Arquitectura Visual

### Flujos Principales
1. **Detección Automática y Vinculación al Iniciar Sesión con Google**:
   - Al autenticarse, Wellsprep consulta en paralelo los registros de la base actual y las posibles fuentes históricas.
   - Si detecta sesiones o progresos previos huérfanos o en la base secundaria, muestra un toast elegante con el recuento exacto de temas y sesiones restauradas.
2. **Consola de Estado y Diagnóstico de Cuenta en Ajustes**:
   - Tarjeta minimalista de estado de sincronización Google: UID, email, número total de sesiones en la nube, número de temas con progreso activo y botón manual *"Escanear y Vincular Datos Históricos"*.
3. **Módulo AeroFocus en Cuarentena (Beta Opcional)**:
   - Interruptor *"Activar Sincronización AeroFocus (Modo Prueba)"* desmarcado por defecto.
   - Pestaña de pruebas aislada con simulación controlada y botón permanente *"Purgar Datos de AeroFocus"* con confirmación instantánea.
4. **Registro Manual de Sesiones Limpio y Completo**:
   - Selector de tipo de sesión: *Primer Estudio*, *Repaso*, *Refresco*, *Cante*, *Simulacro*.
   - Registro de tiempo medido con cronómetro externo (minutos y segundos), calificación del cante (1 a 10) y anotaciones de errores sin cronómetros intrusivos en pantalla.

### Sistema Visual (Apple Pro / SaaS Minimalista)
- **Superficies**: Acabado plano de alta legibilidad, fondo slate neutro (`#0F172A` en dark mode, blanco puro `#FFFFFF` y slate 50 en light mode) con bordes ultra-finos de 1px.
- **Disciplina Anti-Pill**: Metadatos (fechas, vueltas, número de tema) sin recuadros de píldora artificiales; tipografía unboxed con separadores tipográficos sutiles (`·`).
- **Tipografía**: Numerales tabulares monoespaciados (`tabular-nums font-mono`) para tiempos de estudio, fechas de repaso y contadores, garantizando alineación vertical perfecta sin salto de píxeles.

---

## 3. Decisiones de Producto y Filosofía Técnica

### Decisión 1: Sincronización Dual Silenciosa con Reintentos Idempotentes
- **Enfoque**: En lugar de confiar en una sola referencia de base de datos, el proveedor crea un cliente de enlace que consulta ambas instancias Firestore disponibles (`namedDb` y `defaultDb`) y consolida los datos bajo la estructura estándar `users/${uid}/*`.
- **Razón**: Garantiza que el usuario recupere el 100% de los datos que introdujo a lo largo de los meses, independientemente de qué versión de la app o base de datos utilizó en cada etapa.

### Decisión 2: Cuarentena Hermética de AeroFocus
- **Enfoque**: La recepción de webhooks en el backend solo almacena eventos en un registro de prueba temporal. No se crea ninguna sesión en el temario del usuario a menos que el usuario active voluntariamente el modo beta e importe manualmente el vuelo tras previsualizarlo.
- **Razón**: Protege la pureza de las estadísticas del opositor para la Judicatura (cómputo de horas reales de estudio y vueltas oficiales del temario).

### Decisión 3: Cero Re-renders Innecesarios & React Memoization
- **Enfoque**: Separación limpia entre estado de autenticación, mapa de progreso (`Record<string, TopicProgressData>`) y lista de sesiones. Uso de selectores memorizados (`useMemo`, `useCallback`) y componentes de fila memorizados para temarios de más de 300 temas.
- **Razón**: Fluidez inmediata a 60/120fps en listas extensas y cambios de filtro de materias sin tirones.

---

## 4. Arquitectura del Sistema

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Google Firebase Auth                            │
│                 (aalbertsalvapons@gmail.com / uid)                     │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   Wellsprep Firebase Data Linker                       │
│  ┌──────────────────────────────────┐ ┌─────────────────────────────┐  │
│  │ Named DB (ai-studio-remixopo...) │ │ Default DB ((default))      │  │
│  │ - users/{uid}/progress           │ │ - users/{uid}/progress      │  │
│  │ - users/{uid}/sessions           │ │ - users/{uid}/sessions      │  │
│  │ - /progress (legacy root)        │ │ - /study_sessions (legacy)  │  │
│  └─────────────────┬────────────────┘ └──────────────┬──────────────┘  │
│                    └────────────────┬────────────────┘                 │
│                                     ▼                                  │
│                 Consolidación Segura en Memoria & Local                │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         ▼                         ▼                         ▼
┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│ Temario Judicatura│     │  Sesiones & SRS  │     │ Cuarentena Aero  │
│ 323 Temas Reales │      │ Registro Manual  │     │ Modo Beta OFF    │
│ Civil, Penal,    │      │ Cante (cronómetro│     │ Purga garantizada│
│ Mercantil, etc.  │      │ externo), Repaso │     │ Staging aislado  │
└──────────────────┘      └──────────────────┘      └──────────────────┘
```

---

## 5. Plan de Ejecución Paso a Paso

1. **Blindaje de Firestore Rules (`firestore.rules`)**:
   - Ajustar las reglas de seguridad para garantizar acceso de lectura y escritura seguro tanto a las subcolecciones `users/{userId}/**` como a las colecciones legadas `/progress`, `/sessions` y `/study_sessions` para el usuario autenticado.
   - Desplegar las reglas con la herramienta oficial de Firebase (`deploy_firebase`).
2. **Motor de Recuperación y Vinculación Dual en `FirebaseProvider.tsx`**:
   - Reemplazar la función `recoverHistoricalUserData` con un algoritmo exhaustivo de detección multi-base y multi-ruta.
   - Eliminar definitivamente cualquier resto de migraciones destructivas no deseadas (como `migrateMercantilToConstitucional`).
   - Implementar un diagnóstico detallado con telemetría en tiempo real accesible desde la interfaz.
3. **Aislamiento y Cuarentena de AeroFocus**:
   - Desactivar la sincronización automática de webhooks por defecto (`aerofocus_auto_sync = false`).
   - Perfeccionar la función `purgeAllAeroFocusData` para que elimine de manera exhaustiva cualquier rastro de sesiones automáticas erróneas y recalcule al instante el tiempo real, vueltas y estado SRS de cada tema.
4. **Preservación y Pulido del Registro Manual de Cantes**:
   - Asegurar que en el modal de registro y edición de sesiones (`SessionEditorModal.tsx` / `EditSessionDialog.tsx`) el tipo *"canto"* esté disponible con inputs optimizados para minutos, segundos, nota y dificultad, sin componentes de cronómetro invasivos.
5. **Verificación de Compilación y Rendimiento**:
   - Ejecutar `compile_applet` para asegurar cero errores de tipos TypeScript y cero dependencias rotas.
   - Verificar la velocidad de renderizado y la persistencia de datos.
