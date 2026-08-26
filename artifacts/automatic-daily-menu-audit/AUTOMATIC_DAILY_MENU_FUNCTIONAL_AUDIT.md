# Auditoría funcional de generación automática diaria

Generado: 2026-08-25T20:25:44.486Z

## Seguridad y alcance

- Snapshot Mongo: 574 → 574 documentos.
- Lecturas directas: 2; escrituras: 0.
- Catálogo sin cambios: true; generation sin cambios: true.
- Integración: planner real del frontend → combinador existente → solver existente → meal_generation_balanced_v1.
- Este reporte calcula diferencias del día; no introduce una clasificación nutricional diaria nueva.

## Resumen

- Casos: 30; PASS 29; FAIL 1.
- Llamadas al solver: 111.
- Comidas centrales: RECOMMENDED 101; BEST_EFFORT 11.

## Performance end-to-end

| comidas | muestras | promedio | p95 | máximo | llamadas totales |
|---:|---:|---:|---:|---:|---:|
| 3 | 3 | 1391.41 ms | 2193.71 ms | 2193.71 ms | 9 |
| 4 | 3 | 1601.36 ms | 1970.05 ms | 1970.05 ms | 12 |
| 5 | 3 | 1959.41 ms | 2303.92 ms | 2303.92 ms | 15 |
| 6 | 3 | 3462.81 ms | 4210.89 ms | 4210.89 ms | 18 |

## Diversidad por seed / otra opción

- Opciones: 6; fingerprints diarios distintos: 6; repeticiones: 0.
- La cobertura estructural P2/C2/V/F/G se valida por separado en foodCombinationCandidates y en el benchmark 1/10/32/40; este runner no altera el límite 32.

## Matriz y trazas

### daily-3-low-balanced — PASS

- Propósito: 3 comidas, low-balanced
- INPUT: 1500 kcal / P105 / C157.5 / G50; desayuno, almuerzo, cena; seed `daily-audit-3-low-balanced`.
- Preservadas: ninguna.
- Resultado diario: 1499.9 kcal / P106.2 / C181.2 / G39; diferencia actual-target -0.1 kcal / P1.2 / C23.7 / G-11.
- Tiempo/solver: 2193.71 ms; 3 llamadas.
- Motivo: invariantes de preservación, carry, totals y contrato central conformes.

| # | comida | estado | target | actual | alimentos y cantidades | remaining antes → después |
|---:|---|---|---|---|---|---|
| 1 | desayuno | generated/RECOMMENDED | 497.5 kcal / P34.8 / C52.2 / G16.6 | 500.5 kcal / P37.4 / C61.1 / G11.9 | Claras de huevos 8 Unid + Galletitas de agua 85 Grs | 1500 kcal / P105 / C157.5 / G50 → 999.6 kcal / P67.7 / C96.4 / G38.2 |
| 2 | almuerzo | generated/RECOMMENDED | 552.8 kcal / P37.4 / C53.3 / G21.1 | 553 kcal / P36.2 / C64.9 / G16.5 | Aceite de coco 15 Grs + Anana 120 Grs + Arroz 70 Grs + Atun en lomitos al natural 1 Pote | 999.6 kcal / P67.7 / C96.4 / G38.2 → 446.5 kcal / P31.4 / C31.6 / G21.6 |
| 3 | cena | generated/BEST_EFFORT | 446.5 kcal / P31.5 / C31.6 / G21.6 | 446.4 kcal / P32.6 / C55.2 / G10.6 | Arroz integral (Cocido) 240 Grs + Carne de cerdo magro 120 Grs | 446.5 kcal / P31.4 / C31.6 / G21.6 → 0.1 kcal / P-1.2 / C-23.6 / G11 |

### daily-3-medium-custom — PASS

- Propósito: 3 comidas, medium-custom
- INPUT: 2100 kcal / P140 / C238.8 / G65; desayuno, almuerzo, cena; seed `daily-audit-3-medium-custom`.
- Preservadas: ninguna.
- Resultado diario: 2099.4 kcal / P138.7 / C247.8 / G61.5; diferencia actual-target -0.6 kcal / P-1.3 / C9 / G-3.5.
- Tiempo/solver: 996.84 ms; 3 llamadas.
- Motivo: invariantes de preservación, carry, totals y contrato central conformes.

| # | comida | estado | target | actual | alimentos y cantidades | remaining antes → después |
|---:|---|---|---|---|---|---|
| 1 | desayuno | generated/RECOMMENDED | 525 kcal / P35 / C59.7 / G16.3 | 519.5 kcal / P34.9 / C54.8 / G17.9 | Avena instantanea 95 Grs + Claras de huevos 3 Unid + Huevos 2 Unid | 2100 kcal / P140 / C238.8 / G65 → 1580.5 kcal / P105.2 / C184.1 / G47.1 |
| 2 | almuerzo | generated/RECOMMENDED | 842.9 kcal / P56.1 / C98.2 / G25.1 | 843.5 kcal / P54.8 / C107 / G21.8 | Aceite de coco 20 Grs + Anana 80 Grs + Arroz 130 Grs + Atun en lomitos al natural 1 Pote + Claras de huevos 4 Unid | 1580.5 kcal / P105.2 / C184.1 / G47.1 → 737 kcal / P50.3 / C77.1 / G25.3 |
| 3 | cena | generated/RECOMMENDED | 737 kcal / P50.4 / C77.1 / G25.3 | 736.4 kcal / P49 / C86.1 / G21.8 | Aceite de coco 20 Grs + Anana 100 Grs + Arroz 100 Grs + Atun en lomitos al natural 1 Pote + Claras de huevos 3 Unid | 737 kcal / P50.3 / C77.1 / G25.3 → 0.6 kcal / P1.3 / C-9 / G3.5 |

### daily-3-high-protein — PASS

- Propósito: 3 comidas, high-protein
- INPUT: 1800 kcal / P180 / C146.3 / G55; desayuno, almuerzo, cena; seed `daily-audit-3-high-protein`.
- Preservadas: ninguna.
- Resultado diario: 1795.5 kcal / P175.8 / C140.3 / G59; diferencia actual-target -4.5 kcal / P-4.2 / C-6 / G4.
- Tiempo/solver: 983.67 ms; 3 llamadas.
- Motivo: invariantes de preservación, carry, totals y contrato central conformes.

| # | comida | estado | target | actual | alimentos y cantidades | remaining antes → después |
|---:|---|---|---|---|---|---|
| 1 | desayuno | generated/RECOMMENDED | 609.6 kcal / P61 / C49.5 / G18.6 | 614.2 kcal / P56.4 / C47.2 / G22.2 | Avena instantanea 80 Grs + Claras de huevos 8 Unid + Huevos 3 Unid | 1800 kcal / P180 / C146.3 / G55 → 1185.8 kcal / P123.6 / C99.1 / G32.8 |
| 2 | almuerzo | generated/RECOMMENDED | 620 kcal / P64.6 / C51.8 / G17.2 | 622.5 kcal / P60.6 / C52.5 / G18.9 | Arroz integral 70 Grs + Carne de cerdo magro 250 Grs | 1185.8 kcal / P123.6 / C99.1 / G32.8 → 563.3 kcal / P63 / C46.6 / G13.9 |
| 3 | cena | generated/RECOMMENDED | 563.3 kcal / P63 / C46.6 / G13.9 | 558.8 kcal / P58.8 / C40.6 / G17.9 | Arroz (Cocido) 140 Grs + Carne de cerdo magro 250 Grs | 563.3 kcal / P63 / C46.6 / G13.9 → 4.5 kcal / P4.2 / C6 / G-4 |

### daily-4-low-custom — PASS

- Propósito: 4 comidas, low-custom
- INPUT: 1700 kcal / P120 / C181.3 / G55; desayuno, almuerzo, merienda, cena; seed `daily-audit-4-low-custom`.
- Preservadas: ninguna.
- Resultado diario: 1700 kcal / P119.8 / C188.1 / G53.9; diferencia actual-target 0 kcal / P-0.2 / C6.8 / G-1.1.
- Tiempo/solver: 1361.17 ms; 4 llamadas.
- Motivo: invariantes de preservación, carry, totals y contrato central conformes.

