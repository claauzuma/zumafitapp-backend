import { ObjectId } from "mongodb";

import ModelMongoDBComidasGuardadas from "../model/DAO/comidasGuardadasMongoDB.js";
import ModelMongoDBComidas from "../model/DAO/comidasMongoDB.js";
import ModelMongoDBMenus from "../model/DAO/menusMongoDB.js";
import ModelMongoDBUsuarios from "../model/DAO/usuariosMongoDB.js";
import ModelMongoDBCoachPlanConfigs from "../model/DAO/coachPlanConfigsMongoDB.js";
import {
  canAssignNutritionItem,
  canCopyNutritionItem,
  canEditNutritionItem,
  canViewNutritionItem,
  getNutritionLibraryLimits,
  idValues,
  isAdminOwned,
  isAssignedByCoach,
  isAssignedToClient,
  isFavoriteForUser,
  isOwner,
  libraryUserId,
  mergeAndQuery,
  mergeOrQuery,
  normalizeOwnerType,
  normalizeVisibility,
  ownerTypeForUser,
  toMongoIdOrString,
  activeQuery,
  buildAdminLibraryQuery,
  buildAssignedQuery,
  buildOwnerQuery,
} from "./nutritionLibraryPermissions.js";
import {
  professionalTemplateSource,
  professionalTemplateTier,
  resolveProfessionalLibraryCapabilities,
} from "./professionalLibraryCapabilities.js";
import {
  idToString,
  isAdmin,
  isCoach,
  isClient,
  normalizeRole,
} from "./comidasGuardadasPermisos.js";
import { nextUniqueName } from "./clientOwnMenus.js";
import {
  CONTEXTUAL_MENU_MATCH_POLICY,
  compareContextualMenuMatches,
  contextualMenuMatch,
  contextualMenuStateAllowed,
  rankContextualMenus,
  reconstructContextualMenu,
  resolveAutomaticMenuMatch,
} from "./nutritionLibraryRanking.js";
import {
  getAccessLimit,
  requireMenuDaysLimit,
  requireQuota,
} from "./accessGates.js";
import {
  coachResourceLimitError,
  normalizeCoachPlanCode,
  normalizePlanConfig,
  resolveEffectiveCoachCapabilities,
} from "./coachPlans.js";
import {
  requireCoachSubscriptionActive,
  requireProfessionalScope,
} from "./professionalAccessRules.js";
import { isEquivalentFoodAllowed } from "./trackingEquivalences.js";

function cleanString(value = "", max = 500) {
  return String(value || "").trim().slice(0, max);
}

function toObjectId(id) {
  const value = cleanString(id);
  return ObjectId.isValid(value) ? new ObjectId(value) : null;
}

function number(value = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function booleanFilter(value) {
  return value === true || ["true", "1", "si", "sí"].includes(String(value || "").trim().toLowerCase());
}

function positiveFilter(value) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function facetStep(kind = "menu", field = "kcal") {
  if (field === "kcal") return kind === "meal" ? 50 : 100;
  return kind === "meal" ? 5 : 10;
}

function nutritionFacetBucket(value, { kind = "menu", field = "kcal" } = {}) {
  const parsed = positiveFilter(value);
  if (parsed === null) return null;
  const step = facetStep(kind, field);
  return Math.round(parsed / step) * step;
}

function facetOptions(items = [], { kind = "menu", field = "kcal" } = {}) {
  const counts = new Map();
  for (const item of items) {
    const source = item?.totales || item?.macrosTotales || {};
    const value = field === "kcal"
      ? source.kcal ?? source.calorias
      : source.proteina ?? source.proteinas ?? source.protein;
    const bucket = nutritionFacetBucket(value, { kind, field });
    if (bucket === null) continue;
    counts.set(bucket, (counts.get(bucket) || 0) + 1);
  }
  return [...counts.entries()]
    .sort(([left], [right]) => left - right)
    .map(([value, count]) => ({ value, count }));
}

function mealTypeOptions(items = []) {
  const counts = new Map();
  for (const item of items) {
    const value = cleanString(item?.tipoComida || item?.mealType || "otra", 40).toLowerCase() || "otra";
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right, "es"))
    .map(([value, count]) => ({ value, count }));
}

function filterWithNutritionFacets(items = [], filters = {}, { kind = "menu" } = {}) {
  const source = Array.isArray(items) ? items : [];
  const requestedType = kind === "meal" ? cleanString(filters.tipoComida || filters.type, 40).toLowerCase() : "";
  const selectedType = requestedType && requestedType !== "todos" ? requestedType : "";
  const selectedKcal = positiveFilter(filters.calorieBucket ?? filters.kcalBucket);
  const selectedProtein = positiveFilter(filters.proteinBucket ?? filters.proteinaBucket);
  const types = kind === "meal" ? mealTypeOptions(source) : [];
  const byType = selectedType
    ? source.filter((item) => cleanString(item?.tipoComida || item?.mealType || "otra", 40).toLowerCase() === selectedType)
    : source;
  const calories = facetOptions(byType, { kind, field: "kcal" });
  const byCalories = selectedKcal === null
    ? byType
    : byType.filter((item) => nutritionFacetBucket(item?.totales?.kcal ?? item?.macrosTotales?.kcal, { kind, field: "kcal" }) === selectedKcal);
  const proteins = facetOptions(byCalories, { kind, field: "proteina" });
  const filtered = selectedProtein === null
    ? byCalories
    : byCalories.filter((item) => nutritionFacetBucket(
        item?.totales?.proteina ?? item?.totales?.proteinas ?? item?.macrosTotales?.proteina ?? item?.macrosTotales?.proteinas,
        { kind, field: "proteina" }
      ) === selectedProtein);
  return {
    items: filtered,
    facets: {
      kind,
      totalAvailable: source.length,
      types,
      calories,
      proteins,
      selected: {
        type: selectedType || null,
        calorieBucket: selectedKcal,
        proteinBucket: selectedProtein,
      },
    },
  };
}

function totalsFromMealDoc(doc = {}) {
  const totals = doc.totales || doc.macrosTotales || doc.macros || {};
  return {
    kcal: number(totals.kcal || totals.calorias),
    proteinas: number(totals.proteinas ?? totals.proteina ?? totals.protein),
    carbohidratos: number(totals.carbohidratos ?? totals.carbs),
    grasas: number(totals.grasas ?? totals.fat),
    fibra: number(totals.fibra),
  };
}

function equivalentTargetFromFilters(filters = {}) {
  const target = {
    kcal: number(filters.targetKcal ?? filters.kcal),
    proteina: number(filters.targetProteina ?? filters.targetProtein ?? filters.proteina),
    carbs: number(filters.targetCarbs ?? filters.targetCarbohidratos ?? filters.carbs),
    grasas: number(filters.targetGrasas ?? filters.targetFat ?? filters.grasas),
  };
  return Object.values(target).some((value) => value > 0) ? target : null;
}

