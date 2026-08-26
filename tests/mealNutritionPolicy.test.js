import assert from "node:assert/strict";
import test from "node:test";

import {
  MEAL_NUTRITION_CLASSIFICATIONS,
  compareMealNutritionResults,
  evaluateMealNutritionResult,
} from "../servicio/mealNutritionPolicy.js";

const target = { kcal: 776, proteina: 57.6, carbs: 94.6, grasas: 15.6 };
const totals = (kcal, proteina, carbs = target.carbs, grasas = target.grasas) => ({
  kcal,
  proteina,
  carbs,
  grasas,
});

test("1: 770/P59 gana a 775/P65 porque ambas kcal estan cerca y mejora la banda proteica", () => {
  assert.ok(compareMealNutritionResults(
    totals(770, 59),
    totals(775, 65),
    target
  ) < 0);
});

test("2: 773/P58 gana a 776/P68", () => {
  assert.ok(compareMealNutritionResults(
    totals(773, 58),
    totals(776, 68),
    target
  ) < 0);
});

test("3: con proteina excelente 775/P58.5 gana a 770/P58 por kcal", () => {
  assert.ok(compareMealNutritionResults(
    totals(775, 58.5),
    totals(770, 58),
    target
  ) < 0);
});

test("4: 776/P58 gana ampliamente a 744/P57.6", () => {
  assert.ok(compareMealNutritionResults(
    totals(776, 58),
    totals(744, 57.6),
    target
  ) < 0);
});

test("5: la distancia proteica es simetrica para P55 y P65 con target P60", () => {
  const proteinTarget = { ...target, proteina: 60 };
  assert.equal(compareMealNutritionResults(
    totals(776, 55),
    totals(776, 65),
    proteinTarget
  ), 0);
  assert.equal(compareMealNutritionResults(
    totals(776, 65),
    totals(776, 55),
    proteinTarget
  ), 0);
});

test("6/8: P58 o P62 para target P60, kcal excelentes y C/G razonables son RECOMMENDED", () => {
  const proteinTarget = { ...target, proteina: 60 };
  for (const protein of [58, 62]) {
    const result = evaluateMealNutritionResult(totals(772, protein), proteinTarget);
    assert.equal(result.status, MEAL_NUTRITION_CLASSIFICATIONS.RECOMMENDED);
    assert.equal(result.recommended, true);
    assert.equal(result.usable, true);
    assert.equal(result.warning, null);
  }
});

test("7: P72 para target P60 genera un unico warning nutricional de exceso", () => {
  const result = evaluateMealNutritionResult(
    totals(776, 72),
    { ...target, proteina: 60 }
  );
  assert.equal(result.status, MEAL_NUTRITION_CLASSIFICATIONS.BEST_EFFORT);
  assert.equal(result.usable, true);
  assert.deepEqual(result.warning.reasonCodes, ["PROTEIN_ABOVE_REASONABLE_RANGE"]);
});

test("20/21: 772/P86.2 advierte macros, no afirma que falten calorias y no duplica motivos", () => {
  const result = evaluateMealNutritionResult(
    totals(772, 86.2, 76.5, 13.5),
    target
  );
  assert.equal(result.status, MEAL_NUTRITION_CLASSIFICATIONS.BEST_EFFORT);
  assert.equal(result.usable, true);
  assert.equal(result.zones.calories, "EXCELLENT");
  assert.match(result.warning.summary, /calorias estan alineadas/i);
  assert.doesNotMatch(result.warning.message, /faltan .*kcal|no completa/i);
  assert.ok(!result.warning.reasonCodes.includes("CALORIES_OUTSIDE_ACCEPTABLE_RANGE"));
  assert.equal(new Set(result.warning.reasonCodes).size, result.warning.reasonCodes.length);
});

test("22: con kcal y proteina iguales gana el menor error energetico de C/G", () => {
  const closer = totals(775, 58, 92, 16);
  const farther = totals(775, 58, 75, 8);
  assert.ok(compareMealNutritionResults(closer, farther, target) < 0);
});

test("23: el comparador es determinista y admite overshoot dentro de +10", () => {
  const left = totals(777, 58);
  const right = totals(770, 58);
  const first = compareMealNutritionResults(left, right, target);
  assert.ok(first < 0);
  for (let index = 0; index < 20; index++) {
    assert.equal(compareMealNutritionResults(left, right, target), first);
  }
});

