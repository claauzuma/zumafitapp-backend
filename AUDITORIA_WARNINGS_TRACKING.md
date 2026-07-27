# Reconciliación de warnings de Tracking

Generada: 2026-07-27T21:09:30.097Z

## Conteo matemáticamente cerrado

| Categoría | Ejecutados | PASS | PASS CON ADVERTENCIA | FAIL | Incluidos en resumen de producto |
| --- | ---: | ---: | ---: | ---: | --- |
| Fijos | 54 | 2 | 52 | 0 | Sí |
| Random reproducibles | 100 | 0 | 100 | 0 | Sí |
| Diagnósticos test-only | 6 | 0 | 6 | 0 | No |
| Subtotal producto | 154 | 2 | 152 | 0 | Sí |
| Total técnico | 160 | 2 | 158 | 0 | No; control ampliado |

Los 152 casos del cierre anterior excluían deliberadamente los seis diagnósticos. La matriz usa “PASS CON ADVERTENCIA” para toda limitación matemática relevante o diferencia secundaria que debe explicarse; no significa que los 152 casos se rendericen como error o `role="alert"`.

## Taxonomía A/B/C

| Tipo | Significado | Escenarios de producto | Presentación |
| --- | --- | ---: | --- |
| A | Limitación relevante: proteína >0,5 g, máximo real, salida de zona, meta fuerte o selección materialmente incapaz | 146 | Warning/explicación visible según la causa |
| B | Diferencia C/G pequeña o información técnica de constraints | 8 | Texto/notice informativo; nunca error |
| C | Warning demasiado sensible o falso positivo visible después de la corrección | 0 | Ninguno |

Los tipos A y B son exclusivos y suman 154/154. Los eventos A se superponen: máximos=119, fuera de zona normal=56, proteína significativa=78, meta fuerte=20, selección con déficit C/G relevante=126.

Ésta es la razón de que sólo haya dos PASS limpios: los 152 casos con advertencia se descomponen en 146 casos A con una limitación relevante y 6 casos B donde la matriz conserva una diferencia secundaria explicable. Los otros 2 casos B son los dos PASS. La UI no convierte los casos B en alerta fuerte.

Se encontró un componente C antes de esta corroboración: R014 (0.3 g). No alteraba la solución, pero se anunciaba como alerta proteica. Se corrigió sólo la presentación: hasta 0,5 g coincide con el estado exacto ya existente; el caso conserva sus warnings reales de máximo/salida de zona. El optimizador y sus thresholds permanecen intactos.

## Nueve metas fijas

Meta | Objetivo | Ejecutados | PASS | Advertencia | FAIL | A | B
--- | --- | ---: | ---: | ---: | ---: | ---: | ---:
1. Pequeña y consistente | K 250; P 25; C 15; G 10 | 5 | 0 | 5 | 0 | 5 | 0
2. Comida liviana | K 350; P 30; C 35; G 10 | 5 | 0 | 5 | 0 | 4 | 1
3. Comida media | K 450; P 40; C 45; G 12 | 6 | 0 | 6 | 0 | 6 | 0
4. Comida normal | K 500; P 45; C 55; G 11 | 8 | 0 | 8 | 0 | 6 | 2
5. Comida alta | K 600; P 50; C 70; G 13 | 7 | 0 | 7 | 0 | 6 | 1
6. Comida grande con leve inconsistencia | K 700; P 55; C 80; G 18 | 5 | 0 | 5 | 0 | 5 | 0
7. Objetivo alto | K 800; P 60; C 90; G 22 | 6 | 1 | 5 | 0 | 5 | 1
8. Objetivo muy alto | K 1000; P 80; C 110; G 27 | 6 | 1 | 5 | 0 | 5 | 1
9. Caso real incompatible | K 356; P 0; C 19.3; G 41 | 6 | 0 | 6 | 0 | 6 | 0

## Por perfil nutricional — subtotal de producto

Perfil | Ejecutados | PASS | Advertencia | FAIL | A | B
--- | ---: | ---: | ---: | ---: | ---: | ---:
A | 18 | 0 | 18 | 0 | 18 | 0
B | 17 | 0 | 17 | 0 | 17 | 0
C | 17 | 0 | 17 | 0 | 17 | 0
D | 17 | 0 | 17 | 0 | 17 | 0
E | 17 | 0 | 17 | 0 | 17 | 0
F | 18 | 0 | 18 | 0 | 17 | 1
G | 20 | 1 | 19 | 0 | 15 | 5
H | 16 | 0 | 16 | 0 | 16 | 0
I | 14 | 1 | 13 | 0 | 12 | 2

## Por cantidad de alimentos — subtotal de producto

Alimentos | Ejecutados | PASS | Advertencia | FAIL | A | B
--- | ---: | ---: | ---: | ---: | ---: | ---:
1 | 13 | 0 | 13 | 0 | 13 | 0
2 | 27 | 0 | 27 | 0 | 27 | 0
3 | 29 | 0 | 29 | 0 | 27 | 2
4 | 30 | 0 | 30 | 0 | 29 | 1
5 | 26 | 1 | 25 | 0 | 24 | 2
6 | 29 | 1 | 28 | 0 | 26 | 3