function contextualTargetFromFilters(filters = {}) {
  const raw = [
    filters.targetKcal ?? filters.kcal,
    filters.targetProteina ?? filters.targetProtein ?? filters.proteina,
    filters.targetCarbs ?? filters.targetCarbohidratos ?? filters.carbs,
    filters.targetGrasas ?? filters.targetFat ?? filters.grasas,
  ];
  if (raw.some((value) => value === undefined || value === null || String(value).trim() === "")) return null;
  const parsed = raw.map(Number);
  if (!parsed.every(Number.isFinite) || parsed[0] <= 0 || parsed.slice(1).some((value) => value < 0)) return null;
  return { kcal: parsed[0], proteina: parsed[1], carbs: parsed[2], grasas: parsed[3] };
}

function equivalentMealScore(meal = {}, target = {}, requestedType = "") {
  const source = meal.totales || meal.macrosTotales || {};
  const result = {
    kcal: number(source.kcal),
    proteina: number(source.proteina ?? source.proteinas),
    carbs: number(source.carbs ?? source.carbohidratos),
    grasas: number(source.grasas),
  };
  const diff = {
    kcal: result.kcal - target.kcal,
    proteina: result.proteina - target.proteina,
    carbs: result.carbs - target.carbs,
    grasas: result.grasas - target.grasas,
  };
  const normalized = (value, base, fallback) => Math.abs(value) / Math.max(Math.abs(base), fallback);
  const typePenalty = requestedType && requestedType !== "todos" && meal.tipoComida !== requestedType ? 0.25 : 0;
  const score =
    (target.kcal > 0 ? normalized(diff.kcal, target.kcal, 200) * 10 : 0) +
    (target.proteina > 0 ? normalized(diff.proteina, target.proteina, 20) * 4 : 0) +
    (target.carbs > 0 ? normalized(diff.carbs, target.carbs, 30) * 1.5 : 0) +
    (target.grasas > 0 ? normalized(diff.grasas, target.grasas, 10) * 1.5 : 0) +
    typePenalty;
  return {
    target,
    result,
    diff,
    score: Math.round(score * 10000) / 10000,
    requiresAdjustment:
      Math.abs(diff.kcal) > 1 ||
      (target.proteina > 0 && Math.abs(diff.proteina) > 1) ||
      (target.carbs > 0 && Math.abs(diff.carbs) > 2) ||
      (target.grasas > 0 && Math.abs(diff.grasas) > 1),
  };
}

function mealCompatibleWithRestrictions(actor = {}, meal = {}) {
  if (!isClient(actor)) return true;
  const items = Array.isArray(meal.items) ? meal.items : [];
  return items.length > 0 && items.every((item) => isEquivalentFoodAllowed(actor, {
    ...item,
    id: item.alimentoId || item.id,
    nombre: item.nombre || item.nombreSnapshot,
    kcal: item.kcal,
    proteina: item.proteina ?? item.proteinas,
    carbs: item.carbs ?? item.carbohidratos,
    grasas: item.grasas,
  }));
}

function menuCompatibleWithRestrictions(actor = {}, menu = {}) {
  if (!isClient(actor)) return true;
  const meals = Array.isArray(menu?.comidas) ? menu.comidas : [];
  if (!meals.length) return false;
  return meals.every((meal) => mealCompatibleWithRestrictions(actor, meal));
}

function isContextualMenuRequest(filters = {}) {
  return String(filters.context || filters.view || "").trim().toLowerCase() === "day-menu";
}

