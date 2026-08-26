# Auditoría funcional de generación automática diaria

Generado: 2026-08-26T01:45:07.183Z

## Seguridad y alcance

- Snapshot Mongo: 574 → 574 documentos.
- Lecturas directas: 2; escrituras: 0.
- Catálogo sin cambios: true; generation sin cambios: true.
- Integración: planner real del frontend → combinador existente → solver existente → meal_generation_balanced_v1.
- Este reporte calcula diferencias del día; no introduce una clasificación nutricional diaria nueva.

> Correccion de terminologia: el contador historicamente rotulado `solverCalls`/`Tiempo/solver` cuenta invocaciones al generador de una comida. Cada invocacion puede ejecutar 32 candidatos en una, dos o tres rondas del calculador de cantidades; no equivale a una sola ejecucion interna del solver.

## Resumen

- Casos: 30; PASS 29; FAIL 1.
- Invocaciones al generador de una comida: 111.
- Comidas centrales: RECOMMENDED 94; BEST_EFFORT 18.
- Repeticiones semánticas exactas (todos los casos): 0; matriz diaria: 0.
- Solapamientos altos (todos los casos): 1; matriz diaria: 1.

## Performance end-to-end

| comidas | muestras | promedio | p95 | máximo | invocaciones al generador |
|---:|---:|---:|---:|---:|---:|
| 3 | 3 | 1348.07 ms | 2095.32 ms | 2095.32 ms | 9 |
| 4 | 3 | 1603.79 ms | 1844.59 ms | 1844.59 ms | 12 |
| 5 | 3 | 1703.36 ms | 1944.15 ms | 1944.15 ms | 15 |
| 6 | 3 | 2205.81 ms | 2740.59 ms | 2740.59 ms | 18 |

## Diversidad por seed / otra opción

- Opciones: 6; fingerprints diarios distintos: 6; repeticiones: 0.
- Menús semánticos distintos (ignorando cantidades): 6; repeticiones semánticas: 0.
- La cobertura estructural P2/C2/V/F/G se valida por separado en foodCombinationCandidates y en el benchmark 1/10/32/40; este runner no altera el límite 32.

## Matriz y trazas

### daily-3-low-balanced — PASS

- Propósito: 3 comidas, low-balanced
- INPUT: 1500 kcal / P105 / C157.5 / G50; desayuno, almuerzo, cena; seed `daily-audit-3-low-balanced`.
- Preservadas: ninguna.
- Resultado diario: 1499.9 kcal / P106.2 / C181.2 / G39; diferencia actual-target -0.1 kcal / P1.2 / C23.7 / G-11.
- Diversidad interna: 3/3 composiciones únicas; exactas 0; solapamientos altos 0.
- Tiempo/generador: 2095.32 ms; 3 invocaciones de comida.
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
- Resultado diario: 2100.8 kcal / P142.1 / C258.3 / G58.5; diferencia actual-target 0.8 kcal / P2.1 / C19.5 / G-6.5.
- Diversidad interna: 3/3 composiciones únicas; exactas 0; solapamientos altos 0.
- Tiempo/generador: 984.36 ms; 3 invocaciones de comida.
- Motivo: invariantes de preservación, carry, totals y contrato central conformes.

| # | comida | estado | target | actual | alimentos y cantidades | remaining antes → después |
|---:|---|---|---|---|---|---|
| 1 | desayuno | generated/RECOMMENDED | 525 kcal / P35 / C59.7 / G16.3 | 519.5 kcal / P34.9 / C54.8 / G17.9 | Avena instantanea 95 Grs + Claras de huevos 3 Unid + Huevos 2 Unid | 2100 kcal / P140 / C238.8 / G65 → 1580.5 kcal / P105.2 / C184.1 / G47.1 |
| 2 | almuerzo | generated/RECOMMENDED | 842.9 kcal / P56.1 / C98.2 / G25.1 | 839.1 kcal / P54.8 / C102 / G23.5 | Aceite de coco 20 Grs + Anana 220 Grs + Arroz 90 Grs + Atun en lomitos al natural 1 Pote + Berenjena 250 Grs + Claras de huevos 4 Unid | 1580.5 kcal / P105.2 / C184.1 / G47.1 → 741.4 kcal / P50.3 / C82.1 / G23.6 |
| 3 | cena | generated/BEST_EFFORT | 741.4 kcal / P50.3 / C82.1 / G23.6 | 742.3 kcal / P52.5 / C101.5 / G17.1 | Arroz (Cocido) 350 Grs + Churrasco magro 200 Grs | 741.4 kcal / P50.3 / C82.1 / G23.6 → -0.8 kcal / P-2.1 / C-19.4 / G6.5 |

### daily-3-high-protein — PASS

- Propósito: 3 comidas, high-protein
- INPUT: 1800 kcal / P180 / C146.3 / G55; desayuno, almuerzo, cena; seed `daily-audit-3-high-protein`.
- Preservadas: ninguna.
- Resultado diario: 1795.4 kcal / P175.7 / C150 / G54.7; diferencia actual-target -4.6 kcal / P-4.3 / C3.7 / G-0.3.
- Diversidad interna: 3/3 composiciones únicas; exactas 0; solapamientos altos 0.
- Tiempo/generador: 964.53 ms; 3 invocaciones de comida.
- Motivo: invariantes de preservación, carry, totals y contrato central conformes.

| # | comida | estado | target | actual | alimentos y cantidades | remaining antes → después |
|---:|---|---|---|---|---|---|
| 1 | desayuno | generated/RECOMMENDED | 609.6 kcal / P61 / C49.5 / G18.6 | 614.2 kcal / P56.4 / C47.2 / G22.2 | Avena instantanea 80 Grs + Claras de huevos 8 Unid + Huevos 3 Unid | 1800 kcal / P180 / C146.3 / G55 → 1185.8 kcal / P123.6 / C99.1 / G32.8 |
| 2 | almuerzo | generated/RECOMMENDED | 620 kcal / P64.6 / C51.8 / G17.2 | 620.6 kcal / P60.7 / C50.6 / G19.5 | Arroz integral (Cocido) 220 Grs + Carne de cerdo magro 250 Grs | 1185.8 kcal / P123.6 / C99.1 / G32.8 → 565.2 kcal / P62.9 / C48.5 / G13.3 |
| 3 | cena | generated/RECOMMENDED | 565.2 kcal / P62.9 / C48.5 / G13.3 | 560.6 kcal / P58.6 / C52.2 / G13 | Arroz (Cocido) 180 Grs + Bola de lomo 250 Grs | 565.2 kcal / P62.9 / C48.5 / G13.3 → 4.6 kcal / P4.3 / C-3.7 / G0.3 |

### daily-4-low-custom — PASS

- Propósito: 4 comidas, low-custom
- INPUT: 1700 kcal / P120 / C181.3 / G55; desayuno, almuerzo, merienda, cena; seed `daily-audit-4-low-custom`.
- Preservadas: ninguna.
- Resultado diario: 1700.8 kcal / P119.4 / C191.1 / G51; diferencia actual-target 0.8 kcal / P-0.6 / C9.8 / G-4.
- Diversidad interna: 4/4 composiciones únicas; exactas 0; solapamientos altos 0.
- Tiempo/generador: 1291.8 ms; 4 invocaciones de comida.
- Motivo: invariantes de preservación, carry, totals y contrato central conformes.

| # | comida | estado | target | actual | alimentos y cantidades | remaining antes → después |
|---:|---|---|---|---|---|---|
| 1 | desayuno | generated/RECOMMENDED | 340 kcal / P24 / C36.3 / G11 | 341.4 kcal / P24.8 / C42.2 / G8.2 | Galletitas de agua 60 Grs + Whey protein Isolate 20 Grs | 1700 kcal / P120 / C181.3 / G55 → 1358.6 kcal / P95.2 / C139.1 / G46.8 |
| 2 | almuerzo | generated/RECOMMENDED | 594.4 kcal / P41.7 / C60.9 / G20.5 | 594.1 kcal / P40.8 / C70.9 / G16.4 | Aceite de coco 15 Grs + Anana 80 Grs + Arroz 80 Grs + Atun en lomitos al natural 1 Pote + Berenjena 50 Grs + Claras de huevos 1 Unid | 1358.6 kcal / P95.2 / C139.1 / G46.8 → 764.5 kcal / P54.4 / C68.3 / G30.4 |
| 3 | merienda | generated/RECOMMENDED | 339.8 kcal / P24.2 / C30.3 / G13.5 | 339.1 kcal / P21.8 / C25.5 / G16.7 | Huevos 3 Unid + Pan 50 Grs | 764.5 kcal / P54.4 / C68.3 / G30.4 → 425.4 kcal / P32.6 / C42.8 / G13.8 |
| 4 | cena | generated/RECOMMENDED | 425.4 kcal / P32.6 / C42.8 / G13.8 | 426.2 kcal / P32 / C52.5 / G9.8 | Arroz integral 70 Grs + Carne de cerdo magro 120 Grs | 425.4 kcal / P32.6 / C42.8 / G13.8 → -0.8 kcal / P0.6 / C-9.7 / G4 |

