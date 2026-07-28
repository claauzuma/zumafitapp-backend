# Matriz dirigida de mejora — Tracking `calorie_fill`

Generada: 2026-07-28T03:04:29.238Z. Todos los alimentos son fixtures nutricionales embebidos de sólo lectura; esta ejecución no consulta ni modifica `fooddatabase2`.

## Resumen

- Ejecutados: 30 (10 normales, 10 limitados y 10 extremos).
- Metas distintas: 27.
- Comparaciones directas con `constrained`: 11.
- Dentro de 1 kcal: 27/30.
- Fuera de la zona por granularidad física: L02 (1.71 kcal), L03 (5.5 kcal), X02 (180 kcal).
- Excesos del techo: 0.
- Resultados no deterministas: 0.
- Fallos de contratos: 0.

La prioridad evaluada es: no superar el techo; entrar en la zona de 1 kcal o acercarse todo lo físicamente posible; alcanzar y aproximar proteína; balancear carbohidratos y grasas. Una selección incompleta puede completar calorías y aun así advertir macros imposibles.

## Resultados detallados

| ID | Nivel y caso | Meta | Cantidades `calorie_fill` | Resultado | Desvíos | Déficit kcal | Proteína | Avisos | ms |
|---|---|---|---|---|---|---:|---|---|---:|
| N01 | normal: Pollo + arroz + aceite | 650 kcal · P50 C70 G18 | Auto Pechuga de pollo: 197 Grs; Auto Arroz: 93 Grs; Auto Aceite de oliva: 13 Grs | 649.37 kcal · P50.78 C70.22 G18.38 | K-0.63 · P+0.78 C+0.22 G+0.38 | 0.627 | alcanzada/neutral | ninguno | 51.53 |
| N02 | normal: Desayuno: huevos + pan + banana | 500 kcal · P30 C60 G16 | Auto Huevos: 1 Unid; Auto Pan blanco: 123 Grs; Auto Banana: 1 Unid | 499.71 kcal · P16.64 C87.03 G9.45 | K-0.29 · P-13.36 C+27.03 G-6.55 | 0.287 | no alcanzada | macros limitados: proteina, grasas | 2.6704 |
| N03 | normal: Churrasco + papas + aceite | 700 kcal · P55 C75 G24 | Auto Churrasco magro: 187 Grs; Auto Papas: 245 Grs; Auto Aceite de oliva: 1 Grs | 699.34 kcal · P54.66 C46.55 G32.72 | K-0.66 · P-0.34 C-28.45 G+8.72 | 0.664 | alcanzada/neutral | macros limitados: carbohidratos | 17.6296 |
| N04 | normal: Pollo + fideos + queso | 800 kcal · P60 C95 G20 | Auto Pechuga de pollo: 185 Grs; Auto Fideos: 126 Grs; Auto Queso cremoso: 40 Grs | 799.94 kcal · P60.16 C94.9 G19.97 | K-0.06 · P+0.16 C-0.1 G-0.03 | 0.057 | alcanzada/neutral | ninguno | 12.0002 |
| N05 | normal: Jamón + pan + queso + manzana | 450 kcal · P30 C45 G16 | Auto Jamón cocido: 164 Grs; Auto Pan blanco: 1 Grs; Auto Manzana: 2 Unid; Auto Queso cremoso: 34 Grs | 449.46 kcal · P30.38 C46.05 G15.97 | K-0.54 · P+0.38 C+1.05 G-0.03 | 0.539 | alcanzada/neutral | supera porciones recomendadas | 5.7878 |
| N06 | normal: Pollo + arroz + almendras + banana | 600 kcal · P45 C70 G16 | Auto Pechuga de pollo: 155 Grs; Auto Arroz: 53 Grs; Auto Banana: 1 Unid; Auto Almendras: 20 Unid | 599.55 kcal · P44.83 C67.41 G16.73 | K-0.45 · P-0.17 C-2.59 G+0.73 | 0.45 | alcanzada/neutral | supera porciones recomendadas | 8.0826 |
| N07 | normal: Churrasco + fideos + aceite + manzana | 900 kcal · P70 C105 G28 | Auto Churrasco magro: 234 Grs; Auto Fideos: 63 Grs; Auto Manzana: 1 Unid; Auto Aceite de oliva: 1 Grs | 899.04 kcal · P70.58 C69.85 G37.48 | K-0.96 · P+0.58 C-35.15 G+9.48 | 0.96 | alcanzada/neutral | macros limitados: carbohidratos | 5.4654 |
| N08 | normal: Pollo + papas + pan + aceite | 750 kcal · P55 C90 G20 | Auto Pechuga de pollo: 190 Grs; Auto Papas: 37 Grs; Auto Pan blanco: 160 Grs; Auto Aceite de oliva: 9 Grs | 749.06 kcal · P54.59 C88.63 G19.58 | K-0.94 · P-0.41 C-1.37 G-0.42 | 0.94 | alcanzada/neutral | supera porciones recomendadas | 12.5205 |
| N09 | normal: Huevos + jamón + pan + banana | 550 kcal · P40 C65 G18 | Auto Huevos: 2 Unid; Auto Jamón cocido: 140 Grs; Auto Pan blanco: 72 Grs; Auto Banana: 1 Unid | 549.52 kcal · P39.76 C61.02 G16.27 | K-0.48 · P-0.24 C-3.98 G-1.73 | 0.478 | alcanzada/neutral | macros limitados: carbohidratos, grasas; supera porciones recomendadas | 3.5478 |
| N10 | normal: Cinco fuentes completas | 850 kcal · P65 C105 G24 | Auto Pechuga de pollo: 254 Grs; Auto Arroz: 1 Grs; Auto Papas: 499 Grs; Auto Queso cremoso: 1 Grs; Auto Aceite de oliva: 9 Grs | 849.08 kcal · P64.58 C95.58 G23.16 | K-0.92 · P-0.42 C-9.42 G-0.84 | 0.919 | alcanzada/neutral | macros limitados: carbohidratos; supera porciones recomendadas | 9.8439 |
| L01 | limitado: Sólo pechuga a 903 kcal | 903 kcal · P58.5 C38.4 G56.1 | Auto Pechuga de pollo: 817 Grs | 902.79 kcal · P179.74 C0 G20.43 | K-0.21 · P+121.24 C-38.4 G-35.67 | 0.215 | alcanzada/neutral | macros limitados: carbohidratos, grasas; supera porciones recomendadas | 0.5553 |
| L02 | limitado: Sólo arroz a 1200 kcal | 1200 kcal · P35 C250 G10 | Auto Arroz: 354 Grs | 1198.29 kcal · P28.32 C267.27 G1.77 | K-1.71 · P-6.68 C+17.27 G-8.23 | 1.71 | no alcanzada | limitado por granularidad física; macros limitados: proteina, grasas; supera porciones recomendadas | 0.416 |
| L03 | limitado: Sólo aceite | 500 kcal · P30 C50 G30 | Auto Aceite de oliva: 55 Grs | 494.51 kcal · P0 C0 G54.95 | K-5.49 · P-30 C-50 G+24.95 | 5.495 | no alcanzada | limitado por granularidad física; macros limitados: proteina, carbohidratos; supera porciones recomendadas | 0.3723 |
| L04 | limitado: Pollo + arroz sin grasa | 620 kcal · P55 C70 G22 | Auto Pechuga de pollo: 211 Grs; Auto Arroz: 114 Grs | 619.04 kcal · P55.54 C86.07 G5.85 | K-0.96 · P+0.54 C+16.07 G-16.15 | 0.955 | alcanzada/neutral | macros limitados: grasas | 2.3117 |
| L05 | limitado: Arroz + aceite sin proteína | 680 kcal · P60 C90 G25 | Auto Arroz: 198 Grs; Auto Aceite de oliva: 1 Grs | 679.22 kcal · P15.84 C149.49 G1.99 | K-0.78 · P-44.16 C+59.49 G-23.01 | 0.779 | no alcanzada | macros limitados: proteina, grasas; supera porciones recomendadas | 1.2667 |
| L06 | limitado: Huevos + banana, ambas unidades | 700 kcal · P45 C80 G30 | Auto Huevos: 4 Unid; Auto Banana: 4 Unid | 699.48 kcal · P29.16 C97.2 G21.56 | K-0.52 · P-15.84 C+17.2 G-8.44 | 0.52 | no alcanzada | macros limitados: proteina, grasas; supera porciones recomendadas | 0.5682 |
| L07 | limitado: 2 almendras Fijas + pollo + pan + huevos | 903 kcal · P58.5 C38.4 G56.1 | Auto Pechuga de pollo: 3 Grs; Auto Huevos: 8 Unid; Auto Pan blanco: 126 Grs; Fijo Almendras: 2 Unid | 902.38 kcal · P58.76 C64.57 G45.45 | K-0.62 · P+0.26 C+26.17 G-10.65 | 0.619 | alcanzada/neutral | macros limitados: grasas; supera porciones recomendadas | 9.5991 |
| L08 | limitado: 100 g de arroz Fijo + pollo + queso | 903 kcal · P58.5 C38.4 G56.1 | Auto Pechuga de pollo: 158 Grs; Fijo Arroz: 100 Grs; Auto Queso cremoso: 109 Grs | 902.22 kcal · P58.02 C76.59 G40.42 | K-0.78 · P-0.48 C+38.19 G-15.68 | 0.78 | alcanzada/neutral | macros limitados: grasas; supera porciones recomendadas | 2.6525 |
| L09 | limitado: Jamón + queso sin carbohidrato | 650 kcal · P65 C70 G25 | Auto Jamón cocido: 341 Grs; Auto Queso cremoso: 103 Grs | 649.04 kcal · P65.57 C1.03 G42.52 | K-0.96 · P+0.57 C-68.97 G+17.52 | 0.965 | alcanzada/neutral | macros limitados: carbohidratos; supera porciones recomendadas | 2.849 |
| L10 | limitado: Coca-Cola + alfajor | 800 kcal · P35 C120 G25 | Auto Coca-Cola: 331 ml; Auto Alfajor: 3 Unid | 799.02 kcal · P9 C136.76 G24 | K-0.98 · P-26 C+16.76 G-1 | 0.98 | no alcanzada | macros limitados: proteina; supera porciones recomendadas | 3.1926 |
| X01 | extremo: 1500 kcal sólo con pollo | 1500 kcal · P120 C180 G45 | Auto Pechuga de pollo: 1357 Grs | 1499.49 kcal · P298.54 C0 G33.93 | K-0.51 · P+178.54 C-180 G-11.07 | 0.515 | alcanzada/neutral | macros limitados: carbohidratos, grasas; supera porciones recomendadas | 0.4159 |
| X02 | extremo: 1500 kcal sólo con alfajores | 1500 kcal · P80 C200 G55 | Auto Alfajor: 6 Unid | 1320 kcal · P18 C204 G48 | K-180 · P-62 C+4 G-7 | 180 | no alcanzada | limitado por unidades enteras; macros limitados: proteina, grasas; supera porciones recomendadas | 0.3748 |
| X03 | extremo: 1200 kcal sólo con Coca-Cola | 1200 kcal · P80 C220 G35 | Auto Coca-Cola: 2855 ml | 1199.1 kcal · P0 C299.77 G0 | K-0.9 · P-80 C+79.77 G-35 | 0.9 | no alcanzada | macros limitados: proteina, grasas; supera porciones recomendadas | 0.3892 |
| X04 | extremo: Seis fuentes predominantemente proteicas | 1400 kcal · P250 C0 G40 | Auto Pechuga de pollo: 601 Grs; Auto Churrasco magro: 1 Grs; Auto Jamón cocido: 425 Grs; Auto Huevos: 1 Unid; Auto Whey protein: 48 Grs; Auto Queso cremoso: 36 Grs | 1399.1 kcal · P250.96 C0.84 G43.54 | K-0.9 · P+0.96 C+0.84 G+3.54 | 0.904 | alcanzada/neutral | supera porciones recomendadas | 19.8187 |
| X05 | extremo: Seis fuentes de carbohidratos | 1300 kcal · P40 C300 G15 | Auto Arroz: 1 Grs; Auto Papas: 2 Grs; Auto Fideos: 330 Grs; Auto Pan blanco: 1 Grs; Auto Banana: 1 Unid; Auto Coca-Cola: 1 ml | 1299.93 kcal · P37.78 C273.55 G6.07 | K-0.07 · P-2.22 C-26.45 G-8.93 | 0.068 | no alcanzada | macros limitados: proteina, carbohidratos, grasas; supera porciones recomendadas | 19.302 |
| X06 | extremo: Seis alimentos mezclados | 1500 kcal · P120 C180 G45 | Auto Pechuga de pollo: 477 Grs; Auto Huevos: 1 Unid; Auto Arroz: 9 Grs; Auto Banana: 6 Unid; Auto Aceite de oliva: 26 Grs; Auto Queso cremoso: 1 Grs | 1499.11 kcal · P119.54 C152.6 G45.61 | K-0.89 · P-0.46 C-27.4 G+0.61 | 0.894 | alcanzada/neutral | macros limitados: carbohidratos; supera porciones recomendadas | 11.3544 |
| X07 | extremo: Proteína cero neutral | 900 kcal · P0 C120 G45 | Auto Arroz: 152 Grs; Auto Almendras: 1 Unid; Auto Aceite de oliva: 42 Grs | 899.29 kcal · P12.42 C114.92 G43.33 | K-0.71 · P+12.42 C-5.08 G-1.67 | 0.708 | alcanzada/neutral | supera porciones recomendadas | 7.4417 |
| X08 | extremo: Carbohidratos cero | 1000 kcal · P100 C0 G60 | Auto Pechuga de pollo: 154 Grs; Auto Huevos: 11 Unid; Auto Queso cremoso: 7 Grs; Auto Aceite de oliva: 5 Grs | 999.12 kcal · P100.86 C0.07 G66.16 | K-0.88 · P+0.86 C+0.07 G+6.16 | 0.885 | alcanzada/neutral | supera porciones recomendadas | 7.2856 |
| X09 | extremo: Grasas cero | 1000 kcal · P80 C170 G0 | Auto Pechuga de pollo: 289 Grs; Auto Arroz: 199 Grs; Auto Fideos: 1 Grs; Auto Pan blanco: 1 Grs | 999.19 kcal · P79.69 C151.51 G8.27 | K-0.81 · P-0.31 C-18.49 G+8.27 | 0.806 | alcanzada/neutral | macros limitados: carbohidratos; supera porciones recomendadas | 13.328 |
| X10 | extremo: Meta fuertemente incompatible y selección alocada | 500 kcal · P150 C150 G80 | Auto Huevos: 3 Unid; Auto Alfajor: 1 Unid; Auto Coca-Cola: 7 ml; Auto Aceite de oliva: 1 Grs; Auto Queso cremoso: 17 Grs | 499.62 kcal · P23.38 C34.91 G29.61 | K-0.38 · P-126.62 C-115.09 G-50.39 | 0.379 | no alcanzada | macros limitados: proteina, carbohidratos, grasas | 3.0492 |

