import express from "express";
import rateLimit from "express-rate-limit";

import ControladorFoodLogs from "../controlador/foodLogs.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { denyWriteWhenReadOnlyImpersonation } from "../middleware/denyWriteWhenReadOnlyImpersonation.js";

const writeLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 240,
  standardHeaders: true,
  legacyHeaders: false,
});

class RouterFoodLogs {
  constructor() {
    this.router = express.Router();
    this.controladorFoodLogs = new ControladorFoodLogs();
  }

  start() {
    console.log("RouterFoodLogs activo");

    this.router.get("/day", authMiddleware, this.controladorFoodLogs.getDay);
    this.router.post(
      "/day/logs",
      authMiddleware,
      denyWriteWhenReadOnlyImpersonation,
      writeLimiter,
      this.controladorFoodLogs.addLog
    );
    this.router.patch(
      "/day/logs/:logId",
      authMiddleware,
      denyWriteWhenReadOnlyImpersonation,
      writeLimiter,
      this.controladorFoodLogs.updateLog
    );
    this.router.delete(
      "/day/logs/:logId",
      authMiddleware,
      denyWriteWhenReadOnlyImpersonation,
      writeLimiter,
      this.controladorFoodLogs.deleteLog
    );

    return this.router;
  }
}

export default RouterFoodLogs;
