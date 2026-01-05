import Servicio from "../servicio/usuarios.js";
import cloudinary from "cloudinary";

/**
 * Cookie options:
 * - Dev: sameSite=lax, secure=false (ideal con localhost y LAN)
 * - Prod (https): sameSite=none, secure=true
 */
function getCookieOptions() {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd,                 // PROD: true (https)
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

class ControladorUsuarios {
  constructor(persistencia) {
    this.servicio = new Servicio(persistencia);
  }

  // =========================
  // AUTH
  // =========================

  // POST /api/usuarios/auth/login
  login = async (req, res) => {
    try {
      let { email, password } = req.body || {};
      email = normalizeEmail(email);

      if (!email || !password) {
        return res.status(400).json({ error: "Email y contraseña son requeridos" });
      }

      const result = await this.servicio.login(email, password);
      if (!result) {
        return res.status(401).json({ error: "Credenciales incorrectas" });
      }

      const { user, token } = result;

      // ✅ Set cookie (httpOnly)
      res.cookie("access_token", token, {
        ...getCookieOptions(),
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

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
      console.error("Error login:", error);
      return res.status(500).json({ error: "Error en el servidor" });
    }
  };

  // POST /api/usuarios/auth/logout
  logout = async (req, res) => {
    try {
      // ✅ borrar cookie (mismos flags)
      res.clearCookie("access_token", getCookieOptions());

      // ✅ extra safety: forzar expiración
      res.cookie("access_token", "", { ...getCookieOptions(), maxAge: 0 });

      return res.status(200).json({ message: "Logout exitoso" });
    } catch (error) {
      console.error("Error logout:", error);
      return res.status(500).json({ error: "Error al hacer logout" });
    }
  };

  // GET /api/usuarios/auth/me
  me = async (req, res) => {
    try {
      // ✅ IMPORTANTÍSIMO: evitar cache (chau 304 en celu)
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

  // =========================
  // REGISTER
  // =========================

  // POST /api/usuarios/auth/register
  registerCliente = async (req, res) => {
    try {
      let { email, password, nombre, apellido } = req.body || {};
      email = normalizeEmail(email);

      if (!email || !password) {
        return res.status(400).json({ error: "Email y contraseña son requeridos" });
      }

      const user = await this.servicio.registerCliente({
        email,
        password,
        profile: { nombre, apellido },
      });

      return res.status(201).json({
        user: { id: user._id, email: user.email, role: user.role },
      });
    } catch (error) {
      console.error("Error register cliente:", error);

      if (isDuplicateEmailError(error)) {
        return res.status(409).json({ error: "Ese email ya está registrado" });
      }

      return res.status(500).json({ error: "Error en el servidor" });
    }
  };

  // POST /api/usuarios/users (admin only)
  crearUsuario = async (req, res) => {
    try {
      let { email, password, role = "cliente", profile = {} } = req.body || {};
      email = normalizeEmail(email);

      if (!email || !password) {
        return res.status(400).json({ error: "Email y contraseña son requeridos" });
      }
      if (!["admin", "cliente"].includes(role)) {
        return res.status(400).json({ error: "Rol inválido" });
      }

      const user = await this.servicio.crearUsuario({ email, password, role, profile });

      return res.status(201).json({
        user: { id: user._id, email: user.email, role: user.role },
      });
    } catch (error) {
      console.error("Error crearUsuario:", error);

      if (isDuplicateEmailError(error)) {
        return res.status(409).json({ error: "Ese email ya está registrado" });
      }

      return res.status(500).json({ error: "Error en el servidor" });
    }
  };

  // =========================
  // PERFIL
  // =========================

  // GET /api/usuarios/users/me
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

  // PATCH /api/usuarios/users/me
  actualizarPerfil = async (req, res) => {
    try {
      const { id } = req.user;
      const { profile, settings, metas } = req.body || {};

      const updates = {};
      if (profile) updates.profile = profile;
      if (settings) updates.settings = settings;
      if (metas) updates.metas = metas;

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "No hay campos para actualizar" });
      }

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

  // POST /api/usuarios/users/me/avatar
  subirAvatar = async (req, res) => {
    try {
      const { id } = req.user;

      if (!req.file) {
        return res.status(400).json({ error: "No se recibió imagen (campo 'avatar')" });
      }

      if (!cloudinary?.v2?.uploader) {
        return res.status(500).json({
          error: "Cloudinary no está configurado (cloudinary.v2.config en algún lado)",
        });
      }

      let avatarUrl = null;

      if (req.file.path) {
        const result = await cloudinary.v2.uploader.upload(req.file.path, {
          folder: "avatars",
          resource_type: "image",
        });
        avatarUrl = result.secure_url;
      } else if (req.file.buffer) {
        avatarUrl = await new Promise((resolve, reject) => {
          const stream = cloudinary.v2.uploader.upload_stream(
            { folder: "avatars", resource_type: "image" },
            (err, result) => (err ? reject(err) : resolve(result.secure_url))
          );
          stream.end(req.file.buffer);
        });
      } else {
        return res.status(400).json({ error: "Archivo inválido (sin path ni buffer)" });
      }

      const user = await this.servicio.updateById(id, {
        "profile.avatarUrl": avatarUrl,
      });

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
