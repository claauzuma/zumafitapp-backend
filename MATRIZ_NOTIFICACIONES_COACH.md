# Matriz de actividad y notificaciones al coach

## Configuración

Default: casos importantes inmediatos + resumen semanal. La actividad se registra aunque no corresponda mostrar una notificación. `none` silencia notificaciones, no elimina auditoría.

| Modo | Creada normal | Consumida normal | Importante | Pendiente aprobación | Digest |
|---|---:|---:|---:|---:|---:|
| `none` | Actividad | Actividad | Actividad | Actividad | No |
| `important_only` | Actividad | Actividad | Inmediata | Inmediata | No |
| `weekly_digest` | Actividad | Actividad | Inmediata | Inmediata | Sí |
| `all_consumed` | Actividad | Visible al consumir | Inmediata | Inmediata | Sí |
| `all_created` | Visible al crear | Actividad | Inmediata | Inmediata | Sí |

## Eventos

| Evento | Actividad | Inmediato por default | Digest default | Deduplicado |
|---|---:|---:|---:|---:|
| `client_equivalent_created` | Sí | No | Sí | Sí |
| `client_equivalent_favorited` | Sí | No | Sí | Sí |
| `client_equivalent_consumed` | Sí | No | Sí | Sí |
| `client_equivalent_needs_attention` | Sí | Sí | Sí | Sí |
| `client_equivalent_pending_approval` | Sí | Sí | Sí | Sí |
| `client_equivalent_rejected` | Sí | No | Sí | Sí |
| `client_equivalent_approved` | Sí | No | Sí | Sí |
| `client_equivalent_recalculated_after_target_change` | Sí | No | Sí | Sí |

Abrir, buscar, recalcular, cerrar, descartar o persistir sólo un borrador local no produce eventos visibles.

## Criterios importantes centralizados

La clasificación vive en `servicio/trackingEquivalences.js`, no en componentes:

- exceso calórico manual aceptado;
- déficit calórico material;
- déficit proteico material;
- desviación material de carbohidratos/grasas;
- cantidades extremas;
- warning fuerte aceptado;
- aprobación requerida;
- incompatibilidad tras cambio de meta.

Son umbrales de revisión de producto, no consejo médico. La metadata incluye cliente, coach relacionado, fecha, comida, objetivo, resultado, diferencias, alimentos, modos, warnings y estrategia.

## Aprobación

- `immediate`: una equivalencia válida se guarda aprobada.
- `required`: se guarda `pending_review`, avisa inmediatamente y no puede consumirse.
- Aprobar habilita consumo; rechazar conserva motivo y permite duplicar/corregir.

## Entrega

La implementación entrega actividad, bandeja visible y digest dentro de la aplicación. No se agregó transporte externo de push, correo o WhatsApp; si se desea, debe consumir estos mismos eventos deduplicados.

