# Plan Maestro: Transformación Radical del Dashboard y Evolución de Cantos (WellsPrep Pro)

## Estado: RESOLUCIÓN Y BLINDAJE COMPLETADO ✅🚀

---

### Diagnóstico del Problema Reportado ("no aparecen las estadísticas ahora")
En la captura adjunta por el usuario, el contenedor de la Matriz de Dispersión aparecía sin los puntos/nodos de los cantes a pesar de contar con 157 registros (50 en Zona Tribunal, 88 en Riesgo Tiempo, 19 en Crítico):
1. **Causa Raíz Principal**: En Recharts 3.x, la presencia de `<ZAxis type="number" dataKey="z" range={[90, 120]} />` con valores idénticos `z: 1` para todos los puntos provocaba que la escala lineal de d3 (`deinterpolate`) normalizara entre `[1, 1]`, dividiendo por cero y arrojando `NaN`. Al ser `size = NaN`, el radio calculado resultaba en 0 o en paths SVG inválidos (`MNaN,NaN...`), ocultando todos los puntos.
2. **Causa Secundaria de Escala**: Algunos cantes históricos de larga duración (ej. 42 minutos de sesiones acumuladas) estiraban el eje X hasta `43m`, comprimiendo los cantes reglamentarios en una franja diminuta.

---

### Correcciones Aplicadas

1. **Eliminación de `<ZAxis>` y Shape SVG Directo (`DashboardCantoScatterChart.tsx`)**:
   - Se eliminó `<ZAxis>` conflictivo.
   - Se sustituyeron los elementos `<Cell>` por una función `shape={(props: any) => ...}` nativa y determinista que dibuja círculos SVG explícitos:
     * Radio estándar de 5.5px con halo y sombra sutil.
     * Radio aumentado a 7.5px con aro de selección animado cuando el usuario hace clic.
     * Color dinámico de acuerdo a la clasificación del cuadrante (*Zona Tribunal*, *Riesgo Tiempo*, *Riesgo Materia*, *Crítico*).
     * `isAnimationActive={false}` para renderizado instantáneo sin parpadeos ni demoras.

2. **Selector de Zoom y Enfoque (`zoomScope`)**:
   - `🎯 Ventana Tribunal (8–16m)` (Por defecto): Enfoca la ventana oficial del tribunal con máxima amplitud y legibilidad.
   - `🌐 Escala Completa`: Muestra el espectro completo (hasta 43m+) con indicación de cantes fuera de margen.

3. **Verificación Técnica**:
   - `tsc --noEmit` completado con 0 errores.
   - `npm run build` completado exitosamente.
   - Servidor de desarrollo reiniciado.
