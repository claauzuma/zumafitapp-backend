# Auditoría completa del motor central de generación nutricional

Fecha de cierre: 2026-08-25  
Repositorios auditados: `zumafitront` y `generadordecomidas`  
Estado: implementación central terminada; validación técnica completa; un riesgo funcional de catálogo real documentado y deliberadamente no migrado.

## 1. Qué encontré al retomar

- Ambos working trees seguían sucios con cambios acumulados de las tareas anteriores. No se ejecutó `reset`, `clean`, checkout destructivo ni reversión.
- El benchmark que había quedado con la salida truncada sí había terminado y había escrito un JSON válido.
- El fix de `plannedMealNutrition` estaba completo en el árbol, aunque sus archivos eran nuevos y por eso no aparecían en un `git diff` normal de archivos tracked.
- La regresión puntual del fix pasó antes de continuar: 16/16 pruebas del planner.
- Las suites completas terminaron verdes: backend 369/369 y frontend 295/295.
- No se detectó un cambio parcial en el combinador, solver, policy central ni adaptador frontend.

## 2. Arquitectura final: una sola ruta central

```text
UI / planner diario / equivalencias
        |
        v
endpoints clientOwnMenus existentes
        |
        v
foodCombinationCandidates (mismo combinador)
        |
        v
ServicioAlimentos.generarCantidades -> menu2 (mismo solver)
        |
        v
mealNutritionPolicy (única evaluación/clasificación generation-only)
        |
        v
nutrition/status/warning canónicos
        |
        v
mealNutritionResult (adaptador frontend sin thresholds)
```

No se creó un segundo combinador, un segundo solver ni una segunda clasificación nutricional paralela. La policy nueva se habilita sólo mediante un contexto interno autorizado para generación de comidas. Tracking no envía ese contexto y mantiene su ranking histórico.

La frontera estructural previa se conserva: el combinador sigue produciendo un batch final de hasta 32 candidatos con representantes de estructuras opcionales antes de completar con candidatos base.

## 3. Archivos y contratos relevantes

### Backend

| Archivo | Responsabilidad final |
|---|---|
| `servicio/mealNutritionPolicy.js` | Única evaluación y comparación nutricional del flujo central de generación. Produce zonas, diferencias, status y warning canónico. |
| `servicio/mealAlternativeGenerator.js` | Reutiliza combinador y solver existentes; conserva soluciones físicas, ejecuta rondas, retorna RECOMMENDED o BEST_EFFORT usable; NO_SOLUTION sólo sin solución física válida. Evalúa todos-locked. |
| `menu2.js` | Mismo solver. Selecciona el comparator nuevo únicamente con la policy interna de generación; Tracking continúa en la rama legacy. Mantiene MIN/MAX/STEP, locks y búsqueda discreta. |
| `servicio/alimentos.js` | Propaga la policy sólo con autorización interna; el endpoint genérico externo no puede activarla. |
| `servicio/foodCombinationCandidates.js` | Mantiene ONLY_SELECTED/ALLOW_SUGGESTIONS y la frontera estructural de 32 candidatos. |
| `servicio/clientOwnMenus.js` | Contratos de generar comida, equivalencia y recálculo. |
| `router/clienteMenus.js`, `controlador/clientOwnMenus.js` | Rutas existentes; no se creó un motor alternativo. |
| `tests/mealNutritionPolicy.test.js` | Comparator, simetría de proteína, status y warning. |
| `tests/mealAlternativeGenerator.test.js` | Rondas, modos, locks, recálculo, overshoot físico, BEST_EFFORT y NO_SOLUTION. |
| `tests/foodCombinationCandidates.test.js` | Semántica de modos, roles, mealTypes, determinismo y diversidad del batch 32. |

### Frontend

| Archivo | Responsabilidad final |
|---|---|
| `src/nutricion/mealNutritionResult.js` | Adapta el assessment backend de distintos envelopes. No recalcula kcal/P/C/G ni aplica umbrales locales. |
| `src/clientMenus/clientMenuGeneration.js` | Generación individual y diaria; acepta toda alternativa central `usable`, conserva assessment y warning. |
| `src/clientMenus/clientMenuDayPlanner.js` | Distribución diaria, preservación, carry y remaining. No crea una clasificación nutricional diaria. |
| `src/clientMenus/clientMenuPreview.js` | Agrega estados centrales para la review: verde, ámbar usable o rojo bloqueante. |
| `src/clientMenus/ClientMenuCreatePage.jsx` | Regeneración y preview diaria conectadas al assessment central. |
| `src/entrenado/menu/menuEquivalentMeal.js` | Feedback de equivalencia basado en status/usable/warning central. |
| `src/entrenado/menu/EquivalentMealBuilder.jsx` | Generar alternativa, recorrer opciones y recalcular con locks; BEST_EFFORT se puede aceptar, NO_SOLUTION bloquea. |

