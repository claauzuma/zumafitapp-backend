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
import ModelMongoDBAccessAuditEvents from "../model/DAO/accessAuditEventsMongoDB.js";
import ModelMongoDBMenus from "../model/DAO/menusMongoDB.js";
import ModelMongoDBComidas from "../model/DAO/comidasMongoDB.js";
import ModelMongoDBComidasGuardadas from "../model/DAO/comidasGuardadasMongoDB.js";
import ModelMongoDBCoachClientCapacity from "../model/DAO/coachClientCapacityMongoDB.js";
import ModelMongoDBClientCoachBlocks from "../model/DAO/clientCoachBlocksMongoDB.js";
import ModelMongoDBRutinas from "../model/DAO/rutinasMongoDB.js";
import ModelMongoDBClientCustomFoods from "../model/DAO/clientCustomFoodsMongoDB.js";
import {
  getGoalsChangeStatus,
  goalsMetadataPatch,
  requireCapability,
  requireCoachAuthority,
  requireGoalsChangeAllowed,
  requireTrackingHistoryRange,
} from "./accessGates.js";
import { recordAccessAuditEvent } from "./accessAuditEvents.js";
import ServicioFoodLogs from "./foodLogs.js";
import {
  UNRESTRICTED_WEEKLY_MODE,
  resolveUnrestrictedTarget,
} from "./unrestrictedWeeklyBalance.js";
import {
  equivalentApprovalRequired,
  equivalentNotificationVisibility,
  equivalentReview,
  normalizeEquivalentTrackingSettings,
} from "./trackingEquivalences.js";
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
import { normalizeClientMenuAutonomyPreset, resolveClientMenuAutonomyPermissions } from "./clientMenuAutonomy.js";
import {
  ageFromBirthDate,
  calculateActivityFactor,
  calculateMaintenancePreview,
  calculateNutritionGoalPreview,
} from "./nutritionGoalCalculator.js";

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
  const imagenUrl = cleanString(
    item.imagenUrl || item.imageUrl || item.imagen?.url || item.imagen || item.image,
    500
  );
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
    imagenUrl,
    imageUrl: imagenUrl,
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
    target: isPlainObject(meal.target) ? weeklyMenuTotalsPayload(meal.target) : null,
    targetMealId: cleanString(meal.targetMealId, 120) || null,
    targetOrigin: cleanString(meal.targetOrigin, 40) || null,
    compositionOrigin: cleanString(meal.compositionOrigin, 40) || null,
    generationSource: cleanString(meal.generationSource, 120) || "",
    plannerSlotIndex: Number.isInteger(Number(meal.plannerSlotIndex))
      ? Number(meal.plannerSlotIndex)
      : null,
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
    source: cleanString(snapshot.source || snapshot.generationSource, 80),
    generationSource: cleanString(snapshot.generationSource, 120),
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

    const primarySource = isPlainObject(entry.primaryMenu)
      ? entry.primaryMenu
      : entry;

    // Ignorar placeholders de días sin menú.
    // Ej.: { primaryMenu: {} } o entradas con IDs nulos y sin comidas.
    const rawBaseId = idToString(
      primarySource?.menuId ||
      primarySource?.menuBaseId ||
      primarySource?.menuSnapshot?.baseId ||
      primarySource?.menuSnapshot?.id
    );

    const rawMeals = Array.isArray(primarySource?.menuSnapshot?.meals)
      ? primarySource.menuSnapshot.meals
      : Array.isArray(primarySource?.meals)
        ? primarySource.meals
        : [];

    const rawKcal = Number(
      primarySource?.menuSnapshot?.kcal ??
      primarySource?.kcal ??
      0
    );

    const isEmptyPlaceholder =
      !rawBaseId &&
      rawMeals.length === 0 &&
      (!Number.isFinite(rawKcal) || rawKcal <= 0);

    if (isEmptyPlaceholder) {
      return acc;
    }

    const primaryMenu = normalizeAssignedMenuEntry(primarySource, "base");
    if (!primaryMenu) return acc;

    const alternatives = Array.isArray(entry.alternatives)
      ? entry.alternatives
          .map((alternative) =>
            normalizeAssignedMenuAlternative(alternative)
          )
          .filter(Boolean)
          .filter(
            (alternative) =>
              !sameAssignedMenu(alternative, primaryMenu)
          )
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
  if (
    String(menu?.activationScope || "").toLowerCase() === "date" ||
    String(menu?.source || "").toLowerCase() === "autonomous"
  ) return "";
  const days = isPlainObject(menu.dias || menu.days) ? menu.dias || menu.days : {};
  const validDayKeys = Object.keys(days).filter((key) => getWeekDayMeta(key));
  return validDayKeys.length === 1 ? validDayKeys[0] : "";
}

