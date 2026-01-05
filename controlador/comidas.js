import Servicio from "../servicio/comidas.js";

function isValidPositiveNumber(n) {
  const x = Number(n);
  return Number.isFinite(x) && x > 0;
}

function toStr(v) {
  return String(v ?? "").trim();
}

/**
 * Devuelve un objeto "limpio" para el response:
 * - id aparece UNA sola vez
 * - NO incluye _id, createdAt, updatedAt
 */
function toComidaDTO(comida) {
  if (!comida) return null;

  const id = comida.id || comida._id; // por si el service devuelve uno u otro

  return {
    id: id?.toString?.() || String(id),
    userId: comida.userId,
    nombre: comida.nombre,
    items: comida.items,
  };
}

/**
 * Espera body tipo:
 * {
 *   nombre?: "Almuerzo",
 *   alimento1: "ARROZ",
 *   cantidad1: 100,
 *   ...
 *   alimento8/cantidad8
 * }
 *
 * Devuelve items: [{alimento, cantidad}, ...]
 */
function parseItemsFromBody(body) {
  const items = [];

  for (let i = 1; i <= 8; i++) {
    const alimento = toStr(body?.[`alimento${i}`]);
    const cantidad = body?.[`cantidad${i}`];

    if (!alimento) continue; // permite que falten slots

    if (!isValidPositiveNumber(cantidad)) {
      throw new Error(`CANTIDAD_INVALIDA_${i}`);
    }

    items.push({ alimento, cantidad: Number(cantidad) });
  }

  return items;
}

function hasDuplicates(items) {
  const set = new Set();
  for (const it of items) {
    const key = (it.alimento || "").toLowerCase();
    if (set.has(key)) return true;
    set.add(key);
  }
  return false;
}

class ControladorComidas {
  constructor(persistencia) {
    this.servicio = new Servicio(persistencia);
  }

  // POST /api/comidas
  crearComida = async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "No autenticado" });

      const { nombre } = req.body || {};
      const items = parseItemsFromBody(req.body);

      if (items.length < 2 || items.length > 8) {
        return res.status(400).json({ error: "La comida debe tener entre 2 y 8 alimentos" });
      }

      if (hasDuplicates(items)) {
        return res.status(400).json({ error: "No repitas el mismo alimento en la misma comida" });
      }

      const comida = await this.servicio.crearComida({
        userId,
        nombre: toStr(nombre) || null,
        items,
      });

      return res.status(201).json({ comida: toComidaDTO(comida) });
    } catch (error) {
      console.error("Error crearComida:", error);

      const msg = String(error?.message || "");
      if (msg.startsWith("CANTIDAD_INVALIDA_")) {
        const idx = msg.split("_").pop();
        return res.status(400).json({ error: `cantidad${idx} inválida (debe ser número > 0)` });
      }

      return res.status(500).json({ error: "Error en el servidor" });
    }
  };

  // GET /api/comidas
  listarComidas = async (req, res) => {
    try {
      const userId = req.user?.id;
      const role = req.user?.role;

      const comidas = await this.servicio.listarComidas({ userId, role });

      return res.json({ comidas: (comidas || []).map(toComidaDTO) });
    } catch (error) {
      console.error("Error listarComidas:", error);
      return res.status(500).json({ error: "Error en el servidor" });
    }
  };

  // GET /api/comidas/:id
  obtenerComidaPorId = async (req, res) => {
    try {
      const userId = req.user?.id;
      const role = req.user?.role;
      const { id } = req.params;

      const comida = await this.servicio.obtenerPorId({ id, userId, role });
      if (!comida) return res.status(404).json({ error: "Comida no encontrada" });

      return res.json({ comida: toComidaDTO(comida) });
    } catch (error) {
      console.error("Error obtenerComidaPorId:", error);

      if (String(error?.message) === "FORBIDDEN") {
        return res.status(403).json({ error: "No tenés permisos para ver esta comida" });
      }

      return res.status(500).json({ error: "Error en el servidor" });
    }
  };

  // PATCH /api/comidas/:id
  actualizarComida = async (req, res) => {
    try {
      const userId = req.user?.id;
      const role = req.user?.role;
      const { id } = req.params;

      const { nombre } = req.body || {};
      const items = parseItemsFromBody(req.body);

      // En PATCH: permitimos actualizar nombre solo, o items (si manda items)
      const updates = {};
      if (nombre !== undefined) updates.nombre = toStr(nombre) || null;

      if (items.length > 0) {
        if (items.length < 2 || items.length > 8) {
          return res.status(400).json({ error: "La comida debe tener entre 2 y 8 alimentos" });
        }
        if (hasDuplicates(items)) {
          return res.status(400).json({ error: "No repitas el mismo alimento en la misma comida" });
        }
        updates.items = items;
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "No hay campos para actualizar" });
      }

      const comida = await this.servicio.actualizarComida({
        id,
        userId,
        role,
        updates,
      });

      return res.json({ comida: toComidaDTO(comida) });
    } catch (error) {
      console.error("Error actualizarComida:", error);

      const msg = String(error?.message || "");
      if (msg === "NOT_FOUND") return res.status(404).json({ error: "Comida no encontrada" });
      if (msg === "FORBIDDEN") return res.status(403).json({ error: "No tenés permisos" });

      if (msg.startsWith("CANTIDAD_INVALIDA_")) {
        const idx = msg.split("_").pop();
        return res.status(400).json({ error: `cantidad${idx} inválida (debe ser número > 0)` });
      }

      return res.status(500).json({ error: "Error en el servidor" });
    }
  };

  // DELETE /api/comidas/:id
  eliminarComida = async (req, res) => {
    try {
      const userId = req.user?.id;
      const role = req.user?.role;
      const { id } = req.params;

      const r = await this.servicio.eliminarComida({ id, userId, role });
      if (r?.deletedCount === 0) return res.status(404).json({ error: "Comida no encontrada" });

      return res.status(200).json({ message: "Comida eliminada" });
    } catch (error) {
      console.error("Error eliminarComida:", error);

      if (String(error?.message) === "FORBIDDEN") {
        return res.status(403).json({ error: "No tenés permisos" });
      }

      return res.status(500).json({ error: "Error en el servidor" });
    }
  };

  // GET /api/comidas/admin/todas
  listarTodasAdmin = async (req, res) => {
    try {
      const comidas = await this.servicio.listarTodasAdmin();
      return res.json({ comidas: (comidas || []).map(toComidaDTO) });
    } catch (error) {
      console.error("Error listarTodasAdmin:", error);
      return res.status(500).json({ error: "Error en el servidor" });
    }
  };
}

export default ControladorComidas;
