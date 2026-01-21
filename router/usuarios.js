// src/router/usuarios.js
import express from "express";
import multer from "multer";
import { rateLimit } from "express-rate-limit";
import passport from "../auth/google.js";

import ControladorUsuarios from "../controlador/usuarios.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/requireRole.js"; // ✅ BACKEND middleware

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype);
    cb(ok ? null : new Error("Formato inválido. Solo jpg/png/webp"), ok);
  },
});

const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
});

const codeSendLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
});

// ✅ encode state para llevar returnTo a callback
function encodeState(obj) {
  try {
    return Buffer.from(JSON.stringify(obj), "utf8").toString("base64url");
  } catch {
    return "";
  }
}

class RouterUsuarios {
  constructor(persistencia) {
    this.router = express.Router();
    this.controladorUsuarios = new ControladorUsuarios(persistencia);
  }

  start() {
    console.log("🔐 RouterUsuarios activo");

    // =========================
    // AUTH
    // =========================
    const auth = express.Router();

    auth.post("/register", this.controladorUsuarios.registerCliente);

    auth.post("/verify-email", this.controladorUsuarios.verifyEmail);
    auth.post("/resend-code", codeSendLimiter, this.controladorUsuarios.resendVerifyCode);

    auth.post("/login", loginLimiter, this.controladorUsuarios.login);

    auth.post("/forgot-password", codeSendLimiter, this.controladorUsuarios.forgotPassword);
    auth.post("/reset-password", this.controladorUsuarios.resetPassword);

    // =========================
    // ✅ GOOGLE OAuth (state)
    // =========================
    auth.get("/google", (req, res, next) => {
      const frontendBase =
        process.env.FRONTEND_URL ||
        process.env.APP_PUBLIC_URL ||
        "http://localhost:5173";

      const returnTo = req.query.returnTo
        ? String(req.query.returnTo)
        : `${frontendBase}/app/inicio`;

      const state = encodeState({ returnTo });

      passport.authenticate("google", {
        scope: ["profile", "email"],
        session: false,
        state,
      })(req, res, next);
    });

    auth.get(
      "/google/callback",
      passport.authenticate("google", {
        session: false,
        failureRedirect: `${process.env.FRONTEND_URL || "http://localhost:5173"}/auth?google=fail`,
      }),
      this.controladorUsuarios.googleCallback
    );

    auth.post("/logout", authMiddleware, this.controladorUsuarios.logout);
    auth.get("/me", authMiddleware, this.controladorUsuarios.me);

    this.router.use("/auth", auth);

    // =========================
    // ✅ ONBOARDING (self)
    // =========================
    // ✅ Ruta final: PATCH /api/usuarios/me/onboarding
    // (Esto es lo que tu front está llamando)
    this.router.patch(
      "/me/onboarding",
      authMiddleware,
      this.controladorUsuarios.actualizarOnboardingCliente // 👈 agregá este método en el controlador
    );

    // =========================
    // USERS (self)
    // =========================
    const users = express.Router();

    users.get("/me", authMiddleware, this.controladorUsuarios.obtenerPerfil);
    users.patch("/me", authMiddleware, this.controladorUsuarios.actualizarPerfil);
    users.post(
      "/me/avatar",
      authMiddleware,
      upload.single("avatar"),
      this.controladorUsuarios.subirAvatar
    );

    this.router.use("/users", users);

    // =========================
    // ✅ ADMIN: USERS CRUD
    // =========================
    const admin = express.Router();

    // GET /api/usuarios/admin/users?search=&role=&tipo=&estado=
    admin.get(
      "/users",
      authMiddleware,
      requireRole("admin"),
      this.controladorUsuarios.adminListUsers
    );

    // POST /api/usuarios/admin/users
    admin.post(
      "/users",
      authMiddleware,
      requireRole("admin"),
      this.controladorUsuarios.adminCreateUser
    );

    // GET /api/usuarios/admin/users/:id
    admin.get(
      "/users/:id",
      authMiddleware,
      requireRole("admin"),
      this.controladorUsuarios.adminGetUserById
    );

    // PATCH /api/usuarios/admin/users/:id
    admin.patch(
      "/users/:id",
      authMiddleware,
      requireRole("admin"),
      this.controladorUsuarios.adminUpdateUser
    );

    // DELETE /api/usuarios/admin/users/:id
    admin.delete(
      "/users/:id",
      authMiddleware,
      requireRole("admin"),
      this.controladorUsuarios.adminDeleteUser
    );

    this.router.use("/admin", admin);

    return this.router;
  }
}

export default RouterUsuarios;
