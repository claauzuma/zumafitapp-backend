import { ObjectId } from "mongodb";
import CnxMongoDB from "../DBMongo.js";

function idValues(id) {
  const value = id?.toString?.() || String(id || "").trim();
  if (!value) return [];
  const values = [value];
  if (ObjectId.isValid(value)) values.push(new ObjectId(value));
  return values;
}

function storedId(id) {
  const value = id?.toString?.() || String(id || "").trim();
  if (!value) return null;
  return ObjectId.isValid(value) ? new ObjectId(value) : value;
}

class ModelMongoDBClientCoachBlocks {
  _col() {
    if (!CnxMongoDB.connection) {
      throw new Error("No hay conexion a la base de datos");
    }
    return CnxMongoDB.db.collection("client_coach_blocks");
  }

  async ensureIndexes() {
    const col = this._col();
    await col.createIndex(
      { clientId: 1, coachId: 1 },
      { name: "client_coach_blocks_client_coach_unique", unique: true }
    );
    await col.createIndex(
      { clientId: 1, isActive: 1, blockedAt: -1 },
      { name: "client_coach_blocks_client_active_blockedAt" }
    );
    await col.createIndex(
      { coachId: 1, isActive: 1, blockedAt: -1 },
      { name: "client_coach_blocks_coach_active_blockedAt" }
    );
  }

  async isBlocked({ clientId, coachId } = {}) {
    const clientValues = idValues(clientId);
    const coachValues = idValues(coachId);
    if (!clientValues.length || !coachValues.length) return false;

    const doc = await this._col().findOne({
      clientId: { $in: clientValues },
      coachId: { $in: coachValues },
      isActive: true,
    });

    return !!doc;
  }

  async block({ clientId, coachId, invitationId = null, reason = "", reportedAsSpam = false, reportReason = "", comment = "", now = new Date() } = {}) {
    const client = storedId(clientId);
    const coach = storedId(coachId);
    if (!client || !coach) throw new Error("PAYLOAD_INVALIDO");

    await this._col().updateOne(
      { clientId: client, coachId: coach },
      {
        $set: {
          clientId: client,
          coachId: coach,
          invitationId: invitationId ? storedId(invitationId) : null,
          reason: String(reason || "").trim().slice(0, 160),
          reportedAsSpam: !!reportedAsSpam,
          reportReason: String(reportReason || "").trim().slice(0, 120),
          comment: String(comment || "").trim().slice(0, 500),
          isActive: true,
          blockedAt: now,
          unblockedAt: null,
          updatedAt: now,
        },
        $setOnInsert: {
          createdAt: now,
        },
      },
      { upsert: true }
    );

    return await this._col().findOne({ clientId: client, coachId: coach });
  }

  async unblock({ clientId, coachId, now = new Date() } = {}) {
    const clientValues = idValues(clientId);
    const coachValues = idValues(coachId);
    if (!clientValues.length || !coachValues.length) return null;

    await this._col().updateOne(
      {
        clientId: { $in: clientValues },
        coachId: { $in: coachValues },
        isActive: true,
      },
      {
        $set: {
          isActive: false,
          unblockedAt: now,
          updatedAt: now,
        },
      }
    );

    return await this._col().findOne({
      clientId: { $in: clientValues },
      coachId: { $in: coachValues },
    });
  }

  async listByClient(clientId) {
    const clientValues = idValues(clientId);
    if (!clientValues.length) return [];

    return await this._col()
      .find({
        clientId: { $in: clientValues },
        isActive: true,
      })
      .sort({ blockedAt: -1, createdAt: -1 })
      .toArray();
  }
}

export default ModelMongoDBClientCoachBlocks;
