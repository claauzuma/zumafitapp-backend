import { ObjectId } from "mongodb";
import CnxMongoDB from "../DBMongo.js";
import { SOFT_DELETED_FAVORITE_RETENTION_DAYS } from "../../utils/dataRetention.js";

function cleanId(value = "") {
  return String(value || "").trim();
}

function mongoId(value = "") {
  const id = cleanId(value);
  if (!id) return null;
  return ObjectId.isValid(id) ? new ObjectId(id) : id;
}

function idValues(value = "") {
  const id = cleanId(value);
  if (!id) return [];
  return ObjectId.isValid(id) ? [id, new ObjectId(id)] : [id];
}

function trimTrailingNulls(values = []) {
  const copy = [...values];
  while (copy.length && (copy[copy.length - 1] === null || copy[copy.length - 1] === undefined)) {
    copy.pop();
  }
  return copy;
}

function macroTuple(value = {}) {
  return [
    Number(value?.kcal || 0),
    Number(value?.proteina || 0),
    Number(value?.carbs || 0),
    Number(value?.grasas || 0),
  ];
}

function tupleMacros(value = []) {
  return {
    kcal: Number(value?.[0] || 0),
    proteina: Number(value?.[1] || 0),
    carbs: Number(value?.[2] || 0),
    grasas: Number(value?.[3] || 0),
  };
}

function packItem(value = {}) {
  const alimentoId = cleanId(value.alimentoId) || null;
  const itemId = cleanId(value.id);
  return trimTrailingNulls([
    itemId && itemId !== alimentoId ? itemId : null,
    alimentoId,
    String(value.nombreSnapshot || ""),
    Number(value.cantidad || 0),
    value.unidad && value.unidad !== "g" ? String(value.unidad) : null,
    Number(value.kcal || 0),
    Number(value.proteina || 0),
    Number(value.carbs || 0),
    Number(value.grasas || 0),
    value.imagenUrl ? String(value.imagenUrl) : null,
    value.quantityMode && value.quantityMode !== "manual" ? String(value.quantityMode) : null,
  ]);
}

function unpackItem(value = [], index = 0) {
  const alimentoId = value?.[1] || null;
  return {
    id: value?.[0] || alimentoId || `food-${index + 1}`,
    alimentoId,
    nombreSnapshot: value?.[2] || `Alimento ${index + 1}`,
    cantidad: Number(value?.[3] || 0),
    unidad: value?.[4] || "g",
    kcal: Number(value?.[5] || 0),
    proteina: Number(value?.[6] || 0),
    carbs: Number(value?.[7] || 0),
    grasas: Number(value?.[8] || 0),
    imagenUrl: value?.[9] || "",
    quantityMode: value?.[10] || "manual",
  };
}

function packPhysicalMeal(meal = {}) {
  return trimTrailingNulls([
    cleanId(meal.id) || null,
    String(meal.nombre || ""),
    String(meal.tipoComida || "otro"),
    meal.compositionOrigin && meal.compositionOrigin !== "manual"
      ? String(meal.compositionOrigin)
      : null,
    macroTuple(meal.totals),
    (Array.isArray(meal.items) ? meal.items : []).map(packItem),
  ]);
}

function unpackPhysicalMeal(value = [], index = 0) {
  return {
    id: value?.[0] || `meal-${index + 1}`,
    nombre: value?.[1] || `Comida ${index + 1}`,
    tipoComida: value?.[2] || "otro",
    order: index,
    compositionOrigin: value?.[3] || "manual",
    totals: tupleMacros(value?.[4]),
    items: (Array.isArray(value?.[5]) ? value[5] : []).map(unpackItem),
  };
}

function packTargetMeal(meal = {}) {
  return trimTrailingNulls([
    cleanId(meal.id) || null,
    String(meal.name || ""),
    String(meal.type || "otro"),
    macroTuple(meal.target),
    meal.targetOrigin && meal.targetOrigin !== "manual" ? String(meal.targetOrigin) : null,
  ]);
}

function unpackTargetMeal(value = [], index = 0) {
  return {
    id: value?.[0] || `target-${index + 1}`,
    name: value?.[1] || `Comida ${index + 1}`,
    type: value?.[2] || "otro",
    order: index,
    target: tupleMacros(value?.[3]),
    targetOrigin: value?.[4] || "manual",
  };
}

export function packFavoriteStorageFields(document = {}) {
  const packed = {};
  let hasPackedField = false;
  if (Object.prototype.hasOwnProperty.call(document, "dailyTarget")) {
    packed.dt = macroTuple(document.dailyTarget);
    hasPackedField = true;
  }
  if (Object.prototype.hasOwnProperty.call(document, "plannedTotals")) {
    packed.pt = macroTuple(document.plannedTotals);
    hasPackedField = true;
  }
  if (Object.prototype.hasOwnProperty.call(document, "physicalMeals")) {
    packed.pm = (Array.isArray(document.physicalMeals) ? document.physicalMeals : []).map(packPhysicalMeal);
    hasPackedField = true;
  }
  if (Object.prototype.hasOwnProperty.call(document, "targetMeals")) {
    packed.tm = (Array.isArray(document.targetMeals) ? document.targetMeals : []).map(packTargetMeal);
    hasPackedField = true;
  }
  if (hasPackedField) packed.favoriteStorageVersion = 2;
  return packed;
}

