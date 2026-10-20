import ModelFactory from "../model/DAO/alimentosFactory.js";
import menu, {
  TRACKING_CALORIE_FILL_POLICY,
  TRACKING_OPTIMIZATION_POLICY,
} from "../menu2.js";
import { normalizeFoodGenerationForRead } from "./foodGenerationMetadata.js";
import { MEAL_NUTRITION_POLICY } from "./mealNutritionPolicy.js";
import ServicioClientCustomFoods from "./clientCustomFoods.js";

// Un Symbol no puede llegar desde JSON. El modo calorie_fill se habilita
// solamente cuando el servicio especifico de Tracking entrega este contexto.
export const TRACKING_QUANTITY_INTERNAL_CONTEXT = Symbol("tracking_quantity_internal_context");

// Tolerancia exclusiva de mensajería. El optimizador sigue usando su propia
// precisión y su ranking; una diferencia visual de hasta 0,5 g no se anuncia
// como déficit proteico al usuario.
const TRACKING_PROTEIN_MESSAGE_EPSILON = 0.5;

// Diagnóstico opt-in para analizar una generación puntual sin llenar los
// logs normales del servidor. Activar con ZUMAFIT_GENERATION_DEBUG=1.
const generationDebug = (...values) => {
  if (process.env.ZUMAFIT_GENERATION_DEBUG === "1") console.log(...values);
};

const round = (value, digits = 2) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
};

const toNumber = (value, fallback = 0) => {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  const raw = String(value).trim();
  const hasComma = raw.includes(",");
  const hasDot = raw.includes(".");
  const normalized = hasComma && hasDot
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw.replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const cleanText = (value = "") =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const hasValue = (value) => value !== null && value !== undefined && value !== "";

function foodSearchText(food = {}) {
  return cleanText([
    food.Alimentos,
    food.alimentos,
    food.nombre,
    food.name,
    food.Fuente,
    food.fuente,
    food.Categoria,
    food.categoria,
    food.Categoría,
    food.grupo,
    food.Grupo,
  ].filter(Boolean).join(" "));
}

function foodNameText(food = {}) {
  return cleanText(food.Alimentos || food.alimentos || food.nombre || food.name || "");
}

function foodCategoryText(food = {}) {
  return cleanText(food.Fuente || food.fuente || food.Categoria || food.categoria || food.Categoría || food.grupo || food.Grupo || "");
}

function extendedFoodSearchText(food = {}) {
  return cleanText([
    foodSearchText(food),
    food.categoriaZumaFit,
    food.subcategoria,
    food.subcategoriaZumaFit,
    food.grupoOriginal,
    ...(Array.isArray(food.tags) ? food.tags : []),
    food.imagen?.exactaKey,
    food.imagen?.genericaKey,
    food.imagenExactaKey,
    food.imagenGenericaKey,
  ].filter(Boolean).join(" "));
}

function extendedFoodCategoryText(food = {}) {
  return cleanText(
    foodCategoryText(food) ||
    food.categoriaZumaFit ||
    food.grupoOriginal ||
    ""
  );
}

function searchScore(food = {}, search = "", index = 0) {
  const name = foodNameText(food);
  const text = foodSearchText(food);
  if (name === search) return -4000 + index;
  if (name.startsWith(search)) return -3000 + index;
  if (name.includes(search)) return -2000 + index;
  if (text.includes(search)) return -1000 + index;
  return index;
}

function limitFromQuery(value, fallback = 0) {
  const parsed = Math.trunc(toNumber(value, fallback));
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, 50);
}

function filterAlimentos(alimentos = [], filters = {}) {
  const search = cleanText(filters.search || filters.q || filters.nombre || filters.name || "");
  const category = cleanText(filters.category || filters.categoria || filters.fuente || "todos");
  const generationMode = String(filters.mode || filters.generationMode || "").trim().toUpperCase();
  const limit = limitFromQuery(filters.limit, search ? 20 : 0);
  let list = Array.isArray(alimentos) ? [...alimentos] : [];

  if (["EXPLICIT_ONLY", "GENERIC", "DISABLED"].includes(generationMode)) {
    list = list.filter((food) => String(food?.generation?.mode || "EXPLICIT_ONLY").toUpperCase() === generationMode);
  }

  if (search) {
    list = list
      .map((food, index) => ({ food, index, text: extendedFoodSearchText(food) }))
      .filter((item) => item.text.includes(search))
      .sort((a, b) => searchScore(a.food, search, a.index) - searchScore(b.food, search, b.index))
      .map((item) => item.food);
  }

  if (category && category !== "todos") {
    list = list.filter((food) => extendedFoodCategoryText(food) === category);
  }

  return limit ? list.slice(0, limit) : list;
}

function normalizeMode(value = "kcalProteina") {
  const mode = cleanText(value);
  if (["kcal", "calorias", "solo calorias", "solo_calorias"].includes(mode)) return "kcal";
  if (["full", "macros", "macros completos", "completo"].includes(mode)) return "full";
  return "kcalProteina";
}

function normalizeGenerationType(value = "selectedOnly") {
  const type = cleanText(value);
  if (["complete", "completar", "completar comida", "completemeal", "assisted food addition", "assisted_food_addition"].includes(type)) return "completeMeal";
  return "selectedOnly";
}

function normalizeTarget(target = {}, mode = "kcalProteina") {
  const kcal = toNumber(target.kcal ?? target.calorias ?? target.calories, 0);
  const protein = toNumber(target.proteina ?? target.protein ?? target.proteinas, 0);
  const hasCarbs = hasValue(target.carbs ?? target.carbohidratos ?? target.hidratos);
  const hasFat = hasValue(target.grasas ?? target.fat ?? target.grasa);
  let carbs = toNumber(target.carbs ?? target.carbohidratos ?? target.hidratos, 0);
  let fat = toNumber(target.grasas ?? target.fat ?? target.grasa, 0);
  const hasCompleteMacrosInput = mode === "full" && protein > 0 && hasCarbs && hasFat;

  if (mode === "full" && kcal > 0 && (carbs <= 0 || fat <= 0)) {
    const remainingCalories = Math.max(0, kcal - protein * 4);
    if (carbs <= 0 && fat <= 0) {
      carbs = round((remainingCalories * 0.65) / 4, 1);
      fat = round((remainingCalories * 0.35) / 9, 1);
    } else if (carbs <= 0) {
      carbs = round(Math.max(0, remainingCalories - fat * 9) / 4, 1);
    } else if (fat <= 0) {
      fat = round(Math.max(0, remainingCalories - carbs * 4) / 9, 1);
    }
  }

  return {
    calorias: kcal,
    proteina: protein,
    carbohidratos: carbs,
    grasas: fat,
    macrosCompletos: hasCompleteMacrosInput,
  };
}

