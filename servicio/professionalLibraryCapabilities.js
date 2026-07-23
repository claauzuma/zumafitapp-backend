const LIBRARY_CAPABILITY_KEYS = [
  "canCreateCoachMenus",
  "canCreateCoachMeals",
  "canUseGlobalMenuTemplates",
  "canUseGlobalMealTemplates",
  "canUsePremiumMenuTemplates",
  "canUsePremiumMealTemplates",
  "canDuplicateGlobalTemplates",
  "canAssignGlobalTemplates",
];

const CLOSED_CAPABILITIES = Object.freeze(
  Object.fromEntries(LIBRARY_CAPABILITY_KEYS.map((key) => [key, false]))
);

const PLAN_CAPABILITIES = Object.freeze({
  coach_initial: Object.freeze({
    canCreateCoachMenus: true,
    canCreateCoachMeals: true,
    canUseGlobalMenuTemplates: false,
    canUseGlobalMealTemplates: false,
    canUsePremiumMenuTemplates: false,
    canUsePremiumMealTemplates: false,
    canDuplicateGlobalTemplates: false,
    canAssignGlobalTemplates: false,
  }),
  coach_pro: Object.freeze({
    canCreateCoachMenus: true,
    canCreateCoachMeals: true,
    canUseGlobalMenuTemplates: true,
    canUseGlobalMealTemplates: true,
    canUsePremiumMenuTemplates: false,
    canUsePremiumMealTemplates: false,
    canDuplicateGlobalTemplates: true,
    canAssignGlobalTemplates: true,
  }),
  coach_ai: Object.freeze({
    canCreateCoachMenus: true,
    canCreateCoachMeals: true,
    canUseGlobalMenuTemplates: true,
    canUseGlobalMealTemplates: true,
    canUsePremiumMenuTemplates: true,
    canUsePremiumMealTemplates: true,
    canDuplicateGlobalTemplates: true,
    canAssignGlobalTemplates: true,
  }),
});

function token(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_");
}

function roleToken(user = {}) {
  const role = token(user?.role || user?.rol);
  if (["coach", "trainer", "nutritionist", "entrenador", "nutricionista", "trainernutri", "trainer_nutri"].includes(role)) {
    return "coach";
  }
  if (role === "admin") return "admin";
  if (["cliente", "client", "customer", "usuario", "user"].includes(role)) return "cliente";
  return role;
}

export function normalizeProfessionalLibraryPlan(value = "") {
  const plan = token(value);
  if (["coach_initial", "initial", "trial", "trial_pro", "free"].includes(plan)) return "coach_initial";
  if (["coach_pro", "pro", "premium"].includes(plan)) return "coach_pro";
  if (["coach_ai", "coach_vip", "vip", "premium2"].includes(plan)) return "coach_ai";
  return null;
}

export function professionalLibraryCapabilitiesForPlan(value = "") {
  const plan = normalizeProfessionalLibraryPlan(value);
  return {
    ...CLOSED_CAPABILITIES,
    ...(plan ? PLAN_CAPABILITIES[plan] : null),
    professionalPlan: plan || null,
  };
}

export function resolveProfessionalLibraryCapabilities(user = {}) {
  if (roleToken(user) === "admin") {
    return {
      ...PLAN_CAPABILITIES.coach_ai,
      professionalPlan: "admin",
    };
  }
  if (roleToken(user) !== "coach") {
    return {
      ...CLOSED_CAPABILITIES,
      professionalPlan: null,
    };
  }

  const features = user?.effectiveCapabilities?.features?.menus;
  if (features && typeof features === "object") {
    return {
      ...Object.fromEntries(LIBRARY_CAPABILITY_KEYS.map((key) => [key, features[key] === true])),
      professionalPlan:
        normalizeProfessionalLibraryPlan(
          user?.effectiveCapabilities?.professionalSubscription?.plan ||
          user?.effectiveCapabilities?.planCode ||
          user?.coachSubscription?.plan ||
          user?.plan
        ) || "coach_initial",
    };
  }

  return professionalLibraryCapabilitiesForPlan(
    user?.coachSubscription?.plan || user?.professionalPlan || user?.plan
  );
}

export function normalizeProfessionalTemplateTier(value = "", fallback = "global_basic") {
  const tier = token(value);
  if (["global_basic", "basic", "free"].includes(tier)) return "global_basic";
  if (["global_pro", "pro"].includes(tier)) return "global_pro";
  if (["global_premium", "premium", "vip"].includes(tier)) return "global_premium";
  return fallback;
}

export function professionalTemplateTier(item = {}) {
  const explicit = item?.templateTier || item?.tier || item?.libraryTier;
  if (explicit) return normalizeProfessionalTemplateTier(explicit);
  const visibility = token(item?.visibilidad || item?.visibility);
  const minimumPlan = token(item?.planMinimo || item?.minimumPlan || item?.plan);
  if (visibility === "premium" || minimumPlan === "vip") return "global_premium";
  if (minimumPlan === "pro" || visibility === "solo_coaches") return "global_pro";
  return "global_basic";
}

export function professionalTemplateSource(item = {}) {
  const explicit = token(item?.sourceType || item?.templateSource || item?.source);
  if (["assigned_snapshot", "snapshot", "asignado", "asignada"].includes(explicit)) return "assigned_snapshot";
  if (["client_owned", "cliente", "client"].includes(explicit)) return "client_owned";
  if (["coach_owned", "coach"].includes(explicit)) return "coach_owned";
  if (["admin_premium", "global_premium"].includes(explicit)) return "admin_premium";
  if (["admin_global", "global_basic", "global_pro", "admin"].includes(explicit)) return "admin_global";

  if (item?.clienteId || item?.assignedClientId) return "assigned_snapshot";
  const ownerType = token(item?.ownerType || item?.ownerRole || item?.creadaPorRol);
  if (ownerType === "coach") return "coach_owned";
  if (["cliente", "client"].includes(ownerType)) return "client_owned";
  if (ownerType === "assigned_snapshot") return "assigned_snapshot";
  if (ownerType === "admin") {
    return professionalTemplateTier(item) === "global_premium" ? "admin_premium" : "admin_global";
  }
  return "unknown";
}

export function canUseProfessionalTemplate(user = {}, item = {}, kind = "menu") {
  const source = professionalTemplateSource(item);
  if (!["admin_global", "admin_premium"].includes(source)) return false;
  const capabilities = resolveProfessionalLibraryCapabilities(user);
  const meal = String(kind || "menu").toLowerCase().startsWith("meal") || String(kind || "").toLowerCase().startsWith("comida");
  if (source === "admin_premium") {
    return meal
      ? capabilities.canUsePremiumMealTemplates === true
      : capabilities.canUsePremiumMenuTemplates === true;
  }
  return meal
    ? capabilities.canUseGlobalMealTemplates === true
    : capabilities.canUseGlobalMenuTemplates === true;
}

export { LIBRARY_CAPABILITY_KEYS };