function contextualSelectedDate(filters = {}) {
  const value = String(filters.selectedDate || filters.date || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function contextualMenuOrigin(actor = {}, menu = {}) {
  if (isOwner(actor, menu)) return { code: "user_owned", label: "Mi menú" };
  if (isAdminOwned(menu)) return { code: "admin_library", label: "Biblioteca ZumaFit" };
  return null;
}

function contextualMenuCandidate(actor = {}, menu = {}) {
  const origin = contextualMenuOrigin(actor, menu);
  if (!origin) return { allowed: false, reason: "SOURCE_NOT_ALLOWED", origin: null };
  if (!canViewNutritionItem(actor, menu, { assignmentField: "asignadoA", kind: "menu" })) {
    return { allowed: false, reason: "FORBIDDEN", origin };
  }
  if (!contextualMenuStateAllowed(menu, { admin: origin.code === "admin_library" })) {
    return { allowed: false, reason: origin.code === "admin_library" ? "NOT_PUBLISHED" : "INACTIVE_OR_DRAFT", origin };
  }
  if (!menuCompatibleWithRestrictions(actor, menu)) {
    return { allowed: false, reason: "RESTRICTION_MISMATCH", origin };
  }
  return { allowed: true, reason: null, origin };
}

function normalizeContextualMenu(menu = {}, actor = {}, { eligibility = null, equivalence = null, totals = null } = {}) {
  const origin = contextualMenuOrigin(actor, menu);
  const normalized = normalizeMenuForLibrary(totals ? { ...menu, macrosTotales: totals } : menu, actor);
  const originLabel = origin?.label || "Biblioteca";
  return {
    ...normalized,
    libraryOrigin: origin?.code || "unknown",
    originLabel,
    badges: [originLabel, ...(normalized.badges || []).filter((badge) => badge !== originLabel)],
    ...(eligibility ? { contextualEligibility: eligibility } : {}),
    ...(equivalence ? { equivalence } : {}),
  };
}

function totalsFromMenuDoc(doc = {}) {
  const totals = doc.macrosTotales || doc.totales || doc.totalesActuales || {};
  const objetivo = doc.macrosObjetivo || {};
  return {
    kcal: number(totals.kcal ?? doc.kcalObjetivo),
    proteinas: number(totals.proteinas ?? totals.proteina ?? objetivo.proteina),
    carbohidratos: number(totals.carbohidratos ?? totals.carbs ?? objetivo.carbs),
    grasas: number(totals.grasas ?? objetivo.grasas),
    fibra: number(totals.fibra),
  };
}

function normalizeFoodItem(item = {}, index = 0) {
  const snapshot = item.snapshot || {};
  return {
    ...item,
    alimentoId: idToString(item.alimentoId || item.alimentoObjectId || item.id),
    nombre: item.nombre || item.nombreSnapshot || snapshot.nombre || "Alimento",
    cantidad: number(item.cantidad),
    unidad: item.unidad || snapshot.unidad || "g",
    orden: item.orden ?? index + 1,
    kcal: number(item.kcal ?? snapshot.kcal),
    proteinas: number(item.proteinas ?? item.proteina ?? snapshot.proteinas ?? snapshot.proteina),
    carbohidratos: number(item.carbohidratos ?? item.carbs ?? snapshot.carbohidratos ?? snapshot.carbs),
    grasas: number(item.grasas ?? snapshot.grasas),
    fibra: number(item.fibra ?? snapshot.fibra),
    categoria: item.categoria || snapshot.categoria || "",
    imagenUrl: item.imagenUrl || item.imageUrl || item.imagen?.url || snapshot.imagen?.url || snapshot.imagen || "",
    imagenAlt: item.imagenAlt || item.nombre || item.nombreSnapshot || "Alimento",
  };
}

function normalizeMealItems(doc = {}) {
  const items = Array.isArray(doc.items) ? doc.items : Array.isArray(doc.alimentos) ? doc.alimentos : [];
  return items.map(normalizeFoodItem);
}

function normalizeBadges(item = {}, user = {}, { assignmentField = "asignadaA", favoriteField = "favoritaPara" } = {}) {
  const badges = [];
  const sourceType = professionalTemplateSource(item);
  const visibility = normalizeVisibility(item.visibilidad || item.visibility);
  const ownerType = normalizeOwnerType(item.ownerType || item.ownerRole || item.creadaPorRol);
  if (isOwner(user, item)) badges.push("Creado por vos");
  if (["admin_global", "admin_premium"].includes(sourceType) || ownerType === "admin") badges.push("Plantilla ZumaFit");
  if (sourceType === "assigned_snapshot") badges.push("Asignado a cliente");
  if (ownerType === "coach" && !isOwner(user, item)) badges.push("Coach");
  if (visibility === "premium") badges.push("Premium");
  if (visibility === "solo_coaches") badges.push("Solo coaches");
  if (visibility === "solo_clientes") badges.push("Solo clientes");
  if (isClient(user) && isAssignedToClient(user, item, assignmentField)) badges.push("Asignado");
  if (isCoach(user) && isAssignedByCoach(user, item, assignmentField)) badges.push("Asignado");
  if (isFavoriteForUser(user, item, favoriteField)) badges.push("Favorita");
  if (String(item.source || item.origen || "").includes("excel")) badges.push("Excel");
  if (String(item.source || "").startsWith("copied")) badges.push("Copia");
  return [...new Set(badges)];
}

function normalizeMealForLibrary(doc = {}, user = {}) {
  const items = normalizeMealItems(doc);
  const totals = totalsFromMealDoc(doc);
  const assignmentField = "asignadaA";
  const favoriteField = "favoritaPara";
  const sourceType = professionalTemplateSource(doc);
  return {
    ...doc,
    id: idToString(doc._id || doc.id),
    kind: "comida",
    nombre: doc.nombre || "Comida",
    tipoComida: doc.tipoComida || "otro",
    ownerType: normalizeOwnerType(doc.ownerType || doc.ownerRole || doc.creadaPorRol),
    ownerId: idToString(doc.ownerId),
    visibilidad: normalizeVisibility(doc.visibilidad || doc.visibility),
    planMinimo: doc.planMinimo || "free",
    sourceType,
    templateTier: ["admin_global", "admin_premium"].includes(sourceType) ? professionalTemplateTier(doc) : null,
    items,
    alimentos: items,
    totales: totals,
    macrosTotales: totals,
    favorita: !!doc.favorita || isFavoriteForUser(user, doc, favoriteField),
    assigned: isClient(user) ? isAssignedToClient(user, doc, assignmentField) : isAssignedByCoach(user, doc, assignmentField),
    badges: normalizeBadges(doc, user, { assignmentField, favoriteField }),
    permissions: {
      canView: canViewNutritionItem(user, doc, { assignmentField, kind: "meal" }),
      canEdit: canEditNutritionItem(user, doc),
      canCopy: canCopyNutritionItem(user, doc, { assignmentField, kind: "meal" }),
      canAssign: canAssignNutritionItem(user, doc, { assignmentField, kind: "meal" }),
      canFavorite: sourceType !== "assigned_snapshot" && canViewNutritionItem(user, doc, { assignmentField, kind: "meal" }),
      canUseInTracking: isClient(user) && canViewNutritionItem(user, doc, { assignmentField, kind: "meal" }),
    },
  };
}

function normalizeMenuForLibrary(doc = {}, user = {}) {
  const comidas = Array.isArray(doc.comidas) ? doc.comidas : [];
  const totals = totalsFromMenuDoc(doc);
  const assignmentField = "asignadoA";
  const favoriteField = "favoritoPara";
  const sourceType = professionalTemplateSource(doc);
  return {
    ...doc,
    id: idToString(doc._id || doc.id),
    kind: "menu",
    nombre: doc.nombre || "Menu",
    ownerType: normalizeOwnerType(doc.ownerType || doc.ownerRole || doc.creadaPorRol),
    ownerId: idToString(doc.ownerId),
    visibilidad: normalizeVisibility(doc.visibilidad || doc.visibility),
    planMinimo: doc.planMinimo || "free",
    sourceType,
    templateTier: ["admin_global", "admin_premium"].includes(sourceType) ? professionalTemplateTier(doc) : null,
    comidas,
    cantidadComidas: number(doc.cantidadComidas || comidas.length),
    macrosTotales: totals,
    totales: totals,
    favorito: isFavoriteForUser(user, doc, favoriteField),
    assigned: isClient(user) ? isAssignedToClient(user, doc, assignmentField) : isAssignedByCoach(user, doc, assignmentField),
    badges: normalizeBadges(doc, user, { assignmentField, favoriteField }),
    permissions: {
      canView: canViewNutritionItem(user, doc, { assignmentField, kind: "menu" }),
      canEdit: canEditNutritionItem(user, doc),
      canCopy: canCopyNutritionItem(user, doc, { assignmentField, kind: "menu" }),
      canAssign: canAssignNutritionItem(user, doc, { assignmentField, kind: "menu" }),
      canFavorite: sourceType !== "assigned_snapshot" && canViewNutritionItem(user, doc, { assignmentField, kind: "menu" }),
    },
  };
}

function assignedMenuAsLibraryDoc(doc = {}) {
  return {
    ...doc,
    ownerType: "assigned_snapshot",
    ownerId: null,
    source: "assigned_snapshot",
    sourceType: "assigned_snapshot",
    visibilidad: "asignada",
    asignadoA: [assignmentEntry(doc.clienteId, doc.coachId || doc.assignedBy)],
    cantidadComidas: doc.cantidadComidas || (Array.isArray(doc.comidas) ? doc.comidas.length : 0),
    activa: doc.activa !== false && doc.estado !== "revocado",
  };
}

function favoriteArray(list = [], userId = "", shouldFavorite = true) {
  const existing = (Array.isArray(list) ? list : []).map(idToString).filter(Boolean);
  if (!userId) return existing;
  if (!shouldFavorite) return existing.filter((id) => id !== userId);
  return [...new Set([...existing, userId])];
}

function assignmentEntry(clienteId, coachId) {
  return {
    clienteId: toMongoIdOrString(clienteId),
    coachId: toMongoIdOrString(coachId),
    assignedAt: new Date(),
  };
}

function isClientAssignedToCoach(client = {}, coachId = "") {
  const possibleIds = [
    client?.coach?.entrenadorId,
    client?.coach?.coachId,
    client?.coachId,
    client?.entrenadorId,
    client?.profesionalId,
    client?.nutritionCoachId,
  ].map(idToString).filter(Boolean);
  return possibleIds.includes(idToString(coachId));
}

function normalizeScope(value = "") {
  const scope = String(value || "all").trim().toLowerCase();
  if (["mine", "mis", "propias", "own"].includes(scope)) return "mine";
  if (["admin", "zumafit", "library", "biblioteca"].includes(scope)) return "admin";
  if (["assigned", "asignadas", "coach"].includes(scope)) return "assigned";
  if (["favorites", "favoritos", "favoritas"].includes(scope)) return "favorites";
  if (["discover", "explorar", "publicas", "publicos"].includes(scope)) return "discover";
  return "all";
}

function paging(filters = {}) {
  const limit = Math.min(Math.max(Number(filters.limit) || 30, 1), 100);
  const page = Math.max(Number(filters.page) || 1, 1);
  const skip = Math.max(Number(filters.skip) || (page - 1) * limit, 0);
  return { limit, skip, page };
}

class ServicioNutritionLibrary {
  constructor() {
    this.comidasModel = new ModelMongoDBComidasGuardadas();
    this.coachComidasModel = new ModelMongoDBComidas();
    this.menusModel = new ModelMongoDBMenus();
    this.usuariosModel = new ModelMongoDBUsuarios();
    this.coachPlanModel = new ModelMongoDBCoachPlanConfigs();
  }

  async _actor(user = {}) {
    const userId = libraryUserId(user);
    if (!userId) throw new Error("NO_AUTENTICADO");
    const dbUser = await this.usuariosModel.obtenerPorId(userId).catch(() => null);
    const actor = {
      ...(dbUser || {}),
      ...user,
      _id: dbUser?._id || user.id || user._id,
      id: user.id || dbUser?._id,
      role: user.role || dbUser?.role || dbUser?.rol,
      rol: user.role || dbUser?.rol || dbUser?.role,
    };
    if (isCoach(actor)) {
      requireProfessionalScope(actor, "nutrition");
      requireCoachSubscriptionActive(actor, { action: "nutrition_library" });
      const planCode = normalizeCoachPlanCode(actor?.coachSubscription?.plan || actor?.plan) || "trial_pro";
      const planConfig = typeof this.coachPlanModel?.getByCode === "function"
        ? await this.coachPlanModel.getByCode(planCode)
        : normalizePlanConfig(planCode);
      const [currentClients, currentCoachOwnedMenus, currentCoachOwnedMeals] = await Promise.all([
        typeof this.usuariosModel?.countClientsByCoachId === "function"
          ? this.usuariosModel.countClientsByCoachId(actor._id || actor.id)
          : 0,
        this._ownMenuCount(actor),
        this._coachOwnedMealCount(actor),
      ]);
      actor.effectiveCapabilities = resolveEffectiveCoachCapabilities({
        coach: { ...actor, plan: planCode },
        planConfig,
        currentClients,
        currentCoachOwnedMenus,
        currentCoachOwnedMeals,
      });
    }
    return actor;
  }

  async _ownMealCount(actor) {
    return await this.comidasModel.count({
      query: mergeAndQuery(activeQuery(), buildOwnerQuery(actor)),
    });
  }

  async _coachOwnedMealCount(actor) {
    const [saved, created] = await Promise.all([
      this._ownMealCount(actor),
      typeof this.coachComidasModel?.countOwnedByCoach === "function"
        ? this.coachComidasModel.countOwnedByCoach(libraryUserId(actor))
        : 0,
    ]);
    return Number(saved || 0) + Number(created || 0);
  }

  _assertCoachLibraryCapacity(actor, kind, current) {
    if (!isCoach(actor)) return;
    const meal = kind === "meal";
    const key = meal ? "maxCoachOwnedMeals" : "maxCoachOwnedMenus";
    const code = meal ? "COACH_MEAL_LIMIT_EXCEEDED" : "COACH_MENU_LIMIT_EXCEEDED";
    const limit = Number(actor?.effectiveCapabilities?.limits?.[key]);
    if (!Number.isFinite(limit) || limit < 0 || Number(current || 0) < limit) return;
    const legacyPlan = actor?.effectiveCapabilities?.planCode || "trial_pro";
    throw coachResourceLimitError(code, {
      current,
      limit,
      plan: legacyPlan === "vip" ? "coach_ai" : legacyPlan === "pro" ? "coach_pro" : "coach_initial",
      overrideApplied: actor?.effectiveCapabilities?.sources?.[key] === "override",
      upgradeTarget: legacyPlan === "trial_pro" ? "coach_pro" : legacyPlan === "pro" ? "coach_ai" : null,
      resource: key,
    });
  }

  async _ownMenuCount(actor) {
    const data = await this.menusModel.listBase({
      limit: 1,
      skip: 0,
      visibilityQuery: mergeAndQuery(activeQuery(), buildOwnerQuery(actor)),
    });
    return Number(data.total || 0);
  }

  async _favoriteCount(actor) {
    const userId = libraryUserId(actor);
    const [meals, menus] = await Promise.all([
      this.comidasModel.count({
        query: mergeAndQuery(activeQuery(), {
          $or: [
            { favoritaPara: { $in: idValues(userId) } },
            mergeAndQuery(buildOwnerQuery(actor), { favorita: true }),
          ],
        }),
      }),
      this.menusModel.listBase({
        limit: 1,
        skip: 0,
        visibilityQuery: mergeAndQuery(activeQuery(), { favoritoPara: { $in: idValues(userId) } }),
      }),
    ]);
    return Number(meals || 0) + Number(menus?.total || 0);
  }

  _assertLibraryScope(actor, filters = {}, kind = "menu") {
    const scope = normalizeScope(filters.scope);
    if (!isCoach(actor) || !["admin", "discover"].includes(scope)) return;
    const capabilities = resolveProfessionalLibraryCapabilities(actor);
    const allowed = kind === "meal"
      ? capabilities.canUseGlobalMealTemplates === true
      : capabilities.canUseGlobalMenuTemplates === true;
    if (!allowed) throw new Error("FORBIDDEN");
  }

  _mealQuery(actor, filters = {}) {
    const scope = normalizeScope(filters.scope);
    const active = activeQuery();
    if (isAdmin(actor) && scope === "all") return active;
    if (isCoach(actor) && scope === "all") return mergeAndQuery(active, buildOwnerQuery(actor));
    if (scope === "mine") return mergeAndQuery(active, buildOwnerQuery(actor));
    if (scope === "admin") return mergeAndQuery(active, buildAdminLibraryQuery(actor, { kind: "meal" }));
    if (scope === "discover") {
      return mergeAndQuery(active, mergeOrQuery(buildOwnerQuery(actor), buildAdminLibraryQuery(actor, { kind: "meal" })));
    }
    if (scope === "assigned") return mergeAndQuery(active, buildAssignedQuery(actor, "asignadaA"));
    if (scope === "favorites") {
      const userId = libraryUserId(actor);
      return mergeAndQuery(active, {
        $or: [
          { favoritaPara: { $in: idValues(userId) } },
          mergeAndQuery(buildOwnerQuery(actor), { favorita: true }),
        ],
      });
    }
    return mergeAndQuery(
      active,
      mergeOrQuery(
        buildOwnerQuery(actor),
        buildAssignedQuery(actor, "asignadaA"),
        buildAdminLibraryQuery(actor, { kind: "meal" })
      )
    );
  }

  _menuQuery(actor, filters = {}) {
    const scope = normalizeScope(filters.scope);
    const active = activeQuery();
    if (isAdmin(actor) && scope === "all") return active;
    if (isCoach(actor) && scope === "all") return mergeAndQuery(active, buildOwnerQuery(actor));
    if (scope === "mine") return mergeAndQuery(active, buildOwnerQuery(actor));
    if (scope === "admin") return mergeAndQuery(active, buildAdminLibraryQuery(actor, { kind: "menu" }));
    if (scope === "discover") {
      return mergeAndQuery(active, mergeOrQuery(buildOwnerQuery(actor), buildAdminLibraryQuery(actor, { kind: "menu" })));
    }
    if (scope === "assigned") return mergeAndQuery(active, buildAssignedQuery(actor, "asignadoA"));
    if (scope === "favorites") {
      return mergeAndQuery(active, { favoritoPara: { $in: idValues(libraryUserId(actor)) } });
    }
    return mergeAndQuery(
      active,
      mergeOrQuery(
        buildOwnerQuery(actor),
        buildAssignedQuery(actor, "asignadoA"),
        buildAdminLibraryQuery(actor, { kind: "menu" })
      )
    );
  }

  async listMeals(user, filters = {}) {
    const actor = await this._actor(user);
    this._assertLibraryScope(actor, filters, "meal");
    const { limit, skip, page } = paging(filters);
    const equivalentTarget = equivalentTargetFromFilters(filters);
    const includeFacets = booleanFilter(filters.includeFacets);
    const fetchLimit = includeFacets ? 500 : equivalentTarget ? 100 : limit;
    const fetchSkip = includeFacets || equivalentTarget ? 0 : skip;
    const data = await this.comidasModel.list({
      ...filters,
      ...(includeFacets ? { tipoComida: "todos", type: "todos", max: 500 } : {}),
      limit: fetchLimit,
      skip: fetchSkip,
      query: this._mealQuery(actor, filters),
    });

    let comidas = (data.items || [])
      .filter((doc) => canViewNutritionItem(actor, doc, { assignmentField: "asignadaA", kind: "meal" }))
      .map((doc) => normalizeMealForLibrary(doc, actor))
      .filter((meal) => mealCompatibleWithRestrictions(actor, meal));

    if (includeFacets) {
      const filtered = filterWithNutritionFacets(comidas, filters, { kind: "meal" });
      comidas = filtered.items.slice(skip, skip + limit);
      return {
        comidas,
        total: filtered.items.length,
        limit,
        skip,
        page,
        scope: normalizeScope(filters.scope),
        facets: {
          ...filtered.facets,
          complete: Number(data.total || 0) <= fetchLimit,
        },
        permissions: getNutritionLibraryLimits(actor),
      };
    }

    if (equivalentTarget) {
      comidas = comidas
        .map((meal) => ({
          ...meal,
          equivalence: equivalentMealScore(meal, equivalentTarget, String(filters.tipoComida || "")),
        }))
        .sort((a, b) => a.equivalence.score - b.equivalence.score)
        .slice(skip, skip + limit);
    }

    return {
      comidas,
      total: equivalentTarget ? Math.min(Number(data.total) || comidas.length, fetchLimit) : data.total || comidas.length,
      limit,
      skip,
      page,
      scope: isCoach(actor) && normalizeScope(filters.scope) === "all" ? "mine" : normalizeScope(filters.scope),
      permissions: getNutritionLibraryLimits(actor),
      ...(equivalentTarget ? { equivalentTarget, matchingWindowLimited: Number(data.total || 0) > fetchLimit } : {}),
    };
  }

  async listMenus(user, filters = {}) {
    const actor = await this._actor(user);
    this._assertLibraryScope(actor, filters, "menu");
    const { limit, skip, page } = paging(filters);
    const scope = normalizeScope(filters.scope);
    const contextual = isContextualMenuRequest(filters);
    const automaticMatchRequested = contextual && booleanFilter(filters.automaticMatch);
    const prioritizeFavorites = !automaticMatchRequested || booleanFilter(filters.preferFavorites);
    const equivalentTarget = contextual ? contextualTargetFromFilters(filters) : equivalentTargetFromFilters(filters);
    const includeFacets = !contextual && booleanFilter(filters.includeFacets);
    const selectedDate = contextualSelectedDate(filters);
    const targetMeals = Number(filters.targetMeals || filters.cantidadComidas || filters.meals);
    const fetchLimit = includeFacets ? 500 : equivalentTarget ? 200 : limit;
    const fetchSkip = includeFacets || equivalentTarget ? 0 : skip;
    if (contextual && (!equivalentTarget || !selectedDate)) {
      const error = new Error("INVALID_CONTEXT_TARGET");
      error.details = { selectedDate, equivalentTarget };
      throw error;
    }

    if (contextual && scope !== "assigned") {
      let rawMenus = [];
      let sourceTotal = 0;
      let matchingWindowLimited = false;

      if (scope === "all") {
        const [adminData, ownData] = await Promise.all([
          this.menusModel.listBase({
            ...filters,
            limit: fetchLimit,
            skip: 0,
            includeComidas: true,
            visibilityQuery: this._menuQuery(actor, { ...filters, scope: "admin" }),
          }),
          this.menusModel.listBase({
            ...filters,
            limit: fetchLimit,
            skip: 0,
            includeComidas: true,
            visibilityQuery: this._menuQuery(actor, { ...filters, scope: "mine" }),
          }),
        ]);
        rawMenus = [...(adminData.items || []), ...(ownData.items || [])];
        sourceTotal = Number(adminData.total || 0) + Number(ownData.total || 0);
        matchingWindowLimited = Number(adminData.total || 0) > fetchLimit || Number(ownData.total || 0) > fetchLimit;
      } else {
        const data = await this.menusModel.listBase({
          ...filters,
          limit: fetchLimit,
          skip: 0,
          includeComidas: true,
          visibilityQuery: this._menuQuery(actor, filters),
        });
        rawMenus = data.items || [];
        sourceTotal = Number(data.total || 0);
        matchingWindowLimited = sourceTotal > fetchLimit;
      }

      if (scope === "mine") {
        const mine = rawMenus
          .filter((menu) => isOwner(actor, menu))
          .filter((menu) => canViewNutritionItem(actor, menu, { assignmentField: "asignadoA", kind: "menu" }))
          .map((menu) => {
            const reconstruction = reconstructContextualMenu(menu);
            const stateAllowed = contextualMenuStateAllowed(menu, { admin: false });
            const restrictionsAllowed = menuCompatibleWithRestrictions(actor, menu);
            const eligible = reconstruction.valid && stateAllowed && restrictionsAllowed;
            const equivalence = reconstruction.valid
              ? contextualMenuMatch(menu, equivalentTarget, {
                  reconstructed: reconstruction,
                  targetMeals,
                  ownOrFavorite: true,
                })
              : null;
            return normalizeContextualMenu(menu, actor, {
              totals: reconstruction.valid ? reconstruction.totals : null,
              equivalence,
              eligibility: {
                eligible,
                reason: !reconstruction.valid
                  ? reconstruction.reason
                  : !stateAllowed
                    ? "INACTIVE_OR_DRAFT"
                    : !restrictionsAllowed
                      ? "RESTRICTION_MISMATCH"
                      : equivalence?.level === "outside"
                        ? "OUTSIDE_RANGE"
                        : null,
              },
            });
          })
          .sort((left, right) => {
            if (left.equivalence && right.equivalence) return compareContextualMenuMatches(left.equivalence, right.equivalence);
            if (left.equivalence) return -1;
            if (right.equivalence) return 1;
            return String(left.id).localeCompare(String(right.id));
          });
        return {
          menus: mine.slice(skip, skip + limit),
          total: mine.length,
          limit,
          skip,
          page,
          scope,
          selectedDate,
          equivalentTarget,
          contextual: true,
          levelUsed: "saved",
          excludedInvalid: mine.filter((menu) => !menu.contextualEligibility?.eligible).length,
          outOfRangeCount: mine.filter((menu) => menu.equivalence?.level === "outside").length,
          matchingWindowLimited,
          policy: CONTEXTUAL_MENU_MATCH_POLICY,
          permissions: getNutritionLibraryLimits(actor),
        };
      }

      const eligible = [];
      const excludedByPolicy = [];
      for (const menu of rawMenus) {
        const candidate = contextualMenuCandidate(actor, menu);
        if (!candidate.allowed) {
          excludedByPolicy.push({ id: idToString(menu._id || menu.id), reason: candidate.reason });
          continue;
        }
        eligible.push({
          ...menu,
          isOwned: candidate.origin.code === "user_owned",
          favorito: prioritizeFavorites && isFavoriteForUser(actor, menu, "favoritoPara"),
        });
      }
      const ranked = rankContextualMenus(eligible, equivalentTarget, { targetMeals });
      const menus = ranked.menus
        .slice(skip, skip + limit)
        .map((menu) => normalizeContextualMenu(menu, actor, {
          totals: menu._reconstructedTotals,
          equivalence: menu.equivalence,
          eligibility: { eligible: true, reason: null },
        }));
      const automaticResolutionRaw = automaticMatchRequested
        ? resolveAutomaticMenuMatch(ranked, equivalentTarget)
        : null;
      const automaticResolution = automaticResolutionRaw
        ? {
            ...automaticResolutionRaw,
            candidate: automaticResolutionRaw.candidate
              ? normalizeContextualMenu(automaticResolutionRaw.candidate, actor, {
                  totals: automaticResolutionRaw.candidate._reconstructedTotals,
                  equivalence: automaticResolutionRaw.candidate.equivalence,
                  eligibility: { eligible: true, reason: null },
                })
              : null,
          }
        : null;
      return {
        menus,
        total: ranked.compatibleCount,
        limit,
        skip,
        page,
        scope,
        selectedDate,
        equivalentTarget,
        contextual: true,
        levelUsed: ranked.levelUsed,
        highCount: ranked.highCount,
        compatibleCount: ranked.compatibleCount,
        outOfRangeCount: ranked.outside.length,
        excludedInvalid: ranked.invalid.length + excludedByPolicy.length,
        deduplicatedCount: ranked.deduplicatedCount,
        sourceTotal,
        matchingWindowLimited,
        policy: CONTEXTUAL_MENU_MATCH_POLICY,
        ...(automaticResolution ? { automaticResolution } : {}),
        permissions: getNutritionLibraryLimits(actor),
      };
    }

    if (scope === "assigned") {
      const actorId = libraryUserId(actor);
      const currentCoachId = isClient(actor)
        ? idToString(
            actor?.coach?.entrenadorId ||
            actor?.coach?.coachId ||
            actor?.coachId ||
            actor?.entrenadorId ||
            actor?.profesionalId
          )
        : "";
      const data = await this.menusModel.listAssigned({
        ...filters,
        limit: fetchLimit,
        skip: fetchSkip,
        ...(isCoach(actor) ? { coachId: actorId } : {}),
        ...(isClient(actor) ? { clienteId: actorId, coachId: currentCoachId || "__none__" } : {}),
      });
      let menus = (data.items || []).map((doc) => normalizeMenuForLibrary(assignedMenuAsLibraryDoc(doc), actor));
      if (equivalentTarget) {
        menus = menus
          .map((menu) => ({ ...menu, equivalence: equivalentMealScore(menu, equivalentTarget) }))
          .sort((a, b) => a.equivalence.score - b.equivalence.score)
          .slice(skip, skip + limit);
      }
      return {
        menus,
        total: equivalentTarget ? Math.min(Number(data.total) || menus.length, fetchLimit) : data.total || menus.length,
        limit,
        skip,
        page,
        scope,
        permissions: getNutritionLibraryLimits(actor),
        ...(equivalentTarget ? { equivalentTarget, matchingWindowLimited: Number(data.total || 0) > fetchLimit } : {}),
      };
    }
    const data = await this.menusModel.listBase({
      ...filters,
      limit: fetchLimit,
      skip: fetchSkip,
      ...(includeFacets ? { max: 500 } : {}),
      includeComidas: filters.includeComidas === "true" || filters.includeComidas === true,
      visibilityQuery: this._menuQuery(actor, filters),
    });

    let menus = (data.items || [])
      .filter((doc) => canViewNutritionItem(actor, doc, { assignmentField: "asignadoA", kind: "menu" }))
      .map((doc) => normalizeMenuForLibrary(doc, actor));

    if (includeFacets) {
      const filtered = filterWithNutritionFacets(menus, filters, { kind: "menu" });
      menus = filtered.items.slice(skip, skip + limit);
      return {
        menus,
        total: filtered.items.length,
        limit,
        skip,
        page,
        scope,
        facets: {
          ...filtered.facets,
          complete: Number(data.total || 0) <= fetchLimit,
        },
        permissions: getNutritionLibraryLimits(actor),
      };
    }

    if (equivalentTarget) {
      menus = menus
        .map((menu) => ({ ...menu, equivalence: equivalentMealScore(menu, equivalentTarget) }))
        .sort((a, b) => a.equivalence.score - b.equivalence.score)
        .slice(skip, skip + limit);
    }

    return {
      menus,
      total: equivalentTarget ? Math.min(Number(data.total) || menus.length, fetchLimit) : data.total || menus.length,
      limit,
      skip,
      page,
      scope: isCoach(actor) && scope === "all" ? "mine" : scope,
      permissions: getNutritionLibraryLimits(actor),
      ...(equivalentTarget ? { equivalentTarget, matchingWindowLimited: Number(data.total || 0) > fetchLimit } : {}),
    };
  }

  async copyMealToMine(user, id, payload = {}) {
    const actor = await this._actor(user);
    const current = await this.comidasModel.getById(id);
    if (!current) throw new Error("NOT_FOUND");
    if (!canCopyNutritionItem(actor, current, { assignmentField: "asignadaA", kind: "meal" })) throw new Error("FORBIDDEN");
    if (isClient(actor)) {
      requireQuota(actor, "ownMeals", await this._ownMealCount(actor));
    }
    if (isCoach(actor)) {
      this._assertCoachLibraryCapacity(actor, "meal", await this._coachOwnedMealCount(actor));
    }

    const role = normalizeRole(actor);
    const ownerType = ownerTypeForUser(actor);
    const now = new Date();
    const copy = {
      ...current,
      nombre: cleanString(payload.nombre || current.nombre || "Comida", 180),
      ownerType,
      ownerId: libraryUserId(actor),
      ownerRole: role,
      creadaPorRol: role,
      creadaPorId: libraryUserId(actor),
      creadaPorUserId: libraryUserId(actor),
      visibilidad: "privada",
      planMinimo: "free",
      source: isAdminOwned(current) ? "copied_from_admin" : "copied_from_library",
      sourceType: ownerType === "coach" ? "coach_owned" : ownerType === "cliente" ? "client_owned" : "admin_global",
      sourceOriginalId: current._id,
      asignadaA: [],
      favorita: false,
      favoritaPara: [],
      activo: true,
      activa: true,
      createdAt: now,
      updatedAt: now,
    };
    delete copy._id;
    delete copy.id;
    delete copy.immutableSnapshot;
    delete copy.snapshotVersion;
    delete copy.assignedClientId;
    delete copy.assignedByCoachId;
    delete copy.sourceTemplateTier;

    return normalizeMealForLibrary(await this.comidasModel.create(copy), actor);
  }

  async _menuLibraryItemById(id) {
    const base = await this.menusModel.getBaseById(id);
    if (base) return base;
    if (typeof this.menusModel.getAssignedById !== "function") return null;
    const assigned = await this.menusModel.getAssignedById(id);
    return assigned ? assignedMenuAsLibraryDoc(assigned) : null;
  }

  async copyMenuToMine(user, id, payload = {}) {
    const actor = await this._actor(user);
    const current = await this._menuLibraryItemById(id);
    if (!current) throw new Error("NOT_FOUND");
    if (!canCopyNutritionItem(actor, current, { assignmentField: "asignadoA", kind: "menu" })) throw new Error("FORBIDDEN");
    if (isClient(actor)) {
      requireQuota(actor, "ownMenus", await this._ownMenuCount(actor));
      requireMenuDaysLimit(actor, current);
    }
    if (isCoach(actor)) {
      this._assertCoachLibraryCapacity(actor, "menu", await this._ownMenuCount(actor));
    }

    const ownerType = ownerTypeForUser(actor);

    const ownMenus = ownerType === "cliente"
      ? await this.menusModel.listBase({
          limit: 500,
          skip: 0,
          visibilityQuery: mergeAndQuery(activeQuery(), buildOwnerQuery(actor)),
        })
      : { items: [] };
    const copyName = ownerType === "cliente"
      ? nextUniqueName(payload.nombre || current.nombre || "Menu", (ownMenus.items || []).map((menu) => menu.nombre))
      : cleanString(payload.nombre || current.nombre || "Menu", 180);
    const now = new Date();
    const requestedStartDate = /^\d{4}-\d{2}-\d{2}$/.test(cleanString(payload.fechaInicio || payload.selectedDate || "", 10))
      ? cleanString(payload.fechaInicio || payload.selectedDate, 10)
      : null;
    const copy = {
      ...current,
      nombre: copyName,
      nombreNormalizado: copyName
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim(),
      menuKey: `${cleanString(current.menuKey || current.nombre || "menu", 120)}_copy_${Date.now()}`,
      ownerType,
      ownerId: toMongoIdOrString(libraryUserId(actor)),
      creadaPorRol: normalizeRole(actor),
      creadaPorUserId: toMongoIdOrString(libraryUserId(actor)),
      createdBy: toMongoIdOrString(libraryUserId(actor)),
      visibilidad: "privada",
      planMinimo: "free",
      source: isAdminOwned(current) ? "copied_from_admin" : "copied_from_library",
      sourceType: ownerType === "coach" ? "coach_owned" : ownerType === "cliente" ? "client_owned" : "admin_global",
      sourceOriginalId: current._id,
      asignadoA: [],
      favoritoPara: [],
      estado: "activo",
      activa: true,
      createdAt: now,
      updatedAt: now,
    };
    delete copy._id;
    delete copy.id;
    delete copy.immutableSnapshot;
    delete copy.snapshotVersion;
    delete copy.clienteId;
    delete copy.coachId;
    delete copy.menuBaseId;
    delete copy.assignedBy;
    delete copy.assignedByRole;
    delete copy.fechaInicio;
    delete copy.fechaFin;
    delete copy.notasCoach;
    delete copy.historialCambios;
    delete copy.totalesActuales;
    delete copy.sourceTemplateTier;
    if (requestedStartDate) copy.fechaInicio = requestedStartDate;

    const created = await this.menusModel.createBase(copy);
    if (isClient(actor)) {
      const data = await this.menusModel.listBase({
        limit: 1,
        skip: 0,
        visibilityQuery: mergeAndQuery(activeQuery(), buildOwnerQuery(actor)),
      });
      const currentCount = Number(data.total || 0);
      const limit = getAccessLimit(actor, "ownMenus");
      if (Number.isFinite(limit) && currentCount > limit) {
        await this.menusModel.updateBaseById(created._id, {
          estado: "inactivo",
          activa: false,
          activo: false,
          deletedAt: new Date(),
          deletedReason: "PLAN_LIMIT_RACE",
        }).catch(() => null);
        const error = new Error("PLAN_LIMIT_REACHED");
        error.resource = "ownMenus";
        error.current = Math.max(0, currentCount - 1);
        error.limit = limit;
        error.plan = actor?.plan || "free";
        throw error;
      }
    }

    return normalizeMenuForLibrary(created, actor);
  }

  async setMealFavorite(user, id, favorite = true) {
    const actor = await this._actor(user);
    const current = await this.comidasModel.getById(id);
    if (!current) throw new Error("NOT_FOUND");
    if (professionalTemplateSource(current) === "assigned_snapshot") throw new Error("FORBIDDEN");
    if (!canViewNutritionItem(actor, current, { assignmentField: "asignadaA", kind: "meal" })) throw new Error("FORBIDDEN");
    const userId = libraryUserId(actor);
    if (isClient(actor) && favorite && !isFavoriteForUser(actor, current, "favoritaPara")) {
      requireQuota(actor, "favorites", await this._favoriteCount(actor));
    }
    const next = favoriteArray(current.favoritaPara, userId, favorite);
    const _id = toObjectId(id);
    if (!_id) throw new Error("ID_INVALIDO");
    await this.comidasModel._col().updateOne(
      { _id },
      { $set: { favoritaPara: next, updatedAt: new Date() } }
    );
    return normalizeMealForLibrary(await this.comidasModel.getById(id), actor);
  }

  async setMenuFavorite(user, id, favorite = true) {
    const actor = await this._actor(user);
    const current = await this.menusModel.getBaseById(id);
    if (!current) throw new Error("NOT_FOUND");
    if (!canViewNutritionItem(actor, current, { assignmentField: "asignadoA", kind: "menu" })) throw new Error("FORBIDDEN");
    if (isClient(actor) && favorite && !isFavoriteForUser(actor, current, "favoritoPara")) {
      requireQuota(actor, "favorites", await this._favoriteCount(actor));
    }
    const next = favoriteArray(current.favoritoPara, libraryUserId(actor), favorite);
    const _id = toObjectId(id);
    if (!_id) throw new Error("ID_INVALIDO");
    await this.menusModel._base().updateOne(
      { _id },
      { $set: { favoritoPara: next, updatedAt: new Date() } }
    );
    return normalizeMenuForLibrary(await this.menusModel.getBaseById(id), actor);
  }

  async _validateCoachClients(actor, clientIds = []) {
    const ids = [...new Set((Array.isArray(clientIds) ? clientIds : [clientIds]).map(idToString).filter(Boolean))];
    if (!ids.length) throw new Error("CLIENTES_REQUERIDOS");

    for (const clientId of ids) {
      const client = await this.usuariosModel.obtenerPorId(clientId);
      if (!client || normalizeRole(client) !== "cliente") throw new Error("CLIENTE_INVALIDO");
      if (isCoach(actor) && !isClientAssignedToCoach(client, libraryUserId(actor))) {
        throw new Error("CLIENT_NOT_ASSIGNED_TO_COACH");
      }
    }
    return ids;
  }

  async assignMealToClients(user, id, clientIds = []) {
    const actor = await this._actor(user);
    const current = await this.comidasModel.getById(id);
    if (!current) throw new Error("NOT_FOUND");
    if (!canAssignNutritionItem(actor, current, { assignmentField: "asignadaA", kind: "meal" })) throw new Error("FORBIDDEN");
    const ids = await this._validateCoachClients(actor, clientIds);
    const snapshots = [];
    for (const clientId of ids) {
      const assignment = assignmentEntry(clientId, libraryUserId(actor));
      const snapshot = {
        ...current,
        ownerType: "assigned_snapshot",
        ownerId: null,
        ownerRole: "coach",
        creadaPorRol: "coach",
        creadaPorId: toMongoIdOrString(libraryUserId(actor)),
        creadaPorUserId: toMongoIdOrString(libraryUserId(actor)),
        visibilidad: "asignada",
        planMinimo: "free",
        source: "assigned_snapshot",
        sourceType: "assigned_snapshot",
        sourceOriginalId: current._id,
        sourceOriginalType: professionalTemplateSource(current),
        sourceTemplateTier: professionalTemplateTier(current),
        assignedClientId: toMongoIdOrString(clientId),
        assignedByCoachId: toMongoIdOrString(libraryUserId(actor)),
        asignadaA: [assignment],
        favorita: false,
        favoritaPara: [],
        immutableSnapshot: true,
        snapshotVersion: 1,
        activo: true,
        activa: true,
        estado: "activo",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      delete snapshot._id;
      delete snapshot.id;
      snapshots.push(await this.comidasModel.create(snapshot));
    }
    const first = snapshots[0] || null;
    return {
      ...(first ? normalizeMealForLibrary(first, actor) : {}),
      assignmentSnapshots: snapshots.map((snapshot) => normalizeMealForLibrary(snapshot, actor)),
    };
  }

  async assignMenuToClients(user, id, clientIds = []) {
    const actor = await this._actor(user);
    const current = await this._menuLibraryItemById(id);
    if (!current) throw new Error("NOT_FOUND");
    if (!canAssignNutritionItem(actor, current, { assignmentField: "asignadoA", kind: "menu" })) throw new Error("FORBIDDEN");
    const ids = await this._validateCoachClients(actor, clientIds);
    const snapshots = [];
    for (const clientId of ids) {
      const client = await this.usuariosModel.obtenerPorId(clientId);
      await this.menusModel.pauseActiveForClient(clientId);
      const snapshot = {
        clienteId: toMongoIdOrString(clientId),
        coachId: toMongoIdOrString(libraryUserId(actor)),
        menuBaseId: current._id,
        nombre: cleanString(current.nombre || "Menu asignado", 180),
        descripcion: cleanString(current.descripcion, 2500),
        fechaInicio: new Date(),
        fechaFin: null,
        estado: "activo",
        activa: true,
        kcalObjetivo: number(current.kcalObjetivo),
        macrosObjetivo: { ...(current.macrosObjetivo || {}) },
        totalesActuales: totalsFromMenuDoc(current),
        comidas: Array.isArray(current.comidas)
          ? current.comidas.map((meal) => ({
              ...meal,
              items: Array.isArray(meal?.items) ? meal.items.map((item) => ({ ...item })) : [],
            }))
          : [],
        notasCoach: "",
        historialCambios: [],
        source: "assigned_snapshot",
        sourceType: "assigned_snapshot",
        sourceOriginalId: current._id,
        sourceOriginalType: professionalTemplateSource(current),
        sourceTemplateTier: professionalTemplateTier(current),
        immutableSnapshot: true,
        snapshotVersion: 1,
        assignedBy: toMongoIdOrString(libraryUserId(actor)),
        assignedByRole: "coach",
      };
      const created = await this.menusModel.createAssigned(snapshot);
      snapshots.push(created);
      await this.usuariosModel.updateById(clientId, {
        menu: {
          ...(client?.menu || {}),
          activeSource: "coach",
          activeOwnMenuId: null,
          updatedAt: new Date(),
          updatedByCoachId: toMongoIdOrString(libraryUserId(actor)),
        },
        updatedAt: new Date(),
      });
    }
    const normalized = snapshots.map((snapshot) => normalizeMenuForLibrary(assignedMenuAsLibraryDoc(snapshot), actor));
    return {
      ...(normalized[0] || {}),
      assignmentSnapshots: normalized,
    };
  }
}

export default ServicioNutritionLibrary;

export {
  equivalentMealScore,
  filterWithNutritionFacets,
  normalizeMenuForLibrary,
  nutritionFacetBucket,
  equivalentTargetFromFilters,
  mealCompatibleWithRestrictions,
};
