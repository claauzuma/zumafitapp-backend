import { ObjectId } from "mongodb";
import CnxMongoDB from "../DBMongo.js";

function cleanId(value = "") {
  return String(value || "").trim();
}

function toMongoIdOrString(id) {
  const value = cleanId(id);
  if (!value) return null;
  return ObjectId.isValid(value) ? new ObjectId(value) : value;
}

function toObjectId(id) {
  const value = cleanId(id);
  return ObjectId.isValid(value) ? new ObjectId(value) : null;
}

function idValues(id) {
  const value = cleanId(id);
  const values = [];
  if (value) values.push(value);
  const objectId = toObjectId(value);
  if (objectId) values.push(objectId);
  return values;
}

class ModelMongoDBFoodLogs {
  _days() {
    if (!CnxMongoDB.connection) {
      throw new Error("No hay conexion a la base de datos");
    }
    return CnxMongoDB.db.collection("food_log_days");
  }

  _logs() {
    if (!CnxMongoDB.connection) {
      throw new Error("No hay conexion a la base de datos");
    }
    return CnxMongoDB.db.collection("food_logs");
  }

  _allocations() {
    if (!CnxMongoDB.connection) {
      throw new Error("No hay conexion a la base de datos");
    }
    return CnxMongoDB.db.collection("food_log_allocations");
  }

  getDayByUserDate = async (userId, date) => {
    const values = idValues(userId);
    if (!values.length || !date) return null;
    return await this._days().findOne({
      userId: { $in: values },
      date: String(date),
    });
  };

  upsertDayBase = async ({ userId, date, objetivo = null, menuAsignadoId = null, coachId = null }) => {
    const userValue = toMongoIdOrString(userId);
    if (!userValue || !date) throw new Error("INVALID_DATE");

    const now = new Date();
    const set = {
      objetivo,
      menuAsignadoId: menuAsignadoId ? toMongoIdOrString(menuAsignadoId) : null,
      coachId: coachId ? toMongoIdOrString(coachId) : null,
      status: "active",
      updatedAt: now,
    };

    await this._days().updateOne(
      { userId: userValue, date: String(date) },
      {
        $setOnInsert: {
          userId: userValue,
          date: String(date),
          totals: { kcal: 0, proteina: 0, carbs: 0, grasas: 0 },
          mealsConfig: [],
          createdAt: now,
        },
        $set: set,
      },
      { upsert: true }
    );

    return await this.getDayByUserDate(userId, date);
  };

  updateDayMealsConfig = async (dayId, mealsConfig = []) => {
    const _id = toObjectId(dayId);
    if (!_id) throw new Error("ID_INVALIDO");

    await this._days().updateOne(
      { _id },
      {
        $set: {
          mealsConfig,
          updatedAt: new Date(),
        },
      }
    );

    return await this._days().findOne({ _id });
  };

  updateDayTotals = async (dayId, totals = {}) => {
    const _id = toObjectId(dayId);
    if (!_id) throw new Error("ID_INVALIDO");

    await this._days().updateOne(
      { _id },
      {
        $set: {
          totals,
          updatedAt: new Date(),
        },
      }
    );

    return await this._days().findOne({ _id });
  };

  listLogsByUserDate = async (userId, date) => {
    const values = idValues(userId);
    if (!values.length || !date) return [];
    return await this._logs()
      .find({
        userId: { $in: values },
        date: String(date),
      })
      .sort({ mealType: 1, createdAt: 1 })
      .toArray();
  };

  listLogsByUserDateRange = async (userId, from, to) => {
    const values = idValues(userId);
    if (!values.length || !from || !to) return [];
    return await this._logs()
      .find({
        userId: { $in: values },
        date: { $gte: String(from), $lte: String(to) },
      })
      .sort({ date: 1, createdAt: 1 })
      .toArray();
  };

  listAllocationsByUserDate = async (userId, date) => {
    const values = idValues(userId);
    if (!values.length || !date) return [];
    return await this._allocations()
      .find({ userId: { $in: values }, date: String(date) })
      .sort({ createdAt: 1 })
      .toArray();
  };

  getAllocationByRequest = async (userId, date, writeRequestId) => {
    const values = idValues(userId);
    if (!values.length || !date || !writeRequestId) return null;
    return await this._allocations().findOne({
      userId: { $in: values },
      date: String(date),
      writeRequestId: String(writeRequestId),
    });
  };

