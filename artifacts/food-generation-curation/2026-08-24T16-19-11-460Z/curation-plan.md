# Plan de curación de generation

- Base/colección: base2/fooddatabase2
- Total auditado: 574
- Documentos a modificar: 187
- GENERIC antes → después: 7 → 191
- Revisión manual: 154
- GENERIC sin portionRule completa después: 189

## Cambios de roles/mealTypes

### REGLA_EXPLICITA_ACEITES

- 1 · Aceite de coco · EXPLICIT_ONLY → GENERIC · roles — → G · momentos — → lunch, dinner · Aceite alimentario: complemento graso limitado a almuerzo y cena.

### INFERENCIA_ALTA_COMPLEMENTO_GRASO

- 3 · Aceitunas negras · EXPLICIT_ONLY → GENERIC · roles G → G · momentos — → lunch, dinner · Aceituna: complemento graso salado para almuerzo/cena.
- 4 · Aceitunas verdes · EXPLICIT_ONLY → GENERIC · roles — → G · momentos — → lunch, dinner · Aceituna: complemento graso salado para almuerzo/cena.

### REGLA_EXPLICITA_FRUTOS_SECOS

- 34 · Almendras · EXPLICIT_ONLY → GENERIC · roles — → G · momentos — → breakfast, lunch, snack, dinner, extraSnack · Fruto seco inequívoco: complemento graso utilizable también en platos principales.
- 48 · Avellanas · EXPLICIT_ONLY → GENERIC · roles — → G · momentos — → breakfast, lunch, snack, dinner, extraSnack · Fruto seco inequívoco: complemento graso utilizable también en platos principales.
- 94 · Castañas · EXPLICIT_ONLY → GENERIC · roles — → G · momentos — → breakfast, lunch, snack, dinner, extraSnack · Fruto seco inequívoco: complemento graso utilizable también en platos principales.
- 96 · Castañas de caju · EXPLICIT_ONLY → GENERIC · roles — → G · momentos — → breakfast, lunch, snack, dinner, extraSnack · Fruto seco inequívoco: complemento graso utilizable también en platos principales.
- 282 · Mani · EXPLICIT_ONLY → GENERIC · roles — → G · momentos — → breakfast, lunch, snack, dinner, extraSnack · Fruto seco inequívoco: complemento graso utilizable también en platos principales.
- 349 · Nueces peladas · EXPLICIT_ONLY → GENERIC · roles — → G · momentos — → breakfast, lunch, snack, dinner, extraSnack · Fruto seco inequívoco: complemento graso utilizable también en platos principales.
- 415 · Pistachos · EXPLICIT_ONLY → GENERIC · roles — → G · momentos — → breakfast, lunch, snack, dinner, extraSnack · Fruto seco inequívoco: complemento graso utilizable también en platos principales.

### REGLA_EXPLICITA_FRUTAS

- 35 · Anana · EXPLICIT_ONLY → GENERIC · roles — → F · momentos — → breakfast, lunch, snack, dinner, extraSnack · Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
- 36 · Arandanos · EXPLICIT_ONLY → GENERIC · roles — → F · momentos — → breakfast, lunch, snack, dinner, extraSnack · Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
- 51 · Banana · GENERIC → GENERIC · roles F → F · momentos lunch, dinner → breakfast, lunch, snack, dinner, extraSnack · Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
- 52 · Banana chica · EXPLICIT_ONLY → GENERIC · roles — → F · momentos — → breakfast, lunch, snack, dinner, extraSnack · Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
- 53 · Banana grande · EXPLICIT_ONLY → GENERIC · roles — → F · momentos — → breakfast, lunch, snack, dinner, extraSnack · Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
- 54 · Banana mediana · EXPLICIT_ONLY → GENERIC · roles — → F · momentos — → breakfast, lunch, snack, dinner, extraSnack · Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
- 102 · Cerezas · EXPLICIT_ONLY → GENERIC · roles — → F · momentos — → breakfast, lunch, snack, dinner, extraSnack · Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
- 104 · Chirimoya · EXPLICIT_ONLY → GENERIC · roles — → F · momentos — → breakfast, lunch, snack, dinner, extraSnack · Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
- 114 · Ciruela · EXPLICIT_ONLY → GENERIC · roles — → F · momentos — → breakfast, lunch, snack, dinner, extraSnack · Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
- 132 · Damasco · EXPLICIT_ONLY → GENERIC · roles — → F · momentos — → breakfast, lunch, snack, dinner, extraSnack · Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
- 148 · Durazno · EXPLICIT_ONLY → GENERIC · roles — → F · momentos — → breakfast, lunch, snack, dinner, extraSnack · Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
- 149 · Durazno chico · EXPLICIT_ONLY → GENERIC · roles — → F · momentos — → breakfast, lunch, snack, dinner, extraSnack · Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
- 150 · Durazno grande · EXPLICIT_ONLY → GENERIC · roles — → F · momentos — → breakfast, lunch, snack, dinner, extraSnack · Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
- 151 · Durazno mediano · EXPLICIT_ONLY → GENERIC · roles — → F · momentos — → breakfast, lunch, snack, dinner, extraSnack · Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
- 169 · Frambuesa · EXPLICIT_ONLY → GENERIC · roles — → F · momentos — → breakfast, lunch, snack, dinner, extraSnack · Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
- 173 · Frutillas · EXPLICIT_ONLY → GENERIC · roles — → F · momentos — → breakfast, lunch, snack, dinner, extraSnack · Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
- 207 · Granada · EXPLICIT_ONLY → GENERIC · roles — → F · momentos — → breakfast, lunch, snack, dinner, extraSnack · Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
- 223 · Higo · EXPLICIT_ONLY → GENERIC · roles — → F · momentos — → breakfast, lunch, snack, dinner, extraSnack · Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
- 239 · Kiwi · EXPLICIT_ONLY → GENERIC · roles — → F · momentos — → breakfast, lunch, snack, dinner, extraSnack · Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
- 240 · Kiwi (mediano) · EXPLICIT_ONLY → GENERIC · roles — → F · momentos — → breakfast, lunch, snack, dinner, extraSnack · Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
- 276 · Mandarina · EXPLICIT_ONLY → GENERIC · roles — → F · momentos — → breakfast, lunch, snack, dinner, extraSnack · Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
- 277 · Mandarina chica · EXPLICIT_ONLY → GENERIC · roles — → F · momentos — → breakfast, lunch, snack, dinner, extraSnack · Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
- 278 · Mandarina grande · EXPLICIT_ONLY → GENERIC · roles — → F · momentos — → breakfast, lunch, snack, dinner, extraSnack · Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
- 279 · Mandarina mediana · EXPLICIT_ONLY → GENERIC · roles — → F · momentos — → breakfast, lunch, snack, dinner, extraSnack · Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
- 281 · Mango · EXPLICIT_ONLY → GENERIC · roles — → F · momentos — → breakfast, lunch, snack, dinner, extraSnack · Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
- 287 · Manzana · EXPLICIT_ONLY → GENERIC · roles — → F · momentos — → breakfast, lunch, snack, dinner, extraSnack · Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
- 288 · Manzana chica · EXPLICIT_ONLY → GENERIC · roles — → F · momentos — → breakfast, lunch, snack, dinner, extraSnack · Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
- 289 · Manzana grande · EXPLICIT_ONLY → GENERIC · roles — → F · momentos — → breakfast, lunch, snack, dinner, extraSnack · Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
- 290 · Manzana mediana · EXPLICIT_ONLY → GENERIC · roles — → F · momentos — → breakfast, lunch, snack, dinner, extraSnack · Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
- 299 · Melon · EXPLICIT_ONLY → GENERIC · roles — → F · momentos — → breakfast, lunch, snack, dinner, extraSnack · Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
- 342 · Naranja · EXPLICIT_ONLY → GENERIC · roles — → F · momentos — → breakfast, lunch, snack, dinner, extraSnack · Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
- 343 · Naranja chica · EXPLICIT_ONLY → GENERIC · roles — → F · momentos — → breakfast, lunch, snack, dinner, extraSnack · Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
- 344 · Naranja grande · EXPLICIT_ONLY → GENERIC · roles — → F · momentos — → breakfast, lunch, snack, dinner, extraSnack · Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
- 345 · Naranja mediana · EXPLICIT_ONLY → GENERIC · roles — → F · momentos — → breakfast, lunch, snack, dinner, extraSnack · Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
- 396 · Papaya · EXPLICIT_ONLY → GENERIC · roles — → F · momentos — → breakfast, lunch, snack, dinner, extraSnack · Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
- 397 · Pasas de uva · EXPLICIT_ONLY → GENERIC · roles — → F · momentos — → breakfast, lunch, snack, dinner, extraSnack · Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
- 408 · Pera · EXPLICIT_ONLY → GENERIC · roles — → F · momentos — → breakfast, lunch, snack, dinner, extraSnack · Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
- 409 · Pera chica · EXPLICIT_ONLY → GENERIC · roles — → F · momentos — → breakfast, lunch, snack, dinner, extraSnack · Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
- 410 · Pera grande · EXPLICIT_ONLY → GENERIC · roles — → F · momentos — → breakfast, lunch, snack, dinner, extraSnack · Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
- 411 · Pera mediana · EXPLICIT_ONLY → GENERIC · roles — → F · momentos — → breakfast, lunch, snack, dinner, extraSnack · Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
- 424 · Pomelo · EXPLICIT_ONLY → GENERIC · roles — → F · momentos — → breakfast, lunch, snack, dinner, extraSnack · Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
- 515 · Sandia · EXPLICIT_ONLY → GENERIC · roles — → F · momentos — → breakfast, lunch, snack, dinner, extraSnack · Fruta inequívoca: rol F y disponibilidad en los cinco momentos.
- 584 · Uvas · EXPLICIT_ONLY → GENERIC · roles — → F · momentos — → breakfast, lunch, snack, dinner, extraSnack · Fruta inequívoca: rol F y disponibilidad en los cinco momentos.

