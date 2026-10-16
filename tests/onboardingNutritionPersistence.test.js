import assert from "node:assert/strict";
import test from "node:test";

import ServicioFoodLogs from "../servicio/foodLogs.js";
import ServicioUsuarios from "../servicio/usuarios.js";

function baseClient(overrides = {}) {
  return {
    _id: "client-onboarding-1",
    role: "cliente",
    tipo: "entrenado",
    plan: "pro",
    subscription: { status: "trialing" },
    profile: {
      basics: {
        fechaNacimiento: "1990-08-10",
        genero: "masculino",
        actividadDiaria: "moderado",
        frecuenciaEjercicio: "1_3",
        factorActividad: 1.55,
        tdeeEstimado: 2775,
      },
    },
    antropometriaActual: { pesoKg: 80, alturaCm: 180 },
    goal: {},
    metasActuales: {
      kcal: null,
      macros: { p: null, c: null, g: null },
      source: "system",
      updatedAt: null,
    },
    onboarding: { enabled: true, done: false, step: 2 },
    ...overrides,
  };
}

function inMemoryService(initialUser = baseClient()) {
  const service = new ServicioUsuarios();
  let current = initialUser;
  service.getById = async () => current;
  service.updateById = async (_id, patch) => {
    current = { ...current, ...patch };
    return current;
  };
  return { service, current: () => current };
}

test("onboarding v2 persiste como metasActuales los mismos kcal y macros confirmados", async () => {
  const memory = inMemoryService();
  const previewResult = await memory.service.clientPreviewNutrition({
    userId: "client-onboarding-1",
    payload: {
      goalType: "perder_peso",
      targetWeightKg: 72,
      ratePctBWPerWeek: 0.5,
    },
  });
  const confirmed = previewResult.preview.target;
  assert.equal(previewResult.preview.ready, true);

  await memory.service.actualizarOnboardingCliente("client-onboarding-1", 2, {
    __wizard: "v2",
    goal: {
      type: "perder_peso",
      initialBudgetKcal: confirmed.kcal,
      targetMacros: confirmed.macros,
      targetWeightKg: 72,
      ratePctBWPerWeek: -0.5,
      calculationSource: "server_nutrition_preview",
    },
  });
  await memory.service.actualizarOnboardingCliente("client-onboarding-1", 3, {
    __wizard: "v2",
    __final: true,
    program: { diet: "equilibrada", protein: "moderate" },
  });

  const reloaded = await memory.service.getById("client-onboarding-1");
  assert.equal(reloaded.onboarding.done, true);
  assert.equal(reloaded.metasActuales.kcal, confirmed.kcal);
  assert.deepEqual(reloaded.metasActuales.macros, confirmed.macros);
  assert.equal(reloaded.metasActuales.source, "self");
  assert.equal(reloaded.metasActuales.needsReview, false);

  const tracking = new ServicioFoodLogs();
  const trackingTarget = await tracking._resolveObjective(reloaded);
  assert.deepEqual(trackingTarget, {
    objetivo: {
      kcal: confirmed.kcal,
      proteina: confirmed.macros.p,
      carbs: confirmed.macros.c,
      grasas: confirmed.macros.g,
    },
    source: "metasActuales",
    planificado: null,
    menuAsignadoId: null,
    coachId: null,
  });
});

test("onboarding v2 no reemplaza una meta diaria preexistente", async () => {
  const existing = {
    kcal: 2100,
    macros: { p: 160, c: 220, g: 64 },
    source: "self",
    updatedAt: new Date("2026-10-01T12:00:00Z"),
  };
  const memory = inMemoryService(baseClient({
    goal: {
      type: "ganar_peso",
      initialBudgetKcal: 3000,
      targetMacros: { p: 150, c: 430, g: 75 },
    },
    metasActuales: existing,
  }));

  await memory.service.actualizarOnboardingCliente("client-onboarding-1", 3, {
    __wizard: "v2",
    __final: true,
    program: { diet: "equilibrada" },
  });

  assert.deepEqual(memory.current().metasActuales, existing);
});

test("onboarding de mantenimiento persiste el presupuesto confirmado", async () => {
  const memory = inMemoryService(baseClient({
    goal: {
      type: "mantener_peso",
      maintenanceKcal: 2775,
      initialBudgetKcal: 2775,
      targetMacros: { p: 128, c: 422, g: 64 },
      calculationSource: "server_nutrition_preview",
    },
  }));

  await memory.service.actualizarOnboardingCliente("client-onboarding-1", 3, {
    __wizard: "v2",
    __final: true,
    program: { diet: "equilibrada" },
  });

  assert.equal(memory.current().metasActuales.kcal, 2775);
  assert.deepEqual(memory.current().metasActuales.macros, { p: 128, c: 422, g: 64 });
});

test("onboarding parcial o sin un calculo completo no persiste metas invalidas", async () => {
  const partial = inMemoryService(baseClient({
    goal: { type: "perder_peso", initialBudgetKcal: 2200, targetMacros: null },
  }));
  await partial.service.actualizarOnboardingCliente("client-onboarding-1", 3, {
    __wizard: "v2",
    __final: false,
    program: { diet: "equilibrada" },
  });
  assert.equal(partial.current().onboarding.done, false);
  assert.equal(partial.current().metasActuales.kcal, null);

  await partial.service.actualizarOnboardingCliente("client-onboarding-1", 3, {
    __wizard: "v2",
    __final: true,
    program: { diet: "equilibrada" },
  });
  assert.equal(partial.current().onboarding.done, true);
  assert.equal(partial.current().metasActuales.kcal, null);
  assert.deepEqual(partial.current().metasActuales.macros, { p: null, c: null, g: null });
});

test("Configurar objetivos puede modificar luego la meta creada por onboarding", async () => {
  const memory = inMemoryService(baseClient({
    onboarding: { enabled: true, done: true, step: 3 },
    metasActuales: {
      kcal: 2335,
      macros: { p: 160, c: 264, g: 64 },
      source: "self",
      updatedAt: new Date("2026-10-11T12:00:00Z"),
    },
  }));

  await memory.service.clientUpdateGoals("client-onboarding-1", {
    metasActuales: { kcal: 2400, macros: { p: 165, c: 270, g: 66 } },
  });

  assert.equal(memory.current().metasActuales.kcal, 2400);
  assert.deepEqual(memory.current().metasActuales.macros, { p: 165, c: 270, g: 66 });
  assert.equal(memory.current().metasActuales.source, "self");
});
