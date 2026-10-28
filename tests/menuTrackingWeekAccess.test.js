import assert from "node:assert/strict";
import test from "node:test";

import { requireTrackingHistoryRange } from "../servicio/accessGates.js";
import ServicioUsuarios, { normalizeWeeklyMenuSnapshot } from "../servicio/usuarios.js";

const CLIENT_ID = "507f1f77bcf86cd799439011";
const COACH_ID = "507f1f77bcf86cd799439012";
const SUNDAY_NIGHT_IN_ARGENTINA = "2026-08-03T01:30:00.000Z";
const CURRENT_WEEK_START = "2026-07-27";

test("el snapshot semanal conserva el origen de una composición automática", () => {
  const snapshot = normalizeWeeklyMenuSnapshot({
    id: "auto-menu-1",
    name: "Menú automático",
    source: "autonomous",
    meals: [{
      id: "breakfast-1",
      name: "Desayuno",
      type: "desayuno",
      target: { kcal: 630, proteina: 42, carbs: 83, grasas: 14 },
      targetOrigin: "auto",
      compositionOrigin: "auto",
      generationSource: "meal_generation_balanced_v1",
      plannerSlotIndex: 0,
      items: [{ nombre: "Avena", cantidad: 60, kcal: 220 }],
    }],
  });

  assert.equal(snapshot.source, "autonomous");
  assert.equal(snapshot.meals[0].compositionOrigin, "auto");
  assert.equal(snapshot.meals[0].generationSource, "meal_generation_balanced_v1");
  assert.equal(snapshot.meals[0].plannerSlotIndex, 0);
  assert.deepEqual(snapshot.meals[0].target, {
    kcal: 630,
    proteina: 42,
    carbs: 83,
    grasas: 14,
  });
});

test("un menu automatico diario no se replica al resto de la semana ni a la siguiente", async () => {
  await withFixedNow(SUNDAY_NIGHT_IN_ARGENTINA, async () => {
    const user = selfManagedClient("pro");
    user.menu = { activeSource: "own", activeOwnMenuId: "auto-day", weeklyPlan: { assignedMenusByDay: {} } };
    const repeatedAssignments = Object.fromEntries([
      "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
    ].map((day) => [day, assignedSunday()]));
    const service = serviceFor(user);
    service._resolveClientMenuPlan = async () => ({
      activeSource: "own",
      assignments: repeatedAssignments,
      activeMenu: {
        _id: "auto-day",
        source: "autonomous",
        activationScope: "date",
        activationDate: "2026-08-02",
        fechaInicio: "2026-08-02",
      },
    });

    const currentWeek = await service.getMyMenuTrackingWeek({ id: CLIENT_ID }, { start: "2026-07-27" });
    assert.equal(currentWeek.days.filter((day) => day.assignment.primaryMenu).length, 1);
    assert.equal(currentWeek.days[6].date, "2026-08-02");
    assert.ok(currentWeek.days[6].assignment.primaryMenu);

    const nextWeek = await service.getMyMenuTrackingWeek({ id: CLIENT_ID }, { start: "2026-08-03" });
    assert.equal(nextWeek.days.filter((day) => day.assignment.primaryMenu).length, 0);
  });
});

function assignedSunday({ alternatives = [] } = {}) {
  return {
    primaryMenu: {
      menuId: "coach-menu-1",
      source: "base",
      menuSnapshot: {
        id: "coach-menu-1",
        name: "Menu del coach",
        totals: { kcal: 2411, proteina: 160, carbs: 300, grasas: 63 },
        meals: [
          { id: "meal-1", name: "Almuerzo", totals: { kcal: 620, proteina: 48, carbs: 70, grasas: 16 } },
        ],
      },
    },
    alternatives,
  };
}

function coachClient({ assignments = {}, personalPlan = "free" } = {}) {
  return {
    _id: CLIENT_ID,
    id: CLIENT_ID,
    role: "cliente",
    personalPlan,
    plan: personalPlan,
    coach: { entrenadorId: COACH_ID, servicePackage: "service_pro" },
    coachAccess: {
      status: "active",
      active: true,
      coachId: COACH_ID,
      servicePackage: "service_pro",
      serviceScopes: ["nutrition", "training"],
    },
    clientPermissions: {
      menu: { canViewMenu: true },
      tracking: {
        canTrackFoods: true,
        canUseMenuAlternatives: true,
        canCreateEquivalentMeals: true,
      },
    },
    menu: {
      activeSource: Object.keys(assignments).length ? "coach" : "none",
      weeklyPlan: { assignedMenusByDay: assignments },
    },
    metasActuales: { kcal: 2411, macros: { p: 160, c: 300, g: 63 } },
  };
}

