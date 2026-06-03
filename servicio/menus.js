import { ObjectId } from "mongodb";

import ModelMongoDBMenus from "../model/DAO/menusMongoDB.js";
import ModelMongoDBUsuarios from "../model/DAO/usuariosMongoDB.js";
import ModelMongoDBCoachPlanConfigs from "../model/DAO/coachPlanConfigsMongoDB.js";
import ModelMongoDBAlimentos from "../model/DAO/alimentosMongoDB.js";
import {
  normalizeCoachPlanCode,
  normalizePlanConfig,
  resolveEffectiveCoachCapabilities,
} from "./coachPlans.js";

const MENU_OBJECTIVES = new Set([
  "definicion",
  "recomposicion",
  "mantenimiento",
  "volumen",
  "rendimiento",
  "salud",
]);

const BASE_VISIBILITY = new Set(["sistema", "publica", "privada"]);
const BASE_STATUS = new Set(["activo", "inactivo"]);
const ASSIGNED_STATUS = new Set(["activo", "pausado", "finalizado"]);
const MEAL_TYPES = new Set(["desayuno", "almuerzo", "merienda", "cena", "snack", "otro"]);

function cleanString(value, max = 500) {
  if (value === null || value === undefined) return "";
  return String(value).slice(0, max).trim();
}

function cleanText(value, fallback = "", max = 500) {
  const text = cleanString(value, max);
  return text || fallback;
}

function normalizeToken(value, fallback = "") {
  const raw = cleanString(value, 120)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return raw || fallback;
}

function enumValue(value, allowed, fallback) {
  const token = normalizeToken(value, fallback);
  return allowed.has(token) ? token : fallback;
}

function cleanStringArray(value, maxItems = 20, maxLen = 80) {
  if (Array.isArray(value)) {
    return value
      .map((item) => cleanString(item, maxLen))
      .filter(Boolean)
      .slice(0, maxItems);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => cleanString(item, maxLen))
      .filter(Boolean)
      .slice(0, maxItems);
  }

  return [];
}

function numberOrDefault(value, fallback, { min = null, max = null, decimals = null } = {}) {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  let out = n;
  if (min !== null && out < min) out = min;
  if (max !== null && out > max) out = max;
  if (decimals !== null) {
    const factor = 10 ** decimals;
    out = Math.round(out * factor) / factor;
  }
  return out;
}

function intOrDefault(value, fallback, range = {}) {
  return Math.round(numberOrDefault(value, fallback, range));
}

function cleanDate(value, fallback = null) {
  if (!value) return fallback;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return fallback;
  return d;
}

function cleanId(value = "") {
  return String(value || "").trim();
}

function idToString(id) {
  return id?.toString?.() || String(id || "");
}

function toMongoIdOrString(id) {
  const value = cleanId(id);
  if (!value) return null;
  return ObjectId.isValid(value) ? new ObjectId(value) : value;
}

function sameId(a, b) {
  return idToString(a) === idToString(b);
}

function normalizeRole(role) {
  const value = normalizeToken(role);
  if (value === "client" || value === "customer") return "cliente";
  if (value === "trainer" || value === "nutritionist") return "coach";
  if (value === "entrenador" || value === "nutricionista") return "coach";
  return value;
}

function featureKeyForMode(mode = "manual") {
  const token = normalizeToken(mode, "manual");
  if (token === "automatic" || token === "automatico" || token === "automatica") return "automaticGenerator";
  if (token === "semiautomatic" || token === "semiautomatico" || token === "semi_automatic") return "semiAutomaticBuilder";
  if (token === "hybrid" || token === "hibrido") return "semiAutomaticBuilder";
  return "manualBuilder";
}

function anyTruthyFeature(section = {}) {
  return Object.values(section || {}).some((value) => {
    if (typeof value === "number") return value > 0;
    return value === true;
  });
}

function generatedId() {
  return new ObjectId().toString();
}

function macroNumber(value) {
  return numberOrDefault(value, 0, { min: 0, max: 20000, decimals: 2 });
}

function normalizeMacros(raw = {}, fallback = {}) {
  const source = raw || {};
  return {
    proteina: macroNumber(source.proteina ?? source.proteinas ?? source.protein ?? fallback.proteina),
    carbs: macroNumber(source.carbs ?? source.carbohidratos ?? source.carbohydrates ?? fallback.carbs),
    grasas: macroNumber(source.grasas ?? source.fat ?? source.fats ?? fallback.grasas),
  };
}

function emptyTotals() {
  return { kcal: 0, proteina: 0, carbs: 0, grasas: 0 };
}

