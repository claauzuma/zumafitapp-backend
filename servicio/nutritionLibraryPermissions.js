import { ObjectId } from "mongodb";

import {
  idToString,
  isAdmin,
  isCoach,
  isClient,
  normalizePlan,
  normalizeRole,
} from "./comidasGuardadasPermisos.js";
import { getClientNutritionLimitsForPlan } from "./clientNutritionCapabilities.js";
import {
  canUseProfessionalTemplate,
  normalizeProfessionalLibraryPlan,
  professionalTemplateSource,
  resolveProfessionalLibraryCapabilities,
} from "./professionalLibraryCapabilities.js";

export const NUTRITION_LIBRARY_LIMITS = {
  cliente: {
    free: {
      maxComidasPropias: 5,
      maxMenusPropios: 1,
      adminLibrary: "basic",
      premiumLibrary: false,
      canImportExcel: false,
      canAssignToClients: false,
    },
    pro: {
      maxComidasPropias: 100,
      maxMenusPropios: 10,
      adminLibrary: "global",
      premiumLibrary: false,
      canImportExcel: false,
      canAssignToClients: false,
    },
    vip: {
      maxComidasPropias: 200,
      maxMenusPropios: 50,
      adminLibrary: "full",
      premiumLibrary: true,
      canImportExcel: false,
      canAssignToClients: false,
    },
  },
  coach: {
    free: {
      maxComidasPropias: 30,
      maxMenusPropios: 10,
      adminLibrary: "basic",
      premiumLibrary: false,
      canImportExcel: false,
      canAssignToClients: true,
    },
    pro: {
      maxComidasPropias: 300,
      maxMenusPropios: 100,
      adminLibrary: "global",
      premiumLibrary: false,
      canImportExcel: true,
      canAssignToClients: true,
    },
    vip: {
      maxComidasPropias: 1000,
      maxMenusPropios: 500,
      adminLibrary: "full",
      premiumLibrary: true,
      canImportExcel: true,
      canAssignToClients: true,
    },
  },
  admin: {
    vip: {
      maxComidasPropias: Number.POSITIVE_INFINITY,
      maxMenusPropios: Number.POSITIVE_INFINITY,
      adminLibrary: "full",
      premiumLibrary: true,
      canImportExcel: true,
      canAssignToClients: true,
    },
  },
};

const PLAN_RANK = {
  free: 0,
  pro: 1,
  vip: 2,
  coach: 2,
  nutri: 2,
  trainernutri: 2,
  trainer_nutri: 2,
  gym: 2,
  admin: 2,
};

export function cleanId(value = "") {
  return String(value || "").trim();
}

export function idValues(id) {
  const value = cleanId(id);
  const values = [];
  if (value) values.push(value);
  if (ObjectId.isValid(value)) values.push(new ObjectId(value));
  return values;
}

export function toMongoIdOrString(id) {
  const value = cleanId(id);
  if (!value) return null;
  return ObjectId.isValid(value) ? new ObjectId(value) : value;
}

export function libraryUserId(user = {}) {
  return idToString(user?._id || user?.id || user?.userId);
}

export function normalizeOwnerType(value = "") {
  const raw = String(value || "").trim().toLowerCase();
  if (["admin", "zumafit"].includes(raw)) return "admin";
  if (["coach", "nutri", "nutritionist", "trainer", "entrenador", "nutricionista", "trainernutri", "trainer_nutri"].includes(raw)) {
    return "coach";
  }
  if (["cliente", "client", "customer", "user", "usuario"].includes(raw)) return "cliente";
  return raw || "cliente";
}

export function ownerTypeForUser(user = {}) {
  const role = normalizeRole(user);
  if (role === "admin") return "admin";
  if (role === "coach") return "coach";
  return "cliente";
}

export function normalizeVisibility(value = "") {
  const raw = String(value || "").trim();
  const token = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  if (["publica", "publico", "sistema", "global"].includes(token)) return "global";
  if (["premium", "vip"].includes(token)) return "premium";
  if (["solo_coaches", "coaches", "coach", "solo_profesionales"].includes(token)) return "solo_coaches";
  if (["solo_clientes", "clientes", "cliente"].includes(token)) return "solo_clientes";
  if (["clientesasignados", "clientes_asignados", "asignada", "asignado"].includes(token)) return "asignada";
  if (["gimnasio", "gym"].includes(token)) return "gimnasio";
  return "privada";
}

