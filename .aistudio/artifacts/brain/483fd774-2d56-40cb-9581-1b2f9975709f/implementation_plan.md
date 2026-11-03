# WellsPrep: Arquitectura y Reorganización Integral 100% Operativa

Reorganización visual, estructural y del código de WellsPrep Oposiciones para convertir el **Planificador Semanal con Sesiones del Preparador (Lunes/Jueves)** en el centro neurálgico de estudio diario, unificar la navegación en una barra lateral con accesos directos de alta velocidad, y priorizar la toma de decisiones basada en la curva del olvido (Ebbinghaus), vueltas completas y telemetría de cantes.

---

## Decisiones Críticas y Preferencias del Opositor

> [!IMPORTANT]
> Confirmadas las 3 directrices operativas seleccionadas por el opositor:
> 1. **Centro neurálgico del día a día**: Planificador semanal con calendario interactivo y sesiones del preparador (Lunes y Jueves) como vista inicial por defecto.
> 2. **Organización visual y de navegación**: Barra lateral unificada con secciones claras, jerarquía sin píldoras decorativas y accesos directos rápidos (`Cmd+K`, registro rápido, cronómetro).
> 3. **Estrategia de telemetría y progreso**: Priorización de repasos por curva de retención (Ebbinghaus), cómputo riguroso de vueltas y telemetría quirúrgica de cantes ante el tribunal (ventana óptima 11–13:40 min).

---

## 1. Visión General y Flujo de Trabajo

### ¿Qué resuelve esta reorganización?
Un opositor a Judicaturas / Fiscalías / Notarías no entra a una app para navegar entre pantallas dispersas; necesita saber en menos de 3 segundos:
1. **Qué canta el próximo Lunes o Jueves** ante su preparador y qué temas tiene asignados.
2. **Qué temas están en alerta roja de olvido** hoy según la curva de retención.
3. **El estado de su cante** (ritmo en minutos por tema, notas y fallos recurrentes).
4. **Registrar o eliminar cualquier sesión en 0 ms** sin fallos de sincronización.

### Persona y Contexto de Uso
Opositor de alta intensidad (8 a 10 horas de estudio diario, 6 días por semana) que utiliza cronómetro en mesa o la integración con AeroFocus Pro y se presenta a cante ante el preparador dos veces por semana (Lunes y Jueves hasta las 22:00h).

---

## 2. Experiencia de Usuario y Diseño Visual

Siguiendo la constitución de diseño de `frontend-design` y la guía de `references/3_saas_dashboard.md`:

### A. Paleta de Color y Distribución 60-30-10
- **60% Lienzo Neutral**: Fondo gris suave editorial (`#F8FAFC` en modo claro, `#0F172A` en modo oscuro) que reduce la fatiga visual tras 10 horas de estudio.
- **30% Superficies Estructurales**: Paneles en blanco puro (`#FFFFFF`) con bordes sutiles de 1px (`border-slate-200/80`), sin sombras pesadas ni tarjetas anidadas artificialmente.
- **10% Acentos Semánticos**:
  - *Azul Marino / Pizarra Intenso* (`#0F172A`): Identidad de marca, cabeceras editoriales y botones de acción principal.
  - *Esmeralda* (`#16A34A`): Temas dominados, vueltas completas y cantes en tiempo reglamentario (11–13:40 min).
  - *Ámbar* (`#D97706`): Temas en fase de refresco o próximos a vencer por curva del olvido.
  - *Rosa / Rubí* (`#E11D48`): Alerta crítica de retención (<40%), cante con exceso de tiempo (>13:40 min) o acciones destructivas.

### B. Tipografía y Disciplina Sin Píldoras (Zero-Pill Discipline)
- **Tipografía**:
  - Títulos y Números de Marca: Familia serif clásica/editorial para conferir sobriedad jurídica.
  - Interfaz y Datos: Tipografía sans limpia (`Plus Jakarta Sans` / `Outfit`) de alta legibilidad.
  - Telemetría y Tiempos: Monospace con cifras tabulares obligatorias (`font-mono tabular-nums`) para evitar oscilaciones visuales en cronómetros y tablas.
- **Eliminación de Píldoras Estáticas**: Las etiquetas de metadatos (fechas, vueltas, duraciones) se presentan como texto plano limpio con separadores tipográficos (`·`, `/`), reservando los fondos redondeados exclusivamente para botones y controles interactivos clicables.

