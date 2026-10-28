import ModelMongoDBClientCustomFoods from "../model/DAO/clientCustomFoodsMongoDB.js";
import ModelMongoDBUsuarios from "../model/DAO/usuariosMongoDB.js";
import { normalizeClientRole } from "./clientNutritionCapabilities.js";
import { resolveClientAccessContext } from "./clientAccessContext.js";

export const CLIENT_CUSTOM_FOODS_LIMIT = 30;

function serviceError(code, message, status = 400, extra = {}) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  Object.assign(error, extra);
  return error;
}

function cleanText(value = "") {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function keyText(value = "") {
  return cleanText(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function finiteNumber(value, field, { min = 0, max = 5000 } = {}) {
  const normalized = typeof value === "string" ? value.trim().replace(",", ".") : value;
  const number = Number(normalized);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw serviceError("CUSTOM_FOOD_INVALID", `${field} debe estar entre ${min} y ${max}.`);
  }
  return Math.round(number * 100) / 100;
}

function normalizeUnit(value) {
  const unit = keyText(value);
  if (["g", "gr", "gramo", "gramos"].includes(unit)) return "g";
  if (["ml", "mililitro", "mililitros"].includes(unit)) return "ml";
  if (["u", "unid", "unidad", "unidades"].includes(unit)) return "unidad";
  throw serviceError("CUSTOM_FOOD_INVALID", "La unidad debe ser 100 g, 100 ml o 1 unidad.");
}

function customFoodForRead(document = {}) {
  const protein = Number(document.proteinas ?? document.proteina ?? document.Proteinas) || 0;
  const carbs = Number(document.carbohidratos ?? document.carbs ?? document.Carbohidratos) || 0;
  const fat = Number(document.grasas ?? document.Grasas) || 0;
  const derivedCalories = Math.round((protein * 4 + carbs * 4 + fat * 9) * 100) / 100;
  return {
    ...document,
    calorias: derivedCalories,
    Calorias: derivedCalories,
    kcal100: derivedCalories,
    id: String(document._id || document.id || ""),
    _id: String(document._id || document.id || ""),
    ownerId: String(document.ownerId || ""),
    customFood: true,
    privateFood: true,
  };
}

function customFoodDocument(payload = {}, ownerId, now = new Date()) {
  const nombre = cleanText(payload.nombre ?? payload.name);
  if (nombre.length < 2 || nombre.length > 80) {
    throw serviceError("CUSTOM_FOOD_INVALID", "El nombre debe tener entre 2 y 80 caracteres.");
  }

  const unidadBase = normalizeUnit(payload.unidad ?? payload.unit ?? "g");
  const proteinas = finiteNumber(payload.proteinas ?? payload.proteina ?? payload.protein, "Las proteinas", { max: 100 });
  const carbohidratos = finiteNumber(payload.carbohidratos ?? payload.carbs, "Los carbohidratos", { max: 100 });
  const grasas = finiteNumber(payload.grasas ?? payload.fat, "Las grasas", { max: 100 });
  // Las kcal son un dato derivado y nunca confiamos en un valor enviado por el
  // cliente: 4 kcal por gramo de P/C y 9 kcal por gramo de grasa.
  const calorias = Math.round((proteinas * 4 + carbohidratos * 4 + grasas * 9) * 100) / 100;
  if (calorias === 0 && proteinas === 0 && carbohidratos === 0 && grasas === 0) {
    throw serviceError("CUSTOM_FOOD_INVALID", "Ingresa al menos un valor nutricional mayor a cero.");
  }

  return {
    ownerId: String(ownerId),
    nombre,
    Alimentos: nombre,
    nombreKey: keyText(nombre),
    unidad: unidadBase,
    Unidad: unidadBase,
    unidadBase,
    cantidadBase: unidadBase === "unidad" ? 1 : 100,
    cantidadUnidad: unidadBase === "unidad" ? 1 : 100,
    macroBasis: unidadBase === "unidad" ? "perUnit" : "per100",
    calorias,
    Calorias: calorias,
    kcal100: calorias,
    proteinas,
    Proteinas: proteinas,
    proteina100: proteinas,
    carbohidratos,
    Carbohidratos: carbohidratos,
    carbohidratos100: carbohidratos,
    grasas,
    Grasas: grasas,
    grasas100: grasas,
    fuente: "Alimento personalizado",
    categoria: "Personalizado",
    customFood: true,
    privateFood: true,
    activo: true,
    generation: {
      mode: "EXPLICIT_ONLY",
      roles: {},
      mealTypes: {},
      portionRule: { unit: unidadBase, min: 1, max: null, step: 1, allowedValues: [] },
    },
    createdAt: now,
    updatedAt: now,
  };
}

function actorId(actor = {}) {
  return String(actor?.targetUserId || actor?.id || actor?._id || "").trim();
}

function actorRole(actor = {}) {
  return normalizeClientRole(actor?.targetRole || actor?.role || actor?.rol || "");
}

export default class ServicioClientCustomFoods {
  constructor({
    model = new ModelMongoDBClientCustomFoods(),
    userModel = new ModelMongoDBUsuarios(),
  } = {}) {
    this.model = model;
    this.userModel = userModel;
  }

  async access(actor = {}) {
    const id = actorId(actor);
    const role = actorRole(actor);
    if (!id) throw serviceError("UNAUTHENTICATED", "No autenticado.", 401);
    if (role === "admin") return { id, role, canCreate: false, limit: CLIENT_CUSTOM_FOODS_LIMIT };
    if (role !== "cliente") {
      throw serviceError("CUSTOM_FOOD_FORBIDDEN", "Esta biblioteca es exclusiva para clientes Pro.", 403);
    }
    const actorHasPlanContext = ["personalPlan", "plan", "personalSubscription", "subscription", "personalTrial", "trial"]
      .some((field) => Object.prototype.hasOwnProperty.call(actor || {}, field));
    const storedUser = typeof this.userModel?.obtenerPorId === "function"
      ? await this.userModel.obtenerPorId(id)
      : null;
    const user = storedUser || (actorHasPlanContext ? actor : null);
    if (!user) throw serviceError("USER_NOT_FOUND", "El usuario no existe.", 404);
    const accessContext = resolveClientAccessContext(user);
    const capabilities = accessContext.capabilities || {};
    return {
      id,
      role,
      canCreate: capabilities.canCreateCustomFoods === true,
      limit: Number(capabilities?.limits?.customFoods) || 0,
      plan: capabilities.plan || accessContext.coachService?.id || accessContext.personalPlan,
    };
  }

  async list(actor = {}) {
    const access = await this.access(actor);
    const documents = access.role === "admin"
      ? await this.model.listAll()
      : await this.model.listByOwner(access.id);
    let ownerIndex = new Map();
    if (access.role === "admin" && typeof this.userModel.obtenerUsuarios === "function") {
      const users = await this.userModel.obtenerUsuarios();
      ownerIndex = new Map((Array.isArray(users) ? users : []).map((user) => [
        String(user?._id || user?.id || ""),
        {
          id: String(user?._id || user?.id || ""),
          nombre: cleanText(user?.nombre || user?.name || `${user?.nombre || ""} ${user?.apellido || ""}`) || "Cliente",
          email: cleanText(user?.email),
        },
      ]));
    }
    const items = documents.map((document) => ({
      ...customFoodForRead(document),
      ...(access.role === "admin" ? { owner: ownerIndex.get(String(document.ownerId)) || null } : {}),
    }));
    return {
      items,
      usage: access.role === "admin" ? items.length : items.length,
      limit: access.role === "admin" ? null : access.limit,
      canCreate: access.canCreate,
      plan: access.plan || "admin",
    };
  }

  async visibleFoods(actor = {}) {
    if (!actorId(actor)) return [];
    const access = await this.access(actor);
    const documents = access.role === "admin"
      ? await this.model.listAll()
      : await this.model.listByOwner(access.id);
    return documents.map(customFoodForRead);
  }

  async create(actor = {}, payload = {}) {
    const access = await this.access(actor);
    if (!access.canCreate || access.limit <= 0) {
      throw serviceError("CUSTOM_FOOD_PLAN_REQUIRED", "Crear alimentos personalizados requiere un plan Pro o VIP.", 403);
    }
    const used = await this.model.countByOwner(access.id);
    if (used >= access.limit) {
      throw serviceError("CUSTOM_FOOD_LIMIT", `Alcanzaste el limite de ${access.limit} alimentos personalizados.`, 409, {
        usage: used,
        limit: access.limit,
      });
    }
    try {
      const created = await this.model.create(customFoodDocument(payload, access.id));
      return customFoodForRead(created);
    } catch (error) {
      if (error?.code === 11000) {
        throw serviceError("CUSTOM_FOOD_DUPLICATE", "Ya creaste un alimento con ese nombre y unidad.", 409);
      }
      throw error;
    }
  }

  async update(actor = {}, id, payload = {}) {
    const access = await this.access(actor);
    const current = await this.model.findById(id);
    if (!current) throw serviceError("CUSTOM_FOOD_NOT_FOUND", "El alimento personalizado no existe.", 404);
    if (access.role !== "admin" && String(current.ownerId) !== access.id) {
      throw serviceError("CUSTOM_FOOD_FORBIDDEN", "No podes editar alimentos de otro usuario.", 403);
    }
    if (access.role !== "admin" && !access.canCreate) {
      throw serviceError("CUSTOM_FOOD_PLAN_REQUIRED", "Editar alimentos personalizados requiere un plan Pro o VIP.", 403);
    }
    const replacement = customFoodDocument(payload, current.ownerId, current.createdAt || new Date());
    delete replacement.ownerId;
    replacement.updatedAt = new Date();
    try {
      const updated = await this.model.updateById(id, replacement);
      return customFoodForRead(updated);
    } catch (error) {
      if (error?.code === 11000) {
        throw serviceError("CUSTOM_FOOD_DUPLICATE", "Ya existe un alimento con ese nombre y unidad.", 409);
      }
      throw error;
    }
  }

  async remove(actor = {}, id) {
    const access = await this.access(actor);
    const current = await this.model.findById(id);
    if (!current) throw serviceError("CUSTOM_FOOD_NOT_FOUND", "El alimento personalizado no existe.", 404);
    if (access.role !== "admin" && String(current.ownerId) !== access.id) {
      throw serviceError("CUSTOM_FOOD_FORBIDDEN", "No podes eliminar alimentos de otro usuario.", 403);
    }
    await this.model.deleteById(id);
    return { deleted: true, id: String(id) };
  }
}

export { customFoodDocument, customFoodForRead };
