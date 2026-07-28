# Matriz Tracking — Completar calorías (`tracking_calorie_fill_v1`)

Generada: 2026-07-28T03:01:48.459Z. Seed reproducible: `0x43464d31`.

Esta matriz usa snapshots nutricionales embebidos y de sólo lectura. No consulta ni modifica `fooddatabase2`. No selecciona únicamente combinaciones favorables: incluye mezclas apropiadas, incompletas y absurdas; metas consistentes e incompatibles; alimentos continuos y discretos; Fijos, Registrados, máximos bajos, steps grandes y un alimento inválido de cero kcal.

## Cierre matemático

| Categoría | Ejecutados | PASS | PASS CON INFORMACIÓN/ADVERTENCIA | FAIL | Incluidos en resumen de producto |
|---|---:|---:|---:|---:|:---:|
| Fijos | 45 | 5 | 40 | 0 | sí |
| Random reproducibles | 100 | 1 | 99 | 0 | sí |
| Total | 145 | 6 | 139 | 0 | sí |

Cierre correcto: **sí**. Una limitación nutricional válida no se convierte en FAIL: PASS/FAIL evalúa invariantes del motor; información y advertencias describen porciones elevadas, granularidad, unidades o macros realmente inalcanzables.

## Propiedades verificadas

- Techo calórico: 145/145.
- Déficit continuo <=2 kcal o mejor valor físicamente alcanzable: 145/145.
- Candidatos calóricamente dominados: 0.
- Determinismo: 145/145.
- Rendimiento >=100 ms: 0 casos.
- Rendimiento: mediana 3.7355 ms, p95 15.1283 ms, máximo 25.1161 ms.
- Aislamiento: endpoint genérico no activa la policy = PASS; constrained conserva `tracking_remaining_v2` = PASS.
- También se verifican cantidades finitas/no negativas, unidades indivisibles enteras, Fijos intactos, Registrados ausentes de la respuesta Auto, alimentos usados o exclusión explícita y granularidad continua de 1 g/ml.

## Cobertura deliberada

- Perfiles A–I: A=16, E=18, G=23, B=14, C=12, H=17, I=16, F=17, D=12.
- Cantidad de alimentos: 1=14, 2=25, 3=29, 4=27, 5=23, 6=27.
- Combinaciones: incompleta=72, apropiada=38, absurda=35.
- Consistencia de metas: aproximadamente_consistente=19, fuertemente_incompatible=29, aproximada=37, leve_inconsistencia=6, exacta=4, consistente=25, p_cero_neutral=25.
- Proteína: activa=116, P=0 neutral=29, alcanzada=72, inalcanzable=43.
- Rango random: 200–1500 kcal. Los 100 casos y sus datos completos están en `MATRIZ_TRACKING_CALORIE_FILL_RANDOM.json`.

## Veinte pruebas funcionales detalladas

