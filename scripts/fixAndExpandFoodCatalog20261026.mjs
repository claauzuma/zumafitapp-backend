import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { MongoClient } from "mongodb";
import config from "../config.js";

const APPLY = process.argv.includes("--apply");
const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(here, "..");
const frontendRoot = path.resolve(backendRoot, "..", "..", "zumafitront");
const outputDir = path.join(frontendRoot, "artifacts", "food-catalog-fixes-2026-10-26");
const collectionName = "fooddatabase2";
const migrationId = "food-catalog-fixes-2026-10-26";
const now = new Date();

const SOURCES = {
  SARA: {
    name: "SARA 2 - Tabla de Composición Química de Alimentos (Argentina, 2022)",
    url: "https://cesni-biblioteca.org/archivos/tabla-composicion-quimica-alimentos-argentina_ennys2__.pdf",
  },
  USDA: {
    name: "USDA FoodData Central - Foundation/SR Legacy (descarga abril de 2026)",
    url: "https://fdc.nal.usda.gov/download-datasets",
  },
  COCA: {
    name: "Coca-Cola Argentina - Coca-Cola Sabor Original",
    url: "https://www.coca-cola.com/ar/es/brands/coca-cola/original",
  },
  SPRITE: {
    name: "Coca-Cola Argentina - Sprite",
    url: "https://www.coca-cola.com/ar/es/brands/sprite/productos",
  },
  FANTA: {
    name: "Coca-Cola Argentina - Fanta",
    url: "https://www.coca-cola.com/ar/es/brands/fanta/productos",
  },
  HEINEKEN: {
    name: "Heineken Argentina - Heineken Original",
    url: "https://www.heineken.com/ar/es/nuestros-productos/la-original/",
  },
};

const explicitOnly = () => ({
  mode: "EXPLICIT_ONLY",
  roles: { P1: false, P2: false, C1: false, C2: false, V: false, F: false, G: false },
  mealTypes: { breakfast: false, lunch: false, snack: false, dinner: false, extraSnack: false },
  portionRule: { unit: null, min: null, max: null, step: null, allowedValues: [] },
});

const genericProtein = (secondary = false) => ({
  mode: "GENERIC",
  roles: { P1: !secondary, P2: secondary, C1: false, C2: false, V: false, F: false, G: false },
  mealTypes: secondary
    ? { breakfast: true, lunch: false, snack: true, dinner: false, extraSnack: true }
    : { breakfast: false, lunch: true, snack: false, dinner: true, extraSnack: false },
  portionRule: { unit: null, min: null, max: null, step: null, allowedValues: [] },
});

const genericFruit = () => ({
  mode: "GENERIC",
  roles: { P1: false, P2: false, C1: false, C2: false, V: false, F: true, G: false },
  mealTypes: { breakfast: true, lunch: true, snack: true, dinner: true, extraSnack: true },
  portionRule: { unit: null, min: null, max: null, step: null, allowedValues: [] },
});

