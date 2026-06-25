import crypto from "crypto";
import { ObjectId } from "mongodb";
import xlsx from "xlsx";

import ModelMongoDBAlimentos from "../model/DAO/alimentosMongoDB.js";
import ModelMongoDBComidasGuardadas from "../model/DAO/comidasGuardadasMongoDB.js";

const SHEET_NAME = "Hoja1";
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_MEALS = 30;
const MEALS_PER_ROW_BLOCK = 10;
const ROWS_PER_BLOCK = 10;
const MAX_FOODS_PER_MEAL = 8;
const PREVIEW_TTL_MS = 30 * 60 * 1000;
const previewCache = new Map();

const TYPE_ALIASES = new Map([
  ["desayuno", "desayuno"],
  ["almuerzo", "almuerzo"],
  ["merienda", "merienda"],
  ["cena", "cena"],
  ["snack", "snack"],
  ["colacion", "colacion"],
  ["pre entreno", "pre_entreno"],
  ["preentreno", "pre_entreno"],
  ["pre_entreno", "pre_entreno"],
  ["post entreno", "post_entreno"],
  ["postentreno", "post_entreno"],
  ["post_entreno", "post_entreno"],
  ["otra", "otra"],
  ["otro", "otra"],
]);

function cleanString(value = "", max = 300) {
  if (value === null || value === undefined) return "";
  return String(value).slice(0, max).trim();
}

function normalizeText(value = "") {
  return cleanString(value, 300)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeKey(value = "") {
  return normalizeText(value).replace(/[^a-z0-9]+/g, "");
}

function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  const raw = String(value).trim();
  const normalized = raw.includes(",") && raw.includes(".")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw.replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : fallback;
}

function round(value, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
}

function macro(value) {
  return round(Math.max(0, toNumber(value, 0)), 2);
}

function normalizeUnit(unit = "") {
  const raw = cleanString(unit || "Grs", 40);
  const lower = raw.toLowerCase().replace(".", "");
  if (["g", "gr", "grs", "gramo", "gramos"].includes(lower)) return "Grs";
  if (["unidad", "unidades", "u"].includes(lower)) return "Unidad";
  return raw || "Unidad";
}

function inferMacroBasis(unit = "", raw = {}) {
  const explicit = normalizeText(raw.macroBasis || raw.baseMacro || raw.Base || raw.base || raw.Por || raw.por);
  if (explicit.includes("100")) return "per100";
  if (explicit.includes("unidad") || explicit.includes("porcion")) return "perUnit";
  const normalizedUnit = normalizeText(unit);
  if (["grs", "gr", "g", "gramo", "gramos", "ml"].includes(normalizedUnit)) {
    const kcal = toNumber(raw.Calorias ?? raw.calorias ?? raw.kcal ?? raw.kcalUnidad, 0);
    const protein = toNumber(raw.Proteinas ?? raw.proteinas ?? raw.proteina ?? raw.proteinaUnidad, 0);
    const carbs = toNumber(raw.Carbohidratos ?? raw.carbohidratos ?? raw.carbs ?? raw.carbohidratosUnidad, 0);
    const fat = toNumber(raw.Grasas ?? raw.grasas ?? raw.fat ?? raw.grasasUnidad, 0);
    return kcal > 0 && kcal <= 15 && protein <= 5 && carbs <= 5 && fat <= 5 ? "perUnit" : "per100";
  }
  return "perUnit";
}

function readCell(sheet, rowIndex, colIndex) {
  const address = xlsx.utils.encode_cell({ r: rowIndex, c: colIndex });
  const cell = sheet[address];
  return cell ? cell.v ?? cell.w ?? "" : "";
}

function normalizeMealType(value = "") {
  const normalized = normalizeText(value);
  return TYPE_ALIASES.get(normalized) || "";
}

function foodNameFields(food = {}) {
  return [
    food.Alimentos,
    food.Nombre,
    food.nombre,
    food.name,
    food.Alimentosss,
    food.alimentoKey,
    food.nombreKey,
  ].map((value) => cleanString(value, 180)).filter(Boolean);
}

