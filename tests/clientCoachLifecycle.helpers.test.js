import assert from "node:assert/strict";
import test from "node:test";

import { canUseAssignedMenuForActor } from "../servicio/foodLogs.js";
import {
  buildAssignedQuery,
  canViewNutritionItem,
} from "../servicio/nutritionLibraryPermissions.js";
import ServicioUsuarios, {
  buildNutritionAssignmentImpact,
  buildSelfGoalsBackup,
  moveInvalidatedAssignments,
  resolveClientNutritionWeek,
  resetCoachDerivedClientPermissions,
  restoreMetasAfterCoachDisconnect,
  shouldUseWeeklyNutritionPlan,
} from "../servicio/usuarios.js";

function assignedMenu(name) {
  return {
    menuId: `menu-${name}`,
    menuSnapshot: {
      id: `menu-${name}`,
      name,
      kcal: 1940,
      protein: 150,
      carbs: 200,
      fat: 60,
      meals: [],
    },
    source: "coach_owned",
  };
}

function clientWithAssignedMenus() {
  return {
    coach: { entrenadorId: "coach-1" },
    metasActuales: {
      kcal: 1940,
      macros: { p: 150, c: 200, g: 60 },
      source: "coach",
      sourceCoachId: "coach-1",
    },
    menu: {
      activeSource: "coach",
      mode: { source: "coach", updatedByCoachId: "coach-1" },
      weeklyPlan: {
        generatedBy: "coach",
        sourceCoachId: "coach-1",
        caloriesByDay: {},
        macrosByDay: {},
        assignedMenusByDay: {
          monday: {
            ...assignedMenu("Lunes"),
            alternatives: [assignedMenu("Alternativa lunes")],
          },
          tuesday: assignedMenu("Martes"),
        },
      },
    },
  };
}

test("impacto nutricional incluye solo días asignados cuya meta efectiva cambió", () => {
  const current = clientWithAssignedMenus();
  const next = {
    ...current,
    metasActuales: {
      ...current.metasActuales,
      macros: { p: 160, c: 200, g: 60 },
    },
  };

  const impact = buildNutritionAssignmentImpact(current, next);

  assert.deepEqual(impact.affectedDayKeys, ["monday", "tuesday"]);
  assert.equal(impact.assignedMenus, 3);
  assert.equal(impact.affectedDays[0].previousTarget.p, 150);
  assert.equal(impact.affectedDays[0].nextTarget.p, 160);
});

test("cambio diario selectivo no desasigna días cuya meta efectiva sigue igual", () => {
  const current = clientWithAssignedMenus();
  const next = {
    ...current,
    menu: {
      ...current.menu,
      weeklyPlan: {
        ...current.menu.weeklyPlan,
        caloriesByDay: { Lunes: 1940 },
        macrosByDay: { Lunes: { p: 170, c: 180, g: 60, kcal: 1940 } },
      },
    },
  };

  const impact = buildNutritionAssignmentImpact(current, next);

  assert.deepEqual(impact.affectedDayKeys, ["monday"]);
  assert.equal(impact.assignedMenus, 2);
});

test("desasignación mueve snapshots afectados y conserva intactos los demás días", () => {
  const assignments = clientWithAssignedMenus().menu.weeklyPlan.assignedMenusByDay;
  const moved = moveInvalidatedAssignments(assignments, ["monday"]);

  assert.equal(moved.remaining.tuesday.menuSnapshot.name, "Martes");
  assert.equal(moved.remaining.monday, undefined);
  assert.equal(moved.invalidated.monday.menuSnapshot.name, "Lunes");
  assert.equal(moved.invalidated.monday.alternatives[0].menuSnapshot.name, "Alternativa lunes");
});

