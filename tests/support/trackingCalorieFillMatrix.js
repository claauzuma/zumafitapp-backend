import { performance } from "node:perf_hooks";

import { TRACKING_CALORIE_FILL_POLICY, TRACKING_OPTIMIZATION_POLICY } from "../../menu2.js";
import ServicioAlimentos from "../../servicio/alimentos.js";
import ServicioFoodLogs from "../../servicio/foodLogs.js";
import {
  FIXED_BLUEPRINTS,
  FIXED_TARGETS,
  PROFILE_DESCRIPTIONS,
  RANDOM_BLUEPRINTS,
  REAL_FOOD_SNAPSHOTS,
  SNAPSHOT_BY_ID,
  SNAPSHOT_SHA256,
} from "./trackingAdversarialMatrix.js";

export const CALORIE_FILL_MATRIX_SEED = 0x43464d31;
export const CALORIE_FILL_FIXED_COUNT = 45;
export const CALORIE_FILL_RANDOM_COUNT = 100;
const DATE = "2026-07-27";
const CONTINUOUS_UNITS = new Set(["g", "gr", "grs", "gramo", "gramos", "ml", "mililitro", "mililitros"]);
const EPSILON = 1e-6;

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round((Number(value || 0) + Number.EPSILON) * factor) / factor;
}

function target(kcal, proteina, carbs, grasas) {
  return Object.freeze({ kcal, proteina, carbs, grasas });
}

function cloneFood(source, overrides = {}) {
  return Object.freeze({ ...source, ...overrides });
}

const CHICKEN_SKIN = cloneFood(SNAPSHOT_BY_ID.get(404), {
  _id: "calorie-fill-chicken-skin",
  sourceObjectId: "calorie-fill-chicken-skin",
  alimentoId: "calorie-fill-chicken-skin",
  nombre: "Pechuga de pollo con piel",
  nombreKey: "pechuga de pollo con piel",
  kcalUnidad: 1.242,
  proteinaUnidad: 0.2,
  carbohidratosUnidad: 0,
  grasasUnidad: 0.05,
  porcionMin: 80,
  porcionMax: 250,
  porcionSugerida: 150,
  multiplo: 10,
});

const ZERO_KCAL = cloneFood(SNAPSHOT_BY_ID.get(404), {
  _id: "calorie-fill-zero",
  sourceObjectId: "calorie-fill-zero",
  alimentoId: "calorie-fill-zero",
  nombre: "Alimento sin información calórica",
  nombreKey: "alimento sin informacion calorica",
  kcalUnidad: 0,
  proteinaUnidad: 0,
  carbohidratosUnidad: 0,
  grasasUnidad: 0,
  porcionMin: 1,
  porcionMax: 1,
  porcionSugerida: 1,
  multiplo: 1,
});

const EXTRA_FOODS = Object.freeze([CHICKEN_SKIN, ZERO_KCAL]);
const CATALOG = Object.freeze([...REAL_FOOD_SNAPSHOTS, ...EXTRA_FOODS]);
const CATALOG_BY_ID = new Map(CATALOG.map((food) => [String(food.alimentoId), food]));

function scenario(id, profile, combinationKind, foodIds, scenarioTarget, extra = {}) {
  return Object.freeze({
    id,
    profile,
    combinationKind,
    foodIds: Object.freeze([...foodIds]),
    target: scenarioTarget,
    registeredId: null,
    fixedId: null,
    plannedConsistency: "aproximadamente_consistente",
    expectedInvalid: false,
    ...extra,
  });
}