function activePlanAssignmentForDate(activePlan = {}, assignments = {}, dayKey = "", date = "") {
  const activeMenu = activePlan?.activeMenu || {};
  const source = String(activeMenu?.source || "").trim().toLowerCase();
  const scope = String(activeMenu?.activationScope || "").trim().toLowerCase();
  const activationDate = String(activeMenu?.activationDate || activeMenu?.fechaInicio || "").slice(0, 10);
  const dateScoped = activePlan?.activeSource === "own" && (scope === "date" || source === "autonomous");
  if (dateScoped && activationDate && activationDate !== date) return null;
  return assignments[dayKey] || null;
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

function localDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function buildSelfWeightProgressPatch(user = {}, payload = {}, { now = new Date() } = {}) {
  const date = cleanString(payload.date || payload.fecha || localDateKey(now), 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > localDateKey(now)) {
    throw new Error("PROGRESS_DATE_INVALID");
  }
  const rawWeight = Number(payload.weightKg ?? payload.pesoKg);
  if (!Number.isFinite(rawWeight) || rawWeight < 20 || rawWeight > 350) throw new Error("PROGRESS_WEIGHT_INVALID");
  const weightKg = Math.round(rawWeight * 10) / 10;
  const currentProgress = isPlainObject(user?.progress) ? user.progress : {};
  const checkins = Array.isArray(currentProgress.checkins) ? currentProgress.checkins : [];
  const existingIndex = checkins.findIndex((item) => String(item?.date || item?.fecha || "").slice(0, 10) === date);
  const existing = existingIndex >= 0 ? checkins[existingIndex] : null;
  const normalized = normalizeProgressCheckin({
    ...(existing || {}),
    id: existing?.id || `self-weight:${date}`,
    date,
    weightKg,
    note: payload.note ?? payload.nota ?? existing?.note ?? "",
    source: existing?.source && existing.source !== "self" ? existing.source : "self",
  }, { id: `self-weight:${date}`, date, createdAt: existing?.createdAt || now });
  const nextCheckins = existingIndex >= 0
    ? checkins.map((item, index) => index === existingIndex ? normalized : item)
    : [...checkins, normalized];
  const sorted = sortProgressCheckins(nextCheckins);
  return {
    progress: {
      ...currentProgress,
      checkins: sorted,
      ...summarizeProgress(sorted),
      updatedAt: now,
    },
    antropometriaActual: {
      ...(user?.antropometriaActual || {}),
      pesoKg: weightKg,
      updatedAt: now,
    },
    stats: {
      ...(user?.stats || {}),
      pesoActualKg: weightKg,
      updatedAt: now,
    },
    record: normalized,
    created: existingIndex < 0,
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

function weeklyBalanceEnabled(weeklyPlan = {}) {
  return weeklyPlan?.balanceEnabled === true || weeklyPlan?.mode === UNRESTRICTED_WEEKLY_MODE;
}

function normalizeWeeklyMealTargetsByDay(value = {}, nutritionWeek = null) {
  if (!isPlainObject(value)) throw new Error("MEAL_TARGETS_BY_DAY_INVALID");
  const normalized = {};

  WEEKLY_MENU_DAY_META.forEach((day) => {
    const entry = findDayValue(value, day);
    if (!entry.found || entry.value === null) return;
    const plan = entry.value;
    if (!isPlainObject(plan) || plan.mode !== "per_meal" || !Array.isArray(plan.meals)) {
      throw new Error("MEAL_TARGET_PLAN_INVALID");
    }
    if (plan.meals.length < 3 || plan.meals.length > 6) throw new Error("MEAL_TARGET_COUNT_INVALID");

    const validMealTypes = new Set(["breakfast", "lunch", "snack", "dinner", "extraSnack"]);
    const mealIds = new Set();
    const meals = plan.meals.map((meal, index) => {
      if (!isPlainObject(meal) || !isPlainObject(meal.target)) throw new Error("MEAL_TARGET_INVALID");
      const id = cleanString(meal.id || `coach_target_${day.key}_${index + 1}`, 80);
      const type = cleanString(meal.type || "snack", 40);
      if (!id || mealIds.has(id) || !validMealTypes.has(type)) throw new Error("MEAL_TARGET_INVALID");
      mealIds.add(id);
      return {
        id,
        label: cleanString(meal.label || meal.name || `Comida ${index + 1}`, 80),
        type,
        order: index,
        target: {
          kcal: numberOrNull(meal.target.kcal, { min: 0, max: 7000 }),
          p: numberOrNull(meal.target.p ?? meal.target.proteina, { min: 0, max: 500 }),
          c: numberOrNull(meal.target.c ?? meal.target.carbs, { min: 0, max: 900 }),
          g: numberOrNull(meal.target.g ?? meal.target.grasas, { min: 0, max: 400 }),
        },
      };
    });

    const totals = meals.reduce((sum, meal) => ({
      kcal: sum.kcal + Number(meal.target.kcal || 0),
      p: sum.p + Number(meal.target.p || 0),
      c: sum.c + Number(meal.target.c || 0),
      g: sum.g + Number(meal.target.g || 0),
    }), { kcal: 0, p: 0, c: 0, g: 0 });
    const dailyTarget = nutritionWeek?.targets?.[day.key] || {};
    if (hasNumber(dailyTarget.kcal) && (
      Math.abs(totals.kcal - Number(dailyTarget.kcal || 0)) > 1 ||
      Math.abs(totals.p - Number(dailyTarget.p || 0)) > 0.11 ||
      Math.abs(totals.c - Number(dailyTarget.c || 0)) > 0.11 ||
      Math.abs(totals.g - Number(dailyTarget.g || 0)) > 0.11
    )) throw new Error("MEAL_TARGET_TOTALS_MISMATCH");

    normalized[day.key] = {
      mode: "per_meal",
      meals,
      updatedAt: plan.updatedAt ? new Date(plan.updatedAt) : new Date(),
    };
  });

  return normalized;
}

function normalizeWeeklyMealTargetDayPatch(value = {}, nutritionWeek = null) {
  if (!isPlainObject(value)) throw new Error("MEAL_TARGET_PLAN_INVALID");
  const day = getWeekDayMeta(value.dayKey);
  if (!day || !Object.prototype.hasOwnProperty.call(value, "plan")) {
    throw new Error("MEAL_TARGET_PLAN_INVALID");
  }
  if (value.plan === null) return { dayKey: day.key, plan: null };
  if (!isPlainObject(value.plan)) throw new Error("MEAL_TARGET_PLAN_INVALID");
  const normalized = normalizeWeeklyMealTargetsByDay(
    { [day.key]: value.plan },
    nutritionWeek
  );
  if (!normalized[day.key]) throw new Error("MEAL_TARGET_PLAN_INVALID");
  return { dayKey: day.key, plan: normalized[day.key] };
}

function isSelfGeneratedWeeklyPlan(user = {}) {
  const weeklyPlan = user?.menu?.weeklyPlan || {};
  const source = normalizeDayName(weeklyPlan.source || user?.menu?.weeklyPlanSource || "");
  return ["self", "client", "cliente"].includes(source) && (
    weeklyBalanceEnabled(weeklyPlan) || weeklyPlanHasValues(weeklyPlan)
  );
}

function normalizeWeeklyGoalsPayload(weeklyPlan = {}) {
  if (!isPlainObject(weeklyPlan)) return null;
  const requestedMode = cleanString(weeklyPlan.mode || "same_all_days", 60) || "same_all_days";
  const mode = requestedMode === UNRESTRICTED_WEEKLY_MODE ? "same_all_days" : requestedMode;
  const balanceEnabled = weeklyPlan.balanceEnabled === true || requestedMode === UNRESTRICTED_WEEKLY_MODE;
  if (mode === "same_all_days") {
    return {
      mode,
      caloriesByDay: {},
      macrosByDay: {},
      trainingDays: [],
      balanceEnabled,
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
    balanceEnabled,
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
    balanceEnabled: normalized.balanceEnabled === true,
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

function nutritionTargetFromOnboardingGoal(goal = {}) {
  const macros = isPlainObject(goal?.targetMacros) ? goal.targetMacros : {};
  const kcal = Number(goal?.initialBudgetKcal ?? goal?.maintenanceKcal);
  const p = Number(macros?.p);
  const c = Number(macros?.c);
  const g = Number(macros?.g);
  const complete =
    Number.isFinite(kcal) && kcal >= 800 && kcal <= 7000 &&
    Number.isFinite(p) && p > 0 && p <= 500 &&
    Number.isFinite(c) && c > 0 && c <= 900 &&
    Number.isFinite(g) && g > 0 && g <= 400;

  return complete ? { kcal, macros: { p, c, g } } : null;
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
    mode: weeklyPlan?.mode || "same_all_days",
    balanceEnabled: weeklyBalanceEnabled(weeklyPlan),
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
        quantityMode: ["manual", "automatic", "calculated", "suggested"].includes(String(food.quantityMode || food.mode || food.status || "").toLowerCase())
          ? String(food.quantityMode || food.mode || food.status).toLowerCase()
          : food.source === "addedCandidate" ? "suggested" : "manual",
        suggested: food.suggested === true || food.source === "addedCandidate",
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
    creationType: entry.creationType ? cleanString(entry.creationType, 80) : null,
    replacementSlot: ["client_generated", "coach_assigned"].includes(String(entry.replacementSlot || "").toLowerCase())
      ? String(entry.replacementSlot).toLowerCase()
      : entry.mode === "custom_equivalent" ? "client_generated" : "coach_assigned",
    selectionKey: entry.selectionKey ? cleanString(entry.selectionKey, 160) : null,
    strategy: ["selected_only", "assisted_food_addition"].includes(String(entry.strategy || "").toLowerCase())
      ? String(entry.strategy).toLowerCase()
      : "selected_only",
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
    resultTotals: entry.resultTotals ? roundTrackingTotals(entry.resultTotals) : null,
    originalMealId: entry.originalMealId ? cleanString(entry.originalMealId, 100) : null,
    originalMealName: entry.originalMealName ? cleanString(entry.originalMealName, 160) : null,
    originalFoodId: entry.originalFoodId ? cleanString(entry.originalFoodId, 100) : null,
    originalFoodIndex: hasNumber(entry.originalFoodIndex) ? Math.max(0, Math.trunc(Number(entry.originalFoodIndex))) : null,
    menuId: entry.menuId ? cleanString(entry.menuId, 120) : null,
    menuVersion: entry.menuVersion ? cleanString(entry.menuVersion, 120) : null,
    requestId: entry.requestId ? cleanString(entry.requestId, 120) : null,
    version: Math.max(1, Math.trunc(Number(entry.version) || 1)),
    approvalStatus: ["approved", "pending_review", "rejected"].includes(String(entry.approvalStatus || "").toLowerCase())
      ? String(entry.approvalStatus).toLowerCase()
      : null,
    approvalReason: entry.approvalReason ? cleanString(entry.approvalReason, 500) : "",
    approvedAt: entry.approvedAt ? cleanString(entry.approvedAt, 40) : null,
    rejectedAt: entry.rejectedAt ? cleanString(entry.rejectedAt, 40) : null,
    warningAccepted: entry.warningAccepted === true,
    acceptedWarnings: Array.isArray(entry.acceptedWarnings)
      ? entry.acceptedWarnings.map((warning) => cleanString(warning, 160)).filter(Boolean).slice(0, 20)
      : [],
    warnings: Array.isArray(entry.warnings)
      ? entry.warnings.map((warning) => cleanString(typeof warning === "string" ? warning : warning?.message || warning?.code, 220)).filter(Boolean).slice(0, 20)
      : [],
    favoriteOriginId: entry.favoriteOriginId ? cleanString(entry.favoriteOriginId, 120) : null,
    targetVersionChanged: entry.targetVersionChanged === true,
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

function trackingEntriesSignature(entries = [], fallbackSource = "manual_food") {
  return JSON.stringify(sanitizeTrackingEntries(entries, fallbackSource));
}

function trackingEntriesChanged(nextEntries = [], currentEntries = [], fallbackSource = "manual_food") {
  return trackingEntriesSignature(nextEntries, fallbackSource) !==
    trackingEntriesSignature(currentEntries, fallbackSource);
}

function trackingTotalsClose(left = {}, right = {}, tolerance = 0.11) {
  const a = roundTrackingTotals(left);
  const b = roundTrackingTotals(right);
  return ["kcal", "proteina", "carbs", "grasas"].every((key) => (
    Math.abs(a[key] - b[key]) <= tolerance
  ));
}

function replacementMealIndex(entry = {}) {
  const match = String(entry?.id || "").match(/^client-meal-replacement-\d{4}-\d{2}-\d{2}-(\d+)-/);
  return match ? Number(match[1]) : null;
}

function looksLikeAssignedMealAlternative(entry = {}, selectedMenu = null, availableMenus = []) {
  const mealIndex = replacementMealIndex(entry);
  const selectedSnapshot = selectedMenu?.menuSnapshot || {};
  const originalMeals = Array.isArray(selectedSnapshot.meals) ? selectedSnapshot.meals : [];
  const originalMeal = Number.isInteger(mealIndex) ? originalMeals[mealIndex] : null;
  if (!originalMeal || !trackingTotalsClose(entry.target, snapshotMealTotals(originalMeal))) return false;

  return (availableMenus || []).some((candidateMenu) => {
    if (!candidateMenu || sameAssignedMenu(candidateMenu, selectedMenu)) return false;
    const snapshot = candidateMenu.menuSnapshot || {};
    const meals = Array.isArray(snapshot.meals) ? snapshot.meals : [];
    return meals.some((candidateMeal) => {
      const name = cleanString(candidateMeal?.nombre || candidateMeal?.name, 160).toLowerCase();
      if (!name || name !== cleanString(entry.name, 160).toLowerCase()) return false;
      const expectedDelta = subtractTrackingTotals(
        snapshotMealTotals(candidateMeal),
        snapshotMealTotals(originalMeal)
      );
      return trackingTotalsClose(entry.totals, expectedDelta);
    });
  });
}

function sumTrackingEntryTotals(entries = []) {
  return entries.reduce((acc, entry) => addTrackingTotals(acc, entry?.totals || entry), emptyTrackingTotals());
}

function consumedReplacementEntries(entries = [], completedMenuMeals = []) {
  const completedIds = new Set(
    (Array.isArray(completedMenuMeals) ? completedMenuMeals : [])
      .map((meal) => cleanString(meal?.mealId || meal?.id, 100))
      .filter(Boolean)
  );
  return (Array.isArray(entries) ? entries : []).filter((entry) => {
    if (entry?.isActiveReplacement === false) return false;
    const replacedIds = Array.isArray(entry?.replacesMealIds)
      ? entry.replacesMealIds.map((id) => cleanString(id, 100)).filter(Boolean)
      : [];
    // Compatibilidad: los reemplazos historicos se confirmaban al guardarse.
    return !replacedIds.length || replacedIds.some((id) => completedIds.has(id));
  });
}

function replacementFoodPosition(entry = {}) {
  if (hasNumber(entry.originalFoodIndex)) return Math.max(0, Math.trunc(Number(entry.originalFoodIndex)));
  const match = String(entry?.id || "").match(/^client-food-replacement-\d{4}-\d{2}-\d{2}-(\d+)-(\d+)-/);
  return match ? Number(match[2]) : null;
}

function replacementMealForEntry(entry = {}, snapshot = {}) {
  const meals = Array.isArray(snapshot?.meals) ? snapshot.meals : [];
  const replaced = new Set((entry.replacesMealIds || []).map((id) => cleanString(id, 100)).filter(Boolean));
  return meals
    .map((meal, index) => ({ meal, index, id: snapshotMealId(meal, index) }))
    .find((item) => replaced.has(item.id)) || null;
}

function sumValidatedFoodTotals(foods = []) {
  return (Array.isArray(foods) ? foods : []).reduce((sum, food) => addTrackingTotals(sum, {
    kcal: food?.kcal,
    proteina: food?.proteina ?? food?.proteinas,
    carbs: food?.carbs ?? food?.carbohidratos,
    grasas: food?.grasas,
  }), emptyTrackingTotals());
}

function equivalentContentSignature(entry = {}) {
  return JSON.stringify({
    id: entry.id,
    strategy: entry.strategy,
    target: roundTrackingTotals(entry.target || {}),
    replacesMealIds: entry.replacesMealIds || [],
    foods: (entry.foods || []).map((food) => ({
      id: food.id,
      quantity: Number(food.quantity),
      unit: food.unit,
      quantityMode: food.quantityMode,
      suggested: food.suggested === true,
    })),
  });
}

function stableEquivalentRequestId(userId = "", date = "", menuId = "", entryId = "", version = 1) {
  const source = [idToString(userId), date, idToString(menuId), entryId, Number(version) || 1].join("|");
  return `menu-equivalent-${crypto.createHash("sha256").update(source).digest("hex").slice(0, 48)}`;
}

function existingEntryById(entries = [], id = "") {
  return (Array.isArray(entries) ? entries : []).find((entry) => String(entry?.id || "") === String(id || "")) || null;
}

function canonicalEquivalentEntry({
  entry,
  existing,
  foods,
  user,
  date,
  dayKey,
  weekStart,
  weekEnd,
  selectedMenu,
  selectedSnapshot,
  original,
  originalFood = null,
} = {}) {
  const target = originalFood ? roundTrackingTotals(originalFood?.totals || originalFood) : snapshotMealTotals(original?.meal || {});
  const resultTotals = sumValidatedFoodTotals(foods);
  const contentProbe = { ...entry, target, foods };
  const changed = !existing || equivalentContentSignature(existing) !== equivalentContentSignature(contentProbe);
  const version = existing ? Math.max(1, Number(existing.version) || 1) + (changed ? 1 : 0) : 1;
  const approvalStatus = changed
    ? equivalentApprovalRequired(user) ? "pending_review" : "approved"
    : existing?.approvalStatus || (equivalentApprovalRequired(user) ? "pending_review" : "approved");
  const menuId = idToString(selectedMenu?.menuId || selectedSnapshot?.baseId || selectedSnapshot?.id || "");
  const canonical = {
    ...entry,
    date,
    dayKey,
    weekStart,
    weekEnd,
    menuId,
    menuVersion: cleanString(selectedSnapshot?.snapshotVersion || selectedSnapshot?.version || selectedMenu?.assignedAt || "1", 120),
    originalMealId: original?.id || cleanString(entry.originalMealId, 100),
    originalMealName: cleanString(original?.meal?.nombre || original?.meal?.name || entry.originalMealName, 160),
    ...(originalFood ? {
      originalFoodId: cleanString(originalFood?.alimentoId || originalFood?.id || originalFood?._id, 100),
      originalFoodIndex: replacementFoodPosition(entry),
    } : {}),
    target,
    resultTotals,
    totals: subtractTrackingTotals(resultTotals, target),
    foods,
    version,
    approvalStatus,
    approvalReason: changed ? "" : existing?.approvalReason || "",
    approvedAt: approvalStatus === "approved" ? existing?.approvedAt || new Date().toISOString() : null,
    rejectedAt: approvalStatus === "rejected" ? existing?.rejectedAt || null : null,
  };
  canonical.requestId = stableEquivalentRequestId(user?._id || user?.id, date, menuId, canonical.id, version);
  return canonical;
}

function effectiveFoodsForEquivalentMeal(snapshot = {}, mealInfo = null, mealReplacement = null, foodReplacements = []) {
  if (!mealInfo) return [];
  if (mealReplacement?.foods?.length) return mealReplacement.foods;
  const replacementsByIndex = new Map(
    (Array.isArray(foodReplacements) ? foodReplacements : [])
      .map((entry) => [replacementFoodPosition(entry), entry?.foods?.[0]])
      .filter(([index, food]) => Number.isInteger(index) && food)
  );
  const originalFoods = Array.isArray(mealInfo.meal?.items)
    ? mealInfo.meal.items
    : Array.isArray(mealInfo.meal?.foods)
      ? mealInfo.meal.foods
      : Array.isArray(mealInfo.meal?.alimentos)
        ? mealInfo.meal.alimentos
        : [];
  return originalFoods.map((food, index) => replacementsByIndex.get(index) || {
    id: cleanString(food?.alimentoId || food?.id || food?._id, 100),
    alimentoId: cleanString(food?.alimentoId || food?.id || food?._id, 100),
    name: cleanString(food?.nombreSnapshot || food?.nombre || food?.name, 160),
    nombre: cleanString(food?.nombreSnapshot || food?.nombre || food?.name, 160),
    quantity: numberOrNull(food?.cantidad ?? food?.quantity, { min: 0, max: 10000 }),
    cantidad: numberOrNull(food?.cantidad ?? food?.quantity, { min: 0, max: 10000 }),
    unit: cleanString(food?.unidad || food?.unit || "g", 24),
    unidad: cleanString(food?.unidad || food?.unit || "g", 24),
    kcal: numberOrNull(food?.kcal ?? food?.calorias, { min: 0, max: 20000 }),
    proteina: numberOrNull(food?.proteina ?? food?.proteinas, { min: 0, max: 1000 }),
    carbs: numberOrNull(food?.carbs ?? food?.carbohidratos, { min: 0, max: 2000 }),
    grasas: numberOrNull(food?.grasas, { min: 0, max: 1000 }),
    source: "assigned_menu_snapshot",
    quantityMode: "manual",
  });
}

function trackingLogsByDate(entries = []) {
  return (Array.isArray(entries) ? entries : []).reduce((logsByDate, entry) => {
    const date = String(entry?.date || "");
    if (!date) return logsByDate;
    const current = logsByDate.get(date) || [];
    current.push(entry);
    logsByDate.set(date, current);
    return logsByDate;
  }, new Map());
}

function trackingEntryMealIdentity(entry = {}) {
  const mealId = cleanString(
    entry?.mealId || entry?.mealConfigId || entry?.mealKey,
    100
  );
  const mealType = cleanString(
    entry?.mealType || entry?.tipo || entry?.type || entry?.comida,
    60
  ).toLowerCase();
  return { mealId, mealType };
}

function isGenericTrackingMealId(mealId = "", mealType = "") {
  const id = String(mealId || "").toLowerCase();
  const type = String(mealType || "").toLowerCase();
  return !id || id === type || id === "otra" || id === "picoteo";
}

function trackingMealIdentitiesMatch(left = {}, right = {}) {
  const a = trackingEntryMealIdentity(left);
  const b = trackingEntryMealIdentity(right);
  if (a.mealId && b.mealId && a.mealId === b.mealId) return true;
  if (!a.mealType || !b.mealType || a.mealType !== b.mealType) return false;
  return isGenericTrackingMealId(a.mealId, a.mealType)
    || isGenericTrackingMealId(b.mealId, b.mealType);
}

/**
 * Lectura canónica del consumo del día. Los FoodLogs reales ganan por slot;
 * completedMenuMeals queda únicamente como fallback para cierres históricos.
 * Los logs espejo creados por equivalencias se omiten porque el snapshot
 * cerrado ya representa ese mismo consumo.
 */
export function resolveDailyConsumedNutrition(doc = null, foodLogs = []) {
  const canonicalLogs = (Array.isArray(foodLogs) ? foodLogs : [])
    .filter((entry) => entry?.source !== "menu_equivalent_consumption");
  const completedMeals = Array.isArray(doc?.completedMenuMeals) ? doc.completedMenuMeals : [];
  const canonicalBySlot = new Map();

  canonicalLogs.forEach((entry) => {
    const identity = trackingEntryMealIdentity(entry);
    const key = identity.mealId || identity.mealType || "sin_slot";
    const current = canonicalBySlot.get(key) || {
      mealId: identity.mealId || identity.mealType || "sin_slot",
      mealType: identity.mealType || "otra",
      source: "food_logs",
      totals: emptyTrackingTotals(),
      entries: [],
    };
    current.totals = addTrackingTotals(current.totals, entry);
    current.entries.push(entry);
    canonicalBySlot.set(key, current);
  });

  const fallbackMeals = completedMeals
    .filter((meal) => !canonicalLogs.some((entry) => trackingMealIdentitiesMatch(meal, entry)))
    .map((meal) => ({
      mealId: cleanString(meal?.mealId || meal?.id, 100),
      mealType: cleanString(meal?.mealType || meal?.tipo || meal?.type, 60) || "otro",
      source: "completed_menu_fallback",
      totals: roundTrackingTotals(meal?.totals || meal),
      entries: [],
    }));

  const completedTotals = sumTrackingEntryTotals(completedMeals);
  const storedTotals = roundTrackingTotals(doc?.consumedTotals || {});
  const legacyOtherTotals = subtractTrackingTotals(storedTotals, completedTotals);
  const hasLegacyOther = Object.values(legacyOtherTotals).some((value) => Math.abs(Number(value) || 0) > 0.0001);
  const meals = [
    ...canonicalBySlot.values(),
    ...fallbackMeals,
    ...(hasLegacyOther ? [{
      mealId: "legacy_other",
      mealType: "otra",
      source: "legacy_tracking_fallback",
      totals: legacyOtherTotals,
      entries: [],
    }] : []),
  ];
  const totals = meals.reduce(
    (sum, meal) => addTrackingTotals(sum, meal.totals),
    emptyTrackingTotals()
  );
  const picoteo = meals
    .filter((meal) => String(meal.mealId).toLowerCase() === "picoteo")
    .reduce((sum, meal) => addTrackingTotals(sum, meal.totals), emptyTrackingTotals());

  return {
    totals,
    picoteo,
    meals,
    foodLogTotals: canonicalLogs.reduce(
      (sum, entry) => addTrackingTotals(sum, entry),
      emptyTrackingTotals()
    ),
    legacyFallbackTotals: meals
      .filter((meal) => meal.source !== "food_logs")
      .reduce((sum, meal) => addTrackingTotals(sum, meal.totals), emptyTrackingTotals()),
  };
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
  const usedIds = new Set();

  function nextMomentId() {
    let sequence = 1;
    while (usedIds.has(`manual_completion_moment_${sequence}`)) sequence += 1;
    return `manual_completion_moment_${sequence}`;
  }

  return {
    count,
    moments: Array.from({ length: count }, (_, index) => {
      const incoming = suppliedMoments[index] || previousMoments[index] || {};
      const suppliedId = cleanString(incoming.id, 80);
      const id = suppliedId && !usedIds.has(suppliedId) ? suppliedId : nextMomentId();
      usedIds.add(id);
      return {
        id,
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
    activationDate: entry.activationDate || null,
    menuSnapshot: {
      ...snapshot,
      totals: menuSnapshotTotals(snapshot),
    },
  };
}

function trackingPublic(doc = null, manualTrackingInput = null) {
  const suppliedFoodLogs = Array.isArray(manualTrackingInput) ? manualTrackingInput : null;
  const normalizedConsumption = suppliedFoodLogs === null
    ? null
    : resolveDailyConsumedNutrition(doc, suppliedFoodLogs);
  const manualTrackingTotals = suppliedFoodLogs === null
    ? manualTrackingInput
    : normalizedConsumption.foodLogTotals;
  if (!doc) {
    return {
      status: "pending",
      adherencePercent: null,
      reason: "",
      note: "",

      completedMenuMealIds: [],
      completedMenuMeals: [],
      targetMealIds: [],
      suppressedMenuMealIds: [],
      manualEntries: [],


      generatedRemainingMeals: [],
      mealReplacements: [],
      foodReplacements: [],
      consumedTotals: emptyTrackingTotals(),
      manualTrackingTotals: manualTrackingTotals ? roundTrackingTotals(manualTrackingTotals) : null,
      totalConsumedTotals: normalizedConsumption
        ? normalizedConsumption.totals
        : manualTrackingTotals ? roundTrackingTotals(manualTrackingTotals) : null,
      normalizedConsumedTotals: normalizedConsumption?.totals || null,
      normalizedConsumption,
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
  const resolvedTotalConsumedTotals = normalizedConsumption?.totals || totalConsumedTotals;
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
    nutritionAdherencePercent: resolvedTotalConsumedTotals
      ? ratioPercent(resolvedTotalConsumedTotals.kcal, targetTotals.kcal)
      : null,
    reason: cleanString(nutrition.reason || "", 120),
    note: cleanString(nutrition.note || "", 1000),
    selectedAlternative: nutrition.selectedAlternative || null,





completedMenuMealIds: completedMenuMeals
  .map((meal) => cleanString(meal.mealId, 100))
  .filter(Boolean),

completedMenuMeals,

targetMealIds: Array.isArray(doc.targetMealIds)
  ? [...new Set(
      doc.targetMealIds
        .map((id) => cleanString(id, 100).trim())
        .filter(Boolean)
    )].slice(0, 20)
  : [],

suppressedMenuMealIds: Array.isArray(doc.suppressedMenuMealIds)
  ? [...new Set(
      doc.suppressedMenuMealIds
        .map((id) => cleanString(id, 100).trim())
        .filter(Boolean)
    )].slice(0, 20)
  : [],

manualEntries: Array.isArray(doc.manualEntries)
  ? doc.manualEntries
  : [],




    manualEntries: Array.isArray(doc.manualEntries) ? doc.manualEntries : [],

    generatedRemainingMeals: Array.isArray(doc.generatedRemainingMeals) ? doc.generatedRemainingMeals : [],
    mealReplacements: Array.isArray(doc.mealReplacements) ? doc.mealReplacements : [],
    foodReplacements: Array.isArray(doc.foodReplacements) ? doc.foodReplacements : [],
    consumedTotals,
    manualTrackingTotals: hydratedManualTotals,
    totalConsumedTotals: resolvedTotalConsumedTotals,
    normalizedConsumedTotals: normalizedConsumption?.totals || null,
    normalizedConsumption,
    remainingTotals: doc.remainingTotals ? roundTrackingTotals(doc.remainingTotals) : null,
    ...completion,
    updatedAt: doc.updatedAt || null,
  };
}

function trackingWithoutOrphanedMenuPlan(doc = null) {
  if (!doc) return doc;
  const manualEntries = Array.isArray(doc.manualEntries) ? doc.manualEntries : [];
  const consumedTotals = sumTrackingEntryTotals(manualEntries);
  const targetTotals = roundTrackingTotals(doc.target || {});
  const hasManualConsumption = Object.values(consumedTotals).some((value) => value > 0);
  const nutrition = doc.nutrition || {};

  return {
    ...doc,
    completedMenuMeals: [],
    targetMealIds: [],
    suppressedMenuMealIds: [],
    generatedRemainingMeals: [],
    mealReplacements: [],
    foodReplacements: [],
    consumedTotals,
    remainingTotals: subtractTrackingTotals(targetTotals, consumedTotals),
    nutrition: {
      ...nutrition,
      status: hasManualConsumption
        ? deriveDailyTrackingStatus(consumedTotals, targetTotals, "pending")
        : "pending",
      adherencePercent: hasManualConsumption
        ? calculateDietAdherence(consumedTotals, targetTotals)
        : null,
      completedMealsCount: 0,
      totalMealsCount: 0,
      selectedAlternative: null,
    },
  };
}

export function clientMenuTrackingPermissions(user = {}) {
  const permissions = user?.clientPermissions || {};
  const menu = isPlainObject(permissions.menu) ? permissions.menu : {};
  const tracking = isPlainObject(permissions.tracking) ? permissions.tracking : {};
  const hasCoach = !!user?.coach?.entrenadorId;
  const activeSource = String(user?.menu?.activeSource || "none");
  const canViewAssignedMenus = activeSource === "own" ? true : hasCoach ? boolFrom(menu.canViewMenu, true) : true;
  const accessCapabilities = resolveClientAccessContext(user)?.capabilities || {};
  const canUseMenuAlternatives = canViewAssignedMenus && boolFrom(tracking.canUseMenuAlternatives, true);
  const canCreateEquivalentMeals =
    canUseMenuAlternatives &&
    boolFrom(tracking.canCreateEquivalentMeals, true) &&
    accessCapabilities.canUseEquivalences === true;
  const equivalentSettings = normalizeEquivalentTrackingSettings(tracking);
  const coachControlsNutrition = accessCapabilities.primaryAuthority === "coach";
  const canCreateMealTargets =
    !coachControlsNutrition &&
    accessCapabilities.canTrack !== false &&
    accessCapabilities.canUseMealTargets === true;

  return {
    canViewAssignedMenus,
    canMarkMenuMealsCompleted: canViewAssignedMenus && boolFrom(tracking.canMarkMenuMealsCompleted, true),
    canTrackFoods: canViewAssignedMenus && boolFrom(tracking.canTrackFoods, true),
    canCreateMealTargets,
    canCreateTrackingMealTargets: canCreateMealTargets,
    canAutoCompleteRemainingMeals: canViewAssignedMenus && accessCapabilities.canAutoCompleteRemainingMeals === true,
    canUseFlexibleMarginRecommendations:
      canViewAssignedMenus && accessCapabilities.canUseFlexibleMarginRecommendations === true,
    canUseManualDayCompletion:
      canViewAssignedMenus && accessCapabilities.canUseManualDayCompletion !== false,
    canPlanRemainingIntake:
      canViewAssignedMenus && accessCapabilities.canPlanRemainingIntake === true,
    canAutoCalculateTrackingQuantities:
      canViewAssignedMenus && accessCapabilities.canAutoCalculateTrackingQuantities === true,
    canUseMenuAlternatives,
    canCreateEquivalentMeals,
    canCreateEquivalentFoods: canCreateEquivalentMeals,
    canAutoCreateEquivalentMeals:
      canCreateEquivalentMeals && accessCapabilities.canAutoCalculateTrackingQuantities === true,
    equivalentMealFoodsLimit: canCreateEquivalentMeals
      ? Math.max(1, Number(accessCapabilities?.limits?.equivalentMealFoods) || 6)
      : 0,
    ...equivalentSettings,
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
    this.authActivityTouchScheduledAt = new Map();

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
    this.foodLogsService = new ServicioFoodLogs();
    this.accessAuditModel = new ModelMongoDBAccessAuditEvents();
    if (typeof this.accessAuditModel.ensureIndexes === "function") {
      this.accessAuditModel.ensureIndexes().catch(() => {});
    }
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
    this.clientCustomFoodsModel = new ModelMongoDBClientCustomFoods();
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
    requireCoachCanOfferService(coach, servicePackage);
    const serviceScopes = Array.isArray(invite.serviceScopes || invite.coachAccess?.serviceScopes) && (invite.serviceScopes || invite.coachAccess.serviceScopes).length
      ? (invite.serviceScopes || invite.coachAccess.serviceScopes).map((scope) => String(scope || "").trim().toLowerCase()).filter(Boolean)
      : ["training", "nutrition"];
    for (const scope of serviceScopes.filter((value) => ["training", "nutrition"].includes(value))) {
      requireProfessionalScope(coach, scope);
    }
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
  scheduleLoginMetadataUpdate = (userId, patch = {}) => {
    if (!userId || !patch || !Object.keys(patch).length) return;
    const timer = setTimeout(() => {
      void this._updateById(userId, patch).catch(() => {});
    }, 750);
    timer.unref?.();
  };

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

    this.scheduleLoginMetadataUpdate(user._id, { lastLoginAt: new Date() });
    return { user: this._buildCompatUser(user), token };
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
  touchLastActivity = async (userId, loadedUser = null) => {
    if (!userId) return null;

    if (typeof this.model.obtenerPorId !== "function") {
      console.warn("obtenerPorId no existe en el model actual");
      return null;
    }

    const user = loadedUser || await this.model.obtenerPorId(userId);
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

  scheduleAuthActivityTouch = (userId, loadedUser = null) => {
    const key = idToString(userId);
    if (!key) return;
    const now = Date.now();
    const previous = Number(this.authActivityTouchScheduledAt.get(key)) || 0;
    if (now - previous < 5 * 60 * 1000) return;
    this.authActivityTouchScheduledAt.set(key, now);
    if (this.authActivityTouchScheduledAt.size > 5000) {
      const oldest = this.authActivityTouchScheduledAt.keys().next().value;
      if (oldest) this.authActivityTouchScheduledAt.delete(oldest);
    }
    const timer = setTimeout(() => {
      void this.touchLastActivity(userId, loadedUser).catch(() => {});
    }, 750);
    timer.unref?.();
  };

  // -------------------------
  // GOOGLE LOGIN / REGISTER
  // -------------------------
  loginOrRegisterWithGoogle = async ({ email, googleId, nombre, apellido, avatarUrl }) => {
    if (!process.env.JWT_SECRET) throw new Error("Falta JWT_SECRET en .env");

    email = String(email || "").toLowerCase().trim();

    const [pending, existingUser] = await Promise.all([
      this.pendingModel.findByEmail(email),
      this._findUserByEmail(email),
    ]);
    if (pending) throw new Error("EMAIL_PENDIENTE");

    let userRaw = existingUser;

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
      if (!user.googleId && googleId) {
        await this._updateById(user._id, patch);
      } else {
        this.scheduleLoginMetadataUpdate(user._id, patch);
      }
    } catch {}

    const token = jwt.sign(
      { uid: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return {
      user: this._buildCompatUser(user),
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

  getByIdForAuth = async (id) => {
    if (typeof this.model.obtenerPorId !== "function") {
      throw new Error("El modelo no implementa obtenerPorId");
    }
    const user = await this.model.obtenerPorId(id);
    if (!user) return null;

    this.scheduleAuthActivityTouch(id, user);
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
    const routineInput = isPlainObject(permissions.routine) ? permissions.routine : {};
    const progressInput = isPlainObject(permissions.progress) ? permissions.progress : {};
    const trackingInput = isPlainObject(permissions.tracking) ? permissions.tracking : {};

    const specialties = coach?.coachProfile?.specialties || {};
    const features = effectiveCapabilities?.features || {};
    const trialExpired = !!effectiveCapabilities?.isTrialExpired;

    const menuFeatures = features?.menus || {};
    const routineFeatures = features?.routines || {};
    const metricFeatures = features?.metrics || {};

    const canMenu = !!specialties.nutrition && !trialExpired && anyTruthy(menuFeatures);
    const canRoutine = !!specialties.training && !trialExpired && anyTruthy(routineFeatures);
    const canProgress = (canMenu || canRoutine) && !trialExpired;
    const autonomy = resolveClientMenuAutonomyPermissions(permissions, effectiveCapabilities?.clientAutonomy || {});
    const menuInput = autonomy.menu;
    const autonomyTracking = autonomy.tracking;
    const canClientGenerateMenu = !!menuFeatures.automaticGenerator || !!menuFeatures.semiAutomaticBuilder;

    return {
      menu: {
        autonomyPreset: autonomy.preset,
        autonomySource: cleanString(permissions?.menu?.autonomySource, 40) || (
          Object.prototype.hasOwnProperty.call(permissions?.menu || {}, "autonomyPreset")
            ? "relationship_override"
            : "coach_plan_default"
        ),
        autonomyDefaultPreset: effectiveCapabilities?.clientAutonomy?.defaultPreset || "equivalences",
        availableAutonomyPresets: effectiveCapabilities?.clientAutonomy?.availablePresets || {},
        canViewMenu: canMenu && boolFrom(menuInput.canViewMenu, true),
        canEditPreferences: canMenu && boolFrom(menuInput.canEditPreferences, true),
        canUseLibrary: canMenu && menuInput.canUseLibrary === true,
        canCreateOwnMenu: canMenu && menuInput.canCreateOwnMenu === true,
        canActivateOwnMenuOverCoachPlan:
          canMenu && menuInput.canActivateOwnMenuOverCoachPlan === true,
        canUseAutomaticMenu:
          canMenu &&
          canClientGenerateMenu &&
          boolFrom(menuInput.canUseAutomaticMenu, false),
        canUseSemiAutomaticMenu:
          canMenu &&
          !!menuFeatures.semiAutomaticBuilder &&
          boolFrom(menuInput.canUseSemiAutomaticMenu, false),
        canRequestMenuChanges: canMenu && boolFrom(menuInput.canRequestMenuChanges, true),
      },
      tracking: {
        canTrackFoods: canMenu && boolFrom(autonomyTracking.canTrackFoods, true),
        canUseMenuAlternatives: canMenu && boolFrom(autonomyTracking.canUseMenuAlternatives, true),
        canCreateEquivalentMeals: canMenu && boolFrom(autonomyTracking.canCreateEquivalentMeals, true),
        ...normalizeEquivalentTrackingSettings(trackingInput),
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

  _activateAcceptedCoachInvitation = async ({
    client,
    invitation,
    acceptance,
    actorType = "client",
    actorId = null,
  }) => {
    const coach = acceptance?.coach;
    if (!coach || !acceptance?.activeCoachAccess || !acceptance?.coachAssignment) {
      throw new Error("INVITATION_NOT_FOUND");
    }
    const resolvedCoachId = coach._id || coach.id || invitation?.assignedCoachId;
    const nextCoachId = idToString(acceptance.coachAssignment.entrenadorId);
    const clientId = client?._id || client?.id;
    const currentCoachId = activeCoachIdFromUser(client);
    if (currentCoachId && currentCoachId !== nextCoachId) {
      throw new Error("CLIENT_ALREADY_HAS_ACTIVE_COACH");
    }
    if (currentCoachId === nextCoachId && String(client?.coachAccess?.status || "") === "active") {
      throw new Error("CLIENT_ALREADY_ACTIVE_WITH_COACH");
    }
    if (await this.clientCoachBlocksModel.isBlocked({ clientId, coachId: nextCoachId })) {
      throw new Error("COACH_BLOCKED_BY_CLIENT");
    }

    requireCoachCanOfferService(coach, acceptance.activeCoachAccess.servicePackage);
    const currentActiveClients = await this._countClientsForCoach(resolvedCoachId);
    const effectiveCapabilities = acceptance.effectiveCapabilities || await this._resolveEffectiveCapabilities(coach, {
      currentClients: currentActiveClients,
    });
    const capacity = await this.coachCapacityModel.reserveSlot({
      coachId: resolvedCoachId,
      invitationId: invitation._id || invitation.id,
      clientId,
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
      coachAccess: { ...acceptance.activeCoachAccess, startedAt: now, updatedAt: now },
      clientPermissions: acceptance.clientPermissions,
      updatedAt: now,
    };

    if (!client?.onboarding?.done) {
      patch.onboarding = this._onboardingFromCoachInvite(
        isPlainObject(invitation?.onboarding) ? invitation.onboarding : { enabled: false, mode: "none" },
        now
      );
    }
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
      updated = await this.updateById(clientId, patch);
      activatedInvite = await this.invitedModel.updateById(invitation._id || invitation.id, {
        status: "active",
        acceptedUserId: toMongoIdOrString(updated?._id || updated?.id || clientId),
        acceptedAt: invitation.acceptedAt || now,
        activatedAt: now,
        updatedAt: now,
      });
    } catch (error) {
      await this.coachCapacityModel.releaseSlot({
        coachId: resolvedCoachId,
        invitationId: invitation._id || invitation.id,
        clientId,
        now: new Date(),
      });
      throw error;
    }

    await recordAccessAuditEvent({
      subjectType: "client",
      subjectId: updated?._id || updated?.id || clientId,
      actorType,
      actorId: actorId || updated?._id || updated?.id || clientId,
      event: "coach_access_activated",
      previousValue: {
        coachAccess: client?.coachAccess || null,
        personalSubscription: client?.personalSubscription || null,
      },
      nextValue: {
        coachAccess: patch.coachAccess,
        personalSubscription: patch.personalSubscription || client?.personalSubscription || null,
      },
      reason: actorType === "client" ? "client_accepted_coach_invitation" : "coach_activated_legacy_invitation",
      metadata: {
        invitationId: invitation?._id || invitation?.id || null,
        servicePackage: patch.coachAccess?.servicePackage || null,
        automaticActivation: actorType === "client",
      },
    });
    await recordAccessAuditEvent({
      subjectType: "coach",
      subjectId: resolvedCoachId,
      actorType: "client",
      actorId: updated?._id || updated?.id || clientId,
      event: "client_invitation_accepted",
      dedupeKey: `coach-invite-active:${idToString(invitation?._id || invitation?.id)}`,
      notificationVisible: true,
      notificationImmediate: true,
      reason: "client_accepted_and_linked",
      metadata: {
        invitationId: invitation?._id || invitation?.id || null,
        clientId: idToString(updated?._id || updated?.id || clientId),
      },
    });

    if (patch.personalSubscription?.status) {
      await recordAccessAuditEvent({
        subjectType: "client",
        subjectId: updated?._id || updated?.id || clientId,
        actorType: "system",
        actorId: null,
        event: "personal_renewal_suppressed",
        previousValue: { personalSubscription: client?.personalSubscription || null },
        nextValue: { personalSubscription: patch.personalSubscription },
        reason: "coach_access_primary",
        metadata: { coachId: resolvedCoachId },
      });
    }

    return {
      user: updated,
      client: updated,
      invitation: this._publicCoachClientInvitation(activatedInvite || invitation, coach),
      coach,
      status: "active",
      capacity,
    };
  };

  clientAcceptCoachInvitation = async ({ userId, invitationId }) => {
    const user = await this.getById(userId);
    if (!user) throw new Error("NOT_FOUND");
    if (!this._isClientUser(user)) throw new Error("USER_NOT_CLIENT");

    const invite = await this._getPendingCoachClientInvitationForUser(user, invitationId);
    const acceptance = await this._prepareCoachClientInviteAcceptance(invite);
    if (!acceptance?.activeCoachAccess) throw new Error("INVITATION_NOT_FOUND");

    const currentCoachId = activeCoachIdFromUser(user);
    const nextCoachId = idToString(acceptance.coachAssignment.entrenadorId);
    if (currentCoachId) {
      throw new Error("CLIENT_ALREADY_HAS_ACTIVE_COACH");
    }
    if (await this.clientCoachBlocksModel.isBlocked({ clientId: user._id || user.id || userId, coachId: nextCoachId })) {
      throw new Error("COACH_BLOCKED_BY_CLIENT");
    }
    const now = new Date();
    const activation = await this._activateAcceptedCoachInvitation({
      client: user,
      invitation: invite,
      acceptance,
      actorType: "client",
      actorId: user._id || user.id || userId,
    });
    const updated = activation.user;
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

    return {
      ...activation,
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

    const client = invitation.acceptedUserId
      ? await this.getById(invitation.acceptedUserId)
      : await this._findUserByEmail(invitation.email);
    if (!client) throw new Error("NOT_FOUND");
    if (!this._isClientUser(client)) throw new Error("USER_NOT_CLIENT");
    return await this._activateAcceptedCoachInvitation({
      client,
      invitation,
      acceptance,
      actorType: "coach",
      actorId: resolvedCoachId,
    });
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
    // Los alimentos privados no se transfieren ni quedan huerfanos: pertenecen
    // exclusivamente al cliente que los creo.
    const customFoodsDeleted = normalizeRole(user.role) === "cliente"
      ? await this.clientCustomFoodsModel.deleteByOwner(id)
      : { deletedCount: 0 };
    const result = await this.model.borrarUsuario(id);
    return {
      deleted: true,
      role: user.role,
      unassignedClients,
      customFoodsDeleted: Number(customFoodsDeleted?.deletedCount) || 0,
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
      clientAutonomy: {
        ...(user?.coachOverrides?.clientAutonomy || {}),
        ...(sanitizedPayload?.clientAutonomy || {}),
        availablePresets: {
          ...(user?.coachOverrides?.clientAutonomy?.availablePresets || {}),
          ...(sanitizedPayload?.clientAutonomy?.availablePresets || {}),
        },
      },
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

  _startReadOnlyImpersonation = async ({ actor, actorType, target }) => {
    if (!process.env.JWT_SECRET) throw new Error("Falta JWT_SECRET en .env");
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
        adminId: actorType === "admin" ? actor._id : null,
        actorType,
        actorId: actor._id || actor.id,
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
        actorId: actor._id || actor.id,
        actorRole: actorType,
        actorAdminId: actorType === "admin" ? (actor._id || actor.id) : null,
        actorCoachId: actorType === "coach" ? (actor._id || actor.id) : null,
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
      actorId: actor._id || actor.id,
      actorRole: actorType,
      actorAdminId: actorType === "admin" ? (actor._id || actor.id) : null,
      actorCoachId: actorType === "coach" ? (actor._id || actor.id) : null,
      targetUser: this._sanitizeUser(targetWithCapabilities),
    };
  };

  adminStartImpersonation = async ({ adminId, targetUserId }) => {
    const admin = await this.getById(adminId);
    if (!admin) throw new Error("NOT_FOUND");
    if (normalizeRole(admin?.role) !== "admin") throw new Error("ADMIN_REQUIRED");
    const target = await this.getById(targetUserId);
    if (!target) throw new Error("NOT_FOUND");
    return await this._startReadOnlyImpersonation({ actor: admin, actorType: "admin", target });
  };

  coachStartClientImpersonation = async ({ coachId, clientId }) => {
    const { coach, client } = await this._getCoachClientPair({ coachId, clientId });
    if (activeCoachIdFromUser(client) !== idToString(coach._id || coach.id || coachId)) {
      throw new Error("CLIENT_NOT_ASSIGNED_TO_COACH");
    }
    return await this._startReadOnlyImpersonation({ actor: coach, actorType: "coach", target: client });
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
        actorType: impersonation.impersonationActorRole || (impersonation.actorAdminId ? "admin" : "coach"),
        actorId: impersonation.impersonationActorId || impersonation.actorAdminId || impersonation.actorCoachId,
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
      actorCoachId: impersonation.actorCoachId || null,
      actorId: impersonation.impersonationActorId || impersonation.actorAdminId || impersonation.actorCoachId || null,
      actorRole: impersonation.impersonationActorRole || (impersonation.actorAdminId ? "admin" : "coach"),
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
    const recalculation = isPlainObject(incoming?.recalculation) ? incoming.recalculation : {};
    const shouldUpdateProfile = recalculation.mode === "update_data" && recalculation.confirmProfileUpdate === true;
    const weightPatch = shouldUpdateProfile && (recalculation.weightKg !== undefined || recalculation.pesoKg !== undefined)
      ? buildSelfWeightProgressPatch(user, recalculation, { now })
      : null;
    const nextProfile = shouldUpdateProfile && recalculation.activity !== undefined
      ? {
          ...(user?.profile || {}),
          basics: {
            ...(user?.profile?.basics || {}),
            actividadDiaria: cleanString(recalculation.activity, 80) || null,
          },
        }
      : null;

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
    const weeklyPlanUsesAdvancedTargets = normalizedWeeklyPlan && (
      normalizedWeeklyPlan.mode !== "same_all_days" ||
      normalizedWeeklyPlan.balanceEnabled === true ||
      weeklyPlanHasValues(normalizedWeeklyPlan)
    );
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

    if (previousSignature === nextSignature && !weeklyPlanChanged && !weightPatch && !nextProfile) {
      return user;
    }

    const goalsAccess = nutritionChanged ? getGoalsChangeStatus(user, { actorType: "client", now }) : null;
    if (nutritionChanged) requireGoalsChangeAllowed(user, { actorType: "client", now });
    if (trainingChanged) requireCoachAuthority(user, "training");

    const updated = await this.updateById(userId, {
      ...(trainingChanged ? { goal: nextGoal } : {}),
      ...(nutritionChanged ? { metasActuales: nextMetas } : {}),
      ...(nextMenu ? { menu: nextMenu } : {}),
      ...(weightPatch ? {
        progress: weightPatch.progress,
        antropometriaActual: weightPatch.antropometriaActual,
        stats: weightPatch.stats,
      } : {}),
      ...(nextProfile ? { profile: nextProfile } : {}),
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

  clientPreviewNutrition = async ({ userId, payload = {} }) => {
    const user = await this.getById(userId);
    if (!user) throw new Error("NOT_FOUND");
    if (!this._isClientUser(user)) throw new Error("USER_NOT_CLIENT");
    const basics = user?.profile?.basics || {};
    const incoming = isPlainObject(payload?.data) ? payload.data : payload;
    const input = {
      birthDate: incoming.birthDate ?? incoming.fechaNacimiento ?? basics.fechaNacimiento,
      age: incoming.age,
      sex: incoming.sex ?? incoming.sexo ?? incoming.genero ?? basics.genero,
      weightKg: incoming.weightKg ?? incoming.pesoKg ?? user?.antropometriaActual?.pesoKg,
      heightCm: incoming.heightCm ?? incoming.alturaCm ?? user?.antropometriaActual?.alturaCm,
      activityFactor: incoming.activityFactor ?? incoming.factorActividad ?? basics.factorActividad,
      activity: incoming.activity ?? incoming.actividadDiaria ?? basics.actividadDiaria,
      exerciseFrequency: incoming.exerciseFrequency ?? incoming.frecuenciaEjercicio ?? basics.frecuenciaEjercicio,
      goalType: incoming.goalType ?? incoming.objetivo ?? user?.goal?.type,
      targetWeightKg: incoming.targetWeightKg ?? incoming.pesoObjetivoKg,
      ratePctBWPerWeek: incoming.ratePctBWPerWeek ?? incoming.ritmoPctPesoSemanal,
      maintenanceKcalOverride: incoming.maintenanceKcalOverride ?? incoming.tdeeCustom,
    };
    const preview = payload?.purpose === "maintenance"
      ? calculateMaintenancePreview(input)
      : calculateNutritionGoalPreview(input);
    return { user, preview };
  };

  getMyProgress = async (userId) => {
    const user = await this.getById(userId);
    if (!user) throw new Error("NOT_FOUND");
    if (!this._isClientUser(user)) throw new Error("USER_NOT_CLIENT");
    const checkins = sortProgressCheckins(Array.isArray(user?.progress?.checkins) ? user.progress.checkins : []);
    return {
      checkins,
      summary: summarizeProgress(checkins),
      antropometriaActual: user?.antropometriaActual || {},
      goal: user?.goal || {},
    };
  };

  upsertMyWeight = async (userId, payload = {}) => {
    const user = await this.getById(userId);
    if (!user) throw new Error("NOT_FOUND");
    if (!this._isClientUser(user)) throw new Error("USER_NOT_CLIENT");
    const now = new Date();
    const patch = buildSelfWeightProgressPatch(user, payload, { now });
    const updated = await this.updateById(userId, {
      progress: patch.progress,
      antropometriaActual: patch.antropometriaActual,
      stats: patch.stats,
      updatedAt: now,
    });
    await recordAccessAuditEvent({
      subjectType: "client",
      subjectId: user._id || user.id || userId,
      actorType: "client",
      actorId: user._id || user.id || userId,
      event: patch.created ? "self_weight_created" : "self_weight_updated",
      previousValue: { weightKg: user?.antropometriaActual?.pesoKg ?? null },
      nextValue: { weightKg: patch.record.weightKg, date: patch.record.date },
      reason: "client_progress_weight",
      metadata: { idempotentDateKey: patch.record.date },
    });
    return { user: updated, record: patch.record, created: patch.created };
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

  adminUpdateClientMenuAutonomy = async ({ clientId, preset = null, adminId = null }) => {
    const client = await this.getById(clientId);
    if (!client) throw new Error("NOT_FOUND");
    if (!this._isClientUser(client)) throw new Error("USER_NOT_CLIENT");
    const coachId = activeCoachIdFromUser(client);
    if (!coachId) throw new Error("COACH_CLIENT_RELATION_REQUIRED");
    const coach = await this.getById(coachId);
    if (!coach || !this._isCoachUser(coach)) throw new Error("COACH_NOT_FOUND");
    const effectiveCapabilities = await this._resolveEffectiveCapabilities(coach);
    const requestedPreset = preset
      ? normalizeClientMenuAutonomyPreset(preset, "view_only")
      : effectiveCapabilities?.clientAutonomy?.defaultPreset || "equivalences";
    if (effectiveCapabilities?.clientAutonomy?.availablePresets?.[requestedPreset] === false) {
      throw new Error("CLIENT_AUTONOMY_PRESET_NOT_AVAILABLE");
    }
    const nextPermissions = this._sanitizeClientPermissionsForCoach(coach, effectiveCapabilities, {
      ...(client?.clientPermissions || {}),
      menu: {
        ...(client?.clientPermissions?.menu || {}),
        autonomyPreset: requestedPreset,
      },
    });
    nextPermissions.menu.autonomySource = preset ? "relationship_override" : "coach_plan_default";
    nextPermissions.menu.autonomyDefaultPreset = effectiveCapabilities?.clientAutonomy?.defaultPreset || "equivalences";
    nextPermissions.menu.availableAutonomyPresets = effectiveCapabilities?.clientAutonomy?.availablePresets || {};
    const updated = await this.updateById(clientId, { clientPermissions: nextPermissions, updatedAt: new Date() });
    await recordAccessAuditEvent({
      subjectType: "client",
      subjectId: clientId,
      actorType: "admin",
      actorId: adminId,
      event: "client_menu_autonomy_updated_by_admin",
      previousValue: { clientPermissions: client?.clientPermissions || {} },
      nextValue: { clientPermissions: nextPermissions },
      reason: preset ? "relationship_override" : "restore_coach_plan_default",
      metadata: { coachId, preset: requestedPreset },
    });
    return await this._withEffectiveCapabilities(updated);
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

  async _validatedCoachAssignedMenusByDay(coach, value = {}, client = null) {

      console.log(
    "🔥 ASSIGNED RAW:",
    JSON.stringify(value, null, 2)
  );
    const normalized = normalizeAssignedMenusByDay(value);

      console.log(
    "🔥 ASSIGNED NORMALIZED:",
    JSON.stringify(normalized, null, 2)
  );
    const coachId = idToString(coach?._id || coach?.id);
    const clientId = idToString(client?._id || client?.id);
    const capabilities = resolveProfessionalLibraryCapabilities(coach);
    const baseCache = new Map();
    const assignedCache = new Map();

    const validateEntry = async (entry, fallbackSource = "base", dayKey = "") => {
        console.log("🔥 VALIDATE ENTRY:", dayKey, entry);
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
      if (!base && fallbackSource === "base" && clientId && typeof this.menusModel.getAssignedById === "function") {
        let assigned = assignedCache.get(baseId);
        if (assigned === undefined) {
          assigned = await this.menusModel.getAssignedById(baseId);
          assignedCache.set(baseId, assigned || null);
        }
        if (assigned) {
          const belongsToPair =
            idToString(assigned.clienteId || assigned.clientId) === clientId &&
            idToString(assigned.coachId || assigned.entrenadorId) === coachId;
          if (!belongsToPair || assigned.estado !== "activo" || assigned.activa === false) {
            throw new Error("FORBIDDEN");
          }
          const day = getWeekDayMeta(dayKey);
          const snapshotSource = menuDocSnapshotForDay(assigned, day, "coach") || assigned;
          const menuSnapshot = normalizeWeeklyMenuSnapshot(snapshotSource);
          if (!menuSnapshot?.meals?.length) throw new Error("MENU_NO_ENCONTRADO");
          return {
            menuId: baseId,
            menuSnapshot,
            source: "coach_assigned_legacy",
            ...normalizeAssignedMenuPlanningMeta(entry),
            assignedAt: entry.assignedAt ? new Date(entry.assignedAt) : new Date(),
          };
        }
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
      const primaryMenu = await validateEntry(dayEntry.primaryMenu || dayEntry, "base", day);
      const alternatives = [];
      for (const alternative of dayEntry.alternatives || []) {
        const checked = await validateEntry(alternative, "alternative", day);
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
    const hasWeeklyGoalsPayload = [
      "mode",
      "caloriesByDay",
      "macrosByDay",
      "trainingDays",
      "balanceEnabled",
    ].some((field) => Object.prototype.hasOwnProperty.call(weeklyPlan, field));
    if (hasWeeklyGoalsPayload) {
      const mergedWeeklyGoals = {
        ...(client?.menu?.weeklyPlan || {}),
        ...weeklyPlan,
      };
      if (!Object.prototype.hasOwnProperty.call(weeklyPlan, "mode")) {
        const hasDailyOverrides =
          Object.keys(weeklyPlan.caloriesByDay || {}).length > 0 ||
          Object.keys(weeklyPlan.macrosByDay || {}).length > 0;
        if (
          hasDailyOverrides &&
          (!mergedWeeklyGoals.mode || mergedWeeklyGoals.mode === "same_all_days")
        ) mergedWeeklyGoals.mode = "per_day";
      }
      const normalizedWeeklyGoals = normalizeWeeklyGoalsPayload(mergedWeeklyGoals);
      Object.assign(weeklyPlanPatch, {
        mode: normalizedWeeklyGoals.mode,
        caloriesByDay: normalizedWeeklyGoals.caloriesByDay,
        macrosByDay: normalizedWeeklyGoals.macrosByDay,
        trainingDays: normalizedWeeklyGoals.trainingDays,
        balanceEnabled: normalizedWeeklyGoals.balanceEnabled,
      });
    }
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

  coachPreviewClientNutrition = async ({ coachId, clientId, payload = {} }) => {
    const { coach, client } = await this._getCoachClientPair({ coachId, clientId });
    this._assertNutritionEditAllowed(coach);
    const basics = client?.profile?.basics || {};
    const incoming = isPlainObject(payload?.data) ? payload.data : payload;
    const preview = calculateNutritionGoalPreview({
      birthDate: incoming.birthDate ?? incoming.fechaNacimiento ?? basics.fechaNacimiento,
      age: incoming.age,
      sex: incoming.sex ?? incoming.sexo ?? incoming.genero ?? basics.genero,
      weightKg: incoming.weightKg ?? incoming.pesoKg ?? client?.antropometriaActual?.pesoKg,
      heightCm: incoming.heightCm ?? incoming.alturaCm ?? client?.antropometriaActual?.alturaCm,
      activityFactor: incoming.activityFactor ?? incoming.factorActividad ?? basics.factorActividad,
      activity: incoming.activity ?? incoming.actividadDiaria ?? basics.actividadDiaria,
      exerciseFrequency: incoming.exerciseFrequency ?? incoming.frecuenciaEjercicio ?? basics.frecuenciaEjercicio,
      goalType: incoming.goalType ?? incoming.objetivo ?? client?.goal?.type,
      targetWeightKg: incoming.targetWeightKg ?? incoming.pesoObjetivoKg,
      ratePctBWPerWeek: incoming.ratePctBWPerWeek ?? incoming.ritmoPctPesoSemanal,
      maintenanceKcalOverride: incoming.maintenanceKcalOverride ?? incoming.tdeeCustom,
    });
    return { coach, client, preview };
  };

  coachUpdateClientOnboarding = async ({ coachId, clientId, payload = {} }) => {
    const { coach, client } = await this._getCoachClientPair({ coachId, clientId });
    this._assertNutritionEditAllowed(coach);
    const incoming = isPlainObject(payload?.onboarding) ? payload.onboarding : payload;
    const currentBasics = client?.profile?.basics || {};
    const nextBasics = { ...currentBasics };
    const currentAnthro = client?.antropometriaActual || {};
    const changedFields = [];
    const has = (key) => Object.prototype.hasOwnProperty.call(incoming, key);
    const setChanged = (label, previous, next, apply) => {
      if (previous !== undefined && previous !== null && String(previous) !== String(next)) changedFields.push(label);
      apply(next);
    };

    if (has("fechaNacimiento") || has("birthDate")) {
      const value = cleanString(incoming.fechaNacimiento ?? incoming.birthDate, 20);
      if (!ageFromBirthDate(value)) throw new Error("FECHA_NACIMIENTO_INVALIDA");
      setChanged("fecha de nacimiento", currentBasics.fechaNacimiento, value, (next) => { nextBasics.fechaNacimiento = next; });
    }
    if (has("genero") || has("sexo") || has("sex")) {
      const value = cleanString(incoming.genero ?? incoming.sexo ?? incoming.sex, 30).toLowerCase();
      if (!["masculino", "femenino", "prefiero_no_decir"].includes(value)) throw new Error("SEXO_INVALIDO");
      setChanged("sexo", currentBasics.genero, value, (next) => { nextBasics.genero = next; });
    }
    let heightCm = currentAnthro.alturaCm;
    if (has("alturaCm") || has("heightCm")) {
      const value = Number(incoming.alturaCm ?? incoming.heightCm);
      if (!Number.isFinite(value) || value < 120 || value > 230) throw new Error("ALTURA_INVALIDA");
      setChanged("altura", currentAnthro.alturaCm, value, (next) => { heightCm = next; });
    }
    let weightKg = currentAnthro.pesoKg;
    if (has("pesoKg") || has("weightKg")) {
      const value = Number(incoming.pesoKg ?? incoming.weightKg);
      if (!Number.isFinite(value) || value < 30 || value > 250) throw new Error("PESO_INVALIDO");
      setChanged("peso", currentAnthro.pesoKg, value, (next) => { weightKg = next; });
    }
    if (has("actividadDiaria") || has("activity")) {
      const value = cleanString(incoming.actividadDiaria ?? incoming.activity, 40);
      if (value) {
        if (!["sedentario", "none", "ligero", "moderado", "activo", "muy_activo"].includes(value)) throw new Error("ACTIVIDAD_INVALIDA");
        setChanged("actividad diaria", currentBasics.actividadDiaria, value, (next) => { nextBasics.actividadDiaria = next; });
      }
    }
    if (has("frecuenciaEjercicio") || has("exerciseFrequency")) {
      const value = cleanString(incoming.frecuenciaEjercicio ?? incoming.exerciseFrequency, 30);
      if (value) {
        if (!["none", "0", "1_3", "4_6", "7_plus"].includes(value)) throw new Error("FRECUENCIA_EJERCICIO_INVALIDA");
        setChanged("frecuencia de ejercicio", currentBasics.frecuenciaEjercicio, value, (next) => { nextBasics.frecuenciaEjercicio = next; });
      }
    }
    const explicitFactor = incoming.factorActividad ?? incoming.activityFactor;
    const factorActividad = calculateActivityFactor({
      factor: explicitFactor ?? nextBasics.factorActividad,
      actividadDiaria: nextBasics.actividadDiaria,
      frecuenciaEjercicio: nextBasics.frecuenciaEjercicio,
    });
    if ((has("factorActividad") || has("activityFactor")) && factorActividad === null) throw new Error("ACTIVIDAD_INVALIDA");
    if (factorActividad !== null) {
      setChanged("factor de actividad", currentBasics.factorActividad, factorActividad, (next) => { nextBasics.factorActividad = next; });
    }

    const nextGoal = { ...(client?.goal || {}) };
    if (has("objetivo") || has("goalType")) {
      const value = cleanString(incoming.objetivo ?? incoming.goalType, 60);
      if (value) setChanged("objetivo", client?.goal?.type, value, (next) => { nextGoal.type = next; });
    }
    if (changedFields.length && payload.confirmExisting !== true && incoming.confirmExisting !== true) {
      const error = new Error("ONBOARDING_CONFIRMATION_REQUIRED");
      error.changedFields = [...new Set(changedFields)];
      throw error;
    }

    const preview = calculateNutritionGoalPreview({
      birthDate: nextBasics.fechaNacimiento,
      sex: nextBasics.genero,
      weightKg,
      heightCm,
      activityFactor: nextBasics.factorActividad,
      goalType: nextGoal.type,
    });
    const complete = payload.complete === true || incoming.complete === true;
    if (complete && !preview.ready) {
      const error = new Error("ONBOARDING_DATA_INCOMPLETE");
      error.missingFields = preview.missingFields;
      throw error;
    }

    const now = new Date();
    const coachObjectId = toMongoIdOrString(coach._id || coach.id || coachId);
    const patch = {
      profile: { ...(client?.profile || {}), basics: nextBasics },
      antropometriaActual: {
        ...currentAnthro,
        alturaCm: heightCm ?? null,
        pesoKg: weightKg ?? null,
        updatedAt: now,
        updatedByCoachId: coachObjectId,
      },
      goal: { ...nextGoal, updatedAt: now, updatedByCoachId: coachObjectId },
      onboarding: {
        ...(client?.onboarding || {}),
        enabled: true,
        done: complete ? true : client?.onboarding?.done === true,
        step: complete ? 3 : Math.max(1, Number(client?.onboarding?.step) || 1),
        startedAt: client?.onboarding?.startedAt || now,
        completedAt: complete ? now : (client?.onboarding?.completedAt || null),
        updatedAt: now,
        updatedByCoachId: coachObjectId,
        source: "coach",
      },
      updatedAt: now,
    };
    const updated = await this.updateById(clientId, patch);
    await recordAccessAuditEvent({
      subjectType: "client",
      subjectId: clientId,
      actorType: "coach",
      actorId: coachObjectId,
      event: complete ? "onboarding_completed_by_coach" : "onboarding_updated_by_coach",
      previousValue: { profile: client?.profile || {}, antropometriaActual: currentAnthro, goal: client?.goal || {} },
      nextValue: { profile: patch.profile, antropometriaActual: patch.antropometriaActual, goal: patch.goal },
      reason: "coach_manage_client_onboarding",
      metadata: { changedFields: [...new Set(changedFields)], complete },
    });
    return { coach, client: updated, preview };
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
    const hasMealTargetsByDay = Object.prototype.hasOwnProperty.call(weeklyPlan, "mealTargetsByDay");
    const hasMealTargetDayPatch = Object.prototype.hasOwnProperty.call(weeklyPlan, "mealTargetDay");
    if (hasMealTargetsByDay && hasMealTargetDayPatch) throw new Error("MEAL_TARGET_PLAN_INVALID");
    const nutritionWeek = resolveClientNutritionWeek(client);
    const mealTargetsByDay = hasMealTargetsByDay
      ? normalizeWeeklyMealTargetsByDay(weeklyPlan.mealTargetsByDay, nutritionWeek)
      : null;
    const mealTargetDayPatch = hasMealTargetDayPatch
      ? normalizeWeeklyMealTargetDayPatch(weeklyPlan.mealTargetDay, nutritionWeek)
      : null;
    let nextMealTargetsByDay = mealTargetsByDay;
    if (mealTargetDayPatch) {
      nextMealTargetsByDay = { ...(current?.weeklyPlan?.mealTargetsByDay || {}) };
      if (mealTargetDayPatch.plan === null) delete nextMealTargetsByDay[mealTargetDayPatch.dayKey];
      else nextMealTargetsByDay[mealTargetDayPatch.dayKey] = mealTargetDayPatch.plan;
    }
    const assignedMenusByDay = isPlainObject(weeklyPlan?.assignedMenusByDay)
      ? await this._validatedCoachAssignedMenusByDay(coach, weeklyPlan.assignedMenusByDay, client)
      : null;
    const trackingPermissionsInput = isPlainObject(payload?.clientPermissions?.tracking)
      ? payload.clientPermissions.tracking
      : null;
    const menuPermissionsInput = isPlainObject(payload?.clientPermissions?.menu)
      ? payload.clientPermissions.menu
      : null;
    const hasPermissionPatch = !!trackingPermissionsInput || !!menuPermissionsInput;
    const rawPermissionPatch = hasPermissionPatch
      ? {
          ...(client?.clientPermissions || {}),
          menu: {
            ...(client?.clientPermissions?.menu || {}),
            ...(menuPermissionsInput || {}),
          },
          tracking: {
            ...(client?.clientPermissions?.tracking || {}),
            ...(trackingPermissionsInput || {}),
          },
        }
      : null;
    const nextClientPermissions = rawPermissionPatch
      ? this._sanitizeClientPermissionsForCoach(
          coach,
          coach?.effectiveCapabilities || await this._resolveEffectiveCapabilities(coach),
          rawPermissionPatch
        )
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
        ...(nextMealTargetsByDay ? { mealTargetsByDay: nextMealTargetsByDay } : {}),
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
      ...(nextClientPermissions ? { clientPermissions: nextClientPermissions } : {}),
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

  _resolveClientNutritionTargetForDate = async (user, date) => {
    const nutritionWeek = resolveClientNutritionWeek(user);
    const dayKey = dayKeyFromDate(date);
    const baseTarget = nutritionWeek.targets[dayKey] || null;
    if (!nutritionWeek.balanceEnabled || !baseTarget) {
      return { target: baseTarget, baseTarget: null, weeklyBalance: null };
    }
    const weekStart = mondayOfWeek(date);
    const baseTargetByDate = new Map(WEEKLY_MENU_DAY_META.map((day, index) => [
      addDaysIso(weekStart, index),
      nutritionWeek.targets[day.key],
    ]));
    const logs = date > weekStart
      ? await this.foodLogsModel.listLogsByUserDateRange(user?._id || user?.id, weekStart, date)
      : [];
    const byDate = trackingLogsByDate(logs);
    const consumptionByDate = new Map(
      [...byDate.entries()]
        .filter(([logDate, entries]) => logDate < date && entries.length > 0)
        .map(([logDate, entries]) => [
          logDate,
          { tracked: true, ...resolveDailyConsumedNutrition(null, entries).totals },
        ])
    );
    const unrestricted = resolveUnrestrictedTarget({
      date,
      baseTarget,
      baseTargetByDate,
      consumptionByDate,
      closedBeforeDate: date > localDateKey() ? localDateKey() : date,
    });
    return {
      target: unrestricted.target,
      baseTarget,
      weeklyBalance: unrestricted.balance,
    };
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
    const [docs, foodLogs, activePlan] = await Promise.all([
      this.menuTrackingModel.listByUserDateRange(userId, start, end),
      this.foodLogsModel.listLogsByUserDateRange(userId, start, end),
      this._resolveClientMenuPlan(user),
    ]);
    const trackingByDate = new Map((docs || []).map((doc) => [String(doc.date), doc]));
    const trackingLogsByDay = trackingLogsByDate(foodLogs);
    const nutritionWeek = resolveClientNutritionWeek(user);
    const assignments = normalizeAssignedMenusByDay(activePlan.assignments || {});
    const publicTrackingByDate = new Map();
    const consumptionByDate = new Map();
    WEEKLY_MENU_DAY_META.forEach((day, index) => {
      const date = addDaysIso(start, index);
      const storedTracking = trackingByDate.get(date);
      const dayLogs = trackingLogsByDay.get(date) || [];
      const assignment = activePlanAssignmentForDate(activePlan, assignments, day.key, date);
      const assignedMenu = assignment?.primaryMenu || assignment || null;
      const hasAvailableMenuPlan = Boolean(
        storedTracking?.dayPlanOverride?.menuSnapshot || assignedMenu?.menuSnapshot
      );
      const visibleTrackingDoc = hasAvailableMenuPlan
        ? storedTracking
        : trackingWithoutOrphanedMenuPlan(storedTracking);
      const tracking = trackingPublic(visibleTrackingDoc, dayLogs);
      const tracked = dayLogs.length > 0 || (
        Boolean(visibleTrackingDoc) && (
          tracking.status !== "pending" ||
          tracking.completedMenuMeals?.length > 0 ||
          tracking.manualEntries?.length > 0
        )
      );
      publicTrackingByDate.set(date, tracking);
      if (tracked) {
        consumptionByDate.set(date, {
          tracked: true,
          ...(tracking.totalConsumedTotals || tracking.consumedTotals || emptyTrackingTotals()),
        });
      }
    });
    const baseTargetByDate = new Map(WEEKLY_MENU_DAY_META.map((day, index) => [
      addDaysIso(start, index),
      nutritionWeek.targets[day.key],
    ]));

    const days = WEEKLY_MENU_DAY_META.map((day, index) => {
      const date = addDaysIso(start, index);
      const storedTracking = trackingByDate.get(date);
      const assignment = activePlanAssignmentForDate(activePlan, assignments, day.key, date);
      const dayOverride = storedTracking?.dayPlanOverride || null;
      const primary = assignedMenuPublic(dayOverride || assignment?.primaryMenu || assignment || null);
      const alternatives = !dayOverride && Array.isArray(assignment?.alternatives)
        ? assignment.alternatives.map(assignedMenuPublic).filter(Boolean).slice(0, 10)
        : [];
      const menuTotals = primary?.menuSnapshot?.totals || { kcal: 0, proteina: 0, carbs: 0, grasas: 0 };
      const baseTarget = nutritionWeek.targets[day.key] || null;
      const unrestricted = nutritionWeek.balanceEnabled
        ? resolveUnrestrictedTarget({
            date,
            baseTarget,
            baseTargetByDate,
            consumptionByDate,
            closedBeforeDate: date > localDateKey() ? localDateKey() : date,
          })
        : null;
      const target = unrestricted?.target || baseTarget;
      const mealTargetPlan = user?.menu?.weeklyPlan?.mealTargetsByDay?.[day.key] || null;
      const kcalTarget = hasNumber(target?.kcal) ? Number(target.kcal) : 0;
      const proteinTarget = hasNumber(target?.p) ? Number(target.p) : 0;
      const kcalDiff = roundTrackingNumber((menuTotals.kcal || 0) - kcalTarget);
      const proteinDiff = roundTrackingNumber((menuTotals.proteina || 0) - proteinTarget);

      return {
        date,
        dayKey: day.key,
        dayLabel: day.label,
        target,
        baseTarget: unrestricted ? baseTarget : null,
        weeklyBalance: unrestricted?.balance || null,
        mealTargetPlan,
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
        tracking: publicTrackingByDate.get(date),
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
    const trackingLogsByDay = trackingLogsByDate(foodLogs);
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
        tracking: trackingPublic(doc, trackingLogsByDay.get(String(doc.date)) || []),
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
    const trackingLogsByDay = trackingLogsByDate(foodLogs);

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
        tracking: trackingPublic(doc, trackingLogsByDay.get(String(doc.date)) || []),
      })),
    };
  };

  _canonicalizeEquivalentEntries = async ({
    user,
    date,
    dayKey,
    selectedMenu,
    selectedSnapshot,
    replacementCandidates,
    mealReplacements,
    foodReplacements,
    existingTracking,
    equivalentFoodsLimit,
  } = {}) => {
    const weekStart = mondayOfWeek(date);
    const weekEnd = addDaysIso(weekStart, 6);
    const canonicalMeals = [];
    for (const entry of mealReplacements) {
      const assignedAlternative = entry?.mode !== "custom_equivalent" &&
        looksLikeAssignedMealAlternative(entry, selectedMenu, replacementCandidates);
      if (assignedAlternative) {
        canonicalMeals.push({ ...entry, approvalStatus: "approved" });
        continue;
      }
      const original = replacementMealForEntry(entry, selectedSnapshot);
      if (!original || entry.replacesMealIds?.length !== 1) throw new Error("EQUIVALENT_SOURCE_MISMATCH");
      if (entry.date && entry.date !== date) throw new Error("EQUIVALENT_DATE_MISMATCH");
      if (!trackingTotalsClose(entry.target, snapshotMealTotals(original.meal), 0.25)) {
        throw new Error("EQUIVALENT_TARGET_MISMATCH");
      }
      if ((Array.isArray(entry.foods) ? entry.foods.length : 0) > equivalentFoodsLimit) {
        throw new Error("EQUIVALENT_MEAL_FOODS_LIMIT");
      }
      const foods = await this.foodLogsService.validateEquivalentItems(
        { id: user._id || user.id },
        entry.foods,
        { maxItems: equivalentFoodsLimit }
      );
      const existing = existingEntryById(existingTracking?.mealReplacements, entry.id);
      canonicalMeals.push(canonicalEquivalentEntry({
        entry: { ...entry, mode: "custom_equivalent", source: "client_meal_replacement" },
        existing,
        foods,
        user,
        date,
        dayKey,
        weekStart,
        weekEnd,
        selectedMenu,
        selectedSnapshot,
        original,
      }));
    }

    const canonicalFoods = [];
    for (const entry of foodReplacements) {
      const original = replacementMealForEntry(entry, selectedSnapshot);
      const position = replacementFoodPosition(entry);
      const originalFoods = Array.isArray(original?.meal?.items)
        ? original.meal.items
        : Array.isArray(original?.meal?.foods)
          ? original.meal.foods
          : Array.isArray(original?.meal?.alimentos)
            ? original.meal.alimentos
            : [];
      const originalFood = Number.isInteger(position) ? originalFoods[position] : null;
      if (!original || !originalFood || entry.replacesMealIds?.length !== 1) throw new Error("EQUIVALENT_SOURCE_MISMATCH");
      if (entry.date && entry.date !== date) throw new Error("EQUIVALENT_DATE_MISMATCH");
      if (!trackingTotalsClose(entry.target, roundTrackingTotals(originalFood?.totals || originalFood), 0.25)) {
        throw new Error("EQUIVALENT_TARGET_MISMATCH");
      }
      const foods = await this.foodLogsService.validateEquivalentItems(
        { id: user._id || user.id },
        entry.foods,
        { maxItems: 1 }
      );
      if (foods.length !== 1) throw new Error("EQUIVALENT_FOOD_ID_INVALID");
      const existing = existingEntryById(existingTracking?.foodReplacements, entry.id);
      canonicalFoods.push(canonicalEquivalentEntry({
        entry: { ...entry, source: "client_food_replacement", creationType: "food_equivalent" },
        existing,
        foods,
        user,
        date,
        dayKey,
        weekStart,
        weekEnd,
        selectedMenu,
        selectedSnapshot,
        original,
        originalFood,
      }));
    }
    return { mealReplacements: canonicalMeals, foodReplacements: canonicalFoods };
  };

  _recordEquivalentActivity = async ({ user, entry, event, date, mealName = "", changeCount = 0 } = {}) => {
    if (!entry || !event) return null;
    const review = equivalentReview(entry, { changeCount });
    const notification = equivalentNotificationVisibility(user, event, review);
    const pending = event === "client_equivalent_pending_approval";
    return await recordAccessAuditEvent({
      subjectType: "client",
      subjectId: user?._id || user?.id,
      actorType: "client",
      actorId: user?._id || user?.id,
      event,
      dedupeKey: `${event}:${entry.requestId || entry.id}:${entry.version || 1}`,
      notificationVisible: pending || notification.visible,
      notificationImmediate: pending || notification.immediate,
      includeInWeeklyDigest: notification.digest,
      reason: review.reasons.join(",") || event,
      metadata: {
        coachId: idToString(user?.coach?.entrenadorId || user?.coach?.coachId),
        date,
        mealId: entry.originalMealId || entry.replacesMealIds?.[0] || null,
        mealName: mealName || entry.originalMealName || entry.name,
        equivalenceId: entry.id,
        requestId: entry.requestId,
        version: entry.version,
        mode: entry.mode || entry.creationType,
        strategy: entry.strategy,
        approvalStatus: entry.approvalStatus,
        target: review.target,
        result: review.result,
        diff: review.diff,
        warnings: entry.warnings || [],
        acceptedWarnings: entry.acceptedWarnings || [],
        reviewReasons: review.reasons,
        foods: (entry.foods || []).map((food) => ({
          id: food.id,
          name: food.name,
          quantity: food.quantity,
          unit: food.unit,
          quantityMode: food.quantityMode,
          suggested: food.suggested === true,
        })),
      },
    });
  };

  _consumeEquivalentMeals = async ({ user, date, selectedSnapshot, completedMenuMeals, mealReplacements, foodReplacements } = {}) => {
    const completedIds = new Set((completedMenuMeals || []).map((meal) => String(meal?.mealId || "")));
    const meals = Array.isArray(selectedSnapshot?.meals) ? selectedSnapshot.meals : [];
    for (const [mealIndex, meal] of meals.entries()) {
      const id = snapshotMealId(meal, mealIndex);
      if (!completedIds.has(id)) continue;
      const mealInfo = { meal, index: mealIndex, id };
      const full = (mealReplacements || []).find((entry) => (
        entry?.isActiveReplacement !== false &&
        entry?.mode === "custom_equivalent" && entry.replacesMealIds?.includes(id)
      ));
      const foodsForMeal = (foodReplacements || []).filter((entry) => entry.replacesMealIds?.includes(id));
      if (!full && !foodsForMeal.length) continue;
      const entries = full ? [full] : foodsForMeal;
      const blocked = entries.find((entry) => entry.approvalStatus !== "approved");
      if (blocked) throw new Error(blocked.approvalStatus === "rejected" ? "EQUIVALENT_REJECTED" : "EQUIVALENT_PENDING_APPROVAL");
      const foods = effectiveFoodsForEquivalentMeal(selectedSnapshot, mealInfo, full, foodsForMeal);
      const versionKey = entries.map((entry) => `${entry.id}:${entry.version}`).sort().join("|");
      const requestId = full?.requestId || stableEquivalentRequestId(
        user?._id || user?.id,
        date,
        selectedSnapshot?.baseId || selectedSnapshot?.id,
        `${id}:${crypto.createHash("sha1").update(versionKey).digest("hex").slice(0, 20)}`,
        1
      );
      await this.foodLogsService.addSnapshotLogs({ id: user?._id || user?.id }, {
        date,
        mealType: cleanString(meal?.tipoComida || meal?.type || "snack", 60),
        mealId: id,
        mealName: cleanString(meal?.nombre || meal?.name || `Comida ${mealIndex + 1}`, 160),
        items: foods,
        requestId,
        source: "menu_equivalent_consumption",
        menuId: selectedSnapshot?.baseId || selectedSnapshot?.id || null,
        originalMealId: id,
        equivalenceId: entries.map((entry) => entry.id).join("|"),
        warningsAccepted: entries.flatMap((entry) => entry.acceptedWarnings || []),
      }, { requireRequestId: true });
      for (const entry of entries) {
        await this._recordEquivalentActivity({ user, entry, event: "client_equivalent_consumed", date });
        const review = equivalentReview(entry);
        if (review.important) {
          await this._recordEquivalentActivity({ user, entry, event: "client_equivalent_needs_attention", date });
        }
      }
    }
  };

  getCoachClientEquivalentActivity = async ({ coachId, clientId, query = {} } = {}) => {
    const { client } = await this._getCoachClientPair({ coachId, clientId });
    const data = await this.accessAuditModel.list({
      subjectType: "client",
      subjectId: clientId,
      limit: Math.min(200, Math.max(1, Number(query.limit) || 100)),
      skip: Math.max(0, Number(query.skip) || 0),
    });
    const eventNames = new Set([
      "client_equivalent_created",
      "client_equivalent_favorited",
      "client_equivalent_consumed",
      "client_equivalent_needs_attention",
      "client_equivalent_pending_approval",
      "client_equivalent_rejected",
      "client_equivalent_approved",
      "client_equivalent_recalculated_after_target_change",
    ]);
    const from = cleanString(query.from, 20);
    const to = cleanString(query.to, 20);
    const activity = (data.items || [])
      .filter((item) => eventNames.has(String(item?.event || "")))
      .filter((item) => {
        const date = String(item?.metadata?.date || "");
        return (!from || date >= from) && (!to || date <= to);
      })
      .map((item) => ({
        id: idToString(item._id),
        event: item.event,
        createdAt: item.createdAt,
        readAt: item.readAt || null,
        notificationVisible: item.notificationVisible === true,
        notificationImmediate: item.notificationImmediate === true,
        includeInWeeklyDigest: item.includeInWeeklyDigest === true,
        reason: item.reason || "",
        metadata: item.metadata || {},
      }));
    const trackingDocs = await this.menuTrackingModel.listByUserDateRange(clientId, from || addDaysIso(new Date().toISOString().slice(0, 10), -30), to || new Date().toISOString().slice(0, 10));
    const clientMealAlternatives = (trackingDocs || []).flatMap((doc) => (
      Array.isArray(doc?.mealReplacements) ? doc.mealReplacements : []
    ).filter((entry) => entry?.mode === "custom_equivalent").map((entry) => ({
      date: doc.date,
      id: entry.id,
      name: entry.name,
      originalMealId: entry.originalMealId,
      originalMealName: entry.originalMealName,
      active: entry.isActiveReplacement !== false,
      approvalStatus: entry.approvalStatus || "approved",
      version: entry.version || 1,
      target: entry.target || {},
      resultTotals: entry.resultTotals || {},
      foods: entry.foods || [],
      updatedAt: entry.updatedAt || doc.updatedAt || null,
    })));
    const notifications = activity.filter((item) => item.notificationVisible);
    const digestItems = activity.filter((item) => item.includeInWeeklyDigest);
    const digest = Object.values(digestItems.reduce((groups, item) => {
      const date = String(item?.metadata?.date || new Date(item.createdAt).toISOString().slice(0, 10));
      const start = mondayOfWeek(date);
      if (!groups[start]) groups[start] = { weekStart: start, weekEnd: addDaysIso(start, 6), total: 0, events: {} };
      groups[start].total += 1;
      groups[start].events[item.event] = (groups[start].events[item.event] || 0) + 1;
      return groups;
    }, {})).sort((a, b) => b.weekStart.localeCompare(a.weekStart));
    return {
      activity,
      notifications,
      weeklyDigest: digest,
      clientMealAlternatives,
      settings: normalizeEquivalentTrackingSettings(client?.clientPermissions?.tracking),
      total: activity.length,
    };
  };

  coachReviewClientEquivalent = async ({ coachId, clientId, date, entryId, action, reason = "" } = {}) => {
    const { coach, client } = await this._getCoachClientPair({ coachId, clientId });
    const normalizedDate = normalizeMenuTrackingDate(date);
    const normalizedAction = String(action || "").toLowerCase();
    if (!["approve", "reject"].includes(normalizedAction)) throw new Error("EQUIVALENT_REVIEW_ACTION_INVALID");
    const doc = await this.menuTrackingModel.getByUserDate(clientId, normalizedDate);
    if (!doc) throw new Error("NOT_FOUND");
    let reviewed = null;
    const reviewList = (entries = []) => (entries || []).map((entry) => {
      if (String(entry?.id || "") !== String(entryId || "")) return entry;
      reviewed = {
        ...entry,
        approvalStatus: normalizedAction === "approve" ? "approved" : "rejected",
        approvalReason: cleanString(reason, 500),
        approvedAt: normalizedAction === "approve" ? new Date().toISOString() : null,
        rejectedAt: normalizedAction === "reject" ? new Date().toISOString() : null,
        reviewedByCoachId: idToString(coach?._id || coach?.id || coachId),
      };
      return reviewed;
    });
    const mealReplacements = reviewList(doc.mealReplacements);
    const foodReplacements = reviewed ? doc.foodReplacements || [] : reviewList(doc.foodReplacements);
    if (!reviewed) throw new Error("NOT_FOUND");
    const updated = await this.menuTrackingModel.upsertDay({
      ...doc,
      clientId,
      mealReplacements,
      foodReplacements,
    });
    const event = normalizedAction === "approve" ? "client_equivalent_approved" : "client_equivalent_rejected";
    await recordAccessAuditEvent({
      subjectType: "client",
      subjectId: clientId,
      actorType: "coach",
      actorId: coach?._id || coach?.id || coachId,
      event,
      dedupeKey: `${event}:${reviewed.requestId || reviewed.id}:${reviewed.version || 1}`,
      notificationVisible: false,
      notificationImmediate: false,
      includeInWeeklyDigest: true,
      reason: cleanString(reason, 500) || event,
      metadata: {
        coachId: idToString(coach?._id || coach?.id || coachId),
        date: normalizedDate,
        equivalenceId: reviewed.id,
        requestId: reviewed.requestId,
        approvalStatus: reviewed.approvalStatus,
      },
    });
    return { ok: true, entry: reviewed, record: trackingPublic(updated) };
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

    const { target } = await this._resolveClientNutritionTargetForDate(user, date);
    const existingTracking = await this.menuTrackingModel.getByUserDate(userId, date);
    const activePlan = await this._resolveClientMenuPlan(user);
    const assignments = normalizeAssignedMenusByDay(activePlan.assignments || {});
    const assignment = activePlanAssignmentForDate(activePlan, assignments, dayKey, date);
    const primary = assignment?.primaryMenu || assignment || null;
    const alternatives = Array.isArray(assignment?.alternatives) ? assignment.alternatives : [];
    const selectedIndex = hasNumber(payload?.selectedAlternative?.index) ? Number(payload.selectedAlternative.index) : null;
    const selectedAlternative = selectedIndex !== null && alternatives[selectedIndex]
      ? alternatives[selectedIndex]
      : null;



const selectedMenu =
  existingTracking?.dayPlanOverride || selectedAlternative || primary;

const selectedSnapshot =
  selectedMenu?.menuSnapshot || {};

const totals =
  menuSnapshotTotals(
    selectedSnapshot
  );

const totalMealsCount =
  Number(
    selectedSnapshot?.mealsCount ||
    selectedSnapshot?.meals?.length ||
    0
  ) || 0;


/*
 * =====================================================
 * TRACKING YA EXISTENTE
 * =====================================================
 *
 * Lo buscamos ANTES de resolver targetMealIds.
 *
 * Esto es importante porque una comida puede estar:
 *
 * 🎯 Por meta
 * 0 alimentos todavía
 *
 * y ese estado tiene que sobrevivir aunque otra
 * actualización del día no vuelva a mandar el campo.
 */

/*
 * =====================================================
 * IDS VÁLIDOS DEL MENÚ ACTUAL
 * =====================================================
 */

const validSnapshotMealIds =
  new Set(
    (
      Array.isArray(
        selectedSnapshot?.meals
      )
        ? selectedSnapshot.meals
        : []
    ).map(
      (meal, index) =>
        snapshotMealId(
          meal,
          index
        )
    )
  );

const sourceSuppressedMenuMealIds =
  requestedStatus === "missed"
    ? []
    : Array.isArray(payload.suppressedMenuMealIds)
      ? payload.suppressedMenuMealIds
      : Array.isArray(existingTracking?.suppressedMenuMealIds)
        ? existingTracking.suppressedMenuMealIds
        : [];

const suppressedMenuMealIds = [
  ...new Set(cleanStringArray(sourceSuppressedMenuMealIds, 20, 100)),
].filter((id) => validSnapshotMealIds.has(id));

const suppressedMenuMealIdSet = new Set(suppressedMenuMealIds);

/*
 * =====================================================
 * COMIDAS EN MODO "POR META"
 * =====================================================
 *
 * Si el frontend manda targetMealIds:
 * usamos exactamente ese estado.
 *
 * Si NO lo manda:
 * conservamos el estado previamente guardado.
 *
 * Esto evita que "Por meta" desaparezca por una
 * actualización que no tenía relación con esa comida.
 */

const sourceTargetMealIds =
  requestedStatus === "missed"
    ? []
    : Array.isArray(
        payload.targetMealIds
      )
      ? payload.targetMealIds
      : Array.isArray(
          existingTracking?.targetMealIds
        )
        ? existingTracking.targetMealIds
        : [];


const targetMealIds =
  requestedStatus === "missed"
    ? []
    : [
        ...new Set(
          cleanStringArray(
            sourceTargetMealIds,
            20,
            100
          )
        ),
      ].filter(
        (id) =>
          validSnapshotMealIds.has(
            id
          ) && !suppressedMenuMealIdSet.has(id)
      );

const targetMealIdSet =
  new Set(
    targetMealIds
  );


/*
 * =====================================================
 * COMIDAS HECHAS
 * =====================================================
 *
 * Construimos primero lo que llega como completado.
 *
 * Después quitamos cualquier comida que esté
 * actualmente en Por meta.
 *
 * REGLA:
 *
 * ✓ Hecha
 * y
 * 🎯 Por meta
 *
 * nunca pueden coexistir.
 */

const completedMenuMeals =
  (
    requestedStatus === "missed"
      ? []
      : buildCompletedMenuMealsFromPayload(
          payload,
          selectedSnapshot,
          requestedStatus
        )
  ).filter(
    (meal) =>
      !targetMealIdSet.has(
        cleanString(
          meal?.mealId,
          100
        )
      ) && !suppressedMenuMealIdSet.has(cleanString(meal?.mealId, 100))
  );


const completedMealsCount =
  completedMenuMeals.length;


/*
 * =====================================================
 * REGISTROS MANUALES
 * =====================================================
 */

const manualEntries =
  sanitizeTrackingEntries(
    payload.manualEntries,
    "manual_food"
  );





    const generatedRemainingMeals = sanitizeTrackingEntries(payload.generatedRemainingMeals, "generated_remaining_meal");
    let mealReplacements = sanitizeTrackingEntries(payload.mealReplacements, "client_meal_replacement");
    let foodReplacements = sanitizeTrackingEntries(payload.foodReplacements, "client_food_replacement");
    const trackingPermissions = clientMenuTrackingPermissions(user);
    const replacementCandidates = [primary, ...alternatives].filter(Boolean);
    const equivalentMealDrafts = mealReplacements.filter((entry) => (
      entry?.mode === "custom_equivalent" ||
      !looksLikeAssignedMealAlternative(entry, selectedMenu, replacementCandidates)
    ));
    const hasEquivalentMealDraft = equivalentMealDrafts.length > 0;





    if (
      !trackingPermissions.canUseMenuAlternatives &&
      trackingEntriesChanged(mealReplacements, existingTracking?.mealReplacements, "client_meal_replacement")
    ) {
      throw new Error("MENU_REPLACEMENTS_NOT_ALLOWED");
    }
    if (
      !trackingPermissions.canCreateEquivalentMeals &&
      trackingEntriesChanged(foodReplacements, existingTracking?.foodReplacements, "client_food_replacement")
    ) {
      throw new Error("FOOD_REPLACEMENTS_NOT_ALLOWED");
    }
    if (
      !trackingPermissions.canCreateEquivalentMeals &&
      hasEquivalentMealDraft &&
      trackingEntriesChanged(mealReplacements, existingTracking?.mealReplacements, "client_meal_replacement")
    ) {
      throw new Error("EQUIVALENT_MEALS_NOT_ALLOWED");
    }
    const equivalentFoodsLimit = Number(trackingPermissions.equivalentMealFoodsLimit) || 0;
    if (
      hasEquivalentMealDraft &&
      equivalentMealDrafts.some((entry) => (entry?.foods || []).length > equivalentFoodsLimit)
    ) {
      const error = new Error("EQUIVALENT_MEAL_FOODS_LIMIT");
      error.limit = equivalentFoodsLimit;
      throw error;
    }
    const canonical = await this._canonicalizeEquivalentEntries({
      user,
      date,
      dayKey,
      selectedMenu,
      selectedSnapshot,
      replacementCandidates,
      mealReplacements,
      foodReplacements,
      existingTracking,
      equivalentFoodsLimit,
    });
    mealReplacements = canonical.mealReplacements;
    foodReplacements = canonical.foodReplacements;

    const attemptedCompletedIds = new Set(completedMenuMeals.map((meal) => String(meal?.mealId || "")));
    const blockedEquivalent = [...mealReplacements, ...foodReplacements].find((entry) => (
      entry?.isActiveReplacement !== false &&
      entry?.replacesMealIds?.some((id) => attemptedCompletedIds.has(String(id))) &&
      entry?.approvalStatus && entry.approvalStatus !== "approved"
    ));
    if (blockedEquivalent) {
      throw new Error(blockedEquivalent.approvalStatus === "rejected" ? "EQUIVALENT_REJECTED" : "EQUIVALENT_PENDING_APPROVAL");
    }
    const targetTotals = targetToTrackingTotals(target || {});
    const consumedMealReplacements = consumedReplacementEntries(mealReplacements, completedMenuMeals);
    const consumedFoodReplacements = consumedReplacementEntries(foodReplacements, completedMenuMeals);
    const consumedTotals = addTrackingTotals(
      sumTrackingEntryTotals(completedMenuMeals),
      addTrackingTotals(
        addTrackingTotals(sumTrackingEntryTotals(manualEntries), sumTrackingEntryTotals(generatedRemainingMeals)),
        addTrackingTotals(sumTrackingEntryTotals(consumedMealReplacements), sumTrackingEntryTotals(consumedFoodReplacements))
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

/*
 * NUEVO:
 * comidas que están ejecutándose
 * mediante Por meta.
 */
targetMealIds,
suppressedMenuMealIds,

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

    const customEntries = [
      ...mealReplacements.filter((entry) => entry?.mode === "custom_equivalent"),
      ...foodReplacements,
    ];
    for (const entry of customEntries) {
      const previous = existingEntryById(
        entry.source === "client_food_replacement" ? existingTracking?.foodReplacements : existingTracking?.mealReplacements,
        entry.id
      );
      if (!previous || equivalentContentSignature(previous) !== equivalentContentSignature(entry)) {
        await this._recordEquivalentActivity({ user, entry, event: "client_equivalent_created", date });
        if (entry.approvalStatus === "pending_review") {
          await this._recordEquivalentActivity({ user, entry, event: "client_equivalent_pending_approval", date });
        }
      }
    }

    await this._consumeEquivalentMeals({
      user,
      date,
      selectedSnapshot,
      completedMenuMeals,
      mealReplacements,
      foodReplacements,
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
    const assignment = activePlanAssignmentForDate(activePlan, assignments, dayKey, date);
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
    const { target } = await this._resolveClientNutritionTargetForDate(user, date);
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

      if (has("factorActividad") && data.factorActividad != null) {
        const factor = calculateActivityFactor({ factor: data.factorActividad });
        if (factor === null) throw new Error("ACTIVIDAD_INVALIDA");
        basics.factorActividad = factor;
      } else if (has("actividadDiaria") || has("frecuenciaEjercicio")) {
        const factor = calculateActivityFactor({
          actividadDiaria: basics.actividadDiaria,
          frecuenciaEjercicio: basics.frecuenciaEjercicio,
        });
        if (factor !== null) basics.factorActividad = factor;
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

      if (isFinalV2 && !hasValidMetas(current?.metasActuales || {})) {
        const confirmedTarget = nutritionTargetFromOnboardingGoal(current?.goal || {});
        if (confirmedTarget) {
          patch.metasActuales = {
            ...(current?.metasActuales || {}),
            kcal: confirmedTarget.kcal,
            macros: {
              ...(current?.metasActuales?.macros || {}),
              ...confirmedTarget.macros,
            },
            source: "self",
            sourceCoachId: null,
            needsReview: false,
            updatedAt: now,
            updatedByClientId: toMongoIdOrString(current._id || current.id || userId),
          };
        }
      }

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
  buildSelfWeightProgressPatch,
  buildNutritionAssignmentImpact,
  buildSelfGoalsBackup,
  moveInvalidatedAssignments,
  normalizeWeeklyMenuSnapshot,
  normalizeWeeklyMealTargetsByDay,
  resolveClientNutritionWeek,
  resetCoachDerivedClientPermissions,
  restoreMetasAfterCoachDisconnect,
  shouldUseWeeklyNutritionPlan,
};

export default ServicioUsuarios;
