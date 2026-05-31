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
import ModelMongoDBImpersonationAudit from "../model/DAO/impersonationAuditMongoDB.js";
import {
  createEmptyCoachOverrides,
  createTrialSubscription,
  normalizeCoachOverrides,
  normalizeCoachPlanCode,
  normalizePlanConfig,
  resolveEffectiveCoachCapabilities,
} from "./coachPlans.js";

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
      updatedAt: null,
    },

    menu: {
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

function boolFrom(value, fallback = false) {
  if (value === undefined || value === null) return !!fallback;
  return !!value;
}

function anyTruthy(value = {}) {
  return Object.values(value || {}).some(Boolean);
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

    this.impersonationAuditModel = new ModelMongoDBImpersonationAudit();
    if (typeof this.impersonationAuditModel.ensureIndexes === "function") {
      this.impersonationAuditModel.ensureIndexes().catch(() => {});
    }
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

    const specialties = coach?.coachProfile?.specialties || {};
    if (!specialties.training && !specialties.nutrition) {
      throw new Error("COACH_SPECIALTIES_REQUERIDAS");
    }

    const coachRealId = coach._id || coach.id || invite.assignedCoachId;
    const assignedClients = await this._countClientsForCoach(coachRealId);
    const pendingInvitations = await this._countPendingClientInvitationsForCoach(coachRealId);
    const reservedWithoutCurrentInvite = assignedClients + Math.max(pendingInvitations - 1, 0);
    const effectiveCapabilities = await this._resolveEffectiveCapabilities(coach, {
      currentClients: reservedWithoutCurrentInvite,
    });

    if (effectiveCapabilities?.isTrialExpired || !effectiveCapabilities?.features?.clients?.canAssign) {
      throw new Error("COACH_NOT_AVAILABLE");
    }

    if (!effectiveCapabilities?.canReceiveClients) {
      throw new Error("COACH_CLIENT_LIMIT_REACHED");
    }

    const coachIdToStore = toMongoIdOrString(coachRealId);

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
        assignedAt: new Date(),
        assignedByAdminId: null,
        assignedByCoachId: coachIdToStore,
        source: "coach_invite",
      },
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

    const subscription =
      role === "coach"
        ? createTrialSubscription({
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
      coachProfile: normalizedCoachProfile,
      coachOverrides: role === "coach" ? createEmptyCoachOverrides() : null,
      coachWelcome,
      ...(coachInviteAcceptance?.coachAssignment
        ? { coach: coachInviteAcceptance.coachAssignment }
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

  async _unassignAllClientsFromCoach(coachId, adminId = null) {
    if (typeof this.model.unassignClientsByCoachId === "function") {
      return await this.model.unassignClientsByCoachId(coachId, adminId);
    }

    const clients = await this._listClientsForCoach(coachId);
    for (const client of clients) {
      await this._updateById(client._id, {
        coach: {
          ...(client?.coach || {}),
          entrenadorId: null,
          assignedAt: null,
          assignedByAdminId: adminId,
          source: null,
        },
        updatedAt: new Date(),
      });
    }

    return { matchedCount: clients.length, modifiedCount: clients.length };
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
    const currentClients =
      options.currentClients !== undefined
        ? Number(options.currentClients || 0)
        : await this._countClientsForCoach(coach._id || coach.id);
    const planConfig = options.planConfig || (await this._getCoachPlanConfig(coach.plan));

    return resolveEffectiveCoachCapabilities({
      coach,
      planConfig,
      currentClients,
    });
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

    const role = pending.role || "cliente";
    const plan = pending.plan || "free";
    const tipo = pending.tipo || "entrenado";

    const userToCreate = invite
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
          profile: pending.profile || {},
          settings: {},

          createdAt: new Date(),
          updatedAt: null,
        };

    const created = await this._createUser(userToCreate);

    if (invite?._id) {
      await this._acceptInviteById(invite._id, created?._id || created?.id);
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

      if (invite) {
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
          profile: { nombre, apellido, avatarUrl },
          coachProfile: null,
          settings: {},

          createdAt: new Date(),
          updatedAt: null,
        });
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
    return await this._withEffectiveCapabilities(user);
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

    const specialties = coach?.coachProfile?.specialties || {};
    if (!specialties.training && !specialties.nutrition) {
      throw new Error("COACH_SPECIALTIES_REQUERIDAS");
    }

    const coachRealId = coach._id || coach.id || coachId;
    const assignedClients = Number(coach?.effectiveCapabilities?.currentClients || 0);
    const pendingInvitations = await this._countPendingClientInvitationsForCoach(coachRealId);
    const reservedClients = assignedClients + pendingInvitations;
    const effectiveCapabilities = await this._resolveEffectiveCapabilities(coach, {
      currentClients: reservedClients,
    });

    if (effectiveCapabilities?.isTrialExpired || !effectiveCapabilities?.features?.clients?.canAssign) {
      throw new Error("COACH_NOT_AVAILABLE");
    }

    if (!effectiveCapabilities?.canReceiveClients) {
      throw new Error("COACH_CLIENT_LIMIT_REACHED");
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
  }) => {
    email = String(email || "").trim().toLowerCase();
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

    const existingUser = await this._findUserByEmail(email);
    if (existingUser) throw new Error("USUARIO_YA_EXISTE");

    const existingPending = await this.pendingModel.findByEmail(email);
    if (existingPending) throw new Error("EMAIL_PENDIENTE");

    const existingInvite = await this._findInviteByEmail(email);
    if (existingInvite) throw new Error("INVITACION_PENDIENTE_EXISTENTE");

    const sanitizedPermissions = this._sanitizeClientPermissionsForCoach(
      coach,
      effectiveCapabilities,
      clientPermissions
    );

    const coachIdToStore = toMongoIdOrString(coach._id || coach.id || coachId);
    const coachProfile = coach?.profile || {};

    const created = await this.invitedModel.create({
      email,
      role: "cliente",
      plan: "free",
      status: "pending",
      profile: { nombre, apellido },
      coachProfile: null,
      invitedBy: coachIdToStore,
      invitedByType: "coach",
      source: "coach_invite",
      assignedCoachId: coachIdToStore,
      targetRole: "cliente",
      clientPermissions: sanitizedPermissions,
      acceptedUserId: null,
      coachSnapshot: {
        id: idToString(coach._id || coach.id || coachId),
        email: coach.email,
        nombre: coachProfile.nombre || "",
        apellido: coachProfile.apellido || "",
        plan: effectiveCapabilities?.planCode || coach.plan || null,
        specialties: {
          training: !!coach?.coachProfile?.specialties?.training,
          nutrition: !!coach?.coachProfile?.specialties?.nutrition,
        },
      },
      invitedAt: new Date(),
      acceptedAt: null,
      cancelledAt: null,
      expiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return {
      invitation: created,
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

    const dbPlan = normalizePlanForRole(plan, role);
    if (!dbPlan) throw new Error("PLAN_INVALIDO");

    email = String(email).trim().toLowerCase();

    const exists = await this._findUserByEmail(email);
    if (exists) throw new Error("EMAIL_DUPLICADO");

    const passwordHash = await bcrypt.hash(password, 10);
    const resolvedTipo = tipo || inferTipoFromRole(role);
    const coachPlanConfig = role === "coach" ? await this._getCoachPlanConfig(dbPlan) : null;

    const userToCreate = {
      email,
      passwordHash,

      ...getUserDefaults({ role, plan: dbPlan, tipo: resolvedTipo }),

      estado,
      emailVerificado: false,
      ...(role === "coach"
        ? {
            subscription: createTrialSubscription({
              planCode: dbPlan,
              now: new Date(),
              durationDays: coachPlanConfig?.durationDays || 7,
            }),
          }
        : {}),
      coachOverrides: role === "coach" ? createEmptyCoachOverrides() : null,

      profile: profile || {},
      settings: {},

      createdAt: new Date(),
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

  adminUpdatePlan = async (id, plan, options = {}) => {
    const user = await this.getById(id);
    if (!user) throw new Error("NOT_FOUND");

    const isCoach = this._isCoachUser(user);
    const dbPlan = normalizePlanForRole(plan, user.role);
    if (!dbPlan) throw new Error("PLAN_INVALIDO");

    const billing = {
      ...(user?.billing || {}),
      status: isCoach
        ? (dbPlan === "trial_pro" ? "trial" : "active")
        : (dbPlan === "free" ? "free" : (user?.billing?.status || "inactive")),
    };

    const patch = {
      plan: dbPlan,
      billing,
      updatedAt: new Date(),
    };

    if (isCoach) {
      const coachPlanConfig = await this._getCoachPlanConfig(dbPlan);
      patch.subscription = createTrialSubscription({
        planCode: dbPlan,
        now: new Date(),
        existing: user?.subscription || {},
        durationDays: coachPlanConfig?.durationDays || 7,
      });

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

  adminUpdateCoachPlanConfig = async (planCode, payload = {}) => {
    const code = normalizeCoachPlanCode(planCode);
    if (!code) throw new Error("PLAN_NOT_FOUND");
    if (typeof this.coachPlanModel?.updateByCode !== "function") {
      throw new Error("PLAN_CONFIG_MODEL_UNAVAILABLE");
    }

    const patch = { ...payload };
    delete patch._id;
    delete patch.id;
    delete patch.code;

    return await this.coachPlanModel.updateByCode(code, patch);
  };

  adminResetCoachPlanConfig = async (planCode) => {
    const code = normalizeCoachPlanCode(planCode);
    if (!code) throw new Error("PLAN_NOT_FOUND");
    if (typeof this.coachPlanModel?.resetByCode !== "function") {
      throw new Error("PLAN_CONFIG_MODEL_UNAVAILABLE");
    }

    return await this.coachPlanModel.resetByCode(code);
  };

  adminUpdateCoachPlan = async (id, payload = {}) => {
    const user = await this.getById(id);
    if (!user) throw new Error("NOT_FOUND");
    if (!this._isCoachUser(user)) throw new Error("USER_NOT_COACH");

    return await this.adminUpdatePlan(id, payload?.plan, {
      resetOverrides: !!payload?.resetOverrides,
    });
  };

  adminUpdateCoachOverrides = async (id, payload = {}) => {
    const user = await this.getById(id);
    if (!user) throw new Error("NOT_FOUND");
    if (!this._isCoachUser(user)) throw new Error("USER_NOT_COACH");

    const nextOverrides = normalizeCoachOverrides({
      ...(user?.coachOverrides || {}),
      ...payload,
      features: {
        ...(user?.coachOverrides?.features || {}),
        ...(payload?.features || {}),
        routines: {
          ...(user?.coachOverrides?.features?.routines || {}),
          ...(payload?.features?.routines || {}),
        },
        menus: {
          ...(user?.coachOverrides?.features?.menus || {}),
          ...(payload?.features?.menus || {}),
        },
        metrics: {
          ...(user?.coachOverrides?.features?.metrics || {}),
          ...(payload?.features?.metrics || {}),
        },
        exports: {
          ...(user?.coachOverrides?.features?.exports || {}),
          ...(payload?.features?.exports || {}),
        },
      },
    });

    const updated = await this.updateById(id, {
      coachOverrides: nextOverrides,
      updatedAt: new Date(),
    });

    return await this._withEffectiveCapabilities(updated);
  };

  adminDeleteCoachOverrides = async (id) => {
    const user = await this.getById(id);
    if (!user) throw new Error("NOT_FOUND");
    if (!this._isCoachUser(user)) throw new Error("USER_NOT_COACH");

    const updated = await this.updateById(id, {
      coachOverrides: createEmptyCoachOverrides(),
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
      updatedAt: new Date(),
    };

    return await this.updateById(id, {
      goal: nextGoal,
      metasActuales: nextMetas,
      updatedAt: new Date(),
    });
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
        throw new Error("COACH_CLIENT_LIMIT_REACHED");
      }
    }

    return await this.updateById(clientId, {
      coach: {
        ...(client?.coach || {}),
        entrenadorId: toMongoIdOrString(coach._id),
        assignedAt: new Date(),
        assignedByAdminId: adminId,
        source: "admin",
      },
      updatedAt: new Date(),
    });
  };

  adminUnassignCoach = async ({ clientId, adminId = null }) => {
    const client = await this.getById(clientId);
    if (!client) throw new Error("NOT_FOUND");
    if (!this._isClientUser(client)) throw new Error("USER_NOT_CLIENT");

    return await this.updateById(clientId, {
      coach: {
        ...(client?.coach || {}),
        entrenadorId: null,
        assignedAt: null,
        assignedByAdminId: adminId,
        source: null,
      },
      updatedAt: new Date(),
    });
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
    const specialties = coach?.coachProfile?.specialties || {};

    if (section === "menus" && !specialties.nutrition) {
      throw new Error("COACH_NUTRITION_NOT_ALLOWED");
    }

    if (section === "routines" && !specialties.training) {
      throw new Error("COACH_TRAINING_NOT_ALLOWED");
    }

    const effective = coach?.effectiveCapabilities || {};
    const featureKey = featureKeyForMode(mode);
    const sectionFeatures = effective?.features?.[section] || {};

    if (effective?.isTrialExpired || !sectionFeatures?.[featureKey]) {
      throw new Error("COACH_FEATURE_NOT_ALLOWED");
    }
  }

  _assertNutritionEditAllowed(coach) {
    const specialties = coach?.coachProfile?.specialties || {};
    if (!specialties.nutrition) throw new Error("COACH_NUTRITION_NOT_ALLOWED");

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

  coachUpdateClientNutrition = async ({ coachId, clientId, payload = {} }) => {
    const { coach, client } = await this._getCoachClientPair({ coachId, clientId });
    this._assertNutritionEditAllowed(coach);

    const incoming = isPlainObject(payload?.nutrition) ? payload.nutrition : payload;
    const now = new Date();

    const currentMetas = client?.metasActuales || {};
    const currentMacros = currentMetas?.macros || {};
    const incomingMacros = isPlainObject(incoming?.macros) ? incoming.macros : {};

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

    const updated = await this.updateById(clientId, {
      metasActuales: nextMetas,
      goal: nextGoal,
      updatedAt: now,
    });

    return { coach, client: updated };
  };

  coachUpdateClientMenu = async ({ coachId, clientId, payload = {} }) => {
    const { coach, client } = await this._getCoachClientPair({ coachId, clientId });
    const incoming = isPlainObject(payload?.menu) ? payload.menu : payload;
    const modeType = normalizeBuilderMode(incoming?.mode?.type || incoming?.modeType || incoming?.type);
    this._assertCoachFeature(coach, "menus", modeType);

    const now = new Date();
    const current = client?.menu || {};
    const mealConfig = isPlainObject(incoming?.mealConfig) ? incoming.mealConfig : {};
    const restrictions = isPlainObject(incoming?.restrictions) ? incoming.restrictions : {};
    const weeklyPlan = isPlainObject(incoming?.weeklyPlan) ? incoming.weeklyPlan : {};

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
        generatedBy: "coach",
        generatorMode: modeType,
        updatedAt: now,
      },
      coachNotes: cleanString(incoming?.coachNotes, 3000),
      updatedAt: now,
      updatedByCoachId: toMongoIdOrString(coach._id || coach.id || coachId),
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

export default ServicioUsuarios;
