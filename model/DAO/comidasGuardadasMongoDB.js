import { ObjectId } from "mongodb";
import CnxMongoDB from "../DBMongo.js";

export const COMIDAS_GUARDADAS_COLLECTION = "comidasGuardadas";

function cleanId(value = "") {
  return String(value || "").trim();
}

function toObjectId(id) {
  const value = cleanId(id);
  return ObjectId.isValid(value) ? new ObjectId(value) : null;
}

function toMongoIdOrString(id) {
  const value = cleanId(id);
  if (!value) return null;
  return ObjectId.isValid(value) ? new ObjectId(value) : value;
}

export function idValues(id) {
  const value = cleanId(id);
  const values = [];
  if (value) values.push(value);
  const objectId = toObjectId(value);
  if (objectId) values.push(objectId);
  return values;
}

function escapeRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizePaging({ limit = 40, skip = 0, max = 120 } = {}) {
  return {
    limit: Math.min(Math.max(Number(limit) || 40, 1), max),
    skip: Math.max(Number(skip) || 0, 0),
  };
}

function addFilters(query = {}, filters = {}) {
  const parts = [query].filter((item) => item && Object.keys(item).length);
  const tipoComida = String(filters.tipoComida || filters.type || "").trim();
  const visibilidad = String(filters.visibilidad || filters.visibility || "").trim();
  const ownerType = String(filters.ownerType || "").trim();
  const favorita = filters.favorita ?? filters.favorite;
  const search = String(filters.search || filters.q || "").trim();

  if (tipoComida && tipoComida !== "todos") parts.push({ tipoComida });
  if (visibilidad && visibilidad !== "todos") parts.push({ visibilidad });
  if (ownerType && ownerType !== "todos") parts.push({ ownerType });
  if (favorita !== undefined && favorita !== "" && favorita !== "todos") {
    parts.push({ favorita: favorita === true || String(favorita) === "true" });
  }
  if (filters.ownerId) parts.push({ ownerId: { $in: idValues(filters.ownerId) } });
  if (filters.asignadaA) parts.push({ asignadaA: { $in: idValues(filters.asignadaA) } });
  if (search) {
    const rx = new RegExp(escapeRegex(search), "i");
    parts.push({
      $or: [
        { nombre: rx },
        { descripcion: rx },
        { tags: rx },
        { "items.nombre": rx },
      ],
    });
  }

  if (!parts.length) return {};
  if (parts.length === 1) return parts[0];
  return { $and: parts };
}

class ModelMongoDBComidasGuardadas {
  _col() {
    if (!CnxMongoDB.connection) {
      throw new Error("No hay conexion a la base de datos");
    }
    return CnxMongoDB.db.collection(COMIDAS_GUARDADAS_COLLECTION);
  }

