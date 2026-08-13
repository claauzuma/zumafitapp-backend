import assert from "node:assert/strict";
import test from "node:test";

import {
  FOOD_COMBINATION_MODES,
} from "../servicio/foodCombinationCandidates.js";
import {
  generateMealAlternative,
  recalculateMealAlternativeQuantities,
} from "../servicio/mealAlternativeGenerator.js";
import { defaultFoodGeneration } from "../servicio/foodGenerationMetadata.js";
import ServicioAlimentos from "../servicio/alimentos.js";
import ServicioClientOwnMenus from "../servicio/clientOwnMenus.js";

function generation(role, { mode = "GENERIC" } = {}) {
  const value = defaultFoodGeneration();
  value.mode = mode;
  value.roles[role] = true;
  value.mealTypes.lunch = true;
  return value;
}

function withPortionRule(entry, portionRule, legacy = {}) {
  return {
    ...entry,
    ...legacy,
    generation: {
      ...entry.generation,
      portionRule: { allowedValues: [], ...portionRule },
    },
  };
}

function food(id, name, role, macros, overrides = {}) {
  return {
    _id: id,
    alimentoId: overrides.alimentoId || id,
    nombre: name,
    Alimentos: name,
    unidad: overrides.unit || "g",
    Unidad: overrides.unit || "g",
    macroBasis: overrides.unit && overrides.unit !== "g" ? "perUnit" : "perGram",
    Calorias: macros.kcal,
    Proteinas: macros.proteina,
    Carbohidratos: macros.carbs,
    Grasas: macros.grasas,
    kcalUnidad: macros.kcal,
    proteinaUnidad: macros.proteina,
    carbohidratosUnidad: macros.carbs,
    grasasUnidad: macros.grasas,
    activo: overrides.active !== false,
    generation: generation(role, { mode: overrides.mode }),
  };
}

const catalog = [
  food("pollo", "Pechuga de pollo", "P1", { kcal: 1.1, proteina: 0.2, carbs: 0, grasas: 0 }),
  food("huevo", "Huevos", "P2", { kcal: 75, proteina: 6.3, carbs: 0.6, grasas: 5 }, { unit: "unidad" }),
  food("arroz", "Arroz", "C1", { kcal: 3.39, proteina: 0.08, carbs: 0.755, grasas: 0.005 }),
  food("pan", "Pan", "C2", { kcal: 2.65, proteina: 0.09, carbs: 0.49, grasas: 0.032 }),
  food("tomate", "Tomate", "V", { kcal: 0.21, proteina: 0.009, carbs: 0.039, grasas: 0.002 }),
  food("banana", "Banana", "F", { kcal: 0.89, proteina: 0.011, carbs: 0.228, grasas: 0.003 }),
  food("aceite", "Aceite de oliva", "G", { kcal: 8.99, proteina: 0, carbs: 0, grasas: 1 }),
];

function modelFor(source = catalog) {
  const byId = new Map(source.flatMap((entry) => [
    [String(entry._id), entry],
    [String(entry.alimentoId), entry],
  ]));
  return {
    obtenerAlimentos: async () => source,
    obtenerAlimentosPorIds: async (ids) => ids.map((id) => byId.get(String(id))).filter(Boolean),
    obtenerAlimentoPorId: async (id) => byId.get(String(id)) || null,
    obtenerAlimentosGeneracionAutomatica: async ({ mealType, roles }) => source.filter((entry) =>
      entry.generation.mode === "GENERIC" &&
      entry.generation.mealTypes[mealType] === true &&
      roles.some((role) => entry.generation.roles[role] === true)
    ),
  };
}

const baseTarget = { kcal: 650, proteina: 45, carbs: 75, grasas: 18 };

function request(overrides = {}) {
  return {
    mealType: "almuerzo",
    target: baseTarget,
    requiredFoodIds: [],
    excludedFoodIds: [],
    generationMode: FOOD_COMBINATION_MODES.ALLOW_SUGGESTIONS,
    limit: 32,
    maxFoods: 6,
    ...overrides,
  };
}

test("A: ALLOW_SUGGESTIONS genera una combinacion valida con cantidades y target real", async () => {
  const result = await generateMealAlternative(request(), { model: modelFor() });
  assert.equal(result.status, "SUCCESS");
  assert.ok(result.alternative.foods.length >= 2);
  assert.ok(result.alternative.foods.every((entry) => entry.quantity > 0));
  assert.ok(result.alternative.totals.kcal <= baseTarget.kcal);
  assert.ok(baseTarget.kcal - result.alternative.totals.kcal <= 1);
  assert.deepEqual(result.alternative.target, baseTarget);
  assert.ok(result.meta.combinationCandidatesEvaluated > 1);
  assert.ok(result.meta.quantitySolutionsFound > 1);
});

