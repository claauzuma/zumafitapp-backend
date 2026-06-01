import Servicio from "../servicio/comidas.js";

function sendError(res, error) {
  const msg = String(error?.message || "");

  if (msg === "NO_AUTENTICADO") return res.status(401).json({ error: "No autenticado" });
  if (msg === "NOT_FOUND") return res.status(404).json({ error: "Comida no encontrada" });
  if (msg === "FORBIDDEN") return res.status(403).json({ error: "No tenes permisos para esta comida" });
  if (msg === "COACH_NUTRITION_NOT_ALLOWED") {
    return res.status(403).json({ error: "Tu perfil profesional no tiene acceso a comidas nutricionales" });
  }
  if (msg === "COACH_FEATURE_NOT_ALLOWED") return res.status(403).json({ error: "Tu plan no permite esta accion" });
  if (msg === "ITEMS_INVALIDOS") return res.status(400).json({ error: "La comida debe tener al menos un alimento" });
  if (msg === "ID_INVALIDO") return res.status(400).json({ error: "ID invalido" });

  if (msg.startsWith("CANTIDAD_INVALIDA_")) {
    const index = msg.split("_").pop();
    return res.status(400).json({ error: `cantidad${index} invalida` });
  }

  console.error("Error comidas:", error);
  return res.status(500).json({ error: "Error en el servidor" });
}

class ControladorComidas {
  constructor(persistencia) {
    this.servicio = new Servicio(persistencia);
  }

  crearComida = async (req, res) => {
    try {
      const comida = await this.servicio.crearComida(req.user, req.body || {});
      return res.status(201).json({ ok: true, comida });
    } catch (error) {
      return sendError(res, error);
    }
  };

  listarComidas = async (req, res) => {
    try {
      const comidas = await this.servicio.listarComidas(req.user, req.query || {});
      return res.json({ comidas });
    } catch (error) {
      return sendError(res, error);
    }
  };

  listarTodasAdmin = async (req, res) => {
    try {
      const comidas = await this.servicio.listarTodasAdmin(req.user);
      return res.json({ comidas });
    } catch (error) {
      return sendError(res, error);
    }
  };

  obtenerComidaPorId = async (req, res) => {
    try {
      const comida = await this.servicio.obtenerPorId(req.user, req.params.id);
      if (!comida) return res.status(404).json({ error: "Comida no encontrada" });
      return res.json({ comida });
    } catch (error) {
      return sendError(res, error);
    }
  };

  actualizarComida = async (req, res) => {
    try {
      const comida = await this.servicio.actualizarComida(req.user, req.params.id, req.body || {});
      return res.json({ ok: true, comida });
    } catch (error) {
      return sendError(res, error);
    }
  };

  eliminarComida = async (req, res) => {
    try {
      const result = await this.servicio.eliminarComida(req.user, req.params.id);
      if (result?.deletedCount === 0) return res.status(404).json({ error: "Comida no encontrada" });
      return res.json({ ok: true, deleted: true });
    } catch (error) {
      return sendError(res, error);
    }
  };

  duplicarComida = async (req, res) => {
    try {
      const comida = await this.servicio.duplicarComida(req.user, req.params.id, req.body || {});
      return res.status(201).json({ ok: true, comida });
    } catch (error) {
      return sendError(res, error);
    }
  };
}

export default ControladorComidas;
