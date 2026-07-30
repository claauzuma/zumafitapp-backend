# Pruebas de selected-only y assisted

## Contrato

Ambas estrategias llegan a `POST /food-logs/day/calculate-quantities` con policy Tracking autorizada y terminan usando `tracking_calorie_fill_v1`. El techo calórico, unidades indivisibles y prioridad kcal > proteína > C/G pertenecen al motor existente.

## Casos dirigidos automatizados

| Caso | Selección | Esperado | Resultado |
|---|---|---|---|
| Selected incompleto | Pollo + arroz | No agrega alimentos; explica macro limitado | PASS |
| Selected con Manual | Arroz Manual + pollo Auto | Arroz idéntico; sólo pollo cambia | PASS |
| Assisted déficit grasa | Pollo + arroz | Sólo candidatos seguros del rol grasa | PASS |
| Assisted déficit proteína | Fuentes de C/G | Candidato proteico permitido | PASS |
| Assisted sin candidatos | Todos filtrados | Devuelve mejor solución elegida + warning | PASS |
| Restricción | Candidato bloqueado/deshabilitado | Nunca participa | PASS |
| Rechazado por usuario | ID en rechazados | No reaparece en esa propuesta | PASS |
| Duplicado/homónimo | Mismo ID/nombre ambiguo | Identidad exacta, sin duplicación | PASS |
| Unidades | Alimento por unidad | Cantidad múltiplo del step físico | PASS |
| Límite plan | Pro 6 / VIP 10 | No supera capacidad server-side | PASS |

Archivo principal: `tests/trackingAssistedFoodAddition.test.js`. También cubren capacidades `tests/clientNutritionCapabilities.test.js`, seguridad `tests/menuTrackingEquivalentPermissions.test.js` y motor las matrices históricas.

## Matrices de regresión ejecutadas

- Backend completo: 194/194 tests PASS.
- Matriz adversarial anterior: 54 fijos + 100 random + 6 diagnósticos.
- Calorie fill: 45 fijos + 100 random.
- Mejora dirigida: 30 casos.
- Admin/Coach: 24 fixtures funcionales de contrato.

Estas matrices incluyen de 1 a 10 Auto, Fijos + Auto, gramos, unidades, metas compatibles/incompatibles y selecciones de un solo perfil. No se cambiaron thresholds para fabricar resultados limpios.

## Resultado semántico

- `selected_only` nunca incorpora un ID no seleccionado.
- `assisted_food_addition` agrega como máximo lo necesario (1–3), muestra badge Sugerido y permite quitarlo.
- La popularidad no reemplaza la adecuación nutricional: primero se identifica el rol deficitario, después se filtra y puntúa.
- Ninguna estrategia consume automáticamente.

