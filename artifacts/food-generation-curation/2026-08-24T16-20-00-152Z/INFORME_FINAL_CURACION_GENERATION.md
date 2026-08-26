# Informe final · Curación masiva de generation

Generado: 2026-08-24T16:30:08.223Z

## Resumen

- Alimentos revisados: 574.
- Documentos modificados: 187.
- GENERIC: 7 → 191.
- EXPLICIT_ONLY: 567 → 383.
- DISABLED: 0 → 0.
- Requieren revisión manual: 154.
- GENERIC sin portionRule completa: 189.
- Registros no modificados: 387.

## Seguridad y reversibilidad

- Total antes/después: 574/574.
- Mismatches posteriores: 0.
- Campos modificados: exclusivamente generation mediante $set.
- portionRule modificadas: 0.
- Documentos creados/eliminados: 0/0.
- Snapshot reversible: rollback-snapshot.json, 187 entradas.
- Comando de rollback disponible: node scripts/curateFoodGenerationCatalog.js --restore "C:\Users\czuma\Desktop\dietas\GeneradorDeDietas\generadordecomidas\artifacts\food-generation-curation\2026-08-24T16-20-00-152Z\rollback-snapshot.json"

## Criterios aplicados

- INFERENCIA_ALTA_CARBOHIDRATO_LIVIANO: 5.
- INFERENCIA_ALTA_CARBOHIDRATO_PRINCIPAL: 10.
- INFERENCIA_ALTA_CEREAL_DESAYUNO: 2.
- INFERENCIA_ALTA_COMPLEMENTO_GRASO: 2.
- INFERENCIA_ALTA_LECHE: 2.
- INFERENCIA_ALTA_PAN_SIMPLE: 18.
- INFERENCIA_ALTA_PROTEINA_PRINCIPAL: 20.
- INFERENCIA_ALTA_SEMILLAS: 3.
- INFERENCIA_ALTA_UNTABLE_FRUTO_SECO: 3.
- INFERENCIA_ALTA_VERDURA: 11.
- INFERENCIA_ALTA_YOGUR: 13.
- REGLA_EXPLICITA_ACEITES: 1.
- REGLA_EXPLICITA_ARROZ_PASTA: 13.
- REGLA_EXPLICITA_FRUTAS: 43.
- REGLA_EXPLICITA_FRUTOS_SECOS: 7.
- REGLA_EXPLICITA_HUEVOS: 2.
- REGLA_EXPLICITA_JAMON_COCIDO: 5.
- REGLA_EXPLICITA_LECHE_DESCREMADA: 9.
- REGLA_EXPLICITA_PALTA: 1.
- REGLA_EXPLICITA_PAN_BLANCO: 1.
- REGLA_EXPLICITA_PROTEINAS_PRINCIPALES: 4.
- REGLA_EXPLICITA_QUESO_CREMOSO: 10.
- REGLA_EXPLICITA_WHEY: 2.

## Cobertura total configurada y pool activo

| Rol | GENERIC configurados | GENERIC activos |
|---|---:|---:|
| P1 | 29 | 29 |
| P2 | 43 | 43 |
| C1 | 50 | 50 |
| C2 | 26 | 26 |
| V | 12 | 12 |
| F | 43 | 40 |
| G | 28 | 28 |

| MealType | GENERIC configurados | GENERIC activos |
|---|---:|---:|
| breakfast | 126 | 123 |
| lunch | 121 | 118 |
| snack | 126 | 123 |
| dinner | 121 | 118 |
| extraSnack | 125 | 122 |

## Matriz activa mealType × role

| MealType | P1 | P2 | C1 | C2 | V | F | G |
|---|---:|---:|---:|---:|---:|---:|---:|
| breakfast | 4 | 43 | 26 | 26 | 0 | 40 | 24 |
| lunch | 27 | 2 | 24 | 0 | 12 | 40 | 15 |
| snack | 4 | 43 | 26 | 26 | 0 | 40 | 24 |
| dinner | 27 | 2 | 24 | 0 | 12 | 40 | 15 |
| extraSnack | 4 | 43 | 26 | 26 | 0 | 40 | 23 |

El núcleo P1+C1 tiene cobertura en los cinco momentos. C2 está deliberadamente vacío en lunch/dinner y V está vacío en desayuno/snack/extraSnack por la lógica culinaria aplicada. Los demás opcionales tienen cobertura, aunque no necesariamente llegan al lote de candidatos del flujo real.

## Comportamiento real del combinador sin modificarlo

El flujo diario pide 32 candidatos. Con el ranking actual, los 32 fueron siempre estructuras P1+C1:

| MealType | Candidatos | P1+C1 | Con roles opcionales |
|---|---:|---:|---:|
| breakfast | 32 | 32 | 0 |
| lunch | 32 | 32 | 0 |
| snack | 32 | 32 | 0 |
| dinner | 32 | 32 | 0 |
| extraSnack | 32 | 32 | 0 |

Con limit=100 aparecieron C2 en breakfast/snack/extraSnack y F en lunch/dinner, pero el flujo diario actual usa 32. Esto es una limitación funcional preexistente del ranking/límite, no de cobertura del catálogo. No se modificó el combinador.

## Pruebas reales diarias no persistentes

- Corridas totales: 17; exitosas: 11; fallidas: 6.
- 3 comidas: 2 OK / 6 fallidas.
- 4 comidas: 3 OK / 0 fallidas.
- 5 comidas: 3 OK / 0 fallidas.
- 6 comidas: 3 OK / 0 fallidas.
- Fingerprint de generation antes/después de las pruebas: sin cambios (true).
- Alertas culinarias automáticas: 0.

Las seis fallas fueron desayunos de planes de tres comidas. El orquestador asignó entre 711 y 778 kcal y entre 49,9 y 54,5 g de proteína al desayuno. En cada caso el motor produjo 96 soluciones físicas, pero ninguna cumplió simultáneamente los umbrales recomendados. Los dos casos exitosos tuvieron desayunos de 635,6–654 kcal y 44,6–45,8 g de proteína. No se inventaron roles ni porciones para ocultar esta limitación.

Las 11 corridas exitosas cerraron calorías con un desvío máximo de 1,9 kcal, pero no cerraron necesariamente los macros: el desvío absoluto promedio fue P 17,64 g, C 25,95 g y G 16,96 g; los máximos fueron P 36,03 g, C 50,85 g y G 32,48 g. Esto coincide con que el lote real sólo evaluó P1+C1 y no incorporó los roles opcionales configurados.

### 3 comidas · corrida 1 · ERROR

- Seed: curation-real-3-1
- Código: MEAL_TARGET_NOT_REACHABLE_WITH_PORTION_RULES
- Mensaje: No encontramos una combinación válida para desayuno.
- Target del desayuno que falló: 711.31 kcal · P 49.86 · C 83.1 · G 19.94
- Soluciones físicas encontradas: 96; recomendadas: 0.

### 3 comidas · corrida 2 · OK

- Seed: curation-real-3-2
- Totales: 2138.5 kcal · P 153.9 · C 300.85 · G 35.5
- Diferencia: kcal -1.5 · P 3.9 · C 50.85 · G -24.5

#### desayuno · P1+C1

- Galletitas de agua: 100 Grs · 441 kcal · P 11 · C 70 · G 13
- Whey protein SN: 50 Grs · 210.4 kcal · P 41.5 · C 4.35 · G 3

#### almuerzo · P1+C1

- Arroz: 140 Grs · 473.9 kcal · P 11.2 · C 105.7 · G 0.7
- Bola de lomo: 180 Grs · 235.8 kcal · P 38.7 · C 0 · G 9

#### cena · P1+C1

- Arroz: 160 Grs · 541.6 kcal · P 12.8 · C 120.8 · G 0.8
- Cuadrada (Ternera): 180 Grs · 235.8 kcal · P 38.7 · C 0 · G 9

### 3 comidas · corrida 3 · ERROR

- Seed: curation-real-3-3
- Código: MEAL_TARGET_NOT_REACHABLE_WITH_PORTION_RULES
- Mensaje: No encontramos una combinación válida para desayuno.
- Target del desayuno que falló: 773.05 kcal · P 54.19 · C 90.31 · G 21.67
- Soluciones físicas encontradas: 96; recomendadas: 0.

### 3 comidas · corrida 4 · ERROR

- Seed: curation-real-3-4
- Código: MEAL_TARGET_NOT_REACHABLE_WITH_PORTION_RULES
- Mensaje: No encontramos una combinación válida para desayuno.
- Target del desayuno que falló: 765.48 kcal · P 53.66 · C 89.43 · G 21.46
- Soluciones físicas encontradas: 96; recomendadas: 0.

### 3 comidas · corrida 5 · ERROR

- Seed: curation-real-3-5
- Código: MEAL_TARGET_NOT_REACHABLE_WITH_PORTION_RULES
- Mensaje: No encontramos una combinación válida para desayuno.
- Target del desayuno que falló: 719.98 kcal · P 50.47 · C 84.11 · G 20.19
- Soluciones físicas encontradas: 96; recomendadas: 0.

### 3 comidas · corrida 6 · OK

- Seed: curation-real-3-6
- Totales: 2138.1 kcal · P 150.5 · C 296.5 · G 40.1
- Diferencia: kcal -1.9 · P 0.5 · C 46.5 · G -19.9

#### desayuno · P1+C1

- Galletitas de agua: 100 Grs · 441 kcal · P 11 · C 70 · G 13
- Whey protein Isolate: 50 Grs · 192.1 kcal · P 45.5 · C 0.5 · G 0.9

#### almuerzo · P1+C1

- Arroz integral: 100 Grs · 350 kcal · P 8 · C 75 · G 2
- Carne de cerdo magro: 240 Grs · 362.4 kcal · P 52.8 · C 0 · G 16.8

#### cena · P1+C1

- Arroz: 200 Grs · 677 kcal · P 16 · C 151 · G 1
- Churrasco magro: 80 Grs · 115.6 kcal · P 17.2 · C 0 · G 6.4

### 3 comidas · corrida 7 · ERROR

- Seed: curation-real-3-7
- Código: MEAL_TARGET_NOT_REACHABLE_WITH_PORTION_RULES
- Mensaje: No encontramos una combinación válida para desayuno.
- Target del desayuno que falló: 716.5 kcal · P 50.22 · C 83.7 · G 20.09
- Soluciones físicas encontradas: 96; recomendadas: 0.

### 3 comidas · corrida 8 · ERROR

- Seed: curation-real-3-8
- Código: MEAL_TARGET_NOT_REACHABLE_WITH_PORTION_RULES
- Mensaje: No encontramos una combinación válida para desayuno.
- Target del desayuno que falló: 777.57 kcal · P 54.5 · C 90.84 · G 21.8
- Soluciones físicas encontradas: 96; recomendadas: 0.

### 4 comidas · corrida 1 · OK

- Seed: curation-real-4-1
- Totales: 2139.71 kcal · P 174.92 · C 274.53 · G 40.24
- Diferencia: kcal -0.29 · P 24.92 · C 24.53 · G -19.76

#### desayuno · P1+C1

- Galletitas de agua: 90 Grs · 396.9 kcal · P 9.9 · C 63 · G 11.7
- Whey protein SN: 40 Grs · 168.32 kcal · P 33.2 · C 3.48 · G 2.4

#### almuerzo · P1+C1

- Arroz: 100 Grs · 338.5 kcal · P 8 · C 75.5 · G 0.5
- Claras de huevos: 8 Unid · 125.6 kcal · P 28 · C 1.6 · G 0.8

#### merienda · P1+C1

- Avena instantanea: 120 Grs · 422.4 kcal · P 15.6 · C 68.4 · G 9.6
- Whey protein Isolate: 45 Grs · 172.89 kcal · P 40.95 · C 0.45 · G 0.81

#### cena · P1+C1

- Arroz integral (Cocido): 270 Grs · 298.35 kcal · P 7.02 · C 62.1 · G 2.43
- Churrasco magro: 150 Grs · 216.75 kcal · P 32.25 · C 0 · G 12

### 4 comidas · corrida 2 · OK

- Seed: curation-real-4-2
- Totales: 2139.72 kcal · P 164.17 · C 240.8 · G 60.61
- Diferencia: kcal -0.28 · P 14.17 · C -9.2 · G 0.61

#### desayuno · P1+C1

- Galletitas de agua: 95 Grs · 418.95 kcal · P 10.45 · C 66.5 · G 12.35
- Whey protein Isolate: 30 Grs · 115.26 kcal · P 27.3 · C 0.3 · G 0.54

#### almuerzo · P1+C1

- Arroz integral (Cocido): 240 Grs · 265.2 kcal · P 6.24 · C 55.2 · G 2.16
- Bola de lomo: 210 Grs · 275.1 kcal · P 45.15 · C 0 · G 10.5

#### merienda · P1+C1

- Huevos: 3 Unid · 207 kcal · P 18 · C 0 · G 15
- Pan de centeno: 130 Grs · 337.61 kcal · P 11.05 · C 63.7 · G 4.29

#### cena · P1+C1

- Arroz (Cocido): 190 Grs · 246.05 kcal · P 5.13 · C 55.1 · G 0.57
- Churrasco magro: 190 Grs · 274.55 kcal · P 40.85 · C 0 · G 15.2

### 4 comidas · corrida 3 · OK

- Seed: curation-real-4-3
- Totales: 2139.2 kcal · P 186.03 · C 286.85 · G 27.52
- Diferencia: kcal -0.8 · P 36.03 · C 36.85 · G -32.48

#### desayuno · P1+C1

- Avena instantanea: 100 Grs · 352 kcal · P 13 · C 57 · G 8
- Whey protein SN: 50 Grs · 210.4 kcal · P 41.5 · C 4.35 · G 3

#### almuerzo · P1+C1

- Arroz (Cocido): 260 Grs · 336.7 kcal · P 7.02 · C 75.4 · G 0.78
- Claras de huevos: 8 Unid · 125.6 kcal · P 28 · C 1.6 · G 0.8

#### merienda · P1+C1

- Galletitas de agua: 90 Grs · 396.9 kcal · P 9.9 · C 63 · G 11.7
- Whey protein Isolate: 45 Grs · 172.89 kcal · P 40.95 · C 0.45 · G 0.81

#### cena · P1+C1

- Atun en lomitos al natural: 1 Pote · 120 kcal · P 30 · C 0 · G 0
- Fideos (Cocidos): 270 Grs · 424.71 kcal · P 15.66 · C 85.05 · G 2.43

### 5 comidas · corrida 1 · OK

- Seed: curation-real-5-1
- Totales: 2138.74 kcal · P 157.31 · C 289.05 · G 39.26
- Diferencia: kcal -1.26 · P 7.31 · C 39.05 · G -20.74