function selfManagedClient(personalPlan = "free") {
  return {
    _id: CLIENT_ID,
    id: CLIENT_ID,
    role: "cliente",
    personalPlan,
    plan: personalPlan,
    coach: { entrenadorId: null },
    coachAccess: { status: "inactive", active: false },
    menu: { activeSource: "none", weeklyPlan: { assignedMenusByDay: {} } },
    metasActuales: { kcal: 2000, macros: { p: 130, c: 240, g: 58 } },
  };
}

function serviceFor(user, assignments = {}) {
  const service = new ServicioUsuarios();
  service.getById = async () => user;
  service.menuTrackingModel = { listByUserDateRange: async () => [] };
  service.foodLogsModel = { listLogsByUserDateRange: async () => [] };
  service._resolveClientMenuPlan = async () => ({
    activeSource: Object.keys(assignments).length ? "coach" : "none",
    assignments,
    activeMenu: null,
  });
  return service;
}

async function withFixedNow(iso, callback) {
  const RealDate = globalThis.Date;
  const fixed = new RealDate(iso);
  globalThis.Date = class extends RealDate {
    constructor(...args) {
      super(...(args.length ? args : [fixed.getTime()]));
    }

    static now() {
      return fixed.getTime();
    }
  };

  try {
    return await callback();
  } finally {
    globalThis.Date = RealDate;
  }
}

test("A: Coach Pro sin menu carga el dia actual aun cuando UTC ya cambio de dia", async () => {
  await withFixedNow(SUNDAY_NIGHT_IN_ARGENTINA, async () => {
    const user = coachClient();
    const result = await serviceFor(user).getMyMenuTrackingWeek({ id: CLIENT_ID }, { start: CURRENT_WEEK_START });

    assert.equal(result.start, "2026-07-27");
    assert.equal(result.end, "2026-08-02");
    assert.equal(result.activePlan.source, "none");
    assert.equal(result.days[6].date, "2026-08-02");
    assert.equal(result.days[6].assignment.primaryMenu, null);
  });
});

test("B: Coach Pro con menu devuelve la fuente coach para el dia actual", async () => {
  await withFixedNow(SUNDAY_NIGHT_IN_ARGENTINA, async () => {
    const assignments = { sunday: assignedSunday() };
    const user = coachClient({ assignments });
    const result = await serviceFor(user, assignments).getMyMenuTrackingWeek({ id: CLIENT_ID }, { start: CURRENT_WEEK_START });

    assert.equal(result.activePlan.source, "coach");
    assert.equal(result.days[6].assignment.primaryMenu.menuSnapshot.name, "Menu del coach");
  });
});

test("C: Coach Pro conserva las alternativas del menu asignado", async () => {
  await withFixedNow(SUNDAY_NIGHT_IN_ARGENTINA, async () => {
    const alternative = {
      menuId: "coach-menu-alt-1",
      source: "alternative",
      menuSnapshot: {
        id: "coach-menu-alt-1",
        name: "Alternativa del coach",
        totals: { kcal: 2390, proteina: 158, carbs: 298, grasas: 62 },
        meals: [],
      },
    };
    const assignments = { sunday: assignedSunday({ alternatives: [alternative] }) };
    const user = coachClient({ assignments });
    const result = await serviceFor(user, assignments).getMyMenuTrackingWeek({ id: CLIENT_ID }, { start: CURRENT_WEEK_START });

    assert.equal(result.days[6].assignment.alternatives.length, 1);
    assert.equal(result.days[6].assignment.alternatives[0].menuSnapshot.name, "Alternativa del coach");
  });
});

test("un día guardado prevalece sólo en su fecha y no mezcla alternativas del menú global", async () => {
  await withFixedNow(SUNDAY_NIGHT_IN_ARGENTINA, async () => {
    const assignments = { sunday: assignedSunday({ alternatives: [{ menuId: "alt", menuSnapshot: { id: "alt", name: "Alternativa" } }] }) };
    const service = serviceFor(coachClient({ assignments }), assignments);
    service.menuTrackingModel.listByUserDateRange = async () => [{
      date: "2026-08-02",
      dayPlanOverride: {
        source: "day_favorite",
        favoriteId: "favorite-1",
        favoriteName: "Mi domingo",
        menuSnapshot: {
          id: "favorite-sunday",
          name: "Mi domingo",
          totals: { kcal: 2200, proteina: 150, carbs: 260, grasas: 62 },
          meals: [{ id: "fav-lunch", name: "Almuerzo favorito", totals: { kcal: 700 } }],
        },
      },
    }];
    const result = await service.getMyMenuTrackingWeek({ id: CLIENT_ID }, { start: CURRENT_WEEK_START });
    assert.equal(result.days[6].assignment.primaryMenu.source, "day_favorite");
    assert.equal(result.days[6].assignment.primaryMenu.menuSnapshot.name, "Mi domingo");
    assert.equal(result.days[6].assignment.alternatives.length, 0);
    assert.equal(result.days[5].assignment.primaryMenu, null);
  });
});

