import ServicioClientAccessContext from "../servicio/clientAccessContext.js";

function sendError(res, error) {
  const code = error?.code || error?.message || "ERROR";
  const payload = {
    code,
    error: error?.publicMessage || "Error en el servidor",
  };

  if (code === "NO_AUTENTICADO") return res.status(401).json(payload);
  if (code === "USER_NOT_CLIENT") return res.status(403).json(payload);
  if (code === "PLAN_INVALIDO") return res.status(400).json(payload);
  if (code === "PLAN_ALREADY_ACTIVE") return res.status(409).json(payload);
  if (
    code === "TRIAL_ALREADY_ACTIVE" ||
    code === "TRIAL_ALREADY_USED" ||
    code === "TRIAL_NOT_AVAILABLE_WITH_COACH" ||
    code === "TRIAL_NOT_AVAILABLE_FOR_PLAN"
  ) {
    return res.status(409).json(payload);
  }

  console.error("Error clientAccessContext:", error);
  return res.status(500).json({ code: "SERVER_ERROR", error: "Error en el servidor" });
}

class ControladorClientAccessContext {
  constructor() {
    this.servicio = new ServicioClientAccessContext();
  }

  get = async (req, res) => {
    try {
      const accessContext = await this.servicio.getContext(req.user);
      return res.json({ accessContext });
    } catch (error) {
      return sendError(res, error);
    }
  };

  startProTrial = async (req, res) => {
    try {
      const data = await this.servicio.startProTrial(req.user);
      return res.status(200).json(data);
    } catch (error) {
      return sendError(res, error);
    }
  };

  getTrial = async (req, res) => {
    try {
      const accessContext = await this.servicio.getContext(req.user);
      return res.json({ trial: accessContext.trial, accessContext });
    } catch (error) {
      return sendError(res, error);
    }
  };

  acknowledgeTrialOnboardingOffer = async (req, res) => {
    try {
      const data = await this.servicio.acknowledgeTrialOnboardingOffer(req.user);
      return res.json(data);
    } catch (error) {
      return sendError(res, error);
    }
  };

  acknowledgeTrialExpiryNotice = async (req, res) => {
    try {
      const data = await this.servicio.acknowledgeTrialExpiryNotice(req.user);
      return res.json(data);
    } catch (error) {
      return sendError(res, error);
    }
  };

  createPlanChangeRequest = async (req, res) => {
    try {
      const data = await this.servicio.createPlanChangeRequest(req.user, req.body || {});
      return res.status(data.pendingAlreadyExists ? 200 : 201).json(data);
    } catch (error) {
      return sendError(res, error);
    }
  };
}

export default ControladorClientAccessContext;
