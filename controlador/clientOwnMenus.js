import ServicioClientOwnMenus from "../servicio/clientOwnMenus.js";
import ServicioClientDayFavorites from "../servicio/clientDayFavorites.js";
import { accessErrorPayload, isAccessGateError } from "../servicio/accessGates.js";

function sendError(res, error) {
  const code = error?.code || error?.message || "ERROR";
  const payload = {
    code,
    error: error?.publicMessage || "Error en el servidor",
  };

  for (const key of ["resource", "current", "limit", "plan"]) {
    if (error?.[key] !== undefined) payload[key] = error[key];
  }
  if (Array.isArray(error?.details)) payload.details = error.details;

  if (code === "NO_AUTENTICADO") return res.status(401).json(payload);
  if (code === "USER_NOT_CLIENT") return res.status(403).json(payload);
  if (isAccessGateError(error)) return res.status(code === "PLAN_CAPABILITY_REQUIRED" ? 403 : 409).json(accessErrorPayload(error));
  if (code === "CLIENT_MENU_FORBIDDEN" || code === "NOT_MENU_OWNER") return res.status(403).json(payload);
  if (code === "MENU_NOT_FOUND" || code === "DAY_FAVORITE_NOT_FOUND") return res.status(404).json(payload);
  if (code === "PLAN_LIMIT_REACHED" || code === "COACH_MENU_ACTIVE" || code === "ACTIVE_MENU_DELETE_CONFIRMATION_REQUIRED") {
    return res.status(409).json(payload);
  }
  if ([
    "INVALID_MENU",
    "VALIDATION_ERROR",
    "INVALID_MEAL_TYPE",
    "INVALID_MEAL_TARGET",
    "INVALID_GENERATION_MODE",
    "INVALID_FOOD_CONSTRAINTS",
    "INVALID_FOOD_COMBINATION",
    "INVALID_FIXED_QUANTITY",
    "NO_AUTOMATIC_FOODS",
    "FOOD_NOT_FOUND",
    "MEAL_FOOD_LIMIT_REACHED",
    "EMPTY_DAY_FAVORITE",
    "INVALID_DATE",
  ].includes(code)) return res.status(400).json(payload);
  if (code === "DAY_FAVORITE_TARGET_TOO_HIGH") {
    return res.status(409).json({ ...payload, requiredKcal: error.requiredKcal, targetKcal: error.targetKcal });
  }

  console.error("Error clientOwnMenus:", error);
  return res.status(500).json({ code: "SERVER_ERROR", error: "Error en el servidor" });
}

class ControladorClientOwnMenus {
  constructor() {
    this.servicio = new ServicioClientOwnMenus();
    this.dayFavorites = new ServicioClientDayFavorites();
  }

  listDayFavorites = async (req, res) => {
    try { return res.json(await this.dayFavorites.list(req.user)); }
    catch (error) { return sendError(res, error); }
  };

  createDayFavorite = async (req, res) => {
    try { return res.status(201).json(await this.dayFavorites.create(req.user, req.body || {})); }
    catch (error) { return sendError(res, error); }
  };

  deleteDayFavorite = async (req, res) => {
    try { return res.json(await this.dayFavorites.remove(req.user, req.params.favoriteId)); }
    catch (error) { return sendError(res, error); }
  };

  updateDayFavorite = async (req, res) => {
    try { return res.json(await this.dayFavorites.update(req.user, req.params.favoriteId, req.body || {})); }
    catch (error) { return sendError(res, error); }
  };

  applyDayFavorite = async (req, res) => {
    try { return res.json(await this.dayFavorites.apply(req.user, req.params.favoriteId, req.body || {})); }
    catch (error) { return sendError(res, error); }
  };

  capabilities = async (req, res) => {
    try {
      const capabilities = await this.servicio.capabilities(req.user);
      return res.json({ capabilities });
    } catch (error) {
      return sendError(res, error);
    }
  };

  authorizeAutomaticGeneration = async (req, res) => {
    try {
      return res.json(await this.servicio.authorizeAutomaticGeneration(req.user));
    } catch (error) {
      return sendError(res, error);
    }
  };

  generateAutomaticMenuMeal = async (req, res) => {
    try {
      return res.json(await this.servicio.generateAutomaticMenuMeal(req.user, req.body || {}));
    } catch (error) {
      return sendError(res, error);
    }
  };

  getEquivalentMealGenerationSettings = async (req, res) => {
    try {
      return res.json(await this.servicio.getEquivalentMealGenerationSettings(req.user, req.query || {}));
    } catch (error) {
      return sendError(res, error);
    }
  };

  saveEquivalentMealGenerationSettings = async (req, res) => {
    try {
      return res.json(await this.servicio.saveEquivalentMealGenerationSettings(req.user, req.body || {}));
    } catch (error) {
      return sendError(res, error);
    }
  };

  generateEquivalentMealAlternative = async (req, res) => {
    try {
      return res.json(await this.servicio.generateEquivalentMealAlternative(req.user, req.body || {}));
    } catch (error) {
      return sendError(res, error);
    }
  };

  recalculateEquivalentMealAlternative = async (req, res) => {
    try {
      return res.json(await this.servicio.recalculateEquivalentMealAlternative(req.user, req.body || {}));
    } catch (error) {
      return sendError(res, error);
    }
  };

  list = async (req, res) => {
    try {
      const data = await this.servicio.list(req.user, req.query || {});
      return res.json(data);
    } catch (error) {
      return sendError(res, error);
    }
  };

  get = async (req, res) => {
    try {
      const data = await this.servicio.get(req.user, req.params.menuId);
      return res.json(data);
    } catch (error) {
      return sendError(res, error);
    }
  };

  create = async (req, res) => {
    try {
      const data = await this.servicio.create(req.user, req.body || {});
      return res.status(201).json(data);
    } catch (error) {
      return sendError(res, error);
    }
  };

  update = async (req, res) => {
    try {
      const data = await this.servicio.update(req.user, req.params.menuId, req.body || {});
      return res.json(data);
    } catch (error) {
      return sendError(res, error);
    }
  };

  remove = async (req, res) => {
    try {
      const data = await this.servicio.remove(req.user, req.params.menuId, req.body || {});
      return res.json(data);
    } catch (error) {
      return sendError(res, error);
    }
  };

  duplicate = async (req, res) => {
    try {
      const data = await this.servicio.duplicate(req.user, req.params.menuId, req.body || {});
      return res.status(201).json(data);
    } catch (error) {
      return sendError(res, error);
    }
  };

  activate = async (req, res) => {
    try {
      const data = await this.servicio.activate(req.user, req.params.menuId);
      return res.json(data);
    } catch (error) {
      return sendError(res, error);
    }
  };

  deactivate = async (req, res) => {
    try {
      const data = await this.servicio.deactivate(req.user);
      return res.json(data);
    } catch (error) {
      return sendError(res, error);
    }
  };
}

export default ControladorClientOwnMenus;
