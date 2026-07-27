# Auditoría de seguridad Admin/Coach

Se ejecutaron 24 fixtures funcionales (12 Admin y 12 Coach) contra snapshots congelados del comportamiento anterior. No se consultó ni modificó persistencia durante esta ejecución.

Flujo | Caso | Contrato | Motor | Policy antes | Policy después | Resultado antes (cantidades/unidad y kcal/P/C/G) | Resultado después | Diferencia | Restricción antes incumplida | Causa | Regresión
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
Admin | N01 | normal pollo/arroz/aceite | menu2 histórico | ninguna | ninguna | Pechuga de pollo=143 g; Arroz=64 g; Aceite de oliva=14 g / K 500.9; P 35; C 51.2; G 14 | Pechuga de pollo=140 Grs; Arroz=75 Grs; Aceite de oliva=10 Grs / K 498.48; P 36.8; C 56.63; G 13.87 | Δ K -2.42; P 1.8; C 5.43; G -0.13 | Pechuga de pollo=143 fuera de 80–250/step 10; Arroz=64 fuera de 30–120/step 5; Aceite de oliva=14 fuera de 5–30/step 5 | constraints/normalización; precisión del payload | no
Coach | N02 | normal merluza/arroz cocido/palta | menu2 histórico | ninguna | ninguna | Merluza=175 g; Arroz integral (Cocido)=144 g; Palta=51 g / K 450; P 35; C 28.8; G 10.2 | Merluza=140 Grs; Arroz integral (Cocido)=210 Grs; Palta=25 Grs / K 446.3; P 35.36; C 49.35; G 11.94 | Δ K -3.7; P 0.36; C 20.55; G 1.74 | Merluza=175 fuera de 80–250/step 10; Arroz integral (Cocido)=144 fuera de 80–350/step 10; Palta=51 fuera de 5–30/step 5 | constraints/normalización; precisión del payload | no
Admin | N03 | normal jamon/papas/aceite | menu2 histórico | ninguna | ninguna | Jamon cocido=150 g; Papas=160 g; Aceite de oliva=10 g / K 400; P 30; C 32; G 10 | Jamon cocido=150 Grs; Papas=210 Grs; Aceite de oliva=5 Grs / K 402.73; P 30.57; C 40.65; G 13.1 | Δ K 2.73; P 0.57; C 8.65; G 3.1 | ninguna | precisión del payload | no
Coach | N04 | normal medallon/fideos/mani | menu2 histórico | ninguna | ninguna | Medallones de merluza=92 g; Fideos=82 g; Mani=28 g / K 520.4; P 35; C 57.4; G 14 | Medallones de merluza=120 Grs; Fideos=90 Grs; Mani=20 Grs / K 520.58; P 34.73; C 65.94; G 13.1 | Δ K 0.18; P -0.27; C 8.54; G -0.9 | Medallones de merluza=92 fuera de 80–250/step 10; Fideos=82 fuera de 30–120/step 5; Mani=28 fuera de 5–30/step 5 | constraints/normalización; precisión del payload | no
Admin | N05 | normal pollo/noquis/palta | menu2 histórico | ninguna | ninguna | Pechuga de pollo=132 g; Noquis con papa=156 g; Palta=70 g / K 600.4; P 42; C 62.4; G 14 | Pechuga de pollo=140 Grs; Noquis con papa=180 Grs; Palta=30 Grs / K 595.94; P 42.02; C 80.46; G 11.78 | Δ K -4.46; P 0.02; C 18.06; G -2.22 | Pechuga de pollo=132 fuera de 80–250/step 10; Noquis con papa=156 fuera de 80–350/step 10; Palta=70 fuera de 5–30/step 5 | constraints/normalización | no
Coach | U01 | unidades huevo/pan | menu2 histórico | ninguna | ninguna | Pan lactal=3 Reb; Huevos=2 Unid / K 323.4; P 20.1; C 36; G 11.2 | Pan lactal=3 Reb; Huevos=2 Unid / K 323.25; P 19.95; C 36; G 11.05 | Δ K -0.15; P -0.15; C 0; G -0.15 | ninguna | sin cambio numérico | no
Admin | U02 | unidades claras/banana | menu2 histórico | ninguna | ninguna | Claras de huevos=6 Unid; Banana mediana=2 Unid / K 306; P 23.6; C 49.8; G 1.4 | Claras de huevos=6 Unid; Banana mediana=2 Unid / K 305.94; P 23.58; C 49.8; G 1.38 | Δ K -0.06; P -0.02; C 0; G -0.02 | ninguna | sin cambio numérico | no
Coach | U03 | fetas/rebanadas | menu2 histórico | ninguna | ninguna | Jamon cagnoli=3 Fetas; Pan lactal=4 Reb / K 317.7; P 21; C 48; G 4.9 | Jamon cagnoli=3 Fetas; Pan lactal=4 Reb / K 317.5; P 20.8; C 48; G 4.7 | Δ K -0.2; P -0.2; C 0; G -0.2 | ninguna | sin cambio numérico | no
Admin | U04 | pote/fruta/almendras | menu2 histórico | ninguna | ninguna | Yogurisimo firme la serenisima (190 grs)=2 Pote; Banana chica=2 Unid; Almendras=1 Unid / K 488.8; P 16.7; C 85.6; G 8.8 | Yogurisimo firme la serenisima (190 grs)=2 Pote; Banana chica=2 Unid; Almendras=1 Unid / K 488.69; P 16.66; C 85.56; G 8.87 | Δ K -0.11; P -0.04; C -0.04; G 0.07 | ninguna | sin cambio numérico | no
Coach | U05 | unidades snacks incompletos | menu2 histórico | ninguna | ninguna | Galletitas de avena carrefour=1 Unid; Nuggets de pollo fritas (Granja del sol)=7 Unid / K 495.3; P 23.3; C 33.1; G 30.3 | Galletitas de avena carrefour=3 Unid; Nuggets de pollo fritas (Granja del sol)=3 Unid / K 362.78; P 12.23; C 36.2; G 18.78 | Δ K -132.52; P -11.07; C 3.1; G -11.52 | Nuggets de pollo fritas (Granja del sol)=7 fuera de 1–3/step 1 | constraints/normalización | no
Admin | G01 | solo pollo por gramos | menu2 histórico | ninguna | ninguna | Pechuga de pollo=227 g / K 249.7; P 45.4; C 0; G 0 | Pechuga de pollo=230 Grs / K 254.15; P 50.6; C 0; G 5.75 | Δ K 4.45; P 5.2; C 0; G 5.75 | Pechuga de pollo=227 fuera de 80–250/step 10 | constraints/normalización | no
Coach | G02 | solo arroz por gramos | menu2 histórico | ninguna | ninguna | Arroz=103 g / K 350.2; P 10.3; C 82.4; G 0 | Arroz=105 Grs / K 355.42; P 8.4; C 79.28; G 0.53 | Δ K 5.22; P -1.9; C -3.12; G 0.53 | Arroz=103 fuera de 30–120/step 5 | constraints/normalización | no
Admin | G03 | solo aceite por gramos | menu2 histórico | ninguna | ninguna | Aceite de oliva=11 g / K 99; P 0; C 0; G 11 | Aceite de oliva=10 Grs / K 89.91; P 0; C 0; G 9.99 | Δ K -9.09; P 0; C 0; G -1.01 | Aceite de oliva=11 fuera de 5–30/step 5 | constraints/normalización | no
Coach | S01 | steps 10/5/5 | menu2 histórico | ninguna | ninguna | Banana=50 g; Avena instantanea=65 g; Mantequilla de mani=39 g / K 502.6; P 18.2; C 52.9; G 26 | Banana=80 Grs; Avena instantanea=80 Grs; Mantequilla de mani=25 Grs / K 500.38; P 17.53; C 64.5; G 19.14 | Δ K -2.22; P -0.67; C 11.6; G -6.86 | Banana=50 fuera de 80–250/step 10; Mantequilla de mani=39 fuera de 5–30/step 5 | constraints/normalización; precisión del payload | no
Admin | S02 | steps 25/5 | menu2 histórico | ninguna | ninguna | Yogurt bebible vida light=400 g; Leche de almendras=40 g / K 128; P 0; C 0; G 0 | Yogurt bebible vida light=200 Grs; Leche de almendras=300 Grs / K 132.05; P 7; C 19.6; G 2.85 | Δ K 4.05; P 7; C 19.6; G 2.85 | Leche de almendras=40 fuera de 100–300/step 25; Yogurt bebible vida light=400 fuera de 10–200/step 5 | constraints/normalización | no
Coach | S03 | steps 10/10 | menu2 histórico | ninguna | ninguna | Arroz integral (Cocido)=100 g; Noquis con papa=200 g / K 550; P 20; C 100; G 0 | Arroz integral (Cocido)=80 Grs; Noquis con papa=210 Grs / K 547.25; P 14.47; C 110.8; G 5.13 | Δ K -2.75; P -5.53; C 10.8; G 5.13 | ninguna | precisión del payload | no
Admin | H01 | homonimo almendras canonical/legacy | menu2 histórico | ninguna | ninguna | Arroz=96 g; Almendras=4 Unid / K 355.2; P 10.8; C 77.6; G 2.4 | Arroz=100 Grs; Almendras=2 Unid / K 352.8; P 8.52; C 75.81; G 1.72 | Δ K -2.4; P -2.28; C -1.79; G -0.68 | Arroz=96 fuera de 30–120/step 5; Almendras=4 fuera de 1–3/step 1 | constraints/normalización; identidad exacta de homónimos | no
Coach | H02 | homonimo merluza canonical/legacy | menu2 histórico | ninguna | ninguna | Merluza=63 g; Fideos (Cocidos)=234 g / K 450; P 36; C 70.2; G 0 | Merluza=120 Grs; Fideos (Cocidos)=190 Grs / K 448.27; P 36.22; C 59.85; G 7.11 | Δ K -1.73; P 0.22; C -10.35; G 7.11 | Merluza=63 fuera de 80–250/step 10; Fideos (Cocidos)=234 fuera de 80–350/step 10 | constraints/normalización; precisión del payload; identidad exacta de homónimos | no
Admin | R01 | maximo restrictivo arroz/almendras | menu2 histórico | ninguna | ninguna | Arroz=96 g; Almendras=4 Unid / K 355.2; P 10.8; C 77.6; G 2.4 | Arroz=100 Grs; Almendras=2 Unid / K 352.8; P 8.52; C 75.81; G 1.72 | Δ K -2.4; P -2.28; C -1.79; G -0.68 | Arroz=96 fuera de 30–120/step 5; Almendras=4 fuera de 1–3/step 1 | constraints/normalización | no
Coach | R02 | maximo restrictivo filet por unidad | menu2 histórico | ninguna | ninguna | Filet de merluza=12 Unid / K 15.6; P 2.4; C 0; G 1.2 | Filet de merluza=3 Unid / K 3.87; P 0.63; C 0; G 0.15 | Δ K -11.73; P -1.77; C 0; G -1.05 | Filet de merluza=12 fuera de 1–3/step 1 | constraints/normalización | no
Admin | X01 | combinacion absurda Rhodesia/aceite | menu2 histórico | ninguna | ninguna | Rhodesia=12 Unid; Aceite de oliva=25 g / K 239.4; P 0; C 1.2; G 26.2 | Rhodesia=3 Unid; Aceite de oliva=30 Grs / K 273.19; P 0.03; C 0.41; G 30.16 | Δ K 33.79; P 0.03; C -0.79; G 3.96 | Rhodesia=12 fuera de 1–3/step 1 | constraints/normalización | no
Coach | X02 | homonimo mismo nombre distinta unidad | menu2 histórico | ninguna | ninguna | Tostaditas de arroz sin sal=12 Unid / K 44.4; P 0; C 10.8; G 0 | Tostaditas de arroz sin sal=3 Unid / K 11.01; P 0.08; C 2.67; G 0 | Δ K -33.39; P 0.08; C -8.13; G 0 | Tostaditas de arroz sin sal=12 fuera de 1–3/step 1 | constraints/normalización; identidad exacta de homónimos | no
Admin | F01 | pollo fijo, arroz/aceite auto | menu2 histórico | ninguna | ninguna | Pechuga de pollo=120 g; Arroz=77 g; Aceite de oliva=12 g / K 501.8; P 31.7; C 61.6; G 12 | Pechuga de pollo=120 Grs; Arroz=85 Grs; Aceite de oliva=10 Grs / K 510.23; P 33.2; C 64.18; G 13.42 | Δ K 8.43; P 1.5; C 2.58; G 1.42 | Arroz=77 fuera de 30–120/step 5; Aceite de oliva=12 fuera de 5–30/step 5 | constraints/normalización; precisión del payload | no
Coach | F02 | huevos fijos, pan/banana auto | menu2 histórico | ninguna | ninguna | Huevos=2 Unid; Pan lactal=5 Reb; Banana chica=1 Unid / K 537.2; P 26.6; C 80.7; G 12.3 | Huevos=2 Unid; Pan lactal=4 Reb; Banana chica=1 Unid / K 475.17; P 23.7; C 68.7; G 11.73 | Δ K -62.03; P -2.9; C -12; G -0.57 | Pan lactal=5 fuera de 1–4/step 1 | constraints/normalización | no

