# Comparación de diversidad estructural del combinador

Generado: 2026-08-24T16:53:15.883Z

## Seguridad de Mongo

- Baseline sin cambios: true
- Después sin cambios: true
- Catálogo: 574 alimentos

## Candidatos con límite 32

| Meal type | P1+C1 antes/después | P2 | C2 | V | F | G | Estructuras únicas | Tiempo medio ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| breakfast | 32/25 | 0/2 | 0/4 | 0/0 | 0/4 | 0/3 | 1/8 | 329.74/349.02 |
| lunch | 32/25 | 0/3 | 0/0 | 0/2 | 0/4 | 0/4 | 1/8 | 311.82/322.36 |
| snack | 32/25 | 0/2 | 0/4 | 0/0 | 0/4 | 0/3 | 1/8 | 318.73/354.09 |
| dinner | 32/25 | 0/3 | 0/0 | 0/2 | 0/4 | 0/4 | 1/8 | 299.9/319.47 |
| extraSnack | 32/25 | 0/2 | 0/4 | 0/0 | 0/4 | 0/3 | 1/8 | 327.54/325.48 |

## Éxito diario

| Comidas | Antes | Después |
|---:|---:|---:|
| 3 | 1/5 | 5/5 |
| 4 | 5/5 | 5/5 |
| 5 | 5/5 | 5/5 |
| 6 | 5/5 | 5/5 |

## Error nutricional absoluto — mismos 16 seeds exitosos en ambos

| Nutriente | Promedio antes/después | Máximo antes/después |
|---|---:|---:|
| kcal | 0.83/0.48 | 1.85/0.99 |
| proteina | 17.88/8.92 | 36.03/30.59 |
| carbs | 27.27/26.25 | 76.15/56.69 |
| grasas | 16.82/13.75 | 37.58/26.38 |

## Performance diaria

| Métrica | Antes | Después |
|---|---:|---:|
| allDayRuns (avg/p50/p95/max) | 7321.24/6541.14/13468.31/15306.78 | 5787.18/4355.88/9497.14/11716.08 |
| successfulDayRuns (avg/p50/p95/max) | 8627.34/7950.25/13468.31/15306.78 | 5787.18/4355.88/9497.14/11716.08 |
| totalMealGeneration (avg/p50/p95/max) | 1769.35/1609/2508/4956 | 1285.6/1200/1708/3235 |
| solverRounds (avg/p50/p95/max) | 275.86/273/339/408 | 289.18/287/343/390 |
| solverCandidateExecutions (avg/p50/p95/max) | 32/32/32/32 | 32/32/32/32 |

## Ejemplos posteriores

### desayuno — P1+C1+P2

Seed: curation-real-3-1
Target: {"kcal":711.31,"proteina":49.86,"carbs":83.1,"grasas":19.94}
Actual: {"kcal":710.3,"proteina":48.8,"carbs":63.300000000000004,"grasas":29.1}

- Avena instantanea: 110 Grs — 387.2 kcal, P 14.3, C 62.7, G 8.8
- Claras de huevos: 3 Unid — 47.1 kcal, P 10.5, C 0.6, G 0.3
- Huevos: 4 Unid — 276 kcal, P 24, C 0, G 20

### almuerzo — P1+C1+P2+V+F+G

Seed: curation-real-3-1
Target: {"kcal":783.66,"proteina":55.47,"carbs":102.34,"grasas":16.94}
Actual: {"kcal":783.37,"proteina":57.63,"carbs":88.2,"grasas":22.23}

- Aceite de coco: 20 Grs — 179.82 kcal, P 0, C 0, G 19.98
- Anana: 80 Grs — 40.8 kcal, P 0.4, C 8, G 0.8
- Arroz: 90 Grs — 304.65 kcal, P 7.2, C 67.95, G 0.45
- Atun en lomitos al natural: 1 Pote — 120 kcal, P 30, C 0, G 0
- Berenjena: 250 Grs — 59.6 kcal, P 2.53, C 11.25, G 0.5
- Claras de huevos: 5 Unid — 78.5 kcal, P 17.5, C 1, G 0.5

### merienda — P1+C1+C2+F+G

Seed: curation-real-4-1
Target: {"kcal":596.14,"proteina":37.4,"carbs":64.5,"grasas":20.95}
Actual: {"kcal":596.04,"proteina":39.06,"carbs":82.16000000000001,"grasas":12.359999999999998}

- Almendras: 3 Unid — 21.45 kcal, P 0.78, C 0.47, G 1.83
- Anana: 220 Grs — 112.2 kcal, P 1.1, C 22, G 2.2
- Avena instantanea: 95 Grs — 334.4 kcal, P 12.35, C 54.15, G 7.6
- Claras de huevos: 7 Unid — 109.9 kcal, P 24.5, C 1.4, G 0.7
- Copos de maiz sin azucar: 5 Grs — 18.09 kcal, P 0.33, C 4.14, G 0.03

### cena — P1+C1+F+G

Seed: curation-real-3-2
Target: {"kcal":778.09,"proteina":50.8,"carbs":88.8,"grasas":24.41}
Actual: {"kcal":777.3199999999999,"proteina":67.25,"carbs":77.4,"grasas":22.08}

- Aceite de coco: 20 Grs — 179.82 kcal, P 0, C 0, G 19.98
- Anana: 170 Grs — 86.7 kcal, P 0.85, C 17, G 1.7
- Arroz: 80 Grs — 270.8 kcal, P 6.4, C 60.4, G 0.4
- Atun en lomitos al natural: 2 Pote — 240 kcal, P 60, C 0, G 0

### snack — P1+C1+P2+C2+F+G

Seed: curation-real-5-1
Target: {"kcal":469.51,"proteina":25.66,"carbs":19.2,"grasas":32.23}
Actual: {"kcal":468.52,"proteina":27.27,"carbs":44.730000000000004,"grasas":20.06}

- Almendras: 1 Unid — 7.15 kcal, P 0.26, C 0.16, G 0.61
- Anana: 190 Grs — 96.9 kcal, P 0.95, C 19, G 1.9
- Avena instantanea: 30 Grs — 105.6 kcal, P 3.9, C 17.1, G 2.4
- Claras de huevos: 1 Unid — 15.7 kcal, P 3.5, C 0.2, G 0.1
- Copos de maiz sin azucar: 10 Grs — 36.17 kcal, P 0.66, C 8.27, G 0.05
- Huevos: 3 Unid — 207 kcal, P 18, C 0, G 15

### colacion — P1+C1+C2+F+G

Seed: curation-real-6-1
Target: {"kcal":339.63,"proteina":21.71,"carbs":40.6,"grasas":10.04}
Actual: {"kcal":338.68,"proteina":21.38,"carbs":49.89,"grasas":5.96}

- Almendras: 3 Unid — 21.45 kcal, P 0.78, C 0.47, G 1.83
- Anana: 80 Grs — 40.8 kcal, P 0.4, C 8, G 0.8
- Avena instantanea: 35 Grs — 123.2 kcal, P 4.55, C 19.95, G 2.8
- Claras de huevos: 4 Unid — 62.8 kcal, P 14, C 0.8, G 0.4
- Copos de maiz sin azucar: 25 Grs — 90.43 kcal, P 1.65, C 20.67, G 0.13

