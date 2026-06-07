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
      completedMenuMeals: Array.isArray(doc.completedMenuMeals) ? doc.completedMenuMeals : [],
      manualEntries: Array.isArray(doc.manualEntries) ? doc.manualEntries : [],
      generatedRemainingMeals: Array.isArray(doc.generatedRemainingMeals) ? doc.generatedRemainingMeals : [],
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

  async ensureIndexes() {
    const col = this._col();
    await col.createIndex({ clientId: 1, date: 1 }, { unique: true });
    await col.createIndex({ clientId: 1, date: -1 });
    await col.createIndex({ coachId: 1, date: -1 });
  }
}

export default ModelMongoDBClientMenuTracking;
