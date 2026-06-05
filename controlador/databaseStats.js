import ServicioDatabaseStats from "../servicio/databaseStats.js";

class ControladorDatabaseStats {
  constructor() {
    this.servicio = new ServicioDatabaseStats();
  }

  obtenerEstadisticas = async (req, res) => {
    try {
      const estadisticas = await this.servicio.obtenerEstadisticas();
      return res.json(estadisticas);
    } catch (error) {
      const databaseUnavailable =
        error?.code === "DATABASE_NOT_AVAILABLE" || error?.message === "DATABASE_NOT_AVAILABLE";

      console.error(
        "Error al consultar estadisticas de MongoDB:",
        error?.code || error?.name || "UNKNOWN_DATABASE_STATS_ERROR"
      );
      return res.status(databaseUnavailable ? 503 : 500).json({
        error: databaseUnavailable
          ? "La base de datos no esta disponible."
          : "No se pudieron consultar las estadisticas de la base de datos.",
      });
    }
  };
}

export default ControladorDatabaseStats;
