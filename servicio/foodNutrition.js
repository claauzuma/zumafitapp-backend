const MASS_VOLUME_UNITS = new Set([
  "g",
  "gr",
  "grs",
  "gramo",
  "gramos",
  "ml",
  "mililitro",
  "mililitros",
]);

function cleanToken(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function number(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  const text = String(value).trim();
  const normalized = text.includes(",") && text.includes(".")
    ? text.replace(/\./g, "").replace(",", ".")
    : text.replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function hasOwnValue(raw = {}, fields = []) {
  return fields.some((field) => (
    Object.prototype.hasOwnProperty.call(raw, field) &&
    raw[field] !== null &&
    raw[field] !== undefined &&
    raw[field] !== ""
  ));
}

function firstValue(raw = {}, fields = [], fallback = 0) {
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(raw, field)) continue;
    const value = raw[field];
    if (value === null || value === undefined || value === "") continue;
    return number(value, fallback);
  }
  return fallback;
}

const LEGACY_FIELDS = Object.freeze({
  kcal: ["Calorias", "calorias", "kcal", "calories", "kcalUnidad", "kcalPerUnitOrGram", "kcalPerGram", "kcalPerUnit"],
  proteina: ["Proteinas", "proteinas", "proteina", "protein", "proteinaUnidad", "proteinPerUnitOrGram", "proteinaPerUnitOrGram", "proteinPerGram", "proteinPerUnit"],
  carbs: ["Carbohidratos", "carbohidratos", "carbs", "carbohydrates", "hidratos", "carbohidratosUnidad", "carbsPerUnitOrGram", "carbsPerGram", "carbsPerUnit"],
  grasas: ["Grasas", "grasas", "fat", "fats", "grasasUnidad", "fatPerUnitOrGram", "grasasPerUnitOrGram", "fatPerGram", "fatPerUnit"],
  fibra: ["Fibra", "fibra", "fibraUnidad"],
});

const PER100_FIELDS = Object.freeze({
  kcal: ["kcal100", "kcal_100g_ml"],
  proteina: ["proteina100", "proteina_100g_ml"],
  carbs: ["carbohidratos100", "carbohidratos_100g_ml"],
  grasas: ["grasas100", "grasas_100g_ml"],
  fibra: ["fibra100", "fibra_100g_ml"],
});

export function normalizeFoodUnit(unit = "") {
  const token = cleanToken(unit);
  if (["g", "gr", "grs", "gramo", "gramos"].includes(token)) return "g";
  if (["ml", "mililitro", "mililitros"].includes(token)) return "ml";
  return String(unit || "unidad").trim() || "unidad";
}

export function isMassVolumeFoodUnit(unit = "") {
  return MASS_VOLUME_UNITS.has(cleanToken(unit));
}

function looksLikePerGram(raw = {}) {
  if (raw.perUnit === true || raw.porUnidad === true) return true;
  const kcal = firstValue(raw, LEGACY_FIELDS.kcal);
  const protein = firstValue(raw, LEGACY_FIELDS.proteina);
  const carbs = firstValue(raw, LEGACY_FIELDS.carbs);
  const fat = firstValue(raw, LEGACY_FIELDS.grasas);
  if (kcal <= 0 && protein <= 0 && carbs <= 0 && fat <= 0) return false;
  return kcal > 0 && kcal <= 15 && protein <= 5 && carbs <= 5 && fat <= 5;
}

export function inferFoodMacroBasis(unit = "", raw = {}) {
  const explicit = cleanToken(
    raw.macroBasis || raw.macroBase || raw.nutritionBasis || raw.baseMacro ||
    raw.Base || raw.base || raw.por || raw.Por
  );
  if (["per100", "per100g", "per100ml", "por100", "100g", "100ml"].includes(explicit) || explicit.includes("100")) {
    return "per100";
  }
  if (["pergram", "porgramo", "gram"].includes(explicit)) return "perGram";
  if (
    ["perunit", "porunidad", "unit", "unidad", "porcion", "porporcion"].includes(explicit) ||
    explicit.includes("unidad") ||
    explicit.includes("porcion")
  ) {
    return "perUnit";
  }

  if (!isMassVolumeFoodUnit(unit)) return "perUnit";
  if (Object.values(PER100_FIELDS).some((fields) => hasOwnValue(raw, fields)) &&
      !Object.values(LEGACY_FIELDS).some((fields) => hasOwnValue(raw, fields))) {
    return "per100";
  }
  return looksLikePerGram(raw) ? "perUnit" : "per100";
}

export function catalogFoodNutrition(raw = {}, unit = "") {
  const macroBasis = inferFoodMacroBasis(unit, raw);
  const legacyAvailable = Object.values(LEGACY_FIELDS).some((fields) => hasOwnValue(raw, fields));
  const per100Available = Object.values(PER100_FIELDS).some((fields) => hasOwnValue(raw, fields));
  const usePer100Fields = macroBasis === "per100" && per100Available;
  const fields = usePer100Fields || !legacyAvailable ? PER100_FIELDS : LEGACY_FIELDS;
  const effectiveBasis = fields === PER100_FIELDS && isMassVolumeFoodUnit(unit) ? "per100" : macroBasis;
  const valueFor = (field) => {
    if (hasOwnValue(raw, fields[field])) return firstValue(raw, fields[field]);
    const fallbackFields = fields === PER100_FIELDS ? LEGACY_FIELDS[field] : PER100_FIELDS[field];
    return firstValue(raw, fallbackFields);
  };

  return {
    kcal: Math.max(0, valueFor("kcal")),
    proteina: Math.max(0, valueFor("proteina")),
    carbs: Math.max(0, valueFor("carbs")),
    grasas: Math.max(0, valueFor("grasas")),
    fibra: Math.max(0, valueFor("fibra")),
    macroBasis: effectiveBasis,
  };
}

export function calculateCatalogFoodNutrition(food = {}, cantidad = 0, unit = "") {
  const qty = Math.max(0, number(cantidad, 0));
  const basis = food.macroBasis || inferFoodMacroBasis(unit, food.raw || food);
  const factor = basis === "per100" && isMassVolumeFoodUnit(unit) ? qty / 100 : qty;
  const round = (value) => Math.round(number(value, 0) * factor * 10) / 10;
  return {
    kcal: round(food.kcal),
    proteina: round(food.proteina ?? food.protein ?? food.proteinas),
    carbs: round(food.carbs ?? food.carbohidratos),
    grasas: round(food.grasas ?? food.fat),
    fibra: round(food.fibra),
  };
}