test("B: pollo y arroz requeridos son hard constraints y puede sumar opcionales", async () => {
  const result = await generateMealAlternative(request({
    requiredFoodIds: ["pollo", "arroz"],
  }), { model: modelFor() });
  const all = [result.alternative, ...result.alternatives];
  assert.ok(all.length > 1);
  assert.ok(all.every((alternative) => {
    const ids = alternative.foods.map((entry) => entry.foodId);
    return ids.includes("pollo") && ids.includes("arroz");
  }));
  assert.ok(all.some((alternative) => alternative.foods.length > 2));
});

test("C: ONLY_SELECTED conserva exactamente pollo y arroz y declara best effort", async () => {
  const target = { kcal: 650, proteina: 45, carbs: 75, grasas: 40 };
  const result = await generateMealAlternative(request({
    target,
    requiredFoodIds: ["pollo", "arroz"],
    generationMode: FOOD_COMBINATION_MODES.ONLY_SELECTED_FOODS,
  }), { model: modelFor() });
  assert.equal(result.status, "SUCCESS");
  assert.deepEqual(result.alternative.foods.map((entry) => entry.foodId).sort(), ["arroz", "pollo"]);
  assert.equal(result.alternative.status, "TARGET_NOT_REACHABLE_WITH_SELECTED_FOODS");
  assert.ok(result.alternative.totals.kcal <= target.kcal);
});

test("D: excluded banana jamas llega a ninguna solucion", async () => {
  const result = await generateMealAlternative(request({ excludedFoodIds: ["banana"] }), { model: modelFor() });
  assert.ok([result.alternative, ...result.alternatives].every((alternative) =>
    alternative.foods.every((entry) => entry.foodId !== "banana")
  ));
});

test("E: EXPLICIT_ONLY requerido entra al solver con macros y unidad reales", async () => {
  const explicitCatalog = catalog.map((entry) => entry._id === "pan"
    ? { ...entry, generation: generation("C2", { mode: "EXPLICIT_ONLY" }) }
    : entry
  );
  const result = await generateMealAlternative(request({
    requiredFoodIds: ["pollo", "arroz", "pan"],
  }), { model: modelFor(explicitCatalog) });
  assert.equal(result.status, "SUCCESS");
  assert.ok([result.alternative, ...result.alternatives].every((alternative) =>
    alternative.foods.some((entry) => entry.foodId === "pan" && entry.quantity > 0)
  ));
});

test("la regla generation del alimento prevalece sobre constraints legacy incompatibles", async () => {
  const rice = food(
    "arrozRegla",
    "Arroz regla",
    "C1",
    { kcal: 3.39, proteina: 0.08, carbs: 0.755, grasas: 0.005 },
  );
  rice.porcionMin = 30;
  rice.porcionMax = 120;
  rice.multiplo = 5;
  rice.generation.portionRule = {
    unit: "g",
    min: 80,
    max: 200,
    step: 10,
    allowedValues: [],
  };
  const chicken = food(
    "polloRegla",
    "Pechuga regla",
    "P1",
    { kcal: 1.1, proteina: 0.2, carbs: 0, grasas: 0 },
  );
  chicken.porcionMin = 80;
  chicken.porcionMax = 250;
  chicken.multiplo = 10;
  chicken.generation.portionRule = {
    unit: "g",
    min: 100,
    max: 350,
    step: 10,
    allowedValues: [],
  };

  const result = await generateMealAlternative(request({
    target: { kcal: 426.2, proteina: 31.4, carbs: 67.95, grasas: 3.2 },
    requiredFoodIds: ["polloRegla", "arrozRegla"],
    generationMode: FOOD_COMBINATION_MODES.ONLY_SELECTED_FOODS,
  }), { model: modelFor([rice, chicken]) });

  assert.equal(result.status, "SUCCESS");
  assert.equal(result.relaxation.level, "STRICT");
  const riceQuantity = result.alternative.foods.find((entry) => entry.foodId === "arrozRegla").quantity;
  const chickenQuantity = result.alternative.foods.find((entry) => entry.foodId === "polloRegla").quantity;
  assert.ok(riceQuantity >= 80 && riceQuantity <= 200);
  assert.equal((riceQuantity - 80) % 10, 0);
  assert.ok(chickenQuantity >= 100 && chickenQuantity <= 350);
  assert.equal((chickenQuantity - 100) % 10, 0);
  const riceConstraint = result.alternative.optimization.constraints.find((entry) => entry.foodId === "arrozRegla");
  const chickenConstraint = result.alternative.optimization.constraints.find((entry) => entry.foodId === "polloRegla");
  assert.equal(riceConstraint.unit, "g");
  assert.equal(riceConstraint.kind, "continuous");
  assert.equal(riceConstraint.step, 10);
  assert.equal(riceConstraint.recommendedMin, 80);
  assert.equal(riceConstraint.recommendedMax, 200);
  assert.equal(riceConstraint.recommendedStep, 10);
  assert.ok(riceConstraint.technicalMax <= 200);
  assert.equal(riceConstraint.minExplicit, true);
  assert.equal(riceConstraint.maxExplicit, true);
  assert.equal(riceConstraint.stepExplicit, true);
  assert.equal(riceConstraint.minSource, "catalog.minGramos");
  assert.equal(riceConstraint.maxSource, "catalog.maxGramos");
  assert.equal(riceConstraint.stepSource, "catalog.stepGramos");
  assert.equal(chickenConstraint.recommendedMin, 100);
  assert.equal(chickenConstraint.recommendedMax, 350);
  assert.equal(chickenConstraint.recommendedStep, 10);
});

