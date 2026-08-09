import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeClientAutonomyPlanConfig,
  resolveClientMenuAutonomyPermissions,
} from "../servicio/clientMenuAutonomy.js";
import { resolveClientAccessContext } from "../servicio/clientAccessContext.js";

function coachedClient(menu = {}, tracking = {}) {
  return {
    _id: "client-1",
    role: "cliente",
    personalPlan: "free",
    coach: { entrenadorId: "coach-1", status: "active" },
    coachAccess: { status: "active", servicePackage: "service_pro" },
    clientPermissions: { menu, tracking },
  };
}

test("autonomía total habilita creación propia sin permitir activar sobre el menú profesional", () => {
  const permissions = resolveClientMenuAutonomyPermissions({ menu: { autonomyPreset: "total" } });
  assert.equal(permissions.menu.canUseLibrary, true);
  assert.equal(permissions.menu.canCreateOwnMenu, true);
  assert.equal(permissions.menu.canUseAutomaticMenu, true);
  assert.equal(permissions.tracking.canTrackFoods, true);
  assert.equal(permissions.menu.canActivateOwnMenuOverCoachPlan, false);
});

test("capability ausente falla cerrada para creación propia en relación coach-cliente", () => {
  const context = resolveClientAccessContext(coachedClient());
  assert.equal(context.hasCoach, true);
  assert.equal(context.capabilities.canCreateOwnMenu, false);
  assert.equal(context.capabilities.canGenerateAutomaticMenu, false);
  assert.equal(context.capabilities.canUseGlobalLibrary, false);
});

test("relación con autonomía total expone biblioteca, creación y automático sin reemplazo profesional", () => {
  const context = resolveClientAccessContext(coachedClient({ autonomyPreset: "total" }));
  assert.equal(context.capabilities.canUseGlobalLibrary, true);
  assert.equal(context.capabilities.canCreateOwnMenu, true);
  assert.equal(context.capabilities.canGenerateAutomaticMenu, true);
  assert.equal(context.capabilities.canActivateOwnMenuOverCoachPlan, false);
});

test("config de plan normaliza presets disponibles y mantiene un default válido", () => {
  const config = normalizeClientAutonomyPlanConfig({
    defaultPreset: "total",
    availablePresets: { total: false, equivalences: true },
  });
  assert.equal(config.availablePresets.total, false);
  assert.equal(config.defaultPreset, "equivalences");
});
