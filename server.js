// src/server.js
import express from "express";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import morgan from "morgan";
import cors from "cors";
import cookieParser from "cookie-parser";

import CnxMongoDB from "./model/DBMongo.js";
import RouterAlimentos from "./router/alimentos.js";
import RouterUsuarios from "./router/usuarios.js";
import RouterComidas from "./router/comidas.js";

import passport from "./auth/google.js";
import { setupGoogleAuth } from "./auth/google.js";

// ✅ Modelos para índices
import ModelMongoDBUsuarios from "./model/DAO/usuariosMongoDB.js";
import ModelMongoDBPendingUsers from "./model/DAO/pendingUsersMongoDB.js";
import ModelMongoDBPasswordResets from "./model/DAO/passwordResetMongoDB.js";

function getLanIPv4s() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      const isV4 = net.family === "IPv4" || net.family === 4;
      if (isV4 && !net.internal) ips.push(net.address);
    }
  }
  return [...new Set(ips)];
}

class Server {
  constructor(port, persistencia) {
    this.port = port;
    this.persistencia = persistencia;
    this.app = express();
    this.server = null;
  }

  async start() {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

      this.app.set("trust proxy", 1);

    // ✅ Evita 304 por ETag
    this.app.set("etag", false);

    // ✅ Anti-cache global
    this.app.use((req, res, next) => {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Pragma", "no-cache");
      next();
    });

    // ✅ Conectar Mongo
    if (this.persistencia === "MONGODB") {
      await CnxMongoDB.conectar();
      if (!CnxMongoDB.connection) throw new Error("MongoDB no conectó");

      // ✅ Índices
      try {
        await new ModelMongoDBUsuarios().ensureIndexes();
        await new ModelMongoDBPendingUsers().ensureIndexes();
        await new ModelMongoDBPasswordResets().ensureIndexes();
        console.log("✅ Índices asegurados (usuarios + pending + resets)");
      } catch (e) {
        console.log("⚠️ No se pudieron asegurar índices:", e?.message || e);
      }
    }

    // ✅ CORS robusto
    const corsOptions = {
      origin: (origin, cb) => {
        if (!origin) return cb(null, true); // postman/mobile/webview

        if (origin === "http://localhost:5173") return cb(null, true);
        if (/^http:\/\/192\.168\.\d+\.\d+:5173$/.test(origin)) return cb(null, true);

        if (origin === "https://zumafitapp.netlify.app") return cb(null, true);
        if (/^https:\/\/.*--zumafitapp\.netlify\.app$/.test(origin)) return cb(null, true);

        return cb(new Error("CORS origin no permitido -> " + origin), false);
      },
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "Cache-Control", "Pragma"],
      credentials: true,
    };

    this.app.use(cors(corsOptions));
    this.app.options(/.*/, cors(corsOptions));

    this.app.use(cookieParser());
    this.app.use(express.json());
    this.app.use(morgan("dev"));

    // ✅ TRACE GLOBAL (con host) para debug de cookies / google auth
    this.app.use((req, res, next) => {
      const hasCookieHeader = !!req.headers.cookie;
      const hasParsedAccessToken = !!req.cookies?.access_token;

      console.log(
        `[TRACE] host:${req.headers.host} ${req.method} ${req.originalUrl} | origin:${req.headers.origin || "-"} | referer:${req.headers.referer || "-"} | cookieHeader:${hasCookieHeader ? "SI" : "NO"} | access_token_cookie:${hasParsedAccessToken ? "SI" : "NO"}`
      );

      next();
    });

    this.app.use("/uploads", express.static(path.join(__dirname, "public/uploads")));
    this.app.use(express.static("public"));

    // ✅ Google OAuth (UNA SOLA VEZ)
    setupGoogleAuth();
    this.app.use(passport.initialize());

    this.app.get("/", (req, res) => res.json({ ok: true }));

    this.app.use("/api/alimentos", new RouterAlimentos(this.persistencia).start());
    this.app.use("/api/usuarios", new RouterUsuarios(this.persistencia).start());
    this.app.use("/api/comidas", new RouterComidas(this.persistencia).start());

    this.app.use((req, res) => res.status(404).json({ status: false, errors: "not found" }));

    this.server = this.app.listen(this.port, "0.0.0.0", () => {
      console.log(`Servidor express escuchando en:`);
      console.log(`- Local: http://localhost:${this.port}`);
      const ips = getLanIPv4s();
      ips.forEach((ip) => console.log(`- Red:   http://${ip}:${this.port}`));
    });

    this.server.on("error", (error) => console.log(`Error en servidor: ${error.message}`));

    return this.app;
  }

  async stop() {
    if (this.server) {
      this.server.close(() => console.log("Servidor cerrado"));
      if (this.persistencia === "MONGODB") await CnxMongoDB.desconectar();
      this.server = null;
    }
  }
}

export default Server;
