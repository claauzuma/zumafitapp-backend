import dotenv from "dotenv";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

import CnxMongoDB from "../model/DBMongo.js";
import ModelMongoDBAlimentos from "../model/DAO/alimentosMongoDB.js";
import {
  FOOD_COMBINATION_MODES,
} from "../servicio/foodCombinationCandidates.js";
import { normalizeFoodGenerationForRead } from "../servicio/foodGenerationMetadata.js";
import { generateMealAlternative } from "../servicio/mealAlternativeGenerator.js";
import {
  mealCompositionOverlap,
  normalizeMealComposition,
} from "../servicio/mealCompositionDiversity.js";
import {
  generateClientMenuPreview,
  generatedMealComposition,
  generatedMealFingerprint,
} from "../../../zumafitront/src/clientMenus/clientMenuGeneration.js";
import {
  mealHasPlannedContent,
  normalizeDayNutritionTarget,
  plannedMealNutrition,
} from "../../../zumafitront/src/clientMenus/clientMenuDayPlanner.js";

dotenv.config();

const OUTPUT_DIRECTORY = path.resolve("artifacts", "automatic-daily-menu-audit");
const REPORT_SUFFIX = String(process.env.DAILY_AUDIT_SUFFIX || "")
  .trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
const JSON_FILE = path.join(
  OUTPUT_DIRECTORY,
  `automatic-daily-menu-functional-audit${REPORT_SUFFIX ? `-${REPORT_SUFFIX}` : ""}.json`,
);
const MARKDOWN_FILE = path.join(
  OUTPUT_DIRECTORY,
  `AUTOMATIC_DAILY_MENU_FUNCTIONAL_AUDIT${REPORT_SUFFIX ? `-${REPORT_SUFFIX.toUpperCase()}` : ""}.md`,
);
const NUTRIENTS = ["kcal", "proteina", "carbs", "grasas"];
const MEAL_TYPES = Object.freeze({
  3: ["desayuno", "almuerzo", "cena"],
  4: ["desayuno", "almuerzo", "merienda", "cena"],
  5: ["desayuno", "almuerzo", "merienda", "cena", "snack"],
  6: ["desayuno", "colacion", "almuerzo", "merienda", "cena", "snack"],
});
const CUSTOM_PERCENTAGES = Object.freeze({
  3: { desayuno: 25, almuerzo: 40, cena: 35 },
  4: { desayuno: 20, almuerzo: 35, merienda: 20, cena: 25 },
  5: { desayuno: 15, almuerzo: 25, merienda: 20, cena: 25, snack: 15 },
  6: { desayuno: 15, colacion: 15, almuerzo: 20, merienda: 15, cena: 20, snack: 15 },
});

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

function macroTarget(kcal, proteina, grasas) {
  return {
    kcal,
    proteina,
    carbs: round((kcal - proteina * 4 - grasas * 9) / 4, 2),
    grasas,
  };
}

const DAILY_MATRIX = Object.freeze([
  { count: 3, variant: "low-balanced", target: macroTarget(1500, 105, 50), mode: "balanced" },
  { count: 3, variant: "medium-custom", target: macroTarget(2100, 140, 65), mode: "custom" },
  { count: 3, variant: "high-protein", target: macroTarget(1800, 180, 55), mode: "balanced" },
  { count: 4, variant: "low-custom", target: macroTarget(1700, 120, 55), mode: "custom" },
  { count: 4, variant: "medium-balanced", target: macroTarget(2000, 140, 60), mode: "balanced" },
  { count: 4, variant: "high-balanced", target: macroTarget(2400, 165, 75), mode: "balanced" },
  { count: 5, variant: "low-balanced", target: macroTarget(1900, 135, 60), mode: "balanced" },
  { count: 5, variant: "medium-custom", target: macroTarget(2300, 170, 70), mode: "custom" },
  { count: 5, variant: "high-balanced", target: macroTarget(2800, 195, 85), mode: "balanced" },
  { count: 6, variant: "low-custom", target: macroTarget(2200, 150, 70), mode: "custom" },
  { count: 6, variant: "medium-balanced", target: macroTarget(2600, 190, 80), mode: "balanced" },
  { count: 6, variant: "high-balanced", target: macroTarget(3000, 210, 90), mode: "balanced" },
]);

function stableValue(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value?.toHexString === "function") return value.toHexString();
  if (Array.isArray(value)) return value.map(stableValue);
  if (typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function hash(value) {
  return createHash("sha256").update(JSON.stringify(stableValue(value))).digest("hex");
}

function catalogFingerprint(documents = []) {
  return hash([...documents]
    .sort((left, right) => String(left?._id || "").localeCompare(String(right?._id || "")))
    .map(stableValue));
}

function generationFingerprint(documents = []) {
  return hash([...documents]
    .sort((left, right) => String(left?._id || "").localeCompare(String(right?._id || "")))
    .map((document) => ({ id: String(document?._id || ""), generation: document?.generation ?? null })));
}

function foodAliases(food = {}) {
  return new Set([food._id, food.id, food.alimentoId]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean));
}

