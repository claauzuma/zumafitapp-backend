import assert from "node:assert/strict";
import test from "node:test";

import {
  equivalentMealScore,
  equivalentTargetFromFilters,
  filterWithNutritionFacets,
  mealCompatibleWithRestrictions,
  nutritionFacetBucket,
} from "../servicio/nutritionLibrary.js";

test("biblioteca ordena primero kcal, luego proteina y despues C/G", () => {
  const target = equivalentTargetFromFilters({ targetKcal: 600, targetProteina: 45, targetCarbs: 70, targetGrasas: 18 });
  const close = equivalentMealScore({ tipoComida: "almuerzo", totales: { kcal: 600, proteina: 43, carbs: 72, grasas: 18 } }, target, "almuerzo");
  const farCalories = equivalentMealScore({ tipoComida: "almuerzo", totales: { kcal: 520, proteina: 45, carbs: 70, grasas: 18 } }, target, "almuerzo");
  const wrongType = equivalentMealScore({ tipoComida: "desayuno", totales: { kcal: 600, proteina: 43, carbs: 72, grasas: 18 } }, target, "almuerzo");
  assert.ok(close.score < farCalories.score);
  assert.ok(close.score < wrongType.score);
  assert.equal(close.diff.kcal, 0);
});

test("un filtro exclusivo de calorias no penaliza macros que el usuario dejo libres", () => {
  const target = equivalentTargetFromFilters({ targetKcal: 2500 });
  const highProtein = equivalentMealScore({ totales: { kcal: 2500, proteina: 180, carbs: 280, grasas: 70 } }, target);
  const lowProtein = equivalentMealScore({ totales: { kcal: 2500, proteina: 20, carbs: 30, grasas: 5 } }, target);
  assert.equal(highProtein.score, lowProtein.score);
  assert.equal(highProtein.score, 0);
});

test("los menus generan solamente los rangos caloricos y proteicos que existen", () => {
  const items = [
    { id: "a", kind: "menu", totales: { kcal: 2560, proteina: 154 } },
    { id: "b", kind: "menu", totales: { kcal: 1920, proteina: 118 } },
  ];
  const all = filterWithNutritionFacets(items, {}, { kind: "menu" });
  assert.deepEqual(all.facets.calories, [{ value: 1900, count: 1 }, { value: 2600, count: 1 }]);
  assert.deepEqual(all.facets.proteins, [{ value: 120, count: 1 }, { value: 150, count: 1 }]);
  const selected = filterWithNutritionFacets(items, { calorieBucket: 2600 }, { kind: "menu" });
  assert.deepEqual(selected.items.map((item) => item.id), ["a"]);
  assert.deepEqual(selected.facets.proteins, [{ value: 150, count: 1 }]);
});

test("las comidas redondean a 50 kcal, ofrecen solo tipos existentes y encadenan filtros", () => {
  const items = [
    { id: "a", kind: "comida", tipoComida: "almuerzo", totales: { kcal: 500, proteina: 32 } },
    { id: "b", kind: "comida", tipoComida: "snack", totales: { kcal: 360, proteina: 17 } },
    { id: "c", kind: "comida", tipoComida: "snack", totales: { kcal: 390, proteina: 24 } },
  ];
  assert.equal(nutritionFacetBucket(360, { kind: "meal", field: "kcal" }), 350);
  const snack = filterWithNutritionFacets(items, { tipoComida: "snack" }, { kind: "meal" });
  assert.deepEqual(snack.facets.types, [{ value: "almuerzo", count: 1 }, { value: "snack", count: 2 }]);
  assert.deepEqual(snack.facets.calories, [{ value: 350, count: 1 }, { value: 400, count: 1 }]);
  const selected = filterWithNutritionFacets(items, { tipoComida: "snack", calorieBucket: 400, proteinBucket: 25 }, { kind: "meal" });
  assert.deepEqual(selected.items.map((item) => item.id), ["c"]);
});

test("biblioteca cliente excluye comidas con alimentos restringidos por ID o semantica", () => {
  const actor = {
    role: "cliente",
    menu: { restrictions: { allergies: ["mani"], excludedFoods: ["forbidden-id"] } },
  };
  const allowed = { items: [{ alimentoId: "rice", nombre: "Arroz", kcal: 300, proteina: 6, carbs: 65, grasas: 1 }] };
  const allergen = { items: [{ alimentoId: "peanut", nombre: "Manteca de mani", kcal: 300, proteina: 10, carbs: 8, grasas: 20 }] };
  const forbidden = { items: [{ alimentoId: "forbidden-id", nombre: "Queso", kcal: 200, proteina: 12, carbs: 2, grasas: 15 }] };
  assert.equal(mealCompatibleWithRestrictions(actor, allowed), true);
  assert.equal(mealCompatibleWithRestrictions(actor, allergen), false);
  assert.equal(mealCompatibleWithRestrictions(actor, forbidden), false);
});
