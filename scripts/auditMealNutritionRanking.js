import dotenv from "dotenv";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { normalizeFood } from "../menu2.js";
import CnxMongoDB from "../model/DBMongo.js";
import ModelMongoDBAlimentos from "../model/DAO/alimentosMongoDB.js";
import {
  FOOD_COMBINATION_MODES,
  generateFoodCombinationCandidates,
} from "../servicio/foodCombinationCandidates.js";
import { normalizeFoodGenerationForRead } from "../servicio/foodGenerationMetadata.js";
import {
  recalculateMealAlternativeQuantities,
} from "../servicio/mealAlternativeGenerator.js";
import {
  compareMealNutritionAssessments,
  evaluateMealNutritionResult,
} from "../servicio/mealNutritionPolicy.js";

dotenv.config();

const outputDirectory = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve("artifacts", "meal-ranking-audit");
const target = Object.freeze({ kcal: 776, proteina: 57.6, carbs: 94.6, grasas: 15.6 });
const historicalQuantities = Object.freeze({ Arroz: 100, Banana: 180, "Pechuga de pollo": 250 });
const foodIds = Object.freeze({
  Arroz: "6619bfeb147cd50b6467769c",
  Banana: "6619bfeb147cd50b646776a8",
  "Pechuga de pollo": "6619bfeb147cd50b64677809",
});
const matrixScenarios = Object.freeze([
  { mealType: "lunch", structure: "P1+C1" },
  { mealType: "lunch", structure: "P1+C1+F" },
  { mealType: "lunch", structure: "P1+C1+V" },
  { mealType: "lunch", structure: "P1+C1+G" },
  { mealType: "lunch", structure: "P1+C1+F+G" },
  { mealType: "lunch", structure: "P1+C1+P2" },
  { mealType: "breakfast", structure: "P1+C1+C2" },
  { mealType: "breakfast", structure: "P1+C1+P2+C2+F+G" },
]);
const matrixTargets = Object.freeze([
  { label: "low", kcal: 350, proteina: 25, carbs: 42, grasas: 10 },
  { label: "medium", kcal: 620, proteina: 42, carbs: 72, grasas: 18 },
  { label: "high", kcal: 800, proteina: 60, carbs: 95, grasas: 24 },
]);