export function planTier(user = {}) {
  if (isAdmin(user)) return "vip";
  if (isCoach(user)) {
    const professionalPlan = normalizeProfessionalLibraryPlan(
      user?.effectiveCapabilities?.professionalSubscription?.plan ||
      user?.coachSubscription?.plan ||
      user?.professionalPlan ||
      user?.plan
    );
    if (professionalPlan === "coach_ai") return "vip";
    if (professionalPlan === "coach_pro") return "pro";
    return "free";
  }
  const trial = user?.personalTrial || user?.trial || {};
  const trialEndsAt = trial?.endsAt ? new Date(trial.endsAt) : null;
  const trialActive =
    ["active", "trialing"].includes(String(trial?.status || "").trim().toLowerCase()) &&
    trialEndsAt &&
    Number.isFinite(trialEndsAt.getTime()) &&
    trialEndsAt.getTime() >= Date.now();
  const plan = trialActive ? "pro" : normalizePlan({
    ...user,
    plan: user?.personalPlan || user?.plan || user?.personalSubscription?.plan || user?.subscription?.planCode,
  });
  if (plan === "vip") return "vip";
  if (plan === "pro") return "pro";
  if (["coach", "nutri", "trainernutri", "trainer_nutri", "gym", "admin"].includes(plan)) return "vip";
  return "free";
}

export function planAllows(user = {}, planMinimo = "free") {
  if (isAdmin(user)) return true;
  const required = PLAN_RANK[String(planMinimo || "free").trim().toLowerCase()] ?? 0;
  const current = PLAN_RANK[planTier(user)] ?? 0;
  return current >= required;
}

export function getNutritionLibraryLimits(user = {}) {
  if (isAdmin(user)) return NUTRITION_LIBRARY_LIMITS.admin.vip;
  if (isClient(user)) {
    const limits = getClientNutritionLimitsForPlan(planTier(user));
    return {
      maxComidasPropias: limits.ownMealsLimit,
      maxMenusPropios: limits.ownMenusLimit,
      adminLibrary: limits.premiumLibrary ? "full" : limits.globalLibrary ? "global" : "basic",
      premiumLibrary: !!limits.premiumLibrary,
      canImportExcel: false,
      canAssignToClients: false,
    };
  }
  const role = "coach";
  const plan = planTier(user);
  const effectiveLimits = user?.effectiveCapabilities?.limits || {};
  return {
    ...(NUTRITION_LIBRARY_LIMITS[role]?.[plan] || NUTRITION_LIBRARY_LIMITS[role]?.free),
    ...(Number.isFinite(Number(effectiveLimits.maxCoachOwnedMeals))
      ? { maxComidasPropias: Number(effectiveLimits.maxCoachOwnedMeals) }
      : {}),
    ...(Number.isFinite(Number(effectiveLimits.maxCoachOwnedMenus))
      ? { maxMenusPropios: Number(effectiveLimits.maxCoachOwnedMenus) }
      : {}),
    ...resolveProfessionalLibraryCapabilities(user),
  };
}

export function isOwner(user = {}, item = {}) {
  if (!item) return false;
  const userId = libraryUserId(user);
  if (!userId) return false;
  return idToString(item.ownerId || item.userId) === userId;
}

export function isAdminOwned(item = {}) {
  return normalizeOwnerType(item.ownerType || item.ownerRole || item.creadaPorRol) === "admin";
}

export function assignmentMatchesUser(userOrId = {}, entry = {}, type = "client") {
  const userId = typeof userOrId === "string" ? userOrId : libraryUserId(userOrId);
  if (!userId) return false;
  if (entry && typeof entry === "object" && !Array.isArray(entry)) {
    const key = type === "coach" ? "coachId" : "clienteId";
    return idToString(entry[key] || entry.userId || entry.id) === userId;
  }
  return idToString(entry) === userId;
}

function currentCoachIdForClient(user = {}) {
  return idToString(
    user?.coach?.entrenadorId ||
    user?.coach?.coachId ||
    user?.coachId ||
    user?.entrenadorId ||
    user?.profesionalId ||
    ""
  );
}