| Caso | Objetivo | Alimentos y cantidades | Resultado | Desvíos | Warning/info y razón | ms |
|---|---|---|---|---|---|---:|
| CF001 — Una Pechuga, 903 kcal | 903 kcal · P58.5 C38.4 G56.1 | Auto: Pechuga de pollo 817 Grs | 902.79 kcal · P179.74 C0 G20.43 | K-0.21 · P+121.24 C-38.4 G-35.67 | Advertencia: macronutrientes no alcanzables con la selección; Info: porciones recomendadas superadas intencionalmente | 1.1818 |
| CF002 — Caso real Pechuga con piel + Queso cremoso | 903 kcal · P58.5 C38.4 G56.1 | Auto: Pechuga de pollo con piel 155 Grs; Auto: Queso cremon doble crema 199 Grs | 902.94 kcal · P58.86 C1.99 G73.42 | K-0.06 · P+0.36 C-36.41 G+17.32 | Advertencia: macronutrientes no alcanzables con la selección; Info: porciones recomendadas superadas intencionalmente | 4.14 |
| CF003 — Un alimento continuo, 1200 kcal | 1200 kcal · P90 C120 G40 | Auto: Pechuga de pollo 1085 Grs | 1198.93 kcal · P238.7 C0 G27.13 | K-1.07 · P+148.7 C-120 G-12.87 | Advertencia: macronutrientes no alcanzables con la selección; Info: porciones recomendadas superadas intencionalmente; Info: aproximación limitada por granularidad física | 1.5521 |
| CF004 — Dos alimentos: proteico + graso | 1200 kcal · P90 C100 G45 | Auto: Pechuga de pollo 410 Grs; Auto: Aceite de oliva 83 Grs | 1199.3 kcal · P90.2 C0 G93.17 | K-0.7 · P+0.2 C-100 G+48.17 | Advertencia: macronutrientes no alcanzables con la selección; Info: porciones recomendadas superadas intencionalmente | 5.0981 |
| CF005 — Mezcla completa normal | 650 kcal · P50 C70 G18 | Auto: Pechuga de pollo 197 Grs; Auto: Arroz 93 Grs; Auto: Aceite de oliva 13 Grs | 649.37 kcal · P50.78 C70.22 G18.38 | K-0.63 · P+0.78 C+0.22 G+0.38 | Ninguno | 11.3599 |
| CF006 — Sólo proteicos | 900 kcal · P70 C95 G25 | Auto: Pechuga de pollo 811 Grs; Auto: Lubina 1 Grs; Auto: Langostinos 3 Grs | 899.02 kcal · P179.02 C0 G20.33 | K-0.98 · P+109.02 C-95 G-4.67 | Advertencia: macronutrientes no alcanzables con la selección; Info: porciones recomendadas superadas intencionalmente | 20.1193 |
| CF007 — Sólo carbohidratos | 900 kcal · P65 C120 G22 | Auto: Arroz 1 Grs; Auto: Avena instantanea 254 Grs; Auto: Papas 2 Grs | 899.39 kcal · P33.13 C145.92 G20.36 | K-0.61 · P-31.87 C+25.92 G-1.64 | Advertencia: macronutrientes no alcanzables con la selección; Info: porciones recomendadas superadas intencionalmente | 8.0242 |
| CF008 — Sólo grasas | 900 kcal · P55 C95 G33 | Auto: Aceite de oliva 1 Grs; Auto: Palta 1 Grs; Auto: Mani 149 Grs | 899.82 kcal · P41.74 C6.3 G78.63 | K-0.18 · P-13.26 C-88.7 G+45.63 | Advertencia: macronutrientes no alcanzables con la selección; Info: porciones recomendadas superadas intencionalmente | 9.2385 |
| CF009 — Unidades enteras | 500 kcal · P40 C20 G30 | Auto: Huevos 7 Unid | 483 kcal · P42 C0 G35 | K-17 · P+2 C-20 G+5 | Advertencia: aproximación limitada por unidades enteras; Advertencia: macronutrientes no alcanzables con la selección; Info: porciones recomendadas superadas intencionalmente | 1.0683 |
| CF010 — Fijo + dos Auto | 900 kcal · P60 C80 G25 | Fijo: Pechuga de pollo 200 Grs; Auto: Arroz 190 Grs; Auto: Queso cremon doble crema 10 Grs | 899.85 kcal · P60.6 C143.55 G9.25 | K-0.15 · P+0.6 C+63.55 G-15.75 | Advertencia: macronutrientes no alcanzables con la selección; Info: porciones recomendadas superadas intencionalmente | 1.7736 |
| CF011 — Registrado descontado una vez + Auto | 1200 kcal · P85 C130 G45 | Registrado: Arroz 100 Grs; Auto: Pechuga de pollo con piel 291 Grs; Auto: Queso cremon doble crema 140 Grs | 1199.72 kcal · P85.8 C76.9 G61.25 | K-0.28 · P+0.8 C-53.1 G+16.25 | Advertencia: macronutrientes no alcanzables con la selección; Info: porciones recomendadas superadas intencionalmente | 2.8991 |
| CF012 — Seis alimentos | 1200 kcal · P90 C145 G35 | Auto: Pechuga de pollo 1 Grs; Auto: Arroz 1 Grs; Auto: Aceite de oliva 17 Grs; Auto: Lubina 433 Grs; Auto: Papas 704 Grs; Auto: Palta 1 Grs | 1199.31 kcal · P90.23 C134.56 G33.35 | K-0.69 · P+0.23 C-10.44 G-1.65 | Advertencia: macronutrientes no alcanzables con la selección; Info: porciones recomendadas superadas intencionalmente | 24.2039 |
| CF013 — Cero kcal explícito | 500 kcal · P30 C50 G20 | Auto: Alimento sin información calórica sin cantidad | 0 kcal · P0 C0 G0 | K-500 · P-30 C-50 G-20 | Advertencia: alimento sin información calórica válida | 0.5459 |
| CF014 — P=0 neutral: arroz + almendras | 356 kcal · P0 C19.3 G41 | Auto: Arroz 12 Grs; Auto: Almendras 44 Unid | 355.22 kcal · P12.4 C15.88 G26.9 | K-0.78 · P+12.4 C-3.42 G-14.1 | Advertencia: macronutrientes no alcanzables con la selección; Info: porciones recomendadas superadas intencionalmente; Info: P=0 tratado como neutral | 1.0019 |
| CF015 — Azúcar + whey | 450 kcal · P40 C50 G10 | Auto: Azucar 70 Grs; Auto: Whey protein Isolate 44 Grs | 449.05 kcal · P40.04 C70.44 G0.79 | K-0.95 · P+0.04 C+20.44 G-9.21 | Advertencia: macronutrientes no alcanzables con la selección; Info: porciones recomendadas superadas intencionalmente | 1.4744 |
| CF016 — Step recomendado 5 ignorado | 1200 kcal · P35 C250 G10 | Auto: Arroz 354 Grs | 1198.29 kcal · P28.32 C267.27 G1.77 | K-1.71 · P-6.68 C+17.27 G-8.23 | Advertencia: macronutrientes no alcanzables con la selección; Info: porciones recomendadas superadas intencionalmente; Info: aproximación limitada por granularidad física | 1.0274 |
| CF017 — Dos unidades discretas | 700 kcal · P45 C80 G30 | Auto: Huevos 4 Unid; Auto: Banana mediana 4 Unid | 699.48 kcal · P29.16 C97.2 G21.56 | K-0.52 · P-15.84 C+17.2 G-8.44 | Advertencia: macronutrientes no alcanzables con la selección; Info: porciones recomendadas superadas intencionalmente | 0.7524 |
| CF018 — Meta consistente completa | 500 kcal · P45 C55 G11 | Auto: Pechuga de pollo 180 Grs; Auto: Arroz 73 Grs; Auto: Aceite de oliva 6 Grs | 499.95 kcal · P45.44 C55.12 G10.86 | K-0.05 · P+0.44 C+0.12 G-0.14 | Ninguno | 8.4897 |
| CF019 — Proteína vegetal + cereal + grasa | 800 kcal · P60 C90 G22 | Auto: Seitan 169 Grs; Auto: Avena instantanea 148 Grs; Auto: Palta 45 Grs | 799.05 kcal · P60.7 C89.63 G21.97 | K-0.95 · P+0.7 C-0.37 G-0.03 | Info: porciones recomendadas superadas intencionalmente | 11.8424 |
| CF020 — Alimento de baja densidad, objetivo alto | 1500 kcal · P45 C300 G25 | Auto: Sandia 4901 Grs | 1499.71 kcal · P29.41 C323.47 G9.8 | K-0.29 · P-15.59 C+23.47 G-15.2 | Advertencia: macronutrientes no alcanzables con la selección; Info: porciones recomendadas superadas intencionalmente | 0.6937 |

