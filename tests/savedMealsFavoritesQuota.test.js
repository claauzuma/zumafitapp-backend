import assert from "node:assert/strict";
import test from "node:test";

import ServicioComidasGuardadas from "../servicio/comidasGuardadas.js";

const FREE_CLIENT = {
  _id: "64b000000000000000000091",
  role: "cliente",
  personalPlan: "free",
};

test("crear una comida ya favorita respeta el cupo antes de insertar", async () => {
  const service = new ServicioComidasGuardadas();
  let inserted = false;

  service._actor = async () => FREE_CLIENT;
  service.model.count = async ({ query = {} } = {}) => (
    query.favorita === true ? 3 : 1
  );
  service.model.create = async () => {
    inserted = true;
    return {};
  };

  await assert.rejects(
    service.create(FREE_CLIENT, {
      nombre: "Desayuno habitual",
      favorita: true,
      items: [{ nombre: "Arroz", cantidad: 100, unidad: "g", kcal: 340 }],
    }),
    (error) => (
      error.code === "PLAN_LIMIT_REACHED"
      && error.resource === "favorites"
      && error.current === 3
      && error.limit === 3
    )
  );

  assert.equal(inserted, false);
});

test("crear una comida no favorita no consume el cupo de favoritas", async () => {
  const service = new ServicioComidasGuardadas();
  let favoriteCountReads = 0;

  service._actor = async () => FREE_CLIENT;
  service.model.count = async ({ query = {} } = {}) => {
    if (query.favorita === true) favoriteCountReads += 1;
    return 1;
  };
  service._snapshotItem = async (item) => ({
    nombre: item.nombre,
    nombreSnapshot: item.nombre,
    cantidad: item.cantidad,
    unidad: item.unidad,
    kcal: item.kcal,
    proteina: 0,
    proteinas: 0,
    carbs: 0,
    carbohidratos: 0,
    grasas: 0,
    fibra: 0,
  });
  service.model.create = async (doc) => ({ ...doc, _id: "64b000000000000000000092" });

  const created = await service.create(FREE_CLIENT, {
    nombre: "Arroz simple",
    favorita: false,
    items: [{ nombre: "Arroz", cantidad: 100, unidad: "g", kcal: 340 }],
  });

  assert.equal(created.nombre, "Arroz simple");
  assert.equal(created.favorita, false);
  assert.equal(favoriteCountReads, 0);
});

test("Picoteo conserva su tipo y al usarlo vuelve al destino Picoteo", async () => {
  const service = new ServicioComidasGuardadas();
  let stored = null;
  let trackingPayload = null;

  service._actor = async () => FREE_CLIENT;
  service.model.count = async () => 0;
  service._snapshotItem = async (item) => ({
    nombre: item.nombre,
    nombreSnapshot: item.nombre,
    cantidad: item.cantidad,
    unidad: item.unidad,
    kcal: item.kcal,
    proteina: 0,
    proteinas: 0,
    carbs: 20,
    carbohidratos: 20,
    grasas: 0,
    fibra: 0,
  });
  service.model.create = async (doc) => {
    stored = { ...doc, _id: "64b000000000000000000093" };
    return stored;
  };

  const created = await service.create(FREE_CLIENT, {
    nombre: "Picoteo habitual",
    tipoComida: "picoteo",
    items: [{ nombre: "Banana", cantidad: 100, unidad: "g", kcal: 90 }],
  });

  service.model.getById = async () => stored;
  service.foodLogs.addSnapshotLogs = async (_actor, payload) => {
    trackingPayload = payload;
    return { date: payload.date, meals: { picoteo: payload.items } };
  };
  await service.addToTracking(FREE_CLIENT, created.id, { date: "2026-10-16" });

  assert.equal(created.tipoComida, "picoteo");
  assert.equal(trackingPayload.mealType, "snack");
  assert.equal(trackingPayload.mealId, "picoteo");
});
