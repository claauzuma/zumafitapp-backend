import assert from "node:assert/strict";
import test from "node:test";

import ServicioFoodLogs from "../servicio/foodLogs.js";
import {
  calculateCatalogFoodNutrition,
  catalogFoodNutrition,
  inferFoodMacroBasis,
} from "../servicio/foodNutrition.js";

const CHICKEN = {
  _id: "6619bfeb147cd50b64677809",
  alimentoId: 404,
  Alimentos: "Pechuga de pollo sin piel, cruda",
  Unidad: "Grs",
  Calorias: 1.14,
  Proteinas: 0.225,
  Carbohidratos: 0,
  Grasas: 0.026,
  kcal100: 114,
  proteina100: 22.5,
  carbohidratos100: 0,
  grasas100: 2.6,
  macroBasis: "perUnit",
};

const STEAK = {
  _id: "6619bfeb147cd50b646776e6",
  alimentoId: 113,
  Alimentos: "Churrasco vacuno magro, crudo (corte magro promedio)",
  Unidad: "Grs",
  Calorias: 1.38,
  Proteinas: 0.222,
  Carbohidratos: 0,
  Grasas: 0.055,
  kcal100: 138,
  proteina100: 22.2,
  carbohidratos100: 0,
  grasas100: 5.5,
  macroBasis: "perUnit",
};

function serviceWithFood(food) {
  const service = new ServicioFoodLogs();
  service.alimentosModel = {
    obtenerAlimentoPorId: async (id) => (
      [food._id, String(food.alimentoId)].includes(String(id)) ? food : null
    ),
    obtenerAlimentos: async () => [food],
  };
  return service;
}

test("el contrato reconoce perUnit literal y conserva el legado por gramo", () => {
  assert.equal(inferFoodMacroBasis("g", CHICKEN), "perUnit");
  const normalized = catalogFoodNutrition(CHICKEN, "g");
  assert.deepEqual(
    calculateCatalogFoodNutrition(normalized, 250, "g"),
    { kcal: 285, proteina: 56.3, carbs: 0, grasas: 6.5, fibra: 0 }
  );
});

test("tracking reconstruye pechuga y churrasco desde el catalogo canonico", async () => {
  const chicken = await serviceWithFood(CHICKEN)._snapshotFromPayload({
    alimentoId: CHICKEN.alimentoId,
    cantidad: 250,
    unidad: "g",
  });
  assert.deepEqual(
    { kcal: chicken.kcal, proteina: chicken.proteina, carbs: chicken.carbs, grasas: chicken.grasas },
    { kcal: 285, proteina: 56.3, carbs: 0, grasas: 6.5 }
  );

  const steak = await serviceWithFood(STEAK)._snapshotFromPayload({
    food: { alimentoId: STEAK.alimentoId },
    cantidad: 200,
    unidad: "g",
  });
  assert.deepEqual(
    { kcal: steak.kcal, proteina: steak.proteina, carbs: steak.carbs, grasas: steak.grasas },
    { kcal: 276, proteina: 44.4, carbs: 0, grasas: 11 }
  );
});

test("un batch con macros viejos se canoniza por alimentoId antes de persistir", async () => {
  const snapshot = await serviceWithFood(CHICKEN)._snapshotFromSavedMealItem({
    alimentoId: CHICKEN._id,
    nombreSnapshot: CHICKEN.Alimentos,
    cantidad: 250,
    unidad: "g",
    kcal: 275,
    proteina: 50,
    carbs: 0,
    grasas: 0,
    quantitySource: "manual",
  });
  assert.deepEqual(
    {
      kcal: snapshot.kcal,
      proteina: snapshot.proteina,
      carbs: snapshot.carbs,
      grasas: snapshot.grasas,
      quantitySource: snapshot.quantitySource,
    },
    { kcal: 285, proteina: 56.3, carbs: 0, grasas: 6.5, quantitySource: "manual" }
  );
});

test("si el ID no resuelve, el fallback respeta macroBasis del payload", async () => {
  const service = serviceWithFood(CHICKEN);
  const snapshot = await service._snapshotFromPayload({
    food: {
      alimentoId: "custom-food",
      nombre: "Alimento privado",
      unidad: "g",
      kcal: 1.5,
      proteina: 0.2,
      carbs: 0.05,
      grasas: 0.05,
      macroBasis: "perUnit",
    },
    cantidad: 200,
    unidad: "g",
  });
  assert.deepEqual(
    { kcal: snapshot.kcal, proteina: snapshot.proteina, carbs: snapshot.carbs, grasas: snapshot.grasas },
    { kcal: 300, proteina: 40, carbs: 10, grasas: 10 }
  );
});

test("un alimento personalizado propio tambien se canoniza desde Mongo", async () => {
  const ownerId = "507f1f77bcf86cd799439011";
  const customId = "507f1f77bcf86cd799439012";
  const custom = {
    _id: customId,
    ownerId,
    Alimentos: "Barra personalizada",
    Unidad: "g",
    Calorias: 380,
    Proteinas: 30,
    Carbohidratos: 40,
    Grasas: 11,
    kcal100: 380,
    proteina100: 30,
    carbohidratos100: 40,
    grasas100: 11,
    macroBasis: "per100",
    customFood: true,
    privateFood: true,
  };
  const service = new ServicioFoodLogs();
  service.alimentosModel = {
    obtenerAlimentoPorId: async () => null,
    obtenerAlimentos: async () => [],
  };
  service.customFoodsModel = { findById: async () => custom };

  const snapshot = await service._snapshotFromPayload({
    food: { alimentoId: customId, kcal: 1, proteina: 1, carbs: 1, grasas: 1 },
    cantidad: 50,
    unidad: "g",
  }, null, { _id: ownerId });

  assert.deepEqual(
    { kcal: snapshot.kcal, proteina: snapshot.proteina, carbs: snapshot.carbs, grasas: snapshot.grasas },
    { kcal: 190, proteina: 15, carbs: 20, grasas: 5.5 }
  );
});