#### desayuno · P1+C1

- Claras de huevos: 6 Unid · 94.2 kcal · P 21 · C 1.2 · G 0.6
- Pan blanco: 135 Grs · 356.54 kcal · P 10.26 · C 68.85 · G 4.46

#### almuerzo · P1+C1

- Arroz integral: 70 Grs · 245 kcal · P 5.6 · C 52.5 · G 1.4
- Bola de lomo: 110 Grs · 144.1 kcal · P 23.65 · C 0 · G 5.5

#### merienda · P1+C1

- Galletitas de agua: 70 Grs · 308.7 kcal · P 7.7 · C 49 · G 9.1
- Whey protein Isolate: 20 Grs · 76.84 kcal · P 18.2 · C 0.2 · G 0.36

#### cena · P1+C1

- Arroz integral: 80 Grs · 280 kcal · P 6.4 · C 60 · G 1.6
- Carne de cerdo magro: 110 Grs · 166.1 kcal · P 24.2 · C 0 · G 7.7

#### snack · P1+C1

- Avena instantanea: 100 Grs · 352 kcal · P 13 · C 57 · G 8
- Whey protein Isolate: 30 Grs · 115.26 kcal · P 27.3 · C 0.3 · G 0.54

### 5 comidas · corrida 2 · OK

- Seed: curation-real-5-2
- Totales: 2139.24 kcal · P 166.73 · C 268.55 · G 48.59
- Diferencia: kcal -0.76 · P 16.73 · C 18.55 · G -11.41

#### desayuno · P1+C1

- Claras de huevos: 7 Unid · 109.9 kcal · P 24.5 · C 1.4 · G 0.7
- Galletitas de agua: 70 Grs · 308.7 kcal · P 7.7 · C 49 · G 9.1

#### almuerzo · P1+C1

- Arroz (Cocido): 190 Grs · 246.05 kcal · P 5.13 · C 55.1 · G 0.57
- Churrasco magro: 150 Grs · 216.75 kcal · P 32.25 · C 0 · G 12

#### merienda · P1+C1

- Claras de huevos: 5 Unid · 78.5 kcal · P 17.5 · C 1 · G 0.5
- Pan blanco: 125 Grs · 330.13 kcal · P 9.5 · C 63.75 · G 4.13

#### cena · P1+C1

- Arroz integral: 70 Grs · 245 kcal · P 5.6 · C 52.5 · G 1.4
- Churrasco magro: 140 Grs · 202.3 kcal · P 30.1 · C 0 · G 11.2

#### snack · P1+C1

- Galletitas de agua: 65 Grs · 286.65 kcal · P 7.15 · C 45.5 · G 8.45
- Whey protein Isolate: 30 Grs · 115.26 kcal · P 27.3 · C 0.3 · G 0.54

### 5 comidas · corrida 3 · OK

- Seed: curation-real-5-3
- Totales: 2138.15 kcal · P 162.45 · C 254.9 · G 55.24
- Diferencia: kcal -1.85 · P 12.45 · C 4.9 · G -4.76

#### desayuno · P1+C1

- Huevos: 4 Unid · 276 kcal · P 24 · C 0 · G 20
- Pan de centeno: 45 Grs · 116.87 kcal · P 3.83 · C 22.05 · G 1.49

#### almuerzo · P1+C1

- Arroz (Cocido): 130 Grs · 168.35 kcal · P 3.51 · C 37.7 · G 0.39
- Churrasco magro: 210 Grs · 303.45 kcal · P 45.15 · C 0 · G 16.8

#### merienda · P1+C1

- Claras de huevos: 5 Unid · 78.5 kcal · P 17.5 · C 1 · G 0.5
- Pan de centeno: 120 Grs · 311.64 kcal · P 10.2 · C 58.8 · G 3.96

#### cena · P1+C1

- Arroz integral (Cocido): 250 Grs · 276.25 kcal · P 6.5 · C 57.5 · G 2.25
- Cuadrada (Ternera): 100 Grs · 131 kcal · P 21.5 · C 0 · G 5

#### snack · P1+C1

- Claras de huevos: 5 Unid · 78.5 kcal · P 17.5 · C 1 · G 0.5
- Pan baguette: 145 Grs · 397.59 kcal · P 12.76 · C 76.85 · G 4.35

### 6 comidas · corrida 1 · OK

- Seed: curation-real-6-1
- Totales: 2139.99 kcal · P 173.19 · C 260.89 · G 48.45
- Diferencia: kcal -0.01 · P 23.19 · C 10.89 · G -11.55

#### desayuno · P1+C1

- Claras de huevos: 4 Unid · 62.8 kcal · P 14 · C 0.8 · G 0.4
- Pan de centeno: 120 Grs · 311.64 kcal · P 10.2 · C 58.8 · G 3.96

#### colacion · P1+C1

- Claras de huevos: 5 Unid · 78.5 kcal · P 17.5 · C 1 · G 0.5
- Pan baguette: 95 Grs · 260.49 kcal · P 8.36 · C 50.35 · G 2.85

#### almuerzo · P1+C1

- Arroz (Cocido): 120 Grs · 155.4 kcal · P 3.24 · C 34.8 · G 0.36
- Churrasco magro: 160 Grs · 231.2 kcal · P 34.4 · C 0 · G 12.8

#### merienda · P1+C1

- Copos de maiz sin azucar: 40 Grs · 144.68 kcal · P 2.64 · C 33.08 · G 0.2
- Whey protein SN: 45 Grs · 189.36 kcal · P 37.35 · C 3.91 · G 2.7

#### cena · P1+C1

- Arroz integral: 65 Grs · 227.5 kcal · P 5.2 · C 48.75 · G 1.3
- Churrasco magro: 80 Grs · 115.6 kcal · P 17.2 · C 0 · G 6.4

#### snack · P1+C1

- Huevos: 3 Unid · 207 kcal · P 18 · C 0 · G 15
- Pan de centeno: 60 Grs · 155.82 kcal · P 5.1 · C 29.4 · G 1.98

### 6 comidas · corrida 2 · OK

- Seed: curation-real-6-2
- Totales: 2139.83 kcal · P 181.16 · C 264.76 · G 42.87
- Diferencia: kcal -0.17 · P 31.16 · C 14.76 · G -17.13

#### desayuno · P1+C1

- Claras de huevos: 5 Unid · 78.5 kcal · P 17.5 · C 1 · G 0.5
- Pan de centeno: 110 Grs · 285.67 kcal · P 9.35 · C 53.9 · G 3.63

#### colacion · P1+C1

- Claras de huevos: 5 Unid · 78.5 kcal · P 17.5 · C 1 · G 0.5
- Pan con salvado carrefour: 4 Reb · 276.4 kcal · P 10 · C 52.8 · G 2.8

#### almuerzo · P1+C1

- Arroz (Cocido): 120 Grs · 155.4 kcal · P 3.24 · C 34.8 · G 0.36
- Churrasco magro: 140 Grs · 202.3 kcal · P 30.1 · C 0 · G 11.2

#### merienda · P1+C1

- Galletitas de agua: 35 Grs · 154.35 kcal · P 3.85 · C 24.5 · G 4.55
- Whey protein SN: 45 Grs · 189.36 kcal · P 37.35 · C 3.91 · G 2.7

#### cena · P1+C1

- Arroz integral (Cocido): 220 Grs · 243.1 kcal · P 5.72 · C 50.6 · G 1.98
- Churrasco magro: 80 Grs · 115.6 kcal · P 17.2 · C 0 · G 6.4

#### snack · P1+C1

- Galletitas de agua: 60 Grs · 264.6 kcal · P 6.6 · C 42 · G 7.8
- Whey protein Isolate: 25 Grs · 96.05 kcal · P 22.75 · C 0.25 · G 0.45

### 6 comidas · corrida 3 · OK

- Seed: curation-real-6-3
- Totales: 2138.61 kcal · P 173.63 · C 279.41 · G 36.27
- Diferencia: kcal -1.39 · P 23.63 · C 29.41 · G -23.73

#### desayuno · P1+C1

- Galletitas de agua: 35 Grs · 154.35 kcal · P 3.85 · C 24.5 · G 4.55
- Whey protein SN: 45 Grs · 189.36 kcal · P 37.35 · C 3.91 · G 2.7

#### colacion · P1+C1

- Claras de huevos: 4 Unid · 62.8 kcal · P 14 · C 0.8 · G 0.4
- Galletitas de agua: 65 Grs · 286.65 kcal · P 7.15 · C 45.5 · G 8.45

#### almuerzo · P1+C1

- Arroz (Cocido): 190 Grs · 246.05 kcal · P 5.13 · C 55.1 · G 0.57
- Claras de huevos: 8 Unid · 125.6 kcal · P 28 · C 1.6 · G 0.8

#### merienda · P1+C1

- Claras de huevos: 7 Unid · 109.9 kcal · P 24.5 · C 1.4 · G 0.7
- Pan: 100 Grs · 264.1 kcal · P 7.6 · C 51 · G 3.3

#### cena · P1+C1

- Arroz integral: 55 Grs · 192.5 kcal · P 4.4 · C 41.25 · G 1.1
- Cuadrada (Ternera): 120 Grs · 157.2 kcal · P 25.8 · C 0 · G 6

#### snack · P1+C1

- Avena instantanea: 95 Grs · 334.4 kcal · P 12.35 · C 54.15 · G 7.6
- Claras de huevos: 1 Unid · 15.7 kcal · P 3.5 · C 0.2 · G 0.1

## Cambios uno por uno, agrupados por categoría

### Carbohidratos

- ID Mongo 6619bfeb147cd50b6467769d · alimentoId 40 · Arroz (Cocido)
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → C1
  - MealTypes: — → lunch, dinner
  - Motivo: Arroz, fideo o pasta inequívoca: carbohidrato principal de almuerzo/cena.
  - Clasificación: REGLA_EXPLICITA_ARROZ_PASTA
- ID Mongo 6619bfeb147cd50b6467769f · alimentoId 42 · Arroz integral
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → C1
  - MealTypes: — → lunch, dinner
  - Motivo: Arroz, fideo o pasta inequívoca: carbohidrato principal de almuerzo/cena.
  - Clasificación: REGLA_EXPLICITA_ARROZ_PASTA
- ID Mongo 6619bfeb147cd50b646776a0 · alimentoId 43 · Arroz integral (Cocido)
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → C1
  - MealTypes: — → lunch, dinner
  - Motivo: Arroz, fideo o pasta inequívoca: carbohidrato principal de almuerzo/cena.
  - Clasificación: REGLA_EXPLICITA_ARROZ_PASTA
- ID Mongo 6619bfeb147cd50b646776a6 · alimentoId 49 · Avena instantanea
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → C1, C2
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Cereal simple de desayuno/merienda: carbohidrato principal o secundario.
  - Clasificación: INFERENCIA_ALTA_CEREAL_DESAYUNO
- ID Mongo 6619bfeb147cd50b646776af · alimentoId 58 · Batatas
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → C1
  - MealTypes: — → lunch, dinner
  - Motivo: Tubérculo o cereal simple utilizado como carbohidrato principal de plato.
  - Clasificación: INFERENCIA_ALTA_CARBOHIDRATO_PRINCIPAL
- ID Mongo 6619bfeb147cd50b646776c8 · alimentoId 83 · Capelletini giacomo tridicci
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → C1
  - MealTypes: — → lunch, dinner
  - Motivo: Arroz, fideo o pasta inequívoca: carbohidrato principal de almuerzo/cena.
  - Clasificación: REGLA_EXPLICITA_ARROZ_PASTA
- ID Mongo 6619bfeb147cd50b646776de · alimentoId 105 · Choclo entero
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → C1
  - MealTypes: — → lunch, dinner
  - Motivo: Tubérculo o cereal simple utilizado como carbohidrato principal de plato.
  - Clasificación: INFERENCIA_ALTA_CARBOHIDRATO_PRINCIPAL
- ID Mongo 6619bfeb147cd50b646776ed · alimentoId 120 · Copos de maiz sin azucar
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → C1, C2
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Cereal simple de desayuno/merienda: carbohidrato principal o secundario.
  - Clasificación: INFERENCIA_ALTA_CEREAL_DESAYUNO
- ID Mongo 6619bfeb147cd50b64677717 · alimentoId 162 · Fideos
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → C1
  - MealTypes: — → lunch, dinner
  - Motivo: Arroz, fideo o pasta inequívoca: carbohidrato principal de almuerzo/cena.
  - Clasificación: REGLA_EXPLICITA_ARROZ_PASTA
- ID Mongo 6619bfeb147cd50b64677718 · alimentoId 163 · Fideos (Cocidos)
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → C1
  - MealTypes: — → lunch, dinner
  - Motivo: Arroz, fideo o pasta inequívoca: carbohidrato principal de almuerzo/cena.
  - Clasificación: REGLA_EXPLICITA_ARROZ_PASTA
- ID Mongo 6619bfeb147cd50b64677719 · alimentoId 164 · Fideos sin gluten
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → C1
  - MealTypes: — → lunch, dinner
  - Motivo: Arroz, fideo o pasta inequívoca: carbohidrato principal de almuerzo/cena.
  - Clasificación: REGLA_EXPLICITA_ARROZ_PASTA
- ID Mongo 6619bfeb147cd50b64677786 · alimentoId 273 · Maiz
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → C1
  - MealTypes: — → lunch, dinner
  - Motivo: Tubérculo o cereal simple utilizado como carbohidrato principal de plato.
  - Clasificación: INFERENCIA_ALTA_CARBOHIDRATO_PRINCIPAL
- ID Mongo 6619bfeb147cd50b646777d6 · alimentoId 353 · Ñoquis con papa
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → C1
  - MealTypes: — → lunch, dinner
  - Motivo: Arroz, fideo o pasta inequívoca: carbohidrato principal de almuerzo/cena.
  - Clasificación: REGLA_EXPLICITA_ARROZ_PASTA
- ID Mongo 6619bfeb147cd50b646777d7 · alimentoId 354 · Ñoquis con papa carrefour
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → C1
  - MealTypes: — → lunch, dinner
  - Motivo: Arroz, fideo o pasta inequívoca: carbohidrato principal de almuerzo/cena.
  - Clasificación: REGLA_EXPLICITA_ARROZ_PASTA
- ID Mongo 6619bfeb147cd50b646777d8 · alimentoId 355 · ñoquis de papa
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → C1
  - MealTypes: — → lunch, dinner
  - Motivo: Arroz, fideo o pasta inequívoca: carbohidrato principal de almuerzo/cena.
  - Clasificación: REGLA_EXPLICITA_ARROZ_PASTA
