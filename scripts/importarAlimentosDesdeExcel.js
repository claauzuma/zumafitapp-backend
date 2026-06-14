import dotenv from "dotenv";
import { MongoClient } from "mongodb";
import os from "os";
import path from "path";
import xlsx from "xlsx";

import { ALIMENTOS_COLLECTION } from "../model/DAO/alimentosMongoDB.js";

dotenv.config();

const DEFAULT_FILE = path.join(os.homedir(), "Downloads", "zumafit_base_alimentos_imagenes_keys_fallback.xlsx");
const SHEET_NAME = "Alimentos";
const TRUE_VALUES = new Set(["si", "sí", "true", "1", "x", "yes", "y"]);
const FALSE_VALUES = new Set(["no", "false", "0", "", "n"]);
const NUMBER_FIELDS = [
  "alimentoId",
  "ordenOriginal",
  "cantidadUnidad",
  "kcalUnidad",
  "proteinaUnidad",
  "carbohidratosUnidad",
  "grasasUnidad",
  "fibraUnidad",
  "kcal100",
  "proteina100",
  "carbohidratos100",
  "grasas100",
  "fibra100",
  "porcionMin",
  "porcionMax",
  "porcionSugerida",
  "multiplo",
  "kcalPorcionSugerida",
  "proteinaPorcionSugerida",
  "carbohidratosPorcionSugerida",
  "grasasPorcionSugerida",
  "fibraPorcionSugerida",
];
const BOOLEAN_FIELDS = [
  "aptoDesayuno",
  "aptoAlmuerzo",
  "aptoMerienda",
  "aptoCena",
  "aptoPreEntreno",
  "aptoPostEntreno",
  "esProteinaPrincipal",
  "esCarboPrincipal",
  "esGrasaPrincipal",
  "esVegetalLibre",
  "requiereCoccion",
  "aptoVegetariano",
  "aptoVegano",
  "aptoSinGluten",
  "aptoSinLactosa",
  "activo",
  "requiereRevision",
  "duplicadoNombreUnidad",
];

function getValue(row = {}, keys = []) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== "") return row[key];
  }
  return "";
}

function toNumber(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  const text = String(value).trim().replace(/\s+/g, "");
  if (!text) return fallback;
  const hasComma = text.includes(",");
  const hasDot = text.includes(".");
  const normalized = hasComma && hasDot
    ? text.lastIndexOf(",") > text.lastIndexOf(".")
      ? text.replace(/\./g, "").replace(",", ".")
      : text.replace(/,/g, "")
    : text.replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cleanText(value = "") {
  return String(value || "").trim();
}

function normalizeText(value = "") {
  return cleanText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function imageKey(value = "") {
  return normalizeText(value).replace(/[^a-z0-9]/g, "");
}

function toBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === null || value === undefined) return fallback;
  const normalized = normalizeText(value);
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return fallback;
}

function toArray(value) {
  if (Array.isArray(value)) return value.map(cleanText).filter(Boolean);
  return String(value || "")
    .split(/[;,]/)
    .map(cleanText)
    .filter(Boolean);
}

function imageObjectFromRow(row = {}) {
  const exactaKey = cleanText(getValue(row, ["imagenExactaKey"]));
  const genericaKey = cleanText(getValue(row, ["imagenGenericaKey"]));
  const urlExacta = cleanText(getValue(row, ["imagenUrlExacta"]));
  const urlGenerica = cleanText(getValue(row, ["imagenUrlGenerica"]));
  const url = cleanText(getValue(row, ["imagenUrl"])) || urlExacta || urlGenerica;

  return {
    exactaKey,
    genericaKey,
    urlExacta,
    urlGenerica,
    url,
    alt: cleanText(getValue(row, ["imagenAlt", "nombre"])),
    estado: cleanText(getValue(row, ["imagenEstado"])),
    fuente: cleanText(getValue(row, ["imagenFuente"])),
  };
}

