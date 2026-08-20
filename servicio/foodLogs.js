import { ObjectId } from "mongodb";

import ModelMongoDBFoodLogs from "../model/DAO/foodLogsMongoDB.js";
import ModelMongoDBUsuarios from "../model/DAO/usuariosMongoDB.js";
import ModelMongoDBMenus from "../model/DAO/menusMongoDB.js";
import ModelMongoDBAlimentos from "../model/DAO/alimentosMongoDB.js";
import { TRACKING_OPTIMIZATION_POLICY } from "../menu2.js";
import ServiciosAlimentos, {
  TRACKING_QUANTITY_INTERNAL_CONTEXT,
} from "./alimentos.js";
import { requireCapability, requireTrackingHistoryRange } from "./accessGates.js";
import { filterEquivalentCandidateFoods, isEquivalentFoodAllowed } from "./trackingEquivalences.js";
import { normalizeFoodGenerationForRead } from "./foodGenerationMetadata.js";

const MEAL_TYPES = ["desayuno", "almuerzo", "merienda", "cena", "snack", "otra"];
const MEAL_TYPE_SET = new Set(MEAL_TYPES);
const AUTO_COMPLETE_REMAINING_MEALS_OPERATION = "auto_complete_remaining_meals";
const CONFIGURE_MANUAL_COMPLETION_MEALS_OPERATION = "configure_manual_completion_meals";
const TRACKING_QUANTITY_MODE_CONSTRAINED = "constrained";
const TRACKING_QUANTITY_MODE_CALORIE_FILL = "calorie_fill";

function trackingQuantityModeFromPayload(payload = {}) {
  if (!Object.prototype.hasOwnProperty.call(payload, "trackingQuantityMode")) {
    return TRACKING_QUANTITY_MODE_CALORIE_FILL;
  }
  const value = payload.trackingQuantityMode;
  if (
    value === TRACKING_QUANTITY_MODE_CONSTRAINED ||
    value === TRACKING_QUANTITY_MODE_CALORIE_FILL
  ) {
    return value;
  }
  throw new Error("INVALID_TRACKING_QUANTITY_MODE");
}

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
    source: doc.source || "",
    writeRequestId: cleanString(doc.writeRequestId, 120),
    writeItemIndex: Number.isInteger(Number(doc.writeItemIndex)) ? Number(doc.writeItemIndex) : null,
    notas: doc.notas || "",
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

const ALLOCATION_KINDS = new Set(["free", "menu_meal", "meal_target", "daily_target"]);

function normalizeAllocationKind(value = "") {
  const kind = normalizeToken(value);
  if (!ALLOCATION_KINDS.has(kind)) throw new Error("INVALID_ALLOCATION");
  return kind;
}

