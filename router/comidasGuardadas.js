import express from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";

import ControladorComidasGuardadas from "../controlador/comidasGuardadas.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/requireRole.js";
import { denyWriteWhenReadOnlyImpersonation } from "../middleware/denyWriteWhenReadOnlyImpersonation.js";

const writeLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 180,
  standardHeaders: true,
  legacyHeaders: false,
});

const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
});

function uploadExcel(req, res, next) {
  return excelUpload.single("file")(req, res, (error) => {
    if (!error) return next();
    if (error?.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: "El archivo Excel supera el tamano maximo permitido" });
    }
    return res.status(400).json({ error: "No se pudo leer el archivo Excel" });
  });
}

class RouterComidasGuardadas {
  constructor() {
    this.router = express.Router();
    this.controlador = new ControladorComidasGuardadas();
  }

  start() {
    console.log("RouterComidasGuardadas activo");

    this.router.get("/comidas-guardadas", authMiddleware, this.controlador.list);
    this.router.post(
      "/comidas-guardadas",
      authMiddleware,
      denyWriteWhenReadOnlyImpersonation,
      writeLimiter,
      this.controlador.create
    );
    this.router.post(
      "/comidas-guardadas/:id/duplicar",
      authMiddleware,
      denyWriteWhenReadOnlyImpersonation,
      writeLimiter,
      this.controlador.duplicate
    );
    this.router.post(
      "/comidas-guardadas/:id/favorita",
      authMiddleware,
      denyWriteWhenReadOnlyImpersonation,
      writeLimiter,
      this.controlador.favorite
    );
    this.router.post(
      "/comidas-guardadas/:id/agregar-a-tracking",
      authMiddleware,
      denyWriteWhenReadOnlyImpersonation,
      writeLimiter,
      this.controlador.addToTracking
    );
    this.router.get("/comidas-guardadas/:id", authMiddleware, this.controlador.getById);
    this.router.put(
      "/comidas-guardadas/:id",
      authMiddleware,
      denyWriteWhenReadOnlyImpersonation,
      writeLimiter,
      this.controlador.update
    );
    this.router.patch(
      "/comidas-guardadas/:id",
      authMiddleware,
      denyWriteWhenReadOnlyImpersonation,
      writeLimiter,
      this.controlador.update
    );
    this.router.delete(
      "/comidas-guardadas/:id",
      authMiddleware,
      denyWriteWhenReadOnlyImpersonation,
      writeLimiter,
      this.controlador.remove
    );

    this.router.get(
      "/profesional/comidas-plantillas",
      authMiddleware,
      requireRole("coach"),
      this.controlador.listProfessionalTemplates
    );
    this.router.post(
      "/profesional/comidas-plantillas",
      authMiddleware,
      requireRole("coach"),
      denyWriteWhenReadOnlyImpersonation,
      writeLimiter,
      this.controlador.createProfessionalTemplate
    );
    this.router.put(
      "/profesional/comidas-plantillas/:id",
      authMiddleware,
      requireRole("coach"),
      denyWriteWhenReadOnlyImpersonation,
      writeLimiter,
      this.controlador.updateProfessionalTemplate
    );
    this.router.post(
      "/profesional/comidas-plantillas/:id/asignar",
      authMiddleware,
      requireRole("coach"),
      denyWriteWhenReadOnlyImpersonation,
      writeLimiter,
      this.controlador.assignProfessionalTemplate
    );
    this.router.get(
      "/profesional/clientes/:clienteId/comidas-asignadas",
      authMiddleware,
      requireRole("coach"),
      this.controlador.listClientAssigned
    );

    this.router.get(
      "/admin/comidas-globales",
      authMiddleware,
      requireRole("admin"),
      this.controlador.listAdminGlobal
    );
    this.router.post(
      "/admin/comidas-globales",
      authMiddleware,
      requireRole("admin"),
      denyWriteWhenReadOnlyImpersonation,
      writeLimiter,
      this.controlador.createAdminGlobal
    );
    this.router.put(
      "/admin/comidas-globales/:id",
      authMiddleware,
      requireRole("admin"),
      denyWriteWhenReadOnlyImpersonation,
      writeLimiter,
      this.controlador.updateAdminGlobal
    );
    this.router.post(
      "/admin/comidas-globales/importar-excel/preview",
      authMiddleware,
      requireRole("admin"),
      denyWriteWhenReadOnlyImpersonation,
      writeLimiter,
      uploadExcel,
      this.controlador.previewAdminExcelImport
    );
    this.router.post(
      "/admin/comidas-globales/importar-excel/confirm",
      authMiddleware,
      requireRole("admin"),
      denyWriteWhenReadOnlyImpersonation,
      writeLimiter,
      this.controlador.confirmAdminExcelImport
    );

    return this.router;
  }
}

export default RouterComidasGuardadas;