function fold(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function compact(value = "") {
  return fold(value).replace(/\s+/g, "");
}

function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function sourceNote(source, sourceFood, notes = "") {
  return {
    migrationId,
    checkedAt: now,
    source: source.name,
    sourceUrl: source.url,
    sourceFood,
    basis: "por 100 g/ml salvo que se indique unidad",
    notes,
  };
}

function per100Fields(spec, suggested = 100) {
  const { kcal, protein, carbs, fat, fiber = 0, alcohol = 0 } = spec;
  const factor = Number(suggested || 0) / 100;
  return {
    Cantidad: 1,
    cantidadUnidad: 1,
    Calorias: round(kcal / 100),
    calorias: round(kcal / 100),
    kcal: round(kcal / 100),
    kcalUnidad: round(kcal / 100),
    Proteinas: round(protein / 100),
    proteinas: round(protein / 100),
    proteina: round(protein / 100),
    proteinaUnidad: round(protein / 100),
    Carbohidratos: round(carbs / 100),
    carbohidratos: round(carbs / 100),
    carbohidratosUnidad: round(carbs / 100),
    Grasas: round(fat / 100),
    grasas: round(fat / 100),
    grasasUnidad: round(fat / 100),
    Fibra: round(fiber / 100),
    fibra: round(fiber / 100),
    fibraUnidad: round(fiber / 100),
    kcal100: kcal,
    proteina100: protein,
    carbohidratos100: carbs,
    grasas100: fat,
    fibra100: fiber,
    alcohol100: alcohol,
    kcalPorcionSugerida: round(kcal * factor, 2),
    proteinaPorcionSugerida: round(protein * factor, 2),
    carbohidratosPorcionSugerida: round(carbs * factor, 2),
    grasasPorcionSugerida: round(fat * factor, 2),
    fibraPorcionSugerida: round(fiber * factor, 2),
    alcoholPorcionSugerida: round(alcohol * factor, 2),
    macroBasis: "perUnit",
  };
}

function unitFields(spec, weightGrams) {
  const factor = weightGrams / 100;
  const totals = {
    kcal: round(spec.kcal * factor, 2),
    protein: round(spec.protein * factor, 2),
    carbs: round(spec.carbs * factor, 2),
    fat: round(spec.fat * factor, 2),
    fiber: round((spec.fiber || 0) * factor, 2),
  };
  return {
    Cantidad: 1,
    cantidadUnidad: 1,
    Calorias: totals.kcal,
    calorias: totals.kcal,
    kcal: totals.kcal,
    kcalUnidad: totals.kcal,
    Proteinas: totals.protein,
    proteinas: totals.protein,
    proteina: totals.protein,
    proteinaUnidad: totals.protein,
    Carbohidratos: totals.carbs,
    carbohidratos: totals.carbs,
    carbohidratosUnidad: totals.carbs,
    Grasas: totals.fat,
    grasas: totals.fat,
    grasasUnidad: totals.fat,
    Fibra: totals.fiber,
    fibra: totals.fiber,
    fibraUnidad: totals.fiber,
    kcal100: spec.kcal,
    proteina100: spec.protein,
    carbohidratos100: spec.carbs,
    grasas100: spec.fat,
    fibra100: spec.fiber || 0,
    kcalPorcionSugerida: totals.kcal,
    proteinaPorcionSugerida: totals.protein,
    carbohidratosPorcionSugerida: totals.carbs,
    grasasPorcionSugerida: totals.fat,
    fibraPorcionSugerida: totals.fiber,
    pesoUnidadGramos: weightGrams,
    macroBasis: "perUnit",
  };
}

const nutritionUpdates = [
  { id: 3, expected: "Aceitunas negras", kcal: 119, protein: 0.8, carbs: 4.4, fat: 10.9, source: SOURCES.SARA, sourceFood: "Aceituna negra" },
  { id: 4, expected: "Aceitunas verdes", kcal: 130, protein: 1.5, carbs: 0.5, fat: 13.5, source: SOURCES.SARA, sourceFood: "Aceituna verde" },
  { id: 103, expected: "Cerveza", name: "Cerveza regular", kcal: 43, protein: 0.5, carbs: 3.6, fat: 0, alcohol: 3.9, source: SOURCES.SARA, sourceFood: "Cerveza con alcohol", category: "Otros", subcategory: "Bebidas alcohólicas", generation: explicitOnly() },
  { id: 105, expected: "Choclo entero", kcal: 97, protein: 3.7, carbs: 17.8, fat: 1.2, source: SOURCES.SARA, sourceFood: "Choclo crudo" },
  { id: 113, expected: "Churrasco magro", kcal: 158, protein: 21.5, carbs: 0, fat: 8, source: SOURCES.SARA, sourceFood: "Vacuno, cortes semigrasos promedio, crudo", notes: "Se conservan los macros del corte cargado y se corrige la energía para cerrar por Atwater." },
  { id: 116, expected: "Coca cola", name: "Coca-Cola Sabor Original", unit: "Ml", kcal: 30, protein: 0, carbs: 7.5, fat: 0, source: SOURCES.COCA, sourceFood: "Coca-Cola Sabor Original Argentina (rótulo vigente)", category: "Otros", subcategory: "Gaseosas", generation: explicitOnly(), disableMealFlags: true },
  { id: 165, expected: "Filet de merluza", unit: "Grs", kcal: 80, protein: 17.1, carbs: 0, fat: 1.3, source: SOURCES.SARA, sourceFood: "Merluza cruda", min: 80, max: 300, suggested: 150, step: 10 },
  { id: 282, expected: "Maní", kcal: 596, protein: 24.4, carbs: 12.9, fat: 49.7, source: SOURCES.SARA, sourceFood: "Maní tostado sin sal" },
  { id: 286, expected: "Mantequilla de maní", kcal: 607, protein: 21.9, carbs: 18.3, fat: 49.5, source: SOURCES.SARA, sourceFood: "Mantequilla de maní" },
  { id: 304, expected: "Merluza", kcal: 80, protein: 17.1, carbs: 0, fat: 1.3, source: SOURCES.SARA, sourceFood: "Merluza cruda" },
  { id: 353, expected: "Ñoquis con papa", kcal: 159, protein: 5.8, carbs: 27.9, fat: 2.6, source: SOURCES.SARA, sourceFood: "Ñoquis de papa envasados crudos" },
  { id: 497, expected: "Ricota magra", kcal: 137, protein: 11.4, carbs: 5.1, fat: 7.9, source: SOURCES.SARA, sourceFood: "Ricotta descremada" },
  { id: 517, expected: "Sardinas", name: "Sardinas enlatadas al natural", kcal: 170, protein: 22.1, carbs: 0, fat: 9.1, source: SOURCES.SARA, sourceFood: "Sardinas enlatadas al natural" },
  { id: 523, expected: "Semillas de girasol", kcal: 592, protein: 20.8, carbs: 11.4, fat: 51.5, source: SOURCES.SARA, sourceFood: "Semilla de girasol" },
  { id: 524, expected: "Semillas de lino", kcal: 459, protein: 18.3, carbs: 1.6, fat: 42.2, source: SOURCES.SARA, sourceFood: "Semilla de lino", notes: "SARA informa carbohidratos disponibles; por eso difiere del carbohidrato total de USDA." },
  { id: 528, expected: "Soja texturizada", kcal: 283, protein: 51.5, carbs: 16.4, fat: 1.2, source: SOURCES.SARA, sourceFood: "Soja texturizada" },
  { id: 531, expected: "Sprite Gaseosa", name: "Sprite", unit: "Ml", kcal: 29.5, protein: 0, carbs: 7.5, fat: 0, source: SOURCES.SPRITE, sourceFood: "Sprite Argentina (rótulo vigente)", category: "Otros", subcategory: "Gaseosas", generation: explicitOnly(), disableMealFlags: true },
  { id: 543, expected: "Tofu", kcal: 149, protein: 17.3, carbs: 0.5, fat: 8.7, source: SOURCES.SARA, sourceFood: "Tofu" },
  { id: 588, expected: "Vino", name: "Vino tinto", kcal: 84, protein: 0.1, carbs: 2.7, fat: 0, alcohol: 10.4, source: SOURCES.SARA, sourceFood: "Vino tinto", category: "Otros", subcategory: "Bebidas alcohólicas", generation: explicitOnly(), suggested: 150, min: 50, max: 300, step: 25 },
];

const orangeUpdates = [
  { id: 343, expected: "Naranja chica", weight: 96 },
  { id: 344, expected: "Naranja grande", weight: 184 },
  { id: 345, expected: "Naranja mediana", weight: 131 },
];

const structuralUpdates = [
  { id: 224, expected: "Huevos", set: { Categoria: "Proteínas", categoria: "Proteínas", categoriaZumaFit: "Proteínas", Fuente: "Proteínas", fuente: "Proteínas", subcategoria: "Huevos", subcategoriaZumaFit: "Huevos", esProteinaPrincipal: true, esGrasaPrincipal: false, motivoRevision: "" } },
  { id: 396, expected: "Papaya", set: { Categoria: "Frutas", categoria: "Frutas", categoriaZumaFit: "Frutas", Fuente: "Frutas", fuente: "Frutas", subcategoria: "Frutas", subcategoriaZumaFit: "Frutas", esCarboPrincipal: false, generation: genericFruit(), motivoRevision: "" } },
  { id: 520, expected: "Semillas de calabaza", set: { Categoria: "Grasas", categoria: "Grasas", categoriaZumaFit: "Grasas", Fuente: "Grasas", fuente: "Grasas", subcategoria: "Frutos secos y semillas", subcategoriaZumaFit: "Frutos secos y semillas", esGrasaPrincipal: true, esVegetalLibre: false, motivoRevision: "" } },
  { id: 291, expected: "Mariscos", set: { activo: false, requiereRevision: true, motivoRevision: "Nombre nutricionalmente ambiguo: camarón, mejillón, calamar y otros mariscos no comparten macros. Usar un alimento específico.", generation: explicitOnly() } },
  { id: 46, expected: "Atun en lomitos al aceite", set: { generation: explicitOnly(), requiereRevision: true, motivoRevision: "La unidad 'Pote' no declara peso neto ni escurrido. Se agregó una versión genérica por gramos con referencia SARA." } },
  { id: 47, expected: "Atun en lomitos al natural", set: { generation: explicitOnly(), requiereRevision: true, motivoRevision: "La unidad 'Pote' no declara peso neto ni escurrido. Se agregó una versión genérica por gramos con referencia SARA." } },
];

const brandedYogurtIds = [592, 593, 594, 595, 596, 597, 598, 599, 600, 601, 602, 603, 604];

const additions = [
  // Yogures genéricos argentinos.
  { key: "yogur-natural-entero", name: "Yogur natural entero", unit: "Grs", kcal: 62, protein: 3.5, carbs: 4.7, fat: 3.3, category: "Proteínas", subcategory: "Yogures", source: SOURCES.SARA, sourceFood: "Yogur entero natural", suggested: 200, min: 100, max: 300, step: 25, generation: genericProtein(true), allergens: ["Lácteos"] },
  { key: "yogur-entero-saborizado", name: "Yogur entero saborizado", unit: "Grs", kcal: 87, protein: 3.5, carbs: 11, fat: 3.3, category: "Proteínas", subcategory: "Yogures", source: SOURCES.SARA, sourceFood: "Yogur entero saborizado", suggested: 200, min: 100, max: 300, step: 25, generation: genericProtein(true), allergens: ["Lácteos"] },
  { key: "yogur-descremado-natural", name: "Yogur descremado natural", unit: "Grs", kcal: 36, protein: 2.9, carbs: 6, fat: 0, category: "Proteínas", subcategory: "Yogures", source: SOURCES.SARA, sourceFood: "Yogur descremado", suggested: 200, min: 100, max: 300, step: 25, generation: genericProtein(true), allergens: ["Lácteos"] },
  { key: "yogur-descremado-bebible", name: "Yogur descremado bebible", unit: "Ml", kcal: 36, protein: 2.9, carbs: 6, fat: 0, category: "Proteínas", subcategory: "Yogures", source: SOURCES.SARA, sourceFood: "Yogur descremado bebible", suggested: 200, min: 100, max: 300, step: 25, generation: genericProtein(true), allergens: ["Lácteos"] },
  { key: "yogur-entero-bebible-saborizado", name: "Yogur entero bebible saborizado", unit: "Ml", kcal: 76, protein: 2.9, carbs: 12, fat: 1.8, category: "Proteínas", subcategory: "Yogures", source: SOURCES.SARA, sourceFood: "Yogur entero bebible saborizado", suggested: 200, min: 100, max: 300, step: 25, generation: genericProtein(true), allergens: ["Lácteos"] },

  // Proteínas con nombre y estado explícitos.
  { key: "atun-natural-escurrido", name: "Atún al natural enlatado, escurrido", unit: "Grs", kcal: 86, protein: 19.4, carbs: 0, fat: 1, category: "Proteínas", subcategory: "Pescados y mariscos", source: SOURCES.SARA, sourceFood: "Atún enlatado al natural", suggested: 120, min: 60, max: 240, step: 10, generation: genericProtein(), allergens: ["Pescado/Mariscos"] },
  { key: "atun-aceite-escurrido", name: "Atún en aceite enlatado, escurrido", unit: "Grs", kcal: 190, protein: 29.1, carbs: 0, fat: 8.2, category: "Proteínas", subcategory: "Pescados y mariscos", source: SOURCES.SARA, sourceFood: "Atún en aceite", suggested: 120, min: 60, max: 240, step: 10, generation: genericProtein(), allergens: ["Pescado/Mariscos"] },
  { key: "salmon-rosado-crudo", name: "Salmón rosado crudo", unit: "Grs", kcal: 122, protein: 20.5, carbs: 0, fat: 4.4, category: "Proteínas", subcategory: "Pescados y mariscos", source: SOURCES.SARA, sourceFood: "Salmón rosado crudo", suggested: 150, min: 80, max: 300, step: 10, generation: genericProtein(), allergens: ["Pescado/Mariscos"] },
  { key: "caballa-enlatada", name: "Caballa enlatada", unit: "Grs", kcal: 149, protein: 23.2, carbs: 0, fat: 6.3, category: "Proteínas", subcategory: "Pescados y mariscos", source: SOURCES.SARA, sourceFood: "Caballa enlatada", suggested: 120, min: 60, max: 240, step: 10, generation: genericProtein(), allergens: ["Pescado/Mariscos"] },
  { key: "trucha-cruda", name: "Trucha cruda", unit: "Grs", kcal: 113, protein: 20.5, carbs: 0, fat: 3.5, category: "Proteínas", subcategory: "Pescados y mariscos", source: SOURCES.SARA, sourceFood: "Trucha cruda", suggested: 150, min: 80, max: 300, step: 10, generation: genericProtein(), allergens: ["Pescado/Mariscos"] },
  { key: "carne-vacuna-magra-promedio-cruda", name: "Carne vacuna magra promedio, cruda", unit: "Grs", kcal: 138, protein: 22.2, carbs: 0, fat: 5.5, category: "Proteínas", subcategory: "Carnes rojas", source: SOURCES.SARA, sourceFood: "Vacuno, cortes magros promedio, crudo", suggested: 150, min: 80, max: 300, step: 10, generation: genericProtein() },
  { key: "huevo-entero-crudo-gramos", name: "Huevo entero de gallina, crudo", unit: "Grs", kcal: 156, protein: 12, carbs: 0.4, fat: 11.8, category: "Proteínas", subcategory: "Huevos", source: SOURCES.SARA, sourceFood: "Huevo de gallina entero crudo", suggested: 100, min: 50, max: 250, step: 10, generation: genericProtein(), allergens: ["Huevo"] },

  // Gaseosas, aguas y bebidas deportivas: siempre explícitas, nunca autogeneradas.
  { key: "coca-cola-zero", name: "Coca-Cola Sin Azúcar", unit: "Ml", kcal: 0, protein: 0, carbs: 0, fat: 0, category: "Otros", subcategory: "Gaseosas", source: SOURCES.COCA, sourceFood: "Coca-Cola Sin Azúcar Argentina", suggested: 250, min: 100, max: 600, step: 50 },
  { key: "sprite-zero", name: "Sprite Sin Azúcar", unit: "Ml", kcal: 0, protein: 0, carbs: 0, fat: 0, category: "Otros", subcategory: "Gaseosas", source: SOURCES.SPRITE, sourceFood: "Sprite Sin Azúcar Argentina", suggested: 250, min: 100, max: 600, step: 50 },
  { key: "fanta-naranja", name: "Fanta Naranja", unit: "Ml", kcal: 49.5, protein: 0, carbs: 12.5, fat: 0, category: "Otros", subcategory: "Gaseosas", source: SOURCES.FANTA, sourceFood: "Fanta Naranja Argentina", suggested: 250, min: 100, max: 600, step: 50 },
  { key: "fanta-naranja-zero", name: "Fanta Naranja Sin Azúcar", unit: "Ml", kcal: 0, protein: 0, carbs: 0, fat: 0, category: "Otros", subcategory: "Gaseosas", source: SOURCES.FANTA, sourceFood: "Fanta Naranja Sin Azúcar Argentina", suggested: 250, min: 100, max: 600, step: 50 },
  { key: "fanta-pomelo", name: "Fanta Pomelo", unit: "Ml", kcal: 41, protein: 0, carbs: 10, fat: 0, category: "Otros", subcategory: "Gaseosas", source: SOURCES.FANTA, sourceFood: "Fanta Pomelo Argentina", suggested: 250, min: 100, max: 600, step: 50 },
  { key: "gaseosa-azucar-promedio", name: "Gaseosa con azúcar, promedio", unit: "Ml", kcal: 40, protein: 0, carbs: 10, fat: 0, category: "Otros", subcategory: "Gaseosas", source: SOURCES.SARA, sourceFood: "Gaseosa con azúcar promedio", suggested: 250, min: 100, max: 600, step: 50 },
  { key: "gaseosa-sin-azucar-promedio", name: "Gaseosa sin azúcar, promedio", unit: "Ml", kcal: 0, protein: 0, carbs: 0, fat: 0, category: "Otros", subcategory: "Gaseosas", source: SOURCES.SARA, sourceFood: "Gaseosa light promedio", suggested: 250, min: 100, max: 600, step: 50 },
  { key: "bebida-energizante", name: "Bebida energizante", unit: "Ml", kcal: 45, protein: 0, carbs: 11.2, fat: 0, category: "Otros", subcategory: "Bebidas energizantes", source: SOURCES.SARA, sourceFood: "Bebida energizante", suggested: 250, min: 100, max: 500, step: 50 },
  { key: "bebida-isotonica", name: "Bebida deportiva isotónica", unit: "Ml", kcal: 26, protein: 0, carbs: 6.5, fat: 0, category: "Otros", subcategory: "Bebidas deportivas", source: SOURCES.SARA, sourceFood: "Promedio Gatorade/Powerade", suggested: 500, min: 100, max: 1000, step: 50 },
  { key: "bebida-isotonica-zero", name: "Bebida deportiva isotónica sin azúcar", unit: "Ml", kcal: 0, protein: 0, carbs: 0, fat: 0, category: "Otros", subcategory: "Bebidas deportivas", source: SOURCES.SARA, sourceFood: "Bebida deportiva zero", suggested: 500, min: 100, max: 1000, step: 50 },
  { key: "agua-saborizada-azucar", name: "Agua saborizada con azúcar", unit: "Ml", kcal: 21, protein: 0, carbs: 5.3, fat: 0, category: "Otros", subcategory: "Aguas saborizadas", source: SOURCES.SARA, sourceFood: "Agua saborizada con azúcar promedio", suggested: 500, min: 100, max: 1000, step: 50 },
  { key: "agua-saborizada-light", name: "Agua saborizada light", unit: "Ml", kcal: 1, protein: 0, carbs: 0.3, fat: 0, category: "Otros", subcategory: "Aguas saborizadas", source: SOURCES.SARA, sourceFood: "Agua saborizada light promedio", suggested: 500, min: 100, max: 1000, step: 50 },
  { key: "agua-mineral", name: "Agua mineral", unit: "Ml", kcal: 0, protein: 0, carbs: 0, fat: 0, category: "Otros", subcategory: "Agua", source: SOURCES.SARA, sourceFood: "Agua", suggested: 500, min: 100, max: 1500, step: 50 },
  { key: "agua-con-gas", name: "Agua con gas", unit: "Ml", kcal: 0, protein: 0, carbs: 0, fat: 0, category: "Otros", subcategory: "Agua", source: SOURCES.SARA, sourceFood: "Agua carbonatada", suggested: 500, min: 100, max: 1500, step: 50 },

  // Alcoholes. La energía incluye alcohol; no se intenta cerrarla sólo con P/C/G.
  { key: "cerveza-light", name: "Cerveza light", unit: "Ml", kcal: 29, protein: 0.24, carbs: 1.64, fat: 0, alcohol: 3.1, category: "Otros", subcategory: "Bebidas alcohólicas", source: SOURCES.USDA, sourceFood: "Alcoholic beverage, beer, light", suggested: 355, min: 100, max: 710, step: 25 },
  { key: "cerveza-sin-alcohol", name: "Cerveza sin alcohol", unit: "Ml", kcal: 25, protein: 0.4, carbs: 5.4, fat: 0, alcohol: 0.33, category: "Otros", subcategory: "Bebidas alcohólicas", source: SOURCES.SARA, sourceFood: "Cerveza sin alcohol", suggested: 355, min: 100, max: 710, step: 25 },
  { key: "cerveza-alta-graduacion", name: "Cerveza de alta graduación", unit: "Ml", kcal: 58, protein: 0.9, carbs: 0.27, fat: 0, alcohol: 7.7, category: "Otros", subcategory: "Bebidas alcohólicas", source: SOURCES.USDA, sourceFood: "Alcoholic beverage, beer, higher alcohol", suggested: 355, min: 100, max: 710, step: 25 },
  { key: "heineken-original", name: "Heineken Original", unit: "Ml", kcal: 42, protein: 0, carbs: 3.2, fat: 0, alcohol: 3.95, category: "Otros", subcategory: "Bebidas alcohólicas", source: SOURCES.HEINEKEN, sourceFood: "Heineken Original Argentina", suggested: 330, min: 100, max: 660, step: 10 },
  { key: "vino-blanco", name: "Vino blanco", unit: "Ml", kcal: 83, protein: 0.1, carbs: 2.6, fat: 0, alcohol: 10.3, category: "Otros", subcategory: "Bebidas alcohólicas", source: SOURCES.SARA, sourceFood: "Vino blanco", suggested: 150, min: 50, max: 300, step: 25 },
  { key: "vino-rosado", name: "Vino rosado", unit: "Ml", kcal: 83, protein: 0.36, carbs: 3.8, fat: 0, alcohol: 9.6, category: "Otros", subcategory: "Bebidas alcohólicas", source: SOURCES.USDA, sourceFood: "Alcoholic beverage, wine, table, rose", suggested: 150, min: 50, max: 300, step: 25 },
  { key: "champagne", name: "Champagne / vino espumante seco", unit: "Ml", kcal: 83, protein: 0.1, carbs: 2.6, fat: 0, alcohol: 10.3, category: "Otros", subcategory: "Bebidas alcohólicas", source: SOURCES.SARA, sourceFood: "Champagne", suggested: 150, min: 50, max: 300, step: 25 },
  { key: "espumante-dulce-frizze", name: "Vino espumante dulce tipo Frizze", unit: "Ml", kcal: 66, protein: 0, carbs: 5, fat: 0, alcohol: 6.5, category: "Otros", subcategory: "Bebidas alcohólicas", source: SOURCES.SARA, sourceFood: "Vino espumante Frizze", suggested: 200, min: 50, max: 500, step: 25 },
  { key: "fernet", name: "Fernet", unit: "Ml", kcal: 280, protein: 0, carbs: 0, fat: 0, alcohol: 40, category: "Otros", subcategory: "Bebidas alcohólicas", source: SOURCES.SARA, sourceFood: "Fernet", suggested: 50, min: 25, max: 150, step: 25 },
  { key: "fernet-cola-70-30", name: "Fernet con Coca-Cola (70/30)", unit: "Ml", kcal: 105, protein: 0, carbs: 5.25, fat: 0, alcohol: 12, category: "Otros", subcategory: "Tragos", source: SOURCES.SARA, sourceFood: "Cálculo: 30% fernet SARA + 70% Coca-Cola Argentina", suggested: 250, min: 100, max: 500, step: 25 },
  { key: "fernet-cola-zero-70-30", name: "Fernet con Coca-Cola Sin Azúcar (70/30)", unit: "Ml", kcal: 84, protein: 0, carbs: 0, fat: 0, alcohol: 12, category: "Otros", subcategory: "Tragos", source: SOURCES.SARA, sourceFood: "Cálculo: 30% fernet SARA + 70% Coca-Cola Sin Azúcar", suggested: 250, min: 100, max: 500, step: 25 },
  { key: "vodka", name: "Vodka", unit: "Ml", kcal: 298, protein: 0, carbs: 0, fat: 0, alcohol: 42.5, category: "Otros", subcategory: "Bebidas alcohólicas", source: SOURCES.SARA, sourceFood: "Vodka", suggested: 50, min: 25, max: 150, step: 25 },
  { key: "gin", name: "Gin", unit: "Ml", kcal: 231, protein: 0, carbs: 0, fat: 0, alcohol: 33.4, category: "Otros", subcategory: "Bebidas alcohólicas", source: SOURCES.USDA, sourceFood: "Alcoholic beverage, distilled, all (gin, rum, vodka, whiskey), 80 proof", suggested: 50, min: 25, max: 150, step: 25 },
  { key: "ron", name: "Ron", unit: "Ml", kcal: 231, protein: 0, carbs: 0, fat: 0, alcohol: 33.4, category: "Otros", subcategory: "Bebidas alcohólicas", source: SOURCES.USDA, sourceFood: "Alcoholic beverage, distilled, all (gin, rum, vodka, whiskey), 80 proof", suggested: 50, min: 25, max: 150, step: 25 },
  { key: "whisky", name: "Whisky", unit: "Ml", kcal: 250, protein: 0, carbs: 0.1, fat: 0, alcohol: 36, category: "Otros", subcategory: "Bebidas alcohólicas", source: SOURCES.USDA, sourceFood: "Alcoholic beverage, distilled, whiskey, 86 proof", suggested: 50, min: 25, max: 150, step: 25 },
  { key: "aperitivo-gancia", name: "Aperitivo tipo Gancia", unit: "Ml", kcal: 163, protein: 0.2, carbs: 13.7, fat: 0, alcohol: 15.3, category: "Otros", subcategory: "Bebidas alcohólicas", source: SOURCES.SARA, sourceFood: "Aperitivo tipo Gancia", suggested: 100, min: 25, max: 250, step: 25 },
  { key: "sidra", name: "Sidra", unit: "Ml", kcal: 43, protein: 0, carbs: 4.3, fat: 0, alcohol: 3.7, category: "Otros", subcategory: "Bebidas alcohólicas", source: SOURCES.SARA, sourceFood: "Sidra", suggested: 200, min: 50, max: 500, step: 25 },
];

function categoryFields(category, subcategory) {
  return {
    Categoria: category,
    categoria: category,
    categoriaZumaFit: category,
    Fuente: category,
    fuente: category,
    subcategoria: subcategory,
    subcategoriaZumaFit: subcategory,
  };
}

function nameFields(name, unit) {
  return {
    Alimentos: name,
    Alimentosss: compact(name),
    name,
    nombre: name,
    nombreKey: fold(name),
    claveNormalizada: `${fold(name)}|${fold(unit)}`,
  };
}

function unitNameFields(unit) {
  return { Unidad: unit, unidad: unit, unidadBase: unit };
}

function buildNewDocument(spec, alimentoId) {
  const suggested = spec.suggested ?? 100;
  const category = spec.category;
  const protein = category === "Proteínas";
  const isYogurt = spec.subcategory === "Yogures";
  const readyToEatProtein = isYogurt || spec.name.toLowerCase().includes("enlatad");
  const generation = spec.generation || explicitOnly();
  const source = sourceNote(spec.source, spec.sourceFood, spec.notes);
  return {
    alimentoId,
    migrationKey: `${migrationId}:${spec.key}`,
    Nombres: `Migracion${alimentoId}`,
    Numeracion: alimentoId,
    ...nameFields(spec.name, spec.unit),
    ...unitNameFields(spec.unit),
    ...categoryFields(category, spec.subcategory),
    Compo: category,
    Composicion2: spec.subcategory,
    grupoOriginal: "Migración nutricional 2026-10-26",
    codigoOriginal: `MIG-${alimentoId}`,
    macroOriginal: category,
    ...per100Fields(spec, suggested),
    porcionMin: spec.min,
    porcionMax: spec.max,
    porcionSugerida: suggested,
    multiplo: spec.step,
    activo: true,
    requiereRevision: false,
    motivoRevision: "",
    observaciones: `Valor genérico de referencia. ${source.sourceFood}.`,
    estado: protein && !readyToEatProtein ? "Crudo / a cocinar" : "Listo para consumir",
    requiereCoccion: protein && !readyToEatProtein,
    prioridad: protein ? "Alta" : "Media",
    saciedad: protein ? "Alta" : "Baja",
    digestibilidad: "Media",
    costoEstimado: "Medio",
    alergenos: spec.allergens || [],
    aptoSinGluten: true,
    aptoSinLactosa: !isYogurt,
    aptoVegano: !protein,
    aptoVegetariano: !protein || isYogurt,
    aptoDesayuno: generation.mealTypes.breakfast,
    aptoAlmuerzo: generation.mealTypes.lunch,
    aptoMerienda: generation.mealTypes.snack,
    aptoCena: generation.mealTypes.dinner,
    aptoPreEntreno: false,
    aptoPostEntreno: false,
    esProteinaPrincipal: generation.roles.P1,
    esCarboPrincipal: false,
    esGrasaPrincipal: false,
    esVegetalLibre: false,
    tags: [category, spec.subcategory, "referencia genérica"],
    generation,
    referenciaNutricional: source,
    createdAt: now,
    updatedAt: now,
  };
}

function updateSetFromSpec(doc, spec) {
  const suggested = spec.suggested ?? doc.porcionSugerida ?? 100;
  const unit = spec.unit || doc.Unidad || doc.unidad || "Grs";
  const name = spec.name || doc.Alimentos || doc.nombre;
  const set = {
    ...nameFields(name, unit),
    ...unitNameFields(unit),
    ...per100Fields(spec, suggested),
    porcionSugerida: suggested,
    activo: true,
    requiereRevision: false,
    motivoRevision: "",
    referenciaNutricional: sourceNote(spec.source, spec.sourceFood, spec.notes),
    updatedAt: now,
  };
  if (spec.category) Object.assign(set, categoryFields(spec.category, spec.subcategory));
  if (spec.generation) set.generation = spec.generation;
  if (Number.isFinite(spec.min)) set.porcionMin = spec.min;
  if (Number.isFinite(spec.max)) set.porcionMax = spec.max;
  if (Number.isFinite(spec.step)) set.multiplo = spec.step;
  if (spec.disableMealFlags) {
    Object.assign(set, { aptoDesayuno: false, aptoAlmuerzo: false, aptoMerienda: false, aptoCena: false, aptoPreEntreno: false, aptoPostEntreno: false, esProteinaPrincipal: false, esCarboPrincipal: false, esGrasaPrincipal: false, esVegetalLibre: false });
  }
  return set;
}

function summarizeDoc(doc) {
  return {
    _id: String(doc._id),
    alimentoId: doc.alimentoId,
    name: doc.Alimentos || doc.nombre,
    unit: doc.Unidad || doc.unidad,
    kcal100: doc.kcal100,
    protein100: doc.proteina100,
    carbs100: doc.carbohidratos100,
    fat100: doc.grasas100,
    alcohol100: doc.alcohol100,
    category: doc.categoriaZumaFit || doc.Categoria,
    subcategory: doc.subcategoriaZumaFit || doc.subcategoria,
    active: doc.activo,
    review: doc.requiereRevision,
    generation: doc.generation?.mode,
    migrationKey: doc.migrationKey,
  };
}

function markdownReport({ beforeCount, afterCount, updated, inserted, warnings, verification }) {
  const rows = verification
    .map((item) => `| ${item.alimentoId} | ${item.name} | ${item.unit} | ${item.kcal100 ?? "—"} | ${item.protein100 ?? "—"} | ${item.carbs100 ?? "—"} | ${item.fat100 ?? "—"} | ${item.generation || "—"} |`)
    .join("\n");
  return `# Corrección y ampliación del catálogo de alimentos

Fecha: ${now.toISOString()}

- Modo ejecutado: **${APPLY ? "APLICADO" : "SIMULACIÓN"}**
- Base/colección: \`${config.BASE}/${collectionName}\`
- Documentos antes: ${beforeCount}
- Documentos después: ${afterCount}
- Documentos actualizados: ${updated}
- Documentos insertados: ${inserted}
- Advertencias de precondición: ${warnings.length}

## Criterios

- SARA 2 Argentina fue la referencia primaria para alimentos genéricos locales.
- USDA se usó sólo donde SARA no ofrece suficiente desagregación.
- Coca-Cola, Sprite, Fanta y Heineken se tomaron de sus rótulos oficiales argentinos vigentes.
- Los valores de cerveza, vino y destilados incluyen energía del alcohol. Por eso no deben validarse únicamente con la fórmula 4/4/9 de proteínas, carbohidratos y grasas.
- Bebidas alcohólicas, gaseosas y productos de marca quedaron fuera de la generación automática.
- El registro ambiguo \`Mariscos\` quedó inactivo; se conservan o agregan especies concretas.

## Verificación de documentos tocados

| ID | Alimento | Unidad | kcal/100 | P/100 | C/100 | G/100 | Generación |
|---:|---|---|---:|---:|---:|---:|---|
${rows}

## Advertencias

${warnings.length ? warnings.map((warning) => `- ${warning}`).join("\n") : "- Ninguna."}
`;
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  const client = new MongoClient(config.STRCNX);
  await client.connect();
  try {
    const collection = client.db(config.BASE).collection(collectionName);
    const updateIds = [...nutritionUpdates.map((item) => item.id), ...orangeUpdates.map((item) => item.id), ...structuralUpdates.map((item) => item.id), ...brandedYogurtIds];
    const beforeCount = await collection.countDocuments({});
    const existing = await collection.find({ alimentoId: { $in: updateIds } }).toArray();
    const byId = new Map(existing.map((doc) => [doc.alimentoId, doc]));
    const warnings = [];

    for (const item of [...nutritionUpdates, ...orangeUpdates, ...structuralUpdates]) {
      const doc = byId.get(item.id);
      if (!doc) {
        warnings.push(`No existe alimentoId ${item.id} (${item.expected}).`);
        continue;
      }
      const actual = doc.Alimentos || doc.nombre || "";
      const acceptedNames = [item.expected, item.name].filter(Boolean).map(fold);
      if (!acceptedNames.includes(fold(actual))) warnings.push(`Precondición fallida en ${item.id}: se esperaba '${item.expected}' y se encontró '${actual}'.`);
    }

    const missingYogurts = brandedYogurtIds.filter((id) => !byId.has(id));
    if (missingYogurts.length) warnings.push(`No se encontraron yogures de marca: ${missingYogurts.join(", ")}.`);
    if (warnings.length) throw new Error(`Se canceló por precondiciones: ${warnings.join(" ")}`);

    const existingMigrationDocs = await collection.find({ migrationKey: { $regex: `^${migrationId}:` } }).toArray();
    const existingMigrationByKey = new Map(existingMigrationDocs.map((doc) => [doc.migrationKey, doc]));
    const maxIdDoc = await collection.find({ alimentoId: { $type: "number" } }).sort({ alimentoId: -1 }).limit(1).next();
    let nextId = (maxIdDoc?.alimentoId || 0) + 1;

    const backup = {
      migrationId,
      capturedAt: now.toISOString(),
      database: config.BASE,
      collection: collectionName,
      count: beforeCount,
      updateTargets: existing,
      preexistingMigrationDocuments: existingMigrationDocs,
    };
    const snapshotPath = path.join(outputDir, "snapshot-before.json");
    if (!fs.existsSync(snapshotPath)) fs.writeFileSync(snapshotPath, JSON.stringify(backup, null, 2));

    const operations = [];
    for (const spec of nutritionUpdates) {
      const doc = byId.get(spec.id);
      operations.push({ updateOne: { filter: { _id: doc._id, alimentoId: spec.id }, update: { $set: updateSetFromSpec(doc, spec) } } });
    }

    const orangeBase = { kcal: 43, protein: 0.9, carbs: 9.4, fat: 0.1, fiber: 2.4 };
    for (const spec of orangeUpdates) {
      const doc = byId.get(spec.id);
      const set = {
        ...unitFields(orangeBase, spec.weight),
        activo: true,
        requiereRevision: false,
        motivoRevision: "",
        referenciaNutricional: sourceNote(SOURCES.SARA, "Naranja", `Peso comestible de referencia usado para la unidad: ${spec.weight} g.`),
        generation: genericFruit(),
        updatedAt: now,
      };
      operations.push({ updateOne: { filter: { _id: doc._id, alimentoId: spec.id }, update: { $set: set } } });
    }

    for (const spec of structuralUpdates) {
      const doc = byId.get(spec.id);
      operations.push({ updateOne: { filter: { _id: doc._id, alimentoId: spec.id }, update: { $set: { ...spec.set, updatedAt: now, auditoriaEstructural: { migrationId, checkedAt: now } } } } });
    }

    for (const id of brandedYogurtIds) {
      const doc = byId.get(id);
      operations.push({ updateOne: { filter: { _id: doc._id, alimentoId: id }, update: { $set: { generation: explicitOnly(), motivoRevision: "Producto de marca/SKU: conservar el rótulo cargado y validar contra el envase vigente antes de cambiar macros.", auditoriaEstructural: { migrationId, checkedAt: now, decision: "EXPLICIT_ONLY" }, updatedAt: now } } } });
    }

    const plannedAdditions = [];
    for (const spec of additions) {
      const migrationKey = `${migrationId}:${spec.key}`;
      const existingDoc = existingMigrationByKey.get(migrationKey);
      const alimentoId = existingDoc?.alimentoId ?? nextId++;
      const document = buildNewDocument(spec, alimentoId);
      plannedAdditions.push(document);
      operations.push(existingDoc
        ? { replaceOne: { filter: { _id: existingDoc._id, migrationKey }, replacement: { ...document, _id: existingDoc._id, createdAt: existingDoc.createdAt || now } } }
        : { insertOne: { document } });
    }

    fs.writeFileSync(path.join(outputDir, "migration-plan.json"), JSON.stringify({ apply: APPLY, operations: operations.map((op) => Object.keys(op)[0]), nutritionUpdates, orangeUpdates, structuralUpdates, brandedYogurtIds, additions: plannedAdditions.map(summarizeDoc) }, null, 2));

    let result = { modifiedCount: 0, insertedCount: 0, matchedCount: 0, upsertedCount: 0 };
    if (APPLY) result = await collection.bulkWrite(operations, { ordered: true });

    const verificationIds = [...updateIds, ...plannedAdditions.map((item) => item.alimentoId)];
    const verified = APPLY
      ? await collection.find({ alimentoId: { $in: verificationIds } }).sort({ alimentoId: 1 }).toArray()
      : [...existing, ...plannedAdditions];
    const verification = verified.map(summarizeDoc);
    const afterCount = await collection.countDocuments({});

    const expectedCount = APPLY ? beforeCount + additions.filter((spec) => !existingMigrationByKey.has(`${migrationId}:${spec.key}`)).length : beforeCount;
    if (afterCount !== expectedCount) throw new Error(`Conteo inesperado: se esperaban ${expectedCount} y hay ${afterCount}.`);
    if (APPLY) {
      const missing = verificationIds.filter((id) => !verified.some((doc) => doc.alimentoId === id));
      if (missing.length) throw new Error(`Falló la verificación; faltan IDs: ${missing.join(", ")}.`);
    }

    const output = {
      migrationId,
      applied: APPLY,
      beforeCount,
      afterCount,
      matchedCount: result.matchedCount || 0,
      modifiedCount: result.modifiedCount || 0,
      insertedCount: result.insertedCount || 0,
      warnings,
      verification,
    };
    fs.writeFileSync(path.join(outputDir, APPLY ? "verification-after.json" : "dry-run.json"), JSON.stringify(output, null, 2));
    fs.writeFileSync(path.join(outputDir, APPLY ? "INFORME_CAMBIOS_APLICADOS.md" : "INFORME_SIMULACION.md"), markdownReport({ beforeCount, afterCount, updated: result.modifiedCount || operations.filter((op) => op.updateOne || op.replaceOne).length, inserted: result.insertedCount || operations.filter((op) => op.insertOne).length, warnings, verification }));
    console.log(JSON.stringify({ ...output, verification: undefined }, null, 2));
  } finally {
    await client.close();
  }
}

await main();
