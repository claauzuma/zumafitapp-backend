import jwt from "jsonwebtoken";

function getBearerToken(req) {
  const headerRaw =
    req.headers?.authorization ||
    req.headers?.Authorization ||
    "";

  const header = String(headerRaw).trim();
  if (!/^Bearer\s+/i.test(header)) return null;
  return header.replace(/^Bearer\s+/i, "").trim();
}

function getCookieToken(req) {
  const token = req.cookies?.access_token;
  return token && typeof token === "string" && token.trim() ? token.trim() : null;
}

function mapPayloadToUser(payload) {
  const uid = payload?.uid || payload?.id || payload?._id || payload?.userId;
  if (!uid) return null;

  return {
    id: uid,
    email: payload?.email,
    role: payload?.role || payload?.rol,
    impersonation: payload?.impersonation === true,
    readOnly: payload?.readOnly === true,
    actorAdminId: payload?.actorAdminId || null,
    targetUserId: payload?.targetUserId || uid,
    targetRole: payload?.targetRole || payload?.role || payload?.rol,
    impersonationSessionId: payload?.sessionId || null,
    impersonationStartedAt: payload?.startedAt || null,
  };
}

export function authMiddleware(req, res, next) {
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(500).json({ error: "Falta JWT_SECRET en el .env" });
    }

    const cookieToken = getCookieToken(req);
    const headerToken = getBearerToken(req);

    if (!cookieToken && !headerToken) {
      return res.status(401).json({ error: "No autenticado: falta token" });
    }

    let payload = null;

    if (headerToken) {
      try {
        const headerPayload = jwt.verify(headerToken, secret);
        if (headerPayload?.impersonation === true) {
          payload = headerPayload;
        }
      } catch {
        payload = null;
      }
    }

    if (!payload && cookieToken) {
      payload = jwt.verify(cookieToken, secret);
    }

    if (!payload && headerToken) {
      payload = jwt.verify(headerToken, secret);
    }

    const user = mapPayloadToUser(payload);
    if (!user) {
      return res.status(401).json({ error: "Token invalido: falta uid" });
    }

    req.user = user;
    return next();
  } catch (err) {
    const msg =
      err?.name === "TokenExpiredError"
        ? "Token expirado"
        : "Token invalido o expirado";
    return res.status(401).json({ error: msg });
  }
}
