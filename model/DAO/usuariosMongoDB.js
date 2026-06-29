import { ObjectId } from "mongodb";
import CnxMongoDB from "../DBMongo.js";

function coachIdQuery(coachId) {
  const ids = [String(coachId)];
  if (ObjectId.isValid(String(coachId))) {
    ids.push(new ObjectId(String(coachId)));
  }
  return { $in: ids };
}

function coachIdQueryValues(coachIds = []) {
  const strings = new Set();
  const objectIds = [];

  for (const raw of coachIds) {
    const value = String(raw || "").trim();
    if (!value) continue;

    strings.add(value);
    if (ObjectId.isValid(value)) {
      objectIds.push(new ObjectId(value));
    }
  }

  return [...strings, ...objectIds];
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

function addSearchQuery(query, search) {
  const s = String(search || "").trim();
  if (!s) return query;

  const rx = new RegExp(escapeRegex(s), "i");
  const searchOr = [
    { email: rx },
    { "profile.nombre": rx },
    { "profile.apellido": rx },
  ];

  if (query?.$or) {
    return {
      $and: [
        query,
        { $or: searchOr },
      ],
    };
  }

  return { ...query, $or: searchOr };
}

const LIST_PROJECTION = {
  passwordHash: 0,
  password: 0,
  menu: 0,
  routine: 0,
};

const ACCESS_CONTEXT_PROJECTION = {
  email: 1,
  role: 1,
  rol: 1,
  tipo: 1,
  estado: 1,
  plan: 1,
  personalPlan: 1,
  subscription: 1,
  personalSubscription: 1,
  trial: 1,
  personalTrial: 1,
  coach: 1,
  coachId: 1,
  entrenadorId: 1,
  profesionalId: 1,
  coachAccess: 1,
  clientCoachNotice: 1,
  nutritionCapabilities: 1,
  onboarding: 1,
  profile: 1,
  createdAt: 1,
  updatedAt: 1,
};

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
    try {
      if (!id) return null;
      return await this._col().findOne({ _id: new ObjectId(id) });
    } catch {
      return null;
    }
  };

  obtenerAccessContextPorId = async (id) => {
    try {
      if (!id) return null;
      return await this._col().findOne(
        { _id: new ObjectId(id) },
        { projection: ACCESS_CONTEXT_PROJECTION }
      );
    } catch {
      return null;
    }
  };

  obtenerPorEmail = async (email) => {
    if (!email) return null;
    return await this._col().findOne({
      email: String(email).toLowerCase().trim(),
    });
  };

  obtenerPorRol = async (role) => {
    return await this._col().find({ role }).toArray();
  };

  // ✅ nuevo
  listByRole = async (role) => {
    return await this._col()
      .find({ role: String(role || "").toLowerCase().trim() })
      .project(LIST_PROJECTION)
      .toArray();
  };

  // ✅ nuevo
  listClientsByCoachId = async (coachId) => {
    return await this._col()
      .find({
        role: "cliente",
        "coach.entrenadorId": coachIdQuery(coachId),
      })
      .project(LIST_PROJECTION)
      .toArray();
  };

  adminListClientsByCoachId = async (coachId, options = {}) => {
    const col = this._col();
    const { limit, skip } = normalizePaging({ ...options, max: 500 });
    const query = {
      role: "cliente",
      "coach.entrenadorId": coachIdQuery(coachId),
    };

    const [clients, total] = await Promise.all([
      col
        .find(query, { projection: LIST_PROJECTION })
        .sort({ "coach.assignedAt": -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      col.countDocuments(query),
    ]);

    return { clients, total };
  };

  // ✅ nuevo
  countClientsByCoachId = async (coachId) => {
    return await this._col().countDocuments({
      role: "cliente",
      "coach.entrenadorId": coachIdQuery(coachId),
    });
  };

  countClientsByCoachIds = async (coachIds = []) => {
    const values = coachIdQueryValues(coachIds);
    if (!values.length) return new Map();

    const rows = await this._col()
      .aggregate([
        {
          $match: {
            role: "cliente",
            "coach.entrenadorId": { $in: values },
          },
        },
        {
          $group: {
            _id: { $toString: "$coach.entrenadorId" },
            count: { $sum: 1 },
          },
        },
      ])
      .toArray();

    return new Map(rows.map((row) => [String(row._id), Number(row.count || 0)]));
  };

  unassignClientsByCoachId = async (coachId, adminId = null) => {
    const now = new Date();
    const r = await this._col().updateMany(
      {
        role: "cliente",
        "coach.entrenadorId": coachIdQuery(coachId),
      },
      {
        $set: {
          "coach.entrenadorId": null,
          "coach.assignedAt": null,
          "coach.assignedByAdminId": adminId,
          "coach.source": null,
          updatedAt: now,
        },
      }
    );

    return { matchedCount: r.matchedCount, modifiedCount: r.modifiedCount };
  };

  // ✅ nuevo
  listUnassignedClients = async () => {
    return await this._col()
      .find({
        role: "cliente",
        $or: [
          { "coach.entrenadorId": null },
          { "coach.entrenadorId": "" },
          { coach: { $exists: false } },
        ],
      })
      .project(LIST_PROJECTION)
      .toArray();
  };

  adminListUnassignedClients = async ({ search = "", limit = 100, skip = 0 } = {}) => {
    const col = this._col();
    const paging = normalizePaging({ limit, skip, max: 500 });
    const query = addSearchQuery(
      {
        role: "cliente",
        $or: [
          { "coach.entrenadorId": null },
          { "coach.entrenadorId": "" },
          { coach: { $exists: false } },
        ],
      },
      search
    );

    const [clients, total] = await Promise.all([
      col
        .find(query, { projection: LIST_PROJECTION })
        .sort({ createdAt: -1 })
        .skip(paging.skip)
        .limit(paging.limit)
        .toArray(),
      col.countDocuments(query),
    ]);

    return { clients, total };
  };

  adminListCoaches = async ({ search = "", limit = 100, skip = 0 } = {}) => {
    const col = this._col();
    const paging = normalizePaging({ limit, skip, max: 500 });
    const query = addSearchQuery({ role: "coach" }, search);

    const [coaches, total] = await Promise.all([
      col
        .find(query, { projection: LIST_PROJECTION })
        .sort({ createdAt: -1 })
        .skip(paging.skip)
        .limit(paging.limit)
        .toArray(),
      col.countDocuments(query),
    ]);

    return { coaches, total };
  };

  // ----- Escrituras -----
  registrarUsuario = async (usuario) => {
    const col = this._col();
    const doc = {
      ...usuario,
      email: usuario.email?.toLowerCase().trim(),
      createdAt: usuario.createdAt || new Date(),
      updatedAt: usuario.updatedAt || null,
    };
    const r = await col.insertOne(doc);
    return { ...doc, _id: r.insertedId };
  };

  crearUsuario = async (usuario) => {
    return await this.registrarUsuario(usuario);
  };

  updateById = async (id, updates) => {
    const col = this._col();
    let _id;
    try {
      _id = new ObjectId(id);
    } catch {
      throw new Error("ID_INVALIDO");
    }

    if (updates?._id) delete updates._id;

    await col.updateOne(
      { _id },
      { $set: { ...updates, updatedAt: new Date() } }
    );

    return await col.findOne({ _id });
  };

  actualizarPerfil = async (id, updates) => {
    return await this.updateById(id, updates);
  };

  borrarUsuario = async (id) => {
    const col = this._col();
    let _id;
    try {
      _id = new ObjectId(id);
    } catch {
      throw new Error("ID_INVALIDO");
    }

    const r = await col.deleteOne({ _id });
    return { deletedCount: r.deletedCount };
  };

  async getUpdatedAtById(id) {
    try {
      if (!id) return null;
      const _id = new ObjectId(id);

      const user = await this._col().findOne(
        { _id },
        { projection: { updatedAt: 1 } }
      );

      if (!user) return null;

      return {
        updatedAt: user.updatedAt || null,
      };
    } catch {
      return null;
    }
  }

  // ✅ opcional viejo helper admin
  adminListUsers = async ({
    search = "",
    role = "",
    estado = "",
    tipo = "",
    limit = 50,
    skip = 0,
  }) => {
    const col = this._col();
    let query = {};

    const roleNorm = String(role || "").toLowerCase().trim();
    const estadoNorm = String(estado || "").toLowerCase().trim();
    const tipoNorm = String(tipo || "").toLowerCase().trim();

    if (roleNorm && roleNorm !== "todos") query.role = roleNorm;
    if (estadoNorm && estadoNorm !== "todos") query.estado = estadoNorm;
    if (tipoNorm && tipoNorm !== "todos") query.tipo = tipoNorm;

    query = addSearchQuery(query, search);

    const paging = normalizePaging({ limit, skip, max: 500 });

    const [users, total] = await Promise.all([
      col
        .find(query, { projection: LIST_PROJECTION })
        .sort({ createdAt: -1 })
        .skip(paging.skip)
        .limit(paging.limit)
        .toArray(),
      col.countDocuments(query),
    ]);

    return { users, total };
  };

  async touchLastActivityById(id, date = new Date()) {
    const col = this._col();
    let _id;
    try {
      _id = new ObjectId(id);
    } catch {
      throw new Error("ID_INVALIDO");
    }

    await col.updateOne(
      { _id },
      { $set: { lastActivityAt: date } }
    );

    return await col.findOne({ _id });
  }

  // ----- Índices -----
  async ensureIndexes() {
    const col = this._col();
    await col.createIndex({ email: 1 }, { unique: true });
    await col.createIndex({ googleId: 1 }, { sparse: true });
    await col.createIndex({ role: 1 });
    await col.createIndex({ estado: 1 });
    await col.createIndex({ tipo: 1 });
    await col.createIndex({ plan: 1 });
    await col.createIndex({ "coach.entrenadorId": 1 });
    await col.createIndex({ role: 1, createdAt: -1 });
    await col.createIndex({ role: 1, estado: 1, createdAt: -1 });
    await col.createIndex({ role: 1, "coach.entrenadorId": 1 });
    await col.createIndex({ "subscription.status": 1 });
    await col.createIndex({ "onboarding.step": 1 });
    await col.createIndex({ createdAt: -1 });
  }
}

export default ModelMongoDBUsuarios;
