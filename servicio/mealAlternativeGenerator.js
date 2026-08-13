import ModelMongoDBAlimentos from "../model/DAO/alimentosMongoDB.js";
import ServicioAlimentos, {
  TRACKING_QUANTITY_INTERNAL_CONTEXT,
} from "./alimentos.js";
import { normalizeFood as normalizeQuantityFood } from "../menu2.js";
import {
  FOOD_COMBINATION_MODES,
  generateFoodCombinationCandidates,
} from "./foodCombinationCandidates.js";

const CALORIE_ZONE_TOLERANCE = 1;
const PROTEIN_REACHED_TOLERANCE = 0.5;
const DEFAULT_CANDIDATE_LIMIT = 20;
const MAX_CANDIDATE_LIMIT = 40;
const DEFAULT_MAX_FOODS = 6;
const RECOMMENDED_CALORIE_DEFICIT = 10;
const RECOMMENDED_PROTEIN_DEFICIT = 2.5;

const RELAXATION_LEVELS = Object.freeze({
  STRICT: "STRICT",
  RELAX_STEP: "RELAX_STEP",
  RELAX_MIN: "RELAX_MIN",
});

const PORTION_CONSTRAINT_FIELDS = Object.freeze({
  min: Object.freeze(["minGramos", "minQuantity", "cantidadMin", "porcionMin"]),
  max: Object.freeze(["maxGramos", "maxQuantity", "cantidadMax", "porcionMax"]),
  step: Object.freeze(["stepGramos", "stepQuantity", "step", "multiplo"]),
});

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

