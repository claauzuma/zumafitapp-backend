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
  assert.equal(result.classification, "BEST_EFFORT");
  assert.equal(result.alternative.status, "BEST_EFFORT");
  assert.equal(result.recommended, false);
  assert.equal(result.usable, true);
  assert.ok(Math.abs(result.alternative.totals.kcal - target.kcal) <= 10);
});

test("diversidad diaria elige otra composición recomendada aunque cambien sólo los IDs", async () => {
  const makeUnit = (id, role, macros) => withPortionRule(
    food(id, id, role, macros, { unit: "unidad" }),
    { unit: "unidad", min: 1, max: 1, step: 1 },
  );
  const diverseCatalog = [
    makeUnit("protein-a", "P1", { kcal: 100, proteina: 20, carbs: 0, grasas: 0 }),
    makeUnit("protein-b", "P1", { kcal: 100, proteina: 20, carbs: 0, grasas: 0 }),
    makeUnit("carb-a", "C1", { kcal: 100, proteina: 0, carbs: 20, grasas: 0 }),
    makeUnit("carb-b", "C1", { kcal: 100, proteina: 0, carbs: 20, grasas: 0 }),
  ];
  const target = { kcal: 200, proteina: 20, carbs: 20, grasas: 0 };
  const baseline = await generateMealAlternative(request({ target }), {
    model: modelFor(diverseCatalog),
  });
  const prior = baseline.alternative.composition;
  const result = await generateMealAlternative(request({
    target,
    diversityContext: { previousMeals: [prior] },
  }), { model: modelFor(diverseCatalog) });

  assert.equal(result.status, "SUCCESS");
  assert.equal(result.classification, "RECOMMENDED");
  assert.notEqual(result.alternative.composition.fingerprint, prior.fingerprint);
  assert.equal(result.meta.repeatInevitable, false);
  assert.equal(result.meta.selectedDiversity.exactMatches, 0);
  assert.equal(new Set([
    result.alternative,
    ...result.alternatives,
  ].map((entry) => entry.composition.fingerprint)).size, 4);
});

test("diversidad nunca desplaza una solucion RECOMMENDED por una BEST_EFFORT", async () => {
  const makeUnit = (id, role, macros) => withPortionRule(
    food(id, id, role, macros, { unit: "unidad" }),
    { unit: "unidad", min: 1, max: 1, step: 1 },
  );
  const priorityCatalog = [
    makeUnit("shared-protein", "P1", { kcal: 100, proteina: 20, carbs: 0, grasas: 0 }),
    makeUnit("balanced-carb", "C1", { kcal: 50, proteina: 0, carbs: 10, grasas: 0 }),
    makeUnit("diverse-carb", "C1", { kcal: 100, proteina: 0, carbs: 20, grasas: 0 }),
    makeUnit("balanced-fat", "G", { kcal: 50, proteina: 0, carbs: 0, grasas: 5.56 }),
  ];
  const target = { kcal: 200, proteina: 20, carbs: 10, grasas: 5.56 };
  const repeatedRecommended = {
    foodIds: ["shared-protein", "balanced-carb", "balanced-fat"],
  };
  const result = await generateMealAlternative(request({
    target,
    diversityContext: { previousMeals: [repeatedRecommended] },
  }), { model: modelFor(priorityCatalog) });

  assert.equal(result.status, "SUCCESS");
  assert.equal(result.classification, "RECOMMENDED");
  assert.equal(result.recommended, true);
  assert.deepEqual(
    result.alternative.composition.foodIds,
    ["balanced-carb", "balanced-fat", "shared-protein"],
  );
  assert.equal(result.alternative.diversity.exactMatches, 1);
  assert.equal(result.meta.repeatInevitable, true);
  assert.ok(result.alternatives.some((alternative) => (
    alternative.classification === "BEST_EFFORT" &&
    alternative.composition.foodIds.includes("diverse-carb")
  )));
});

