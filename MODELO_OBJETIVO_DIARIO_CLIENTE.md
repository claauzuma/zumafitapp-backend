# Modelo de objetivo diario del cliente

Fecha de cierre técnico: 2026-08-01.

## Recalcular

- **Usar datos actuales:** muestra peso y fecha, altura, edad, sexo, actividad, objetivo y criterio deportivo; calcula una vista previa sin cambiar el perfil.
- **Actualizar datos:** permite peso y actividad, presenta antes/después y exige una confirmación explícita del perfil.
- **Simular sin guardar:** aplica la propuesta al borrador del objetivo, pero envía `current_data`; no persiste peso ni actividad.

## Edición manual

La energía teórica se calcula con P×4 + C×4 + G×9. La interfaz muestra la diferencia frente a kcal independientes, permite restaurar valores anteriores y volver a la recomendación.

## Persistencia

El endpoint propio sólo opera sobre el usuario autenticado. El backend acepta actualización de perfil únicamente cuando `mode=update_data` y `confirmProfileUpdate=true`.

## Límite pendiente

El cambio de objetivo no modifica consumos históricos. Todavía no existe el diálogo completo para elegir “mantener menú/recalcular futuras/revisar una por una/aplicar desde fecha” sobre menús ya guardados; debe tratarse como mejora posterior y no asumirse implementado.
