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
  const raw = typeof userOrPlan === "string" ? userOrPlan : userOrPlan?.plan || userOrPlan?.subscription?.planCode;
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
  return "user";
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

  const plan = normalizePlan(user);
  if (plan === "vip") return 10000;
  if (plan === "pro") return 50;
  return 5;
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
  return (Array.isArray(meal?.asignadaA) ? meal.asignadaA : []).some((id) => idToString(id) === userId);
}

function planAllowsVisibility(user = {}, visibility = "") {
  if (visibility === "global") return true;
  if (visibility !== "premium") return false;
  return ["pro", "vip", "coach", "nutri", "trainernutri", "gym", "admin"].includes(normalizePlan(user)) || isCoach(user) || isAdmin(user);
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
  return ["gimnasio", "global", "premium"].includes(String(meal.visibilidad || ""));
}
