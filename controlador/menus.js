import ServicioMenus from "../servicio/menus.js";
import ServicioMenusExcelImport from "../servicio/menusExcelImport.js";
import { accessErrorPayload, isAccessGateError } from "../servicio/accessGates.js";

function sendError(res, error) {
  const msg = String(error?.message || "");

  if (msg === "NO_AUTENTICADO") return res.status(401).json({ error: "No autenticado" });
  if (isAccessGateError(error)) return res.status(403).json(accessErrorPayload(error));
  if (msg === "NOT_FOUND") return res.status(404).json({ error: "Menu no encontrado" });
  if (msg === "CLIENT_NOT_FOUND") return res.status(404).json({ error: "Cliente no encontrado" });
  if (msg === "FORBIDDEN") return res.status(403).json({ error: "No tenes permisos para este menu" });
  if (msg === "USER_NOT_CLIENT") return res.status(400).json({ error: "El usuario no es cliente" });
  if (msg === "CLIENT_NOT_ASSIGNED_TO_COACH") {
    return res.status(403).json({ error: "Este cliente no esta asignado a tu cuenta profesional" });
  }
  if (msg === "COACH_NUTRITION_NOT_ALLOWED") {
    return res.status(403).json({ error: "Tu perfil profesional no tiene acceso a menus" });
  }
  if (msg === "COACH_FEATURE_NOT_ALLOWED") {
    return res.status(403).json({ error: "Tu plan no permite esta accion" });
  }
  if (msg === "COACH_MENU_LIMIT_EXCEEDED") {
    return res.status(409).json({
      code: msg,
      error: "Alcanzaste el limite de menus propios de tu plan.",
      current: Number(error?.current || 0),
      limit: Number(error?.limit || 0),
      plan: error?.plan || null,
      overrideApplied: !!error?.overrideApplied,
      upgradeTarget: error?.upgradeTarget || null,
    });
  }
  if (msg === "MENU_BASE_REQUIRED") return res.status(400).json({ error: "Falta menuBaseId" });
  if (msg === "ID_INVALIDO") return res.status(400).json({ error: "ID invalido" });
  if (msg === "DUPLICATE_IDENTICAL") return res.status(409).json({ error: "La copia es identica a un menu existente. Cambia nombre, comidas o cantidades antes de guardar." });
  if (msg === "EXCEL_FILE_REQUIRED") return res.status(400).json({ error: "Subi un archivo Excel para importar" });
  if (msg === "EXCEL_FILE_TOO_LARGE") return res.status(413).json({ error: "El archivo Excel supera el tamano maximo permitido" });
  if (msg === "EXCEL_FILE_INVALID_TYPE") return res.status(400).json({ error: "El archivo debe ser .xlsx o .xls" });
  if (msg === "MENUS_SHEET_REQUIRED") return res.status(400).json({ error: "El archivo debe contener una hoja llamada Menus" });
  if (msg === "IMPORT_TOKEN_INVALID") return res.status(400).json({ error: "La previsualizacion vencio o no existe. Volve a subir el Excel." });
  if (msg === "IMPORT_HAS_ERRORS") return res.status(400).json({ error: "La importacion tiene errores. Activá importar solo validos o corregi el Excel." });
  if (msg === "IMPORT_NO_VALID_MENUS") return res.status(400).json({ error: "No hay menus validos para importar." });

  console.error("Error menus:", error);
  return res.status(500).json({ error: "Error en el servidor" });
}

class ControladorMenus {
  constructor() {
    this.servicio = new ServicioMenus();
    this.importadorExcel = new ServicioMenusExcelImport();
  }

  list = async (req, res) => {
    try {
      const data = await this.servicio.listMenus(req.user, req.query || {});
      return res.json(data);
    } catch (error) {
      return sendError(res, error);
    }
  };

  getById = async (req, res) => {
    try {
      const menu = await this.servicio.getMenu(req.user, req.params.id);
      return res.json({ menu });
    } catch (error) {
      return sendError(res, error);
    }
  };

