import ModelFactory from "../model/DAO/usuariosFactory.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { ObjectId } from "mongodb";

import { sendVerifyCodeEmail, sendPasswordResetCodeEmail } from "./mailer.js";

import ModelMongoDBPendingUsers from "../model/DAO/pendingUsersMongoDB.js";
import ModelMongoDBPasswordResets from "../model/DAO/passwordResetMongoDB.js";
import ModelMongoDBInvitedUsers from "../model/DAO/invitedUsersMongoDB.js";
import ModelMongoDBCoachPlanConfigs from "../model/DAO/coachPlanConfigsMongoDB.js";
import ModelMongoDBClientPlanConfigs from "../model/DAO/clientPlanConfigsMongoDB.js";
import ModelMongoDBImpersonationAudit from "../model/DAO/impersonationAuditMongoDB.js";
import ModelMongoDBClientMenuTracking from "../model/DAO/clientMenuTrackingMongoDB.js";
import ModelMongoDBFoodLogs from "../model/DAO/foodLogsMongoDB.js";
import ModelMongoDBMenus from "../model/DAO/menusMongoDB.js";
import ModelMongoDBComidas from "../model/DAO/comidasMongoDB.js";
import ModelMongoDBComidasGuardadas from "../model/DAO/comidasGuardadasMongoDB.js";
import ModelMongoDBCoachClientCapacity from "../model/DAO/coachClientCapacityMongoDB.js";
import ModelMongoDBClientCoachBlocks from "../model/DAO/clientCoachBlocksMongoDB.js";
import ModelMongoDBRutinas from "../model/DAO/rutinasMongoDB.js";
import {
  getGoalsChangeStatus,
  goalsMetadataPatch,
  requireCapability,
  requireCoachAuthority,
  requireGoalsChangeAllowed,
  requireTrackingHistoryRange,
} from "./accessGates.js";
import { recordAccessAuditEvent } from "./accessAuditEvents.js";
import { resolveClientAccessContext } from "./clientAccessContext.js";
import {
  PROFESSIONAL_SUBSCRIPTION_PLANS,
  normalizeCoachSubscription,
  normalizeProfessionalSubscriptionPlan,
  professionalSubscriptionPatch,
  requireCoachCanOfferService,
  requireCoachSubscriptionActive,
  requireProfessionalScope,
} from "./professionalAccessRules.js";
import {
  coachResourceLimitError,
  createEmptyCoachOverrides,
  createTrialSubscription,
  normalizeCoachOverrides,
  normalizeCoachPlanCode,
  normalizePlanConfig,
  resolveEffectiveCoachCapabilities,
  validateCoachLimitValue,
} from "./coachPlans.js";
import {
  normalizeClientPlanSettingCode,
  validateClientPlanSettingPatch,
} from "./clientPlanSettings.js";
import {
  canUseProfessionalTemplate,
  professionalTemplateSource,
  resolveProfessionalLibraryCapabilities,
} from "./professionalLibraryCapabilities.js";

const COACH_INVITATION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
const COACH_INVITATION_REJECT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const COACH_INVITATION_DAILY_LIMIT = 20;

function coachLimitViolations(effective = {}) {
  const limits = effective.limits || {};
  const usage = effective.usage || {};
  return [
    ["maxActiveClients", "clientes activos", usage.currentActiveClients, limits.maxActiveClients],
    ["maxCoachOwnedMenus", "menus propios", usage.currentCoachOwnedMenus, limits.maxCoachOwnedMenus],
    ["maxCoachOwnedMeals", "comidas propias", usage.currentCoachOwnedMeals, limits.maxCoachOwnedMeals],
  ]
    .filter(([, , current, limit]) => Number.isFinite(Number(limit)) && Number(limit) >= 0 && Number(current) > Number(limit))
    .map(([resource, label, current, limit]) => ({
      resource,
      label,
      current: Number(current || 0),
      limit: Number(limit || 0),
    }));
}

function coachLimitConflict(code, plan, violations = []) {
  const error = new Error(code);
  error.plan = plan || null;
  error.violations = violations;
  const first = violations[0] || {};
  error.resource = first.resource || null;
  error.current = Number(first.current || 0);
  error.limit = Number(first.limit || 0);
  return error;
}

function coachClientCapacityError(effective = {}, current = null) {
  const legacyPlan = effective?.planCode || "trial_pro";
  return coachResourceLimitError("COACH_CLIENT_LIMIT_EXCEEDED", {
    current: current ?? effective?.usage?.currentActiveClients ?? effective?.currentClients ?? 0,
    limit: effective?.limits?.maxActiveClients ?? effective?.maxClients ?? 0,
    plan: legacyPlan === "vip" ? "coach_ai" : legacyPlan === "pro" ? "coach_pro" : "coach_initial",
    overrideApplied: effective?.sources?.maxClients === "override",
    upgradeTarget: legacyPlan === "trial_pro" ? "coach_pro" : legacyPlan === "pro" ? "coach_ai" : null,
    resource: "maxActiveClients",
  });
}

// =========================
// ✅ Defaults del usuario
// =========================
function getUserDefaults({ role = "cliente", plan = "free", tipo = "entrenado" } = {}) {
  const now = new Date();
  const normalizedRole = normalizeRole(role);
  const effectivePlan =
    normalizedRole === "coach"
      ? normalizeCoachPlanCode(plan) || "trial_pro"
      : (plan || "free");

  return {
    role: normalizedRole,
    plan: effectivePlan,
    tipo, // entrenado | entrenador | admin

    estado: "activo",
    emailVerificado: false,

    onboarding: {
      enabled: tipo === "entrenado",
      done: false,
      step: 1,
      startedAt: now,
      completedAt: null,
      lastSeenAt: null,
    },

    coach: {
      entrenadorId: null,
      assignedAt: null,
      assignedByAdminId: null,
      source: null,
    },

    billing: {
      status: effectivePlan === "free" ? "free" : "inactive",
      paidUntil: null,
      lastPaymentAt: null,
      provider: null,
      providerCustomerId: null,
      providerSubscriptionId: null,
    },

    subscription:
      normalizedRole === "coach"
        ? createTrialSubscription({ planCode: effectivePlan, now })
        : {
            status: effectivePlan === "free" ? "free" : "active",
            trialStartedAt: null,
            trialEndsAt: null,
            paidUntil: null,
          },

    coachProfile:
      normalizedRole === "coach"
        ? {
            title: "",
            bio: "",
            specialties: {
              training: false,
              nutrition: false,
            },
        }
        : null,

    coachCapabilities:
      normalizedRole === "coach"
        ? {
            maxClients: 20,
            canInviteClients: true,
            canManageTraining: true,
            canManageNutrition: true,
            menus: {
              automatic: true,
              semiautomatic: true,
              fixed: true,
              hybrid: true,
            },
            routines: {
              automatic: false,
              semiautomatic: true,
              manual: true,
              hybrid: false,
            },
            canUseTemplates: true,
            canDuplicatePlans: true,
            canExportData: false,
            canSeeAdvancedMetrics: true,
        }
        : null,

    coachOverrides:
      normalizedRole === "coach" ? createEmptyCoachOverrides() : null,

    adminMeta: {
      internalNote: "",
      tags: [],
      priority: "normal",
      lastReviewedAt: null,
    },

    antropometriaActual: {
      alturaCm: null,
      pesoKg: null,
      grasaPct: null,
      updatedAt: null,
    },

    goal: {
      type: null,
      maintenanceKcal: null,
      startWeightKg: null,
      targetWeightKg: null,
      targetRangeKg: {
        min: null,
        max: null,
      },
      ratePctBWPerWeek: null,
      initialBudgetKcal: null,
      endDateLabel: null,
      approach: null,
      updatedAt: null,
    },

    program: {
      diet: null,
      training: null,
      calorieDist: null,
      shiftDays: [],
      protein: null,
      final: false,
      updatedAt: null,
    },

    metasActuales: {
      kcal: null,
      macros: { p: null, c: null, g: null },
      source: "system",
      sourceCoachId: null,
      needsReview: false,
      updatedAt: null,
    },

    menu: {
      activeSource: "none",
      activeOwnMenuId: null,
      mode: {
        type: "automatic", // automatic | manual | hybrid
        lockedByCoach: false,
      },
      mealConfig: {
        mealsPerDay: null,
        distribution: "equilibrada",
        weekendBoost: false,
        weekendBoostPct: 0,
        snackLibre: false,
        snackLibreKcal: 0,
      },
      restrictions: {
        allergies: [],
        intolerances: [],
        excludedFoods: [],
        preferredFoods: [],
        favoriteFoods: [],
        favoriteMeals: [],
      },
      weeklyPlan: {
        caloriesByDay: {},
        macrosByDay: {},
        mealsByDay: {},
        assignedMenusByDay: {},
      },
      history: {
        lastWeek: {
          from: null,
          to: null,
          dias: {},
          updatedAt: null,
        },
      },
      favorites: {
        ids: [],
        updatedAt: null,
      },
      updatedAt: null,
    },

    routine: {
      mode: {
        type: "manual", // automatic | manual | hybrid
        editableByClient: true,
        editableByCoach: true,
        source: "system",
      },
      structure: {
        split: null,
        trainingDaysPerWeek: null,
        preferredDays: [],
        sessionDurationMin: null,
        focus: [],
      },
      currentPlan: {
        name: null,
        description: null,
        startDate: null,
        endDate: null,
        isActive: false,
        days: [],
      },
      progression: {
        mode: "manual",
        deloadEnabled: false,
        progressionRule: null,
      },
      updatedAt: null,
    },

    stats: {
      lastCheckinAt: null,
      pesoInicialKg: null,
      pesoActualKg: null,
      changeKg30d: null,
      adherencia7dPct: null,
      comidasRegistradas7d: 0,
    },

    lastLoginAt: null,
    lastActivityAt: null,
    createdAt: now,
    updatedAt: null,
  };
}

// =========================
// ✅ Helpers de roles / planes
// =========================
function normalizeRole(role) {
  const r = String(role || "").trim().toLowerCase();

  if (r === "trainer") return "coach";
  if (r === "nutritionist") return "coach";
  if (
    r === "trainer_nutritionist" ||
    r === "trainernutri" ||
    r === "coach_nutrition" ||
    r === "entrenador+nutricion"
  ) {
    return "coach";
  }

  if (r === "client" || r === "customer") return "cliente";

  if (r === "coach") return "coach";
  if (r === "admin") return "admin";
  if (r === "cliente") return "cliente";

  return r;
}

function toDbPlan(plan) {
  const p = String(plan || "").trim().toLowerCase();

  if (p === "free") return "free";
  if (p === "pro") return "premium";
  if (p === "vip") return "premium2";

  // compatibilidad
  if (p === "premium" || p === "premium2") return p;

  return null;
}

function toCoachPlan(plan) {
  return normalizeCoachPlanCode(plan);
}

function normalizePlanForRole(plan, role) {
  const r = normalizeRole(role);
  if (r === "coach") return toCoachPlan(plan);
  return toDbPlan(plan);
}

function toMongoIdOrString(id) {
  const value = String(id || "");
  return ObjectId.isValid(value) ? new ObjectId(value) : value;
}

function idToString(id) {
  return id?.toString?.() || String(id || "");
}

function currentCoachIdFromUser(user = {}) {
  return idToString(
    user?.coach?.entrenadorId ||
    user?.coach?.coachId ||
    user?.coachId ||
    user?.entrenadorId ||
    user?.profesionalId ||
    ""
  );
}

function isTerminalCoachAccess(access = {}) {
  const status = String(access?.status || "").trim().toLowerCase();
  return (
    access?.active === false ||
    Boolean(access?.endedAt) ||
    ["ended", "finalized", "finished", "revoked", "unassigned", "inactive", "cancelled", "canceled"].includes(status)
  );
}

function activeCoachIdFromUser(user = {}) {
  if (isTerminalCoachAccess(user?.coachAccess || {})) return "";
  const legacyCoachId = currentCoachIdFromUser(user);
  if (legacyCoachId) return legacyCoachId;
  const access = user?.coachAccess || {};
  const status = String(access.status || "").toLowerCase();
  if (status === "active" && access.coachId && access.active !== false && !access.endedAt) {
    return idToString(access.coachId);
  }
  return "";
}

function normalizeServicePackage(value = "") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_");
  if (["service_vip", "coach_vip", "vip"].includes(normalized)) return "service_vip";
  return "service_pro";
}

function normalizeClientPersonalPlan(value = "") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_");
  if (["pro", "premium"].includes(normalized)) return "pro";
  if (["vip", "premium2"].includes(normalized)) return "vip";
  return "free";
}

function restorePersonalSubscriptionAfterCoachDisconnect(client = {}, now = new Date()) {
  const personalPlan = normalizeClientPersonalPlan(
    client.personalPlan ||
    client?.personalSubscription?.plan ||
    client.plan ||
    "free"
  );
  const current = client.personalSubscription || {};
  const status = String(current.status || "").trim().toLowerCase();
  const wasSuppressedByCoach =
    status === "suppressed_by_coach" ||
    current.suppressedByCoach === true ||
    current.suppressedReason === "coach_access";

  if (!wasSuppressedByCoach && current.billingOwner !== "coach") return current;

  return {
    ...current,
    plan: personalPlan,
    status: personalPlan === "free" ? "free" : "active",
    billingOwner: "client",
    autoRenew: current.autoRenew === true && personalPlan !== "free",
    suppressedByCoach: false,
    suppressedReason: null,
    restoredAfterCoachAt: now,
    updatedAt: now,
  };
}

function weeklyPlanCoachId(menu = {}) {
  const weeklyPlan = menu?.weeklyPlan || {};
  return idToString(
    weeklyPlan.sourceCoachId ||
    weeklyPlan.updatedByCoachId ||
    weeklyPlan.coachId ||
    menu.updatedByCoachId ||
    menu.mode?.updatedByCoachId ||
    ""
  );
}

function numberOrNull(value, { min = null, max = null } = {}) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error("PAYLOAD_INVALIDO");
  if (min !== null && n < min) throw new Error("PAYLOAD_INVALIDO");
  if (max !== null && n > max) throw new Error("PAYLOAD_INVALIDO");
  return n;
}

function cleanString(value, max = 4000) {
  if (value === null || value === undefined) return "";
  return String(value).slice(0, max);
}

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function cleanStringArray(value, maxItems = 24, maxLen = 120) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanString(item, maxLen).trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

const WEEKLY_MENU_DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const WEEKLY_MENU_DAY_META = [
  { key: "monday", label: "Lunes", storageKey: "Lunes", aliases: ["lunes", "monday"] },
  { key: "tuesday", label: "Martes", storageKey: "Martes", aliases: ["martes", "tuesday"] },
  { key: "wednesday", label: "Miercoles", storageKey: "Miercoles", aliases: ["miercoles", "miércoles", "wednesday"] },
  { key: "thursday", label: "Jueves", storageKey: "Jueves", aliases: ["jueves", "thursday"] },
  { key: "friday", label: "Viernes", storageKey: "Viernes", aliases: ["viernes", "friday"] },
  { key: "saturday", label: "Sabado", storageKey: "Sabado", aliases: ["sabado", "sábado", "saturday"] },
  { key: "sunday", label: "Domingo", storageKey: "Domingo", aliases: ["domingo", "sunday"] },
];

const MENU_TRACKING_STATUS = new Set(["pending", "empty", "in_progress", "completed", "partial", "missed", "exceeded"]);
const DAY_COMPLETION_MODES = new Set(["menu", "manual_completion"]);

function normalizeWeeklyMenuItem(item = {}) {
  return {
    id: cleanString(item.id || item._id, 80) || null,
    alimentoId: item.alimentoId ? toMongoIdOrString(item.alimentoId) : null,
    nombreSnapshot: cleanString(item.nombreSnapshot || item.nombre || item.name, 160) || "Alimento",
    cantidad: numberOrNull(item.cantidad ?? item.quantity ?? item.amount ?? item.gramos ?? item.grams, { min: 0, max: 10000 }),
    unidad: cleanString(item.unidad || item.unit || "g", 24) || "g",
    kcal: numberOrNull(item.kcal ?? item.calorias ?? item.calories, { min: 0, max: 20000 }),
    proteina: numberOrNull(item.proteina ?? item.protein, { min: 0, max: 1000 }),
    carbs: numberOrNull(item.carbs ?? item.carbohidratos ?? item.carbohydrates, { min: 0, max: 2000 }),
    grasas: numberOrNull(item.grasas ?? item.fat, { min: 0, max: 1000 }),
    categoriaSnapshot: cleanString(item.categoriaSnapshot || item.categoria || item.category, 120),
  };
}

function weeklyMenuNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function weeklyMenuHasTotals(totals = {}) {
  return Boolean(
    weeklyMenuNumber(totals.kcal ?? totals.calorias ?? totals.calories, 0) ||
    weeklyMenuNumber(totals.proteina ?? totals.protein, 0) ||
    weeklyMenuNumber(totals.carbs ?? totals.carbohidratos ?? totals.carbohydrates, 0) ||
    weeklyMenuNumber(totals.grasas ?? totals.fat, 0)
  );
}

function weeklyMenuItemTotals(items = []) {
  return items.reduce(
    (acc, item) => ({
      kcal: acc.kcal + weeklyMenuNumber(item.kcal ?? item.calorias ?? item.calories, 0),
      proteina: acc.proteina + weeklyMenuNumber(item.proteina ?? item.protein, 0),
      carbs: acc.carbs + weeklyMenuNumber(item.carbs ?? item.carbohidratos ?? item.carbohydrates, 0),
      grasas: acc.grasas + weeklyMenuNumber(item.grasas ?? item.fat, 0),
    }),
    { kcal: 0, proteina: 0, carbs: 0, grasas: 0 }
  );
}

function weeklyMenuTotalsPayload(totals = {}) {
  return {
    kcal: numberOrNull(totals.kcal ?? totals.calorias ?? totals.calories, { min: 0, max: 20000 }),
    proteina: numberOrNull(totals.proteina ?? totals.protein, { min: 0, max: 1000 }),
    carbs: numberOrNull(totals.carbs ?? totals.carbohidratos ?? totals.carbohydrates, { min: 0, max: 2000 }),
    grasas: numberOrNull(totals.grasas ?? totals.fat, { min: 0, max: 1000 }),
  };
}

function normalizeWeeklyMenuMeal(meal = {}, index = 0) {
  const rawItems = Array.isArray(meal.items)
    ? meal.items
    : Array.isArray(meal.foods)
      ? meal.foods
      : Array.isArray(meal.alimentos)
        ? meal.alimentos
        : [];
  const items = rawItems.slice(0, 80).map(normalizeWeeklyMenuItem);
  const explicitTotals = isPlainObject(meal.totales || meal.totals) ? meal.totales || meal.totals : meal;
  const itemTotals = weeklyMenuItemTotals(items);
  const totals = weeklyMenuHasTotals(explicitTotals) ? explicitTotals : itemTotals;
  return {
    id: cleanString(meal.id || meal._id, 80) || `meal-${index + 1}`,
    nombre: cleanString(meal.nombre || meal.name, 140) || `Comida ${index + 1}`,
    orden: numberOrNull(meal.orden ?? meal.order, { min: 1, max: 20 }) || index + 1,
    tipoComida: cleanString(meal.tipoComida || meal.type, 60) || "otro",
    totales: weeklyMenuTotalsPayload(totals),
    items,
  };
}

function normalizeWeeklyMenuSnapshot(snapshot = {}) {
  const comidas = Array.isArray(snapshot.comidas) ? snapshot.comidas : null;
  const mealsSource = Array.isArray(snapshot.meals) ? snapshot.meals : null;
  const meals = comidas?.length ? comidas : mealsSource?.length ? mealsSource : comidas || mealsSource || [];
  const normalizedMeals = meals.slice(0, 12).map(normalizeWeeklyMenuMeal);
  const macros = isPlainObject(snapshot.macrosObjetivo || snapshot.macros)
    ? snapshot.macrosObjetivo || snapshot.macros
    : {};
  const explicitTotals = {
    kcal: snapshot.kcal ?? snapshot.kcalObjetivo ?? snapshot.calories ?? snapshot.totals?.kcal ?? snapshot.totales?.kcal,
    proteina:
      snapshot.protein ??
      snapshot.proteina ??
      macros.proteina ??
      macros.protein ??
      snapshot.totals?.proteina ??
      snapshot.totals?.protein ??
      snapshot.totales?.proteina ??
      snapshot.totales?.protein,
    carbs: snapshot.carbs ?? macros.carbs ?? macros.carbohidratos ?? snapshot.totals?.carbs ?? snapshot.totales?.carbs,
    grasas:
      snapshot.fat ??
      snapshot.grasas ??
      macros.grasas ??
      macros.fat ??
      snapshot.totals?.grasas ??
      snapshot.totals?.fat ??
      snapshot.totales?.grasas ??
      snapshot.totales?.fat,
  };
  const mealsTotals = weeklyMenuItemTotals(normalizedMeals.map((meal) => meal.totales || {}));
  const totals = weeklyMenuHasTotals(explicitTotals) ? explicitTotals : mealsTotals;
  return {
    id: cleanString(snapshot.id || snapshot._id || snapshot.baseId || snapshot.menuBaseId, 80) || null,
    baseId: cleanString(snapshot.baseId || snapshot.menuBaseId || snapshot.id || snapshot._id, 80) || null,
    name: cleanString(snapshot.name || snapshot.nombre, 180) || "Menu sin nombre",
    description: cleanString(snapshot.description || snapshot.descripcion, 1200),
    kcal: numberOrNull(totals.kcal, { min: 0, max: 20000 }),
    protein: numberOrNull(totals.proteina ?? totals.protein, { min: 0, max: 1000 }),
    carbs: numberOrNull(totals.carbs, { min: 0, max: 2000 }),
    fat: numberOrNull(totals.grasas ?? totals.fat, { min: 0, max: 1000 }),
    totals: weeklyMenuTotalsPayload(totals),
    mealsCount: numberOrNull(snapshot.mealsCount ?? snapshot.cantidadComidas, { min: 0, max: 12 }) || normalizedMeals.length,
    meals: normalizedMeals,
  };
}

function normalizeAssignedMenusByDay(value = {}) {
  if (!isPlainObject(value)) return {};
  return WEEKLY_MENU_DAYS.reduce((acc, day) => {
    const entry = isPlainObject(value[day]) ? value[day] : null;
    if (!entry) return acc;
    const primarySource = isPlainObject(entry.primaryMenu) ? entry.primaryMenu : entry;
    const primaryMenu = normalizeAssignedMenuEntry(primarySource, "base");
    if (!primaryMenu) return acc;
    const alternatives = Array.isArray(entry.alternatives)
      ? entry.alternatives
          .map((alternative) => normalizeAssignedMenuAlternative(alternative))
          .filter(Boolean)
          .filter((alternative) => !sameAssignedMenu(alternative, primaryMenu))
          .slice(0, 10)
      : [];
    acc[day] = {
      ...primaryMenu,
      primaryMenu,
      alternatives,
    };
    return acc;
  }, {});
}

function hasAssignedMenuEntries(value = {}) {
  return Object.values(normalizeAssignedMenusByDay(value || {})).some(Boolean);
}

function isCoachGeneratedWeeklyPlan(user = {}) {
  const menu = user?.menu || {};
  const weeklyPlan = menu?.weeklyPlan || {};
  const generatedBy = String(weeklyPlan.generatedBy || "").trim().toLowerCase();
  const modeSource = String(menu?.mode?.source || "").trim().toLowerCase();

  return (
    generatedBy === "coach" ||
    modeSource === "coach" ||
    String(menu?.activeSource || "").trim().toLowerCase() === "coach" ||
    Boolean(weeklyPlanCoachId(menu)) ||
    hasAssignedMenuEntries(weeklyPlan.assignedMenusByDay || {})
  );
}

function shouldUseWeeklyNutritionPlan(user = {}) {
  if (isSelfGeneratedWeeklyPlan(user)) return true;
  const currentCoachId = currentCoachIdFromUser(user);
  const activeSource = String(user?.menu?.activeSource || "none").trim().toLowerCase();

  if (!currentCoachId) return false;
  if (activeSource === "own") return false;
  if (!isCoachGeneratedWeeklyPlan(user)) return true;

  const sourceCoachId = weeklyPlanCoachId(user?.menu || {});
  if (sourceCoachId && sourceCoachId !== currentCoachId) return false;

  return true;
}

function resolveWeeklyNutritionPlanForUser(user = {}) {
  const weeklyPlan = user?.menu?.weeklyPlan || {};
  if (shouldUseWeeklyNutritionPlan(user)) return weeklyPlan;

  return {
    ...weeklyPlan,
    caloriesByDay: {},
    macrosByDay: {},
    mealsByDay: {},
  };
}

function shouldClearCoachWeeklyPlanOnDisconnect(client = {}, coachId = null) {
  if (!isCoachGeneratedWeeklyPlan(client)) return false;
  const sourceCoachId = weeklyPlanCoachId(client?.menu || {});
  const disconnectedCoachId = idToString(coachId);
  if (!sourceCoachId || !disconnectedCoachId) return true;
  return sourceCoachId === disconnectedCoachId;
}

function shouldClearCoachRoutineOnDisconnect(client = {}, coachId = null) {
  const routine = client?.routine || {};
  const source = normalizeDayName(routine?.mode?.source || routine?.source || routine?.currentPlan?.generatedBy || "");
  if (source !== "coach") return false;
  const disconnectedCoachId = idToString(coachId);
  const routineCoachId = idToString(routine?.mode?.updatedByCoachId || routine?.updatedByCoachId || routine?.coachId);
  if (!routineCoachId || !disconnectedCoachId) return true;
  return routineCoachId === disconnectedCoachId;
}

function menuDocTotals(doc = {}) {
  const totals = doc.macrosTotales || doc.totales || doc.totalesActuales || {};
  const macros = doc.macrosObjetivo || {};
  return {
    kcal: totals.kcal ?? doc.kcalObjetivo ?? doc.kcal,
    proteina: totals.proteina ?? totals.proteinas ?? macros.proteina ?? macros.protein,
    carbs: totals.carbs ?? totals.carbohidratos ?? macros.carbs ?? macros.carbohidratos,
    grasas: totals.grasas ?? macros.grasas ?? macros.fat,
  };
}

function normalizeOwnMenuDayEntry(menu = {}, day = {}) {
  const days = isPlainObject(menu.dias || menu.days) ? menu.dias || menu.days : {};
  const found = findDayValue(days, day);
  if (!found.found) return null;
  const raw = Array.isArray(found.value) ? { comidas: found.value } : found.value;
  if (!isPlainObject(raw)) return null;
  return {
    ...raw,
    nombre: raw.nombre || raw.name || `${menu.nombre || "Menu"} - ${day.label}`,
    comidas: Array.isArray(raw.comidas) ? raw.comidas : Array.isArray(raw.meals) ? raw.meals : [],
    kcalObjetivo: raw.kcalObjetivo ?? raw.kcal ?? raw.macrosTotales?.kcal,
    macrosObjetivo: raw.macrosObjetivo || {
      proteina: raw.macrosTotales?.proteina,
      carbs: raw.macrosTotales?.carbs,
      grasas: raw.macrosTotales?.grasas,
    },
  };
}

function singleOwnMenuDayKey(menu = {}, source = "own") {
  if (source !== "own") return "";
  const days = isPlainObject(menu.dias || menu.days) ? menu.dias || menu.days : {};
  const validDayKeys = Object.keys(days).filter((key) => getWeekDayMeta(key));
  return validDayKeys.length === 1 ? validDayKeys[0] : "";
}

function normalizeOwnMenuFallbackDayEntry(menu = {}, fallbackDayKey = "") {
  if (!fallbackDayKey) return null;
  const days = isPlainObject(menu.dias || menu.days) ? menu.dias || menu.days : {};
  const fallbackMeta = getWeekDayMeta(fallbackDayKey);
  if (!fallbackMeta) return null;
  const found = findDayValue(days, fallbackMeta);
  if (!found.found) return null;
  const raw = Array.isArray(found.value) ? { comidas: found.value } : found.value;
  if (!isPlainObject(raw)) return null;
  return {
    ...raw,
    nombre: menu.nombre || menu.name || raw.nombre || raw.name || "Menu propio",
    comidas: Array.isArray(raw.comidas) ? raw.comidas : Array.isArray(raw.meals) ? raw.meals : [],
    kcalObjetivo: raw.kcalObjetivo ?? raw.kcal ?? raw.macrosTotales?.kcal,
    macrosObjetivo: raw.macrosObjetivo || {
      proteina: raw.macrosTotales?.proteina,
      carbs: raw.macrosTotales?.carbs,
      grasas: raw.macrosTotales?.grasas,
    },
  };
}

function menuDocSnapshotForDay(menu = {}, day = {}, source = "own", options = {}) {
  const hasExplicitDays = isPlainObject(menu.dias || menu.days) && Object.keys(menu.dias || menu.days).length > 0;
  const dayEntry = normalizeOwnMenuDayEntry(menu, day)
    || normalizeOwnMenuFallbackDayEntry(menu, options.fallbackDayKey);
  if (hasExplicitDays && !dayEntry) return null;
  const totals = dayEntry ? menuDocTotals(dayEntry) : menuDocTotals(menu);
  const comidas = dayEntry?.comidas?.length ? dayEntry.comidas : Array.isArray(menu.comidas) ? menu.comidas : [];
  return {
    id: idToString(menu._id || menu.id),
    baseId: idToString(menu._id || menu.id),
    name: dayEntry?.nombre || menu.nombre || "Menu propio",
    description: dayEntry?.descripcion || menu.descripcion || "",
    source,
    kcal: totals.kcal,
    macrosObjetivo: {
      proteina: totals.proteina,
      carbs: totals.carbs,
      grasas: totals.grasas,
    },
    comidas,
    mealsCount: comidas.length,
  };
}

function buildAssignedMenusByDayFromMenuDoc(menu = {}, source = "own") {
  if (!menu) return {};
  const fallbackDayKey = singleOwnMenuDayKey(menu, source);
  return WEEKLY_MENU_DAY_META.reduce((acc, day) => {
    const snapshot = menuDocSnapshotForDay(menu, day, source, { fallbackDayKey });
    if (!snapshot) return acc;
    const normalized = normalizeWeeklyMenuSnapshot(snapshot);
    if (!normalized?.meals?.length) return acc;
    acc[day.key] = {
      menuId: idToString(menu._id || menu.id),
      source,
      assignedAt: menu.updatedAt || menu.createdAt || new Date(),
      menuSnapshot: normalized,
    };
    return acc;
  }, {});
}

function normalizeProgressCheckin(raw = {}, fallback = {}) {
  const input = isPlainObject(raw) ? raw : {};
  const fallbackDate = fallback.date || new Date().toISOString().slice(0, 10);
  const date = cleanString(input.date || input.fecha || fallbackDate, 20) || fallbackDate;
  return {
    id: cleanString(input.id || input._id || fallback.id || crypto.randomUUID(), 80),
    date,
    weightKg: numberOrNull(input.weightKg ?? input.pesoKg, { min: 20, max: 350 }),
    dietAdherencePct: numberOrNull(input.dietAdherencePct ?? input.adherenciaDietaPct, { min: 0, max: 100 }),
    workoutAdherencePct: numberOrNull(input.workoutAdherencePct ?? input.adherenciaRutinaPct, { min: 0, max: 100 }),
    plannedSessions: numberOrNull(input.plannedSessions ?? input.sesionesPlanificadas, { min: 0, max: 30 }),
    completedSessions: numberOrNull(input.completedSessions ?? input.sesionesRealizadas, { min: 0, max: 30 }),
    note: cleanString(input.note || input.nota, 1000),
    status: cleanString(input.status || input.estado || "ok", 40) || "ok",
    source: cleanString(input.source || "coach", 40) || "coach",
    createdAt: input.createdAt ? new Date(input.createdAt) : (fallback.createdAt || new Date()),
    updatedAt: new Date(),
  };
}

function sortProgressCheckins(checkins = []) {
  return [...checkins].sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
}

function summarizeProgress(checkins = []) {
  const sorted = sortProgressCheckins(checkins);
  const withWeight = sorted.filter((item) => Number.isFinite(Number(item.weightKg)));
  const initial = withWeight[0] || null;
  const latest = withWeight[withWeight.length - 1] || null;
  const lastCheckin = sorted[sorted.length - 1] || null;
  const recent = sorted.slice(-4);
  const avg = (getter) => {
    const values = recent.map(getter).map(Number).filter(Number.isFinite);
    if (!values.length) return null;
    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  };
  const workoutPct = (item) => {
    const direct = Number(item.workoutAdherencePct);
    if (Number.isFinite(direct)) return direct;
    const planned = Number(item.plannedSessions);
    const completed = Number(item.completedSessions);
    if (!Number.isFinite(planned) || planned <= 0 || !Number.isFinite(completed)) return null;
    return Math.max(0, Math.min(100, Math.round((completed / planned) * 100)));
  };
  const weightDelta = initial && latest ? Math.round((Number(latest.weightKg) - Number(initial.weightKg)) * 10) / 10 : null;
  return {
    lastCheckinAt: lastCheckin?.date || null,
    pesoInicialKg: initial?.weightKg ?? null,
    pesoActualKg: latest?.weightKg ?? null,
    changeKg30d: weightDelta,
    adherencia7dPct: avg((item) => item.dietAdherencePct),
    adherenciaRutina7dPct: avg(workoutPct),
    comidasRegistradas7d: null,
  };
}

