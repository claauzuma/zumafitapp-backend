import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import CnxMongoDB from "../model/DBMongo.js";
import ModelMongoDBCoachClientCapacity from "../model/DAO/coachClientCapacityMongoDB.js";

const runId = `codex_capacity_${Date.now()}_${Math.random().toString(16).slice(2)}`;
const coachId = `${runId}_coach`;
const capacityModel = new ModelMongoDBCoachClientCapacity();

before(async () => {
  await CnxMongoDB.conectar();
  if (!CnxMongoDB.connection) {
    throw new Error("MongoDB no esta disponible para la prueba de integracion");
  }
  await capacityModel.ensureIndexes();
});

after(async () => {
  if (CnxMongoDB.connection) {
    await CnxMongoDB.db.collection("coach_client_capacity").deleteMany({ coachId });
    await CnxMongoDB.desconectar();
  }
});

test("reserva cupo de coach de forma atomica ante activaciones simultaneas", async () => {
  const [first, second] = await Promise.all([
    capacityModel.reserveSlot({
      coachId,
      invitationId: `${runId}_invite_1`,
      clientId: `${runId}_client_1`,
      limit: 1,
      activeCount: 0,
    }),
    capacityModel.reserveSlot({
      coachId,
      invitationId: `${runId}_invite_2`,
      clientId: `${runId}_client_2`,
      limit: 1,
      activeCount: 0,
    }),
  ]);

  const results = [first.reserved, second.reserved].sort();
  assert.deepEqual(results, [false, true]);

  const doc = await capacityModel.getByCoachId(coachId);
  assert.equal(doc.used, 1);
  assert.equal(doc.limit, 1);
  assert.equal(doc.reservations.length, 1);

  const reserved = first.reserved ? first : second;
  const reservedIndex = first.reserved ? 1 : 2;
  assert.equal(reserved.used, 1);

  const release = await capacityModel.releaseSlot({
    coachId,
    invitationId: `${runId}_invite_${reservedIndex}`,
    clientId: `${runId}_client_${reservedIndex}`,
  });
  assert.equal(release.released, true);
  assert.equal(release.used, 0);

  const secondRelease = await capacityModel.releaseSlot({
    coachId,
    invitationId: `${runId}_invite_${reservedIndex}`,
    clientId: `${runId}_client_${reservedIndex}`,
  });
  assert.equal(secondRelease.released, false);

  const finalDoc = await capacityModel.getByCoachId(coachId);
  assert.equal(finalDoc.used, 0);
  assert.deepEqual(finalDoc.reservations, []);
});
