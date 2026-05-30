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

class RouterRutinas {
  constructor() {
    this.router = express.Router();
    this.controladorRutinas = new ControladorRutinas();
  }

  start() {
    console.log("RouterRutinas activo");

    this.router.get("/", authMiddleware, this.controladorRutinas.list);
    this.router.post(
      "/",
      authMiddleware,
      denyWriteWhenReadOnlyImpersonation,
      writeLimiter,
      this.controladorRutinas.create
    );
    this.router.post(
      "/:id/duplicar",
      authMiddleware,
      denyWriteWhenReadOnlyImpersonation,
      writeLimiter,
      this.controladorRutinas.duplicate
    );
    this.router.get("/:id", authMiddleware, this.controladorRutinas.getById);
    this.router.patch(
      "/:id",
      authMiddleware,
      denyWriteWhenReadOnlyImpersonation,
      writeLimiter,
      this.controladorRutinas.update
    );
    this.router.delete(
      "/:id",
      authMiddleware,
      denyWriteWhenReadOnlyImpersonation,
      writeLimiter,
      this.controladorRutinas.remove
    );

    return this.router;
  }
}

export default RouterRutinas;