test("el catálogo temporal de cada ronda contiene una sola regla por identidad exacta", async () => {
  const rice = withPortionRule(
    food("riceUnique", "Arroz único", "C1", { kcal: 1, proteina: 0.1, carbs: 0.2, grasas: 0 }),
    { unit: "g", min: 80, max: 200, step: 10 },
    { porcionMin: 30, porcionMax: 120, multiplo: 5 },
  );
  const chicken = withPortionRule(
    food("chickenUnique", "Pollo único", "P1", { kcal: 1, proteina: 0.2, carbs: 0, grasas: 0 }),
    { unit: "g", min: 100, max: 350, step: 10 },
  );
  const quantityService = new ServicioAlimentos("MONGO");
  const solve = quantityService.generarCantidades.bind(quantityService);
  const counts = [];
  quantityService.generarCantidades = async (...args) => {
    const originalGenerate = quantityService.model.obtenerAlimentos;
    quantityService.model.obtenerAlimentos = async () => {
      const values = await originalGenerate();
      counts.push(values.filter((entry) => entry._id === "riceUnique").length);
      return values;
    };
    return await solve(...args);
  };
  const result = await generateMealAlternative(request({
    target: { kcal: 200, proteina: 30, carbs: 20, grasas: 0 },
    requiredFoodIds: ["chickenUnique", "riceUnique"],
    generationMode: FOOD_COMBINATION_MODES.ONLY_SELECTED_FOODS,
  }), { model: modelFor([rice, chicken]), quantityService });

  assert.equal(result.status, "SUCCESS");
  assert.ok(counts.length > 0);
  assert.ok(counts.every((count) => count === 1));
});

test("STRICT gana antes de relajar cuando ya cumple kcal y proteina recomendadas", async () => {
  const rice = withPortionRule(
    food("riceStrict", "Arroz strict", "C1", { kcal: 1, proteina: 0.1, carbs: 0.2, grasas: 0 }),
    { unit: "g", min: 80, max: 200, step: 10 },
  );
  const chicken = withPortionRule(
    food("chickenStrict", "Pollo strict", "P1", { kcal: 1, proteina: 0.2, carbs: 0, grasas: 0 }),
    { unit: "g", min: 100, max: 350, step: 10 },
  );
  const result = await generateMealAlternative(request({
    target: { kcal: 200, proteina: 30, carbs: 20, grasas: 0 },
    requiredFoodIds: ["chickenStrict", "riceStrict"],
    generationMode: FOOD_COMBINATION_MODES.ONLY_SELECTED_FOODS,
  }), { model: modelFor([rice, chicken]) });

  assert.equal(result.status, "SUCCESS");
  assert.equal(result.relaxation.level, "STRICT");
  assert.equal(result.meta.rounds.length, 1);
  assert.equal(result.meta.rounds[0].level, "STRICT");
});

test("RELAX_STEP evalua toda la ronda y solo cambia step 10 continuo a 5", async () => {
  const rice = withPortionRule(
    food("riceStep", "Arroz step", "C1", { kcal: 1, proteina: 0.1, carbs: 0.2, grasas: 0 }),
    { unit: "g", min: 80, max: 200, step: 10 },
  );
  const chicken = withPortionRule(
    food("chickenStep", "Pollo step", "P1", { kcal: 1, proteina: 0.2, carbs: 0, grasas: 0 }),
    { unit: "g", min: 100, max: 350, step: 10 },
  );
  const result = await generateMealAlternative(request({
    target: { kcal: 185, proteina: 31, carbs: 15, grasas: 0 },
    requiredFoodIds: ["chickenStep", "riceStep"],
    generationMode: FOOD_COMBINATION_MODES.ONLY_SELECTED_FOODS,
  }), { model: modelFor([rice, chicken]) });

  assert.equal(result.status, "SUCCESS");
  assert.equal(result.relaxation.level, "RELAX_STEP");
  assert.deepEqual(result.meta.rounds.map((round) => round.level), ["STRICT", "RELAX_STEP"]);
  assert.ok(result.meta.rounds.every((round) => round.candidatesProcessed === result.meta.combinationCandidatesEvaluated));
  assert.ok(result.alternative.optimization.constraints.every((constraint) => constraint.step === 5));
  assert.ok(result.alternative.optimization.constraints.every((constraint) =>
    constraint.recommendedMax === (constraint.foodId === "riceStep" ? 200 : 350)
  ));
  assert.ok(result.alternative.foods.every((entry) => entry.quantity % 5 === 0));
  assert.ok(result.alternative.foods.every((entry) =>
    entry.quantity <= (entry.foodId === "riceStep" ? 200 : 350)
  ));
});

