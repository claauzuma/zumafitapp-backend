import test from "node:test";
import assert from "node:assert/strict";

import { resolveUnrestrictedTarget } from "../servicio/unrestrictedWeeklyBalance.js";

const base = { kcal: 2200, proteina: 170, carbs: 280, grasas: 65 };

test("carries calorie deficit to the following day", () => {
  const result = resolveUnrestrictedTarget({
    date: "2026-10-13",
    baseTarget: base,
    consumptionByDate: { "2026-10-12": { tracked: true, kcal: 2000, proteina: 160 } },
  });
  assert.equal(result.objective.kcal, 2400);
  assert.equal(result.objective.proteina, 170);
  assert.equal(result.balance.calorieCarry, 200);
});

test("subtracts a calorie surplus and resets at Monday", () => {
  const sunday = resolveUnrestrictedTarget({
    date: "2026-10-18",
    baseTarget: base,
    consumptionByDate: {
      "2026-10-12": { tracked: true, kcal: 2400, proteina: 180 },
      "2026-10-13": { tracked: true, kcal: 2300, proteina: 170 },
    },
  });
  assert.equal(sunday.objective.kcal, 1900);
  assert.equal(sunday.balance.isClosingDay, true);

  const monday = resolveUnrestrictedTarget({
    date: "2026-10-19",
    baseTarget: base,
    consumptionByDate: { "2026-10-18": { tracked: true, kcal: 1000, proteina: 20 } },
  });
  assert.equal(monday.objective.kcal, 2200);
  assert.equal(monday.objective.proteina, 170);
});

test("protein never carries between days", () => {
  const result = resolveUnrestrictedTarget({
    date: "2026-10-15",
    baseTarget: base,
    consumptionByDate: {
      "2026-10-12": { tracked: true, kcal: 2200, proteina: 100 },
      "2026-10-13": { tracked: true, kcal: 2200, proteina: 150 },
      "2026-10-14": { tracked: true, kcal: 2200, proteina: 180 },
    },
  });
  assert.equal(result.objective.proteina, 170);
  assert.equal(result.balance.proteinCarry, 0);
  assert.equal(result.balance.proteinWindowDays, 0);
});

test("does not invent debt for untracked days", () => {
  const result = resolveUnrestrictedTarget({
    date: "2026-10-14",
    baseTarget: base,
    consumptionByDate: {
      "2026-10-12": { tracked: false, kcal: 0, proteina: 0 },
      "2026-10-13": { tracked: true, kcal: 2100, proteina: 170 },
    },
  });
  assert.equal(result.objective.kcal, 2300);
  assert.equal(result.balance.trackedDays, 1);
});

test("does not close the current day early when previewing tomorrow", () => {
  const result = resolveUnrestrictedTarget({
    date: "2026-10-14",
    closedBeforeDate: "2026-10-13",
    baseTarget: base,
    consumptionByDate: {
      "2026-10-12": { tracked: true, kcal: 2100, proteina: 160 },
      "2026-10-13": { tracked: true, kcal: 800, proteina: 60 },
    },
  });
  assert.equal(result.objective.kcal, 2300);
  assert.equal(result.objective.proteina, 170);
  assert.equal(result.balance.trackedDays, 1);
});

test("uses each day's configured base while carrying into a different target", () => {
  const result = resolveUnrestrictedTarget({
    date: "2026-10-14",
    baseTarget: { kcal: 2500, proteina: 180, carbs: 320, grasas: 65 },
    baseTargetByDate: {
      "2026-10-12": { kcal: 2000, proteina: 150 },
      "2026-10-13": { kcal: 2300, proteina: 170 },
    },
    consumptionByDate: {
      "2026-10-12": { tracked: true, kcal: 1800, proteina: 140 },
      "2026-10-13": { tracked: true, kcal: 2400, proteina: 180 },
    },
  });
  assert.equal(result.objective.kcal, 2600);
  assert.equal(result.objective.proteina, 180);
  assert.equal(result.balance.calorieCarry, 100);
  assert.equal(result.balance.proteinCarry, 0);
});