## 4. Ranking nutricional final

La policy se llama `meal_generation_balanced_v1`.

1. Primero se respetan constraints físicos y estructurales: alimentos permitidos, selección, exclusiones, locks, unidades, MIN/MAX/STEP y ronda efectiva.
2. Se diferencia estar dentro o fuera de la ventana cercana de calorías (±10 kcal).
3. Dentro de esa ventana, una mejora real de banda proteica tiene prioridad fuerte.
4. Dentro de la misma banda proteica vuelve a mandar el menor error calórico.
5. Luego se compara distancia proteica simétrica.
6. Finalmente se compara el error secundario de carbohidratos y grasas normalizado por energía: `4 × |ΔC|` y `9 × |ΔG|`.
7. Sólo después entran los tie-breakers estables de estructura, preferencia y firma.

Zonas usadas:

- Calorías: EXCELLENT hasta 5 kcal; ACCEPTABLE hasta 10 kcal.
- Proteína: EXCELLENT hasta 2,5 g; REASONABLE hasta 5 g; DEVIATED hasta 10 g; fuera de rango por encima de 10 g.
- La distancia de proteína es simétrica: un déficit de 5 g y un exceso de 5 g reciben la misma distancia.
- Para que sea RECOMMENDED también deben quedar razonables C/G según tolerancias energéticas: carbohidratos `max(48 kcal, 15%)`; grasas `max(45 kcal, 20%)`.

Ejemplos ejecutados:

| Target | Opción A | Opción B | Ganador | Motivo |
|---|---|---|---|---|
| 776 kcal / P57,6 | 775 / P65 | 770 / P59 | B | Ambas kcal están cerca; B mejora proteína de 7,4 g de exceso a 1,4 g. |
| 776 kcal / P57,6 | 776 / P68 | 773 / P58 | B | La mejora proteica domina unas pocas kcal dentro de la ventana. |
| 776 kcal / P57,6 | 775 / P58,5 | 770 / P58 | A | Ambas proteínas son excelentes; gana el error calórico de 1 kcal. |
| 776 kcal / P57,6 | 776 / P58 | 744 / P57,6 | A | La segunda está claramente fuera de la ventana calórica. |

## 5. Estados centrales

### RECOMMENDED

- Existe una solución física válida.
- Calorías, proteína y rangos energéticos secundarios satisfacen la policy.
- `recommended=true`, `usable=true`, sin warning nutricional fuerte.

### BEST_EFFORT

- Existe una solución física válida, pero no alcanza todos los criterios de RECOMMENDED.
- `recommended=false`, `usable=true`.
- Se devuelve la mejor opción física tras evaluar las rondas pertinentes.
- La UI muestra un aviso ámbar con diferencias y razones centrales y permite “Usar igualmente”.

### NO_SOLUTION

- No existe una solución física válida bajo constraints duros, o el alimento requerido está deshabilitado/incompatible estructuralmente.
- `usable=false` y la UI bloquea aplicación/activación.
- Ya no se usa para esconder una solución imperfecta pero físicamente válida.

Casos confirmados:

- Dos unidades mínimas que fuerzan 120 kcal contra target 100: BEST_EFFORT usable, no falso NO_SOLUTION.
- Siguiente paso discreto 60→120: elige 120 cuando es físicamente mejor, aunque quede +20.
- Lock válido que obliga más de +10 kcal: conserva el lock y retorna BEST_EFFORT.
- Lock fuera de MAX o fuera de grilla: NO_SOLUTION; MAX nunca se relaja.
- Alimentos DISABLED requeridos: bloqueo explícito.

## 6. Rondas y locks

| Ronda | Qué puede cambiar | Qué nunca cambia |
|---|---|---|
| STRICT | Nada; usa las reglas efectivas. | MAX, locks, unidad, selección y estructura. |
| RELAX_STEP | En continuos g/ml, un step 10 puede pasar a 5. | Steps discretos, MAX y locks. |
| RELAX_MIN | En continuos g/ml puede bajar el mínimo hasta 20 unidades conservando la grilla efectiva. | Mínimos discretos, MAX y locks. |

