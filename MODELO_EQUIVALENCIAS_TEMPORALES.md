# Modelo de equivalencias temporales

## Identidad y alcance

Cada instancia queda ligada a:

- `clientId` y coach relacionado, si existe;
- `menuId`/snapshot y versión de meta;
- `originalMealId` y tipo de comida;
- fecha ISO, `dayKey`, `weekStart` y `weekEnd`;
- tipo: reemplazo de alimento o comida completa;
- estrategia: `selected_only` o `assisted_food_addition`;
- versión de la entrada y `requestId` determinista.

La clave temporal es fecha + comida + menú. Cambiar de fecha o semana recupera otro documento y no mezcla borradores. La semana vencida deja de ser activa, pero los registros históricos y consumos no se borran.

## Estados

| Estado | Persistencia | Puede consumirse | Genera FoodLogs |
|---|---|---:|---:|
| Borrador local | `localStorage`, scope usuario/menú/comida/fecha/tipo | No | No |
| Guardada inmediata | tracking del día | Sí | No |
| `pending_review` | tracking del día | No | No |
| `approved` | tracking del día | Sí | No hasta confirmar |
| `rejected` | historial del día | No; se puede duplicar | No |
| Consumida | tracking + snapshot en `FoodLogs` | Ya confirmada | Sí, idempotente |

Cerrar el builder conserva. Descartar elimina únicamente la clave local de ese scope. Un JSON local corrupto se ignora y se reemplaza por un estado vacío seguro.

## Inmutabilidad

El menú, comida, alimentos, cantidades y alternativas del coach no se editan. La vista efectiva se compone en lectura con las entradas temporales del día. La meta canónica se obtiene del snapshot asignado en servidor; no se confía en la meta enviada por el cliente.

## Favoritas

Una favorita es una plantilla independiente:

- conserva alimentos, cantidades, modos, autor, origen y meta de referencia;
- no expira con la semana;
- no crea logs ni marca una comida como realizada;
- al reutilizarse crea un borrador nuevo para la fecha actual;
- si la meta actual difiere, el frontend informa el cambio y permite recalcular sin mutar la favorita.

## Recalcular

- Manual/Fijo mantiene cantidad exacta y se descuenta de la meta.
- Auto participa en `tracking_calorie_fill_v1`.
- Sugerido se identifica visualmente y puede quitarse antes de guardar.
- Reemplazar + recalcular fija el alimento reemplazado y modifica únicamente otros Auto.
- Auto no debe superar el techo calórico; una cantidad manual superior exige aceptación explícita del warning.

## Idempotencia y snapshots

El consumo genera un `requestId` estable a partir de usuario, fecha, menú, comida y versiones de equivalencias. `addSnapshotLogs` lo exige y evita una segunda inserción para el mismo item. El snapshot conserva objetivo, resultado, alimentos, Manual/Auto/Sugerido, warnings aceptados y referencias de origen.

La actualización del tracking diario y los `FoodLogs` son escrituras Mongo separadas. Ante un fallo intermedio, repetir la misma confirmación completa lo faltante sin duplicar logs. No se introdujo una migración transaccional multi-colección.

## Migración

El modelo es aditivo y compatible con documentos previos. No hubo migración destructiva. Se agrega un índice único parcial para `dedupeKey` de eventos de actividad; documentos históricos sin esa clave siguen siendo válidos.

