import assert from "node:assert/strict";
import test from "node:test";

import {
  BASE_COACH_PLAN_CONFIGS,
  resolveEffectiveCoachCapabilities,
  validateCoachLimitValue,
} from "../servicio/coachPlans.js";
import {
  PROFESSIONAL_SUBSCRIPTION_PLANS,
} from "../servicio/professionalAccessRules.js";
import {
  BASE_CLIENT_PLAN_SETTINGS,
  getRuntimeClientPlanSetting,
  setRuntimeClientPlanSetting,
  validateClientPlanSettingPatch,
} from "../servicio/clientPlanSettings.js";
import { getClientNutritionCapabilities } from "../servicio/clientNutritionCapabilities.js";

const coach = {
  role: "coach",
  plan: "trial_pro",
  coachProfile: { specialties: { training: true, nutrition: true } },
};

test("defaults profesionales finales respetan Inicial, Pro y VIP", () => {
  assert.deepEqual(
    ["trial_pro", "pro", "vip"].map((code) => {
      const plan = BASE_COACH_PLAN_CONFIGS[code];
      return [plan.maxClients, plan.maxCoachOwnedMenus, plan.maxCoachOwnedMeals];
    }),
    [[3, 10, 30], [25, 100, 300], [100, 500, 1000]]
  );
  assert.equal(PROFESSIONAL_SUBSCRIPTION_PLANS.coach_ai.clientLimit, 100);
});

test("resolver profesional prioriza overrides individuales sobre default global", () => {
  const globalPlan = {
    ...BASE_COACH_PLAN_CONFIGS.trial_pro,
    maxClients: 4,
    maxCoachOwnedMenus: 12,
    maxCoachOwnedMeals: 40,
  };
  const inherited = resolveEffectiveCoachCapabilities({ coach, planConfig: globalPlan });
  assert.deepEqual(inherited.limits, {
    maxActiveClients: 4,
    maxCoachOwnedMenus: 12,
    maxCoachOwnedMeals: 40,
  });

  const customized = resolveEffectiveCoachCapabilities({
    coach: {
      ...coach,
      coachOverrides: { maxClients: 8, maxCoachOwnedMenus: 20, maxCoachOwnedMeals: 60 },
    },
    planConfig: globalPlan,
  });
  assert.deepEqual(customized.limits, {
    maxActiveClients: 8,
    maxCoachOwnedMenus: 20,
    maxCoachOwnedMeals: 60,
  });
  assert.equal(customized.usesOverrides, true);
});

test("config global de cliente alimenta capabilities sin habilitar IA", () => {
  const original = getRuntimeClientPlanSetting("free");
  try {
    setRuntimeClientPlanSetting({
      ...original,
      limits: { ...original.limits, maxMenus: 2, maxSavedMeals: 8 },
    });
    const capabilities = getClientNutritionCapabilities({ role: "cliente", personalPlan: "free" });
    assert.equal(capabilities.limits.ownMenus, 2);
    assert.equal(capabilities.limits.ownMeals, 8);
    assert.equal(capabilities.canGenerateAutomaticMenu, false);
  } finally {
    setRuntimeClientPlanSetting(BASE_CLIENT_PLAN_SETTINGS.free);
  }
});

test("validaciones rechazan negativos, cero clientes y valores absurdos", () => {
  assert.throws(() => validateCoachLimitValue("maxClients", 0), /COACH_LIMIT_INVALID/);
  assert.throws(() => validateCoachLimitValue("maxCoachOwnedMenus", -1), /COACH_LIMIT_INVALID/);
  assert.throws(() => validateCoachLimitValue("maxCoachOwnedMeals", 999999), /COACH_LIMIT_TOO_HIGH/);
  assert.throws(
    () => validateClientPlanSettingPatch({ limits: { maxDaysPerMenu: 0 } }),
    /CLIENT_PLAN_LIMIT_INVALID/
  );
});

test("defaults personales finales conservan Free, Pro y VIP", () => {
  assert.deepEqual(BASE_CLIENT_PLAN_SETTINGS.free.limits, {
    maxMenus: 1,
    maxDaysPerMenu: 1,
    maxSavedMeals: 5,
    maxFavorites: 3,
    trackingHistoryDays: 7,
    goalChangesPerWindow: 2,
    goalChangesWindowDays: 30,
  });
  assert.equal(BASE_CLIENT_PLAN_SETTINGS.pro.libraryAccess, "global");
  assert.equal(BASE_CLIENT_PLAN_SETTINGS.vip.libraryAccess, "premium");
});