| # | comida | estado | target | actual | alimentos y cantidades | remaining antes → después |
|---:|---|---|---|---|---|---|
| 1 | desayuno | generated/RECOMMENDED | 340 kcal / P24 / C36.3 / G11 | 341.4 kcal / P24.8 / C42.2 / G8.2 | Galletitas de agua 60 Grs + Whey protein Isolate 20 Grs | 1700 kcal / P120 / C181.3 / G55 → 1358.6 kcal / P95.2 / C139.1 / G46.8 |
| 2 | almuerzo | generated/RECOMMENDED | 594.4 kcal / P41.7 / C60.9 / G20.5 | 592.4 kcal / P40.4 / C70.6 / G16.5 | Aceite de coco 15 Grs + Anana 100 Grs + Arroz 80 Grs + Atun en lomitos al natural 1 Pote + Claras de huevos 1 Unid | 1358.6 kcal / P95.2 / C139.1 / G46.8 → 766.2 kcal / P54.8 / C68.5 / G30.4 |
| 3 | merienda | generated/RECOMMENDED | 340.5 kcal / P24.4 / C30.4 / G13.5 | 347.8 kcal / P23.2 / C22.8 / G18.2 | Avena instantanea 40 Grs + Huevos 3 Unid | 766.2 kcal / P54.8 / C68.5 / G30.4 → 418.4 kcal / P31.6 / C45.7 / G12.1 |
| 4 | cena | generated/RECOMMENDED | 418.4 kcal / P31.6 / C45.7 / G12.2 | 418.4 kcal / P31.4 / C52.5 / G11 | Arroz integral 70 Grs + Churrasco magro 120 Grs | 418.4 kcal / P31.6 / C45.7 / G12.1 → 0 kcal / P0.2 / C-6.8 / G1.1 |

### daily-4-medium-balanced — PASS

- Propósito: 4 comidas, medium-balanced
- INPUT: 2000 kcal / P140 / C225 / G60; desayuno, almuerzo, merienda, cena; seed `daily-audit-4-medium-balanced`.
- Preservadas: ninguna.
- Resultado diario: 1998.9 kcal / P142.5 / C250.2 / G50; diferencia actual-target -1.1 kcal / P2.5 / C25.2 / G-10.
- Tiempo/solver: 1970.05 ms; 4 llamadas.
- Motivo: invariantes de preservación, carry, totals y contrato central conformes.

| # | comida | estado | target | actual | alimentos y cantidades | remaining antes → después |
|---:|---|---|---|---|---|---|
| 1 | desayuno | generated/RECOMMENDED | 499 kcal / P34.9 / C56.1 / G15 | 499 kcal / P33.2 / C59.1 / G14.4 | Almendras 1 Unid + Anana 80 Grs + Avena instantanea 30 Grs + Claras de huevos 4 Unid + Copos de maiz sin azucar 40 Grs + Huevos 2 Unid | 2000 kcal / P140 / C225 / G60 → 1501 kcal / P106.8 / C165.9 / G45.6 |
| 2 | almuerzo | generated/RECOMMENDED | 558.9 kcal / P39.8 / C61.8 / G17 | 563.7 kcal / P42 / C71.3 / G14.7 | Arroz integral 95 Grs + Churrasco magro 160 Grs | 1501 kcal / P106.8 / C165.9 / G45.6 → 937.3 kcal / P64.8 / C94.6 / G30.9 |
| 3 | merienda | generated/RECOMMENDED | 491.4 kcal / P34 / C49.6 / G16.2 | 490.1 kcal / P36.7 / C59.8 / G11.6 | Galletitas de agua 85 Grs + Whey protein Isolate 30 Grs | 937.3 kcal / P64.8 / C94.6 / G30.9 → 447.2 kcal / P28.2 / C34.8 / G19.3 |
| 4 | cena | generated/BEST_EFFORT | 447.2 kcal / P28.2 / C34.8 / G19.3 | 446.1 kcal / P30.6 / C60 / G9.3 | Arroz integral 80 Grs + Carne de cerdo magro 110 Grs | 447.2 kcal / P28.2 / C34.8 / G19.3 → 1.1 kcal / P-2.4 / C-25.2 / G10 |

### daily-4-high-balanced — PASS

- Propósito: 4 comidas, high-balanced
- INPUT: 2400 kcal / P165 / C266.3 / G75; desayuno, almuerzo, merienda, cena; seed `daily-audit-4-high-balanced`.
- Preservadas: ninguna.
- Resultado diario: 2396.1 kcal / P166.6 / C276.5 / G72.2; diferencia actual-target -3.9 kcal / P1.6 / C10.2 / G-2.8.
- Tiempo/solver: 1472.85 ms; 4 llamadas.
- Motivo: invariantes de preservación, carry, totals y contrato central conformes.

| # | comida | estado | target | actual | alimentos y cantidades | remaining antes → después |
|---:|---|---|---|---|---|---|
| 1 | desayuno | generated/RECOMMENDED | 546.7 kcal / P37.6 / C60.7 / G17.1 | 552.3 kcal / P38.5 / C66.6 / G14.7 | Avena instantanea 115 Grs + Claras de huevos 5 Unid + Huevos 1 Unid | 2400 kcal / P165 / C266.3 / G75 → 1847.7 kcal / P126.6 / C199.8 / G60.3 |
| 2 | almuerzo | generated/RECOMMENDED | 642.4 kcal / P44 / C69.4 / G21 | 637.2 kcal / P48.4 / C81.2 / G16 | Arroz (Cocido) 280 Grs + Churrasco magro 190 Grs | 1847.7 kcal / P126.6 / C199.8 / G60.3 → 1210.6 kcal / P78.1 / C118.6 / G44.3 |
| 3 | merienda | generated/RECOMMENDED | 551.9 kcal / P35.6 / C54.1 / G20.2 | 551.9 kcal / P35.4 / C57.7 / G20 | Almendras 1 Unid + Anana 150 Grs + Avena instantanea 30 Grs + Claras de huevos 3 Unid + Copos de maiz sin azucar 30 Grs + Huevos 3 Unid | 1210.6 kcal / P78.1 / C118.6 / G44.3 → 658.7 kcal / P42.7 / C60.9 / G24.3 |
| 4 | cena | generated/RECOMMENDED | 658.7 kcal / P42.8 / C60.9 / G24.3 | 654.7 kcal / P44.3 / C71.1 / G21.5 | Aceite de coco 20 Grs + Anana 80 Grs + Arroz 80 Grs + Atun en lomitos al natural 1 Pote + Berenjena 50 Grs + Claras de huevos 2 Unid | 658.7 kcal / P42.7 / C60.9 / G24.3 → 3.9 kcal / P-1.6 / C-10.2 / G2.8 |

### daily-5-low-balanced — PASS

- Propósito: 5 comidas, low-balanced
- INPUT: 1900 kcal / P135 / C205 / G60; desayuno, almuerzo, merienda, cena, snack; seed `daily-audit-5-low-balanced`.
- Preservadas: ninguna.
- Resultado diario: 1890.5 kcal / P135.5 / C199.5 / G62.9; diferencia actual-target -9.5 kcal / P0.5 / C-5.5 / G2.9.
- Tiempo/solver: 1787.46 ms; 5 llamadas.
- Motivo: invariantes de preservación, carry, totals y contrato central conformes.

| # | comida | estado | target | actual | alimentos y cantidades | remaining antes → después |
|---:|---|---|---|---|---|---|
| 1 | desayuno | generated/RECOMMENDED | 402.2 kcal / P28.6 / C43.4 / G12.7 | 402.5 kcal / P29.5 / C52.5 / G8.3 | Almendras 1 Unid + Avena instantanea 90 Grs + Claras de huevos 5 Unid | 1900 kcal / P135 / C205 / G60 → 1497.6 kcal / P105.5 / C152.5 / G51.7 |
| 2 | almuerzo | generated/RECOMMENDED | 368.4 kcal / P26 / C37.5 / G12.7 | 366.2 kcal / P28 / C46.4 / G9.3 | Arroz (Cocido) 160 Grs + Churrasco magro 110 Grs | 1497.6 kcal / P105.5 / C152.5 / G51.7 → 1131.4 kcal / P77.6 / C106.1 / G42.4 |
| 3 | merienda | generated/RECOMMENDED | 362.3 kcal / P24.8 / C34 / G13.6 | 365.5 kcal / P22.6 / C30.6 / G17 | Huevos 3 Unid + Pan 60 Grs | 1131.4 kcal / P77.6 / C106.1 / G42.4 → 765.9 kcal / P55 / C75.5 / G25.4 |
| 4 | cena | generated/RECOMMENDED | 363.1 kcal / P26.1 / C35.8 / G12.1 | 365.1 kcal / P28.9 / C46 / G7.3 | Arroz integral (Cocido) 200 Grs + Bola de lomo 110 Grs | 765.9 kcal / P55 / C75.5 / G25.4 → 400.8 kcal / P26.2 / C29.5 / G18.1 |
| 5 | snack | generated/RECOMMENDED | 400.8 kcal / P26.2 / C29.5 / G18.1 | 391.4 kcal / P26.6 / C24 / G21 | Galletas de arroz 3 Unid + Huevos 4 Unid | 400.8 kcal / P26.2 / C29.5 / G18.1 → 9.5 kcal / P-0.4 / C5.5 / G-2.9 |

### daily-5-medium-custom — PASS

- Propósito: 5 comidas, medium-custom
- INPUT: 2300 kcal / P170 / C247.5 / G70; desayuno, almuerzo, merienda, cena, snack; seed `daily-audit-5-medium-custom`.
- Preservadas: ninguna.
- Resultado diario: 2300.5 kcal / P172.3 / C254 / G66.2; diferencia actual-target 0.5 kcal / P2.3 / C6.5 / G-3.8.
- Tiempo/solver: 2303.92 ms; 5 llamadas.
- Motivo: invariantes de preservación, carry, totals y contrato central conformes.

