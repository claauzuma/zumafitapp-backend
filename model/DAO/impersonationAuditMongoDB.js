import CnxMongoDB from "../DBMongo.js";
import { impersonationAuditExpiresAt } from "../../utils/dataRetention.js";

class ModelMongoDBImpersonationAudit {
  _col() {
    if (!CnxMongoDB.connection) {
      throw new Error("No hay conexion a la base de datos");
    }
    return CnxMongoDB.db.collection("impersonation_audit_logs");
  }

  async ensureIndexes() {
    const col = this._col();
    await col.createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0, name: "impersonation_audit_logs_ttl" }
    );
  }

  async record(event = {}) {
    const now = new Date();
    const doc = {
      sessionId: event.sessionId || null,
      action: event.action || "impersonation_event",
      adminId: event.adminId ? String(event.adminId) : null,
      actorType: event.actorType || (event.adminId ? "admin" : null),
      actorId: event.actorId ? String(event.actorId) : (event.adminId ? String(event.adminId) : null),
      targetUserId: event.targetUserId ? String(event.targetUserId) : null,
      targetRole: event.targetRole || null,
      startedAt: event.startedAt || null,
      endedAt: event.endedAt || null,
      createdAt: now,
      expiresAt: event.expiresAt || impersonationAuditExpiresAt(now),
    };

    await this._col().insertOne(doc);
    return doc;
  }
}

export default ModelMongoDBImpersonationAudit;
