import { ObjectId } from "mongodb";

import ModelMongoDBFoodLogs from "../model/DAO/foodLogsMongoDB.js";
import ModelMongoDBUsuarios from "../model/DAO/usuariosMongoDB.js";
import ModelMongoDBMenus from "../model/DAO/menusMongoDB.js";
import ModelMongoDBAlimentos from "../model/DAO/alimentosMongoDB.js";
import { requireTrackingHistoryRange } from "./accessGates.js";

const MEAL_TYPES = ["desayuno", "almuerzo", "merienda", "cena", "snack", "otra"];
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
  const rawToken = normalizeToken(value, "");
  const token = rawToken === "otro" || rawToken === "libre" ? "otra" : rawToken;
  if (!MEAL_TYPE_SET.has(token)) throw new Error("INVALID_MEAL_TYPE");
  return token;
}

function generatedMealId() {
  return `meal_${new ObjectId().toString()}`;
}

function normalizeMealId(value = "") {
  const raw = cleanString(value, 80);
  if (!raw) return "";
  return raw.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
}

function mealTypeLabel(value = "") {
  const labels = {
    desayuno: "Desayuno",
    almuerzo: "Almuerzo",
    merienda: "Merienda",
    cena: "Cena",
    snack: "Snack",
    otra: "Otra",
  };
  return labels[value] || "Comida";
}

function normalizeMealMeta(value = {}) {
  const input = value || {};
  return {
    kcal: macroNumber(input.kcal),
    proteina: macroNumber(input.proteina ?? input.proteinas),
    carbs: macroNumber(input.carbs ?? input.carbohidratos),
    grasas: macroNumber(input.grasas),
  };
}

function hasMealMeta(meta = {}) {
  return Object.values(normalizeMealMeta(meta)).some((value) => value > 0);
}

function normalizeMealConfig(raw = {}, index = 0) {
  const tipo = normalizeMealType(raw.tipo || raw.type || raw.mealType || "snack");
  const mealId = normalizeMealId(raw.mealId || raw.id) || generatedMealId();
  const meta = normalizeMealMeta(raw.meta || raw.target || {});
  return {
    mealId,
    tipo,
    nombre: cleanText(raw.nombre || raw.label || mealTypeLabel(tipo), mealTypeLabel(tipo), 80),
    orden: Math.max(0, Number(raw.orden ?? raw.order ?? index) || index),
    meta: hasMealMeta(meta) ? meta : null,
    createdAt: raw.createdAt || new Date(),
    updatedAt: new Date(),
  };
}

function normalizeMealsConfig(value = []) {
  const used = new Set();
  return (Array.isArray(value) ? value : [])
    .slice(0, 24)
    .map((meal, index) => normalizeMealConfig(meal, index))
    .map((meal) => {
      if (!used.has(meal.mealId)) {
        used.add(meal.mealId);
        return meal;
      }
      const next = { ...meal, mealId: generatedMealId() };
      used.add(next.mealId);
      return next;
    })
    .sort((a, b) => (a.orden || 0) - (b.orden || 0))
    .map((meal, index) => ({ ...meal, orden: index }));
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
  const unitRaw = cleanString(raw.Unidad || raw.unidad || raw.unit || raw.unidadBase, 40);
  const unitLower = unitRaw.toLowerCase();
  const unidad = unitLower.startsWith("gr") || unitLower === "g" ? "g" : unitRaw || "unidad";
  const kcal = macroNumber(raw.Calorias ?? raw.calorias ?? raw.kcal ?? raw.calories ?? raw.kcalUnidad ?? raw.kcal100);
  const proteina = macroNumber(raw.Proteinas ?? raw.proteinas ?? raw.proteina ?? raw.protein ?? raw.proteinaUnidad ?? raw.proteina100);
  const carbs = macroNumber(raw.Carbohidratos ?? raw.carbohidratos ?? raw.carbs ?? raw.carbohydrates ?? raw.hidratos ?? raw.carbohidratosUnidad ?? raw.carbohidratos100);
  const grasas = macroNumber(raw.Grasas ?? raw.grasas ?? raw.fat ?? raw.fats ?? raw.grasasUnidad ?? raw.grasas100);
  const fuente =
    cleanString(
      raw.Fuente || raw.fuente || raw.Categoria || raw.categoria || raw.categoriaZumaFit || raw["Categoria"] || raw.Grupo || raw.grupo,
      120
    ) || inferFoodCategory({ name, kcal, proteina, carbs, grasas });
  const imagen = normalizeFoodImage(raw, name, fuente);

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
    imagen,
    imagenUrl: imagen.url,
    raw,
  };
}

