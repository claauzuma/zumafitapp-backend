# Informe final — diversidad estructural del combinador automático

Fecha de ejecución: 24 de agosto de 2026. Catálogo real: 574 alimentos. Todas las consultas integradas a Mongo fueron de sólo lectura y todas las generaciones fueron previews no persistidas.

## A. Causa raíz

`generateCombinationStructures()` arma las 32 estructuras mediante las 32 máscaras binarias posibles de los cinco roles opcionales `P2`, `C2`, `V`, `F` y `G`. Todas incluyen el núcleo `P1+C1`. Se ordenan primero por cantidad de roles y después por el orden canónico interno `P1,C1,P2,C2,V,F,G`.

Cada estructura se completa con pools de hasta 12 alimentos por rol. Con `limit=32`, el beam queda en 64: el producto potencial de `P1 x C1` puede ser 12×12=144, y el beam conserva hasta 64 estados. Eso alcanza de sobra para producir más de 32 candidatos simples.

El problema no era que las estructuras opcionales no se generaran. Se generaban y quedaban en el `Map` deduplicado. El problema era esta interacción:

1. Score anterior y todavía vigente como ranking base: `1000 + required*5 + preferred*1 - optionalCount*10 - foodCount`.
2. Un `P1+C1` sin required obtiene 998 puntos.
3. Una estructura con un opcional obtiene 987: pierde 10 por el rol y 1 por el alimento adicional.
4. El bonus preferred de 1 punto no compensa esa diferencia.
5. Todos los candidatos deduplicados se ordenaban globalmente por score.
6. El `slice(0, limit)` se aplicaba una sola vez, al final y globalmente.

Por eso decenas de variantes alimentarias `P1+C1` precedían a cualquier estructura opcional. El orden de enumeración contribuía al orden estable, pero la causa decisiva era score de simplicidad + multiplicidad de `P1+C1` + recorte global.

El baseline confirmó que había entre 1008 y 1024 candidatos internos con `limit=32`, distribuidos en 16 estructuras factibles, pero las 32 posiciones finales eran una única estructura. Subir a 100 sólo ocultaba parcialmente el problema y podía llevar al solver de 32 a 100 ejecuciones por ronda, hasta 300 en tres relajaciones.

## B. Arquitectura anterior

Flujo completo:

`target de comida` → normalización de meal type y restricciones → `generateFoodCombinationCandidates` → 32 estructuras → asignación de required → pools GENERIC filtrados por roles/mealTypes/exclusiones → deduplicación → score/ranking global → recorte → `generateMealAlternative` → `ServicioAlimentos.generarCantidades` con `tracking_calorie_fill_v1` → ranking nutricional → alternativa elegida.

El combinador sólo decide IDs, roles y estructura. No calcula gramos. El solver recibe cada candidato, usa nutrición real y `portionRule`, rechaza resultados inválidos o por encima de kcal, y prueba `STRICT`, `RELAX_STEP` y `RELAX_MIN`. Una solución se considera recomendable si no supera la meta calórica, queda a no más de 10 kcal por debajo y alcanza al menos `proteína objetivo - 2,5 g`.

## C. Cambio implementado

Se cambió únicamente la selección final dentro del combinador existente:

1. Se conserva el ranking global anterior y su mejor candidato.
2. Si el modo es `ALLOW_SUGGESTIONS` y existe truncado, se toma el mejor representante factible de cada rol opcional disponible.
3. También se toma el mejor representante de cada grado de complejidad disponible (`+2`, `+3`, etc.).
4. El presupuesto restante se completa con el ranking global original.

No son cupos fijos del tipo “cinco por rol”. La frontera consume sólo los representantes que realmente existen y cabe dentro del límite. En el catálogo actual eligió 8 representantes y 24 posiciones se completaron con el ranking habitual; el resultado final fue 25 candidatos base y 7 opcionales. `P1+C1` conserva mayoría y puede seguir ganando nutricionalmente.

`ONLY_SELECTED_FOODS` conserva el recorte global anterior. Si no hay truncado, también se devuelve el ranking completo anterior. El límite normal continúa en 32.

No se implementó fallback de fase 2: no fue necesario. El desayuno grande pasó a resolver en la primera ronda estricta y los 20 menús diarios posteriores resultaron exitosos.

## D. Archivos modificados en esta tarea