function publicFixedFood(sourceFood = {}, quantity = 0, candidate = {}) {
  const normalized = normalizeQuantityFood(sourceFood) || {};
  const amount = number(quantity);
  const id = foodPrimaryId(sourceFood);
  return {
    foodId: id,
    name: foodName(sourceFood),
    role: candidate.roleAssignments?.[id] || null,
    quantity: round(amount, 6),
    unit: sourceFood?.unidad || sourceFood?.Unidad || sourceFood?.unit || "g",
    kcal: round(number(normalized.calorias) * amount),
    proteina: round(number(normalized.proteina) * amount),
    carbs: round(number(normalized.carbohidratos) * amount),
    grasas: round(number(normalized.grasas) * amount),
    image: sourceFood?.imagen || null,
    imageUrl: sourceFood?.imagenUrl || sourceFood?.imagen?.url || "",
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

function normalizedPortionUnit(food = {}, rule = {}) {
  const value = String(
    rule.unit || food.unit || food.unidad || food.Unidad || food.unidadBase || food.measurementUnit || ""
  ).trim().toLowerCase();
  if (["g", "gr", "grs", "gramo", "gramos"].includes(value)) return "g";
  if (["ml", "mililitro", "mililitros"].includes(value)) return "ml";
  return value;
}

function withoutPortionConstraints(shape = {}, configured = {}) {
  if (!shape || typeof shape !== "object") return shape;
  const clean = { ...shape };
  for (const kind of Object.keys(PORTION_CONSTRAINT_FIELDS)) {
    if (!configured[kind]) continue;
    for (const field of PORTION_CONSTRAINT_FIELDS[kind]) delete clean[field];
  }
  return clean;
}

function configuredPortionNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Proyecta una sola regla efectiva por documento, sin agregar copias rivales al
 * catalogo. Es una transformacion interna: nunca recibe overrides del payload
 * HTTP y no persiste cambios en fooddatabase2.
 */
function foodWithEffectivePortionRule(food = {}, level = RELAXATION_LEVELS.STRICT) {
  const originalRule = food?.generation?.portionRule;
  if (!originalRule || typeof originalRule !== "object") return food;

  const unit = normalizedPortionUnit(food, originalRule);
  const continuous = unit === "g" || unit === "ml";
  const originalMin = configuredPortionNumber(originalRule.min);
  const originalMax = configuredPortionNumber(originalRule.max);
  const originalStep = configuredPortionNumber(originalRule.step);
  const configured = {
    min: originalMin !== null,
    max: originalMax !== null,
    step: originalStep !== null,
  };
  if (!configured.min && !configured.max && !configured.step) return food;
  const relaxStep = continuous && originalStep === 10 && level !== RELAXATION_LEVELS.STRICT;
  const effectiveStep = relaxStep ? 5 : originalStep;
  const effectiveMin = level === RELAXATION_LEVELS.RELAX_MIN && continuous && originalMin !== null
    ? Math.max(0, originalMin - 20)
    : originalMin;
  const clean = withoutPortionConstraints(food, configured);
  const cleanRaw = food.raw && typeof food.raw === "object"
    ? withoutPortionConstraints(food.raw, configured)
    : food.raw;
  const effectiveRule = {
    ...originalRule,
    unit: originalRule.unit || unit || null,
    min: effectiveMin,
    max: originalMax,
    step: effectiveStep,
  };

  return {
    ...clean,
    ...(cleanRaw ? { raw: cleanRaw } : {}),
    generation: {
      ...(food.generation || {}),
      portionRule: effectiveRule,
    },
    ...(effectiveMin !== null && effectiveMin > 0 ? { minGramos: effectiveMin } : {}),
    ...(originalMax !== null && originalMax > 0 ? { maxGramos: originalMax } : {}),
    ...(effectiveStep !== null && effectiveStep > 0 ? { stepGramos: effectiveStep } : {}),
  };
}

function catalogForRelaxation(catalog = [], level = RELAXATION_LEVELS.STRICT) {
  return (Array.isArray(catalog) ? catalog : []).map((food) =>
    foodWithEffectivePortionRule(food, level)
  );
}

function isRecommendedForRound(solution, target) {
  if (!solution) return false;
  const calorieDeficit = target.kcal - solution.totals.kcal;
  const caloriesRecommended = calorieDeficit >= -1e-6 &&
    calorieDeficit <= RECOMMENDED_CALORIE_DEFICIT + 1e-9;
  const proteinRecommended = target.proteina <= 0 ||
    solution.totals.proteina >= target.proteina - RECOMMENDED_PROTEIN_DEFICIT - 1e-9;
  return caloriesRecommended && proteinRecommended;
}

function publicSolution(solution, mode, relaxation) {
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
    variant: solution.variant || null,
    recommended: true,
    relaxation,
  };
}

function quantitySolverFood(sourceFood = {}, currentQuantity = null) {
  const normalized = normalizeQuantityFood(sourceFood) || {};
  return {
    ...sourceFood,
    foodId: foodPrimaryId(sourceFood),
    name: foodName(sourceFood),
    unit: sourceFood.unidad || sourceFood.Unidad || sourceFood.unit || "g",
    kcalPerUnitOrGram: number(normalized.calorias),
    proteinPerUnitOrGram: number(normalized.proteina),
    carbsPerUnitOrGram: number(normalized.carbohidratos),
    fatPerUnitOrGram: number(normalized.grasas),
    ...(Number.isFinite(Number(currentQuantity)) && Number(currentQuantity) > 0
      ? { currentQuantity: Number(currentQuantity) }
      : {}),
  };
}

function quantitySatisfiesEffectiveRule(food = {}, quantity = 0) {
  const amount = number(quantity);
  if (!(amount > 0)) return false;
  const rule = food?.generation?.portionRule || {};
  const min = configuredPortionNumber(rule.min) ??
    configuredPortionNumber(food.minGramos ?? food.minQuantity ?? food.cantidadMin ?? food.porcionMin);
  const max = configuredPortionNumber(rule.max) ??
    configuredPortionNumber(food.maxGramos ?? food.maxQuantity ?? food.cantidadMax ?? food.porcionMax);
  const step = configuredPortionNumber(rule.step) ??
    configuredPortionNumber(food.stepGramos ?? food.stepQuantity ?? food.step ?? food.multiplo);
  const allowedValues = Array.isArray(rule.allowedValues)
    ? rule.allowedValues.map(Number).filter((value) => Number.isFinite(value) && value > 0)
    : [];
  const epsilon = 1e-6;
  if (min !== null && amount < min - epsilon) return false;
  if (max !== null && amount > max + epsilon) return false;
  if (allowedValues.length && !allowedValues.some((value) => Math.abs(value - amount) <= epsilon)) return false;
  if (step !== null && step > 0 && Math.abs(amount / step - Math.round(amount / step)) > epsilon) return false;
  if (!["g", "ml"].includes(normalizedPortionUnit(food, rule)) &&
      food.allowFractionalQuantity !== true &&
      Math.abs(amount - Math.round(amount)) > epsilon) return false;
  return true;
}

async function solveCandidate({ candidate, catalog, target, quantityService }) {
  const candidateFoods = candidate.foodIds.map((id) =>
    catalog.find((item) => foodAliases(item).has(String(id))) || null
  );
  if (candidateFoods.some((food) => !food)) return null;

  const fixedQuantities = candidate.fixedQuantities instanceof Map
    ? candidate.fixedQuantities
    : new Map();
  const currentQuantities = candidate.currentQuantities instanceof Map
    ? candidate.currentQuantities
    : new Map();
  const fixedFoods = [];
  const pendingFoods = [];
  for (let index = 0; index < candidateFoods.length; index++) {
    const sourceFood = candidateFoods[index];
    const requestedId = String(candidate.foodIds[index]);
    const fixedQuantity = fixedQuantities.get(requestedId);
    if (Number.isFinite(fixedQuantity) && fixedQuantity > 0) {
      fixedFoods.push({
        ...quantitySolverFood(sourceFood),
        foodId: requestedId,
        quantity: fixedQuantity,
      });
    } else {
      pendingFoods.push({
        ...quantitySolverFood(sourceFood, currentQuantities.get(requestedId)),
        foodId: requestedId,
      });
    }
  }
  if (!pendingFoods.length) return null;

  const result = await quantityService.generarCantidades({
    mode: "kcalProteina",
    generationType: "selectedOnly",
    target,
    fixedFoods,
    pendingFoods,
    options: {
      redondear: true,
      usarMinMax: false,
      generarVariante: candidate.generateVariant === true,
      variantSeed: candidate.variantSeed,
    },
  }, {
    authorization: TRACKING_QUANTITY_INTERNAL_CONTEXT,
    trackingQuantityMode: "calorie_fill",
    // Sólo este flujo convierte min/max/step del Admin en restricciones duras.
    // Tracking conserva su comportamiento histórico porque no envía este flag.
    enforceQuantityConstraints: true,
  });

  if (result?.status === "error" || !Array.isArray(result?.foods) || !result.foods.length) return null;
  const usedCatalogIds = new Set();
  const generatedFoods = result.foods.map((food, index) => {
    const sourceFood = findCatalogFood(catalog, food, candidate.foodIds[index]);
    const output = publicFood(food, sourceFood, candidate);
    const requestedId = candidate.foodIds.find((id) =>
      sourceFood && foodAliases(sourceFood).has(String(id))
    );
    if (requestedId) output.foodId = String(requestedId);
    if (output.foodId) usedCatalogIds.add(String(output.foodId));
    return output;
  });
  const fixedOutputs = candidateFoods
    .map((food, index) => ({ food, requestedId: String(candidate.foodIds[index]) }))
    .filter(({ requestedId }) => fixedQuantities.has(requestedId))
    .map(({ food, requestedId }) => {
      const output = publicFixedFood(food, fixedQuantities.get(requestedId), candidate);
      output.foodId = requestedId;
      if (output.foodId) usedCatalogIds.add(output.foodId);
      return output;
    });
  const generatedById = new Map(generatedFoods.map((food) => [food.foodId, food]));
  const fixedById = new Map(fixedOutputs.map((food) => [food.foodId, food]));
  const foods = candidate.foodIds
    .map((id) => fixedById.get(String(id)) || generatedById.get(String(id)))
    .filter(Boolean);
  if (
    foods.length !== candidate.foodIds.length ||
    foods.some((food) => !(food.quantity > 0) || !(food.kcal >= 0)) ||
    candidate.foodIds.some((id) => !usedCatalogIds.has(String(id)))
  ) return null;
  for (let index = 0; index < candidateFoods.length; index++) {
    const requestedId = String(candidate.foodIds[index]);
    if (fixedQuantities.has(requestedId)) continue;
    const output = foods.find((food) => food.foodId === requestedId);
    if (!output || !quantitySatisfiesEffectiveRule(candidateFoods[index], output.quantity)) return null;
  }

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
    variant: result.variant || null,
  };
  solved.ranking = nutritionalRank(solved, target);
  return solved;
}

