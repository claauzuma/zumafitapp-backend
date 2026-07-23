export const COACH_PLAN_CODES = ["trial_pro", "pro", "vip"];

export const COACH_LIMIT_MAXIMUMS = Object.freeze({
  maxActiveClients: 10000,
  maxCoachOwnedMenus: 100000,
  maxCoachOwnedMeals: 250000,
});

export const BASE_COACH_PLAN_CONFIGS = {
  trial_pro: {
    code: "trial_pro",
    name: "Inicial",
    durationDays: 7,
    maxClients: 3,
    maxCoachOwnedMenus: 10,
    maxCoachOwnedMeals: 30,
    features: {
      clients: {
        canAssign: true,
        canViewProgress: true,
      },
      routines: {
        manualBuilder: true,
        librarySearch: true,
        ownTemplates: true,
        ownTemplatesLimit: 3,
        duplicatePlans: true,
        semiAutomaticBuilder: true,
        automaticGenerator: false,
      },
      menus: {
        manualBuilder: true,
        foodLibrarySearch: true,
        menuLibrarySearch: true,
        ownTemplates: true,
        ownTemplatesLimit: 3,
        duplicatePlans: true,
        canCreateCoachMenus: true,
        canCreateCoachMeals: true,
        canUseGlobalMenuTemplates: false,
        canUseGlobalMealTemplates: false,
        canUsePremiumMenuTemplates: false,
        canUsePremiumMealTemplates: false,
        canDuplicateGlobalTemplates: false,
        canAssignGlobalTemplates: false,
        semiAutomaticBuilder: true,
        automaticGenerator: false,
      },
      metrics: {
        basic: true,
        advanced: false,
      },
      exports: {
        enabled: false,
      },
    },
  },
  pro: {
    code: "pro",
    name: "Pro",
    durationDays: null,
    maxClients: 25,
    maxCoachOwnedMenus: 100,
    maxCoachOwnedMeals: 300,
    features: {
      clients: {
        canAssign: true,
        canViewProgress: true,
      },
      routines: {
        manualBuilder: true,
        librarySearch: true,
        ownTemplates: true,
        ownTemplatesLimit: null,
        duplicatePlans: true,
        semiAutomaticBuilder: true,
        automaticGenerator: false,
      },
      menus: {
        manualBuilder: true,
        foodLibrarySearch: true,
        menuLibrarySearch: true,
        ownTemplates: true,
        ownTemplatesLimit: null,
        duplicatePlans: true,
        canCreateCoachMenus: true,
        canCreateCoachMeals: true,
        canUseGlobalMenuTemplates: true,
        canUseGlobalMealTemplates: true,
        canUsePremiumMenuTemplates: false,
        canUsePremiumMealTemplates: false,
        canDuplicateGlobalTemplates: true,
        canAssignGlobalTemplates: true,
        semiAutomaticBuilder: true,
        automaticGenerator: false,
      },
      metrics: {
        basic: true,
        advanced: false,
      },
      exports: {
        enabled: false,
      },
    },
  },
  vip: {
    code: "vip",
    name: "VIP",
    durationDays: null,
    maxClients: 100,
    maxCoachOwnedMenus: 500,
    maxCoachOwnedMeals: 1000,
    features: {
      clients: {
        canAssign: true,
        canViewProgress: true,
      },
      routines: {
        manualBuilder: true,
        librarySearch: true,
        ownTemplates: true,
        ownTemplatesLimit: null,
        duplicatePlans: true,
        semiAutomaticBuilder: true,
        automaticGenerator: true,
      },
      menus: {
        manualBuilder: true,
        foodLibrarySearch: true,
        menuLibrarySearch: true,
        ownTemplates: true,
        ownTemplatesLimit: null,
        duplicatePlans: true,
        canCreateCoachMenus: true,
        canCreateCoachMeals: true,
        canUseGlobalMenuTemplates: true,
        canUseGlobalMealTemplates: true,
        canUsePremiumMenuTemplates: true,
        canUsePremiumMealTemplates: true,
        canDuplicateGlobalTemplates: true,
        canAssignGlobalTemplates: true,
        semiAutomaticBuilder: true,
        automaticGenerator: true,
      },
      metrics: {
        basic: true,
        advanced: true,
      },
      exports: {
        enabled: true,
      },
    },
  },
};

