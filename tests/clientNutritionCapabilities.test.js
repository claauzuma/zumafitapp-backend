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

test("free autogestionado puede trackear y crear hasta 1 menu propio", () => {
  const capabilities = getClientNutritionCapabilities({ role: "cliente", plan: "free" });

  assert.equal(capabilities.clientType, "self_managed");
  assert.equal(capabilities.canTrack, true);
  assert.equal(capabilities.canCreateOwnMenu, true);
  assert.equal(capabilities.limits.ownMenus, 1);
  assert.equal(capabilities.limits.ownMeals, 5);
  assert.equal(capabilities.limits.menuDays, 1);
  assert.equal(capabilities.canUseGlobalLibrary, false);
  assert.equal(capabilities.canUsePremiumLibrary, false);
  assert.equal(capabilities.canAutoCompleteRemainingMeals, false);
  assert.equal(capabilities.canUseFlexibleMarginRecommendations, false);
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

test("coachAccess finalizado no se detecta como coach activo en capabilities", () => {
  const capabilities = getClientNutritionCapabilities({
    role: "cliente",
    personalPlan: "free",
    plan: "free",
    coach: { entrenadorId: "coach-1" },
    coachAccess: {
      status: "ended",
      active: false,
      coachId: "coach-1",
      endedAt: "2026-06-30T00:00:00.000Z",
    },
    menu: { activeSource: "coach" },
  });

  assert.equal(capabilities.plan, "free");
  assert.equal(capabilities.clientType, "self_managed");
  assert.equal(capabilities.hasCoach, false);
  assert.equal(capabilities.activeMenuSource, "none");
});

test("prueba Pro activa eleva capabilities sin cambiar plan legacy", () => {
  const capabilities = getClientNutritionCapabilities({
    role: "cliente",
    personalPlan: "free",
    plan: "free",
    personalTrial: {
      status: "active",
      endsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    },
  });

  assert.equal(capabilities.plan, "pro");
  assert.equal(capabilities.limits.ownMenus, 10);
  assert.equal(capabilities.canAutoCompleteRemainingMeals, true);
  assert.equal(capabilities.canUseFlexibleMarginRecommendations, true);
});

test("VIP accede a biblioteca premium pero no declara PDF/generacion automatica como lista", () => {
  const capabilities = getClientNutritionCapabilities({ role: "cliente", plan: "premium2" });

  assert.equal(capabilities.plan, "vip");
  assert.equal(capabilities.canUseGlobalLibrary, true);
  assert.equal(capabilities.canUsePremiumLibrary, true);
  assert.equal(capabilities.canGenerateAutomaticMenu, false);
  assert.equal(capabilities.canAutoCompleteRemainingMeals, true);
  assert.equal(capabilities.canUseFlexibleMarginRecommendations, true);
  assert.equal(capabilities.canExportMenuPdf, false);
});

test("roles no cliente no reciben permisos de CRUD de menus propios", () => {
  const capabilities = getClientNutritionCapabilities({ role: "coach", plan: "vip" });

  assert.equal(capabilities.role, "coach");
  assert.equal(capabilities.canCreateOwnMenu, false);
  assert.equal(capabilities.canEditOwnMenu, false);
  assert.equal(capabilities.canDeleteOwnMenu, false);
});
