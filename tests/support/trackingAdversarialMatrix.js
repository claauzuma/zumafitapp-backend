import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { isDeepStrictEqual } from "node:util";

import ServicioAlimentos from "../../servicio/alimentos.js";
import { TRACKING_OPTIMIZATION_POLICY } from "../../menu2.js";

export const MATRIX_SEED = 0x72a91f4d;
export const MATRIX_SEED_HEX = "0x72A91F4D";
export const SNAPSHOT_CAPTURE_DATE = "2026-07-26";
export const ACTIVE_CANONICAL_COUNT_AT_CAPTURE = 537;
export const EPSILON = 1e-6;
export const ORACLE_LIMIT = 250000;

const SNAPSHOT_ROWS = [
  ["6619bfeb147cd50b64677809", 404, "Pechuga de pollo", "Grs", 1.105, 0.22, 0, 0.025, 80, 250, 150, 10, "Proteínas"],
  ["6619bfeb147cd50b64677785", 272, "Lubina", "Grs", 0.837, 0.18, 0, 0.013, 80, 250, 150, 10, "Proteínas"],
  ["6619bfeb147cd50b64677766", 241, "Langostinos", "Grs", 0.677, 0.14, 0, 0.013, 80, 250, 150, 10, "Proteínas"],
  ["6619bfeb147cd50b64677883", 519, "Seitan", "Grs", 1.22, 0.24, 0.02, 0.02, 80, 250, 150, 10, "Proteínas"],
  ["6619bfeb147cd50b64677783", 270, "Lomo de cerdo magro", "Grs", 1.2, 0.21, 0, 0.04, 80, 250, 150, 10, "Proteínas"],
  ["6619bfeb147cd50b64677761", 236, "Jamon tapalque", "Grs", 0.825, 0.15, 0, 0.025, 20, 100, 50, 5, "Fiambres"],
  ["6619bfeb147cd50b646778cb", 589, "Whey protein Isolate", "Grs", 3.842, 0.91, 0.01, 0.018, 80, 250, 150, 10, "Proteínas"],
  ["6619bfeb147cd50b6467786b", 497, "Ricota magra", "Grs", 1.08, 0.12, 0.06, 0.04, 10, 200, 50, 5, "Otros"],
  ["6619bfeb147cd50b646776a4", 47, "Atun en lomitos al natural", "Pote", 120, 30, 0, 0, 1, 2, 1, 1, "Proteínas"],
  ["6619bfeb147cd50b646776e8", 115, "Claras de huevos", "Unid", 15.7, 3.5, 0.2, 0.1, 1, 8, 3, 1, "Proteínas"],
  ["6619bfeb147cd50b6467775b", 230, "Jamon cocido feteado", "Fetas", 18.2, 3.2, 0, 0.6, 1, 6, 2, 1, "Fiambres"],
  ["6619bfeb147cd50b6467771a", 165, "Filet de merluza", "Unid", 1.29, 0.21, 0, 0.05, 1, 3, 1, 1, "Proteínas"],
  ["6619bfeb147cd50b6467769c", 39, "Arroz", "Grs", 3.385, 0.08, 0.755, 0.005, 30, 120, 70, 5, "Carbohidratos"],
  ["6619bfeb147cd50b646776a6", 49, "Avena instantanea", "Grs", 3.52, 0.13, 0.57, 0.08, 30, 120, 70, 5, "Carbohidratos"],
  ["6619bfeb147cd50b646777fc", 391, "Papas", "Grs", 0.963, 0.017, 0.19, 0.015, 80, 350, 200, 10, "Carbohidratos"],
  ["6619bfeb147cd50b64677891", 533, "Tallarines al huevo (Coto)", "Grs", 3.593, 0.11, 0.75, 0.017, 80, 250, 150, 10, "Proteínas"],
  ["6619bfeb147cd50b6467787f", 515, "Sandia", "Grs", 0.306, 0.006, 0.066, 0.002, 80, 250, 150, 10, "Frutas"],
  ["6619bfeb147cd50b646776a7", 50, "Azucar", "Grs", 4, 0, 1, 0, 5, 40, 15, 5, "Carbohidratos"],
  ["6619bfeb147cd50b646776fb", 134, "Dextrosa", "Grs", 3.6, 0, 0.9, 0, 5, 40, 15, 5, "Carbohidratos"],
  ["6619bfeb147cd50b64677703", 142, "Dulce de leche estilo colonial (La serenisima)", "Grs", 3.175, 0.075, 0.55, 0.075, 100, 300, 200, 25, "Lácteos"],
  ["6619bfeb147cd50b646778d3", 597, "Yogurt descremado bebible Ilolay", "Grs", 0.348, 0.037, 0.05, 0, 30, 150, 70, 5, "Carbohidratos"],
  ["6619bfeb147cd50b646776ab", 54, "Banana mediana", "Unid", 105.87, 1.29, 24.3, 0.39, 1, 3, 1, 1, "Frutas"],
  ["6619bfeb147cd50b64677797", 290, "Manzana mediana", "Unid", 95.07, 0.47, 22.6, 0.31, 1, 3, 1, 1, "Frutas"],
  ["6619bfeb147cd50b6467778c", 279, "Mandarina mediana", "Unid", 46.67, 0.71, 10.35, 0.27, 1, 3, 1, 1, "Frutas"],
  ["6619bfeb147cd50b646777f3", 382, "Pan para hamburguesas", "Unid", 139, 5, 24.8, 2.2, 1, 3, 1, 1, "Carbohidratos"],
  ["6619bfeb147cd50b64677742", 205, "Gomitas mogul", "Unid", 7.28, 0.07, 1.75, 0, 1, 3, 1, 1, "Snacks"],
  ["6619bfeb147cd50b646778c0", 578, "Tostaditas de arroz sin sal", "Unid", 3.6696, 0.0264, 0.891, 0, 1, 3, 1, 1, "Carbohidratos"],
  ["6619bfeb147cd50b646778cf", 593, "Yogurisimo firme la serenisima (190 grs)", "Pote", 150.6, 7.1, 22, 3.8, 1, 2, 1, 1, "Carbohidratos"],
  ["6619bfeb147cd50b64677677", 2, "Aceite de oliva", "Grs", 8.991, 0, 0, 0.999, 5, 30, 10, 5, "Grasas"],
  ["6619bfeb147cd50b646777de", 361, "Palta", "Grs", 1.598, 0.02, 0.042, 0.15, 5, 30, 10, 5, "Grasas"],
  ["6619bfeb147cd50b6467778f", 282, "Mani", "Grs", 5.968, 0.28, 0.042, 0.52, 5, 30, 10, 5, "Grasas"],
  ["6619bfeb147cd50b646777d1", 349, "Nueces peladas", "Grs", 6.568, 0.15, 0.025, 0.652, 5, 30, 10, 5, "Grasas"],
  ["6619bfeb147cd50b646777f9", 388, "Panceta", "Grs", 4.8, 0.12, 0, 0.48, 5, 30, 10, 5, "Grasas"],
  ["6619bfeb147cd50b64677803", 398, "Pasta de mani", "Grs", 5.83, 0.23, 0.17, 0.47, 5, 30, 10, 5, "Grasas"],
  ["6619bfeb147cd50b6467782e", 441, "Queso crema", "Grs", 2.46, 0.06, 0.06, 0.22, 20, 80, 40, 5, "Lácteos"],
  ["6619bfeb147cd50b64677841", 455, "Queso cremon doble crema", "Grs", 3.57, 0.14, 0.01, 0.33, 20, 80, 40, 5, "Lácteos"],
  ["6619bfeb147cd50b64677696", 34, "Almendras", "Unid", 7.15, 0.26, 0.155, 0.61, 1, 3, 1, 1, "Grasas"],
  ["6619bfeb147cd50b64677755", 224, "Huevos", "Unid", 69, 6, 0, 5, 1, 4, 2, 1, "Grasas"],
  ["6619bfeb147cd50b6467784d", 467, "Queso danbo carrefour", "Fetas", 69.4, 5.2, 0, 5.4, 1, 6, 2, 1, "Lácteos"],
  ["6619bfeb147cd50b64677879", 511, "Salchichas Vienissima", "Unid", 75.5, 4.6, 1.9, 5.5, 1, 3, 1, 1, "Grasas"],
  ["6619bfeb147cd50b646776a3", 46, "Atun en lomitos al aceite", "Pote", 246, 30, 0, 14, 1, 2, 1, 1, "Grasas"],
  ["6619bfeb147cd50b646776df", 106, "Chocolate aguila semiamargo", "Barra", 103.1, 1.3, 13, 5.1, 1, 4, 1, 1, "Snacks"],
];

function snapshotFromRow(row) {
  const [
    sourceObjectId,
    alimentoId,
    nombre,
    unidadBase,
    kcalUnidad,
    proteinaUnidad,
    carbohidratosUnidad,
    grasasUnidad,
    porcionMin,
    porcionMax,
    porcionSugerida,
    multiplo,
    categoria,
  ] = row;
  return Object.freeze({
    sourceObjectId,
    _id: sourceObjectId,
    alimentoId,
    nombre,
    nombreKey: nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(),
    unidadBase,
    macroBasis: "perUnit",
    cantidadUnidad: 1,
    kcalUnidad,
    proteinaUnidad,
    carbohidratosUnidad,
    grasasUnidad,
    porcionMin,
    porcionMax,
    porcionSugerida,
    multiplo,
    categoriaZumaFit: categoria,
    activo: true,
  });
}