  upsertAllocation = async (doc = {}) => {
    const userId = toMongoIdOrString(doc.userId);
    const date = cleanId(doc.date);
    const writeRequestId = cleanId(doc.writeRequestId);
    if (!userId || !date || !writeRequestId) throw new Error("INVALID_ALLOCATION");
    const now = new Date();
    await this._allocations().updateOne(
      { userId, date, writeRequestId },
      {
        $setOnInsert: { userId, date, writeRequestId, createdAt: now },
        $set: {
          foodLogIds: Array.isArray(doc.foodLogIds) ? doc.foodLogIds.map(toMongoIdOrString).filter(Boolean) : [],
          total: doc.total || {},
          allocations: Array.isArray(doc.allocations) ? doc.allocations : [],
          updatedAt: now,
        },
      },
      { upsert: true }
    );
    return await this.getAllocationByRequest(userId, date, writeRequestId);
  };

  deleteAllocationByRequest = async (userId, date, writeRequestId) => {
    const values = idValues(userId);
    if (!values.length || !date || !writeRequestId) return { deletedCount: 0 };
    return await this._allocations().deleteOne({
      userId: { $in: values },
      date: String(date),
      writeRequestId: String(writeRequestId),
    });
  };

  insertLog = async (doc) => {
    const now = new Date();
    const payload = {
      ...doc,
      userId: toMongoIdOrString(doc.userId),
      foodLogDayId: toMongoIdOrString(doc.foodLogDayId),
      alimentoId: doc.alimentoId ? toMongoIdOrString(doc.alimentoId) : null,
      createdAt: doc.createdAt || now,
      updatedAt: doc.updatedAt || now,
    };

    const result = await this._logs().insertOne(payload);
    return { ...payload, _id: result.insertedId };
  };

  getLogById = async (logId) => {
    const _id = toObjectId(logId);
    if (!_id) return null;
    return await this._logs().findOne({ _id });
  };

  updateLogById = async (logId, patch = {}) => {
    const _id = toObjectId(logId);
    if (!_id) throw new Error("ID_INVALIDO");

    const updates = { ...patch };
    delete updates._id;
    delete updates.id;
    delete updates.userId;
    delete updates.foodLogDayId;
    delete updates.createdAt;
    if (updates.alimentoId !== undefined && updates.alimentoId !== null) {
      updates.alimentoId = toMongoIdOrString(updates.alimentoId);
    }

    await this._logs().updateOne(
      { _id },
      {
        $set: {
          ...updates,
          updatedAt: new Date(),
        },
      }
    );

    return await this.getLogById(logId);
  };

  deleteLogById = async (logId) => {
    const _id = toObjectId(logId);
    if (!_id) throw new Error("ID_INVALIDO");
    return await this._logs().deleteOne({ _id });
  };

  deleteLogsByMeal = async ({ userId, date, mealId, mealType = "" }) => {
    const values = idValues(userId);
    const meal = cleanId(mealId);
    if (!values.length || !date || !meal) return { deletedCount: 0 };

    const or = [{ mealId: meal }];
    if (mealType && meal === mealType) {
      or.push({
        mealType,
        $or: [
          { mealId: { $exists: false } },
          { mealId: null },
          { mealId: "" },
        ],
      });
    }

    return await this._logs().deleteMany({
      userId: { $in: values },
      date: String(date),
      $or: or,
    });
  };

  deleteLogsByMeals = async ({ userId, date, meals = [] }) => {
    const values = idValues(userId);
    const targets = (Array.isArray(meals) ? meals : [])
      .map((meal) => ({
        mealId: cleanId(meal?.mealId),
        mealType: cleanId(meal?.mealType),
      }))
      .filter((meal) => meal.mealId);
    if (!values.length || !date || !targets.length) return { deletedCount: 0 };

    const or = targets.flatMap(({ mealId, mealType }) => {
      const filters = [{ mealId }];
      if (mealType && mealId === mealType) {
        filters.push({
          mealType,
          $or: [
            { mealId: { $exists: false } },
            { mealId: null },
            { mealId: "" },
          ],
        });
      }
      return filters;
    });

    return await this._logs().deleteMany({
      userId: { $in: values },
      date: String(date),
      $or: or,
    });
  };

  async ensureIndexes() {
    const days = this._days();
    await days.createIndex({ userId: 1, date: 1 }, { unique: true });

    const logs = this._logs();
    await logs.createIndex({ userId: 1, date: -1 });
    await logs.createIndex({ userId: 1, date: -1, mealId: 1 });
    await logs.createIndex(
      { userId: 1, date: 1, writeRequestId: 1, writeItemIndex: 1 },
      {
        unique: true,
        partialFilterExpression: { writeRequestId: { $type: "string" } },
      }
    );

    const allocations = this._allocations();
    await allocations.createIndex(
      { userId: 1, date: 1, writeRequestId: 1 },
      { unique: true }
    );
  }
}

export default ModelMongoDBFoodLogs;
