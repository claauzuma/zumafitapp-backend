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
    ownMenusLimit: 2,
    ownMealsLimit: 10,
    basicLibrary: true,
    globalLibrary: false,
    premiumLibrary: false,
    automaticMenu: false,
    exportPdf: false,
  },
  pro: {
    tracking: true,
    createOwnMenu: true,
    editOwnMenu: true,
    deleteOwnMenu: true,
    duplicateOwnMenu: true,
    activateOwnMenu: true,
    ownMenusLimit: 20,
    ownMealsLimit: 100,
    basicLibrary: true,
    globalLibrary: true,
    premiumLibrary: false,
    automaticMenu: false,
    exportPdf: false,
  },
  vip: {
    tracking: true,
    createOwnMenu: true,
    editOwnMenu: true,
    deleteOwnMenu: true,
    duplicateOwnMenu: true,
    activateOwnMenu: true,
    ownMenusLimit: 100,
    ownMealsLimit: 500,
    basicLibrary: true,
    globalLibrary: true,
    premiumLibrary: true,
    automaticMenu: false,
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

export function clientHasCoach(user = {}) {
  return Boolean(
    user?.coach?.entrenadorId ||
    user?.coach?.coachId ||
    user?.coachId ||
    user?.entrenadorId ||
    user?.profesionalId
  );
}

export function getClientNutritionLimitsForPlan(plan = "free") {
  return CLIENT_NUTRITION_CAPABILITIES[normalizeClientPlan(plan)] || CLIENT_NUTRITION_CAPABILITIES.free;
}

export function getClientNutritionCapabilities(user = {}, options = {}) {
  const role = normalizeClientRole(user?.role || user?.rol || "cliente");
  const plan = normalizeClientPlan(user?.plan || user?.subscription?.planCode || "free");
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
    canExportMenuPdf: !!config.exportPdf,
    limits: {
      ownMenus: config.ownMenusLimit,
      ownMeals: config.ownMealsLimit,
    },
    activeMenuSource: ["own", "coach"].includes(activeSource) ? activeSource : "none",
  };
}