- `servicio/foodCombinationCandidates.js`: selector `selectStructurallyDiverseCandidates`, metadata diagnóstica del pool interno y de la selección.
- `tests/foodCombinationCandidates.test.js`: tests controlados de diversidad, cada rol opcional, required, mealTypes, determinismo y duplicados.
- `scripts/probeFoodCombinationCatalog.js`: instrumentación read-only de candidatos, tiempos y solver individual.
- `scripts/runFoodGenerationCurationSmoke.js`: tiempos diarios y diagnostics del solver por comida; no persiste menús.
- `scripts/compareFoodCombinationDiversity.js`: comparación reproducible de los cuatro informes before/after.
- `artifacts/food-combination-diversity/2026-08-24T18-00-00-000Z/`: baseline, after, ejemplos y comparación.

No se modificaron `mealAlternativeGenerator.js`, `ServicioAlimentos`, el orquestador diario, modelos de Mongo ni datos del catálogo como parte de esta tarea.

## E. P2

`P2` sigue siendo proteína secundaria opcional. Antes se generaba, pero su mejor estructura perdía 11 puntos frente a `P1+C1` y quedaba fuera del top 32. El test controlado `P1/P2/C1` demuestra que `P1+C1+P2` entra con límite 32. En Mongo real aparece en 2 candidatos de breakfast/snack/extraSnack y 3 de lunch/dinner. El desayuno real de 711,31 kcal ganó con `P1+C1+P2`.

## F. C2

`C2` sigue siendo carbohidrato secundario opcional. El test controlado demuestra `P1+C1+C2` con límite 32. En Mongo entra en 4 candidatos de breakfast/snack/extraSnack. En lunch/dinner queda en cero porque el catálogo real no tiene cobertura `C2` habilitada para esos momentos; el selector no inventa cobertura.

## G. V

`V` sigue siendo vegetal opcional. El test controlado demuestra `P1+C1+V`. En Mongo entra en 2 candidatos de lunch y dinner. Queda en cero en breakfast/snack/extraSnack por configuración real del catálogo.

## H. F

`F` sigue siendo fruta opcional. El test específico usa breakfast y demuestra `P1+C1+F`. En Mongo entra en 4 candidatos de cada meal type porque el catálogo curado tiene frutas GENERIC habilitadas también para lunch/dinner.

## I. G

`G` sigue siendo grasa/complemento opcional. El test controlado demuestra `P1+C1+G`. En Mongo entra en 3 candidatos de breakfast/snack/extraSnack y 4 de lunch/dinner.

## J. Before vs after — lote real de 32

| Meal type | Base antes/después | P2 | C2 | V | F | G | Estructuras únicas |
|---|---:|---:|---:|---:|---:|---:|---:|
| breakfast | 32 / 25 | 0 / 2 | 0 / 4 | 0 / 0 | 0 / 4 | 0 / 3 | 1 / 8 |
| lunch | 32 / 25 | 0 / 3 | 0 / 0 | 0 / 2 | 0 / 4 | 0 / 4 | 1 / 8 |
| snack | 32 / 25 | 0 / 2 | 0 / 4 | 0 / 0 | 0 / 4 | 0 / 3 | 1 / 8 |
| dinner | 32 / 25 | 0 / 3 | 0 / 0 | 0 / 2 | 0 / 4 | 0 / 4 | 1 / 8 |
| extraSnack | 32 / 25 | 0 / 2 | 0 / 4 | 0 / 0 | 0 / 4 | 0 / 3 | 1 / 8 |

El pool interno no aumentó: 1008/1024 candidatos antes y exactamente 1008/1024 después para los respectivos momentos. Sólo cambió la política del recorte final.

## K. Pruebas reales y comidas concretas

Ejemplo 1 — desayuno, seed `curation-real-3-1`:

- Target: 711,31 kcal; P 49,86; C 83,10; G 19,94.
- Estructura: `P1+C1+P2`.
- Avena instantánea: 110 g.
- Claras de huevo: 3 unidades.
- Huevos: 4 unidades.
- Resultado: 710,30 kcal; P 48,80; C 63,30; G 29,10.
- Primera ronda `STRICT`, 32 soluciones físicas, 2 recomendadas.

Ejemplo 2 — almuerzo, mismo seed:

- Target: 783,66 kcal; P 55,47; C 102,34; G 16,94.
- Estructura: `P1+C1+P2+V+F+G`.
- Aceite de coco 20 g, ananá 80 g, arroz 90 g, atún 1 pote, berenjena 250 g y claras 5 unidades.
- Resultado: 783,37 kcal; P 57,63; C 88,20; G 22,23.
- Primera ronda `STRICT`, 32 soluciones físicas, 15 recomendadas.