| # | comida | estado | target | actual | alimentos y cantidades | remaining antes → después |
|---:|---|---|---|---|---|---|
| 1 | desayuno | generated/RECOMMENDED | 345 kcal / P25.5 / C37.1 / G10.5 | 344.9 kcal / P25 / C37.7 / G10.5 | Avena instantanea 65 Grs + Claras de huevos 3 Unid + Huevos 1 Unid | 2300 kcal / P170 / C247.5 / G70 → 1955.1 kcal / P145.1 / C209.9 / G59.5 |
| 2 | almuerzo | generated/RECOMMENDED | 575 kcal / P42.7 / C61.7 / G17.5 | 580.5 kcal / P44.2 / C72.5 / G12.7 | Arroz (Cocido) 250 Grs + Carne de cerdo magro 170 Grs | 1955.1 kcal / P145.1 / C209.9 / G59.5 → 1374.6 kcal / P100.9 / C137.4 / G46.9 |
| 3 | merienda | generated/RECOMMENDED | 458.2 kcal / P33.6 / C45.8 / G15.6 | 457 kcal / P33.2 / C55.1 / G11.6 | Galletitas de agua 75 Grs + Whey protein SN 30 Grs | 1374.6 kcal / P100.9 / C137.4 / G46.9 → 917.7 kcal / P67.8 / C82.2 / G35.3 |
| 4 | cena | generated/RECOMMENDED | 573.5 kcal / P42.3 / C51.4 / G22.1 | 575.1 kcal / P42.2 / C53.7 / G21.3 | Aceite de coco 20 Grs + Anana 80 Grs + Arroz 60 Grs + Atun en lomitos al natural 1 Pote + Claras de huevos 2 Unid | 917.7 kcal / P67.8 / C82.2 / G35.3 → 342.5 kcal / P25.6 / C28.5 / G14 |
| 5 | snack | generated/RECOMMENDED | 342.5 kcal / P25.6 / C28.5 / G14 | 343 kcal / P27.8 / C35 / G10.2 | Avena instantanea 60 Grs + Claras de huevos 4 Unid + Huevos 1 Unid | 342.5 kcal / P25.6 / C28.5 / G14 → -0.5 kcal / P-2.2 / C-6.5 / G3.8 |

### daily-5-high-balanced — PASS

- Propósito: 5 comidas, high-balanced
- INPUT: 2800 kcal / P195 / C313.8 / G85; desayuno, almuerzo, merienda, cena, snack; seed `daily-audit-5-high-balanced`.
- Preservadas: ninguna.
- Resultado diario: 2799.9 kcal / P192.6 / C316.2 / G89.6; diferencia actual-target -0.1 kcal / P-2.4 / C2.4 / G4.6.
- Tiempo/solver: 1786.84 ms; 5 llamadas.
- Motivo: invariantes de preservación, carry, totals y contrato central conformes.

| # | comida | estado | target | actual | alimentos y cantidades | remaining antes → después |
|---:|---|---|---|---|---|---|
| 1 | desayuno | generated/RECOMMENDED | 549.8 kcal / P38.3 / C61.6 / G16.7 | 549.9 kcal / P38.9 / C55 / G19.4 | Almendras 1 Unid + Anana 80 Grs + Avena instantanea 30 Grs + Claras de huevos 4 Unid + Copos de maiz sin azucar 35 Grs + Huevos 3 Unid | 2800 kcal / P195 / C313.8 / G85 → 2250.1 kcal / P156.1 / C258.8 / G65.6 |
| 2 | almuerzo | generated/RECOMMENDED | 584.6 kcal / P40.6 / C67.2 / G17.1 | 584.3 kcal / P40.7 / C78.8 / G14.1 | Arroz integral 105 Grs + Churrasco magro 150 Grs | 2250.1 kcal / P156.1 / C258.8 / G65.6 → 1665.8 kcal / P115.5 / C180 / G51.5 |
| 3 | merienda | generated/RECOMMENDED | 535.9 kcal / P37.2 / C57.9 / G16.6 | 528.9 kcal / P35 / C67.9 / G13.1 | Claras de huevos 7 Unid + Galletitas de agua 95 Grs | 1665.8 kcal / P115.5 / C180 / G51.5 → 1137 kcal / P80.5 / C112.1 / G38.5 |
| 4 | cena | generated/RECOMMENDED | 543.4 kcal / P38.5 / C53.6 / G18.4 | 540.6 kcal / P41.7 / C64.4 / G15.3 | Arroz integral (Cocido) 280 Grs + Churrasco magro 160 Grs | 1137 kcal / P80.5 / C112.1 / G38.5 → 596.4 kcal / P38.8 / C47.7 / G23.1 |
| 5 | snack | generated/RECOMMENDED | 596.4 kcal / P38.9 / C47.7 / G23.1 | 596.2 kcal / P36.5 / C50.2 / G27.8 | Almendras 3 Unid + Anana 140 Grs + Avena instantanea 55 Grs + Claras de huevos 1 Unid + Copos de maiz sin azucar 5 Grs + Huevos 4 Unid | 596.4 kcal / P38.8 / C47.7 / G23.1 → 0.1 kcal / P2.4 / C-2.4 / G-4.6 |

### daily-6-low-custom — PASS

- Propósito: 6 comidas, low-custom
- INPUT: 2200 kcal / P150 / C242.5 / G70; desayuno, colacion, almuerzo, merienda, cena, snack; seed `daily-audit-6-low-custom`.
- Preservadas: ninguna.
- Resultado diario: 2199.9 kcal / P147.7 / C296.3 / G48.9; diferencia actual-target -0.1 kcal / P-2.3 / C53.8 / G-21.1.
- Tiempo/solver: 3381.03 ms; 6 llamadas.
- Motivo: invariantes de preservación, carry, totals y contrato central conformes.

| # | comida | estado | target | actual | alimentos y cantidades | remaining antes → después |
|---:|---|---|---|---|---|---|
| 1 | desayuno | generated/RECOMMENDED | 330 kcal / P22.5 / C36.4 / G10.5 | 329.2 kcal / P20.6 / C47.5 / G6.3 | Avena instantanea 75 Grs + Claras de huevos 3 Unid + Copos de maiz sin azucar 5 Grs | 2200 kcal / P150 / C242.5 / G70 → 1870.8 kcal / P129.4 / C195 / G63.7 |
| 2 | colacion | generated/RECOMMENDED | 330.1 kcal / P22.8 / C34.4 / G11.2 | 330.1 kcal / P23 / C35.9 / G10.6 | Almendras 2 Unid + Anana 80 Grs + Avena instantanea 40 Grs + Claras de huevos 3 Unid + Copos de maiz sin azucar 5 Grs + Huevos 1 Unid | 1870.8 kcal / P129.4 / C195 / G63.7 → 1540.7 kcal / P106.5 / C159.2 / G53.1 |
| 3 | almuerzo | generated/RECOMMENDED | 440.2 kcal / P30.4 / C45.5 / G15.2 | 435.9 kcal / P31.8 / C56.3 / G11.1 | Arroz integral 75 Grs + Churrasco magro 120 Grs | 1540.7 kcal / P106.5 / C159.2 / G53.1 → 1104.8 kcal / P74.7 / C102.9 / G42 |
| 4 | merienda | generated/RECOMMENDED | 331.5 kcal / P22.4 / C30.9 / G12.6 | 327.4 kcal / P20.6 / C42.8 / G8.2 | Claras de huevos 4 Unid + Galletitas de agua 60 Grs | 1104.8 kcal / P74.7 / C102.9 / G42 → 777.4 kcal / P54.1 / C60.1 / G33.8 |
| 5 | cena | generated/BEST_EFFORT | 444.2 kcal / P30.9 / C34.4 / G19.3 | 444.2 kcal / P29 / C76.2 / G2.6 | Arroz integral 100 Grs + Claras de huevos 6 Unid | 777.4 kcal / P54.1 / C60.1 / G33.8 → 333.2 kcal / P25.1 / C-16.1 / G31.2 |
| 6 | snack | generated/BEST_EFFORT | 333.2 kcal / P25.1 / C0 / G31.2 | 333.1 kcal / P22.8 / C37.7 / G10.1 | Almendras 1 Unid + Anana 100 Grs + Avena instantanea 40 Grs + Claras de huevos 3 Unid + Copos de maiz sin azucar 5 Grs + Huevos 1 Unid | 333.2 kcal / P25.1 / C-16.1 / G31.2 → 0.1 kcal / P2.3 / C-53.8 / G21.1 |

### daily-6-medium-balanced — PASS

- Propósito: 6 comidas, medium-balanced
- INPUT: 2600 kcal / P190 / C280 / G80; desayuno, colacion, almuerzo, merienda, cena, snack; seed `daily-audit-6-medium-balanced`.
- Preservadas: ninguna.
- Resultado diario: 2599.9 kcal / P191.5 / C346.9 / G49.6; diferencia actual-target -0.1 kcal / P1.5 / C66.9 / G-30.4.
- Tiempo/solver: 4210.89 ms; 6 llamadas.
- Motivo: invariantes de preservación, carry, totals y contrato central conformes.

