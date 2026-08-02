# Flujo de creación de menú Pro/VIP

Fecha de cierre técnico: 2026-08-01.

## Flujo verificado

1. El usuario abre el constructor real desde el estado vacío o Nutrición.
2. Define nombre, fecha de inicio, días y estrategia de objetivo actual/personalizado.
3. Agrega, renombra, ordena o duplica comidas.
4. Cada comida puede quedar vacía, recibir una meta opcional y alimentos manuales.
5. Puede abrir cálculo/equivalencia cuando su capability lo permite.
6. Revisa el resumen de kcal/P/C/G y guarda como borrador o menú activo.
7. El backend normaliza y persiste `fechaInicio`, `estrategiaObjetivo`, objetivos y snapshots de alimentos.

El borrador del constructor se conserva en `localStorage` por usuario hasta guardar o cancelar de forma confirmada. Guardar y recargar recupera el menú desde el backend; no se crean `FoodLogs`.

## Presentación

El constructor reutiliza las cards, comidas, imágenes, colores y controles del menú existente. Los estados Manual/Auto/Sugerido se conservan en los snapshots. Pro y VIP no reciben una pantalla administrativa alternativa.

## Límites pendientes de validación manual

Los límites se resuelven en backend. Falta comprobar con cuentas reales el mensaje exacto al alcanzar 10/50 menús y 100/500 comidas, y el comportamiento visual en los anchos objetivo.
