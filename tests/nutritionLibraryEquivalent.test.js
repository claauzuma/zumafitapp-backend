import assert from "node:assert/strict";
import test from "node:test";

import {
  equivalentMealScore,
  equivalentTargetFromFilters,
  mealCompatibleWithRestrictions,
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