function isGramBasedUnit(value = "g") {
  return ["g", "gr", "grs", "gramo", "gramos", "ml", "mililitro", "mililitros"].includes(cleanText(value));
}

const QUANTITY_CONSTRAINT_FIELDS = Object.freeze({
  min: ["minGramos", "minQuantity", "cantidadMin", "porcionMin"],
  max: ["maxGramos", "maxQuantity", "cantidadMax", "porcionMax"],
  step: ["stepGramos", "stepQuantity", "step", "multiplo"],
});

function normalizedUnit(value = "") {
  const unit = cleanText(value);
  if (["g", "gr", "grs", "gramo", "gramos"].includes(unit)) return "g";
  if (["ml", "mililitro", "mililitros"].includes(unit)) return "ml";
  return unit;
}

function foodUnit(food = {}) {
  return food.unit || food.unidad || food.Unidad || food.unidadBase || food.measurementUnit || "";
}

function constraintFromShape(food = {}, kind = "max", label = "payload") {
  const fields = QUANTITY_CONSTRAINT_FIELDS[kind] || [];

  for (const [shape, shapeLabel] of [
    [food, label],
    [food?.raw, `${label}.raw`],
  ]) {
    if (!shape || typeof shape !== "object") continue;

    /*
     * =====================================================
     * REGLA NUEVA - TIENE PRIORIDAD
     * =====================================================
     *
     * generation.portionRule es la fuente oficial
     * para generación automática.
     */
    const generationValue =
      shape?.generation?.portionRule?.[kind];

    if (hasValue(generationValue)) {
      const value = toNumber(generationValue, 0);

      if (value > 0) {
        return {
          value,
          source: `${shapeLabel}.generation.portionRule.${kind}`,
        };
      }
    }

    /*
     * =====================================================
     * LEGACY - SOLO FALLBACK
     * =====================================================
     *
     * Se conservan por compatibilidad con alimentos
     * que todavía no tengan generation.portionRule.
     */
    for (const field of fields) {
      if (!hasValue(shape[field])) continue;

      const value = toNumber(shape[field], 0);

      if (value > 0) {
        return {
          value,
          source: `${shapeLabel}.${field}`,
        };
      }
    }
  }

  return null;
}

function foodRecordRank(food = {}) {
  let rank = 0;
  if (food.activo === true) rank += 1000;
  if (food.activo === false) rank -= 1000;
  if (hasValue(food.alimentoId)) rank += 300;
  if (hasValue(food.macroBasis)) rank += 100;
  if (constraintFromShape(food, "max", "catalog")) rank += 50;
  if (constraintFromShape(food, "min", "catalog")) rank += 20;
  if (constraintFromShape(food, "step", "catalog")) rank += 10;
  if (toNumber(food.kcalUnidad ?? food.kcal ?? food.calorias ?? food.Calorias, 0) > 0) rank += 5;
  return rank;
}

function foodIdentityValues(food = {}) {
  return [food.foodId, food.alimentoId, food.id, food._id, food?.raw?._id, food?.raw?.alimentoId]
    .filter(hasValue)
    .map((value) => String(value));
}

function exactCatalogIdentity(food = {}) {
  const value = food?.raw?._id ?? food._id ?? food.foodId ?? food.id ?? food?.raw?.alimentoId ?? food.alimentoId;
  return hasValue(value) ? String(value) : "";
}

function catalogWithUniqueExactIdentities(primary = [], extras = []) {
  const selected = [];
  const seen = new Set();
  for (const food of [...primary, ...extras]) {
    const identity = exactCatalogIdentity(food);
    if (identity && seen.has(identity)) continue;
    selected.push(food);
    if (identity) seen.add(identity);
  }
  return selected;
}

function catalogFoodFor(payloadFood = {}, allFoods = []) {
  const payloadIds = new Set(foodIdentityValues(payloadFood));
  const name = foodNameText(payloadFood);
  const unit = normalizedUnit(foodUnit(payloadFood));
  const records = Array.isArray(allFoods) ? allFoods : [];
  const rankCandidates = (candidates) =>
    candidates.sort((left, right) => foodRecordRank(right) - foodRecordRank(left))[0] || null;

  if (payloadIds.size) {
    const exactIdCandidates = records.filter((candidate) =>
      foodIdentityValues(candidate).some((id) => payloadIds.has(id))
    );
    // Un request con identidad conserva su snapshot si el catálogo ya no
    // contiene ese ID. Caer por nombre mezclaría sus macros con constraints de
    // un homónimo distinto.
    return rankCandidates(exactIdCandidates);
  }

  const candidates = records.filter((candidate) => {
    if (!name || foodNameText(candidate) !== name) return false;
    const candidateUnit = normalizedUnit(foodUnit(candidate));
    return !unit || !candidateUnit || candidateUnit === unit;
  });
  return rankCandidates(candidates);
}

function resolvedQuantityConstraints(payloadFood = {}, catalogFood = null) {
  const resolved = {};
  const sources = {};
  for (const kind of Object.keys(QUANTITY_CONSTRAINT_FIELDS)) {
    const constraint =
      constraintFromShape(catalogFood, kind, "catalog") ||
      constraintFromShape(payloadFood, kind, "payload");
    if (!constraint) continue;
    resolved[kind] = constraint.value;
    sources[kind] = constraint.source;
  }
  return { ...resolved, sources };
}

function preferStructuredFoodRecords(alimentos = []) {
  const selected = new Map();
  (Array.isArray(alimentos) ? alimentos : []).forEach((food, index) => {
    const name = foodNameText(food);
    const unit = normalizedUnit(foodUnit(food));
    const key = name ? `${name}|${unit}` : `__record_${index}`;
    const current = selected.get(key);
    if (!current || foodRecordRank(food) > foodRecordRank(current)) selected.set(key, food);
  });
  return [...selected.values()];
}

