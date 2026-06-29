import { getClientNutritionLimitsForPlan } from "./clientNutritionCapabilities.js";

export function idToString(id) {
  return id?.toString?.() || String(id || "");
}

export function normalizeRole(userOrRole = {}) {
  const raw = typeof userOrRole === "string" ? userOrRole : userOrRole?.role || userOrRole?.rol;
  const role = String(raw || "").trim().toLowerCase();
  if (["client", "customer"].includes(role)) return "cliente";
  if (["trainer", "nutritionist", "entrenador", "nutricionista", "trainernutri", "trainer_nutri", "trainernutri"].includes(role)) return "coach";
  if (["cliente", "coach", "admin"].includes(role)) return role;
  return role;
}

export function normalizePlan(userOrPlan = {}) {
  if (typeof userOrPlan !== "string") {
    const trial = userOrPlan?.personalTrial || userOrPlan?.trial || {};
    const status = String(trial?.status || "").trim().toLowerCase();
    const endsAt = trial?.endsAt ? new Date(trial.endsAt) : null;
    if (
      ["active", "trialing"].includes(status) &&
      endsAt &&
      Number.isFinite(endsAt.getTime()) &&
      endsAt.getTime() >= Date.now()
    ) {
      return "pro";
    }
  }
  const raw = typeof userOrPlan === "string"
    ? userOrPlan
    : userOrPlan?.personalPlan || userOrPlan?.plan || userOrPlan?.subscription?.planCode || userOrPlan?.personalSubscription?.plan;
  const plan = String(raw || "free").trim().toLowerCase();
  if (["premium", "pro"].includes(plan)) return "pro";
  if (["premium2", "vip"].includes(plan)) return "vip";
  if (["coach", "nutri", "trainernutri", "trainer_nutri", "gym", "admin"].includes(plan)) return plan;
  return "free";
}

export function getOwnerType(user = {}) {
  const role = normalizeRole(user);
  if (role === "admin") return "admin";
  if (role === "coach") return "coach";
  return "cliente";
}

export function isAdmin(user = {}) {
  return normalizeRole(user) === "admin";
}

export function isCoach(user = {}) {
  return normalizeRole(user) === "coach";
}

export function isClient(user = {}) {
  return normalizeRole(user) === "cliente";
}

export function getSavedMealLimit(user = {}) {
  const role = normalizeRole(user);
  if (role === "admin") return Number.POSITIVE_INFINITY;
  if (role === "coach") return 10000;

  return getClientNutritionLimitsForPlan(normalizePlan(user)).ownMealsLimit;
}

export function canCreateSavedMeal(user = {}, currentCount = 0) {
  const limit = getSavedMealLimit(user);
  return Number(currentCount || 0) < limit;
}

export function isMealOwner(user = {}, meal = {}) {
  const userId = idToString(user?._id || user?.id);
  return Boolean(userId && idToString(meal?.ownerId || meal?.userId) === userId);
}

export function isMealAssignedToUser(userOrId = {}, meal = {}) {
  const userId = typeof userOrId === "string" ? userOrId : idToString(userOrId?._id || userOrId?.id);
  if (!userId) return false;
  return (Array.isArray(meal?.asignadaA) ? meal.asignadaA : []).some((entry) => {
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      return idToString(entry.clienteId || entry.userId || entry.id) === userId;
    }
    return idToString(entry) === userId;
  });
}

function planAllowsVisibility(user = {}, visibility = "") {
  const raw = String(visibility || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  const normalized =
    raw === "publica" || raw === "sistema"
      ? "global"
      : raw === "coaches"
        ? "solo_coaches"
        : raw === "clientes"
          ? "solo_clientes"
          : raw === "clientesasignados" || raw === "clientes_asignados"
            ? "asignada"
            : raw;
  const plan = normalizePlan(user);
  const tier = plan === "vip" || ["coach", "nutri", "trainernutri", "trainer_nutri", "gym", "admin"].includes(plan)
    ? "vip"
    : plan === "pro"
      ? "pro"
      : "free";

  if (normalized === "global") return true;
  if (normalized === "premium") return tier === "vip";
  if (normalized === "solo_coaches") return isCoach(user) && tier !== "free";
  if (normalized === "solo_clientes") return isClient(user) && tier === "vip";
  return false;
}

export function canAccessSavedMeal(user = {}, meal = {}) {
  if (!meal) return false;
  if (isAdmin(user)) return true;
  if (meal.activo === false) return false;
  if (isMealOwner(user, meal)) return true;
  if (isMealAssignedToUser(user, meal)) return true;

  const visibility = String(meal.visibilidad || "").trim();
  if (planAllowsVisibility(user, visibility)) return true;
  if (isCoach(user) && visibility === "gimnasio") return true;

  return false;
}

export function canEditSavedMeal(user = {}, meal = {}) {
  if (!meal) return false;
  if (isAdmin(user)) return true;
  return isMealOwner(user, meal);
}

export function canAssignSavedMeal(user = {}, meal = {}) {
  if (!meal) return false;
  if (isAdmin(user)) return true;
  if (!isCoach(user)) return false;
  if (isMealOwner(user, meal)) return true;
  return ["gimnasio", "global", "premium", "solo_coaches"].includes(String(meal.visibilidad || ""));
}
