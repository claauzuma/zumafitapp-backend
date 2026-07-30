# Riesgos y pendientes de menús/equivalencias

## Riesgos controlados

| Riesgo | Mitigación | Residual |
|---|---|---|
| Payload manipulado | Canonización server-side por IDs y snapshot | Un alimento borrado del catálogo hace fallar cerrado el reemplazo |
| Doble click/reintento | `requestId` estable e índices de deduplicación | Tracking y FoodLogs no comparten transacción multi-colección |
| Borrador de otra fecha | Clave owner/menú/comida/fecha/tipo | Al limpiar almacenamiento del navegador se pierde sólo el borrador local |
| Coach ajeno | Relación coach-cliente validada en servidor | Ninguno conocido |
| Ruido de alertas | Actividad separada de visible/inmediata/digest | Los umbrales deben revisarse con uso real |
| Sugerencia insegura | Filtros estructurales y lista rechazada | Calidad depende de metadata completa del catálogo |
| Unidad ambigua | `macroBasis`, unidad y step estructurales | Datos históricos incompletos fallan conservadoramente |
| Meta modificada | Versión/referencia y comparación al reutilizar | Requiere que el usuario recalcule la nueva instancia |

## Pendientes reales

1. **Capturas autenticadas:** no se generaron las diez capturas dirigidas porque esta ejecución no dispone de sesión de cliente/coach ni runner visual autenticado. Deben capturarse en QA mobile y desktop.
2. **Canal externo:** actividad, bandeja y digest están implementados in-app; push/email/WhatsApp no se envían. Puede agregarse luego consumiendo eventos deduplicados.
3. **Atomicidad:** el tracking del día se persiste antes de escribir los snapshots de consumo. Un fallo intermedio devuelve error y el reintento idempotente completa los logs, pero no hay transacción Mongo conjunta.
4. **Datos heredados:** catálogos antiguos con unidad o macros incompletos se rechazan de forma segura; conviene auditar su metadata antes de producción masiva.

## Pruebas manuales recomendadas

- Tres clientes con cada nivel de permiso sobre el mismo menú profesional.
- Reemplazo simple y reemplazo + Auto, comprobando que la card original no cambia.
- Equivalencia completa, recarga del navegador, cambio de fecha y descarte explícito.
- Aprobación requerida: intentar consumir pendiente, aprobar y volver a consumir.
- Pro con 6 alimentos y VIP con 10; forzar el séptimo/undécimo desde DevTools.
- Biblioteca con alergia/restricción y favorita creada con una meta vieja.
- Doble click, timeout simulado y reintento de confirmación para comprobar un único set de `FoodLogs`.
- Mobile 320/360/390 px, teclado abierto, Escape/foco en desktop y ausencia de overflow horizontal.

## Criterio de salida

Las pruebas automatizadas y build permiten comenzar QA manual. No se recomienda desplegar sin las capturas autenticadas, la verificación visual final y una prueba de fallo intermedio de base de datos en staging.