### REGLA_EXPLICITA_ARROZ_PASTA

- 40 · Arroz (Cocido) · EXPLICIT_ONLY → GENERIC · roles — → C1 · momentos — → lunch, dinner · Arroz, fideo o pasta inequívoca: carbohidrato principal de almuerzo/cena.
- 42 · Arroz integral · EXPLICIT_ONLY → GENERIC · roles — → C1 · momentos — → lunch, dinner · Arroz, fideo o pasta inequívoca: carbohidrato principal de almuerzo/cena.
- 43 · Arroz integral (Cocido) · EXPLICIT_ONLY → GENERIC · roles — → C1 · momentos — → lunch, dinner · Arroz, fideo o pasta inequívoca: carbohidrato principal de almuerzo/cena.
- 82 · Capelletini giacomo jamon  y queso · EXPLICIT_ONLY → GENERIC · roles — → C1 · momentos — → lunch, dinner · Arroz, fideo o pasta inequívoca: carbohidrato principal de almuerzo/cena.
- 83 · Capelletini giacomo tridicci · EXPLICIT_ONLY → GENERIC · roles — → C1 · momentos — → lunch, dinner · Arroz, fideo o pasta inequívoca: carbohidrato principal de almuerzo/cena.
- 162 · Fideos · EXPLICIT_ONLY → GENERIC · roles — → C1 · momentos — → lunch, dinner · Arroz, fideo o pasta inequívoca: carbohidrato principal de almuerzo/cena.
- 163 · Fideos (Cocidos) · EXPLICIT_ONLY → GENERIC · roles — → C1 · momentos — → lunch, dinner · Arroz, fideo o pasta inequívoca: carbohidrato principal de almuerzo/cena.
- 164 · Fideos sin gluten · EXPLICIT_ONLY → GENERIC · roles — → C1 · momentos — → lunch, dinner · Arroz, fideo o pasta inequívoca: carbohidrato principal de almuerzo/cena.
- 353 · Ñoquis con papa · EXPLICIT_ONLY → GENERIC · roles — → C1 · momentos — → lunch, dinner · Arroz, fideo o pasta inequívoca: carbohidrato principal de almuerzo/cena.
- 354 · Ñoquis con papa carrefour · EXPLICIT_ONLY → GENERIC · roles — → C1 · momentos — → lunch, dinner · Arroz, fideo o pasta inequívoca: carbohidrato principal de almuerzo/cena.
- 355 · ñoquis de papa · EXPLICIT_ONLY → GENERIC · roles — → C1 · momentos — → lunch, dinner · Arroz, fideo o pasta inequívoca: carbohidrato principal de almuerzo/cena.
- 491 · Ravioles (Carrefour) · EXPLICIT_ONLY → GENERIC · roles — → C1 · momentos — → lunch, dinner · Arroz, fideo o pasta inequívoca: carbohidrato principal de almuerzo/cena.

### INFERENCIA_ALTA_PROTEINA_PRINCIPAL

- 47 · Atun en lomitos al natural · EXPLICIT_ONLY → GENERIC · roles — → P1 · momentos — → lunch, dinner · Carne, pescado o proteína vegetal principal inequívoca y reutilizable.
- 72 · Bola de lomo · EXPLICIT_ONLY → GENERIC · roles — → P1 · momentos — → lunch, dinner · Carne, pescado o proteína vegetal principal inequívoca y reutilizable.
- 88 · Carne de cerdo magro · EXPLICIT_ONLY → GENERIC · roles — → P1 · momentos — → lunch, dinner · Carne, pescado o proteína vegetal principal inequívoca y reutilizable.
- 129 · Cuadrada (Ternera) · EXPLICIT_ONLY → GENERIC · roles — → P1 · momentos — → lunch, dinner · Carne, pescado o proteína vegetal principal inequívoca y reutilizable.
- 165 · Filet de merluza · EXPLICIT_ONLY → GENERIC · roles — → P1 · momentos — → lunch, dinner · Carne, pescado o proteína vegetal principal inequívoca y reutilizable.
- 199 · Gambas · EXPLICIT_ONLY → GENERIC · roles — → P1 · momentos — → lunch, dinner · Carne, pescado o proteína vegetal principal inequívoca y reutilizable.
- 241 · Langostinos · EXPLICIT_ONLY → GENERIC · roles — → P1 · momentos — → lunch, dinner · Carne, pescado o proteína vegetal principal inequívoca y reutilizable.
- 270 · Lomo de cerdo magro · EXPLICIT_ONLY → GENERIC · roles — → P1 · momentos — → lunch, dinner · Carne, pescado o proteína vegetal principal inequívoca y reutilizable.
- 272 · Lubina · EXPLICIT_ONLY → GENERIC · roles — → P1 · momentos — → lunch, dinner · Carne, pescado o proteína vegetal principal inequívoca y reutilizable.
- 291 · Mariscos · EXPLICIT_ONLY → GENERIC · roles — → P1 · momentos — → lunch, dinner · Carne, pescado o proteína vegetal principal inequívoca y reutilizable.
- 358 · Paleta de ternera · EXPLICIT_ONLY → GENERIC · roles — → P1 · momentos — → lunch, dinner · Carne, pescado o proteína vegetal principal inequívoca y reutilizable.
- 360 · Palomita (Carne magra) · EXPLICIT_ONLY → GENERIC · roles — → P1 · momentos — → lunch, dinner · Carne, pescado o proteína vegetal principal inequívoca y reutilizable.
- 402 · Peceto · EXPLICIT_ONLY → GENERIC · roles — → P1 · momentos — → lunch, dinner · Carne, pescado o proteína vegetal principal inequívoca y reutilizable.
- 412 · Pescado blanco · EXPLICIT_ONLY → GENERIC · roles — → P1 · momentos — → lunch, dinner · Carne, pescado o proteína vegetal principal inequívoca y reutilizable.
- 517 · Sardinas · EXPLICIT_ONLY → GENERIC · roles — → P1 · momentos — → lunch, dinner · Carne, pescado o proteína vegetal principal inequívoca y reutilizable.
- 519 · Seitan · EXPLICIT_ONLY → GENERIC · roles — → P1 · momentos — → lunch, dinner · Carne, pescado o proteína vegetal principal inequívoca y reutilizable.
- 528 · Soja texturizada · EXPLICIT_ONLY → GENERIC · roles — → P1 · momentos — → lunch, dinner · Carne, pescado o proteína vegetal principal inequívoca y reutilizable.
- 541 · Ternera magra · EXPLICIT_ONLY → GENERIC · roles — → P1 · momentos — → lunch, dinner · Carne, pescado o proteína vegetal principal inequívoca y reutilizable.
- 543 · tofu · EXPLICIT_ONLY → GENERIC · roles — → P1 · momentos — → lunch, dinner · Carne, pescado o proteína vegetal principal inequívoca y reutilizable.
- 609 · Pata muslo de pollo sin piel · EXPLICIT_ONLY → GENERIC · roles — → P1 · momentos — → lunch, dinner · Carne, pescado o proteína vegetal principal inequívoca y reutilizable.

