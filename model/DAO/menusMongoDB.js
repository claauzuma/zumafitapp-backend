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
      { rangoKcal: rx },
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
  const visibilidad = String(filters.visibilidad || "").trim().toLowerCase();
  const estado = String(filters.estado || "").trim().toLowerCase();
  const rangoKcal = String(filters.rangoKcal || filters.rango || "").trim();
  const proteina = Number(filters.proteina || filters.protein);
  const cantidadComidas = Number(filters.cantidadComidas || filters.meals);

  if (objetivo && objetivo !== "todos") query.objetivo = objetivo;
  if (visibilidad && visibilidad !== "todos") query.visibilidad = visibilidad;
  if (estado && estado !== "todos") query.estado = estado;
  if (rangoKcal && rangoKcal !== "todos") query.rangoKcal = rangoKcal;
  if (Number.isFinite(proteina) && proteina > 0) query["macrosObjetivo.proteina"] = proteina;
  if (Number.isFinite(cantidadComidas) && cantidadComidas > 0) query.cantidadComidas = cantidadComidas;

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
  if (estado === "activo") query.activa = { $ne: false };

  return addSearch(query, filters.search);
}

class ModelMongoDBMenus {
  _base() {
    if (!CnxMongoDB.connection) {
      throw new Error("No hay conexion a la base de datos");
    }
    return CnxMongoDB.db.collection("menus_base");
  }

  _assigned() {
    if (!CnxMongoDB.connection) {
      throw new Error("No hay conexion a la base de datos");
    }
    return CnxMongoDB.db.collection("menus_asignados");
  }

  listBase = async (filters = {}) => {
    const col = this._base();
    const { limit, skip } = normalizePaging(filters);
    const query = buildBaseFilter(filters);

    const projection = filters.includeComidas ? undefined : { comidas: 0 };

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

  revokeBaseAssignmentsForClientAndCoach = async (clienteId, coachId) => {
    const clientValues = idValues(clienteId);
    const coachValues = idValues(coachId);
    if (!clientValues.length || !coachValues.length) return { matchedCount: 0, modifiedCount: 0 };

    const byObject = await this._base().updateMany(
      {
        asignadoA: {
          $elemMatch: {
            clienteId: { $in: clientValues },
            coachId: { $in: coachValues },
          },
        },
      },
      {
        $pull: {
          asignadoA: {
            clienteId: { $in: clientValues },
            coachId: { $in: coachValues },
          },
        },
        $set: { updatedAt: new Date() },
      }
    );

    const byLegacyId = await this._base().updateMany(
      { asignadoA: { $in: clientValues } },
      {
        $pull: { asignadoA: { $in: clientValues } },
        $set: { updatedAt: new Date() },
      }
    );

    return {
      matchedCount: (byObject.matchedCount || 0) + (byLegacyId.matchedCount || 0),
      modifiedCount: (byObject.modifiedCount || 0) + (byLegacyId.modifiedCount || 0),
    };
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
        estado: "activo",
        activa: { $ne: false },
      },
      { sort: { fechaInicio: -1, updatedAt: -1 } }
    );
  };

  getActiveForClientAndCoach = async (clienteId, coachId) => {
    const clientValues = idValues(clienteId);
    const coachValues = idValues(coachId);
    if (!clientValues.length || !coachValues.length) return null;

    return await this._assigned().findOne(
      {
        clienteId: { $in: clientValues },
        coachId: { $in: coachValues },
        estado: "activo",
        activa: { $ne: false },
      },
      { sort: { fechaInicio: -1, updatedAt: -1 } }
    );
  };

  revokeActiveForClientAndCoach = async (clienteId, coachId, patch = {}) => {
    const clientValues = idValues(clienteId);
    const coachValues = idValues(coachId);
    if (!clientValues.length || !coachValues.length) return { matchedCount: 0, modifiedCount: 0 };

    const now = new Date();
    return await this._assigned().updateMany(
      {
        clienteId: { $in: clientValues },
        coachId: { $in: coachValues },
        estado: "activo",
      },
      {
        $set: {
          activa: false,
          estado: "revocado",
          revokedAt: now,
          revokedReason: patch.revokedReason || "coach_unlinked",
          revokedBy: patch.revokedBy || null,
          updatedAt: now,
        },
      }
    );
  };

  pauseActiveForClient = async (clienteId, excludeId = null) => {
    const values = idValues(clienteId);
    if (!values.length) return { matchedCount: 0, modifiedCount: 0 };

    const query = {
      clienteId: { $in: values },
      estado: "activo",
    };

    const excludeObjectId = toObjectId(excludeId);
    if (excludeObjectId) query._id = { $ne: excludeObjectId };

    return await this._assigned().updateMany(
      query,
      {
        $set: {
          estado: "pausado",
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
        { estado: "activo", visibilidad: { $in: ["publica", "sistema"] } },
        {
          ownerType: "coach",
          ownerId: { $in: idValues(coachId) },
        },
      ],
    };
  }

  async ensureIndexes() {
    const base = this._base();
    await base.createIndex({ ownerType: 1, ownerId: 1 });
    await base.createIndex({ ownerType: 1, ownerId: 1, activa: 1, createdAt: -1 });
    await base.createIndex({ ownerType: 1, ownerId: 1, nombreNormalizado: 1 });
    await base.createIndex({ estado: 1, visibilidad: 1, updatedAt: -1 });
    await base.createIndex({ rangoKcal: 1, estado: 1 });
    await base.createIndex({ "macrosObjetivo.proteina": 1 });
    await base.createIndex({ updatedAt: -1 });

    const assigned = this._assigned();
    await assigned.createIndex({ clienteId: 1, estado: 1, updatedAt: -1 });
    await assigned.createIndex({ coachId: 1, estado: 1, updatedAt: -1 });
    await assigned.createIndex({ menuBaseId: 1 });
    await assigned.createIndex({ fechaInicio: -1 });
  }
}

export default ModelMongoDBMenus;
