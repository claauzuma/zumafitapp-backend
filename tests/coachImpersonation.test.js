import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";

import ServicioUsuarios from "../servicio/usuarios.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { denyWriteWhenReadOnlyImpersonation } from "../middleware/denyWriteWhenReadOnlyImpersonation.js";

test("coach sólo puede abrir vista read-only de un cliente propio activo", async () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "coach-impersonation-test-secret";
  try {
    const service = new ServicioUsuarios();
    const coach = { _id: "coach-1", role: "coach", email: "coach@example.com" };
    const client = { _id: "client-1", role: "cliente", email: "client@example.com", coach: { entrenadorId: "coach-1" }, coachAccess: { status: "active" } };
    service._getCoachClientPair = async () => ({ coach, client });
    service._withEffectiveCapabilities = async (value) => value;
    service.impersonationAuditModel = { record: async () => ({ ok: true }) };

    const result = await service.coachStartClientImpersonation({ coachId: coach._id, clientId: client._id });
    const payload = jwt.verify(result.token, process.env.JWT_SECRET);
    assert.equal(result.actorRole, "coach");
    assert.equal(payload.impersonation, true);
    assert.equal(payload.readOnly, true);
    assert.equal(payload.actorCoachId, "coach-1");

    service._getCoachClientPair = async () => ({ coach, client: { ...client, coach: { entrenadorId: "coach-2" } } });
    await assert.rejects(service.coachStartClientImpersonation({ coachId: coach._id, clientId: client._id }), /CLIENT_NOT_ASSIGNED_TO_COACH/);

    service._getCoachClientPair = async () => ({
      coach,
      client: { ...client, coachAccess: { status: "ended", active: false } },
    });
    await assert.rejects(service.coachStartClientImpersonation({ coachId: coach._id, clientId: client._id }), /CLIENT_NOT_ASSIGNED_TO_COACH/);
  } finally {
    process.env.JWT_SECRET = previousSecret;
  }
});

test("middleware bloquea mutaciones durante vista como cliente y permite lecturas", () => {
  let nextCalls = 0;
  const response = { statusCode: 0, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  denyWriteWhenReadOnlyImpersonation({ method: "PATCH", user: { impersonation: true, readOnly: true } }, response, () => { nextCalls += 1; });
  assert.equal(response.statusCode, 403);
  assert.equal(response.body.readOnly, true);
  assert.equal(nextCalls, 0);
  denyWriteWhenReadOnlyImpersonation({ method: "GET", user: { impersonation: true, readOnly: true } }, response, () => { nextCalls += 1; });
  assert.equal(nextCalls, 1);
});

test("auth bloquea globalmente una mutacion aunque la ruta olvide el guard especifico", () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "coach-impersonation-global-guard";
  try {
    const token = jwt.sign({
      uid: "client-1",
      role: "cliente",
      impersonation: true,
      readOnly: true,
      actorRole: "coach",
      actorCoachId: "coach-1",
    }, process.env.JWT_SECRET);
    let nextCalls = 0;
    const response = { statusCode: 0, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    authMiddleware({
      method: "POST",
      originalUrl: "/api/tracking/day/meals",
      headers: { authorization: `Bearer ${token}` },
      cookies: {},
    }, response, () => { nextCalls += 1; });
    assert.equal(response.statusCode, 403);
    assert.equal(response.body.readOnly, true);
    assert.equal(nextCalls, 0);

    const bypassResponse = { statusCode: 0, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    authMiddleware({
      method: "POST",
      originalUrl: "/api/tracking/day/meals?next=/impersonation/stop",
      headers: { authorization: `Bearer ${token}` },
      cookies: {},
    }, bypassResponse, () => { nextCalls += 1; });
    assert.equal(bypassResponse.statusCode, 403);
    assert.equal(nextCalls, 0);

    authMiddleware({
      method: "POST",
      originalUrl: "/api/usuarios/admin/impersonation/stop",
      headers: { authorization: `Bearer ${token}` },
      cookies: {},
    }, bypassResponse, () => { nextCalls += 1; });
    assert.equal(nextCalls, 1);
  } finally {
    process.env.JWT_SECRET = previousSecret;
  }
});
