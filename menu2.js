// Motor de generacion de cantidades para comidas.
// Trabaja con alimentos por gramo y soporta:
// - Cantidades fijas.
// - Cantidades pendientes.
// - Modo full: ajustar kcal + proteina + carbos + grasas.
// - Modo kcalProteina: ajustar kcal + proteina y dejar carbos/grasas flexibles.
// La salida conserva proteicos/carbohidratos/grasas para compatibilidad.

const EPS = 1e-9;
const TRACKING_CALORIE_EPS = 1e-6;
export const TRACKING_OPTIMIZATION_POLICY = "tracking_remaining_v2";
export const TRACKING_CALORIE_FILL_POLICY = "tracking_calorie_fill_v1";
const TRACKING_EXACT_OPTION_LIMIT = 250000;
const TRACKING_PAIR_REFINEMENT_PASSES = 3;
// Dentro de la tolerancia primaria de 1 kcal, dos propuestas son
// caloricamente equivalentes y recién allí deciden proteína y C/G.
const CALORIE_FILL_EQUIVALENT_KCAL = 1;
const CALORIE_FILL_TARGET_TOLERANCE = 1;
const CALORIE_FILL_EQUIVALENT_PROTEIN_G = 1;
const CALORIE_FILL_PROTEIN_REACHED_TOLERANCE = 0.5;
const CALORIE_FILL_EXACT_SMALL_SEARCH_LIMIT = 100000;
const CALORIE_FILL_MAX_PAIR_ITERATIONS = 20000;
const MAX_FOODS_PER_GROUP = 6;
const MAX_TOTAL_FOODS = 15;

const DEFAULT_OBJECTIVE = {
  calorias: null,
  proteina: 40,
  carbohidratos: 70,
  grasas: 20,
};

const INTERNAL_FOODS = Object.freeze([
  { nombre: "Almendras", proteina: 0.212, carbohidratos: 0.216, grasas: 0.499, calorias: 6.20 },
  { nombre: "Nueces", proteina: 0.152, carbohidratos: 0.137, grasas: 0.652, calorias: 7.02 },
  { nombre: "Aceite de Oliva", proteina: 0, carbohidratos: 0, grasas: 1, calorias: 9 },
  { nombre: "Pechuga de pollo", proteina: 0.31, carbohidratos: 0, grasas: 0.036, calorias: 1.56 },
  { nombre: "Churrasco Magro", proteina: 0.27, carbohidratos: 0, grasas: 0.15, calorias: 2.43 },
  { nombre: "Banana", proteina: 0.013, carbohidratos: 0.228, grasas: 0.003, calorias: 0.99 },
  { nombre: "Manzana", proteina: 0.005, carbohidratos: 0.25, grasas: 0.003, calorias: 1.05 },
  { nombre: "Pan Blanco", proteina: 0.075, carbohidratos: 0.49, grasas: 0.012, calorias: 2.37 },
  { nombre: "Tomate", proteina: 0.009, carbohidratos: 0.039, grasas: 0.002, calorias: 0.21 },
  { nombre: "Palta", proteina: 0.02, carbohidratos: 0.085, grasas: 0.15, calorias: 1.77 },
  { nombre: "Pera", proteina: 0.004, carbohidratos: 0.25, grasas: 0.001, calorias: 1.03 },
  { nombre: "Arroz", proteina: 0.027, carbohidratos: 0.282, grasas: 0.003, calorias: 1.26 },
  { nombre: "Papas", proteina: 0.02, carbohidratos: 0.175, grasas: 0.001, calorias: 0.79 },
  { nombre: "Whey Protein", proteina: 0.8, carbohidratos: 0.04, grasas: 0.06, calorias: 3.90 },
  { nombre: "Jamon Cocido", proteina: 0.18, carbohidratos: 0.01, grasas: 0.05, calorias: 1.21 },
  { nombre: "Higado", proteina: 0.26, carbohidratos: 0.039, grasas: 0.045, calorias: 1.60 },
  { nombre: "Queso Cremoso", proteina: 0.125, carbohidratos: 0.044, grasas: 0.32, calorias: 3.56 },
  { nombre: "Pechuga de Pavo", proteina: 0.29, carbohidratos: 0, grasas: 0.01, calorias: 1.25 },
  { nombre: "Leche Descremada", proteina: 0.034, carbohidratos: 0.05, grasas: 0.001, calorias: 0.35 },
  { nombre: "Leche Entera", proteina: 0.032, carbohidratos: 0.048, grasas: 0.032, calorias: 0.61 },
  { nombre: "Pasas de Uva", proteina: 0.031, carbohidratos: 0.79, grasas: 0.005, calorias: 3.33 },
  { nombre: "Fideos", proteina: 0.12, carbohidratos: 0.72, grasas: 0.015, calorias: 3.50 },
  { nombre: "Sandia", proteina: 0.006, carbohidratos: 0.08, grasas: 0.002, calorias: 0.36 },
  { nombre: "Higo", proteina: 0.008, carbohidratos: 0.19, grasas: 0.003, calorias: 0.82 },
  { nombre: "Dulce de Leche", proteina: 0.05, carbohidratos: 0.55, grasas: 0.08, calorias: 3.12 },
  { nombre: "Galletitas", proteina: 0.07, carbohidratos: 0.65, grasas: 0.2, calorias: 4.68 },
  { nombre: "Mermelada", proteina: 0.004, carbohidratos: 0.6, grasas: 0.001, calorias: 2.43 },
]);

const DEFAULT_SELECTIONS = Object.freeze({
  proteicos: [{ nombre: "Pechuga de pollo" }],
  carbohidratos: [{ nombre: "Arroz" }],
  grasas: [{ nombre: "Aceite de Oliva" }],
});

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

const normalizeName = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

function normalizedMeasurementUnit(raw = {}) {
  const value = typeof raw === "object" && raw !== null
    ? firstValue(raw, ["unit", "unidad", "Unidad", "unidadBase", "measurementUnit"])
    : raw;
  const unit = normalizeName(value).replace(/\.$/, "");
  if (["g", "gr", "grs", "gramo", "gramos"].includes(unit)) return "g";
  if (["ml", "mililitro", "mililitros"].includes(unit)) return "ml";
  return unit;
}

function foodIdentityValues(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  return [
    source.foodId,
    source._id,
    source.id,
    source.alimentoId,
    source.raw?.foodId,
    source.raw?._id,
    source.raw?.id,
    source.raw?.alimentoId,
  ]
    .filter((value) => value !== undefined && value !== null && value !== "")
    .map((value) => String(value));
}

function firstValue(source, keys) {
  for (const key of keys) {
    if (source?.[key] !== undefined && source?.[key] !== null && source?.[key] !== "") {
      return source[key];
    }
  }
  return undefined;
}

function hasObjectiveValue(source, keys) {
  return keys.some((key) => source?.[key] !== undefined && source?.[key] !== null && source?.[key] !== "");
}

function toBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return ["true", "1", "si", "yes"].includes(normalizeName(value));
}

function normalizeFood(raw, fallbackGroup = null) {
  if (!raw) return null;
  const nombre = firstValue(raw, [
    "nombre",
    "name",
    "Alimentos",
    "alimento",
    "Nombre",
    "descripcion",
  ]);
  if (!nombre) return null;

  let calorias = toNumber(firstValue(raw, [
    "calorias",
    "kcal",
    "Calorias",
    "Kcal",
    "calories",
    "kcalPerUnitOrGram",
    "kcalUnidad",
  ]));
  let proteina = toNumber(firstValue(raw, [
    "proteina",
    "proteinas",
    "Proteinas",
    "Proteina",
    "protein",
    "proteinPerUnitOrGram",
    "proteinaUnidad",
  ]));
  let carbohidratos = toNumber(firstValue(raw, [
    "carbohidratos",
    "carbs",
    "Carbohidratos",
    "Hidratos",
    "carbohydrates",
    "carbsPerUnitOrGram",
    "carbohidratosUnidad",
  ]));
  let grasas = toNumber(firstValue(raw, [
    "grasas",
    "grasa",
    "Grasas",
    "fat",
    "fats",
    "fatPerUnitOrGram",
    "grasasUnidad",
  ]));

  // El servicio de cantidades puede declarar explícitamente la base para evitar
  // confundir alimentos por unidad (por ejemplo, un huevo de 78 kcal) con datos
  // expresados por 100 g.
  const macroBasis = normalizeName(raw.macroBasis || raw.macroBase || raw.nutritionBasis);
  const rawUnit = normalizedMeasurementUnit(raw);
  const unitImpliesPerUnit = Boolean(
    rawUnit &&
    !["g", "ml"].includes(rawUnit)
  );
  const explicitlyPerUnit =
    ["perunit", "porunidad", "unit"].includes(macroBasis) || unitImpliesPerUnit;
  const explicitlyPerGram = ["pergram", "porgramo", "gram"].includes(macroBasis);
  const explicitlyPer100 = ["per100", "per100g", "por100", "100g"].includes(macroBasis);
  // Si vienen valores por 100 g, los bajamos a valor por gramo.
  // Si ya vienen por gramo o por unidad, los dejamos como están.
  const looksPer100g = explicitlyPer100 || (
    !explicitlyPerUnit &&
    !explicitlyPerGram &&
    (calorias > 20 || proteina > 5 || carbohidratos > 5 || grasas > 5)
  );
  if (looksPer100g) {
    calorias /= 100;
    proteina /= 100;
    carbohidratos /= 100;
    grasas /= 100;
  }

  if (calorias <= 0) {
    calorias = proteina * 4 + carbohidratos * 4 + grasas * 9;
  }

  const categoria =
    firstValue(raw, ["categoria", "Categoria", "fuente", "Fuente", "tipo", "Tipo"]) ||
    fallbackGroup ||
    inferGroup({ proteina, carbohidratos, grasas });

  return {
    id: raw.foodId || raw._id || raw.id || raw.alimentoId || null,
    nombre: String(nombre).trim(),
    calorias,
    proteina,
    carbohidratos,
    grasas,
    categoria,
    raw,
  };
}

function inferGroup(food) {
  if ((food?.proteina || 0) >= (food?.carbohidratos || 0) && (food?.proteina || 0) >= (food?.grasas || 0)) {
    return "proteicos";
  }
  if ((food?.carbohidratos || 0) >= (food?.proteina || 0) && (food?.carbohidratos || 0) >= (food?.grasas || 0)) {
    return "carbohidratos";
  }
  return "grasas";
}

function buildFoodIndex(extraFoods = []) {
  const index = {
    byId: new Map(),
    byName: new Map(),
  };
  const records = [...INTERNAL_FOODS, ...(Array.isArray(extraFoods) ? extraFoods : [])];
  records.forEach((raw, order) => {
    const food = normalizeFood(raw);
    if (!food) return;
    const entry = {
      food,
      order,
      unit: normalizedMeasurementUnit(raw),
      rank:
        (raw?.activo === true ? 1000 : raw?.activo === false ? -1000 : 0) +
        (foodIdentityValues(raw).length ? 100 : 0) +
        (raw?.macroBasis ? 50 : 0) +
        (normalizedMeasurementUnit(raw) ? 20 : 0),
    };
    for (const id of foodIdentityValues(raw)) {
      const candidates = index.byId.get(id) || [];
      candidates.push(entry);
      index.byId.set(id, candidates);
    }
    const name = normalizeName(food.nombre);
    const candidates = index.byName.get(name) || [];
    candidates.push(entry);
    index.byName.set(name, candidates);
  });
  return index;
}

function preferredIndexedFood(entries = []) {
  const selected = entries.reduce((best, entry) => {
    if (!best) return entry;
    if (entry.rank !== best.rank) return entry.rank > best.rank ? entry : best;
    return entry.order > best.order ? entry : best;
  }, null);
  return selected?.food || null;
}

function getFood(index, item, fallbackGroup) {
  const direct = normalizeFood(item, fallbackGroup);
  if (direct && direct.calorias > 0) return { ...direct, categoria: fallbackGroup || direct.categoria };

  const itemIds = foodIdentityValues(item);
  if (itemIds.length) {
    const exactEntries = itemIds.flatMap((id) => index.byId.get(id) || []);
    const exact = preferredIndexedFood(exactEntries);
    if (exact) return { ...exact, categoria: fallbackGroup || exact.categoria };
    // La identidad recibida no se degrada a un homónimo por nombre.
    return null;
  }

  const name = normalizeName(item?.nombre || item?.name || item?.Alimentos);
  const namedEntries = index.byName.get(name) || [];
  const requestedUnit = normalizedMeasurementUnit(item);
  let compatibleEntries = namedEntries;
  if (requestedUnit) {
    const exactUnitEntries = namedEntries.filter((entry) => entry.unit === requestedUnit);
    const unknownUnitEntries = namedEntries.filter((entry) => !entry.unit);
    compatibleEntries = exactUnitEntries.length ? exactUnitEntries : unknownUnitEntries;
  } else {
    const explicitUnits = new Set(namedEntries.map((entry) => entry.unit).filter(Boolean));
    if (explicitUnits.size > 1) return null;
  }
  const fromIndex = preferredIndexedFood(compatibleEntries);
  if (fromIndex) return { ...fromIndex, categoria: fallbackGroup || fromIndex.categoria };
  return null;
}

function normalizeObjective(input = {}) {
  const source = input || {};
  const hasCompletenessFlag =
    source.macrosCompletos !== undefined ||
    source.macrosComplete !== undefined ||
    source.fullMacros !== undefined;
  const hasProtein = hasObjectiveValue(source, ["proteina", "proteinas", "protein"]);
  const hasCarbs = hasObjectiveValue(source, ["carbohidratos", "carbs", "hidratos", "carbohydrates"]);
  const hasFat = hasObjectiveValue(source, ["grasas", "grasa", "fat", "fats"]);
  const macrosCompletos = hasCompletenessFlag
    ? toBoolean(source.macrosCompletos ?? source.macrosComplete ?? source.fullMacros)
    : hasProtein && hasCarbs && hasFat;
  const proteina = toNumber(source.proteina ?? source.proteinas ?? source.protein, DEFAULT_OBJECTIVE.proteina);
  const carbohidratos = toNumber(
    source.carbohidratos ?? source.carbs ?? source.hidratos ?? source.carbohydrates,
    hasCompletenessFlag && !macrosCompletos && !hasCarbs ? 0 : DEFAULT_OBJECTIVE.carbohidratos
  );
  const grasas = toNumber(
    source.grasas ?? source.grasa ?? source.fat ?? source.fats,
    hasCompletenessFlag && !macrosCompletos && !hasFat ? 0 : DEFAULT_OBJECTIVE.grasas
  );
  let calorias = toNumber(source.calorias ?? source.kcal ?? source.calories, 0);

  const macroCalories = proteina * 4 + carbohidratos * 4 + grasas * 9;
  if (calorias <= 0) calorias = macroCalories;

  return {
    calorias,
    proteina,
    carbohidratos,
    grasas,
    macroCalories,
    macrosCompletos,
    caloriasInconsistentes: macrosCompletos && Math.abs(calorias - macroCalories) > 8,
  };
}

