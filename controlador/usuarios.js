import Servicio from "../servicio/usuarios.js";
import cloudinary from "cloudinary";

function getCookieOptions() {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    path: "/",
  };
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isDuplicateEmailError(error) {
  const msg = String(error?.message || "");
  return msg === "EMAIL_DUPLICADO" || msg.includes("E11000");
}

function maskToken(token) {
  if (!token || typeof token !== "string") return token;
  if (token.length <= 16) return "***";
  return token.slice(0, 10) + "..." + token.slice(-6);
}

function decodeState(state) {
  try {
    const json = Buffer.from(String(state || ""), "base64url").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function appendQuery(url, params = {}) {
  try {
    const u = new URL(url);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && String(v) !== "") {
        u.searchParams.set(k, String(v));
      }
    });
    return u.toString();
  } catch {
    const sep = url.includes("?") ? "&" : "?";
    const qs = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && String(v) !== "")
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join("&");
    return url + sep + qs;
  }
}

function adminError(res, error) {
  const msg = String(error?.message || "");

  if (msg === "NOT_FOUND") return res.status(404).json({ error: "Usuario no encontrado" });
  if (msg === "COACH_NOT_FOUND") return res.status(404).json({ error: "Coach no encontrado" });
  if (msg === "INVITATION_NOT_FOUND") return res.status(404).json({ error: "Invitación no encontrada" });

  if (msg === "USER_NOT_CLIENT") return res.status(400).json({ error: "El usuario no es cliente" });
  if (msg === "USER_NOT_COACH") return res.status(400).json({ error: "El usuario no es coach" });
  if (msg === "COACH_ID_REQUIRED") return res.status(400).json({ error: "Falta coachId" });
  if (msg === "CANNOT_ASSIGN_SELF") {
    return res.status(400).json({ error: "No podés asignar el mismo usuario como coach y cliente" });
  }

  if (msg === "PLAN_INVALIDO") return res.status(400).json({ error: "Plan inválido" });
  if (msg === "ESTADO_INVALIDO") return res.status(400).json({ error: "Estado inválido" });
  if (msg === "MAX_CLIENTS_INVALIDO") return res.status(400).json({ error: "maxClients inválido" });
  if (msg === "SPECIALTIES_INVALIDAS") return res.status(400).json({ error: "Especialidades inválidas" });
  if (msg === "PASSWORD_CORTA") {
    return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres" });
  }

  if (msg === "COACH_CLIENT_LIMIT_REACHED") {
    return res.status(409).json({ error: "El coach alcanzó el límite de clientes" });
  }

  if (msg === "INVITATION_ALREADY_FINALIZED") {
    return res.status(409).json({ error: "La invitación ya no está pendiente" });
  }

  console.error("Admin error:", error);
  return res.status(500).json({ error: "Error en el servidor" });
}