test("RELAX_STEP no cambia el step de una unidad discreta", async () => {
  const egg = withPortionRule(
    food("eggDiscrete", "Huevo discreto", "P1", { kcal: 60, proteina: 6, carbs: 0, grasas: 4 }, { unit: "unidad" }),
    { unit: "unidad", min: 1, max: 40, step: 10 },
  );
  const rice = withPortionRule(
    food("riceDiscrete", "Arroz discreto control", "C1", { kcal: 1, proteina: 0, carbs: 0.2, grasas: 0 }),
    { unit: "g", min: 80, max: 200, step: 10 },
  );
  const quantityService = new ServicioAlimentos("MONGO");
  const solve = quantityService.generarCantidades.bind(quantityService);
  const effectiveEggRules = [];
  quantityService.generarCantidades = async (...args) => {
    const effectiveCatalog = await quantityService.model.obtenerAlimentos();
    effectiveEggRules.push(effectiveCatalog.find((entry) => entry._id === "eggDiscrete").generation.portionRule);
    return await solve(...args);
  };
  const result = await generateMealAlternative(request({
    target: { kcal: 145, proteina: 8, carbs: 17, grasas: 4 },
    requiredFoodIds: ["eggDiscrete", "riceDiscrete"],
    generationMode: FOOD_COMBINATION_MODES.ONLY_SELECTED_FOODS,
  }), { model: modelFor([egg, rice]), quantityService });

  assert.equal(result.status, "NO_SOLUTION");
  assert.equal(result.code, "MEAL_TARGET_NOT_REACHABLE_WITH_PORTION_RULES");
  assert.equal(result.meta.rounds.length, 3);
  assert.deepEqual(effectiveEggRules.map((rule) => rule.step), [10, 10, 10]);
  assert.deepEqual(effectiveEggRules.map((rule) => rule.min), [1, 1, 1]);
});

test("portionRule sin configurar conserva los constraints legacy en lugar de borrarlos", async () => {
  const rice = withPortionRule(
    food("riceLegacy", "Arroz legacy", "C1", { kcal: 1, proteina: 0.1, carbs: 0.2, grasas: 0 }),
    { unit: "g", min: null, max: null, step: null },
    { porcionMin: 100, porcionMax: 200, multiplo: 10 },
  );
  const chicken = withPortionRule(
    food("chickenLegacy", "Pollo legacy", "P1", { kcal: 1, proteina: 0.2, carbs: 0, grasas: 0 }),
    { unit: "g", min: null, max: null, step: null },
    { porcionMin: 100, porcionMax: 200, multiplo: 10 },
  );
  const result = await generateMealAlternative(request({
    target: { kcal: 200, proteina: 30, carbs: 20, grasas: 0 },
    requiredFoodIds: ["chickenLegacy", "riceLegacy"],
    generationMode: FOOD_COMBINATION_MODES.ONLY_SELECTED_FOODS,
  }), { model: modelFor([rice, chicken]) });

  assert.equal(result.status, "SUCCESS");
  assert.equal(result.relaxation.level, "STRICT");
  const riceConstraint = result.alternative.optimization.constraints.find((entry) => entry.foodId === "riceLegacy");
  assert.equal(riceConstraint.recommendedMin, 100);
  assert.equal(riceConstraint.recommendedMax, 200);
  assert.equal(riceConstraint.recommendedStep, 10);
  assert.equal(riceConstraint.minSource, "catalog.porcionMin");
  assert.equal(riceConstraint.maxSource, "catalog.porcionMax");
  assert.equal(riceConstraint.stepSource, "catalog.multiplo");
});

