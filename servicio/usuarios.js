import ModelFactory from "../model/DAO/usuariosFactory.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";

import { sendVerifyCodeEmail, sendPasswordResetCodeEmail } from "./mailer.js";

import ModelMongoDBPendingUsers from "../model/DAO/pendingUsersMongoDB.js";
import ModelMongoDBPasswordResets from "../model/DAO/passwordResetMongoDB.js";

// =========================
// ✅ Defaults del usuario (shape inicial)
// =========================
function getUserDefaults({ role = "cliente", plan = "free", tipo = "entrenado" } = {}) {
  const now = new Date();

  return {
    role,
    plan, // "free" | "premium" | "premium2"
    tipo, // "entrenado" | "entrenador"

    estado: "activo",
    emailVerificado: false,

    onboarding: {
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
    },

    billing: {
      status: plan === "free" ? "free" : "inactive",
      paidUntil: null,
      lastPaymentAt: null,
      provider: null,
      providerCustomerId: null,
      providerSubscriptionId: null,
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
    createdAt: now,
    updatedAt: null,
  };
}


class ServicioUsuarios {
  constructor(persistencia) {
    this.model = ModelFactory.get(persistencia);

    if (typeof this.model.ensureIndexes === "function") {
      this.model.ensureIndexes().catch(() => {});
    }

    this.pendingModel = new ModelMongoDBPendingUsers();
    this.pendingModel.ensureIndexes().catch(() => {});

    this.resetModel = new ModelMongoDBPasswordResets();
    this.resetModel.ensureIndexes().catch(() => {});
  }

  // -------------------------
  // Helpers
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

  // ✅ shape compatible para devolver usuario desde servicio
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
    settings: u.settings || {},
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
    createdAt: u.createdAt || null,
    updatedAt: u.updatedAt || null,
  };
}


  // -------------------------
  // ✅ Email wrappers
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
  // ✅ GOOGLE LOGIN / REGISTER
  // -------------------------
  loginOrRegisterWithGoogle = async ({ email, googleId, nombre, apellido, avatarUrl }) => {
    if (!process.env.JWT_SECRET) throw new Error("Falta JWT_SECRET en .env");

    email = String(email || "").toLowerCase().trim();

    const pending = await this.pendingModel.findByEmail(email);
    if (pending) throw new Error("EMAIL_PENDIENTE");

    let userRaw = await this._findUserByEmail(email);

    if (!userRaw) {
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
        settings: {},

        createdAt: new Date(),
        updatedAt: null,
      });
    }

    const user = this._normalizeUser(userRaw);

    try {
      const patch = {};
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

  // =========================
  // ✅ ADMIN: CRUD USERS
  // =========================
  _sanitizeUser(u) {
    const user = this._buildCompatUser(u);
    return user;
  }

  adminCreateUser = async ({
    email,
    password,
    role = "cliente",
    plan = "free",
    estado = "activo",
    tipo = "entrenado",
    profile = {},
  }) => {
    if (!email || !password) throw new Error("Email y password requeridos");
    if (!["admin", "cliente", "entrenador"].includes(role)) throw new Error("ROL_INVALIDO");
    if (!["free", "premium", "premium2"].includes(plan)) throw new Error("PLAN_INVALIDO");

    email = String(email).trim().toLowerCase();

    const exists = await this._findUserByEmail(email);
    if (exists) throw new Error("EMAIL_DUPLICADO");

    const passwordHash = await bcrypt.hash(password, 10);

    const userToCreate = {
      email,
      passwordHash,

      ...getUserDefaults({ role, plan, tipo }),

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
  // ✅ ONBOARDING (CLIENTE)
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

  // ----------------
  // STEP 1 (BASICS)
  // ----------------
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

  // ----------------
  // STEP 2 (GOAL)
  // ----------------
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

      // opcional: si querés mantener compatibilidad con el flow viejo
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

  // ----------------
  // STEP 3 (PROGRAM)
  // ----------------
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


  // =========================
  // ✅ ADMIN: LIST USERS
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

    if (role && role !== "todos") arr = arr.filter((u) => (u?.role || u?.rol) === role);
    if (tipo && tipo !== "todos") arr = arr.filter((u) => (u?.tipo || "") === tipo);
    if (estado && estado !== "todos") arr = arr.filter((u) => (u?.estado || "activo") === estado);

    const total = arr.length;
    arr = arr.slice(skip, skip + limit);

    return {
      users: arr.map((u) => this._sanitizeUser(u)),
      total,
    };
  };

  adminGetUserById = async (id) => {
    const u = await this.getById(id);
    return u ? this._sanitizeUser(u) : null;
  };

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
      if (!["admin", "cliente", "entrenador"].includes(patch.role)) throw new Error("ROL_INVALIDO");
    }

    if (patch.plan !== undefined) {
      if (!["free", "premium", "premium2"].includes(patch.plan)) throw new Error("PLAN_INVALIDO");
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
}

export default ServicioUsuarios;
