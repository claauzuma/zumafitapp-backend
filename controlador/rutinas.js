import ServicioRutinas from "../servicio/rutinas.js";
import { accessErrorPayload, isAccessGateError } from "../servicio/accessGates.js";

function sendError(res, error) {
  const msg = String(error?.message || "");
  if (isAccessGateError(error)) return res.status(msg === "FEATURE_COMING_SOON" ? 409 : 403).json(accessErrorPayload(error));

  if (msg === "NO_AUTENTICADO") return res.status(401).json({ error: "No autenticado" });
  if (msg === "NOT_FOUND") return res.status(404).json({ error: "Rutina no encontrada" });
  if (msg === "CLIENT_NOT_FOUND") return res.status(404).json({ error: "Cliente no encontrado" });
  if (msg === "FORBIDDEN") return res.status(403).json({ error: "No tenes permisos para esta rutina" });
  if (msg === "USER_NOT_CLIENT") return res.status(400).json({ error: "El usuario no es cliente" });
  if (msg === "CLIENT_NOT_ASSIGNED_TO_COACH") {
    return res.status(403).json({ error: "Este cliente no esta asignado a tu cuenta profesional" });
  }
  if (msg === "COACH_TRAINING_NOT_ALLOWED") {
    return res.status(403).json({ error: "Tu perfil profesional no tiene acceso a rutinas" });
  }
  if (msg === "COACH_FEATURE_NOT_ALLOWED") {
    return res.status(403).json({ error: "Tu plan no permite esta accion" });
  }
  if (msg === "RUTINA_BASE_REQUIRED") return res.status(400).json({ error: "Falta rutinaBaseId" });
  if (msg === "ID_INVALIDO") return res.status(400).json({ error: "ID invalido" });

  console.error("Error rutinas:", error);
  return res.status(500).json({ error: "Error en el servidor" });
}

class ControladorRutinas {
  constructor() {
    this.servicio = new ServicioRutinas();
  }

  list = async (req, res) => {
    try {
      const data = await this.servicio.listRutinas(req.user, req.query || {});
      return res.json(data);
    } catch (error) {
      return sendError(res, error);
    }
  };

  getById = async (req, res) => {
    try {
      const rutina = await this.servicio.getRutina(req.user, req.params.id);
      return res.json({ rutina });
    } catch (error) {
      return sendError(res, error);
    }
  };

  create = async (req, res) => {
    try {
      const rutina = await this.servicio.createRutina(req.user, req.body || {});
      return res.status(201).json({ ok: true, rutina });
    } catch (error) {
      return sendError(res, error);
    }
  };

  update = async (req, res) => {
    try {
      const rutina = await this.servicio.updateRutina(req.user, req.params.id, req.body || {});
      return res.json({ ok: true, rutina });
    } catch (error) {
      return sendError(res, error);
    }
  };

  remove = async (req, res) => {
    try {
      const result = await this.servicio.deleteRutina(req.user, req.params.id);
      return res.json({ ok: true, ...result });
    } catch (error) {
      return sendError(res, error);
    }
  };

  duplicate = async (req, res) => {
    try {
      const rutina = await this.servicio.duplicateRutina(req.user, req.params.id, req.body || {});
      return res.status(201).json({ ok: true, rutina });
    } catch (error) {
      return sendError(res, error);
    }
  };

  assignToClient = async (req, res) => {
    try {
      const rutina = await this.servicio.assignRutina(req.user, req.params.clienteId, req.body || {});
      return res.status(201).json({ ok: true, rutina });
    } catch (error) {
      return sendError(res, error);
    }
  };

  listClientRoutines = async (req, res) => {
    try {
      const data = await this.servicio.listClienteRutinas(req.user, req.params.clienteId, req.query || {});
      return res.json(data);
    } catch (error) {
      return sendError(res, error);
    }
  };

  getActiveClientRoutine = async (req, res) => {
    try {
      const rutina = await this.servicio.getClienteRutinaActiva(req.user, req.params.clienteId);
      return res.json({ rutina });
    } catch (error) {
      return sendError(res, error);
    }
  };

  getClientRoutine = async (req, res) => {
    try {
      const rutina = await this.servicio.getClienteRutina(req.user, req.params.clienteId, req.params.planId);
      return res.json({ rutina });
    } catch (error) {
      return sendError(res, error);
    }
  };

  updateClientRoutine = async (req, res) => {
    try {
      const rutina = await this.servicio.updateClienteRutina(
        req.user,
        req.params.clienteId,
        req.params.planId,
        req.body || {}
      );
      return res.json({ ok: true, rutina });
    } catch (error) {
      return sendError(res, error);
    }
  };

  deleteClientRoutine = async (req, res) => {
    try {
      const result = await this.servicio.deleteClienteRutina(req.user, req.params.clienteId, req.params.planId);
      return res.json({ ok: true, ...result });
    } catch (error) {
      return sendError(res, error);
    }
  };
}

export default ControladorRutinas;
