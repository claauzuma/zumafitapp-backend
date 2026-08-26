import dotenv from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { MongoClient } from "mongodb";

import { normalizeFoodGenerationForRead } from "../servicio/foodGenerationMetadata.js";

dotenv.config();

const uri = process.env.MONGO_URI || process.env.STRCNX;
const dbName = process.env.MONGO_DB || process.env.BASE || "test";
const collectionName = "fooddatabase2";
const outputDirectory = path.resolve("artifacts", "food-generation-curation");

function first(document, keys, fallback = "") {
  for (const key of keys) {
    const value = document?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return fallback;
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeFood(document) {
  const rawGeneration = document?.generation ?? null;
  return {
    id: String(document?._id || ""),
    alimentoId: document?.alimentoId ?? null,
    name: String(first(document, ["Alimentos", "alimentos", "nombre", "name"], "Sin nombre")).trim(),
    category: String(first(document, ["Categoria", "Categoría", "categoria", "categoriaZumaFit", "Fuente", "fuente"])).trim(),
    subcategory: String(first(document, ["subcategoria", "subcategoría", "subcategoriaZumaFit", "Subcategoria", "Subcategoría"])).trim(),
    tags: Array.isArray(document?.tags) ? document.tags : [],
    unit: String(first(document, ["Unidad", "unidad", "unidadBase"])).trim(),
    macros: {
      kcal: numberOrNull(first(document, ["Calorias", "calorias", "kcal", "kcalUnidad", "kcal100", "kcal_100g_ml"], null)),
      protein: numberOrNull(first(document, ["Proteinas", "proteinas", "proteina", "protein", "proteinaUnidad", "proteina100", "proteina_100g_ml"], null)),
      carbs: numberOrNull(first(document, ["Carbohidratos", "carbohidratos", "carbs", "hidratos", "carbohidratosUnidad", "carbohidratos100", "carbohidratos_100g_ml"], null)),
      fat: numberOrNull(first(document, ["Grasas", "grasas", "fat", "grasasUnidad", "grasas100", "grasas_100g_ml"], null)),
    },
    active: document?.activo !== false,
    requiresReview: document?.requiereRevision === true,
    duplicateNameUnit: document?.duplicadoNombreUnidad === true,
    generationPersisted: rawGeneration !== null,
    generationRaw: rawGeneration,
    generation: normalizeFoodGenerationForRead(rawGeneration),
    metadataKeys: Object.keys(document || {}).sort(),
  };
}

function countBy(values) {
  return Object.fromEntries([...values.reduce((counts, value) => {
    const key = String(value || "Sin categoría");
    counts.set(key, (counts.get(key) || 0) + 1);
    return counts;
  }, new Map()).entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "es")));
}

function portionRuleComplete(rule = {}) {
  return !!rule.unit && rule.min !== null && rule.max !== null && rule.step !== null;
}

async function main() {
  if (!uri) throw new Error("Falta MONGO_URI o STRCNX en el entorno.");
  const client = new MongoClient(uri);
  await client.connect();
  try {
    const documents = await client.db(dbName).collection(collectionName).find({}).sort({ _id: 1 }).toArray();
    const foods = documents.map(normalizeFood);
    const summary = {
      database: dbName,
      collection: collectionName,
      total: foods.length,
      active: foods.filter((food) => food.active).length,
      requiresReview: foods.filter((food) => food.requiresReview).length,
      duplicateNameUnit: foods.filter((food) => food.duplicateNameUnit).length,
      generationPersisted: foods.filter((food) => food.generationPersisted).length,
      modes: countBy(foods.map((food) => food.generation.mode)),
      roles: Object.fromEntries(["P1", "P2", "C1", "C2", "V", "F", "G"].map((role) => [role, foods.filter((food) => food.generation.roles[role]).length])),
      mealTypes: Object.fromEntries(["breakfast", "lunch", "snack", "dinner", "extraSnack"].map((mealType) => [mealType, foods.filter((food) => food.generation.mealTypes[mealType]).length])),
      genericWithoutCompletePortionRule: foods.filter((food) => food.generation.mode === "GENERIC" && !portionRuleComplete(food.generation.portionRule)).length,
      categories: countBy(foods.map((food) => food.category)),
    };

    await mkdir(outputDirectory, { recursive: true });
    await writeFile(path.join(outputDirectory, "catalog-audit.json"), `${JSON.stringify({ summary, foods }, null, 2)}\n`, "utf8");
    await writeFile(path.join(outputDirectory, "catalog-index.tsv"), [
      "id\talimentoId\tname\tcategory\tsubcategory\tunit\tkcal\tprotein\tcarbs\tfat\tmode\treview\tduplicate",
      ...foods.map((food) => [
        food.id, food.alimentoId ?? "", food.name, food.category, food.subcategory, food.unit,
        food.macros.kcal ?? "", food.macros.protein ?? "", food.macros.carbs ?? "", food.macros.fat ?? "",
        food.generation.mode, food.requiresReview, food.duplicateNameUnit,
      ].map((value) => String(value).replace(/[\t\r\n]+/g, " ")).join("\t")),
    ].join("\n"), "utf8");
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
