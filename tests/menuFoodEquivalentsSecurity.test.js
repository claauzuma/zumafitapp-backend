import assert from "node:assert/strict";
import test from "node:test";

import ServicioMenus from "../servicio/menus.js";

function client() {
  return {
    _id: "507f1f77bcf86cd799439011",
    id: "507f1f77bcf86cd799439011",
    role: "cliente",
    plan: "pro",
    personalPlan: "pro",
    clientPermissions: { tracking: { canCreateEquivalentMeals: true } },
  };
}

function food(id, nombre, overrides = {}) {
  return {
    _id: id,
    Alimentos: nombre,
    Unidad: "g",
    macroBasis: "per100",
    Calorias: 300,
    Proteinas: 10,
    Carbohidratos: 60,
    Grasas: 2,
    activo: true,
    ...overrides,
  };
}

test("equivalencia individual usa ID y macros server-side e ignora objetivo manipulado", async () => {
  const service = new ServicioMenus();
  service._actor = async () => client();
  service.alimentosModel = {
    obtenerAlimentos: async () => [
      food("rice-id", "Arroz", { Calorias: 339, Proteinas: 8, Carbohidratos: 75.5, Grasas: 0.5 }),
      food("pasta-id", "Fideos", { Calorias: 350, Proteinas: 12, Carbohidratos: 72, Grasas: 1.5 }),
      food("disabled-id", "Pan", { activo: false }),
    ],
  };
  const result = await service.getFoodEquivalents({}, {
    alimentoOriginal: {
      alimentoId: "rice-id",
      nombre: "Nombre falso",
      kcal: 9999,
      proteina: 999,
      carbs: 0,
      grasas: 900,
    },
    cantidad: 100,
    objetivo: "grasas",
  });

  assert.equal(result.original.nombre, "Arroz");
  assert.equal(result.original.kcal, 339);
  assert.equal(result.original.carbs, 75.5);
  assert.equal(result.objetivo, "carbs");
  assert.deepEqual(result.equivalentes.map((item) => item.id), ["pasta-id"]);
});

test("unidades discretas se escalan por unidad y no se dividen por cien", async () => {
  const service = new ServicioMenus();
  service._actor = async () => client();
  service.alimentosModel = {
    obtenerAlimentos: async () => [
      food("egg-id", "Huevos", {
        Unidad: "unidad",
        macroBasis: "perUnit",
        Calorias: 70,
        Proteinas: 6,
        Carbohidratos: 0.4,
        Grasas: 5,
      }),
      food("chicken-id", "Pechuga de pollo", {
        Calorias: 110,
        Proteinas: 20,
        Carbohidratos: 0,
        Grasas: 2,
      }),
    ],
  };
  const result = await service.getFoodEquivalents({}, {
    alimentoOriginal: { alimentoId: "egg-id" },
    cantidad: 2,
  });
  assert.equal(result.original.kcal, 140);
  assert.equal(result.original.proteina, 12);
  assert.equal(result.equivalentes[0].cantidadSugerida, 60);
});

test("rechaza identidad inexistente aunque el nombre y macros parezcan validos", async () => {
  const service = new ServicioMenus();
  service._actor = async () => client();
  service.alimentosModel = { obtenerAlimentos: async () => [food("rice-id", "Arroz")] };
  await assert.rejects(
    service.getFoodEquivalents({}, {
      alimentoOriginal: { alimentoId: "inventado", nombre: "Arroz", kcal: 300 },
      cantidad: 100,
    }),
    /EQUIVALENT_FOOD_ID_INVALID/
  );
});