Pruebas reales/sintéticas:

- STRICT: 200 kcal, P30, C20, G0; RECOMMENDED.
- RELAX_STEP: 185 kcal con cantidad continua 105 g + 80 g; RECOMMENDED.
- RELAX_MIN: 165 kcal con 100 g + 65 g; RECOMMENDED.
- 0 locks, 1 lock, 2 locks, 4 alimentos con 2 locks, todos locked y desbloqueo posterior.
- Todos locked se evalúa sin cambiar cantidades y puede ser BEST_EFFORT usable.
- Recálculo conserva exactamente el conjunto de alimentos; no invoca el combinador ni agrega terceros.

Caso real Arroz + Banana + Pechuga, target 776 / P57,6 / C94,6 / G15,6:

| Caso | Cantidades | Total | Estado/ronda |
|---|---|---|---|
| selected-only, sin locks | Arroz 110 g; Banana 180 g; Pechuga 220 g | 775,83 / P59,18 / C119,95 / G6,59 | BEST_EFFORT / STRICT |
| recálculo, sin locks | 135 g; 110 g; 200 g | 775,98 / P56,01 / C124,48 / G6,01 | BEST_EFFORT / RELAX_STEP |
| Pechuga 250 g fija | 95 g; 200 g; 250 g | 776,03 / P64,8 / C112,73 / G7,32 | BEST_EFFORT / RELAX_STEP |
| Arroz 100 + Banana 180 fijos | 100 g; 180 g; 250 g | 775,13 / P64,98 / C112,4 / G7,29 | BEST_EFFORT / STRICT |
| todos fijos | 100 g; 180 g; 250 g | mismo total | BEST_EFFORT / STRICT, exactos |

La combinación histórica 100/180/250 existe, pero el ranking actual encuentra una alternativa con proteína mejor. No se atribuyó el resultado histórico a la versión actual sin evidencia.

## 7. Bug real corregido: `plannedMealNutrition`

### Reproducción

Input preservado:

```js
{
  target: { kcal: 300, proteina: 25, carbs: 40, grasas: 8 },
  items: [{ cantidad: 100, kcal: 165, proteina: 31, carbs: 0, grasas: 0 }]
}
```

Antes devolvía `{ kcal:165, proteina:31, carbs:40, grasas:8 }`. Era incorrecto: C0/G0 eran resultados físicos reales, no campos ausentes.

### Causa raíz

La selección de fuente usaba una condición equivalente a `suma > 0`. Eso confundía:

- nutriente presente con valor físico 0;
- nutriente ausente en un item legacy.

Además, una normalización genérica podía priorizar `meal.target`, que es intención, no consumo o planificación física.

### Cambio mínimo

- Se detecta presencia por campo y alias numérico, incluyendo el valor 0.
- Si un item trae el nutriente, se usa la suma de items.
- Si los items legacy lo omiten, se usa sólo un agregado real explícito (`nutrition.totals`, `totals`, `totales` o campos reales de la comida).
- Nunca se usa `meal.target` como resultado físico.
- Si no existe ninguna fuente real, el nutriente queda en 0.

### Regresiones agregadas

- `plannedMealNutrition conserva ceros físicos en vez de reemplazarlos por la meta declarada`.
- `plannedMealNutrition distingue un nutriente ausente de un total real agregado`.
- Sigue pasando `plannedMealNutrition ignora la meta declarada cuando hay resultado físico`.

Resultado aislado: 16/16 tests. El cambio afecta únicamente el planner diario/frontend; no toca combinador, solver, comparator ni policy.

Antes del arreglo podían calcularse mal días parciales, carry y regeneraciones cuando una comida preservada tenía C/G reales en cero o campos legacy parcialmente ausentes.

## 8. Carry y errores documentales previos

El caso ejecutado usa target diario 2100 y distribución 30/30/40:

1. Primera meta: 630 kcal. Resultado real: 575. El faltante correcto es **55 kcal**, no 25.
2. Remaining: 1525 kcal. Meta recalculada de la segunda comida: `1525 × 30/70 = 653,57`.
3. Resultado real: 615. La diferencia es un **faltante de 38,57 kcal**, no un exceso.
4. El último target recibe 910 kcal y el día termina exactamente en 2100.

