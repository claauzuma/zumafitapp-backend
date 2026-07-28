import { performance } from "node:perf_hooks";

import { TRACKING_CALORIE_FILL_POLICY, TRACKING_OPTIMIZATION_POLICY } from "../../menu2.js";
import ServicioFoodLogs from "../../servicio/foodLogs.js";

const DATE = "2026-07-27";
const CONTINUOUS_UNITS = new Set(["g", "gr", "grs", "ml"]);

function food(id, name, kcal, protein, carbs, fat, options = {}) {
  return Object.freeze({
    _id: `improvement-${id}`,
    alimentoId: id,
    nombre: name,
    unidadBase: options.unit || "Grs",
    macroBasis: "perUnit",
    cantidadUnidad: 1,
    kcalUnidad: kcal,
    proteinaUnidad: protein,
    carbohidratosUnidad: carbs,
    grasasUnidad: fat,
    porcionMin: options.min ?? 1,
    porcionMax: options.max ?? 100,
    porcionSugerida: options.suggested ?? options.min ?? 1,
    multiplo: options.step ?? 5,
    categoriaZumaFit: options.category || "Otros",
    activo: true,
  });
}

export const IMPROVEMENT_FOODS = Object.freeze({
  chicken: food("chicken", "Pechuga de pollo", 1.105, 0.22, 0, 0.025, { min: 80, max: 250, step: 10, category: "Proteínas" }),
  steak: food("steak", "Churrasco magro", 2.43, 0.27, 0, 0.15, { min: 100, max: 300, step: 10, category: "Proteínas" }),
  ham: food("ham", "Jamón cocido", 0.825, 0.15, 0, 0.025, { min: 20, max: 100, step: 5, category: "Proteínas" }),
  whey: food("whey", "Whey protein", 3.842, 0.91, 0.01, 0.018, { min: 20, max: 40, step: 5, category: "Proteínas" }),
  rice: food("rice", "Arroz", 3.385, 0.08, 0.755, 0.005, { min: 30, max: 120, step: 5, category: "Carbohidratos" }),
  potato: food("potato", "Papas", 0.963, 0.017, 0.19, 0.015, { min: 80, max: 350, step: 10, category: "Carbohidratos" }),
  pasta: food("pasta", "Fideos", 3.593, 0.11, 0.75, 0.017, { min: 80, max: 250, step: 10, category: "Carbohidratos" }),
  bread: food("bread", "Pan blanco", 2.641, 0.076, 0.51, 0.033, { min: 30, max: 150, step: 5, category: "Carbohidratos" }),
  oil: food("oil", "Aceite de oliva", 8.991, 0, 0, 0.999, { min: 5, max: 30, step: 5, category: "Grasas" }),
  cheese: food("cheese", "Queso cremoso", 3.57, 0.14, 0.01, 0.33, { min: 20, max: 80, step: 5, category: "Grasas" }),
  almonds: food("almonds", "Almendras", 7.15, 0.26, 0.155, 0.61, { unit: "Unid", min: 1, max: 3, step: 1, category: "Grasas" }),
  egg: food("egg", "Huevos", 69, 6, 0, 5, { unit: "Unid", min: 1, max: 4, step: 1, category: "Proteínas" }),
  banana: food("banana", "Banana", 105.87, 1.29, 24.3, 0.39, { unit: "Unid", min: 1, max: 3, step: 1, category: "Frutas" }),
  apple: food("apple", "Manzana", 95.07, 0.47, 22.6, 0.31, { unit: "Unid", min: 1, max: 3, step: 1, category: "Frutas" }),
  alfajor: food("alfajor", "Alfajor", 220, 3, 34, 8, { unit: "Unid", min: 1, max: 2, step: 1, category: "Snacks" }),
  cola: food("cola", "Coca-Cola", 0.42, 0, 0.105, 0, { unit: "ml", min: 200, max: 500, step: 50, category: "Bebidas" }),
});

function target(kcal, proteina, carbs, grasas) {
  return Object.freeze({ kcal, proteina, carbs, grasas });
}