- ID Mongo 6619bfeb147cd50b646777df · alimentoId 362 · Pan
  - Mode: GENERIC → GENERIC
  - Roles: C2 → C1, C2
  - MealTypes: lunch, dinner → breakfast, snack, extraSnack
  - Motivo: Pan simple de consumo habitual: carbohidrato principal/secundario para comidas livianas.
  - Clasificación: INFERENCIA_ALTA_PAN_SIMPLE
- ID Mongo 6619bfeb147cd50b646777e0 · alimentoId 363 · Pan artesano bimbo
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → C1, C2
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Pan simple de consumo habitual: carbohidrato principal/secundario para comidas livianas.
  - Clasificación: INFERENCIA_ALTA_PAN_SIMPLE
- ID Mongo 6619bfeb147cd50b646777e1 · alimentoId 364 · Pan baguette
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → C1, C2
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Pan simple de consumo habitual: carbohidrato principal/secundario para comidas livianas.
  - Clasificación: INFERENCIA_ALTA_PAN_SIMPLE
- ID Mongo 6619bfeb147cd50b646777e2 · alimentoId 365 · Pan blanco
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → C1, C2
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Pan blanco: carbohidrato principal/secundario para desayuno, merienda y snack extra.
  - Clasificación: REGLA_EXPLICITA_PAN_BLANCO
- ID Mongo 6619bfeb147cd50b646777e3 · alimentoId 366 · Pan con salvado carrefour
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → C1, C2
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Pan simple de consumo habitual: carbohidrato principal/secundario para comidas livianas.
  - Clasificación: INFERENCIA_ALTA_PAN_SIMPLE
- ID Mongo 6619bfeb147cd50b646777e4 · alimentoId 367 · Pan con salvado fargo plus
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → C1, C2
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Pan simple de consumo habitual: carbohidrato principal/secundario para comidas livianas.
  - Clasificación: INFERENCIA_ALTA_PAN_SIMPLE
- ID Mongo 6619bfeb147cd50b646777e5 · alimentoId 368 · Pan con salvado Noly
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → C1, C2
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Pan simple de consumo habitual: carbohidrato principal/secundario para comidas livianas.
  - Clasificación: INFERENCIA_ALTA_PAN_SIMPLE
- ID Mongo 6619bfeb147cd50b646777e6 · alimentoId 369 · Pan de centeno
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → C1, C2
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Pan simple de consumo habitual: carbohidrato principal/secundario para comidas livianas.
  - Clasificación: INFERENCIA_ALTA_PAN_SIMPLE
- ID Mongo 6619bfeb147cd50b646777e7 · alimentoId 370 · Pan de molde Bio sin gluten
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → C1, C2
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Pan simple de consumo habitual: carbohidrato principal/secundario para comidas livianas.
  - Clasificación: INFERENCIA_ALTA_PAN_SIMPLE
- ID Mongo 6619bfeb147cd50b646777e8 · alimentoId 371 · Pan de salvado (Fargo)
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → C1, C2
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Pan simple de consumo habitual: carbohidrato principal/secundario para comidas livianas.
  - Clasificación: INFERENCIA_ALTA_PAN_SIMPLE
- ID Mongo 6619bfeb147cd50b646777e9 · alimentoId 372 · Pan de salvado doble fargo
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → C1, C2
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Pan simple de consumo habitual: carbohidrato principal/secundario para comidas livianas.
  - Clasificación: INFERENCIA_ALTA_PAN_SIMPLE
- ID Mongo 6619bfeb147cd50b646777ea · alimentoId 373 · Pan doble integral fargo
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → C1, C2
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Pan simple de consumo habitual: carbohidrato principal/secundario para comidas livianas.
  - Clasificación: INFERENCIA_ALTA_PAN_SIMPLE
- ID Mongo 6619bfeb147cd50b646777eb · alimentoId 374 · Pan frances
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → C1, C2
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Pan simple de consumo habitual: carbohidrato principal/secundario para comidas livianas.
  - Clasificación: INFERENCIA_ALTA_PAN_SIMPLE
- ID Mongo 6619bfeb147cd50b646777ee · alimentoId 377 · Pan lactal
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → C1, C2
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Pan simple de consumo habitual: carbohidrato principal/secundario para comidas livianas.
  - Clasificación: INFERENCIA_ALTA_PAN_SIMPLE
- ID Mongo 6619bfeb147cd50b646777ef · alimentoId 378 · Pan lactal bimbo
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → C1, C2
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Pan simple de consumo habitual: carbohidrato principal/secundario para comidas livianas.
  - Clasificación: INFERENCIA_ALTA_PAN_SIMPLE
- ID Mongo 6619bfeb147cd50b646777f0 · alimentoId 379 · Pan lactal de salvado carrefour
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → C1, C2
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Pan simple de consumo habitual: carbohidrato principal/secundario para comidas livianas.
  - Clasificación: INFERENCIA_ALTA_PAN_SIMPLE
- ID Mongo 6619bfeb147cd50b646777f1 · alimentoId 380 · Pan lactal noly
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → C1, C2
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Pan simple de consumo habitual: carbohidrato principal/secundario para comidas livianas.
  - Clasificación: INFERENCIA_ALTA_PAN_SIMPLE
- ID Mongo 6619bfeb147cd50b646777f2 · alimentoId 381 · Pan negro
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → C1, C2
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Pan simple de consumo habitual: carbohidrato principal/secundario para comidas livianas.
  - Clasificación: INFERENCIA_ALTA_PAN_SIMPLE
- ID Mongo 6619bfeb147cd50b646777f8 · alimentoId 387 · Pan tipo artesano bimbo semillas del campo
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → C1, C2
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Pan simple de consumo habitual: carbohidrato principal/secundario para comidas livianas.
  - Clasificación: INFERENCIA_ALTA_PAN_SIMPLE
- ID Mongo 6619bfeb147cd50b646777fc · alimentoId 391 · Papas
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → C1
  - MealTypes: — → lunch, dinner
  - Motivo: Tubérculo o cereal simple utilizado como carbohidrato principal de plato.
  - Clasificación: INFERENCIA_ALTA_CARBOHIDRATO_PRINCIPAL
- ID Mongo 6619bfeb147cd50b64677801 · alimentoId 396 · Papaya
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → F
  - MealTypes: — → breakfast, lunch, snack, dinner, extraSnack
  - Motivo: Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
  - Clasificación: REGLA_EXPLICITA_FRUTAS
- ID Mongo 6619bfeb147cd50b64677802 · alimentoId 397 · Pasas de uva
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → F
  - MealTypes: — → breakfast, lunch, snack, dinner, extraSnack
  - Motivo: Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
  - Clasificación: REGLA_EXPLICITA_FRUTAS
- ID Mongo 6619bfeb147cd50b64677818 · alimentoId 419 · Polenta
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → C1
  - MealTypes: — → lunch, dinner
  - Motivo: Tubérculo o cereal simple utilizado como carbohidrato principal de plato.
  - Clasificación: INFERENCIA_ALTA_CARBOHIDRATO_PRINCIPAL
- ID Mongo 6619bfeb147cd50b64677825 · alimentoId 432 · Pure de papas (General)
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → C1
  - MealTypes: — → lunch, dinner
  - Motivo: Tubérculo o cereal simple utilizado como carbohidrato principal de plato.
  - Clasificación: INFERENCIA_ALTA_CARBOHIDRATO_PRINCIPAL
- ID Mongo 6619bfeb147cd50b64677865 · alimentoId 491 · Ravioles (Carrefour)
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → C1
  - MealTypes: — → lunch, dinner
  - Motivo: Arroz, fideo o pasta inequívoca: carbohidrato principal de almuerzo/cena.
  - Clasificación: REGLA_EXPLICITA_ARROZ_PASTA
- ID Mongo 6619bfeb147cd50b646778a0 · alimentoId 548 · Tostadas clasicas
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → C1, C2
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Galleta/tostada simple y genérica para desayuno, merienda o snack extra.
  - Clasificación: INFERENCIA_ALTA_CARBOHIDRATO_LIVIANO
- ID Mongo 6619bfeb147cd50b646778a3 · alimentoId 551 · Tostadas de arroz
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → C1, C2
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Galleta/tostada simple y genérica para desayuno, merienda o snack extra.
  - Clasificación: INFERENCIA_ALTA_CARBOHIDRATO_LIVIANO
- ID Mongo 6619bfeb147cd50b646778ce · alimentoId 592 · Yogurisimo bebible
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P2
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Yogur inequívoco: proteína secundaria para desayuno, merienda y snack extra.
  - Clasificación: INFERENCIA_ALTA_YOGUR
- ID Mongo 6619bfeb147cd50b646778cf · alimentoId 593 · Yogurisimo firme la serenisima (190 grs)
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P2
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Yogur inequívoco: proteína secundaria para desayuno, merienda y snack extra.
  - Clasificación: INFERENCIA_ALTA_YOGUR
- ID Mongo 6619bfeb147cd50b646778d0 · alimentoId 594 · Yogurt activia bebible
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P2
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Yogur inequívoco: proteína secundaria para desayuno, merienda y snack extra.
  - Clasificación: INFERENCIA_ALTA_YOGUR
- ID Mongo 6619bfeb147cd50b646778d1 · alimentoId 595 · Yogurt bebible (Ser)
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P2
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Yogur inequívoco: proteína secundaria para desayuno, merienda y snack extra.
  - Clasificación: INFERENCIA_ALTA_YOGUR
- ID Mongo 6619bfeb147cd50b646778d3 · alimentoId 597 · Yogurt descremado bebible Ilolay
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P2
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Yogur inequívoco: proteína secundaria para desayuno, merienda y snack extra.
  - Clasificación: INFERENCIA_ALTA_YOGUR
- ID Mongo 6619bfeb147cd50b646778d4 · alimentoId 598 · Yogurt descremado bebible vida
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P2
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Yogur inequívoco: proteína secundaria para desayuno, merienda y snack extra.
  - Clasificación: INFERENCIA_ALTA_YOGUR
- ID Mongo 6619bfeb147cd50b646778d6 · alimentoId 600 · Yogurt entero bebible Ilolay
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P2
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Yogur inequívoco: proteína secundaria para desayuno, merienda y snack extra.
  - Clasificación: INFERENCIA_ALTA_YOGUR
- ID Mongo 6619bfeb147cd50b646778d7 · alimentoId 601 · Yogurt entero bebible Yogs
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P2
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Yogur inequívoco: proteína secundaria para desayuno, merienda y snack extra.
  - Clasificación: INFERENCIA_ALTA_YOGUR
- ID Mongo 6619bfeb147cd50b646778d8 · alimentoId 602 · Yogurt entero gran compra
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P2
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Yogur inequívoco: proteína secundaria para desayuno, merienda y snack extra.
  - Clasificación: INFERENCIA_ALTA_YOGUR
- ID Mongo 6619bfeb147cd50b646778d9 · alimentoId 603 · Yogurt light gran compra
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P2
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Yogur inequívoco: proteína secundaria para desayuno, merienda y snack extra.
  - Clasificación: INFERENCIA_ALTA_YOGUR

### Fiambres

- ID Mongo 6619bfeb147cd50b6467775a · alimentoId 229 · Jamon cocido cagnoli
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P2
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Jamón cocido: proteína secundaria para desayuno, merienda y snack extra.
  - Clasificación: REGLA_EXPLICITA_JAMON_COCIDO
- ID Mongo 6619bfeb147cd50b6467775b · alimentoId 230 · Jamon cocido feteado
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P2
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Jamón cocido: proteína secundaria para desayuno, merienda y snack extra.
  - Clasificación: REGLA_EXPLICITA_JAMON_COCIDO
- ID Mongo 6619bfeb147cd50b6467775c · alimentoId 231 · Jamon cocido lario
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P2
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Jamón cocido: proteína secundaria para desayuno, merienda y snack extra.
  - Clasificación: REGLA_EXPLICITA_JAMON_COCIDO
- ID Mongo 6619bfeb147cd50b6467775d · alimentoId 232 · Jamon cocido paladini
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P2
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Jamón cocido: proteína secundaria para desayuno, merienda y snack extra.
  - Clasificación: REGLA_EXPLICITA_JAMON_COCIDO

### Frutas

- ID Mongo 6619bfeb147cd50b64677698 · alimentoId 35 · Anana
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → F
  - MealTypes: — → breakfast, lunch, snack, dinner, extraSnack
  - Motivo: Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
  - Clasificación: REGLA_EXPLICITA_FRUTAS
- ID Mongo 6619bfeb147cd50b64677699 · alimentoId 36 · Arandanos
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → F
  - MealTypes: — → breakfast, lunch, snack, dinner, extraSnack
  - Motivo: Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
  - Clasificación: REGLA_EXPLICITA_FRUTAS
- ID Mongo 6619bfeb147cd50b646776a8 · alimentoId 51 · Banana
  - Mode: GENERIC → GENERIC
  - Roles: F → F
  - MealTypes: lunch, dinner → breakfast, lunch, snack, dinner, extraSnack
  - Motivo: Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
  - Clasificación: REGLA_EXPLICITA_FRUTAS
- ID Mongo 6619bfeb147cd50b646776a9 · alimentoId 52 · Banana chica
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → F
  - MealTypes: — → breakfast, lunch, snack, dinner, extraSnack
  - Motivo: Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
  - Clasificación: REGLA_EXPLICITA_FRUTAS
- ID Mongo 6619bfeb147cd50b646776aa · alimentoId 53 · Banana grande
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → F
  - MealTypes: — → breakfast, lunch, snack, dinner, extraSnack
  - Motivo: Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
  - Clasificación: REGLA_EXPLICITA_FRUTAS
- ID Mongo 6619bfeb147cd50b646776ab · alimentoId 54 · Banana mediana
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → F
  - MealTypes: — → breakfast, lunch, snack, dinner, extraSnack
  - Motivo: Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
  - Clasificación: REGLA_EXPLICITA_FRUTAS
- ID Mongo 6619bfeb147cd50b646776db · alimentoId 102 · Cerezas
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → F
  - MealTypes: — → breakfast, lunch, snack, dinner, extraSnack
  - Motivo: Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
  - Clasificación: REGLA_EXPLICITA_FRUTAS
- ID Mongo 6619bfeb147cd50b646776dd · alimentoId 104 · Chirimoya
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → F
  - MealTypes: — → breakfast, lunch, snack, dinner, extraSnack
  - Motivo: Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
  - Clasificación: REGLA_EXPLICITA_FRUTAS
- ID Mongo 6619bfeb147cd50b646776e7 · alimentoId 114 · Ciruela
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → F
  - MealTypes: — → breakfast, lunch, snack, dinner, extraSnack
  - Motivo: Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
  - Clasificación: REGLA_EXPLICITA_FRUTAS