### daily-4-medium-balanced — PASS

- Propósito: 4 comidas, medium-balanced
- INPUT: 2000 kcal / P140 / C225 / G60; desayuno, almuerzo, merienda, cena; seed `daily-audit-4-medium-balanced`.
- Preservadas: ninguna.
- Resultado diario: 2000.1 kcal / P141.5 / C256.1 / G45.5; diferencia actual-target 0.1 kcal / P1.5 / C31.1 / G-14.5.
- Diversidad interna: 4/4 composiciones únicas; exactas 0; solapamientos altos 0.
- Tiempo/generador: 1674.97 ms; 4 invocaciones de comida.
- Motivo: invariantes de preservación, carry, totals y contrato central conformes.

| # | comida | estado | target | actual | alimentos y cantidades | remaining antes → después |
|---:|---|---|---|---|---|---|
| 1 | desayuno | generated/RECOMMENDED | 499 kcal / P34.9 / C56.1 / G15 | 499 kcal / P33.2 / C59.1 / G14.4 | Almendras 1 Unid + Anana 80 Grs + Avena instantanea 30 Grs + Claras de huevos 4 Unid + Copos de maiz sin azucar 40 Grs + Huevos 2 Unid | 2000 kcal / P140 / C225 / G60 → 1501 kcal / P106.8 / C165.9 / G45.6 |
| 2 | almuerzo | generated/RECOMMENDED | 558.9 kcal / P39.8 / C61.8 / G17 | 559 kcal / P40.6 / C71.3 / G12.4 | Arroz integral 95 Grs + Carne de cerdo magro 150 Grs | 1501 kcal / P106.8 / C165.9 / G45.6 → 942 kcal / P66.2 / C94.6 / G33.2 |
| 3 | merienda | generated/RECOMMENDED | 493.8 kcal / P34.7 / C49.6 / G17.4 | 500.1 kcal / P37.9 / C59.1 / G12.5 | Galletitas de agua 80 Grs + Whey protein SN 35 Grs | 942 kcal / P66.2 / C94.6 / G33.2 → 441.9 kcal / P28.3 / C35.6 / G20.7 |
| 4 | cena | generated/BEST_EFFORT | 441.9 kcal / P28.4 / C35.6 / G20.7 | 442 kcal / P29.9 / C66.7 / G6.2 | Arroz (Cocido) 230 Grs + Bola de lomo 110 Grs | 441.9 kcal / P28.3 / C35.6 / G20.7 → -0.1 kcal / P-1.5 / C-31.1 / G14.5 |

### daily-4-high-balanced — PASS

- Propósito: 4 comidas, high-balanced
- INPUT: 2400 kcal / P165 / C266.3 / G75; desayuno, almuerzo, merienda, cena; seed `daily-audit-4-high-balanced`.
- Preservadas: ninguna.
- Resultado diario: 2402.2 kcal / P161.6 / C273.1 / G76.3; diferencia actual-target 2.2 kcal / P-3.4 / C6.8 / G1.3.
- Diversidad interna: 4/4 composiciones únicas; exactas 0; solapamientos altos 0.
- Tiempo/generador: 1844.59 ms; 4 invocaciones de comida.
- Motivo: invariantes de preservación, carry, totals y contrato central conformes.

| # | comida | estado | target | actual | alimentos y cantidades | remaining antes → después |
|---:|---|---|---|---|---|---|
| 1 | desayuno | generated/RECOMMENDED | 546.7 kcal / P37.6 / C60.7 / G17.1 | 552.3 kcal / P38.5 / C66.6 / G14.7 | Avena instantanea 115 Grs + Claras de huevos 5 Unid + Huevos 1 Unid | 2400 kcal / P165 / C266.3 / G75 → 1847.7 kcal / P126.6 / C199.8 / G60.3 |
| 2 | almuerzo | generated/RECOMMENDED | 642.4 kcal / P44 / C69.4 / G21 | 632.4 kcal / P45.7 / C80.5 / G16.8 | Arroz integral (Cocido) 350 Grs + Churrasco magro 170 Grs | 1847.7 kcal / P126.6 / C199.8 / G60.3 → 1215.3 kcal / P80.9 / C119.3 / G43.6 |
| 3 | merienda | generated/BEST_EFFORT | 554.1 kcal / P36.9 / C54.4 / G19.9 | 556.3 kcal / P38.3 / C70.3 / G13.5 | Galletitas de agua 100 Grs + Whey protein Isolate 30 Grs | 1215.3 kcal / P80.9 / C119.3 / G43.6 → 659 kcal / P42.6 / C48.9 / G30 |
| 4 | cena | generated/RECOMMENDED | 659 kcal / P42.6 / C49 / G30 | 661.3 kcal / P39.2 / C55.8 / G31.3 | Aceite de coco 30 Grs + Anana 80 Grs + Arroz 60 Grs + Atun en lomitos al natural 1 Pote + Berenjena 50 Grs + Claras de huevos 1 Unid | 659 kcal / P42.6 / C48.9 / G30 → -2.2 kcal / P3.4 / C-6.8 / G-1.3 |

### daily-5-low-balanced — PASS

- Propósito: 5 comidas, low-balanced
- INPUT: 1900 kcal / P135 / C205 / G60; desayuno, almuerzo, merienda, cena, snack; seed `daily-audit-5-low-balanced`.
- Preservadas: ninguna.
- Resultado diario: 1898.1 kcal / P136.3 / C214.7 / G56.1; diferencia actual-target -1.9 kcal / P1.3 / C9.7 / G-3.9.
- Diversidad interna: 5/5 composiciones únicas; exactas 0; solapamientos altos 0.
- Tiempo/generador: 1944.15 ms; 5 invocaciones de comida.
- Motivo: invariantes de preservación, carry, totals y contrato central conformes.

| # | comida | estado | target | actual | alimentos y cantidades | remaining antes → después |
|---:|---|---|---|---|---|---|
| 1 | desayuno | generated/RECOMMENDED | 402.2 kcal / P28.6 / C43.4 / G12.7 | 402.5 kcal / P29.5 / C52.5 / G8.3 | Almendras 1 Unid + Avena instantanea 90 Grs + Claras de huevos 5 Unid | 1900 kcal / P135 / C205 / G60 → 1497.6 kcal / P105.5 / C152.5 / G51.7 |
| 2 | almuerzo | generated/RECOMMENDED | 368.4 kcal / P26 / C37.5 / G12.7 | 368 kcal / P25.3 / C48.3 / G8.2 | Arroz integral (Cocido) 210 Grs + Carne de cerdo magro 90 Grs | 1497.6 kcal / P105.5 / C152.5 / G51.7 → 1129.6 kcal / P80.3 / C104.2 / G43.5 |
| 3 | merienda | generated/RECOMMENDED | 361.7 kcal / P25.7 / C33.4 / G13.9 | 369.8 kcal / P27.4 / C44.2 / G9.3 | Galletitas de agua 60 Grs + Whey protein SN 25 Grs | 1129.6 kcal / P80.3 / C104.2 / G43.5 → 759.8 kcal / P52.9 / C60.1 / G34.2 |
| 4 | cena | generated/BEST_EFFORT | 360.2 kcal / P25.1 / C28.5 / G16.2 | 360.6 kcal / P22.8 / C52.5 / G7.8 | Arroz integral 70 Grs + Churrasco magro 80 Grs | 759.8 kcal / P52.9 / C60.1 / G34.2 → 399.2 kcal / P30.1 / C7.6 / G26.4 |
| 5 | snack | generated/RECOMMENDED | 399.2 kcal / P30.1 / C7.6 / G26.4 | 397.3 kcal / P31.4 / C17.3 / G22.5 | Avena instantanea 30 Grs + Claras de huevos 1 Unid + Huevos 4 Unid | 399.2 kcal / P30.1 / C7.6 / G26.4 → 1.9 kcal / P-1.3 / C-9.7 / G3.9 |

### daily-5-medium-custom — PASS

- Propósito: 5 comidas, medium-custom
- INPUT: 2300 kcal / P170 / C247.5 / G70; desayuno, almuerzo, merienda, cena, snack; seed `daily-audit-5-medium-custom`.
- Preservadas: ninguna.
- Resultado diario: 2300.6 kcal / P169.4 / C259.2 / G68; diferencia actual-target 0.6 kcal / P-0.6 / C11.7 / G-2.
- Diversidad interna: 5/5 composiciones únicas; exactas 0; solapamientos altos 0.
- Tiempo/generador: 1596.46 ms; 5 invocaciones de comida.
- Motivo: invariantes de preservación, carry, totals y contrato central conformes.