export function clonePlanConfig(config) {
  return JSON.parse(JSON.stringify(config));
}

export function validateCoachLimitValue(key, value, { allowNull = false } = {}) {
  if (allowNull && (value === null || value === undefined || value === "")) return null;
  const number = Number(value);
  const minimum = key === "maxActiveClients" || key === "maxClients" ? 1 : 0;
  const maximum = COACH_LIMIT_MAXIMUMS[key === "maxClients" ? "maxActiveClients" : key];
  if (!Number.isInteger(number) || number < minimum) {
    const error = new Error("COACH_LIMIT_INVALID");
    error.resource = key;
    error.minimum = minimum;
    throw error;
  }
  if (Number.isFinite(maximum) && number > maximum) {
    const error = new Error("COACH_LIMIT_TOO_HIGH");
    error.resource = key;
    error.maximum = maximum;
    throw error;
  }
  return number;
}

export function coachResourceLimitError(code, {
  current = 0,
  limit = 0,
  plan = "coach_initial",
  overrideApplied = false,
  upgradeTarget = "coach_pro",
  resource = null,
} = {}) {
  const error = new Error(code);
  error.code = code;
  error.current = Number(current || 0);
  error.limit = Number(limit || 0);
  error.plan = plan;
  error.overrideApplied = !!overrideApplied;
  error.upgradeTarget = upgradeTarget;
  error.resource = resource;
  return error;
}

export function normalizeCoachPlanCode(plan) {
  const p = String(plan || "").trim().toLowerCase();

  if (!p || p === "free" || p === "trial" || p === "trialpro" || p === "coach_initial" || p === "initial") return "trial_pro";
  if (p === "premium" || p === "plus" || p === "coach_pro") return "pro";
  if (p === "premium2" || p === "coach_ai" || p === "coach_vip") return "vip";
  if (COACH_PLAN_CODES.includes(p)) return p;

  return null;
}

export function coachPlanName(planCode) {
  const code = normalizeCoachPlanCode(planCode);
  return BASE_COACH_PLAN_CONFIGS[code]?.name || "Inicial";
}

export function createEmptyCoachOverrides() {
  return {
    maxClients: null,
    maxCoachOwnedMenus: null,
    maxCoachOwnedMeals: null,
    trialEndsAt: null,
    features: {
      routines: {
        manualBuilder: null,
        librarySearch: null,
        ownTemplates: null,
        ownTemplatesLimit: null,
        duplicatePlans: null,
        semiAutomaticBuilder: null,
        automaticGenerator: null,
      },
      menus: {
        manualBuilder: null,
        foodLibrarySearch: null,
        menuLibrarySearch: null,
        ownTemplates: null,
        ownTemplatesLimit: null,
        duplicatePlans: null,
        canCreateCoachMenus: null,
        canCreateCoachMeals: null,
        canUseGlobalMenuTemplates: null,
        canUseGlobalMealTemplates: null,
        canUsePremiumMenuTemplates: null,
        canUsePremiumMealTemplates: null,
        canDuplicateGlobalTemplates: null,
        canAssignGlobalTemplates: null,
        semiAutomaticBuilder: null,
        automaticGenerator: null,
      },
      metrics: {
        basic: null,
        advanced: null,
      },
      exports: {
        enabled: null,
      },
    },
  };
}

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function mergeConfig(base, patch) {
  const out = clonePlanConfig(base);
  if (!isPlainObject(patch)) return out;

  if (patch.name !== undefined) out.name = String(patch.name || out.name);
  if (patch.durationDays !== undefined) {
    out.durationDays = patch.durationDays === null ? null : Math.max(0, Number(patch.durationDays) || 0);
  }
  if (patch.maxClients !== undefined) out.maxClients = Math.max(0, Number(patch.maxClients) || 0);
  if (patch.maxCoachOwnedMenus !== undefined) {
    out.maxCoachOwnedMenus = Math.max(0, Number(patch.maxCoachOwnedMenus) || 0);
  }
  if (patch.maxCoachOwnedMeals !== undefined) {
    out.maxCoachOwnedMeals = Math.max(0, Number(patch.maxCoachOwnedMeals) || 0);
  }

  for (const section of Object.keys(out.features || {})) {
    if (!isPlainObject(patch.features?.[section])) continue;
    out.features[section] = {
      ...out.features[section],
      ...patch.features[section],
    };
  }

  return out;
}

