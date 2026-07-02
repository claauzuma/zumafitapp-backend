import { ObjectId } from "mongodb";

import ModelMongoDBUsuarios from "../model/DAO/usuariosMongoDB.js";
import ModelMongoDBPlanChangeRequests from "../model/DAO/planChangeRequestsMongoDB.js";
import {
  clientHasCoach,
  getClientNutritionCapabilities,
  normalizeClientPlan,
  normalizeClientRole,
} from "./clientNutritionCapabilities.js";
import { normalizeCoachPlanCode } from "./coachPlans.js";
import { recordAccessAuditEvent } from "./accessAuditEvents.js";

const MS_DAY = 24 * 60 * 60 * 1000;

function token(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_");
}

function idToString(id) {
  return id?.toString?.() || String(id || "");
}

function toObjectIdOrNull(id) {
  const value = idToString(id).trim();
  return value && ObjectId.isValid(value) ? new ObjectId(value) : null;
}

function nowDate(value = null) {
  const date = value ? new Date(value) : new Date();
  return Number.isFinite(date.getTime()) ? date : new Date();
}

export const PERSONAL_PLAN_CATALOG = {
  free: {
    id: "free",
    label: "Free Lite",
    billingOwner: "client",
    price: { amount: 0, currency: "ARS", interval: "month", paymentMode: "free" },
    limits: {
      trackingHistoryDays: 7,
      ownMenus: 1,
      menuDays: 1,
      ownMeals: 5,
      favorites: 3,
      manualObjectiveChangeDays: 30,
      manualObjectiveChangesPerWindow: 2,
    },
    library: "basic",
    nutrition: {
      tracking: true,
      weeklyPlanning: false,
      equivalences: false,
      automaticMeals: false,
      automaticMenus: false,
      mealTargets: false,
      adaptiveSuggestions: false,
      autoCoach: "manual",
    },
    training: {
      manualLog: true,
      automaticRoutine: false,
      loadSuggestions: false,
      adaptiveVolume: false,
      autoCoach: "manual",
    },
  },
  pro: {
    id: "pro",
    label: "Pro",
    billingOwner: "client",
    price: { amount: 14900, currency: "ARS", interval: "month", paymentMode: "manual_request" },
    limits: {
      trackingHistoryDays: null,
      ownMenus: 10,
      menuDays: 7,
      ownMeals: 100,
      favorites: 20,
      manualObjectiveChangeDays: null,
      manualObjectiveChangesPerWindow: null,
    },
    library: "global",
    nutrition: {
      tracking: true,
      weeklyPlanning: true,
      equivalences: true,
      automaticMeals: "coming_soon",
      automaticMenus: "coming_soon",
      mealTargets: true,
      adaptiveSuggestions: "suggestions",
      autoCoach: "suggestions",
    },
    training: {
      manualLog: true,
      automaticRoutine: "coming_soon",
      loadSuggestions: "suggestions",
      adaptiveVolume: false,
      autoCoach: "suggestions",
    },
  },
  vip: {
    id: "vip",
    label: "VIP",
    billingOwner: "client",
    price: { amount: 29900, currency: "ARS", interval: "month", paymentMode: "manual_request" },
    limits: {
      trackingHistoryDays: null,
      ownMenus: 50,
      menuDays: 7,
      ownMeals: 500,
      favorites: 100,
      manualObjectiveChangeDays: null,
      manualObjectiveChangesPerWindow: null,
    },
    library: "premium",
    nutrition: {
      tracking: true,
      weeklyPlanning: true,
      equivalences: true,
      automaticMeals: "coming_soon",
      automaticMenus: "coming_soon",
      mealTargets: true,
      adaptiveSuggestions: "review_required",
      autoCoach: "adaptive_review_required",
    },
    training: {
      manualLog: true,
      automaticRoutine: "coming_soon",
      loadSuggestions: "review_required",
      adaptiveVolume: "review_required",
      autoCoach: "adaptive_review_required",
    },
  },
};