### INFERENCIA_ALTA_CEREAL_DESAYUNO

- 49 · Avena instantanea · EXPLICIT_ONLY → GENERIC · roles — → C1, C2 · momentos — → breakfast, snack, extraSnack · Cereal simple de desayuno/merienda: carbohidrato principal o secundario.
- 120 · Copos de maiz sin azucar · EXPLICIT_ONLY → GENERIC · roles — → C1, C2 · momentos — → breakfast, snack, extraSnack · Cereal simple de desayuno/merienda: carbohidrato principal o secundario.

### INFERENCIA_ALTA_CARBOHIDRATO_PRINCIPAL

- 58 · Batatas · EXPLICIT_ONLY → GENERIC · roles — → C1 · momentos — → lunch, dinner · Tubérculo o cereal simple utilizado como carbohidrato principal de plato.
- 105 · Choclo entero · EXPLICIT_ONLY → GENERIC · roles — → C1 · momentos — → lunch, dinner · Tubérculo o cereal simple utilizado como carbohidrato principal de plato.
- 273 · Maiz · EXPLICIT_ONLY → GENERIC · roles — → C1 · momentos — → lunch, dinner · Tubérculo o cereal simple utilizado como carbohidrato principal de plato.
- 391 · Papas · EXPLICIT_ONLY → GENERIC · roles — → C1 · momentos — → lunch, dinner · Tubérculo o cereal simple utilizado como carbohidrato principal de plato.
- 419 · Polenta · EXPLICIT_ONLY → GENERIC · roles — → C1 · momentos — → lunch, dinner · Tubérculo o cereal simple utilizado como carbohidrato principal de plato.
- 420 · Polenta (Coto) · EXPLICIT_ONLY → GENERIC · roles — → C1 · momentos — → lunch, dinner · Tubérculo o cereal simple utilizado como carbohidrato principal de plato.
- 421 · Polenta (Presto pronta) · EXPLICIT_ONLY → GENERIC · roles — → C1 · momentos — → lunch, dinner · Tubérculo o cereal simple utilizado como carbohidrato principal de plato.
- 422 · Polenta (Quaker) · EXPLICIT_ONLY → GENERIC · roles — → C1 · momentos — → lunch, dinner · Tubérculo o cereal simple utilizado como carbohidrato principal de plato.
- 423 · Polenta carrefour · EXPLICIT_ONLY → GENERIC · roles — → C1 · momentos — → lunch, dinner · Tubérculo o cereal simple utilizado como carbohidrato principal de plato.
- 432 · Pure de papas (General) · EXPLICIT_ONLY → GENERIC · roles — → C1 · momentos — → lunch, dinner · Tubérculo o cereal simple utilizado como carbohidrato principal de plato.

### INFERENCIA_ALTA_VERDURA

- 62 · Berenjena · EXPLICIT_ONLY → GENERIC · roles — → V · momentos — → lunch, dinner · Verdura simple inequívoca para acompañar almuerzo/cena.
- 77 · brocoli · EXPLICIT_ONLY → GENERIC · roles — → V · momentos — → lunch, dinner · Verdura simple inequívoca para acompañar almuerzo/cena.
- 79 · Calabacin · EXPLICIT_ONLY → GENERIC · roles — → V · momentos — → lunch, dinner · Verdura simple inequívoca para acompañar almuerzo/cena.
- 117 · Coliflor · EXPLICIT_ONLY → GENERIC · roles — → V · momentos — → lunch, dinner · Verdura simple inequívoca para acompañar almuerzo/cena.
- 159 · Esparragos · EXPLICIT_ONLY → GENERIC · roles — → V · momentos — → lunch, dinner · Verdura simple inequívoca para acompañar almuerzo/cena.
- 160 · espinaca · EXPLICIT_ONLY → GENERIC · roles — → V · momentos — → lunch, dinner · Verdura simple inequívoca para acompañar almuerzo/cena.
- 263 · lechuga · EXPLICIT_ONLY → GENERIC · roles — → V · momentos — → lunch, dinner · Verdura simple inequívoca para acompañar almuerzo/cena.
- 492 · Remolacha · EXPLICIT_ONLY → GENERIC · roles — → V · momentos — → lunch, dinner · Verdura simple inequívoca para acompañar almuerzo/cena.
- 587 · Verduras · EXPLICIT_ONLY → GENERIC · roles — → V · momentos — → lunch, dinner · Verdura simple inequívoca para acompañar almuerzo/cena.
- 605 · Zanahorias · EXPLICIT_ONLY → GENERIC · roles — → V · momentos — → lunch, dinner · Verdura simple inequívoca para acompañar almuerzo/cena.
- 607 · Zapallo · EXPLICIT_ONLY → GENERIC · roles — → V · momentos — → lunch, dinner · Verdura simple inequívoca para acompañar almuerzo/cena.

### REGLA_EXPLICITA_PROTEINAS_PRINCIPALES

- 113 · Churrasco magro · EXPLICIT_ONLY → GENERIC · roles — → P1 · momentos — → lunch, dinner · Corte o proteína principal expresamente solicitada para almuerzo/cena.
- 222 · Higado · EXPLICIT_ONLY → GENERIC · roles — → P1 · momentos — → lunch, dinner · Corte o proteína principal expresamente solicitada para almuerzo/cena.
- 403 · Pechuga de pavo · EXPLICIT_ONLY → GENERIC · roles — → P1 · momentos — → lunch, dinner · Corte o proteína principal expresamente solicitada para almuerzo/cena.
- 405 · Pechuga de pollo con piel · EXPLICIT_ONLY → GENERIC · roles — → P1 · momentos — → lunch, dinner · Corte o proteína principal expresamente solicitada para almuerzo/cena.

### REGLA_EXPLICITA_HUEVOS

- 115 · Claras de huevos · EXPLICIT_ONLY → GENERIC · roles — → P1, P2 · momentos — → breakfast, lunch, snack, dinner, extraSnack · Huevo o claras: fuente proteica principal/secundaria apta para todos los momentos.
- 224 · Huevos · GENERIC → GENERIC · roles P2 → P1, P2 · momentos lunch, dinner → breakfast, lunch, snack, dinner, extraSnack · Huevo o claras: fuente proteica principal/secundaria apta para todos los momentos.
- 533 · Tallarines al huevo (Coto) · EXPLICIT_ONLY → GENERIC · roles — → P1, P2 · momentos — → breakfast, lunch, snack, dinner, extraSnack · Huevo o claras: fuente proteica principal/secundaria apta para todos los momentos.

### INFERENCIA_ALTA_CARBOHIDRATO_LIVIANO

- 174 · Galletas de arroz · EXPLICIT_ONLY → GENERIC · roles — → C1, C2 · momentos — → breakfast, snack, extraSnack · Galleta/tostada simple y genérica para desayuno, merienda o snack extra.
- 179 · Galletitas de agua · EXPLICIT_ONLY → GENERIC · roles — → C1, C2 · momentos — → breakfast, snack, extraSnack · Galleta/tostada simple y genérica para desayuno, merienda o snack extra.
- 548 · Tostadas clasicas · EXPLICIT_ONLY → GENERIC · roles — → C1, C2 · momentos — → breakfast, snack, extraSnack · Galleta/tostada simple y genérica para desayuno, merienda o snack extra.
- 551 · Tostadas de arroz · EXPLICIT_ONLY → GENERIC · roles — → C1, C2 · momentos — → breakfast, snack, extraSnack · Galleta/tostada simple y genérica para desayuno, merienda o snack extra.
- 561 · Tostadas de mesa · EXPLICIT_ONLY → GENERIC · roles — → C1, C2 · momentos — → breakfast, snack, extraSnack · Galleta/tostada simple y genérica para desayuno, merienda o snack extra.

### REGLA_EXPLICITA_JAMON_COCIDO