- ID Mongo 6619bfeb147cd50b646776f9 · alimentoId 132 · Damasco
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → F
  - MealTypes: — → breakfast, lunch, snack, dinner, extraSnack
  - Motivo: Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
  - Clasificación: REGLA_EXPLICITA_FRUTAS
- ID Mongo 6619bfeb147cd50b64677709 · alimentoId 148 · Durazno
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → F
  - MealTypes: — → breakfast, lunch, snack, dinner, extraSnack
  - Motivo: Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
  - Clasificación: REGLA_EXPLICITA_FRUTAS
- ID Mongo 6619bfeb147cd50b6467770a · alimentoId 149 · Durazno chico
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → F
  - MealTypes: — → breakfast, lunch, snack, dinner, extraSnack
  - Motivo: Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
  - Clasificación: REGLA_EXPLICITA_FRUTAS
- ID Mongo 6619bfeb147cd50b6467770b · alimentoId 150 · Durazno grande
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → F
  - MealTypes: — → breakfast, lunch, snack, dinner, extraSnack
  - Motivo: Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
  - Clasificación: REGLA_EXPLICITA_FRUTAS
- ID Mongo 6619bfeb147cd50b6467770c · alimentoId 151 · Durazno mediano
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → F
  - MealTypes: — → breakfast, lunch, snack, dinner, extraSnack
  - Motivo: Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
  - Clasificación: REGLA_EXPLICITA_FRUTAS
- ID Mongo 6619bfeb147cd50b6467771e · alimentoId 169 · Frambuesa
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → F
  - MealTypes: — → breakfast, lunch, snack, dinner, extraSnack
  - Motivo: Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
  - Clasificación: REGLA_EXPLICITA_FRUTAS
- ID Mongo 6619bfeb147cd50b64677722 · alimentoId 173 · Frutillas
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → F
  - MealTypes: — → breakfast, lunch, snack, dinner, extraSnack
  - Motivo: Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
  - Clasificación: REGLA_EXPLICITA_FRUTAS
- ID Mongo 6619bfeb147cd50b64677744 · alimentoId 207 · Granada
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → F
  - MealTypes: — → breakfast, lunch, snack, dinner, extraSnack
  - Motivo: Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
  - Clasificación: REGLA_EXPLICITA_FRUTAS
- ID Mongo 6619bfeb147cd50b64677754 · alimentoId 223 · Higo
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → F
  - MealTypes: — → breakfast, lunch, snack, dinner, extraSnack
  - Motivo: Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
  - Clasificación: REGLA_EXPLICITA_FRUTAS
- ID Mongo 6619bfeb147cd50b64677764 · alimentoId 239 · Kiwi
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → F
  - MealTypes: — → breakfast, lunch, snack, dinner, extraSnack
  - Motivo: Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
  - Clasificación: REGLA_EXPLICITA_FRUTAS
- ID Mongo 6619bfeb147cd50b64677765 · alimentoId 240 · Kiwi (mediano)
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → F
  - MealTypes: — → breakfast, lunch, snack, dinner, extraSnack
  - Motivo: Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
  - Clasificación: REGLA_EXPLICITA_FRUTAS
- ID Mongo 6619bfeb147cd50b64677789 · alimentoId 276 · Mandarina
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → F
  - MealTypes: — → breakfast, lunch, snack, dinner, extraSnack
  - Motivo: Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
  - Clasificación: REGLA_EXPLICITA_FRUTAS
- ID Mongo 6619bfeb147cd50b6467778a · alimentoId 277 · Mandarina chica
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → F
  - MealTypes: — → breakfast, lunch, snack, dinner, extraSnack
  - Motivo: Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
  - Clasificación: REGLA_EXPLICITA_FRUTAS
- ID Mongo 6619bfeb147cd50b6467778b · alimentoId 278 · Mandarina grande
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → F
  - MealTypes: — → breakfast, lunch, snack, dinner, extraSnack
  - Motivo: Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
  - Clasificación: REGLA_EXPLICITA_FRUTAS
- ID Mongo 6619bfeb147cd50b6467778c · alimentoId 279 · Mandarina mediana
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → F
  - MealTypes: — → breakfast, lunch, snack, dinner, extraSnack
  - Motivo: Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
  - Clasificación: REGLA_EXPLICITA_FRUTAS
- ID Mongo 6619bfeb147cd50b6467778e · alimentoId 281 · Mango
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → F
  - MealTypes: — → breakfast, lunch, snack, dinner, extraSnack
  - Motivo: Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
  - Clasificación: REGLA_EXPLICITA_FRUTAS
- ID Mongo 6619bfeb147cd50b64677794 · alimentoId 287 · Manzana
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → F
  - MealTypes: — → breakfast, lunch, snack, dinner, extraSnack
  - Motivo: Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
  - Clasificación: REGLA_EXPLICITA_FRUTAS
- ID Mongo 6619bfeb147cd50b64677795 · alimentoId 288 · Manzana chica
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → F
  - MealTypes: — → breakfast, lunch, snack, dinner, extraSnack
  - Motivo: Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
  - Clasificación: REGLA_EXPLICITA_FRUTAS
- ID Mongo 6619bfeb147cd50b64677796 · alimentoId 289 · Manzana grande
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → F
  - MealTypes: — → breakfast, lunch, snack, dinner, extraSnack
  - Motivo: Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
  - Clasificación: REGLA_EXPLICITA_FRUTAS
- ID Mongo 6619bfeb147cd50b64677797 · alimentoId 290 · Manzana mediana
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → F
  - MealTypes: — → breakfast, lunch, snack, dinner, extraSnack
  - Motivo: Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
  - Clasificación: REGLA_EXPLICITA_FRUTAS
- ID Mongo 6619bfeb147cd50b646777a0 · alimentoId 299 · Melon
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → F
  - MealTypes: — → breakfast, lunch, snack, dinner, extraSnack
  - Motivo: Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
  - Clasificación: REGLA_EXPLICITA_FRUTAS
- ID Mongo 6619bfeb147cd50b646777cb · alimentoId 342 · Naranja
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → F
  - MealTypes: — → breakfast, lunch, snack, dinner, extraSnack
  - Motivo: Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
  - Clasificación: REGLA_EXPLICITA_FRUTAS
- ID Mongo 6619bfeb147cd50b646777cc · alimentoId 343 · Naranja chica
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → F
  - MealTypes: — → breakfast, lunch, snack, dinner, extraSnack
  - Motivo: Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
  - Clasificación: REGLA_EXPLICITA_FRUTAS
- ID Mongo 6619bfeb147cd50b646777cd · alimentoId 344 · Naranja grande
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → F
  - MealTypes: — → breakfast, lunch, snack, dinner, extraSnack
  - Motivo: Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
  - Clasificación: REGLA_EXPLICITA_FRUTAS
- ID Mongo 6619bfeb147cd50b646777ce · alimentoId 345 · Naranja mediana
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → F
  - MealTypes: — → breakfast, lunch, snack, dinner, extraSnack
  - Motivo: Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
  - Clasificación: REGLA_EXPLICITA_FRUTAS
- ID Mongo 6619bfeb147cd50b6467780d · alimentoId 408 · Pera
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → F
  - MealTypes: — → breakfast, lunch, snack, dinner, extraSnack
  - Motivo: Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
  - Clasificación: REGLA_EXPLICITA_FRUTAS
- ID Mongo 6619bfeb147cd50b6467780e · alimentoId 409 · Pera chica
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → F
  - MealTypes: — → breakfast, lunch, snack, dinner, extraSnack
  - Motivo: Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
  - Clasificación: REGLA_EXPLICITA_FRUTAS
- ID Mongo 6619bfeb147cd50b6467780f · alimentoId 410 · Pera grande
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → F
  - MealTypes: — → breakfast, lunch, snack, dinner, extraSnack
  - Motivo: Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
  - Clasificación: REGLA_EXPLICITA_FRUTAS
- ID Mongo 6619bfeb147cd50b64677810 · alimentoId 411 · Pera mediana
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → F
  - MealTypes: — → breakfast, lunch, snack, dinner, extraSnack
  - Motivo: Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
  - Clasificación: REGLA_EXPLICITA_FRUTAS
- ID Mongo 6619bfeb147cd50b6467781d · alimentoId 424 · Pomelo
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → F
  - MealTypes: — → breakfast, lunch, snack, dinner, extraSnack
  - Motivo: Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
  - Clasificación: REGLA_EXPLICITA_FRUTAS
- ID Mongo 6619bfeb147cd50b6467787f · alimentoId 515 · Sandia
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → F
  - MealTypes: — → breakfast, lunch, snack, dinner, extraSnack
  - Motivo: Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
  - Clasificación: REGLA_EXPLICITA_FRUTAS
- ID Mongo 6619bfeb147cd50b646778c6 · alimentoId 584 · Uvas
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → F
  - MealTypes: — → breakfast, lunch, snack, dinner, extraSnack
  - Motivo: Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
  - Clasificación: REGLA_EXPLICITA_FRUTAS

### Grasas

- ID Mongo 6619bfeb147cd50b64677676 · alimentoId 1 · Aceite de coco
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → G
  - MealTypes: — → lunch, dinner
  - Motivo: Aceite alimentario: complemento graso limitado a almuerzo y cena.
  - Clasificación: REGLA_EXPLICITA_ACEITES
- ID Mongo 6619bfeb147cd50b64677678 · alimentoId 3 · Aceitunas negras
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: G → G
  - MealTypes: — → lunch, dinner
  - Motivo: Aceituna: complemento graso salado para almuerzo/cena.
  - Clasificación: INFERENCIA_ALTA_COMPLEMENTO_GRASO
- ID Mongo 6619bfeb147cd50b64677679 · alimentoId 4 · Aceitunas verdes
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → G
  - MealTypes: — → lunch, dinner
  - Motivo: Aceituna: complemento graso salado para almuerzo/cena.
  - Clasificación: INFERENCIA_ALTA_COMPLEMENTO_GRASO
- ID Mongo 6619bfeb147cd50b64677696 · alimentoId 34 · Almendras
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → G
  - MealTypes: — → breakfast, lunch, snack, dinner, extraSnack
  - Motivo: Fruto seco inequívoco: complemento graso utilizable también en platos principales.
  - Clasificación: REGLA_EXPLICITA_FRUTOS_SECOS
- ID Mongo 6619bfeb147cd50b646776a5 · alimentoId 48 · Avellanas
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → G
  - MealTypes: — → breakfast, lunch, snack, dinner, extraSnack
  - Motivo: Fruto seco inequívoco: complemento graso utilizable también en platos principales.
  - Clasificación: REGLA_EXPLICITA_FRUTOS_SECOS
- ID Mongo 6619bfeb147cd50b646776d3 · alimentoId 94 · Castañas
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → G
  - MealTypes: — → breakfast, lunch, snack, dinner, extraSnack
  - Motivo: Fruto seco inequívoco: complemento graso utilizable también en platos principales.
  - Clasificación: REGLA_EXPLICITA_FRUTOS_SECOS
- ID Mongo 6619bfeb147cd50b646776d4 · alimentoId 96 · Castañas de caju
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → G
  - MealTypes: — → breakfast, lunch, snack, dinner, extraSnack
  - Motivo: Fruto seco inequívoco: complemento graso utilizable también en platos principales.
  - Clasificación: REGLA_EXPLICITA_FRUTOS_SECOS
- ID Mongo 6619bfeb147cd50b64677755 · alimentoId 224 · Huevos
  - Mode: GENERIC → GENERIC
  - Roles: P2 → P1, P2
  - MealTypes: lunch, dinner → breakfast, lunch, snack, dinner, extraSnack
  - Motivo: Huevo o claras: fuente proteica principal/secundaria apta para todos los momentos.
  - Clasificación: REGLA_EXPLICITA_HUEVOS
- ID Mongo 6619bfeb147cd50b6467778f · alimentoId 282 · Mani
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → G
  - MealTypes: — → breakfast, lunch, snack, dinner, extraSnack
  - Motivo: Fruto seco inequívoco: complemento graso utilizable también en platos principales.
  - Clasificación: REGLA_EXPLICITA_FRUTOS_SECOS
- ID Mongo 6619bfeb147cd50b64677793 · alimentoId 286 · Mantequilla de mani
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → G
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Pasta de fruto seco: complemento graso para comidas livianas.
  - Clasificación: INFERENCIA_ALTA_UNTABLE_FRUTO_SECO
- ID Mongo 6619bfeb147cd50b646777d1 · alimentoId 349 · Nueces peladas
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → G
  - MealTypes: — → breakfast, lunch, snack, dinner, extraSnack
  - Motivo: Fruto seco inequívoco: complemento graso utilizable también en platos principales.
  - Clasificación: REGLA_EXPLICITA_FRUTOS_SECOS
- ID Mongo 6619bfeb147cd50b646777de · alimentoId 361 · Palta
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → G
  - MealTypes: — → breakfast, lunch, snack, dinner
  - Motivo: Palta: complemento graso para desayuno, almuerzo, merienda y cena.
  - Clasificación: REGLA_EXPLICITA_PALTA
- ID Mongo 6619bfeb147cd50b64677803 · alimentoId 398 · Pasta de mani
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → G
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Pasta de fruto seco: complemento graso para comidas livianas.
  - Clasificación: INFERENCIA_ALTA_UNTABLE_FRUTO_SECO
- ID Mongo 6619bfeb147cd50b64677804 · alimentoId 399 · Pasta de mani Sin tacc
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → G
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Pasta de fruto seco: complemento graso para comidas livianas.
  - Clasificación: INFERENCIA_ALTA_UNTABLE_FRUTO_SECO
- ID Mongo 6619bfeb147cd50b64677813 · alimentoId 415 · Pistachos
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → G
  - MealTypes: — → breakfast, lunch, snack, dinner, extraSnack
  - Motivo: Fruto seco inequívoco: complemento graso utilizable también en platos principales.
  - Clasificación: REGLA_EXPLICITA_FRUTOS_SECOS
- ID Mongo 6619bfeb147cd50b64677887 · alimentoId 523 · Semillas de girasol
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → G
  - MealTypes: — → breakfast, lunch, snack, dinner, extraSnack
  - Motivo: Semilla comestible inequívoca utilizada como complemento graso.
  - Clasificación: INFERENCIA_ALTA_SEMILLAS
- ID Mongo 6619bfeb147cd50b64677888 · alimentoId 524 · Semillas de lino
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → G
  - MealTypes: — → breakfast, lunch, snack, dinner, extraSnack
  - Motivo: Semilla comestible inequívoca utilizada como complemento graso.
  - Clasificación: INFERENCIA_ALTA_SEMILLAS

