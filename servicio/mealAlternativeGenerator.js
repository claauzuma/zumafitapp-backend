import ModelMongoDBAlimentos from "../model/DAO/alimentosMongoDB.js";
import ServicioAlimentos, {
  TRACKING_QUANTITY_INTERNAL_CONTEXT,
} from "./alimentos.js";
import {
  FOOD_COMBINATION_MODES,
  generateFoodCombinationCandidates,
} from "./foodCombinationCandidates.js";

const CALORIE_ZONE_TOLERANCE = 1;
const PROTEIN_REACHED_TOLERANCE = 0.5;
const DEFAULT_CANDIDATE_LIMIT = 20;
const MAX_CANDIDATE_LIMIT = 40;
const DEFAULT_MAX_FOODS = 6;

const MEAL_TYPE_ALIASES = Object.freeze({
  breakfast: "breakfast",
  desayuno: "breakfast",
  lunch: "lunch",
  almuerzo: "lunch",
  dinner: "dinner",
  cena: "dinner",
  snack: "snack",
  merienda: "snack",
  colacion: "extraSnack",
  colacion_extra: "extraSnack",
  extrasnack: "extraSnack",
  extra_snack: "extraSnack",
  otra: "extraSnack",
  otro: "extraSnack",
});

function generationError(code, message, field = "generation") {
  const error = new Error(code);
  error.code = code;
  error.publicMessage = message;
  error.field = field;
  return error;
}

