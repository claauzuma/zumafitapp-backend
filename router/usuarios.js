import express from "express";
import multer from "multer";
import { rateLimit } from "express-rate-limit";
import passport from "../auth/google.js";

import ControladorUsuarios from "../controlador/usuarios.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/requireRole.js";

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
    // SELF / ONBOARDING
    // =========================
    this.router.patch(
      "/me/onboarding",
      authMiddleware,
      this.controladorUsuarios.actualizarOnboardingCliente
    );

    const users = express.Router();

    users.get("/me/updatedAt", authMiddleware, this.controladorUsuarios.getUpdatedAt);
    users.get("/me", authMiddleware, this.controladorUsuarios.obtenerPerfil);
    users.patch("/me", authMiddleware, this.controladorUsuarios.actualizarPerfil);
    users.patch(
      "/me/coach-welcome-seen",
      authMiddleware,
      this.controladorUsuarios.markCoachWelcomeSeen
    );

    users.post(
      "/me/avatar",
      authMiddleware,
      upload.single("avatar"),
      this.controladorUsuarios.subirAvatar
    );

    this.router.use("/users", users);

    // =========================
    // ADMIN
    // =========================
    const admin = express.Router();

    // -------- Invitaciones --------
    admin.post(
      "/invitations",
      authMiddleware,
      requireRole("admin"),
      this.controladorUsuarios.adminCreateInvitation
    );

    admin.get(
      "/invitations",
      authMiddleware,
      requireRole("admin"),
      this.controladorUsuarios.adminListInvitations
    );

    admin.get(
      "/invitations/:invitationId",
      authMiddleware,
      requireRole("admin"),
      this.controladorUsuarios.adminGetInvitationById
    );

    admin.patch(
      "/invitations/:invitationId/cancel",
      authMiddleware,
      requireRole("admin"),
      this.controladorUsuarios.adminCancelInvitation
    );

    admin.delete(
      "/invitations/:invitationId",
      authMiddleware,
      requireRole("admin"),
      this.controladorUsuarios.adminDeleteInvitation
    );

    // -------- Helpers para panel admin --------
    admin.get(
      "/coaches",
      authMiddleware,
      requireRole("admin"),
      this.controladorUsuarios.adminListCoaches
    );

    admin.get(
      "/clients/unassigned",
      authMiddleware,
      requireRole("admin"),
      this.controladorUsuarios.adminListUnassignedClients
    );

    // -------- CRUD users --------
    admin.get(
      "/users",
      authMiddleware,
      requireRole("admin"),
      this.controladorUsuarios.adminListUsers
    );

    admin.post(
      "/users",
      authMiddleware,
      requireRole("admin"),
      this.controladorUsuarios.adminCreateUser
    );

    admin.get(
      "/users/:id",
      authMiddleware,
      requireRole("admin"),
      this.controladorUsuarios.adminGetUserById
    );

    admin.patch(
      "/users/:id",
      authMiddleware,
      requireRole("admin"),
      this.controladorUsuarios.adminUpdateUser
    );

    admin.delete(
      "/users/:id",
      authMiddleware,
      requireRole("admin"),
      this.controladorUsuarios.adminDeleteUser
    );

    // -------- Cuenta / estado / plan --------
    admin.patch(
      "/users/:id/status",
      authMiddleware,
      requireRole("admin"),
      this.controladorUsuarios.adminUpdateStatus
    );

    admin.patch(
      "/users/:id/plan",
      authMiddleware,
      requireRole("admin"),
      this.controladorUsuarios.adminUpdatePlan
    );

    admin.patch(
      "/users/:id/admin-meta",
      authMiddleware,
      requireRole("admin"),
      this.controladorUsuarios.adminUpdateAdminMeta
    );

    admin.patch(
      "/users/:id/reset-onboarding",
      authMiddleware,
      requireRole("admin"),
      this.controladorUsuarios.adminResetOnboarding
    );

    // -------- Cliente: objetivos / metas --------
    admin.patch(
      "/users/:id/goals",
      authMiddleware,
      requireRole("admin"),
      this.controladorUsuarios.adminUpdateGoals
    );

    admin.patch(
      "/users/:id/daily-goals",
      authMiddleware,
      requireRole("admin"),
      this.controladorUsuarios.adminUpdateDailyGoals
    );

    // -------- Relación coach <-> cliente --------
    admin.patch(
      "/users/:id/assign-coach",
      authMiddleware,
      requireRole("admin"),
      this.controladorUsuarios.adminAssignCoach
    );

    admin.patch(
      "/users/:id/unassign-coach",
      authMiddleware,
      requireRole("admin"),
      this.controladorUsuarios.adminUnassignCoach
    );

    admin.get(
      "/users/:id/clients",
      authMiddleware,
      requireRole("admin"),
      this.controladorUsuarios.adminGetCoachClients
    );

    // -------- Coach: perfil / permisos / límites --------
    admin.patch(
      "/users/:id/coach-profile",
      authMiddleware,
      requireRole("admin"),
      this.controladorUsuarios.adminUpdateCoachProfile
    );

    admin.patch(
      "/users/:id/coach-capabilities",
      authMiddleware,
      requireRole("admin"),
      this.controladorUsuarios.adminUpdateCoachCapabilities
    );

    this.router.use("/admin", admin);

    return this.router;
  }
}

export default RouterUsuarios;
