# Auditoría estructural de cantidades y caso Arroz + Almendras

Evidencia tomada el 2026-07-26. La colección `fooddatabase2` se consultó en modo de sólo lectura; no se realizó ninguna escritura productiva.

## Resultado ejecutivo

- 630 documentos revisados: 560 canónicos y 70 legacy.
- 591 detectados por estructura: 560 por `macroBasis: perUnit` y 31 legacy por unidad discreta o ausente.
- 537 canónicos activos; 192 usan unidades discretas; 178 tienen máximo <= 5.
- 0 canónicos activos discretos sin máximo explícito; 31 legacy detectados sí dependen de fallback si llegan aislados.
- 50 discretos activos aportan menos de 100 kcal a su máximo y 7 menos de 25 kcal.
- `Almendras` forma parte de 154 registros `Unid` con la plantilla `sugerida=1, min=1, max=3, step=1`. El patrón es estructural y transversal, no nominal.
- El `3` de Almendras nace explícitamente en `fooddatabase2.porcionMax`; no se deriva de cantidad base, sugerida, `servingSize`, nombre, categoría ni fallback.
- Técnicamente `porcionMax` es un techo duro. Su intención de producto no está documentada y `3 almendras = 21,45 kcal / 1,83 g de grasa` es sospechoso. Clasificación: **CASO C**, sin cambiar el dato.
- Se corrigieron cuatro fallas de software: catálogo omitido por Admin/Coach, alias `Grs`, redondeo prematuro de macros unitarios en Tracking y homónimos legacy expuestos junto al canónico.
- `tracking_remaining_v2` continúa aislada a Tracking; Admin/Coach conservan su policy histórica.

## 1. Origen exacto y contrato

Documento: `_id=6619bfeb147cd50b64677696`, `alimentoId=34`. Campo original: **`porcionMax: 3`**. El importador lee por separado `cantidadUnidad` (`scripts/importarAlimentosDesdeExcel.js:142,177`), `macroBasis` (`:201`) y `porcionMin`, `porcionMax`, `porcionSugerida`, `multiplo` (`:203-206`). No deriva el máximo.

La precedencia de aliases está en `servicio/alimentos.js:165-168`:

| Concepto | Precedencia dentro de una forma |
|---|---|
| Mínimo | `minGramos`, `minQuantity`, `cantidadMin`, `porcionMin` |
| Máximo | `maxGramos`, `maxQuantity`, `cantidadMax`, `porcionMax` |
| Step | `stepGramos`, `stepQuantity`, `step`, `multiplo` |

Primero gana el catálogo canónico y después el payload. Por eso un cliente no puede ampliar `catalog.porcionMax=3` enviando `maxGramos=40`. Las reglas históricas por nombre/categoría sólo son fallback cuando no existe un máximo explícito.

### Registro real relevante

```json
{"_id":"6619bfeb147cd50b64677696","id":null,"alimentoId":34,"nombre":"Almendras","unidadBase":"Unid","unidad":"Unid","macroBasis":"perUnit","kcalUnidad":7.15,"proteinaUnidad":0.26,"carbohidratosUnidad":0.155,"grasasUnidad":0.61,"cantidadUnidad":1,"porcion":null,"porcionMin":1,"porcionMax":3,"porcionSugerida":1,"cantidadMin":null,"cantidadMax":null,"minQuantity":null,"maxQuantity":null,"minGramos":null,"maxGramos":null,"step":null,"stepGramos":null,"multiplo":1,"servingSize":null,"servingUnit":null,"categoria":"Grasas","fuente":"Grasas","activo":true}
```

## 2. Las doce etapas reales

Target: `356 kcal, P 0, C 19,3, G 41`. Las etapas frontend se ejecutaron importando sus funciones reales; las server-side pasaron por `ServicioFoodLogs`, `ServicioAlimentos` y `menu2.js`.

| Etapa | Unidad | Basis | Kcal | P | C | G | Mínimo | Máximo | Step | Fuente del máximo |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 1. `fooddatabase2` | Unid | perUnit | 7.15 | 0.26 | 0.155 | 0.61 | `porcionMin=1` | `porcionMax=3` | `multiplo=1` | `fooddatabase2.porcionMax` |
| 2. Endpoint | Unid | perUnit | 7.15 | 0.26 | 0.155 | 0.61 | 1 | 3 | 1 | propiedad preservada |
| 3. Selección | Unid | perUnit | 7.15 | 0.26 | 0.155 | 0.61 | 1 | 3 | 1 | objeto seleccionado |
| 4. Borrador | Unid | perUnit | 7.15 | 0.26 | 0.155 | 0.61 | 1 | 3 | 1 | `draft.food.porcionMax` |
| 5. `pendingFood` | Unid | por unidad | 7.15 | 0.26 | 0.155 | 0.61 | `minGramos=1` | `maxGramos=3` | `stepGramos=1` | frontend desde `porcionMax` |
| 6. Payload endpoint | Unid | por unidad | 7.15 | 0.26 | 0.155 | 0.61 | 1 | 3 | 1 | payload, no autoritativo |
| 7. `ServicioFoodLogs` | Unid | por unidad | 7.15 | 0.26 | 0.155 | 0.61 | 1 | 3 | 1 | no remapea; fuerza policy |
| 8. `ServicioAlimentos` | Unid | perUnit | 7.15 | 0.26 | 0.155 | 0.61 | 1 | 3 | 1 | `catalog.porcionMax` |
| 9. Entrada `menu2.js` | Unid | vector/unidad | 7.15 | 0.26 | 0.155 | 0.61 | 1 | 3 | 1 | `catalog.porcionMax` |
| 10. Constraint efectiva | Unid | vector/unidad | 7.15 | 0.26 | 0.155 | 0.61 | 1 | 3 | 1 | explícita, catálogo |
| 11. Respuesta motor | Unid | total para 2 | 14.3 | 0.52 | 0.31 | 1.22 | 1 | 3 | 1 | metadata del motor |
| 12. Propuesta UI | Unid | total para 2 | 14.3 | 0.52 | 0.31 | 1.22 | 1 | 3 | 1 | metadata reconstruida |

Todos los aliases solicitados, incluidos los ausentes (`null`):

```json
[
{"etapa":1,"id":null,"_id":"6619bfeb147cd50b64677696","alimentoId":34,"nombre":"Almendras","unidad":"Unid","macroBasis":"perUnit","kcal":7.15,"proteina":0.26,"carbohidratos":0.155,"grasas":0.61,"cantidadBase":1,"porcion":null,"porcionMin":1,"porcionMax":3,"cantidadMin":null,"cantidadMax":null,"minQuantity":null,"maxQuantity":null,"minGramos":null,"maxGramos":null,"step":null,"stepGramos":null,"multiplo":1,"servingSize":null,"servingUnit":null,"categoria":"Grasas","fuente":"Grasas","fuenteMax":"fooddatabase2.porcionMax"},
{"etapa":2,"id":null,"_id":"6619bfeb147cd50b64677696","alimentoId":34,"nombre":"Almendras","unidad":"Unid","macroBasis":"perUnit","kcal":7.15,"proteina":0.26,"carbohidratos":0.155,"grasas":0.61,"cantidadBase":1,"porcion":null,"porcionMin":1,"porcionMax":3,"cantidadMin":null,"cantidadMax":null,"minQuantity":null,"maxQuantity":null,"minGramos":null,"maxGramos":null,"step":null,"stepGramos":null,"multiplo":1,"servingSize":null,"servingUnit":null,"categoria":"Grasas","fuente":"Grasas","fuenteMax":"endpoint.porcionMax"},
{"etapa":3,"id":null,"_id":"6619bfeb147cd50b64677696","alimentoId":34,"nombre":"Almendras","unidad":"Unid","macroBasis":"perUnit","kcal":7.15,"proteina":0.26,"carbohidratos":0.155,"grasas":0.61,"cantidadBase":1,"porcion":null,"porcionMin":1,"porcionMax":3,"cantidadMin":null,"cantidadMax":null,"minQuantity":null,"maxQuantity":null,"minGramos":null,"maxGramos":null,"step":null,"stepGramos":null,"multiplo":1,"servingSize":null,"servingUnit":null,"categoria":"Grasas","fuente":"Grasas","fuenteMax":"selected.porcionMax"},
{"etapa":4,"id":"draft-almond","_id":"6619bfeb147cd50b64677696","alimentoId":34,"foodId":"6619bfeb147cd50b64677696","nombre":"Almendras","unidad":"Unid","macroBasis":"perUnit","kcal":7.15,"proteina":0.26,"carbohidratos":0.155,"grasas":0.61,"cantidadBase":1,"porcion":null,"porcionMin":1,"porcionMax":3,"cantidadMin":null,"cantidadMax":null,"minQuantity":null,"maxQuantity":null,"minGramos":null,"maxGramos":null,"step":null,"stepGramos":null,"multiplo":1,"servingSize":null,"servingUnit":null,"categoria":"Grasas","fuente":"draft.food","fuenteMax":"draft.food.porcionMax"},
{"etapa":5,"id":"6619bfeb147cd50b64677696","_id":null,"alimentoId":null,"foodId":"6619bfeb147cd50b64677696","nombre":"Almendras","unidad":"Unid","macroBasis":null,"kcal":7.15,"proteina":0.26,"carbohidratos":0.155,"grasas":0.61,"cantidadBase":null,"porcion":null,"porcionMin":null,"porcionMax":null,"cantidadMin":null,"cantidadMax":null,"minQuantity":null,"maxQuantity":null,"minGramos":1,"maxGramos":3,"step":null,"stepGramos":1,"multiplo":null,"servingSize":null,"servingUnit":null,"categoria":"Grasas","fuente":"pending","fuenteMax":"food.porcionMax -> maxGramos"},
{"etapa":6,"id":"6619bfeb147cd50b64677696","_id":null,"alimentoId":null,"foodId":"6619bfeb147cd50b64677696","nombre":"Almendras","unidad":"Unid","macroBasis":null,"kcal":7.15,"proteina":0.26,"carbohidratos":0.155,"grasas":0.61,"cantidadBase":null,"porcion":null,"porcionMin":null,"porcionMax":null,"cantidadMin":null,"cantidadMax":null,"minQuantity":null,"maxQuantity":null,"minGramos":1,"maxGramos":3,"step":null,"stepGramos":1,"multiplo":null,"servingSize":null,"servingUnit":null,"categoria":"Grasas","fuente":"pending","fuenteMax":"payload.maxGramos"},
{"etapa":7,"id":"6619bfeb147cd50b64677696","_id":null,"alimentoId":null,"foodId":"6619bfeb147cd50b64677696","nombre":"Almendras","unidad":"Unid","macroBasis":null,"kcal":7.15,"proteina":0.26,"carbohidratos":0.155,"grasas":0.61,"cantidadBase":null,"porcion":null,"porcionMin":null,"porcionMax":null,"cantidadMin":null,"cantidadMax":null,"minQuantity":null,"maxQuantity":null,"minGramos":1,"maxGramos":3,"step":null,"stepGramos":1,"multiplo":null,"servingSize":null,"servingUnit":null,"categoria":"Grasas","fuente":"pending","policy":"tracking_remaining_v2","fuenteMax":"payload sin remapeo"},
{"etapa":8,"id":"6619bfeb147cd50b64677696","_id":null,"alimentoId":null,"foodId":"6619bfeb147cd50b64677696","nombre":"Almendras","unidad":"Unid","macroBasis":"perUnit","kcal":7.15,"proteina":0.26,"carbohidratos":0.155,"grasas":0.61,"cantidadBase":null,"porcion":null,"porcionMin":null,"porcionMax":null,"cantidadMin":null,"cantidadMax":null,"minQuantity":null,"maxQuantity":null,"minGramos":1,"maxGramos":3,"step":null,"stepGramos":1,"multiplo":null,"servingSize":null,"servingUnit":null,"categoria":"Grasas","fuente":"pending","fuenteMax":"catalog.porcionMax"},
{"etapa":9,"id":"6619bfeb147cd50b64677696","_id":null,"alimentoId":null,"foodId":"6619bfeb147cd50b64677696","nombre":"Almendras","unidad":"Unid","macroBasis":"vector perUnit","kcal":7.15,"proteina":0.26,"carbohidratos":0.155,"grasas":0.61,"cantidadBase":null,"porcion":null,"porcionMin":null,"porcionMax":null,"cantidadMin":null,"cantidadMax":null,"minQuantity":1,"maxQuantity":3,"minGramos":1,"maxGramos":3,"step":1,"stepGramos":1,"multiplo":null,"servingSize":null,"servingUnit":null,"categoria":"Grasas","fuente":"selectedPending","fuenteMax":"catalog.porcionMax"},
{"etapa":10,"id":"6619bfeb147cd50b64677696","_id":null,"alimentoId":null,"nombre":"Almendras","unidad":"Unid","macroBasis":"vector perUnit","kcal":7.15,"proteina":0.26,"carbohidratos":0.155,"grasas":0.61,"cantidadBase":null,"porcion":null,"porcionMin":null,"porcionMax":null,"cantidadMin":null,"cantidadMax":null,"minQuantity":1,"maxQuantity":3,"minGramos":1,"maxGramos":3,"step":1,"stepGramos":1,"multiplo":null,"servingSize":null,"servingUnit":null,"categoria":"Grasas","fuente":"constraint","maxExplicit":true,"fuenteMax":"catalog.porcionMax"},
{"etapa":11,"id":"6619bfeb147cd50b64677696","_id":null,"alimentoId":null,"foodId":"6619bfeb147cd50b64677696","nombre":"Almendras","unidad":"Unid","macroBasis":"total propuesta","kcal":14.3,"proteina":0.52,"carbohidratos":0.31,"grasas":1.22,"cantidadBase":null,"porcion":2,"porcionMin":null,"porcionMax":null,"cantidadMin":null,"cantidadMax":null,"minQuantity":1,"maxQuantity":3,"minGramos":1,"maxGramos":3,"step":1,"stepGramos":1,"multiplo":null,"servingSize":null,"servingUnit":null,"categoria":"Grasas","fuente":"generated","fuenteMax":"catalog.porcionMax"},
{"etapa":12,"id":"6619bfeb147cd50b64677696","_id":"6619bfeb147cd50b64677696","alimentoId":34,"foodId":"6619bfeb147cd50b64677696","nombre":"Almendras","unidad":"Unid","macroBasis":"total + food perUnit","kcal":14.3,"proteina":0.52,"carbohidratos":0.31,"grasas":1.22,"cantidadBase":1,"porcion":2,"porcionMin":1,"porcionMax":3,"cantidadMin":null,"cantidadMax":null,"minQuantity":1,"maxQuantity":3,"minGramos":1,"maxGramos":3,"step":1,"stepGramos":1,"multiplo":1,"servingSize":null,"servingUnit":null,"categoria":"Grasas","fuente":"proposal.generated","fuenteMax":"generated.quantityConstraintSources.max"}
]
```

Resultado integrado: Arroz `100 g`, Almendras `2 Unid`, `352,8 kcal / P 8,52 / C 75,81 / G 1,72`; IDs canónicos preservados; warning de máximo limitante activo para grasas.

## 3. Semántica comparada

| Alimento | Unidad | Sugerida/min/max/step | Semántica UI | Semántica backend | Máximo efectivo | Evaluación |
|---|---|---|---|---|---:|---|
| Almendras (34) | Unid | 1/1/3/1 | campos separados | máximo duro | 3 | sospechoso: 21,45 kcal máximas |
| Huevos (224) | Unid | 2/1/4/1 | campos separados | máximo duro | 4 | plausible y distinto de sugerida |
| Claras de huevos (115) | Unid | 3/1/8/1 | campos separados | máximo duro | 8 | prueba que sugerida no se copia a máximo |
| Banana mediana (54) | Unid | 1/1/3/1 | campos separados | máximo duro | 3 | misma plantilla, intención pendiente |
| Manzana mediana (290) | Unid | 1/1/3/1 | campos separados | máximo duro | 3 | misma plantilla |
| Nueces peladas (349) | Grs | 10/5/30/5 | campos separados | máximo duro en gramos | 30 | no repite el caso unitario |
| Castañas de caju (96) | Grs | 10/5/30/5 | campos separados | máximo duro en gramos | 30 | no repite el caso unitario |
| Pan por rebanada | Reb | 2/1/4/1 | campos separados | máximo por rebanada | 4 | contrato discreto |
| Jamón por feta | Fetas | 2/1/6/1 | campos separados | máximo por feta | 6 | contrato discreto |

No hay un formulario actual que edite estos límites: Admin consume la base maestra. El código demuestra la semántica operacional, no la intención nutricional original; esa ausencia contractual impide declarar intencional el techo de tres almendras.

## 4. Prueba matemática exhaustiva

Objetivo `356 kcal, P 0, C 19,3, G 41`; zona `[348,88; 356]`. Arroz: `3,385 / 0,08 / 0,755 / 0,005` por gramo, `30..120`, step 5. Almendras: `7,15 / 0,26 / 0,155 / 0,61` por unidad, `1..3`, step 1.

`macroScore = ((C-19,3)/19,3)^2 + ((G-41)/41)^2`.

| Arroz g | Almendras | Kcal | P | C | G | Déficit kcal | Zona | MacroScore | Motivo |
|---:|---:|---:|---:|---:|---:|---:|---|---:|---|
| 30 | 1 | 108.7 | 2.66 | 22.805 | 0.76 | 247.3 | Fuera | 0.996251 | Fuera de zona |
| 30 | 2 | 115.85 | 2.92 | 22.96 | 1.37 | 240.15 | Fuera | 0.970250 | Fuera de zona |
| 30 | 3 | 123 | 3.18 | 23.115 | 1.98 | 233 | Fuera | 0.944820 | Fuera de zona |
| 35 | 1 | 125.625 | 3.06 | 26.58 | 0.785 | 230.375 | Fuera | 1.104355 | Fuera de zona |
| 35 | 2 | 132.775 | 3.32 | 26.735 | 1.395 | 223.225 | Fuera | 1.081513 | Fuera de zona |
| 35 | 3 | 139.925 | 3.58 | 26.89 | 2.005 | 216.075 | Fuera | 1.059243 | Fuera de zona |
| 40 | 1 | 142.55 | 3.46 | 30.355 | 0.81 | 213.45 | Fuera | 1.288976 | Fuera de zona |
| 40 | 2 | 149.7 | 3.72 | 30.51 | 1.42 | 206.3 | Fuera | 1.269294 | Fuera de zona |
| 40 | 3 | 156.85 | 3.98 | 30.665 | 2.03 | 199.15 | Fuera | 1.250183 | Fuera de zona |
| 45 | 1 | 159.475 | 3.86 | 34.13 | 0.835 | 196.525 | Fuera | 1.550112 | Fuera de zona |
| 45 | 2 | 166.625 | 4.12 | 34.285 | 1.445 | 189.375 | Fuera | 1.533590 | Fuera de zona |
| 45 | 3 | 173.775 | 4.38 | 34.44 | 2.055 | 182.225 | Fuera | 1.517639 | Fuera de zona |
| 50 | 1 | 176.4 | 4.26 | 37.905 | 0.86 | 179.6 | Fuera | 1.887765 | Fuera de zona |
| 50 | 2 | 183.55 | 4.52 | 38.06 | 1.47 | 172.45 | Fuera | 1.874402 | Fuera de zona |
| 50 | 3 | 190.7 | 4.78 | 38.215 | 2.08 | 165.3 | Fuera | 1.861612 | Fuera de zona |
| 55 | 1 | 193.325 | 4.66 | 41.68 | 0.885 | 162.675 | Fuera | 2.301934 | Fuera de zona |
| 55 | 2 | 200.475 | 4.92 | 41.835 | 1.495 | 155.525 | Fuera | 2.291731 | Fuera de zona |
| 55 | 3 | 207.625 | 5.18 | 41.99 | 2.105 | 148.375 | Fuera | 2.282100 | Fuera de zona |
| 60 | 1 | 210.25 | 5.06 | 45.455 | 0.91 | 145.75 | Fuera | 2.792619 | Fuera de zona |
| 60 | 2 | 217.4 | 5.32 | 45.61 | 1.52 | 138.6 | Fuera | 2.785576 | Fuera de zona |
| 60 | 3 | 224.55 | 5.58 | 45.765 | 2.13 | 131.45 | Fuera | 2.779105 | Fuera de zona |
| 65 | 1 | 227.175 | 5.46 | 49.23 | 0.935 | 128.825 | Fuera | 3.359820 | Fuera de zona |
| 65 | 2 | 234.325 | 5.72 | 49.385 | 1.545 | 121.675 | Fuera | 3.355937 | Fuera de zona |
| 65 | 3 | 241.475 | 5.98 | 49.54 | 2.155 | 114.525 | Fuera | 3.352626 | Fuera de zona |
| 70 | 1 | 244.1 | 5.86 | 53.005 | 0.96 | 111.9 | Fuera | 4.003538 | Fuera de zona |
| 70 | 2 | 251.25 | 6.12 | 53.16 | 1.57 | 104.75 | Fuera | 4.002815 | Fuera de zona |
| 70 | 3 | 258.4 | 6.38 | 53.315 | 2.18 | 97.6 | Fuera | 4.002664 | Fuera de zona |
| 75 | 1 | 261.025 | 6.26 | 56.78 | 0.985 | 94.975 | Fuera | 4.723772 | Fuera de zona |
| 75 | 2 | 268.175 | 6.52 | 56.935 | 1.595 | 87.825 | Fuera | 4.726209 | Fuera de zona |
| 75 | 3 | 275.325 | 6.78 | 57.09 | 2.205 | 80.675 | Fuera | 4.729217 | Fuera de zona |
| 80 | 1 | 277.95 | 6.66 | 60.555 | 1.01 | 78.05 | Fuera | 5.520522 | Fuera de zona |
| 80 | 2 | 285.1 | 6.92 | 60.71 | 1.62 | 70.9 | Fuera | 5.526118 | Fuera de zona |
| 80 | 3 | 292.25 | 7.18 | 60.865 | 2.23 | 63.75 | Fuera | 5.532287 | Fuera de zona |
| 85 | 1 | 294.875 | 7.06 | 64.33 | 1.035 | 61.125 | Fuera | 6.393788 | Fuera de zona |
| 85 | 2 | 302.025 | 7.32 | 64.485 | 1.645 | 53.975 | Fuera | 6.402544 | Fuera de zona |
| 85 | 3 | 309.175 | 7.58 | 64.64 | 2.255 | 46.825 | Fuera | 6.411873 | Fuera de zona |
| 90 | 1 | 311.8 | 7.46 | 68.105 | 1.06 | 44.2 | Fuera | 7.343570 | Fuera de zona |
| 90 | 2 | 318.95 | 7.72 | 68.26 | 1.67 | 37.05 | Fuera | 7.355487 | Fuera de zona |
| 90 | 3 | 326.1 | 7.98 | 68.415 | 2.28 | 29.9 | Fuera | 7.367975 | Fuera de zona |
| 95 | 1 | 328.725 | 7.86 | 71.88 | 1.085 | 27.275 | Fuera | 8.369869 | Fuera de zona |
| 95 | 2 | 335.875 | 8.12 | 72.035 | 1.695 | 20.125 | Fuera | 8.384945 | Fuera de zona |
| 95 | 3 | 343.025 | 8.38 | 72.19 | 2.305 | 12.975 | Fuera | 8.400593 | Fuera de zona |
| 100 | 1 | 345.65 | 8.26 | 75.655 | 1.11 | 10.35 | Fuera | 9.472684 | Fuera de zona |
| 100 | 2 | 352.8 | 8.52 | 75.81 | 1.72 | 3.2 | Dentro | 9.490920 | Candidata en zona |
| 100 | 3 | 359.95 | 8.78 | 75.965 | 2.33 | -3.95 | Fuera | 9.509728 | Descartada: supera techo |
| 105 | 1 | 362.575 | 8.66 | 79.43 | 1.135 | -6.575 | Fuera | 10.652015 | Descartada: supera techo |
| 105 | 2 | 369.725 | 8.92 | 79.585 | 1.745 | -13.725 | Fuera | 10.673411 | Descartada: supera techo |
| 105 | 3 | 376.875 | 9.18 | 79.74 | 2.355 | -20.875 | Fuera | 10.695379 | Descartada: supera techo |
| 110 | 1 | 379.5 | 9.06 | 83.205 | 1.16 | -23.5 | Fuera | 11.907863 | Descartada: supera techo |
| 110 | 2 | 386.65 | 9.32 | 83.36 | 1.77 | -30.65 | Fuera | 11.932418 | Descartada: supera techo |
| 110 | 3 | 393.8 | 9.58 | 83.515 | 2.38 | -37.8 | Fuera | 11.957546 | Descartada: supera techo |
| 115 | 1 | 396.425 | 9.46 | 86.98 | 1.185 | -40.425 | Fuera | 13.240226 | Descartada: supera techo |
| 115 | 2 | 403.575 | 9.72 | 87.135 | 1.795 | -47.575 | Fuera | 13.267942 | Descartada: supera techo |
| 115 | 3 | 410.725 | 9.98 | 87.29 | 2.405 | -54.725 | Fuera | 13.296229 | Descartada: supera techo |
| 120 | 1 | 413.35 | 9.86 | 90.755 | 1.21 | -57.35 | Fuera | 14.649106 | Descartada: supera techo |
| 120 | 2 | 420.5 | 10.12 | 90.91 | 1.82 | -64.5 | Fuera | 14.679981 | Descartada: supera techo |
| 120 | 3 | 427.65 | 10.38 | 91.065 | 2.43 | -71.65 | Fuera | 14.711428 | Descartada: supera techo |

