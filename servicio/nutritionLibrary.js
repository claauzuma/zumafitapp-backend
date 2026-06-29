import { ObjectId } from "mongodb";

import ModelMongoDBComidasGuardadas from "../model/DAO/comidasGuardadasMongoDB.js";
import ModelMongoDBMenus from "../model/DAO/menusMongoDB.js";
import ModelMongoDBUsuarios from "../model/DAO/usuariosMongoDB.js";
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
  idToString,
  isAdmin,
  isCoach,
  isClient,
  normalizeRole,
} from "./comidasGuardadasPermisos.js";
import { nextUniqueName } from "./clientOwnMenus.js";
import {
  getAccessLimit,
  requireMenuDaysLimit,
  requireQuota,
} from "./accessGates.js";

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
  const visibility = normalizeVisibility(item.visibilidad || item.visibility);
  const ownerType = normalizeOwnerType(item.ownerType || item.ownerRole || item.creadaPorRol);
  if (isOwner(user, item)) badges.push("Propia");
  if (ownerType === "admin") badges.push("ZumaFit");
  if (ownerType === "coach") badges.push("Coach");
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
    items,
    alimentos: items,
    totales: totals,
    macrosTotales: totals,
    favorita: !!doc.favorita || isFavoriteForUser(user, doc, favoriteField),
    assigned: isClient(user) ? isAssignedToClient(user, doc, assignmentField) : isAssignedByCoach(user, doc, assignmentField),
    badges: normalizeBadges(doc, user, { assignmentField, favoriteField }),
    permissions: {
      canView: canViewNutritionItem(user, doc, { assignmentField }),
      canEdit: canEditNutritionItem(user, doc),
      canCopy: canCopyNutritionItem(user, doc, { assignmentField }),
      canAssign: canAssignNutritionItem(user, doc, { assignmentField }),
      canFavorite: canViewNutritionItem(user, doc, { assignmentField }),
      canUseInTracking: isClient(user) && canViewNutritionItem(user, doc, { assignmentField }),
    },
  };
}

