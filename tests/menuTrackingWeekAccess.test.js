import assert from "node:assert/strict";
import test from "node:test";

import { requireTrackingHistoryRange } from "../servicio/accessGates.js";
import ServicioUsuarios from "../servicio/usuarios.js";

const CLIENT_ID = "507f1f77bcf86cd799439011";
const COACH_ID = "507f1f77bcf86cd799439012";
const SUNDAY_NIGHT_IN_ARGENTINA = "2026-08-03T01:30:00.000Z";
const CURRENT_WEEK_START = "2026-07-27";

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

test("D/E: Coach Pro respeta una fecha historica permitida y rechaza la que excede el limite", () => {
  const user = coachClient();
  const now = new Date(SUNDAY_NIGHT_IN_ARGENTINA);

  assert.doesNotThrow(() => requireTrackingHistoryRange(user, { date: "2026-07-27", now }));
  assert.throws(
    () => requireTrackingHistoryRange(user, { date: "2026-07-26", now }),
    (error) => error.code === "PLAN_CAPABILITY_REQUIRED" && error.resource === "trackingHistoryDays"
  );
});

test("F: Pro sin coach conserva historial completo", () => {
  const user = selfManagedClient("pro");
  assert.doesNotThrow(() => requireTrackingHistoryRange(user, {
    start: "2025-01-06",
    end: "2025-01-12",
    now: new Date(SUNDAY_NIGHT_IN_ARGENTINA),
  }));
});

test("G: Free sin coach conserva exactamente siete dias de historial", () => {
  const user = selfManagedClient("free");
  const now = new Date(SUNDAY_NIGHT_IN_ARGENTINA);

  assert.doesNotThrow(() => requireTrackingHistoryRange(user, { date: "2026-07-27", now }));
  assert.throws(
    () => requireTrackingHistoryRange(user, { date: "2026-07-26", now }),
    (error) => error.code === "PLAN_CAPABILITY_REQUIRED" && error.limit === 7
  );
});