| # | comida | estado | target | actual | alimentos y cantidades | remaining antes → después |
|---:|---|---|---|---|---|---|
| 1 | desayuno | generated/RECOMMENDED | 402.9 kcal / P29.4 / C43.4 / G12.4 | 404.8 kcal / P30.5 / C49.3 / G9.5 | Galletitas de agua 70 Grs + Whey protein Isolate 25 Grs | 2600 kcal / P190 / C280 / G80 → 2195.3 kcal / P159.6 / C230.8 / G70.5 |
| 2 | colacion | generated/RECOMMENDED | 446.2 kcal / P32.4 / C46.9 / G14.3 | 456 kcal / P36.8 / C52.1 / G11.2 | Galletitas de agua 70 Grs + Whey protein SN 35 Grs | 2195.3 kcal / P159.6 / C230.8 / G70.5 → 1739.3 kcal / P122.8 / C178.7 / G59.3 |
| 3 | almuerzo | generated/RECOMMENDED | 409.7 kcal / P28.9 / C42.1 / G14 | 411.1 kcal / P29.8 / C52.5 / G9.1 | Arroz integral 70 Grs + Carne de cerdo magro 110 Grs | 1739.3 kcal / P122.8 / C178.7 / G59.3 → 1328.2 kcal / P93 / C126.2 / G50.2 |
| 4 | merienda | generated/RECOMMENDED | 456.7 kcal / P32 / C43.4 / G17.3 | 456.6 kcal / P33.5 / C50.7 / G13.4 | Almendras 3 Unid + Anana 80 Grs + Avena instantanea 65 Grs + Claras de huevos 5 Unid + Copos de maiz sin azucar 5 Grs + Huevos 1 Unid | 1328.2 kcal / P93 / C126.2 / G50.2 → 871.5 kcal / P59.5 / C75.5 / G36.8 |
| 5 | cena | generated/BEST_EFFORT | 447.9 kcal / P30.6 / C38.8 / G18.9 | 448.4 kcal / P32.5 / C76.9 / G1.2 | Arroz 100 Grs + Claras de huevos 7 Unid | 871.5 kcal / P59.5 / C75.5 / G36.8 → 423.1 kcal / P27 / C-1.4 / G35.6 |
| 6 | snack | generated/BEST_EFFORT | 423.1 kcal / P27 / C0 / G35.6 | 423 kcal / P28.5 / C65.5 / G5.2 | Almendras 1 Unid + Anana 140 Grs + Avena instantanea 30 Grs + Claras de huevos 6 Unid + Copos de maiz sin azucar 40 Grs | 423.1 kcal / P27 / C-1.4 / G35.6 → 0.1 kcal / P-1.5 / C-66.9 / G30.4 |

### daily-6-high-balanced — PASS

- Propósito: 6 comidas, high-balanced
- INPUT: 3000 kcal / P210 / C337.5 / G90; desayuno, colacion, almuerzo, merienda, cena, snack; seed `daily-audit-6-high-balanced`.
- Preservadas: ninguna.
- Resultado diario: 2999.9 kcal / P211.4 / C348.5 / G86.6; diferencia actual-target -0.1 kcal / P1.4 / C11 / G-3.4.
- Tiempo/solver: 2796.5 ms; 6 llamadas.
- Motivo: invariantes de preservación, carry, totals y contrato central conformes.

| # | comida | estado | target | actual | alimentos y cantidades | remaining antes → después |
|---:|---|---|---|---|---|---|
| 1 | desayuno | generated/RECOMMENDED | 487.9 kcal / P34.2 / C54.9 / G14.6 | 488.1 kcal / P34.7 / C65.2 / G9.9 | Almendras 3 Unid + Anana 250 Grs + Avena instantanea 60 Grs + Claras de huevos 7 Unid + Copos de maiz sin azucar 5 Grs | 3000 kcal / P210 / C337.5 / G90 → 2511.9 kcal / P175.3 / C272.3 / G80.1 |
| 2 | colacion | generated/RECOMMENDED | 494 kcal / P34.5 / C53.6 / G15.8 | 499.5 kcal / P36.5 / C58 / G13.5 | Avena instantanea 100 Grs + Claras de huevos 5 Unid + Huevos 1 Unid | 2511.9 kcal / P175.3 / C272.3 / G80.1 → 2012.4 kcal / P138.8 / C214.3 / G66.6 |
| 3 | almuerzo | generated/RECOMMENDED | 527.6 kcal / P36.4 / C56.2 / G17.5 | 522.8 kcal / P37.6 / C66.7 / G13.8 | Arroz integral (Cocido) 290 Grs + Churrasco magro 140 Grs | 2012.4 kcal / P138.8 / C214.3 / G66.6 → 1489.6 kcal / P101.2 / C147.6 / G52.8 |
| 4 | merienda | generated/RECOMMENDED | 468.6 kcal / P31.8 / C46.4 / G16.6 | 471 kcal / P27.8 / C42.8 / G21 | Avena instantanea 75 Grs + Huevos 3 Unid | 1489.6 kcal / P101.2 / C147.6 / G52.8 → 1018.6 kcal / P73.4 / C104.8 / G31.8 |
| 5 | cena | generated/RECOMMENDED | 482.1 kcal / P34.8 / C49.6 / G15.1 | 483.4 kcal / P36.5 / C60.9 / G10.4 | Arroz (Cocido) 210 Grs + Carne de cerdo magro 140 Grs | 1018.6 kcal / P73.4 / C104.8 / G31.8 → 535.3 kcal / P37 / C43.9 / G21.4 |
| 6 | snack | generated/RECOMMENDED | 535.3 kcal / P37 / C43.9 / G21.4 | 535.2 kcal / P38.4 / C55 / G18 | Avena instantanea 95 Grs + Claras de huevos 4 Unid + Huevos 2 Unid | 535.3 kcal / P37 / C43.9 / G21.4 → 0.1 kcal / P-1.4 / C-11 / G3.4 |

### partial-empty — PASS

- Propósito: Día vacío
- INPUT: 2000 kcal / P140 / C225 / G60; desayuno, almuerzo, merienda, cena; seed `daily-audit-partial-empty`.
- Preservadas: ninguna.
- Resultado diario: 2000.5 kcal / P144.6 / C233.7 / G58.8; diferencia actual-target 0.5 kcal / P4.6 / C8.7 / G-1.2.
- Tiempo/solver: 1894.5 ms; 4 llamadas.
- Motivo: invariantes de preservación, carry, totals y contrato central conformes.

| # | comida | estado | target | actual | alimentos y cantidades | remaining antes → después |
|---:|---|---|---|---|---|---|
| 1 | desayuno | generated/RECOMMENDED | 559.7 kcal / P39.2 / C63 / G16.8 | 564.9 kcal / P39.7 / C74.9 / G11.9 | Almendras 3 Unid + Anana 90 Grs + Avena instantanea 105 Grs + Claras de huevos 7 Unid + Copos de maiz sin azucar 5 Grs | 2000 kcal / P140 / C225 / G60 → 1435.1 kcal / P100.3 / C150.1 / G48.1 |
| 2 | almuerzo | generated/RECOMMENDED | 495 kcal / P34.6 / C51.8 / G16.6 | 499.8 kcal / P36.9 / C63.8 / G12.9 | Arroz integral 85 Grs + Churrasco magro 140 Grs | 1435.1 kcal / P100.3 / C150.1 / G48.1 → 935.3 kcal / P63.4 / C86.4 / G35.2 |
| 3 | merienda | generated/RECOMMENDED | 424.1 kcal / P28.8 / C39.2 / G16 | 418.2 kcal / P25.8 / C34.2 / G19.8 | Avena instantanea 60 Grs + Huevos 3 Unid | 935.3 kcal / P63.4 / C86.4 / G35.2 → 517.1 kcal / P37.6 / C52.2 / G15.4 |
| 4 | cena | generated/RECOMMENDED | 517.1 kcal / P37.6 / C52.2 / G15.4 | 517.6 kcal / P42.2 / C60.9 / G14.2 | Arroz (Cocido) 210 Grs + Churrasco magro 170 Grs | 517.1 kcal / P37.6 / C52.2 / G15.4 → -0.5 kcal / P-4.6 / C-8.7 / G1.2 |

### partial-one-zero — PASS

- Propósito: Una comida con C/G físicos en cero
- INPUT: 2000 kcal / P140 / C225 / G60; desayuno, almuerzo, merienda, cena; seed `daily-audit-partial-one-zero`.
- Preservadas: manual-zero-macros (165 kcal / P31 / C0 / G0).
- Resultado diario: 2001.1 kcal / P144.5 / C221 / G55.4; diferencia actual-target 1.1 kcal / P4.5 / C-4 / G-4.6.
- Tiempo/solver: 1384.72 ms; 3 llamadas.
- Motivo: invariantes de preservación, carry, totals y contrato central conformes.

