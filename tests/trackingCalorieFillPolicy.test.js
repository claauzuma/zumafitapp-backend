import test from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

import {
  TRACKING_CALORIE_FILL_POLICY,
  TRACKING_OPTIMIZATION_POLICY,
} from "../menu2.js";
import ServicioAlimentos from "../servicio/alimentos.js";
import ServicioFoodLogs from "../servicio/foodLogs.js";

const DATE = "2026-07-27";

function food({
  id,
  name,
  unit = "Grs",
  kcal,
  protein = 0,
  carbs = 0,
  fat = 0,
  min = 1,
  max = 10,
  step = 5,
  category = "Otros",
  allowFractionalQuantity = false,
}) {
  return {
    _id: id,
    alimentoId: id,
    nombre: name,
    unidadBase: unit,
    macroBasis: "perUnit",
    cantidadUnidad: 1,
    kcalUnidad: kcal,
    proteinaUnidad: protein,
    carbohidratosUnidad: carbs,
    grasasUnidad: fat,
    porcionMin: min,
    porcionMax: max,
    porcionSugerida: min,
    multiplo: step,
    categoriaZumaFit: category,
    allowFractionalQuantity,
    activo: true,
  };
}

const CHICKEN = food({
  id: "chicken-skin",
  name: "Pechuga de pollo con piel",
  kcal: 1.242,
  protein: 0.2,
  fat: 0.05,
  min: 80,
  max: 250,
  step: 10,
  category: "Proteínas",
});

const CHEESE = food({
  id: "creamy-cheese",
  name: "Queso cremoso",
  kcal: 3.57,
  protein: 0.14,
  carbs: 0.01,
  fat: 0.33,
  min: 20,
  max: 80,
  step: 5,
  category: "Lácteos",
});

const RICE = food({
  id: "rice",
  name: "Arroz",
  kcal: 3.385,
  protein: 0.08,
  carbs: 0.755,
  fat: 0.005,
  min: 30,
  max: 120,
  step: 25,
  category: "Carbohidratos",
});

const OIL = food({
  id: "oil",
  name: "Aceite de oliva",
  kcal: 8.991,
  fat: 0.999,
  min: 5,
  max: 30,
  step: 5,
  category: "Grasas",
});

const EGG = food({
  id: "egg",
  name: "Huevos",
  unit: "Unid",
  kcal: 69,
  protein: 6,
  fat: 5,
  min: 1,
  max: 4,
  step: 1,
  category: "Proteínas",
});

const REGULAR_CHICKEN = food({
  id: "regular-chicken",
  name: "Pechuga de pollo",
  kcal: 1.105,
  protein: 0.22,
  fat: 0.025,
  min: 80,
  max: 250,
  step: 10,
  category: "Proteínas",
});

const WHITE_BREAD = food({
  id: "white-bread",
  name: "Pan blanco",
  kcal: 2.641,
  protein: 0.076,
  carbs: 0.51,
  fat: 0.033,
  min: 30,
  max: 150,
  step: 5,
  category: "Carbohidratos",
});

const ALMONDS = food({
  id: "almonds-unit",
  name: "Almendras",
  unit: "Unid",
  kcal: 7.15,
  protein: 0.26,
  carbs: 0.155,
  fat: 0.61,
  min: 1,
  max: 3,
  step: 1,
  category: "Grasas",
});

const ZERO = food({
  id: "zero",
  name: "Alimento sin información",
  kcal: 0,
  min: 1,
  max: 1,
  step: 1,
});

function pendingFood(entry) {
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
    allowFractionalQuantity: entry.allowFractionalQuantity,
  };
}

function fixedFood(entry, quantity) {
  return {
    ...pendingFood(entry),
    quantity,
    cantidad: quantity,
    kcal: entry.kcalUnidad * quantity,
    proteina: entry.proteinaUnidad * quantity,
    carbs: entry.carbohidratosUnidad * quantity,
    grasas: entry.grasasUnidad * quantity,
    source: "fixed",
  };
}

function payload(entries, target, overrides = {}) {
  return {
    date: DATE,
    trackingQuantityMode: "calorie_fill",
    target,
    fixedFoods: [],
    pendingFoods: entries.map(pendingFood),
    ...overrides,
  };
}

