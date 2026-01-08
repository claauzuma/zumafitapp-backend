// model/DAO/passwordResetMongoDB.js
import CnxMongoDB from "../DBMongo.js"; // ajustá la ruta si tu conexión está en otro lado
import crypto from "crypto";

class ModelMongoDBPasswordResets {
  _col() {
    if (!CnxMongoDB?.connection) {
      throw new Error("No hay conexión a MongoDB");
    }
    return CnxMongoDB.db.collection("password_reset_tokens");
  }

  async ensureIndexes() {
    const col = this._col();

    // 1) Un token activo por email (si querés permitir varios, sacá unique)
    await col.createIndex({ email: 1 }, { unique: true });

    // 2) TTL: borra automáticamente cuando expiresAt < now
    await col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

    // 3) Para rate limit por lastSentAt (opcional)
    await col.createIndex({ lastSentAt: 1 });

    // 4) (opcional) para búsquedas por requestId
    await col.createIndex({ requestId: 1 });
  }

  async findByEmail(email) {
    return await this._col().findOne({ email });
  }

  async upsertByEmail(email, doc) {
    await this._col().updateOne(
      { email },
      { $set: { ...doc, email, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    );
    return await this.findByEmail(email);
  }

  async deleteByEmail(email) {
    await this._col().deleteOne({ email });
  }

  _newRequestId() {
    return crypto.randomBytes(16).toString("hex");
  }
}

export default ModelMongoDBPasswordResets;
