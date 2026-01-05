// server.js
import express from "express";
import os from "os";
import CnxMongoDB from "./model/DBMongo.js";
import RouterAlimentos from "./router/alimentos.js";
import RouterUsuarios from "./router/usuarios.js";
import morgan from "morgan";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import cookieParser from "cookie-parser";
import RouterComidas from "./router/comidas.js";

function getLanIPv4s() {
  const nets = os.networkInterfaces();
  const ips = [];

  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      // net.family puede venir como "IPv4" o 4 según versión
      const isV4 = net.family === "IPv4" || net.family === 4;
      if (isV4 && !net.internal) ips.push(net.address);
    }
  }

  // quitar duplicados
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

    // ✅ Evita 304 por ETag (a veces rompe auth/me en mobile)
    this.app.set("etag", false);

    // ✅ Anti-cache global (respuesta)
    this.app.use((req, res, next) => {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Pragma", "no-cache");
      next();
    });

    // ✅ Conectar a MongoDB ANTES de rutas/listen si corresponde
    if (this.persistencia === "MONGODB") {
      await CnxMongoDB.conectar();
      console.log("Mongo conectado:", CnxMongoDB.connection);
      if (!CnxMongoDB.connection) {
        throw new Error("MongoDB no conectó (connection=false)");
      }
    } else {
      console.log("Persistencia:", this.persistencia, "(no conecta Mongo)");
    }

    /**
     * ✅ CORS robusto:
     * - permite localhost
     * - permite cualquier IP LAN 192.168.x.x en :5173 (tu front puede cambiar de .38 a .37, etc.)
     * - permite headers que manda tu front (Cache-Control / Pragma) para evitar el preflight error
     */
    const corsOptions = {
      origin: (origin, cb) => {
        // requests sin Origin (Postman/curl)
        if (!origin) return cb(null, true);

        // front local
        if (origin === "http://localhost:5173") return cb(null, true);

        // front en LAN (cambia la IP del front)
        if (/^http:\/\/192\.168\.\d+\.\d+:5173$/.test(origin)) return cb(null, true);
        if (origin === "https://zumafitapp.netlify.app") return cb(null, true);
        if (/^https:\/\/.*--zumafitapp\.netlify\.app$/.test(origin)) return cb(null, true);


        return cb(new Error("CORS: origin no permitido -> " + origin), false);
      },
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "Cache-Control", "Pragma"],
      credentials: true,
    };

    // ✅ CORS antes que cookies
    this.app.use(cors(corsOptions));
    // ✅ Preflight (Express 5) -> usamos regexp, no "*"
    this.app.options(/.*/, cors(corsOptions));

    // ✅ Cookies
    this.app.use(cookieParser());

    // ✅ Body
    this.app.use(express.json());

    // ✅ Logs
    this.app.use(morgan("dev"));

    // ✅ Static
    this.app.use("/uploads", express.static(path.join(__dirname, "public/uploads")));
    this.app.use(express.static("public"));

    this.app.get("/", (req, res) => {
      res.json({ message: "Esto en produ no falla" });
    });


    this.app.use("/api/alimentos", new RouterAlimentos(this.persistencia).start());
    this.app.use("/api/usuarios", new RouterUsuarios(this.persistencia).start());
    this.app.use("/api/comidas", new RouterComidas(this.persistencia).start());

    // 404
    this.app.use((req, res) => {
      res.status(404).json({ status: false, errors: "not found" });
    });

    // ✅ Iniciar servidor (escucha en LAN y también funciona en localhost)
    this.server = this.app.listen(this.port, "0.0.0.0", () => {
      console.log(`Servidor express escuchando en:`);
      console.log(`- Local: http://localhost:${this.port}`);

      const ips = getLanIPv4s();
      if (ips.length) {
        ips.forEach((ip) => console.log(`- Red:   http://${ip}:${this.port}`));
      } else {
        console.log(`- Red:   (no se encontró IPv4 LAN)`);
      }
    });

    this.server.on("error", (error) => {
      console.log(`Error en servidor: ${error.message}`);
    });

    return this.app;
  }

  async stop() {
    if (this.server) {
      this.server.close(() => console.log("Servidor cerrado"));
      if (this.persistencia === "MONGODB") {
        await CnxMongoDB.desconectar();
      }
      this.server = null;
    }
  }
}

export default Server;
