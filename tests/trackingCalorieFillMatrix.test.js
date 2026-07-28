import test from "node:test";
import assert from "node:assert/strict";

import {
  CALORIE_FILL_FIXED_COUNT,
  CALORIE_FILL_FIXED_SCENARIOS,
  CALORIE_FILL_RANDOM_COUNT,
  CALORIE_FILL_RANDOM_SCENARIOS,
  runTrackingCalorieFillMatrix,
} from "./support/trackingCalorieFillMatrix.js";

let matrixPromise;
function matrix() {
  matrixPromise ||= runTrackingCalorieFillMatrix();
  return matrixPromise;
}

test("la matriz calorie_fill cubre 45 fijos y 100 random reproducibles", () => {
  assert.equal(CALORIE_FILL_FIXED_SCENARIOS.length, CALORIE_FILL_FIXED_COUNT);
  assert.equal(CALORIE_FILL_RANDOM_SCENARIOS.length, CALORIE_FILL_RANDOM_COUNT);
  assert.deepEqual(
    [...new Set(CALORIE_FILL_RANDOM_SCENARIOS.map((item) => item.foodIds.length))].sort(),
    [1, 2, 3, 4, 5, 6]
  );
  const targetCalories = CALORIE_FILL_RANDOM_SCENARIOS.map((item) => item.target.kcal);
  assert.equal(Math.min(...targetCalories), 200);
  assert.equal(Math.max(...targetCalories), 1500);
  assert.ok(CALORIE_FILL_RANDOM_SCENARIOS.some((item) => item.target.proteina === 0));
  assert.ok(CALORIE_FILL_RANDOM_SCENARIOS.some((item) => item.fixedId));
  assert.ok(CALORIE_FILL_RANDOM_SCENARIOS.some((item) => item.registeredId));
  assert.ok(CALORIE_FILL_RANDOM_SCENARIOS.some((item) => item.combinationKind === "absurda"));
  assert.ok(CALORIE_FILL_RANDOM_SCENARIOS.some((item) => item.combinationKind === "apropiada"));
  assert.ok(CALORIE_FILL_RANDOM_SCENARIOS.some((item) => item.combinationKind === "incompleta"));
});

test("145 escenarios cumplen techo, granularidad, determinismo, contratos y rendimiento", async () => {
  const result = await matrix();
  assert.deepEqual(result.summary.fixed, {
    executed: 45,
    pass: result.summary.fixed.pass,
    passWithInformation: result.summary.fixed.passWithInformation,
    fail: 0,
  });
  assert.deepEqual(result.summary.random, {
    executed: 100,
    pass: result.summary.random.pass,
    passWithInformation: result.summary.random.passWithInformation,
    fail: 0,
  });
  assert.equal(result.summary.total.executed, 145);
  assert.equal(result.summary.total.fail, 0);
  assert.equal(result.summary.totalsClose, true);
  assert.deepEqual(result.summary.ceilingViolations, []);
  assert.deepEqual(result.summary.dominatedCandidates, []);
  assert.deepEqual(result.summary.deterministicFailures, []);
  assert.deepEqual(result.summary.over100ms, []);
  assert.equal(result.summary.isolation.genericCannotActivateCalorieFill, true);
  assert.equal(result.summary.isolation.constrainedKeepsHistoricalPolicy, true);
  assert.equal(result.detailed.length, 20);
});

test("los casos funcionales prioritarios llegan a kcal y reservan warnings para límites reales", async () => {
  const result = await matrix();
  const byId = new Map(result.fixed.map((item) => [item.id, item]));
  const single903 = byId.get("CF001");
  const real903 = byId.get("CF002");
  const single1200 = byId.get("CF003");
  const complete = byId.get("CF005");
  const discrete = byId.get("CF009");
  const fixed = byId.get("CF010");
  const registered = byId.get("CF011");
  const six = byId.get("CF012");
  const invalid = byId.get("CF013");
  const proteinZero = byId.get("CF014");

  for (const record of [single903, real903, single1200, complete, fixed, registered, six]) {
    assert.ok(record.result.calorieDeficit <= 2, `${record.id}: déficit ${record.result.calorieDeficit}`);
    assert.equal(record.checks.exactCeiling, true);
  }
  assert.ok(single903.foods[0].quantity > single903.foods[0].recomendado.max);
  assert.ok(real903.foods.some((food) => food.quantity > food.recomendado.max));
  assert.ok(single1200.foods[0].quantity > single1200.foods[0].recomendado.max);
  assert.ok(Math.abs(complete.result.diff.proteina) <= 1);
  assert.ok(Math.abs(complete.result.diff.carbohidratos) <= 1);
  assert.ok(Math.abs(complete.result.diff.grasas) <= 1);
  assert.deepEqual(complete.warnings, []);
  assert.equal(discrete.foods[0].quantity, 7);
  assert.equal(discrete.optimization.discreteLimited, true);
  assert.equal(fixed.foods.find((food) => food.role === "Fijo").quantity, 200);
  assert.equal(registered.foods.find((food) => food.role === "Registrado").quantity, 100);
  assert.equal(six.optimization.allSelectedFoodsUsed, true);
  assert.equal(invalid.optimization.invalidFoods.length, 1);
  assert.equal(invalid.checks.expectedInvalidHandled, true);
  assert.equal(proteinZero.target.proteina, 0);
  assert.ok(proteinZero.information.includes("P=0 tratado como neutral"));
});

