import test from "node:test";
import assert from "node:assert/strict";

import ServicioFoodLogs from "../servicio/foodLogs.js";

const date = new Date().toISOString().slice(0, 10);

function context(plan = "free") {
  const actor = {
    _id: `client-${plan}`,
    id: `client-${plan}`,
    role: "cliente",
    plan,
    metasActuales: { kcal: 2100, proteina: 150, carbs: 230, grasas: 65 },
  };
  const logs = [];
  const groups = new Map();
  const service = new ServicioFoodLogs();
  service._actor = async () => actor;
  service._assertCanWriteTracking = () => {};
  service._resolveObjective = async () => ({ objetivo: actor.metasActuales, source: "metasActuales" });
  service._ensureMealConfig = async () => {};
  service.foodLogsModel = {
    upsertDayBase: async () => ({ _id: "day-1", date, mealsConfig: [] }),
    getDayByUserDate: async () => ({ _id: "day-1", date, mealsConfig: [] }),
    insertLog: async (doc) => {
      const duplicate = logs.some((log) => (
        log.writeRequestId === doc.writeRequestId && log.writeItemIndex === doc.writeItemIndex
      ));
      if (duplicate) {
        const error = new Error("duplicate");
        error.code = 11000;
        throw error;
      }
      const stored = { ...doc, _id: `log-${logs.length + 1}` };
      logs.push(stored);
      return stored;
    },
    listLogsByUserDate: async () => logs,
    getLogById: async (logId) => logs.find((log) => String(log._id) === String(logId)) || null,
    deleteLogById: async (logId) => {
      const index = logs.findIndex((log) => String(log._id) === String(logId));
      if (index < 0) return { deletedCount: 0 };
      logs.splice(index, 1);
      return { deletedCount: 1 };
    },
    deleteLogsByMeal: async ({ mealId }) => {
      let deletedCount = 0;
      for (let index = logs.length - 1; index >= 0; index -= 1) {
        if (String(logs[index].mealId) !== String(mealId)) continue;
        logs.splice(index, 1);
        deletedCount += 1;
      }
      return { deletedCount };
    },
    updateDayMealsConfig: async (_id, mealsConfig) => ({ _id, date, mealsConfig }),
    updateDayTotals: async (_id, totals) => ({ _id, date, totals, mealsConfig: [] }),
    listAllocationsByUserDate: async () => [...groups.values()],
    getAllocationByRequest: async (_userId, _date, requestId) => groups.get(requestId) || null,
    upsertAllocation: async (doc) => {
      const stored = { ...doc, _id: `allocation-${groups.size + 1}` };
      groups.set(doc.writeRequestId, stored);
      return stored;
    },
    deleteAllocationByRequest: async (_userId, _date, requestId) => ({ deletedCount: groups.delete(requestId) ? 1 : 0 }),
  };
  return { actor, service, logs, groups };
}

const payload = {
  requestId: "tracking-allocation:test-1",
  date,
  mealId: "menu_target_almuerzo",
  mealType: "almuerzo",
  mealName: "Almuerzo",
  items: [{ nombre: "Comida real", cantidad: 1, unidad: "porción", kcal: 600, proteina: 30, carbs: 60, grasas: 20 }],
  allocations: [
    { kind: "free", executionId: "flexible_margin", label: "Calorías libres", totals: { kcal: 200 } },
    { kind: "meal_target", executionId: "menu_target_almuerzo", label: "Almuerzo", totals: { kcal: 400 } },
  ],
};

test("una combinación persiste un FoodLog real y allocations separadas", async () => {
  const { actor, service, logs, groups } = context("free");
  const response = await service.addBatchLogs(actor, payload);

  assert.equal(logs.length, 1);
  assert.equal(groups.size, 1);
  assert.equal(response.totals.kcal, 600);
  assert.deepEqual(response.allocations[0].allocations.map((entry) => entry.totals.kcal), [200, 400]);
  assert.equal(response.allocationTotalsByDestination.flexible_margin.kcal, 200);
  assert.equal(response.allocationTotalsByDestination.menu_target_almuerzo.kcal, 400);
});

test("retry conserva idempotencia de FoodLogs y serialización de allocations", async () => {
  const { actor, service, logs, groups } = context("free");
  const first = await service.addBatchLogs(actor, payload);
  const retry = await service.addBatchLogs(actor, payload);

  assert.equal(first.insertedCount, 1);
  assert.equal(retry.insertedCount, 0);
  assert.equal(retry.idempotent, true);
  assert.equal(logs.length, 1);
  assert.equal(groups.size, 1);
  assert.equal(retry.allocations[0].writeRequestId, payload.requestId);
});

test("el batch manual funciona sin capability AUTO", async () => {
  const { actor, service } = context("free");
  const response = await service.addBatchLogs(actor, { ...payload, allocations: undefined });
  assert.equal(response.insertedCount, 1);
});

test("backend rechaza allocations que no suman el consumo real", async () => {
  const { actor, service } = context("pro");
  await assert.rejects(
    () => service.addBatchLogs(actor, {
      ...payload,
      requestId: "tracking-allocation:invalid",
      allocations: [{ kind: "meal_target", executionId: "menu_target_almuerzo", totals: { kcal: 450 } }],
    }),
    /INVALID_ALLOCATION_TOTAL/
  );
});

test("borrar FoodLogs reconcilia y finalmente elimina la allocation persistida", async () => {
  const { actor, service, logs, groups } = context("free");
  const twoItemPayload = {
    ...payload,
    requestId: "tracking-allocation:delete",
    items: [
      { nombre: "Parte A", cantidad: 1, unidad: "porciÃ³n", kcal: 300, proteina: 15, carbs: 30, grasas: 10 },
      { nombre: "Parte B", cantidad: 1, unidad: "porciÃ³n", kcal: 300, proteina: 15, carbs: 30, grasas: 10 },
    ],
  };
  await service.addBatchLogs(actor, twoItemPayload);

  await service.deleteLog(actor, logs[0]._id);
  assert.equal(logs.length, 1);
  assert.equal(groups.get(twoItemPayload.requestId).total.kcal, 300);
  assert.deepEqual(
    groups.get(twoItemPayload.requestId).allocations.map((entry) => entry.totals.kcal),
    [100, 200]
  );

  await service.deleteLog(actor, logs[0]._id);
  assert.equal(logs.length, 0);
  assert.equal(groups.has(twoItemPayload.requestId), false);
});

test("vaciar la comida completa también elimina la allocation del batch", async () => {
  const { actor, service, logs, groups } = context("free");
  await service.addBatchLogs(actor, { ...payload, requestId: "tracking-allocation:clear-meal" });

  await service.deleteMeal(actor, payload.mealId, { date, confirmDeleteLogs: true });

  assert.equal(logs.length, 0);
  assert.equal(groups.has("tracking-allocation:clear-meal"), false);
});
