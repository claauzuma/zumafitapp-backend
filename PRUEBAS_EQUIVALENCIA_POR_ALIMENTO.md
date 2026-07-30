# Pruebas de equivalencia por alimento

## Semántica

El reemplazo parte del ID exacto del alimento original dentro de la comida asignada. El servidor vuelve a leer catálogo/snapshot y reconstruye macros, cantidad, unidad y objetivo; un nombre coincidente o un payload con macros falsos no alcanza para autorizarlo.

## Acciones

- **Reemplazar alimento:** cambia sólo la instancia efectiva de ese alimento para fecha/comida.
- **Reemplazar y recalcular los demás Auto:** el elegido queda Manual; sólo los demás que ya estaban Auto participan en `tracking_calorie_fill_v1`.
- Si no existen otros Auto, se aplica el reemplazo individual y se informa al usuario.

## Casos automatizados

| Caso | Esperado | Resultado |
|---|---|---|
| ID exacto válido | Devuelve candidato y cantidad comparable | PASS |
| Homónimo con otro ID | No sustituye identidad por nombre | PASS |
| Macros manipulados | Se ignoran; usa catálogo canónico | PASS |
| Meta manipulada | Se ignora; usa comida original | PASS |
| Alimento deshabilitado | Rechazo server-side | PASS |
| Restricción/alergia | Candidato excluido | PASS |
| Coach sin relación | 403/NOT_FOUND sin datos | PASS |
| Cliente sin permiso | 403 | PASS |
| Unidad discreta | Cantidad respeta unidad/step | PASS |
| Gramos continuos | Usa base estructural correcta | PASS |
| Fecha/comida distinta | No se mezcla con otra instancia | PASS |
| Original profesional | Documento maestro sin cambios | PASS |

Pruebas principales: `tests/menuFoodEquivalentsSecurity.test.js` y `tests/menuTrackingEquivalentPermissions.test.js`.

## Prioridad nutricional

La cantidad equivalente intenta conservar kcal del alimento original, luego el aporte proteico aplicable y finalmente C/G. Las diferencias inevitables por unidad se muestran como información/warning según materialidad; nunca se rompe una unidad indivisible para lograr una cifra estética.