| # | comida | estado | target | actual | alimentos y cantidades | remaining antes → después |
|---:|---|---|---|---|---|---|
| 1 | desayuno | preserved/manual | 430 kcal / P30 / C45 / G12 | 165 kcal / P31 / C0 / G0 | Contenido manual-zero-macros 1 unidad | — |
| 2 | almuerzo | generated/RECOMMENDED | 611 kcal / P36.3 / C74.9 / G20 | 611.4 kcal / P36.8 / C68.4 / G21.2 | Aceite de coco 20 Grs + Anana 80 Grs + Arroz 80 Grs + Atun en lomitos al natural 1 Pote | 1835 kcal / P109 / C225 / G60 → 1223.6 kcal / P72.2 / C156.6 / G38.8 |
| 3 | merienda | generated/RECOMMENDED | 553.5 kcal / P32.7 / C70.8 / G17.6 | 550.3 kcal / P27.9 / C66.3 / G19.3 | Huevos 3 Unid + Pan 130 Grs | 1223.6 kcal / P72.2 / C156.6 / G38.8 → 673.3 kcal / P44.3 / C90.3 / G19.5 |
| 4 | cena | generated/RECOMMENDED | 673.3 kcal / P44.3 / C90.3 / G19.5 | 674.3 kcal / P48.8 / C86.3 / G14.9 | Arroz integral 115 Grs + Carne de cerdo magro 180 Grs | 673.3 kcal / P44.3 / C90.3 / G19.5 → -1 kcal / P-4.5 / C4.1 / G4.6 |

### partial-two-existing — PASS

- Propósito: Dos comidas reales imperfectas
- INPUT: 2000 kcal / P140 / C225 / G60; desayuno, almuerzo, merienda, cena; seed `daily-audit-partial-two-existing`.
- Preservadas: manual-zero-macros (165 kcal / P31 / C0 / G0); manual-imperfect (515 kcal / P28 / C72 / G13).
- Resultado diario: 1990.6 kcal / P144.1 / C224.9 / G55.4; diferencia actual-target -9.4 kcal / P4.1 / C-0.1 / G-4.6.
- Tiempo/solver: 972.94 ms; 2 llamadas.
- Motivo: invariantes de preservación, carry, totals y contrato central conformes.

| # | comida | estado | target | actual | alimentos y cantidades | remaining antes → después |
|---:|---|---|---|---|---|---|
| 1 | desayuno | preserved/manual | 430 kcal / P30 / C45 / G12 | 165 kcal / P31 / C0 / G0 | Contenido manual-zero-macros 1 unidad | — |
| 2 | almuerzo | preserved/manual | 600 kcal / P45 / C65 / G18 | 515 kcal / P28 / C72 / G13 | Contenido manual-imperfect 1 unidad | — |
| 3 | merienda | generated/RECOMMENDED | 645.2 kcal / P39.6 / C74.8 / G23 | 645 kcal / P38.9 / C62.9 / G26.4 | Almendras 1 Unid + Anana 230 Grs + Avena instantanea 40 Grs + Claras de huevos 2 Unid + Copos de maiz sin azucar 20 Grs + Huevos 4 Unid | 1320 kcal / P81 / C153 / G47 → 675 kcal / P42.1 / C90.1 / G20.6 |
| 4 | cena | generated/RECOMMENDED | 675 kcal / P42.1 / C90.1 / G20.6 | 665.7 kcal / P46.2 / C90 / G16 | Arroz integral 120 Grs + Churrasco magro 170 Grs | 675 kcal / P42.1 / C90.1 / G20.6 → 9.4 kcal / P-4.1 / C0.1 / G4.6 |

### partial-created-from-target — PASS

- Propósito: Comida creada previamente por meta
- INPUT: 2000 kcal / P140 / C225 / G60; desayuno, almuerzo, merienda, cena; seed `daily-audit-partial-created-from-target`.
- Preservadas: created-from-meal-target (355 kcal / P24 / C42 / G9).
- Resultado diario: 2000 kcal / P142.5 / C228.2 / G58.9; diferencia actual-target 0 kcal / P2.5 / C3.2 / G-1.1.
- Tiempo/solver: 1457.22 ms; 3 llamadas.
- Motivo: invariantes de preservación, carry, totals y contrato central conformes.

| # | comida | estado | target | actual | alimentos y cantidades | remaining antes → después |
|---:|---|---|---|---|---|---|
| 1 | desayuno | generated/RECOMMENDED | 568.2 kcal / P40.1 / C63.2 / G17.6 | 566.2 kcal / P39.5 / C69.6 / G14.5 | Galletitas de agua 95 Grs + Whey protein SN 35 Grs | 1645 kcal / P116 / C183 / G51 → 1078.8 kcal / P76.5 / C113.5 / G36.6 |
| 2 | almuerzo | generated/RECOMMENDED | 575.3 kcal / P40.8 / C60.5 / G19.5 | 570.6 kcal / P36.4 / C60.4 / G20.4 | Aceite de coco 20 Grs + Arroz 80 Grs + Atun en lomitos al natural 1 Pote | 1078.8 kcal / P76.5 / C113.5 / G36.6 → 508.2 kcal / P40.1 / C53.1 / G16.2 |
| 3 | merienda | preserved/manual | 400 kcal / P30 / C45 / G10 | 355 kcal / P24 / C42 / G9 | Contenido created-from-meal-target 1 unidad | — |
| 4 | cena | generated/RECOMMENDED | 508.2 kcal / P40.1 / C53.1 / G16.2 | 508.2 kcal / P42.6 / C56.3 / G15.1 | Arroz integral 75 Grs + Churrasco magro 170 Grs | 508.2 kcal / P40.1 / C53.1 / G16.2 → 0 kcal / P-2.4 / C-3.2 / G1.1 |

### partial-target-only — PASS

- Propósito: Slot con meta pero sin alimentos
- INPUT: 2000 kcal / P140 / C225 / G60; desayuno, almuerzo, merienda, cena; seed `daily-audit-partial-target-only`.
- Preservadas: target-only-empty-slot (0 kcal / P0 / C0 / G0).
- Resultado diario: 1998.7 kcal / P140 / C226.4 / G59.2; diferencia actual-target -1.3 kcal / P0 / C1.4 / G-0.8.
- Tiempo/solver: 2571.68 ms; 4 llamadas.
- Motivo: invariantes de preservación, carry, totals y contrato central conformes.

| # | comida | estado | target | actual | alimentos y cantidades | remaining antes → después |
|---:|---|---|---|---|---|---|
| 1 | desayuno | generated/RECOMMENDED | 501.9 kcal / P35.1 / C56.5 / G15.1 | 493 kcal / P32.7 / C63.3 / G12.1 | Galletitas de agua 90 Grs + Whey protein Isolate 25 Grs | 2000 kcal / P140 / C225 / G60 → 1507.1 kcal / P107.4 / C161.8 / G47.9 |
| 2 | almuerzo | generated/RECOMMENDED | 488.3 kcal / P34.8 / C52.4 / G15.5 | 497.3 kcal / P39.4 / C60.4 / G10.9 | Arroz 80 Grs + Carne de cerdo magro 150 Grs | 1507.1 kcal / P107.4 / C161.8 / G47.9 → 1009.8 kcal / P68 / C101.4 / G37 |
| 3 | merienda | generated/RECOMMENDED | 505.6 kcal / P34 / C50.8 / G18.5 | 505.5 kcal / P33.1 / C57.5 / G15.9 | Almendras 1 Unid + Anana 200 Grs + Avena instantanea 35 Grs + Claras de huevos 4 Unid + Copos de maiz sin azucar 20 Grs + Huevos 2 Unid | 1009.8 kcal / P68 / C101.4 / G37 → 504.3 kcal / P34.8 / C43.9 / G21 |
| 4 | cena | generated/RECOMMENDED | 504.3 kcal / P34.8 / C43.9 / G21 | 502.9 kcal / P34.8 / C45.3 / G20.3 | Aceite de coco 20 Grs + Arroz 60 Grs + Atun en lomitos al natural 1 Pote | 504.3 kcal / P34.8 / C43.9 / G21 → 1.3 kcal / P0 / C-1.4 / G0.8 |

### partial-missing-fields — PASS

- Propósito: C/G ausentes: no heredar meta
- INPUT: 2000 kcal / P140 / C225 / G60; desayuno, almuerzo, merienda, cena; seed `daily-audit-partial-missing-fields`.
- Preservadas: legacy-missing-cg (220 kcal / P35 / C0 / G0).
- Resultado diario: 1999.5 kcal / P142.9 / C217.5 / G55.1; diferencia actual-target -0.5 kcal / P2.9 / C-7.5 / G-4.9.
- Tiempo/solver: 1447.09 ms; 3 llamadas.
- Motivo: invariantes de preservación, carry, totals y contrato central conformes.

