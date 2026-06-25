import express from "express";
import rateLimit from "express-rate-limit";

import ControladorMenus from "../controlador/menus.js";
import ControladorClientOwnMenus from "../controlador/clientOwnMenus.js";
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
    this.controladorClientOwnMenus = new ControladorClientOwnMenus();
  }

  start() {
    console.log("RouterClienteMenus activo");

    this.router.post(
      "/me/menus/deactivate",
      authMiddleware,
      denyWriteWhenReadOnlyImpersonation,
      writeLimiter,
      this.controladorClientOwnMenus.deactivate
    );
    this.router.get(
      "/me/nutrition-capabilities",
      authMiddleware,
      this.controladorClientOwnMenus.capabilities
    );
    this.router.get(
      "/me/menus",
      authMiddleware,
      this.controladorClientOwnMenus.list
    );
    this.router.post(
      "/me/menus",
      authMiddleware,
      denyWriteWhenReadOnlyImpersonation,
      writeLimiter,
      this.controladorClientOwnMenus.create
    );
    this.router.get(
      "/me/menus/:menuId",
      authMiddleware,
      this.controladorClientOwnMenus.get
    );
    this.router.patch(
      "/me/menus/:menuId",
      authMiddleware,
      denyWriteWhenReadOnlyImpersonation,
      writeLimiter,
      this.controladorClientOwnMenus.update
    );
    this.router.delete(
      "/me/menus/:menuId",
      authMiddleware,
      denyWriteWhenReadOnlyImpersonation,
      writeLimiter,
      this.controladorClientOwnMenus.remove
    );
    this.router.post(
      "/me/menus/:menuId/duplicate",
      authMiddleware,
      denyWriteWhenReadOnlyImpersonation,
      writeLimiter,
      this.controladorClientOwnMenus.duplicate
    );
    this.router.post(
      "/me/menus/:menuId/activate",
      authMiddleware,
      denyWriteWhenReadOnlyImpersonation,
      writeLimiter,
      this.controladorClientOwnMenus.activate
    );

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