export const PROFESSIONAL_SERVICE_CATALOG = {
  service_pro: {
    id: "service_pro",
    label: "Coach Pro",
    billingOwner: "coach",
    scopes: ["training", "nutrition"],
    library: "global",
    nutrition: {
      coachAuthority: true,
      tracking: true,
      assignedMenus: true,
      adaptiveSuggestions: "coach_supervised",
      autoCoach: "coach_supervised",
    },
    training: {
      coachAuthority: true,
      assignedRoutines: true,
      autoCoach: "coach_supervised",
    },
  },
  service_vip: {
    id: "service_vip",
    label: "Coach VIP",
    billingOwner: "coach",
    scopes: ["training", "nutrition"],
    library: "premium",
    nutrition: {
      coachAuthority: true,
      tracking: true,
      assignedMenus: true,
      adaptiveSuggestions: "ai_assisted_coach_review",
      autoCoach: "ai_assisted_coach_review",
    },
    training: {
      coachAuthority: true,
      assignedRoutines: true,
      autoCoach: "ai_assisted_coach_review",
    },
  },
};

export const PROFESSIONAL_SUBSCRIPTION_CATALOG = {
  coach_initial: {
    id: "coach_initial",
    legacyCode: "trial_pro",
    label: "Coach Inicial",
    clientLimit: 5,
    canOffer: ["service_pro"],
    price: { amount: 29900, currency: "ARS", interval: "month", paymentMode: "manual_request" },
  },
  coach_pro: {
    id: "coach_pro",
    legacyCode: "pro",
    label: "Coach Pro",
    clientLimit: 25,
    canOffer: ["service_pro"],
    price: { amount: 69900, currency: "ARS", interval: "month", paymentMode: "manual_request" },
  },
  coach_ai: {
    id: "coach_ai",
    legacyCode: "vip",
    label: "Coach IA",
    clientLimit: 50,
    canOffer: ["service_pro", "service_vip"],
    price: { amount: 129900, currency: "ARS", interval: "month", paymentMode: "manual_request" },
  },
};

function normalizeProfessionalSubscriptionPlan(plan = "") {
  const normalized = token(plan);
  if (["coach_initial", "initial", "trial_pro", "trial", "free"].includes(normalized)) return "coach_initial";
  if (["coach_pro", "pro", "premium"].includes(normalized)) return "coach_pro";
  if (["coach_ai", "coach_vip", "vip", "premium2"].includes(normalized)) return "coach_ai";
  return "coach_initial";
}

function normalizeServicePackage(value = "") {
  const normalized = token(value);
  if (["service_vip", "coach_vip", "vip"].includes(normalized)) return "service_vip";
  if (["service_pro", "coach_pro", "pro"].includes(normalized)) return "service_pro";
  return "service_pro";
}

function activePersonalSubscription(user = {}, plan = "free", now = new Date()) {
  const current = user.personalSubscription || user.subscription || {};
  const statusRaw = token(current.status || (plan === "free" ? "free" : "active"));
  const status = ["trial", "trialing"].includes(statusRaw) ? "trialing" : statusRaw || (plan === "free" ? "free" : "active");
  const periodEnd = current.currentPeriodEnd || current.paidUntil || current.trialEndsAt || null;
  const currentPeriodEnd = periodEnd ? new Date(periodEnd) : null;
  const expired = currentPeriodEnd && Number.isFinite(currentPeriodEnd.getTime()) && currentPeriodEnd.getTime() < now.getTime();
  return {
    plan,
    status: expired && status !== "free" ? "expired" : status,
    startedAt: current.startedAt || current.trialStartedAt || user.createdAt || null,
    currentPeriodStart: current.currentPeriodStart || current.trialStartedAt || null,
    currentPeriodEnd: currentPeriodEnd && Number.isFinite(currentPeriodEnd.getTime()) ? currentPeriodEnd : null,
    autoRenew: current.autoRenew === true,
    billingOwner: "client",
    provider: current.provider || null,
    updatedAt: current.updatedAt || user.updatedAt || null,
  };
}

function suppressPersonalSubscriptionDuringCoach(subscription = {}, hasCoach = false, personalPlan = "free") {
  if (!hasCoach || !["pro", "vip"].includes(personalPlan)) return subscription;
  if (!["active", "trialing", "cancel_at_period_end"].includes(subscription.status)) return subscription;

  return {
    ...subscription,
    status: subscription.status === "cancel_at_period_end" ? "cancel_at_period_end" : "suppressed_by_coach",
    autoRenew: false,
    suppressedByCoach: true,
    suppressionReason: "coach_service_primary",
  };
}

