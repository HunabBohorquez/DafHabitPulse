# # HabitPulse — Analizador de Hábitos y Correlaciones Estadísticas

> **Enlaces del proyecto**

**Link:** ` `

**Repositorio en GitHub:** ` `

> 📝 **Nota:** este proyecto tiene los **mismos archivos** que el repositorio de GitLab
> (`index.html`, `styles.css`, `app.js`, `README.md`). Solo cambia la plataforma de alojamiento.

---

## Descripción

HabitPulse es una aplicación web 100 % estática (HTML5, CSS3 y JavaScript ES6+ vanilla, sin dependencias) para registrar hábitos diarios y descubrir cuáles se relacionan con tu energía y tu estado de ánimo.

- **Hábitos:** crea y elimina hábitos (por defecto: Ejercicio 30 min, Dormir >= 7.5h, Lectura / Estudio, Hidratación 2L, Sin comida chatarra).
- **Registro diario:** para cualquier fecha, checkboxes por hábito más sueño (0–14 h), energía (1–10) y ánimo (1–10).
- **Mapa de calor:** 26 semanas (182 días), columnas semanales y filas Lunes→Domingo, 5 niveles de color (sin registro, <25 %, 25–49 %, 50–74 %, ≥75 %) con tooltip de fecha, % y valores. Al hacer clic en un día se carga en el panel de registro.
- **Constancia:** racha actual, récord histórico, tasa global y gráfico de barras en `<canvas>` con el % promedio por día de la semana.
- **Detective de correlaciones:** tarjetas ordenadas por impacto para cada hábito y para "Sueño ≥ 7.5h".
- **Persistencia** en `localStorage`, botón **Generar 90 Días Demo** (semilla fija) y exportación **JSON/CSV**.

## Fórmula de correlación de Pearson

Para cada hábito se crea una variable binaria `x` (1 = cumplido, 0 = no cumplido) y se correlaciona con `y` (energía o ánimo) sobre todos los días registrados:

```
r = Σ (xi − x̄)(yi − ȳ) / √( Σ(xi − x̄)² · Σ(yi − ȳ)² )
```

Con `x` binaria, r equivale a la correlación punto-biserial. Además se muestra el promedio de `y` en días cumplidos vs. no cumplidos y el cambio porcentual `(prom_sí − prom_no) / prom_no × 100`.

- **Fuerza:** |r| ≥ 0.70 Fuerte · ≥ 0.40 Moderada · ≥ 0.20 Débil · menor, Insignificante.
- **Varianza cero:** si `x` o `y` no varían (hábito siempre o nunca cumplido, o energía constante), `r` no existe; la app lo indica ("sin varianza suficiente") en lugar de mostrar `NaN`, y esos hábitos quedan al final del orden.
- **Orden:** por el mayor |r| entre energía y ánimo.
- "Sueño ≥ 7.5h" se evalúa a partir de las horas registradas, independientemente del hábito "Dormir >= 7.5h".

## Criterios de racha

- Un día **cuenta** si existe registro y el % de hábitos completados es **≥ 75 %**.
- **Racha actual:** días calendario consecutivos que cuentan, terminando hoy; si hoy aún no cumple, se parte desde ayer.
- **Récord:** la racha consecutiva más larga en todo el historial.
- **Tasa global:** promedio del % de cumplimiento de los días registrados.

## Instrucciones de ejecución

1. Guarda `index.html`, `styles.css`, `app.js` y `README.md` en la misma carpeta.
2. Abre `index.html` en cualquier navegador moderno. No requiere servidor ni instalación.
3. Pulsa **Generar 90 Días Demo** o empieza a registrar tus días.

## Pruebas Verificables

La demo usa un generador mulberry32 con semilla `20260101` y asigna los valores por posición (día 1 a 90, terminando hoy), por lo que **no depende de la fecha**. Al pulsar **Generar 90 Días Demo** debes ver:

| Métrica | Valor esperado |
|---|---|
| Días registrados | 90 |
| Días con sueño ≥ 7.5h | 48 (y 42 sin cumplir) |
| Tasa global de cumplimiento | 64 % |
| Récord de racha (≥ 75 %) | 7 días |
| Racha actual | 0 (hoy y ayer no alcanzan 75 %) |

Hallazgos esperados (Energía, días cumplidos vs. no cumplidos):

| Factor | Días sí / no | r Energía | Energía no → sí | r Ánimo |
|---|---|---|---|---|
| Ejercicio 30 min | 66 / 24 | +0.71 (Fuerte) | 4.8 → 7.8 (+64.3 %) | +0.44 |
| Lectura / Estudio | 57 / 33 | +0.09 | 6.8 → 7.1 (+5.4 %) | +0.57 |
| Dormir >= 7.5h | 48 / 42 | +0.54 | 5.9 → 8.0 (+35.3 %) | +0.23 |
| Sueño ≥ 7.5h | 48 / 42 | +0.54 | 5.9 → 8.0 (+35.3 %) | +0.23 |
| Sin comida chatarra | 50 / 40 | +0.25 | 6.5 → 7.4 (+15.0 %) | +0.53 |
| Hidratación 2L | 67 / 23 | +0.33 | 5.9 → 7.4 (+24.4 %) | +0.20 |

La primera tarjeta debe ser: *"Correlación Fuerte r = +0.71: cuando cumples 'Ejercicio 30 min', tu Energía promedio sube de 4.8 a 7.8 (+64.3%)"*.

Otras comprobaciones: el mapa de calor siempre tiene 26 × 7 = 182 celdas; el promedio por día de la semana sí varía según la fecha en que se genere la demo; con un hábito que nunca se cumple, su tarjeta indica que no hay variación suficiente.