const REQUIRED_SCENARIOS = Object.freeze([
  scenario("CF001", "A", "incompleta", [404], target(903, 58.5, 38.4, 56.1), { highlight: "Una Pechuga, 903 kcal" }),
  scenario("CF002", "E", "incompleta", ["calorie-fill-chicken-skin", 455], target(903, 58.5, 38.4, 56.1), { highlight: "Caso real Pechuga con piel + Queso cremoso" }),
  scenario("CF003", "A", "incompleta", [404], target(1200, 90, 120, 40), { highlight: "Un alimento continuo, 1200 kcal" }),
  scenario("CF004", "E", "incompleta", [404, 2], target(1200, 90, 100, 45), { highlight: "Dos alimentos: proteico + graso" }),
  scenario("CF005", "G", "apropiada", [404, 39, 2], target(650, 50, 70, 18), { highlight: "Mezcla completa normal" }),
  scenario("CF006", "A", "incompleta", [404, 272, 241], target(900, 70, 95, 25), { highlight: "Sólo proteicos" }),
  scenario("CF007", "B", "incompleta", [39, 49, 391], target(900, 65, 120, 22), { highlight: "Sólo carbohidratos" }),
  scenario("CF008", "C", "incompleta", [2, 361, 282], target(900, 55, 95, 33), { highlight: "Sólo grasas" }),
  scenario("CF009", "H", "incompleta", [224], target(500, 40, 20, 30), { highlight: "Unidades enteras" }),
  scenario("CF010", "I", "apropiada", [404, 39, 455], target(900, 60, 80, 25), { fixedId: 404, fixedQuantity: 200, highlight: "Fijo + dos Auto" }),
  scenario("CF011", "I", "apropiada", [39, "calorie-fill-chicken-skin", 455], target(1200, 85, 130, 45), { registeredId: 39, registeredQuantity: 100, highlight: "Registrado descontado una vez + Auto" }),
  scenario("CF012", "G", "apropiada", [404, 39, 2, 272, 391, 361], target(1200, 90, 145, 35), { highlight: "Seis alimentos" }),
  scenario("CF013", "A", "absurda", ["calorie-fill-zero"], target(500, 30, 50, 20), { expectedInvalid: true, highlight: "Cero kcal explícito" }),
  scenario("CF014", "F", "incompleta", [39, 34], target(356, 0, 19.3, 41), { plannedConsistency: "fuertemente_incompatible", highlight: "P=0 neutral: arroz + almendras" }),
  scenario("CF015", "D", "absurda", [50, 589], target(450, 40, 50, 10), { highlight: "Azúcar + whey" }),
  scenario("CF016", "B", "incompleta", [39], target(1200, 35, 250, 10), { highlight: "Step recomendado 5 ignorado" }),
  scenario("CF017", "H", "absurda", [224, 54], target(700, 45, 80, 30), { highlight: "Dos unidades discretas" }),
  scenario("CF018", "G", "apropiada", [404, 39, 2], target(500, 45, 55, 11), { highlight: "Meta consistente completa" }),
  scenario("CF019", "G", "apropiada", [519, 49, 361], target(800, 60, 90, 22), { highlight: "Proteína vegetal + cereal + grasa" }),
  scenario("CF020", "B", "incompleta", [515], target(1500, 45, 300, 25), { highlight: "Alimento de baja densidad, objetivo alto" }),
]);

const DERIVED_FIXED = Object.freeze(FIXED_BLUEPRINTS.slice(20, 45).map((blueprint, index) => {
  const sourceTarget = FIXED_TARGETS.find((item) => item.id === blueprint.targetId);
  return scenario(
    `CF${String(index + 21).padStart(3, "0")}`,
    blueprint.profile,
    blueprint.combinationKind,
    blueprint.foodIds,
    target(sourceTarget.kcal, sourceTarget.proteina, sourceTarget.carbs, sourceTarget.grasas),
    {
      registeredId: blueprint.registeredId,
      fixedId: blueprint.fixedId,
      plannedConsistency: sourceTarget.consistency,
      highlight: `Cobertura fija derivada de ${blueprint.id}`,
    }
  );
}));

export const CALORIE_FILL_FIXED_SCENARIOS = Object.freeze([...REQUIRED_SCENARIOS, ...DERIVED_FIXED]);

function nutrition(food, quantity) {
  return {
    calorias: Number(food.kcalUnidad || 0) * quantity,
    proteina: Number(food.proteinaUnidad || 0) * quantity,
    carbohidratos: Number(food.carbohidratosUnidad || 0) * quantity,
    grasas: Number(food.grasasUnidad || 0) * quantity,
  };
}

function addTotals(...values) {
  return values.reduce((sum, value) => ({
    calorias: sum.calorias + Number(value?.calorias || 0),
    proteina: sum.proteina + Number(value?.proteina || 0),
    carbohidratos: sum.carbohidratos + Number(value?.carbohidratos || 0),
    grasas: sum.grasas + Number(value?.grasas || 0),
  }), { calorias: 0, proteina: 0, carbohidratos: 0, grasas: 0 });
}

