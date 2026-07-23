import assert from "node:assert/strict";
import test from "node:test";

import ServicioMenus from "../servicio/menus.js";
import ServicioComidas from "../servicio/comidas.js";
import ServicioComidasGuardadas from "../servicio/comidasGuardadas.js";

const actor = {
  _id: "64b000000000000000000081",
  role: "coach",
};

function effective({ menus = 0, meals = 0, menuLimit = 10, mealLimit = 30 } = {}) {
  return {
    planCode: "trial_pro",
    limits: { maxActiveClients: 3, maxCoachOwnedMenus: menuLimit, maxCoachOwnedMeals: mealLimit },
    usage: { currentActiveClients: 0, currentCoachOwnedMenus: menus, currentCoachOwnedMeals: meals },
    sources: { maxClients: "plan", maxCoachOwnedMenus: "plan", maxCoachOwnedMeals: "plan" },
    features: { menus: { canCreateCoachMenus: true, canCreateCoachMeals: true, duplicatePlans: true } },
  };
}

test("crear menu propio se bloquea en 10/10 con payload estable", async () => {
  const service = new ServicioMenus();
  const capabilities = effective({ menus: 10 });
  let created = false;
  service._actor = async () => actor;
  service._assertNutritionAccess = async () => ({ effectiveCapabilities: capabilities });
  service.menusModel.countOwnedByCoach = async () => 10;
  service.menusModel.createBase = async () => {
    created = true;
    return {};
  };

  await assert.rejects(
    service.createMenu(actor, { nombre: "No debe crearse" }),
    (error) => {
      assert.equal(error.code, "COACH_MENU_LIMIT_EXCEEDED");
      assert.equal(error.current, 10);
      assert.equal(error.limit, 10);
      assert.equal(error.overrideApplied, false);
      return true;
    }
  );
  assert.equal(created, false);
});

test("crear comida propia se bloquea en 30/30", async () => {
  const service = new ServicioComidas();
  const capabilities = effective({ meals: 30 });
  let created = false;
  service._actor = async () => actor;
  service._assertNutritionAccess = async () => ({ effectiveCapabilities: capabilities });
  service.model.countOwnedByCoach = async () => 29;
  service.comidasGuardadasModel.countOwnedByCoach = async () => 1;
  service.model.crearComida = async () => {
    created = true;
    return {};
  };

  await assert.rejects(
    service.crearComida(actor, { nombre: "No debe crearse", items: [{ nombre: "A", cantidad: 1 }] }),
    (error) => error.code === "COACH_MEAL_LIMIT_EXCEEDED" && error.current === 30 && error.limit === 30
  );
  assert.equal(created, false);
});

test("crear o duplicar una comida guardada usa el total combinado del coach", async () => {
  const service = new ServicioComidasGuardadas();
  service._actor = async () => ({
    ...actor,
    plan: "trial_pro",
    coachProfile: { specialties: { nutrition: true } },
  });
  service.model.countOwnedByCoach = async () => 20;
  service.coachComidasModel.countOwnedByCoach = async () => 10;
  service.coachPlanModel.getByCode = async () => ({
    code: "trial_pro",
    name: "Inicial",
    maxClients: 3,
    maxCoachOwnedMenus: 10,
    maxCoachOwnedMeals: 30,
    features: { clients: {}, routines: {}, menus: {}, metrics: {}, exports: {} },
  });

  await assert.rejects(
    service.create(actor, { nombre: "No debe crearse", items: [{ nombre: "A", cantidad: 1, kcal: 1 }] }),
    (error) => error.code === "COACH_MEAL_LIMIT_EXCEEDED" && error.current === 30 && error.limit === 30
  );
});

test("el endpoint legacy no permite a Coach Inicial copiar una comida global", async () => {
  const service = new ServicioComidasGuardadas();
  service._actor = async () => ({
    ...actor,
    plan: "trial_pro",
    coachProfile: { specialties: { nutrition: true } },
  });
  service.model.getById = async () => ({
    _id: "64b000000000000000000099",
    ownerType: "admin",
    ownerRole: "admin",
    sourceType: "admin_global",
    visibilidad: "global",
    activo: true,
    nombre: "Plantilla global",
    items: [{ nombre: "A", cantidad: 1, kcal: 1 }],
  });
  service._effectiveCoachCapabilities = async () => effective();

  await assert.rejects(
    service.duplicate(actor, "64b000000000000000000099"),
    (error) => error.message === "FORBIDDEN"
  );
});