Los tests actuales verifican `remainingBefore` 1525 y el target final 910. Por lo tanto, ambas frases antiguas eran errores de documentación; el cálculo real del código es correcto.

## 9. Auditoría end-to-end de días completos

Se ejecutaron 12 días base: tres seeds/targets por cada cantidad 3, 4, 5 y 6, combinando distribución equilibrada/personalizada y objetivos bajos, medios, altos y altos en proteína.

| Caso | Target diario | Total real | Δ kcal | Comidas REC/BE | Resultado |
|---|---|---|---:|---:|---|
| 3-low-balanced | 1500 / P105 / C157,5 / G50 | 1499,87 / P106,19 / C181,15 / G38,95 | -0,13 | 2/1 | PASS |
| 3-medium-custom | 2100 / P140 / C238,75 / G65 | 2099,39 / P138,65 / C247,8 / G61,51 | -0,61 | 3/0 | PASS |
| 3-high-protein | 1800 / P180 / C146,25 / G55 | 1795,5 / P175,78 / C140,3 / G59,02 | -4,5 | 3/0 | PASS |
| 4-low-custom | 1700 / P120 / C181,25 / G55 | 1700,01 | +0,01 | 4/0 | PASS |
| 4-medium-balanced | 2000 / P140 / C225 / G60 | 1998,94 / P142,45 / C250,19 / G50 | -1,06 | 3/1 | PASS |
| 4-high-balanced | 2400 / P165 / C266,25 / G75 | 2396,05 | -3,95 | 4/0 | PASS |
| 5-low-balanced | 1900 / P135 / C205 / G60 | 1890,51 | -9,49 | 5/0 | PASS |
| 5-medium-custom | 2300 / P170 / C247,5 / G70 | 2300,46 / P172,25 / C253,96 / G66,18 | +0,46 | 5/0 | PASS |
| 5-high-balanced | 2800 / P195 / C313,75 / G85 | 2799,89 | -0,11 | 5/0 | PASS |
| 6-low-custom | 2200 / P150 / C242,5 / G70 | 2199,92 | -0,08 | 4/2 | PASS |
| 6-medium-balanced | 2600 / P190 / C280 / G80 | 2599,9 / P191,46 / C346,9 / G49,62 | -0,1 | 4/2 | PASS |
| 6-high-balanced | 3000 | 2999,94 | -0,06 | 6/0 | PASS |

En 6 comidas puede aparecer un carry final con carbohidratos ya excedidos y grasa pendiente. El planner clampa el target siguiente a valores no negativos, el solver devuelve la mejor combinación estructural y la clasifica BEST_EFFORT con warning. No se oculta la desalineación ni se inventa una clasificación diaria verde.

El reporte trazado completo incluye, para cada comida: remaining antes, target, alimentos/cantidades, totales, status y remaining posterior.

## 10. Días parciales y preservación

| Escenario | Preservadas | Generadas | Resultado |
|---|---:|---:|---|
| Día vacío | 0 | 4 | PASS |
| Una comida con C0/G0 reales | 1 | 3 | PASS; descuenta 165/P31/C0/G0. |
| Dos comidas existentes | 2 | 2 | PASS; no muta las originales. |
| Comida creada previamente por meta con contenido | 1 | 3 | PASS; usa sus 355/P24/C42/G9 reales, no target 400/P30/C45/G10. |
| Slot con target pero sin alimento/cantidad | 0 | 4 | PASS; no se considera preservado. |
| Items con kcal/P y C/G ausentes | 1 | 3 | PASS; C/G no se inventan desde target. |
| Items legacy + agregado real C0/G0 | 1 | 3 | PASS; usa el agregado real. |

Todas las comidas manuales/preexistentes conservaron identidad, alimentos, cantidades y posición esperada.

## 11. Regeneración y “otra opción”

- Regenerar intermedia: 2 llamadas; preserva la manual y las generadas anteriores; recalcula la solicitada y las posteriores porque cambió el carry.
- Regenerar última: 1 llamada; preserva las tres anteriores.
- Regenerar día completo: 3 llamadas en el fixture parcial; preserva sólo la comida originalmente manual.
- “Otra opción”: seis seeds sobre el mismo target produjeron seis fingerprints diarios distintos, sin repeticiones.
- Cada slot usa un `variantSeed` estable; el backend elige dentro del pool de mejores alternativas sin romper constraints.
- El recálculo de los mismos alimentos no busca deliberadamente una distribución peor; “otra combinación” pertenece al pool exterior de generación.