export const REAL_FOOD_SNAPSHOTS = Object.freeze(SNAPSHOT_ROWS.map(snapshotFromRow));
export const SNAPSHOT_BY_ID = new Map(
  REAL_FOOD_SNAPSHOTS.map((food) => [food.alimentoId, food])
);
export const SNAPSHOT_SHA256 = createHash("sha256")
  .update(JSON.stringify(REAL_FOOD_SNAPSHOTS))
  .digest("hex");

export const FIXED_TARGETS = Object.freeze([
  { id: 1, label: "Pequeña y consistente", kcal: 250, proteina: 25, carbs: 15, grasas: 10, consistency: "exacta", macroKcal: 250 },
  { id: 2, label: "Comida liviana", kcal: 350, proteina: 30, carbs: 35, grasas: 10, consistency: "exacta", macroKcal: 350 },
  { id: 3, label: "Comida media", kcal: 450, proteina: 40, carbs: 45, grasas: 12, consistency: "aproximada", macroKcal: 448 },
  { id: 4, label: "Comida normal", kcal: 500, proteina: 45, carbs: 55, grasas: 11, consistency: "aproximada", macroKcal: 499 },
  { id: 5, label: "Comida alta", kcal: 600, proteina: 50, carbs: 70, grasas: 13, consistency: "aproximada", macroKcal: 597 },
  { id: 6, label: "Comida grande con leve inconsistencia", kcal: 700, proteina: 55, carbs: 80, grasas: 18, consistency: "leve_inconsistencia", macroKcal: 702 },
  { id: 7, label: "Objetivo alto", kcal: 800, proteina: 60, carbs: 90, grasas: 22, consistency: "aproximada", macroKcal: 798 },
  { id: 8, label: "Objetivo muy alto", kcal: 1000, proteina: 80, carbs: 110, grasas: 27, consistency: "leve_inconsistencia", macroKcal: 1003 },
  { id: 9, label: "Caso real incompatible", kcal: 356, proteina: 0, carbs: 19.3, grasas: 41, consistency: "fuertemente_incompatible", macroKcal: 446.2 },
]);

export const PROFILE_DESCRIPTIONS = Object.freeze({
  A: "Sólo alimentos predominantemente proteicos por aporte energético.",
  B: "Sólo alimentos predominantemente de carbohidratos por aporte energético.",
  C: "Sólo alimentos predominantemente grasos por aporte energético.",
  D: "Proteína + carbohidratos, sin fuente predominantemente grasa.",
  E: "Proteína + grasas, sin fuente predominantemente de carbohidratos.",
  F: "Carbohidratos + grasas, sin fuente predominantemente proteica.",
  G: "Mezcla completa con al menos una fuente estructural de cada macro.",
  H: "Mezcla discreta: unidad, feta, porción, rebanada, barra o pote.",
  I: "Registrado + Manual/Fijo + Auto; sólo los Auto se optimizan.",
});

const BASE_BLUEPRINTS = [
  ["F001", "A", 1, "incompleta", [404]],
  ["F002", "A", 2, "incompleta", [404, 272]],
  ["F003", "A", 3, "absurda", [589, 165, 230]],
  ["F004", "A", 4, "incompleta", [404, 272, 241, 519]],
  ["F005", "A", 5, "absurda", [589, 165, 230, 47, 115]],
  ["F006", "B", 6, "incompleta", [39, 49, 391, 515, 597, 54]],
  ["F007", "B", 7, "incompleta", [39]],
  ["F008", "B", 8, "absurda", [50, 134]],
  ["F009", "B", 9, "incompleta", [39, 49, 391]],
  ["F010", "B", 1, "absurda", [578, 205, 50, 134]],
  ["F011", "C", 2, "incompleta", [2, 361, 282, 349, 388]],
  ["F012", "C", 3, "absurda", [2, 388, 441, 455, 511, 34]],
  ["F013", "C", 4, "incompleta", [2]],
  ["F014", "C", 5, "incompleta", [282, 349]],
  ["F015", "C", 6, "absurda", [388, 441, 511]],
  ["F016", "D", 7, "incompleta", [404, 39, 272, 49]],
  ["F017", "D", 8, "incompleta", [404, 39, 272, 49, 241]],
  ["F018", "D", 9, "absurda", [165, 578, 115, 205, 230, 50]],
  ["F019", "D", 1, "incompleta", [597]],
  ["F020", "D", 2, "absurda", [589, 50]],
  ["F021", "E", 3, "incompleta", [404, 2, 224]],
  ["F022", "E", 4, "incompleta", [404, 2, 272, 361]],
  ["F023", "E", 5, "absurda", [589, 2, 165, 34, 388]],
  ["F024", "E", 6, "incompleta", [404, 2, 272, 361, 241, 282]],
  ["F025", "E", 7, "incompleta", [46]],
  ["F026", "F", 8, "incompleta", [39, 2, 49]],
  ["F027", "F", 9, "incompleta", [39, 34]],
  ["F028", "F", 1, "absurda", [578, 34, 205, 361]],
  ["F029", "F", 2, "absurda", [50, 2, 134, 388, 205]],
  ["F030", "F", 3, "incompleta", [39, 2, 49, 361, 391, 282]],
  ["F031", "G", 4, "apropiada", [404, 39, 2]],
  ["F032", "G", 5, "apropiada", [404, 39, 2, 54]],
  ["F033", "G", 6, "absurda", [165, 50, 2, 205, 224]],
  ["F034", "G", 7, "apropiada", [404, 39, 2, 272, 49, 361]],
  ["F035", "G", 8, "apropiada", [404, 39, 2]],
  ["F036", "G", 9, "absurda", [165, 39, 34, 2]],
  ["F037", "G", 1, "apropiada", [115, 54, 34, 230, 279]],
  ["F038", "G", 2, "apropiada", [115, 54, 34, 230, 279, 224]],
  ["F039", "H", 3, "apropiada", [47, 54]],
  ["F040", "H", 4, "absurda", [165, 578]],
  ["F041", "H", 5, "absurda", [205, 34]],
  ["F042", "H", 6, "absurda", [106, 511, 382]],
  ["F043", "I", 7, "apropiada", [115, 39, 404, 2], 115, 39],
  ["F044", "I", 8, "apropiada", [54, 404, 39, 2, 272], 54, 404],
  ["F045", "I", 9, "apropiada", [115, 39, 34, 165, 205, 361], 115, 39],
];

const HIGHLIGHT_BLUEPRINTS = [
  ["X001", "A", 7, "incompleta", [404], null, null, "Un proteico con meta alta en carbohidratos"],
  ["X002", "B", 8, "incompleta", [39, 49], null, null, "Sólo carbohidratos con meta alta en proteína"],
  ["X003", "C", 5, "incompleta", [2, 282, 349], null, null, "Sólo grasas con meta alta en proteína"],
  ["X004", "D", 4, "incompleta", [404, 39, 272], null, null, "Proteína + carbohidratos sin fuente grasa"],
  ["X005", "E", 5, "incompleta", [404, 2, 224], null, null, "Proteína + grasas sin fuente de carbohidratos"],
  ["X006", "F", 4, "incompleta", [39, 2, 49], null, null, "Carbohidratos + grasas sin fuente proteica"],
  ["X007", "G", 4, "apropiada", [404, 39, 2], null, null, "Mezcla completa con objetivo alcanzable"],
  ["X008", "H", 3, "absurda", [47, 54], null, null, "Unidades con zona calórica imposible"],
  ["X009", "F", 9, "incompleta", [39, 34], null, null, "Meta incompatible: arroz + almendras"],
];

function freezeBlueprint(row, highlighted = false) {
  const [id, profile, targetId, combinationKind, foodIds, registeredId, fixedId, highlight] = row;
  return Object.freeze({
    id,
    profile,
    targetId,
    combinationKind,
    foodIds: Object.freeze([...foodIds]),
    registeredId: registeredId || null,
    fixedId: fixedId || null,
    highlighted,
    highlight: highlight || "",
  });
}

export const FIXED_BLUEPRINTS = Object.freeze([
  ...BASE_BLUEPRINTS.map((row) => freezeBlueprint(row, false)),
  ...HIGHLIGHT_BLUEPRINTS.map((row) => freezeBlueprint(row, true)),
]);

const PROTEIN_IDS = Object.freeze([404, 272, 241, 519, 270, 236, 589, 497, 47, 115, 230, 165]);
const CARB_IDS = Object.freeze([39, 49, 391, 533, 515, 50, 134, 142, 597, 54, 290, 279, 382, 205, 578, 593]);
const FAT_IDS = Object.freeze([2, 361, 282, 349, 388, 398, 441, 455, 34, 224, 467, 511, 46]);
const DISCRETE_IDS = Object.freeze(
  REAL_FOOD_SNAPSHOTS
    .filter((food) => !["grs", "g", "gr", "gramos", "gramo", "ml"].includes(food.unidadBase.toLowerCase()))
    .map((food) => food.alimentoId)
);
const ABSURD_IDS = new Set([589, 165, 50, 134, 205, 578, 388, 106, 511]);