function normalizeFoodImage(raw = {}, name = "", categoria = "") {
  const image = raw?.imagen && typeof raw.imagen === "object" ? raw.imagen : {};
  const urlExacta = cleanString(image.urlExacta || raw.imagenUrlExacta, 240);
  const urlGenerica = cleanString(image.urlGenerica || raw.imagenUrlGenerica, 240);
  const url = cleanString(image.url || raw.imagenUrl || urlExacta || urlGenerica, 240);
  return {
    exactaKey: cleanString(image.exactaKey || raw.imagenExactaKey, 120),
    genericaKey: cleanString(image.genericaKey || raw.imagenGenericaKey, 120),
    urlExacta,
    urlGenerica,
    url,
    alt: cleanString(image.alt || raw.imagenAlt || name, 180),
    estado: cleanString(image.estado || raw.imagenEstado, 80),
    fuente: cleanString(image.fuente || raw.imagenFuente || categoria, 120),
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
    imagen: normalized.imagen || null,
    imagenUrl: normalized.imagenUrl || normalized.imagen?.url || "",
  };
}

function snapshotFromSavedMealItem(item = {}) {
  const nombre = item.nombre || item.nombreSnapshot || item.name || "Alimento";
  return {
    alimentoId: item.alimentoId || item.alimentoObjectId || null,
    nombreSnapshot: cleanText(nombre, "Alimento", 180),
    cantidad: macroNumber(item.cantidad ?? item.quantity ?? item.amount),
    unidad: cleanText(item.unidad || item.unit, "g", 40),
    kcal: macroNumber(item.kcal ?? item.calorias ?? item.calories),
    proteina: macroNumber(item.proteina ?? item.proteinas ?? item.protein),
    carbs: macroNumber(item.carbs ?? item.carbohidratos ?? item.carbohydrates),
    grasas: macroNumber(item.grasas ?? item.fat ?? item.fats),
    fibra: macroNumber(item.fibra),
    fuente: cleanString(item.fuente || item.categoria || item.categoriaSnapshot, 120),
    categoriaSnapshot: cleanString(item.categoriaSnapshot || item.categoria || item.category, 120),
    imagen: item.imagen || null,
    imagenUrl: item.imagenUrl || item.imageUrl || item.imagen?.url || "",
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
    imagen: log.imagen || null,
    imagenUrl: log.imagenUrl || log.imagen?.url || "",
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
    mealId: normalizeMealId(doc.mealId || "") || "",
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
    imagen: doc.imagen || null,
    imagenUrl: doc.imagenUrl || doc.imagen?.url || "",
    notas: doc.notas || "",
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function buildMealsConfig(day = null, logs = []) {
  const stored = normalizeMealsConfig(day?.mealsConfig || []);
  const byId = new Map(stored.map((meal) => [meal.mealId, meal]));
  const out = [...stored];

  logs.map(normalizeLog).forEach((log) => {
    const tipo = MEAL_TYPE_SET.has(log.mealType) ? log.mealType : "snack";
    const mealId = normalizeMealId(log.mealId) || tipo;
    if (byId.has(mealId)) return;
    const meal = {
      mealId,
      tipo,
      nombre: mealTypeLabel(tipo),
      orden: out.length,
      meta: null,
      legacy: !log.mealId,
    };
    byId.set(mealId, meal);
    out.push(meal);
  });

  return out.sort((a, b) => (a.orden || 0) - (b.orden || 0));
}

function groupLogsByMeal(logs = [], mealsConfig = []) {
  const grouped = Object.fromEntries((mealsConfig || []).map((meal) => [meal.mealId, []]));
  logs.map(normalizeLog).forEach((log) => {
    const fallbackType = MEAL_TYPE_SET.has(log.mealType) ? log.mealType : "snack";
    const key = normalizeMealId(log.mealId) || fallbackType;
    log.mealId = key;
    if (!grouped[key]) grouped[key] = [];
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
    mealsConfig: normalizeMealsConfig(doc.mealsConfig || []),
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

function currentCoachIdForUser(user = {}) {
  return user?.coach?.entrenadorId || user?.coach?.coachId || user?.coachId || null;
}

function canUseAssignedMenuForActor(actor = {}, menu = null) {
  const currentCoachId = currentCoachIdForUser(actor);
  if (!currentCoachId || !menu) return false;
  if (menu.estado !== "activo" || menu.activa === false) return false;
  return sameId(menu.coachId, currentCoachId);
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
    requireTrackingHistoryRange(actor, { date });
    const permissions = actor?.clientPermissions?.tracking || actor?.clientPermissions?.foodTracking || {};
    if (permissions.canTrackFood === false) throw new Error("TRACKING_NOT_ALLOWED");
    if (date !== todayString() && permissions.canEditPastDays === false) throw new Error("PAST_DAYS_NOT_ALLOWED");
  }

  async _resolveObjective(actor) {
    const clientId = this._actorId(actor);
    const currentCoachId = currentCoachIdForUser(actor);
    const activeMenuCandidate = currentCoachId
      ? await this.menusModel.getActiveForClientAndCoach(clientId, currentCoachId)
      : null;
    const activeMenu = canUseAssignedMenuForActor(actor, activeMenuCandidate) ? activeMenuCandidate : null;

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
        coachId: activeMenu.coachId || currentCoachId || null,
      };
    }

    const userGoals = extractUserGoals(actor);
    if (userGoals) {
      return {
        objetivo: userGoals.objective,
        source: userGoals.source,
        planificado: null,
        menuAsignadoId: null,
        coachId: currentCoachId || null,
      };
    }

    return {
      objetivo: DEFAULT_OBJECTIVE,
      source: "default",
      planificado: null,
      menuAsignadoId: null,
      coachId: currentCoachId || null,
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

  async _ensureMealConfig(day = null, meal = {}) {
    if (!day?._id) return day;
    const current = normalizeMealsConfig(day.mealsConfig || []);
    const mealId = normalizeMealId(meal.mealId || meal.id);
    if (!mealId || current.some((item) => item.mealId === mealId)) return day;
    const next = normalizeMealsConfig([
      ...current,
      {
        mealId,
        tipo: meal.tipo || meal.type || meal.mealType || "snack",
        nombre: meal.nombre || meal.label || mealTypeLabel(meal.tipo || meal.type || meal.mealType),
        orden: current.length,
        meta: meal.meta || meal.target || null,
      },
    ]);
    return await this.foodLogsModel.updateDayMealsConfig(day._id, next);
  }

  async _dayForConfig(actor, date) {
    const objectiveInfo = await this._resolveObjective(actor);
    const day = await this.foodLogsModel.upsertDayBase({
      userId: this._actorId(actor),
      date,
      objetivo: objectiveInfo.objetivo,
      menuAsignadoId: objectiveInfo.menuAsignadoId,
      coachId: objectiveInfo.coachId,
    });
    return { objectiveInfo, day };
  }

  async _buildResponse(actor, date, objectiveInfo, dayOverride = null, logsOverride = null) {
    const userId = this._actorId(actor);
    const day = dayOverride || (await this.foodLogsModel.getDayByUserDate(userId, date));
    const logs = logsOverride || (await this.foodLogsModel.listLogsByUserDate(userId, date));
    const totals = totalLogs(logs);
    const objetivo = objectiveInfo?.objetivo || day?.objetivo || DEFAULT_OBJECTIVE;
    const mealsConfig = buildMealsConfig(day, logs);

    return {
      date,
      objetivo,
      objetivoSource: objectiveInfo?.source || "default",
      totals,
      remaining: remainingTotals(objetivo, totals),
      planificado: objectiveInfo?.planificado || null,
      day: normalizeDay(day, date),
      mealsConfig,
      meals: groupLogsByMeal(logs, mealsConfig),
    };
  }

  async getDay(user, query = {}) {
    const actor = await this._actor(user);
    this._assertClient(actor);
    const date = normalizeDate(query.date);
    requireTrackingHistoryRange(actor, { date });
    const objectiveInfo = await this._resolveObjective(actor);
    return await this._buildResponse(actor, date, objectiveInfo);
  }

  async updateMealsConfig(user, payload = {}) {
    const actor = await this._actor(user);
    const date = normalizeDate(payload.date);
    this._assertCanWriteTracking(actor, date);
    const { objectiveInfo, day } = await this._dayForConfig(actor, date);
    const mealsConfig = normalizeMealsConfig(payload.mealsConfig || payload.meals || payload.comidas || []);
    const updatedDay = await this.foodLogsModel.updateDayMealsConfig(day._id, mealsConfig);
    const logs = await this.foodLogsModel.listLogsByUserDate(this._actorId(actor), date);
    return await this._buildResponse(actor, date, objectiveInfo, updatedDay, logs);
  }

  async deleteMeal(user, mealId, payload = {}) {
    const actor = await this._actor(user);
    const date = normalizeDate(payload.date);
    this._assertCanWriteTracking(actor, date);
    const cleanMealId = normalizeMealId(mealId);
    if (!cleanMealId) throw new Error("ID_INVALIDO");

    const { objectiveInfo, day } = await this._dayForConfig(actor, date);
    const mealsConfig = normalizeMealsConfig(day.mealsConfig || []);
    const currentMeal = mealsConfig.find((meal) => meal.mealId === cleanMealId);
    const mealType = currentMeal?.tipo || (MEAL_TYPE_SET.has(cleanMealId) ? cleanMealId : "");

    await this.foodLogsModel.deleteLogsByMeal({
      userId: this._actorId(actor),
      date,
      mealId: cleanMealId,
      mealType,
    });

    const nextConfig = normalizeMealsConfig(mealsConfig.filter((meal) => meal.mealId !== cleanMealId));
    const dayWithConfig = await this.foodLogsModel.updateDayMealsConfig(day._id, nextConfig);
    const logs = await this.foodLogsModel.listLogsByUserDate(this._actorId(actor), date);
    const updatedDay = await this.foodLogsModel.updateDayTotals(dayWithConfig._id, totalLogs(logs));
    return await this._buildResponse(actor, date, objectiveInfo, updatedDay, logs);
  }

  async addLog(user, payload = {}) {
    const actor = await this._actor(user);
    const date = normalizeDate(payload.date);
    this._assertCanWriteTracking(actor, date);

    const mealType = normalizeMealType(payload.mealType || payload.comida);
    const mealId = normalizeMealId(payload.mealId || payload.mealConfigId || payload.mealKey) || mealType;
    const objectiveInfo = await this._resolveObjective(actor);
    const day = await this.foodLogsModel.upsertDayBase({
      userId: this._actorId(actor),
      date,
      objetivo: objectiveInfo.objetivo,
      menuAsignadoId: objectiveInfo.menuAsignadoId,
      coachId: objectiveInfo.coachId,
    });
    await this._ensureMealConfig(day, { mealId, tipo: mealType, nombre: payload.mealName || payload.nombreComida });

    const snapshot = await this._snapshotFromPayload(payload);
    await this.foodLogsModel.insertLog({
      userId: this._actorId(actor),
      foodLogDayId: day._id,
      date,
      mealType,
      mealId,
      ...snapshot,
      notas: cleanString(payload.notas || payload.notes, 1000),
    });

    const logs = await this.foodLogsModel.listLogsByUserDate(this._actorId(actor), date);
    const updatedDay = await this.foodLogsModel.updateDayTotals(day._id, totalLogs(logs));
    return await this._buildResponse(actor, date, objectiveInfo, updatedDay, logs);
  }

  async addSnapshotLogs(user, payload = {}) {
    const actor = await this._actor(user);
    const date = normalizeDate(payload.date);
    this._assertCanWriteTracking(actor, date);

    const mealType = normalizeMealType(payload.mealType || payload.comida);
    const mealId = normalizeMealId(payload.mealId || payload.mealConfigId || payload.mealKey) || mealType;
    const items = Array.isArray(payload.items) ? payload.items : [];
    if (!items.length) throw new Error("FOOD_REQUIRED");

    const objectiveInfo = await this._resolveObjective(actor);
    const day = await this.foodLogsModel.upsertDayBase({
      userId: this._actorId(actor),
      date,
      objetivo: objectiveInfo.objetivo,
      menuAsignadoId: objectiveInfo.menuAsignadoId,
      coachId: objectiveInfo.coachId,
    });
    await this._ensureMealConfig(day, { mealId, tipo: mealType, nombre: payload.mealName || payload.nombreComida });

    for (const item of items.slice(0, 80)) {
      const snapshot = snapshotFromSavedMealItem(item);
      if (snapshot.cantidad <= 0) continue;
      await this.foodLogsModel.insertLog({
        userId: this._actorId(actor),
        foodLogDayId: day._id,
        date,
        mealType,
        mealId,
        ...snapshot,
        source: payload.source || "saved_meal",
        savedMealId: payload.savedMealId || null,
        savedMealName: payload.savedMealName || "",
        notas: cleanString(payload.notas || payload.notes || "", 1000),
      });
    }

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

    if (payload.mealId !== undefined || payload.mealConfigId !== undefined || payload.mealKey !== undefined) {
      patch.mealId = normalizeMealId(payload.mealId || payload.mealConfigId || payload.mealKey);
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

export { canUseAssignedMenuForActor };

export default ServicioFoodLogs;