function createSnapshotModel(snapshot = []) {
  const counts = {
    obtenerAlimentos: 0,
    obtenerAlimentosPorIds: 0,
    obtenerAlimentoPorId: 0,
    obtenerAlimentosGeneracionAutomatica: 0,
  };
  const findById = (id) => snapshot.find((food) => foodAliases(food).has(String(id)));
  return {
    obtenerAlimentos: async () => {
      counts.obtenerAlimentos += 1;
      return snapshot;
    },
    obtenerAlimentosPorIds: async (ids = []) => {
      counts.obtenerAlimentosPorIds += 1;
      return ids.map(findById).filter(Boolean);
    },
    obtenerAlimentoPorId: async (id) => {
      counts.obtenerAlimentoPorId += 1;
      return findById(id) || null;
    },
    obtenerAlimentosGeneracionAutomatica: async ({ mealType, roles = [] } = {}) => {
      counts.obtenerAlimentosGeneracionAutomatica += 1;
      return snapshot.filter((food) => {
        if (food?.activo === false) return false;
        const generation = normalizeFoodGenerationForRead(food?.generation);
        return generation.mode === "GENERIC" &&
          generation.mealTypes[mealType] === true &&
          roles.some((role) => generation.roles[role] === true);
      });
    },
    queryCounts: () => ({ ...counts }),
  };
}

function nutrition(value = {}) {
  return normalizeDayNutritionTarget(value);
}

function add(left = {}, right = {}) {
  const a = nutrition(left);
  const b = nutrition(right);
  return Object.fromEntries(NUTRIENTS.map((key) => [key, round(a[key] + b[key], 6)]));
}

function subtract(left = {}, right = {}) {
  const a = nutrition(left);
  const b = nutrition(right);
  return Object.fromEntries(NUTRIENTS.map((key) => [key, round(a[key] - b[key], 6)]));
}

function closeNutrition(left = {}, right = {}, tolerance = 0.02) {
  const a = nutrition(left);
  const b = nutrition(right);
  return NUTRIENTS.every((key) => Math.abs(a[key] - b[key]) <= tolerance);
}

function foodName(food = {}) {
  return String(food.Alimentos || food.nombre || food.name || "Alimento").trim();
}

function foodInput(food, targetMealType, mustAppear = true) {
  return {
    id: String(food._id || food.id || food.alimentoId),
    nombre: foodName(food),
    targetMealType,
    mustAppear,
  };
}

function findFood(snapshot, name) {
  const normalized = String(name).trim().toLowerCase();
  const result = snapshot.find((food) => foodName(food).toLowerCase() === normalized);
  if (!result) throw new Error(`No se encontró ${name} en el snapshot real.`);
  return result;
}

function mealFoods(meal = {}) {
  if (Array.isArray(meal.items)) return meal.items;
  if (Array.isArray(meal.foods)) return meal.foods;
  if (Array.isArray(meal.alimentos)) return meal.alimentos;
  return [];
}

function summarizeFoods(meal = {}) {
  return mealFoods(meal).map((food) => ({
    id: String(food.alimentoId || food.foodId || food.id || food._id || ""),
    name: String(food.nombreSnapshot || food.nombre || food.name || "Alimento"),
    quantity: round(food.cantidad ?? food.quantity, 4),
    unit: String(food.unidadSnapshot || food.unidad || food.unit || "g"),
    nutrition: nutrition(food),
  }));
}

function makeManualMeal({ id, type, actual = {}, target = null, omitted = [], totals = null, source = "manual" }) {
  const item = {
    id: `${id}-food`,
    alimentoId: `${id}-food`,
    nombreSnapshot: `Contenido ${id}`,
    cantidad: 1,
    unidad: "unidad",
  };
  for (const key of NUTRIENTS) {
    if (!omitted.includes(key)) item[key] = Number(actual[key] || 0);
  }
  return {
    id,
    nombre: id,
    tipoComida: type,
    generationSource: source,
    ...(target ? { target } : {}),
    ...(totals ? { totals } : {}),
    items: [item],
  };
}

function expectedFixedTotals(plannedMeals = []) {
  return plannedMeals
    .filter(mealHasPlannedContent)
    .reduce((total, meal) => add(total, plannedMealNutrition(meal)), nutrition());
}

function percentile(values = [], ratio = 0.95) {
  const sorted = [...values].filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))];
}

function timing(values = []) {
  return {
    samples: values.length,
    averageMs: round(values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)),
    p95Ms: round(percentile(values, 0.95)),
    maxMs: round(Math.max(0, ...values)),
  };
}