  create = async (req, res) => {
    try {
      const menu = await this.servicio.createMenu(req.user, req.body || {});
      return res.status(201).json({ ok: true, menu });
    } catch (error) {
      return sendError(res, error);
    }
  };

  update = async (req, res) => {
    try {
      const menu = await this.servicio.updateMenu(req.user, req.params.id, req.body || {});
      return res.json({ ok: true, menu });
    } catch (error) {
      return sendError(res, error);
    }
  };

  remove = async (req, res) => {
    try {
      const result = await this.servicio.deleteMenu(req.user, req.params.id);
      return res.json({ ok: true, ...result });
    } catch (error) {
      return sendError(res, error);
    }
  };

  duplicate = async (req, res) => {
    try {
      const menu = await this.servicio.duplicateMenu(req.user, req.params.id, req.body || {});
      return res.status(201).json({ ok: true, menu });
    } catch (error) {
      return sendError(res, error);
    }
  };

  getFoodEquivalents = async (req, res) => {
    try {
      const data = await this.servicio.getFoodEquivalents(req.user, req.body || {});
      return res.json(data);
    } catch (error) {
      return sendError(res, error);
    }
  };

  assignToClient = async (req, res) => {
    try {
      const menu = await this.servicio.assignMenu(req.user, req.params.clienteId, req.body || {});
      return res.status(201).json({ ok: true, menu });
    } catch (error) {
      return sendError(res, error);
    }
  };

  listClientMenus = async (req, res) => {
    try {
      const data = await this.servicio.listClienteMenus(req.user, req.params.clienteId, req.query || {});
      return res.json(data);
    } catch (error) {
      return sendError(res, error);
    }
  };

  getActiveClientMenu = async (req, res) => {
    try {
      const menu = await this.servicio.getClienteMenuActivo(req.user, req.params.clienteId);
      return res.json({ menu });
    } catch (error) {
      return sendError(res, error);
    }
  };

  getClientMenu = async (req, res) => {
    try {
      const menu = await this.servicio.getClienteMenu(
        req.user,
        req.params.clienteId,
        req.params.menuAsignadoId
      );
      return res.json({ menu });
    } catch (error) {
      return sendError(res, error);
    }
  };

  updateClientMenu = async (req, res) => {
    try {
      const menu = await this.servicio.updateClienteMenu(
        req.user,
        req.params.clienteId,
        req.params.menuAsignadoId,
        req.body || {}
      );
      return res.json({ ok: true, menu });
    } catch (error) {
      return sendError(res, error);
    }
  };

  deleteClientMenu = async (req, res) => {
    try {
      const result = await this.servicio.deleteClienteMenu(
        req.user,
        req.params.clienteId,
        req.params.menuAsignadoId
      );
      return res.json({ ok: true, ...result });
    } catch (error) {
      return sendError(res, error);
    }
  };

  duplicateClientMenu = async (req, res) => {
    try {
      const menu = await this.servicio.duplicateClienteMenu(
        req.user,
        req.params.clienteId,
        req.params.menuAsignadoId,
        req.body || {}
      );
      return res.status(201).json({ ok: true, menu });
    } catch (error) {
      return sendError(res, error);
    }
  };

  saveClientMenuAsTemplate = async (req, res) => {
    try {
      const menu = await this.servicio.saveClienteMenuAsTemplate(
        req.user,
        req.params.clienteId,
        req.params.menuAsignadoId,
        req.body || {}
      );
      return res.status(201).json({ ok: true, menu });
    } catch (error) {
      return sendError(res, error);
    }
  };

  previewAdminExcelImport = async (req, res) => {
    try {
      const data = await this.importadorExcel.preview(req.file, req.body || {}, req.user || {});
      return res.json(data);
    } catch (error) {
      return sendError(res, error);
    }
  };

  confirmAdminExcelImport = async (req, res) => {
    try {
      const data = await this.importadorExcel.confirm(req.body?.importToken, req.body || {}, req.user || {});
      return res.json(data);
    } catch (error) {
      return sendError(res, error);
    }
  };
}

export default ControladorMenus;