function scenario(id, level, label, foodIds, scenarioTarget, options = {}) {
  return Object.freeze({
    id,
    level,
    label,
    foodIds: Object.freeze([...foodIds]),
    target: scenarioTarget,
    fixed: Object.freeze({ ...(options.fixed || {}) }),
    compareConstrained: options.compareConstrained === true,
    consistency: options.consistency || "aproximadamente_consistente",
  });
}

export const TRACKING_CALORIE_FILL_IMPROVEMENT_SCENARIOS = Object.freeze([
  scenario("N01", "normal", "Pollo + arroz + aceite", ["chicken", "rice", "oil"], target(650, 50, 70, 18), { compareConstrained: true }),
  scenario("N02", "normal", "Desayuno: huevos + pan + banana", ["egg", "bread", "banana"], target(500, 30, 60, 16), { compareConstrained: true }),
  scenario("N03", "normal", "Churrasco + papas + aceite", ["steak", "potato", "oil"], target(700, 55, 75, 24), { compareConstrained: true }),
  scenario("N04", "normal", "Pollo + fideos + queso", ["chicken", "pasta", "cheese"], target(800, 60, 95, 20), { compareConstrained: true }),
  scenario("N05", "normal", "Jamón + pan + queso + manzana", ["ham", "bread", "cheese", "apple"], target(450, 30, 45, 16), { compareConstrained: true }),
  scenario("N06", "normal", "Pollo + arroz + almendras + banana", ["chicken", "rice", "almonds", "banana"], target(600, 45, 70, 16)),
  scenario("N07", "normal", "Churrasco + fideos + aceite + manzana", ["steak", "pasta", "oil", "apple"], target(900, 70, 105, 28)),
  scenario("N08", "normal", "Pollo + papas + pan + aceite", ["chicken", "potato", "bread", "oil"], target(750, 55, 90, 20)),
  scenario("N09", "normal", "Huevos + jamón + pan + banana", ["egg", "ham", "bread", "banana"], target(550, 40, 65, 18)),
  scenario("N10", "normal", "Cinco fuentes completas", ["chicken", "rice", "potato", "cheese", "oil"], target(850, 65, 105, 24)),

  scenario("L01", "limitado", "Sólo pechuga a 903 kcal", ["chicken"], target(903, 58.5, 38.4, 56.1), { compareConstrained: true, consistency: "incompatible" }),
  scenario("L02", "limitado", "Sólo arroz a 1200 kcal", ["rice"], target(1200, 35, 250, 10), { consistency: "incompatible" }),
  scenario("L03", "limitado", "Sólo aceite", ["oil"], target(500, 30, 50, 30), { consistency: "incompatible" }),
  scenario("L04", "limitado", "Pollo + arroz sin grasa", ["chicken", "rice"], target(620, 55, 70, 22), { consistency: "incompleta" }),
  scenario("L05", "limitado", "Arroz + aceite sin proteína", ["rice", "oil"], target(680, 60, 90, 25), { consistency: "incompleta" }),
  scenario("L06", "limitado", "Huevos + banana, ambas unidades", ["egg", "banana"], target(700, 45, 80, 30), { consistency: "discreta" }),
  scenario("L07", "limitado", "2 almendras Fijas + pollo + pan + huevos", ["chicken", "bread", "egg", "almonds"], target(903, 58.5, 38.4, 56.1), { fixed: { almonds: 2 }, compareConstrained: true, consistency: "incompatible" }),
  scenario("L08", "limitado", "100 g de arroz Fijo + pollo + queso", ["rice", "chicken", "cheese"], target(903, 58.5, 38.4, 56.1), { fixed: { rice: 100 }, consistency: "incompatible" }),
  scenario("L09", "limitado", "Jamón + queso sin carbohidrato", ["ham", "cheese"], target(650, 65, 70, 25), { consistency: "incompleta" }),
  scenario("L10", "limitado", "Coca-Cola + alfajor", ["cola", "alfajor"], target(800, 35, 120, 25), { compareConstrained: true, consistency: "incompleta" }),

  scenario("X01", "extremo", "1500 kcal sólo con pollo", ["chicken"], target(1500, 120, 180, 45), { consistency: "absurda" }),
  scenario("X02", "extremo", "1500 kcal sólo con alfajores", ["alfajor"], target(1500, 80, 200, 55), { compareConstrained: true, consistency: "absurda" }),
  scenario("X03", "extremo", "1200 kcal sólo con Coca-Cola", ["cola"], target(1200, 80, 220, 35), { consistency: "absurda" }),
  scenario("X04", "extremo", "Seis fuentes predominantemente proteicas", ["chicken", "steak", "ham", "egg", "cheese", "whey"], target(1400, 250, 0, 40), { consistency: "extrema" }),
  scenario("X05", "extremo", "Seis fuentes de carbohidratos", ["rice", "potato", "pasta", "bread", "banana", "cola"], target(1300, 40, 300, 15), { consistency: "extrema" }),
  scenario("X06", "extremo", "Seis alimentos mezclados", ["chicken", "rice", "oil", "egg", "banana", "cheese"], target(1500, 120, 180, 45), { compareConstrained: true }),
  scenario("X07", "extremo", "Proteína cero neutral", ["rice", "almonds", "oil"], target(900, 0, 120, 45), { consistency: "p_cero" }),
  scenario("X08", "extremo", "Carbohidratos cero", ["chicken", "egg", "cheese", "oil"], target(1000, 100, 0, 60), { consistency: "c_cero" }),
  scenario("X09", "extremo", "Grasas cero", ["chicken", "rice", "pasta", "bread"], target(1000, 80, 170, 0), { consistency: "g_cero" }),
  scenario("X10", "extremo", "Meta fuertemente incompatible y selección alocada", ["alfajor", "cola", "oil", "egg", "cheese"], target(500, 150, 150, 80), { compareConstrained: true, consistency: "fuertemente_incompatible" }),
]);