| # | comida | estado | target | actual | alimentos y cantidades | remaining antes → después |
|---:|---|---|---|---|---|---|
| 1 | desayuno | generated/RECOMMENDED | 345 kcal / P25.5 / C37.1 / G10.5 | 344.9 kcal / P25 / C37.7 / G10.5 | Avena instantanea 65 Grs + Claras de huevos 3 Unid + Huevos 1 Unid | 2300 kcal / P170 / C247.5 / G70 → 1955.1 kcal / P145.1 / C209.9 / G59.5 |
| 2 | almuerzo | generated/RECOMMENDED | 575 kcal / P42.7 / C61.7 / G17.5 | 574.1 kcal / P42.8 / C71.3 / G13.1 | Arroz integral 95 Grs + Carne de cerdo magro 160 Grs | 1955.1 kcal / P145.1 / C209.9 / G59.5 → 1381 kcal / P102.3 / C138.6 / G46.4 |
| 3 | merienda | generated/RECOMMENDED | 460.3 kcal / P34.1 / C46.2 / G15.5 | 457 kcal / P33.2 / C55.1 / G11.6 | Galletitas de agua 75 Grs + Whey protein SN 30 Grs | 1381 kcal / P102.3 / C138.6 / G46.4 → 924 kcal / P69.1 / C83.5 / G34.8 |
| 4 | cena | generated/RECOMMENDED | 577.5 kcal / P43.2 / C52.2 / G21.8 | 572.9 kcal / P47.9 / C62.1 / G17.6 | Arroz integral (Cocido) 270 Grs + Churrasco magro 190 Grs | 924 kcal / P69.1 / C83.5 / G34.8 → 351.1 kcal / P21.2 / C21.4 / G17.2 |
| 5 | snack | generated/RECOMMENDED | 351.1 kcal / P21.2 / C21.4 / G17.2 | 351.7 kcal / P20.6 / C33.1 / G15.2 | Copos de maiz sin azucar 40 Grs + Huevos 3 Unid | 351.1 kcal / P21.2 / C21.4 / G17.2 → -0.6 kcal / P0.6 / C-11.7 / G2 |

### daily-5-high-balanced — PASS

- Propósito: 5 comidas, high-balanced
- INPUT: 2800 kcal / P195 / C313.8 / G85; desayuno, almuerzo, merienda, cena, snack; seed `daily-audit-5-high-balanced`.
- Preservadas: ninguna.
- Resultado diario: 2797.7 kcal / P195.3 / C311.1 / G88.2; diferencia actual-target -2.3 kcal / P0.3 / C-2.7 / G3.2.
- Diversidad interna: 5/5 composiciones únicas; exactas 0; solapamientos altos 1.
- Tiempo/generador: 1569.48 ms; 5 invocaciones de comida.
- Motivo: invariantes de preservación, carry, totals y contrato central conformes.

| # | comida | estado | target | actual | alimentos y cantidades | remaining antes → después |
|---:|---|---|---|---|---|---|
| 1 | desayuno | generated/RECOMMENDED | 549.8 kcal / P38.3 / C61.6 / G16.7 | 549.9 kcal / P38.9 / C55 / G19.4 | Almendras 1 Unid + Anana 80 Grs + Avena instantanea 30 Grs + Claras de huevos 4 Unid + Copos de maiz sin azucar 35 Grs + Huevos 3 Unid | 2800 kcal / P195 / C313.8 / G85 → 2250.1 kcal / P156.1 / C258.8 / G65.6 |
| 2 | almuerzo | generated/RECOMMENDED | 584.6 kcal / P40.6 / C67.2 / G17.1 | 584.8 kcal / P42.7 / C73.6 / G15.7 | Arroz integral (Cocido) 320 Grs + Churrasco magro 160 Grs | 2250.1 kcal / P156.1 / C258.8 / G65.6 → 1665.3 kcal / P113.4 / C185.2 / G49.9 |
| 3 | merienda | generated/RECOMMENDED | 535.8 kcal / P36.5 / C59.6 / G16.1 | 534.2 kcal / P37.8 / C66.8 / G12.9 | Galletitas de agua 95 Grs + Whey protein Isolate 30 Grs | 1665.3 kcal / P113.4 / C185.2 / G49.9 → 1131 kcal / P75.7 / C118.4 / G37 |
| 4 | cena | generated/RECOMMENDED | 540.6 kcal / P36.2 / C56.6 / G17.7 | 535.9 kcal / P40.3 / C64.4 / G13 | Arroz integral (Cocido) 280 Grs + Carne de cerdo magro 150 Grs | 1131 kcal / P75.7 / C118.4 / G37 → 595.1 kcal / P35.4 / C54 / G24 |
| 5 | snack | generated/RECOMMENDED | 595.1 kcal / P35.4 / C54 / G24 | 592.8 kcal / P35.7 / C51.3 / G27.2 | Avena instantanea 90 Grs + Huevos 4 Unid | 595.1 kcal / P35.4 / C54 / G24 → 2.3 kcal / P-0.3 / C2.7 / G-3.2 |

### daily-6-low-custom — PASS

- Propósito: 6 comidas, low-custom
- INPUT: 2200 kcal / P150 / C242.5 / G70; desayuno, colacion, almuerzo, merienda, cena, snack; seed `daily-audit-6-low-custom`.
- Preservadas: ninguna.
- Resultado diario: 2201.5 kcal / P152.4 / C241.9 / G71.2; diferencia actual-target 1.5 kcal / P2.4 / C-0.6 / G1.2.
- Diversidad interna: 6/6 composiciones únicas; exactas 0; solapamientos altos 0.
- Tiempo/generador: 1948.68 ms; 6 invocaciones de comida.
- Motivo: invariantes de preservación, carry, totals y contrato central conformes.

| # | comida | estado | target | actual | alimentos y cantidades | remaining antes → después |
|---:|---|---|---|---|---|---|
| 1 | desayuno | generated/RECOMMENDED | 330 kcal / P22.5 / C36.4 / G10.5 | 329.2 kcal / P20.6 / C47.5 / G6.3 | Avena instantanea 75 Grs + Claras de huevos 3 Unid + Copos de maiz sin azucar 5 Grs | 2200 kcal / P150 / C242.5 / G70 → 1870.8 kcal / P129.4 / C195 / G63.7 |
| 2 | colacion | generated/RECOMMENDED | 330.1 kcal / P22.8 / C34.4 / G11.2 | 326.7 kcal / P22.7 / C40.2 / G8.4 | Galletitas de agua 55 Grs + Whey protein SN 20 Grs | 1870.8 kcal / P129.4 / C195 / G63.7 → 1544.1 kcal / P106.8 / C154.8 / G55.3 |
| 3 | almuerzo | generated/RECOMMENDED | 441.2 kcal / P30.5 / C44.2 / G15.8 | 438.6 kcal / P32 / C55.2 / G11.8 | Arroz integral (Cocido) 240 Grs + Churrasco magro 120 Grs | 1544.1 kcal / P106.8 / C154.8 / G55.3 → 1105.5 kcal / P74.7 / C99.6 / G43.6 |
| 4 | merienda | generated/RECOMMENDED | 331.7 kcal / P22.4 / C29.9 / G13.1 | 330.4 kcal / P22 / C23.9 / G16.4 | Huevos 3 Unid + Pan baguette 45 Grs | 1105.5 kcal / P74.7 / C99.6 / G43.6 → 775.1 kcal / P52.8 / C75.7 / G27.2 |
| 5 | cena | generated/RECOMMENDED | 442.9 kcal / P30.2 / C43.3 / G15.6 | 446.4 kcal / P32.6 / C55.2 / G10.6 | Arroz integral (Cocido) 240 Grs + Carne de cerdo magro 120 Grs | 775.1 kcal / P52.8 / C75.7 / G27.2 → 328.7 kcal / P20.1 / C20.5 / G16.7 |
| 6 | snack | generated/RECOMMENDED | 328.7 kcal / P20.1 / C20.5 / G16.7 | 330.2 kcal / P22.6 / C20 / G17.8 | Avena instantanea 35 Grs + Huevos 3 Unid | 328.7 kcal / P20.1 / C20.5 / G16.7 → -1.5 kcal / P-2.4 / C0.6 / G-1.2 |

### daily-6-medium-balanced — PASS

- Propósito: 6 comidas, medium-balanced
- INPUT: 2600 kcal / P190 / C280 / G80; desayuno, colacion, almuerzo, merienda, cena, snack; seed `daily-audit-6-medium-balanced`.
- Preservadas: ninguna.
- Resultado diario: 2600 kcal / P189.7 / C339.9 / G55.3; diferencia actual-target 0 kcal / P-0.3 / C59.9 / G-24.7.
- Diversidad interna: 6/6 composiciones únicas; exactas 0; solapamientos altos 0.
- Tiempo/generador: 2740.59 ms; 6 invocaciones de comida.
- Motivo: invariantes de preservación, carry, totals y contrato central conformes.

