import CnxMongoDB from "../model/DBMongo.js";
import ModelMongoDBAlimentos, { ALIMENTOS_COLLECTION } from "../model/DAO/alimentosMongoDB.js";
import {
  defaultFoodGeneration,
  normalizeFoodGenerationForRead,
  validateFoodGenerationPatch,
} from "./foodGenerationMetadata.js";

const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 100;
const MAX_SEARCH_LENGTH = 120;

function cleanText(value = "") {
  return String(value || "").trim();
}

function safePositiveInteger(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function escapeRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeAdminFoodParams(params = {}) {
  const allowedStatuses = new Set(["todos", "activos", "inactivos", "revision", "duplicados"]);
  const allowedSorts = new Set(["nombre_asc", "nombre_desc", "kcal_desc", "proteina_desc", "recientes"]);
  const status = cleanText(params.status || params.estado || "todos").toLowerCase();
  const sort = cleanText(params.sort || "nombre_asc").toLowerCase();
  const allowedModes = new Set(["todos", "EXPLICIT_ONLY", "GENERIC", "DISABLED"]);
  const allowedRoles = new Set(["todos", "P1", "P2", "C1", "C2", "V", "F", "G"]);
  const allowedMealTypes = new Set(["todos", "breakfast", "lunch", "snack", "dinner", "extraSnack"]);
  const modeRaw = cleanText(params.mode || "todos");
  const roleRaw = cleanText(params.role || "todos");
  const mealTypeRaw = cleanText(params.mealType || params.momento || "todos");

  return {
    page: safePositiveInteger(params.page, 1),
    limit: safePositiveInteger(params.limit, DEFAULT_LIMIT, MAX_LIMIT),
    search: cleanText(params.search || params.q).slice(0, MAX_SEARCH_LENGTH),
    category: cleanText(params.category || params.categoria || "todos"),
    unit: cleanText(params.unit || params.unidad || "todos"),
    status: allowedStatuses.has(status) ? status : "todos",
    sort: allowedSorts.has(sort) ? sort : "nombre_asc",
    mode: allowedModes.has(modeRaw) ? modeRaw : "todos",
    role: allowedRoles.has(roleRaw) ? roleRaw : "todos",
    mealType: allowedMealTypes.has(mealTypeRaw) ? mealTypeRaw : "todos",
  };
}

export function buildAdminFoodQuery(params = {}) {
  const filters = normalizeAdminFoodParams(params);
  const clauses = [];

  if (filters.search) {
    const regex = new RegExp(escapeRegex(filters.search), "i");
    clauses.push({
      $or: [
        { Alimentos: regex },
        { alimentos: regex },
        { nombre: regex },
        { name: regex },
        { Categoria: regex },
        { categoria: regex },
        { categoriaZumaFit: regex },
        { Fuente: regex },
        { fuente: regex },
        { subcategoria: regex },
        { tags: regex },
      ],
    });
  }

  if (filters.category && filters.category.toLowerCase() !== "todos") {
    const category = new RegExp(`^${escapeRegex(filters.category)}$`, "i");
    clauses.push({
      $or: [
        { Categoria: category },
        { categoria: category },
        { categoriaZumaFit: category },
        { Fuente: category },
        { fuente: category },
      ],
    });
  }

  if (filters.unit && filters.unit.toLowerCase() !== "todos") {
    const unit = new RegExp(`^${escapeRegex(filters.unit)}$`, "i");
    clauses.push({ $or: [{ Unidad: unit }, { unidad: unit }, { unidadBase: unit }] });
  }

  if (filters.status === "activos") clauses.push({ activo: { $ne: false } });
  if (filters.status === "inactivos") clauses.push({ activo: false });
  if (filters.status === "revision") clauses.push({ requiereRevision: true });
  if (filters.status === "duplicados") clauses.push({ duplicadoNombreUnidad: true });

  if (filters.mode === "EXPLICIT_ONLY") {
    clauses.push({ "generation.mode": { $nin: ["GENERIC", "DISABLED"] } });
  } else if (filters.mode !== "todos") {
    clauses.push({ "generation.mode": filters.mode });
  }
  if (filters.role !== "todos") clauses.push({ [`generation.roles.${filters.role}`]: true });
  if (filters.mealType !== "todos") clauses.push({ [`generation.mealTypes.${filters.mealType}`]: true });

  if (!clauses.length) return {};
  if (clauses.length === 1) return clauses[0];
  return { $and: clauses };
}

function sortFor(value = "nombre_asc") {
  if (value === "nombre_desc") return { Alimentos: -1, nombre: -1, _id: -1 };
  if (value === "kcal_desc") return { kcalUnidad: -1, Calorias: -1, _id: -1 };
  if (value === "proteina_desc") return { proteinaUnidad: -1, Proteinas: -1, _id: -1 };
  if (value === "recientes") return { updatedAt: -1, _id: -1 };
  return { Alimentos: 1, nombre: 1, _id: 1 };
}

function uniqueSorted(values = []) {
  const unique = new Map();
  values.map(cleanText).filter(Boolean).forEach((value) => {
    const key = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (!unique.has(key)) unique.set(key, value);
  });
  return [...unique.values()].sort((a, b) =>
    a.localeCompare(b, "es", { sensitivity: "base" })
  );
}

function dbOrThrow() {
  if (!CnxMongoDB.connection || !CnxMongoDB.db) {
    const error = new Error("DATABASE_NOT_AVAILABLE");
    error.code = "DATABASE_NOT_AVAILABLE";
    throw error;
  }
  return CnxMongoDB.db;
}

function serviceError(code, message, field = null) {
  const error = new Error(message);
  error.code = code;
  if (field) error.field = field;
  return error;
}

function foodForAdmin(document) {
  if (!document) return null;
  return {
    ...document,
    generation: normalizeFoodGenerationForRead(document.generation),
    generationPersisted: !!document.generation,
  };
}

function requiredText(value, field) {
  const result = cleanText(value);
  if (!result) throw serviceError("INVALID_FOOD", `${field} es obligatorio.`, field);
  return result;
}

function nonNegativeNumber(value, field) {
  if (value === "" || value === null || value === undefined) {
    throw serviceError("INVALID_FOOD", `${field} es obligatorio.`, field);
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw serviceError("INVALID_FOOD", `${field} debe ser un numero mayor o igual a 0.`, field);
  }
  return number;
}

function normalizedIdentity(value = "") {
  return cleanText(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function createFoodDocument(payload, existing = []) {
  const allowed = ["name", "category", "unit", "quantity", "kcal", "protein", "carbs", "fat", "active", "generation"];
  const unknown = Object.keys(payload || {}).filter((key) => !allowed.includes(key));
  if (unknown.length) {
    throw serviceError("INVALID_FOOD", `Campos no permitidos: ${unknown.join(", ")}.`);
  }

  const name = requiredText(payload?.name, "name");
  const category = cleanText(payload?.category);
  const unit = requiredText(payload?.unit, "unit");
  const quantity = nonNegativeNumber(payload?.quantity ?? 1, "quantity");
  if (quantity <= 0) throw serviceError("INVALID_FOOD", "quantity debe ser mayor a 0.", "quantity");
  const kcal = nonNegativeNumber(payload?.kcal, "kcal");
  const protein = nonNegativeNumber(payload?.protein, "protein");
  const carbs = nonNegativeNumber(payload?.carbs, "carbs");
  const fat = nonNegativeNumber(payload?.fat, "fat");
  if (payload?.active !== undefined && typeof payload.active !== "boolean") {
    throw serviceError("INVALID_FOOD", "active debe ser booleano.", "active");
  }

  const duplicate = existing.some((food) => {
    const existingName = food?.Alimentos ?? food?.alimentos ?? food?.nombre ?? food?.name;
    const existingUnit = food?.Unidad ?? food?.unidad ?? food?.unidadBase;
    return normalizedIdentity(existingName) === normalizedIdentity(name) &&
      normalizedIdentity(existingUnit) === normalizedIdentity(unit);
  });
  if (duplicate) {
    throw serviceError("FOOD_ALREADY_EXISTS", "Ya existe un alimento con el mismo nombre y unidad.");
  }

  const generation = payload?.generation === undefined
    ? defaultFoodGeneration()
    : validateFoodGenerationPatch(payload.generation);
  const numericIds = existing.map((food) => Number(food?.alimentoId)).filter(Number.isFinite);
  const alimentoId = (numericIds.length ? Math.max(...numericIds) : 0) + 1;
  const now = new Date();
  const nameKey = normalizedIdentity(name);

  return {
    alimentoId,
    Alimentos: name,
    nombre: name,
    name,
    nombreKey: nameKey,
    claveNormalizada: nameKey,
    Categoria: category,
    categoria: category,
    categoriaZumaFit: category,
    Unidad: unit,
    unidad: unit,
    unidadBase: unit,
    Cantidad: quantity,
    cantidadUnidad: quantity,
    Calorias: kcal,
    calorias: kcal,
    kcalUnidad: kcal,
    Proteinas: protein,
    proteina: protein,
    proteinas: protein,
    proteinaUnidad: protein,
    Carbohidratos: carbs,
    carbohidratos: carbs,
    carbohidratosUnidad: carbs,
    Grasas: fat,
    grasas: fat,
    grasasUnidad: fat,
    activo: payload?.active !== false,
    generation,
    createdAt: now,
    updatedAt: now,
  };
}

export default class ServicioAdminFoods {
  constructor({ model = new ModelMongoDBAlimentos() } = {}) {
    this.model = model;
  }

  async listar(params = {}) {
    const filters = normalizeAdminFoodParams(params);
    const collection = dbOrThrow().collection(ALIMENTOS_COLLECTION);
    const query = buildAdminFoodQuery(filters);
    const skip = (filters.page - 1) * filters.limit;

    const categoryFields = ["Categoria", "categoria", "categoriaZumaFit", "Fuente", "fuente"];
    const unitFields = ["Unidad", "unidad", "unidadBase"];

    const [
      total,
      filtered,
      active,
      inactive,
      review,
      duplicates,
      documents,
      categoryValues,
      unitValues,
    ] = await Promise.all([
      collection.countDocuments({}, { maxTimeMS: 5000 }),
      collection.countDocuments(query, { maxTimeMS: 5000 }),
      collection.countDocuments({ activo: { $ne: false } }, { maxTimeMS: 5000 }),
      collection.countDocuments({ activo: false }, { maxTimeMS: 5000 }),
      collection.countDocuments({ requiereRevision: true }, { maxTimeMS: 5000 }),
      collection.countDocuments({ duplicadoNombreUnidad: true }, { maxTimeMS: 5000 }),
      collection
        .find(query)
        .collation({ locale: "es", strength: 1 })
        .sort(sortFor(filters.sort))
        .skip(skip)
        .limit(filters.limit)
        .maxTimeMS(5000)
        .toArray(),
      Promise.all(categoryFields.map((field) => collection.distinct(field).catch(() => []))),
      Promise.all(unitFields.map((field) => collection.distinct(field).catch(() => []))),
    ]);

    const totalPages = Math.max(1, Math.ceil(filtered / filters.limit));
    return {
      collection: ALIMENTOS_COLLECTION,
      page: Math.min(filters.page, totalPages),
      limit: filters.limit,
      total: filtered,
      totalPages,
      documents: documents.map(foodForAdmin),
      summary: { total, filtered, active, inactive, review, duplicates },
      facets: {
        categories: uniqueSorted(categoryValues.flat()),
        units: uniqueSorted(unitValues.flat()),
      },
    };
  }

  async actualizarGeneration(foodId, patch = {}) {
    const current = await this.model.obtenerAlimentoPorId(foodId);
    if (!current) throw serviceError("FOOD_NOT_FOUND", "El alimento no existe.");
    const generation = validateFoodGenerationPatch(patch, current.generation);
    const updated = await this.model.actualizarGenerationPorId(foodId, generation);
    if (!updated) throw serviceError("FOOD_NOT_FOUND", "El alimento no existe.");
    return foodForAdmin(updated);
  }

  async crear(payload = {}) {
    const existing = await this.model.obtenerAlimentos();
    const document = createFoodDocument(payload, existing);
    return foodForAdmin(await this.model.crearAlimento(document));
  }
}

export { createFoodDocument, foodForAdmin };