Hay 57 combinaciones: 13 sobre el techo, 43 bajo la zona y exactamente una dentro.

- `100 + 2`: 352,8 kcal, P 8,52, C 75,81, G 1,72, déficit 3,2, score 9,490920. Es la única en zona.
- `95 + 3`: 343,025 kcal; déficit 12,975, fuera de zona.
- `100 + 3`: 359,95 kcal; excede 3,95 y se descarta.
- Sin zona y minimizando sólo C/G bajo techo, ganaría `30 + 3`: 123 kcal, P 3,18, C 23,115, G 1,98, score 0,944820. Su déficit de 233 kcal explica por qué la policy no lo acepta.
- El óptimo dentro de zona es `100 + 2`; motor y oracle coinciden.

## 5. Diagnóstico max=40, sólo en tests

| Versión | Arroz | Almendras | Kcal | P | C | G | MacroScore |
|---|---:|---:|---:|---:|---:|---:|---:|
| Policy anterior capturada | 65 | 19 | 355,875 | 10,14 | 52,02 | 11,915 | 3,377401 |
| `tracking_remaining_v2` | 30 | 35 | 351,8 | 11,5 | 28,075 | 21,5 | 0,432923 |
| Oracle | 30 | 35 | 351,8 | 11,5 | 28,075 | 21,5 | 0,432923 |

La policy nueva usa más almendras, menos arroz, reduce 87,2 % el error C/G, respeta el techo y coincide con el oracle. No existe override runtime ni cambio productivo.

## 6. Mapeo de campos

| Campo | Admin | Frontend | Backend | Motor | Consistencia/acción |
|---|---|---|---|---|---|
| `cantidadUnidad` | base nutricional | inferencia de basis | base de macros | no limita | informativo |
| `macroBasis` | basis | conversión exacta | vector por g/unidad | vector normalizado | corregida precisión |
| `porcionSugerida` | “sugerida” | valor informativo/inicial | no es máximo | no limita | separado |
| `porcionMin` | rango de cálculo | `minGramos` | catálogo autoritativo | mínimo | consistente |
| `porcionMax` | rango de cálculo | `maxGramos` | catálogo autoritativo | máximo duro | intención de datos pendiente |
| `multiplo` | paso | `stepGramos` | catálogo autoritativo | grilla | consistente |
| `minQuantity/cantidadMin` | alias externo | compatible | alias estructural | mínimo | conservar |
| `maxQuantity/cantidadMax` | alias externo | compatible | alias estructural | máximo | conservar |
| `servingSize/servingUnit` | informativo externo | no se vuelve máximo | no es constraint | no se usa | mapping explícito si se incorpora |
| fallback | no visible | no enviado | sólo sin explícito | último recurso | canonicalizar legacy |

## 7. Admin, Coach y Tracking

| Flujo | Motor | Policy antes | Policy después | Antes | Después | Regresión |
|---|---|---|---|---|---|---|
| Tracking arroz+almendras | `menu2.js` | tracking v2 | tracking v2 server-side | 100+2; macros UI podían redondearse | 100+2; 352,8 exactas + metadata/warning | No |
| Admin arroz+almendras | `menu2.js` | histórica, defaults 300/12 | histórica, catálogo 120/3 | 97+4; 356,95 | 100+2; 352,8 | Corrección de contrato |
| Coach arroz+almendras | `menu2.js` | histórica, defaults 300/12 | histórica, catálogo 120/3 | 97+4; 356,95 | 100+2; 352,8 | Corrección de contrato |
| Admin normal pollo/arroz/aceite | `menu2.js` | histórica | histórica | 133/75/11, steps inválidos | 140/75/10, 498,48 | Corrección de contrato |
| Coach normal pollo/arroz/aceite | `menu2.js` | histórica | histórica | 133/75/11, steps inválidos | 140/75/10, 498,48 | Corrección de contrato |
| `selectedOnly` | `menu2.js` | sólo seleccionados | igual | preservado | preservado | No |
| `fixedFoods` | `menu2.js` | fijos inmutables | igual | preservado | preservado | No |
| Unidades/steps/min/max | `menu2.js` | dependían del cliente | catálogo autoritativo | defaults posibles | contrato real | Corrección |

Admin/Coach no adoptaron la policy Tracking: `optimization` sigue en `null`; sólo cambian cantidades que antes violaban límites o pasos reales.

## 8. UI

Admin muestra unidad, sugerida, rango de cálculo y paso. Tracking muestra zona, constraints y la advertencia sólo cuando un máximo realmente limita la meta. Para el target real: `maxConstraintsLimited=true` y detalle “Almendras: máximo 3 Unid; limita grasas”. No expone nombres técnicos. El warning envuelve texto largo; foco/Escape y acciones móviles de 44 px se preservan.

## 9. Conteos globales

| Métrica | Cantidad |
|---|---:|
| Documentos revisados | 630 |
| Detectados estructuralmente | 591 |
| Canónicos totales / activos | 560 / 537 |
| Activos discretos | 192 |
| Discretos activos con max <= 5 | 178 |
| Activos discretos sin máximo explícito | 0 |
| Legacy detectados sin máximo | 31 |
| Detectados con fallback | 31 |
| Capacidad máxima < 100 kcal | 50 |
| Capacidad máxima < 25 kcal | 7 |
| Plantilla Unid 1/1/3/1 | 154 |

Prioridad por capacidad <25 kcal: **Rhodesia, Filet de merluza, Tostaditas de arroz sin sal, Almendras, Gomitas Mogul, Tostaditas de arroz molino ala y Tostaditas de arroz Molinos ala**. Es señal de revisión, no permiso para modificar.

Errores confirmados: límites omitidos por consumidores, `Grs` mal clasificado, redondeo unitario prematuro y homónimos legacy. No se confirmó que sugerida se convierta en máximo: son columnas diferentes y hay numerosos valores distintos.

## 10. Inventario completo de los 591 detectados