function roundMacro(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function rangeFromKcal(kcal) {
  const value = numberOrDefault(kcal, 0, { min: 0, max: 20000, decimals: 1 });
  if (!value) return "";
  const min = Math.floor(value / 100) * 100;
  return `${min}-${min + 100} kcal`;
}

function addTotals(a = emptyTotals(), b = emptyTotals()) {
  return {
    kcal: roundMacro((a.kcal || 0) + (b.kcal || 0)),
    proteina: roundMacro((a.proteina || 0) + (b.proteina || 0)),
    carbs: roundMacro((a.carbs || 0) + (b.carbs || 0)),
    grasas: roundMacro((a.grasas || 0) + (b.grasas || 0)),
  };
}

function normalizeMenuItem(raw = {}, index = 0, { assigned = false, editedBy = null } = {}) {
  // Los macros/kcal se tratan como snapshot ya normalizado para esta cantidad.
  // En este bloque no inferimos valores desde fooddatabase2 para evitar errores por unidad/porcion.
  const item = {
    id: cleanString(raw.id || raw._id || raw.itemId, 80) || generatedId(),
    alimentoId: raw.alimentoId ? toMongoIdOrString(raw.alimentoId) : null,
    nombreSnapshot: cleanText(raw.nombreSnapshot || raw.nombre || raw.name, `Alimento ${index + 1}`, 180),
    cantidad: numberOrDefault(raw.cantidad ?? raw.amount, 0, { min: 0, max: 100000, decimals: 2 }),
    unidad: cleanText(raw.unidad || raw.unit, "g", 40),
    kcal: macroNumber(raw.kcal ?? raw.calorias ?? raw.calories),
    proteina: macroNumber(raw.proteina ?? raw.proteinas ?? raw.protein),
    carbs: macroNumber(raw.carbs ?? raw.carbohidratos ?? raw.carbohydrates),
    grasas: macroNumber(raw.grasas ?? raw.fat ?? raw.fats),
    categoriaSnapshot: cleanString(raw.categoriaSnapshot || raw.categoria || raw.category || raw.fuente, 120),
    notas: cleanString(raw.notas || raw.notes, 1000),
  };
  const requestedQuantitySource = normalizeToken(raw.quantitySource || raw.quantityStatus || raw.quantityMode);
  const quantitySource = ["pending", "automatic", "manual"].includes(requestedQuantitySource)
    ? requestedQuantitySource
    : raw.quantityPending === true || item.cantidad <= 0
      ? "pending"
      : raw.fixedQuantity === false
        ? "automatic"
        : "manual";

  item.quantitySource = quantitySource;
  item.quantityPending = quantitySource === "pending";
  item.fixedQuantity = quantitySource === "manual";

  if (!assigned) return item;

  return {
    ...item,
    locked: !!raw.locked,
    reemplazoDe: raw.reemplazoDe || raw.replacedFrom || null,
    editedAt: raw.editedAt ? cleanDate(raw.editedAt, null) : null,
    editedBy: raw.editedBy ? toMongoIdOrString(raw.editedBy) : editedBy,
  };
}

function mealTotals(items = []) {
  return (items || []).reduce(
    (acc, item) =>
      addTotals(acc, {
        kcal: item.kcal,
        proteina: item.proteina,
        carbs: item.carbs,
        grasas: item.grasas,
      }),
    emptyTotals()
  );
}

function normalizeMeal(raw = {}, index = 0, options = {}) {
  const itemsSource = Array.isArray(raw.items) ? raw.items : raw.alimentos || raw.foods || [];
  const items = itemsSource
    .slice(0, 80)
    .map((item, itemIndex) => normalizeMenuItem(item, itemIndex, options));

  return {
    id: cleanString(raw.id || raw._id || raw.comidaId, 80) || generatedId(),
    nombre: cleanText(raw.nombre || raw.name, `Comida ${index + 1}`, 140),
    orden: intOrDefault(raw.orden, index + 1, { min: 1, max: 20 }),
    tipoComida: enumValue(raw.tipoComida || raw.type, MEAL_TYPES, "otro"),
    items,
    totales: mealTotals(items),
  };
}

function normalizeMeals(meals = [], options = {}) {
  const source = Array.isArray(meals) ? meals : [];
  return source
    .slice(0, 12)
    .map((meal, mealIndex) => normalizeMeal(meal, mealIndex, options))
    .sort((a, b) => Number(a.orden || 0) - Number(b.orden || 0));
}

function menuTotals(meals = []) {
  return (meals || []).reduce((acc, meal) => addTotals(acc, meal.totales || mealTotals(meal.items || [])), emptyTotals());
}

function normalizeBasePayload(payload = {}, context = {}) {
  const ownerType = context.ownerType || enumValue(payload.ownerType, new Set(["admin", "coach"]), "admin");
  const ownerId = context.ownerId ?? payload.ownerId ?? null;
  const comidas = normalizeMeals(payload.comidas || payload.meals || []);
  const totals = menuTotals(comidas);
  const macrosObjetivo = normalizeMacros(payload.macrosObjetivo || payload.macros || {}, totals);
  const kcalObjetivo = numberOrDefault(payload.kcalObjetivo ?? payload.kcal ?? payload.calories, totals.kcal, {
    min: 0,
    max: 20000,
    decimals: 1,
  });
  const rangoKcal = cleanString(payload.rangoKcal || payload.calorieRange, 80) || rangeFromKcal(kcalObjetivo);

  return {
    nombre: cleanText(payload.nombre || payload.name, "Menu sin nombre", 180),
    descripcion: cleanString(payload.descripcion || payload.description, 2500),
    kcalObjetivo,
    rangoKcal,
    macrosObjetivo,
    objetivo: enumValue(payload.objetivo || payload.goal, MENU_OBJECTIVES, "mantenimiento"),
    cantidadComidas: intOrDefault(payload.cantidadComidas ?? payload.mealsCount, comidas.length || 0, { min: 0, max: 12 }),
    tags: cleanStringArray(payload.tags, 20, 60),
    visibilidad:
      ownerType === "coach"
        ? "privada"
        : enumValue(payload.visibilidad || payload.visibility, BASE_VISIBILITY, "publica"),
    ownerType,
    ownerId: ownerId ? toMongoIdOrString(ownerId) : null,
    estado: enumValue(payload.estado || payload.status, BASE_STATUS, "activo"),
    comidas,
    createdBy: context.actorId ? toMongoIdOrString(context.actorId) : null,
  };
}

function normalizeAssignedPatch(payload = {}, context = {}) {
  const patch = {};
  if (payload.nombre !== undefined || payload.name !== undefined) {
    patch.nombre = cleanText(payload.nombre || payload.name, "Menu asignado", 180);
  }
  if (payload.descripcion !== undefined || payload.description !== undefined) {
    patch.descripcion = cleanString(payload.descripcion || payload.description, 2500);
  }
  if (payload.fechaInicio !== undefined) patch.fechaInicio = cleanDate(payload.fechaInicio, null);
  if (payload.fechaFin !== undefined) patch.fechaFin = cleanDate(payload.fechaFin, null);
  if (payload.estado !== undefined) {
    patch.estado = enumValue(payload.estado, ASSIGNED_STATUS, "activo");
  }
  if (payload.kcalObjetivo !== undefined || payload.kcal !== undefined) {
    patch.kcalObjetivo = numberOrDefault(payload.kcalObjetivo ?? payload.kcal, 0, {
      min: 0,
      max: 20000,
      decimals: 1,
    });
  }
  if (payload.macrosObjetivo !== undefined || payload.macros !== undefined) {
    patch.macrosObjetivo = normalizeMacros(payload.macrosObjetivo || payload.macros || {});
  }
  if (payload.notasCoach !== undefined || payload.coachNotes !== undefined) {
    patch.notasCoach = cleanString(payload.notasCoach || payload.coachNotes, 3000);
  }
  if (payload.comidas !== undefined || payload.meals !== undefined) {
    patch.comidas = normalizeMeals(payload.comidas || payload.meals, {
      assigned: true,
      editedBy: context.actorId ? toMongoIdOrString(context.actorId) : null,
    });
    patch.totalesActuales = menuTotals(patch.comidas);
  }

  return patch;
}

function normalizeDoc(doc) {
  if (!doc) return null;

  const normalized = {
    ...doc,
    id: idToString(doc._id || doc.id),
    _id: idToString(doc._id || doc.id),
  };

  for (const key of ["ownerId", "createdBy", "clienteId", "coachId", "menuBaseId", "assignedBy", "updatedBy"]) {
    if (normalized[key]) normalized[key] = idToString(normalized[key]);
  }

  if (Array.isArray(normalized.comidas)) {
    normalized.comidas = normalized.comidas.map((meal) => ({
      ...meal,
      items: (meal.items || []).map((item) => ({
        ...item,
        alimentoId: item.alimentoId ? idToString(item.alimentoId) : null,
        editedBy: item.editedBy ? idToString(item.editedBy) : null,
      })),
    }));
  }

  return normalized;
}

function menuBaseIdentity(doc = {}) {
  const normalized = normalizeDoc(doc) || {};
  return JSON.stringify({
    nombre: normalizeToken(normalized.nombre),
    descripcion: normalizeToken(normalized.descripcion),
    kcalObjetivo: numberOrDefault(normalized.kcalObjetivo, 0, { decimals: 1 }),
    rangoKcal: normalizeToken(normalized.rangoKcal),
    macrosObjetivo: {
      proteina: macroNumber(normalized.macrosObjetivo?.proteina),
      carbs: macroNumber(normalized.macrosObjetivo?.carbs),
      grasas: macroNumber(normalized.macrosObjetivo?.grasas),
    },
    tags: (normalized.tags || []).map(normalizeToken).sort(),
    comidas: (normalized.comidas || []).map((meal, index) => ({
      orden: numberOrDefault(meal.orden, index + 1, { decimals: 0 }),
      nombre: normalizeToken(meal.nombre),
      tipoComida: normalizeToken(meal.tipoComida),
      items: (meal.items || []).map((item) => ({
        alimentoId: idToString(item.alimentoId),
        nombre: normalizeToken(item.nombreSnapshot),
        cantidad: numberOrDefault(item.cantidad, 0, { decimals: 2 }),
        unidad: normalizeToken(item.unidad),
        kcal: macroNumber(item.kcal),
        proteina: macroNumber(item.proteina),
        carbs: macroNumber(item.carbs),
        grasas: macroNumber(item.grasas),
        categoria: normalizeToken(item.categoriaSnapshot),
      })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    })),
  });
}

function normalizeFoodDoc(raw = {}) {
  const name = raw.Alimentos || raw.alimentos || raw.nombre || raw.name || "Sin nombre";
  const id = idToString(raw._id || raw.id || name);
  const kcal = macroNumber(raw.Calorias ?? raw.calorias ?? raw.kcal ?? raw.calories);
  const proteina = macroNumber(raw.Proteinas ?? raw.proteinas ?? raw.proteina ?? raw.protein);
  const carbs = macroNumber(raw.Carbohidratos ?? raw.carbohidratos ?? raw.carbs ?? raw.carbohydrates);
  const grasas = macroNumber(raw.Grasas ?? raw.grasas ?? raw.fat ?? raw.fats);
  const categoria =
    cleanString(raw.Fuente || raw.fuente || raw.Categoria || raw.categoria || raw["Categoría"] || raw.Grupo || raw.grupo, 120) ||
    inferFoodRole({ nombre: name, kcal, proteina, carbs, grasas });

  return {
    id,
    alimentoId: id,
    nombre: cleanText(name, "Sin nombre", 180),
    unidad: cleanText(raw.Unidad || raw.unidad || raw.unit, "g", 40),
    kcal,
    proteina,
    carbs,
    grasas,
    categoria,
  };
}

function inferFoodRole(food = {}) {
  const text = `${food.categoria || ""} ${food.nombre || food.nombreSnapshot || ""}`.toLowerCase();
  if (/pollo|carne|huevo|atun|atún|pescado|whey|yogur|queso|jamon|jamón|pavo/.test(text)) return "proteina";
  if (/arroz|papa|batata|fideo|pasta|pan|avena|banana|manzana|fruta|harina|cereal/.test(text)) return "carbs";
  if (/aceite|palta|nuez|almendra|mani|maní|manteca|semilla/.test(text)) return "grasas";

  const proteina = Number(food.proteina || food.proteinas || food.protein || 0);
  const carbs = Number(food.carbs || food.carbohidratos || food.carbohydrates || 0);
  const grasas = Number(food.grasas || food.fat || food.fats || 0);
  const max = Math.max(proteina, carbs, grasas);
  if (max === proteina && proteina > 0) return "proteina";
  if (max === carbs && carbs > 0) return "carbs";
  if (max === grasas && grasas > 0) return "grasas";
  return "general";
}

function equivalentObjective(raw = "", food = {}) {
  const token = normalizeToken(raw, "");
  if (["proteina", "protein", "carbs", "carbohidratos", "grasas", "fat", "kcal", "general"].includes(token)) {
    if (token === "protein") return "proteina";
    if (token === "carbohidratos") return "carbs";
    if (token === "fat") return "grasas";
    return token;
  }
  return inferFoodRole(food);
}

function quantityForEquivalent(original = {}, candidate = {}, objetivo = "general") {
  const originalQty = numberOrDefault(original.cantidad ?? original.amount, 100, { min: 1, max: 100000, decimals: 2 });
  const candidateBaseQty = 100;
  const key = objetivo === "proteina" ? "proteina" : objetivo === "grasas" ? "grasas" : objetivo === "carbs" ? "carbs" : "kcal";
  const originalTarget = Number(original[key] || 0);
  const candidateTarget = Number(candidate[key] || 0);

  if (originalTarget > 0 && candidateTarget > 0) {
    return Math.max(1, Math.round((originalTarget / candidateTarget) * candidateBaseQty));
  }

  return originalQty;
}

function scaledFoodTotals(candidate = {}, cantidad = 100) {
  const factor = (Number(cantidad) || 0) / 100;
  return {
    kcal: roundMacro(candidate.kcal * factor),
    proteina: roundMacro(candidate.proteina * factor),
    carbs: roundMacro(candidate.carbs * factor),
    grasas: roundMacro(candidate.grasas * factor),
  };
}

function scoreEquivalent(original = {}, candidate = {}, totals = {}, objetivo = "general") {
  const sameRole = inferFoodRole(original) === inferFoodRole(candidate);
  const categoryPenalty = sameRole ? 0 : 45;
  const weights = {
    kcal: objetivo === "kcal" || objetivo === "general" ? 1.1 : 0.55,
    proteina: objetivo === "proteina" ? 2.2 : 0.65,
    carbs: objetivo === "carbs" ? 2.2 : 0.65,
    grasas: objetivo === "grasas" ? 2.2 : 0.65,
  };

  const delta =
    Math.abs((original.kcal || 0) - (totals.kcal || 0)) * weights.kcal +
    Math.abs((original.proteina || 0) - (totals.proteina || 0)) * weights.proteina +
    Math.abs((original.carbs || 0) - (totals.carbs || 0)) * weights.carbs +
    Math.abs((original.grasas || 0) - (totals.grasas || 0)) * weights.grasas;

  return delta + categoryPenalty;
}

class ServicioMenus {
  constructor() {
    this.menusModel = new ModelMongoDBMenus();
    this.usuariosModel = new ModelMongoDBUsuarios();
    this.coachPlanModel = new ModelMongoDBCoachPlanConfigs();
    this.alimentosModel = new ModelMongoDBAlimentos();
  }

  async ensureIndexes() {
    await this.menusModel.ensureIndexes();
  }

  async _actor(user) {
    const actorId = user?.id || user?._id;
    if (!actorId) throw new Error("NO_AUTENTICADO");
    const full = await this.usuariosModel.obtenerPorId(actorId);
    if (!full) throw new Error("NO_AUTENTICADO");
    return full;
  }

  _actorId(actor) {
    return idToString(actor?._id || actor?.id);
  }

  _role(actor) {
    return normalizeRole(actor?.role || actor?.rol);
  }

  _isAdmin(actor) {
    return this._role(actor) === "admin";
  }

  _isCoach(actor) {
    return this._role(actor) === "coach";
  }

  _isClient(user) {
    return normalizeRole(user?.role || user?.rol) === "cliente";
  }

  async _effectiveCapabilities(coach) {
    const currentClients = await this.usuariosModel.countClientsByCoachId(coach._id || coach.id);
    const planCode = normalizeCoachPlanCode(coach?.plan) || "trial_pro";
    const planConfig =
      typeof this.coachPlanModel?.getByCode === "function"
        ? await this.coachPlanModel.getByCode(planCode)
        : normalizePlanConfig(planCode);

    return resolveEffectiveCoachCapabilities({
      coach,
      planConfig,
      currentClients,
    });
  }

  async _assertNutritionAccess(actor, { feature = null } = {}) {
    if (this._isAdmin(actor)) return { admin: true, effectiveCapabilities: null };
    if (!this._isCoach(actor)) throw new Error("COACH_NUTRITION_NOT_ALLOWED");

    const specialties = actor?.coachProfile?.specialties || {};
    if (!specialties.nutrition) throw new Error("COACH_NUTRITION_NOT_ALLOWED");

    const effectiveCapabilities = await this._effectiveCapabilities(actor);
    const menuFeatures = effectiveCapabilities?.features?.menus || {};
    if (effectiveCapabilities?.isTrialExpired) throw new Error("COACH_FEATURE_NOT_ALLOWED");

    if (feature && !menuFeatures?.[feature]) {
      throw new Error("COACH_FEATURE_NOT_ALLOWED");
    }

    if (!feature && !anyTruthyFeature(menuFeatures)) {
      throw new Error("COACH_FEATURE_NOT_ALLOWED");
    }

    return { admin: false, effectiveCapabilities };
  }

  async _assertBuilderAccess(actor, mode = "manual") {
    return await this._assertNutritionAccess(actor, { feature: featureKeyForMode(mode) });
  }

  async _assertOwnTemplatesAccess(actor) {
    return await this._assertNutritionAccess(actor, { feature: "ownTemplates" });
  }

  async _getClientForActor(actor, clienteId) {
    const client = await this.usuariosModel.obtenerPorId(clienteId);
    if (!client) throw new Error("CLIENT_NOT_FOUND");
    if (!this._isClient(client)) throw new Error("USER_NOT_CLIENT");

    if (this._isAdmin(actor)) return client;

    const actorId = this._actorId(actor);
    const assignedCoachId = client?.coach?.entrenadorId;
    if (!sameId(assignedCoachId, actorId)) {
      throw new Error("CLIENT_NOT_ASSIGNED_TO_COACH");
    }

    return client;
  }

  _canEditOwnedBase(actor, menu) {
    if (this._isAdmin(actor)) return true;
    return (
      this._isCoach(actor) &&
      menu?.ownerType === "coach" &&
      sameId(menu?.ownerId, this._actorId(actor))
    );
  }

  _canAccessBase(actor, menu) {
    if (!menu) return false;
    if (this._isAdmin(actor)) return true;
    if (!this._isCoach(actor)) return false;
    if (menu.estado !== "activo" && !this._canEditOwnedBase(actor, menu)) return false;
    if (["publica", "sistema"].includes(menu.visibilidad)) return true;
    return this._canEditOwnedBase(actor, menu);
  }

  async listMenus(user, filters = {}) {
    const actor = await this._actor(user);
    await this._assertNutritionAccess(actor);

    const visibilityQuery = this._isAdmin(actor)
      ? null
      : this.menusModel.ownerVisibilityForCoach(this._actorId(actor));

    const data = await this.menusModel.listBase({
      ...filters,
      visibilityQuery,
    });

    return {
      menus: (data.items || []).map(normalizeDoc),
      total: data.total || 0,
    };
  }

  async getMenu(user, id) {
    const actor = await this._actor(user);
    await this._assertNutritionAccess(actor);
    const menu = await this.menusModel.getBaseById(id);
    if (!menu) throw new Error("NOT_FOUND");
    if (!this._canAccessBase(actor, menu)) throw new Error("FORBIDDEN");
    return normalizeDoc(menu);
  }

  async createMenu(user, payload = {}) {
    const actor = await this._actor(user);
    if (!this._isAdmin(actor)) await this._assertOwnTemplatesAccess(actor);

    const doc = normalizeBasePayload(payload, {
      actorId: this._actorId(actor),
      ownerType: this._isAdmin(actor) ? "admin" : "coach",
      ownerId: this._isAdmin(actor) ? null : this._actorId(actor),
    });

    return normalizeDoc(await this.menusModel.createBase(doc));
  }

  async updateMenu(user, id, payload = {}) {
    const actor = await this._actor(user);
    if (!this._isAdmin(actor)) await this._assertOwnTemplatesAccess(actor);

    const current = await this.menusModel.getBaseById(id);
    if (!current) throw new Error("NOT_FOUND");
    if (!this._canEditOwnedBase(actor, current)) throw new Error("FORBIDDEN");

    const patch = normalizeBasePayload(
      {
        ...current,
        ...payload,
        comidas: payload.comidas !== undefined || payload.meals !== undefined ? payload.comidas || payload.meals : current.comidas,
      },
      {
        actorId: current.createdBy || this._actorId(actor),
        ownerType: current.ownerType || (this._isAdmin(actor) ? "admin" : "coach"),
        ownerId: current.ownerId || (this._isAdmin(actor) ? null : this._actorId(actor)),
      }
    );
    delete patch.createdBy;

    return normalizeDoc(await this.menusModel.updateBaseById(id, patch));
  }

  async deleteMenu(user, id) {
    const actor = await this._actor(user);
    if (!this._isAdmin(actor)) await this._assertOwnTemplatesAccess(actor);

    const current = await this.menusModel.getBaseById(id);
    if (!current) throw new Error("NOT_FOUND");
    if (!this._canEditOwnedBase(actor, current)) throw new Error("FORBIDDEN");

    const result = await this.menusModel.deleteBaseById(id);
    return { deleted: result.deletedCount > 0 };
  }

  async duplicateMenu(user, id, payload = {}) {
    const actor = await this._actor(user);
    if (this._isAdmin(actor)) {
      await this._assertNutritionAccess(actor);
    } else {
      await this._assertNutritionAccess(actor, { feature: "duplicatePlans" });
    }

    const current = await this.menusModel.getBaseById(id);
    if (!current) throw new Error("NOT_FOUND");
    if (!this._canAccessBase(actor, current)) throw new Error("FORBIDDEN");

    const clone = {
      ...current,
      nombre: cleanText(payload.nombre || `Copia de ${current.nombre || "Menu"}`, "Menu copia", 180),
      descripcion: payload.descripcion !== undefined ? cleanString(payload.descripcion, 2500) : current.descripcion,
      visibilidad: this._isAdmin(actor)
        ? enumValue(payload.visibilidad || "privada", BASE_VISIBILITY, "privada")
        : "privada",
      ownerType: this._isAdmin(actor) ? "admin" : "coach",
      ownerId: this._isAdmin(actor) ? null : toMongoIdOrString(this._actorId(actor)),
      createdBy: toMongoIdOrString(this._actorId(actor)),
      estado: "activo",
    };
    delete clone._id;
    delete clone.id;
    delete clone.createdAt;
    delete clone.updatedAt;

    if (menuBaseIdentity(current) === menuBaseIdentity(clone)) {
      throw new Error("DUPLICATE_IDENTICAL");
    }

    return normalizeDoc(await this.menusModel.createBase(clone));
  }

  async assignMenu(user, clienteId, payload = {}) {
    const actor = await this._actor(user);
    await this._assertBuilderAccess(actor, "manual");
    const client = await this._getClientForActor(actor, clienteId);

    const baseId = payload.menuBaseId || payload.menuId;
    if (!baseId) throw new Error("MENU_BASE_REQUIRED");
    const base = await this.menusModel.getBaseById(baseId);
    if (!base) throw new Error("NOT_FOUND");
    if (!this._canAccessBase(actor, base)) throw new Error("FORBIDDEN");

    const assignedCoachId = this._isCoach(actor)
      ? this._actorId(actor)
      : cleanId(payload.coachId || client?.coach?.entrenadorId || "");

    await this.menusModel.pauseActiveForClient(clienteId);

    const comidas = normalizeMeals(base.comidas || [], {
      assigned: true,
      editedBy: null,
    });

    const assigned = {
      clienteId: toMongoIdOrString(clienteId),
      coachId: assignedCoachId ? toMongoIdOrString(assignedCoachId) : null,
      menuBaseId: toMongoIdOrString(baseId),
      nombre: cleanText(payload.nombre || base.nombre, "Menu asignado", 180),
      descripcion: cleanString(payload.descripcion ?? base.descripcion, 2500),
      fechaInicio: cleanDate(payload.fechaInicio, new Date()),
      fechaFin: cleanDate(payload.fechaFin, null),
      estado: "activo",
      kcalObjetivo: numberOrDefault(payload.kcalObjetivo ?? base.kcalObjetivo, 0, {
        min: 0,
        max: 20000,
        decimals: 1,
      }),
      macrosObjetivo: normalizeMacros(payload.macrosObjetivo || base.macrosObjetivo || {}),
      totalesActuales: menuTotals(comidas),
      comidas,
      notasCoach: cleanString(payload.notasCoach, 3000),
      historialCambios: [],
      assignedBy: toMongoIdOrString(this._actorId(actor)),
      assignedByRole: this._role(actor),
    };

    return normalizeDoc(await this.menusModel.createAssigned(assigned));
  }

  async listClienteMenus(user, clienteId, filters = {}) {
    const actor = await this._actor(user);
    await this._assertNutritionAccess(actor);
    await this._getClientForActor(actor, clienteId);

    const data = await this.menusModel.listAssigned({
      ...filters,
      clienteId,
    });

    return {
      menus: (data.items || []).map(normalizeDoc),
      total: data.total || 0,
    };
  }

  async getClienteMenuActivo(user, clienteId) {
    const actor = await this._actor(user);
    await this._assertNutritionAccess(actor);
    await this._getClientForActor(actor, clienteId);
    return normalizeDoc(await this.menusModel.getActiveForClient(clienteId));
  }

  async getClienteMenu(user, clienteId, menuAsignadoId) {
    const actor = await this._actor(user);
    await this._assertNutritionAccess(actor);
    await this._getClientForActor(actor, clienteId);

    const assigned = await this.menusModel.getAssignedById(menuAsignadoId);
    if (!assigned) throw new Error("NOT_FOUND");
    if (!sameId(assigned.clienteId, clienteId)) throw new Error("FORBIDDEN");

    return normalizeDoc(assigned);
  }

  async updateClienteMenu(user, clienteId, menuAsignadoId, payload = {}) {
    const actor = await this._actor(user);
    await this._assertBuilderAccess(actor, "manual");
    await this._getClientForActor(actor, clienteId);

    const assigned = await this.menusModel.getAssignedById(menuAsignadoId);
    if (!assigned) throw new Error("NOT_FOUND");
    if (!sameId(assigned.clienteId, clienteId)) throw new Error("FORBIDDEN");

    const patch = {
      ...normalizeAssignedPatch(payload, { actorId: this._actorId(actor) }),
      updatedBy: toMongoIdOrString(this._actorId(actor)),
      updatedByRole: this._role(actor),
    };

    if (patch.estado === "activo") {
      await this.menusModel.pauseActiveForClient(clienteId, menuAsignadoId);
    }

    return normalizeDoc(await this.menusModel.updateAssignedById(menuAsignadoId, patch));
  }

  async deleteClienteMenu(user, clienteId, menuAsignadoId) {
    const actor = await this._actor(user);
    await this._assertBuilderAccess(actor, "manual");
    await this._getClientForActor(actor, clienteId);

    const assigned = await this.menusModel.getAssignedById(menuAsignadoId);
    if (!assigned) throw new Error("NOT_FOUND");
    if (!sameId(assigned.clienteId, clienteId)) throw new Error("FORBIDDEN");

    const result = await this.menusModel.deleteAssignedById(menuAsignadoId);
    return { deleted: result.deletedCount > 0 };
  }

  async duplicateClienteMenu(user, clienteId, menuAsignadoId, payload = {}) {
    const actor = await this._actor(user);
    await this._assertNutritionAccess(actor, { feature: "duplicatePlans" });
    await this._getClientForActor(actor, clienteId);

    const assigned = await this.menusModel.getAssignedById(menuAsignadoId);
    if (!assigned) throw new Error("NOT_FOUND");
    if (!sameId(assigned.clienteId, clienteId)) throw new Error("FORBIDDEN");

    const activar = payload.activar === true || payload.estado === "activo";
    if (activar) await this.menusModel.pauseActiveForClient(clienteId);

    const clone = {
      ...assigned,
      nombre: cleanText(payload.nombre || `${assigned.nombre || "Menu"} - Semana 2`, "Menu duplicado", 180),
      fechaInicio: cleanDate(payload.fechaInicio, new Date()),
      fechaFin: cleanDate(payload.fechaFin, null),
      estado: activar ? "activo" : "pausado",
      historialCambios: [
        ...(Array.isArray(assigned.historialCambios) ? assigned.historialCambios : []),
        {
          tipo: "duplicado",
          fromMenuAsignadoId: toMongoIdOrString(menuAsignadoId),
          at: new Date(),
          by: toMongoIdOrString(this._actorId(actor)),
        },
      ].slice(-50),
      assignedBy: toMongoIdOrString(this._actorId(actor)),
      assignedByRole: this._role(actor),
    };
    delete clone._id;
    delete clone.id;
    delete clone.createdAt;
    delete clone.updatedAt;

    return normalizeDoc(await this.menusModel.createAssigned(clone));
  }

  async saveClienteMenuAsTemplate(user, clienteId, menuAsignadoId, payload = {}) {
    const actor = await this._actor(user);
    if (!this._isAdmin(actor)) await this._assertOwnTemplatesAccess(actor);
    await this._getClientForActor(actor, clienteId);

    const assigned = await this.menusModel.getAssignedById(menuAsignadoId);
    if (!assigned) throw new Error("NOT_FOUND");
    if (!sameId(assigned.clienteId, clienteId)) throw new Error("FORBIDDEN");

    const doc = normalizeBasePayload(
      {
        ...assigned,
        nombre: payload.nombre || `${assigned.nombre || "Menu"} - template`,
        descripcion: payload.descripcion ?? assigned.descripcion,
        visibilidad: payload.visibilidad || "privada",
      },
      {
        actorId: this._actorId(actor),
        ownerType: this._isAdmin(actor) ? "admin" : "coach",
        ownerId: this._isAdmin(actor) ? null : this._actorId(actor),
      }
    );

    return normalizeDoc(await this.menusModel.createBase(doc));
  }

  async getFoodEquivalents(user, payload = {}) {
    const actor = await this._actor(user);
    await this._assertNutritionAccess(actor, { feature: "foodLibrarySearch" });

    const originalRaw = payload.alimentoOriginal || payload.original || payload.item || {};
    const original = {
      nombre: cleanText(originalRaw.nombreSnapshot || originalRaw.nombre || originalRaw.name, "Alimento", 180),
      cantidad: numberOrDefault(payload.cantidad ?? originalRaw.cantidad, 100, { min: 1, max: 100000, decimals: 2 }),
      unidad: cleanText(payload.unidad || originalRaw.unidad, "g", 40),
      kcal: macroNumber(originalRaw.kcal ?? originalRaw.calorias),
      proteina: macroNumber(originalRaw.proteina ?? originalRaw.proteinas),
      carbs: macroNumber(originalRaw.carbs ?? originalRaw.carbohidratos),
      grasas: macroNumber(originalRaw.grasas ?? originalRaw.fat),
      categoria: cleanString(originalRaw.categoriaSnapshot || originalRaw.categoria || originalRaw.fuente, 120),
    };
    const objetivo = equivalentObjective(payload.objetivo, original);
    const originalRole = inferFoodRole(original);
    const alimentos = await this.alimentosModel.obtenerAlimentos();
    const normalized = (Array.isArray(alimentos) ? alimentos : []).map(normalizeFoodDoc);
    const originalName = normalizeToken(original.nombre);

    const candidates = normalized
      .filter((food) => food.nombre && normalizeToken(food.nombre) !== originalName)
      .filter((food) => {
        if (originalRole === "general") return true;
        return inferFoodRole(food) === originalRole;
      })
      .map((food) => {
        const cantidadSugerida = quantityForEquivalent(original, food, objetivo);
        const totals = scaledFoodTotals(food, cantidadSugerida);
        return {
          ...food,
          cantidadSugerida,
          unidadSugerida: food.unidad || "g",
          totales: totals,
          diferencia: {
            kcal: roundMacro(totals.kcal - original.kcal),
            proteina: roundMacro(totals.proteina - original.proteina),
            carbs: roundMacro(totals.carbs - original.carbs),
            grasas: roundMacro(totals.grasas - original.grasas),
          },
          score: scoreEquivalent(original, food, totals, objetivo),
        };
      })
      .filter((food) => Number.isFinite(food.score) && food.cantidadSugerida > 0 && food.cantidadSugerida <= 2000)
      .sort((a, b) => a.score - b.score)
      .slice(0, 12);

    return {
      objetivo,
      original,
      equivalentes: candidates,
    };
  }
}

export default ServicioMenus;
