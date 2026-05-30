import express from "express";
import rateLimit from "express-rate-limit";

import ControladorRutinas from "../controlador/rutinas.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { denyWriteWhenReadOnlyImpersonation } from "../middleware/denyWriteWhenReadOnlyImpersonation.js";

const writeLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 180,
  standardHeaders: true,
  legacyHeaders: false,
});

class RouterClienteRutinas {
  constructor() {
    this.router = express.Router();
    this.controladorRutinas = new ControladorRutinas();
  }

  start() {
    console.log("RouterClienteRutinas activo");

    this.router.post(
      "/:clienteId/rutinas/asignar",
      authMiddleware,
      denyWriteWhenReadOnlyImpersonation,
      writeLimiter,
      this.controladorRutinas.assignToClient
    );
    this.router.get(
      "/:clienteId/rutinas/activa",
      authMiddleware,
      this.controladorRutinas.getActiveClientRoutine
    );
    this.router.get(
      "/:clienteId/rutinas",
      authMiddleware,
      this.controladorRutinas.listClientRoutines
    );
    this.router.get(
      "/:clienteId/rutinas/:planId",
      authMiddleware,
      this.controladorRutinas.getClientRoutine
    );
    this.router.patch(
      "/:clienteId/rutinas/:planId",
      authMiddleware,
      denyWriteWhenReadOnlyImpersonation,
      writeLimiter,
      this.controladorRutinas.updateClientRoutine
    );
    this.router.delete(
      "/:clienteId/rutinas/:planId",
      authMiddleware,
      denyWriteWhenReadOnlyImpersonation,
      writeLimiter,
      this.controladorRutinas.deleteClientRoutine
    );

    return this.router;
  }
}

export default RouterClienteRutinas;
