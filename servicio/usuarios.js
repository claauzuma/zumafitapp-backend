import ModelFactory from "../model/DAO/usuariosFactory.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";

import { sendVerifyCodeEmail, sendPasswordResetCodeEmail } from "./mailer.js";

import ModelMongoDBPendingUsers from "../model/DAO/pendingUsersMongoDB.js";
import ModelMongoDBPasswordResets from "../model/DAO/passwordResetMongoDB.js";
import ModelMongoDBInvitedUsers from "../model/DAO/invitedUsersMongoDB.js";

// =========================
// ✅ Defaults del usuario
// =========================
function getUserDefaults({ role = "cliente", plan = "free", tipo = "entrenado" } = {}) {
  const now = new Date();

  return {
    role,
    plan, // free | premium | premium2
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
      status: plan === "free" ? "free" : "inactive",
      paidUntil: null,
      lastPaymentAt: null,
      provider: null,
      providerCustomerId: null,
      providerSubscriptionId: null,
    },

    coachProfile:
      role === "coach"
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
      role === "coach"
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
      coachWelcome: u.coachWelcome || null,
      settings: u.settings || {},
      adminMeta: u.adminMeta || {},

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

    const passwordHash = await bcrypt.hash(password, 10);

    const code = this._generateOTP6();
    const codeHash = this._sha256(code);
    const expiresAt = this._getOtpExpiryDate();

    await this.pendingModel.create({
      email,
      passwordHash,
      role: "cliente",
      plan: "free",
      tipo: "entrenado",
      profile,
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

    const role = pending.role || "cliente";
    const plan = pending.plan || "free";
    const tipo = pending.tipo || "entrenado";

    const userToCreate = {
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

        const role = normalizeRole(invite.role);
        const plan = invite.plan || "free";

        const tipo =
          role === "cliente"
            ? "entrenado"
            : role === "coach"
            ? "entrenador"
            : "admin";

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
                invitedAt: invite?.invitedAt || new Date(),
                plan: invite?.plan || "free",
                specialties: {
                  training: !!invite?.coachProfile?.specialties?.training,
                  nutrition: !!invite?.coachProfile?.specialties?.nutrition,
                },
                seenAt: null,
              }
            : null;

        userRaw = await this._createUser({
          email,
          passwordHash,
          googleId,

          ...getUserDefaults({ role, plan, tipo }),

          emailVerificado: true,
          profile: {
            nombre: invite?.profile?.nombre || nombre || "",
            apellido: invite?.profile?.apellido || apellido || "",
            avatarUrl: avatarUrl || "",
          },
          coachProfile: normalizedCoachProfile,
          coachWelcome,
          settings: {},

          createdAt: new Date(),
          updatedAt: null,
        });

        try {
          await this._deleteInviteById(invite._id);
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
    return this._normalizeUser(user);
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

    const dbPlan = role === "admin" ? null : toDbPlan(plan);
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
      invitedAt: new Date(),
      acceptedAt: null,
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

    if (typeof this.model.obtenerUsuarios !== "function") {
      throw new Error("El modelo no implementa obtenerUsuarios");
    }

    const raw = await this.model.obtenerUsuarios();
    let arr = Array.isArray(raw) ? raw : raw?.users || raw?.usuarios || [];

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

    const total = arr.length;
    arr = arr.slice(skip, skip + limit);

    return {
      users: arr.map((u) => this._sanitizeUser(u)),
      total,
    };
  };

  adminListCoaches = async ({ search = "", limit = 100, skip = 0 } = {}) => {
    let arr = await this._listCoachesBase();

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

    const total = arr.length;
    arr = arr.slice(skip, skip + limit);

    const coaches = await Promise.all(
      arr.map(async (u) => {
        const clientsCount = await this._countClientsForCoach(u._id);
        return {
          ...u,
          coachStats: {
            ...(u?.coachStats || {}),
            currentClients: clientsCount,
          },
        };
      })
    );

    return { coaches, total };
  };

  adminListUnassignedClients = async ({ search = "", limit = 100, skip = 0 } = {}) => {
    let arr = await this._listUnassignedClientsBase();

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

    const total = arr.length;
    arr = arr.slice(skip, skip + limit);

    return { clients: arr, total };
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

    const dbPlan = toDbPlan(plan);
    if (!dbPlan) throw new Error("PLAN_INVALIDO");

    email = String(email).trim().toLowerCase();

    const exists = await this._findUserByEmail(email);
    if (exists) throw new Error("EMAIL_DUPLICADO");

    const passwordHash = await bcrypt.hash(password, 10);
    const resolvedTipo = tipo || inferTipoFromRole(role);

    const userToCreate = {
      email,
      passwordHash,

      ...getUserDefaults({ role, plan: dbPlan, tipo: resolvedTipo }),

      estado,
      emailVerificado: false,

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
        const dbPlan = toDbPlan(patch.plan);
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

  adminDeleteUser = async (id) => {
    if (typeof this.model.borrarUsuario !== "function") {
      throw new Error("El modelo no implementa borrarUsuario");
    }
    return await this.model.borrarUsuario(id);
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

  adminUpdatePlan = async (id, plan) => {
    const dbPlan = toDbPlan(plan);
    if (!dbPlan) throw new Error("PLAN_INVALIDO");

    const user = await this.getById(id);
    if (!user) throw new Error("NOT_FOUND");

    const billing = {
      ...(user?.billing || {}),
      status: dbPlan === "free" ? "free" : (user?.billing?.status || "inactive"),
    };

    return await this.updateById(id, {
      plan: dbPlan,
      billing,
      updatedAt: new Date(),
    });
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

    const currentCoachId = client?.coach?.entrenadorId || null;
    const maxClients = Number(coach?.coachCapabilities?.maxClients ?? 0);

    if (String(currentCoachId || "") !== String(coachId)) {
      const currentCount = await this._countClientsForCoach(coachId);
      if (maxClients > 0 && currentCount >= maxClients) {
        throw new Error("COACH_CLIENT_LIMIT_REACHED");
      }
    }

    return await this.updateById(clientId, {
      coach: {
        ...(client?.coach || {}),
        entrenadorId: coach._id,
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

    const clients = await this._listClientsForCoach(coachId);

    return {
      coach,
      clients,
      total: clients.length,
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