function normalizePersonalSubscriptionAfterCoach(subscription = {}, hasCoach = false, personalPlan = "free") {
  if (hasCoach) return suppressPersonalSubscriptionDuringCoach(subscription, hasCoach, personalPlan);
  if (subscription.status !== "suppressed_by_coach" && subscription.suppressedByCoach !== true) return subscription;

  return {
    ...subscription,
    status: personalPlan === "free" ? "free" : "active",
    autoRenew: subscription.autoRenew === true && personalPlan !== "free",
    suppressedByCoach: false,
    suppressionReason: null,
  };
}

function resolveTrial(user = {}, now = new Date()) {
  const trial = user.personalTrial || user.trial || {};
  const used = trial.used === true || Boolean(trial.startedAt || trial.endsAt);
  const statusRaw = token(trial.status || (used ? "expired" : "available"));
  const startedAt = trial.startedAt ? new Date(trial.startedAt) : null;
  const endsAt = trial.endsAt ? new Date(trial.endsAt) : null;
  const validEnds = endsAt && Number.isFinite(endsAt.getTime()) ? endsAt : null;
  const active =
    ["active", "trialing"].includes(statusRaw) &&
    validEnds &&
    validEnds.getTime() >= now.getTime();
  const expired = used && validEnds && validEnds.getTime() < now.getTime();
  const status = active
    ? "active"
    : expired
      ? "expired"
      : used
        ? (statusRaw === "cancelled" ? "cancelled" : "used")
        : "available";
  const daysRemaining = active
    ? Math.max(0, Math.ceil((validEnds.getTime() - now.getTime()) / MS_DAY))
    : null;
  const expiryNoticeAcknowledgedAt = trial.expiryNoticeAcknowledgedAt || trial.endedNoticeAcknowledgedAt || null;

  return {
    plan: "pro",
    status,
    active: !!active,
    used: used || !!active,
    startedAt: startedAt && Number.isFinite(startedAt.getTime()) ? startedAt : null,
    endsAt: validEnds,
    expiryNoticeAcknowledgedAt,
    expiryNoticeRequired: status === "expired" && !expiryNoticeAcknowledgedAt,
    daysLeft: daysRemaining ?? 0,
    daysRemaining,
  };
}

function resolveCoachAccess(user = {}) {
  const stored = user.coachAccess || {};
  const statusRaw = token(stored.status || "");
  const terminalStatus = ["ended", "finalized", "finished", "revoked", "unassigned", "inactive", "cancelled", "canceled"].includes(statusRaw);
  const explicitlyClosed = stored.active === false || Boolean(stored.endedAt) || terminalStatus;
  const legacyCoachId = explicitlyClosed
    ? null
    : user?.coach?.entrenadorId || user?.coach?.coachId || user?.coachId || user?.entrenadorId || user?.profesionalId || null;
  const storedCoachId = stored.coachId || stored.profesionalId || null;
  const resolvedCoachId = explicitlyClosed ? null : storedCoachId || legacyCoachId || null;
  const hasLegacyActiveCoach = clientHasCoach(user);
  const status = explicitlyClosed
    ? (terminalStatus && statusRaw ? statusRaw : "ended")
    : statusRaw || (hasLegacyActiveCoach ? "active" : "inactive");
  const active = !explicitlyClosed && Boolean(resolvedCoachId) && status === "active";
  const visible = !explicitlyClosed && (
    Boolean(resolvedCoachId) ||
    ["accepted_pending_activation", "pending_activation", "invited"].includes(status)
  );
  const servicePackage = visible
    ? normalizeServicePackage(stored.servicePackage || stored.package || user?.coach?.servicePackage || "service_pro")
    : null;
  const serviceScopes = Array.isArray(stored.serviceScopes || stored.scopes) && (stored.serviceScopes || stored.scopes).length
    ? (stored.serviceScopes || stored.scopes).map(token).filter(Boolean)
    : visible
      ? ["training", "nutrition"]
      : [];

  return {
    status: active ? "active" : (statusRaw || visible ? status : "inactive"),
    active,
    coachId: idToString(resolvedCoachId) || null,
    servicePackage,
    package: servicePackage,
    label: servicePackage ? PROFESSIONAL_SERVICE_CATALOG[servicePackage]?.label || "Coach Pro" : null,
    serviceScopes,
    scopes: serviceScopes,
    billingOwner: active ? "coach" : "client",
    invitationId: idToString(stored.invitationId || user?.coach?.invitationId) || null,
    startedAt: stored.startedAt || user?.coach?.assignedAt || null,
    endsAt: stored.endsAt || null,
    suspendedAt: stored.suspendedAt || null,
    endedAt: stored.endedAt || null,
    updatedAt: stored.updatedAt || user?.coach?.assignedAt || null,
  };
}