| # | comida | estado | target | actual | alimentos y cantidades | remaining antes → después |
|---:|---|---|---|---|---|---|
| 1 | desayuno | generated/RECOMMENDED | 402.9 kcal / P29.4 / C43.4 / G12.4 | 404.8 kcal / P30.5 / C49.3 / G9.5 | Galletitas de agua 70 Grs + Whey protein Isolate 25 Grs | 2600 kcal / P190 / C280 / G80 → 2195.3 kcal / P159.6 / C230.8 / G70.5 |
| 2 | colacion | generated/RECOMMENDED | 446.2 kcal / P32.4 / C46.9 / G14.3 | 446.1 kcal / P32.1 / C44.1 / G15.7 | Almendras 1 Unid + Anana 190 Grs + Avena instantanea 35 Grs + Claras de huevos 4 Unid + Copos de maiz sin azucar 5 Grs + Huevos 2 Unid | 2195.3 kcal / P159.6 / C230.8 / G70.5 → 1749.1 kcal / P127.5 / C186.7 / G54.7 |
| 3 | almuerzo | generated/RECOMMENDED | 412 kcal / P30 / C44 / G12.9 | 412.2 kcal / P29.3 / C55.1 / G8.3 | Arroz (Cocido) 190 Grs + Carne de cerdo magro 110 Grs | 1749.1 kcal / P127.5 / C186.7 / G54.7 → 1337 kcal / P98.1 / C131.6 / G46.4 |
| 4 | merienda | generated/BEST_EFFORT | 459.8 kcal / P33.8 / C45.3 / G16 | 461.7 kcal / P32.2 / C71.1 / G5.4 | Pan baguette 130 Grs + Whey protein SN 25 Grs | 1337 kcal / P98.1 / C131.6 / G46.4 → 875.3 kcal / P65.9 / C60.5 / G41 |
| 5 | cena | generated/BEST_EFFORT | 449.8 kcal / P33.9 / C31.1 / G21.1 | 449.7 kcal / P32.3 / C57.5 / G11.9 | Arroz integral (Cocido) 250 Grs + Churrasco magro 120 Grs | 875.3 kcal / P65.9 / C60.5 / G41 → 425.7 kcal / P33.6 / C3 / G29.2 |
| 6 | snack | generated/BEST_EFFORT | 425.7 kcal / P33.6 / C3 / G29.2 | 425.7 kcal / P33.4 / C63 / G4.5 | Claras de huevos 7 Unid + Galletas de arroz 1 Unid + Pan 105 Grs | 425.7 kcal / P33.6 / C3 / G29.2 → 0 kcal / P0.3 / C-59.9 / G24.7 |

### daily-6-high-balanced — PASS

- Propósito: 6 comidas, high-balanced
- INPUT: 3000 kcal / P210 / C337.5 / G90; desayuno, colacion, almuerzo, merienda, cena, snack; seed `daily-audit-6-high-balanced`.
- Preservadas: ninguna.
- Resultado diario: 3001.6 kcal / P207.6 / C340.2 / G92.3; diferencia actual-target 1.6 kcal / P-2.4 / C2.7 / G2.3.
- Diversidad interna: 6/6 composiciones únicas; exactas 0; solapamientos altos 0.
- Tiempo/generador: 1928.16 ms; 6 invocaciones de comida.
- Motivo: invariantes de preservación, carry, totals y contrato central conformes.

| # | comida | estado | target | actual | alimentos y cantidades | remaining antes → después |
|---:|---|---|---|---|---|---|
| 1 | desayuno | generated/RECOMMENDED | 487.9 kcal / P34.2 / C54.9 / G14.6 | 488.1 kcal / P34.7 / C65.2 / G9.9 | Almendras 3 Unid + Anana 250 Grs + Avena instantanea 60 Grs + Claras de huevos 7 Unid + Copos de maiz sin azucar 5 Grs | 3000 kcal / P210 / C337.5 / G90 → 2511.9 kcal / P175.3 / C272.3 / G80.1 |
| 2 | colacion | generated/RECOMMENDED | 494 kcal / P34.5 / C53.6 / G15.8 | 493 kcal / P32.7 / C63.3 / G12.1 | Galletitas de agua 90 Grs + Whey protein Isolate 25 Grs | 2511.9 kcal / P175.3 / C272.3 / G80.1 → 2018.9 kcal / P142.7 / C209 / G68 |
| 3 | almuerzo | generated/RECOMMENDED | 529.3 kcal / P37.4 / C54.8 / G17.8 | 526.2 kcal / P39.5 / C64.4 / G14.5 | Arroz integral (Cocido) 280 Grs + Churrasco magro 150 Grs | 2018.9 kcal / P142.7 / C209 / G68 → 1492.8 kcal / P103.2 / C144.6 / G53.5 |
| 4 | merienda | generated/RECOMMENDED | 469.5 kcal / P32.5 / C45.5 / G16.8 | 465.3 kcal / P28 / C48.3 / G17.8 | Huevos 3 Unid + Pan artesano bimbo 3 Reb | 1492.8 kcal / P103.2 / C144.6 / G53.5 → 1027.4 kcal / P75.2 / C96.3 / G35.7 |
| 5 | cena | generated/RECOMMENDED | 486.3 kcal / P35.6 / C45.6 / G16.9 | 489 kcal / P39 / C56.3 / G12 | Arroz integral 75 Grs + Carne de cerdo magro 150 Grs | 1027.4 kcal / P75.2 / C96.3 / G35.7 → 538.4 kcal / P36.2 / C40.1 / G23.7 |
| 6 | snack | generated/RECOMMENDED | 538.4 kcal / P36.2 / C40.1 / G23.7 | 540 kcal / P33.8 / C42.8 / G26 | Avena instantanea 75 Grs + Huevos 4 Unid | 538.4 kcal / P36.2 / C40.1 / G23.7 → -1.6 kcal / P2.4 / C-2.7 / G-2.3 |

### partial-empty — PASS

- Propósito: Día vacío
- INPUT: 2000 kcal / P140 / C225 / G60; desayuno, almuerzo, merienda, cena; seed `daily-audit-partial-empty`.
- Preservadas: ninguna.
- Resultado diario: 2000.9 kcal / P142.4 / C236.9 / G55.9; diferencia actual-target 0.9 kcal / P2.4 / C11.9 / G-4.1.
- Diversidad interna: 4/4 composiciones únicas; exactas 0; solapamientos altos 0.
- Tiempo/generador: 1266.39 ms; 4 invocaciones de comida.
- Motivo: invariantes de preservación, carry, totals y contrato central conformes.

| # | comida | estado | target | actual | alimentos y cantidades | remaining antes → después |
|---:|---|---|---|---|---|---|
| 1 | desayuno | generated/RECOMMENDED | 559.7 kcal / P39.2 / C63 / G16.8 | 564.9 kcal / P39.7 / C74.9 / G11.9 | Almendras 3 Unid + Anana 90 Grs + Avena instantanea 105 Grs + Claras de huevos 7 Unid + Copos de maiz sin azucar 5 Grs | 2000 kcal / P140 / C225 / G60 → 1435.1 kcal / P100.3 / C150.1 / G48.1 |
| 2 | almuerzo | generated/RECOMMENDED | 495 kcal / P34.6 / C51.8 / G16.6 | 499.8 kcal / P36.9 / C63.8 / G12.9 | Arroz integral 85 Grs + Churrasco magro 140 Grs | 1435.1 kcal / P100.3 / C150.1 / G48.1 → 935.3 kcal / P63.4 / C86.4 / G35.2 |
| 3 | merienda | generated/RECOMMENDED | 424.1 kcal / P28.8 / C39.2 / G16 | 418.3 kcal / P24.1 / C40.8 / G17.6 | Huevos 3 Unid + Pan 80 Grs | 935.3 kcal / P63.4 / C86.4 / G35.2 → 517 kcal / P39.3 / C45.6 / G17.6 |
| 4 | cena | generated/RECOMMENDED | 517 kcal / P39.3 / C45.6 / G17.6 | 517.9 kcal / P41.7 / C57.5 / G13.5 | Arroz integral (Cocido) 250 Grs + Carne de cerdo magro 160 Grs | 517 kcal / P39.3 / C45.6 / G17.6 → -0.9 kcal / P-2.4 / C-11.9 / G4.2 |

### partial-one-zero — PASS

- Propósito: Una comida con C/G físicos en cero
- INPUT: 2000 kcal / P140 / C225 / G60; desayuno, almuerzo, merienda, cena; seed `daily-audit-partial-one-zero`.
- Preservadas: manual-zero-macros (165 kcal / P31 / C0 / G0).
- Resultado diario: 1997.7 kcal / P141.4 / C233 / G51; diferencia actual-target -2.3 kcal / P1.4 / C8 / G-9.
- Diversidad interna: 3/3 composiciones únicas; exactas 0; solapamientos altos 0.
- Tiempo/generador: 978.19 ms; 3 invocaciones de comida.
- Motivo: invariantes de preservación, carry, totals y contrato central conformes.

