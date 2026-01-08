// model/DAO/usuariosMongoDB.js
import { ObjectId } from "mongodb";
import CnxMongoDB from "../DBMongo.js";

class ModelMongoDBUsuarios {
  _col() {
    if (!CnxMongoDB.connection) {
      throw new Error("No hay conexión a la base de datos");
    }
    return CnxMongoDB.db.collection("usuarios");
  }

  // ----- Lecturas -----

  obtenerUsuarios = async () => {
    return await this._col().find({}).toArray();
  };

  obtenerPorId = async (id) => {
    if (!id) return null;
    return await this._col().findOne({ _id: new ObjectId(id) });
  };

  obtenerPorEmail = async (email) => {
    if (!email) return null;
    return await this._col().findOne({ email: String(email).toLowerCase().trim() });
  };

  obtenerPorRol = async (role) => {
    return await this._col().find({ role }).toArray();
  };

  // ----- Escrituras -----

  registrarUsuario = async (usuario) => {
    const col = this._col();

    const doc = {
      ...usuario,
      email: usuario.email?.toLowerCase().trim(),
    };

    const r = await col.insertOne(doc);
    return { ...doc, _id: r.insertedId };
  };

  crearUsuario = async (usuario) => {
    return await this.registrarUsuario(usuario);
  };

  updateById = async (id, updates) => {
    const col = this._col();
    const _id = new ObjectId(id);

    if (updates?._id) delete updates._id;

    await col.updateOne({ _id }, { $set: { ...updates, updatedAt: new Date() } });
    return await col.findOne({ _id });
  };

  actualizarPerfil = async (id, updates) => {
    return await this.updateById(id, updates);
  };

  borrarUsuario = async (id) => {
    const col = this._col();
    const _id = new ObjectId(id);

    const r = await col.deleteOne({ _id });
    return { deletedCount: r.deletedCount };
  };

  // ✅ Índices
  async ensureIndexes() {
    const col = this._col();

    // Versión simple (recomendada si querés cero quilombos)
    await col.createIndex({ email: 1 }, { unique: true });

    // Versión PRO (case-insensitive). Si te tira error en Atlas, dejá la simple.
    // await col.createIndex(
    //   { email: 1 },
    //   { unique: true, collation: { locale: "en", strength: 2 } }
    // );
  }
}

export default ModelMongoDBUsuarios;