function resolveOnboarding(user = {}) {
  const onboarding = user.onboarding || {};
  const hasOnboardingField = !!user.onboarding && typeof user.onboarding === "object";
  const done =
    onboarding.done === true ||
    onboarding.completed === true ||
    Boolean(onboarding.completedAt) ||
    onboarding.enabled === false ||
    !hasOnboardingField;
  return {
    enabled: onboarding.enabled !== false,
    done,
    completedAt: onboarding.completedAt || onboarding.finishedAt || null,
    proTrialOfferSeenAt: onboarding.proTrialOfferSeenAt || onboarding.trialOfferSeenAt || null,
  };
}

function resolveTrialOffer({
  personalPlan = "free",
  trial = {},
  onboarding = {},
  hasCoach = false,
  coachAccess = {},
} = {}) {
  const coachInviteVisible = ["accepted_pending_activation", "pending_activation", "invited"].includes(
    token(coachAccess?.status)
  );
  const eligible =
    personalPlan === "free" &&
    !hasCoach &&
    !coachInviteVisible &&
    trial.status === "available" &&
    trial.used !== true;
  const showOnboardingOffer = eligible && onboarding.done === true && !onboarding.proTrialOfferSeenAt;

  return {
    eligible,
    showOnboardingOffer,
    reason: eligible
      ? "available"
      : hasCoach
        ? "has_coach"
        : coachInviteVisible
          ? "coach_invitation"
          : personalPlan !== "free"
            ? "not_free"
            : trial.used
              ? "trial_used"
              : trial.status !== "available"
                ? `trial_${trial.status || "unknown"}`
                : "not_available",
  };
}

function futureFeature(mode = "future") {
  return {
    available: false,
    enabled: false,
    status: "coming_soon",
    mode,
  };
}

function blockedFeature(mode = "blocked") {
  return {
    available: false,
    enabled: false,
    status: "blocked",
    mode,
  };
}

function includedFeature(mode = "included") {
  return {
    available: true,
    enabled: true,
    status: "available",
    mode,
  };
}

function buildFeatureAvailability({ planConfig, effectivePersonalPlan, hasCoach, coachAccess, effectiveService } = {}) {
  const isFree = effectivePersonalPlan === "free" && !hasCoach;
  const autoCoachMode = hasCoach
    ? "coach_review"
    : effectivePersonalPlan === "vip"
      ? "adaptive_review"
      : effectivePersonalPlan === "pro"
        ? "suggestions"
        : "disabled";
  const autoCoachAvailability = autoCoachMode === "disabled"
    ? blockedFeature("disabled")
    : futureFeature(autoCoachMode);
  const automaticAvailability = isFree ? blockedFeature("plan_upgrade_required") : futureFeature("generation");

  return {
    nutrition: {
      tracking: includedFeature("manual"),
      ownMenus: hasCoach ? includedFeature("personal_drafts") : includedFeature("personal"),
      weeklyPlanning: planConfig?.nutrition?.weeklyPlanning ? includedFeature("manual") : blockedFeature("plan_upgrade_required"),
      equivalences: planConfig?.nutrition?.equivalences || hasCoach ? includedFeature("manual") : blockedFeature("plan_upgrade_required"),
      mealTargets: planConfig?.nutrition?.mealTargets || hasCoach ? includedFeature("manual") : blockedFeature("plan_upgrade_required"),
      autoMeals: automaticAvailability,
      autoMenus: automaticAvailability,
      autoCoach: autoCoachAvailability,
      coachAssignedMenus: hasCoach ? includedFeature(coachAccess?.servicePackage || "coach") : blockedFeature("no_coach"),
    },
    training: {
      manualLog: includedFeature("manual"),
      routines: {
        generate: isFree ? blockedFeature("plan_upgrade_required") : futureFeature("generation"),
        assigned: hasCoach ? includedFeature(coachAccess?.servicePackage || "coach") : blockedFeature("no_coach"),
      },
      autoCoach: autoCoachAvailability,
    },
    progress: {
      basic: includedFeature("included"),
      fullHistory: isFree && !hasCoach ? blockedFeature("plan_upgrade_required") : includedFeature("included"),
      analytics: effectivePersonalPlan === "vip" || effectiveService?.id === "service_vip"
        ? futureFeature("advanced_analysis")
        : blockedFeature("plan_upgrade_required"),
    },
  };
}