function foodDisplayName(food = {}) {
  return foodNameFields(food)[0] || "Alimento sin nombre";
}

function imageFromFood(food = {}) {
  const image = food.imagen && typeof food.imagen === "object" ? food.imagen : {};
  return (
    image.url ||
    image.urlExacta ||
    image.urlGenerica ||
    food.ImagenUrl ||
    food.imagenUrl ||
    food.imageUrl ||
    food.urlGenerica ||
    ""
  );
}

function normalizeFood(food = {}) {
  const unidad = normalizeUnit(food.Unidad || food.unidad || food.unit || food.unidadBase);
  return {
    _id: food._id,
    alimentoId: food.alimentoId || food.id || food._id,
    nombre: foodDisplayName(food),
    unidad,
    kcal: macro(food.Calorias ?? food.calorias ?? food.kcal ?? food.calories ?? food.kcalUnidad ?? food.kcal100),
    proteinas: macro(food.Proteinas ?? food.proteinas ?? food.proteina ?? food.protein ?? food.proteinaUnidad ?? food.proteina100),
    carbohidratos: macro(food.Carbohidratos ?? food.carbohidratos ?? food.carbs ?? food.hidratos ?? food.carbohidratosUnidad ?? food.carbohidratos100),
    grasas: macro(food.Grasas ?? food.grasas ?? food.fat ?? food.fats ?? food.grasasUnidad ?? food.grasas100),
    fibra: macro(food.Fibra ?? food.fibra ?? food.fibraUnidad ?? food.fibra100),
    categoria: cleanString(food.Categoria || food.categoria || food.Fuente || food.fuente || food.Grupo || food.grupo, 120),
    imagenUrl: imageFromFood(food),
    macroBasis: inferMacroBasis(unidad, food),
    raw: food,
  };
}

function calculateFoodMacros(food = {}, cantidad = 0) {
  const unit = normalizeText(food.unidad);
  const shouldScaleBy100 = food.macroBasis === "per100" && ["grs", "gr", "g", "gramo", "gramos", "ml"].includes(unit);
  const factor = shouldScaleBy100 ? cantidad / 100 : cantidad;
  return {
    kcal: round(food.kcal * factor, 2),
    proteinas: round(food.proteinas * factor, 2),
    carbohidratos: round(food.carbohidratos * factor, 2),
    grasas: round(food.grasas * factor, 2),
    fibra: round(food.fibra * factor, 2),
  };
}

function totalsFromItems(items = []) {
  return items.reduce(
    (acc, item) => ({
      kcal: round(acc.kcal + macro(item.kcal), 2),
      proteinas: round(acc.proteinas + macro(item.proteinas), 2),
      proteina: round(acc.proteinas + macro(item.proteinas), 2),
      carbohidratos: round(acc.carbohidratos + macro(item.carbohidratos), 2),
      carbs: round(acc.carbohidratos + macro(item.carbohidratos), 2),
      grasas: round(acc.grasas + macro(item.grasas), 2),
      fibra: round(acc.fibra + macro(item.fibra), 2),
    }),
    { kcal: 0, proteinas: 0, proteina: 0, carbohidratos: 0, carbs: 0, grasas: 0, fibra: 0 }
  );
}