test("backend exige confirmación explícita antes de cambiar metas con menús afectados", async () => {
  const service = new ServicioUsuarios();
  const client = clientWithAssignedMenus();
  const coach = {
    _id: "coach-1",
    role: "coach",
    professionalProfile: { specialties: { nutrition: true } },
  };
  service._getCoachClientPair = async () => ({ coach, client });
  service._assertNutritionEditAllowed = () => {};

  await assert.rejects(
    () => service.coachUpdateClientNutrition({
      coachId: "coach-1",
      clientId: "client-1",
      payload: {
        kcal: 1980,
        macros: { p: 160, c: 200, g: 60 },
        weeklyPlan: { caloriesByDay: {}, macrosByDay: {} },
      },
    }),
    (error) => {
      assert.equal(error.message, "NUTRITION_ASSIGNMENTS_CONFIRMATION_REQUIRED");
      assert.deepEqual(error.impact.affectedDayKeys, ["monday", "tuesday"]);
      return true;
    }
  );
});

test("backend reconcilia asignaciones legacy si la meta cambió antes de desplegar la protección", () => {
  const current = clientWithAssignedMenus();
  current.metasActuales.updatedAt = new Date("2026-07-23T20:59:46.389Z");
  Object.values(current.menu.weeklyPlan.assignedMenusByDay).forEach((entry) => {
    entry.assignedAt = new Date("2026-07-09T04:19:25.571Z");
  });

  const impact = buildNutritionAssignmentImpact(current, current);

  assert.deepEqual(impact.affectedDayKeys, ["monday", "tuesday"]);
  assert.equal(impact.changedDays, 0);
  assert.equal(impact.staleDays, 2);
});

test("metadata completa de asignación evita falsos obsoletos tras editar una nota", () => {
  const current = clientWithAssignedMenus();
  current.metasActuales.updatedAt = new Date("2026-07-23T20:59:46.389Z");
  Object.values(current.menu.weeklyPlan.assignedMenusByDay).forEach((entry) => {
    entry.assignedAt = new Date("2026-07-09T04:19:25.571Z");
    entry.targetCalories = 1940;
    entry.targetMacros = { p: 150, c: 200, g: 60 };
  });

  const impact = buildNutritionAssignmentImpact(current, current);

  assert.deepEqual(impact.affectedDayKeys, []);
});

test("backup de metas solo se crea para metas propias o de sistema", () => {
  const self = buildSelfGoalsBackup({
    kcal: 1800,
    macros: { p: 120, c: 180, g: 50 },
    source: "self",
  });

  assert.equal(self.kcal, 1800);
  assert.equal(self.source, "self");
  assert.equal(self.macros.p, 120);

  const coach = buildSelfGoalsBackup({
    kcal: 2100,
    macros: { p: 150, c: 240, g: 60 },
    source: "coach",
  });

  assert.equal(coach, null);
});

test("al desvincular se restauran metas propias desde backup y quedan para revision", () => {
  const restored = restoreMetasAfterCoachDisconnect(
    {
      metasActuales: {
        kcal: 2200,
        macros: { p: 160, c: 260, g: 70 },
        source: "coach",
        sourceCoachId: "coach-1",
      },
      nutrition: {
        selfGoalsBackup: {
          kcal: 1900,
          macros: { p: 125, c: 210, g: 45 },
          source: "self",
        },
      },
    },
    "coach-1"
  );

  assert.equal(restored.kcal, 1900);
  assert.equal(restored.source, "self");
  assert.equal(restored.sourceCoachId, null);
  assert.equal(restored.needsReview, true);
});

test("al desvincular sin backup no queda meta de coach silenciosa", () => {
  const restored = restoreMetasAfterCoachDisconnect(
    {
      metasActuales: {
        kcal: 2200,
        macros: { p: 160, c: 260, g: 70 },
        source: "coach",
        sourceCoachId: "coach-1",
      },
    },
    "coach-1"
  );

  assert.equal(restored.kcal, 2200);
  assert.equal(restored.source, "system");
  assert.equal(restored.sourceCoachId, null);
  assert.equal(restored.needsReview, true);
});

test("permisos heredados del coach no pueden seguir bloqueando tracking", () => {
  const next = resetCoachDerivedClientPermissions({
    menu: { canViewMenu: false },
    tracking: { canTrackFood: false, canEditPastDays: false },
    foodTracking: { canTrackFood: false },
    customPreference: { keep: true },
  });

  assert.equal(next.menu, undefined);
  assert.deepEqual(next.customPreference, { keep: true });
  assert.equal(next.tracking.canTrackFood, true);
  assert.equal(next.tracking.canEditPastDays, true);
  assert.equal(next.tracking.canAutoCompleteRemainingMeals, false);
  assert.equal(next.tracking.canUseFlexibleMarginRecommendations, false);
  assert.equal(next.foodTracking.canTrackFood, true);
});

