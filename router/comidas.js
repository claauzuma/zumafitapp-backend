import express from "express";
import rateLimit from "express-rate-limit";
import ControladorComidas from "../controlador/comidas.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/requireRole.js";
import { denyWriteWhenReadOnlyImpersonation } from "../middleware/denyWriteWhenReadOnlyImpersonation.js";

const createLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

class RouterComidas {
  constructor(persistencia) {
    this.router = express.Router();
    this.controladorComidas = new ControladorComidas(persistencia);
  }

  start() {
    console.log("🍽️ RouterComidas activo (roles: admin/cliente)");

    const comidas = express.Router();

    comidas.post("/", authMiddleware, denyWriteWhenReadOnlyImpersonation, createLimiter, this.controladorComidas.crearComida);
    comidas.get("/", authMiddleware, this.controladorComidas.listarComidas);
    comidas.get("/:id", authMiddleware, this.controladorComidas.obtenerComidaPorId);
    comidas.patch("/:id", authMiddleware, denyWriteWhenReadOnlyImpersonation, this.controladorComidas.actualizarComida);
    comidas.delete("/:id", authMiddleware, denyWriteWhenReadOnlyImpersonation, this.controladorComidas.eliminarComida);

    comidas.get(
      "/admin/todas",
      authMiddleware,
      requireRole("admin"),
      this.controladorComidas.listarTodasAdmin
    );

    this.router.use("/", comidas);   // ✅ acá
    return this.router;
  }
}

export default RouterComidas;
