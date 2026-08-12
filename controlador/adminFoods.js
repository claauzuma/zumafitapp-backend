import ServicioAdminFoods from "../servicio/adminFoods.js";

export default class ControladorAdminFoods {
  constructor() {
    this.servicio = new ServicioAdminFoods();
  }

  listar = async (req, res) => {
    try {
      return res.json(await this.servicio.listar(req.query || {}));
    } catch (error) {
      console.error("Error al listar alimentos para Admin:", error?.code || error?.message || error);
      const unavailable = error?.code === "DATABASE_NOT_AVAILABLE";
      return res.status(unavailable ? 503 : 500).json({
        error: unavailable
          ? "La base de datos de alimentos no esta disponible."
          : "No se pudo consultar el catalogo de alimentos.",
      });
    }
  };

  crear = async (req, res) => {
    try {
      const food = await this.servicio.crear(req.body || {});
      return res.status(201).json({ food });
    } catch (error) {
      return this.responderError(res, error, "No se pudo crear el alimento.");
    }
  };

  actualizarGeneration = async (req, res) => {
    try {
      const patch = req.body?.generation ?? req.body ?? {};
      const food = await this.servicio.actualizarGeneration(req.params.foodId, patch);
      return res.json({ food });
    } catch (error) {
      return this.responderError(res, error, "No se pudo actualizar la configuracion de generacion.");
    }
  };

  responderError = (res, error, fallback) => {
    const statuses = {
      INVALID_GENERATION: 400,
      INVALID_FOOD: 400,
      FOOD_NOT_FOUND: 404,
      FOOD_ALREADY_EXISTS: 409,
      DATABASE_NOT_AVAILABLE: 503,
    };
    const status = statuses[error?.code] || 500;
    if (status >= 500) console.error("Error en Admin alimentos:", error?.code || error?.message || error);
    return res.status(status).json({
      error: status >= 500 ? fallback : error.message,
      errorCode: error?.code || "ADMIN_FOOD_ERROR",
      ...(error?.field ? { field: error.field } : {}),
    });
  };
}
