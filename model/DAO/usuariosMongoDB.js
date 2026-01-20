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

  // ✅ ADMIN: listado con filtros + búsqueda + paginación
adminListUsers = async ({ search = "", role = "", estado = "", tipo = "", limit = 50, skip = 0 }) => {
  const col = this._col();

  const query = {};

  if (role) query.role = role;
  if (estado) query.estado = estado;
  if (tipo) query.tipo = tipo;

  if (search) {
    const s = String(search).trim();
    query.$or = [
      { email: { $regex: s, $options: "i" } },
      { "profile.nombre": { $regex: s, $options: "i" } },
      { "profile.apellido": { $regex: s, $options: "i" } },
    ];
  }

  const lim = Math.min(Number(limit) || 50, 200);
  const sk = Math.max(Number(skip) || 0, 0);

  // Proyección: no traer hashes
  return await col
    .find(query, { projection: { passwordHash: 0, password: 0 } })
    .sort({ createdAt: -1 })
    .skip(sk)
    .limit(lim)
    .toArray();
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
    await col.createIndex({ role: 1 });
await col.createIndex({ estado: 1 });
await col.createIndex({ tipo: 1 });
await col.createIndex({ createdAt: -1 });

  }
}

export default ModelMongoDBUsuarios;
