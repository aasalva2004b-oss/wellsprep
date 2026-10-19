# Master Refactoring Plan: WellsPrep 9.5+ Editorial Grade

> **Rol:** Staff Engineer Especialista en Refactorización & Lead UI/UX Designer  
> **Objetivo:** Transformar la base de código y la experiencia de usuario de un "5/10" a un **"9.5/10" de nivel Apple Design Award**, sin añadir ninguna funcionalidad nueva.  
> **Restricción Absoluta:** CERO características nuevas, cero botones inventados, cero cambios en la API pública de datos. Refactorización pura de arquitectura, rendimiento, legibilidad y pulido estético.

---

## 🔍 Diagnóstico Crítico: ¿Por qué la aplicación es un "5/10" actualmente?

1. **Monolitos Extremos ("God Components"):**
   - `TopicEditorDialog.tsx`: **2,234 líneas de código**. Contiene simultáneamente la gestión de pestañas, formularios de cante, llamadas directas a Firestore, canvas de audio/voz, 3 gráficos Recharts, cálculos de curvas de Ebbinghaus, y filtros de historial.
   - `DashboardView.tsx`: **2,180 líneas de código**. Mezcla 12 KPIs matemáticos, renderizado de mapas de calor tipo GitHub, lógica de colas de repaso, gráficos dobles de dispersión de cante y modales secundarios.
   - `FirebaseProvider.tsx`: **1,952 líneas de código**. Mezcla autenticación, listeners a 2 bases de datos distintas, cuarentena de webhooks, algoritmos de cálculo de notas, y llamadas directas de borrado/inserción.
2. **Acoplamiento Fuerte entre Lógica de Negocio y Presentación:**
   - Si se cambia un cálculo de Ebbinghaus o de velocidad de cante, hay que editar archivos JSX gigantes.
   - No existen ViewModels ni hooks específicos de dominio (`useTopicEditor`, `useCantoAnalytics`).
3. **Ineficiencia de Renderizado (Re-renders en Cadena):**
   - Un cambio en una sesión vuelve a renderizar el mapa de calor entero de 365 días, todos los KPIs y los modales subyacentes.
   - Falta de memoización selectiva (`React.memo`, selectores granulares).
4. **Inconsistencia Visual:**
   - Múltiples estilos de sombras, esquinas redondeadas (`rounded-xl` vs `rounded-2xl` vs `rounded-3xl` sin jerarquía espacial), colores dispersos (`blue-600`, `indigo-600`, `slate-900` compitiendo como acentos primarios) y falta de disciplina tipográfica en números tabulares.

---

## ⚙️ FASE 1: Saneamiento Arquitectónico y Deuda Técnica

### 1.1 Patrón Arquitectónico: MVVM + Domain Custom Hooks
Separaremos de forma estricta las tres capas de la aplicación:
- **Model (Datos y Algoritmos Puros):**
  - Módulos en `src/lib/` 100% agnósticos de React (cálculo de intervalos de repetición espaciada, curvas de olvido de Ebbinghaus, normalización de cantes, filtros de telemetría).
- **ViewModel (Custom Hooks de Dominio):**
  - Encapsulan el estado reactivo, la validación y las acciones de Firestore. La vista solo consume funciones y estados planos.
  - `useTopicEditor(topic, progress, recentSessions)`: maneja pestañas, cálculo de retención, formulario de cante y guardado.
  - `useDashboardMetrics(recentSessions, userProgress, allTopics)`: calcula KPIs, rachas, volumen y estado de forma sin ensuciar el JSX.
  - `useCantoTelemetry(sessions)`: procesa dispersión de notas, tiempos medios y clasificación de cantes.
  - `usePreparadorSchedule()`: gestiona la rotación Lunes/Jueves y las evaluaciones.
- **View (Componentes Tontos / Pure UI):**
  - Componentes limpios enfocados únicamente en diseño, accesibilidad y renderizado.

### 1.2 Atomización de Componentes Monolito

#### A. Descomposición de `TopicEditorDialog` (2,234 líneas ➔ 6 submódulos limpios de < 200 líneas)
Ubicación: `src/components/topic-editor/`
1. `TopicEditorHeader.tsx`: Identificador canónico, título del tema, selector de pestañas y botones de cabecera.
2. `TopicGeneralTab.tsx`: Estado de vuelta actual, nivel de dificultad, páginas y fechas de repaso.
3. `TopicEbbinghausTab.tsx`: Visualización gráfica de la curva de retención y factor de memoria con Recharts optimizado.
4. `TopicCantoMetricsTab.tsx`: Radar de notas, tiempos de exposición y comparador de registros.
5. `TopicHistoryTab.tsx`: Lista cronológica de sesiones de estudio y cantes filtradas y deduplicadas.
6. `TopicLogSessionForm.tsx`: Formulario de inserción rápida de cantes y repasos con validación y candado anti-duplicados.

