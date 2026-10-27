# Plan de Excelencia UX · Experiencia del Temario y Seguimiento de Vueltas Estilo Apple

Perfeccionar la experiencia central del Temario y el seguimiento de vueltas oficiales en WellsPrep, incorporando microinteracciones fluidas inspiradas en los estándares de diseño de Apple, métricas de retención en vivo y un flujo de navegación impecable.

## Decisiones Críticas y Respuestas del Usuario

> [!IMPORTANT]
> Confirmaciones del usuario en la fase de clarificación:
> - **Área prioritaria**: Experiencia del Temario y seguimiento de vueltas.
> - **Estilo de experiencia visual**: Microinteracciones fluidas y acabados estilo Apple.
> - **Objetivo cumplido**: Pequeñas mejoras perceptibles que elevan la calidad y usabilidad del sistema a nivel de producto final nativo.

---

## 1. Visión General del Sistema y Flujo de Usuario

El temario es el corazón operativo del opositor a Judicaturas y Fiscalía. Cada tema transita por un ciclo vital muy estricto:
1. **Estudio Inicial**: Primera aproximación y fijación de conceptos.
2. **Ciclo de 3 Refrescos**: Consolidación a corto plazo (Día 1, Día 2, Día 3).
3. **Cante Oficial**: Simulación oral cronometrada que consolida la vuelta.
4. **Repetición Espaciada (SRS)**: Mantenimiento mensual adaptativo según dificultad.

Se han incorporado refinamientos quirúrgicos para que el seguimiento de vueltas sea visualmente gratificante, táctil, informativo y sin fricción.

### Diagrama de Flujo y Microinteracciones

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              BARRA DE MATERIAS ESTILO APPLE                            │
│  ┌───────────────────────┐ ┌───────────────────────┐ ┌──────────────────────────────┐ │
│  │ Constitucional (27)   │ │ Penal General (29)    │ │ Penal Especial (58)          │ │
│  │ [Slider Fluido macOS] │ └───────────────────────┘ └──────────────────────────────┘ │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                      CABECERA DE COMANDO Y SALUD DEL BLOQUE                            │
│  Progreso Vueltas: [████████ 1ª Vuelta (60%) ][████ 2ª+ Vuelta (30%) ][ Pendiente (10%)│
│  Micro-vitals: 27 Temas · 18 con Vuelta · 142.5h Invertidas · 2 Repasos Hoy (Alerta)   │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                           TARJETAS DE TEMA FLUIDAS (CARDS)                             │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐  │
│  │ Tema 1 · Constitucional                       [ Retención: 88% Óptima 🟢 ]        │  │
│  │ La Constitución de 1978. Principios y Valores                                    │  │
│  │ ──────────────────────────────────────────────────────────────────────────────── │  │
│  │  VUELTA 2 CONSOLIDADA       DIFICULTAD: 4/10       REPASO EST.: 42m              │  │
│  │  Último Cante: 14m 20s      Agenda: en 12 días     Inversión: 6.5h               │  │
│  │ ──────────────────────────────────────────────────────────────────────────────── │  │
│  │  [⚡ +1 Vuelta Rápida]      [👁️ Abrir Ficha Completa]                             │  │
│  └──────────────────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Mejoras Implementadas

1. **Selector de Materias con Indicador Físico Deslizante (`layoutId="activeSubjectSlider"`)**:
   - Selector segmentado con fondo dinámico animado por Framer Motion. Al hacer clic o cambiar de materia con teclado, la cápsula se desliza con inercia elástica suave (`spring: stiffness 450, damping 35`).

2. **Medidor de Vueltas Multicapa con Micro-Leyenda**:
   - Barra de progreso segmentada en 3 niveles de profundidad: *2ª+ Vueltas* (índigo intenso), *1ª Vuelta* (índigo medio), *En proceso / Refrescos* (índigo suave) y *Pendientes* (gris claro), con conteos exactos.

3. **Tarjeta de Tema Editorial (Anti-Slop) & Mnemotécnica Ebbinghaus**:
   - Números tabulares proporcionales (`font-mono tabular-nums`).
   - Medidor de retención mnemotécnica en vivo (punto de color y porcentaje) derivado del cálculo multifactorial de Ebbinghaus.
   - Rastreador visual de los 3 Refrescos Diarios (Día 1, Día 2, Día 3) para temas en fase de refresco.

4. **Acción Rápida Táctil (+1 Vuelta Rápida en 1 Clic)**:
   - Botón `+1 Vuelta` disponible tanto en la vista cuadrícula (tarjeta) como en la tabla, permitiendo registrar un repaso oficial con su tiempo estimado con un solo clic, feedback sonoro de cabina y actualización inmediata de la agenda SRS.

5. **Navegación y Atajos de Teclado Integrados**:
   - `ArrowLeft` / `ArrowRight`: Navegación rápida entre bloques temáticos con sonido háptico.
   - `/`: Enfoque inmediato del campo de búsqueda de temas.
   - `Escape`: Limpieza de búsqueda y desenfoque del buscador.

---

## 3. Estado de Ejecución por Fases

- [x] **Fase 1: Selector Segmentado y Medidor de Vueltas Multicapa (`src/components/TemarioView.tsx`)**
- [x] **Fase 2: Rediseño Editorial de `TopicCard` y `TopicTableRow`**
- [x] **Fase 3: Feedback y Microinteracciones Sensoriales**
- [x] **Fase 4: Pruebas y Validación de Compilación (`lint_applet` y `compile_applet` completados con 0 errores)**
