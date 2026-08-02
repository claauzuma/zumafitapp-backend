import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcryptjs";

import ServicioUsuarios from "../servicio/usuarios.js";

function clientUser(overrides = {}) {
  return {
    _id: "507f1f77bcf86cd799439011",
    id: "507f1f77bcf86cd799439011",
    email: "client@example.test",
    role: "cliente",
    estado: "activo",
    onboarding: { enabled: false, done: true },
    ...overrides,
  };
}

test("auth/me hidrata un cliente con una sola lectura y no espera la telemetria", async () => {
  const service = new ServicioUsuarios();
  let reads = 0;
  let touches = 0;
  let releaseTouch;
  const touchPending = new Promise((resolve) => { releaseTouch = resolve; });
  service.model = {
    obtenerPorId: async () => {
      reads += 1;
      return clientUser({ lastActivityAt: null });
    },
    touchLastActivityById: async () => {
      touches += 1;
      await touchPending;
      return clientUser({ lastActivityAt: new Date() });
    },
  };

  const result = await Promise.race([
    service.getByIdForAuth("507f1f77bcf86cd799439011"),
    new Promise((_, reject) => setTimeout(() => reject(new Error("auth fast path quedo bloqueado")), 100)),
  ]);

  assert.equal(result.id, "507f1f77bcf86cd799439011");
  assert.equal(reads, 1);
  assert.equal(touches, 0);
  await new Promise((resolve) => setTimeout(resolve, 800));
  assert.equal(touches, 1);
  service.scheduleAuthActivityTouch("507f1f77bcf86cd799439011", clientUser());
  assert.equal(touches, 1);
  releaseTouch();
});

test("Google existente emite el token sin releer al usuario ni esperar lastLogin", async () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "auth-fast-path-test-secret";
  const service = new ServicioUsuarios();
  let releaseUpdate;
  let getByIdCalls = 0;
  const updatePending = new Promise((resolve) => { releaseUpdate = resolve; });
  service.pendingModel = { findByEmail: async () => null };
  service._findUserByEmail = async () => clientUser({ googleId: "google-existing" });
  service._updateById = async () => await updatePending;
  service.getById = async () => {
    getByIdCalls += 1;
    throw new Error("Google no debe releer el usuario para emitir el token");
  };

  try {
    const result = await Promise.race([
      service.loginOrRegisterWithGoogle({
        email: "client@example.test",
        googleId: "google-existing",
        nombre: "Client",
        apellido: "Test",
        avatarUrl: "",
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Google quedo bloqueado por lastLogin")), 100)),
    ]);
    assert.equal(typeof result.token, "string");
    assert.ok(result.token.length > 20);
    assert.equal(getByIdCalls, 0);
  } finally {
    releaseUpdate();
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});

test("login con email no espera lastLogin ni hace una segunda lectura", async () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "auth-fast-path-test-secret";
  const service = new ServicioUsuarios();
  const passwordHash = await bcrypt.hash("valid-password", 4);
  let releaseUpdate;
  let getByIdCalls = 0;
  const updatePending = new Promise((resolve) => { releaseUpdate = resolve; });
  service._findUserByEmail = async () => clientUser({ passwordHash, emailVerificado: true });
  service._updateById = async () => await updatePending;
  service.getById = async () => {
    getByIdCalls += 1;
    throw new Error("login no debe releer el usuario");
  };

  try {
    const result = await service.login("client@example.test", "valid-password");
    assert.equal(typeof result.token, "string");
    assert.equal(getByIdCalls, 0);
  } finally {
    releaseUpdate();
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});
