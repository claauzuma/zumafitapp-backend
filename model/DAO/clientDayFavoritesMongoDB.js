import { ObjectId } from "mongodb";
import CnxMongoDB from "../DBMongo.js";

function cleanId(value = "") {
  return String(value || "").trim();
}

function mongoId(value = "") {
  const id = cleanId(value);
  if (!id) return null;
  return ObjectId.isValid(id) ? new ObjectId(id) : id;
}

function idValues(value = "") {
  const id = cleanId(value);
  if (!id) return [];
  return ObjectId.isValid(id) ? [id, new ObjectId(id)] : [id];
}

export default class ModelMongoDBClientDayFavorites {
  _col() {
    if (!CnxMongoDB.connection) throw new Error("No hay conexion a la base de datos");
    return CnxMongoDB.db.collection("client_day_favorites");
  }

  async listByUser(userId) {
    return await this._col().find({
      ownerId: { $in: idValues(userId) },
      deletedAt: null,
    }).sort({ updatedAt: -1 }).toArray();
  }

  async countByUser(userId) {
    return await this._col().countDocuments({
      ownerId: { $in: idValues(userId) },
      deletedAt: null,
    });
  }

  async getByIdForUser(id, userId) {
    const _id = ObjectId.isValid(cleanId(id)) ? new ObjectId(cleanId(id)) : null;
    if (!_id) return null;
    return await this._col().findOne({
      _id,
      ownerId: { $in: idValues(userId) },
      deletedAt: null,
    });
  }

  async create(doc = {}) {
    const now = new Date();
    const record = {
      ...doc,
      ownerId: mongoId(doc.ownerId),
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const result = await this._col().insertOne(record);
    return { ...record, _id: result.insertedId };
  }

  async updateByUser(id, userId, patch = {}) {
    const _id = ObjectId.isValid(cleanId(id)) ? new ObjectId(cleanId(id)) : null;
    if (!_id) return null;
    const result = await this._col().findOneAndUpdate({
      _id,
      ownerId: { $in: idValues(userId) },
      deletedAt: null,
    }, {
      $set: { ...patch, updatedAt: new Date() },
    }, { returnDocument: "after" });
    if (result && Object.prototype.hasOwnProperty.call(result, "value")) return result.value || null;
    return result || null;
  }

  async softDelete(id, userId) {
    const _id = ObjectId.isValid(cleanId(id)) ? new ObjectId(cleanId(id)) : null;
    if (!_id) return false;
    const result = await this._col().updateOne({
      _id,
      ownerId: { $in: idValues(userId) },
      deletedAt: null,
    }, { $set: { deletedAt: new Date(), updatedAt: new Date() } });
    return result.modifiedCount > 0;
  }

  async ensureIndexes() {
    const col = this._col();
    await col.createIndex({ ownerId: 1, deletedAt: 1, updatedAt: -1 });
  }
}
