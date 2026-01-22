// src/controlador/usuarios.js
import Servicio from "../servicio/usuarios.js";
import cloudinary from "cloudinary";

function getCookieOptions() {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd, // prod:true, dev:false
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

// ✅ helper para no loguear tokens completos
function maskToken(token) {
  if (!token || typeof token !== "string") return token;
  if (token.length <= 16) return "***";
  return token.slice(0, 10) + "..." + token.slice(-6);
}

// ✅ decode state para leer returnTo desde /auth/google -> /auth/google/callback
function decodeState(state) {
  try {
    const json = Buffer.from(String(state || ""), "base64url").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// ✅ helper: agrega query params sin romper los que ya existen
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
    // fallback simple si url no es absoluta
    const sep = url.includes("?") ? "&" : "?";
    const qs = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && String(v) !== "")
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join("&");
    return url + sep + qs;
  }
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

      // ✅ cookie (para navegador)
      res.cookie("access_token", token, {
        ...getCookieOptions(),
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      // ✅ respuesta (para fallback por Authorization si hiciera falta)
      return res.json({
        token,
        user: {
          id: user._id,
          _id: user._id,
          email: user.email,
          role: user.role,
          plan: user.plan || "free",
          tipo: user.tipo || "entrenado",
          estado: user.estado || "activo",
          profile: user.profile || {},
          settings: user.settings || {},
          onboarding: user.onboarding || {},
          preferenciasPlan: user.preferenciasPlan || {},
        },
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
      // Nota: clearCookie necesita las mismas options que al setear cookie
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
      const user = await this.servicio.getById(id);
      if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

      return res.json({
        user: {
          id: user._id,
          _id: user._id,
          email: user.email,
          role: user.role,
          plan: user.plan || "free",
          tipo: user.tipo || "entrenado",
          estado: user.estado || "activo",

          profile: user.profile || {},
          settings: user.settings || {},

          onboarding: user.onboarding || {},

          // ✅ NUEVO
          preferenciasPlan: user.preferenciasPlan || {},

          antropometriaActual: user.antropometriaActual || {},
          objetivoActual: user.objetivoActual || {},
          metasActuales: user.metasActuales || {},
        },
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

      // ✅ respondemos YA
      res.status(200).json({
        pending: true,
        message: "Te enviamos un código al email. Ingresalo para activar tu cuenta.",
      });

      // ✅ mail async (sin colgar el endpoint)
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

      if (isDuplicateEmailError(error)) return res.status(409).json({ error: "Ese email ya está registrado" });
      if (msg === "EMAIL_PENDIENTE")
        return res.status(409).json({ error: "Ya hay una verificación pendiente. Reenviá el código." });

      return res.status(500).json({ error: "Error en el servidor" });
    }
  };

  verifyEmail = async (req, res) => {
    try {
      let { email, code } = req.body || {};
      email = normalizeEmail(email);
      code = String(code || "").trim();

      if (!email || !code) return res.status(400).json({ error: "Email y código son requeridos" });

      await this.servicio.verifyEmail(email, code);
      return res.json({ ok: true, message: "Email verificado ✅ Ya podés iniciar sesión" });
    } catch (error) {
      const msg = String(error?.message || "");

      if (msg === "SIN_PENDIENTE") return res.status(404).json({ error: "No hay verificación pendiente para ese email" });
      if (msg === "CODIGO_EXPIRADO") return res.status(400).json({ error: "El código expiró. Pedí uno nuevo." });
      if (msg === "CODIGO_INVALIDO") return res.status(400).json({ error: "Dígitos incorrectos, volvé a intentar" });
      if (msg === "DEMASIADOS_INTENTOS") return res.status(429).json({ error: "Máximo de intentos alcanzado. Reenviá el código." });
      if (msg === "EMAIL_DUPLICADO") return res.status(409).json({ error: "Ese email ya está registrado" });

      console.error("Error verifyEmail:", error);
      return res.status(500).json({ error: "Error en el servidor" });
    }
  };

  // dentro de ControladorUsuarios
  actualizarOnboardingCliente = async (req, res) => {
    try {
      const userId = req.user?.id || req.user?._id;
      if (!userId) return res.status(401).json({ error: "No autenticado" });

      const { step, data } = req.body || {};
      const s = Number(step);

      if (![1, 2, 3].includes(s)) {
        return res.status(400).json({ error: "Step inválido (debe ser 1, 2 o 3)" });
      }

      // ✅ acá delegamos al servicio
      const user = await this.servicio.actualizarOnboardingCliente(userId, s, data);

      return res.json({ ok: true, user });
    } catch (e) {
      console.error("actualizarOnboardingCliente error:", e);
      return res.status(500).json({ error: e?.message || "Error interno" });
    }
  };

  resendVerifyCode = async (req, res) => {
    try {
      let { email } = req.body || {};
      email = normalizeEmail(email);

      if (!email) return res.status(400).json({ error: "Email requerido" });

      // ✅ 1) el servicio debería generar/guardar un nuevo código y DEVOLVERLO
      const code = await this.servicio.resendVerifyCode(email);

      // ✅ 2) respondemos YA (evita “Reenviando…” infinito)
      res.json({ ok: true, message: "Código reenviado ✅" });

      // ✅ 3) enviamos el mail sin bloquear (si falla, log)
      this.servicio
        .sendVerifyEmail(email, code)
        .then(() => console.log("[MAIL] resend ok ->", email))
        .catch((e) => console.error("[MAIL] resend fail ->", email, e));
    } catch (error) {
      const msg = String(error?.message || "");

      if (msg === "ESPERA_1_MIN") return res.status(429).json({ error: "Esperá 1 minuto antes de reenviar" });
      if (msg === "SIN_PENDIENTE") return res.status(404).json({ error: "No hay verificación pendiente para ese email" });

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
      if (msg === "ESPERA_1_MIN") return res.status(429).json({ error: "Esperá 1 minuto antes de pedir otro código" });

      console.error("Error forgotPassword:", error);
      // por seguridad no revelar si existe o no
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

      if (msg === "CODIGO_EXPIRADO") return res.status(400).json({ error: "El código expiró. Pedí uno nuevo." });
      if (msg === "CODIGO_INVALIDO") return res.status(400).json({ error: "Código inválido. Verificá e intentá de nuevo." });
      if (msg === "DEMASIADOS_INTENTOS") return res.status(429).json({ error: "Máximo de intentos alcanzado. Pedí un nuevo código." });

      console.error("Error resetPassword:", error);
      return res.status(500).json({ error: "Error en el servidor" });
    }
  };

  // =========================
  // ✅ ADMIN: CRUD USERS
  // =========================

  // GET /api/usuarios/admin/users?search=&role=&estado=&tipo=
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

      return res.json(data); // ✅ { users: [...], total: N }
    } catch (error) {
      console.error("Error adminListUsers:", error);
      return res.status(500).json({ error: "Error en el servidor" });
    }
  };

  // POST /api/usuarios/admin/users
  adminCreateUser = async (req, res) => {
    try {
      const {
        email,
        password,
        role = "cliente",
        estado = "activo",
        tipo = "entrenado", // opcional (si lo querés)
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
        estado,
        tipo,
        profile: {
          ...profile,
          nombre: profile?.nombre ?? nombre,
          apellido: profile?.apellido ?? apellido,
          fechaNacimiento: profile?.fechaNacimiento ?? fechaNacimiento,
        },
      });

      return res.status(201).json({ user });
    } catch (error) {
      console.error("Error adminCreateUser:", error);

      if (String(error?.message) === "EMAIL_DUPLICADO") {
        return res.status(409).json({ error: "Ese email ya está registrado" });
      }
      if (String(error?.message) === "ROL_INVALIDO") {
        return res.status(400).json({ error: "Rol inválido" });
      }

      return res.status(500).json({ error: "Error en el servidor" });
    }
  };

  // GET /api/usuarios/admin/users/:id
  adminGetUserById = async (req, res) => {
    try {
      const { id } = req.params;

      const user = await this.servicio.adminGetUserById(id);
      if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

      return res.json({ user });
    } catch (error) {
      console.error("Error adminGetUserById:", error);
      return res.status(500).json({ error: "Error en el servidor" });
    }
  };

  // PATCH /api/usuarios/admin/users/:id
  adminUpdateUser = async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body || {};

      const user = await this.servicio.adminUpdateUser(id, updates);
      return res.json({ user });
    } catch (error) {
      console.error("Error adminUpdateUser:", error);

      const msg = String(error?.message || "");
      if (msg === "NOT_FOUND") return res.status(404).json({ error: "Usuario no encontrado" });
      if (msg === "EMAIL_DUPLICADO") return res.status(409).json({ error: "Ese email ya está registrado" });
      if (msg === "ROL_INVALIDO") return res.status(400).json({ error: "Rol inválido" });

      return res.status(500).json({ error: "Error en el servidor" });
    }
  };

  // DELETE /api/usuarios/admin/users/:id
  adminDeleteUser = async (req, res) => {
    try {
      const { id } = req.params;

      const r = await this.servicio.adminDeleteUser(id);
      if (r?.deletedCount === 0) return res.status(404).json({ error: "Usuario no encontrado" });

      return res.json({ message: "Usuario eliminado" });
    } catch (error) {
      console.error("Error adminDeleteUser:", error);
      return res.status(500).json({ error: "Error en el servidor" });
    }
  };

  // ✅ GOOGLE CALLBACK (con state -> returnTo) + fallback token por query para Safari/ITP
  googleCallback = async (req, res) => {
    const frontendBase =
      process.env.FRONTEND_URL ||
      process.env.APP_PUBLIC_URL ||
      "http://localhost:5173";

    const parsed = decodeState(req.query?.state);
    // ✅ preferimos volver a /auth para que corra el effect de /me y redirija por rol
    const returnTo = parsed?.returnTo || `${frontendBase}/auth`;

    try {
      console.log("✅ [GOOGLE] callback entrando");
      console.log("✅ [GOOGLE] query.state =", req.query?.state);
      console.log("✅ [GOOGLE] parsed.state =", parsed);
      console.log("✅ [GOOGLE] returnTo efectivo =", returnTo);
      console.log("✅ [GOOGLE] req.user =", req.user);

      const payload = req.user; // viene de passport
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

      // ✅ 1) intentamos cookie igual (Chrome/Edge lo guardan)
      const cookieOptions = { ...getCookieOptions(), maxAge: 7 * 24 * 60 * 60 * 1000 };
      res.cookie("access_token", token, cookieOptions);

      console.log("✅ [GOOGLE] cookie seteada -> options:", cookieOptions);
      console.log("✅ [GOOGLE] set-cookie header =", res.getHeader("set-cookie"));

      // ✅ 2) PERO además mandamos token por query para Safari/ITP
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

  obtenerPerfil = async (req, res) => {
    try {
      const { id } = req.user;

      const user = await this.servicio.getById(id);
      if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

      return res.json({
        email: user.email,
        role: user.role,
        profile: user.profile || {},
        settings: user.settings || {},
        metas: user.metas || {},
      });
    } catch (error) {
      console.error("Error obtenerPerfil:", error);
      return res.status(500).json({ error: "Error al obtener perfil" });
    }
  };

  actualizarPerfil = async (req, res) => {
    try {
      const { id } = req.user;
      const { profile, settings, metas } = req.body || {};

      const updates = {};
      if (profile) updates.profile = profile;
      if (settings) updates.settings = settings;
      if (metas) updates.metas = metas;

      if (Object.keys(updates).length === 0) return res.status(400).json({ error: "No hay campos para actualizar" });

      const user = await this.servicio.updateById(id, updates);

      return res.json({
        user: {
          id: user._id,
          _id: user._id,
          email: user.email,
          role: user.role,
          plan: user.plan || "free",
          tipo: user.tipo || "entrenado",
          estado: user.estado || "activo",
          profile: user.profile || {},
          settings: user.settings || {},
          onboarding: user.onboarding || {},
          preferenciasPlan: user.preferenciasPlan || {}, // ✅ NUEVO
          metas: user.metas || {},
        },
      });
    } catch (error) {
      console.error("Error actualizarPerfil:", error);
      return res.status(500).json({ error: "Error al actualizar perfil" });
    }
  };

  subirAvatar = async (req, res) => {
    try {
      const { id } = req.user;

      if (!req.file) return res.status(400).json({ error: "No se recibió imagen (campo 'avatar')" });

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
        user: { id: user._id, email: user.email, role: user.role },
      });
    } catch (error) {
      console.error("Error subirAvatar:", error);
      return res.status(500).json({ error: "Error al subir avatar" });
    }
  };
}

export default ControladorUsuarios;