function assignmentMatchesClientAndCoach(user = {}, entry = {}) {
  const userId = libraryUserId(user);
  const coachId = currentCoachIdForClient(user);
  if (!userId || !coachId) return false;
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;

  const assignedClientId = idToString(entry.clienteId || entry.userId || entry.id);
  const assignedCoachId = idToString(entry.coachId || entry.assignedBy || entry.creadaPorUserId);
  return assignedClientId === userId && assignedCoachId === coachId;
}

export function isAssignedToClient(userOrId = {}, item = {}, field = "asignadaA") {
  const list = Array.isArray(item?.[field]) ? item[field] : [];
  if (typeof userOrId !== "string" && isClient(userOrId)) {
    return list.some((entry) => assignmentMatchesClientAndCoach(userOrId, entry));
  }
  return list.some((entry) => assignmentMatchesUser(userOrId, entry, "client"));
}

export function isAssignedByCoach(userOrId = {}, item = {}, field = "asignadaA") {
  const list = Array.isArray(item?.[field]) ? item[field] : [];
  return list.some((entry) => assignmentMatchesUser(userOrId, entry, "coach"));
}

export function isFavoriteForUser(user = {}, item = {}, field = "favoritaPara") {
  const userId = libraryUserId(user);
  if (!userId) return false;
  const list = Array.isArray(item?.[field]) ? item[field] : [];
  return list.some((entry) => idToString(entry) === userId);
}

export function canUseAdminNutritionLibrary(user = {}, item = {}, { kind = "" } = {}) {
  if (!isAdminOwned(item)) return false;
  if (isAdmin(user)) return true;

  if (isCoach(user)) {
    const itemKind = kind || (Array.isArray(item?.comidas) || item?.kcalObjetivo !== undefined ? "menu" : "meal");
    if (!canUseProfessionalTemplate(user, item, itemKind)) return false;
  }

  const rawVisibility = String(item.visibilidad || item.visibility || "");
  const normalizedRaw = rawVisibility
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  const visibility = normalizedRaw === "clientesasignados" || normalizedRaw === "clientes_asignados"
    ? "solo_clientes"
    : normalizeVisibility(rawVisibility);
  const minimumPlan = item.planMinimo || item.plan || "free";
  if (!planAllows(user, minimumPlan)) return false;

  if (visibility === "global") return true;
  if (visibility === "premium") return planTier(user) === "vip";
  if (visibility === "solo_coaches") return isCoach(user) && planTier(user) !== "free";
  if (visibility === "solo_clientes") return isClient(user) && planTier(user) === "vip";
  return false;
}

export function canViewNutritionItem(user = {}, item = {}, { assignmentField = "asignadaA", kind = "" } = {}) {
  if (!item) return false;
  if (isAdmin(user)) return true;
  if (item.activo === false || item.activa === false || item.estado === "inactivo") return false;
  if (isOwner(user, item)) return true;
  if (isClient(user) && isAssignedToClient(user, item, assignmentField)) return true;
  if (isCoach(user) && isAssignedByCoach(user, item, assignmentField)) return true;
  return canUseAdminNutritionLibrary(user, item, { kind });
}

export function canEditNutritionItem(user = {}, item = {}) {
  if (!item) return false;
  if (isAdmin(user)) return true;
  return isOwner(user, item);
}

export function canCopyNutritionItem(user = {}, item = {}, options = {}) {
  if (!canViewNutritionItem(user, item, options) || isOwner(user, item)) return false;
  if (isCoach(user) && isAdminOwned(item)) {
    return resolveProfessionalLibraryCapabilities(user).canDuplicateGlobalTemplates === true;
  }
  return true;
}

export function canAssignNutritionItem(user = {}, item = {}, options = {}) {
  if (!item) return false;
  if (isAdmin(user)) return true;
  if (!isCoach(user)) return false;
  if (!getNutritionLibraryLimits(user)?.canAssignToClients) return false;
  if (isOwner(user, item)) return true;
  if (isAdminOwned(item)) {
    return (
      resolveProfessionalLibraryCapabilities(user).canAssignGlobalTemplates === true &&
      canUseAdminNutritionLibrary(user, item, options)
    );
  }
  return professionalTemplateSource(item) === "assigned_snapshot" && canViewNutritionItem(user, item, options);
}