  list = async (filters = {}) => {
    const col = this._col();
    const { limit, skip } = normalizePaging(filters);
    const query = addFilters(filters.query || {}, filters);

    const [items, total] = await Promise.all([
      col
        .find(query)
        .sort({ favorita: -1, updatedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      col.countDocuments(query),
    ]);

    return { items, total, limit, skip };
  };

  count = async (filters = {}) => {
    return await this._col().countDocuments(addFilters(filters.query || {}, filters));
  };

  countOwnedByCoach = async (coachId) => {
    const values = idValues(coachId);
    if (!values.length) return 0;
    return await this._col().countDocuments({
      ownerType: "coach",
      ownerId: { $in: values },
      sourceType: { $nin: ["assigned_snapshot", "client_owned_meal", "client_owned"] },
      activo: { $ne: false },
      activa: { $ne: false },
    });
  };

  getById = async (id) => {
    const _id = toObjectId(id);
    if (!_id) return null;
    return await this._col().findOne({ _id });
  };

  create = async (doc = {}) => {
    const now = new Date();
    const payload = {
      ...doc,
      ownerId: doc.ownerId ? toMongoIdOrString(doc.ownerId) : null,
      creadaPorId: doc.creadaPorId ? toMongoIdOrString(doc.creadaPorId) : null,
      gimnasioId: doc.gimnasioId ? toMongoIdOrString(doc.gimnasioId) : null,
      profesionalId: doc.profesionalId ? toMongoIdOrString(doc.profesionalId) : null,
      asignadaA: Array.isArray(doc.asignadaA) ? doc.asignadaA.map(toMongoIdOrString).filter(Boolean) : [],
      activo: doc.activo !== false,
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

    if (updates.ownerId !== undefined) updates.ownerId = updates.ownerId ? toMongoIdOrString(updates.ownerId) : null;
    if (updates.creadaPorId !== undefined) updates.creadaPorId = updates.creadaPorId ? toMongoIdOrString(updates.creadaPorId) : null;
    if (updates.gimnasioId !== undefined) updates.gimnasioId = updates.gimnasioId ? toMongoIdOrString(updates.gimnasioId) : null;
    if (updates.profesionalId !== undefined) updates.profesionalId = updates.profesionalId ? toMongoIdOrString(updates.profesionalId) : null;
    if (updates.asignadaA !== undefined) {
      updates.asignadaA = Array.isArray(updates.asignadaA) ? updates.asignadaA.map(toMongoIdOrString).filter(Boolean) : [];
    }

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

  assignToClients = async (id, clientIds = []) => {
    const _id = toObjectId(id);
    if (!_id) throw new Error("ID_INVALIDO");
    const values = clientIds.map(toMongoIdOrString).filter(Boolean);
    if (!values.length) throw new Error("CLIENTES_REQUERIDOS");

    await this._col().updateOne(
      { _id },
      {
        $addToSet: { asignadaA: { $each: values } },
        $set: {
          visibilidad: "clientesAsignados",
          updatedAt: new Date(),
        },
      }
    );

    return await this.getById(id);
  };

  revokeAssignmentsForClientAndCoach = async (clienteId, coachId) => {
    const clientValues = idValues(clienteId);
    const coachValues = idValues(coachId);
    if (!clientValues.length || !coachValues.length) return { matchedCount: 0, modifiedCount: 0 };

    const byObject = await this._col().updateMany(
      {
        asignadaA: {
          $elemMatch: {
            clienteId: { $in: clientValues },
            coachId: { $in: coachValues },
          },
        },
      },
      {
        $pull: {
          asignadaA: {
            clienteId: { $in: clientValues },
            coachId: { $in: coachValues },
          },
        },
        $set: { updatedAt: new Date() },
      }
    );

    const byLegacyId = await this._col().updateMany(
      { asignadaA: { $in: clientValues } },
      {
        $pull: { asignadaA: { $in: clientValues } },
        $set: { updatedAt: new Date() },
      }
    );

    return {
      matchedCount: (byObject.matchedCount || 0) + (byLegacyId.matchedCount || 0),
      modifiedCount: (byObject.modifiedCount || 0) + (byLegacyId.modifiedCount || 0),
    };
  };

  async ensureIndexes() {
    const col = this._col();
    await col.createIndex({ ownerId: 1, ownerType: 1, updatedAt: -1 });
    await col.createIndex({ ownerRole: 1, updatedAt: -1 });
    await col.createIndex({ visibilidad: 1, activo: 1, updatedAt: -1 });
    await col.createIndex({ asignadaA: 1, activo: 1 });
    await col.createIndex({ tipoComida: 1, activo: 1 });
    await col.createIndex({ favorita: 1, ownerId: 1 });
    await col.createIndex({ gimnasioId: 1, visibilidad: 1 });
    await col.createIndex({ profesionalId: 1, updatedAt: -1 });
    await col.createIndex({ nombre: "text", descripcion: "text", tags: "text", "items.nombre": "text" }).catch(() => null);
  }
}

export default ModelMongoDBComidasGuardadas;
