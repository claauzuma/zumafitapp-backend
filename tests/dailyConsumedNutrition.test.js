import assert from "node:assert/strict";
import test from "node:test";

import { resolveDailyConsumedNutrition } from "../servicio/usuarios.js";

test("FoodLogs reemplazan el fallback completedMenuMeals del mismo slot sin duplicar", () => {
  const result = resolveDailyConsumedNutrition({
    consumedTotals: { kcal: 500, proteina: 40, carbs: 55, grasas: 15 },
    completedMenuMeals: [{
      mealId: "desayuno-1",
      mealType: "desayuno",
      totals: { kcal: 500, proteina: 40, carbs: 55, grasas: 15 },
    }],
  }, [{
    id: "log-1",
    mealId: "desayuno-1",
    mealType: "desayuno",
    kcal: 492,
    proteina: 41.4,
    carbs: 60.4,
    grasas: 5.4,
  }]);

  assert.deepEqual(result.totals, {
    kcal: 492,
    proteina: 41.4,
    carbs: 60.4,
    grasas: 5.4,
  });
  assert.equal(result.meals.length, 1);
  assert.equal(result.meals[0].source, "food_logs");
});

test("completedMenuMeals sigue siendo fallback para un slot sin FoodLogs", () => {
  const result = resolveDailyConsumedNutrition({
    consumedTotals: { kcal: 700, proteina: 55, carbs: 75, grasas: 20 },
    completedMenuMeals: [{
      mealId: "almuerzo-1",
      mealType: "almuerzo",
      totals: { kcal: 700, proteina: 55, carbs: 75, grasas: 20 },
    }],
  }, []);

  assert.deepEqual(result.totals, { kcal: 700, proteina: 55, carbs: 75, grasas: 20 });
  assert.equal(result.meals[0].source, "completed_menu_fallback");
});

test("Picoteo queda separado y los FoodLogs espejo de equivalencias no se suman", () => {
  const result = resolveDailyConsumedNutrition({
    consumedTotals: { kcal: 500, proteina: 40, carbs: 50, grasas: 15 },
    completedMenuMeals: [{
      mealId: "cena-1",
      mealType: "cena",
      totals: { kcal: 500, proteina: 40, carbs: 50, grasas: 15 },
    }],
  }, [
    {
      id: "mirror",
      mealId: "cena-1",
      mealType: "cena",
      source: "menu_equivalent_consumption",
      kcal: 500,
      proteina: 40,
      carbs: 50,
      grasas: 15,
    },
    {
      id: "snack",
      mealId: "picoteo",
      mealType: "otra",
      kcal: 260,
      proteina: 8,
      carbs: 50,
      grasas: 3,
    },
  ]);

  assert.deepEqual(result.picoteo, { kcal: 260, proteina: 8, carbs: 50, grasas: 3 });
  assert.deepEqual(result.totals, { kcal: 760, proteina: 48, carbs: 100, grasas: 18 });
});