function buildDocument(row = {}) {
  const nombre = cleanText(getValue(row, ["nombre", "Alimentos", "alimentos", "name"]));
  if (!nombre) return null;

  const categoria = cleanText(getValue(row, ["categoria", "categoriaZumaFit", "Categoria", "Fuente", "grupoOriginal"]));
  const subcategoria = cleanText(getValue(row, ["subcategoria", "subcategoriaZumaFit"]));
  const unidadBase = cleanText(getValue(row, ["unidadBase", "Unidad", "unidad"])) || "g";
  const cantidadUnidad = toNumber(getValue(row, ["cantidadUnidad"]), 1) || 1;
  const kcalUnidad = toNumber(getValue(row, ["kcalUnidad", "calorias", "Calorias", "kcal"]), 0) || 0;
  const proteinaUnidad = toNumber(getValue(row, ["proteinaUnidad", "proteinas", "Proteinas", "proteina", "protein"]), 0) || 0;
  const carbohidratosUnidad = toNumber(getValue(row, ["carbohidratosUnidad", "carbohidratos", "Carbohidratos", "carbs"]), 0) || 0;
  const grasasUnidad = toNumber(getValue(row, ["grasasUnidad", "grasas", "Grasas", "fat"]), 0) || 0;
  const fibraUnidad = toNumber(getValue(row, ["fibraUnidad"]), 0) || 0;
  const kcal100 = toNumber(getValue(row, ["kcal100", "kcal_100g_ml"]), null);
  const proteina100 = toNumber(getValue(row, ["proteina100", "proteina_100g_ml"]), null);
  const carbohidratos100 = toNumber(getValue(row, ["carbohidratos100", "carbohidratos_100g_ml"]), null);
  const grasas100 = toNumber(getValue(row, ["grasas100", "grasas_100g_ml"]), null);
  const fibra100 = toNumber(getValue(row, ["fibra100", "fibra_100g_ml"]), null);
  const imagen = imageObjectFromRow(row);
  const nombreKey = normalizeText(nombre);

  const doc = {
    alimentoId: toNumber(getValue(row, ["alimentoId"]), null),
    codigoOriginal: cleanText(getValue(row, ["codigoOriginal"])),
    macroOriginal: cleanText(getValue(row, ["macroOriginal"])),
    grupoOriginal: cleanText(getValue(row, ["grupoOriginal"])),
    ordenOriginal: toNumber(getValue(row, ["ordenOriginal"]), null),

    nombre,
    name: nombre,
    Alimentos: nombre,
    nombreKey,
    categoria,
    Categoria: categoria,
    Fuente: categoria,
    fuente: categoria,
    subcategoria,
    categoriaZumaFit: cleanText(getValue(row, ["categoriaZumaFit"])) || categoria,
    subcategoriaZumaFit: cleanText(getValue(row, ["subcategoriaZumaFit"])) || subcategoria,
    unidadBase,
    unidad: unidadBase,
    Unidad: unidadBase,
    cantidadUnidad,

    kcalUnidad,
    proteinaUnidad,
    carbohidratosUnidad,
    grasasUnidad,
    fibraUnidad,
    kcal100,
    proteina100,
    carbohidratos100,
    grasas100,
    fibra100,

    kcal: kcalUnidad,
    calorias: kcalUnidad,
    Calorias: kcalUnidad,
    proteina: proteinaUnidad,
    proteinas: proteinaUnidad,
    Proteinas: proteinaUnidad,
    carbohidratos: carbohidratosUnidad,
    Carbohidratos: carbohidratosUnidad,
    grasas: grasasUnidad,
    Grasas: grasasUnidad,
    fibra: fibraUnidad,
    macroBasis: "perUnit",

    porcionMin: toNumber(getValue(row, ["porcionMin"]), null),
    porcionMax: toNumber(getValue(row, ["porcionMax"]), null),
    porcionSugerida: toNumber(getValue(row, ["porcionSugerida"]), null),
    multiplo: toNumber(getValue(row, ["multiplo"]), null),
    kcalPorcionSugerida: toNumber(getValue(row, ["kcalPorcionSugerida"]), null),
    proteinaPorcionSugerida: toNumber(getValue(row, ["proteinaPorcionSugerida"]), null),
    carbohidratosPorcionSugerida: toNumber(getValue(row, ["carbohidratosPorcionSugerida"]), null),
    grasasPorcionSugerida: toNumber(getValue(row, ["grasasPorcionSugerida"]), null),
    fibraPorcionSugerida: toNumber(getValue(row, ["fibraPorcionSugerida"]), null),

    prioridad: cleanText(getValue(row, ["prioridad"])),
    aptoDesayuno: toBoolean(getValue(row, ["aptoDesayuno"])),
    aptoAlmuerzo: toBoolean(getValue(row, ["aptoAlmuerzo"])),
    aptoMerienda: toBoolean(getValue(row, ["aptoMerienda"])),
    aptoCena: toBoolean(getValue(row, ["aptoCena"])),
    aptoPreEntreno: toBoolean(getValue(row, ["aptoPreEntreno"])),
    aptoPostEntreno: toBoolean(getValue(row, ["aptoPostEntreno"])),
    esProteinaPrincipal: toBoolean(getValue(row, ["esProteinaPrincipal"])),
    esCarboPrincipal: toBoolean(getValue(row, ["esCarboPrincipal"])),
    esGrasaPrincipal: toBoolean(getValue(row, ["esGrasaPrincipal"])),
    esVegetalLibre: toBoolean(getValue(row, ["esVegetalLibre"])),
    estado: cleanText(getValue(row, ["estado"])),
    requiereCoccion: toBoolean(getValue(row, ["requiereCoccion"])),

    saciedad: cleanText(getValue(row, ["saciedad"])),
    digestibilidad: cleanText(getValue(row, ["digestibilidad"])),
    costoEstimado: cleanText(getValue(row, ["costoEstimado"])),
    tags: toArray(getValue(row, ["tags"])),
    alergenos: toArray(getValue(row, ["alergenos"])),
    aptoVegetariano: toBoolean(getValue(row, ["aptoVegetariano"])),
    aptoVegano: toBoolean(getValue(row, ["aptoVegano"])),
    aptoSinGluten: toBoolean(getValue(row, ["aptoSinGluten"])),
    aptoSinLactosa: toBoolean(getValue(row, ["aptoSinLactosa"])),

    activo: toBoolean(getValue(row, ["activo"]), true),
    observaciones: cleanText(getValue(row, ["observaciones"])),
    requiereRevision: toBoolean(getValue(row, ["requiereRevision"])),
    motivoRevision: cleanText(getValue(row, ["motivoRevision"])),
    fibraFuente: cleanText(getValue(row, ["fibraFuente"])),
    fibraConfianza: cleanText(getValue(row, ["fibraConfianza"])),
    claveNormalizada: cleanText(getValue(row, ["claveNormalizada"])) || `${nombreKey}|${normalizeText(unidadBase)}`,
    duplicadoNombreUnidad: toBoolean(getValue(row, ["duplicadoNombreUnidad"])),

    imagen,
    imagenUrl: imagen.url,
    imagenUrlExacta: imagen.urlExacta,
    imagenUrlGenerica: imagen.urlGenerica,
    imagenAlt: imagen.alt,
    imagenEstado: imagen.estado,
    imagenFuente: imagen.fuente,
    imagenExactaKey: imagen.exactaKey || imageKey(nombre),
    imagenGenericaKey: imagen.genericaKey,
    imagenFileName: cleanText(getValue(row, ["imagenFileName"])),
    imagenLocalPath: cleanText(getValue(row, ["imagenLocalPath"])),
    imagenDirectorio: cleanText(getValue(row, ["imagenDirectorio"])),
    imagenExactaFileName: cleanText(getValue(row, ["imagenExactaFileName"])),
    imagenGenericaFileName: cleanText(getValue(row, ["imagenGenericaFileName"])),
    imagenUsoRecomendado: cleanText(getValue(row, ["imagenUsoRecomendado"])),
    imagenFallbackCategoriaUrl: cleanText(getValue(row, ["imagenFallbackCategoriaUrl"])),
    imagenRegla: cleanText(getValue(row, ["imagenRegla"])),
  };

  for (const field of NUMBER_FIELDS) {
    if (doc[field] === null || doc[field] === undefined) delete doc[field];
  }
  for (const field of BOOLEAN_FIELDS) {
    if (doc[field] === null || doc[field] === undefined) doc[field] = false;
  }

  return doc;
}

