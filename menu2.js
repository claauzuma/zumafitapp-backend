// Motor de generacion de cantidades para comidas.
// Trabaja con alimentos por gramo y soporta:
// - Cantidades fijas.
// - Cantidades pendientes.
// - Modo full: ajustar kcal + proteina + carbos + grasas.
// - Modo kcalProteina: ajustar kcal + proteina y dejar carbos/grasas flexibles.
// La salida conserva proteicos/carbohidratos/grasas para compatibilidad.

const EPS = 1e-9;
const MAX_FOODS_PER_GROUP = 5;
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

  let calorias = toNumber(firstValue(raw, ["calorias", "kcal", "Calorias", "Kcal", "calories"]));
  let proteina = toNumber(firstValue(raw, ["proteina", "proteinas", "Proteinas", "Proteina", "protein"]));
  let carbohidratos = toNumber(firstValue(raw, [
    "carbohidratos",
    "carbs",
    "Carbohidratos",
    "Hidratos",
    "carbohydrates",
  ]));
  let grasas = toNumber(firstValue(raw, ["grasas", "grasa", "Grasas", "fat", "fats"]));

  // Si vienen valores por 100 g, los bajamos a valor por gramo.
  // Si ya vienen por gramo, los dejamos como estan.
  const looksPer100g = calorias > 20 || proteina > 5 || carbohidratos > 5 || grasas > 5;
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
    id: raw._id || raw.id || raw.alimentoId || null,
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
  const map = new Map();
  for (const raw of [...INTERNAL_FOODS, ...(Array.isArray(extraFoods) ? extraFoods : [])]) {
    const food = normalizeFood(raw);
    if (!food) continue;
    map.set(normalizeName(food.nombre), food);
  }
  return map;
}

function getFood(index, item, fallbackGroup) {
  const direct = normalizeFood(item, fallbackGroup);
  const fromIndex = index.get(normalizeName(item?.nombre || item?.name || item?.Alimentos));
  if (fromIndex) return { ...fromIndex, categoria: fallbackGroup || fromIndex.categoria };
  if (direct && direct.calorias > 0) return { ...direct, categoria: fallbackGroup || direct.categoria };
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
  const errors = validateFixedExcess(fixedTotals, objective, mode);

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

  const lowerBounds = pending.map((item) => minimumAllowedQuantity(item));
  const baselineTotals = { ...fixedTotals };
  for (let i = 0; i < pending.length; i++) {
    addTotals(baselineTotals, foodVector(pending[i].food), lowerBounds[i]);
  }

  const residualItems = pending.map((item, index) => ({
    ...item,
    minGramos: 0,
    maxQuantityOverride: Math.max(0, maxQuantityFor(item) - lowerBounds[index]),
    preferUse: false,
  }));
  const residualQuantities = solveNonNegativeLeastSquares(residualItems, objective, baselineTotals, mode, opts);

  for (let i = 0; i < pending.length; i++) {
    pending[i].cantidad = round(
      Math.min(lowerBounds[i] + Math.max(residualQuantities[i] || 0, 0), maxQuantityFor(pending[i])),
      2
    );
  }

  if (opts.redondear !== false && opts.roundQuantities !== false) {
    roundAndPolishQuantities(selection, pending, objective, mode);
  }

  const totals = calculateTotals(selection);
  const minimumKcalExcess = baselineTotals.calorias - objective.calorias;
  return {
    ok: true,
    fixedTotals,
    totals,
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
    nombre: item.nombre,
    cantidad: q,
    fixedQuantity: item.fixed,
    quantityPending: false,
    calorias: round(item.food.calorias * q, 2),
    proteina: round(item.food.proteina * q, 2),
    carbohidratos: round(item.food.carbohidratos * q, 2),
    grasas: round(item.food.grasas * q, 2),
    maxGramos: maxQuantityFor(item),
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
    return buildResult(selection, objective, mode, warnings, solve.errors);
  }

  if (solve.minimumsWarning) warnings.push(solve.minimumsWarning);

  const variant = generateQuantityVariant(selection, objective, mode, opts);
  if (variant.requested && !variant.applied && variant.message) {
    warnings.push(variant.message);
  }

  const unusedSelected = selection.filter((item) => item.preferUse && item.cantidad <= EPS);
  for (const item of unusedSelected) {
    warnings.push(`${item.nombre} no se incluyo porque empeoraba demasiado el objetivo con cantidades razonables.`);
  }

  return {
    ...buildResult(selection, objective, mode, warnings),
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
