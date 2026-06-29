import { resolveClientAccessContext } from "./clientAccessContext.js";
import { normalizeClientRole } from "./clientNutritionCapabilities.js";

const MS_DAY = 24 * 60 * 60 * 1000;
const FREE_GOALS_CHANGE_LIMIT = 2;

const RESOURCE_LIMIT_KEYS = {
  ownMenus: "ownMenus",
  menuDays: "menuDays",
  ownMeals: "ownMeals",
  favorites: "favorites",
  trackingHistoryDays: "trackingHistoryDays",
  manualObjectiveChangeDays: "manualObjectiveChangeDays",
};

const FEATURE_REQUIRED_PLAN = {
  "nutrition.tracking.fullHistory": "pro",
  "nutrition.equivalences": "pro",
  "nutrition.plannedVsConsumed": "pro",
  "nutrition.autoMenus": "pro",
  "nutrition.autoMeals": "pro",
  "training.automaticRoutine": "pro",
  "training.autoCoach": "pro",
  "progress.fullHistory": "pro",
  "progress.analytics": "pro",
};

export class AccessGateError extends Error {
  constructor(code, publicMessage, extra = {}) {
    super(code);
    this.name = "AccessGateError";
    this.code = code;
    this.publicMessage = publicMessage || code;
    Object.assign(this, extra);
  }
}

export function accessError(code, publicMessage, extra = {}) {
  return new AccessGateError(code, publicMessage, extra);
}

export function accessErrorPayload(error = {}) {
  const payload = {
    code: error.code || error.message || "ERROR",
    error: error.publicMessage || error.message || "Error",
  };

  [
    "feature",
    "requiredPlan",
    "resource",
    "limit",
    "current",
    "increment",
    "plan",
    "domain",
    "scope",
    "nextAllowedAt",
    "changesAllowed",
    "changesLimit",
    "changesUsed",
    "changesRemaining",
    "windowStartedAt",
    "nextResetAt",
    "authority",
    "editable",
    "remainingDays",
    "status",
  ].forEach((key) => {
    if (error[key] !== undefined) payload[key] = error[key];
  });

  return payload;
}

export function isAccessGateError(error = {}) {
  return error instanceof AccessGateError || Boolean(error?.code && [
    "PLAN_CAPABILITY_REQUIRED",
    "PLAN_LIMIT_REACHED",
    "GOALS_CHANGE_COOLDOWN",
    "GOALS_CHANGE_LIMIT_REACHED",
    "COACH_SERVICE_IS_PRIMARY",
    "PROFESSIONAL_SCOPE_REQUIRED",
    "PROFESSIONAL_NOT_APPROVED",
    "COACH_SUBSCRIPTION_REQUIRED",
    "COACH_CLIENT_LIMIT_REACHED",
    "COACH_SERVICE_PACKAGE_NOT_ALLOWED",
    "FEATURE_COMING_SOON",
  ].includes(error.code));
}

export function isClientUser(user = {}) {
  return normalizeClientRole(user.role || user.rol || "cliente") === "cliente";
}

export function accessContextFor(userOrContext = {}) {
  if (userOrContext?.capabilities && userOrContext?.effectivePersonalPlan) return userOrContext;
  return resolveClientAccessContext(userOrContext || {});
}