function trackingService(catalog) {
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

async function calculate(entries, target, overrides = {}) {
  return trackingService(entries).calculateRemainingQuantities(
    {},
    payload(entries, target, overrides)
  );
}

test("Tracking valida valores exactos y usa calorie_fill por defecto", async () => {
  const service = trackingService([CHICKEN]);
  const base = payload([CHICKEN], { kcal: 300, proteina: 30, carbs: 0, grasas: 10 });
  delete base.trackingQuantityMode;
  const result = await service.calculateRemainingQuantities({}, base);

  assert.equal(result.trackingQuantityMode, "calorie_fill");
  assert.equal(result.optimization.policy, TRACKING_CALORIE_FILL_POLICY);
  for (const invalid of [true, false, "CALORIE_FILL", "calorie-fill", "strict", ""] ) {
    await assert.rejects(
      service.calculateRemainingQuantities({}, { ...base, trackingQuantityMode: invalid }),
      /INVALID_TRACKING_QUANTITY_MODE/
    );
  }
});

test("el endpoint genérico no puede activar calorie_fill", async () => {
  const service = new ServicioAlimentos("TEST");
  service.model = { obtenerAlimentos: async () => [CHICKEN] };
  const result = await service.generarCantidades({
    ...payload([CHICKEN], { kcal: 903, proteina: 58.5, carbs: 38.4, grasas: 56.1 }),
    options: {
      trackingPriority: true,
      trackingOptimizationPolicy: TRACKING_CALORIE_FILL_POLICY,
    },
  });

  assert.equal(result.optimization, null);
  assert.equal(Object.hasOwn(result, "trackingQuantityMode"), false);
});

test("Pechuga + Queso conserva 596 kcal en constrained y completa 903 en calorie_fill", async () => {
  const service = trackingService([CHICKEN, CHEESE]);
  const target = { kcal: 903, proteina: 58.5, carbs: 38.4, grasas: 56.1 };
  const constrained = await service.calculateRemainingQuantities({}, payload(
    [CHICKEN, CHEESE],
    target,
    { trackingQuantityMode: "constrained" }
  ));
  const filled = await service.calculateRemainingQuantities({}, payload([CHICKEN, CHEESE], target));

  assert.equal(constrained.optimization.policy, TRACKING_OPTIMIZATION_POLICY);
  assert.deepEqual(constrained.foods.map((entry) => entry.quantity), [250, 80]);
  assert.equal(constrained.totals.calorias, 596.1);
  assert.equal(constrained.optimization.maxConstraintsLimited, true);

  assert.equal(filled.optimization.policy, TRACKING_CALORIE_FILL_POLICY);
  assert.ok(filled.totals.calorias <= 903);
  assert.ok(903 - filled.totals.calorias <= 1);
  assert.equal(filled.optimization.calorieTargetCompleted, true);
  assert.equal(filled.optimization.proteinReached, true);
  assert.ok(filled.optimization.exceededRecommendedPortions.length >= 1);
  assert.ok(filled.foods.some((entry) => entry.quantity > 80 || entry.quantity > 250));
});

test("un único alimento continuo ignora el máximo en 903 y 1200 kcal", async () => {
  for (const kcal of [903, 1200]) {
    const result = await calculate(
      [CHICKEN],
      { kcal, proteina: 58.5, carbs: 38.4, grasas: 56.1 }
    );
    assert.ok(result.foods[0].quantity > CHICKEN.porcionMax);
    assert.ok(result.totals.calorias <= kcal);
    assert.ok(kcal - result.totals.calorias <= 1);
    assert.equal(result.optimization.constraints[0].step, 1);
    assert.equal(result.optimization.constraints[0].kind, "continuous");
  }
});

test("gramos ignoran min/max/step recomendados y conservan cantidades enteras", async () => {
  const result = await calculate(
    [RICE],
    { kcal: 1200, proteina: 35, carbs: 250, grasas: 10 }
  );
  assert.ok(result.foods[0].quantity > RICE.porcionMax);
  assert.equal(Number.isInteger(result.foods[0].quantity), true);
  assert.equal(result.optimization.constraints[0].recommendedStep, 25);
  assert.equal(result.optimization.constraints[0].step, 1);
  assert.ok(result.totals.calorias <= 1200);
  assert.equal(result.optimization.granularityLimited, true);
});

test("las unidades discretas siguen siendo enteras y eligen el mejor valor inferior", async () => {
  const result = await calculate(
    [EGG],
    { kcal: 500, proteina: 40, carbs: 20, grasas: 30 }
  );
  assert.equal(result.foods[0].quantity, 7);
  assert.equal(Number.isInteger(result.foods[0].quantity), true);
  assert.equal(result.totals.calorias, 483);
  assert.equal(result.optimization.discreteOnly, true);
  assert.equal(result.optimization.discreteLimited, true);
  assert.match(result.message, /unidades enteras/i);
});

test("un Fijo queda intacto y los Auto completan sólo el restante", async () => {
  const fixedQuantity = 200;
  const target = { kcal: 900, proteina: 60, carbs: 80, grasas: 25 };
  const result = await calculate([CHICKEN, RICE, CHEESE], target, {
    fixedFoods: [fixedFood(CHICKEN, fixedQuantity)],
    pendingFoods: [pendingFood(RICE), pendingFood(CHEESE)],
  });
  const fixed = result.foods.find((entry) => entry.foodId === CHICKEN.alimentoId);

  assert.equal(fixed.quantity, fixedQuantity);
  assert.equal(fixed.source, "fixed");
  assert.ok(result.totals.calorias <= target.kcal);
  assert.ok(target.kcal - result.totals.calorias <= 1);
});

test("mezcla compleja con almendras fijas, huevo discreto y dos continuos no omite la mejor zona", async () => {
  const target = { kcal: 903, proteina: 58.5, carbs: 38.4, grasas: 56.1 };
  const result = await calculate(
    [REGULAR_CHICKEN, WHITE_BREAD, EGG, ALMONDS],
    target,
    {
      fixedFoods: [fixedFood(ALMONDS, 2)],
      pendingFoods: [
        pendingFood(REGULAR_CHICKEN),
        pendingFood(WHITE_BREAD),
        pendingFood(EGG),
      ],
    }
  );
  const quantities = Object.fromEntries(
    result.foods.map((entry) => [entry.foodId, entry.quantity])
  );

  assert.equal(quantities[ALMONDS.alimentoId], 2);
  assert.equal(Number.isInteger(quantities[EGG.alimentoId]), true);
  assert.ok(result.totals.calorias <= target.kcal);
  assert.ok(target.kcal - result.totals.calorias <= 1);
  assert.equal(result.optimization.proteinReached, true);
  assert.ok(Math.abs(result.totals.proteina - target.proteina) <= 1);
  assert.equal(result.optimization.exactSmallSearch.executed, true);
  assert.notDeepEqual(
    [
      quantities[REGULAR_CHICKEN.alimentoId],
      quantities[WHITE_BREAD.alimentoId],
      quantities[EGG.alimentoId],
    ],
    [63, 75, 9]
  );
});

test("la mezcla compleja conserva el resultado aunque cambie el orden de los Auto", async () => {
  const target = { kcal: 903, proteina: 58.5, carbs: 38.4, grasas: 56.1 };
  const permutations = [
    [REGULAR_CHICKEN, WHITE_BREAD, EGG],
    [REGULAR_CHICKEN, EGG, WHITE_BREAD],
    [WHITE_BREAD, REGULAR_CHICKEN, EGG],
    [WHITE_BREAD, EGG, REGULAR_CHICKEN],
    [EGG, REGULAR_CHICKEN, WHITE_BREAD],
    [EGG, WHITE_BREAD, REGULAR_CHICKEN],
  ];
  const results = [];
  for (const pending of permutations) {
    const result = await calculate(
      [REGULAR_CHICKEN, WHITE_BREAD, EGG, ALMONDS],
      target,
      {
        fixedFoods: [fixedFood(ALMONDS, 2)],
        pendingFoods: pending.map(pendingFood),
      }
    );
    results.push({
      foods: Object.fromEntries(
        result.foods.map((entry) => [entry.foodId, entry.quantity])
      ),
      totals: result.totals,
    });
  }

  for (const result of results.slice(1)) {
    assert.deepEqual(result, results[0]);
  }
});

test("cero kcal falla claro y nunca produce NaN o Infinity", async () => {
  const result = await calculate(
    [ZERO],
    { kcal: 500, proteina: 30, carbs: 50, grasas: 20 }
  );
  assert.equal(result.status, "error");
  assert.equal(result.optimization.policy, TRACKING_CALORIE_FILL_POLICY);
  assert.equal(result.optimization.invalidFoods[0].foodId, ZERO.alimentoId);
  assert.match(result.message, /informacion calorica valida/i);
  assert.equal(JSON.stringify(result).includes("NaN"), false);
  assert.equal(JSON.stringify(result).includes("Infinity"), false);
});

test("mezcla completa prioriza kcal, luego proteína y C/G, con resultado determinista", async () => {
  const entries = [CHICKEN, RICE, OIL];
  const target = { kcal: 650, proteina: 50, carbs: 70, grasas: 18 };
  const first = await calculate(entries, target);
  const second = await calculate(entries, target);

  assert.deepEqual(first.foods, second.foods);
  assert.deepEqual(first.totals, second.totals);
  assert.ok(first.totals.calorias <= target.kcal);
  assert.ok(target.kcal - first.totals.calorias <= 1);
  assert.equal(first.optimization.proteinReached, true);
  assert.ok(Math.abs(first.diff.carbohidratos) < 10);
  assert.ok(Math.abs(first.diff.grasas) < 6);
});

test("seis alimentos terminan en menos de 100 ms después del warmup", async () => {
  const extraProtein = food({ id: "fish", name: "Merluza", kcal: 0.9, protein: 0.18, fat: 0.02, min: 80, max: 250, step: 10, category: "Proteínas" });
  const extraCarb = food({ id: "potato", name: "Papas", kcal: 0.963, protein: 0.017, carbs: 0.19, fat: 0.015, min: 80, max: 350, step: 10, category: "Carbohidratos" });
  const extraFat = food({ id: "avocado", name: "Palta", kcal: 1.598, protein: 0.02, carbs: 0.042, fat: 0.15, min: 5, max: 30, step: 5, category: "Grasas" });
  const entries = [CHICKEN, RICE, OIL, extraProtein, extraCarb, extraFat];
  const target = { kcal: 1200, proteina: 90, carbs: 145, grasas: 35 };
  await calculate(entries, target);
  const started = performance.now();
  const result = await calculate(entries, target);
  const elapsed = performance.now() - started;

  assert.equal(result.foods.length, 6);
  assert.equal(result.optimization.allSelectedFoodsUsed, true);
  assert.ok(result.totals.calorias <= target.kcal);
  assert.ok(target.kcal - result.totals.calorias <= 1);
  assert.ok(elapsed < 100, `demoró ${elapsed.toFixed(2)} ms`);
});