### Lácteos

- ID Mongo 6619bfeb147cd50b646776c7 · alimentoId 82 · Capelletini giacomo jamon  y queso
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → C1
  - MealTypes: — → lunch, dinner
  - Motivo: Arroz, fideo o pasta inequívoca: carbohidrato principal de almuerzo/cena.
  - Clasificación: REGLA_EXPLICITA_ARROZ_PASTA
- ID Mongo 6619bfeb147cd50b6467776c · alimentoId 247 · Leche descremada
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P2
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Leche descremada inequívoca: proteína secundaria para desayuno, merienda y snack extra.
  - Clasificación: REGLA_EXPLICITA_LECHE_DESCREMADA
- ID Mongo 6619bfeb147cd50b6467776d · alimentoId 248 · Leche descremada (Apostoles)
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P2
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Leche descremada inequívoca: proteína secundaria para desayuno, merienda y snack extra.
  - Clasificación: REGLA_EXPLICITA_LECHE_DESCREMADA
- ID Mongo 6619bfeb147cd50b6467776e · alimentoId 249 · Leche descremada alta en proteínas
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P2
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Leche descremada inequívoca: proteína secundaria para desayuno, merienda y snack extra.
  - Clasificación: REGLA_EXPLICITA_LECHE_DESCREMADA
- ID Mongo 6619bfeb147cd50b6467776f · alimentoId 250 · Leche descremada Apostoles
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P2
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Leche descremada inequívoca: proteína secundaria para desayuno, merienda y snack extra.
  - Clasificación: REGLA_EXPLICITA_LECHE_DESCREMADA
- ID Mongo 6619bfeb147cd50b64677770 · alimentoId 251 · Leche descremada en polvo
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P2
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Leche descremada inequívoca: proteína secundaria para desayuno, merienda y snack extra.
  - Clasificación: REGLA_EXPLICITA_LECHE_DESCREMADA
- ID Mongo 6619bfeb147cd50b64677771 · alimentoId 252 · Leche descremada la serenisima
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P2
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Leche descremada inequívoca: proteína secundaria para desayuno, merienda y snack extra.
  - Clasificación: REGLA_EXPLICITA_LECHE_DESCREMADA
- ID Mongo 6619bfeb147cd50b64677772 · alimentoId 253 · Leche descremada sin lactosa
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P2
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Leche descremada inequívoca: proteína secundaria para desayuno, merienda y snack extra.
  - Clasificación: REGLA_EXPLICITA_LECHE_DESCREMADA
- ID Mongo 6619bfeb147cd50b64677773 · alimentoId 254 · Leche descremada tregar
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P2
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Leche descremada inequívoca: proteína secundaria para desayuno, merienda y snack extra.
  - Clasificación: REGLA_EXPLICITA_LECHE_DESCREMADA
- ID Mongo 6619bfeb147cd50b64677774 · alimentoId 255 · Leche deslactosada descremada (La serenisima)
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P2
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Leche descremada inequívoca: proteína secundaria para desayuno, merienda y snack extra.
  - Clasificación: REGLA_EXPLICITA_LECHE_DESCREMADA
- ID Mongo 6619bfeb147cd50b64677777 · alimentoId 258 · Leche entera
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P2
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Leche simple: proteína secundaria para desayuno, merienda y snack extra.
  - Clasificación: INFERENCIA_ALTA_LECHE
- ID Mongo 6619bfeb147cd50b6467777b · alimentoId 262 · Leche parcialmente descremada (Veronica)
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P2
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Leche simple: proteína secundaria para desayuno, merienda y snack extra.
  - Clasificación: INFERENCIA_ALTA_LECHE
- ID Mongo 6619bfeb147cd50b64677840 · alimentoId 454 · Queso cremon cremoso
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P2, G
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Queso cremoso: proteína secundaria y complemento graso para comidas livianas.
  - Clasificación: REGLA_EXPLICITA_QUESO_CREMOSO
- ID Mongo 6619bfeb147cd50b64677842 · alimentoId 456 · Queso cremoso
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P2, G
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Queso cremoso: proteína secundaria y complemento graso para comidas livianas.
  - Clasificación: REGLA_EXPLICITA_QUESO_CREMOSO
- ID Mongo 6619bfeb147cd50b64677843 · alimentoId 457 · Queso cremoso (cremac)
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P2, G
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Queso cremoso: proteína secundaria y complemento graso para comidas livianas.
  - Clasificación: REGLA_EXPLICITA_QUESO_CREMOSO
- ID Mongo 6619bfeb147cd50b64677845 · alimentoId 459 · Queso cremoso cremac
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P2, G
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Queso cremoso: proteína secundaria y complemento graso para comidas livianas.
  - Clasificación: REGLA_EXPLICITA_QUESO_CREMOSO
- ID Mongo 6619bfeb147cd50b64677846 · alimentoId 460 · Queso cremoso light
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P2, G
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Queso cremoso: proteína secundaria y complemento graso para comidas livianas.
  - Clasificación: REGLA_EXPLICITA_QUESO_CREMOSO
- ID Mongo 6619bfeb147cd50b64677847 · alimentoId 461 · Queso cremoso port salut
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P2, G
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Queso cremoso: proteína secundaria y complemento graso para comidas livianas.
  - Clasificación: REGLA_EXPLICITA_QUESO_CREMOSO
- ID Mongo 6619bfeb147cd50b64677848 · alimentoId 462 · Queso cremoso punta del agua
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P2, G
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Queso cremoso: proteína secundaria y complemento graso para comidas livianas.
  - Clasificación: REGLA_EXPLICITA_QUESO_CREMOSO
- ID Mongo 6619bfeb147cd50b64677849 · alimentoId 463 · Queso cremoso punta del agua light
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P2, G
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Queso cremoso: proteína secundaria y complemento graso para comidas livianas.
  - Clasificación: REGLA_EXPLICITA_QUESO_CREMOSO
- ID Mongo 6619bfeb147cd50b6467784a · alimentoId 464 · Queso cremoso saint paulin
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P2, G
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Queso cremoso: proteína secundaria y complemento graso para comidas livianas.
  - Clasificación: REGLA_EXPLICITA_QUESO_CREMOSO
- ID Mongo 6619bfeb147cd50b6467784b · alimentoId 466 · Queso cremoso temblay
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P2, G
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Queso cremoso: proteína secundaria y complemento graso para comidas livianas.
  - Clasificación: REGLA_EXPLICITA_QUESO_CREMOSO

### Otros

- ID Mongo 6619bfeb147cd50b64677819 · alimentoId 420 · Polenta (Coto)
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → C1
  - MealTypes: — → lunch, dinner
  - Motivo: Tubérculo o cereal simple utilizado como carbohidrato principal de plato.
  - Clasificación: INFERENCIA_ALTA_CARBOHIDRATO_PRINCIPAL
- ID Mongo 6619bfeb147cd50b6467781a · alimentoId 421 · Polenta (Presto pronta)
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → C1
  - MealTypes: — → lunch, dinner
  - Motivo: Tubérculo o cereal simple utilizado como carbohidrato principal de plato.
  - Clasificación: INFERENCIA_ALTA_CARBOHIDRATO_PRINCIPAL
- ID Mongo 6619bfeb147cd50b6467781b · alimentoId 422 · Polenta (Quaker)
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → C1
  - MealTypes: — → lunch, dinner
  - Motivo: Tubérculo o cereal simple utilizado como carbohidrato principal de plato.
  - Clasificación: INFERENCIA_ALTA_CARBOHIDRATO_PRINCIPAL
- ID Mongo 6619bfeb147cd50b6467781c · alimentoId 423 · Polenta carrefour
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → C1
  - MealTypes: — → lunch, dinner
  - Motivo: Tubérculo o cereal simple utilizado como carbohidrato principal de plato.
  - Clasificación: INFERENCIA_ALTA_CARBOHIDRATO_PRINCIPAL
- ID Mongo 6619bfeb147cd50b646778ad · alimentoId 561 · Tostadas de mesa
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → C1, C2
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Galleta/tostada simple y genérica para desayuno, merienda o snack extra.
  - Clasificación: INFERENCIA_ALTA_CARBOHIDRATO_LIVIANO
- ID Mongo 6619bfeb147cd50b646778d2 · alimentoId 596 · Yogurt bebible vida light
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P2
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Yogur inequívoco: proteína secundaria para desayuno, merienda y snack extra.
  - Clasificación: INFERENCIA_ALTA_YOGUR
- ID Mongo 6619bfeb147cd50b646778d5 · alimentoId 599 · Yogurt descremado gran compra
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P2
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Yogur inequívoco: proteína secundaria para desayuno, merienda y snack extra.
  - Clasificación: INFERENCIA_ALTA_YOGUR
- ID Mongo 6619bfeb147cd50b646778da · alimentoId 604 · Yogurt light la serenisima (Bebible)
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P2
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Yogur inequívoco: proteína secundaria para desayuno, merienda y snack extra.
  - Clasificación: INFERENCIA_ALTA_YOGUR

### Proteínas

- ID Mongo 6619bfeb147cd50b646776a4 · alimentoId 47 · Atun en lomitos al natural
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P1
  - MealTypes: — → lunch, dinner
  - Motivo: Carne, pescado o proteína vegetal principal inequívoca y reutilizable.
  - Clasificación: INFERENCIA_ALTA_PROTEINA_PRINCIPAL
- ID Mongo 6619bfeb147cd50b646776bd · alimentoId 72 · Bola de lomo
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P1
  - MealTypes: — → lunch, dinner
  - Motivo: Carne, pescado o proteína vegetal principal inequívoca y reutilizable.
  - Clasificación: INFERENCIA_ALTA_PROTEINA_PRINCIPAL
- ID Mongo 6619bfeb147cd50b646776cd · alimentoId 88 · Carne de cerdo magro
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P1
  - MealTypes: — → lunch, dinner
  - Motivo: Carne, pescado o proteína vegetal principal inequívoca y reutilizable.
  - Clasificación: INFERENCIA_ALTA_PROTEINA_PRINCIPAL
- ID Mongo 6619bfeb147cd50b646776e6 · alimentoId 113 · Churrasco magro
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P1
  - MealTypes: — → lunch, dinner
  - Motivo: Corte o proteína principal expresamente solicitada para almuerzo/cena.
  - Clasificación: REGLA_EXPLICITA_PROTEINAS_PRINCIPALES
- ID Mongo 6619bfeb147cd50b646776e8 · alimentoId 115 · Claras de huevos
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P1, P2
  - MealTypes: — → breakfast, lunch, snack, dinner, extraSnack
  - Motivo: Huevo o claras: fuente proteica principal/secundaria apta para todos los momentos.
  - Clasificación: REGLA_EXPLICITA_HUEVOS
- ID Mongo 6619bfeb147cd50b646776f6 · alimentoId 129 · Cuadrada (Ternera)
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P1
  - MealTypes: — → lunch, dinner
  - Motivo: Carne, pescado o proteína vegetal principal inequívoca y reutilizable.
  - Clasificación: INFERENCIA_ALTA_PROTEINA_PRINCIPAL
- ID Mongo 6619bfeb147cd50b6467771a · alimentoId 165 · Filet de merluza
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P1
  - MealTypes: — → lunch, dinner
  - Motivo: Carne, pescado o proteína vegetal principal inequívoca y reutilizable.
  - Clasificación: INFERENCIA_ALTA_PROTEINA_PRINCIPAL
- ID Mongo 6619bfeb147cd50b6467773c · alimentoId 199 · Gambas
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P1
  - MealTypes: — → lunch, dinner
  - Motivo: Carne, pescado o proteína vegetal principal inequívoca y reutilizable.
  - Clasificación: INFERENCIA_ALTA_PROTEINA_PRINCIPAL
- ID Mongo 6619bfeb147cd50b64677753 · alimentoId 222 · Higado
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P1
  - MealTypes: — → lunch, dinner
  - Motivo: Corte o proteína principal expresamente solicitada para almuerzo/cena.
  - Clasificación: REGLA_EXPLICITA_PROTEINAS_PRINCIPALES
- ID Mongo 6619bfeb147cd50b64677758 · alimentoId 228 · Jamon cocido
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P2
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Jamón cocido: proteína secundaria para desayuno, merienda y snack extra.
  - Clasificación: REGLA_EXPLICITA_JAMON_COCIDO
- ID Mongo 6619bfeb147cd50b64677766 · alimentoId 241 · Langostinos
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P1
  - MealTypes: — → lunch, dinner
  - Motivo: Carne, pescado o proteína vegetal principal inequívoca y reutilizable.
  - Clasificación: INFERENCIA_ALTA_PROTEINA_PRINCIPAL
- ID Mongo 6619bfeb147cd50b64677783 · alimentoId 270 · Lomo de cerdo magro
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P1
  - MealTypes: — → lunch, dinner
  - Motivo: Carne, pescado o proteína vegetal principal inequívoca y reutilizable.
  - Clasificación: INFERENCIA_ALTA_PROTEINA_PRINCIPAL
- ID Mongo 6619bfeb147cd50b64677785 · alimentoId 272 · Lubina
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P1
  - MealTypes: — → lunch, dinner
  - Motivo: Carne, pescado o proteína vegetal principal inequívoca y reutilizable.
  - Clasificación: INFERENCIA_ALTA_PROTEINA_PRINCIPAL
- ID Mongo 6619bfeb147cd50b64677798 · alimentoId 291 · Mariscos
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P1
  - MealTypes: — → lunch, dinner
  - Motivo: Carne, pescado o proteína vegetal principal inequívoca y reutilizable.
  - Clasificación: INFERENCIA_ALTA_PROTEINA_PRINCIPAL
- ID Mongo 6619bfeb147cd50b646777db · alimentoId 358 · Paleta de ternera
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P1
  - MealTypes: — → lunch, dinner
  - Motivo: Carne, pescado o proteína vegetal principal inequívoca y reutilizable.
  - Clasificación: INFERENCIA_ALTA_PROTEINA_PRINCIPAL
- ID Mongo 6619bfeb147cd50b646777dd · alimentoId 360 · Palomita (Carne magra)
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P1
  - MealTypes: — → lunch, dinner
  - Motivo: Carne, pescado o proteína vegetal principal inequívoca y reutilizable.
  - Clasificación: INFERENCIA_ALTA_PROTEINA_PRINCIPAL
- ID Mongo 6a2eb93430b2bab0d4573ff6 · alimentoId 609 · Pata muslo de pollo sin piel
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P1
  - MealTypes: — → lunch, dinner
  - Motivo: Carne, pescado o proteína vegetal principal inequívoca y reutilizable.
  - Clasificación: INFERENCIA_ALTA_PROTEINA_PRINCIPAL
