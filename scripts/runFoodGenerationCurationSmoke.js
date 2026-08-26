import dotenv from "dotenv";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";

import { generateClientMenuPreview } from "../../../zumafitront/src/clientMenus/clientMenuGeneration.js";
import CnxMongoDB from "../model/DBMongo.js";
import ModelMongoDBAlimentos from "../model/DAO/alimentosMongoDB.js";
import { FOOD_COMBINATION_MODES } from "../servicio/foodCombinationCandidates.js";
import { generateMealAlternative } from "../servicio/mealAlternativeGenerator.js";

dotenv.config();

const outputDirectory = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve("artifacts", "food-generation-curation");
const selectedCounts = new Set(
  String(process.env.CURATION_SMOKE_COUNTS || "3,4,5,6").split(",").map(Number).filter((value) => patternsCount(value))
);
const runStart = Math.max(1, Number(process.env.CURATION_SMOKE_RUN_START) || 1);
const runEnd = Math.max(runStart, Number(process.env.CURATION_SMOKE_RUN_END) || 3);
const outputSuffix = String(process.env.CURATION_SMOKE_OUTPUT_SUFFIX || "").replace(/[^a-zA-Z0-9_-]/g, "");

const dailyTarget = Object.freeze({ kcal: 2140, proteina: 150, carbs: 250, grasas: 60 });
const patterns = Object.freeze({
  3: ["desayuno", "almuerzo", "cena"],
  4: ["desayuno", "almuerzo", "merienda", "cena"],
  5: ["desayuno", "almuerzo", "merienda", "cena", "snack"],
  6: ["desayuno", "colacion", "almuerzo", "merienda", "cena", "snack"],
});

function patternsCount(value) {
  return [3, 4, 5, 6].includes(value);
}