function normalizeMode(mode) {
  const clean = String(mode || "full").toLowerCase();
  if (["kcal", "calorias", "calories", "solo_calorias", "solocalorias"].includes(clean)) {
    return "kcal";
  }
  if (["kcalproteina", "caloriasproteina", "caloriesprotein", "proteinCalories"].map(String).includes(clean)) {
    return "kcalProteina";
  }
  if (["protein", "proteina"].includes(clean)) return "kcalProteina";
  return "full";
}

function normalizeArgs(args) {
  if (args.length === 0) return {};
  if (args.length === 1 && typeof args[0] === "object" && !Array.isArray(args[0])) {
    const opts = { ...args[0] };
    if (
      opts.calorias !== undefined ||
      opts.proteina !== undefined ||
      opts.proteinas !== undefined ||
      opts.carbohidratos !== undefined ||
      opts.grasas !== undefined
    ) {
      opts.objetivo = opts.objetivo || opts;
    }
    return opts;
  }

  const [calorias, proteinas, carbohidratos, grasas, alimentosPasados, alimentosBase] = args;
  return {
    objetivo: {
      calorias,
      proteina: proteinas,
      carbohidratos,
      grasas,
    },
    alimentosSeleccionados: Array.isArray(alimentosPasados) ? alimentosPasados : [],
    alimentosBase: Array.isArray(alimentosBase) ? alimentosBase : [],
  };
}

function limitGroup(items = [], warnings, groupName) {
  const clean = Array.isArray(items) ? items.filter(Boolean) : [];
  if (clean.length > MAX_FOODS_PER_GROUP) {
    warnings.push(`Se recibieron mas de ${MAX_FOODS_PER_GROUP} alimentos en ${groupName}. Se usan los primeros ${MAX_FOODS_PER_GROUP}.`);
  }
  return clean.slice(0, MAX_FOODS_PER_GROUP);
}

function buildSelection(opts, foodIndex, warnings) {
  const allowDefaults = opts.permitirDefaults !== false && opts.allowDefaults !== false;
  const preclassified = classifySelectedFoods(opts.alimentosSeleccionados, foodIndex, warnings, allowDefaults);
  const rawGroups = {
    proteicos: limitGroup(opts.alimentosProteACuadrar?.length ? opts.alimentosProteACuadrar : preclassified.proteicos, warnings, "proteicos"),
    carbohidratos: limitGroup(opts.alimentosChACuadrar?.length ? opts.alimentosChACuadrar : preclassified.carbohidratos, warnings, "carbohidratos"),
    grasas: limitGroup(opts.alimentosGrACuadrar?.length ? opts.alimentosGrACuadrar : preclassified.grasas, warnings, "grasas"),
  };

  const all = [];
  for (const [group, items] of Object.entries(rawGroups)) {
    for (const item of items) {
      if (all.length >= MAX_TOTAL_FOODS) {
        warnings.push(`Se recibieron mas de ${MAX_TOTAL_FOODS} alimentos. Se ignoran los excedentes.`);
        break;
      }

      const food = getFood(foodIndex, item, group);
      if (!food) {
        warnings.push(`No se encontro el alimento "${item?.nombre || item?.name || item?.Alimentos || "sin nombre"}".`);
        continue;
      }

      const cantidad = toNumber(item.cantidad ?? item.quantity ?? item.grams, 0);
      const pending =
        item.quantityPending === true ||
        item.cantidadPendiente === true ||
        item.sinCantidad === true ||
        cantidad <= 0;

      const flexibleWithInitial = cantidad > 0 && (item.modificable === true || item.fixedQuantity === false);
      const fixed = cantidad > 0 && !pending && !flexibleWithInitial;
      const addedCandidate =
        item.addedCandidateFood === true ||
        item.optionalCandidate === true ||
        item.sourceKind === "addedCandidate";
      const selectedPending =
        !fixed &&
        !addedCandidate &&
        item.selectedPendingFood !== false;

      all.push({
        group,
        food,
        nombre: food.nombre,
        cantidadInicial: cantidad > 0 ? cantidad : 0,
        cantidad: fixed ? cantidad : 0,
        fixed,
        pending: !fixed,
        selectedPending,
        addedCandidate,
        preferUse: selectedPending,
        minGramos: toNumber(item.minGramos ?? item.min ?? item.minQuantity, 0),
        maxGramos: toNumber(item.maxGramos ?? item.max ?? item.maxQuantity, 0),
        stepGramos: toNumber(item.stepGramos ?? item.step ?? item.stepQuantity, 0),
        minSource: item.minSource || item.quantityConstraintSources?.min || "",
        maxSource: item.maxSource || item.quantityConstraintSources?.max || "",
        stepSource: item.stepSource || item.quantityConstraintSources?.step || "",
        maxExplicit: item.maxExplicit === true,
      });
    }
  }

  return all;
}

function quantityStepFor(item) {
  return item.stepGramos > 0 ? item.stepGramos : 1;
}

function snapshotQuantities(selection = []) {
  return selection.map((item) => toNumber(item.cantidad, 0));
}

function applyQuantities(selection = [], quantities = []) {
  for (let index = 0; index < selection.length; index++) {
    selection[index].cantidad = Math.max(0, toNumber(quantities[index], 0));
  }
}

function variantReferenceQuantities(selection = [], fallback = []) {
  const hasInitial = selection.some((item) => !item.fixed && toNumber(item.cantidadInicial, 0) > 0);
  return selection.map((item, index) =>
    hasInitial && !item.fixed && toNumber(item.cantidadInicial, 0) > 0
      ? toNumber(item.cantidadInicial, 0)
      : toNumber(fallback[index], 0)
  );
}

function variantDistance(selection = [], quantities = [], reference = []) {
  let total = 0;
  let max = 0;
  let changed = 0;

  for (let index = 0; index < selection.length; index++) {
    if (selection[index].fixed || selection[index].addedCandidate) continue;
    const difference = Math.abs(toNumber(quantities[index], 0) - toNumber(reference[index], 0));
    total += difference;
    max = Math.max(max, difference);
    if (difference >= Math.max(3, quantityStepFor(selection[index]) * 2)) changed++;
  }

  return { total, max, changed };
}

function isAcceptableVariant(selection, objective, mode) {
  const diff = diffTotals(calculateTotals(selection), objective);
  if (Math.abs(diff.calorias) > 10) return false;
  if (mode === "kcalProteina") return diff.proteina >= -3;
  if (mode === "full") {
    return (
      diff.proteina >= -3 &&
      Math.abs(diff.proteina) <= 5 &&
      Math.abs(diff.carbohidratos) <= 8 &&
      Math.abs(diff.grasas) <= 5
    );
  }
  return true;
}

function generateQuantityVariant(selection, objective, mode, opts = {}) {
  const requested =
    toBoolean(opts.generarVariante ?? opts.generateVariant ?? opts.variant, false);
  if (!requested) return { requested: false, applied: false };

  const solvedBaseline = snapshotQuantities(selection);
  const reference = variantReferenceQuantities(selection, solvedBaseline);
  applyQuantities(selection, reference);
  const baseline = snapshotQuantities(selection);
  const baselineScore = scoreSelection(selection, objective, mode);
  const flexibleGroups = new Map();

  selection.forEach((item, index) => {
    if (item.fixed || item.addedCandidate || toNumber(item.cantidadInicial, 0) <= 0) return;
    if (!flexibleGroups.has(item.group)) flexibleGroups.set(item.group, []);
    flexibleGroups.get(item.group).push(index);
  });

  const groupsWithAlternatives = [...flexibleGroups.values()].filter((indexes) => indexes.length >= 2);
  if (!groupsWithAlternatives.length) {
    return {
      requested: true,
      applied: false,
      reason: "no_shared_macro_role",
      message: "No hay dos alimentos automaticos de una misma fuente de macronutriente para generar una variante.",
    };
  }

  const variants = [];
  const pairSets = groupsWithAlternatives.map((indexes) => ({ indexes, sameMacroRole: true }));
  const fractions = [0.2, 0.35, 0.5, 0.65];
  const maxScoreIncrease = mode === "full" ? 0.3 : 0.24;

  for (const { indexes, sameMacroRole } of pairSets) {
    for (const sourceIndex of indexes) {
      for (const targetIndex of indexes) {
        if (sourceIndex === targetIndex) continue;

        const source = selection[sourceIndex];
        const target = selection[targetIndex];
        const sourceKcal = Math.max(toNumber(source.food?.calorias, 0), EPS);
        const targetKcal = Math.max(toNumber(target.food?.calorias, 0), EPS);
        const sourceMinimum = minimumAllowedQuantity(source);
        const sourceReducible = Math.max(0, baseline[sourceIndex] - sourceMinimum);
        const targetCapacity = Math.max(0, maxQuantityFor(target) - baseline[targetIndex]);
        if (sourceReducible < quantityStepFor(source) || targetCapacity < quantityStepFor(target)) continue;

        for (const fraction of fractions) {
          let sourceReduction = Math.max(quantityStepFor(source), sourceReducible * fraction);
          let targetIncrease = (sourceReduction * sourceKcal) / targetKcal;

          if (targetIncrease > targetCapacity) {
            targetIncrease = targetCapacity;
            sourceReduction = (targetIncrease * targetKcal) / sourceKcal;
          }

          const sourceStep = quantityStepFor(source);
          const targetStep = quantityStepFor(target);
          const next = [...baseline];
          next[sourceIndex] = Math.max(
            sourceMinimum,
            Math.round((baseline[sourceIndex] - sourceReduction) / sourceStep) * sourceStep
          );
          next[targetIndex] = Math.min(
            maxQuantityFor(target),
            Math.round((baseline[targetIndex] + targetIncrease) / targetStep) * targetStep
          );

          applyQuantities(selection, next);
          const distance = variantDistance(selection, next, reference);
          const score = scoreSelection(selection, objective, mode);
          const meaningfulDifference = distance.max >= 5 && distance.total >= 10 && distance.changed >= 2;

          if (
            meaningfulDifference &&
            isAcceptableVariant(selection, objective, mode) &&
            score <= baselineScore + maxScoreIncrease
          ) {
            variants.push({
              quantities: next,
              score,
              distance,
              group: source.group,
              sameMacroRole,
            });
          }
        }
      }
    }
  }

  applyQuantities(selection, baseline);
  if (!variants.length) {
    return {
      requested: true,
      applied: false,
      reason: "no_acceptable_variant",
      message: "No se encontro una variante suficientemente distinta que mantenga el objetivo dentro de tolerancia.",
    };
  }

  variants.sort((a, b) =>
    Number(b.sameMacroRole) - Number(a.sameMacroRole) ||
    b.distance.total - a.distance.total ||
    a.score - b.score
  );
  const seed = Math.max(1, Math.floor(toNumber(opts.variantSeed ?? opts.semillaVariante, 1)));
  const poolSize = Math.min(variants.length, 12);
  const chosen = variants[(seed - 1) % poolSize];
  applyQuantities(selection, chosen.quantities);

  return {
    requested: true,
    applied: true,
    seed,
    group: chosen.group,
    changedFoods: chosen.distance.changed,
    message: "Variante generada redistribuyendo alimentos automaticos del mismo grupo sin modificar las fuentes unicas.",
  };
}

function classifySelectedFoods(items, foodIndex, warnings, allowDefaults = true) {
  const groups = {
    proteicos: [],
    carbohidratos: [],
    grasas: [],
  };

  if (!Array.isArray(items) || !items.length) {
    return {
      proteicos: allowDefaults ? [...DEFAULT_SELECTIONS.proteicos] : [],
      carbohidratos: allowDefaults ? [...DEFAULT_SELECTIONS.carbohidratos] : [],
      grasas: allowDefaults ? [...DEFAULT_SELECTIONS.grasas] : [],
    };
  }

  for (const raw of items) {
    const item = typeof raw === "string" ? { nombre: raw } : raw;
    const food = getFood(foodIndex, item);
    if (!food) {
      warnings.push(`No se pudo clasificar el alimento "${item?.nombre || item?.name || raw}".`);
      continue;
    }
    const group = inferGroup(food);
    groups[group].push(item);
  }

  return {
    proteicos: groups.proteicos.length ? groups.proteicos : allowDefaults ? [...DEFAULT_SELECTIONS.proteicos] : [],
    carbohidratos: groups.carbohidratos.length ? groups.carbohidratos : allowDefaults ? [...DEFAULT_SELECTIONS.carbohidratos] : [],
    grasas: groups.grasas.length ? groups.grasas : allowDefaults ? [...DEFAULT_SELECTIONS.grasas] : [],
  };
}

function foodVector(food) {
  return {
    calorias: food.calorias,
    proteina: food.proteina,
    carbohidratos: food.carbohidratos,
    grasas: food.grasas,
  };
}

function addTotals(total, vector, quantity) {
  total.calorias += vector.calorias * quantity;
  total.proteina += vector.proteina * quantity;
  total.carbohidratos += vector.carbohidratos * quantity;
  total.grasas += vector.grasas * quantity;
}

function calculateTotals(selection) {
  const total = { calorias: 0, proteina: 0, carbohidratos: 0, grasas: 0 };
  for (const item of selection) {
    addTotals(total, foodVector(item.food), item.cantidad);
  }
  return total;
}

function diffTotals(totals, objective) {
  return {
    calorias: round(totals.calorias - objective.calorias, 2),
    proteina: round(totals.proteina - objective.proteina, 2),
    carbohidratos: round(totals.carbohidratos - objective.carbohidratos, 2),
    grasas: round(totals.grasas - objective.grasas, 2),
  };
}

function validateFixedExcess(fixedTotals, objective, mode) {
  const required = mode === "kcal"
    ? ["calorias"]
    : mode === "kcalProteina"
    ? ["calorias"]
    : ["calorias", "proteina", "carbohidratos", "grasas"];

  const errors = [];
  for (const key of required) {
    const tolerance = key === "calorias" ? 10 : 3;
    if (fixedTotals[key] - objective[key] > tolerance) {
      errors.push(`Las cantidades fijas superan la meta de ${key}: ${round(fixedTotals[key])} > ${round(objective[key])}.`);
    }
  }
  return errors;
}

