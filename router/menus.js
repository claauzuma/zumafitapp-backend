import express from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";

import ControladorMenus from "../controlador/menus.js";
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

class RouterMenus {
  constructor() {
    this.router = express.Router();
    this.controladorMenus = new ControladorMenus();
  }

  start() {
    console.log("RouterMenus activo");

    this.router.get("/", authMiddleware, this.controladorMenus.list);
    this.router.post(
      "/",
      authMiddleware,
      denyWriteWhenReadOnlyImpersonation,
      writeLimiter,
      this.controladorMenus.create
    );
    this.router.post(
      "/alimentos/equivalentes",
      authMiddleware,
      writeLimiter,
      this.controladorMenus.getFoodEquivalents
    );
    this.router.post(
      "/admin/importar-excel/preview",
      authMiddleware,
      requireRole("admin"),
      denyWriteWhenReadOnlyImpersonation,
      writeLimiter,
      uploadExcel,
      this.controladorMenus.previewAdminExcelImport
    );
    this.router.post(
      "/admin/importar-excel/confirm",
      authMiddleware,
      requireRole("admin"),
      denyWriteWhenReadOnlyImpersonation,
      writeLimiter,
      this.controladorMenus.confirmAdminExcelImport
    );
    this.router.post(
      "/:id/duplicar",
      authMiddleware,
      denyWriteWhenReadOnlyImpersonation,
      writeLimiter,
      this.controladorMenus.duplicate
    );
    this.router.get("/:id", authMiddleware, this.controladorMenus.getById);
    this.router.patch(
      "/:id",
      authMiddleware,
      denyWriteWhenReadOnlyImpersonation,
      writeLimiter,
      this.controladorMenus.update
    );
    this.router.delete(
      "/:id",
      authMiddleware,
      denyWriteWhenReadOnlyImpersonation,
      writeLimiter,
      this.controladorMenus.remove
    );

    return this.router;
  }
}

export default RouterMenus;