function capabilityFromCatalog(planConfig = {}, baseCapabilities = {}) {
  const nutritionAutoCoach = planConfig.nutrition?.autoCoach;
  const trainingAutoCoach = planConfig.training?.autoCoach;
  return {
    ...baseCapabilities,
    limits: {
      ...(baseCapabilities.limits || {}),
      ownMenus: planConfig.limits?.ownMenus,
      menuDays: planConfig.limits?.menuDays,
      ownMeals: planConfig.limits?.ownMeals,
      favorites: planConfig.limits?.favorites,
      trackingHistoryDays: planConfig.limits?.trackingHistoryDays,
      manualObjectiveChangeDays: planConfig.limits?.manualObjectiveChangeDays,
      manualObjectiveChangesPerWindow: planConfig.limits?.manualObjectiveChangesPerWindow,
    },
    canUseBasicLibrary: ["basic", "global", "premium"].includes(planConfig.library),
    canUseGlobalLibrary: ["global", "premium"].includes(planConfig.library),
    canUsePremiumLibrary: planConfig.library === "premium",
    canGenerateAutomaticMenu: planConfig.nutrition?.automaticMenus === true,
    automaticMenusStatus: planConfig.nutrition?.automaticMenus === "coming_soon" ? "coming_soon" : "blocked",
    automaticRoutineStatus: planConfig.training?.automaticRoutine === "coming_soon" ? "coming_soon" : "blocked",
    canUseEquivalences: planConfig.nutrition?.equivalences === true,
    canUseMealTargets: planConfig.nutrition?.mealTargets === true,
    autoCoachNutrition: nutritionAutoCoach && nutritionAutoCoach !== "manual" ? "coming_soon" : "manual",
    autoCoachNutritionMode: nutritionAutoCoach || "manual",
    autoCoachTraining: trainingAutoCoach && trainingAutoCoach !== "manual" ? "coming_soon" : "manual",
    autoCoachTrainingMode: trainingAutoCoach || "manual",
  };
}