- ID Mongo 6619bfeb147cd50b64677807 · alimentoId 402 · Peceto
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P1
  - MealTypes: — → lunch, dinner
  - Motivo: Carne, pescado o proteína vegetal principal inequívoca y reutilizable.
  - Clasificación: INFERENCIA_ALTA_PROTEINA_PRINCIPAL
- ID Mongo 6619bfeb147cd50b64677808 · alimentoId 403 · Pechuga de pavo
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P1
  - MealTypes: — → lunch, dinner
  - Motivo: Corte o proteína principal expresamente solicitada para almuerzo/cena.
  - Clasificación: REGLA_EXPLICITA_PROTEINAS_PRINCIPALES
- ID Mongo 6619bfeb147cd50b6467780a · alimentoId 405 · Pechuga de pollo con piel
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P1
  - MealTypes: — → lunch, dinner
  - Motivo: Corte o proteína principal expresamente solicitada para almuerzo/cena.
  - Clasificación: REGLA_EXPLICITA_PROTEINAS_PRINCIPALES
- ID Mongo 6619bfeb147cd50b64677811 · alimentoId 412 · Pescado blanco
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P1
  - MealTypes: — → lunch, dinner
  - Motivo: Carne, pescado o proteína vegetal principal inequívoca y reutilizable.
  - Clasificación: INFERENCIA_ALTA_PROTEINA_PRINCIPAL
- ID Mongo 6619bfeb147cd50b64677881 · alimentoId 517 · Sardinas
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P1
  - MealTypes: — → lunch, dinner
  - Motivo: Carne, pescado o proteína vegetal principal inequívoca y reutilizable.
  - Clasificación: INFERENCIA_ALTA_PROTEINA_PRINCIPAL
- ID Mongo 6619bfeb147cd50b64677883 · alimentoId 519 · Seitan
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P1
  - MealTypes: — → lunch, dinner
  - Motivo: Carne, pescado o proteína vegetal principal inequívoca y reutilizable.
  - Clasificación: INFERENCIA_ALTA_PROTEINA_PRINCIPAL
- ID Mongo 6619bfeb147cd50b6467788c · alimentoId 528 · Soja texturizada
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P1
  - MealTypes: — → lunch, dinner
  - Motivo: Carne, pescado o proteína vegetal principal inequívoca y reutilizable.
  - Clasificación: INFERENCIA_ALTA_PROTEINA_PRINCIPAL
- ID Mongo 6619bfeb147cd50b64677891 · alimentoId 533 · Tallarines al huevo (Coto)
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → C1
  - MealTypes: — → lunch, dinner
  - Motivo: Arroz, fideo o pasta inequívoca: carbohidrato principal de almuerzo/cena.
  - Clasificación: REGLA_EXPLICITA_ARROZ_PASTA
- ID Mongo 6619bfeb147cd50b64677899 · alimentoId 541 · Ternera magra
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P1
  - MealTypes: — → lunch, dinner
  - Motivo: Carne, pescado o proteína vegetal principal inequívoca y reutilizable.
  - Clasificación: INFERENCIA_ALTA_PROTEINA_PRINCIPAL
- ID Mongo 6619bfeb147cd50b6467789b · alimentoId 543 · tofu
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P1
  - MealTypes: — → lunch, dinner
  - Motivo: Carne, pescado o proteína vegetal principal inequívoca y reutilizable.
  - Clasificación: INFERENCIA_ALTA_PROTEINA_PRINCIPAL
- ID Mongo 6619bfeb147cd50b646778cb · alimentoId 589 · Whey protein Isolate
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P1, P2
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Whey inequívoca: fuente proteica principal/secundaria fuera de platos principales.
  - Clasificación: REGLA_EXPLICITA_WHEY
- ID Mongo 6619bfeb147cd50b646778cc · alimentoId 591 · Whey protein SN
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → P1, P2
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Whey inequívoca: fuente proteica principal/secundaria fuera de platos principales.
  - Clasificación: REGLA_EXPLICITA_WHEY

### Snacks

- ID Mongo 6619bfeb147cd50b64677723 · alimentoId 174 · Galletas de arroz
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → C1, C2
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Galleta/tostada simple y genérica para desayuno, merienda o snack extra.
  - Clasificación: INFERENCIA_ALTA_CARBOHIDRATO_LIVIANO
- ID Mongo 6619bfeb147cd50b64677728 · alimentoId 179 · Galletitas de agua
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → C1, C2
  - MealTypes: — → breakfast, snack, extraSnack
  - Motivo: Galleta/tostada simple y genérica para desayuno, merienda o snack extra.
  - Clasificación: INFERENCIA_ALTA_CARBOHIDRATO_LIVIANO

### Verduras

- ID Mongo 6619bfeb147cd50b646776b3 · alimentoId 62 · Berenjena
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → V
  - MealTypes: — → lunch, dinner
  - Motivo: Verdura simple inequívoca para acompañar almuerzo/cena.
  - Clasificación: INFERENCIA_ALTA_VERDURA
- ID Mongo 6619bfeb147cd50b646776c2 · alimentoId 77 · brocoli
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → V
  - MealTypes: — → lunch, dinner
  - Motivo: Verdura simple inequívoca para acompañar almuerzo/cena.
  - Clasificación: INFERENCIA_ALTA_VERDURA
- ID Mongo 6619bfeb147cd50b646776c4 · alimentoId 79 · Calabacin
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → V
  - MealTypes: — → lunch, dinner
  - Motivo: Verdura simple inequívoca para acompañar almuerzo/cena.
  - Clasificación: INFERENCIA_ALTA_VERDURA
- ID Mongo 6619bfeb147cd50b646776ea · alimentoId 117 · Coliflor
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → V
  - MealTypes: — → lunch, dinner
  - Motivo: Verdura simple inequívoca para acompañar almuerzo/cena.
  - Clasificación: INFERENCIA_ALTA_VERDURA
- ID Mongo 6619bfeb147cd50b64677714 · alimentoId 159 · Esparragos
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → V
  - MealTypes: — → lunch, dinner
  - Motivo: Verdura simple inequívoca para acompañar almuerzo/cena.
  - Clasificación: INFERENCIA_ALTA_VERDURA
- ID Mongo 6619bfeb147cd50b64677715 · alimentoId 160 · espinaca
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → V
  - MealTypes: — → lunch, dinner
  - Motivo: Verdura simple inequívoca para acompañar almuerzo/cena.
  - Clasificación: INFERENCIA_ALTA_VERDURA
- ID Mongo 6619bfeb147cd50b6467777c · alimentoId 263 · lechuga
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → V
  - MealTypes: — → lunch, dinner
  - Motivo: Verdura simple inequívoca para acompañar almuerzo/cena.
  - Clasificación: INFERENCIA_ALTA_VERDURA
- ID Mongo 6619bfeb147cd50b64677866 · alimentoId 492 · Remolacha
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → V
  - MealTypes: — → lunch, dinner
  - Motivo: Verdura simple inequívoca para acompañar almuerzo/cena.
  - Clasificación: INFERENCIA_ALTA_VERDURA
- ID Mongo 6619bfeb147cd50b64677884 · alimentoId 520 · Semillas de calabaza
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → G
  - MealTypes: — → breakfast, lunch, snack, dinner, extraSnack
  - Motivo: Semilla comestible inequívoca utilizada como complemento graso.
  - Clasificación: INFERENCIA_ALTA_SEMILLAS
- ID Mongo 6619bfeb147cd50b646778c9 · alimentoId 587 · Verduras
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → V
  - MealTypes: — → lunch, dinner
  - Motivo: Verdura simple inequívoca para acompañar almuerzo/cena.
  - Clasificación: INFERENCIA_ALTA_VERDURA
- ID Mongo 6619bfeb147cd50b646778db · alimentoId 605 · Zanahorias
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → V
  - MealTypes: — → lunch, dinner
  - Motivo: Verdura simple inequívoca para acompañar almuerzo/cena.
  - Clasificación: INFERENCIA_ALTA_VERDURA
- ID Mongo 6619bfeb147cd50b646778dd · alimentoId 607 · Zapallo
  - Mode: EXPLICIT_ONLY → GENERIC
  - Roles: — → V
  - MealTypes: — → lunch, dinner
  - Motivo: Verdura simple inequívoca para acompañar almuerzo/cena.
  - Clasificación: INFERENCIA_ALTA_VERDURA

## Requieren revisión manual

- ID Mongo 6619bfeb147cd50b6467767d · alimentoId 8 · Alfajor bon o bon · Snacks
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes.
  - Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- ID Mongo 6619bfeb147cd50b64677683 · alimentoId 14 · Alfajor guaymallen · Snacks
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes.
  - Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- ID Mongo 6619bfeb147cd50b64677686 · alimentoId 18 · Alfajor jorgito · Snacks
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes.
  - Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- ID Mongo 6619bfeb147cd50b646776a1 · alimentoId 44 · Arvejas secas · Carbohidratos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Legumbre/pseudocereal con posible rol C1 y/o P2; el rol culinario depende del uso deseado.
  - Sugerencia: Evaluar C1, P2 o ambos para lunch/dinner y definir una porción confiable.
- ID Mongo 6619bfeb147cd50b646776a2 · alimentoId 45 · Arvejas secas remojadas · Carbohidratos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Legumbre/pseudocereal con posible rol C1 y/o P2; el rol culinario depende del uso deseado.
  - Sugerencia: Evaluar C1, P2 o ambos para lunch/dinner y definir una porción confiable.
- ID Mongo 6619bfeb147cd50b646776b0 · alimentoId — · Batido proteico: · Sin categoría
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Registro sombra sin alimentoId, unidad ni nutrición útil; coincide nominalmente con otro registro legacy.
  - Sugerencia: Revisar duplicación/validez del documento antes de asignarle generation.
- ID Mongo 6619bfeb147cd50b646776b1 · alimentoId — · Batido: · Sin categoría
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Registro sombra sin alimentoId, unidad ni nutrición útil; coincide nominalmente con otro registro legacy.
  - Sugerencia: Revisar duplicación/validez del documento antes de asignarle generation.
- ID Mongo 6619bfeb147cd50b646776b4 · alimentoId 64 · Bife angosto · Proteínas
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes.
  - Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- ID Mongo 6619bfeb147cd50b646776b6 · alimentoId 65 · Bife de chorizo magro · Grasas
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales.
  - Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- ID Mongo 6619bfeb147cd50b646776be · alimentoId 73 · Bondiola (Lario) · Grasas
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales.
  - Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- ID Mongo 6619bfeb147cd50b646776bf · alimentoId 74 · Bondiola (Lario) · Grasas
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales.
  - Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- ID Mongo 6619bfeb147cd50b646776c0 · alimentoId 75 · Bondiola de cerdo · Grasas
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales.
  - Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- ID Mongo 6619bfeb147cd50b646776c1 · alimentoId 76 · Bondiola feteada (Carrefour) · Grasas
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales.
  - Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- ID Mongo 6619bfeb147cd50b646776c6 · alimentoId 81 · Calabaza · Verduras
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes.
  - Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- ID Mongo 6619bfeb147cd50b646776cf · alimentoId 91 · Carne picada magra · Proteínas
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes.
  - Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- ID Mongo 6619bfeb147cd50b646776d1 · alimentoId 92 · Casancrem · Lácteos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso.
  - Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- ID Mongo 6619bfeb147cd50b646776d2 · alimentoId 93 · Casancrem light · Lácteos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso.
  - Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- ID Mongo 6619bfeb147cd50b646776d6 · alimentoId 99 · Cebolla · Verduras
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes.
  - Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- ID Mongo 6619bfeb147cd50b646776e3 · alimentoId 111 · Chorizo · Grasas
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes.
  - Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- ID Mongo 6619bfeb147cd50b646776f1 · alimentoId 125 · Cremon light · Lácteos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes.
  - Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- ID Mongo 6619bfeb147cd50b646776f8 · alimentoId 131 · Cuadril · Proteínas
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes.
  - Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- ID Mongo 6619bfeb147cd50b646776ff · alimentoId — · Dulce de leche (Coto) · Sin categoría
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Registro sombra sin alimentoId, unidad ni nutrición útil; coincide nominalmente con otro registro legacy.
  - Sugerencia: Revisar duplicación/validez del documento antes de asignarle generation.
- ID Mongo 6619bfeb147cd50b6467770e · alimentoId 153 · Empanada de jamon y queso el noblre · Lácteos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso.
  - Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- ID Mongo 6619bfeb147cd50b6467770f · alimentoId 154 · Empanadas de carne : · Proteínas
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Registro marcado para revisión e inactivo.
  - Sugerencia: Resolver primero el estado/revisión; no promover automáticamente.
- ID Mongo 6619bfeb147cd50b64677710 · alimentoId 155 · Empanadas de jamon y queso : · Lácteos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Registro marcado para revisión e inactivo.
  - Sugerencia: Resolver primero el estado/revisión; no promover automáticamente.
- ID Mongo 6619bfeb147cd50b64677711 · alimentoId 156 · Empanadas de pollo : · Proteínas
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Registro marcado para revisión e inactivo.
  - Sugerencia: Resolver primero el estado/revisión; no promover automáticamente.
- ID Mongo 6619bfeb147cd50b64677712 · alimentoId — · Empanadas: · Sin categoría
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Registro sombra sin alimentoId, unidad ni nutrición útil; coincide nominalmente con otro registro legacy.
  - Sugerencia: Revisar duplicación/validez del documento antes de asignarle generation.
- ID Mongo 6619bfeb147cd50b64677713 · alimentoId — · Ensalada: · Sin categoría
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Registro sombra sin alimentoId, unidad ni nutrición útil; coincide nominalmente con otro registro legacy.
  - Sugerencia: Revisar duplicación/validez del documento antes de asignarle generation.
- ID Mongo 6619bfeb147cd50b6467771f · alimentoId 170 · Frijoles · Carbohidratos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Legumbre/pseudocereal con posible rol C1 y/o P2; el rol culinario depende del uso deseado.
  - Sugerencia: Evaluar C1, P2 o ambos para lunch/dinner y definir una porción confiable.
