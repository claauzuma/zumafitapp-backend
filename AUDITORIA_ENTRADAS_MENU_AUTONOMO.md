# Auditoría de entradas al menú autónomo

Fecha de cierre técnico: 2026-08-01.

## Resultado

| Perfil | Estado sin menú | Acciones | Control server-side |
| --- | --- | --- | --- |
| Pro sin coach | Habilitado | Crear, generar, biblioteca y Tracking | Capabilities Pro + autorización de generación |
| VIP sin coach | Habilitado | Crear, generar, biblioteca y Tracking | Capabilities VIP + autorización de generación |
| Free sin coach | Creador manual básico | Generación muestra bloqueo explicativo | Backend responde `PLAN_CAPABILITY_REQUIRED` |
| Cliente con coach | Conserva el flujo profesional | No recibe CTA autónomos en el estado vacío profesional | Backend responde `CLIENT_MENU_FORBIDDEN` |

## Rutas reales

- Crear mi menú: `/app/menu/nuevo`.
- Generar automáticamente: `/app/menu/nuevo?mode=generate`.
- Explorar biblioteca: `/app/nutricion?tab=admin`.
- Registrar libremente: `/app/tracking`.

La causa del bug era una condición invertida en el estado vacío de `MenuPlan`: la card autónoma se asociaba a la copia del flujo con coach. Se corrigió sin alterar la presentación normal del menú profesional.

No se crea consumo ni `FoodLogs` al navegar por estas entradas.