function dimensionsForMode(mode) {
  if (mode === "kcal") {
    return [
      { key: "calorias", weight: 10 },
      { key: "proteina", weight: 0.08 },
      { key: "carbohidratos", weight: 0.025 },
      { key: "grasas", weight: 0.025 },
    ];
  }
  if (mode === "kcalProteina") {
    return [
      { key: "calorias", weight: 8 },
      { key: "proteina", weight: 1.1 },
      { key: "carbohidratos", weight: 0.04 },
      { key: "grasas", weight: 0.04 },
    ];
  }
  return [
    { key: "calorias", weight: 8 },
    { key: "proteina", weight: 2 },
    { key: "carbohidratos", weight: 1.5 },
    { key: "grasas", weight: 0.7 },
  ];
}

function maxQuantityFor(item) {
  if (Number.isFinite(item.maxQuantityOverride)) return Math.max(0, item.maxQuantityOverride);
  if (item.maxGramos > 0) return item.maxGramos;
  const name = normalizeName(item.nombre || item.food?.nombre);
  const category = normalizeName(item.food?.categoria);

  if (/aceite|oil/.test(name)) return 25;
  if (/whey|proteina en polvo|protein powder/.test(name)) return 60;
  if (/almendra|nuez|mani|man[ií]|fruto seco|frutos secos/.test(name) || category.includes("grasa")) return 40;
  if (/palta|avocado/.test(name)) return 250;
  if (/banana|manzana|pera|fruta|higo|sandia/.test(name) || category.includes("fruta")) return 250;
  if (/arroz|fideo|pasta|papa|batata|pan|avena|cereal/.test(name) || category.includes("carbo")) return 300;
  if (category.includes("prote")) return 400;
  if (/bife|chorizo|pollo|pavo|carne|churrasco|atun|pescado|higado|jamon|huevo/.test(name)) return 400;
  if (/pollo|pavo|carne|churrasco|atun|atún|pescado|higado|jamon|jamón|huevo/.test(name) || category.includes("prote")) return 250;
  if (/verdura|tomate|lechuga|brocoli|brócoli|zanahoria|zapallo/.test(name)) return 300;

  const group = item.group;
  if (group === "grasas") return 60;
  if (group === "proteicos") return 400;
  if (group === "carbohidratos") return 300;
  return 300;
}

function solveQuantities(selection, objective, mode, opts = {}) {
  const fixed = selection.filter((item) => item.fixed);
  const pending = selection.filter((item) => !item.fixed);
  const fixedTotals = calculateTotals(fixed);
  const trackingPriority = trackingPriorityRequested(opts);
  const calorieFill = trackingCalorieFillRequested(opts);
  const errors = trackingPriority || calorieFill
    ? []
    : validateFixedExcess(fixedTotals, objective, mode);

  if ((trackingPriority || calorieFill) && fixedTotals.calorias > objective.calorias + TRACKING_CALORIE_EPS) {
    errors.push(
      `Las cantidades fijas superan el techo calorico: ${round(fixedTotals.calorias)} > ${round(objective.calorias)}.`
    );
  }

  if (errors.length) {
    return {
      ok: false,
      reason: "fixed_exceeds_target",
      errors,
      fixedTotals,
    };
  }

  if (!pending.length) {
    return {
      ok: true,
      fixedTotals,
      iterations: 0,
      score: 0,
    };
  }

  if (calorieFill) {
    const trackingOptimization = optimizeTrackingCalorieFillQuantities(
      selection,
      pending,
      objective,
      fixedTotals
    );
    if (trackingOptimization.error) {
      return {
        ok: false,
        reason: trackingOptimization.error.code,
        errors: [trackingOptimization.error.message],
        fixedTotals,
        trackingOptimization,
      };
    }
    return {
      ok: true,
      fixedTotals,
      totals: calculateTotals(selection),
      trackingOptimization,
      minimumsWarning: "",
      iterations: trackingOptimization.iterations || 0,
      score: scoreSelection(selection, objective, mode),
    };
  }

  if (trackingPriority) {
    const invalidGridItem = pending.find((item) =>
      maximumTrackingQuantity(item) + EPS < minimumTrackingQuantity(item)
    );
    if (invalidGridItem) {
      return {
        ok: false,
        reason: "invalid_tracking_quantity_grid",
        errors: [
          `No hay una cantidad valida para ${invalidGridItem.nombre || invalidGridItem.food?.nombre || "el alimento"} dentro de sus minimos, maximos y multiplos.`,
        ],
        fixedTotals,
      };
    }
  }

  const lowerBounds = pending.map((item) =>
    trackingPriority ? minimumTrackingQuantity(item) : minimumAllowedQuantity(item)
  );
  const upperBounds = pending.map((item) =>
    trackingPriority ? maximumTrackingQuantity(item) : maxQuantityFor(item)
  );
  const baselineTotals = { ...fixedTotals };
  for (let i = 0; i < pending.length; i++) {
    addTotals(baselineTotals, foodVector(pending[i].food), lowerBounds[i]);
  }
  if (trackingPriority && baselineTotals.calorias > objective.calorias + TRACKING_CALORIE_EPS) {
    return {
      ok: false,
      reason: "minimums_exceed_calorie_ceiling",
      errors: [
        `Las cantidades minimas de los alimentos seleccionados superan el techo calorico: ${round(baselineTotals.calorias)} > ${round(objective.calorias)}.`,
      ],
      fixedTotals,
    };
  }

  const residualItems = pending.map((item, index) => ({
    ...item,
    minGramos: 0,
    maxQuantityOverride: Math.max(0, upperBounds[index] - lowerBounds[index]),
    preferUse: false,
  }));
  const residualQuantities = solveNonNegativeLeastSquares(residualItems, objective, baselineTotals, mode, opts);

  for (let i = 0; i < pending.length; i++) {
    pending[i].cantidad = round(
      Math.min(lowerBounds[i] + Math.max(residualQuantities[i] || 0, 0), upperBounds[i]),
      2
    );
  }

  if (opts.redondear !== false && opts.roundQuantities !== false) {
    roundAndPolishQuantities(selection, pending, objective, mode);
  }

  const trackingOptimization = trackingPriority
    ? optimizeTrackingQuantities(selection, pending, objective)
    : null;
  const totals = calculateTotals(selection);
  const minimumKcalExcess = baselineTotals.calorias - objective.calorias;
  return {
    ok: true,
    fixedTotals,
    totals,
    trackingOptimization,
    minimumsWarning: minimumKcalExcess > 10
      ? `No se puede respetar el margen de 10 kcal usando todos los alimentos elegidos: sus cantidades minimas superan el objetivo por ${round(minimumKcalExcess, 1)} kcal.`
      : "",
    iterations: 0,
    score: scoreSelection(selection, objective, mode),
  };
}

function buildScaledSystem(items, objective, fixedTotals, mode, activeIndexes = null, opts = {}) {
  const dims = dimensionsForMode(mode);
  const active = activeIndexes || items.map((_, index) => index);
  const rows = [];
  const b = [];

  for (const dim of dims) {
    const scale = scoreScaleFor(dim.key, objective, mode);
    const weight = Math.sqrt(dim.weight);
    const target = Math.max(0, objective[dim.key] - fixedTotals[dim.key]);
    rows.push(active.map((index) => (foodVector(items[index].food)[dim.key] / scale) * weight));
    b.push((target / scale) * weight);
  }

  const quantityPenalty = toNumber(opts.quantityPenalty, 0.00002);
  if (quantityPenalty > 0) {
    for (let i = 0; i < active.length; i++) {
      const row = new Array(active.length).fill(0);
      row[i] = quantityPenalty;
      rows.push(row);
      b.push(0);
    }
  }

  return { rows, b, active };
}

function solveNonNegativeLeastSquares(items, objective, fixedTotals, mode, opts = {}) {
  if (!items.length) return [];
  let removed = new Set();
  let current = solveActiveSetNNLS(items, objective, fixedTotals, mode, opts, removed);
  let currentScore = scorePendingQuantities(items, current, fixedTotals, objective, mode);

  for (let guard = 0; guard < items.length; guard++) {
    const tinyCandidates = current
      .map((quantity, index) => ({ quantity, index }))
      .filter(({ quantity, index }) =>
        quantity > EPS &&
        quantity < minPracticalQuantity(items[index]) &&
        !items[index].preferUse &&
        !removed.has(index)
      )
      .sort((a, b) => a.quantity - b.quantity);

    if (!tinyCandidates.length) break;

    let accepted = false;
    for (const candidate of tinyCandidates) {
      const nextRemoved = new Set([...removed, candidate.index]);
      const next = solveActiveSetNNLS(items, objective, fixedTotals, mode, opts, nextRemoved);
      const nextScore = scorePendingQuantities(items, next, fixedTotals, objective, mode);

      if (nextScore <= currentScore + 0.012) {
        removed = nextRemoved;
        current = next;
        currentScore = nextScore;
        accepted = true;
        break;
      }
    }

    if (!accepted) break;
  }

  return current;
}

function solveActiveSetNNLS(items, objective, fixedTotals, mode, opts = {}, removed = new Set()) {
  let active = items.map((_, index) => index);
  active = active.filter((index) => !removed.has(index));
  const quantities = new Array(items.length).fill(0);

  for (let guard = 0; guard < items.length + 2 && active.length; guard++) {
    const { rows, b } = buildScaledSystem(items, objective, fixedTotals, mode, active, opts);
    const solution = solveLeastSquares(rows, b, toNumber(opts.regularizacion, 1e-8));

    let mostNegative = -1;
    let mostNegativeValue = 0;
    for (let i = 0; i < solution.length; i++) {
      if (solution[i] < mostNegativeValue) {
        mostNegativeValue = solution[i];
        mostNegative = i;
      }
    }

    if (mostNegative === -1) {
      for (let i = 0; i < active.length; i++) {
        quantities[active[i]] = Math.min(solution[i], maxQuantityFor(items[active[i]]));
      }
      return quantities.map((q) => Math.max(0, q));
    }

    active.splice(mostNegative, 1);
  }

  return quantities;
}

function scorePendingQuantities(items, quantities, fixedTotals, objective, mode) {
  const totals = { ...fixedTotals };
  for (let i = 0; i < items.length; i++) {
    addTotals(totals, foodVector(items[i].food), quantities[i] || 0);
  }
  return scoreResult(totals, objective, mode) + selectedPendingUsagePenalty(items, quantities, mode);
}

function minPracticalQuantity(item) {
  if (item.minGramos > 0) return item.minGramos;
  if (item.group === "grasas") {
    if (item.food.grasas > 0.75) return 2;
    return 20;
  }
  if (item.group === "proteicos") {
    if (item.food.proteina > 0.55) return 5;
    return 25;
  }
  if (item.group === "carbohidratos") return 20;
  return 10;
}

function minimumAllowedQuantity(item) {
  if (!item?.preferUse) return 0;
  return Math.min(minPracticalQuantity(item), maxQuantityFor(item));
}

function minimumTrackingQuantity(item) {
  const minimum = minimumAllowedQuantity(item);
  const step = quantityStepFor(item);
  return Math.max(0, Math.ceil((minimum - EPS) / step) * step);
}

function maximumTrackingQuantity(item) {
  const maximum = maxQuantityFor(item);
  const step = quantityStepFor(item);
  return Math.max(0, Math.floor((maximum + EPS) / step) * step);
}

function solveLeastSquares(rows, b, ridge = 1e-8) {
  const cols = rows[0]?.length || 0;
  if (!cols) return [];

  const normal = Array.from({ length: cols }, () => new Array(cols).fill(0));
  const rhs = new Array(cols).fill(0);

  for (let r = 0; r < rows.length; r++) {
    for (let i = 0; i < cols; i++) {
      rhs[i] += rows[r][i] * b[r];
      for (let j = 0; j < cols; j++) {
        normal[i][j] += rows[r][i] * rows[r][j];
      }
    }
  }

  for (let i = 0; i < cols; i++) normal[i][i] += ridge;
  return solveLinearSystem(normal, rhs);
}

function solveLinearSystem(matrix, vector) {
  const n = vector.length;
  const a = matrix.map((row, i) => [...row, vector[i]]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    }

    if (Math.abs(a[pivot][col]) < EPS) continue;
    if (pivot !== col) [a[pivot], a[col]] = [a[col], a[pivot]];

    const div = a[col][col];
    for (let j = col; j <= n; j++) a[col][j] /= div;

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = a[row][col];
      for (let j = col; j <= n; j++) a[row][j] -= factor * a[col][j];
    }
  }

  return a.map((row) => (Number.isFinite(row[n]) ? row[n] : 0));
}

function roundAndPolishQuantities(selection, pending, objective, mode) {
  for (const item of pending) {
    const step = item.stepGramos > 0 ? item.stepGramos : 1;
    const minimum = minimumAllowedQuantity(item);
    item.cantidad = Math.max(minimum, Math.round(item.cantidad / step) * step);
    if (!item.preferUse && item.cantidad > EPS && item.cantidad < minPracticalQuantity(item)) {
      item.cantidad = 0;
    }
  }

  // Ajuste final de 1 gramo para mejorar el score despues del redondeo.
  let currentScore = scoreSelection(selection, objective, mode);
  for (let guard = 0; guard < 600; guard++) {
    let best = null;

    for (const item of pending) {
      const step = item.stepGramos > 0 ? item.stepGramos : 1;
      for (const delta of [-step, step]) {
        const currentQuantity = item.cantidad;
        const minQuantity = minPracticalQuantity(item);
        const minimumAllowed = minimumAllowedQuantity(item);
        let nextQuantity = currentQuantity + delta;
        if (delta > 0 && currentQuantity <= EPS && nextQuantity > EPS && nextQuantity < minQuantity) {
          nextQuantity = minQuantity;
        }
        if (!item.preferUse && delta < 0 && nextQuantity > EPS && nextQuantity < minQuantity) {
          nextQuantity = 0;
        }
        if (nextQuantity < minimumAllowed || nextQuantity > maxQuantityFor(item)) continue;
        if (!item.preferUse && nextQuantity > EPS && nextQuantity < minQuantity) continue;
        item.cantidad = nextQuantity;
        const nextScore = scoreSelection(selection, objective, mode);
        item.cantidad = currentQuantity;

        if (nextScore + 1e-9 < currentScore && (!best || nextScore < best.score)) {
          best = { item, nextQuantity, score: nextScore };
        }
      }
    }

    if (!best) break;
    best.item.cantidad = best.nextQuantity;
    currentScore = best.score;
  }
}

