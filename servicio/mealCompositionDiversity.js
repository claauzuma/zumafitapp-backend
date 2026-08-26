const MAX_PREVIOUS_MEALS = 24;
const MAX_FOODS_PER_MEAL = 12;
const HIGH_OVERLAP_JACCARD = 0.6;
const HIGH_OVERLAP_CONTAINMENT = 0.8;

function clean(value) {
  return String(value ?? "").trim();
}

function foodId(value = {}) {
  return clean(value.foodId ?? value.alimentoId ?? value.id ?? value._id);
}

function foodRole(value = {}) {
  return clean(value.role ?? value.generationRole ?? value.structuralRole).toUpperCase();
}

function sourceFoods(value = {}) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value.foods)) return value.foods;
  if (Array.isArray(value.items)) return value.items;
  if (Array.isArray(value.alimentos)) return value.alimentos;
  return [];
}

function isNormalizedComposition(value = {}) {
  return Array.isArray(value?.foodIds) &&
    Array.isArray(value?.roleFoodPairs) &&
    typeof value?.fingerprint === "string" &&
    typeof value?.roleFingerprint === "string";
}

function asMealComposition(value = {}) {
  return isNormalizedComposition(value) ? value : normalizeMealComposition(value);
}

export function normalizeMealComposition(value = {}) {
  const roleAssignments = value?.roleAssignments && typeof value.roleAssignments === "object"
    ? value.roleAssignments
    : {};
  const roleByFood = new Map(
    (Array.isArray(value?.roleFoodPairs) ? value.roleFoodPairs : [])
      .map((pair) => String(pair || "").split(":"))
      .filter(([id]) => clean(id))
      .map(([id, role]) => [clean(id), clean(role === "_" ? "" : role).toUpperCase()])
  );
  const entries = sourceFoods(value).map((food) => {
    const id = foodId(food);
    return {
      foodId: id,
      role: foodRole(food) || clean(roleAssignments[id]).toUpperCase() || roleByFood.get(id) || "",
    };
  });
  if (!entries.length && Array.isArray(value?.foodIds)) {
    entries.push(...value.foodIds.map((id) => ({
      foodId: clean(id),
      role: clean(roleAssignments[clean(id)]).toUpperCase() || roleByFood.get(clean(id)) || "",
    })));
  }
  const byFood = new Map();
  for (const entry of entries) {
    if (!entry.foodId || byFood.size >= MAX_FOODS_PER_MEAL) continue;
    const current = byFood.get(entry.foodId);
    if (!current || (!current.role && entry.role)) byFood.set(entry.foodId, entry);
  }
  const normalized = [...byFood.values()].sort((left, right) =>
    left.foodId.localeCompare(right.foodId) || left.role.localeCompare(right.role)
  );
  const foodIds = normalized.map((entry) => entry.foodId);
  const roleFoodPairs = normalized.map((entry) => `${entry.foodId}:${entry.role || "_"}`);
  return {
    foodIds,
    roleFoodPairs,
    fingerprint: foodIds.join("|"),
    roleFingerprint: roleFoodPairs.join("|"),
  };
}

export function normalizeMealDiversityContext(value = {}) {
  const rawMeals = Array.isArray(value?.previousMeals)
    ? value.previousMeals
    : Array.isArray(value?.compositions)
      ? value.compositions
      : [];
  const previousMeals = rawMeals
    .slice(0, MAX_PREVIOUS_MEALS)
    .map(normalizeMealComposition)
    .filter((entry) => entry.foodIds.length)
    .filter((entry, index, values) =>
      values.findIndex((candidate) => candidate.roleFingerprint === entry.roleFingerprint) === index
    );
  const usedFoodIds = new Set([
    ...(value?.usedFoodIds instanceof Set
      ? [...value.usedFoodIds].map(clean)
      : Array.isArray(value?.usedFoodIds) ? value.usedFoodIds.map(clean) : []),
    ...previousMeals.flatMap((entry) => entry.foodIds),
  ].filter(Boolean));
  const usedRoleFoodPairs = new Set([
    ...(value?.usedRoleFoodPairs instanceof Set
      ? [...value.usedRoleFoodPairs].map(clean)
      : Array.isArray(value?.usedRoleFoodPairs) ? value.usedRoleFoodPairs.map(clean) : []),
    ...previousMeals.flatMap((entry) => entry.roleFoodPairs),
  ].filter(Boolean));
  const previousMealFoodSets = previousMeals.map((entry) => new Set(entry.foodIds));
  return { previousMeals, previousMealFoodSets, usedFoodIds, usedRoleFoodPairs };
}