- 228 · Jamon cocido · EXPLICIT_ONLY → GENERIC · roles — → P2 · momentos — → breakfast, snack, extraSnack · Jamón cocido: proteína secundaria para desayuno, merienda y snack extra.
- 229 · Jamon cocido cagnoli · EXPLICIT_ONLY → GENERIC · roles — → P2 · momentos — → breakfast, snack, extraSnack · Jamón cocido: proteína secundaria para desayuno, merienda y snack extra.
- 230 · Jamon cocido feteado · EXPLICIT_ONLY → GENERIC · roles — → P2 · momentos — → breakfast, snack, extraSnack · Jamón cocido: proteína secundaria para desayuno, merienda y snack extra.
- 231 · Jamon cocido lario · EXPLICIT_ONLY → GENERIC · roles — → P2 · momentos — → breakfast, snack, extraSnack · Jamón cocido: proteína secundaria para desayuno, merienda y snack extra.
- 232 · Jamon cocido paladini · EXPLICIT_ONLY → GENERIC · roles — → P2 · momentos — → breakfast, snack, extraSnack · Jamón cocido: proteína secundaria para desayuno, merienda y snack extra.

### REGLA_EXPLICITA_LECHE_DESCREMADA

- 247 · Leche descremada · EXPLICIT_ONLY → GENERIC · roles — → P2 · momentos — → breakfast, snack, extraSnack · Leche descremada inequívoca: proteína secundaria para desayuno, merienda y snack extra.
- 248 · Leche descremada (Apostoles) · EXPLICIT_ONLY → GENERIC · roles — → P2 · momentos — → breakfast, snack, extraSnack · Leche descremada inequívoca: proteína secundaria para desayuno, merienda y snack extra.
- 249 · Leche descremada alta en proteínas · EXPLICIT_ONLY → GENERIC · roles — → P2 · momentos — → breakfast, snack, extraSnack · Leche descremada inequívoca: proteína secundaria para desayuno, merienda y snack extra.
- 250 · Leche descremada Apostoles · EXPLICIT_ONLY → GENERIC · roles — → P2 · momentos — → breakfast, snack, extraSnack · Leche descremada inequívoca: proteína secundaria para desayuno, merienda y snack extra.
- 251 · Leche descremada en polvo · EXPLICIT_ONLY → GENERIC · roles — → P2 · momentos — → breakfast, snack, extraSnack · Leche descremada inequívoca: proteína secundaria para desayuno, merienda y snack extra.
- 252 · Leche descremada la serenisima · EXPLICIT_ONLY → GENERIC · roles — → P2 · momentos — → breakfast, snack, extraSnack · Leche descremada inequívoca: proteína secundaria para desayuno, merienda y snack extra.
- 253 · Leche descremada sin lactosa · EXPLICIT_ONLY → GENERIC · roles — → P2 · momentos — → breakfast, snack, extraSnack · Leche descremada inequívoca: proteína secundaria para desayuno, merienda y snack extra.
- 254 · Leche descremada tregar · EXPLICIT_ONLY → GENERIC · roles — → P2 · momentos — → breakfast, snack, extraSnack · Leche descremada inequívoca: proteína secundaria para desayuno, merienda y snack extra.
- 255 · Leche deslactosada descremada (La serenisima) · EXPLICIT_ONLY → GENERIC · roles — → P2 · momentos — → breakfast, snack, extraSnack · Leche descremada inequívoca: proteína secundaria para desayuno, merienda y snack extra.

### INFERENCIA_ALTA_LECHE

- 258 · Leche entera · EXPLICIT_ONLY → GENERIC · roles — → P2 · momentos — → breakfast, snack, extraSnack · Leche simple: proteína secundaria para desayuno, merienda y snack extra.
- 262 · Leche parcialmente descremada (Veronica) · EXPLICIT_ONLY → GENERIC · roles — → P2 · momentos — → breakfast, snack, extraSnack · Leche simple: proteína secundaria para desayuno, merienda y snack extra.

### INFERENCIA_ALTA_UNTABLE_FRUTO_SECO

- 286 · Mantequilla de mani · EXPLICIT_ONLY → GENERIC · roles — → G · momentos — → breakfast, snack, extraSnack · Pasta de fruto seco: complemento graso para comidas livianas.
- 398 · Pasta de mani · EXPLICIT_ONLY → GENERIC · roles — → G · momentos — → breakfast, snack, extraSnack · Pasta de fruto seco: complemento graso para comidas livianas.
- 399 · Pasta de mani Sin tacc · EXPLICIT_ONLY → GENERIC · roles — → G · momentos — → breakfast, snack, extraSnack · Pasta de fruto seco: complemento graso para comidas livianas.

### REGLA_EXPLICITA_PALTA

- 361 · Palta · EXPLICIT_ONLY → GENERIC · roles — → G · momentos — → breakfast, lunch, snack, dinner · Palta: complemento graso para desayuno, almuerzo, merienda y cena.

### INFERENCIA_ALTA_PAN_SIMPLE

- 362 · Pan · GENERIC → GENERIC · roles C2 → C1, C2 · momentos lunch, dinner → breakfast, snack, extraSnack · Pan simple de consumo habitual: carbohidrato principal/secundario para comidas livianas.
- 363 · Pan artesano bimbo · EXPLICIT_ONLY → GENERIC · roles — → C1, C2 · momentos — → breakfast, snack, extraSnack · Pan simple de consumo habitual: carbohidrato principal/secundario para comidas livianas.
- 364 · Pan baguette · EXPLICIT_ONLY → GENERIC · roles — → C1, C2 · momentos — → breakfast, snack, extraSnack · Pan simple de consumo habitual: carbohidrato principal/secundario para comidas livianas.
- 366 · Pan con salvado carrefour · EXPLICIT_ONLY → GENERIC · roles — → C1, C2 · momentos — → breakfast, snack, extraSnack · Pan simple de consumo habitual: carbohidrato principal/secundario para comidas livianas.
- 367 · Pan con salvado fargo plus · EXPLICIT_ONLY → GENERIC · roles — → C1, C2 · momentos — → breakfast, snack, extraSnack · Pan simple de consumo habitual: carbohidrato principal/secundario para comidas livianas.
- 368 · Pan con salvado Noly · EXPLICIT_ONLY → GENERIC · roles — → C1, C2 · momentos — → breakfast, snack, extraSnack · Pan simple de consumo habitual: carbohidrato principal/secundario para comidas livianas.
- 369 · Pan de centeno · EXPLICIT_ONLY → GENERIC · roles — → C1, C2 · momentos — → breakfast, snack, extraSnack · Pan simple de consumo habitual: carbohidrato principal/secundario para comidas livianas.
- 370 · Pan de molde Bio sin gluten · EXPLICIT_ONLY → GENERIC · roles — → C1, C2 · momentos — → breakfast, snack, extraSnack · Pan simple de consumo habitual: carbohidrato principal/secundario para comidas livianas.
- 371 · Pan de salvado (Fargo) · EXPLICIT_ONLY → GENERIC · roles — → C1, C2 · momentos — → breakfast, snack, extraSnack · Pan simple de consumo habitual: carbohidrato principal/secundario para comidas livianas.
- 372 · Pan de salvado doble fargo · EXPLICIT_ONLY → GENERIC · roles — → C1, C2 · momentos — → breakfast, snack, extraSnack · Pan simple de consumo habitual: carbohidrato principal/secundario para comidas livianas.
- 373 · Pan doble integral fargo · EXPLICIT_ONLY → GENERIC · roles — → C1, C2 · momentos — → breakfast, snack, extraSnack · Pan simple de consumo habitual: carbohidrato principal/secundario para comidas livianas.
- 374 · Pan frances · EXPLICIT_ONLY → GENERIC · roles — → C1, C2 · momentos — → breakfast, snack, extraSnack · Pan simple de consumo habitual: carbohidrato principal/secundario para comidas livianas.
- 377 · Pan lactal · EXPLICIT_ONLY → GENERIC · roles — → C1, C2 · momentos — → breakfast, snack, extraSnack · Pan simple de consumo habitual: carbohidrato principal/secundario para comidas livianas.
- 378 · Pan lactal bimbo · EXPLICIT_ONLY → GENERIC · roles — → C1, C2 · momentos — → breakfast, snack, extraSnack · Pan simple de consumo habitual: carbohidrato principal/secundario para comidas livianas.
- 379 · Pan lactal de salvado carrefour · EXPLICIT_ONLY → GENERIC · roles — → C1, C2 · momentos — → breakfast, snack, extraSnack · Pan simple de consumo habitual: carbohidrato principal/secundario para comidas livianas.
- 380 · Pan lactal noly · EXPLICIT_ONLY → GENERIC · roles — → C1, C2 · momentos — → breakfast, snack, extraSnack · Pan simple de consumo habitual: carbohidrato principal/secundario para comidas livianas.
- 381 · Pan negro · EXPLICIT_ONLY → GENERIC · roles — → C1, C2 · momentos — → breakfast, snack, extraSnack · Pan simple de consumo habitual: carbohidrato principal/secundario para comidas livianas.
- 387 · Pan tipo artesano bimbo semillas del campo · EXPLICIT_ONLY → GENERIC · roles — → C1, C2 · momentos — → breakfast, snack, extraSnack · Pan simple de consumo habitual: carbohidrato principal/secundario para comidas livianas.