export function resolveClientAccessContext(user = {}, { now = new Date() } = {}) {
  const dateNow = nowDate(now);
  const role = normalizeClientRole(user.role || user.rol || "cliente");
  const legacyPlan = user.plan || "free";
  const personalPlan = normalizeClientPlan(user.personalPlan || legacyPlan || "free");
  const trial = resolveTrial(user, dateNow);
  const effectivePersonalPlan = trial.active ? "pro" : personalPlan;
  const personalPlanConfig = PERSONAL_PLAN_CATALOG[effectivePersonalPlan] || PERSONAL_PLAN_CATALOG.free;
  const coachAccess = resolveCoachAccess(user);
  const hasCoach = coachAccess.active;
  const onboarding = resolveOnboarding(user);
  const trialOffer = resolveTrialOffer({
    personalPlan,
    trial,
    onboarding,
    hasCoach,
    coachAccess,
  });
  const effectiveService = hasCoach ? PROFESSIONAL_SERVICE_CATALOG[coachAccess.servicePackage] : null;
  const featureAvailability = buildFeatureAvailability({
    planConfig: personalPlanConfig,
    effectivePersonalPlan,
    hasCoach,
    coachAccess,
    effectiveService,
  });
  const baseCapabilities = getClientNutritionCapabilities({
    ...user,
    role,
    plan: effectivePersonalPlan,
  });
  const personalCapabilities = capabilityFromCatalog(personalPlanConfig, {
    ...baseCapabilities,
    plan: effectivePersonalPlan,
    personalPlan,
    effectivePersonalPlan,
  });

  const primaryAccess = hasCoach
    ? {
        type: "coach_service",
        id: coachAccess.servicePackage,
        label: effectiveService?.label || "Coach Pro",
        billingOwner: "coach",
        authority: "coach",
      }
    : {
        type: "personal",
        id: effectivePersonalPlan,
        label: personalPlanConfig.label,
        billingOwner: "client",
        authority: "client",
      };
  const mode = hasCoach ? "coach" : "self_managed";
  const coachScopeSet = new Set((coachAccess.serviceScopes || []).map(token).filter(Boolean));
  const coachControlsNutrition = hasCoach && coachScopeSet.has("nutrition");
  const coachControlsTraining = hasCoach && coachScopeSet.has("training");
  const billing = {
    owner: hasCoach ? "coach" : personalPlan === "free" ? "none" : "client",
    coachFunded: hasCoach,
    personalRenewalStatus: hasCoach
      ? (["pro", "vip"].includes(personalPlan) ? "suppressed" : "not_applicable")
      : ["pro", "vip"].includes(personalPlan)
        ? "active"
        : "not_applicable",
  };
  const authority = {
    nutrition: coachControlsNutrition ? "coach" : "client",
    training: coachControlsTraining ? "coach" : "client",
    goals: coachControlsNutrition ? "coach" : "client",
    autoCoach: hasCoach ? "coach_review" : "disabled",
  };
  const personalSubscription = normalizePersonalSubscriptionAfterCoach(
    activePersonalSubscription(user, personalPlan, dateNow),
    hasCoach,
    personalPlan
  );
  const personalAccess = {
    basePlan: personalPlan,
    effectivePlan: effectivePersonalPlan,
    source: trial.active ? "trial" : "personal",
    subscriptionStatus: personalSubscription.status,
    trial,
  };
  const effectiveAccess = hasCoach
    ? {
        id: coachAccess.servicePackage,
        label: effectiveService?.label || "Coach Pro",
        source: "coach",
      }
    : {
        id: effectivePersonalPlan,
        label: personalPlanConfig.label,
        source: trial.active ? "trial" : "personal",
      };

  const statusWarnings = [];
  if (hasCoach && ["pro", "vip"].includes(personalPlan)) {
    statusWarnings.push({
      code: "PERSONAL_PLAN_SHOULD_NOT_RENEW_WHILE_COACHED",
      message: "El cliente tiene coach activo; la renovacion personal debe quedar pausada o gestionada manualmente.",
    });
  }

  return {
    userId: idToString(user._id || user.id),
    role,
    mode,
    billing,
    personalAccess,
    personalPlan,
    legacyPlan,
    effectivePersonalPlan,
    accessSource: trial.active ? "trial" : "personal",
    clientType: hasCoach ? "with_coach" : "self_managed",
    hasCoach,
    managedByCoach: hasCoach,
    activeCoach: hasCoach ? { id: coachAccess.coachId } : null,
    coachService: hasCoach
      ? {
          id: coachAccess.servicePackage,
          label: effectiveService?.label || "Coach Pro",
          scopes: coachAccess.serviceScopes,
        }
      : null,
    billingSource: billing.owner === "coach" ? "coach" : "personal",
    coachScopes: {
      nutrition: coachControlsNutrition,
      training: coachControlsTraining,
    },
    effectiveAccess,
    authority,
    primaryAccess,
    personalSubscription,
    trial,
    trialOffer,
    onboarding,
    coachAccess,
    professionalService: effectiveService,
    capabilities: hasCoach
      ? {
          ...personalCapabilities,
          primaryAuthority: "coach",
          canTrack: true,
          canUseAssignedCoachContent: true,
          servicePackage: coachAccess.servicePackage,
          serviceLabel: effectiveService?.label || "Coach Pro",
          autoCoachNutrition: "coming_soon",
          autoCoachNutritionMode: "coach_review",
          autoCoachTraining: "coming_soon",
          autoCoachTrainingMode: "coach_review",
        }
      : personalCapabilities,
    limits: personalPlanConfig.limits,
    usage: {},
    featureAvailability,
    catalogs: {
      personalPlans: PERSONAL_PLAN_CATALOG,
      professionalServices: PROFESSIONAL_SERVICE_CATALOG,
      professionalSubscriptions: PROFESSIONAL_SUBSCRIPTION_CATALOG,
    },
    comingSoon: {
      automaticMenus: personalPlanConfig.nutrition?.automaticMenus === "coming_soon",
      automaticRoutine: personalPlanConfig.training?.automaticRoutine === "coming_soon",
      adaptiveNutritionRequiresReview: ["review_required", "adaptive_review_required"].includes(personalPlanConfig.nutrition?.autoCoach),
      adaptiveTrainingRequiresReview: ["review_required", "adaptive_review_required"].includes(personalPlanConfig.training?.autoCoach),
    },
    statusWarnings,
    generatedAt: dateNow,
  };
}

