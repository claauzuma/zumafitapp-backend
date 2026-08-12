import assert from "node:assert/strict";
import test from "node:test";

import {
  FOOD_COMBINATION_MODES,
} from "../servicio/foodCombinationCandidates.js";
import {
  generateMealAlternative,
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