function normalizeFoodLike(raw = {}, fallbackName = "", catalogFood = null) {
  const name =
    raw.name ||
    raw.nombre ||
    raw.Alimentos ||
    raw.nombreSnapshot ||
    raw.alimento ||
    fallbackName ||
    "Alimento";

  const quantity = toNumber(raw.quantity ?? raw.cantidad ?? raw.grams, 0);
  const kcalTotal = toNumber(raw.kcal ?? raw.calorias ?? raw.Calorias, 0);
  const proteinTotal = toNumber(raw.protein ?? raw.proteina ?? raw.Proteinas, 0);
  const carbsTotal = toNumber(raw.carbs ?? raw.carbohidratos ?? raw.Carbohidratos, 0);
  const fatTotal = toNumber(raw.fat ?? raw.grasas ?? raw.Grasas, 0);

  let kcalPerGram = toNumber(raw.kcalPerUnitOrGram ?? raw.kcalPerGram, 0);
  let proteinPerGram = toNumber(raw.proteinPerUnitOrGram ?? raw.proteinPerGram, 0);
  let carbsPerGram = toNumber(raw.carbsPerUnitOrGram ?? raw.carbsPerGram, 0);
  let fatPerGram = toNumber(raw.fatPerUnitOrGram ?? raw.fatPerGram, 0);

  if (quantity > 0 && (kcalTotal || proteinTotal || carbsTotal || fatTotal)) {
    kcalPerGram = kcalPerGram || kcalTotal / quantity;
    proteinPerGram = proteinPerGram || proteinTotal / quantity;
    carbsPerGram = carbsPerGram || carbsTotal / quantity;
    fatPerGram = fatPerGram || fatTotal / quantity;
  }

  const unit = raw.unit || raw.unidad || foodUnit(catalogFood) || "g";
  const constraints = resolvedQuantityConstraints(raw, catalogFood);
  return {
    id: raw.foodId || raw.alimentoId || raw.id || raw._id || null,
    nombre: String(name).trim(),
    calorias: kcalPerGram || kcalTotal,
    proteina: proteinPerGram || proteinTotal,
    carbohidratos: carbsPerGram || carbsTotal,
    grasas: fatPerGram || fatTotal,
    categoria:
      raw.categoria ||
      raw.categoriaSnapshot ||
      raw.fuente ||
      raw.source ||
      catalogFood?.categoria ||
      catalogFood?.categoriaZumaFit ||
      catalogFood?.Fuente ||
      "",
    unidad: unit,
    macroBasis: isGramBasedUnit(unit) ? "perGram" : "perUnit",
    quantity,
    currentQuantity: toNumber(raw.currentQuantity ?? raw.cantidadActual ?? raw.automaticQuantity, 0),
    source: cleanText(raw.source || raw.quantitySource || raw.quantityStatus),
    minGramos: constraints.min,
    maxGramos: constraints.max,
    stepGramos: constraints.step,
    quantityConstraintSources: constraints.sources,
    allowFractionalQuantity:
      raw.allowFractionalQuantity === true ||
      raw.fractionalQuantityAllowed === true ||
      raw.fractionalUnitsAllowed === true ||
      catalogFood?.allowFractionalQuantity === true ||
      catalogFood?.fractionalQuantityAllowed === true ||
      catalogFood?.fractionalUnitsAllowed === true,
  };
}

function inferMacroRole(food = {}) {
  const normalized = menu.normalizeFood(food) || food;
  const name = cleanText(normalized.nombre || food.nombre || food.name);
  const category = cleanText(normalized.categoria || food.categoria || food.fuente || food.source);

  if (/aceite|palta|almendra|nuez|mani|manteca|fruto seco/.test(name) || category.includes("grasa")) return "grasas";
  if (/arroz|papa|batata|fideo|pasta|pan|avena|banana|manzana|fruta|cereal/.test(name) || category.includes("carbo")) {
    return "carbohidratos";
  }
  if (/pollo|pavo|carne|atun|atún|pescado|whey|huevo|yogur|queso|jamon|jamón/.test(name) || category.includes("prote")) {
    return "proteicos";
  }

  const protein = toNumber(normalized.proteina ?? normalized.protein, 0);
  const carbs = toNumber(normalized.carbohidratos ?? normalized.carbs, 0);
  const fat = toNumber(normalized.grasas ?? normalized.fat, 0);
  const max = Math.max(protein, carbs, fat);
  if (max === protein) return "proteicos";
  if (max === carbs) return "carbohidratos";
  return "grasas";
}

function gramsLimitsForFood(food = {}, role = "", { explicitOnly = false } = {}) {
  const name = cleanText(food.nombre || food.name);
  const category = cleanText(food.categoria || food.fuente || food.source);
  const shapeConstraints = resolvedQuantityConstraints(food);
  const explicitMin = toNumber(shapeConstraints.min, 0);
  const explicitMax = toNumber(shapeConstraints.max, 0);
  const explicitStep = toNumber(shapeConstraints.step, 0);
  const sourceFor = (kind, fallback) =>
    food.quantityConstraintSources?.[kind] || shapeConstraints.sources?.[kind] || fallback;
  const limits = (minGramos, maxGramos, stepGramos, fallbacks = {}) => ({
    minGramos,
    maxGramos,
    stepGramos,
    minSource: sourceFor("min", fallbacks.min),
    maxSource: sourceFor("max", fallbacks.max),
    stepSource: sourceFor("step", fallbacks.step),
    minExplicit: explicitMin > 0,
    maxExplicit: explicitMax > 0,
    stepExplicit: explicitStep > 0,
  });

  if (explicitOnly) {
    return limits(explicitMin, explicitMax, explicitStep, {
      min: "automatic.unbounded.min",
      max: "automatic.unbounded.max",
      step: "automatic.unbounded.step",
    });
  }

  if (!isGramBasedUnit(food.unidad || food.unit)) {
    return limits(explicitMin || 1, explicitMax || 12, explicitStep || 1, {
      min: "fallback.discrete.min",
      max: "fallback.discrete.max12",
      step: "fallback.discrete.step",
    });
  }

  const namedLimits = (min, max, step = 1, fallbackLabel = "named") =>
    limits(explicitMin || min, explicitMax || max, explicitStep || step, {
      min: `fallback.${fallbackLabel}.min`,
      max: `fallback.${fallbackLabel}.max`,
      step: `fallback.${fallbackLabel}.step`,
    });

  if (/aceite|oil/.test(name)) return namedLimits(2, 25, 1, "oil");
  if (/whey|proteina en polvo|protein powder/.test(name)) return namedLimits(10, 60, 1, "proteinPowder");
  if (/almendra|nuez|mani|maní|fruto seco|frutos secos/.test(name)) return namedLimits(5, 40, 1, "nuts");
  if (/palta|avocado/.test(name)) return namedLimits(30, 250, 1, "avocado");
  if (/banana|manzana|pera|fruta|higo|sandia/.test(name) || category.includes("fruta")) {
    return namedLimits(50, 250, 1, "fruit");
  }
  if (/arroz|fideo|pasta|papa|batata|pan|avena|cereal/.test(name) || role === "carbohidratos") {
    return namedLimits(20, 300, 1, "carbohydrates");
  }
  if (/bife|chorizo|pollo|pavo|carne|atun|pescado|higado|jamon|huevo/.test(name) || role === "proteicos") {
    return namedLimits(50, 400, 1, "protein");
  }
  if (/pollo|pavo|carne|atun|atún|pescado|higado|jamon|jamón|huevo/.test(name) || role === "proteicos") {
    return namedLimits(50, 300, 1, "proteinLegacy");
  }
  if (/verdura|tomate|lechuga|brocoli|brócoli|zanahoria|zapallo/.test(name)) {
    return namedLimits(50, 300, 1, "vegetables");
  }
  return limits(explicitMin, explicitMax || 300, explicitStep || 1, {
    min: "fallback.generic.min0",
    max: "fallback.generic.max300",
    step: "fallback.generic.step",
  });
}

