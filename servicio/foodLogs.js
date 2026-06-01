import { ObjectId } from "mongodb";

import ModelMongoDBFoodLogs from "../model/DAO/foodLogsMongoDB.js";
import ModelMongoDBUsuarios from "../model/DAO/usuariosMongoDB.js";
import ModelMongoDBMenus from "../model/DAO/menusMongoDB.js";
import ModelMongoDBAlimentos from "../model/DAO/alimentosMongoDB.js";

const MEAL_TYPES = ["desayuno", "almuerzo", "merienda", "cena", "snack"];
const MEAL_TYPE_SET = new Set(MEAL_TYPES);
const DEFAULT_OBJECTIVE = { kcal: 1900, proteina: 140, carbs: 205, grasas: 58 };

function cleanString(value = "", max = 500) {
  if (value === null || value === undefined) return "";
  return String(value).slice(0, max).trim();
}

function cleanText(value, fallback = "", max = 500) {
  const text = cleanString(value, max);
  return text || fallback;
}

function normalizeToken(value = "", fallback = "") {
  const token = cleanString(value, 120)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return token || fallback;
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function roundMacro(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function macroNumber(value) {
  return roundMacro(Math.max(0, toNumber(value, 0)));
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

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeDate(value) {
  const raw = cleanString(value || todayString(), 20);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error("INVALID_DATE");
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) throw new Error("INVALID_DATE");
  return raw;
}

function normalizeMealType(value) {
  const token = normalizeToken(value, "");
  if (!MEAL_TYPE_SET.has(token)) throw new Error("INVALID_MEAL_TYPE");
  return token;
}

function emptyTotals() {
  return { kcal: 0, proteina: 0, carbs: 0, grasas: 0 };
}

function addTotals(a = emptyTotals(), b = emptyTotals()) {
  return {
    kcal: roundMacro((a.kcal || 0) + (b.kcal || 0)),
    proteina: roundMacro((a.proteina || 0) + (b.proteina || 0)),
    carbs: roundMacro((a.carbs || 0) + (b.carbs || 0)),
    grasas: roundMacro((a.grasas || 0) + (b.grasas || 0)),
  };
}

function normalizeUnit(unit = "") {
  return cleanString(unit, 40).toLowerCase().replace(".", "");
}

function inferMacroBasis(unit = "", raw = {}) {
  const explicit = normalizeToken(raw?.macroBasis || raw?.baseMacro || raw?.Base || raw?.base || raw?.por || raw?.Por);
  if (explicit.includes("100")) return "per100";
  if (explicit.includes("unidad") || explicit.includes("porcion") || explicit.includes("porci")) return "perUnit";

  const normalizedUnit = normalizeUnit(unit);
  if (["g", "gr", "gramo", "gramos", "ml"].includes(normalizedUnit)) return "per100";
  return "perUnit";
}

function normalizeFoodDoc(raw = {}) {
  const name = raw.Alimentos || raw.alimentos || raw.nombre || raw.name || "Sin nombre";
  const id = idToString(raw._id || raw.id || raw.alimentoId || name);
  const unitRaw = cleanString(raw.Unidad || raw.unidad || raw.unit, 40);
  const unitLower = unitRaw.toLowerCase();
  const unidad = unitLower.startsWith("gr") || unitLower === "g" ? "g" : unitRaw || "unidad";
  const kcal = macroNumber(raw.Calorias ?? raw.calorias ?? raw.kcal ?? raw.calories);
  const proteina = macroNumber(raw.Proteinas ?? raw.proteinas ?? raw.proteina ?? raw.protein);
  const carbs = macroNumber(raw.Carbohidratos ?? raw.carbohidratos ?? raw.carbs ?? raw.carbohydrates ?? raw.hidratos);
  const grasas = macroNumber(raw.Grasas ?? raw.grasas ?? raw.fat ?? raw.fats);
  const fuente =
    cleanString(
      raw.Fuente || raw.fuente || raw.Categoria || raw.categoria || raw["Categoria"] || raw.Grupo || raw.grupo,
      120
    ) || inferFoodCategory({ name, kcal, proteina, carbs, grasas });

  return {
    id,
    alimentoId: id,
    nombre: cleanText(name, "Sin nombre", 180),
    unidad,
    kcal,
    proteina,
    carbs,
    grasas,
    fuente,
    categoria: fuente,
    macroBasis: raw.macroBasis || inferMacroBasis(unidad, raw),
    raw,
  };
}

function inferFoodCategory({ source = "", name = "", proteina = 0, carbs = 0, grasas = 0, kcal = 0 }) {
  const haystack = `${source} ${name}`.toLowerCase();
  if (/pollo|carne|huevo|atun|pescado|whey|yogur|queso|jamon|pavo/.test(haystack)) return "Proteica";
  if (/arroz|papa|batata|fideo|pasta|pan|avena|banana|manzana|fruta|harina|cereal/.test(haystack)) return "Carbohidrato";
  if (/aceite|palta|nuez|almendra|mani|manteca|semilla/.test(haystack)) return "Grasa";
  if (/verdura|tomate|lechuga|zanahoria|zapallo|brocoli/.test(haystack)) return "Verdura";
  if (kcal <= 0 && proteina <= 0 && carbs <= 0 && grasas <= 0) return "Otros";

  const max = Math.max(proteina, carbs, grasas);
  if (max === proteina && proteina > 0) return "Proteica";
  if (max === carbs && carbs > 0) return "Carbohidrato";
  if (max === grasas && grasas > 0) return "Grasa";
  return "Otros";
}

function calculateFoodMacros(food = {}, cantidad = 100, unidad = food?.unidad || "g") {
  const qty = toNumber(cantidad, 0);
  const sourceUnit = normalizeUnit(unidad || food?.unidad);
  const basis = food?.macroBasis || inferMacroBasis(food?.unidad || unidad, food?.raw || food);
  const shouldScaleBy100 = basis === "per100" && ["g", "gr", "gramo", "gramos", "ml"].includes(sourceUnit);
  const factor = qty > 0 ? (shouldScaleBy100 ? qty / 100 : qty) : 0;

  return {
    kcal: roundMacro(toNumber(food.kcal, 0) * factor),
    proteina: roundMacro(toNumber(food.proteina ?? food.protein, 0) * factor),
    carbs: roundMacro(toNumber(food.carbs, 0) * factor),
    grasas: roundMacro(toNumber(food.grasas ?? food.fat, 0) * factor),
  };
}

function buildFoodSnapshot(food = {}, cantidad = 100, unidad = food?.unidad || "g") {
  const normalized = food.nombre ? food : normalizeFoodDoc(food);
  const snapshotUnit = cleanText(unidad || normalized.unidad, normalized.unidad || "g", 40);
  const macros = calculateFoodMacros(normalized, cantidad, snapshotUnit);

  return {
    alimentoId: normalized.alimentoId || normalized.id || null,
    nombreSnapshot: cleanText(normalized.nombre, "Alimento", 180),
    cantidad: roundMacro(Math.max(0, toNumber(cantidad, 100))),
    unidad: snapshotUnit,
    kcal: macros.kcal,
    proteina: macros.proteina,
    carbs: macros.carbs,
    grasas: macros.grasas,
    fuente: cleanString(normalized.fuente || normalized.categoria, 120),
    categoriaSnapshot: cleanString(normalized.categoria || normalized.fuente, 120),
  };
}

function scaleExistingSnapshot(log = {}, nextCantidad = 0, nextUnidad = "") {
  const previous = toNumber(log.cantidad, 0);
  const next = roundMacro(Math.max(0, toNumber(nextCantidad, previous)));
  const factor = previous > 0 ? next / previous : 1;
  return {
    alimentoId: log.alimentoId || null,
    nombreSnapshot: cleanText(log.nombreSnapshot, "Alimento", 180),
    cantidad: next,
    unidad: cleanText(nextUnidad || log.unidad, "g", 40),
    kcal: roundMacro((log.kcal || 0) * factor),
    proteina: roundMacro((log.proteina || 0) * factor),
    carbs: roundMacro((log.carbs || 0) * factor),
    grasas: roundMacro((log.grasas || 0) * factor),
    fuente: cleanString(log.fuente || log.categoriaSnapshot, 120),
    categoriaSnapshot: cleanString(log.categoriaSnapshot || log.fuente, 120),
  };
}

function totalLogs(logs = []) {
  return logs.reduce(
    (acc, log) =>
      addTotals(acc, {
        kcal: log.kcal,
        proteina: log.proteina,
        carbs: log.carbs,
        grasas: log.grasas,
      }),
    emptyTotals()
  );
}

function remainingTotals(objetivo = null, totals = emptyTotals()) {
  if (!objetivo) return null;
  return {
    kcal: roundMacro((objetivo.kcal || 0) - (totals.kcal || 0)),
    proteina: roundMacro((objetivo.proteina || 0) - (totals.proteina || 0)),
    carbs: roundMacro((objetivo.carbs || 0) - (totals.carbs || 0)),
    grasas: roundMacro((objetivo.grasas || 0) - (totals.grasas || 0)),
  };
}

function normalizeLog(doc = {}) {
  return {
    id: idToString(doc._id || doc.id),
    _id: idToString(doc._id || doc.id),
    userId: idToString(doc.userId),
    foodLogDayId: idToString(doc.foodLogDayId),
    date: doc.date,
    mealType: doc.mealType,
    alimentoId: doc.alimentoId ? idToString(doc.alimentoId) : null,
    nombreSnapshot: doc.nombreSnapshot || "Alimento",
    cantidad: macroNumber(doc.cantidad),
    unidad: doc.unidad || "g",
    kcal: macroNumber(doc.kcal),
    proteina: macroNumber(doc.proteina),
    carbs: macroNumber(doc.carbs),
    grasas: macroNumber(doc.grasas),
    fuente: doc.fuente || "",
    categoriaSnapshot: doc.categoriaSnapshot || "",
    notas: doc.notas || "",
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function groupLogsByMeal(logs = []) {
  const grouped = Object.fromEntries(MEAL_TYPES.map((meal) => [meal, []]));
  logs.map(normalizeLog).forEach((log) => {
    const key = MEAL_TYPE_SET.has(log.mealType) ? log.mealType : "snack";
    grouped[key].push(log);
  });
  return grouped;
}

function normalizeDay(doc = null, date = "") {
  if (!doc) return null;
  return {
    id: idToString(doc._id || doc.id),
    _id: idToString(doc._id || doc.id),
    userId: idToString(doc.userId),
    date: doc.date || date,
    objetivo: doc.objetivo || null,
    totals: doc.totals || emptyTotals(),
    menuAsignadoId: doc.menuAsignadoId ? idToString(doc.menuAsignadoId) : null,
    coachId: doc.coachId ? idToString(doc.coachId) : null,
    status: doc.status || "active",
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function normalizeRole(user = {}) {
  const role = normalizeToken(user.role || user.rol);
  if (role === "client" || role === "customer") return "cliente";
  if (role === "trainer" || role === "nutritionist" || role === "entrenador" || role === "nutricionista") return "coach";
  return role;
}

function extractUserGoals(user = {}) {
  const candidates = [
    user.metasActuales,
    user.objetivoNutricional,
    user.nutritionGoals,
    user.nutrition?.metasActuales,
    user.profile?.metasActuales,
    user.profile?.nutritionGoals,
  ].filter(Boolean);

  for (const source of candidates) {
    const kcal = toNumber(source.kcal ?? source.calorias ?? source.calories ?? source.kcalObjetivo, 0);
    const proteina = toNumber(source.proteina ?? source.proteinas ?? source.protein, 0);
    const carbs = toNumber(source.carbs ?? source.carbohidratos ?? source.carbohydrates, 0);
    const grasas = toNumber(source.grasas ?? source.fat ?? source.fats, 0);
    if (kcal > 0 || proteina > 0 || carbs > 0 || grasas > 0) {
      return {
        objective: {
          kcal: roundMacro(kcal),
          proteina: roundMacro(proteina),
          carbs: roundMacro(carbs),
          grasas: roundMacro(grasas),
        },
        source: "metasActuales",
      };
    }
  }

  return null;
}

function totalsFromAssignedMenu(menu = null) {
  if (!menu) return null;
  const macros = menu.macrosObjetivo || {};
  const objective = {
    kcal: roundMacro(toNumber(menu.kcalObjetivo ?? menu.kcal, 0)),
    proteina: roundMacro(toNumber(macros.proteina ?? macros.proteinas ?? macros.protein, 0)),
    carbs: roundMacro(toNumber(macros.carbs ?? macros.carbohidratos ?? macros.carbohydrates, 0)),
    grasas: roundMacro(toNumber(macros.grasas ?? macros.fat ?? macros.fats, 0)),
  };

  const hasObjective = Object.values(objective).some((value) => value > 0);
  if (hasObjective) return objective;

  const totals = menu.totalesActuales || {};
  return {
    kcal: roundMacro(toNumber(totals.kcal, 0)),
    proteina: roundMacro(toNumber(totals.proteina ?? totals.proteinas, 0)),
    carbs: roundMacro(toNumber(totals.carbs ?? totals.carbohidratos, 0)),
    grasas: roundMacro(toNumber(totals.grasas ?? totals.fat, 0)),
  };
}

class ServicioFoodLogs {
  constructor() {
    this.foodLogsModel = new ModelMongoDBFoodLogs();
    this.usuariosModel = new ModelMongoDBUsuarios();
    this.menusModel = new ModelMongoDBMenus();
    this.alimentosModel = new ModelMongoDBAlimentos();
  }

  async _actor(user) {
    const actorId = user?.targetUserId || user?.id || user?._id;
    if (!actorId) throw new Error("NO_AUTENTICADO");
    const full = await this.usuariosModel.obtenerPorId(actorId);
    if (!full) throw new Error("NO_AUTENTICADO");
    return full;
  }

  _actorId(actor) {
    return idToString(actor?._id || actor?.id);
  }

  _assertClient(actor) {
    if (normalizeRole(actor) !== "cliente") throw new Error("FORBIDDEN");
  }

  _assertCanWriteTracking(actor, date) {
    this._assertClient(actor);
    const permissions = actor?.clientPermissions?.tracking || actor?.clientPermissions?.foodTracking || {};
    if (permissions.canTrackFood === false) throw new Error("TRACKING_NOT_ALLOWED");
    if (date !== todayString() && permissions.canEditPastDays === false) throw new Error("PAST_DAYS_NOT_ALLOWED");
  }

  async _resolveObjective(actor) {
    const clientId = this._actorId(actor);
    const activeMenu = await this.menusModel.getActiveForClient(clientId);

    if (activeMenu) {
      const objective = totalsFromAssignedMenu(activeMenu);
      return {
        objetivo: objective,
        source: "menu_asignado",
        planificado: {
          menuAsignadoId: idToString(activeMenu._id || activeMenu.id),
          nombre: activeMenu.nombre || "",
          kcal: objective.kcal,
          proteina: objective.proteina,
          carbs: objective.carbs,
          grasas: objective.grasas,
        },
        menuAsignadoId: activeMenu._id || activeMenu.id || null,
        coachId: activeMenu.coachId || actor?.coach?.entrenadorId || null,
      };
    }

    const userGoals = extractUserGoals(actor);
    if (userGoals) {
      return {
        objetivo: userGoals.objective,
        source: userGoals.source,
        planificado: null,
        menuAsignadoId: null,
        coachId: actor?.coach?.entrenadorId || null,
      };
    }

    return {
      objetivo: DEFAULT_OBJECTIVE,
      source: "default",
      planificado: null,
      menuAsignadoId: null,
      coachId: actor?.coach?.entrenadorId || null,
    };
  }

  async _findFoodById(foodId = "") {
    const id = cleanString(foodId, 120);
    if (!id) return null;
    if (typeof this.alimentosModel.obtenerAlimentoPorId === "function") {
      const direct = await this.alimentosModel.obtenerAlimentoPorId(id);
      if (direct) return normalizeFoodDoc(direct);
    }

    const alimentos = await this.alimentosModel.obtenerAlimentos();
    const normalized = (Array.isArray(alimentos) ? alimentos : []).map(normalizeFoodDoc);
    return normalized.find((food) => sameId(food.id, id) || sameId(food.alimentoId, id)) || null;
  }

  async _snapshotFromPayload(payload = {}, previousLog = null) {
    const cantidad = payload.cantidad ?? payload.amount ?? previousLog?.cantidad ?? 100;
    const unidad = payload.unidad || payload.unit || payload.food?.unidad || payload.food?.unit || previousLog?.unidad || "g";
    const foodPayload = payload.food || payload.alimento || payload.item || {};
    const foodId = foodPayload.alimentoId || foodPayload.id || foodPayload._id || payload.alimentoId || previousLog?.alimentoId;

    const dbFood = await this._findFoodById(foodId);
    if (dbFood) return buildFoodSnapshot(dbFood, cantidad, unidad || dbFood.unidad);

    if (foodPayload.nombre || foodPayload.name || foodPayload.nombreSnapshot) {
      return buildFoodSnapshot(
        normalizeFoodDoc({
          ...foodPayload,
          nombre: foodPayload.nombre || foodPayload.name || foodPayload.nombreSnapshot,
          kcal: foodPayload.kcal,
          proteina: foodPayload.proteina ?? foodPayload.protein,
          carbs: foodPayload.carbs,
          grasas: foodPayload.grasas ?? foodPayload.fat,
          unidad,
          fuente: foodPayload.fuente || foodPayload.categoria || foodPayload.categoriaSnapshot,
        }),
        cantidad,
        unidad
      );
    }

    if (previousLog) return scaleExistingSnapshot(previousLog, cantidad, unidad);
    throw new Error("FOOD_REQUIRED");
  }

  async _buildResponse(actor, date, objectiveInfo, dayOverride = null, logsOverride = null) {
    const userId = this._actorId(actor);
    const day = dayOverride || (await this.foodLogsModel.getDayByUserDate(userId, date));
    const logs = logsOverride || (await this.foodLogsModel.listLogsByUserDate(userId, date));
    const totals = totalLogs(logs);
    const objetivo = objectiveInfo?.objetivo || day?.objetivo || DEFAULT_OBJECTIVE;

    return {
      date,
      objetivo,
      objetivoSource: objectiveInfo?.source || "default",
      totals,
      remaining: remainingTotals(objetivo, totals),
      planificado: objectiveInfo?.planificado || null,
      day: normalizeDay(day, date),
      meals: groupLogsByMeal(logs),
    };
  }

  async getDay(user, query = {}) {
    const actor = await this._actor(user);
    this._assertClient(actor);
    const date = normalizeDate(query.date);
    const objectiveInfo = await this._resolveObjective(actor);
    return await this._buildResponse(actor, date, objectiveInfo);
  }

  async addLog(user, payload = {}) {
    const actor = await this._actor(user);
    const date = normalizeDate(payload.date);
    this._assertCanWriteTracking(actor, date);

    const mealType = normalizeMealType(payload.mealType || payload.comida);
    const objectiveInfo = await this._resolveObjective(actor);
    const day = await this.foodLogsModel.upsertDayBase({
      userId: this._actorId(actor),
      date,
      objetivo: objectiveInfo.objetivo,
      menuAsignadoId: objectiveInfo.menuAsignadoId,
      coachId: objectiveInfo.coachId,
    });

    const snapshot = await this._snapshotFromPayload(payload);
    await this.foodLogsModel.insertLog({
      userId: this._actorId(actor),
      foodLogDayId: day._id,
      date,
      mealType,
      ...snapshot,
      notas: cleanString(payload.notas || payload.notes, 1000),
    });

    const logs = await this.foodLogsModel.listLogsByUserDate(this._actorId(actor), date);
    const updatedDay = await this.foodLogsModel.updateDayTotals(day._id, totalLogs(logs));
    return await this._buildResponse(actor, date, objectiveInfo, updatedDay, logs);
  }

  async updateLog(user, logId, payload = {}) {
    const actor = await this._actor(user);
    const current = await this.foodLogsModel.getLogById(logId);
    if (!current) throw new Error("LOG_NOT_FOUND");
    if (!sameId(current.userId, this._actorId(actor))) throw new Error("FORBIDDEN");

    const date = normalizeDate(current.date);
    this._assertCanWriteTracking(actor, date);
    const patch = {};

    if (payload.mealType !== undefined || payload.comida !== undefined) {
      patch.mealType = normalizeMealType(payload.mealType || payload.comida);
    }

    if (
      payload.cantidad !== undefined ||
      payload.amount !== undefined ||
      payload.unidad !== undefined ||
      payload.unit !== undefined ||
      payload.food !== undefined ||
      payload.alimento !== undefined ||
      payload.item !== undefined
    ) {
      Object.assign(patch, await this._snapshotFromPayload(payload, current));
    }

    if (payload.notas !== undefined || payload.notes !== undefined) {
      patch.notas = cleanString(payload.notas || payload.notes, 1000);
    }

    await this.foodLogsModel.updateLogById(logId, patch);

    const objectiveInfo = await this._resolveObjective(actor);
    const logs = await this.foodLogsModel.listLogsByUserDate(this._actorId(actor), date);
    const day = await this.foodLogsModel.getDayByUserDate(this._actorId(actor), date);
    const updatedDay = day
      ? await this.foodLogsModel.updateDayTotals(day._id, totalLogs(logs))
      : null;

    return await this._buildResponse(actor, date, objectiveInfo, updatedDay, logs);
  }

  async deleteLog(user, logId) {
    const actor = await this._actor(user);
    const current = await this.foodLogsModel.getLogById(logId);
    if (!current) throw new Error("LOG_NOT_FOUND");
    if (!sameId(current.userId, this._actorId(actor))) throw new Error("FORBIDDEN");

    const date = normalizeDate(current.date);
    this._assertCanWriteTracking(actor, date);
    await this.foodLogsModel.deleteLogById(logId);

    const objectiveInfo = await this._resolveObjective(actor);
    const logs = await this.foodLogsModel.listLogsByUserDate(this._actorId(actor), date);
    const day = await this.foodLogsModel.getDayByUserDate(this._actorId(actor), date);
    const updatedDay = day
      ? await this.foodLogsModel.updateDayTotals(day._id, totalLogs(logs))
      : null;

    return await this._buildResponse(actor, date, objectiveInfo, updatedDay, logs);
  }
}

export default ServicioFoodLogs;
