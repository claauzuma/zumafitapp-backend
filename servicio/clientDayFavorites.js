import ModelMongoDBClientDayFavorites from "../model/DAO/clientDayFavoritesMongoDB.js";
import ModelMongoDBClientMenuTracking from "../model/DAO/clientMenuTrackingMongoDB.js";
import ModelMongoDBFoodLogs from "../model/DAO/foodLogsMongoDB.js";
import ModelMongoDBUsuarios from "../model/DAO/usuariosMongoDB.js";
import { normalizeClientRole } from "./clientNutritionCapabilities.js";
import { requireQuota } from "./accessGates.js";
import ServicioFoodLogs from "./foodLogs.js";
import { resolveClientNutritionWeek } from "./usuarios.js";

const TYPES = new Set(["desayuno", "almuerzo", "merienda", "cena", "snack", "colacion", "pre_entreno", "post_entreno", "otra", "otro"]);

function error(code, message, extra = {}) {
  const value = new Error(code);
  value.code = code;
  value.publicMessage = message;
  Object.assign(value, extra);
  return value;
}

function id(value) {
  return value?.toString?.() || String(value || "");
}

function text(value, max = 160) {
  return String(value || "").trim().slice(0, max);
}

function number(value, max = 100000) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(Math.max(0, Math.min(max, parsed)) * 10) / 10 : 0;
}

function mealType(value = "") {
  const normalized = text(value, 40).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\s-]+/g, "_");
  return TYPES.has(normalized) ? normalized : "otro";
}

function totals(value = {}) {
  return {
    kcal: number(value.kcal ?? value.calorias ?? value.calories, 20000),
    proteina: number(value.proteina ?? value.proteinas ?? value.protein, 1000),
    carbs: number(value.carbs ?? value.carbohidratos ?? value.carbohydrates, 2000),
    grasas: number(value.grasas ?? value.fat ?? value.fats, 1000),
  };
}

function addTotals(a = {}, b = {}) {
  const left = totals(a);
  const right = totals(b);
  return totals({
    kcal: left.kcal + right.kcal,
    proteina: left.proteina + right.proteina,
    carbs: left.carbs + right.carbs,
    grasas: left.grasas + right.grasas,
  });
}

function item(raw = {}, index = 0) {
  const valueTotals = totals(raw.totals || raw);
  return {
    id: text(raw.id || raw._id || `food-${index + 1}`, 100),
    alimentoId: text(raw.alimentoId || raw.foodId || raw.id || raw._id, 100) || null,
    nombreSnapshot: text(raw.nombreSnapshot || raw.nombre || raw.name || `Alimento ${index + 1}`, 180),
    cantidad: number(raw.cantidad ?? raw.quantity ?? raw.amount, 100000),
    unidad: text(raw.unidad || raw.unit || "g", 40) || "g",
    imagenUrl: text(raw.imagenUrl || raw.imageUrl || raw.imagen?.url || raw.imagen, 500),
    ...valueTotals,
    quantityMode: text(raw.quantityMode || raw.cantidadModo || "manual", 20) || "manual",
  };
}

function physicalMeal(raw = {}, index = 0) {
  const items = (Array.isArray(raw.items) ? raw.items : Array.isArray(raw.foods) ? raw.foods : Array.isArray(raw.alimentos) ? raw.alimentos : [])
    .slice(0, 30).map(item).filter((food) => food.nombreSnapshot);
  const summed = items.reduce(addTotals, totals());
  const explicit = totals(raw.totals || raw.meta || raw);
  return {
    id: text(raw.id || raw._id || `meal-${index + 1}`, 100),
    nombre: text(raw.nombre || raw.name || `Comida ${index + 1}`, 160),
    tipoComida: mealType(raw.tipoComida || raw.mealType || raw.type || raw.tipo),
    order: index,
    compositionOrigin: text(raw.compositionOrigin || raw.origin || "manual", 30),
    items,
    totals: summed.kcal > 0 ? summed : explicit,
  };
}

function targetMeal(raw = {}, index = 0) {
  return {
    id: text(raw.id || raw.mealId || `target-${index + 1}`, 100),
    name: text(raw.name || raw.nombre || `Comida ${index + 1}`, 100),
    type: mealType(raw.type || raw.tipo || raw.mealType || raw.tipoComida),
    order: index,
    target: totals(raw.target || raw.meta || raw),
    targetOrigin: text(raw.targetOrigin || "manual", 20),
  };
}

function favoritePublic(doc = {}) {
  return {
    id: id(doc._id || doc.id),
    name: doc.name,
    originalDate: doc.originalDate || null,
    sourceType: doc.sourceType || "mixed",
    dailyTarget: doc.dailyTarget || totals(),
    plannedTotals: doc.plannedTotals || totals(),
    physicalMeals: doc.physicalMeals || [],
    targetMeals: doc.targetMeals || [],
    createdAt: doc.createdAt || null,
    updatedAt: doc.updatedAt || null,
  };
}

function dayKey(date) {
  const keys = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  return keys[new Date(`${date}T12:00:00Z`).getUTCDay()];
}