function classifyMeal(totals = {}, tipoComida = "") {
  const kcal = macro(totals.kcal);
  const proteinas = macro(totals.proteinas);
  const carbohidratos = macro(totals.carbohidratos);
  const grasas = macro(totals.grasas);
  const rangoCalorias = kcal < 250 ? "liviana" : kcal < 450 ? "baja_media" : kcal < 650 ? "media" : kcal < 850 ? "alta" : "muy_alta";
  const nivelProteina = proteinas < 15 ? "baja" : proteinas < 30 ? "media" : proteinas < 45 ? "alta" : "muy_alta";
  const nivelCarbohidratos = carbohidratos < 30 ? "bajo" : carbohidratos < 70 ? "medio" : "alto";
  const nivelGrasas = grasas < 10 ? "baja" : grasas < 25 ? "media" : "alta";
  const macroDominante = proteinas >= carbohidratos && proteinas >= grasas
    ? carbohidratos >= 30 ? "proteina_carbohidrato" : "proteina"
    : carbohidratos >= proteinas && carbohidratos >= grasas
      ? proteinas >= 20 ? "proteina_carbohidrato" : "carbohidrato"
      : "grasas";
  const objetivos = new Set();
  if (proteinas >= 25) objetivos.add("recomposicion");
  if (kcal >= 450 && carbohidratos >= 40) objetivos.add("volumen");
  if (["post_entreno", "almuerzo", "cena"].includes(tipoComida) && carbohidratos >= 30) objetivos.add("post_entreno");
  if (kcal <= 450 && proteinas >= 20) objetivos.add("definicion");
  if (!objetivos.size) objetivos.add("mantenimiento");

  return {
    rangoCalorias,
    nivelProteina,
    nivelCarbohidratos,
    nivelGrasas,
    macroDominante,
    objetivos: [...objetivos],
  };
}

function idToString(id) {
  return id?.toString?.() || String(id || "");
}

function normalizedMealName(value = "") {
  return normalizeText(value);
}

function mealItemsForSignature(meal = {}) {
  if (Array.isArray(meal.items)) return meal.items;
  if (Array.isArray(meal.alimentos)) return meal.alimentos;
  return [];
}

function mealContentSignature(meal = {}) {
  const tipoComida = normalizeMealType(meal.tipoComida || meal.type) || cleanString(meal.tipoComida || meal.type, 80);
  const combined = new Map();
  mealItemsForSignature(meal).forEach((item) => {
    const alimentoId = idToString(item.alimentoId || item.alimentoObjectId || item.foodId || item.id || item._id || normalizeKey(item.nombre || item.nombreSnapshot || item.name));
    const unidad = normalizeUnit(item.unidad || item.unit || "Unidad");
    const cantidad = round(toNumber(item.cantidad ?? item.quantity ?? item.amount, 0), 2);
    if (!alimentoId || cantidad <= 0) return;
    const key = `${alimentoId}|${unidad}`;
    const current = combined.get(key) || { alimentoId, cantidad: 0, unidad };
    current.cantidad = round(current.cantidad + cantidad, 2);
    combined.set(key, current);
  });
  const alimentos = [...combined.values()]
    .sort((a, b) => `${a.alimentoId}|${a.cantidad}|${a.unidad}`.localeCompare(`${b.alimentoId}|${b.cantidad}|${b.unidad}`));

  return JSON.stringify({ tipoComida, alimentos });
}

function existingMealNames(doc = {}) {
  return [doc.nombre, doc.nombreOriginalExcel]
    .map(normalizedMealName)
    .filter(Boolean);
}

function splitNumericSuffix(name = "") {
  const base = cleanString(name, 180) || "Comida importada";
  const match = base.match(/^(.*?)(?:\s+(\d+))$/);
  if (!match) return { stem: base, number: 0 };
  const stem = cleanString(match[1], 180) || base;
  return { stem, number: Number(match[2]) || 0 };
}

function getUniqueMealName(baseName = "Comida importada", existingNames = []) {
  const cleanBase = cleanString(baseName, 180) || "Comida importada";
  const used = new Set(existingNames.map(normalizedMealName).filter(Boolean));
  if (!used.has(normalizedMealName(cleanBase))) return cleanBase;

  const { stem, number } = splitNumericSuffix(cleanBase);
  let suffix = Math.max(1, number + 1);
  let candidate = `${stem} ${suffix}`;
  while (used.has(normalizedMealName(candidate))) {
    suffix += 1;
    candidate = `${stem} ${suffix}`;
  }
  return candidate;
}

