// src/middleware/authMiddleware.js
import jwt from "jsonwebtoken";

/**
 * Lee JWT desde:
 *  - Cookie: access_token (principal)
 *  - Header: Authorization: Bearer <token> (fallback)
 *
 * Setea:
 *   req.user = { id, email, role }
 */
export function authMiddleware(req, res, next) {
  try {
    let token = null;

    // 1) Cookie (principal)
    const cookieToken = req.cookies?.access_token;
    if (cookieToken && typeof cookieToken === "string" && cookieToken.trim()) {
      token = cookieToken.trim();
    }

    // 2) Header Authorization (fallback, importante para Safari/ITP cuando usás token por query + localStorage)
    if (!token) {
      const headerRaw =
        req.headers?.authorization ||
        req.headers?.Authorization ||
        "";

      const header = String(headerRaw).trim();
      if (/^Bearer\s+/i.test(header)) {
        token = header.replace(/^Bearer\s+/i, "").trim();
      }
    }

    if (!token) {
      return res.status(401).json({ error: "No autenticado: falta token" });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(500).json({ error: "Falta JWT_SECRET en el .env" });
    }

    const payload = jwt.verify(token, secret);

    // Soportamos varias keys comunes (para no romper nada si cambiaste el signer alguna vez)
    const uid = payload?.uid || payload?.id || payload?._id || payload?.userId;

    if (!uid) {
      return res.status(401).json({ error: "Token inválido: falta uid" });
    }

    req.user = {
      id: uid,
      email: payload?.email,
      role: payload?.role || payload?.rol,
    };

    return next();
  } catch (err) {
    const msg =
      err?.name === "TokenExpiredError"
        ? "Token expirado"
        : "Token inválido o expirado";
    return res.status(401).json({ error: msg });
  }
}
