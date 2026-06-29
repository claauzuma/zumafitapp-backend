import ServicioProfessionalAccess from "../servicio/professionalAccess.js";
import { accessErrorPayload, isAccessGateError } from "../servicio/accessGates.js";

function sendError(res, error) {
  const msg = String(error?.message || "");
  if (isAccessGateError(error)) return res.status(403).json(accessErrorPayload(error));

  if (msg === "EMAIL_REQUERIDO") return res.status(400).json({ error: "Ingresa el email" });
  if (msg === "EMAIL_INVALIDO") return res.status(400).json({ error: "Ingresa un email valido" });
  if (msg === "EMAIL_DUPLICADO" || msg.includes("E11000")) return res.status(409).json({ error: "Ese email ya esta registrado" });
  if (msg === "PASSWORD_CORTA") return res.status(400).json({ error: "La contrasena debe tener al menos 6 caracteres" });
  if (msg === "PASSWORD_CONFIRMATION_MISMATCH") return res.status(400).json({ error: "Las contrasenas no coinciden" });
  if (msg === "TERMS_REQUIRED") return res.status(400).json({ error: "Debes aceptar los terminos y la declaracion de veracidad" });
  if (msg === "APPLICATION_NOT_FOUND") return res.status(404).json({ error: "Solicitud profesional no encontrada" });
  if (msg === "SUBSCRIPTION_REQUEST_NOT_FOUND") return res.status(404).json({ error: "Solicitud de suscripcion no encontrada" });
  if (msg === "SUBSCRIPTION_REQUEST_OPEN") return res.status(409).json({ error: "Ya tenes una solicitud de suscripcion pendiente" });
  if (msg === "COACH_NOT_FOUND") return res.status(404).json({ error: "Coach no encontrado" });
  if (msg === "PLAN_INVALIDO") return res.status(400).json({ error: "Plan invalido" });

  console.error("Error professionalAccess:", error);
  return res.status(500).json({ error: "Error en el servidor" });
}

class ControladorProfessionalAccess {
  constructor() {
    this.servicio = new ServicioProfessionalAccess();
  }

  registerProfessionalApplication = async (req, res) => {
    try {
      const data = await this.servicio.registerProfessionalApplication(req.body || {});
      return res.status(201).json({ ok: true, ...data });
    } catch (error) {
      return sendError(res, error);
    }
  };

  adminListApplications = async (req, res) => {
    try {
      const data = await this.servicio.listApplications(req.query || {});
      return res.json(data);
    } catch (error) {
      return sendError(res, error);
    }
  };

  adminPatchApplication = async (req, res) => {
    try {
      const data = await this.servicio.updateApplicationStatus(req.params.id, req.body || {}, req.user || {});
      return res.json({ ok: true, ...data });
    } catch (error) {
      return sendError(res, error);
    }
  };

  coachGetSubscription = async (req, res) => {
    try {
      const data = await this.servicio.getCoachSubscription(req.user || {});
      return res.json(data);
    } catch (error) {
      return sendError(res, error);
    }
  };

  coachCreateSubscriptionRequest = async (req, res) => {
    try {
      const data = await this.servicio.createCoachSubscriptionRequest(req.user || {}, req.body || {});
      return res.status(201).json({ ok: true, ...data });
    } catch (error) {
      return sendError(res, error);
    }
  };

  adminListSubscriptionRequests = async (req, res) => {
    try {
      const data = await this.servicio.listSubscriptionRequests(req.query || {});
      return res.json(data);
    } catch (error) {
      return sendError(res, error);
    }
  };

  adminApproveSubscriptionRequest = async (req, res) => {
    try {
      const data = await this.servicio.resolveSubscriptionRequest(req.params.id, req.body || {}, req.user || {}, "approve");
      return res.json({ ok: true, ...data });
    } catch (error) {
      return sendError(res, error);
    }
  };

  adminRejectSubscriptionRequest = async (req, res) => {
    try {
      const data = await this.servicio.resolveSubscriptionRequest(req.params.id, req.body || {}, req.user || {}, "reject");
      return res.json({ ok: true, ...data });
    } catch (error) {
      return sendError(res, error);
    }
  };

  adminPatchCoachSubscription = async (req, res) => {
    try {
      const data = await this.servicio.adminPatchCoachSubscription(req.params.coachId, req.body || {}, req.user || {});
      return res.json({ ok: true, ...data });
    } catch (error) {
      return sendError(res, error);
    }
  };

  adminListAuditEvents = async (req, res) => {
    try {
      const data = await this.servicio.adminListAuditEvents(req.query || {});
      return res.json(data);
    } catch (error) {
      return sendError(res, error);
    }
  };
}

export default ControladorProfessionalAccess;
