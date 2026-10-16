import assert from "node:assert/strict";
import test from "node:test";
import ServicioClientDayFavorites from "../servicio/clientDayFavorites.js";

function user(kcal = 2800) {
  const factor = kcal / 2800;
  return {
    _id: "client-favorites",
    id: "client-favorites",
    role: "cliente",
    personalPlan: "pro",
    plan: "pro",
    metasActuales: { kcal, macros: { p: 175 * factor, c: 350 * factor, g: 77.7778 * factor } },
  };
}

function favorite(overrides = {}) {
  return {
    _id: "66d000000000000000000001",
    name: "Día 2625",
    plannedTotals: { kcal: 2625, proteina: 160, carbs: 320, grasas: 65 },
    physicalMeals: [],
    targetMeals: [{ name: "Desayuno", type: "desayuno", target: { kcal: 700, proteina: 40, carbs: 80, grasas: 20 } }],
    ...overrides,
  };
}

function serviceFor({ actor = user(), stored = favorite() } = {}) {
  const service = new ServicioClientDayFavorites();
  service.users = { obtenerPorId: async () => actor };
  service.model = {
    countByUser: async () => 0,
    listByUser: async () => [],
    getByIdForUser: async () => stored,
    create: async (doc) => ({ _id: "66d000000000000000000009", ...doc }),
    softDelete: async () => true,
  };
  service.tracking = {
    getByUserDate: async () => null,
    setDayPlanOverride: async () => ({}),
  };
  service.foodLogDays = { getDayByUserDate: async () => null };
  service.foodLogs = { updateMealsConfig: async () => ({}) };
  return service;
}

test("Premium puede guardar hasta 20 días y la plantilla no necesita FoodLogs", async () => {
  const service = serviceFor();
  let saved = null;
  service.model.countByUser = async () => saved ? 20 : 19;
  service.model.create = async (doc) => {
    saved = { _id: "66d000000000000000000009", ...doc };
    return saved;
  };
  const result = await service.create({ id: "client-favorites" }, {
    name: "Mi día",
    dailyTarget: { kcal: 2800 },
    targetMeals: [{ name: "Cena", type: "cena", target: { kcal: 700 } }],
  });
  assert.equal(result.favorite.name, "Mi día");
  assert.equal(result.favorite.targetMeals.length, 1);
  assert.equal(result.usage.current, 20);
});

test("Premium bloquea el día guardado número 21", async () => {
  const service = serviceFor();
  service.model.countByUser = async () => 20;
  await assert.rejects(
    service.create({ id: "client-favorites" }, {
      targetMeals: [{ name: "Cena", type: "cena", target: { kcal: 700 } }],
    }),
    (failure) => failure.code === "PLAN_LIMIT_REACHED" && failure.limit === 20
  );
});

test("rechaza usar 2625 kcal en un día de 2000", async () => {
  const service = serviceFor({ actor: user(2000) });
  await assert.rejects(
    service.apply({ id: "client-favorites" }, "66d000000000000000000001", { date: "2026-10-15" }),
    (failure) => failure.code === "DAY_FAVORITE_TARGET_TOO_HIGH"
  );
});

test("usar 2625 kcal en un día de 2800 informa 175 kcal libres sin crear consumo", async () => {
  const service = serviceFor();
  let receivedConfig = null;
  service.foodLogs.updateMealsConfig = async (_actor, payload) => { receivedConfig = payload; return {}; };
  const result = await service.apply({ id: "client-favorites" }, "66d000000000000000000001", { date: "2026-10-15" });
  assert.equal(result.compatibility.extraFreeCalories, 175);
  assert.equal(receivedConfig.mealsConfig.length, 1);
  assert.equal(receivedConfig.mealsConfig[0].meta.kcal, 700);
  assert.equal(receivedConfig.logs, undefined);
});

test("si falla la segunda escritura restaura planificación y metas anteriores", async () => {
  const service = serviceFor({ stored: favorite({ physicalMeals: [{ id: "cena", nombre: "Cena", tipoComida: "cena", items: [{ nombreSnapshot: "Arroz" }], totals: { kcal: 2625 } }] }) });
  const writes = [];
  service.tracking.getByUserDate = async () => ({ dayPlanOverride: { favoriteName: "Anterior" } });
  service.tracking.setDayPlanOverride = async (payload) => { writes.push(payload.dayPlanOverride); return {}; };
  service.foodLogDays.getDayByUserDate = async () => ({ mealsConfig: [{ mealId: "old" }] });
  let calls = 0;
  service.foodLogs.updateMealsConfig = async () => {
    calls += 1;
    if (calls === 1) throw new Error("write failed");
    return {};
  };
  await assert.rejects(service.apply({ id: "client-favorites" }, "66d000000000000000000001", { date: "2026-10-15" }));
  assert.equal(writes.length, 2);
  assert.equal(writes[1].favoriteName, "Anterior");
  assert.equal(calls, 2);
});
