import test from "node:test";
import assert from "node:assert/strict";

import ServicioFoodLogs from "../servicio/foodLogs.js";
import ServicioUsuarios from "../servicio/usuarios.js";
import { getClientNutritionCapabilities } from "../servicio/clientNutritionCapabilities.js";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function dayKey(dateValue) {
  const keys = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  return keys[new Date(`${dateValue}T00:00:00.000Z`).getUTCDay()];
}

function assignedPlanFor(date) {
  const key = dayKey(date);
  const menuSnapshot = {
    id: "menu-base-1",
    baseId: "menu-base-1",
    name: "Menu de prueba",
    kcal: 2000,
    protein: 150,
    carbs: 220,
    fat: 65,
    mealsCount: 5,
    meals: Array.from({ length: 5 }, (_, index) => ({
      id: `meal-${index + 1}`,
      nombre: `Comida ${index + 1}`,
      tipoComida: "otro",
      totales: { kcal: 400, proteina: 30, carbs: 44, grasas: 13 },
    })),
  };
  return {
    activeSource: "own",
    assignments: {
      [key]: {
        primaryMenu: {
          menuId: "menu-base-1",
          source: "own",
          menuSnapshot,
        },
      },
    },
  };
}

function client(plan = "free") {
  return {
    _id: "507f1f77bcf86cd799439011",
    id: "507f1f77bcf86cd799439011",
    role: "cliente",
    personalPlan: plan,
    plan,
    menu: { activeSource: "own" },
    metasActuales: { kcal: 2000, proteina: 150, carbs: 220, grasas: 65 },
  };
}

function completionService({ plan = "free", completed = 2 } = {}) {
  const date = todayIso();
  const user = client(plan);
  let stored = completed
    ? {
        _id: "tracking-1",
        clientId: user._id,
        date,
        dayKey: dayKey(date),
        completedMenuMeals: Array.from({ length: completed }, (_, index) => ({
          mealId: `meal-${index + 1}`,
          totals: { kcal: 400, proteina: 30, carbs: 44, grasas: 13 },
        })),
        manualEntries: [],
        generatedRemainingMeals: [],
        mealReplacements: [],
        foodReplacements: [],
        consumedTotals: { kcal: completed * 400, proteina: completed * 30, carbs: completed * 44, grasas: completed * 13 },
        nutrition: {
          status: "in_progress",
          completedMealsCount: completed,
          totalMealsCount: 5,
        },
      }
    : null;

  const service = new ServicioUsuarios();
  service.getById = async () => user;
  service._resolveClientMenuPlan = async () => assignedPlanFor(date);
  service.menuTrackingModel = {
    getByUserDate: async () => stored,
    setDayCompletionState: async (doc) => {
      stored = {
        ...(stored || {
          _id: "tracking-1",
          completedMenuMeals: [],
          manualEntries: [],
          generatedRemainingMeals: [],
          mealReplacements: [],
          foodReplacements: [],
          consumedTotals: { kcal: 0, proteina: 0, carbs: 0, grasas: 0 },
          nutrition: {},
        }),
        ...doc,
      };
      return stored;
    },
  };
  return { service, user, date, getStored: () => stored };
}

test("capabilities explicitas habilitan completar manualmente para Free y planificar solo para Pro/VIP", () => {
  const free = getClientNutritionCapabilities(client("free"));
  const pro = getClientNutritionCapabilities(client("pro"));
  const vip = getClientNutritionCapabilities(client("vip"));
  assert.equal(free.canUseManualDayCompletion, true);
  assert.equal(free.canPlanRemainingIntake, false);
  assert.equal(free.canAutoCalculateTrackingQuantities, false);
  assert.equal(pro.canPlanRemainingIntake, true);
  assert.equal(pro.canAutoCalculateTrackingQuantities, true);
  assert.equal(vip.canPlanRemainingIntake, true);
  assert.equal(vip.canAutoCalculateTrackingQuantities, true);
});

test("activar manual_completion conserva comidas realizadas y es idempotente", async () => {
  const context = completionService({ plan: "free", completed: 3 });
  const first = await context.service.updateMyMenuTrackingDayCompletion(
    { id: context.user.id },
    context.date,
    { dayCompletionMode: "manual_completion" }
  );
  const firstStartedAt = context.getStored().manualCompletion.startedAt;

  const second = await context.service.updateMyMenuTrackingDayCompletion(
    { id: context.user.id },
    context.date,
    { dayCompletionMode: "manual_completion" }
  );

  assert.equal(first.ok, true);
  assert.equal(second.idempotent, true);
  assert.equal(context.getStored().dayCompletionMode, "manual_completion");
  assert.equal(context.getStored().completedMenuMeals.length, 3);
  assert.equal(context.getStored().manualCompletion.startedCompletedMealsCount, 3);
  assert.equal(context.getStored().manualCompletion.startedTotalMealsCount, 5);
  assert.equal(context.getStored().manualCompletion.startedAt, firstStartedAt);
});

test("Free no puede persistir planificación automática de momentos", async () => {
  const context = completionService({ plan: "free", completed: 1 });
  await assert.rejects(
    context.service.updateMyMenuTrackingDayCompletion(
      { id: context.user.id },
      context.date,
      { dayCompletionMode: "manual_completion", plan: { count: 3 } }
    ),
    /REMAINING_INTAKE_PLAN_NOT_ALLOWED/
  );
});