async function solveCandidatesWithRelaxation({ candidates, catalog, target, quantityService, meta = {} }) {
  const startedAt = Date.now();
  const rounds = [];
  let winningRound = null;
  for (const level of [
    RELAXATION_LEVELS.STRICT,
    RELAXATION_LEVELS.RELAX_STEP,
    RELAXATION_LEVELS.RELAX_MIN,
  ]) {
    const roundResult = await solveRound({ level, candidates, catalog, target, quantityService });
    rounds.push(roundResult.diagnostic);
    if (roundResult.recommendedSolutions.length) {
      winningRound = roundResult;
      break;
    }
  }

  if (!winningRound) {
    return {
      status: "NO_SOLUTION",
      code: "MEAL_TARGET_NOT_REACHABLE_WITH_PORTION_RULES",
      recommended: false,
      alternative: null,
      alternatives: [],
      relaxation: {
        level: RELAXATION_LEVELS.RELAX_MIN,
        portionRulesRelaxed: true,
        exhausted: true,
      },
      meta: {
        ...meta,
        combinationCandidatesEvaluated: candidates.length,
        totalCandidateExecutions: rounds.reduce((total, round) => total + round.candidatesProcessed, 0),
        quantitySolutionsFound: rounds.reduce((total, round) => total + round.quantitySolutionsFound, 0),
        recommendedSolutionsFound: 0,
        rounds,
        elapsedMs: Date.now() - startedAt,
      },
    };
  }

  const relaxation = {
    level: winningRound.level,
    portionRulesRelaxed: winningRound.level !== RELAXATION_LEVELS.STRICT,
  };
  const publicSolutions = winningRound.recommendedSolutions.map((solution) =>
    publicSolution(solution, meta.mode || FOOD_COMBINATION_MODES.ONLY_SELECTED_FOODS, relaxation)
  );
  return {
    status: "SUCCESS",
    recommended: true,
    relaxation,
    alternative: publicSolutions[0],
    alternatives: publicSolutions.slice(1),
    meta: {
      ...meta,
      combinationCandidatesEvaluated: candidates.length,
      totalCandidateExecutions: rounds.reduce((total, round) => total + round.candidatesProcessed, 0),
      quantitySolutionsFound: winningRound.solutions.length,
      recommendedSolutionsFound: publicSolutions.length,
      rounds,
      elapsedMs: Date.now() - startedAt,
    },
  };
}