function trackingPriorityRequested(opts = {}) {
  const requestedPolicy = normalizeName(
    opts.trackingOptimizationPolicy ??
    opts.optimizationPolicy ??
    opts.policy
  );
  if (requestedPolicy) {
    return requestedPolicy === normalizeName(TRACKING_OPTIMIZATION_POLICY);
  }
  return toBoolean(
    opts.trackingPriority ??
    opts.prioridadTracking ??
    opts.strictTrackingPriority,
    false
  );
}

function trackingCalorieFillRequested(opts = {}) {
  return String(
    opts.trackingOptimizationPolicy ??
    opts.optimizationPolicy ??
    ""
  ) === TRACKING_CALORIE_FILL_POLICY;
}

function totalsForPendingQuantities(selection, pending, quantities) {
  const previous = pending.map((item) => item.cantidad);
  for (let index = 0; index < pending.length; index++) {
    pending[index].cantidad = quantities[index];
  }
  const totals = calculateTotals(selection);
  for (let index = 0; index < pending.length; index++) {
    pending[index].cantidad = previous[index];
  }
  return totals;
}

function calorieFillDescriptor(item, index, calorieBudget) {
  const raw = item?.food?.raw || {};
  const unit = normalizedMeasurementUnit(raw) || normalizedMeasurementUnit(item) || "g";
  const continuous = unit === "g" || unit === "ml";
  const recommendedStep = Math.max(0, toNumber(item?.stepGramos, 0));
  const fractionsExplicitlyAllowed = toBoolean(
    firstValue(raw, [
      "allowFractionalQuantity",
      "fractionalQuantityAllowed",
      "fractionalUnitsAllowed",
      "allowsFractions",
    ]),
    false
  ) || (recommendedStep > 0 && recommendedStep < 1);
  const step = continuous
    ? (fractionsExplicitlyAllowed && recommendedStep > 0 && recommendedStep < 1
      ? recommendedStep
      : 1)
    : (fractionsExplicitlyAllowed
      ? (recommendedStep > 0 ? recommendedStep : 0.1)
      : 1);
  const kcalPerQuantity = Number(item?.food?.calorias);
  const proteinPerQuantity = Number(item?.food?.proteina);
  const carbsPerQuantity = Number(item?.food?.carbohidratos);
  const fatPerQuantity = Number(item?.food?.grasas);
  const finiteMacros = [
    proteinPerQuantity,
    carbsPerQuantity,
    fatPerQuantity,
  ].every(Number.isFinite);
  const valid = Number.isFinite(kcalPerQuantity) && kcalPerQuantity > EPS && finiteMacros;
  const caloriesPerStep = valid ? kcalPerQuantity * step : 0;
  const technicalMaxSteps = valid
    ? Math.max(1, Math.ceil(Math.max(0, calorieBudget) / caloriesPerStep) + 2)
    : 0;

  return {
    index,
    item,
    foodId: item?.food?.id || raw.foodId || raw.alimentoId || raw.id || raw._id || null,
    name: item?.nombre || item?.food?.nombre || "Alimento",
    unit,
    kind: continuous ? "continuous" : "discrete",
    continuous,
    fractionsExplicitlyAllowed,
    step,
    valid,
    kcalPerQuantity,
    proteinPerQuantity,
    carbsPerQuantity,
    fatPerQuantity,
    caloriesPerStep,
    proteinPerStep: valid ? proteinPerQuantity * step : 0,
    carbsPerStep: valid ? carbsPerQuantity * step : 0,
    fatPerStep: valid ? fatPerQuantity * step : 0,
    technicalMaxSteps,
    recommendedMin: Math.max(0, toNumber(item?.minGramos, 0)),
    recommendedMax: Math.max(0, toNumber(item?.maxGramos, 0)),
    recommendedStep,
  };
}

function calorieFillTotals(fixedTotals, descriptors, steps) {
  const totals = { ...fixedTotals };
  for (const descriptor of descriptors) {
    if (!descriptor.valid) continue;
    const count = Math.max(0, Math.floor(toNumber(steps[descriptor.index], 0) + EPS));
    const quantity = count * descriptor.step;
    totals.calorias += descriptor.kcalPerQuantity * quantity;
    totals.proteina += descriptor.proteinPerQuantity * quantity;
    totals.carbohidratos += descriptor.carbsPerQuantity * quantity;
    totals.grasas += descriptor.fatPerQuantity * quantity;
  }
  return totals;
}

function calorieFillConcentrationScore(descriptors, steps, totals, fixedTotals) {
  const automaticCalories = Math.max(EPS, totals.calorias - fixedTotals.calorias);
  return descriptors.reduce((score, descriptor) => {
    if (!descriptor.valid) return score;
    const quantity = Math.max(0, toNumber(steps[descriptor.index], 0)) * descriptor.step;
    const share = descriptor.kcalPerQuantity * quantity / automaticCalories;
    return score + share ** 2;
  }, 0);
}

function calorieFillCandidate(steps, descriptors, fixedTotals, objective) {
  const normalizedSteps = new Array(descriptors.length).fill(0);
  for (const descriptor of descriptors) {
    normalizedSteps[descriptor.index] = Math.min(
      descriptor.technicalMaxSteps,
      Math.max(0, Math.floor(toNumber(steps[descriptor.index], 0) + EPS))
    );
  }
  const totals = calorieFillTotals(fixedTotals, descriptors, normalizedSteps);
  if (totals.calorias > objective.calorias + TRACKING_CALORIE_EPS) return null;
  const calorieDeficit = Math.max(0, objective.calorias - totals.calorias);
  const proteinDeficit = objective.proteina > 0
    ? Math.max(0, objective.proteina - totals.proteina)
    : 0;
  const proteinDistance = objective.proteina > 0
    ? Math.abs(objective.proteina - totals.proteina)
    : 0;
  return {
    steps: normalizedSteps,
    totals,
    calorieDeficit,
    proteinDeficit,
    proteinDistance,
    proteinReached:
      objective.proteina <= 0 ||
      proteinDeficit <= CALORIE_FILL_PROTEIN_REACHED_TOLERANCE + EPS,
    secondaryError: trackingSecondaryMacroError(totals, objective),
    concentrationScore: calorieFillConcentrationScore(
      descriptors,
      normalizedSteps,
      totals,
      fixedTotals
    ),
  };
}

function compareCalorieFillCandidates(left, right, objective) {
  if (!left) return 1;
  if (!right) return -1;
  const leftCompletesCalories = left.calorieDeficit <= CALORIE_FILL_TARGET_TOLERANCE + EPS;
  const rightCompletesCalories = right.calorieDeficit <= CALORIE_FILL_TARGET_TOLERANCE + EPS;
  if (leftCompletesCalories !== rightCompletesCalories) {
    return leftCompletesCalories ? -1 : 1;
  }
  const calorieDifference = left.calorieDeficit - right.calorieDeficit;
  // Fuera de la zona de 1 kcal, cada mejora calórica gana antes de mirar
  // macros. Dentro de la zona, todos completan el objetivo y recién allí
  // se prioriza proteína. Esta comparación lexicográfica es transitiva y no
  // depende del orden en el que aparezcan los candidatos.
  if (!leftCompletesCalories && Math.abs(calorieDifference) > EPS) {
    return calorieDifference;
  }

  if (objective.proteina > 0) {
    if (left.proteinReached !== right.proteinReached) {
      return left.proteinReached ? -1 : 1;
    }
    const leftProteinPriority = left.proteinReached
      ? Math.max(0, left.proteinDistance - CALORIE_FILL_EQUIVALENT_PROTEIN_G)
      : left.proteinDeficit;
    const rightProteinPriority = right.proteinReached
      ? Math.max(0, right.proteinDistance - CALORIE_FILL_EQUIVALENT_PROTEIN_G)
      : right.proteinDeficit;
    const proteinPriorityDifference = leftProteinPriority - rightProteinPriority;
    // Una vez alcanzada P, todas las diferencias dentro de 1 g son realmente
    // equivalentes y C/G pueden decidir. Por fuera de esa tolerancia, proteína
    // mantiene la segunda prioridad solicitada por producto.
    if (Math.abs(proteinPriorityDifference) > EPS) return proteinPriorityDifference;
  }

  const secondaryDifference = left.secondaryError - right.secondaryError;
  if (Math.abs(secondaryDifference) > 1e-8) return secondaryDifference;
  if (objective.proteina > 0 && left.proteinReached && right.proteinReached) {
    const proteinDifference = left.proteinDistance - right.proteinDistance;
    if (Math.abs(proteinDifference) > 1e-8) return proteinDifference;
  }
  if (Math.abs(calorieDifference) > 1e-8) return calorieDifference;
  const concentrationDifference = left.concentrationScore - right.concentrationScore;
  if (Math.abs(concentrationDifference) > 1e-8) return concentrationDifference;

  for (let index = 0; index < Math.max(left.steps.length, right.steps.length); index++) {
    const difference = (left.steps[index] || 0) - (right.steps[index] || 0);
    if (difference) return difference;
  }
  return 0;
}

function exactSmallCalorieFillSearch({
  descriptors,
  baseSteps,
  calorieBudget,
  consider,
}) {
  if (!descriptors.length || descriptors.length > 3) {
    return { executed: false, evaluated: 0, estimated: 0 };
  }

  const alternatives = descriptors.map((filler) => {
    const outer = descriptors.filter((descriptor) => descriptor.index !== filler.index);
    let outerOptions = 1;
    for (const descriptor of outer) {
      outerOptions *= Math.max(
        1,
        descriptor.technicalMaxSteps - (baseSteps[descriptor.index] || 0) + 1
      );
      if (outerOptions > CALORIE_FILL_EXACT_SMALL_SEARCH_LIMIT) break;
    }
    const fillerOptions = Math.max(
      1,
      filler.technicalMaxSteps - (baseSteps[filler.index] || 0) + 1
    );
    const calorieZoneOptions = Math.min(
      fillerOptions,
      Math.ceil(CALORIE_FILL_TARGET_TOLERANCE / filler.caloriesPerStep) + 2
    );
    return {
      filler,
      outer,
      estimated: outerOptions * calorieZoneOptions,
    };
  }).sort((left, right) =>
    left.estimated - right.estimated ||
    right.filler.caloriesPerStep - left.filler.caloriesPerStep ||
    left.filler.index - right.filler.index
  );

  const selected = alternatives[0];
  if (!selected || selected.estimated > CALORIE_FILL_EXACT_SMALL_SEARCH_LIMIT) {
    return {
      executed: false,
      evaluated: 0,
      estimated: selected?.estimated || 0,
    };
  }

  const steps = [...baseSteps];
  let evaluated = 0;
  const evaluate = () => {
    consider(steps);
    evaluated++;
  };

  function enumerateOuter(position, usedCalories) {
    if (position >= selected.outer.length) {
      const filler = selected.filler;
      const fillerMinimum = baseSteps[filler.index] || 0;
      const maximumFiller = Math.min(
        filler.technicalMaxSteps,
        Math.floor(
          (calorieBudget - usedCalories + TRACKING_CALORIE_EPS) /
          filler.caloriesPerStep
        )
      );
      if (maximumFiller < fillerMinimum) return;

      // El máximo asequible es siempre el mejor candidato cuando esta rama no
      // llega a la zona calórica. Si entra en la zona, también se recorren las
      // pocas cantidades vecinas que siguen a <=1 kcal para que P y luego C/G
      // puedan decidir exactamente.
      steps[filler.index] = maximumFiller;
      evaluate();
      const minimumInCalorieZone = Math.max(
        fillerMinimum,
        Math.ceil(
          (
            calorieBudget - usedCalories - CALORIE_FILL_TARGET_TOLERANCE -
            TRACKING_CALORIE_EPS
          ) / filler.caloriesPerStep
        )
      );
      for (
        let fillerSteps = minimumInCalorieZone;
        fillerSteps < maximumFiller;
        fillerSteps++
      ) {
        steps[filler.index] = fillerSteps;
        evaluate();
      }
      steps[filler.index] = fillerMinimum;
      return;
    }

    const descriptor = selected.outer[position];
    const minimum = baseSteps[descriptor.index] || 0;
    const remainingMinimumCalories = [
      ...selected.outer.slice(position + 1),
      selected.filler,
    ].reduce(
      (total, pendingDescriptor) =>
        total +
        (baseSteps[pendingDescriptor.index] || 0) * pendingDescriptor.caloriesPerStep,
      0
    );
    const maximum = Math.min(
      descriptor.technicalMaxSteps,
      Math.floor(
        (
          calorieBudget - usedCalories - remainingMinimumCalories +
          TRACKING_CALORIE_EPS
        ) / descriptor.caloriesPerStep
      )
    );
    if (maximum < minimum) return;

    for (let descriptorSteps = minimum; descriptorSteps <= maximum; descriptorSteps++) {
      steps[descriptor.index] = descriptorSteps;
      enumerateOuter(
        position + 1,
        usedCalories + descriptorSteps * descriptor.caloriesPerStep
      );
    }
    steps[descriptor.index] = minimum;
  }

  enumerateOuter(0, 0);
  return { executed: true, evaluated, estimated: selected.estimated };
}

function normalizeCalorieFillSeed(seed, baseSteps, descriptors, calorieBudget) {
  const normalized = new Array(baseSteps.length).fill(0);
  for (const descriptor of descriptors) {
    normalized[descriptor.index] = Math.min(
      descriptor.technicalMaxSteps,
      Math.max(baseSteps[descriptor.index] || 0, Math.floor(toNumber(seed[descriptor.index], 0) + EPS))
    );
  }
  const caloriesFor = (values) => descriptors.reduce(
    (total, descriptor) => total + values[descriptor.index] * descriptor.caloriesPerStep,
    0
  );
  let calories = caloriesFor(normalized);
  if (calories <= calorieBudget + TRACKING_CALORIE_EPS) return normalized;

  const baseCalories = caloriesFor(baseSteps);
  const extraCalories = Math.max(EPS, calories - baseCalories);
  const allowedExtra = Math.max(0, calorieBudget - baseCalories);
  const scale = Math.min(1, allowedExtra / extraCalories);
  for (const descriptor of descriptors) {
    const base = baseSteps[descriptor.index] || 0;
    normalized[descriptor.index] = base + Math.floor((normalized[descriptor.index] - base) * scale);
  }
  calories = caloriesFor(normalized);

  if (calories > calorieBudget + TRACKING_CALORIE_EPS) {
    const removable = [...descriptors].sort((left, right) =>
      right.caloriesPerStep - left.caloriesPerStep || left.index - right.index
    );
    for (const descriptor of removable) {
      const base = baseSteps[descriptor.index] || 0;
      if (normalized[descriptor.index] <= base) continue;
      const needed = Math.ceil(
        (calories - calorieBudget - TRACKING_CALORIE_EPS) / descriptor.caloriesPerStep
      );
      const removed = Math.min(needed, normalized[descriptor.index] - base);
      normalized[descriptor.index] -= removed;
      calories -= removed * descriptor.caloriesPerStep;
      if (calories <= calorieBudget + TRACKING_CALORIE_EPS) break;
    }
  }
  return normalized;
}