function payloadFood(entry, extra = {}) {
  return {
    foodId: entry.alimentoId,
    name: entry.nombre,
    unit: entry.unidadBase,
    macroBasis: "perUnit",
    kcalPerUnitOrGram: entry.kcalUnidad,
    proteinPerUnitOrGram: entry.proteinaUnidad,
    carbsPerUnitOrGram: entry.carbohidratosUnidad,
    fatPerUnitOrGram: entry.grasasUnidad,
    categoria: entry.categoriaZumaFit,
    minGramos: entry.porcionMin,
    maxGramos: entry.porcionMax,
    stepGramos: entry.multiplo,
    ...extra,
  };
}

function fixedFood(entry, quantity) {
  return payloadFood(entry, {
    quantity,
    cantidad: quantity,
    kcal: entry.kcalUnidad * quantity,
    proteina: entry.proteinaUnidad * quantity,
    carbs: entry.carbohidratosUnidad * quantity,
    grasas: entry.grasasUnidad * quantity,
    source: "fixed",
  });
}

function service() {
  const instance = new ServicioFoodLogs();
  instance._actor = async () => ({
    _id: "507f1f77bcf86cd799439011",
    id: "507f1f77bcf86cd799439011",
    role: "cliente",
    plan: "pro",
    personalPlan: "pro",
  });
  instance._assertCanWriteTracking = () => {};
  instance.alimentosService.model = {
    obtenerAlimentos: async () => Object.values(IMPROVEMENT_FOODS),
  };
  return instance;
}

const SHARED_SERVICE = service();

function requestFor(definition, trackingQuantityMode) {
  const fixedIds = new Set(Object.keys(definition.fixed));
  return {
    date: DATE,
    mode: "kcalProteina",
    generationType: "selectedOnly",
    trackingQuantityMode,
    target: definition.target,
    fixedFoods: Object.entries(definition.fixed).map(([id, quantity]) => (
      fixedFood(IMPROVEMENT_FOODS[id], quantity)
    )),
    pendingFoods: definition.foodIds
      .filter((id) => !fixedIds.has(id))
      .map((id) => payloadFood(IMPROVEMENT_FOODS[id])),
  };
}

function quantityText(response) {
  return (response.foods || []).map((entry) => ({
    id: entry.foodId,
    name: entry.nombre,
    quantity: entry.quantity,
    unit: entry.unit,
    role: entry.source === "fixed" ? "Fijo" : "Auto",
  }));
}

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round((Number(value || 0) + Number.EPSILON) * factor) / factor;
}

