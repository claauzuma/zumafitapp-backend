import CnxMongoDB from "../DBMongo.js";

class ModelMongoDBImpersonationAudit {
  _col() {
    if (!CnxMongoDB.connection) {
      throw new Error("No hay conexion a la base de datos");
    }
    return CnxMongoDB.db.collection("impersonation_audit_logs");
  }

  async ensureIndexes() {
    const col = this._col();
    await col.createIndex({ sessionId: 1 });
    await col.createIndex({ adminId: 1, createdAt: -1 });
    await col.createIndex({ targetUserId: 1, createdAt: -1 });
    await col.createIndex({ action: 1, createdAt: -1 });
  }

  async record(event = {}) {
    const now = new Date();
    const doc = {
      sessionId: event.sessionId || null,
      action: event.action || "impersonation_event",
      adminId: event.adminId ? String(event.adminId) : null,
      targetUserId: event.targetUserId ? String(event.targetUserId) : null,
      targetRole: event.targetRole || null,
      startedAt: event.startedAt || null,
      endedAt: event.endedAt || null,
      createdAt: now,
    };

    await this._col().insertOne(doc);
    return doc;
  }
}

export default ModelMongoDBImpersonationAudit;
