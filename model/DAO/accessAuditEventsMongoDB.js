import { ObjectId } from "mongodb";
import CnxMongoDB from "../DBMongo.js";
import { accessAuditExpiresAt } from "../../utils/dataRetention.js";

export const ACCESS_AUDIT_EVENTS_COLLECTION = "access_audit_events";

function cleanString(value = "", max = 1000) {
  if (value === null || value === undefined) return "";
  return String(value).trim().slice(0, max);
}

function idToString(id) {
  return id?.toString?.() || String(id || "");
}

function toMongoIdOrString(id) {
  const value = cleanString(id, 120);
  if (!value) return null;
  return ObjectId.isValid(value) ? new ObjectId(value) : value;
}

function safeObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out = {};
  Object.entries(value).forEach(([key, item]) => {
    if (["token", "jwt", "password", "passwordHash", "access_token", "refresh_token"].includes(String(key).toLowerCase())) return;
    out[key] = item;
  });
  return out;
}

class ModelMongoDBAccessAuditEvents {
  _col() {
    if (!CnxMongoDB.connection) {
      throw new Error("No hay conexion a la base de datos");
    }
    return CnxMongoDB.db.collection(ACCESS_AUDIT_EVENTS_COLLECTION);
  }

  async create(event = {}) {
    const now = new Date();
    const createdAt = event.createdAt || now;
    const payload = {
      subjectType: cleanString(event.subjectType, 80) || "client",
      subjectId: toMongoIdOrString(event.subjectId),
      actorType: cleanString(event.actorType, 80) || "system",
      actorId: toMongoIdOrString(event.actorId),
      event: cleanString(event.event, 120),
      dedupeKey: cleanString(event.dedupeKey, 220) || null,
      notificationVisible: event.notificationVisible === true,
      notificationImmediate: event.notificationImmediate === true,
      includeInWeeklyDigest: event.includeInWeeklyDigest === true,
      readAt: event.readAt || null,
      previousValue: safeObject(event.previousValue),
      nextValue: safeObject(event.nextValue),
      reason: cleanString(event.reason, 500),
      metadata: safeObject(event.metadata),
      createdAt,
      expiresAt: event.expiresAt || accessAuditExpiresAt(event.event, createdAt),
    };

    try {
      const result = await this._col().insertOne(payload);
      return { ...payload, _id: result.insertedId };
    } catch (error) {
      if (payload.dedupeKey && Number(error?.code) === 11000) {
        return await this._col().findOne({ dedupeKey: payload.dedupeKey });
      }
      throw error;
    }
  }

  async ensureIndexes() {
    const col = this._col();
    await col.createIndex({ subjectType: 1, subjectId: 1, createdAt: -1 });
    await col.createIndex({ event: 1, createdAt: -1 });
    await col.createIndex({ actorType: 1, actorId: 1, createdAt: -1 });
    await col.createIndex(
      { dedupeKey: 1 },
      {
        unique: true,
        partialFilterExpression: { dedupeKey: { $type: "string" } },
        name: "access_audit_events_dedupe",
      }
    );
    await col.createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0, name: "access_audit_events_ttl" }
    );
  }

  async list({ subjectType = "", subjectId = "", actorType = "", actorId = "", event = "", limit = 50, skip = 0 } = {}) {
    const query = {};
    if (subjectType) query.subjectType = cleanString(subjectType, 80);
    if (actorType) query.actorType = cleanString(actorType, 80);
    if (event) query.event = cleanString(event, 120);
    if (subjectId) query.subjectId = toMongoIdOrString(subjectId);
    if (actorId) query.actorId = toMongoIdOrString(actorId);
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const safeSkip = Math.max(Number(skip) || 0, 0);

    const [items, total] = await Promise.all([
      this._col().find(query).sort({ createdAt: -1 }).skip(safeSkip).limit(safeLimit).toArray(),
      this._col().countDocuments(query),
    ]);

    return { items, total, limit: safeLimit, skip: safeSkip };
  }

  async markRead(id, readAt = new Date()) {
    const _id = ObjectId.isValid(cleanString(id, 120)) ? new ObjectId(cleanString(id, 120)) : null;
    if (!_id) throw new Error("ID_INVALIDO");
    await this._col().updateOne({ _id }, { $set: { readAt } });
    return await this._col().findOne({ _id });
  }
}

export { idToString };
export default ModelMongoDBAccessAuditEvents;
