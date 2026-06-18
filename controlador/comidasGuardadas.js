import ServicioComidasGuardadas from "../servicio/comidasGuardadas.js";

function sendError(res, error) {
  const msg = String(error?.message || "");

  if (msg === "NO_AUTENTICADO") return res.status(401).json({ error: "No autenticado" });
  if (msg === "FORBIDDEN") return res.status(403).json({ error: "No tenes permisos para esta comida" });
  if (msg === "NOT_FOUND") return res.status(404).json({ error: "Comida guardada no encontrada" });
  if (msg === "COPY_REQUIRED") {
    return res.status(409).json({ error: "Esta comida no se edita directo. Guardala como mi comida para crear una copia privada." });
  }
  if (msg === "SAVED_MEAL_LIMIT") return res.status(409).json({ error: "Alcanzaste el limite de comidas guardadas de tu plan" });
  if (msg === "ITEMS_INVALIDOS") return res.status(400).json({ error: "La comida debe tener al menos un alimento" });
  if (msg === "CANTIDAD_INVALIDA") return res.status(400).json({ error: "La cantidad debe ser mayor a 0" });
  if (msg === "ALIMENTO_NO_ENCONTRADO") return res.status(404).json({ error: "No encontramos uno de los alimentos" });
  if (msg === "ID_INVALIDO") return res.status(400).json({ error: "ID invalido" });
  if (msg === "CLIENTES_REQUERIDOS") return res.status(400).json({ error: "Selecciona al menos un cliente" });
  if (msg === "CLIENTE_INVALIDO") return res.status(400).json({ error: "Cliente invalido" });
  if (msg === "CLIENT_NOT_ASSIGNED_TO_COACH") return res.status(403).json({ error: "Ese cliente no esta asignado a tu cuenta profesional" });
  if (msg === "INVALID_DATE") return res.status(400).json({ error: "Fecha invalida" });
  if (msg === "INVALID_MEAL_TYPE") return res.status(400).json({ error: "Tipo de comida invalido" });
  if (msg === "TRACKING_NOT_ALLOWED") return res.status(403).json({ error: "Tu cuenta no tiene habilitado el tracking de alimentos" });
  if (msg === "PAST_DAYS_NOT_ALLOWED") return res.status(403).json({ error: "No tenes habilitada la edicion de dias anteriores" });

  console.error("Error comidasGuardadas:", error);
  return res.status(500).json({ error: "Error en el servidor" });
}

class ControladorComidasGuardadas {
  constructor() {
    this.servicio = new ServicioComidasGuardadas();
  }

  list = async (req, res) => {
    try {
      const data = await this.servicio.list(req.user, req.query || {});
      return res.json(data);
    } catch (error) {
      return sendError(res, error);
    }
  };

  getById = async (req, res) => {
    try {
      const comida = await this.servicio.getById(req.user, req.params.id);
      if (!comida) return res.status(404).json({ error: "Comida guardada no encontrada" });
      return res.json({ comida });
    } catch (error) {
      return sendError(res, error);
    }
  };

  create = async (req, res) => {
    try {
      const comida = await this.servicio.create(req.user, req.body || {});
      return res.status(201).json({ ok: true, comida });
    } catch (error) {
      return sendError(res, error);
    }
  };

  update = async (req, res) => {
    try {
      const comida = await this.servicio.update(req.user, req.params.id, req.body || {});
      return res.json({ ok: true, comida });
    } catch (error) {
      return sendError(res, error);
    }
  };

  remove = async (req, res) => {
    try {
      const result = await this.servicio.remove(req.user, req.params.id);
      if (result?.deletedCount === 0) return res.status(404).json({ error: "Comida guardada no encontrada" });
      return res.json({ ok: true, deleted: true });
    } catch (error) {
      return sendError(res, error);
    }
  };

  duplicate = async (req, res) => {
    try {
      const comida = await this.servicio.duplicate(req.user, req.params.id, req.body || {});
      return res.status(201).json({ ok: true, comida });
    } catch (error) {
      return sendError(res, error);
    }
  };

  favorite = async (req, res) => {
    try {
      const hasExplicit = Object.prototype.hasOwnProperty.call(req.body || {}, "favorita");
      const comida = await this.servicio.toggleFavorite(req.user, req.params.id, hasExplicit ? req.body.favorita : null);
      return res.json({ ok: true, comida });
    } catch (error) {
      return sendError(res, error);
    }
  };

  addToTracking = async (req, res) => {
    try {
      const data = await this.servicio.addToTracking(req.user, req.params.id, req.body || {});
      return res.status(201).json({ ok: true, ...data });
    } catch (error) {
      return sendError(res, error);
    }
  };

  listProfessionalTemplates = async (req, res) => {
    try {
      const data = await this.servicio.listProfessionalTemplates(req.user, req.query || {});
      return res.json(data);
    } catch (error) {
      return sendError(res, error);
    }
  };

  createProfessionalTemplate = async (req, res) => {
    try {
      const comida = await this.servicio.createProfessionalTemplate(req.user, req.body || {});
      return res.status(201).json({ ok: true, comida });
    } catch (error) {
      return sendError(res, error);
    }
  };

  updateProfessionalTemplate = async (req, res) => {
    try {
      const comida = await this.servicio.update(req.user, req.params.id, req.body || {});
      return res.json({ ok: true, comida });
    } catch (error) {
      return sendError(res, error);
    }
  };

  assignProfessionalTemplate = async (req, res) => {
    try {
      const ids = req.body?.clientIds || req.body?.clientes || req.body?.clienteIds || [];
      const comida = await this.servicio.assign(req.user, req.params.id, ids);
      return res.json({ ok: true, comida });
    } catch (error) {
      return sendError(res, error);
    }
  };

  listClientAssigned = async (req, res) => {
    try {
      const data = await this.servicio.listAssignedToClient(req.user, req.params.clienteId, req.query || {});
      return res.json(data);
    } catch (error) {
      return sendError(res, error);
    }
  };

  listAdminGlobal = async (req, res) => {
    try {
      const data = await this.servicio.listAdminGlobal(req.user, req.query || {});
      return res.json(data);
    } catch (error) {
      return sendError(res, error);
    }
  };

  createAdminGlobal = async (req, res) => {
    try {
      const comida = await this.servicio.createAdminGlobal(req.user, req.body || {});
      return res.status(201).json({ ok: true, comida });
    } catch (error) {
      return sendError(res, error);
    }
  };

  updateAdminGlobal = async (req, res) => {
    try {
      const comida = await this.servicio.update(req.user, req.params.id, req.body || {});
      return res.json({ ok: true, comida });
    } catch (error) {
      return sendError(res, error);
    }
  };
}

export default ControladorComidasGuardadas;