Ejemplo 3 — merienda, seed `curation-real-4-1`:

- Target: 596,14 kcal; P 37,40; C 64,50; G 20,95.
- Estructura: `P1+C1+C2+F+G`.
- Almendras 3 unidades, ananá 220 g, avena 95 g, claras 7 unidades y copos de maíz 5 g.
- Resultado: 596,04 kcal; P 39,06; C 82,16; G 12,36.

El archivo `COMPARISON.md` contiene también ejemplos de cena, snack y colación con cantidades y macros completos.

Revisión culinaria basada en metadata: aparecieron 9 almuerzos/cenas cuya estructura incluía `F`; por ejemplo, atún + arroz + ananá + aceite de coco. No se agregó ninguna regla por nombre. La combinación fue posible porque ananá está como `GENERIC`, rol `F`, con lunch/dinner habilitados. Es un riesgo de calidad del catálogo/configuración, no un fallo del nuevo selector.

## L. Planes de 3 comidas

Antes: 1/5 exitosos. Fallaron los seeds 1, 3, 4 y 5, todos en breakfast con `MEAL_TARGET_NOT_REACHABLE_WITH_PORTION_RULES`. En cada fallo se ejecutaron 96 candidatos (32 × 3 rondas), se obtuvieron 96 soluciones físicas y 0 recomendadas. El cuello de botella real era el lote exclusivamente `P1+C1`: no alcanzaba simultáneamente el déficit calórico máximo y el umbral proteico.

Después: 5/5 exitosos. El desayuno representativo de 711,31 kcal encontró 2 soluciones recomendadas en `STRICT` con 32 ejecuciones y eligió `P1+C1+P2`. No quedaron fallos de 3 comidas en esta muestra.

## M. Planes de 4, 5 y 6 comidas

| Cantidad | Antes | Después |
|---:|---:|---:|
| 4 | 5/5 | 5/5 |
| 5 | 5/5 | 5/5 |
| 6 | 5/5 | 5/5 |

No hubo regresión de éxito. Se usaron cinco seeds por cantidad porque 40 generaciones duplicadas before/after habrían requerido un costo temporal desproporcionado; 20 before + 20 after tardaron aproximadamente 268 segundos sólo en los smoke diarios.

## N. Macros y calorías

Comparación justa sobre los mismos 16 seeds que eran exitosos tanto antes como después:

| Nutriente | Error absoluto medio antes/después | Máximo antes/después |
|---|---:|---:|
| kcal | 0,83 / 0,48 | 1,85 / 0,99 |
| proteína | 17,88 / 8,92 g | 36,03 / 30,59 g |
| carbohidratos | 27,27 / 26,25 g | 76,15 / 56,69 g |
| grasas | 16,82 / 13,75 g | 37,58 / 26,38 g |

La mejora es medible, pero los macros no quedan perfectos. El solver mantiene prioridad fuerte sobre kcal y umbral de proteína; C/G son criterios secundarios y las porciones físicas limitan el cierre exacto.

## O. Performance

Tiempo de generación de candidatos, promedio de 10 muestras por meal type:

| Meal type | Antes ms | Después ms | p95 antes/después |
|---|---:|---:|---:|
| breakfast | 329,74 | 349,02 | 388,43 / 377,81 |
| lunch | 311,82 | 322,36 | 325,17 / 345,39 |
| snack | 318,73 | 354,09 | 335,47 / 402,48 |
| dinner | 299,90 | 319,47 | 328,66 / 344,83 |
| extraSnack | 327,54 | 325,48 | 337,93 / 354,21 |

La selección agrega un costo pequeño, sin multiplicar candidatos. Las ejecuciones del solver permanecen en 32 promedio/p50/p95/máximo después. El tiempo puro de ronda del solver cambió de 275,86 a 289,18 ms promedio. El tiempo total de una comida bajó de 1769,35 a 1285,60 ms promedio porque se evitaron relajaciones y búsquedas fallidas; p95 bajó de 2508 a 1708 ms. El día completo bajó de 7321,24 a 5787,18 ms promedio en las 20 corridas; p95 de 13468,31 a 9497,14 ms.

El probe individual grande breakfast pasó de 1583,01 ms, 96 ejecuciones y fallo a 1010,84 ms, 32 ejecuciones y éxito.

## P. Tests ejecutados

