import crypto from "crypto";
import { ObjectId } from "mongodb";
import xlsx from "xlsx";

import ModelMongoDBAlimentos from "../model/DAO/alimentosMongoDB.js";
import ModelMongoDBComidasGuardadas from "../model/DAO/comidasGuardadasMongoDB.js";
import ModelMongoDBMenus from "../model/DAO/menusMongoDB.js";
import {
  calculateFoodMacros,
  cleanString,
  classifyMeal,
  foodNameFields,
  normalizeFood,
  normalizeKey,
  normalizeMealType,
  normalizeText,
  readCell,
  resolveImportedMealName,
  round,
  toNumber,
  totalsFromItems,
} from "./comidasGuardadasExcelImport.js";

const SHEET_NAME = "Menus";
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_MENUS = 10;
const MAX_MEALS_PER_MENU = 5;
const ROWS_PER_MEAL = 10;
const MAX_FOODS_PER_MEAL = 8;
const MAX_SCAN_COLUMNS = 40;
const PREVIEW_TTL_MS = 30 * 60 * 1000;
const previewCache = new Map();

function cleanupPreviewCache() {
  const now = Date.now();
  for (const [token, entry] of previewCache.entries()) {
    if (!entry?.createdAt || now - entry.createdAt > PREVIEW_TTL_MS) previewCache.delete(token);
  }
}

function macro(value) {
  return round(Math.max(0, toNumber(value, 0)), 2);
}

function idToString(id) {
  return id?.toString?.() || String(id || "");
}