| # | comida | estado | target | actual | alimentos y cantidades | remaining antes → después |
|---:|---|---|---|---|---|---|
| 1 | desayuno | preserved/manual | 430 kcal / P30 / C45 / G12 | 220 kcal / P35 / C0 / G0 | Contenido legacy-missing-cg 1 unidad | — |
| 2 | almuerzo | generated/RECOMMENDED | 532.1 kcal / P31.4 / C67.3 / G17.9 | 530.4 kcal / P36 / C71.3 / G13.2 | Arroz integral (Cocido) 310 Grs + Churrasco magro 130 Grs | 1780 kcal / P105 / C225 / G60 → 1249.6 kcal / P69 / C153.7 / G46.8 |
| 3 | merienda | generated/RECOMMENDED | 592.4 kcal / P32.7 / C72.9 / G22.2 | 591.8 kcal / P34.6 / C68.8 / G19.8 | Avena instantanea 120 Grs + Claras de huevos 2 Unid + Huevos 2 Unid | 1249.6 kcal / P69 / C153.7 / G46.8 → 657.8 kcal / P34.4 / C84.9 / G27 |
| 4 | cena | generated/RECOMMENDED | 657.8 kcal / P34.4 / C84.9 / G27 | 657.3 kcal / P37.3 / C77.4 / G22.1 | Aceite de coco 20 Grs + Anana 170 Grs + Arroz 80 Grs + Atun en lomitos al natural 1 Pote | 657.8 kcal / P34.4 / C84.9 / G27 → 0.5 kcal / P-2.9 / C7.5 / G4.9 |

### partial-aggregate-zero — PASS

- Propósito: Items legacy sin macros y agregado físico C/G=0
- INPUT: 2000 kcal / P140 / C225 / G60; desayuno, almuerzo, merienda, cena; seed `daily-audit-partial-aggregate-zero`.
- Preservadas: legacy-aggregate-zero (220 kcal / P35 / C0 / G0).
- Resultado diario: 2003 kcal / P139.9 / C248.8 / G40.9; diferencia actual-target 3 kcal / P-0.1 / C23.8 / G-19.1.
- Tiempo/solver: 1918.18 ms; 3 llamadas.
- Motivo: invariantes de preservación, carry, totals y contrato central conformes.

| # | comida | estado | target | actual | alimentos y cantidades | remaining antes → después |
|---:|---|---|---|---|---|---|
| 1 | desayuno | preserved/manual | 430 kcal / P30 / C45 / G12 | 220 kcal / P35 / C0 / G0 | Contenido legacy-aggregate-zero 1 unidad | — |
| 2 | almuerzo | generated/RECOMMENDED | 617.9 kcal / P36.5 / C78.1 / G20.8 | 619.6 kcal / P41.1 / C75.9 / G16.9 | Aceite de coco 15 Grs + Anana 130 Grs + Arroz 80 Grs + Atun en lomitos al natural 1 Pote + Berenjena 50 Grs + Claras de huevos 1 Unid | 1780 kcal / P105 / C225 / G60 → 1160.4 kcal / P63.9 / C149.1 / G43.1 |
| 3 | merienda | generated/RECOMMENDED | 524.7 kcal / P28.9 / C67.4 / G19.5 | 524.7 kcal / P30.3 / C59.7 / G18.3 | Almendras 2 Unid + Anana 80 Grs + Avena instantanea 75 Grs + Claras de huevos 2 Unid + Copos de maiz sin azucar 10 Grs + Huevos 2 Unid | 1160.4 kcal / P63.9 / C149.1 / G43.1 → 635.7 kcal / P33.6 / C89.4 / G24.8 |
| 4 | cena | generated/BEST_EFFORT | 635.7 kcal / P33.6 / C89.4 / G24.8 | 638.8 kcal / P33.5 / C113.3 / G5.8 | Arroz 150 Grs + Bola de lomo 100 Grs | 635.7 kcal / P33.6 / C89.4 / G24.8 → -3 kcal / P0.1 / C-23.8 / G19.1 |

### daily-selected-only-real — PASS

- Propósito: ONLY_SELECTED real: tres pares explícitos y ningún alimento agregado
- INPUT: 1800 kcal / P135 / C191.3 / G55; desayuno, almuerzo, cena; seed `daily-audit-selected-only`.
- Preservadas: ninguna.
- Resultado diario: 1797.5 kcal / P137.4 / C266.9 / G20; diferencia actual-target -2.5 kcal / P2.4 / C75.6 / G-35.
- Tiempo/solver: 72.43 ms; 3 llamadas.
- Motivo: invariantes de preservación, carry, totals y contrato central conformes.

| # | comida | estado | target | actual | alimentos y cantidades | remaining antes → después |
|---:|---|---|---|---|---|---|
| 1 | desayuno | generated/RECOMMENDED | 450 kcal / P33.8 / C47.8 / G13.8 | 457.2 kcal / P33.8 / C59.2 / G9.5 | Avena instantanea 100 Grs + Whey protein SN 25 Grs | 1800 kcal / P135 / C191.3 / G55 → 1342.8 kcal / P101.3 / C132.1 / G45.5 |
| 2 | almuerzo | generated/BEST_EFFORT | 716.2 kcal / P54 / C70.5 / G24.3 | 717.7 kcal / P53.8 / C113.3 / G5.5 | Arroz 150 Grs + Pechuga de pollo 190 Grs | 1342.8 kcal / P101.3 / C132.1 / G45.5 → 625.1 kcal / P47.5 / C18.9 / G40 |
| 3 | cena | generated/BEST_EFFORT | 625.1 kcal / P47.5 / C18.9 / G40 | 622.6 kcal / P49.8 / C94.5 / G5 | Fideos (Cocidos) 300 Grs + Lubina 180 Grs | 625.1 kcal / P47.5 / C18.9 / G40 → 2.5 kcal / P-2.3 / C-75.6 / G35 |

### daily-assisted-explicit-only-real — FAIL

- Propósito: ALLOW_SUGGESTIONS conserva un EXPLICIT_ONLY elegido y completa con GENERIC
- INPUT: 2000 kcal / P140 / C225 / G60; desayuno, almuerzo, merienda, cena; seed `daily-audit-assisted-explicit`.
- Preservadas: ninguna.
- Resultado diario: 0 kcal / P0 / C0 / G0; diferencia actual-target 0 kcal / P0 / C0 / G0.
- Tiempo/solver: 487.09 ms; 2 llamadas.
- Motivo: No encontramos una combinación válida para almuerzo..

| # | comida | estado | target | actual | alimentos y cantidades | remaining antes → después |
|---:|---|---|---|---|---|---|

### regenerate-middle — PASS

- Propósito: Regenera intermedia y recalcula posteriores
- INPUT: 2000 kcal / P140 / C225 / G60; desayuno, almuerzo, merienda, cena; seed `daily-audit-regenerate-middle`.
- Preservadas: manual-zero-macros (165 kcal / P31 / C0 / G0); generated-meal-1787689517653-0-xpip4 (611.4 kcal / P36.8 / C68.4 / G21.2).
- Resultado diario: 1994 kcal / P140.4 / C217.6 / G57.9; diferencia actual-target -6 kcal / P0.4 / C-7.4 / G-2.1.
- Tiempo/solver: 950.35 ms; 2 llamadas.
- Motivo: invariantes de preservación, carry, totals y contrato central conformes.

| # | comida | estado | target | actual | alimentos y cantidades | remaining antes → después |
|---:|---|---|---|---|---|---|
| 1 | desayuno | preserved/manual | 430 kcal / P30 / C45 / G12 | 165 kcal / P31 / C0 / G0 | Contenido manual-zero-macros 1 unidad | — |
| 2 | almuerzo | preserved/RECOMMENDED | 611 kcal / P36.3 / C74.9 / G20 | 611.4 kcal / P36.8 / C68.4 / G21.2 | Aceite de coco 20 Grs + Anana 80 Grs + Arroz 80 Grs + Atun en lomitos al natural 1 Pote | — |
| 3 | merienda | generated/RECOMMENDED | 613.1 kcal / P36.2 / C78.5 / G19.5 | 613.1 kcal / P35.4 / C81.2 / G16.3 | Almendras 2 Unid + Anana 120 Grs + Avena instantanea 105 Grs + Claras de huevos 4 Unid + Copos de maiz sin azucar 10 Grs + Huevos 1 Unid | 1223.6 kcal / P72.2 / C156.6 / G38.8 → 610.5 kcal / P36.8 / C75.4 / G22.5 |
| 4 | cena | generated/RECOMMENDED | 610.5 kcal / P36.8 / C75.4 / G22.6 | 604.5 kcal / P37.2 / C68 / G20.4 | Aceite de coco 20 Grs + Arroz 90 Grs + Atun en lomitos al natural 1 Pote | 610.5 kcal / P36.8 / C75.4 / G22.5 → 6 kcal / P-0.4 / C7.4 / G2.1 |

### regenerate-last — PASS