1. Baseline previo: `node --test tests/foodCombinationCandidates.test.js tests/mealAlternativeGenerator.test.js` — 46 passed, 0 failed, 2960 ms.
2. Combinador posterior: `node --test tests/foodCombinationCandidates.test.js` — 27 passed, 0 failed, 1238 ms.
3. Combinador + generador posterior: mismas dos suites — 55 passed, 0 failed, 2897 ms.
4. Backend relacionado (combinador, generador, menú automático, contrato de cantidades, matrices Tracking, equivalencias, assisted, Admin) — 157 passed, 0 failed, 4473 ms.
5. Frontend relacionado (Client Menu, planner diario, Solo elegidos, Combinar con otros, Tracking, equivalentes, quick actions, Admin) — 184 passed, 0 failed, 560 ms.
6. Backend completo: `npm test` — 350 passed, 0 failed, 6444 ms.
7. Frontend completo: `npm test` — 281 passed, 0 failed, 925 ms.
8. Build: `npm run build` — 1956 módulos, exitoso, 9,73 s.
9. Lint global: `npm run lint` — 14 errores y 7 warnings preexistentes en UI ajena a esta tarea; no se tocaron. Entre ellos `AdminNavBar.jsx`, `MobileMenu.jsx`, `Perfil.jsx`, `TrackingDiario.jsx`, `MenuGenerationSettingsWizard.jsx`, `ClienteDetalleProfesional.jsx` y `MealTargetTrackingPanel.jsx`.

Cobertura funcional de los tests nuevos: lote 32 no monopolizado; P2; C2; V; F en breakfast; G; base +1/+2; required en todos los candidatos; mealType negativo/positivo; orden idéntico con catálogo invertido; candidatos sin duplicados; mismo alimento no ocupa dos roles.

Las suites existentes verifican además: `EXPLICIT_ONLY`, `DISABLED`, legacy sin generation, exclusiones, conflicto required/excluded, preferred no hard, performance <1000 ms controlada, 32 estructuras, solver real, porciones estrictas, relajaciones, máximos hard, unidades discretas, ranking determinista, cálculo de 1 a 6 alimentos, 145 escenarios calorie-fill, 30 escenarios de mejora, 160 escenarios adversariales/random, recalcular con candados, equivalencias, no repeats y menú secuencial de 3 a 6 comidas.

## Q. Regresiones

- Generación individual: pasa `mealAlternativeGenerator` y probe real por cinco meal types.
- Solver: no modificado; pasan quantity contract, matrices y fuzz/oracle.
- Tracking: 145 escenarios base, 30 de mejora, matriz adversarial, assisted y quantity engine verdes.
- Equivalencias: permisos, IDs, unidades y seguridad verdes.
- Coach/Admin: suites de foods, quantity contract y permisos verdes.
- Menú diario: planner, integración, 3–6 comidas, remaining target y no repeats verdes.
- Solo elegidos: no consulta sugerencias y conserva exactamente required.
- Combinar con otros: required sigue siendo hard constraint.
- Explicit override: EXPLICIT_ONLY y mealType bypass sólo para required siguen verdes.
- No repeats/deduplicación: fingerprints y candidatos únicos siguen verdes.

## R. Riesgos pendientes

- Candidate diversity: corregido para el catálogo y límites actuales; riesgo residual bajo.
- `portionRule`: aproximadamente 189 GENERIC siguen incompletos. No se modificaron. Puede limitar cantidades o depender de fallbacks legacy.
- Calidad del catálogo: mealTypes/roles permiten algunas combinaciones matemáticamente válidas pero culinariamente discutibles, especialmente fruta en lunch/dinner. Debe curarse explícitamente, no con heurísticas por nombre.
- Solver: sigue priorizando kcal y proteína; C/G pueden quedar lejos. La mejora no equivale a optimización perfecta de macros.
- Performance: la selección es barata y el batch sigue en 32; se debe vigilar si el catálogo crece mucho porque la enumeración interna ya produce alrededor de 1000 candidatos por llamada.
- Lint frontend: deuda preexistente fuera del alcance de este cambio.

## S. Confirmación de arquitectura

- No se creó un segundo combinador.
- No se creó un segundo solver.
- Mongo no fue modificado.
- portionRule no fue modificada.
- La solución reutiliza el motor existente.

Los fingerprints fueron iguales antes/después en ambos harnesses read-only. El probe de combinación verificó 574/574 y el smoke diario 574/574. Los valores de hash entre harnesses no se comparan entre sí porque serializan proyecciones diferentes; dentro de cada harness el hash anterior y posterior fue idéntico.
