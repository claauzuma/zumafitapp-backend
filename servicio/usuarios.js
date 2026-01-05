import ModelFactory from "../model/DAO/usuariosFactory.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

class ServicioUsuarios {
  constructor(persistencia) {
    this.model = ModelFactory.get(persistencia);
  }

  // -------------------------
  // Helpers internos
  // -------------------------

  async _findUserByEmail(email) {
    if (!email) return null;

    // Si el modelo tiene obtenerPorEmail, genial
    if (typeof this.model.obtenerPorEmail === "function") {
      return await this.model.obtenerPorEmail(email);
    }

    // Fallback (como lo tenías): traer todos y buscar
    if (typeof this.model.obtenerUsuarios === "function") {
      const usuarios = await this.model.obtenerUsuarios();
      return usuarios.find((u) => (u.email || "").toLowerCase() === email.toLowerCase()) || null;
    }

    throw new Error("El modelo no implementa obtenerPorEmail ni obtenerUsuarios");
  }

  _normalizeUser(u) {
    if (!u) return null;

    // soporta diferentes shapes (Mongo _id vs id)
    const id = u._id?.toString?.() || u.id?.toString?.() || u._id || u.id;

    return {
      ...u,
      _id: id,               // para que el controlador use user._id
      id,                    // por si lo necesitás
      email: u.email,
      role: u.role || u.rol, // soporta legacy
      passwordHash: u.passwordHash || u.password, // soporta legacy
    };
  }

  async _createUser(data) {
    if (typeof this.model.registrarUsuario === "function") {
      return await this.model.registrarUsuario(data);
    }
    if (typeof this.model.crearUsuario === "function") {
      return await this.model.crearUsuario(data);
    }
    throw new Error("El modelo no implementa registrarUsuario/crearUsuario");
  }

  async _updateById(id, updates) {
    // Intenta varios nombres de función (según tu DAO actual)
    if (typeof this.model.updateById === "function") return await this.model.updateById(id, updates);
    if (typeof this.model.actualizarPorId === "function") return await this.model.actualizarPorId(id, updates);
    if (typeof this.model.actualizarPerfil === "function") return await this.model.actualizarPerfil(id, updates);

    throw new Error("El modelo no implementa updateById/actualizarPorId/actualizarPerfil");
  }

  // -------------------------
  // AUTH
  // -------------------------

  /**
   * login(email, password) -> { user, token } | null
   * Token payload: { uid, email, role }
   */
  login = async (email, password) => {
    if (!process.env.JWT_SECRET) throw new Error("Falta JWT_SECRET en .env");

    const userRaw = await this._findUserByEmail(email);
    if (!userRaw) return null;

    const user = this._normalizeUser(userRaw);

    if (user.estado === "bloqueado") {
      // por seguridad: no digas “bloqueado” al usuario final si no querés
      return null;
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

    // opcional: registrar lastLoginAt si tu modelo lo soporta
    try {
      await this._updateById(user._id, { lastLoginAt: new Date() });
    } catch {
      // si tu DAO no lo tiene, no pasa nada
    }

    // No devolver hash al controlador
    const safeUser = {
      _id: user._id,
      email: user.email,
      role: user.role,
      profile: user.profile || {},
      settings: user.settings || {},
      estado: user.estado,
    };

    return { user: safeUser, token };
  };

  // -------------------------
  // REGISTER
  // -------------------------

  registerCliente = async ({ email, password, profile = {} }) => {
    if (!email || !password) throw new Error("Email y password requeridos");

    const exists = await this._findUserByEmail(email);
    if (exists) throw new Error("EMAIL_DUPLICADO");

    const passwordHash = await bcrypt.hash(password, 10);

    const userToCreate = {
      email,
      passwordHash,
      role: "cliente",
      estado: "activo",
      emailVerificado: false,
      profile,
      settings: {},
      metas: { calorias: 0, proteinas: 0, carbohidratos: 0, grasas: 0 },
      favoritosComidas: [],
      lastLoginAt: null,
    };

    const created = await this._createUser(userToCreate);
    return this._normalizeUser(created);
  };

  /**
   * Admin crea usuario (admin/cliente)
   * crearUsuario({email,password,role,profile})
   */
  crearUsuario = async ({ email, password, role = "cliente", profile = {} }) => {
    if (!email || !password) throw new Error("Email y password requeridos");
    if (!["admin", "cliente"].includes(role)) throw new Error("ROL_INVALIDO");

    const exists = await this._findUserByEmail(email);
    if (exists) throw new Error("EMAIL_DUPLICADO");

    const passwordHash = await bcrypt.hash(password, 10);

    const userToCreate = {
      email,
      passwordHash,
      role,
      estado: "activo",
      emailVerificado: false,
      profile,
      settings: {},
      metas: { calorias: 0, proteinas: 0, carbohidratos: 0, grasas: 0 },
      favoritosComidas: [],
      lastLoginAt: null,
    };

    const created = await this._createUser(userToCreate);
    return this._normalizeUser(created);
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
}

export default ServicioUsuarios;

