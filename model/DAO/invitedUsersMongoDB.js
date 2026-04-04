import CnxMongoDB from "../DBMongo.js";
import { ObjectId } from "mongodb";

class ModelMongoDBInvitedUsers {
  _col() {
    if (!CnxMongoDB.connection) throw new Error("No hay conexión a la base de datos");
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

    const clean = {
      email: String(doc.email || "").toLowerCase().trim(),
      role: doc.role || null,
      plan: doc.plan ?? null,
      status: doc.status || "pending",
      profile: {
        nombre: String(doc?.profile?.nombre || "").trim(),
        apellido: String(doc?.profile?.apellido || "").trim(),
      },
      invitedBy: doc.invitedBy || null,
      invitedAt: doc.invitedAt || new Date(),
      acceptedAt: doc.acceptedAt || null,
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

  deleteById = async (id) => {
    const col = this._col();
    const _id = typeof id === "string" ? new ObjectId(id) : id;

    await col.deleteOne({ _id });
    return true;
  };
}

export default ModelMongoDBInvitedUsers;