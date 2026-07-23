import { ObjectId } from "mongodb";

import ModelFactory from "../model/DAO/comidasFactory.js";
import ModelMongoDBUsuarios from "../model/DAO/usuariosMongoDB.js";
import ModelMongoDBCoachPlanConfigs from "../model/DAO/coachPlanConfigsMongoDB.js";
import ModelMongoDBComidasGuardadas from "../model/DAO/comidasGuardadasMongoDB.js";
import {
  coachResourceLimitError,
  normalizeCoachPlanCode,
  normalizePlanConfig,
  resolveEffectiveCoachCapabilities,
} from "./coachPlans.js";
import {
  canUseProfessionalTemplate,
  normalizeProfessionalTemplateTier,
  professionalTemplateSource,
  professionalTemplateTier,
} from "./professionalLibraryCapabilities.js";
import {
  requireCoachSubscriptionActive,
  requireProfessionalScope,
} from "./professionalAccessRules.js";

const MEAL_TYPES = new Set(["desayuno", "almuerzo", "merienda", "cena", "snack", "otro"]);
const MEAL_GROUPS = new Set(["desayuno_merienda", "almuerzo_cena", "snack", "otro"]);
const VISIBILITY = new Set(["sistema", "publica", "privada"]);
const STATUS = new Set(["activo", "inactivo"]);

function cleanString(value, max = 500) {
  if (value === null || value === undefined) return "";
  return String(value).slice(0, max).trim();
}

function cleanText(value, fallback = "", max = 500) {
  const text = cleanString(value, max);
  return text || fallback;
}

function normalizeToken(value = "", fallback = "") {
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

function numberOrDefault(value, fallback = 0, { min = 0, max = 100000, decimals = 2 } = {}) {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  let out = n;
  if (out < min) out = min;
  if (out > max) out = max;
  const factor = 10 ** decimals;
  return Math.round(out * factor) / factor;
}

function macroNumber(value) {
  return numberOrDefault(value, 0, { min: 0, max: 50000, decimals: 2 });
}

function roundMacro(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function idToString(id) {
  return id?.toString?.() || String(id || "");
}

function toMongoIdOrString(id) {
  const value = cleanString(id, 80);
  if (!value) return null;
  return ObjectId.isValid(value) ? new ObjectId(value) : value;
}

function sameId(a, b) {
  return idToString(a) === idToString(b);
}

function generatedId() {
  return new ObjectId().toString();
}

function cleanStringArray(value, maxItems = 20, maxLen = 80) {
  if (Array.isArray(value)) {
    return value.map((item) => cleanString(item, maxLen)).filter(Boolean).slice(0, maxItems);
  }

  if (typeof value === "string") {
    return value.split(",").map((item) => cleanString(item, maxLen)).filter(Boolean).slice(0, maxItems);
  }

  return [];
}

function normalizeRole(user = {}) {
  const value = normalizeToken(user.role || user.rol);
  if (value === "client" || value === "customer") return "cliente";
  if (value === "trainer" || value === "nutritionist" || value === "entrenador" || value === "nutricionista") return "coach";
  return value;
}

function inferMealType(value = "") {
  const text = normalizeToken(value, "");
  if (text.includes("desayuno")) return "desayuno";
  if (text.includes("almuerzo")) return "almuerzo";
  if (text.includes("merienda")) return "merienda";
  if (text.includes("cena")) return "cena";
  if (text.includes("snack") || text.includes("colacion")) return "snack";
  return "otro";
}

function groupFromType(tipoComida = "otro") {
  if (["desayuno", "merienda"].includes(tipoComida)) return "desayuno_merienda";
  if (["almuerzo", "cena"].includes(tipoComida)) return "almuerzo_cena";
  if (tipoComida === "snack") return "snack";
  return "otro";
}

function normalizeLegacyItems(body = {}) {
  const items = [];
  for (let i = 1; i <= 12; i += 1) {
    const alimento = cleanString(body?.[`alimento${i}`], 180);
    if (!alimento) continue;

    const cantidad = numberOrDefault(body?.[`cantidad${i}`], 0, { min: 0, max: 100000, decimals: 2 });
    if (cantidad <= 0) throw new Error(`CANTIDAD_INVALIDA_${i}`);

    items.push({
      alimento,
      cantidad,
      unidad: cleanString(body?.[`unidad${i}`], 40) || "g",
    });
  }
  return items;
}

function normalizeItem(raw = {}, index = 0) {
  const nombre =
    raw.nombreSnapshot ||
    raw.nombre ||
    raw.name ||
    raw.alimento ||
    raw.Alimentos ||
    `Alimento ${index + 1}`;

  return {
    id: cleanString(raw.id || raw._id || raw.itemId, 80) || generatedId(),
    alimentoId: raw.alimentoId ? toMongoIdOrString(raw.alimentoId) : null,
    nombreSnapshot: cleanText(nombre, `Alimento ${index + 1}`, 180),
    cantidad: numberOrDefault(raw.cantidad ?? raw.amount, 0, { min: 0, max: 100000, decimals: 2 }),
    unidad: cleanText(raw.unidad || raw.unit, "g", 40),
    kcal: macroNumber(raw.kcal ?? raw.calorias ?? raw.calories),
    proteina: macroNumber(raw.proteina ?? raw.proteinas ?? raw.protein),
    carbs: macroNumber(raw.carbs ?? raw.carbohidratos ?? raw.carbohydrates ?? raw.hidratos),
    grasas: macroNumber(raw.grasas ?? raw.fat ?? raw.fats),
    categoriaSnapshot: cleanString(raw.categoriaSnapshot || raw.categoria || raw.category || raw.fuente, 120),
    notas: cleanString(raw.notas || raw.notes, 1000),
  };
}

function totalsFromItems(items = []) {
  return items.reduce(
    (acc, item) => ({
      kcal: roundMacro(acc.kcal + Number(item.kcal || 0)),
      proteina: roundMacro(acc.proteina + Number(item.proteina || 0)),
      carbs: roundMacro(acc.carbs + Number(item.carbs || 0)),
      grasas: roundMacro(acc.grasas + Number(item.grasas || 0)),
    }),
    { kcal: 0, proteina: 0, carbs: 0, grasas: 0 }
  );
}

function sourceItems(payload = {}) {
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.alimentos)) return payload.alimentos;
  return normalizeLegacyItems(payload);
}

