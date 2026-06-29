import CnxMongoDB from "../DBMongo.js";

function idToString(id) {
  return id?.toString?.() || String(id || "").trim();
}

class ModelMongoDBCoachClientCapacity {
  _col() {
    if (!CnxMongoDB.connection) {
      throw new Error("No hay conexion a la base de datos");
    }
    return CnxMongoDB.db.collection("coach_client_capacity");
  }

  async ensureIndexes() {
    const col = this._col();
    await col.createIndex({ coachId: 1 }, { unique: true, name: "coach_client_capacity_coach_unique" });
    await col.createIndex({ "reservations.invitationId": 1 }, { name: "coach_client_capacity_reservation_invitation" });
    await col.createIndex({ "reservations.clientId": 1 }, { name: "coach_client_capacity_reservation_client" });
  }

  async syncFromActiveCount(coachId, { limit = 0, activeCount = 0, now = new Date() } = {}) {
    const coachIdString = idToString(coachId);
    if (!coachIdString) return null;

    await this._col().updateOne(
      { coachId: coachIdString },
      {
        $setOnInsert: {
          coachId: coachIdString,
          reservations: [],
          createdAt: now,
        },
        $set: {
          limit: Math.max(0, Number(limit) || 0),
          used: Math.max(0, Number(activeCount) || 0),
          syncedFromActiveCountAt: now,
          updatedAt: now,
        },
      },
      { upsert: true }
    );

    return this.getByCoachId(coachIdString);
  }

  async getByCoachId(coachId) {
    const coachIdString = idToString(coachId);
    if (!coachIdString) return null;
    return this._col().findOne({ coachId: coachIdString });
  }

  async reserveSlot({ coachId, invitationId, clientId, limit, activeCount = null, now = new Date() } = {}) {
    const coachIdString = idToString(coachId);
    const invitationIdString = idToString(invitationId);
    const clientIdString = idToString(clientId);
    const normalizedLimit = Math.max(0, Number(limit) || 0);

    if (!coachIdString) throw new Error("COACH_ID_REQUIRED");
    if (!invitationIdString) throw new Error("INVITATION_ID_REQUIRED");
    if (!clientIdString) throw new Error("CLIENT_ID_REQUIRED");
    if (normalizedLimit <= 0) return { reserved: true, unlimited: true, used: null, limit: normalizedLimit };

    const active = activeCount === null || activeCount === undefined
      ? 0
      : Math.max(0, Number(activeCount) || 0);

    await this._col().updateOne(
      { coachId: coachIdString },
      {
        $setOnInsert: {
          coachId: coachIdString,
          used: active,
          reservations: [],
          createdAt: now,
        },
        $set: {
          limit: normalizedLimit,
          updatedAt: now,
        },
      },
      { upsert: true }
    );

    const current = await this.getByCoachId(coachIdString);
    const reservations = Array.isArray(current?.reservations) ? current.reservations : [];
    const alreadyReserved = reservations.find((item) =>
      String(item?.invitationId || "") === invitationIdString ||
      String(item?.clientId || "") === clientIdString
    );

    if (alreadyReserved) {
      return {
        reserved: true,
        alreadyReserved: true,
        used: Number(current?.used || 0),
        limit: normalizedLimit,
      };
    }

    const result = await this._col().findOneAndUpdate(
      {
        coachId: coachIdString,
        $expr: { $lt: ["$used", "$limit"] },
        "reservations.invitationId": { $ne: invitationIdString },
        "reservations.clientId": { $ne: clientIdString },
      },
      {
        $inc: { used: 1 },
        $push: {
          reservations: {
            invitationId: invitationIdString,
            clientId: clientIdString,
            reservedAt: now,
          },
        },
        $set: {
          limit: normalizedLimit,
          updatedAt: now,
        },
      },
      { returnDocument: "after" }
    );

    const doc = result?.value || result;
    if (!doc) {
      const latest = await this.getByCoachId(coachIdString);
      return {
        reserved: false,
        used: Number(latest?.used || 0),
        limit: Number(latest?.limit || normalizedLimit),
      };
    }

    return {
      reserved: true,
      used: Number(doc.used || 0),
      limit: Number(doc.limit || normalizedLimit),
    };
  }

  async releaseSlot({ coachId, invitationId = null, clientId = null, now = new Date() } = {}) {
    const coachIdString = idToString(coachId);
    if (!coachIdString) return { released: false, used: null };

    const predicates = [];
    const invitationIdString = idToString(invitationId);
    const clientIdString = idToString(clientId);
    if (invitationIdString) predicates.push({ "reservations.invitationId": invitationIdString });
    if (clientIdString) predicates.push({ "reservations.clientId": clientIdString });
    if (!predicates.length) return { released: false, used: null };

    const result = await this._col().findOneAndUpdate(
      {
        coachId: coachIdString,
        used: { $gt: 0 },
        $or: predicates,
      },
      {
        $inc: { used: -1 },
        $pull: {
          reservations: {
            $or: [
              ...(invitationIdString ? [{ invitationId: invitationIdString }] : []),
              ...(clientIdString ? [{ clientId: clientIdString }] : []),
            ],
          },
        },
        $set: { updatedAt: now },
      },
      { returnDocument: "after" }
    );

    const doc = result?.value || result;
    if (!doc) return { released: false, used: null };

    return {
      released: true,
      used: Math.max(0, Number(doc.used || 0)),
      limit: Number(doc.limit || 0),
    };
  }
}

export default ModelMongoDBCoachClientCapacity;
