import assert from "node:assert/strict";
import test from "node:test";

import ServicioAlimentos from "../servicio/alimentos.js";
import { TRACKING_OPTIMIZATION_POLICY } from "../menu2.js";

function quantityService(databaseFoods = []) {
  const service = new ServicioAlimentos("TEST");
  service.model = { obtenerAlimentos: async () => databaseFoods };
  return service;
}

function catalogFood({
  id,
  name,
  unit,
  min = 1,
  max,
  step = 1,
  kcal = 10,
  protein = 1,
  carbs = 1,
  fat = 1,
  category = "Control",
}) {
  return {
    _id: id,
    alimentoId: Number(String(id).replace(/\D/g, "")) || undefined,
    nombre: name,
    unidad: unit,
    macroBasis: "perUnit",
    cantidadUnidad: 1,
    kcalUnidad: kcal,
    proteinaUnidad: protein,
    carbohidratosUnidad: carbs,
    grasasUnidad: fat,
    porcionMin: min,
    ...(max === undefined ? {} : { porcionMax: max }),
    porcionSugerida: 1,
    multiplo: step,
    categoria: category,
    activo: true,
  };
}

function pendingFood(food, overrides = {}) {
  return {
    foodId: food._id,
    name: food.nombre,
    unit: food.unidad,
    kcalPerUnitOrGram: food.kcalUnidad,
    proteinPerUnitOrGram: food.proteinaUnidad,
    carbsPerUnitOrGram: food.carbohidratosUnidad,
    fatPerUnitOrGram: food.grasasUnidad,
    categoria: food.categoria,
    ...overrides,
  };
}

function trackingPayload(food, overrides = {}) {
  return {
    mode: "kcalProteina",
    generationType: "selectedOnly",
    target: { kcal: 1000, proteina: 0, carbs: 0, grasas: 0 },
    fixedFoods: [],
    pendingFoods: [pendingFood(food, overrides)],
    options: {
      redondear: true,
      usarMinMax: true,
      trackingOptimizationPolicy: TRACKING_OPTIMIZATION_POLICY,
    },
  };
}

test("el catálogo valida el máximo por estructura y prevalece sobre un máximo ampliado por el cliente", async () => {
  const food = catalogFood({ id: "catalog-101", name: "Elemento discreto neutro", unit: "Unid", max: 3 });
  const result = await quantityService([food]).generarCantidades(
    trackingPayload(food, { minGramos: 1, maxGramos: 40, stepGramos: 1 })
  );

  assert.equal(result.foods[0].quantity, 3);
  assert.equal(result.foods[0].foodId, food._id);
  assert.equal(result.foods[0].maxGramos, 3);
  assert.deepEqual(result.optimization.constraints[0], {
    name: food.nombre,
    min: 1,
    max: 3,
    step: 1,
    minSource: "catalog.porcionMin",
    maxSource: "catalog.porcionMax",
    stepSource: "catalog.multiplo",
    maxExplicit: true,
  });
});

test("huevo, fruta, feta, scoop, cucharada y otro fruto seco usan el mismo contrato estructural", async () => {
  const fixtures = [
    catalogFood({ id: "catalog-201", name: "Huevo control", unit: "Unid", max: 4, kcal: 69 }),
    catalogFood({ id: "catalog-202", name: "Fruta por unidad", unit: "Unid", max: 3, kcal: 80 }),
    catalogFood({ id: "catalog-203", name: "Fiambre control", unit: "Fetas", max: 6, kcal: 25 }),
    catalogFood({ id: "catalog-204", name: "Proteína dosificada", unit: "Scoop", max: 2, kcal: 120 }),
    catalogFood({ id: "catalog-205", name: "Ingrediente medido", unit: "Cda", max: 4, kcal: 45 }),
    catalogFood({ id: "catalog-206", name: "Otro fruto seco", unit: "Unid", max: 5, kcal: 8 }),
  ];
  const service = quantityService(fixtures);

  for (const food of fixtures) {
    const result = await service.generarCantidades(trackingPayload(food));
    assert.equal(result.foods[0].quantity, food.porcionMax, food.nombre);
    assert.equal(result.foods[0].unit, food.unidad, food.nombre);
    assert.equal(result.foods[0].kcal, Number((food.kcalUnidad * food.porcionMax).toFixed(2)), food.nombre);
    assert.equal(result.foods[0].proteina, Number((food.proteinaUnidad * food.porcionMax).toFixed(2)), food.nombre);
    assert.equal(result.foods[0].carbs, Number((food.carbohidratosUnidad * food.porcionMax).toFixed(2)), food.nombre);
    assert.equal(result.foods[0].grasas, Number((food.grasasUnidad * food.porcionMax).toFixed(2)), food.nombre);
    assert.equal(result.optimization.constraints[0].min, food.porcionMin, food.nombre);
    assert.equal(result.optimization.constraints[0].max, food.porcionMax, food.nombre);
    assert.equal(result.optimization.constraints[0].step, food.multiplo, food.nombre);
    assert.equal(result.optimization.constraints[0].maxSource, "catalog.porcionMax", food.nombre);
  }

  const egg = fixtures[0];
  const eggResult = await service.generarCantidades({
    ...trackingPayload(egg),
    target: { kcal: 300, proteina: 0, carbs: 0, grasas: 0 },
  });
  assert.equal(eggResult.foods[0].quantity, 4);
  assert.equal(eggResult.foods[0].kcal, 276);
  assert.ok(egg.kcalUnidad * 5 > 300, "cinco huevos exceden el techo del fixture");
});