test("patch de desvinculacion cierra coachAccess y restaura acceso personal", () => {
  const servicio = new ServicioUsuarios();
  const now = new Date("2026-06-30T12:00:00.000Z");
  const patch = servicio._disconnectClientPatch(
    {
      _id: "client-1",
      role: "cliente",
      plan: "premium",
      personalPlan: "pro",
      coachId: "coach-1",
      entrenadorId: "coach-1",
      profesionalId: "coach-1",
      coach: {
        entrenadorId: "coach-1",
        assignedAt: "2026-06-20T00:00:00.000Z",
        servicePackage: "service_pro",
      },
      coachAccess: {
        status: "active",
        active: true,
        coachId: "coach-1",
        servicePackage: "service_pro",
        serviceScopes: ["nutrition", "training"],
        billingOwner: "coach",
        startedAt: "2026-06-20T00:00:00.000Z",
      },
      personalSubscription: {
        plan: "pro",
        status: "suppressed_by_coach",
        billingOwner: "coach",
        suppressedByCoach: true,
        suppressedReason: "coach_access",
        autoRenew: false,
      },
      clientPermissions: {
        tracking: { canTrackFood: false },
      },
    },
    {
      coachId: "coach-1",
      reason: "coach_service_ended",
      actor: "coach-1",
      now,
    }
  );

  assert.equal(patch.coachId, null);
  assert.equal(patch.entrenadorId, null);
  assert.equal(patch.profesionalId, null);
  assert.equal(patch.coach.entrenadorId, null);
  assert.equal(patch.coachAccess.status, "ended");
  assert.equal(patch.coachAccess.active, false);
  assert.equal(patch.coachAccess.coachId, "coach-1");
  assert.equal(patch.coachAccess.billingOwner, "client");
  assert.equal(patch.coachAccess.endedReason, "coach_service_ended");
  assert.equal(patch.personalSubscription.plan, "pro");
  assert.equal(patch.personalSubscription.status, "active");
  assert.equal(patch.personalSubscription.billingOwner, "client");
  assert.equal(patch.personalSubscription.suppressedByCoach, false);
  assert.equal(patch.clientPermissions.tracking.canTrackFood, true);
});

test("tracking solo usa menu asignado si coincide con el coach actual", () => {
  const actor = { coach: { entrenadorId: "coach-1" } };

  assert.equal(
    canUseAssignedMenuForActor(actor, { coachId: "coach-1", estado: "activo" }),
    true
  );
  assert.equal(
    canUseAssignedMenuForActor(actor, { coachId: "coach-2", estado: "activo" }),
    false
  );
  assert.equal(
    canUseAssignedMenuForActor({ coach: { entrenadorId: null } }, { coachId: "coach-1", estado: "activo" }),
    false
  );
  assert.equal(
    canUseAssignedMenuForActor(actor, { coachId: "coach-1", estado: "revocado" }),
    false
  );
});

test("semana no usa objetivos diarios del coach anterior si el cliente ya no tiene coach", () => {
  const user = {
    metasActuales: {
      kcal: 1360,
      macros: { p: 100, c: 150, g: 40 },
    },
    coach: { entrenadorId: null },
    menu: {
      activeSource: "none",
      weeklyPlan: {
        generatedBy: "coach",
        sourceCoachId: "coach-1",
        caloriesByDay: { thursday: 1400 },
        macrosByDay: { thursday: { p: 100, c: 160, g: 40 } },
      },
    },
  };

  assert.equal(shouldUseWeeklyNutritionPlan(user), false);
  const week = resolveClientNutritionWeek(user);

  assert.equal(week.targets.thursday.kcal, 1360);
  assert.equal(week.targets.thursday.customized, false);
  assert.equal(week.summary.customizedDays, 0);
});