## 12. Modos, catálogo real y adversariales

### Confirmado

- ONLY_SELECTED_FOODS usa exactamente los elegidos y devuelve BEST_EFFORT si son físicos pero imperfectos.
- Un slot selected-only sin selección hace el fallback existente a GENERIC.
- ALLOW_SUGGESTIONS conserva required y completa sólo con GENERIC compatibles.
- EXPLICIT_ONLY configurado con rol entra cuando fue elegido explícitamente.
- DISABLED no se sugiere y como required falla claramente.
- GENERIC respeta roles, mealTypes y portionRule.
- Gramos, ml sintético, unidades discretas, MIN/MAX/STEP y locks están cubiertos.
- MAX nunca se relaja.

### Hallazgo real del catálogo

Snapshot actual:

- 574 alimentos.
- 191 GENERIC con `generation` persistido.
- 383 normalizados como EXPLICIT_ONLY.
- Los 383 EXPLICIT_ONLY tienen cero roles configurados.

El caso real “Bife de chorizo magro” elegido para almuerzo en modo asistido falló con `NO_COMPATIBLE_FOOD_COMBINATION`: el alimento requerido no puede ocupar un rol estructural. Desayuno había generado correctamente; almuerzo tuvo cero candidatos.

Esto no prueba una regresión del ranking: el fixture sintético EXPLICIT_ONLY con rol funciona. Es una limitación funcional/configuracional del catálogo real. Resolverla exige decidir roles alimento por alimento o definir explícitamente una semántica de inferencia; ambas opciones estaban fuera del alcance y no se realizó una migración silenciosa.

El audit existente del catálogo reporta además 189 GENERIC con portionRule incompleta. No se modificó ninguno; el detalle permanece en `artifacts/food-generation-curation/catalog-audit.json`.

## 13. Warning y UI unificados

Caso ejecutado: target 776/P57,6/C94,6/G15,6; resultado 772/P86,2/C76,5/G13,5.

- Status central: BEST_EFFORT usable.
- Zona de calorías: EXCELLENT.
- Resumen: “Las calorías están alineadas, pero el reparto de macros queda desbalanceado”.
- Reasons: exceso de proteína y desvío de carbohidratos.
- No aparece “No completa la meta calórica”.
- Los reason codes se deduplican.

Presentación:

- RECOMMENDED: verde/compacto, sin warning fuerte.
- BEST_EFFORT: ámbar, diferencias firmadas, una sola advertencia y CTA habilitado.
- NO_SOLUTION: rojo/bloqueante, sin preview activable.

El frontend central sólo adapta status, usable y warning. No contiene los thresholds del comparator.

## 14. Consumers auditados

| Flujo | Ruta/consumidor | Resultado |
|---|---|---|
| Generar comida | `automatic-meal/generate` → `clientMenuGeneration` | Assessment central preservado. |
| Menú automático diario | `ClientMenuGenerator`, quick action de `MenuPlan`, planner secuencial | Assessment por comida; carry real; BEST_EFFORT usable. |
| Regeneración individual/día | `ClientMenuCreatePage` | Preserva lo debido y recalcula desde el punto afectado. |
| Generar otra opción | pool de alternativas + seed en `EquivalentMealBuilder`/generación | Variantes utilizables y deterministas por seed. |
| Selected-only | mismo endpoint/combinador/solver | Mejor solución física, incluso imperfecta. |
| Assisted/suggestions | mismo endpoint/combinador/solver | Required + GENERIC compatibles. |
| Equivalencia/reemplazo | `equivalent-alternatives/generate` | Usa el assessment central. |
| Recalcular cantidades equivalentes | `equivalent-alternatives/recalculate` | Mismos foods, locks exactos, assessment central. |
| Review diaria | `clientMenuPreview` + `ClientMenuCreatePage` | Precedencia NO_SOLUTION > BEST_EFFORT > RECOMMENDED. |

Superficies deliberadamente aisladas:

- Tracking usa `/tracking/day/calculate-quantities` y su policy histórica `calorie_fill`; pasó regresión dirigida.
- Admin y Coach usan el endpoint genérico `/alimentos/generar-cantidades`, no el contrato central de alternativas. No existe hoy un endpoint Coach que invoque directamente `automatic-meal/generate`.
- Esas superficies legacy no reciben el mismo objeto nutricional central; por eso no se forzó una migración transversal que habría cambiado su semántica.

