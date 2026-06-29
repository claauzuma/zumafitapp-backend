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