export function expandFavoriteStorageDocument(document = {}) {
  if (Number(document?.favoriteStorageVersion) !== 2) return document;
  const expanded = {
    ...document,
    dailyTarget: Array.isArray(document.dt) ? tupleMacros(document.dt) : document.dailyTarget || tupleMacros(),
    plannedTotals: Array.isArray(document.pt) ? tupleMacros(document.pt) : document.plannedTotals || tupleMacros(),
    physicalMeals: Array.isArray(document.pm)
      ? document.pm.map(unpackPhysicalMeal)
      : document.physicalMeals || [],
    targetMeals: Array.isArray(document.tm)
      ? document.tm.map(unpackTargetMeal)
      : document.targetMeals || [],
  };
  delete expanded.dt;
  delete expanded.pt;
  delete expanded.pm;
  delete expanded.tm;
  return expanded;
}

export default class ModelMongoDBClientDayFavorites {
  _col() {
    if (!CnxMongoDB.connection) throw new Error("No hay conexion a la base de datos");
    return CnxMongoDB.db.collection("client_day_favorites");
  }

  async listByUser(userId) {
    const documents = await this._col().find({
      ownerId: { $in: idValues(userId) },
      deletedAt: null,
    }).sort({ updatedAt: -1 }).toArray();
    return documents.map(expandFavoriteStorageDocument);
  }

  async countByUser(userId) {
    return await this._col().countDocuments({
      ownerId: { $in: idValues(userId) },
      deletedAt: null,
    });
  }

  async getByIdForUser(id, userId) {
    const _id = ObjectId.isValid(cleanId(id)) ? new ObjectId(cleanId(id)) : null;
    if (!_id) return null;
    const document = await this._col().findOne({
      _id,
      ownerId: { $in: idValues(userId) },
      deletedAt: null,
    });
    return document ? expandFavoriteStorageDocument(document) : null;
  }

  async create(doc = {}) {
    const now = new Date();
    const { dailyTarget, plannedTotals, physicalMeals, targetMeals, ...rest } = doc;
    const record = {
      ...rest,
      ...packFavoriteStorageFields({ dailyTarget, plannedTotals, physicalMeals, targetMeals }),
      ownerId: mongoId(doc.ownerId),
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const result = await this._col().insertOne(record);
    return expandFavoriteStorageDocument({ ...record, _id: result.insertedId });
  }

  async updateByUser(id, userId, patch = {}) {
    const _id = ObjectId.isValid(cleanId(id)) ? new ObjectId(cleanId(id)) : null;
    if (!_id) return null;
    const storagePatch = { ...patch };
    const packed = packFavoriteStorageFields(patch);
    ["dailyTarget", "plannedTotals", "physicalMeals", "targetMeals"].forEach((key) => {
      delete storagePatch[key];
    });
    const unset = {};
    if (Object.prototype.hasOwnProperty.call(patch, "dailyTarget")) unset.dailyTarget = "";
    if (Object.prototype.hasOwnProperty.call(patch, "plannedTotals")) unset.plannedTotals = "";
    if (Object.prototype.hasOwnProperty.call(patch, "physicalMeals")) unset.physicalMeals = "";
    if (Object.prototype.hasOwnProperty.call(patch, "targetMeals")) unset.targetMeals = "";
    const update = { $set: { ...storagePatch, ...packed, updatedAt: new Date() } };
    if (Object.keys(unset).length) update.$unset = unset;
    const result = await this._col().findOneAndUpdate({
      _id,
      ownerId: { $in: idValues(userId) },
      deletedAt: null,
    }, update, { returnDocument: "after" });
    const document = result && Object.prototype.hasOwnProperty.call(result, "value")
      ? result.value || null
      : result || null;
    return document ? expandFavoriteStorageDocument(document) : null;
  }

  async softDelete(id, userId) {
    const _id = ObjectId.isValid(cleanId(id)) ? new ObjectId(cleanId(id)) : null;
    if (!_id) return false;
    const result = await this._col().updateOne({
      _id,
      ownerId: { $in: idValues(userId) },
      deletedAt: null,
    }, { $set: { deletedAt: new Date(), updatedAt: new Date() } });
    return result.modifiedCount > 0;
  }

  async ensureIndexes() {
    const col = this._col();
    await col.createIndex(
      { ownerId: 1, deletedAt: 1, updatedAt: -1 },
      { name: "client_day_favorites_owner_updated" }
    );
    await col.createIndex(
      { deletedAt: 1 },
      {
        expireAfterSeconds: SOFT_DELETED_FAVORITE_RETENTION_DAYS * 24 * 60 * 60,
        name: "client_day_favorites_soft_delete_ttl",
      }
    );
  }
}