### REGLA_EXPLICITA_PAN_BLANCO

- 365 · Pan blanco · EXPLICIT_ONLY → GENERIC · roles — → C1, C2 · momentos — → breakfast, snack, extraSnack · Pan blanco: carbohidrato principal/secundario para desayuno, merienda y snack extra.

### REGLA_EXPLICITA_QUESO_CREMOSO

- 454 · Queso cremon cremoso · EXPLICIT_ONLY → GENERIC · roles — → P2, G · momentos — → breakfast, snack, extraSnack · Queso cremoso: proteína secundaria y complemento graso para comidas livianas.
- 456 · Queso cremoso · EXPLICIT_ONLY → GENERIC · roles — → P2, G · momentos — → breakfast, snack, extraSnack · Queso cremoso: proteína secundaria y complemento graso para comidas livianas.
- 457 · Queso cremoso (cremac) · EXPLICIT_ONLY → GENERIC · roles — → P2, G · momentos — → breakfast, snack, extraSnack · Queso cremoso: proteína secundaria y complemento graso para comidas livianas.
- 459 · Queso cremoso cremac · EXPLICIT_ONLY → GENERIC · roles — → P2, G · momentos — → breakfast, snack, extraSnack · Queso cremoso: proteína secundaria y complemento graso para comidas livianas.
- 460 · Queso cremoso light · EXPLICIT_ONLY → GENERIC · roles — → P2, G · momentos — → breakfast, snack, extraSnack · Queso cremoso: proteína secundaria y complemento graso para comidas livianas.
- 461 · Queso cremoso port salut · EXPLICIT_ONLY → GENERIC · roles — → P2, G · momentos — → breakfast, snack, extraSnack · Queso cremoso: proteína secundaria y complemento graso para comidas livianas.
- 462 · Queso cremoso punta del agua · EXPLICIT_ONLY → GENERIC · roles — → P2, G · momentos — → breakfast, snack, extraSnack · Queso cremoso: proteína secundaria y complemento graso para comidas livianas.
- 463 · Queso cremoso punta del agua light · EXPLICIT_ONLY → GENERIC · roles — → P2, G · momentos — → breakfast, snack, extraSnack · Queso cremoso: proteína secundaria y complemento graso para comidas livianas.
- 464 · Queso cremoso saint paulin · EXPLICIT_ONLY → GENERIC · roles — → P2, G · momentos — → breakfast, snack, extraSnack · Queso cremoso: proteína secundaria y complemento graso para comidas livianas.
- 466 · Queso cremoso temblay · EXPLICIT_ONLY → GENERIC · roles — → P2, G · momentos — → breakfast, snack, extraSnack · Queso cremoso: proteína secundaria y complemento graso para comidas livianas.

### INFERENCIA_ALTA_SEMILLAS

- 520 · Semillas de calabaza · EXPLICIT_ONLY → GENERIC · roles — → G · momentos — → breakfast, lunch, snack, dinner, extraSnack · Semilla comestible inequívoca utilizada como complemento graso.
- 523 · Semillas de girasol · EXPLICIT_ONLY → GENERIC · roles — → G · momentos — → breakfast, lunch, snack, dinner, extraSnack · Semilla comestible inequívoca utilizada como complemento graso.
- 524 · Semillas de lino · EXPLICIT_ONLY → GENERIC · roles — → G · momentos — → breakfast, lunch, snack, dinner, extraSnack · Semilla comestible inequívoca utilizada como complemento graso.

### REGLA_EXPLICITA_WHEY

- 589 · Whey protein Isolate · EXPLICIT_ONLY → GENERIC · roles — → P1, P2 · momentos — → breakfast, snack, extraSnack · Whey inequívoca: fuente proteica principal/secundaria fuera de platos principales.
- 591 · Whey protein SN · EXPLICIT_ONLY → GENERIC · roles — → P1, P2 · momentos — → breakfast, snack, extraSnack · Whey inequívoca: fuente proteica principal/secundaria fuera de platos principales.

### INFERENCIA_ALTA_YOGUR

- 592 · Yogurisimo bebible · EXPLICIT_ONLY → GENERIC · roles — → P2 · momentos — → breakfast, snack, extraSnack · Yogur inequívoco: proteína secundaria para desayuno, merienda y snack extra.
- 593 · Yogurisimo firme la serenisima (190 grs) · EXPLICIT_ONLY → GENERIC · roles — → P2 · momentos — → breakfast, snack, extraSnack · Yogur inequívoco: proteína secundaria para desayuno, merienda y snack extra.
- 594 · Yogurt activia bebible · EXPLICIT_ONLY → GENERIC · roles — → P2 · momentos — → breakfast, snack, extraSnack · Yogur inequívoco: proteína secundaria para desayuno, merienda y snack extra.
- 595 · Yogurt bebible (Ser) · EXPLICIT_ONLY → GENERIC · roles — → P2 · momentos — → breakfast, snack, extraSnack · Yogur inequívoco: proteína secundaria para desayuno, merienda y snack extra.
- 596 · Yogurt bebible vida light · EXPLICIT_ONLY → GENERIC · roles — → P2 · momentos — → breakfast, snack, extraSnack · Yogur inequívoco: proteína secundaria para desayuno, merienda y snack extra.
- 597 · Yogurt descremado bebible Ilolay · EXPLICIT_ONLY → GENERIC · roles — → P2 · momentos — → breakfast, snack, extraSnack · Yogur inequívoco: proteína secundaria para desayuno, merienda y snack extra.
- 598 · Yogurt descremado bebible vida · EXPLICIT_ONLY → GENERIC · roles — → P2 · momentos — → breakfast, snack, extraSnack · Yogur inequívoco: proteína secundaria para desayuno, merienda y snack extra.
- 599 · Yogurt descremado gran compra · EXPLICIT_ONLY → GENERIC · roles — → P2 · momentos — → breakfast, snack, extraSnack · Yogur inequívoco: proteína secundaria para desayuno, merienda y snack extra.
- 600 · Yogurt entero bebible Ilolay · EXPLICIT_ONLY → GENERIC · roles — → P2 · momentos — → breakfast, snack, extraSnack · Yogur inequívoco: proteína secundaria para desayuno, merienda y snack extra.
- 601 · Yogurt entero bebible Yogs · EXPLICIT_ONLY → GENERIC · roles — → P2 · momentos — → breakfast, snack, extraSnack · Yogur inequívoco: proteína secundaria para desayuno, merienda y snack extra.
- 602 · Yogurt entero gran compra · EXPLICIT_ONLY → GENERIC · roles — → P2 · momentos — → breakfast, snack, extraSnack · Yogur inequívoco: proteína secundaria para desayuno, merienda y snack extra.
- 603 · Yogurt light gran compra · EXPLICIT_ONLY → GENERIC · roles — → P2 · momentos — → breakfast, snack, extraSnack · Yogur inequívoco: proteína secundaria para desayuno, merienda y snack extra.
- 604 · Yogurt light la serenisima (Bebible) · EXPLICIT_ONLY → GENERIC · roles — → P2 · momentos — → breakfast, snack, extraSnack · Yogur inequívoco: proteína secundaria para desayuno, merienda y snack extra.

## Requieren revisión manual