| # | comida | estado | target | actual | alimentos y cantidades | remaining antes → después |
|---:|---|---|---|---|---|---|
| 1 | desayuno | preserved/manual | 430 kcal / P30 / C45 / G12 | 165 kcal / P31 / C0 / G0 | Contenido manual-zero-macros 1 unidad | — |
| 2 | almuerzo | generated/RECOMMENDED | 611 kcal / P36.3 / C74.9 / G20 | 611.4 kcal / P36.8 / C68.4 / G21.2 | Aceite de coco 20 Grs + Anana 80 Grs + Arroz 80 Grs + Atun en lomitos al natural 1 Pote | 1835 kcal / P109 / C225 / G60 → 1223.6 kcal / P72.2 / C156.6 / G38.8 |
| 3 | merienda | generated/RECOMMENDED | 553.5 kcal / P32.7 / C70.8 / G17.6 | 556.6 kcal / P33.3 / C63.1 / G19 | Avena instantanea 110 Grs + Claras de huevos 2 Unid + Huevos 2 Unid | 1223.6 kcal / P72.2 / C156.6 / G38.8 → 667 kcal / P38.9 / C93.5 / G19.8 |
| 4 | cena | generated/BEST_EFFORT | 667 kcal / P38.9 / C93.5 / G19.8 | 664.7 kcal / P40.3 / C101.5 / G10.9 | Arroz (Cocido) 350 Grs + Carne de cerdo magro 140 Grs | 667 kcal / P38.9 / C93.5 / G19.8 → 2.3 kcal / P-1.3 / C-8 / G9 |

### partial-two-existing — PASS

- Propósito: Dos comidas reales imperfectas
- INPUT: 2000 kcal / P140 / C225 / G60; desayuno, almuerzo, merienda, cena; seed `daily-audit-partial-two-existing`.
- Preservadas: manual-zero-macros (165 kcal / P31 / C0 / G0); manual-imperfect (515 kcal / P28 / C72 / G13).
- Resultado diario: 1999.9 kcal / P138.4 / C218.2 / G59.4; diferencia actual-target -0.1 kcal / P-1.6 / C-6.8 / G-0.6.
- Diversidad interna: 2/2 composiciones únicas; exactas 0; solapamientos altos 0.
- Tiempo/generador: 631.76 ms; 2 invocaciones de comida.
- Motivo: invariantes de preservación, carry, totals y contrato central conformes.

| # | comida | estado | target | actual | alimentos y cantidades | remaining antes → después |
|---:|---|---|---|---|---|---|
| 1 | desayuno | preserved/manual | 430 kcal / P30 / C45 / G12 | 165 kcal / P31 / C0 / G0 | Contenido manual-zero-macros 1 unidad | — |
| 2 | almuerzo | preserved/manual | 600 kcal / P45 / C65 / G18 | 515 kcal / P28 / C72 / G13 | Contenido manual-imperfect 1 unidad | — |
| 3 | merienda | generated/RECOMMENDED | 645.2 kcal / P39.6 / C74.8 / G23 | 645.1 kcal / P37.1 / C68.6 / G24.7 | Avena instantanea 120 Grs + Claras de huevos 1 Unid + Huevos 3 Unid | 1320 kcal / P81 / C153 / G47 → 674.9 kcal / P43.9 / C84.4 / G22.3 |
| 4 | cena | generated/RECOMMENDED | 674.9 kcal / P43.9 / C84.4 / G22.3 | 674.8 kcal / P42.3 / C77.6 / G21.7 | Aceite de coco 20 Grs + Anana 80 Grs + Arroz 80 Grs + Atun en lomitos al natural 1 Pote + Berenjena 200 Grs + Claras de huevos 1 Unid | 674.9 kcal / P43.9 / C84.4 / G22.3 → 0.1 kcal / P1.6 / C6.8 / G0.6 |

### partial-created-from-target — PASS

- Propósito: Comida creada previamente por meta
- INPUT: 2000 kcal / P140 / C225 / G60; desayuno, almuerzo, merienda, cena; seed `daily-audit-partial-created-from-target`.
- Preservadas: created-from-meal-target (355 kcal / P24 / C42 / G9).
- Resultado diario: 1997.8 kcal / P143.1 / C234.5 / G55.1; diferencia actual-target -2.2 kcal / P3.1 / C9.5 / G-4.9.
- Diversidad interna: 3/3 composiciones únicas; exactas 0; solapamientos altos 0.
- Tiempo/generador: 994.86 ms; 3 invocaciones de comida.
- Motivo: invariantes de preservación, carry, totals y contrato central conformes.

| # | comida | estado | target | actual | alimentos y cantidades | remaining antes → después |
|---:|---|---|---|---|---|---|
| 1 | desayuno | generated/RECOMMENDED | 568.2 kcal / P40.1 / C63.2 / G17.6 | 568 kcal / P39.2 / C59.1 / G19.4 | Almendras 1 Unid + Anana 80 Grs + Avena instantanea 30 Grs + Claras de huevos 4 Unid + Copos de maiz sin azucar 40 Grs + Huevos 3 Unid | 1645 kcal / P116 / C183 / G51 → 1077 kcal / P76.8 / C123.9 / G31.6 |
| 2 | almuerzo | generated/RECOMMENDED | 574.3 kcal / P41 / C66.1 / G16.9 | 574.1 kcal / P42.8 / C71.3 / G13.1 | Arroz integral 95 Grs + Carne de cerdo magro 160 Grs | 1077 kcal / P76.8 / C123.9 / G31.6 → 502.9 kcal / P34 / C52.6 / G18.5 |
| 3 | merienda | preserved/manual | 400 kcal / P30 / C45 / G10 | 355 kcal / P24 / C42 / G9 | Contenido created-from-meal-target 1 unidad | — |
| 4 | cena | generated/RECOMMENDED | 502.9 kcal / P34 / C52.6 / G18.5 | 500.7 kcal / P37.1 / C62.1 / G13.6 | Arroz integral (Cocido) 270 Grs + Churrasco magro 140 Grs | 502.9 kcal / P34 / C52.6 / G18.5 → 2.2 kcal / P-3.1 / C-9.5 / G4.9 |

### partial-target-only — PASS

- Propósito: Slot con meta pero sin alimentos
- INPUT: 2000 kcal / P140 / C225 / G60; desayuno, almuerzo, merienda, cena; seed `daily-audit-partial-target-only`.
- Preservadas: target-only-empty-slot (0 kcal / P0 / C0 / G0).
- Resultado diario: 1993.9 kcal / P141 / C231.3 / G58.2; diferencia actual-target -6.1 kcal / P1 / C6.3 / G-1.8.
- Diversidad interna: 4/4 composiciones únicas; exactas 0; solapamientos altos 0.
- Tiempo/generador: 1666.34 ms; 4 invocaciones de comida.
- Motivo: invariantes de preservación, carry, totals y contrato central conformes.

| # | comida | estado | target | actual | alimentos y cantidades | remaining antes → después |
|---:|---|---|---|---|---|---|
| 1 | desayuno | generated/RECOMMENDED | 501.9 kcal / P35.1 / C56.5 / G15.1 | 493 kcal / P32.7 / C63.3 / G12.1 | Galletitas de agua 90 Grs + Whey protein Isolate 25 Grs | 2000 kcal / P140 / C225 / G60 → 1507.1 kcal / P107.4 / C161.8 / G47.9 |
| 2 | almuerzo | generated/RECOMMENDED | 488.3 kcal / P34.8 / C52.4 / G15.5 | 487.2 kcal / P36 / C63.8 / G11.9 | Arroz (Cocido) 220 Grs + Churrasco magro 140 Grs | 1507.1 kcal / P107.4 / C161.8 / G47.9 → 1019.9 kcal / P71.3 / C98 / G36 |
| 3 | merienda | generated/RECOMMENDED | 510.7 kcal / P35.7 / C49.1 / G18 | 510.8 kcal / P37.5 / C59 / G13.9 | Almendras 3 Unid + Anana 120 Grs + Avena instantanea 65 Grs + Claras de huevos 6 Unid + Copos de maiz sin azucar 10 Grs + Huevos 1 Unid | 1019.9 kcal / P71.3 / C98 / G36 → 509 kcal / P33.8 / C39 / G22.1 |
| 4 | cena | generated/RECOMMENDED | 509 kcal / P33.8 / C39 / G22.1 | 502.9 kcal / P34.8 / C45.3 / G20.3 | Aceite de coco 20 Grs + Arroz 60 Grs + Atun en lomitos al natural 1 Pote | 509 kcal / P33.8 / C39 / G22.1 → 6.1 kcal / P-1 / C-6.3 / G1.8 |

### partial-missing-fields — PASS

- Propósito: C/G ausentes: no heredar meta
- INPUT: 2000 kcal / P140 / C225 / G60; desayuno, almuerzo, merienda, cena; seed `daily-audit-partial-missing-fields`.
- Preservadas: legacy-missing-cg (220 kcal / P35 / C0 / G0).
- Resultado diario: 2000.4 kcal / P139.4 / C216 / G57.4; diferencia actual-target 0.4 kcal / P-0.6 / C-9 / G-2.6.
- Diversidad interna: 3/3 composiciones únicas; exactas 0; solapamientos altos 0.
- Tiempo/generador: 980.33 ms; 3 invocaciones de comida.
- Motivo: invariantes de preservación, carry, totals y contrato central conformes.

