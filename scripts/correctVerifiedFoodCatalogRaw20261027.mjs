import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { EJSON } from "bson";
import { MongoClient } from "mongodb";

import config from "../config.js";

const APPLY = process.argv.includes("--apply");
const ROLLBACK = process.argv.includes("--rollback");

if (APPLY && ROLLBACK) {
  throw new Error("Usar --apply o --rollback, nunca ambos.");
}

const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(here, "..");
const frontendRoot = path.resolve(backendRoot, "..", "..", "zumafitront");
const outputDir = path.join(frontendRoot, "artifacts", "food-catalog-verified-raw-2026-10-27");
const baselinePath = path.join(
  frontendRoot,
  "artifacts",
  "AUDITORIA_ZUMAFIT_ARGENTINA_20261026",
  "CATALOGO_COMPLETO_RAW.json",
);
const collectionName = "fooddatabase2";
const migrationId = "food-catalog-verified-raw-2026-10-27-v1";
const runAt = new Date();

const SOURCES = {
  SARA: {
    name: "SARA 2 - Ministerio de Salud de la Nación (2022)",
    url: "https://cesni-biblioteca.org/wp-content/uploads/2022/09/tabla-composicion-quimica-alimentos-argentina_ennys2.pdf",
  },
  ARGENFOODS_CARNES: {
    name: "ARGENFOODS - Universidad Nacional de Luján, Carnes y derivados",
    url: "https://www.argenfood.unlu.edu.ar/Tablas/Grupo/Carnes.pdf",
  },
  ARGENFOODS_CEREALES: {
    name: "ARGENFOODS - Universidad Nacional de Luján, Cereales y derivados",
    url: "https://www.argenfood.unlu.edu.ar/Tablas/Grupo/Cereales.pdf",
  },
  USDA: {
    name: "USDA FoodData Central - Foundation/SR Legacy",
    url: "https://fdc.nal.usda.gov/download-datasets/",
  },
  LA_SERENISIMA: {
    name: "La Serenísima - tablas nutricionales oficiales Argentina",
    url: "https://www.laserenisima.com.ar/Nutriboletin/20210219/img/4_tabla.pdf",
  },
  LA_SERENISIMA_PROTEIN: {
    name: "La Serenísima Protein - rótulo oficial Argentina",
    url: "https://www.laserenisima.com.ar/Nutriboletin/20210219/img/1_tabla.pdf",
  },
};

const ROLE_KEYS = ["P1", "P2", "C1", "C2", "V", "F", "G"];
const MEAL_KEYS = ["breakfast", "lunch", "snack", "dinner", "extraSnack"];

const explicitOnly = () => ({
  mode: "EXPLICIT_ONLY",
  roles: Object.fromEntries(ROLE_KEYS.map((key) => [key, false])),
  mealTypes: Object.fromEntries(MEAL_KEYS.map((key) => [key, false])),
  portionRule: { unit: null, min: null, max: null, step: null, allowedValues: [] },
});

const genericVegetable = () => ({
  mode: "GENERIC",
  roles: { P1: false, P2: false, C1: false, C2: false, V: true, F: false, G: false },
  mealTypes: { breakfast: false, lunch: true, snack: false, dinner: true, extraSnack: false },
  portionRule: { unit: "g", min: 50, max: 400, step: 10, allowedValues: [] },
});