test("semana no usa weeklyPlan legacy sin trazabilidad si el cliente no tiene coach", () => {
  const user = {
    metasActuales: {
      kcal: 1360,
      macros: { p: 100, c: 150, g: 40 },
    },
    coach: { entrenadorId: null },
    menu: {
      activeSource: "none",
      activeOwnMenuId: null,
      weeklyPlan: {
        caloriesByDay: { thursday: 1400, friday: 1400 },
        macrosByDay: {
          thursday: { p: 100, c: 160, g: 40 },
          friday: { p: 100, c: 160, g: 40 },
        },
        assignedMenusByDay: {
          thursday: {
            primaryMenu: {
              menuSnapshot: {
                name: "1300-1400 kcal / 100 g proteina",
                totals: { kcal: 1360, proteina: 100, carbs: 148, grasas: 41 },
              },
            },
          },
        },
      },
    },
  };

  assert.equal(shouldUseWeeklyNutritionPlan(user), false);
  const week = resolveClientNutritionWeek(user);

  assert.equal(week.targets.thursday.kcal, 1360);
  assert.equal(week.targets.thursday.customized, false);
  assert.equal(week.targets.friday.kcal, 1360);
  assert.equal(week.summary.customizedDays, 0);
});

test("cliente sin coach con menu propio activo no mezcla weeklyPlan legacy del coach", async () => {
  const servicio = new ServicioUsuarios();
  servicio.menusModel = {
    getBaseById: async () => ({
      _id: "own-menu-1",
      ownerType: "cliente",
      ownerId: "client-1",
      nombre: "Mi menu propio",
      estado: "activo",
      macrosTotales: { kcal: 1800, proteina: 120, carbs: 190, grasas: 55 },
      comidas: [],
    }),
  };

  const activePlan = await servicio._resolveClientMenuPlan({
    _id: "client-1",
    role: "cliente",
    coach: { entrenadorId: null },
    menu: {
      activeSource: "own",
      activeOwnMenuId: "own-menu-1",
      weeklyPlan: {
        assignedMenusByDay: {
          thursday: {
            primaryMenu: {
              menuSnapshot: { name: "Menu viejo del coach", totals: { kcal: 1360, proteina: 100 } },
            },
          },
        },
      },
    },
  });

  assert.equal(activePlan.activeSource, "own");
  assert.equal(activePlan.activeMenu.nombre, "Mi menu propio");
  assert.notEqual(activePlan.assignments.thursday?.primaryMenu?.menuSnapshot?.name, "Menu viejo del coach");
});

test("semana usa objetivos del coach solo si coincide con el coach actual", () => {
  const user = {
    metasActuales: {
      kcal: 1360,
      macros: { p: 100, c: 150, g: 40 },
    },
    coach: { entrenadorId: "coach-1" },
    menu: {
      activeSource: "coach",
      updatedByCoachId: "coach-1",
      weeklyPlan: {
        generatedBy: "coach",
        sourceCoachId: "coach-1",
        caloriesByDay: { friday: 1400 },
        macrosByDay: { friday: { p: 100, c: 160, g: 40 } },
      },
    },
  };

  assert.equal(shouldUseWeeklyNutritionPlan(user), true);
  const week = resolveClientNutritionWeek(user);

  assert.equal(week.targets.friday.kcal, 1400);
  assert.equal(week.targets.friday.customized, true);
  assert.equal(week.summary.customizedDays, 1);
});

test("biblioteca assigned no muestra asignaciones si el cliente ya no tiene coach actual", () => {
  const clientWithoutCoach = {
    _id: "client-1",
    role: "cliente",
    coach: { entrenadorId: null },
  };
  const assignedMeal = {
    activo: true,
    asignadaA: [{ clienteId: "client-1", coachId: "coach-1" }],
  };

  assert.deepEqual(buildAssignedQuery(clientWithoutCoach, "asignadaA"), { _id: null });
  assert.equal(canViewNutritionItem(clientWithoutCoach, assignedMeal), false);

  const clientWithCoach = {
    _id: "client-1",
    role: "cliente",
    coach: { entrenadorId: "coach-1" },
  };
  assert.equal(canViewNutritionItem(clientWithCoach, assignedMeal), true);
});
