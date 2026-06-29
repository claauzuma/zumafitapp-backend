import { ObjectId } from "mongodb";

import ModelMongoDBComidasGuardadas, { idValues } from "../model/DAO/comidasGuardadasMongoDB.js";
import ModelMongoDBAlimentos from "../model/DAO/alimentosMongoDB.js";
import ModelMongoDBUsuarios from "../model/DAO/usuariosMongoDB.js";
import ServicioFoodLogs from "./foodLogs.js";
import { requireQuota } from "./accessGates.js";
import {
  canAccessSavedMeal,
  canAssignSavedMeal,
  canCreateSavedMeal,
  canEditSavedMeal,
  getOwnerType,
  getSavedMealLimit,
  idToString,
  isAdmin,
  isClient,
  isCoach,
  normalizePlan,
  normalizeRole,
} from "./comidasGuardadasPermisos.js";

const MEAL_TYPES = new Set(["desayuno", "almuerzo", "merienda", "cena", "snack", "preEntreno", "postEntreno", "otro"]);
const VISIBILITIES = new Set(["privada", "asignada", "clientesAsignados", "gimnasio", "global", "premium"]);
const ORIGINS = new Set(["creadaManual", "guardadaDesdeMenu", "guardadaDesdeTracking", "plantillaCoach", "plantillaGym", "plantillaGlobal"]);

function cleanString(value = "", max = 1000) {
  if (value === null || value === undefined) return "";
  return String(value).slice(0, max).trim();
}

function normalizeToken(value = "", fallback = "") {
  const token = cleanString(value, 120)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return token || fallback;
}

function lowerToken(value = "", fallback = "") {
  return normalizeToken(value, fallback).toLowerCase();
}

function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  const raw = String(value).trim();
  const normalized = raw.includes(",") && raw.includes(".")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw.replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : fallback;
}

function round(value, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
}

function macro(value) {
  return round(Math.max(0, toNumber(value, 0)), 2);
}

