export const CLIENT_PLAN_SETTING_CODES = Object.freeze(["free", "pro", "vip"]);

export const BASE_CLIENT_PLAN_SETTINGS = Object.freeze({
  free: Object.freeze({
    code: "free",
    label: "Free",
    limits: Object.freeze({
      maxMenus: 1,
      maxDaysPerMenu: 1,
      maxSavedMeals: 5,
      maxFavorites: 3,
      trackingHistoryDays: 7,
      goalChangesPerWindow: 2,
      goalChangesWindowDays: 30,
    }),
    libraryAccess: "basic",
  }),
  pro: Object.freeze({
    code: "pro",
    label: "Pro",
    limits: Object.freeze({
      maxMenus: 10,
      maxDaysPerMenu: 7,
      maxSavedMeals: 100,
      maxFavorites: 20,
      trackingHistoryDays: null,
      goalChangesPerWindow: null,
      goalChangesWindowDays: null,
    }),
    libraryAccess: "global",
  }),
  vip: Object.freeze({
    code: "vip",
    label: "VIP",
    limits: Object.freeze({
      maxMenus: 50,
      maxDaysPerMenu: 7,
      maxSavedMeals: 500,
      maxFavorites: 100,
      trackingHistoryDays: null,
      goalChangesPerWindow: null,
      goalChangesWindowDays: null,
    }),
    libraryAccess: "premium",
  }),
});

const runtimeSettings = new Map(
  CLIENT_PLAN_SETTING_CODES.map((code) => [code, cloneClientPlanSetting(BASE_CLIENT_PLAN_SETTINGS[code])])
);

const CLIENT_LIMIT_RULES = Object.freeze({
  maxMenus: { min: 0, max: 100000 },
  maxDaysPerMenu: { min: 1, max: 7 },
  maxSavedMeals: { min: 0, max: 250000 },
  maxFavorites: { min: 0, max: 100000 },
  trackingHistoryDays: { min: 1, max: 36500, nullable: true },
  goalChangesPerWindow: { min: 0, max: 1000, nullable: true },
  goalChangesWindowDays: { min: 1, max: 3650, nullable: true },
});

function token(value = "") {
  return String(value || "").trim().toLowerCase();
}

function nullableInteger(value, fallback) {
  if (value === null) return null;
  if (value === undefined || value === "") return fallback;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : fallback;
}

export function normalizeClientPlanSettingCode(value = "") {
  const code = token(value);
  if (["premium", "pro"].includes(code)) return "pro";
  if (["premium2", "vip"].includes(code)) return "vip";
  if (["free", "lite", "free_lite"].includes(code)) return "free";
  return null;
}

export function cloneClientPlanSetting(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

export function normalizeClientPlanSetting(docOrCode) {
  const raw = docOrCode && typeof docOrCode === "object" ? docOrCode : {};
  const code = normalizeClientPlanSettingCode(raw.code || docOrCode);
  if (!code) return null;
  const base = cloneClientPlanSetting(BASE_CLIENT_PLAN_SETTINGS[code]);
  const limits = raw.limits && typeof raw.limits === "object" ? raw.limits : {};
  const libraryAccess = token(raw.libraryAccess || raw.library || base.libraryAccess);

  return {
    ...base,
    label: String(raw.label || base.label),
    limits: {
      maxMenus: nullableInteger(limits.maxMenus ?? limits.ownMenus, base.limits.maxMenus),
      maxDaysPerMenu: nullableInteger(limits.maxDaysPerMenu ?? limits.menuDays, base.limits.maxDaysPerMenu),
      maxSavedMeals: nullableInteger(limits.maxSavedMeals ?? limits.ownMeals, base.limits.maxSavedMeals),
      maxFavorites: nullableInteger(limits.maxFavorites ?? limits.favorites, base.limits.maxFavorites),
      trackingHistoryDays: nullableInteger(limits.trackingHistoryDays, base.limits.trackingHistoryDays),
      goalChangesPerWindow: nullableInteger(
        limits.goalChangesPerWindow ?? limits.manualObjectiveChangesPerWindow,
        base.limits.goalChangesPerWindow
      ),
      goalChangesWindowDays: nullableInteger(
        limits.goalChangesWindowDays ?? limits.manualObjectiveChangeDays,
        base.limits.goalChangesWindowDays
      ),
    },
    libraryAccess: ["basic", "global", "premium"].includes(libraryAccess)
      ? libraryAccess
      : base.libraryAccess,
    updatedAt: raw.updatedAt || null,
    updatedBy: raw.updatedBy || null,
  };
}

export function validateClientPlanSettingPatch(patch = {}) {
  const limits = patch?.limits && typeof patch.limits === "object" ? patch.limits : {};
  const validatedLimits = {};
  for (const [key, value] of Object.entries(limits)) {
    const rule = CLIENT_LIMIT_RULES[key];
    if (!rule) continue;
    if (value === null && rule.nullable) {
      validatedLimits[key] = null;
      continue;
    }
    const number = Number(value);
    if (!Number.isInteger(number) || number < rule.min) {
      const error = new Error("CLIENT_PLAN_LIMIT_INVALID");
      error.resource = key;
      error.minimum = rule.min;
      throw error;
    }
    if (number > rule.max) {
      const error = new Error("CLIENT_PLAN_LIMIT_TOO_HIGH");
      error.resource = key;
      error.maximum = rule.max;
      throw error;
    }
    validatedLimits[key] = number;
  }

  const output = { ...patch, limits: validatedLimits };
  if (patch.libraryAccess !== undefined) {
    const libraryAccess = token(patch.libraryAccess);
    if (!["basic", "global", "premium"].includes(libraryAccess)) {
      const error = new Error("CLIENT_LIBRARY_ACCESS_INVALID");
      error.resource = "libraryAccess";
      throw error;
    }
    output.libraryAccess = libraryAccess;
  }
  return output;
}

export function setRuntimeClientPlanSetting(value) {
  const normalized = normalizeClientPlanSetting(value);
  if (!normalized) return null;
  runtimeSettings.set(normalized.code, cloneClientPlanSetting(normalized));
  return cloneClientPlanSetting(normalized);
}

export function setRuntimeClientPlanSettings(values = []) {
  for (const value of values || []) setRuntimeClientPlanSetting(value);
  return getRuntimeClientPlanSettings();
}

export function getRuntimeClientPlanSetting(value = "free") {
  const code = normalizeClientPlanSettingCode(value) || "free";
  return cloneClientPlanSetting(runtimeSettings.get(code) || BASE_CLIENT_PLAN_SETTINGS[code]);
}

export function getRuntimeClientPlanSettings() {
  return CLIENT_PLAN_SETTING_CODES.map((code) => getRuntimeClientPlanSetting(code));
}
