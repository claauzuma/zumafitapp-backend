import assert from "node:assert/strict";
import test from "node:test";

import { canUseAssignedMenuForActor } from "../servicio/foodLogs.js";
import {
  buildAssignedQuery,
  canViewNutritionItem,
} from "../servicio/nutritionLibraryPermissions.js";
import ServicioUsuarios, {
  buildSelfGoalsBackup,
  resolveClientNutritionWeek,
  resetCoachDerivedClientPermissions,
  restoreMetasAfterCoachDisconnect,
  shouldUseWeeklyNutritionPlan,
} from "../servicio/usuarios.js";

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
  assert.equal(next.foodTracking.canTrackFood, true);
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
