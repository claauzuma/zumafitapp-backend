import express from "express";
import ControladorAdminCollections from "../controlador/adminCollections.js";
import ControladorDatabaseStats from "../controlador/databaseStats.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/requireRole.js";

class RouterAdmin {
  constructor() {
    this.router = express.Router();
    this.controladorAdminCollections = new ControladorAdminCollections();
    this.controladorDatabaseStats = new ControladorDatabaseStats();
  }

  start() {
    const adminOnly = [authMiddleware, requireRole("admin")];

    this.router.get(
      "/database/stats",
      ...adminOnly,
      this.controladorDatabaseStats.obtenerEstadisticas
    );

    this.router.get(
      "/system/collections",
      ...adminOnly,
      this.controladorAdminCollections.listarColecciones
    );

    this.router.get(
      "/system/collections/:collectionName",
      ...adminOnly,
      this.controladorAdminCollections.obtenerDetalle
    );

    this.router.get(
      "/system/collections/:collectionName/documents",
      ...adminOnly,
      this.controladorAdminCollections.listarDocumentos
    );

    this.router.get(
      "/system/collections/:collectionName/documents/:documentId",
      ...adminOnly,
      this.controladorAdminCollections.obtenerDocumento
    );

    this.router.get(
      "/system/collections/:collectionName/search",
      ...adminOnly,
      this.controladorAdminCollections.buscarDocumentos
    );

    return this.router;
  }
}

export default RouterAdmin;
