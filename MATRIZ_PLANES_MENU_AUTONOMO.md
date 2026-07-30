# Matriz de planes para menú autónomo

Los límites se resuelven en servidor mediante capacidades centralizadas; el frontend sólo los presenta.

| Capacidad | Free | Pro | VIP |
|---|---:|---:|---:|
| Menús propios | 1 | 10 | 50 |
| Comidas guardadas | 5 | 100 | 500 |
| Constructor manual | Sí | Sí | Sí |
| Cálculo automático | No | Sí | Sí |
| Alimentos por creación automática | 0 | 6 | 10 |
| `selected_only` | No automático | Sí | Sí |
| `assisted_food_addition` | No | Sí | Sí |
| Favoritas | Básico según capacidad | Sí | Sí |
| Biblioteca | Sin auto | Global | Premium/capacidad ampliada |

## Producto sin coach

Pro y VIP pueden crear menú, días y comidas; asignar una meta opcional por comida; derivarla del día; cargar cantidades manuales; calcular con alimentos propios; permitir sugerencias; buscar biblioteca; guardar/favoritar y consumir. Ambos usan el mismo `tracking_calorie_fill_v1`; VIP no recibe un algoritmo nutricional mejor, sino mayor capacidad y organización.

La comida comienza sin meta. El usuario puede definirla manualmente o distribuir la meta restante. Manuales permanecen intactos y sólo Auto se recalcula.

## Producto con coach

El plan comercial no saltea la autorización profesional. Rige el nivel concedido por ese coach:

| Acceso coach | Ver menú | Alternativas coach | Reemplazo propio | Comida equivalente |
|---|---:|---:|---:|---:|
| Bloqueado | Sí | No | No | No |
| Alternativas | Sí | Sí | No | No |
| Equivalencias | Sí | Sí | Sí | Sí |

## Diseño

No se creó una UI paralela por plan. Menús profesionales y propios mantienen las cards, imágenes, colores, títulos, macros y menú de acciones existentes. Las diferencias de plan se expresan con permisos, límites y badges discretos, no con un rediseño.

