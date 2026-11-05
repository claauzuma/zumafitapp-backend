import assert from "node:assert/strict";
import test from "node:test";

import ServicioUsuarios from "../servicio/usuarios.js";

function serviceWith(user) {
  const service = new ServicioUsuarios();
  service.getById = async () => user;
  service.updateById = async (_id, patch) => ({ ...user, ...patch });
  return service;
}

test("actualizar nombre propio conserva basics y normaliza espacios", async () => {
  const service = serviceWith({
    _id: "coach-1",
    role: "coach",
    profile: {
      nombre: "Anterior",
      apellido: "Coach",
      avatarUrl: "foto",
      basics: { genero: "masculino" },
    },
  });

  const updated = await service.actualizarPerfil("coach-1", {
    profile: { nombre: "  Claudio  ", apellido: " Zuma   Fit " },
  });

  assert.equal(updated.profile.nombre, "Claudio");
  assert.equal(updated.profile.apellido, "Zuma Fit");
  assert.equal(updated.profile.avatarUrl, "foto");
  assert.deepEqual(updated.profile.basics, { genero: "masculino" });
});

test("actualizar perfil rechaza nombres vacios o demasiado largos", async () => {
  const service = serviceWith({ _id: "coach-1", role: "coach", profile: {} });

  await assert.rejects(
    service.actualizarPerfil("coach-1", { profile: { nombre: "" } }),
    /NOMBRE_REQUERIDO/
  );
  await assert.rejects(
    service.actualizarPerfil("coach-1", { profile: { apellido: "x".repeat(61) } }),
    /PAYLOAD_INVALIDO/
  );
});