| Alimento | ID | Estado | Unidad | Basis | Base | Sugerida | Min orig. | Max orig. | Step | Min efectivo | Max efectivo | Fuente max | Max kcal | Max P | Max C | Max G | Semántica | Riesgo | Acción |
|---|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---|---|---|
| (sin nombre) | 6619bfeb147cd50b646778df | legacy | (vacía) | (ausente) | — | — | — | — | — | 1 | 12 | fallback.discrete.max12 | 0 | 0 | 0 | 0 | Sin máximo almacenado; fallback | Default arbitrario | Canonicalizar o excluir legacy |
| (sin nombre) | 6619bfeb147cd50b646778e0 | legacy | (vacía) | (ausente) | — | — | — | — | — | 1 | 12 | fallback.discrete.max12 | 0 | 0 | 0 | 0 | Sin máximo almacenado; fallback | Default arbitrario | Canonicalizar o excluir legacy |
| (sin nombre) | 6619bfeb147cd50b646778e1 | legacy | Unid | (ausente) | 1 | — | — | — | — | 1 | 12 | fallback.discrete.max12 | 0 | 0 | 0 | 0 | Sin máximo almacenado; fallback | Default arbitrario | Canonicalizar o excluir legacy |
| (sin nombre) | 6619bfeb147cd50b646778e2 | legacy | Unid | (ausente) | 1 | — | — | — | — | 1 | 12 | fallback.discrete.max12 | 0 | 0 | 0 | 0 | Sin máximo almacenado; fallback | Default arbitrario | Canonicalizar o excluir legacy |
| (sin nombre) | 6619bfeb147cd50b646778e3 | legacy | Unid | (ausente) | 1 | — | — | — | — | 1 | 12 | fallback.discrete.max12 | 0 | 0 | 0 | 0 | Sin máximo almacenado; fallback | Default arbitrario | Canonicalizar o excluir legacy |
| (sin nombre) | 6619bfeb147cd50b646778e4 | legacy | Unid | (ausente) | 1 | — | — | — | — | 1 | 12 | fallback.discrete.max12 | 0 | 0 | 0 | 0 | Sin máximo almacenado; fallback | Default arbitrario | Canonicalizar o excluir legacy |
| (sin nombre) | 6619bfeb147cd50b646778e5 | legacy | Unid | (ausente) | 1 | — | — | — | — | 1 | 12 | fallback.discrete.max12 | 0 | 0 | 0 | 0 | Sin máximo almacenado; fallback | Default arbitrario | Canonicalizar o excluir legacy |
| Aceite de coco | 1 | activo/canónico | Grs | perUnit | 1 | 10 | 5 | 30 | 5 | 5 | 30 | porcionMax | 269.73 | 0 | 0 | 29.97 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Aceite de oliva | 2 | activo/canónico | Grs | perUnit | 1 | 10 | 5 | 30 | 5 | 5 | 30 | porcionMax | 269.73 | 0 | 0 | 29.97 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Aceitunas negras | 3 | activo/canónico | Grs | perUnit | 1 | 10 | 5 | 30 | 5 | 5 | 30 | porcionMax | 47.22 | 0.3 | 0.03 | 5.1 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Aceitunas verdes | 4 | activo/canónico | Grs | perUnit | 1 | 10 | 5 | 30 | 5 | 5 | 30 | porcionMax | 59.64 | 0.36 | 1.05 | 6 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Ajo | 5 | activo/canónico | Grs | perUnit | 1 | 150 | 50 | 300 | 10 | 50 | 300 | porcionMax | 447.9 | 19.2 | 89.4 | 1.5 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Alfajor blanco jorgito | 6 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 540.3 | 9.3 | 90 | 15.9 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Alfajor bon o bon | 6619bfeb147cd50b6467767c | legacy | Unid | (ausente) | 1 | — | — | — | — | 1 | 12 | fallback.discrete.max12 | 2421.6 | 44.4 | 264 | 132 | Sin máximo almacenado; fallback | Default arbitrario | Canonicalizar o excluir legacy |
| Alfajor bon o bon | 8 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 605.4 | 11.1 | 66 | 33 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Alfajor de almendras | 9 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 519 | 9 | 60 | 27 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Alfajor de chocolate jorgito | 10 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 661.5 | 9.3 | 96 | 26.7 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Alfajor fulbito | 11 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 364.8 | 4.2 | 60 | 12 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Alfajor glaceado jorgito | 12 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 296.7 | 4.5 | 55.5 | 6.3 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Alfajor guaymallen | 6619bfeb147cd50b64677682 | legacy | Unid | (ausente) | 1 | — | — | — | — | 1 | 12 | fallback.discrete.max12 | 1933.2 | 24 | 300 | 70.8 | Sin máximo almacenado; fallback | Default arbitrario | Canonicalizar o excluir legacy |
| Alfajor guaymallen | 14 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 483.3 | 6 | 75 | 17.7 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Alfajor havanna 70 | 15 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 747.6 | 11.4 | 108 | 30 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Alfajor jorgelin | 16 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 996 | 15 | 153 | 36 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Alfajor jorgito | 18 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 649.5 | 9.3 | 93 | 26.7 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Alfajor jorgito | 6619bfeb147cd50b64677687 | legacy | Unid | (ausente) | 1 | — | — | — | — | 1 | 12 | fallback.discrete.max12 | 2598 | 37.2 | 372 | 106.8 | Sin máximo almacenado; fallback | Default arbitrario | Canonicalizar o excluir legacy |
| Alfajor Oreo Trilogia | 19 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 797.4 | 8.1 | 90 | 45 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Alfajor pepitos | 20 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 866.4 | 9.6 | 99 | 48 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Alfajor pepitos triple | 21 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 862.8 | 8.7 | 99 | 48 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Alfajor Shot | 22 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 947.4 | 14.1 | 108 | 51 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Alfajor shot triple | 23 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 947.4 | 14.1 | 108 | 51 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Alfajor tatin | 24 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 423.9 | 7.2 | 63 | 15.9 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Alfajor terrabusi clasico | 25 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 593.7 | 10.8 | 87 | 22.5 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Alfajor terrabusi doble | 26 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 618 | 10.5 | 90 | 24 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Alfajor terrabusi grande | 27 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 798.3 | 13.8 | 123 | 27.9 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Alfajor terrabusi triple | 28 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 798.3 | 13.8 | 123 | 27.9 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Alfajor tofi | 29 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 542.4 | 8.4 | 84 | 19.2 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Alfajor triple tatin | 30 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 758.7 | 13.2 | 111 | 29.1 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Alfajor triple terrabusi | 31 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 798.3 | 13.8 | 123 | 27.9 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Alfajor vauquita | 32 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 699 | 12 | 102 | 27 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Almendras | 34 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 21.45 | 0.78 | 0.465 | 1.83 | Máximo duro explícito; sugerida separada | Probable error de datos | Revisión de producto prioritaria |
| Almendras | 6619bfeb147cd50b64677697 | legacy | Unid | (ausente) | 1 | — | — | — | — | 1 | 12 | fallback.discrete.max12 | 85.8 | 3.12 | 1.86 | 7.32 | Sin máximo almacenado; fallback | Default arbitrario | Canonicalizar o excluir legacy |
| Anana | 35 | activo/canónico | Grs | perUnit | 1 | 150 | 80 | 250 | 10 | 80 | 250 | porcionMax | 127.5 | 1.25 | 25 | 2.5 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Arandanos | 36 | activo/canónico | Grs | perUnit | 1 | 150 | 80 | 250 | 10 | 80 | 250 | porcionMax | 143 | 1.75 | 34 | 0 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Arrocitas paquete amarillo | 37 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 85.35 | 18.9 | 1.425 | 0.45 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Arrocitas paquete verde | 38 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 73.875 | 1.95 | 15 | 0.675 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Arroz | 39 | activo/canónico | Grs | perUnit | 1 | 70 | 30 | 120 | 5 | 30 | 120 | porcionMax | 406.2 | 9.6 | 90.6 | 0.6 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Arroz (Cocido) | 40 | activo/canónico | Grs | perUnit | 1 | 200 | 80 | 350 | 10 | 80 | 350 | porcionMax | 453.25 | 9.45 | 101.5 | 1.05 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Arroz inflado | 41 | activo/canónico | Grs | perUnit | 1 | 70 | 30 | 120 | 5 | 30 | 120 | porcionMax | 396 | 0 | 99 | 0 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Arroz integral | 42 | activo/canónico | Grs | perUnit | 1 | 70 | 30 | 120 | 5 | 30 | 120 | porcionMax | 420 | 9.6 | 90 | 2.4 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Arroz integral (Cocido) | 43 | activo/canónico | Grs | perUnit | 1 | 200 | 80 | 350 | 10 | 80 | 350 | porcionMax | 386.75 | 9.1 | 80.5 | 3.15 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Arvejas secas | 44 | activo/canónico | Grs | perUnit | 1 | 70 | 30 | 150 | 5 | 30 | 150 | porcionMax | 472.5 | 33 | 75 | 4.5 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Arvejas secas remojadas | 45 | activo/canónico | Grs | perUnit | 1 | 200 | 80 | 350 | 10 | 80 | 350 | porcionMax | 378.35 | 23.45 | 67.2 | 1.75 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Atun en lomitos al aceite | 46 | activo/canónico | Pote | perUnit | 1 | 1 | 1 | 2 | 1 | 1 | 2 | porcionMax | 492 | 60 | 0 | 28 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Atun en lomitos al natural | 47 | activo/canónico | Pote | perUnit | 1 | 1 | 1 | 2 | 1 | 1 | 2 | porcionMax | 240 | 60 | 0 | 0 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Avellanas | 48 | activo/canónico | Grs | perUnit | 1 | 10 | 5 | 30 | 5 | 5 | 30 | porcionMax | 196.8 | 4.8 | 1.2 | 19.2 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Avena instantanea | 49 | activo/canónico | Grs | perUnit | 1 | 70 | 30 | 120 | 5 | 30 | 120 | porcionMax | 422.4 | 15.6 | 68.4 | 9.6 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Azucar | 50 | activo/canónico | Grs | perUnit | 1 | 15 | 5 | 40 | 5 | 5 | 40 | porcionMax | 160 | 0 | 40 | 0 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Banana | 51 | activo/canónico | Grs | perUnit | 1 | 150 | 80 | 250 | 10 | 80 | 250 | porcionMax | 222.75 | 2.75 | 51.25 | 0.75 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Banana chica | 52 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 270.51 | 3.3 | 62.1 | 0.99 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Banana grande | 53 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 365.91 | 4.44 | 84 | 1.35 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Banana mediana | 54 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 317.61 | 3.87 | 72.9 | 1.17 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Barra de cereal | 55 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 251.7 | 2.7 | 42 | 8.1 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Barra de cereal frutilla Cereal Mix | 56 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 274.8 | 4.5 | 48 | 7.2 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Bastoncitos de merluza (Granja del sol) | 57 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 159.6 | 7.8 | 18.6 | 6 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Batatas | 58 | activo/canónico | Grs | perUnit | 1 | 200 | 80 | 350 | 10 | 80 | 350 | porcionMax | 301.35 | 5.6 | 68.95 | 0.35 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Batido proteico: | 6619bfeb147cd50b646776b0 | legacy | (vacía) | (ausente) | — | — | — | — | — | 1 | 12 | fallback.discrete.max12 | 0 | 0 | 0 | 0 | Sin máximo almacenado; fallback | Default arbitrario | Canonicalizar o excluir legacy |
| Batido proteico: | 59 | inactivo/canónico | g | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 0 | 0 | 0 | 0 | Máximo duro explícito; sugerida separada | Revisar | Confirmar baja/inactividad |
| Batido: | 6619bfeb147cd50b646776b1 | legacy | (vacía) | (ausente) | — | — | — | — | — | 1 | 12 | fallback.discrete.max12 | 0 | 0 | 0 | 0 | Sin máximo almacenado; fallback | Default arbitrario | Canonicalizar o excluir legacy |
| Batido: | 60 | inactivo/canónico | g | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 0 | 0 | 0 | 0 | Máximo duro explícito; sugerida separada | Revisar | Confirmar baja/inactividad |
| Bay biscuit | 61 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 205.35 | 4.95 | 42 | 1.95 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Berenjena | 62 | activo/canónico | Grs | perUnit | 1 | 150 | 50 | 300 | 10 | 50 | 300 | porcionMax | 71.52 | 3.03 | 13.5 | 0.6 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Bife angosto | 64 | activo/canónico | Grs | perUnit | 1 | 150 | 80 | 250 | 10 | 80 | 250 | porcionMax | 440 | 53.75 | 0 | 25 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Bife de chorizo magro | 65 | activo/canónico | Grs | perUnit | 1 | 10 | 5 | 30 | 5 | 5 | 30 | porcionMax | 43.35 | 6.45 | 0 | 1.95 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Biscuits | 66 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 150.75 | 3.15 | 31.5 | 1.35 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Bizcochos agridulces 9 de oro | 67 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 38.34 | 0.54 | 5.4 | 1.62 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Bizcochos dulces | 68 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 74.202 | 1.295 | 8.964 | 3.685 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Bizcochos light 9 de oro | 69 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 49.5 | 1.125 | 7.875 | 1.5 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Bizcochos salados | 70 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 77.14 | 1.345 | 7.968 | 4.432 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Bocaditos rellenos de frutilla | 71 | activo/canónico | Grs | perUnit | 1 | 30 | 10 | 100 | 5 | 10 | 100 | porcionMax | 436.59 | 10.89 | 69.3 | 12.87 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Bola de lomo | 72 | activo/canónico | Grs | perUnit | 1 | 150 | 80 | 250 | 10 | 80 | 250 | porcionMax | 327.5 | 53.75 | 0 | 12.5 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Bondiola (Lario) | 73 | activo/canónico | Grs | perUnit | 1 | 10 | 5 | 30 | 5 | 5 | 30 | porcionMax | 843 | 69 | 0 | 63 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Bondiola (Lario) | 74 | activo/canónico | Fetas | perUnit | 1 | 2 | 1 | 6 | 1 | 1 | 6 | porcionMax | 168.6 | 13.8 | 0 | 12.6 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Bondiola de cerdo | 75 | activo/canónico | Grs | perUnit | 1 | 10 | 5 | 30 | 5 | 5 | 30 | porcionMax | 77.778 | 5.742 | 0 | 6.09 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Bondiola feteada (Carrefour) | 76 | activo/canónico | Fetas | perUnit | 1 | 2 | 1 | 6 | 1 | 1 | 6 | porcionMax | 108.6 | 9.6 | 0 | 7.8 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| brocoli | 77 | activo/canónico | Grs | perUnit | 1 | 150 | 50 | 300 | 10 | 50 | 300 | porcionMax | 104.4 | 8.4 | 15 | 1.2 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Cadbury Dairy milk | 78 | activo/canónico | Grs | perUnit | 1 | 30 | 10 | 100 | 5 | 10 | 100 | porcionMax | 528 | 8.5 | 56 | 30 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Calabacin | 79 | activo/canónico | Grs | perUnit | 1 | 150 | 50 | 300 | 10 | 50 | 300 | porcionMax | 85.5 | 6 | 12 | 1.5 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Calabaza | 81 | activo/canónico | Grs | perUnit | 1 | 150 | 50 | 300 | 10 | 50 | 300 | porcionMax | 89.4 | 3 | 18 | 0.6 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Capelletini giacomo jamon  y queso | 82 | activo/canónico | Grs | perUnit | 1 | 40 | 20 | 80 | 5 | 20 | 80 | porcionMax | 283.92 | 8.72 | 49.12 | 5.84 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Capelletini giacomo tridicci | 83 | activo/canónico | Grs | perUnit | 1 | 70 | 30 | 150 | 5 | 30 | 150 | porcionMax | 517.35 | 16.65 | 92.1 | 9.15 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Capuccino Carrefour | 84 | activo/canónico | Grs | perUnit | 1 | 250 | 100 | 500 | 50 | 100 | 500 | porcionMax | 1864 | 72 | 340 | 24 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Capuccino Light La virginia | 85 | activo/canónico | Grs | perUnit | 1 | 250 | 100 | 500 | 50 | 100 | 500 | porcionMax | 2073.5 | 77 | 330 | 49.5 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Capuccino Tradicional La virginia | 86 | activo/canónico | Grs | perUnit | 1 | 250 | 100 | 500 | 50 | 100 | 500 | porcionMax | 2152 | 76 | 336 | 56 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Caramelos sugus | 87 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 37.536 | 0.144 | 8.16 | 0.48 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Carne de cerdo magro | 88 | activo/canónico | Grs | perUnit | 1 | 150 | 80 | 250 | 10 | 80 | 250 | porcionMax | 377.5 | 55 | 0 | 17.5 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Carne de res molida | 89 | activo/canónico | Grs | perUnit | 1 | 30 | 10 | 100 | 5 | 10 | 100 | porcionMax | 170 | 20 | 0 | 10 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Carne picada magra | 91 | activo/canónico | Grs | perUnit | 1 | 150 | 80 | 250 | 10 | 80 | 250 | porcionMax | 425 | 50 | 0 | 25 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Casancrem | 92 | activo/canónico | Grs | perUnit | 1 | 40 | 20 | 80 | 5 | 20 | 80 | porcionMax | 182.64 | 4.8 | 3.6 | 16.56 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Casancrem light | 93 | activo/canónico | Grs | perUnit | 1 | 40 | 20 | 80 | 5 | 20 | 80 | porcionMax | 102.88 | 6.96 | 6.16 | 5.6 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Castañas | 94 | activo/canónico | Grs | perUnit | 1 | 10 | 5 | 30 | 5 | 5 | 30 | porcionMax | 53.07 | 0.78 | 10.8 | 0.75 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Castañas de caju | 96 | activo/canónico | Grs | perUnit | 1 | 10 | 5 | 30 | 5 | 5 | 30 | porcionMax | 167.55 | 6.6 | 5.25 | 13.35 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Cebolla | 99 | activo/canónico | Grs | perUnit | 1 | 150 | 50 | 300 | 10 | 50 | 300 | porcionMax | 127.5 | 2.7 | 28.5 | 0.3 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Cereal de arroz | 100 | activo/canónico | Grs | perUnit | 1 | 70 | 30 | 120 | 5 | 30 | 120 | porcionMax | 396 | 0 | 99 | 0 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Cerealitas | 101 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 79.74 | 1.86 | 12 | 2.7 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Cerezas | 102 | activo/canónico | Grs | perUnit | 1 | 150 | 80 | 250 | 10 | 80 | 250 | porcionMax | 156.75 | 2.5 | 35 | 0.75 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Cerveza | 103 | activo/canónico | Ml | perUnit | 1 | 250 | 100 | 500 | 50 | 100 | 500 | porcionMax | 215 | 0 | 20 | 15 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Chirimoya | 104 | activo/canónico | Grs | perUnit | 1 | 150 | 80 | 250 | 10 | 80 | 250 | porcionMax | 214.5 | 2.5 | 50 | 0.5 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Choclo entero | 105 | activo/canónico | Grs | perUnit | 1 | 200 | 80 | 350 | 10 | 80 | 350 | porcionMax | 211.75 | 8.75 | 24.5 | 8.75 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Chocolate aguila semiamargo | 106 | activo/canónico | Barra | perUnit | 1 | 1 | 1 | 4 | 1 | 1 | 4 | porcionMax | 412.4 | 5.2 | 52 | 20.4 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Chocolate blanco con dulce de leche (Milka) | 107 | activo/canónico | Grs | perUnit | 1 | 200 | 100 | 300 | 25 | 100 | 300 | porcionMax | 1433.4 | 21.6 | 168 | 75 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Chocolate cofler aireado (Leche) | 108 | activo/canónico | Cuad | perUnit | 1 | 1 | 1 | 4 | 1 | 1 | 4 | porcionMax | 100.8 | 1.4 | 9.4 | 6.4 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Chocolate crunch nestle | 109 | activo/canónico | Grs | perUnit | 1 | 30 | 10 | 100 | 5 | 10 | 100 | porcionMax | 544.4 | 7.2 | 56 | 32.4 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Chorizo | 111 | activo/canónico | Grs | perUnit | 1 | 10 | 5 | 30 | 5 | 5 | 30 | porcionMax | 96.6 | 3.9 | 0 | 9 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Chupetin pico dulce arcor | 112 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 168 | 0 | 42 | 0 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Churrasco magro | 113 | activo/canónico | Grs | perUnit | 1 | 150 | 80 | 250 | 10 | 80 | 250 | porcionMax | 361.25 | 53.75 | 0 | 20 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Ciruela | 114 | activo/canónico | Grs | perUnit | 1 | 150 | 80 | 250 | 10 | 80 | 250 | porcionMax | 112.5 | 1.5 | 25.5 | 0.5 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Claras de huevos | 115 | activo/canónico | Unid | perUnit | 1 | 3 | 1 | 8 | 1 | 1 | 8 | porcionMax | 125.6 | 28 | 1.6 | 0.8 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Coca cola | 116 | activo/canónico | Grs | perUnit | 1 | 250 | 100 | 500 | 50 | 100 | 500 | porcionMax | 220 | 0 | 55 | 0 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Coliflor | 117 | activo/canónico | Grs | perUnit | 1 | 150 | 50 | 300 | 10 | 50 | 300 | porcionMax | 68.7 | 6 | 10.5 | 0.3 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Copos de maiz azucarados | 118 | activo/canónico | Grs | perUnit | 1 | 15 | 5 | 40 | 5 | 5 | 40 | porcionMax | 152.8 | 2.48 | 35 | 0.32 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Copos de maiz granix | 119 | activo/canónico | Grs | perUnit | 1 | 70 | 30 | 120 | 5 | 30 | 120 | porcionMax | 434.88 | 8.04 | 99.6 | 0.48 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Copos de maiz sin azucar | 120 | activo/canónico | Grs | perUnit | 1 | 15 | 5 | 40 | 5 | 5 | 40 | porcionMax | 144.68 | 2.64 | 33.08 | 0.2 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Crackers Smams (Sin tac) | 121 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 69.84 | 0.06 | 12 | 2.4 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Cremon comun | 122 | activo/canónico | Grs | perUnit | 1 | 40 | 20 | 80 | 5 | 20 | 80 | porcionMax | 230.4 | 14.4 | 0 | 19.2 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Cremon doble crema | 123 | activo/canónico | Grs | perUnit | 1 | 40 | 20 | 80 | 5 | 20 | 80 | porcionMax | 282.4 | 11.2 | 0 | 26.4 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Cremon light | 125 | activo/canónico | Grs | perUnit | 1 | 40 | 20 | 80 | 5 | 20 | 80 | porcionMax | 193.76 | 16.8 | 1.04 | 13.6 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Criollitas | 126 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 49.5 | 1.2 | 7.8 | 1.5 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Criollitas grandes | 127 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 87.9 | 2.1 | 13.8 | 2.7 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Criollitas sin sal | 128 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 88.41 | 2.4 | 14.1 | 2.49 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Cuadrada (Ternera) | 129 | activo/canónico | Grs | perUnit | 1 | 150 | 80 | 250 | 10 | 80 | 250 | porcionMax | 327.5 | 53.75 | 0 | 12.5 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Cuadril | 131 | activo/canónico | Grs | perUnit | 1 | 150 | 80 | 250 | 10 | 80 | 250 | porcionMax | 361.25 | 53.75 | 0 | 16.25 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Damasco | 132 | activo/canónico | Grs | perUnit | 1 | 150 | 80 | 250 | 10 | 80 | 250 | porcionMax | 124 | 3.5 | 27.5 | 0 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Danette dulce de leche | 133 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 473.4 | 10.2 | 69 | 17.4 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Dextrosa | 134 | activo/canónico | Grs | perUnit | 1 | 15 | 5 | 40 | 5 | 5 | 40 | porcionMax | 144 | 0 | 36 | 0 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Dulce de batata | 135 | activo/canónico | Grs | perUnit | 1 | 200 | 80 | 350 | 10 | 80 | 350 | porcionMax | 910 | 0 | 227.5 | 0 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Dulce de leche | 136 | activo/canónico | Grs | perUnit | 1 | 200 | 100 | 300 | 25 | 100 | 300 | porcionMax | 952.5 | 22.5 | 165 | 22.5 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Dulce de leche (Armonia) | 137 | activo/canónico | Grs | perUnit | 1 | 200 | 100 | 300 | 25 | 100 | 300 | porcionMax | 904.5 | 7.5 | 195 | 10.5 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Dulce de leche (Coto) | 6619bfeb147cd50b646776ff | legacy | (vacía) | (ausente) | — | — | — | — | — | 1 | 12 | fallback.discrete.max12 | 0 | 0 | 0 | 0 | Sin máximo almacenado; fallback | Default arbitrario | Canonicalizar o excluir legacy |
| Dulce de leche (Coto) | 138 | inactivo/canónico | g | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 0 | 0 | 0 | 0 | Máximo duro explícito; sugerida separada | Revisar | Confirmar baja/inactividad |
| Dulce de leche (Ser) | 139 | activo/canónico | Grs | perUnit | 1 | 200 | 100 | 300 | 25 | 100 | 300 | porcionMax | 906 | 22.5 | 204 | 0 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Dulce de leche clasico (Ilolay) | 140 | activo/canónico | Grs | perUnit | 1 | 200 | 100 | 300 | 25 | 100 | 300 | porcionMax | 919.5 | 21 | 165 | 19.5 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Dulce de leche coto | 141 | activo/canónico | Grs | perUnit | 1 | 200 | 100 | 300 | 25 | 100 | 300 | porcionMax | 919.5 | 21 | 165 | 19.5 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Dulce de leche estilo colonial (La serenisima) | 142 | activo/canónico | Grs | perUnit | 1 | 200 | 100 | 300 | 25 | 100 | 300 | porcionMax | 952.5 | 22.5 | 165 | 22.5 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Dulce de leche la serenisima | 143 | activo/canónico | Grs | perUnit | 1 | 200 | 100 | 300 | 25 | 100 | 300 | porcionMax | 952.5 | 22.5 | 165 | 22.5 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Dulce de leche light | 144 | activo/canónico | Grs | perUnit | 1 | 200 | 100 | 300 | 25 | 100 | 300 | porcionMax | 859.5 | 16.5 | 195 | 1.5 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Dulce de leche repostero | 145 | activo/canónico | Grs | perUnit | 1 | 200 | 100 | 300 | 25 | 100 | 300 | porcionMax | 952.5 | 22.5 | 165 | 22.5 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Dulce de leche repostero (Ilolay) | 146 | activo/canónico | Grs | perUnit | 1 | 200 | 100 | 300 | 25 | 100 | 300 | porcionMax | 972 | 24 | 165 | 24 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Dulce de membrillo | 147 | activo/canónico | Grs | perUnit | 1 | 15 | 5 | 40 | 5 | 5 | 40 | porcionMax | 112.32 | 0 | 28.08 | 0 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Durazno | 148 | activo/canónico | Grs | perUnit | 1 | 150 | 80 | 250 | 10 | 80 | 250 | porcionMax | 98.75 | 2.25 | 20.75 | 0.75 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Durazno chico | 149 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 154.23 | 0.33 | 36 | 0.99 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Durazno grande | 150 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 205.68 | 0.45 | 48 | 1.32 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Durazno mediano | 151 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 179.82 | 0.39 | 42 | 1.14 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Empanada de carne el noble | 152 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 552 | 18 | 66 | 24 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Empanada de jamon y queso el noblre | 153 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 630 | 24 | 66 | 30 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Empanadas de carne : | 154 | inactivo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 0 | 0 | 0 | 0 | Máximo duro explícito; sugerida separada | Revisar | Confirmar baja/inactividad |
| Empanadas de jamon y queso : | 155 | inactivo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 0 | 0 | 0 | 0 | Máximo duro explícito; sugerida separada | Revisar | Confirmar baja/inactividad |
| Empanadas de pollo : | 156 | inactivo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 0 | 0 | 0 | 0 | Máximo duro explícito; sugerida separada | Revisar | Confirmar baja/inactividad |
| Empanadas: | 6619bfeb147cd50b64677712 | legacy | (vacía) | (ausente) | — | — | — | — | — | 1 | 12 | fallback.discrete.max12 | 0 | 0 | 0 | 0 | Sin máximo almacenado; fallback | Default arbitrario | Canonicalizar o excluir legacy |
| Empanadas: | 157 | inactivo/canónico | g | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 0 | 0 | 0 | 0 | Máximo duro explícito; sugerida separada | Revisar | Confirmar baja/inactividad |
| Ensalada: | 6619bfeb147cd50b64677713 | legacy | (vacía) | (ausente) | — | — | — | — | — | 1 | 12 | fallback.discrete.max12 | 0 | 0 | 0 | 0 | Sin máximo almacenado; fallback | Default arbitrario | Canonicalizar o excluir legacy |
| Ensalada: | 158 | inactivo/canónico | g | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 0 | 0 | 0 | 0 | Máximo duro explícito; sugerida separada | Revisar | Confirmar baja/inactividad |
| Esparragos | 159 | activo/canónico | Grs | perUnit | 1 | 150 | 50 | 300 | 10 | 50 | 300 | porcionMax | 65.1 | 6.6 | 9 | 0.3 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| espinaca | 160 | activo/canónico | Grs | perUnit | 1 | 150 | 50 | 300 | 10 | 50 | 300 | porcionMax | 69.6 | 8.7 | 6 | 1.2 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Ferrero rocher | 161 | activo/canónico | Grs | perUnit | 1 | 30 | 10 | 100 | 5 | 10 | 100 | porcionMax | 7465 | 100 | 567 | 533 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Fideos | 162 | activo/canónico | Grs | perUnit | 1 | 70 | 30 | 120 | 5 | 30 | 120 | porcionMax | 405.84 | 13.56 | 85.2 | 1.2 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Fideos (Cocidos) | 163 | activo/canónico | Grs | perUnit | 1 | 200 | 80 | 350 | 10 | 80 | 350 | porcionMax | 550.55 | 20.3 | 110.25 | 3.15 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Fideos sin gluten | 164 | activo/canónico | Grs | perUnit | 1 | 70 | 30 | 120 | 5 | 30 | 120 | porcionMax | 441.9 | 6.75 | 99 | 2.1 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Filet de merluza | 165 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 3.87 | 0.63 | 0 | 0.15 | Máximo duro explícito; sugerida separada | Probable error de datos | Revisión de producto prioritaria |
| Flan con caramelo Danette | 166 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 406.2 | 9.6 | 69 | 10.2 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Flan Sancorito | 167 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 392.7 | 9.3 | 72 | 7.5 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Flan Serenito | 168 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 412.8 | 9.6 | 72 | 9.6 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Frambuesa | 169 | activo/canónico | Grs | perUnit | 1 | 150 | 80 | 250 | 10 | 80 | 250 | porcionMax | 127.75 | 3 | 25 | 1.75 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Frijoles | 170 | activo/canónico | Grs | perUnit | 1 | 70 | 30 | 150 | 5 | 30 | 150 | porcionMax | 48 | 1.5 | 10.5 | 0 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Froot loops | 171 | activo/canónico | Grs | perUnit | 1 | 70 | 30 | 150 | 5 | 30 | 150 | porcionMax | 565.14 | 7.92 | 120 | 5.94 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Frutigran granix | 172 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 195.75 | 3.45 | 30.3 | 6.75 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Frutillas | 173 | activo/canónico | Grs | perUnit | 1 | 150 | 80 | 250 | 10 | 80 | 250 | porcionMax | 81.5 | 1.75 | 17.5 | 0.5 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Galletas de arroz | 174 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 115.35 | 2.61 | 24 | 0.99 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Galletas de arroz carrefour | 175 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 114.588 | 2.574 | 23.4 | 1.188 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Galletas marineras carrefour | 176 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 98.25 | 2.475 | 15 | 3.15 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Galletitas bagley con maiz | 177 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 69.666 | 1.479 | 10.2 | 2.55 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Galletitas cerro azul sabor limon | 178 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 62.34 | 0.54 | 11.4 | 1.62 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Galletitas de agua | 179 | activo/canónico | Grs | perUnit | 1 | 30 | 10 | 100 | 5 | 10 | 100 | porcionMax | 441 | 11 | 70 | 13 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Galletitas de agua arcor | 180 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 75.3 | 1.95 | 12.15 | 2.1 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Galletitas de agua carrefour | 181 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 61.005 | 1.494 | 10.956 | 1.245 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Galletitas de agua clasicas | 182 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 66.533 | 1.693 | 10.458 | 1.992 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Galletitas de agua mediatarde | 183 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 49.8 | 1.237 | 7.5 | 1.65 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Galletitas de agua sandwich | 184 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 87.9 | 2.1 | 13.8 | 2.7 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Galletitas de agua terrabusi | 185 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 78.54 | 2.04 | 12.6 | 2.22 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Galletitas de agua terrabusi light | 186 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 77.22 | 1.92 | 13.2 | 1.86 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Galletitas de agua traviata | 187 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 81.9 | 2.4 | 12 | 2.7 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Galletitas de avena carrefour | 188 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 175.527 | 2.772 | 25.74 | 6.831 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Galletitas de coco sin gluten Santa Maria | 189 | activo/canónico | Grs | perUnit | 1 | 30 | 10 | 100 | 5 | 10 | 100 | porcionMax | 459.8 | 3.7 | 73 | 17 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Galletitas de salvado (Bagley) | 6619bfeb147cd50b64677733 | legacy | Unid | (ausente) | 1 | — | — | — | — | 1 | 12 | fallback.discrete.max12 | 225.482 | 6.178 | 30.888 | 8.58 | Sin máximo almacenado; fallback | Default arbitrario | Canonicalizar o excluir legacy |
| Galletitas de salvado (Bagley) | 191 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 57.309 | 1.35 | 7.8 | 2.301 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| galletitas de salvado granix | 192 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 88.125 | 2.7 | 12.75 | 2.925 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Galletitas de salvado granix sin sal | 193 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 85.725 | 2.625 | 12.9 | 2.625 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Galletitas dulces Aglu sin gluten | 194 | activo/canónico | Grs | perUnit | 1 | 30 | 10 | 100 | 5 | 10 | 100 | porcionMax | 388.62 | 5.94 | 63 | 12.54 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Galletitas granix sin sal | 195 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 80.925 | 2.625 | 11.7 | 2.625 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Galletitas marmoladas sin gluten Santa Maria | 196 | activo/canónico | Grs | perUnit | 1 | 30 | 10 | 100 | 5 | 10 | 100 | porcionMax | 450.8 | 3.7 | 73 | 16 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Galletitas mini oreo | 197 | activo/canónico | Grs | perUnit | 1 | 30 | 10 | 100 | 5 | 10 | 100 | porcionMax | 486 | 6 | 66 | 22 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Galletitas salvado bagley | 198 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 69.7 | 1.75 | 10.5 | 2.3 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Gambas | 199 | activo/canónico | Grs | perUnit | 1 | 150 | 80 | 250 | 10 | 80 | 250 | porcionMax | 182.5 | 37.5 | 2.5 | 2.5 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Garbanzos secos | 201 | activo/canónico | Grs | perUnit | 1 | 70 | 30 | 120 | 5 | 30 | 120 | porcionMax | 400.8 | 18 | 66 | 7.2 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Garbanzos secos remojados | 203 | activo/canónico | Grs | perUnit | 1 | 200 | 80 | 350 | 10 | 80 | 350 | porcionMax | 395.15 | 22.75 | 59.5 | 7.35 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Germen de trigo | 204 | activo/canónico | Grs | perUnit | 1 | 70 | 30 | 150 | 5 | 30 | 150 | porcionMax | 538.95 | 34.5 | 67.5 | 14.55 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Gomitas mogul | 205 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 21.84 | 0.21 | 5.25 | 0 | Máximo duro explícito; sugerida separada | Probable error de datos | Revisión de producto prioritaria |
| Gomitas moras mogul | 206 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 60.9 | 0.825 | 14.4 | 0 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Granada | 207 | activo/canónico | Grs | perUnit | 1 | 150 | 80 | 250 | 10 | 80 | 250 | porcionMax | 156.75 | 2.5 | 35 | 0.75 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Granola | 208 | activo/canónico | Grs | perUnit | 1 | 70 | 30 | 120 | 5 | 30 | 120 | porcionMax | 465.3 | 8.1 | 90 | 8.1 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Guacamole | 211 | activo/canónico | Grs | perUnit | 1 | 10 | 5 | 30 | 5 | 5 | 30 | porcionMax | 51 | 0.6 | 2.7 | 4.2 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Habanitos terrabusi | 212 | activo/canónico | Grs | perUnit | 1 | 30 | 10 | 100 | 5 | 10 | 100 | porcionMax | 461.3 | 7.7 | 63.3 | 19.7 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Hamburguesa Clasica (Paty) | 213 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 585 | 45 | 0 | 45 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Hamburguesa de soja (Vegetalex) | 214 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 311.7 | 33 | 13.2 | 14.1 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Hamburguesa de soja vegetalex | 215 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 306.9 | 33 | 12 | 14.1 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Hamburguesas (Swift) | 216 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 417 | 30 | 0 | 33 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Hamburguesas finitas (Paty) | 217 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 367.2 | 27 | 0 | 28.8 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Hamburguesas light (Swift) | 218 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 438 | 39 | 3 | 30 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Harina de maiz | 219 | activo/canónico | Grs | perUnit | 1 | 70 | 30 | 120 | 5 | 30 | 120 | porcionMax | 441.84 | 9.96 | 92.4 | 3.6 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Harina integral | 220 | activo/canónico | Grs | perUnit | 1 | 70 | 30 | 120 | 5 | 30 | 120 | porcionMax | 355.2 | 12 | 76.8 | 0 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Harina refinada | 221 | activo/canónico | Grs | perUnit | 1 | 70 | 30 | 120 | 5 | 30 | 120 | porcionMax | 396.48 | 10.8 | 84 | 1.92 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Higado | 222 | activo/canónico | Grs | perUnit | 1 | 150 | 80 | 250 | 10 | 80 | 250 | porcionMax | 335 | 51.5 | 9.75 | 10 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Higo | 223 | activo/canónico | Grs | perUnit | 1 | 150 | 80 | 250 | 10 | 80 | 250 | porcionMax | 182 | 3 | 42.5 | 0 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Huevos | 224 | activo/canónico | Unid | perUnit | 1 | 2 | 1 | 4 | 1 | 1 | 4 | porcionMax | 276 | 24 | 0 | 20 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Jalea de membrillo la campagnola | 225 | activo/canónico | Grs | perUnit | 1 | 15 | 5 | 40 | 5 | 5 | 40 | porcionMax | 68 | 0 | 17 | 0 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Jamon cagnoli | 226 | activo/canónico | Fetas | perUnit | 1 | 2 | 1 | 6 | 1 | 1 | 6 | porcionMax | 141 | 20.4 | 0 | 6.6 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Jamon cocido | 228 | activo/canónico | Grs | perUnit | 1 | 150 | 80 | 250 | 10 | 80 | 250 | porcionMax | 259.25 | 45 | 1.25 | 8.25 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Jamon cocido cagnoli | 229 | activo/canónico | Fetas | perUnit | 1 | 2 | 1 | 6 | 1 | 1 | 6 | porcionMax | 138.3 | 20.4 | 0 | 6.3 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Jamon cocido feteado | 230 | activo/canónico | Fetas | perUnit | 1 | 2 | 1 | 6 | 1 | 1 | 6 | porcionMax | 109.2 | 19.2 | 0 | 3.6 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Jamon cocido lario | 231 | activo/canónico | Fetas | perUnit | 1 | 2 | 1 | 6 | 1 | 1 | 6 | porcionMax | 119.7 | 19.8 | 0 | 4.5 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Jamon cocido paladini | 232 | activo/canónico | Fetas | perUnit | 1 | 2 | 1 | 6 | 1 | 1 | 6 | porcionMax | 201.9 | 33.6 | 0 | 7.5 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Jamon crudo | 233 | activo/canónico | Gramos | perUnit | 1 | 150 | 80 | 250 | 10 | 80 | 250 | porcionMax | 532.5 | 58.75 | 6.875 | 30 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Jamon serrano | 235 | activo/canónico | Grs | perUnit | 1 | 150 | 80 | 250 | 10 | 80 | 250 | porcionMax | 631.5 | 72.5 | 1 | 37.5 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Jamon tapalque | 236 | activo/canónico | Grs | perUnit | 1 | 50 | 20 | 100 | 5 | 20 | 100 | porcionMax | 82.5 | 15 | 0 | 2.5 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Jardinera con choclo | 237 | activo/canónico | Gramos | perUnit | 1 | 200 | 80 | 350 | 10 | 80 | 350 | porcionMax | 197.4 | 13.3 | 29.75 | 2.8 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Ketchup | 238 | activo/canónico | Gramos | perUnit | 1 | 30 | 10 | 100 | 5 | 10 | 100 | porcionMax | 123.2 | 0 | 30.8 | 0 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Kiwi | 239 | activo/canónico | Grs | perUnit | 1 | 150 | 80 | 250 | 10 | 80 | 250 | porcionMax | 153.25 | 2.5 | 33 | 1.25 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Kiwi (mediano) | 240 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 127.2 | 2.37 | 27 | 1.08 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Langostinos | 241 | activo/canónico | Grs | perUnit | 1 | 150 | 80 | 250 | 10 | 80 | 250 | porcionMax | 169.25 | 35 | 0 | 3.25 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Leche chocolatada Cindor | 242 | activo/canónico | Grs | perUnit | 1 | 250 | 100 | 500 | 50 | 100 | 500 | porcionMax | 343 | 15 | 55 | 7 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Leche chocolatada Milkaut | 243 | activo/canónico | Grs | perUnit | 1 | 250 | 100 | 500 | 50 | 100 | 500 | porcionMax | 371.5 | 16.5 | 55 | 9.5 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Leche de almendras | 244 | activo/canónico | Grs | perUnit | 1 | 200 | 100 | 300 | 25 | 100 | 300 | porcionMax | 71.25 | 1.2 | 10.2 | 2.85 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Leche de almendras sin azucar | 245 | activo/canónico | Grs | perUnit | 1 | 200 | 100 | 300 | 25 | 100 | 300 | porcionMax | 32.7 | 1.05 | 1.05 | 2.7 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Leche de coco | 246 | activo/canónico | Grs | perUnit | 1 | 200 | 100 | 300 | 25 | 100 | 300 | porcionMax | 495 | 1.5 | 7.5 | 51 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Leche descremada | 247 | activo/canónico | Grs | perUnit | 1 | 200 | 100 | 300 | 25 | 100 | 300 | porcionMax | 117.3 | 9 | 15.6 | 2.1 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Leche descremada (Apostoles) | 248 | activo/canónico | Grs | perUnit | 1 | 200 | 100 | 300 | 25 | 100 | 300 | porcionMax | 109.8 | 9 | 14.4 | 1.8 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Leche descremada alta en proteínas | 249 | activo/canónico | Gramos | perUnit | 1 | 200 | 100 | 300 | 25 | 100 | 300 | porcionMax | 110.4 | 13.8 | 13.8 | 0 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Leche descremada Apostoles | 250 | activo/canónico | Grs | perUnit | 1 | 200 | 100 | 300 | 25 | 100 | 300 | porcionMax | 109.8 | 9 | 14.4 | 1.8 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Leche descremada en polvo | 251 | activo/canónico | Grs | perUnit | 1 | 200 | 100 | 300 | 25 | 100 | 300 | porcionMax | 1044 | 105 | 156 | 0 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Leche descremada la serenisima | 252 | activo/canónico | Grs | perUnit | 1 | 200 | 100 | 300 | 25 | 100 | 300 | porcionMax | 56.1 | 4.5 | 7.5 | 0.9 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Leche descremada sin lactosa | 253 | activo/canónico | Grs | perUnit | 1 | 200 | 100 | 300 | 25 | 100 | 300 | porcionMax | 120.6 | 9 | 14.4 | 3 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Leche descremada tregar | 254 | activo/canónico | Grs | perUnit | 1 | 200 | 100 | 300 | 25 | 100 | 300 | porcionMax | 136.5 | 9 | 15 | 4.5 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Leche deslactosada descremada (La serenisima) | 255 | activo/canónico | Grs | perUnit | 1 | 200 | 100 | 300 | 25 | 100 | 300 | porcionMax | 137.7 | 10.2 | 14.1 | 4.5 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Leche en polvo entera | 256 | activo/canónico | Grs | perUnit | 1 | 200 | 100 | 300 | 25 | 100 | 300 | porcionMax | 1524 | 74.4 | 117.6 | 84 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Leche en polvo zero lactosa | 257 | activo/canónico | Grs | perUnit | 1 | 200 | 100 | 300 | 25 | 100 | 300 | porcionMax | 1492.26 | 73.92 | 122.43 | 78.54 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Leche entera | 258 | activo/canónico | Grs | perUnit | 1 | 200 | 100 | 300 | 25 | 100 | 300 | porcionMax | 181.5 | 9 | 19.5 | 7.5 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Leche entera carrefour | 259 | activo/canónico | Grs | perUnit | 1 | 200 | 100 | 300 | 25 | 100 | 300 | porcionMax | 171 | 9 | 13.5 | 9 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Leche entera Ilolay | 260 | activo/canónico | Grs | perUnit | 1 | 200 | 100 | 300 | 25 | 100 | 300 | porcionMax | 175.8 | 9.3 | 14.4 | 9 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Leche entera tregar | 261 | activo/canónico | Grs | perUnit | 1 | 200 | 100 | 300 | 25 | 100 | 300 | porcionMax | 168 | 10.5 | 18 | 6 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Leche parcialmente descremada (Veronica) | 262 | activo/canónico | Grs | perUnit | 1 | 200 | 100 | 300 | 25 | 100 | 300 | porcionMax | 134.1 | 9 | 14.4 | 4.5 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| lechuga | 263 | activo/canónico | Grs | perUnit | 1 | 150 | 50 | 300 | 10 | 50 | 300 | porcionMax | 46.2 | 3.3 | 4.2 | 1.8 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Lentejas en remojo | 264 | activo/canónico | Grs | perUnit | 1 | 200 | 80 | 350 | 10 | 80 | 350 | porcionMax | 351.4 | 22.05 | 59.5 | 2.8 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Lentejas secas | 267 | activo/canónico | Grs | perUnit | 1 | 70 | 30 | 120 | 5 | 30 | 120 | porcionMax | 364.8 | 26.4 | 64.8 | 0 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Lentejas secas (Elio) | 268 | activo/canónico | Grs | perUnit | 1 | 70 | 30 | 120 | 5 | 30 | 120 | porcionMax | 303.84 | 21.96 | 54 | 0 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Lomitos de atun al natural (Coto) | 6619bfeb147cd50b64677782 | legacy | (vacía) | (ausente) | — | — | — | — | — | 1 | 12 | fallback.discrete.max12 | 0 | 0 | 0 | 0 | Sin máximo almacenado; fallback | Default arbitrario | Canonicalizar o excluir legacy |
| Lomitos de atun al natural (Coto) | 269 | inactivo/canónico | g | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 0 | 0 | 0 | 0 | Máximo duro explícito; sugerida separada | Revisar | Confirmar baja/inactividad |
| Lomo de cerdo magro | 270 | activo/canónico | Grs | perUnit | 1 | 150 | 80 | 250 | 10 | 80 | 250 | porcionMax | 300 | 52.5 | 0 | 10 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Lomo embuchado | 271 | activo/canónico | Grs | perUnit | 1 | 150 | 80 | 250 | 10 | 80 | 250 | porcionMax | 497.5 | 95 | 1.25 | 12.5 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Lubina | 272 | activo/canónico | Grs | perUnit | 1 | 150 | 80 | 250 | 10 | 80 | 250 | porcionMax | 209.25 | 45 | 0 | 3.25 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Maiz | 273 | activo/canónico | Grs | perUnit | 1 | 70 | 30 | 120 | 5 | 30 | 120 | porcionMax | 382.68 | 11.52 | 72 | 5.4 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Maiz inflado | 275 | activo/canónico | Grs | perUnit | 1 | 70 | 30 | 120 | 5 | 30 | 120 | porcionMax | 445.2 | 7.2 | 96 | 3.6 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Mandarina | 276 | activo/canónico | Grs | perUnit | 1 | 150 | 80 | 250 | 10 | 80 | 250 | porcionMax | 132.75 | 2 | 29.5 | 0.75 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Mandarina chica | 277 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 121.53 | 1.83 | 27 | 0.69 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Mandarina grande | 278 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 189.63 | 2.91 | 42 | 1.11 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Mandarina mediana | 279 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 140.01 | 2.13 | 31.05 | 0.81 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Mango | 281 | activo/canónico | Grs | perUnit | 1 | 150 | 80 | 250 | 10 | 80 | 250 | porcionMax | 150 | 0 | 37.5 | 0 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Mani | 282 | activo/canónico | Grs | perUnit | 1 | 10 | 5 | 30 | 5 | 5 | 30 | porcionMax | 179.04 | 8.4 | 1.26 | 15.6 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Manteca | 284 | activo/canónico | Grs | perUnit | 1 | 10 | 5 | 30 | 5 | 5 | 30 | porcionMax | 222.6 | 0.3 | 0 | 24.6 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Mantecol | 285 | activo/canónico | Grs | perUnit | 1 | 30 | 10 | 100 | 5 | 10 | 100 | porcionMax | 531.5 | 14.5 | 47.5 | 31.5 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Mantequilla de mani | 286 | activo/canónico | Grs | perUnit | 1 | 10 | 5 | 30 | 5 | 5 | 30 | porcionMax | 177 | 7.5 | 3 | 15 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Manzana | 287 | activo/canónico | Grs | perUnit | 1 | 150 | 80 | 250 | 10 | 80 | 250 | porcionMax | 131.25 | 1.25 | 28.75 | 1.25 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Manzana chica | 288 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 232.23 | 1.17 | 55.2 | 0.75 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Manzana grande | 289 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 353.22 | 1.74 | 84 | 1.14 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Manzana mediana | 290 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 285.21 | 1.41 | 67.8 | 0.93 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Mariscos | 291 | activo/canónico | Grs | perUnit | 1 | 150 | 80 | 250 | 10 | 80 | 250 | porcionMax | 307.5 | 30 | 7.5 | 17.5 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Masa prepizza | 292 | activo/canónico | Grs | perUnit | 1 | 70 | 30 | 150 | 5 | 30 | 150 | porcionMax | 412.785 | 14.415 | 86.25 | 1.125 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Maxialfajor jorgelin | 293 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 1004.4 | 14.1 | 142.5 | 42 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Medallon de merluza | 294 | activo/canónico | Grs | perUnit | 1 | 150 | 80 | 250 | 10 | 80 | 250 | porcionMax | 487.5 | 25 | 57.5 | 17.5 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Medallon de pollo (Granja del sol) | 295 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 661.5 | 31.5 | 63 | 31.5 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Medallon de pollo (Granja tres arroyos) | 296 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 556.8 | 25.2 | 33 | 36 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Medallones de merluza | 297 | activo/canónico | Grs | perUnit | 1 | 150 | 80 | 250 | 10 | 80 | 250 | porcionMax | 201.75 | 39.5 | 2.5 | 3.75 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Medallones de pollo | 298 | activo/canónico | Grs | perUnit | 1 | 150 | 80 | 250 | 10 | 80 | 250 | porcionMax | 252 | 43 | 8.75 | 5 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Melon | 299 | activo/canónico | Grs | perUnit | 1 | 150 | 80 | 250 | 10 | 80 | 250 | porcionMax | 88 | 2 | 20 | 0 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Mendicrim | 300 | activo/canónico | Grs | perUnit | 1 | 40 | 20 | 80 | 5 | 20 | 80 | porcionMax | 173.76 | 4 | 3.44 | 16 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Mendicrim light | 301 | activo/canónico | Grs | perUnit | 1 | 40 | 20 | 80 | 5 | 20 | 80 | porcionMax | 107.2 | 6.4 | 6 | 6.4 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Merluza | 304 | activo/canónico | Grs | perUnit | 1 | 150 | 80 | 250 | 10 | 80 | 250 | porcionMax | 311.25 | 52.5 | 0 | 11.25 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Mermelada | 305 | activo/canónico | Grs | perUnit | 1 | 15 | 5 | 40 | 5 | 5 | 40 | porcionMax | 112 | 0 | 28 | 0 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Mermelada arcor | 306 | activo/canónico | Grs | perUnit | 1 | 15 | 5 | 40 | 5 | 5 | 40 | porcionMax | 102.08 | 0 | 25.52 | 0 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Mermelada arcor light | 307 | activo/canónico | Grs | perUnit | 1 | 15 | 5 | 40 | 5 | 5 | 40 | porcionMax | 53.88 | 0 | 13.2 | 0.12 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Mermelada carrefour light | 308 | activo/canónico | Grs | perUnit | 1 | 15 | 5 | 40 | 5 | 5 | 40 | porcionMax | 56 | 0 | 14 | 0 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Mermelada de arandano BC la campagnola | 309 | activo/canónico | Grs | perUnit | 1 | 15 | 5 | 40 | 5 | 5 | 40 | porcionMax | 62.4 | 0 | 15.6 | 0 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Mermelada de ciruela light arcor | 310 | activo/canónico | Grs | perUnit | 1 | 15 | 5 | 40 | 5 | 5 | 40 | porcionMax | 56 | 0 | 14 | 0 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Mermelada de ciruela light carrefour | 311 | activo/canónico | Grs | perUnit | 1 | 15 | 5 | 40 | 5 | 5 | 40 | porcionMax | 57.6 | 0 | 14.4 | 0 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Mermelada de durazno orieta | 312 | activo/canónico | Grs | perUnit | 1 | 15 | 5 | 40 | 5 | 5 | 40 | porcionMax | 104 | 0 | 26 | 0 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Mermelada de frutilla arcor | 313 | activo/canónico | Grs | perUnit | 1 | 15 | 5 | 40 | 5 | 5 | 40 | porcionMax | 104 | 0 | 26 | 0 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Mermelada de frutilla bc la campagnola | 314 | activo/canónico | Grs | perUnit | 1 | 15 | 5 | 40 | 5 | 5 | 40 | porcionMax | 58.4 | 0 | 14.6 | 0 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Mermelada de frutilla light arcor | 315 | activo/canónico | Grs | perUnit | 1 | 15 | 5 | 40 | 5 | 5 | 40 | porcionMax | 56 | 0 | 14 | 0 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Mermelada de frutos rojos BC la campagnola | 316 | activo/canónico | Grs | perUnit | 1 | 15 | 5 | 40 | 5 | 5 | 40 | porcionMax | 52.8 | 0 | 13.2 | 0 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Mermelada de naranja BC la campagnola | 317 | activo/canónico | Grs | perUnit | 1 | 15 | 5 | 40 | 5 | 5 | 40 | porcionMax | 58.4 | 0 | 14.6 | 0 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Mermelada de naranja la campagnola | 318 | activo/canónico | Grs | perUnit | 1 | 15 | 5 | 40 | 5 | 5 | 40 | porcionMax | 58.4 | 0 | 14.6 | 0 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Mermelada de naranja light arcor | 319 | activo/canónico | Grs | perUnit | 1 | 15 | 5 | 40 | 5 | 5 | 40 | porcionMax | 56 | 0 | 14 | 0 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Mermelada light | 321 | activo/canónico | Grs | perUnit | 1 | 15 | 5 | 40 | 5 | 5 | 40 | porcionMax | 54.4 | 0 | 13.6 | 0 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Mermelada light Emeth de ciruela | 322 | activo/canónico | Grs | perUnit | 1 | 15 | 5 | 40 | 5 | 5 | 40 | porcionMax | 43.2 | 0 | 10.8 | 0 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Miel | 323 | activo/canónico | Grs | perUnit | 1 | 15 | 5 | 40 | 5 | 5 | 40 | porcionMax | 128.8 | 0.2 | 32 | 0 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Miel cruda | 324 | activo/canónico | Grs | perUnit | 1 | 15 | 5 | 40 | 5 | 5 | 40 | porcionMax | 128.8 | 0.2 | 32 | 0 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Miel liquida aleluya | 325 | activo/canónico | Grs | perUnit | 1 | 15 | 5 | 40 | 5 | 5 | 40 | porcionMax | 128 | 0 | 32 | 0 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Miel liquira carrefour | 326 | activo/canónico | Grs | perUnit | 1 | 15 | 5 | 40 | 5 | 5 | 40 | porcionMax | 120 | 1.2 | 28.8 | 0 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Miel untable aleluya | 327 | activo/canónico | Grs | perUnit | 1 | 15 | 5 | 40 | 5 | 5 | 40 | porcionMax | 131.2 | 0 | 32.8 | 0 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Milanesa de pollo: | 6619bfeb147cd50b646777bd | legacy | (vacía) | (ausente) | — | — | — | — | — | 1 | 12 | fallback.discrete.max12 | 0 | 0 | 0 | 0 | Sin máximo almacenado; fallback | Default arbitrario | Canonicalizar o excluir legacy |
| Milanesa de pollo: | 328 | inactivo/canónico | g | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 0 | 0 | 0 | 0 | Máximo duro explícito; sugerida separada | Revisar | Confirmar baja/inactividad |
| Milanesa de soja (Vegetalex) | 329 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 555 | 28.2 | 93 | 7.8 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Milanesa de soja: | 6619bfeb147cd50b646777bf | legacy | (vacía) | (ausente) | — | — | — | — | — | 1 | 12 | fallback.discrete.max12 | 0 | 0 | 0 | 0 | Sin máximo almacenado; fallback | Default arbitrario | Canonicalizar o excluir legacy |
| Milanesa de soja: | 330 | inactivo/canónico | g | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 0 | 0 | 0 | 0 | Máximo duro explícito; sugerida separada | Revisar | Confirmar baja/inactividad |
| Milanesa de ternera: | 6619bfeb147cd50b646777c0 | legacy | (vacía) | (ausente) | — | — | — | — | — | 1 | 12 | fallback.discrete.max12 | 0 | 0 | 0 | 0 | Sin máximo almacenado; fallback | Default arbitrario | Canonicalizar o excluir legacy |
| Milanesa de ternera: | 331 | inactivo/canónico | g | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 0 | 0 | 0 | 0 | Máximo duro explícito; sugerida separada | Revisar | Confirmar baja/inactividad |
| Milka (Te Quiero) | 332 | activo/canónico | Cuad | perUnit | 1 | 1 | 1 | 4 | 1 | 1 | 4 | porcionMax | 81.836 | 1.028 | 9.144 | 4.572 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Minitostaditas cuatro quesos twistos | 333 | activo/canónico | Grs | perUnit | 1 | 40 | 20 | 80 | 5 | 20 | 80 | porcionMax | 364.16 | 9.6 | 51.2 | 13.44 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Minitostaditas jamon twistos | 334 | activo/canónico | Grs | perUnit | 1 | 30 | 10 | 100 | 5 | 10 | 100 | porcionMax | 330 | 4.8 | 37.2 | 18 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Morcilla | 335 | activo/canónico | Grs | perUnit | 1 | 10 | 5 | 30 | 5 | 5 | 30 | porcionMax | 112.56 | 4.2 | 0.45 | 10.44 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Mortadela | 336 | activo/canónico | Grs | perUnit | 1 | 10 | 5 | 30 | 5 | 5 | 30 | porcionMax | 78.9 | 4.2 | 2.7 | 5.7 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Mortadela (Cagnoli) | 337 | activo/canónico | Fetas | perUnit | 1 | 2 | 1 | 6 | 1 | 1 | 6 | porcionMax | 200.178 | 9.702 | 3.366 | 16.434 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Mortadela (Paladini) | 338 | activo/canónico | Grs | perUnit | 1 | 50 | 20 | 100 | 5 | 20 | 100 | porcionMax | 263 | 14 | 9 | 19 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Mortadela Piccola (Calchaqui) | 339 | activo/canónico | Fetas | perUnit | 1 | 2 | 1 | 6 | 1 | 1 | 6 | porcionMax | 105 | 6 | 0 | 9 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Mozzarella | 340 | activo/canónico | Grs | perUnit | 1 | 10 | 5 | 30 | 5 | 5 | 30 | porcionMax | 101.25 | 8.1 | 0 | 7.65 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Nachos tradicionales sin gluten | 341 | activo/canónico | Grs | perUnit | 1 | 50 | 10 | 200 | 5 | 10 | 200 | porcionMax | 3552 | 48 | 480 | 160 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Naranja | 342 | activo/canónico | Grs | perUnit | 1 | 150 | 80 | 250 | 10 | 80 | 250 | porcionMax | 118.25 | 2.25 | 26.75 | 0.25 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Naranja chica | 343 | inactivo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 0 | 0 | 0 | 0 | Máximo duro explícito; sugerida separada | Revisar | Confirmar baja/inactividad |
| Naranja grande | 344 | inactivo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 0 | 0 | 0 | 0 | Máximo duro explícito; sugerida separada | Revisar | Confirmar baja/inactividad |
| Naranja mediana | 345 | inactivo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 0 | 0 | 0 | 0 | Máximo duro explícito; sugerida separada | Revisar | Confirmar baja/inactividad |
| Natural Break | 346 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 572.4 | 18.6 | 30 | 42 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Nescafé Dolca Caffe Latte | 347 | activo/canónico | Grs | perUnit | 1 | 250 | 100 | 500 | 50 | 100 | 500 | porcionMax | 2224 | 72 | 340 | 64 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Nueces peladas | 349 | activo/canónico | Grs | perUnit | 1 | 10 | 5 | 30 | 5 | 5 | 30 | porcionMax | 197.04 | 4.5 | 0.75 | 19.56 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Nugaton de chocolate | 350 | activo/canónico | Grs | perUnit | 1 | 30 | 10 | 100 | 5 | 10 | 100 | porcionMax | 14220 | 210 | 1500 | 820 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Nuggets de pollo fritas (Granja del sol) | 351 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 187.248 | 9.462 | 10.458 | 11.952 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Nutella | 352 | activo/canónico | Grs | perUnit | 1 | 50 | 10 | 200 | 5 | 10 | 200 | porcionMax | 1068.4 | 12.6 | 115 | 62 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Ñoquis con papa | 353 | activo/canónico | Grs | perUnit | 1 | 200 | 80 | 350 | 10 | 80 | 350 | porcionMax | 764.75 | 20.65 | 154 | 7.35 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Ñoquis con papa carrefour | 354 | activo/canónico | Grs | perUnit | 1 | 200 | 80 | 350 | 10 | 80 | 350 | porcionMax | 764.75 | 20.65 | 154 | 7.35 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| ñoquis de papa | 355 | activo/canónico | Grs | perUnit | 1 | 200 | 80 | 350 | 10 | 80 | 350 | porcionMax | 764.75 | 20.65 | 154 | 7.35 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Omelette: | 6619bfeb147cd50b646777d9 | legacy | (vacía) | (ausente) | — | — | — | — | — | 1 | 12 | fallback.discrete.max12 | 0 | 0 | 0 | 0 | Sin máximo almacenado; fallback | Default arbitrario | Canonicalizar o excluir legacy |
| Omelette: | 356 | inactivo/canónico | g | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 0 | 0 | 0 | 0 | Máximo duro explícito; sugerida separada | Revisar | Confirmar baja/inactividad |
| Operas paquete chico | 357 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 869.7 | 8.7 | 114.9 | 41.7 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Paleta de ternera | 358 | activo/canónico | Grs | perUnit | 1 | 150 | 80 | 250 | 10 | 80 | 250 | porcionMax | 338.75 | 53.75 | 0 | 13.75 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Palitos salados | 359 | activo/canónico | Grs | perUnit | 1 | 30 | 10 | 100 | 5 | 10 | 100 | porcionMax | 486.8 | 7.2 | 56 | 26 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Palomita (Carne magra) | 360 | activo/canónico | Grs | perUnit | 1 | 150 | 80 | 250 | 10 | 80 | 250 | porcionMax | 293.75 | 53.75 | 0 | 8.75 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Palta | 361 | activo/canónico | Grs | perUnit | 1 | 10 | 5 | 30 | 5 | 5 | 30 | porcionMax | 47.94 | 0.6 | 1.26 | 4.5 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Pan | 362 | activo/canónico | Grs | perUnit | 1 | 70 | 30 | 150 | 5 | 30 | 150 | porcionMax | 396.15 | 11.4 | 76.5 | 4.95 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Pan artesano bimbo | 363 | activo/canónico | Reb | perUnit | 1 | 2 | 1 | 4 | 1 | 1 | 4 | porcionMax | 344.446 | 13.32 | 64.4 | 3.73 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Pan baguette | 364 | activo/canónico | Grs | perUnit | 1 | 70 | 30 | 150 | 5 | 30 | 150 | porcionMax | 411.3 | 13.2 | 79.5 | 4.5 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Pan blanco | 365 | activo/canónico | Grs | perUnit | 1 | 70 | 30 | 150 | 5 | 30 | 150 | porcionMax | 396.15 | 11.4 | 76.5 | 4.95 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Pan con salvado carrefour | 366 | activo/canónico | Reb | perUnit | 1 | 2 | 1 | 4 | 1 | 1 | 4 | porcionMax | 276.4 | 10 | 52.8 | 2.8 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Pan con salvado fargo plus | 367 | activo/canónico | Reb | perUnit | 1 | 2 | 1 | 4 | 1 | 1 | 4 | porcionMax | 236.8 | 10.2 | 40 | 4 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Pan con salvado Noly | 368 | activo/canónico | Reb | perUnit | 1 | 2 | 1 | 4 | 1 | 1 | 4 | porcionMax | 228.4 | 7.6 | 45 | 2 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Pan de centeno | 369 | activo/canónico | Grs | perUnit | 1 | 70 | 30 | 150 | 5 | 30 | 150 | porcionMax | 389.55 | 12.75 | 73.5 | 4.95 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Pan de molde Bio sin gluten | 370 | activo/canónico | Grs | perUnit | 1 | 70 | 30 | 150 | 5 | 30 | 150 | porcionMax | 419.1 | 2.4 | 85.5 | 7.5 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Pan de salvado (Fargo) | 371 | activo/canónico | Reb | perUnit | 1 | 2 | 1 | 4 | 1 | 1 | 4 | porcionMax | 249.6 | 13.4 | 40 | 4 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Pan de salvado doble fargo | 372 | activo/canónico | Reb | perUnit | 1 | 2 | 1 | 4 | 1 | 1 | 4 | porcionMax | 239.2 | 9.4 | 43.2 | 3.2 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Pan doble integral fargo | 373 | activo/canónico | Reb | perUnit | 1 | 2 | 1 | 4 | 1 | 1 | 4 | porcionMax | 336.4 | 13.2 | 59.2 | 5.2 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Pan frances | 374 | activo/canónico | Grs | perUnit | 1 | 70 | 30 | 150 | 5 | 30 | 150 | porcionMax | 414.3 | 12 | 85.5 | 2.7 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Pan integral | 376 | activo/canónico | Grs | perUnit | 1 | 70 | 30 | 150 | 5 | 30 | 150 | porcionMax | 388.95 | 13.65 | 69.75 | 6.15 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Pan lactal | 377 | activo/canónico | Reb | perUnit | 1 | 2 | 1 | 4 | 1 | 1 | 4 | porcionMax | 247 | 10.6 | 48 | 1.4 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Pan lactal bimbo | 378 | activo/canónico | Reb | perUnit | 1 | 2 | 1 | 4 | 1 | 1 | 4 | porcionMax | 253.8 | 9.8 | 46 | 3.4 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Pan lactal de salvado carrefour | 379 | activo/canónico | Reb | perUnit | 1 | 2 | 1 | 4 | 1 | 1 | 4 | porcionMax | 265.2 | 10 | 50 | 2.8 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Pan lactal noly | 380 | activo/canónico | Reb | perUnit | 1 | 2 | 1 | 4 | 1 | 1 | 4 | porcionMax | 261 | 9.4 | 50 | 2.6 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Pan negro | 381 | activo/canónico | Grs | perUnit | 1 | 70 | 30 | 150 | 5 | 30 | 150 | porcionMax | 388.95 | 13.65 | 69.75 | 6.15 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Pan para hamburguesas | 382 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 417 | 15 | 74.4 | 6.6 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Pan para hamburguesas fargo | 383 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 405.3 | 13.8 | 78.75 | 3.9 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Pan para panchos | 384 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 262.458 | 8.514 | 52.2 | 2.178 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Pan rallado | 386 | activo/canónico | Grs | perUnit | 1 | 70 | 30 | 150 | 5 | 30 | 150 | porcionMax | 518.25 | 12 | 112.5 | 2.25 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Pan tipo artesano bimbo semillas del campo | 387 | activo/canónico | Reban | perUnit | 1 | 2 | 1 | 4 | 1 | 1 | 4 | porcionMax | 350.582 | 14.652 | 58.608 | 6.394 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Panceta | 388 | activo/canónico | Grs | perUnit | 1 | 10 | 5 | 30 | 5 | 5 | 30 | porcionMax | 144 | 3.6 | 0 | 14.4 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Panqueques proteicos A | 389 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 720 | 64.5 | 75 | 18 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Panzotti Ricota y queso (Coto) | 6619bfeb147cd50b646777fb | legacy | (vacía) | (ausente) | — | — | — | — | — | 1 | 12 | fallback.discrete.max12 | 0 | 0 | 0 | 0 | Sin máximo almacenado; fallback | Default arbitrario | Canonicalizar o excluir legacy |
| Panzotti Ricota y queso (Coto) | 390 | inactivo/canónico | g | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 0 | 0 | 0 | 0 | Máximo duro explícito; sugerida separada | Revisar | Confirmar baja/inactividad |
| Papas | 391 | activo/canónico | Grs | perUnit | 1 | 200 | 80 | 350 | 10 | 80 | 350 | porcionMax | 337.05 | 5.95 | 66.5 | 5.25 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Papas fritas (Combo mediano) | 392 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 876 | 12 | 99 | 48 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Papas fritas (Snacks) | 393 | activo/canónico | Grs | perUnit | 1 | 30 | 10 | 100 | 5 | 10 | 100 | porcionMax | 530.4 | 3.6 | 57 | 32 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Papas noisette (Mc Cain) | 394 | activo/canónico | Grs | perUnit | 1 | 200 | 80 | 350 | 10 | 80 | 350 | porcionMax | 575.347 | 8.6 | 90.09 | 20.066 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Papas tradicionales (Mc Cain) | 395 | activo/canónico | Grs | perUnit | 1 | 200 | 80 | 350 | 10 | 80 | 350 | porcionMax | 339.476 | 8.19 | 57.33 | 8.6 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Papaya | 396 | activo/canónico | Grs | perUnit | 1 | 200 | 80 | 350 | 10 | 80 | 350 | porcionMax | 140 | 0 | 35 | 0 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Pasas de uva | 397 | activo/canónico | Grs | perUnit | 1 | 70 | 30 | 150 | 5 | 30 | 150 | porcionMax | 425.7 | 3.465 | 102.96 | 0 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Pasta de mani | 398 | activo/canónico | Grs | perUnit | 1 | 10 | 5 | 30 | 5 | 5 | 30 | porcionMax | 174.9 | 6.9 | 5.1 | 14.1 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Pasta de mani Sin tacc | 399 | activo/canónico | Grs | perUnit | 1 | 10 | 5 | 30 | 5 | 5 | 30 | porcionMax | 175.5 | 7.8 | 3 | 14.7 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Pata muslo de pollo sin piel | 609 | activo/canónico | Grs | perUnit | 1 | 150 | 80 | 250 | 10 | 80 | 250 | porcionMax | 325 | 47.5 | 0 | 12.5 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Paty | 400 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 573 | 42 | 0 | 45 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Patynesa (Paty) | 401 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 831 | 48 | 45 | 51 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Peceto | 402 | activo/canónico | Grs | perUnit | 1 | 150 | 80 | 250 | 10 | 80 | 250 | porcionMax | 327.5 | 53.75 | 0 | 12.5 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Pechuga de pavo | 403 | activo/canónico | Grs | perUnit | 1 | 150 | 80 | 250 | 10 | 80 | 250 | porcionMax | 276.25 | 55 | 0 | 6.25 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Pechuga de pollo | 404 | activo/canónico | Grs | perUnit | 1 | 150 | 80 | 250 | 10 | 80 | 250 | porcionMax | 276.25 | 55 | 0 | 6.25 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Pechuga de pollo con piel | 405 | activo/canónico | Grs | perUnit | 1 | 150 | 80 | 250 | 10 | 80 | 250 | porcionMax | 345 | 52.5 | 0 | 15 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Pepinos | 407 | activo/canónico | Grs | perUnit | 1 | 150 | 50 | 300 | 10 | 50 | 300 | porcionMax | 41.4 | 1.5 | 7.5 | 0.6 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Pera | 408 | activo/canónico | Grs | perUnit | 1 | 150 | 80 | 250 | 10 | 80 | 250 | porcionMax | 146.25 | 1 | 35 | 0.25 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Pera chica | 409 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 252.03 | 1.59 | 60 | 0.63 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Pera grande | 410 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 395.4 | 2.49 | 94.2 | 0.96 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Pera mediana | 411 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 304.83 | 1.92 | 72.6 | 0.75 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Pescado blanco | 412 | activo/canónico | Grs | perUnit | 1 | 150 | 80 | 250 | 10 | 80 | 250 | porcionMax | 325 | 47.5 | 0 | 15 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Pionono (Carrefour) | 413 | activo/canónico | Grs | perUnit | 1 | 30 | 10 | 100 | 5 | 10 | 100 | porcionMax | 332.2 | 10.8 | 58.3 | 6.2 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Pistachos | 415 | activo/canónico | Grs | perUnit | 1 | 10 | 5 | 30 | 5 | 5 | 30 | porcionMax | 184.5 | 7.5 | 4.2 | 15.3 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Pizza sibarita (1/4) | 416 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 852 | 42 | 90 | 36 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Plato de verduras | 6619bfeb147cd50b64677816 | legacy | Unid | (ausente) | 1 | — | — | — | — | 1 | 12 | fallback.discrete.max12 | 417.6 | 28.8 | 64.8 | 4.8 | Sin máximo almacenado; fallback | Default arbitrario | Canonicalizar o excluir legacy |
| Plato de verduras | 418 | inactivo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 0 | 0 | 0 | 0 | Máximo duro explícito; sugerida separada | Revisar | Confirmar baja/inactividad |
| Polenta | 419 | activo/canónico | Grs | perUnit | 1 | 70 | 30 | 150 | 5 | 30 | 150 | porcionMax | 525.6 | 12.75 | 113.25 | 2.4 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Polenta (Coto) | 420 | activo/canónico | Grs | perUnit | 1 | 50 | 10 | 200 | 5 | 10 | 200 | porcionMax | 720.8 | 17 | 156 | 3.2 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Polenta (Presto pronta) | 421 | activo/canónico | Grs | perUnit | 1 | 50 | 10 | 200 | 5 | 10 | 200 | porcionMax | 680 | 14 | 156 | 0 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Polenta (Quaker) | 422 | activo/canónico | Grs | perUnit | 1 | 50 | 10 | 200 | 5 | 10 | 200 | porcionMax | 703.6 | 13.4 | 158 | 2 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Polenta carrefour | 423 | activo/canónico | Grs | perUnit | 1 | 50 | 10 | 200 | 5 | 10 | 200 | porcionMax | 664 | 22 | 144 | 0 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Pomelo | 424 | activo/canónico | Grs | perUnit | 1 | 150 | 80 | 250 | 10 | 80 | 250 | porcionMax | 88 | 0.75 | 21.25 | 0 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Porcion de prepizza | 425 | activo/canónico | Porc | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 257.4 | 11.4 | 48.9 | 1.8 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Porcion de prepizza | 426 | activo/canónico | Porcion | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 257.4 | 11.4 | 48.9 | 1.8 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Porotos secos | 427 | activo/canónico | Grs | perUnit | 1 | 70 | 30 | 150 | 5 | 30 | 150 | porcionMax | 400.2 | 37.5 | 62.55 | 0 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Porotos secos remojados | 428 | activo/canónico | Grs | perUnit | 1 | 200 | 80 | 350 | 10 | 80 | 350 | porcionMax | 316.75 | 22.75 | 52.5 | 1.75 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Premezcla sin tacc Santa María | 429 | activo/canónico | Grs | perUnit | 1 | 50 | 10 | 200 | 5 | 10 | 200 | porcionMax | 778.4 | 7.2 | 164 | 10.4 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Prepizza (Carrefour) | 430 | activo/canónico | Porc | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 369.3 | 10.8 | 72.75 | 3.9 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Provoleta | 431 | activo/canónico | Grs | perUnit | 1 | 10 | 5 | 30 | 5 | 5 | 30 | porcionMax | 103.8 | 7.8 | 0.6 | 7.8 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Pure de papas (General) | 432 | activo/canónico | Grs | perUnit | 1 | 200 | 80 | 350 | 10 | 80 | 350 | porcionMax | 1183.35 | 25.9 | 266 | 1.75 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Pure de papas morixe | 433 | activo/canónico | Grs | perUnit | 1 | 200 | 80 | 350 | 10 | 80 | 350 | porcionMax | 1183.35 | 25.9 | 266 | 1.75 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Puré de tomate | 434 | activo/canónico | Gramos | perUnit | 1 | 150 | 50 | 300 | 10 | 50 | 300 | porcionMax | 84 | 4.8 | 16.2 | 0 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Pure de zapallo knorr | 435 | activo/canónico | Grs | perUnit | 1 | 150 | 50 | 300 | 10 | 50 | 300 | porcionMax | 960 | 24 | 216 | 0 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Pure knorr | 436 | activo/canónico | Grs | perUnit | 1 | 70 | 30 | 150 | 5 | 30 | 150 | porcionMax | 499.8 | 12.6 | 111 | 0.6 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Queso blanco garcia | 437 | activo/canónico | Grs | perUnit | 1 | 40 | 20 | 80 | 5 | 20 | 80 | porcionMax | 99.528 | 5.808 | 6.6 | 5.544 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Queso blanco light tregar | 438 | activo/canónico | Grs | perUnit | 1 | 40 | 20 | 80 | 5 | 20 | 80 | porcionMax | 82.368 | 10.824 | 2.64 | 3.168 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Queso cheddar | 439 | activo/canónico | Grs | perUnit | 1 | 40 | 20 | 80 | 5 | 20 | 80 | porcionMax | 309.92 | 21.6 | 0.08 | 24.8 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Queso cheddar tonadita en fetas | 440 | activo/canónico | Fetas | perUnit | 1 | 2 | 1 | 6 | 1 | 1 | 6 | porcionMax | 300 | 17.4 | 3.6 | 24 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Queso crema | 441 | activo/canónico | Grs | perUnit | 1 | 40 | 20 | 80 | 5 | 20 | 80 | porcionMax | 196.8 | 4.8 | 4.8 | 17.6 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Queso crema carrefour | 442 | activo/canónico | Grs | perUnit | 1 | 40 | 20 | 80 | 5 | 20 | 80 | porcionMax | 180.32 | 5.28 | 2 | 16.8 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Queso crema carrefour light | 443 | activo/canónico | Grs | perUnit | 1 | 40 | 20 | 80 | 5 | 20 | 80 | porcionMax | 125.664 | 6.864 | 3.168 | 9.504 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Queso crema crematto milkaut | 444 | activo/canónico | Grs | perUnit | 1 | 40 | 20 | 80 | 5 | 20 | 80 | porcionMax | 235.12 | 3.76 | 6.96 | 21.36 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Queso crema crematto milkaut light | 445 | activo/canónico | Grs | perUnit | 1 | 40 | 20 | 80 | 5 | 20 | 80 | porcionMax | 174.24 | 4.224 | 10.824 | 12.672 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Queso crema cremon light | 446 | activo/canónico | Grs | perUnit | 1 | 40 | 20 | 80 | 5 | 20 | 80 | porcionMax | 115.256 | 7.656 | 5.12 | 7.128 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Queso crema la paulina | 447 | activo/canónico | Grs | perUnit | 1 | 40 | 20 | 80 | 5 | 20 | 80 | porcionMax | 197.76 | 3.44 | 6.4 | 17.6 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Queso crema la paulina light | 448 | activo/canónico | Grs | perUnit | 1 | 40 | 20 | 80 | 5 | 20 | 80 | porcionMax | 87.76 | 4.4 | 8 | 4.24 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Queso crema light | 449 | activo/canónico | Grs | perUnit | 1 | 40 | 20 | 80 | 5 | 20 | 80 | porcionMax | 102.88 | 6.96 | 6.16 | 5.6 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Queso crema philadelphia | 450 | activo/canónico | Grs | perUnit | 1 | 40 | 20 | 80 | 5 | 20 | 80 | porcionMax | 234.72 | 4.08 | 2.4 | 23.2 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Queso crema philadelphia light | 451 | activo/canónico | Grs | perUnit | 1 | 40 | 20 | 80 | 5 | 20 | 80 | porcionMax | 200.32 | 4.88 | 5.6 | 17.6 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Queso crema san ignacio | 452 | activo/canónico | Grs | perUnit | 1 | 40 | 20 | 80 | 5 | 20 | 80 | porcionMax | 180.576 | 5.016 | 4.488 | 15.84 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Queso crema san ignacio light | 453 | activo/canónico | Grs | perUnit | 1 | 40 | 20 | 80 | 5 | 20 | 80 | porcionMax | 104.28 | 6.072 | 6.336 | 6.072 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Queso cremon cremoso | 454 | activo/canónico | Grs | perUnit | 1 | 40 | 20 | 80 | 5 | 20 | 80 | porcionMax | 230.4 | 14.4 | 0 | 19.2 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Queso cremon doble crema | 455 | activo/canónico | Grs | perUnit | 1 | 40 | 20 | 80 | 5 | 20 | 80 | porcionMax | 285.6 | 11.2 | 0.8 | 26.4 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Queso cremoso | 456 | activo/canónico | Grs | perUnit | 1 | 40 | 20 | 80 | 5 | 20 | 80 | porcionMax | 250.8 | 16 | 0.8 | 20.4 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Queso cremoso (cremac) | 457 | activo/canónico | Grs | perUnit | 1 | 40 | 20 | 80 | 5 | 20 | 80 | porcionMax | 236.016 | 14.784 | 2.64 | 18.48 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Queso cremoso cremac | 459 | activo/canónico | Grs | perUnit | 1 | 40 | 20 | 80 | 5 | 20 | 80 | porcionMax | 236.016 | 14.784 | 2.64 | 18.48 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Queso cremoso light | 460 | activo/canónico | Grs | perUnit | 1 | 40 | 20 | 80 | 5 | 20 | 80 | porcionMax | 189.6 | 16.8 | 0 | 13.6 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Queso cremoso port salut | 461 | activo/canónico | Grs | perUnit | 1 | 40 | 20 | 80 | 5 | 20 | 80 | porcionMax | 247.2 | 16 | 0.8 | 20 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Queso cremoso punta del agua | 462 | activo/canónico | Grs | perUnit | 1 | 40 | 20 | 80 | 5 | 20 | 80 | porcionMax | 221.2 | 13.36 | 0 | 18.64 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Queso cremoso punta del agua light | 463 | activo/canónico | Grs | perUnit | 1 | 40 | 20 | 80 | 5 | 20 | 80 | porcionMax | 204.72 | 16.16 | 1.36 | 14.96 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Queso cremoso saint paulin | 464 | activo/canónico | Grs | perUnit | 1 | 40 | 20 | 80 | 5 | 20 | 80 | porcionMax | 177.6 | 22.4 | 0.4 | 9.6 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Queso cremoso temblay | 466 | activo/canónico | Grs | perUnit | 1 | 40 | 20 | 80 | 5 | 20 | 80 | porcionMax | 253.44 | 15.84 | 0 | 21.12 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Queso danbo carrefour | 467 | activo/canónico | Fetas | perUnit | 1 | 2 | 1 | 6 | 1 | 1 | 6 | porcionMax | 416.4 | 31.2 | 0 | 32.4 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Queso danbo carrefour light | 468 | activo/canónico | Fetas | perUnit | 1 | 2 | 1 | 6 | 1 | 1 | 6 | porcionMax | 364.8 | 37.2 | 0 | 24 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Queso danbo feteado | 471 | activo/canónico | Gramos | perUnit | 1 | 40 | 20 | 80 | 5 | 20 | 80 | porcionMax | 274.824 | 20.592 | 0 | 21.384 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Queso danbo feteado light | 472 | activo/canónico | Grs | perUnit | 1 | 40 | 20 | 80 | 5 | 20 | 80 | porcionMax | 238.56 | 24 | 0 | 15.84 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Queso danbo light | 473 | activo/canónico | Grs | perUnit | 1 | 40 | 20 | 80 | 5 | 20 | 80 | porcionMax | 240.768 | 24.552 | 0 | 15.84 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Queso finlandia clasico | 474 | activo/canónico | Grs | perUnit | 1 | 40 | 20 | 80 | 5 | 20 | 80 | porcionMax | 227.568 | 5.544 | 2.64 | 21.648 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Queso finlandia light | 475 | activo/canónico | Grs | perUnit | 1 | 40 | 20 | 80 | 5 | 20 | 80 | porcionMax | 156.16 | 7.2 | 3.04 | 12.8 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Queso la paulina | 476 | activo/canónico | Grs | perUnit | 1 | 40 | 20 | 80 | 5 | 20 | 80 | porcionMax | 248.16 | 15.2 | 1.84 | 20 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Queso la paulina light | 477 | activo/canónico | Grs | perUnit | 1 | 40 | 20 | 80 | 5 | 20 | 80 | porcionMax | 232.24 | 20.8 | 0 | 16.56 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Queso mozzarella | 478 | activo/canónico | Grs | perUnit | 1 | 40 | 20 | 80 | 5 | 20 | 80 | porcionMax | 240 | 20.8 | 3.2 | 16 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Queso pategras | 480 | activo/canónico | Grs | perUnit | 1 | 40 | 20 | 80 | 5 | 20 | 80 | porcionMax | 300.432 | 21.648 | 0 | 23.76 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Queso port salut (La paulina) | 481 | activo/canónico | Grs | perUnit | 1 | 40 | 20 | 80 | 5 | 20 | 80 | porcionMax | 244.32 | 14.96 | 1.84 | 19.68 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Queso port salut light (La paulina) | 482 | activo/canónico | Grs | perUnit | 1 | 40 | 20 | 80 | 5 | 20 | 80 | porcionMax | 166.88 | 20.8 | 1.84 | 8.48 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Queso sardo | 483 | activo/canónico | Grs | perUnit | 1 | 40 | 20 | 80 | 5 | 20 | 80 | porcionMax | 310.464 | 20.592 | 0 | 25.344 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Queso untable cremon light | 484 | activo/canónico | Grs | perUnit | 1 | 40 | 20 | 80 | 5 | 20 | 80 | porcionMax | 113.784 | 7.656 | 4.752 | 7.128 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Queso untable garcia | 485 | activo/canónico | Grs | perUnit | 1 | 40 | 20 | 80 | 5 | 20 | 80 | porcionMax | 99.528 | 5.808 | 6.6 | 5.544 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Quinoa | 487 | activo/canónico | Grs | perUnit | 1 | 70 | 30 | 150 | 5 | 30 | 150 | porcionMax | 560.1 | 19.95 | 100.5 | 8.7 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Rapiditas clasicas (Bimbo) | 488 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 214.59 | 6.75 | 35.76 | 4.95 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Rapiditas integrales (Bimbo) | 489 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 198.75 | 7.2 | 30 | 5.55 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Rapiditas light (Bimbo) | 490 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 207 | 7.65 | 36 | 3.6 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Ravioles (Carrefour) | 491 | activo/canónico | Grs | perUnit | 1 | 70 | 30 | 150 | 5 | 30 | 150 | porcionMax | 404.7 | 13.8 | 70.5 | 7.5 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Remolacha | 492 | activo/canónico | Grs | perUnit | 1 | 150 | 50 | 300 | 10 | 50 | 300 | porcionMax | 132 | 3 | 30 | 0 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Repollo | 494 | activo/canónico | Grs | perUnit | 1 | 150 | 50 | 300 | 10 | 50 | 300 | porcionMax | 34.2 | 1.8 | 0 | 3 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Rhodesia | 495 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 3.459 | 0.031 | 0.413 | 0.187 | Máximo duro explícito; sugerida separada | Probable error de datos | Revisión de producto prioritaria |
| Ricota | 496 | activo/canónico | Grs | perUnit | 1 | 50 | 10 | 200 | 5 | 10 | 200 | porcionMax | 309.76 | 22.64 | 8 | 20.8 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Ricota magra | 497 | activo/canónico | Grs | perUnit | 1 | 50 | 10 | 200 | 5 | 10 | 200 | porcionMax | 216 | 24 | 12 | 8 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Salame | 498 | activo/canónico | Grs | perUnit | 1 | 10 | 5 | 30 | 5 | 5 | 30 | porcionMax | 97.95 | 5.925 | 0 | 8.25 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Salame (Cagnoli) | 499 | activo/canónico | Fetas | perUnit | 1 | 2 | 1 | 6 | 1 | 1 | 6 | porcionMax | 424.8 | 19.8 | 0 | 38.4 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Salame tandilero tipo milan (Cagnoli) | 500 | activo/canónico | Grs | perUnit | 1 | 50 | 20 | 100 | 5 | 20 | 100 | porcionMax | 326.3 | 19.7 | 0 | 27.5 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Salame tipo milan (Bocatti) | 501 | activo/canónico | Grs | perUnit | 1 | 50 | 20 | 100 | 5 | 20 | 100 | porcionMax | 412.3 | 18.7 | 0 | 37.5 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Salame tipo Milan (Paladini) | 502 | activo/canónico | Grs | perUnit | 1 | 50 | 20 | 100 | 5 | 20 | 100 | porcionMax | 376.5 | 21 | 0 | 32.5 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Salamin picado fino (Paladini) | 503 | activo/canónico | Grs | perUnit | 1 | 50 | 20 | 100 | 5 | 20 | 100 | porcionMax | 400 | 19 | 0 | 36 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Salamin picado grueso (Paladini) | 504 | activo/canónico | Grs | perUnit | 1 | 50 | 20 | 100 | 5 | 20 | 100 | porcionMax | 362.8 | 21.7 | 1.5 | 30 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Salchichas de soja (Vegetalex) | 505 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 79.2 | 12 | 7.8 | 0 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Salchichas Granja Iris | 506 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 120.9 | 13.5 | 9.3 | 3.3 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Salchichas La Blanca | 507 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 216.6 | 8.7 | 9 | 16.2 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Salchichas Paladini | 508 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 286.5 | 14.7 | 9 | 21.3 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Salchichas patyvienna | 509 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 243.6 | 14.7 | 5.7 | 18 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Salchichas Swift | 510 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 256.8 | 10.2 | 10.8 | 19.2 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Salchichas Vienissima | 511 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 226.5 | 13.8 | 5.7 | 16.5 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Salmón | 513 | activo/canónico | Grs | perUnit | 1 | 150 | 80 | 250 | 10 | 80 | 250 | porcionMax | 537.5 | 50 | 0 | 37.5 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Salsa | 514 | activo/canónico | Grs | perUnit | 1 | 50 | 10 | 200 | 5 | 10 | 200 | porcionMax | 56 | 2 | 12 | 0 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Sandia | 515 | activo/canónico | Grs | perUnit | 1 | 150 | 80 | 250 | 10 | 80 | 250 | porcionMax | 76.5 | 1.5 | 16.5 | 0.5 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Sanguche: | 6619bfeb147cd50b64677880 | legacy | (vacía) | (ausente) | — | — | — | — | — | 1 | 12 | fallback.discrete.max12 | 0 | 0 | 0 | 0 | Sin máximo almacenado; fallback | Default arbitrario | Canonicalizar o excluir legacy |
| Sanguche: | 516 | inactivo/canónico | g | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 0 | 0 | 0 | 0 | Máximo duro explícito; sugerida separada | Revisar | Confirmar baja/inactividad |
| Sardinas | 517 | activo/canónico | Grs | perUnit | 1 | 150 | 80 | 250 | 10 | 80 | 250 | porcionMax | 348.75 | 45 | 0 | 18.75 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Scons sin gluten Santa Maria | 518 | activo/canónico | Grs | perUnit | 1 | 50 | 10 | 200 | 5 | 10 | 200 | porcionMax | 893.6 | 5.4 | 146 | 32 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Seitan | 519 | activo/canónico | Grs | perUnit | 1 | 150 | 80 | 250 | 10 | 80 | 250 | porcionMax | 305 | 60 | 5 | 5 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Semillas de calabaza | 520 | activo/canónico | Grs | perUnit | 1 | 150 | 50 | 300 | 10 | 50 | 300 | porcionMax | 1752 | 105 | 9 | 144 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Semillas de chia | 522 | activo/canónico | Grs | perUnit | 1 | 10 | 5 | 30 | 5 | 5 | 30 | porcionMax | 145.8 | 4.8 | 11.4 | 9 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Semillas de girasol | 523 | activo/canónico | Grs | perUnit | 1 | 10 | 5 | 30 | 5 | 5 | 30 | porcionMax | 174.21 | 6.99 | 1.8 | 15.45 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Semillas de lino | 524 | activo/canónico | Grs | perUnit | 1 | 10 | 5 | 30 | 5 | 5 | 30 | porcionMax | 161.7 | 6.9 | 4.5 | 12.9 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Semillas de sesamo | 526 | activo/canónico | Grs | perUnit | 1 | 10 | 5 | 30 | 5 | 5 | 30 | porcionMax | 179.784 | 5.148 | 7.722 | 14.256 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Skarchitos granix | 527 | activo/canónico | Grs | perUnit | 1 | 70 | 30 | 150 | 5 | 30 | 150 | porcionMax | 557.4 | 7.5 | 130.5 | 0.6 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Soja texturizada | 528 | activo/canónico | Grs | perUnit | 1 | 150 | 80 | 250 | 10 | 80 | 250 | porcionMax | 809.25 | 127.5 | 67.5 | 3.25 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Sopa: | 6619bfeb147cd50b6467788d | legacy | (vacía) | (ausente) | — | — | — | — | — | 1 | 12 | fallback.discrete.max12 | 0 | 0 | 0 | 0 | Sin máximo almacenado; fallback | Default arbitrario | Canonicalizar o excluir legacy |
| Sopa: | 529 | inactivo/canónico | g | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 0 | 0 | 0 | 0 | Máximo duro explícito; sugerida separada | Revisar | Confirmar baja/inactividad |
| Speed 250 Mll | 530 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 336 | 0 | 84 | 0 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Sprite (Gaseosa) | 531 | activo/canónico | Grs | perUnit | 1 | 70 | 30 | 150 | 5 | 30 | 150 | porcionMax | 30 | 0 | 7.5 | 0 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Sushi | 532 | activo/canónico | Grs | perUnit | 1 | 70 | 30 | 150 | 5 | 30 | 150 | porcionMax | 209.4 | 6 | 45 | 0.6 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Tallarines al huevo (Coto) | 533 | activo/canónico | Grs | perUnit | 1 | 150 | 80 | 250 | 10 | 80 | 250 | porcionMax | 898.25 | 27.5 | 187.5 | 4.25 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Tapa de asado | 534 | activo/canónico | Grs | perUnit | 1 | 10 | 5 | 30 | 5 | 5 | 30 | porcionMax | 63.3 | 5.7 | 0 | 4.5 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Tapa pascualina la salteña | 535 | activo/canónico | Tapa | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 937.8 | 20.1 | 140.1 | 33 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Tapas de empanadas (General) | 536 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 319.2 | 5.4 | 42 | 14.4 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Tapas de empanadas la salteña | 537 | activo/canónico | Tapa | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 258.6 | 5.4 | 39 | 9 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Tarta de atun : | 538 | inactivo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 0 | 0 | 0 | 0 | Máximo duro explícito; sugerida separada | Revisar | Confirmar baja/inactividad |
| Tarta de jamon y queso : | 539 | inactivo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 0 | 0 | 0 | 0 | Máximo duro explícito; sugerida separada | Revisar | Confirmar baja/inactividad |
| Tarta: | 6619bfeb147cd50b64677898 | legacy | (vacía) | (ausente) | — | — | — | — | — | 1 | 12 | fallback.discrete.max12 | 0 | 0 | 0 | 0 | Sin máximo almacenado; fallback | Default arbitrario | Canonicalizar o excluir legacy |
| Tarta: | 540 | inactivo/canónico | g | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 0 | 0 | 0 | 0 | Máximo duro explícito; sugerida separada | Revisar | Confirmar baja/inactividad |
| Ternera magra | 541 | activo/canónico | Grs | perUnit | 1 | 150 | 80 | 250 | 10 | 80 | 250 | porcionMax | 327.5 | 53.75 | 0 | 12.5 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Tira de asado | 542 | activo/canónico | Grs | perUnit | 1 | 10 | 5 | 30 | 5 | 5 | 30 | porcionMax | 142.5 | 6.6 | 0 | 12.9 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| tofu | 543 | activo/canónico | Grs | perUnit | 1 | 150 | 80 | 250 | 10 | 80 | 250 | porcionMax | 287.5 | 27.5 | 5 | 17.5 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Tomate | 544 | activo/canónico | Grs | perUnit | 1 | 150 | 50 | 300 | 10 | 50 | 300 | porcionMax | 57 | 2.7 | 10.2 | 0.6 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Tosdadas light riera | 545 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 84.96 | 2.64 | 18.6 | 0 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Tostadas aireadas clasicas ser | 546 | activo/canónico | Grs | perUnit | 1 | 70 | 30 | 150 | 5 | 30 | 150 | porcionMax | 564.9 | 9.3 | 124.5 | 3.3 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Tostadas carrefour light | 547 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 108.939 | 3.45 | 21.78 | 0.891 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Tostadas clasicas | 548 | activo/canónico | Grs | perUnit | 1 | 70 | 30 | 150 | 5 | 30 | 150 | porcionMax | 618.6 | 18 | 111 | 11.4 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Tostadas clasicas carrefour | 549 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 105.12 | 3 | 19.5 | 1.68 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Tostadas clasicas criollitas | 550 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 120.582 | 3.465 | 21.78 | 2.178 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Tostadas de arroz | 551 | activo/canónico | Grs | perUnit | 1 | 70 | 30 | 120 | 5 | 30 | 120 | porcionMax | 433.68 | 9.6 | 97.2 | 0.72 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Tostadas de arroz aireadas carrefour | 6619bfeb147cd50b646778a4 | legacy | Unid | (ausente) | 1 | — | — | — | — | 1 | 12 | fallback.discrete.max12 | 249.6 | 4.8 | 57.6 | 0 | Sin máximo almacenado; fallback | Default arbitrario | Canonicalizar o excluir legacy |
| Tostadas de arroz aireadas carrefour | 553 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 62.4 | 1.2 | 14.4 | 0 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Tostadas de arroz apostoles | 554 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 106.793 | 1.598 | 23.976 | 0.5 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Tostadas de arroz carilo | 555 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 81 | 1.5 | 18.75 | 0 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Tostadas de arroz carrefour (Sin gluten) | 6619bfeb147cd50b646778a8 | legacy | Unid | (ausente) | 1 | — | — | — | — | 1 | 12 | fallback.discrete.max12 | 364.8 | 7.2 | 84 | 0 | Sin máximo almacenado; fallback | Default arbitrario | Canonicalizar o excluir legacy |
| Tostadas de arroz carrefour (Sin gluten) | 557 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 91.2 | 1.8 | 21 | 0 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Tostadas de arroz cerealitas | 558 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 87 | 1.95 | 19.8 | 0 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Tostadas de arroz riera | 559 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 91.2 | 1.8 | 21 | 0 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Tostadas de arroz Risky Dit | 560 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 83.325 | 1.575 | 18.75 | 0.225 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Tostadas de mesa | 561 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 117.909 | 3.465 | 21.78 | 1.881 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Tostadas de mesa riera | 563 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 105.633 | 3.267 | 19.8 | 1.485 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Tostadas de mesa riera | 6619bfeb147cd50b646778af | legacy | Unid | (ausente) | 1 | — | — | — | — | 1 | 12 | fallback.discrete.max12 | 422.532 | 13.068 | 79.2 | 5.94 | Sin máximo almacenado; fallback | Default arbitrario | Canonicalizar o excluir legacy |
| Tostadas de salvado criollitas | 564 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 101.601 | 3.45 | 19.5 | 1.089 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Tostadas dulces carrefour | 566 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 119.4 | 3 | 22.8 | 1.8 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Tostadas dulces carrefour | 6619bfeb147cd50b646778b2 | legacy | Unid | (ausente) | 1 | — | — | — | — | 1 | 12 | fallback.discrete.max12 | 477.6 | 12 | 91.2 | 7.2 | Sin máximo almacenado; fallback | Default arbitrario | Canonicalizar o excluir legacy |
| Tostadas dulces criollitas | 567 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 120.6 | 3.6 | 22.5 | 1.8 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Tostadas dulces riera | 568 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 105.33 | 2.97 | 21 | 1.05 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Tostadas gruesas clasicas carrefour | 569 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 56.304 | 1.68 | 10.56 | 0.816 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Tostadas integrales riera | 570 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 97.77 | 2.97 | 18.3 | 1.41 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Tostadas light criollitas | 571 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 116.49 | 3.45 | 22.77 | 1.29 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Tostadas light riera | 572 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 85.2 | 3 | 18.3 | 0 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Tostadas sin sal agregada carrefour | 573 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 88.98 | 2.625 | 16.65 | 1.32 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Tostadas sin sal agregada criollitas | 574 | activo/canónico | Grs | perUnit | 1 | 70 | 30 | 150 | 5 | 30 | 150 | porcionMax | 592.05 | 19.5 | 114 | 6.45 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Tostaditas "Tosti" | 575 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 71.46 | 2.1 | 13.2 | 1.14 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Tostaditas de arroz molino ala | 576 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 24.242 | 0.679 | 5.382 | 0 | Máximo duro explícito; sugerida separada | Probable error de datos | Revisión de producto prioritaria |
| Tostaditas de arroz Molinos ala | 577 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 24.242 | 0.679 | 5.382 | 0 | Máximo duro explícito; sugerida separada | Probable error de datos | Revisión de producto prioritaria |
| Tostaditas de arroz sin sal | 578 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 11.009 | 0.079 | 2.673 | 0 | Máximo duro explícito; sugerida separada | Probable error de datos | Revisión de producto prioritaria |
| Tostaditas de arroz sin sal | 579 | activo/canónico | Grs | perUnit | 1 | 70 | 30 | 120 | 5 | 30 | 120 | porcionMax | 440.352 | 3.168 | 106.92 | 0 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Triple Hamburguesa con queso | 580 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 1704 | 114 | 96 | 96 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Turron arcor | 581 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 290.4 | 5.1 | 54 | 6 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Turron arcor con fibra | 582 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 242.4 | 5.1 | 42 | 6 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Turron con fibra (Arcor) | 583 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 242.4 | 5.1 | 42 | 6 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Uvas | 584 | activo/canónico | Grs | perUnit | 1 | 150 | 80 | 250 | 10 | 80 | 250 | porcionMax | 173.5 | 1.75 | 40.5 | 0.5 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Vainillas (pozo) | 585 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 137.475 | 3.3 | 25.5 | 2.475 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| veggies quinoa y espinaca | 586 | activo/canónico | Unid | perUnit | 1 | 1 | 1 | 3 | 1 | 1 | 3 | porcionMax | 453.9 | 21 | 81 | 5.1 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Verduras | 587 | activo/canónico | Grs | perUnit | 1 | 150 | 50 | 300 | 10 | 50 | 300 | porcionMax | 94.8 | 4.5 | 16.5 | 1.2 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Vino | 588 | activo/canónico | Ml | perUnit | 1 | 250 | 100 | 500 | 50 | 100 | 500 | porcionMax | 415 | 0 | 47.5 | 25 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Whey protein Isolate | 589 | activo/canónico | Grs | perUnit | 1 | 150 | 80 | 250 | 10 | 80 | 250 | porcionMax | 960.5 | 227.5 | 2.5 | 4.5 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Whey protein SN | 591 | activo/canónico | Grs | perUnit | 1 | 150 | 80 | 250 | 10 | 80 | 250 | porcionMax | 1052 | 207.5 | 21.75 | 15 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Yogurisimo bebible | 592 | activo/canónico | Grs | perUnit | 1 | 70 | 30 | 150 | 5 | 30 | 150 | porcionMax | 87.9 | 4.2 | 15.75 | 0.9 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Yogurisimo firme la serenisima (190 grs) | 593 | activo/canónico | Pote | perUnit | 1 | 1 | 1 | 2 | 1 | 1 | 2 | porcionMax | 301.2 | 14.2 | 44 | 7.6 | Máximo duro explícito; sugerida separada | Revisar | Validar intención del máximo |
| Yogurt activia bebible | 594 | activo/canónico | Grs | perUnit | 1 | 70 | 30 | 150 | 5 | 30 | 150 | porcionMax | 92.85 | 4.35 | 13.8 | 2.25 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Yogurt bebible (Ser) | 595 | activo/canónico | Grs | perUnit | 1 | 70 | 30 | 150 | 5 | 30 | 150 | porcionMax | 41.4 | 4.65 | 5.7 | 0 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Yogurt bebible vida light | 596 | activo/canónico | Grs | perUnit | 1 | 50 | 10 | 200 | 5 | 10 | 200 | porcionMax | 60.8 | 5.8 | 9.4 | 0 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Yogurt descremado bebible Ilolay | 597 | activo/canónico | Grs | perUnit | 1 | 70 | 30 | 150 | 5 | 30 | 150 | porcionMax | 52.2 | 5.55 | 7.5 | 0 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Yogurt descremado bebible vida | 598 | activo/canónico | Grs | perUnit | 1 | 70 | 30 | 150 | 5 | 30 | 150 | porcionMax | 45.6 | 4.35 | 7.05 | 0 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Yogurt descremado gran compra | 599 | activo/canónico | Grs | perUnit | 1 | 50 | 10 | 200 | 5 | 10 | 200 | porcionMax | 62.4 | 7.2 | 8.4 | 0 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Yogurt entero bebible Ilolay | 600 | activo/canónico | Grs | perUnit | 1 | 70 | 30 | 150 | 5 | 30 | 150 | porcionMax | 93.15 | 4.5 | 15.75 | 1.35 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Yogurt entero bebible Yogs | 601 | activo/canónico | Grs | perUnit | 1 | 70 | 30 | 150 | 5 | 30 | 150 | porcionMax | 54.375 | 2.25 | 10.5 | 0.375 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Yogurt entero gran compra | 602 | activo/canónico | Grs | perUnit | 1 | 70 | 30 | 150 | 5 | 30 | 150 | porcionMax | 80.775 | 3.75 | 14.25 | 0.975 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Yogurt light gran compra | 603 | activo/canónico | Grs | perUnit | 1 | 70 | 30 | 150 | 5 | 30 | 150 | porcionMax | 46.2 | 4.8 | 6.75 | 0 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Yogurt light la serenisima (Bebible) | 604 | activo/canónico | Grs | perUnit | 1 | 50 | 10 | 200 | 5 | 10 | 200 | porcionMax | 62.8 | 7.3 | 8.4 | 0 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Zanahorias | 605 | activo/canónico | Grs | perUnit | 1 | 150 | 50 | 300 | 10 | 50 | 300 | porcionMax | 100.2 | 2.7 | 21 | 0.6 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Zanahoriias | 606 | activo/canónico | Grs | perUnit | 1 | 150 | 50 | 300 | 10 | 50 | 300 | porcionMax | 100.2 | 2.7 | 21 | 0.6 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Zapallo | 607 | activo/canónico | Grs | perUnit | 1 | 150 | 50 | 300 | 10 | 50 | 300 | porcionMax | 79.5 | 3.3 | 15.9 | 0.3 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |
| Zucaritas | 608 | activo/canónico | Grs | perUnit | 1 | 30 | 10 | 100 | 5 | 10 | 100 | porcionMax | 387.6 | 3.6 | 93.3 | 0 | Máximo duro explícito; sugerida separada | Sin riesgo contractual | Conservar |

