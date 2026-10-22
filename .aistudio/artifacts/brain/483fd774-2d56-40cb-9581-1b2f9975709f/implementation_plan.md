# Plan de Implementación: Motor Matemático de Ebbinghaus para la Sección de Preparador

## 1. Diagnóstico y Problema Actual
En la versión actual de `preparationScore.ts`, la nota global se calculaba mediante una media aditiva estática:
$$\text{Nota} = 0.35 \times \text{Tiempo} + 0.25 \times \text{Ebbinghaus} + 0.20 \times \text{NotaPrep} + 0.20 \times \text{Madurez}$$

**El Fallo:** Si un tema se cantó hace 1 mes (30 días) en 13:00 con nota 9.0, la suma sigue dando $\approx 7.5 - 9.0$ porque el 75% de los factores no decaían con el tiempo, falseando la realidad del opositor ("hace un mes que no lo toco, lo tengo olvidado pero la app me dice que tengo un 9").

---

## 2. Nuevo Modelo Matemático Multiplicativo Dinámico (Ebbinghaus)

Conforme a tus respuestas en las preguntas clarificatorias, implementamos un **modelo multiplicativo continuo basado en la física de la memoria**:

### A. Nota Teórica Pico ($P_{\text{pico}}$)
Representa la solvencia máxima alcanzada cuando el tema estaba fresco:
$$P_{\text{pico}} = w_{\text{tiempo}} \cdot S_{\text{tiempo}} + w_{\text{nota}} \cdot G + w_{\text{madurez}} \cdot M$$
- $S_{\text{tiempo}}$: Calibrado contra los 12:30 min reglamentarios (ventana 11:50 - 13:40).
- $G$: Última nota oficial del preparador (o inferida por vueltas/dificultad si no hay examen).
- $M$: Maduración acumulada por vueltas al temario.

### B. Estabilidad de la Huella de Memoria ($S$)
La memoria dura más días a medida que se acumulan vueltas y repasos de calidad:
$$S = S_0 \times (1 + \alpha \cdot \text{Vueltas}) \times (1 + \beta \cdot \text{Repasos}) \times D_{\text{dif}}$$
- $S_0 = 3.5\text{ días}$ (vida media base de un tema nuevo).
- Cada vuelta incrementa la estabilidad un $60\%$ ($\alpha = 0.60$).
- Cada repaso acumulado incrementa la estabilidad un $20\%$ ($\beta = 0.20$).

### C. Días Transcurridos Efectivos ($t_{\text{eff}}$) con Freno Diferencial
Regla aprobada: **El cante frena el olvido al 100% y los repasos de estudio al 50%**.
- $t_{\text{cante}}$: Días transcurridos desde el último cante cronometrado.
- $t_{\text{repaso}}$: Días transcurridos desde el último repaso/estudio.
- Si sólo se ha estudiado pero no cantado:
$$t_{\text{eff}} = t_{\text{cante}} - 0.5 \times (t_{\text{cante}} - t_{\text{repaso}})$$
*(Ejemplo: cantado hace 30 días, repasado hoy $t_{\text{repaso}} = 0 \implies t_{\text{eff}} = 15\text{ días}$. Si se canta hoy $t_{\text{cante}} = 0 \implies t_{\text{eff}} = 0\text{ días}$ y retención al 100%).*

### D. Factor de Retención Dinámica ($R(t)$)
$$R(t) = \exp\left(-\frac{t_{\text{eff}}}{S}\right) \in (0, 1]$$

### E. Proyección Continua de la Nota Actual ($P_{\text{actual}}$)
El olvido actúa de forma **multiplicativa** sobre la competencia del tema:
$$P_{\text{actual}} = P_{\text{base}} + (P_{\text{pico}} - P_{\text{base}}) \times R(t)$$
- Con $P_{\text{base}} = 2.0$ (suelo de memoria residual).
- **Efecto Realista**:
  - Si $P_{\text{pico}} = 9.0$ y han pasado 30 días sin tocar el tema ($R \approx 0.18$), la nota proyectada cae a **$3.3 / 10$ (Crítico / Requiere rescate)**.
  - Si se cantó ayer ($R \approx 0.95$), la nota se mantiene en **$8.7 / 10$ (Sobresaliente)**.
  - Si se hizo un repaso de lectura hoy, la nota sube de $3.3$ a **$5.9$ (Aprobado en recuperación)**, reflejando el 50% de retención frente al 100% del cante.

---

## 3. Rediseño de la UX / Tarjeta del Tema en el Preparador

Siguiendo la especificación elegida:
1. **Doble Calificación Visible**:
   - **Nota Proyectada Actual (Grande, Prominente)**: e.g. `3.3` con color semántico (Rojo crítico si $t > 20\text{d}$, Ámbar si $t > 10\text{d}$, Verde si fresco) y etiqueta de estado de olvido.
   - **Nota Histórica Máxima (Adyacente/Badge)**: e.g. `Pico: 9.0 · 13m 00s · hace 31d`.
2. **Desglose de Desgaste**:
   - Días sin cante vs Días sin repaso explicados con claridad.
   - Gráfico de barra de retención de Ebbinghaus ($R\%$) con micro-diagnóstico.
3. **Acciones Rápidas de Rescate**:
   - Botón directo para cantar y registrar la sesión, refrescando el tema al 100% al instante.

---

## 4. Archivos a Modificar
1. `src/lib/preparationScore.ts`:
   - Reescribir `evaluateTopicPreparation` con el modelo multiplicativo continuo.
   - Añadir campos `projectedScore`, `peakScore`, `effectiveDaysElapsed`, `decayRatio`, `retentionPct`.
2. `src/components/PreparadorView.tsx`:
   - Ordenar sesiones cronológicamente descendente de forma estricta.
   - Actualizar el renderizado de cada tarjeta de tema mostrando la nota proyectada en grande y la nota pico al lado.
   - Actualizar los KPIs superiores del Preparador para reflejar la nota media real proyectada del día.

---

## 5. Criterios de Aceptación
- Un tema cantado hace 30 días con nota 9.0 debe mostrar una nota proyectada de $\approx 3.2 - 4.0$ en lugar de 9.0.
- Si se registra un repaso de estudio hoy, la nota se recupera al $\approx 5.5 - 6.5$ (50% de freno).
- Si se canta el tema hoy en tiempo reglamentario, la nota salta al $\approx 9.0 - 10.0$ (100% de freno).
- Compilación y linter 100% limpios sin errores.
