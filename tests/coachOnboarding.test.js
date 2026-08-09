import assert from "node:assert/strict";
import test from "node:test";

import ServicioUsuarios from "../servicio/usuarios.js";

function pair(overrides = {}) {
  return {
    coach: { _id: "coach-1", role: "coach", professionalScopes: { nutrition: true } },
    client: {
      _id: "client-1",
      role: "cliente",
      profile: {
        basics: {
          fechaNacimiento: "1990-08-10",
          genero: "masculino",
          actividadDiaria: "moderado",
          frecuenciaEjercicio: "1_3",
          factorActividad: 1.55,
        },
      },
      antropometriaActual: { pesoKg: 80, alturaCm: 180 },
      goal: { type: "mantener_peso" },
      onboarding: { enabled: true, done: false, step: 1 },
      ...overrides,
    },
  };
}

test("cliente, onboarding y coach consumen la misma calculadora central", async () => {
  const service = new ServicioUsuarios();
  const current = pair();
  service.getById = async () => current.client;
  service._getCoachClientPair = async () => current;
  service._assertNutritionEditAllowed = () => {};

  const clientResult = await service.clientPreviewNutrition({ userId: "client-1" });
  const coachResult = await service.coachPreviewClientNutrition({ coachId: "coach-1", clientId: "client-1" });
  assert.deepEqual(clientResult.preview, coachResult.preview);
  assert.equal(clientResult.preview.ready, true);
  assert.equal(clientResult.preview.maintenanceKcal, 2775);
});

test("coach recibe faltantes reales y no completa onboarding con datos inventados", async () => {
  const service = new ServicioUsuarios();
  const current = pair({ profile: { basics: {} }, antropometriaActual: {}, goal: {} });
  service._getCoachClientPair = async () => current;
  service._assertNutritionEditAllowed = () => {};

  const preview = await service.coachPreviewClientNutrition({ coachId: "coach-1", clientId: "client-1" });
  assert.equal(preview.preview.ready, false);
  assert.ok(preview.preview.missingFields.includes("peso"));
  assert.ok(preview.preview.missingFields.includes("objetivo"));
  await assert.rejects(
    service.coachUpdateClientOnboarding({ coachId: "coach-1", clientId: "client-1", payload: { complete: true } }),
    /ONBOARDING_DATA_INCOMPLETE/
  );
});

test("coach debe confirmar antes de sobrescribir datos existentes", async () => {
  const service = new ServicioUsuarios();
  const current = pair();
  service._getCoachClientPair = async () => current;
  service._assertNutritionEditAllowed = () => {};

  await assert.rejects(
    service.coachUpdateClientOnboarding({
      coachId: "coach-1",
      clientId: "client-1",
      payload: { onboarding: { pesoKg: 82 } },
    }),
    (error) => error?.message === "ONBOARDING_CONFIRMATION_REQUIRED" && error.changedFields.includes("peso")
  );
});