test("porción sugerida y máximo son conceptos distintos; si falta máximo se informa el fallback discreto", async () => {
  const food = catalogFood({ id: "catalog-301", name: "Unidad sin máximo", unit: "Porcion" });
  food.porcionSugerida = 3;
  food.servingSize = 2;
  food.cantidadUnidad = 1;
  const result = await quantityService([food]).generarCantidades(trackingPayload(food));

  assert.equal(result.foods[0].quantity, 12);
  assert.equal(result.optimization.constraints[0].max, 12);
  assert.equal(result.optimization.constraints[0].maxSource, "fallback.discrete.max12");
  assert.equal(result.optimization.constraints[0].maxExplicit, false);
  assert.equal(result.optimization.maxConstraintsLimited, false);
});

test("Admin y Coach conservan su policy y estructura, pero reciben el máximo real del catálogo", async () => {
  const food = catalogFood({ id: "catalog-401", name: "Unidad compartida", unit: "Unid", max: 3 });
  const payload = {
    mode: "kcalProteina",
    generationType: "selectedOnly",
    target: { kcal: 100, proteina: 0, carbs: 0, grasas: 0 },
    fixedFoods: [],
    pendingFoods: [pendingFood(food)],
    options: { redondear: true, usarMinMax: true },
  };
  const service = quantityService([food]);
  const admin = await service.generarCantidades(payload);
  const coach = await service.generarCantidades(structuredClone(payload));

  assert.deepEqual(admin, coach);
  assert.equal(admin.optimization, null);
  assert.equal(admin.foods[0].quantity, 3);
  assert.equal(admin.foods[0].maxGramos, 3);
  assert.equal(Object.hasOwn(admin.foods[0], "minGramos"), false);
  assert.equal(Object.hasOwn(admin.foods[0], "stepGramos"), false);
});

test("el boolean legacy no habilita la policy Tracking en el endpoint compartido", async () => {
  const food = catalogFood({ id: "catalog-policy-guard", name: "Control de policy", unit: "Unid", max: 3 });
  const basePayload = {
    mode: "kcalProteina",
    generationType: "selectedOnly",
    target: { kcal: 100, proteina: 0, carbs: 0, grasas: 0 },
    fixedFoods: [],
    pendingFoods: [pendingFood(food)],
  };
  const service = quantityService([food]);

  const legacyBoolean = await service.generarCantidades({
    ...basePayload,
    options: { redondear: true, usarMinMax: true, trackingPriority: true },
  });
  const invalidPolicy = await service.generarCantidades({
    ...basePayload,
    options: {
      redondear: true,
      usarMinMax: true,
      trackingPriority: true,
      trackingOptimizationPolicy: "tracking_no_permitida",
    },
  });
  const explicitTracking = await service.generarCantidades({
    ...basePayload,
    options: {
      redondear: true,
      usarMinMax: true,
      trackingPriority: true,
      trackingOptimizationPolicy: TRACKING_OPTIMIZATION_POLICY,
    },
  });

  assert.equal(legacyBoolean.optimization, null);
  assert.equal(invalidPolicy.optimization, null);
  assert.equal(explicitTracking.optimization?.policy, TRACKING_OPTIMIZATION_POLICY);
});

test("la comida automática normal de Admin y Coach respeta los steps reales sin cambiar de policy", async () => {
  const foods = [
    catalogFood({
      id: "catalog-601",
      name: "Pechuga de pollo",
      unit: "Grs",
      min: 80,
      max: 250,
      step: 10,
      kcal: 1.105,
      protein: 0.22,
      carbs: 0,
      fat: 0.025,
      category: "Proteínas",
    }),
    catalogFood({
      id: "catalog-602",
      name: "Arroz",
      unit: "Grs",
      min: 30,
      max: 120,
      step: 5,
      kcal: 3.385,
      protein: 0.08,
      carbs: 0.755,
      fat: 0.005,
      category: "Carbohidratos",
    }),
    catalogFood({
      id: "catalog-603",
      name: "Aceite de oliva",
      unit: "Grs",
      min: 5,
      max: 30,
      step: 5,
      kcal: 8.991,
      protein: 0,
      carbs: 0,
      fat: 0.999,
      category: "Grasas",
    }),
  ];
  const payload = {
    mode: "kcalProteina",
    generationType: "selectedOnly",
    target: { kcal: 500, proteina: 35, carbs: 55, grasas: 15 },
    fixedFoods: [],
    pendingFoods: foods.map(pendingFood),
    options: { redondear: true, usarMinMax: true },
  };
  const service = quantityService(foods);
  const admin = await service.generarCantidades(payload);
  const coach = await service.generarCantidades(structuredClone(payload));

  assert.deepEqual(admin, coach);
  assert.equal(admin.optimization, null);
  assert.deepEqual(admin.foods.map((food) => [food.name, food.quantity, food.maxGramos]), [
    ["Pechuga de pollo", 140, 250],
    ["Arroz", 75, 120],
    ["Aceite de oliva", 10, 30],
  ]);
  assert.deepEqual(admin.totals, {
    calorias: 498.48,
    proteina: 36.8,
    carbohidratos: 56.63,
    grasas: 13.87,
  });
});

test("el listado colapsa homónimos por nombre y unidad y prefiere el registro estructurado activo", async () => {
  const canonical = catalogFood({ id: "catalog-501", name: "Duplicado control", unit: "Unid", max: 3 });
  const legacy = {
    _id: "legacy-501",
    Alimentos: "Duplicado control",
    Unidad: "Unid",
    Calorias: 10,
    Proteinas: 1,
    Carbohidratos: 1,
    Grasas: 1,
  };
  const foods = await quantityService([legacy, canonical]).obtenerAlimentos({ search: "duplicado control" });

  assert.equal(foods.length, 1);
  assert.equal(foods[0]._id, canonical._id);
  assert.equal(foods[0].porcionMax, 3);
});