## Consistencia de las 100 metas random

Consistencia planificada | Ejecutados | PASS | Advertencia | FAIL | A | B
--- | ---: | ---: | ---: | ---: | ---: | ---:
consistente | 60 | 0 | 60 | 0 | 58 | 2
leve | 25 | 0 | 25 | 0 | 25 | 0
fuerte | 15 | 0 | 15 | 0 | 15 | 0

Consistencia recalculada | Ejecutados | PASS | Advertencia | FAIL | A | B
--- | ---: | ---: | ---: | ---: | ---: | ---:
consistente | 57 | 0 | 57 | 0 | 55 | 2
leve | 29 | 0 | 29 | 0 | 29 | 0
fuerte | 14 | 0 | 14 | 0 | 14 | 0

## Proteína — subtotal de producto

Estado | Ejecutados | PASS | Advertencia | FAIL | A | B
--- | ---: | ---: | ---: | ---: | ---: | ---:
Alcanzable | 59 | 2 | 57 | 0 | 52 | 7
Inalcanzable | 79 | 0 | 79 | 0 | 79 | 0
P=0 neutral | 16 | 0 | 16 | 0 | 15 | 1

- Ningún caso con proteína alcanzada muestra warning proteico.
- Los 16 casos con P=0 permanecen neutrales: la proteína no suma mérito ni genera advertencia.
- C/G se muestran en el bloque secundario azul y no usan semántica de error.
- La alerta fuerte queda reservada para proteína >10 g; 0,5–10 g mantiene el nivel cercano, y hasta 0,5 g no produce alerta proteica.
- Cuando la selección no entra en la zona normal, la UI muestra el mejor nivel alcanzable. Los dos casos de producto que no tenían otra alerta principal ahora reciben una advertencia específica de zona; si ya existe alerta de máximo o proteína, no se duplica.

## Diez escenarios normales auditados

Todos contienen mezcla completa, una fuente proteica, una de carbohidratos y una grasa, y metas aproximadamente consistentes. En perfiles I el objetivo listado es el restante del motor después de descontar Registrado; Fijo se conserva dentro del resultado.

