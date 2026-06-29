import { ObjectId } from "mongodb";
import CnxMongoDB from "../DBMongo.js";

function toObjectIdOrValue(value) {
  const raw = value?.toString?.() || String(value || "");
  return raw && ObjectId.isValid(raw) ? new ObjectId(raw) : raw;
}

function coachValues(coachId) {
  const raw = coachId?.toString?.() || String(coachId || "");
  const values = [raw];
  if (ObjectId.isValid(raw)) values.push(new ObjectId(raw));
  return values;
}

function paging({ limit = 50, skip = 0 } = {}) {
  return {
    limit: Math.min(Math.max(Number(limit) || 50, 1), 200),
    skip: Math.max(Number(skip) || 0, 0),
  };
}

class ModelMongoDBCoachSubscriptionRequests {
  _col() {
    if (!CnxMongoDB.connection) throw new Error("No hay conexion a la base de datos");
    return CnxMongoDB.db.collection("coach_subscription_requests");
  }

  async ensureIndexes() {
    const col = this._col();
    await col.createIndex({ coachId: 1, createdAt: -1 });
    await col.createIndex({ status: 1, createdAt: -1 });
    await col.createIndex({ requestedPlan: 1, status: 1 });
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

  async list({ status = "", coachId = "", limit = 50, skip = 0 } = {}) {
    const col = this._col();
    const page = paging({ limit, skip });
    const query = {};
    const normalizedStatus = String(status || "").trim();
    if (normalizedStatus && normalizedStatus !== "todos") query.status = normalizedStatus;
    if (coachId) query.coachId = { $in: coachValues(coachId) };

    const [items, total] = await Promise.all([
      col.find(query).sort({ createdAt: -1 }).skip(page.skip).limit(page.limit).toArray(),
      col.countDocuments(query),
    ]);

    return { items, total, limit: page.limit, skip: page.skip };
  }

  async getById(id) {
    return await this._col().findOne({ _id: toObjectIdOrValue(id) });
  }

  async getLatestByCoachId(coachId) {
    return await this._col().findOne(
      { coachId: { $in: coachValues(coachId) } },
      { sort: { createdAt: -1 } }
    );
  }

  async getOpenByCoachId(coachId) {
    return await this._col().findOne(
      { coachId: { $in: coachValues(coachId) }, status: { $in: ["pending", "under_review"] } },
      { sort: { createdAt: -1 } }
    );
  }

  async updateById(id, patch = {}) {
    await this._col().updateOne({ _id: toObjectIdOrValue(id) }, { $set: { ...patch, updatedAt: new Date() } });
    return await this.getById(id);
  }
}

export default ModelMongoDBCoachSubscriptionRequests;