function callSummary(payload, result, elapsedMs) {
  return {
    mealType: payload.mealType,
    strategy: payload.strategy,
    target: nutrition(payload.target),
    requiredFoodIds: payload.requiredFoodIds || [],
    excludedFoodIds: payload.excludedFoodIds || [],
    variantSeed: payload.variantSeed || "",
    diversityContextMeals: payload.diversityContext?.previousMeals?.length || 0,
    elapsedMs: round(elapsedMs),
    status: result?.status || null,
    classification: result?.classification || result?.alternative?.classification || null,
    usable: result?.usable === true,
    relaxation: result?.relaxation || null,
    structure: result?.alternative?.structure || null,
    solutionCounts: {
      candidates: result?.meta?.combinationCandidatesEvaluated || 0,
      executions: result?.meta?.totalCandidateExecutions || 0,
      physical: result?.meta?.quantitySolutionsFound || 0,
      recommended: result?.meta?.recommendedSolutionsFound || 0,
      bestEffort: result?.meta?.bestEffortSolutionsFound || 0,
      variantPool: result?.meta?.variantPoolSize || 0,
      uniqueCompositions: result?.meta?.uniqueCompositionSolutions || 0,
    },
    selectedComposition: result?.meta?.selectedCompositionFingerprint || null,
    selectedDiversity: result?.meta?.selectedDiversity || null,
    repeatInevitable: result?.meta?.repeatInevitable === true,
  };
}

function mealCompositionDiversity(meals = []) {
  const generated = meals.filter((meal) => meal.orchestrationStatus === "generated");
  const pairs = [];
  for (let left = 0; left < generated.length; left += 1) {
    for (let right = left + 1; right < generated.length; right += 1) {
      const overlap = mealCompositionOverlap(generated[left].composition, generated[right].composition);
      pairs.push({
        leftIndex: generated[left].index,
        rightIndex: generated[right].index,
        leftType: generated[left].type,
        rightType: generated[right].type,
        ...overlap,
      });
    }
  }
  return {
    generatedMeals: generated.length,
    uniqueCompositions: new Set(generated.map((meal) => meal.composition.fingerprint)).size,
    exactRepeats: pairs.filter((pair) => pair.exact).length,
    highOverlaps: pairs.filter((pair) => pair.highOverlap).length,
    pairs,
  };
}

function previewMealSummary(preview, meal, index) {
  const trace = (preview?.generationMeta?.trace || []).find((entry) => Number(entry.slotIndex) === index) || {};
  const actual = plannedMealNutrition(meal);
  const composition = normalizeMealComposition(generatedMealComposition(meal));
  return {
    index,
    id: String(meal?.id || meal?._id || ""),
    type: String(meal?.tipoComida || meal?.mealType || ""),
    name: String(meal?.nombre || meal?.name || `Comida ${index + 1}`),
    orchestrationStatus: trace.status || "unknown",
    target: trace.target || meal?.target || null,
    foods: summarizeFoods(meal),
    actual,
    classification: meal?.classification || trace?.solver?.classification || null,
    recommended: typeof meal?.recommended === "boolean" ? meal.recommended : null,
    usable: typeof meal?.usable === "boolean" ? meal.usable : trace?.solver?.usable ?? null,
    warning: Array.isArray(meal?.warnings) ? meal.warnings[0] || null : null,
    remainingBefore: trace.remainingBefore || null,
    remainingAfter: trace.remainingAfter || null,
    solver: trace.solver || null,
    fingerprint: mealHasPlannedContent(meal) ? generatedMealFingerprint(meal) : "",
    composition,
    compositionFingerprint: composition.fingerprint,
  };
}

