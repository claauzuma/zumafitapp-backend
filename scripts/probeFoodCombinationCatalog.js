import dotenv from "dotenv";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import CnxMongoDB from "../model/DBMongo.js";
import ModelMongoDBAlimentos from "../model/DAO/alimentosMongoDB.js";
import {
  FOOD_COMBINATION_MODES,
  generateFoodCombinationCandidates,
} from "../servicio/foodCombinationCandidates.js";
import { normalizeFoodGenerationForRead } from "../servicio/foodGenerationMetadata.js";
import { generateMealAlternative } from "../servicio/mealAlternativeGenerator.js";

dotenv.config();

const outputDirectory = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve("artifacts", "food-generation-curation");
const mealTypes = ["breakfast", "lunch", "snack", "dinner", "extraSnack"];
const candidateSampleCount = positiveInteger(process.env.COMBINATION_PROBE_SAMPLES, 10, 50);
const solverSampleCount = positiveInteger(process.env.COMBINATION_SOLVER_SAMPLES, 3, 20);
const warmupCount = nonNegativeInteger(process.env.COMBINATION_PROBE_WARMUPS, 1, 5);
const probeLimits = parseLimits(process.env.COMBINATION_PROBE_LIMITS || "1,10,32,40");
const fixedSeed = String(process.env.COMBINATION_PROBE_SEED || "combination-probe-fixed-v1");
const outputSuffix = String(process.env.COMBINATION_PROBE_SUFFIX || "").replace(/[^a-zA-Z0-9_-]/g, "");
const targets = Object.freeze({
  breakfast: { kcal: 720, proteina: 52, carbs: 84, grasas: 20 },
  lunch: { kcal: 620, proteina: 42, carbs: 72, grasas: 18 },
  snack: { kcal: 360, proteina: 25, carbs: 42, grasas: 10 },
  dinner: { kcal: 620, proteina: 42, carbs: 72, grasas: 18 },
  extraSnack: { kcal: 300, proteina: 20, carbs: 35, grasas: 8 },
});

function positiveInteger(value, fallback, max) {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

function nonNegativeInteger(value, fallback, max) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) && parsed >= 0 ? Math.min(parsed, max) : fallback;
}

function parseLimits(value) {
  const limits = [...new Set(String(value || "")
    .split(",")
    .map((item) => Math.trunc(Number(item.trim())))
    .filter((item) => Number.isFinite(item) && item >= 1 && item <= 40))];
  if (!limits.length) throw new Error("COMBINATION_PROBE_LIMITS debe incluir limites entre 1 y 40.");
  return limits;
}

function rounded(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(Number(value || 0) * factor) / factor;
}

function timing(values = []) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  const percentile = (position) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * position))] || 0;
  return {
    samples: sorted.length,
    averageMs: rounded(sorted.reduce((total, value) => total + value, 0) / Math.max(1, sorted.length)),
    p50Ms: rounded(percentile(0.5)),
    p95Ms: rounded(percentile(0.95)),
    maxMs: rounded(sorted.at(-1) || 0),
  };
}

function numericSummary(values = []) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  const percentile = (position) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * position))] || 0;
  return {
    samples: sorted.length,
    average: rounded(sorted.reduce((total, value) => total + value, 0) / Math.max(1, sorted.length)),
    p50: rounded(percentile(0.5)),
    p95: rounded(percentile(0.95)),
    max: rounded(sorted.at(-1) || 0),
  };
}

