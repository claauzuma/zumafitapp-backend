import { ObjectId } from "mongodb";
import CnxMongoDB from "../DBMongo.js";

function toObjectIdOrValue(value) {
  const raw = value?.toString?.() || String(value || "");
  return raw && ObjectId.isValid(raw) ? new ObjectId(raw) : raw;
}

function normalizePaging({ limit = 50, skip = 0 } = {}) {
  return {
    limit: Math.min(Math.max(Number(limit) || 50, 1), 200),
    skip: Math.max(Number(skip) || 0, 0),
  };
}

class ModelMongoDBProfessionalApplications {
  _col() {
    if (!CnxMongoDB.connection) throw new Error("No hay conexion a la base de datos");
    return CnxMongoDB.db.collection("professional_applications");
  }

  async ensureIndexes() {
    const col = this._col();
    await col.createIndex({ email: 1, status: 1 });
    await col.createIndex({ userId: 1, createdAt: -1 });
    await col.createIndex({ status: 1, createdAt: -1 });
    await col.createIndex({ "requestedScopes.training": 1, "requestedScopes.nutrition": 1 });
  }

  async create(doc = {}) {
    const col = this._col();
    await this.ensureIndexes().catch(() => null);
    const now = new Date();
    const record = {
      ...doc,
      createdAt: doc.createdAt || now,
      updatedAt: doc.updatedAt || now,
    };
    const result = await col.insertOne(record);
    return { ...record, _id: result.insertedId };
  }

  async list({ status = "", search = "", limit = 50, skip = 0 } = {}) {
    const col = this._col();
    const paging = normalizePaging({ limit, skip });
    const query = {};
    const normalizedStatus = String(status || "").trim();
    if (normalizedStatus && normalizedStatus !== "todos") query.status = normalizedStatus;

    const normalizedSearch = String(search || "").trim();
    if (normalizedSearch) {
      const rx = new RegExp(normalizedSearch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      query.$or = [
        { email: rx },
        { "personal.nombre": rx },
        { "personal.apellido": rx },
        { "professional.tipo": rx },
      ];
    }

    const [items, total] = await Promise.all([
      col.find(query).sort({ createdAt: -1 }).skip(paging.skip).limit(paging.limit).toArray(),
      col.countDocuments(query),
    ]);

    return { items, total, limit: paging.limit, skip: paging.skip };
  }

  async getById(id) {
    const value = toObjectIdOrValue(id);
    return await this._col().findOne({ _id: value });
  }

  async getLatestByUserId(userId) {
    const values = [toObjectIdOrValue(userId), String(userId)];
    return await this._col().findOne({ userId: { $in: values } }, { sort: { createdAt: -1 } });
  }

  async updateById(id, patch = {}) {
    const value = toObjectIdOrValue(id);
    await this._col().updateOne({ _id: value }, { $set: { ...patch, updatedAt: new Date() } });
    return await this.getById(id);
  }
}

export default ModelMongoDBProfessionalApplications;
