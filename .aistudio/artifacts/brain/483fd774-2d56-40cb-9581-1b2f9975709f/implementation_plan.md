# Plan Maestro: Armonía Perfecta en WellsPrep (Experiencia Unificada, Diseño Editorial y Coherencia de Datos)

## 1. Visión y Objetivos de Armonía

Con base en tus preferencias confirmadas, este plan maestro aborda la aplicación como una obra de orfebrería de código y diseño, integrando los tres pilares principales (**Dashboard**, **Temario** y **Panel del Preparador**) bajo un mismo lenguaje visual editorial y una arquitectura de datos matemáticamente coherente.

### Pilares Fundamentales
1. **Unificación de Experiencia y Diseño Visual**:
   - Cabeceras consistentes con tipografía editorial (`font-serif tracking-tight text-slate-900`) combinadas con cifras tabulares de alta precisión (`font-mono tabular-nums`).
   - Cero "AI slop": eliminación de píldoras innecesarias, bordes dobles o recuadros redundantes. Metadatos limpios separados por puntos flotantes (`·`).
   - Paleta cromática compartida: canvas base neutral (`bg-[#F5F5F7]`), superficies en blanco puro (`bg-white`), acentos sutiles en índigo/zafiro, ámbar cálido y esmeralda.

2. **Densidad Editorial Equilibrada y Ergonomía Móvil**:
   - Solución definitiva al espacio y scroll en móvil para el **Panel del Preparador**: ajuste de alturas dinámicas (`h-[100dvh]`), contenedor de scroll desacoplado sin desbordamientos y tarjetas de temas asignados estilizadas y táctiles.
   - Consistencia en el Temario y Dashboard con espaciados calculados para navegación sin fricción en cualquier pantalla.

3. **Conexión Analítica Integral (Dashboard <-> Preparador)**:
   - Panel analítico integrado que combina:
     - Radar de retención Ebbinghaus y curva de fatiga cognitiva.
     - Gráficos minimalistas de horas netas acumuladas y vueltas oficiales por materia.
     - Widget ejecutivo en Dashboard con cuenta regresiva, temas asignados y preparación proyectada para el próximo cante (Lunes / Jueves).

---

## 2. Plan de Acción por Módulos

### Módulo A: Panel del Preparador (`PreparadorView.tsx` y subcomponentes)
- **Ergonomía de Scroll y Altura Móvil**: Reestructurar el layout del panel para que la cabecera y el selector de días (Lunes / Jueves / Historial) sean sticky o compactos, dejando el 85% de la pantalla para el listado scrolleable de temas asignados.
- **Tarjetas de Cante Armonizadas**: Rediseñar las tarjetas de preparación (`PreparadorTopicCard`) para que compartan la misma jerarquía que las tarjetas del Temario (indicador de dificultad, cronómetro calibrado a 12:30 min, días transcurridos desde el último cante y nota del tribunal).
- **Feedback Rápido del Cante**: Pulir el modal de registro y calificación (`PreparadorQuickFeedbackModal`) para que guarde instantáneamente en Firestore y sincronice la curva de olvido en tiempo real.

### Módulo B: Dashboard Analítico Integrado (`DashboardView.tsx` y `DashboardHeroKPIs.tsx`)
- **Widget Ejecutivo de Cante Semanal**: Integrar en la vista principal de Dashboard una tarjeta editorial con el estado del próximo cante con el preparador, temas pendientes de repasar antes de la sesión y estimación de tiempo total.
- **Coherencia en KPIs y Anillos de Actividad**: Sincronizar el ritmo de examen (páginas/hora y minutos efectivos) con las métricas de AeroFocus Pro.
- **Tipografía y Acabado**: Refinar los selectores de sección (Hoy, Temas, Cantos, General) para que utilicen la misma barra de pestañas que el Temario y Preparador.

### Módulo C: Temario y Navegación (`TemarioView.tsx` y `App.tsx`)
- **Barra de Materias y Filtros**: Unificar la barra de materias con transiciones suaves y micro-interacciones acústicas sutiles.
- **Consistencia de Datos en Tiempo Real**: Garantizar que las vueltas oficiales y horas registradas en cualquier vista se reflejen de inmediato sin necesidad de recargar la página.

---

## 3. Fases de Ejecución

1. **Fase 1**: Arquitectura y estructura de layout responsivo en `PreparadorView.tsx` (resolución de scroll en móvil y rediseño de cabecera).
2. **Fase 2**: Integración ejecutiva Dashboard <-> Preparador y refinamiento de KPIs en `DashboardView.tsx`.
3. **Fase 3**: Unificación de tipografía, tokens de diseño y espaciados entre las 3 vistas.
4. **Fase 4**: Verificación de compilación (`lint_applet`, `compile_applet`) y pruebas de responsividad.