export function normalizePlanConfig(docOrCode) {
  const code = normalizeCoachPlanCode(isPlainObject(docOrCode) ? docOrCode.code : docOrCode);
  if (!code) return null;

  const base = BASE_COACH_PLAN_CONFIGS[code];
  return mergeConfig(base, isPlainObject(docOrCode) ? docOrCode : null);
}

export function normalizeCoachOverrides(raw = {}) {
  const empty = createEmptyCoachOverrides();
  const out = mergeNullableOverrides(empty, raw);

  if (out.maxClients !== null && out.maxClients !== undefined) {
    const max = Number(out.maxClients);
    out.maxClients = Number.isInteger(max) && max >= 1 ? max : null;
  }

  for (const key of ["maxCoachOwnedMenus", "maxCoachOwnedMeals"]) {
    if (out[key] === null || out[key] === undefined) continue;
    const max = Number(out[key]);
    out[key] = Number.isInteger(max) && max >= 0 ? max : null;
  }

  if (out.trialEndsAt !== null && out.trialEndsAt !== undefined) {
    const d = new Date(out.trialEndsAt);
    out.trialEndsAt = Number.isNaN(d.getTime()) ? null : d;
  }

  return out;
}

function mergeNullableOverrides(base, raw) {
  const out = clonePlanConfig(base);
  if (!isPlainObject(raw)) return out;

  for (const key of Object.keys(out)) {
    if (key === "features") continue;
    if (raw[key] !== undefined) out[key] = raw[key];
  }

  for (const section of Object.keys(out.features || {})) {
    if (!isPlainObject(raw.features?.[section])) continue;
    for (const key of Object.keys(out.features[section])) {
      if (raw.features[section][key] !== undefined) {
        out.features[section][key] = raw.features[section][key];
      }
    }
  }

  return out;
}

function applyOverridesToFeatures(features, overrides, sources) {
  const next = clonePlanConfig(features);

  for (const section of Object.keys(next || {})) {
    const sectionOverrides = overrides?.features?.[section] || {};
    sources.features[section] = sources.features[section] || {};

    for (const key of Object.keys(next[section])) {
      if (sectionOverrides[key] !== null && sectionOverrides[key] !== undefined) {
        next[section][key] = sectionOverrides[key];
        sources.features[section][key] = "override";
      } else {
        sources.features[section][key] = "plan";
      }
    }
  }

  return next;
}

function disableSection(section) {
  const out = {};
  for (const key of Object.keys(section || {})) {
    out[key] = typeof section[key] === "number" || section[key] === null ? 0 : false;
  }
  return out;
}

