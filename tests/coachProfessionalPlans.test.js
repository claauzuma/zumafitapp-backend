import assert from "node:assert/strict";
import test from "node:test";

import ServicioUsuarios from "../servicio/usuarios.js";
import {
  BASE_COACH_PLAN_CONFIGS,
  resolveEffectiveCoachCapabilities,
} from "../servicio/coachPlans.js";
import {
  PROFESSIONAL_SUBSCRIPTION_PLANS,
  normalizeCoachSubscription,
  normalizeProfessionalSubscriptionPlan,
} from "../servicio/professionalAccessRules.js";
import {
  professionalLibraryCapabilitiesForPlan,
  resolveProfessionalLibraryCapabilities,
} from "../servicio/professionalLibraryCapabilities.js";

const EXPECTED_LIBRARY_CAPABILITIES = {
  coach_initial: {
    canCreateCoachMenus: true,
    canCreateCoachMeals: true,
    canUseGlobalMenuTemplates: false,
    canUseGlobalMealTemplates: false,
    canUsePremiumMenuTemplates: false,
    canUsePremiumMealTemplates: false,
    canDuplicateGlobalTemplates: false,
    canAssignGlobalTemplates: false,
  },
  coach_pro: {
    canCreateCoachMenus: true,
    canCreateCoachMeals: true,
    canUseGlobalMenuTemplates: true,
    canUseGlobalMealTemplates: true,
    canUsePremiumMenuTemplates: false,
    canUsePremiumMealTemplates: false,
    canDuplicateGlobalTemplates: true,
    canAssignGlobalTemplates: true,
  },
  coach_ai: {
    canCreateCoachMenus: true,
    canCreateCoachMeals: true,
    canUseGlobalMenuTemplates: true,
    canUseGlobalMealTemplates: true,
    canUsePremiumMenuTemplates: true,
    canUsePremiumMealTemplates: true,
    canDuplicateGlobalTemplates: true,
    canAssignGlobalTemplates: true,
  },
};

function stubCoachContentUsage(service, { menus = 0, meals = 0 } = {}) {
  service.menusModel.countOwnedByCoach = async () => menus;
  service.comidasModel.countOwnedByCoach = async () => meals;
  service.comidasGuardadasModel.countOwnedByCoach = async () => 0;
}

test("mapeo profesional canónico conserva enums legacy sin llamar Inicial a una prueba", () => {
  assert.equal(normalizeProfessionalSubscriptionPlan("trial_pro"), "coach_initial");
  assert.equal(normalizeProfessionalSubscriptionPlan("coach_pro"), "coach_pro");
  assert.equal(normalizeProfessionalSubscriptionPlan("coach_vip"), "coach_ai");
  assert.equal(PROFESSIONAL_SUBSCRIPTION_PLANS.coach_initial.legacyPlan, "trial_pro");
  assert.equal(PROFESSIONAL_SUBSCRIPTION_PLANS.coach_pro.legacyPlan, "pro");
  assert.equal(PROFESSIONAL_SUBSCRIPTION_PLANS.coach_ai.legacyPlan, "vip");
  assert.equal(BASE_COACH_PLAN_CONFIGS.trial_pro.name, "Inicial");
});

test("capabilities de biblioteca coinciden exactamente con Inicial, Pro y VIP", () => {
  for (const [plan, expected] of Object.entries(EXPECTED_LIBRARY_CAPABILITIES)) {
    const actual = professionalLibraryCapabilitiesForPlan(plan);
    for (const [capability, value] of Object.entries(expected)) {
      assert.equal(actual[capability], value, `${plan}.${capability}`);
    }
  }

  const missing = resolveProfessionalLibraryCapabilities({ role: "coach" });
  assert.equal(missing.canUseGlobalMenuTemplates, false);
  assert.equal(missing.canUsePremiumMenuTemplates, false);
  assert.equal(missing.canAssignGlobalTemplates, false);
});