function token(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function normalizeMealAlternativeMealType(value) {
  const normalized = MEAL_TYPE_ALIASES[token(value)];
  if (!normalized) {
    throw generationError("INVALID_MEAL_TYPE", "El tipo de comida no es valido.", "mealType");
  }
  return normalized;
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(number(value) * factor) / factor;
}

function normalizeTarget(value = {}) {
  const target = {
    kcal: Math.max(0, number(value.kcal ?? value.calorias ?? value.calories)),
    proteina: Math.max(0, number(value.proteina ?? value.protein ?? value.proteinas)),
    carbs: Math.max(0, number(value.carbs ?? value.carbohidratos ?? value.carbohydrates)),
    grasas: Math.max(0, number(value.grasas ?? value.fat ?? value.grasa)),
  };
  if (!(target.kcal > 0)) {
    throw generationError("INVALID_MEAL_TARGET", "La meta de la comida debe tener calorias mayores a cero.", "target.kcal");
  }
  return target;
}

function uniqueIds(values, field) {
  if (!Array.isArray(values)) {
    throw generationError("INVALID_FOOD_CONSTRAINTS", `${field} debe ser un array.`, field);
  }
  const ids = values.map((value) => String(value ?? "").trim());
  if (ids.some((id) => !id)) {
    throw generationError("INVALID_FOOD_CONSTRAINTS", `${field} contiene un ID vacio.`, field);
  }
  return [...new Set(ids)];
}

function safeLimit(value, fallback, maximum) {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

function foodPrimaryId(food = {}) {
  return String(food._id ?? food.id ?? food.alimentoId ?? "").trim();
}

function foodAliases(food = {}) {
  return new Set([food._id, food.id, food.alimentoId].map((value) => String(value ?? "").trim()).filter(Boolean));
}

function foodName(food = {}) {
  return String(food.Alimentos || food.alimentos || food.nombre || food.name || "Alimento").trim();
}

function normalizedName(value = "") {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function nutrition(value = {}) {
  return {
    kcal: round(value.kcal ?? value.calorias ?? value.calories),
    proteina: round(value.proteina ?? value.protein ?? value.proteinas),
    carbs: round(value.carbs ?? value.carbohidratos ?? value.carbohydrates),
    grasas: round(value.grasas ?? value.fat ?? value.grasa),
  };
}

function difference(totals, target) {
  return {
    kcal: round(totals.kcal - target.kcal),
    proteina: round(totals.proteina - target.proteina),
    carbs: round(totals.carbs - target.carbs),
    grasas: round(totals.grasas - target.grasas),
  };
}

function findCatalogFood(catalog, generatedFood = {}, requestedId = "") {
  const generatedIds = new Set([
    generatedFood.foodId,
    generatedFood.id,
    generatedFood.alimentoId,
    generatedFood._id,
  ].map((value) => String(value ?? "").trim()).filter(Boolean));
  if (generatedIds.size) {
    const exact = catalog.find((food) => [...foodAliases(food)].some((id) => generatedIds.has(id)));
    if (exact) return exact;
  }
  const name = normalizedName(generatedFood.name || generatedFood.nombre);
  const byName = name ? catalog.find((food) => normalizedName(foodName(food)) === name) : null;
  if (byName) return byName;
  const requested = String(requestedId || "").trim();
  return requested
    ? catalog.find((food) => foodAliases(food).has(requested)) || null
    : null;
}

function publicFood(generatedFood, sourceFood, candidate) {
  const quantity = number(generatedFood.quantity ?? generatedFood.cantidad);
  const sourceId = foodPrimaryId(sourceFood) || String(generatedFood.foodId || generatedFood.id || "");
  return {
    foodId: sourceId,
    name: generatedFood.name || generatedFood.nombre || foodName(sourceFood),
    role: candidate.roleAssignments?.[sourceId] || null,
    quantity: round(quantity, 6),
    unit: generatedFood.unit || generatedFood.unidad || sourceFood?.unidad || sourceFood?.Unidad || "g",
    kcal: round(generatedFood.kcal ?? generatedFood.calorias),
    proteina: round(generatedFood.proteina ?? generatedFood.protein),
    carbs: round(generatedFood.carbs ?? generatedFood.carbohidratos),
    grasas: round(generatedFood.grasas ?? generatedFood.fat),
    image: generatedFood.imagen || sourceFood?.imagen || null,
    imageUrl: generatedFood.imagenUrl || sourceFood?.imagenUrl || sourceFood?.imagen?.url || "",
  };
}

function secondaryMacroError(totals, target) {
  const carbScale = target.carbs > 0 ? target.carbs : 25;
  const fatScale = target.grasas > 0 ? target.grasas : 10;
  return ((totals.carbs - target.carbs) / carbScale) ** 2 +
    ((totals.grasas - target.grasas) / fatScale) ** 2;
}

function nutritionalRank(solution, target) {
  const totals = solution.totals;
  const calorieDeficit = Math.max(0, target.kcal - totals.kcal);
  const inCalorieZone = calorieDeficit <= CALORIE_ZONE_TOLERANCE + 1e-9;
  const proteinDeficit = target.proteina > 0 ? Math.max(0, target.proteina - totals.proteina) : 0;
  const proteinDistance = target.proteina > 0 ? Math.abs(target.proteina - totals.proteina) : 0;
  const proteinReached = target.proteina <= 0 || proteinDeficit <= PROTEIN_REACHED_TOLERANCE + 1e-9;
  const proteinPriority = target.proteina <= 0
    ? 0
    : proteinReached
      ? Math.max(0, proteinDistance - 1)
      : proteinDeficit;
  return {
    inCalorieZone,
    calorieDeficit,
    proteinReached,
    proteinPriority,
    proteinDistance,
    secondaryError: secondaryMacroError(totals, target),
    hasMacroLimitations: Array.isArray(solution.optimization?.macroLimitations) &&
      solution.optimization.macroLimitations.length > 0,
  };
}

function compareSolutions(left, right, target) {
  const a = left.ranking;
  const b = right.ranking;
  if (a.inCalorieZone !== b.inCalorieZone) return a.inCalorieZone ? -1 : 1;
  if (!a.inCalorieZone && Math.abs(a.calorieDeficit - b.calorieDeficit) > 1e-9) {
    return a.calorieDeficit - b.calorieDeficit;
  }
  if (target.proteina > 0) {
    if (a.proteinReached !== b.proteinReached) return a.proteinReached ? -1 : 1;
    if (Math.abs(a.proteinPriority - b.proteinPriority) > 1e-9) return a.proteinPriority - b.proteinPriority;
  }
  if (Math.abs(a.secondaryError - b.secondaryError) > 1e-9) return a.secondaryError - b.secondaryError;
  if (left.foods.length !== right.foods.length) return left.foods.length - right.foods.length;
  if (left.preferredCombinationMatch !== right.preferredCombinationMatch) {
    return left.preferredCombinationMatch ? -1 : 1;
  }
  if (target.proteina > 0 && Math.abs(a.proteinDistance - b.proteinDistance) > 1e-9) {
    return a.proteinDistance - b.proteinDistance;
  }
  if (Math.abs(a.calorieDeficit - b.calorieDeficit) > 1e-9) return a.calorieDeficit - b.calorieDeficit;
  return left.structure.localeCompare(right.structure) || left.signature.localeCompare(right.signature);
}

function publicSolution(solution, mode) {
  const unreachable = !solution.ranking.inCalorieZone ||
    !solution.ranking.proteinReached ||
    solution.ranking.hasMacroLimitations;
  const status = mode === FOOD_COMBINATION_MODES.ONLY_SELECTED_FOODS && unreachable
    ? "TARGET_NOT_REACHABLE_WITH_SELECTED_FOODS"
    : unreachable
      ? "BEST_EFFORT"
      : "TARGET_REACHED";
  const penalty =
    solution.ranking.calorieDeficit * 1000 +
    solution.ranking.proteinPriority * 100 +
    solution.ranking.secondaryError * 10 +
    solution.foods.length;
  return {
    status,
    foods: solution.foods,
    totals: solution.totals,
    target: solution.target,
    difference: solution.difference,
    structure: solution.structure,
    score: round(Math.max(0, 100000 - penalty), 6),
    warnings: solution.warnings,
    optimization: solution.optimization,
  };
}

async function solveCandidate({ candidate, catalog, target, quantityService }) {
  const candidateFoods = candidate.foodIds.map((id) =>
    catalog.find((food) => foodAliases(food).has(String(id)))
  );
  if (candidateFoods.some((food) => !food)) return null;

  const result = await quantityService.generarCantidades({
    mode: "kcalProteina",
    generationType: "selectedOnly",
    target,
    fixedFoods: [],
    pendingFoods: candidateFoods,
    options: { redondear: true, usarMinMax: false },
  }, {
    authorization: TRACKING_QUANTITY_INTERNAL_CONTEXT,
    trackingQuantityMode: "calorie_fill",
  });

  if (result?.status === "error" || !Array.isArray(result?.foods) || !result.foods.length) return null;
  const usedCatalogIds = new Set();
  const foods = result.foods.map((food, index) => {
    const sourceFood = findCatalogFood(catalog, food, candidate.foodIds[index]);
    const output = publicFood(food, sourceFood, candidate);
    if (output.foodId) usedCatalogIds.add(output.foodId);
    return output;
  });
  if (
    foods.length !== candidate.foodIds.length ||
    foods.some((food) => !(food.quantity > 0) || !(food.kcal >= 0)) ||
    candidate.foodIds.some((id) => !usedCatalogIds.has(String(id)))
  ) return null;

  const totals = nutrition(result.totals);
  if (!Object.values(totals).every(Number.isFinite) || totals.kcal > target.kcal + 1e-6) return null;
  const solved = {
    foods,
    totals,
    target,
    difference: difference(totals, target),
    structure: candidate.structure,
    signature: candidate.foodIds.join("|"),
    preferredCombinationMatch: candidate.preferredCombinationMatch === true,
    warnings: Array.isArray(result.warnings) ? result.warnings : [],
    optimization: result.optimization || null,
  };
  solved.ranking = nutritionalRank(solved, target);
  return solved;
}

/**
 * Orquesta estructuras y cantidades sin persistir ningun cambio. El solver es
 * exactamente ServicioAlimentos.generarCantidades con la policy calorie_fill
 * que usa Tracking; esta capa solo compara los resultados entre estructuras.
 */
export async function generateMealAlternative(input = {}, dependencies = {}) {
  const startedAt = Date.now();
  const mealType = normalizeMealAlternativeMealType(input.mealType);
  const target = normalizeTarget(input.target || input.mealTarget || {});
  const requiredFoodIds = uniqueIds(input.requiredFoodIds || [], "requiredFoodIds");
  const excludedFoodIds = uniqueIds(input.excludedFoodIds || [], "excludedFoodIds");
  const mode = String(input.generationMode || input.mode || "").trim();
  if (!Object.values(FOOD_COMBINATION_MODES).includes(mode)) {
    throw generationError("INVALID_GENERATION_MODE", "El modo de generacion no es valido.", "generationMode");
  }
  const maxFoods = safeLimit(input.maxFoods, DEFAULT_MAX_FOODS, 10);
  if (requiredFoodIds.length > maxFoods) {
    throw generationError("MEAL_FOOD_LIMIT_REACHED", `La comida permite hasta ${maxFoods} alimentos.`, "requiredFoodIds");
  }
  const limit = safeLimit(input.limit, DEFAULT_CANDIDATE_LIMIT, MAX_CANDIDATE_LIMIT);
  const model = dependencies.model || new ModelMongoDBAlimentos();
  const combinationGenerator = dependencies.generateFoodCombinationCandidates || generateFoodCombinationCandidates;
  const combinations = await combinationGenerator({
    mealType,
    target,
    requiredFoodIds,
    excludedFoodIds,
    mode,
    preferredCombinations: input.preferredCombinations,
    limit,
  }, {
    model,
    ...(dependencies.getAutomaticGenerationFoods
      ? { getAutomaticGenerationFoods: dependencies.getAutomaticGenerationFoods }
      : {}),
  });
  const candidates = (combinations.candidates || []).filter((candidate) => candidate.foodIds.length <= maxFoods);
  if (!candidates.length) {
    return {
      status: "NO_SOLUTION",
      code: mode === FOOD_COMBINATION_MODES.ONLY_SELECTED_FOODS
        ? "TARGET_NOT_REACHABLE_WITH_SELECTED_FOODS"
        : "NO_COMPATIBLE_FOOD_COMBINATION",
      alternative: null,
      alternatives: [],
      meta: {
        combinationCandidatesEvaluated: 0,
        quantitySolutionsFound: 0,
        structuresEvaluated: combinations.meta?.structuresEvaluated || 0,
        elapsedMs: Date.now() - startedAt,
      },
    };
  }

  const catalog = await model.obtenerAlimentos();
  const quantityService = dependencies.quantityService || new ServicioAlimentos("MONGO");
  quantityService.model = { obtenerAlimentos: async () => catalog };
  const settled = await Promise.allSettled(candidates.map((candidate) =>
    solveCandidate({ candidate, catalog, target, quantityService })
  ));
  const solutions = settled
    .filter((entry) => entry.status === "fulfilled" && entry.value)
    .map((entry) => entry.value)
    .sort((left, right) => compareSolutions(left, right, target));
  if (!solutions.length) {
    return {
      status: "NO_SOLUTION",
      code: mode === FOOD_COMBINATION_MODES.ONLY_SELECTED_FOODS
        ? "TARGET_NOT_REACHABLE_WITH_SELECTED_FOODS"
        : "NO_VALID_QUANTITY_SOLUTION",
      alternative: null,
      alternatives: [],
      meta: {
        combinationCandidatesEvaluated: candidates.length,
        quantitySolutionsFound: 0,
        structuresEvaluated: combinations.meta?.structuresEvaluated || 0,
        elapsedMs: Date.now() - startedAt,
      },
    };
  }

  const publicSolutions = solutions.map((solution) => publicSolution(solution, mode));
  return {
    status: "SUCCESS",
    alternative: publicSolutions[0],
    alternatives: publicSolutions.slice(1),
    meta: {
      combinationCandidatesEvaluated: candidates.length,
      quantitySolutionsFound: publicSolutions.length,
      structuresEvaluated: combinations.meta?.structuresEvaluated || 0,
      mealType,
      mode,
      elapsedMs: Date.now() - startedAt,
    },
  };
}

export default generateMealAlternative;