function round(value, digits = 6) {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function sumTotals(...totalsList) {
  return totalsList.reduce((total, value) => ({
    calorias: total.calorias + Number(value?.calorias || 0),
    proteina: total.proteina + Number(value?.proteina || 0),
    carbohidratos: total.carbohidratos + Number(value?.carbohidratos || 0),
    grasas: total.grasas + Number(value?.grasas || 0),
  }), { calorias: 0, proteina: 0, carbohidratos: 0, grasas: 0 });
}

function roundedTotals(totals, digits = 6) {
  return {
    calorias: round(totals.calorias, digits),
    proteina: round(totals.proteina, digits),
    carbohidratos: round(totals.carbohidratos, digits),
    grasas: round(totals.grasas, digits),
  };
}

function nutritionFor(food, quantity) {
  return {
    calorias: Number(food.kcalUnidad) * quantity,
    proteina: Number(food.proteinaUnidad) * quantity,
    carbohidratos: Number(food.carbohidratosUnidad) * quantity,
    grasas: Number(food.grasasUnidad) * quantity,
  };
}

function macroEnergy(food) {
  return {
    P: Number(food.proteinaUnidad) * 4,
    C: Number(food.carbohidratosUnidad) * 4,
    G: Number(food.grasasUnidad) * 9,
  };
}

export function structuralRole(food) {
  const energy = macroEnergy(food);
  if (energy.P >= energy.C && energy.P >= energy.G) return "P";
  if (energy.C >= energy.P && energy.C >= energy.G) return "C";
  return "G";
}

function payloadFood(food, extra = {}) {
  const base = Number(food.cantidadUnidad) || 1;
  return {
    foodId: food.alimentoId,
    alimentoId: food.alimentoId,
    name: food.nombre,
    nombre: food.nombre,
    unit: food.unidadBase,
    unidad: food.unidadBase,
    macroBasis: food.macroBasis,
    kcalPerUnitOrGram: Number(food.kcalUnidad) / base,
    proteinPerUnitOrGram: Number(food.proteinaUnidad) / base,
    carbsPerUnitOrGram: Number(food.carbohidratosUnidad) / base,
    fatPerUnitOrGram: Number(food.grasasUnidad) / base,
    categoria: food.categoriaZumaFit,
    minGramos: food.porcionMin,
    maxGramos: food.porcionMax,
    stepGramos: food.multiplo,
    ...extra,
  };
}

function quantityService(catalog = REAL_FOOD_SNAPSHOTS) {
  const service = new ServicioAlimentos("TEST");
  service.model = {
    obtenerAlimentos: async () => catalog,
  };
  return service;
}

function trackingOptions() {
  return {
    redondear: true,
    usarMinMax: true,
    trackingPriority: true,
    trackingOptimizationPolicy: TRACKING_OPTIMIZATION_POLICY,
  };
}

function targetForId(id) {
  const target = FIXED_TARGETS.find((item) => item.id === id);
  assert.ok(target, "Meta fija inexistente: " + id);
  return target;
}

function snapshotForId(id) {
  const food = SNAPSHOT_BY_ID.get(id);
  assert.ok(food, "Snapshot inexistente: " + id);
  return food;
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

function shuffled(values, random) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function pickUnique(pool, count, random, used = new Set()) {
  const available = shuffled(pool.filter((id) => !used.has(id)), random);
  assert.ok(available.length >= count, "Pool insuficiente para selección random");
  const selected = available.slice(0, count);
  selected.forEach((id) => used.add(id));
  return selected;
}

function randomFoodIds(profile, count, random) {
  if (profile === "A") return pickUnique(PROTEIN_IDS, count, random);
  if (profile === "B") return pickUnique(CARB_IDS, count, random);
  if (profile === "C") return pickUnique(FAT_IDS, count, random);
  if (profile === "H") return pickUnique(DISCRETE_IDS, count, random);
  if (profile === "D" && count === 1) return [597];
  if (profile === "E" && count === 1) return [46];
  if (profile === "F" && count === 1) return [106];

  const used = new Set();
  const selected = [];
  const add = (pool, amount = 1) => {
    const ids = pickUnique(pool, amount, random, used);
    selected.push(...ids);
  };

  if (profile === "D") {
    add(PROTEIN_IDS);
    add(CARB_IDS);
    if (count > 2) add([...PROTEIN_IDS, ...CARB_IDS], count - 2);
  } else if (profile === "E") {
    add(PROTEIN_IDS);
    add(FAT_IDS);
    if (count > 2) add([...PROTEIN_IDS, ...FAT_IDS], count - 2);
  } else if (profile === "F") {
    add(CARB_IDS);
    add(FAT_IDS);
    if (count > 2) add([...CARB_IDS, ...FAT_IDS], count - 2);
  } else {
    add(PROTEIN_IDS);
    add(CARB_IDS);
    add(FAT_IDS);
    if (count > 3) add([...PROTEIN_IDS, ...CARB_IDS, ...FAT_IDS], count - 3);
  }
  return shuffled(selected, random);
}

function minimumScenarioCalories(foodIds, registeredId = null, fixedId = null) {
  return foodIds.reduce((total, id) => {
    const food = snapshotForId(id);
    const quantity = id === registeredId || id === fixedId
      ? food.porcionSugerida
      : food.porcionMin;
    return total + nutritionFor(food, quantity).calorias;
  }, 0);
}

function randomTarget(index, tier, minimumCalories, random) {
  const rangeIndex = index % 3;
  const nominalRanges = [
    [180, 400],
    [401, 750],
    [751, 1100],
  ];
  let [lower, upper] = nominalRanges[rangeIndex];
  lower = Math.max(lower, Math.ceil(minimumCalories + 10));
  if (lower > upper) upper = 1100;
  assert.ok(lower <= upper, "No existe meta calórica factible dentro del rango random");
  const kcal = Math.round(lower + random() * (upper - lower));

  let proteinActive = index % 10 !== 0;
  let carbsActive = index % 13 !== 0;
  let fatActive = index % 17 !== 0;
  if (!proteinActive && !carbsActive && !fatActive) carbsActive = true;

  const factor = tier === "consistente"
    ? 0.99 + random() * 0.02
    : tier === "leve"
      ? (random() < 0.5 ? 0.88 : 1.12)
      : (random() < 0.5 ? 0.45 : 1.55);
  const weights = {
    P: proteinActive ? 0.2 + random() * 0.15 : 0,
    C: carbsActive ? 0.35 + random() * 0.2 : 0,
    G: fatActive ? 0.2 + random() * 0.15 : 0,
  };
  const weightTotal = weights.P + weights.C + weights.G;
  const macroCalories = kcal * factor;
  const proteina = proteinActive
    ? Math.min(100, round((macroCalories * weights.P / weightTotal) / 4, 1))
    : 0;
  const carbs = carbsActive
    ? Math.min(150, round((macroCalories * weights.C / weightTotal) / 4, 1))
    : 0;
  const grasas = fatActive
    ? Math.min(60, round((macroCalories * weights.G / weightTotal) / 9, 1))
    : 0;

  return { kcal, proteina, carbs, grasas };
}

function randomTierSchedule(random) {
  return shuffled([
    ...new Array(60).fill("consistente"),
    ...new Array(25).fill("leve"),
    ...new Array(15).fill("fuerte"),
  ], random);
}

export function generateRandomBlueprints() {
  const random = seededRandom(MATRIX_SEED);
  const tiers = randomTierSchedule(random);
  const profiles = Object.keys(PROFILE_DESCRIPTIONS);
  const scenarios = [];

  for (let index = 0; index < 100; index++) {
    const profile = profiles[index % profiles.length];
    let count = 1 + Math.floor(random() * 6);
    if (profile === "G" || profile === "I") count = Math.max(3, count);
    let foodIds;
    let registeredId;
    let fixedId;
    let minimumCalories;
    let selectionAttempts = 0;
    do {
      foodIds = randomFoodIds(profile, count, random);
      registeredId = profile === "I" ? foodIds[0] : null;
      fixedId = profile === "I"
        ? foodIds[1]
        : (count >= 2 && index % 7 === 0 ? foodIds[0] : null);
      minimumCalories = minimumScenarioCalories(foodIds, registeredId, fixedId);
      selectionAttempts += 1;
    } while (minimumCalories > 1090 && selectionAttempts < 100);
    assert.ok(
      minimumCalories <= 1090,
      "No se pudo construir una selección random con un candidato bajo 1100 kcal"
    );
    const target = randomTarget(index, tiers[index], minimumCalories, random);
    const absurdCount = foodIds.filter((id) => ABSURD_IDS.has(id)).length;
    const combinationKind = absurdCount >= Math.min(2, count)
      ? "absurda"
      : ["A", "B", "C", "D", "E", "F"].includes(profile)
        ? "incompleta"
        : "apropiada";
    scenarios.push(Object.freeze({
      id: "R" + String(index + 1).padStart(3, "0"),
      profile,
      combinationKind,
      foodIds: Object.freeze(foodIds),
      registeredId,
      fixedId,
      target: Object.freeze(target),
      plannedConsistency: tiers[index],
      selectionAttempts,
      highlighted: false,
      highlight: "",
    }));
  }
  return Object.freeze(scenarios);
}

export const RANDOM_BLUEPRINTS = generateRandomBlueprints();

export const DIAGNOSTIC_BLUEPRINTS = Object.freeze([
  Object.freeze({
    id: "D001",
    profile: "B",
    combinationKind: "diagnostica_test_only",
    foodIds: Object.freeze([39]),
    targetId: 2,
    registeredId: null,
    fixedId: null,
    constraintOverrides: Object.freeze({ 39: Object.freeze({ multiplo: 2 }) }),
    diagnosticReason: "Step 2 ausente del catálogo activo; clona Arroz y modifica sólo multiplo.",
  }),
  Object.freeze({
    id: "D002",
    profile: "A",
    combinationKind: "diagnostica_test_only",
    foodIds: Object.freeze([404]),
    targetId: 4,
    registeredId: null,
    fixedId: null,
    constraintOverrides: Object.freeze({ 404: Object.freeze({ multiplo: 20 }) }),
    diagnosticReason: "Step 20 ausente; el max real 250 queda deliberadamente no alineado.",
  }),
  Object.freeze({
    id: "D003",
    profile: "B",
    combinationKind: "diagnostica_test_only",
    foodIds: Object.freeze([39]),
    targetId: 2,
    registeredId: null,
    fixedId: null,
    constraintOverrides: Object.freeze({ 39: Object.freeze({ porcionMax: 118 }) }),
    diagnosticReason: "Máximo 118 no alineado con step real 5; prueba el piso efectivo 115.",
  }),
  Object.freeze({
    id: "D004",
    profile: "H",
    combinationKind: "diagnostica_test_only",
    foodIds: Object.freeze([115]),
    targetId: 1,
    registeredId: null,
    fixedId: null,
    constraintOverrides: Object.freeze({ 115: Object.freeze({ multiplo: 2 }) }),
    diagnosticReason: "Step discreto 2 test-only sobre Claras; mínimo 1 se alinea a 2.",
  }),
  Object.freeze({
    id: "D005",
    profile: "C",
    combinationKind: "diagnostica_test_only",
    foodIds: Object.freeze([2]),
    targetId: 1,
    registeredId: null,
    fixedId: null,
    constraintOverrides: Object.freeze({ 2: Object.freeze({ multiplo: 20 }) }),
    diagnosticReason: "Step 20 con min 5/max 30 deja una única cantidad efectiva: 20.",
  }),
  Object.freeze({
    id: "D006",
    profile: "F",
    combinationKind: "diagnostica_test_only",
    foodIds: Object.freeze([39, 34]),
    targetId: 9,
    registeredId: null,
    fixedId: null,
    constraintOverrides: Object.freeze({ 34: Object.freeze({ porcionMax: 40 }) }),
    diagnosticReason: "Control conocido Almendras max 40; nunca se traslada a runtime ni a fooddatabase2.",
  }),
]);

function numericTarget(target) {
  return {
    kcal: Number(target.kcal),
    proteina: Number(target.proteina),
    carbs: Number(target.carbs),
    grasas: Number(target.grasas),
  };
}

function subtractRegisteredTarget(target, registeredTotals) {
  return {
    kcal: round(Math.max(0, target.kcal - registeredTotals.calorias), 6),
    proteina: round(Math.max(0, target.proteina - registeredTotals.proteina), 6),
    carbs: round(Math.max(0, target.carbs - registeredTotals.carbohidratos), 6),
    grasas: round(Math.max(0, target.grasas - registeredTotals.grasas), 6),
  };
}

function scenarioFood(foodId, overrides = {}) {
  const original = snapshotForId(foodId);
  const override = overrides?.[foodId] || overrides?.[String(foodId)] || null;
  return override
    ? Object.freeze({
      ...original,
      ...override,
      diagnosticConstraintOverride: true,
      originalConstraints: Object.freeze({
        porcionMin: original.porcionMin,
        porcionMax: original.porcionMax,
        multiplo: original.multiplo,
      }),
    })
    : original;
}

function scenarioInput(blueprint) {
  const targetSource = blueprint.target || targetForId(blueprint.targetId);
  const target = numericTarget(targetSource);
  const overrides = blueprint.constraintOverrides || {};
  const foods = blueprint.foodIds.map((id) => scenarioFood(id, overrides));
  const byId = new Map(foods.map((food) => [food.alimentoId, food]));
  const registeredFood = blueprint.registeredId ? byId.get(blueprint.registeredId) : null;
  const fixedFood = blueprint.fixedId ? byId.get(blueprint.fixedId) : null;
  assert.ok(!blueprint.registeredId || registeredFood, blueprint.id + ": Registrado fuera de selección");
  assert.ok(!blueprint.fixedId || fixedFood, blueprint.id + ": Fijo fuera de selección");
  if (blueprint.registeredId || blueprint.fixedId) {
    assert.notEqual(blueprint.registeredId, blueprint.fixedId, blueprint.id + ": Registrado y Fijo deben ser distintos");
  }

  const registeredQuantity = registeredFood ? registeredFood.porcionSugerida : 0;
  const fixedQuantity = fixedFood ? fixedFood.porcionSugerida : 0;
  const registeredTotals = registeredFood
    ? nutritionFor(registeredFood, registeredQuantity)
    : sumTotals();
  const engineTarget = subtractRegisteredTarget(target, registeredTotals);
  const fixedFoods = fixedFood
    ? [payloadFood(fixedFood, {
      quantity: fixedQuantity,
      cantidad: fixedQuantity,
      quantitySource: "manual",
      fixedQuantity: true,
    })]
    : [];
  const pendingRows = foods.filter(
    (food) => food.alimentoId !== blueprint.registeredId && food.alimentoId !== blueprint.fixedId
  );
  assert.ok(pendingRows.length >= 1, blueprint.id + ": debe existir al menos un Auto");
  const pendingFoods = pendingRows.map((food) => payloadFood(food, {
    quantitySource: "auto",
    quantityPending: true,
  }));
  const catalogById = new Map(REAL_FOOD_SNAPSHOTS.map((food) => [food.alimentoId, food]));
  foods.forEach((food) => catalogById.set(food.alimentoId, food));

  return {
    blueprint,
    target,
    targetSource,
    engineTarget,
    foods,
    registeredFood,
    registeredQuantity,
    registeredTotals,
    fixedFood,
    fixedQuantity,
    fixedFoods,
    pendingRows,
    pendingFoods,
    catalog: [...catalogById.values()],
    payload: {
      mode: "kcalProteina",
      generationType: "selectedOnly",
      target: engineTarget,
      fixedFoods,
      pendingFoods,
      options: trackingOptions(),
    },
  };
}

function profileValidation(input) {
  const { blueprint, foods, registeredFood, fixedFood, pendingRows } = input;
  const errors = [];
  const roles = new Set(foods.map(structuralRole));
  const aggregateEnergy = foods.reduce((total, food) => {
    const energy = macroEnergy(food);
    return { P: total.P + energy.P, C: total.C + energy.C, G: total.G + energy.G };
  }, { P: 0, C: 0, G: 0 });
  const energyTotal = aggregateEnergy.P + aggregateEnergy.C + aggregateEnergy.G || 1;
  const shares = {
    P: aggregateEnergy.P / energyTotal,
    C: aggregateEnergy.C / energyTotal,
    G: aggregateEnergy.G / energyTotal,
  };

  if (blueprint.profile === "A" && foods.some((food) => structuralRole(food) !== "P")) {
    errors.push("Perfil A contiene un alimento no predominantemente proteico");
  }
  if (blueprint.profile === "B" && foods.some((food) => structuralRole(food) !== "C")) {
    errors.push("Perfil B contiene un alimento no predominantemente de carbohidratos");
  }
  if (blueprint.profile === "C" && foods.some((food) => structuralRole(food) !== "G")) {
    errors.push("Perfil C contiene un alimento no predominantemente graso");
  }
  if (blueprint.profile === "D") {
    if (!(aggregateEnergy.P > 0) || !(aggregateEnergy.C > 0) || shares.G >= Math.max(shares.P, shares.C)) {
      errors.push("Perfil D no conserva mezcla P+C sin predominante graso");
    }
  }
  if (blueprint.profile === "E") {
    if (!(aggregateEnergy.P > 0) || !(aggregateEnergy.G > 0) || shares.C >= Math.max(shares.P, shares.G)) {
      errors.push("Perfil E no conserva mezcla P+G sin predominante de carbohidratos");
    }
  }
  if (blueprint.profile === "F") {
    if (!(aggregateEnergy.C > 0) || !(aggregateEnergy.G > 0) || shares.P >= Math.max(shares.C, shares.G)) {
      errors.push("Perfil F no conserva mezcla C+G sin predominante proteico");
    }
  }
  if (blueprint.profile === "G" && !["P", "C", "G"].every((role) => roles.has(role))) {
    errors.push("Perfil G no contiene las tres fuentes estructurales");
  }
  if (blueprint.profile === "H") {
    const gramUnits = new Set(["g", "gr", "grs", "gramo", "gramos", "ml"]);
    if (foods.some((food) => gramUnits.has(food.unidadBase.toLowerCase()))) {
      errors.push("Perfil H contiene una unidad continua");
    }
  }
  if (blueprint.profile === "I") {
    if (!registeredFood || !fixedFood || pendingRows.length < 1 || pendingRows.length > 5) {
      errors.push("Perfil I no conserva Registrado + Fijo + 1..5 Auto");
    }
  }
  return { errors, roles: [...roles].sort(), shares };
}

function alignedBounds(food) {
  const step = Number(food.multiplo) || 1;
  return {
    step,
    min: Math.ceil((Number(food.porcionMin) - EPSILON) / step) * step,
    max: Math.floor((Number(food.porcionMax) + EPSILON) / step) * step,
  };
}

function optionValues(food) {
  const { min, max, step } = alignedBounds(food);
  const values = [];
  for (let value = min; value <= max + EPSILON; value += step) {
    values.push(round(value, 8));
  }
  return values;
}

function optionSpaceSize(foods) {
  return foods.reduce((size, food) => size * optionValues(food).length, 1);
}

function totalsForQuantities(foods, quantities, fixedTotals = sumTotals()) {
  return foods.reduce(
    (total, food, index) => sumTotals(total, nutritionFor(food, quantities[index])),
    fixedTotals
  );
}

function macroScore(totals, target) {
  const carbScale = target.carbs > 0 ? target.carbs : 25;
  const fatScale = target.grasas > 0 ? target.grasas : 10;
  return ((totals.carbohidratos - target.carbs) / carbScale) ** 2 +
    ((totals.grasas - target.grasas) / fatScale) ** 2;
}

function compareRanks(left, right) {
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const difference = Number(left[index] || 0) - Number(right[index] || 0);
    if (Math.abs(difference) > 1e-8) return difference;
  }
  return 0;
}

function rankCandidate(candidate, target, context) {
  const totals = candidate.totals;
  const calorieExcess = Math.max(0, totals.calorias - target.kcal);
  if (calorieExcess > EPSILON) return [1, calorieExcess, 0, 0, 0, 0, 0];
  const calorieDeficit = Math.max(0, target.kcal - totals.calorias);
  const proteinDeficit = target.proteina > 0
    ? Math.max(0, target.proteina - totals.proteina)
    : 0;
  const proteinExcess = target.proteina > 0
    ? Math.max(0, totals.proteina - target.proteina)
    : 0;
  const secondary = macroScore(totals, target);
  const inZone = totals.calorias >= context.calorieZoneFloor - EPSILON;
  if (!context.hasNormalCalorieZoneCandidate) {
    return [
      0,
      calorieDeficit,
      target.proteina > 0 ? proteinDeficit : 0,
      secondary,
      proteinExcess,
      target.proteina > 0 ? 0 : totals.proteina,
    ];
  }
  if (target.proteina > 0 && context.proteinReachable) {
    return [
      0,
      inZone ? 0 : 1,
      proteinDeficit > 0.05 ? 1 : 0,
      proteinDeficit,
      secondary,
      calorieDeficit,
      proteinExcess,
    ];
  }
  if (target.proteina > 0) {
    return [0, inZone ? 0 : 1, proteinDeficit, secondary, calorieDeficit, proteinExcess];
  }
  return [0, inZone ? 0 : 1, secondary, calorieDeficit, totals.proteina];
}

function enumerateCandidates(foods, fixedTotals, target) {
  const candidates = [];
  const quantities = new Array(foods.length).fill(0);
  const options = foods.map(optionValues);
  function visit(index) {
    if (index === foods.length) {
      const totals = totalsForQuantities(foods, quantities, fixedTotals);
      if (totals.calorias <= target.kcal + EPSILON) {
        candidates.push({ quantities: [...quantities], totals });
      }
      return;
    }
    for (const quantity of options[index]) {
      quantities[index] = quantity;
      visit(index + 1);
    }
  }
  visit(0);
  return candidates;
}

function oracleFromCandidates(candidates, target) {
  assert.ok(candidates.length > 0, "El oracle requiere al menos un candidato bajo el techo");
  const normalFloor = Math.max(0, target.kcal - Math.max(5, target.kcal * 0.02));
  const bestReachableCalories = candidates.reduce(
    (maximum, candidate) => Math.max(maximum, candidate.totals.calorias),
    Number.NEGATIVE_INFINITY
  );
  const hasNormalCalorieZoneCandidate = bestReachableCalories >= normalFloor - EPSILON;
  const calorieZoneFloor = hasNormalCalorieZoneCandidate ? normalFloor : bestReachableCalories;
  const proteinReachable = target.proteina > 0 && candidates.some((candidate) => (
    candidate.totals.calorias >= calorieZoneFloor - EPSILON &&
    candidate.totals.proteina >= target.proteina - 0.05
  ));
  const context = { calorieZoneFloor, hasNormalCalorieZoneCandidate, proteinReachable };
  const best = candidates.reduce((current, candidate) => (
    !current ||
    compareRanks(rankCandidate(candidate, target, context), rankCandidate(current, target, context)) < 0
      ? candidate
      : current
  ), null);
  return {
    best,
    context,
    candidateCount: candidates.length,
    rank: rankCandidate(best, target, context),
  };
}

function oracleFor(foods, fixedTotals, target) {
  return oracleFromCandidates(enumerateCandidates(foods, fixedTotals, target), target);
}

function oracleClassification(actual, oracle, target) {
  const actualRank = rankCandidate(actual, target, oracle.context);
  const rankDifference = compareRanks(actualRank, oracle.rank);
  const exact = actual.quantities.length === oracle.best.quantities.length &&
    actual.quantities.every((quantity, index) => Math.abs(quantity - oracle.best.quantities[index]) <= EPSILON);
  if (exact) return { code: "A", label: "Coincidencia exacta", rankDifference: 0 };
  if (Math.abs(rankDifference) <= 1e-8) {
    return { code: "B", label: "Empate equivalente", rankDifference: 0 };
  }
  const kcalDelta = Math.abs(actual.totals.calorias - oracle.best.totals.calorias);
  const scoreDelta = Math.abs(macroScore(actual.totals, target) - macroScore(oracle.best.totals, target));
  if (kcalDelta <= 0.01 && scoreDelta <= 1e-6) {
    return { code: "C", label: "Diferencia numérica dentro de tolerancia", rankDifference };
  }
  return { code: "D", label: "Resultado dominado o incorrecto", rankDifference };
}

function quantitiesFromResult(result, foods) {
  const responseByName = new Map((result.foods || []).map((food) => [food.nombre, food]));
  return foods.map((food) => Number(responseByName.get(food.nombre)?.quantity));
}

async function reducedOracleDiagnostic(input) {
  const reducedRows = input.pendingRows.map((food) => {
    const { min, max, step } = alignedBounds(food);
    const reducedMax = Math.min(max, min + 2 * step);
    return {
      ...food,
      porcionMin: min,
      porcionMax: reducedMax,
      multiplo: step,
      diagnosticRangeReduction: true,
    };
  });
  const reducedPendingFoods = reducedRows.map((food) => payloadFood(food, {
    quantitySource: "auto",
    quantityPending: true,
  }));
  const reducedPayload = {
    ...input.payload,
    pendingFoods: reducedPendingFoods,
  };
  const service = quantityService([]);
  const result = await service.generarCantidades(reducedPayload);
  const fixedTotals = input.fixedFood
    ? nutritionFor(input.fixedFood, input.fixedQuantity)
    : sumTotals();
  const quantities = quantitiesFromResult(result, reducedRows);
  const actual = {
    quantities,
    totals: totalsForQuantities(reducedRows, quantities, fixedTotals),
  };
  const oracle = oracleFor(reducedRows, fixedTotals, input.engineTarget);
  const classification = oracleClassification(actual, oracle, input.engineTarget);
  return {
    mode: "reducido_test_only",
    spaceSize: optionSpaceSize(reducedRows),
    candidateCount: oracle.candidateCount,
    classification,
    engine: {
      quantities,
      totals: roundedTotals(actual.totals),
      macroScore: round(macroScore(actual.totals, input.engineTarget), 8),
    },
    oracle: {
      quantities: oracle.best.quantities,
      totals: roundedTotals(oracle.best.totals),
      macroScore: round(macroScore(oracle.best.totals, input.engineTarget), 8),
    },
    reductionRule: "max efectivo = min efectivo + hasta 2 steps; regla previa al resultado",
  };
}

function scenarioSeed(id) {
  let value = MATRIX_SEED;
  for (const character of id) {
    value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  }
  return value >>> 0;
}

function candidateSummary(candidate, foods, target) {
  if (!candidate) return null;
  return {
    quantities: candidate.quantities,
    byFood: foods.map((food, index) => ({
      alimentoId: food.alimentoId,
      nombre: food.nombre,
      quantity: candidate.quantities[index],
    })),
    totals: roundedTotals(candidate.totals),
    macroScore: round(macroScore(candidate.totals, target), 8),
  };
}

function dominanceSearch(input, actual, optimization) {
  const foods = input.pendingRows;
  const fixedTotals = input.fixedFood
    ? nutritionFor(input.fixedFood, input.fixedQuantity)
    : sumTotals();
  const options = foods.map(optionValues);
  const random = seededRandom(scenarioSeed(input.blueprint.id));
  const candidates = new Map();
  const add = (quantities) => {
    const key = quantities.join("|");
    if (candidates.has(key)) return;
    const totals = totalsForQuantities(foods, quantities, fixedTotals);
    if (totals.calorias <= input.engineTarget.kcal + EPSILON) {
      candidates.set(key, { quantities: [...quantities], totals });
    }
  };
  add(actual.quantities);
  add(foods.map((food) => alignedBounds(food).min));
  add(foods.map((food) => alignedBounds(food).max));

  for (let index = 0; index < foods.length; index++) {
    for (const quantity of options[index]) {
      const candidate = [...actual.quantities];
      candidate[index] = quantity;
      add(candidate);
    }
  }
  for (let left = 0; left < foods.length; left++) {
    for (let right = left + 1; right < foods.length; right++) {
      for (const leftQuantity of options[left]) {
        for (const rightQuantity of options[right]) {
          const candidate = [...actual.quantities];
          candidate[left] = leftQuantity;
          candidate[right] = rightQuantity;
          add(candidate);
        }
      }
    }
  }
  for (let sample = 0; sample < 4000; sample++) {
    add(options.map((values) => values[Math.floor(random() * values.length)]));
  }

  const context = {
    calorieZoneFloor: Number(optimization.calorieZoneFloor),
    hasNormalCalorieZoneCandidate: optimization.normalCalorieZoneReached === true,
    proteinReachable: optimization.proteinReachable === true,
  };
  const actualRank = rankCandidate(actual, input.engineTarget, context);
  const actualMacroScore = macroScore(actual.totals, input.engineTarget);
  const actualInZone = actual.totals.calorias >= context.calorieZoneFloor - EPSILON;
  let betterPolicyCandidate = null;
  let clearMacroCandidate = null;
  let foundNormalZone = false;
  let foundReachableProtein = false;
  const normalFloor = Math.max(
    0,
    input.engineTarget.kcal - Math.max(5, input.engineTarget.kcal * 0.02)
  );

  for (const candidate of candidates.values()) {
    if (candidate.totals.calorias >= normalFloor - EPSILON) foundNormalZone = true;
    if (
      candidate.totals.calorias >= context.calorieZoneFloor - EPSILON &&
      input.engineTarget.proteina > 0 &&
      candidate.totals.proteina >= input.engineTarget.proteina - 0.05
    ) {
      foundReachableProtein = true;
    }
    const rank = rankCandidate(candidate, input.engineTarget, context);
    if (
      compareRanks(rank, actualRank) < 0 &&
      (
        !betterPolicyCandidate ||
        compareRanks(rank, rankCandidate(betterPolicyCandidate, input.engineTarget, context)) < 0
      )
    ) {
      betterPolicyCandidate = candidate;
    }

    const candidateInZone = candidate.totals.calorias >= context.calorieZoneFloor - EPSILON;
    const proteinEquivalent = input.engineTarget.proteina <= 0 ||
      (
        optimization.proteinReachable === true
          ? candidate.totals.proteina >= input.engineTarget.proteina - 0.05
          : Math.abs(candidate.totals.proteina - actual.totals.proteina) <= 0.05
      );
    const candidateMacroScore = macroScore(candidate.totals, input.engineTarget);
    const meaningfulImprovement =
      actualMacroScore - candidateMacroScore > Math.max(0.01, actualMacroScore * 0.01);
    if (
      actualInZone &&
      candidateInZone &&
      proteinEquivalent &&
      meaningfulImprovement &&
      (
        !clearMacroCandidate ||
        candidateMacroScore < macroScore(clearMacroCandidate.totals, input.engineTarget)
      )
    ) {
      clearMacroCandidate = candidate;
    }
  }

  return {
    method: "barrido de 1 y 2 coordenadas + 4000 muestras seeded",
    examined: candidates.size,
    foundNormalZone,
    foundReachableProtein,
    betterPolicyCandidate: candidateSummary(betterPolicyCandidate, foods, input.engineTarget),
    clearMacroCandidate: candidateSummary(clearMacroCandidate, foods, input.engineTarget),
  };
}

function serializeFoodConstraint(food) {
  const bounds = alignedBounds(food);
  return {
    sourceObjectId: food.sourceObjectId,
    alimentoId: food.alimentoId,
    nombre: food.nombre,
    unidad: food.unidadBase,
    macroBasis: food.macroBasis,
    cantidadUnidad: food.cantidadUnidad,
    kcalPerUnitOrGram: food.kcalUnidad,
    proteinPerUnitOrGram: food.proteinaUnidad,
    carbsPerUnitOrGram: food.carbohidratosUnidad,
    fatPerUnitOrGram: food.grasasUnidad,
    porcionMinOriginal: food.originalConstraints?.porcionMin ?? food.porcionMin,
    porcionMaxOriginal: food.originalConstraints?.porcionMax ?? food.porcionMax,
    stepOriginal: food.originalConstraints?.multiplo ?? food.multiplo,
    porcionMin: food.porcionMin,
    porcionMax: food.porcionMax,
    step: food.multiplo,
    minEfectivo: bounds.min,
    maxEfectivo: bounds.max,
    diagnosticConstraintOverride: food.diagnosticConstraintOverride === true,
  };
}

function consistencyFromTarget(target) {
  const macroCalories = target.proteina * 4 + target.carbs * 4 + target.grasas * 9;
  const relativeDifference = target.kcal > 0
    ? Math.abs(macroCalories - target.kcal) / target.kcal
    : 0;
  return {
    macroCalories: round(macroCalories, 2),
    difference: round(macroCalories - target.kcal, 2),
    relativeDifference: round(relativeDifference, 6),
    actualClass: relativeDifference <= 0.03
      ? "consistente"
      : relativeDifference <= 0.2
        ? "leve"
        : "fuerte",
  };
}

function expectedLimitationReasons(input, actual, optimization) {
  const reasons = [];
  const target = input.engineTarget;
  const proteinDeficit = Math.max(0, target.proteina - actual.totals.proteina);
  const carbError = Math.abs(target.carbs - actual.totals.carbohidratos);
  const fatError = Math.abs(target.grasas - actual.totals.grasas);
  if (optimization.normalCalorieZoneReached !== true) reasons.push("zona calórica discreta/limitada");
  if (target.proteina > 0 && proteinDeficit > 0.5) reasons.push("proteína inalcanzable");
  if (carbError > Math.max(0.5, target.carbs * 0.05)) reasons.push("carbohidratos no alcanzados");
  if (fatError > Math.max(0.5, target.grasas * 0.05)) reasons.push("grasas no alcanzadas");
  if (optimization.maxConstraintsLimited === true) reasons.push("máximos explícitos");
  if (consistencyFromTarget(target).actualClass === "fuerte") reasons.push("meta kcal/macros incompatible");
  return [...new Set(reasons)];
}

function warningValidation(result, input, actual, limitationReasons) {
  const errors = [];
  const message = String(result.message || "");
  const warnings = Array.isArray(result.warnings) ? result.warnings.join(" ") : "";
  if (limitationReasons.length && !message.trim()) {
    errors.push("La limitación matemática no tiene mensaje para el usuario");
  }
  if (
    input.engineTarget.proteina > 0 &&
    actual.totals.proteina < input.engineTarget.proteina - 0.5 &&
    !/faltan|por debajo|prote[ií]n/i.test(message)
  ) {
    errors.push("Déficit proteico sin explicación comprensible");
  }
  if (
    input.engineTarget.proteina <= 0 &&
    /alcanza la prote[ií]na|prote[ií]na cumplida|prote[ií]na alcanzada/i.test(message)
  ) {
    errors.push("Proteína cero presentada como beneficio cumplido");
  }
  if (
    result.optimization?.maxConstraintsLimited === true &&
    !/cantidades m[aá]ximas configuradas/i.test(warnings)
  ) {
    errors.push("Máximo limitante sin warning explícito");
  }
  return errors;
}

function resultQuantityMap(result) {
  return new Map((result.foods || []).map((food) => [food.nombre, Number(food.quantity)]));
}

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1);
  return sorted[index];
}