function itemForEngine(food = {}, options = {}) {
  const role = options.role || inferMacroRole(food);
  const limits = gramsLimitsForFood(food, role, {
    explicitOnly: options.explicitConstraintsOnly === true,
  });
  const sourceKind = options.sourceKind || (options.fixed ? "fixed" : "selectedPending");
  return {
    id: food.id || food.foodId || food.alimentoId || food._id || null,
    nombre: food.nombre || food.name,
    unidad: food.unidad || food.unit || "g",
    macroBasis: food.macroBasis || (isGramBasedUnit(food.unidad || food.unit) ? "perGram" : "perUnit"),
    allowFractionalQuantity: food.allowFractionalQuantity === true,
    calorias: toNumber(food.calorias ?? food.kcalPerUnitOrGram, 0),
    proteina: toNumber(food.proteina ?? food.proteinPerUnitOrGram, 0),
    carbohidratos: toNumber(food.carbohidratos ?? food.carbsPerUnitOrGram, 0),
    grasas: toNumber(food.grasas ?? food.fatPerUnitOrGram, 0),
    categoria: food.categoria || food.fuente || food.source || role,
    cantidad: options.fixed
      ? toNumber(options.quantity, 0)
      : toNumber(options.currentQuantity, 0) || undefined,
    fixedQuantity: !!options.fixed,
    quantityPending: !options.fixed,
    sourceKind,
    selectedPendingFood: !options.fixed && sourceKind !== "addedCandidate",
    addedCandidateFood: sourceKind === "addedCandidate",
    minGramos: options.fixed ? 0 : limits.minGramos,
    maxGramos: limits.maxGramos,
    stepGramos: limits.stepGramos,
    minSource: options.fixed ? "fixed.quantity" : limits.minSource,
    maxSource: limits.maxSource,
    stepSource: limits.stepSource,
    maxExplicit: limits.maxExplicit,
  };
}

function addToGroups(groups, item, role) {
  const key = role || inferMacroRole(item);
  if (key === "proteicos") groups.proteicos.push(item);
  else if (key === "carbohidratos") groups.carbohidratos.push(item);
  else groups.grasas.push(item);
}

function selectedNameSet(...lists) {
  const set = new Set();
  for (const list of lists) {
    for (const item of list || []) set.add(cleanText(item.name || item.nombre || item.Alimentos || item.nombreSnapshot));
  }
  return set;
}

function selectedIdentitySet(...lists) {
  const set = new Set();
  for (const list of lists) {
    for (const item of list || []) {
      for (const id of foodIdentityValues(item)) set.add(id);
    }
  }
  return set;
}

function belongsToSelection(food = {}, ids = new Set(), names = new Set()) {
  const foodIds = foodIdentityValues(food);
  if (foodIds.length) return foodIds.some((id) => ids.has(id));
  return names.has(cleanText(food.nombre || food.name || food.Alimentos));
}

function scoreCandidate(food = {}, role = "") {
  const normalized = menu.normalizeFood(food) || food;
  const name = cleanText(normalized.nombre || food.nombre || food.name);
  const category = cleanText(normalized.categoria || food.categoria || food.fuente || food.source);
  let score = 0;

  if (role === "proteicos") {
    score += toNumber(normalized.proteina, 0) * 1000;
    if (/pollo|pavo|atun|atún|whey|huevo|yogur|carne|pescado/.test(name)) score += 80;
    if (category.includes("prote")) score += 50;
    score -= toNumber(normalized.grasas, 0) * 60;
  }
  if (role === "carbohidratos") {
    score += toNumber(normalized.carbohidratos, 0) * 1000;
    if (/arroz|papa|batata|pan|avena|banana|fideo|pasta/.test(name)) score += 80;
    if (category.includes("carbo")) score += 50;
    score -= toNumber(normalized.grasas, 0) * 40;
  }
  if (role === "grasas") {
    score += toNumber(normalized.grasas, 0) * 1000;
    if (/aceite|palta|almendra|nuez|mani|maní/.test(name)) score += 90;
    if (category.includes("grasa")) score += 50;
  }

  if (toNumber(normalized.calorias, 0) <= 0) score -= 9999;
  return score;
}

function pickCandidates(allFoods = [], selectedNames = new Set(), targetRoles = []) {
  const normalized = (Array.isArray(allFoods) ? allFoods : [])
    .map((food) => menu.normalizeFood(food))
    .filter((food) => food && food.nombre && food.calorias > 0)
    .filter((food) => !selectedNames.has(cleanText(food.nombre)));

  const picks = [];
  const used = new Set(selectedNames);
  for (const role of targetRoles) {
    const best = normalized
      .filter((food) => inferMacroRole(food) === role)
      .filter((food) => !used.has(cleanText(food.nombre)))
      .sort((a, b) => scoreCandidate(b, role) - scoreCandidate(a, role))[0];

    if (best) {
      picks.push(best);
      used.add(cleanText(best.nombre));
    }
  }

  return picks.slice(0, 3);
}

function qualityFromStatus(status = "") {
  if (status === "exacto" || status === "muy_cercano") return "muy_cerca";
  if (status === "cercano") return "aceptable";
  if (status === "error" || status === "sin_solucion") return "sin_solucion";
  return "revisar";
}

