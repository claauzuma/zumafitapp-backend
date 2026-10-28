import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { MongoClient } from "mongodb";
import config from "../config.js";

const APPLY = process.argv.includes("--apply");
const migrationId = "argentine-staples-2026-10-26";
const collectionName = "fooddatabase2";
const now = new Date();
const here = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(here, "..", "..", "..", "zumafitront", "artifacts", migrationId);

const SOURCES = {
  SARA: {
    name: "SARA 2 - Tabla de Composición Química de Alimentos (Argentina, 2022)",
    url: "https://cesni-biblioteca.org/archivos/tabla-composicion-quimica-alimentos-argentina_ennys2__.pdf",
  },
  USDA: {
    name: "USDA FoodData Central - Foundation/SR Legacy, descarga abril de 2026",
    url: "https://fdc.nal.usda.gov/download-datasets",
  },
  SALTENA_CRIOLLA: {
    name: "La Salteña Argentina - Tapas de empanadas criollas",
    url: "https://www.lasaltena.com.ar/productos/empanadas-criollas/",
  },
  SALTENA_HOJALDRE: {
    name: "La Salteña Argentina - Tapas de empanadas de hojaldre",
    url: "https://www.lasaltena.com.ar/productos/empanadas-de-hojaldre/",
  },
  SALTENA_FREIR: {
    name: "La Salteña Argentina - Tapas de empanadas para freír",
    url: "https://www.lasaltena.com.ar/productos/empanadas-para-freir/",
  },
  SALTENA_BALANCE: {
    name: "La Salteña Argentina - Tapas de empanadas Balance",
    url: "https://www.lasaltena.com.ar/productos/empanadas-balance/",
  },
  SALTENA_PASC_CRIOLLA: {
    name: "La Salteña Argentina - Pascualinas criollas",
    url: "https://www.lasaltena.com.ar/productos/pascualinas-criollas/",
  },
  SALTENA_PASC_HOJALDRE: {
    name: "La Salteña Argentina - Pascualinas hojaldradas",
    url: "https://www.lasaltena.com.ar/productos/pascualinas-hojaldradas/",
  },
  SALTENA_PASC_BALANCE: {
    name: "La Salteña Argentina - Pascualinas Balance",
    url: "https://www.lasaltena.com.ar/productos/pascualinas-balance/",
  },
  INTERNAL: {
    name: "Control interno contra el registro por feta del mismo producto",
    url: "",
  },
};

const emptyRoles = () => ({ P1: false, P2: false, C1: false, C2: false, V: false, F: false, G: false });
const explicitOnly = () => ({
  mode: "EXPLICIT_ONLY",
  roles: emptyRoles(),
  mealTypes: { breakfast: false, lunch: false, snack: false, dinner: false, extraSnack: false },
  portionRule: { unit: null, min: null, max: null, step: null, allowedValues: [] },
});
const generic = (role, meals) => ({
  mode: "GENERIC",
  roles: { ...emptyRoles(), [role]: true },
  mealTypes: {
    breakfast: meals.includes("breakfast"),
    lunch: meals.includes("lunch"),
    snack: meals.includes("snack"),
    dinner: meals.includes("dinner"),
    extraSnack: meals.includes("extraSnack"),
  },
  portionRule: { unit: null, min: null, max: null, step: null, allowedValues: [] },
});
const proteinMain = () => generic("P1", ["lunch", "dinner"]);
const proteinSecondary = () => generic("P2", ["breakfast", "snack", "extraSnack"]);
const fatSource = () => generic("G", ["breakfast", "lunch", "snack", "dinner", "extraSnack"]);
const fruitSource = () => generic("F", ["breakfast", "lunch", "snack", "dinner", "extraSnack"]);

function fold(value = "") {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, " ").toLowerCase().trim().replace(/\s+/g, " ");
}

function compact(value = "") {
  return fold(value).replace(/\s+/g, "");
}

function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function sourceNote(spec) {
  return {
    migrationId,
    checkedAt: now,
    source: spec.source.name,
    sourceUrl: spec.source.url,
    sourceFood: spec.sourceFood,
    state: spec.state || "según nombre",
    notes: spec.notes || "",
  };
}

function names(name, unit) {
  return {
    Alimentos: name,
    Alimentosss: compact(name),
    name,
    nombre: name,
    nombreKey: fold(name),
    claveNormalizada: `${fold(name)}|${fold(unit)}`,
  };
}

function units(unit) {
  return { Unidad: unit, unidad: unit, unidadBase: unit };
}