test("repetición inevitable sigue usable y queda documentada, no se vuelve NO_SOLUTION", async () => {
  const selectedCatalog = [
    withPortionRule(
      food("only-protein", "Sólo proteína", "P1", { kcal: 1, proteina: 0.2, carbs: 0, grasas: 0 }),
      { unit: "g", min: 100, max: 200, step: 10 },
    ),
    withPortionRule(
      food("only-carb", "Sólo carbo", "C1", { kcal: 1, proteina: 0, carbs: 0.2, grasas: 0 }),
      { unit: "g", min: 80, max: 200, step: 10 },
    ),
  ];
  const result = await generateMealAlternative(request({
    target: { kcal: 200, proteina: 20, carbs: 20, grasas: 0 },
    requiredFoodIds: ["only-protein", "only-carb"],
    generationMode: FOOD_COMBINATION_MODES.ONLY_SELECTED_FOODS,
    diversityContext: {
      previousMeals: [{ foodIds: ["only-protein", "only-carb"] }],
    },
  }), { model: modelFor(selectedCatalog) });

  assert.equal(result.status, "SUCCESS");
  assert.equal(result.usable, true);
  assert.equal(result.meta.repeatInevitable, true);
  assert.equal(result.alternative.diversity.repeatInevitable, true);
  assert.equal(result.alternative.warnings.some((warning) => (
    warning.code === "MEAL_COMPOSITION_REPEAT_UNAVOIDABLE" && warning.severity === "info"
  )), true);
});

test("solapamiento alto inevitable se informa sin bloquear una solución recomendada", async () => {
  const limitedCatalog = [
    withPortionRule(
      food("subset-protein", "Proteína subset", "P1", { kcal: 1, proteina: 0.2, carbs: 0, grasas: 0 }),
      { unit: "g", min: 100, max: 100, step: 10 },
    ),
    withPortionRule(
      food("subset-carb", "Carbo subset", "C1", { kcal: 1, proteina: 0, carbs: 0.2, grasas: 0 }),
      { unit: "g", min: 100, max: 100, step: 10 },
    ),
  ];
  const result = await generateMealAlternative(request({
    target: { kcal: 200, proteina: 20, carbs: 20, grasas: 0 },
    diversityContext: {
      previousMeals: [{ foodIds: ["subset-protein", "subset-carb", "previous-extra"] }],
    },
  }), { model: modelFor(limitedCatalog) });

  assert.equal(result.status, "SUCCESS");
  assert.equal(result.classification, "RECOMMENDED");
  assert.equal(result.usable, true);
  assert.equal(result.meta.repeatInevitable, false);
  assert.equal(result.meta.highOverlapInevitable, true);
  assert.equal(result.alternative.warnings.some((warning) => (
    warning.code === "MEAL_COMPOSITION_HIGH_OVERLAP_UNAVOIDABLE"
  )), true);
});

