# Matriz de generación de menú y biblioteca

Fecha de cierre técnico: 2026-08-01.

| Modo | Fuente | Prioridad | Resultado | Consumo |
| --- | --- | --- | --- | --- |
| Biblioteca | Comidas publicadas permitidas | kcal, proteína, C/G y tipo | Copia editable en vista previa | No |
| Alimentos elegidos | IDs exactos seleccionados | `tracking_calorie_fill_v1` | Cantidades calculadas editables | No |
| Combinado | Biblioteca con fallback a alimentos | Biblioteca; si no hay candidato, cálculo | Vista previa editable | No |
| Assisted | Selección inicial + candidatos admitidos por el motor | kcal, proteína, C/G | Sugerencias marcadas por el contrato del cálculo | No |

La generación requiere primero `POST /api/clientes/me/menus/generation-authorize`. El servidor devuelve `previewOnly: true` y la policy exacta. Pro y VIP usan la misma policy y precisión; sólo cambian capacidades y límites.

La biblioteca admite objetivos de kcal, proteína, carbohidratos y grasas tanto para comidas como para menús. La importación elimina ownership ajeno y crea una copia personal; nunca actualiza el documento maestro.

## Cobertura actual y límite conocido

- La búsqueda de menús completos existe en la biblioteca.
- El asistente automático arma el menú a partir de comidas de biblioteca o alimentos.
- El modo combinado es fallback, no una optimización global que mezcle simultáneamente ambas fuentes.
- Horario inicial, favoritos preferidos y exclusiones tienen soporte en la función generadora, pero todavía no están expuestos en el formulario visual.