function validatePreview({ preview, input, calls }) {
  const failures = [];
  const mealTypes = input.mealTypes || [];
  const planned = input.plannedMeals || [];
  const fixed = planned.filter(mealHasPlannedContent);
  const targetOnly = planned.filter((meal) => !mealHasPlannedContent(meal));
  const meals = preview?.comidas || [];
  const meta = preview?.generationMeta || {};
  const summaries = meals.map((meal, index) => previewMealSummary(preview, meal, index));

  if (meals.length !== mealTypes.length) failures.push(`Se esperaban ${mealTypes.length} comidas y salieron ${meals.length}.`);
  if (meta.fixedMealCount !== fixed.length) failures.push(`fixedMealCount=${meta.fixedMealCount}, esperado=${fixed.length}.`);
  if (meta.generatedMealCount !== mealTypes.length - fixed.length) {
    failures.push(`generatedMealCount=${meta.generatedMealCount}, esperado=${mealTypes.length - fixed.length}.`);
  }
  if (calls.length !== mealTypes.length - fixed.length) {
    failures.push(`Invocaciones al generador=${calls.length}, esperado=${mealTypes.length - fixed.length}.`);
  }
  if (!closeNutrition(meta.fixedTotals, expectedFixedTotals(planned))) {
    failures.push("fixedTotals no coincide con los totales físicos preservados.");
  }
  for (const original of fixed) {
    const preserved = meals.find((meal) => String(meal?.id || meal?._id || "") === String(original?.id || original?._id || ""));
    if (!preserved || hash(preserved) !== hash(original)) failures.push(`La comida fija ${original.id} no quedó byte-for-byte intacta.`);
  }
  for (const empty of targetOnly) {
    if (meals.some((meal) => String(meal?.id || meal?._id || "") === String(empty?.id || empty?._id || ""))) {
      failures.push(`El slot vacío ${empty.id} fue contado como comida preservada.`);
    }
  }

  for (const summary of summaries.filter((meal) => meal.orchestrationStatus === "generated")) {
    if (!["RECOMMENDED", "BEST_EFFORT"].includes(summary.classification) || summary.usable !== true) {
      failures.push(`${summary.type} no produjo un resultado central utilizable.`);
    }
    if (!closeNutrition(summary.remainingAfter, subtract(summary.remainingBefore, summary.actual))) {
      failures.push(`Carry inconsistente después de ${summary.type}.`);
    }
    if (summary.classification !== summary.solver?.classification) {
      failures.push(`Clasificación divergente frontend/backend en ${summary.type}.`);
    }
  }

  const summed = meals.reduce((total, meal) => add(total, plannedMealNutrition(meal)), nutrition());
  if (!closeNutrition(summed, meta.resultTotals)) failures.push("resultTotals no coincide con la suma física de comidas.");
  if (!closeNutrition(meta.difference, subtract(summed, preview.plannedTarget))) {
    failures.push("difference diario no coincide con actual - target.");
  }
  const lastGenerated = [...summaries].reverse().find((meal) => meal.orchestrationStatus === "generated");
  if (lastGenerated) {
    const expectedLastTarget = Object.fromEntries(NUTRIENTS.map((key) => [
      key,
      round(Math.max(0, Number(lastGenerated.remainingBefore?.[key] || 0)), 2),
    ]));
    if (!closeNutrition(lastGenerated.target, expectedLastTarget)) {
      failures.push("La última comida no recibió el residual positivo completo.");
    }
  }

  return { failures, meals: summaries };
}

async function runPreviewCase(snapshot, definition) {
  const model = createSnapshotModel(snapshot);
  const calls = [];
  const automaticMealGenerator = async (payload = {}) => {
    const startedAt = performance.now();
    const generationMode = payload.strategy === "selected_only" && payload.requiredFoodIds?.length
      ? FOOD_COMBINATION_MODES.ONLY_SELECTED_FOODS
      : FOOD_COMBINATION_MODES.ALLOW_SUGGESTIONS;
    const result = await generateMealAlternative({
      mealType: payload.mealType,
      target: payload.target,
      requiredFoodIds: payload.requiredFoodIds || [],
      excludedFoodIds: payload.excludedFoodIds || [],
      generationMode,
      variantSeed: payload.variantSeed,
      diversityContext: payload.diversityContext,
      limit: payload.limit || 32,
      maxFoods: 6,
    }, { model });
    calls.push(callSummary(payload, result, performance.now() - startedAt));
    return result;
  };
  const input = {
    target: definition.target,
    mealTypes: definition.mealTypes,
    selectedDays: ["monday"],
    selectedDate: "2026-08-25",
    sourceMode: "foods",
    generationMode: "from_scratch",
    foods: definition.foods || [],
    plannedMeals: definition.plannedMeals || [],
    diversityMeals: definition.diversityMeals || [],
    useOnlySelectedFoods: definition.useOnlySelectedFoods === true,
    allowRepeats: false,
    assisted: definition.assisted === true,
    calorieDistributionMode: definition.distributionMode || "balanced",
    calorieDistributionPercents: definition.distributionPercentages || {},
    variantSeed: definition.seed,
    automaticMealGenerator,
  };
  const startedAt = performance.now();
  try {
    const preview = await generateClientMenuPreview(input);
    const elapsedMs = performance.now() - startedAt;
    const validation = validatePreview({ preview, input, calls });
    return {
      id: definition.id,
      group: definition.group,
      intent: definition.intent,
      input: {
        dailyTarget: nutrition(definition.target),
        mealTypes: definition.mealTypes,
        mealCount: definition.mealTypes.length,
        distributionMode: input.calorieDistributionMode,
        distributionPercentages: input.calorieDistributionPercents,
        seed: definition.seed,
        useOnlySelectedFoods: input.useOnlySelectedFoods,
        assisted: input.assisted,
        selectedFoods: input.foods,
        plannedMeals: input.plannedMeals.map((meal) => ({
          id: meal.id,
          type: meal.tipoComida,
          hasPhysicalContent: mealHasPlannedContent(meal),
          declaredTarget: meal.target || null,
          physicalTotals: plannedMealNutrition(meal),
        })),
        diversityMealCompositions: input.diversityMeals.map(generatedMealComposition),
      },
      result: {
        status: validation.failures.length ? "FAIL" : "PASS",
        failures: validation.failures,
        elapsedMs: round(elapsedMs),
        generatorInvocations: calls.length,
        distribution: preview.generationMeta.distribution,
        fixedTotals: preview.generationMeta.fixedTotals,
        dailyTotals: preview.generationMeta.resultTotals,
        dailyDifference: preview.generationMeta.difference,
        remainingRaw: preview.generationMeta.remainingRaw,
        warnings: preview.generationMeta.warnings || [],
        meals: validation.meals,
        compositionDiversity: mealCompositionDiversity(validation.meals),
        menuFingerprint: hash(validation.meals.map((meal) => meal.fingerprint)),
        semanticMenuFingerprint: hash(validation.meals.map((meal) => meal.compositionFingerprint)),
      },
      calls,
      snapshotQueries: model.queryCounts(),
      preview,
    };
  } catch (error) {
    return {
      id: definition.id,
      group: definition.group,
      intent: definition.intent,
      input: {
        dailyTarget: nutrition(definition.target),
        mealTypes: definition.mealTypes,
        seed: definition.seed,
        plannedMealIds: (definition.plannedMeals || []).map((meal) => meal.id),
      },
      result: {
        status: "FAIL",
        failures: [String(error?.message || error)],
        errorCode: error?.code || null,
        elapsedMs: round(performance.now() - startedAt),
        generatorInvocations: calls.length,
      },
      calls,
      snapshotQueries: model.queryCounts(),
      preview: null,
    };
  }
}