## Resumen de causas de los 20 cambios numéricos

Las incidencias por causa se superponen. La columna “Sólo esa causa” y la fila “más de una causa” forman buckets exclusivos: 3 + 5 + 2 + 0 + 10 = 20.

Causa | Incidencia | Sólo esa causa | Casos
--- | ---: | ---: | ---
steps | 11 | 3 | N01, N02, N04, N05, G01, G02, G03, H01, H02, R01, F01
mínimos/máximos | 12 | 5 | N02, N05, U05, S01, S02, H01, H02, R01, R02, X01, X02, F02
precisión | 8 | 2 | N01, N02, N03, N04, S01, S03, H02, F01
homónimos | 3 | 0 | H01, H02, X02
más de una causa | 10 | 10 | N01, N02, N04, N05, S01, H01, H02, R01, X02, F01

- Cambiaron sólo por steps: 3.
- Cambiaron sólo por mínimos/máximos: 5.
- Cambiaron sólo por precisión: 2.
- Cambiaron sólo por homónimos: 0.
- Cambiaron por más de una causa: 10.
- Incidencias brutas: steps=11, mínimos/máximos=12, precisión=8, homónimos=3.
- Ninguno de estos cambios se debe a `tracking_remaining_v2`: la policy antes/después continúa siendo ninguna y `optimization` continúa en `null`.

