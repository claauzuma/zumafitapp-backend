import express from "express";
import rateLimit from "express-rate-limit";

import ControladorMenus from "../controlador/menus.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { denyWriteWhenReadOnlyImpersonation } from "../middleware/denyWriteWhenReadOnlyImpersonation.js";

const writeLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 180,
  standardHeaders: true,
  legacyHeaders: false,
});

class RouterClienteMenus {
  constructor() {
    this.router = express.Router();
    this.controladorMenus = new ControladorMenus();
  }

  start() {
    console.log("RouterClienteMenus activo");

    this.router.post(
      "/:clienteId/menus/asignar",
      authMiddleware,
      denyWriteWhenReadOnlyImpersonation,
      writeLimiter,
      this.controladorMenus.assignToClient
    );
    this.router.get(
      "/:clienteId/menus/activo",
      authMiddleware,
      this.controladorMenus.getActiveClientMenu
    );
    this.router.get(
      "/:clienteId/menus",
      authMiddleware,
      this.controladorMenus.listClientMenus
    );
    this.router.get(
      "/:clienteId/menus/:menuAsignadoId",
      authMiddleware,
      this.controladorMenus.getClientMenu
    );
    this.router.patch(
      "/:clienteId/menus/:menuAsignadoId",
      authMiddleware,
      denyWriteWhenReadOnlyImpersonation,
      writeLimiter,
      this.controladorMenus.updateClientMenu
    );
    this.router.delete(
      "/:clienteId/menus/:menuAsignadoId",
      authMiddleware,
      denyWriteWhenReadOnlyImpersonation,
      writeLimiter,
      this.controladorMenus.deleteClientMenu
    );
    this.router.post(
      "/:clienteId/menus/:menuAsignadoId/duplicar",
      authMiddleware,
      denyWriteWhenReadOnlyImpersonation,
      writeLimiter,
      this.controladorMenus.duplicateClientMenu
    );
    this.router.post(
      "/:clienteId/menus/:menuAsignadoId/guardar-como-template",
      authMiddleware,
      denyWriteWhenReadOnlyImpersonation,
      writeLimiter,
      this.controladorMenus.saveClientMenuAsTemplate
    );

    return this.router;
  }
}

export default RouterClienteMenus;