- Propósito: Regenera sólo la última automática
- INPUT: 2000 kcal / P140 / C225 / G60; desayuno, almuerzo, merienda, cena; seed `daily-audit-regenerate-last`.
- Preservadas: manual-zero-macros (165 kcal / P31 / C0 / G0); generated-meal-1787689517653-0-xpip4 (611.4 kcal / P36.8 / C68.4 / G21.2); generated-meal-1787689518121-0-7i8hm (550.3 kcal / P27.9 / C66.3 / G19.3).
- Resultado diario: 2000 kcal / P139.2 / C221.7 / G57.3; diferencia actual-target 0 kcal / P-0.8 / C-3.3 / G-2.7.
- Tiempo/solver: 517.67 ms; 1 llamadas.
- Motivo: invariantes de preservación, carry, totals y contrato central conformes.

| # | comida | estado | target | actual | alimentos y cantidades | remaining antes → después |
|---:|---|---|---|---|---|---|
| 1 | desayuno | preserved/manual | 430 kcal / P30 / C45 / G12 | 165 kcal / P31 / C0 / G0 | Contenido manual-zero-macros 1 unidad | — |
| 2 | almuerzo | preserved/RECOMMENDED | 611 kcal / P36.3 / C74.9 / G20 | 611.4 kcal / P36.8 / C68.4 / G21.2 | Aceite de coco 20 Grs + Anana 80 Grs + Arroz 80 Grs + Atun en lomitos al natural 1 Pote | — |
| 3 | merienda | preserved/RECOMMENDED | 553.5 kcal / P32.7 / C70.8 / G17.6 | 550.3 kcal / P27.9 / C66.3 / G19.3 | Huevos 3 Unid + Pan 130 Grs | — |
| 4 | cena | generated/RECOMMENDED | 673.3 kcal / P44.3 / C90.3 / G19.5 | 673.2 kcal / P43.5 / C87 / G16.8 | Aceite de coco 15 Grs + Anana 80 Grs + Arroz 90 Grs + Atun en lomitos al natural 1 Pote + Berenjena 240 Grs + Claras de huevos 1 Unid | 673.3 kcal / P44.3 / C90.3 / G19.5 → 0 kcal / P0.8 / C3.4 / G2.7 |

### regenerate-full — PASS

- Propósito: Regenera todo salvo manuales originales
- INPUT: 2000 kcal / P140 / C225 / G60; desayuno, almuerzo, merienda, cena; seed `daily-audit-regenerate-full`.
- Preservadas: manual-zero-macros (165 kcal / P31 / C0 / G0).
- Resultado diario: 1996.4 kcal / P144.5 / C223.1 / G56.1; diferencia actual-target -3.6 kcal / P4.5 / C-1.9 / G-3.9.
- Tiempo/solver: 1334.56 ms; 3 llamadas.
- Motivo: invariantes de preservación, carry, totals y contrato central conformes.

| # | comida | estado | target | actual | alimentos y cantidades | remaining antes → después |
|---:|---|---|---|---|---|---|
| 1 | desayuno | preserved/manual | 430 kcal / P30 / C45 / G12 | 165 kcal / P31 / C0 / G0 | Contenido manual-zero-macros 1 unidad | — |
| 2 | almuerzo | generated/RECOMMENDED | 668.7 kcal / P39.7 / C82 / G21.9 | 668.9 kcal / P41.2 / C85.6 / G18 | Aceite de coco 15 Grs + Anana 250 Grs + Arroz 80 Grs + Atun en lomitos al natural 1 Pote + Claras de huevos 1 Unid | 1835 kcal / P109 / C225 / G60 → 1166.1 kcal / P67.9 / C139.4 / G42 |
| 3 | merienda | generated/RECOMMENDED | 553.8 kcal / P32.2 / C66.2 / G20 | 559 kcal / P31 / C57 / G23 | Avena instantanea 100 Grs + Huevos 3 Unid | 1166.1 kcal / P67.9 / C139.4 / G42 → 607.1 kcal / P36.8 / C82.4 / G19 |
| 4 | cena | generated/RECOMMENDED | 607.1 kcal / P36.9 / C82.4 / G19 | 603.5 kcal / P41.4 / C80.5 / G15.2 | Arroz integral (Cocido) 350 Grs + Churrasco magro 150 Grs | 607.1 kcal / P36.8 / C82.4 / G19 → 3.6 kcal / P-4.5 / C1.9 / G3.9 |

### other-option-seed-1 — PASS

- Propósito: Mismo input, seed distinto
- INPUT: 2000 kcal / P140 / C225 / G60; desayuno, almuerzo, merienda, cena; seed `daily-audit-option-1`.
- Preservadas: ninguna.
- Resultado diario: 1999.4 kcal / P139 / C273.2 / G41.2; diferencia actual-target -0.6 kcal / P-1 / C48.2 / G-18.8.
- Tiempo/solver: 2446.06 ms; 4 llamadas.
- Motivo: invariantes de preservación, carry, totals y contrato central conformes.

| # | comida | estado | target | actual | alimentos y cantidades | remaining antes → después |
|---:|---|---|---|---|---|---|
| 1 | desayuno | generated/RECOMMENDED | 497.6 kcal / P34.8 / C56 / G14.9 | 506.8 kcal / P34.4 / C64.4 / G12.4 | Claras de huevos 7 Unid + Galletitas de agua 90 Grs | 2000 kcal / P140 / C225 / G60 → 1493.2 kcal / P105.6 / C160.6 / G47.6 |
| 2 | almuerzo | generated/RECOMMENDED | 553.7 kcal / P39.2 / C59.6 / G17.7 | 549.3 kcal / P39.9 / C71.3 / G13.9 | Arroz integral 95 Grs + Churrasco magro 150 Grs | 1493.2 kcal / P105.6 / C160.6 / G47.6 → 944 kcal / P65.8 / C89.4 / G33.7 |
| 3 | merienda | generated/RECOMMENDED | 496 kcal / P34.6 / C47 / G17.7 | 499.5 kcal / P36.5 / C58 / G13.5 | Avena instantanea 100 Grs + Claras de huevos 5 Unid + Huevos 1 Unid | 944 kcal / P65.8 / C89.4 / G33.7 → 444.5 kcal / P29.3 / C31.3 / G20.2 |
| 4 | cena | generated/BEST_EFFORT | 444.5 kcal / P29.3 / C31.4 / G20.2 | 443.9 kcal / P28.3 / C79.5 / G1.4 | Arroz (Cocido) 270 Grs + Claras de huevos 6 Unid | 444.5 kcal / P29.3 / C31.3 / G20.2 → 0.6 kcal / P1 / C-48.1 / G18.8 |

### other-option-seed-2 — PASS

- Propósito: Mismo input, seed distinto
- INPUT: 2000 kcal / P140 / C225 / G60; desayuno, almuerzo, merienda, cena; seed `daily-audit-option-2`.
- Preservadas: ninguna.
- Resultado diario: 2000 kcal / P138.9 / C271.4 / G39.9; diferencia actual-target 0 kcal / P-1.1 / C46.4 / G-20.1.
- Tiempo/solver: 2492.74 ms; 4 llamadas.
- Motivo: invariantes de preservación, carry, totals y contrato central conformes.

| # | comida | estado | target | actual | alimentos y cantidades | remaining antes → después |
|---:|---|---|---|---|---|---|
| 1 | desayuno | generated/RECOMMENDED | 551.1 kcal / P38.6 / C62 / G16.5 | 556.3 kcal / P38.3 / C70.3 / G13.5 | Galletitas de agua 100 Grs + Whey protein Isolate 30 Grs | 2000 kcal / P140 / C225 / G60 → 1443.7 kcal / P101.7 / C154.7 / G46.5 |
| 2 | almuerzo | generated/RECOMMENDED | 486.2 kcal / P34.3 / C52.1 / G15.7 | 485.5 kcal / P38.4 / C58 / G11.1 | Arroz (Cocido) 200 Grs + Carne de cerdo magro 150 Grs | 1443.7 kcal / P101.7 / C154.7 / G46.5 → 958.2 kcal / P63.3 / C96.7 / G35.4 |
| 3 | merienda | generated/RECOMMENDED | 495.6 kcal / P32.7 / C50 / G18.3 | 501.4 kcal / P33.7 / C60.7 / G13.8 | Avena instantanea 105 Grs + Claras de huevos 4 Unid + Huevos 1 Unid | 958.2 kcal / P63.3 / C96.7 / G35.4 → 456.8 kcal / P29.7 / C36 / G21.6 |
| 4 | cena | generated/BEST_EFFORT | 456.8 kcal / P29.7 / C36.1 / G21.6 | 456.8 kcal / P28.6 / C82.4 / G1.4 | Arroz (Cocido) 280 Grs + Claras de huevos 6 Unid | 456.8 kcal / P29.7 / C36 / G21.6 → 0 kcal / P1.1 / C-46.4 / G20.1 |

### other-option-seed-3 — PASS