async function resolveImportedMealName(col, meal = {}, options = {}) {
  const ownerType = options.ownerType || "admin";
  const tipoComida = normalizeMealType(meal.tipoComida || meal.type) || cleanString(meal.tipoComida || meal.type, 80);
  const baseName = cleanString(meal.nombre || meal.name || "Comida importada", 180) || "Comida importada";
  const baseNameKey = normalizedMealName(baseName);
  const signature = mealContentSignature({ ...meal, tipoComida });
  const existingMeals = await col
    .find(
      {
        ownerType,
        tipoComida,
        activo: { $ne: false },
      },
      {
        projection: {
          nombre: 1,
          nombreOriginalExcel: 1,
          tipoComida: 1,
          items: 1,
          alimentos: 1,
        },
      }
    )
    .toArray();

  const identical = existingMeals.find((doc) => {
    return existingMealNames(doc).includes(baseNameKey) && mealContentSignature(doc) === signature;
  });

  if (identical) {
    return {
      action: "skip",
      status: "duplicado_exacto",
      existingId: idToString(identical._id || identical.id),
      nombreFinal: identical.nombre || baseName,
      warnings: ["Ya existe una comida identica. No se importara nuevamente."],
    };
  }

  const usedNames = new Set(existingMeals.map((doc) => normalizedMealName(doc.nombre)).filter(Boolean));
  if (!usedNames.has(baseNameKey)) {
    return {
      action: "create",
      status: "ok",
      nombreFinal: baseName,
      warnings: [],
    };
  }

  const nombreFinal = getUniqueMealName(baseName, [...usedNames]);

  return {
    action: "create",
    status: "renombrada_por_nombre_repetido",
    nombreFinal,
    warnings: [`El nombre ya existe. Se importara como "${nombreFinal}".`],
  };
}

async function decorateMealDuplicateState(col, meal = {}) {
  if (!meal || meal.status === "error") return meal;
  const duplicate = await resolveImportedMealName(col, meal);
  const warnings = [...(meal.warnings || []), ...(duplicate.warnings || [])];
  return {
    ...meal,
    nombreFinal: duplicate.nombreFinal,
    duplicateStatus: duplicate.status,
    existingId: duplicate.existingId || null,
    warnings,
    status: duplicate.status === "duplicado_exacto"
      ? "duplicado_exacto"
      : duplicate.status === "renombrada_por_nombre_repetido"
        ? "warning"
        : meal.status,
  };
}

function cleanupPreviewCache() {
  const now = Date.now();
  for (const [token, entry] of previewCache.entries()) {
    if (!entry?.createdAt || now - entry.createdAt > PREVIEW_TTL_MS) previewCache.delete(token);
  }
}

class ServicioComidasGuardadasExcelImport {
  constructor() {
    this.alimentosModel = new ModelMongoDBAlimentos();
    this.comidasModel = new ModelMongoDBComidasGuardadas();
  }

  validateFile(file) {
    if (!file?.buffer?.length) throw new Error("EXCEL_FILE_REQUIRED");
    if (file.size > MAX_FILE_SIZE) throw new Error("EXCEL_FILE_TOO_LARGE");
    const name = cleanString(file.originalname, 260).toLowerCase();
    if (!name.endsWith(".xlsx") && !name.endsWith(".xls")) throw new Error("EXCEL_FILE_INVALID_TYPE");
  }

  async loadFoodIndex() {
    const foods = (await this.alimentosModel.obtenerAlimentos()).map(normalizeFood);
    const exact = new Map();
    for (const food of foods) {
      for (const name of foodNameFields(food.raw)) {
        const key = normalizeKey(name);
        if (!key) continue;
        const list = exact.get(key) || [];
        list.push(food);
        exact.set(key, list);
      }
    }
    return { foods, exact };
  }

