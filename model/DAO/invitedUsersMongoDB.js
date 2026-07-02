import CnxMongoDB from "../DBMongo.js";
import { ObjectId } from "mongodb";

function idValues(id) {
  const value = id?.toString?.() || String(id || "").trim();
  if (!value) return [];
  const values = [value];
  if (ObjectId.isValid(value)) values.push(new ObjectId(value));
  return values;
}

function storedId(id) {
  const value = id?.toString?.() || String(id || "").trim();
  if (!value) return null;
  return ObjectId.isValid(value) ? new ObjectId(value) : value;
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanClientPermissions(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return {
    menu: value.menu && typeof value.menu === "object" ? { ...value.menu } : {},
    routine: value.routine && typeof value.routine === "object" ? { ...value.routine } : {},
    progress: value.progress && typeof value.progress === "object" ? { ...value.progress } : {},
  };
}

function cleanInviteOnboarding(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const mode = String(value.mode || "full").toLowerCase();
  const enabled = value.enabled !== false && mode !== "none";
  return {
    enabled,
    mode: enabled ? "full" : "none",
  };
}

function cleanCoachSnapshot(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  return {
    id: value.id?.toString?.() || value._id?.toString?.() || String(value.id || value._id || ""),
    email: String(value.email || "").toLowerCase().trim(),
    nombre: String(value.nombre || value?.profile?.nombre || "").trim(),
    apellido: String(value.apellido || value?.profile?.apellido || "").trim(),
    plan: value.plan || null,
    servicePackage: value.servicePackage || null,
    specialties: {
      training: !!value?.specialties?.training || !!value?.coachProfile?.specialties?.training,
      nutrition: !!value?.specialties?.nutrition || !!value?.coachProfile?.specialties?.nutrition,
    },
  };
}

class ModelMongoDBInvitedUsers {
  _col() {
    if (!CnxMongoDB.connection) {
      throw new Error("No hay conexión a la base de datos");
    }
    return CnxMongoDB.db.collection("invited_users");
  }

  async ensureIndexes() {
    const col = this._col();
    await col.createIndex({ email: 1 });
    await col.createIndex({ inviteeEmailNormalized: 1 });
    await col.createIndex({ clientId: 1, status: 1 });
    await col.createIndex({ status: 1 });
    await col.createIndex({ invitedByType: 1, status: 1 });
    await col.createIndex({ assignedCoachId: 1, status: 1 });
    await col.createIndex({ source: 1, status: 1 });
    await col.createIndex(
      { email: 1, status: 1 },
      {
        unique: true,
        partialFilterExpression: { status: "pending" },
      }
    );
    try {
      const indexes = await col.indexes();
      const ttl = indexes.find((item) => item.name === "expiresAt_1" && item.expireAfterSeconds !== undefined);
      if (ttl) await col.dropIndex(ttl.name);
    } catch {
      // Si no se puede inspeccionar o dropear, la app sigue funcionando con los indices existentes.
    }
    await col.createIndex({ expiresAt: 1 }, { name: "invited_users_expiresAt" });
    await col.createIndex(
      { source: 1, assignedCoachId: 1, email: 1, status: 1 },
      { name: "invited_users_coach_email_status" }
    );
    await col.createIndex(
      { source: 1, assignedCoachId: 1, clientId: 1, status: 1 },
      { name: "invited_users_coach_client_status" }
    );
  }

  create = async (doc) => {
    const col = this._col();

    const training = !!doc?.coachProfile?.specialties?.training;
    const nutrition = !!doc?.coachProfile?.specialties?.nutrition;
    const onboarding = cleanInviteOnboarding(doc.onboarding);

    const email = String(doc.email || doc.inviteeEmailNormalized || doc.inviteeEmail || "").toLowerCase().trim();
    const clean = {
      email,
      inviteeEmail: String(doc.inviteeEmail || doc.email || "").trim(),
      inviteeEmailNormalized: email,
      role: doc.role || null,
      plan: doc.plan ?? null,
      status: doc.status || "pending",
      profile: {
        nombre: String(doc?.profile?.nombre || "").trim(),
        apellido: String(doc?.profile?.apellido || "").trim(),
      },
      coachProfile:
        doc.role === "coach"
          ? {
              specialties: {
                training,
                nutrition,
              },
            }
          : null,
      invitedBy: doc.invitedBy || null,
      invitedByType: doc.invitedByType || "admin",
      source: doc.source || "admin_invite",
      clientId: storedId(doc.clientId),
      assignedCoachId: storedId(doc.assignedCoachId),
      servicePackage: doc.servicePackage || doc?.coachAccess?.servicePackage || null,
      serviceScopes: Array.isArray(doc.serviceScopes || doc?.coachAccess?.serviceScopes)
        ? (doc.serviceScopes || doc.coachAccess.serviceScopes).map((scope) => String(scope || "").trim()).filter(Boolean)
        : [],
      price: doc.price && typeof doc.price === "object" && !Array.isArray(doc.price)
        ? {
            amount: Number.isFinite(Number(doc.price.amount)) ? Number(doc.price.amount) : null,
            currency: String(doc.price.currency || "ARS").toUpperCase(),
            interval: String(doc.price.interval || "month"),
            paymentMode: String(doc.price.paymentMode || "external"),
          }
        : null,
      modality: String(doc.modality || "").trim() || null,
      message: String(doc.message || "").trim().slice(0, 500),
      coachAccess: doc.coachAccess && typeof doc.coachAccess === "object" && !Array.isArray(doc.coachAccess)
        ? {
            ...doc.coachAccess,
            coachId: storedId(doc.coachAccess.coachId),
            invitationId: doc.coachAccess.invitationId || null,
          }
        : null,
      targetRole: doc.targetRole || doc.role || null,
      clientPermissions: cleanClientPermissions(doc.clientPermissions),
      ...(onboarding ? { onboarding } : {}),
      acceptedUserId: storedId(doc.acceptedUserId),
      coachSnapshot: cleanCoachSnapshot(doc.coachSnapshot),
      tokenHash: doc.tokenHash || null,
      tokenCreatedAt: doc.tokenCreatedAt || null,
      deliveryStatus: doc.deliveryStatus || null,
      deliveryError: doc.deliveryError || null,
      lastNotificationAt: doc.lastNotificationAt || null,
      rejectionCooldownUntil: doc.rejectionCooldownUntil || null,
      invitedAt: doc.invitedAt || new Date(),
      acceptedAt: doc.acceptedAt || null,
      declinedAt: doc.declinedAt || null,
      declinedReason: doc.declinedReason || null,
      cancelledAt: doc.cancelledAt || null,
      activatedAt: doc.activatedAt || null,
      expiresAt: doc.expiresAt || null,
      createdAt: doc.createdAt || new Date(),
      updatedAt: doc.updatedAt || new Date(),
    };

    const r = await col.insertOne(clean);
    return { ...clean, _id: r.insertedId };
  };

  findPendingByEmail = async (email) => {
    if (!email) return null;
    return await this._col().findOne({
      email: String(email).toLowerCase().trim(),
      status: "pending",
    });
  };

  findByEmail = async (email) => {
    if (!email) return [];
    const normalized = String(email).toLowerCase().trim();
    return await this._col()
      .find({
        $or: [
          { email: normalized },
          { inviteeEmailNormalized: normalized },
        ],
      })
      .sort({ createdAt: -1 })
      .toArray();
  };

  findActionableCoachInvitesByTarget = async ({ email = "", clientId = null, statuses = ["pending", "accepted_pending_activation"] } = {}) => {
    const normalized = String(email || "").toLowerCase().trim();
    const clientValues = idValues(clientId);
    const targetOr = [];
    if (normalized) {
      targetOr.push({ email: normalized }, { inviteeEmailNormalized: normalized });
    }
    if (clientValues.length) {
      targetOr.push({ clientId: { $in: clientValues } }, { acceptedUserId: { $in: clientValues } });
    }
    if (!targetOr.length) return [];

    return await this._col()
      .find({
        source: "coach_invite",
        status: { $in: statuses },
        $or: targetOr,
      })
      .sort({ createdAt: -1, invitedAt: -1 })
      .toArray();
  };

  findRecentRejectedByCoachAndTarget = async ({ coachId, email = "", clientId = null, since }) => {
    const coachValues = idValues(coachId);
    const normalized = String(email || "").toLowerCase().trim();
    const clientValues = idValues(clientId);
    if (!coachValues.length || !since) return null;

    const targetOr = [];
    if (normalized) targetOr.push({ email: normalized }, { inviteeEmailNormalized: normalized });
    if (clientValues.length) targetOr.push({ clientId: { $in: clientValues } }, { acceptedUserId: { $in: clientValues } });
    if (!targetOr.length) return null;

    return await this._col().findOne({
      source: "coach_invite",
      status: "declined",
      declinedAt: { $gte: since },
      $and: [
        {
          $or: [
            { assignedCoachId: { $in: coachValues } },
            { invitedBy: { $in: coachValues }, invitedByType: "coach" },
          ],
        },
        { $or: targetOr },
      ],
    }, { sort: { declinedAt: -1, updatedAt: -1 } });
  };

  countCreatedByCoachSince = async (coachId, since) => {
    const coachValues = idValues(coachId);
    if (!coachValues.length || !since) return 0;
    return await this._col().countDocuments({
      source: "coach_invite",
      createdAt: { $gte: since },
      $or: [
        { assignedCoachId: { $in: coachValues } },
        { invitedBy: { $in: coachValues }, invitedByType: "coach" },
      ],
    });
  };

  cancelPendingByClientAndCoach = async ({ clientId, coachId, reason = "blocked_by_client", now = new Date() } = {}) => {
    const clientValues = idValues(clientId);
    const coachValues = idValues(coachId);
    if (!clientValues.length || !coachValues.length) return { matchedCount: 0, modifiedCount: 0 };

    return await this._col().updateMany(
      {
        source: "coach_invite",
        status: { $in: ["pending", "accepted_pending_activation"] },
        $and: [
          {
            $or: [
              { assignedCoachId: { $in: coachValues } },
              { invitedBy: { $in: coachValues }, invitedByType: "coach" },
            ],
          },
          {
            $or: [
              { clientId: { $in: clientValues } },
              { acceptedUserId: { $in: clientValues } },
            ],
          },
        ],
      },
      {
        $set: {
          status: "cancelled",
          cancelledAt: now,
          cancelledReason: reason,
          updatedAt: now,
        },
      }
    );
  };

  updateCoachInvitesByEmailWithClientId = async ({ email, clientId, now = new Date() } = {}) => {
    const normalized = String(email || "").toLowerCase().trim();
    const client = storedId(clientId);
    if (!normalized || !client) return { matchedCount: 0, modifiedCount: 0 };

    return await this._col().updateMany(
      {
        source: "coach_invite",
        status: "pending",
        $or: [
          { email: normalized },
          { inviteeEmailNormalized: normalized },
        ],
        clientId: { $in: [null, ""] },
      },
      {
        $set: {
          clientId: client,
          updatedAt: now,
        },
      }
    );
  };

  // ✅ nuevo
  getById = async (id) => {
    try {
      if (!id) return null;
      const _id = typeof id === "string" ? new ObjectId(id) : id;
      return await this._col().findOne({ _id });
    } catch {
      return null;
    }
  };

  // ✅ nuevo
  updateById = async (id, patch = {}) => {
    const col = this._col();
    let _id;

    try {
      _id = typeof id === "string" ? new ObjectId(id) : id;
    } catch {
      return null;
    }

    await col.updateOne(
      { _id },
      {
        $set: {
          ...patch,
          updatedAt: new Date(),
        },
      }
    );

    return await col.findOne({ _id });
  };

  deleteById = async (id) => {
    const col = this._col();
    let _id;

    try {
      _id = typeof id === "string" ? new ObjectId(id) : id;
    } catch {
      return false;
    }

    const r = await col.deleteOne({ _id });
    return r.deletedCount > 0;
  };

  listAdmin = async ({
    search = "",
    status = "todos",
    role = "todos",
    limit = 100,
    skip = 0,
  } = {}) => {
    const col = this._col();
    const query = {};

    if (search && String(search).trim()) {
      const s = escapeRegex(String(search).trim());
      query.$or = [
        { email: { $regex: s, $options: "i" } },
        { inviteeEmailNormalized: { $regex: s, $options: "i" } },
        { "profile.nombre": { $regex: s, $options: "i" } },
        { "profile.apellido": { $regex: s, $options: "i" } },
      ];
    }

    if (status && status !== "todos") {
      query.status = String(status).toLowerCase().trim();
    }

    if (role && role !== "todos") {
      query.role = String(role).toLowerCase().trim();
    }

    const items = await col
      .find(query)
      .sort({ invitedAt: -1, createdAt: -1 })
      .skip(Math.max(Number(skip) || 0, 0))
      .limit(Math.min(Number(limit) || 100, 500))
      .toArray();

    const total = await col.countDocuments(query);

    return { items, total };
  };

  listByCoach = async ({
    coachId,
    search = "",
    status = "todos",
    limit = 100,
    skip = 0,
  } = {}) => {
    const col = this._col();
    const coachValues = idValues(coachId);
    if (!coachValues.length) return { items: [], total: 0 };

    const query = {
      source: "coach_invite",
      $or: [
        { assignedCoachId: { $in: coachValues } },
        { invitedBy: { $in: coachValues }, invitedByType: "coach" },
      ],
    };

    if (search && String(search).trim()) {
      const s = escapeRegex(String(search).trim());
      query.$and = [
        {
          $or: [
            { email: { $regex: s, $options: "i" } },
            { inviteeEmailNormalized: { $regex: s, $options: "i" } },
            { "profile.nombre": { $regex: s, $options: "i" } },
            { "profile.apellido": { $regex: s, $options: "i" } },
          ],
        },
      ];
    }

    if (status && status !== "todos") {
      query.status = String(status).toLowerCase().trim();
    }

    const paging = {
      skip: Math.max(Number(skip) || 0, 0),
      limit: Math.min(Math.max(Number(limit) || 100, 1), 500),
    };

    const [items, total] = await Promise.all([
      col
        .find(query)
        .sort({ invitedAt: -1, createdAt: -1 })
        .skip(paging.skip)
        .limit(paging.limit)
        .toArray(),
      col.countDocuments(query),
    ]);

    return { items, total };
  };

  countPendingByCoach = async (coachId) => {
    const coachValues = idValues(coachId);
    if (!coachValues.length) return 0;

    return await this._col().countDocuments({
      source: "coach_invite",
      status: "pending",
      $or: [
        { assignedCoachId: { $in: coachValues } },
        { invitedBy: { $in: coachValues }, invitedByType: "coach" },
      ],
    });
  };
}

export default ModelMongoDBInvitedUsers;