## 11. Clasificación derivada del inventario

- Sin problema contractual detectado: 359 canónicos activos fuera del conjunto sospechoso. Se conservan; están individualizados como “Sin riesgo contractual” en la tabla.
- Sospechosos: 178 canónicos activos discretos con máximo <=5. La tabla diagnóstica siguiente enumera todos, no sólo frutos secos.
- Legacy/default arbitrario: 31 detectados sin máximo explícito. Deben canonicalizarse o excluirse, no adivinarse por nombre.
- Errores confirmados de software: 4 (catálogo omitido, `Grs`, precisión y homónimos).
- Error de datos confirmado: ninguno sin validación de producto. Siete casos tienen prioridad alta por capacidad <25 kcal.
- Decisión pendiente: validar la intención de la plantilla discreta masiva y aprobar máximos adecuados por tipo de alimento.

En el flujo corregido, Admin, Coach y Tracking reciben el mismo máximo efectivo de catálogo para cada uno de los 178; sólo difiere la policy de optimización. No se modificó Admin/Coach para “igualarlos” a Tracking.

## 12. Diagnóstico actual vs máximo ampliado de los 178 sospechosos

Ejecución read-only con `menu2.js` vía `ServicioAlimentos`, target uniforme `356/P0/C19,3/G41`. El máximo ampliado es diagnóstico y depende de la unidad (Unid/Cuad=12, Fetas=12, Reb/Reban=8, Pote/Barra=4, Tapa/Porc/Porción=6); nunca se persiste. “Impacto” indica si cambió cantidad, zona o score.

