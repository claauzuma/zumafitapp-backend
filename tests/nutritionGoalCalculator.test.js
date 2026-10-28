import assert from "node:assert/strict";
import test from "node:test";

import {
  ageFromBirthDate,
  calculateActivityFactor,
  calculateGoalProjection,
  calculateMaintenancePreview,
  calculateNutritionGoalPreview,
} from "../servicio/nutritionGoalCalculator.js";

test("edad y factor de actividad son deterministas", () => {
  assert.equal(ageFromBirthDate("1990-08-10", new Date("2026-08-09T12:00:00Z")), 35);
  assert.equal(calculateActivityFactor({ activity: "moderado", exerciseFrequency: "1_3" }), 1.55);
  assert.equal(calculateActivityFactor({ factor: 1.72, activity: "sedentario" }), 1.72);
});

test("calculadora produce vista previa sin guardar ni inventar datos", () => {
  const preview = calculateNutritionGoalPreview({
    birthDate: "1990-08-10",
    sex: "masculino",
    weightKg: 80,
    heightCm: 180,
    activityFactor: 1.55,
    goalType: "mantener_peso",
  }, { now: new Date("2026-08-09T12:00:00Z") });
  assert.equal(preview.ready, true);
  assert.deepEqual(preview.target, { kcal: 2829, macros: { p: 128, c: 435, g: 64 } });
  assert.equal(preview.formula, "Harris-Benedict revisada");
  assert.equal(preview.bmr.average, 1825);
  assert.equal(preview.bmr.selected, "harris_benedict_revised");
  assert.equal(preview.maintenanceKcal, 2829);
});

test("onboarding reutiliza el mismo mantenimiento sin inventar un objetivo", () => {
  const preview = calculateMaintenancePreview({
    birthDate: "1990-08-10",
    sex: "masculino",
    weightKg: 80,
    heightCm: 180,
    activityFactor: 1.55,
  }, { now: new Date("2026-08-09T12:00:00Z") });
  assert.equal(preview.ready, true);
  assert.equal(preview.maintenanceKcal, 2829);
  assert.equal(preview.bmr.average, 1825);
  assert.equal(Object.hasOwn(preview.usedData, "goalType"), false);
});

test("un TDEE manual explicito se respeta y conserva el estimado para auditoria", () => {
  const preview = calculateNutritionGoalPreview({
    age: 35,
    sex: "masculino",
    weightKg: 80,
    heightCm: 180,
    activityFactor: 1.55,
    maintenanceKcalOverride: 2500,
    goalType: "mantener_peso",
  });
  assert.equal(preview.ready, true);
  assert.equal(preview.maintenanceKcal, 2500);
  assert.equal(preview.estimatedMaintenanceKcal, 2829);
  assert.equal(preview.maintenanceSource, "explicit_override");
  assert.equal(preview.target.kcal, 2500);
});

test("objetivos de pérdida y ganancia aplican el ajuste explícito", () => {
  const base = { age: 30, sex: "femenino", weightKg: 65, heightCm: 165, activityFactor: 1.45 };
  const lose = calculateNutritionGoalPreview({ ...base, goalType: "perder_peso" });
  const gain = calculateNutritionGoalPreview({ ...base, goalType: "ganar_peso" });
  assert.equal(lose.adjustment.percent, -15);
  assert.equal(gain.adjustment.percent, 10);
  assert.ok(lose.target.kcal < gain.target.kcal);
});

test("onboarding usa la misma proyección server-side para ritmo y fecha", () => {
  const now = new Date("2026-08-09T12:00:00Z");
  const projection = calculateGoalProjection({
    maintenanceKcal: 2829,
    weightKg: 80,
    targetWeightKg: 72,
    ratePctBWPerWeek: 0.5,
    goalType: "perder_peso",
  }, { now });
  assert.deepEqual(projection, {
    mode: "lose",
    targetKcal: 2389,
    ratePctBWPerWeek: 0.5,
    kgPerWeek: 0.4,
    dailyEnergyChange: 440,
    endDate: "2026-12-27",
    adjustmentRatio: -440 / 2829,
  });
  const preview = calculateNutritionGoalPreview({
    age: 35,
    sex: "masculino",
    weightKg: 80,
    heightCm: 180,
    activityFactor: 1.55,
    goalType: "perder_peso",
    targetWeightKg: 72,
    ratePctBWPerWeek: 0.5,
  }, { now });
  assert.equal(preview.target.kcal, projection.targetKcal);
  assert.equal(preview.projection.endDate, projection.endDate);
});

test("datos incompletos enumeran faltantes y no generan una meta", () => {
  const preview = calculateNutritionGoalPreview({ weightKg: 80 });
  assert.equal(preview.ready, false);
  assert.ok(preview.missingFields.includes("sexo"));
  assert.ok(preview.missingFields.includes("factor de actividad"));
  assert.equal(preview.target, undefined);
});