test("RELAX_MIN baja solo min de g/ml en 20, conserva step efectivo y MAX hard", async () => {
  const rice = withPortionRule(
    food("riceMin", "Arroz min", "C1", { kcal: 1, proteina: 0.1, carbs: 0.2, grasas: 0 }),
    { unit: "g", min: 80, max: 200, step: 10 },
  );
  const chicken = withPortionRule(
    food("chickenMin", "Pollo min", "P1", { kcal: 1, proteina: 0.2, carbs: 0, grasas: 0 }),
    { unit: "g", min: 100, max: 350, step: 10 },
  );
  const result = await generateMealAlternative(request({
    target: { kcal: 165, proteina: 26.5, carbs: 13, grasas: 0 },
    requiredFoodIds: ["chickenMin", "riceMin"],
    generationMode: FOOD_COMBINATION_MODES.ONLY_SELECTED_FOODS,
  }), { model: modelFor([rice, chicken]) });

  assert.equal(result.status, "SUCCESS");
  assert.equal(result.relaxation.level, "RELAX_MIN");
  assert.deepEqual(result.meta.rounds.map((round) => round.level), ["STRICT", "RELAX_STEP", "RELAX_MIN"]);
  const riceConstraint = result.alternative.optimization.constraints.find((item) => item.foodId === "riceMin");
  const chickenConstraint = result.alternative.optimization.constraints.find((item) => item.foodId === "chickenMin");
  assert.equal(riceConstraint.recommendedMin, 60);
  assert.equal(chickenConstraint.recommendedMin, 80);
  assert.equal(riceConstraint.step, 5);
  assert.equal(chickenConstraint.step, 5);
  assert.equal(riceConstraint.recommendedMax, 200);
  assert.equal(chickenConstraint.recommendedMax, 350);
  assert.ok(result.alternative.foods.every((entry) => {
    const max = entry.foodId === "riceMin" ? 200 : 350;
    return entry.quantity <= max;
  }));
});

test("una unidad discreta conserva su min durante RELAX_MIN", async () => {
  const egg = withPortionRule(
    food("eggMin", "Huevo min", "P1", { kcal: 60, proteina: 6, carbs: 0, grasas: 4 }, { unit: "unidad" }),
    { unit: "unidad", min: 2, max: 4, step: 1 },
  );
  const rice = withPortionRule(
    food("riceMinDiscrete", "Arroz min discreto", "C1", { kcal: 1, proteina: 0, carbs: 0.2, grasas: 0 }),
    { unit: "g", min: 80, max: 200, step: 10 },
  );
  const result = await generateMealAlternative(request({
    target: { kcal: 185, proteina: 12, carbs: 13, grasas: 8 },
    requiredFoodIds: ["eggMin", "riceMinDiscrete"],
    generationMode: FOOD_COMBINATION_MODES.ONLY_SELECTED_FOODS,
  }), { model: modelFor([egg, rice]) });

  assert.equal(result.status, "SUCCESS");
  assert.equal(result.relaxation.level, "RELAX_MIN");
  const constraint = result.alternative.optimization.constraints.find((item) => item.foodId === "eggMin");
  const outputEgg = result.alternative.foods.find((item) => item.foodId === "eggMin");
  assert.equal(constraint.recommendedMin, 2);
  assert.equal(constraint.step, 1);
  assert.ok(outputEgg.quantity >= 2);
});

test("threshold de proteina acepta 37.5 para P40 pero 37.4 permite relajar", async () => {
  const candidate = (id, protein) => withPortionRule(
    food(id, id, "P1", { kcal: 1, proteina: protein / 100, carbs: 0, grasas: 0 }),
    { unit: "g", min: 100, max: 200, step: 10 },
  );
  const carb = (id) => withPortionRule(
    food(id, id, "C1", { kcal: 1, proteina: 0, carbs: 0.5, grasas: 0 }),
    { unit: "g", min: 100, max: 200, step: 10 },
  );
  const accepted = await generateMealAlternative(request({
    target: { kcal: 200, proteina: 40, carbs: 50, grasas: 0 },
    requiredFoodIds: ["p375", "c375"],
    generationMode: FOOD_COMBINATION_MODES.ONLY_SELECTED_FOODS,
  }), { model: modelFor([candidate("p375", 37.5), carb("c375")]) });
  assert.equal(accepted.status, "SUCCESS");
  assert.equal(accepted.relaxation.level, "STRICT");

  const rejected = await generateMealAlternative(request({
    target: { kcal: 200, proteina: 40, carbs: 50, grasas: 0 },
    requiredFoodIds: ["p374", "c374"],
    generationMode: FOOD_COMBINATION_MODES.ONLY_SELECTED_FOODS,
  }), { model: modelFor([candidate("p374", 37.4), carb("c374")]) });
  assert.equal(rejected.status, "SUCCESS");
  assert.notEqual(rejected.relaxation.level, "STRICT");
  assert.equal(rejected.meta.rounds.length, 3);
});

