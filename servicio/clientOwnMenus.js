import { ObjectId } from "mongodb";

import ModelMongoDBAlimentos from "../model/DAO/alimentosMongoDB.js";
import ModelMongoDBMenus from "../model/DAO/menusMongoDB.js";
import ModelMongoDBUsuarios from "../model/DAO/usuariosMongoDB.js";
import {
  clientHasCoach,
  getClientNutritionCapabilities,
  normalizeClientPlan,
  normalizeClientRole,
} from "./clientNutritionCapabilities.js";
import {
  canViewNutritionItem,
  idValues,
  normalizeVisibility,
} from "./nutritionLibraryPermissions.js";

const MENU_DAYS = [
  { key: "monday", label: "Lunes", aliases: ["lunes", "monday"] },
  { key: "tuesday", label: "Martes", aliases: ["martes", "tuesday"] },
  { key: "wednesday", label: "Miercoles", aliases: ["miercoles", "miercoles", "wednesday"] },
  { key: "thursday", label: "Jueves", aliases: ["jueves", "thursday"] },
  { key: "friday", label: "Viernes", aliases: ["viernes", "friday"] },
  { key: "saturday", label: "Sabado", aliases: ["sabado", "sabado", "saturday"] },
  { key: "sunday", label: "Domingo", aliases: ["domingo", "sunday"] },
];

const MEAL_TYPES = new Set([
  "desayuno",
  "almuerzo",
  "merienda",
  "cena",
  "snack",
  "colacion",
  "pre_entreno",
  "post_entreno",
  "otra",
  "otro",
]);

function serviceError(code, message, extra = {}) {
  const error = new Error(code);
  error.code = code;
  error.publicMessage = message || code;
  Object.assign(error, extra);
  return error;
}

function validationError(details = []) {
  return serviceError("VALIDATION_ERROR", "Revisa los datos del menu", { details });
}

function idToString(id) {
  return id?.toString?.() || String(id || "");
}

function toMongoIdOrString(id) {
  const value = String(id || "").trim();
  if (!value) return null;
  return ObjectId.isValid(value) ? new ObjectId(value) : value;
}

function cleanString(value = "", max = 500) {
  return String(value || "").trim().slice(0, max);
}

