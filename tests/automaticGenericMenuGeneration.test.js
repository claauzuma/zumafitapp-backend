import assert from "node:assert/strict";
import test from "node:test";

import ServicioAlimentos, { TRACKING_QUANTITY_INTERNAL_CONTEXT } from "../servicio/alimentos.js";

const MEAL_TYPES = ["breakfast", "lunch", "snack", "dinner", "extraSnack"];

function genericFood({ id, name, kcal, protein, carbs, fat, role, min, max, step, category }) {
  return {
    _id: id,
    nombre: name,
    unidad: "g",
    macroBasis: "perUnit",
    kcalUnidad: kcal,
    proteinaUnidad: protein,
    carbohidratosUnidad: carbs,
    grasasUnidad: fat,
    categoria: category,
    activo: true,
    generation: {
      mode: "GENERIC",
      roles: { [role]: true },
      mealTypes: Object.fromEntries(MEAL_TYPES.map((type) => [type, true])),
      portionRule: { unit: "g", min, max, step, allowedValues: [] },
    },
  };
}

function pending(food) {
  return {
    foodId: food._id,
    name: food.nombre,
    unit: food.unidad,
    kcalPerUnitOrGram: food.kcalUnidad,
    proteinPerUnitOrGram: food.proteinaUnidad,
    carbsPerUnitOrGram: food.carbohidratosUnidad,
    fatPerUnitOrGram: food.grasasUnidad,
    categoria: food.categoria,
  };
}

const CATALOG = [
  genericFood({ id: "menu-chicken", name: "Pechuga generica", kcal: 1.65, protein: 0.31, carbs: 0, fat: 0.036, role: "P1", min: 50, max: 180, step: 5, category: "Proteicos" }),
  genericFood({ id: "menu-rice", name: "Arroz generico", kcal: 1.3, protein: 0.027, carbs: 0.282, fat: 0.003, role: "C1", min: 30, max: 250, step: 5, category: "Carbohidratos" }),
  genericFood({ id: "menu-oil", name: "Aceite generico", kcal: 9, protein: 0, carbs: 0, fat: 1, role: "G", min: 2, max: 20, step: 1, category: "Grasas" }),
];

function service() {
  const instance = new ServicioAlimentos("TEST");
  instance.model = { obtenerAlimentos: async () => CATALOG };
  return instance;
}

async function generateMeal(target, mealType) {
  return await service().generarCantidades({
    date: "2026-08-20",
    mode: "kcalProteina",
    generationType: "selectedOnly",
    menuGenerationPolicy: "generic_menu_v1",
    generationMealType: mealType,
    target,
    fixedFoods: [],
    pendingFoods: CATALOG.map(pending),
    options: { redondear: true },
  }, {
    authorization: TRACKING_QUANTITY_INTERNAL_CONTEXT,
    trackingQuantityMode: "calorie_fill",
  });
}

test("genera menus completos de 3, 4, 5 y 6 comidas respetando GENERIC, porciones y proteina", async () => {
  const scenarios = [
    { count: 3, kcal: 600, protein: 40 },
    { count: 4, kcal: 500, protein: 40 },
    { count: 5, kcal: 450, protein: 35 },
    { count: 6, kcal: 400, protein: 30 },
  ];

  for (const scenario of scenarios) {
    const generated = [];
    for (let index = 0; index < scenario.count; index += 1) {
      const mealType = MEAL_TYPES[index % MEAL_TYPES.length];
      generated.push(await generateMeal({
        kcal: scenario.kcal,
        proteina: scenario.protein,
        carbs: scenario.kcal / 8,
        grasas: scenario.kcal / 36,
      }, mealType));
    }

    assert.equal(generated.length, scenario.count);
    generated.forEach((meal) => {
      assert.equal(meal.optimization.policy, "tracking_calorie_fill_v1");
      assert.ok(Math.abs(meal.totals.calorias - scenario.kcal) <= 10, `${scenario.count} comidas: kcal ${meal.totals.calorias}`);
      assert.ok(meal.totals.proteina >= 15 && meal.totals.proteina <= 65, `${scenario.count} comidas: P ${meal.totals.proteina}`);
      assert.ok(meal.foods.some((food) => food.foodId === "menu-chicken"));
      meal.foods.forEach((food) => {
        const source = CATALOG.find((entry) => entry._id === food.foodId);
        const rule = source.generation.portionRule;
        assert.ok(food.quantity >= rule.min && food.quantity <= rule.max, `${food.name}: min/max`);
        assert.equal(Math.abs((food.quantity - rule.min) % rule.step) < 1e-8, true, `${food.name}: step`);
      });
    });
  }
});