| Alimento | ID | Unidad | Max actual | Cant. actual | Kcal/P/C/G actual | Score actual | Zona actual | Max diag. | Cant. diag. | Kcal/P/C/G diag. | Score diag. | Zona diag. | Warning actual/diag. | Impacto |
|---|---|---|---:|---:|---|---:|---|---:|---:|---|---:|---|---|---|
| Alfajor blanco jorgito | 6 | Unid | 3 | 1 | 180.1/3.1/30/5.3 | 1.065538 | no | 12 | 1 | 180.1/3.1/30/5.3 | 1.065538 | no | si/no | Sin cambio |
| Alfajor bon o bon | 8 | Unid | 3 | 1 | 201.8/3.7/22/11 | 0.554967 | no | 12 | 1 | 201.8/3.7/22/11 | 0.554967 | no | si/no | Sin cambio |
| Alfajor de almendras | 9 | Unid | 3 | 2 | 346/6/40/18 | 1.465033 | no | 12 | 2 | 346/6/40/18 | 1.465033 | no | si/no | Sin cambio |
| Alfajor de chocolate jorgito | 10 | Unid | 3 | 1 | 220.5/3.1/32/8.9 | 1.045979 | no | 12 | 1 | 220.5/3.1/32/8.9 | 1.045979 | no | si/no | Sin cambio |
| Alfajor fulbito | 11 | Unid | 3 | 2 | 243.2/2.8/40/8 | 1.798168 | no | 12 | 2 | 243.2/2.8/40/8 | 1.798168 | no | si/no | Sin cambio |
| Alfajor glaceado jorgito | 12 | Unid | 3 | 3 | 296.7/4.5/55.5/6.3 | 4.234348 | no | 12 | 3 | 296.7/4.5/55.5/6.3 | 4.234348 | no | si/si | Sin cambio |
| Alfajor guaymallen | 14 | Unid | 3 | 2 | 322.2/4/50/11.8 | 3.037464 | no | 12 | 2 | 322.2/4/50/11.8 | 3.037464 | no | si/no | Sin cambio |
| Alfajor havanna 70 | 15 | Unid | 3 | 1 | 249.2/3.8/36/10 | 1.320402 | no | 12 | 1 | 249.2/3.8/36/10 | 1.320402 | no | si/no | Sin cambio |
| Alfajor jorgelin | 16 | Unid | 3 | 1 | 332/5/51/12 | 3.198061 | no | 12 | 1 | 332/5/51/12 | 3.198061 | no | si/no | Sin cambio |
| Alfajor jorgito | 18 | Unid | 3 | 1 | 216.5/3.1/31/8.9 | 0.980474 | no | 12 | 1 | 216.5/3.1/31/8.9 | 0.980474 | no | si/no | Sin cambio |
| Alfajor Oreo Trilogia | 19 | Unid | 3 | 1 | 265.8/2.7/30/15 | 0.709506 | no | 12 | 1 | 265.8/2.7/30/15 | 0.709506 | no | no/no | Sin cambio |
| Alfajor pepitos | 20 | Unid | 3 | 1 | 288.8/3.2/33/16 | 0.875682 | no | 12 | 1 | 288.8/3.2/33/16 | 0.875682 | no | no/no | Sin cambio |
| Alfajor pepitos triple | 21 | Unid | 3 | 1 | 287.6/2.9/33/16 | 0.875682 | no | 12 | 1 | 287.6/2.9/33/16 | 0.875682 | no | no/no | Sin cambio |
| Alfajor Shot | 22 | Unid | 3 | 1 | 315.8/4.7/36/17 | 1.091371 | no | 12 | 1 | 315.8/4.7/36/17 | 1.091371 | no | no/no | Sin cambio |
| Alfajor shot triple | 23 | Unid | 3 | 1 | 315.8/4.7/36/17 | 1.091371 | no | 12 | 1 | 315.8/4.7/36/17 | 1.091371 | no | no/no | Sin cambio |
| Alfajor tatin | 24 | Unid | 3 | 2 | 282.6/4.8/42/10.6 | 1.933134 | no | 12 | 2 | 282.6/4.8/42/10.6 | 1.933134 | no | si/no | Sin cambio |
| Alfajor terrabusi clasico | 25 | Unid | 3 | 1 | 197.9/3.6/29/7.5 | 0.920206 | no | 12 | 1 | 197.9/3.6/29/7.5 | 0.920206 | no | si/no | Sin cambio |
| Alfajor terrabusi doble | 26 | Unid | 3 | 1 | 206/3.5/30/8 | 0.955193 | no | 12 | 1 | 206/3.5/30/8 | 0.955193 | no | si/no | Sin cambio |
| Alfajor terrabusi grande | 27 | Unid | 3 | 1 | 266.1/4.6/41/9.3 | 1.861961 | no | 12 | 1 | 266.1/4.6/41/9.3 | 1.861961 | no | si/no | Sin cambio |
| Alfajor terrabusi triple | 28 | Unid | 3 | 1 | 266.1/4.6/41/9.3 | 1.861961 | no | 12 | 1 | 266.1/4.6/41/9.3 | 1.861961 | no | si/no | Sin cambio |
| Alfajor tofi | 29 | Unid | 3 | 1 | 180.8/2.8/28/6.4 | 0.915371 | no | 12 | 1 | 180.8/2.8/28/6.4 | 0.915371 | no | si/no | Sin cambio |
| Alfajor triple tatin | 30 | Unid | 3 | 1 | 252.9/4.4/37/9.7 | 1.423871 | no | 12 | 1 | 252.9/4.4/37/9.7 | 1.423871 | no | si/no | Sin cambio |
| Alfajor triple terrabusi | 31 | Unid | 3 | 1 | 266.1/4.6/41/9.3 | 1.861961 | no | 12 | 1 | 266.1/4.6/41/9.3 | 1.861961 | no | si/no | Sin cambio |
| Alfajor vauquita | 32 | Unid | 3 | 1 | 233/4/34/9 | 1.189284 | no | 12 | 1 | 233/4/34/9 | 1.189284 | no | si/no | Sin cambio |
| Almendras | 34 | Unid | 3 | 3 | 21.45/0.78/0.47/1.83 | 1.865118 | no | 12 | 12 | 85.8/3.12/1.86/7.32 | 1.491344 | no | si/si | Cambia |
| Arrocitas paquete amarillo | 37 | Unid | 3 | 3 | 85.35/18.9/1.42/0.45 | 1.835952 | no | 12 | 12 | 341.4/75.6/5.7/1.8 | 1.410673 | no | si/si | Cambia |
| Arrocitas paquete verde | 38 | Unid | 3 | 3 | 73.88/1.95/15/0.68 | 1.016983 | no | 12 | 12 | 295.5/7.8/60/2.7 | 5.319702 | no | si/si | Cambia |
| Atun en lomitos al aceite | 46 | Pote | 2 | 1 | 246/30/0/14 | 1.43367 | no | 4 | 1 | 246/30/0/14 | 1.43367 | no | si/no | Sin cambio |
| Atun en lomitos al natural | 47 | Pote | 2 | 2 | 240/60/0/0 | 2 | no | 4 | 2 | 240/60/0/0 | 2 | no | no/no | Sin cambio |
| Banana chica | 52 | Unid | 3 | 3 | 270.51/3.3/62.1/0.99 | 5.870114 | no | 12 | 3 | 270.51/3.3/62.1/0.99 | 5.870114 | no | si/si | Sin cambio |
| Banana grande | 53 | Unid | 3 | 2 | 243.94/2.96/56/0.9 | 4.572489 | no | 12 | 2 | 243.94/2.96/56/0.9 | 4.572489 | no | si/si | Sin cambio |
| Banana mediana | 54 | Unid | 3 | 3 | 317.61/3.87/72.9/1.17 | 8.656593 | no | 12 | 3 | 317.61/3.87/72.9/1.17 | 8.656593 | no | si/si | Sin cambio |
| Barra de cereal | 55 | Unid | 3 | 3 | 251.7/2.7/42/8.1 | 2.027274 | no | 12 | 4 | 335.6/3.6/56/10.8 | 4.158467 | no | si/si | Cambia |
| Barra de cereal frutilla Cereal Mix | 56 | Unid | 3 | 3 | 274.8/4.5/48/7.2 | 2.890927 | no | 12 | 3 | 274.8/4.5/48/7.2 | 2.890927 | no | si/si | Sin cambio |
| Bastoncitos de merluza (Granja del sol) | 57 | Unid | 3 | 3 | 159.6/7.8/18.6/6 | 0.730048 | no | 12 | 6 | 319.2/15.6/37.2/12 | 1.360482 | no | si/si | Cambia |
| Bay biscuit | 61 | Unid | 3 | 3 | 205.35/4.95/42/1.95 | 2.290506 | no | 12 | 5 | 342.25/8.25/70/3.25 | 7.748576 | no | si/si | Cambia |
| Biscuits | 66 | Unid | 3 | 3 | 150.75/3.15/31.5/1.35 | 1.334812 | no | 12 | 7 | 351.75/7.35/73.5/3.15 | 8.738738 | normal | si/si | Cambia |
| Bizcochos agridulces 9 de oro | 67 | Unid | 3 | 3 | 38.34/0.54/5.4/1.62 | 1.441235 | no | 12 | 12 | 153.36/2.16/21.6/6.48 | 0.723084 | no | si/si | Cambia |
| Bizcochos dulces | 68 | Unid | 3 | 3 | 74.2/1.29/8.96/3.69 | 1.115121 | no | 12 | 12 | 296.81/5.18/35.86/14.74 | 1.146061 | no | si/si | Cambia |
| Bizcochos light 9 de oro | 69 | Unid | 3 | 3 | 49.5/1.13/7.88/1.5 | 1.278595 | no | 12 | 12 | 198/4.5/31.5/6 | 1.128314 | no | si/si | Cambia |
| Bizcochos salados | 70 | Unid | 3 | 3 | 77.14/1.34/7.97/4.43 | 1.140227 | no | 12 | 12 | 308.56/5.38/31.87/17.73 | 0.746479 | no | si/si | Cambia |
| Caramelos sugus | 87 | Unid | 3 | 3 | 37.54/0.14/8.16/0.48 | 1.309885 | no | 12 | 12 | 150.14/0.58/32.64/1.92 | 1.38628 | no | si/si | Cambia |
| Cerealitas | 101 | Unid | 3 | 3 | 79.74/1.86/12/2.7 | 1.015694 | no | 12 | 12 | 318.96/7.44/48/10.8 | 2.753866 | no | si/si | Cambia |
| Chocolate aguila semiamargo | 106 | Barra | 4 | 3 | 309.3/3.9/39/15.3 | 1.434795 | no | 6 | 3 | 309.3/3.9/39/15.3 | 1.434795 | no | si/si | Sin cambio |
| Chocolate cofler aireado (Leche) | 108 | Cuad | 4 | 4 | 100.8/1.4/9.4/6.4 | 0.975292 | no | 12 | 12 | 302.4/4.2/28.2/19.2 | 0.495363 | no | si/si | Cambia |
| Chupetin pico dulce arcor | 112 | Unid | 3 | 3 | 168/0/42/0 | 2.383366 | no | 12 | 6 | 336/0/84/0 | 12.238127 | no | no/no | Cambia |
| Crackers Smams (Sin tac) | 121 | Unid | 3 | 3 | 69.84/0.06/12/2.4 | 1.029418 | no | 12 | 12 | 279.36/0.24/48/9.6 | 2.79784 | no | si/si | Cambia |
| Criollitas | 126 | Unid | 3 | 3 | 49.5/1.2/7.8/1.5 | 1.283211 | no | 12 | 12 | 198/4.8/31.2/6 | 1.108904 | no | si/si | Cambia |
| Criollitas grandes | 127 | Unid | 3 | 3 | 87.9/2.1/13.8/2.7 | 0.95384 | no | 12 | 12 | 351.6/8.4/55.2/10.8 | 4.002544 | normal | si/si | Cambia |
| Criollitas sin sal | 128 | Unid | 3 | 3 | 88.41/2.4/14.1/2.49 | 0.954817 | no | 12 | 12 | 353.64/9.6/56.4/9.96 | 4.268319 | normal | si/si | Cambia |
| Danette dulce de leche | 133 | Unid | 3 | 2 | 315.6/6.8/46/11.6 | 2.428044 | no | 12 | 2 | 315.6/6.8/46/11.6 | 2.428044 | no | si/no | Sin cambio |
| Durazno chico | 149 | Unid | 3 | 3 | 154.23/0.33/36/0.99 | 1.701008 | no | 12 | 6 | 308.46/0.66/72/1.98 | 8.361759 | no | si/si | Cambia |
| Durazno grande | 150 | Unid | 3 | 3 | 205.68/0.45/48/1.32 | 3.147954 | no | 12 | 5 | 342.8/0.75/80/2.2 | 10.787076 | no | si/si | Cambia |
| Durazno mediano | 151 | Unid | 3 | 3 | 179.82/0.39/42/1.14 | 2.328529 | no | 12 | 5 | 299.7/0.65/70/1.9 | 7.810294 | no | si/si | Cambia |
| Empanada de carne el noble | 152 | Unid | 3 | 1 | 184/6/22/8 | 0.6674 | no | 12 | 1 | 184/6/22/8 | 0.6674 | no | si/no | Sin cambio |
| Empanada de jamon y queso el noblre | 153 | Unid | 3 | 1 | 210/8/22/10 | 0.591255 | no | 12 | 1 | 210/8/22/10 | 0.591255 | no | si/no | Sin cambio |
| Filet de merluza | 165 | Unid | 3 | 3 | 3.87/0.63/0/0.15 | 1.992696 | no | 12 | 12 | 15.48/2.52/0/0.6 | 1.970946 | no | si/si | Cambia |
| Flan con caramelo Danette | 166 | Unid | 3 | 2 | 270.8/6.4/46/6.8 | 2.60965 | no | 12 | 2 | 270.8/6.4/46/6.8 | 2.60965 | no | si/si | Sin cambio |
| Flan Sancorito | 167 | Unid | 3 | 2 | 261.8/6.2/48/5 | 2.982277 | no | 12 | 2 | 261.8/6.2/48/5 | 2.982277 | no | si/si | Sin cambio |
| Flan Serenito | 168 | Unid | 3 | 2 | 275.2/6.4/48/6.4 | 2.923479 | no | 12 | 2 | 275.2/6.4/48/6.4 | 2.923479 | no | si/si | Sin cambio |
| Frutigran granix | 172 | Unid | 3 | 3 | 195.75/3.45/30.3/6.75 | 1.022677 | no | 12 | 5 | 326.25/5.75/50.5/11.25 | 3.139841 | no | si/si | Cambia |
| Galletas de arroz | 174 | Unid | 3 | 3 | 115.35/2.61/24/0.99 | 1.011594 | no | 12 | 9 | 346.05/7.83/72/2.97 | 8.316382 | no | si/si | Cambia |
| Galletas de arroz carrefour | 175 | Unid | 3 | 3 | 114.59/2.57/23.4/1.19 | 0.988017 | no | 12 | 9 | 343.76/7.72/70.2/3.56 | 7.789084 | no | si/si | Cambia |
| Galletas marineras carrefour | 176 | Unid | 3 | 3 | 98.25/2.47/15/3.15 | 0.901883 | no | 12 | 10 | 327.5/8.25/50/10.5 | 3.083633 | no | si/si | Cambia |
| Galletitas bagley con maiz | 177 | Unid | 3 | 3 | 69.67/1.48/10.2/2.55 | 1.101793 | no | 12 | 12 | 278.66/5.92/40.8/10.2 | 1.805304 | no | si/si | Cambia |
| Galletitas cerro azul sabor limon | 178 | Unid | 3 | 3 | 62.34/0.54/11.4/1.62 | 1.090085 | no | 12 | 12 | 249.36/2.16/45.6/6.48 | 2.565818 | no | si/si | Cambia |
| Galletitas de agua arcor | 180 | Unid | 3 | 3 | 75.3/1.95/12.15/2.1 | 1.03743 | no | 12 | 12 | 301.2/7.8/48.6/8.4 | 2.936952 | no | si/si | Cambia |
| Galletitas de agua carrefour | 181 | Unid | 3 | 3 | 61.01/1.49/10.96/1.24 | 1.127101 | no | 12 | 12 | 244.02/5.98/43.82/4.98 | 2.386438 | no | si/si | Cambia |
| Galletitas de agua clasicas | 182 | Unid | 3 | 3 | 66.53/1.69/10.46/1.99 | 1.115077 | no | 12 | 12 | 266.13/6.77/41.83/7.97 | 2.012051 | no | si/si | Cambia |
| Galletitas de agua mediatarde | 183 | Unid | 3 | 3 | 49.8/1.24/7.5/1.65 | 1.29494 | no | 12 | 12 | 199.2/4.95/30/6.6 | 1.011326 | no | si/si | Cambia |
| Galletitas de agua sandwich | 184 | Unid | 3 | 3 | 87.9/2.1/13.8/2.7 | 0.95384 | no | 12 | 12 | 351.6/8.4/55.2/10.8 | 4.002544 | normal | si/si | Cambia |
| Galletitas de agua terrabusi | 185 | Unid | 3 | 3 | 78.54/2.04/12.6/2.22 | 1.015152 | no | 12 | 12 | 314.16/8.16/50.4/8.88 | 3.210345 | no | si/si | Cambia |
| Galletitas de agua terrabusi light | 186 | Unid | 3 | 3 | 77.22/1.92/13.2/1.86 | 1.011222 | no | 12 | 12 | 308.88/7.68/52.8/7.44 | 3.682835 | no | si/si | Cambia |
| Galletitas de agua traviata | 187 | Unid | 3 | 3 | 81.9/2.4/12/2.7 | 1.015694 | no | 12 | 12 | 327.6/9.6/48/10.8 | 2.753866 | no | si/si | Cambia |
| Galletitas de avena carrefour | 188 | Unid | 3 | 3 | 175.53/2.77/25.74/6.83 | 0.805881 | no | 12 | 6 | 351.05/5.54/51.48/13.66 | 3.224677 | normal | si/si | Cambia |
| Galletitas de salvado (Bagley) | 191 | Unid | 3 | 3 | 57.31/1.35/7.8/2.3 | 1.245949 | no | 12 | 12 | 229.24/5.4/31.2/9.2 | 0.98159 | no | si/si | Cambia |
| galletitas de salvado granix | 192 | Unid | 3 | 3 | 88.13/2.7/12.75/2.93 | 0.977584 | no | 12 | 12 | 352.5/10.8/51/11.7 | 3.208466 | normal | si/si | Cambia |
| Galletitas de salvado granix sin sal | 193 | Unid | 3 | 3 | 85.73/2.63/12.9/2.63 | 0.986013 | no | 12 | 12 | 342.9/10.5/51.6/10.5 | 3.354245 | no | si/si | Cambia |
| Galletitas granix sin sal | 195 | Unid | 3 | 3 | 80.93/2.63/11.7/2.63 | 1.031115 | no | 12 | 12 | 323.7/10.5/46.8/10.5 | 2.583647 | no | si/si | Cambia |
| Galletitas salvado bagley | 198 | Unid | 3 | 3 | 69.7/1.75/10.5/2.3 | 1.09885 | no | 12 | 12 | 278.8/7/42/9.2 | 1.984936 | no | si/si | Cambia |
| Gomitas mogul | 205 | Unid | 3 | 3 | 21.84/0.21/5.25/0 | 1.529954 | no | 12 | 12 | 87.36/0.84/21/0 | 1.007759 | no | si/no | Cambia |
| Gomitas moras mogul | 206 | Unid | 3 | 3 | 60.9/0.83/14.4/0 | 1.064458 | no | 12 | 12 | 243.6/3.3/57.6/0 | 4.938065 | no | si/no | Cambia |
| Hamburguesa Clasica (Paty) | 213 | Unid | 3 | 1 | 195/15/0/15 | 1.402142 | no | 12 | 1 | 195/15/0/15 | 1.402142 | no | no/no | Sin cambio |
| Hamburguesa de soja (Vegetalex) | 214 | Unid | 3 | 3 | 311.7/33/13.2/14.1 | 0.530359 | no | 12 | 3 | 311.7/33/13.2/14.1 | 0.530359 | no | si/no | Sin cambio |
| Hamburguesa de soja vegetalex | 215 | Unid | 3 | 3 | 306.9/33/12/14.1 | 0.573528 | no | 12 | 3 | 306.9/33/12/14.1 | 0.573528 | no | si/no | Sin cambio |
| Hamburguesas (Swift) | 216 | Unid | 3 | 2 | 278/20/0/22 | 1.214753 | no | 12 | 2 | 278/20/0/22 | 1.214753 | no | si/no | Sin cambio |
| Hamburguesas finitas (Paty) | 217 | Unid | 3 | 2 | 244.8/18/0/19.2 | 1.282713 | no | 12 | 2 | 244.8/18/0/19.2 | 1.282713 | no | si/no | Sin cambio |
| Hamburguesas light (Swift) | 218 | Unid | 3 | 2 | 292/26/2/20 | 1.065829 | no | 12 | 2 | 292/26/2/20 | 1.065829 | no | si/si | Sin cambio |
| Huevos | 224 | Unid | 4 | 4 | 276/24/0/20 | 1.262344 | no | 12 | 5 | 345/30/0/25 | 1.15229 | no | si/no | Cambia |
| Kiwi (mediano) | 240 | Unid | 3 | 3 | 127.2/2.37/27/1.08 | 1.107183 | no | 12 | 8 | 339.2/6.32/72/2.88 | 8.320459 | no | si/si | Cambia |
| Mandarina chica | 277 | Unid | 3 | 3 | 121.53/1.83/27/0.69 | 1.125797 | no | 12 | 8 | 324.08/4.88/72/1.84 | 8.36827 | no | si/si | Cambia |
| Mandarina grande | 278 | Unid | 3 | 3 | 189.63/2.91/42/1.11 | 2.329953 | no | 12 | 5 | 316.05/4.85/70/1.85 | 7.812622 | no | si/si | Cambia |
| Mandarina mediana | 279 | Unid | 3 | 3 | 140.01/2.13/31.05/0.81 | 1.331526 | no | 12 | 7 | 326.69/4.97/72.45/1.89 | 8.493818 | no | si/si | Cambia |
| Manzana chica | 288 | Unid | 3 | 3 | 232.23/1.17/55.2/0.75 | 4.423735 | no | 12 | 4 | 309.64/1.56/73.6/1 | 8.867436 | no | si/si | Cambia |
| Manzana grande | 289 | Unid | 3 | 3 | 353.22/1.74/84/1.14 | 12.183291 | normal | 12 | 3 | 353.22/1.74/84/1.14 | 12.183291 | normal | si/si | Sin cambio |
| Manzana mediana | 290 | Unid | 3 | 3 | 285.21/1.41/67.8/0.93 | 7.270083 | no | 12 | 3 | 285.21/1.41/67.8/0.93 | 7.270083 | no | si/si | Sin cambio |
| Maxialfajor jorgelin | 293 | Unid | 3 | 1 | 334.8/4.7/47.5/14 | 2.5686 | no | 12 | 1 | 334.8/4.7/47.5/14 | 2.5686 | no | no/no | Sin cambio |
| Medallon de pollo (Granja del sol) | 295 | Unid | 3 | 1 | 220.5/10.5/21/10.5 | 0.561149 | no | 12 | 1 | 220.5/10.5/21/10.5 | 0.561149 | no | si/no | Sin cambio |
| Medallon de pollo (Granja tres arroyos) | 296 | Unid | 3 | 1 | 185.6/8.4/11/12 | 0.685242 | no | 12 | 1 | 185.6/8.4/11/12 | 0.685242 | no | si/no | Sin cambio |
| Milanesa de soja (Vegetalex) | 329 | Unid | 3 | 1 | 185/9.4/31/2.6 | 1.244692 | no | 12 | 1 | 185/9.4/31/2.6 | 1.244692 | no | si/si | Sin cambio |
| Milka (Te Quiero) | 332 | Cuad | 4 | 4 | 81.84/1.03/9.14/4.57 | 1.066316 | no | 12 | 12 | 245.51/3.08/27.43/13.72 | 0.620375 | no | si/si | Cambia |
| Natural Break | 346 | Unid | 3 | 1 | 190.8/6.2/10/14 | 0.665865 | no | 12 | 1 | 190.8/6.2/10/14 | 0.665865 | no | no/no | Sin cambio |
| Nuggets de pollo fritas (Granja del sol) | 351 | Unid | 3 | 3 | 187.25/9.46/10.46/11.95 | 0.711842 | no | 12 | 5 | 312.08/15.77/17.43/19.92 | 0.273734 | no | si/no | Cambia |
| Operas paquete chico | 357 | Unid | 3 | 1 | 289.9/2.9/38.3/13.9 | 1.406042 | no | 12 | 1 | 289.9/2.9/38.3/13.9 | 1.406042 | no | no/no | Sin cambio |
| Pan artesano bimbo | 363 | Reb | 4 | 4 | 344.45/13.32/64.4/3.73 | 6.286919 | no | 8 | 4 | 344.45/13.32/64.4/3.73 | 6.286919 | no | si/si | Sin cambio |
| Pan con salvado carrefour | 366 | Reb | 4 | 4 | 276.4/10/52.8/2.8 | 3.880911 | no | 8 | 5 | 345.5/12.5/66/3.5 | 6.691451 | no | si/si | Cambia |
| Pan con salvado fargo plus | 367 | Reb | 4 | 4 | 236.8/10.2/40/4 | 1.964736 | no | 8 | 6 | 355.2/15.3/60/6 | 5.175805 | normal | si/si | Cambia |
| Pan con salvado Noly | 368 | Reb | 4 | 4 | 228.4/7.6/45/2 | 2.677994 | no | 8 | 6 | 342.6/11.4/67.5/3 | 7.096066 | no | si/si | Cambia |
| Pan de salvado (Fargo) | 371 | Reb | 4 | 4 | 249.6/13.4/40/4 | 1.964736 | no | 8 | 5 | 312/16.75/50/5 | 3.301212 | no | si/si | Cambia |
| Pan de salvado doble fargo | 372 | Reb | 4 | 4 | 239.2/9.4/43.2/3.2 | 2.383485 | no | 8 | 5 | 299/11.75/54/4 | 4.046939 | no | si/si | Cambia |
| Pan doble integral fargo | 373 | Reb | 4 | 4 | 336.4/13.2/59.2/5.2 | 5.036394 | no | 8 | 4 | 336.4/13.2/59.2/5.2 | 5.036394 | no | si/si | Sin cambio |
| Pan lactal | 377 | Reb | 4 | 4 | 247/10.6/48/1.4 | 3.144181 | no | 8 | 5 | 308.75/13.25/60/1.75 | 5.363528 | no | si/si | Cambia |
| Pan lactal bimbo | 378 | Reb | 4 | 4 | 253.8/9.8/46/3.4 | 2.754873 | no | 8 | 5 | 317.25/12.25/57.5/4.25 | 4.720956 | no | si/si | Cambia |
| Pan lactal de salvado carrefour | 379 | Reb | 4 | 4 | 265.2/10/50/2.8 | 3.398321 | no | 8 | 5 | 331.5/12.5/62.5/3.5 | 5.84673 | no | si/si | Cambia |
| Pan lactal noly | 380 | Reb | 4 | 4 | 261/9.4/50/2.6 | 3.407435 | no | 8 | 5 | 326.25/11.75/62.5/3.25 | 5.857922 | no | si/si | Cambia |
| Pan para hamburguesas | 382 | Unid | 3 | 2 | 278/10/49.6/4.4 | 3.26162 | no | 12 | 2 | 278/10/49.6/4.4 | 3.26162 | no | si/si | Sin cambio |
| Pan para hamburguesas fargo | 383 | Unid | 3 | 2 | 270.2/9.2/52.5/2.6 | 3.836305 | no | 12 | 2 | 270.2/9.2/52.5/2.6 | 3.836305 | no | si/si | Sin cambio |
| Pan para panchos | 384 | Unid | 3 | 3 | 262.46/8.51/52.2/2.18 | 3.802455 | no | 12 | 4 | 349.94/11.35/69.6/2.9 | 7.655729 | normal | si/si | Cambia |
| Pan tipo artesano bimbo semillas del campo | 387 | Reban | 4 | 4 | 350.58/14.65/58.61/6.39 | 4.860516 | normal | 8 | 4 | 350.58/14.65/58.61/6.39 | 4.860516 | normal | si/si | Sin cambio |
| Panqueques proteicos A | 389 | Unid | 3 | 1 | 240/21.5/25/6 | 0.815957 | no | 12 | 1 | 240/21.5/25/6 | 0.815957 | no | si/no | Sin cambio |
| Papas fritas (Combo mediano) | 392 | Unid | 3 | 1 | 292/4/33/16 | 0.875682 | no | 12 | 1 | 292/4/33/16 | 0.875682 | no | no/no | Sin cambio |
| Paty | 400 | Unid | 3 | 1 | 191/14/0/15 | 1.402142 | no | 12 | 1 | 191/14/0/15 | 1.402142 | no | no/no | Sin cambio |
| Patynesa (Paty) | 401 | Unid | 3 | 1 | 277/16/15/17 | 0.392292 | no | 12 | 1 | 277/16/15/17 | 0.392292 | no | no/no | Sin cambio |
| Pera chica | 409 | Unid | 3 | 3 | 252.03/1.59/60/0.63 | 5.416577 | no | 12 | 4 | 336.04/2.12/80/0.84 | 10.850958 | no | si/si | Cambia |
| Pera grande | 410 | Unid | 3 | 2 | 263.6/1.66/62.8/0.64 | 6.049026 | no | 12 | 2 | 263.6/1.66/62.8/0.64 | 6.049026 | no | si/si | Sin cambio |
| Pera mediana | 411 | Unid | 3 | 3 | 304.83/1.92/72.6/0.75 | 8.590504 | no | 12 | 3 | 304.83/1.92/72.6/0.75 | 8.590504 | no | si/si | Sin cambio |
| Pizza sibarita (1/4) | 416 | Unid | 3 | 1 | 284/14/30/12 | 0.807661 | no | 12 | 1 | 284/14/30/12 | 0.807661 | no | si/no | Sin cambio |
| Porcion de prepizza | 425 | Porc | 3 | 3 | 257.4/11.4/48.9/1.8 | 3.266293 | no | 6 | 4 | 343.2/15.2/65.2/2.4 | 6.542371 | no | si/si | Cambia |
| Porcion de prepizza | 426 | Porcion | 3 | 3 | 257.4/11.4/48.9/1.8 | 3.266293 | no | 6 | 4 | 343.2/15.2/65.2/2.4 | 6.542371 | no | si/si | Cambia |
| Prepizza (Carrefour) | 430 | Porc | 3 | 2 | 246.2/7.2/48.5/2.6 | 3.16622 | no | 6 | 2 | 246.2/7.2/48.5/2.6 | 3.16622 | no | si/si | Sin cambio |
| Rapiditas clasicas (Bimbo) | 488 | Unid | 3 | 3 | 214.59/6.75/35.76/4.95 | 1.500465 | no | 12 | 4 | 286.12/9/47.68/6.6 | 2.866233 | no | si/si | Cambia |
| Rapiditas integrales (Bimbo) | 489 | Unid | 3 | 3 | 198.75/7.2/30/5.55 | 1.054956 | no | 12 | 5 | 331.25/12/50/9.25 | 3.129923 | no | si/si | Cambia |
| Rapiditas light (Bimbo) | 490 | Unid | 3 | 3 | 207/7.65/36/3.6 | 1.580818 | no | 12 | 5 | 345/12.75/60/6 | 5.175805 | no | si/si | Cambia |
| Rhodesia | 495 | Unid | 3 | 3 | 3.46/0.03/0.41/0.19 | 1.948541 | no | 12 | 12 | 13.83/0.13/1.65/0.75 | 1.799917 | no | si/si | Cambia |
| Salchichas de soja (Vegetalex) | 505 | Unid | 3 | 3 | 79.2/12/7.8/0 | 1.355043 | no | 12 | 12 | 316.8/48/31.2/0 | 1.380171 | no | si/no | Cambia |
| Salchichas Granja Iris | 506 | Unid | 3 | 3 | 120.9/13.5/9.3/3.3 | 1.113966 | no | 12 | 8 | 322.4/36/24.8/8.8 | 0.69801 | no | si/si | Cambia |
| Salchichas La Blanca | 507 | Unid | 3 | 3 | 216.6/8.7/9/16.2 | 0.65069 | no | 12 | 4 | 288.8/11.6/12/21.6 | 0.366955 | no | si/no | Cambia |
| Salchichas Paladini | 508 | Unid | 3 | 3 | 286.5/14.7/9/21.3 | 0.515682 | no | 12 | 3 | 286.5/14.7/9/21.3 | 0.515682 | no | si/no | Sin cambio |
| Salchichas patyvienna | 509 | Unid | 3 | 3 | 243.6/14.7/5.7/18 | 0.811244 | no | 12 | 4 | 324.8/19.6/7.6/24 | 0.539421 | no | si/no | Cambia |
| Salchichas Swift | 510 | Unid | 3 | 3 | 256.8/10.2/10.8/19.2 | 0.476678 | no | 12 | 4 | 342.4/13.6/14.4/25.6 | 0.205541 | no | si/no | Cambia |
| Salchichas Vienissima | 511 | Unid | 3 | 3 | 226.5/13.8/5.7/16.5 | 0.853629 | no | 12 | 4 | 302/18.4/7.6/22 | 0.582253 | no | si/no | Cambia |
| Speed 250 Mll | 530 | Unid | 3 | 3 | 336/0/84/0 | 12.238127 | no | 12 | 3 | 336/0/84/0 | 12.238127 | no | no/no | Sin cambio |
| Tapa pascualina la salteña | 535 | Tapa | 3 | 1 | 312.6/6.7/46.7/11 | 2.550913 | no | 6 | 1 | 312.6/6.7/46.7/11 | 2.550913 | no | si/no | Sin cambio |
| Tapas de empanadas (General) | 536 | Unid | 3 | 3 | 319.2/5.4/42/14.4 | 1.804282 | no | 12 | 3 | 319.2/5.4/42/14.4 | 1.804282 | no | si/no | Sin cambio |
| Tapas de empanadas la salteña | 537 | Tapa | 3 | 3 | 258.6/5.4/39/9 | 1.651042 | no | 6 | 4 | 344.8/7.2/52/12 | 3.370952 | no | si/si | Cambia |
| Tosdadas light riera | 545 | Unid | 3 | 3 | 84.96/2.64/18.6/0 | 1.001315 | no | 12 | 12 | 339.84/10.56/74.4/0 | 9.150581 | no | si/no | Cambia |
| Tostadas carrefour light | 547 | Unid | 3 | 3 | 108.94/3.45/21.78/0.89 | 0.97352 | no | 12 | 9 | 326.82/10.35/65.34/2.67 | 6.564433 | no | si/si | Cambia |
| Tostadas clasicas carrefour | 549 | Unid | 3 | 3 | 105.12/3/19.5/1.68 | 0.919835 | no | 12 | 10 | 350.4/10/65/5.6 | 6.35232 | normal | si/si | Cambia |
| Tostadas clasicas criollitas | 550 | Unid | 3 | 3 | 120.58/3.47/21.78/2.18 | 0.91309 | no | 12 | 8 | 321.55/9.24/58.08/5.81 | 4.774143 | no | si/si | Cambia |
| Tostadas de arroz aireadas carrefour | 553 | Unid | 3 | 3 | 62.4/1.2/14.4/0 | 1.064458 | no | 12 | 12 | 249.6/4.8/57.6/0 | 4.938065 | no | si/no | Cambia |
| Tostadas de arroz apostoles | 554 | Unid | 3 | 3 | 106.79/1.6/23.98/0.5 | 1.034482 | no | 12 | 10 | 355.98/5.33/79.92/1.67 | 10.785888 | normal | si/si | Cambia |
| Tostadas de arroz carilo | 555 | Unid | 3 | 3 | 81/1.5/18.75/0 | 1.000812 | no | 12 | 12 | 324/6/75/0 | 9.329056 | no | si/no | Cambia |
| Tostadas de arroz carrefour (Sin gluten) | 557 | Unid | 3 | 3 | 91.2/1.8/21/0 | 1.007759 | no | 12 | 11 | 334.4/6.6/77/0 | 9.937931 | no | no/no | Cambia |
| Tostadas de arroz cerealitas | 558 | Unid | 3 | 3 | 87/1.95/19.8/0 | 1.000671 | no | 12 | 12 | 348/7.8/79.2/0 | 10.6325 | no | no/no | Cambia |
| Tostadas de arroz riera | 559 | Unid | 3 | 3 | 91.2/1.8/21/0 | 1.007759 | no | 12 | 11 | 334.4/6.6/77/0 | 9.937931 | no | no/no | Cambia |
| Tostadas de arroz Risky Dit | 560 | Unid | 3 | 3 | 83.32/1.58/18.75/0.22 | 0.989867 | no | 12 | 12 | 333.3/6.3/75/0.9 | 9.285635 | no | si/si | Cambia |
| Tostadas de mesa | 561 | Unid | 3 | 3 | 117.91/3.47/21.78/1.88 | 0.92686 | no | 12 | 9 | 353.73/10.4/65.34/5.64 | 6.434248 | normal | si/si | Cambia |
| Tostadas de mesa riera | 563 | Unid | 3 | 3 | 105.63/3.27/19.8/1.49 | 0.929544 | no | 12 | 10 | 352.11/10.89/66/4.95 | 6.628008 | normal | si/si | Cambia |
| Tostadas de salvado criollitas | 564 | Unid | 3 | 3 | 101.6/3.45/19.5/1.09 | 0.947691 | no | 12 | 10 | 338.67/11.5/65/3.63 | 6.437601 | no | si/si | Cambia |
| Tostadas dulces carrefour | 566 | Unid | 3 | 3 | 119.4/3/22.8/1.8 | 0.947009 | no | 12 | 8 | 318.4/8/60.8/4.8 | 5.403174 | no | si/si | Cambia |
| Tostadas dulces criollitas | 567 | Unid | 3 | 3 | 120.6/3.6/22.5/1.8 | 0.941613 | no | 12 | 8 | 321.6/9.6/60/4.8 | 5.226632 | no | si/si | Cambia |
| Tostadas dulces riera | 568 | Unid | 3 | 3 | 105.33/2.97/21/1.05 | 0.957195 | no | 12 | 10 | 351.1/9.9/70/3.5 | 7.737385 | normal | si/si | Cambia |
| Tostadas gruesas clasicas carrefour | 569 | Unid | 3 | 3 | 56.3/1.68/10.56/0.82 | 1.165664 | no | 12 | 12 | 225.22/6.72/42.24/3.26 | 2.259891 | no | si/si | Cambia |
| Tostadas integrales riera | 570 | Unid | 3 | 3 | 97.77/2.97/18.3/1.41 | 0.935087 | no | 12 | 10 | 325.9/9.9/61/4.7 | 5.452159 | no | si/si | Cambia |
| Tostadas light criollitas | 571 | Unid | 3 | 3 | 116.49/3.45/22.77/1.29 | 0.970389 | no | 12 | 9 | 349.47/10.35/68.31/3.87 | 7.268571 | normal | si/si | Cambia |
| Tostadas light riera | 572 | Unid | 3 | 3 | 85.2/3/18.3/0 | 1.002685 | no | 12 | 12 | 340.8/12/73.2/0 | 8.799431 | no | si/no | Cambia |
| Tostadas sin sal agregada carrefour | 573 | Unid | 3 | 3 | 88.98/2.63/16.65/1.32 | 0.955499 | no | 12 | 12 | 355.92/10.5/66.6/5.28 | 6.765332 | normal | si/si | Cambia |
| Tostaditas "Tosti" | 575 | Unid | 3 | 3 | 71.46/2.1/13.2/1.14 | 1.045059 | no | 12 | 12 | 285.84/8.4/52.8/4.56 | 3.802763 | no | si/si | Cambia |
| Tostaditas de arroz molino ala | 576 | Unid | 3 | 3 | 24.24/0.68/5.38/0 | 1.520043 | no | 12 | 12 | 96.97/2.71/21.53/0 | 1.013326 | no | si/no | Cambia |
| Tostaditas de arroz Molinos ala | 577 | Unid | 3 | 3 | 24.24/0.68/5.38/0 | 1.520043 | no | 12 | 12 | 96.97/2.71/21.53/0 | 1.013326 | no | si/no | Cambia |
| Tostaditas de arroz sin sal | 578 | Unid | 3 | 3 | 11.01/0.08/2.67/0 | 1.742187 | no | 12 | 12 | 44.04/0.32/10.69/0 | 1.198925 | no | si/si | Cambia |
| Triple Hamburguesa con queso | 580 | Unid | 3 | — | 0/0/0/0 | — | no | 12 | — | 0/0/0/0 | — | no | no/no | Sin cambio |
| Turron arcor | 581 | Unid | 3 | 3 | 290.4/5.1/54/6 | 3.961276 | no | 12 | 3 | 290.4/5.1/54/6 | 3.961276 | no | si/si | Sin cambio |
| Turron arcor con fibra | 582 | Unid | 3 | 3 | 242.4/5.1/42/6 | 2.112099 | no | 12 | 4 | 323.2/6.8/56/8 | 4.263738 | no | si/si | Cambia |
| Turron con fibra (Arcor) | 583 | Unid | 3 | 3 | 242.4/5.1/42/6 | 2.112099 | no | 12 | 4 | 323.2/6.8/56/8 | 4.263738 | no | si/si | Cambia |
| Vainillas (pozo) | 585 | Unid | 3 | 3 | 137.48/3.3/25.5/2.47 | 0.98611 | no | 12 | 7 | 320.78/7.7/59.5/5.78 | 5.076611 | no | si/si | Cambia |
| veggies quinoa y espinaca | 586 | Unid | 3 | 2 | 302.6/14/54/3.4 | 4.073566 | no | 12 | 2 | 302.6/14/54/3.4 | 4.073566 | no | si/si | Sin cambio |
| Yogurisimo firme la serenisima (190 grs) | 593 | Pote | 2 | 2 | 301.2/14.2/44/7.6 | 2.301498 | no | 4 | 2 | 301.2/14.2/44/7.6 | 2.301498 | no | si/si | Sin cambio |

