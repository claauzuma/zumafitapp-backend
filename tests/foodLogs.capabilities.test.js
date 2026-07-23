import assert from "node:assert/strict";
import test from "node:test";

import ServicioFoodLogs from "../servicio/foodLogs.js";

const today = new Date().toISOString().slice(0, 10);

test("tracking no inventa una meta si el cliente no tiene objetivos reales", async () => {
  const servicio = new ServicioFoodLogs();
  const actor = { _id: "client-free", role: "cliente", plan: "free" };

  const objectiveInfo = await servicio._resolveObjective(actor);
  const response = await servicio._buildResponse(
    actor,
    today,
    objectiveInfo,
    {
      _id: "day-1",
      date: today,
      objetivo: { kcal: 1900, proteina: 140, carbs: 205, grasas: 58 },
      mealsConfig: [],
    },
    []
  );

  assert.equal(objectiveInfo.objetivo, null);
  assert.equal(objectiveInfo.source, "missing");
  assert.equal(response.objetivo, null);
  assert.equal(response.objetivoSource, "missing");
  assert.equal(response.remaining, null);
});

test("backend bloquea persistencia de distribucion automatica en Free", async () => {
  const servicio = new ServicioFoodLogs();
  servicio.usuariosModel = {
    obtenerPorId: async () => ({ _id: "client-free", role: "cliente", plan: "free" }),
  };

  await assert.rejects(
    () => servicio.updateMealsConfig({ id: "client-free" }, {
      date: today,
      operation: "auto_complete_remaining_meals",
      mealsConfig: [],
    }),
    (error) => error.code === "PLAN_CAPABILITY_REQUIRED" && error.feature === "nutrition.autoCompleteRemainingMeals"
  );
});

test("backend permite distribucion automatica solo con capability explicita", async () => {
  const servicio = new ServicioFoodLogs();
  servicio.usuariosModel = {
    obtenerPorId: async () => ({ _id: "client-pro", role: "cliente", plan: "pro" }),
  };
  servicio._dayForConfig = async () => ({
    objectiveInfo: {
      objetivo: { kcal: 2100, proteina: 150, carbs: 240, grasas: 60 },
      source: "metasActuales",
      planificado: null,
    },
    day: { _id: "day-pro", date: today, mealsConfig: [] },
  });
  servicio.foodLogsModel = {
    updateDayMealsConfig: async (_dayId, mealsConfig) => ({
      _id: "day-pro",
      date: today,
      mealsConfig,
    }),
    listLogsByUserDate: async () => [],
  };

  const response = await servicio.updateMealsConfig({ id: "client-pro" }, {
    date: today,
    operation: "auto_complete_remaining_meals",
    mealsConfig: [
      {
        mealId: "almuerzo",
        tipo: "almuerzo",
        nombre: "Almuerzo",
        meta: { kcal: 800, proteina: 50, carbs: 90, grasas: 20 },
      },
    ],
  });

  assert.equal(response.objetivo.kcal, 2100);
  assert.equal(response.mealsConfig[0].meta.kcal, 800);
});
