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

function idValues(id) {
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

function addSearch(query, search) {
  const value = String(search || "").trim();
  if (!value) return query;

  const rx = new RegExp(escapeRegex(value), "i");
  const searchQuery = {
    $or: [
      { nombre: rx },
      { descripcion: rx },
      { objetivo: rx },
      { nivel: rx },
      { tags: rx },
    ],
  };

  if (query.$or) {
    return { $and: [query, searchQuery] };
  }

  return { ...query, ...searchQuery };
}

function buildBaseFilter(filters = {}) {
  let query = {};
  const objetivo = String(filters.objetivo || "").trim().toLowerCase();
  const nivel = String(filters.nivel || "").trim().toLowerCase();
  const visibilidad = String(filters.visibilidad || "").trim().toLowerCase();
  const estado = String(filters.estado || "").trim().toLowerCase();
  const diasPorSemana = Number(filters.diasPorSemana);

  if (objetivo && objetivo !== "todos") query.objetivo = objetivo;
  if (nivel && nivel !== "todos") query.nivel = nivel;
  if (visibilidad && visibilidad !== "todos") query.visibilidad = visibilidad;
  if (estado && estado !== "todos") query.estado = estado;
  if (Number.isFinite(diasPorSemana) && diasPorSemana > 0) query.diasPorSemana = diasPorSemana;

  query = addSearch(query, filters.search);

  if (filters.visibilityQuery) {
    query = { $and: [query, filters.visibilityQuery] };
  }

  return query;
}

function buildAssignedFilter(filters = {}) {
  let query = {};
  const estado = String(filters.estado || "").trim().toLowerCase();

  if (filters.clienteId) query.clienteId = { $in: idValues(filters.clienteId) };
  if (filters.coachId) query.coachId = { $in: idValues(filters.coachId) };
  if (estado && estado !== "todos") query.estado = estado;

  return addSearch(query, filters.search);
}

class ModelMongoDBRutinas {
  _base() {
    if (!CnxMongoDB.connection) {
      throw new Error("No hay conexion a la base de datos");
    }
    return CnxMongoDB.db.collection("rutinas_base");
  }

  _assigned() {
    if (!CnxMongoDB.connection) {
      throw new Error("No hay conexion a la base de datos");
    }
    return CnxMongoDB.db.collection("rutinas_asignadas");
  }

  listBase = async (filters = {}) => {
    const col = this._base();
    const { limit, skip } = normalizePaging(filters);
    const query = buildBaseFilter(filters);

    const projection = filters.includeDays
      ? undefined
      : {
          dias: 0,
        };

    const [items, total] = await Promise.all([
      col
        .find(query, { projection })
        .sort({ updatedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      col.countDocuments(query),
    ]);

    return { items, total };
  };

  getBaseById = async (id) => {
    const _id = toObjectId(id);
    if (!_id) return null;
    return await this._base().findOne({ _id });
  };

  createBase = async (doc) => {
    const now = new Date();
    const payload = {
      ...doc,
      createdAt: doc.createdAt || now,
      updatedAt: doc.updatedAt || now,
    };

    const result = await this._base().insertOne(payload);
    return { ...payload, _id: result.insertedId };
  };

  updateBaseById = async (id, patch = {}) => {
    const _id = toObjectId(id);
    if (!_id) throw new Error("ID_INVALIDO");

    const updates = { ...patch };
    delete updates._id;
    delete updates.id;
    delete updates.createdAt;

    await this._base().updateOne(
      { _id },
      { $set: { ...updates, updatedAt: new Date() } }
    );

    return await this.getBaseById(id);
  };

  deleteBaseById = async (id) => {
    const _id = toObjectId(id);
    if (!_id) throw new Error("ID_INVALIDO");
    return await this._base().deleteOne({ _id });
  };

  listAssigned = async (filters = {}) => {
    const col = this._assigned();
    const { limit, skip } = normalizePaging({ ...filters, max: 300 });
    const query = buildAssignedFilter(filters);

    const [items, total] = await Promise.all([
      col
        .find(query)
        .sort({ estado: 1, fechaInicio: -1, updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      col.countDocuments(query),
    ]);

    return { items, total };
  };

  getAssignedById = async (id) => {
    const _id = toObjectId(id);
    if (!_id) return null;
    return await this._assigned().findOne({ _id });
  };

  getActiveForClient = async (clienteId) => {
    const values = idValues(clienteId);
    if (!values.length) return null;
    return await this._assigned().findOne(
      {
        clienteId: { $in: values },
        estado: "activa",
      },
      { sort: { fechaInicio: -1, updatedAt: -1 } }
    );
  };

  pauseActiveForClient = async (clienteId) => {
    const values = idValues(clienteId);
    if (!values.length) return { matchedCount: 0, modifiedCount: 0 };

    return await this._assigned().updateMany(
      {
        clienteId: { $in: values },
        estado: "activa",
      },
      {
        $set: {
          estado: "pausada",
          updatedAt: new Date(),
        },
      }
    );
  };

  pauseActiveForClientAndCoach = async (clienteId, coachId) => {
    const clientValues = idValues(clienteId);
    const coachValues = idValues(coachId);
    if (!clientValues.length || !coachValues.length) return { matchedCount: 0, modifiedCount: 0 };

    return await this._assigned().updateMany(
      {
        clienteId: { $in: clientValues },
        coachId: { $in: coachValues },
        estado: "activa",
      },
      {
        $set: {
          estado: "pausada",
          pausedReason: "coach_service_ended",
          updatedAt: new Date(),
        },
      }
    );
  };

  createAssigned = async (doc) => {
    const now = new Date();
    const payload = {
      ...doc,
      createdAt: doc.createdAt || now,
      updatedAt: doc.updatedAt || now,
    };

    const result = await this._assigned().insertOne(payload);
    return { ...payload, _id: result.insertedId };
  };

  updateAssignedById = async (id, patch = {}) => {
    const _id = toObjectId(id);
    if (!_id) throw new Error("ID_INVALIDO");

    const updates = { ...patch };
    delete updates._id;
    delete updates.id;
    delete updates.createdAt;

    await this._assigned().updateOne(
      { _id },
      { $set: { ...updates, updatedAt: new Date() } }
    );

    return await this.getAssignedById(id);
  };

  deleteAssignedById = async (id) => {
    const _id = toObjectId(id);
    if (!_id) throw new Error("ID_INVALIDO");
    return await this._assigned().deleteOne({ _id });
  };

  ownerVisibilityForCoach(coachId) {
    return {
      $or: [
        { visibilidad: { $in: ["publica", "sistema"] } },
        {
          ownerType: "coach",
          ownerId: { $in: idValues(coachId) },
        },
      ],
    };
  }

  async ensureIndexes() {
    const base = this._base();
    await base.createIndex({ nombre: 1 });
    await base.createIndex({ estado: 1, visibilidad: 1, createdAt: -1 });
    await base.createIndex({ objetivo: 1 });
    await base.createIndex({ nivel: 1 });
    await base.createIndex({ diasPorSemana: 1 });
    await base.createIndex({ ownerType: 1, ownerId: 1 });
    await base.createIndex({ tags: 1 });
    await base.createIndex({ updatedAt: -1 });

    const assigned = this._assigned();
    await assigned.createIndex({ clienteId: 1, estado: 1, updatedAt: -1 });
    await assigned.createIndex({ coachId: 1, estado: 1, updatedAt: -1 });
    await assigned.createIndex({ rutinaBaseId: 1 });
    await assigned.createIndex({ fechaInicio: -1 });
    await assigned.createIndex({ updatedAt: -1 });
  }
}

export default ModelMongoDBRutinas;