function toMongoIdOrNull(value) {
  const id = cleanString(value, 80);
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

function cleanStringArray(value, maxItems = 24, maxLen = 80) {
  if (Array.isArray(value)) {
    return value.map((item) => cleanString(item, maxLen)).filter(Boolean).slice(0, maxItems);
  }
  if (typeof value === "string") {
    return value.split(",").map((item) => cleanString(item, maxLen)).filter(Boolean).slice(0, maxItems);
  }
  return [];
}

function normalizeMealType(value = "") {
  const raw = normalizeToken(value, "otro");
  const lowered = raw.toLowerCase();
  const aliases = {
    preentreno: "preEntreno",
    pre_entreno: "preEntreno",
    postentreno: "postEntreno",
    post_entreno: "postEntreno",
  };
  const normalized = aliases[lowered] || lowered;
  return MEAL_TYPES.has(normalized) ? normalized : "otro";
}

function trackingMealTypeFromSavedMeal(value = "") {
  const normalized = normalizeMealType(value);
  return ["desayuno", "almuerzo", "merienda", "cena", "snack"].includes(normalized) ? normalized : "snack";
}

function normalizeVisibility(value = "", fallback = "privada") {
  const raw = normalizeToken(value, fallback);
  const camel = raw === "clientes_asignados" ? "clientesAsignados" : raw;
  return VISIBILITIES.has(camel) ? camel : fallback;
}

function normalizeOrigin(value = "", fallback = "creadaManual") {
  const raw = normalizeToken(value, fallback);
  const camelMap = {
    creada_manual: "creadaManual",
    guardada_desde_menu: "guardadaDesdeMenu",
    guardada_desde_tracking: "guardadaDesdeTracking",
    plantilla_coach: "plantillaCoach",
    plantilla_gym: "plantillaGym",
    plantilla_global: "plantillaGlobal",
  };
  const normalized = camelMap[raw] || raw;
  return ORIGINS.has(normalized) ? normalized : fallback;
}

function normalizeUnit(unit = "") {
  return cleanString(unit, 40).toLowerCase().replace(".", "");
}

function looksLikeMacroPerGram(raw = {}) {
  if (raw?.perUnit === true || raw?.porUnidad === true) return true;
  const kcal = toNumber(raw.Calorias ?? raw.calorias ?? raw.kcal ?? raw.kcalUnidad, 0);
  const protein = toNumber(raw.Proteinas ?? raw.proteinas ?? raw.proteina ?? raw.protein ?? raw.proteinaUnidad, 0);
  const carbs = toNumber(raw.Carbohidratos ?? raw.carbohidratos ?? raw.carbs ?? raw.carbohidratosUnidad, 0);
  const fat = toNumber(raw.Grasas ?? raw.grasas ?? raw.fat ?? raw.grasasUnidad, 0);
  if (kcal <= 0 && protein <= 0 && carbs <= 0 && fat <= 0) return false;
  return kcal > 0 && kcal <= 15 && protein <= 5 && carbs <= 5 && fat <= 5;
}

function inferMacroBasis(unit = "", raw = {}) {
  const explicit = lowerToken(raw?.macroBasis || raw?.baseMacro || raw?.Base || raw?.base || raw?.por || raw?.Por);
  if (explicit.includes("100")) return "per100";
  if (explicit.includes("unidad") || explicit.includes("porcion") || explicit.includes("porci")) return "perUnit";

  const normalizedUnit = normalizeUnit(unit);
  if (["g", "gr", "gramo", "gramos", "ml"].includes(normalizedUnit)) {
    return looksLikeMacroPerGram(raw) ? "perUnit" : "per100";
  }
  return "perUnit";
}

function foodImageKey(value = "") {
  return cleanString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function placeholderForCategory(category = "") {
  const text = cleanString(category)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (/prote|carne|pollo|pescado|huevo|lacteo|queso|yogur/.test(text)) return "/images/placeholders/proteinas.jpeg";
  if (/carbo|cereal|pan|arroz|pasta|fideo|papa/.test(text)) return "/images/placeholders/carbohidratos.jpeg";
  if (/grasa|aceite|fruto seco|palta/.test(text)) return "/images/placeholders/grasas.jpeg";
  if (/fruta/.test(text)) return "/images/placeholders/frutas.jpeg";
  if (/verdura|vegetal/.test(text)) return "/images/placeholders/verduras.jpeg";
  return "/images/placeholders/default.jpeg";
}

function imageFromFood(raw = {}, name = "", category = "") {
  const image = raw?.imagen && typeof raw.imagen === "object" ? raw.imagen : {};
  const url =
    image.url ||
    image.urlExacta ||
    image.urlGenerica ||
    raw.imagenUrl ||
    raw.imagenUrlExacta ||
    raw.imagenUrlGenerica ||
    "";
  const exactKey = image.exactaKey || raw.imagenExactaKey || foodImageKey(name);
  return {
    imagenUrl: url || (exactKey ? `/images/foods/${exactKey}.jpeg` : placeholderForCategory(category)),
    imagenAlt: image.alt || raw.imagenAlt || name || "Alimento",
  };
}

function normalizeFoodDoc(raw = {}) {
  const name = raw.Alimentos || raw.alimentos || raw.nombre || raw.name || "Sin nombre";
  const unitRaw = cleanString(raw.Unidad || raw.unidad || raw.unit || raw.unidadBase, 40);
  const unitLower = unitRaw.toLowerCase();
  const unidad = unitLower.startsWith("gr") || unitLower === "g" ? "g" : unitRaw || "unidad";
  const categoria =
    cleanString(raw.Fuente || raw.fuente || raw.Categoria || raw.categoria || raw.categoriaZumaFit || raw.Grupo || raw.grupo, 120) ||
    "Otros";
  const image = imageFromFood(raw, name, categoria);

  return {
    _id: raw._id || null,
    alimentoId: raw.alimentoId || raw.id || raw._id || null,
    nombre: cleanString(name, 180) || "Sin nombre",
    unidad,
    kcal: macro(raw.Calorias ?? raw.calorias ?? raw.kcal ?? raw.calories ?? raw.kcalUnidad ?? raw.kcal100 ?? raw.kcal_100g_ml),
    proteinas: macro(raw.Proteinas ?? raw.proteinas ?? raw.proteina ?? raw.protein ?? raw.proteinaUnidad ?? raw.proteina100 ?? raw.proteina_100g_ml),
    carbohidratos: macro(raw.Carbohidratos ?? raw.carbohidratos ?? raw.carbs ?? raw.hidratos ?? raw.carbohidratosUnidad ?? raw.carbohidratos100 ?? raw.carbohidratos_100g_ml),
    grasas: macro(raw.Grasas ?? raw.grasas ?? raw.fat ?? raw.fats ?? raw.grasasUnidad ?? raw.grasas100 ?? raw.grasas_100g_ml),
    fibra: macro(raw.fibraUnidad ?? raw.fibra ?? raw.fibra100 ?? raw.fibra_100g_ml),
    categoria,
    macroBasis: raw.macroBasis || inferMacroBasis(unidad, raw),
    imagenUrl: image.imagenUrl,
    imagenAlt: image.imagenAlt,
    raw,
  };
}

function calculateFoodMacros(food = {}, cantidad = 100, unidad = food.unidad || "g") {
  const qty = toNumber(cantidad, 0);
  const sourceUnit = normalizeUnit(unidad || food.unidad);
  const basis = food.macroBasis || inferMacroBasis(food.unidad || unidad, food.raw || food);
  const shouldScaleBy100 = basis === "per100" && ["g", "gr", "gramo", "gramos", "ml"].includes(sourceUnit);
  const factor = qty > 0 ? (shouldScaleBy100 ? qty / 100 : qty) : 0;
  return {
    kcal: round(food.kcal * factor, 2),
    proteinas: round(food.proteinas * factor, 2),
    carbohidratos: round(food.carbohidratos * factor, 2),
    grasas: round(food.grasas * factor, 2),
    fibra: round(food.fibra * factor, 2),
  };
}

function snapshotFromExistingItem(raw = {}, index = 0) {
  const nombre = raw.nombre || raw.nombreSnapshot || raw.name || raw.alimento || `Alimento ${index + 1}`;
  const item = {
    alimentoId: raw.alimentoId ? idToString(raw.alimentoId) : "",
    alimentoObjectId: raw.alimentoObjectId || (ObjectId.isValid(idToString(raw.alimentoId)) ? new ObjectId(idToString(raw.alimentoId)) : null),
    nombre: cleanString(nombre, 180) || `Alimento ${index + 1}`,
    cantidad: macro(raw.cantidad ?? raw.quantity ?? raw.amount),
    unidad: cleanString(raw.unidad || raw.unit || "g", 40) || "g",
    kcal: macro(raw.kcal ?? raw.calorias ?? raw.calories),
    proteinas: macro(raw.proteinas ?? raw.proteina ?? raw.protein),
    proteina: macro(raw.proteina ?? raw.proteinas ?? raw.protein),
    carbohidratos: macro(raw.carbohidratos ?? raw.carbs ?? raw.carbohydrates),
    carbs: macro(raw.carbs ?? raw.carbohidratos ?? raw.carbohydrates),
    grasas: macro(raw.grasas ?? raw.fat ?? raw.fats),
    fibra: macro(raw.fibra),
    categoria: cleanString(raw.categoria || raw.categoriaSnapshot || raw.category || raw.fuente, 120),
    categoriaSnapshot: cleanString(raw.categoriaSnapshot || raw.categoria || raw.category || raw.fuente, 120),
    imagenUrl: cleanString(raw.imagenUrl || raw.imageUrl || raw.imagen?.url, 260),
    imagenAlt: cleanString(raw.imagenAlt || raw.imageAlt || raw.imagen?.alt || nombre, 180),
  };
  if (!item.imagenUrl) item.imagenUrl = placeholderForCategory(item.categoria);
  return item;
}

function totalsFromItems(items = []) {
  const totals = items.reduce(
    (acc, item) => ({
      kcal: acc.kcal + macro(item.kcal),
      proteinas: acc.proteinas + macro(item.proteinas ?? item.proteina),
      carbohidratos: acc.carbohidratos + macro(item.carbohidratos ?? item.carbs),
      grasas: acc.grasas + macro(item.grasas),
      fibra: acc.fibra + macro(item.fibra),
    }),
    { kcal: 0, proteinas: 0, carbohidratos: 0, grasas: 0, fibra: 0 }
  );
  return {
    kcal: round(totals.kcal, 2),
    proteinas: round(totals.proteinas, 2),
    proteina: round(totals.proteinas, 2),
    carbohidratos: round(totals.carbohidratos, 2),
    carbs: round(totals.carbohidratos, 2),
    grasas: round(totals.grasas, 2),
    fibra: round(totals.fibra, 2),
  };
}

function normalizeDoc(doc = null) {
  if (!doc) return null;
  const items = (Array.isArray(doc.items) ? doc.items : []).map(snapshotFromExistingItem);
  return {
    ...doc,
    id: idToString(doc._id || doc.id),
    _id: idToString(doc._id || doc.id),
    ownerId: doc.ownerId ? idToString(doc.ownerId) : null,
    creadaPorId: doc.creadaPorId ? idToString(doc.creadaPorId) : null,
    gimnasioId: doc.gimnasioId ? idToString(doc.gimnasioId) : null,
    profesionalId: doc.profesionalId ? idToString(doc.profesionalId) : null,
    asignadaA: (Array.isArray(doc.asignadaA) ? doc.asignadaA : []).map(idToString),
    items,
    totales: totalsFromItems(items),
    tags: Array.isArray(doc.tags) ? doc.tags : [],
    favorita: !!doc.favorita,
    activo: doc.activo !== false,
  };
}

class ServicioComidasGuardadas {
  constructor() {
    this.model = new ModelMongoDBComidasGuardadas();
    this.alimentosModel = new ModelMongoDBAlimentos();
    this.usuariosModel = new ModelMongoDBUsuarios();
    this.foodLogs = new ServicioFoodLogs();
  }

  async _actor(user) {
    const actorId = user?.targetUserId || user?.id || user?._id;
    if (!actorId) throw new Error("NO_AUTENTICADO");
    const actor = await this.usuariosModel.obtenerPorId(actorId);
    if (!actor) throw new Error("NO_AUTENTICADO");
    return actor;
  }

  _actorId(actor) {
    return idToString(actor?._id || actor?.id);
  }

  async _findFood(raw = {}) {
    const id = raw.alimentoId || raw.foodId || raw.id || raw._id;
    if (!id) return null;
    const found = await this.alimentosModel.obtenerAlimentoPorId(id);
    return found ? normalizeFoodDoc(found) : null;
  }

  async _snapshotItem(raw = {}, index = 0) {
    const cantidad = macro(raw.cantidad ?? raw.quantity ?? raw.amount);
    if (cantidad <= 0) throw new Error("CANTIDAD_INVALIDA");
    const dbFood = await this._findFood(raw);

    if (!dbFood) {
      const existing = snapshotFromExistingItem(raw, index);
      if (!existing.nombre || (!existing.kcal && !existing.proteinas && !existing.carbohidratos && !existing.grasas)) {
        throw new Error("ALIMENTO_NO_ENCONTRADO");
      }
      return existing;
    }

    const unidad = cleanString(raw.unidad || raw.unit || dbFood.unidad || "g", 40) || "g";
    const macros = calculateFoodMacros(dbFood, cantidad, unidad);
    return {
      alimentoId: idToString(dbFood.alimentoId),
      alimentoObjectId: toMongoIdOrNull(dbFood._id || dbFood.alimentoId),
      nombre: dbFood.nombre,
      cantidad,
      unidad,
      kcal: macros.kcal,
      proteinas: macros.proteinas,
      proteina: macros.proteinas,
      carbohidratos: macros.carbohidratos,
      carbs: macros.carbohidratos,
      grasas: macros.grasas,
      fibra: macros.fibra,
      categoria: dbFood.categoria,
      categoriaSnapshot: dbFood.categoria,
      imagenUrl: dbFood.imagenUrl,
      imagenAlt: dbFood.imagenAlt,
    };
  }

  async _normalizePayload(actor, payload = {}, context = {}) {
    const rawItems = Array.isArray(payload.items)
      ? payload.items
      : Array.isArray(payload.alimentos)
        ? payload.alimentos
        : [];
    if (!rawItems.length) throw new Error("ITEMS_INVALIDOS");

    const items = [];
    for (let index = 0; index < rawItems.slice(0, 80).length; index += 1) {
      items.push(await this._snapshotItem(rawItems[index], index));
    }

    const role = normalizeRole(actor);
    const ownerType = context.ownerType || getOwnerType(actor);
    const defaultVisibility =
      context.defaultVisibility ||
      (role === "admin" ? "global" : role === "coach" ? "clientesAsignados" : "privada");
    const forcedVisibility = role === "cliente" ? "privada" : null;
    const visibilidad = forcedVisibility || normalizeVisibility(payload.visibilidad || payload.visibility, defaultVisibility);
    const origen = normalizeOrigin(payload.origen || payload.origin, context.origen || "creadaManual");

    return {
      nombre: cleanString(payload.nombre || payload.name, 180) || "Comida sin nombre",
      descripcion: cleanString(payload.descripcion || payload.description, 2500),
      tipoComida: normalizeMealType(payload.tipoComida || payload.type || "otro"),
      items,
      totales: totalsFromItems(items),
      tags: cleanStringArray(payload.tags, 24, 80),
      favorita: !!payload.favorita,
      ownerId: context.ownerId || this._actorId(actor),
      ownerRole: role,
      ownerType,
      creadaPorId: context.creadaPorId || this._actorId(actor),
      creadaPorRol: role,
      visibilidad,
      asignadaA: Array.isArray(payload.asignadaA) ? payload.asignadaA : [],
      gimnasioId: payload.gimnasioId || context.gimnasioId || null,
      profesionalId: payload.profesionalId || (role === "coach" ? this._actorId(actor) : null),
      origen,
      planMinimo: cleanString(payload.planMinimo || (visibilidad === "premium" ? "pro" : "free"), 40),
      activo: payload.activo !== false,
    };
  }

  _visibilityQuery(actor, scope = "all") {
    const actorId = this._actorId(actor);
    const active = { activo: { $ne: false } };
    if (isAdmin(actor)) return active;

    const own = { ownerId: { $in: idValues(actorId) } };
    const assigned = {
      $or: [
        { asignadaA: { $in: idValues(actorId) } },
        { "asignadaA.clienteId": { $in: idValues(actorId) } },
      ],
    };
    const plan = normalizePlan(actor);
    const publicVisibilities =
      plan === "vip" || ["coach", "nutri", "trainernutri", "trainer_nutri", "gym", "admin"].includes(plan)
        ? ["global", "premium"]
        : plan === "pro"
          ? ["global"]
          : ["global"];

    if (scope === "mine") return { $and: [active, own] };
    if (scope === "assigned" || scope === "coach") return { $and: [active, assigned] };
    if (scope === "templates" && isCoach(actor)) return { $and: [active, own] };

    const access = [own, assigned, { visibilidad: { $in: publicVisibilities } }];
    if (isCoach(actor)) access.push({ visibilidad: { $in: ["gimnasio", "solo_coaches"] } });
    if (!isCoach(actor) && normalizePlan(actor) === "vip") access.push({ visibilidad: "solo_clientes" });
    return { $and: [active, { $or: access }] };
  }

  async list(user, filters = {}) {
    const actor = await this._actor(user);
    const scope = String(filters.scope || "all");
    const data = await this.model.list({
      ...filters,
      query: this._visibilityQuery(actor, scope),
    });
    const comidas = data.items.map(normalizeDoc).filter((meal) => canAccessSavedMeal(actor, meal));
    return {
      comidas,
      total: data.total,
      limit: data.limit,
      skip: data.skip,
      permissions: {
        limit: getSavedMealLimit(actor),
      },
    };
  }

  async listProfessionalTemplates(user, filters = {}) {
    const actor = await this._actor(user);
    if (!isCoach(actor) && !isAdmin(actor)) throw new Error("FORBIDDEN");
    return await this.list({ id: this._actorId(actor) }, { ...filters, scope: "templates" });
  }

  async listAdminGlobal(user, filters = {}) {
    const actor = await this._actor(user);
    if (!isAdmin(actor)) throw new Error("FORBIDDEN");
    const data = await this.model.list({
      ...filters,
      query: {
        activo: { $ne: false },
        visibilidad: { $in: ["global", "premium"] },
      },
    });
    return { ...data, comidas: data.items.map(normalizeDoc), items: undefined };
  }

  async getById(user, id) {
    const actor = await this._actor(user);
    const comida = normalizeDoc(await this.model.getById(id));
    if (!comida) return null;
    if (!canAccessSavedMeal(actor, comida)) throw new Error("FORBIDDEN");
    return comida;
  }

  async create(user, payload = {}, context = {}) {
    const actor = await this._actor(user);
    const ownCount = await this.model.count({
      query: {
        ownerId: { $in: idValues(this._actorId(actor)) },
        activo: { $ne: false },
      },
    });
    if (isClient(actor)) {
      requireQuota(actor, "ownMeals", ownCount);
    } else if (!canCreateSavedMeal(actor, ownCount)) {
      throw new Error("SAVED_MEAL_LIMIT");
    }
    const doc = await this._normalizePayload(actor, payload, context);
    return normalizeDoc(await this.model.create(doc));
  }

  async createProfessionalTemplate(user, payload = {}) {
    const actor = await this._actor(user);
    if (!isCoach(actor) && !isAdmin(actor)) throw new Error("FORBIDDEN");
    return await this.create({ id: this._actorId(actor) }, payload, {
      ownerType: isAdmin(actor) ? "admin" : "coach",
      ownerId: this._actorId(actor),
      defaultVisibility: isAdmin(actor) ? "global" : "clientesAsignados",
      origen: isAdmin(actor) ? "plantillaGlobal" : "plantillaCoach",
    });
  }

  async createAdminGlobal(user, payload = {}) {
    const actor = await this._actor(user);
    if (!isAdmin(actor)) throw new Error("FORBIDDEN");
    return await this.create({ id: this._actorId(actor) }, payload, {
      ownerType: "admin",
      ownerId: this._actorId(actor),
      defaultVisibility: normalizeVisibility(payload.visibilidad, "global"),
      origen: "plantillaGlobal",
    });
  }

  async update(user, id, payload = {}) {
    const actor = await this._actor(user);
    const current = normalizeDoc(await this.model.getById(id));
    if (!current) throw new Error("NOT_FOUND");
    if (!canEditSavedMeal(actor, current)) throw new Error(isClient(actor) ? "COPY_REQUIRED" : "FORBIDDEN");

    const patch = await this._normalizePayload(actor, { ...current, ...payload }, {
      ownerType: current.ownerType || getOwnerType(actor),
      ownerId: current.ownerId || this._actorId(actor),
      creadaPorId: current.creadaPorId || this._actorId(actor),
      defaultVisibility: current.visibilidad || "privada",
      origen: current.origen || "creadaManual",
    });
    return normalizeDoc(await this.model.updateById(id, patch));
  }

  async remove(user, id) {
    const actor = await this._actor(user);
    const current = normalizeDoc(await this.model.getById(id));
    if (!current) return { deletedCount: 0 };
    if (!canEditSavedMeal(actor, current)) throw new Error("FORBIDDEN");
    return await this.model.deleteById(id);
  }

  async duplicate(user, id, payload = {}) {
    const actor = await this._actor(user);
    const current = normalizeDoc(await this.model.getById(id));
    if (!current) throw new Error("NOT_FOUND");
    if (!canAccessSavedMeal(actor, current)) throw new Error("FORBIDDEN");
    const role = normalizeRole(actor);
    return await this.create({ id: this._actorId(actor) }, {
      ...current,
      ...payload,
      nombre: cleanString(payload.nombre || `Copia de ${current.nombre}`, 180),
      items: current.items,
      favorita: !!payload.favorita,
      visibilidad: role === "admin" ? payload.visibilidad || current.visibilidad : role === "coach" ? payload.visibilidad || "clientesAsignados" : "privada",
      asignadaA: [],
      origen: payload.origen || "creadaManual",
    }, {
      ownerType: getOwnerType(actor),
      ownerId: this._actorId(actor),
      defaultVisibility: role === "admin" ? "global" : role === "coach" ? "clientesAsignados" : "privada",
    });
  }

  async toggleFavorite(user, id, favorita = null) {
    const actor = await this._actor(user);
    const current = normalizeDoc(await this.model.getById(id));
    if (!current) throw new Error("NOT_FOUND");
    if (!canEditSavedMeal(actor, current)) throw new Error("COPY_REQUIRED");
    const next = favorita === null ? !current.favorita : !!favorita;
    if (isClient(actor) && next && !current.favorita) {
      const currentFavorites = await this.model.count({
        query: {
          ownerId: { $in: idValues(this._actorId(actor)) },
          favorita: true,
          activo: { $ne: false },
        },
      });
      requireQuota(actor, "favorites", currentFavorites);
    }
    return normalizeDoc(await this.model.updateById(id, { favorita: next }));
  }

  async assign(user, id, clientIds = []) {
    const actor = await this._actor(user);
    const current = normalizeDoc(await this.model.getById(id));
    if (!current) throw new Error("NOT_FOUND");
    if (!canAssignSavedMeal(actor, current)) throw new Error("FORBIDDEN");
    const ids = Array.isArray(clientIds) ? clientIds : [clientIds];
    if (!ids.length) throw new Error("CLIENTES_REQUERIDOS");

    for (const clientId of ids) {
      const client = await this.usuariosModel.obtenerPorId(clientId);
      if (!client || normalizeRole(client) !== "cliente") throw new Error("CLIENTE_INVALIDO");
      if (isCoach(actor) && idToString(client?.coach?.entrenadorId) !== this._actorId(actor)) {
        throw new Error("CLIENT_NOT_ASSIGNED_TO_COACH");
      }
    }

    return normalizeDoc(await this.model.assignToClients(id, ids));
  }

  async listAssignedToClient(user, clientId, filters = {}) {
    const actor = await this._actor(user);
    const client = await this.usuariosModel.obtenerPorId(clientId);
    if (!client || normalizeRole(client) !== "cliente") throw new Error("CLIENTE_INVALIDO");
    if (isCoach(actor) && idToString(client?.coach?.entrenadorId) !== this._actorId(actor)) {
      throw new Error("CLIENT_NOT_ASSIGNED_TO_COACH");
    }
    if (!isCoach(actor) && !isAdmin(actor)) throw new Error("FORBIDDEN");

    const query = isAdmin(actor)
      ? { asignadaA: { $in: idValues(clientId) }, activo: { $ne: false } }
      : {
          asignadaA: { $in: idValues(clientId) },
          ownerId: { $in: idValues(this._actorId(actor)) },
          activo: { $ne: false },
        };
    const data = await this.model.list({ ...filters, query });
    return { comidas: data.items.map(normalizeDoc), total: data.total, limit: data.limit, skip: data.skip };
  }

  async addToTracking(user, id, payload = {}) {
    const actor = await this._actor(user);
    if (!isClient(actor)) throw new Error("FORBIDDEN");
    const comida = normalizeDoc(await this.model.getById(id));
    if (!comida) throw new Error("NOT_FOUND");
    if (!canAccessSavedMeal(actor, comida)) throw new Error("FORBIDDEN");
    const mealType = trackingMealTypeFromSavedMeal(payload.mealType || payload.tipoComida || comida.tipoComida || "snack");
    return await this.foodLogs.addSnapshotLogs({ id: this._actorId(actor) }, {
      date: payload.date,
      mealType,
      items: comida.items,
      savedMealId: comida.id,
      savedMealName: comida.nombre,
      source: "saved_meal",
    });
  }
}

export default ServicioComidasGuardadas;