test("trial_pro activo es Inicial; solo subscription.status=trial puede vencer la prueba", () => {
  const common = {
    role: "coach",
    plan: "trial_pro",
    coachProfile: { specialties: { training: true, nutrition: true } },
  };
  const staleTrialDate = "2000-01-01T00:00:00.000Z";

  const initial = resolveEffectiveCoachCapabilities({
    coach: {
      ...common,
      subscription: { status: "active", trialEndsAt: staleTrialDate },
    },
    planConfig: BASE_COACH_PLAN_CONFIGS.trial_pro,
  });
  assert.equal(initial.isTrial, false);
  assert.equal(initial.isTrialExpired, false);
  assert.equal(initial.features.menus.canCreateCoachMenus, true);

  const trial = resolveEffectiveCoachCapabilities({
    coach: {
      ...common,
      subscription: { status: "trial", trialEndsAt: staleTrialDate },
    },
    planConfig: BASE_COACH_PLAN_CONFIGS.trial_pro,
  });
  assert.equal(trial.isTrial, true);
  assert.equal(trial.isTrialExpired, true);
  assert.equal(trial.features.menus.canCreateCoachMenus, false);

  const normalizedTrial = normalizeCoachSubscription({
    ...common,
    subscription: { status: "trial", trialEndsAt: "2099-01-01T00:00:00.000Z" },
  });
  assert.equal(normalizedTrial.isTrial, true);
  assert.equal(normalizedTrial.canInviteOrActivate, true);
});

test("Admin guarda coachSubscription.plan canónico y sincroniza el alias legacy", async () => {
  const service = new ServicioUsuarios();
  stubCoachContentUsage(service);
  const coach = {
    _id: "64b000000000000000000099",
    id: "64b000000000000000000099",
    role: "coach",
    plan: "premium",
    estado: "activo",
    billing: { status: "free" },
    subscription: { status: "trial", trialEndsAt: "2099-01-01T00:00:00.000Z" },
    coachProfile: { specialties: { training: true, nutrition: true } },
  };
  let storedPatch = null;
  service.getById = async () => coach;
  service.updateById = async (_id, patch) => {
    storedPatch = patch;
    return { ...coach, ...patch };
  };
  service._getCoachPlanConfig = async (plan) => BASE_COACH_PLAN_CONFIGS[plan];
  service._countClientsForCoach = async () => 0;
  service._withEffectiveCapabilities = async (updated) => updated;

  for (const [canonicalPlan, legacyPlan] of [
    ["coach_initial", "trial_pro"],
    ["coach_pro", "pro"],
    ["coach_ai", "vip"],
  ]) {
    const updated = await service.adminUpdateCoachPlan(coach.id, { plan: canonicalPlan });
    assert.equal(storedPatch.plan, legacyPlan);
    assert.equal(storedPatch.coachSubscription.plan, canonicalPlan);
    assert.equal(storedPatch.coachSubscription.status, "active");
    assert.equal(storedPatch.subscription.status, "trial");
    assert.equal(storedPatch.subscription.trialEndsAt, "2099-01-01T00:00:00.000Z");
    assert.equal(updated.coachSubscription.plan, canonicalPlan);
  }
});

test("preview de Admin calcula límite y biblioteca con el mismo resolver efectivo del backend", async () => {
  const service = new ServicioUsuarios();
  stubCoachContentUsage(service);
  const coach = {
    _id: "64b000000000000000000098",
    id: "64b000000000000000000098",
    role: "coach",
    plan: "pro",
    estado: "activo",
    subscription: { status: "active" },
    coachSubscription: {
      plan: "coach_pro",
      status: "active",
      clientLimit: 25,
      canOffer: ["service_pro"],
    },
    coachProfile: { specialties: { training: true, nutrition: true } },
  };
  service.getById = async () => coach;
  service._getCoachPlanConfig = async (plan) => BASE_COACH_PLAN_CONFIGS[plan];
  service._countClientsForCoach = async () => 2;

  const initial = await service.adminPreviewCoachPlan(coach.id, { plan: "coach_initial" });
  assert.equal(initial.plan, "coach_initial");
  assert.equal(initial.maxClients, 3);
  assert.equal(initial.currentClients, 2);
  assert.equal(initial.canSave, true);
  assert.deepEqual(initial.libraryCapabilities, EXPECTED_LIBRARY_CAPABILITIES.coach_initial);

  const pro = await service.adminPreviewCoachPlan(coach.id, { plan: "coach_pro" });
  assert.equal(pro.maxClients, 25);
  assert.deepEqual(pro.libraryCapabilities, EXPECTED_LIBRARY_CAPABILITIES.coach_pro);

  const vip = await service.adminPreviewCoachPlan(coach.id, { plan: "coach_ai" });
  assert.equal(vip.maxClients, 100);
  assert.equal(vip.maxCoachOwnedMenus, 500);
  assert.equal(vip.maxCoachOwnedMeals, 1000);
  assert.deepEqual(vip.libraryCapabilities, EXPECTED_LIBRARY_CAPABILITIES.coach_ai);
});