test("ignora consumos residuales de una planificacion que ya fue eliminada", async () => {
  await withFixedNow(SUNDAY_NIGHT_IN_ARGENTINA, async () => {
    const service = serviceFor(selfManagedClient("pro"));
    service.menuTrackingModel.listByUserDateRange = async () => [{
      date: "2026-08-02",
      dayKey: "sunday",
      dayPlanOverride: null,
      target: { kcal: 2000, proteina: 130, carbs: 240, grasas: 58 },
      completedMenuMeals: [
        { mealId: "breakfast", name: "Desayuno", totals: { kcal: 800, proteina: 40 } },
        { mealId: "dinner", name: "Cena", totals: { kcal: 700, proteina: 35 } },
      ],
      generatedRemainingMeals: [{ id: "generated", totals: { kcal: 400, proteina: 20 } }],
      consumedTotals: { kcal: 1900, proteina: 95, carbs: 220, grasas: 50 },
      remainingTotals: { kcal: 100, proteina: 35, carbs: 20, grasas: 8 },
      nutrition: { status: "partial", completedMealsCount: 2, totalMealsCount: 3 },
    }];

    const result = await service.getMyMenuTrackingWeek(
      { id: CLIENT_ID },
      { start: CURRENT_WEEK_START }
    );
    const sunday = result.days[6];

    assert.equal(sunday.assignment.primaryMenu, null);
    assert.deepEqual(sunday.tracking.completedMenuMeals, []);
    assert.deepEqual(sunday.tracking.generatedRemainingMeals, []);
    assert.equal(sunday.tracking.consumedTotals.kcal, 0);
    assert.equal(sunday.tracking.totalConsumedTotals.kcal, 0);
    assert.equal(sunday.tracking.status, "pending");
  });
});

test("D/E: Coach Pro respeta los 14 dias y rechaza una fecha anterior", () => {
  const user = coachClient();
  const now = new Date(SUNDAY_NIGHT_IN_ARGENTINA);

  assert.doesNotThrow(() => requireTrackingHistoryRange(user, { date: "2026-07-20", now }));
  assert.throws(
    () => requireTrackingHistoryRange(user, { date: "2026-07-19", now }),
    (error) => error.code === "TRACKING_HISTORY_EXPIRED" && error.resource === "trackingHistoryDays"
  );
});

test("F: Pro sin coach tambien conserva solo 14 dias de detalle", () => {
  const user = selfManagedClient("pro");
  const now = new Date(SUNDAY_NIGHT_IN_ARGENTINA);
  assert.doesNotThrow(() => requireTrackingHistoryRange(user, { date: "2026-07-20", now }));
  assert.throws(
    () => requireTrackingHistoryRange(user, { date: "2026-07-19", now }),
    (error) => error.code === "TRACKING_HISTORY_EXPIRED" && error.limit === 14
  );
});

test("G: Free sin coach conserva exactamente catorce dias de historial", () => {
  const user = selfManagedClient("free");
  const now = new Date(SUNDAY_NIGHT_IN_ARGENTINA);

  assert.doesNotThrow(() => requireTrackingHistoryRange(user, { date: "2026-07-20", now }));
  assert.throws(
    () => requireTrackingHistoryRange(user, { date: "2026-07-19", now }),
    (error) => error.code === "TRACKING_HISTORY_EXPIRED" && error.limit === 14
  );
});

test("un día planificado por comida llega al cliente aunque no tenga menú asignado", async () => {
  await withFixedNow(SUNDAY_NIGHT_IN_ARGENTINA, async () => {
    const user = coachClient();
    user.menu.weeklyPlan.mealTargetsByDay = {
      sunday: {
        mode: "per_meal",
        meals: [
          { id: "breakfast", label: "Desayuno", type: "breakfast", target: { kcal: 600, p: 40, c: 70, g: 18 } },
          { id: "lunch", label: "Almuerzo", type: "lunch", target: { kcal: 900, p: 60, c: 110, g: 25 } },
          { id: "dinner", label: "Cena", type: "dinner", target: { kcal: 911, p: 60, c: 120, g: 20 } },
        ],
      },
    };
    const result = await serviceFor(user).getMyMenuTrackingWeek({ id: CLIENT_ID }, { start: CURRENT_WEEK_START });
    assert.equal(result.days[6].assignment.primaryMenu, null);
    assert.equal(result.days[6].mealTargetPlan.mode, "per_meal");
    assert.equal(result.days[6].mealTargetPlan.meals.length, 3);
  });
});
