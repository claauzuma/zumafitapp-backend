import assert from "node:assert/strict";
import test from "node:test";

import {
  assessMealCompositionDiversity,
  compareMealCompositionDiversity,
  mealCompositionOverlap,
  normalizeMealComposition,
  normalizeMealDiversityContext,
} from "../servicio/mealCompositionDiversity.js";

test("la huella semántica ignora cantidad, unidad y orden, pero conserva roles", () => {
  const first = normalizeMealComposition({ foods: [
    { foodId: "pollo", quantity: 120, unit: "g", role: "P1" },
    { foodId: "arroz", quantity: 80, unit: "g", role: "C1" },
  ] });
  const same = normalizeMealComposition({ foods: [
    { foodId: "arroz", quantity: 140, unit: "g", role: "C1" },
    { foodId: "pollo", quantity: 180, unit: "g", role: "P1" },
  ] });

  assert.equal(first.fingerprint, same.fingerprint);
  assert.equal(first.roleFingerprint, same.roleFingerprint);
  assert.deepEqual(first.foodIds, ["arroz", "pollo"]);
});

test("un contexto serializado conserva foodId y rol al normalizarse otra vez", () => {
  const original = normalizeMealComposition({
    foodIds: ["pollo", "arroz"],
    roleAssignments: { pollo: "P1", arroz: "C1" },
  });
  const context = normalizeMealDiversityContext({ previousMeals: [original] });
  assert.equal(context.previousMeals[0].fingerprint, "arroz|pollo");
  assert.equal(context.previousMeals[0].roleFingerprint, "arroz:C1|pollo:P1");
});

test("clasifica repetición exacta, solapamiento alto y composición distinta", () => {
  const exact = mealCompositionOverlap(
    { foodIds: ["pollo", "arroz", "aceite"] },
    { foodIds: ["aceite", "pollo", "arroz"] },
  );
  const high = mealCompositionOverlap(
    { foodIds: ["pollo", "arroz", "aceite", "tomate"] },
    { foodIds: ["pollo", "arroz", "tomate"] },
  );
  const distinct = mealCompositionOverlap(
    { foodIds: ["pollo", "arroz"] },
    { foodIds: ["huevo", "avena"] },
  );

  assert.equal(exact.exact, true);
  assert.equal(high.exact, false);
  assert.equal(high.highOverlap, true);
  assert.equal(high.jaccard, 0.75);
  assert.equal(high.containment, 1);
  assert.equal(distinct.highOverlap, false);
});

test("el comparador prefiere sin repetición exacta, luego menor solapamiento", () => {
  const context = { previousMeals: [{ foodIds: ["pollo", "arroz", "aceite"] }] };
  const exact = assessMealCompositionDiversity({ foodIds: ["pollo", "arroz", "aceite"] }, context);
  const partial = assessMealCompositionDiversity({ foodIds: ["pollo", "arroz", "tomate"] }, context);
  const distinct = assessMealCompositionDiversity({ foodIds: ["huevo", "avena"] }, context);

  assert.ok(compareMealCompositionDiversity(distinct, partial) < 0);
  assert.ok(compareMealCompositionDiversity(partial, exact) < 0);
});
