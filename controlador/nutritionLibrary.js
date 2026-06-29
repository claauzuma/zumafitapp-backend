import ServicioNutritionLibrary from "../servicio/nutritionLibrary.js";
import { accessErrorPayload, isAccessGateError } from "../servicio/accessGates.js";

function sendError(res, error) {
  const msg = String(error?.message || "");

  if (msg === "NO_AUTENTICADO") return res.status(401).json({ error: "No autenticado" });
  if (isAccessGateError(error)) return res.status(msg === "PLAN_CAPABILITY_REQUIRED" ? 403 : 409).json(accessErrorPayload(error));
  if (msg === "FORBIDDEN") return res.status(403).json({ error: "No tenes permisos para este contenido" });
  if (msg === "NOT_FOUND") return res.status(404).json({ error: "Contenido no encontrado" });
  if (msg === "ID_INVALIDO") return res.status(400).json({ error: "ID invalido" });
  if (msg === "CLIENTES_REQUERIDOS") return res.status(400).json({ error: "Selecciona al menos un cliente" });
  if (msg === "CLIENTE_INVALIDO") return res.status(400).json({ error: "Cliente invalido" });
  if (msg === "CLIENT_NOT_ASSIGNED_TO_COACH") {
    return res.status(403).json({ error: "Ese cliente no esta asignado a tu cuenta profesional" });
  }
  if (msg === "PLAN_LIMIT_REACHED") {
    return res.status(409).json({
      code: "PLAN_LIMIT_REACHED",
      error: `Alcanzaste el limite de ${error?.limit ?? ""} menus de tu plan`,
      resource: error?.resource,
      current: error?.current,
      limit: error?.limit,
      plan: error?.plan,
    });
  }

  console.error("Error nutritionLibrary:", error);
  return res.status(500).json({ error: "Error en el servidor" });
}

class ControladorNutritionLibrary {
  constructor() {
    this.servicio = new ServicioNutritionLibrary();
  }

  listMeals = async (req, res) => {
    try {
      const data = await this.servicio.listMeals(req.user, req.query || {});
      return res.json(data);
    } catch (error) {
      return sendError(res, error);
    }
  };

  listMenus = async (req, res) => {
    try {
      const data = await this.servicio.listMenus(req.user, req.query || {});
      return res.json(data);
    } catch (error) {
      return sendError(res, error);
    }
  };

  copyMeal = async (req, res) => {
    try {
      const comida = await this.servicio.copyMealToMine(req.user, req.params.id, req.body || {});
      return res.status(201).json({ ok: true, comida });
    } catch (error) {
      return sendError(res, error);
    }
  };

  copyMenu = async (req, res) => {
    try {
      const menu = await this.servicio.copyMenuToMine(req.user, req.params.id, req.body || {});
      return res.status(201).json({ ok: true, menu });
    } catch (error) {
      return sendError(res, error);
    }
  };

  favoriteMeal = async (req, res) => {
    try {
      const comida = await this.servicio.setMealFavorite(req.user, req.params.id, true);
      return res.json({ ok: true, comida });
    } catch (error) {
      return sendError(res, error);
    }
  };

  unfavoriteMeal = async (req, res) => {
    try {
      const comida = await this.servicio.setMealFavorite(req.user, req.params.id, false);
      return res.json({ ok: true, comida });
    } catch (error) {
      return sendError(res, error);
    }
  };

  favoriteMenu = async (req, res) => {
    try {
      const menu = await this.servicio.setMenuFavorite(req.user, req.params.id, true);
      return res.json({ ok: true, menu });
    } catch (error) {
      return sendError(res, error);
    }
  };

  unfavoriteMenu = async (req, res) => {
    try {
      const menu = await this.servicio.setMenuFavorite(req.user, req.params.id, false);
      return res.json({ ok: true, menu });
    } catch (error) {
      return sendError(res, error);
    }
  };

  assignMeal = async (req, res) => {
    try {
      const ids = req.body?.clientIds || req.body?.clienteIds || req.body?.clientes || req.body?.clienteId || [];
      const comida = await this.servicio.assignMealToClients(req.user, req.params.id, ids);
      return res.json({ ok: true, comida });
    } catch (error) {
      return sendError(res, error);
    }
  };

  assignMenu = async (req, res) => {
    try {
      const ids = req.body?.clientIds || req.body?.clienteIds || req.body?.clientes || req.body?.clienteId || [];
      const menu = await this.servicio.assignMenuToClients(req.user, req.params.id, ids);
      return res.json({ ok: true, menu });
    } catch (error) {
      return sendError(res, error);
    }
  };
}

export default ControladorNutritionLibrary;
