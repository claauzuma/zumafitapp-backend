import assert from "node:assert/strict";
import test from "node:test";

import {
  generateRandomBlueprints,
  MATRIX_SEED,
  runTrackingAdversarialMatrix,
} from "./support/trackingAdversarialMatrix.js";

test("matriz adversarial Tracking: 54 fijos, 100 random y 6 diagnosticos sin dominancia", async () => {
  const originalLog = console.log;
  console.log = () => {};
  let report;
  try {
    report = await runTrackingAdversarialMatrix();
  } finally {
    console.log = originalLog;
  }
  const requested = [...report.fixed, ...report.random];
  const all = [...requested, ...report.diagnostic];

  assert.equal(report.metadata.seed, MATRIX_SEED);
  assert.equal(report.metadata.engineRunsPerScenario, 2);
  assert.equal(report.fixed.length, 54);
  assert.equal(report.random.length, 100);
  assert.equal(report.diagnostic.length, 6);
  assert.equal(all.length, 160);
  assert.deepEqual(report.summary.dominatedCases, []);
  assert.equal(report.summary.failures.length, 0);
  assert.equal(report.summary.policyIsolation.pass, true);
  assert.equal(report.summary.policyIsolation.adminOptimization, null);
  assert.equal(report.summary.policyIsolation.coachOptimization, null);

  assert.ok(all.every((row) => row.status !== "FAIL"));
  assert.ok(all.every((row) => row.properties.deterministic === true));
  assert.ok(all.every((row) => row.result.optimization.policy === report.metadata.policy));
  assert.ok(all.every((row) => (
    !row.properties.proteinReached || row.properties.proteinReachable
  )));
  assert.ok(all.every((row) => ["A", "B", "C"].includes(row.oracle.classification.code)));
  assert.ok(all.every((row) => row.timeMs < 100));

  assert.deepEqual(Object.keys(report.summary.byFoodCount).sort(), ["1", "2", "3", "4", "5", "6"]);
  assert.deepEqual(Object.keys(report.summary.byProfile).sort(), ["A", "B", "C", "D", "E", "F", "G", "H", "I"]);
  assert.ok(report.summary.byCombinationKind.apropiada > 0);
  assert.ok(report.summary.byCombinationKind.incompleta > 0);
  assert.ok(report.summary.byCombinationKind.absurda > 0);
  assert.ok(report.summary.proteinReachable > 0);
  assert.ok(report.summary.proteinUnreachable > 0);
  assert.ok(report.summary.proteinZero > 0);
  assert.ok(report.summary.maxLimited > 0);
  assert.ok(report.summary.stepLimited > 0);

  const generatedOnce = generateRandomBlueprints();
  const generatedTwice = generateRandomBlueprints();
  assert.deepEqual(generatedOnce, generatedTwice);
  assert.equal(generatedOnce.length, 100);
});