function normalizeAssignedMenuPlanningMeta(entry = {}) {
  const targetMacros = isPlainObject(entry?.targetMacros) ? entry.targetMacros : {};
  const macroPending = isPlainObject(entry?.macroPending) ? entry.macroPending : {};
  const compatibility = isPlainObject(entry?.compatibility)
    ? {
        key: cleanString(entry.compatibility.key, 40),
        label: cleanString(entry.compatibility.label, 80),
        tone: cleanString(entry.compatibility.tone, 40),
        kcalDiff: numberOrNull(entry.compatibility.kcalDiff, { min: -20000, max: 20000 }),
        proteinDiff: numberOrNull(entry.compatibility.proteinDiff, { min: -1000, max: 1000 }),
        canAssign: entry.compatibility.canAssign === true,
        flexibleCalories: numberOrNull(entry.compatibility.flexibleCalories, { min: 0, max: 20000 }),
      }
    : null;
  return {
    ...(entry?.assignmentType !== undefined ? { assignmentType: cleanString(entry.assignmentType, 40) } : {}),
    ...(entry?.dayKey !== undefined ? { dayKey: getWeekDayMeta(entry.dayKey)?.key || cleanString(entry.dayKey, 24) } : {}),
    ...(entry?.targetCalories !== undefined
      ? { targetCalories: numberOrNull(entry.targetCalories, { min: 0, max: 20000 }) }
      : {}),
    ...(Object.keys(targetMacros).length
      ? {
          targetMacros: {
            p: numberOrNull(targetMacros.p ?? targetMacros.protein ?? targetMacros.proteina, { min: 0, max: 500 }),
            c: numberOrNull(targetMacros.c ?? targetMacros.carbs ?? targetMacros.carbohidratos, { min: 0, max: 900 }),
            g: numberOrNull(targetMacros.g ?? targetMacros.fat ?? targetMacros.grasas, { min: 0, max: 400 }),
          },
        }
      : {}),
    ...(entry?.plannedCalories !== undefined
      ? { plannedCalories: numberOrNull(entry.plannedCalories, { min: 0, max: 20000 }) }
      : {}),
    ...(entry?.flexibleCalories !== undefined
      ? { flexibleCalories: numberOrNull(entry.flexibleCalories, { min: 0, max: 20000 }) }
      : {}),
    ...(entry?.flexibleMode !== undefined ? { flexibleMode: cleanString(entry.flexibleMode, 40) } : {}),
    ...(entry?.flexibleLabel !== undefined ? { flexibleLabel: cleanString(entry.flexibleLabel, 80) } : {}),
    ...(Object.keys(macroPending).length
      ? {
          macroPending: {
            protein: numberOrNull(macroPending.protein ?? macroPending.proteina, { min: 0, max: 1000 }),
            carbs: numberOrNull(macroPending.carbs ?? macroPending.carbohidratos, { min: 0, max: 2000 }),
            fat: numberOrNull(macroPending.fat ?? macroPending.grasas, { min: 0, max: 1000 }),
          },
        }
      : {}),
    ...(entry?.proteinWarning !== undefined ? { proteinWarning: entry.proteinWarning === true } : {}),
    ...(compatibility ? { compatibility } : {}),
  };
}

function normalizeAssignedMenuEntry(entry = {}, fallbackSource = "base") {
  if (!isPlainObject(entry)) return null;
  const snapshotSource = isPlainObject(entry.menuSnapshot)
    ? entry.menuSnapshot
    : isPlainObject(entry.snapshot)
      ? entry.snapshot
      : entry;
  const hasSnapshotData = Boolean(
    entry.menuId ||
    entry.menuBaseId ||
    snapshotSource.id ||
    snapshotSource._id ||
    snapshotSource.baseId ||
    snapshotSource.menuBaseId ||
    snapshotSource.name ||
    snapshotSource.nombre ||
    Array.isArray(snapshotSource.meals) ||
    Array.isArray(snapshotSource.comidas)
  );
  if (!hasSnapshotData) return null;
  const snapshot = normalizeWeeklyMenuSnapshot(snapshotSource);
  if (!snapshot.baseId && !snapshot.id && !snapshot.name) return null;
  return {
    menuId: cleanString(entry.menuId || entry.menuBaseId || snapshot.baseId || snapshot.id, 80) || null,
    menuSnapshot: snapshot,
    source: cleanString(entry.source || fallbackSource, 40) || fallbackSource,
    ...normalizeAssignedMenuPlanningMeta(entry),
    assignedAt: entry.assignedAt ? new Date(entry.assignedAt) : new Date(),
  };
}

function normalizeAssignedMenuAlternative(entry = {}) {
  const alternative = normalizeAssignedMenuEntry(entry, "alternative");
  if (!alternative) return null;
  const compatibility = isPlainObject(entry.compatibility)
    ? {
        key: cleanString(entry.compatibility.key, 40),
        label: cleanString(entry.compatibility.label, 80),
        tone: cleanString(entry.compatibility.tone, 40),
        kcalDiff: numberOrNull(entry.compatibility.kcalDiff, { min: -20000, max: 20000 }),
        proteinDiff: numberOrNull(entry.compatibility.proteinDiff, { min: -1000, max: 1000 }),
      }
    : null;
  return {
    ...alternative,
    reason: cleanString(entry.reason, 240),
    compatibility,
  };
}

function normalizeDayName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getWeekDayMeta(dayLike) {
  const normalized = normalizeDayName(dayLike);
  return WEEKLY_MENU_DAY_META.find((day) => (
    day.key === normalized ||
    normalizeDayName(day.label) === normalized ||
    normalizeDayName(day.storageKey) === normalized ||
    day.aliases.some((alias) => normalizeDayName(alias) === normalized)
  )) || null;
}

function findDayValue(source, day) {
  if (!isPlainObject(source)) return { found: false, value: undefined };
  const matchingKey = Object.keys(source).find((key) => getWeekDayMeta(key)?.key === day.key);
  return matchingKey === undefined
    ? { found: false, value: undefined }
    : { found: true, value: source[matchingKey] };
}

function weeklyPlanHasValues(weeklyPlan = {}) {
  return (
    isPlainObject(weeklyPlan?.caloriesByDay) && Object.keys(weeklyPlan.caloriesByDay).length > 0
  ) || (
    isPlainObject(weeklyPlan?.macrosByDay) && Object.keys(weeklyPlan.macrosByDay).length > 0
  );
}

function isSelfGeneratedWeeklyPlan(user = {}) {
  const weeklyPlan = user?.menu?.weeklyPlan || {};
  const source = normalizeDayName(weeklyPlan.source || user?.menu?.weeklyPlanSource || "");
  return ["self", "client", "cliente"].includes(source) && weeklyPlanHasValues(weeklyPlan);
}

function normalizeWeeklyGoalsPayload(weeklyPlan = {}) {
  if (!isPlainObject(weeklyPlan)) return null;
  const mode = cleanString(weeklyPlan.mode || "same_all_days", 60) || "same_all_days";
  if (mode === "same_all_days") {
    return {
      mode,
      caloriesByDay: {},
      macrosByDay: {},
      trainingDays: [],
    };
  }

  const caloriesByDay = {};
  const macrosByDay = {};
  const rawCalories = isPlainObject(weeklyPlan.caloriesByDay) ? weeklyPlan.caloriesByDay : {};
  const rawMacros = isPlainObject(weeklyPlan.macrosByDay) ? weeklyPlan.macrosByDay : {};

  WEEKLY_MENU_DAY_META.forEach((day) => {
    const calorieEntry = findDayValue(rawCalories, day);
    const macroEntry = findDayValue(rawMacros, day);
    const rawMacro = isPlainObject(macroEntry.value) ? macroEntry.value : {};

    if (calorieEntry.found && calorieEntry.value !== "" && calorieEntry.value !== null && calorieEntry.value !== undefined) {
      caloriesByDay[day.key] = numberOrNull(calorieEntry.value, { min: 800, max: 7000 });
    }

    const macroPatch = {};
    if (rawMacro.p !== undefined || rawMacro.proteina !== undefined || rawMacro.protein !== undefined) {
      macroPatch.p = numberOrNull(rawMacro.p ?? rawMacro.proteina ?? rawMacro.protein, { min: 0, max: 500 });
    }
    if (rawMacro.c !== undefined || rawMacro.carbs !== undefined || rawMacro.carbohidratos !== undefined) {
      macroPatch.c = numberOrNull(rawMacro.c ?? rawMacro.carbs ?? rawMacro.carbohidratos, { min: 0, max: 900 });
    }
    if (rawMacro.g !== undefined || rawMacro.grasas !== undefined || rawMacro.fat !== undefined) {
      macroPatch.g = numberOrNull(rawMacro.g ?? rawMacro.grasas ?? rawMacro.fat, { min: 0, max: 400 });
    }
    if (Object.keys(macroPatch).length) macrosByDay[day.key] = macroPatch;
  });

  return {
    mode,
    caloriesByDay,
    macrosByDay,
    trainingDays: cleanStringArray(weeklyPlan.trainingDays, 7, 24)
      .map((day) => getWeekDayMeta(day)?.key)
      .filter(Boolean),
  };
}

function weeklyGoalsSignature(weeklyPlan = {}) {
  const normalized = normalizeWeeklyGoalsPayload(weeklyPlan) || {
    mode: "same_all_days",
    caloriesByDay: {},
    macrosByDay: {},
    trainingDays: [],
  };
  return JSON.stringify({
    mode: normalized.mode,
    caloriesByDay: normalized.caloriesByDay || {},
    macrosByDay: normalized.macrosByDay || {},
    trainingDays: [...new Set(normalized.trainingDays || [])].sort(),
  });
}

function roundTrackingNumber(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.round(number * 10) / 10;
}

function hasNumber(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

function macroKcal(protein, carbs, fat) {
  if (!hasNumber(protein) || !hasNumber(carbs) || !hasNumber(fat)) return null;
  return Math.round((Number(protein) * 4) + (Number(carbs) * 4) + (Number(fat) * 9));
}

function comparableNumber(value) {
  return hasNumber(value) ? Math.round(Number(value) * 100) / 100 : null;
}

function goalsSignature(goal = {}, metas = {}) {
  const macros = metas?.macros || {};
  return JSON.stringify({
    goal: {
      type: cleanString(goal?.type, 60) || null,
      targetWeightKg: comparableNumber(goal?.targetWeightKg),
      approach: cleanString(goal?.approach, 120) || null,
    },
    metas: {
      kcal: comparableNumber(metas?.kcal),
      p: comparableNumber(macros?.p),
      c: comparableNumber(macros?.c),
      g: comparableNumber(macros?.g),
    },
  });
}

function normalizeGoalSource(source = "") {
  const value = String(source || "").trim().toLowerCase();
  return ["self", "coach", "system"].includes(value) ? value : "";
}

function normalizeMetasActuales(metas = {}, fallbackSource = "system") {
  const macros = metas?.macros || {};
  return {
    ...(metas || {}),
    kcal: hasNumber(metas?.kcal) ? Math.max(0, Number(metas.kcal)) : null,
    macros: {
      ...(macros || {}),
      p: hasNumber(macros.p) ? Math.max(0, Number(macros.p)) : null,
      c: hasNumber(macros.c) ? Math.max(0, Number(macros.c)) : null,
      g: hasNumber(macros.g) ? Math.max(0, Number(macros.g)) : null,
    },
    source: normalizeGoalSource(metas?.source) || fallbackSource,
    sourceCoachId: metas?.sourceCoachId || null,
    needsReview: !!metas?.needsReview,
    updatedAt: metas?.updatedAt || null,
  };
}

function hasValidMetas(metas = {}) {
  const normalized = normalizeMetasActuales(metas);
  return (
    hasNumber(normalized.kcal) ||
    hasNumber(normalized.macros?.p) ||
    hasNumber(normalized.macros?.c) ||
    hasNumber(normalized.macros?.g)
  );
}

function buildSelfGoalsBackup(currentMetas = {}) {
  const source = normalizeGoalSource(currentMetas?.source) || "self";
  if (source === "coach" || !hasValidMetas(currentMetas)) return null;
  const normalized = normalizeMetasActuales(currentMetas, source);
  return {
    kcal: normalized.kcal,
    macros: {
      p: normalized.macros.p,
      c: normalized.macros.c,
      g: normalized.macros.g,
    },
    source,
    updatedAt: normalized.updatedAt || new Date(),
  };
}

function resetCoachDerivedClientPermissions(permissions = {}) {
  const next = isPlainObject(permissions) ? { ...permissions } : {};
  delete next.menu;
  delete next.routine;

  next.tracking = {
    ...(isPlainObject(permissions?.tracking) ? permissions.tracking : {}),
    canTrackFood: true,
    canEditPastDays: true,
    canMarkMenuMealsCompleted: true,
    canAutoCompleteRemainingMeals: false,
    canUseFlexibleMarginRecommendations: false,
    canUseMenuAlternatives: true,
  };
  next.foodTracking = {
    ...(isPlainObject(permissions?.foodTracking) ? permissions.foodTracking : {}),
    canTrackFood: true,
    canEditPastDays: true,
  };

  return next;
}

function restoreMetasAfterCoachDisconnect(client = {}, coachId = null) {
  const current = normalizeMetasActuales(client?.metasActuales || {}, "system");
  const currentSource = normalizeGoalSource(current.source) || "system";
  const currentSourceCoach = idToString(current.sourceCoachId);
  const disconnectedCoach = idToString(coachId);
  const isCoachGoal =
    currentSource === "coach" &&
    (!disconnectedCoach || !currentSourceCoach || currentSourceCoach === disconnectedCoach);

  if (!isCoachGoal) {
    return {
      ...current,
      source: currentSource,
      sourceCoachId: currentSource === "coach" ? current.sourceCoachId : null,
      updatedAt: current.updatedAt || new Date(),
    };
  }

  const backup = client?.nutrition?.selfGoalsBackup;
  if (hasValidMetas(backup)) {
    const restored = normalizeMetasActuales(backup, normalizeGoalSource(backup?.source) || "self");
    return {
      ...restored,
      source: normalizeGoalSource(restored.source) || "self",
      sourceCoachId: null,
      needsReview: true,
      updatedAt: new Date(),
      restoredFromBackupAt: new Date(),
    };
  }

  return {
    ...current,
    source: "system",
    sourceCoachId: null,
    needsReview: true,
    updatedAt: new Date(),
  };
}

function deriveCarbsForKcal(kcal, protein, fat) {
  const targetKcal = Math.max(0, Number(kcal) || 0);
  const p = hasNumber(protein) ? Number(protein) : 0;
  let g = hasNumber(fat) ? Number(fat) : 0;
  let c = (targetKcal - (p * 4) - (g * 9)) / 4;
  let warning = "";

  if (c < 0) {
    c = 0;
    g = Math.max(0, (targetKcal - (p * 4)) / 9);
    warning = "Meta calorica baja: se ajustaron grasas para sostener la proteina.";
  }

  return {
    p: roundTrackingNumber(p),
    c: roundTrackingNumber(c),
    g: roundTrackingNumber(g),
    warning,
  };
}

function buildBaseNutritionTarget(user = {}) {
  const macros = user?.metasActuales?.macros || {};
  const p = hasNumber(macros.p) ? Number(macros.p) : null;
  const c = hasNumber(macros.c) ? Number(macros.c) : null;
  const g = hasNumber(macros.g) ? Number(macros.g) : null;
  const kcal = macroKcal(p, c, g) ?? (hasNumber(user?.metasActuales?.kcal) ? Number(user.metasActuales.kcal) : null);

  return {
    key: "base",
    label: "Base",
    kcal: kcal === null ? null : Math.round(kcal),
    p: p === null ? null : roundTrackingNumber(p),
    c: c === null ? null : roundTrackingNumber(c),
    g: g === null ? null : roundTrackingNumber(g),
    statusLabel: "General",
    valid: hasNumber(kcal) && hasNumber(p),
  };
}

function buildCustomizedNutritionTarget(day, base, override = {}, caloriesValue = null) {
  const wantedKcal = hasNumber(override.kcal) ? Number(override.kcal) : (hasNumber(caloriesValue) ? Number(caloriesValue) : null);
  const p = hasNumber(override.p ?? override.proteina ?? override.protein) ? Number(override.p ?? override.proteina ?? override.protein) : base.p;
  const g = hasNumber(override.g ?? override.grasas ?? override.fat) ? Number(override.g ?? override.grasas ?? override.fat) : base.g;
  let c = hasNumber(override.c ?? override.carbs ?? override.carbohidratos) ? Number(override.c ?? override.carbs ?? override.carbohidratos) : null;

  if (!hasNumber(c) && hasNumber(wantedKcal)) {
    c = deriveCarbsForKcal(wantedKcal, p, g).c;
  }
  if (!hasNumber(c)) c = base.c;

  const kcal = macroKcal(p, c, g) ?? wantedKcal ?? base.kcal;
  return {
    key: day.key,
    label: day.label,
    kcal: hasNumber(kcal) ? Math.round(Number(kcal)) : null,
    p: hasNumber(p) ? roundTrackingNumber(p) : null,
    c: hasNumber(c) ? roundTrackingNumber(c) : null,
    g: hasNumber(g) ? roundTrackingNumber(g) : null,
    note: cleanString(override.note || override.nota, 500),
    customized: true,
    adjusted: false,
    statusLabel: "Personalizado",
    valid: hasNumber(kcal) && hasNumber(p),
  };
}

function buildGeneralNutritionTarget(day, base, targetKcal, shouldAdjust) {
  const kcal = hasNumber(targetKcal) ? Math.round(Number(targetKcal)) : base.kcal;
  const derived = hasNumber(kcal)
    ? deriveCarbsForKcal(kcal, base.p, base.g)
    : { p: base.p, c: base.c, g: base.g, warning: "" };
  const adjusted = shouldAdjust && hasNumber(base.kcal) && hasNumber(kcal) && Math.abs(Number(kcal) - Number(base.kcal)) > 1;

  return {
    key: day.key,
    label: day.label,
    kcal,
    p: hasNumber(derived.p) ? roundTrackingNumber(derived.p) : null,
    c: hasNumber(derived.c) ? roundTrackingNumber(derived.c) : null,
    g: hasNumber(derived.g) ? roundTrackingNumber(derived.g) : null,
    note: "",
    customized: false,
    adjusted,
    warning: derived.warning,
    statusLabel: adjusted ? "General ajustado" : "General",
    valid: hasNumber(kcal) && hasNumber(derived.p),
  };
}

function resolveClientNutritionWeek(user = {}) {
  const base = buildBaseNutritionTarget(user);
  const weeklyPlan = resolveWeeklyNutritionPlanForUser(user);
  const caloriesByDay = weeklyPlan?.caloriesByDay || {};
  const macrosByDay = weeklyPlan?.macrosByDay || {};
  const weeklyKcalTarget = hasNumber(base.kcal) ? Number(base.kcal) * WEEKLY_MENU_DAY_META.length : null;

  const customized = new Map();
  WEEKLY_MENU_DAY_META.forEach((day) => {
    const calorieEntry = findDayValue(caloriesByDay, day);
    const macroEntry = findDayValue(macrosByDay, day);
    if (!calorieEntry.found && !macroEntry.found) return;
    const macros = isPlainObject(macroEntry.value) ? macroEntry.value : {};
    customized.set(day.key, buildCustomizedNutritionTarget(day, base, macros, calorieEntry.value));
  });

  const generalDays = WEEKLY_MENU_DAY_META.filter((day) => !customized.has(day.key));
  const customizedKcal = [...customized.values()].reduce((sum, target) => sum + (hasNumber(target.kcal) ? Number(target.kcal) : 0), 0);
  const adjustedKcal = weeklyKcalTarget !== null && generalDays.length
    ? Math.max(0, (weeklyKcalTarget - customizedKcal) / generalDays.length)
    : base.kcal;

  const targets = {};
  WEEKLY_MENU_DAY_META.forEach((day) => {
    targets[day.key] = customized.get(day.key) || buildGeneralNutritionTarget(day, base, adjustedKcal, customized.size > 0);
  });

  const currentWeeklyKcal = Object.values(targets).reduce((sum, target) => sum + (hasNumber(target.kcal) ? Number(target.kcal) : 0), 0);
  return {
    base,
    targets,
    days: WEEKLY_MENU_DAY_META.map((day) => targets[day.key]),
    summary: {
      weeklyKcalTarget,
      currentWeeklyKcal: Math.round(currentWeeklyKcal),
      difference: weeklyKcalTarget === null ? null : Math.round(currentWeeklyKcal - weeklyKcalTarget),
      customizedDays: customized.size,
      adjustedGeneralDays: Object.values(targets).filter((target) => target.adjusted).length,
    },
  };
}

function nutritionTargetSignature(target = {}) {
  return JSON.stringify({
    kcal: comparableNumber(target?.kcal),
    p: comparableNumber(target?.p),
    c: comparableNumber(target?.c),
    g: comparableNumber(target?.g),
  });
}

function compactNutritionTarget(target = {}) {
  return {
    kcal: comparableNumber(target?.kcal),
    p: comparableNumber(target?.p),
    c: comparableNumber(target?.c),
    g: comparableNumber(target?.g),
  };
}

function assignedEntryForDay(assignments = {}, day = {}) {
  if (!isPlainObject(assignments)) return null;
  const matchingKey = Object.keys(assignments).find((key) => getWeekDayMeta(key)?.key === day.key);
  if (matchingKey === undefined || !isPlainObject(assignments[matchingKey])) return null;
  return { storageKey: matchingKey, value: assignments[matchingKey] };
}

function assignedMenuCount(entry = {}) {
  if (!isPlainObject(entry)) return 0;
  const normalized = normalizeAssignedMenusByDay({ monday: entry }).monday;
  if (!normalized) return 0;
  return 1 + (Array.isArray(normalized.alternatives) ? normalized.alternatives.length : 0);
}

function primaryAssignedEntry(entry = {}) {
  return isPlainObject(entry?.primaryMenu) ? entry.primaryMenu : entry;
}

function assignmentCreatedForNutritionTarget(entry = {}, target = {}) {
  const primary = primaryAssignedEntry(entry);
  const targetMacros = primary?.targetMacros || {};
  const hasCalories = hasNumber(primary?.targetCalories) && Number(primary.targetCalories) > 0;
  const hasMacros = ["p", "c", "g"].every((key) => hasNumber(targetMacros?.[key]));
  if (!hasCalories || !hasMacros) return null;
  return (
    comparableNumber(primary.targetCalories) === comparableNumber(target?.kcal) &&
    comparableNumber(targetMacros.p) === comparableNumber(target?.p) &&
    comparableNumber(targetMacros.c) === comparableNumber(target?.c) &&
    comparableNumber(targetMacros.g) === comparableNumber(target?.g)
  );
}

function assignmentPredatesNutritionTargets(client = {}, entry = {}) {
  const primary = primaryAssignedEntry(entry);
  const assignedAt = new Date(primary?.assignedAt || "").getTime();
  const targetRevision = new Date(
    client?.menu?.weeklyPlan?.targetsUpdatedAt ||
    client?.metasActuales?.updatedAt ||
    ""
  ).getTime();
  return Number.isFinite(assignedAt) && Number.isFinite(targetRevision) && assignedAt < targetRevision;
}

function isStaleNutritionAssignment(client = {}, entry = {}, target = {}) {
  const createdForTarget = assignmentCreatedForNutritionTarget(entry, target);
  if (createdForTarget !== null) return !createdForTarget;
  return assignmentPredatesNutritionTargets(client, entry);
}

function buildNutritionAssignmentImpact(currentClient = {}, nextClient = {}) {
  const assignments = currentClient?.menu?.weeklyPlan?.assignedMenusByDay || {};
  const currentWeek = resolveClientNutritionWeek(currentClient);
  const nextWeek = resolveClientNutritionWeek(nextClient);
  const affectedDays = WEEKLY_MENU_DAY_META.reduce((days, day) => {
    const assigned = assignedEntryForDay(assignments, day);
    if (!assigned) return days;
    const previousTarget = currentWeek.targets?.[day.key] || {};
    const nextTarget = nextWeek.targets?.[day.key] || {};
    const targetChanged = nutritionTargetSignature(previousTarget) !== nutritionTargetSignature(nextTarget);
    const staleAssignment = isStaleNutritionAssignment(currentClient, assigned.value, nextTarget);
    if (!targetChanged && !staleAssignment) return days;
    days.push({
      key: day.key,
      label: day.label,
      assignedMenus: assignedMenuCount(assigned.value),
      previousTarget: compactNutritionTarget(previousTarget),
      nextTarget: compactNutritionTarget(nextTarget),
      reason: targetChanged ? "target_changed" : "stale_assignment",
    });
    return days;
  }, []);

  return {
    affectedDays,
    affectedDayKeys: affectedDays.map((day) => day.key),
    assignedMenus: affectedDays.reduce((total, day) => total + day.assignedMenus, 0),
    changedDays: affectedDays.filter((day) => day.reason === "target_changed").length,
    staleDays: affectedDays.filter((day) => day.reason === "stale_assignment").length,
    previousWeeklyKcal: comparableNumber(currentWeek?.summary?.currentWeeklyKcal),
    nextWeeklyKcal: comparableNumber(nextWeek?.summary?.currentWeeklyKcal),
  };
}

function normalizedExpectedInvalidationDays(value = []) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((day) => getWeekDayMeta(day)?.key).filter(Boolean))].sort();
}

function sameStringArray(left = [], right = []) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function moveInvalidatedAssignments(assignments = {}, affectedDayKeys = []) {
  const affected = new Set(affectedDayKeys);
  return Object.entries(isPlainObject(assignments) ? assignments : {}).reduce(
    (result, [storageKey, entry]) => {
      const normalizedDay = getWeekDayMeta(storageKey)?.key;
      if (normalizedDay && affected.has(normalizedDay)) {
        result.invalidated[normalizedDay] = entry;
      } else {
        result.remaining[storageKey] = entry;
      }
      return result;
    },
    { remaining: {}, invalidated: {} }
  );
}

function normalizeMenuTrackingDate(value = "") {
  const raw = cleanString(value || new Date().toISOString().slice(0, 10), 20).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error("INVALID_DATE");
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) throw new Error("INVALID_DATE");
  return raw;
}

function mondayOfWeek(value = "") {
  const normalized = normalizeMenuTrackingDate(value);
  const date = new Date(`${normalized}T00:00:00.000Z`);
  const day = date.getUTCDay();
  const diff = (day + 6) % 7;
  date.setUTCDate(date.getUTCDate() - diff);
  return date.toISOString().slice(0, 10);
}

