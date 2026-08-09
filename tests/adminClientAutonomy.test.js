import assert from "node:assert/strict";
import test from "node:test";

import ServicioUsuarios from "../servicio/usuarios.js";

function fixture() {
  const client = {
    _id: "client-1",
    role: "cliente",
    coach: { entrenadorId: "coach-1" },
    coachAccess: { status: "active" },
    clientPermissions: { menu: {}, tracking: {} },
  };
  const coach = {
    _id: "coach-1",
    role: "coach",
    coachProfile: { specialties: { nutrition: true, training: true } },
  };
  const effective = {
    isTrialExpired: false,
    clientAutonomy: {
      defaultPreset: "equivalences",
      availablePresets: { total: false, equivalences: true, coach_only: true, view_only: true },
    },
    features: {
      menus: { manualBuilder: true, semiAutomaticBuilder: true, automaticGenerator: true },
      routines: { manualBuilder: true },
      metrics: { basic: true },
    },
  };
  return { client, coach, effective };
}

test("override de relacion rechaza presets no disponibles y restaura el default del coach", async () => {
  const { client, coach, effective } = fixture();
  const service = new ServicioUsuarios();
  service.getById = async (id) => id === client._id ? client : coach;
  service._resolveEffectiveCapabilities = async () => effective;
  service.updateById = async (_id, patch) => ({ ...client, ...patch });
  service._withEffectiveCapabilities = async (value) => value;

  await assert.rejects(
    service.adminUpdateClientMenuAutonomy({ clientId: client._id, preset: "total", adminId: "admin-1" }),
    /CLIENT_AUTONOMY_PRESET_NOT_AVAILABLE/
  );

  const overridden = await service.adminUpdateClientMenuAutonomy({
    clientId: client._id,
    preset: "coach_only",
    adminId: "admin-1",
  });
  assert.equal(overridden.clientPermissions.menu.autonomyPreset, "coach_only");
  assert.equal(overridden.clientPermissions.menu.autonomySource, "relationship_override");
  assert.equal(overridden.clientPermissions.menu.canCreateOwnMenu, false);

  const restored = await service.adminUpdateClientMenuAutonomy({
    clientId: client._id,
    preset: null,
    adminId: "admin-1",
  });
  assert.equal(restored.clientPermissions.menu.autonomyPreset, "equivalences");
  assert.equal(restored.clientPermissions.menu.autonomySource, "coach_plan_default");
});

test("override parcial del coach conserva los presets hermanos", async () => {
  const { coach, effective } = fixture();
  coach.coachOverrides = {
    clientAutonomy: {
      defaultPreset: "equivalences",
      availablePresets: { total: true, equivalences: true, coach_only: false, view_only: true },
    },
  };
  const service = new ServicioUsuarios();
  service.getById = async () => coach;
  service._resolveEffectiveCapabilities = async () => effective;
  service.updateById = async (_id, patch) => ({ ...coach, ...patch });

  const updated = await service.adminUpdateCoachOverrides(coach._id, {
    clientAutonomy: { availablePresets: { total: false } },
  });
  assert.deepEqual(updated.coachOverrides.clientAutonomy.availablePresets, {
    total: false,
    equivalences: true,
    coach_only: false,
    view_only: true,
  });
});
