export function errorHandler(err, req, res, next) {
  console.error("Unhandled error:", err);

  // Multer errors comunes
  if (err?.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ error: "Archivo demasiado grande" });
  }

  if (err?.type === "entity.too.large" || err?.status === 413) {
    return res.status(413).json({
      error: "La solicitud es demasiado grande. Intentá asignar menos dias o usar un menu mas liviano.",
      code: "PAYLOAD_TOO_LARGE",
    });
  }

  return res.status(500).json({ error: err?.message || "Error interno" });
}