function numericLimit(context = {}, resource = "") {
  const key = RESOURCE_LIMIT_KEYS[resource] || resource;
  const value = context?.capabilities?.limits?.[key] ?? context?.limits?.[key];
  if (value === null || value === undefined || value === Number.POSITIVE_INFINITY) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asDateOrNull(value = null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function isoOrNull(date = null) {
  const parsed = asDateOrNull(date);
  return parsed ? parsed.toISOString() : null;
}

function normalizeGoalsChangeWindow(metadata = {}, now = new Date(), windowDays = 30) {
  const currentNow = now instanceof Date ? now : new Date(now);
  const rawWindow = metadata?.manualChangesWindow || metadata?.goalsChangeWindow || {};
  const legacyLast = asDateOrNull(metadata?.lastManualGoalsChangeAt);
  let startedAt = asDateOrNull(rawWindow.windowStartedAt || rawWindow.startedAt);
  let used = Number(rawWindow.changesUsed ?? rawWindow.used ?? 0);

  if (!Number.isFinite(used) || used < 0) used = 0;

  if (!startedAt && legacyLast) {
    startedAt = legacyLast;
    used = Math.max(used, 1);
  }

  const nextResetAt = startedAt ? new Date(startedAt.getTime() + windowDays * MS_DAY) : null;
  const expired = nextResetAt && nextResetAt.getTime() <= currentNow.getTime();

  if (!startedAt || expired) {
    return {
      active: false,
      windowStartedAt: null,
      nextResetAt: null,
      changesUsed: 0,
    };
  }

  return {
    active: true,
    windowStartedAt: startedAt,
    nextResetAt,
    changesUsed: Math.floor(used),
  };
}

export function getGoalsChangeStatus(userOrContext = {}, { actorType = "client", now = new Date() } = {}) {
  const context = accessContextFor(userOrContext);
  const currentNow = now instanceof Date ? now : new Date(now);
  const cooldownDays = numericLimit(context, "manualObjectiveChangeDays");
  const hasLimit = actorType === "client" && Number.isFinite(Number(cooldownDays)) && Number(cooldownDays) > 0;
  const changesLimit = hasLimit ? FREE_GOALS_CHANGE_LIMIT : null;
  const windowDays = hasLimit ? Number(cooldownDays) : null;
  const window = hasLimit
    ? normalizeGoalsChangeWindow(userOrContext?.goalsMetadata || {}, currentNow, windowDays)
    : { active: false, windowStartedAt: null, nextResetAt: null, changesUsed: 0 };
  const changesUsed = hasLimit ? Math.min(changesLimit, window.changesUsed) : 0;
  const changesRemaining = hasLimit ? Math.max(0, changesLimit - changesUsed) : null;
  const authority = context?.authority?.nutrition || context?.authority?.goals || "client";
  const editable = actorType !== "client" || authority !== "coach";

  return {
    editable,
    authority,
    plan: context.effectivePersonalPlan || context.personalPlan || "free",
    changesAllowed: editable && (!hasLimit || changesRemaining > 0),
    changesLimit,
    changesUsed,
    changesRemaining,
    windowStartedAt: isoOrNull(window.windowStartedAt),
    nextResetAt: isoOrNull(window.nextResetAt),
    windowDays,
    serverNow: isoOrNull(currentNow),
  };
}

export function getAccessLimit(userOrContext = {}, resource = "") {
  return numericLimit(accessContextFor(userOrContext), resource);
}

export function requireCapability(userOrContext = {}, feature = "", options = {}) {
  const context = accessContextFor(userOrContext);
  const featureState = feature
    .split(".")
    .filter(Boolean)
    .reduce((current, part) => (current && typeof current === "object" ? current[part] : undefined), context.featureAvailability);

  if (featureState?.enabled === true || featureState?.available === true) return context;

  const status = featureState?.status || "blocked";
  if (status === "coming_soon") {
    throw accessError("FEATURE_COMING_SOON", "Esta funcion todavia no esta disponible", {
      feature,
      status,
    });
  }

  throw accessError("PLAN_CAPABILITY_REQUIRED", "Tu plan no permite esta funcion", {
    feature,
    requiredPlan: options.requiredPlan || FEATURE_REQUIRED_PLAN[feature] || "pro",
    plan: context.effectivePersonalPlan || context.personalPlan || "free",
    status,
  });
}

export function requireQuota(userOrContext = {}, resource = "", current = 0, options = {}) {
  const context = accessContextFor(userOrContext);
  const limit = numericLimit(context, resource);
  const increment = Number(options.increment ?? 1);
  const usage = Number(current || 0);

  if (limit !== null && usage + increment > limit) {
    throw accessError("PLAN_LIMIT_REACHED", `Alcanzaste el limite de ${limit} de tu plan`, {
      resource,
      current: usage,
      increment,
      limit,
      plan: context.effectivePersonalPlan || context.personalPlan || "free",
    });
  }

  return context;
}

export function requireCoachAuthority(userOrContext = {}, domain = "goals") {
  const context = accessContextFor(userOrContext);
  if (context?.authority?.[domain] === "coach") {
    throw accessError("COACH_SERVICE_IS_PRIMARY", "Este dato esta administrado por tu coach", {
      domain,
    });
  }
  return context;
}

function parseDay(value = "") {
  const raw = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) ? date : null;
}

function inclusiveDaySpan(start, end) {
  if (!start || !end) return 1;
  const first = start.getTime() <= end.getTime() ? start : end;
  const last = start.getTime() <= end.getTime() ? end : start;
  return Math.floor((last.getTime() - first.getTime()) / MS_DAY) + 1;
}

export function requireTrackingHistoryRange(userOrContext = {}, { start, end, from, to, date, now = new Date() } = {}) {
  const context = accessContextFor(userOrContext);
  const limit = numericLimit(context, "trackingHistoryDays");
  if (limit === null) return context;

  const startDate = parseDay(start || from || date);
  const endDate = parseDay(end || to || date || start || from);
  const requestedDays = inclusiveDaySpan(startDate, endDate);
  const nowDate = now instanceof Date ? now : new Date(now);
  const today = new Date(Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), nowDate.getUTCDate()));
  const minAllowed = new Date(today.getTime() - (limit - 1) * MS_DAY);
  const oldestRequested = startDate && endDate && startDate.getTime() <= endDate.getTime() ? startDate : endDate || startDate;
  if (requestedDays > limit || (oldestRequested && oldestRequested.getTime() < minAllowed.getTime())) {
    throw accessError("PLAN_CAPABILITY_REQUIRED", "Tu plan permite ver historial limitado de tracking", {
      feature: "nutrition.tracking.fullHistory",
      requiredPlan: "pro",
      plan: context.effectivePersonalPlan || "free",
      resource: "trackingHistoryDays",
      current: requestedDays,
      limit,
    });
  }
  return context;
}

