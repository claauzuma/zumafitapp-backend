const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function denyWriteWhenReadOnlyImpersonation(req, res, next) {
  if (!req.user?.impersonation || !req.user?.readOnly) return next();
  if (SAFE_METHODS.has(String(req.method || "").toUpperCase())) return next();

  return res.status(403).json({
    error: "Modo simulacion de solo lectura: esta accion no esta permitida",
    impersonation: true,
    readOnly: true,
  });
}
