import express from "express";
import ControladorDatabaseStats from "../controlador/databaseStats.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/requireRole.js";

class RouterAdmin {
  constructor() {
    this.router = express.Router();
    this.controladorDatabaseStats = new ControladorDatabaseStats();
  }

  start() {
    this.router.get(
      "/database/stats",
      authMiddleware,
      requireRole("admin"),
      this.controladorDatabaseStats.obtenerEstadisticas
    );

    return this.router;
  }
}

export default RouterAdmin;