function withoutPreview(caseResult) {
  const clean = { ...caseResult };
  delete clean.preview;
  return clean;
}

function manualFixtures() {
  const declared = { kcal: 430, proteina: 30, carbs: 45, grasas: 12 };
  return {
    zeroMacros: makeManualMeal({
      id: "manual-zero-macros",
      type: "desayuno",
      actual: { kcal: 165, proteina: 31, carbs: 0, grasas: 0 },
      target: declared,
    }),
    imperfect: makeManualMeal({
      id: "manual-imperfect",
      type: "almuerzo",
      actual: { kcal: 515, proteina: 28, carbs: 72, grasas: 13 },
      target: { kcal: 600, proteina: 45, carbs: 65, grasas: 18 },
    }),
    fromMealTarget: makeManualMeal({
      id: "created-from-meal-target",
      type: "merienda",
      actual: { kcal: 355, proteina: 24, carbs: 42, grasas: 9 },
      target: { kcal: 400, proteina: 30, carbs: 45, grasas: 10 },
      source: "meal_target",
    }),
    missingMacros: makeManualMeal({
      id: "legacy-missing-cg",
      type: "desayuno",
      actual: { kcal: 220, proteina: 35, carbs: 0, grasas: 0 },
      target: declared,
      omitted: ["carbs", "grasas"],
    }),
    aggregateOnly: makeManualMeal({
      id: "legacy-aggregate-zero",
      type: "desayuno",
      actual: nutrition(),
      target: declared,
      omitted: NUTRIENTS,
      totals: { kcal: 220, proteina: 35, carbs: 0, grasas: 0 },
    }),
    targetOnly: {
      id: "target-only-empty-slot",
      nombre: "Meta sin alimentos",
      tipoComida: "almuerzo",
      target: { kcal: 500, proteina: 35, carbs: 60, grasas: 14 },
      items: [],
    },
  };
}

