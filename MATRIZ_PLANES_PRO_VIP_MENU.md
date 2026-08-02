# Matriz de planes para menú autónomo

Fecha de cierre técnico: 2026-08-01.

| Capacidad | Free | Pro | VIP |
| --- | ---: | ---: | ---: |
| Menús propios | 1 | 10 | 50 |
| Comidas guardadas | 5 | 100 | 500 |
| Generación automática | No | Sí | Sí |
| Biblioteca global | Sí | Sí | Sí |
| Biblioteca premium | No | No | Sí |
| Alimentos en equivalencia automática | 0 | 6 | 10 |
| Días de menú | 1 | 7 | 7 |

Las cifras provienen de `clientNutritionCapabilities.js` y se devuelven como capabilities/limits. El frontend no eleva permisos mediante payload.

Pro y VIP usan `tracking_calorie_fill_v1`; VIP no recibe un optimizador más preciso, sino mayor capacidad de organización y biblioteca premium. Un vínculo activo con coach cambia la autoridad y bloquea generación autónoma.