Resultado agregado: 106 de 178 cambian su cantidad, estado de zona o score al ampliar el máximo; 72 no cambian. El diagnóstico no propone copiar máximos ampliados: en varios alimentos densos el techo calórico ya decide y en otros el score aislado puede empeorar. Sí demuestra que el valor tiene impacto funcional y debe validarse por semántica de producto.

## 13. Cambios implementados

Backend:

- `servicio/alimentos.js`: aliases estructurales, catálogo autoritativo, fuente de constraints, `Grs`, deduplicación canónico/legacy y metadata sólo para Tracking.
- `menu2.js`: policy explícita Tracking, zona/techo/proteína alcanzable/balance C/G, constraints efectivas, warning semántico e ID preservado.
- `servicio/foodLogs.js`: fuerza `tracking_remaining_v2` sólo en el endpoint Tracking.
- Tests: caso real, max=40, oracle, fuzz, contratos de unidad, Admin/Coach, selectedOnly, fixedFoods, mínimos/máximos/steps y deduplicación.

Frontend:

- `trackingQuantityDrafts.js`: macros exactos por unidad/gramo y borradores aislados por fecha/comida.
- `ManualCompletionTracking.jsx`: rango, step, zona y warning legible cuando el máximo limita.
- `AdminAlimentos.jsx` + `nutricion.css`: sugerida/rango/paso sin rediseñar la pantalla.
- Se preservaron `TrackingDiario.jsx` y `trackingDiario.css`; los cambios de esta auditoría son acotados a la feature.

