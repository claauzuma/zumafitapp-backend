import assert from "node:assert/strict";
import test from "node:test";

import ServicioAlimentos from "../servicio/alimentos.js";
import {
  ADMIN_COACH_FIXTURES,
  ADMIN_COACH_FOODS,
  fixturePayload,
  runAdminCoachImpactMatrix,
} from "./fixtures/adminCoachQuantityFixtures.js";

const EPSILON = 1e-6;

function quantityFor(result, name) {
  return result.foods.find((food) => food.name === name)?.quantity;
}

test("24 fixtures Admin/Coach conservan policy historica y ahora respetan constraints reales", async () => {
  const rows = await runAdminCoachImpactMatrix();
  assert.equal(rows.length, 24);
  assert.equal(rows.filter((row) => row.flow === "Admin").length, 12);
  assert.equal(rows.filter((row) => row.flow === "Coach").length, 12);

  let changedQuantities = 0;
  let changedMaxMetadata = 0;
  let oldConstraintViolations = 0;
  for (const row of rows) {
    assert.equal(row.before.optimization, null, `${row.id}: policy anterior`);
    assert.equal(row.currentLegacyInput.optimization, null, `${row.id}: policy actual con input historico`);
    assert.equal(row.current.optimization, null, `${row.id}: policy actual`);
    const quantitiesOf = (result) => result.foods.map((food) => [food.name, food.quantity]);
    const maximumsOf = (result) => result.foods.map((food) => [food.name, food.max]);
    if (JSON.stringify(quantitiesOf(row.before)) !== JSON.stringify(quantitiesOf(row.current))) {
      changedQuantities += 1;
    }
    if (JSON.stringify(maximumsOf(row.before)) !== JSON.stringify(maximumsOf(row.current))) {
      changedMaxMetadata += 1;
    }

    for (const key of row.foods) {
      const catalog = ADMIN_COACH_FOODS[key];
      const quantity = quantityFor(row.current, catalog.nombre);
      assert.ok(Number.isFinite(quantity), `${row.id}/${catalog.nombre}: cantidad finita`);
      assert.ok(quantity >= catalog.porcionMin - EPSILON, `${row.id}/${catalog.nombre}: minimo`);
      assert.ok(quantity <= catalog.porcionMax + EPSILON, `${row.id}/${catalog.nombre}: maximo`);
      assert.ok(
        Math.abs((quantity - catalog.porcionMin) / catalog.multiplo - Math.round((quantity - catalog.porcionMin) / catalog.multiplo)) < EPSILON,
        `${row.id}/${catalog.nombre}: step`
      );

      const oldQuantity = quantityFor(row.before, catalog.nombre);
      if (
        oldQuantity < catalog.porcionMin - EPSILON ||
        oldQuantity > catalog.porcionMax + EPSILON ||
        Math.abs((oldQuantity - catalog.porcionMin) / catalog.multiplo - Math.round((oldQuantity - catalog.porcionMin) / catalog.multiplo)) >= EPSILON
      ) {
        oldConstraintViolations += 1;
      }
    }
  }

  assert.equal(changedQuantities, 20);
  assert.equal(changedMaxMetadata, 24);
  assert.equal(oldConstraintViolations, 32);
});

test("el ID exacto prevalece sobre un homonimo activo de mayor ranking", async () => {
  const exact = {
    _id: "snapshot-exacto",
    nombre: "Homonimo control",
    unidad: "Unid",
    macroBasis: "perUnit",
    kcalUnidad: 10,
    proteinaUnidad: 1,
    carbohidratosUnidad: 0,
    grasasUnidad: 0,
    porcionMin: 1,
    porcionMax: 8,
    porcionSugerida: 2,
    multiplo: 1,
    activo: false,
  };
  const activeHomonym = {
    ...exact,
    _id: "homonimo-activo",
    alimentoId: 999,
    kcalUnidad: 20,
    porcionMax: 3,
    activo: true,
  };
  const service = new ServicioAlimentos("TEST");
  service.model = { obtenerAlimentos: async () => [activeHomonym, exact] };
  const result = await service.generarCantidades({
    mode: "kcalProteina",
    generationType: "selectedOnly",
    target: { kcal: 80, proteina: 0, carbs: 0, grasas: 0 },
    fixedFoods: [],
    pendingFoods: [{
      foodId: exact._id,
      name: exact.nombre,
      unit: exact.unidad,
      kcalPerUnitOrGram: exact.kcalUnidad,
      proteinPerUnitOrGram: exact.proteinaUnidad,
      carbsPerUnitOrGram: 0,
      fatPerUnitOrGram: 0,
    }],
    options: { redondear: true, usarMinMax: true },
  });

  assert.equal(result.foods[0].foodId, exact._id);
  assert.equal(result.foods[0].quantity, 8);
  assert.equal(result.foods[0].maxGramos, 8);
  assert.equal(result.foods[0].kcal, 80);
});

