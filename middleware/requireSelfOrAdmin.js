/**
 * Permite si:
 *  - req.user.id === req.params[paramIdName]
 *  - o req.user.role === "admin"
 */
export function requireSelfOrAdmin(paramIdName = "id") {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "No autenticado" });

    const targetId = req.params[paramIdName];
    const isSelf = String(req.user.id) === String(targetId);
    const isAdmin = req.user.role === "admin";

    if (!isSelf && !isAdmin) {
      return res.status(403).json({ error: "No autorizado" });
    }

    next();
  };
}
