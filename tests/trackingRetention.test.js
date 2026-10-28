import assert from "node:assert/strict";
import test from "node:test";

import { TrackingRetentionService } from "../servicio/trackingRetention.js";
import {
  argentinaCalendarDate,
  trackingDetailExpiresAt,
  trackingRetentionWindow,
  trackingSummaryExpiresAt,
} from "../utils/trackingRetention.js";

function asyncCursor(documents = [], error = null) {
  return {
    async *[Symbol.asyncIterator]() {
      if (error) throw error;
      for (const document of documents) yield document;
    },
  };
}

function fakeDb({ foodDays = [], menuDays = [], menuError = null } = {}) {
  const state = { indexes: [], operations: [], deletions: [] };
  const collections = new Map();

  collections.set("food_log_days", {
    find: () => asyncCursor(foodDays),
    deleteMany: async (filter) => {
      state.deletions.push(["food_log_days", filter]);
      return { deletedCount: 2 };
    },
  });
  collections.set("client_menu_tracking", {
    find: () => asyncCursor(menuDays, menuError),
    deleteMany: async (filter) => {
      state.deletions.push(["client_menu_tracking", filter]);
      return { deletedCount: 1 };
    },
  });
  for (const name of ["food_logs", "food_log_allocations"]) {
    collections.set(name, {
      deleteMany: async (filter) => {
        state.deletions.push([name, filter]);
        return { deletedCount: 3 };
      },
    });
  }
  collections.set("nutrition_daily_summaries", {
    createIndex: async (keys, options = {}) => {
      state.indexes.push([keys, options]);
    },
    bulkWrite: async (operations) => {
      state.operations.push(...operations);
      return { ok: 1 };
    },
  });

  return {
    state,
    db: {
      collection(name) {
        const collection = collections.get(name);
        if (!collection) throw new Error(`Coleccion inesperada: ${name}`);
        return collection;
      },
    },
  };
}

test("la ventana usa 14 dias de detalle y 183 de resumen en Argentina", () => {
  const now = new Date("2026-10-22T02:30:00.000Z");
  assert.equal(argentinaCalendarDate(now), "2026-10-21");
  assert.deepEqual(trackingRetentionWindow(now), {
    today: "2026-10-21",
    detailFrom: "2026-10-08",
    summaryFrom: "2026-04-22",
  });
  assert.equal(trackingDetailExpiresAt("2026-10-08").toISOString(), "2026-10-22T03:00:00.000Z");
  assert.equal(trackingSummaryExpiresAt("2026-10-01").toISOString(), "2027-04-02T03:00:00.000Z");
});

test("resume primero y luego elimina detalle anterior al corte", async () => {
  const { db, state } = fakeDb({
    foodDays: [{ userId: "user-1", date: "2026-10-01", totals: { kcal: 1800 } }],
    menuDays: [{
      clientId: "user-1",
      date: "2026-10-01",
      consumedTotals: { kcal: 1800 },
      nutrition: { status: "complete", adherencePercent: 92, completedMealsCount: 4, totalMealsCount: 4 },
    }],
  });
  const service = new TrackingRetentionService({ db });
  const result = await service.run({ now: new Date("2026-10-22T15:00:00.000Z") });

  assert.equal(result.detailFrom, "2026-10-09");
  assert.equal(result.summaryFrom, "2026-04-23");
  assert.equal(state.operations.length, 2);
  assert.equal(state.operations[0].updateOne.filter.userId, "user-1");
  assert.equal(state.operations[1].updateOne.update.$set.nutrition.adherencePercent, 92);
  assert.deepEqual(state.deletions.map(([name]) => name), [
    "food_logs",
    "food_log_allocations",
    "client_menu_tracking",
    "food_log_days",
  ]);
  assert.ok(state.deletions.every(([, filter]) => filter.date.$lt === "2026-10-09"));
  assert.ok(state.indexes.some(([, options]) => options.expireAfterSeconds === 0));
});

test("si falla el resumen no elimina ningun registro crudo", async () => {
  const { db, state } = fakeDb({
    foodDays: [{ userId: "user-1", date: "2026-10-01", totals: { kcal: 1800 } }],
    menuError: new Error("fallo de lectura"),
  });
  const service = new TrackingRetentionService({ db });

  await assert.rejects(
    () => service.run({ now: new Date("2026-10-22T15:00:00.000Z") }),
    /fallo de lectura/
  );
  assert.equal(state.deletions.length, 0);
});
