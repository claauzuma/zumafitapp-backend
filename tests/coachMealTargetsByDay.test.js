import assert from "node:assert/strict";
import test from "node:test";

import ServicioUsuarios, {
  normalizeWeeklyMealTargetsByDay,
} from "../servicio/usuarios.js";

const target = { kcal: 1906, p: 166, c: 162, g: 66 };
const meals = [
  { id: "breakfast", label: "Desayuno", type: "breakfast", target: { kcal: 419, p: 36.5, c: 35.6, g: 14.5 } },
  { id: "lunch", label: "Almuerzo", type: "lunch", target: { kcal: 629, p: 54.8, c: 53.5, g: 21.8 } },
  { id: "snack", label: "Merienda", type: "snack", target: { kcal: 286, p: 24.9, c: 24.3, g: 9.9 } },
  { id: "dinner", label: "Cena", type: "dinner", target: { kcal: 572, p: 49.8, c: 48.6, g: 19.8 } },
];
const nutritionWeek = { targets: { tuesday: target } };

test("server-side acepta 3 a 6 metas por comida sólo cuando cierran el objetivo diario", () => {
  const normalized = normalizeWeeklyMealTargetsByDay({ tuesday: { mode: "per_meal", meals } }, nutritionWeek);
  assert.equal(normalized.tuesday.mode, "per_meal");
  assert.equal(normalized.tuesday.meals.length, 4);
  assert.throws(
    () => normalizeWeeklyMealTargetsByDay({ tuesday: { mode: "per_meal", meals: meals.map((meal, index) => index ? meal : { ...meal, target: { ...meal.target, kcal: 500 } }) } }, nutritionWeek),
    /MEAL_TARGET_TOTALS_MISMATCH/
  );
});

test("el coach persiste metas por comida y puede retirar el menú sólo del día elegido", async () => {
  const service = new ServicioUsuarios();
  const client = {
    _id: "client-1",
    role: "cliente",
    metasActuales: { kcal: 1906, macros: { p: 166, c: 162, g: 66 } },
    menu: {
      mode: { type: "manual" },
      weeklyPlan: {
        assignedMenusByDay: { tuesday: { primaryMenu: { menuId: "old-menu" } }, wednesday: { primaryMenu: { menuId: "keep-menu" } } },
      },
    },
  };
  const coach = { _id: "coach-1", role: "coach" };
  let saved = null;
  service._getCoachClientPair = async () => ({ coach, client });
  service._assertCoachFeature = () => {};
  service._validatedCoachAssignedMenusByDay = async (_coach, value) => value;
  service.updateById = async (_id, patch) => {
    saved = patch;
    return { ...client, ...patch };
  };

  await service.coachUpdateClientMenu({
    coachId: coach._id,
    clientId: client._id,
    payload: {
      menu: {
        mode: { type: "manual" },
        weeklyPlan: {
          assignedMenusByDay: { wednesday: client.menu.weeklyPlan.assignedMenusByDay.wednesday },
          mealTargetsByDay: { tuesday: { mode: "per_meal", meals } },
        },
      },
    },
  });

  assert.equal(saved.menu.weeklyPlan.assignedMenusByDay.tuesday, undefined);
  assert.equal(saved.menu.weeklyPlan.assignedMenusByDay.wednesday.primaryMenu.menuId, "keep-menu");
  assert.equal(saved.menu.weeklyPlan.mealTargetsByDay.tuesday.meals.length, 4);
});

test("la planificación guardada sobrevive una lectura nueva del detalle del cliente", async () => {
  const service = new ServicioUsuarios();
  let storedClient = {
    _id: "client-1",
    role: "cliente",
    metasActuales: { kcal: 1906, macros: { p: 166, c: 162, g: 66 } },
    coach: { entrenadorId: "coach-1" },
    menu: { mode: { type: "manual" }, weeklyPlan: {} },
  };
  const coach = { _id: "coach-1", role: "coach" };
  service.getById = async (id) => id === "coach-1" ? coach : storedClient;
  service._assertCoachFeature = () => {};
  service._validatedCoachAssignedMenusByDay = async (_coach, value) => value;
  service.updateById = async (_id, patch) => {
    storedClient = { ...storedClient, ...patch };
    return storedClient;
  };

  await service.coachUpdateClientMenu({
    coachId: coach._id,
    clientId: storedClient._id,
    payload: {
      menu: {
        mode: { type: "manual" },
        weeklyPlan: {
          assignedMenusByDay: {},
          mealTargetsByDay: { tuesday: { mode: "per_meal", meals } },
        },
      },
    },
  });
  const fresh = await service.getMyCoachClientDetail({ coachId: coach._id, clientId: storedClient._id });
  assert.equal(fresh.client.menu.weeklyPlan.mealTargetsByDay.tuesday.mode, "per_meal");
  assert.deepEqual(
    fresh.client.menu.weeklyPlan.mealTargetsByDay.tuesday.meals.map((meal) => meal.label),
    ["Desayuno", "Almuerzo", "Merienda", "Cena"]
  );
});
