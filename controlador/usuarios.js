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

      res.cookie("access_token", token, { ...getCookieOptions(), maxAge: 7 * 24 * 60 * 60 * 1000 });

      return res.json({
        user: {
          id: user._id,
          email: user.email,
          role: user.role,
          profile: user.profile || {},
          settings: user.settings || {},
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
      // evitar cache
      res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.set("Pragma", "no-cache");
      res.set("Expires", "0");

      const { id } = req.user;
      const user = await this.servicio.getById(id);
      if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

      return res.json({
        user: {
          id: user._id,
          email: user.email,
          role: user.role,
          profile: user.profile || {},
          settings: user.settings || {},
          metas: user.metas || {},
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

      await this.servicio.registerCliente({
        email,
        password,
        profile: { nombre, apellido, fechaNacimiento },
      });

      return res.status(200).json({
        pending: true,
        message: "Te enviamos un código al email. Ingresalo para activar tu cuenta.",
      });
    } catch (error) {
      const msg = String(error?.message || "");
      console.error("Error register cliente:", error);

      if (isDuplicateEmailError(error)) return res.status(409).json({ error: "Ese email ya está registrado" });
      if (msg === "EMAIL_PENDIENTE") return res.status(409).json({ error: "Ya hay una verificación pendiente. Reenviá el código." });

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

  resendVerifyCode = async (req, res) => {
    try {
      let { email } = req.body || {};
      email = normalizeEmail(email);

      if (!email) return res.status(400).json({ error: "Email requerido" });

      await this.servicio.resendVerifyCode(email);
      return res.json({ ok: true, message: "Código reenviado ✅" });
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

  // ✅ GOOGLE CALLBACK (con state -> returnTo)
  googleCallback = async (req, res) => {
    const frontendBase =
      process.env.FRONTEND_URL ||
      process.env.APP_PUBLIC_URL ||
      "http://localhost:5173";

    const parsed = decodeState(req.query?.state);
    const returnTo = parsed?.returnTo || `${frontendBase}/app/inicio`;

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

      // cookie
      const cookieOptions = { ...getCookieOptions(), maxAge: 7 * 24 * 60 * 60 * 1000 };
      res.cookie("access_token", token, cookieOptions);

      console.log("✅ [GOOGLE] cookie seteada -> options:", cookieOptions);
      console.log("✅ [GOOGLE] set-cookie header =", res.getHeader("set-cookie"));

      console.log("✅ [GOOGLE] redirect final a:", returnTo);
      return res.redirect(returnTo);
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
          email: user.email,
          role: user.role,
          profile: user.profile || {},
          settings: user.settings || {},
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
