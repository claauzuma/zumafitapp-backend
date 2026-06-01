import express from "express";
import rateLimit from "express-rate-limit";

import ControladorComidas from "../controlador/comidas.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { denyWriteWhenReadOnlyImpersonation } from "../middleware/denyWriteWhenReadOnlyImpersonation.js";

const writeLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 180,
  standardHeaders: true,
  legacyHeaders: false,
});

class RouterComidas {
  constructor(persistencia) {
    this.router = express.Router();
    this.controladorComidas = new ControladorComidas(persistencia);
  }

  start() {
    console.log("RouterComidas activo");

    this.router.get("/", authMiddleware, this.controladorComidas.listarComidas);
    this.router.get("/admin/todas", authMiddleware, this.controladorComidas.listarTodasAdmin);
    this.router.post(
      "/",
      authMiddleware,
      denyWriteWhenReadOnlyImpersonation,
      writeLimiter,
      this.controladorComidas.crearComida
    );
    this.router.post(
      "/:id/duplicar",
      authMiddleware,
      denyWriteWhenReadOnlyImpersonation,
      writeLimiter,
      this.controladorComidas.duplicarComida
    );
    this.router.get("/:id", authMiddleware, this.controladorComidas.obtenerComidaPorId);
    this.router.patch(
      "/:id",
      authMiddleware,
      denyWriteWhenReadOnlyImpersonation,
      writeLimiter,
      this.controladorComidas.actualizarComida
    );
    this.router.delete(
      "/:id",
      authMiddleware,
      denyWriteWhenReadOnlyImpersonation,
      writeLimiter,
      this.controladorComidas.eliminarComida
    );

    return this.router;
  }
}

export default RouterComidas;