## Los 45 casos fijos

| ID | Perfil/tipo | Objetivo | Alimentos usados | Resultado | Estado |
|---|---|---|---|---|---|
| CF001 | A / incompleta | 903 kcal · P58.5 C38.4 G56.1 | Pechuga de pollo 817 Grs | 902.79 kcal · P179.74 C0 G20.43; K-0.21 · P+121.24 C-38.4 G-35.67 | PASS CON INFORMACIÓN |
| CF002 | E / incompleta | 903 kcal · P58.5 C38.4 G56.1 | Pechuga de pollo con piel 155 Grs; Queso cremon doble crema 199 Grs | 902.94 kcal · P58.86 C1.99 G73.42; K-0.06 · P+0.36 C-36.41 G+17.32 | PASS CON INFORMACIÓN |
| CF003 | A / incompleta | 1200 kcal · P90 C120 G40 | Pechuga de pollo 1085 Grs | 1198.93 kcal · P238.7 C0 G27.13; K-1.07 · P+148.7 C-120 G-12.87 | PASS CON INFORMACIÓN |
| CF004 | E / incompleta | 1200 kcal · P90 C100 G45 | Pechuga de pollo 410 Grs; Aceite de oliva 83 Grs | 1199.3 kcal · P90.2 C0 G93.17; K-0.7 · P+0.2 C-100 G+48.17 | PASS CON INFORMACIÓN |
| CF005 | G / apropiada | 650 kcal · P50 C70 G18 | Pechuga de pollo 197 Grs; Arroz 93 Grs; Aceite de oliva 13 Grs | 649.37 kcal · P50.78 C70.22 G18.38; K-0.63 · P+0.78 C+0.22 G+0.38 | PASS |
| CF006 | A / incompleta | 900 kcal · P70 C95 G25 | Pechuga de pollo 811 Grs; Lubina 1 Grs; Langostinos 3 Grs | 899.02 kcal · P179.02 C0 G20.33; K-0.98 · P+109.02 C-95 G-4.67 | PASS CON INFORMACIÓN |
| CF007 | B / incompleta | 900 kcal · P65 C120 G22 | Arroz 1 Grs; Avena instantanea 254 Grs; Papas 2 Grs | 899.39 kcal · P33.13 C145.92 G20.36; K-0.61 · P-31.87 C+25.92 G-1.64 | PASS CON INFORMACIÓN |
| CF008 | C / incompleta | 900 kcal · P55 C95 G33 | Aceite de oliva 1 Grs; Palta 1 Grs; Mani 149 Grs | 899.82 kcal · P41.74 C6.3 G78.63; K-0.18 · P-13.26 C-88.7 G+45.63 | PASS CON INFORMACIÓN |
| CF009 | H / incompleta | 500 kcal · P40 C20 G30 | Huevos 7 Unid | 483 kcal · P42 C0 G35; K-17 · P+2 C-20 G+5 | PASS CON INFORMACIÓN |
| CF010 | I / apropiada | 900 kcal · P60 C80 G25 | Pechuga de pollo 200 Grs; Arroz 190 Grs; Queso cremon doble crema 10 Grs | 899.85 kcal · P60.6 C143.55 G9.25; K-0.15 · P+0.6 C+63.55 G-15.75 | PASS CON INFORMACIÓN |
| CF011 | I / apropiada | 1200 kcal · P85 C130 G45 | Arroz 100 Grs; Pechuga de pollo con piel 291 Grs; Queso cremon doble crema 140 Grs | 1199.72 kcal · P85.8 C76.9 G61.25; K-0.28 · P+0.8 C-53.1 G+16.25 | PASS CON INFORMACIÓN |
| CF012 | G / apropiada | 1200 kcal · P90 C145 G35 | Pechuga de pollo 1 Grs; Arroz 1 Grs; Aceite de oliva 17 Grs; Lubina 433 Grs; Papas 704 Grs; Palta 1 Grs | 1199.31 kcal · P90.23 C134.56 G33.35; K-0.69 · P+0.23 C-10.44 G-1.65 | PASS CON INFORMACIÓN |
| CF013 | A / absurda | 500 kcal · P30 C50 G20 | Alimento sin información calórica sin cantidad | 0 kcal · P0 C0 G0; K-500 · P-30 C-50 G-20 | PASS CON INFORMACIÓN |
| CF014 | F / incompleta | 356 kcal · P0 C19.3 G41 | Arroz 12 Grs; Almendras 44 Unid | 355.22 kcal · P12.4 C15.88 G26.9; K-0.78 · P+12.4 C-3.42 G-14.1 | PASS CON INFORMACIÓN |
| CF015 | D / absurda | 450 kcal · P40 C50 G10 | Azucar 70 Grs; Whey protein Isolate 44 Grs | 449.05 kcal · P40.04 C70.44 G0.79; K-0.95 · P+0.04 C+20.44 G-9.21 | PASS CON INFORMACIÓN |
| CF016 | B / incompleta | 1200 kcal · P35 C250 G10 | Arroz 354 Grs | 1198.29 kcal · P28.32 C267.27 G1.77; K-1.71 · P-6.68 C+17.27 G-8.23 | PASS CON INFORMACIÓN |
| CF017 | H / absurda | 700 kcal · P45 C80 G30 | Huevos 4 Unid; Banana mediana 4 Unid | 699.48 kcal · P29.16 C97.2 G21.56; K-0.52 · P-15.84 C+17.2 G-8.44 | PASS CON INFORMACIÓN |
| CF018 | G / apropiada | 500 kcal · P45 C55 G11 | Pechuga de pollo 180 Grs; Arroz 73 Grs; Aceite de oliva 6 Grs | 499.95 kcal · P45.44 C55.12 G10.86; K-0.05 · P+0.44 C+0.12 G-0.14 | PASS |
| CF019 | G / apropiada | 800 kcal · P60 C90 G22 | Seitan 169 Grs; Avena instantanea 148 Grs; Palta 45 Grs | 799.05 kcal · P60.7 C89.63 G21.97; K-0.95 · P+0.7 C-0.37 G-0.03 | PASS CON INFORMACIÓN |
| CF020 | B / incompleta | 1500 kcal · P45 C300 G25 | Sandia 4901 Grs | 1499.71 kcal · P29.41 C323.47 G9.8; K-0.29 · P-15.59 C+23.47 G-15.2 | PASS CON INFORMACIÓN |
| CF021 | E / incompleta | 450 kcal · P40 C45 G12 | Pechuga de pollo 76 Grs; Aceite de oliva 10 Grs; Huevos 4 Unid | 449.89 kcal · P40.72 C0 G31.89; K-0.11 · P+0.72 C-45 G+19.89 | PASS CON INFORMACIÓN |
| CF022 | E / incompleta | 500 kcal · P45 C55 G11 | Pechuga de pollo 1 Grs; Aceite de oliva 1 Grs; Lubina 233 Grs; Palta 184 Grs | 499.15 kcal · P45.84 C7.73 G31.65; K-0.85 · P+0.84 C-47.27 G+20.65 | PASS CON INFORMACIÓN |
| CF023 | E / absurda | 600 kcal · P50 C70 G13 | Whey protein Isolate 39 Grs; Aceite de oliva 1 Grs; Filet de merluza 1 Unid; Almendras 50 Unid; Panceta 17 Grs | 599.22 kcal · P50.74 C8.14 G40.41; K-0.78 · P+0.74 C-61.86 G+27.41 | PASS CON INFORMACIÓN |
| CF024 | E / incompleta | 700 kcal · P55 C80 G18 | Pechuga de pollo 1 Grs; Aceite de oliva 1 Grs; Lubina 275 Grs; Palta 283 Grs; Langostinos 1 Grs; Mani 1 Grs | 699.15 kcal · P55.8 C11.93 G47.58; K-0.85 · P+0.8 C-68.07 G+29.58 | PASS CON INFORMACIÓN |
| CF025 | E / incompleta | 800 kcal · P60 C90 G22 | Atun en lomitos al aceite 3 Pote | 738 kcal · P90 C0 G42; K-62 · P+30 C-90 G+20 | PASS CON INFORMACIÓN |
| CF026 | F / incompleta | 1000 kcal · P80 C110 G27 | Arroz 1 Grs; Aceite de oliva 2 Grs; Avena instantanea 278 Grs | 999.93 kcal · P36.22 C159.21 G24.24; K-0.07 · P-43.78 C+49.21 G-2.76 | PASS CON INFORMACIÓN |
| CF027 | F / incompleta | 356 kcal · P0 C19.3 G41 | Arroz 12 Grs; Almendras 44 Unid | 355.22 kcal · P12.4 C15.88 G26.9; K-0.78 · P+12.4 C-3.42 G-14.1 | PASS CON INFORMACIÓN |
| CF028 | F / absurda | 250 kcal · P25 C15 G10 | Tostaditas de arroz sin sal 1 Unid; Almendras 32 Unid; Gomitas mogul 1 Unid; Palta 6 Grs | 249.34 kcal · P8.54 C7.85 G20.42; K-0.66 · P-16.46 C-7.15 G+10.42 | PASS CON INFORMACIÓN |
| CF029 | F / absurda | 350 kcal · P30 C35 G10 | Azucar 2 Grs; Aceite de oliva 1 Grs; Dextrosa 1 Grs; Panceta 67 Grs; Gomitas mogul 1 Unid | 349.47 kcal · P8.11 C4.65 G33.16; K-0.53 · P-21.89 C-30.35 G+23.16 | PASS CON INFORMACIÓN |
| CF030 | F / incompleta | 450 kcal · P40 C45 G12 | Arroz 1 Grs; Aceite de oliva 1 Grs; Avena instantanea 1 Grs; Palta 2 Grs; Papas 1 Grs; Mani 72 Grs | 449.75 kcal · P20.43 C4.62 G38.84; K-0.25 · P-19.57 C-40.38 G+26.84 | PASS CON INFORMACIÓN |
| CF031 | G / apropiada | 500 kcal · P45 C55 G11 | Pechuga de pollo 180 Grs; Arroz 73 Grs; Aceite de oliva 6 Grs | 499.95 kcal · P45.44 C55.12 G10.86; K-0.05 · P+0.44 C+0.12 G-0.14 | PASS |
| CF032 | G / apropiada | 600 kcal · P50 C70 G13 | Pechuga de pollo 202 Grs; Arroz 64 Grs; Aceite de oliva 6 Grs; Banana mediana 1 Unid | 599.67 kcal · P50.85 C72.62 G11.75; K-0.33 · P+0.85 C+2.62 G-1.25 | PASS CON INFORMACIÓN |
| CF033 | G / absurda | 700 kcal · P55 C80 G18 | Filet de merluza 234 Unid; Azucar 78 Grs; Aceite de oliva 1 Grs; Gomitas mogul 1 Unid; Huevos 1 Unid | 699.13 kcal · P55.21 C79.75 G17.7; K-0.87 · P+0.21 C-0.25 G-0.3 | PASS CON INFORMACIÓN |
| CF034 | G / apropiada | 800 kcal · P60 C90 G22 | Pechuga de pollo 188 Grs; Arroz 45 Grs; Aceite de oliva 6 Grs; Lubina 13 Grs; Avena instantanea 97 Grs; Palta 21 Grs | 799.89 kcal · P60.33 C90.15 G22; K-0.11 · P+0.33 C+0.15 G+0 | PASS |
| CF035 | G / apropiada | 1000 kcal · P80 C110 G27 | Pechuga de pollo 314 Grs; Arroz 145 Grs; Aceite de oliva 18 Grs | 999.63 kcal · P80.68 C109.48 G26.56; K-0.37 · P+0.68 C-0.52 G-0.44 | PASS CON INFORMACIÓN |
| CF036 | G / absurda | 356 kcal · P0 C19.3 G41 | Filet de merluza 1 Unid; Arroz 26 Grs; Almendras 2 Unid; Aceite de oliva 28 Grs | 355.35 kcal · P2.81 C19.94 G29.37; K-0.65 · P+2.81 C+0.64 G-11.63 | PASS CON INFORMACIÓN |
| CF037 | G / apropiada | 250 kcal · P25 C15 G10 | Claras de huevos 2 Unid; Banana mediana 1 Unid; Almendras 4 Unid; Jamon cocido feteado 2 Fetas; Mandarina mediana 1 Unid | 248.94 kcal · P16.44 C35.67 G4.5; K-1.06 · P-8.56 C+20.67 G-5.5 | PASS CON INFORMACIÓN |
| CF038 | G / apropiada | 350 kcal · P30 C35 G10 | Claras de huevos 4 Unid; Banana mediana 1 Unid; Almendras 4 Unid; Jamon cocido feteado 2 Fetas; Mandarina mediana 1 Unid; Huevos 1 Unid | 349.34 kcal · P29.44 C36.07 G9.7; K-0.66 · P-0.56 C+1.07 G-0.3 | PASS CON INFORMACIÓN |
| CF039 | H / apropiada | 450 kcal · P40 C45 G12 | Atun en lomitos al natural 1 Pote; Banana mediana 3 Unid | 437.61 kcal · P33.87 C72.9 G1.17; K-12.39 · P-6.13 C+27.9 G-10.83 | PASS CON INFORMACIÓN |
| CF040 | H / absurda | 500 kcal · P45 C55 G11 | Filet de merluza 211 Unid; Tostaditas de arroz sin sal 62 Unid | 499.71 kcal · P45.95 C55.24 G10.55; K-0.29 · P+0.95 C+0.24 G-0.45 | PASS CON INFORMACIÓN |
| CF041 | H / absurda | 600 kcal · P50 C70 G13 | Gomitas mogul 43 Unid; Almendras 40 Unid | 599.04 kcal · P13.41 C81.45 G24.4; K-0.96 · P-36.59 C+11.45 G+11.4 | PASS CON INFORMACIÓN |
| CF042 | H / absurda | 700 kcal · P55 C80 G18 | Chocolate aguila semiamargo 2 Barra; Salchichas Vienissima 1 Unid; Pan para hamburguesas 3 Unid | 698.7 kcal · P22.2 C102.3 G22.3; K-1.3 · P-32.8 C+22.3 G+4.3 | PASS CON INFORMACIÓN |
| CF043 | I / apropiada | 800 kcal · P60 C90 G22 | Claras de huevos 3 Unid; Arroz 70 Grs; Pechuga de pollo 198 Grs; Aceite de oliva 33 Grs | 799.54 kcal · P59.66 C53.45 G38.57; K-0.46 · P-0.34 C-36.55 G+16.57 | PASS CON INFORMACIÓN |
| CF044 | I / apropiada | 1000 kcal · P80 C110 G27 | Banana mediana 1 Unid; Pechuga de pollo 150 Grs; Arroz 112 Grs; Aceite de oliva 20 Grs; Lubina 202 Grs | 999.63 kcal · P79.61 C108.86 G27.31; K-0.37 · P-0.39 C-1.14 G+0.31 | PASS |
| CF045 | I / apropiada | 356 kcal · P0 C19.3 G41 | Claras de huevos 3 Unid; Arroz 70 Grs; Almendras 1 Unid; Filet de merluza 43 Unid; Gomitas mogul 1 Unid; Palta 1 Grs | 355.55 kcal · P25.48 C55.4 G3.56; K-0.45 · P+25.48 C+36.1 G-37.44 | PASS CON INFORMACIÓN |

