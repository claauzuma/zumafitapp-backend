import { ObjectId } from "mongodb";
import CnxMongoDB from "../DBMongo.js";

function cleanId(value = "") {
  return String(value || "").trim();
}

function toObjectId(id) {
  const value = cleanId(id);
  return ObjectId.isValid(value) ? new ObjectId(value) : null;
}

function toMongoIdOrString(id) {
  const value = cleanId(id);
  if (!value) return null;
  return ObjectId.isValid(value) ? new ObjectId(value) : value;
}

function idValues(id) {
  const value = cleanId(id);
  const values = [];
  if (value) values.push(value);
  const objectId = toObjectId(value);
  if (objectId) values.push(objectId);
  return values;
}

class ModelMongoDBClientMenuTracking {
  _col() {
    if (!CnxMongoDB.connection) {
      throw new Error("No hay conexion a la base de datos");
    }
    return CnxMongoDB.db.collection("client_menu_tracking");
  }

  getByUserDate = async (userId, date) => {
    const values = idValues(userId);
    if (!values.length || !date) return null;
    return await this._col().findOne({
      clientId: { $in: values },
      date: String(date),
    });
  };

  listByUserDateRange = async (userId, from, to) => {
    const values = idValues(userId);
    if (!values.length || !from || !to) return [];
    return await this._col()
      .find({
        clientId: { $in: values },
        date: { $gte: String(from), $lte: String(to) },
      })
      .sort({ date: 1 })
      .toArray();
  };

  setDayPlanOverride = async ({ clientId: rawClientId, date, dayPlanOverride = null, planningState } = {}) => {
    const clientId = toMongoIdOrString(rawClientId);
    const normalizedDate = String(date || "").trim();
    if (!clientId || !normalizedDate) throw new Error("INVALID_DATE");
    const now = new Date();
    const set = { dayPlanOverride, updatedAt: now };
    if (planningState && typeof planningState === "object") {
      set.completedMenuMeals = Array.isArray(planningState.completedMenuMeals) ? planningState.completedMenuMeals : [];
      set.targetMealIds = Array.isArray(planningState.targetMealIds) ? planningState.targetMealIds : [];
      set.suppressedMenuMealIds = Array.isArray(planningState.suppressedMenuMealIds) ? planningState.suppressedMenuMealIds : [];
      if (Array.isArray(planningState.manualEntries)) set.manualEntries = planningState.manualEntries;
      set.generatedRemainingMeals = Array.isArray(planningState.generatedRemainingMeals) ? planningState.generatedRemainingMeals : [];
      set.mealReplacements = Array.isArray(planningState.mealReplacements) ? planningState.mealReplacements : [];
      set.foodReplacements = Array.isArray(planningState.foodReplacements) ? planningState.foodReplacements : [];
      if (planningState.consumedTotals !== undefined) set.consumedTotals = planningState.consumedTotals;
      if (planningState.remainingTotals !== undefined) set.remainingTotals = planningState.remainingTotals;
      if (planningState.nutrition !== undefined) set.nutrition = planningState.nutrition;
    }
    await this._col().updateOne(
      { clientId, date: normalizedDate },
      {
        $setOnInsert: { clientId, date: normalizedDate, createdAt: now },
        $set: set,
      },
      { upsert: true }
    );
    return await this.getByUserDate(clientId, normalizedDate);
  };

  deleteDayByUserDate = async (userId, date) => {
    const values = idValues(userId);
    if (!values.length || !date) return false;
    const result = await this._col().deleteOne({ clientId: { $in: values }, date: String(date) });
    return result.deletedCount > 0;
  };

  upsertDay = async (doc = {}) => {
    const clientId = toMongoIdOrString(doc.clientId);
    const date = String(doc.date || "").trim();
    if (!clientId || !date) throw new Error("INVALID_DATE");

    const now = new Date();
    const payload = {
      coachId: doc.coachId ? toMongoIdOrString(doc.coachId) : null,
      dayKey: String(doc.dayKey || ""),
      weekStart: doc.weekStart ? String(doc.weekStart) : null,
      weekEnd: doc.weekEnd ? String(doc.weekEnd) : null,
      menuId: doc.menuId ? toMongoIdOrString(doc.menuId) : null,
      menuSnapshotId: doc.menuSnapshotId ? String(doc.menuSnapshotId) : null,
      menuSnapshotSummary: doc.menuSnapshotSummary || null,
      target: doc.target || null,
      menuTotals: doc.menuTotals || null,


 completedMenuMeals: Array.isArray(doc.completedMenuMeals)
  ? doc.completedMenuMeals
  : [],

targetMealIds: Array.isArray(doc.targetMealIds)
  ? [...new Set(
      doc.targetMealIds
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    )]
  : [],

suppressedMenuMealIds: Array.isArray(doc.suppressedMenuMealIds)
  ? [...new Set(
      doc.suppressedMenuMealIds
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    )]
  : [],

manualEntries: Array.isArray(doc.manualEntries)
  ? doc.manualEntries
  : [],


      generatedRemainingMeals: Array.isArray(doc.generatedRemainingMeals) ? doc.generatedRemainingMeals : [],
      mealReplacements: Array.isArray(doc.mealReplacements) ? doc.mealReplacements : [],
      foodReplacements: Array.isArray(doc.foodReplacements) ? doc.foodReplacements : [],
      consumedTotals: doc.consumedTotals || null,
      remainingTotals: doc.remainingTotals || null,
      nutrition: doc.nutrition || {},
      updatedAt: now,
    };

    await this._col().updateOne(
      { clientId, date },
      {
        $setOnInsert: {
          clientId,
          date,
          createdAt: now,
        },
        $set: payload,
      },
      { upsert: true }
    );

    return await this.getByUserDate(clientId, date);
  };

  setDayCompletionState = async (doc = {}) => {
    const clientId = toMongoIdOrString(doc.clientId);
    const date = String(doc.date || "").trim();
    if (!clientId || !date) throw new Error("INVALID_DATE");

    const now = new Date();
    const payload = {
      dayCompletionMode: doc.dayCompletionMode || "menu",
      manualCompletion: doc.manualCompletion || null,
      updatedAt: now,
    };

    [
      "coachId",
      "dayKey",
      "weekStart",
      "weekEnd",
      "menuId",
      "menuSnapshotId",
      "menuSnapshotSummary",
      "target",
      "menuTotals",
    ].forEach((key) => {
      if (doc[key] !== undefined) payload[key] = doc[key];
    });

    if (payload.coachId) payload.coachId = toMongoIdOrString(payload.coachId);
    if (payload.menuId) payload.menuId = toMongoIdOrString(payload.menuId);

    await this._col().updateOne(
      { clientId, date },
      {
        $setOnInsert: {
          clientId,
          date,

completedMenuMeals: [],
targetMealIds: [],
suppressedMenuMealIds: [],
manualEntries: [],


          generatedRemainingMeals: [],
          mealReplacements: [],
          foodReplacements: [],
          consumedTotals: { kcal: 0, proteina: 0, carbs: 0, grasas: 0 },
          remainingTotals: null,
          nutrition: {},
          createdAt: now,
        },
        $set: payload,
      },
      { upsert: true }
    );

    return await this.getByUserDate(clientId, date);
  };

  async ensureIndexes() {
    const col = this._col();
    await col.createIndex({ clientId: 1, date: 1 }, { unique: true });
    await col.createIndex({ clientId: 1, date: -1 });
    await col.createIndex({ coachId: 1, date: -1 });
  }
}

export default ModelMongoDBClientMenuTracking;