const genericBread = () => ({
  mode: "GENERIC",
  roles: { P1: false, P2: false, C1: true, C2: true, V: false, F: false, G: false },
  mealTypes: { breakfast: true, lunch: false, snack: true, dinner: false, extraSnack: true },
  portionRule: { unit: "g", min: 20, max: 200, step: 10, allowedValues: [] },
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

function getName(doc) {
  return doc?.Alimentos || doc?.nombre || doc?.name || "";
}

function getUnit(doc) {
  return doc?.Unidad || doc?.unidad || doc?.unidadBase || "";
}

function currentPer100(doc) {
  const isUnit = ["unid", "unidad", "reb", "reban", "tapa", "pote"].includes(fold(getUnit(doc)));
  const multiplier = isUnit ? null : 100;
  const take = (preferred, aliases) => {
    if (Number.isFinite(Number(doc?.[preferred]))) return Number(doc[preferred]);
    for (const key of aliases) {
      if (Number.isFinite(Number(doc?.[key])) && multiplier) return Number(doc[key]) * multiplier;
    }
    return null;
  };
  return {
    kcal: take("kcal100", ["Calorias", "calorias", "kcal"]),
    protein: take("proteina100", ["Proteinas", "proteinas", "proteina"]),
    carbs: take("carbohidratos100", ["Carbohidratos", "carbohidratos"]),
    fat: take("grasas100", ["Grasas", "grasas"]),
    fiber: take("fibra100", ["Fibra", "fibra"]),
  };
}

function sourceReference(spec) {
  const source = SOURCES[spec.source];
  return {
    migrationId,
    checkedAt: runAt,
    source: source.name,
    sourceUrl: source.url,
    sourceFood: spec.sourceFood,
    pageOrId: spec.pageOrId || "",
    basis: spec.basis === "unit"
      ? `por unidad comestible declarada de ${spec.weightGrams} g; referencia por 100 g`
      : `por 100 ${spec.unit === "Ml" ? "ml" : "g"} de parte comestible`,
    state: spec.weighingBasis || "",
    carbohydrateConvention: carbohydrateConvention(spec),
    notes: spec.notes || "",
  };
}

function carbohydrateConvention(spec) {
  if (spec.carbConvention) return spec.carbConvention;
  if (spec.source === "SARA") return "carbohidratos disponibles";
  if (spec.source === "USDA") return "carbohidratos totales por diferencia";
  if (spec.source === "LA_SERENISIMA" || spec.source === "LA_SERENISIMA_PROTEIN") return "carbohidratos declarados en rótulo";
  return "carbohidratos totales";
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

function unitFields(unit) {
  return { Unidad: unit, unidad: unit, unidadBase: unit };
}

function per100NutritionFields(spec, doc) {
  const suggested = Number(spec.suggested ?? doc.porcionSugerida ?? 100);
  const factor = suggested / 100;
  const set = {
    Cantidad: 1,
    cantidadUnidad: 1,
    Calorias: round(spec.kcal / 100),
    calorias: round(spec.kcal / 100),
    kcal: round(spec.kcal / 100),
    kcalUnidad: round(spec.kcal / 100),
    Proteinas: round(spec.protein / 100),
    proteinas: round(spec.protein / 100),
    proteina: round(spec.protein / 100),
    proteinaUnidad: round(spec.protein / 100),
    Carbohidratos: round(spec.carbs / 100),
    carbohidratos: round(spec.carbs / 100),
    carbohidratosUnidad: round(spec.carbs / 100),
    Grasas: round(spec.fat / 100),
    grasas: round(spec.fat / 100),
    grasasUnidad: round(spec.fat / 100),
    kcal100: spec.kcal,
    proteina100: spec.protein,
    carbohidratos100: spec.carbs,
    grasas100: spec.fat,
    kcalPorcionSugerida: round(spec.kcal * factor, 2),
    proteinaPorcionSugerida: round(spec.protein * factor, 2),
    carbohidratosPorcionSugerida: round(spec.carbs * factor, 2),
    grasasPorcionSugerida: round(spec.fat * factor, 2),
    porcionSugerida: suggested,
    macroBasis: "perUnit",
  };
  if (Number.isFinite(spec.fiber)) {
    Object.assign(set, {
      Fibra: round(spec.fiber / 100),
      fibra: round(spec.fiber / 100),
      fibraUnidad: round(spec.fiber / 100),
      fibra100: spec.fiber,
      fibraPorcionSugerida: round(spec.fiber * factor, 2),
    });
  }
  return set;
}

function unitNutritionFields(spec) {
  const factor = spec.weightGrams / 100;
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
    pesoUnidadGramos: spec.weightGrams,
    porcionSugerida: 1,
    macroBasis: "perUnit",
  };
}

const nutritionSpecs = [
  { id: 35, expected: ["Anana", "Ananá"], name: "Ananá", unit: "Grs", kcal: 50, protein: 0.4, carbs: 11.7, fat: 0.2, fiber: 1.4, source: "SARA", sourceFood: "Ananá", pageOrId: "tabla 2.A, PDF p. 28", weighingBasis: "crudo", state: "Crudo", requiresCooking: false },
  { id: 39, expected: ["Arroz", "Arroz blanco, crudo (peso seco)"], name: "Arroz blanco, crudo (peso seco)", unit: "Grs", kcal: 339, protein: 6.9, carbs: 77.5, fat: 0.2, fiber: 1.7, source: "SARA", sourceFood: "Arroz blanco, crudo", pageOrId: "tabla 3.A, PDF p. 34", weighingBasis: "seco", state: "Crudo / seco", requiresCooking: true },
  { id: 42, expected: ["Arroz integral", "Arroz integral, crudo (peso seco)"], name: "Arroz integral, crudo (peso seco)", unit: "Grs", kcal: 350, protein: 7.5, carbs: 72.7, fat: 3.2, fiber: 3.6, source: "SARA", sourceFood: "Arroz integral, crudo", pageOrId: "tabla 3.A, PDF p. 34", weighingBasis: "seco", state: "Crudo / seco", requiresCooking: true },
  { id: 49, expected: ["Avena instantanea", "Avena arrollada / instantánea, seca"], name: "Avena arrollada / instantánea, seca", unit: "Grs", kcal: 357, protein: 15.6, carbs: 56.9, fat: 7.5, fiber: 10.4, source: "SARA", sourceFood: "Avena, arrollada, cruda", pageOrId: "tabla 3.A, PDF p. 34", weighingBasis: "seco", state: "Seco / tal como se pesa", requiresCooking: false, notes: "Aplicable a avena simple, sin azúcar ni saborizantes." },
  { id: 65, expected: ["Bife de chorizo magro", "Bife de chorizo magro, crudo (sin grasa visible)"], name: "Bife de chorizo magro, crudo (sin grasa visible)", unit: "Grs", kcal: 111, protein: 21, carbs: 0, fat: 3, source: "ARGENFOODS_CARNES", sourceFood: "Vacuno, cuadril y bife angosto flaco, fresco, crudo", pageOrId: "código 229", weighingBasis: "crudo", state: "Crudo / a cocinar", requiresCooking: true, notes: "El nombre 'magro' se define como pieza sin grasa visible; el bife con cobertura grasa requiere otro registro." },
  { id: 72, expected: ["Bola de lomo", "Bola de lomo de novillito, cruda"], name: "Bola de lomo de novillito, cruda", unit: "Grs", kcal: 114, protein: 22, carbs: 0, fat: 3.2, source: "ARGENFOODS_CARNES", sourceFood: "Vacuno, bola de lomo de novillito, fresco, crudo", pageOrId: "código 504", weighingBasis: "crudo", state: "Crudo / a cocinar", requiresCooking: true },
  { id: 79, expected: ["Calabacin", "Zucchini / zapallito italiano, crudo"], name: "Zucchini / zapallito italiano, crudo", unit: "Grs", kcal: 16, protein: 1.2, carbs: 2.1, fat: 0.3, fiber: 1, source: "SARA", sourceFood: "Zucchini, crudo", pageOrId: "tabla 1.A, PDF p. 26", weighingBasis: "crudo", state: "Crudo", requiresCooking: false, notes: "Se elimina la ambigüedad regional de 'calabacín'." },
  { id: 113, expected: ["Churrasco magro", "Churrasco vacuno magro, crudo (corte magro promedio)"], name: "Churrasco vacuno magro, crudo (corte magro promedio)", unit: "Grs", kcal: 138, protein: 22.2, carbs: 0, fat: 5.5, source: "SARA", sourceFood: "Vacuno, cortes magros, promedio, crudo", pageOrId: "tabla 7.A, PDF p. 90", weighingBasis: "crudo", state: "Crudo / a cocinar", requiresCooking: true, notes: "'Churrasco' describe la presentación, no un corte anatómico; el registro queda definido como corte magro promedio." },
  { id: 115, expected: ["Claras de huevos", "Clara de huevo cruda (1 unidad = 33 g)"], name: "Clara de huevo cruda (1 unidad = 33 g)", unit: "Unid", basis: "unit", weightGrams: 33, kcal: 51, protein: 11.6, carbs: 0.7, fat: 0.2, fiber: 0, source: "SARA", sourceFood: "Huevo de gallina, clara, cruda", pageOrId: "tabla 8.A, PDF p. 93", weighingBasis: "crudo", state: "Crudo / a cocinar", requiresCooking: true },
  { id: 120, expected: ["Copos de maiz sin azucar", "Copos de maíz sin azúcar, secos"], name: "Copos de maíz sin azúcar, secos", unit: "Grs", kcal: 401, protein: 7.1, carbs: 91.4, fat: 0.8, fiber: 2.6, source: "SARA", sourceFood: "Cereal desayuno, copos de maíz sin azúcar, sin fortificar", pageOrId: "tabla 3.A, PDF p. 38", weighingBasis: "listo_para_consumir", state: "Listo para consumir / seco", requiresCooking: false },
  { id: 129, expected: ["Cuadrada (Ternera)", "Cuadrada vacuna magra, cruda (promedio cortes magros)"], name: "Cuadrada vacuna magra, cruda (promedio cortes magros)", unit: "Grs", kcal: 138, protein: 22.2, carbs: 0, fat: 5.5, source: "SARA", sourceFood: "Vacuno, cortes magros, promedio, crudo; incluye cuadrada", pageOrId: "tabla 7.A, PDF p. 90", weighingBasis: "crudo", state: "Crudo / a cocinar", requiresCooking: true, notes: "SARA clasifica cuadrada dentro de cortes magros y publica el promedio del grupo." },
  { id: 162, expected: ["Fideos", "Fideos secos, crudos (peso seco)"], name: "Fideos secos, crudos (peso seco)", unit: "Grs", kcal: 352, protein: 13, carbs: 71.5, fat: 1.5, fiber: 3.2, source: "SARA", sourceFood: "Fideos secos, crudos", pageOrId: "tabla 3.A, PDF p. 42", weighingBasis: "seco", state: "Crudo / seco", requiresCooking: true },
  { id: 224, expected: ["Huevos", "Huevo de gallina mediano, crudo (50 g comestibles)"], name: "Huevo de gallina mediano, crudo (50 g comestibles)", unit: "Unid", basis: "unit", weightGrams: 50, kcal: 156, protein: 12, carbs: 0.4, fat: 11.8, fiber: 0, source: "SARA", sourceFood: "Huevo de gallina, entero, crudo", pageOrId: "tabla 8.A, PDF p. 93", weighingBasis: "crudo", state: "Crudo / a cocinar", requiresCooking: true },
  { id: 241, expected: ["Langostinos", "Langostino, carne de cola cruda"], name: "Langostino, carne de cola cruda", unit: "Grs", kcal: 96, protein: 22, carbs: 0, fat: 0.9, source: "SARA", sourceFood: "Langostino", pageOrId: "tabla 9.A, PDF p. 95", weighingBasis: "crudo", state: "Crudo / a cocinar", requiresCooking: true },
  { id: 247, expected: ["Leche descremada", "Leche descremada fluida 0%, genérica"], name: "Leche descremada fluida 0%, genérica", unit: "Ml", kcal: 36, protein: 3, carbs: 4.9, fat: 0.5, fiber: 0, source: "LA_SERENISIMA", sourceFood: "Leche Menos Calorías 0% Vitaminas A y D", pageOrId: "tabla Leches, p. 2, por 100 ml", weighingBasis: "listo_para_consumir", state: "Listo para consumir", requiresCooking: false, notes: "Referencia comercial argentina representativa para una leche fluida descremada genérica." },
  { id: 249, expected: ["Leche descremada alta en proteínas", "Leche descremada alta en proteínas 0%, genérica"], name: "Leche descremada alta en proteínas 0%, genérica", unit: "Ml", kcal: 43, protein: 4.5, carbs: 5.4, fat: 0.4, fiber: 0, source: "SARA", sourceFood: "Leche descremada fluida, con 50% más de proteínas", pageOrId: "tabla 4.A, PDF pp. 61-62", weighingBasis: "listo_para_consumir", state: "Listo para consumir", requiresCooking: false, notes: "Se usa el perfil genérico argentino de SARA 2. Los productos de marca deben cargarse por separado con su rótulo vigente." },
  { id: 252, expected: ["Leche descremada la serenisima", "La Serenísima Menos Calorías 0%"], name: "La Serenísima Menos Calorías 0%", unit: "Ml", kcal: 36, protein: 3, carbs: 4.9, fat: 0.5, fiber: 0, source: "LA_SERENISIMA", sourceFood: "Leche Menos Calorías 0% Vitaminas A y D", pageOrId: "tabla Leches, p. 2, por 100 ml", weighingBasis: "listo_para_consumir", state: "Listo para consumir", requiresCooking: false, generation: explicitOnly() },
  { id: 253, expected: ["Leche descremada sin lactosa", "Leche sin lactosa parcialmente descremada, genérica"], name: "Leche sin lactosa parcialmente descremada, genérica", unit: "Ml", kcal: 40, protein: 3, carbs: 4.8, fat: 1, fiber: 0, source: "LA_SERENISIMA", sourceFood: "Leche Zero Lactosa", pageOrId: "tabla Leches funcionales, p. 3, por 100 ml", weighingBasis: "listo_para_consumir", state: "Listo para consumir", requiresCooking: false, notes: "Se corrige el nombre: el rótulo de referencia aporta 1 g de grasa y no es una leche 0%." },
  { id: 258, expected: ["Leche entera", "Leche entera fluida, genérica"], name: "Leche entera fluida, genérica", unit: "Ml", kcal: 57, protein: 3, carbs: 4.5, fat: 3, fiber: 0, source: "LA_SERENISIMA", sourceFood: "Leche Entera Clásica 3% Vitaminas A y D", pageOrId: "tabla Leches, p. 2, por 100 ml", weighingBasis: "listo_para_consumir", state: "Listo para consumir", requiresCooking: false, notes: "ARGENFOODS corrobora 57 kcal, 3.1 g proteína, 4.6 g carbohidratos y 2.9 g grasa por 100 g." },
  { id: 358, expected: ["Paleta de ternera", "Paleta de novillito, cruda"], name: "Paleta de novillito, cruda", unit: "Grs", kcal: 125, protein: 19, carbs: 0, fat: 5.5, source: "ARGENFOODS_CARNES", sourceFood: "Vacuno, paleta de novillito, fresco, crudo", pageOrId: "código 511", weighingBasis: "crudo", state: "Crudo / a cocinar", requiresCooking: true },
  { id: 360, expected: ["Palomita (Carne magra)", "Palomita de novillito, cruda"], name: "Palomita de novillito, cruda", unit: "Grs", kcal: 116, protein: 20, carbs: 0, fat: 3.7, source: "ARGENFOODS_CARNES", sourceFood: "Vacuno, palomita de novillito, fresco, crudo", pageOrId: "código 513", weighingBasis: "crudo", state: "Crudo / a cocinar", requiresCooking: true },
  { id: 362, expected: ["Pan", "Pan genérico de panadería, sin grasa agregada"], name: "Pan genérico de panadería, sin grasa agregada", unit: "Grs", kcal: 268, protein: 8.4, carbs: 57, fat: 0.7, fiber: 2.8, source: "SARA", sourceFood: "Pan francés o pan casero sin agregado de grasa o aceite", pageOrId: "tabla 3.A, PDF p. 52", weighingBasis: "listo_para_consumir", state: "Listo para consumir", requiresCooking: false },
  { id: 364, expected: ["Pan baguette", "Pan baguette / francés de panadería"], name: "Pan baguette / francés de panadería", unit: "Grs", kcal: 269, protein: 9.3, carbs: 57.4, fat: 0.2, source: "ARGENFOODS_CEREALES", sourceFood: "Trigo, pan francés", pageOrId: "código 36", weighingBasis: "listo_para_consumir", state: "Listo para consumir", requiresCooking: false, notes: "Equivalencia con pan francés magro de panadería; no aplica a baguettes con aceite o manteca." },
  { id: 365, expected: ["Pan blanco", "Pan blanco tipo molde lacteado, genérico"], name: "Pan blanco tipo molde lacteado, genérico", unit: "Grs", kcal: 244, protein: 9.4, carbs: 46.7, fat: 2.2, fiber: 3.5, source: "SARA", sourceFood: "Pan blanco, tipo molde, lacteado", pageOrId: "tabla 3.A, PDF p. 52", weighingBasis: "listo_para_consumir", state: "Listo para consumir", requiresCooking: false },
  { id: 369, expected: ["Pan de centeno", "Pan de centeno, genérico"], name: "Pan de centeno, genérico", unit: "Grs", kcal: 234, protein: 8.5, carbs: 42.5, fat: 3.3, fiber: 5.8, source: "SARA", sourceFood: "Pan de Centeno", pageOrId: "tabla 3.A, PDF p. 52", weighingBasis: "listo_para_consumir", state: "Listo para consumir", requiresCooking: false },
  { id: 374, expected: ["Pan frances", "Pan francés de panadería, sin grasa agregada"], name: "Pan francés de panadería, sin grasa agregada", unit: "Grs", kcal: 268, protein: 8.4, carbs: 57, fat: 0.7, fiber: 2.8, source: "SARA", sourceFood: "Pan francés o pan casero sin agregado de grasa o aceite", pageOrId: "tabla 3.A, PDF p. 52", weighingBasis: "listo_para_consumir", state: "Listo para consumir", requiresCooking: false },
  { id: 376, expected: ["Pan integral", "Pan integral / de molde con salvado, genérico"], name: "Pan integral / de molde con salvado, genérico", unit: "Grs", kcal: 225, protein: 10.9, carbs: 40.7, fat: 2.1, fiber: 7.4, source: "SARA", sourceFood: "Pan de molde con salvado", pageOrId: "tabla 3.A, PDF p. 52", weighingBasis: "listo_para_consumir", state: "Listo para consumir", requiresCooking: false, generation: genericBread() },
  { id: 391, expected: ["Papas", "Papa, cruda"], name: "Papa, cruda", unit: "Grs", kcal: 79, protein: 2.7, carbs: 16.9, fat: 0.1, fiber: 2.4, source: "SARA", sourceFood: "Papa, cruda", pageOrId: "tabla 3.A, PDF p. 54", weighingBasis: "crudo", state: "Crudo / a cocinar", requiresCooking: true },
  { id: 402, expected: ["Peceto", "Peceto de novillito, crudo"], name: "Peceto de novillito, crudo", unit: "Grs", kcal: 125, protein: 23, carbs: 0, fat: 1.9, source: "ARGENFOODS_CARNES", sourceFood: "Vacuno, peceto de novillito, fresco, crudo", pageOrId: "código 514", weighingBasis: "crudo", state: "Crudo / a cocinar", requiresCooking: true },
  { id: 403, expected: ["Pechuga de pavo", "Pechuga de pavo sin piel, cruda"], name: "Pechuga de pavo sin piel, cruda", unit: "Grs", kcal: 114, protein: 23.3, carbs: 0, fat: 2.33, source: "USDA", sourceFood: "Turkey, retail parts, breast, meat only, raw", pageOrId: "FDC 174515", weighingBasis: "crudo", state: "Crudo / a cocinar", requiresCooking: true },
  { id: 404, expected: ["Pechuga de pollo", "Pechuga de pollo sin piel, cruda"], name: "Pechuga de pollo sin piel, cruda", unit: "Grs", kcal: 114, protein: 22.5, carbs: 0, fat: 2.6, source: "SARA", sourceFood: "Pollo, pechuga sin piel, crudo", pageOrId: "tabla 7.A, PDF p. 88", weighingBasis: "crudo", state: "Crudo / a cocinar", requiresCooking: true },
  { id: 405, expected: ["Pechuga de pollo con piel", "Pechuga de pollo con piel, cruda"], name: "Pechuga de pollo con piel, cruda", unit: "Grs", kcal: 127, protein: 21.4, carbs: 0, fat: 4.78, source: "USDA", sourceFood: "Chicken, breast, meat and skin, raw", pageOrId: "Foundation FDC 2727569", weighingBasis: "crudo", state: "Crudo / a cocinar", requiresCooking: true, notes: "Se usa USDA porque SARA informa pollo entero con piel, no pechuga con piel." },
  { id: 412, expected: ["Pescado blanco", "Pescado blanco/magro de mar, crudo"], name: "Pescado blanco/magro de mar, crudo", unit: "Grs", kcal: 80, protein: 17.1, carbs: 0, fat: 1.3, source: "SARA", sourceFood: "Pescados de mar, promedio, crudo (brótola, corvina blanca, gatuzo, lenguado, merluza, etc.)", pageOrId: "tabla 9.A, PDF p. 97", weighingBasis: "crudo", state: "Crudo / a cocinar", requiresCooking: true },
  { id: 494, expected: ["Repollo", "Repollo, crudo"], name: "Repollo, crudo", unit: "Grs", kcal: 19, protein: 1.3, carbs: 3.3, fat: 0.1, fiber: 2.5, source: "SARA", sourceFood: "Repollo, crudo", pageOrId: "tabla 1.A, PDF p. 24", weighingBasis: "crudo", state: "Crudo", requiresCooking: false, generation: genericVegetable() },
  { id: 541, expected: ["Ternera magra", "Carne vacuna/ternera magra, cruda (promedio)"], name: "Carne vacuna/ternera magra, cruda (promedio)", unit: "Grs", kcal: 138, protein: 22.2, carbs: 0, fat: 5.5, source: "SARA", sourceFood: "Vacuno, cortes magros, promedio, crudo", pageOrId: "tabla 7.A, PDF p. 90", weighingBasis: "crudo", state: "Crudo / a cocinar", requiresCooking: true },
  { id: 548, expected: ["Tostadas clasicas", "Tostadas clásicas de mesa"], name: "Tostadas clásicas de mesa", unit: "Grs", kcal: 388, protein: 13, carbs: 74.5, fat: 4.2, fiber: 3.5, source: "SARA", sourceFood: "Tostadas de mesa", pageOrId: "tabla 3.A, PDF p. 60", weighingBasis: "listo_para_consumir", state: "Listo para consumir", requiresCooking: false },
  { id: 551, expected: ["Tostadas de arroz", "Galletas/tostadas de arroz, genéricas"], name: "Galletas/tostadas de arroz, genéricas", unit: "Grs", kcal: 380, protein: 6.3, carbs: 83.9, fat: 2.1, fiber: 2.1, source: "SARA", sourceFood: "Galletas de arroz", pageOrId: "tabla 3.A, PDF p. 42", weighingBasis: "listo_para_consumir", state: "Listo para consumir / seco", requiresCooking: false },
  { id: 607, expected: ["Zapallo", "Zapallo, crudo"], name: "Zapallo, crudo", unit: "Grs", kcal: 36, protein: 1, carbs: 7.8, fat: 0.1, fiber: 1.3, source: "SARA", sourceFood: "Zapallo, crudo", pageOrId: "tabla 1.A, PDF p. 26", weighingBasis: "crudo", state: "Crudo", requiresCooking: false },
  { id: 609, expected: ["Pata muslo de pollo sin piel", "Pata-muslo de pollo sin piel, carne cruda"], name: "Pata-muslo de pollo sin piel, carne cruda", unit: "Grs", kcal: 120, protein: 19.2, carbs: 0, fat: 4.22, source: "USDA", sourceFood: "Chicken, broilers or fryers, leg, meat only, raw", pageOrId: "SR Legacy FDC 173619", weighingBasis: "crudo", state: "Crudo / a cocinar", requiresCooking: true, notes: "SARA no desagrega pata-muslo sin piel con macros completos." },
  { id: 653, expected: ["Nalga magra, cruda", "Nalga magra de novillito, cruda"], name: "Nalga magra de novillito, cruda", unit: "Grs", kcal: 106, protein: 22, carbs: 0, fat: 1.7, source: "ARGENFOODS_CARNES", sourceFood: "Vacuno, nalga de novillito, fresco, crudo", pageOrId: "código 510", weighingBasis: "crudo", state: "Crudo / a cocinar", requiresCooking: true },
  { id: 655, expected: ["Lomo vacuno, crudo"], name: "Lomo vacuno, crudo", unit: "Grs", kcal: 116, protein: 20, carbs: 0, fat: 4, source: "ARGENFOODS_CARNES", sourceFood: "Vacuno, lomo, fresco, crudo", pageOrId: "código 233", weighingBasis: "crudo", state: "Crudo / a cocinar", requiresCooking: true },
  { id: 657, expected: ["Tortuguita, cruda"], name: "Tortuguita de novillito, cruda", unit: "Grs", kcal: 154, protein: 22, carbs: 0, fat: 7.6, source: "ARGENFOODS_CARNES", sourceFood: "Vacuno, tortuguita de novillito, fresco, crudo", pageOrId: "código 516", weighingBasis: "crudo", state: "Crudo / a cocinar", requiresCooking: true },
  { id: 658, expected: ["Vacío vacuno, crudo"], name: "Vacío de novillito, crudo", unit: "Grs", kcal: 174, protein: 20, carbs: 0, fat: 11, source: "ARGENFOODS_CARNES", sourceFood: "Vacuno, vacío de novillito, fresco, crudo", pageOrId: "código 517", weighingBasis: "crudo", state: "Crudo / a cocinar", requiresCooking: true },
  { id: 664, expected: ["Colita de cuadril, cruda"], name: "Colita de cuadril de novillito, cruda", unit: "Grs", kcal: 143, protein: 21, carbs: 0, fat: 6.7, source: "ARGENFOODS_CARNES", sourceFood: "Vacuno, colita de cuadril de novillito, fresco, crudo", pageOrId: "código 506", weighingBasis: "crudo", state: "Crudo / a cocinar", requiresCooking: true },
  { id: 667, expected: ["Osobuco, carne comestible cruda", "Osobuco vacuno, parte comestible cruda"], name: "Osobuco vacuno, parte comestible cruda", unit: "Grs", kcal: 210, protein: 20, carbs: 0, fat: 14.4, source: "SARA", sourceFood: "Osobuco, crudo", pageOrId: "tabla 7.A, PDF p. 86", weighingBasis: "crudo", state: "Crudo / a cocinar", requiresCooking: true, notes: "Valores por 100 g de parte comestible; no incluyen el peso del hueso." },
];

const cookedExplicitIds = [40, 43, 163, 668, 669, 670];
const brandedExplicitIds = [
  83, 248, 250, 254, 255, 262, 354, 363, 366, 367, 368, 370, 371, 372, 373, 378, 379, 380,
  387, 420, 421, 422, 423, 491, 533, 591,
];

const rawStateIds = [75, 105, 272, 353, 354, 355, 491, 534, 542];
const dryStateIds = [83, 419, 420, 421, 422, 423, 533];
const fluidMilkBrandIds = [248, 250, 254, 255, 262];

const reviewSpecs = [
  { id: 75, reason: "Bondiola fresca: falta una coincidencia argentina completa para el nivel de desgrasado; los macros actuales son plausibles pero variables.", keepGeneric: true },
  { id: 88, reason: "'Carne de cerdo magro' no identifica corte ni desgrasado; mantener provisional hasta definir el alimento de compra.", keepGeneric: true },
  { id: 164, reason: "Fideos sin gluten dependen de la mezcla (arroz/maíz/legumbres); falta rótulo o definición genérica acordada.", keepGeneric: false },
  { id: 174, reason: "Galleta de arroz por unidad sin peso declarado; no inferir gramos por unidad.", keepGeneric: false },
  { id: 179, reason: "Galletitas de agua varían materialmente por grasa y marca; falta definición o rótulo.", keepGeneric: true },
  { id: 199, reason: "'Gambas' no identifica especie ni presentación; usar Langostino ID 241 si es cola cruda pelada.", keepGeneric: false },
  { id: 270, reason: "Lomo de cerdo magro: falta dato argentino completo específico; valor actual plausible con fuente internacional.", keepGeneric: true },
  { id: 273, reason: "'Maíz' no define grano seco, choclo, harina ni cocción; usar los registros específicos.", keepGeneric: false },
  { id: 355, reason: "Registro genérico ambiguo que replica macros del SKU Carrefour; usar Ñoquis envasados crudos ID 353.", keepGeneric: false, active: false, duplicateOf: 353 },
  { id: 361, reason: "Palta: el valor depende de variedad y convención de carbohidratos; el dato actual USDA es razonable pero no hay coincidencia argentina exacta.", keepGeneric: true },
  { id: 377, reason: "Pan lactal por rebanada sin peso declarado; usar Pan blanco por gramos ID 365 o cargar el rótulo.", keepGeneric: false },
  { id: 381, reason: "'Pan negro' no define harina, levadura ni formulación; SARA y ARGENFOODS muestran variantes distintas.", keepGeneric: false },
  { id: 399, reason: "Pasta de maní SIN TACC sin marca ni porcentaje de maní; usar Pasta de maní ID 398 o validar rótulo.", keepGeneric: false },
  { id: 419, reason: "Polenta seca: formulaciones argentinas publicadas difieren; macros actuales son plausibles para producto comercial, falta definición exacta.", keepGeneric: true },
  { id: 424, reason: "Pomelo varía por variedad y carbohidrato disponible vs total; valor actual plausible, sin equivalencia argentina exacta de variedad.", keepGeneric: true },
  { id: 460, reason: "Queso cremoso light genérico: el dato coincide casi por completo con Cremón Light, pero falta definir si ese SKU es la referencia.", keepGeneric: true },
  { id: 519, reason: "Seitán depende fuertemente de hidratación y receta; falta producto o receta estándar.", keepGeneric: false },
  { id: 561, reason: "Tostada por unidad sin peso declarado; usar Tostadas clásicas por gramos ID 548 o validar envase.", keepGeneric: false },
  { id: 587, reason: "'Verduras' es nutricionalmente indefinido; usar vegetales específicos.", keepGeneric: false },
  { id: 589, reason: "Whey isolate depende del rótulo y sabor; no debe autogenerarse sin producto definido.", keepGeneric: false },
  { id: 665, reason: "Entraña: equivalencia internacional aproximada; falta composición argentina específica del corte y desgrasado.", keepGeneric: true },
  { id: 666, reason: "Ojo de bife/bife ancho: valor internacional plausible; falta composición argentina específica y nivel de grasa visible.", keepGeneric: true },
];

function explicitLegacyFlags() {
  return {
    aptoDesayuno: false,
    aptoAlmuerzo: false,
    aptoMerienda: false,
    aptoCena: false,
    aptoPreEntreno: false,
    aptoPostEntreno: false,
    esProteinaPrincipal: false,
    esProteinaSecundaria: false,
    esCarboPrincipal: false,
    esGrasaPrincipal: false,
    esVegetalLibre: false,
  };
}

function nutritionSet(spec, doc) {
  const unit = spec.unit || getUnit(doc);
  const set = {
    ...nameFields(spec.name || getName(doc), unit),
    ...unitFields(unit),
    ...(spec.basis === "unit" ? unitNutritionFields(spec) : per100NutritionFields(spec, doc)),
    estado: spec.state,
    requiereCoccion: spec.requiresCooking,
    basePesaje: spec.weighingBasis,
    descripcionBasePesaje: spec.weighingBasis === "crudo"
      ? "Usar el peso crudo de la parte comestible, antes de cocinar."
      : spec.weighingBasis === "seco"
        ? "Usar el peso seco/crudo, antes de hidratar o cocinar."
        : "Usar el alimento tal como se consume.",
    carbohidratosConvencion: carbohydrateConvention(spec),
    referenciaNutricional: sourceReference(spec),
    requiereRevision: false,
    motivoRevision: "",
  };
  if (spec.generation) {
    set.generation = spec.generation;
    if (spec.generation.mode === "EXPLICIT_ONLY") Object.assign(set, explicitLegacyFlags());
  }
  return set;
}

function auditMarker(decision, extra = {}) {
  return {
    migrationId,
    appliedAt: runAt,
    decision,
    ...extra,
  };
}

function baselineFingerprint(doc) {
  const nutrition = currentPer100(doc);
  return {
    alimentoId: doc?.alimentoId,
    name: getName(doc),
    unit: getUnit(doc),
    kcal100: nutrition.kcal,
    protein100: nutrition.protein,
    carbs100: nutrition.carbs,
    fat100: nutrition.fat,
    state: doc?.estado ?? null,
    requiresCooking: doc?.requiereCoccion ?? null,
    generationMode: doc?.generation?.mode ?? null,
    active: doc?.activo ?? null,
  };
}

function sameNumber(a, b) {
  if (a === null && b === null) return true;
  return Number.isFinite(Number(a)) && Number.isFinite(Number(b)) && Math.abs(Number(a) - Number(b)) < 1e-6;
}

function compareBaseline(live, baseline) {
  const a = baselineFingerprint(live);
  const b = baselineFingerprint(baseline);
  const differences = [];
  for (const key of ["alimentoId", "name", "unit", "state", "requiresCooking", "generationMode", "active"]) {
    if (a[key] !== b[key]) differences.push(`${key}: '${b[key]}' -> '${a[key]}'`);
  }
  for (const key of ["kcal100", "protein100", "carbs100", "fat100"]) {
    if (!sameNumber(a[key], b[key])) differences.push(`${key}: '${b[key]}' -> '${a[key]}'`);
  }
  return differences;
}

function concurrencyFilter(doc) {
  const filter = { _id: doc._id, alimentoId: doc.alimentoId, Alimentos: doc.Alimentos };
  filter.updatedAt = doc.updatedAt === undefined ? { $exists: false } : doc.updatedAt;
  return filter;
}

function csvEscape(value) {
  const string = value === null || value === undefined ? "" : String(value);
  return `"${string.replaceAll('"', '""')}"`;
}

function toCsv(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  return [headers.map(csvEscape).join(","), ...rows.map((row) => headers.map((key) => csvEscape(row[key])).join(","))].join("\n") + "\n";
}

function summary(doc) {
  const n = currentPer100(doc);
  return {
    alimentoId: doc.alimentoId,
    alimento: getName(doc),
    unidad: getUnit(doc),
    kcal100: n.kcal,
    proteina100: n.protein,
    carbohidratos100: n.carbs,
    grasas100: n.fat,
    fibra100: n.fiber,
    estado: doc.estado || "",
    requiereCoccion: doc.requiereCoccion ?? "",
    basePesaje: doc.basePesaje || "",
    modoGeneracion: doc.generation?.mode || "",
    activo: doc.activo ?? "",
    requiereRevision: doc.requiereRevision ?? "",
    motivoRevision: doc.motivoRevision || "",
    fuente: doc.referenciaNutricional?.source || "",
    alimentoFuente: doc.referenciaNutricional?.sourceFood || "",
    paginaOId: doc.referenciaNutricional?.pageOrId || "",
  };
}

function expectedPreview(doc, set) {
  return { ...doc, ...set };
}

function writeSnapshot(targetDocs, beforeCount) {
  fs.mkdirSync(outputDir, { recursive: true });
  const snapshot = {
    migrationId,
    capturedAt: runAt,
    database: config.BASE,
    collection: collectionName,
    collectionCount: beforeCount,
    documents: targetDocs,
  };
  const serialized = EJSON.stringify(snapshot, { relaxed: false, indent: 2 });
  const snapshotPath = path.join(outputDir, "snapshot-targets-before.ejson");
  fs.writeFileSync(snapshotPath, serialized);
  const sha256 = crypto.createHash("sha256").update(serialized).digest("hex");
  fs.writeFileSync(path.join(outputDir, "snapshot-targets-before.sha256"), `${sha256}  snapshot-targets-before.ejson\n`);
  return { snapshotPath, sha256 };
}

function buildPlan(byId) {
  const sets = new Map();
  const decisions = new Map();

  function merge(id, set, decision) {
    sets.set(id, { ...(sets.get(id) || {}), ...set });
    if (!decisions.has(id)) decisions.set(id, []);
    decisions.get(id).push(decision);
  }

  for (const spec of nutritionSpecs) {
    const doc = byId.get(spec.id);
    merge(spec.id, nutritionSet(spec, doc), `NUTRICIÓN: ${spec.sourceFood}`);
  }

  for (const id of cookedExplicitIds) {
    merge(id, {
      generation: explicitOnly(),
      ...explicitLegacyFlags(),
      basePesaje: "cocido",
      descripcionBasePesaje: "Versión cocida diferenciada; no participa del generador automático basado en peso crudo/seco.",
      requiereRevision: false,
      motivoRevision: "",
    }, "COCIDO_FUERA_DEL_AUTOMATICO");
  }

  for (const id of brandedExplicitIds) {
    const doc = byId.get(id);
    const specialVerified = id === 252;
    const duplicate = id === 248;
    merge(id, {
      generation: explicitOnly(),
      ...explicitLegacyFlags(),
      ...(duplicate ? { activo: false, duplicadoDeAlimentoId: 250 } : {}),
      requiereRevision: specialVerified ? false : true,
      motivoRevision: specialVerified
        ? ""
        : duplicate
          ? "Duplicado exacto de Leche descremada Apostoles ID 250; se conserva inactivo para trazabilidad."
          : "Producto de marca/SKU: confirmar el rótulo vigente y el peso de unidad antes de cambiar macros.",
    }, duplicate ? "DUPLICADO_INACTIVO" : "MARCA_FUERA_DEL_AUTOMATICO");
  }

  for (const id of fluidMilkBrandIds) {
    const doc = byId.get(id);
    merge(id, {
      ...nameFields(getName(doc), "Ml"),
      ...unitFields("Ml"),
      basePesaje: "listo_para_consumir",
      descripcionBasePesaje: "Usar el producto líquido tal como se consume; valores expresados por ml.",
    }, "UNIDAD_LECHE_FLUIDA_ML");
  }

  for (const id of rawStateIds) {
    merge(id, {
      estado: "Crudo / a cocinar",
      requiereCoccion: true,
      basePesaje: "crudo",
      descripcionBasePesaje: "Usar el peso crudo de la parte comestible, antes de cocinar.",
    }, "BASE_DE_PESAJE_CRUDO");
  }

  for (const id of dryStateIds) {
    merge(id, {
      estado: "Crudo / seco",
      requiereCoccion: true,
      basePesaje: "seco",
      descripcionBasePesaje: "Usar el peso seco/crudo, antes de hidratar o cocinar.",
    }, "BASE_DE_PESAJE_SECO");
  }

  for (const review of reviewSpecs) {
    merge(review.id, {
      ...(review.keepGeneric ? {} : { generation: explicitOnly(), ...explicitLegacyFlags() }),
      ...(review.active === false ? { activo: false } : {}),
      ...(review.duplicateOf ? { duplicadoDeAlimentoId: review.duplicateOf } : {}),
      requiereRevision: true,
      motivoRevision: review.reason,
    }, review.active === false ? "REVISAR_INACTIVO" : "REVISAR_FALTA_EVIDENCIA");
  }

  for (const [id, set] of sets) {
    set.auditoriaNutricionalUltima = auditMarker(decisions.get(id).join(" + "));
    set.updatedAt = runAt;
  }

  return { sets, decisions };
}

function assertNames(byId) {
  const errors = [];
  for (const spec of nutritionSpecs) {
    const doc = byId.get(spec.id);
    if (!doc) {
      errors.push(`Falta alimentoId ${spec.id}.`);
      continue;
    }
    const accepted = spec.expected.map(fold);
    if (!accepted.includes(fold(getName(doc)))) {
      errors.push(`ID ${spec.id}: se esperaba ${spec.expected.join(" / ")} y se encontró '${getName(doc)}'.`);
    }
  }
  return errors;
}

async function rollback(collection, client) {
  const snapshotPath = path.join(outputDir, "snapshot-targets-before.ejson");
  const manifestPath = path.join(outputDir, "apply-manifest.ejson");
  if (!fs.existsSync(snapshotPath) || !fs.existsSync(manifestPath)) {
    throw new Error("No existe snapshot/manifest aplicado para revertir.");
  }
  const snapshotText = fs.readFileSync(snapshotPath, "utf8");
  const expectedHash = fs.readFileSync(path.join(outputDir, "snapshot-targets-before.sha256"), "utf8").split(/\s+/)[0];
  const actualHash = crypto.createHash("sha256").update(snapshotText).digest("hex");
  if (actualHash !== expectedHash) throw new Error("Checksum del snapshot inválido; rollback cancelado.");
  const snapshot = EJSON.parse(snapshotText, { relaxed: false });
  const manifest = EJSON.parse(fs.readFileSync(manifestPath, "utf8"), { relaxed: false });
  const ids = snapshot.documents.map((doc) => doc.alimentoId);
  const live = await collection.find({ alimentoId: { $in: ids } }).toArray();
  if (live.length !== snapshot.documents.length) throw new Error("Faltan documentos objetivo; rollback cancelado.");
  const appliedAt = manifest.appliedAt;
  const unsafe = live.filter((doc) => (
    doc.auditoriaNutricionalUltima?.migrationId !== migrationId
    || !(doc.updatedAt instanceof Date)
    || doc.updatedAt.getTime() !== appliedAt.getTime()
  ));
  if (unsafe.length) {
    throw new Error(`Hay ${unsafe.length} documentos modificados después de la migración; rollback cancelado para no pisarlos.`);
  }

  const session = client.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      result = await collection.bulkWrite(snapshot.documents.map((original) => ({
        replaceOne: {
          filter: {
            _id: original._id,
            alimentoId: original.alimentoId,
            "auditoriaNutricionalUltima.migrationId": migrationId,
            updatedAt: appliedAt,
          },
          replacement: original,
        },
      })), { ordered: true, session });
      if (result.matchedCount !== snapshot.documents.length) throw new Error("Rollback incompleto; la transacción se abortará.");
      const count = await collection.countDocuments({}, { session });
      if (count !== snapshot.collectionCount) throw new Error("Conteo inesperado durante rollback.");
    }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });
  } finally {
    await session.endSession();
  }
  fs.writeFileSync(path.join(outputDir, "rollback-verification.json"), JSON.stringify({
    migrationId,
    rolledBackAt: new Date().toISOString(),
    matchedCount: result.matchedCount,
    modifiedCount: result.modifiedCount,
    restoredCount: snapshot.documents.length,
  }, null, 2));
  console.log(JSON.stringify({ rolledBack: true, restoredCount: snapshot.documents.length }, null, 2));
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  const client = new MongoClient(config.STRCNX);
  await client.connect();
  try {
    const collection = client.db(config.BASE).collection(collectionName);
    if (ROLLBACK) {
      await rollback(collection, client);
      return;
    }

    if (!fs.existsSync(baselinePath)) throw new Error(`No existe baseline auditado: ${baselinePath}`);
    const baselineDocs = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
    const baselineById = new Map(baselineDocs.filter((doc) => Number.isFinite(doc?.alimentoId)).map((doc) => [doc.alimentoId, doc]));

    const targetIds = [...new Set([
      ...nutritionSpecs.map((spec) => spec.id),
      ...cookedExplicitIds,
      ...brandedExplicitIds,
      ...rawStateIds,
      ...dryStateIds,
      ...reviewSpecs.map((spec) => spec.id),
    ])].sort((a, b) => a - b);

    const beforeCount = await collection.countDocuments({});
    const liveDocs = await collection.find({ alimentoId: { $in: targetIds } }).sort({ alimentoId: 1 }).toArray();
    const byId = new Map(liveDocs.map((doc) => [doc.alimentoId, doc]));
    const errors = assertNames(byId);

    for (const id of targetIds) {
      if (!byId.has(id)) errors.push(`Falta objetivo alimentoId ${id}.`);
      if (!baselineById.has(id)) errors.push(`Falta baseline alimentoId ${id}.`);
      if (byId.has(id) && baselineById.has(id)) {
        const differences = compareBaseline(byId.get(id), baselineById.get(id));
        const alreadyApplied = byId.get(id).auditoriaNutricionalUltima?.migrationId === migrationId;
        if (differences.length && !alreadyApplied) errors.push(`ID ${id} difiere del baseline: ${differences.join("; ")}`);
      }
    }

    const alreadyAppliedIds = liveDocs
      .filter((doc) => doc.auditoriaNutricionalUltima?.migrationId === migrationId)
      .map((doc) => doc.alimentoId);
    if (alreadyAppliedIds.length) {
      errors.push(`La migración ya aparece aplicada en IDs: ${alreadyAppliedIds.join(", ")}. No se permite aplicación parcial/repetida.`);
    }
    if (errors.length) throw new Error(`Precondiciones fallidas; no se escribió MongoDB:\n- ${errors.join("\n- ")}`);

    const { sets, decisions } = buildPlan(byId);
    const { snapshotPath, sha256 } = writeSnapshot(liveDocs, beforeCount);
    const preview = targetIds.map((id) => {
      const before = byId.get(id);
      const after = expectedPreview(before, sets.get(id));
      return { id, decisions: decisions.get(id), before: summary(before), after: summary(after) };
    });
    fs.writeFileSync(path.join(outputDir, "migration-plan.ejson"), EJSON.stringify({
      migrationId,
      applyRequested: APPLY,
      generatedAt: runAt,
      database: config.BASE,
      collection: collectionName,
      beforeCount,
      targetCount: targetIds.length,
      targetIds,
      snapshotPath,
      snapshotSha256: sha256,
      preview,
    }, { relaxed: false, indent: 2 }));

    if (!APPLY) {
      fs.writeFileSync(path.join(outputDir, "dry-run.json"), JSON.stringify({
        migrationId,
        applied: false,
        database: config.BASE,
        collection: collectionName,
        beforeCount,
        targetCount: targetIds.length,
        targetIds,
        snapshotSha256: sha256,
      }, null, 2));
      fs.writeFileSync(path.join(outputDir, "CAMBIOS_PROPUESTOS.csv"), toCsv(preview.map(({ id, decisions: ds, before, after }) => ({
        alimentoId: id,
        decisiones: ds.join(" + "),
        alimentoAntes: before.alimento,
        alimentoDespues: after.alimento,
        unidadAntes: before.unidad,
        unidadDespues: after.unidad,
        kcalAntes: before.kcal100,
        kcalDespues: after.kcal100,
        proteinaAntes: before.proteina100,
        proteinaDespues: after.proteina100,
        carbohidratosAntes: before.carbohidratos100,
        carbohidratosDespues: after.carbohidratos100,
        grasasAntes: before.grasas100,
        grasasDespues: after.grasas100,
        estadoAntes: before.estado,
        estadoDespues: after.estado,
        modoAntes: before.modoGeneracion,
        modoDespues: after.modoGeneracion,
        revisionDespues: after.requiereRevision,
        fuente: after.fuente,
        referencia: after.alimentoFuente,
      }))));
      console.log(JSON.stringify({ applied: false, beforeCount, targetCount: targetIds.length, snapshotSha256: sha256 }, null, 2));
      return;
    }

    const operations = targetIds.map((id) => ({
      updateOne: {
        filter: concurrencyFilter(byId.get(id)),
        update: { $set: sets.get(id) },
        upsert: false,
      },
    }));

    const session = client.startSession();
    let result;
    try {
      await session.withTransaction(async () => {
        result = await collection.bulkWrite(operations, { ordered: true, session });
        if (result.matchedCount !== targetIds.length) {
          throw new Error(`Sólo coincidieron ${result.matchedCount}/${targetIds.length} documentos; transacción abortada.`);
        }
        const count = await collection.countDocuments({}, { session });
        if (count !== beforeCount) throw new Error(`El conteo cambió ${beforeCount} -> ${count}; transacción abortada.`);
      }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });
    } finally {
      await session.endSession();
    }

    const afterDocs = await collection.find({ alimentoId: { $in: targetIds } }).sort({ alimentoId: 1 }).toArray();
    const afterCount = await collection.countDocuments({});
    if (afterCount !== beforeCount || afterDocs.length !== targetIds.length) throw new Error("Falló la verificación posterior de conteo/objetivos.");
    const missingMarkers = afterDocs.filter((doc) => doc.auditoriaNutricionalUltima?.migrationId !== migrationId);
    if (missingMarkers.length) throw new Error(`Faltan marcadores post-migración en ${missingMarkers.length} documentos.`);

    const afterById = new Map(afterDocs.map((doc) => [doc.alimentoId, doc]));
    const cookedStillAutomatic = cookedExplicitIds.filter((id) => afterById.get(id)?.generation?.mode === "GENERIC");
    if (cookedStillAutomatic.length) throw new Error(`Cocidos aún automáticos: ${cookedStillAutomatic.join(", ")}`);
    const brandStillAutomatic = brandedExplicitIds.filter((id) => afterById.get(id)?.generation?.mode === "GENERIC");
    if (brandStillAutomatic.length) throw new Error(`Marcas aún automáticas: ${brandStillAutomatic.join(", ")}`);

    const beforeById = byId;
    const appliedRows = targetIds.map((id) => {
      const before = summary(beforeById.get(id));
      const after = summary(afterById.get(id));
      return {
        alimentoId: id,
        decisiones: decisions.get(id).join(" + "),
        alimentoAntes: before.alimento,
        alimentoDespues: after.alimento,
        unidadAntes: before.unidad,
        unidadDespues: after.unidad,
        kcalAntes: before.kcal100,
        kcalDespues: after.kcal100,
        proteinaAntes: before.proteina100,
        proteinaDespues: after.proteina100,
        carbohidratosAntes: before.carbohidratos100,
        carbohidratosDespues: after.carbohidratos100,
        grasasAntes: before.grasas100,
        grasasDespues: after.grasas100,
        estadoAntes: before.estado,
        estadoDespues: after.estado,
        modoAntes: before.modoGeneracion,
        modoDespues: after.modoGeneracion,
        activoDespues: after.activo,
        revisionDespues: after.requiereRevision,
        motivoRevision: after.motivoRevision,
        fuente: after.fuente,
        referencia: after.alimentoFuente,
        paginaOId: after.paginaOId,
      };
    });
    fs.writeFileSync(path.join(outputDir, "CAMBIOS_APLICADOS.csv"), toCsv(appliedRows));
    fs.writeFileSync(path.join(outputDir, "PENDIENTES_CONFIRMACION.csv"), toCsv(
      afterDocs.filter((doc) => doc.requiereRevision).map(summary),
    ));
    fs.writeFileSync(path.join(outputDir, "verification-after.ejson"), EJSON.stringify({
      migrationId,
      verifiedAt: new Date(),
      beforeCount,
      afterCount,
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
      targetCount: targetIds.length,
      cookedStillAutomatic,
      brandStillAutomatic,
      documents: afterDocs.map(summary),
    }, { relaxed: false, indent: 2 }));
    fs.writeFileSync(path.join(outputDir, "apply-manifest.ejson"), EJSON.stringify({
      migrationId,
      appliedAt: runAt,
      database: config.BASE,
      collection: collectionName,
      beforeCount,
      afterCount,
      targetIds,
      snapshotSha256: sha256,
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
    }, { relaxed: false, indent: 2 }));
    console.log(JSON.stringify({
      applied: true,
      beforeCount,
      afterCount,
      targetCount: targetIds.length,
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
      reviewCount: afterDocs.filter((doc) => doc.requiereRevision).length,
      snapshotSha256: sha256,
    }, null, 2));
  } finally {
    await client.close();
  }
}

await main();