  findFood(nameExcel, foodIndex) {
    const key = normalizeKey(nameExcel);
    const exactMatches = foodIndex.exact.get(key) || [];
    if (exactMatches.length) {
      return {
        status: exactMatches.length > 1 ? "warning" : "ok",
        matches: exactMatches.slice(0, 5),
        selected: exactMatches[0],
        warnings: exactMatches.length > 1 ? [`Multiples coincidencias exactas (${exactMatches.length}). Se usara "${exactMatches[0].nombre}".`] : [],
      };
    }

    const flexible = foodIndex.foods.filter((food) => {
      return foodNameFields(food.raw).some((name) => {
        const candidate = normalizeKey(name);
        return candidate && (candidate.includes(key) || key.includes(candidate));
      });
    });

    if (!flexible.length) {
      return { status: "error", matches: [], selected: null, warnings: [], errors: ["Alimento no encontrado en fooddatabase2."] };
    }

    return {
      status: "warning",
      matches: flexible.slice(0, 5),
      selected: flexible[0],
      warnings: [`Coincidencia flexible. Revisar: se usara "${flexible[0].nombre}".`],
    };
  }

  parseWorkbook(file) {
    this.validateFile(file);
    const workbook = xlsx.read(file.buffer, { type: "buffer" });
    const sheet = workbook.Sheets[SHEET_NAME];
    if (!sheet) throw new Error("HOJA1_REQUIRED");
    return sheet;
  }