function normalizePayload(payload = {}, context = {}) {
  const items = sourceItems(payload).slice(0, 80).map(normalizeItem);
  const tipoComida = enumValue(payload.tipoComida || payload.type || inferMealType(payload.nombre || payload.name), MEAL_TYPES, "otro");
  const grupoComida = enumValue(payload.grupoComida || payload.group || groupFromType(tipoComida), MEAL_GROUPS, groupFromType(tipoComida));
  const ownerType = context.ownerType || enumValue(payload.ownerType, new Set(["admin", "coach"]), "admin");
  const ownerId = context.ownerId || payload.ownerId || payload.userId || null;
  const visibilidad =
    ownerType === "coach"
      ? "privada"
      : enumValue(payload.visibilidad || payload.visibility, VISIBILITY, "publica");
  const templateTier = ownerType === "admin"
    ? normalizeProfessionalTemplateTier(
        payload.templateTier || payload.libraryTier || payload.planMinimo || payload.visibilidad,
        "global_basic"
      )
    : null;

  if (!items.length) throw new Error("ITEMS_INVALIDOS");

  return {
    userId: ownerId ? idToString(ownerId) : null,
    nombre: cleanText(payload.nombre || payload.name, "Comida sin nombre", 180),
    descripcion: cleanString(payload.descripcion || payload.description, 2500),
    tipoComida,
    grupoComida,
    items,
    totales: totalsFromItems(items),
    tags: cleanStringArray(payload.tags, 20, 60),
    visibilidad,
    ownerType,
    ownerId: ownerId ? toMongoIdOrString(ownerId) : null,
    sourceType: ownerType === "coach" ? "coach_owned" : templateTier === "global_premium" ? "admin_premium" : "admin_global",
    ...(templateTier ? { templateTier } : {}),
    planMinimo: ownerType === "admin"
      ? templateTier === "global_premium" ? "vip" : templateTier === "global_pro" ? "pro" : "free"
      : "free",
    estado: enumValue(payload.estado || payload.status, STATUS, "activo"),
    createdBy: context.actorId ? toMongoIdOrString(context.actorId) : null,
  };
}

