import assert from "node:assert/strict";
import test from "node:test";

import {
  getClientNutritionCapabilities,
  normalizeClientPlan,
} from "../servicio/clientNutritionCapabilities.js";

test("normaliza aliases de plan de cliente", () => {
  assert.equal(normalizeClientPlan("free"), "free");
  assert.equal(normalizeClientPlan("premium"), "pro");
  assert.equal(normalizeClientPlan("pro"), "pro");
  assert.equal(normalizeClientPlan("premium2"), "vip");
  assert.equal(normalizeClientPlan("vip"), "vip");
  assert.equal(normalizeClientPlan("desconocido"), "free");
});

test("free autogestionado puede trackear y crear hasta 2 menus propios", () => {
  const capabilities = getClientNutritionCapabilities({ role: "cliente", plan: "free" });

  assert.equal(capabilities.clientType, "self_managed");
  assert.equal(capabilities.canTrack, true);
  assert.equal(capabilities.canCreateOwnMenu, true);
  assert.equal(capabilities.limits.ownMenus, 2);
  assert.equal(capabilities.canUseGlobalLibrary, false);
  assert.equal(capabilities.canUsePremiumLibrary, false);
});

test("cliente con coach se detecta por coach.entrenadorId", () => {
  const capabilities = getClientNutritionCapabilities({
    role: "cliente",
    plan: "premium",
    coach: { entrenadorId: "coach-1" },
    menu: { activeSource: "coach" },
  });

  assert.equal(capabilities.plan, "pro");
  assert.equal(capabilities.clientType, "with_coach");
  assert.equal(capabilities.hasCoach, true);
  assert.equal(capabilities.activeMenuSource, "coach");
});

test("VIP accede a biblioteca premium pero no declara PDF/generacion automatica como lista", () => {
  const capabilities = getClientNutritionCapabilities({ role: "cliente", plan: "premium2" });

  assert.equal(capabilities.plan, "vip");
  assert.equal(capabilities.canUseGlobalLibrary, true);
  assert.equal(capabilities.canUsePremiumLibrary, true);
  assert.equal(capabilities.canGenerateAutomaticMenu, false);
  assert.equal(capabilities.canExportMenuPdf, false);
});

test("roles no cliente no reciben permisos de CRUD de menus propios", () => {
  const capabilities = getClientNutritionCapabilities({ role: "coach", plan: "vip" });

  assert.equal(capabilities.role, "coach");
  assert.equal(capabilities.canCreateOwnMenu, false);
  assert.equal(capabilities.canEditOwnMenu, false);
  assert.equal(capabilities.canDeleteOwnMenu, false);
});
