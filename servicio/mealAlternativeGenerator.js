import ModelMongoDBAlimentos from "../model/DAO/alimentosMongoDB.js";
import ServicioAlimentos, {
  TRACKING_QUANTITY_INTERNAL_CONTEXT,
} from "./alimentos.js";
import { normalizeFood as normalizeQuantityFood } from "../menu2.js";
import {
  FOOD_COMBINATION_MODES,
  generateFoodCombinationCandidates,
} from "./foodCombinationCandidates.js";
import {
  MEAL_NUTRITION_CLASSIFICATIONS,
  MEAL_NUTRITION_POLICY,
  MEAL_NUTRITION_THRESHOLDS,
  compareMealNutritionAssessments,
  evaluateMealNutritionResult,
} from "./mealNutritionPolicy.js";
import {
  assessMealCompositionDiversity,
  compareMealCompositionDiversity,
  normalizeMealComposition,
  normalizeMealDiversityContext,
} from "./mealCompositionDiversity.js";

const DEFAULT_CANDIDATE_LIMIT = 20;
const MAX_CANDIDATE_LIMIT = 40;
const DEFAULT_MAX_FOODS = 6;

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

function deterministicVariantIndex(seed = "", length = 0) {
  if (!seed || length <= 1) return 0;
  let hash = 2166136261;
  for (const character of String(seed)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % length;
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

function nutritionalRank(solution, target) {
  return evaluateMealNutritionResult(solution.totals, target);
}

function compareSolutions(left, right, target) {
  left.ranking ||= nutritionalRank(left, target);
  right.ranking ||= nutritionalRank(right, target);
  const nutritionDifference = compareMealNutritionAssessments(left.ranking, right.ranking);
  if (nutritionDifference) return nutritionDifference;
  if (left.foods.length !== right.foods.length) return left.foods.length - right.foods.length;
  if (left.preferredCombinationMatch !== right.preferredCombinationMatch) {
    return left.preferredCombinationMatch ? -1 : 1;
  }
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
  return Boolean(solution && nutritionalRank(solution, target).recommended);
}

function publicSolution(solution, mode, relaxation) {
  void mode;
  const nutrition = solution.ranking || nutritionalRank(solution, solution.target);
  const closeCalories = nutrition.absoluteDifference.kcal <=
    MEAL_NUTRITION_THRESHOLDS.calorieAcceptable + 1e-9;
  const penalty = closeCalories
    ? nutrition.proteinZoneRank * 10000 +
      nutrition.absoluteDifference.kcal * 100 +
      nutrition.proteinDistance * 10 +
      nutrition.secondaryEnergyError
    : 100000 +
      nutrition.absoluteDifference.kcal * 1000 +
      nutrition.proteinZoneRank * 100 +
      nutrition.proteinDistance * 10 +
      nutrition.secondaryEnergyError;
  const technicalWarnings = (Array.isArray(solution.warnings) ? solution.warnings : [])
    .map((warning, index) => typeof warning === "string"
      ? { code: `MEAL_TECHNICAL_WARNING_${index + 1}`, category: "technical", message: warning }
      : warning
    )
    .filter((warning) => String(warning?.message || "").trim());
  const warnings = [nutrition.warning, ...technicalWarnings]
    .filter(Boolean)
    .filter((warning, index, values) => values.findIndex((entry) =>
      String(entry?.code || entry?.message) === String(warning?.code || warning?.message)
    ) === index);
  return {
    status: nutrition.status,
    classification: nutrition.status,
    foods: solution.foods,
    totals: solution.totals,
    target: solution.target,
    difference: nutrition.difference,
    structure: solution.structure,
    score: round(Math.max(0, 100000 - penalty), 6),
    warnings,
    optimization: {
      ...(solution.optimization || {}),
      policy: MEAL_NUTRITION_POLICY,
      nutritionAssessment: nutrition,
    },
    variant: solution.variant || null,
    recommended: nutrition.recommended,
    usable: true,
    nutrition,
    composition: normalizeMealComposition(solution.foods),
    relaxation,
  };
}

function diversityQualityPool(solutions = [], baseline = null) {
  if (!baseline) return [];
  const recommended = solutions.filter((solution) => solution.recommended === true);
  const nearBestEffort = solutions.filter((solution) => (
    solution.recommended !== true &&
    solution.nutrition?.zones?.calories !== "OUTSIDE" &&
    Number(solution.nutrition?.proteinZoneRank) <= 1
  ));
  const lowOverlap = (values) => values.filter((solution) => (
    solution.diversity.exactMatches === 0 && solution.diversity.highOverlapMatches === 0
  ));
  const nonExact = (values) => values.filter((solution) => solution.diversity.exactMatches === 0);
  // La diversidad sólo desempata dentro de la misma calidad nutricional.
  // Una composición RECOMMENDED parcialmente repetida sigue siendo mejor que
  // una BEST_EFFORT distinta; la variedad nunca degrada la clasificación.
  if (recommended.length) {
    return lowOverlap(recommended).length ? lowOverlap(recommended)
      : nonExact(recommended).length ? nonExact(recommended)
        : recommended;
  }
  return lowOverlap(nearBestEffort).length ? lowOverlap(nearBestEffort)
    : nonExact(nearBestEffort).length ? nonExact(nearBestEffort)
      : nearBestEffort.length ? nearBestEffort
        : solutions;
}

function selectCompositionDiverseSolution(publicSolutions = [], diversityValue = {}, variantSeed = "") {
  const diversityContext = normalizeMealDiversityContext(diversityValue);
  const uniqueSolutions = publicSolutions.filter((solution, index, values) => (
    values.findIndex((candidate) => candidate.composition.fingerprint === solution.composition.fingerprint) === index
  ));
  const assessed = uniqueSolutions.map((solution, nutritionIndex) => ({
    ...solution,
    diversity: {
      ...assessMealCompositionDiversity(solution.composition, diversityContext),
      nutritionIndex,
    },
  }));
  const hasContext = diversityContext.previousMeals.length > 0 || diversityContext.usedFoodIds.size > 0;
  if (!hasContext) {
    const variantPool = assessed.slice(0, 8);
    return {
      selected: variantPool[deterministicVariantIndex(variantSeed, variantPool.length)] || assessed[0],
      alternatives: assessed,
      variantPool,
      context: diversityContext,
      repeatInevitable: false,
      highOverlapInevitable: false,
    };
  }

  const pool = diversityQualityPool(assessed, assessed[0])
    .sort((left, right) =>
      compareMealCompositionDiversity(left.diversity, right.diversity) ||
      left.diversity.nutritionIndex - right.diversity.nutritionIndex
    );
  const selected = pool[0] || assessed[0];
  const comparable = assessed.filter((solution) => (
    selected.recommended === true
      ? solution.recommended === true
      : solution.recommended !== true && (
      solution.nutrition?.zones?.calories !== "OUTSIDE" &&
      Number(solution.nutrition?.proteinZoneRank) <= 1
    )
  ));
  return {
    selected,
    alternatives: assessed,
    variantPool: pool.slice(0, 8),
    context: diversityContext,
    repeatInevitable: selected.diversity.exactMatches > 0 &&
      !comparable.some((solution) => solution.diversity.exactMatches === 0),
    highOverlapInevitable: selected.diversity.highOverlapMatches > 0 &&
      !comparable.some((solution) => (
        solution.diversity.exactMatches === 0 && solution.diversity.highOverlapMatches === 0
      )),
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
      if (!quantitySatisfiesEffectiveRule(sourceFood, fixedQuantity)) return null;
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
  if (!pendingFoods.length) {
    const foods = candidateFoods.map((food, index) => {
      const requestedId = String(candidate.foodIds[index]);
      const output = publicFixedFood(food, fixedQuantities.get(requestedId), candidate);
      output.foodId = requestedId;
      return output;
    });
    if (foods.some((food) => !(food.quantity > 0) || !(food.kcal >= 0))) return null;
    const totals = nutrition(foods.reduce((sum, food) => ({
      kcal: sum.kcal + food.kcal,
      proteina: sum.proteina + food.proteina,
      carbs: sum.carbs + food.carbs,
      grasas: sum.grasas + food.grasas,
    }), { kcal: 0, proteina: 0, carbs: 0, grasas: 0 }));
    const solved = {
      foods,
      totals,
      target,
      difference: difference(totals, target),
      structure: candidate.structure,
      signature: candidate.foodIds.join("|"),
      preferredCombinationMatch: candidate.preferredCombinationMatch === true,
      warnings: [],
      optimization: {
        profile: "meal_generation_locked",
        policy: MEAL_NUTRITION_POLICY,
        allSelectedFoodsUsed: true,
        lockedFoods: foods.length,
      },
      variant: { requested: false, applied: false },
    };
    solved.ranking = nutritionalRank(solved, target);
    return solved;
  }

  const result = await quantityService.generarCantidades({
    mode: "kcalProteina",
    generationType: "selectedOnly",
    target,
    fixedFoods,
    pendingFoods,
    options: {
      redondear: true,
      usarMinMax: false,
      // Recalcular siempre devuelve la mejor distribucion segun la policy
      // central. "Generar otra opcion" varia alimentos en el pool exterior.
      generarVariante: false,
      variantSeed: candidate.variantSeed,
    },
  }, {
    authorization: TRACKING_QUANTITY_INTERNAL_CONTEXT,
    trackingQuantityMode: "calorie_fill",
    mealNutritionPolicy: MEAL_NUTRITION_POLICY,
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
  // En generación las calorías son un objetivo de ranking, no una restricción
  // física. Los mínimos o los candados pueden obligar a superar la zona de
  // ±10 kcal; esa solución sigue siendo utilizable como BEST_EFFORT. Las
  // restricciones duras (alimento válido, min/max/step y locks) se validan por
  // separado antes de llegar acá.
  if (!Object.values(totals).every(Number.isFinite)) return null;
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

async function solveCandidatesWithRelaxation({
  candidates,
  catalog,
  target,
  quantityService,
  meta = {},
  variantSeed = "",
  diversityContext = {},
}) {
  const startedAt = Date.now();
  const rounds = [];
  const physicalRecords = [];
  let selectedRecords = null;
  for (const level of [
    RELAXATION_LEVELS.STRICT,
    RELAXATION_LEVELS.RELAX_STEP,
    RELAXATION_LEVELS.RELAX_MIN,
  ]) {
    const roundResult = await solveRound({ level, candidates, catalog, target, quantityService });
    rounds.push(roundResult.diagnostic);
    physicalRecords.push(...roundResult.solutions.map((solution) => ({ level, solution })));
    if (roundResult.recommendedSolutions.length) {
      selectedRecords = roundResult.recommendedSolutions.map((solution) => ({ level, solution }));
      break;
    }
  }

  if (!physicalRecords.length) {
    return {
      status: MEAL_NUTRITION_CLASSIFICATIONS.NO_SOLUTION,
      classification: MEAL_NUTRITION_CLASSIFICATIONS.NO_SOLUTION,
      code: "MEAL_TARGET_NOT_REACHABLE_WITH_PORTION_RULES",
      recommended: false,
      usable: false,
      nutrition: null,
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
        quantitySolutionsFound: 0,
        recommendedSolutionsFound: 0,
        bestEffortSolutionsFound: 0,
        rounds,
        elapsedMs: Date.now() - startedAt,
      },
    };
  }

  const relaxationOrder = new Map([
    [RELAXATION_LEVELS.STRICT, 0],
    [RELAXATION_LEVELS.RELAX_STEP, 1],
    [RELAXATION_LEVELS.RELAX_MIN, 2],
  ]);
  const normalizedDiversity = normalizeMealDiversityContext(diversityContext);
  const hasDiversityContext = normalizedDiversity.previousMeals.length > 0 || normalizedDiversity.usedFoodIds.size > 0;
  const records = (hasDiversityContext ? physicalRecords : (selectedRecords || physicalRecords))
    .sort((left, right) =>
      compareSolutions(left.solution, right.solution, target) ||
      (relaxationOrder.get(left.level) || 0) - (relaxationOrder.get(right.level) || 0)
    )
    .filter((record, index, values) => {
      const keyFor = (entry) => `${entry.solution.signature}:${entry.solution.foods
        .map((food) => `${food.foodId}:${food.quantity}`)
        .join("|")}`;
      return values.findIndex((entry) => keyFor(entry) === keyFor(record)) === index;
    });
  const publicSolutions = records.map(({ solution, level }) => publicSolution(
    solution,
    meta.mode || FOOD_COMBINATION_MODES.ONLY_SELECTED_FOODS,
    {
      level,
      portionRulesRelaxed: level !== RELAXATION_LEVELS.STRICT,
      ...(!selectedRecords ? { exhausted: true } : {}),
    }
  ));
  const selection = selectCompositionDiverseSolution(publicSolutions, normalizedDiversity, variantSeed);
  const baseSelected = selection.selected;
  const diversityWarning = selection.repeatInevitable ? {
    code: "MEAL_COMPOSITION_REPEAT_UNAVOIDABLE",
    category: "diversity",
    severity: "info",
    title: "Composicion repetida",
    summary: "No habia otra composicion nutricionalmente razonable con estos alimentos y restricciones.",
    message: "Se repite la composicion porque no habia otra alternativa nutricionalmente razonable y fisicamente valida.",
  } : selection.highOverlapInevitable ? {
    code: "MEAL_COMPOSITION_HIGH_OVERLAP_UNAVOIDABLE",
    category: "diversity",
    severity: "info",
    title: "Composicion parcialmente similar",
    summary: "Esta opcion comparte varios alimentos porque no habia otra alternativa nutricionalmente comparable.",
    message: "Se eligio la menor superposicion disponible sin degradar de forma importante el objetivo nutricional.",
  } : null;
  const selected = diversityWarning ? {
    ...baseSelected,
    warnings: [...(baseSelected.warnings || []), diversityWarning],
    diversity: {
      ...baseSelected.diversity,
      repeatInevitable: selection.repeatInevitable,
      highOverlapInevitable: selection.highOverlapInevitable,
    },
  } : baseSelected;
  const remainingSolutions = selection.alternatives.filter((solution) => solution !== baseSelected);
  return {
    status: "SUCCESS",
    classification: selected.classification,
    recommended: selected.recommended,
    usable: true,
    nutrition: selected.nutrition,
    relaxation: selected.relaxation,
    alternative: selected,
    alternatives: remainingSolutions,
    meta: {
      ...meta,
      variantSeed: variantSeed || null,
      variantPoolSize: selection.variantPool.length,
      uniqueCompositionSolutions: selection.alternatives.length,
      diversityContextMeals: selection.context.previousMeals.length,
      selectedCompositionFingerprint: selected.composition?.fingerprint || null,
      selectedCompositionRoleFingerprint: selected.composition?.roleFingerprint || null,
      selectedDiversity: selected.diversity || null,
      repeatInevitable: selection.repeatInevitable,
      highOverlapInevitable: selection.highOverlapInevitable,
      combinationCandidatesEvaluated: candidates.length,
      totalCandidateExecutions: rounds.reduce((total, round) => total + round.candidatesProcessed, 0),
      quantitySolutionsFound: rounds.reduce((total, round) => total + round.quantitySolutionsFound, 0),
      recommendedSolutionsFound: publicSolutions.filter((solution) => solution.recommended).length,
      bestEffortSolutionsFound: publicSolutions.filter((solution) => !solution.recommended).length,
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
 * Orquesta estructuras y cantidades sin persistir ningun cambio. Reutiliza el
 * mismo solver de ServicioAlimentos con una policy interna exclusiva de
 * generacion; Tracking no entrega esa policy y conserva su ranking historico.
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
  const diversityContext = normalizeMealDiversityContext(input.diversityContext);
  const model = dependencies.model || new ModelMongoDBAlimentos();
  const combinationGenerator = dependencies.generateFoodCombinationCandidates || generateFoodCombinationCandidates;
  const combinations = await combinationGenerator({
    mealType,
    target,
    requiredFoodIds,
    excludedFoodIds,
    mode,
    preferredCombinations: input.preferredCombinations,
    diversityContext,
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
      status: MEAL_NUTRITION_CLASSIFICATIONS.NO_SOLUTION,
      classification: MEAL_NUTRITION_CLASSIFICATIONS.NO_SOLUTION,
      code: mode === FOOD_COMBINATION_MODES.ONLY_SELECTED_FOODS
        ? "TARGET_NOT_REACHABLE_WITH_SELECTED_FOODS"
        : "NO_COMPATIBLE_FOOD_COMBINATION",
      alternative: null,
      alternatives: [],
      recommended: false,
      usable: false,
      nutrition: null,
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
    variantSeed: input.variantSeed,
    diversityContext,
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
  // Recalcular siempre devuelve la mejor distribución de este mismo conjunto.
  // Una solicitud legacy de variante no dispara una segunda ejecución idéntica:
  // "Generar otra opción" varía alimentos en el endpoint de generación.
  result.meta.elapsedMs = Date.now() - startedAt;
  return result;
}

export default generateMealAlternative;