## Conclusión

- Policy histórica: se conserva; `optimization` es `null` antes y después en los 24 fixtures, incluso con el booleano legacy.
- Resultados numéricos modificados: 20/24. Es intencional: ahora respetan los mínimos, máximos y steps reales del catálogo y reciben macros sin el redondeo destructivo a un decimal.
- Violaciones del snapshot anterior: 32 cantidades fuera de los constraints reales; después: 0.
- Metadata de máximos corregida: 24/24.
- Contratos cubiertos: comidas automáticas normales, `selectedOnly`, `fixedFoods`, gramos, `Grs`, unidades, fetas, rebanadas, potes, steps, mínimos/máximos, homónimos por ID y homónimos simultáneos con distinta unidad.
- Tracking usa exclusivamente `tracking_remaining_v2`; Admin y Coach no reciben esa policy por inferencia ni por el booleano histórico.
- Precisión del payload: se compara por separado `currentLegacyInput` contra `current`; no se atribuye a la policy.
- Alias `Grs`: cubierto por contrato específico; se interpreta como gramos una sola vez y conserva la unidad serializada.
- Persistencia: abrir un menú o snapshot no llama al generador ni reescribe cantidades. Los cambios aparecen sólo ante una solicitud explícita de nuevo cálculo/recalculo.