function normalizeMenuForLibrary(doc = {}, user = {}) {
  const comidas = Array.isArray(doc.comidas) ? doc.comidas : [];
  const totals = totalsFromMenuDoc(doc);
  const assignmentField = "asignadoA";
  const favoriteField = "favoritoPara";
  return {
    ...doc,
    id: idToString(doc._id || doc.id),
    kind: "menu",
    nombre: doc.nombre || "Menu",
    ownerType: normalizeOwnerType(doc.ownerType || doc.ownerRole || doc.creadaPorRol),
    ownerId: idToString(doc.ownerId),
    visibilidad: normalizeVisibility(doc.visibilidad || doc.visibility),
    planMinimo: doc.planMinimo || "free",
    comidas,
    cantidadComidas: number(doc.cantidadComidas || comidas.length),
    macrosTotales: totals,
    totales: totals,
    favorito: isFavoriteForUser(user, doc, favoriteField),
    assigned: isClient(user) ? isAssignedToClient(user, doc, assignmentField) : isAssignedByCoach(user, doc, assignmentField),
    badges: normalizeBadges(doc, user, { assignmentField, favoriteField }),
    permissions: {
      canView: canViewNutritionItem(user, doc, { assignmentField }),
      canEdit: canEditNutritionItem(user, doc),
      canCopy: canCopyNutritionItem(user, doc, { assignmentField }),
      canAssign: canAssignNutritionItem(user, doc, { assignmentField }),
      canFavorite: canViewNutritionItem(user, doc, { assignmentField }),
    },
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

function hasAssignment(list = [], clienteId = "", coachId = "") {
  return (Array.isArray(list) ? list : []).some((entry) => {
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      return idToString(entry.clienteId) === idToString(clienteId) && idToString(entry.coachId) === idToString(coachId);
    }
    return idToString(entry) === idToString(clienteId);
  });
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
    this.menusModel = new ModelMongoDBMenus();
    this.usuariosModel = new ModelMongoDBUsuarios();
  }

  async _actor(user = {}) {
    const userId = libraryUserId(user);
    if (!userId) throw new Error("NO_AUTENTICADO");
    const dbUser = await this.usuariosModel.obtenerPorId(userId).catch(() => null);
    return {
      ...(dbUser || {}),
      ...user,
      _id: dbUser?._id || user.id || user._id,
      id: user.id || dbUser?._id,
      role: user.role || dbUser?.role || dbUser?.rol,
      rol: user.role || dbUser?.rol || dbUser?.role,
    };
  }

  async _ownMealCount(actor) {
    return await this.comidasModel.count({
      query: mergeAndQuery(activeQuery(), buildOwnerQuery(actor)),
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

  _mealQuery(actor, filters = {}) {
    const scope = normalizeScope(filters.scope);
    const active = activeQuery();
    if (isAdmin(actor) && scope === "all") return active;
    if (scope === "mine") return mergeAndQuery(active, buildOwnerQuery(actor));
    if (scope === "admin") return mergeAndQuery(active, buildAdminLibraryQuery(actor));
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
        buildAdminLibraryQuery(actor)
      )
    );
  }

  _menuQuery(actor, filters = {}) {
    const scope = normalizeScope(filters.scope);
    const active = activeQuery();
    if (isAdmin(actor) && scope === "all") return active;
    if (scope === "mine") return mergeAndQuery(active, buildOwnerQuery(actor));
    if (scope === "admin") return mergeAndQuery(active, buildAdminLibraryQuery(actor));
    if (scope === "assigned") return mergeAndQuery(active, buildAssignedQuery(actor, "asignadoA"));
    if (scope === "favorites") {
      return mergeAndQuery(active, { favoritoPara: { $in: idValues(libraryUserId(actor)) } });
    }
    return mergeAndQuery(
      active,
      mergeOrQuery(
        buildOwnerQuery(actor),
        buildAssignedQuery(actor, "asignadoA"),
        buildAdminLibraryQuery(actor)
      )
    );
  }

  async listMeals(user, filters = {}) {
    const actor = await this._actor(user);
    const { limit, skip, page } = paging(filters);
    const data = await this.comidasModel.list({
      ...filters,
      limit,
      skip,
      query: this._mealQuery(actor, filters),
    });

    const comidas = (data.items || [])
      .filter((doc) => canViewNutritionItem(actor, doc, { assignmentField: "asignadaA" }))
      .map((doc) => normalizeMealForLibrary(doc, actor));

    return {
      comidas,
      total: data.total || comidas.length,
      limit,
      skip,
      page,
      scope: normalizeScope(filters.scope),
      permissions: getNutritionLibraryLimits(actor),
    };
  }

  async listMenus(user, filters = {}) {
    const actor = await this._actor(user);
    const { limit, skip, page } = paging(filters);
    const data = await this.menusModel.listBase({
      ...filters,
      limit,
      skip,
      includeComidas: filters.includeComidas === "true" || filters.includeComidas === true,
      visibilityQuery: this._menuQuery(actor, filters),
    });

    const menus = (data.items || [])
      .filter((doc) => canViewNutritionItem(actor, doc, { assignmentField: "asignadoA" }))
      .map((doc) => normalizeMenuForLibrary(doc, actor));

    return {
      menus,
      total: data.total || menus.length,
      limit,
      skip,
      page,
      scope: normalizeScope(filters.scope),
      permissions: getNutritionLibraryLimits(actor),
    };
  }

  async copyMealToMine(user, id, payload = {}) {
    const actor = await this._actor(user);
    const current = await this.comidasModel.getById(id);
    if (!current) throw new Error("NOT_FOUND");
    if (!canCopyNutritionItem(actor, current, { assignmentField: "asignadaA" })) throw new Error("FORBIDDEN");
    if (isClient(actor)) {
      requireQuota(actor, "ownMeals", await this._ownMealCount(actor));
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

    return normalizeMealForLibrary(await this.comidasModel.create(copy), actor);
  }

  async copyMenuToMine(user, id, payload = {}) {
    const actor = await this._actor(user);
    const current = await this.menusModel.getBaseById(id);
    if (!current) throw new Error("NOT_FOUND");
    if (!canCopyNutritionItem(actor, current, { assignmentField: "asignadoA" })) throw new Error("FORBIDDEN");
    if (isClient(actor)) {
      requireQuota(actor, "ownMenus", await this._ownMenuCount(actor));
      requireMenuDaysLimit(actor, current);
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
    if (!canViewNutritionItem(actor, current, { assignmentField: "asignadaA" })) throw new Error("FORBIDDEN");
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
    if (!canViewNutritionItem(actor, current, { assignmentField: "asignadoA" })) throw new Error("FORBIDDEN");
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
    if (!canAssignNutritionItem(actor, current, { assignmentField: "asignadaA" })) throw new Error("FORBIDDEN");
    const ids = await this._validateCoachClients(actor, clientIds);
    const list = Array.isArray(current.asignadaA) ? current.asignadaA : [];
    const merged = [...list];
    for (const clientId of ids) {
      if (!hasAssignment(merged, clientId, libraryUserId(actor))) {
        merged.push(assignmentEntry(clientId, libraryUserId(actor)));
      }
    }

    const _id = toObjectId(id);
    if (!_id) throw new Error("ID_INVALIDO");
    await this.comidasModel._col().updateOne(
      { _id },
      {
        $set: {
          asignadaA: merged,
          visibilidad: current.visibilidad === "privada" ? "asignada" : current.visibilidad,
          updatedAt: new Date(),
        },
      }
    );
    return normalizeMealForLibrary(await this.comidasModel.getById(id), actor);
  }

  async assignMenuToClients(user, id, clientIds = []) {
    const actor = await this._actor(user);
    const current = await this.menusModel.getBaseById(id);
    if (!current) throw new Error("NOT_FOUND");
    if (!canAssignNutritionItem(actor, current, { assignmentField: "asignadoA" })) throw new Error("FORBIDDEN");
    const ids = await this._validateCoachClients(actor, clientIds);
    const list = Array.isArray(current.asignadoA) ? current.asignadoA : [];
    const merged = [...list];
    for (const clientId of ids) {
      if (!hasAssignment(merged, clientId, libraryUserId(actor))) {
        merged.push(assignmentEntry(clientId, libraryUserId(actor)));
      }
    }

    const _id = toObjectId(id);
    if (!_id) throw new Error("ID_INVALIDO");
    await this.menusModel._base().updateOne(
      { _id },
      {
        $set: {
          asignadoA: merged,
          visibilidad: current.visibilidad === "privada" ? "asignada" : current.visibilidad,
          updatedAt: new Date(),
        },
      }
    );
    return normalizeMenuForLibrary(await this.menusModel.getBaseById(id), actor);
  }
}

export default ServicioNutritionLibrary;