function subtractRegistered(scenarioTarget, registeredTotals) {
  return {
    kcal: Math.max(0, scenarioTarget.kcal - registeredTotals.calorias),
    proteina: Math.max(0, scenarioTarget.proteina - registeredTotals.proteina),
    carbs: Math.max(0, scenarioTarget.carbs - registeredTotals.carbohidratos),
    grasas: Math.max(0, scenarioTarget.grasas - registeredTotals.grasas),
  };
}

function payloadFood(food, extra = {}) {
  const basis = Number(food.cantidadUnidad || 1) || 1;
  return {
    foodId: food.alimentoId,
    alimentoId: food.alimentoId,
    name: food.nombre,
    nombre: food.nombre,
    unit: food.unidadBase,
    unidad: food.unidadBase,
    macroBasis: food.macroBasis || "perUnit",
    kcalPerUnitOrGram: Number(food.kcalUnidad || 0) / basis,
    proteinPerUnitOrGram: Number(food.proteinaUnidad || 0) / basis,
    carbsPerUnitOrGram: Number(food.carbohidratosUnidad || 0) / basis,
    fatPerUnitOrGram: Number(food.grasasUnidad || 0) / basis,
    categoria: food.categoriaZumaFit,
    minGramos: food.porcionMin,
    maxGramos: food.porcionMax,
    stepGramos: food.multiplo,
    allowFractionalQuantity: food.allowFractionalQuantity === true,
    ...extra,
  };
}

function fixedPayload(food, quantity) {
  const totals = nutrition(food, quantity);
  return payloadFood(food, {
    quantity,
    cantidad: quantity,
    kcal: totals.calorias,
    proteina: totals.proteina,
    carbs: totals.carbohidratos,
    grasas: totals.grasas,
    source: "fixed",
    quantitySource: "manual",
    fixedQuantity: true,
  });
}

function foodForId(id) {
  const food = CATALOG_BY_ID.get(String(id));
  if (!food) throw new Error(`Snapshot faltante: ${id}`);
  return food;
}

function buildInput(definition) {
  const foods = definition.foodIds.map(foodForId);
  const registeredFood = definition.registeredId == null ? null : foodForId(definition.registeredId);
  const fixedFood = definition.fixedId == null ? null : foodForId(definition.fixedId);
  const registeredQuantity = registeredFood
    ? Number(definition.registeredQuantity ?? registeredFood.porcionSugerida ?? 1)
    : 0;
  const fixedQuantity = fixedFood
    ? Number(definition.fixedQuantity ?? fixedFood.porcionSugerida ?? 1)
    : 0;
  const registeredTotals = registeredFood ? nutrition(registeredFood, registeredQuantity) : addTotals();
  const engineTarget = subtractRegistered(definition.target, registeredTotals);
  const fixedFoods = fixedFood ? [fixedPayload(fixedFood, fixedQuantity)] : [];
  const pendingRows = foods.filter((food) =>
    String(food.alimentoId) !== String(definition.registeredId) &&
    String(food.alimentoId) !== String(definition.fixedId)
  );
  if (pendingRows.length < 1) throw new Error(`${definition.id}: no tiene alimentos Auto`);
  return {
    definition,
    foods,
    pendingRows,
    fixedFood,
    fixedQuantity,
    registeredFood,
    registeredQuantity,
    registeredTotals,
    engineTarget,
    payload: {
      date: DATE,
      mode: "kcalProteina",
      generationType: "selectedOnly",
      trackingQuantityMode: "calorie_fill",
      target: engineTarget,
      fixedFoods,
      pendingFoods: pendingRows.map((food) => payloadFood(food, {
        quantitySource: "auto",
        quantityPending: true,
      })),
    },
  };
}

function trackingService(catalog = CATALOG) {
  const service = new ServicioFoodLogs();
  service._actor = async () => ({
    _id: "507f1f77bcf86cd799439011",
    id: "507f1f77bcf86cd799439011",
    role: "cliente",
    plan: "pro",
    personalPlan: "pro",
  });
  service._assertCanWriteTracking = () => {};
  service.alimentosService.model = { obtenerAlimentos: async () => catalog };
  return service;
}

const SHARED_TRACKING_SERVICE = trackingService();