## Comparaciones con Respetar porciones

| ID | `constrained` | `calorie_fill` | Diferencia principal |
|---|---|---|---|
| N01 | 648.71 kcal · P57.8 C67.95 G16.19; Auto Pechuga de pollo: 230 Grs; Auto Arroz: 90 Grs; Auto Aceite de oliva: 10 Grs | 649.37 kcal · P50.78 C70.22 G18.38; Auto Pechuga de pollo: 197 Grs; Auto Arroz: 93 Grs; Auto Aceite de oliva: 13 Grs | reduce el déficit calórico en 0.66 kcal; calorie_fill puede superar recomendaciones, no el techo |
| N02 | 497.74 kcal · P24.61 C60 G17.7; Auto Huevos: 3 Unid; Auto Pan blanco: 70 Grs; Auto Banana: 1 Unid | 499.71 kcal · P16.64 C87.03 G9.45; Auto Huevos: 1 Unid; Auto Pan blanco: 123 Grs; Auto Banana: 1 Unid | reduce el déficit calórico en 1.97 kcal; calorie_fill puede superar recomendaciones, no el techo |
| N03 | 694.67 kcal · P56.89 C32.3 G37.54; Auto Churrasco magro: 200 Grs; Auto Papas: 170 Grs; Auto Aceite de oliva: 5 Grs | 699.34 kcal · P54.66 C46.55 G32.72; Auto Churrasco magro: 187 Grs; Auto Papas: 245 Grs; Auto Aceite de oliva: 1 Grs | reduce el déficit calórico en 4.67 kcal; calorie_fill puede superar recomendaciones, no el techo |
| N04 | 794.96 kcal · P62.8 C90.4 G20.24; Auto Pechuga de pollo: 200 Grs; Auto Fideos: 120 Grs; Auto Queso cremoso: 40 Grs | 799.94 kcal · P60.16 C94.9 G19.97; Auto Pechuga de pollo: 185 Grs; Auto Fideos: 126 Grs; Auto Queso cremoso: 40 Grs | reduce el déficit calórico en 4.98 kcal; calorie_fill puede superar recomendaciones, no el techo |
| N05 | 448.51 kcal · P25.13 C40.95 G20.47; Auto Jamón cocido: 100 Grs; Auto Pan blanco: 35 Grs; Auto Manzana: 1 Unid; Auto Queso cremoso: 50 Grs | 449.46 kcal · P30.38 C46.05 G15.97; Auto Jamón cocido: 164 Grs; Auto Pan blanco: 1 Grs; Auto Manzana: 2 Unid; Auto Queso cremoso: 34 Grs | reduce el déficit calórico en 0.95 kcal; calorie_fill puede superar recomendaciones, no el techo |
| L01 | 276.25 kcal · P55 C0 G6.25; Auto Pechuga de pollo: 250 Grs | 902.79 kcal · P179.74 C0 G20.43; Auto Pechuga de pollo: 817 Grs | reduce el déficit calórico en 626.53 kcal; calorie_fill puede superar recomendaciones, no el techo |
| L07 | 896.68 kcal · P89.02 C64.06 G31.6; Auto Pechuga de pollo: 250 Grs; Auto Huevos: 4 Unid; Auto Pan blanco: 125 Grs; Fijo Almendras: 2 Unid | 902.38 kcal · P58.76 C64.57 G45.45; Auto Pechuga de pollo: 3 Grs; Auto Huevos: 8 Unid; Auto Pan blanco: 126 Grs; Fijo Almendras: 2 Unid | reduce el déficit calórico en 5.7 kcal; calorie_fill puede superar recomendaciones, no el techo |
| L10 | 650 kcal · P6 C120.5 G16; Auto Coca-Cola: 500 ml; Auto Alfajor: 2 Unid | 799.02 kcal · P9 C136.76 G24; Auto Coca-Cola: 331 ml; Auto Alfajor: 3 Unid | reduce el déficit calórico en 149.02 kcal; calorie_fill puede superar recomendaciones, no el techo |
| X02 | 440 kcal · P6 C68 G16; Auto Alfajor: 2 Unid | 1320 kcal · P18 C204 G48; Auto Alfajor: 6 Unid | reduce el déficit calórico en 880 kcal; calorie_fill puede superar recomendaciones, no el techo |
| X06 | 1483.82 kcal · P101.98 C136.23 G59; Auto Pechuga de pollo: 250 Grs; Auto Huevos: 4 Unid; Auto Arroz: 115 Grs; Auto Banana: 2 Unid; Auto Aceite de oliva: 5 Grs; Auto Queso cremoso: 80 Grs | 1499.11 kcal · P119.54 C152.6 G45.61; Auto Pechuga de pollo: 477 Grs; Auto Huevos: 1 Unid; Auto Arroz: 9 Grs; Auto Banana: 6 Unid; Auto Aceite de oliva: 26 Grs; Auto Queso cremoso: 1 Grs | reduce el déficit calórico en 15.29 kcal; calorie_fill puede superar recomendaciones, no el techo |
| X10 | 489.35 kcal · P11.8 C55.2 G24.6; Auto Huevos: 1 Unid; Auto Alfajor: 1 Unid; Auto Coca-Cola: 200 ml; Auto Aceite de oliva: 5 Grs; Auto Queso cremoso: 20 Grs | 499.62 kcal · P23.38 C34.91 G29.61; Auto Huevos: 3 Unid; Auto Alfajor: 1 Unid; Auto Coca-Cola: 7 ml; Auto Aceite de oliva: 1 Grs; Auto Queso cremoso: 17 Grs | reduce el déficit calórico en 10.27 kcal; calorie_fill puede superar recomendaciones, no el techo |

## Lectura funcional

- Los casos normales combinan fuentes de proteína, carbohidratos y grasas; si los alimentos permiten aproximar los macros, el motor usa esa mezcla dentro de la zona calórica.
- Los casos limitados verifican fuentes faltantes, cantidades Fijas, unidades enteras y selecciones con sólo uno o dos perfiles.
- Los casos extremos verifican 1200–1500 kcal, seis alimentos del mismo perfil, P/C/G en cero y metas fuertemente incompatibles.
- `supera porciones recomendadas` es información esperable del modo Completar calorías; los mínimos, máximos y steps recomendados no bloquean este modo.
- `macros limitados` no significa que el cálculo calórico falló: indica que la selección no tiene la composición necesaria para cuadrar esos macros.

