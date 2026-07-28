import assert from "node:assert/strict";
import test from "node:test";

import {
  TRACKING_CALORIE_FILL_IMPROVEMENT_SCENARIOS,
  runTrackingCalorieFillImprovementMatrix,
} from "./support/trackingCalorieFillImprovementMatrix.js";

let matrixPromise;
function matrix() {
  matrixPromise ||= runTrackingCalorieFillImprovementMatrix();
  return matrixPromise;
}

test("la matriz de mejora cubre 30 casos, tres niveles y los alimentos solicitados", () => {
  assert.equal(TRACKING_CALORIE_FILL_IMPROVEMENT_SCENARIOS.length, 30);
  assert.deepEqual(
    Object.fromEntries(["normal", "limitado", "extremo"].map((level) => [
      level,
      TRACKING_CALORIE_FILL_IMPROVEMENT_SCENARIOS.filter((row) => row.level === level).length,
    ])),
    { normal: 10, limitado: 10, extremo: 10 }
  );
  const ids = new Set(TRACKING_CALORIE_FILL_IMPROVEMENT_SCENARIOS.flatMap((row) => row.foodIds));
  for (const required of [
    "chicken", "steak", "rice", "potato", "pasta", "bread", "almonds", "oil",
    "banana", "apple", "ham", "cheese", "egg", "alfajor", "cola",
  ]) {
    assert.equal(ids.has(required), true, `falta ${required}`);
  }
  assert.ok(new Set(
    TRACKING_CALORIE_FILL_IMPROVEMENT_SCENARIOS.map((row) => JSON.stringify(row.target))
  ).size >= 12);
  assert.deepEqual(
    [...new Set(TRACKING_CALORIE_FILL_IMPROVEMENT_SCENARIOS.map((row) => row.foodIds.length))].sort(),
    [1, 2, 3, 4, 5, 6]
  );
});

test("los 30 casos respetan techo, unidades, Fijos, determinismo y aislamiento", async () => {
  const result = await matrix();

  assert.equal(result.summary.executed, 30);
  assert.equal(result.summary.normal, 10);
  assert.equal(result.summary.limited, 10);
  assert.equal(result.summary.extreme, 10);
  assert.ok(result.summary.uniqueTargets >= 12);
  assert.ok(result.summary.comparedWithConstrained >= 10);
  assert.deepEqual(result.summary.overCeiling, []);
  assert.deepEqual(result.summary.nondeterministic, []);
  assert.deepEqual(result.summary.failures, []);
});

test("el caso de huevos y almendras corrige la propuesta anterior sin romper el Fijo", async () => {
  const result = await matrix();
  const row = result.rows.find((entry) => entry.id === "L07");
  const quantities = Object.fromEntries(row.foods.map((entry) => [entry.id, entry.quantity]));

  assert.equal(quantities.almonds, 2);
  assert.equal(Number.isInteger(quantities.egg), true);
  assert.ok(row.calorieDeficit <= 1);
  assert.equal(row.proteinReached, true);
  assert.ok(Math.abs(row.diff.proteina) <= 1);
  assert.notDeepEqual([quantities.chicken, quantities.bread, quantities.egg], [63, 75, 9]);
});

test("los casos imposibles se acercan físicamente a calorías sin fingir que cuadraron macros", async () => {
  const result = await matrix();
  for (const id of ["L01", "L02", "L03", "L05", "L10", "X02", "X03", "X10"]) {
    const row = result.rows.find((entry) => entry.id === id);
    assert.equal(row.checks.ceiling, true, id);
    assert.ok(row.warnings.some((warning) => warning.includes("macros limitados")), id);
  }
  const proteinZero = result.rows.find((entry) => entry.id === "X07");
  assert.equal(proteinZero.target.proteina, 0);
  assert.equal(proteinZero.proteinReached, true);
});