test("el fallback por nombre se usa solo cuando la solicitud no trae identidad", async () => {
  const catalogFood = {
    _id: "catalog-fallback-id",
    alimentoId: 7001,
    nombre: "Fallback de nombre controlado",
    unidad: "Unid",
    macroBasis: "perUnit",
    kcalUnidad: 20,
    proteinaUnidad: 2,
    carbohidratosUnidad: 1,
    grasasUnidad: 1,
    porcionMin: 1,
    porcionMax: 3,
    multiplo: 1,
    categoria: "Proteinas",
    activo: true,
  };
  const service = new ServicioAlimentos("TEST");
  service.model = { obtenerAlimentos: async () => [catalogFood] };
  const payload = (pendingFood) => ({
    mode: "kcalProteina",
    generationType: "selectedOnly",
    target: { kcal: 60, proteina: 0, carbs: 0, grasas: 0 },
    fixedFoods: [],
    pendingFoods: [pendingFood],
    options: { redondear: true, usarMinMax: true },
  });

  const byName = await service.generarCantidades(payload({
    name: catalogFood.nombre,
    unit: catalogFood.unidad,
  }));
  assert.equal(byName.foods[0].foodId, catalogFood._id);
  assert.equal(byName.foods[0].quantity, 3);
  assert.equal(byName.foods[0].kcal, 60);
  assert.equal(byName.foods[0].maxGramos, 3);

  const unknownIdentity = await service.generarCantidades(payload({
    foodId: "id-desconocido",
    name: catalogFood.nombre,
    unit: catalogFood.unidad,
  }));
  assert.equal(unknownIdentity.foods[0].foodId, "id-desconocido");
  assert.equal(unknownIdentity.foods[0].kcal, 0);
  assert.notEqual(unknownIdentity.foods[0].maxGramos, catalogFood.porcionMax);
});

test("dos seleccionados homonimos conservan simultaneamente ID, unidad, macros y source", async () => {
  const byUnit = {
    _id: "homonimo-unidad",
    alimentoId: 1001,
    nombre: "Homonimo multiunidad",
    unidad: "Unid",
    macroBasis: "perUnit",
    kcalUnidad: 10,
    proteinaUnidad: 1,
    carbohidratosUnidad: 2,
    grasasUnidad: 0,
    porcionMin: 1,
    porcionMax: 3,
    multiplo: 1,
    categoria: "Carbohidratos",
    activo: true,
  };
  const byGram = {
    ...byUnit,
    _id: "homonimo-gramos",
    alimentoId: 1002,
    unidad: "Grs",
    kcalUnidad: 2,
    proteinaUnidad: 0.1,
    carbohidratosUnidad: 0.4,
    porcionMin: 10,
    porcionMax: 20,
    multiplo: 5,
  };
  const service = new ServicioAlimentos("TEST");
  service.model = { obtenerAlimentos: async () => [byUnit, byGram] };
  const requestItem = (food) => ({
    foodId: food._id,
    name: food.nombre,
    unit: food.unidad,
    kcalPerUnitOrGram: food.kcalUnidad,
    proteinPerUnitOrGram: food.proteinaUnidad,
    carbsPerUnitOrGram: food.carbohidratosUnidad,
    fatPerUnitOrGram: food.grasasUnidad,
    categoria: food.categoria,
  });
  const result = await service.generarCantidades({
    mode: "kcalProteina",
    generationType: "selectedOnly",
    target: { kcal: 70, proteina: 0, carbs: 14, grasas: 0 },
    fixedFoods: [],
    pendingFoods: [requestItem(byUnit), requestItem(byGram)],
    options: { redondear: true, usarMinMax: true },
  });

  assert.equal(result.foods.length, 2);
  const unitResult = result.foods.find((item) => item.foodId === byUnit._id);
  const gramResult = result.foods.find((item) => item.foodId === byGram._id);
  assert.deepEqual(
    {
      id: unitResult?.foodId,
      unit: unitResult?.unit,
      quantity: unitResult?.quantity,
      kcal: unitResult?.kcal,
      protein: unitResult?.proteina,
      carbs: unitResult?.carbs,
      source: unitResult?.source,
    },
    {
      id: byUnit._id,
      unit: "Unid",
      quantity: 3,
      kcal: 30,
      protein: 3,
      carbs: 6,
      source: "generated",
    }
  );
  assert.deepEqual(
    {
      id: gramResult?.foodId,
      unit: gramResult?.unit,
      quantity: gramResult?.quantity,
      kcal: gramResult?.kcal,
      protein: gramResult?.proteina,
      carbs: gramResult?.carbs,
      source: gramResult?.source,
    },
    {
      id: byGram._id,
      unit: "Grs",
      quantity: 20,
      kcal: 40,
      protein: 2,
      carbs: 8,
      source: "generated",
    }
  );
  assert.deepEqual(result.totals, {
    calorias: 70,
    proteina: 5,
    carbohidratos: 14,
    grasas: 0,
  });
});

test("Grs se interpreta una vez como gramos y las unidades siguen siendo discretas", async () => {
  const service = new ServicioAlimentos("TEST");
  service.model = { obtenerAlimentos: async () => [ADMIN_COACH_FOODS.chicken, ADMIN_COACH_FOODS.eggs] };

  const gramFixture = {
    id: "ALIAS-GRS",
    foods: ["chicken"],
    fixed: {},
    target: [110.5, 22, 0, 2.5],
  };
  const grams = await service.generarCantidades(fixturePayload(gramFixture, "exact", { preserveGrs: true }));
  assert.equal(grams.foods[0].unit, "Grs");
  assert.equal(grams.foods[0].quantity, 100);
  assert.equal(grams.foods[0].kcal, 110.5);
  assert.equal(grams.foods[0].proteina, 22);
  assert.equal(grams.foods[0].grasas, 2.5);

  const unitFixture = {
    id: "UNIDAD",
    foods: ["eggs"],
    fixed: {},
    target: [207, 18, 0, 15],
  };
  const units = await service.generarCantidades(fixturePayload(unitFixture, "exact"));
  assert.equal(units.foods[0].unit, "Unid");
  assert.equal(units.foods[0].quantity, 3);
  assert.equal(units.foods[0].kcal, 207);
});
