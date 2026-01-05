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
    return await this._col().findOne({ email: email.toLowerCase().trim() });
  };

  obtenerPorRol = async (role) => {
    return await this._col().find({ role }).toArray();
  };

  // ----- Escrituras -----

  registrarUsuario = async (usuario) => {
    const col = this._col();

    // Normalizar email
    const doc = {
      ...usuario,
      email: usuario.email?.toLowerCase().trim(),
    };

    const r = await col.insertOne(doc);

    // Devolver el usuario con _id real
    return { ...doc, _id: r.insertedId };
  };

  // Alias (por si tu servicio usa crearUsuario)
  crearUsuario = async (usuario) => {
    return await this.registrarUsuario(usuario);
  };

  // Updates genéricos
  updateById = async (id, updates) => {
    const col = this._col();
    const _id = new ObjectId(id);

    // Evitar que intenten pisar _id
    if (updates?._id) delete updates._id;

    await col.updateOne({ _id }, { $set: { ...updates, updatedAt: new Date() } });

    return await col.findOne({ _id });
  };

  // Alias para compatibilidad si lo llamabas así
  actualizarPerfil = async (id, updates) => {
    return await this.updateById(id, updates);
  };

  // Borrar usuario
  borrarUsuario = async (id) => {
    const col = this._col();
    const _id = new ObjectId(id);

    const r = await col.deleteOne({ _id });
    return { deletedCount: r.deletedCount };
  };
}

export default ModelMongoDBUsuarios;