| # | comida | estado | target | actual | alimentos y cantidades | remaining antes → después |
|---:|---|---|---|---|---|---|
| 1 | desayuno | preserved/manual | 430 kcal / P30 / C45 / G12 | 220 kcal / P35 / C0 / G0 | Contenido legacy-missing-cg 1 unidad | — |
| 2 | almuerzo | generated/RECOMMENDED | 532.1 kcal / P31.4 / C67.3 / G17.9 | 530.4 kcal / P36 / C71.3 / G13.2 | Arroz integral (Cocido) 310 Grs + Churrasco magro 130 Grs | 1780 kcal / P105 / C225 / G60 → 1249.6 kcal / P69 / C153.7 / G46.8 |
| 3 | merienda | generated/RECOMMENDED | 592.4 kcal / P32.7 / C72.9 / G22.2 | 592.7 kcal / P31.2 / C67.3 / G22.1 | Almendras 1 Unid + Anana 190 Grs + Avena instantanea 55 Grs + Claras de huevos 1 Unid + Copos de maiz sin azucar 20 Grs + Huevos 3 Unid | 1249.6 kcal / P69 / C153.7 / G46.8 → 656.9 kcal / P37.8 / C86.4 / G24.7 |
| 4 | cena | generated/RECOMMENDED | 656.9 kcal / P37.8 / C86.5 / G24.7 | 657.3 kcal / P37.3 / C77.4 / G22.1 | Aceite de coco 20 Grs + Anana 170 Grs + Arroz 80 Grs + Atun en lomitos al natural 1 Pote | 656.9 kcal / P37.8 / C86.4 / G24.7 → -0.4 kcal / P0.6 / C9 / G2.6 |

### partial-aggregate-zero — PASS

- Propósito: Items legacy sin macros y agregado físico C/G=0
- INPUT: 2000 kcal / P140 / C225 / G60; desayuno, almuerzo, merienda, cena; seed `daily-audit-partial-aggregate-zero`.
- Preservadas: legacy-aggregate-zero (220 kcal / P35 / C0 / G0).
- Resultado diario: 1999.5 kcal / P141.2 / C234.2 / G46.5; diferencia actual-target -0.5 kcal / P1.2 / C9.2 / G-13.5.
- Diversidad interna: 3/3 composiciones únicas; exactas 0; solapamientos altos 0.
- Tiempo/generador: 948.35 ms; 3 invocaciones de comida.
- Motivo: invariantes de preservación, carry, totals y contrato central conformes.

| # | comida | estado | target | actual | alimentos y cantidades | remaining antes → después |
|---:|---|---|---|---|---|---|
| 1 | desayuno | preserved/manual | 430 kcal / P30 / C45 / G12 | 220 kcal / P35 / C0 / G0 | Contenido legacy-aggregate-zero 1 unidad | — |
| 2 | almuerzo | generated/RECOMMENDED | 617.9 kcal / P36.5 / C78.1 / G20.8 | 617.5 kcal / P37.3 / C78.4 / G17.2 | Aceite de coco 15 Grs + Anana 180 Grs + Arroz 80 Grs + Atun en lomitos al natural 1 Pote | 1780 kcal / P105 / C225 / G60 → 1162.5 kcal / P67.7 / C146.6 / G42.8 |
| 3 | merienda | generated/RECOMMENDED | 525.7 kcal / P30.6 / C66.3 / G19.4 | 523.3 kcal / P29.2 / C60.1 / G18.5 | Avena instantanea 105 Grs + Claras de huevos 1 Unid + Huevos 2 Unid | 1162.5 kcal / P67.7 / C146.6 / G42.8 → 639.2 kcal / P38.6 / C86.5 / G24.3 |
| 4 | cena | generated/BEST_EFFORT | 639.2 kcal / P38.6 / C86.6 / G24.3 | 638.8 kcal / P39.7 / C95.7 / G10.8 | Arroz (Cocido) 330 Grs + Carne de cerdo magro 140 Grs | 639.2 kcal / P38.6 / C86.5 / G24.3 → 0.5 kcal / P-1.2 / C-9.2 / G13.5 |

### daily-selected-only-real — PASS

- Propósito: ONLY_SELECTED real: tres pares explícitos y ningún alimento agregado
- INPUT: 1800 kcal / P135 / C191.3 / G55; desayuno, almuerzo, cena; seed `daily-audit-selected-only`.
- Preservadas: ninguna.
- Resultado diario: 1797.5 kcal / P137.4 / C266.9 / G20; diferencia actual-target -2.5 kcal / P2.4 / C75.6 / G-35.
- Diversidad interna: 3/3 composiciones únicas; exactas 0; solapamientos altos 0.
- Tiempo/generador: 45.98 ms; 3 invocaciones de comida.
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
- Diversidad interna: 0/0 composiciones únicas; exactas 0; solapamientos altos 0.
- Tiempo/generador: 324.81 ms; 2 invocaciones de comida.
- Motivo: No encontramos una combinación válida para almuerzo..

| # | comida | estado | target | actual | alimentos y cantidades | remaining antes → después |
|---:|---|---|---|---|---|---|

### regenerate-middle — PASS

- Propósito: Regenera intermedia y recalcula posteriores
- INPUT: 2000 kcal / P140 / C225 / G60; desayuno, almuerzo, merienda, cena; seed `daily-audit-regenerate-middle`.
- Preservadas: manual-zero-macros (165 kcal / P31 / C0 / G0); generated-meal-1787708687456-0-ua029 (611.4 kcal / P36.8 / C68.4 / G21.2).
- Resultado diario: 1997.6 kcal / P139.3 / C250.3 / G46.2; diferencia actual-target -2.4 kcal / P-0.7 / C25.3 / G-13.8.
- Diversidad interna: 2/2 composiciones únicas; exactas 0; solapamientos altos 0.
- Tiempo/generador: 655.94 ms; 2 invocaciones de comida.
- Motivo: invariantes de preservación, carry, totals y contrato central conformes.

| # | comida | estado | target | actual | alimentos y cantidades | remaining antes → después |
|---:|---|---|---|---|---|---|
| 1 | desayuno | preserved/manual | 430 kcal / P30 / C45 / G12 | 165 kcal / P31 / C0 / G0 | Contenido manual-zero-macros 1 unidad | — |
| 2 | almuerzo | preserved/RECOMMENDED | 611 kcal / P36.3 / C74.9 / G20 | 611.4 kcal / P36.8 / C68.4 / G21.2 | Aceite de coco 20 Grs + Anana 80 Grs + Arroz 80 Grs + Atun en lomitos al natural 1 Pote | — |
| 3 | merienda | generated/BEST_EFFORT | 613.1 kcal / P36.2 / C78.5 / G19.5 | 613.3 kcal / P34 / C91.9 / G12.2 | Almendras 3 Unid + Anana 140 Grs + Avena instantanea 105 Grs + Claras de huevos 5 Unid + Copos de maiz sin azucar 20 Grs | 1223.6 kcal / P72.2 / C156.6 / G38.8 → 610.3 kcal / P38.3 / C64.7 / G26.6 |
| 4 | cena | generated/BEST_EFFORT | 610.3 kcal / P38.3 / C64.7 / G26.6 | 607.9 kcal / P37.6 / C90 / G12.8 | Arroz integral 120 Grs + Churrasco magro 130 Grs | 610.3 kcal / P38.3 / C64.7 / G26.6 → 2.4 kcal / P0.7 / C-25.3 / G13.8 |

### regenerate-last — PASS

- Propósito: Regenera sólo la última automática
- INPUT: 2000 kcal / P140 / C225 / G60; desayuno, almuerzo, merienda, cena; seed `daily-audit-regenerate-last`.
- Preservadas: manual-zero-macros (165 kcal / P31 / C0 / G0); generated-meal-1787708687456-0-ua029 (611.4 kcal / P36.8 / C68.4 / G21.2); generated-meal-1787708687794-0-saaph (556.6 kcal / P33.3 / C63.1 / G19).
- Resultado diario: 1998 kcal / P138.9 / C244.8 / G46.9; diferencia actual-target -2 kcal / P-1.1 / C19.8 / G-13.1.
- Diversidad interna: 1/1 composiciones únicas; exactas 0; solapamientos altos 0.
- Tiempo/generador: 323.22 ms; 1 invocaciones de comida.
- Motivo: invariantes de preservación, carry, totals y contrato central conformes.

