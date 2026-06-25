import express from "express";
import rateLimit from "express-rate-limit";

import ControladorNutritionLibrary from "../controlador/nutritionLibrary.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { denyWriteWhenReadOnlyImpersonation } from "../middleware/denyWriteWhenReadOnlyImpersonation.js";
import { requireRole } from "../middleware/requireRole.js";

const writeLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 180,
  standardHeaders: true,
  legacyHeaders: false,
});

class RouterNutritionLibrary {
  constructor() {
    this.router = express.Router();
    this.controlador = new ControladorNutritionLibrary();
  }

  start() {
    console.log("RouterNutritionLibrary activo");

    this.router.get(
      "/nutricion/biblioteca/comidas",
      authMiddleware,
      this.controlador.listMeals
    );
    this.router.get(
      "/nutricion/biblioteca/menus",
      authMiddleware,
      this.controlador.listMenus
    );

    this.router.post(
      "/nutricion/biblioteca/comidas/:id/copiar-a-mis-comidas",
      authMiddleware,
      denyWriteWhenReadOnlyImpersonation,
      writeLimiter,
      this.controlador.copyMeal
    );
    this.router.post(
      "/nutricion/biblioteca/menus/:id/copiar-a-mis-menus",
      authMiddleware,
      denyWriteWhenReadOnlyImpersonation,
      writeLimiter,
      this.controlador.copyMenu
    );

    this.router.post(
      "/nutricion/biblioteca/comidas/:id/favorita",
      authMiddleware,
      denyWriteWhenReadOnlyImpersonation,
      writeLimiter,
      this.controlador.favoriteMeal
    );
    this.router.delete(
      "/nutricion/biblioteca/comidas/:id/favorita",
      authMiddleware,
      denyWriteWhenReadOnlyImpersonation,
      writeLimiter,
      this.controlador.unfavoriteMeal
    );
    this.router.post(
      "/nutricion/biblioteca/menus/:id/favorito",
      authMiddleware,
      denyWriteWhenReadOnlyImpersonation,
      writeLimiter,
      this.controlador.favoriteMenu
    );
    this.router.delete(
      "/nutricion/biblioteca/menus/:id/favorito",
      authMiddleware,
      denyWriteWhenReadOnlyImpersonation,
      writeLimiter,
      this.controlador.unfavoriteMenu
    );

    this.router.post(
      "/profesional/biblioteca/comidas/:id/asignar",
      authMiddleware,
      requireRole("coach"),
      denyWriteWhenReadOnlyImpersonation,
      writeLimiter,
      this.controlador.assignMeal
    );
    this.router.post(
      "/profesional/biblioteca/menus/:id/asignar",
      authMiddleware,
      requireRole("coach"),
      denyWriteWhenReadOnlyImpersonation,
      writeLimiter,
      this.controlador.assignMenu
    );

    return this.router;
  }
}

export default RouterNutritionLibrary;