function randomTarget(index, definition, registeredCalories = 0, fixedCalories = 0) {
  let kcal = 200 + ((index * 173 + 431) % 1301);
  if (index === 0) kcal = 200;
  if (index === 1) kcal = 1500;
  kcal = Math.min(1500, Math.max(kcal, Math.ceil(registeredCalories + fixedCalories + 75)));
  const tier = index % 4;
  if (tier === 0) {
    return { value: target(kcal, round(kcal * 0.24 / 4, 1), round(kcal * 0.45 / 4, 1), round(kcal * 0.31 / 9, 1)), consistency: "consistente" };
  }
  if (tier === 1) {
    return { value: target(kcal, round(kcal * 0.27 / 4, 1), round(kcal * 0.42 / 4, 1), round(kcal * 0.28 / 9, 1)), consistency: "aproximada" };
  }
  if (tier === 2) {
    return { value: target(kcal, round(kcal * 0.43 / 4, 1), round(kcal * 0.58 / 4, 1), round(kcal * 0.4 / 9, 1)), consistency: "fuertemente_incompatible" };
  }
  return { value: target(kcal, 0, round(kcal * 0.55 / 4, 1), round(kcal * 0.45 / 9, 1)), consistency: "p_cero_neutral" };
}

function buildRandomScenarios() {
  return Object.freeze(RANDOM_BLUEPRINTS.slice(0, CALORIE_FILL_RANDOM_COUNT).map((blueprint, index) => {
    const registeredFood = blueprint.registeredId == null ? null : foodForId(blueprint.registeredId);
    const fixedFood = blueprint.fixedId == null ? null : foodForId(blueprint.fixedId);
    const registeredCalories = registeredFood
      ? nutrition(registeredFood, Number(registeredFood.porcionSugerida || 1)).calorias
      : 0;
    const fixedCalories = fixedFood
      ? nutrition(fixedFood, Number(fixedFood.porcionSugerida || 1)).calorias
      : 0;
    const generated = randomTarget(index, blueprint, registeredCalories, fixedCalories);
    return scenario(
      `CFR${String(index + 1).padStart(3, "0")}`,
      blueprint.profile,
      blueprint.combinationKind,
      blueprint.foodIds,
      generated.value,
      {
        registeredId: blueprint.registeredId,
        fixedId: blueprint.fixedId,
        plannedConsistency: generated.consistency,
        sourceBlueprint: blueprint.id,
      }
    );
  }));
}

export const CALORIE_FILL_RANDOM_SCENARIOS = buildRandomScenarios();

function stableProjection(response) {
  return {
    status: response.status,
    foods: (response.foods || []).map((food) => ({
      foodId: String(food.foodId),
      quantity: food.quantity,
      source: food.source,
    })),
    totals: response.totals,
    diff: response.diff,
    optimization: response.optimization,
    trackingQuantityMode: response.trackingQuantityMode,
  };
}

function resultQuantities(response) {
  return new Map((response.foods || []).map((food) => [String(food.foodId), Number(food.quantity)]));
}

function isContinuous(food) {
  return CONTINUOUS_UNITS.has(String(food.unidadBase || "").trim().toLowerCase());
}

