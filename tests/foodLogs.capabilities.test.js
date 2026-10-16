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

test("la configuracion normal permite persistir seis metas personales sin marcarlas consumidas", async () => {
  const servicio = new ServicioFoodLogs();
  servicio.usuariosModel = {
    obtenerPorId: async () => ({ _id: "client-pro", role: "cliente", plan: "pro" }),
  };
  servicio._dayForConfig = async () => ({
    objectiveInfo: {
      objetivo: { kcal: 2132, proteina: 170, carbs: 206, grasas: 70 },
      source: "metasActuales",
      planificado: null,
    },
    day: { _id: "day-six-targets", date: today, mealsConfig: [] },
  });
  servicio.foodLogsModel = {
    updateDayMealsConfig: async (_dayId, mealsConfig) => ({
      _id: "day-six-targets",
      date: today,
      mealsConfig,
    }),
    listLogsByUserDate: async () => [],
  };
  const mealsConfig = Array.from({ length: 6 }, (_, index) => ({
    mealId: `menu_target_slot_${index + 1}`,
    tipo: "snack",
    nombre: `Comida ${index + 1}`,
    meta: { kcal: 300 + index, proteina: 20, carbs: 30, grasas: 10 },
    targetOrigin: index === 0 ? "manual" : "auto",
    targetLocked: index === 2,
    personalTarget: true,
    metaConfirmed: index === 1,
    metaConfirmation: index === 1 ? {
      mode: "manual_consumption",
      previousMeta: { kcal: 400, proteina: 30, carbs: 40, grasas: 12 },
      consumedMeta: { kcal: 301, proteina: 20, carbs: 30, grasas: 10 },
    } : null,
    consumptionSourceMealIds: index === 1
      ? ["saved_breakfast", "legacy_breakfast", "saved_breakfast"]
      : [],
  }));

  const response = await servicio.updateMealsConfig({ id: "client-pro" }, {
    date: today,
    mealsConfig,
  });

  assert.equal(response.mealsConfig.length, 6);
  assert.ok(response.mealsConfig.every((meal) => meal.mealId.startsWith("menu_target_")));
  assert.ok(response.mealsConfig.every((meal) => response.meals[meal.mealId].length === 0));
  assert.deepEqual(response.mealsConfig.map((meal) => meal.metaConfirmed), [false, true, false, false, false, false]);
  assert.deepEqual(response.mealsConfig.map((meal) => meal.targetOrigin), ["manual", "auto", "auto", "auto", "auto", "auto"]);
  assert.equal(response.mealsConfig[2].targetLocked, true);
  assert.ok(response.mealsConfig.every((meal) => meal.personalTarget === true));
  assert.deepEqual(response.mealsConfig[1].metaConfirmation, {
    mode: "manual_consumption",
    previousMeta: { kcal: 400, proteina: 30, carbs: 40, grasas: 12 },
    consumedMeta: { kcal: 301, proteina: 20, carbs: 30, grasas: 10 },
  });
  assert.equal(response.mealsConfig[0].metaConfirmation, null);
  assert.deepEqual(response.mealsConfig[1].consumptionSourceMealIds, [
    "menu_target_slot_2",
    "saved_breakfast",
    "legacy_breakfast",
  ]);
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

test("quitar sólo la meta conserva FoodLogs y rehidrata el mismo mealId al recargar", async () => {
  const servicio = new ServicioFoodLogs();
  const actor = { _id: "client-pro", id: "client-pro", role: "cliente", plan: "pro" };
  const logs = [{
    id: "rice-log",
    userId: actor.id,
    date: today,
    mealId: "target-lunch",
    mealType: "almuerzo",
    nombreSnapshot: "Arroz",
    kcal: 300,
    proteina: 6,
    carbs: 66,
    grasas: 1,
  }];
  const state = {
    mealsConfig: [{
      mealId: "target-lunch",
      tipo: "almuerzo",
      nombre: "Almuerzo",
      personalTarget: true,
      targetOrigin: "manual",
      meta: { kcal: 700, proteina: 45, carbs: 80, grasas: 20 },
      metaConfirmed: true,
      metaConfirmation: { mode: "manual_consumption", previousMeta: { kcal: 700 } },
    }],
  };

  servicio._actor = async () => actor;
  servicio._assertCanWriteTracking = () => {};
  servicio._dayForConfig = async () => ({
    objectiveInfo: { objetivo: { kcal: 2100 }, source: "metasActuales" },
    day: { _id: "day-target", date: today, mealsConfig: state.mealsConfig },
  });
  servicio.foodLogsModel = {
    updateDayMealsConfig: async (_dayId, mealsConfig) => {
      state.mealsConfig = mealsConfig;
      return { _id: "day-target", date: today, mealsConfig };
    },
    listLogsByUserDate: async () => logs,
  };

  const response = await servicio.updateMealsConfig(actor, { date: today, mealsConfig: [] });
  assert.deepEqual(state.mealsConfig, []);
  assert.equal(response.meals["target-lunch"].length, 1);
  assert.equal(response.meals["target-lunch"][0].id, "rice-log");
  assert.equal(response.mealsConfig.find((meal) => meal.mealId === "target-lunch")?.meta, null);

  const reloaded = await servicio._buildResponse(
    actor,
    today,
    { objetivo: { kcal: 2100 }, source: "metasActuales" },
    { _id: "day-target", date: today, mealsConfig: state.mealsConfig },
    logs
  );
  assert.equal(reloaded.meals["target-lunch"][0].mealId, "target-lunch");
  assert.equal(reloaded.mealsConfig.find((meal) => meal.mealId === "target-lunch")?.meta, null);
});

test("el borrado batch elimina metas personales en una sola pasada y conserva las demas comidas", async () => {
  const servicio = new ServicioFoodLogs();
  const actor = { _id: "client-pro", id: "client-pro", role: "cliente", plan: "pro" };
  const state = {
    mealsConfig: [
      { mealId: "menu_target_desayuno_self", tipo: "desayuno", nombre: "Desayuno" },
      { mealId: "coach_lunch", tipo: "almuerzo", nombre: "Almuerzo del coach" },
      { mealId: "menu_target_cena_self", tipo: "cena", nombre: "Cena" },
    ],
    logs: [
      { mealId: "menu_target_desayuno_self", kcal: 300, writeRequestId: "allocation-self" },
      { mealId: "menu_target_cena_self", kcal: 500, writeRequestId: "allocation-self" },
      { mealId: "coach_lunch", kcal: 700, writeRequestId: "allocation-coach" },
    ],
  };
  const calls = {
    list: 0,
    deleteBatch: 0,
    updateConfig: 0,
    updateTotals: 0,
    reconcile: [],
  };

  servicio._actor = async () => actor;
  servicio._assertCanWriteTracking = () => {};
  servicio._dayForConfig = async () => ({
    objectiveInfo: { objetivo: { kcal: 2100 }, source: "metasActuales" },
    day: { _id: "day-batch", date: today, mealsConfig: state.mealsConfig },
  });
  servicio._reconcileAllocationGroup = async (_actor, _date, requestId) => {
    calls.reconcile.push(requestId);
  };
  servicio._buildResponse = async (_actor, date, _objective, day, logs) => ({
    date,
    mealsConfig: day.mealsConfig,
    meals: Object.fromEntries(day.mealsConfig.map((meal) => [
      meal.mealId,
      logs.filter((log) => log.mealId === meal.mealId),
    ])),
  });
  servicio.foodLogsModel = {
    listLogsByUserDate: async () => {
      calls.list += 1;
      return [...state.logs];
    },
    deleteLogsByMeals: async ({ meals }) => {
      calls.deleteBatch += 1;
      const ids = new Set(meals.map((meal) => meal.mealId));
      const before = state.logs.length;
      state.logs = state.logs.filter((log) => !ids.has(log.mealId));
      return { deletedCount: before - state.logs.length };
    },
    updateDayMealsConfig: async (_dayId, mealsConfig) => {
      calls.updateConfig += 1;
      state.mealsConfig = mealsConfig;
      return { _id: "day-batch", date: today, mealsConfig };
    },
    updateDayTotals: async (_dayId, totals) => {
      calls.updateTotals += 1;
      return { _id: "day-batch", date: today, mealsConfig: state.mealsConfig, totals };
    },
  };

  const response = await servicio.deleteMeals(actor, {
    date: today,
    mealIds: ["menu_target_desayuno_self", "menu_target_cena_self"],
    confirmDeleteLogs: true,
  });

  assert.equal(calls.deleteBatch, 1);
  assert.equal(calls.list, 2);
  assert.equal(calls.updateConfig, 1);
  assert.equal(calls.updateTotals, 1);
  assert.deepEqual(calls.reconcile, ["allocation-self"]);
  assert.deepEqual(response.deletedMealIds, ["menu_target_desayuno_self", "menu_target_cena_self"]);
  assert.equal(response.deletedLogsCount, 2);
  assert.deepEqual(response.mealsConfig.map((meal) => meal.mealId), ["coach_lunch"]);
  assert.deepEqual(state.logs.map((log) => log.mealId), ["coach_lunch"]);
});
