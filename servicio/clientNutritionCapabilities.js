import { getRuntimeClientPlanSetting } from "./clientPlanSettings.js";

function token(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_");
}

export const CLIENT_NUTRITION_CAPABILITIES = {
  free: {
    tracking: true,
    createOwnMenu: true,
    editOwnMenu: true,
    deleteOwnMenu: true,
    duplicateOwnMenu: true,
    activateOwnMenu: true,
    ownMenusLimit: 1,
    ownMealsLimit: 5,
    menuDaysLimit: 1,
    favoritesLimit: 3,
    trackingHistoryDays: 7,
    manualObjectiveChangeDays: 30,
    manualObjectiveChangesPerWindow: 2,
    basicLibrary: true,
    globalLibrary: false,
    premiumLibrary: false,
    automaticMenu: false,
    autoCompleteRemainingMeals: false,
    flexibleMarginRecommendations: false,
    manualDayCompletion: true,
    planRemainingIntake: false,
    autoCalculateTrackingQuantities: false,
    exportPdf: false,
  },
  pro: {
    tracking: true,
    createOwnMenu: true,
    editOwnMenu: true,
    deleteOwnMenu: true,
    duplicateOwnMenu: true,
    activateOwnMenu: true,
    ownMenusLimit: 10,
    ownMealsLimit: 100,
    menuDaysLimit: 7,
    favoritesLimit: 20,
    trackingHistoryDays: null,
    manualObjectiveChangeDays: null,
    manualObjectiveChangesPerWindow: null,
    basicLibrary: true,
    globalLibrary: true,
    premiumLibrary: false,
    automaticMenu: false,
    autoCompleteRemainingMeals: true,
    flexibleMarginRecommendations: true,
    manualDayCompletion: true,
    planRemainingIntake: true,
    autoCalculateTrackingQuantities: true,
    exportPdf: false,
  },
  vip: {
    tracking: true,
    createOwnMenu: true,
    editOwnMenu: true,
    deleteOwnMenu: true,
    duplicateOwnMenu: true,
    activateOwnMenu: true,
    ownMenusLimit: 50,
    ownMealsLimit: 500,
    menuDaysLimit: 7,
    favoritesLimit: 100,
    trackingHistoryDays: null,
    manualObjectiveChangeDays: null,
    manualObjectiveChangesPerWindow: null,
    basicLibrary: true,
    globalLibrary: true,
    premiumLibrary: true,
    automaticMenu: false,
    autoCompleteRemainingMeals: true,
    flexibleMarginRecommendations: true,
    manualDayCompletion: true,
    planRemainingIntake: true,
    autoCalculateTrackingQuantities: true,
    exportPdf: false,
  },
};

export function normalizeClientPlan(plan = "free") {
  const normalized = token(plan || "free");
  if (["premium", "pro"].includes(normalized)) return "pro";
  if (["premium2", "vip"].includes(normalized)) return "vip";
  return "free";
}

export function normalizeClientRole(role = "") {
  const normalized = token(role);
  if (["client", "customer", "usuario"].includes(normalized)) return "cliente";
  if (["trainer", "nutritionist", "entrenador", "nutricionista"].includes(normalized)) return "coach";
  return normalized;
}

function isTerminalCoachAccess(access = {}) {
  const status = token(access?.status || "");
  return (
    access?.active === false ||
    Boolean(access?.endedAt) ||
    ["ended", "finalized", "finished", "revoked", "unassigned", "inactive", "cancelled", "canceled"].includes(status)
  );
}

export function clientHasCoach(user = {}) {
  const access = user?.coachAccess || {};
  if (isTerminalCoachAccess(access)) return false;

  if (
    access?.coachId &&
    token(access?.status || "") === "active" &&
    access?.active !== false &&
    !access?.endedAt
  ) {
    return true;
  }

  return Boolean(
    user?.coach?.entrenadorId ||
    user?.coach?.coachId ||
    user?.coachId ||
    user?.entrenadorId ||
    user?.profesionalId
  );
}