function warningText(optimization = {}) {
  const values = [];
  if (optimization.discreteLimited) values.push("limitado por unidades enteras");
  if (optimization.granularityLimited && !optimization.discreteLimited) {
    values.push("limitado por granularidad física");
  }
  if ((optimization.macroLimitations || []).length) {
    values.push(`macros limitados: ${optimization.macroLimitations.map((item) => item.macro).join(", ")}`);
  }
  if ((optimization.exceededRecommendedPortions || []).length) {
    values.push("supera porciones recomendadas");
  }
  return values;
}

async function runScenario(definition) {
  const started = performance.now();
  const result = await SHARED_SERVICE.calculateRemainingQuantities(
    {},
    requestFor(definition, "calorie_fill")
  );
  const elapsedMs = performance.now() - started;
  const repeated = await SHARED_SERVICE.calculateRemainingQuantities(
    {},
    requestFor(definition, "calorie_fill")
  );
  const constrained = definition.compareConstrained
    ? await SHARED_SERVICE.calculateRemainingQuantities(
        {},
        requestFor(definition, "constrained")
      )
    : null;
  const optimization = result.optimization || {};
  const foods = quantityText(result);
  const discreteValid = foods.every((entry) => {
    const source = IMPROVEMENT_FOODS[entry.id];
    return CONTINUOUS_UNITS.has(String(source?.unidadBase || "").toLowerCase()) ||
      Number.isInteger(Number(entry.quantity));
  });
  const fixedPreserved = Object.entries(definition.fixed).every(([id, quantity]) => (
    Number(foods.find((entry) => entry.id === id)?.quantity) === Number(quantity)
  ));
  const stable = JSON.stringify(quantityText(repeated)) === JSON.stringify(foods) &&
    JSON.stringify(repeated.totals) === JSON.stringify(result.totals);
  const diff = {
    kcal: round(result.totals.calorias - definition.target.kcal),
    proteina: round(result.totals.proteina - definition.target.proteina),
    carbs: round(result.totals.carbohidratos - definition.target.carbs),
    grasas: round(result.totals.grasas - definition.target.grasas),
  };
  return {
    id: definition.id,
    level: definition.level,
    label: definition.label,
    target: definition.target,
    consistency: definition.consistency,
    foods,
    totals: result.totals,
    diff,
    calorieDeficit: round(optimization.calorieDeficit, 6),
    proteinReached: optimization.proteinReached,
    warnings: warningText(optimization),
    timeMs: round(elapsedMs, 4),
    constrained: constrained ? {
      policy: constrained.optimization?.policy,
      foods: quantityText(constrained),
      totals: constrained.totals,
      calorieDeficit: round(definition.target.kcal - Number(constrained.totals?.calorias || 0), 6),
    } : null,
    checks: {
      policy: optimization.policy === TRACKING_CALORIE_FILL_POLICY,
      ceiling: result.totals.calorias <= definition.target.kcal + 1e-6,
      deterministic: stable,
      discreteValid,
      fixedPreserved,
      constrainedIsolated: !constrained || constrained.optimization?.policy === TRACKING_OPTIMIZATION_POLICY,
      finite: !/NaN|Infinity/.test(JSON.stringify(result)),
    },
  };
}

export async function runTrackingCalorieFillImprovementMatrix() {
  const rows = [];
  for (const definition of TRACKING_CALORIE_FILL_IMPROVEMENT_SCENARIOS) {
    rows.push(await runScenario(definition));
  }
  const failures = rows.flatMap((row) => Object.entries(row.checks)
    .filter(([, passed]) => !passed)
    .map(([check]) => `${row.id}:${check}`));
  return {
    generatedAt: new Date().toISOString(),
    rows,
    summary: {
      executed: rows.length,
      normal: rows.filter((row) => row.level === "normal").length,
      limited: rows.filter((row) => row.level === "limitado").length,
      extreme: rows.filter((row) => row.level === "extremo").length,
      uniqueTargets: new Set(rows.map((row) => JSON.stringify(row.target))).size,
      comparedWithConstrained: rows.filter((row) => row.constrained).length,
      withinOneKcal: rows.filter((row) => row.calorieDeficit <= 1 + 1e-6).length,
      overCeiling: rows.filter((row) => !row.checks.ceiling).map((row) => row.id),
      nondeterministic: rows.filter((row) => !row.checks.deterministic).map((row) => row.id),
      failures,
    },
  };
}
