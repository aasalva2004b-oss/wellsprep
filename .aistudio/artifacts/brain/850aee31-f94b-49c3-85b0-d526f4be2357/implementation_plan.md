# Plan de Implementación Maestro: Panel de Control de Sincronización, Auditoría y Reconciliación Retroactiva Anti-Errores

Un centro de control con arquitectura de grado aeronáutico para Wellsprep que otorga visibilidad total sobre los datos recibidos de **AeroFocus Pro**, permite editar cualquier sesión de estudio con recálculo retroactivo instantáneo, habilita la asignación posterior de dificultad (1-10), y proporciona un motor de reconciliación determinista ("Anti-Errores") que recalcula el progreso de cada tema a partir de su historial real de sesiones.

---

## 1. Arquitectura y Estrategia del Sistema

### Diagnóstico del Problema y Necesidad
1. **Incertidumbre en la ingesta automática**: Las sesiones se transmiten vía webhook desde AeroFocus Pro, pero el opositor necesita ver con total claridad qué payload llegó, qué temas se mapearon, cuándo y con qué duración exacta.
2. **Corrección de temas desalineados**: Si una sesión se asignó a un tema erróneo (por ejemplo, Tema 18 de Civil vs Tema 18 de Penal o por cambios en el programa de la oposición), el opositor debe poder reasignar el tema en caliente.
3. **Efecto retroactivo**: Al cambiar de tema, duración o modalidad de una sesión, no basta con editar el documento de la sesión; es imperativo **restar** las horas del tema antiguo y **sumarlas** al tema nuevo en `userProgress`, actualizando las vueltas y fechas de repaso.
4. **Asignación diferida de dificultad (1-10)**: AeroFocus registra pomodoros y horas efectivas, pero no conoce la percepción subjetiva de dificultad (1-10) del opositor. El sistema debe marcar las sesiones con dificultad pendiente y ofrecer un selector rápido (1-10) tanto en la lista como en el modal de edición, propagando la media armónica/ponderada al tema.
5. **Garantía Anti-Errores (Master Reconciliation)**: Para evitar cualquier discrepancia o drift acumulativo en Firestore, se implementa una función pura de reconciliación que recalcula desde cero el estado de todos los temas a partir del conjunto íntegro de sesiones existentes.

---

## 2. Modificaciones Propuestas

### A. Capa de Datos y Proveedor (`src/lib/FirebaseProvider.tsx` & `src/types.ts`)
- **Extensión del Modelo de Sesión**:
  - Garantizar campos enriquecidos en `Session`: `source` ('aerofocus' | 'manual'), `sourceFlightId` (para evitar duplicados), `dificultadReal` (1-10), `notes`, `modality` ('estudio' | 'repaso' | 'refresco' | 'canto').
- **Nuevas Funciones en `useFirebase`**:
  1. `updateStudySession(sessionId: string, updatedData: Partial<Session>, previousSession: Session)`:
     - Actualiza el documento en `users/${user.uid}/sessions/${sessionId}`.
     - Realiza el ajuste retroactivo: si cambia el `topicId`, resta las horas del tema anterior y suma al nuevo. Si cambia la duración o modalidad, ajusta la diferencia. Actualiza los contadores de dificultad.
  2. `deleteStudySession(sessionId: string, session: Session)`:
     - Elimina la sesión de Firestore.
     - Resta retroactivamente las horas y recalculación de vueltas del tema afectado.
  3. `reconcileAllTopicsAndSessions()` (Motor Anti-Errores):
     - Lee todas las sesiones de `users/${user.uid}/sessions`.
     - Agrupa por `topicId` y calcula: horas de estudio, horas de repaso, horas de refresco, número de vueltas, última fecha de estudio, y dificultad media real (1-10).
     - Actualiza en lote (`writeBatch` de Firestore) todos los documentos de `users/${user.uid}/progress` para garantizar consistencia del 100%.

### B. Componente Principal: `SyncControlCenterDialog.tsx`
Nuevo componente de diseño Apple/SaaS de alta densidad con:
1. **Barra de Métricas y Estado en Vivo**:
   - Sesiones totales sincronizadas vs manuales.
   - Horas totales auditadas (`font-mono tabular-nums`).
   - Sesiones pendientes de valorar dificultad (badge ámbar sutil).
   - Estado del webhook (Live / Inactivo).
2. **Filtros de Alta Velocidad**:
   - Búsqueda en tiempo real por título o número de tema.
   - Filtro por asignatura (Civil, Penal, Consti, etc.).
   - Filtro por estado: "Todas", "Pendientes de dificultad", "AeroFocus Pro", "Manuales".
   - Filtro por rango de fechas (Hoy, Esta semana, Este mes, Todo).
3. **Data Grid de Sesiones Auditadas**:
   - Columnas optimizadas: Fecha y Hora, Asignatura y Tema, Duración efectiva, Modalidad, Dificultad (con selector interactivo rápido 1-10), Origen (AeroFocus/Manual), Acciones (Editar, Reasignar, Eliminar).
4. **Pestaña de Logs del Webhook en Bruto**:
   - Historial de llamadas HTTP recibidas por el servidor con visualización del JSON enviado por AeroFocus Pro para verificación total.
5. **Botón Maestro "Reconciliar Todo"**:
   - Botón con confirmación y feedback inmediato que reconstruye el progreso de toda la oposición asegurando cero discrepancias.

### C. Modal de Edición y Reasignación: `EditSessionDialog.tsx`
- Selector visual de asignatura y tema con búsqueda integrada.
- Selector de modalidad de estudio ('estudio inicial', 'repaso', 'refresco', 'canto').
- Selector de dificultad del 1 al 10 con la escala visual oficial de Wellsprep.
- Control de duración (horas y minutos) y selector de fecha.
- Campo de notas y observaciones del preparador/cante.

### D. Puntos de Entrada e Integración en la Interfaz
1. **Cabecera Principal (`TemarioView.tsx`)**:
   - Botón en la barra superior junto al selector de vistas con icono de sincronización y badge indicador de sesiones sincronizadas o pendientes de dificultad.
2. **Menú Lateral / Perfil (`App.tsx`)**:
   - Acceso directo y estado en la navegación.
3. **Ajustes (`SettingsDialog.tsx`)**:
   - Botón prominente "Abrir Panel de Auditoría y Control de Sincronización" dentro de la pestaña de Webhook de AeroFocus Pro.

---

## 3. Plan de Verificación

1. **Pruebas de Sincronización y Simulación**:
   - Enviar payload de prueba mediante el endpoint `/api/webhook/test` o el botón de test en Ajustes.
   - Verificar que aparece de inmediato en el Panel de Control.
2. **Pruebas de Reasignación Retroactiva**:
   - Tomar una sesión de "Civil Tema 18" de 90 minutos y reasignarla a "Penal Tema 18".
   - Comprobar que en Civil 18 se restan los 90 minutos y en Penal 18 se suman los 90 minutos de forma instantánea.
3. **Prueba de Asignación Diferida de Dificultad**:
   - Asignar una dificultad de 8/10 a una sesión recibida sin dificultad.
   - Comprobar que la sesión y el tema actualizan su dificultad media.
4. **Prueba de Reconciliación Total**:
   - Ejecutar el botón "Reconciliar Todo" y validar que todos los temas coinciden con la suma exacta de sus sesiones.
5. **Verificación de Compilación y Rendimiento**:
   - Ejecutar `compile_applet` para asegurar ausencia de errores de TypeScript o empaquetado.