test("sin solucion recomendable agota las tres rondas, conserva MAX y no expone best effort", async () => {
  const protein = withPortionRule(
    food("proteinHardMax", "Proteina hard max", "P1", { kcal: 1, proteina: 0.374, carbs: 0, grasas: 0 }),
    { unit: "g", min: 100, max: 100, step: 10 },
  );
  const carb = withPortionRule(
    food("carbHardMax", "Carbo hard max", "C1", { kcal: 1, proteina: 0, carbs: 0.5, grasas: 0 }),
    { unit: "g", min: 100, max: 100, step: 10 },
  );
  const result = await generateMealAlternative(request({
    target: { kcal: 200, proteina: 60, carbs: 50, grasas: 0 },
    requiredFoodIds: ["proteinHardMax", "carbHardMax"],
    generationMode: FOOD_COMBINATION_MODES.ONLY_SELECTED_FOODS,
  }), { model: modelFor([protein, carb]) });

  assert.equal(result.status, "NO_SOLUTION");
  assert.equal(result.code, "MEAL_TARGET_NOT_REACHABLE_WITH_PORTION_RULES");
  assert.equal(result.recommended, false);
  assert.equal(result.alternative, null);
  assert.deepEqual(result.alternatives, []);
  assert.deepEqual(result.meta.rounds.map((round) => round.level), ["STRICT", "RELAX_STEP", "RELAX_MIN"]);
  assert.equal(result.meta.recommendedSolutionsFound, 0);
});

test("el ranking es determinista y conserva kcal, proteina y luego C/G", async () => {
  const first = await generateMealAlternative(request(), { model: modelFor(catalog) });
  const second = await generateMealAlternative(request(), { model: modelFor([...catalog].reverse()) });
  assert.deepEqual(first.alternative, second.alternative);
  assert.deepEqual(first.alternatives, second.alternatives);
});

test("una estructura con error matematico se descarta sin abortar las soluciones restantes", async () => {
  const quantityService = new ServicioAlimentos("MONGO");
  const solve = quantityService.generarCantidades.bind(quantityService);
  let calls = 0;
  quantityService.generarCantidades = async (...args) => {
    calls += 1;
    if (calls === 1) throw new Error("fixture_candidate_failure");
    return await solve(...args);
  };

  const result = await generateMealAlternative(request(), {
    model: modelFor(),
    quantityService,
  });
  assert.equal(result.status, "SUCCESS");
  assert.ok(calls > 1);
  assert.ok(result.meta.quantitySolutionsFound > 0);
});

test("el servicio de cliente valida capability, reutiliza ajustes guardados y no persiste al generar", async () => {
  const service = new ServicioClientOwnMenus();
  const actor = {
    _id: "client-1",
    role: "cliente",
    personalPlan: "pro",
    menu: {
      equivalentMealGenerationSettings: [{
        key: "menu-1::meal-1",
        menuId: "menu-1",
        mealId: "meal-1",
        strategy: "selected_only",
        requiredFoods: [{ id: "pollo", name: "Pollo" }, { id: "arroz", name: "Arroz" }],
        avoidedFoods: [{ id: "banana", name: "Banana" }],
      }],
    },
  };
  service._actor = async () => actor;
  service._capabilitiesFromAccessContext = () => ({
    plan: "pro",
    canUseEquivalences: true,
    canAutoCalculateTrackingQuantities: true,
    limits: { equivalentMealFoods: 6 },
  });
  service.alimentosModel = modelFor();
  let captured = null;
  service.mealAlternativeGenerator = async (input) => {
    captured = input;
    return { status: "SUCCESS", alternative: { foods: [] }, alternatives: [], meta: {} };
  };
  service.usuariosModel = new Proxy({}, {
    get() { throw new Error("La vista previa no debe escribir usuarios ni tracking"); },
  });

  const result = await service.generateEquivalentMealAlternative(actor, {
    menuId: "menu-1",
    mealId: "meal-1",
    mealType: "almuerzo",
    target: baseTarget,
  });
  assert.equal(result.status, "SUCCESS");
  assert.deepEqual(captured.requiredFoodIds, ["pollo", "arroz"]);
  assert.deepEqual(captured.excludedFoodIds, ["banana"]);
  assert.equal(captured.generationMode, FOOD_COMBINATION_MODES.ONLY_SELECTED_FOODS);
});

test("el servicio falla cerrado cuando el cliente no tiene permiso", async () => {
  const service = new ServicioClientOwnMenus();
  service._actor = async (actor) => actor;
  service._capabilitiesFromAccessContext = () => ({
    plan: "free",
    canUseEquivalences: false,
    canAutoCalculateTrackingQuantities: false,
  });
  await assert.rejects(() => service.generateEquivalentMealAlternative({ _id: "client-1", role: "cliente" }, {
    menuId: "menu-1",
    mealId: "meal-1",
    mealType: "almuerzo",
    target: baseTarget,
  }), (error) => error.code === "PLAN_CAPABILITY_REQUIRED");
});