test("Admin bloquea downgrade cuando los clientes actuales superan el límite efectivo seleccionado", async () => {
  const service = new ServicioUsuarios();
  stubCoachContentUsage(service);
  const coach = {
    _id: "64b000000000000000000097",
    id: "64b000000000000000000097",
    role: "coach",
    plan: "pro",
    subscription: { status: "active" },
    coachSubscription: { plan: "coach_pro", status: "active", clientLimit: 25 },
    coachProfile: { specialties: { training: true, nutrition: true } },
  };
  let updated = false;
  service.getById = async () => coach;
  service._getCoachPlanConfig = async (plan) => BASE_COACH_PLAN_CONFIGS[plan];
  service._countClientsForCoach = async () => 4;
  service.updateById = async () => {
    updated = true;
    return coach;
  };

  const preview = await service.adminPreviewCoachPlan(coach.id, { plan: "coach_initial" });
  assert.equal(preview.limitExceeded, true);
  assert.equal(preview.canSave, false);

  await assert.rejects(
    service.adminUpdateCoachPlan(coach.id, { plan: "coach_initial" }),
    (error) => {
      assert.equal(error.message, "COACH_PLAN_LIMIT_EXCEEDED");
      assert.equal(error.plan, "coach_initial");
      assert.equal(error.violations[0].resource, "maxActiveClients");
      assert.equal(error.violations[0].current, 4);
      assert.equal(error.violations[0].limit, 3);
      return true;
    }
  );
  assert.equal(updated, false);
});

test("Admin bloquea downgrade si menus o comidas propias superan el plan", async () => {
  const service = new ServicioUsuarios();
  stubCoachContentUsage(service, { menus: 12, meals: 31 });
  const coach = {
    _id: "64b000000000000000000095",
    role: "coach",
    plan: "pro",
    coachSubscription: { plan: "coach_pro", status: "active" },
    coachProfile: { specialties: { training: true, nutrition: true } },
  };
  service.getById = async () => coach;
  service._getCoachPlanConfig = async (plan) => BASE_COACH_PLAN_CONFIGS[plan];
  service._countClientsForCoach = async () => 1;

  const preview = await service.adminPreviewCoachPlan(coach._id, { plan: "coach_initial" });
  assert.equal(preview.canSave, false);
  assert.deepEqual(preview.violations.map((item) => item.resource), ["maxCoachOwnedMenus", "maxCoachOwnedMeals"]);
});

test("coach nuevo activo creado por Admin recibe Inicial y no una prueba implícita", async () => {
  const service = new ServicioUsuarios();
  let createdDocument = null;
  service._findUserByEmail = async () => null;
  service._getCoachPlanConfig = async (plan) => BASE_COACH_PLAN_CONFIGS[plan];
  service._createUser = async (document) => {
    createdDocument = document;
    return { _id: "64b000000000000000000096", ...document };
  };

  await service.adminCreateUser({
    email: "coach.initial@example.com",
    password: "password-seguro",
    role: "coach",
    profile: { nombre: "Coach", apellido: "Inicial" },
  });

  assert.equal(createdDocument.plan, "trial_pro");
  assert.equal(createdDocument.coachSubscription.plan, "coach_initial");
  assert.equal(createdDocument.coachSubscription.status, "active");
  assert.equal(createdDocument.subscription.status, "active");
  assert.equal(createdDocument.subscription.trialEndsAt, null);
});
