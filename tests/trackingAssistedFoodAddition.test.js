import assert from "node:assert/strict";
import test from "node:test";

import ServicioFoodLogs from "../servicio/foodLogs.js";

const DATE = new Date().toISOString().slice(0, 10);

function actor(overrides = {}) {
  return {
    _id: "507f1f77bcf86cd799439011",
    id: "507f1f77bcf86cd799439011",
    role: "cliente",
    plan: "pro",
    personalPlan: "pro",
    ...overrides,
  };
}

function candidate(id, nombre, categoria, overrides = {}) {
  return {
    id,
    nombre,
    unidad: "g",
    categoria,
    kcal: 2,
    proteina: categoria === "proteicos" ? 0.25 : 0.03,
    carbs: categoria === "carbohidratos" ? 0.4 : 0.02,
    grasas: categoria === "grasas" ? 0.15 : 0.01,
    activo: true,
    ...overrides,
  };
}

function serviceFor({ catalog = [], selectedResult, assistedResult } = {}) {
  const service = new ServicioFoodLogs();
  service._actor = async () => actor({
    menu: { restrictions: { allergies: ["mani"] } },
    clientPermissions: { tracking: { forbiddenFoodIds: ["blocked"] } },
  });
  service._assertCanWriteTracking = () => {};
  service.alimentosModel = { obtenerAlimentos: async () => catalog };
  const calls = [];
  service.alimentosService = {
    generarCantidades: async (payload, context) => {
      calls.push({ payload, context });
      return calls.length === 1 ? selectedResult : assistedResult;
    },
  };
  return { service, calls };
}

test("selected_only nunca consulta ni incorpora candidatos", async () => {
  const context = serviceFor({
    catalog: [candidate("fat", "Aceite", "grasas")],
    selectedResult: { status: "ok", foods: [{ foodId: "rice", source: "selected" }], diff: { grasas: -20 } },
  });
  const result = await context.service.calculateRemainingQuantities({}, {
    date: DATE,
    generationType: "selected_only",
    target: { kcal: 600, proteina: 40, carbs: 80, grasas: 20 },
    pendingFoods: [{ foodId: "rice" }],
  });
  assert.equal(context.calls.length, 1);
  assert.equal(result.foods.length, 1);
});

test("assisted filtra restricciones y usa el mismo motor con roles deficitarios", async () => {
  const context = serviceFor({
    catalog: [
      candidate("fat", "Aceite de oliva", "grasas"),
      candidate("peanut", "Manteca de mani", "grasas"),
      candidate("blocked", "Palta", "grasas"),
      candidate("selected", "Arroz", "carbohidratos"),
    ],
    selectedResult: { status: "ok", foods: [], diff: { proteina: -2, carbs: -1, grasas: -15, kcal: -100 } },
    assistedResult: { status: "ok", foods: [{ foodId: "fat", source: "addedCandidate" }] },
  });
  const result = await context.service.calculateRemainingQuantities({}, {
    date: DATE,
    generationType: "assisted_food_addition",
    target: { kcal: 600, proteina: 40, carbs: 80, grasas: 20 },
    pendingFoods: [{ foodId: "selected" }],
    rejectedSuggestionFoodIds: ["rejected"],
  });
  assert.equal(context.calls.length, 2);
  assert.deepEqual(context.calls[1].payload.candidateFoods.map((item) => item.id), ["fat"]);
  assert.deepEqual(context.calls[1].context.candidateRoles, ["proteicos", "grasas"]);
  assert.equal(result.generationType, "assisted_food_addition");
  assert.equal(result.assisted.added, 1);
});

test("sin candidatos permitidos conserva la mejor solucion seleccionada y explica la limitacion", async () => {
  const selectedResult = { status: "ok", foods: [{ foodId: "rice" }], diff: { proteina: -25 }, warnings: [] };
  const context = serviceFor({
    catalog: [candidate("peanut", "Manteca de mani", "proteicos")],
    selectedResult,
  });
  const result = await context.service.calculateRemainingQuantities({}, {
    date: DATE,
    generationType: "assisted_food_addition",
    target: { kcal: 500, proteina: 50 },
    pendingFoods: [{ foodId: "rice" }],
  });
  assert.equal(context.calls.length, 1);
  assert.equal(result.assisted.reason, "no_allowed_candidates");
  assert.match(result.warnings[0], /restricciones/i);
});

test("menu automatico asistido ofrece solo candidatos GENERIC compatibles con la comida", async () => {
  const genericLunch = candidate("generic-lunch", "Arroz generico", "carbohidratos", {
    generation: { mode: "GENERIC", mealTypes: { lunch: true } },
  });
  const explicitLunch = candidate("explicit-lunch", "Arroz explicito", "carbohidratos", {
    generation: { mode: "EXPLICIT_ONLY", mealTypes: { lunch: true } },
  });
  const genericDinner = candidate("generic-dinner", "Papa para cena", "carbohidratos", {
    generation: { mode: "GENERIC", mealTypes: { dinner: true } },
  });
  const context = serviceFor({
    catalog: [genericLunch, explicitLunch, genericDinner],
    selectedResult: { status: "ok", foods: [], diff: { carbs: -30 } },
    assistedResult: { status: "ok", foods: [{ foodId: "generic-lunch", source: "addedCandidate" }] },
  });
  await context.service.calculateRemainingQuantities({}, {
    date: DATE,
    generationType: "assisted_food_addition",
    menuGenerationPolicy: "generic_menu_v1",
    generationMealType: "lunch",
    target: { kcal: 500, proteina: 30, carbs: 60, grasas: 15 },
    pendingFoods: [{ foodId: "selected" }],
  });
  assert.deepEqual(context.calls[1].payload.candidateFoods.map((food) => food.id), ["generic-lunch"]);
  assert.equal(context.calls[0].context.enforceQuantityConstraints, true);
});
