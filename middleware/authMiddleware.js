import jwt from "jsonwebtoken";

/**
 * Lee JWT desde:
 *  - Cookie: access_token (recomendado)
 *  - Header: Authorization: Bearer <token> (fallback para Postman)
 *
 * Setea:
 *   req.user = { id, email, role }
 */
export function authMiddleware(req, res, next) {
  try {
    let token = req.cookies?.access_token;

    if (!token) {
      const header = req.headers.authorization || "";
      if (header.startsWith("Bearer ")) token = header.slice(7);
    }

    if (!token) {
      return res.status(401).json({ error: "No autenticado: falta token" });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(500).json({ error: "Falta JWT_SECRET en el .env" });
    }

    const payload = jwt.verify(token, secret);

    // payload esperado: { uid, email, role, iat, exp }
    if (!payload?.uid) {
      return res.status(401).json({ error: "Token inválido: falta uid" });
    }

    req.user = {
      id: payload.uid,
      email: payload.email,
      role: payload.role,
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
