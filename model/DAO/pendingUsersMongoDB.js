// model/DAO/pendingUsersMongoDB.js
import CnxMongoDB from "../DBMongo.js";

class ModelMongoDBPendingUsers {
  _col() {
    if (!CnxMongoDB.connection) throw new Error("No hay conexión a la base de datos");
    return CnxMongoDB.db.collection("pending_users");
  }

  async ensureIndexes() {
    const col = this._col();

    // Email único
    await col.createIndex({ email: 1 }, { unique: true });

    // TTL: se borra cuando expiresAt queda en el pasado
    await col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  }

  create = async (doc) => {
    const col = this._col();

    const clean = {
      ...doc,
      email: String(doc.email).toLowerCase().trim(),
    };

    const r = await col.insertOne(clean);
    return { ...clean, _id: r.insertedId };
  };

  findByEmail = async (email) => {
    if (!email) return null;
    return await this._col().findOne({ email: String(email).toLowerCase().trim() });
  };

  updateByEmail = async (email, updates) => {
    const col = this._col();
    const e = String(email).toLowerCase().trim();

    await col.updateOne({ email: e }, { $set: { ...updates, updatedAt: new Date() } });
    return await col.findOne({ email: e });
  };

  deleteByEmail = async (email) => {
    if (!email) return;
    await this._col().deleteOne({ email: String(email).toLowerCase().trim() });
  };
}

export default ModelMongoDBPendingUsers;