async function solveRound({ level, candidates, catalog, target, quantityService }) {
  const startedAt = Date.now();
  const effectiveCatalog = catalogForRelaxation(catalog, level);
  quantityService.model = { obtenerAlimentos: async () => effectiveCatalog };
  const settled = await Promise.allSettled(candidates.map((candidate) =>
    solveCandidate({ candidate, catalog: effectiveCatalog, target, quantityService })
  ));
  const solutions = settled
    .filter((entry) => entry.status === "fulfilled" && entry.value)
    .map((entry) => entry.value)
    .sort((left, right) => compareSolutions(left, right, target));
  const recommendedSolutions = solutions.filter((solution) => isRecommendedForRound(solution, target));
  return {
    level,
    solutions,
    recommendedSolutions,
    diagnostic: {
      level,
      candidatesProcessed: candidates.length,
      quantitySolutionsFound: solutions.length,
      recommendedSolutionsFound: recommendedSolutions.length,
      elapsedMs: Date.now() - startedAt,
    },
  };
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
    const relaxation = {
      level: RELAXATION_LEVELS.STRICT,
      portionRulesRelaxed: false,
      exhausted: false,
    };
    return {
      status: "NO_SOLUTION",
      code: mode === FOOD_COMBINATION_MODES.ONLY_SELECTED_FOODS
        ? "TARGET_NOT_REACHABLE_WITH_SELECTED_FOODS"
        : "NO_COMPATIBLE_FOOD_COMBINATION",
      alternative: null,
      alternatives: [],
      recommended: false,
      relaxation,
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
  const result = await solveCandidatesWithRelaxation({
    candidates,
    catalog,
    target,
    quantityService,
    meta: {
      structuresEvaluated: combinations.meta?.structuresEvaluated || 0,
      mealType,
      mode,
    },
  });
  result.meta.elapsedMs = Date.now() - startedAt;
  return result;
}

export async function recalculateMealAlternativeQuantities(input = {}, dependencies = {}) {
  const startedAt = Date.now();
  const mealType = normalizeMealAlternativeMealType(input.mealType);
  const target = normalizeTarget(input.target || input.mealTarget || {});
  const selectedFoodIds = uniqueIds(input.selectedFoodIds || [], "selectedFoodIds");
  const fixedFoodsInput = Array.isArray(input.fixedFoods) ? input.fixedFoods : [];
  if (!selectedFoodIds.length) {
    throw generationError("INVALID_FOOD_CONSTRAINTS", "Selecciona al menos un alimento para recalcular.", "selectedFoodIds");
  }
  if (selectedFoodIds.length > safeLimit(input.maxFoods, DEFAULT_MAX_FOODS, 10)) {
    throw generationError("MEAL_FOOD_LIMIT_REACHED", "La comida supera el limite de alimentos.", "selectedFoodIds");
  }

  const fixedQuantities = new Map();
  for (const fixed of fixedFoodsInput) {
    const id = String(fixed?.foodId || fixed?.id || "").trim();
    const quantity = Number(fixed?.quantity ?? fixed?.cantidad);
    if (!id || !selectedFoodIds.includes(id) || !Number.isFinite(quantity) || quantity <= 0) {
      throw generationError("INVALID_FIXED_QUANTITY", "Revisa las cantidades fijadas antes de recalcular.", "fixedFoods");
    }
    fixedQuantities.set(id, quantity);
  }
  if (fixedQuantities.size >= selectedFoodIds.length) {
    throw generationError("NO_AUTOMATIC_FOODS", "Marca al menos un alimento como Auto para recalcularlo.", "fixedFoods");
  }
  const currentQuantities = new Map(
    (Array.isArray(input.currentFoods) ? input.currentFoods : [])
      .map((food) => [String(food?.foodId || food?.id || "").trim(), Number(food?.quantity ?? food?.cantidad)])
      .filter(([id, quantity]) => id && selectedFoodIds.includes(id) && Number.isFinite(quantity) && quantity > 0)
  );
  const model = dependencies.model || new ModelMongoDBAlimentos();
  const catalog = await model.obtenerAlimentos();
  if (selectedFoodIds.some((id) => !catalog.some((food) => foodAliases(food).has(id)))) {
    throw generationError("FOOD_NOT_FOUND", "Uno de los alimentos ya no esta disponible.", "selectedFoodIds");
  }
  const candidate = {
    foodIds: selectedFoodIds,
    structure: `RECALCULATE:${selectedFoodIds.join("+")}`,
    roleAssignments: {},
    preferredCombinationMatch: false,
    fixedQuantities,
    currentQuantities,
    generateVariant: input.generateVariant === true,
    variantSeed: input.variantSeed,
  };
  const quantityService = dependencies.quantityService || new ServicioAlimentos("MONGO");
  const result = await solveCandidatesWithRelaxation({
    candidates: [candidate],
    catalog,
    target,
    quantityService,
    meta: {
      structuresEvaluated: 1,
      mealType,
      mode: FOOD_COMBINATION_MODES.ONLY_SELECTED_FOODS,
      recalculation: true,
      fixedFoods: fixedQuantities.size,
    },
  });
  // Una variante es opcional. Si no existe una redistribucion suficientemente
  // buena, resolvemos otra vez la misma seleccion sin variante y devolvemos la
  // mejor cantidad valida; nunca ampliamos la estructura de alimentos.
  const requestedVariantWasNotApplied = input.generateVariant === true && (
    result.status === "NO_SOLUTION" ||
    result.alternative?.variant?.requested === true && result.alternative.variant.applied !== true
  );
  if (requestedVariantWasNotApplied) {
    candidate.generateVariant = false;
    const fallback = await solveCandidatesWithRelaxation({
      candidates: [candidate],
      catalog,
      target,
      quantityService,
      meta: {
        structuresEvaluated: 1,
        mealType,
        mode: FOOD_COMBINATION_MODES.ONLY_SELECTED_FOODS,
        recalculation: true,
        fixedFoods: fixedQuantities.size,
        variantFallback: true,
      },
    });
    fallback.meta.elapsedMs = Date.now() - startedAt;
    return fallback;
  }
  result.meta.elapsedMs = Date.now() - startedAt;
  return result;
}

export default generateMealAlternative;