- Propósito: Mismo input, seed distinto
- INPUT: 2000 kcal / P140 / C225 / G60; desayuno, almuerzo, merienda, cena; seed `daily-audit-option-3`.
- Preservadas: ninguna.
- Resultado diario: 2004 kcal / P141.3 / C229.1 / G59.8; diferencia actual-target 4 kcal / P1.3 / C4.1 / G-0.2.
- Tiempo/solver: 2445.25 ms; 4 llamadas.
- Motivo: invariantes de preservación, carry, totals y contrato central conformes.

| # | comida | estado | target | actual | alimentos y cantidades | remaining antes → después |
|---:|---|---|---|---|---|---|
| 1 | desayuno | generated/RECOMMENDED | 485.6 kcal / P34 / C54.6 / G14.6 | 484.3 kcal / P33.6 / C49.1 / G17.1 | Avena instantanea 85 Grs + Claras de huevos 3 Unid + Huevos 2 Unid | 2000 kcal / P140 / C225 / G60 → 1515.7 kcal / P106.5 / C176 / G42.9 |
| 2 | almuerzo | generated/RECOMMENDED | 470 kcal / P33 / C54.6 / G13.3 | 470.9 kcal / P32.6 / C63.8 / G11.3 | Arroz integral 85 Grs + Churrasco magro 120 Grs | 1515.7 kcal / P106.5 / C176 / G42.9 → 1044.8 kcal / P73.9 / C112.2 / G31.6 |
| 3 | merienda | generated/RECOMMENDED | 532.2 kcal / P37.6 / C57.2 / G16.1 | 529 kcal / P40 / C67.3 / G11.1 | Almendras 2 Unid + Avena instantanea 115 Grs + Claras de huevos 7 Unid | 1044.8 kcal / P73.9 / C112.2 / G31.6 → 515.8 kcal / P33.9 / C44.9 / G20.5 |
| 4 | cena | generated/RECOMMENDED | 515.8 kcal / P33.9 / C44.9 / G20.5 | 519.8 kcal / P35.2 / C49.1 / G20.3 | Aceite de coco 20 Grs + Arroz 65 Grs + Atun en lomitos al natural 1 Pote | 515.8 kcal / P33.9 / C44.9 / G20.5 → -4 kcal / P-1.3 / C-4.1 / G0.2 |

### other-option-seed-4 — PASS

- Propósito: Mismo input, seed distinto
- INPUT: 2000 kcal / P140 / C225 / G60; desayuno, almuerzo, merienda, cena; seed `daily-audit-option-4`.
- Preservadas: ninguna.
- Resultado diario: 1996.1 kcal / P139.2 / C232.7 / G58.6; diferencia actual-target -3.9 kcal / P-0.8 / C7.7 / G-1.4.
- Tiempo/solver: 2409.72 ms; 4 llamadas.
- Motivo: invariantes de preservación, carry, totals y contrato central conformes.

| # | comida | estado | target | actual | alimentos y cantidades | remaining antes → después |
|---:|---|---|---|---|---|---|
| 1 | desayuno | generated/RECOMMENDED | 522.8 kcal / P36.6 / C58.8 / G15.7 | 515 kcal / P33.2 / C66.8 / G12.8 | Galletitas de agua 95 Grs + Whey protein Isolate 25 Grs | 2000 kcal / P140 / C225 / G60 → 1485 kcal / P106.8 / C158.3 / G47.2 |
| 2 | almuerzo | generated/RECOMMENDED | 482 kcal / P34.7 / C51.4 / G15.3 | 473.1 kcal / P36.5 / C60.4 / G11.6 | Arroz 80 Grs + Churrasco magro 140 Grs | 1485 kcal / P106.8 / C158.3 / G47.2 → 1011.9 kcal / P70.3 / C97.9 / G35.6 |
| 3 | merienda | generated/RECOMMENDED | 505.1 kcal / P35.1 / C48.8 / G17.8 | 505.1 kcal / P34.7 / C60.2 / G14 | Almendras 2 Unid + Anana 120 Grs + Avena instantanea 75 Grs + Claras de huevos 5 Unid + Copos de maiz sin azucar 5 Grs + Huevos 1 Unid | 1011.9 kcal / P70.3 / C97.9 / G35.6 → 506.8 kcal / P35.6 / C37.6 / G21.7 |
| 4 | cena | generated/RECOMMENDED | 506.8 kcal / P35.6 / C37.7 / G21.7 | 502.9 kcal / P34.8 / C45.3 / G20.3 | Aceite de coco 20 Grs + Arroz 60 Grs + Atun en lomitos al natural 1 Pote | 506.8 kcal / P35.6 / C37.6 / G21.7 → 3.9 kcal / P0.8 / C-7.7 / G1.4 |

### other-option-seed-5 — PASS

- Propósito: Mismo input, seed distinto
- INPUT: 2000 kcal / P140 / C225 / G60; desayuno, almuerzo, merienda, cena; seed `daily-audit-option-5`.
- Preservadas: ninguna.
- Resultado diario: 2003.7 kcal / P143.4 / C237 / G57.8; diferencia actual-target 3.7 kcal / P3.4 / C12 / G-2.2.
- Tiempo/solver: 1865.78 ms; 4 llamadas.
- Motivo: invariantes de preservación, carry, totals y contrato central conformes.

| # | comida | estado | target | actual | alimentos y cantidades | remaining antes → después |
|---:|---|---|---|---|---|---|
| 1 | desayuno | generated/RECOMMENDED | 558.7 kcal / P39.1 / C62.9 / G16.8 | 564.9 kcal / P39.7 / C74.9 / G11.9 | Almendras 3 Unid + Anana 90 Grs + Avena instantanea 105 Grs + Claras de huevos 7 Unid + Copos de maiz sin azucar 5 Grs | 2000 kcal / P140 / C225 / G60 → 1435.1 kcal / P100.3 / C150.1 / G48.1 |
| 2 | almuerzo | generated/RECOMMENDED | 511.2 kcal / P35.7 / C53.5 / G17.2 | 501.7 kcal / P38.2 / C63.8 / G12.7 | Arroz (Cocido) 220 Grs + Churrasco magro 150 Grs | 1435.1 kcal / P100.3 / C150.1 / G48.1 → 933.4 kcal / P62.1 / C86.3 / G35.5 |
| 3 | merienda | generated/RECOMMENDED | 507 kcal / P33.7 / C46.9 / G19.3 | 504.3 kcal / P31.9 / C45.8 / G21.5 | Avena instantanea 80 Grs + Claras de huevos 1 Unid + Huevos 3 Unid | 933.4 kcal / P62.1 / C86.3 / G35.5 → 429.1 kcal / P30.2 / C40.5 / G14 |
| 4 | cena | generated/RECOMMENDED | 429.1 kcal / P30.2 / C40.5 / G14 | 432.9 kcal / P33.6 / C52.5 / G11.8 | Arroz integral 70 Grs + Churrasco magro 130 Grs | 429.1 kcal / P30.2 / C40.5 / G14 → -3.7 kcal / P-3.4 / C-12 / G2.2 |

### other-option-seed-6 — PASS

- Propósito: Mismo input, seed distinto
- INPUT: 2000 kcal / P140 / C225 / G60; desayuno, almuerzo, merienda, cena; seed `daily-audit-option-6`.
- Preservadas: ninguna.
- Resultado diario: 2004.2 kcal / P143.3 / C236.4 / G56.2; diferencia actual-target 4.2 kcal / P3.3 / C11.4 / G-3.8.
- Tiempo/solver: 1833.69 ms; 4 llamadas.
- Motivo: invariantes de preservación, carry, totals y contrato central conformes.

| # | comida | estado | target | actual | alimentos y cantidades | remaining antes → después |
|---:|---|---|---|---|---|---|
| 1 | desayuno | generated/RECOMMENDED | 544.6 kcal / P38.1 / C61.3 / G16.3 | 548.6 kcal / P40.5 / C71 / G11.4 | Avena instantanea 120 Grs + Whey protein SN 30 Grs | 2000 kcal / P140 / C225 / G60 → 1451.4 kcal / P99.5 / C154 / G48.6 |
| 2 | almuerzo | generated/RECOMMENDED | 476.8 kcal / P32.7 / C50.6 / G16 | 475.8 kcal / P37.7 / C58 / G12.6 | Arroz (Cocido) 200 Grs + Churrasco magro 150 Grs | 1451.4 kcal / P99.5 / C154 / G48.6 → 975.6 kcal / P61.9 / C96 / G36 |
| 3 | merienda | generated/RECOMMENDED | 446.7 kcal / P28.3 / C44 / G16.5 | 453.4 kcal / P27.1 / C39.9 / G20.6 | Avena instantanea 70 Grs + Huevos 3 Unid | 975.6 kcal / P61.9 / C96 / G36 → 522.2 kcal / P34.8 / C56.1 / G15.4 |
| 4 | cena | generated/RECOMMENDED | 522.2 kcal / P34.8 / C56.1 / G15.4 | 526.4 kcal / P38 / C67.5 / G11.6 | Arroz integral 90 Grs + Carne de cerdo magro 140 Grs | 522.2 kcal / P34.8 / C56.1 / G15.4 → -4.2 kcal / P-3.2 / C-11.4 / G3.8 |