function dateKey(date = new Date()) {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function generatedMenuName(numero, date = new Date()) {
  return `Menu Excel ${date.toISOString().slice(0, 10)} #${numero}`;
}

function generatedMenuKey(numero, date = new Date()) {
  return `menu_excel_${dateKey(date)}_${String(numero).padStart(3, "0")}`;
}

function rangeFromKcal(kcal = 0) {
  const value = macro(kcal);
  if (!value) return "";
  const min = Math.floor(value / 100) * 100;
  return `${min}-${min + 100} kcal`;
}

function normalizeMenuVisibility(value = "") {
  const normalized = normalizeText(value).replace(/\s+/g, "");
  if (["global", "premium", "coaches", "coach", "solocoaches", "solo_coaches"].includes(normalized)) {
    return normalized === "premium" ? "premium" : normalized === "global" ? "global" : "solo_coaches";
  }
  if (["clientesasignados", "clientes", "soloclientes", "solo_clientes"].includes(normalized)) return "solo_clientes";
  if (["asignada", "asignado"].includes(normalized)) return "asignada";
  if (["privada", "private"].includes(normalized)) return "privada";
  return "global";
}

function normalizeOptions(options = {}) {
  const planRaw = normalizeText(options.planMinimo || options.plan || "free");
  const modeRaw = normalizeText(options.modo || options.mode || "crear_nuevos");
  const modeAliases = {
    crear: "crear_nuevos",
    crear_nuevas: "crear_nuevos",
    crear_nuevos: "crear_nuevos",
    actualizar: "actualizar",
    duplicar: "duplicar",
  };

  return {
    visibilidad: normalizeMenuVisibility(options.visibilidad),
    planMinimo: ["free", "pro", "vip"].includes(planRaw) ? planRaw : "free",
    modo: modeAliases[modeRaw] || "crear_nuevos",
    guardarComidasComoBiblioteca: options.guardarComidasComoBiblioteca === true || String(options.guardarComidasComoBiblioteca) === "true",
    importarSoloValidos: options.importarSoloValidos !== false && String(options.importarSoloValidos) !== "false",
  };
}

function addTotals(a = {}, b = {}) {
  return {
    kcal: round(macro(a.kcal) + macro(b.kcal), 2),
    proteinas: round(macro(a.proteinas ?? a.proteina) + macro(b.proteinas ?? b.proteina), 2),
    proteina: round(macro(a.proteina ?? a.proteinas) + macro(b.proteina ?? b.proteinas), 2),
    carbohidratos: round(macro(a.carbohidratos ?? a.carbs) + macro(b.carbohidratos ?? b.carbs), 2),
    carbs: round(macro(a.carbs ?? a.carbohidratos) + macro(b.carbs ?? b.carbohidratos), 2),
    grasas: round(macro(a.grasas) + macro(b.grasas), 2),
    fibra: round(macro(a.fibra) + macro(b.fibra), 2),
  };
}

function totalsFromMeals(comidas = []) {
  return comidas.reduce((acc, comida) => addTotals(acc, comida.macrosTotales || comida.totales || {}), {
    kcal: 0,
    proteinas: 0,
    proteina: 0,
    carbohidratos: 0,
    carbs: 0,
    grasas: 0,
    fibra: 0,
  });
}

function foodDisplayForPreview(item = {}) {
  return {
    nombreExcel: item.nombreExcel,
    cantidad: item.cantidad,
    matchStatus: item.matchStatus,
    alimentoId: item.alimentoId,
    nombreBase: item.nombreBase,
    unidad: item.unidad,
    warnings: item.warnings || [],
    errors: item.errors || [],
  };
}

function uniqueMessages(messages = []) {
  return [...new Set((messages || []).map((message) => cleanString(message, 500)).filter(Boolean))];
}

function countMessages(menus = [], key = "warnings") {
  return menus.reduce((total, menu) => {
    const messages = [
      ...(Array.isArray(menu?.[key]) ? menu[key] : []),
      ...(menu?.comidas || []).flatMap((comida) => (Array.isArray(comida?.[key]) ? comida[key] : [])),
    ];
    return total + uniqueMessages(messages).length;
  }, 0);
}

function cellHasValue(sheet, row, col) {
  return cleanString(readCell(sheet, row, col), 300) !== "";
}

function blockHasContent(sheet, leftCol, rightCol) {
  for (let row = 0; row < ROWS_PER_MEAL * MAX_MEALS_PER_MENU; row += 1) {
    if (cellHasValue(sheet, row, leftCol) || cellHasValue(sheet, row, rightCol)) return true;
  }
  return false;
}

function columnIsEmpty(sheet, col) {
  for (let row = 0; row < ROWS_PER_MEAL * MAX_MEALS_PER_MENU; row += 1) {
    if (cellHasValue(sheet, row, col)) return false;
  }
  return true;
}

function detectMenuBlocks(sheet) {
  const range = xlsx.utils.decode_range(sheet["!ref"] || "A1:A1");
  const maxCol = Math.min(Math.max(range.e.c, 0), MAX_SCAN_COLUMNS);
  const blocks = [];
  let col = 0;

  while (col <= maxCol && blocks.length < MAX_MENUS) {
    if (blockHasContent(sheet, col, col + 1)) {
      blocks.push({ leftCol: col, rightCol: col + 1 });
      col += 2;
      while (col <= maxCol && columnIsEmpty(sheet, col)) col += 1;
    } else {
      col += 1;
    }
  }

  return blocks;
}

function buildMenuItem(match, cantidad) {
  const macros = calculateFoodMacros(match.selected, cantidad);
  return {
    id: new ObjectId().toString(),
    alimentoId: String(match.selected.alimentoId || match.selected._id || ""),
    alimentoObjectId: ObjectId.isValid(String(match.selected._id || "")) ? new ObjectId(String(match.selected._id)) : null,
    nombre: match.selected.nombre,
    nombreSnapshot: match.selected.nombre,
    cantidad,
    unidad: match.selected.unidad,
    kcal: macros.kcal,
    proteinas: macros.proteinas,
    proteina: macros.proteinas,
    carbohidratos: macros.carbohidratos,
    carbs: macros.carbohidratos,
    grasas: macros.grasas,
    fibra: macros.fibra,
    categoria: match.selected.categoria,
    categoriaSnapshot: match.selected.categoria,
    imagenUrl: match.selected.imagenUrl,
    imagenAlt: match.selected.nombre,
    quantitySource: "manual",
    quantityPending: false,
    fixedQuantity: true,
  };
}

function consolidateMealEntries(items = [], alimentos = [], warnings = []) {
  const map = new Map();
  items.forEach((item, index) => {
    const key = `${item.alimentoId || normalizeKey(item.nombre || item.nombreSnapshot)}|${item.unidad || "Unidad"}`;
    const alimentoPreview = alimentos[index] || {};
    const current = map.get(key) || {
      item: {
        ...item,
        cantidad: 0,
        kcal: 0,
        proteinas: 0,
        proteina: 0,
        carbohidratos: 0,
        carbs: 0,
        grasas: 0,
        fibra: 0,
      },
      preview: {
        ...alimentoPreview,
        cantidad: 0,
      },
      count: 0,
    };
    current.count += 1;
    current.item.cantidad = round(current.item.cantidad + macro(item.cantidad), 2);
    current.item.kcal = round(current.item.kcal + macro(item.kcal), 2);
    current.item.proteinas = round(current.item.proteinas + macro(item.proteinas), 2);
    current.item.proteina = current.item.proteinas;
    current.item.carbohidratos = round(current.item.carbohidratos + macro(item.carbohidratos), 2);
    current.item.carbs = current.item.carbohidratos;
    current.item.grasas = round(current.item.grasas + macro(item.grasas), 2);
    current.item.fibra = round(current.item.fibra + macro(item.fibra), 2);
    current.preview.cantidad = current.item.cantidad;
    map.set(key, current);
  });

  const nextWarnings = [...warnings];
  const nextItems = [];
  const nextAlimentos = [];

  for (const entry of map.values()) {
    nextItems.push(entry.item);
    nextAlimentos.push(entry.preview);
    if (entry.count > 1) {
      nextWarnings.push(`${entry.item.nombre || entry.item.nombreSnapshot} estaba repetido ${entry.count} veces y se combino en ${entry.item.cantidad} ${entry.item.unidad}.`);
    }
  }

  return {
    items: nextItems,
    alimentos: nextAlimentos,
    warnings: uniqueMessages(nextWarnings),
  };
}

async function resolveMenuTarget(col, menu = {}, options = {}) {
  const mode = options.modo || "crear_nuevos";
  const existing = await col.findOne({
    menuKey: menu.menuKey,
    source: "excel_menu_import",
    ownerType: "admin",
  });

  if (existing && mode === "actualizar") {
    return {
      action: "update",
      id: idToString(existing._id),
      nombreFinal: existing.nombre || menu.nombreGenerado,
      menuKeyFinal: existing.menuKey || menu.menuKey,
    };
  }

  if (!existing && mode !== "duplicar") {
    return {
      action: "create",
      nombreFinal: menu.nombreGenerado,
      menuKeyFinal: menu.menuKey,
    };
  }

  const used = await col
    .find(
      {
        ownerType: "admin",
        source: "excel_menu_import",
        $or: [
          { nombre: new RegExp(`^${escapeRegex(menu.nombreGenerado)}(?: \\d+)?$`, "i") },
          { menuKey: new RegExp(`^${escapeRegex(menu.menuKey)}(?:_\\d+)?$`, "i") },
        ],
      },
      { projection: { nombre: 1, menuKey: 1 } }
    )
    .toArray();
  const names = new Set(used.map((item) => normalizeText(item.nombre)));
  const keys = new Set(used.map((item) => normalizeText(item.menuKey)));
  let suffix = 1;
  let nombreFinal = `${menu.nombreGenerado} ${suffix}`;
  let menuKeyFinal = `${menu.menuKey}_${suffix}`;
  while (names.has(normalizeText(nombreFinal)) || keys.has(normalizeText(menuKeyFinal))) {
    suffix += 1;
    nombreFinal = `${menu.nombreGenerado} ${suffix}`;
    menuKeyFinal = `${menu.menuKey}_${suffix}`;
  }

  return {
    action: "create",
    nombreFinal,
    menuKeyFinal,
  };
}

function escapeRegex(value = "") {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

class ServicioMenusExcelImport {
  constructor() {
    this.alimentosModel = new ModelMongoDBAlimentos();
    this.menusModel = new ModelMongoDBMenus();
    this.comidasModel = new ModelMongoDBComidasGuardadas();
  }

  validateFile(file) {
    if (!file?.buffer?.length) throw new Error("EXCEL_FILE_REQUIRED");
    if (file.size > MAX_FILE_SIZE) throw new Error("EXCEL_FILE_TOO_LARGE");
    const name = cleanString(file.originalname, 260).toLowerCase();
    if (!name.endsWith(".xlsx") && !name.endsWith(".xls")) throw new Error("EXCEL_FILE_INVALID_TYPE");
  }

  parseWorkbook(file) {
    this.validateFile(file);
    const workbook = xlsx.read(file.buffer, { type: "buffer" });
    const sheet = workbook.Sheets[SHEET_NAME];
    if (!sheet) throw new Error("MENUS_SHEET_REQUIRED");
    return sheet;
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

  parseMealSection(sheet, block, sectionIndex, foodIndex) {
    const baseRow = sectionIndex * ROWS_PER_MEAL;
    const tipoRaw = cleanString(readCell(sheet, baseRow, block.leftCol), 80);
    const nombre = cleanString(readCell(sheet, baseRow + 1, block.leftCol), 180);
    const itemsRaw = [];

    for (let foodRow = 0; foodRow < MAX_FOODS_PER_MEAL; foodRow += 1) {
      const row = baseRow + 2 + foodRow;
      const nombreExcel = cleanString(readCell(sheet, row, block.leftCol), 180);
      const cantidadRaw = readCell(sheet, row, block.rightCol);
      if (!nombreExcel && (cantidadRaw === "" || cantidadRaw === null || cantidadRaw === undefined)) continue;
      itemsRaw.push({ nombreExcel, cantidadRaw, row: row + 1 });
    }

    if (!itemsRaw.length) return null;

    const tipoComida = normalizeMealType(tipoRaw);
    const errors = [];
    const warnings = [];
    if (!tipoComida) errors.push(`Fila ${baseRow + 1}: la comida tiene alimentos pero no tiene tipo de comida valido.`);
    if (!nombre) errors.push(`Fila ${baseRow + 2}: la comida tiene alimentos pero no tiene nombre.`);

    const alimentos = [];
    const items = [];

    for (const raw of itemsRaw) {
      const cantidad = toNumber(raw.cantidadRaw, 0);
      const itemErrors = [];
      if (!raw.nombreExcel) itemErrors.push(`Fila ${raw.row}: nombre de alimento vacio.`);
      if (cantidad <= 0) itemErrors.push(`Fila ${raw.row}: cantidad invalida para "${raw.nombreExcel || "alimento"}".`);

      if (itemErrors.length) {
        errors.push(...itemErrors);
        alimentos.push({
          nombreExcel: raw.nombreExcel,
          cantidad: raw.cantidadRaw,
          matchStatus: "error",
          errors: itemErrors,
          warnings: [],
        });
        continue;
      }

      const match = this.findFood(raw.nombreExcel, foodIndex);
      if (match.errors?.length) errors.push(...match.errors.map((message) => `Fila ${raw.row}: alimento "${raw.nombreExcel}" no encontrado. ${message}`));
      if (match.warnings?.length) warnings.push(...match.warnings.map((message) => `${raw.nombreExcel}: ${message}`));

      if (!match.selected) {
        alimentos.push({
          nombreExcel: raw.nombreExcel,
          cantidad,
          matchStatus: "error",
          errors: match.errors || [],
          warnings: match.warnings || [],
        });
        continue;
      }

      const item = buildMenuItem(match, cantidad);
      items.push(item);
      alimentos.push({
        nombreExcel: raw.nombreExcel,
        cantidad,
        matchStatus: match.status,
        alimentoId: item.alimentoId,
        nombreBase: item.nombre,
        unidad: item.unidad,
        warnings: match.warnings || [],
        errors: match.errors || [],
      });
    }

    const consolidated = consolidateMealEntries(items, alimentos, warnings);
    const macrosTotales = totalsFromItems(consolidated.items);
    return {
      id: new ObjectId().toString(),
      orden: sectionIndex + 1,
      tipoComida,
      tipoComidaExcel: tipoRaw,
      nombre,
      alimentos: consolidated.alimentos,
      items: consolidated.items,
      macrosTotales,
      totales: macrosTotales,
      clasificacionAuto: classifyMeal(macrosTotales, tipoComida),
      warnings: consolidated.warnings,
      advertencias: consolidated.warnings,
      errors: uniqueMessages(errors),
      errores: uniqueMessages(errors),
      valido: !errors.length,
      status: errors.length ? "error" : consolidated.warnings.length ? "warning" : "ok",
      comidaGuardadaId: null,
    };
  }

  async decorateMealLibraryDuplicates(comidas = []) {
    const col = this.comidasModel._col();
    const out = [];
    for (const comida of comidas) {
      if (comida.status === "error") {
        out.push(comida);
        continue;
      }
      const duplicate = await resolveImportedMealName(col, comida);
      out.push({
        ...comida,
        bibliotecaStatus: duplicate.status,
        nombreBibliotecaFinal: duplicate.nombreFinal,
        comidaGuardadaExistenteId: duplicate.existingId || null,
        warnings: uniqueMessages([...(comida.warnings || []), ...(duplicate.warnings || [])]),
        advertencias: uniqueMessages([...(comida.warnings || []), ...(duplicate.warnings || [])]),
        status: ["renombrada_por_nombre_repetido", "duplicado_exacto"].includes(duplicate.status) && comida.status === "ok" ? "warning" : comida.status,
      });
    }
    return out;
  }

  async preview(file, options = {}, actor = {}) {
    cleanupPreviewCache();
    const normalizedOptions = normalizeOptions(options);
    const sheet = this.parseWorkbook(file);
    const foodIndex = await this.loadFoodIndex();
    const blocks = detectMenuBlocks(sheet);
    const now = new Date();
    const menus = [];

    for (let index = 0; index < blocks.length && index < MAX_MENUS; index += 1) {
      const block = blocks[index];
      const numero = index + 1;
      const comidas = [];

      for (let section = 0; section < MAX_MEALS_PER_MENU; section += 1) {
        const comida = this.parseMealSection(sheet, block, section, foodIndex);
        if (comida) comidas.push(comida);
      }

      if (!comidas.length) continue;

      const decoratedComidas = normalizedOptions.guardarComidasComoBiblioteca
        ? await this.decorateMealLibraryDuplicates(comidas)
        : comidas;
      const validComidas = decoratedComidas.filter((comida) => comida.status !== "error");
      const errors = uniqueMessages(decoratedComidas.flatMap((comida) => comida.errors || []));
      const warnings = uniqueMessages(decoratedComidas.flatMap((comida) => comida.warnings || []));
      const macrosTotales = totalsFromMeals(decoratedComidas);
      const nombreGenerado = generatedMenuName(numero, now);
      const menuKey = generatedMenuKey(numero, now);
      if (!validComidas.length) errors.push("El menu no tiene comidas validas para importar.");

      menus.push({
        numero,
        nombreGenerado,
        menuKey,
        cantidadComidas: validComidas.length,
        cantidadComidasDetectadas: decoratedComidas.length,
        comidas: decoratedComidas,
        macrosTotales,
        totales: macrosTotales,
        errors,
        errores: errors,
        warnings,
        advertencias: warnings,
        valido: errors.length === 0 && validComidas.length > 0,
        status: errors.length
          ? "error"
          : decoratedComidas.some((comida) => comida.status === "warning")
            ? "warning"
            : "ok",
      });
    }

    const validos = menus.filter((menu) => menu.status !== "error");
    const totalWarnings = countMessages(menus, "warnings");
    const totalErrors = countMessages(menus, "errors");
    const token = crypto.randomUUID();
    previewCache.set(token, {
      createdAt: Date.now(),
      actorId: actor?.id || actor?._id || null,
      options: normalizedOptions,
      menus,
    });

    return {
      importToken: token,
      totalMenusDetectados: menus.length,
      totalValidos: validos.length,
      totalConAdvertencias: totalWarnings,
      totalConErrores: totalErrors,
      totalAdvertencias: totalWarnings,
      totalErrores: totalErrors,
      menus: menus.map((menu) => ({
        ...menu,
        comidas: menu.comidas.map((comida) => ({
          ...comida,
          items: undefined,
          alimentos: (comida.alimentos || []).map(foodDisplayForPreview),
        })),
      })),
    };
  }

  menuDoc(menu = {}, target = {}, options = {}, actor = {}, importBatchId = "") {
    const comidas = (menu.comidas || []).map((comida, index) => ({
      id: comida.id || new ObjectId().toString(),
      nombre: comida.nombre || `Comida ${index + 1}`,
      orden: index + 1,
      tipoComida: comida.tipoComida || "otro",
      items: comida.items || [],
      alimentos: comida.items || [],
      totales: comida.totales || comida.macrosTotales || {},
      macrosTotales: comida.macrosTotales || comida.totales || {},
      comidaGuardadaId: comida.comidaGuardadaId || null,
    }));
    const macrosTotales = totalsFromMeals(comidas);
    const proteina = macro(macrosTotales.proteinas ?? macrosTotales.proteina);
    const carbs = macro(macrosTotales.carbohidratos ?? macrosTotales.carbs);
    const grasas = macro(macrosTotales.grasas);

    return {
      nombre: target.nombreFinal || menu.nombreGenerado,
      menuKey: target.menuKeyFinal || menu.menuKey,
      descripcion: `Importado desde Excel (${SHEET_NAME})`,
      kcalObjetivo: macro(macrosTotales.kcal),
      rangoKcal: rangeFromKcal(macrosTotales.kcal),
      macrosObjetivo: { proteina, carbs, grasas },
      macrosTotales,
      totales: macrosTotales,
      objetivo: "mantenimiento",
      cantidadComidas: comidas.length,
      tags: ["excel_menu_import", options.planMinimo, options.visibilidad].filter(Boolean),
      visibilidad: options.visibilidad,
      planMinimo: options.planMinimo,
      ownerType: "admin",
      ownerId: actor?.id || actor?._id || null,
      createdBy: actor?.id || actor?._id || null,
      creadaPorRol: "admin",
      source: "excel_menu_import",
      importBatchId,
      estado: "activo",
      activo: true,
      activa: true,
      comidas,
    };
  }

  async saveMealAsLibrary(comida = {}, context = {}) {
    const col = this.comidasModel._col();
    const duplicate = await resolveImportedMealName(col, comida);
    if (duplicate.action === "skip") {
      return {
        id: duplicate.existingId,
        skipped: true,
        duplicateStatus: duplicate.status,
        nombre: duplicate.nombreFinal,
      };
    }

    const now = new Date();
    const doc = {
      nombre: duplicate.nombreFinal || comida.nombre,
      nombreOriginalExcel: comida.nombre,
      descripcion: `Importada desde menu Excel (${SHEET_NAME})`,
      tipoComida: comida.tipoComida,
      items: comida.items,
      alimentos: comida.items,
      totales: comida.totales || comida.macrosTotales,
      macrosTotales: comida.macrosTotales || comida.totales,
      clasificacionAuto: comida.clasificacionAuto || classifyMeal(comida.macrosTotales || comida.totales, comida.tipoComida),
      tags: ["excel_menu_import", comida.tipoComida, context.planMinimo].filter(Boolean),
      favorita: false,
      ownerId: context.actorId || null,
      ownerRole: "admin",
      ownerType: "admin",
      creadaPorId: context.actorId || null,
      creadaPorRol: "admin",
      visibilidad: context.visibilidad,
      asignadaA: [],
      gimnasioId: null,
      profesionalId: null,
      origen: "excel_menu_import",
      source: "excel_menu_import",
      sourceMenuId: context.sourceMenuId,
      sourceMenuKey: context.sourceMenuKey,
      importBatchId: context.importBatchId,
      planMinimo: context.planMinimo,
      activo: true,
      activa: true,
      createdAt: now,
      updatedAt: now,
    };
    const saved = await this.comidasModel.create(doc);
    return {
      id: idToString(saved._id),
      skipped: false,
      duplicateStatus: duplicate.status,
      nombre: saved.nombre,
    };
  }

  async confirm(importToken, options = {}, actor = {}) {
    cleanupPreviewCache();
    const entry = previewCache.get(cleanString(importToken, 120));
    if (!entry) throw new Error("IMPORT_TOKEN_INVALID");
    if (entry.actorId && actor?.id && String(entry.actorId) !== String(actor.id)) throw new Error("IMPORT_TOKEN_INVALID");

    const normalizedOptions = normalizeOptions({ ...entry.options, ...options });
    const menusConErrores = entry.menus.filter((menu) => menu.status === "error");
    if (menusConErrores.length && !normalizedOptions.importarSoloValidos) throw new Error("IMPORT_HAS_ERRORS");

    const menus = normalizedOptions.importarSoloValidos
      ? entry.menus.filter((menu) => menu.status !== "error")
      : entry.menus;
    if (!menus.length) throw new Error("IMPORT_NO_VALID_MENUS");

    const importBatchId = crypto.randomUUID();
    const col = this.menusModel._base();
    const created = [];
    let comidasGuardadasCreadas = 0;
    let comidasGuardadasOmitidas = 0;

    for (const menu of menus.slice(0, MAX_MENUS)) {
      if (menu.status === "error") continue;
      const target = await resolveMenuTarget(col, menu, normalizedOptions);
      let doc = this.menuDoc(menu, target, normalizedOptions, actor, importBatchId);

      let savedMenu;
      if (target.action === "update") {
        savedMenu = await this.menusModel.updateBaseById(target.id, doc);
      } else {
        savedMenu = await this.menusModel.createBase(doc);
      }

      if (normalizedOptions.guardarComidasComoBiblioteca) {
        const actorId = actor?.id || actor?._id || null;
        const comidasConRefs = [];
        for (const comida of doc.comidas) {
          const result = await this.saveMealAsLibrary(comida, {
            actorId,
            visibilidad: normalizedOptions.visibilidad,
            planMinimo: normalizedOptions.planMinimo,
            importBatchId,
            sourceMenuId: savedMenu._id,
            sourceMenuKey: doc.menuKey,
          });
          if (result.skipped) comidasGuardadasOmitidas += 1;
          else comidasGuardadasCreadas += 1;
          comidasConRefs.push({ ...comida, comidaGuardadaId: result.id });
        }
        doc = { ...doc, comidas: comidasConRefs };
        savedMenu = await this.menusModel.updateBaseById(savedMenu._id, { comidas: comidasConRefs });
      }

      created.push({
        id: idToString(savedMenu._id || savedMenu.id),
        nombre: savedMenu.nombre,
        menuKey: savedMenu.menuKey,
        updated: target.action === "update",
      });
    }

    previewCache.delete(importToken);
    return {
      ok: true,
      importBatchId,
      imported: created.length,
      menus: created,
      comidasGuardadasCreadas,
      comidasGuardadasOmitidas,
    };
  }
}

export default ServicioMenusExcelImport;