  async preview(file, options = {}, actor = {}) {
    cleanupPreviewCache();
    const sheet = this.parseWorkbook(file);
    const foodIndex = await this.loadFoodIndex();
    const comidas = [];

    for (let index = 0; index < MAX_MEALS; index += 1) {
      const verticalBlock = Math.floor(index / MEALS_PER_ROW_BLOCK);
      const horizontalSlot = index % MEALS_PER_ROW_BLOCK;
      const baseRow = verticalBlock * ROWS_PER_BLOCK;
      const leftCol = horizontalSlot * 2;
      const rightCol = leftCol + 1;
      const numero = index + 1;
      const tipoRaw = readCell(sheet, baseRow, rightCol);
      const nombre = cleanString(readCell(sheet, baseRow + 1, leftCol), 180);
      const itemsRaw = [];

      for (let foodRow = 0; foodRow < MAX_FOODS_PER_MEAL; foodRow += 1) {
        const row = baseRow + 2 + foodRow;
        const nombreExcel = cleanString(readCell(sheet, row, leftCol), 180);
        const cantidadRaw = readCell(sheet, row, rightCol);
        if (!nombreExcel && (cantidadRaw === "" || cantidadRaw === null || cantidadRaw === undefined)) continue;
        itemsRaw.push({ nombreExcel, cantidadRaw, row: row + 1 });
      }

      if (!nombre && !itemsRaw.length && !cleanString(tipoRaw)) continue;

      const tipoComida = normalizeMealType(tipoRaw);
      const errors = [];
      const warnings = [];
      if (!nombre) errors.push("Nombre de comida vacio.");
      if (!tipoComida) errors.push(`Tipo de comida invalido o vacio: "${cleanString(tipoRaw) || "-"}".`);
      if (!itemsRaw.length) errors.push("La comida no tiene alimentos.");

      const alimentos = itemsRaw.map((raw) => {
        const cantidad = toNumber(raw.cantidadRaw, 0);
        const itemErrors = [];
        const itemWarnings = [];
        if (!raw.nombreExcel) itemErrors.push(`Fila ${raw.row}: nombre de alimento vacio.`);
        if (cantidad <= 0) itemErrors.push(`Fila ${raw.row}: cantidad invalida.`);

        if (itemErrors.length) {
          errors.push(...itemErrors);
          return {
            nombreExcel: raw.nombreExcel,
            cantidad: raw.cantidadRaw,
            matchStatus: "error",
            errors: itemErrors,
            warnings: itemWarnings,
          };
        }

        const match = this.findFood(raw.nombreExcel, foodIndex);
        if (match.errors?.length) errors.push(...match.errors.map((message) => `${raw.nombreExcel}: ${message}`));
        if (match.warnings?.length) warnings.push(...match.warnings.map((message) => `${raw.nombreExcel}: ${message}`));

        if (!match.selected) {
          return {
            nombreExcel: raw.nombreExcel,
            cantidad,
            matchStatus: "error",
            errors: match.errors || [],
            warnings: match.warnings || [],
          };
        }

        const macros = calculateFoodMacros(match.selected, cantidad);
        return {
          nombreExcel: raw.nombreExcel,
          cantidad,
          matchStatus: match.status,
          alimentoId: String(match.selected.alimentoId || match.selected._id || ""),
          alimentoObjectId: match.selected._id ? String(match.selected._id) : "",
          nombreBase: match.selected.nombre,
          unidad: match.selected.unidad,
          categoria: match.selected.categoria,
          imagenUrl: match.selected.imagenUrl,
          matches: match.matches.map((food) => ({
            alimentoId: String(food.alimentoId || food._id || ""),
            nombre: food.nombre,
            unidad: food.unidad,
          })),
          warnings: match.warnings || [],
          errors: match.errors || [],
          macros,
        };
      });

      const validItems = alimentos.filter((item) => item.matchStatus !== "error" && item.macros);
      const items = validItems.map((item) => ({
        alimentoId: item.alimentoId,
        alimentoObjectId: ObjectId.isValid(item.alimentoObjectId) ? new ObjectId(item.alimentoObjectId) : null,
        nombre: item.nombreBase,
        cantidad: item.cantidad,
        unidad: item.unidad,
        kcal: item.macros.kcal,
        proteinas: item.macros.proteinas,
        proteina: item.macros.proteinas,
        carbohidratos: item.macros.carbohidratos,
        carbs: item.macros.carbohidratos,
        grasas: item.macros.grasas,
        fibra: item.macros.fibra,
        categoria: item.categoria,
        categoriaSnapshot: item.categoria,
        imagenUrl: item.imagenUrl,
        imagenAlt: item.nombreBase,
      }));
      const macrosTotales = totalsFromItems(items);

      comidas.push({
        numero,
        etiqueta: cleanString(readCell(sheet, baseRow, leftCol), 80) || `Comida ${numero}`,
        tipoComida,
        tipoComidaExcel: cleanString(tipoRaw, 80),
        nombre,
        alimentos,
        items,
        macrosTotales,
        totales: macrosTotales,
        clasificacionAuto: classifyMeal(macrosTotales, tipoComida),
        warnings,
        errors,
        status: errors.length ? "error" : warnings.length ? "warning" : "ok",
      });
    }

    const col = this.comidasModel._col();
    const comidasDecoradas = [];
    for (const comida of comidas) {
      comidasDecoradas.push(await decorateMealDuplicateState(col, comida));
    }

    const validas = comidasDecoradas.filter((comida) => comida.status !== "error" && comida.status !== "duplicado_exacto");
    const token = crypto.randomUUID();
    previewCache.set(token, {
      createdAt: Date.now(),
      actorId: actor?.id || actor?._id || null,
      options,
      comidas: comidasDecoradas,
    });

    return {
      importToken: token,
      totalComidasDetectadas: comidasDecoradas.length,
      totalValidas: validas.length,
      totalConAdvertencias: comidasDecoradas.filter((comida) => comida.status === "warning").length,
      totalConErrores: comidasDecoradas.filter((comida) => comida.status === "error").length,
      totalDuplicadosExactos: comidasDecoradas.filter((comida) => comida.status === "duplicado_exacto").length,
      comidas: comidasDecoradas.map(({ items, ...comida }) => comida),
    };
  }

  normalizeOptions(options = {}) {
    const visibilityRaw = cleanString(options.visibilidad)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
    const visibilityAliases = {
      global: "global",
      premium: "premium",
      coaches: "solo_coaches",
      coach: "solo_coaches",
      solo_coaches: "solo_coaches",
      solocoaches: "solo_coaches",
      clientes: "solo_clientes",
      cliente: "solo_clientes",
      solo_clientes: "solo_clientes",
      soloclientes: "solo_clientes",
      clientesasignados: "solo_clientes",
      clientes_asignados: "solo_clientes",
      privada: "privada",
      private: "privada",
    };
    const visibilidad = visibilityAliases[visibilityRaw] || "global";
    const planMinimo = ["free", "pro", "vip"].includes(cleanString(options.planMinimo).toLowerCase())
      ? cleanString(options.planMinimo).toLowerCase()
      : "free";
    const modo = ["crear_nuevas", "actualizar", "duplicar"].includes(cleanString(options.modo))
      ? cleanString(options.modo)
      : "crear_nuevas";
    return {
      visibilidad,
      planMinimo,
      modo,
      importarSoloValidas: options.importarSoloValidas !== false,
    };
  }

