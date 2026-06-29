import { ObjectId } from "mongodb";

import CnxMongoDB from "../DBMongo.js";

class ModelMongoDBPlanChangeRequests {
  _col() {
    if (!CnxMongoDB.connection) {
      throw new Error("No hay conexion a la base de datos");
    }
    return CnxMongoDB.db.collection("plan_change_requests");
  }

  async ensureIndexes() {
    const col = this._col();
    await col.createIndex({ userId: 1, createdAt: -1 });
    await col.createIndex({ status: 1, createdAt: -1 });
    await col.createIndex({ requestedPlan: 1, status: 1 });
    await col.createIndex({ userId: 1, requestedPlan: 1, status: 1, createdAt: -1 });
  }

  _userIdCandidates(userId) {
    const value = userId?.toString?.() || String(userId || "");
    const candidates = [userId, value].filter(Boolean);
    if (ObjectId.isValid(value)) candidates.push(new ObjectId(value));
    return [...new Map(candidates.map((candidate) => [candidate?.toString?.() || String(candidate), candidate])).values()];
  }

  async findPendingByUserAndPlan(userId, requestedPlan) {
    const col = this._col();
    await this.ensureIndexes().catch(() => null);
    return await col.findOne(
      {
        userId: { $in: this._userIdCandidates(userId) },
        requestedPlan,
        status: "pending",
      },
      { sort: { createdAt: -1 } }
    );
  }

  async findPendingByUser(userId) {
    const col = this._col();
    await this.ensureIndexes().catch(() => null);
    return await col.findOne(
      {
        userId: { $in: this._userIdCandidates(userId) },
        status: "pending",
      },
      { sort: { createdAt: -1 } }
    );
  }

  async create(doc = {}) {
    const col = this._col();
    await this.ensureIndexes().catch(() => null);
    const record = {
      ...doc,
      createdAt: doc.createdAt || new Date(),
      updatedAt: doc.updatedAt || new Date(),
    };
    const result = await col.insertOne(record);
    return { ...record, _id: result.insertedId, id: result.insertedId?.toString?.() || String(result.insertedId) };
  }
}

export default ModelMongoDBPlanChangeRequests;