function calorieFillMacroSeeds(descriptors, baseSteps, fixedTotals, objective, calorieBudget) {
  const seeds = [];
  const add = (values) => seeds.push(
    normalizeCalorieFillSeed(values, baseSteps, descriptors, calorieBudget)
  );
  add(baseSteps);

  for (const descriptor of descriptors) {
    for (const [targetKey, fixedKey, perStep] of [
      ["proteina", "proteina", descriptor.proteinPerStep],
      ["carbohidratos", "carbohidratos", descriptor.carbsPerStep],
      ["grasas", "grasas", descriptor.fatPerStep],
    ]) {
      const remaining = Math.max(0, objective[targetKey] - fixedTotals[fixedKey]);
      if (!(remaining > 0) || !(perStep > EPS)) continue;
      const seed = [...baseSteps];
      seed[descriptor.index] = Math.max(
        seed[descriptor.index],
        Math.round(remaining / perStep)
      );
      add(seed);
    }
  }

  const roleSeed = [...baseSteps];
  const targets = {
    P: Math.max(0, objective.proteina - fixedTotals.proteina) * 4,
    C: Math.max(0, objective.carbohidratos - fixedTotals.carbohidratos) * 4,
    G: Math.max(0, objective.grasas - fixedTotals.grasas) * 9,
  };
  const roles = { P: [], C: [], G: [] };
  for (const descriptor of descriptors) {
    const energy = {
      P: descriptor.proteinPerStep * 4,
      C: descriptor.carbsPerStep * 4,
      G: descriptor.fatPerStep * 9,
    };
    const role = Object.entries(energy).sort((left, right) =>
      right[1] - left[1] || left[0].localeCompare(right[0])
    )[0][0];
    roles[role].push(descriptor);
  }
  for (const role of ["P", "C", "G"]) {
    if (!roles[role].length || !(targets[role] > 0)) continue;
    const allocatedCalories = Math.min(calorieBudget, targets[role]) / roles[role].length;
    for (const descriptor of roles[role]) {
      roleSeed[descriptor.index] = Math.max(
        roleSeed[descriptor.index],
        Math.round(allocatedCalories / descriptor.caloriesPerStep)
      );
    }
  }
  add(roleSeed);

  const count = descriptors.length;
  for (let mask = 1; mask < (1 << count); mask++) {
    const active = descriptors.filter((_, index) => (mask & (1 << index)) !== 0);
    const dimensions = [
      { target: calorieBudget, scale: Math.max(calorieBudget, 1), weight: 4, key: "caloriesPerStep" },
      { target: Math.max(0, objective.proteina - fixedTotals.proteina), scale: Math.max(objective.proteina, 10), weight: 2, key: "proteinPerStep" },
      { target: Math.max(0, objective.carbohidratos - fixedTotals.carbohidratos), scale: Math.max(objective.carbohidratos, 20), weight: 1, key: "carbsPerStep" },
      { target: Math.max(0, objective.grasas - fixedTotals.grasas), scale: Math.max(objective.grasas, 8), weight: 1, key: "fatPerStep" },
    ];
    const rows = dimensions.map((dimension) => active.map((descriptor) =>
      descriptor[dimension.key] / dimension.scale * Math.sqrt(dimension.weight)
    ));
    const targetVector = dimensions.map((dimension) =>
      dimension.target / dimension.scale * Math.sqrt(dimension.weight)
    );
    const solution = solveLeastSquares(rows, targetVector, 1e-8);
    if (solution.some((value) => !Number.isFinite(value) || value < -1e-7)) continue;
    const seed = [...baseSteps];
    active.forEach((descriptor, activeIndex) => {
      seed[descriptor.index] = Math.max(
        seed[descriptor.index],
        Math.round(Math.max(0, solution[activeIndex]))
      );
    });
    add(seed);
  }

  const seen = new Set();
  return seeds.filter((seed) => {
    const key = seed.join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function optimizeTrackingCalorieFillQuantities(selection, pending, objective, fixedTotals) {
  const calorieCeiling = Math.max(0, objective.calorias);
  const calorieBudget = Math.max(0, calorieCeiling - fixedTotals.calorias);
  const allDescriptors = pending.map((item, index) =>
    calorieFillDescriptor(item, index, calorieBudget)
  );
  const descriptors = allDescriptors.filter((descriptor) => descriptor.valid);
  const invalidFoods = allDescriptors
    .filter((descriptor) => !descriptor.valid)
    .map((descriptor) => ({
      foodId: descriptor.foodId,
      name: descriptor.name,
      unit: descriptor.unit,
      reason: "invalid_calories",
    }));

  if (!descriptors.length) {
    return {
      profile: "tracking_calorie_fill",
      policy: TRACKING_CALORIE_FILL_POLICY,
      requestedMode: "calorie_fill",
      mode: "calorie_fill",
      invalidFoods,
      error: {
        code: "invalid_calorie_data",
        message: invalidFoods.length === 1
          ? `No se pudo calcular una cantidad para ${invalidFoods[0].name} porque no tiene informacion calorica valida.`
          : "No se pudo calcular porque los alimentos seleccionados no tienen informacion calorica valida.",
      },
    };
  }

  const minimumUseCalories = descriptors.reduce(
    (total, descriptor) => total + descriptor.caloriesPerStep,
    0
  );
  const canUseEveryValidFood = minimumUseCalories <= calorieBudget + TRACKING_CALORIE_EPS;
  const baseSteps = new Array(pending.length).fill(0);
  if (canUseEveryValidFood) {
    for (const descriptor of descriptors) baseSteps[descriptor.index] = 1;
  }

  let best = null;
  let iterations = 0;
  const candidateSeeds = new Map();
  const consider = (steps) => {
    iterations++;
    const candidate = calorieFillCandidate(steps, allDescriptors, fixedTotals, objective);
    if (!candidate) return null;
    if (!best || compareCalorieFillCandidates(candidate, best, objective) < 0) best = candidate;
    return candidate;
  };
  const rememberSeed = (seed) => {
    const normalized = normalizeCalorieFillSeed(
      seed,
      baseSteps,
      descriptors,
      calorieBudget
    );
    const key = normalized.join("|");
    if (!candidateSeeds.has(key)) candidateSeeds.set(key, normalized);
    consider(normalized);

    const seedCalories = descriptors.reduce(
      (total, descriptor) => total + normalized[descriptor.index] * descriptor.caloriesPerStep,
      0
    );
    for (const filler of descriptors) {
      const filled = [...normalized];
      const affordable = Math.floor(
        (calorieBudget - seedCalories + TRACKING_CALORIE_EPS) / filler.caloriesPerStep
      );
      if (affordable > 0) {
        filled[filler.index] = Math.min(
          filler.technicalMaxSteps,
          filled[filler.index] + affordable
        );
      }
      const filledKey = filled.join("|");
      if (!candidateSeeds.has(filledKey)) candidateSeeds.set(filledKey, filled);
      consider(filled);
    }
  };

  rememberSeed(baseSteps);
  for (const descriptor of descriptors) {
    const single = [...baseSteps];
    const otherCalories = descriptors.reduce((total, current) =>
      current.index === descriptor.index
        ? total
        : total + single[current.index] * current.caloriesPerStep,
    0);
    single[descriptor.index] = Math.min(
      descriptor.technicalMaxSteps,
      Math.floor((calorieBudget - otherCalories + TRACKING_CALORIE_EPS) / descriptor.caloriesPerStep)
    );
    rememberSeed(single);
  }

  const indexes = descriptors.map((descriptor) => descriptor.index);
  const orders = [
    indexes,
    [...indexes].reverse(),
    [...descriptors]
      .sort((left, right) => left.caloriesPerStep - right.caloriesPerStep || left.index - right.index)
      .map((descriptor) => descriptor.index),
    [...descriptors]
      .sort((left, right) => {
        const leftDensity = left.proteinPerStep / left.caloriesPerStep;
        const rightDensity = right.proteinPerStep / right.caloriesPerStep;
        return rightDensity - leftDensity || left.index - right.index;
      })
      .map((descriptor) => descriptor.index),
  ];
  for (const order of orders) {
    const greedy = [...baseSteps];
    let calories = descriptors.reduce(
      (total, descriptor) => total + greedy[descriptor.index] * descriptor.caloriesPerStep,
      0
    );
    for (const index of order) {
      const descriptor = allDescriptors[index];
      const extra = Math.max(0, Math.floor(
        (calorieBudget - calories + TRACKING_CALORIE_EPS) / descriptor.caloriesPerStep
      ));
      greedy[index] = Math.min(descriptor.technicalMaxSteps, greedy[index] + extra);
      calories += extra * descriptor.caloriesPerStep;
    }
    rememberSeed(greedy);
  }

  for (const seed of calorieFillMacroSeeds(
    descriptors,
    baseSteps,
    fixedTotals,
    objective,
    calorieBudget
  )) {
    rememberSeed(seed);
  }

  const rankedSeeds = [...candidateSeeds.values()]
    .map((seed) => ({ seed, candidate: calorieFillCandidate(seed, allDescriptors, fixedTotals, objective) }))
    .filter((entry) => entry.candidate)
    .sort((left, right) => compareCalorieFillCandidates(left.candidate, right.candidate, objective))
    .slice(0, descriptors.length >= 5 ? 3 : 6)
    .map((entry) => entry.seed);
  if (!rankedSeeds.some((seed) => seed.join("|") === baseSteps.join("|"))) {
    rankedSeeds.push(baseSteps);
  }

  const scanPair = (seed, left, right) => {
    const pairBase = [...seed];
    const leftMinimum = baseSteps[left.index] || 0;
    const rightMinimum = baseSteps[right.index] || 0;
    pairBase[left.index] = leftMinimum;
    pairBase[right.index] = rightMinimum;
    const otherCalories = descriptors.reduce((total, descriptor) =>
      total + pairBase[descriptor.index] * descriptor.caloriesPerStep,
    0);
    const maximumLeft = Math.min(
      left.technicalMaxSteps,
      Math.floor(
        (calorieBudget - otherCalories + TRACKING_CALORIE_EPS) /
        left.caloriesPerStep
      ) + leftMinimum
    );
    if (maximumLeft < leftMinimum) return;
    const range = maximumLeft - leftMinimum;
    const stride = Math.max(1, Math.ceil((range + 1) / CALORIE_FILL_MAX_PAIR_ITERATIONS));
    const sampled = new Set();
    for (let leftSteps = leftMinimum; leftSteps <= maximumLeft; leftSteps += stride) {
      sampled.add(leftSteps);
    }
    sampled.add(maximumLeft);
    const seedLeft = Math.max(leftMinimum, Math.min(maximumLeft, seed[left.index] || 0));
    for (let offset = -8; offset <= 8; offset++) sampled.add(
      Math.max(leftMinimum, Math.min(maximumLeft, seedLeft + offset))
    );

    for (const leftSteps of [...sampled].sort((a, b) => a - b)) {
      const used = otherCalories +
        (leftSteps - leftMinimum) * left.caloriesPerStep;
      const rightExtra = Math.max(0, Math.floor(
        (calorieBudget - used + TRACKING_CALORIE_EPS) / right.caloriesPerStep
      ));
      const candidate = [...pairBase];
      candidate[left.index] = leftSteps;
      candidate[right.index] = Math.min(
        right.technicalMaxSteps,
        rightMinimum + rightExtra
      );
      consider(candidate);
    }
  };

  for (const seed of rankedSeeds) {
    for (let leftIndex = 0; leftIndex < descriptors.length; leftIndex++) {
      for (let rightIndex = leftIndex + 1; rightIndex < descriptors.length; rightIndex++) {
        const left = descriptors[leftIndex];
        const right = descriptors[rightIndex];
        scanPair(seed, left, right);
        scanPair(seed, right, left);
      }
    }
  }

  // Refinamiento tridimensional acotado: fija un tercer alimento alrededor
  // de la mejor semilla y vuelve a resolver el par restante. Evita concentrar
  // todas las kcal en dos fuentes cuando una mezcla P/C/G equivalente mejora
  // claramente los macros.
  if (descriptors.length === 3 && best) {
    const reference = [...best.steps];
    for (const anchor of descriptors) {
      for (let offset = -8; offset <= 8; offset++) {
        const anchored = [...reference];
        anchored[anchor.index] = Math.max(
          baseSteps[anchor.index] || 0,
          Math.min(anchor.technicalMaxSteps, (reference[anchor.index] || 0) + offset)
        );
        for (let leftIndex = 0; leftIndex < descriptors.length; leftIndex++) {
          const left = descriptors[leftIndex];
          if (left.index === anchor.index) continue;
          for (let rightIndex = leftIndex + 1; rightIndex < descriptors.length; rightIndex++) {
            const right = descriptors[rightIndex];
            if (right.index === anchor.index) continue;
            scanPair(anchored, left, right);
          }
        }
      }
    }
  }

  // Para selecciones pequeñas el espacio factible es suficientemente barato
  // como para verificarlo de forma determinista. Se enumeran las dimensiones
  // acotadas y se resuelve exactamente el último alimento contra el techo.
  const exactSmallSearch = exactSmallCalorieFillSearch({
    descriptors,
    baseSteps,
    calorieBudget,
    consider,
  });

  if (!best) {
    return {
      profile: "tracking_calorie_fill",
      policy: TRACKING_CALORIE_FILL_POLICY,
      requestedMode: "calorie_fill",
      mode: "calorie_fill",
      invalidFoods,
      error: {
        code: "no_calorie_fill_solution",
        message: "No se encontro una cantidad fisicamente valida por debajo del objetivo calorico.",
      },
    };
  }

  for (const descriptor of allDescriptors) {
    const steps = descriptor.valid ? best.steps[descriptor.index] || 0 : 0;
    const quantity = steps * descriptor.step;
    pending[descriptor.index].cantidad = round(quantity, descriptor.step < 1 ? 6 : 2);
  }

  const totals = calculateTotals(selection);
  const calorieDeficit = Math.max(0, calorieCeiling - totals.calorias);
  const proteinDeficit = objective.proteina > 0
    ? Math.max(0, objective.proteina - totals.proteina)
    : 0;
  const macroLimitations = [
    {
      macro: "proteina",
      target: objective.proteina,
      actual: totals.proteina,
      deficit: proteinDeficit,
      threshold: 0.5,
    },
    {
      macro: "carbohidratos",
      target: objective.carbohidratos,
      actual: totals.carbohidratos,
      deficit: Math.max(0, objective.carbohidratos - totals.carbohidratos),
      threshold: Math.max(2, objective.carbohidratos * 0.05),
    },
    {
      macro: "grasas",
      target: objective.grasas,
      actual: totals.grasas,
      deficit: Math.max(0, objective.grasas - totals.grasas),
      threshold: Math.max(1, objective.grasas * 0.05),
    },
  ]
    .filter((entry) => entry.target > 0 && entry.deficit > entry.threshold + EPS)
    .map(({ threshold: _threshold, ...entry }) => ({
      ...entry,
      target: round(entry.target, 2),
      actual: round(entry.actual, 2),
      deficit: round(entry.deficit, 2),
    }));
  const exceededRecommendedPortions = allDescriptors
    .filter((descriptor) => descriptor.valid && descriptor.recommendedMax > 0)
    .map((descriptor) => ({
      descriptor,
      proposedQuantity: (best.steps[descriptor.index] || 0) * descriptor.step,
    }))
    .filter(({ descriptor, proposedQuantity }) =>
      proposedQuantity > descriptor.recommendedMax + EPS
    )
    .map(({ descriptor, proposedQuantity }) => ({
      foodId: descriptor.foodId,
      name: descriptor.name,
      recommendedMax: round(descriptor.recommendedMax, 6),
      proposedQuantity: round(proposedQuantity, 6),
      unit: descriptor.unit,
    }));
  const skippedFoods = allDescriptors
    .filter((descriptor) => descriptor.valid && !(best.steps[descriptor.index] > 0))
    .map((descriptor) => ({
      foodId: descriptor.foodId,
      name: descriptor.name,
      unit: descriptor.unit,
      reason: "calorie_ceiling",
    }));
  const continuousFoodsAvailable = descriptors.some((descriptor) => descriptor.continuous);
  const discreteOnly = descriptors.every((descriptor) => !descriptor.continuous);
  const noFurtherStepFits = descriptors.every((descriptor) =>
    descriptor.caloriesPerStep > calorieDeficit + TRACKING_CALORIE_EPS
  );

  return {
    profile: "tracking_calorie_fill",
    policy: TRACKING_CALORIE_FILL_POLICY,
    requestedMode: "calorie_fill",
    mode: "calorie_fill",
    calorieCeiling: round(calorieCeiling, 2),
    calorieCeilingSatisfied: totals.calorias <= calorieCeiling + TRACKING_CALORIE_EPS,
    calorieTolerance: CALORIE_FILL_TARGET_TOLERANCE,
    calorieEquivalentTolerance: CALORIE_FILL_EQUIVALENT_KCAL,
    calorieDeficit: round(calorieDeficit, 6),
    calorieTargetCompleted: calorieDeficit <= CALORIE_FILL_TARGET_TOLERANCE + TRACKING_CALORIE_EPS,
    bestReachableCalories: round(totals.calorias, 6),
    inCalorieZone: calorieDeficit <= CALORIE_FILL_TARGET_TOLERANCE + TRACKING_CALORIE_EPS,
    normalCalorieZoneReached: calorieDeficit <= CALORIE_FILL_TARGET_TOLERANCE + TRACKING_CALORIE_EPS,
    continuousFoodsAvailable,
    discreteOnly,
    discreteLimited: discreteOnly && calorieDeficit > CALORIE_FILL_TARGET_TOLERANCE + TRACKING_CALORIE_EPS,
    granularityLimited: noFurtherStepFits && calorieDeficit > CALORIE_FILL_TARGET_TOLERANCE + TRACKING_CALORIE_EPS,
    proteinTargetActive: objective.proteina > 0,
    proteinReached:
      objective.proteina <= 0 ||
      proteinDeficit <= CALORIE_FILL_PROTEIN_REACHED_TOLERANCE + EPS,
    proteinDeficit: round(proteinDeficit, 6),
    macroScore: round(trackingSecondaryMacroError(totals, objective), 6),
    macroLimitations,
    exceededRecommendedPortions,
    invalidFoods,
    skippedFoods,
    allSelectedFoodsUsed: skippedFoods.length === 0 && invalidFoods.length === 0,
    constraints: allDescriptors.map((descriptor) => ({
      foodId: descriptor.foodId,
      name: descriptor.name,
      unit: descriptor.unit,
      kind: descriptor.kind,
      step: descriptor.step,
      recommendedMin: round(descriptor.recommendedMin, 6),
      recommendedMax: round(descriptor.recommendedMax, 6),
      recommendedStep: round(descriptor.recommendedStep, 6),
      technicalMax: round(descriptor.technicalMaxSteps * descriptor.step, 6),
    })),
    exactSmallSearch,
    iterations,
  };
}

function trackingProteinAssessment(selection, pending, objective, minimumCalories = 0) {
  const minimums = pending.map((item) => minimumTrackingQuantity(item));
  const baseline = totalsForPendingQuantities(selection, pending, minimums);
  const calorieCeiling = Math.max(0, objective.calorias);
  const proteinTarget = Math.max(0, objective.proteina - baseline.proteina);

  if (baseline.calorias > calorieCeiling + TRACKING_CALORIE_EPS) {
    return {
      reachable: baseline.proteina >= objective.proteina - 0.05,
      maximumProtein: baseline.proteina,
      quantities: minimums,
    };
  }
  if (!(objective.proteina > 0) || proteinTarget <= 0.05) {
    return {
      reachable: true,
      maximumProtein: baseline.proteina,
      quantities: minimums,
    };
  }

  const calorieBudget = Math.max(0, calorieCeiling - baseline.calorias);
  const freeExtraSteps = new Array(pending.length).fill(0);
  const chunks = [];
  for (let itemIndex = 0; itemIndex < pending.length; itemIndex++) {
    const item = pending[itemIndex];
    const step = quantityStepFor(item);
    const kcalPerStep = Math.max(0, item.food.calorias * step);
    const proteinPerStep = Math.max(0, item.food.proteina * step);
    const maximumExtra = Math.max(0, maximumTrackingQuantity(item) - minimums[itemIndex]);
    const maximumSteps = Math.floor((maximumExtra + EPS) / step);

    if (maximumSteps <= 0 || proteinPerStep <= EPS) continue;
    if (kcalPerStep <= EPS) {
      freeExtraSteps[itemIndex] = maximumSteps;
      continue;
    }

    let remainingSteps = maximumSteps;
    let chunkSize = 1;
    while (remainingSteps > 0) {
      const count = Math.min(chunkSize, remainingSteps);
      chunks.push({
        itemIndex,
        count,
        calories: count * kcalPerStep,
        protein: count * proteinPerStep,
      });
      remainingSteps -= count;
      chunkSize *= 2;
    }
  }

  const scale = calorieBudget <= 1500 ? 100 : 10;
  const capacity = Math.max(0, Math.floor(calorieBudget * scale + EPS));
  const proteinByCapacity = new Float64Array(capacity + 1);
  const caloriesByCapacity = new Float64Array(capacity + 1);
  proteinByCapacity.fill(Number.NEGATIVE_INFINITY);
  caloriesByCapacity.fill(Number.POSITIVE_INFINITY);
  proteinByCapacity[0] = 0;
  caloriesByCapacity[0] = 0;

  const decisions = [];
  for (const chunk of chunks) {
    const weight = Math.max(1, Math.round(chunk.calories * scale));
    const selected = new Uint8Array(capacity + 1);
    for (let current = capacity; current >= weight; current--) {
      const previous = current - weight;
      if (!Number.isFinite(proteinByCapacity[previous])) continue;
      const calories = caloriesByCapacity[previous] + chunk.calories;
      if (calories > calorieBudget + TRACKING_CALORIE_EPS) continue;
      const protein = proteinByCapacity[previous] + chunk.protein;
      if (
        protein > proteinByCapacity[current] + 1e-8 ||
        (
          Math.abs(protein - proteinByCapacity[current]) <= 1e-8 &&
          calories < caloriesByCapacity[current] - 1e-8
        )
      ) {
        proteinByCapacity[current] = protein;
        caloriesByCapacity[current] = calories;
        selected[current] = 1;
      }
    }
    decisions.push({ chunk, selected, weight });
  }

  const freeProtein = freeExtraSteps.reduce(
    (total, steps, index) =>
      total + steps * quantityStepFor(pending[index]) * pending[index].food.proteina,
    0
  );
  let bestCapacity = -1;
  let bestProtein = Number.NEGATIVE_INFINITY;
  let bestCalories = Number.POSITIVE_INFINITY;
  let reachedCapacity = -1;
  let reachedCalories = Number.POSITIVE_INFINITY;
  for (let current = 0; current <= capacity; current++) {
    if (!Number.isFinite(proteinByCapacity[current])) continue;
    const protein = proteinByCapacity[current] + freeProtein;
    const calories = caloriesByCapacity[current];
    if (baseline.calorias + calories < minimumCalories - TRACKING_CALORIE_EPS) continue;
    if (
      protein > bestProtein + 1e-8 ||
      (Math.abs(protein - bestProtein) <= 1e-8 && calories < bestCalories - 1e-8)
    ) {
      bestCapacity = current;
      bestProtein = protein;
      bestCalories = calories;
    }
    if (
      protein >= proteinTarget - 0.05 &&
      calories < reachedCalories - 1e-8
    ) {
      reachedCapacity = current;
      reachedCalories = calories;
    }
  }

  if (bestCapacity < 0) {
    bestCapacity = 0;
    bestProtein = freeProtein;
    bestCalories = 0;
  }

  const reachable = reachedCapacity >= 0;
  let currentCapacity = reachable ? reachedCapacity : bestCapacity;
  const extraSteps = [...freeExtraSteps];
  for (let index = decisions.length - 1; index >= 0; index--) {
    const decision = decisions[index];
    if (!decision.selected[currentCapacity]) continue;
    extraSteps[decision.chunk.itemIndex] += decision.chunk.count;
    currentCapacity -= decision.weight;
  }
  const quantities = minimums.map((minimum, index) =>
    minimum + extraSteps[index] * quantityStepFor(pending[index])
  );
  const totals = totalsForPendingQuantities(selection, pending, quantities);
  const maximumProtein = baseline.proteina + bestProtein;

  return {
    reachable: reachable && totals.proteina >= objective.proteina - 0.05,
    maximumProtein,
    quantities,
  };
}

function trackingSecondaryMacroError(totals, objective) {
  const carbScale = objective.carbohidratos > 0 ? objective.carbohidratos : 25;
  const fatScale = objective.grasas > 0 ? objective.grasas : 10;
  const carbError = Math.abs(totals.carbohidratos - objective.carbohidratos) / carbScale;
  const fatError = Math.abs(totals.grasas - objective.grasas) / fatScale;
  return carbError ** 2 + fatError ** 2;
}

function trackingPriorityRank(totals, objective, context = {}) {
  const calorieExcess = Math.max(0, totals.calorias - objective.calorias);
  if (calorieExcess > TRACKING_CALORIE_EPS) {
    return [1, calorieExcess, 0, 0, 0, 0, 0];
  }

  const calorieDeficit = Math.max(0, objective.calorias - totals.calorias);
  const proteinDeficit = objective.proteina > 0
    ? Math.max(0, objective.proteina - totals.proteina)
    : 0;
  const proteinExcess = objective.proteina > 0
    ? Math.max(0, totals.proteina - objective.proteina)
    : 0;
  const secondaryError = trackingSecondaryMacroError(totals, objective);
  const inNormalCalorieZone = totals.calorias >= context.calorieZoneFloor - TRACKING_CALORIE_EPS;

  // Cuando la grilla no entra en la zona normal, manda la mejor cantidad
  // calórica alcanzable. Los demás criterios sólo desempatan esa cantidad.
  if (!context.hasNormalCalorieZoneCandidate) {
    return [
      0,
      calorieDeficit,
      objective.proteina > 0 ? proteinDeficit : 0,
      secondaryError,
      proteinExcess,
      objective.proteina > 0 ? 0 : totals.proteina,
    ];
  }

  if (objective.proteina > 0 && context.proteinReachable) {
    return [
      0,
      inNormalCalorieZone ? 0 : 1,
      proteinDeficit > 0.05 ? 1 : 0,
      proteinDeficit,
      secondaryError,
      calorieDeficit,
      proteinExcess,
    ];
  }

  if (objective.proteina > 0) {
    return [
      0,
      inNormalCalorieZone ? 0 : 1,
      proteinDeficit,
      secondaryError,
      calorieDeficit,
      proteinExcess,
    ];
  }

  // Proteína restante cero: no es una meta ni un beneficio. C/G deciden
  // dentro de la zona y la proteína sólo actúa como desempate final.
  return [
    0,
    inNormalCalorieZone ? 0 : 1,
    secondaryError,
    calorieDeficit,
    totals.proteina,
  ];
}

function compareTrackingRanks(left, right) {
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const difference = (left[index] || 0) - (right[index] || 0);
    if (Math.abs(difference) > 1e-8) return difference;
  }
  return 0;
}

function trackingQuantityOptions(item) {
  const minimum = minimumTrackingQuantity(item);
  const maximum = maximumTrackingQuantity(item);
  const step = quantityStepFor(item);
  const values = [];
  for (let value = minimum; value <= maximum + EPS; value += step) {
    values.push(round(value, 8));
  }
  return values;
}

// En espacios discretos acotados podemos verificar toda la grilla. Es un
// refinamiento exclusivo de Tracking: evita que la búsqueda heurística deje
// una propuesta localmente buena cuando existe otra mejor según la misma
// prioridad lexicográfica.
function exactTrackingRefinement(selection, pending, objective, rankContext, seed) {
  const options = pending.map(trackingQuantityOptions);
  const optionCount = options.reduce((total, values) => total * values.length, 1);
  if (optionCount > TRACKING_EXACT_OPTION_LIMIT) return null;

  const candidate = new Array(pending.length).fill(0);
  let bestQuantities = [...seed];
  let bestTotals = totalsForPendingQuantities(selection, pending, bestQuantities);
  let bestRank = trackingPriorityRank(bestTotals, objective, rankContext);

  const visit = (index) => {
    if (index < pending.length) {
      for (const value of options[index]) {
        candidate[index] = value;
        visit(index + 1);
      }
      return;
    }

    const totals = totalsForPendingQuantities(selection, pending, candidate);
    if (totals.calorias > objective.calorias + TRACKING_CALORIE_EPS) return;
    const rank = trackingPriorityRank(totals, objective, rankContext);
    if (compareTrackingRanks(rank, bestRank) < 0) {
      bestQuantities = [...candidate];
      bestTotals = totals;
      bestRank = rank;
    }
  };

  visit(0);
  return { quantities: bestQuantities, optionCount };
}

// Para grillas grandes, un barrido de pares corrige los intercambios de dos
// alimentos que no puede resolver un movimiento de una sola coordenada. El
// número de pasadas está acotado para conservar el tiempo de respuesta.
function pairwiseTrackingRefinement(selection, pending, objective, rankContext, seed) {
  const options = pending.map(trackingQuantityOptions);
  let quantities = [...seed];

  for (let pass = 0; pass < TRACKING_PAIR_REFINEMENT_PASSES; pass++) {
    const currentTotals = totalsForPendingQuantities(selection, pending, quantities);
    const currentRank = trackingPriorityRank(currentTotals, objective, rankContext);
    let best = null;

    for (let left = 0; left < pending.length; left++) {
      for (let right = left + 1; right < pending.length; right++) {
        for (const leftValue of options[left]) {
          for (const rightValue of options[right]) {
            if (
              Math.abs(leftValue - quantities[left]) <= EPS &&
              Math.abs(rightValue - quantities[right]) <= EPS
            ) continue;
            const candidate = [...quantities];
            candidate[left] = leftValue;
            candidate[right] = rightValue;
            const totals = totalsForPendingQuantities(selection, pending, candidate);
            if (totals.calorias > objective.calorias + TRACKING_CALORIE_EPS) continue;
            const rank = trackingPriorityRank(totals, objective, rankContext);
            if (compareTrackingRanks(rank, currentRank) >= 0) continue;
            if (!best || compareTrackingRanks(rank, best.rank) < 0) {
              best = { quantities: candidate, rank };
            }
          }
        }
      }
    }

    if (!best) break;
    quantities = best.quantities;
  }

  return quantities;
}

function normalizeTrackingQuantity(item, value) {
  const step = quantityStepFor(item);
  const minimum = minimumTrackingQuantity(item);
  const maximum = maximumTrackingQuantity(item);
  const rounded = Math.round(toNumber(value, minimum) / step) * step;
  return Math.min(maximum, Math.max(minimum, rounded));
}

function trackingCalorieAssessment(selection, pending, objective) {
  const minimums = pending.map((item) => minimumTrackingQuantity(item));
  const baseline = totalsForPendingQuantities(selection, pending, minimums);
  const calorieBudget = Math.max(0, objective.calorias - baseline.calorias);
  const chunks = [];

  for (let itemIndex = 0; itemIndex < pending.length; itemIndex++) {
    const item = pending[itemIndex];
    const step = quantityStepFor(item);
    const kcalPerStep = Math.max(0, item.food.calorias * step);
    const proteinPerStep = Math.max(0, item.food.proteina * step);
    const maximumExtra = Math.max(0, maximumTrackingQuantity(item) - minimums[itemIndex]);
    const maximumSteps = Math.floor((maximumExtra + EPS) / step);
    if (maximumSteps <= 0 || kcalPerStep <= EPS) continue;

    let remainingSteps = maximumSteps;
    let chunkSize = 1;
    while (remainingSteps > 0) {
      const count = Math.min(chunkSize, remainingSteps);
      chunks.push({
        itemIndex,
        count,
        calories: count * kcalPerStep,
        protein: count * proteinPerStep,
      });
      remainingSteps -= count;
      chunkSize *= 2;
    }
  }

  const scale = calorieBudget <= 1500 ? 100 : 10;
  const capacity = Math.max(0, Math.floor(calorieBudget * scale + EPS));
  const caloriesByCapacity = new Float64Array(capacity + 1);
  const proteinByCapacity = new Float64Array(capacity + 1);
  caloriesByCapacity.fill(Number.NEGATIVE_INFINITY);
  proteinByCapacity.fill(Number.NEGATIVE_INFINITY);
  caloriesByCapacity[0] = 0;
  proteinByCapacity[0] = 0;

  const decisions = [];
  for (const chunk of chunks) {
    const weight = Math.max(1, Math.round(chunk.calories * scale));
    const selected = new Uint8Array(capacity + 1);
    for (let current = capacity; current >= weight; current--) {
      const previous = current - weight;
      if (!Number.isFinite(caloriesByCapacity[previous])) continue;
      const calories = caloriesByCapacity[previous] + chunk.calories;
      if (calories > calorieBudget + TRACKING_CALORIE_EPS) continue;
      const protein = proteinByCapacity[previous] + chunk.protein;
      if (
        calories > caloriesByCapacity[current] + 1e-8 ||
        (
          Math.abs(calories - caloriesByCapacity[current]) <= 1e-8 &&
          protein > proteinByCapacity[current] + 1e-8
        )
      ) {
        caloriesByCapacity[current] = calories;
        proteinByCapacity[current] = protein;
        selected[current] = 1;
      }
    }
    decisions.push({ chunk, selected, weight });
  }

  let bestCapacity = 0;
  for (let current = 1; current <= capacity; current++) {
    if (
      caloriesByCapacity[current] > caloriesByCapacity[bestCapacity] + 1e-8 ||
      (
        Math.abs(caloriesByCapacity[current] - caloriesByCapacity[bestCapacity]) <= 1e-8 &&
        proteinByCapacity[current] > proteinByCapacity[bestCapacity] + 1e-8
      )
    ) {
      bestCapacity = current;
    }
  }

  const extraSteps = new Array(pending.length).fill(0);
  let currentCapacity = bestCapacity;
  for (let index = decisions.length - 1; index >= 0; index--) {
    const decision = decisions[index];
    if (!decision.selected[currentCapacity]) continue;
    extraSteps[decision.chunk.itemIndex] += decision.chunk.count;
    currentCapacity -= decision.weight;
  }

  return {
    quantities: minimums.map((minimum, index) =>
      minimum + extraSteps[index] * quantityStepFor(pending[index])
    ),
    calories: baseline.calorias + caloriesByCapacity[bestCapacity],
  };
}

function fillTrackingCalories(selection, pending, objective, seed, order) {
  const quantities = [...seed];
  for (const index of order) {
    const item = pending[index];
    const step = quantityStepFor(item);
    const maximum = maximumTrackingQuantity(item);
    if (quantities[index] + step > maximum + EPS) continue;

    const totals = totalsForPendingQuantities(selection, pending, quantities);
    const availableCalories = objective.calorias - totals.calorias;
    const kcalPerStep = item.food.calorias * step;
    const affordableSteps = kcalPerStep > EPS
      ? Math.floor((availableCalories + TRACKING_CALORIE_EPS) / kcalPerStep)
      : Math.floor((maximum - quantities[index] + EPS) / step);
    const availableSteps = Math.floor((maximum - quantities[index] + EPS) / step);
    const steps = Math.min(availableSteps, Math.max(0, affordableSteps));
    quantities[index] += steps * step;
  }
  return quantities;
}

function trackingSeedOrders(pending = []) {
  const indexes = pending.map((_, index) => index);
  const byCaloriesAscending = [...indexes].sort((left, right) =>
    pending[left].food.calorias * quantityStepFor(pending[left]) -
    pending[right].food.calorias * quantityStepFor(pending[right])
  );
  const byCaloriesDescending = [...byCaloriesAscending].reverse();
  const byProteinDensity = [...indexes].sort((left, right) => {
    const leftKcal = pending[left].food.calorias;
    const rightKcal = pending[right].food.calorias;
    const leftRatio = leftKcal > EPS
      ? pending[left].food.proteina / leftKcal
      : Number.POSITIVE_INFINITY;
    const rightRatio = rightKcal > EPS
      ? pending[right].food.proteina / rightKcal
      : Number.POSITIVE_INFINITY;
    return rightRatio - leftRatio;
  });
  const orders = [indexes, byCaloriesAscending, byCaloriesDescending, byProteinDensity];

  for (const first of indexes) {
    orders.push([first, ...byCaloriesDescending.filter((index) => index !== first)]);
  }

  const seen = new Set();
  return orders.filter((order) => {
    const key = order.join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function trackingLimitingMaxConstraints(pending, maximums, maximumTotals, objective, calorieZoneFloor) {
  const checks = [
    { key: "calorias", target: calorieZoneFloor, label: "kcal", group: "" },
    { key: "proteina", target: objective.proteina, label: "proteína", group: "proteicos" },
    { key: "carbohidratos", target: objective.carbohidratos, label: "carbohidratos", group: "carbohidratos" },
    { key: "grasas", target: objective.grasas, label: "grasas", group: "grasas" },
  ].filter((check) => check.target > 0 && maximumTotals[check.key] < check.target - 0.05);

  const byItem = new Map();
  for (const check of checks) {
    let candidates = pending
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.maxExplicit && item.food?.[check.key] > EPS)
      .filter(({ item }) => !check.group || item.group === check.group);
    if (!candidates.length) {
      candidates = pending
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => item.maxExplicit && item.food?.[check.key] > EPS);
    }
    for (const { item, index } of candidates) {
      const current = byItem.get(item) || {
        name: item.nombre || item.food?.nombre || "Alimento",
        max: maximums[index],
        maxSource: item.maxSource || "",
        targets: [],
      };
      if (!current.targets.includes(check.label)) current.targets.push(check.label);
      byItem.set(item, current);
    }
  }
  return [...byItem.values()];
}

function optimizeTrackingQuantities(selection, pending, objective) {
  if (!pending.length || !(objective.calorias > 0)) return null;
  const calorieCeiling = objective.calorias;
  const minimums = pending.map((item) => minimumTrackingQuantity(item));
  const maximums = pending.map((item) => maximumTrackingQuantity(item));
  const steps = pending.map(quantityStepFor);
  let quantities = pending.map((item, index) =>
    normalizeTrackingQuantity(item, item.cantidad ?? minimums[index])
  );
  const calorieAssessment = trackingCalorieAssessment(selection, pending, objective);
  const calorieZoneTolerance = Math.max(5, objective.calorias * 0.02);
  const normalCalorieZoneFloor = Math.max(0, objective.calorias - calorieZoneTolerance);
  const hasNormalCalorieZoneCandidate =
    calorieAssessment.calories >= normalCalorieZoneFloor - TRACKING_CALORIE_EPS;
  const calorieZoneFloor = hasNormalCalorieZoneCandidate
    ? normalCalorieZoneFloor
    : calorieAssessment.calories;
  const proteinAssessment = trackingProteinAssessment(
    selection,
    pending,
    objective,
    calorieZoneFloor
  );
  const proteinReachable = objective.proteina > 0 && proteinAssessment.reachable;
  const rankContext = {
    calorieZoneFloor,
    hasNormalCalorieZoneCandidate,
    proteinReachable,
  };

  // Primero dejamos la propuesta estrictamente por debajo del techo calórico.
  for (let guard = 0; guard < 5000; guard++) {
    const totals = totalsForPendingQuantities(selection, pending, quantities);
    if (totals.calorias <= calorieCeiling + TRACKING_CALORIE_EPS) break;
    let best = null;

    for (let index = 0; index < pending.length; index++) {
      if (quantities[index] - steps[index] < minimums[index] - EPS) continue;
      const candidate = [...quantities];
      candidate[index] = Math.max(minimums[index], candidate[index] - steps[index]);
      const candidateTotals = totalsForPendingQuantities(selection, pending, candidate);
      const underCeiling = candidateTotals.calorias <= calorieCeiling + TRACKING_CALORIE_EPS;
      const candidateRank = trackingPriorityRank(candidateTotals, objective, rankContext);

      if (
        !best ||
        (underCeiling && !best.underCeiling) ||
        (underCeiling === best.underCeiling && (
          underCeiling
            ? compareTrackingRanks(candidateRank, best.rank) < 0
            : candidateTotals.calorias < best.totals.calorias - 1e-8
        ))
      ) {
        best = {
          quantities: candidate,
          totals: candidateTotals,
          rank: candidateRank,
          underCeiling,
        };
      }
    }

    if (!best) break;
    quantities = best.quantities;
  }

  // Después aplicamos la prioridad lexicográfica:
  // proteína alcanzable -> kcal más cercanas por debajo -> C/G.
  const seedCandidates = [
    quantities,
    proteinAssessment.quantities,
    calorieAssessment.quantities,
    minimums,
  ];
  const seedOrders = trackingSeedOrders(pending);
  for (const seed of [minimums, proteinAssessment.quantities]) {
    for (const order of seedOrders) {
      seedCandidates.push(fillTrackingCalories(selection, pending, objective, seed, order));
    }
  }
  quantities = seedCandidates.reduce((best, seed) => {
    const normalized = seed.map((value, index) =>
      normalizeTrackingQuantity(pending[index], value)
    );
    const totals = totalsForPendingQuantities(selection, pending, normalized);
    if (totals.calorias > calorieCeiling + TRACKING_CALORIE_EPS) return best;
    const rank = trackingPriorityRank(totals, objective, rankContext);
    const bestTotals = totalsForPendingQuantities(selection, pending, best);
    const bestRank = trackingPriorityRank(bestTotals, objective, rankContext);
    return compareTrackingRanks(rank, bestRank) < 0 ? normalized : best;
  }, quantities);

  for (let guard = 0; guard < 5000; guard++) {
    const currentTotals = totalsForPendingQuantities(selection, pending, quantities);
    const currentRank = trackingPriorityRank(currentTotals, objective, rankContext);
    let best = null;
    const seen = new Set();

    const consider = (candidate) => {
      const key = candidate.join("|");
      if (seen.has(key)) return;
      seen.add(key);
      const candidateTotals = totalsForPendingQuantities(selection, pending, candidate);
      if (candidateTotals.calorias > calorieCeiling + TRACKING_CALORIE_EPS) return;
      const rank = trackingPriorityRank(candidateTotals, objective, rankContext);
      if (compareTrackingRanks(rank, currentRank) >= 0) return;
      if (!best || compareTrackingRanks(rank, best.rank) < 0) {
        best = { quantities: candidate, totals: candidateTotals, rank };
      }
    };

    for (let index = 0; index < pending.length; index++) {
      if (quantities[index] + steps[index] <= maximums[index] + EPS) {
        const increased = [...quantities];
        increased[index] += steps[index];
        consider(increased);
      }
      if (quantities[index] - steps[index] >= minimums[index] - EPS) {
        const decreased = [...quantities];
        decreased[index] -= steps[index];
        consider(decreased);
      }
    }

    // Si agregar una porción supera el techo, probamos intercambiarla por
    // suficientes pasos de otro alimento. Esto permite priorizar proteína
    // sin quedar atrapados en una solución calóricamente llena.
    for (let addIndex = 0; addIndex < pending.length; addIndex++) {
      if (quantities[addIndex] + steps[addIndex] > maximums[addIndex] + EPS) continue;
      const withAddition = [...quantities];
      withAddition[addIndex] += steps[addIndex];
      const addedTotals = totalsForPendingQuantities(selection, pending, withAddition);
      const excess = addedTotals.calorias - calorieCeiling;
      if (excess <= TRACKING_CALORIE_EPS) continue;

      for (let removeIndex = 0; removeIndex < pending.length; removeIndex++) {
        if (removeIndex === addIndex) continue;
        const kcalPerRemoval = pending[removeIndex].food.calorias * steps[removeIndex];
        if (!(kcalPerRemoval > EPS)) continue;
        const removalSteps = Math.max(
          1,
          Math.ceil((excess - TRACKING_CALORIE_EPS) / kcalPerRemoval)
        );
        const nextQuantity = quantities[removeIndex] - removalSteps * steps[removeIndex];
        if (nextQuantity < minimums[removeIndex] - EPS) continue;
        const swapped = [...withAddition];
        swapped[removeIndex] = nextQuantity;
        consider(swapped);
      }
    }

    if (!best) break;
    quantities = best.quantities;
  }

  const exactRefinement = exactTrackingRefinement(
    selection,
    pending,
    objective,
    rankContext,
    quantities
  );
  quantities = exactRefinement
    ? exactRefinement.quantities
    : pairwiseTrackingRefinement(
      selection,
      pending,
      objective,
      rankContext,
      quantities
    );

  for (let index = 0; index < pending.length; index++) {
    pending[index].cantidad = round(quantities[index], 2);
  }
  const totals = calculateTotals(selection);
  // La evaluación previa puede subestimar una combinación que luego encuentra
  // el refinamiento exacto. Si la propuesta final demuestra alcanzabilidad
  // dentro de la zona, la metadata no puede seguir diciendo lo contrario.
  const proteinReachedInChosenZone = objective.proteina > 0 &&
    totals.proteina >= objective.proteina - 0.05 &&
    totals.calorias >= calorieZoneFloor - TRACKING_CALORIE_EPS;
  const maximumTotals = totalsForPendingQuantities(selection, pending, maximums);
  const limitingConstraints = trackingLimitingMaxConstraints(
    pending,
    maximums,
    maximumTotals,
    objective,
    calorieZoneFloor
  );
  return {
    profile: "tracking_remaining",
    policy: TRACKING_OPTIMIZATION_POLICY,
    calorieCeiling: round(calorieCeiling, 2),
    calorieCeilingSatisfied: totals.calorias <= calorieCeiling + TRACKING_CALORIE_EPS,
    calorieZoneTolerance: round(calorieZoneTolerance, 2),
    calorieZoneFloor: round(calorieZoneFloor, 2),
    normalCalorieZoneReached: hasNormalCalorieZoneCandidate,
    inCalorieZone: totals.calorias >= calorieZoneFloor - TRACKING_CALORIE_EPS,
    bestReachableCalories: round(calorieAssessment.calories, 2),
    proteinReachable: proteinReachable || proteinReachedInChosenZone,
    proteinTargetActive: objective.proteina > 0,
    proteinDeficit: round(Math.max(0, objective.proteina - totals.proteina), 2),
    macroScore: round(trackingSecondaryMacroError(totals, objective), 6),
    maxConstraintsLimited: limitingConstraints.length > 0,
    limitingConstraints,
    constraints: pending.map((item) => ({
      name: item.nombre || item.food?.nombre || "Alimento",
      min: minimumTrackingQuantity(item),
      max: maximumTrackingQuantity(item),
      step: quantityStepFor(item),
      minSource: item.minSource || "",
      maxSource: item.maxSource || "",
      stepSource: item.stepSource || "",
      maxExplicit: item.maxExplicit === true,
    })),
  };
}

function scoreScaleFor(key, objective, mode) {
  const target = Math.abs(objective[key]);
  if (target > 0) return Math.max(target, 1);

  if (mode === "kcal" || mode === "kcalProteina") {
    if (key === "proteina") return 80;
    if (key === "carbohidratos") return 120;
    if (key === "grasas") return 60;
  }

  return 1;
}

function scoreResult(totals, objective, mode) {
  const kcalScale = Math.max(Math.abs(objective.calorias), 1);

  if (mode === "kcal") {
    const kcalPenalty = Math.abs(totals.calorias - objective.calorias) / kcalScale;
    const proteinPenalty = objective.proteina > 0
      ? Math.abs(totals.proteina - objective.proteina) / Math.max(objective.proteina, 1)
      : 0;
    const carbsPenalty = objective.carbohidratos > 0
      ? Math.abs(totals.carbohidratos - objective.carbohidratos) / Math.max(objective.carbohidratos, 1)
      : 0;
    const fatPenalty = objective.grasas > 0
      ? Math.abs(totals.grasas - objective.grasas) / Math.max(objective.grasas, 1)
      : 0;
    return 8 * kcalPenalty + 0.08 * proteinPenalty + 0.025 * carbsPenalty + 0.025 * fatPenalty;
  }

  if (mode === "kcalProteina") {
    const proteinTarget = Math.max(Math.abs(objective.proteina), 1);
    const proteinDeficit = Math.max(0, objective.proteina - totals.proteina);
    const proteinExcess = Math.max(0, totals.proteina - objective.proteina);
    const kcalPenalty = Math.abs(totals.calorias - objective.calorias) / kcalScale;
    const deficitPenalty = proteinDeficit / proteinTarget;
    const excessPenalty = proteinExcess / Math.max(proteinTarget * 4, 80);
    const carbsPenalty = objective.carbohidratos > 0
      ? Math.abs(totals.carbohidratos - objective.carbohidratos) / Math.max(objective.carbohidratos, 1)
      : 0;
    const fatPenalty = objective.grasas > 0
      ? Math.abs(totals.grasas - objective.grasas) / Math.max(objective.grasas, 1)
      : 0;
    return 7 * kcalPenalty + 5 * deficitPenalty + 0.08 * excessPenalty + 0.035 * carbsPenalty + 0.035 * fatPenalty;
  }

  const dims = dimensionsForMode(mode);
  let score = 0;
  for (const dim of dims) {
    const scale = scoreScaleFor(dim.key, objective, mode);
    score += dim.weight * Math.abs((totals[dim.key] - objective[dim.key]) / scale);
  }
  return score;
}

function selectedPendingUsagePenalty(items = [], quantities = null, mode = "full") {
  const basePenalty = mode === "full" ? 0.07 : 0.085;
  let penalty = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item?.preferUse) continue;
    const quantity = quantities ? toNumber(quantities[i], 0) : toNumber(item.cantidad, 0);
    const minQuantity = minPracticalQuantity(item);

    if (quantity <= EPS) {
      penalty += basePenalty;
    } else if (minQuantity > EPS && quantity < minQuantity) {
      penalty += basePenalty * (1 - quantity / minQuantity);
    }
  }

  return penalty;
}

function scoreSelection(selection, objective, mode) {
  return scoreResult(calculateTotals(selection), objective, mode) +
    selectedPendingUsagePenalty(selection, null, mode);
}

function hasGroupSource(selection = [], group) {
  return selection.some((item) => item.group === group);
}

function classifyStatus(diff, mode, objective, selection = []) {
  const kcalAbs = Math.abs(diff.calorias);
  const proteinAbs = Math.abs(diff.proteina);
  const proteinDeficit = Math.max(0, -diff.proteina);
  const carbsAbs = Math.abs(diff.carbohidratos);
  const fatAbs = Math.abs(diff.grasas);

  if (mode === "kcal") {
    if (kcalAbs <= 3) return "exacto";
    if (kcalAbs <= 10) return "muy_cercano";
    return "revisar";
  }

  if (mode === "kcalProteina") {
    if (kcalAbs <= 3 && proteinDeficit <= 0.5) return "exacto";
    if (kcalAbs <= 10 && proteinDeficit <= 1) return "muy_cercano";
    if (kcalAbs <= 10 && proteinDeficit <= 3) return "cercano";
    return "revisar";
  }

  if (
    (objective.proteina > 0 && !hasGroupSource(selection, "proteicos") && proteinDeficit > 3) ||
    (objective.carbohidratos > 0 && !hasGroupSource(selection, "carbohidratos") && -diff.carbohidratos > 8) ||
    (objective.grasas > 0 && !hasGroupSource(selection, "grasas") && -diff.grasas > 4)
  ) {
    return "sin_solucion";
  }

  if (kcalAbs <= 3 && proteinAbs <= 1 && carbsAbs <= 2 && fatAbs <= 1) return "exacto";
  if (kcalAbs <= 10 && proteinAbs <= 3 && carbsAbs <= 4 && fatAbs <= 3) return "muy_cercano";
  if (kcalAbs <= 10 && proteinAbs <= 5 && carbsAbs <= 8 && fatAbs <= 5) return "cercano";
  return "revisar";
}

function itemSnapshot(item) {
  const q = round(item.cantidad, 2);
  return {
    id: item.food?.id || null,
    nombre: item.nombre,
    cantidad: q,
    fixedQuantity: item.fixed,
    quantityPending: false,
    calorias: round(item.food.calorias * q, 2),
    proteina: round(item.food.proteina * q, 2),
    carbohidratos: round(item.food.carbohidratos * q, 2),
    grasas: round(item.food.grasas * q, 2),
    minGramos: item.minGramos,
    maxGramos: maxQuantityFor(item),
    stepGramos: quantityStepFor(item),
    quantityConstraintSources: {
      min: item.minSource || "",
      max: item.maxSource || "",
      step: item.stepSource || "",
    },
    maxExplicit: item.maxExplicit === true,
    unidadCalorica: round(item.food.calorias, 4),
    unidadProteica: round(item.food.proteina, 4),
    unidadCarbo: round(item.food.carbohidratos, 4),
    unidadGrasas: round(item.food.grasas, 4),
  };
}

function groupOutput(selection, group) {
  return selection
    .filter((item) => item.group === group && item.cantidad > EPS)
    .map(itemSnapshot);
}

function buildResult(selection, objective, mode, warnings = [], errors = []) {
  const totals = calculateTotals(selection);
  const diferencia = diffTotals(totals, objective);
  const status = errors.length ? "error" : classifyStatus(diferencia, mode, objective, selection);

  return {
    status,
    modo: mode,
    objetivo: {
      calorias: round(objective.calorias, 2),
      proteina: round(objective.proteina, 2),
      carbohidratos: round(objective.carbohidratos, 2),
      grasas: round(objective.grasas, 2),
      caloriasPorMacros: round(objective.macroCalories, 2),
    },
    totales: {
      calorias: round(totals.calorias, 2),
      proteina: round(totals.proteina, 2),
      carbohidratos: round(totals.carbohidratos, 2),
      grasas: round(totals.grasas, 2),
    },
    diferencia,
    warnings,
    errors,
    proteicos: groupOutput(selection, "proteicos"),
    carbohidratos: groupOutput(selection, "carbohidratos"),
    grasas: groupOutput(selection, "grasas"),
  };
}

function generarMenu(...args) {
  const opts = normalizeArgs(args);
  const warnings = [];
  const mode = normalizeMode(opts.modo || opts.mode || opts.tipoAjuste);
  const objective = normalizeObjective(opts.objetivo);

  if (objective.caloriasInconsistentes) {
    warnings.push(
      `El objetivo de kcal (${round(objective.calorias)}) no coincide con los macros cargados, que suman ${round(objective.macroCalories)} kcal. ZumaFit prioriza kcal y busca el mejor balance posible.`
    );
  }

  const foodIndex = buildFoodIndex(opts.alimentosBase || opts.alimentosTotales || opts.foods);
  const selection = buildSelection(opts, foodIndex, warnings);
  const solve = solveQuantities(selection, objective, mode, opts);

  if (!solve.ok) {
    return {
      ...buildResult(selection, objective, mode, warnings, solve.errors),
      optimizacionTracking: solve.trackingOptimization || null,
    };
  }

  if (solve.minimumsWarning) warnings.push(solve.minimumsWarning);
  if (solve.trackingOptimization?.maxConstraintsLimited) {
    warnings.push("Las cantidades máximas configuradas para algunos alimentos limitan esta propuesta.");
  }
  if (solve.trackingOptimization?.calorieCeilingSatisfied === false) {
    warnings.push(
      "No se pudo respetar el techo calórico con los mínimos, múltiplos o unidades de los alimentos seleccionados."
    );
  }

  const variant = generateQuantityVariant(selection, objective, mode, opts);
  if (variant.requested && !variant.applied && variant.message) {
    warnings.push(variant.message);
  }

  const unusedSelected = selection.filter((item) => item.preferUse && item.cantidad <= EPS);
  for (const item of unusedSelected) {
    warnings.push(
      solve.trackingOptimization?.policy === TRACKING_CALORIE_FILL_POLICY
        ? `${item.nombre} no recibio cantidad porque no entra fisicamente bajo el techo calorico junto con la seleccion actual.`
        : `${item.nombre} no se incluyo porque empeoraba demasiado el objetivo con cantidades razonables.`
    );
  }

  return {
    ...buildResult(selection, objective, mode, warnings),
    optimizacionTracking: solve.trackingOptimization,
    variante: variant,
  };
}

function generarMenus(cantidad = 3, opts = {}) {
  const total = Math.max(1, toNumber(cantidad, 3));
  return Array.from({ length: total }, () => generarMenu(opts));
}

function generarMenusNoVacios(cantidad = 3, _intentosPorMenu = 8, opts = {}) {
  return generarMenus(cantidad, opts).filter((menu) =>
    menu.proteicos.length || menu.carbohidratos.length || menu.grasas.length
  );
}

export {
  generarMenu,
  generarMenus,
  generarMenusNoVacios,
  normalizeFood,
};

export default {
  generarMenu,
  generarMenus,
  generarMenusNoVacios,
  normalizeFood,
};