test("recalcular conserva exactamente la seleccion y respeta min, max y step", async () => {
  const chicken = withPortionRule(
    food("recalcChicken", "Pechuga recalc", "P1", { kcal: 1, proteina: 0.2, carbs: 0, grasas: 0 }),
    { unit: "g", min: 100, max: 350, step: 10 },
  );
  const rice = withPortionRule(
    food("recalcRice", "Arroz recalc", "C1", { kcal: 1, proteina: 0.1, carbs: 0.2, grasas: 0 }),
    { unit: "g", min: 80, max: 200, step: 10 },
  );
  const banana = withPortionRule(
    food("recalcBanana", "Banana recalc", "F", { kcal: 1, proteina: 0, carbs: 0.2, grasas: 0 }),
    { unit: "g", min: 50, max: 250, step: 10 },
  );
  const result = await recalculateMealAlternativeQuantities({
    mealType: "almuerzo",
    target: { kcal: 300, proteina: 40, carbs: 30, grasas: 0 },
    selectedFoodIds: ["recalcChicken", "recalcRice", "recalcBanana"],
    currentFoods: [
      { foodId: "recalcChicken", quantity: 187 },
      { foodId: "recalcRice", quantity: 128 },
      { foodId: "recalcBanana", quantity: 14 },
    ],
    generateVariant: true,
    variantSeed: 1,
  }, { model: modelFor([chicken, rice, banana]) });

  assert.equal(result.status, "SUCCESS");
  assert.equal(result.relaxation.level, "STRICT");
  assert.deepEqual(result.alternative.foods.map((entry) => entry.foodId), [
    "recalcChicken",
    "recalcRice",
    "recalcBanana",
  ]);
  const rules = new Map([
    ["recalcChicken", { min: 100, max: 350, step: 10 }],
    ["recalcRice", { min: 80, max: 200, step: 10 }],
    ["recalcBanana", { min: 50, max: 250, step: 10 }],
  ]);
  for (const entry of result.alternative.foods) {
    const rule = rules.get(entry.foodId);
    assert.ok(entry.quantity >= rule.min && entry.quantity <= rule.max);
    assert.equal(entry.quantity % rule.step, 0);
  }
  assert.ok(result.alternative.totals.kcal <= 300);
  assert.ok(300 - result.alternative.totals.kcal <= 10);
  assert.equal(result.meta.combinationCandidatesEvaluated, 1);
  assert.equal(result.meta.recalculation, true);
});

test("recalcular mantiene el candado exacto y optimiza solo los alimentos Auto", async () => {
  const chicken = withPortionRule(
    food("lockedChicken", "Pechuga fija", "P1", { kcal: 1, proteina: 0.2, carbs: 0, grasas: 0 }),
    { unit: "g", min: 100, max: 350, step: 10 },
  );
  const rice = withPortionRule(
    food("autoRice", "Arroz auto", "C1", { kcal: 1, proteina: 0.1, carbs: 0.2, grasas: 0 }),
    { unit: "g", min: 80, max: 200, step: 10 },
  );
  const result = await recalculateMealAlternativeQuantities({
    mealType: "almuerzo",
    target: { kcal: 230, proteina: 33, carbs: 20, grasas: 0 },
    selectedFoodIds: ["lockedChicken", "autoRice"],
    fixedFoods: [{ foodId: "lockedChicken", quantity: 130 }],
    currentFoods: [{ foodId: "autoRice", quantity: 128 }],
    generateVariant: true,
  }, { model: modelFor([chicken, rice]) });

  assert.equal(result.status, "SUCCESS");
  assert.deepEqual(result.alternative.foods.map((entry) => entry.foodId), ["lockedChicken", "autoRice"]);
  assert.equal(result.alternative.foods.find((entry) => entry.foodId === "lockedChicken").quantity, 130);
  assert.equal(result.alternative.foods.find((entry) => entry.foodId === "autoRice").quantity, 100);
  assert.equal(result.meta.fixedFoods, 1);
});

test("recalcular no invoca el motor de combinaciones ni puede agregar alimentos", async () => {
  const chicken = withPortionRule(
    food("onlyChicken", "Solo pollo", "P1", { kcal: 1, proteina: 0.2, carbs: 0, grasas: 0 }),
    { unit: "g", min: 100, max: 350, step: 10 },
  );
  const rice = withPortionRule(
    food("onlyRice", "Solo arroz", "C1", { kcal: 1, proteina: 0.1, carbs: 0.2, grasas: 0 }),
    { unit: "g", min: 80, max: 200, step: 10 },
  );
  const result = await recalculateMealAlternativeQuantities({
    mealType: "almuerzo",
    target: { kcal: 200, proteina: 30, carbs: 20, grasas: 0 },
    selectedFoodIds: ["onlyChicken", "onlyRice"],
  }, {
    model: modelFor([chicken, rice, ...catalog]),
    generateFoodCombinationCandidates: () => {
      throw new Error("recalcular no debe generar estructuras");
    },
  });

  assert.equal(result.status, "SUCCESS");
  assert.deepEqual(result.alternative.foods.map((entry) => entry.foodId), ["onlyChicken", "onlyRice"]);
});