class ServicioClientAccessContext {
  constructor() {
    this.usuariosModel = new ModelMongoDBUsuarios();
    this.planChangeRequestsModel = new ModelMongoDBPlanChangeRequests();
  }

  async _actor(user = {}) {
    const userId = user?.id || user?._id;
    if (!userId) throw this._error("NO_AUTENTICADO", "No autenticado");
    const dbUser =
      typeof this.usuariosModel.obtenerAccessContextPorId === "function"
        ? await this.usuariosModel.obtenerAccessContextPorId(userId)
        : await this.usuariosModel.obtenerPorId(userId);
    if (!dbUser) throw this._error("NO_AUTENTICADO", "No autenticado");
    const role = normalizeClientRole(dbUser.role || dbUser.rol || user.role);
    if (role !== "cliente") throw this._error("USER_NOT_CLIENT", "Esta seccion es solo para clientes");
    return dbUser;
  }

  _error(code, publicMessage, extra = {}) {
    const error = new Error(code);
    error.code = code;
    error.publicMessage = publicMessage || code;
    Object.assign(error, extra);
    return error;
  }

  async _contextWithPendingRequest(actor) {
    const context = resolveClientAccessContext(actor);
    if (typeof this.planChangeRequestsModel.findPendingByUser !== "function") return context;
    const pending = await this.planChangeRequestsModel.findPendingByUser(actor._id).catch(() => null);
    return {
      ...context,
      planChangeRequests: {
        pending: pending
          ? {
              id: idToString(pending._id || pending.id),
              requestedPlan: normalizeClientPlan(pending.requestedPlan),
              status: pending.status || "pending",
              createdAt: pending.createdAt || null,
              updatedAt: pending.updatedAt || null,
            }
          : null,
      },
    };
  }

  async getContext(user) {
    const actor = await this._actor(user);
    return await this._contextWithPendingRequest(actor);
  }

  async startProTrial(user) {
    const actor = await this._actor(user);
    const currentContext = resolveClientAccessContext(actor);
    if (currentContext.hasCoach) {
      throw this._error("TRIAL_NOT_AVAILABLE_WITH_COACH", "La prueba Pro es para clientes autogestionados");
    }
    if (currentContext.personalPlan !== "free") {
      throw this._error("TRIAL_NOT_AVAILABLE_FOR_PLAN", "La prueba Pro esta disponible solo para clientes Free");
    }
    if (currentContext.trial.active) {
      throw this._error("TRIAL_ALREADY_ACTIVE", "Ya tenes una prueba Pro activa");
    }
    if (currentContext.trial.used) {
      throw this._error("TRIAL_ALREADY_USED", "La prueba Pro ya fue utilizada");
    }

    const now = new Date();
    const endsAt = new Date(now.getTime() + 14 * MS_DAY);
    const nextTrial = {
      plan: "pro",
      status: "active",
      used: true,
      startedAt: now,
      endsAt,
      activatedBy: "client",
      updatedAt: now,
    };

    const updated = await this.usuariosModel.updateById(idToString(actor._id), {
      personalTrial: nextTrial,
      trial: nextTrial,
      personalPlan: currentContext.personalPlan || normalizeClientPlan(actor.plan || "free"),
      "personalSubscription.plan": currentContext.personalPlan || normalizeClientPlan(actor.plan || "free"),
      "personalSubscription.status": currentContext.personalPlan === "free" ? "free" : "active",
      "personalSubscription.billingOwner": "client",
      "onboarding.proTrialOfferSeenAt": now,
    });

    await recordAccessAuditEvent({
      subjectType: "client",
      subjectId: actor._id,
      actorType: "client",
      actorId: actor._id,
      event: "trial_activated",
      previousValue: { trial: currentContext.trial },
      nextValue: { trial: nextTrial },
      reason: "client_started_pro_trial",
      metadata: { source: "access_context" },
    });

    return {
      accessContext: await this._contextWithPendingRequest(updated),
    };
  }