function roleCounts(candidates = []) {
  const hasRole = (candidate, role) => candidate.structure.split("+").includes(role);
  return {
    baseOnly: candidates.filter((candidate) => candidate.structure === "P1+C1").length,
    P2: candidates.filter((candidate) => hasRole(candidate, "P2")).length,
    C2: candidates.filter((candidate) => hasRole(candidate, "C2")).length,
    V: candidates.filter((candidate) => hasRole(candidate, "V")).length,
    F: candidates.filter((candidate) => hasRole(candidate, "F")).length,
    G: candidates.filter((candidate) => hasRole(candidate, "G")).length,
    uniqueStructures: new Set(candidates.map((candidate) => candidate.structure)).size,
  };
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

function foodAliases(food = {}) {
  return new Set([food._id, food.id, food.alimentoId].map((value) => String(value ?? "").trim()).filter(Boolean));
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

function structures(candidates = []) {
  return Object.fromEntries([...candidates.reduce((counts, candidate) => {
    counts.set(candidate.structure, (counts.get(candidate.structure) || 0) + 1);
    return counts;
  }, new Map()).entries()]);
}

function candidateSignature(result = {}) {
  return hash((result.candidates || []).map((candidate) => ({
    foodIds: candidate.foodIds,
    roleAssignments: candidate.roleAssignments,
    structure: candidate.structure,
    score: candidate.score,
  })));
}

function solverSignature(result = {}) {
  return hash({
    status: result.status,
    classification: result.classification || result.alternative?.status || null,
    code: result.code || null,
    recommended: result.recommended === true,
    usable: result.usable === true,
    relaxation: result.relaxation || null,
    alternative: result.alternative ? {
      status: result.alternative.status,
      structure: result.alternative.structure,
      totals: result.alternative.totals,
      difference: result.alternative.difference,
      foods: result.alternative.foods?.map((food) => ({ foodId: food.foodId, quantity: food.quantity })),
    } : null,
  });
}

function roundBenchmarks(results = []) {
  const levels = [...new Set(results.flatMap((entry) => (entry.result.meta?.rounds || []).map((round) => round.level)))];
  return levels.map((level) => {
    const rounds = results.map((entry) => (entry.result.meta?.rounds || []).find((round) => round.level === level)).filter(Boolean);
    return {
      level,
      occurrences: rounds.length,
      candidatesProcessed: numericSummary(rounds.map((round) => Number(round.candidatesProcessed))),
      quantitySolutionsFound: numericSummary(rounds.map((round) => Number(round.quantitySolutionsFound))),
      recommendedSolutionsFound: numericSummary(rounds.map((round) => Number(round.recommendedSolutionsFound))),
      elapsed: timing(rounds.map((round) => Number(round.elapsedMs))),
    };
  });
}

async function benchmarkCandidates({ mealType, limit, snapshot }) {
  const model = createSnapshotModel(snapshot);
  const input = {
    mealType,
    mode: FOOD_COMBINATION_MODES.ALLOW_SUGGESTIONS,
    requiredFoodIds: [],
    excludedFoodIds: [],
    limit,
  };
  for (let index = 0; index < warmupCount; index += 1) {
    await generateFoodCombinationCandidates(input, { model });
  }
  const measurements = [];
  const signatures = [];
  let result;
  for (let sample = 0; sample < candidateSampleCount; sample += 1) {
    const startedAt = performance.now();
    result = await generateFoodCombinationCandidates(input, { model });
    measurements.push(performance.now() - startedAt);
    signatures.push(candidateSignature(result));
  }
  return {
    mealType,
    limit,
    candidateCount: result.candidates.length,
    structures: structures(result.candidates),
    roleCounts: roleCounts(result.candidates),
    candidateGenerationTiming: timing(measurements),
    generatorMeta: result.meta,
    optionalStructureCandidates: result.candidates.filter((candidate) => candidate.structure !== "P1+C1").length,
    deterministicAcrossSamples: new Set(signatures).size === 1,
    catalogQueries: model.queryCounts(),
    examples: result.candidates.slice(0, 5).map((candidate) => ({
      structure: candidate.structure,
      foods: candidate.foodIds.map((id) => {
        const food = snapshot.find((entry) => foodAliases(entry).has(String(id)));
        return {
          id: String(id),
          name: food?.Alimentos || food?.nombre || food?.name || "Alimento",
          role: candidate.roleAssignments[id],
        };
      }),
    })),
  };
}

async function benchmarkSolver({ mealType, limit, snapshot }) {
  const model = createSnapshotModel(snapshot);
  const variantSeed = `${fixedSeed}:${mealType}`;
  const input = {
    mealType,
    target: targets[mealType],
    requiredFoodIds: [],
    excludedFoodIds: [],
    generationMode: FOOD_COMBINATION_MODES.ALLOW_SUGGESTIONS,
    variantSeed,
    limit,
    maxFoods: 6,
  };
  for (let index = 0; index < warmupCount; index += 1) {
    await generateMealAlternative(input, { model });
  }
  const results = [];
  for (let sample = 0; sample < solverSampleCount; sample += 1) {
    const startedAt = performance.now();
    const result = await generateMealAlternative(input, { model });
    results.push({ result, elapsedMs: performance.now() - startedAt });
  }
  const representative = results[0].result;
  return {
    mealType,
    limit,
    target: targets[mealType],
    variantSeed,
    status: representative.status,
    classification: representative.classification || representative.alternative?.status || null,
    code: representative.code || null,
    recommended: representative.recommended === true,
    usable: representative.usable === true,
    wallTiming: timing(results.map((entry) => entry.elapsedMs)),
    reportedTotalTiming: timing(results.map((entry) => Number(entry.result.meta?.elapsedMs))),
    combinationCandidatesEvaluated: numericSummary(results.map((entry) => Number(entry.result.meta?.combinationCandidatesEvaluated))),
    totalCandidateExecutions: numericSummary(results.map((entry) => Number(entry.result.meta?.totalCandidateExecutions))),
    quantitySolutionsFound: numericSummary(results.map((entry) => Number(entry.result.meta?.quantitySolutionsFound))),
    recommendedSolutionsFound: numericSummary(results.map((entry) => Number(entry.result.meta?.recommendedSolutionsFound))),
    bestEffortSolutionsFound: numericSummary(results.map((entry) => Number(entry.result.meta?.bestEffortSolutionsFound))),
    rounds: roundBenchmarks(results),
    deterministicAcrossSamples: new Set(results.map((entry) => solverSignature(entry.result))).size === 1,
    catalogQueries: model.queryCounts(),
    meta: representative.meta,
    alternative: representative.alternative ? {
      status: representative.alternative.status,
      structure: representative.alternative.structure,
      totals: representative.alternative.totals,
      difference: representative.alternative.difference,
      foods: representative.alternative.foods,
    } : null,
  };
}

function legacySolverProbe(benchmark) {
  return {
    mealType: benchmark.mealType,
    target: benchmark.target,
    elapsedMs: benchmark.wallTiming.averageMs,
    status: benchmark.status,
    classification: benchmark.classification,
    recommended: benchmark.recommended,
    usable: benchmark.usable,
    meta: benchmark.meta,
    alternative: benchmark.alternative,
  };
}

async function main() {
  await CnxMongoDB.conectar();
  if (!CnxMongoDB.connection || !CnxMongoDB.db) throw new Error("No se pudo conectar a MongoDB.");
  const databaseModel = new ModelMongoDBAlimentos();
  // Estas dos lecturas son las unicas consultas directas de este proceso a
  // Mongo. Los probes usan el mismo snapshot en memoria y no tienen writes.
  const before = await databaseModel.obtenerAlimentos();
  const generationBefore = generationFingerprint(before);
  const catalogBefore = catalogFingerprint(before);
  const probes = [];
  const solverBenchmarks = [];

  for (const mealType of mealTypes) {
    for (const limit of probeLimits) {
      probes.push(await benchmarkCandidates({ mealType, limit, snapshot: before }));
      solverBenchmarks.push(await benchmarkSolver({ mealType, limit, snapshot: before }));
    }
  }

  const after = await databaseModel.obtenerAlimentos();
  const generationAfter = generationFingerprint(after);
  const catalogAfter = catalogFingerprint(after);
  const generationUnchanged = generationBefore === generationAfter;
  const catalogUnchanged = catalogBefore === catalogAfter;
  const solverProbes = solverBenchmarks
    .filter((probe) => probe.limit === 32)
    .map(legacySolverProbe);
  const report = {
    generatedAt: new Date().toISOString(),
    mode: "read-only combination and solver benchmark over one Mongo snapshot",
    config: {
      limits: probeLimits,
      mealTypes,
      candidateSamples: candidateSampleCount,
      solverSamples: solverSampleCount,
      warmups: warmupCount,
      fixedSeed,
      snapshotDocuments: before.length,
    },
    safety: {
      totalBefore: before.length,
      totalAfter: after.length,
      directMongoReads: 2,
      directMongoWrites: 0,
      generationFingerprintBefore: generationBefore,
      generationFingerprintAfter: generationAfter,
      generationUnchanged,
      catalogFingerprintBefore: catalogBefore,
      catalogFingerprintAfter: catalogAfter,
      catalogUnchanged,
      databaseUnchanged: generationUnchanged && catalogUnchanged,
    },
    probes,
    solverBenchmarks,
    // Compatibilidad: una entrada por meal type para el limite historico 32.
    solverProbes,
  };
  await mkdir(outputDirectory, { recursive: true });
  const basename = `combination-probe${outputSuffix ? `-${outputSuffix}` : ""}`;
  const outputFile = path.join(outputDirectory, `${basename}.json`);
  await writeFile(outputFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    outputFile,
    config: report.config,
    safety: report.safety,
    solver: solverBenchmarks.map((probe) => ({
      mealType: probe.mealType,
      limit: probe.limit,
      status: probe.status,
      classification: probe.classification,
      usable: probe.usable,
      structure: probe.alternative?.structure || null,
      candidateExecutions: probe.totalCandidateExecutions.average,
      physicalSolutions: probe.quantitySolutionsFound.average,
      recommendedSolutions: probe.recommendedSolutionsFound.average,
      bestEffortSolutions: probe.bestEffortSolutionsFound.average,
      averageMs: probe.wallTiming.averageMs,
    })),
  }, null, 2));
  if (!report.safety.databaseUnchanged) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await CnxMongoDB.desconectar();
  });