function normalizePatch(payload = {}, current = {}, context = {}) {
  const merged = {
    ...current,
    ...payload,
    items:
      payload.items !== undefined ||
      payload.alimentos !== undefined ||
      Object.keys(payload || {}).some((key) => /^alimento\d+$/.test(key))
        ? sourceItems(payload)
        : current.items,
  };

  const normalized = normalizePayload(merged, {
    ownerType: current.ownerType || context.ownerType,
    ownerId: current.ownerId || current.userId || context.ownerId,
    actorId: current.createdBy || context.actorId,
  });

  delete normalized.createdBy;
  return normalized;
}

function normalizeDoc(doc = null) {
  if (!doc) return null;

  const id = idToString(doc._id || doc.id);
  const legacyItems = Array.isArray(doc.items) ? doc.items : [];
  const items = legacyItems.map(normalizeItem);
  const tipoComida = enumValue(doc.tipoComida || inferMealType(doc.nombre), MEAL_TYPES, "otro");
  const grupoComida = enumValue(doc.grupoComida || groupFromType(tipoComida), MEAL_GROUPS, groupFromType(tipoComida));

  return {
    ...doc,
    id,
    _id: id,
    userId: doc.userId ? idToString(doc.userId) : null,
    ownerId: doc.ownerId ? idToString(doc.ownerId) : doc.userId ? idToString(doc.userId) : null,
    ownerType: doc.ownerType || "cliente",
    sourceType: professionalTemplateSource(doc),
    templateTier: doc.ownerType === "admin" ? professionalTemplateTier(doc) : null,
    nombre: doc.nombre || "Comida sin nombre",
    descripcion: doc.descripcion || "",
    tipoComida,
    grupoComida,
    items,
    totales: totalsFromItems(items),
    tags: Array.isArray(doc.tags) ? doc.tags : [],
    visibilidad: doc.visibilidad || "privada",
    estado: doc.estado || "activo",
    createdBy: doc.createdBy ? idToString(doc.createdBy) : null,
    createdAt: doc.createdAt || null,
    updatedAt: doc.updatedAt || null,
  };
}

