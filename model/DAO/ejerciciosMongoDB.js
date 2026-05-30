import { ObjectId } from "mongodb";
import CnxMongoDB from "../DBMongo.js";

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanId(value = "") {
  return String(value || "").trim();
}

function toObjectId(id) {
  const value = cleanId(id);
  return ObjectId.isValid(value) ? new ObjectId(value) : null;
}

function ownerValues(id) {
  const value = cleanId(id);
  const values = [];
  if (value) values.push(value);
  const objectId = toObjectId(value);
  if (objectId) values.push(objectId);
  return values;
}

function normalizePaging({ limit = 50, skip = 0, max = 200 } = {}) {
  return {
    limit: Math.min(Math.max(Number(limit) || 50, 1), max),
    skip: Math.max(Number(skip) || 0, 0),
  };
}

function buildFilter(filters = {}) {
  let query = {};
  const search = String(filters.search || "").trim();
  const estado = String(filters.estado || "").trim().toLowerCase();
  const grupoMuscular = String(filters.grupoMuscular || "").trim().toLowerCase();
  const patronMovimiento = String(filters.patronMovimiento || "").trim().toLowerCase();
  const equipamiento = String(filters.equipamiento || "").trim().toLowerCase();
  const dificultad = String(filters.dificultad || "").trim().toLowerCase();

  if (estado && estado !== "todos") query.estado = estado;
  if (grupoMuscular && grupoMuscular !== "todos") query.grupoMuscular = grupoMuscular;
  if (patronMovimiento && patronMovimiento !== "todos") query.patronMovimiento = patronMovimiento;
  if (equipamiento && equipamiento !== "todos") query.equipamiento = equipamiento;
  if (dificultad && dificultad !== "todos") query.dificultad = dificultad;

  if (search) {
    const rx = new RegExp(escapeRegex(search), "i");
    query = {
      ...query,
      $or: [
        { nombre: rx },
        { grupoMuscular: rx },
        { gruposSecundarios: rx },
        { patronMovimiento: rx },
        { equipamiento: rx },
      ],
    };
  }

  return query;
}

class ModelMongoDBEjercicios {
  _col() {
    if (!CnxMongoDB.connection) {
      throw new Error("No hay conexion a la base de datos");
    }
    return CnxMongoDB.db.collection("ejercicios");
  }

  list = async (filters = {}) => {
    const col = this._col();
    const { limit, skip } = normalizePaging(filters);
    const query = buildFilter(filters);

    if (filters.visibilityQuery) {
      query.$and = query.$and || [];
      query.$and.push(filters.visibilityQuery);
    }

    const [items, total] = await Promise.all([
      col
        .find(query)
        .sort({ createdAt: -1, nombre: 1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      col.countDocuments(query),
    ]);

    return { items, total };
  };

  getById = async (id) => {
    const _id = toObjectId(id);
    if (!_id) return null;
    return await this._col().findOne({ _id });
  };

  create = async (doc) => {
    const now = new Date();
    const payload = {
      ...doc,
      createdAt: doc.createdAt || now,
      updatedAt: doc.updatedAt || now,
    };

    const result = await this._col().insertOne(payload);
    return { ...payload, _id: result.insertedId };
  };

  updateById = async (id, patch = {}) => {
    const _id = toObjectId(id);
    if (!_id) throw new Error("ID_INVALIDO");

    const updates = { ...patch };
    delete updates._id;
    delete updates.id;
    delete updates.createdAt;

    await this._col().updateOne(
      { _id },
      { $set: { ...updates, updatedAt: new Date() } }
    );

    return await this.getById(id);
  };

  deleteById = async (id) => {
    const _id = toObjectId(id);
    if (!_id) throw new Error("ID_INVALIDO");
    return await this._col().deleteOne({ _id });
  };

  ownerVisibilityForCoach(coachId) {
    return {
      $or: [
        { visibilidad: { $in: ["publica", "sistema"] } },
        {
          ownerType: "coach",
          ownerId: { $in: ownerValues(coachId) },
        },
      ],
    };
  }

  async ensureIndexes() {
    const col = this._col();
    await col.createIndex({ nombre: 1 });
    await col.createIndex({ estado: 1 });
    await col.createIndex({ grupoMuscular: 1 });
    await col.createIndex({ patronMovimiento: 1 });
    await col.createIndex({ equipamiento: 1 });
    await col.createIndex({ dificultad: 1 });
    await col.createIndex({ ownerType: 1, ownerId: 1 });
    await col.createIndex({ estado: 1, visibilidad: 1, createdAt: -1 });
    await col.createIndex({ createdAt: -1 });
  }
}

export default ModelMongoDBEjercicios;