- ID Mongo 6619bfeb147cd50b64677734 · alimentoId 191 · Galletitas de salvado (Bagley) · Snacks
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes.
  - Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- ID Mongo 6619bfeb147cd50b6467773d · alimentoId 201 · Garbanzos secos · Carbohidratos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes.
  - Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- ID Mongo 6619bfeb147cd50b6467773f · alimentoId 203 · Garbanzos secos remojados · Carbohidratos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes.
  - Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- ID Mongo 6619bfeb147cd50b64677747 · alimentoId 211 · Guacamole · Grasas
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes.
  - Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- ID Mongo 6619bfeb147cd50b6467774a · alimentoId 213 · Hamburguesa Clasica (Paty) · Grasas
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales.
  - Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- ID Mongo 6619bfeb147cd50b6467774b · alimentoId 214 · Hamburguesa de soja (Vegetalex) · Proteínas
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes.
  - Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- ID Mongo 6619bfeb147cd50b6467774c · alimentoId 215 · Hamburguesa de soja vegetalex · Proteínas
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes.
  - Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- ID Mongo 6619bfeb147cd50b6467774d · alimentoId 216 · Hamburguesas (Swift) · Grasas
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales.
  - Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- ID Mongo 6619bfeb147cd50b6467774e · alimentoId 217 · Hamburguesas finitas (Paty) · Grasas
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales.
  - Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- ID Mongo 6619bfeb147cd50b6467774f · alimentoId 218 · Hamburguesas light (Swift) · Grasas
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales.
  - Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- ID Mongo 6619bfeb147cd50b64677760 · alimentoId 235 · Jamon serrano · Proteínas
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes.
  - Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- ID Mongo 6619bfeb147cd50b6467777d · alimentoId 264 · Lentejas en remojo · Carbohidratos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Legumbre/pseudocereal con posible rol C1 y/o P2; el rol culinario depende del uso deseado.
  - Sugerencia: Evaluar C1, P2 o ambos para lunch/dinner y definir una porción confiable.
- ID Mongo 6619bfeb147cd50b6467777e · alimentoId 267 · Lentejas secas · Carbohidratos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes.
  - Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- ID Mongo 6619bfeb147cd50b64677781 · alimentoId 268 · Lentejas secas (Elio) · Carbohidratos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Legumbre/pseudocereal con posible rol C1 y/o P2; el rol culinario depende del uso deseado.
  - Sugerencia: Evaluar C1, P2 o ambos para lunch/dinner y definir una porción confiable.
- ID Mongo 6619bfeb147cd50b64677782 · alimentoId — · Lomitos de atun al natural (Coto) · Sin categoría
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Registro sombra sin alimentoId, unidad ni nutrición útil; coincide nominalmente con otro registro legacy.
  - Sugerencia: Revisar duplicación/validez del documento antes de asignarle generation.
- ID Mongo 6619bfeb147cd50b64677787 · alimentoId 275 · Maiz inflado · Carbohidratos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes.
  - Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- ID Mongo 6619bfeb147cd50b64677790 · alimentoId 284 · Manteca · Grasas
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes.
  - Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- ID Mongo 6619bfeb147cd50b6467779b · alimentoId 294 · Medallon de merluza · Proteínas
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales.
  - Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- ID Mongo 6619bfeb147cd50b6467779c · alimentoId 295 · Medallon de pollo (Granja del sol) · Proteínas
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales.
  - Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- ID Mongo 6619bfeb147cd50b6467779d · alimentoId 296 · Medallon de pollo (Granja tres arroyos) · Grasas
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales.
  - Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- ID Mongo 6619bfeb147cd50b6467779e · alimentoId 297 · Medallones de merluza · Proteínas
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales.
  - Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- ID Mongo 6619bfeb147cd50b6467779f · alimentoId 298 · Medallones de pollo · Proteínas
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales.
  - Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- ID Mongo 6619bfeb147cd50b646777a1 · alimentoId 300 · Mendicrim · Lácteos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso.
  - Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- ID Mongo 6619bfeb147cd50b646777a2 · alimentoId 301 · Mendicrim light · Lácteos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso.
  - Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- ID Mongo 6619bfeb147cd50b646777a3 · alimentoId 304 · Merluza · Proteínas
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes.
  - Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- ID Mongo 6619bfeb147cd50b646777b5 · alimentoId 321 · Mermelada light · Carbohidratos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes.
  - Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- ID Mongo 6619bfeb147cd50b646777bd · alimentoId — · Milanesa de pollo: · Sin categoría
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Registro sombra sin alimentoId, unidad ni nutrición útil; coincide nominalmente con otro registro legacy.
  - Sugerencia: Revisar duplicación/validez del documento antes de asignarle generation.
- ID Mongo 6619bfeb147cd50b646777be · alimentoId 329 · Milanesa de soja (Vegetalex) · Proteínas
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales.
  - Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- ID Mongo 6619bfeb147cd50b646777bf · alimentoId — · Milanesa de soja: · Sin categoría
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Registro sombra sin alimentoId, unidad ni nutrición útil; coincide nominalmente con otro registro legacy.
  - Sugerencia: Revisar duplicación/validez del documento antes de asignarle generation.
- ID Mongo 6619bfeb147cd50b646777c0 · alimentoId — · Milanesa de ternera: · Sin categoría
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Registro sombra sin alimentoId, unidad ni nutrición útil; coincide nominalmente con otro registro legacy.
  - Sugerencia: Revisar duplicación/validez del documento antes de asignarle generation.
- ID Mongo 6619bfeb147cd50b646777c2 · alimentoId 333 · Minitostaditas cuatro quesos twistos · Lácteos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso.
  - Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- ID Mongo 6619bfeb147cd50b646777c4 · alimentoId 335 · Morcilla · Grasas
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales.
  - Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- ID Mongo 6619bfeb147cd50b646777c5 · alimentoId 336 · Mortadela · Grasas
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales.
  - Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- ID Mongo 6619bfeb147cd50b646777c6 · alimentoId 337 · Mortadela (Cagnoli) · Fiambres
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales.
  - Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- ID Mongo 6619bfeb147cd50b646777c7 · alimentoId 338 · Mortadela (Paladini) · Fiambres
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales.
  - Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- ID Mongo 6619bfeb147cd50b646777c8 · alimentoId 339 · Mortadela Piccola (Calchaqui) · Fiambres
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales.
  - Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- ID Mongo 6619bfeb147cd50b646777d9 · alimentoId — · Omelette: · Sin categoría
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Registro sombra sin alimentoId, unidad ni nutrición útil; coincide nominalmente con otro registro legacy.
  - Sugerencia: Revisar duplicación/validez del documento antes de asignarle generation.
- ID Mongo 6619bfeb147cd50b646777ec · alimentoId 376 · Pan integral · Carbohidratos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes.
  - Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- ID Mongo 6619bfeb147cd50b646777f3 · alimentoId 382 · Pan para hamburguesas · Carbohidratos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales.
  - Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- ID Mongo 6619bfeb147cd50b646777f4 · alimentoId 383 · Pan para hamburguesas fargo · Carbohidratos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales.
  - Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- ID Mongo 6619bfeb147cd50b646777f7 · alimentoId 386 · Pan rallado · Carbohidratos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes.
  - Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- ID Mongo 6619bfeb147cd50b646777f9 · alimentoId 388 · Panceta · Grasas
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales.
  - Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- ID Mongo 6619bfeb147cd50b646777fb · alimentoId — · Panzotti Ricota y queso (Coto) · Sin categoría
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Registro sombra sin alimentoId, unidad ni nutrición útil; coincide nominalmente con otro registro legacy.
  - Sugerencia: Revisar duplicación/validez del documento antes de asignarle generation.
- ID Mongo 6619bfeb147cd50b6467780b · alimentoId 407 · Pepinos · Verduras
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes.
  - Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- ID Mongo 6619bfeb147cd50b64677817 · alimentoId 418 · Plato de verduras · Verduras
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Registro marcado para revisión e inactivo.
  - Sugerencia: Resolver primero el estado/revisión; no promover automáticamente.
- ID Mongo 6619bfeb147cd50b64677820 · alimentoId 427 · Porotos secos · Carbohidratos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Legumbre/pseudocereal con posible rol C1 y/o P2; el rol culinario depende del uso deseado.
  - Sugerencia: Evaluar C1, P2 o ambos para lunch/dinner y definir una porción confiable.
- ID Mongo 6619bfeb147cd50b64677821 · alimentoId 428 · Porotos secos remojados · Carbohidratos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Legumbre/pseudocereal con posible rol C1 y/o P2; el rol culinario depende del uso deseado.
  - Sugerencia: Evaluar C1, P2 o ambos para lunch/dinner y definir una porción confiable.
- ID Mongo 6619bfeb147cd50b6467782a · alimentoId 437 · Queso blanco garcia · Lácteos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso.
  - Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- ID Mongo 6619bfeb147cd50b6467782b · alimentoId 438 · Queso blanco light tregar · Lácteos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso.
  - Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- ID Mongo 6619bfeb147cd50b6467782c · alimentoId 439 · Queso cheddar · Lácteos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso.
  - Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- ID Mongo 6619bfeb147cd50b6467782d · alimentoId 440 · Queso cheddar tonadita en fetas · Lácteos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso.
  - Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- ID Mongo 6619bfeb147cd50b6467782e · alimentoId 441 · Queso crema · Lácteos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso.
  - Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- ID Mongo 6619bfeb147cd50b6467782f · alimentoId 442 · Queso crema carrefour · Lácteos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso.
  - Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- ID Mongo 6619bfeb147cd50b64677830 · alimentoId 443 · Queso crema carrefour light · Lácteos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso.
  - Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- ID Mongo 6619bfeb147cd50b64677831 · alimentoId 444 · Queso crema crematto milkaut · Lácteos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso.
  - Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- ID Mongo 6619bfeb147cd50b64677832 · alimentoId 445 · Queso crema crematto milkaut light · Lácteos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso.
  - Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- ID Mongo 6619bfeb147cd50b64677833 · alimentoId 446 · Queso crema cremon light · Lácteos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso.
  - Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- ID Mongo 6619bfeb147cd50b64677834 · alimentoId 447 · Queso crema la paulina · Lácteos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso.
  - Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- ID Mongo 6619bfeb147cd50b64677835 · alimentoId 448 · Queso crema la paulina light · Lácteos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso.
  - Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- ID Mongo 6619bfeb147cd50b6467783b · alimentoId 449 · Queso crema light · Lácteos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso.
  - Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- ID Mongo 6619bfeb147cd50b6467783c · alimentoId 450 · Queso crema philadelphia · Lácteos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso.
  - Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- ID Mongo 6619bfeb147cd50b6467783d · alimentoId 451 · Queso crema philadelphia light · Lácteos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso.
  - Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- ID Mongo 6619bfeb147cd50b6467783e · alimentoId 452 · Queso crema san ignacio · Lácteos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso.
  - Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- ID Mongo 6619bfeb147cd50b6467783f · alimentoId 453 · Queso crema san ignacio light · Lácteos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso.
  - Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- ID Mongo 6619bfeb147cd50b64677841 · alimentoId 455 · Queso cremon doble crema · Lácteos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso.
  - Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- ID Mongo 6619bfeb147cd50b6467784d · alimentoId 467 · Queso danbo carrefour · Lácteos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso.
  - Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- ID Mongo 6619bfeb147cd50b6467784e · alimentoId 468 · Queso danbo carrefour light · Lácteos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso.
  - Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- ID Mongo 6619bfeb147cd50b64677850 · alimentoId 471 · Queso danbo feteado · Lácteos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes.
  - Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- ID Mongo 6619bfeb147cd50b64677852 · alimentoId 472 · Queso danbo feteado light · Lácteos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso.
  - Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- ID Mongo 6619bfeb147cd50b64677853 · alimentoId 473 · Queso danbo light · Lácteos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso.
  - Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- ID Mongo 6619bfeb147cd50b64677854 · alimentoId 474 · Queso finlandia clasico · Lácteos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso.
  - Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- ID Mongo 6619bfeb147cd50b64677855 · alimentoId 475 · Queso finlandia light · Lácteos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso.
  - Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- ID Mongo 6619bfeb147cd50b64677856 · alimentoId 476 · Queso la paulina · Lácteos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso.
  - Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- ID Mongo 6619bfeb147cd50b64677857 · alimentoId 477 · Queso la paulina light · Lácteos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso.
  - Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- ID Mongo 6619bfeb147cd50b64677858 · alimentoId 478 · Queso mozzarella · Lácteos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso.
  - Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- ID Mongo 6619bfeb147cd50b64677859 · alimentoId 480 · Queso pategras · Lácteos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes.
  - Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- ID Mongo 6619bfeb147cd50b6467785b · alimentoId 481 · Queso port salut (La paulina) · Lácteos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso.
  - Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- ID Mongo 6619bfeb147cd50b6467785c · alimentoId 482 · Queso port salut light (La paulina) · Lácteos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso.
  - Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- ID Mongo 6619bfeb147cd50b6467785d · alimentoId 483 · Queso sardo · Lácteos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso.
  - Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- ID Mongo 6619bfeb147cd50b6467785e · alimentoId 484 · Queso untable cremon light · Lácteos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso.
  - Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- ID Mongo 6619bfeb147cd50b6467785f · alimentoId 485 · Queso untable garcia · Lácteos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso.
  - Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- ID Mongo 6619bfeb147cd50b64677860 · alimentoId 487 · Quinoa · Carbohidratos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes.
  - Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- ID Mongo 6619bfeb147cd50b64677867 · alimentoId 494 · Repollo · Verduras
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes.
  - Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- ID Mongo 6619bfeb147cd50b6467786a · alimentoId 496 · Ricota · Otros
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso.
  - Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- ID Mongo 6619bfeb147cd50b6467786b · alimentoId 497 · Ricota magra · Otros
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso.
  - Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- ID Mongo 6619bfeb147cd50b6467786c · alimentoId 498 · Salame · Grasas
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales.
  - Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- ID Mongo 6619bfeb147cd50b6467786d · alimentoId 499 · Salame (Cagnoli) · Fiambres
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales.
  - Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- ID Mongo 6619bfeb147cd50b6467786e · alimentoId 500 · Salame tandilero tipo milan (Cagnoli) · Fiambres
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales.
  - Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- ID Mongo 6619bfeb147cd50b6467786f · alimentoId 501 · Salame tipo milan (Bocatti) · Fiambres
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales.
  - Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- ID Mongo 6619bfeb147cd50b64677870 · alimentoId 502 · Salame tipo Milan (Paladini) · Fiambres
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales.
  - Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- ID Mongo 6619bfeb147cd50b64677873 · alimentoId 505 · Salchichas de soja (Vegetalex) · Proteínas
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales.
  - Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- ID Mongo 6619bfeb147cd50b64677874 · alimentoId 506 · Salchichas Granja Iris · Proteínas
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales.
  - Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- ID Mongo 6619bfeb147cd50b64677875 · alimentoId 507 · Salchichas La Blanca · Grasas
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales.
  - Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- ID Mongo 6619bfeb147cd50b64677876 · alimentoId 508 · Salchichas Paladini · Grasas
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales.
  - Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- ID Mongo 6619bfeb147cd50b64677877 · alimentoId 509 · Salchichas patyvienna · Grasas
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales.
  - Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- ID Mongo 6619bfeb147cd50b64677878 · alimentoId 510 · Salchichas Swift · Grasas
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales.
  - Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- ID Mongo 6619bfeb147cd50b64677879 · alimentoId 511 · Salchichas Vienissima · Grasas
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales.
  - Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- ID Mongo 6619bfeb147cd50b6467787d · alimentoId 513 · Salmón · Proteínas
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes.
  - Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- ID Mongo 6619bfeb147cd50b64677880 · alimentoId — · Sanguche: · Sin categoría
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Registro sombra sin alimentoId, unidad ni nutrición útil; coincide nominalmente con otro registro legacy.
  - Sugerencia: Revisar duplicación/validez del documento antes de asignarle generation.
