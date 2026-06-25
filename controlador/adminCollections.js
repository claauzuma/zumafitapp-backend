import ServicioAdminCollections from "../servicio/adminCollections.js";

function statusFromError(error) {
  if (error?.code === "DATABASE_NOT_AVAILABLE") return 503;
  if (error?.code === "COLLECTION_NOT_FOUND" || error?.code === "DOCUMENT_NOT_FOUND") return 404;
  if (
    error?.code === "INVALID_COLLECTION_NAME" ||
    error?.code === "INVALID_DOCUMENT_ID" ||
    error?.code === "INVALID_FIELD"
  ) {
    return 400;
  }
  return 500;
}

function messageFromError(error) {
  if (error?.code === "DATABASE_NOT_AVAILABLE") return "La base de datos no esta disponible.";
  if (error?.code === "COLLECTION_NOT_FOUND") return "La coleccion solicitada no existe.";
  if (error?.code === "DOCUMENT_NOT_FOUND") return "El documento solicitado no existe.";
  if (error?.code === "INVALID_COLLECTION_NAME") return "Nombre de coleccion invalido.";
  if (error?.code === "INVALID_DOCUMENT_ID") return "Id de documento invalido.";
  if (error?.code === "INVALID_FIELD") return "Campo de busqueda invalido.";
  return "No se pudo consultar la coleccion.";
}

class ControladorAdminCollections {
  constructor() {
    this.servicio = new ServicioAdminCollections();
  }

  handleError(res, error, context) {
    console.error(`Error en explorador admin de colecciones (${context}):`, error?.code || error?.message || error);
    return res.status(statusFromError(error)).json({ error: messageFromError(error) });
  }

  listarColecciones = async (req, res) => {
    try {
      const result = await this.servicio.listarColecciones();
      return res.json(result);
    } catch (error) {
      return this.handleError(res, error, "listarColecciones");
    }
  };

  obtenerDetalle = async (req, res) => {
    try {
      const result = await this.servicio.obtenerDetalle(req.params.collectionName);
      return res.json(result);
    } catch (error) {
      return this.handleError(res, error, "obtenerDetalle");
    }
  };

  listarDocumentos = async (req, res) => {
    try {
      const result = await this.servicio.listarDocumentos(req.params.collectionName, req.query);
      return res.json(result);
    } catch (error) {
      return this.handleError(res, error, "listarDocumentos");
    }
  };

  obtenerDocumento = async (req, res) => {
    try {
      const result = await this.servicio.obtenerDocumento(req.params.collectionName, req.params.documentId);
      return res.json(result);
    } catch (error) {
      return this.handleError(res, error, "obtenerDocumento");
    }
  };

  buscarDocumentos = async (req, res) => {
    try {
      const result = await this.servicio.buscarDocumentos(req.params.collectionName, req.query);
      return res.json(result);
    } catch (error) {
      return this.handleError(res, error, "buscarDocumentos");
    }
  };
}

export default ControladorAdminCollections;