function analyze(input, response, elapsedMs, deterministic) {
  const optimization = response.optimization || {};
  const quantities = resultQuantities(response);
  const combinedTotals = addTotals(input.registeredTotals, response.totals);
  const diff = {
    calorias: round(combinedTotals.calorias - input.definition.target.kcal),
    proteina: round(combinedTotals.proteina - input.definition.target.proteina),
    carbohidratos: round(combinedTotals.carbohidratos - input.definition.target.carbs),
    grasas: round(combinedTotals.grasas - input.definition.target.grasas),
  };
  const invalidIds = new Set((optimization.invalidFoods || []).map((item) => String(item.foodId)));
  const skippedIds = new Set((optimization.skippedFoods || []).map((item) => String(item.foodId)));
  const validPending = input.pendingRows.filter((food) => Number(food.kcalUnidad) > 0);
  const continuousValid = validPending.filter(isContinuous);
  const discreteValid = validPending.filter((food) => !isContinuous(food));
  const fixedPreserved = !input.fixedFood || Math.abs((quantities.get(String(input.fixedFood.alimentoId)) ?? NaN) - input.fixedQuantity) <= EPSILON;
  const registeredAbsent = !input.registeredFood || !quantities.has(String(input.registeredFood.alimentoId));
  const indivisiblePreserved = discreteValid.every((food) => {
    const quantity = quantities.get(String(food.alimentoId));
    return quantity == null || food.allowFractionalQuantity === true || Number.isInteger(quantity);
  });
  const finiteAndNonNegative = (response.foods || []).every((food) =>
    Number.isFinite(Number(food.quantity)) && Number(food.quantity) >= 0 &&
    [food.kcal, food.proteina, food.carbs, food.grasas].every((value) => Number.isFinite(Number(value || 0)))
  ) && !/NaN|Infinity/.test(JSON.stringify(response));
  const allUsedOrExplained = input.pendingRows.every((food) =>
    quantities.has(String(food.alimentoId)) || invalidIds.has(String(food.alimentoId)) || skippedIds.has(String(food.alimentoId))
  );
  const exactCeiling = Number(optimization.bestReachableCalories ?? response.totals?.calorias ?? 0) <= input.engineTarget.kcal + EPSILON;
  const visibleCeiling = combinedTotals.calorias <= input.definition.target.kcal + 0.011;
  const continuousWithinTwo = continuousValid.length === 0 || invalidIds.size > 0 || Number(optimization.calorieDeficit) <= 2 + EPSILON;
  const constraintsById = new Map((optimization.constraints || []).map((item) => [String(item.foodId), item]));
  const oneMoreStepFits = validPending.some((food) => {
    const constraint = constraintsById.get(String(food.alimentoId));
    const step = Number(constraint?.step || (isContinuous(food) ? 1 : 1));
    const stepCalories = Number(food.kcalUnidad || 0) * step;
    return stepCalories > EPSILON && stepCalories <= Number(optimization.calorieDeficit || 0) + EPSILON;
  });
  const continuousNearTarget = continuousWithinTwo || (
    optimization.granularityLimited === true && !oneMoreStepFits
  );
  const locallyNonDominated = invalidIds.size > 0 ||
    Number(optimization.calorieDeficit || 0) <= 1 + EPSILON ||
    !oneMoreStepFits;
  const recommendedConstraintsAreMetadata = (optimization.constraints || []).every((constraint) =>
    constraint.kind !== "continuous" || Number(constraint.step) === 1
  );
  const expectedInvalidHandled = !input.definition.expectedInvalid || (
    response.status === "error" && invalidIds.size > 0 && finiteAndNonNegative
  );
  const policyCorrect = optimization.policy === TRACKING_CALORIE_FILL_POLICY;
  const normalPerformance = elapsedMs < 100;

  const checks = {
    policyCorrect,
    exactCeiling,
    visibleCeiling,
    continuousNearTarget,
    recommendedConstraintsAreMetadata,
    fixedPreserved,
    registeredAbsent,
    indivisiblePreserved,
    finiteAndNonNegative,
    allUsedOrExplained,
    deterministic,
    locallyNonDominated,
    expectedInvalidHandled,
    normalPerformance,
  };
  const errors = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  const information = [];
  const warnings = [];
  if ((optimization.exceededRecommendedPortions || []).length > 0) {
    information.push("porciones recomendadas superadas intencionalmente");
  }
  if (optimization.discreteLimited) warnings.push("aproximación limitada por unidades enteras");
  if (optimization.granularityLimited && !optimization.discreteLimited) {
    information.push("aproximación limitada por granularidad física");
  }
  if ((optimization.macroLimitations || []).length > 0) {
    warnings.push("macronutrientes no alcanzables con la selección");
  }
  if (invalidIds.size > 0) warnings.push("alimento sin información calórica válida");
  if (optimization.proteinTargetActive === false) information.push("P=0 tratado como neutral");
  const status = errors.length > 0
    ? "FAIL"
    : information.length > 0 || warnings.length > 0
      ? "PASS CON INFORMACIÓN"
      : "PASS";

  return {
    id: input.definition.id,
    layer: input.definition.id.startsWith("CFR") ? "random" : "fija",
    profile: input.definition.profile,
    profileDescription: PROFILE_DESCRIPTIONS[input.definition.profile] || "Perfil especial",
    combinationKind: input.definition.combinationKind,
    plannedConsistency: input.definition.plannedConsistency,
    foodCount: input.foods.length,
    target: input.definition.target,
    engineTarget: Object.fromEntries(Object.entries(input.engineTarget).map(([key, value]) => [key, round(value)])),
    foods: input.foods.map((food) => ({
      foodId: food.alimentoId,
      nombre: food.nombre,
      unidad: food.unidadBase,
      recomendado: { min: food.porcionMin, max: food.porcionMax, step: food.multiplo },
      role: input.registeredFood && String(food.alimentoId) === String(input.registeredFood.alimentoId)
        ? "Registrado"
        : input.fixedFood && String(food.alimentoId) === String(input.fixedFood.alimentoId)
          ? "Fijo"
          : "Auto",
      quantity: input.registeredFood && String(food.alimentoId) === String(input.registeredFood.alimentoId)
        ? input.registeredQuantity
        : quantities.get(String(food.alimentoId)) ?? null,
    })),
    result: {
      totals: Object.fromEntries(Object.entries(combinedTotals).map(([key, value]) => [key, round(value)])),
      diff,
      calorieDeficit: round(Math.max(0, input.definition.target.kcal - combinedTotals.calorias)),
      proteinReached: optimization.proteinReached ?? null,
      policy: optimization.policy || null,
      message: response.message || "",
    },
    optimization: {
      calorieTargetCompleted: optimization.calorieTargetCompleted ?? false,
      discreteOnly: optimization.discreteOnly ?? false,
      discreteLimited: optimization.discreteLimited ?? false,
      granularityLimited: optimization.granularityLimited ?? false,
      allSelectedFoodsUsed: optimization.allSelectedFoodsUsed ?? false,
      macroLimitations: optimization.macroLimitations || [],
      exceededRecommendedPortions: optimization.exceededRecommendedPortions || [],
      invalidFoods: optimization.invalidFoods || [],
      skippedFoods: optimization.skippedFoods || [],
      iterations: optimization.iterations || 0,
    },
    checks,
    errors,
    information,
    warnings,
    status,
    timeMs: round(elapsedMs, 4),
    highlight: input.definition.highlight || "",
  };
}

