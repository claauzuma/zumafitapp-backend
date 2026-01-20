// src/servicio/usuarios.js
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
    tipo, // "entrenado" | "entrenador" (o lo que uses)

    estado: "activo",
    emailVerificado: false,

    subscription: {
      status: plan === "free" ? "inactive" : "inactive", // lo activás cuando pague
      currentPeriodEnd: null,
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

    objetivoActual: {
      objetivo: null, // "perdida_grasa" | "ganancia_muscular" | "mantenimiento"
      actividad: null, // "sedentario" | "ligero" | "moderado" | "alto"
      diasEntreno: null,
      updatedAt: null,
    },

    metasActuales: {
      kcal: null,
      macros: { p: null, c: null, g: null },
      updatedAt: null,
    },

    ComidasUltimaSemana: {
      from: null,     // "YYYY-MM-DD"
      to: null,       // "YYYY-MM-DD"
      dias: {},       // { "YYYY-MM-DD": { comidas: [...] } }
      updatedAt: null,
    },

    ComidasFavoritas: {
      ids: [],
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
      return usuarios.find((u) => (u.email || "").toLowerCase() === email.toLowerCase()) || null;
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

  // -------------------------
  // ✅ Email send wrappers (para usar async desde controlador)
  // -------------------------
  sendVerifyEmail = async (to, code) => {
    return sendVerifyCodeEmail({ to, code });
  };

  sendPasswordResetEmail = async (to, code) => {
    return sendPasswordResetCodeEmail({ to, code });
  };

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

    const safeUser = {
      _id: user._id,
      email: user.email,
      role: user.role,
      plan: user.plan || "free",
      tipo: user.tipo || "entrenado",
      profile: user.profile || {},
      settings: user.settings || {},
      estado: user.estado,
      metas: user.metas || {},
    };

    return { user: safeUser, token };
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

    // ✅ acá se crea el usuario REAL con defaults nuevos
    const role = pending.role || "cliente";
    const plan = "free";
    const tipo = "entrenado";

    const userToCreate = {
      email,
      passwordHash: pending.passwordHash,
      googleId: pending.googleId || null,

      // defaults completos
      ...getUserDefaults({ role, plan, tipo }),

      // overrides necesarios
      emailVerificado: true,
      profile: pending.profile || {},
      settings: {},

      // lo que ya venías usando
      metas: { calorias: 0, proteinas: 0, carbohidratos: 0, grasas: 0 },

      // si querés mantener legacy (opcional)
      favoritosComidas: [],

      lastLoginAt: null,
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
    if (lastSentAt && Date.now() - lastSentAt < 60 * 1000) {
      throw new Error("ESPERA_1_MIN");
    }

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

        metas: { calorias: 0, proteinas: 0, carbohidratos: 0, grasas: 0 },
        favoritosComidas: [],

        lastLoginAt: null,
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

    return {
      user: {
        _id: user._id,
        email: user.email,
        role: user.role,
        plan: user.plan || "free",
        tipo: user.tipo || "entrenado",
        profile: user.profile || {},
        settings: user.settings || {},
        estado: user.estado,
        metas: user.metas || {},
      },
      token,
    };
  };

  // -------------------------
  // USER DATA
  // -------------------------
  getById = async (id) => {
    if (typeof this.model.obtenerPorId !== "function")
      throw new Error("El modelo no implementa obtenerPorId");
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
    if (!u) return null;
    const id = u._id?.toString?.() || u.id?.toString?.() || u._id || u.id;

    return {
      id,
      _id: id,
      email: u.email,
      role: u.role || u.rol,
      plan: u.plan || "free",
      tipo: u.tipo || "entrenado",
      estado: u.estado || "activo",
      subscription: u.subscription || {},
      profile: u.profile || {},
      settings: u.settings || {},
      metas: u.metas || {},
      metasActuales: u.metasActuales || {},
      objetivoActual: u.objetivoActual || {},
      antropometriaActual: u.antropometriaActual || {},
      ComidasUltimaSemana: u.ComidasUltimaSemana || { from: null, to: null, dias: {}, updatedAt: null },
      ComidasFavoritas: u.ComidasFavoritas || { ids: [], updatedAt: null },
      lastLoginAt: u.lastLoginAt || null,
      createdAt: u.createdAt || null,
      updatedAt: u.updatedAt || null,
    };
  }

  adminListUsers = async ({ search = "", role = "", estado = "", tipo = "", limit = 50, skip = 0 }) => {
    if (typeof this.model.adminListUsers === "function") {
      const arr = await this.model.adminListUsers({ search, role, estado, tipo, limit, skip });
      return arr.map((u) => this._sanitizeUser(this._normalizeUser(u)));
    }

    // fallback si no implementaste adminListUsers en DAO
    const all = await this.model.obtenerUsuarios();
    const s = (search || "").toLowerCase();

    const filtered = all.filter((u) => {
      const email = (u.email || "").toLowerCase();
      const nombre = (u.profile?.nombre || "").toLowerCase();
      const apellido = (u.profile?.apellido || "").toLowerCase();
      const matchSearch = !s || email.includes(s) || nombre.includes(s) || apellido.includes(s);

      const matchRole = !role || (u.role || u.rol) === role;
      const matchEstado = !estado || (u.estado || "activo") === estado;
      const matchTipo = !tipo || (u.tipo || "") === tipo;

      return matchSearch && matchRole && matchEstado && matchTipo;
    });

    return filtered.slice(skip, skip + limit).map((u) => this._sanitizeUser(this._normalizeUser(u)));
  };

  // ✅ Admin crea usuario con defaults completos
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

    // roles válidos (dejé tu compatibilidad)
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

      metas: { calorias: 0, proteinas: 0, carbohidratos: 0, grasas: 0 },
      favoritosComidas: [],

      lastLoginAt: null,
      createdAt: new Date(),
      updatedAt: null,
    };

    const created = await this._createUser(userToCreate);
    return this._sanitizeUser(this._normalizeUser(created));
  };

  adminGetUserById = async (id) => {
    const u = await this.getById(id);
    return u ? this._sanitizeUser(u) : null;
  };

  adminUpdateUser = async (id, updates = {}) => {
    const currentRaw = await this.model.obtenerPorId(id);
    if (!currentRaw) throw new Error("NOT_FOUND");

    const patch = { ...updates };

    // email
    if (patch.email !== undefined) {
      const email = String(patch.email).trim().toLowerCase();
      if (!email) delete patch.email;
      else {
        const other = await this._findUserByEmail(email);
        const otherId = other ? (other._id?.toString?.() || other.id) : null;
        if (other && String(otherId) !== String(id)) throw new Error("EMAIL_DUPLICADO");
        patch.email = email;
      }
    }

    // role
    if (patch.role !== undefined) {
      if (!["admin", "cliente", "entrenador"].includes(patch.role)) throw new Error("ROL_INVALIDO");
    }

    // plan
    if (patch.plan !== undefined) {
      if (!["free", "premium", "premium2"].includes(patch.plan)) throw new Error("PLAN_INVALIDO");
    }

    // password -> hash
    if (patch.password !== undefined) {
      const pass = String(patch.password || "");
      if (pass.length < 6) throw new Error("PASSWORD_CORTA");
      patch.passwordHash = await bcrypt.hash(pass, 10);
      delete patch.password;
    }

    if (patch._id) delete patch._id;

    const updated = await this._updateById(id, patch);
    return this._sanitizeUser(this._normalizeUser(updated));
  };

  adminDeleteUser = async (id) => {
    if (typeof this.model.borrarUsuario !== "function") {
      throw new Error("El modelo no implementa borrarUsuario");
    }
    return await this.model.borrarUsuario(id);
  };
}

export default ServicioUsuarios;
