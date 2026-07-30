# Auditoría de equivalencias del menú actual

Fecha de cierre técnico: 2026-07-30.

## Alcance y criterio visual

La feature se incorporó sobre `MenuPlan` y los servicios existentes. No se creó una segunda pantalla de menú ni se reemplazaron las cards, imágenes, colores, tipografías o jerarquía actuales. Los agregados visuales se limitan a acciones discretas, estados de aprobación y un drawer constructor; el menú propio Pro/VIP reutiliza el mismo lenguaje visual ya existente.

## Qué existía antes de esta continuación

- Menú profesional asignado, alternativas del coach y tracking diario por fecha.
- Tres valores de acceso configurables por coach y límites de planes centralizados.
- Menús propios y comidas guardadas para clientes sin coach.
- Biblioteca nutricional, favoritos, `FoodLogs` y cálculo `tracking_calorie_fill_v1`.
- Un constructor inicial de equivalencias y reemplazos guardados dentro del tracking del día.

## Faltantes encontrados y resueltos

| Área | Problema anterior | Resolución actual |
|---|---|---|
| Autorización | El permiso general de Tracking podía confundirse con reemplazo por alimento | Permisos server-side separados para alternativas, comida completa y reemplazo individual |
| Integridad | El cliente podía enviar snapshots nutricionales manipulados | Alimento, comida original, meta y macros se reconstruyen desde IDs exactos y snapshot asignado |
| Temporalidad | Faltaba una identidad completa de instancia | Usuario, menú, comida, fecha, semana, versión, origen y `requestId` quedan en el registro |
| Cálculo | `assisted` no estaba cerrado como contrato propio | Primero calcula `selected_only`, detecta el rol deficitario, filtra candidatos y recalcula con el mismo motor |
| Biblioteca | No había comparación segura para uso cliente | Consulta de sólo lectura, filtro de restricciones y score kcal/P/C/G/tipo |
| Aprobación | No existía ciclo completo | `pending_review`, aprobación/rechazo por coach y bloqueo de consumo |
| Actividad | Creación y consumo no tenían deduplicación visible | Eventos con `dedupeKey`, visibilidad inmediata y digest semanal separados |
| Consumo | Snapshot de equivalencia podía perder trazabilidad | `FoodLogs` guarda menú, comida original, equivalencia, warnings y `requestId` estable |
| Favoritos | Faltaba semántica explícita de plantilla | Guardar/favoritar conserva origen y objetivo; no registra consumo |

## Tres niveles con coach

| Nivel | Alternativas coach | Reemplazo alimento propio | Comida equivalente propia | Auto |
|---|---:|---:|---:|---:|
| Sin cambios | No | No | No | No |
| Sólo alternativas | Sí | No | No | No |
| Alternativas + equivalencias | Sí | Sí | Sí | Según capacidad concedida |

El menú y sus alternativas profesionales son fuentes inmutables. La acción del cliente crea una entrada de tracking para una fecha; nunca actualiza el documento maestro del coach.

## Flujos implementados

1. **Reemplazo individual:** abre desde el alimento, consulta por `foodId` exacto, compara kcal/P/C/G y permite reemplazar sólo ese alimento.
2. **Reemplazo + recálculo:** el reemplazo elegido queda Manual y sólo se recalculan los otros alimentos que ya eran Auto.
3. **Comida completa:** copia la meta canónica de la comida original y abre el builder con Manual/Auto/Sugerido.
4. **Selected only:** sólo participan los alimentos elegidos; los Manuales no cambian.
5. **Assisted:** puede sumar de uno a tres candidatos seguros para el macro deficitario, dentro del límite del plan.
6. **Biblioteca:** permite usar una comida publicada como borrador, ajustarla o marcarla favorita sin modificar el maestro.
7. **Consumo:** sólo completar explícitamente la comida genera logs; la escritura es idempotente por solicitud estable.

## Contratos HTTP usados

- `PATCH /me/menu-tracking/day`: persiste instancia/reemplazos y confirmación del día.
- `GET /me/menu-tracking` y `GET /me/menu-tracking/week`: recuperan fecha e historial semanal.
- `POST /food-logs/day/calculate-quantities`: cálculo `selected_only` o `assisted_food_addition` autorizado.
- `GET /menus/alimentos/equivalentes`: equivalencia individual segura.
- `GET /nutricion/biblioteca/comidas`: biblioteca de sólo lectura y coincidencia nutricional.
- `GET /me/coach-clients/:clientId/equivalent-activity`: actividad, notificaciones y digest.
- `PATCH /me/coach-clients/:clientId/equivalents/:date/:entryId/review`: aprobar o rechazar.

## Invariantes confirmados

- Guardar borrador, cerrar, recalcular o favoritar no crea `FoodLogs`.
- Una equivalencia pendiente o rechazada no puede consumirse.
- Un coach no relacionado no puede leer/revisar actividad.
- El owner, plan, límites, comida original, fecha y alimentos se validan en servidor.
- `menu2.js` y `fooddatabase2` no fueron modificados.