function normalizeAllocationGroup(doc = {}) {
  return {
    id: idToString(doc._id || doc.id),
    writeRequestId: cleanString(doc.writeRequestId, 120),
    date: doc.date || "",
    foodLogIds: (Array.isArray(doc.foodLogIds) ? doc.foodLogIds : []).map(idToString).filter(Boolean),
    total: normalizeMealMeta(doc.total || {}),
    allocations: (Array.isArray(doc.allocations) ? doc.allocations : []).map((entry) => ({
      kind: normalizeToken(entry?.kind),
      executionId: normalizeMealId(entry?.executionId || ""),
      label: cleanText(entry?.label, "Destino", 80),
      totals: normalizeMealMeta(entry?.totals || {}),
    })).filter((entry) => entry.executionId),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function allocationTotalsByDestination(groups = []) {
  const out = {};
  (Array.isArray(groups) ? groups : []).forEach((group) => {
    (Array.isArray(group?.allocations) ? group.allocations : []).forEach((entry) => {
      if (!entry?.executionId) return;
      out[entry.executionId] = addTotals(out[entry.executionId] || emptyTotals(), entry.totals || {});
    });
  });
  return out;
}

function proportionalAllocations(totalValue = {}, rawAllocations = []) {
  const total = normalizeMealMeta(totalValue);
  const entries = (Array.isArray(rawAllocations) ? rawAllocations : []).map((entry) => ({
    kind: normalizeAllocationKind(entry?.kind),
    executionId: normalizeMealId(entry?.executionId || entry?.id || ""),
    label: cleanText(entry?.label, "Destino", 80),
    kcal: macroNumber(entry?.totals?.kcal ?? entry?.kcal),
  })).filter((entry) => entry.executionId && entry.kcal > 0);
  const seen = new Set();
  entries.forEach((entry) => {
    if (seen.has(entry.executionId)) throw new Error("INVALID_ALLOCATION");
    seen.add(entry.executionId);
  });
  const requestedKcal = roundMacro(entries.reduce((sum, entry) => sum + entry.kcal, 0));
  if (!entries.length || total.kcal <= 0 || Math.abs(requestedKcal - total.kcal) > 0.2) {
    throw new Error("INVALID_ALLOCATION_TOTAL");
  }
  const accumulated = emptyTotals();
  return entries.map((entry, index) => {
    const last = index === entries.length - 1;
    const ratio = entry.kcal / total.kcal;
    const totals = {
      kcal: last ? roundMacro(total.kcal - accumulated.kcal) : roundMacro(entry.kcal),
      proteina: last ? roundMacro(total.proteina - accumulated.proteina) : roundMacro(total.proteina * ratio),
      carbs: last ? roundMacro(total.carbs - accumulated.carbs) : roundMacro(total.carbs * ratio),
      grasas: last ? roundMacro(total.grasas - accumulated.grasas) : roundMacro(total.grasas * ratio),
    };
    Object.keys(accumulated).forEach((key) => { accumulated[key] = roundMacro(accumulated[key] + totals[key]); });
    return { kind: entry.kind, executionId: entry.executionId, label: entry.label, totals };
  });
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
    this.alimentosService = new ServiciosAlimentos();
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
      objetivo: null,
      source: "missing",
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

  async validateEquivalentItems(user, items = [], { maxItems = 10 } = {}) {
    const actor = await this._actor(user);
    this._assertClient(actor);
    const source = Array.isArray(items) ? items.slice(0, Math.max(1, Number(maxItems) || 10)) : [];
    if (!source.length) throw new Error("FOOD_REQUIRED");
    const seen = new Set();
    const snapshots = [];
    for (const item of source) {
      const id = cleanString(item?.id || item?.alimentoId || item?.foodId, 120);
      if (!id || seen.has(id)) throw new Error("EQUIVALENT_FOOD_ID_INVALID");
      const dbFood = await this._findFoodById(id);
      if (!dbFood || !isEquivalentFoodAllowed(actor, dbFood)) throw new Error("EQUIVALENT_FOOD_NOT_ALLOWED");
      const snapshot = buildFoodSnapshot(
        dbFood,
        item?.quantity ?? item?.cantidad,
        item?.unit || item?.unidad || dbFood.unidad
      );
      if (!(Number(snapshot.cantidad) > 0)) throw new Error("CANTIDAD_INVALIDA");
      snapshots.push({
        id,
        alimentoId: id,
        name: snapshot.nombreSnapshot,
        nombre: snapshot.nombreSnapshot,
        quantity: snapshot.cantidad,
        cantidad: snapshot.cantidad,
        unit: snapshot.unidad,
        unidad: snapshot.unidad,
        kcal: snapshot.kcal,
        proteina: snapshot.proteina,
        proteinas: snapshot.proteina,
        carbs: snapshot.carbs,
        carbohidratos: snapshot.carbs,
        grasas: snapshot.grasas,
        source: cleanString(item?.source, 80),
        quantityMode: ["manual", "automatic", "calculated", "suggested"].includes(normalizeToken(item?.quantityMode || item?.mode || item?.status))
          ? normalizeToken(item?.quantityMode || item?.mode || item?.status)
          : item?.source === "addedCandidate" ? "suggested" : "manual",
        suggested: item?.suggested === true || item?.source === "addedCandidate",
      });
      seen.add(id);
    }
    return snapshots;
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
    const objetivo = objectiveInfo?.objetivo || null;
    const mealsConfig = buildMealsConfig(day, logs);
    let allocationDocs = [];
    if (typeof this.foodLogsModel.listAllocationsByUserDate === "function") {
      try {
        allocationDocs = await this.foodLogsModel.listAllocationsByUserDate(userId, date);
      } catch (error) {
        // Algunos tests unitarios construyen la respuesta con documentos in-memory.
        if (String(error?.message || "") !== "No hay conexion a la base de datos") throw error;
      }
    }
    const allocations = allocationDocs.map(normalizeAllocationGroup);

    return {
      date,
      objetivo,
      objetivoSource: objectiveInfo?.source || "missing",
      totals,
      remaining: remainingTotals(objetivo, totals),
      planificado: objectiveInfo?.planificado || null,
      day: normalizeDay(day, date),
      mealsConfig,
      meals: groupLogsByMeal(logs, mealsConfig),
      allocations,
      allocationTotalsByDestination: allocationTotalsByDestination(allocations),
    };
  }

  async _persistAllocationGroup(actor, date, writeRequestId, logs = [], rawAllocations = []) {
    if (!Array.isArray(rawAllocations) || !rawAllocations.length) return null;
    if (!writeRequestId) throw new Error("REQUEST_ID_REQUIRED");
    if (typeof this.foodLogsModel.upsertAllocation !== "function") return null;
    const requestLogs = logs.filter((log) => cleanString(log?.writeRequestId, 120) === writeRequestId);
    if (!requestLogs.length) throw new Error("INVALID_ALLOCATION");
    const total = totalLogs(requestLogs);
    const allocations = proportionalAllocations(total, rawAllocations);
    return await this.foodLogsModel.upsertAllocation({
      userId: this._actorId(actor),
      date,
      writeRequestId,
      foodLogIds: requestLogs.map((log) => log._id || log.id).filter(Boolean),
      total,
      allocations,
    });
  }

  async _reconcileAllocationGroup(actor, date, writeRequestId, logs = []) {
    if (!writeRequestId || typeof this.foodLogsModel.getAllocationByRequest !== "function") return;
    const existing = await this.foodLogsModel.getAllocationByRequest(this._actorId(actor), date, writeRequestId);
    if (!existing) return;
    const requestLogs = logs.filter((log) => cleanString(log?.writeRequestId, 120) === writeRequestId);
    if (!requestLogs.length) {
      await this.foodLogsModel.deleteAllocationByRequest?.(this._actorId(actor), date, writeRequestId);
      return;
    }
    const current = normalizeAllocationGroup(existing);
    const total = totalLogs(requestLogs);
    const previousTotalKcal = Math.max(0, Number(current.total?.kcal) || 0);
    const requested = current.allocations.map((entry, index) => ({
      ...entry,
      totals: {
        kcal: index === current.allocations.length - 1
          ? roundMacro(total.kcal - current.allocations.slice(0, index).reduce(
            (sum, item) => sum + roundMacro(total.kcal * ((Number(item.totals?.kcal) || 0) / Math.max(previousTotalKcal, 1))),
            0
          ))
          : roundMacro(total.kcal * ((Number(entry.totals?.kcal) || 0) / Math.max(previousTotalKcal, 1))),
      },
    }));
    const allocations = proportionalAllocations(total, requested);
    await this.foodLogsModel.upsertAllocation({
      userId: this._actorId(actor),
      date,
      writeRequestId,
      foodLogIds: requestLogs.map((log) => log._id || log.id).filter(Boolean),
      total,
      allocations,
    });
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
    const mealsConfig = normalizeMealsConfig(payload.mealsConfig || payload.meals || payload.comidas || []);
    if (payload.operation === AUTO_COMPLETE_REMAINING_MEALS_OPERATION) {
      requireCapability(actor, "nutrition.autoCompleteRemainingMeals");
    }
    if (payload.operation === CONFIGURE_MANUAL_COMPLETION_MEALS_OPERATION) {
      requireCapability(actor, "nutrition.planRemainingIntake");
      if (mealsConfig.length < 1 || mealsConfig.length > 4) {
        throw new Error("MANUAL_COMPLETION_MEALS_LIMIT");
      }
    }
    const { objectiveInfo, day } = await this._dayForConfig(actor, date);
    const updatedDay = await this.foodLogsModel.updateDayMealsConfig(day._id, mealsConfig);
    const logs = await this.foodLogsModel.listLogsByUserDate(this._actorId(actor), date);
    return await this._buildResponse(actor, date, objectiveInfo, updatedDay, logs);
  }

  async calculateRemainingQuantities(user, payload = {}) {
    const actor = await this._actor(user);
    const date = normalizeDate(payload.date);
    this._assertCanWriteTracking(actor, date);
    requireCapability(actor, "nutrition.autoCalculateTrackingQuantities");
    const trackingQuantityMode = trackingQuantityModeFromPayload(payload);
    const requestedGeneration = normalizeToken(payload.generationType || payload.alcance || "selected_only");
    const assisted = ["assisted_food_addition", "complete_meal", "completemeal", "completar_comida"].includes(requestedGeneration);
    const menuGenerationPolicy = payload.menuGenerationPolicy === "generic_menu_v1";
    const generationMealType = String(payload.generationMealType || "");
    const basePayload = {
      ...payload,
      // Tracking optimiza un restante: kcal son techo, proteína es un mínimo
      // prioritario y C/G son objetivos secundarios. Admin/Coach conservan
      // sus modos configurables al usar directamente ServicioAlimentos.
      mode: "kcalProteina",
      generationType: "selectedOnly",
      options: {
        ...(payload.options || {}),
        trackingPriority: trackingQuantityMode === TRACKING_QUANTITY_MODE_CONSTRAINED,
        trackingOptimizationPolicy: trackingQuantityMode === TRACKING_QUANTITY_MODE_CONSTRAINED
          ? TRACKING_OPTIMIZATION_POLICY
          : undefined,
      },
    };
    delete basePayload.candidateFoods;

    const internalContext = {
      authorization: TRACKING_QUANTITY_INTERNAL_CONTEXT,
      trackingQuantityMode,
      ...(menuGenerationPolicy ? { enforceQuantityConstraints: true } : {}),
    };
    const selectedResult = await this.alimentosService.generarCantidades(basePayload, internalContext);
    if (!assisted || selectedResult?.status === "error") return selectedResult;

    const diff = selectedResult?.diff || {};
    const candidateRoles = [];
    if (toNumber(diff.proteina ?? diff.protein, 0) < -1) candidateRoles.push("proteicos");
    if (toNumber(diff.carbs ?? diff.carbohidratos, 0) < -3) candidateRoles.push("carbohidratos");
    if (toNumber(diff.grasas ?? diff.fat, 0) < -2) candidateRoles.push("grasas");
    if (!candidateRoles.length && toNumber(diff.calorias ?? diff.kcal, 0) < -1) {
      const target = payload.target || payload.mealTarget || {};
      const normalizedTargets = [
        ["proteicos", toNumber(target.proteina ?? target.protein, 0)],
        ["carbohidratos", toNumber(target.carbs ?? target.carbohidratos, 0)],
        ["grasas", toNumber(target.grasas ?? target.fat, 0)],
      ].sort((a, b) => b[1] - a[1]);
      if (normalizedTargets[0]?.[1] > 0) candidateRoles.push(normalizedTargets[0][0]);
    }
    if (!candidateRoles.length) {
      return {
        ...selectedResult,
        generationType: "assisted_food_addition",
        assisted: { attempted: true, added: 0, reason: "selected_foods_already_sufficient" },
      };
    }

    const selectedFoodIds = [
      ...(Array.isArray(payload.fixedFoods) ? payload.fixedFoods : []),
      ...(Array.isArray(payload.pendingFoods) ? payload.pendingFoods : []),
    ].map((food) => food?.foodId || food?.alimentoId || food?.id || food?._id).filter(Boolean);
    const catalog = await this.alimentosModel.obtenerAlimentos();
    const candidates = filterEquivalentCandidateFoods(actor, catalog, {
      selectedFoodIds,
      rejectedFoodIds: payload.rejectedSuggestionFoodIds,
    }).filter((food) => {
      if (!menuGenerationPolicy) return true;
      const generation = normalizeFoodGenerationForRead(food?.generation);
      return generation.mode === "GENERIC" && generation.mealTypes[generationMealType] === true;
    });
    if (!candidates.length) {
      return {
        ...selectedResult,
        generationType: "assisted_food_addition",
        warnings: [...new Set([...(selectedResult?.warnings || []), "No hay sugerencias compatibles con tus restricciones."])],
        assisted: { attempted: true, added: 0, reason: "no_allowed_candidates", candidateRoles },
      };
    }

    const assistedResult = await this.alimentosService.generarCantidades({
      ...basePayload,
      generationType: "completeMeal",
      candidateFoods: candidates,
    }, {
      ...internalContext,
      candidateRoles,
    });
    const added = (assistedResult?.foods || []).filter((food) => food?.source === "addedCandidate").length;
    return {
      ...assistedResult,
      generationType: "assisted_food_addition",
      assisted: {
        attempted: true,
        added,
        candidateRoles,
        filteredCandidates: candidates.length,
      },
    };
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
    const currentLogs = await this.foodLogsModel.listLogsByUserDate(this._actorId(actor), date);
    const mealLogs = currentLogs.filter((log) => (
      normalizeMealId(log?.mealId || log?.mealConfigId || log?.mealKey) === cleanMealId ||
      (!log?.mealId && mealType && normalizeMealType(log?.mealType || log?.comida) === mealType)
    ));
    const allocationRequestIds = [...new Set(
      mealLogs
        .map((log) => cleanString(log?.writeRequestId, 120))
        .filter(Boolean)
    )];
    if (mealLogs.length && payload.confirmDeleteLogs !== true) {
      throw new Error("TRACKING_MEAL_NOT_EMPTY");
    }

    await this.foodLogsModel.deleteLogsByMeal({
      userId: this._actorId(actor),
      date,
      mealId: cleanMealId,
      mealType,
    });

    const nextConfig = normalizeMealsConfig(mealsConfig.filter((meal) => meal.mealId !== cleanMealId));
    const dayWithConfig = await this.foodLogsModel.updateDayMealsConfig(day._id, nextConfig);
    const logs = await this.foodLogsModel.listLogsByUserDate(this._actorId(actor), date);
    for (const writeRequestId of allocationRequestIds) {
      await this._reconcileAllocationGroup(actor, date, writeRequestId, logs);
    }
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

  async addSnapshotLogs(user, payload = {}, { requiredCapability = "", requireRequestId = false } = {}) {
    const actor = await this._actor(user);
    const date = normalizeDate(payload.date);
    this._assertCanWriteTracking(actor, date);
    if (requiredCapability) requireCapability(actor, requiredCapability);

    const mealType = normalizeMealType(payload.mealType || payload.comida);
    const mealId = normalizeMealId(payload.mealId || payload.mealConfigId || payload.mealKey) || mealType;
    const items = Array.isArray(payload.items) ? payload.items : [];
    if (!items.length) throw new Error("FOOD_REQUIRED");
    const writeRequestId = cleanString(payload.requestId || payload.writeRequestId, 120);
    if (requireRequestId && !writeRequestId) throw new Error("REQUEST_ID_REQUIRED");

    const objectiveInfo = await this._resolveObjective(actor);
    const day = await this.foodLogsModel.upsertDayBase({
      userId: this._actorId(actor),
      date,
      objetivo: objectiveInfo.objetivo,
      menuAsignadoId: objectiveInfo.menuAsignadoId,
      coachId: objectiveInfo.coachId,
    });
    await this._ensureMealConfig(day, { mealId, tipo: mealType, nombre: payload.mealName || payload.nombreComida });

    let insertedCount = 0;
    for (const [writeItemIndex, item] of items.slice(0, 80).entries()) {
      const snapshot = snapshotFromSavedMealItem(item);
      if (snapshot.cantidad <= 0) continue;
      try {
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
          menuId: payload.menuId || null,
          originalMealId: cleanString(payload.originalMealId, 120) || null,
          equivalenceId: cleanString(payload.equivalenceId, 240) || null,
          warningsAccepted: Array.isArray(payload.warningsAccepted)
            ? payload.warningsAccepted.map((warning) => cleanString(warning, 180)).filter(Boolean).slice(0, 20)
            : [],
          notas: cleanString(payload.notas || payload.notes || "", 1000),
          ...(writeRequestId ? { writeRequestId, writeItemIndex } : {}),
        });
        insertedCount += 1;
      } catch (error) {
        if (!(writeRequestId && Number(error?.code) === 11000)) throw error;
      }
    }

    const logs = await this.foodLogsModel.listLogsByUserDate(this._actorId(actor), date);
    await this._persistAllocationGroup(actor, date, writeRequestId, logs, payload.allocations);
    const updatedDay = await this.foodLogsModel.updateDayTotals(day._id, totalLogs(logs));
    const response = await this._buildResponse(actor, date, objectiveInfo, updatedDay, logs);
    return {
      ...response,
      ...(writeRequestId ? { writeRequestId, insertedCount, idempotent: insertedCount === 0 } : {}),
    };
  }

  async addCalculatedLogs(user, payload = {}) {
    return await this.addSnapshotLogs(
      user,
      { ...payload, source: "manual_completion_calculator" },
      {
        requiredCapability: "nutrition.autoCalculateTrackingQuantities",
        requireRequestId: true,
      }
    );
  }

  async addBatchLogs(user, payload = {}) {
    return await this.addSnapshotLogs(
      user,
      { ...payload, source: payload.source || "manual_tracking_batch" },
      { requireRequestId: true }
    );
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
    await this._reconcileAllocationGroup(actor, date, cleanString(current.writeRequestId, 120), logs);
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
    await this._reconcileAllocationGroup(actor, date, cleanString(current.writeRequestId, 120), logs);
    const day = await this.foodLogsModel.getDayByUserDate(this._actorId(actor), date);
    const updatedDay = day
      ? await this.foodLogsModel.updateDayTotals(day._id, totalLogs(logs))
      : null;

    return await this._buildResponse(actor, date, objectiveInfo, updatedDay, logs);
  }
}

export { canUseAssignedMenuForActor };

export default ServicioFoodLogs;
