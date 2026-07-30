export const EQUIVALENT_NOTIFICATION_MODES = new Set([
  "none",
  "important_only",
  "weekly_digest",
  "all_consumed",
  "all_created",
]);

export const EQUIVALENT_APPROVAL_MODES = new Set(["immediate", "required", "pending_review"]);

export const EQUIVALENT_REVIEW_THRESHOLDS = Object.freeze({
  calorieAbsoluteKcal: 80,
  caloriePercent: 12,
  proteinAbsoluteGrams: 10,
  proteinPercent: 20,
  secondaryMacroPercent: 35,
  extremeContinuousQuantity: 4000,
  extremeDiscreteQuantity: 20,
  repeatedChanges: 3,
});

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clean(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function cleanId(value = "") {
  return String(value || "").trim();
}

function values(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return value.split(",");
  return [];
}

function foodId(food = {}) {
  return cleanId(food.foodId || food.alimentoId || food.id || food._id);
}

function foodName(food = {}) {
  return String(food.Alimentos || food.alimentos || food.nombre || food.name || "").trim();
}

function foodUnit(food = {}) {
  return clean(food.Unidad || food.unidad || food.unit || "g");
}

function foodSearchText(food = {}) {
  return clean([
    foodName(food),
    food.Fuente,
    food.fuente,
    food.Categoria,
    food.categoria,
    food.categoriaZumaFit,
    food.subcategoria,
    food.grupo,
    food.Grupo,
    ...(Array.isArray(food.tags) ? food.tags : []),
  ].filter(Boolean).join(" "));
}

function macroValues(food = {}) {
  return [
    food.Calorias ?? food.calorias ?? food.kcal ?? food.calories,
    food.Proteinas ?? food.proteinas ?? food.proteina ?? food.protein,
    food.Carbohidratos ?? food.carbohidratos ?? food.carbs ?? food.carbohydrates,
    food.Grasas ?? food.grasas ?? food.fat ?? food.fats,
  ].map(number);
}

function userRestrictionValues(user = {}) {
  const restrictions = user?.menu?.restrictions || {};
  const tracking = user?.clientPermissions?.tracking || {};
  return [
    ...values(restrictions.allergies),
    ...values(restrictions.intolerances),
    ...values(restrictions.excludedFoods),
    ...values(tracking.forbiddenFoods),
    ...values(tracking.forbiddenFoodIds),
  ].map((entry) => String(entry || "").trim()).filter(Boolean);
}

export function normalizeEquivalentTrackingSettings(tracking = {}) {
  const requestedNotification = clean(tracking.equivalentNotificationMode);
  const requestedApproval = clean(tracking.equivalentApprovalMode);
  return {
    equivalentNotificationMode: EQUIVALENT_NOTIFICATION_MODES.has(requestedNotification)
      ? requestedNotification
      : "weekly_digest",
    equivalentNotifyImportantImmediately: tracking.equivalentNotifyImportantImmediately !== false,
    equivalentApprovalMode: EQUIVALENT_APPROVAL_MODES.has(requestedApproval)
      ? requestedApproval === "pending_review" ? "required" : requestedApproval
      : "immediate",
  };
}

export function equivalentApprovalRequired(user = {}) {
  const hasCoach = Boolean(user?.coach?.entrenadorId || user?.coach?.coachId);
  if (!hasCoach) return false;
  return normalizeEquivalentTrackingSettings(user?.clientPermissions?.tracking).equivalentApprovalMode === "required";
}

export function isEquivalentFoodAllowed(user = {}, food = {}, options = {}) {
  if (!food || typeof food !== "object") return false;
  if (food.activo === false || food.activa === false || food.habilitado === false || food.enabled === false || food.disabled === true) {
    return false;
  }
  const id = foodId(food);
  const name = foodName(food);
  if (!id || !name) return false;
  const macros = macroValues(food);
  if (!macros.every(Number.isFinite) || macros.some((value) => value < 0) || macros[0] <= 0) return false;

  const rejected = new Set(values(options.rejectedFoodIds).map(cleanId).filter(Boolean));
  if (rejected.has(id)) return false;
  const selected = new Set(values(options.selectedFoodIds).map(cleanId).filter(Boolean));
  if (selected.has(id)) return false;

  const searchText = foodSearchText(food);
  const restrictions = userRestrictionValues(user);
  for (const raw of restrictions) {
    const restrictionId = cleanId(raw);
    if (restrictionId && restrictionId === id) return false;
    const token = clean(raw);
    if (token && token.length >= 2 && searchText.includes(token)) return false;
  }
  return true;
}

export function filterEquivalentCandidateFoods(user = {}, foods = [], options = {}) {
  const seenIds = new Set();
  const seenSemanticKeys = new Set();
  return (Array.isArray(foods) ? foods : []).filter((food) => {
    if (!isEquivalentFoodAllowed(user, food, options)) return false;
    const id = foodId(food);
    const semanticKey = `${clean(foodName(food))}|${foodUnit(food)}`;
    if (seenIds.has(id) || seenSemanticKeys.has(semanticKey)) return false;
    seenIds.add(id);
    seenSemanticKeys.add(semanticKey);
    return true;
  });
}

function totals(value = {}) {
  const source = value?.totals || value?.totales || value;
  return {
    kcal: number(source.kcal ?? source.calorias),
    proteina: number(source.proteina ?? source.proteinas ?? source.protein),
    carbs: number(source.carbs ?? source.carbohidratos),
    grasas: number(source.grasas ?? source.fat),
  };
}

function percent(absDiff, target) {
  const safeTarget = Math.abs(number(target));
  return safeTarget > 0 ? (Math.abs(number(absDiff)) / safeTarget) * 100 : 0;
}

function isDiscreteUnit(unit = "") {
  const normalized = clean(unit);
  return !["g", "gr", "gramo", "gramos", "ml", "mililitro", "mililitros"].includes(normalized);
}

export function equivalentReview(entry = {}, options = {}) {
  const target = totals(entry.target);
  const result = entry.resultTotals ? totals(entry.resultTotals) : {
    kcal: target.kcal + number(entry?.totals?.kcal),
    proteina: target.proteina + number(entry?.totals?.proteina),
    carbs: target.carbs + number(entry?.totals?.carbs),
    grasas: target.grasas + number(entry?.totals?.grasas),
  };
  const diff = {
    kcal: result.kcal - target.kcal,
    proteina: result.proteina - target.proteina,
    carbs: result.carbs - target.carbs,
    grasas: result.grasas - target.grasas,
  };
  const reasons = [];
  const thresholds = EQUIVALENT_REVIEW_THRESHOLDS;
  if (
    Math.abs(diff.kcal) >= thresholds.calorieAbsoluteKcal &&
    percent(diff.kcal, target.kcal) >= thresholds.caloriePercent
  ) reasons.push(diff.kcal > 0 ? "calorie_over_target" : "material_calorie_gap");
  if (
    target.proteina > 0 && diff.proteina < -thresholds.proteinAbsoluteGrams &&
    percent(diff.proteina, target.proteina) >= thresholds.proteinPercent
  ) reasons.push("material_protein_gap");
  if (
    (target.carbs > 0 && percent(diff.carbs, target.carbs) >= thresholds.secondaryMacroPercent) ||
    (target.grasas > 0 && percent(diff.grasas, target.grasas) >= thresholds.secondaryMacroPercent)
  ) reasons.push("secondary_macros_far");
  if ((entry.foods || []).some((food) => {
    const quantity = number(food.quantity ?? food.cantidad);
    return isDiscreteUnit(food.unit || food.unidad)
      ? quantity >= thresholds.extremeDiscreteQuantity
      : quantity >= thresholds.extremeContinuousQuantity;
  })) reasons.push("extreme_quantity");
  if (entry.warningAccepted === true || (entry.acceptedWarnings || []).length) reasons.push("strong_warning_accepted");
  if (entry.approvalStatus === "pending_review") reasons.push("approval_required");
  if (number(options.changeCount) >= thresholds.repeatedChanges) reasons.push("repeated_changes");
  if (entry.targetVersionChanged === true) reasons.push("target_changed");
  return { important: reasons.length > 0, reasons: [...new Set(reasons)], target, result, diff };
}

export function equivalentNotificationVisibility(user = {}, event = "", review = {}) {
  const config = normalizeEquivalentTrackingSettings(user?.clientPermissions?.tracking);
  const important = review?.important === true || event === "client_equivalent_pending_approval";
  if (config.equivalentNotificationMode === "none") return { visible: false, digest: false, immediate: false };
  const digest = config.equivalentNotificationMode === "weekly_digest";
  const immediateImportant = important && config.equivalentNotifyImportantImmediately;
  const visibleByMode =
    config.equivalentNotificationMode === "all_created" && event === "client_equivalent_created" ||
    config.equivalentNotificationMode === "all_consumed" && event === "client_equivalent_consumed" ||
    config.equivalentNotificationMode === "important_only" && important;
  return {
    visible: immediateImportant || visibleByMode,
    digest,
    immediate: immediateImportant || visibleByMode,
  };
}

export function equivalentFoodIdentity(food = {}) {
  return { id: foodId(food), name: foodName(food), unit: foodUnit(food) || "g" };
}