async function executeScenario(blueprint, layer) {
  const input = scenarioInput(blueprint);
  const errors = [...profileValidation(input).errors];
  const service = quantityService(input.catalog);
  let first;
  let second;
  let firstMs = 0;
  let secondMs = 0;

  try {
    let started = performance.now();
    first = await service.generarCantidades(structuredClone(input.payload));
    firstMs = performance.now() - started;
    started = performance.now();
    second = await service.generarCantidades(structuredClone(input.payload));
    secondMs = performance.now() - started;
  } catch (error) {
    return {
      id: blueprint.id,
      layer,
      profile: blueprint.profile,
      combinationKind: blueprint.combinationKind,
      foodCount: blueprint.foodIds.length,
      target: input.target,
      engineTarget: input.engineTarget,
      input: {
        foods: input.foods.map(serializeFoodConstraint),
      },
      status: "FAIL",
      errors: ["Excepción del motor: " + error.message],
      timeMs: round(firstMs, 4),
      secondTimeMs: round(secondMs, 4),
    };
  }

  const deterministic = isDeepStrictEqual(first, second);
  if (!deterministic) errors.push("La segunda ejecución no fue idéntica");
  if (first.optimization?.policy !== TRACKING_OPTIMIZATION_POLICY) {
    errors.push("La policy Tracking explícita no llegó al resultado");
  }
  if (first.optimization?.calorieCeilingSatisfied !== true) {
    errors.push("Metadata reporta incumplimiento del techo calórico");
  }
  if (first.errors?.length) {
    errors.push("El motor devolvió errores: " + first.errors.join("; "));
  }

  const responseByName = new Map((first.foods || []).map((food) => [food.nombre, food]));
  const expectedResponseFoods = input.foods.filter(
    (food) => food.alimentoId !== blueprint.registeredId
  );
  if (responseByName.size !== expectedResponseFoods.length) {
    errors.push("Cantidad de alimentos devueltos distinta de Fijo + Auto");
  }
  const quantityMap = resultQuantityMap(first);
  const fixedTotals = input.fixedFood
    ? nutritionFor(input.fixedFood, input.fixedQuantity)
    : sumTotals();
  const pendingQuantities = input.pendingRows.map((food) => quantityMap.get(food.nombre));

  expectedResponseFoods.forEach((food) => {
    const responseFood = responseByName.get(food.nombre);
    if (!responseFood) {
      errors.push("Alimento seleccionado omitido: " + food.nombre);
      return;
    }
    if (String(responseFood.foodId) !== String(food.alimentoId)) {
      errors.push("Identidad sustituida para " + food.nombre);
    }
    if (String(responseFood.unit).toLowerCase() !== String(food.unidadBase).toLowerCase()) {
      errors.push("Unidad alterada para " + food.nombre);
    }
  });

  input.pendingRows.forEach((food, index) => {
    const quantity = pendingQuantities[index];
    const { min, max, step } = alignedBounds(food);
    if (!Number.isFinite(quantity)) errors.push("Cantidad no finita: " + food.nombre);
    if (quantity < min - EPSILON || quantity > max + EPSILON) {
      errors.push("Cantidad fuera de rango: " + food.nombre);
    }
    if (Math.abs(quantity / step - Math.round(quantity / step)) > EPSILON) {
      errors.push("Cantidad fuera de step: " + food.nombre);
    }
  });

  if (input.fixedFood) {
    const returned = quantityMap.get(input.fixedFood.nombre);
    if (Math.abs(returned - input.fixedQuantity) > EPSILON) {
      errors.push("El alimento Fijo fue modificado");
    }
  }
  if (input.registeredFood && responseByName.has(input.registeredFood.nombre)) {
    errors.push("El Registrado fue reinsertado en la propuesta");
  }

  const actual = {
    quantities: pendingQuantities,
    totals: totalsForQuantities(input.pendingRows, pendingQuantities, fixedTotals),
  };
  const combinedTotals = sumTotals(input.registeredTotals, actual.totals);
  if (actual.totals.calorias > input.engineTarget.kcal + EPSILON) {
    errors.push("Techo calórico estricto excedido");
  }
  if (combinedTotals.calorias > input.target.kcal + EPSILON) {
    errors.push("Registrado + Fijo + Auto exceden el techo original");
  }
  const reportedTotals = first.totals || {};
  for (const [key, value] of Object.entries(actual.totals)) {
    if (Math.abs(Number(reportedTotals[key]) - value) > 0.011) {
      errors.push("Total reportado inconsistente en " + key);
    }
  }

  const minimumTotals = totalsForQuantities(
    input.pendingRows,
    input.pendingRows.map((food) => alignedBounds(food).min),
    fixedTotals
  );
  if (minimumTotals.calorias > input.engineTarget.kcal + EPSILON) {
    errors.push("Fixture sin candidato válido bajo techo; la matriz no debe ocultarlo");
  }

  const optionSpace = optionSpaceSize(input.pendingRows);
  let oracle;
  if (optionSpace <= ORACLE_LIMIT) {
    const fullOracle = oracleFor(input.pendingRows, fixedTotals, input.engineTarget);
    const classification = oracleClassification(actual, fullOracle, input.engineTarget);
    oracle = {
      mode: "completo",
      spaceSize: optionSpace,
      candidateCount: fullOracle.candidateCount,
      classification,
      engine: candidateSummary(actual, input.pendingRows, input.engineTarget),
      oracle: candidateSummary(fullOracle.best, input.pendingRows, input.engineTarget),
    };
    if (classification.code === "D") {
      errors.push("Oracle completo encontró un resultado dominado");
    }
  } else {
    oracle = await reducedOracleDiagnostic(input);
    oracle.fullSpaceSize = optionSpace;
    if (oracle.classification.code === "D") {
      errors.push("Oracle reducido encontró un resultado dominado");
    }
  }

  const dominance = optionSpace <= ORACLE_LIMIT
    ? {
      method: "cubierto por oracle completo",
      examined: oracle.candidateCount,
      betterPolicyCandidate: oracle.classification.code === "D" ? oracle.oracle : null,
      clearMacroCandidate: null,
    }
    : dominanceSearch(input, actual, first.optimization || {});
  if (dominance.betterPolicyCandidate) {
    errors.push("Búsqueda de propiedades encontró un candidato mejor según la policy");
  }
  if (dominance.clearMacroCandidate) {
    errors.push("Búsqueda de dominancia encontró macroScore significativamente mejor");
  }

  const limitationReasons = expectedLimitationReasons(
    input,
    actual,
    first.optimization || {}
  );
  errors.push(...warningValidation(first, input, actual, limitationReasons));
  const status = errors.length
    ? "FAIL"
    : limitationReasons.length
      ? "PASS CON ADVERTENCIA ESPERADA"
      : "PASS";
  const carbError = actual.totals.carbohidratos - input.engineTarget.carbs;
  const fatError = actual.totals.grasas - input.engineTarget.grasas;
  const proteinError = actual.totals.proteina - input.engineTarget.proteina;
  const calorieError = actual.totals.calorias - input.engineTarget.kcal;
  const constraintsByName = new Map(
    (first.optimization?.constraints || []).map((constraint) => [constraint.name, constraint])
  );
  const stepLimited = input.pendingRows.some((food, index) => {
      const constraint = constraintsByName.get(food.nombre);
      const max = Number(constraint?.max ?? alignedBounds(food).max);
      const quantity = pendingQuantities[index];
      const calorieDeficit = input.engineTarget.kcal - actual.totals.calorias;
      return quantity < max - EPSILON &&
        food.kcalUnidad * alignedBounds(food).step > calorieDeficit + EPSILON;
    });

  return {
    id: blueprint.id,
    layer,
    highlighted: blueprint.highlighted === true,
    highlight: blueprint.highlight || "",
    profile: blueprint.profile,
    profileDescription: PROFILE_DESCRIPTIONS[blueprint.profile],
    combinationKind: blueprint.combinationKind,
    foodCount: blueprint.foodIds.length,
    plannedConsistency: blueprint.plannedConsistency || input.targetSource.consistency || "",
    actualConsistency: consistencyFromTarget(input.target),
    selectionAttempts: blueprint.selectionAttempts || 1,
    input: {
      target: input.target,
      engineTargetAfterRegistered: input.engineTarget,
      foods: input.foods.map(serializeFoodConstraint),
      registered: input.registeredFood
        ? {
          alimentoId: input.registeredFood.alimentoId,
          nombre: input.registeredFood.nombre,
          quantity: input.registeredQuantity,
          totals: roundedTotals(input.registeredTotals),
        }
        : null,
      fixed: input.fixedFood
        ? {
          alimentoId: input.fixedFood.alimentoId,
          nombre: input.fixedFood.nombre,
          quantity: input.fixedQuantity,
          totals: roundedTotals(fixedTotals),
        }
        : null,
      auto: input.pendingRows.map((food) => ({
        alimentoId: food.alimentoId,
        nombre: food.nombre,
      })),
      diagnosticReason: blueprint.diagnosticReason || "",
    },
    result: {
      status: first.status,
      engineStatus: first.engineStatus,
      message: first.message,
      warnings: first.warnings,
      foods: (first.foods || []).map((food) => ({
        foodId: food.foodId,
        nombre: food.nombre,
        quantity: food.quantity,
        unit: food.unit,
        source: food.source,
      })),
      automaticQuantities: input.pendingRows.map((food, index) => ({
        alimentoId: food.alimentoId,
        nombre: food.nombre,
        quantity: pendingQuantities[index],
        unit: food.unidadBase,
      })),
      engineTotals: roundedTotals(actual.totals),
      projectedTotalsIncludingRegistered: roundedTotals(combinedTotals),
      diffAgainstEngineTarget: {
        calorias: round(calorieError, 6),
        proteina: round(proteinError, 6),
        carbohidratos: round(carbError, 6),
        grasas: round(fatError, 6),
      },
      macroErrors: {
        carbohidratosAbsoluto: round(Math.abs(carbError), 6),
        carbohidratosRelativo: round(Math.abs(carbError) / (input.engineTarget.carbs || 25), 6),
        grasasAbsoluto: round(Math.abs(fatError), 6),
        grasasRelativo: round(Math.abs(fatError) / (input.engineTarget.grasas || 10), 6),
      },
      macroScore: round(macroScore(actual.totals, input.engineTarget), 8),
      optimization: first.optimization,
    },
    properties: {
      calorieCeiling: actual.totals.calorias <= input.engineTarget.kcal + EPSILON,
      combinedCalorieCeiling: combinedTotals.calorias <= input.target.kcal + EPSILON,
      inCalorieZone: first.optimization?.inCalorieZone === true,
      calorieZoneFloor: first.optimization?.calorieZoneFloor,
      calorieCeiling: first.optimization?.calorieCeiling,
      proteinTargetActive: first.optimization?.proteinTargetActive === true,
      proteinReachable: first.optimization?.proteinReachable === true,
      proteinReached: input.engineTarget.proteina > 0 &&
        actual.totals.proteina >= input.engineTarget.proteina - 0.05,
      selectedFoodsPreserved: expectedResponseFoods.every((food) => responseByName.has(food.nombre)),
      fixedPreserved: !input.fixedFood ||
        Math.abs(quantityMap.get(input.fixedFood.nombre) - input.fixedQuantity) <= EPSILON,
      registeredCountedOnce: !input.registeredFood ||
        !responseByName.has(input.registeredFood.nombre),
      deterministic,
      maxLimited: first.optimization?.maxConstraintsLimited === true,
      stepLimited,
      limitationReasons,
      limitingConstraints: first.optimization?.limitingConstraints || [],
      dominance,
    },
    oracle,
    timeMs: round(firstMs, 4),
    secondTimeMs: round(secondMs, 4),
    performanceRisk: firstMs > 100,
    status,
    errors,
  };
}

