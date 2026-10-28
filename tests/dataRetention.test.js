import assert from "node:assert/strict";
import test from "node:test";
import { BSON } from "mongodb";

import {
  accessAuditExpiresAt,
  accessAuditRetentionDays,
  impersonationAuditExpiresAt,
} from "../utils/dataRetention.js";
import {
  expandFavoriteStorageDocument,
  packFavoriteStorageFields,
} from "../model/DAO/clientDayFavoritesMongoDB.js";

test("las auditorias comunes vencen a 180 dias y las sensibles a 365", () => {
  const createdAt = new Date("2026-01-01T00:00:00.000Z");
  assert.equal(accessAuditRetentionDays("self_weight_updated"), 180);
  assert.equal(accessAuditRetentionDays("coach_subscription_approved"), 365);
  assert.equal(
    accessAuditExpiresAt("self_weight_updated", createdAt).toISOString(),
    "2026-06-30T00:00:00.000Z"
  );
  assert.equal(
    accessAuditExpiresAt("coach_subscription_approved", createdAt).toISOString(),
    "2027-01-01T00:00:00.000Z"
  );
  assert.equal(impersonationAuditExpiresAt(createdAt).toISOString(), "2027-01-01T00:00:00.000Z");
});

function favoriteFixture() {
  const physicalMeals = Array.from({ length: 5 }, (_, mealIndex) => ({
    id: `meal-${mealIndex}`,
    nombre: `Comida ${mealIndex}`,
    tipoComida: "almuerzo",
    order: mealIndex,
    compositionOrigin: "manual",
    totals: { kcal: 600, proteina: 40, carbs: 65, grasas: 18 },
    items: Array.from({ length: 3 }, (_, itemIndex) => ({
      id: `food-${itemIndex}`,
      alimentoId: `food-${itemIndex}`,
      nombreSnapshot: `Alimento ${itemIndex}`,
      cantidad: 150,
      unidad: "g",
      kcal: 200,
      proteina: 13.3,
      carbs: 21.7,
      grasas: 6,
      imagenUrl: `https://cdn.example.test/alimentos/${itemIndex}.webp`,
      quantityMode: "manual",
    })),
  }));
  return {
    dailyTarget: { kcal: 3000, proteina: 200, carbs: 325, grasas: 90 },
    plannedTotals: { kcal: 3000, proteina: 200, carbs: 325, grasas: 90 },
    physicalMeals,
    targetMeals: [{
      id: "target-1",
      name: "Cena",
      type: "cena",
      order: 0,
      target: { kcal: 700, proteina: 45, carbs: 75, grasas: 20 },
      targetOrigin: "manual",
    }],
  };
}

test("el formato compacto de favoritos conserva el contrato y reduce BSON", () => {
  const legacy = favoriteFixture();
  const packed = packFavoriteStorageFields(legacy);
  const expanded = expandFavoriteStorageDocument(packed);

  assert.deepEqual(expanded.dailyTarget, legacy.dailyTarget);
  assert.deepEqual(expanded.plannedTotals, legacy.plannedTotals);
  assert.deepEqual(expanded.physicalMeals, legacy.physicalMeals);
  assert.deepEqual(expanded.targetMeals, legacy.targetMeals);
  assert.ok(BSON.calculateObjectSize(packed) < BSON.calculateObjectSize(legacy) * 0.7);
});

test("un favorito v2 parcial conserva campos legacy todavía no migrados", () => {
  const document = {
    favoriteStorageVersion: 2,
    pt: [1200, 80, 130, 35],
    dailyTarget: { kcal: 2000, proteina: 130, carbs: 220, grasas: 60 },
    physicalMeals: [{ id: "legacy" }],
  };
  const expanded = expandFavoriteStorageDocument(document);
  assert.equal(expanded.plannedTotals.kcal, 1200);
  assert.equal(expanded.dailyTarget.kcal, 2000);
  assert.equal(expanded.physicalMeals[0].id, "legacy");
});