function addDaysIso(start, days) {
  const date = new Date(`${normalizeMenuTrackingDate(start)}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function dayKeyFromDate(dateValue) {
  const date = new Date(`${normalizeMenuTrackingDate(dateValue)}T00:00:00.000Z`);
  const keys = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  return keys[date.getUTCDay()] || "monday";
}

function menuSnapshotTotals(snapshot = {}) {
  return {
    kcal: roundTrackingNumber(snapshot?.kcal ?? snapshot?.calorias ?? snapshot?.calories, 0),
    proteina: roundTrackingNumber(snapshot?.protein ?? snapshot?.proteina ?? snapshot?.proteinas, 0),
    carbs: roundTrackingNumber(snapshot?.carbs ?? snapshot?.carbohidratos ?? snapshot?.carbohydrates, 0),
    grasas: roundTrackingNumber(snapshot?.fat ?? snapshot?.grasas, 0),
  };
}

function emptyTrackingTotals() {
  return { kcal: 0, proteina: 0, carbs: 0, grasas: 0 };
}

function roundTrackingTotals(totals = {}) {
  return {
    kcal: roundTrackingNumber(totals.kcal ?? totals.calorias ?? totals.calories, 0),
    proteina: roundTrackingNumber(totals.proteina ?? totals.proteinas ?? totals.protein, 0),
    carbs: roundTrackingNumber(totals.carbs ?? totals.carbohidratos ?? totals.carbohydrates, 0),
    grasas: roundTrackingNumber(totals.grasas ?? totals.fat, 0),
  };
}

function addTrackingTotals(left = {}, right = {}) {
  const a = roundTrackingTotals(left);
  const b = roundTrackingTotals(right);
  return roundTrackingTotals({
    kcal: a.kcal + b.kcal,
    proteina: a.proteina + b.proteina,
    carbs: a.carbs + b.carbs,
    grasas: a.grasas + b.grasas,
  });
}

function subtractTrackingTotals(target = {}, consumed = {}) {
  const t = roundTrackingTotals(target);
  const c = roundTrackingTotals(consumed);
  return roundTrackingTotals({
    kcal: t.kcal - c.kcal,
    proteina: t.proteina - c.proteina,
    carbs: t.carbs - c.carbs,
    grasas: t.grasas - c.grasas,
  });
}

function targetToTrackingTotals(target = {}) {
  return roundTrackingTotals({
    kcal: target?.kcal,
    proteina: target?.p ?? target?.proteina ?? target?.protein,
    carbs: target?.c ?? target?.carbs,
    grasas: target?.g ?? target?.grasas ?? target?.fat,
  });
}

function snapshotMealId(meal = {}, index = 0) {
  return cleanString(meal.id || meal._id || meal.nombre || meal.name || `meal-${index + 1}`, 100) || `meal-${index + 1}`;
}

function snapshotMealTotals(meal = {}) {
  const totals = isPlainObject(meal.totales || meal.totals) ? meal.totales || meal.totals : meal;
  return roundTrackingTotals(totals);
}

function buildCompletedMenuMealsFromPayload(payload = {}, snapshot = {}, status = "pending") {
  const meals = Array.isArray(snapshot?.meals) ? snapshot.meals : [];
  const explicitIds = Array.isArray(payload.completedMenuMealIds)
    ? payload.completedMenuMealIds
    : Array.isArray(payload.completedMealIds)
      ? payload.completedMealIds
      : Array.isArray(payload.completedMenuMeals)
        ? payload.completedMenuMeals.map((meal) => meal?.mealId || meal?.id)
        : null;
  const selected = explicitIds === null && status === "completed"
    ? new Set(meals.map((meal, index) => snapshotMealId(meal, index)))
    : new Set((explicitIds || []).map((id) => cleanString(id, 100)).filter(Boolean));

  return meals
    .map((meal, index) => {
      const mealId = snapshotMealId(meal, index);
      if (!selected.has(mealId)) return null;
      return {
        mealId,
        mealType: cleanString(meal.tipoComida || meal.type, 60) || "otro",
        name: cleanString(meal.nombre || meal.name, 140) || `Comida ${index + 1}`,
        source: "assigned_menu_meal",
        totals: snapshotMealTotals(meal),
      };
    })
    .filter(Boolean)
    .slice(0, 20);
}

function sanitizeTrackingEntry(entry = {}, fallbackSource = "manual_food", index = 0) {
  if (!isPlainObject(entry)) return null;
  const source = cleanString(entry.source || fallbackSource, 60) || fallbackSource;
  const rawFoods = Array.isArray(entry.foods)
    ? entry.foods
    : Array.isArray(entry.items)
      ? entry.items
      : [];
  const foods = rawFoods.slice(0, 40).map((food, foodIndex) => ({
        id: cleanString(food.id || food.alimentoId || `food-${foodIndex + 1}`, 100) || `food-${foodIndex + 1}`,
        name: cleanString(food.name || food.nombre || food.nombreSnapshot, 160) || "Alimento",
        quantity: numberOrNull(food.quantity ?? food.cantidad, { min: 0, max: 10000 }),
        unit: cleanString(food.unit || food.unidad || "g", 24) || "g",
        kcal: numberOrNull(food.kcal ?? food.calorias ?? food.calories, { min: 0, max: 20000 }),
        proteina: numberOrNull(food.proteina ?? food.proteinas ?? food.protein, { min: 0, max: 1000 }),
        carbs: numberOrNull(food.carbs ?? food.carbohidratos ?? food.carbohydrates, { min: 0, max: 2000 }),
        grasas: numberOrNull(food.grasas ?? food.fat, { min: 0, max: 1000 }),
        source: cleanString(food.source || "", 80),
      }));
  const totals = roundTrackingTotals(entry.totals || entry);
  return {
    id: cleanString(entry.id || `${source}-${index + 1}`, 100) || `${source}-${index + 1}`,
    date: entry.date ? cleanString(entry.date, 20) : null,
    dayKey: entry.dayKey ? cleanString(entry.dayKey, 30) : null,
    name: cleanString(entry.name || entry.nombre, 160) || `Comida ${index + 1}`,
    source,
    generationRunId: entry.generationRunId ? cleanString(entry.generationRunId, 120) : null,
    runId: entry.runId ? cleanString(entry.runId, 120) : null,
    mode: entry.mode ? cleanString(entry.mode, 80) : null,
    scope: entry.scope ? cleanString(entry.scope, 40) : null,
    weekStart: entry.weekStart ? cleanString(entry.weekStart, 20) : null,
    weekEnd: entry.weekEnd ? cleanString(entry.weekEnd, 20) : null,
    activeFromDate: entry.activeFromDate ? cleanString(entry.activeFromDate, 20) : null,
    activeUntilDate: entry.activeUntilDate ? cleanString(entry.activeUntilDate, 20) : null,
    isActiveReplacement: entry.isActiveReplacement === false ? false : true,
    mealType: entry.mealType ? cleanString(entry.mealType, 60) : null,
    replacesMealIds: Array.isArray(entry.replacesMealIds)
      ? entry.replacesMealIds.map((id) => cleanString(id, 100)).filter(Boolean).slice(0, 20)
      : [],
    replacesMealTypes: Array.isArray(entry.replacesMealTypes)
      ? entry.replacesMealTypes.map((type) => cleanString(type, 60)).filter(Boolean).slice(0, 20)
      : [],
    replacesMealNames: Array.isArray(entry.replacesMealNames)
      ? entry.replacesMealNames.map((name) => cleanString(name, 140)).filter(Boolean).slice(0, 20)
      : [],
    target: entry.target ? roundTrackingTotals(entry.target) : null,
    items: foods,
    foods,
    totals,
    createdAt: entry.createdAt ? cleanString(entry.createdAt, 40) : null,
    updatedAt: entry.updatedAt ? cleanString(entry.updatedAt, 40) : null,
  };
}

function sanitizeTrackingEntries(value = [], fallbackSource = "manual_food") {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry, index) => sanitizeTrackingEntry(entry, fallbackSource, index))
    .filter(Boolean)
    .slice(0, 20);
}

function sumTrackingEntryTotals(entries = []) {
  return entries.reduce((acc, entry) => addTrackingTotals(acc, entry?.totals || entry), emptyTrackingTotals());
}

function trackingTotalsByDate(entries = []) {
  return (Array.isArray(entries) ? entries : []).reduce((totalsByDate, entry) => {
    const date = String(entry?.date || "");
    if (!date) return totalsByDate;
    totalsByDate.set(date, addTrackingTotals(totalsByDate.get(date), entry));
    return totalsByDate;
  }, new Map());
}

function calculateDietAdherence(consumedTotals = {}, targetTotals = {}) {
  const consumed = roundTrackingTotals(consumedTotals);
  const target = roundTrackingTotals(targetTotals);
  if (target.kcal <= 0 && target.proteina <= 0) return null;

  const kcalScore = target.kcal > 0
    ? Math.max(0, 100 - Math.abs(consumed.kcal - target.kcal) / target.kcal * 100)
    : null;
  const proteinScore = target.proteina > 0
    ? Math.max(0, 100 - Math.abs(consumed.proteina - target.proteina) / target.proteina * 100)
    : null;

  if (kcalScore === null) return roundTrackingNumber(proteinScore, 0);
  if (proteinScore === null) return roundTrackingNumber(kcalScore, 0);
  return roundTrackingNumber((kcalScore * 0.6) + (proteinScore * 0.4), 0);
}

function deriveDailyTrackingStatus(consumedTotals = {}, targetTotals = {}, status = "pending") {
  if (status === "missed") return "missed";
  const consumed = roundTrackingTotals(consumedTotals);
  const target = roundTrackingTotals(targetTotals);
  if (consumed.kcal <= 0 && consumed.proteina <= 0 && consumed.carbs <= 0 && consumed.grasas <= 0) {
    return "pending";
  }
  if (target.kcal > 0 && consumed.kcal > target.kcal * 1.08) return "exceeded";
  const kcalClose = target.kcal > 0 && Math.abs(consumed.kcal - target.kcal) <= Math.max(60, target.kcal * 0.08);
  const proteinOk = target.proteina <= 0 || consumed.proteina >= target.proteina - 8;
  if (kcalClose && proteinOk) return "completed";
  return "in_progress";
}

function normalizeManualCompletionPlan(value = null, previous = null) {
  if (!value && !previous) return null;
  const source = value && typeof value === "object" ? value : previous || {};
  const previousMoments = Array.isArray(previous?.moments) ? previous.moments : [];
  const count = Math.max(1, Math.min(4, Math.trunc(Number(source.count || source.momentsCount || previous?.count || 1))));
  const suppliedMoments = Array.isArray(source.moments) ? source.moments : [];
  return {
    count,
    moments: Array.from({ length: count }, (_, index) => {
      const incoming = suppliedMoments[index] || previousMoments[index] || {};
      return {
        id: cleanString(incoming.id || `manual_completion_moment_${index + 1}`, 80),
        label: cleanString(incoming.label || incoming.name || `Momento ${index + 1}`, 80),
        order: index,
      };
    }),
    createdAt: previous?.createdAt || source.createdAt || new Date(),
    updatedAt: new Date(),
  };
}

function manualCompletionPublic(doc = null) {
  const completion = doc?.manualCompletion || null;
  const mode = DAY_COMPLETION_MODES.has(String(doc?.dayCompletionMode || ""))
    ? String(doc.dayCompletionMode)
    : "menu";
  if (mode !== "manual_completion" || !completion) {
    return {
      dayCompletionMode: "menu",
      manualCompletion: null,
    };
  }
  return {
    dayCompletionMode: mode,
    manualCompletion: {
      startedAt: completion.startedAt || null,
      startedFromMenu: completion.startedFromMenu === true,
      startedCompletedMealsCount: hasNumber(completion.startedCompletedMealsCount)
        ? Number(completion.startedCompletedMealsCount)
        : null,
      startedTotalMealsCount: hasNumber(completion.startedTotalMealsCount)
        ? Number(completion.startedTotalMealsCount)
        : null,
      startedBy: completion.startedBy ? idToString(completion.startedBy) : null,
      plan: completion.plan
        ? {
            count: Number(completion.plan.count) || (completion.plan.moments || []).length || 1,
            moments: (Array.isArray(completion.plan.moments) ? completion.plan.moments : []).map((moment, index) => ({
              id: cleanString(moment?.id || `manual_completion_moment_${index + 1}`, 80),
              label: cleanString(moment?.label || `Momento ${index + 1}`, 80),
              order: index,
            })),
            createdAt: completion.plan.createdAt || null,
            updatedAt: completion.plan.updatedAt || null,
          }
        : null,
    },
  };
}

function ratioPercent(value = 0, target = 0) {
  const safeTarget = Number(target);
  if (!Number.isFinite(safeTarget) || safeTarget <= 0) return null;
  return roundTrackingNumber((Number(value) || 0) / safeTarget * 100);
}

function assignedMenuPublic(entry = null) {
  if (!entry) return null;
  const snapshot = entry.menuSnapshot || {};
  return {
    menuId: idToString(entry.menuId),
    source: entry.source || "base",
    assignedAt: entry.assignedAt || null,
    menuSnapshot: {
      ...snapshot,
      totals: menuSnapshotTotals(snapshot),
    },
  };
}

function trackingPublic(doc = null, manualTrackingTotals = null) {
  if (!doc) {
    return {
      status: "pending",
      adherencePercent: null,
      reason: "",
      note: "",
      completedMenuMealIds: [],
      completedMenuMeals: [],
      manualEntries: [],
      generatedRemainingMeals: [],
      mealReplacements: [],
      foodReplacements: [],
      consumedTotals: emptyTrackingTotals(),
      manualTrackingTotals: manualTrackingTotals ? roundTrackingTotals(manualTrackingTotals) : null,
      totalConsumedTotals: manualTrackingTotals ? roundTrackingTotals(manualTrackingTotals) : null,
      remainingTotals: null,
      menuAdherencePercent: null,
      nutritionAdherencePercent: null,
      dayCompletionMode: "menu",
      manualCompletion: null,
      updatedAt: null,
    };
  }
  const nutrition = doc.nutrition || {};
  const storedCompletion = doc.manualCompletion || {};
  const completedMenuMeals = Array.isArray(doc.completedMenuMeals) ? doc.completedMenuMeals : [];
  const totalMealsCount = hasNumber(nutrition.totalMealsCount)
    ? Number(nutrition.totalMealsCount)
    : hasNumber(storedCompletion.startedTotalMealsCount)
      ? Number(storedCompletion.startedTotalMealsCount)
      : null;
  const completedMealsCount = hasNumber(nutrition.completedMealsCount)
    ? Number(nutrition.completedMealsCount)
    : completedMenuMeals.length;
  const consumedTotals = roundTrackingTotals(doc.consumedTotals || {});
  const hydratedManualTotals = manualTrackingTotals === null
    ? null
    : roundTrackingTotals(manualTrackingTotals);
  const totalConsumedTotals = hydratedManualTotals === null
    ? null
    : addTrackingTotals(consumedTotals, hydratedManualTotals);
  const targetTotals = roundTrackingTotals(doc.target || {});
  const completion = manualCompletionPublic(doc);
  return {
    id: idToString(doc._id || doc.id),
    date: doc.date || null,
    dayKey: doc.dayKey || null,
    status: MENU_TRACKING_STATUS.has(nutrition.status) ? nutrition.status : "pending",
    adherencePercent: hasNumber(nutrition.adherencePercent) ? roundTrackingNumber(nutrition.adherencePercent) : null,
    completedMealsCount,
    totalMealsCount,
    menuAdherencePercent: totalMealsCount > 0
      ? roundTrackingNumber((completedMealsCount / totalMealsCount) * 100)
      : null,
    nutritionAdherencePercent: totalConsumedTotals
      ? ratioPercent(totalConsumedTotals.kcal, targetTotals.kcal)
      : null,
    reason: cleanString(nutrition.reason || "", 120),
    note: cleanString(nutrition.note || "", 1000),
    selectedAlternative: nutrition.selectedAlternative || null,
    completedMenuMealIds: completedMenuMeals.map((meal) => cleanString(meal.mealId, 100)).filter(Boolean),
    completedMenuMeals,
    manualEntries: Array.isArray(doc.manualEntries) ? doc.manualEntries : [],
    generatedRemainingMeals: Array.isArray(doc.generatedRemainingMeals) ? doc.generatedRemainingMeals : [],
    mealReplacements: Array.isArray(doc.mealReplacements) ? doc.mealReplacements : [],
    foodReplacements: Array.isArray(doc.foodReplacements) ? doc.foodReplacements : [],
    consumedTotals,
    manualTrackingTotals: hydratedManualTotals,
    totalConsumedTotals,
    remainingTotals: doc.remainingTotals ? roundTrackingTotals(doc.remainingTotals) : null,
    ...completion,
    updatedAt: doc.updatedAt || null,
  };
}

function clientMenuTrackingPermissions(user = {}) {
  const permissions = user?.clientPermissions || {};
  const menu = isPlainObject(permissions.menu) ? permissions.menu : {};
  const tracking = isPlainObject(permissions.tracking) ? permissions.tracking : {};
  const hasCoach = !!user?.coach?.entrenadorId;
  const activeSource = String(user?.menu?.activeSource || "none");
  const canViewAssignedMenus = activeSource === "own" ? true : hasCoach ? boolFrom(menu.canViewMenu, true) : true;
  const accessCapabilities = resolveClientAccessContext(user)?.capabilities || {};

  return {
    canViewAssignedMenus,
    canMarkMenuMealsCompleted: canViewAssignedMenus && boolFrom(tracking.canMarkMenuMealsCompleted, true),
    canTrackFoods: canViewAssignedMenus && boolFrom(tracking.canTrackFoods, true),
    canAutoCompleteRemainingMeals: canViewAssignedMenus && accessCapabilities.canAutoCompleteRemainingMeals === true,
    canUseFlexibleMarginRecommendations:
      canViewAssignedMenus && accessCapabilities.canUseFlexibleMarginRecommendations === true,
    canUseManualDayCompletion:
      canViewAssignedMenus && accessCapabilities.canUseManualDayCompletion !== false,
    canPlanRemainingIntake:
      canViewAssignedMenus && accessCapabilities.canPlanRemainingIntake === true,
    canAutoCalculateTrackingQuantities:
      canViewAssignedMenus && accessCapabilities.canAutoCalculateTrackingQuantities === true,
    canUseMenuAlternatives: canViewAssignedMenus && boolFrom(tracking.canUseMenuAlternatives, true),
  };
}

function sameAssignedMenu(a = {}, b = {}) {
  const left = String(a.menuId || a.menuSnapshot?.baseId || a.menuSnapshot?.id || a.menuSnapshot?.name || "").toLowerCase();
  const right = String(b.menuId || b.menuSnapshot?.baseId || b.menuSnapshot?.id || b.menuSnapshot?.name || "").toLowerCase();
  return Boolean(left && right && left === right);
}

function boolFrom(value, fallback = false) {
  if (value === undefined || value === null) return !!fallback;
  return !!value;
}

function anyTruthy(value = {}) {
  return Object.values(value || {}).some(Boolean);
}

function disableCapabilitySection(value = {}) {
  return Object.fromEntries(
    Object.entries(value || {}).map(([key, entry]) => [
      key,
      typeof entry === "number" ? 0 : false,
    ])
  );
}

function normalizeBuilderMode(mode, fallback = "manual") {
  const m = String(mode || fallback).trim().toLowerCase();
  if (["automatic", "auto", "automatica", "automatico"].includes(m)) return "automatic";
  if (["semiautomatic", "semi", "semi_automatic", "semiautomatica", "semiautomatico"].includes(m)) {
    return "semiautomatic";
  }
  if (["hybrid", "hibrido", "hibrida"].includes(m)) return "hybrid";
  return "manual";
}

function featureKeyForMode(mode) {
  if (mode === "automatic") return "automaticGenerator";
  if (mode === "semiautomatic" || mode === "hybrid") return "semiAutomaticBuilder";
  return "manualBuilder";
}

function inferTipoFromRole(role) {
  const r = normalizeRole(role);
  if (r === "cliente") return "entrenado";
  if (r === "coach") return "entrenador";
  return "admin";
}

class ServicioUsuarios {
  constructor(persistencia) {
    this.model = ModelFactory.get(persistencia);

    console.log("MODEL REAL =", this.model?.constructor?.name);
    console.log("METODOS DEL MODEL =", Object.getOwnPropertyNames(Object.getPrototypeOf(this.model)));
    console.log("touchLastActivityById =", this.model?.touchLastActivityById);
    console.log("typeof touchLastActivityById =", typeof this.model?.touchLastActivityById);

    if (typeof this.model.ensureIndexes === "function") {
      this.model.ensureIndexes().catch(() => {});
    }

    this.pendingModel = new ModelMongoDBPendingUsers();
    if (typeof this.pendingModel.ensureIndexes === "function") {
      this.pendingModel.ensureIndexes().catch(() => {});
    }

    this.resetModel = new ModelMongoDBPasswordResets();
    if (typeof this.resetModel.ensureIndexes === "function") {
      this.resetModel.ensureIndexes().catch(() => {});
    }

    this.invitedModel = new ModelMongoDBInvitedUsers();
    if (typeof this.invitedModel.ensureIndexes === "function") {
      this.invitedModel.ensureIndexes().catch(() => {});
    }

    this.coachPlanModel = new ModelMongoDBCoachPlanConfigs();
    if (typeof this.coachPlanModel.ensureSeedDefaults === "function") {
      this.coachPlanModel.ensureSeedDefaults().catch(() => {});
    }

    this.clientPlanModel = new ModelMongoDBClientPlanConfigs();
    if (typeof this.clientPlanModel.ensureSeedDefaults === "function") {
      this.clientPlanModel.ensureSeedDefaults().catch(() => {});
    }

    this.impersonationAuditModel = new ModelMongoDBImpersonationAudit();
    if (typeof this.impersonationAuditModel.ensureIndexes === "function") {
      this.impersonationAuditModel.ensureIndexes().catch(() => {});
    }

    this.menuTrackingModel = new ModelMongoDBClientMenuTracking();
    if (typeof this.menuTrackingModel.ensureIndexes === "function") {
      this.menuTrackingModel.ensureIndexes().catch(() => {});
    }
    this.foodLogsModel = new ModelMongoDBFoodLogs();
    this.menusModel = new ModelMongoDBMenus();
    this.comidasModel = new ModelMongoDBComidas();
    this.comidasGuardadasModel = new ModelMongoDBComidasGuardadas();
    this.coachCapacityModel = new ModelMongoDBCoachClientCapacity();
    if (typeof this.coachCapacityModel.ensureIndexes === "function") {
      this.coachCapacityModel.ensureIndexes().catch(() => {});
    }

    this.clientCoachBlocksModel = new ModelMongoDBClientCoachBlocks();
    if (typeof this.clientCoachBlocksModel.ensureIndexes === "function") {
      this.clientCoachBlocksModel.ensureIndexes().catch(() => {});
    }

    this.rutinasModel = new ModelMongoDBRutinas();
  }

  // -------------------------
  // Helpers base
  // -------------------------
  async _findUserByEmail(email) {
    if (!email) return null;

    if (typeof this.model.obtenerPorEmail === "function") {
      return await this.model.obtenerPorEmail(email);
    }

    if (typeof this.model.obtenerUsuarios === "function") {
      const usuarios = await this.model.obtenerUsuarios();
      return (
        usuarios.find((u) => (u.email || "").toLowerCase() === email.toLowerCase()) ||
        null
      );
    }

    throw new Error("El modelo no implementa obtenerPorEmail ni obtenerUsuarios");
  }

  _normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
  }

  _coachInviteExpiryFrom(now = new Date()) {
    return new Date(now.getTime() + COACH_INVITATION_EXPIRY_MS);
  }

  _publicCoachInviteState(invite = {}) {
    const status = String(invite?.status || "pending");
    if (status === "pending") return "pending";
    if (status === "accepted_pending_activation") return "accepted_pending_activation";
    if (status === "active") return "active";
    if (this._isInviteExpired(invite)) return "expired";
    return status;
  }

  _isEligibleInviteeClient(user) {
    if (!user) return true;
    if (!this._isClientUser(user)) return false;
    const estado = String(user?.estado || "activo").toLowerCase();
    return ["activo", "active"].includes(estado);
  }

  _coachTargetMatchesInvitation(invite, coachId) {
    const id = idToString(coachId);
    return (
      idToString(invite?.assignedCoachId) === id ||
      (String(invite?.invitedByType || "") === "coach" && idToString(invite?.invitedBy) === id)
    );
  }

  async _findInviteByEmail(email) {
    if (!email) return null;
    return await this.invitedModel.findPendingByEmail(String(email).toLowerCase().trim());
  }

  async _deleteInviteById(id) {
    if (!id) return null;
    return await this.invitedModel.deleteById(id);
  }

  async _acceptInviteById(id, acceptedUserId = null) {
    if (!id || typeof this.invitedModel.updateById !== "function") return null;
    const patch = {
      status: "accepted",
      acceptedAt: new Date(),
      updatedAt: new Date(),
    };

    if (acceptedUserId) patch.acceptedUserId = toMongoIdOrString(acceptedUserId);

    return await this.invitedModel.updateById(id, patch);
  }

  async _markCoachInviteAcceptedPendingActivation(id, acceptedUserId = null) {
    if (!id || typeof this.invitedModel.updateById !== "function") return null;
    const now = new Date();
    const patch = {
      status: "accepted_pending_activation",
      acceptedAt: now,
      updatedAt: now,
    };

    if (acceptedUserId) patch.acceptedUserId = toMongoIdOrString(acceptedUserId);

    return await this.invitedModel.updateById(id, patch);
  }

  _isCoachClientInvite(invite) {
    if (!invite) return false;
    const role = normalizeRole(invite.targetRole || invite.role);
    return String(invite.source || "") === "coach_invite" && role === "cliente";
  }

  async _findPendingInviteForEmail(email, inviteId = null) {
    if (inviteId && typeof this.invitedModel.getById === "function") {
      const invite = await this.invitedModel.getById(inviteId);
      if (
        invite &&
        String(invite.email || "").toLowerCase().trim() === String(email || "").toLowerCase().trim() &&
        String(invite.status || "") === "pending"
      ) {
        return invite;
      }

      throw new Error("INVITATION_NOT_FOUND");
    }

    return await this._findInviteByEmail(email);
  }

  _isInviteExpired(invite) {
    if (!invite?.expiresAt) return false;
    const expiresAt = new Date(invite.expiresAt).getTime();
    return Number.isFinite(expiresAt) && expiresAt <= Date.now();
  }

  _sameInvitationId(left, right) {
    return idToString(left?._id || left?.id || left) === idToString(right?._id || right?.id || right);
  }

  _publicCoachClientInvitation(invite = {}, coach = null) {
    const snapshot = invite?.coachSnapshot || {};
    const coachProfile = coach?.profile || {};
    const coachName = [
      snapshot.nombre || coachProfile.nombre || coach?.nombre || "",
      snapshot.apellido || coachProfile.apellido || coach?.apellido || "",
    ].filter(Boolean).join(" ").trim() || snapshot.email || coach?.email || "Coach";

    return {
      id: idToString(invite._id || invite.id),
      coachId: idToString(invite.assignedCoachId || snapshot.id || invite.invitedBy),
      coachName,
      coachEmail: snapshot.email || coach?.email || "",
      servicePackage: normalizeServicePackage(invite.servicePackage || invite?.coachAccess?.servicePackage || snapshot.servicePackage || "service_pro"),
      serviceLabel: normalizeServicePackage(invite.servicePackage || invite?.coachAccess?.servicePackage || snapshot.servicePackage || "service_pro") === "service_vip"
        ? "Coach VIP"
        : "Coach Pro",
      serviceScopes: Array.isArray(invite.serviceScopes || invite?.coachAccess?.serviceScopes)
        ? (invite.serviceScopes || invite.coachAccess.serviceScopes).map((scope) => String(scope || "").trim()).filter(Boolean)
        : ["training", "nutrition"],
      price: invite.price || null,
      modality: invite.modality || null,
      message: cleanString(invite.message || "", 500),
      createdAt: invite.createdAt || invite.invitedAt || null,
      invitedAt: invite.invitedAt || invite.createdAt || null,
      expiresAt: invite.expiresAt || null,
      status: invite.status || "pending",
      onboarding: invite.onboarding || null,
    };
  }

  _coachDisplayName(coach = null) {
    if (!coach) return "Tu coach";
    const profile = coach.profile || {};
    return [
      profile.nombre || coach.nombre || "",
      profile.apellido || coach.apellido || "",
    ].filter(Boolean).join(" ").trim() || coach.email || "Tu coach";
  }

  _adminCoachAssignedNotice({ coach = null, adminId = null, now = new Date() } = {}) {
    const coachId = idToString(coach?._id || coach?.id);
    return {
      type: "admin_coach_assigned",
      status: "unread",
      coachId,
      coachName: this._coachDisplayName(coach),
      assignedByAdminId: adminId ? idToString(adminId) : null,
      createdAt: now,
    };
  }

  async _getPendingCoachClientInvitationForUser(user, invitationId = null) {
    const email = String(user?.email || "").toLowerCase().trim();
    const userId = idToString(user?._id || user?.id);
    if (!email) throw new Error("EMAIL_REQUERIDO");

    const candidates = invitationId
      ? [await this.invitedModel.getById(invitationId)]
      : (typeof this.invitedModel.findByEmail === "function"
          ? await this.invitedModel.findByEmail(email)
          : [await this._findInviteByEmail(email)]);

    const invite = (candidates || []).find((item) => (
      item &&
      (
        String(item.email || item.inviteeEmailNormalized || "").toLowerCase().trim() === email ||
        idToString(item.clientId) === userId ||
        idToString(item.acceptedUserId) === userId
      ) &&
      String(item.status || "pending") === "pending" &&
      this._isCoachClientInvite(item)
    ));

    if (!invite) throw new Error("INVITATION_NOT_FOUND");
    if (this._isInviteExpired(invite)) throw new Error("INVITATION_EXPIRED");
    return invite;
  }

  async _getActionableCoachClientInvitationForUser(user, invitationId = null) {
    const email = String(user?.email || "").toLowerCase().trim();
    const userId = idToString(user?._id || user?.id);
    if (!email) throw new Error("EMAIL_REQUERIDO");

    const candidates = invitationId
      ? [await this.invitedModel.getById(invitationId)]
      : (typeof this.invitedModel.findActionableCoachInvitesByTarget === "function"
          ? await this.invitedModel.findActionableCoachInvitesByTarget({ email, clientId: userId })
          : [await this._findInviteByEmail(email)]);

    const invite = (candidates || []).find((item) => (
      item &&
      (
        String(item.email || item.inviteeEmailNormalized || "").toLowerCase().trim() === email ||
        idToString(item.clientId) === userId ||
        idToString(item.acceptedUserId) === userId
      ) &&
      ["pending", "accepted_pending_activation"].includes(String(item.status || "pending")) &&
      this._isCoachClientInvite(item)
    ));

    if (!invite) throw new Error("INVITATION_NOT_FOUND");
    if (this._isInviteExpired(invite)) throw new Error("INVITATION_EXPIRED");
    return invite;
  }

  async _prepareCoachClientInviteAcceptance(invite) {
    if (!this._isCoachClientInvite(invite)) return null;
    if (!invite?.assignedCoachId) throw new Error("COACH_NOT_FOUND");

    const coach = await this.getById(idToString(invite.assignedCoachId));
    if (!coach) throw new Error("COACH_NOT_FOUND");
    if (!this._isCoachUser(coach)) throw new Error("USER_NOT_COACH");

    if (String(coach?.estado || "activo").toLowerCase() !== "activo") {
      throw new Error("COACH_NOT_ACTIVE");
    }

    if (coach?.coachCapabilities?.canInviteClients === false) {
      throw new Error("COACH_INVITES_DISABLED");
    }

    const specialties = coach?.professionalScopes || coach?.coachProfile?.specialties || {};
    if (!specialties.training && !specialties.nutrition) {
      throw new Error("COACH_SPECIALTIES_REQUERIDAS");
    }

    const coachRealId = coach._id || coach.id || invite.assignedCoachId;
    const assignedClients = await this._countClientsForCoach(coachRealId);
    const pendingInvitations = await this._countPendingClientInvitationsForCoach(coachRealId);
    const effectiveCapabilities = await this._resolveEffectiveCapabilities(coach, {
      currentClients: assignedClients,
    });

    if (effectiveCapabilities?.isTrialExpired || !effectiveCapabilities?.features?.clients?.canAssign) {
      throw new Error("COACH_NOT_AVAILABLE");
    }

    if (!effectiveCapabilities?.canReceiveClients) {
      throw coachClientCapacityError(effectiveCapabilities, assignedClients);
    }

    const coachIdToStore = toMongoIdOrString(coachRealId);
    const servicePackage = normalizeServicePackage(invite.servicePackage || invite.coachAccess?.servicePackage || "service_pro");
    const serviceScopes = Array.isArray(invite.serviceScopes || invite.coachAccess?.serviceScopes) && (invite.serviceScopes || invite.coachAccess.serviceScopes).length
      ? (invite.serviceScopes || invite.coachAccess.serviceScopes).map((scope) => String(scope || "").trim().toLowerCase()).filter(Boolean)
      : ["training", "nutrition"];
    const now = new Date();
    const pendingCoachAccess = {
      status: "accepted_pending_activation",
      coachId: coachIdToStore,
      servicePackage,
      serviceScopes,
      billingOwner: "coach",
      invitationId: invite._id || invite.id || null,
      startedAt: null,
      endsAt: null,
      suspendedAt: null,
      endedAt: null,
      updatedAt: now,
    };
    const activeCoachAccess = {
      ...pendingCoachAccess,
      status: "active",
      startedAt: now,
      updatedAt: now,
    };

    return {
      coach,
      effectiveCapabilities,
      clientPermissions: this._sanitizeClientPermissionsForCoach(
        coach,
        effectiveCapabilities,
        invite.clientPermissions || {}
      ),
      coachAssignment: {
        entrenadorId: coachIdToStore,
        assignedAt: now,
        assignedByAdminId: null,
        assignedByCoachId: coachIdToStore,
        source: "coach_invite",
        invitationId: invite._id || invite.id || null,
        servicePackage,
      },
      pendingCoachAccess,
      activeCoachAccess,
      coachAccess: pendingCoachAccess,
    };
  }

  async _buildUserFromInvite({
    invite,
    email,
    passwordHash,
    googleId = null,
    profile = {},
  }) {
    if (!invite) return null;

    const now = new Date();
    const coachInviteAcceptance = await this._prepareCoachClientInviteAcceptance(invite);
    const role = coachInviteAcceptance
      ? "cliente"
      : normalizeRole(invite.targetRole || invite.role || "cliente");

    const plan =
      role === "coach"
        ? (toCoachPlan(invite.plan) || "trial_pro")
        : role === "admin"
        ? (invite.plan || "free")
        : (invite.plan || "free");

    const tipo =
      role === "cliente"
        ? "entrenado"
        : role === "coach"
        ? "entrenador"
        : "admin";

    const invitedProfessionalPlan =
      role === "coach" ? normalizeProfessionalSubscriptionPlan(invite.professionalPlan) : null;
    const subscription =
      role === "coach"
        ? invitedProfessionalPlan
          ? {
              status: "active",
              trialStartedAt: null,
              trialEndsAt: null,
              paidUntil: null,
              updatedAt: now,
            }
          : createTrialSubscription({
              planCode: plan,
              now,
              durationDays: (await this._getCoachPlanConfig(plan))?.durationDays || 7,
            })
        : undefined;

    const normalizedCoachProfile =
      role === "coach"
        ? {
            specialties: {
              training: !!invite?.coachProfile?.specialties?.training,
              nutrition: !!invite?.coachProfile?.specialties?.nutrition,
            },
          }
        : null;

    const coachWelcome =
      role === "coach"
        ? {
            show: true,
            invitedAt: invite?.invitedAt || now,
            plan,
            specialties: {
              training: !!invite?.coachProfile?.specialties?.training,
              nutrition: !!invite?.coachProfile?.specialties?.nutrition,
            },
            trialEndsAt: subscription?.trialEndsAt || null,
            seenAt: null,
          }
        : null;

    return {
      email,
      passwordHash,
      googleId,

      ...getUserDefaults({ role, plan, tipo }),

      emailVerificado: true,
      profile: {
        ...(profile || {}),
        nombre: invite?.profile?.nombre || profile?.nombre || "",
        apellido: invite?.profile?.apellido || profile?.apellido || "",
      },
      ...(subscription ? { subscription } : {}),
      ...(invitedProfessionalPlan
        ? {
            coachSubscription: professionalSubscriptionPatch(invitedProfessionalPlan, {
              status: "active",
              now,
            }),
          }
        : {}),
      coachProfile: normalizedCoachProfile,
      coachOverrides: role === "coach" ? createEmptyCoachOverrides() : null,
      coachWelcome,
      ...(coachInviteAcceptance
        ? { onboarding: this._onboardingFromCoachInvite(invite?.onboarding || {}, now) }
        : {}),
      ...(coachInviteAcceptance?.pendingCoachAccess
        ? { coachAccess: coachInviteAcceptance.pendingCoachAccess }
        : {}),
      ...(coachInviteAcceptance?.clientPermissions
        ? { clientPermissions: coachInviteAcceptance.clientPermissions }
        : {}),
      settings: {},

      createdAt: now,
      updatedAt: null,
    };
  }

  _normalizeUser(u) {
    if (!u) return null;
    const id = u._id?.toString?.() || u.id?.toString?.() || u._id || u.id;
    return {
      ...u,
      _id: id,
      id,
      email: u.email,
      role: u.role || u.rol,
      passwordHash: u.passwordHash || u.password,
      googleId: u.googleId,
    };
  }

  async _createUser(data) {
    if (typeof this.model.registrarUsuario === "function") return await this.model.registrarUsuario(data);
    if (typeof this.model.crearUsuario === "function") return await this.model.crearUsuario(data);
    throw new Error("El modelo no implementa registrarUsuario/crearUsuario");
  }

  async _updateById(id, updates) {
    if (typeof this.model.updateById === "function") return await this.model.updateById(id, updates);
    if (typeof this.model.actualizarPorId === "function") return await this.model.actualizarPorId(id, updates);
    if (typeof this.model.actualizarPerfil === "function") return await this.model.actualizarPerfil(id, updates);
    throw new Error("El modelo no implementa updateById/actualizarPorId/actualizarPerfil");
  }

  _isCoachUser(u) {
    return normalizeRole(u?.role) === "coach";
  }

  _isClientUser(u) {
    return normalizeRole(u?.role) === "cliente";
  }

  async _resolveClientMenuPlan(user = {}) {
    const userId = idToString(user?._id || user?.id);
    const assignedMenusByDay = user?.menu?.weeklyPlan?.assignedMenusByDay || {};
    const currentCoachId = user?.coach?.entrenadorId || user?.coach?.coachId || user?.coachId || null;
    const hasCoach = Boolean(currentCoachId);
    if (hasCoach && hasAssignedMenuEntries(assignedMenusByDay)) {
      return {
        activeSource: "coach",
        assignments: assignedMenusByDay,
        activeMenu: null,
      };
    }

    const activeAssigned = hasCoach && userId
      ? await this.menusModel.getActiveForClientAndCoach(userId, currentCoachId).catch(() => null)
      : null;
    if (activeAssigned) {
      return {
        activeSource: "coach",
        assignments: buildAssignedMenusByDayFromMenuDoc(activeAssigned, "coach"),
        activeMenu: activeAssigned,
      };
    }

    const activeOwnMenuId = idToString(user?.menu?.activeOwnMenuId);
    if (String(user?.menu?.activeSource || "none") === "own" && activeOwnMenuId) {
      const ownMenu = await this.menusModel.getBaseById(activeOwnMenuId).catch(() => null);
      if (
        ownMenu &&
        ownMenu.ownerType === "cliente" &&
        idToString(ownMenu.ownerId) === userId &&
        ownMenu.estado !== "inactivo" &&
        ownMenu.activa !== false &&
        ownMenu.activo !== false
      ) {
        return {
          activeSource: "own",
          assignments: buildAssignedMenusByDayFromMenuDoc(ownMenu, "own"),
          activeMenu: ownMenu,
        };
      }
    }

    return {
      activeSource: "none",
      assignments: {},
      activeMenu: null,
    };
  }

  async _listAllUsersNormalized() {
    if (typeof this.model.obtenerUsuarios !== "function") {
      throw new Error("MODEL_SIN_LISTADO_USUARIOS");
    }

    const raw = await this.model.obtenerUsuarios();
    const arr = Array.isArray(raw) ? raw : raw?.users || raw?.usuarios || [];
    return arr.map((u) => this._normalizeUser(u));
  }

  async _listCoachesBase() {
    if (typeof this.model.listByRole === "function") {
      const arr = await this.model.listByRole("coach");
      return (arr || []).map((u) => this._normalizeUser(u));
    }

    const arr = await this._listAllUsersNormalized();
    return arr.filter((u) => this._isCoachUser(u));
  }

  async _listUnassignedClientsBase() {
    if (typeof this.model.listUnassignedClients === "function") {
      const arr = await this.model.listUnassignedClients();
      return (arr || []).map((u) => this._normalizeUser(u));
    }

    const arr = await this._listAllUsersNormalized();
    return arr.filter((u) => this._isClientUser(u) && !u?.coach?.entrenadorId);
  }

  async _listClientsForCoach(coachId) {
    if (typeof this.model.listClientsByCoachId === "function") {
      const arr = await this.model.listClientsByCoachId(coachId);
      return (arr || []).map((u) => this._normalizeUser(u));
    }

    const arr = await this._listAllUsersNormalized();
    return arr.filter(
      (u) =>
        this._isClientUser(u) &&
        String(u?.coach?.entrenadorId || "") === String(coachId)
    );
  }

  async _countClientsForCoach(coachId) {
    if (typeof this.model.countClientsByCoachId === "function") {
      return await this.model.countClientsByCoachId(coachId);
    }

    const clients = await this._listClientsForCoach(coachId);
    return clients.length;
  }

  _coachUnlinkedNotice({ coachId = null, reason = "coach_unlinked", now = new Date() } = {}) {
    return {
      type: "coach_unlinked",
      status: "unread",
      coachId: coachId ? idToString(coachId) : null,
      reason,
      message: "Ahora gestionas tu nutricion de forma independiente.",
      createdAt: now,
    };
  }

  _disconnectClientPatch(client = {}, { coachId = null, reason = "coach_unlinked", actor = null, now = new Date() } = {}) {
    const previousCoachAccess = client?.coachAccess || {};
    const disconnectedCoachId =
      coachId ||
      client?.coach?.entrenadorId ||
      previousCoachAccess?.coachId ||
      client?.coachId ||
      client?.entrenadorId ||
      client?.profesionalId ||
      null;
    const actorId = idToString(actor?._id || actor?.id || actor);
    const nextMetas = restoreMetasAfterCoachDisconnect(client, disconnectedCoachId);
    const currentWeeklyPlan = client?.menu?.weeklyPlan || {};
    const clearCoachWeeklyPlan = shouldClearCoachWeeklyPlanOnDisconnect(client, disconnectedCoachId);
    const clearCoachRoutine = shouldClearCoachRoutineOnDisconnect(client, disconnectedCoachId);
    const currentRoutine = client?.routine || {};
    const nextPersonalSubscription = restorePersonalSubscriptionAfterCoachDisconnect(client, now);

    return {
      coachId: null,
      entrenadorId: null,
      profesionalId: null,
      coach: {
        ...(client?.coach || {}),
        entrenadorId: null,
        coachId: null,
        assignedAt: null,
        assignedByAdminId: null,
        assignedByCoachId: null,
        source: null,
        endedAt: now,
        endedBy: actorId || "system",
        endedReason: reason,
      },
      coachAccess: {
        ...previousCoachAccess,
        status: "ended",
        active: false,
        coachId: previousCoachAccess?.coachId || disconnectedCoachId || null,
        profesionalId: previousCoachAccess?.profesionalId || disconnectedCoachId || null,
        billingOwner: "client",
        endedAt: previousCoachAccess?.endedAt || now,
        endedBy: actorId || "system",
        endedReason: reason,
        updatedAt: now,
      },
      personalSubscription: nextPersonalSubscription,
      menu: {
        ...(client?.menu || {}),
        activeSource: "none",
        activeOwnMenuId: null,
        ...(clearCoachWeeklyPlan
          ? {
              updatedByCoachId: null,
              coachNotes: "",
            }
          : {}),
        weeklyPlan: {
          ...currentWeeklyPlan,
          ...(clearCoachWeeklyPlan
            ? {
                caloriesByDay: {},
                macrosByDay: {},
                mealsByDay: {},
                generatedBy: null,
                generatorMode: null,
                sourceCoachId: null,
                updatedByCoachId: null,
                coachClearedAt: now,
              }
            : {}),
          assignedMenusByDay: {},
          updatedAt: now,
        },
        updatedAt: now,
      },
      clientPermissions: resetCoachDerivedClientPermissions(client?.clientPermissions || {}),
      metasActuales: nextMetas,
      nutrition: {
        ...(client?.nutrition || {}),
        coachDisconnectedAt: now,
        coachDisconnectedReason: reason,
      },
      ...(clearCoachRoutine
        ? {
            routine: {
              ...currentRoutine,
              mode: {
                ...(currentRoutine?.mode || {}),
                source: "none",
                editableByCoach: false,
                updatedByCoachId: null,
              },
              currentPlan: {
                ...(currentRoutine?.currentPlan || {}),
                isActive: false,
                deactivatedAt: now,
                deactivatedReason: reason,
              },
              coachNotes: "",
              coachDisconnectedAt: now,
              coachDisconnectedReason: reason,
              updatedByCoachId: null,
              updatedAt: now,
            },
          }
        : {}),
      clientCoachNotice: this._coachUnlinkedNotice({ coachId: disconnectedCoachId, reason, now }),
      coachChangeRequest: null,
      updatedAt: now,
    };
  }

  async disconnectClientFromCoach({
    clientId,
    coachId = null,
    reason = "coach_unlinked",
    actor = null,
    actorType = null,
    auditEvent = "coach_access_ended",
    auditMetadata = {},
  } = {}) {
    const client = await this.getById(clientId);
    if (!client) throw new Error("NOT_FOUND");
    if (!this._isClientUser(client)) throw new Error("USER_NOT_CLIENT");

    const currentCoachId = idToString(
      client?.coach?.entrenadorId ||
      client?.coachAccess?.coachId ||
      client?.coachId ||
      client?.entrenadorId ||
      client?.profesionalId
    );
    const disconnectCoachId = idToString(coachId || currentCoachId);
    const now = new Date();
    const actorId = idToString(actor?._id || actor?.id || actor);
    let revokedMenus = { matchedCount: 0, modifiedCount: 0 };
    let revokedLibraryMenus = { matchedCount: 0, modifiedCount: 0 };
    let revokedLibraryMeals = { matchedCount: 0, modifiedCount: 0 };
    let revokedRoutines = { matchedCount: 0, modifiedCount: 0 };

    if (disconnectCoachId && typeof this.menusModel.revokeActiveForClientAndCoach === "function") {
      revokedMenus = await this.menusModel.revokeActiveForClientAndCoach(clientId, disconnectCoachId, {
        revokedReason: reason,
        revokedBy: actorId || null,
      });
    }

    if (disconnectCoachId && typeof this.menusModel.revokeBaseAssignmentsForClientAndCoach === "function") {
      revokedLibraryMenus = await this.menusModel.revokeBaseAssignmentsForClientAndCoach(clientId, disconnectCoachId);
    }

    if (disconnectCoachId && typeof this.comidasGuardadasModel?.revokeAssignmentsForClientAndCoach === "function") {
      revokedLibraryMeals = await this.comidasGuardadasModel.revokeAssignmentsForClientAndCoach(clientId, disconnectCoachId);
    }

    if (disconnectCoachId && typeof this.rutinasModel?.pauseActiveForClientAndCoach === "function") {
      revokedRoutines = await this.rutinasModel.pauseActiveForClientAndCoach(clientId, disconnectCoachId);
    }

    const updated = await this.updateById(
      clientId,
      this._disconnectClientPatch(client, {
        coachId: disconnectCoachId,
        reason,
        actor,
        now,
      })
    );

    let releasedCapacity = { released: false, used: null };
    if (disconnectCoachId) {
      releasedCapacity = await this.coachCapacityModel.releaseSlot({
        coachId: disconnectCoachId,
        invitationId: client?.coachAccess?.invitationId || null,
        clientId,
        now,
      });
    }

    await recordAccessAuditEvent({
      subjectType: "client",
      subjectId: clientId,
      actorType: actorType || (actorId ? "admin" : "system"),
      actorId: actorId || null,
      event: auditEvent,
      previousValue: {
        coach: client?.coach || null,
        coachAccess: client?.coachAccess || null,
      },
      nextValue: {
        coach: updated?.coach || null,
        coachAccess: updated?.coachAccess || null,
      },
      reason,
      metadata: {
        coachId: disconnectCoachId || null,
        releasedCapacity,
        revokedMenus,
        revokedLibraryMenus,
        revokedLibraryMeals,
        revokedRoutines,
        ...auditMetadata,
      },
    });

    return {
      user: updated,
      status: "unassigned",
      revokedMenus,
      revokedLibraryMenus,
      revokedLibraryMeals,
      revokedRoutines,
      releasedCapacity,
    };
  }

  async _unassignAllClientsFromCoach(coachId, adminId = null) {
    const clients = await this._listClientsForCoach(coachId);
    let modifiedCount = 0;
    const failures = [];
    for (const client of clients) {
      try {
        await this.disconnectClientFromCoach({
          clientId: client._id || client.id,
          coachId,
          reason: "coach_deleted",
          actor: adminId,
        });
        modifiedCount += 1;
      } catch (error) {
        failures.push({
          clientId: String(client._id || client.id || ""),
          message: error?.message || "UNKNOWN_ERROR",
        });
      }
    }

    if (failures.length) {
      const error = new Error("COACH_CLIENT_UNASSIGN_PARTIAL");
      error.details = failures;
      error.unassignedClients = {
        matchedCount: clients.length,
        modifiedCount,
        failedCount: failures.length,
      };
      throw error;
    }

    return { matchedCount: clients.length, modifiedCount, failedCount: 0 };
  }

  async _getCoachPlanConfig(planCode) {
    const code = normalizeCoachPlanCode(planCode) || "trial_pro";
    if (typeof this.coachPlanModel?.getByCode === "function") {
      return await this.coachPlanModel.getByCode(code);
    }
    return normalizePlanConfig(code);
  }

  async _getCoachPlanConfigsMap() {
    const plans =
      typeof this.coachPlanModel?.list === "function"
        ? await this.coachPlanModel.list()
        : ["trial_pro", "pro", "vip"].map((code) => normalizePlanConfig(code));

    return new Map(
      (plans || [])
        .filter(Boolean)
        .map((plan) => [normalizeCoachPlanCode(plan.code) || "trial_pro", plan])
    );
  }

  async _countClientsForCoachIds(coachIds = []) {
    const normalizedIds = [...new Set(coachIds.map((id) => idToString(id)).filter(Boolean))];
    if (!normalizedIds.length) return new Map();

    if (typeof this.model.countClientsByCoachIds === "function") {
      return await this.model.countClientsByCoachIds(normalizedIds);
    }

    const entries = await Promise.all(
      normalizedIds.map(async (id) => [id, await this._countClientsForCoach(id)])
    );
    return new Map(entries);
  }

  _attachEffectiveCapabilities(normalized, effectiveCapabilities) {
    return {
      ...normalized,
      plan: effectiveCapabilities?.planCode || normalizeCoachPlanCode(normalized.plan) || "trial_pro",
      coachOverrides: normalizeCoachOverrides(normalized.coachOverrides || {}),
      effectiveCapabilities,
      coachStats: {
        ...(normalized.coachStats || {}),
        currentClients: effectiveCapabilities?.currentClients || 0,
      },
    };
  }

  async _resolveEffectiveCapabilities(coach, options = {}) {
    if (!coach || !this._isCoachUser(coach)) return null;
    const coachId = coach._id || coach.id;
    const [currentClients, currentCoachOwnedMenus, currentCoachOwnedMeals] = await Promise.all([
      options.currentClients !== undefined
        ? Number(options.currentClients || 0)
        : this._countClientsForCoach(coachId),
      options.currentCoachOwnedMenus !== undefined
        ? Number(options.currentCoachOwnedMenus || 0)
        : typeof this.menusModel?.countOwnedByCoach === "function"
          ? this.menusModel.countOwnedByCoach(coachId)
          : 0,
      options.currentCoachOwnedMeals !== undefined
        ? Number(options.currentCoachOwnedMeals || 0)
        : Promise.all([
            typeof this.comidasModel?.countOwnedByCoach === "function"
              ? this.comidasModel.countOwnedByCoach(coachId)
              : 0,
            typeof this.comidasGuardadasModel?.countOwnedByCoach === "function"
              ? this.comidasGuardadasModel.countOwnedByCoach(coachId)
              : 0,
          ]).then(([createdMeals, savedMeals]) => Number(createdMeals || 0) + Number(savedMeals || 0)),
    ]);
    const professionalSubscription = normalizeCoachSubscription(coach);
    const legacyPlan = professionalSubscription?.plan === "coach_ai"
      ? "vip"
      : professionalSubscription?.plan === "coach_pro"
        ? "pro"
        : "trial_pro";
    const planConfig = options.planConfig || (await this._getCoachPlanConfig(coach.coachSubscription ? legacyPlan : coach.plan));

    const resolved = resolveEffectiveCoachCapabilities({
      coach: {
        ...coach,
        plan: coach.coachSubscription ? legacyPlan : coach.plan,
      },
      planConfig,
      currentClients,
      currentCoachOwnedMenus,
      currentCoachOwnedMeals,
    });

    resolved.professionalSubscription = {
      ...professionalSubscription,
      clientLimit: resolved.maxClients,
    };

    if (professionalSubscription.explicit && !professionalSubscription.canInviteOrActivate) {
      resolved.canReceiveClients = false;
      resolved.subscriptionBlocked = true;
      resolved.features = {
        ...(resolved.features || {}),
        clients: {
          ...(resolved.features?.clients || {}),
          canAssign: false,
        },
        routines: disableCapabilitySection(resolved.features?.routines || {}),
        menus: disableCapabilitySection(resolved.features?.menus || {}),
        metrics: {
          ...(resolved.features?.metrics || {}),
          advanced: false,
        },
      };
    }

    return resolved;
  }

  async _withEffectiveCapabilities(user, options = {}) {
    const normalized = this._normalizeUser(user);
    if (!normalized || !this._isCoachUser(normalized)) return normalized;

    const effectiveCapabilities = await this._resolveEffectiveCapabilities(normalized, options);
    return this._attachEffectiveCapabilities(normalized, effectiveCapabilities);
  }

  async _withEffectiveCapabilitiesMany(users = []) {
    const normalized = (users || []).map((u) => this._normalizeUser(u)).filter(Boolean);
    const coaches = normalized.filter((u) => this._isCoachUser(u));
    if (!coaches.length) return normalized;

    const [countsByCoachId, plansByCode] = await Promise.all([
      this._countClientsForCoachIds(coaches.map((coach) => coach._id || coach.id)),
      this._getCoachPlanConfigsMap(),
    ]);

    return normalized.map((user) => {
      if (!this._isCoachUser(user)) return user;

      const coachId = idToString(user._id || user.id);
      const planCode = normalizeCoachPlanCode(user.plan) || "trial_pro";
      const effectiveCapabilities = resolveEffectiveCoachCapabilities({
        coach: user,
        planConfig: plansByCode.get(planCode) || normalizePlanConfig(planCode),
        currentClients: countsByCoachId.get(coachId) || 0,
      });

      return this._attachEffectiveCapabilities(user, effectiveCapabilities);
    });
  }

  _generateOTP6() {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  _sha256(text) {
    return crypto.createHash("sha256").update(String(text)).digest("hex");
  }

  _getOtpExpiryDate() {
    const ttlMin = Number(process.env.OTP_TTL_MIN || 10);
    return new Date(Date.now() + ttlMin * 60 * 1000);
  }

  _buildCompatUser(user) {
    const u = this._normalizeUser(user);
    if (!u) return null;

    return {
      _id: u._id,
      id: u._id,

      email: u.email,
      googleId: u.googleId || null,
      emailVerificado: !!u.emailVerificado,

      role: u.role,
      plan: u.plan || "free",
      tipo: u.tipo || "entrenado",
      estado: u.estado || "activo",

      profile: u.profile || {},
      coachProfile: u.coachProfile || null,
      professionalStatus: u.professionalStatus || u.coachProfile?.status || null,
      professionalScopes: u.professionalScopes || u.approvedScopes || null,
      coachSubscription: u.coachSubscription || null,
      coachCapabilities: u.coachCapabilities || null,
      coachOverrides: u.coachOverrides || null,
      effectiveCapabilities: u.effectiveCapabilities || null,
      coachStats: u.coachStats || null,
      coachWelcome: u.coachWelcome || null,
      subscription: u.subscription || {},
      settings: u.settings || {},
      adminMeta: u.adminMeta || {},
      clientPermissions: u.clientPermissions || {},

      metas: u.metas || {},
      onboarding: u.onboarding || {},

      coach: u.coach || {},
      clientCoachNotice: u.clientCoachNotice || null,
      coachChangeRequest: u.coachChangeRequest || null,
      billing: u.billing || {},

      antropometriaActual: u.antropometriaActual || {},
      metasActuales: u.metasActuales || {},

      goal: u.goal || {},
      program: u.program || {},
      menu: u.menu || {},
      routine: u.routine || {},

      stats: u.stats || {},

      lastLoginAt: u.lastLoginAt || null,
      lastActivityAt: u.lastActivityAt || null,
      createdAt: u.createdAt || null,
      updatedAt: u.updatedAt || null,
    };
  }

  _sanitizeUser(u) {
    return this._buildCompatUser(u);
  }

  // -------------------------
  // Mail wrappers
  // -------------------------
  sendVerifyEmail = async (to, code) => sendVerifyCodeEmail({ to, code });
  sendPasswordResetEmail = async (to, code) => sendPasswordResetCodeEmail({ to, code });

  // -------------------------
  // AUTH
  // -------------------------
  login = async (email, password) => {
    if (!process.env.JWT_SECRET) throw new Error("Falta JWT_SECRET en .env");

    email = String(email || "").toLowerCase().trim();
    const userRaw = await this._findUserByEmail(email);

    if (!userRaw) {
      const pending = await this.pendingModel.findByEmail(email);
      if (pending) throw new Error("EMAIL_PENDIENTE");
      return null;
    }

    const user = this._normalizeUser(userRaw);

    if (user.estado === "bloqueado") return null;

    if (user.emailVerificado === false) {
      throw new Error("EMAIL_NO_VERIFICADO");
    }

    const hash = user.passwordHash;
    if (!hash) throw new Error("Usuario sin passwordHash");

    const ok = await bcrypt.compare(password, hash);
    if (!ok) return null;

    const token = jwt.sign(
      { uid: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    try {
      await this._updateById(user._id, { lastLoginAt: new Date() });
    } catch {}

    const refreshed = await this.getById(user._id);
    return { user: this._buildCompatUser(refreshed || user), token };
  };

  // -------------------------
  // REGISTER (PENDING)
  // -------------------------
  registerCliente = async ({ email, password, profile = {} }) => {
    if (!email || !password) throw new Error("Email y password requeridos");
    email = String(email).toLowerCase().trim();

    const exists = await this._findUserByEmail(email);
    if (exists) throw new Error("EMAIL_DUPLICADO");

    const pending = await this.pendingModel.findByEmail(email);
    if (pending) throw new Error("EMAIL_PENDIENTE");

    const invite = await this._findInviteByEmail(email);
    const inviteRole = invite ? normalizeRole(invite.targetRole || invite.role || "cliente") : null;
    const role = this._isCoachClientInvite(invite) ? "cliente" : (inviteRole || "cliente");
    const plan =
      role === "coach"
        ? (toCoachPlan(invite?.plan) || "trial_pro")
        : role === "admin"
        ? (invite?.plan || "free")
        : (invite?.plan || "free");
    const tipo =
      role === "cliente"
        ? "entrenado"
        : role === "coach"
        ? "entrenador"
        : "admin";

    const passwordHash = await bcrypt.hash(password, 10);

    const code = this._generateOTP6();
    const codeHash = this._sha256(code);
    const expiresAt = this._getOtpExpiryDate();

    await this.pendingModel.create({
      email,
      passwordHash,
      role,
      plan,
      tipo,
      profile: {
        ...(profile || {}),
        ...(invite?.profile?.nombre ? { nombre: invite.profile.nombre } : {}),
        ...(invite?.profile?.apellido ? { apellido: invite.profile.apellido } : {}),
      },
      inviteId: invite?._id || null,
      invitationSource: invite?.source || null,
      codeHash,
      expiresAt,
      attempts: 0,
      lastSentAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return { pending: true, code };
  };

  verifyEmail = async (email, code) => {
    if (!email || !code) throw new Error("Faltan datos");
    email = String(email).toLowerCase().trim();
    code = String(code).trim();

    const exists = await this._findUserByEmail(email);
    if (exists) throw new Error("EMAIL_DUPLICADO");

    const pending = await this.pendingModel.findByEmail(email);
    if (!pending) throw new Error("SIN_PENDIENTE");

    if (new Date(pending.expiresAt).getTime() < Date.now()) {
      await this.pendingModel.deleteByEmail(email);
      throw new Error("CODIGO_EXPIRADO");
    }

    const maxAttempts = 3;
    const attemptsNow = Number(pending.attempts || 0) + 1;

    const ok = this._sha256(code) === pending.codeHash;

    if (!ok) {
      await this.pendingModel.updateByEmail(email, { attempts: attemptsNow });
      if (attemptsNow >= maxAttempts) throw new Error("DEMASIADOS_INTENTOS");
      throw new Error("CODIGO_INVALIDO");
    }

    const invite = await this._findPendingInviteForEmail(email, pending.inviteId);
    const shouldAcceptInviteOnVerify = invite && !this._isCoachClientInvite(invite);

    const role = pending.role || "cliente";
    const plan = pending.plan || "free";
    const tipo = pending.tipo || "entrenado";

    const userToCreate = shouldAcceptInviteOnVerify
      ? await this._buildUserFromInvite({
          invite,
          email,
          passwordHash: pending.passwordHash,
          googleId: pending.googleId || null,
          profile: pending.profile || {},
        })
      : {
          email,
          passwordHash: pending.passwordHash,
          googleId: pending.googleId || null,

          ...getUserDefaults({ role, plan, tipo }),

          emailVerificado: true,
          profile: {
            ...(pending.profile || {}),
            ...(this._isCoachClientInvite(invite) && invite?.profile?.nombre ? { nombre: invite.profile.nombre } : {}),
            ...(this._isCoachClientInvite(invite) && invite?.profile?.apellido ? { apellido: invite.profile.apellido } : {}),
          },
          settings: {},

          createdAt: new Date(),
          updatedAt: null,
        };

    const created = await this._createUser(userToCreate);

    if (shouldAcceptInviteOnVerify && invite?._id) {
      await this._acceptInviteById(invite._id, created?._id || created?.id);
    } else if (this._isCoachClientInvite(invite) && invite?._id) {
      await this.invitedModel.updateById(invite._id, {
        clientId: toMongoIdOrString(created?._id || created?.id),
        updatedAt: new Date(),
      });
      await recordAccessAuditEvent({
        subjectType: "client",
        subjectId: created?._id || created?.id,
        actorType: "system",
        actorId: null,
        event: "coach_invitation_linked_after_registration",
        previousValue: null,
        nextValue: {
          invitationId: invite._id,
          email,
        },
        reason: "client_registered_with_invited_email",
        metadata: {},
      });
    }

    await this.pendingModel.deleteByEmail(email);

    return this._normalizeUser(created);
  };

  resendVerifyCode = async (email) => {
    if (!email) throw new Error("Email requerido");
    email = String(email).toLowerCase().trim();

    const pending = await this.pendingModel.findByEmail(email);
    if (!pending) throw new Error("SIN_PENDIENTE");

    const lastSentAt = pending.lastSentAt ? new Date(pending.lastSentAt).getTime() : 0;
    if (lastSentAt && Date.now() - lastSentAt < 60 * 1000) throw new Error("ESPERA_1_MIN");

    const code = this._generateOTP6();
    const codeHash = this._sha256(code);
    const expiresAt = this._getOtpExpiryDate();

    await this.pendingModel.updateByEmail(email, {
      codeHash,
      expiresAt,
      attempts: 0,
      lastSentAt: new Date(),
    });

    return code;
  };

  // -------------------------
  // FORGOT / RESET PASSWORD
  // -------------------------
  forgotPassword = async (email) => {
    if (!email) throw new Error("Email requerido");
    email = String(email).toLowerCase().trim();

    const pending = await this.pendingModel.findByEmail(email);
    if (pending) throw new Error("EMAIL_PENDIENTE");

    const userRaw = await this._findUserByEmail(email);
    if (!userRaw) return { ok: true };

    const user = this._normalizeUser(userRaw);
    if (user.estado === "bloqueado") return { ok: true };

    const existing = await this.resetModel.findByEmail(email);
    const lastSentAt = existing?.lastSentAt ? new Date(existing.lastSentAt).getTime() : 0;
    if (lastSentAt && Date.now() - lastSentAt < 60 * 1000) throw new Error("ESPERA_1_MIN");

    const code = this._generateOTP6();
    const codeHash = this._sha256(code);
    const expiresAt = this._getOtpExpiryDate();
    const requestId = crypto.randomBytes(16).toString("hex");

    await this.resetModel.upsertByEmail(email, {
      codeHash,
      expiresAt,
      attempts: 0,
      lastSentAt: new Date(),
      usedAt: null,
      requestId,
    });

    await sendPasswordResetCodeEmail({ to: email, code });
    return { ok: true };
  };

  resetPassword = async (email, code, newPassword) => {
    if (!email || !code || !newPassword) throw new Error("Faltan datos");
    email = String(email).toLowerCase().trim();
    code = String(code).trim();
    newPassword = String(newPassword);

    if (newPassword.length < 6) throw new Error("PASSWORD_CORTA");

    const tokenDoc = await this.resetModel.findByEmail(email);
    if (!tokenDoc || tokenDoc.usedAt) throw new Error("CODIGO_INVALIDO");

    if (new Date(tokenDoc.expiresAt).getTime() < Date.now()) {
      await this.resetModel.deleteByEmail(email);
      throw new Error("CODIGO_EXPIRADO");
    }

    const maxAttempts = 3;
    const attemptsNow = Number(tokenDoc.attempts || 0) + 1;

    const ok = this._sha256(code) === tokenDoc.codeHash;

    if (!ok) {
      await this.resetModel.upsertByEmail(email, { ...tokenDoc, attempts: attemptsNow });
      if (attemptsNow >= maxAttempts) {
        await this.resetModel.deleteByEmail(email);
        throw new Error("DEMASIADOS_INTENTOS");
      }
      throw new Error("CODIGO_INVALIDO");
    }

    const userRaw = await this._findUserByEmail(email);
    if (!userRaw) {
      await this.resetModel.deleteByEmail(email);
      throw new Error("CODIGO_INVALIDO");
    }

    const user = this._normalizeUser(userRaw);
    const passwordHash = await bcrypt.hash(newPassword, 10);

    await this._updateById(user._id, { passwordHash, updatedAt: new Date() });
    await this.resetModel.deleteByEmail(email);

    return { ok: true };
  };

  // -------------------------
  // LAST ACTIVITY
  // -------------------------
  touchLastActivity = async (userId) => {
    if (!userId) return null;

    if (typeof this.model.obtenerPorId !== "function") {
      console.warn("obtenerPorId no existe en el model actual");
      return null;
    }

    const user = await this.model.obtenerPorId(userId);
    if (!user) return null;

    const now = new Date();
    const last = user.lastActivityAt ? new Date(user.lastActivityAt).getTime() : 0;
    const diffMs = now.getTime() - last;

    if (diffMs < 5 * 60 * 1000) {
      return user;
    }

    if (typeof this.model.touchLastActivityById !== "function") {
      console.warn("touchLastActivityById no existe en el model actual");
      return user;
    }

    return await this.model.touchLastActivityById(userId, now);
  };

  // -------------------------
  // GOOGLE LOGIN / REGISTER
  // -------------------------
  loginOrRegisterWithGoogle = async ({ email, googleId, nombre, apellido, avatarUrl }) => {
    if (!process.env.JWT_SECRET) throw new Error("Falta JWT_SECRET en .env");

    email = String(email || "").toLowerCase().trim();

    const pending = await this.pendingModel.findByEmail(email);
    if (pending) throw new Error("EMAIL_PENDIENTE");

    let userRaw = await this._findUserByEmail(email);

    if (!userRaw) {
      const invite = await this._findInviteByEmail(email);
      const shouldAcceptInviteWithGoogle = invite && !this._isCoachClientInvite(invite);

      if (shouldAcceptInviteWithGoogle) {
        const randomPass = crypto.randomBytes(32).toString("hex");
        const passwordHash = await bcrypt.hash(randomPass, 10);

        userRaw = await this._createUser(await this._buildUserFromInvite({
          invite,
          email,
          passwordHash,
          googleId,
          profile: {
            nombre: nombre || "",
            apellido: apellido || "",
            avatarUrl: avatarUrl || "",
          },
        }));

        try {
          await this._acceptInviteById(invite._id, userRaw?._id || userRaw?.id);
        } catch (e) {
          console.error("No se pudo eliminar la invitación:", e);
        }
      } else {
        const randomPass = crypto.randomBytes(32).toString("hex");
        const passwordHash = await bcrypt.hash(randomPass, 10);

        const role = "cliente";
        const plan = "free";
        const tipo = "entrenado";

        userRaw = await this._createUser({
          email,
          passwordHash,
          googleId,

          ...getUserDefaults({ role, plan, tipo }),

          emailVerificado: true,
          profile: {
            nombre: invite?.profile?.nombre || nombre || "",
            apellido: invite?.profile?.apellido || apellido || "",
            avatarUrl,
          },
          coachProfile: null,
          settings: {},

          createdAt: new Date(),
          updatedAt: null,
        });

        if (this._isCoachClientInvite(invite) && invite?._id) {
          await this.invitedModel.updateById(invite._id, {
            clientId: toMongoIdOrString(userRaw?._id || userRaw?.id),
            updatedAt: new Date(),
          });
          await recordAccessAuditEvent({
            subjectType: "client",
            subjectId: userRaw?._id || userRaw?.id,
            actorType: "system",
            actorId: null,
            event: "coach_invitation_linked_after_registration",
            previousValue: null,
            nextValue: {
              invitationId: invite._id,
              email,
            },
            reason: "client_registered_with_invited_email_google",
            metadata: {},
          });
        }
      }
    }

    const user = this._normalizeUser(userRaw);
    if (["bloqueado", "inactivo"].includes(String(user?.estado || "").toLowerCase())) {
      throw new Error("USUARIO_BLOQUEADO");
    }

    try {
      const patch = { lastLoginAt: new Date() };
      if (!user.googleId && googleId) patch.googleId = googleId;
      if (avatarUrl) patch["profile.avatarUrl"] = avatarUrl;
      if (Object.keys(patch).length) await this._updateById(user._id, patch);
    } catch {}

    const token = jwt.sign(
      { uid: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    const refreshed = await this.getById(user._id);
    return {
      user: this._buildCompatUser(refreshed || user),
      token,
    };
  };

  // -------------------------
  // USER DATA
  // -------------------------
  getById = async (id) => {
    if (typeof this.model.obtenerPorId !== "function") {
      throw new Error("El modelo no implementa obtenerPorId");
    }
    const user = await this.model.obtenerPorId(id);
    const repaired = await this._repairAcceptedCoachInviteOnboarding(user);
    return await this._withEffectiveCapabilities(repaired);
  };

  updateById = async (id, updates) => {
    const updated = await this._updateById(id, updates);
    return this._normalizeUser(updated);
  };

  markCoachWelcomeSeen = async (userId) => {
    const user = await this.getById(userId);
    if (!user) throw new Error("NOT_FOUND");

    const updated = await this.updateById(userId, {
      "coachWelcome.show": false,
      "coachWelcome.seenAt": new Date(),
      updatedAt: new Date(),
    });

    return this._normalizeUser(updated);
  };

  // =========================
  // ADMIN: INVITATIONS
  // =========================
  adminCreateInvitation = async ({
    email,
    role,
    plan,
    profile = {},
    coachProfile = null,
    invitedBy = null,
  }) => {
    email = String(email || "").trim().toLowerCase();
    role = normalizeRole(role);

    const nombre = String(profile?.nombre || "").trim();
    const apellido = String(profile?.apellido || "").trim();

    if (!nombre) throw new Error("NOMBRE_REQUERIDO");
    if (!apellido) throw new Error("APELLIDO_REQUERIDO");
    if (!email) throw new Error("EMAIL_REQUERIDO");

    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailOk) throw new Error("EMAIL_INVALIDO");

    const validRoles = ["admin", "coach", "cliente"];
    if (!validRoles.includes(role)) throw new Error("ROL_INVALIDO");

    const requestedPlan = String(plan || "").trim().toLowerCase();
    const professionalPlan = role === "coach"
      ? normalizeProfessionalSubscriptionPlan(requestedPlan || "coach_initial")
      : null;
    const hasCanonicalProfessionalPlan = role === "coach" && (
      !requestedPlan ||
      requestedPlan === "free" ||
      ["coach_initial", "coach_pro", "coach_ai", "coach_vip"].includes(requestedPlan)
    );
    const dbPlan =
      role === "admin"
        ? null
        : role === "coach"
        ? (toCoachPlan(plan) || "trial_pro")
        : toDbPlan(plan);
    if (role !== "admin" && !dbPlan) throw new Error("PLAN_INVALIDO");

    let normalizedCoachProfile = null;

    if (role === "coach") {
      const training = !!coachProfile?.specialties?.training;
      const nutrition = !!coachProfile?.specialties?.nutrition;

      if (!coachProfile || !coachProfile.specialties) {
        throw new Error("COACH_PROFILE_REQUERIDO");
      }

      if (!training && !nutrition) {
        throw new Error("COACH_SPECIALTIES_REQUERIDAS");
      }

      normalizedCoachProfile = {
        specialties: {
          training,
          nutrition,
        },
      };
    }

    const existingUser = await this._findUserByEmail(email);
    if (existingUser) throw new Error("USUARIO_YA_EXISTE");

    const existingPending = await this.pendingModel.findByEmail(email);
    if (existingPending) throw new Error("EMAIL_PENDIENTE");

    const existingInvite = await this._findInviteByEmail(email);
    if (existingInvite) throw new Error("INVITACION_PENDIENTE_EXISTENTE");

    const created = await this.invitedModel.create({
      email,
      role,
      plan: dbPlan,
      ...(role === "coach" && hasCanonicalProfessionalPlan ? { professionalPlan } : {}),
      status: "pending",
      profile: {
        nombre,
        apellido,
      },
      coachProfile: normalizedCoachProfile,
      invitedBy,
      invitedByType: "admin",
      source: "admin_invite",
      assignedCoachId: null,
      targetRole: role,
      clientPermissions: null,
      acceptedUserId: null,
      coachSnapshot: null,
      invitedAt: new Date(),
      acceptedAt: null,
      cancelledAt: null,
      expiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return created;
  };

  adminListInvitations = async ({
    search = "",
    status = "todos",
    role = "todos",
    limit = 100,
    skip = 0,
  } = {}) => {
    const result = await this.invitedModel.listAdmin({
      search,
      status,
      role,
      limit,
      skip,
    });

    return {
      invitations: result?.items || [],
      total: result?.total || 0,
    };
  };

  adminGetInvitationById = async (invitationId) => {
    if (typeof this.invitedModel.getById !== "function") {
      throw new Error("INVITATION_NOT_FOUND");
    }
    const invitation = await this.invitedModel.getById(invitationId);
    if (!invitation) throw new Error("INVITATION_NOT_FOUND");
    return invitation;
  };

  adminCancelInvitation = async (invitationId) => {
    const invitation = await this.adminGetInvitationById(invitationId);
    if (String(invitation?.status || "pending") !== "pending") {
      throw new Error("INVITATION_ALREADY_FINALIZED");
    }

    if (typeof this.invitedModel.updateById !== "function") {
      throw new Error("INVITATION_NOT_FOUND");
    }

    await this.invitedModel.updateById(invitationId, {
      status: "cancelled",
      cancelledAt: new Date(),
      updatedAt: new Date(),
    });

    return await this.adminGetInvitationById(invitationId);
  };

  adminDeleteInvitation = async (invitationId) => {
    if (typeof this.invitedModel.deleteById !== "function") {
      throw new Error("INVITATION_NOT_FOUND");
    }

    const result = await this.invitedModel.deleteById(invitationId);
    return { deleted: true, result };
  };

  // =========================
  // COACH: CLIENT INVITATIONS
  // =========================
  _countPendingClientInvitationsForCoach = async (coachId) => {
    if (!coachId) return 0;

    if (typeof this.invitedModel.countPendingByCoach === "function") {
      return Number(await this.invitedModel.countPendingByCoach(coachId)) || 0;
    }

    if (typeof this.invitedModel.listByCoach === "function") {
      const data = await this.invitedModel.listByCoach({
        coachId,
        status: "pending",
        limit: 1,
        skip: 0,
      });
      return Number(data?.total || 0);
    }

    return 0;
  };

  _sanitizeClientInviteOnboarding(raw = {}) {
    const input = isPlainObject(raw) ? raw : {};
    const mode = String(input.mode || "full").toLowerCase();
    const enabled = input.enabled !== false && mode !== "none";
    return {
      enabled,
      mode: enabled ? "full" : "none",
    };
  }

  _onboardingFromCoachInvite(raw = {}, now = new Date()) {
    const sanitized = this._sanitizeClientInviteOnboarding(raw);
    return {
      enabled: sanitized.enabled,
      mode: sanitized.mode,
      done: !sanitized.enabled,
      step: 1,
      startedAt: sanitized.enabled ? now : null,
      completedAt: sanitized.enabled ? null : now,
      lastSeenAt: null,
      configuredByCoach: true,
    };
  }

  _clientInvitationNextPath(user) {
    const role = normalizeRole(user?.role || user?.rol);
    const tipo = String(user?.tipo || "").trim().toLowerCase();
    const onboarding = isPlainObject(user?.onboarding) ? user.onboarding : {};
    const requiresOnboarding =
      role === "cliente" &&
      tipo === "entrenado" &&
      onboarding.enabled === true &&
      onboarding.done !== true;

    return {
      requiresOnboarding,
      nextPath: requiresOnboarding ? "/app/onboarding" : "/app/inicio",
    };
  }

  async _repairAcceptedCoachInviteOnboarding(user) {
    if (!user || !this._isClientUser(user)) return user;
    if (String(user?.coach?.source || "") !== "coach_invite") return user;
    if (user?.onboarding?.enabled !== true || user?.onboarding?.done === true) return user;
    if (typeof this.invitedModel.findByEmail !== "function") return user;

    const email = String(user.email || "").toLowerCase().trim();
    if (!email) return user;

    const userId = idToString(user._id || user.id);
    const coachId = idToString(user?.coach?.entrenadorId);
    const invites = await this.invitedModel.findByEmail(email);
    const acceptedInvite = (invites || []).find((invite) => {
      if (!invite || String(invite.status || "") !== "accepted") return false;
      if (!this._isCoachClientInvite(invite)) return false;
      const acceptedUserId = idToString(invite.acceptedUserId);
      const inviteCoachId = idToString(invite.assignedCoachId || invite.invitedBy);
      return (
        (acceptedUserId && acceptedUserId === userId) ||
        (coachId && inviteCoachId && inviteCoachId === coachId)
      );
    });

    const inviteSkipsOnboarding = !isPlainObject(acceptedInvite?.onboarding) || acceptedInvite.onboarding.enabled === false;
    if (!acceptedInvite || !inviteSkipsOnboarding) return user;

    const now = new Date();
    const inviteOnboarding = isPlainObject(acceptedInvite.onboarding)
      ? acceptedInvite.onboarding
      : { enabled: false, mode: "none" };
    const updated = await this._updateById(user._id || user.id, {
      onboarding: this._onboardingFromCoachInvite(inviteOnboarding, now),
      updatedAt: now,
    });
    return this._normalizeUser(updated || user);
  }

  _sanitizeClientPermissionsForCoach(coach, effectiveCapabilities, raw = {}) {
    const permissions = isPlainObject(raw) ? raw : {};
    const menuInput = isPlainObject(permissions.menu) ? permissions.menu : {};
    const routineInput = isPlainObject(permissions.routine) ? permissions.routine : {};
    const progressInput = isPlainObject(permissions.progress) ? permissions.progress : {};

    const specialties = coach?.coachProfile?.specialties || {};
    const features = effectiveCapabilities?.features || {};
    const trialExpired = !!effectiveCapabilities?.isTrialExpired;

    const menuFeatures = features?.menus || {};
    const routineFeatures = features?.routines || {};
    const metricFeatures = features?.metrics || {};

    const canMenu = !!specialties.nutrition && !trialExpired && anyTruthy(menuFeatures);
    const canRoutine = !!specialties.training && !trialExpired && anyTruthy(routineFeatures);
    const canProgress = (canMenu || canRoutine) && !trialExpired;

    return {
      menu: {
        canViewMenu: canMenu && boolFrom(menuInput.canViewMenu, true),
        canEditPreferences: canMenu && boolFrom(menuInput.canEditPreferences, true),
        canUseAutomaticMenu:
          canMenu &&
          !!menuFeatures.automaticGenerator &&
          boolFrom(menuInput.canUseAutomaticMenu, false),
        canUseSemiAutomaticMenu:
          canMenu &&
          !!menuFeatures.semiAutomaticBuilder &&
          boolFrom(menuInput.canUseSemiAutomaticMenu, false),
        canRequestMenuChanges: canMenu && boolFrom(menuInput.canRequestMenuChanges, true),
      },
      routine: {
        canViewRoutine: canRoutine && boolFrom(routineInput.canViewRoutine, true),
        canLogWorkout: canRoutine && boolFrom(routineInput.canLogWorkout, true),
        canEditWeights: canRoutine && boolFrom(routineInput.canEditWeights, true),
        canUseAutomaticRoutine:
          canRoutine &&
          !!routineFeatures.automaticGenerator &&
          boolFrom(routineInput.canUseAutomaticRoutine, false),
        canUseSemiAutomaticRoutine:
          canRoutine &&
          !!routineFeatures.semiAutomaticBuilder &&
          boolFrom(routineInput.canUseSemiAutomaticRoutine, false),
        canRequestRoutineChanges:
          canRoutine && boolFrom(routineInput.canRequestRoutineChanges, true),
      },
      progress: {
        canLogWeight: canProgress && boolFrom(progressInput.canLogWeight, true),
        canUploadProgressPhotos:
          canProgress && boolFrom(progressInput.canUploadProgressPhotos, true),
        canViewAdvancedMetrics:
          canProgress &&
          !!metricFeatures.advanced &&
          boolFrom(progressInput.canViewAdvancedMetrics, false),
      },
    };
  }

  _isCoachOwnerOfInvitation(invitation, coachId) {
    if (!invitation || String(invitation?.source || "") !== "coach_invite") return false;
    const id = idToString(coachId);
    return (
      idToString(invitation?.assignedCoachId) === id ||
      (String(invitation?.invitedByType || "") === "coach" &&
        idToString(invitation?.invitedBy) === id)
    );
  }

  _assertCoachCanInviteClients = async (coachId) => {
    if (!coachId) throw new Error("COACH_NOT_FOUND");

    const coach = await this.getById(coachId);
    if (!coach) throw new Error("COACH_NOT_FOUND");
    if (!this._isCoachUser(coach)) throw new Error("USER_NOT_COACH");

    if (String(coach?.estado || "activo").toLowerCase() !== "activo") {
      throw new Error("COACH_NOT_ACTIVE");
    }

    if (coach?.coachCapabilities?.canInviteClients === false) {
      throw new Error("COACH_INVITES_DISABLED");
    }

    requireCoachSubscriptionActive(coach, { action: "invite_clients" });

    const specialties = coach?.professionalScopes || coach?.coachProfile?.specialties || {};
    if (!specialties.training && !specialties.nutrition) {
      throw new Error("COACH_SPECIALTIES_REQUERIDAS");
    }

    const coachRealId = coach._id || coach.id || coachId;
    const assignedClients = await this._countClientsForCoach(coachRealId);
    const pendingInvitations = await this._countPendingClientInvitationsForCoach(coachRealId);
    const reservedClients = assignedClients;
    const effectiveCapabilities = await this._resolveEffectiveCapabilities(coach, {
      currentClients: reservedClients,
    });

    if (effectiveCapabilities?.isTrialExpired || !effectiveCapabilities?.features?.clients?.canAssign) {
      throw new Error("COACH_NOT_AVAILABLE");
    }

    if (!effectiveCapabilities?.canReceiveClients) {
      throw coachClientCapacityError(effectiveCapabilities, reservedClients);
    }

    return {
      coach,
      effectiveCapabilities,
      assignedClients,
      pendingInvitations,
      reservedClients,
    };
  };

  _getCoachOwnedClientInvitation = async ({ coachId, invitationId }) => {
    if (typeof this.invitedModel.getById !== "function") {
      throw new Error("INVITATION_NOT_FOUND");
    }

    const invitation = await this.invitedModel.getById(invitationId);
    if (!this._isCoachOwnerOfInvitation(invitation, coachId)) {
      throw new Error("INVITATION_NOT_FOUND");
    }

    return invitation;
  };

  coachListClientInvitations = async ({
    coachId,
    search = "",
    status = "todos",
    limit = 100,
    skip = 0,
  } = {}) => {
    const coach = await this.getById(coachId);
    if (!coach) throw new Error("COACH_NOT_FOUND");
    if (!this._isCoachUser(coach)) throw new Error("USER_NOT_COACH");

    if (typeof this.invitedModel.listByCoach !== "function") {
      return { invitations: [], total: 0 };
    }

    const result = await this.invitedModel.listByCoach({
      coachId: coach._id || coach.id || coachId,
      search,
      status,
      limit,
      skip,
    });

    return {
      invitations: result?.items || [],
      total: result?.total || 0,
    };
  };

  coachGetClientInvitation = async ({ coachId, invitationId }) => {
    const coach = await this.getById(coachId);
    if (!coach) throw new Error("COACH_NOT_FOUND");
    if (!this._isCoachUser(coach)) throw new Error("USER_NOT_COACH");

    return await this._getCoachOwnedClientInvitation({
      coachId: coach._id || coach.id || coachId,
      invitationId,
    });
  };

  coachCreateClientInvitation = async ({
    coachId,
    email,
    profile = {},
    clientPermissions = {},
    onboarding = {},
    servicePackage = "service_pro",
  }) => {
    email = this._normalizeEmail(email);
    const nombre = String(profile?.nombre || "").trim();
    const apellido = String(profile?.apellido || "").trim();

    if (!nombre) throw new Error("NOMBRE_REQUERIDO");
    if (!apellido) throw new Error("APELLIDO_REQUERIDO");
    if (!email) throw new Error("EMAIL_REQUERIDO");

    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailOk) throw new Error("EMAIL_INVALIDO");

    const {
      coach,
      effectiveCapabilities,
      assignedClients,
      pendingInvitations,
      reservedClients,
    } = await this._assertCoachCanInviteClients(coachId);
    const normalizedServicePackage = normalizeServicePackage(servicePackage);
    requireCoachCanOfferService(coach, normalizedServicePackage);
    const now = new Date();
    const resolvedCoachId = coach._id || coach.id || coachId;
    const coachIdToStore = toMongoIdOrString(resolvedCoachId);

    const existingUser = await this._findUserByEmail(email);
    const existingClientId = existingUser ? idToString(existingUser._id || existingUser.id) : "";
    if (existingUser && !this._isEligibleInviteeClient(existingUser)) {
      throw new Error("INVITEE_NOT_ELIGIBLE");
    }

    if (existingUser) {
      const activeCoachId = activeCoachIdFromUser(existingUser);
      const nextCoachId = idToString(resolvedCoachId);
      if (activeCoachId && activeCoachId === nextCoachId) {
        throw new Error("CLIENT_ALREADY_ACTIVE_WITH_COACH");
      }
      if (activeCoachId) {
        throw new Error("CLIENT_ALREADY_HAS_ACTIVE_COACH");
      }
      const pendingAccessCoachId =
        String(existingUser?.coachAccess?.status || "") === "accepted_pending_activation"
          ? idToString(existingUser.coachAccess.coachId)
          : "";
      if (pendingAccessCoachId && pendingAccessCoachId !== nextCoachId) {
        throw new Error("CLIENT_HAS_PENDING_INVITATION");
      }
    }

    if (existingClientId && await this.clientCoachBlocksModel.isBlocked({ clientId: existingClientId, coachId: resolvedCoachId })) {
      throw new Error("COACH_BLOCKED_BY_CLIENT");
    }

    const actionable = typeof this.invitedModel.findActionableCoachInvitesByTarget === "function"
      ? await this.invitedModel.findActionableCoachInvitesByTarget({
          email,
          clientId: existingClientId || null,
        })
      : [];
    await Promise.all((actionable || [])
      .filter((invite) => this._isInviteExpired(invite))
      .map((invite) => this.invitedModel.updateById(invite._id, {
        status: "expired",
        expiredAt: now,
        updatedAt: now,
      })));
    const activeActionable = (actionable || []).filter((invite) => !this._isInviteExpired(invite));
    const sameCoachActionable = activeActionable.find((invite) => this._coachTargetMatchesInvitation(invite, resolvedCoachId));
    if (sameCoachActionable) {
      const state = this._publicCoachInviteState(sameCoachActionable);
      return {
        invitation: sameCoachActionable,
        alreadyExists: true,
        code: state === "accepted_pending_activation" ? "INVITATION_ALREADY_ACCEPTED" : "INVITATION_ALREADY_PENDING",
        capacity: {
          maxClients: effectiveCapabilities?.maxClients ?? null,
          assignedClients,
          pendingInvitations,
          reservedClients,
        },
      };
    }

    if (activeActionable.length) {
      throw new Error("CLIENT_HAS_PENDING_INVITATION");
    }

    const existingPending = await this.pendingModel.findByEmail(email);
    if (existingPending) throw new Error("EMAIL_PENDIENTE");
    const existingNonCoachInvite = await this._findInviteByEmail(email);
    if (existingNonCoachInvite && !this._isCoachClientInvite(existingNonCoachInvite)) {
      throw new Error("INVITACION_PENDIENTE_EXISTENTE");
    }

    const rejectedSince = new Date(now.getTime() - COACH_INVITATION_REJECT_COOLDOWN_MS);
    if (typeof this.invitedModel.findRecentRejectedByCoachAndTarget === "function") {
      const recentRejected = await this.invitedModel.findRecentRejectedByCoachAndTarget({
        coachId: resolvedCoachId,
        email,
        clientId: existingClientId || null,
        since: rejectedSince,
      });
      if (recentRejected) throw new Error("INVITATION_REJECTED_RECENTLY");
    }

    if (typeof this.invitedModel.countCreatedByCoachSince === "function") {
      const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const todayCount = await this.invitedModel.countCreatedByCoachSince(resolvedCoachId, since);
      if (todayCount >= COACH_INVITATION_DAILY_LIMIT) {
        await recordAccessAuditEvent({
          subjectType: "coach",
          subjectId: resolvedCoachId,
          actorType: "coach",
          actorId: resolvedCoachId,
          event: "coach_invitation_rate_limited",
          previousValue: null,
          nextValue: { email },
          reason: "coach_invitation_daily_limit",
          metadata: { dailyLimit: COACH_INVITATION_DAILY_LIMIT, todayCount },
        });
        throw new Error("INVITATION_RATE_LIMITED");
      }
    }

    const sanitizedPermissions = this._sanitizeClientPermissionsForCoach(
      coach,
      effectiveCapabilities,
      clientPermissions
    );
    const sanitizedOnboarding = this._sanitizeClientInviteOnboarding(onboarding);

    const coachProfile = coach?.profile || {};
    const inviteToken = crypto.randomBytes(24).toString("base64url");

    const created = await this.invitedModel.create({
      email,
      inviteeEmail: String(profile?.email || email).trim() || email,
      inviteeEmailNormalized: email,
      clientId: existingClientId || null,
      role: "cliente",
      plan: "free",
      status: "pending",
      profile: { nombre, apellido },
      coachProfile: null,
      invitedBy: coachIdToStore,
      invitedByType: "coach",
      source: "coach_invite",
      assignedCoachId: coachIdToStore,
      servicePackage: normalizedServicePackage,
      serviceScopes: ["training", "nutrition"],
      price: {
        amount: null,
        currency: "ARS",
        interval: "month",
        paymentMode: "external",
      },
      modality: "external",
      message: "",
      coachAccess: {
        status: "invited",
        coachId: coachIdToStore,
        servicePackage: normalizedServicePackage,
        serviceScopes: ["training", "nutrition"],
        billingOwner: "coach",
        invitationId: null,
        startedAt: null,
        endsAt: null,
        suspendedAt: null,
        endedAt: null,
        updatedAt: new Date(),
      },
      targetRole: "cliente",
      clientPermissions: sanitizedPermissions,
      onboarding: sanitizedOnboarding,
      acceptedUserId: null,
      coachSnapshot: {
        id: idToString(coach._id || coach.id || coachId),
        email: coach.email,
        nombre: coachProfile.nombre || "",
        apellido: coachProfile.apellido || "",
        plan: effectiveCapabilities?.planCode || coach.plan || null,
        servicePackage: normalizedServicePackage,
        specialties: {
          training: !!(coach?.professionalScopes || coach?.coachProfile?.specialties || {}).training,
          nutrition: !!(coach?.professionalScopes || coach?.coachProfile?.specialties || {}).nutrition,
        },
      },
      tokenHash: this._sha256(inviteToken),
      tokenCreatedAt: now,
      deliveryStatus: existingClientId ? "in_app" : "manual_link",
      deliveryError: null,
      lastNotificationAt: existingClientId ? now : null,
      invitedAt: now,
      acceptedAt: null,
      cancelledAt: null,
      expiresAt: this._coachInviteExpiryFrom(now),
      createdAt: now,
      updatedAt: now,
    });

    if (existingClientId) {
      await recordAccessAuditEvent({
        subjectType: "client",
        subjectId: existingClientId,
        actorType: "coach",
        actorId: resolvedCoachId,
        event: "coach_invitation_linked_to_existing_client",
        previousValue: null,
        nextValue: {
          invitationId: created?._id || created?.id || null,
          email,
          servicePackage: normalizedServicePackage,
        },
        reason: "coach_invited_existing_client",
        metadata: { deliveryStatus: "in_app" },
      });
    }

    await recordAccessAuditEvent({
      subjectType: "client",
      subjectId: existingClientId || null,
      actorType: "coach",
      actorId: resolvedCoachId,
      event: "coach_invitation_created",
      previousValue: null,
      nextValue: {
        invitationId: created?._id || created?.id || null,
        email,
        servicePackage: normalizedServicePackage,
      },
      reason: "coach_created_client_invitation",
      metadata: { reservedClients, assignedClients, pendingInvitations },
    });

    return {
      invitation: created,
      alreadyExists: false,
      code: existingClientId ? "INVITATION_CREATED_EXISTING_CLIENT" : "INVITATION_CREATED_EMAIL_ONLY",
      deliveryStatus: existingClientId ? "in_app" : "manual_link",
      inviteLink: existingClientId
        ? null
        : `/register?invite=${encodeURIComponent(`${idToString(created?._id || created?.id)}.${inviteToken}`)}&email=${encodeURIComponent(email)}`,
      capacity: {
        maxClients: effectiveCapabilities?.maxClients ?? null,
        assignedClients,
        pendingInvitations,
        reservedClients,
      },
    };
  };

  coachCancelClientInvitation = async ({ coachId, invitationId }) => {
    const coach = await this.getById(coachId);
    if (!coach) throw new Error("COACH_NOT_FOUND");
    if (!this._isCoachUser(coach)) throw new Error("USER_NOT_COACH");

    const resolvedCoachId = coach._id || coach.id || coachId;
    const invitation = await this._getCoachOwnedClientInvitation({
      coachId: resolvedCoachId,
      invitationId,
    });
    if (String(invitation?.status || "pending") !== "pending") {
      throw new Error("INVITATION_ALREADY_FINALIZED");
    }

    await this.invitedModel.updateById(invitationId, {
      status: "cancelled",
      cancelledAt: new Date(),
      updatedAt: new Date(),
    });

    return await this._getCoachOwnedClientInvitation({
      coachId: resolvedCoachId,
      invitationId,
    });
  };

  coachDeleteClientInvitation = async ({ coachId, invitationId }) => {
    const coach = await this.getById(coachId);
    if (!coach) throw new Error("COACH_NOT_FOUND");
    if (!this._isCoachUser(coach)) throw new Error("USER_NOT_COACH");

    await this._getCoachOwnedClientInvitation({
      coachId: coach._id || coach.id || coachId,
      invitationId,
    });

    if (typeof this.invitedModel.deleteById !== "function") {
      throw new Error("INVITATION_NOT_FOUND");
    }

    const result = await this.invitedModel.deleteById(invitationId);
    return { deleted: true, result };
  };

  clientListPendingCoachInvitations = async ({ userId }) => {
    const user = await this.getById(userId);
    if (!user) throw new Error("NOT_FOUND");
    if (!this._isClientUser(user)) return { invitations: [] };

    const email = String(user.email || "").toLowerCase().trim();
    const clientId = idToString(user._id || user.id || userId);
    if (!email) return { invitations: [] };

    const byEmail = typeof this.invitedModel.findByEmail === "function"
      ? await this.invitedModel.findByEmail(email)
      : [await this._findInviteByEmail(email)];
    const byClient = typeof this.invitedModel.findActionableCoachInvitesByTarget === "function"
      ? await this.invitedModel.findActionableCoachInvitesByTarget({ email, clientId })
      : [];
    const seenIds = new Set();
    const all = [...(byEmail || []), ...(byClient || [])].filter((invite) => {
      const id = idToString(invite?._id || invite?.id);
      if (!id || seenIds.has(id)) return false;
      seenIds.add(id);
      return true;
    });

    const invitations = (all || [])
      .filter((invite) => (
        invite &&
        (
          String(invite.email || invite.inviteeEmailNormalized || "").toLowerCase().trim() === email ||
          idToString(invite.clientId) === clientId ||
          idToString(invite.acceptedUserId) === clientId
        ) &&
        ["pending", "accepted_pending_activation"].includes(String(invite.status || "pending")) &&
        this._isCoachClientInvite(invite) &&
        !this._isInviteExpired(invite)
      ))
      .map((invite) => this._publicCoachClientInvitation(invite));

    return { invitations };
  };

  clientAcceptCoachInvitation = async ({ userId, invitationId }) => {
    const user = await this.getById(userId);
    if (!user) throw new Error("NOT_FOUND");
    if (!this._isClientUser(user)) throw new Error("USER_NOT_CLIENT");

    const invite = await this._getPendingCoachClientInvitationForUser(user, invitationId);
    const acceptance = await this._prepareCoachClientInviteAcceptance(invite);
    if (!acceptance?.pendingCoachAccess) throw new Error("INVITATION_NOT_FOUND");

    const currentCoachId = activeCoachIdFromUser(user);
    const nextCoachId = idToString(acceptance.coachAssignment.entrenadorId);
    if (currentCoachId) {
      throw new Error("CLIENT_ALREADY_HAS_ACTIVE_COACH");
    }
    if (await this.clientCoachBlocksModel.isBlocked({ clientId: user._id || user.id || userId, coachId: nextCoachId })) {
      throw new Error("COACH_BLOCKED_BY_CLIENT");
    }
    const pendingCoachAccess = user?.coachAccess || {};
    const pendingCoachId = String(pendingCoachAccess.status || "") === "accepted_pending_activation"
      ? idToString(pendingCoachAccess.coachId)
      : "";
    if (pendingCoachId && pendingCoachId !== nextCoachId) {
      throw new Error("CLIENT_ALREADY_HAS_PENDING_COACH");
    }

    const now = new Date();
    const patch = {
      coachAccess: acceptance.pendingCoachAccess,
      clientPermissions: acceptance.clientPermissions,
      updatedAt: now,
    };

    if (!user?.onboarding?.done) {
      const inviteOnboarding = isPlainObject(invite?.onboarding)
        ? invite.onboarding
        : { enabled: false, mode: "none" };
      patch.onboarding = this._onboardingFromCoachInvite(inviteOnboarding, now);
    }

    const updated = await this.updateById(user._id || user.id || userId, patch);
    const acceptedInvite = await this._markCoachInviteAcceptedPendingActivation(invite._id, updated?._id || updated?.id);
    const redirect = this._clientInvitationNextPath(updated);

    if (typeof this.invitedModel.findByEmail === "function") {
      const sameEmail = await this.invitedModel.findByEmail(user.email);
      await Promise.all((sameEmail || [])
        .filter((other) => (
          other &&
          !this._sameInvitationId(other, invite) &&
          String(other.status || "pending") === "pending" &&
          this._isCoachClientInvite(other)
        ))
        .map((other) => this.invitedModel.updateById(other._id, {
          status: "declined",
          declinedAt: now,
          declinedReason: "accepted_other_coach_invitation",
          updatedAt: now,
        })));
    }

    await recordAccessAuditEvent({
      subjectType: "client",
      subjectId: updated?._id || updated?.id || userId,
      actorType: "client",
      actorId: updated?._id || updated?.id || userId,
      event: "coach_invitation_accepted",
      previousValue: { coachAccess: user?.coachAccess || null },
      nextValue: { coachAccess: acceptance.pendingCoachAccess },
      reason: "client_accepted_coach_invitation",
      metadata: {
        invitationId: invite?._id || invite?.id || null,
        coachId: nextCoachId,
        servicePackage: acceptance.pendingCoachAccess?.servicePackage || null,
      },
    });

    return {
      user: updated,
      invitation: this._publicCoachClientInvitation(acceptedInvite || invite, acceptance.coach),
      coach: acceptance.coach,
      status: "accepted_pending_activation",
      ...redirect,
    };
  };

  coachActivateClientInvitation = async ({ coachId, invitationId }) => {
    const coach = await this.getById(coachId);
    if (!coach) throw new Error("COACH_NOT_FOUND");
    if (!this._isCoachUser(coach)) throw new Error("USER_NOT_COACH");

    const resolvedCoachId = coach._id || coach.id || coachId;
    const invitation = await this._getCoachOwnedClientInvitation({
      coachId: resolvedCoachId,
      invitationId,
    });

    if (String(invitation?.status || "") !== "accepted_pending_activation") {
      throw new Error("INVITATION_NOT_ACCEPTED_PENDING_ACTIVATION");
    }
    if (this._isInviteExpired(invitation)) throw new Error("INVITATION_EXPIRED");

    const acceptance = await this._prepareCoachClientInviteAcceptance(invitation);
    if (!acceptance?.activeCoachAccess || !acceptance?.coachAssignment) {
      throw new Error("INVITATION_NOT_FOUND");
    }

    requireCoachCanOfferService(coach, acceptance.activeCoachAccess.servicePackage);

    const client = invitation.acceptedUserId
      ? await this.getById(invitation.acceptedUserId)
      : await this._findUserByEmail(invitation.email);
    if (!client) throw new Error("NOT_FOUND");
    if (!this._isClientUser(client)) throw new Error("USER_NOT_CLIENT");

    const currentCoachId = activeCoachIdFromUser(client);
    const nextCoachId = idToString(acceptance.coachAssignment.entrenadorId);
    if (currentCoachId && currentCoachId !== nextCoachId) {
      throw new Error("CLIENT_ALREADY_HAS_ACTIVE_COACH");
    }
    if (await this.clientCoachBlocksModel.isBlocked({ clientId: client._id || client.id, coachId: nextCoachId })) {
      throw new Error("COACH_BLOCKED_BY_CLIENT");
    }

    const currentActiveClients = await this.model.countClientsByCoachId(coach._id || coach.id || coachId);
    const effectiveCapabilities = acceptance.effectiveCapabilities || await this._resolveEffectiveCapabilities(coach, {
      currentClients: currentActiveClients,
    });
    const capacity = await this.coachCapacityModel.reserveSlot({
      coachId: resolvedCoachId,
      invitationId: invitation._id,
      clientId: client._id || client.id,
      limit: effectiveCapabilities.maxClients,
      activeCount: currentActiveClients,
      now: new Date(),
    });

    if (!capacity.reserved) {
      throw coachClientCapacityError(effectiveCapabilities, Number(capacity.used || currentActiveClients || 0));
    }

    const now = new Date();
    const personalPlan = toDbPlan(client.personalPlan || client.plan || client?.personalSubscription?.plan || "free");
    const personalSubscription = client.personalSubscription || {};
    const periodEndRaw = personalSubscription.currentPeriodEnd || personalSubscription.paidUntil || null;
    const periodEnd = periodEndRaw ? new Date(periodEndRaw) : null;
    const hasPaidPeriod = ["pro", "vip"].includes(personalPlan) && periodEnd && Number.isFinite(periodEnd.getTime()) && periodEnd.getTime() > now.getTime();
    const patch = {
      coach: {
        ...(client?.coach || {}),
        ...acceptance.coachAssignment,
        assignedAt: now,
      },
      coachAccess: acceptance.activeCoachAccess,
      clientPermissions: acceptance.clientPermissions,
      updatedAt: now,
    };

    if (["pro", "vip"].includes(personalPlan)) {
      patch.personalSubscription = {
        ...personalSubscription,
        plan: personalPlan,
        status: hasPaidPeriod ? "cancel_at_period_end" : "suppressed_by_coach",
        autoRenew: false,
        currentPeriodEnd: hasPaidPeriod ? periodEnd : (personalSubscription.currentPeriodEnd || null),
        suppressedReason: "coach_access",
        updatedAt: now,
      };
    }

    let updated;
    let activatedInvite;
    try {
      updated = await this.updateById(client._id || client.id, patch);
      activatedInvite = await this.invitedModel.updateById(invitation._id, {
        status: "active",
        activatedAt: now,
        updatedAt: now,
      });
    } catch (error) {
      await this.coachCapacityModel.releaseSlot({
        coachId: resolvedCoachId,
        invitationId: invitation._id,
        clientId: client._id || client.id,
        now: new Date(),
      });
      throw error;
    }

    await recordAccessAuditEvent({
      subjectType: "client",
      subjectId: updated?._id || updated?.id || client?._id || client?.id,
      actorType: "coach",
      actorId: coach._id || coach.id || coachId,
      event: "coach_access_activated",
      previousValue: {
        coachAccess: client?.coachAccess || null,
        personalSubscription: client?.personalSubscription || null,
      },
      nextValue: {
        coachAccess: acceptance.activeCoachAccess,
        personalSubscription: patch.personalSubscription || client?.personalSubscription || null,
      },
      reason: "coach_activated_client_access",
      metadata: {
        invitationId: invitation?._id || invitation?.id || null,
        servicePackage: acceptance.activeCoachAccess?.servicePackage || null,
      },
    });

    if (patch.personalSubscription?.status) {
      await recordAccessAuditEvent({
        subjectType: "client",
        subjectId: updated?._id || updated?.id || client?._id || client?.id,
        actorType: "system",
        actorId: null,
        event: "personal_renewal_suppressed",
        previousValue: { personalSubscription: client?.personalSubscription || null },
        nextValue: { personalSubscription: patch.personalSubscription },
        reason: "coach_access_primary",
        metadata: { coachId: coach._id || coach.id || coachId },
      });
    }

    return {
      user: updated,
      client: updated,
      invitation: this._publicCoachClientInvitation(activatedInvite || invitation, coach),
      coach,
      status: "active",
    };
  };

  clientDeclineCoachInvitation = async ({ userId, invitationId }) => {
    const user = await this.getById(userId);
    if (!user) throw new Error("NOT_FOUND");
    if (!this._isClientUser(user)) throw new Error("USER_NOT_CLIENT");

    const invite = await this._getPendingCoachClientInvitationForUser(user, invitationId);
    const now = new Date();
    const updatedInvite = await this.invitedModel.updateById(invite._id, {
      status: "declined",
      declinedAt: now,
      rejectedAt: now,
      rejectionCooldownUntil: new Date(now.getTime() + COACH_INVITATION_REJECT_COOLDOWN_MS),
      updatedAt: now,
    });

    await recordAccessAuditEvent({
      subjectType: "client",
      subjectId: user._id || user.id || userId,
      actorType: "client",
      actorId: user._id || user.id || userId,
      event: "coach_invitation_rejected",
      previousValue: { invitationId: invite?._id || invite?.id || null, status: invite?.status || null },
      nextValue: { invitationId: invite?._id || invite?.id || null, status: "declined" },
      reason: "client_declined_coach_invitation",
      metadata: { coachId: invite?.assignedCoachId || null },
    });

    return {
      user,
      invitation: this._publicCoachClientInvitation(updatedInvite || invite),
    };
  };

  clientBlockCoachFromInvitation = async ({
    userId,
    invitationId,
    reportedAsSpam = false,
    reportReason = "",
    comment = "",
  } = {}) => {
    const user = await this.getById(userId);
    if (!user) throw new Error("NOT_FOUND");
    if (!this._isClientUser(user)) throw new Error("USER_NOT_CLIENT");

    const invite = await this._getActionableCoachClientInvitationForUser(user, invitationId);
    const coachId = idToString(invite.assignedCoachId || invite.invitedBy || invite.coachId);
    if (!coachId) throw new Error("COACH_NOT_FOUND");

    const now = new Date();
    const block = await this.clientCoachBlocksModel.block({
      clientId: user._id || user.id || userId,
      coachId,
      invitationId: invite._id || invite.id,
      reason: "client_blocked_from_invitation",
      reportedAsSpam,
      reportReason,
      comment,
      now,
    });

    await this.invitedModel.updateById(invite._id || invite.id, {
      status: "cancelled",
      cancelledAt: now,
      cancelledReason: "blocked_by_client",
      clientId: toMongoIdOrString(user._id || user.id || userId),
      updatedAt: now,
    });

    await this.invitedModel.cancelPendingByClientAndCoach({
      clientId: user._id || user.id || userId,
      coachId,
      reason: "blocked_by_client",
      now,
    });

    const pendingAccess = user?.coachAccess || {};
    let updated = user;
    if (
      String(pendingAccess.status || "") === "accepted_pending_activation" &&
      idToString(pendingAccess.coachId) === coachId
    ) {
      updated = await this.updateById(user._id || user.id || userId, {
        coachAccess: {
          ...pendingAccess,
          status: "cancelled_by_client",
          cancelledAt: now,
          updatedAt: now,
        },
        updatedAt: now,
      });
    }

    await recordAccessAuditEvent({
      subjectType: "client",
      subjectId: user._id || user.id || userId,
      actorType: "client",
      actorId: user._id || user.id || userId,
      event: "coach_invitation_blocked",
      previousValue: { invitationId: invite?._id || invite?.id || null, status: invite?.status || null },
      nextValue: { coachId, blockId: block?._id || block?.id || null, reportedAsSpam: !!reportedAsSpam },
      reason: "client_blocked_coach",
      metadata: { reportReason: String(reportReason || "").slice(0, 120) },
    });

    if (reportedAsSpam) {
      await recordAccessAuditEvent({
        subjectType: "client",
        subjectId: user._id || user.id || userId,
        actorType: "client",
        actorId: user._id || user.id || userId,
        event: "coach_invitation_reported",
        previousValue: null,
        nextValue: { coachId, invitationId: invite?._id || invite?.id || null },
        reason: "client_reported_coach_invitation",
        metadata: {
          reportReason: String(reportReason || "").slice(0, 120),
          comment: String(comment || "").slice(0, 500),
        },
      });
    }

    return {
      user: updated,
      block,
      status: "blocked",
    };
  };

  clientListBlockedCoaches = async ({ userId }) => {
    const user = await this.getById(userId);
    if (!user) throw new Error("NOT_FOUND");
    if (!this._isClientUser(user)) throw new Error("USER_NOT_CLIENT");

    const blocks = await this.clientCoachBlocksModel.listByClient(user._id || user.id || userId);
    const coaches = await Promise.all((blocks || []).map(async (block) => {
      const coach = await this.getById(idToString(block.coachId)).catch(() => null);
      return {
        id: idToString(block._id || block.id),
        coachId: idToString(block.coachId),
        coachName: this._coachDisplayName(coach),
        coachEmail: coach?.email || "",
        blockedAt: block.blockedAt || block.createdAt || null,
        reportedAsSpam: !!block.reportedAsSpam,
        reportReason: block.reportReason || "",
      };
    }));

    return { blockedCoaches: coaches };
  };

  clientUnblockCoach = async ({ userId, coachId }) => {
    const user = await this.getById(userId);
    if (!user) throw new Error("NOT_FOUND");
    if (!this._isClientUser(user)) throw new Error("USER_NOT_CLIENT");

    const block = await this.clientCoachBlocksModel.unblock({
      clientId: user._id || user.id || userId,
      coachId,
      now: new Date(),
    });

    await recordAccessAuditEvent({
      subjectType: "client",
      subjectId: user._id || user.id || userId,
      actorType: "client",
      actorId: user._id || user.id || userId,
      event: "coach_unblocked",
      previousValue: { coachId },
      nextValue: { blockId: block?._id || block?.id || null, isActive: false },
      reason: "client_unblocked_coach",
      metadata: {},
    });

    return await this.clientListBlockedCoaches({ userId });
  };

  clientDismissCoachNotice = async ({ userId }) => {
    const user = await this.getById(userId);
    if (!user) throw new Error("NOT_FOUND");
    if (!this._isClientUser(user)) throw new Error("USER_NOT_CLIENT");

    const notice = user?.clientCoachNotice;
    if (!notice) return { user };

    const updated = await this.updateById(user._id || user.id || userId, {
      clientCoachNotice: {
        ...notice,
        status: "read",
        dismissedAt: new Date(),
      },
      updatedAt: new Date(),
    });

    return { user: updated };
  };

  clientLeaveCoach = async ({ userId }) => {
    const user = await this.getById(userId);
    if (!user) throw new Error("NOT_FOUND");
    if (!this._isClientUser(user)) throw new Error("USER_NOT_CLIENT");

    const coachId = idToString(user?.coach?.entrenadorId);
    if (!coachId) throw new Error("CLIENT_HAS_NO_COACH");

    const source = String(user?.coach?.source || "").toLowerCase();
    if (source !== "coach_invite") {
      throw new Error("COACH_UNLINK_REQUIRES_ADMIN");
    }

    const result = await this.disconnectClientFromCoach({
      clientId: user._id || user.id || userId,
      coachId,
      reason: "client_left_coach",
      actor: user._id || user.id || userId,
    });

    return {
      user: result.user,
      status: "unassigned",
      revokedMenus: result.revokedMenus,
    };
  };

  clientRequestCoachChange = async ({ userId, reason = "" }) => {
    const user = await this.getById(userId);
    if (!user) throw new Error("NOT_FOUND");
    if (!this._isClientUser(user)) throw new Error("USER_NOT_CLIENT");

    const coachId = idToString(user?.coach?.entrenadorId);
    if (!coachId) throw new Error("CLIENT_HAS_NO_COACH");

    const source = String(user?.coach?.source || "").toLowerCase();
    if (source !== "admin") {
      throw new Error("COACH_CHANGE_REQUEST_NOT_REQUIRED");
    }

    const now = new Date();
    const request = {
      type: "coach_change_or_unlink",
      status: "pending",
      coachId,
      source: "admin_assignment",
      reason: cleanString(reason || "", 500),
      requestedAt: user?.coachChangeRequest?.requestedAt || now,
      updatedAt: now,
    };

    const updated = await this.updateById(user._id || user.id || userId, {
      coachChangeRequest: request,
      updatedAt: now,
    });

    return {
      user: updated,
      request,
      status: "requested",
    };
  };

  // =========================
  // ADMIN: LIST USERS / COACHES / CLIENTS
  // =========================
  adminListUsers = async ({
    search = "",
    role = "todos",
    tipo = "todos",
    estado = "todos",
    limit = 100,
    skip = 0,
  } = {}) => {
    limit = Math.min(Number(limit) || 100, 500);
    skip = Math.max(Number(skip) || 0, 0);

    let arr = [];
    let total = 0;

    if (typeof this.model.adminListUsers === "function") {
      const data = await this.model.adminListUsers({ search, role, tipo, estado, limit, skip });
      arr = Array.isArray(data?.users) ? data.users : [];
      total = Number(data?.total ?? arr.length);
    } else {
      if (typeof this.model.obtenerUsuarios !== "function") {
        throw new Error("El modelo no implementa obtenerUsuarios");
      }

      const raw = await this.model.obtenerUsuarios();
      arr = Array.isArray(raw) ? raw : raw?.users || raw?.usuarios || [];

      const s = String(search || "").trim().toLowerCase();
      if (s) {
        arr = arr.filter((u) => {
          const email = String(u?.email || "").toLowerCase();
          const nombre = String(u?.profile?.nombre || "").toLowerCase();
          const apellido = String(u?.profile?.apellido || "").toLowerCase();
          return (
            email.includes(s) ||
            nombre.includes(s) ||
            apellido.includes(s) ||
            `${nombre} ${apellido}`.includes(s)
          );
        });
      }

      if (role && role !== "todos") arr = arr.filter((u) => normalizeRole(u?.role || u?.rol) === normalizeRole(role));
      if (tipo && tipo !== "todos") arr = arr.filter((u) => (u?.tipo || "") === tipo);
      if (estado && estado !== "todos") arr = arr.filter((u) => (u?.estado || "activo") === estado);

      total = arr.length;
      arr = arr.slice(skip, skip + limit);
    }

    const usersWithCapabilities = await this._withEffectiveCapabilitiesMany(arr);
    const users = usersWithCapabilities.map((u) => this._sanitizeUser(u));

    return {
      users,
      total,
    };
  };

  adminListCoaches = async ({ search = "", limit = 100, skip = 0 } = {}) => {
    limit = Math.min(Number(limit) || 100, 500);
    skip = Math.max(Number(skip) || 0, 0);

    let arr = [];
    let total = 0;

    if (typeof this.model.adminListCoaches === "function") {
      const data = await this.model.adminListCoaches({ search, limit, skip });
      arr = Array.isArray(data?.coaches) ? data.coaches : [];
      total = Number(data?.total ?? arr.length);
    } else {
      arr = await this._listCoachesBase();

      const s = String(search || "").trim().toLowerCase();
      if (s) {
        arr = arr.filter((u) => {
          const email = String(u?.email || "").toLowerCase();
          const nombre = String(u?.profile?.nombre || "").toLowerCase();
          const apellido = String(u?.profile?.apellido || "").toLowerCase();
          return (
            email.includes(s) ||
            nombre.includes(s) ||
            apellido.includes(s) ||
            `${nombre} ${apellido}`.includes(s)
          );
        });
      }

      total = arr.length;
      arr = arr.slice(skip, skip + limit);
    }

    const coachesWithCapabilities = await this._withEffectiveCapabilitiesMany(arr);
    const coaches = coachesWithCapabilities.map((u) => this._sanitizeUser(u));

    return { coaches, total };
  };

  adminListUnassignedClients = async ({ search = "", limit = 100, skip = 0 } = {}) => {
    limit = Math.min(Number(limit) || 100, 500);
    skip = Math.max(Number(skip) || 0, 0);

    let arr = [];
    let total = 0;

    if (typeof this.model.adminListUnassignedClients === "function") {
      const data = await this.model.adminListUnassignedClients({ search, limit, skip });
      arr = Array.isArray(data?.clients) ? data.clients : [];
      total = Number(data?.total ?? arr.length);
    } else {
      arr = await this._listUnassignedClientsBase();

      const s = String(search || "").trim().toLowerCase();
      if (s) {
        arr = arr.filter((u) => {
          const email = String(u?.email || "").toLowerCase();
          const nombre = String(u?.profile?.nombre || "").toLowerCase();
          const apellido = String(u?.profile?.apellido || "").toLowerCase();
          return (
            email.includes(s) ||
            nombre.includes(s) ||
            apellido.includes(s) ||
            `${nombre} ${apellido}`.includes(s)
          );
        });
      }

      total = arr.length;
      arr = arr.slice(skip, skip + limit);
    }

    return { clients: arr.map((u) => this._sanitizeUser(u)), total };
  };

  adminGetUserById = async (id) => {
    const u = await this.getById(id);
    return u ? this._sanitizeUser(u) : null;
  };

  // =========================
  // ADMIN: CREATE USER
  // =========================
  adminCreateUser = async ({
    email,
    password,
    role = "cliente",
    plan = "free",
    estado = "activo",
    tipo = null,
    profile = {},
  }) => {
    if (!email || !password) throw new Error("Email y password requeridos");

    role = normalizeRole(role);

    const validRoles = ["admin", "cliente", "coach"];
    if (!validRoles.includes(role)) throw new Error("ROL_INVALIDO");

    const requestedPlan = String(plan || "").trim().toLowerCase();
    const professionalPlan = role === "coach"
      ? normalizeProfessionalSubscriptionPlan(requestedPlan || "coach_initial")
      : null;
    const hasCanonicalProfessionalPlan = role === "coach" && (
      !requestedPlan ||
      requestedPlan === "free" ||
      ["coach_initial", "coach_pro", "coach_ai", "coach_vip"].includes(requestedPlan)
    );
    const dbPlan = normalizePlanForRole(plan, role);
    if (!dbPlan) throw new Error("PLAN_INVALIDO");

    email = String(email).trim().toLowerCase();

    const exists = await this._findUserByEmail(email);
    if (exists) throw new Error("EMAIL_DUPLICADO");

    const passwordHash = await bcrypt.hash(password, 10);
    const resolvedTipo = tipo || inferTipoFromRole(role);
    const coachPlanConfig = role === "coach" ? await this._getCoachPlanConfig(dbPlan) : null;
    const now = new Date();
    const defaults = getUserDefaults({ role, plan: dbPlan, tipo: resolvedTipo });

    const userToCreate = {
      email,
      passwordHash,

      ...defaults,

      estado,
      emailVerificado: false,
      ...(role === "coach"
        ? {
            billing: {
              ...(defaults.billing || {}),
              status: hasCanonicalProfessionalPlan ? "active" : defaults.billing?.status,
            },
            subscription: hasCanonicalProfessionalPlan
              ? {
                  status: "active",
                  trialStartedAt: null,
                  trialEndsAt: null,
                  paidUntil: null,
                  updatedAt: now,
                }
              : createTrialSubscription({
                  planCode: dbPlan,
                  now,
                  durationDays: coachPlanConfig?.durationDays || 7,
                }),
            ...(hasCanonicalProfessionalPlan
              ? {
                  coachSubscription: professionalSubscriptionPatch(professionalPlan, {
                    status: "active",
                    now,
                  }),
                }
              : {}),
          }
        : {}),
      coachOverrides: role === "coach" ? createEmptyCoachOverrides() : null,

      profile: profile || {},
      settings: {},

      createdAt: now,
      updatedAt: null,
    };

    const created = await this._createUser(userToCreate);
    return this._sanitizeUser(created);
  };

  // =========================
  // ADMIN: UPDATE / DELETE USER
  // =========================
  adminUpdateUser = async (id, updates = {}) => {
    const currentRaw = await this.model.obtenerPorId(id);
    if (!currentRaw) throw new Error("NOT_FOUND");

    const patch = { ...updates };

    if (patch.email !== undefined) {
      const email = String(patch.email).trim().toLowerCase();
      if (!email) {
        delete patch.email;
      } else {
        const other = await this._findUserByEmail(email);
        const otherId = other ? (other._id?.toString?.() || other.id) : null;
        if (other && String(otherId) !== String(id)) throw new Error("EMAIL_DUPLICADO");
        patch.email = email;
      }
    }

    if (patch.role !== undefined) {
      patch.role = normalizeRole(patch.role);

      const validRoles = ["admin", "cliente", "coach"];
      if (!validRoles.includes(patch.role)) throw new Error("ROL_INVALIDO");

      if (patch.tipo === undefined) {
        patch.tipo = inferTipoFromRole(patch.role);
      }
    }

    if (patch.plan !== undefined) {
      if (patch.plan === null || String(patch.plan).trim() === "") {
        patch.plan = null;
      } else {
        const dbPlan = normalizePlanForRole(patch.plan, patch.role || currentRaw.role);
        if (!dbPlan) throw new Error("PLAN_INVALIDO");
        patch.plan = dbPlan;
      }
    }

    if (patch.password !== undefined) {
      const pass = String(patch.password || "");
      if (pass.length < 6) throw new Error("PASSWORD_CORTA");
      patch.passwordHash = await bcrypt.hash(pass, 10);
      delete patch.password;
    }

    if (patch._id) delete patch._id;

    const updated = await this._updateById(id, patch);
    return this._sanitizeUser(updated);
  };

  adminDeleteUser = async (id, adminId = null) => {
    const user = await this.getById(id);
    if (!user) throw new Error("NOT_FOUND");

    let unassignedClients = { matchedCount: 0, modifiedCount: 0 };
    if (this._isCoachUser(user)) {
      unassignedClients = await this._unassignAllClientsFromCoach(id, adminId);
    }

    if (typeof this.model.borrarUsuario !== "function") {
      throw new Error("El modelo no implementa borrarUsuario");
    }
    const result = await this.model.borrarUsuario(id);
    return {
      deleted: true,
      role: user.role,
      unassignedClients,
      result,
    };
  };

  // =========================
  // ADMIN: STATUS / PLAN / META
  // =========================
  adminUpdateStatus = async (id, estado) => {
    const valid = ["activo", "bloqueado", "inactivo"];
    const next = String(estado || "").trim().toLowerCase();
    if (!valid.includes(next)) throw new Error("ESTADO_INVALIDO");

    const user = await this.getById(id);
    if (!user) throw new Error("NOT_FOUND");

    return await this.updateById(id, {
      estado: next,
      updatedAt: new Date(),
    });
  };

  async _buildAdminCoachPlanPreview(user, plan, options = {}) {
    if (!user || !this._isCoachUser(user)) throw new Error("USER_NOT_COACH");

    const professionalPlan = normalizeProfessionalSubscriptionPlan(plan);
    const professionalConfig = PROFESSIONAL_SUBSCRIPTION_PLANS[professionalPlan];
    const legacyPlan = professionalConfig?.legacyPlan;
    if (!legacyPlan) throw new Error("PLAN_INVALIDO");

    const [planConfig, currentClients] = await Promise.all([
      this._getCoachPlanConfig(legacyPlan),
      this._countClientsForCoach(user._id || user.id),
    ]);
    if (!planConfig) throw new Error("PLAN_NOT_FOUND");

    const currentSubscription = normalizeCoachSubscription(user);
    const candidate = {
      ...user,
      plan: legacyPlan,
      coachSubscription: professionalSubscriptionPatch(professionalPlan, {
        status: "active",
        now: new Date(),
        currentPeriodEnd: currentSubscription.currentPeriodEnd,
      }),
      coachOverrides: options?.resetOverrides
        ? createEmptyCoachOverrides()
        : normalizeCoachOverrides(user?.coachOverrides || {}),
    };
    const effectiveCapabilities = await this._resolveEffectiveCapabilities(candidate, {
      currentClients,
      planConfig,
    });
    const maxClients = Number(effectiveCapabilities?.maxClients || 0);
    const violations = coachLimitViolations(effectiveCapabilities);
    const limitExceeded = violations.length > 0;
    const menus = effectiveCapabilities?.features?.menus || {};
    const limits = effectiveCapabilities?.limits || {};
    const usage = effectiveCapabilities?.usage || {};

    return {
      plan: professionalPlan,
      legacyPlan,
      currentClients,
      maxClients,
      currentCoachOwnedMenus: Number(usage.currentCoachOwnedMenus || 0),
      currentCoachOwnedMeals: Number(usage.currentCoachOwnedMeals || 0),
      maxCoachOwnedMenus: Number(limits.maxCoachOwnedMenus || 0),
      maxCoachOwnedMeals: Number(limits.maxCoachOwnedMeals || 0),
      planDefaults: {
        maxActiveClients: Number(planConfig.maxClients || 0),
        maxCoachOwnedMenus: Number(planConfig.maxCoachOwnedMenus || 0),
        maxCoachOwnedMeals: Number(planConfig.maxCoachOwnedMeals || 0),
      },
      limitExceeded,
      canSave: !limitExceeded,
      violations,
      resetOverrides: !!options?.resetOverrides,
      usesOverrides: !!effectiveCapabilities?.usesOverrides,
      isTrial: !!effectiveCapabilities?.isTrial,
      isTrialExpired: !!effectiveCapabilities?.isTrialExpired,
      subscriptionBlocked: !!effectiveCapabilities?.subscriptionBlocked,
      libraryCapabilities: {
        canCreateCoachMenus: menus.canCreateCoachMenus === true,
        canCreateCoachMeals: menus.canCreateCoachMeals === true,
        canUseGlobalMenuTemplates: menus.canUseGlobalMenuTemplates === true,
        canUseGlobalMealTemplates: menus.canUseGlobalMealTemplates === true,
        canUsePremiumMenuTemplates: menus.canUsePremiumMenuTemplates === true,
        canUsePremiumMealTemplates: menus.canUsePremiumMealTemplates === true,
        canDuplicateGlobalTemplates: menus.canDuplicateGlobalTemplates === true,
        canAssignGlobalTemplates: menus.canAssignGlobalTemplates === true,
      },
      effectiveCapabilities,
    };
  }

  adminPreviewCoachPlan = async (id, payload = {}) => {
    const user = await this.getById(id);
    if (!user) throw new Error("NOT_FOUND");
    if (!this._isCoachUser(user)) throw new Error("USER_NOT_COACH");

    return await this._buildAdminCoachPlanPreview(user, payload?.plan, {
      resetOverrides: !!payload?.resetOverrides,
    });
  };

  adminUpdatePlan = async (id, plan, options = {}) => {
    const user = await this.getById(id);
    if (!user) throw new Error("NOT_FOUND");

    const isCoach = this._isCoachUser(user);
    const professionalPlan = isCoach ? normalizeProfessionalSubscriptionPlan(plan) : null;
    const dbPlan = isCoach
      ? PROFESSIONAL_SUBSCRIPTION_PLANS[professionalPlan]?.legacyPlan
      : normalizePlanForRole(plan, user.role);
    if (!dbPlan) throw new Error("PLAN_INVALIDO");
    if (isCoach) {
      const preview = await this._buildAdminCoachPlanPreview(user, professionalPlan, options);
      if (preview.limitExceeded) {
        throw coachLimitConflict("COACH_PLAN_LIMIT_EXCEEDED", preview.plan, preview.violations);
      }
    }
    const now = new Date();
    const legacySubscriptionStatus = String(user?.subscription?.status || "").trim().toLowerCase();
    const hasTrialBenefit = isCoach && ["trial", "trialing"].includes(legacySubscriptionStatus);

    const billing = {
      ...(user?.billing || {}),
      status: isCoach
        ? (hasTrialBenefit ? "trial" : "active")
        : (dbPlan === "free" ? "free" : (user?.billing?.status || "inactive")),
    };

    const patch = {
      plan: dbPlan,
      billing,
      updatedAt: now,
    };

    if (isCoach) {
      const currentSubscription = normalizeCoachSubscription(user);
      patch.coachSubscription = professionalSubscriptionPatch(professionalPlan, {
        status: "active",
        now,
        currentPeriodEnd: currentSubscription.currentPeriodEnd,
      });
      patch.subscription = {
        ...(user?.subscription || {}),
        status: hasTrialBenefit ? "trial" : "active",
        trialStartedAt: hasTrialBenefit ? user?.subscription?.trialStartedAt || null : null,
        trialEndsAt: hasTrialBenefit ? user?.subscription?.trialEndsAt || null : null,
        paidUntil: currentSubscription.currentPeriodEnd,
        updatedAt: now,
      };

      if (options?.resetOverrides) {
        patch.coachOverrides = createEmptyCoachOverrides();
      }
    }

    const updated = await this.updateById(id, patch);
    return await this._withEffectiveCapabilities(updated);
  };

  adminListCoachPlans = async () => {
    if (typeof this.coachPlanModel?.list !== "function") {
      return ["trial_pro", "pro", "vip"].map((code) => normalizePlanConfig(code));
    }
    return await this.coachPlanModel.list();
  };

  adminGetCoachPlan = async (planCode) => {
    const code = normalizeCoachPlanCode(planCode);
    if (!code) throw new Error("PLAN_NOT_FOUND");

    const plan = await this._getCoachPlanConfig(code);
    if (!plan) throw new Error("PLAN_NOT_FOUND");
    return plan;
  };

  adminUpdateCoachPlanConfig = async (planCode, payload = {}, options = {}) => {
    const code = normalizeCoachPlanCode(planCode);
    if (!code) throw new Error("PLAN_NOT_FOUND");
    if (typeof this.coachPlanModel?.updateByCode !== "function") {
      throw new Error("PLAN_CONFIG_MODEL_UNAVAILABLE");
    }

    const patch = { ...payload };
    delete patch._id;
    delete patch.id;
    delete patch.code;
    if (patch.maxClients !== undefined) {
      patch.maxClients = validateCoachLimitValue("maxClients", patch.maxClients);
    }
    if (patch.maxCoachOwnedMenus !== undefined) {
      patch.maxCoachOwnedMenus = validateCoachLimitValue("maxCoachOwnedMenus", patch.maxCoachOwnedMenus);
    }
    if (patch.maxCoachOwnedMeals !== undefined) {
      patch.maxCoachOwnedMeals = validateCoachLimitValue("maxCoachOwnedMeals", patch.maxCoachOwnedMeals);
    }

    return await this.coachPlanModel.updateByCode(code, patch, { updatedBy: options.updatedBy || null });
  };

  adminResetCoachPlanConfig = async (planCode, options = {}) => {
    const code = normalizeCoachPlanCode(planCode);
    if (!code) throw new Error("PLAN_NOT_FOUND");
    if (typeof this.coachPlanModel?.resetByCode !== "function") {
      throw new Error("PLAN_CONFIG_MODEL_UNAVAILABLE");
    }

    return await this.coachPlanModel.resetByCode(code, { updatedBy: options.updatedBy || null });
  };

  adminListClientPlans = async () => {
    if (typeof this.clientPlanModel?.list !== "function") {
      throw new Error("PLAN_CONFIG_MODEL_UNAVAILABLE");
    }
    return await this.clientPlanModel.list();
  };

  adminGetClientPlan = async (planCode) => {
    const code = normalizeClientPlanSettingCode(planCode);
    if (!code) throw new Error("PLAN_NOT_FOUND");
    const plan = await this.clientPlanModel.getByCode(code);
    if (!plan) throw new Error("PLAN_NOT_FOUND");
    return plan;
  };

  adminUpdateClientPlanConfig = async (planCode, payload = {}, options = {}) => {
    const code = normalizeClientPlanSettingCode(planCode);
    if (!code) throw new Error("PLAN_NOT_FOUND");
    if (typeof this.clientPlanModel?.updateByCode !== "function") {
      throw new Error("PLAN_CONFIG_MODEL_UNAVAILABLE");
    }
    const patch = validateClientPlanSettingPatch(payload);
    delete patch._id;
    delete patch.id;
    delete patch.code;
    return await this.clientPlanModel.updateByCode(code, patch, { updatedBy: options.updatedBy || null });
  };

  adminResetClientPlanConfig = async (planCode, options = {}) => {
    const code = normalizeClientPlanSettingCode(planCode);
    if (!code) throw new Error("PLAN_NOT_FOUND");
    if (typeof this.clientPlanModel?.resetByCode !== "function") {
      throw new Error("PLAN_CONFIG_MODEL_UNAVAILABLE");
    }
    return await this.clientPlanModel.resetByCode(code, { updatedBy: options.updatedBy || null });
  };

  adminUpdateCoachPlan = async (id, payload = {}) => {
    const user = await this.getById(id);
    if (!user) throw new Error("NOT_FOUND");
    if (!this._isCoachUser(user)) throw new Error("USER_NOT_COACH");

    return await this.adminUpdatePlan(id, payload?.plan, {
      resetOverrides: !!payload?.resetOverrides,
    });
  };

  adminUpdateCoachOverrides = async (id, payload = {}, options = {}) => {
    const user = await this.getById(id);
    if (!user) throw new Error("NOT_FOUND");
    if (!this._isCoachUser(user)) throw new Error("USER_NOT_COACH");

    const sanitizedPayload = { ...payload };
    if (Object.prototype.hasOwnProperty.call(payload, "maxClients")) {
      sanitizedPayload.maxClients = validateCoachLimitValue("maxClients", payload.maxClients, { allowNull: true });
    }
    if (Object.prototype.hasOwnProperty.call(payload, "maxCoachOwnedMenus")) {
      sanitizedPayload.maxCoachOwnedMenus = validateCoachLimitValue(
        "maxCoachOwnedMenus",
        payload.maxCoachOwnedMenus,
        { allowNull: true }
      );
    }
    if (Object.prototype.hasOwnProperty.call(payload, "maxCoachOwnedMeals")) {
      sanitizedPayload.maxCoachOwnedMeals = validateCoachLimitValue(
        "maxCoachOwnedMeals",
        payload.maxCoachOwnedMeals,
        { allowNull: true }
      );
    }

    const nextOverrides = normalizeCoachOverrides({
      ...(user?.coachOverrides || {}),
      ...sanitizedPayload,
      features: {
        ...(user?.coachOverrides?.features || {}),
        ...(sanitizedPayload?.features || {}),
        routines: {
          ...(user?.coachOverrides?.features?.routines || {}),
          ...(sanitizedPayload?.features?.routines || {}),
        },
        menus: {
          ...(user?.coachOverrides?.features?.menus || {}),
          ...(sanitizedPayload?.features?.menus || {}),
        },
        metrics: {
          ...(user?.coachOverrides?.features?.metrics || {}),
          ...(sanitizedPayload?.features?.metrics || {}),
        },
        exports: {
          ...(user?.coachOverrides?.features?.exports || {}),
          ...(sanitizedPayload?.features?.exports || {}),
        },
      },
    });

    const candidate = await this._resolveEffectiveCapabilities({
      ...user,
      coachOverrides: nextOverrides,
    });
    const violations = coachLimitViolations(candidate);
    if (violations.length) {
      const plan = normalizeProfessionalSubscriptionPlan(user?.coachSubscription?.plan || user?.plan);
      throw coachLimitConflict("COACH_OVERRIDE_BELOW_USAGE", plan, violations);
    }

    const updated = await this.updateById(id, {
      coachOverrides: nextOverrides,
      coachOverridesUpdatedAt: new Date(),
      coachOverridesUpdatedBy: options.updatedBy || null,
      updatedAt: new Date(),
    });

    return await this._withEffectiveCapabilities(updated);
  };

  adminDeleteCoachOverrides = async (id, options = {}) => {
    const user = await this.getById(id);
    if (!user) throw new Error("NOT_FOUND");
    if (!this._isCoachUser(user)) throw new Error("USER_NOT_COACH");

    const emptyOverrides = createEmptyCoachOverrides();
    const candidate = await this._resolveEffectiveCapabilities({
      ...user,
      coachOverrides: emptyOverrides,
    });
    const violations = coachLimitViolations(candidate);
    if (violations.length) {
      const plan = normalizeProfessionalSubscriptionPlan(user?.coachSubscription?.plan || user?.plan);
      throw coachLimitConflict("COACH_OVERRIDE_BELOW_USAGE", plan, violations);
    }

    const updated = await this.updateById(id, {
      coachOverrides: emptyOverrides,
      coachOverridesUpdatedAt: new Date(),
      coachOverridesUpdatedBy: options.updatedBy || null,
      updatedAt: new Date(),
    });

    return await this._withEffectiveCapabilities(updated);
  };

  adminGetEffectiveCapabilities = async (id) => {
    const user = await this.getById(id);
    if (!user) throw new Error("NOT_FOUND");
    if (!this._isCoachUser(user)) throw new Error("USER_NOT_COACH");

    const userWithCapabilities = await this._withEffectiveCapabilities(user);

    return {
      user: userWithCapabilities,
      effectiveCapabilities: userWithCapabilities?.effectiveCapabilities || null,
    };
  };

  adminStartImpersonation = async ({ adminId, targetUserId }) => {
    if (!process.env.JWT_SECRET) throw new Error("Falta JWT_SECRET en .env");

    const admin = await this.getById(adminId);
    if (!admin) throw new Error("NOT_FOUND");
    if (normalizeRole(admin?.role) !== "admin") throw new Error("ADMIN_REQUIRED");

    const target = await this.getById(targetUserId);
    if (!target) throw new Error("NOT_FOUND");

    const targetRole = normalizeRole(target?.role);
    if (targetRole === "admin") throw new Error("CANNOT_IMPERSONATE_ADMIN");
    if (!["cliente", "coach"].includes(targetRole)) throw new Error("ROLE_NOT_IMPERSONABLE");

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 60 * 1000);
    const sessionId = crypto.randomUUID();

    const targetWithCapabilities = await this._withEffectiveCapabilities(target);

    try {
      await this.impersonationAuditModel.record({
        sessionId,
        action: "impersonation_started",
        adminId: admin._id,
        targetUserId: target._id,
        targetRole,
        startedAt: now,
      });
    } catch (error) {
      console.error("No se pudo registrar auditoria de simulacion:", error?.message || error);
    }

    const token = jwt.sign(
      {
        uid: target._id,
        email: target.email,
        role: targetRole,
        actorAdminId: admin._id,
        targetUserId: target._id,
        targetRole,
        impersonation: true,
        readOnly: true,
        sessionId,
        startedAt: now.toISOString(),
      },
      process.env.JWT_SECRET,
      { expiresIn: "30m" }
    );

    return {
      token,
      expiresAt,
      sessionId,
      actorAdminId: admin._id,
      targetUser: this._sanitizeUser(targetWithCapabilities),
    };
  };

  adminStopImpersonation = async (impersonation = {}) => {
    if (!impersonation?.impersonation) {
      return { active: false };
    }

    const endedAt = new Date();
    try {
      await this.impersonationAuditModel.record({
        sessionId: impersonation.impersonationSessionId || null,
        action: "impersonation_ended",
        adminId: impersonation.actorAdminId,
        targetUserId: impersonation.targetUserId || impersonation.id,
        targetRole: impersonation.targetRole || impersonation.role,
        startedAt: impersonation.impersonationStartedAt
          ? new Date(impersonation.impersonationStartedAt)
          : null,
        endedAt,
      });
    } catch (error) {
      console.error("No se pudo registrar cierre de simulacion:", error?.message || error);
    }

    return { active: false, endedAt };
  };

  adminGetCurrentImpersonation = async (impersonation = {}) => {
    if (!impersonation?.impersonation) {
      return { active: false };
    }

    const target = await this.getById(impersonation.targetUserId || impersonation.id);
    if (!target) return { active: false };

    return {
      active: true,
      readOnly: !!impersonation.readOnly,
      actorAdminId: impersonation.actorAdminId || null,
      sessionId: impersonation.impersonationSessionId || null,
      startedAt: impersonation.impersonationStartedAt || null,
      targetUser: this._sanitizeUser(await this._withEffectiveCapabilities(target)),
    };
  };

  adminUpdateAdminMeta = async (id, payload = {}) => {
    const user = await this.getById(id);
    if (!user) throw new Error("NOT_FOUND");

    const current = user?.adminMeta || {};
    const next = {
      ...current,
      ...(payload?.internalNote !== undefined
        ? { internalNote: String(payload.internalNote || "") }
        : {}),
      ...(Array.isArray(payload?.tags) ? { tags: payload.tags.map((t) => String(t)) } : {}),
      ...(payload?.priority !== undefined ? { priority: String(payload.priority || "normal") } : {}),
      lastReviewedAt: new Date(),
    };

    return await this.updateById(id, {
      adminMeta: next,
      updatedAt: new Date(),
    });
  };

  adminResetOnboarding = async (id) => {
    const user = await this.getById(id);
    if (!user) throw new Error("NOT_FOUND");

    return await this.updateById(id, {
      onboarding: {
        ...(user?.onboarding || {}),
        done: false,
        step: 1,
        startedAt: new Date(),
        completedAt: null,
        lastSeenAt: null,
      },
      updatedAt: new Date(),
    });
  };

  // =========================
  // ADMIN: GOALS / DAILY GOALS
  // =========================
  adminUpdateGoals = async (id, payload = {}) => {
    const user = await this.getById(id);
    if (!user) throw new Error("NOT_FOUND");
    if (!this._isClientUser(user)) throw new Error("USER_NOT_CLIENT");

    const nextGoal = {
      ...(user?.goal || {}),
      ...(payload?.goal || {}),
      updatedAt: new Date(),
    };

    const nextMetas = {
      ...(user?.metasActuales || {}),
      ...(payload?.metasActuales || {}),
      macros: {
        ...(user?.metasActuales?.macros || {}),
        ...(payload?.metasActuales?.macros || {}),
      },
      source: normalizeGoalSource(payload?.metasActuales?.source) || "self",
      sourceCoachId: null,
      needsReview: payload?.metasActuales?.needsReview === true ? true : false,
      updatedAt: new Date(),
    };

    const updated = await this.updateById(id, {
      goal: nextGoal,
      metasActuales: nextMetas,
      goalsMetadata: {
        ...(user?.goalsMetadata || {}),
        ...goalsMetadataPatch("admin", new Date()),
      },
      updatedAt: new Date(),
    });

    await recordAccessAuditEvent({
      subjectType: "client",
      subjectId: id,
      actorType: "admin",
      actorId: null,
      event: "goals_changed",
      previousValue: { goal: user?.goal || {}, metasActuales: user?.metasActuales || {} },
      nextValue: { goal: nextGoal, metasActuales: nextMetas },
      reason: "admin_update_goals",
      metadata: { source: "admin_users" },
    });

    return updated;
  };

  adminUpdateDailyGoals = async (id, metasDiarias = {}) => {
    const user = await this.getById(id);
    if (!user) throw new Error("NOT_FOUND");
    if (!this._isClientUser(user)) throw new Error("USER_NOT_CLIENT");

    return await this.updateById(id, {
      metasDiarias,
      updatedAt: new Date(),
    });
  };

  clientUpdateGoals = async (userId, payload = {}) => {
    const user = await this.getById(userId);
    if (!user) throw new Error("NOT_FOUND");
    if (!this._isClientUser(user)) throw new Error("USER_NOT_CLIENT");

    const incoming = isPlainObject(payload?.metasActuales) || isPlainObject(payload?.goal)
      ? payload
      : { metasActuales: payload };
    const incomingMetas = isPlainObject(incoming?.metasActuales) ? incoming.metasActuales : {};
    const incomingMacros = isPlainObject(incomingMetas?.macros)
      ? incomingMetas.macros
      : isPlainObject(incoming?.macros)
        ? incoming.macros
        : {};
    const now = new Date();

    const nextMetas = {
      ...(user?.metasActuales || {}),
      ...(incomingMetas?.kcal !== undefined ? { kcal: numberOrNull(incomingMetas.kcal, { min: 800, max: 7000 }) } : {}),
      macros: {
        ...(user?.metasActuales?.macros || {}),
        ...(incomingMacros?.p !== undefined ? { p: numberOrNull(incomingMacros.p, { min: 0, max: 500 }) } : {}),
        ...(incomingMacros?.c !== undefined ? { c: numberOrNull(incomingMacros.c, { min: 0, max: 900 }) } : {}),
        ...(incomingMacros?.g !== undefined ? { g: numberOrNull(incomingMacros.g, { min: 0, max: 400 }) } : {}),
      },
      source: "self",
      sourceCoachId: null,
      needsReview: false,
      updatedAt: now,
      updatedByClientId: toMongoIdOrString(user._id || user.id || userId),
    };

    const incomingGoal = isPlainObject(incoming?.goal) ? incoming.goal : {};
    const nextGoal = {
      ...(user?.goal || {}),
      ...(incomingGoal?.type !== undefined ? { type: cleanString(incomingGoal.type, 60) || null } : {}),
      ...(incomingGoal?.targetWeightKg !== undefined
        ? { targetWeightKg: numberOrNull(incomingGoal.targetWeightKg, { min: 30, max: 250 }) }
        : {}),
      ...(incomingGoal?.approach !== undefined ? { approach: cleanString(incomingGoal.approach, 120) || null } : {}),
      updatedAt: now,
      updatedByClientId: toMongoIdOrString(user._id || user.id || userId),
    };

    const hasWeeklyPayload = isPlainObject(incoming?.weeklyPlan);
    const normalizedWeeklyPlan = hasWeeklyPayload ? normalizeWeeklyGoalsPayload(incoming.weeklyPlan) : null;
    const weeklyPlanUsesAdvancedTargets = normalizedWeeklyPlan && weeklyPlanHasValues(normalizedWeeklyPlan);
    if (weeklyPlanUsesAdvancedTargets) {
      requireCapability(user, "nutrition.weeklyPlanning");
    }
    const nextMenu = hasWeeklyPayload
      ? {
          ...(user?.menu || {}),
          weeklyPlan: {
            ...(user?.menu?.weeklyPlan || {}),
            ...normalizedWeeklyPlan,
            source: "self",
            updatedByClientId: toMongoIdOrString(user._id || user.id || userId),
            updatedAt: now,
          },
          updatedAt: now,
        }
      : null;
    const weeklyPlanChanged = hasWeeklyPayload
      ? weeklyGoalsSignature(user?.menu?.weeklyPlan || {}) !== weeklyGoalsSignature(nextMenu?.weeklyPlan || {})
      : false;

    const previousSignature = goalsSignature(user?.goal || {}, user?.metasActuales || {});
    const nextSignature = goalsSignature(nextGoal, nextMetas);
    const nutritionChanged =
      goalsSignature({}, user?.metasActuales || {}) !== goalsSignature({}, nextMetas) || weeklyPlanChanged;
    const trainingChanged = goalsSignature(user?.goal || {}, {}) !== goalsSignature(nextGoal, {});

    if (previousSignature === nextSignature && !weeklyPlanChanged) {
      return user;
    }

    const goalsAccess = nutritionChanged ? getGoalsChangeStatus(user, { actorType: "client", now }) : null;
    if (nutritionChanged) requireGoalsChangeAllowed(user, { actorType: "client", now });
    if (trainingChanged) requireCoachAuthority(user, "training");

    const updated = await this.updateById(userId, {
      ...(trainingChanged ? { goal: nextGoal } : {}),
      ...(nutritionChanged ? { metasActuales: nextMetas } : {}),
      ...(nextMenu ? { menu: nextMenu } : {}),
      ...(nutritionChanged
        ? {
            goalsMetadata: {
              ...(user?.goalsMetadata || {}),
              ...goalsMetadataPatch("client", now, {
                previousMetadata: user?.goalsMetadata || {},
                consumeManualChange: goalsAccess.changesLimit !== null,
                changesLimit: goalsAccess.changesLimit || undefined,
                windowDays: goalsAccess.windowDays || undefined,
              }),
            },
          }
        : {}),
      updatedAt: now,
    });

    await recordAccessAuditEvent({
      subjectType: "client",
      subjectId: user._id || user.id || userId,
      actorType: "client",
      actorId: user._id || user.id || userId,
      event: "goals_changed",
      previousValue: { goal: user?.goal || {}, metasActuales: user?.metasActuales || {} },
      nextValue: { goal: nextGoal, metasActuales: nextMetas },
      reason: "client_update_goals",
      metadata: { source: "client_goals_endpoint" },
    });

    return updated;
  };

  actualizarPerfil = async (id, updates = {}) => {
    const current = await this.getById(id);
    if (!current) throw new Error("NOT_FOUND");

    const patch = { ...updates };

    if (patch.email !== undefined) {
      const email = String(patch.email || "").trim().toLowerCase();
      if (!email) {
        delete patch.email;
      } else {
        const other = await this._findUserByEmail(email);
        const otherId = other ? (other._id?.toString?.() || other.id) : null;
        if (other && String(otherId) !== String(id)) {
          throw new Error("EMAIL_DUPLICADO");
        }
        patch.email = email;
      }
    }

    if (patch.password !== undefined) {
      const pass = String(patch.password || "");
      if (pass.length < 6) throw new Error("PASSWORD_CORTA");
      patch.passwordHash = await bcrypt.hash(pass, 10);
      delete patch.password;
    }

    if (patch._id) delete patch._id;
    if (patch.role) delete patch.role;
    if (patch.plan) delete patch.plan;
    if (patch.estado) delete patch.estado;
    if (patch.tipo) delete patch.tipo;
    if (patch.coachCapabilities) delete patch.coachCapabilities;
    if (patch.adminMeta) delete patch.adminMeta;

    const updated = await this.updateById(id, patch);
    return this._normalizeUser(updated);
  };


  // =========================
  // ADMIN: RELACIÓN COACH <-> CLIENTE
  // =========================
  adminAssignCoach = async ({ clientId, coachId, adminId = null }) => {
    if (!coachId) throw new Error("COACH_ID_REQUIRED");
    if (String(clientId) === String(coachId)) throw new Error("CANNOT_ASSIGN_SELF");

    const client = await this.getById(clientId);
    if (!client) throw new Error("NOT_FOUND");
    if (!this._isClientUser(client)) throw new Error("USER_NOT_CLIENT");

    const coach = await this.getById(coachId);
    if (!coach) throw new Error("COACH_NOT_FOUND");
    if (!this._isCoachUser(coach)) throw new Error("USER_NOT_COACH");
    if (String(coach?.estado || "activo").toLowerCase() !== "activo") {
      throw new Error("COACH_NOT_ACTIVE");
    }

    const currentCoachId = client?.coach?.entrenadorId || null;
    const effectiveCapabilities =
      coach?.effectiveCapabilities || (await this._resolveEffectiveCapabilities(coach));

    if (String(currentCoachId || "") !== String(coachId)) {
      if (!effectiveCapabilities?.features?.clients?.canAssign || effectiveCapabilities?.isTrialExpired) {
        throw new Error("COACH_NOT_AVAILABLE");
      }

      if (!effectiveCapabilities?.canReceiveClients) {
        throw coachClientCapacityError(effectiveCapabilities);
      }
    }

    let clientForAssignment = client;
    if (currentCoachId && String(currentCoachId || "") !== String(coachId)) {
      const disconnected = await this.disconnectClientFromCoach({
        clientId,
        coachId: currentCoachId,
        reason: "coach_changed",
        actor: adminId,
      });
      clientForAssignment = disconnected.user || client;
    }

    const now = new Date();

    return await this.updateById(clientId, {
      coach: {
        ...(clientForAssignment?.coach || {}),
        entrenadorId: toMongoIdOrString(coach._id || coach.id || coachId),
        assignedAt: now,
        assignedByAdminId: adminId,
        source: "admin",
      },
      clientCoachNotice: this._adminCoachAssignedNotice({ coach, adminId, now }),
      coachChangeRequest: null,
      updatedAt: now,
    });
  };

  adminUnassignCoach = async ({ clientId, adminId = null }) => {
    const client = await this.getById(clientId);
    if (!client) throw new Error("NOT_FOUND");
    if (!this._isClientUser(client)) throw new Error("USER_NOT_CLIENT");

    const result = await this.disconnectClientFromCoach({
      clientId,
      coachId: client?.coach?.entrenadorId,
      reason: "admin_unassigned_coach",
      actor: adminId,
    });

    return result.user;
  };

  adminGetCoachClients = async (coachId) => {
    const coach = await this.getById(coachId);
    if (!coach) throw new Error("COACH_NOT_FOUND");
    if (!this._isCoachUser(coach)) throw new Error("USER_NOT_COACH");

    let clients = [];
    let total = 0;

    if (typeof this.model.adminListClientsByCoachId === "function") {
      const data = await this.model.adminListClientsByCoachId(coachId, { limit: 500, skip: 0 });
      clients = Array.isArray(data?.clients) ? data.clients : [];
      total = Number(data?.total ?? clients.length);
    } else {
      clients = await this._listClientsForCoach(coachId);
      total = clients.length;
    }

    const coachWithCapabilities = await this._withEffectiveCapabilities(coach, {
      currentClients: total,
    });

    return {
      coach: coachWithCapabilities,
      clients,
      total,
    };
  };

  getMyCoachClients = async (coachId) => {
    if (!coachId) throw new Error("COACH_NOT_FOUND");

    const coach = await this.getById(coachId);
    if (!coach) throw new Error("COACH_NOT_FOUND");
    if (!this._isCoachUser(coach)) throw new Error("USER_NOT_COACH");

    const resolvedCoachId = coach._id || coach.id || coachId;
    let clients = [];
    let total = 0;

    if (typeof this.model.adminListClientsByCoachId === "function") {
      const data = await this.model.adminListClientsByCoachId(resolvedCoachId, { limit: 500, skip: 0 });
      clients = Array.isArray(data?.clients) ? data.clients : [];
      total = Number(data?.total ?? clients.length);
    } else {
      clients = await this._listClientsForCoach(resolvedCoachId);
      total = clients.length;
    }

    const coachWithCapabilities = await this._withEffectiveCapabilities(coach, {
      currentClients: total,
    });

    return {
      coach: coachWithCapabilities,
      clients,
      total,
    };
  };

  _assertCoachFeature(coach, section, mode = "manual") {
    if (section === "menus") {
      requireProfessionalScope(coach, "nutrition");
    }

    if (section === "routines") {
      requireProfessionalScope(coach, "training");
    }

    requireCoachSubscriptionActive(coach, { action: section });

    const effective = coach?.effectiveCapabilities || {};
    const featureKey = featureKeyForMode(mode);
    const sectionFeatures = effective?.features?.[section] || {};

    const allowedByEquivalentMenuFeature = section === "menus" && featureKey === "manualBuilder" && sectionFeatures?.ownTemplates;

    if (effective?.isTrialExpired || (!sectionFeatures?.[featureKey] && !allowedByEquivalentMenuFeature)) {
      throw new Error("COACH_FEATURE_NOT_ALLOWED");
    }
  }

  _assertNutritionEditAllowed(coach) {
    requireProfessionalScope(coach, "nutrition");
    requireCoachSubscriptionActive(coach, { action: "nutrition" });

    const features = coach?.effectiveCapabilities?.features?.menus || {};
    if (
      coach?.effectiveCapabilities?.isTrialExpired ||
      !(
        features.manualBuilder ||
        features.semiAutomaticBuilder ||
        features.automaticGenerator
      )
    ) {
      throw new Error("COACH_FEATURE_NOT_ALLOWED");
    }
  }

  async _validatedCoachAssignedMenusByDay(coach, value = {}) {
    const normalized = normalizeAssignedMenusByDay(value);
    const coachId = idToString(coach?._id || coach?.id);
    const capabilities = resolveProfessionalLibraryCapabilities(coach);
    const baseCache = new Map();

    const validateEntry = async (entry, fallbackSource = "base") => {
      if (!entry) return null;
      const baseId = idToString(
        entry.menuId ||
        entry.menuBaseId ||
        entry.menuSnapshot?.baseId ||
        entry.menuSnapshot?.id
      );
      if (!baseId) throw new Error("MENU_BASE_REQUERIDO");

      let base = baseCache.get(baseId);
      if (base === undefined) {
        base = await this.menusModel.getBaseById(baseId);
        baseCache.set(baseId, base || null);
      }
      if (!base) throw new Error("MENU_NO_ENCONTRADO");

      const sourceType = professionalTemplateSource(base);
      if (sourceType === "coach_owned") {
        if (idToString(base.ownerId) !== coachId) throw new Error("FORBIDDEN");
      } else if (["admin_global", "admin_premium"].includes(sourceType)) {
        if (
          capabilities.canAssignGlobalTemplates !== true ||
          !canUseProfessionalTemplate(coach, base, "menu")
        ) {
          throw new Error("FORBIDDEN");
        }
      } else {
        throw new Error("FORBIDDEN");
      }

      const menuSnapshot = normalizeWeeklyMenuSnapshot(base);
      return {
        menuId: baseId,
        menuSnapshot,
        source: sourceType || fallbackSource,
        ...normalizeAssignedMenuPlanningMeta(entry),
        assignedAt: entry.assignedAt ? new Date(entry.assignedAt) : new Date(),
      };
    };

    const validated = {};
    for (const day of WEEKLY_MENU_DAYS) {
      const dayEntry = normalized[day];
      if (!dayEntry) continue;
      const primaryMenu = await validateEntry(dayEntry.primaryMenu || dayEntry, "base");
      const alternatives = [];
      for (const alternative of dayEntry.alternatives || []) {
        const checked = await validateEntry(alternative, "alternative");
        if (!checked || sameAssignedMenu(checked, primaryMenu)) continue;
        alternatives.push({
          ...checked,
          reason: cleanString(alternative.reason, 240),
          compatibility: isPlainObject(alternative.compatibility)
            ? { ...alternative.compatibility }
            : null,
        });
      }
      validated[day] = {
        ...primaryMenu,
        primaryMenu,
        alternatives: alternatives.slice(0, 10),
      };
    }

    return validated;
  }

  _getCoachClientPair = async ({ coachId, clientId }) => {
    if (!coachId) throw new Error("COACH_NOT_FOUND");
    if (!clientId) throw new Error("NOT_FOUND");

    const coach = await this.getById(coachId);
    if (!coach) throw new Error("COACH_NOT_FOUND");
    if (!this._isCoachUser(coach)) throw new Error("USER_NOT_COACH");

    const client = await this.getById(clientId);
    if (!client) throw new Error("NOT_FOUND");
    if (!this._isClientUser(client)) throw new Error("USER_NOT_CLIENT");

    const assignedCoachId = client?.coach?.entrenadorId;
    if (idToString(assignedCoachId) !== idToString(coach._id || coach.id || coachId)) {
      throw new Error("CLIENT_NOT_ASSIGNED_TO_COACH");
    }

    return { coach, client };
  };

  getMyCoachClientDetail = async ({ coachId, clientId }) => {
    return await this._getCoachClientPair({ coachId, clientId });
  };

  coachEndClientService = async ({ coachId, clientId, reason = "", reasonNote = "" } = {}) => {
    if (!coachId) throw new Error("COACH_NOT_FOUND");
    if (!clientId) throw new Error("NOT_FOUND");

    const coach = await this.getById(coachId);
    if (!coach) throw new Error("COACH_NOT_FOUND");
    if (!this._isCoachUser(coach)) throw new Error("USER_NOT_COACH");

    const client = await this.getById(clientId);
    if (!client) throw new Error("NOT_FOUND");
    if (!this._isClientUser(client)) throw new Error("USER_NOT_CLIENT");

    const resolvedCoachId = coach._id || coach.id || coachId;
    const assignedCoachId = client?.coach?.entrenadorId;
    if (!assignedCoachId || idToString(assignedCoachId) !== idToString(resolvedCoachId)) {
      throw new Error("COACH_CLIENT_RELATION_NOT_ACTIVE");
    }

    const finishReason = cleanString(reason || "coach_service_ended", 80) || "coach_service_ended";
    const finishReasonNote = cleanString(reasonNote || "", 500);
    const result = await this.disconnectClientFromCoach({
      clientId,
      coachId: resolvedCoachId,
      reason: "coach_service_ended",
      actor: resolvedCoachId,
      actorType: "coach",
      auditEvent: "coach_client_service_ended",
      auditMetadata: {
        finishReason,
        reasonNote: finishReasonNote || null,
        previousServicePackage: client?.coachAccess?.servicePackage || client?.coach?.servicePackage || null,
        previousScopes: client?.coachAccess?.scopes || client?.clientPermissions || null,
      },
    });

    return {
      coach,
      client: result.user,
      status: result.status,
      releasedCapacity: result.releasedCapacity,
      revokedMenus: result.revokedMenus,
      revokedLibraryMenus: result.revokedLibraryMenus,
      revokedLibraryMeals: result.revokedLibraryMeals,
      revokedRoutines: result.revokedRoutines,
    };
  };

  coachUpdateClientNutrition = async ({ coachId, clientId, payload = {} }) => {
    const { coach, client } = await this._getCoachClientPair({ coachId, clientId });
    this._assertNutritionEditAllowed(coach);

    const incoming = isPlainObject(payload?.nutrition) ? payload.nutrition : payload;
    const now = new Date();

    const currentMetas = client?.metasActuales || {};
    const currentMacros = currentMetas?.macros || {};
    const incomingMacros = isPlainObject(incoming?.macros) ? incoming.macros : {};
    const selfGoalsBackup = buildSelfGoalsBackup(currentMetas);

    const nextMetas = {
      ...currentMetas,
      ...(incoming?.kcal !== undefined
        ? { kcal: numberOrNull(incoming.kcal, { min: 800, max: 7000 }) }
        : {}),
      macros: {
        ...currentMacros,
        ...(incomingMacros?.p !== undefined ? { p: numberOrNull(incomingMacros.p, { min: 0, max: 500 }) } : {}),
        ...(incomingMacros?.c !== undefined ? { c: numberOrNull(incomingMacros.c, { min: 0, max: 900 }) } : {}),
        ...(incomingMacros?.g !== undefined ? { g: numberOrNull(incomingMacros.g, { min: 0, max: 400 }) } : {}),
      },
      updatedAt: now,
      updatedByCoachId: toMongoIdOrString(coach._id || coach.id || coachId),
      source: "coach",
      sourceCoachId: toMongoIdOrString(coach._id || coach.id || coachId),
      needsReview: false,
    };

    const currentGoal = client?.goal || {};
    const nextGoal = {
      ...currentGoal,
      ...(incoming?.goalType !== undefined ? { type: cleanString(incoming.goalType, 60) || null } : {}),
      ...(incoming?.targetWeightKg !== undefined
        ? { targetWeightKg: numberOrNull(incoming.targetWeightKg, { min: 30, max: 250 }) }
        : {}),
      ...(incoming?.approach !== undefined ? { approach: cleanString(incoming.approach, 120) || null } : {}),
      updatedAt: now,
      updatedByCoachId: toMongoIdOrString(coach._id || coach.id || coachId),
    };

    const patch = {
      metasActuales: nextMetas,
      goal: nextGoal,
      goalsMetadata: {
        ...(client?.goalsMetadata || {}),
        ...goalsMetadataPatch("coach", now),
      },
      updatedAt: now,
    };

    if (selfGoalsBackup) {
      patch.nutrition = {
        ...(client?.nutrition || {}),
        selfGoalsBackup,
      };
    }

    const weeklyPlan = isPlainObject(incoming?.weeklyPlan) ? incoming.weeklyPlan : {};
    const weeklyPlanPatch = {};
    if (isPlainObject(weeklyPlan?.caloriesByDay)) weeklyPlanPatch.caloriesByDay = weeklyPlan.caloriesByDay;
    if (isPlainObject(weeklyPlan?.macrosByDay)) weeklyPlanPatch.macrosByDay = weeklyPlan.macrosByDay;
    if (Object.keys(weeklyPlanPatch).length) {
      const currentMenu = client?.menu || {};
      const coachObjectId = toMongoIdOrString(coach._id || coach.id || coachId);
      patch.menu = {
        ...currentMenu,
        weeklyPlan: {
          ...(currentMenu?.weeklyPlan || {}),
          ...weeklyPlanPatch,
          generatedBy: "coach",
          sourceCoachId: coachObjectId,
          updatedByCoachId: coachObjectId,
          updatedAt: now,
        },
        updatedAt: now,
        updatedByCoachId: coachObjectId,
      };
    }

    const currentWeeklyPlan = client?.menu?.weeklyPlan || {};
    const candidateWeeklyPlan = patch?.menu?.weeklyPlan || currentWeeklyPlan;
    const nutritionTargetsChanged =
      goalsSignature({}, currentMetas) !== goalsSignature({}, nextMetas) ||
      weeklyGoalsSignature(currentWeeklyPlan) !== weeklyGoalsSignature(candidateWeeklyPlan);
    if (nutritionTargetsChanged || !currentWeeklyPlan?.targetsUpdatedAt) {
      const currentMenu = patch.menu || client?.menu || {};
      const coachObjectId = toMongoIdOrString(coach._id || coach.id || coachId);
      patch.menu = {
        ...currentMenu,
        weeklyPlan: {
          ...(currentMenu?.weeklyPlan || {}),
          targetsUpdatedAt:
            nutritionTargetsChanged
              ? now
              : currentMetas?.updatedAt || now,
        },
        updatedAt: now,
        updatedByCoachId: coachObjectId,
      };
    }

    const nextClientForImpact = {
      ...client,
      metasActuales: nextMetas,
      goal: nextGoal,
      menu: patch.menu || client?.menu || {},
    };
    const assignmentImpact = buildNutritionAssignmentImpact(client, nextClientForImpact);
    let assignmentInvalidation = null;

    if (assignmentImpact.affectedDayKeys.length) {
      const invalidationRequest = isPlainObject(incoming?.assignmentInvalidation)
        ? incoming.assignmentInvalidation
        : {};
      const actualDays = [...assignmentImpact.affectedDayKeys].sort();
      const expectedDays = normalizedExpectedInvalidationDays(invalidationRequest?.affectedDays);
      const confirmed = invalidationRequest?.confirmed === true && sameStringArray(actualDays, expectedDays);

      if (!confirmed) {
        const error = new Error("NUTRITION_ASSIGNMENTS_CONFIRMATION_REQUIRED");
        error.impact = assignmentImpact;
        throw error;
      }

      const currentMenu = patch.menu || client?.menu || {};
      const currentWeeklyPlan = currentMenu?.weeklyPlan || {};
      const movedAssignments = moveInvalidatedAssignments(
        client?.menu?.weeklyPlan?.assignedMenusByDay || {},
        actualDays
      );
      const coachObjectId = toMongoIdOrString(coach._id || coach.id || coachId);
      const previousTargetsByDay = {};
      const nextTargetsByDay = {};
      assignmentImpact.affectedDays.forEach((day) => {
        previousTargetsByDay[day.key] = day.previousTarget;
        nextTargetsByDay[day.key] = day.nextTarget;
      });

      patch.menu = {
        ...currentMenu,
        weeklyPlan: {
          ...currentWeeklyPlan,
          assignedMenusByDay: movedAssignments.remaining,
          lastInvalidatedAssignments: {
            reason: "nutrition_targets_changed",
            invalidatedAt: now,
            invalidatedByCoachId: coachObjectId,
            affectedDays: actualDays,
            assignmentsByDay: movedAssignments.invalidated,
            previousTargetsByDay,
            nextTargetsByDay,
          },
          updatedAt: now,
        },
        activeSource: hasAssignedMenuEntries(movedAssignments.remaining) ? "coach" : "none",
        updatedAt: now,
        updatedByCoachId: coachObjectId,
      };
      assignmentInvalidation = {
        ...assignmentImpact,
        confirmed: true,
        preservedSnapshots: true,
      };
    }

    const updated = await this.updateById(clientId, patch);

    await recordAccessAuditEvent({
      subjectType: "client",
      subjectId: clientId,
      actorType: "coach",
      actorId: coach._id || coach.id || coachId,
      event: "goals_changed",
      previousValue: { goal: client?.goal || {}, metasActuales: client?.metasActuales || {} },
      nextValue: { goal: nextGoal, metasActuales: nextMetas },
      reason: "coach_update_client_nutrition",
      metadata: {
        servicePackage: client?.coachAccess?.servicePackage || client?.coach?.servicePackage || null,
        assignmentInvalidation: assignmentInvalidation
          ? {
              affectedDays: assignmentInvalidation.affectedDayKeys,
              assignedMenus: assignmentInvalidation.assignedMenus,
              preservedSnapshots: true,
            }
          : null,
      },
    });

    return { coach, client: updated, assignmentInvalidation };
  };

  coachUpdateClientMenu = async ({ coachId, clientId, payload = {} }) => {
    const { coach, client } = await this._getCoachClientPair({ coachId, clientId });
    const incoming = isPlainObject(payload?.menu) ? payload.menu : payload;
    const modeType = normalizeBuilderMode(incoming?.mode?.type || incoming?.modeType || incoming?.type);
    this._assertCoachFeature(coach, "menus", modeType);

    const now = new Date();
    const current = client?.menu || {};
    const coachObjectId = toMongoIdOrString(coach._id || coach.id || coachId);
    const mealConfig = isPlainObject(incoming?.mealConfig) ? incoming.mealConfig : {};
    const restrictions = isPlainObject(incoming?.restrictions) ? incoming.restrictions : {};
    const weeklyPlan = isPlainObject(incoming?.weeklyPlan) ? incoming.weeklyPlan : {};
    const assignedMenusByDay = isPlainObject(weeklyPlan?.assignedMenusByDay)
      ? await this._validatedCoachAssignedMenusByDay(coach, weeklyPlan.assignedMenusByDay)
      : null;

    const nextMenu = {
      ...current,
      mode: {
        ...(current?.mode || {}),
        ...(isPlainObject(incoming?.mode) ? incoming.mode : {}),
        type: modeType,
        lockedByCoach:
          incoming?.mode?.lockedByCoach !== undefined
            ? !!incoming.mode.lockedByCoach
            : !!current?.mode?.lockedByCoach,
        source: "coach",
        updatedByCoachId: toMongoIdOrString(coach._id || coach.id || coachId),
      },
      mealConfig: {
        ...(current?.mealConfig || {}),
        ...(mealConfig?.mealsPerDay !== undefined
          ? { mealsPerDay: numberOrNull(mealConfig.mealsPerDay, { min: 1, max: 8 }) }
          : {}),
        ...(mealConfig?.distribution !== undefined ? { distribution: cleanString(mealConfig.distribution, 80) } : {}),
        ...(mealConfig?.weekendBoost !== undefined ? { weekendBoost: !!mealConfig.weekendBoost } : {}),
        ...(mealConfig?.weekendBoostPct !== undefined
          ? { weekendBoostPct: numberOrNull(mealConfig.weekendBoostPct, { min: 0, max: 50 }) }
          : {}),
        ...(mealConfig?.snackLibre !== undefined ? { snackLibre: !!mealConfig.snackLibre } : {}),
        ...(mealConfig?.snackLibreKcal !== undefined
          ? { snackLibreKcal: numberOrNull(mealConfig.snackLibreKcal, { min: 0, max: 1200 }) }
          : {}),
      },
      restrictions: {
        ...(current?.restrictions || {}),
        ...(restrictions?.allergies !== undefined ? { allergies: cleanStringArray(restrictions.allergies) } : {}),
        ...(restrictions?.intolerances !== undefined ? { intolerances: cleanStringArray(restrictions.intolerances) } : {}),
        ...(restrictions?.excludedFoods !== undefined ? { excludedFoods: cleanStringArray(restrictions.excludedFoods) } : {}),
        ...(restrictions?.preferredFoods !== undefined ? { preferredFoods: cleanStringArray(restrictions.preferredFoods) } : {}),
        ...(restrictions?.favoriteFoods !== undefined ? { favoriteFoods: cleanStringArray(restrictions.favoriteFoods) } : {}),
        ...(restrictions?.favoriteMeals !== undefined ? { favoriteMeals: cleanStringArray(restrictions.favoriteMeals) } : {}),
      },
      weeklyPlan: {
        ...(current?.weeklyPlan || {}),
        ...(isPlainObject(weeklyPlan?.caloriesByDay) ? { caloriesByDay: weeklyPlan.caloriesByDay } : {}),
        ...(isPlainObject(weeklyPlan?.macrosByDay) ? { macrosByDay: weeklyPlan.macrosByDay } : {}),
        ...(isPlainObject(weeklyPlan?.mealsByDay) ? { mealsByDay: weeklyPlan.mealsByDay } : {}),
        ...(assignedMenusByDay
          ? { assignedMenusByDay }
          : {}),
        generatedBy: "coach",
        generatorMode: modeType,
        sourceCoachId: coachObjectId,
        updatedByCoachId: coachObjectId,
        updatedAt: now,
      },
      coachNotes: cleanString(incoming?.coachNotes, 3000),
      ...(isPlainObject(weeklyPlan?.assignedMenusByDay)
        ? {
            activeSource: "coach",
            activeOwnMenuId: null,
          }
        : {}),
      updatedAt: now,
      updatedByCoachId: coachObjectId,
    };

    const updated = await this.updateById(clientId, {
      menu: nextMenu,
      updatedAt: now,
    });

    return { coach, client: updated };
  };

  coachUpdateClientRoutine = async ({ coachId, clientId, payload = {} }) => {
    const { coach, client } = await this._getCoachClientPair({ coachId, clientId });
    const incoming = isPlainObject(payload?.routine) ? payload.routine : payload;
    const modeType = normalizeBuilderMode(incoming?.mode?.type || incoming?.modeType || incoming?.type);
    this._assertCoachFeature(coach, "routines", modeType);

    const now = new Date();
    const current = client?.routine || {};
    const structure = isPlainObject(incoming?.structure) ? incoming.structure : {};
    const currentPlan = isPlainObject(incoming?.currentPlan) ? incoming.currentPlan : {};
    const progression = isPlainObject(incoming?.progression) ? incoming.progression : {};

    const nextRoutine = {
      ...current,
      mode: {
        ...(current?.mode || {}),
        ...(isPlainObject(incoming?.mode) ? incoming.mode : {}),
        type: modeType,
        editableByCoach: true,
        source: "coach",
        updatedByCoachId: toMongoIdOrString(coach._id || coach.id || coachId),
      },
      structure: {
        ...(current?.structure || {}),
        ...(structure?.split !== undefined ? { split: cleanString(structure.split, 120) || null } : {}),
        ...(structure?.trainingDaysPerWeek !== undefined
          ? { trainingDaysPerWeek: numberOrNull(structure.trainingDaysPerWeek, { min: 1, max: 7 }) }
          : {}),
        ...(structure?.preferredDays !== undefined ? { preferredDays: cleanStringArray(structure.preferredDays, 7, 40) } : {}),
        ...(structure?.sessionDurationMin !== undefined
          ? { sessionDurationMin: numberOrNull(structure.sessionDurationMin, { min: 10, max: 240 }) }
          : {}),
        ...(structure?.focus !== undefined ? { focus: cleanStringArray(structure.focus, 12, 80) } : {}),
      },
      currentPlan: {
        ...(current?.currentPlan || {}),
        ...(currentPlan?.name !== undefined ? { name: cleanString(currentPlan.name, 160) || null } : {}),
        ...(currentPlan?.description !== undefined ? { description: cleanString(currentPlan.description, 2000) || null } : {}),
        ...(currentPlan?.startDate !== undefined ? { startDate: cleanString(currentPlan.startDate, 40) || null } : {}),
        ...(currentPlan?.endDate !== undefined ? { endDate: cleanString(currentPlan.endDate, 40) || null } : {}),
        ...(currentPlan?.isActive !== undefined ? { isActive: !!currentPlan.isActive } : {}),
        ...(Array.isArray(currentPlan?.days) ? { days: currentPlan.days.slice(0, 14) } : {}),
        generatedBy: "coach",
        generatorMode: modeType,
        updatedAt: now,
      },
      progression: {
        ...(current?.progression || {}),
        ...(progression?.mode !== undefined ? { mode: cleanString(progression.mode, 80) || "manual" } : {}),
        ...(progression?.deloadEnabled !== undefined ? { deloadEnabled: !!progression.deloadEnabled } : {}),
        ...(progression?.progressionRule !== undefined
          ? { progressionRule: cleanString(progression.progressionRule, 1000) || null }
          : {}),
      },
      coachNotes: cleanString(incoming?.coachNotes, 3000),
      updatedAt: now,
      updatedByCoachId: toMongoIdOrString(coach._id || coach.id || coachId),
    };

    const updated = await this.updateById(clientId, {
      routine: nextRoutine,
      updatedAt: now,
    });

    return { coach, client: updated };
  };

  coachUpdateClientProgress = async ({ coachId, clientId, payload = {} }) => {
    const { coach, client } = await this._getCoachClientPair({ coachId, clientId });
    const scopes = coach?.professionalScopes || coach?.coachProfile?.specialties || {};
    if (!scopes.training && !scopes.nutrition) {
      requireProfessionalScope(coach, "training");
    }
    requireCoachSubscriptionActive(coach, { action: "progress" });
    const now = new Date();
    const incoming = isPlainObject(payload?.progress) ? payload.progress : payload;
    const currentProgress = isPlainObject(client?.progress) ? client.progress : {};
    const currentCheckins = Array.isArray(currentProgress?.checkins) ? currentProgress.checkins : [];

    let nextCheckins = currentCheckins.map((checkin) => normalizeProgressCheckin(checkin));

    if (isPlainObject(incoming?.checkin)) {
      const normalized = normalizeProgressCheckin(incoming.checkin);
      const existingIndex = nextCheckins.findIndex((item) => item.id === normalized.id);
      if (existingIndex >= 0) {
        nextCheckins[existingIndex] = {
          ...nextCheckins[existingIndex],
          ...normalized,
          createdAt: nextCheckins[existingIndex].createdAt,
          updatedAt: now,
        };
      } else {
        nextCheckins.push(normalized);
      }
    }

    if (incoming?.deleteCheckinId !== undefined) {
      const deleteId = cleanString(incoming.deleteCheckinId, 80);
      nextCheckins = nextCheckins.filter((item) => item.id !== deleteId);
    }

    nextCheckins = sortProgressCheckins(nextCheckins).slice(-260);
    const statsSummary = summarizeProgress(nextCheckins);
    const latestWeight = statsSummary.pesoActualKg;

    const patch = {
      progress: {
        ...currentProgress,
        checkins: nextCheckins,
        updatedAt: now,
        updatedByCoachId: toMongoIdOrString(coach._id || coach.id || coachId),
      },
      stats: {
        ...(client?.stats || {}),
        ...statsSummary,
      },
      updatedAt: now,
    };

    if (latestWeight !== null && latestWeight !== undefined) {
      patch.antropometriaActual = {
        ...(client?.antropometriaActual || {}),
        pesoKg: latestWeight,
        updatedAt: now,
      };
    }

    const updated = await this.updateById(clientId, patch);
    return { coach, client: updated };
  };

  getMyMenuTrackingWeek = async (actor, query = {}) => {
    const userId = actor?.id || actor?._id;
    if (!userId) throw new Error("NO_AUTENTICADO");

    const user = await this.getById(userId);
    if (!user) throw new Error("NOT_FOUND");
    if (!this._isClientUser(user)) throw new Error("USER_NOT_CLIENT");

    const start = mondayOfWeek(query.start || query.date || new Date().toISOString().slice(0, 10));
    const end = addDaysIso(start, 6);
    requireTrackingHistoryRange(user, { start, end });
    const [docs, foodLogs] = await Promise.all([
      this.menuTrackingModel.listByUserDateRange(userId, start, end),
      this.foodLogsModel.listLogsByUserDateRange(userId, start, end),
    ]);
    const trackingByDate = new Map((docs || []).map((doc) => [String(doc.date), doc]));
    const manualTotalsByDate = trackingTotalsByDate(foodLogs);
    const nutritionWeek = resolveClientNutritionWeek(user);
    const activePlan = await this._resolveClientMenuPlan(user);
    const assignments = normalizeAssignedMenusByDay(activePlan.assignments || {});

    const days = WEEKLY_MENU_DAY_META.map((day, index) => {
      const date = addDaysIso(start, index);
      const assignment = assignments[day.key] || null;
      const primary = assignedMenuPublic(assignment?.primaryMenu || assignment || null);
      const alternatives = Array.isArray(assignment?.alternatives)
        ? assignment.alternatives.map(assignedMenuPublic).filter(Boolean).slice(0, 10)
        : [];
      const menuTotals = primary?.menuSnapshot?.totals || { kcal: 0, proteina: 0, carbs: 0, grasas: 0 };
      const target = nutritionWeek.targets[day.key] || null;
      const kcalTarget = hasNumber(target?.kcal) ? Number(target.kcal) : 0;
      const proteinTarget = hasNumber(target?.p) ? Number(target.p) : 0;
      const kcalDiff = roundTrackingNumber((menuTotals.kcal || 0) - kcalTarget);
      const proteinDiff = roundTrackingNumber((menuTotals.proteina || 0) - proteinTarget);

      return {
        date,
        dayKey: day.key,
        dayLabel: day.label,
        target,
        assignment: {
          primaryMenu: primary,
          alternatives,
        },
        menuTotals,
        compatibility: {
          kcalDiff,
          proteinDiff,
          kcalPercent: kcalTarget > 0 ? Math.round(((menuTotals.kcal || 0) / kcalTarget) * 100) : 0,
        },
        tracking: trackingPublic(trackingByDate.get(date), manualTotalsByDate.get(date) || emptyTrackingTotals()),
      };
    });

    const registered = days.filter((day) => day.tracking?.status && day.tracking.status !== "pending");
    const adherenceValues = registered
      .map((day) => Number(day.tracking?.adherencePercent))
      .filter(Number.isFinite);
    const countStatus = (status) => days.filter((day) => day.tracking?.status === status).length;

    return {
      start,
      end,
      coach: user?.coach?.entrenadorId
        ? {
            id: idToString(user.coach.entrenadorId),
            source: user.coach.source || null,
          }
        : null,
      activePlan: {
        source: activePlan.activeSource,
        menuId: activePlan.activeMenu ? idToString(activePlan.activeMenu._id || activePlan.activeMenu.id) : null,
        name: activePlan.activeMenu?.nombre || activePlan.activeMenu?.name || null,
      },
      nutrition: nutritionWeek,
      permissions: clientMenuTrackingPermissions(user),
      days,
      summary: {
        registeredDays: registered.length,
        completedDays: countStatus("completed"),
        inProgressDays: countStatus("in_progress"),
        partialDays: countStatus("partial"),
        missedDays: countStatus("missed"),
        exceededDays: countStatus("exceeded"),
        averageAdherence: adherenceValues.length
          ? Math.round(adherenceValues.reduce((sum, value) => sum + value, 0) / adherenceValues.length)
          : null,
      },
    };
  };

  listMyMenuTracking = async (actor, query = {}) => {
    const userId = actor?.id || actor?._id;
    if (!userId) throw new Error("NO_AUTENTICADO");
    const user = await this.getById(userId);
    if (!user) throw new Error("NOT_FOUND");
    if (!this._isClientUser(user)) throw new Error("USER_NOT_CLIENT");
    const from = normalizeMenuTrackingDate(query.from || addDaysIso(new Date().toISOString().slice(0, 10), -30));
    const to = normalizeMenuTrackingDate(query.to || new Date().toISOString().slice(0, 10));
    requireTrackingHistoryRange(user, { from, to });
    const [docs, foodLogs] = await Promise.all([
      this.menuTrackingModel.listByUserDateRange(userId, from, to),
      this.foodLogsModel.listLogsByUserDateRange(userId, from, to),
    ]);
    const manualTotalsByDate = trackingTotalsByDate(foodLogs);
    return {
      from,
      to,
      records: (docs || []).map((doc) => ({
        id: idToString(doc._id || doc.id),
        date: doc.date,
        dayKey: doc.dayKey,
        target: doc.target || null,
        menuTotals: doc.menuTotals || null,
        menuSnapshotSummary: doc.menuSnapshotSummary || null,
        tracking: trackingPublic(doc, manualTotalsByDate.get(String(doc.date)) || emptyTrackingTotals()),
      })),
    };
  };

  getCoachClientMenuTracking = async ({ coachId, clientId, query = {} } = {}) => {
    const { client } = await this._getCoachClientPair({ coachId, clientId });
    const from = normalizeMenuTrackingDate(query.from || addDaysIso(new Date().toISOString().slice(0, 10), -30));
    const to = normalizeMenuTrackingDate(query.to || new Date().toISOString().slice(0, 10));
    const [docs, foodLogs] = await Promise.all([
      this.menuTrackingModel.listByUserDateRange(clientId, from, to),
      this.foodLogsModel.listLogsByUserDateRange(clientId, from, to),
    ]);
    const manualTotalsByDate = trackingTotalsByDate(foodLogs);

    return {
      client: {
        id: idToString(client?._id || client?.id),
        nombre: client?.nombre || client?.name || "",
      },
      from,
      to,
      records: (docs || []).map((doc) => ({
        id: idToString(doc._id || doc.id),
        date: doc.date,
        dayKey: doc.dayKey,
        target: doc.target || null,
        menuTotals: doc.menuTotals || null,
        menuSnapshotSummary: doc.menuSnapshotSummary || null,
        tracking: trackingPublic(doc, manualTotalsByDate.get(String(doc.date)) || emptyTrackingTotals()),
      })),
    };
  };

  upsertMyMenuTrackingDay = async (actor, payload = {}) => {
    const userId = actor?.id || actor?._id;
    if (!userId) throw new Error("NO_AUTENTICADO");

    const user = await this.getById(userId);
    if (!user) throw new Error("NOT_FOUND");
    if (!this._isClientUser(user)) throw new Error("USER_NOT_CLIENT");

    const date = normalizeMenuTrackingDate(payload.date);
    requireTrackingHistoryRange(user, { date });
    const dayKey = getWeekDayMeta(payload.dayKey)?.key || dayKeyFromDate(date);
    const requestedStatus = MENU_TRACKING_STATUS.has(String(payload.status || "")) ? String(payload.status) : "pending";

    const nutritionWeek = resolveClientNutritionWeek(user);
    const target = nutritionWeek.targets[dayKey] || null;
    const activePlan = await this._resolveClientMenuPlan(user);
    const assignments = normalizeAssignedMenusByDay(activePlan.assignments || {});
    const assignment = assignments[dayKey] || null;
    const primary = assignment?.primaryMenu || assignment || null;
    const alternatives = Array.isArray(assignment?.alternatives) ? assignment.alternatives : [];
    const selectedIndex = hasNumber(payload?.selectedAlternative?.index) ? Number(payload.selectedAlternative.index) : null;
    const selectedAlternative = selectedIndex !== null && alternatives[selectedIndex]
      ? alternatives[selectedIndex]
      : null;
    const selectedMenu = selectedAlternative || primary;
    const selectedSnapshot = selectedMenu?.menuSnapshot || {};
    const totals = menuSnapshotTotals(selectedSnapshot);
    const totalMealsCount = Number(selectedSnapshot?.mealsCount || selectedSnapshot?.meals?.length || 0) || 0;

    const completedMenuMeals = requestedStatus === "missed"
      ? []
      : buildCompletedMenuMealsFromPayload(payload, selectedSnapshot, requestedStatus);
    const completedMealsCount = completedMenuMeals.length;
    const manualEntries = sanitizeTrackingEntries(payload.manualEntries, "manual_food");
    const generatedRemainingMeals = sanitizeTrackingEntries(payload.generatedRemainingMeals, "generated_remaining_meal");
    const mealReplacements = sanitizeTrackingEntries(payload.mealReplacements, "client_meal_replacement");
    const foodReplacements = sanitizeTrackingEntries(payload.foodReplacements, "client_food_replacement");
    const targetTotals = targetToTrackingTotals(target || {});
    const consumedTotals = addTrackingTotals(
      sumTrackingEntryTotals(completedMenuMeals),
      addTrackingTotals(
        addTrackingTotals(sumTrackingEntryTotals(manualEntries), sumTrackingEntryTotals(generatedRemainingMeals)),
        addTrackingTotals(sumTrackingEntryTotals(mealReplacements), sumTrackingEntryTotals(foodReplacements))
      )
    );
    const remainingTotals = subtractTrackingTotals(targetTotals, consumedTotals);
    const percentFromStatus =
      requestedStatus === "completed" ? 100 :
      requestedStatus === "missed" ? 0 :
      requestedStatus === "pending" ? null :
      null;
    const incomingPercent = hasNumber(payload.adherencePercent)
      ? Math.max(0, Math.min(100, Number(payload.adherencePercent)))
      : percentFromStatus;
    const adherencePercent = incomingPercent === null
      ? calculateDietAdherence(consumedTotals, targetTotals)
      : roundTrackingNumber(incomingPercent);
    const status = ["completed", "missed", "partial", "exceeded"].includes(requestedStatus) && payload.status
      ? requestedStatus
      : deriveDailyTrackingStatus(consumedTotals, targetTotals, requestedStatus);

    const doc = await this.menuTrackingModel.upsertDay({
      clientId: userId,
      coachId: user?.coach?.entrenadorId || null,
      date,
      dayKey,
      weekStart: mondayOfWeek(date),
      weekEnd: addDaysIso(mondayOfWeek(date), 6),
      menuId: selectedMenu?.menuId || selectedSnapshot?.baseId || selectedSnapshot?.id || null,
      menuSnapshotId: selectedSnapshot?.baseId || selectedSnapshot?.id || null,
      menuSnapshotSummary: selectedMenu
        ? {
            name: selectedSnapshot?.name || "Menu asignado",
            mealsCount: totalMealsCount,
            source: selectedMenu.source || (selectedAlternative ? "alternative" : "base"),
          }
        : null,
      target: target
        ? {
            kcal: target.kcal ?? null,
            proteina: target.p ?? null,
            carbs: target.c ?? null,
            grasas: target.g ?? null,
            source: target.statusLabel || null,
          }
        : null,
      menuTotals: totals,
      completedMenuMeals,
      manualEntries,
      generatedRemainingMeals,
      mealReplacements,
      foodReplacements,
      consumedTotals,
      remainingTotals,
      nutrition: {
        status,
        adherencePercent,
        completedMealsCount,
        totalMealsCount,
        reason: cleanString(payload.reason || "", 120),
        note: cleanString(payload.note || "", 1000),
        selectedAlternative: selectedAlternative
          ? {
              index: selectedIndex,
              menuId: idToString(selectedAlternative.menuId),
              name: selectedSnapshot?.name || "Alternativa",
              totals,
            }
        : null,
      },
    });

    const recentDocs = await this.menuTrackingModel.listByUserDateRange(userId, addDaysIso(date, -6), date);
    const recentValues = (recentDocs || [])
      .map((item) => Number(item?.nutrition?.adherencePercent))
      .filter(Number.isFinite);
    const recentAverage = recentValues.length
      ? Math.round(recentValues.reduce((sum, value) => sum + value, 0) / recentValues.length)
      : null;
    await this._updateById(userId, {
      stats: {
        ...(user?.stats || {}),
        adherencia7dPct: recentAverage,
        comidasRegistradas7d: recentValues.length,
      },
      updatedAt: new Date(),
    });

    return {
      ok: true,
      record: {
        id: idToString(doc?._id || doc?.id),
        date: doc?.date,
        dayKey: doc?.dayKey,
        target: doc?.target || null,
        menuTotals: doc?.menuTotals || null,
        menuSnapshotSummary: doc?.menuSnapshotSummary || null,
        tracking: trackingPublic(doc),
      },
    };
  };

  updateMyMenuTrackingDayCompletion = async (actor, dateValue, payload = {}) => {
    const userId = actor?.id || actor?._id;
    if (!userId) throw new Error("NO_AUTENTICADO");

    const user = await this.getById(userId);
    if (!user) throw new Error("NOT_FOUND");
    if (!this._isClientUser(user)) throw new Error("USER_NOT_CLIENT");

    const date = normalizeMenuTrackingDate(dateValue || payload.date);
    requireTrackingHistoryRange(user, { date });
    const permissions = clientMenuTrackingPermissions(user);
    if (!permissions.canUseManualDayCompletion) throw new Error("MANUAL_DAY_COMPLETION_NOT_ALLOWED");

    const requestedMode = cleanString(payload.dayCompletionMode || payload.mode || "manual_completion", 40);
    if (requestedMode !== "manual_completion") throw new Error("DAY_COMPLETION_MODE_INVALID");

    const dayKey = dayKeyFromDate(date);
    const activePlan = await this._resolveClientMenuPlan(user);
    const assignments = normalizeAssignedMenusByDay(activePlan.assignments || {});
    const assignment = assignments[dayKey] || null;
    const primary = assignment?.primaryMenu || assignment || null;
    const alternatives = Array.isArray(assignment?.alternatives) ? assignment.alternatives : [];
    const existing = await this.menuTrackingModel.getByUserDate(userId, date);
    const selectedIndex = hasNumber(
      payload?.selectedAlternative?.index ?? existing?.nutrition?.selectedAlternative?.index
    )
      ? Number(payload?.selectedAlternative?.index ?? existing?.nutrition?.selectedAlternative?.index)
      : null;
    const selectedAlternative = selectedIndex !== null && alternatives[selectedIndex]
      ? alternatives[selectedIndex]
      : null;
    const selectedMenu = selectedAlternative || primary;
    const selectedSnapshot = selectedMenu?.menuSnapshot || {};
    const snapshotMeals = Array.isArray(selectedSnapshot?.meals) ? selectedSnapshot.meals : [];
    const totalMealsCount = Number(selectedSnapshot?.mealsCount || snapshotMeals.length || 0) || 0;
    if (!selectedMenu || totalMealsCount <= 0) throw new Error("MENU_NOT_ASSIGNED_FOR_DATE");

    const completedMenuMeals = Array.isArray(existing?.completedMenuMeals) ? existing.completedMenuMeals : [];
    const completedMealsCount = completedMenuMeals.length;
    const alreadyManual = existing?.dayCompletionMode === "manual_completion";
    if (!alreadyManual && completedMealsCount >= totalMealsCount) {
      throw new Error("MENU_DAY_ALREADY_COMPLETED");
    }

    const hasPlanPatch = Object.prototype.hasOwnProperty.call(payload, "plan");
    if (hasPlanPatch && payload.plan && !permissions.canPlanRemainingIntake) {
      throw new Error("REMAINING_INTAKE_PLAN_NOT_ALLOWED");
    }

    const previousCompletion = existing?.manualCompletion || {};
    const previousPlan = previousCompletion.plan || null;
    const nextPlan = hasPlanPatch
      ? (payload.plan ? normalizeManualCompletionPlan(payload.plan, previousPlan) : null)
      : previousPlan;
    const now = new Date();
    const target = resolveClientNutritionWeek(user).targets[dayKey] || null;
    const menuTotals = menuSnapshotTotals(selectedSnapshot);
    const manualCompletion = {
      startedAt: previousCompletion.startedAt || now,
      startedFromMenu: true,
      startedCompletedMealsCount: hasNumber(previousCompletion.startedCompletedMealsCount)
        ? Number(previousCompletion.startedCompletedMealsCount)
        : completedMealsCount,
      startedTotalMealsCount: hasNumber(previousCompletion.startedTotalMealsCount)
        ? Number(previousCompletion.startedTotalMealsCount)
        : totalMealsCount,
      startedBy: previousCompletion.startedBy || userId,
      plan: nextPlan,
      updatedAt: now,
    };

    const doc = await this.menuTrackingModel.setDayCompletionState({
      clientId: userId,
      coachId: user?.coach?.entrenadorId || null,
      date,
      dayKey,
      weekStart: mondayOfWeek(date),
      weekEnd: addDaysIso(mondayOfWeek(date), 6),
      menuId: selectedMenu?.menuId || selectedSnapshot?.baseId || selectedSnapshot?.id || null,
      menuSnapshotId: selectedSnapshot?.baseId || selectedSnapshot?.id || null,
      menuSnapshotSummary: {
        name: selectedSnapshot?.name || "Menu asignado",
        mealsCount: totalMealsCount,
        source: selectedMenu.source || (selectedAlternative ? "alternative" : "base"),
      },
      target: target
        ? {
            kcal: target.kcal ?? null,
            proteina: target.p ?? null,
            carbs: target.c ?? null,
            grasas: target.g ?? null,
            source: target.statusLabel || null,
          }
        : null,
      menuTotals,
      dayCompletionMode: "manual_completion",
      manualCompletion,
    });

    return {
      ok: true,
      idempotent: alreadyManual,
      record: {
        id: idToString(doc?._id || doc?.id),
        date: doc?.date,
        dayKey: doc?.dayKey,
        target: doc?.target || null,
        menuTotals: doc?.menuTotals || null,
        menuSnapshotSummary: doc?.menuSnapshotSummary || null,
        tracking: trackingPublic(doc),
      },
    };
  };

  // =========================
  // ADMIN: COACH PROFILE / CAPABILITIES
  // =========================
  adminUpdateCoachProfile = async (id, payload = {}) => {
    const user = await this.getById(id);
    if (!user) throw new Error("NOT_FOUND");
    if (!this._isCoachUser(user)) throw new Error("USER_NOT_COACH");

    const current = user?.coachProfile || {};
    const currentSpecs = current?.specialties || {};

    const next = {
      ...current,
      ...(payload?.title !== undefined ? { title: String(payload.title || "") } : {}),
      ...(payload?.bio !== undefined ? { bio: String(payload.bio || "") } : {}),
      specialties: {
        ...currentSpecs,
        ...(payload?.specialties?.training !== undefined
          ? { training: !!payload.specialties.training }
          : {}),
        ...(payload?.specialties?.nutrition !== undefined
          ? { nutrition: !!payload.specialties.nutrition }
          : {}),
      },
    };

    if (
      payload?.specialties &&
      !next.specialties.training &&
      !next.specialties.nutrition
    ) {
      throw new Error("SPECIALTIES_INVALIDAS");
    }

    return await this.updateById(id, {
      coachProfile: next,
      updatedAt: new Date(),
    });
  };

  adminUpdateCoachCapabilities = async (id, payload = {}) => {
    const user = await this.getById(id);
    if (!user) throw new Error("NOT_FOUND");
    if (!this._isCoachUser(user)) throw new Error("USER_NOT_COACH");

    const current = user?.coachCapabilities || {};

    const maxClients =
      payload?.maxClients !== undefined
        ? Number(payload.maxClients)
        : current?.maxClients;

    if (payload?.maxClients !== undefined && (!Number.isFinite(maxClients) || maxClients < 0)) {
      throw new Error("MAX_CLIENTS_INVALIDO");
    }

    const next = {
      ...current,
      ...(payload?.maxClients !== undefined ? { maxClients } : {}),
      ...(payload?.canInviteClients !== undefined ? { canInviteClients: !!payload.canInviteClients } : {}),
      ...(payload?.canManageTraining !== undefined ? { canManageTraining: !!payload.canManageTraining } : {}),
      ...(payload?.canManageNutrition !== undefined ? { canManageNutrition: !!payload.canManageNutrition } : {}),
      ...(payload?.canUseTemplates !== undefined ? { canUseTemplates: !!payload.canUseTemplates } : {}),
      ...(payload?.canDuplicatePlans !== undefined ? { canDuplicatePlans: !!payload.canDuplicatePlans } : {}),
      ...(payload?.canExportData !== undefined ? { canExportData: !!payload.canExportData } : {}),
      ...(payload?.canSeeAdvancedMetrics !== undefined ? { canSeeAdvancedMetrics: !!payload.canSeeAdvancedMetrics } : {}),
      menus: {
        ...(current?.menus || {}),
        ...(payload?.menus?.automatic !== undefined ? { automatic: !!payload.menus.automatic } : {}),
        ...(payload?.menus?.semiautomatic !== undefined ? { semiautomatic: !!payload.menus.semiautomatic } : {}),
        ...(payload?.menus?.fixed !== undefined ? { fixed: !!payload.menus.fixed } : {}),
        ...(payload?.menus?.hybrid !== undefined ? { hybrid: !!payload.menus.hybrid } : {}),
      },
      routines: {
        ...(current?.routines || {}),
        ...(payload?.routines?.automatic !== undefined ? { automatic: !!payload.routines.automatic } : {}),
        ...(payload?.routines?.semiautomatic !== undefined ? { semiautomatic: !!payload.routines.semiautomatic } : {}),
        ...(payload?.routines?.manual !== undefined ? { manual: !!payload.routines.manual } : {}),
        ...(payload?.routines?.hybrid !== undefined ? { hybrid: !!payload.routines.hybrid } : {}),
      },
    };

    return await this.updateById(id, {
      coachCapabilities: next,
      updatedAt: new Date(),
    });
  };

  // =========================
  // ONBOARDING (CLIENTE)
  // =========================
  actualizarOnboardingCliente = async (userId, step, data = {}) => {
    const now = new Date();
    const s = Number(step);

    if (![1, 2, 3].includes(s)) throw new Error("STEP_INVALIDO");

    const current = await this.getById(userId);
    if (!current) throw new Error("NOT_FOUND");

    const onboarding = {
      ...(current.onboarding || {}),
      lastSeenAt: now,
    };

    const profile = {
      ...(current.profile || {}),
    };

    const basics = {
      ...(profile.basics || {}),
    };

    const patch = { updatedAt: now };
    const has = (k) => Object.prototype.hasOwnProperty.call(data, k);

    // STEP 1
    if (s === 1) {
      if (has("genero") && data.genero != null) basics.genero = String(data.genero);
      if (has("sexo") && data.sexo != null) basics.genero = String(data.sexo);

      if (has("fechaNacimiento") && data.fechaNacimiento != null) {
        basics.fechaNacimiento = String(data.fechaNacimiento);
      }

      if (has("tendenciaPeso") && data.tendenciaPeso != null) {
        basics.tendenciaPeso = String(data.tendenciaPeso);
      }

      if (has("frecuenciaEjercicio") && data.frecuenciaEjercicio != null) {
        basics.frecuenciaEjercicio = String(data.frecuenciaEjercicio);
      }

      if (has("actividadDiaria") && data.actividadDiaria != null) {
        basics.actividadDiaria = String(data.actividadDiaria);
      }

      if (has("experienciaPesas") && data.experienciaPesas != null) {
        basics.experienciaPesas = String(data.experienciaPesas);
      }

      if (has("grasaNivel") && data.grasaNivel != null) {
        basics.grasaNivel = String(data.grasaNivel);
      }

      const sentTdee = has("tdeeEstimado") || has("tdeeCustom");

      if (has("tdeeEstimado") && data.tdeeEstimado != null) {
        const t = Number(data.tdeeEstimado);
        if (!Number.isFinite(t) || t < 800 || t > 6000) {
          throw new Error("TDEE_INVALIDO");
        }
        basics.tdeeEstimado = t;
      }

      if (has("tdeeCustom") && data.tdeeCustom != null) {
        const t = Number(data.tdeeCustom);
        if (!Number.isFinite(t) || t < 800 || t > 6000) {
          throw new Error("TDEE_INVALIDO");
        }
        basics.tdeeCustom = t;
      }

      let alturaCm = current?.antropometriaActual?.alturaCm ?? null;
      let pesoKg = current?.antropometriaActual?.pesoKg ?? null;
      let grasaPct = current?.antropometriaActual?.grasaPct ?? null;

      if (has("alturaCm")) {
        const a = Number(data.alturaCm);
        if (!Number.isFinite(a) || a < 120 || a > 230) {
          throw new Error("ALTURA_INVALIDA");
        }
        alturaCm = a;
      }

      if (has("pesoKg")) {
        const p = Number(data.pesoKg);
        if (!Number.isFinite(p) || p < 30 || p > 250) {
          throw new Error("PESO_INVALIDO");
        }
        pesoKg = p;
      }

      if (has("grasaPct")) {
        if (
          data.grasaPct === null ||
          data.grasaPct === "" ||
          String(data.grasaPct).trim() === ""
        ) {
          grasaPct = null;
        } else {
          const g = Number(data.grasaPct);
          if (!Number.isFinite(g) || g < 3 || g > 70) {
            throw new Error("GRASA_INVALIDA");
          }
          grasaPct = g;
        }
      }

      const touchedAnthro = has("alturaCm") || has("pesoKg") || has("grasaPct");

      if (touchedAnthro) {
        patch.antropometriaActual = {
          ...(current.antropometriaActual || {}),
          alturaCm,
          pesoKg,
          grasaPct,
          updatedAt: now,
        };
      }

      patch.onboarding = {
        ...onboarding,
        step: sentTdee ? 2 : (onboarding.step || 1),
        done: false,
        startedAt: onboarding.startedAt || now,
        completedAt: onboarding.completedAt || null,
      };

      patch.profile = {
        ...profile,
        basics,
      };
    }

    // STEP 2
    if (s === 2) {
      const isWizardV2 = String(data?.__wizard || "") === "v2";

      if (isWizardV2) {
        const incomingGoal = { ...(data?.goal || {}) };

        patch.goal = {
          ...(current.goal || {}),
          ...incomingGoal,
          updatedAt: now,
        };

        patch.onboarding = {
          ...onboarding,
          step: 3,
          done: false,
          startedAt: onboarding.startedAt || now,
          completedAt: onboarding.completedAt || null,
        };

        patch.profile = {
          ...profile,
          basics,
        };
      } else {
        const objetivo = String(data?.objetivo || "").trim();
        const actividad = Number(data?.actividad);
        const diasEntreno = Number(data?.diasEntreno);

        if (!objetivo) throw new Error("OBJETIVO_INVALIDO");
        if (!Number.isFinite(actividad) || actividad < 1.2 || actividad > 2.2) {
          throw new Error("ACTIVIDAD_INVALIDA");
        }
        if (!Number.isFinite(diasEntreno) || diasEntreno < 0 || diasEntreno > 7) {
          throw new Error("DIAS_INVALIDO");
        }

        patch.goal = {
          ...(current.goal || {}),
          type: objetivo,
          updatedAt: now,
        };

        patch.onboarding = {
          ...onboarding,
          step: 2,
          done: true,
          startedAt: onboarding.startedAt || now,
          completedAt: now,
        };

        patch.profile = {
          ...profile,
          basics,
        };
      }
    }

    // STEP 3
    if (s === 3) {
      const isWizardV2 = String(data?.__wizard || "") === "v2";

      if (isWizardV2 && data?.program && typeof data.program === "object") {
        const incomingProgram = { ...(data.program || {}) };

        patch.program = {
          ...(current.program || {}),
          ...incomingProgram,
          final: data?.__final === true,
          updatedAt: now,
        };

        patch.menu = {
          ...(current.menu || {}),
          mode: {
            ...(current?.menu?.mode || {}),
            type: "automatic",
            lockedByCoach: false,
          },
          mealConfig: {
            ...(current?.menu?.mealConfig || {}),
          },
          restrictions: {
            ...(current?.menu?.restrictions || {}),
            allergies: current?.menu?.restrictions?.allergies || [],
            intolerances: current?.menu?.restrictions?.intolerances || [],
            excludedFoods: current?.menu?.restrictions?.excludedFoods || [],
            preferredFoods: current?.menu?.restrictions?.preferredFoods || [],
            favoriteFoods: current?.menu?.restrictions?.favoriteFoods || [],
            favoriteMeals: current?.menu?.restrictions?.favoriteMeals || [],
          },
          weeklyPlan: current?.menu?.weeklyPlan || {
            caloriesByDay: {},
            macrosByDay: {},
            mealsByDay: {},
            assignedMenusByDay: {},
          },
          history: current?.menu?.history || {
            lastWeek: {
              from: null,
              to: null,
              dias: {},
              updatedAt: null,
            },
          },
          favorites: current?.menu?.favorites || {
            ids: [],
            updatedAt: null,
          },
          updatedAt: now,
        };
      }

      const isFinalV2 = isWizardV2 && data?.__final === true;

      patch.onboarding = {
        ...onboarding,
        step: 3,
        done: isWizardV2 ? isFinalV2 : true,
        startedAt: onboarding.startedAt || now,
        completedAt: isWizardV2 ? (isFinalV2 ? now : null) : now,
      };

      patch.profile = {
        ...profile,
        basics,
      };
    }

    const updated = await this.updateById(userId, patch);
    return this._normalizeUser(updated);
  };

  getUpdatedAt = async (userId) => {
    return await this.model.getUpdatedAtById(userId);
  };
}

export {
  buildNutritionAssignmentImpact,
  buildSelfGoalsBackup,
  moveInvalidatedAssignments,
  resolveClientNutritionWeek,
  resetCoachDerivedClientPermissions,
  restoreMetasAfterCoachDisconnect,
  shouldUseWeeklyNutritionPlan,
};

export default ServicioUsuarios;