## Lectura de warnings

- **Advertencia necesaria:** macro significativamente inalcanzable, selección incapaz de cubrirlo, unidad discreta que impide acercarse más o alimento sin kcal válida.
- **Información no bloqueante:** se superó una porción recomendada de manera intencional, P=0 neutral o el paso físico de 1 g/ml explica la pequeña diferencia.
- Las mezclas normales CF005, CF018 y CF019 completaron kcal y se acercaron a P/C/G sin warning fuerte. No se bajaron thresholds para fabricar PASS; se corrigió la comparación lexicográfica que sacrificaba C/G por centésimas de proteína.

## Casos principales

- CF002 Pechuga con piel + Queso: Pechuga de pollo con piel 155 Grs; Queso cremon doble crema 199 Grs => 902.94 kcal · P58.86 C1.99 G73.42.
- CF003 un alimento continuo a 1200 kcal: Pechuga de pollo 1085 Grs => 1198.93 kcal · P238.7 C0 G27.13.
- CF005 mezcla completa: Pechuga de pollo 197 Grs; Arroz 93 Grs; Aceite de oliva 13 Grs => 649.37 kcal · P50.78 C70.22 G18.38, desvíos K-0.63 · P+0.78 C+0.22 G+0.38.
- CF009 unidades discretas: Huevos 7 Unid => 483 kcal · P42 C0 G35; no inventa fracciones.

## Alcance y límites del informe

La matriz prueba el motor y el contrato del servicio de Tracking sin persistir logs. Confirmación/idempotencia, permisos y regresiones Admin/Coach se cubren en suites separadas del repositorio; no se infieren a partir de esta matriz. Las mediciones son locales y pueden variar bajo contención, por lo que se informa mediana/p95/máximo además del SLA.