function stableGenerationFingerprint(documents = []) {
  const value = documents.map((document) => ({
    id: String(document._id),
    generation: document.generation ?? null,
  }));
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function rounded(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(Number(value || 0) * factor) / factor;
}

function foodWarnings(food = {}, mealType = "") {
  const name = String(food.name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const quantity = Number(food.quantity || 0);
  const warnings = [];
  if (quantity > 600) warnings.push(`Cantidad elevada: ${rounded(quantity)} ${food.unit}`);
  if (/(aceite)/.test(name) && quantity > 60) warnings.push(`Aceite elevado: ${rounded(quantity)} ${food.unit}`);
  if (/(almendra|nueces|avellana|castana|mani|pistacho|semilla)/.test(name) && quantity > 100) {
    warnings.push(`Fruto seco/semilla elevado: ${rounded(quantity)} ${food.unit}`);
  }
  if (["desayuno", "merienda", "snack", "colacion"].includes(mealType) && /(pollo|carne|merluza|pescado|atun|higado)/.test(name)) {
    warnings.push("Proteína de plato principal en una comida liviana.");
  }
  if (["almuerzo", "cena"].includes(mealType) && /(whey|yogurt|leche descremada|jamon cocido)/.test(name)) {
    warnings.push("Componente de comida liviana en almuerzo/cena.");
  }
  return warnings;
}

function summarizeMenu(preview, mealTypes, seed, elapsedMs) {
  const trace = preview.generationMeta?.trace || [];
  const meals = (preview.comidas || []).map((meal, index) => {
    const mealTrace = trace.find((entry) => entry.slotIndex === index) || {};
    const foods = (meal.items || []).map((food) => ({
      id: String(food.alimentoId || ""),
      name: food.nombreSnapshot || food.nombre || "Alimento",
      quantity: rounded(food.cantidad),
      unit: food.unidad || food.unidadSnapshot || "g",
      kcal: rounded(food.kcal),
      protein: rounded(food.proteina),
      carbs: rounded(food.carbs),
      fat: rounded(food.grasas),
    }));
    return {
      type: meal.tipoComida || mealTypes[index],
      target: mealTrace.target || meal.target,
      actual: mealTrace.actual || null,
      structure: mealTrace.solver?.structure || "",
      relaxation: mealTrace.solver?.relaxation || null,
      solverMeta: mealTrace.solver?.meta || null,
      foods,
      culinaryWarnings: foods.flatMap((food) => foodWarnings(food, meal.tipoComida || mealTypes[index])),
    };
  });
  return {
    seed,
    status: "OK",
    mealCount: meals.length,
    target: preview.generationMeta?.dailyTarget,
    totals: preview.generationMeta?.resultTotals,
    difference: preview.generationMeta?.difference,
    elapsedMs: rounded(elapsedMs),
    warnings: preview.warnings || [],
    meals,
  };
}

function reportMarkdown(report) {
  const lines = [
    "# Generaciones reales posteriores a la curación",
    "",
    `- Base: ${report.database}`,
    `- Catálogo antes/después: ${report.safety.totalBefore}/${report.safety.totalAfter}`,
    `- Fingerprint generation sin cambios: ${report.safety.generationUnchanged}`,
    `- Corridas: ${report.summary.runs}, exitosas: ${report.summary.successful}, fallidas: ${report.summary.failed}`,
    "",
  ];
  report.runs.forEach((run) => {
    lines.push(`## ${run.requestedMealCount} comidas · corrida ${run.run}`, "");
    if (run.status !== "OK") {
      lines.push(`- ERROR ${run.code}: ${run.error}`, "");
      return;
    }
    lines.push(`- Seed: ${run.seed}`);
    lines.push(`- Totales: ${rounded(run.totals.kcal)} kcal · P ${rounded(run.totals.proteina)} · C ${rounded(run.totals.carbs)} · G ${rounded(run.totals.grasas)}`);
    lines.push(`- Diferencia: kcal ${rounded(run.difference.kcal)} · P ${rounded(run.difference.proteina)} · C ${rounded(run.difference.carbs)} · G ${rounded(run.difference.grasas)}`, "");
    run.meals.forEach((meal) => {
      lines.push(`### ${meal.type} · ${meal.structure || "estructura no informada"}`, "");
      meal.foods.forEach((food) => lines.push(`- ${food.name}: ${food.quantity} ${food.unit} · ${food.kcal} kcal · P ${food.protein} · C ${food.carbs} · G ${food.fat}`));
      meal.culinaryWarnings.forEach((warning) => lines.push(`- ⚠ ${warning}`));
      lines.push("");
    });
  });
  return `${lines.join("\n")}\n`;
}

async function main() {
  await CnxMongoDB.conectar();
  if (!CnxMongoDB.connection || !CnxMongoDB.db) throw new Error("No se pudo conectar a MongoDB.");
  const model = new ModelMongoDBAlimentos();
  const collection = CnxMongoDB.db.collection("fooddatabase2");
  const beforeDocuments = await collection.find({}).sort({ _id: 1 }).toArray();
  const beforeFingerprint = stableGenerationFingerprint(beforeDocuments);
  const runs = [];

  const automaticMealGenerator = async (payload) => generateMealAlternative({
    mealType: payload.mealType,
    target: payload.target,
    requiredFoodIds: payload.requiredFoodIds,
    excludedFoodIds: payload.excludedFoodIds,
    generationMode: payload.strategy === "selected_only"
      ? FOOD_COMBINATION_MODES.ONLY_SELECTED_FOODS
      : FOOD_COMBINATION_MODES.ALLOW_SUGGESTIONS,
    variantSeed: payload.variantSeed,
    limit: payload.limit,
    maxFoods: 6,
  }, { model });

  for (const [countText, mealTypes] of Object.entries(patterns)) {
    const requestedMealCount = Number(countText);
    if (!selectedCounts.has(requestedMealCount)) continue;
    for (let run = runStart; run <= runEnd; run += 1) {
      const seed = `curation-real-${requestedMealCount}-${run}`;
      const startedAt = performance.now();
      try {
        const preview = await generateClientMenuPreview({
          target: dailyTarget,
          mealTypes,
          selectedDays: ["lunes"],
          sourceMode: "combined",
          generationMode: "from_scratch",
          foods: [],
          plannedMeals: [],
          useOnlySelectedFoods: false,
          allowRepeats: false,
          calorieDistributionMode: "balanced",
          freeCalories: 0,
          variantSeed: seed,
          automaticMealGenerator,
        });
        runs.push({ requestedMealCount, run, ...summarizeMenu(preview, mealTypes, seed, performance.now() - startedAt) });
      } catch (error) {
        runs.push({
          requestedMealCount,
          run,
          seed,
          status: "ERROR",
          code: error?.code || "UNKNOWN",
          error: error?.message || String(error),
          details: error?.details || null,
          elapsedMs: rounded(performance.now() - startedAt),
        });
      }
    }
  }

  const afterDocuments = await collection.find({}).sort({ _id: 1 }).toArray();
  const afterFingerprint = stableGenerationFingerprint(afterDocuments);
  const successfulByMealCount = Object.fromEntries([...selectedCounts].sort().map((count) => [
    count,
    runs.filter((run) => run.requestedMealCount === count && run.status === "OK").length,
  ]));
  const report = {
    generatedAt: new Date().toISOString(),
    database: process.env.MONGO_DB || process.env.BASE || "test",
    collection: "fooddatabase2",
    mode: "read-only preview; no menu or tracking persistence",
    dailyTarget,
    safety: {
      totalBefore: beforeDocuments.length,
      totalAfter: afterDocuments.length,
      generationFingerprintBefore: beforeFingerprint,
      generationFingerprintAfter: afterFingerprint,
      generationUnchanged: beforeFingerprint === afterFingerprint,
    },
    summary: {
      runs: runs.length,
      successful: runs.filter((run) => run.status === "OK").length,
      failed: runs.filter((run) => run.status !== "OK").length,
      culinaryWarnings: runs.flatMap((run) => run.meals || []).flatMap((meal) => meal.culinaryWarnings || []).length,
      successfulByMealCount,
      acceptanceReached: Object.values(successfulByMealCount).every((count) => count >= 2),
    },
    runs,
  };
  const basename = `real-generation-smoke${outputSuffix ? `-${outputSuffix}` : ""}`;
  await writeFile(path.join(outputDirectory, `${basename}.json`), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(path.join(outputDirectory, `${basename}.md`), reportMarkdown(report), "utf8");
  console.log(JSON.stringify({ summary: report.summary, safety: report.safety }, null, 2));
  if (!report.safety.generationUnchanged || !report.summary.acceptanceReached) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await CnxMongoDB.desconectar();
  });
