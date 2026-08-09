import assert from "node:assert/strict";
import test from "node:test";

import {
  default as ServicioClientOwnMenus,
  hasValidMenuContent,
  nextUniqueName,
  normalizeMealType,
  validateRawMenuPayload,
} from "../servicio/clientOwnMenus.js";

test("genera nombres unicos con sufijo incremental", () => {
  assert.equal(nextUniqueName("Arroz con pollo", []), "Arroz con pollo");
  assert.equal(nextUniqueName("Arroz con pollo", ["Arroz con pollo"]), "Arroz con pollo 1");
  assert.equal(
    nextUniqueName("Arroz con pollo", ["Arroz con pollo", "Arroz con pollo 1"]),
    "Arroz con pollo 2"
  );
  assert.equal(
    nextUniqueName("Desayuno proteico 3", ["Desayuno proteico 3"]),
    "Desayuno proteico 4"
  );
});

test("normaliza tipos de comida aceptados", () => {
  assert.equal(normalizeMealType("  ALMUERZO  "), "almuerzo");
  assert.equal(normalizeMealType("Pre entreno"), "pre_entreno");
  assert.equal(normalizeMealType("Post entreno"), "post_entreno");
  assert.equal(normalizeMealType("Colacion"), "colacion");
  assert.equal(normalizeMealType("Otra"), "otra");
});

test("detecta menu activable con alimentos en comidas o dias", () => {
  assert.equal(hasValidMenuContent({ comidas: [] }), false);
  assert.equal(hasValidMenuContent({ comidas: [{ items: [] }] }), false);
  assert.equal(hasValidMenuContent({ comidas: [{ items: [{ alimentoId: "1" }] }] }), true);
  assert.equal(
    hasValidMenuContent({
      dias: {
        monday: {
          comidas: [{ items: [{ alimentoId: "1" }] }],
        },
      },
    }),
    true
  );
});

test("valida payload crudo antes de normalizar silenciosamente", () => {
  assert.doesNotThrow(() => validateRawMenuPayload({ nombre: "Menu", selectedDays: ["monday", "martes"] }));

  assert.throws(
    () => validateRawMenuPayload({ nombre: "x".repeat(181) }),
    (error) => error.code === "VALIDATION_ERROR" && error.details.some((item) => item.includes("180"))
  );

  assert.throws(
    () => validateRawMenuPayload({ selectedDays: ["noday"] }),
    (error) => error.code === "VALIDATION_ERROR" && error.details.some((item) => item.includes("Dia invalido"))
  );
});

test("menu propio conserva meta opcional y origen Manual/Auto/Sugerido por alimento", () => {
  const servicio = new ServicioClientOwnMenus();
  const normalized = servicio._normalizePayload({
    nombre: "Menu Pro",
    comidas: [{
      id: "meal-1",
      nombre: "Almuerzo",
      tipoComida: "almuerzo",
      target: { kcal: 650, proteina: 45, carbs: 80, grasas: 17 },
      items: [{
        id: "item-1",
        alimentoId: "food-1",
        nombreSnapshot: "Arroz",
        cantidad: 180,
        unidad: "g",
        kcal: 610,
        proteina: 14,
        carbs: 130,
        grasas: 2,
        source: "addedCandidate",
        quantityMode: "suggested",
        suggested: true,
      }],
    }],
  }, { _id: "client-1", role: "cliente" });

  assert.deepEqual(normalized.comidas[0].target, { kcal: 650, proteina: 45, carbs: 80, grasas: 17 });
  assert.equal(normalized.comidas[0].items[0].quantityMode, "suggested");
  assert.equal(normalized.comidas[0].items[0].suggested, true);
});

test("desactiva menu propio activo si excede los dias permitidos por Free", async () => {
  const servicio = new ServicioClientOwnMenus();
  const user = {
    _id: "cliente-1",
    role: "cliente",
    personalPlan: "free",
    menu: {
      activeSource: "own",
      activeOwnMenuId: "menu-1",
    },
  };
  const weeklyMenu = {
    _id: "menu-1",
    ownerType: "cliente",
    ownerId: "cliente-1",
    estado: "activo",
    activa: true,
    activo: true,
    dias: {
      monday: { comidas: [{ items: [{ alimentoId: "a" }] }] },
      tuesday: { comidas: [{ items: [{ alimentoId: "a" }] }] },
    },
  };
  let persistedPatch = null;

  servicio.menusModel = {
    getBaseById: async () => weeklyMenu,
  };
  servicio.usuariosModel = {
    updateById: async (_id, patch) => {
      persistedPatch = patch;
      return { ...user, ...patch };
    },
  };

  const repaired = await servicio._repairMenuState(user);

  assert.equal(repaired.menu.activeSource, "none");
  assert.equal(repaired.menu.activeOwnMenuId, null);
  assert.equal(repaired.menu.lastIncompatibleOwnMenuId, "menu-1");
  assert.equal(repaired.menu.lastIncompatibleReason, "MENU_DAYS_LIMIT");
  assert.equal(persistedPatch.menu.lastIncompatibleReason, "MENU_DAYS_LIMIT");
});

test("autoriza generación automática por capability, incluso con coach, y falla cerrado sin permiso", async () => {
  const servicio = new ServicioClientOwnMenus();
  servicio._actor = async (user) => user;
  servicio.capabilities = async (user) => user.capabilities;

  const authorized = await servicio.authorizeAutomaticGeneration({
    capabilities: {
      plan: "pro",
      hasCoach: false,
      clientType: "self_managed",
      canGenerateAutomaticMenu: true,
      canAutoCalculateTrackingQuantities: true,
      limits: { automaticMealFoods: 6 },
    },
  });

  assert.equal(authorized.authorized, true);
  assert.equal(authorized.policy, "tracking_calorie_fill_v1");
  assert.equal(authorized.previewOnly, true);

  await assert.rejects(
    () => servicio.authorizeAutomaticGeneration({
      capabilities: {
        plan: "free",
        hasCoach: false,
        clientType: "self_managed",
        canGenerateAutomaticMenu: false,
        canAutoCalculateTrackingQuantities: false,
      },
    }),
    (error) => error.code === "PLAN_CAPABILITY_REQUIRED"
  );

  const coached = await servicio.authorizeAutomaticGeneration({
    capabilities: {
      plan: "free",
      hasCoach: true,
      clientType: "with_coach",
      canGenerateAutomaticMenu: true,
      canAutoCalculateTrackingQuantities: true,
      limits: { automaticMealFoods: 6 },
    },
  });
  assert.equal(coached.authorized, true);
  assert.equal(coached.previewOnly, true);

  await assert.rejects(
    () => servicio.authorizeAutomaticGeneration({
      capabilities: { hasCoach: true, clientType: "with_coach" },
    }),
    (error) => error.code === "PLAN_CAPABILITY_REQUIRED"
  );
});