export function resolveEffectiveCoachCapabilities({
  coach,
  planConfig,
  currentClients = 0,
  currentCoachOwnedMenus = 0,
  currentCoachOwnedMeals = 0,
}) {
  const planCode = normalizeCoachPlanCode(coach?.plan);
  const safePlanCode = planCode || "trial_pro";
  const base = normalizePlanConfig(planConfig || safePlanCode);
  const overrides = normalizeCoachOverrides(coach?.coachOverrides || {});

  const sources = {
    maxClients: overrides.maxClients !== null && overrides.maxClients !== undefined ? "override" : "plan",
    maxCoachOwnedMenus:
      overrides.maxCoachOwnedMenus !== null && overrides.maxCoachOwnedMenus !== undefined ? "override" : "plan",
    maxCoachOwnedMeals:
      overrides.maxCoachOwnedMeals !== null && overrides.maxCoachOwnedMeals !== undefined ? "override" : "plan",
    trialEndsAt: overrides.trialEndsAt ? "override" : "subscription",
    features: {},
  };

  let maxClients =
    overrides.maxClients !== null && overrides.maxClients !== undefined
      ? Number(overrides.maxClients)
      : Number(base.maxClients || 0);
  const maxCoachOwnedMenus =
    overrides.maxCoachOwnedMenus !== null && overrides.maxCoachOwnedMenus !== undefined
      ? Number(overrides.maxCoachOwnedMenus)
      : Number(base.maxCoachOwnedMenus || 0);
  const maxCoachOwnedMeals =
    overrides.maxCoachOwnedMeals !== null && overrides.maxCoachOwnedMeals !== undefined
      ? Number(overrides.maxCoachOwnedMeals)
      : Number(base.maxCoachOwnedMeals || 0);

  let features = applyOverridesToFeatures(base.features || {}, overrides, sources);

  const specialties = coach?.coachProfile?.specialties || {};
  const hasTraining = !!specialties.training;
  const hasNutrition = !!specialties.nutrition;

  const disabledBySpecialty = {
    routines: !hasTraining,
    menus: !hasNutrition,
  };

  if (!hasTraining) {
    features.routines = disableSection(features.routines);
  }

  if (!hasNutrition) {
    features.menus = disableSection(features.menus);
  }

  const subscription = coach?.subscription || {};
  const subscriptionStatus = String(subscription.status || coach?.coachSubscription?.status || "")
    .trim()
    .toLowerCase();
  const isTrial = subscriptionStatus === "trial" || subscriptionStatus === "trialing";
  const trialEndsAt =
    overrides.trialEndsAt ||
    subscription.trialEndsAt ||
    coach?.coachWelcome?.trialEndsAt ||
    null;

  const trialEndDate = trialEndsAt ? new Date(trialEndsAt) : null;
  const isTrialExpired =
    isTrial &&
    trialEndDate &&
    Number.isFinite(trialEndDate.getTime()) &&
    trialEndDate.getTime() < Date.now();

  if (isTrialExpired) {
    features = {
      ...features,
      clients: {
        ...(features.clients || {}),
        canAssign: false,
      },
      routines: disableSection(features.routines),
      menus: disableSection(features.menus),
      metrics: {
        ...(features.metrics || {}),
        advanced: false,
      },
      exports: {
        ...(features.exports || {}),
        enabled: false,
      },
    };
  }

  return {
    planCode: safePlanCode,
    planName: base.name,
    maxClients,
    currentClients,
    limits: {
      maxActiveClients: maxClients,
      maxCoachOwnedMenus,
      maxCoachOwnedMeals,
    },
    usage: {
      currentActiveClients: Number(currentClients || 0),
      currentCoachOwnedMenus: Number(currentCoachOwnedMenus || 0),
      currentCoachOwnedMeals: Number(currentCoachOwnedMeals || 0),
    },
    canReceiveClients:
      !isTrialExpired &&
      !!features?.clients?.canAssign &&
      (maxClients <= 0 || Number(currentClients || 0) < maxClients),
    trialEndsAt: trialEndDate && Number.isFinite(trialEndDate.getTime()) ? trialEndDate : null,
    isTrial,
    isTrialExpired: !!isTrialExpired,
    usesOverrides:
      sources.maxClients === "override" ||
      sources.maxCoachOwnedMenus === "override" ||
      sources.maxCoachOwnedMeals === "override" ||
      hasFeatureOverrides(overrides),
    sources,
    disabledBySpecialty,
    features,
  };
}

function hasFeatureOverrides(overrides) {
  for (const section of Object.values(overrides?.features || {})) {
    for (const value of Object.values(section || {})) {
      if (value !== null && value !== undefined) return true;
    }
  }
  return false;
}

export function createTrialSubscription({ planCode, now = new Date(), existing = {}, durationDays = 7 }) {
  const code = normalizeCoachPlanCode(planCode);
  if (code !== "trial_pro") {
    return {
      ...(existing || {}),
      status: "active",
      trialStartedAt: existing?.trialStartedAt || null,
      trialEndsAt: existing?.trialEndsAt || null,
      paidUntil: existing?.paidUntil || null,
    };
  }

  const started = existing?.trialStartedAt ? new Date(existing.trialStartedAt) : now;
  const safeDuration = Math.max(1, Number(durationDays) || 7);
  const ends = existing?.trialEndsAt ? new Date(existing.trialEndsAt) : new Date(started.getTime() + safeDuration * 24 * 60 * 60 * 1000);

  return {
    ...(existing || {}),
    status: "trial",
    trialStartedAt: started,
    trialEndsAt: ends,
    paidUntil: existing?.paidUntil || null,
  };
}
