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

test("backend bloquea organizacion avanzada de manual_completion en Free", async () => {
  const servicio = new ServicioFoodLogs();
  servicio.usuariosModel = {
    obtenerPorId: async () => ({ _id: "client-free", role: "cliente", plan: "free" }),
  };

  await assert.rejects(
    () => servicio.updateMealsConfig({ id: "client-free" }, {
      date: today,
      operation: "configure_manual_completion_meals",
      mealsConfig: [
        { mealId: "comida_1", tipo: "otra", nombre: "Comida 1" },
        { mealId: "comida_2", tipo: "otra", nombre: "Comida 2" },
      ],
    }),
    (error) => error.code === "PLAN_CAPABILITY_REQUIRED" && error.feature === "nutrition.planRemainingIntake"
  );
});

test("backend limita manual_completion Pro a entre 1 y 4 comidas", async () => {
  const servicio = new ServicioFoodLogs();
  servicio.usuariosModel = {
    obtenerPorId: async () => ({ _id: "client-pro", role: "cliente", plan: "pro" }),
  };

  await assert.rejects(
    () => servicio.updateMealsConfig({ id: "client-pro" }, {
      date: today,
      operation: "configure_manual_completion_meals",
      mealsConfig: Array.from({ length: 5 }, (_, index) => ({
        mealId: `comida_${index + 1}`,
        tipo: "otra",
        nombre: `Comida ${index + 1}`,
      })),
    }),
    /MANUAL_COMPLETION_MEALS_LIMIT/
  );
});

test("backend no elimina una comida con food_logs sin confirmacion explicita", async () => {
  const servicio = new ServicioFoodLogs();
  servicio.usuariosModel = {
    obtenerPorId: async () => ({ _id: "client-pro", role: "cliente", plan: "pro" }),
  };
  servicio._dayForConfig = async () => ({
    objectiveInfo: { objetivo: { kcal: 2100 }, source: "metasActuales" },
    day: {
      _id: "day-pro",
      date: today,
      mealsConfig: [{ mealId: "comida_2", tipo: "otra", nombre: "Comida 2" }],
    },
  });
  let deleted = false;
  servicio.foodLogsModel = {
    listLogsByUserDate: async () => [{ mealId: "comida_2", kcal: 120 }],
    deleteLogsByMeal: async () => {
      deleted = true;
    },
  };

  await assert.rejects(
    () => servicio.deleteMeal(
      { id: "client-pro" },
      "comida_2",
      { date: today }
    ),
    /TRACKING_MEAL_NOT_EMPTY/
  );
  assert.equal(deleted, false);
});