function buildFilter(doc = {}) {
  const alternatives = [];
  if (Number.isFinite(doc.alimentoId)) alternatives.push({ alimentoId: doc.alimentoId });
  if (doc.nombreKey && doc.unidadBase) alternatives.push({ nombreKey: doc.nombreKey, unidadBase: doc.unidadBase });
  if (doc.nombre && doc.unidadBase) {
    alternatives.push({ nombre: doc.nombre, unidadBase: doc.unidadBase });
    alternatives.push({ Alimentos: doc.nombre, Unidad: doc.unidadBase });
  }
  if (!alternatives.length) return null;
  return alternatives.length === 1 ? alternatives[0] : { $or: alternatives };
}

async function main() {
  const filePath = process.argv[2] || process.env.ALIMENTOS_EXCEL_PATH || DEFAULT_FILE;
  const mongoUri = process.env.MONGO_URI || process.env.STRCNX;
  const dbName = process.env.MONGO_DB || process.env.BASE || "test";

  if (!mongoUri) throw new Error("Falta MONGO_URI o STRCNX en el entorno.");

  console.log(`[alimentos] Leyendo Excel: ${filePath}`);
  const workbook = xlsx.readFile(filePath);
  const sheet = workbook.Sheets[SHEET_NAME];
  if (!sheet) throw new Error(`No existe la hoja "${SHEET_NAME}". Hojas disponibles: ${workbook.SheetNames.join(", ")}`);

  const rows = xlsx.utils.sheet_to_json(sheet, { defval: "" });
  const docs = [];
  const errors = [];

  rows.forEach((row, index) => {
    try {
      const doc = buildDocument(row);
      if (doc) docs.push(doc);
    } catch (error) {
      errors.push({ row: index + 2, message: error.message });
    }
  });

  const operations = docs
    .map((doc) => {
      const filter = buildFilter(doc);
      if (!filter) {
        errors.push({ row: doc.nombre || "sin nombre", message: "No se pudo construir filtro de upsert." });
        return null;
      }
      return {
        updateOne: {
          filter,
          update: {
            $set: doc,
            $setOnInsert: { createdAt: new Date() },
            $currentDate: { updatedAt: true },
          },
          upsert: true,
          collation: { locale: "es", strength: 1 },
        },
      };
    })
    .filter(Boolean);

  console.log(`[alimentos] Filas leidas: ${rows.length}`);
  console.log(`[alimentos] Filas validas: ${docs.length}`);
  console.log(`[alimentos] Operaciones: ${operations.length}`);

  const client = new MongoClient(mongoUri);
  try {
    await client.connect();
    const collection = client.db(dbName).collection(ALIMENTOS_COLLECTION);
    await Promise.all([
      collection.createIndex({ alimentoId: 1 }, { sparse: true, background: true }),
      collection.createIndex({ nombreKey: 1, unidadBase: 1 }, { sparse: true, background: true }),
    ]);

    if (!operations.length) {
      console.log("[alimentos] No hay operaciones para ejecutar.");
      return;
    }

    const result = await collection.bulkWrite(operations, { ordered: false });
    console.log("[alimentos] Importacion finalizada.");
    console.log(`[alimentos] Insertados: ${result.upsertedCount || 0}`);
    console.log(`[alimentos] Actualizados: ${result.modifiedCount || 0}`);
    console.log(`[alimentos] Matcheados: ${result.matchedCount || 0}`);
    console.log(`[alimentos] Errores: ${errors.length}`);
    if (errors.length) console.table(errors.slice(0, 20));
  } catch (error) {
    console.error("[alimentos] Error durante la importacion:", error);
    if (error?.writeErrors?.length) {
      console.error(`[alimentos] Errores de escritura: ${error.writeErrors.length}`);
      console.error(error.writeErrors.slice(0, 5).map((entry) => entry.errmsg || entry.message));
    }
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error("[alimentos] Error fatal:", error);
  process.exitCode = 1;
});