async function policyIsolationSentinel() {
  const input = scenarioInput(HIGHLIGHT_BLUEPRINTS.map((row) => freezeBlueprint(row, true))[6]);
  const service = quantityService(input.catalog);
  const historicalPayload = {
    ...input.payload,
    options: { redondear: true, usarMinMax: true },
  };
  const admin = await service.generarCantidades(structuredClone(historicalPayload));
  const coach = await service.generarCantidades(structuredClone(historicalPayload));
  const tracking = await service.generarCantidades(structuredClone(input.payload));
  return {
    adminOptimization: admin.optimization,
    coachOptimization: coach.optimization,
    trackingPolicy: tracking.optimization?.policy || null,
    adminCoachEqual: isDeepStrictEqual(admin, coach),
    pass: admin.optimization === null &&
      coach.optimization === null &&
      tracking.optimization?.policy === TRACKING_OPTIMIZATION_POLICY &&
      isDeepStrictEqual(admin, coach),
  };
}

function countBy(records, keyFunction) {
  const counts = {};
  for (const record of records) {
    const key = String(keyFunction(record));
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function statusCounts(records) {
  return countBy(records, (record) => record.status);
}

function performanceSummary(records) {
  const times = records.map((record) => Number(record.timeMs)).filter(Number.isFinite);
  const byFoodCount = {};
  for (let count = 1; count <= 6; count++) {
    const subset = records
      .filter((record) => record.foodCount === count)
      .map((record) => Number(record.timeMs))
      .filter(Number.isFinite);
    byFoodCount[count] = {
      count: subset.length,
      medianMs: round(percentile(subset, 0.5), 4),
      p95Ms: round(percentile(subset, 0.95), 4),
      maxMs: round(subset.length ? Math.max(...subset) : 0, 4),
    };
  }
  return {
    medianMs: round(percentile(times, 0.5), 4),
    p95Ms: round(percentile(times, 0.95), 4),
    maxMs: round(times.length ? Math.max(...times) : 0, 4),
    risksOver100ms: records.filter((record) => record.performanceRisk).map((record) => record.id),
    byFoodCount,
  };
}

function matrixSummary(fixed, random, diagnostic, isolation) {
  const all = [...fixed, ...random, ...diagnostic];
  const oracles = all.map((record) => record.oracle).filter(Boolean);
  const oracleClasses = countBy(
    oracles,
    (oracle) => (oracle.mode === "completo" ? "completo_" : "reducido_") + oracle.classification.code
  );
  const passing = all.filter((record) => record.status !== "FAIL");
  const worstMacro = [...passing].sort(
    (left, right) => Number(right.result?.macroScore || 0) - Number(left.result?.macroScore || 0)
  )[0] || null;
  const worstPerformance = [...all].sort(
    (left, right) => Number(right.timeMs || 0) - Number(left.timeMs || 0)
  )[0] || null;
  return {
    fixedCount: fixed.length,
    randomCount: random.length,
    diagnosticCount: diagnostic.length,
    totalCount: all.length,
    status: statusCounts(all),
    fixedStatus: statusCounts(fixed),
    randomStatus: statusCounts(random),
    diagnosticStatus: statusCounts(diagnostic),
    byProfile: countBy(all, (record) => record.profile),
    statusByProfile: Object.fromEntries(
      Object.keys(PROFILE_DESCRIPTIONS).map((profile) => [
        profile,
        statusCounts(all.filter((record) => record.profile === profile)),
      ])
    ),
    byFoodCount: countBy(all, (record) => record.foodCount),
    statusByFoodCount: Object.fromEntries(
      [1, 2, 3, 4, 5, 6].map((count) => [
        count,
        statusCounts(all.filter((record) => record.foodCount === count)),
      ])
    ),
    byCombinationKind: countBy(fixed, (record) => record.combinationKind),
    randomPlannedConsistency: countBy(random, (record) => record.plannedConsistency),
    randomActualConsistency: countBy(random, (record) => record.actualConsistency?.actualClass || "unknown"),
    proteinReachable: all.filter((record) => record.properties?.proteinReachable).length,
    proteinUnreachable: all.filter(
      (record) => record.properties?.proteinTargetActive && !record.properties?.proteinReachable
    ).length,
    proteinZero: all.filter((record) => !record.properties?.proteinTargetActive).length,
    maxLimited: all.filter((record) => record.properties?.maxLimited).length,
    stepLimited: all.filter((record) => record.properties?.stepLimited).length,
    inCalorieZone: all.filter((record) => record.properties?.inCalorieZone).length,
    outOfCalorieZone: all.filter((record) => !record.properties?.inCalorieZone).length,
    oracleCompared: oracles.length,
    oracleClasses,
    equivalentTies: Object.entries(oracleClasses)
      .filter(([key]) => key.endsWith("_B"))
      .reduce((total, [, count]) => total + count, 0),
    dominatedCases: all.filter(
      (record) =>
        record.oracle?.classification?.code === "D" ||
        record.properties?.dominance?.betterPolicyCandidate ||
        record.properties?.dominance?.clearMacroCandidate
    ).map((record) => record.id),
    performance: performanceSummary(all),
    worstMacroScore: worstMacro
      ? { id: worstMacro.id, value: worstMacro.result.macroScore, status: worstMacro.status }
      : null,
    worstPerformance: worstPerformance
      ? { id: worstPerformance.id, timeMs: worstPerformance.timeMs, status: worstPerformance.status }
      : null,
    failures: all
      .filter((record) => record.status === "FAIL")
      .map((record) => ({ id: record.id, errors: record.errors })),
    policyIsolation: isolation,
  };
}

export async function runTrackingAdversarialMatrix() {
  const warmup = scenarioInput(FIXED_BLUEPRINTS.find((item) => item.id === "F031"));
  await quantityService(warmup.catalog).generarCantidades(structuredClone(warmup.payload));

  const fixed = [];
  for (const blueprint of FIXED_BLUEPRINTS) {
    fixed.push(await executeScenario(blueprint, "fija"));
  }
  const random = [];
  for (const blueprint of RANDOM_BLUEPRINTS) {
    random.push(await executeScenario(blueprint, "random"));
  }
  const diagnostic = [];
  for (const blueprint of DIAGNOSTIC_BLUEPRINTS) {
    diagnostic.push(await executeScenario(blueprint, "diagnostica_test_only"));
  }
  const isolation = await policyIsolationSentinel();
  const summary = matrixSummary(fixed, random, diagnostic, isolation);
  return {
    metadata: {
      generatedAt: new Date().toISOString(),
      seed: MATRIX_SEED,
      seedHex: MATRIX_SEED_HEX,
      snapshotCaptureDate: SNAPSHOT_CAPTURE_DATE,
      snapshotSha256: SNAPSHOT_SHA256,
      snapshotPoolCount: REAL_FOOD_SNAPSHOTS.length,
      activeCanonicalCountAtCapture: ACTIVE_CANONICAL_COUNT_AT_CAPTURE,
      sourceCollection: "fooddatabase2",
      sourceQuery: { activo: true, alimentoId: { exists: true } },
      sourceAccess: "sólo lectura; snapshots embebidos después de find/projection",
      realStepsAvailable: [1, 5, 10, 25],
      realStepsAbsentButCoveredTestOnly: [2, 20],
      realNonAlignedMaxCount: 0,
      oracleLimit: ORACLE_LIMIT,
      engineRunsPerScenario: 2,
      policy: TRACKING_OPTIMIZATION_POLICY,
    },
    summary,
    fixed,
    random,
    diagnostic,
  };
}
