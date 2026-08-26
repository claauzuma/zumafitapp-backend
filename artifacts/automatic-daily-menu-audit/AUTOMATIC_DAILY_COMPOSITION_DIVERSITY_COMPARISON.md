# Comparación de diversidad semántica diaria

- Exactas en matriz diaria: 5 → 0.
- Solapamientos altos en matriz diaria: 11 → 1.
- Definición exacta: mismo conjunto de foodId, ignorando cantidad, unidad y orden.
- Definición solapamiento alto: al menos dos alimentos y Jaccard >= 0.60 o containment >= 0.80.

## Pares detectados antes

- daily-3-medium-custom: almuerzo [Aceite de coco 20 Grs + Anana 80 Grs + Arroz 130 Grs + Atun en lomitos al natural 1 Pote + Claras de huevos 4 Unid] ↔ cena [Aceite de coco 20 Grs + Anana 100 Grs + Arroz 100 Grs + Atun en lomitos al natural 1 Pote + Claras de huevos 3 Unid]; exact=true; J=1; containment=1.
- daily-4-high-balanced: desayuno [Avena instantanea 115 Grs + Claras de huevos 5 Unid + Huevos 1 Unid] ↔ merienda [Almendras 1 Unid + Anana 150 Grs + Avena instantanea 30 Grs + Claras de huevos 3 Unid + Copos de maiz sin azucar 30 Grs + Huevos 3 Unid]; exact=false; J=0.5; containment=1.
- daily-5-medium-custom: desayuno [Avena instantanea 65 Grs + Claras de huevos 3 Unid + Huevos 1 Unid] ↔ snack [Avena instantanea 60 Grs + Claras de huevos 4 Unid + Huevos 1 Unid]; exact=true; J=1; containment=1.
- daily-5-high-balanced: desayuno [Almendras 1 Unid + Anana 80 Grs + Avena instantanea 30 Grs + Claras de huevos 4 Unid + Copos de maiz sin azucar 35 Grs + Huevos 3 Unid] ↔ snack [Almendras 3 Unid + Anana 140 Grs + Avena instantanea 55 Grs + Claras de huevos 1 Unid + Copos de maiz sin azucar 5 Grs + Huevos 4 Unid]; exact=true; J=1; containment=1.
- daily-6-low-custom: desayuno [Avena instantanea 75 Grs + Claras de huevos 3 Unid + Copos de maiz sin azucar 5 Grs] ↔ colacion [Almendras 2 Unid + Anana 80 Grs + Avena instantanea 40 Grs + Claras de huevos 3 Unid + Copos de maiz sin azucar 5 Grs + Huevos 1 Unid]; exact=false; J=0.5; containment=1.
- daily-6-low-custom: desayuno [Avena instantanea 75 Grs + Claras de huevos 3 Unid + Copos de maiz sin azucar 5 Grs] ↔ snack [Almendras 1 Unid + Anana 100 Grs + Avena instantanea 40 Grs + Claras de huevos 3 Unid + Copos de maiz sin azucar 5 Grs + Huevos 1 Unid]; exact=false; J=0.5; containment=1.
- daily-6-low-custom: colacion [Almendras 2 Unid + Anana 80 Grs + Avena instantanea 40 Grs + Claras de huevos 3 Unid + Copos de maiz sin azucar 5 Grs + Huevos 1 Unid] ↔ snack [Almendras 1 Unid + Anana 100 Grs + Avena instantanea 40 Grs + Claras de huevos 3 Unid + Copos de maiz sin azucar 5 Grs + Huevos 1 Unid]; exact=true; J=1; containment=1.
- daily-6-medium-balanced: merienda [Almendras 3 Unid + Anana 80 Grs + Avena instantanea 65 Grs + Claras de huevos 5 Unid + Copos de maiz sin azucar 5 Grs + Huevos 1 Unid] ↔ snack [Almendras 1 Unid + Anana 140 Grs + Avena instantanea 30 Grs + Claras de huevos 6 Unid + Copos de maiz sin azucar 40 Grs]; exact=false; J=0.833333; containment=1.
- daily-6-high-balanced: colacion [Avena instantanea 100 Grs + Claras de huevos 5 Unid + Huevos 1 Unid] ↔ merienda [Avena instantanea 75 Grs + Huevos 3 Unid]; exact=false; J=0.666667; containment=1.
- daily-6-high-balanced: colacion [Avena instantanea 100 Grs + Claras de huevos 5 Unid + Huevos 1 Unid] ↔ snack [Avena instantanea 95 Grs + Claras de huevos 4 Unid + Huevos 2 Unid]; exact=true; J=1; containment=1.
- daily-6-high-balanced: merienda [Avena instantanea 75 Grs + Huevos 3 Unid] ↔ snack [Avena instantanea 95 Grs + Claras de huevos 4 Unid + Huevos 2 Unid]; exact=false; J=0.666667; containment=1.

## Pares detectados después

- daily-5-high-balanced: desayuno [Almendras 1 Unid + Anana 80 Grs + Avena instantanea 30 Grs + Claras de huevos 4 Unid + Copos de maiz sin azucar 35 Grs + Huevos 3 Unid] ↔ snack [Avena instantanea 90 Grs + Huevos 4 Unid]; exact=false; J=0.333333; containment=1.