async function execute(definition) {
  const input = buildInput(definition);
  const service = SHARED_TRACKING_SERVICE;
  const firstStarted = performance.now();
  const first = await service.calculateRemainingQuantities({}, structuredClone(input.payload));
  const firstTime = performance.now() - firstStarted;
  const secondStarted = performance.now();
  const second = await service.calculateRemainingQuantities({}, structuredClone(input.payload));
  const secondTime = performance.now() - secondStarted;
  const deterministic = JSON.stringify(stableProjection(first)) === JSON.stringify(stableProjection(second));
  const measured = Math.min(firstTime, secondTime);
  return analyze(input, second, measured, deterministic);
}

async function policyIsolationSentinel() {
  const chicken = foodForId(404);
  const request = {
    mode: "kcalProteina",
    generationType: "selectedOnly",
    target: { kcal: 500, proteina: 45, carbs: 55, grasas: 11 },
    fixedFoods: [],
    pendingFoods: [payloadFood(chicken)],
    options: {
      trackingPriority: true,
      trackingOptimizationPolicy: TRACKING_CALORIE_FILL_POLICY,
    },
  };
  const generic = new ServicioAlimentos("TEST");
  generic.model = { obtenerAlimentos: async () => CATALOG };
  const genericResult = await generic.generarCantidades(structuredClone(request));
  const constrained = await SHARED_TRACKING_SERVICE.calculateRemainingQuantities({}, {
    ...structuredClone(request),
    date: DATE,
    trackingQuantityMode: "constrained",
  });
  return {
    genericCannotActivateCalorieFill: genericResult.optimization === null && !Object.hasOwn(genericResult, "trackingQuantityMode"),
    constrainedKeepsHistoricalPolicy: constrained.optimization?.policy === TRACKING_OPTIMIZATION_POLICY,
    genericQuantities: (genericResult.foods || []).map((food) => food.quantity),
    constrainedPolicy: constrained.optimization?.policy || null,
  };
}

function counts(records) {
  return records.reduce((sum, record) => {
    sum.executed += 1;
    if (record.status === "PASS") sum.pass += 1;
    else if (record.status === "FAIL") sum.fail += 1;
    else sum.passWithInformation += 1;
    return sum;
  }, { executed: 0, pass: 0, passWithInformation: 0, fail: 0 });
}

