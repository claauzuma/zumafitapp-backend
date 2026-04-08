import CnxMongoDB from "../DBMongo.js";
import { ObjectId } from "mongodb";

class ModelMongoDBInvitedUsers {
  _col() {
    if (!CnxMongoDB.connection) {
      throw new Error("No hay conexión a la base de datos");
    }
    return CnxMongoDB.db.collection("invited_users");
  }

  async ensureIndexes() {
    const col = this._col();
    await col.createIndex({ email: 1 });
    await col.createIndex({ status: 1 });
    await col.createIndex(
      { email: 1, status: 1 },
      {
        unique: true,
        partialFilterExpression: { status: "pending" },
      }
    );
    await col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  }

  create = async (doc) => {
    const col = this._col();

    const training = !!doc?.coachProfile?.specialties?.training;
    const nutrition = !!doc?.coachProfile?.specialties?.nutrition;

    const clean = {
      email: String(doc.email || "").toLowerCase().trim(),
      role: doc.role || null,
      plan: doc.plan ?? null,
      status: doc.status || "pending",
      profile: {
        nombre: String(doc?.profile?.nombre || "").trim(),
        apellido: String(doc?.profile?.apellido || "").trim(),
      },
      coachProfile:
        doc.role === "coach"
          ? {
              specialties: {
                training,
                nutrition,
              },
            }
          : null,
      invitedBy: doc.invitedBy || null,
      invitedAt: doc.invitedAt || new Date(),
      acceptedAt: doc.acceptedAt || null,
      cancelledAt: doc.cancelledAt || null,
      expiresAt: doc.expiresAt || null,
      createdAt: doc.createdAt || new Date(),
      updatedAt: doc.updatedAt || new Date(),
    };

    const r = await col.insertOne(clean);
    return { ...clean, _id: r.insertedId };
  };

  findPendingByEmail = async (email) => {
    if (!email) return null;
    return await this._col().findOne({
      email: String(email).toLowerCase().trim(),
      status: "pending",
    });
  };

  findByEmail = async (email) => {
    if (!email) return [];
    return await this._col()
      .find({ email: String(email).toLowerCase().trim() })
      .sort({ createdAt: -1 })
      .toArray();
  };

  // ✅ nuevo
  getById = async (id) => {
    try {
      if (!id) return null;
      const _id = typeof id === "string" ? new ObjectId(id) : id;
      return await this._col().findOne({ _id });
    } catch {
      return null;
    }
  };

  // ✅ nuevo
  updateById = async (id, patch = {}) => {
    const col = this._col();
    let _id;

    try {
      _id = typeof id === "string" ? new ObjectId(id) : id;
    } catch {
      return null;
    }

    await col.updateOne(
      { _id },
      {
        $set: {
          ...patch,
          updatedAt: new Date(),
        },
      }
    );

    return await col.findOne({ _id });
  };

  deleteById = async (id) => {
    const col = this._col();
    let _id;

    try {
      _id = typeof id === "string" ? new ObjectId(id) : id;
    } catch {
      return false;
    }

    const r = await col.deleteOne({ _id });
    return r.deletedCount > 0;
  };

  listAdmin = async ({
    search = "",
    status = "todos",
    role = "todos",
    limit = 100,
    skip = 0,
  } = {}) => {
    const col = this._col();
    const query = {};

    if (search && String(search).trim()) {
      const s = String(search).trim();
      query.$or = [
        { email: { $regex: s, $options: "i" } },
        { "profile.nombre": { $regex: s, $options: "i" } },
        { "profile.apellido": { $regex: s, $options: "i" } },
      ];
    }

    if (status && status !== "todos") {
      query.status = String(status).toLowerCase().trim();
    }

    if (role && role !== "todos") {
      query.role = String(role).toLowerCase().trim();
    }

    const items = await col
      .find(query)
      .sort({ invitedAt: -1, createdAt: -1 })
      .skip(Math.max(Number(skip) || 0, 0))
      .limit(Math.min(Number(limit) || 100, 500))
      .toArray();

    const total = await col.countDocuments(query);

    return { items, total };
  };
}

export default ModelMongoDBInvitedUsers;