test("recalcular redistribuye cantidades cuando existe otra opcion valida para los mismos alimentos", async () => {
  const chicken = withPortionRule(
    food("variantChicken", "Pechuga variante", "P1", { kcal: 1, proteina: 0.2, carbs: 0, grasas: 0 }),
    { unit: "g", min: 100, max: 350, step: 10 },
  );
  const rice = withPortionRule(
    food("variantRice", "Arroz variante", "C1", { kcal: 1, proteina: 0.1, carbs: 0.2, grasas: 0 }),
    { unit: "g", min: 80, max: 200, step: 10 },
  );
  const banana = withPortionRule(
    food("variantBanana", "Banana variante", "F", { kcal: 1, proteina: 0, carbs: 0.2, grasas: 0 }),
    { unit: "g", min: 50, max: 250, step: 10 },
  );
  const original = new Map([
    ["variantChicken", 100],
    ["variantRice", 100],
    ["variantBanana", 100],
  ]);
  const result = await recalculateMealAlternativeQuantities({
    mealType: "almuerzo",
    target: { kcal: 300, proteina: 30, carbs: 40, grasas: 0 },
    selectedFoodIds: [...original.keys()],
    currentFoods: [...original].map(([foodId, quantity]) => ({ foodId, quantity })),
    generateVariant: true,
    variantSeed: 1,
  }, { model: modelFor([chicken, rice, banana]) });

  assert.equal(result.status, "SUCCESS");
  assert.equal(result.alternative.variant?.applied, true);
  assert.deepEqual(result.alternative.foods.map((entry) => entry.foodId), [...original.keys()]);
  assert.ok(result.alternative.foods.some((entry) => entry.quantity !== original.get(entry.foodId)));
  assert.ok(result.alternative.foods.every((entry) => entry.quantity % 10 === 0));
  assert.ok(result.alternative.totals.kcal <= 300);
  assert.ok(300 - result.alternative.totals.kcal <= 10);
});

test("si no existe otra distribucion, recalcular devuelve la base valida sin warning de variante", async () => {
  const chicken = withPortionRule(
    food("fallbackChicken", "Pechuga fallback", "P1", { kcal: 1, proteina: 0.2, carbs: 0, grasas: 0 }),
    { unit: "g", min: 100, max: 350, step: 10 },
  );
  const rice = withPortionRule(
    food("fallbackRice", "Arroz fallback", "C1", { kcal: 1, proteina: 0.1, carbs: 0.2, grasas: 0 }),
    { unit: "g", min: 80, max: 200, step: 10 },
  );
  const result = await recalculateMealAlternativeQuantities({
    mealType: "almuerzo",
    target: { kcal: 200, proteina: 30, carbs: 20, grasas: 0 },
    selectedFoodIds: ["fallbackChicken", "fallbackRice"],
    currentFoods: [
      { foodId: "fallbackChicken", quantity: 100 },
      { foodId: "fallbackRice", quantity: 100 },
    ],
    generateVariant: true,
  }, { model: modelFor([chicken, rice]) });

  assert.equal(result.status, "SUCCESS");
  assert.equal(result.meta.variantFallback, true);
  assert.deepEqual(result.alternative.variant, { requested: false, applied: false });
  assert.deepEqual(result.alternative.foods.map((entry) => [entry.foodId, entry.quantity]), [
    ["fallbackChicken", 100],
    ["fallbackRice", 100],
  ]);
  assert.ok(result.alternative.warnings.every((warning) => !/misma fuente|variante/i.test(warning)));
});

test("el servicio de cliente valida permisos y conserva el contexto cerrado al recalcular", async () => {
  const service = new ServicioClientOwnMenus();
  const actor = { _id: "client-1", role: "cliente", personalPlan: "pro" };
  service._actor = async () => actor;
  service._capabilitiesFromAccessContext = () => ({
    plan: "pro",
    canUseEquivalences: true,
    canAutoCalculateTrackingQuantities: true,
    limits: { equivalentMealFoods: 6 },
  });
  let captured = null;
  service.mealAlternativeQuantityRecalculator = async (input) => {
    captured = input;
    return { status: "SUCCESS", recommended: true, alternative: { foods: [] } };
  };
  await service.recalculateEquivalentMealAlternative(actor, {
    menuId: "menu-1",
    mealId: "meal-1",
    mealType: "almuerzo",
    target: baseTarget,
    selectedFoodIds: ["pollo", "arroz"],
    fixedFoods: [{ foodId: "pollo", quantity: 180 }],
    currentFoods: [{ foodId: "arroz", quantity: 120 }],
    generateVariant: true,
    variantSeed: 4,
  });
  assert.deepEqual(captured.selectedFoodIds, ["pollo", "arroz"]);
  assert.deepEqual(captured.fixedFoods, [{ foodId: "pollo", quantity: 180 }]);
  assert.deepEqual(captured.currentFoods, [{ foodId: "arroz", quantity: 120 }]);
  assert.equal(captured.maxFoods, 6);
  assert.equal(captured.generateVariant, true);
});