## 15. Diversidad estructural

Con límite 32 y catálogo real:

| mealType | candidatos | estructuras únicas | Cobertura disponible |
|---|---:|---:|---|
| breakfast | 32 | 8 | P2, C2, F, G; V no disponible físicamente. |
| lunch | 32 | 8 | P2, V, F, G; C2 no disponible físicamente. |
| snack | 32 | 8 | P2, C2, F, G; V no disponible físicamente. |
| dinner | 32 | 8 | P2, V, F, G; C2 no disponible físicamente. |
| extraSnack | 32 | 8 | P2, C2, F, G; V no disponible físicamente. |

La cobertura se compara contra roles físicamente disponibles para cada mealType; no se marca como regresión la ausencia de un rol que el catálogo no ofrece. El orden es determinista, no hay duplicados y todos los required se conservan.

## 16. Benchmarks

Benchmark del solver/combinador sobre un único snapshot Mongo, cinco mealTypes, seed fija, dos muestras de candidate generation y una del solver por celda:

| límite | casos | promedio solver | min–max | RECOMMENDED | BEST_EFFORT | ejecuciones físicas promedio |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 5 | 160,89 ms | 136,71–202,98 | 2 | 3 | 2,2 |
| 10 | 5 | 253,90 ms | 214,50–318,70 | 5 | 0 | 10 |
| 32 | 5 | 571,03 ms | 487,74–641,85 | 5 | 0 | 32 |
| 40 | 5 | 647,57 ms | 533,46–720,70 | 5 | 0 | 40 |

Candidate generation promedio: límite 1 = 138,32 ms; 10 = 138,81 ms; 32 = 177,76 ms; 40 = 201,61 ms. Todas las muestras fueron deterministas.

Performance end-to-end del día completo, tres casos reales por cantidad:

| comidas | promedio | p95 observado | máximo | calls/día |
|---:|---:|---:|---:|---:|
| 3 | 1391,41 ms | 2193,71 ms | 2193,71 ms | 3 |
| 4 | 1601,36 ms | 1970,05 ms | 1970,05 ms | 4 |
| 5 | 1959,41 ms | 2303,92 ms | 2303,92 ms | 5 |
| 6 | 3462,81 ms | 4210,89 ms | 4210,89 ms | 6 |

El “p95” de día es el máximo observado porque sólo hay tres muestras por cantidad; sirve como smoke comparativo, no como p95 de producción definitivo.

## 17. Pruebas ejecutadas

### Dirigidas

- Planner puntual: 16/16.
- Planner + integración diaria después del fix: 23/23.
- Comparator/generador/combinador/contratos/Tracking: 114/114 en 12,52 s.
- Tracking aislado (`foodQuantityContract`, `trackingCalorieFillPolicy`, `trackingQuantityEngine`): 40/40.
- Auditoría central con catálogo: 2/2 policy, 14/14 contratos, warning consistente y cobertura estructural PASS.
- Auditoría diaria: 30 escenarios, 29 PASS y 1 hallazgo configuracional reproducido; 111 llamadas reales al solver; 101 comidas RECOMMENDED y 11 BEST_EFFORT.

### Suites y calidad

- Backend completo: 369/369, 0 fallos, 15,84 s.
- Frontend completo: 295/295, 0 fallos, 0,99 s en la repetición resumida.
- Build Vite: PASS, 1957 módulos, 13,36 s.
- ESLint dirigido sobre 13 archivos centrales frontend: PASS.
- `node --check` sobre producción y runners backend relevantes: PASS.
- `git diff --check` en frontend y backend: PASS. Sólo avisos informativos LF→CRLF.

### Qué demuestran los grupos principales

