# Auditoría de contratos del motor nutricional central

Generado: 2026-08-25T20:31:45.786Z

Mongo read-only: 574 → 574; writes=0; unchanged=true.

## Catálogo real

- Modos: {"GENERIC":191,"EXPLICIT_ONLY":383}.
- GENERIC por roles: {"P1":29,"P2":43,"C1":50,"C2":26,"V":12,"F":43,"G":28}.
- GENERIC por mealTypes: {"breakfast":126,"lunch":121,"snack":126,"dinner":121,"extraSnack":125}.
- EXPLICIT_ONLY con al menos un rol: 0.
- Unidades discretas GENERIC: 43; ml GENERIC: 0.

## Casos de ranking

| caso | ganador | esperado | estado |
|---|---|---|---|
| policy-protein-band-wins | B | B | PASS |
| policy-kcal-wins-same-protein-band | A | A | PASS |

## Contratos

| caso | propósito | clasificación | relajación | resultado |
|---|---|---|---|---|
| real-only-selected-three-foods | ONLY_SELECTED real conserva exactamente Arroz+Banana+Pechuga y devuelve la mejor solución física | BEST_EFFORT | STRICT | PASS |
| real-locks-0 | 0 locks reales; cada cantidad fija debe conservarse exacta | BEST_EFFORT | RELAX_STEP | PASS |
| real-locks-1 | 1 locks reales; cada cantidad fija debe conservarse exacta | BEST_EFFORT | RELAX_STEP | PASS |
| real-locks-2 | 2 locks reales; cada cantidad fija debe conservarse exacta | BEST_EFFORT | STRICT | PASS |
| real-locks-all | 3 locks reales; cada cantidad fija debe conservarse exacta | BEST_EFFORT | STRICT | PASS |
| real-max-hard | Arroz real locked en 250 g excede max=200 y debe quedar NO_SOLUTION sin corrección silenciosa | NO_SOLUTION | RELAX_MIN | PASS |
| round-strict | La primera ronda capaz de recomendar debe ser STRICT; MAX permanece intacto | RECOMMENDED | STRICT | PASS |
| round-relax-step | La primera ronda capaz de recomendar debe ser RELAX_STEP; MAX permanece intacto | RECOMMENDED | RELAX_STEP | PASS |
| round-relax-min | La primera ronda capaz de recomendar debe ser RELAX_MIN; MAX permanece intacto | RECOMMENDED | RELAX_MIN | PASS |
| minimum-discrete-overshoot | Mínimos físicos fuerzan +20 kcal: BEST_EFFORT usable, no falso NO_SOLUTION | BEST_EFFORT | STRICT | PASS |
| discrete-next-step | Una unidad discreta elige 120 antes que 60 para target 100 | BEST_EFFORT | STRICT | PASS |
| milliliter-step | Unidad ml continua respeta min/max/step | RECOMMENDED | STRICT | PASS |
| explicit-only-configured-selected | EXPLICIT_ONLY con rol configurado entra cuando se selecciona explícitamente | BEST_EFFORT | RELAX_STEP | PASS |
| disabled-hard-block | DISABLED nunca es utilizable, ni siquiera requerido | INVALID_FOOD_COMBINATION | — | PASS |

## Cobertura estructural limit=32

| mealType | candidatos | estructuras | P2 | C2 | V | F | G |
|---|---:|---:|---|---|---|---|---|
| breakfast | 32 | 8 | true | true | N/A | true | true |
| lunch | 32 | 8 | true | N/A | true | true | true |
| snack | 32 | 8 | true | true | N/A | true | true |
| dinner | 32 | 8 | true | N/A | true | true | true |
| extraSnack | 32 | 8 | true | true | N/A | true | true |

## Warning 772 vs 776

- status=BEST_EFFORT; kcal zone=EXCELLENT.
- resumen: Las calorias estan alineadas, pero el reparto de macros queda desbalanceado..
- códigos: PROTEIN_ABOVE_REASONABLE_RANGE, CARBS_OUTSIDE_REASONABLE_RANGE.
- afirma falsamente que faltan calorías: false.

