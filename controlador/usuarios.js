import Servicio from "../servicio/usuarios.js";
import cloudinary from "cloudinary";
import { getClientNutritionCapabilities } from "../servicio/clientNutritionCapabilities.js";
import { accessErrorPayload, getGoalsChangeStatus, isAccessGateError } from "../servicio/accessGates.js";

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

  if (msg === "NUTRITION_ASSIGNMENTS_CONFIRMATION_REQUIRED") {
    return res.status(409).json({
      code: msg,
      error: "Confirmá la desasignación de los menús afectados antes de guardar las nuevas metas.",
      impact: error?.impact || null,
    });
  }

  if (isAccessGateError(error)) {
    const code = error?.code || msg;
    const conflictCodes = new Set([
      "PLAN_LIMIT_REACHED",
      "GOALS_CHANGE_COOLDOWN",
      "GOALS_CHANGE_LIMIT_REACHED",
      "COACH_CLIENT_LIMIT_REACHED",
      "COACH_CLIENT_LIMIT_EXCEEDED",
    ]);
    return res.status(conflictCodes.has(code) ? 409 : 403).json(accessErrorPayload(error));
  }

  if (msg === "NOMBRE_REQUERIDO") return res.status(400).json({ error: "Ingresa el nombre" });
  if (msg === "APELLIDO_REQUERIDO") return res.status(400).json({ error: "Ingresa el apellido" });
  if (msg === "EMAIL_REQUERIDO") return res.status(400).json({ error: "Ingresa el email" });
  if (msg === "EMAIL_INVALIDO") return res.status(400).json({ error: "Ingresa un email valido" });
  if (msg === "USUARIO_YA_EXISTE") return res.status(409).json({ error: "Ya existe un usuario con ese email" });
  if (msg === "EMAIL_PENDIENTE") {
    return res.status(409).json({ error: "Ese email ya esta pendiente de validacion" });
  }
  if (msg === "INVITACION_PENDIENTE_EXISTENTE") {
    return res.status(409).json({ error: "Ya existe una invitacion pendiente para ese email" });
  }
  if (msg === "INVITEE_NOT_ELIGIBLE") {
    return res.status(409).json({ code: msg, error: "Esta cuenta no puede ser invitada como cliente." });
  }
  if (msg === "CLIENT_ALREADY_ACTIVE_WITH_COACH") {
    return res.status(409).json({ code: msg, error: "Este cliente ya forma parte de tu cartera." });
  }
  if (msg === "CLIENT_HAS_PENDING_INVITATION") {
    return res.status(409).json({ code: msg, error: "Esta cuenta ya tiene una invitacion profesional pendiente." });
  }
  if (msg === "INVITATION_REJECTED_RECENTLY") {
    return res.status(409).json({ code: msg, error: "Este cliente rechazo recientemente una invitacion. Vas a poder volver a invitarlo mas adelante." });
  }
  if (msg === "INVITATION_RATE_LIMITED") {
    return res.status(429).json({ code: msg, error: "Alcanzaste temporalmente el limite de invitaciones. Intenta mas tarde." });
  }
  if (msg === "COACH_BLOCKED_BY_CLIENT") {
    return res.status(409).json({ code: msg, error: "No es posible enviar una invitacion a esta cuenta." });
  }
  if (msg === "COACH_INVITES_DISABLED") {
    return res.status(403).json({ error: "Tu cuenta profesional no tiene habilitada la invitacion de clientes" });
  }
  if (msg === "COACH_SPECIALTIES_REQUERIDAS") {
    return res.status(403).json({ error: "Tu perfil profesional no tiene especialidades habilitadas" });
  }

  if (msg === "NOT_FOUND") return res.status(404).json({ error: "Usuario no encontrado" });
  if (msg === "COACH_NOT_FOUND") return res.status(404).json({ error: "Coach no encontrado" });
  if (msg === "INVITATION_NOT_FOUND") return res.status(404).json({ error: "Invitación no encontrada" });

  if (msg === "USER_NOT_CLIENT") return res.status(400).json({ error: "El usuario no es cliente" });
  if (msg === "USER_NOT_COACH") return res.status(400).json({ error: "El usuario no es coach" });
  if (msg === "ADMIN_REQUIRED") return res.status(403).json({ error: "Se requiere rol admin" });
  if (msg === "CANNOT_IMPERSONATE_ADMIN") return res.status(400).json({ error: "No se puede simular un usuario admin" });
  if (msg === "ROLE_NOT_IMPERSONABLE") return res.status(400).json({ error: "Este rol no se puede simular" });
  if (msg === "COACH_ID_REQUIRED") return res.status(400).json({ error: "Falta coachId" });
  if (msg === "COACH_NOT_ACTIVE") return res.status(400).json({ error: "El coach no esta activo" });
  if (msg === "COACH_NOT_AVAILABLE") return res.status(409).json({ error: "El coach no tiene permisos activos para recibir clientes" });
  if (msg === "CLIENT_NOT_ASSIGNED_TO_COACH") {
    return res.status(403).json({ error: "Este cliente no esta asignado a tu cuenta profesional" });
  }
  if (msg === "COACH_CLIENT_RELATION_NOT_ACTIVE") {
    return res.status(409).json({ code: msg, error: "La relacion profesional ya no esta activa." });
  }
  if (msg === "CLIENT_ALREADY_HAS_COACH" || msg === "CLIENT_ALREADY_HAS_ACTIVE_COACH") {
    return res.status(409).json({ code: msg, error: "La cuenta ya tiene un coach activo asignado" });
  }
  if (msg === "CLIENT_ALREADY_HAS_PENDING_COACH") {
    return res.status(409).json({ error: "Ya aceptaste una invitacion y estas esperando activacion del profesional" });
  }
  if (msg === "CLIENT_HAS_NO_COACH") {
    return res.status(400).json({ error: "No tenes un coach activo asignado" });
  }
  if (msg === "COACH_UNLINK_REQUIRES_ADMIN") {
    return res.status(409).json({ error: "Esta asignacion la hizo un admin. Podes solicitar cambio o desvinculacion." });
  }
  if (msg === "COACH_CHANGE_REQUEST_NOT_REQUIRED") {
    return res.status(400).json({ error: "Este vinculo puede desvincularse sin solicitud administrativa." });
  }
  if (msg === "COACH_NUTRITION_NOT_ALLOWED") {
    return res.status(403).json({ error: "Tu perfil profesional no tiene acceso a nutricion" });
  }
  if (msg === "COACH_TRAINING_NOT_ALLOWED") {
    return res.status(403).json({ error: "Tu perfil profesional no tiene acceso a rutinas" });
  }
  if (msg === "COACH_FEATURE_NOT_ALLOWED") {
    return res.status(403).json({ error: "Tu plan no permite esta accion" });
  }
  if (msg === "FORBIDDEN") {
    return res.status(403).json({ error: "No tenes permisos para asignar esta plantilla" });
  }
  if (msg === "MENU_NO_ENCONTRADO") {
    return res.status(404).json({ error: "El menu seleccionado ya no esta disponible" });
  }
  if (msg === "MENU_BASE_REQUERIDO") {
    return res.status(400).json({ error: "Falta identificar el menu base" });
  }
  if (msg === "COACH_SERVICE_PACKAGE_NOT_ALLOWED" || msg === "COACH_PACKAGE_NOT_ALLOWED") {
    return res.status(403).json({ error: "Tu plan profesional no permite ofrecer ese paquete de servicio" });
  }
  if (msg === "INVITATION_NOT_ACCEPTED_PENDING_ACTIVATION") {
    return res.status(409).json({ error: "La invitacion todavia no fue aceptada por el cliente" });
  }
  if (msg === "PAYLOAD_INVALIDO") return res.status(400).json({ error: "Datos invalidos" });
  if (msg === "CANNOT_ASSIGN_SELF") {
    return res.status(400).json({ error: "No podés asignar el mismo usuario como coach y cliente" });
  }

  if (msg === "PLAN_INVALIDO") return res.status(400).json({ error: "Plan inválido" });
  if (msg === "ESTADO_INVALIDO") return res.status(400).json({ error: "Estado inválido" });
  if (msg === "MAX_CLIENTS_INVALIDO") return res.status(400).json({ error: "maxClients inválido" });
  if (msg === "SPECIALTIES_INVALIDAS") return res.status(400).json({ error: "Especialidades inválidas" });
  if (msg === "PLAN_NOT_FOUND") return res.status(404).json({ error: "Plan no encontrado" });
  if (msg === "PLAN_CONFIG_MODEL_UNAVAILABLE") return res.status(500).json({ error: "Configuracion de planes no disponible" });
  if (msg === "COACH_LIMIT_INVALID" || msg === "CLIENT_PLAN_LIMIT_INVALID") {
    return res.status(400).json({
      code: msg,
      error: "El limite debe ser un numero entero valido.",
      resource: error?.resource || null,
      minimum: error?.minimum ?? null,
    });
  }
  if (msg === "COACH_LIMIT_TOO_HIGH" || msg === "CLIENT_PLAN_LIMIT_TOO_HIGH") {
    return res.status(400).json({
      code: msg,
      error: "El limite supera el maximo administrativo permitido.",
      resource: error?.resource || null,
      maximum: error?.maximum ?? null,
    });
  }
  if (msg === "CLIENT_LIBRARY_ACCESS_INVALID") {
    return res.status(400).json({ code: msg, error: "El acceso de biblioteca no es valido." });
  }
  if (msg === "COACH_PLAN_LIMIT_EXCEEDED" || msg === "COACH_OVERRIDE_BELOW_USAGE") {
    const violation = error?.violations?.[0] || {};
    return res.status(409).json({
      code: msg,
      error: `No se puede guardar: el coach tiene ${Number(violation.current || error?.current || 0)} ${violation.label || "elementos en uso"} y el limite seleccionado es ${Number(violation.limit ?? error?.limit ?? 0)}.`,
      plan: error?.plan || null,
      resource: violation.resource || error?.resource || null,
      current: Number(violation.current || error?.current || 0),
      limit: Number(violation.limit ?? error?.limit ?? 0),
      violations: error?.violations || [],
    });
  }
  if (msg === "COACH_PLAN_CLIENT_LIMIT_EXCEEDED") {
    return res.status(409).json({
      code: msg,
      error: `Este coach tiene ${Number(error?.currentClients || 0)} clientes activos y el plan seleccionado permite ${Number(error?.maxClients || 0)}. Reducí clientes activos o elegí un plan superior.`,
      plan: error?.plan || null,
      currentClients: Number(error?.currentClients || 0),
      maxClients: Number(error?.maxClients || 0),
    });
  }
  if (msg === "PASSWORD_CORTA") {
    return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres" });
  }

  if (msg === "COACH_CLIENT_LIMIT_REACHED" || msg === "COACH_CLIENT_LIMIT_EXCEEDED") {
    return res.status(409).json({
      code: "COACH_CLIENT_LIMIT_EXCEEDED",
      error: "El coach alcanzo el limite de clientes activos.",
      current: Number(error?.current || 0),
      limit: Number(error?.limit || 0),
      plan: error?.plan || null,
      overrideApplied: !!error?.overrideApplied,
      upgradeTarget: error?.upgradeTarget || null,
    });
  }

  if (msg === "INVITATION_ALREADY_FINALIZED") {
    return res.status(409).json({ error: "La invitación ya no está pendiente" });
  }
  if (msg === "INVITATION_EXPIRED") {
    return res.status(410).json({ error: "La invitacion expiro" });
  }

  if (msg === "INVALID_DATE") return res.status(400).json({ error: "Fecha invalida" });
  if (msg === "DAY_COMPLETION_MODE_INVALID") return res.status(400).json({ error: "Modo de cierre diario invalido" });
  if (msg === "MENU_NOT_ASSIGNED_FOR_DATE") return res.status(409).json({ error: "No hay un menu asignado para esa fecha" });
  if (msg === "MENU_DAY_ALREADY_COMPLETED") return res.status(409).json({ error: "Todas las comidas del menu ya estan realizadas" });
  if (msg === "MANUAL_DAY_COMPLETION_NOT_ALLOWED") return res.status(403).json({ error: "No tenes habilitado completar el dia por tu cuenta" });
  if (msg === "REMAINING_INTAKE_PLAN_NOT_ALLOWED") return res.status(403).json({ error: "Organizar lo que queda esta disponible en Pro" });
  if (msg === "USER_NOT_CLIENT") return res.status(400).json({ error: "El usuario no es cliente" });
  if (msg === "NO_AUTENTICADO") return res.status(401).json({ error: "No autenticado" });

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
    professionalStatus: user.professionalStatus || user.coachProfile?.status || null,
    professionalScopes: user.professionalScopes || user.approvedScopes || null,
    coachSubscription: user.coachSubscription || null,
    coachCapabilities: user.coachCapabilities || null,
    coachOverrides: user.coachOverrides || null,
    effectiveCapabilities: user.effectiveCapabilities || null,
    coachStats: user.coachStats || null,
    coachWelcome: user.coachWelcome || null,
    settings: user.settings || {},
    adminMeta: user.adminMeta || {},
    clientPermissions: user.clientPermissions || {},
    personalPlan: user.personalPlan || null,
    personalSubscription: user.personalSubscription || {},
    personalTrial: user.personalTrial || user.trial || {},
    coachAccess: user.coachAccess || {},
    nutritionCapabilities: String(user.role || "").toLowerCase() === "cliente"
      ? getClientNutritionCapabilities(user)
      : null,

    metas: user.metas || {},
    onboarding: user.onboarding || {},
    goalsMetadata: user.goalsMetadata || {},
    goalsAccess: getGoalsChangeStatus(user, { actorType: "client" }),
    coach: user.coach || {},
    clientCoachNotice: user.clientCoachNotice || null,
    coachChangeRequest: user.coachChangeRequest || null,
    billing: user.billing || {},
    subscription: user.subscription || {},

    antropometriaActual: user.antropometriaActual || {},
    metasActuales: user.metasActuales || {},
    stats: user.stats || {},
    progress: user.progress || {},

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
      activeSource: user?.menu?.activeSource || "none",
      activeOwnMenuId: user?.menu?.activeOwnMenuId || null,
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

      if (!req.user?.impersonation) {
        await this.servicio.touchLastActivity(id);
      }

      const user = await this.servicio.getById(id);
      if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

      return res.json({
        user: {
          ...mapUserPublic(user),
          impersonation: req.user?.impersonation
            ? {
                active: true,
                readOnly: !!req.user?.readOnly,
                actorAdminId: req.user?.actorAdminId || null,
                targetUserId: req.user?.targetUserId || id,
                sessionId: req.user?.impersonationSessionId || null,
                startedAt: req.user?.impersonationStartedAt || null,
              }
            : null,
        },
      });
    } catch (error) {
      console.error("Error me:", error);
      return res.status(500).json({ error: "Error en el servidor" });
    }
  };

  listMyPendingCoachInvitations = async (req, res) => {
    try {
      const userId = req.user?.id || req.user?._id || null;
      const data = await this.servicio.clientListPendingCoachInvitations({ userId });
      return res.json(data);
    } catch (error) {
      return adminError(res, error);
    }
  };

  acceptMyCoachInvitation = async (req, res) => {
    try {
      const userId = req.user?.id || req.user?._id || null;
      const { invitationId } = req.params;
      const data = await this.servicio.clientAcceptCoachInvitation({ userId, invitationId });
      return res.json({
        ok: true,
        invitation: data.invitation,
        user: mapUserPublic(data.user),
        nextPath: data.nextPath,
        requiresOnboarding: !!data.requiresOnboarding,
      });
    } catch (error) {
      return adminError(res, error);
    }
  };

  declineMyCoachInvitation = async (req, res) => {
    try {
      const userId = req.user?.id || req.user?._id || null;
      const { invitationId } = req.params;
      const data = await this.servicio.clientDeclineCoachInvitation({ userId, invitationId });
      return res.json({
        ok: true,
        invitation: data.invitation,
        user: mapUserPublic(data.user),
      });
    } catch (error) {
      return adminError(res, error);
    }
  };

  blockMyCoachInvitation = async (req, res) => {
    try {
      const userId = req.user?.id || req.user?._id || null;
      const { invitationId } = req.params;
      const body = req.body || {};
      const data = await this.servicio.clientBlockCoachFromInvitation({
        userId,
        invitationId,
        reportedAsSpam: !!body.reportedAsSpam,
        reportReason: body.reportReason || "",
        comment: body.comment || "",
      });
      return res.json({
        ok: true,
        status: data.status,
        user: mapUserPublic(data.user),
      });
    } catch (error) {
      return adminError(res, error);
    }
  };

  listMyBlockedCoaches = async (req, res) => {
    try {
      const userId = req.user?.id || req.user?._id || null;
      const data = await this.servicio.clientListBlockedCoaches({ userId });
      return res.json(data);
    } catch (error) {
      return adminError(res, error);
    }
  };

  unblockMyCoach = async (req, res) => {
    try {
      const userId = req.user?.id || req.user?._id || null;
      const { coachId } = req.params;
      const data = await this.servicio.clientUnblockCoach({ userId, coachId });
      return res.json({ ok: true, ...data });
    } catch (error) {
      return adminError(res, error);
    }
  };

  dismissMyCoachNotice = async (req, res) => {
    try {
      const userId = req.user?.id || req.user?._id || null;
      const data = await this.servicio.clientDismissCoachNotice({ userId });
      return res.json({
        ok: true,
        user: mapUserPublic(data.user),
      });
    } catch (error) {
      return adminError(res, error);
    }
  };

  leaveMyCoach = async (req, res) => {
    try {
      const userId = req.user?.id || req.user?._id || null;
      const data = await this.servicio.clientLeaveCoach({ userId });
      return res.json({
        ok: true,
        status: data.status,
        user: mapUserPublic(data.user),
      });
    } catch (error) {
      return adminError(res, error);
    }
  };

  requestMyCoachChange = async (req, res) => {
    try {
      const userId = req.user?.id || req.user?._id || null;
      const { reason = "" } = req.body || {};
      const data = await this.servicio.clientRequestCoachChange({ userId, reason });
      return res.json({
        ok: true,
        status: data.status,
        request: data.request,
        user: mapUserPublic(data.user),
      });
    } catch (error) {
      return adminError(res, error);
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

      if (msg === "INVITATION_NOT_FOUND") {
        return res.status(404).json({ error: "La invitacion ya no esta disponible" });
      }
      if (msg === "COACH_NOT_ACTIVE" || msg === "COACH_NOT_AVAILABLE" || msg === "COACH_INVITES_DISABLED") {
        return res.status(409).json({ error: "El coach ya no puede recibir este cliente" });
      }
      if (msg === "COACH_CLIENT_LIMIT_REACHED" || msg === "COACH_CLIENT_LIMIT_EXCEEDED") {
        return res.status(409).json({
          code: "COACH_CLIENT_LIMIT_EXCEEDED",
          error: "El coach alcanzo el limite de clientes activos.",
          current: Number(error?.current || 0),
          limit: Number(error?.limit || 0),
        });
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

      if (!req.user?.impersonation) {
        await this.servicio.touchLastActivity(id);
      }

      const user = await this.servicio.getById(id);
      if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

      return res.json(mapUserPublic(user));
    } catch (error) {
      console.error("Error obtenerPerfil:", error);
      return res.status(500).json({ error: "Error al obtener perfil" });
    }
  };

  getMyMenuTrackingWeek = async (req, res) => {
    try {
      const data = await this.servicio.getMyMenuTrackingWeek(req.user, req.query || {});
      return res.json(data);
    } catch (error) {
      return adminError(res, error);
    }
  };

  listMyMenuTracking = async (req, res) => {
    try {
      const data = await this.servicio.listMyMenuTracking(req.user, req.query || {});
      return res.json(data);
    } catch (error) {
      return adminError(res, error);
    }
  };

  upsertMyMenuTrackingDay = async (req, res) => {
    try {
      const data = await this.servicio.upsertMyMenuTrackingDay(req.user, req.body || {});
      return res.json(data);
    } catch (error) {
      return adminError(res, error);
    }
  };

  patchMyMenuTrackingDay = async (req, res) => {
    try {
      const data = await this.servicio.upsertMyMenuTrackingDay(req.user, {
        ...(req.body || {}),
        date: req.params.date,
      });
      return res.json(data);
    } catch (error) {
      return adminError(res, error);
    }
  };

  updateMyMenuTrackingDayCompletion = async (req, res) => {
    try {
      const data = await this.servicio.updateMyMenuTrackingDayCompletion(
        req.user,
        req.params.date,
        req.body || {}
      );
      return res.json(data);
    } catch (error) {
      return adminError(res, error);
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
      const r = await this.servicio.adminDeleteUser(id, req.user?.id || req.user?._id || null);

      const notDeleted =
        r === null ||
        r === undefined ||
        r?.result?.deletedCount === 0 ||
        r?.deletedCount === 0 ||
        (r?.acknowledged === true && r?.deletedCount === 0);

      if (notDeleted) {
        return res.status(404).json({ error: "Usuario no encontrado" });
      }

      return res.json({
        message: "Usuario eliminado",
        unassignedClients: r?.unassignedClients || { matchedCount: 0, modifiedCount: 0 },
      });
    } catch (error) {
      return adminError(res, error);
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
      const { plan, resetOverrides = false } = req.body || {};

      const user = await this.servicio.adminUpdatePlan(id, plan, { resetOverrides });
      return res.json({ ok: true, user: mapUserPublic(user) });
    } catch (error) {
      return adminError(res, error);
    }
  };

  adminListCoachPlans = async (req, res) => {
    try {
      const plans = await this.servicio.adminListCoachPlans();
      return res.json({ plans });
    } catch (error) {
      return adminError(res, error);
    }
  };

  adminGetCoachPlan = async (req, res) => {
    try {
      const plan = await this.servicio.adminGetCoachPlan(req.params.planCode);
      return res.json({ plan });
    } catch (error) {
      return adminError(res, error);
    }
  };

  adminUpdateCoachPlanConfig = async (req, res) => {
    try {
      const plan = await this.servicio.adminUpdateCoachPlanConfig(req.params.planCode, req.body || {}, {
        updatedBy: req.user?.id || req.user?._id || null,
      });
      return res.json({ ok: true, plan });
    } catch (error) {
      return adminError(res, error);
    }
  };

  adminResetCoachPlanConfig = async (req, res) => {
    try {
      const plan = await this.servicio.adminResetCoachPlanConfig(req.params.planCode, {
        updatedBy: req.user?.id || req.user?._id || null,
      });
      return res.json({ ok: true, plan });
    } catch (error) {
      return adminError(res, error);
    }
  };

  adminListClientPlans = async (req, res) => {
    try {
      const plans = await this.servicio.adminListClientPlans();
      return res.json({ plans });
    } catch (error) {
      return adminError(res, error);
    }
  };

  adminGetClientPlan = async (req, res) => {
    try {
      const plan = await this.servicio.adminGetClientPlan(req.params.planCode);
      return res.json({ plan });
    } catch (error) {
      return adminError(res, error);
    }
  };

  adminUpdateClientPlanConfig = async (req, res) => {
    try {
      const plan = await this.servicio.adminUpdateClientPlanConfig(req.params.planCode, req.body || {}, {
        updatedBy: req.user?.id || req.user?._id || null,
      });
      return res.json({ ok: true, plan });
    } catch (error) {
      return adminError(res, error);
    }
  };

  adminResetClientPlanConfig = async (req, res) => {
    try {
      const plan = await this.servicio.adminResetClientPlanConfig(req.params.planCode, {
        updatedBy: req.user?.id || req.user?._id || null,
      });
      return res.json({ ok: true, plan });
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

  clientUpdateGoals = async (req, res) => {
    try {
      const userId = req.user?.id || req.user?._id || null;
      const user = await this.servicio.clientUpdateGoals(userId, req.body || {});
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

  getMyCoachClients = async (req, res) => {
    try {
      const coachId = req.user?.id || req.user?._id || null;
      const data = await this.servicio.getMyCoachClients(coachId);

      return res.json({
        coach: mapUserPublic(data.coach),
        clients: (data.clients || []).map((u) => mapUserPublic(u)),
        total: data.total || 0,
      });
    } catch (error) {
      return adminError(res, error);
    }
  };

  listMyClientInvitations = async (req, res) => {
    try {
      const coachId = req.user?.id || req.user?._id || null;
      const {
        search = "",
        status = "todos",
        limit = 100,
        skip = 0,
      } = req.query || {};

      const data = await this.servicio.coachListClientInvitations({
        coachId,
        search: String(search || "").trim(),
        status: String(status || "").trim(),
        limit: Number(limit || 100),
        skip: Number(skip || 0),
      });

      return res.json(data);
    } catch (error) {
      return adminError(res, error);
    }
  };

  createMyClientInvitation = async (req, res) => {
    try {
      const coachId = req.user?.id || req.user?._id || null;
      const body = req.body || {};

      const data = await this.servicio.coachCreateClientInvitation({
        coachId,
        email: body.email,
        profile: body.profile || {
          nombre: body.nombre,
          apellido: body.apellido,
        },
        onboarding: body.onboarding || {},
        clientPermissions: body.clientPermissions || {},
        servicePackage: body.servicePackage || body.coachAccess?.servicePackage || "service_pro",
      });

      return res.status(data?.alreadyExists ? 200 : 201).json({ ok: true, ...data });
    } catch (error) {
      return adminError(res, error);
    }
  };

  getMyClientInvitation = async (req, res) => {
    try {
      const coachId = req.user?.id || req.user?._id || null;
      const { invitationId } = req.params;
      const invitation = await this.servicio.coachGetClientInvitation({
        coachId,
        invitationId,
      });

      return res.json({ invitation });
    } catch (error) {
      return adminError(res, error);
    }
  };

  cancelMyClientInvitation = async (req, res) => {
    try {
      const coachId = req.user?.id || req.user?._id || null;
      const { invitationId } = req.params;
      const invitation = await this.servicio.coachCancelClientInvitation({
        coachId,
        invitationId,
      });

      return res.json({ ok: true, invitation });
    } catch (error) {
      return adminError(res, error);
    }
  };

  deleteMyClientInvitation = async (req, res) => {
    try {
      const coachId = req.user?.id || req.user?._id || null;
      const { invitationId } = req.params;
      const result = await this.servicio.coachDeleteClientInvitation({
        coachId,
        invitationId,
      });

      return res.json({ ok: true, ...result });
    } catch (error) {
      return adminError(res, error);
    }
  };

  activateMyClientInvitation = async (req, res) => {
    try {
      const coachId = req.user?.id || req.user?._id || null;
      const { invitationId } = req.params;
      const data = await this.servicio.coachActivateClientInvitation({
        coachId,
        invitationId,
      });

      return res.json({
        ok: true,
        status: data.status,
        invitation: data.invitation,
        client: mapUserPublic(data.client),
        coach: mapUserPublic(data.coach),
      });
    } catch (error) {
      return adminError(res, error);
    }
  };

  getMyCoachClientDetail = async (req, res) => {
    try {
      const coachId = req.user?.id || req.user?._id || null;
      const { clientId } = req.params;
      const data = await this.servicio.getMyCoachClientDetail({ coachId, clientId });

      return res.json({
        coach: mapUserPublic(data.coach),
        client: mapUserPublic(data.client),
      });
    } catch (error) {
      return adminError(res, error);
    }
  };

  coachEndClientService = async (req, res) => {
    try {
      const coachId = req.user?.id || req.user?._id || null;
      const { clientId } = req.params;
      const { reason = "", reasonNote = "" } = req.body || {};
      const data = await this.servicio.coachEndClientService({
        coachId,
        clientId,
        reason,
        reasonNote,
      });

      return res.json({
        ok: true,
        status: data.status || "unassigned",
        coach: mapUserPublic(data.coach),
        client: mapUserPublic(data.client),
        releasedCapacity: data.releasedCapacity || null,
        revokedMenus: data.revokedMenus || null,
        revokedLibraryMenus: data.revokedLibraryMenus || null,
        revokedLibraryMeals: data.revokedLibraryMeals || null,
        revokedRoutines: data.revokedRoutines || null,
      });
    } catch (error) {
      return adminError(res, error);
    }
  };

  coachUpdateClientNutrition = async (req, res) => {
    try {
      const coachId = req.user?.id || req.user?._id || null;
      const { clientId } = req.params;
      const data = await this.servicio.coachUpdateClientNutrition({
        coachId,
        clientId,
        payload: req.body || {},
      });

      return res.json({
        ok: true,
        coach: mapUserPublic(data.coach),
        client: mapUserPublic(data.client),
        assignmentInvalidation: data.assignmentInvalidation || null,
      });
    } catch (error) {
      return adminError(res, error);
    }
  };

  getCoachClientMenuTracking = async (req, res) => {
    try {
      const coachId = req.user?.id || req.user?._id || null;
      const { clientId } = req.params;
      const data = await this.servicio.getCoachClientMenuTracking({
        coachId,
        clientId,
        query: req.query || {},
      });
      return res.json(data);
    } catch (error) {
      return adminError(res, error);
    }
  };

  coachUpdateClientMenu = async (req, res) => {
    try {
      const coachId = req.user?.id || req.user?._id || null;
      const { clientId } = req.params;
      const data = await this.servicio.coachUpdateClientMenu({
        coachId,
        clientId,
        payload: req.body || {},
      });

      return res.json({
        ok: true,
        coach: mapUserPublic(data.coach),
        client: mapUserPublic(data.client),
      });
    } catch (error) {
      return adminError(res, error);
    }
  };

  coachUpdateClientRoutine = async (req, res) => {
    try {
      const coachId = req.user?.id || req.user?._id || null;
      const { clientId } = req.params;
      const data = await this.servicio.coachUpdateClientRoutine({
        coachId,
        clientId,
        payload: req.body || {},
      });

      return res.json({
        ok: true,
        coach: mapUserPublic(data.coach),
        client: mapUserPublic(data.client),
      });
    } catch (error) {
      return adminError(res, error);
    }
  };

  coachUpdateClientProgress = async (req, res) => {
    try {
      const coachId = req.user?.id || req.user?._id || null;
      const { clientId } = req.params;
      const data = await this.servicio.coachUpdateClientProgress({
        coachId,
        clientId,
        payload: req.body || {},
      });

      return res.json({
        ok: true,
        coach: mapUserPublic(data.coach),
        client: mapUserPublic(data.client),
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

  adminUpdateCoachPlan = async (req, res) => {
    try {
      const { id } = req.params;
      const user = await this.servicio.adminUpdateCoachPlan(id, req.body || {});
      return res.json({ ok: true, user: mapUserPublic(user) });
    } catch (error) {
      return adminError(res, error);
    }
  };

  adminPreviewCoachPlan = async (req, res) => {
    try {
      const { id } = req.params;
      const preview = await this.servicio.adminPreviewCoachPlan(id, {
        plan: req.query?.plan,
        resetOverrides: String(req.query?.resetOverrides || "").toLowerCase() === "true",
      });
      return res.json({ ok: true, preview });
    } catch (error) {
      return adminError(res, error);
    }
  };

  adminUpdateCoachOverrides = async (req, res) => {
    try {
      const { id } = req.params;
      const user = await this.servicio.adminUpdateCoachOverrides(id, req.body || {}, {
        updatedBy: req.user?.id || req.user?._id || null,
      });
      return res.json({ ok: true, user: mapUserPublic(user) });
    } catch (error) {
      return adminError(res, error);
    }
  };

  adminDeleteCoachOverrides = async (req, res) => {
    try {
      const { id } = req.params;
      const user = await this.servicio.adminDeleteCoachOverrides(id, {
        updatedBy: req.user?.id || req.user?._id || null,
      });
      return res.json({ ok: true, user: mapUserPublic(user) });
    } catch (error) {
      return adminError(res, error);
    }
  };

  adminGetEffectiveCapabilities = async (req, res) => {
    try {
      const { id } = req.params;
      const data = await this.servicio.adminGetEffectiveCapabilities(id);
      return res.json({
        user: mapUserPublic(data.user),
        effectiveCapabilities: data.effectiveCapabilities,
      });
    } catch (error) {
      return adminError(res, error);
    }
  };

  adminStartImpersonation = async (req, res) => {
    try {
      const { id } = req.params;
      const data = await this.servicio.adminStartImpersonation({
        adminId: req.user?.id || req.user?._id,
        targetUserId: id,
      });

      return res.json({
        ok: true,
        token: data.token,
        expiresAt: data.expiresAt,
        sessionId: data.sessionId,
        actorAdminId: data.actorAdminId,
        targetUser: mapUserPublic(data.targetUser),
        readOnly: true,
      });
    } catch (error) {
      return adminError(res, error);
    }
  };

  adminStopImpersonation = async (req, res) => {
    try {
      const data = await this.servicio.adminStopImpersonation(req.user || {});
      return res.json({ ok: true, ...data });
    } catch (error) {
      return adminError(res, error);
    }
  };

  adminGetCurrentImpersonation = async (req, res) => {
    try {
      const data = await this.servicio.adminGetCurrentImpersonation(req.user || {});
      if (!data?.active) return res.json({ active: false });

      return res.json({
        active: true,
        readOnly: data.readOnly,
        actorAdminId: data.actorAdminId,
        sessionId: data.sessionId,
        startedAt: data.startedAt,
        targetUser: mapUserPublic(data.targetUser),
      });
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

      if (msg === "USUARIO_BLOQUEADO") {
        return res.redirect(`${frontendBase}/auth?blocked=1`);
      }

      return res.redirect(`${frontendBase}/auth?google=error`);
    }
  };
}

export default ControladorUsuarios;
