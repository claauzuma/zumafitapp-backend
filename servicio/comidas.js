import ModelFactory from "../model/DAO/comidasFactory.js";

class ServicioComidas {
  constructor(persistencia) {
    this.model = ModelFactory.get(persistencia);
  }

  _normalizeDoc(d) {
    if (!d) return null;

    const id = d._id?.toString?.() || d.id?.toString?.() || d._id || d.id;

    return {
      ...d,
      _id: id,
      id,
      userId: d.userId?.toString?.() || d.userId,
      nombre: d.nombre ?? null,
      items: Array.isArray(d.items) ? d.items : [],
      createdAt: d.createdAt || null,
      updatedAt: d.updatedAt || null,
    };
  }

  async crearComida({ userId, nombre, items }) {
    if (!userId) throw new Error("USERID_REQUERIDO");
    if (!Array.isArray(items) || items.length < 2 || items.length > 8) {
      throw new Error("ITEMS_INVALIDOS");
    }

    const doc = {
      userId,       // el dueño
      nombre: nombre || null,
      items,        // [{alimento, cantidad}, ...]
      createdAt: new Date(),
      updatedAt: null,
    };

    const created = await this.model.crearComida(doc);
    return this._normalizeDoc(created);
  }

  async listarComidas({ userId, role }) {
    if (role === "admin") {
      const all = await this.model.listarComidas({});
      return all.map((x) => this._normalizeDoc(x));
    }

    // cliente: propias
    const mine = await this.model.listarComidas({ userId });
    return mine.map((x) => this._normalizeDoc(x));
  }

  async listarTodasAdmin() {
    const all = await this.model.listarComidas({});
    return all.map((x) => this._normalizeDoc(x));
  }

  async obtenerPorId({ id, userId, role }) {
    const doc = await this.model.obtenerPorId(id);
    if (!doc) return null;

    // permiso
    if (role !== "admin" && String(doc.userId) !== String(userId)) {
      throw new Error("FORBIDDEN");
    }

    return this._normalizeDoc(doc);
  }

  async actualizarComida({ id, userId, role, updates }) {
    const doc = await this.model.obtenerPorId(id);
    if (!doc) throw new Error("NOT_FOUND");

    if (role !== "admin" && String(doc.userId) !== String(userId)) {
      throw new Error("FORBIDDEN");
    }

    const updated = await this.model.updateById(id, updates);
    return this._normalizeDoc(updated);
  }

  async eliminarComida({ id, userId, role }) {
    const doc = await this.model.obtenerPorId(id);
    if (!doc) return { deletedCount: 0 };

    if (role !== "admin" && String(doc.userId) !== String(userId)) {
      throw new Error("FORBIDDEN");
    }

    return await this.model.borrarComida(id);
  }
}

export default ServicioComidas;