function messageForResult(result = {}, mode = "", generationType = "") {
  if (result.errors?.length) return result.errors[0];
  const diff = result.diferencia || {};
  const kcalAbs = Math.abs(toNumber(diff.calorias, 0));
  const proteinDiff = toNumber(diff.proteina, 0);
  const carbsDiff = toNumber(diff.carbohidratos, 0);
  const fatDiff = toNumber(diff.grasas, 0);
  const reachedMax = [
    ...(result.proteicos || []),
    ...(result.carbohidratos || []),
    ...(result.grasas || []),
  ].some((food) => toNumber(food.maxGramos, 0) > 0 && toNumber(food.cantidad, 0) >= toNumber(food.maxGramos, 0) - 0.5);
  const generationHint = generationType === "selectedOnly"
    ? " con estos alimentos"
    : " usando alimentos compatibles";
  const trackingOptimization = result.optimizacionTracking || null;

  if (trackingOptimization?.policy === TRACKING_CALORIE_FILL_POLICY) {
    if (trackingOptimization.invalidFoods?.length && result.errors?.length) {
      return result.errors[0];
    }
    if (trackingOptimization.calorieTargetCompleted === true) {
      if (trackingOptimization.macroLimitations?.length) {
        return "Objetivo calorico completado. Con estos alimentos no es posible acercarse a todos los macronutrientes; revisa el detalle antes de confirmar.";
      }
      return "Objetivo calorico completado.";
    }
    const remaining = round(trackingOptimization.calorieDeficit, 1);
    if (trackingOptimization.discreteLimited === true) {
      return `Quedan aproximadamente ${remaining} kcal. Con las unidades enteras seleccionadas no es posible acercarse mas a la meta calorica.`;
    }
    if (trackingOptimization.granularityLimited === true) {
      return `Quedan aproximadamente ${remaining} kcal. Con la granularidad fisica de los alimentos seleccionados no es posible acercarse mas sin superar el objetivo.`;
    }
    return `Todavia faltan aproximadamente ${remaining} kcal para completar esta comida.`;
  }

  if (trackingOptimization?.policy === TRACKING_OPTIMIZATION_POLICY) {
    if (trackingOptimization.proteinTargetActive !== true) {
      if (Math.abs(carbsDiff) > 0.5 || Math.abs(fatDiff) > 0.5) {
        return "La proteina restante ya estaba cubierta. Las metas de carbohidratos y grasas no pueden alcanzarse exactamente con estos alimentos dentro del limite calorico; esta es la combinacion mas equilibrada disponible.";
      }
      return "La proteina restante ya estaba cubierta. La propuesta respeta el limite calorico y equilibra los macros configurados.";
    }
    if (trackingOptimization.proteinDeficit > 10) {
      return `Esta combinacion queda ${round(trackingOptimization.proteinDeficit, 1)} g por debajo de tu meta de proteina. Te conviene agregar o reemplazar un alimento proteico.`;
    }
    if (trackingOptimization.proteinDeficit > TRACKING_PROTEIN_MESSAGE_EPSILON) {
      return `Faltan aproximadamente ${round(trackingOptimization.proteinDeficit, 1)} g de proteina. Podes revisar la seleccion o continuar igualmente.`;
    }
    if (trackingOptimization.normalCalorieZoneReached !== true) {
      return `Con estos alimentos, el mejor nivel calorico alcanzable es ${round(trackingOptimization.bestReachableCalories, 1)} kcal y queda fuera de la zona esperada. Podes revisar la seleccion o continuar igualmente.`;
    }
    if (Math.abs(carbsDiff) > 0.5 || Math.abs(fatDiff) > 0.5) {
      return "La propuesta alcanza la proteina y usa el mejor equilibrio disponible de carbohidratos y grasas dentro de la zona calorica.";
    }
    return "La propuesta respeta el techo calorico, alcanza la proteina y equilibra los macros configurados.";
  }

  if (mode === "kcal") {
    if (diff.calorias < -10 && reachedMax) {
      return `Queda a ${round(diff.calorias, 1)} kcal porque algun alimento alcanzo el maximo permitido. Agrega otro alimento o usa Completar comida.`;
    }
    if (kcalAbs <= 10) return "Llega a calorias. Proteina, carbohidratos y grasas se optimizan como preferencias secundarias.";
    return "No se pudo respetar el margen de 10 kcal sin salir de cantidades razonables. Revisa el resultado antes de aplicarlo.";
  }

  if (mode === "kcalProteina") {
    if (diff.calorias < -10 && reachedMax) {
      return `Queda a ${round(diff.calorias, 1)} kcal porque algun alimento alcanzo el maximo permitido. Podes agregar otro alimento o usar Completar comida.`;
    }
    if (proteinDiff < -1) {
      if (kcalAbs <= 10) {
        return "Llega a calorias, pero no alcanza la proteina minima. Agrega una fuente proteica o usa Completar comida.";
      }
      return "No llega a la proteina minima ni respeta el margen de 10 kcal. Agrega una fuente proteica o usa Completar comida.";
    }
    if (proteinDiff > 2 && kcalAbs <= 10) {
      return `Llega a calorias y cumple proteina minima. Supera proteina por ${round(proteinDiff, 1)} g.`;
    }
    if (kcalAbs <= 10) return "Llega a calorias y cumple la proteina minima.";
    return "Cumple proteina minima, pero no respeta el margen de 10 kcal. Revisa alimentos o cantidades maximas.";
  }

  if (mode === "full") {
    const missing = [];
    if (proteinDiff < -5) missing.push("proteina");
    if (carbsDiff < -10) missing.push("carbohidratos");
    if (fatDiff < -6) missing.push("grasas");
    if (missing.length) {
      return `No se puede acercar a todos los macros${generationHint}. Falta una fuente de ${missing.join("/")}.`;
    }
    if (result.status === "exacto" || result.status === "muy_cercano") return "Las cantidades quedan muy bien balanceadas en kcal y macros.";
    if (result.status === "cercano") return "Resultado aceptable: kcal cerca y macros razonables.";
    return "No hay una solucion perfecta para todos los macros. Proba calorias + proteina o agrega una fuente faltante.";
  }

  if (result.status === "exacto") return "Las cantidades quedan muy bien ajustadas al objetivo.";
  if (result.status === "muy_cercano") return "Resultado muy cercano. Podes aplicarlo y ajustar fino si queres.";
  if (result.status === "cercano") return "Resultado aceptable. El objetivo por comida puede compensarse en otras comidas.";
  return "Revisa el resultado antes de aplicarlo.";
}