#### B. Descomposición de `DashboardView` (2,180 líneas ➔ 6 submódulos limpios de < 250 líneas)
Ubicación: `src/components/dashboard/`
1. `DashboardHeroKPIs.tsx`: Tira ejecutiva de 4 tarjetas con métricas principales (Horas, Vueltas, Retención, Racha).
2. `DashboardSmartQueue.tsx`: Cola de temas prioritarios del día según el algoritmo de arrastre.
3. `DashboardHeatmap.tsx`: Mapa de calor de 365 días aislado con memoización para evitar re-renders masivos.
4. `DashboardCantoScatterChart.tsx`: Gráfico dual de evolución de cantes (Nota vs Tiempo reglamentario).
5. `DashboardRecentSessionsFeed.tsx`: Historial reciente de sesiones con edición rápida in-line.
6. `DashboardQuickCantoModal.tsx`: Diálogo modal desacoplado para registrar cantes rápidos desde la cabina.

### 1.3 Blindaje de Estado y Cero Re-renders Innecesarios
- **Subscripción Selectiva:** Evitar que un cambio en `quarantinedEvents` provoque re-render de las estadísticas del temario.
- **Memoización con `React.memo` y claves estables:** Cada fila de tema, celda del mapa de calor y punto de gráfico solo se volverá a dibujar si sus propiedades específicas cambian.

---

## 🎨 FASE 2: Cohesión UI/UX y Pulido "Premium" (Estilo Apple Pro Editorial)

### 2.1 Estandarización del Sistema de Diseño (Design Tokens)
- **Superficie y Elevación Única:**
  - Fondo de lienzo: `#F8FAFC` (Slate 50 neutro cálido) con textura de malla casi imperceptible.
  - Tarjetas y Contenedores: `bg-white/90 backdrop-blur-xl border border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_6px_16px_rgba(0,0,0,0.02)]`.
  - CERO tarjetas anidadas dentro de tarjetas ("zero-nested-card discipline"). Se sustituyen por separadores sutiles de `1px` (`divide-slate-100`).
- **Paleta de Color Semántica y Sobria:**
  - **Color Maestro Primario:** Deep Slate (`#0F172A`) para cabeceras, botones principales e iconografía noble.
  - **Acento Editorial:** Azul Zafiro / Índigo Sutil (`#3B82F6` / `#4F46E5`) para progreso activo y estados de foco.
  - **Acento Cantes y Preparador:** Ámbar Nórdico (`#D97706`) usado exclusivamente para cronómetros, estrellas y notas.
  - **Estado Operativo:** Verde Esmeralda (`#10B981`) y Carmín (`#EF4444`) para estados de aprobación/alerta.
- **Disciplina Tipográfica y Numerales Tabulares:**
  - Tipografía de lectura y analítica: Inter / System Sans con jerarquía rigurosa.
  - **Regla Estricta `tabular-nums font-mono`:** Absolutamente todos los números (horas, minutos, segundos de cante, notas sobre 10, número de tema y fechas) utilizarán numerales tabulares para evitar el temblor o desalineación visual.

### 2.2 Micro-Interacciones y Transiciones
- **Animaciones Físicas de Resorte:** Uso de `motion/react` con curvas de aceleración `cubic-bezier(0.16, 1, 0.3, 1)` y duración rápida de $180\text{ms}$–$240\text{ms}$.
- **Feedback Háptico Visual:** Todos los botones activos contarán con escala sutil `active:scale-[0.98]` y transiciones de color de borde ultra-suaves.
- **Feedback de Notificaciones:** Erradicación total de modales de error invasivos. Uso unificado de `sonner` con diseño sobrio y tipografía nítida.

---

## 🛠️ FASE 3: Hoja de Ruta de Ejecución (Paso a Paso)

```
[Paso 1: Tokens y Constantes de Diseño]
  └── Crear `src/lib/designSystem.ts` (clases unificadas de tarjetas, tipografía, badges).
  
[Paso 2: Extracción de Custom Hooks de Dominio]
  ├── `src/hooks/useTopicEditor.ts`
  ├── `src/hooks/useDashboardMetrics.ts`
  └── `src/hooks/useCantoTelemetry.ts`
  
[Paso 3: Atomización de TopicEditorDialog (2,234 líneas)]
  ├── Crear subcomponentes en `src/components/topic-editor/`
  └── Reducir el orquestador principal a un contenedor ligero de < 180 líneas.
  
[Paso 4: Atomización de DashboardView (2,180 líneas)]
  ├── Crear subcomponentes en `src/components/dashboard/`
  └── Reducir el orquestador principal a un grid declarativo y limpio.
  
[Paso 5: Pulido UI/UX Estilo Apple Pro Editorial]
  ├── Aplicar tipografía tabular (`tabular-nums font-mono`) en toda la telemetría.
  ├── Unificar bordes, sombras y micro-interacciones `active:scale-[0.98]`.
  └── Limpiar estados vacíos (Empty States elegantes y explicativos).
  
[Paso 6: Verificación de Rendimiento y Compilación]
  ├── Ejecutar `compile_applet` y `lint_applet` sin errores.
  └── Comprobar cero regresiones en datos reales del opositor.
```

---

## 🎯 Criterios de Aceptación (Definición de "9.5+/10")
1. **Cero nuevas funcionalidades añadidas**: la app hace exactamente lo mismo, pero con máxima elegancia y velocidad instantánea.
2. **Ningún archivo component superior a 350 líneas de código**.
3. **Cero re-renders innecesarios en el mapa de calor y en las tarjetas del temario**.
4. **Todos los números de cantes y tiempos alineados con precisión monoespaciada tabular**.
5. **Compilación y linter 100% limpios sin warnings ni tipos `any` injustificados**.