export function countMenuDays(menu = {}) {
  const days = menu?.dias && typeof menu.dias === "object" && !Array.isArray(menu.dias)
    ? Object.values(menu.dias).filter((day) => day && typeof day === "object")
    : [];
  if (days.length) return days.length;
  if (Array.isArray(menu?.selectedDays) && menu.selectedDays.length) return menu.selectedDays.length;
  if (Array.isArray(menu?.comidas) && menu.comidas.length) return 1;
  return 0;
}

export function requireMenuDaysLimit(userOrContext = {}, menu = {}) {
  const dayCount = countMenuDays(menu);
  if (!dayCount) return accessContextFor(userOrContext);
  return requireQuota(userOrContext, "menuDays", dayCount, { increment: 0 });
}

export function requireGoalsChangeAllowed(user = {}, { actorType = "client", now = new Date() } = {}) {
  if (!isClientUser(user)) return accessContextFor(user);
  const context = accessContextFor(user);
  if (actorType === "client") requireCoachAuthority(context, "nutrition");
  if (actorType !== "client") return context;

  const status = getGoalsChangeStatus(user, { actorType, now });
  if (!status.changesAllowed) {
    throw accessError("GOALS_CHANGE_LIMIT_REACHED", "Alcanzaste los cambios disponibles de objetivos para este periodo", {
      ...status,
      nextAllowedAt: status.nextResetAt,
      remainingDays: status.nextResetAt
        ? Math.max(1, Math.ceil((new Date(status.nextResetAt).getTime() - new Date(status.serverNow).getTime()) / MS_DAY))
        : null,
      plan: context.effectivePersonalPlan || "free",
    });
  }

  return context;
}

export function goalsMetadataPatch(actorType = "client", now = new Date(), options = {}) {
  const currentNow = now instanceof Date ? now : new Date(now);
  const previousMetadata = options.previousMetadata || {};
  const consumeManualChange = actorType === "client" && options.consumeManualChange !== false;
  const windowDays = Number(options.windowDays || 30);
  const changesLimit = Number(options.changesLimit || FREE_GOALS_CHANGE_LIMIT);
  const window = normalizeGoalsChangeWindow(previousMetadata, currentNow, windowDays);
  const windowStartedAt = window.windowStartedAt || currentNow;
  const nextUsed = Math.min(changesLimit, Math.max(0, window.changesUsed) + 1);

  return {
    ...(actorType === "client" ? { lastManualGoalsChangeAt: currentNow } : {}),
    ...(consumeManualChange
      ? {
          manualChangesWindow: {
            windowStartedAt,
            changesUsed: nextUsed,
            changesLimit,
            windowDays,
            nextResetAt: new Date(windowStartedAt.getTime() + windowDays * MS_DAY),
            lastChangedAt: currentNow,
          },
        }
      : {}),
    updatedBy: actorType,
    updatedAt: currentNow,
  };
}