class ServicioAlimentos {
  constructor(persistencia) {
    this.model = ModelFactory.get(persistencia);
    this.customFoodsService = new ServicioClientCustomFoods();
  }

  _catalogForActor = async (actor = null) => {
    const globalFoods = await this.model.obtenerAlimentos();
    if (!actor?.id && !actor?._id && !actor?.targetUserId) return globalFoods;
    let customFoods = [];
    try {
      customFoods = await this.customFoodsService.visibleFoods(actor);
    } catch (error) {
      // Los tests unitarios del motor reemplazan el catalogo global por un
      // adapter en memoria sin abrir Mongo. En produccion, si Mongo cae, la
      // lectura global anterior ya falla y no se oculta el error real.
      if (!/No hay conexion a la base de datos/i.test(String(error?.message || ""))) throw error;
    }
    return [...globalFoods, ...customFoods];
  };

  obtenerAlimentos = async (filters = {}, actor = null) => {
    try {
      const alimentosTotales = await this._catalogForActor(actor);
      return filterAlimentos(preferStructuredFoodRecords(alimentosTotales), filters);
    } catch (error) {
      console.error("Error al obtener alimentos:", error);
      throw new Error("No se pudieron obtener los alimentos");
    }
  };

  obtenerComida = async (calorias, proteinas, carbohidratos, grasas, alimentos) => {
    try {
      const alimentosTotales = await this.model.obtenerAlimentos();
      const resultado = menu.generarMenu(
        Number(calorias),
        Number(proteinas),
        Number(carbohidratos),
        Number(grasas),
        alimentos,
        alimentosTotales
      );

      return {
        status: "success",
        data: resultado,
      };
    } catch (error) {
      console.error("Error al obtener comida:", error);
      throw new Error("No se pudo obtener la comida");
    }
  };

  obtenerComidaSoloConCaloriasYProteinas = async (calorias, proteinas, alimentos) => {
    try {
      const alimentosTotales = await this.model.obtenerAlimentos();
      const resultado = menu.generarMenu({
        modo: "kcalProteina",
        objetivo: { calorias, proteina: proteinas, carbohidratos: 0, grasas: 0 },
        alimentosSeleccionados: alimentos,
        alimentosBase: alimentosTotales,
      });

      return {
        status: "success",
        data: resultado,
      };
    } catch (error) {
      console.error("Error al obtener comida kcal/proteina:", error);
      throw new Error("No se pudo obtener la comida");
    }
  };

  obtenerComidaPrueba = async () => {
    try {
      const resultado = menu.generarMenu();
      return {
        status: "success",
        data: resultado,
      };
    } catch (error) {
      console.error("Error al obtener comida de prueba:", error);
      throw new Error("No se pudieron obtener los alimentos de prueba");
    }
  };

  obtenerComidasEquivalentes = async () => {
    try {
      const n = 10;
      const data = typeof menu.generarMenusNoVacios === "function"
        ? menu.generarMenusNoVacios(n, 8)
        : menu.generarMenus(n);
      return { status: "success", cantidad: n, data };
    } catch (error) {
      console.error("Error al obtener las comidas equivalentes:", error);
      throw new Error("No se pudieron obtener las comidas equivalentes");
    }
  };

