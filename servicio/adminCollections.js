import { ObjectId } from "mongodb";
import CnxMongoDB from "../model/DBMongo.js";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 25;
const MAX_SEARCH_LENGTH = 120;
const MAX_SEARCH_FIELDS = 40;
const SAMPLE_LIMIT = 50;
const FIELD_PATTERN = /^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*$/;
const COLLECTION_NAME_PATTERN = /^[A-Za-z0-9_-]+$/;
const DEFAULT_SEARCH_FIELDS = [
  "Alimentos",
  "Nombre",
  "nombre",
  "email",
  "Categoria",
  "categoria",
  "Compo",
  "Fuente",
  "ImagenUrl",
  "imageUrl",
  "imagen.url",
  "urlGenerica",
];

function getDbOrThrow() {
  const db = CnxMongoDB.db;
  if (!CnxMongoDB.connection || !db) {
    const error = new Error("DATABASE_NOT_AVAILABLE");
    error.code = "DATABASE_NOT_AVAILABLE";
    throw error;
  }
  return db;
}

function toSafePositiveInteger(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.min(max, Math.max(1, Math.floor(number)));
}

function escapeRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeSearchTerm(value = "") {
  return String(value || "").trim().slice(0, MAX_SEARCH_LENGTH);
}

function isValidObjectId(value = "") {
  return ObjectId.isValid(String(value)) && String(new ObjectId(String(value))) === String(value);
}

function normalizeField(value = "") {
  const field = String(value || "").trim();
  if (!field) return "";
  if (!FIELD_PATTERN.test(field)) {
    const error = new Error("INVALID_FIELD");
    error.code = "INVALID_FIELD";
    throw error;
  }
  return field;
}

function addField(fields, field) {
  if (!field || field.includes("$")) return;
  if (FIELD_PATTERN.test(field)) fields.add(field);
}

function collectFieldsFromValue(value, prefix, fields, stringFields, depth = 0) {
  if (!prefix || depth > 4) return;
  addField(fields, prefix);

  if (typeof value === "string") {
    addField(stringFields, prefix);
    return;
  }

  if (!value || typeof value !== "object") return;
  if (value instanceof Date || value instanceof ObjectId) return;

  if (Array.isArray(value)) {
    for (const item of value.slice(0, 3)) {
      collectFieldsFromValue(item, prefix, fields, stringFields, depth + 1);
    }
    return;
  }

  for (const [key, childValue] of Object.entries(value)) {
    if (!key || key.startsWith("$")) continue;
    const childPath = `${prefix}.${key}`;
    collectFieldsFromValue(childValue, childPath, fields, stringFields, depth + 1);
  }
}

function collectSampleFields(documents = []) {
  const fields = new Set();
  const stringFields = new Set();

  for (const document of documents) {
    if (!document || typeof document !== "object") continue;
    for (const [key, value] of Object.entries(document)) {
      if (!key || key.startsWith("$")) continue;
      collectFieldsFromValue(value, key, fields, stringFields);
    }
  }

  return {
    sampleFields: [...fields].sort((a, b) => a.localeCompare(b, "es")).slice(0, 160),
    stringFields: [...new Set([...DEFAULT_SEARCH_FIELDS, ...stringFields])]
      .filter((field) => FIELD_PATTERN.test(field))
      .slice(0, MAX_SEARCH_FIELDS),
  };
}

function normalizeIndex(index = {}) {
  return {
    name: index.name,
    key: index.key,
    unique: index.unique === true,
    sparse: index.sparse === true,
    expireAfterSeconds: index.expireAfterSeconds,
  };
}

class ServicioAdminCollections {
  async listarColecciones() {
    const ServicioDatabaseStats = (await import("./databaseStats.js")).default;
    return new ServicioDatabaseStats().obtenerEstadisticas();
  }

  async assertCollection(db, collectionName) {
    const name = String(collectionName || "").trim();
    if (!COLLECTION_NAME_PATTERN.test(name)) {
      const error = new Error("INVALID_COLLECTION_NAME");
      error.code = "INVALID_COLLECTION_NAME";
      throw error;
    }

    const found = await db.listCollections({ name }, { nameOnly: true }).toArray();
    if (!found.length) {
      const error = new Error("COLLECTION_NOT_FOUND");
      error.code = "COLLECTION_NOT_FOUND";
      throw error;
    }

    return name;
  }

