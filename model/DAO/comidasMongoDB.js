import { ObjectId } from "mongodb";
import CnxMongoDB from "../DBMongo.js";

class ModelMongoDBComidas {
  _col() {
    if (!CnxMongoDB.connection) {
      throw new Error("No hay conexión a la base de datos");
    }
    return CnxMongoDB.db.collection("comidascreadas");
  }

  // ----- Lecturas -----

  listarComidas = async (filtro = {}) => {
    const col = this._col();
    const query = {};

    if (filtro.userId) query.userId = filtro.userId;

    // Orden más nuevas primero
    return await col.find(query).sort({ createdAt: -1 }).toArray();
  };

  obtenerPorId = async (id) => {
    if (!id) return null;
    return await this._col().findOne({ _id: new ObjectId(id) });
  };

  // ----- Escrituras -----

  crearComida = async (comida) => {
    const col = this._col();

    const doc = {
      ...comida,
      // Guardamos userId como string (simple, como venís haciendo)
      userId: String(comida.userId),
      items: Array.isArray(comida.items) ? comida.items : [],
      createdAt: comida.createdAt || new Date(),
      updatedAt: null,
    };

    const r = await col.insertOne(doc);
    return { ...doc, _id: r.insertedId };
  };

  updateById = async (id, updates) => {
    const col = this._col();
    const _id = new ObjectId(id);

    if (updates?._id) delete updates._id;

    await col.updateOne(
      { _id },
      { $set: { ...updates, updatedAt: new Date() } }
    );

    return await col.findOne({ _id });
  };

  borrarComida = async (id) => {
    const col = this._col();
    const _id = new ObjectId(id);

    const r = await col.deleteOne({ _id });
    return { deletedCount: r.deletedCount };
  };
}

export default ModelMongoDBComidas;