function countBy(records, selector) {
  return records.reduce((result, record) => {
    const key = String(selector(record));
    result[key] = (result[key] || 0) + 1;
    return result;
  }, {});
}

function summary(fixed, random, isolation) {
  const all = [...fixed, ...random];
  const fixedCounts = counts(fixed);
  const randomCounts = counts(random);
  const totalCounts = counts(all);
  const times = all.map((record) => record.timeMs).sort((a, b) => a - b);
  return {
    fixed: fixedCounts,
    random: randomCounts,
    total: totalCounts,
    totalsClose: totalCounts.executed === fixedCounts.executed + randomCounts.executed &&
      totalCounts.executed === totalCounts.pass + totalCounts.passWithInformation + totalCounts.fail,
    byProfile: countBy(all, (record) => record.profile),
    byFoodCount: countBy(all, (record) => record.foodCount),
    byConsistency: countBy(all, (record) => record.plannedConsistency),
    byCombinationKind: countBy(all, (record) => record.combinationKind),
    proteinTargetActive: all.filter((record) => record.target.proteina > 0).length,
    proteinZeroNeutral: all.filter((record) => record.target.proteina === 0).length,
    proteinReached: all.filter((record) => record.target.proteina > 0 && record.result.proteinReached).length,
    proteinUnreached: all.filter((record) => record.target.proteina > 0 && record.result.proteinReached === false).length,
    continuousWithinTwoKcal: all.filter((record) => record.checks.continuousNearTarget).length,
    dominatedCandidates: all.filter((record) => !record.checks.locallyNonDominated).map((record) => record.id),
    ceilingViolations: all.filter((record) => !record.checks.exactCeiling || !record.checks.visibleCeiling).map((record) => record.id),
    deterministicFailures: all.filter((record) => !record.checks.deterministic).map((record) => record.id),
    over100ms: all.filter((record) => record.timeMs >= 100).map((record) => ({ id: record.id, timeMs: record.timeMs })),
    performance: {
      minMs: times[0] || 0,
      medianMs: times[Math.floor(times.length / 2)] || 0,
      p95Ms: times[Math.floor(times.length * 0.95)] || 0,
      maxMs: times.at(-1) || 0,
    },
    failures: all.filter((record) => record.status === "FAIL").map((record) => ({ id: record.id, errors: record.errors })),
    isolation,
  };
}

export async function runTrackingCalorieFillMatrix() {
  if (CALORIE_FILL_FIXED_SCENARIOS.length !== CALORIE_FILL_FIXED_COUNT) {
    throw new Error(`Cantidad fija inesperada: ${CALORIE_FILL_FIXED_SCENARIOS.length}`);
  }
  if (CALORIE_FILL_RANDOM_SCENARIOS.length !== CALORIE_FILL_RANDOM_COUNT) {
    throw new Error(`Cantidad random inesperada: ${CALORIE_FILL_RANDOM_SCENARIOS.length}`);
  }

  // Warm-up fuera de las mediciones informadas.
  await execute(CALORIE_FILL_FIXED_SCENARIOS[4]);
  const fixed = [];
  for (const definition of CALORIE_FILL_FIXED_SCENARIOS) fixed.push(await execute(definition));
  const random = [];
  for (const definition of CALORIE_FILL_RANDOM_SCENARIOS) random.push(await execute(definition));
  const isolation = await policyIsolationSentinel();
  return {
    metadata: {
      generatedAt: new Date().toISOString(),
      seed: CALORIE_FILL_MATRIX_SEED,
      seedHex: `0x${CALORIE_FILL_MATRIX_SEED.toString(16)}`,
      policy: TRACKING_CALORIE_FILL_POLICY,
      snapshotSha256: SNAPSHOT_SHA256,
      snapshotCount: REAL_FOOD_SNAPSHOTS.length,
      snapshotAccess: "snapshots embebidos; no se consultó ni modificó fooddatabase2",
      targetRangeKcal: [200, 1500],
      engineRunsPerScenario: 2,
      performanceMeasurement: "mínimo de dos ejecuciones deterministas posteriores al warm-up global",
    },
    summary: summary(fixed, random, isolation),
    fixed,
    random,
    detailed: fixed.slice(0, 20),
  };
}