## 14. Validaciones y estado de Git

Validaciones ejecutadas:

| Validación | Resultado |
|---|---|
| Backend completo | 141/141 tests pasan |
| Casos real/max40/oracle/fuzz | pasan; 120 casos fuzz deterministas incluidos |
| Contratos unidad/huevo/fruta/feta/scoop/cucharada/otro fruto seco | pasan |
| Admin/Coach/Tracking/selectedOnly/fixedFoods/min/max/steps | pasan |
| `node --check` backend modificado y tests nuevos | pasa |
| Frontend completo | 64/64 tests pasan |
| Build Vite de producción | pasa, 1918 módulos |
| ESLint puntual de los cinco JS/JSX tocados en la feature | pasa sin findings |
| ESLint global | falla por deuda ajena: `AdminNavBar.jsx` (1), `MobileMenu.jsx` (2), `Perfil.jsx` (3 warnings) |
| `git diff --check` ambos repos | pasa; sólo avisos de futura conversión LF/CRLF |
| Whitespace de los tres archivos backend no trackeados | pasa |
| Auditoría estática responsive/accesibilidad | pasa: acciones 44 px, safe areas, wrapping, foco/Escape, labels y overflow contenido |
| Prueba visual autenticada en dispositivos reales | no ejecutada; riesgo pendiente explícito |

