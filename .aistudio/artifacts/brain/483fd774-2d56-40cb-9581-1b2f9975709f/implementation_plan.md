# Centro de Control de Estudio · AeroFocus Pro: Cuarentena Inteligente y Edición de Precisión

Optimización profunda del Centro de Control de Estudio para convertir la recepción de sesiones de AeroFocus Pro en un flujo continuo, elegante y sin fricción, con auto-asignación inteligente de temas, edición rápida de vueltas y dificultades antes de consolidar, y aprobación en 1 clic.

## Decisiones Críticas y Preferencias del Usuario

> [!NOTE]
> **Estado de Ejecución**: COMPLETADO Y VERIFICADO.
> - **Preferencia Confirmada 1**: Prioridad absoluta en la **Bandeja de Cuarentena y Edición Rápida** de sesiones antes de consolidarlas al expediente oficial (Implementado con toolbar de vuelo y preajustes de dificultad).
> - **Preferencia Confirmada 2**: Implementación de **Cuarentena Inteligente con Auto-Asignación y Aprobación en 1 Clic** (Implementado con `approveAllQuarantineEvents`, preajustes por vuelo e insignias de confianza).

---

## 1. Visión General y Concepto Central

El Centro de Control es el puente crítico entre el cronómetro de vuelo de AeroFocus Pro y el expediente histórico oficial de WellsPrep. Las sesiones aterrizan primero en una **Bandeja de Cuarentena Blindada** para evitar que sesiones fantasma, temas mal catalogados o repasos parciales contaminen las estadísticas de vueltas y la curva de Ebbinghaus. 

Con esta mejora, el opositor puede:
1. Ver de un vistazo las sesiones retenidas con su porcentaje de confianza en la resolución del tema.
2. Aplicar calificaciones rápidas de dificultad ("Fluido 3", "Estándar 5", "Complejo 8") a nivel individual o de todo el vuelo en 1 toque.
3. Ajustar el conmutador de vuelta oficial (*¿Completó vuelta o fue repaso parcial?*) con retroalimentación visual inmediata.
4. Aprobar la sesión individual o ejecutar **"Aprobar Todas en 1 Clic"** con auto-asignación validada.

---

## 2. Experiencia de Usuario y Diseño Visual (Constitución SaaS)

### Flujo de Usuario Paso a Paso
1. **Entrada de Sesión**: La sesión llega vía Webhook o portapapeles. Se retiene en Cuarentena sin tocar el expediente ni falsear estadísticas.
2. **Detección y Resumen Visual**:
   - Tarjetas de sesión de alta densidad con tipografía tabular (`tabular-nums font-mono`).
   - Identificación nítida de la materia, número de tema y modalidad (Repaso, Primer Estudio, Refresco, Cante).
   - Aviso inteligente de repasos divididos con botón de fusión instantánea (`Fusionar partes`).
3. **Edición Ultrarrápida (Pre-Consolidación)**:
   - Selector de dificultad estilizado con micro-preajustes rápidos (*1-3 Fácil*, *4-6 Medio*, *7-9 Difícil*, *10 Extremo*).
   - Conmutador booleano claro: *Suma Vuelta Oficial* vs *Horas Netas de Repaso Parcial*.
   - Cambio de tema asistido con búsqueda predictiva instantánea.
4. **Consolidación en 1 Clic**:
   - Botón `Aprobar e Incorporar` en cada tarjeta con animación de éxito y actualización inmediata del expediente.
   - Botón `Aprobar Todo (Cuarentena Limpia)` en la cabecera cuando todas las sesiones están listas.

### Identidad Visual y Paleta
- **Canvas Base**: Slate neutral (`bg-white` y `bg-slate-50/70`), sin cajas dentro de cajas redundantes.
- **Micro-interacciones y Tipografía**:
   - Cero píldoras decorativas estáticas: metadata separada por puntos limpios (`·`).
   - Horas y minutos en cifras tabulares continuas.
   - Botones funcionales con feedback táctil $\le 150\text{ms}$.

---

## 3. Decisiones de Producto y Arquitectura de Estado

- **Auto-Asignación Determinista**:
   - Si AeroFocus envía un código como `CIV_T14` o `"Civil Tema 14"`, el algoritmo lo vincula con `civil-14` con 100% de certidumbre.
   - Si el tema es ambiguo o no existe en el índice de 300+ temas de judicatura, se ofrece un selector de reasignación asistido sin bloquear el resto de la sesión.
- **Persistencia Reactiva en Firebase / Local**:
   - Las sesiones en cuarentena se sincronizan en tiempo real mediante el proveedor reactivo `FirebaseProvider` y la pasarela `/api/webhook/*`.
   - Al aprobar, las horas se suman a los temas oficiales, se actualizan los timestamps de estudio y se recalcula la curva de retención de Ebbinghaus con las nuevas fórmulas optimizadas.

---

## 4. Arquitectura de Componentes y Flujo de Datos

```
┌────────────────────────────────────────────────────────┐
│         Centro de Control de Estudio (AeroFocus)       │
├──────────────────────────┬─────────────────────────────┤
│  Métricas de Auditoría   │  Estado del Webhook         │
│  [242 Sesiones · 309.2h] │  [Enlace Activo / Ping OK]  │
└────────────┬─────────────┴───────────────┬─────────────┘
             │                             │
             ▼                             ▼
┌─────────────────────────────┐ ┌────────────────────────┐
│   Bandeja de Cuarentena     │ │  Auditoría y Sesiones  │
├─────────────────────────────┤ ├────────────────────────┤
│ • Auto-asignación de temas  │ │ • Filtro por materia   │
│ • Preajustes Dificultad 1-10│ │ • Búsqueda instantánea │
│ • ¿Suma Vuelta? (Toggle)    │ │ • Reconciliación total │
│ • Fusión de repasos partidos│ │ • Logs brutos de vuelo │
│ • [Aprobar Todo en 1 Clic]  │ └────────────────────────┘
└────────────┬────────────────┘
             │ (Aprobación)
             ▼
┌────────────────────────────────────────────────────────┐
│  Expediente Oficial + Curva del Olvido de Ebbinghaus   │
│  (Recálculo en cascada determinista con cero latencia) │
└────────────────────────────────────────────────────────┘
```

### Plan de Ejecución
1. **Refactorización y Pulido de `SyncControlCenterDialog.tsx`**:
   - Implementar barra de acción de Cuarentena con `Aprobar Todo en 1 Clic`.
   - Incorporar controles de edición rápida de dificultad con presets semánticos.
   - Perfeccionar el selector de cambio de tema y la fusión de sesiones fraccionadas.
   - Adecuar toda la tipografía a la constitución anti-slop (sin píldoras de adorno, números tabulares).
2. **Optimización de Estado y Sincronización en `FirebaseProvider.tsx`**:
   - Conectar las acciones de aprobación masiva con procesamiento por lotes determinista.
3. **Verificación**:
   - Compilación limpia con `tsc --noEmit` y `npm run build`.
   - Pruebas de simulación de vuelo y aprobación directa en la UI.