test("Pro persiste de 1 a 4 momentos temporales sin guardar un restante fijo", async () => {
  const context = completionService({ plan: "pro", completed: 2 });
  await context.service.updateMyMenuTrackingDayCompletion(
    { id: context.user.id },
    context.date,
    { dayCompletionMode: "manual_completion", plan: { count: 4 } }
  );
  const stored = context.getStored();
  assert.equal(stored.manualCompletion.plan.count, 4);
  assert.equal(stored.manualCompletion.plan.moments.length, 4);
  assert.equal(Object.hasOwn(stored.manualCompletion, "remainingTotals"), false);
});

test("el cálculo automático de cantidades falla cerrado para Free y funciona para Pro", async () => {
  const date = todayIso();
  const freeService = new ServicioFoodLogs();
  freeService._actor = async () => client("free");
  freeService._assertCanWriteTracking = () => {};
  freeService.alimentosService = { generarCantidades: async () => ({ status: "ok", foods: [] }) };
  await assert.rejects(
    freeService.calculateRemainingQuantities({ id: client("free").id }, { date, target: { kcal: 200 } }),
    /PLAN_CAPABILITY_REQUIRED/
  );

  const proService = new ServicioFoodLogs();
  proService._actor = async () => client("pro");
  proService._assertCanWriteTracking = () => {};
  proService.alimentosService = {
    generarCantidades: async (payload) => ({ status: "ok", foods: [{ nombre: "Banana" }], target: payload.target }),
  };
  const result = await proService.calculateRemainingQuantities(
    { id: client("pro").id },
    { date, target: { kcal: 200 } }
  );
  assert.equal(result.status, "ok");
  assert.equal(result.target.kcal, 200);
});

test("confirmar cantidades calculadas usa una escritura batch idempotente", async () => {
  const date = todayIso();
  const actor = client("pro");
  const logs = [];
  const service = new ServicioFoodLogs();
  service._actor = async () => actor;
  service._assertCanWriteTracking = () => {};
  service._resolveObjective = async () => ({ objetivo: actor.metasActuales });
  service._ensureMealConfig = async () => {};
  service._buildResponse = async (_actor, responseDate) => ({ date: responseDate, totals: {} });
  service.foodLogsModel = {
    upsertDayBase: async () => ({ _id: "day-1" }),
    insertLog: async (doc) => {
      const duplicate = logs.some((log) =>
        log.writeRequestId === doc.writeRequestId && log.writeItemIndex === doc.writeItemIndex
      );
      if (duplicate) {
        const error = new Error("duplicate");
        error.code = 11000;
        throw error;
      }
      logs.push(doc);
    },
    listLogsByUserDate: async () => logs,
    updateDayTotals: async () => ({ _id: "day-1" }),
  };
  const payload = {
    requestId: "manual-completion:test-request",
    date,
    mealId: "manual_completion_moment_1",
    mealType: "otra",
    items: [
      { nombre: "Banana", cantidad: 120, unidad: "g", kcal: 105 },
      { nombre: "Yogur", cantidad: 200, unidad: "g", kcal: 130 },
    ],
  };

  const first = await service.addCalculatedLogs({ id: actor.id }, payload);
  const retry = await service.addCalculatedLogs({ id: actor.id }, payload);

  assert.equal(first.insertedCount, 2);
  assert.equal(first.idempotent, false);
  assert.equal(retry.insertedCount, 0);
  assert.equal(retry.idempotent, true);
  assert.equal(logs.length, 2);
  assert.ok(logs.every((log) => log.source === "manual_completion_calculator"));
});

test("el DTO del coach separa adherencia de menú, nutrición y tracking manual", async () => {
  const date = todayIso();
  const actor = client("vip");
  const service = new ServicioUsuarios();
  service._getCoachClientPair = async () => ({ coach: { id: "coach-1" }, client: actor });
  service.menuTrackingModel = {
    listByUserDateRange: async () => [{
      _id: "tracking-1",
      date,
      dayKey: dayKey(date),
      target: { kcal: 2000, proteina: 150, carbs: 220, grasas: 65 },
      consumedTotals: { kcal: 1350, proteina: 100, carbs: 140, grasas: 42 },
      completedMenuMeals: [{ mealId: "1" }, { mealId: "2" }, { mealId: "3" }],
      nutrition: { completedMealsCount: 3, totalMealsCount: 5, status: "partial" },
      dayCompletionMode: "manual_completion",
      manualCompletion: {
        startedAt: new Date("2026-07-23T15:00:00.000Z"),
        startedFromMenu: true,
        startedCompletedMealsCount: 3,
        startedTotalMealsCount: 5,
      },
    }],
  };
  service.foodLogsModel = {
    listLogsByUserDateRange: async () => [
      { date, kcal: 410, proteina: 25, carbs: 45, grasas: 12 },
      { date, kcal: 200, proteina: 10, carbs: 24, grasas: 6 },
    ],
  };

  const result = await service.getCoachClientMenuTracking({
    coachId: "coach-1",
    clientId: actor.id,
    query: { from: date, to: date },
  });
  const tracking = result.records[0].tracking;

  assert.equal(tracking.dayCompletionMode, "manual_completion");
  assert.equal(tracking.menuAdherencePercent, 60);
  assert.equal(tracking.manualTrackingTotals.kcal, 610);
  assert.equal(tracking.totalConsumedTotals.kcal, 1960);
  assert.equal(tracking.nutritionAdherencePercent, 98);
  assert.ok(tracking.manualCompletion.startedAt);
});