function mealIdentity(doc = {}) {
  const normalized = normalizeDoc(doc) || {};
  return JSON.stringify({
    nombre: normalizeToken(normalized.nombre),
    descripcion: normalizeToken(normalized.descripcion),
    tipoComida: normalizeToken(normalized.tipoComida),
    grupoComida: normalizeToken(normalized.grupoComida),
    tags: (normalized.tags || []).map(normalizeToken).sort(),
    items: (normalized.items || []).map((item) => ({
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
  });
}

function anyTruthyFeature(features = {}) {
  return Object.values(features || {}).some((value) => {
    if (typeof value === "number") return value > 0;
    return value === true;
  });
}

class ServicioComidas {
  constructor(persistencia) {
    this.model = ModelFactory.get(persistencia);
    this.comidasGuardadasModel = new ModelMongoDBComidasGuardadas();
    this.usuariosModel = new ModelMongoDBUsuarios();
    this.coachPlanModel = new ModelMongoDBCoachPlanConfigs();
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
    return normalizeRole(actor);
  }

  _isAdmin(actor) {
    return this._role(actor) === "admin";
  }

  _isCoach(actor) {
    return this._role(actor) === "coach";
  }

  async _effectiveCapabilities(coach) {
    const currentClients = await this.usuariosModel.countClientsByCoachId(coach._id || coach.id);
    const planCode = normalizeCoachPlanCode(coach?.coachSubscription?.plan || coach?.plan) || "trial_pro";
    const planConfig =
      typeof this.coachPlanModel?.getByCode === "function"
        ? await this.coachPlanModel.getByCode(planCode)
        : normalizePlanConfig(planCode);

    return resolveEffectiveCoachCapabilities({ coach: { ...coach, plan: planCode }, planConfig, currentClients });
  }

  async _assertNutritionAccess(actor, { anyOf = null } = {}) {
    if (this._isAdmin(actor)) return { admin: true, effectiveCapabilities: null };
    if (!this._isCoach(actor)) throw new Error("COACH_NUTRITION_NOT_ALLOWED");
    requireProfessionalScope(actor, "nutrition");
    requireCoachSubscriptionActive(actor, { action: "meals" });

    const effectiveCapabilities = await this._effectiveCapabilities(actor);
    if (effectiveCapabilities?.isTrialExpired) throw new Error("COACH_FEATURE_NOT_ALLOWED");

    const menuFeatures = effectiveCapabilities?.features?.menus || {};
    if (Array.isArray(anyOf) && anyOf.length) {
      const ok = anyOf.some((feature) => !!menuFeatures?.[feature]);
      if (!ok) throw new Error("COACH_FEATURE_NOT_ALLOWED");
    } else if (!anyTruthyFeature(menuFeatures)) {
      throw new Error("COACH_FEATURE_NOT_ALLOWED");
    }

    return { admin: false, effectiveCapabilities };
  }

  async _assertCoachOwnedMealCapacity(actor, effectiveCapabilities = null) {
    if (this._isAdmin(actor)) return { current: 0, limit: null };
    const effective = effectiveCapabilities || await this._effectiveCapabilities(actor);
    const coachId = this._actorId(actor);
    const [createdMeals, savedMeals] = await Promise.all([
      typeof this.model.countOwnedByCoach === "function"
        ? this.model.countOwnedByCoach(coachId)
        : this.model.contarComidas({ ownerId: coachId, ownerType: "coach" }),
      typeof this.comidasGuardadasModel?.countOwnedByCoach === "function"
        ? this.comidasGuardadasModel.countOwnedByCoach(coachId)
        : 0,
    ]);
    const current = Number(createdMeals || 0) + Number(savedMeals || 0);
    const limit = Number(effective?.limits?.maxCoachOwnedMeals);
    if (Number.isFinite(limit) && limit >= 0 && current >= limit) {
      const legacyPlan = effective?.planCode || "trial_pro";
      throw coachResourceLimitError("COACH_MEAL_LIMIT_EXCEEDED", {
        current,
        limit,
        plan: legacyPlan === "vip" ? "coach_ai" : legacyPlan === "pro" ? "coach_pro" : "coach_initial",
        overrideApplied: effective?.sources?.maxCoachOwnedMeals === "override",
        upgradeTarget: legacyPlan === "trial_pro" ? "coach_pro" : legacyPlan === "pro" ? "coach_ai" : null,
        resource: "maxCoachOwnedMeals",
      });
    }
    return { current, limit };
  }

  _canEdit(actor, comida) {
    if (this._isAdmin(actor)) return true;
    return (
      this._isCoach(actor) &&
      comida?.ownerType === "coach" &&
      sameId(comida?.ownerId || comida?.userId, this._actorId(actor))
    );
  }

  _canAccess(actor, comida, effectiveCapabilities = null) {
    if (!comida) return false;
    if (this._isAdmin(actor)) return true;
    if (!this._isCoach(actor)) return false;
    if (this._canEdit(actor, comida)) return true;
    return comida.estado === "activo" && canUseProfessionalTemplate(
      { ...actor, effectiveCapabilities },
      comida,
      "meal"
    );
  }

  async listarComidas(user, filters = {}) {
    const actor = await this._actor(user);
    const access = await this._assertNutritionAccess(actor, {
      anyOf: ["foodLibrarySearch", "menuLibrarySearch", "manualBuilder", "ownTemplates"],
    });
    const scope = normalizeToken(filters.scope, this._isAdmin(actor) ? "all" : "mine");
    let query = {};
    if (!this._isAdmin(actor)) {
      if (["global", "admin", "zumafit", "biblioteca"].includes(scope)) {
        if (access.effectiveCapabilities?.features?.menus?.canUseGlobalMealTemplates !== true) {
          throw new Error("COACH_FEATURE_NOT_ALLOWED");
        }
        query = this.model.adminTemplatesForCoach({
          premium: access.effectiveCapabilities?.features?.menus?.canUsePremiumMealTemplates === true,
        });
      } else {
        query = this.model.ownerOnlyForCoach(this._actorId(actor));
      }
    }
    const comidas = await this.model.listarComidas({
      ...filters,
      query,
    });

    return comidas.map(normalizeDoc);
  }

  async listarTodasAdmin(user) {
    const actor = await this._actor(user);
    if (!this._isAdmin(actor)) throw new Error("FORBIDDEN");
    const comidas = await this.model.listarComidas({});
    return comidas.map(normalizeDoc);
  }

  async obtenerPorId(user, id) {
    const actor = await this._actor(user);
    const access = await this._assertNutritionAccess(actor, {
      anyOf: ["foodLibrarySearch", "menuLibrarySearch", "manualBuilder", "ownTemplates"],
    });

    const comida = normalizeDoc(await this.model.obtenerPorId(id));
    if (!comida) return null;
    if (!this._canAccess(actor, comida, access.effectiveCapabilities)) throw new Error("FORBIDDEN");
    return comida;
  }

  async crearComida(user, payload = {}) {
    const actor = await this._actor(user);
    if (!this._isAdmin(actor)) {
      const access = await this._assertNutritionAccess(actor, {
        anyOf: ["canCreateCoachMeals"],
      });
      await this._assertCoachOwnedMealCapacity(actor, access.effectiveCapabilities);
    }

    const doc = normalizePayload(payload, {
      ownerType: this._isAdmin(actor) ? "admin" : "coach",
      ownerId: this._actorId(actor),
      actorId: this._actorId(actor),
    });

    return normalizeDoc(await this.model.crearComida(doc));
  }

  async actualizarComida(user, id, payload = {}) {
    const actor = await this._actor(user);
    if (!this._isAdmin(actor)) {
      await this._assertNutritionAccess(actor, {
        anyOf: ["ownTemplates", "manualBuilder", "foodLibrarySearch"],
      });
    }

    const current = normalizeDoc(await this.model.obtenerPorId(id));
    if (!current) throw new Error("NOT_FOUND");
    if (!this._canEdit(actor, current)) throw new Error("FORBIDDEN");

    const patch = normalizePatch(payload, current, {
      ownerType: current.ownerType || (this._isAdmin(actor) ? "admin" : "coach"),
      ownerId: current.ownerId || this._actorId(actor),
      actorId: this._actorId(actor),
    });

    return normalizeDoc(await this.model.updateById(id, patch));
  }

  async eliminarComida(user, id) {
    const actor = await this._actor(user);
    if (!this._isAdmin(actor)) {
      await this._assertNutritionAccess(actor, {
        anyOf: ["ownTemplates", "manualBuilder", "foodLibrarySearch"],
      });
    }

    const current = normalizeDoc(await this.model.obtenerPorId(id));
    if (!current) return { deletedCount: 0 };
    if (!this._canEdit(actor, current)) throw new Error("FORBIDDEN");
    return await this.model.borrarComida(id);
  }

  async duplicarComida(user, id, payload = {}) {
    const actor = await this._actor(user);
    let access;
    if (this._isAdmin(actor)) {
      access = await this._assertNutritionAccess(actor);
    } else {
      access = await this._assertNutritionAccess(actor, { anyOf: ["duplicatePlans", "ownTemplates"] });
    }

    const current = normalizeDoc(await this.model.obtenerPorId(id));
    if (!current) throw new Error("NOT_FOUND");
    if (!this._canAccess(actor, current, access.effectiveCapabilities)) throw new Error("FORBIDDEN");
    if (
      !this._isAdmin(actor) &&
      ["admin_global", "admin_premium"].includes(professionalTemplateSource(current)) &&
      access.effectiveCapabilities?.features?.menus?.canDuplicateGlobalTemplates !== true
    ) {
      throw new Error("COACH_FEATURE_NOT_ALLOWED");
    }
    if (!this._isAdmin(actor)) {
      await this._assertCoachOwnedMealCapacity(actor, access.effectiveCapabilities);
    }

    const clone = normalizePayload(
      {
        ...current,
        nombre: cleanText(payload.nombre || `Copia de ${current.nombre}`, "Comida copia", 180),
        descripcion: payload.descripcion ?? current.descripcion,
        tags: current.tags || [],
        items: current.items || [],
        tipoComida: current.tipoComida,
        grupoComida: current.grupoComida,
        visibilidad: this._isAdmin(actor) ? payload.visibilidad || current.visibilidad || "privada" : "privada",
        estado: "activo",
        sourceOriginalId: current._id,
        sourceOriginalType: professionalTemplateSource(current),
      },
      {
        ownerType: this._isAdmin(actor) ? "admin" : "coach",
        ownerId: this._actorId(actor),
        actorId: this._actorId(actor),
      }
    );

    if (!this._isAdmin(actor)) {
      clone.sourceType = "coach_owned";
      clone.planMinimo = "free";
      delete clone.templateTier;
    }
    clone.sourceOriginalId = current._id;
    clone.sourceOriginalType = professionalTemplateSource(current);

    if (mealIdentity(current) === mealIdentity(clone)) {
      throw new Error("DUPLICATE_IDENTICAL");
    }

    return normalizeDoc(await this.model.crearComida(clone));
  }
}

export default ServicioComidas;