  generarCantidades = async (payload = {}, internalContext = null, actor = null) => {
    const mode = normalizeMode(payload.mode || payload.modo);
    const generationType = normalizeGenerationType(payload.generationType || payload.alcance);
    const target = normalizeTarget(payload.target || payload.mealTarget || {}, mode);
    const trackingContextAllowed =
      internalContext?.authorization === TRACKING_QUANTITY_INTERNAL_CONTEXT;
    const internalTrackingQuantityMode = trackingContextAllowed
      ? internalContext.trackingQuantityMode
      : "";
    const menuGenerationPolicy = trackingContextAllowed && payload.menuGenerationPolicy === "generic_menu_v1";
    const generationMealType = String(payload.generationMealType || "");
    const enforceQuantityConstraints = trackingContextAllowed && (
      internalContext?.enforceQuantityConstraints === true || menuGenerationPolicy
    );
    const trackingOptimizationPolicy = internalTrackingQuantityMode === "calorie_fill"
      ? TRACKING_CALORIE_FILL_POLICY
      : internalTrackingQuantityMode === "constrained"
        ? TRACKING_OPTIMIZATION_POLICY
        : payload.options?.trackingOptimizationPolicy === TRACKING_OPTIMIZATION_POLICY
          ? TRACKING_OPTIMIZATION_POLICY
          : undefined;
    const mealNutritionPolicy = trackingContextAllowed &&
      internalContext?.mealNutritionPolicy === MEAL_NUTRITION_POLICY
      ? MEAL_NUTRITION_POLICY
      : undefined;
    const internalCandidateRoles = trackingContextAllowed && Array.isArray(internalContext?.candidateRoles)
      ? internalContext.candidateRoles.filter((role) => ["proteicos", "carbohidratos", "grasas"].includes(role)).slice(0, 3)
      : [];

    const fixedFoods = Array.isArray(payload.fixedFoods) ? payload.fixedFoods : [];
    const pendingFoods = Array.isArray(payload.pendingFoods) ? payload.pendingFoods : [];
    const explicitCandidates = Array.isArray(payload.candidateFoods) ? payload.candidateFoods : [];
    const allFoods = await this._catalogForActor(actor);
    generationDebug("\n========================================");
generationDebug("🍽️ ZUMAFIT - GENERACIÓN DE COMIDA");
generationDebug("========================================");

generationDebug("Tipo de comida:", generationMealType);

generationDebug("Target:", {
  kcal: target.calorias,
  proteina: target.proteina,
  carbs: target.carbohidratos,
  grasas: target.grasas,
});

generationDebug(
  "Alimentos FIJOS:",
  fixedFoods.map((food) => ({
    nombre: food.name || food.nombre,
    cantidad: food.quantity || food.cantidad,
  }))
);

generationDebug(
  "Alimentos seleccionados / AUTO:",
  pendingFoods.map((food) => ({
    nombre: food.name || food.nombre,
    cantidad: food.quantity || food.cantidad,
  }))
);

generationDebug(
  "Candidatos recibidos:",
  explicitCandidates.map(
    (food) => food.name || food.nombre
  )
);

if (menuGenerationPolicy) {
  /*
   * =====================================================
   * ALIMENTOS ELEGIDOS EXPLÍCITAMENTE POR EL USUARIO
   * =====================================================
   *
   * GENERIC:
   *   puede ser elegido automáticamente por ZumaFit.
   *
   * EXPLICIT_ONLY:
   *   no puede ser elegido solo por ZumaFit,
   *   pero SÍ puede usarse si el usuario lo eligió.
   *
   * DISABLED:
   *   no debe utilizarse ni siquiera explícitamente.
   *
   * Además, la elección explícita del usuario tiene
   * prioridad sobre generation.mealTypes.
   *
   * Ej:
   * Pan blanco -> Desayuno
   *
   * puede utilizarse aunque Pan no tenga
   * mealTypes.breakfast = true.
   */

  const explicitlySelectedFoods = [
    ...fixedFoods,
    ...pendingFoods,
  ];

  const invalidSelected =
    explicitlySelectedFoods.find((food) => {
      const catalogFood =
        catalogFoodFor(food, allFoods);

      /*
       * El alimento tiene que seguir existiendo
       * en nuestro catálogo.
       */
      if (!catalogFood) {
        return true;
      }

      const generation =
        normalizeFoodGenerationForRead(
          catalogFood?.generation
        );

      /*
       * Sólo DISABLED queda prohibido.
       *
       * GENERIC y EXPLICIT_ONLY son válidos
       * cuando el usuario los eligió.
       */
      return generation.mode === "DISABLED";
    });

  if (invalidSelected) {
    const catalogFood =
      catalogFoodFor(
        invalidSelected,
        allFoods
      );

    const generation =
      normalizeFoodGenerationForRead(
        catalogFood?.generation
      );

    const foodName =
      invalidSelected.name ||
      invalidSelected.nombre ||
      "seleccionado";

    const error = new Error(
      !catalogFood
        ? `El alimento ${foodName} ya no está disponible en el catálogo.`
        : generation.mode === "DISABLED"
          ? `El alimento ${foodName} está deshabilitado y no puede utilizarse.`
          : `No se pudo utilizar el alimento ${foodName}.`
    );

    error.code = "MENU_NON_GENERIC_FOOD";

    throw error;
  }
}

    const normalizedFixed = fixedFoods.map((food) =>
      normalizeFoodLike(food, "", catalogFoodFor(food, allFoods))
    );
    const normalizedPending = pendingFoods.map((food) =>
      normalizeFoodLike(food, "", catalogFoodFor(food, allFoods))
    );
    const selectedNames = selectedNameSet(normalizedFixed, normalizedPending);

    const groups = { proteicos: [], carbohidratos: [], grasas: [] };
    const alimentosBase = [];

    for (const food of normalizedFixed) {
      const role = inferMacroRole(food);
      alimentosBase.push(food);
      addToGroups(groups, itemForEngine(food, { role, fixed: true, quantity: food.quantity }), role);
    }

    for (const food of normalizedPending) {
      const role = inferMacroRole(food);
      alimentosBase.push(food);
      addToGroups(groups, itemForEngine(food, {
        role,
        fixed: false,
        sourceKind: "selectedPending",
        currentQuantity: food.currentQuantity,
        explicitConstraintsOnly: menuGenerationPolicy,
      }), role);
    }

    const addedCandidateNames = new Set();
    const addedCandidateIds = new Set();
    if (generationType === "completeMeal") {
      const neededRoles = [...internalCandidateRoles];
      if (!groups.proteicos.length && mode !== "kcal") neededRoles.push("proteicos");
      if (!groups.carbohidratos.length) neededRoles.push("carbohidratos");
      if (!groups.grasas.length) neededRoles.push("grasas");

      // Los alimentos privados nunca se sugieren ni completan automaticamente.
      // Solamente entran al motor cuando el cliente ya los mando como fixed/pending.
      const rawCandidates = (explicitCandidates.length ? explicitCandidates : allFoods)
        .filter((food) => food?.customFood !== true && food?.privateFood !== true);
      const candidatesSource = menuGenerationPolicy
        ? rawCandidates.filter((food) => {
            const generation = normalizeFoodGenerationForRead(food?.generation);
            return generation.mode === "GENERIC" && generation.mealTypes[generationMealType] === true;
          })
        : rawCandidates;
      const candidates = pickCandidates(candidatesSource, selectedNames, Array.from(new Set(neededRoles)));

generationDebug(
  "🔎 Roles que faltaban:",
  Array.from(new Set(neededRoles))
);

generationDebug(
  "🤖 Candidatos agregados automáticamente:",
  candidates.map((food) => ({
    nombre: food.nombre || food.name,
    rol: inferMacroRole(food),
  }))
);

      for (const candidate of candidates) {
        const role = inferMacroRole(candidate);
        alimentosBase.push(candidate);
        addedCandidateNames.add(cleanText(candidate.nombre || candidate.name));
        for (const id of foodIdentityValues(candidate)) addedCandidateIds.add(id);
        addToGroups(groups, itemForEngine(candidate, {
          role,
          fixed: false,
          sourceKind: "addedCandidate",
          explicitConstraintsOnly: menuGenerationPolicy,
        }), role);
      }
    }

    const engineFoods = enforceQuantityConstraints
      // El catálogo temporal de la ronda ya contiene la regla efectiva. Para
      // una identidad exacta no agregamos además el snapshot normalizado: así
      // menu2 nunca debe decidir cuál de dos versiones rivales gana.
      ? catalogWithUniqueExactIdentities(allFoods, alimentosBase)
      : [...allFoods, ...alimentosBase];

generationDebug("🧮 ALIMENTOS QUE ENTRAN AL MOTOR");

generationDebug(
  "Proteicos:",
  groups.proteicos.map((food) => ({
    nombre: food.nombre,

    min: food.minGramos,
    minSource: food.minSource,

    max: food.maxGramos,
    maxSource: food.maxSource,

    step: food.stepGramos,
    stepSource: food.stepSource,

    fixed: food.fixedQuantity,
    source: food.sourceKind,
  }))
);



generationDebug(
  "Carbohidratos:",
  groups.carbohidratos.map((food) => ({
    nombre: food.nombre,
    min: food.minGramos,
    max: food.maxGramos,
    fixed: food.fixedQuantity,
    source: food.sourceKind,
  }))
);

generationDebug(
  "Grasas:",
  groups.grasas.map((food) => ({
    nombre: food.nombre,
    min: food.minGramos,
    max: food.maxGramos,
    fixed: food.fixedQuantity,
    source: food.sourceKind,
  }))
);


    const result = menu.generarMenu({
      modo: mode,
      objetivo: target,
      alimentosProteACuadrar: groups.proteicos,
      alimentosChACuadrar: groups.carbohidratos,
      alimentosGrACuadrar: groups.grasas,
      // Los snapshots elegidos para esta operación prevalecen sobre la base
      // global si comparten nombre. Así Tracking y los editores calculan con
      // los mismos macros que el usuario está viendo.
      alimentosBase: engineFoods,
      permitirDefaults: false,
      redondear: payload.options?.redondear !== false,
      // El boolean legacy no puede habilitar por sí solo la policy de Tracking.
      // El identificador explícito actúa como allowlist validada en servidor.
      trackingPriority:
        trackingOptimizationPolicy === TRACKING_OPTIMIZATION_POLICY &&
        payload.options?.trackingPriority === true,
      trackingOptimizationPolicy,
      ...(mealNutritionPolicy ? { mealNutritionPolicy } : {}),
      // Sólo puede habilitarlo un contexto interno autorizado. No se confía en el payload HTTP.
      ...(enforceQuantityConstraints ? { enforceQuantityConstraints: true } : {}),
      generarVariante: payload.options?.generarVariante === true || payload.options?.generateVariant === true,
      variantSeed: payload.options?.variantSeed,
    });
generationDebug("✅ RESULTADO DEL MOTOR");

generationDebug("Status:", result.status);

generationDebug("Totales:", result.totales);

generationDebug("Diferencia:", result.diferencia);

generationDebug(
  "Proteicos finales:",
  (result.proteicos || []).map((food) => ({
    nombre: food.nombre,
    cantidad: food.cantidad,
    kcal: food.calorias,
    proteina: food.proteina,
  }))
);

generationDebug(
  "Carbos finales:",
  (result.carbohidratos || []).map((food) => ({
    nombre: food.nombre,
    cantidad: food.cantidad,
    kcal: food.calorias,
    proteina: food.proteina,
  }))
);

generationDebug(
  "Grasas finales:",
  (result.grasas || []).map((food) => ({
    nombre: food.nombre,
    cantidad: food.cantidad,
    kcal: food.calorias,
    proteina: food.proteina,
  }))
);

generationDebug("========================================\n");




    const sourceFoods = enforceQuantityConstraints
      ? engineFoods
      : [...allFoods, ...alimentosBase];
    const foodByName = new Map(
      sourceFoods
        .map((food) => [cleanText(food.nombre || food.name || food.Alimentos), food])
        .filter(([name]) => name)
    );
    const fixedNames = selectedNameSet(normalizedFixed);
    const selectedPendingNames = selectedNameSet(normalizedPending);
    const fixedIds = selectedIdentitySet(normalizedFixed);
    const selectedPendingIds = selectedIdentitySet(normalizedPending);
    const foods = [...(result.proteicos || []), ...(result.carbohidratos || []), ...(result.grasas || [])].map((food) => {
      const key = cleanText(food.nombre);
      const sourceFood = catalogFoodFor(
        { foodId: food.id, name: food.nombre },
        sourceFoods
      ) || foodByName.get(key) || {};
      const sourceImage = sourceFood.imagen && typeof sourceFood.imagen === "object" ? sourceFood.imagen : {};
      const imageUrl = sourceImage.url || sourceFood.imagenUrl || sourceFood.imagenUrlExacta || sourceFood.imagenUrlGenerica || "";
      const source = belongsToSelection(food, fixedIds, fixedNames)
        ? "fixed"
        : belongsToSelection(food, addedCandidateIds, addedCandidateNames)
          ? "addedCandidate"
          : belongsToSelection(food, selectedPendingIds, selectedPendingNames)
            ? "generated"
            : "generated";

      return {
        foodId: food.id || food.alimentoId || null,
        name: food.nombre,
        nombre: food.nombre,
        quantity: food.cantidad,
        cantidad: food.cantidad,
        unit: foodUnit(sourceFood) || "g",
        unidad: foodUnit(sourceFood) || "g",
        source,
        kcal: food.calorias,
        proteina: food.proteina,
        protein: food.proteina,
        carbs: food.carbohidratos,
        grasas: food.grasas,
        fat: food.grasas,
        categoria: sourceFood.categoria || sourceFood.categoriaZumaFit || sourceFood.Fuente || food.categoria || "",
        imagen: sourceFood.imagen || null,
        imagenUrl: imageUrl,
        maxGramos: food.maxGramos,
        ...(result.optimizacionTracking ? {
          minGramos: food.minGramos,
          stepGramos: food.stepGramos,
          quantityConstraintSources: food.quantityConstraintSources || null,
          maxExplicit: food.maxExplicit === true,
        } : {}),
        fixedQuantity: source === "fixed",
        quantityPending: false,
      };
    });

    const variantRequested = result.variante?.requested === true;
    const variantApplied = result.variante?.applied === true;
    return {
      status: result.status === "error"
        ? "error"
        : (variantRequested && !variantApplied) || ["revisar", "sin_solucion"].includes(result.status)
          ? "warning"
          : "ok",
      quality: qualityFromStatus(result.status),
      engineStatus: result.status,
      message: variantRequested
        ? result.variante?.message || messageForResult(result, mode, generationType)
        : messageForResult(result, mode, generationType),
      mode,
      generationType,
      variantRequested,
      variantApplied,
      variant: result.variante || null,
      foods,
      totals: result.totales,
      target: result.objetivo,
      diff: result.diferencia,
      warnings: result.warnings || [],
      errors: result.errors || [],
      optimization: result.optimizacionTracking || null,
      ...(trackingContextAllowed ? {
        trackingQuantityMode: internalTrackingQuantityMode,
      } : {}),
    };
  };

  obtenerMenuDiario = async (objeto, targetComidas) => {
    try {
      const cantidadComidas = objeto.comidas || Math.floor(Math.random() * 3) + 3;
      const comidas = [];

      for (let i = 0; i < cantidadComidas; i++) {
        const comida = menu.generarMenu(targetComidas[i]);
        comidas.push(comida);
      }

      return comidas;
    } catch (error) {
      console.error("Error al obtener el menu diario:", error);
      throw new Error("No se pudo obtener el menu diario");
    }
  };

  obtenerMenuSemanal = async () => {
    try {
      const resultado = menu.generarMenu();
      return resultado;
    } catch (error) {
      console.error("Error al obtener el menu semanal:", error);
      throw new Error("No se pudo obtener el menu semanal");
    }
  };
}

export default ServicioAlimentos;
