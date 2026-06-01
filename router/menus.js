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