  async confirm(importToken, options = {}, actor = {}) {
    cleanupPreviewCache();
    const entry = previewCache.get(cleanString(importToken, 120));
    if (!entry) throw new Error("IMPORT_TOKEN_INVALID");
    if (entry.actorId && actor?.id && String(entry.actorId) !== String(actor.id)) throw new Error("IMPORT_TOKEN_INVALID");

    const normalizedOptions = this.normalizeOptions({ ...entry.options, ...options });
    const comidasConErrores = entry.comidas.filter((comida) => comida.status === "error");
    if (comidasConErrores.length && !normalizedOptions.importarSoloValidas) throw new Error("IMPORT_HAS_ERRORS");

    const comidas = normalizedOptions.importarSoloValidas
      ? entry.comidas.filter((comida) => comida.status !== "error" && comida.status !== "duplicado_exacto")
      : entry.comidas;
    if (!comidas.length) throw new Error("IMPORT_NO_VALID_MEALS");

    const importBatchId = crypto.randomUUID();
    const now = new Date();
    const created = [];
    const skipped = [];
    const col = this.comidasModel._col();

    for (const comida of comidas.slice(0, MAX_MEALS)) {
      if (comida.status === "error") continue;
      const duplicate = await resolveImportedMealName(col, comida);
      if (duplicate.action === "skip") {
        skipped.push({
          numero: comida.numero,
          nombre: comida.nombre,
          existingId: duplicate.existingId,
          reason: "Ya existe una comida identica.",
        });
        continue;
      }

      const doc = {
        nombre: duplicate.nombreFinal || comida.nombre,
        nombreOriginalExcel: comida.nombre,
        descripcion: `Importada desde Excel (${SHEET_NAME})`,
        tipoComida: comida.tipoComida,
        items: comida.items,
        alimentos: comida.items,
        totales: comida.totales,
        macrosTotales: comida.macrosTotales,
        clasificacionAuto: comida.clasificacionAuto,
        tags: [
          "excel_import",
          comida.tipoComida,
          comida.clasificacionAuto.rangoCalorias,
          comida.clasificacionAuto.nivelProteina,
        ].filter(Boolean),
        favorita: false,
        ownerId: actor?.id || actor?._id || null,
        ownerRole: "admin",
        ownerType: "admin",
        creadaPorId: actor?.id || actor?._id || null,
        creadaPorRol: "admin",
        visibilidad: normalizedOptions.visibilidad,
        asignadaA: [],
        gimnasioId: null,
        profesionalId: null,
        origen: "excel_import",
        source: "excel_import",
        importBatchId,
        numeroExcel: comida.numero,
        planMinimo: normalizedOptions.planMinimo,
        activo: true,
        activa: true,
        createdAt: now,
        updatedAt: now,
      };

      const saved = await this.comidasModel.create(doc);
      created.push({ id: String(saved._id), nombre: saved.nombre, updated: false, duplicateStatus: duplicate.status });
    }

    previewCache.delete(importToken);
    return {
      ok: true,
      importBatchId,
      imported: created.length,
      skipped: skipped.length,
      comidas: created,
      omitidas: skipped,
    };
  }
}

export {
  calculateFoodMacros,
  cleanString,
  classifyMeal,
  foodNameFields,
  getUniqueMealName,
  macro,
  mealContentSignature,
  normalizeFood,
  normalizeKey,
  normalizeMealType,
  normalizeText,
  normalizeUnit,
  readCell,
  resolveImportedMealName,
  round,
  toNumber,
  totalsFromItems,
};

export default ServicioComidasGuardadasExcelImport;
