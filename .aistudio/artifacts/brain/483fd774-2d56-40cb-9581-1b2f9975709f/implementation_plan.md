# Plan de Optimización Matemática y Visual · Curva del Olvido de Hermann Ebbinghaus en Toda la App

Elevar el rigor matemático, neurobiológico y la coherencia visual del motor de la Curva del Olvido de Hermann Ebbinghaus en todos los puntos de la aplicación, dando el máximo peso al **cante oral activo** y a las **vueltas acumuladas** como anclajes de memoria a largo plazo.

---

## 1. Decisiones Clave y Respuestas del Usuario

> [!IMPORTANT]
> - **Aspecto Matemático Prioritario**: **Mayor peso al cante y vueltas como fijadores de memoria**.
>   - La evocación activa oral (*Active Retrieval Practice*) bajo presión de cronómetro triplica la tasa de retención frente a la lectura pasiva.
>   - Las vueltas consolidadas ($V_1 \rightarrow V_2 \rightarrow V_3+$) aumentan exponencialmente la vida media sináptica ($S$), espaciando los repasos requeridos.
> - **Visualización en la Interfaz**: **Ambas mejoras integradas** (indicador unificado de retención y fecha de decaimiento en el Temario + diagnóstico predictivo profundo en la ficha técnica de cada tema).

---

## 2. Diagnóstico del Modelo Actual y Objetivos de Mejora

### 1. Desfase de Factores Actuales:
- En `src/lib/ebbinghaus.ts`, el factor de cantes (`cantosFactor`) tenía un techo conservador de $3.2\times$ y las vueltas un factor lineal de $0.55\times$, subestimando el poder de fijación del cante oral repetido.
- En temas con 3 o más vueltas y cantes aprobados con buena nota, la curva caía con excesiva rapidez por no ponderar adecuadamente la huella sináptica profunda (*Long-Term Potentiation*).
- Existían pequeñas divergencias entre el cálculo de retención en `src/lib/ebbinghaus.ts` y el cálculo de decaimiento en `src/lib/preparationScore.ts`.

### 2. Objetivos del Nuevo Modelo Matemático:
- **Ecuación Maestra**: $R(t) = 100 \cdot e^{-t_{\text{eff}} / S}$
  - **Estabilidad Sináptica ($S$ en días)**:
    $$S = S_{\text{base}} \cdot F_{\text{vueltas}} \cdot F_{\text{cantos}} \cdot F_{\text{nota}} \cdot F_{\text{velocidad}} \cdot F_{\text{refrescos}} \cdot F_{\text{horas}} \cdot F_{\text{dificultad}}$$
  - **Potenciador de Vueltas ($F_{\text{vueltas}}$)**:
    - Vuelta 0: $1.0\times$
    - Vuelta 1: $1.85\times$ (doble vida media tras consolidar la primera vuelta)
    - Vuelta 2: $3.10\times$ (afianzamiento)
    - Vuelta 3: $4.60\times$ (dominio)
    - Vuelta 4+: hasta $6.20\times$ (memoria prácticamente indeleble para tribunal)
  - **Potenciador de Cante Oral Activo ($F_{\text{cantos}}$)**:
    - Cada cante oficial multiplica la estabilidad por un factor logístico escalonado (1 cante: $2.1\times$, 2 cantos: $3.3\times$, 3+ cantos: hasta $4.8\times$).
    - Si el último cante fue en la ventana reglamentaria (11:50 a 13:40 min) con nota $\ge 7.5$, se aplica un multiplicador de maestría adicional.
  - **Días Efectivos ($t_{\text{eff}}$) con Freno Diferencial**:
    - Cante frena el 100% del olvido ($t_{\text{eff}} = \text{días desde el cante}$).
    - Repaso de estudio frena el 50% del tiempo transcurrido desde el último cante.
- **Unificación Total**: Sincronización idéntica de la retención $R(t)$ en `ebbinghaus.ts`, `preparationScore.ts`, `performanceCache.ts`, `TemarioView.tsx` y `TopicEbbinghausCard.tsx`.

---

## 3. Plan de Implementación Técnica por Fases

### Fase 1: Calibración Matemática en `src/lib/ebbinghaus.ts` [COMPLETADO]
- [x] Actualizar la fórmula de estabilidad $S$:
  - Aumentar el peso de vueltas acumuladas ($F_{\text{vueltas}}$ hasta $6.20\times$) y cantes orales realizados ($F_{\text{cantos}}$ hasta $5.20\times$).
  - Incorporar bonus de maestría ante tribunal (+15% si cante en ventana 11:50-13:40 con nota $\ge 7.5$).
  - Incorporar el cálculo de días efectivos $t_{\text{eff}}$ con freno diferencial riguroso (100% cante vs 50% repaso posterior).
  - Recalibrar el cálculo exacto del **umbral crítico del 80%** ($t_{80} = -S \cdot \ln(0.80)$) y la fecha prevista en la que el tema caerá por debajo de dicho umbral.
  - Mejorar el texto del diagnóstico pedagógico para que explique exactamente cuántos días de protección aporta cada cante y vuelta.

### Fase 2: Unificación Matemática en `src/lib/preparationScore.ts` y Caché de Rendimiento [COMPLETADO]
- [x] Sincronizar `calculateEbbinghausRetention` en `preparationScore.ts` con los nuevos pesos de estabilidad $S$ para que el Panel del Preparador (L/J) y el Temario muestren exactamente la misma retención porcentual.
- [x] Actualizar `performanceCache.ts` (`buildSubjectTelemetryIndex`) para almacenar `daysUntil80`, `stabilityDays`, y `critical80DateStr` en $O(1)$ sin latencia.

### Fase 3: Visualización Refinada en Temario y Ficha Técnica de Tema [COMPLETADO]
- [x] En `src/components/TemarioView.tsx`:
  - Mostrar la nueva métrica de retención unificada en la tarjeta y fila de cada tema con tooltip enriquecido (retención %, días hasta el umbral 80% y fecha límite sugerida).
- [x] En `src/components/topic-editor/TopicEbbinghausCard.tsx`:
  - Actualizar el desglose con 5 tarjetas especializadas: Horas Mesa, Dificultad, Cantos Orales, Vueltas y Refrescos/Freno Diferencial.
  - Añadir insignias de "Bonus Maestría +15%" y freno diferencial ("Cante 100%" o "Freno Mixto 50%").
  - Refinar el gráfico interactivo de la curva y el estado con la fecha proyectada exacta de cruce del umbral 80%.

### Fase 4: Pruebas, Linter y Compilación [COMPLETADO]
- [x] Ejecutar `lint_applet` (`tsc --noEmit`) asegurando 0 errores.
- [x] Ejecutar `compile_applet` para validar el empaquetado de producción de Vite (Build exitoso).

---

## 4. Criterios de Aceptación
1. **Precisión Matemática**: Los temas con 2+ vueltas o con cantes recientes no se degradan artificialmente rápido; su retención se mantiene elevada reflejando fielmente la consolidación sináptica.
2. **Coherencia Total**: El porcentaje de retención de Ebbinghaus es exactamente el mismo en el Temario, en el Panel del Preparador, en el Recomendador del Día y en la Ficha Técnica del Tema.
3. **Claridad Visual**: El opositor comprende en cualquier pantalla cuántos días le quedan de retención segura antes de que el tema baje del 80%.