function categories(category, subcategory) {
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

function per100(spec, suggested = 100) {
  const factor = suggested / 100;
  const fiber = spec.fiber || 0;
  return {
    Cantidad: 1,
    cantidadUnidad: 1,
    Calorias: round(spec.kcal / 100), calorias: round(spec.kcal / 100), kcal: round(spec.kcal / 100), kcalUnidad: round(spec.kcal / 100),
    Proteinas: round(spec.protein / 100), proteinas: round(spec.protein / 100), proteina: round(spec.protein / 100), proteinaUnidad: round(spec.protein / 100),
    Carbohidratos: round(spec.carbs / 100), carbohidratos: round(spec.carbs / 100), carbohidratosUnidad: round(spec.carbs / 100),
    Grasas: round(spec.fat / 100), grasas: round(spec.fat / 100), grasasUnidad: round(spec.fat / 100),
    Fibra: round(fiber / 100), fibra: round(fiber / 100), fibraUnidad: round(fiber / 100),
    kcal100: spec.kcal, proteina100: spec.protein, carbohidratos100: spec.carbs, grasas100: spec.fat, fibra100: fiber,
    kcalPorcionSugerida: round(spec.kcal * factor, 2),
    proteinaPorcionSugerida: round(spec.protein * factor, 2),
    carbohidratosPorcionSugerida: round(spec.carbs * factor, 2),
    grasasPorcionSugerida: round(spec.fat * factor, 2),
    fibraPorcionSugerida: round(fiber * factor, 2),
    macroBasis: "perUnit",
  };
}

function perUnit(spec) {
  const weight = spec.weight;
  const kcal = spec.unitKcal ?? round(spec.kcal * weight / 100, 2);
  const protein = spec.unitProtein ?? round(spec.protein * weight / 100, 2);
  const carbs = spec.unitCarbs ?? round(spec.carbs * weight / 100, 2);
  const fat = spec.unitFat ?? round(spec.fat * weight / 100, 2);
  const fiber = spec.unitFiber ?? round((spec.fiber || 0) * weight / 100, 2);
  return {
    Cantidad: 1, cantidadUnidad: 1,
    Calorias: kcal, calorias: kcal, kcal, kcalUnidad: kcal,
    Proteinas: protein, proteinas: protein, proteina: protein, proteinaUnidad: protein,
    Carbohidratos: carbs, carbohidratos: carbs, carbohidratosUnidad: carbs,
    Grasas: fat, grasas: fat, grasasUnidad: fat,
    Fibra: fiber, fibra: fiber, fibraUnidad: fiber,
    kcal100: spec.kcal, proteina100: spec.protein, carbohidratos100: spec.carbs, grasas100: spec.fat, fibra100: spec.fiber || 0,
    kcalPorcionSugerida: kcal, proteinaPorcionSugerida: protein, carbohidratosPorcionSugerida: carbs, grasasPorcionSugerida: fat, fibraPorcionSugerida: fiber,
    pesoUnidadGramos: weight,
    macroBasis: "perUnit",
  };
}

const nutritionUpdates = [
  { id: 1, expected: "Aceite de coco", kcal: 900, protein: 0, carbs: 0, fat: 100, source: SOURCES.SARA, sourceFood: "Aceite de coco" },
  { id: 2, expected: "Aceite de oliva", kcal: 900, protein: 0, carbs: 0, fat: 100, source: SOURCES.SARA, sourceFood: "Aceite de oliva" },
  { id: 48, expected: "Avellanas", kcal: 631, protein: 12.7, carbs: 8, fat: 60.9, source: SOURCES.SARA, sourceFood: "Avellana" },
  { id: 73, expected: "Bondiola (Lario)", kcal: 281, protein: 23, carbs: 0, fat: 21, source: SOURCES.INTERNAL, sourceFood: "Bondiola Lario por feta (alimentoId 74)", notes: "Se corrige un error x10. La equivalencia por 100 g presupone una feta de 10 g; validar contra el rótulo vigente.", review: true, category: "Fiambres", subcategory: "Fiambres", generation: explicitOnly() },
  { id: 96, expected: "Castañas de caju", name: "Castañas de cajú", kcal: 565, protein: 17.4, carbs: 36.3, fat: 38.9, source: SOURCES.USDA, sourceFood: "Nuts, cashew nuts, raw; Foundation fdcId 2515374", notes: "USDA informa carbohidratos totales." },
  { id: 148, expected: "Durazno", kcal: 45, protein: 0.5, carbs: 10.5, fat: 0.1, source: SOURCES.SARA, sourceFood: "Durazno" },
  { id: 228, expected: "Jamon cocido", name: "Jamón cocido", kcal: 107, protein: 18.4, carbs: 1, fat: 3.3, source: SOURCES.SARA, sourceFood: "Jamón cocido", category: "Fiambres", subcategory: "Fiambres", generation: proteinSecondary() },
  { id: 233, expected: "Jamon crudo", name: "Jamón crudo", kcal: 319, protein: 28.8, carbs: 0.2, fat: 22.6, source: SOURCES.SARA, sourceFood: "Jamón crudo", category: "Fiambres", subcategory: "Fiambres", generation: proteinSecondary() },
  { id: 292, expected: "Masa prepizza", kcal: 241, protein: 6.9, carbs: 45.9, fat: 3.3, source: SOURCES.SARA, sourceFood: "Masa de prepizza de panadería o envasada", generation: explicitOnly() },
  { id: 336, expected: "Mortadela", kcal: 306, protein: 16.4, carbs: 3.1, fat: 25.4, source: SOURCES.SARA, sourceFood: "Mortadela", category: "Fiambres", subcategory: "Fiambres", generation: proteinSecondary() },
  { id: 340, expected: "Mozzarella", name: "Queso muzzarella", kcal: 278, protein: 23.6, carbs: 2.4, fat: 19.3, source: SOURCES.SARA, sourceFood: "Queso Muzzarella", category: "Lácteos", subcategory: "Quesos", generation: proteinSecondary() },
  { id: 349, expected: "Nueces peladas", kcal: 690, protein: 13.9, carbs: 7, fat: 67.4, source: SOURCES.SARA, sourceFood: "Nuez" },
  { id: 388, expected: "Panceta", kcal: 389, protein: 13.7, carbs: 0, fat: 37.1, source: SOURCES.SARA, sourceFood: "Panceta", category: "Fiambres", subcategory: "Fiambres", generation: proteinSecondary() },
  { id: 415, expected: "Pistachos", kcal: 566, protein: 21.1, carbs: 17.3, fat: 45.8, source: SOURCES.SARA, sourceFood: "Pistacho salado" },
  { id: 431, expected: "Provoleta", name: "Queso provolone / provoleta", kcal: 350, protein: 25.6, carbs: 2.1, fat: 26.6, source: SOURCES.SARA, sourceFood: "Queso Provolone", category: "Lácteos", subcategory: "Quesos", generation: proteinSecondary() },
  { id: 439, expected: "Queso cheddar", kcal: 410, protein: 24.3, carbs: 2.1, fat: 33.8, source: SOURCES.SARA, sourceFood: "Queso Cheddar", generation: proteinSecondary() },
  { id: 441, expected: "Queso crema", kcal: 245, protein: 6.6, carbs: 3.9, fat: 22.6, source: SOURCES.SARA, sourceFood: "Queso crema entero, untable", generation: proteinSecondary() },
  { id: 456, expected: "Queso cremoso", kcal: 310, protein: 20.4, carbs: 2.5, fat: 24.3, source: SOURCES.SARA, sourceFood: "Queso Cremoso", generation: proteinSecondary() },
  { id: 480, expected: "Queso pategras", name: "Queso Pategrás", kcal: 332, protein: 25.4, carbs: 0, fat: 25.6, source: SOURCES.SARA, sourceFood: "Queso Pategrás", generation: proteinSecondary() },
  { id: 483, expected: "Queso sardo", kcal: 384, protein: 31.8, carbs: 3.6, fat: 26.9, source: SOURCES.SARA, sourceFood: "Queso Sardo", generation: proteinSecondary() },
  { id: 496, expected: "Ricota", kcal: 169, protein: 11.6, carbs: 4, fat: 11.8, source: SOURCES.SARA, sourceFood: "Ricotta", category: "Lácteos", subcategory: "Quesos", generation: proteinSecondary() },
  { id: 498, expected: "Salame", kcal: 372, protein: 21.1, carbs: 0.7, fat: 31.7, source: SOURCES.SARA, sourceFood: "Salame", category: "Fiambres", subcategory: "Fiambres", generation: proteinSecondary() },
  { id: 520, expected: "Semillas de calabaza", kcal: 581, protein: 30.2, carbs: 4.7, fat: 49.1, source: SOURCES.SARA, sourceFood: "Semilla de zapallo" },
  { id: 522, expected: "Semillas de chia", name: "Semillas de chía", kcal: 374, protein: 16.5, carbs: 7.7, fat: 30.7, source: SOURCES.SARA, sourceFood: "Semilla de chía", notes: "SARA usa carbohidratos disponibles; USDA suele publicar carbohidratos totales incluyendo fibra.", generation: fatSource() },
  { id: 526, expected: "Semillas de sesamo", name: "Semillas de sésamo", kcal: 565, protein: 17.7, carbs: 11.7, fat: 49.7, source: SOURCES.SARA, sourceFood: "Semilla de sésamo", generation: fatSource() },
  { id: 542, expected: "Tira de asado", kcal: 210, protein: 20, carbs: 0, fat: 14.4, source: SOURCES.SARA, sourceFood: "Vacuno, cortes grasos promedio, crudo", notes: "SARA incluye asado entre los cortes grasos.", category: "Proteínas", subcategory: "Carne vacuna", generation: proteinMain() },
];

const unitNutritionUpdates = [
  { id: 34, expected: "Almendras", weight: 1.2, kcal: 570, protein: 21.2, carbs: 9.1, fat: 49.9, source: SOURCES.SARA, sourceFood: "Almendra", generation: fatSource() },
  { id: 149, expected: "Durazno chico", weight: 130, kcal: 45, protein: 0.5, carbs: 10.5, fat: 0.1, source: SOURCES.SARA, sourceFood: "Durazno; peso comestible de referencia 130 g", generation: fruitSource() },
  { id: 150, expected: "Durazno grande", weight: 175, kcal: 45, protein: 0.5, carbs: 10.5, fat: 0.1, source: SOURCES.SARA, sourceFood: "Durazno; peso comestible de referencia 175 g", generation: fruitSource() },
  { id: 151, expected: "Durazno mediano", weight: 150, kcal: 45, protein: 0.5, carbs: 10.5, fat: 0.1, source: SOURCES.SARA, sourceFood: "Durazno; peso comestible de referencia 150 g", generation: fruitSource() },
  { id: 535, expected: "Tapa pascualina la salteña", name: "Pascualina criolla La Salteña", unit: "Tapa", weight: 200, kcal: 263.3333, protein: 6.6667, carbs: 40, fat: 8.6667, unitKcal: 526.67, unitProtein: 13.33, unitCarbs: 80, unitFat: 17.33, source: SOURCES.SALTENA_PASC_CRIOLLA, sourceFood: "Pascualinas Criollas, pack 400 g/2 tapas; rótulo por 30 g", generation: explicitOnly() },
  { id: 537, expected: "Tapas de empanadas la salteña", name: "Tapa de empanada criolla La Salteña", unit: "Tapa", weight: 28, kcal: 271.4286, protein: 5.7143, carbs: 42.8571, fat: 8.5714, unitKcal: 76, unitProtein: 1.6, unitCarbs: 12, unitFat: 2.4, source: SOURCES.SALTENA_CRIOLLA, sourceFood: "Empanadas Criollas, porción 1 tapa de 28 g", generation: explicitOnly() },
];

const structuralUpdates = [
  { id: 65, expected: "Bife de chorizo magro", set: { ...categories("Proteínas", "Carne vacuna"), esProteinaPrincipal: true, esGrasaPrincipal: false, generation: proteinMain() } },
  { id: 75, expected: "Bondiola de cerdo", set: { ...categories("Proteínas", "Cerdo"), esProteinaPrincipal: true, esGrasaPrincipal: false, generation: proteinMain() } },
  { id: 534, expected: "Tapa de asado", set: { ...categories("Proteínas", "Carne vacuna"), esProteinaPrincipal: true, esGrasaPrincipal: false, generation: proteinMain() } },
  { id: 497, expected: "Ricota magra", set: { ...categories("Lácteos", "Quesos"), generation: proteinSecondary() } },
  { id: 425, expected: "Porcion de prepizza", set: { generation: explicitOnly(), requiereRevision: true, motivoRevision: "La unidad 'Porc' no declara cuántos gramos contiene. Usar Masa prepizza por gramos para cálculos reproducibles." } },
  { id: 426, expected: "Porcion de prepizza", set: { generation: explicitOnly(), requiereRevision: true, motivoRevision: "Duplicado con unidad no estandarizada y sin peso. Usar Masa prepizza por gramos." } },
  { id: 430, expected: "Prepizza (Carrefour)", set: { generation: explicitOnly(), motivoRevision: "Producto de marca: validar el rótulo vigente y el peso de la porción." } },
];

const fruitUnitWeights = new Map([
  [52, 101], [53, 136], [54, 118], [240, 69],
  [277, 76], [278, 120], [279, 88], [288, 149], [289, 227], [290, 182],
  [409, 148], [410, 230], [411, 178],
]);

const brandedExplicitIds = [
  74, 76, 82, 226, 229, 230, 231, 232, 337, 338, 339, 440, 442, 443, 444, 445, 446, 447, 448,
  450, 451, 452, 453, 454, 455, 457, 459, 462, 463, 466, 467, 468, 471, 472, 473, 474, 475, 476, 477,
  478, 481, 482, 484, 485, 499, 500, 501, 502,
];

const additions = [
  // Cortes vacunos argentinos. SARA clasifica explícitamente estos cortes por grupos de grasa.
  { key: "nalga-magra-cruda", name: "Nalga magra, cruda", kcal: 138, protein: 22.2, carbs: 0, fat: 5.5, category: "Proteínas", subcategory: "Carne vacuna", source: SOURCES.SARA, sourceFood: "Cortes magros promedio: incluye nalga", state: "crudo", generation: proteinMain(), min: 80, max: 350, suggested: 150, step: 10 },
  { key: "tapa-nalga-magra-cruda", name: "Tapa de nalga magra, cruda", kcal: 138, protein: 22.2, carbs: 0, fat: 5.5, category: "Proteínas", subcategory: "Carne vacuna", source: SOURCES.SARA, sourceFood: "Referencia de cortes magros promedio (nalga)", state: "crudo", notes: "Valor representativo de grupo; el desgrasado visible modifica la grasa.", generation: proteinMain(), min: 80, max: 350, suggested: 150, step: 10 },
  { key: "lomo-vacuno-crudo", name: "Lomo vacuno, crudo", kcal: 176, protein: 21.3, carbs: 0, fat: 10.1, category: "Proteínas", subcategory: "Carne vacuna", source: SOURCES.SARA, sourceFood: "Cortes semigrasos promedio: incluye lomo", state: "crudo", generation: proteinMain(), min: 80, max: 350, suggested: 150, step: 10 },
  { key: "roast-beef-crudo", name: "Roast beef, crudo", kcal: 176, protein: 21.3, carbs: 0, fat: 10.1, category: "Proteínas", subcategory: "Carne vacuna", source: SOURCES.SARA, sourceFood: "Cortes semigrasos promedio: incluye roast beef", state: "crudo", generation: proteinMain(), min: 80, max: 350, suggested: 150, step: 10 },
  { key: "tortuguita-cruda", name: "Tortuguita, cruda", kcal: 176, protein: 21.3, carbs: 0, fat: 10.1, category: "Proteínas", subcategory: "Carne vacuna", source: SOURCES.SARA, sourceFood: "Cortes semigrasos promedio: incluye tortuguita", state: "crudo", generation: proteinMain(), min: 80, max: 350, suggested: 150, step: 10 },
  { key: "vacio-crudo", name: "Vacío vacuno, crudo", kcal: 210, protein: 20, carbs: 0, fat: 14.4, category: "Proteínas", subcategory: "Carne vacuna", source: SOURCES.SARA, sourceFood: "Cortes grasos promedio: incluye vacío", state: "crudo", generation: proteinMain(), min: 80, max: 350, suggested: 150, step: 10 },
  { key: "matambre-vacuno-crudo", name: "Matambre vacuno, crudo", kcal: 210, protein: 20, carbs: 0, fat: 14.4, category: "Proteínas", subcategory: "Carne vacuna", source: SOURCES.SARA, sourceFood: "Cortes grasos promedio: incluye matambre", state: "crudo", generation: proteinMain(), min: 80, max: 350, suggested: 150, step: 10 },
  { key: "aguja-vacuna-cruda", name: "Aguja vacuna, cruda", kcal: 210, protein: 20, carbs: 0, fat: 14.4, category: "Proteínas", subcategory: "Carne vacuna", source: SOURCES.SARA, sourceFood: "Cortes grasos promedio: incluye aguja", state: "crudo", generation: proteinMain(), min: 80, max: 350, suggested: 150, step: 10 },
  { key: "falda-vacuna-cruda", name: "Falda vacuna, cruda", kcal: 210, protein: 20, carbs: 0, fat: 14.4, category: "Proteínas", subcategory: "Carne vacuna", source: SOURCES.SARA, sourceFood: "Cortes grasos promedio: incluye falda", state: "crudo", generation: proteinMain(), min: 80, max: 350, suggested: 150, step: 10 },
  { key: "picada-comun-cruda", name: "Carne picada común, cruda", kcal: 210, protein: 20, carbs: 0, fat: 14.4, category: "Proteínas", subcategory: "Carne vacuna", source: SOURCES.SARA, sourceFood: "Cortes grasos promedio: incluye carne picada común", state: "crudo", generation: proteinMain(), min: 80, max: 350, suggested: 150, step: 10 },
  { key: "picada-especial-cruda", name: "Carne picada especial, cruda", kcal: 176, protein: 21.3, carbs: 0, fat: 10.1, category: "Proteínas", subcategory: "Carne vacuna", source: SOURCES.SARA, sourceFood: "Cortes semigrasos promedio: incluye carne picada especial", state: "crudo", generation: proteinMain(), min: 80, max: 350, suggested: 150, step: 10 },
  { key: "colita-cuadril-cruda", name: "Colita de cuadril, cruda", kcal: 165, protein: 20.6, carbs: 0, fat: 8.55, category: "Proteínas", subcategory: "Carne vacuna", source: SOURCES.USDA, sourceFood: "Beef bottom sirloin tri-tip roast, raw; SR Legacy fdcId 168734", state: "crudo", notes: "Equivalencia anatómica aproximada; puede variar según desgrasado.", generation: proteinMain(), min: 80, max: 350, suggested: 150, step: 10 },
  { key: "entrana-cruda", name: "Entraña vacuna, cruda", kcal: 187, protein: 20.4, carbs: 0, fat: 11.7, category: "Proteínas", subcategory: "Carne vacuna", source: SOURCES.USDA, sourceFood: "Beef inside skirt, lean and fat, raw; SR Legacy fdcId 172158", state: "crudo", notes: "Equivalencia con inside skirt; el recorte de grasa genera gran variación.", generation: proteinMain(), min: 80, max: 350, suggested: 150, step: 10 },
  { key: "ojo-bife-crudo", name: "Ojo de bife / bife ancho, crudo", kcal: 254, protein: 18.7, carbs: 0, fat: 20, category: "Proteínas", subcategory: "Carne vacuna", source: SOURCES.USDA, sourceFood: "Beef ribeye steak boneless choice raw; Foundation fdcId 2646172", state: "crudo", generation: proteinMain(), min: 80, max: 350, suggested: 150, step: 10 },
  { key: "osobuco-carne-cruda", name: "Osobuco, carne comestible cruda", kcal: 128, protein: 21.8, carbs: 0, fat: 3.85, category: "Proteínas", subcategory: "Carne vacuna", source: SOURCES.USDA, sourceFood: "Beef shank crosscuts, lean only, raw; SR Legacy fdcId 169441", state: "crudo", notes: "Valores de la porción comestible; el peso del hueso no está incluido.", generation: proteinMain(), min: 80, max: 350, suggested: 150, step: 10 },
  { key: "vacuno-magro-parrilla", name: "Carne vacuna magra, horno/parrilla", kcal: 198, protein: 29.5, carbs: 0, fat: 8.9, category: "Proteínas", subcategory: "Carne vacuna cocida", source: SOURCES.SARA, sourceFood: "Vacuno, cortes magros promedio, horno/parrilla", state: "cocido", generation: proteinMain(), min: 60, max: 300, suggested: 150, step: 10 },
  { key: "vacuno-semigraso-parrilla", name: "Carne vacuna semigrasa, horno/parrilla", kcal: 225, protein: 28.2, carbs: 0, fat: 12.5, category: "Proteínas", subcategory: "Carne vacuna cocida", source: SOURCES.SARA, sourceFood: "Vacuno, cortes semigrasos promedio, horno/parrilla", state: "cocido", generation: proteinMain(), min: 60, max: 300, suggested: 150, step: 10 },
  { key: "vacuno-graso-parrilla", name: "Carne vacuna grasa, horno/parrilla", kcal: 240, protein: 26.1, carbs: 0, fat: 15.1, category: "Proteínas", subcategory: "Carne vacuna cocida", source: SOURCES.SARA, sourceFood: "Vacuno, cortes grasos promedio, horno/parrilla", state: "cocido", generation: proteinMain(), min: 60, max: 300, suggested: 150, step: 10 },

  // Fiambres genéricos por gramos: las fetas quedan reservadas a rótulos concretos.
  { key: "bondiola-fiambre", name: "Bondiola (fiambre)", kcal: 264, protein: 16.5, carbs: 0, fat: 22, category: "Fiambres", subcategory: "Fiambres", source: SOURCES.SARA, sourceFood: "Bondiola (fiambre)", state: "listo", generation: proteinSecondary(), min: 10, max: 150, suggested: 40, step: 5 },
  { key: "matambre-fiambre", name: "Matambre (fiambre)", kcal: 176, protein: 21.3, carbs: 0, fat: 10.1, category: "Fiambres", subcategory: "Fiambres", source: SOURCES.SARA, sourceFood: "Matambre (fiambre)", state: "listo", generation: proteinSecondary(), min: 10, max: 150, suggested: 40, step: 5 },
  { key: "paleta-fiambre", name: "Paleta (fiambre)", kcal: 107, protein: 18.4, carbs: 1, fat: 3.3, category: "Fiambres", subcategory: "Fiambres", source: SOURCES.SARA, sourceFood: "Paleta (fiambre)", state: "listo", generation: proteinSecondary(), min: 10, max: 150, suggested: 40, step: 5 },
  { key: "pastron", name: "Pastrón", kcal: 141, protein: 21.8, carbs: 0.4, fat: 5.8, category: "Fiambres", subcategory: "Fiambres", source: SOURCES.SARA, sourceFood: "Pastrón", state: "listo", generation: proteinSecondary(), min: 10, max: 150, suggested: 40, step: 5 },
  { key: "cantimpalo", name: "Cantimpalo", kcal: 372, protein: 21.1, carbs: 0.7, fat: 31.7, category: "Fiambres", subcategory: "Fiambres", source: SOURCES.SARA, sourceFood: "Cantimpalo (fiambre)", state: "listo", generation: proteinSecondary(), min: 10, max: 150, suggested: 30, step: 5 },
  { key: "fiambre-cerdo", name: "Fiambre de cerdo", kcal: 155, protein: 16.6, carbs: 2.3, fat: 8.8, category: "Fiambres", subcategory: "Fiambres", source: SOURCES.SARA, sourceFood: "Fiambre de cerdo", state: "listo", generation: proteinSecondary(), min: 10, max: 150, suggested: 40, step: 5 },
  { key: "salchicha-viena", name: "Salchicha de Viena", kcal: 226, protein: 15.3, carbs: 2.6, fat: 17.2, category: "Fiambres", subcategory: "Salchichas", source: SOURCES.SARA, sourceFood: "Salchicha de viena", state: "listo", generation: proteinSecondary(), min: 20, max: 200, suggested: 50, step: 5 },
  { key: "salchicha-viena-light", name: "Salchicha de Viena light", kcal: 140, protein: 12, carbs: 1.6, fat: 9.5, category: "Fiambres", subcategory: "Salchichas", source: SOURCES.SARA, sourceFood: "Salchicha de viena light", state: "listo", generation: proteinSecondary(), min: 20, max: 200, suggested: 50, step: 5 },
  { key: "salchicha-parrillera-cruda", name: "Salchicha parrillera, cruda", kcal: 296, protein: 13.6, carbs: 3.8, fat: 25.1, category: "Fiambres", subcategory: "Salchichas", source: SOURCES.SARA, sourceFood: "Salchicha parrillera, cruda", state: "crudo", generation: proteinMain(), min: 50, max: 300, suggested: 100, step: 10 },

  // Quesos argentinos genéricos que faltaban.
  { key: "queso-azul", name: "Queso azul", kcal: 368, protein: 20, carbs: 2, fat: 31.1, category: "Lácteos", subcategory: "Quesos", source: SOURCES.SARA, sourceFood: "Queso Azul", state: "listo", generation: proteinSecondary(), min: 10, max: 100, suggested: 30, step: 5 },
  { key: "queso-blanco-descremado", name: "Queso blanco descremado, untable", kcal: 82, protein: 13.7, carbs: 6.1, fat: 0.3, category: "Lácteos", subcategory: "Quesos untables", source: SOURCES.SARA, sourceFood: "Queso blanco descremado, untable", state: "listo", generation: proteinSecondary(), min: 10, max: 150, suggested: 40, step: 5 },
  { key: "queso-cuartirolo", name: "Queso cuartirolo", kcal: 280, protein: 20.8, carbs: 1, fat: 21.4, category: "Lácteos", subcategory: "Quesos", source: SOURCES.SARA, sourceFood: "Queso Cuartirolo", state: "listo", generation: proteinSecondary(), min: 10, max: 100, suggested: 30, step: 5 },
  { key: "queso-maquina", name: "Queso de máquina", kcal: 356, protein: 24.9, carbs: 2.2, fat: 27.4, category: "Lácteos", subcategory: "Quesos", source: SOURCES.SARA, sourceFood: "Queso de máquina", state: "listo", generation: proteinSecondary(), min: 10, max: 100, suggested: 30, step: 5 },
  { key: "queso-parmesano", name: "Queso parmesano", kcal: 350, protein: 32.7, carbs: 0, fat: 24.4, category: "Lácteos", subcategory: "Quesos duros", source: SOURCES.SARA, sourceFood: "Queso Parmesano", state: "listo", generation: proteinSecondary(), min: 5, max: 80, suggested: 20, step: 5 },
  { key: "queso-pasta-blanda-descremado", name: "Queso de pasta blanda descremado", kcal: 207, protein: 27.4, carbs: 0.5, fat: 10.6, category: "Lácteos", subcategory: "Quesos", source: SOURCES.SARA, sourceFood: "Queso pasta blanda descremado", state: "listo", generation: proteinSecondary(), min: 10, max: 120, suggested: 40, step: 5 },
  { key: "queso-porsalut-light", name: "Queso Port Salut light sin sal", kcal: 225, protein: 26.3, carbs: 1, fat: 12.9, category: "Lácteos", subcategory: "Quesos", source: SOURCES.SARA, sourceFood: "Queso porsalut sin sal light", state: "listo", generation: proteinSecondary(), min: 10, max: 120, suggested: 40, step: 5 },
  { key: "queso-reggianito", name: "Queso reggianito", kcal: 381, protein: 35.8, carbs: 3.2, fat: 25, category: "Lácteos", subcategory: "Quesos duros", source: SOURCES.SARA, sourceFood: "Queso Reggianito", state: "listo", generation: proteinSecondary(), min: 5, max: 80, suggested: 20, step: 5 },
  { key: "queso-roquefort", name: "Queso roquefort", kcal: 370, protein: 21.5, carbs: 2, fat: 30.6, category: "Lácteos", subcategory: "Quesos", source: SOURCES.SARA, sourceFood: "Queso Roquefort", state: "listo", generation: proteinSecondary(), min: 5, max: 80, suggested: 20, step: 5 },
  { key: "queso-untable-promedio", name: "Queso untable, promedio", kcal: 208, protein: 7.9, carbs: 6.7, fat: 16.7, category: "Lácteos", subcategory: "Quesos untables", source: SOURCES.SARA, sourceFood: "Queso untable, promedio", state: "listo", generation: proteinSecondary(), min: 10, max: 150, suggested: 40, step: 5 },

  // Aceites. Se mantienen por gramos para respetar la base de SARA.
  { key: "aceite-mezcla", name: "Aceite comestible mezcla", kcal: 900, protein: 0, carbs: 0, fat: 100, category: "Grasas", subcategory: "Aceites", source: SOURCES.SARA, sourceFood: "Aceite comestible mezcla", state: "listo", generation: fatSource(), min: 2, max: 50, suggested: 10, step: 1 },
  { key: "aceite-canola", name: "Aceite de canola", kcal: 900, protein: 0, carbs: 0, fat: 100, category: "Grasas", subcategory: "Aceites", source: SOURCES.SARA, sourceFood: "Aceite de canola", state: "listo", generation: fatSource(), min: 2, max: 50, suggested: 10, step: 1 },
  { key: "aceite-girasol", name: "Aceite de girasol", kcal: 900, protein: 0, carbs: 0, fat: 100, category: "Grasas", subcategory: "Aceites", source: SOURCES.SARA, sourceFood: "Aceite de girasol", state: "listo", generation: fatSource(), min: 2, max: 50, suggested: 10, step: 1 },
  { key: "aceite-girasol-alto-oleico", name: "Aceite de girasol alto oleico", kcal: 900, protein: 0, carbs: 0, fat: 100, category: "Grasas", subcategory: "Aceites", source: SOURCES.SARA, sourceFood: "Aceite de girasol alto oleico", state: "listo", generation: fatSource(), min: 2, max: 50, suggested: 10, step: 1 },
  { key: "aceite-maiz", name: "Aceite de maíz", kcal: 900, protein: 0, carbs: 0, fat: 100, category: "Grasas", subcategory: "Aceites", source: SOURCES.SARA, sourceFood: "Aceite de maíz", state: "listo", generation: fatSource(), min: 2, max: 50, suggested: 10, step: 1 },
  { key: "aceite-sesamo", name: "Aceite de sésamo", kcal: 900, protein: 0, carbs: 0, fat: 100, category: "Grasas", subcategory: "Aceites", source: SOURCES.SARA, sourceFood: "Aceite de sésamo", state: "listo", generation: fatSource(), min: 2, max: 50, suggested: 10, step: 1 },
  { key: "aceite-soja", name: "Aceite de soja", kcal: 900, protein: 0, carbs: 0, fat: 100, category: "Grasas", subcategory: "Aceites", source: SOURCES.SARA, sourceFood: "Aceite de soja", state: "listo", generation: fatSource(), min: 2, max: 50, suggested: 10, step: 1 },
  { key: "aceite-uva", name: "Aceite de uva", kcal: 900, protein: 0, carbs: 0, fat: 100, category: "Grasas", subcategory: "Aceites", source: SOURCES.SARA, sourceFood: "Aceite de uva", state: "listo", generation: fatSource(), min: 2, max: 50, suggested: 10, step: 1 },
  { key: "aceite-oliva-cucharada", name: "Aceite de oliva, cucharada de 14 g", unit: "Cda", weight: 14, kcal: 900, protein: 0, carbs: 0, fat: 100, category: "Grasas", subcategory: "Aceites", source: SOURCES.SARA, sourceFood: "Aceite de oliva", state: "listo", generation: fatSource(), min: 1, max: 4, suggested: 1, step: 1 },
  { key: "aceite-girasol-cucharada", name: "Aceite de girasol, cucharada de 14 g", unit: "Cda", weight: 14, kcal: 900, protein: 0, carbs: 0, fat: 100, category: "Grasas", subcategory: "Aceites", source: SOURCES.SARA, sourceFood: "Aceite de girasol", state: "listo", generation: fatSource(), min: 1, max: 4, suggested: 1, step: 1 },

  // Tapas y masas. Las de marca usan la unidad declarada; las genéricas se cargan por gramos.
  { key: "empanada-hojaldre-saltena", name: "Tapa de empanada hojaldrada La Salteña", unit: "Tapa", weight: 28, kcal: 271.4286, protein: 5.7143, carbs: 42.8571, fat: 8.5714, unitKcal: 76, unitProtein: 1.6, unitCarbs: 12, unitFat: 2.4, category: "Carbohidratos", subcategory: "Tapas de empanada", source: SOURCES.SALTENA_HOJALDRE, sourceFood: "Empanadas de Hojaldre, una tapa de 28 g", state: "crudo", generation: explicitOnly(), min: 1, max: 8, suggested: 1, step: 1 },
  { key: "empanada-freir-saltena", name: "Tapa de empanada para freír La Salteña", unit: "Tapa", weight: 28, kcal: 267.8571, protein: 5.7143, carbs: 42.8571, fat: 8.5714, unitKcal: 75, unitProtein: 1.6, unitCarbs: 12, unitFat: 2.4, category: "Carbohidratos", subcategory: "Tapas de empanada", source: SOURCES.SALTENA_FREIR, sourceFood: "Empanadas Para Freír, una tapa de 28 g", state: "crudo", generation: explicitOnly(), min: 1, max: 8, suggested: 1, step: 1 },
  { key: "empanada-balance-saltena", name: "Tapa de empanada Balance La Salteña", unit: "Tapa", weight: 30, kcal: 256.6667, protein: 6.3333, carbs: 46.6667, fat: 5, unitKcal: 77, unitProtein: 1.9, unitCarbs: 14, unitFat: 1.5, category: "Carbohidratos", subcategory: "Tapas de empanada", source: SOURCES.SALTENA_BALANCE, sourceFood: "Empanadas Balance, una tapa de 30 g", state: "crudo", generation: explicitOnly(), min: 1, max: 8, suggested: 1, step: 1 },
  { key: "pascualina-hojaldre-saltena", name: "Pascualina hojaldrada La Salteña", unit: "Tapa", weight: 200, kcal: 263.3333, protein: 6.6667, carbs: 40, fat: 8.6667, unitKcal: 526.67, unitProtein: 13.33, unitCarbs: 80, unitFat: 17.33, category: "Carbohidratos", subcategory: "Tapas de tarta", source: SOURCES.SALTENA_PASC_HOJALDRE, sourceFood: "Pascualinas Hojaldradas, pack 400 g/2 tapas; rótulo por 30 g", state: "crudo", generation: explicitOnly(), min: 1, max: 2, suggested: 1, step: 1 },
  { key: "pascualina-balance-saltena", name: "Pascualina Balance La Salteña", unit: "Tapa", weight: 200, kcal: 273.3333, protein: 6.6667, carbs: 50, fat: 5.3333, unitKcal: 546.67, unitProtein: 13.33, unitCarbs: 100, unitFat: 10.67, category: "Carbohidratos", subcategory: "Tapas de tarta", source: SOURCES.SALTENA_PASC_BALANCE, sourceFood: "Pascualinas Balance, pack 400 g/2 tapas; rótulo por 30 g", state: "crudo", generation: explicitOnly(), min: 1, max: 2, suggested: 1, step: 1 },
  { key: "masa-tarta-empanada", name: "Masa de tarta o empanada, genérica", kcal: 337, protein: 6.7, carbs: 47.6, fat: 13.3, category: "Carbohidratos", subcategory: "Masas", source: SOURCES.SARA, sourceFood: "Masa de tarta o empanadas", state: "crudo", generation: explicitOnly(), min: 20, max: 250, suggested: 30, step: 5 },
  { key: "masa-tarta-empanada-integral", name: "Masa de tarta o empanada integral", kcal: 325, protein: 7, carbs: 46.6, fat: 12.3, category: "Carbohidratos", subcategory: "Masas", source: SOURCES.SARA, sourceFood: "Masa de tarta o empanada, integral", state: "crudo", generation: explicitOnly(), min: 20, max: 250, suggested: 30, step: 5 },
  { key: "masa-tarta-empanada-light", name: "Masa de tarta o empanada light", kcal: 268, protein: 6.7, carbs: 47.6, fat: 5.6, category: "Carbohidratos", subcategory: "Masas", source: SOURCES.SARA, sourceFood: "Masa de tarta o empanadas light", state: "crudo", generation: explicitOnly(), min: 20, max: 250, suggested: 30, step: 5 },
  { key: "masa-tarta-sin-tacc", name: "Masa de tarta sin TACC", kcal: 283, protein: 2.7, carbs: 47, fat: 9.3, category: "Carbohidratos", subcategory: "Masas", source: SOURCES.SARA, sourceFood: "Masa de tarta, SIN TACC", state: "crudo", generation: explicitOnly(), min: 20, max: 250, suggested: 30, step: 5, glutenFree: true },
];

function updateFromSpec(doc, spec, isUnit = false) {
  const unit = spec.unit || doc.Unidad || doc.unidad || "Grs";
  const name = spec.name || doc.Alimentos || doc.nombre;
  const suggested = spec.suggested ?? doc.porcionSugerida ?? 100;
  const set = {
    ...names(name, unit),
    ...units(unit),
    ...(isUnit ? perUnit(spec) : per100(spec, suggested)),
    referenciaNutricional: sourceNote(spec),
    activo: true,
    requiereRevision: spec.review === true,
    motivoRevision: spec.review ? spec.notes : "",
    updatedAt: now,
  };
  if (spec.category) Object.assign(set, categories(spec.category, spec.subcategory));
  if (spec.generation) set.generation = spec.generation;
  return set;
}

function buildDocument(spec, alimentoId) {
  const unit = spec.unit || "Grs";
  const suggested = spec.suggested ?? 100;
  const isUnit = unit !== "Grs" && unit !== "Ml";
  const generation = spec.generation || explicitOnly();
  const isRaw = spec.state === "crudo";
  return {
    alimentoId,
    migrationKey: `${migrationId}:${spec.key}`,
    Nombres: `Migracion${alimentoId}`,
    Numeracion: alimentoId,
    codigoOriginal: `MIG-${alimentoId}`,
    grupoOriginal: "Ampliación argentina 2026-10-26",
    ...names(spec.name, unit),
    ...units(unit),
    ...categories(spec.category, spec.subcategory),
    Compo: spec.category,
    Composicion2: spec.subcategory,
    ...(isUnit ? perUnit(spec) : per100(spec, suggested)),
    porcionMin: spec.min,
    porcionMax: spec.max,
    porcionSugerida: suggested,
    multiplo: spec.step,
    activo: true,
    requiereRevision: false,
    motivoRevision: "",
    estado: isRaw ? "Crudo / a cocinar" : "Listo para consumir",
    requiereCoccion: isRaw,
    observaciones: `Referencia ${spec.sourceFood}. ${spec.notes || ""}`.trim(),
    alergenos: spec.category === "Lácteos" ? ["Lácteos"] : (spec.subcategory?.includes("Tapas") || spec.subcategory === "Masas" ? (spec.glutenFree ? [] : ["Gluten", "Soja"]) : []),
    aptoSinGluten: spec.glutenFree === true || !(spec.subcategory?.includes("Tapas") || spec.subcategory === "Masas"),
    aptoSinLactosa: spec.category !== "Lácteos",
    aptoVegano: ["Grasas", "Carbohidratos"].includes(spec.category),
    aptoVegetariano: !["Proteínas", "Fiambres"].includes(spec.category),
    aptoDesayuno: generation.mealTypes.breakfast,
    aptoAlmuerzo: generation.mealTypes.lunch,
    aptoMerienda: generation.mealTypes.snack,
    aptoCena: generation.mealTypes.dinner,
    aptoPreEntreno: false,
    aptoPostEntreno: false,
    esProteinaPrincipal: generation.roles.P1,
    esCarboPrincipal: generation.roles.C1,
    esGrasaPrincipal: generation.roles.G,
    esVegetalLibre: false,
    tags: [spec.category, spec.subcategory, "Argentina", "referencia verificada"],
    generation,
    referenciaNutricional: sourceNote(spec),
    createdAt: now,
    updatedAt: now,
  };
}

function summary(doc) {
  return {
    alimentoId: doc.alimentoId,
    name: doc.Alimentos,
    unit: doc.Unidad,
    weight: doc.pesoUnidadGramos,
    kcal100: doc.kcal100,
    protein100: doc.proteina100,
    carbs100: doc.carbohidratos100,
    fat100: doc.grasas100,
    kcalUnit: doc.Calorias,
    category: doc.categoriaZumaFit,
    active: doc.activo,
    review: doc.requiereRevision,
    generation: doc.generation?.mode,
    migrationKey: doc.migrationKey,
  };
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  const client = new MongoClient(config.STRCNX);
  await client.connect();
  try {
    const collection = client.db(config.BASE).collection(collectionName);
    const ids = [...new Set([
      ...nutritionUpdates.map((item) => item.id),
      ...unitNutritionUpdates.map((item) => item.id),
      ...structuralUpdates.map((item) => item.id),
      ...fruitUnitWeights.keys(),
      ...brandedExplicitIds,
    ])];
    const beforeCount = await collection.countDocuments({});
    const targets = await collection.find({ alimentoId: { $in: ids } }).toArray();
    const byId = new Map(targets.map((doc) => [doc.alimentoId, doc]));
    const warnings = [];
    for (const item of [...nutritionUpdates, ...unitNutritionUpdates, ...structuralUpdates]) {
      const doc = byId.get(item.id);
      if (!doc) warnings.push(`Falta alimentoId ${item.id} (${item.expected}).`);
      else if (fold(doc.Alimentos) !== fold(item.expected) && (!item.name || fold(doc.Alimentos) !== fold(item.name))) warnings.push(`ID ${item.id}: se esperaba '${item.expected}' y existe '${doc.Alimentos}'.`);
    }
    for (const id of [...fruitUnitWeights.keys(), ...brandedExplicitIds]) if (!byId.has(id)) warnings.push(`Falta alimentoId ${id}.`);
    if (warnings.length) throw new Error(`Precondiciones fallidas: ${warnings.join(" ")}`);

    const migrationDocs = await collection.find({ migrationKey: { $regex: `^${migrationId}:` } }).toArray();
    const migrationByKey = new Map(migrationDocs.map((doc) => [doc.migrationKey, doc]));
    const maxDoc = await collection.find({ alimentoId: { $type: "number" } }).sort({ alimentoId: -1 }).limit(1).next();
    let nextId = (maxDoc?.alimentoId || 0) + 1;

    const snapshotPath = path.join(outputDir, "snapshot-before.json");
    if (!fs.existsSync(snapshotPath)) fs.writeFileSync(snapshotPath, JSON.stringify({ migrationId, capturedAt: now, database: config.BASE, collection: collectionName, count: beforeCount, targets, preexistingMigrationDocuments: migrationDocs }, null, 2));
    const addendumPath = path.join(outputDir, "snapshot-before-addendum-durazno.json");
    if (!fs.existsSync(addendumPath) && byId.has(148)) {
      fs.writeFileSync(addendumPath, JSON.stringify({ migrationId, capturedAt: now, reason: "Alimento incorporado al alcance después de la primera aplicación", target: byId.get(148) }, null, 2));
    }

    const operations = [];
    for (const spec of nutritionUpdates) {
      const doc = byId.get(spec.id);
      operations.push({ updateOne: { filter: { _id: doc._id, alimentoId: spec.id }, update: { $set: updateFromSpec(doc, spec) } } });
    }
    for (const spec of unitNutritionUpdates) {
      const doc = byId.get(spec.id);
      operations.push({ updateOne: { filter: { _id: doc._id, alimentoId: spec.id }, update: { $set: updateFromSpec(doc, spec, true) } } });
    }
    for (const spec of structuralUpdates) {
      const doc = byId.get(spec.id);
      operations.push({ updateOne: { filter: { _id: doc._id, alimentoId: spec.id }, update: { $set: { ...spec.set, updatedAt: now, auditoriaEstructural: { migrationId, checkedAt: now } } } } });
    }
    for (const [id, weight] of fruitUnitWeights) {
      const doc = byId.get(id);
      operations.push({ updateOne: { filter: { _id: doc._id, alimentoId: id }, update: { $set: { pesoUnidadGramos: weight, updatedAt: now, auditoriaUnidad: { migrationId, checkedAt: now, weightSource: "peso comestible estándar usado en la auditoría SARA/USDA" } } } } });
    }
    for (const id of brandedExplicitIds) {
      const doc = byId.get(id);
      operations.push({ updateOne: { filter: { _id: doc._id, alimentoId: id }, update: { $set: { generation: explicitOnly(), updatedAt: now, auditoriaEstructural: { migrationId, checkedAt: now, decision: "Marca/SKU: EXPLICIT_ONLY" } } } } });
    }

    const plannedDocs = [];
    for (const spec of additions) {
      const key = `${migrationId}:${spec.key}`;
      const existing = migrationByKey.get(key);
      const alimentoId = existing?.alimentoId ?? nextId++;
      const document = buildDocument(spec, alimentoId);
      plannedDocs.push(document);
      operations.push(existing
        ? { replaceOne: { filter: { _id: existing._id, migrationKey: key }, replacement: { ...document, _id: existing._id, createdAt: existing.createdAt || now } } }
        : { insertOne: { document } });
    }

    fs.writeFileSync(path.join(outputDir, "migration-plan.json"), JSON.stringify({ applied: APPLY, operations: operations.map((op) => Object.keys(op)[0]), nutritionUpdates, unitNutritionUpdates, structuralUpdates, fruitUnitWeights: [...fruitUnitWeights], brandedExplicitIds, additions: plannedDocs.map(summary) }, null, 2));
    let result = { matchedCount: 0, modifiedCount: 0, insertedCount: 0 };
    if (APPLY) result = await collection.bulkWrite(operations, { ordered: true });

    const insertedNow = additions.filter((item) => !migrationByKey.has(`${migrationId}:${item.key}`)).length;
    const expectedCount = APPLY ? beforeCount + insertedNow : beforeCount;
    const afterCount = await collection.countDocuments({});
    if (afterCount !== expectedCount) throw new Error(`Conteo inesperado: esperado ${expectedCount}, real ${afterCount}.`);
    const verificationIds = [...ids, ...plannedDocs.map((doc) => doc.alimentoId)];
    const verified = APPLY ? await collection.find({ alimentoId: { $in: verificationIds } }).sort({ alimentoId: 1 }).toArray() : [...targets, ...plannedDocs];
    const output = { migrationId, applied: APPLY, beforeCount, afterCount, matchedCount: result.matchedCount || 0, modifiedCount: result.modifiedCount || 0, insertedCount: result.insertedCount || 0, affectedExisting: ids.length, additions: additions.length, warnings, verification: verified.map(summary) };
    fs.writeFileSync(path.join(outputDir, APPLY ? "verification-after.json" : "dry-run.json"), JSON.stringify(output, null, 2));
    console.log(JSON.stringify({ ...output, verification: undefined }, null, 2));
  } finally {
    await client.close();
  }
}

await main();