ID | Objetivo | Alimentos | Cantidades | Resultado | Desvíos | Warning/mensaje actual | Razón exacta | Tipo | ¿Debe mostrarse?
--- | --- | --- | --- | --- | --- | --- | --- | --- | ---
F031 | K 500; P 45; C 55; G 11 | Pechuga de pollo; Arroz; Aceite de oliva | Pechuga de pollo=190 Grs; Arroz=70 Grs; Aceite de oliva=5 Grs | K 491.855; P 47.4; C 52.85; G 10.095 | K -8.145; P 2.4; C -2.15; G -0.905 | La propuesta alcanza la proteina y usa el mejor equilibrio disponible de carbohidratos y grasas dentro de la zona calorica. | diferencia secundaria; se muestra como información, no como error | B | Sí, sólo como información; no como error/alerta fuerte
F032 | K 600; P 50; C 70; G 13 | Pechuga de pollo; Arroz; Aceite de oliva; Banana mediana | Pechuga de pollo=230 Grs; Arroz=55 Grs; Banana mediana=1 Unid; Aceite de oliva=5 Grs | K 591.15; P 56.29; C 65.825; G 11.41 | K -8.85; P 6.29; C -4.175; G -1.59 | La propuesta alcanza la proteina y usa el mejor equilibrio disponible de carbohidratos y grasas dentro de la zona calorica. | diferencia secundaria; se muestra como información, no como error | B | Sí, sólo como información; no como error/alerta fuerte
F034 | K 800; P 60; C 90; G 22 | Pechuga de pollo; Arroz; Aceite de oliva; Lubina; Avena instantanea; Palta | Pechuga de pollo=130 Grs; Lubina=100 Grs; Arroz=65 Grs; Avena instantanea=70 Grs; Aceite de oliva=10 Grs; Palta=10 Grs | K 799.665; P 61.1; C 89.395; G 21.965 | K -0.335; P 1.1; C -0.605; G -0.035 | La propuesta alcanza la proteina y usa el mejor equilibrio disponible de carbohidratos y grasas dentro de la zona calorica. | diferencia secundaria; se muestra como información, no como error | B | Sí, sólo como información; no como error/alerta fuerte
F035 | K 1000; P 80; C 110; G 27 | Pechuga de pollo; Arroz; Aceite de oliva | Pechuga de pollo=250 Grs; Arroz=120 Grs; Aceite de oliva=30 Grs | K 952.18; P 64.6; C 90.6; G 36.82 | K -47.82; P -15.4; C -19.4; G 9.82 | Esta combinacion queda 15.4 g por debajo de tu meta de proteina. Te conviene agregar o reemplazar un alimento proteico. Las cantidades máximas configuradas para algunos alimentos limitan esta propuesta. | máximo explícito realmente limitante; fuera de la zona calórica normal; déficit proteico 15.4 g | A | Sí; la limitación es relevante
F037 | K 250; P 25; C 15; G 10 | Claras de huevos; Banana mediana; Almendras; Jamon cocido feteado; Mandarina mediana | Claras de huevos=4 Unid; Jamon cocido feteado=1 Fetas; Banana mediana=1 Unid; Mandarina mediana=1 Unid; Almendras=2 Unid | K 247.84; P 19.72; C 35.76; G 2.88 | K -2.16; P -5.28; C 20.76; G -7.12 | Faltan aproximadamente 5.3 g de proteina. Podes revisar la seleccion o continuar igualmente. Las cantidades máximas configuradas para algunos alimentos limitan esta propuesta. | máximo explícito realmente limitante; déficit proteico 5.28 g; selección incapaz de acercar C/G de forma relevante | A | Sí; la limitación es relevante
F038 | K 350; P 30; C 35; G 10 | Claras de huevos; Banana mediana; Almendras; Jamon cocido feteado; Mandarina mediana; Huevos | Claras de huevos=3 Unid; Jamon cocido feteado=4 Fetas; Banana mediana=1 Unid; Mandarina mediana=1 Unid; Almendras=1 Unid; Huevos=1 Unid | K 348.59; P 31.56; C 35.405; G 8.97 | K -1.41; P 1.56; C 0.405; G -1.03 | La propuesta alcanza la proteina y usa el mejor equilibrio disponible de carbohidratos y grasas dentro de la zona calorica. | diferencia secundaria; se muestra como información, no como error | B | Sí, sólo como información; no como error/alerta fuerte
F043 | K 752.9; P 49.5; C 89.4; G 21.7 | Claras de huevos; Arroz; Pechuga de pollo; Aceite de oliva | Pechuga de pollo=250 Grs; Arroz=70 Grs; Aceite de oliva=25 Grs | K 737.975; P 60.6; C 52.85; G 31.575 | K -14.925; P 11.1; C -36.55; G 9.875 | La propuesta alcanza la proteina y usa el mejor equilibrio disponible de carbohidratos y grasas dentro de la zona calorica. | selección incapaz de acercar C/G de forma relevante | A | Sí; la limitación es relevante
F044 | K 894.13; P 78.71; C 85.7; G 26.61 | Banana mediana; Pechuga de pollo; Arroz; Aceite de oliva; Lubina | Pechuga de pollo=150 Grs; Lubina=210 Grs; Arroz=110 Grs; Aceite de oliva=20 Grs | K 893.69; P 79.6; C 83.05; G 27.01 | K -0.44; P 0.89; C -2.65; G 0.4 | La propuesta alcanza la proteina y usa el mejor equilibrio disponible de carbohidratos y grasas dentro de la zona calorica. | diferencia secundaria; se muestra como información, no como error | B | Sí, sólo como información; no como error/alerta fuerte
X007 | K 500; P 45; C 55; G 11 | Pechuga de pollo; Arroz; Aceite de oliva | Pechuga de pollo=190 Grs; Arroz=70 Grs; Aceite de oliva=5 Grs | K 491.855; P 47.4; C 52.85; G 10.095 | K -8.145; P 2.4; C -2.15; G -0.905 | La propuesta alcanza la proteina y usa el mejor equilibrio disponible de carbohidratos y grasas dentro de la zona calorica. | diferencia secundaria; se muestra como información, no como error | B | Sí, sólo como información; no como error/alerta fuerte
R045 | K 637; P 24.6; C 83; G 23 | Atun en lomitos al natural; Manzana mediana; Dulce de leche estilo colonial (La serenisima); Huevos; Palta | Manzana mediana=1 Unid; Dulce de leche estilo colonial (La serenisima)=100 Grs; Huevos=3 Unid; Palta=5 Grs | K 627.56; P 26.07; C 77.81; G 23.56 | K -9.44; P 1.47; C -5.19; G 0.56 | La propuesta alcanza la proteina y usa el mejor equilibrio disponible de carbohidratos y grasas dentro de la zona calorica. | diferencia secundaria; se muestra como información, no como error | B | Sí, sólo como información; no como error/alerta fuerte

## Confirmaciones

1. Un resultado cercano no recibe alerta fuerte por diferencias mínimas: sí; F031, F032, F034, F038, F044, X007 y R045 quedan como información B.
2. No se muestra advertencia proteica cuando la proteína fue alcanzada: confirmado por matriz y prueba de UI.
3. P=0 continúa neutral: confirmado.
4. Metadata y diferencias secundarias no se presentan como error: confirmado; usan `role="status"` o notice informativo.
5. Advertencias fuertes: se reservan para limitaciones relevantes y no alteran el total real hasta confirmar.