async function main() {
  await CnxMongoDB.conectar();
  if (!CnxMongoDB.connection || !CnxMongoDB.db) throw new Error("No se pudo conectar a MongoDB.");
  const databaseModel = new ModelMongoDBAlimentos();
  const before = await databaseModel.obtenerAlimentos();
  const catalogBefore = catalogFingerprint(before);
  const generationBefore = generationFingerprint(before);
  const cases = [];

  for (const definition of DAILY_MATRIX) {
    cases.push(await runPreviewCase(before, {
      id: `daily-${definition.count}-${definition.variant}`,
      group: "daily-matrix",
      intent: `${definition.count} comidas, ${definition.variant}`,
      target: definition.target,
      mealTypes: MEAL_TYPES[definition.count],
      distributionMode: definition.mode,
      distributionPercentages: definition.mode === "custom" ? CUSTOM_PERCENTAGES[definition.count] : {},
      seed: `daily-audit-${definition.count}-${definition.variant}`,
    }));
  }

  const fixtures = manualFixtures();
  const partialDefinitions = [
    { id: "partial-empty", plannedMeals: [], intent: "Día vacío" },
    { id: "partial-one-zero", plannedMeals: [fixtures.zeroMacros], intent: "Una comida con C/G físicos en cero" },
    { id: "partial-two-existing", plannedMeals: [fixtures.zeroMacros, fixtures.imperfect], intent: "Dos comidas reales imperfectas" },
    { id: "partial-created-from-target", plannedMeals: [fixtures.fromMealTarget], intent: "Comida creada previamente por meta" },
    { id: "partial-target-only", plannedMeals: [fixtures.targetOnly], intent: "Slot con meta pero sin alimentos" },
    { id: "partial-missing-fields", plannedMeals: [fixtures.missingMacros], intent: "C/G ausentes: no heredar meta" },
    { id: "partial-aggregate-zero", plannedMeals: [fixtures.aggregateOnly], intent: "Items legacy sin macros y agregado físico C/G=0" },
  ];
  for (const definition of partialDefinitions) {
    cases.push(await runPreviewCase(before, {
      ...definition,
      group: "partial-days",
      target: macroTarget(2000, 140, 60),
      mealTypes: MEAL_TYPES[4],
      distributionMode: "balanced",
      seed: `daily-audit-${definition.id}`,
    }));
  }

  const inputFor = (name, type) => foodInput(findFood(before, name), type);
  cases.push(await runPreviewCase(before, {
    id: "daily-selected-only-real",
    group: "food-modes",
    intent: "ONLY_SELECTED real: tres pares explícitos y ningún alimento agregado",
    target: macroTarget(1800, 135, 55),
    mealTypes: MEAL_TYPES[3],
    distributionMode: "custom",
    distributionPercentages: CUSTOM_PERCENTAGES[3],
    seed: "daily-audit-selected-only",
    useOnlySelectedFoods: true,
    foods: [
      inputFor("Whey protein SN", "desayuno"),
      inputFor("Avena instantanea", "desayuno"),
      inputFor("Pechuga de pollo", "almuerzo"),
      inputFor("Arroz", "almuerzo"),
      inputFor("Lubina", "cena"),
      inputFor("Fideos (Cocidos)", "cena"),
    ],
  }));
  cases.push(await runPreviewCase(before, {
    id: "daily-assisted-explicit-only-real",
    group: "food-modes",
    intent: "ALLOW_SUGGESTIONS conserva un EXPLICIT_ONLY elegido y completa con GENERIC",
    target: macroTarget(2000, 140, 60),
    mealTypes: MEAL_TYPES[4],
    distributionMode: "balanced",
    seed: "daily-audit-assisted-explicit",
    assisted: true,
    foods: [inputFor("Bife de chorizo magro", "almuerzo")],
  }));

  const baseline = cases.find((entry) => entry.id === "partial-one-zero");
  if (baseline?.preview) {
    const originalMeals = baseline.preview.comidas;
    const originalPreserved = new Set((baseline.preview.generationMeta.trace || [])
      .filter((entry) => entry.status === "preserved")
      .map((entry) => Number(entry.slotIndex)));
    for (const regeneration of [
      { id: "regenerate-middle", index: 2, intent: "Regenera intermedia y recalcula posteriores" },
      { id: "regenerate-last", index: 3, intent: "Regenera sólo la última automática" },
      { id: "regenerate-full", index: null, intent: "Regenera todo salvo manuales originales" },
    ]) {
      const plannedMeals = originalMeals.filter((meal, index) => (
        originalPreserved.has(index) || (regeneration.index !== null && index < regeneration.index)
      ));
      cases.push(await runPreviewCase(before, {
        ...regeneration,
        group: "regeneration",
        target: macroTarget(2000, 140, 60),
        mealTypes: MEAL_TYPES[4],
        plannedMeals,
        diversityMeals: originalMeals,
        distributionMode: "balanced",
        seed: `daily-audit-${regeneration.id}`,
      }));
    }
  }

  const diversityCases = [];
  for (let index = 0; index < 6; index += 1) {
    const result = await runPreviewCase(before, {
      id: `other-option-seed-${index + 1}`,
      group: "diversity",
      intent: "Mismo input, seed distinto",
      target: macroTarget(2000, 140, 60),
      mealTypes: MEAL_TYPES[4],
      distributionMode: "balanced",
      seed: `daily-audit-option-${index + 1}`,
    });
    diversityCases.push(result);
    cases.push(result);
  }

  const after = await databaseModel.obtenerAlimentos();
  const catalogAfter = catalogFingerprint(after);
  const generationAfter = generationFingerprint(after);
  const cleanCases = cases.map(withoutPreview);
  const matrixCases = cleanCases.filter((entry) => entry.group === "daily-matrix");
  const performanceByMealCount = Object.fromEntries([3, 4, 5, 6].map((count) => {
    const selected = matrixCases.filter((entry) => entry.input.mealCount === count);
    return [count, {
      wall: timing(selected.map((entry) => entry.result.elapsedMs)),
      generatorInvocations: selected.reduce((sum, entry) =>
        sum + entry.result.generatorInvocations, 0),
      invocationsPerDay: selected.map((entry) => entry.result.generatorInvocations),
    }];
  }));
  const distinctMenuFingerprints = new Set(diversityCases
    .map((entry) => entry.result.menuFingerprint)
    .filter(Boolean));
  const distinctSemanticMenuFingerprints = new Set(diversityCases
    .map((entry) => entry.result.semanticMenuFingerprint)
    .filter(Boolean));
  const diversity = {
    samples: diversityCases.length,
    distinctMenus: distinctMenuFingerprints.size,
    repeatedMenus: diversityCases.length - distinctMenuFingerprints.size,
    distinctSemanticMenus: distinctSemanticMenuFingerprints.size,
    repeatedSemanticMenus: diversityCases.length - distinctSemanticMenuFingerprints.size,
    fingerprints: diversityCases.map((entry) => ({
      id: entry.id,
      fingerprint: entry.result.menuFingerprint || null,
      semanticFingerprint: entry.result.semanticMenuFingerprint || null,
      mealFingerprints: entry.result.meals?.map((meal) => meal.fingerprint) || [],
      mealCompositionFingerprints: entry.result.meals?.map((meal) => meal.compositionFingerprint) || [],
      variantPools: entry.calls.map((call) => call.solutionCounts.variantPool),
      physicalSolutions: entry.calls.map((call) => call.solutionCounts.physical),
    })),
  };
  const report = {
    generatedAt: new Date().toISOString(),
    mode: "read-only integrated frontend daily orchestrator + existing backend combiner/solver/policy",
    contract: {
      policy: "meal_generation_balanced_v1",
      candidateLimit: 32,
      frontendEntrypoint: "src/clientMenus/clientMenuGeneration.js::generateClientMenuPreview",
      dailyOrchestrator: "src/clientMenus/clientMenuDayPlanner.js::generateSequentialMenuDay",
      backendEntrypoint: "servicio/mealAlternativeGenerator.js::generateMealAlternative",
    },
    safety: {
      snapshotDocumentsBefore: before.length,
      snapshotDocumentsAfter: after.length,
      directMongoReads: 2,
      directMongoWrites: 0,
      catalogFingerprintBefore: catalogBefore,
      catalogFingerprintAfter: catalogAfter,
      generationFingerprintBefore: generationBefore,
      generationFingerprintAfter: generationAfter,
      catalogUnchanged: catalogBefore === catalogAfter,
      generationUnchanged: generationBefore === generationAfter,
      databaseUnchanged: before.length === after.length && catalogBefore === catalogAfter,
    },
    summary: {
      totalCases: cleanCases.length,
      passed: cleanCases.filter((entry) => entry.result.status === "PASS").length,
      failed: cleanCases.filter((entry) => entry.result.status === "FAIL").length,
      generatorInvocations: cleanCases.reduce((sum, entry) =>
        sum + Number(entry.result.generatorInvocations || 0), 0),
      recommendedMeals: cleanCases.flatMap((entry) => entry.result.meals || [])
        .filter((meal) => meal.classification === "RECOMMENDED").length,
      bestEffortMeals: cleanCases.flatMap((entry) => entry.result.meals || [])
        .filter((meal) => meal.classification === "BEST_EFFORT").length,
      exactCompositionRepeats: cleanCases.reduce((sum, entry) => (
        sum + Number(entry.result.compositionDiversity?.exactRepeats || 0)
      ), 0),
      highCompositionOverlaps: cleanCases.reduce((sum, entry) => (
        sum + Number(entry.result.compositionDiversity?.highOverlaps || 0)
      ), 0),
      dailyMatrixExactCompositionRepeats: matrixCases.reduce((sum, entry) => (
        sum + Number(entry.result.compositionDiversity?.exactRepeats || 0)
      ), 0),
      dailyMatrixHighCompositionOverlaps: matrixCases.reduce((sum, entry) => (
        sum + Number(entry.result.compositionDiversity?.highOverlaps || 0)
      ), 0),
    },
    performanceByMealCount,
    diversity,
    cases: cleanCases,
  };

  await mkdir(OUTPUT_DIRECTORY, { recursive: true });
  await writeFile(JSON_FILE, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(MARKDOWN_FILE, renderMarkdown(report), "utf8");
  console.log(JSON.stringify({
    json: JSON_FILE,
    markdown: MARKDOWN_FILE,
    safety: report.safety,
    summary: report.summary,
    performanceByMealCount,
    diversity,
    failures: cleanCases
      .filter((entry) => entry.result.status === "FAIL")
      .map((entry) => ({ id: entry.id, failures: entry.result.failures })),
  }, null, 2));
  if (!report.safety.databaseUnchanged || report.summary.failed > 0) process.exitCode = 1;
}

function mdNutrition(value = {}) {
  const item = nutrition(value);
  return `${round(item.kcal, 1)} kcal / P${round(item.proteina, 1)} / C${round(item.carbs, 1)} / G${round(item.grasas, 1)}`;
}

function escapeCell(value) {
  return String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
}

function renderCase(entry) {
  const lines = [
    `### ${entry.id} — ${entry.result.status}`,
    "",
    `- Propósito: ${entry.intent}`,
    `- INPUT: ${mdNutrition(entry.input.dailyTarget)}; ${entry.input.mealTypes.join(", ")}; seed \`${entry.input.seed}\`.`,
    `- Preservadas: ${(entry.input.plannedMeals || []).map((meal) => `${meal.id} (${mdNutrition(meal.physicalTotals)})`).join("; ") || "ninguna"}.`,
    `- Resultado diario: ${mdNutrition(entry.result.dailyTotals)}; diferencia actual-target ${mdNutrition(entry.result.dailyDifference)}.`,
    `- Diversidad interna: ${entry.result.compositionDiversity?.uniqueCompositions || 0}/${entry.result.compositionDiversity?.generatedMeals || 0} composiciones únicas; exactas ${entry.result.compositionDiversity?.exactRepeats || 0}; solapamientos altos ${entry.result.compositionDiversity?.highOverlaps || 0}.`,
    `- Tiempo/generador: ${entry.result.elapsedMs} ms; ${entry.result.generatorInvocations} invocaciones de comida.`,
    `- Motivo: ${entry.result.failures?.length ? entry.result.failures.join("; ") : "invariantes de preservación, carry, totals y contrato central conformes"}.`,
    "",
    "| # | comida | estado | target | actual | alimentos y cantidades | remaining antes → después |",
    "|---:|---|---|---|---|---|---|",
  ];
  for (const meal of entry.result.meals || []) {
    const foods = meal.foods.map((food) => `${food.name} ${food.quantity} ${food.unit}`).join(" + ");
    lines.push(`| ${meal.index + 1} | ${escapeCell(meal.type)} | ${escapeCell(meal.orchestrationStatus)}/${escapeCell(meal.classification || "manual")} | ${escapeCell(meal.target ? mdNutrition(meal.target) : "—")} | ${escapeCell(mdNutrition(meal.actual))} | ${escapeCell(foods)} | ${escapeCell(meal.remainingBefore ? `${mdNutrition(meal.remainingBefore)} → ${mdNutrition(meal.remainingAfter)}` : "—")} |`);
  }
  lines.push("");
  return lines.join("\n");
}

function renderMarkdown(report) {
  const lines = [
    "# Auditoría funcional de generación automática diaria",
    "",
    `Generado: ${report.generatedAt}`,
    "",
    "## Seguridad y alcance",
    "",
    `- Snapshot Mongo: ${report.safety.snapshotDocumentsBefore} → ${report.safety.snapshotDocumentsAfter} documentos.`,
    `- Lecturas directas: ${report.safety.directMongoReads}; escrituras: ${report.safety.directMongoWrites}.`,
    `- Catálogo sin cambios: ${report.safety.catalogUnchanged}; generation sin cambios: ${report.safety.generationUnchanged}.`,
    "- Integración: planner real del frontend → combinador existente → solver existente → meal_generation_balanced_v1.",
    "- Este reporte calcula diferencias del día; no introduce una clasificación nutricional diaria nueva.",
    "",
    "## Resumen",
    "",
    `- Casos: ${report.summary.totalCases}; PASS ${report.summary.passed}; FAIL ${report.summary.failed}.`,
    `- Invocaciones al generador de una comida: ${report.summary.generatorInvocations}.`,
    `- Comidas centrales: RECOMMENDED ${report.summary.recommendedMeals}; BEST_EFFORT ${report.summary.bestEffortMeals}.`,
    `- Repeticiones semánticas exactas (todos los casos): ${report.summary.exactCompositionRepeats}; matriz diaria: ${report.summary.dailyMatrixExactCompositionRepeats}.`,
    `- Solapamientos altos (todos los casos): ${report.summary.highCompositionOverlaps}; matriz diaria: ${report.summary.dailyMatrixHighCompositionOverlaps}.`,
    "",
    "## Performance end-to-end",
    "",
    "| comidas | muestras | promedio | p95 | máximo | invocaciones al generador |",
    "|---:|---:|---:|---:|---:|---:|",
  ];
  for (const [count, value] of Object.entries(report.performanceByMealCount)) {
    lines.push(`| ${count} | ${value.wall.samples} | ${value.wall.averageMs} ms | ${value.wall.p95Ms} ms | ${value.wall.maxMs} ms | ${value.generatorInvocations} |`);
  }
  lines.push(
    "",
    "## Diversidad por seed / otra opción",
    "",
    `- Opciones: ${report.diversity.samples}; fingerprints diarios distintos: ${report.diversity.distinctMenus}; repeticiones: ${report.diversity.repeatedMenus}.`,
    `- Menús semánticos distintos (ignorando cantidades): ${report.diversity.distinctSemanticMenus}; repeticiones semánticas: ${report.diversity.repeatedSemanticMenus}.`,
    "- La cobertura estructural P2/C2/V/F/G se valida por separado en foodCombinationCandidates y en el benchmark 1/10/32/40; este runner no altera el límite 32.",
    "",
    "## Matriz y trazas",
    "",
  );
  for (const entry of report.cases) lines.push(renderCase(entry));
  return `${lines.join("\n")}\n`;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await CnxMongoDB.desconectar();
  });
