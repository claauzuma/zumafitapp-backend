import ServicioClientOwnMenus from "../servicio/clientOwnMenus.js";
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
  if (code === "MENU_NOT_FOUND") return res.status(404).json(payload);
  if (code === "PLAN_LIMIT_REACHED" || code === "COACH_MENU_ACTIVE" || code === "ACTIVE_MENU_DELETE_CONFIRMATION_REQUIRED") {
    return res.status(409).json(payload);
  }
  if (code === "INVALID_MENU" || code === "VALIDATION_ERROR") return res.status(400).json(payload);

  console.error("Error clientOwnMenus:", error);
  return res.status(500).json({ code: "SERVER_ERROR", error: "Error en el servidor" });
}

class ControladorClientOwnMenus {
  constructor() {
    this.servicio = new ServicioClientOwnMenus();
  }

  capabilities = async (req, res) => {
    try {
      const capabilities = await this.servicio.capabilities(req.user);
      return res.json({ capabilities });
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