function token(value = "") {
  return cleanString(value, 120)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizedName(value = "") {
  return cleanString(value, 180)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function number(value = 0, { min = null, max = null, decimals = 1 } = {}) {
  const parsed = Number(value);
  let out = Number.isFinite(parsed) ? parsed : 0;
  if (min !== null && out < min) out = min;
  if (max !== null && out > max) out = max;
  const factor = 10 ** decimals;
  return Math.round(out * factor) / factor;
}

function normalizeMealType(value = "") {
  const raw = token(value);
  if (raw === "pre_entreno" || raw === "preentreno") return "pre_entreno";
  if (raw === "post_entreno" || raw === "postentreno") return "post_entreno";
  if (raw === "colacion") return "colacion";
  if (raw === "otra") return "otra";
  return MEAL_TYPES.has(raw) ? raw : "otro";
}

function addTotals(a = {}, b = {}) {
  return {
    kcal: number((a.kcal || 0) + (b.kcal || 0)),
    proteina: number((a.proteina || 0) + (b.proteina ?? b.proteinas ?? b.protein ?? 0)),
    carbs: number((a.carbs || 0) + (b.carbs ?? b.carbohidratos ?? 0)),
    grasas: number((a.grasas || 0) + (b.grasas ?? b.fat ?? 0)),
  };
}

function normalizeItem(raw = {}, index = 0) {
  const snapshot = raw.snapshot || {};
  return {
    id: cleanString(raw.id || raw._id || `item-${index + 1}`, 80) || `item-${index + 1}`,
    alimentoId: raw.alimentoId ? toMongoIdOrString(raw.alimentoId) : null,
    nombreSnapshot: cleanString(raw.nombreSnapshot || raw.nombre || raw.name || snapshot.nombre, 180) || `Alimento ${index + 1}`,
    cantidad: number(raw.cantidad ?? raw.quantity ?? raw.amount, { min: 0, max: 100000, decimals: 2 }),
    unidad: cleanString(raw.unidad || raw.unit || snapshot.unidad || "g", 40) || "g",
    kcal: number(raw.kcal ?? raw.calorias ?? raw.calories ?? snapshot.kcal, { min: 0, max: 20000 }),
    proteina: number(raw.proteina ?? raw.proteinas ?? raw.protein ?? snapshot.proteina ?? snapshot.proteinas, {
      min: 0,
      max: 1000,
    }),
    carbs: number(raw.carbs ?? raw.carbohidratos ?? raw.carbohydrates ?? snapshot.carbs ?? snapshot.carbohidratos, {
      min: 0,
      max: 2000,
    }),
    grasas: number(raw.grasas ?? raw.fat ?? raw.fats ?? snapshot.grasas, { min: 0, max: 1000 }),
    categoriaSnapshot: cleanString(raw.categoriaSnapshot || raw.categoria || snapshot.categoria, 120),
    imagenUrl: cleanString(raw.imagenUrl || raw.imageUrl || raw.imagen?.url || snapshot.imagen?.url || snapshot.imagen, 500),
    notas: cleanString(raw.notas || raw.notes, 1000),
  };
}

function mealTotals(items = []) {
  return items.reduce((acc, item) => addTotals(acc, item), { kcal: 0, proteina: 0, carbs: 0, grasas: 0 });
}

function normalizeMeal(raw = {}, index = 0) {
  const itemsSource = Array.isArray(raw.items) ? raw.items : Array.isArray(raw.alimentos) ? raw.alimentos : [];
  const items = itemsSource.slice(0, 80).map(normalizeItem);
  const totals = mealTotals(items);
  const rawName = cleanString(raw.nombre || raw.name, 160);
  return {
    id: cleanString(raw.id || raw._id || `meal-${index + 1}`, 80) || `meal-${index + 1}`,
    nombre: rawName || (items.length ? "" : `Comida ${index + 1}`),
    orden: Math.max(1, Math.round(number(raw.orden ?? raw.order ?? index + 1, { min: 1, max: 40, decimals: 0 }))),
    tipoComida: normalizeMealType(raw.tipoComida || raw.type || raw.nombre),
    items,
    totales: totals,
    notas: cleanString(raw.notas || raw.notes, 1000),
  };
}

function normalizeMeals(value = []) {
  return (Array.isArray(value) ? value : [])
    .slice(0, 20)
    .map(normalizeMeal)
    .sort((a, b) => Number(a.orden || 0) - Number(b.orden || 0));
}

function menuTotals(comidas = []) {
  return comidas.reduce((acc, comida) => addTotals(acc, comida.totales || mealTotals(comida.items || [])), {
    kcal: 0,
    proteina: 0,
    carbs: 0,
    grasas: 0,
  });
}

function dayMetaFromKey(value = "") {
  const raw = token(value);
  return MENU_DAYS.find((day) => day.key === raw || day.aliases.map(token).includes(raw)) || null;
}

function normalizeDays(payload = {}, fallbackMeals = [], selectedDays = []) {
  const days = {};
  const source = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};

  Object.entries(source).forEach(([key, value]) => {
    const meta = dayMetaFromKey(key);
    if (!meta) return;
    const dayPayload = Array.isArray(value) ? { comidas: value } : value || {};
    const comidas = normalizeMeals(dayPayload.comidas || dayPayload.meals || []);
    days[meta.key] = {
      key: meta.key,
      label: meta.label,
      nombre: cleanString(dayPayload.nombre || dayPayload.name || meta.label, 120) || meta.label,
      comidas,
      macrosTotales: menuTotals(comidas),
      notas: cleanString(dayPayload.notas || dayPayload.notes, 1000),
    };
  });

  if (!Object.keys(days).length && selectedDays.length && fallbackMeals.length) {
    selectedDays
      .map(dayMetaFromKey)
      .filter(Boolean)
      .forEach((meta) => {
        const dayMeals = fallbackMeals.map((meal, index) => ({
          ...meal,
          id: `${meta.key}-${meal.id || `meal-${index + 1}`}`,
          items: (meal.items || []).map((item) => ({ ...item })),
        }));
        days[meta.key] = {
          key: meta.key,
          label: meta.label,
          nombre: meta.label,
          comidas: dayMeals,
          macrosTotales: menuTotals(dayMeals),
          notas: "",
        };
      });
  }

  return days;
}

function summarizeMenu(comidas = [], dias = {}) {
  const dayTotals = Object.values(dias || {}).map((day) => day.macrosTotales || menuTotals(day.comidas || []));
  if (dayTotals.length) {
    const total = dayTotals.reduce((acc, item) => addTotals(acc, item), { kcal: 0, proteina: 0, carbs: 0, grasas: 0 });
    const count = dayTotals.length || 1;
    return {
      kcal: number(total.kcal / count),
      proteina: number(total.proteina / count),
      carbs: number(total.carbs / count),
      grasas: number(total.grasas / count),
    };
  }
  return menuTotals(comidas);
}

function hasValidMenuContent(menu = {}) {
  const days = Object.values(menu.dias || {});
  const meals = days.length ? days.flatMap((day) => day.comidas || []) : menu.comidas || [];
  return meals.some((meal) => meal?.items?.length);
}

function allMealsWithContext(menu = {}) {
  const out = [];
  (menu.comidas || []).forEach((meal, index) => out.push({ meal, context: "menu", index }));
  Object.entries(menu.dias || {}).forEach(([dayKey, day]) => {
    (day?.comidas || []).forEach((meal, index) => out.push({ meal, context: dayKey, index }));
  });
  return out;
}

function validateFiniteMacro(value, label, details) {
  if (!Number.isFinite(Number(value))) {
    details.push(`${label} debe ser un numero valido`);
  }
}

function validateNormalizedMenu(menu = {}) {
  const details = [];
  const name = cleanString(menu.nombre, 181);

  if (!name) details.push("El nombre del menu es obligatorio");
  if (name.length > 180) details.push("El nombre del menu no puede superar 180 caracteres");
  if (cleanString(menu.descripcion, 2501).length > 2500) details.push("La descripcion no puede superar 2500 caracteres");

  const validDayKeys = new Set(MENU_DAYS.map((day) => day.key));
  Object.keys(menu.dias || {}).forEach((dayKey) => {
    if (!validDayKeys.has(dayKey)) details.push(`Dia invalido: ${dayKey}`);
  });

  const seenMealIdsByContext = new Map();
  allMealsWithContext(menu).forEach(({ meal, context, index }) => {
    const label = `${context} > comida ${index + 1}`;
    const seenMealIds = seenMealIdsByContext.get(context) || new Set();
    if (!meal?.id) details.push(`${label}: mealId requerido`);
    if ((meal?.items || []).length && !cleanString(meal.nombre, 160)) details.push(`${label}: nombre de comida requerido`);
    if (!MEAL_TYPES.has(normalizeMealType(meal?.tipoComida))) details.push(`${label}: tipo de comida invalido`);
    validateFiniteMacro(meal?.totales?.kcal, `${label}: kcal`, details);
    validateFiniteMacro(meal?.totales?.proteina, `${label}: proteina`, details);
    validateFiniteMacro(meal?.totales?.carbs, `${label}: carbohidratos`, details);
    validateFiniteMacro(meal?.totales?.grasas, `${label}: grasas`, details);

    if (seenMealIds.has(meal.id)) details.push(`${label}: mealId duplicado`);
    seenMealIds.add(meal.id);
    seenMealIdsByContext.set(context, seenMealIds);

    (meal?.items || []).forEach((item, itemIndex) => {
      const itemLabel = `${label} > alimento ${itemIndex + 1}`;
      if (!idToString(item.alimentoId)) details.push(`${itemLabel}: alimentoId requerido`);
      if (!cleanString(item.nombreSnapshot, 180)) details.push(`${itemLabel}: nombre requerido`);
      if (!Number.isFinite(Number(item.cantidad)) || Number(item.cantidad) <= 0) {
        details.push(`${itemLabel}: cantidad invalida`);
      }
      if (!cleanString(item.unidad, 40)) details.push(`${itemLabel}: unidad requerida`);
      validateFiniteMacro(item.kcal, `${itemLabel}: kcal`, details);
      validateFiniteMacro(item.proteina, `${itemLabel}: proteina`, details);
      validateFiniteMacro(item.carbs, `${itemLabel}: carbohidratos`, details);
      validateFiniteMacro(item.grasas, `${itemLabel}: grasas`, details);
    });
  });

  if (details.length) throw validationError(details);
}

function validateRawMenuPayload(payload = {}) {
  const details = [];
  const rawName = payload.nombre ?? payload.name;
  const rawDescription = payload.descripcion ?? payload.description;

  if (rawName !== undefined && cleanString(rawName, 1000).length > 180) {
    details.push("El nombre del menu no puede superar 180 caracteres");
  }
  if (rawDescription !== undefined && cleanString(rawDescription, 3000).length > 2500) {
    details.push("La descripcion no puede superar 2500 caracteres");
  }
  if (Array.isArray(payload.selectedDays)) {
    payload.selectedDays.forEach((day) => {
      if (!dayMetaFromKey(day)) details.push(`Dia invalido: ${day}`);
    });
  }
  if (details.length) throw validationError(details);
}

function splitNumericSuffix(name = "") {
  const text = cleanString(name, 180).replace(/\s+/g, " ").trim();
  const match = text.match(/^(.*?)(?:\s+(\d+))$/);
  if (!match) return { stem: text, suffix: 0 };
  return { stem: match[1].trim() || text, suffix: Number(match[2]) || 0 };
}

function nextUniqueName(baseName = "Mi menu", existingNames = []) {
  const base = cleanString(baseName, 180) || "Mi menu";
  const used = new Set(existingNames.map(normalizedName).filter(Boolean));
  if (!used.has(normalizedName(base))) return base;

  const { stem, suffix } = splitNumericSuffix(base);
  let next = suffix > 0 ? suffix + 1 : 1;
  let candidate = `${stem} ${next}`;
  while (used.has(normalizedName(candidate))) {
    next += 1;
    candidate = `${stem} ${next}`;
  }
  return candidate;
}

function normalizeDoc(doc = {}, user = null) {
  if (!doc) return null;
  const activeOwnMenuId = idToString(user?.menu?.activeOwnMenuId);
  const id = idToString(doc._id || doc.id);
  const totals = doc.macrosTotales || doc.totales || {
    kcal: doc.kcalObjetivo,
    proteina: doc.macrosObjetivo?.proteina,
    carbs: doc.macrosObjetivo?.carbs,
    grasas: doc.macrosObjetivo?.grasas,
  };
  return {
    ...doc,
    id,
    _id: id,
    ownerId: idToString(doc.ownerId),
    createdBy: idToString(doc.createdBy),
    creadaPorUserId: idToString(doc.creadaPorUserId),
    sourceOriginalId: idToString(doc.sourceOriginalId),
    visibilidad: normalizeVisibility(doc.visibilidad || "privada"),
    planMinimo: doc.planMinimo || "free",
    macrosTotales: {
      kcal: number(totals.kcal),
      proteina: number(totals.proteina ?? totals.proteinas ?? totals.protein),
      carbs: number(totals.carbs ?? totals.carbohidratos),
      grasas: number(totals.grasas ?? totals.fat),
    },
    isActiveOwnMenu: Boolean(user?.menu?.activeSource === "own" && activeOwnMenuId && activeOwnMenuId === id),
  };
}

function buildOwnerQuery(userId) {
  return {
    $and: [
      { ownerType: "cliente" },
      { ownerId: { $in: idValues(userId) } },
      { estado: { $ne: "inactivo" } },
      { activa: { $ne: false } },
      { activo: { $ne: false } },
    ],
  };
}

class ServicioClientOwnMenus {
  constructor() {
    this.menusModel = new ModelMongoDBMenus();
    this.usuariosModel = new ModelMongoDBUsuarios();
    this.alimentosModel = new ModelMongoDBAlimentos();
  }

  async _actor(user = {}) {
    const userId = user?.id || user?._id;
    if (!userId) throw serviceError("NO_AUTENTICADO", "No autenticado");
    const dbUser = await this.usuariosModel.obtenerPorId(userId);
    if (!dbUser) throw serviceError("NO_AUTENTICADO", "No autenticado");
    const role = normalizeClientRole(dbUser.role || dbUser.rol || user.role);
    if (role !== "cliente") throw serviceError("USER_NOT_CLIENT", "Esta seccion es solo para clientes");
    return await this._repairMenuState(dbUser);
  }

  _userId(user = {}) {
    return idToString(user._id || user.id);
  }

  async _ownMenusRaw(userId, { includeComidas = false, limit = 200 } = {}) {
    const data = await this.menusModel.listBase({
      includeComidas,
      limit,
      skip: 0,
      visibilityQuery: buildOwnerQuery(userId),
    });
    return data.items || [];
  }

  async _ownMenuCount(userId) {
    const data = await this.menusModel.listBase({
      limit: 1,
      skip: 0,
      visibilityQuery: buildOwnerQuery(userId),
    });
    return Number(data.total || 0);
  }

  async _repairMenuState(user = {}) {
    const source = String(user?.menu?.activeSource || "none");
    const activeOwnMenuId = idToString(user?.menu?.activeOwnMenuId);
    let nextMenu = null;

    if ((source === "none" && activeOwnMenuId) || (source === "own" && !activeOwnMenuId)) {
      nextMenu = { ...(user?.menu || {}), activeSource: "none", activeOwnMenuId: null, updatedAt: new Date() };
    }

    if (source === "coach" && (!clientHasCoach(user) || activeOwnMenuId)) {
      nextMenu = {
        ...(user?.menu || {}),
        activeSource: clientHasCoach(user) ? "coach" : "none",
        activeOwnMenuId: null,
        updatedAt: new Date(),
      };
    }

    if (source === "own" && activeOwnMenuId) {
      const menu = await this.menusModel.getBaseById(activeOwnMenuId).catch(() => null);
      const ownsMenu =
        menu &&
        menu.estado !== "inactivo" &&
        menu.activa !== false &&
        menu.activo !== false &&
        String(menu.ownerType || "") === "cliente" &&
        idToString(menu.ownerId) === this._userId(user);
      if (!ownsMenu) {
        nextMenu = { ...(user?.menu || {}), activeSource: "none", activeOwnMenuId: null, updatedAt: new Date() };
      }
    }

    if (!nextMenu) return user;
    return await this.usuariosModel.updateById(this._userId(user), {
      menu: nextMenu,
    });
  }

  async _assertLimit(user) {
    const userId = this._userId(user);
    const capabilities = getClientNutritionCapabilities(user);
    const current = await this._ownMenuCount(userId);
    const limit = Number(capabilities.limits.ownMenus);
    if (Number.isFinite(limit) && current >= limit) {
      throw serviceError("PLAN_LIMIT_REACHED", `Alcanzaste el limite de ${limit} menus de tu plan`, {
        resource: "ownMenus",
        current,
        limit,
        plan: capabilities.plan,
      });
    }
  }

  async _rollbackCreatedMenu(menuId, reason = "rollback") {
    if (!menuId) return;
    await this.menusModel.updateBaseById(menuId, {
      estado: "inactivo",
      activa: false,
      activo: false,
      deletedAt: new Date(),
      deletedReason: reason,
    }).catch(() => null);
  }

  async _assertLimitAfterWrite(user, createdMenuId) {
    const capabilities = getClientNutritionCapabilities(user);
    const current = await this._ownMenuCount(this._userId(user));
    const limit = Number(capabilities.limits.ownMenus);
    if (Number.isFinite(limit) && current > limit) {
      await this._rollbackCreatedMenu(createdMenuId, "PLAN_LIMIT_RACE");
      throw serviceError("PLAN_LIMIT_REACHED", `Alcanzaste el limite de ${limit} menus de tu plan`, {
        resource: "ownMenus",
        current: Math.max(0, current - 1),
        limit,
        plan: capabilities.plan,
      });
    }
  }

  async _validateFoodIds(menu = {}) {
    const ids = new Set();
    allMealsWithContext(menu).forEach(({ meal }) => {
      (meal?.items || []).forEach((item) => {
        const value = idToString(item.alimentoId);
        if (value) ids.add(value);
      });
    });

    const details = [];
    for (const id of ids) {
      const found = await this.alimentosModel.obtenerAlimentoPorId(id);
      if (!found) details.push(`El alimento ${id} no existe en la base de alimentos`);
    }

    if (details.length) throw validationError(details);
  }

  async _validateMenuPayload(menu = {}) {
    validateNormalizedMenu(menu);
    await this._validateFoodIds(menu);
  }

  async _hasCoachMenuActive(user) {
    const userId = this._userId(user);
    if (!clientHasCoach(user)) return false;
    const coachId = user?.coach?.entrenadorId || user?.coach?.coachId || user?.coachId || user?.entrenadorId || user?.profesionalId;
    if (user?.menu?.activeSource === "coach") return true;
    const assignedByDay = user?.menu?.weeklyPlan?.assignedMenusByDay || {};
    if (assignedByDay && typeof assignedByDay === "object" && Object.keys(assignedByDay).length) return true;
    return Boolean(await this.menusModel.getActiveForClientAndCoach(userId, coachId));
  }

  async _getOwnedMenu(user, menuId) {
    const current = await this.menusModel.getBaseById(menuId);
    if (!current || current.estado === "inactivo" || current.activa === false || current.activo === false) {
      throw serviceError("MENU_NOT_FOUND", "Menu no encontrado");
    }
    if (String(current.ownerType || "") !== "cliente" || idToString(current.ownerId) !== this._userId(user)) {
      throw serviceError("NOT_MENU_OWNER", "No podes modificar un menu que no es tuyo");
    }
    return current;
  }

  async _getVisibleMenu(user, menuId) {
    const current = await this.menusModel.getBaseById(menuId);
    if (!current || current.estado === "inactivo" || current.activa === false || current.activo === false) {
      throw serviceError("MENU_NOT_FOUND", "Menu no encontrado");
    }
    if (!canViewNutritionItem(user, current, { assignmentField: "asignadoA" })) {
      throw serviceError("CLIENT_MENU_FORBIDDEN", "No tenes permisos para ver este menu");
    }
    return current;
  }

  async _uniqueNameForUser(user, desiredName = "Mi menu") {
    const menus = await this._ownMenusRaw(this._userId(user), { includeComidas: false, limit: 500 });
    return nextUniqueName(desiredName, menus.map((menu) => menu.nombre));
  }

  _normalizePayload(payload = {}, user = {}, current = null) {
    const baseMeals = normalizeMeals(payload.comidas || payload.meals || current?.comidas || []);
    const selectedDays = Array.isArray(payload.selectedDays) ? payload.selectedDays : [];
    const daySource = payload.dias || payload.days || (selectedDays.length ? {} : current?.dias || {});
    const dias = normalizeDays(daySource, baseMeals, selectedDays);
    const totals = summarizeMenu(baseMeals, dias);
    const now = new Date();
    const nombre = cleanString(payload.nombre || payload.name || current?.nombre || "Mi menu", 180) || "Mi menu";

    return {
      nombre,
      nombreNormalizado: normalizedName(nombre),
      descripcion: cleanString(payload.descripcion || payload.description || current?.descripcion || "", 2500),
      kcalObjetivo: number(payload.kcalObjetivo ?? payload.kcal ?? totals.kcal, { min: 0, max: 20000 }),
      macrosObjetivo: {
        proteina: number(payload.macrosObjetivo?.proteina ?? payload.macros?.proteina ?? totals.proteina, { min: 0, max: 1000 }),
        carbs: number(payload.macrosObjetivo?.carbs ?? payload.macrosObjetivo?.carbohidratos ?? payload.macros?.carbs ?? totals.carbs, {
          min: 0,
          max: 2000,
        }),
        grasas: number(payload.macrosObjetivo?.grasas ?? payload.macros?.grasas ?? totals.grasas, { min: 0, max: 1000 }),
      },
      macrosTotales: totals,
      objetivo: cleanString(payload.objetivo || payload.goal || current?.objetivo || "mantenimiento", 80) || "mantenimiento",
      cantidadComidas: Math.max(
        baseMeals.length,
        ...Object.values(dias).map((day) => (day.comidas || []).length),
        0
      ),
      tags: Array.isArray(payload.tags) ? payload.tags.map((tag) => cleanString(tag, 60)).filter(Boolean).slice(0, 20) : current?.tags || [],
      comidas: baseMeals,
      dias,
      ownerType: "cliente",
      ownerId: toMongoIdOrString(this._userId(user)),
      creadaPorRol: "cliente",
      creadaPorUserId: toMongoIdOrString(this._userId(user)),
      createdBy: current?.createdBy || toMongoIdOrString(this._userId(user)),
      visibilidad: "privada",
      planMinimo: "free",
      source: current?.source || payload.source || "manual",
      estado: cleanString(payload.estado || payload.status || current?.estado || "activo", 40) === "borrador" ? "borrador" : "activo",
      activa: true,
      activo: true,
      updatedAt: now,
    };
  }

  async capabilities(user) {
    const actor = await this._actor(user);
    const hasCoachMenu = await this._hasCoachMenuActive(actor);
    const activeSource = hasCoachMenu ? "coach" : actor?.menu?.activeSource || "none";
    return getClientNutritionCapabilities(actor, { activeMenuSource: activeSource });
  }

  async list(user, filters = {}) {
    const actor = await this._actor(user);
    const userId = this._userId(actor);
    const limit = Math.min(Math.max(Number(filters.limit) || 20, 1), 80);
    const page = Math.max(Number(filters.page) || 1, 1);
    const skip = (page - 1) * limit;
    const status = cleanString(filters.status || "todos", 40).toLowerCase();
    const query = buildOwnerQuery(userId);
    const statusQuery = status && status !== "todos" ? { estado: status } : {};
    const data = await this.menusModel.listBase({
      search: filters.search,
      includeComidas: filters.includeComidas === "true" || filters.includeComidas === true,
      limit,
      skip,
      visibilityQuery: Object.keys(statusQuery).length ? { $and: [query, statusQuery] } : query,
    });
    const activeOwnMenuId = idToString(actor?.menu?.activeOwnMenuId);
    const items = (data.items || []).map((menu) => normalizeDoc(menu, actor));
    const activeMenu = activeOwnMenuId
      ? items.find((item) => item.id === activeOwnMenuId) || normalizeDoc(await this.menusModel.getBaseById(activeOwnMenuId), actor)
      : null;

    return {
      items,
      pagination: {
        page,
        limit,
        total: Number(data.total || 0),
        pages: Math.ceil(Number(data.total || 0) / limit),
      },
      capabilities: await this.capabilities(user),
      activeMenu,
    };
  }

  async get(user, menuId) {
    const actor = await this._actor(user);
    const menu = await this._getOwnedMenu(actor, menuId);
    return {
      menu: normalizeDoc(menu, actor),
      capabilities: await this.capabilities(user),
    };
  }

  async create(user, payload = {}) {
    const actor = await this._actor(user);
    const capabilities = getClientNutritionCapabilities(actor);
    if (!capabilities.canCreateOwnMenu) throw serviceError("CLIENT_MENU_FORBIDDEN", "Tu plan no permite crear menus");
    validateRawMenuPayload(payload);
    await this._assertLimit(actor);
    if (payload.activate === true && await this._hasCoachMenuActive(actor)) {
      throw serviceError("COACH_MENU_ACTIVE", "No podes activar un menu propio mientras existe un menu activo asignado por tu coach.");
    }

    const doc = this._normalizePayload(payload, actor);
    doc.nombre = await this._uniqueNameForUser(actor, doc.nombre);
    doc.nombreNormalizado = normalizedName(doc.nombre);
    doc.createdAt = new Date();
    await this._validateMenuPayload(doc);

    const created = await this.menusModel.createBase(doc);
    await this._assertLimitAfterWrite(actor, created._id);
    let nextUser = actor;
    if (payload.activate === true) {
      nextUser = await this._activate(actor, created);
    }
    return {
      menu: normalizeDoc(created, nextUser),
      capabilities: await this.capabilities({ id: this._userId(nextUser), role: "cliente" }),
    };
  }

  async update(user, menuId, payload = {}) {
    const actor = await this._actor(user);
    const capabilities = getClientNutritionCapabilities(actor);
    if (!capabilities.canEditOwnMenu) throw serviceError("CLIENT_MENU_FORBIDDEN", "Tu plan no permite editar menus");
    validateRawMenuPayload(payload);
    const current = await this._getOwnedMenu(actor, menuId);
    const patch = this._normalizePayload(payload, actor, current);
    if (payload.nombre !== undefined || payload.name !== undefined) {
      const others = (await this._ownMenusRaw(this._userId(actor), { limit: 500 })).filter((menu) => idToString(menu._id) !== idToString(menuId));
      patch.nombre = nextUniqueName(patch.nombre, others.map((menu) => menu.nombre));
      patch.nombreNormalizado = normalizedName(patch.nombre);
    }
    delete patch.createdAt;
    await this._validateMenuPayload(patch);
    const updated = await this.menusModel.updateBaseById(menuId, patch);
    return { menu: normalizeDoc(updated, actor) };
  }

  async remove(user, menuId, payload = {}) {
    const actor = await this._actor(user);
    const capabilities = getClientNutritionCapabilities(actor);
    if (!capabilities.canDeleteOwnMenu) throw serviceError("CLIENT_MENU_FORBIDDEN", "Tu plan no permite eliminar menus");
    const current = await this._getOwnedMenu(actor, menuId);
    const isActive = actor?.menu?.activeSource === "own" && idToString(actor?.menu?.activeOwnMenuId) === idToString(menuId);
    if (isActive && payload.confirmActiveDelete !== true) {
      throw serviceError("ACTIVE_MENU_DELETE_CONFIRMATION_REQUIRED", "Este es tu menu activo. Confirma para eliminarlo y desactivarlo.");
    }
    let nextUser = actor;
    if (isActive) {
      nextUser = await this._deactivate(actor);
    }
    await this.menusModel.updateBaseById(current._id, {
      estado: "inactivo",
      activa: false,
      activo: false,
      deletedAt: new Date(),
    });
    return { deleted: true, user: nextUser };
  }

  async duplicate(user, menuId, payload = {}) {
    const actor = await this._actor(user);
    const capabilities = getClientNutritionCapabilities(actor);
    if (!capabilities.canDuplicateOwnMenu) throw serviceError("CLIENT_MENU_FORBIDDEN", "Tu plan no permite duplicar menus");
    await this._assertLimit(actor);
    const current = await this._getVisibleMenu(actor, menuId);
    const copyName = await this._uniqueNameForUser(actor, payload.nombre || current.nombre || "Mi menu");
    const now = new Date();
    const copy = {
      ...current,
      nombre: copyName,
      nombreNormalizado: normalizedName(copyName),
      ownerType: "cliente",
      ownerId: toMongoIdOrString(this._userId(actor)),
      creadaPorRol: "cliente",
      creadaPorUserId: toMongoIdOrString(this._userId(actor)),
      createdBy: toMongoIdOrString(this._userId(actor)),
      visibilidad: "privada",
      planMinimo: "free",
      source: current.ownerType === "admin" ? "copied_from_admin" : "copied_from_library",
      sourceOriginalId: current._id,
      asignadoA: [],
      favoritoPara: [],
      estado: "activo",
      activa: true,
      activo: true,
      createdAt: now,
      updatedAt: now,
    };
    delete copy._id;
    delete copy.id;

    const created = await this.menusModel.createBase(copy);
    await this._assertLimitAfterWrite(actor, created._id);
    return { menu: normalizeDoc(created, actor) };
  }

  async _activate(user, menu) {
    if (!hasValidMenuContent(menu)) {
      throw serviceError("INVALID_MENU", "El menu necesita al menos una comida con alimentos para activarse");
    }
    if (await this._hasCoachMenuActive(user)) {
      throw serviceError("COACH_MENU_ACTIVE", "No podes activar un menu propio mientras existe un menu activo asignado por tu coach.");
    }
    const now = new Date();
    return await this.usuariosModel.updateById(this._userId(user), {
      menu: {
        ...(user?.menu || {}),
        activeSource: "own",
        activeOwnMenuId: toMongoIdOrString(menu._id || menu.id),
        updatedAt: now,
      },
      updatedAt: now,
    });
  }

  async activate(user, menuId) {
    const actor = await this._actor(user);
    const capabilities = getClientNutritionCapabilities(actor);
    if (!capabilities.canActivateOwnMenu) throw serviceError("CLIENT_MENU_FORBIDDEN", "Tu plan no permite activar menus");
    const menu = await this._getOwnedMenu(actor, menuId);
    const nextUser = await this._activate(actor, menu);
    return {
      ok: true,
      activeMenu: normalizeDoc(menu, nextUser),
      capabilities: await this.capabilities({ id: this._userId(nextUser), role: "cliente" }),
    };
  }

  async _deactivate(user) {
    const now = new Date();
    return await this.usuariosModel.updateById(this._userId(user), {
      menu: {
        ...(user?.menu || {}),
        activeSource: "none",
        activeOwnMenuId: null,
        updatedAt: now,
      },
      updatedAt: now,
    });
  }

  async deactivate(user) {
    const actor = await this._actor(user);
    if (await this._hasCoachMenuActive(actor)) {
      throw serviceError("COACH_MENU_ACTIVE", "No podes desactivar desde aca un menu activo asignado por tu coach.");
    }
    const nextUser = await this._deactivate(actor);
    return {
      ok: true,
      activeMenu: null,
      capabilities: await this.capabilities({ id: this._userId(nextUser), role: "cliente" }),
    };
  }
}

export default ServicioClientOwnMenus;
export {
  hasValidMenuContent,
  nextUniqueName,
  normalizeClientPlan,
  normalizeDoc as normalizeClientMenuDoc,
  normalizeMealType,
  validateRawMenuPayload,
};