- 8 · Alfajor bon o bon · Snacks · Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes. Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- 14 · Alfajor guaymallen · Snacks · Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes. Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- 18 · Alfajor jorgito · Snacks · Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes. Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- 44 · Arvejas secas · Carbohidratos · Legumbre/pseudocereal con posible rol C1 y/o P2; el rol culinario depende del uso deseado. Sugerencia: Evaluar C1, P2 o ambos para lunch/dinner y definir una porción confiable.
- 45 · Arvejas secas remojadas · Carbohidratos · Legumbre/pseudocereal con posible rol C1 y/o P2; el rol culinario depende del uso deseado. Sugerencia: Evaluar C1, P2 o ambos para lunch/dinner y definir una porción confiable.
- 6619bfeb147cd50b646776b0 · Batido proteico: · Sin categoría · Registro sombra sin alimentoId, unidad ni nutrición útil; coincide nominalmente con otro registro legacy. Sugerencia: Revisar duplicación/validez del documento antes de asignarle generation.
- 6619bfeb147cd50b646776b1 · Batido: · Sin categoría · Registro sombra sin alimentoId, unidad ni nutrición útil; coincide nominalmente con otro registro legacy. Sugerencia: Revisar duplicación/validez del documento antes de asignarle generation.
- 64 · Bife angosto · Proteínas · Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes. Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- 65 · Bife de chorizo magro · Grasas · Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales. Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- 73 · Bondiola (Lario) · Grasas · Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales. Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- 74 · Bondiola (Lario) · Grasas · Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales. Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- 75 · Bondiola de cerdo · Grasas · Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales. Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- 76 · Bondiola feteada (Carrefour) · Grasas · Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales. Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- 81 · Calabaza · Verduras · Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes. Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- 91 · Carne picada magra · Proteínas · Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes. Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- 92 · Casancrem · Lácteos · Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso. Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- 93 · Casancrem light · Lácteos · Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso. Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- 99 · Cebolla · Verduras · Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes. Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- 111 · Chorizo · Grasas · Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes. Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- 125 · Cremon light · Lácteos · Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes. Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- 131 · Cuadril · Proteínas · Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes. Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- 6619bfeb147cd50b646776ff · Dulce de leche (Coto) · Sin categoría · Registro sombra sin alimentoId, unidad ni nutrición útil; coincide nominalmente con otro registro legacy. Sugerencia: Revisar duplicación/validez del documento antes de asignarle generation.
- 153 · Empanada de jamon y queso el noblre · Lácteos · Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso. Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- 154 · Empanadas de carne : · Proteínas · Registro marcado para revisión e inactivo. Sugerencia: Resolver primero el estado/revisión; no promover automáticamente.
- 155 · Empanadas de jamon y queso : · Lácteos · Registro marcado para revisión e inactivo. Sugerencia: Resolver primero el estado/revisión; no promover automáticamente.
- 156 · Empanadas de pollo : · Proteínas · Registro marcado para revisión e inactivo. Sugerencia: Resolver primero el estado/revisión; no promover automáticamente.
- 6619bfeb147cd50b64677712 · Empanadas: · Sin categoría · Registro sombra sin alimentoId, unidad ni nutrición útil; coincide nominalmente con otro registro legacy. Sugerencia: Revisar duplicación/validez del documento antes de asignarle generation.
- 6619bfeb147cd50b64677713 · Ensalada: · Sin categoría · Registro sombra sin alimentoId, unidad ni nutrición útil; coincide nominalmente con otro registro legacy. Sugerencia: Revisar duplicación/validez del documento antes de asignarle generation.
- 170 · Frijoles · Carbohidratos · Legumbre/pseudocereal con posible rol C1 y/o P2; el rol culinario depende del uso deseado. Sugerencia: Evaluar C1, P2 o ambos para lunch/dinner y definir una porción confiable.
- 191 · Galletitas de salvado (Bagley) · Snacks · Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes. Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- 201 · Garbanzos secos · Carbohidratos · Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes. Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- 203 · Garbanzos secos remojados · Carbohidratos · Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes. Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- 211 · Guacamole · Grasas · Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes. Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- 213 · Hamburguesa Clasica (Paty) · Grasas · Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales. Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- 214 · Hamburguesa de soja (Vegetalex) · Proteínas · Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes. Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- 215 · Hamburguesa de soja vegetalex · Proteínas · Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes. Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- 216 · Hamburguesas (Swift) · Grasas · Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales. Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- 217 · Hamburguesas finitas (Paty) · Grasas · Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales. Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- 218 · Hamburguesas light (Swift) · Grasas · Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales. Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- 235 · Jamon serrano · Proteínas · Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes. Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- 264 · Lentejas en remojo · Carbohidratos · Legumbre/pseudocereal con posible rol C1 y/o P2; el rol culinario depende del uso deseado. Sugerencia: Evaluar C1, P2 o ambos para lunch/dinner y definir una porción confiable.
- 267 · Lentejas secas · Carbohidratos · Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes. Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- 268 · Lentejas secas (Elio) · Carbohidratos · Legumbre/pseudocereal con posible rol C1 y/o P2; el rol culinario depende del uso deseado. Sugerencia: Evaluar C1, P2 o ambos para lunch/dinner y definir una porción confiable.
- 6619bfeb147cd50b64677782 · Lomitos de atun al natural (Coto) · Sin categoría · Registro sombra sin alimentoId, unidad ni nutrición útil; coincide nominalmente con otro registro legacy. Sugerencia: Revisar duplicación/validez del documento antes de asignarle generation.
- 275 · Maiz inflado · Carbohidratos · Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes. Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- 284 · Manteca · Grasas · Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes. Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- 294 · Medallon de merluza · Proteínas · Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales. Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- 295 · Medallon de pollo (Granja del sol) · Proteínas · Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales. Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- 296 · Medallon de pollo (Granja tres arroyos) · Grasas · Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales. Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- 297 · Medallones de merluza · Proteínas · Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales. Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- 298 · Medallones de pollo · Proteínas · Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales. Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- 300 · Mendicrim · Lácteos · Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso. Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- 301 · Mendicrim light · Lácteos · Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso. Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- 304 · Merluza · Proteínas · Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes. Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- 321 · Mermelada light · Carbohidratos · Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes. Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- 6619bfeb147cd50b646777bd · Milanesa de pollo: · Sin categoría · Registro sombra sin alimentoId, unidad ni nutrición útil; coincide nominalmente con otro registro legacy. Sugerencia: Revisar duplicación/validez del documento antes de asignarle generation.
- 329 · Milanesa de soja (Vegetalex) · Proteínas · Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales. Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- 6619bfeb147cd50b646777bf · Milanesa de soja: · Sin categoría · Registro sombra sin alimentoId, unidad ni nutrición útil; coincide nominalmente con otro registro legacy. Sugerencia: Revisar duplicación/validez del documento antes de asignarle generation.
- 6619bfeb147cd50b646777c0 · Milanesa de ternera: · Sin categoría · Registro sombra sin alimentoId, unidad ni nutrición útil; coincide nominalmente con otro registro legacy. Sugerencia: Revisar duplicación/validez del documento antes de asignarle generation.
- 333 · Minitostaditas cuatro quesos twistos · Lácteos · Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso. Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- 335 · Morcilla · Grasas · Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales. Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- 336 · Mortadela · Grasas · Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales. Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- 337 · Mortadela (Cagnoli) · Fiambres · Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales. Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- 338 · Mortadela (Paladini) · Fiambres · Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales. Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- 339 · Mortadela Piccola (Calchaqui) · Fiambres · Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales. Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- 6619bfeb147cd50b646777d9 · Omelette: · Sin categoría · Registro sombra sin alimentoId, unidad ni nutrición útil; coincide nominalmente con otro registro legacy. Sugerencia: Revisar duplicación/validez del documento antes de asignarle generation.
- 376 · Pan integral · Carbohidratos · Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes. Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- 382 · Pan para hamburguesas · Carbohidratos · Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales. Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- 383 · Pan para hamburguesas fargo · Carbohidratos · Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales. Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- 386 · Pan rallado · Carbohidratos · Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes. Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- 388 · Panceta · Grasas · Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales. Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- 6619bfeb147cd50b646777fb · Panzotti Ricota y queso (Coto) · Sin categoría · Registro sombra sin alimentoId, unidad ni nutrición útil; coincide nominalmente con otro registro legacy. Sugerencia: Revisar duplicación/validez del documento antes de asignarle generation.
- 407 · Pepinos · Verduras · Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes. Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- 418 · Plato de verduras · Verduras · Registro marcado para revisión e inactivo. Sugerencia: Resolver primero el estado/revisión; no promover automáticamente.
- 427 · Porotos secos · Carbohidratos · Legumbre/pseudocereal con posible rol C1 y/o P2; el rol culinario depende del uso deseado. Sugerencia: Evaluar C1, P2 o ambos para lunch/dinner y definir una porción confiable.
- 428 · Porotos secos remojados · Carbohidratos · Legumbre/pseudocereal con posible rol C1 y/o P2; el rol culinario depende del uso deseado. Sugerencia: Evaluar C1, P2 o ambos para lunch/dinner y definir una porción confiable.
- 437 · Queso blanco garcia · Lácteos · Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso. Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- 438 · Queso blanco light tregar · Lácteos · Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso. Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- 439 · Queso cheddar · Lácteos · Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso. Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- 440 · Queso cheddar tonadita en fetas · Lácteos · Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso. Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- 441 · Queso crema · Lácteos · Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso. Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- 442 · Queso crema carrefour · Lácteos · Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso. Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- 443 · Queso crema carrefour light · Lácteos · Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso. Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- 444 · Queso crema crematto milkaut · Lácteos · Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso. Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- 445 · Queso crema crematto milkaut light · Lácteos · Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso. Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- 446 · Queso crema cremon light · Lácteos · Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso. Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- 447 · Queso crema la paulina · Lácteos · Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso. Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- 448 · Queso crema la paulina light · Lácteos · Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso. Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- 449 · Queso crema light · Lácteos · Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso. Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- 450 · Queso crema philadelphia · Lácteos · Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso. Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- 451 · Queso crema philadelphia light · Lácteos · Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso. Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- 452 · Queso crema san ignacio · Lácteos · Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso. Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- 453 · Queso crema san ignacio light · Lácteos · Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso. Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- 455 · Queso cremon doble crema · Lácteos · Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso. Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- 467 · Queso danbo carrefour · Lácteos · Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso. Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- 468 · Queso danbo carrefour light · Lácteos · Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso. Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- 471 · Queso danbo feteado · Lácteos · Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes. Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- 472 · Queso danbo feteado light · Lácteos · Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso. Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- 473 · Queso danbo light · Lácteos · Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso. Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- 474 · Queso finlandia clasico · Lácteos · Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso. Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- 475 · Queso finlandia light · Lácteos · Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso. Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- 476 · Queso la paulina · Lácteos · Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso. Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- 477 · Queso la paulina light · Lácteos · Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso. Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- 478 · Queso mozzarella · Lácteos · Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso. Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- 480 · Queso pategras · Lácteos · Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes. Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- 481 · Queso port salut (La paulina) · Lácteos · Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso. Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- 482 · Queso port salut light (La paulina) · Lácteos · Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso. Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- 483 · Queso sardo · Lácteos · Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso. Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- 484 · Queso untable cremon light · Lácteos · Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso. Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- 485 · Queso untable garcia · Lácteos · Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso. Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- 487 · Quinoa · Carbohidratos · Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes. Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- 494 · Repollo · Verduras · Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes. Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- 496 · Ricota · Otros · Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso. Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- 497 · Ricota magra · Otros · Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso. Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- 498 · Salame · Grasas · Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales. Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- 499 · Salame (Cagnoli) · Fiambres · Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales. Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- 500 · Salame tandilero tipo milan (Cagnoli) · Fiambres · Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales. Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- 501 · Salame tipo milan (Bocatti) · Fiambres · Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales. Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- 502 · Salame tipo Milan (Paladini) · Fiambres · Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales. Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- 505 · Salchichas de soja (Vegetalex) · Proteínas · Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales. Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- 506 · Salchichas Granja Iris · Proteínas · Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales. Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- 507 · Salchichas La Blanca · Grasas · Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales. Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- 508 · Salchichas Paladini · Grasas · Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales. Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- 509 · Salchichas patyvienna · Grasas · Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales. Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- 510 · Salchichas Swift · Grasas · Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales. Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- 511 · Salchichas Vienissima · Grasas · Proteína procesada o grasa cuya aparición espontánea puede producir combinaciones poco naturales. Sugerencia: Mantener EXPLICIT_ONLY o habilitar manualmente como P1/P2 en momentos concretos.
- 513 · Salmón · Proteínas · Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes. Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- 6619bfeb147cd50b64677880 · Sanguche: · Sin categoría · Registro sombra sin alimentoId, unidad ni nutrición útil; coincide nominalmente con otro registro legacy. Sugerencia: Revisar duplicación/validez del documento antes de asignarle generation.
- 522 · Semillas de chia · Grasas · Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes. Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- 526 · Semillas de sesamo · Grasas · Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes. Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- 6619bfeb147cd50b6467788d · Sopa: · Sin categoría · Registro sombra sin alimentoId, unidad ni nutrición útil; coincide nominalmente con otro registro legacy. Sugerencia: Revisar duplicación/validez del documento antes de asignarle generation.
- 538 · Tarta de atun : · Proteínas · Registro marcado para revisión e inactivo. Sugerencia: Resolver primero el estado/revisión; no promover automáticamente.
- 539 · Tarta de jamon y queso : · Lácteos · Registro marcado para revisión e inactivo. Sugerencia: Resolver primero el estado/revisión; no promover automáticamente.
- 6619bfeb147cd50b64677898 · Tarta: · Sin categoría · Registro sombra sin alimentoId, unidad ni nutrición útil; coincide nominalmente con otro registro legacy. Sugerencia: Revisar duplicación/validez del documento antes de asignarle generation.
- 553 · Tostadas de arroz aireadas carrefour · Carbohidratos · Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes. Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- 557 · Tostadas de arroz carrefour (Sin gluten) · Carbohidratos · Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes. Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- 563 · Tostadas de mesa riera · Otros · Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes. Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- 566 · Tostadas dulces carrefour · Carbohidratos · Marcado como duplicado nombre + unidad; promoverlo podría duplicar sugerencias equivalentes. Sugerencia: Elegir manualmente el registro canónico y configurar sólo ese.
- 580 · Triple Hamburguesa con queso · Lácteos · Lácteo no cubierto por la regla explícita de queso cremoso; P2/G depende del producto y uso. Sugerencia: Evaluar P2 y eventualmente G para breakfast/snack/extraSnack.
- 586 · veggies quinoa y espinaca · Verduras · Legumbre/pseudocereal con posible rol C1 y/o P2; el rol culinario depende del uso deseado. Sugerencia: Evaluar C1, P2 o ambos para lunch/dinner y definir una porción confiable.
- 59 · Batido proteico: · Otros · Registro marcado para revisión e inactivo. Sugerencia: Resolver primero el estado/revisión; no promover automáticamente.
- 60 · Batido: · Otros · Registro marcado para revisión e inactivo. Sugerencia: Resolver primero el estado/revisión; no promover automáticamente.
- 138 · Dulce de leche (Coto) · Lácteos · Registro marcado para revisión e inactivo. Sugerencia: Resolver primero el estado/revisión; no promover automáticamente.
- 157 · Empanadas: · Otros · Registro marcado para revisión e inactivo. Sugerencia: Resolver primero el estado/revisión; no promover automáticamente.
- 158 · Ensalada: · Otros · Registro marcado para revisión e inactivo. Sugerencia: Resolver primero el estado/revisión; no promover automáticamente.
- 269 · Lomitos de atun al natural (Coto) · Proteínas · Registro marcado para revisión e inactivo. Sugerencia: Resolver primero el estado/revisión; no promover automáticamente.
- 328 · Milanesa de pollo: · Proteínas · Registro marcado para revisión e inactivo. Sugerencia: Resolver primero el estado/revisión; no promover automáticamente.
- 330 · Milanesa de soja: · Proteínas · Registro marcado para revisión e inactivo. Sugerencia: Resolver primero el estado/revisión; no promover automáticamente.
- 331 · Milanesa de ternera: · Proteínas · Registro marcado para revisión e inactivo. Sugerencia: Resolver primero el estado/revisión; no promover automáticamente.
- 356 · Omelette: · Otros · Registro marcado para revisión e inactivo. Sugerencia: Resolver primero el estado/revisión; no promover automáticamente.
- 390 · Panzotti Ricota y queso (Coto) · Lácteos · Registro marcado para revisión e inactivo. Sugerencia: Resolver primero el estado/revisión; no promover automáticamente.
- 516 · Sanguche: · Otros · Registro marcado para revisión e inactivo. Sugerencia: Resolver primero el estado/revisión; no promover automáticamente.
- 529 · Sopa: · Otros · Registro marcado para revisión e inactivo. Sugerencia: Resolver primero el estado/revisión; no promover automáticamente.
- 540 · Tarta: · Otros · Registro marcado para revisión e inactivo. Sugerencia: Resolver primero el estado/revisión; no promover automáticamente.