function compositionOverlap(left, right, leftIds, rightIds) {
  const intersectionIds = [...leftIds].filter((id) => rightIds.has(id));
  const unionSize = new Set([...leftIds, ...rightIds]).size;
  const smallerSize = Math.min(leftIds.size, rightIds.size);
  const intersection = intersectionIds.length;
  const jaccard = unionSize ? intersection / unionSize : 0;
  const containment = smallerSize ? intersection / smallerSize : 0;
  const exact = Boolean(leftIds.size && leftIds.size === rightIds.size && intersection === leftIds.size);
  const highOverlap = intersection >= 2 && (
    jaccard >= HIGH_OVERLAP_JACCARD || containment >= HIGH_OVERLAP_CONTAINMENT
  );
  return {
    exact,
    highOverlap,
    intersection,
    intersectionIds,
    unionSize,
    jaccard: Math.round(jaccard * 1e6) / 1e6,
    containment: Math.round(containment * 1e6) / 1e6,
  };
}

export function mealCompositionOverlap(leftValue = {}, rightValue = {}) {
  const left = asMealComposition(leftValue);
  const right = asMealComposition(rightValue);
  return compositionOverlap(left, right, new Set(left.foodIds), new Set(right.foodIds));
}

export function assessMealCompositionDiversity(
  compositionValue = {},
  contextValue = {},
  { includeComparisons = true } = {},
) {
  const composition = asMealComposition(compositionValue);
  const context = contextValue?.usedFoodIds instanceof Set
    ? contextValue
    : normalizeMealDiversityContext(contextValue);
  const compositionFoodIds = new Set(composition.foodIds);
  const previousMealFoodSets = Array.isArray(context.previousMealFoodSets)
    ? context.previousMealFoodSets
    : context.previousMeals.map((entry) => new Set(entry.foodIds));
  let exactMatches = 0;
  let highOverlapMatches = 0;
  let maxJaccard = 0;
  let maxContainment = 0;
  const comparisons = [];
  context.previousMeals.forEach((previous, index) => {
    const overlap = compositionOverlap(
      composition,
      previous,
      compositionFoodIds,
      previousMealFoodSets[index],
    );
    if (overlap.exact) exactMatches += 1;
    if (overlap.highOverlap) highOverlapMatches += 1;
    maxJaccard = Math.max(maxJaccard, overlap.jaccard);
    maxContainment = Math.max(maxContainment, overlap.containment);
    if (includeComparisons) {
      comparisons.push({
        previousIndex: index,
        previousFingerprint: previous.fingerprint,
        ...overlap,
      });
    }
  });
  const repeatedFoodIds = composition.foodIds.filter((id) => context.usedFoodIds.has(id));
  return {
    composition,
    contextMeals: context.previousMeals.length,
    exactMatches,
    highOverlapMatches,
    maxJaccard,
    maxContainment,
    repeatedFoodIds,
    repeatedFoodCount: repeatedFoodIds.length,
    comparisons,
  };
}

export function compareMealCompositionDiversity(left = {}, right = {}) {
  return Number(left.exactMatches || 0) - Number(right.exactMatches || 0) ||
    Number(left.highOverlapMatches || 0) - Number(right.highOverlapMatches || 0) ||
    Number(left.maxContainment || 0) - Number(right.maxContainment || 0) ||
    Number(left.maxJaccard || 0) - Number(right.maxJaccard || 0) ||
    Number(left.repeatedFoodCount || 0) - Number(right.repeatedFoodCount || 0);
}

export const MEAL_COMPOSITION_DIVERSITY_THRESHOLDS = Object.freeze({
  highOverlapJaccard: HIGH_OVERLAP_JACCARD,
  highOverlapContainment: HIGH_OVERLAP_CONTAINMENT,
});