| # | comida | estado | target | actual | alimentos y cantidades | remaining antes → después |
|---:|---|---|---|---|---|---|
| 1 | desayuno | preserved/manual | 430 kcal / P30 / C45 / G12 | 165 kcal / P31 / C0 / G0 | Contenido manual-zero-macros 1 unidad | — |
| 2 | almuerzo | preserved/RECOMMENDED | 611 kcal / P36.3 / C74.9 / G20 | 611.4 kcal / P36.8 / C68.4 / G21.2 | Aceite de coco 20 Grs + Anana 80 Grs + Arroz 80 Grs + Atun en lomitos al natural 1 Pote | — |
| 3 | merienda | preserved/RECOMMENDED | 553.5 kcal / P32.7 / C70.8 / G17.6 | 556.6 kcal / P33.3 / C63.1 / G19 | Avena instantanea 110 Grs + Claras de huevos 2 Unid + Huevos 2 Unid | — |
| 4 | cena | generated/BEST_EFFORT | 667 kcal / P38.9 / C93.5 / G19.8 | 665 kcal / P37.8 / C113.3 / G6.8 | Arroz 150 Grs + Bola de lomo 120 Grs | 667 kcal / P38.9 / C93.5 / G19.8 → 2 kcal / P1.1 / C-19.7 / G13.1 |

### regenerate-full — PASS

- Propósito: Regenera todo salvo manuales originales
- INPUT: 2000 kcal / P140 / C225 / G60; desayuno, almuerzo, merienda, cena; seed `daily-audit-regenerate-full`.
- Preservadas: manual-zero-macros (165 kcal / P31 / C0 / G0).
- Resultado diario: 2000.7 kcal / P139.2 / C268.3 / G38.3; diferencia actual-target 0.7 kcal / P-0.8 / C43.3 / G-21.7.
- Diversidad interna: 3/3 composiciones únicas; exactas 0; solapamientos altos 0.
- Tiempo/generador: 1348.84 ms; 3 invocaciones de comida.
- Motivo: invariantes de preservación, carry, totals y contrato central conformes.

| # | comida | estado | target | actual | alimentos y cantidades | remaining antes → después |
|---:|---|---|---|---|---|---|
| 1 | desayuno | preserved/manual | 430 kcal / P30 / C45 / G12 | 165 kcal / P31 / C0 / G0 | Contenido manual-zero-macros 1 unidad | — |
| 2 | almuerzo | generated/BEST_EFFORT | 668.7 kcal / P39.7 / C82 / G21.9 | 665 kcal / P37.8 / C113.3 / G6.8 | Arroz 150 Grs + Bola de lomo 120 Grs | 1835 kcal / P109 / C225 / G60 → 1170.1 kcal / P71.2 / C111.8 / G53.3 |
| 3 | merienda | generated/BEST_EFFORT | 555.7 kcal / P33.8 / C53.1 / G25.3 | 546.2 kcal / P31.8 / C72.2 / G14.5 | Galletitas de agua 100 Grs + Whey protein SN 25 Grs | 1170.1 kcal / P71.2 / C111.8 / G53.3 → 623.8 kcal / P39.5 / C39.6 / G38.8 |
| 4 | cena | generated/BEST_EFFORT | 623.9 kcal / P39.5 / C39.6 / G38.8 | 624.6 kcal / P38.6 / C82.9 / G17 | Capelletini giacomo tridicci 135 Grs + Churrasco magro 110 Grs | 623.8 kcal / P39.5 / C39.6 / G38.8 → -0.7 kcal / P0.8 / C-43.3 / G21.7 |

### other-option-seed-1 — PASS

- Propósito: Mismo input, seed distinto
- INPUT: 2000 kcal / P140 / C225 / G60; desayuno, almuerzo, merienda, cena; seed `daily-audit-option-1`.
- Preservadas: ninguna.
- Resultado diario: 2000.4 kcal / P140.5 / C229.3 / G60; diferencia actual-target 0.4 kcal / P0.5 / C4.3 / G0.
- Diversidad interna: 4/4 composiciones únicas; exactas 0; solapamientos altos 0.
- Tiempo/generador: 1748.47 ms; 4 invocaciones de comida.
- Motivo: invariantes de preservación, carry, totals y contrato central conformes.

| # | comida | estado | target | actual | alimentos y cantidades | remaining antes → después |
|---:|---|---|---|---|---|---|
| 1 | desayuno | generated/RECOMMENDED | 497.6 kcal / P34.8 / C56 / G14.9 | 506.8 kcal / P34.4 / C64.4 / G12.4 | Claras de huevos 7 Unid + Galletitas de agua 90 Grs | 2000 kcal / P140 / C225 / G60 → 1493.2 kcal / P105.6 / C160.6 / G47.6 |
| 2 | almuerzo | generated/RECOMMENDED | 553.7 kcal / P39.2 / C59.6 / G17.7 | 558 kcal / P40.8 / C69 / G13.2 | Arroz integral (Cocido) 300 Grs + Carne de cerdo magro 150 Grs | 1493.2 kcal / P105.6 / C160.6 / G47.6 → 935.2 kcal / P64.8 / C91.6 / G34.4 |
| 3 | merienda | generated/RECOMMENDED | 491.4 kcal / P34.1 / C48.1 / G18.1 | 487.3 kcal / P30.1 / C40.8 / G22.6 | Huevos 4 Unid + Pan 80 Grs | 935.2 kcal / P64.8 / C91.6 / G34.4 → 447.9 kcal / P34.7 / C50.8 / G11.8 |
| 4 | cena | generated/RECOMMENDED | 447.9 kcal / P34.7 / C50.8 / G11.8 | 448.4 kcal / P35.2 / C55.1 / G11.8 | Arroz (Cocido) 190 Grs + Churrasco magro 140 Grs | 447.9 kcal / P34.7 / C50.8 / G11.8 → -0.4 kcal / P-0.5 / C-4.3 / G0 |

### other-option-seed-2 — PASS

- Propósito: Mismo input, seed distinto
- INPUT: 2000 kcal / P140 / C225 / G60; desayuno, almuerzo, merienda, cena; seed `daily-audit-option-2`.
- Preservadas: ninguna.
- Resultado diario: 1995.7 kcal / P141.5 / C233 / G57.3; diferencia actual-target -4.3 kcal / P1.5 / C8 / G-2.7.
- Diversidad interna: 4/4 composiciones únicas; exactas 0; solapamientos altos 0.
- Tiempo/generador: 2340.35 ms; 4 invocaciones de comida.
- Motivo: invariantes de preservación, carry, totals y contrato central conformes.

| # | comida | estado | target | actual | alimentos y cantidades | remaining antes → después |
|---:|---|---|---|---|---|---|
| 1 | desayuno | generated/RECOMMENDED | 551.1 kcal / P38.6 / C62 / G16.5 | 556.3 kcal / P38.3 / C70.3 / G13.5 | Galletitas de agua 100 Grs + Whey protein Isolate 30 Grs | 2000 kcal / P140 / C225 / G60 → 1443.7 kcal / P101.7 / C154.7 / G46.5 |
| 2 | almuerzo | generated/RECOMMENDED | 486.2 kcal / P34.3 / C52.1 / G15.7 | 486.2 kcal / P35 / C62.1 / G12.8 | Arroz integral (Cocido) 270 Grs + Churrasco magro 130 Grs | 1443.7 kcal / P101.7 / C154.7 / G46.5 → 957.5 kcal / P66.7 / C92.6 / G33.6 |
| 3 | merienda | generated/RECOMMENDED | 495.3 kcal / P34.5 / C47.9 / G17.4 | 495.3 kcal / P33.4 / C55.3 / G15.6 | Almendras 3 Unid + Anana 80 Grs + Avena instantanea 30 Grs + Claras de huevos 4 Unid + Copos de maiz sin azucar 35 Grs + Huevos 2 Unid | 957.5 kcal / P66.7 / C92.6 / G33.6 → 462.3 kcal / P33.3 / C37.3 / G18 |
| 4 | cena | generated/RECOMMENDED | 462.3 kcal / P33.3 / C37.3 / G18 | 458 kcal / P34.8 / C45.3 / G15.3 | Aceite de coco 15 Grs + Arroz 60 Grs + Atun en lomitos al natural 1 Pote | 462.3 kcal / P33.3 / C37.3 / G18 → 4.3 kcal / P-1.5 / C-8 / G2.7 |

### other-option-seed-3 — PASS

- Propósito: Mismo input, seed distinto
- INPUT: 2000 kcal / P140 / C225 / G60; desayuno, almuerzo, merienda, cena; seed `daily-audit-option-3`.
- Preservadas: ninguna.
- Resultado diario: 1998.4 kcal / P139.2 / C234.9 / G57.6; diferencia actual-target -1.6 kcal / P-0.8 / C9.9 / G-2.4.
- Diversidad interna: 4/4 composiciones únicas; exactas 0; solapamientos altos 0.
- Tiempo/generador: 1665.75 ms; 4 invocaciones de comida.
- Motivo: invariantes de preservación, carry, totals y contrato central conformes.