function number(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

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

function sortedDocuments(documents = []) {
  return [...documents].sort((left, right) => String(left?._id || "").localeCompare(String(right?._id || "")));
}

function generationFingerprint(documents = []) {
  return hash(sortedDocuments(documents).map((document) => ({
    id: String(document._id),
    generation: document.generation ?? null,
  })));
}

function catalogFingerprint(documents = []) {
  return hash(sortedDocuments(documents));
}

function primaryId(food = {}) {
  return String(food._id ?? food.id ?? food.alimentoId ?? "").trim();
}

function aliases(food = {}) {
  return new Set([food._id, food.id, food.alimentoId].map((value) => String(value ?? "").trim()).filter(Boolean));
}

function foodName(food = {}) {
  return String(food.Alimentos || food.nombre || food.name || "Alimento").trim();
}

function createSnapshotModel(snapshot = []) {
  const counts = {
    obtenerAlimentos: 0,
    obtenerAlimentosPorIds: 0,
    obtenerAlimentoPorId: 0,
    obtenerAlimentosGeneracionAutomatica: 0,
  };
  const byId = (id) => snapshot.find((food) => aliases(food).has(String(id)));
  return {
    obtenerAlimentos: async () => {
      counts.obtenerAlimentos += 1;
      return snapshot;
    },
    obtenerAlimentosPorIds: async (ids = []) => {
      counts.obtenerAlimentosPorIds += 1;
      return ids.map(byId).filter(Boolean);
    },
    obtenerAlimentoPorId: async (id) => {
      counts.obtenerAlimentoPorId += 1;
      return byId(id) || null;
    },
    obtenerAlimentosGeneracionAutomatica: async ({ mealType, roles = [] } = {}) => {
      counts.obtenerAlimentosGeneracionAutomatica += 1;
      return snapshot.filter((food) => {
        if (food?.activo === false) return false;
        const generation = normalizeFoodGenerationForRead(food.generation);
        return generation.mode === "GENERIC" &&
          generation.mealTypes[mealType] === true &&
          roles.some((role) => generation.roles[role] === true);
      });
    },
    queryCounts: () => ({ ...counts }),
  };
}

function normalizedUnit(food = {}, rule = {}) {
  const value = String(rule.unit || food.unidad || food.Unidad || food.unit || "").trim().toLowerCase();
  if (["g", "gr", "grs", "gramo", "gramos"].includes(value)) return "g";
  if (["ml", "mililitro", "mililitros"].includes(value)) return "ml";
  return value;
}

function effectiveRule(food = {}, relaxation = "STRICT") {
  const generationRule = food.generation?.portionRule || {};
  const configuredMin = number(generationRule.min);
  const configuredMax = number(generationRule.max);
  const configuredStep = number(generationRule.step);
  const unit = normalizedUnit(food, generationRule);
  const continuous = unit === "g" || unit === "ml";
  const min = configuredMin ?? number(food.minGramos ?? food.minQuantity ?? food.cantidadMin ?? food.porcionMin);
  const max = configuredMax ?? number(food.maxGramos ?? food.maxQuantity ?? food.cantidadMax ?? food.porcionMax);
  const step = configuredStep ?? number(food.stepGramos ?? food.stepQuantity ?? food.step ?? food.multiplo);
  const generationRuleActive = food.generation?.portionRule && typeof food.generation.portionRule === "object";
  return {
    unit,
    min: generationRuleActive && configuredMin !== null && relaxation === "RELAX_MIN" && continuous
      ? Math.max(0, configuredMin - 20)
      : min,
    max,
    step: generationRuleActive && configuredStep === 10 && relaxation !== "STRICT" && continuous
      ? 5
      : step,
    allowedValues: Array.isArray(generationRule.allowedValues)
      ? generationRule.allowedValues.map(Number).filter((value) => Number.isFinite(value) && value > 0)
      : [],
    sources: {
      min: configuredMin !== null ? "generation" : "legacy",
      max: configuredMax !== null ? "generation" : "legacy",
      step: configuredStep !== null ? "generation" : "legacy",
    },
  };
}

function enumerateQuantities(food) {
  const rule = effectiveRule(food, "STRICT");
  if (rule.allowedValues.length) {
    return rule.allowedValues.filter((value) =>
      (rule.min === null || value >= rule.min) && (rule.max === null || value <= rule.max)
    );
  }
  if (!(rule.min > 0) || !(rule.max >= rule.min) || !(rule.step > 0)) {
    throw new Error(`No se puede enumerar la regla efectiva de ${foodName(food)}.`);
  }
  const values = [];
  const first = Math.ceil((rule.min - 1e-9) / rule.step) * rule.step;
  for (let value = first; value <= rule.max + 1e-9; value += rule.step) values.push(round(value, 6));
  return values;
}

function calculateTotals(foods, quantities) {
  return foods.reduce((totals, food) => {
    const normalized = normalizeFood(food);
    const quantity = quantities[foodName(food)];
    return {
      kcal: totals.kcal + normalized.calorias * quantity,
      proteina: totals.proteina + normalized.proteina * quantity,
      carbs: totals.carbs + normalized.carbohidratos * quantity,
      grasas: totals.grasas + normalized.grasas * quantity,
    };
  }, { kcal: 0, proteina: 0, carbs: 0, grasas: 0 });
}

function publicNutritionPerUnit(food) {
  const normalized = normalizeFood(food);
  return {
    kcal: round(normalized.calorias, 6),
    proteina: round(normalized.proteina, 6),
    carbs: round(normalized.carbohidratos, 6),
    grasas: round(normalized.grasas, 6),
  };
}

function legacyRank(totals) {
  const calorieDeficit = Math.max(0, target.kcal - totals.kcal);
  const proteinDeficit = Math.max(0, target.proteina - totals.proteina);
  const proteinDistance = Math.abs(target.proteina - totals.proteina);
  const proteinReached = proteinDeficit <= 0.5 + 1e-9;
  return {
    inCalorieZone: calorieDeficit <= 1 + 1e-9,
    calorieDeficit,
    proteinReached,
    proteinPriority: proteinReached ? Math.max(0, proteinDistance - 1) : proteinDeficit,
    proteinDistance,
    secondaryError: ((totals.carbs - target.carbs) / target.carbs) ** 2 +
      ((totals.grasas - target.grasas) / target.grasas) ** 2,
  };
}

function compareLegacy(left, right) {
  const a = left.legacy;
  const b = right.legacy;
  if (a.inCalorieZone !== b.inCalorieZone) return a.inCalorieZone ? -1 : 1;
  if (!a.inCalorieZone && Math.abs(a.calorieDeficit - b.calorieDeficit) > 1e-9) {
    return a.calorieDeficit - b.calorieDeficit;
  }
  if (a.proteinReached !== b.proteinReached) return a.proteinReached ? -1 : 1;
  if (Math.abs(a.proteinPriority - b.proteinPriority) > 1e-9) return a.proteinPriority - b.proteinPriority;
  if (Math.abs(a.secondaryError - b.secondaryError) > 1e-9) return a.secondaryError - b.secondaryError;
  if (Math.abs(a.proteinDistance - b.proteinDistance) > 1e-9) return a.proteinDistance - b.proteinDistance;
  if (Math.abs(a.calorieDeficit - b.calorieDeficit) > 1e-9) return a.calorieDeficit - b.calorieDeficit;
  return left.signature.localeCompare(right.signature);
}

function solutionRow(entry, legacyRanks, currentRanks) {
  return {
    quantities: entry.quantities,
    totals: Object.fromEntries(Object.entries(entry.totals).map(([key, value]) => [key, round(value)])),
    difference: entry.assessment.difference,
    classification: entry.assessment.status,
    zones: entry.assessment.zones,
    reasons: entry.assessment.warning?.reasonCodes || [],
    legacyRank: legacyRanks.get(entry.signature) || null,
    currentRank: currentRanks.get(entry.signature) || null,
  };
}

function validateAlternative(alternative, selectedIds, snapshot) {
  if (!alternative) return [];
  const violations = [];
  const outputIds = alternative.foods.map((food) => String(food.foodId));
  if (outputIds.length !== selectedIds.length || selectedIds.some((id) => !outputIds.includes(String(id)))) {
    violations.push("La respuesta agrego, quito o reemplazo alimentos seleccionados.");
  }
  for (const output of alternative.foods) {
    const source = snapshot.find((food) => aliases(food).has(String(output.foodId)));
    if (!source) {
      violations.push(`No se encontro ${output.foodId} en el snapshot.`);
      continue;
    }
    const rule = effectiveRule(source, alternative.relaxation?.level || "STRICT");
    const quantity = Number(output.quantity);
    if (rule.min !== null && quantity < rule.min - 1e-6) violations.push(`${foodName(source)} viola MIN.`);
    if (rule.max !== null && quantity > rule.max + 1e-6) violations.push(`${foodName(source)} viola MAX.`);
    if (rule.allowedValues.length && !rule.allowedValues.some((value) => Math.abs(value - quantity) <= 1e-6)) {
      violations.push(`${foodName(source)} viola allowedValues.`);
    }
    if (rule.step !== null && rule.step > 0 && Math.abs(quantity / rule.step - Math.round(quantity / rule.step)) > 1e-6) {
      violations.push(`${foodName(source)} viola STEP.`);
    }
  }
  return violations;
}

async function buildStructureMatrix(snapshot) {
  const generatedByMealType = new Map();
  for (const mealType of [...new Set(matrixScenarios.map((scenario) => scenario.mealType))]) {
    const candidateModel = createSnapshotModel(snapshot);
    generatedByMealType.set(mealType, await generateFoodCombinationCandidates({
      mealType,
      mode: FOOD_COMBINATION_MODES.ALLOW_SUGGESTIONS,
      requiredFoodIds: [],
      excludedFoodIds: [],
      limit: 32,
    }, { model: candidateModel }));
  }
  const entries = [];
  for (let index = 0; index < matrixScenarios.length; index += 1) {
    const { mealType, structure } = matrixScenarios[index];
    const generated = generatedByMealType.get(mealType);
    const candidate = generated.candidates.find((item) => item.structure === structure);
    if (!candidate) {
      entries.push({ mealType, structure, error: "La estructura no entro en el batch 32." });
      continue;
    }
    const profile = matrixTargets[index % matrixTargets.length];
    const model = createSnapshotModel(snapshot);
    const startedAt = performance.now();
    const result = await recalculateMealAlternativeQuantities({
      mealType,
      target: profile,
      selectedFoodIds: candidate.foodIds,
      fixedFoods: [],
      maxFoods: 10,
    }, { model });
    const violations = validateAlternative(result.alternative, candidate.foodIds, snapshot);
    entries.push({
      mealType,
      structure,
      targetProfile: profile.label,
      target: profile,
      selectedFoods: candidate.foodIds.map((id) => {
        const food = snapshot.find((item) => aliases(item).has(String(id)));
        return { id: String(id), name: foodName(food), role: candidate.roleAssignments[id] };
      }),
      elapsedMs: round(performance.now() - startedAt, 2),
      status: result.status,
      classification: result.classification,
      recommended: result.recommended,
      usable: result.usable,
      relaxation: result.relaxation,
      totals: result.alternative?.totals || null,
      difference: result.nutrition?.difference || null,
      reasons: result.nutrition?.warning?.reasonCodes || [],
      foods: result.alternative?.foods || [],
      hardConstraintViolations: violations,
      snapshotQueries: model.queryCounts(),
    });
  }
  const batches = Object.fromEntries([...generatedByMealType].map(([mealType, generated]) => {
    const structures = [...new Set(generated.candidates.map((candidate) => candidate.structure))];
    return [mealType, {
      candidateMeta: generated.meta,
      structures,
      roleCoverage: Object.fromEntries(["P2", "C2", "V", "F", "G"].map((role) => [
        role,
        generated.candidates.some((candidate) => candidate.structure.split("+").includes(role)),
      ])),
    }];
  }));
  return {
    batches,
    entries,
  };
}

async function main() {
  await CnxMongoDB.conectar();
  if (!CnxMongoDB.connection || !CnxMongoDB.db) throw new Error("No se pudo conectar a MongoDB.");
  const databaseModel = new ModelMongoDBAlimentos();
  // Son las unicas consultas directas a Mongo. Todo el motor corre luego sobre
  // el mismo snapshot en memoria; este script no invoca ningun metodo de write.
  const before = await databaseModel.obtenerAlimentos();
  const generationBefore = generationFingerprint(before);
  const catalogBefore = catalogFingerprint(before);

  const caseFoods = Object.entries(foodIds).map(([name, expectedId]) => {
    const food = before.find((item) => aliases(item).has(expectedId));
    if (!food || foodName(food) !== name) throw new Error(`No se encontro el alimento real ${name} (${expectedId}).`);
    return food;
  });
  const quantitySets = caseFoods.map((food) => enumerateQuantities(food));
  const solutions = [];
  for (const arroz of quantitySets[0]) {
    for (const banana of quantitySets[1]) {
      for (const chicken of quantitySets[2]) {
        const quantities = { Arroz: arroz, Banana: banana, "Pechuga de pollo": chicken };
        const totals = calculateTotals(caseFoods, quantities);
        const signature = `${arroz}|${banana}|${chicken}`;
        solutions.push({
          signature,
          quantities,
          totals,
          legacy: legacyRank(totals),
          assessment: evaluateMealNutritionResult(totals, target),
        });
      }
    }
  }
  const legacySorted = solutions.filter((solution) => solution.totals.kcal <= target.kcal + 1e-9)
    .sort(compareLegacy);
  const currentSorted = [...solutions].sort((left, right) =>
    compareMealNutritionAssessments(left.assessment, right.assessment) ||
    left.signature.localeCompare(right.signature)
  );
  const legacyRanks = new Map(legacySorted.map((solution, index) => [solution.signature, index + 1]));
  const currentRanks = new Map(currentSorted.map((solution, index) => [solution.signature, index + 1]));
  const historicalSignature = `${historicalQuantities.Arroz}|${historicalQuantities.Banana}|${historicalQuantities["Pechuga de pollo"]}`;
  const historical = solutions.find((solution) => solution.signature === historicalSignature);

  const caseModel = createSnapshotModel(before);
  const engineResult = await recalculateMealAlternativeQuantities({
    mealType: "lunch",
    target,
    selectedFoodIds: caseFoods.map(primaryId),
    fixedFoods: [],
    maxFoods: 6,
  }, { model: caseModel });
  const engineViolations = validateAlternative(engineResult.alternative, caseFoods.map(primaryId), before);
  const structureMatrix = await buildStructureMatrix(before);

  const after = await databaseModel.obtenerAlimentos();
  const generationAfter = generationFingerprint(after);
  const catalogAfter = catalogFingerprint(after);
  const report = {
    generatedAt: new Date().toISOString(),
    mode: "read-only real-catalog ranking audit",
    safety: {
      documentsBefore: before.length,
      documentsAfter: after.length,
      directMongoReads: 2,
      directMongoWrites: 0,
      generationFingerprintBefore: generationBefore,
      generationFingerprintAfter: generationAfter,
      catalogFingerprintBefore: catalogBefore,
      catalogFingerprintAfter: catalogAfter,
      databaseUnchanged: generationBefore === generationAfter && catalogBefore === catalogAfter,
    },
    case: {
      target,
      foods: caseFoods.map((food) => ({
        id: primaryId(food),
        name: foodName(food),
        nutritionPerUnit: publicNutritionPerUnit(food),
        strictPortionRule: effectiveRule(food, "STRICT"),
        enumeratedQuantities: enumerateQuantities(food),
      })),
      physicalStrictCombinations: solutions.length,
      legacyEligibleCombinations: legacySorted.length,
      historical: solutionRow(historical, legacyRanks, currentRanks),
      legacyTop20: legacySorted.slice(0, 20).map((entry) => solutionRow(entry, legacyRanks, currentRanks)),
      currentTop20: currentSorted.slice(0, 20).map((entry) => solutionRow(entry, legacyRanks, currentRanks)),
      engineResult,
      engineHardConstraintViolations: engineViolations,
      snapshotQueries: caseModel.queryCounts(),
    },
    structureMatrix,
  };
  await mkdir(outputDirectory, { recursive: true });
  const outputFile = path.join(outputDirectory, "arroz-banana-pechuga-ranking.json");
  await writeFile(outputFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    outputFile,
    safety: report.safety,
    case: {
      physicalStrictCombinations: solutions.length,
      historical: report.case.historical,
      legacyWinner: report.case.legacyTop20[0],
      currentWinner: report.case.currentTop20[0],
      engine: {
        classification: engineResult.classification,
        relaxation: engineResult.relaxation,
        totals: engineResult.alternative?.totals,
        foods: engineResult.alternative?.foods?.map((food) => ({ name: food.name, quantity: food.quantity })),
        violations: engineViolations,
      },
    },
    matrix: structureMatrix.entries.map((entry) => ({
      mealType: entry.mealType,
      structure: entry.structure,
      targetProfile: entry.targetProfile,
      classification: entry.classification,
      usable: entry.usable,
      relaxation: entry.relaxation?.level,
      violations: entry.hardConstraintViolations,
      elapsedMs: entry.elapsedMs,
    })),
  }, null, 2));
  const matrixViolations = structureMatrix.entries.flatMap((entry) => entry.hardConstraintViolations || []);
  if (!report.safety.databaseUnchanged || engineViolations.length || matrixViolations.length) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await CnxMongoDB.desconectar();
  });
