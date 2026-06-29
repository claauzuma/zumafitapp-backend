import ServicioRutinas from "../servicio/rutinas.js";
import { accessErrorPayload, isAccessGateError } from "../servicio/accessGates.js";

function sendError(res, error) {
  const msg = String(error?.message || "");
  if (isAccessGateError(error)) return res.status(msg === "FEATURE_COMING_SOON" ? 409 : 403).json(accessErrorPayload(error));

  if (msg === "NO_AUTENTICADO") return res.status(401).json({ error: "No autenticado" });
  if (msg === "NOT_FOUND") return res.status(404).json({ error: "Ejercicio no encontrado" });
  if (msg === "FORBIDDEN") return res.status(403).json({ error: "No tenes permisos para este ejercicio" });
  if (msg === "COACH_TRAINING_NOT_ALLOWED") {
    return res.status(403).json({ error: "Tu perfil profesional no tiene acceso a rutinas" });
  }
  if (msg === "COACH_FEATURE_NOT_ALLOWED") {
    return res.status(403).json({ error: "Tu plan no permite esta accion" });
  }
  if (msg === "ID_INVALIDO") return res.status(400).json({ error: "ID invalido" });

  console.error("Error ejercicios:", error);
  return res.status(500).json({ error: "Error en el servidor" });
}

class ControladorEjercicios {
  constructor() {
    this.servicio = new ServicioRutinas();
  }

  list = async (req, res) => {
    try {
      const data = await this.servicio.listEjercicios(req.user, req.query || {});
      return res.json(data);
    } catch (error) {
      return sendError(res, error);
    }
  };

  getById = async (req, res) => {
    try {
      const ejercicio = await this.servicio.getEjercicio(req.user, req.params.id);
      return res.json({ ejercicio });
    } catch (error) {
      return sendError(res, error);
    }
  };

  create = async (req, res) => {
    try {
      const ejercicio = await this.servicio.createEjercicio(req.user, req.body || {});
      return res.status(201).json({ ok: true, ejercicio });
    } catch (error) {
      return sendError(res, error);
    }
  };

  update = async (req, res) => {
    try {
      const ejercicio = await this.servicio.updateEjercicio(req.user, req.params.id, req.body || {});
      return res.json({ ok: true, ejercicio });
    } catch (error) {
      return sendError(res, error);
    }
  };

  remove = async (req, res) => {
    try {
      const result = await this.servicio.deleteEjercicio(req.user, req.params.id);
      return res.json({ ok: true, ...result });
    } catch (error) {
      return sendError(res, error);
    }
  };
}

export default ControladorEjercicios;
