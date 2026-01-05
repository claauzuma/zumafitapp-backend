import express from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import ControladorUsuarios from "../controlador/usuarios.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/requireRole.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (req, file, cb) => {
    const ok = ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype);
    cb(ok ? null : new Error("Formato inválido. Solo jpg/png/webp"), ok);
  },
});

const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 min
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
});

class RouterUsuarios {
  constructor(persistencia) {
    this.router = express.Router();
    this.controladorUsuarios = new ControladorUsuarios(persistencia);
  }

  start() {
    console.log("🔐 RouterUsuarios activo (roles: admin/cliente)");

    // =========================
    // AUTH
    // =========================
    const auth = express.Router();

    auth.post("/register", this.controladorUsuarios.registerCliente);
    auth.post("/login", loginLimiter, this.controladorUsuarios.login);

    // Logout (requiere cookie válida => importante enviar credentials desde el front)
    auth.post("/logout", authMiddleware, this.controladorUsuarios.logout);

    // Sesión actual
    auth.get("/me", authMiddleware, this.controladorUsuarios.me);

    this.router.use("/auth", auth);

    // =========================
    // USERS
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

    users.post("/", authMiddleware, requireRole("admin"), this.controladorUsuarios.crearUsuario);

    this.router.use("/users", users);

    return this.router;
  }
}

export default RouterUsuarios;
