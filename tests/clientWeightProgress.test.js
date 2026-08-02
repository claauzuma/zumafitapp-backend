import test from "node:test";
import assert from "node:assert/strict";

import { buildSelfWeightProgressPatch } from "../servicio/usuarios.js";

test("peso propio crea un unico registro estable por fecha", () => {
  const now = new Date("2026-07-30T12:00:00.000Z");
  const first = buildSelfWeightProgressPatch({ role: "cliente", progress: { checkins: [] } }, {
    date: "2026-07-30",
    weightKg: 81.2,
  }, { now });
  assert.equal(first.created, true);
  assert.equal(first.progress.checkins.length, 1);
  assert.equal(first.record.id, "self-weight:2026-07-30");

  const second = buildSelfWeightProgressPatch({ progress: first.progress, antropometriaActual: first.antropometriaActual }, {
    date: "2026-07-30",
    weightKg: 80.9,
  }, { now });
  assert.equal(second.created, false);
  assert.equal(second.progress.checkins.length, 1);
  assert.equal(second.progress.checkins[0].weightKg, 80.9);
});

test("peso propio rechaza fecha futura y valores fuera de rango", () => {
  const now = new Date("2026-07-30T12:00:00.000Z");
  assert.throws(() => buildSelfWeightProgressPatch({}, { date: "2026-07-31", weightKg: 80 }, { now }), /PROGRESS_DATE_INVALID/);
  assert.throws(() => buildSelfWeightProgressPatch({}, { date: "2026-07-30", weightKg: 5 }, { now }), /PROGRESS_WEIGHT_INVALID/);
});