La comparación JSX/CSS encontró 144 clases `td-*` definidas y ningún selector huérfano respecto de los dos componentes auditados. Los nueve tokens sin regla eran IDs ARIA (`*-title`, `td-meal-menu`), no clases, y la variable CSS `--td-progress`. Los usos de `color-mix()` tienen declaraciones fallback inmediatamente anteriores. Las repeticiones de selectores pertenecen a media queries y al bloque de overrides 2026, no a reglas idénticas desconectadas.

Estado backend:

- Modificados: `menu2.js`, `servicio/alimentos.js`, `servicio/foodLogs.js`, `tests/manualDayCompletion.test.js`, `tests/trackingQuantityEngine.test.js`.
- Nuevos/no trackeados: `AUDITORIA_CANTIDADES_ESTRUCTURAL.md`, `tests/foodQuantityContract.test.js`, `tests/trackingOptimizationPolicy.test.js`.

Estado frontend:

- Modificados: `src/admin/AdminAlimentos.jsx`, `src/entrenado/TrackingDiario.jsx`, `src/entrenado/trackingDiario.css`, `src/nutricion/nutricion.css`, `src/tracking/ManualCompletionTracking.jsx`, `src/tracking/trackingQuantityDrafts.js`, `src/tracking/trackingQuantityDrafts.test.js`.

No se ejecutó `git add`, commit ni push. No se modificó `fooddatabase2`.

## 15. Decisión

Almendras se mantiene en `porcionMax=3` porque ése es el contrato vigente. No hay evidencia para reinterpretarlo como sugerida, base o serving, pero tampoco documentación de producto que justifique tres unidades como techo nutricional. Debe revisarse `_id=6619bfeb147cd50b64677696`, junto con los seis casos prioritarios restantes y la plantilla de 154 registros `Unid`.

“El máximo 3 representa: máximo absoluto.”

“La propuesta 100 g de arroz + 2 almendras es correcta bajo las restricciones actuales: sí.”

“La policy nueva funciona correctamente cuando las restricciones permiten una mejor distribución: sí.”

“Hace falta cambiar fooddatabase2: requiere decisión de producto.”

“Admin y Coach conservaron su comportamiento: sí, en policy y contrato; sus cantidades inválidas por defaults se corrigieron para respetar catálogo.”

“Quedó algo sin validar: sí, la intención nutricional/producto de los máximos sospechosos y una prueba visual autenticada en dispositivos reales.”

“Existen otros alimentos con el mismo patrón que Almendras: sí.”

“Alimentos afectados o sospechosos: los 178 enumerados en la tabla diagnóstica; prioridad alta para Almendras, Rhodesia, Filet de merluza, Gomitas Mogul y las tres Tostaditas de arroz listadas.”

“El problema es de normalización, datos, producto o una combinación: combinación de normalización confirmada y datos/producto pendientes de decisión.”

“Se modificaron datos productivos: no.”

“Se requieren decisiones adicionales de producto: sí; definir máximos intencionales para la plantilla discreta y aprobar correcciones registro por registro.”