function normalizeDate(value = "") {
  const date = text(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw error("INVALID_DATE", "Elegí una fecha válida.");
  return date;
}

export default class ServicioClientDayFavorites {
  constructor() {
    this.model = new ModelMongoDBClientDayFavorites();
    this.users = new ModelMongoDBUsuarios();
    this.tracking = new ModelMongoDBClientMenuTracking();
    this.foodLogDays = new ModelMongoDBFoodLogs();
    this.foodLogs = new ServicioFoodLogs();
  }

  async _actor(actor = {}) {
    const userId = actor.id || actor._id;
    if (!userId) throw error("NO_AUTENTICADO", "No autenticado.");
    const user = await this.users.obtenerPorId(userId);
    if (!user) throw error("NO_AUTENTICADO", "No autenticado.");
    if (normalizeClientRole(user.role || user.rol) !== "cliente") throw error("USER_NOT_CLIENT", "Esta sección es sólo para clientes.");
    return user;
  }

  async list(actor) {
    const user = await this._actor(actor);
    const userId = id(user._id || user.id);
    const [docs, count] = await Promise.all([this.model.listByUser(userId), this.model.countByUser(userId)]);
    const context = requireQuota(user, "favorites", count, { increment: 0 });
    return { items: docs.map(favoritePublic), usage: { current: count, limit: context.limits?.favorites ?? null } };
  }

  async create(actor, payload = {}) {
    const user = await this._actor(actor);
    const userId = id(user._id || user.id);
    const current = await this.model.countByUser(userId);
    const context = requireQuota(user, "favorites", current);
    const physicalMeals = (Array.isArray(payload.physicalMeals) ? payload.physicalMeals : []).slice(0, 16).map(physicalMeal).filter((meal) => meal.items.length);
    const targetMeals = (Array.isArray(payload.targetMeals) ? payload.targetMeals : []).slice(0, 16).map(targetMeal).filter((meal) => meal.target.kcal > 0);
    if (!physicalMeals.length && !targetMeals.length) throw error("EMPTY_DAY_FAVORITE", "No hay una planificación para guardar.");
    const physicalTotals = physicalMeals.reduce((sum, meal) => addTotals(sum, meal.totals), totals());
    const targetTotals = targetMeals.reduce((sum, meal) => addTotals(sum, meal.target), totals());
    const requestedTotals = totals(payload.plannedTotals || {});
    const plannedTotals = requestedTotals.kcal > 0 ? requestedTotals : targetTotals.kcal > 0 ? addTotals(targetTotals, physicalTotals) : physicalTotals;
    const sourceType = targetMeals.length && physicalMeals.length ? "mixed" : targetMeals.length ? "target" : text(payload.sourceType || "manual", 30);
    const created = await this.model.create({
      ownerId: userId,
      name: text(payload.name, 80) || `Mi día · ${Math.round(plannedTotals.kcal)} kcal`,
      originalDate: /^\d{4}-\d{2}-\d{2}$/.test(text(payload.originalDate, 10)) ? text(payload.originalDate, 10) : null,
      sourceType,
      dailyTarget: totals(payload.dailyTarget || {}),
      plannedTotals,
      physicalMeals,
      targetMeals,
    });
    const after = await this.model.countByUser(userId);
    const limit = Number(context.limits?.favorites);
    if (Number.isFinite(limit) && after > limit) {
      await this.model.softDelete(created._id, userId);
      throw error("PLAN_LIMIT_REACHED", `Alcanzaste el límite de ${limit} días guardados.`, { resource: "favorites", current, limit });
    }
    return { favorite: favoritePublic(created), usage: { current: after, limit: Number.isFinite(limit) ? limit : null } };
  }

  async remove(actor, favoriteId) {
    const user = await this._actor(actor);
    const removed = await this.model.softDelete(favoriteId, id(user._id || user.id));
    if (!removed) throw error("DAY_FAVORITE_NOT_FOUND", "No encontramos ese día guardado.");
    return { ok: true };
  }

  async update(actor, favoriteId, payload = {}) {
    const user = await this._actor(actor);
    const userId = id(user._id || user.id);
    const current = await this.model.getByIdForUser(favoriteId, userId);
    if (!current) throw error("DAY_FAVORITE_NOT_FOUND", "No encontramos ese día guardado.");

    const nextPhysicalMeals = Object.prototype.hasOwnProperty.call(payload, "physicalMeals")
      ? (Array.isArray(payload.physicalMeals) ? payload.physicalMeals : []).slice(0, 16).map(physicalMeal).filter((meal) => meal.items.length)
      : (current.physicalMeals || []);
    const nextTargetMeals = Object.prototype.hasOwnProperty.call(payload, "targetMeals")
      ? (Array.isArray(payload.targetMeals) ? payload.targetMeals : []).slice(0, 16).map(targetMeal).filter((meal) => meal.target.kcal > 0)
      : (current.targetMeals || []);
    if (!nextPhysicalMeals.length && !nextTargetMeals.length) {
      throw error("EMPTY_DAY_FAVORITE", "El día guardado debe conservar al menos una comida.");
    }

    const physicalTotals = nextPhysicalMeals.reduce((sum, meal) => addTotals(sum, meal.totals), totals());
    const targetTotals = nextTargetMeals.reduce((sum, meal) => addTotals(sum, meal.target), totals());
    const plannedTotals = addTotals(physicalTotals, targetTotals);
    const sourceType = nextTargetMeals.length && nextPhysicalMeals.length
      ? "mixed"
      : nextTargetMeals.length
        ? "target"
        : text(current.sourceType || "manual", 30);
    const name = Object.prototype.hasOwnProperty.call(payload, "name")
      ? text(payload.name, 80)
      : text(current.name, 80);
    if (!name) throw error("VALIDATION_ERROR", "Escribí un nombre para el día guardado.");

    const updated = await this.model.updateByUser(favoriteId, userId, {
      name,
      sourceType,
      plannedTotals,
      physicalMeals: nextPhysicalMeals,
      targetMeals: nextTargetMeals,
    });
    if (!updated) throw error("DAY_FAVORITE_NOT_FOUND", "No encontramos ese día guardado.");
    return { favorite: favoritePublic(updated) };
  }

  async apply(actor, favoriteId, payload = {}) {
    const user = await this._actor(actor);
    const userId = id(user._id || user.id);
    const favorite = await this.model.getByIdForUser(favoriteId, userId);
    if (!favorite) throw error("DAY_FAVORITE_NOT_FOUND", "No encontramos ese día guardado.");
    const date = normalizeDate(payload.date);
    const target = resolveClientNutritionWeek(user).targets[dayKey(date)] || {};
    const currentTarget = totals({ kcal: target.kcal, proteina: target.p, carbs: target.c, grasas: target.g });
    const required = totals(favorite.plannedTotals);
    const difference = Math.round((currentTarget.kcal - required.kcal) * 10) / 10;
    if (difference < -0.5) {
      throw error("DAY_FAVORITE_TARGET_TOO_HIGH", `Este día necesita ${Math.round(required.kcal)} kcal y tu objetivo es ${Math.round(currentTarget.kcal)} kcal.`, {
        requiredKcal: required.kcal,
        targetKcal: currentTarget.kcal,
      });
    }

    const previousTracking = await this.tracking.getByUserDate(userId, date);
    const previousFoodDay = await this.foodLogDays.getDayByUserDate(userId, date);
    const previousConfig = Array.isArray(previousFoodDay?.mealsConfig) ? previousFoodDay.mealsConfig : [];
    const favoritePhysicalMeals = Array.isArray(favorite.physicalMeals) ? favorite.physicalMeals : [];
    const override = {
      menuId: null,
      source: "day_favorite",
      favoriteId: id(favorite._id),
      favoriteName: favorite.name,
      assignedAt: new Date(),
      extraFreeCalories: Math.max(0, difference),
      menuSnapshot: {
        id: `day-favorite-${id(favorite._id)}-${date}`,
        baseId: `day-favorite-${id(favorite._id)}`,
        name: favorite.name,
        source: "day_favorite",
        meals: favoritePhysicalMeals,
        mealsCount: favoritePhysicalMeals.length,
        totals: favoritePhysicalMeals.reduce((sum, meal) => addTotals(sum, meal.totals), totals()),
      },
    };
    const configs = (favorite.targetMeals || []).map((meal, index) => ({
      mealId: `menu_target_favorite_${id(favorite._id)}_${date}_${index + 1}`,
      tipo: meal.type,
      nombre: meal.name,
      orden: index,
      meta: meal.target,
      targetOrigin: "manual",
      targetLocked: false,
      personalTarget: true,
    }));

    try {
      await this.tracking.setDayPlanOverride({
        clientId: userId,
        date,
        dayPlanOverride: override,
        planningState: {
          completedMenuMeals: [],
          targetMealIds: [],
          suppressedMenuMealIds: [],
          generatedRemainingMeals: [],
          mealReplacements: [],
          foodReplacements: [],
        },
      });
      await this.foodLogs.updateMealsConfig({ id: userId }, { date, mealsConfig: configs });
    } catch (applyError) {
      if (previousTracking) {
        await this.tracking.setDayPlanOverride({
          clientId: userId,
          date,
          dayPlanOverride: previousTracking.dayPlanOverride || null,
          planningState: {
            completedMenuMeals: previousTracking.completedMenuMeals,
            targetMealIds: previousTracking.targetMealIds,
            suppressedMenuMealIds: previousTracking.suppressedMenuMealIds,
            generatedRemainingMeals: previousTracking.generatedRemainingMeals,
            mealReplacements: previousTracking.mealReplacements,
            foodReplacements: previousTracking.foodReplacements,
          },
        }).catch(() => null);
      } else {
        await this.tracking.deleteDayByUserDate(userId, date).catch(() => null);
      }
      await this.foodLogs.updateMealsConfig({ id: userId }, { date, mealsConfig: previousConfig }).catch(() => null);
      throw applyError;
    }

    return {
      ok: true,
      date,
      favorite: favoritePublic(favorite),
      compatibility: {
        target: currentTarget,
        required,
        extraFreeCalories: Math.max(0, difference),
        exact: Math.abs(difference) <= 0.5,
      },
    };
  }
}
