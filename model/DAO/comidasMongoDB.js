import { ObjectId } from "mongodb";
import CnxMongoDB from "../DBMongo.js";

function cleanId(value = "") {
  return String(value || "").trim();
}

function toObjectId(id) {
  const value = cleanId(id);
  return ObjectId.isValid(value) ? new ObjectId(value) : null;
}

function idValues(id) {
  const value = cleanId(id);
  const values = [];
  if (value) values.push(value);
  const objectId = toObjectId(value);
  if (objectId) values.push(objectId);
  return values;
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizePaging({ limit = 100, skip = 0, max = 500 } = {}) {
  return {
    limit: Math.min(Math.max(Number(limit) || 100, 1), max),
    skip: Math.max(Number(skip) || 0, 0),
  };
}

function addSearch(query, search) {
  const value = String(search || "").trim();
  if (!value) return query;

  const rx = new RegExp(escapeRegex(value), "i");
  const searchQuery = {
    $or: [
      { nombre: rx },
      { descripcion: rx },
      { tags: rx },
      { "items.nombreSnapshot": rx },
      { "items.alimento": rx },
    ],
  };

  if (query.$or || query.$and) {
    return { $and: [query, searchQuery] };
  }

  return { ...query, ...searchQuery };
}

function buildFilter(filters = {}) {
  let query = filters.query ? { ...filters.query } : {};
  const tipoComida = String(filters.tipoComida || filters.type || "").trim().toLowerCase();
  const grupoComida = String(filters.grupoComida || filters.group || "").trim().toLowerCase();
  const visibilidad = String(filters.visibilidad || filters.visibility || "").trim().toLowerCase();
  const estado = String(filters.estado || filters.status || "").trim().toLowerCase();
  const ownerType = String(filters.ownerType || "").trim().toLowerCase();

  if (filters.userId) query.userId = String(filters.userId);
  if (filters.ownerId) query.ownerId = { $in: idValues(filters.ownerId) };
  if (ownerType && ownerType !== "todos") query.ownerType = ownerType;
  if (tipoComida && tipoComida !== "todos") query.tipoComida = tipoComida;
  if (grupoComida && grupoComida !== "todos") query.grupoComida = grupoComida;
  if (visibilidad && visibilidad !== "todos") query.visibilidad = visibilidad;
  if (estado && estado !== "todos") query.estado = estado;

  return addSearch(query, filters.search);
}

class ModelMongoDBComidas {
  _col() {
    if (!CnxMongoDB.connection) {
      throw new Error("No hay conexion a la base de datos");
    }
    return CnxMongoDB.db.collection("comidascreadas");
  }

  listarComidas = async (filters = {}) => {
    const col = this._col();
    const { limit, skip } = normalizePaging(filters);
    const query = buildFilter(filters);

    return await col
      .find(query)
      .sort({ updatedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();
  };

  contarComidas = async (filters = {}) => {
    return await this._col().countDocuments(buildFilter(filters));
  };

  countOwnedByCoach = async (coachId) => {
    const values = idValues(coachId);
    if (!values.length) return 0;
    return await this._col().countDocuments({
      $and: [
        this.ownerOnlyForCoach(coachId),
        { sourceType: { $nin: ["assigned_snapshot", "client_owned_meal", "client_owned"] } },
      ],
    });
  };

  obtenerPorId = async (id) => {
    const _id = toObjectId(id);
    if (!_id) return null;
    return await this._col().findOne({ _id });
  };

  crearComida = async (comida) => {
    const now = new Date();
    const doc = {
      ...comida,
      userId: comida.userId ? String(comida.userId) : null,
      createdAt: comida.createdAt || now,
      updatedAt: comida.updatedAt || now,
    };

    const result = await this._col().insertOne(doc);
    return { ...doc, _id: result.insertedId };
  };

  updateById = async (id, updates = {}) => {
    const _id = toObjectId(id);
    if (!_id) throw new Error("ID_INVALIDO");

    const patch = { ...updates };
    delete patch._id;
    delete patch.id;
    delete patch.createdAt;

    await this._col().updateOne(
      { _id },
      { $set: { ...patch, updatedAt: new Date() } }
    );

    return await this.obtenerPorId(id);
  };

  borrarComida = async (id) => {
    const _id = toObjectId(id);
    if (!_id) throw new Error("ID_INVALIDO");
    const result = await this._col().deleteOne({ _id });
    return { deletedCount: result.deletedCount };
  };

  ownerVisibilityForCoach(coachId) {
    return {
      $or: [
        {
          estado: "activo",
          visibilidad: { $in: ["sistema", "publica"] },
        },
        {
          ownerType: "coach",
          ownerId: { $in: idValues(coachId) },
        },
        {
          userId: String(coachId),
        },
      ],
    };
  }

  ownerOnlyForCoach(coachId) {
    const values = idValues(coachId);
    return {
      $or: [
        { ownerType: "coach", ownerId: { $in: values } },
        { userId: String(coachId) },
      ],
    };
  }

  adminTemplatesForCoach({ premium = false } = {}) {
    const visibility = premium
      ? ["publica", "sistema", "global", "solo_coaches", "premium"]
      : ["publica", "sistema", "global", "solo_coaches"];
    const tiers = premium
      ? ["global_basic", "global_pro", "global_premium"]
      : ["global_basic", "global_pro"];
    const plans = premium ? ["free", "pro", "vip"] : ["free", "pro"];
    return {
      $and: [
        { ownerType: "admin" },
        { estado: "activo" },
        { visibilidad: { $in: visibility } },
        {
          $or: [
            { templateTier: { $in: tiers } },
            {
              templateTier: { $exists: false },
              $or: [
                { planMinimo: { $in: plans } },
                { planMinimo: { $exists: false } },
                { planMinimo: null },
              ],
            },
          ],
        },
      ],
    };
  }

  async ensureIndexes() {
    const col = this._col();
    await col.createIndex({ ownerType: 1, ownerId: 1 });
    await col.createIndex({ tipoComida: 1, estado: 1 });
    await col.createIndex({ grupoComida: 1, estado: 1 });
    await col.createIndex({ visibilidad: 1, estado: 1 });
    await col.createIndex({ updatedAt: -1, createdAt: -1 });
    await col.createIndex({ userId: 1 });
  }
}

export default ModelMongoDBComidas;
