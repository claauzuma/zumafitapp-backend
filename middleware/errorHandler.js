export function errorHandler(err, req, res, next) {
  console.error("Unhandled error:", err);

  // Multer errors comunes
  if (err?.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ error: "Archivo demasiado grande" });
  }

  return res.status(500).json({ error: err?.message || "Error interno" });
}