## Porciones propuestas/no aplicadas

- 1 · Aceite de coco · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 2 · Aceite de oliva · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 3 · Aceitunas negras · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 4 · Aceitunas verdes · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 34 · Almendras · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 35 · Anana · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 36 · Arandanos · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 40 · Arroz (Cocido) · Arroz base tiene g, min 80, max 200, step 10; validar por separado crudo/cocido antes de reutilizar.
- 42 · Arroz integral · Arroz base tiene g, min 80, max 200, step 10; validar por separado crudo/cocido antes de reutilizar.
- 43 · Arroz integral (Cocido) · Arroz base tiene g, min 80, max 200, step 10; validar por separado crudo/cocido antes de reutilizar.
- 47 · Atun en lomitos al natural · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 48 · Avellanas · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 49 · Avena instantanea · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 51 · Banana · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 52 · Banana chica · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 53 · Banana grande · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 54 · Banana mediana · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 58 · Batatas · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 62 · Berenjena · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 72 · Bola de lomo · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 77 · brocoli · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 79 · Calabacin · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 82 · Capelletini giacomo jamon  y queso · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 83 · Capelletini giacomo tridicci · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 88 · Carne de cerdo magro · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 94 · Castañas · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 96 · Castañas de caju · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 102 · Cerezas · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 104 · Chirimoya · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 105 · Choclo entero · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 113 · Churrasco magro · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 114 · Ciruela · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 115 · Claras de huevos · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 117 · Coliflor · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 120 · Copos de maiz sin azucar · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 129 · Cuadrada (Ternera) · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 132 · Damasco · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 148 · Durazno · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 149 · Durazno chico · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 150 · Durazno grande · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 151 · Durazno mediano · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 159 · Esparragos · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 160 · espinaca · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 162 · Fideos · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 163 · Fideos (Cocidos) · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 164 · Fideos sin gluten · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 165 · Filet de merluza · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 169 · Frambuesa · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 173 · Frutillas · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 174 · Galletas de arroz · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 179 · Galletitas de agua · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 199 · Gambas · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 207 · Granada · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 222 · Higado · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 223 · Higo · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 224 · Huevos · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 228 · Jamon cocido · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 229 · Jamon cocido cagnoli · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 230 · Jamon cocido feteado · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 231 · Jamon cocido lario · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 232 · Jamon cocido paladini · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 239 · Kiwi · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 240 · Kiwi (mediano) · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 241 · Langostinos · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 247 · Leche descremada · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 248 · Leche descremada (Apostoles) · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 249 · Leche descremada alta en proteínas · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 250 · Leche descremada Apostoles · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 251 · Leche descremada en polvo · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 252 · Leche descremada la serenisima · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 253 · Leche descremada sin lactosa · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 254 · Leche descremada tregar · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 255 · Leche deslactosada descremada (La serenisima) · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 258 · Leche entera · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 262 · Leche parcialmente descremada (Veronica) · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 263 · lechuga · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 270 · Lomo de cerdo magro · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 272 · Lubina · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 273 · Maiz · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 276 · Mandarina · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 277 · Mandarina chica · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 278 · Mandarina grande · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 279 · Mandarina mediana · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 281 · Mango · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 282 · Mani · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 286 · Mantequilla de mani · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 287 · Manzana · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 288 · Manzana chica · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 289 · Manzana grande · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 290 · Manzana mediana · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 291 · Mariscos · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 299 · Melon · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 342 · Naranja · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 343 · Naranja chica · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 344 · Naranja grande · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 345 · Naranja mediana · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 349 · Nueces peladas · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 353 · Ñoquis con papa · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 354 · Ñoquis con papa carrefour · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 355 · ñoquis de papa · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 358 · Paleta de ternera · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 360 · Palomita (Carne magra) · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 361 · Palta · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 362 · Pan · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 363 · Pan artesano bimbo · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 364 · Pan baguette · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 365 · Pan blanco · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 366 · Pan con salvado carrefour · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 367 · Pan con salvado fargo plus · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 368 · Pan con salvado Noly · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 369 · Pan de centeno · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 370 · Pan de molde Bio sin gluten · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 371 · Pan de salvado (Fargo) · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 372 · Pan de salvado doble fargo · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 373 · Pan doble integral fargo · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 374 · Pan frances · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 377 · Pan lactal · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 378 · Pan lactal bimbo · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 379 · Pan lactal de salvado carrefour · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 380 · Pan lactal noly · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 381 · Pan negro · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 387 · Pan tipo artesano bimbo semillas del campo · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 391 · Papas · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 396 · Papaya · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 397 · Pasas de uva · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 398 · Pasta de mani · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 399 · Pasta de mani Sin tacc · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 402 · Peceto · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 403 · Pechuga de pavo · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 405 · Pechuga de pollo con piel · Revisar si puede reutilizar g, min 100, max 350, step 10 de Pechuga de pollo; no aplicado automáticamente.
- 408 · Pera · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 409 · Pera chica · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 410 · Pera grande · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 411 · Pera mediana · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 412 · Pescado blanco · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 415 · Pistachos · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 419 · Polenta · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 420 · Polenta (Coto) · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 421 · Polenta (Presto pronta) · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 422 · Polenta (Quaker) · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 423 · Polenta carrefour · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 424 · Pomelo · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 432 · Pure de papas (General) · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 454 · Queso cremon cremoso · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 456 · Queso cremoso · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 457 · Queso cremoso (cremac) · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 459 · Queso cremoso cremac · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 460 · Queso cremoso light · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 461 · Queso cremoso port salut · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 462 · Queso cremoso punta del agua · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 463 · Queso cremoso punta del agua light · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 464 · Queso cremoso saint paulin · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 466 · Queso cremoso temblay · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 491 · Ravioles (Carrefour) · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 492 · Remolacha · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 515 · Sandia · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 517 · Sardinas · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 519 · Seitan · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 520 · Semillas de calabaza · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 523 · Semillas de girasol · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 524 · Semillas de lino · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 528 · Soja texturizada · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 533 · Tallarines al huevo (Coto) · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 541 · Ternera magra · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 543 · tofu · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 544 · Tomate · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 548 · Tostadas clasicas · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 551 · Tostadas de arroz · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 561 · Tostadas de mesa · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 584 · Uvas · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 587 · Verduras · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 589 · Whey protein Isolate · La regla histórica ya aporta min 20, max 50 y step 5; falta confirmar unit='g'.
- 591 · Whey protein SN · La regla histórica ya aporta min 20, max 50 y step 5; falta confirmar unit='g'.
- 592 · Yogurisimo bebible · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 593 · Yogurisimo firme la serenisima (190 grs) · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 594 · Yogurt activia bebible · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 595 · Yogurt bebible (Ser) · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 596 · Yogurt bebible vida light · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 597 · Yogurt descremado bebible Ilolay · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 598 · Yogurt descremado bebible vida · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 599 · Yogurt descremado gran compra · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 600 · Yogurt entero bebible Ilolay · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 601 · Yogurt entero bebible Yogs · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 602 · Yogurt entero gran compra · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 603 · Yogurt light gran compra · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 604 · Yogurt light la serenisima (Bebible) · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 605 · Zanahorias · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 607 · Zapallo · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
- 609 · Pata muslo de pollo sin piel · Falta una fuente histórica confiable para unit/min/max/step o allowedValues; no se propone un límite arbitrario.
