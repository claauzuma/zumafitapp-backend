import express from "express";
import rateLimit from "express-rate-limit";

import ControladorEjercicios from "../controlador/ejercicios.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { denyWriteWhenReadOnlyImpersonation } from "../middleware/denyWriteWhenReadOnlyImpersonation.js";

const writeLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 180,
  standardHeaders: true,
  legacyHeaders: false,
});

class RouterEjercicios {
  constructor() {
    this.router = express.Router();
    this.controladorEjercicios = new ControladorEjercicios();
  }

  start() {
    console.log("RouterEjercicios activo");

    this.router.get("/", authMiddleware, this.controladorEjercicios.list);
    this.router.post(
      "/",
      authMiddleware,
      denyWriteWhenReadOnlyImpersonation,
      writeLimiter,
      this.controladorEjercicios.create
    );
    this.router.get("/:id", authMiddleware, this.controladorEjercicios.getById);
    this.router.patch(
      "/:id",
      authMiddleware,
      denyWriteWhenReadOnlyImpersonation,
      writeLimiter,
      this.controladorEjercicios.update
    );
    this.router.delete(
      "/:id",
      authMiddleware,
      denyWriteWhenReadOnlyImpersonation,
      writeLimiter,
      this.controladorEjercicios.remove
    );

    return this.router;
  }
}

export default RouterEjercicios;