function mapUserPublic(user) {
  return {
    _id: user._id,
    id: user._id,

    email: user.email,
    googleId: user.googleId || null,
    emailVerificado: !!user.emailVerificado,

    role: user.role || "cliente",
    plan: user.plan || "free",
    tipo: user.tipo || "entrenado",
    estado: user.estado || "activo",

    profile: user.profile || {},
    coachProfile: user.coachProfile || null,
    coachCapabilities: user.coachCapabilities || null,
    coachWelcome: user.coachWelcome || null,
    settings: user.settings || {},
    adminMeta: user.adminMeta || {},

    metas: user.metas || {},
    onboarding: user.onboarding || {},
    coach: user.coach || {},
    billing: user.billing || {},

    antropometriaActual: user.antropometriaActual || {},
    metasActuales: user.metasActuales || {},
    stats: user.stats || {},

    lastLoginAt: user.lastLoginAt || null,
    lastActivityAt: user.lastActivityAt || null,
    createdAt: user.createdAt || null,
    updatedAt: user.updatedAt || null,

    account: {
      role: user.role || "cliente",
      type: user.tipo || "entrenado",
      status: user.estado || "activo",
      plan: user.plan || "free",
      emailVerified: !!user.emailVerificado,
    },

    body: {
      heightCm: user?.antropometriaActual?.alturaCm ?? null,
      weightKg: user?.antropometriaActual?.pesoKg ?? null,
      bodyFatPct: user?.antropometriaActual?.grasaPct ?? null,
      updatedAt: user?.antropometriaActual?.updatedAt ?? null,

      gender: user?.profile?.basics?.genero ?? null,
      birthDate: user?.profile?.basics?.fechaNacimiento ?? null,
      weightTrend: user?.profile?.basics?.tendenciaPeso ?? null,
      exerciseFrequency: user?.profile?.basics?.frecuenciaEjercicio ?? null,
      dailyActivity: user?.profile?.basics?.actividadDiaria ?? null,
      trainingExperience: user?.profile?.basics?.experienciaPesas ?? null,
      tdeeEstimated: user?.profile?.basics?.tdeeEstimado ?? null,
      tdeeCustom: user?.profile?.basics?.tdeeCustom ?? null,
      bodyFatLevel: user?.profile?.basics?.grasaNivel ?? null,
    },

    goal: {
      type: user?.goal?.type ?? null,
      maintenanceKcal: user?.goal?.maintenanceKcal ?? null,
      startWeightKg: user?.goal?.startWeightKg ?? null,
      targetWeightKg: user?.goal?.targetWeightKg ?? null,
      targetRangeKg: user?.goal?.targetRangeKg || { min: null, max: null },
      ratePctBWPerWeek: user?.goal?.ratePctBWPerWeek ?? null,
      initialBudgetKcal: user?.goal?.initialBudgetKcal ?? null,
      endDateLabel: user?.goal?.endDateLabel ?? null,
      approach: user?.goal?.approach ?? null,
      updatedAt: user?.goal?.updatedAt ?? null,
    },

    program: {
      diet: user?.program?.diet ?? null,
      training: user?.program?.training ?? null,
      calorieDist: user?.program?.calorieDist ?? null,
      shiftDays: user?.program?.shiftDays ?? [],
      protein: user?.program?.protein ?? null,
      final: !!user?.program?.final,
      updatedAt: user?.program?.updatedAt ?? null,
    },

    menu: {
      mode: user?.menu?.mode || {
        type: "automatic",
        lockedByCoach: false,
      },

      mealConfig: user?.menu?.mealConfig || {
        mealsPerDay: null,
        distribution: "equilibrada",
        weekendBoost: false,
        weekendBoostPct: 0,
        snackLibre: false,
        snackLibreKcal: 0,
      },

      restrictions: user?.menu?.restrictions || {
        allergies: [],
        intolerances: [],
        excludedFoods: [],
        preferredFoods: [],
        favoriteFoods: [],
        favoriteMeals: [],
      },

      weeklyPlan: user?.menu?.weeklyPlan || {
        caloriesByDay: {},
        macrosByDay: {},
        mealsByDay: {},
      },

      history: user?.menu?.history || {
        lastWeek: {
          from: null,
          to: null,
          dias: {},
          updatedAt: null,
        },
      },

      favorites: user?.menu?.favorites || {
        ids: [],
        updatedAt: null,
      },

      updatedAt: user?.menu?.updatedAt ?? null,
    },

    routine: user?.routine || {
      mode: {
        type: "manual",
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
  };
}

class ControladorUsuarios {
  constructor(persistencia) {
    this.servicio = new Servicio(persistencia);
  }

  login = async (req, res) => {
    try {
      let { email, password } = req.body || {};
      email = normalizeEmail(email);

      if (!email || !password) {
        return res.status(400).json({ error: "Email y contraseña son requeridos" });
      }

      const result = await this.servicio.login(email, password);
      if (!result) return res.status(401).json({ error: "Credenciales incorrectas" });

      const { user, token } = result;

      res.cookie("access_token", token, {
        ...getCookieOptions(),
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      return res.json({
        token,
        user: mapUserPublic(user),
      });
    } catch (error) {
      const msg = String(error?.message || "");

      if (msg === "EMAIL_NO_VERIFICADO") {
        return res.status(403).json({ error: "Tenés que verificar tu email antes de iniciar sesión" });
      }

      if (msg === "EMAIL_PENDIENTE") {
        return res.status(403).json({
          error: "Tenés una verificación pendiente. Verificá tu email o reenviá el código.",
          pending: true,
        });
      }

      console.error("Error login:", error);
      return res.status(500).json({ error: "Error en el servidor" });
    }
  };

  logout = async (req, res) => {
    try {
      res.clearCookie("access_token", getCookieOptions());
      res.cookie("access_token", "", { ...getCookieOptions(), maxAge: 0 });
      return res.status(200).json({ message: "Logout exitoso" });
    } catch (error) {
      console.error("Error logout:", error);
      return res.status(500).json({ error: "Error al hacer logout" });
    }
  };

  me = async (req, res) => {
    try {
      res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.set("Pragma", "no-cache");
      res.set("Expires", "0");

      const { id } = req.user;

      await this.servicio.touchLastActivity(id);

      const user = await this.servicio.getById(id);
      if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

      return res.json({
        user: mapUserPublic(user),
      });
    } catch (error) {
      console.error("Error me:", error);
      return res.status(500).json({ error: "Error en el servidor" });
    }
  };

  registerCliente = async (req, res) => {
    try {
      let { email, password, nombre, apellido, fechaNacimiento } = req.body || {};
      email = normalizeEmail(email);

      if (!email || !password) {
        return res.status(400).json({ error: "Email y contraseña son requeridos" });
      }

      const result = await this.servicio.registerCliente({
        email,
        password,
        profile: { nombre, apellido, fechaNacimiento },
      });

      res.status(200).json({
        pending: true,
        message: "Te enviamos un código al email. Ingresalo para activar tu cuenta.",
      });

      const code = result?.code;
      if (code) {
        this.servicio
          .sendVerifyEmail(email, code)
          .then(() => console.log("[MAIL] register ok ->", email))
          .catch((e) => console.error("[MAIL] register fail ->", email, e));
      }
    } catch (error) {
      const msg = String(error?.message || "");
      console.error("Error register cliente:", error);

      if (isDuplicateEmailError(error)) {
        return res.status(409).json({ error: "Ese email ya está registrado" });
      }

      if (msg === "EMAIL_PENDIENTE") {
        return res.status(409).json({ error: "Ya hay una verificación pendiente. Reenviá el código." });
      }

      return res.status(500).json({ error: "Error en el servidor" });
    }
  };

  verifyEmail = async (req, res) => {
    try {
      let { email, code } = req.body || {};
      email = normalizeEmail(email);
      code = String(code || "").trim();

      if (!email || !code) {
        return res.status(400).json({ error: "Email y código son requeridos" });
      }

      await this.servicio.verifyEmail(email, code);
      return res.json({ ok: true, message: "Email verificado ✅ Ya podés iniciar sesión" });
    } catch (error) {
      const msg = String(error?.message || "");

      if (msg === "SIN_PENDIENTE") {
        return res.status(404).json({ error: "No hay verificación pendiente para ese email" });
      }
      if (msg === "CODIGO_EXPIRADO") {
        return res.status(400).json({ error: "El código expiró. Pedí uno nuevo." });
      }
      if (msg === "CODIGO_INVALIDO") {
        return res.status(400).json({ error: "Dígitos incorrectos, volvé a intentar" });
      }
      if (msg === "DEMASIADOS_INTENTOS") {
        return res.status(429).json({ error: "Máximo de intentos alcanzado. Reenviá el código." });
      }
      if (msg === "EMAIL_DUPLICADO") {
        return res.status(409).json({ error: "Ese email ya está registrado" });
      }

      console.error("Error verifyEmail:", error);
      return res.status(500).json({ error: "Error en el servidor" });
    }
  };

  resendVerifyCode = async (req, res) => {
    try {
      let { email } = req.body || {};
      email = normalizeEmail(email);

      if (!email) return res.status(400).json({ error: "Email requerido" });

      const code = await this.servicio.resendVerifyCode(email);

      res.json({ ok: true, message: "Código reenviado ✅" });

      this.servicio
        .sendVerifyEmail(email, code)
        .then(() => console.log("[MAIL] resend ok ->", email))
        .catch((e) => console.error("[MAIL] resend fail ->", email, e));
    } catch (error) {
      const msg = String(error?.message || "");

      if (msg === "ESPERA_1_MIN") {
        return res.status(429).json({ error: "Esperá 1 minuto antes de reenviar" });
      }
      if (msg === "SIN_PENDIENTE") {
        return res.status(404).json({ error: "No hay verificación pendiente para ese email" });
      }

      console.error("Error resendVerifyCode:", error);
      return res.status(500).json({ error: "Error en el servidor" });
    }
  };

  forgotPassword = async (req, res) => {
    try {
      let { email } = req.body || {};
      email = normalizeEmail(email);

      if (!email) return res.status(400).json({ error: "Email requerido" });

      await this.servicio.forgotPassword(email);
      return res.json({ ok: true, message: "Si el email existe, te enviamos un código ✅" });
    } catch (error) {
      const msg = String(error?.message || "");
      if (msg === "ESPERA_1_MIN") {
        return res.status(429).json({ error: "Esperá 1 minuto antes de pedir otro código" });
      }

      console.error("Error forgotPassword:", error);
      return res.json({ ok: true, message: "Si el email existe, te enviamos un código ✅" });
    }
  };

  resetPassword = async (req, res) => {
    try {
      let { email, code, newPassword } = req.body || {};
      email = normalizeEmail(email);
      code = String(code || "").trim();
      newPassword = String(newPassword || "");

      if (!email || !code || !newPassword) {
        return res.status(400).json({ error: "Email, código y nueva contraseña son requeridos" });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ error: "La contraseña debe tener 6+ caracteres" });
      }

      await this.servicio.resetPassword(email, code, newPassword);
      return res.json({ ok: true, message: "Contraseña actualizada ✅" });
    } catch (error) {
      const msg = String(error?.message || "");

      if (msg === "CODIGO_EXPIRADO") {
        return res.status(400).json({ error: "El código expiró. Pedí uno nuevo." });
      }
      if (msg === "CODIGO_INVALIDO") {
        return res.status(400).json({ error: "Código inválido. Verificá e intentá de nuevo." });
      }
      if (msg === "DEMASIADOS_INTENTOS") {
        return res.status(429).json({ error: "Máximo de intentos alcanzado. Pedí un nuevo código." });
      }

      console.error("Error resetPassword:", error);
      return res.status(500).json({ error: "Error en el servidor" });
    }
  };

  markCoachWelcomeSeen = async (req, res) => {
    try {
      const userId = req.user?.id || req.user?._id;
      const user = await this.servicio.markCoachWelcomeSeen(userId);
      return res.json({ ok: true, user: mapUserPublic(user) });
    } catch (error) {
      console.error("Error markCoachWelcomeSeen:", error);
      return res.status(500).json({ error: "Error en el servidor" });
    }
  };

  actualizarOnboardingCliente = async (req, res) => {
    try {
      const userId = req.user?.id || req.user?._id;
      if (!userId) return res.status(401).json({ error: "No autenticado" });

      const { step, data } = req.body || {};
      const s = Number(step);

      if (![1, 2, 3].includes(s)) {
        return res.status(400).json({ error: "Step inválido (debe ser 1, 2 o 3)" });
      }

      const user = await this.servicio.actualizarOnboardingCliente(userId, s, data);
      return res.json({ ok: true, user: mapUserPublic(user) });
    } catch (e) {
      console.error("actualizarOnboardingCliente error:", e);
      return res.status(500).json({ error: e?.message || "Error interno" });
    }
  };

  getUpdatedAt = async (req, res) => {
    try {
      const userId = req.user.id;
      const result = await this.servicio.getUpdatedAt(userId);

      if (!result) {
        return res.status(404).json({ error: "NOT_FOUND" });
      }

      res.json(result);
    } catch (error) {
      console.error("getUpdatedAt error:", error);
      res.status(500).json({ error: "ERROR" });
    }
  };

  obtenerPerfil = async (req, res) => {
    try {
      const { id } = req.user;

      await this.servicio.touchLastActivity(id);

      const user = await this.servicio.getById(id);
      if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

      return res.json(mapUserPublic(user));
    } catch (error) {
      console.error("Error obtenerPerfil:", error);
      return res.status(500).json({ error: "Error al obtener perfil" });
    }
  };

  actualizarPerfil = async (req, res) => {
    try {
      const { id } = req.user;
      const updated = await this.servicio.actualizarPerfil(id, req.body);

      return res.json({
        ok: true,
        user: mapUserPublic(updated),
      });
    } catch (error) {
      console.error("Error actualizarPerfil:", error);
      return res.status(500).json({ error: "Error al actualizar perfil" });
    }
  };

  subirAvatar = async (req, res) => {
    try {
      const { id } = req.user;

      if (!req.file) {
        return res.status(400).json({ error: "No se recibió imagen (campo 'avatar')" });
      }

      if (!cloudinary?.v2?.uploader) {
        return res.status(500).json({ error: "Cloudinary no está configurado" });
      }

      let avatarUrl = null;

      if (req.file.buffer) {
        avatarUrl = await new Promise((resolve, reject) => {
          const stream = cloudinary.v2.uploader.upload_stream(
            { folder: "avatars", resource_type: "image" },
            (err, result) => (err ? reject(err) : resolve(result.secure_url))
          );
          stream.end(req.file.buffer);
        });
      } else {
        return res.status(400).json({ error: "Archivo inválido (sin buffer)" });
      }

      const user = await this.servicio.updateById(id, { "profile.avatarUrl": avatarUrl });

      return res.json({
        message: "Avatar actualizado",
        avatarUrl,
        user: mapUserPublic(user),
      });
    } catch (error) {
      console.error("Error subirAvatar:", error);
      return res.status(500).json({ error: "Error al subir avatar" });
    }
  };

  // =========================
  // ADMIN: INVITATIONS
  // =========================
  adminCreateInvitation = async (req, res) => {
    try {
      const data = req.body || {};

      const invitation = await this.servicio.adminCreateInvitation({
        ...data,
        invitedBy: req.user?.id || req.user?._id || null,
      });

      return res.status(201).json({
        ok: true,
        invitation,
      });
    } catch (error) {
      console.error("Error adminCreateInvitation:", error);

      const msg = String(error?.message || "");

      if (msg === "NOMBRE_REQUERIDO") {
        return res.status(400).json({ error: "Ingresá el nombre" });
      }
      if (msg === "APELLIDO_REQUERIDO") {
        return res.status(400).json({ error: "Ingresá el apellido" });
      }
      if (msg === "EMAIL_REQUERIDO") {
        return res.status(400).json({ error: "Ingresá el email" });
      }
      if (msg === "EMAIL_INVALIDO") {
        return res.status(400).json({ error: "Ingresá un email válido" });
      }
      if (msg === "ROL_INVALIDO") {
        return res.status(400).json({ error: "Rol inválido" });
      }
      if (msg === "PLAN_INVALIDO") {
        return res.status(400).json({ error: "Plan inválido" });
      }
      if (msg === "COACH_PROFILE_REQUERIDO") {
        return res.status(400).json({ error: "Falta configurar el perfil del coach" });
      }
      if (msg === "COACH_SPECIALTIES_REQUERIDAS") {
        return res.status(400).json({ error: "Elegí al menos una especialidad para el coach" });
      }
      if (msg === "USUARIO_YA_EXISTE") {
        return res.status(409).json({ error: "Ya existe un usuario con ese email" });
      }
      if (msg === "EMAIL_PENDIENTE") {
        return res.status(409).json({ error: "Ese email ya está pendiente de validación" });
      }
      if (msg === "INVITACION_PENDIENTE_EXISTENTE") {
        return res.status(409).json({ error: "Ya existe una invitación pendiente para ese email" });
      }

      return res.status(500).json({
        error: error?.message || "Error en el servidor",
      });
    }
  };

  adminListInvitations = async (req, res) => {
    try {
      const {
        search = "",
        status = "todos",
        role = "todos",
        limit = 100,
        skip = 0,
      } = req.query || {};

      const data = await this.servicio.adminListInvitations({
        search: String(search || "").trim(),
        status: String(status || "").trim(),
        role: String(role || "").trim(),
        limit: Number(limit || 100),
        skip: Number(skip || 0),
      });

      return res.json(data);
    } catch (error) {
      return adminError(res, error);
    }
  };

  adminGetInvitationById = async (req, res) => {
    try {
      const { invitationId } = req.params;
      const invitation = await this.servicio.adminGetInvitationById(invitationId);
      return res.json({ invitation });
    } catch (error) {
      return adminError(res, error);
    }
  };

  adminCancelInvitation = async (req, res) => {
    try {
      const { invitationId } = req.params;
      const invitation = await this.servicio.adminCancelInvitation(invitationId);
      return res.json({ ok: true, invitation });
    } catch (error) {
      return adminError(res, error);
    }
  };

  adminDeleteInvitation = async (req, res) => {
    try {
      const { invitationId } = req.params;
      const result = await this.servicio.adminDeleteInvitation(invitationId);
      return res.json({ ok: true, ...result });
    } catch (error) {
      return adminError(res, error);
    }
  };

  // =========================
  // ADMIN: USERS CRUD
  // =========================
  adminListUsers = async (req, res) => {
    try {
      const { search = "", role = "todos", estado = "todos", tipo = "todos" } = req.query || {};

      const data = await this.servicio.adminListUsers({
        search: String(search || "").trim(),
        role: String(role || "").trim(),
        estado: String(estado || "").trim(),
        tipo: String(tipo || "").trim(),
        limit: Number(req.query?.limit || 50),
        skip: Number(req.query?.skip || 0),
      });

      return res.json(data);
    } catch (error) {
      console.error("Error adminListUsers:", error);
      return res.status(500).json({ error: "Error en el servidor" });
    }
  };

  adminCreateUser = async (req, res) => {
    try {
      const {
        email,
        password,
        role = "cliente",
        plan = "free",
        estado = "activo",
        tipo = "entrenado",
        profile = {},
        fechaNacimiento,
        nombre,
        apellido,
      } = req.body || {};

      if (!email || !password) {
        return res.status(400).json({ error: "Email y contraseña son requeridos" });
      }

      const user = await this.servicio.adminCreateUser({
        email,
        password,
        role,
        plan,
        estado,
        tipo,
        profile: {
          ...profile,
          nombre: profile?.nombre ?? nombre,
          apellido: profile?.apellido ?? apellido,
          fechaNacimiento: profile?.fechaNacimiento ?? fechaNacimiento,
        },
      });

      return res.status(201).json({ user: mapUserPublic(user) });
    } catch (error) {
      console.error("Error adminCreateUser:", error);

      const msg = String(error?.message || "");
      if (msg === "EMAIL_DUPLICADO") {
        return res.status(409).json({ error: "Ese email ya está registrado" });
      }
      if (msg === "ROL_INVALIDO") {
        return res.status(400).json({ error: "Rol inválido" });
      }
      if (msg === "PLAN_INVALIDO") {
        return res.status(400).json({ error: "Plan inválido" });
      }
      if (msg === "PASSWORD_CORTA") {
        return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres" });
      }

      return res.status(500).json({ error: "Error en el servidor" });
    }
  };

  adminGetUserById = async (req, res) => {
    try {
      const { id } = req.params;

      const user = await this.servicio.adminGetUserById(id);
      if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

      return res.json({ user: mapUserPublic(user) });
    } catch (error) {
      console.error("Error adminGetUserById:", error);
      return res.status(500).json({ error: "Error en el servidor" });
    }
  };

  adminUpdateUser = async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body || {};

      const user = await this.servicio.adminUpdateUser(id, updates);
      return res.json({ user: mapUserPublic(user) });
    } catch (error) {
      console.error("Error adminUpdateUser:", error);

      const msg = String(error?.message || "");
      if (msg === "NOT_FOUND") return res.status(404).json({ error: "Usuario no encontrado" });
      if (msg === "EMAIL_DUPLICADO") return res.status(409).json({ error: "Ese email ya está registrado" });
      if (msg === "ROL_INVALIDO") return res.status(400).json({ error: "Rol inválido" });
      if (msg === "PLAN_INVALIDO") return res.status(400).json({ error: "Plan inválido" });
      if (msg === "PASSWORD_CORTA") {
        return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres" });
      }

      return res.status(500).json({ error: "Error en el servidor" });
    }
  };

  adminDeleteUser = async (req, res) => {
    try {
      const { id } = req.params;
      const r = await this.servicio.adminDeleteUser(id);

      const notDeleted =
        r === null ||
        r === undefined ||
        r?.deletedCount === 0 ||
        r?.acknowledged === true && r?.deletedCount === 0;

      if (notDeleted) {
        return res.status(404).json({ error: "Usuario no encontrado" });
      }

      return res.json({ message: "Usuario eliminado" });
    } catch (error) {
      console.error("Error adminDeleteUser:", error);
      return res.status(500).json({ error: "Error en el servidor" });
    }
  };

  // =========================
  // ADMIN: HELPERS
  // =========================
  adminListCoaches = async (req, res) => {
    try {
      const { search = "", limit = 100, skip = 0 } = req.query || {};
      const data = await this.servicio.adminListCoaches({
        search: String(search || "").trim(),
        limit: Number(limit || 100),
        skip: Number(skip || 0),
      });

      return res.json({
        coaches: (data?.coaches || []).map((u) => mapUserPublic(u)),
        total: data?.total || 0,
      });
    } catch (error) {
      return adminError(res, error);
    }
  };

  adminListUnassignedClients = async (req, res) => {
    try {
      const { search = "", limit = 100, skip = 0 } = req.query || {};
      const data = await this.servicio.adminListUnassignedClients({
        search: String(search || "").trim(),
        limit: Number(limit || 100),
        skip: Number(skip || 0),
      });

      return res.json({
        clients: (data?.clients || []).map((u) => mapUserPublic(u)),
        total: data?.total || 0,
      });
    } catch (error) {
      return adminError(res, error);
    }
  };

  // =========================
  // ADMIN: STATUS / PLAN / META
  // =========================
  adminUpdateStatus = async (req, res) => {
    try {
      const { id } = req.params;
      const { estado } = req.body || {};

      const user = await this.servicio.adminUpdateStatus(id, estado);
      return res.json({ ok: true, user: mapUserPublic(user) });
    } catch (error) {
      return adminError(res, error);
    }
  };

  adminUpdatePlan = async (req, res) => {
    try {
      const { id } = req.params;
      const { plan } = req.body || {};

      const user = await this.servicio.adminUpdatePlan(id, plan);
      return res.json({ ok: true, user: mapUserPublic(user) });
    } catch (error) {
      return adminError(res, error);
    }
  };

  adminUpdateAdminMeta = async (req, res) => {
    try {
      const { id } = req.params;
      const user = await this.servicio.adminUpdateAdminMeta(id, req.body || {});
      return res.json({ ok: true, user: mapUserPublic(user) });
    } catch (error) {
      return adminError(res, error);
    }
  };

  adminResetOnboarding = async (req, res) => {
    try {
      const { id } = req.params;
      const user = await this.servicio.adminResetOnboarding(id);
      return res.json({ ok: true, user: mapUserPublic(user) });
    } catch (error) {
      return adminError(res, error);
    }
  };

  // =========================
  // ADMIN: GOALS / DAILY GOALS
  // =========================
  adminUpdateGoals = async (req, res) => {
    try {
      const { id } = req.params;
      const user = await this.servicio.adminUpdateGoals(id, req.body || {});
      return res.json({ ok: true, user: mapUserPublic(user) });
    } catch (error) {
      return adminError(res, error);
    }
  };

  adminUpdateDailyGoals = async (req, res) => {
    try {
      const { id } = req.params;
      const { metasDiarias = {} } = req.body || {};
      const user = await this.servicio.adminUpdateDailyGoals(id, metasDiarias);
      return res.json({ ok: true, user: mapUserPublic(user) });
    } catch (error) {
      return adminError(res, error);
    }
  };

  // =========================
  // ADMIN: RELACIÓN COACH <-> CLIENTE
  // =========================
  adminAssignCoach = async (req, res) => {
    try {
      const { id } = req.params;
      const { coachId } = req.body || {};

      const user = await this.servicio.adminAssignCoach({
        clientId: id,
        coachId,
        adminId: req.user?.id || req.user?._id || null,
      });

      return res.json({ ok: true, user: mapUserPublic(user) });
    } catch (error) {
      return adminError(res, error);
    }
  };

  adminUnassignCoach = async (req, res) => {
    try {
      const { id } = req.params;

      const user = await this.servicio.adminUnassignCoach({
        clientId: id,
        adminId: req.user?.id || req.user?._id || null,
      });

      return res.json({ ok: true, user: mapUserPublic(user) });
    } catch (error) {
      return adminError(res, error);
    }
  };

  adminGetCoachClients = async (req, res) => {
    try {
      const { id } = req.params;
      const data = await this.servicio.adminGetCoachClients(id);

      return res.json({
        coach: mapUserPublic(data.coach),
        clients: (data.clients || []).map((u) => mapUserPublic(u)),
        total: data.total || 0,
      });
    } catch (error) {
      return adminError(res, error);
    }
  };

  // =========================
  // ADMIN: COACH PROFILE / CAPABILITIES
  // =========================
  adminUpdateCoachProfile = async (req, res) => {
    try {
      const { id } = req.params;
      const user = await this.servicio.adminUpdateCoachProfile(id, req.body || {});
      return res.json({ ok: true, user: mapUserPublic(user) });
    } catch (error) {
      return adminError(res, error);
    }
  };

  adminUpdateCoachCapabilities = async (req, res) => {
    try {
      const { id } = req.params;
      const user = await this.servicio.adminUpdateCoachCapabilities(id, req.body || {});
      return res.json({ ok: true, user: mapUserPublic(user) });
    } catch (error) {
      return adminError(res, error);
    }
  };

  // =========================
  // GOOGLE CALLBACK
  // =========================
  googleCallback = async (req, res) => {
    const frontendBase =
      process.env.FRONTEND_URL ||
      process.env.APP_PUBLIC_URL ||
      "http://localhost:5173";

    const parsed = decodeState(req.query?.state);
    const returnTo = parsed?.returnTo || `${frontendBase}/auth`;

    try {
      console.log("✅ [GOOGLE] callback entrando");
      console.log("✅ [GOOGLE] query.state =", req.query?.state);
      console.log("✅ [GOOGLE] parsed.state =", parsed);
      console.log("✅ [GOOGLE] returnTo efectivo =", returnTo);
      console.log("✅ [GOOGLE] req.user =", req.user);

      const payload = req.user;
      if (!payload?.email || !payload?.googleId) {
        console.log("❌ [GOOGLE] payload inválido, faltan email/googleId");
        return res.redirect(`${frontendBase}/auth?google=fail`);
      }

      console.log("✅ [GOOGLE] llamando servicio.loginOrRegisterWithGoogle con:", {
        email: payload.email,
        googleId: payload.googleId,
        nombre: payload.nombre,
        apellido: payload.apellido,
      });

      const result = await this.servicio.loginOrRegisterWithGoogle(payload);

      console.log("✅ [GOOGLE] servicio respondió:", {
        hasToken: !!result?.token,
        tokenPreview: maskToken(result?.token),
      });

      const token = result?.token;
      if (!token) {
        console.log("❌ [GOOGLE] servicio NO devolvió token");
        return res.redirect(`${frontendBase}/auth?google=error`);
      }

      const cookieOptions = { ...getCookieOptions(), maxAge: 7 * 24 * 60 * 60 * 1000 };
      res.cookie("access_token", token, cookieOptions);

      console.log("✅ [GOOGLE] cookie seteada -> options:", cookieOptions);
      console.log("✅ [GOOGLE] set-cookie header =", res.getHeader("set-cookie"));

      const redirectUrl = appendQuery(returnTo, { token, oauth: 1 });

      console.log("✅ [GOOGLE] redirect final a:", redirectUrl);
      return res.redirect(redirectUrl);
    } catch (error) {
      const msg = String(error?.message || "");
      console.error("❌ Error googleCallback:", error);

      if (msg === "EMAIL_PENDIENTE") {
        return res.redirect(`${frontendBase}/auth?pending=1`);
      }

      return res.redirect(`${frontendBase}/auth?google=error`);
    }
  };
}

export default ControladorUsuarios;
