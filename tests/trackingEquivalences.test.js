import assert from "node:assert/strict";
import test from "node:test";

import {
  equivalentApprovalRequired,
  equivalentNotificationVisibility,
  equivalentReview,
  filterEquivalentCandidateFoods,
  isEquivalentFoodAllowed,
  normalizeEquivalentTrackingSettings,
} from "../servicio/trackingEquivalences.js";

const food = (overrides = {}) => ({
  id: overrides.id || "food-1",
  nombre: overrides.nombre || "Arroz integral",
  unidad: overrides.unidad || "g",
  kcal: overrides.kcal ?? 3.4,
  proteina: overrides.proteina ?? 0.08,
  carbs: overrides.carbs ?? 0.75,
  grasas: overrides.grasas ?? 0.01,
  activo: overrides.activo ?? true,
  ...overrides,
});

test("defaults de equivalencias: digest semanal, importantes inmediatos y uso inmediato", () => {
  assert.deepEqual(normalizeEquivalentTrackingSettings({}), {
    equivalentNotificationMode: "weekly_digest",
    equivalentNotifyImportantImmediately: true,
    equivalentApprovalMode: "immediate",
  });
  assert.equal(equivalentApprovalRequired({ coach: { entrenadorId: "coach-1" } }), false);
});

test("required y el alias legacy pending_review exigen aprobacion solo con coach", () => {
  const withCoach = (mode) => ({
    coach: { entrenadorId: "coach-1" },
    clientPermissions: { tracking: { equivalentApprovalMode: mode } },
  });
  assert.equal(equivalentApprovalRequired(withCoach("required")), true);
  assert.equal(equivalentApprovalRequired(withCoach("pending_review")), true);
  assert.equal(equivalentApprovalRequired({ clientPermissions: { tracking: { equivalentApprovalMode: "required" } } }), false);
});

test("filtra por ID, estado, restricciones semanticas, rechazados, duplicados y homonimos", () => {
  const user = {
    menu: { restrictions: { allergies: ["mani"], excludedFoods: ["forbidden-id"] } },
    clientPermissions: { tracking: { forbiddenFoodIds: ["coach-blocked"] } },
  };
  const candidates = [
    food({ id: "rice-a", nombre: "Arroz integral" }),
    food({ id: "rice-b", nombre: "Arroz integral" }),
    food({ id: "peanut", nombre: "Manteca de mani" }),
    food({ id: "forbidden-id", nombre: "Banana" }),
    food({ id: "coach-blocked", nombre: "Aceite" }),
    food({ id: "disabled", nombre: "Pollo", activo: false }),
    food({ id: "rejected", nombre: "Palta" }),
    food({ id: "selected", nombre: "Queso" }),
    food({ id: "valid", nombre: "Huevo", unidad: "unidad", kcal: 70 }),
  ];
  const result = filterEquivalentCandidateFoods(user, candidates, {
    rejectedFoodIds: ["rejected"],
    selectedFoodIds: ["selected"],
  });
  assert.deepEqual(result.map((item) => item.id), ["rice-a", "valid"]);
  assert.equal(isEquivalentFoodAllowed(user, food({ id: "no-id", nombre: "", kcal: 0 })), false);
});

test("la revision reserva alertas fuertes para desvios materiales y cantidades extremas", () => {
  const normal = equivalentReview({
    target: { kcal: 600, proteina: 45, carbs: 70, grasas: 16 },
    resultTotals: { kcal: 598, proteina: 44, carbs: 69, grasas: 17 },
    foods: [{ quantity: 180, unit: "g" }],
  });
  assert.equal(normal.important, false);

  const material = equivalentReview({
    target: { kcal: 600, proteina: 50, carbs: 70, grasas: 16 },
    resultTotals: { kcal: 490, proteina: 30, carbs: 35, grasas: 30 },
    foods: [{ quantity: 22, unit: "unidad" }],
    acceptedWarnings: ["macro_gap"],
  });
  assert.equal(material.important, true);
  assert.ok(material.reasons.includes("material_calorie_gap"));
  assert.ok(material.reasons.includes("material_protein_gap"));
  assert.ok(material.reasons.includes("extreme_quantity"));
});

test("notificaciones separan actividad, aviso inmediato y digest", () => {
  const digestUser = { clientPermissions: { tracking: { equivalentNotificationMode: "weekly_digest" } } };
  assert.deepEqual(
    equivalentNotificationVisibility(digestUser, "client_equivalent_created", { important: false }),
    { visible: false, digest: true, immediate: false }
  );
  assert.deepEqual(
    equivalentNotificationVisibility(digestUser, "client_equivalent_needs_attention", { important: true }),
    { visible: true, digest: true, immediate: true }
  );
  const none = { clientPermissions: { tracking: { equivalentNotificationMode: "none" } } };
  assert.deepEqual(
    equivalentNotificationVisibility(none, "client_equivalent_consumed", { important: true }),
    { visible: false, digest: false, immediate: false }
  );
});