- `mealNutritionPolicy.test.js` (10): cuatro comparaciones obligatorias, simetría de proteína, límites RECOMMENDED, exceso proteico, 772/776 sin warning contradictorio, C/G energético y determinismo/overshoot.
- `mealAlternativeGenerator.test.js`: ALLOW/ONLY, required/excluded, EXPLICIT_ONLY, rondas, reglas generation vs legacy, mejor BEST_EFFORT físico, recálculo sin combinador, 0/1/2/todos locks, MAX/grilla, overshoot por mínimos/step y permisos.
- `foodCombinationCandidates.test.js`: núcleo P1+C1, 32 estructuras programáticas, modos, mealTypes, multirrol, legacy, determinismo, límite, required y frontera P2/C2/V/F/G.
- `clientMenuDayPlanner.test.js` (16): 500 seeds por cantidad, distribución manual, slots vacíos, 0–4 preservadas, 3–6 comidas, carry, targets factibles, proteína imposible y bug cero/ausencia.
- `clientMenuGenerationIntegration.test.js` (7): día parcial, selected-only, assisted, carry real, BEST_EFFORT usable, NO_SOLUTION bloqueante y no repetición.
- `mealNutritionResult.test.js` (5): mismos statuses/warnings para distintos envelopes sin recalcular nutrientes.
- `clientMenuPreview.test.js` (7): totales, regeneración, activación sin tracking, RECOMMENDED/BEST_EFFORT/NO_SOLUTION y fallback legacy neutral.
- `menuEquivalentMeal.test.js` (13): permisos, alternativas, recálculo, todos locked y warning central.

## 18. Seguridad del smoke Mongo

En auditoría diaria, auditoría central y benchmark:

- Documentos antes/después: 574 → 574.
- Lecturas directas por runner: 2.
- Escrituras directas: 0.
- Fingerprint completo del catálogo antes/después: `b979ad885318581c20b3bb0855bde38f2ec7f2ae77ddca2c7d3ef82f3f86fe3e`.
- Fingerprint de `generation` antes/después: `e80d0a9b7455a65f9caa5cc6c512eec4254bd43165cce58fe6f3cfcb0d7dc386`.

No se modificaron curación, roles, mealTypes, portionRules ni datos nutricionales legacy.

## 19. Riesgos y pendientes reales

1. **EXPLICIT_ONLY legacy sin roles:** es el único fallo funcional reproducido contra catálogo real. Una selección explícita sin rol estructural no puede combinarse. Requiere una decisión de datos/producto; no debe resolverse inventando roles silenciosamente.
2. **Calidad C/G en días de 6 comidas:** el carry puede volver físicamente difícil el reparto final aunque cierre kcal/proteína. Se informa como BEST_EFFORT; no es un falso éxito.
3. **Performance end-to-end:** 6 comidas llegó a 4,21 s en la muestra local. No es bloqueo ni regresión demostrada, pero merece observabilidad/p95 real en producción.
4. **Cobertura real de ml:** no hay alimentos GENERIC en ml en el snapshot; el contrato ml está validado sintéticamente.
5. **portionRule incompleta:** 189 GENERIC siguen dependiendo de reglas incompletas/fallbacks según el audit de catálogo. No se tocaron en esta tarea.
6. **Parámetro legacy de variante en recálculo:** el frontend aún puede enviar intención de variante, pero el backend conserva el óptimo central para los mismos foods. “Otra opción” funciona mediante el pool de generación; es deuda de limpieza contractual, no pérdida funcional observada.

## 20. Conclusión

La mejora del motor central quedó terminada y validada:

- ranking kcal → banda proteica fuerte → C/G energético;
- Tracking aislado e intacto;
- RECOMMENDED/BEST_EFFORT/NO_SOLUTION coherentes;
- mejores soluciones físicas expuestas en ONLY_SELECTED;
- locks y rondas respetados, MAX siempre duro;
- warning central único y UI consistente;
- carry, parciales, regeneración, diversidad y performance auditados;
- bug de ceros reales corregido con regresión.

No se creó un segundo combiner, solver o classifier. No se escribió Mongo. No se hizo commit, push ni deploy.

## 21. Artefactos de evidencia

- `artifacts/automatic-daily-menu-audit/automatic-daily-menu-functional-audit.json`: todos los inputs, comidas, cantidades, trazas, assessments y diferencias.
- `artifacts/automatic-daily-menu-audit/AUTOMATIC_DAILY_MENU_FUNCTIONAL_AUDIT.md`: trazas humanas de los 30 escenarios.
- `artifacts/central-contract-audit/nutrition-contract-functional-audit.json`: policy, rondas, locks, modos, warning y catálogo.
- `artifacts/central-contract-audit/NUTRITION_CONTRACT_FUNCTIONAL_AUDIT.md`: resumen de contratos.
- `artifacts/central-contract-audit/combination-probe-functional-audit.json`: benchmark 1/10/32/40 y seguridad Mongo.
- `artifacts/meal-ranking-audit/arroz-banana-pechuga-ranking.json`: enumeración/ranking del caso real.
- `artifacts/food-generation-curation/catalog-audit.json`: estado completo del catálogo y portionRules incompletas.