| # | comida | estado | target | actual | alimentos y cantidades | remaining antes → después |
|---:|---|---|---|---|---|---|
| 1 | desayuno | generated/RECOMMENDED | 485.6 kcal / P34 / C54.6 / G14.6 | 484.3 kcal / P33.6 / C49.1 / G17.1 | Avena instantanea 85 Grs + Claras de huevos 3 Unid + Huevos 2 Unid | 2000 kcal / P140 / C225 / G60 → 1515.7 kcal / P106.5 / C176 / G42.9 |
| 2 | almuerzo | generated/RECOMMENDED | 470 kcal / P33 / C54.6 / G13.3 | 470.9 kcal / P32.6 / C63.8 / G11.3 | Arroz integral 85 Grs + Churrasco magro 120 Grs | 1515.7 kcal / P106.5 / C176 / G42.9 → 1044.8 kcal / P73.9 / C112.2 / G31.6 |
| 3 | merienda | generated/RECOMMENDED | 532.2 kcal / P37.6 / C57.2 / G16.1 | 534.2 kcal / P37.8 / C66.8 / G12.9 | Galletitas de agua 95 Grs + Whey protein Isolate 30 Grs | 1044.8 kcal / P73.9 / C112.2 / G31.6 → 510.6 kcal / P36.1 / C45.4 / G18.7 |
| 4 | cena | generated/RECOMMENDED | 510.6 kcal / P36.1 / C45.4 / G18.7 | 509 kcal / P35.3 / C55.3 / G16.3 | Aceite de coco 15 Grs + Anana 100 Grs + Arroz 60 Grs + Atun en lomitos al natural 1 Pote | 510.6 kcal / P36.1 / C45.4 / G18.7 → 1.6 kcal / P0.8 / C-9.9 / G2.4 |

### other-option-seed-4 — PASS

- Propósito: Mismo input, seed distinto
- INPUT: 2000 kcal / P140 / C225 / G60; desayuno, almuerzo, merienda, cena; seed `daily-audit-option-4`.
- Preservadas: ninguna.
- Resultado diario: 2000.7 kcal / P138.2 / C232.6 / G59.6; diferencia actual-target 0.7 kcal / P-1.8 / C7.6 / G-0.4.
- Diversidad interna: 4/4 composiciones únicas; exactas 0; solapamientos altos 0.
- Tiempo/generador: 1644.51 ms; 4 invocaciones de comida.
- Motivo: invariantes de preservación, carry, totals y contrato central conformes.

| # | comida | estado | target | actual | alimentos y cantidades | remaining antes → después |
|---:|---|---|---|---|---|---|
| 1 | desayuno | generated/RECOMMENDED | 522.8 kcal / P36.6 / C58.8 / G15.7 | 515 kcal / P33.2 / C66.8 / G12.8 | Galletitas de agua 95 Grs + Whey protein Isolate 25 Grs | 2000 kcal / P140 / C225 / G60 → 1485 kcal / P106.8 / C158.3 / G47.2 |
| 2 | almuerzo | generated/RECOMMENDED | 482 kcal / P34.7 / C51.4 / G15.3 | 482.3 kcal / P36.5 / C60 / G12.8 | Arroz integral 80 Grs + Churrasco magro 140 Grs | 1485 kcal / P106.8 / C158.3 / G47.2 → 1002.7 kcal / P70.3 / C98.3 / G34.4 |
| 3 | merienda | generated/RECOMMENDED | 500.5 kcal / P35.1 / C49 / G17.2 | 500.5 kcal / P33.7 / C60.5 / G13.8 | Almendras 2 Unid + Anana 180 Grs + Avena instantanea 65 Grs + Claras de huevos 5 Unid + Copos de maiz sin azucar 5 Grs + Huevos 1 Unid | 1002.7 kcal / P70.3 / C98.3 / G34.4 → 502.2 kcal / P36.6 / C37.8 / G20.7 |
| 4 | cena | generated/RECOMMENDED | 502.2 kcal / P36.6 / C37.8 / G20.7 | 502.9 kcal / P34.8 / C45.3 / G20.3 | Aceite de coco 20 Grs + Arroz 60 Grs + Atun en lomitos al natural 1 Pote | 502.2 kcal / P36.6 / C37.8 / G20.7 → -0.7 kcal / P1.8 / C-7.6 / G0.4 |

### other-option-seed-5 — PASS

- Propósito: Mismo input, seed distinto
- INPUT: 2000 kcal / P140 / C225 / G60; desayuno, almuerzo, merienda, cena; seed `daily-audit-option-5`.
- Preservadas: ninguna.
- Resultado diario: 2000.9 kcal / P141.4 / C231.4 / G58.8; diferencia actual-target 0.9 kcal / P1.4 / C6.4 / G-1.2.
- Diversidad interna: 4/4 composiciones únicas; exactas 0; solapamientos altos 0.
- Tiempo/generador: 1397.55 ms; 4 invocaciones de comida.
- Motivo: invariantes de preservación, carry, totals y contrato central conformes.

| # | comida | estado | target | actual | alimentos y cantidades | remaining antes → después |
|---:|---|---|---|---|---|---|
| 1 | desayuno | generated/RECOMMENDED | 558.7 kcal / P39.1 / C62.9 / G16.8 | 564.9 kcal / P39.7 / C74.9 / G11.9 | Almendras 3 Unid + Anana 90 Grs + Avena instantanea 105 Grs + Claras de huevos 7 Unid + Copos de maiz sin azucar 5 Grs | 2000 kcal / P140 / C225 / G60 → 1435.1 kcal / P100.3 / C150.1 / G48.1 |
| 2 | almuerzo | generated/RECOMMENDED | 511.2 kcal / P35.7 / C53.5 / G17.2 | 511.7 kcal / P37.4 / C64.4 / G13.7 | Arroz integral (Cocido) 280 Grs + Churrasco magro 140 Grs | 1435.1 kcal / P100.3 / C150.1 / G48.1 → 923.4 kcal / P62.9 / C85.7 / G34.4 |
| 3 | merienda | generated/RECOMMENDED | 501.6 kcal / P34.2 / C46.6 / G18.7 | 500.5 kcal / P30.5 / C43.4 / G22.8 | Huevos 4 Unid + Pan 85 Grs | 923.4 kcal / P62.9 / C85.7 / G34.4 → 422.9 kcal / P32.4 / C42.4 / G11.6 |
| 4 | cena | generated/RECOMMENDED | 422.9 kcal / P32.5 / C42.4 / G11.6 | 423.8 kcal / P33.8 / C48.8 / G10.4 | Arroz integral 65 Grs + Carne de cerdo magro 130 Grs | 422.9 kcal / P32.4 / C42.4 / G11.6 → -0.9 kcal / P-1.4 / C-6.4 / G1.2 |

### other-option-seed-6 — PASS

- Propósito: Mismo input, seed distinto
- INPUT: 2000 kcal / P140 / C225 / G60; desayuno, almuerzo, merienda, cena; seed `daily-audit-option-6`.
- Preservadas: ninguna.
- Resultado diario: 2005.2 kcal / P143.9 / C236.7 / G55.6; diferencia actual-target 5.2 kcal / P3.9 / C11.7 / G-4.4.
- Diversidad interna: 4/4 composiciones únicas; exactas 0; solapamientos altos 0.
- Tiempo/generador: 1727.19 ms; 4 invocaciones de comida.
- Motivo: invariantes de preservación, carry, totals y contrato central conformes.

| # | comida | estado | target | actual | alimentos y cantidades | remaining antes → después |
|---:|---|---|---|---|---|---|
| 1 | desayuno | generated/RECOMMENDED | 544.6 kcal / P38.1 / C61.3 / G16.3 | 548.6 kcal / P40.5 / C71 / G11.4 | Avena instantanea 120 Grs + Whey protein SN 30 Grs | 2000 kcal / P140 / C225 / G60 → 1451.4 kcal / P99.5 / C154 / G48.6 |
| 2 | almuerzo | generated/RECOMMENDED | 476.8 kcal / P32.7 / C50.6 / G16 | 475.2 kcal / P34.7 / C59.8 / G12.7 | Arroz integral (Cocido) 260 Grs + Churrasco magro 130 Grs | 1451.4 kcal / P99.5 / C154 / G48.6 → 976.2 kcal / P64.8 / C94.2 / G35.9 |
| 3 | merienda | generated/RECOMMENDED | 446.9 kcal / P29.7 / C43.1 / G16.4 | 444.7 kcal / P24.8 / C45.9 / G18 | Huevos 3 Unid + Pan 90 Grs | 976.2 kcal / P64.8 / C94.2 / G35.9 → 531.5 kcal / P39.9 / C48.3 / G17.9 |
| 4 | cena | generated/RECOMMENDED | 531.5 kcal / P40 / C48.3 / G17.9 | 536.7 kcal / P43.8 / C60 / G13.5 | Arroz integral 80 Grs + Carne de cerdo magro 170 Grs | 531.5 kcal / P39.9 / C48.3 / G17.9 → -5.2 kcal / P-3.9 / C-11.7 / G4.4 |