  async obtenerDetalle(collectionName) {
    const db = getDbOrThrow();
    const name = await this.assertCollection(db, collectionName);
    const collection = db.collection(name);

    const [statsResult, indexesResult, samples] = await Promise.all([
      db.command({ collStats: name, scale: 1 }).catch(() => null),
      collection.listIndexes().toArray().catch(() => []),
      collection.find({}).sort({ _id: -1 }).limit(SAMPLE_LIMIT).toArray(),
    ]);

    const { sampleFields, stringFields } = collectSampleFields(samples);
    const sampleDocument = samples[0] || null;
    const documents = toSafePositiveInteger(statsResult?.count, await collection.estimatedDocumentCount(), Number.MAX_SAFE_INTEGER);

    return {
      name,
      documents,
      dataSize: Number(statsResult?.size) || 0,
      storageSize: Number(statsResult?.storageSize) || 0,
      indexSize: Number(statsResult?.totalIndexSize) || 0,
      totalSize: (Number(statsResult?.storageSize) || 0) + (Number(statsResult?.totalIndexSize) || 0),
      indexesCount: indexesResult.length || Number(statsResult?.nindexes) || 0,
      avgObjSize: Number(statsResult?.avgObjSize) || 0,
      status: statsResult ? "ok" : "partial",
      indexes: indexesResult.map(normalizeIndex),
      sampleFields,
      searchFields: stringFields,
      sampleDocument,
    };
  }

  buildReadQuery(params = {}, searchFields = []) {
    const queryParts = [];
    const fieldExists = normalizeField(params.fieldExists);
    const fieldMissing = normalizeField(params.fieldMissing);
    const q = normalizeSearchTerm(params.q);
    const field = normalizeField(params.field);

    if (fieldExists) queryParts.push({ [fieldExists]: { $exists: true } });
    if (fieldMissing) queryParts.push({ [fieldMissing]: { $exists: false } });

    if (q) {
      const regex = new RegExp(escapeRegex(q), "i");
      if (field) {
        if (field === "_id" && isValidObjectId(q)) {
          queryParts.push({ _id: new ObjectId(q) });
        } else {
          queryParts.push({ [field]: regex });
        }
      } else {
        const or = searchFields.map((searchField) => ({ [searchField]: regex }));
        if (isValidObjectId(q)) or.unshift({ _id: new ObjectId(q) });
        if (or.length) queryParts.push({ $or: or });
      }
    }

    if (!queryParts.length) return {};
    if (queryParts.length === 1) return queryParts[0];
    return { $and: queryParts };
  }

  async listarDocumentos(collectionName, params = {}) {
    const db = getDbOrThrow();
    const name = await this.assertCollection(db, collectionName);
    const collection = db.collection(name);
    const page = toSafePositiveInteger(params.page, 1);
    const limit = toSafePositiveInteger(params.limit, DEFAULT_LIMIT, MAX_LIMIT);
    const samples = await collection.find({}).sort({ _id: -1 }).limit(SAMPLE_LIMIT).toArray();
    const { sampleFields, stringFields } = collectSampleFields(samples);
    const query = this.buildReadQuery(params, stringFields);
    const skip = (page - 1) * limit;

    const [total, documents] = await Promise.all([
      collection.countDocuments(query, { maxTimeMS: 5000 }),
      collection.find(query).sort({ _id: -1 }).skip(skip).limit(limit).maxTimeMS(5000).toArray(),
    ]);

    return {
      collection: name,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      sampleFields,
      searchFields: stringFields,
      documents,
    };
  }

  async buscarDocumentos(collectionName, params = {}) {
    return this.listarDocumentos(collectionName, params);
  }

  async obtenerDocumento(collectionName, documentId) {
    const db = getDbOrThrow();
    const name = await this.assertCollection(db, collectionName);
    const id = String(documentId || "").trim();
    if (!isValidObjectId(id)) {
      const error = new Error("INVALID_DOCUMENT_ID");
      error.code = "INVALID_DOCUMENT_ID";
      throw error;
    }

    const document = await db.collection(name).findOne({ _id: new ObjectId(id) });
    if (!document) {
      const error = new Error("DOCUMENT_NOT_FOUND");
      error.code = "DOCUMENT_NOT_FOUND";
      throw error;
    }

    return { collection: name, document };
  }
}

export default ServicioAdminCollections;
