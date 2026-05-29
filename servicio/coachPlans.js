export const COACH_PLAN_CODES = ["trial_pro", "pro", "vip"];

export const BASE_COACH_PLAN_CONFIGS = {
  trial_pro: {
    code: "trial_pro",
    name: "Prueba Pro",
    durationDays: 7,
    maxClients: 3,
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

export function normalizeCoachPlanCode(plan) {
  const p = String(plan || "").trim().toLowerCase();

  if (!p || p === "free" || p === "trial" || p === "trialpro") return "trial_pro";
  if (p === "premium" || p === "plus") return "pro";
  if (p === "premium2") return "vip";
  if (COACH_PLAN_CODES.includes(p)) return p;

  return null;
}

export function coachPlanName(planCode) {
  const code = normalizeCoachPlanCode(planCode);
  return BASE_COACH_PLAN_CONFIGS[code]?.name || "Prueba Pro";
}

export function createEmptyCoachOverrides() {
  return {
    maxClients: null,
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
    out.maxClients = Number.isFinite(max) && max >= 0 ? max : null;
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
}) {
  const planCode = normalizeCoachPlanCode(coach?.plan);
  const safePlanCode = planCode || "trial_pro";
  const base = normalizePlanConfig(planConfig || safePlanCode);
  const overrides = normalizeCoachOverrides(coach?.coachOverrides || {});

  const sources = {
    maxClients: overrides.maxClients !== null && overrides.maxClients !== undefined ? "override" : "plan",
    trialEndsAt: overrides.trialEndsAt ? "override" : "subscription",
    features: {},
  };

  let maxClients =
    overrides.maxClients !== null && overrides.maxClients !== undefined
      ? Number(overrides.maxClients)
      : Number(base.maxClients || 0);

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
  const trialEndsAt =
    overrides.trialEndsAt ||
    subscription.trialEndsAt ||
    coach?.coachWelcome?.trialEndsAt ||
    null;

  const trialEndDate = trialEndsAt ? new Date(trialEndsAt) : null;
  const isTrialExpired =
    safePlanCode === "trial_pro" &&
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
    canReceiveClients:
      !isTrialExpired &&
      !!features?.clients?.canAssign &&
      (maxClients <= 0 || Number(currentClients || 0) < maxClients),
    trialEndsAt: trialEndDate && Number.isFinite(trialEndDate.getTime()) ? trialEndDate : null,
    isTrialExpired: !!isTrialExpired,
    usesOverrides: sources.maxClients === "override" || hasFeatureOverrides(overrides),
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
