import { accessError } from "./accessGates.js";

const MS_DAY = 24 * 60 * 60 * 1000;

function token(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_");
}

function toDateOrNull(value) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
}

export const PROFESSIONAL_SUBSCRIPTION_PLANS = {
  coach_initial: {
    id: "coach_initial",
    legacyPlan: "trial_pro",
    label: "Inicial",
    clientLimit: 3,
    canOffer: ["service_pro"],
    graceDays: 7,
  },
  coach_pro: {
    id: "coach_pro",
    legacyPlan: "pro",
    label: "Pro",
    clientLimit: 25,
    canOffer: ["service_pro"],
    graceDays: 7,
  },
  coach_ai: {
    id: "coach_ai",
    legacyPlan: "vip",
    label: "VIP",
    clientLimit: 100,
    canOffer: ["service_pro", "service_vip"],
    graceDays: 7,
  },
};

export function normalizeProfessionalSubscriptionPlan(value = "") {
  const normalized = token(value);
  if (["coach_initial", "initial", "trial", "trial_pro", "free"].includes(normalized)) return "coach_initial";
  if (["coach_pro", "pro", "premium"].includes(normalized)) return "coach_pro";
  if (["coach_ai", "coach_vip", "vip", "premium2"].includes(normalized)) return "coach_ai";
  return null;
}

export function normalizeProfessionalStatus(value = "") {
  const normalized = token(value);
  if (["corrections_required", "correccion_requerida", "correcciones"].includes(normalized)) return "corrections_required";
  if (["approved", "aprobado", "active", "activo"].includes(normalized)) return "approved";
  if (["rejected", "rechazado"].includes(normalized)) return "rejected";
  if (["suspended", "suspendido", "bloqueado"].includes(normalized)) return "suspended";
  return "pending_verification";
}

export function professionalScopesFor(user = {}) {
  const explicit = user.professionalScopes || user.approvedScopes || null;
  if (explicit && typeof explicit === "object") {
    return {
      training: explicit.training === true,
      nutrition: explicit.nutrition === true,
      explicit: true,
    };
  }

  const specialties = user?.coachProfile?.specialties || {};
  return {
    training: specialties.training === true,
    nutrition: specialties.nutrition === true,
    explicit: false,
  };
}

export function professionalIsApproved(user = {}) {
  const raw = user.professionalStatus || user.coachProfile?.status || null;
  if (!raw) return true; // compatibilidad con coaches legacy creados antes del flujo de verificacion
  return normalizeProfessionalStatus(raw) === "approved";
}

export function requireProfessionalScope(user = {}, scope = "nutrition") {
  if (!professionalIsApproved(user)) {
    throw accessError("PROFESSIONAL_NOT_APPROVED", "Tu perfil profesional todavia no esta aprobado", {
      scope,
      status: normalizeProfessionalStatus(user.professionalStatus || user.coachProfile?.status),
    });
  }

  const scopes = professionalScopesFor(user);
  if (scopes[scope] !== true) {
    throw accessError("PROFESSIONAL_SCOPE_REQUIRED", "Tu perfil profesional no tiene este alcance aprobado", {
      scope,
    });
  }

  return scopes;
}

export function normalizeCoachSubscription(user = {}, { now = new Date() } = {}) {
  const stored = user.coachSubscription || {};
  const plan =
    normalizeProfessionalSubscriptionPlan(stored.plan || stored.requestedPlan || user.plan) ||
    "coach_initial";
  const config = PROFESSIONAL_SUBSCRIPTION_PLANS[plan] || PROFESSIONAL_SUBSCRIPTION_PLANS.coach_initial;
  const hasExplicit = !!user.coachSubscription;
  const currentPeriodEnd = toDateOrNull(stored.currentPeriodEnd || stored.endsAt || user.subscription?.paidUntil);
  const startedAt = toDateOrNull(stored.startedAt || user.subscription?.startedAt || user.createdAt);
  const graceEndsAt =
    toDateOrNull(stored.graceEndsAt) ||
    (stored.status === "past_due" && currentPeriodEnd
      ? new Date(currentPeriodEnd.getTime() + Number(config.graceDays || 7) * MS_DAY)
      : null);
  const rawStatus = token(stored.status || user.subscription?.status || (hasExplicit ? "pending" : "active"));
  const isTrial = rawStatus === "trial" || rawStatus === "trialing";
  let status = rawStatus || "pending";
  if (isTrial) status = "active";
  if (status === "cancel_at_period_end" && currentPeriodEnd && currentPeriodEnd.getTime() < now.getTime()) status = "expired";
  if (status === "past_due" && graceEndsAt && graceEndsAt.getTime() < now.getTime()) status = "expired";

  return {
    plan,
    label: config.label,
    status,
    isTrial,
    active: ["active", "cancel_at_period_end"].includes(status),
    canInviteOrActivate: ["active", "cancel_at_period_end"].includes(status),
    inGrace: status === "past_due" && graceEndsAt && graceEndsAt.getTime() >= now.getTime(),
    startedAt,
    currentPeriodEnd,
    graceEndsAt,
    clientLimit: Number(stored.clientLimit ?? config.clientLimit),
    canOffer: Array.isArray(stored.canOffer) && stored.canOffer.length ? stored.canOffer : config.canOffer,
    updatedAt: stored.updatedAt || null,
    explicit: hasExplicit,
  };
}

export function requireCoachSubscriptionActive(user = {}, { action = "operate", now = new Date() } = {}) {
  const subscription = normalizeCoachSubscription(user, { now });
  if (subscription.canInviteOrActivate) return subscription;

  throw accessError("COACH_SUBSCRIPTION_REQUIRED", "Necesitas una suscripcion profesional activa", {
    status: subscription.status,
    plan: subscription.plan,
    domain: action,
  });
}

export function requireCoachCanOfferService(user = {}, servicePackage = "service_pro") {
  const subscription = requireCoachSubscriptionActive(user, { action: "service_package" });
  if (!subscription.canOffer.includes(servicePackage)) {
    throw accessError("COACH_SERVICE_PACKAGE_NOT_ALLOWED", "Tu plan profesional no permite ofrecer ese servicio", {
      plan: subscription.plan,
      feature: servicePackage,
      requiredPlan: servicePackage === "service_vip" ? "coach_ai" : "coach_initial",
    });
  }
  return subscription;
}

export function professionalSubscriptionPatch(plan, { status = "active", now = new Date(), currentPeriodEnd = null, clientLimit = null } = {}) {
  const normalizedPlan = normalizeProfessionalSubscriptionPlan(plan);
  if (!normalizedPlan) throw new Error("PLAN_INVALIDO");
  const config = PROFESSIONAL_SUBSCRIPTION_PLANS[normalizedPlan];
  const periodEnd = toDateOrNull(currentPeriodEnd);
  return {
    plan: normalizedPlan,
    status,
    startedAt: now,
    currentPeriodEnd: periodEnd,
    graceEndsAt: status === "past_due" && periodEnd ? new Date(periodEnd.getTime() + Number(config.graceDays || 7) * MS_DAY) : null,
    clientLimit: clientLimit === null || clientLimit === undefined ? config.clientLimit : Number(clientLimit),
    canOffer: config.canOffer,
    updatedAt: now,
  };
}