export function buildOwnerQuery(user = {}) {
  const userId = libraryUserId(user);
  if (isAdmin(user)) {
    return {
      $or: [
        { ownerType: "admin" },
        { ownerRole: "admin" },
        { creadaPorRol: "admin" },
      ],
    };
  }
  return {
    ownerId: { $in: idValues(userId) },
  };
}

export function buildAssignedQuery(user = {}, field = "asignadaA") {
  const userId = libraryUserId(user);
  if (!userId) return { _id: null };

  if (isCoach(user)) {
    return {
      $or: [
        { [`${field}.coachId`]: { $in: idValues(userId) } },
        { [`${field}.assignedBy`]: { $in: idValues(userId) } },
      ],
    };
  }

  if (isClient(user)) {
    const coachId = currentCoachIdForClient(user);
    if (!coachId) return { _id: null };
    const userIds = idValues(userId);
    const coachIds = idValues(coachId);
    return {
      $or: [
        { [field]: { $elemMatch: { clienteId: { $in: userIds }, coachId: { $in: coachIds } } } },
        { [field]: { $elemMatch: { userId: { $in: userIds }, coachId: { $in: coachIds } } } },
        { [field]: { $elemMatch: { id: { $in: userIds }, coachId: { $in: coachIds } } } },
        { [field]: { $elemMatch: { clienteId: { $in: userIds }, assignedBy: { $in: coachIds } } } },
        { [field]: { $elemMatch: { userId: { $in: userIds }, assignedBy: { $in: coachIds } } } },
      ],
    };
  }

  return {
    $or: [
      { [field]: { $in: idValues(userId) } },
      { [`${field}.clienteId`]: { $in: idValues(userId) } },
      { [`${field}.userId`]: { $in: idValues(userId) } },
    ],
  };
}

export function buildAdminLibraryQuery(user = {}, { kind = "" } = {}) {
  if (isAdmin(user)) return buildOwnerQuery(user);

  if (isCoach(user)) {
    const capabilities = resolveProfessionalLibraryCapabilities(user);
    const meal = String(kind || "").toLowerCase().startsWith("meal") || String(kind || "").toLowerCase().startsWith("comida");
    const canUseGlobal = meal
      ? capabilities.canUseGlobalMealTemplates === true
      : capabilities.canUseGlobalMenuTemplates === true;
    if (!canUseGlobal) return { _id: null };
  }

  const allowedVisibility = ["global"];
  if (planTier(user) === "vip") allowedVisibility.push("premium");
  if (isCoach(user) && planTier(user) !== "free") allowedVisibility.push("solo_coaches", "coaches");
  if (isClient(user) && planTier(user) === "vip") allowedVisibility.push("solo_clientes", "clientesAsignados");
  if (allowedVisibility.includes("global")) allowedVisibility.push("publica", "sistema");

  const allowedPlans = ["free"];
  if (planTier(user) !== "free") allowedPlans.push("pro");
  if (planTier(user) === "vip") allowedPlans.push("vip");
  const allowedTemplateTiers = ["global_basic"];
  if (planTier(user) !== "free") allowedTemplateTiers.push("global_pro");
  if (planTier(user) === "vip") allowedTemplateTiers.push("global_premium");

  return {
    $and: [
      buildOwnerQuery({ role: "admin", id: libraryUserId(user) }),
      { visibilidad: { $in: allowedVisibility } },
      {
        $or: [
          { templateTier: { $in: allowedTemplateTiers } },
          {
            $and: [
              { $or: [{ templateTier: { $exists: false } }, { templateTier: null }] },
              {
                $or: [
                  { planMinimo: { $in: allowedPlans } },
                  { planMinimo: { $exists: false } },
                  { planMinimo: null },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

export function activeQuery() {
  return {
    $and: [
      { activo: { $ne: false } },
      { activa: { $ne: false } },
      { estado: { $ne: "inactivo" } },
    ],
  };
}

export function mergeAndQuery(...queries) {
  const parts = queries.filter((query) => query && Object.keys(query).length);
  if (!parts.length) return {};
  if (parts.length === 1) return parts[0];
  return { $and: parts };
}

export function mergeOrQuery(...queries) {
  const parts = queries.filter((query) => query && Object.keys(query).length);
  if (!parts.length) return {};
  return { $or: parts };
}