test("generar otra opción expone sólo alternativas con composición semántica única", async () => {
  const result = await generateMealAlternative(request(), { model: modelFor(catalog) });
  const fingerprints = [result.alternative, ...result.alternatives]
    .map((entry) => entry.composition.fingerprint);
  assert.equal(new Set(fingerprints).size, fingerprints.length);
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

test("arroz requerido en desayuno participa aunque breakfast sea false", async () => {
  const breakfastCatalog = catalog.map((entry) => ({
    ...entry,
    generation: {
      ...entry.generation,
      mealTypes: { ...entry.generation.mealTypes, breakfast: false },
    },
  }));
  const result = await generateMealAlternative(request({
    mealType: "desayuno",
    requiredFoodIds: ["pollo", "arroz"],
    generationMode: FOOD_COMBINATION_MODES.ONLY_SELECTED_FOODS,
  }), { model: modelFor(breakfastCatalog) });
  assert.equal(result.status, "SUCCESS");
  assert.deepEqual(result.alternative.foods.map((entry) => entry.foodId).sort(), ["arroz", "pollo"]);
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
  assert.equal(riceConstraint.minSource, "catalog.generation.portionRule.min");
  assert.equal(riceConstraint.maxSource, "catalog.generation.portionRule.max");
  assert.equal(riceConstraint.stepSource, "catalog.generation.portionRule.step");
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
    food("riceStep", "Arroz step", "C1", { kcal: 1, proteina: 0, carbs: 0, grasas: 0 }),
    { unit: "g", min: 80, max: 80, step: 10 },
  );
  const chicken = withPortionRule(
    food("chickenStep", "Pollo step", "P1", { kcal: 1, proteina: 1, carbs: 0, grasas: 0 }),
    { unit: "g", min: 100, max: 105, step: 10 },
  );
  const result = await generateMealAlternative(request({
    target: { kcal: 185, proteina: 105.1, carbs: 0, grasas: 0 },
    requiredFoodIds: ["chickenStep", "riceStep"],
    generationMode: FOOD_COMBINATION_MODES.ONLY_SELECTED_FOODS,
  }), { model: modelFor([rice, chicken]) });

  assert.equal(result.status, "SUCCESS");
  assert.equal(result.relaxation.level, "RELAX_STEP");
  assert.deepEqual(result.meta.rounds.map((round) => round.level), ["STRICT", "RELAX_STEP"]);
  assert.ok(result.meta.rounds.every((round) => round.candidatesProcessed === result.meta.combinationCandidatesEvaluated));
  assert.ok(result.alternative.optimization.constraints.every((constraint) => constraint.step === 5));
  assert.ok(result.alternative.optimization.constraints.every((constraint) =>
    constraint.recommendedMax === (constraint.foodId === "riceStep" ? 80 : 105)
  ));
  assert.ok(result.alternative.foods.every((entry) => entry.quantity % 5 === 0));
  assert.ok(result.alternative.foods.every((entry) =>
    entry.quantity <= (entry.foodId === "riceStep" ? 80 : 105)
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

  assert.equal(result.status, "SUCCESS");
  assert.equal(result.classification, "BEST_EFFORT");
  assert.equal(result.usable, true);
  assert.equal(result.meta.rounds.length, 3);
  assert.deepEqual(effectiveEggRules.map((rule) => rule.step), [10, 10, 10]);
  assert.deepEqual(effectiveEggRules.map((rule) => rule.min), [1, 1, 1]);
  const selectedEgg = result.alternative.foods.find((entry) => entry.foodId === "eggDiscrete");
  assert.ok(selectedEgg);
  assert.equal(selectedEgg.quantity % 10, 0);
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

test("distancia proteica hasta 5 g es recomendable y por encima queda BEST_EFFORT", async () => {
  const candidate = (id, protein) => withPortionRule(
    food(id, id, "P1", { kcal: 1, proteina: protein / 100, carbs: 0, grasas: 0 }),
    { unit: "g", min: 100, max: 100, step: 10 },
  );
  const carb = (id) => withPortionRule(
    food(id, id, "C1", { kcal: 1, proteina: 0, carbs: 0.5, grasas: 0 }),
    { unit: "g", min: 100, max: 100, step: 10 },
  );
  const accepted = await generateMealAlternative(request({
    target: { kcal: 200, proteina: 40, carbs: 50, grasas: 0 },
    requiredFoodIds: ["p375", "c375"],
    generationMode: FOOD_COMBINATION_MODES.ONLY_SELECTED_FOODS,
  }), { model: modelFor([candidate("p375", 37.5), carb("c375")]) });
  assert.equal(accepted.status, "SUCCESS");
  assert.equal(accepted.relaxation.level, "STRICT");

  const bestEffort = await generateMealAlternative(request({
    target: { kcal: 200, proteina: 40, carbs: 50, grasas: 0 },
    requiredFoodIds: ["p349", "c349"],
    generationMode: FOOD_COMBINATION_MODES.ONLY_SELECTED_FOODS,
  }), { model: modelFor([candidate("p349", 34.9), carb("c349")]) });
  assert.equal(bestEffort.status, "SUCCESS");
  assert.equal(bestEffort.classification, "BEST_EFFORT");
  assert.equal(bestEffort.usable, true);
  assert.equal(bestEffort.meta.rounds.length, 3);
});

test("si hay solucion fisica pero no recomendable agota rondas y expone BEST_EFFORT usable", async () => {
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

  assert.equal(result.status, "SUCCESS");
  assert.equal(result.classification, "BEST_EFFORT");
  assert.equal(result.recommended, false);
  assert.equal(result.usable, true);
  assert.equal(result.alternative.status, "BEST_EFFORT");
  assert.ok(result.alternative.foods.every((entry) => entry.quantity <= 100));
  assert.deepEqual(result.meta.rounds.map((round) => round.level), ["STRICT", "RELAX_STEP", "RELAX_MIN"]);
  assert.equal(result.meta.recommendedSolutionsFound, 0);
  assert.ok(result.meta.bestEffortSolutionsFound > 0);
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

test("el menú automático reutiliza el generador individual y hace fallback GENERIC si el slot no tiene elegidos", async () => {
  const service = new ServicioClientOwnMenus();
  const actor = { _id: "client-auto", role: "cliente", personalPlan: "pro" };
  service._actor = async () => actor;
  service.capabilities = async () => ({
    plan: "pro",
    canGenerateAutomaticMenu: true,
    canAutoCalculateTrackingQuantities: true,
    limits: { equivalentMealFoods: 6 },
  });
  let captured = null;
  service.mealAlternativeGenerator = async (input) => {
    captured = input;
    return { status: "SUCCESS", alternative: { foods: [] }, alternatives: [], meta: {} };
  };

  await service.generateAutomaticMenuMeal(actor, {
    mealType: "desayuno",
    target: baseTarget,
    strategy: "selected_only",
    requiredFoodIds: [],
    excludedFoodIds: ["banana"],
    variantSeed: "daily-run:0",
    diversityContext: {
      previousMeals: [{ foodIds: ["pollo", "arroz"], roleFoodPairs: ["pollo:P1", "arroz:C1"] }],
    },
  });
  assert.equal(captured.generationMode, FOOD_COMBINATION_MODES.ALLOW_SUGGESTIONS);
  assert.deepEqual(captured.requiredFoodIds, []);
  assert.deepEqual(captured.excludedFoodIds, ["banana"]);
  assert.equal(captured.variantSeed, "daily-run:0");
  assert.deepEqual(captured.diversityContext.previousMeals[0].foodIds, ["pollo", "arroz"]);

  await service.generateAutomaticMenuMeal(actor, {
    mealType: "desayuno",
    target: baseTarget,
    strategy: "selected_only",
    requiredFoodIds: ["arroz", "yogur"],
  });
  assert.equal(captured.generationMode, FOOD_COMBINATION_MODES.ONLY_SELECTED_FOODS);
  assert.deepEqual(captured.requiredFoodIds, ["arroz", "yogur"]);
});

test("el menú automático hereda restricciones del cliente para sugerencias y requeridos", async () => {
  const service = new ServicioClientOwnMenus();
  const actor = {
    _id: "client-restricted",
    role: "cliente",
    personalPlan: "pro",
    menu: { restrictions: { excludedFoods: ["banana"] } },
  };
  service._actor = async () => actor;
  service.capabilities = async () => ({
    plan: "pro",
    canGenerateAutomaticMenu: true,
    canAutoCalculateTrackingQuantities: true,
    limits: { equivalentMealFoods: 6 },
  });
  service.alimentosModel = modelFor();
  let suggested = [];
  service.mealAlternativeGenerator = async (input, dependencies) => {
    suggested = await dependencies.getAutomaticGenerationFoods({
      mealType: "lunch",
      roles: ["C1", "F"],
    });
    return { status: "SUCCESS", alternative: { foods: [] }, alternatives: [], meta: {} };
  };

  await service.generateAutomaticMenuMeal(actor, {
    mealType: "almuerzo",
    target: baseTarget,
    strategy: "assisted_food_addition",
  });
  assert.ok(suggested.some((entry) => entry._id === "arroz"));
  assert.ok(suggested.every((entry) => entry._id !== "banana"));

  await assert.rejects(() => service.generateAutomaticMenuMeal(actor, {
    mealType: "almuerzo",
    target: baseTarget,
    strategy: "selected_only",
    requiredFoodIds: ["banana"],
  }), (error) => error.code === "MENU_FOOD_RESTRICTED" && error.foodId === "banana");
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
  assert.equal(result.alternative.foods.find((entry) => entry.foodId === "autoRice").quantity, 90);
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

test("recalcular aplica el ranking central a los mismos alimentos sin pedir una variante peor", async () => {
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
    ["variantChicken", 120],
    ["variantRice", 80],
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
  assert.equal(result.alternative.variant?.applied, false);
  assert.deepEqual(result.alternative.foods.map((entry) => entry.foodId), [...original.keys()]);
  assert.ok(result.alternative.foods.some((entry) => entry.quantity !== original.get(entry.foodId)));
  assert.ok(result.alternative.foods.every((entry) => entry.quantity % 10 === 0));
  assert.ok(result.alternative.totals.kcal <= 300);
  assert.ok(300 - result.alternative.totals.kcal <= 10);
});

test("si la distribucion actual ya es optima, recalcular devuelve la base sin warning de variante", async () => {
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
  assert.equal(result.meta.variantFallback, undefined);
  assert.deepEqual(result.alternative.variant, { requested: false, applied: false });
  assert.deepEqual(result.alternative.foods.map((entry) => [entry.foodId, entry.quantity]), [
    ["fallbackChicken", 100],
    ["fallbackRice", 100],
  ]);
  assert.ok(result.alternative.warnings.every((warning) =>
    !/misma fuente|variante/i.test(String(warning?.message || warning))
  ));
});

test("manual lock 1: un fijo queda exacto y dos Auto se redistribuyen", async () => {
  const chicken = withPortionRule(
    food("lock1Chicken", "Pollo lock 1", "P1", { kcal: 1, proteina: 0.2, carbs: 0, grasas: 0 }),
    { unit: "g", min: 100, max: 350, step: 10 },
  );
  const rice = withPortionRule(
    food("lock1Rice", "Arroz lock 1", "C1", { kcal: 1, proteina: 0.1, carbs: 0.2, grasas: 0 }),
    { unit: "g", min: 80, max: 200, step: 10 },
  );
  const banana = withPortionRule(
    food("lock1Banana", "Banana lock 1", "F", { kcal: 1, proteina: 0, carbs: 0.2, grasas: 0 }),
    { unit: "g", min: 50, max: 250, step: 10 },
  );
  const result = await recalculateMealAlternativeQuantities({
    mealType: "almuerzo",
    target: { kcal: 300, proteina: 34, carbs: 34, grasas: 0 },
    selectedFoodIds: ["lock1Chicken", "lock1Rice", "lock1Banana"],
    fixedFoods: [{ foodId: "lock1Chicken", quantity: 130 }],
    currentFoods: [
      { foodId: "lock1Rice", quantity: 120 },
      { foodId: "lock1Banana", quantity: 50 },
    ],
  }, { model: modelFor([chicken, rice, banana]) });

  assert.equal(result.status, "SUCCESS");
  assert.equal(result.alternative.foods.find((entry) => entry.foodId === "lock1Chicken").quantity, 130);
  assert.deepEqual(result.alternative.foods.map((entry) => entry.foodId), [
    "lock1Chicken",
    "lock1Rice",
    "lock1Banana",
  ]);
  assert.ok(result.alternative.foods.some((entry) =>
    entry.foodId !== "lock1Chicken" && entry.quantity !== (entry.foodId === "lock1Rice" ? 120 : 50)
  ));
});

test("manual lock 2: dos fijos de cuatro permanecen exactos y solo cambian los Auto", async () => {
  const foods = [
    withPortionRule(food("lock2Chicken", "Pollo lock 2", "P1", { kcal: 1, proteina: 0.2, carbs: 0, grasas: 0 }), { unit: "g", min: 100, max: 300, step: 10 }),
    withPortionRule(food("lock2Oil", "Aceite lock 2", "G", { kcal: 9, proteina: 0, carbs: 0, grasas: 1 }), { unit: "g", min: 5, max: 20, step: 5 }),
    withPortionRule(food("lock2Rice", "Arroz lock 2", "C1", { kcal: 1, proteina: 0.1, carbs: 0.2, grasas: 0 }), { unit: "g", min: 80, max: 200, step: 10 }),
    withPortionRule(food("lock2Banana", "Banana lock 2", "F", { kcal: 1, proteina: 0, carbs: 0.2, grasas: 0 }), { unit: "g", min: 50, max: 250, step: 10 }),
  ];
  const result = await recalculateMealAlternativeQuantities({
    mealType: "almuerzo",
    target: { kcal: 300, proteina: 33, carbs: 27, grasas: 5 },
    selectedFoodIds: foods.map((entry) => entry._id),
    fixedFoods: [
      { foodId: "lock2Chicken", quantity: 120 },
      { foodId: "lock2Oil", quantity: 5 },
    ],
    currentFoods: [
      { foodId: "lock2Rice", quantity: 100 },
      { foodId: "lock2Banana", quantity: 50 },
    ],
  }, { model: modelFor(foods) });

  assert.equal(result.status, "SUCCESS");
  assert.equal(result.alternative.foods.find((entry) => entry.foodId === "lock2Chicken").quantity, 120);
  assert.equal(result.alternative.foods.find((entry) => entry.foodId === "lock2Oil").quantity, 5);
  assert.deepEqual(result.alternative.foods.map((entry) => entry.foodId), foods.map((entry) => entry._id));
});

test("manual lock 3/4/7: todos locked se evaluan sin cambios y pueden ser BEST_EFFORT usable", async () => {
  const chicken = withPortionRule(
    food("allLockedChicken", "Pollo all locked", "P1", { kcal: 1, proteina: 0.2, carbs: 0, grasas: 0 }),
    { unit: "g", min: 100, max: 350, step: 10 },
  );
  const rice = withPortionRule(
    food("allLockedRice", "Arroz all locked", "C1", { kcal: 1, proteina: 0.1, carbs: 0.2, grasas: 0 }),
    { unit: "g", min: 80, max: 200, step: 10 },
  );
  const result = await recalculateMealAlternativeQuantities({
    mealType: "almuerzo",
    target: { kcal: 300, proteina: 60, carbs: 50, grasas: 10 },
    selectedFoodIds: ["allLockedChicken", "allLockedRice"],
    fixedFoods: [
      { foodId: "allLockedChicken", quantity: 130 },
      { foodId: "allLockedRice", quantity: 100 },
    ],
  }, { model: modelFor([chicken, rice]) });

  assert.equal(result.status, "SUCCESS");
  assert.equal(result.classification, "BEST_EFFORT");
  assert.equal(result.usable, true);
  assert.deepEqual(result.alternative.foods.map((entry) => [entry.foodId, entry.quantity]), [
    ["allLockedChicken", 130],
    ["allLockedRice", 100],
  ]);
  assert.equal(result.alternative.optimization.lockedFoods, 2);
  assert.equal(result.alternative.warnings.filter((entry) => entry.category === "nutrition").length, 1);
});

test("MAX y grilla siguen duros para locks: nunca corrige ni acepta una cantidad invalida", async () => {
  const chicken = withPortionRule(
    food("invalidLockedChicken", "Pollo locked invalido", "P1", { kcal: 1, proteina: 0.2, carbs: 0, grasas: 0 }),
    { unit: "g", min: 100, max: 200, step: 10 },
  );
  const rice = withPortionRule(
    food("invalidLockedRice", "Arroz locked valido", "C1", { kcal: 1, proteina: 0.1, carbs: 0.2, grasas: 0 }),
    { unit: "g", min: 80, max: 200, step: 10 },
  );

  for (const invalidQuantity of [205, 250]) {
    const result = await recalculateMealAlternativeQuantities({
      mealType: "almuerzo",
      target: { kcal: 350, proteina: 50, carbs: 30, grasas: 0 },
      selectedFoodIds: ["invalidLockedChicken", "invalidLockedRice"],
      fixedFoods: [
        { foodId: "invalidLockedChicken", quantity: invalidQuantity },
        { foodId: "invalidLockedRice", quantity: 100 },
      ],
    }, { model: modelFor([chicken, rice]) });
    assert.equal(result.status, "NO_SOLUTION");
    assert.equal(result.usable, false);
    assert.equal(result.meta.quantitySolutionsFound, 0);
  }
});

test("manual lock 5: al desbloquear un alimento vuelve a participar del calculo", async () => {
  const chicken = withPortionRule(
    food("unlockChicken", "Pollo unlock", "P1", { kcal: 1, proteina: 0.2, carbs: 0, grasas: 0 }),
    { unit: "g", min: 100, max: 350, step: 10 },
  );
  const rice = withPortionRule(
    food("unlockRice", "Arroz unlock", "C1", { kcal: 1, proteina: 0.1, carbs: 0.2, grasas: 0 }),
    { unit: "g", min: 80, max: 200, step: 10 },
  );
  const locked = await recalculateMealAlternativeQuantities({
    mealType: "almuerzo",
    target: { kcal: 230, proteina: 30, carbs: 20, grasas: 0 },
    selectedFoodIds: ["unlockChicken", "unlockRice"],
    fixedFoods: [{ foodId: "unlockChicken", quantity: 150 }],
  }, { model: modelFor([chicken, rice]) });
  const unlocked = await recalculateMealAlternativeQuantities({
    mealType: "almuerzo",
    target: { kcal: 230, proteina: 30, carbs: 20, grasas: 0 },
    selectedFoodIds: ["unlockChicken", "unlockRice"],
    currentFoods: locked.alternative.foods,
  }, { model: modelFor([chicken, rice]) });

  assert.equal(locked.alternative.foods.find((entry) => entry.foodId === "unlockChicken").quantity, 150);
  assert.notEqual(unlocked.alternative.foods.find((entry) => entry.foodId === "unlockChicken").quantity, 150);
});

test("ONLY_SELECTED devuelve BEST_EFFORT cuando los minimos fisicos obligan a superar +10 kcal", async () => {
  const protein = withPortionRule(
    food(
      "minimumOvershootProtein",
      "Proteina minima discreta",
      "P1",
      { kcal: 60, proteina: 10, carbs: 0, grasas: 0 },
      { unit: "unidad" },
    ),
    { unit: "unidad", min: 1, max: 2, step: 1 },
  );
  const carb = withPortionRule(
    food(
      "minimumOvershootCarb",
      "Carbo minimo discreto",
      "C1",
      { kcal: 60, proteina: 0, carbs: 20, grasas: 0 },
      { unit: "unidad" },
    ),
    { unit: "unidad", min: 1, max: 2, step: 1 },
  );
  const target = { kcal: 100, proteina: 10, carbs: 20, grasas: 0 };

  const result = await generateMealAlternative(request({
    target,
    requiredFoodIds: [protein._id, carb._id],
    generationMode: FOOD_COMBINATION_MODES.ONLY_SELECTED_FOODS,
  }), { model: modelFor([protein, carb]) });

  assert.equal(result.status, "SUCCESS");
  assert.equal(result.classification, "BEST_EFFORT");
  assert.equal(result.recommended, false);
  assert.equal(result.usable, true);
  assert.ok(result.meta.quantitySolutionsFound > 0);
  assert.ok(result.alternative.totals.kcal - target.kcal > 10);
  assert.deepEqual(
    result.alternative.foods.map((entry) => entry.foodId).sort(),
    [protein._id, carb._id].sort(),
  );
  assert.ok(result.alternative.foods.every((entry) => entry.quantity === 1));
});

test("generation evalua el siguiente paso discreto sobre +10 y elige 120 kcal antes que 60", async () => {
  const discrete = withPortionRule(
    food(
      "optionalOvershootDiscrete",
      "Unidad discreta de 60 kcal",
      "P1",
      { kcal: 60, proteina: 0, carbs: 0, grasas: 0 },
      { unit: "unidad" },
    ),
    { unit: "unidad", min: 1, max: 2, step: 1 },
  );
  const target = { kcal: 100, proteina: 0, carbs: 0, grasas: 0 };

  const result = await recalculateMealAlternativeQuantities({
    mealType: "almuerzo",
    target,
    selectedFoodIds: [discrete._id],
  }, { model: modelFor([discrete]) });

  assert.equal(result.status, "SUCCESS");
  assert.equal(result.classification, "BEST_EFFORT");
  assert.equal(result.recommended, false);
  assert.equal(result.usable, true);
  assert.ok(result.meta.quantitySolutionsFound > 0);
  assert.equal(result.alternative.foods[0].quantity, 2);
  assert.equal(result.alternative.totals.kcal, 120);
  assert.equal(result.alternative.difference.kcal, 20);
});

test("un lock valido que obliga a superar +10 kcal se conserva y devuelve BEST_EFFORT", async () => {
  const chicken = withPortionRule(
    food("lockedOvershootChicken", "Pollo locked overshoot", "P1", {
      kcal: 1,
      proteina: 0.2,
      carbs: 0,
      grasas: 0,
    }),
    { unit: "g", min: 100, max: 250, step: 10 },
  );
  const rice = withPortionRule(
    food("lockedOvershootRice", "Arroz auto overshoot", "C1", {
      kcal: 1,
      proteina: 0.1,
      carbs: 0.2,
      grasas: 0,
    }),
    { unit: "g", min: 80, max: 200, step: 10 },
  );
  const target = { kcal: 200, proteina: 32, carbs: 16, grasas: 0 };

  const result = await recalculateMealAlternativeQuantities({
    mealType: "almuerzo",
    target,
    selectedFoodIds: [chicken._id, rice._id],
    fixedFoods: [{ foodId: chicken._id, quantity: 200 }],
  }, { model: modelFor([chicken, rice]) });

  assert.equal(result.status, "SUCCESS");
  assert.equal(result.classification, "BEST_EFFORT");
  assert.equal(result.recommended, false);
  assert.equal(result.usable, true);
  assert.ok(result.meta.quantitySolutionsFound > 0);
  assert.ok(result.alternative.totals.kcal - target.kcal > 10);
  assert.equal(
    result.alternative.foods.find((entry) => entry.foodId === chicken._id).quantity,
    200,
  );
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