### C. Navegación en Barra Lateral Unificada
Barra lateral vertical fija de 256px con 4 cuadrantes claramente delimitados:
1. **Identidad & Perfil**: Logotipo WellsPrep, nombre del opositor y estado de la base de datos sincronizada.
2. **Buscador Rápido Spotlight**: Acceso inmediato por teclado (`Cmd+K` / `Ctrl+K`) para saltar a cualquier tema en milisegundos.
3. **Secciones de Trabajo**:
   - `01. Planificador & Preparador`: Vista central por defecto (Calendario semanal, L/J, cola diaria).
   - `02. Temario Oficial`: Catálogo clasificado por materias (Constitucional, Penal, Civil, Procesal) con buscador por texto y número.
   - `03. Centro de Telemetría & Cantos`: Matriz de dispersión, evolución temporal, notas históricas y gestión de cantes.
   - `04. Enlace AeroFocus Pro`: Bandeja de cuarentena con validación de horas netas e importación directa.
4. **Acciones Rápidas & Configuración**: Botón de registro rápido directo y ajustes de sincronización.

---

## 3. Decisiones Técnicas y de Arquitectura de Código

```
┌────────────────────────────────────────────────────────────────────────┐
│                        WellsPrep Application                           │
└────────────────────────────────────────────────────────────────────────┘
                                    │
       ┌────────────────────────────┼────────────────────────────┐
       ▼                            ▼                            ▼
┌──────────────┐             ┌──────────────┐             ┌──────────────┐
│  Sidebar &   │             │ Firebase     │             │  AeroFocus   │
│  Navigation  │             │ Provider     │             │  Webhook Engine
└──────────────┘             └──────────────┘             └──────────────┘
       │                            │                            │
       ▼                            ▼                            ▼
┌──────────────────┐         ┌──────────────┐             ┌──────────────┐
│ Vistas Activas   │         │ Dual DB Synced             │ Ingesta &    │
│ • PreparadorHub  │◄───────►│ (Named + Def)│◄───────────►│ Cuarentena   │
│ • TemarioView    │         │ State Cache  │             │ Idempotente  │
│ • DashboardCantos│         └──────────────┘             └──────────────┘
└──────────────────┘
```

### Decisión 1: Planificador & Preparador como Vista Predeterminada
- **Enfoque**: Modificar la pestaña inicial de `App.tsx` para que arranque en `"preparador"`, integrando en su parte superior un **Strip Semanal Inteligente** que muestra los días de la semana, el cante inminente y la cola de temas prioritarios del día según Ebbinghaus.
- **Razón**: El opositor necesita saber qué estudiar hoy sin tener que hacer 4 clics en menús.

### Decisión 2: Reorganización Modular de Componentes
- **Enfoque**: Reducir el acoplamiento dividiendo componentes sobredimensionados en submódulos especializados dentro de `src/components/preparador/` y `src/components/dashboard/`.
- **Razón**: Permite mantener cero re-renders innecesarios, separar la lógica de cálculo estadístico de la presentación visual y garantizar que cada botón tenga un manejador autónomo y probado.

### Decisión 3: Blindaje de Eliminación y Recálculo en 0 ms
- **Enfoque**: Consolidar la arquitectura corregida en el turno anterior para que cualquier acción de borrado en sesiones, cantes o temas:
  1. Limpie el identificador sintético (`group-...`).
  2. Actualice de forma optimista el estado local en 0 ms.
  3. Ejecute la eliminación en ambas bases de datos (`db` y `defaultDb`).
  4. Recalcule las métricas acumuladas y las fechas de revisión automáticamente.

---

## 4. Plan de Implementación por Fases

### Fase 1: Estructuración y Navegación Unificada [COMPLETADA]
- Configurada `"preparador"` como vista inicial por defecto en `App.tsx`.
- Rediseñada la barra lateral con estética visual limpia, sin píldoras decorativas y con accesos directos por teclado (`⌘K`).
- Barra de navegación móvil y de escritorio con jerarquía clara y acceso directo.

### Fase 2: Centro de Comando del Preparador y Planificador Semanal [COMPLETADA]
- Creado `WeeklyPlannerStrip.tsx` con calendario interactivo de Lunes a Domingo, fechas reales de la semana, anclas oficiales de cante (Lunes y Jueves) y contador de horas de estudio.
- Creada `PreparadorEbbinghausQueue.tsx` con diagnóstico de retención neuronal en declive, filtro por severidad y materias.
- Integrado en `PreparadorView.tsx` con soporte para selección de jornadas de estudio, historial y cante oficial.

### Fase 3: Telemetría de Cantos y Auditoría de Retención [COMPLETADA]
- Implementada acción directa de 1 clic `+45m Hoy` ("Frenar Olvido") en `PreparadorTopicCard.tsx` y en la Cola de Olvido, actualizando al instante el progreso y la curva de retención.
- Tipografía refinada con disciplina Zero-Pill y cifras tabulares (`font-mono tabular-nums`).
- Persistencia total y optimista en Firestore con recálculo automático de vueltas y fechas.

### Fase 4: Verificación, Compilación y Calidad [COMPLETADA]
- `tsc --noEmit` completado con 0 errores de tipo.
- `npm run build` compilado exitosamente.
- Servidor de desarrollo reiniciado y verificado en puerto 3000.