- ID Mongo 6619bfeb147cd50b64677885 · alimentoId 522 · Semillas de chia · Grasas
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes.
  - Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- ID Mongo 6619bfeb147cd50b6467788a · alimentoId 526 · Semillas de sesamo · Grasas
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes.
  - Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- ID Mongo 6619bfeb147cd50b6467788d · alimentoId — · Sopa: · Sin categoría
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Registro sombra sin alimentoId, unidad ni nutrición útil; coincide nominalmente con otro registro legacy.
  - Sugerencia: Revisar duplicación/validez del documento antes de asignarle generation.
- ID Mongo 6619bfeb147cd50b64677896 · alimentoId 538 · Tarta de atun : · Proteínas
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Registro marcado para revisión e inactivo.
  - Sugerencia: Resolver primero el estado/revisión; no promover automáticamente.
- ID Mongo 6619bfeb147cd50b64677897 · alimentoId 539 · Tarta de jamon y queso : · Lácteos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Registro marcado para revisión e inactivo.
  - Sugerencia: Resolver primero el estado/revisión; no promover automáticamente.
- ID Mongo 6619bfeb147cd50b64677898 · alimentoId — · Tarta: · Sin categoría
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Registro sombra sin alimentoId, unidad ni nutrición útil; coincide nominalmente con otro registro legacy.
  - Sugerencia: Revisar duplicación/validez del documento antes de asignarle generation.
- ID Mongo 6619bfeb147cd50b646778a5 · alimentoId 553 · Tostadas de arroz aireadas carrefour · Carbohidratos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes.
  - Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- ID Mongo 6619bfeb147cd50b646778a9 · alimentoId 557 · Tostadas de arroz carrefour (Sin gluten) · Carbohidratos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes.
  - Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- ID Mongo 6619bfeb147cd50b646778ae · alimentoId 563 · Tostadas de mesa riera · Otros
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes.
  - Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- ID Mongo 6619bfeb147cd50b646778b1 · alimentoId 566 · Tostadas dulces carrefour · Carbohidratos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes.
  - Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- ID Mongo 6619bfeb147cd50b646778c2 · alimentoId 580 · Triple Hamburguesa con queso · Lácteos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso.
  - Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- ID Mongo 6619bfeb147cd50b646778c8 · alimentoId 586 · veggies quinoa y espinaca · Verduras
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Legumbre/pseudocereal con posible rol C1 y/o P2; el rol culinario depende del uso deseado.
  - Sugerencia: Evaluar C1, P2 o ambos para lunch/dinner y definir una porción confiable.
- ID Mongo 6a2eb93330b2bab0d4573fe8 · alimentoId 59 · Batido proteico: · Otros
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Registro marcado para revisión e inactivo.
  - Sugerencia: Resolver primero el estado/revisión; no promover automáticamente.
- ID Mongo 6a2eb93330b2bab0d4573fe9 · alimentoId 60 · Batido: · Otros
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Registro marcado para revisión e inactivo.
  - Sugerencia: Resolver primero el estado/revisión; no promover automáticamente.
- ID Mongo 6a2eb93330b2bab0d4573fea · alimentoId 138 · Dulce de leche (Coto) · Lácteos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Registro marcado para revisión e inactivo.
  - Sugerencia: Resolver primero el estado/revisión; no promover automáticamente.
- ID Mongo 6a2eb93330b2bab0d4573feb · alimentoId 157 · Empanadas: · Otros
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Registro marcado para revisión e inactivo.
  - Sugerencia: Resolver primero el estado/revisión; no promover automáticamente.
- ID Mongo 6a2eb93330b2bab0d4573fec · alimentoId 158 · Ensalada: · Otros
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Registro marcado para revisión e inactivo.
  - Sugerencia: Resolver primero el estado/revisión; no promover automáticamente.
- ID Mongo 6a2eb93330b2bab0d4573fed · alimentoId 269 · Lomitos de atun al natural (Coto) · Proteínas
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Registro marcado para revisión e inactivo.
  - Sugerencia: Resolver primero el estado/revisión; no promover automáticamente.
- ID Mongo 6a2eb93330b2bab0d4573fee · alimentoId 328 · Milanesa de pollo: · Proteínas
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Registro marcado para revisión e inactivo.
  - Sugerencia: Resolver primero el estado/revisión; no promover automáticamente.
- ID Mongo 6a2eb93330b2bab0d4573fef · alimentoId 330 · Milanesa de soja: · Proteínas
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Registro marcado para revisión e inactivo.
  - Sugerencia: Resolver primero el estado/revisión; no promover automáticamente.
- ID Mongo 6a2eb93330b2bab0d4573ff0 · alimentoId 331 · Milanesa de ternera: · Proteínas
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Registro marcado para revisión e inactivo.
  - Sugerencia: Resolver primero el estado/revisión; no promover automáticamente.
- ID Mongo 6a2eb93330b2bab0d4573ff1 · alimentoId 356 · Omelette: · Otros
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Registro marcado para revisión e inactivo.
  - Sugerencia: Resolver primero el estado/revisión; no promover automáticamente.
- ID Mongo 6a2eb93430b2bab0d4573ff2 · alimentoId 390 · Panzotti Ricota y queso (Coto) · Lácteos
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Registro marcado para revisión e inactivo.
  - Sugerencia: Resolver primero el estado/revisión; no promover automáticamente.
- ID Mongo 6a2eb93430b2bab0d4573ff3 · alimentoId 516 · Sanguche: · Otros
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Registro marcado para revisión e inactivo.
  - Sugerencia: Resolver primero el estado/revisión; no promover automáticamente.
- ID Mongo 6a2eb93430b2bab0d4573ff4 · alimentoId 529 · Sopa: · Otros
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Registro marcado para revisión e inactivo.
  - Sugerencia: Resolver primero el estado/revisión; no promover automáticamente.
- ID Mongo 6a2eb93430b2bab0d4573ff5 · alimentoId 540 · Tarta: · Otros
  - Configuración actual: EXPLICIT_ONLY; roles —; mealTypes —.
  - Duda: Registro marcado para revisión e inactivo.
  - Sugerencia: Resolver primero el estado/revisión; no promover automáticamente.

## Porciones propuestas/no aplicadas

- 1 · Aceite de coco · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 2 · Aceite de oliva · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 3 · Aceitunas negras · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 4 · Aceitunas verdes · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 34 · Almendras · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 35 · Anana · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 36 · Arandanos · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 40 · Arroz (Cocido) · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Arroz base tiene g, min 80, max 200, step 10; validar por separado crudo/cocido antes de reutilizar.
- 42 · Arroz integral · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Arroz base tiene g, min 80, max 200, step 10; validar por separado crudo/cocido antes de reutilizar.
- 43 · Arroz integral (Cocido) · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Arroz base tiene g, min 80, max 200, step 10; validar por separado crudo/cocido antes de reutilizar.
- 47 · Atun en lomitos al natural · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 48 · Avellanas · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 49 · Avena instantanea · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 51 · Banana · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 52 · Banana chica · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 53 · Banana grande · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 54 · Banana mediana · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 58 · Batatas · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 62 · Berenjena · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 72 · Bola de lomo · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 77 · brocoli · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 79 · Calabacin · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 82 · Capelletini giacomo jamon  y queso · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 83 · Capelletini giacomo tridicci · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 88 · Carne de cerdo magro · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 94 · Castañas · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 96 · Castañas de caju · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 102 · Cerezas · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 104 · Chirimoya · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 105 · Choclo entero · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 113 · Churrasco magro · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 114 · Ciruela · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 115 · Claras de huevos · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 117 · Coliflor · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 120 · Copos de maiz sin azucar · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 129 · Cuadrada (Ternera) · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 132 · Damasco · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 148 · Durazno · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 149 · Durazno chico · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 150 · Durazno grande · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 151 · Durazno mediano · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 159 · Esparragos · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 160 · espinaca · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 162 · Fideos · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 163 · Fideos (Cocidos) · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 164 · Fideos sin gluten · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 165 · Filet de merluza · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 169 · Frambuesa · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 173 · Frutillas · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 174 · Galletas de arroz · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 179 · Galletitas de agua · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 199 · Gambas · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 207 · Granada · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 222 · Higado · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 223 · Higo · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 224 · Huevos · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 228 · Jamon cocido · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 229 · Jamon cocido cagnoli · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 230 · Jamon cocido feteado · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 231 · Jamon cocido lario · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 232 · Jamon cocido paladini · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 239 · Kiwi · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 240 · Kiwi (mediano) · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 241 · Langostinos · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 247 · Leche descremada · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 248 · Leche descremada (Apostoles) · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 249 · Leche descremada alta en proteínas · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 250 · Leche descremada Apostoles · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 251 · Leche descremada en polvo · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 252 · Leche descremada la serenisima · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 253 · Leche descremada sin lactosa · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 254 · Leche descremada tregar · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 255 · Leche deslactosada descremada (La serenisima) · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 258 · Leche entera · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 262 · Leche parcialmente descremada (Veronica) · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 263 · lechuga · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 270 · Lomo de cerdo magro · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 272 · Lubina · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 273 · Maiz · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 276 · Mandarina · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 277 · Mandarina chica · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 278 · Mandarina grande · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 279 · Mandarina mediana · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 281 · Mango · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 282 · Mani · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 286 · Mantequilla de mani · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 287 · Manzana · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 288 · Manzana chica · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 289 · Manzana grande · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 290 · Manzana mediana · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 291 · Mariscos · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 299 · Melon · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 342 · Naranja · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 343 · Naranja chica · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 344 · Naranja grande · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 345 · Naranja mediana · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 349 · Nueces peladas · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 353 · Ñoquis con papa · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 354 · Ñoquis con papa carrefour · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 355 · ñoquis de papa · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 358 · Paleta de ternera · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 360 · Palomita (Carne magra) · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 361 · Palta · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 362 · Pan · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 363 · Pan artesano bimbo · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 364 · Pan baguette · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 365 · Pan blanco · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 366 · Pan con salvado carrefour · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 367 · Pan con salvado fargo plus · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 368 · Pan con salvado Noly · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 369 · Pan de centeno · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 370 · Pan de molde Bio sin gluten · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 371 · Pan de salvado (Fargo) · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 372 · Pan de salvado doble fargo · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 373 · Pan doble integral fargo · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 374 · Pan frances · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 377 · Pan lactal · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 378 · Pan lactal bimbo · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 379 · Pan lactal de salvado carrefour · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 380 · Pan lactal noly · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 381 · Pan negro · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 387 · Pan tipo artesano bimbo semillas del campo · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 391 · Papas · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 396 · Papaya · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 397 · Pasas de uva · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 398 · Pasta de mani · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 399 · Pasta de mani Sin tacc · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 402 · Peceto · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 403 · Pechuga de pavo · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 405 · Pechuga de pollo con piel · actual {"unit":null,"min":100,"max":350,"step":10,"allowedValues":[]} · Revisar si puede reutilizar g, min 100, max 350, step 10 de Pechuga de pollo; no aplicado automáticamente.
- 408 · Pera · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 409 · Pera chica · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 410 · Pera grande · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 411 · Pera mediana · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 412 · Pescado blanco · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 415 · Pistachos · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 419 · Polenta · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 420 · Polenta (Coto) · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 421 · Polenta (Presto pronta) · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 422 · Polenta (Quaker) · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 423 · Polenta carrefour · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 424 · Pomelo · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 432 · Pure de papas (General) · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 454 · Queso cremon cremoso · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 456 · Queso cremoso · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 457 · Queso cremoso (cremac) · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 459 · Queso cremoso cremac · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 460 · Queso cremoso light · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 461 · Queso cremoso port salut · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 462 · Queso cremoso punta del agua · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 463 · Queso cremoso punta del agua light · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 464 · Queso cremoso saint paulin · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 466 · Queso cremoso temblay · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 491 · Ravioles (Carrefour) · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 492 · Remolacha · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 515 · Sandia · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 517 · Sardinas · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 519 · Seitan · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 520 · Semillas de calabaza · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 523 · Semillas de girasol · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 524 · Semillas de lino · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 528 · Soja texturizada · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 533 · Tallarines al huevo (Coto) · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 541 · Ternera magra · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 543 · tofu · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 544 · Tomate · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 548 · Tostadas clasicas · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 551 · Tostadas de arroz · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 561 · Tostadas de mesa · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 584 · Uvas · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 587 · Verduras · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 589 · Whey protein Isolate · actual {"unit":null,"min":20,"max":50,"step":5,"allowedValues":[]} · La regla histórica ya aporta min 20, max 50 y step 5; falta confirmar unit='g'.
- 591 · Whey protein SN · actual {"unit":null,"min":20,"max":50,"step":5,"allowedValues":[]} · La regla histórica ya aporta min 20, max 50 y step 5; falta confirmar unit='g'.
- 592 · Yogurisimo bebible · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 593 · Yogurisimo firme la serenisima (190 grs) · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 594 · Yogurt activia bebible · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 595 · Yogurt bebible (Ser) · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 596 · Yogurt bebible vida light · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 597 · Yogurt descremado bebible Ilolay · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 598 · Yogurt descremado bebible vida · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 599 · Yogurt descremado gran compra · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 600 · Yogurt entero bebible Ilolay · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 601 · Yogurt entero bebible Yogs · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 602 · Yogurt entero gran compra · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 603 · Yogurt light gran compra · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 604 · Yogurt light la serenisima (Bebible) · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 605 · Zanahorias · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 607 · Zapallo · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 609 · Pata muslo de pollo sin piel · actual {"unit":null,"min":null,"max":null,"step":null,"allowedValues":[]} · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