  async acknowledgeTrialOnboardingOffer(user) {
    const actor = await this._actor(user);
    const now = new Date();
    const updated = await this.usuariosModel.updateById(idToString(actor._id), {
      "onboarding.proTrialOfferSeenAt": now,
    });
    return {
      accessContext: await this._contextWithPendingRequest(updated),
    };
  }

  async acknowledgeTrialExpiryNotice(user) {
    const actor = await this._actor(user);
    const now = new Date();
    const updated = await this.usuariosModel.updateById(idToString(actor._id), {
      "personalTrial.expiryNoticeAcknowledgedAt": now,
      "trial.expiryNoticeAcknowledgedAt": now,
    });
    return {
      accessContext: await this._contextWithPendingRequest(updated),
    };
  }

  async createPlanChangeRequest(user, payload = {}) {
    const actor = await this._actor(user);
    const context = resolveClientAccessContext(actor);
    const requestedPlan = normalizeClientPlan(payload.requestedPlan || payload.plan);
    if (!["pro", "vip"].includes(requestedPlan)) {
      throw this._error("PLAN_INVALIDO", "Plan invalido");
    }
    if (requestedPlan === context.personalPlan && !context.hasCoach) {
      throw this._error("PLAN_ALREADY_ACTIVE", "Ya estas usando ese plan");
    }

    if (typeof this.planChangeRequestsModel.findPendingByUserAndPlan === "function") {
      const existing = await this.planChangeRequestsModel.findPendingByUserAndPlan(actor._id, requestedPlan);
      if (existing) {
        return {
          request: existing,
          pendingAlreadyExists: true,
          accessContext: await this._contextWithPendingRequest(actor),
        };
      }
    }

    const request = await this.planChangeRequestsModel.create({
      userId: toObjectIdOrNull(actor._id) || idToString(actor._id),
      userEmail: actor.email || null,
      requestedPlan,
      currentPersonalPlan: context.personalPlan,
      effectivePersonalPlan: context.effectivePersonalPlan,
      hasCoach: context.hasCoach,
      coachId: context.coachAccess?.coachId || null,
      status: "pending",
      paymentMode: "manual_request",
      source: "client_plans_page",
      note: String(payload.note || "").trim().slice(0, 1000),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await recordAccessAuditEvent({
      subjectType: "client",
      subjectId: actor._id,
      actorType: "client",
      actorId: actor._id,
      event: "personal_plan_change_requested",
      previousValue: { personalPlan: context.personalPlan },
      nextValue: { requestedPlan },
      reason: "client_requested_plan_change",
      metadata: { requestId: request?._id || request?.id || null },
    });

    return {
      request,
      pendingAlreadyExists: false,
      accessContext: await this._contextWithPendingRequest(actor),
    };
  }
}

export function canCoachOfferServicePackage(coach = {}, servicePackage = "service_pro") {
  const subscriptionPlan = normalizeProfessionalSubscriptionPlan(
    coach?.coachSubscription?.plan || normalizeCoachPlanCode(coach?.plan)
  );
  const allowed = PROFESSIONAL_SUBSCRIPTION_CATALOG[subscriptionPlan]?.canOffer || ["service_pro"];
  return allowed.includes(normalizeServicePackage(servicePackage));
}

export default ServicioClientAccessContext;
