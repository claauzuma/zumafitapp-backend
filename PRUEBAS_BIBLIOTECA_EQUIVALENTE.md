# Pruebas de biblioteca equivalente

## Consulta segura

La biblioteca cliente expone únicamente comidas publicadas/habilitadas y devuelve copias de lectura. Se filtran restricciones del cliente antes de puntuar; no se exponen acciones Admin/Coach ni se permite editar el registro maestro.

## Orden de coincidencia

El score compara:

1. diferencia calórica (peso principal);
2. diferencia de proteína;
3. diferencias normalizadas de carbohidratos y grasas;
4. compatibilidad con tipo de comida;
5. necesidad de ajuste.

No se busca sólo por nombre. Los alimentos internos conservan IDs exactos y metadata estructural de unidad.

## Casos automatizados

| Caso | Verificación | Resultado |
|---|---|---|
| Dos comidas cercanas | Gana la de menor diferencia ponderada | PASS |
| kcal similar/P distinta | La mejor proteína desempata | PASS |
| Tipo compatible | Recibe prioridad secundaria | PASS |
| Alimento restringido | La comida no aparece | PASS |
| Alimento deshabilitado | La comida no aparece | PASS |
| Sin coincidencias | Lista vacía segura | PASS |
| Usar borrador | Carga copia local, no consume | PASS contractual |
| Ajustar meta | Mantiene Manual y recalcula Auto | PASS contractual |
| Favorita | Crea plantilla; no FoodLog | PASS contractual |
| Maestro | Ninguna acción cliente lo muta | PASS de autorización |

Prueba principal: `tests/nutritionLibraryEquivalent.test.js`. El frontend presenta nombre, kcal/P/C/G, diferencias, alimentos y acciones Usar borrador/Ajustar/Favorita.

## Meta histórica vs actual

La favorita conserva la meta de referencia. Al reutilizarla, el builder compara esa referencia con el objetivo actual, informa si cambió y permite recalcular una nueva instancia; no actualiza silenciosamente la favorita ni un consumo histórico.

