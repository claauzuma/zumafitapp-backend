import ServicioFoodLogs from "../servicio/foodLogs.js";

function sendError(res, error) {
  const msg = String(error?.message || "");

  if (msg === "NO_AUTENTICADO") return res.status(401).json({ error: "No autenticado" });
  if (msg === "FORBIDDEN") return res.status(403).json({ error: "No tenes permisos para este tracking" });
  if (msg === "TRACKING_NOT_ALLOWED") return res.status(403).json({ error: "Tu cuenta no tiene habilitado el tracking de alimentos" });
  if (msg === "PAST_DAYS_NOT_ALLOWED") return res.status(403).json({ error: "No tenes habilitada la edicion de dias anteriores" });
  if (msg === "INVALID_DATE") return res.status(400).json({ error: "Fecha invalida" });
  if (msg === "INVALID_MEAL_TYPE") return res.status(400).json({ error: "Comida invalida" });
  if (msg === "FOOD_REQUIRED") return res.status(400).json({ error: "Falta el alimento" });
  if (msg === "LOG_NOT_FOUND") return res.status(404).json({ error: "Registro no encontrado" });
  if (msg === "ID_INVALIDO") return res.status(400).json({ error: "ID invalido" });

  console.error("Error foodLogs:", error);
  return res.status(500).json({ error: "Error en el servidor" });
}

class ControladorFoodLogs {
  constructor() {
    this.servicio = new ServicioFoodLogs();
  }

  getDay = async (req, res) => {
    try {
      const data = await this.servicio.getDay(req.user, req.query || {});
      return res.json(data);
    } catch (error) {
      return sendError(res, error);
    }
  };

  addLog = async (req, res) => {
    try {
      const data = await this.servicio.addLog(req.user, req.body || {});
      return res.status(201).json({ ok: true, ...data });
    } catch (error) {
      return sendError(res, error);
    }
  };

  updateMealsConfig = async (req, res) => {
    try {
      const data = await this.servicio.updateMealsConfig(req.user, req.body || {});
      return res.json({ ok: true, ...data });
    } catch (error) {
      return sendError(res, error);
    }
  };

  deleteMeal = async (req, res) => {
    try {
      const data = await this.servicio.deleteMeal(req.user, req.params.mealId, req.body || {});
      return res.json({ ok: true, ...data });
    } catch (error) {
      return sendError(res, error);
    }
  };

  updateLog = async (req, res) => {
    try {
      const data = await this.servicio.updateLog(req.user, req.params.logId, req.body || {});
      return res.json({ ok: true, ...data });
    } catch (error) {
      return sendError(res, error);
    }
  };

  deleteLog = async (req, res) => {
    try {
      const data = await this.servicio.deleteLog(req.user, req.params.logId);
      return res.json({ ok: true, ...data });
    } catch (error) {
      return sendError(res, error);
    }
  };
}

export default ControladorFoodLogs;