export function getClientNutritionLimitsForPlan(plan = "free") {
  const code = normalizeClientPlan(plan);
  const base = CLIENT_NUTRITION_CAPABILITIES[code] || CLIENT_NUTRITION_CAPABILITIES.free;
  const setting = getRuntimeClientPlanSetting(code);
  return {
    ...base,
    ownMenusLimit: setting.limits.maxMenus,
    ownMealsLimit: setting.limits.maxSavedMeals,
    menuDaysLimit: setting.limits.maxDaysPerMenu,
    favoritesLimit: setting.limits.maxFavorites,
    trackingHistoryDays: setting.limits.trackingHistoryDays,
    manualObjectiveChangeDays: setting.limits.goalChangesWindowDays,
    manualObjectiveChangesPerWindow: setting.limits.goalChangesPerWindow,
    basicLibrary: ["basic", "global", "premium"].includes(setting.libraryAccess),
    globalLibrary: ["global", "premium"].includes(setting.libraryAccess),
    premiumLibrary: setting.libraryAccess === "premium",
  };
}

function hasActiveProTrial(user = {}) {
  const trial = user.personalTrial || user.trial || {};
  const status = token(trial.status || "");
  if (!["active", "trialing"].includes(status)) return false;
  const endsAt = trial.endsAt ? new Date(trial.endsAt) : null;
  return !!(endsAt && Number.isFinite(endsAt.getTime()) && endsAt.getTime() >= Date.now());
}

export function getClientNutritionCapabilities(user = {}, options = {}) {
  const role = normalizeClientRole(user?.role || user?.rol || "cliente");
  const plan = normalizeClientPlan(
    hasActiveProTrial(user)
      ? "pro"
      : (user?.personalPlan || user?.plan || user?.subscription?.planCode || "free")
  );
  const config = getClientNutritionLimitsForPlan(plan);
  const hasCoach = clientHasCoach(user);
  const requestedActiveSource = token(options.activeMenuSource || user?.menu?.activeSource || "none") || "none";
  const activeSource = requestedActiveSource === "coach" && !hasCoach ? "none" : requestedActiveSource;

  return {
    role,
    plan,
    clientType: hasCoach ? "with_coach" : "self_managed",
    hasCoach,
    canTrack: !!config.tracking,
    canCreateOwnMenu: role === "cliente" && !!config.createOwnMenu,
    canEditOwnMenu: role === "cliente" && !!config.editOwnMenu,
    canDeleteOwnMenu: role === "cliente" && !!config.deleteOwnMenu,
    canDuplicateOwnMenu: role === "cliente" && !!config.duplicateOwnMenu,
    canActivateOwnMenu: role === "cliente" && !!config.activateOwnMenu,
    canCopyLibraryMenu: role === "cliente" && !!config.basicLibrary,
    canUseBasicLibrary: !!config.basicLibrary,
    canUseGlobalLibrary: !!config.globalLibrary,
    canUsePremiumLibrary: !!config.premiumLibrary,
    canGenerateAutomaticMenu: !!config.automaticMenu,
    canAutoCompleteRemainingMeals: config.autoCompleteRemainingMeals === true,
    canUseFlexibleMarginRecommendations: config.flexibleMarginRecommendations === true,
    canUseManualDayCompletion: config.manualDayCompletion === true,
    canPlanRemainingIntake: config.planRemainingIntake === true || hasCoach,
    canAutoCalculateTrackingQuantities: config.autoCalculateTrackingQuantities === true || hasCoach,
    canViewCoachAdherenceBreakdown: hasCoach,
    canExportMenuPdf: !!config.exportPdf,
    limits: {
      ownMenus: config.ownMenusLimit,
      ownMeals: config.ownMealsLimit,
      menuDays: config.menuDaysLimit,
      favorites: config.favoritesLimit,
      trackingHistoryDays: config.trackingHistoryDays,
      manualObjectiveChangeDays: config.manualObjectiveChangeDays,
      manualObjectiveChangesPerWindow: config.manualObjectiveChangesPerWindow,
    },
    activeMenuSource: ["own", "coach"].includes(activeSource) ? activeSource : "none",
  };
}
