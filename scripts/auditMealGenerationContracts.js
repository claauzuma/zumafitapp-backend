import dotenv from "dotenv";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { normalizeFood as normalizeQuantityFood } from "../menu2.js";
import CnxMongoDB from "../model/DBMongo.js";
import ModelMongoDBAlimentos from "../model/DAO/alimentosMongoDB.js";
import {
  FOOD_COMBINATION_MODES,
  generateFoodCombinationCandidates,
} from "../servicio/foodCombinationCandidates.js";
import {
  GENERATION_MEAL_TYPES,
  GENERATION_MODES,
  GENERATION_ROLES,
  normalizeFoodGenerationForRead,
} from "../servicio/foodGenerationMetadata.js";
import {
  generateMealAlternative,
  recalculateMealAlternativeQuantities,
} from "../servicio/mealAlternativeGenerator.js";

dotenv.config();

const outputDirectory = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve("artifacts", "central-contract-audit");
const standardTarget = Object.freeze({ kcal: 620, proteina: 42, carbs: 72, grasas: 18 });
const mealTargets = Object.freeze({
  breakfast: { kcal: 520, proteina: 35, carbs: 62, grasas: 15 },
  lunch: standardTarget,
  snack: { kcal: 360, proteina: 25, carbs: 42, grasas: 10 },
  dinner: standardTarget,
  extraSnack: { kcal: 300, proteina: 20, carbs: 35, grasas: 8 },
});
const knownIds = Object.freeze({
  rice: "6619bfeb147cd50b6467769c",
  bananaSmall: "6619bfeb147cd50b646776a9",
  beer: "6619bfeb147cd50b646776dc",
  chicken: "6619bfeb147cd50b64677809",
});
const EPS = 1e-6;

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

function stableValue(value) {
  if (value === undefined) return null;
  if (value === null) return null;
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
  return [...documents].sort((left, right) => primaryId(left).localeCompare(primaryId(right)));
}

function catalogFingerprint(documents = []) {
  return hash(sortedDocuments(documents));
}

function generationFingerprint(documents = []) {
  return hash(sortedDocuments(documents).map((document) => ({
    id: primaryId(document),
    generation: document.generation ?? null,
  })));
}

function primaryId(food = {}) {
  return String(food._id ?? food.id ?? food.alimentoId ?? "").trim();
}

function aliases(food = {}) {
  return new Set([food._id, food.id, food.alimentoId]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean));
}

function foodName(food = {}) {
  return String(food.Alimentos || food.alimentos || food.nombre || food.name || "Alimento").trim();
}

function normalizedUnit(food = {}, rule = {}) {
  const value = String(
    rule.unit || food.unit || food.unidad || food.Unidad || food.unidadBase || ""
  ).trim().toLowerCase();
  if (["g", "gr", "grs", "gramo", "gramos"].includes(value)) return "g";
  if (["ml", "mililitro", "mililitros"].includes(value)) return "ml";
  if (["unid", "unidad", "unidades"].includes(value)) return "unidad";
  return value || "unidad";
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function effectiveRule(food = {}, level = "STRICT") {
  const configured = food?.generation?.portionRule && typeof food.generation.portionRule === "object"
    ? food.generation.portionRule
    : {};
  const configuredMin = numberOrNull(configured.min);
  const configuredMax = numberOrNull(configured.max);
  const configuredStep = numberOrNull(configured.step);
  const unit = normalizedUnit(food, configured);
  const continuous = unit === "g" || unit === "ml";
  const legacyMin = numberOrNull(food.minGramos ?? food.minQuantity ?? food.cantidadMin ?? food.porcionMin);
  const legacyMax = numberOrNull(food.maxGramos ?? food.maxQuantity ?? food.cantidadMax ?? food.porcionMax);
  const legacyStep = numberOrNull(food.stepGramos ?? food.stepQuantity ?? food.step ?? food.multiplo);
  return {
    unit,
    min: configuredMin !== null
      ? (level === "RELAX_MIN" && continuous ? Math.max(0, configuredMin - 20) : configuredMin)
      : legacyMin,
    max: configuredMax ?? legacyMax,
    step: configuredStep !== null
      ? (configuredStep === 10 && continuous && level !== "STRICT" ? 5 : configuredStep)
      : legacyStep,
    allowedValues: Array.isArray(configured.allowedValues)
      ? configured.allowedValues.map(Number).filter((value) => Number.isFinite(value) && value > 0)
      : [],
    configured: {
      min: configuredMin !== null,
      max: configuredMax !== null,
      step: configuredStep !== null,
    },
  };
}

function quantityViolations(food, quantity, level = "STRICT") {
  const rule = effectiveRule(food, level);
  const issues = [];
  if (!(Number(quantity) > 0)) issues.push("quantity_not_positive");
  if (rule.min !== null && quantity < rule.min - EPS) issues.push("below_min");
  if (rule.max !== null && quantity > rule.max + EPS) issues.push("above_max");
  if (rule.allowedValues.length && !rule.allowedValues.some((value) => Math.abs(value - quantity) <= EPS)) {
    issues.push("outside_allowed_values");
  }
  if (rule.step !== null && rule.step > 0 && Math.abs(quantity / rule.step - Math.round(quantity / rule.step)) > EPS) {
    issues.push("outside_step_grid");
  }
  if (!["g", "ml"].includes(rule.unit) && food.allowFractionalQuantity !== true &&
      Math.abs(quantity - Math.round(quantity)) > EPS) {
    issues.push("fractional_discrete_quantity");
  }
  return issues;
}

function createSnapshotModel(snapshot = []) {
  const counts = {
    obtenerAlimentos: 0,
    obtenerAlimentosPorIds: 0,
    obtenerAlimentoPorId: 0,
    obtenerAlimentosGeneracionAutomatica: 0,
    writes: 0,
  };
  const findById = (id) => snapshot.find((food) => aliases(food).has(String(id)));
  const model = {
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
        const generation = normalizeFoodGenerationForRead(food.generation);
        return generation.mode === "GENERIC" &&
          generation.mealTypes[mealType] === true &&
          roles.some((role) => generation.roles[role] === true);
      });
    },
    queryCounts: () => ({ ...counts }),
  };
  return model;
}

function replaceFood(snapshot, replacement) {
  const id = primaryId(replacement);
  return snapshot.map((food) => primaryId(food) === id ? replacement : food);
}

function withMode(food, mode) {
  const generation = normalizeFoodGenerationForRead(food.generation);
  return {
    ...food,
    generation: {
      ...generation,
      mode,
      roles: { ...generation.roles },
      mealTypes: { ...generation.mealTypes },
      portionRule: { ...generation.portionRule, allowedValues: [...generation.portionRule.allowedValues] },
    },
  };
}

function withRule(food, portionRule) {
  const generation = normalizeFoodGenerationForRead(food.generation);
  return {
    ...food,
    generation: {
      ...generation,
      roles: { ...generation.roles },
      mealTypes: { ...generation.mealTypes },
      portionRule: { ...generation.portionRule, ...portionRule },
    },
  };
}

function findById(snapshot, id) {
  return snapshot.find((food) => aliases(food).has(String(id))) || null;
}

function findGeneric(snapshot, role, mealType, excluded = new Set()) {
  return [...snapshot]
    .sort((left, right) => primaryId(left).localeCompare(primaryId(right)))
    .find((food) => {
      if (excluded.has(primaryId(food)) || food?.activo === false) return false;
      const generation = normalizeFoodGenerationForRead(food.generation);
      return generation.mode === "GENERIC" &&
        generation.roles[role] === true &&
        generation.mealTypes[mealType] === true;
    }) || null;
}

function nutritionAt(food, quantity) {
  const normalized = normalizeQuantityFood(food) || {};
  return {
    kcal: Number(normalized.calorias || 0) * quantity,
    proteina: Number(normalized.proteina || 0) * quantity,
    carbs: Number(normalized.carbohidratos || 0) * quantity,
    grasas: Number(normalized.grasas || 0) * quantity,
  };
}

function sumNutrition(entries = []) {
  return entries.reduce((totals, { food, quantity }) => {
    const value = nutritionAt(food, quantity);
    return {
      kcal: totals.kcal + value.kcal,
      proteina: totals.proteina + value.proteina,
      carbs: totals.carbs + value.carbs,
      grasas: totals.grasas + value.grasas,
    };
  }, { kcal: 0, proteina: 0, carbs: 0, grasas: 0 });
}

function roundedNutrition(value = {}) {
  return {
    kcal: round(value.kcal),
    proteina: round(value.proteina),
    carbs: round(value.carbs),
    grasas: round(value.grasas),
  };
}

function resultSummary(result = {}) {
  return {
    status: result.status,
    classification: result.classification,
    code: result.code || null,
    recommended: result.recommended === true,
    usable: result.usable === true,
    relaxation: result.relaxation || null,
    nutritionReasons: result.nutrition?.warning?.reasonCodes || [],
    meta: result.meta ? {
      mode: result.meta.mode,
      mealType: result.meta.mealType,
      fixedFoods: result.meta.fixedFoods,
      combinationCandidatesEvaluated: result.meta.combinationCandidatesEvaluated,
      totalCandidateExecutions: result.meta.totalCandidateExecutions,
      quantitySolutionsFound: result.meta.quantitySolutionsFound,
      recommendedSolutionsFound: result.meta.recommendedSolutionsFound,
      bestEffortSolutionsFound: result.meta.bestEffortSolutionsFound,
      variantSeed: result.meta.variantSeed,
      variantPoolSize: result.meta.variantPoolSize,
      rounds: result.meta.rounds,
      elapsedMs: result.meta.elapsedMs,
    } : null,
    alternative: result.alternative ? {
      status: result.alternative.status,
      structure: result.alternative.structure,
      totals: result.alternative.totals,
      difference: result.alternative.difference,
      foods: result.alternative.foods.map((food) => ({
        foodId: String(food.foodId),
        name: food.name,
        role: food.role,
        quantity: food.quantity,
        unit: food.unit,
      })),
    } : null,
    alternatives: (result.alternatives || []).slice(0, 8).map((alternative) => ({
      status: alternative.status,
      structure: alternative.structure,
      totals: alternative.totals,
      foods: alternative.foods.map((food) => ({ foodId: String(food.foodId), quantity: food.quantity })),
    })),
  };
}

function solutionSignature(result = {}) {
  const alternative = result.alternative || result;
  return (alternative?.foods || [])
    .map((food) => `${food.foodId}:${food.quantity}`)
    .join("|");
}

function validateAlternativeConstraints(result, snapshot) {
  if (!result?.alternative) return ["missing_alternative"];
  const level = result.relaxation?.level || "STRICT";
  return result.alternative.foods.flatMap((output) => {
    const source = findById(snapshot, output.foodId);
    if (!source) return [`unknown_food:${output.foodId}`];
    return quantityViolations(source, Number(output.quantity), level)
      .map((issue) => `${output.foodId}:${issue}`);
  });
}

function candidateViolations(generated, snapshot, mealType, requiredIds = []) {
  const required = new Set(requiredIds.map(String));
  return (generated.candidates || []).flatMap((candidate, candidateIndex) => {
    const issues = [];
    const ids = candidate.foodIds.map(String);
    if (new Set(ids).size !== ids.length) issues.push(`${candidateIndex}:duplicate_food`);
    for (const requiredId of required) {
      if (!ids.includes(requiredId)) issues.push(`${candidateIndex}:missing_required:${requiredId}`);
    }
    for (const id of ids) {
      const food = findById(snapshot, id);
      if (!food) {
        issues.push(`${candidateIndex}:unknown_food:${id}`);
        continue;
      }
      const generation = normalizeFoodGenerationForRead(food.generation);
      const assignedRole = candidate.roleAssignments?.[id];
      if (!assignedRole || generation.roles[assignedRole] !== true) {
        issues.push(`${candidateIndex}:invalid_role:${id}:${assignedRole}`);
      }
      if (!required.has(id)) {
        if (generation.mode !== "GENERIC") issues.push(`${candidateIndex}:spontaneous_non_generic:${id}`);
        if (generation.mealTypes[mealType] !== true) issues.push(`${candidateIndex}:wrong_meal_type:${id}`);
      }
    }
    return issues;
  });
}

async function attempt(action) {
  try {
    return { threw: false, value: await action() };
  } catch (error) {
    return {
      threw: true,
      error: {
        name: error?.name || "Error",
        code: error?.code || null,
        field: error?.field || null,
        message: error?.publicMessage || error?.message || String(error),
      },
    };
  }
}

function inventory(snapshot) {
  const generations = snapshot.map((food) => ({ food, generation: normalizeFoodGenerationForRead(food.generation) }));
  const count = (predicate) => generations.filter(predicate).length;
  return {
    documents: snapshot.length,
    active: snapshot.filter((food) => food?.activo !== false).length,
    modes: Object.fromEntries(GENERATION_MODES.map((mode) => [mode, count(({ generation }) => generation.mode === mode)])),
    modesWithAtLeastOneRole: Object.fromEntries(GENERATION_MODES.map((mode) => [mode, count(({ generation }) =>
      generation.mode === mode && Object.values(generation.roles).some(Boolean)
    )])),
    roles: Object.fromEntries(GENERATION_ROLES.map((role) => [role, count(({ generation }) => generation.roles[role] === true)])),
    mealTypes: Object.fromEntries(GENERATION_MEAL_TYPES.map((mealType) => [mealType, count(({ generation }) =>
      generation.mealTypes[mealType] === true
    )])),
    units: Object.fromEntries([...snapshot.reduce((counts, food) => {
      const unit = normalizedUnit(food, food?.generation?.portionRule || {});
      counts.set(unit, (counts.get(unit) || 0) + 1);
      return counts;
    }, new Map())].sort(([left], [right]) => left.localeCompare(right))),
    genericWithCompleteGenerationRule: count(({ generation }) =>
      generation.mode === "GENERIC" &&
      generation.portionRule.unit !== null &&
      generation.portionRule.min !== null &&
      generation.portionRule.max !== null &&
      generation.portionRule.step !== null
    ),
    explicitOnlyWithoutRoles: count(({ generation }) =>
      generation.mode === "EXPLICIT_ONLY" && !Object.values(generation.roles).some(Boolean)
    ),
  };
}

function markdown(report) {
  const pass = report.scenarios.filter((scenario) => scenario.status === "PASS").length;
  const fail = report.scenarios.filter((scenario) => scenario.status === "FAIL").length;
  const observations = report.scenarios.filter((scenario) => scenario.status === "OBSERVATION").length;
  const lines = [
    "# Auditoría backend central de generación",
    "",
    `- Fecha: ${report.generatedAt}`,
    `- Base/colección: ${report.database}/${report.collection}`,
    `- Escenarios: ${report.scenarios.length} (${pass} PASS, ${fail} FAIL, ${observations} observaciones)`,
    `- Mongo sin cambios: ${report.safety.databaseUnchanged}`,
    `- Writes ejecutados por el auditor: ${report.safety.directMongoWrites}`,
    `- Tiempo total: ${report.timing.totalMs} ms`,
    "",
    "## Hallazgos",
    "",
    ...report.findings.map((finding) => `- **${finding.severity} · ${finding.code}**: ${finding.message}`),
    "",
    "## Escenarios",
    "",
    "| Estado | Contrato | Origen | Tiempo | Detalle |",
    "|---|---|---|---:|---|",
    ...report.scenarios.map((scenario) => {
      const detail = scenario.violations.length
        ? scenario.violations.join("; ")
        : scenario.note || "sin violaciones";
      return `| ${scenario.status} | ${scenario.name} | ${scenario.source} | ${scenario.elapsedMs} ms | ${String(detail).replace(/\|/g, "\\|")} |`;
    }),
    "",
    "## Seguridad",
    "",
    `- Fingerprint catálogo antes: \`${report.safety.catalogFingerprintBefore}\``,
    `- Fingerprint catálogo después: \`${report.safety.catalogFingerprintAfter}\``,
    `- Fingerprint generation antes: \`${report.safety.generationFingerprintBefore}\``,
    `- Fingerprint generation después: \`${report.safety.generationFingerprintAfter}\``,
    `- Lecturas Mongo directas: ${report.safety.directMongoReads}`,
    `- Escrituras Mongo directas: ${report.safety.directMongoWrites}`,
    "",
    "El JSON adjunto contiene entradas, resultados, cantidades, rondas y tiempos completos.",
  ];
  return `${lines.join("\n")}\n`;
}

async function main() {
  const totalStartedAt = performance.now();
  await CnxMongoDB.conectar();
  if (!CnxMongoDB.connection || !CnxMongoDB.db) throw new Error("No se pudo conectar a MongoDB.");
  const databaseModel = new ModelMongoDBAlimentos();
  const before = await databaseModel.obtenerAlimentos();
  const snapshotHashBefore = catalogFingerprint(before);
  const scenarios = [];
  const findings = [];

  const record = async ({ name, source = "real_catalog", note = "", action, verify = () => [] }) => {
    const startedAt = performance.now();
    let actual = null;
    let violations = [];
    try {
      actual = await action();
      violations = (await verify(actual)).filter(Boolean);
    } catch (error) {
      violations = [`unexpected_error:${error?.code || error?.message || String(error)}`];
      actual = { error: { code: error?.code || null, message: error?.message || String(error) } };
    }
    const status = source === "catalog_observation" ? "OBSERVATION" : violations.length ? "FAIL" : "PASS";
    scenarios.push({
      name,
      source,
      status,
      note,
      elapsedMs: round(performance.now() - startedAt, 2),
      violations,
      actual,
    });
    return actual;
  };

  const chicken = findById(before, knownIds.chicken);
  const rice = findById(before, knownIds.rice);
  const bananaSmall = findById(before, knownIds.bananaSmall);
  const beer = findById(before, knownIds.beer);
  if (!chicken || !rice || !bananaSmall || !beer) {
    throw new Error("Faltan alimentos reales requeridos para la matriz dirigida.");
  }

  const selectedIds = new Set([primaryId(chicken), primaryId(rice)]);
  const lunchP2 = findGeneric(before, "P2", "lunch", selectedIds);
  if (lunchP2) selectedIds.add(primaryId(lunchP2));
  const lunchV = findGeneric(before, "V", "lunch", selectedIds);
  if (lunchV) selectedIds.add(primaryId(lunchV));
  const lunchG = findGeneric(before, "G", "lunch", selectedIds);
  const lockFoods = [chicken, rice, lunchP2, lunchV, lunchG].filter(Boolean);

  const catalogInventory = inventory(before);
  await record({
    name: "inventario de modos, roles, mealTypes y unidades",
    source: "catalog_observation",
    note: "Estado persistido; no presupone que toda configuración incompleta sea un bug.",
    action: async () => catalogInventory,
  });
  if (catalogInventory.explicitOnlyWithoutRoles > 0) {
    findings.push({
      severity: "RISK",
      code: "EXPLICIT_ONLY_WITHOUT_ROLES",
      message: `${catalogInventory.explicitOnlyWithoutRoles} alimentos EXPLICIT_ONLY no tienen roles; el combinador no puede asignarlos aunque sean requeridos hasta que se configuren manualmente.`,
    });
  }
  if (catalogInventory.genericWithCompleteGenerationRule < catalogInventory.modes.GENERIC) {
    findings.push({
      severity: "RISK",
      code: "GENERIC_RULES_FALL_BACK_TO_LEGACY",
      message: `${catalogInventory.modes.GENERIC - catalogInventory.genericWithCompleteGenerationRule} GENERIC no tienen portionRule generation completa y dependen de reglas legacy/defaults efectivos.`,
    });
  }

  const mealTypeRuns = {};
  for (const mealType of GENERATION_MEAL_TYPES) {
    mealTypeRuns[mealType] = await record({
      name: `ALLOW_SUGGESTIONS batch32 · ${mealType}`,
      action: async () => {
        const model = createSnapshotModel(before);
        const candidateStarted = performance.now();
        const candidates = await generateFoodCombinationCandidates({
          mealType,
          mode: FOOD_COMBINATION_MODES.ALLOW_SUGGESTIONS,
          requiredFoodIds: [],
          excludedFoodIds: [],
          limit: 32,
        }, { model });
        const candidateElapsedMs = performance.now() - candidateStarted;
        const solverStarted = performance.now();
        const result = await generateMealAlternative({
          mealType,
          target: mealTargets[mealType],
          requiredFoodIds: [],
          excludedFoodIds: [],
          generationMode: FOOD_COMBINATION_MODES.ALLOW_SUGGESTIONS,
          limit: 32,
          maxFoods: 6,
          variantSeed: `contract-audit:${mealType}`,
        }, { model });
        return {
          mealType,
          candidateCount: candidates.candidates.length,
          candidateMeta: candidates.meta,
          candidateElapsedMs: round(candidateElapsedMs, 2),
          structures: [...new Set(candidates.candidates.map((candidate) => candidate.structure))],
          rolesCovered: Object.fromEntries(GENERATION_ROLES.map((role) => [role,
            candidates.candidates.some((candidate) => Object.values(candidate.roleAssignments).includes(role))
          ])),
          candidateViolations: candidateViolations(candidates, before, mealType),
          solverElapsedMs: round(performance.now() - solverStarted, 2),
          solver: resultSummary(result),
          solverConstraintViolations: validateAlternativeConstraints(result, before),
          queryCounts: model.queryCounts(),
        };
      },
      verify: (actual) => [
        actual.candidateCount !== 32 ? `expected_32_candidates:${actual.candidateCount}` : null,
        ...actual.candidateViolations,
        actual.solver.status !== "SUCCESS" ? `solver_status:${actual.solver.status}` : null,
        actual.solver.usable !== true ? "solver_not_usable" : null,
        ...actual.solverConstraintViolations,
      ],
    });
  }

  await record({
    name: "cobertura agregada P1/P2/C1/C2/V/F/G en batch32",
    action: async () => ({
      byMealType: Object.fromEntries(GENERATION_MEAL_TYPES.map((mealType) => [
        mealType,
        mealTypeRuns[mealType].rolesCovered,
      ])),
      globallyCovered: Object.fromEntries(GENERATION_ROLES.map((role) => [
        role,
        GENERATION_MEAL_TYPES.some((mealType) => mealTypeRuns[mealType].rolesCovered[role]),
      ])),
    }),
    verify: (actual) => GENERATION_ROLES
      .filter((role) => actual.globallyCovered[role] !== true)
      .map((role) => `role_not_covered:${role}`),
  });

  await record({
    name: "ONLY_SELECTED conserva exactamente GENERIC requeridos",
    action: async () => {
      const model = createSnapshotModel(before);
      const result = await generateMealAlternative({
        mealType: "lunch",
        target: standardTarget,
        requiredFoodIds: [primaryId(chicken), primaryId(rice)],
        excludedFoodIds: [],
        generationMode: FOOD_COMBINATION_MODES.ONLY_SELECTED_FOODS,
        limit: 32,
        maxFoods: 6,
      }, { model });
      return { result: resultSummary(result), queryCounts: model.queryCounts() };
    },
    verify: ({ result }) => {
      const output = new Set(result.alternative?.foods.map((food) => food.foodId) || []);
      return [
        result.status !== "SUCCESS" ? `status:${result.status}` : null,
        output.size !== 2 ? `food_count:${output.size}` : null,
        !output.has(primaryId(chicken)) ? "missing_chicken" : null,
        !output.has(primaryId(rice)) ? "missing_rice" : null,
      ];
    },
  });

  await record({
    name: "required GENERIC ignora mealType falso sólo por selección explícita",
    action: async () => {
      const model = createSnapshotModel(before);
      const result = await generateMealAlternative({
        mealType: "breakfast",
        target: standardTarget,
        requiredFoodIds: [primaryId(chicken), primaryId(rice)],
        excludedFoodIds: [],
        generationMode: FOOD_COMBINATION_MODES.ONLY_SELECTED_FOODS,
        limit: 32,
      }, { model });
      return resultSummary(result);
    },
    verify: (result) => [
      result.status !== "SUCCESS" ? `status:${result.status}` : null,
      ...(result.alternative?.foods.length === 2 ? [] : ["selection_not_preserved"]),
    ],
  });

  const explicitChicken = withMode(chicken, "EXPLICIT_ONLY");
  const explicitSnapshot = replaceFood(before, explicitChicken);
  await record({
    name: "required EXPLICIT_ONLY con rol configurado participa; espontáneo no",
    source: "ephemeral_overlay_real_food",
    note: "Sólo cambia mode de Pechuga en memoria; Mongo no se modifica.",
    action: async () => {
      const selectedModel = createSnapshotModel(explicitSnapshot);
      const selected = await generateMealAlternative({
        mealType: "breakfast",
        target: standardTarget,
        requiredFoodIds: [primaryId(explicitChicken), primaryId(rice)],
        excludedFoodIds: [],
        generationMode: FOOD_COMBINATION_MODES.ONLY_SELECTED_FOODS,
        limit: 32,
      }, { model: selectedModel });
      const spontaneousModel = createSnapshotModel(explicitSnapshot);
      const spontaneous = await generateFoodCombinationCandidates({
        mealType: "lunch",
        mode: FOOD_COMBINATION_MODES.ALLOW_SUGGESTIONS,
        requiredFoodIds: [],
        excludedFoodIds: [],
        limit: 32,
      }, { model: spontaneousModel });
      return {
        selected: resultSummary(selected),
        spontaneousContainsExplicit: spontaneous.candidates.some((candidate) =>
          candidate.foodIds.includes(primaryId(explicitChicken))
        ),
      };
    },
    verify: (actual) => [
      actual.selected.status !== "SUCCESS" ? `selected_status:${actual.selected.status}` : null,
      !actual.selected.alternative?.foods.some((food) => food.foodId === primaryId(explicitChicken))
        ? "explicit_required_missing"
        : null,
      actual.spontaneousContainsExplicit ? "explicit_appeared_spontaneously" : null,
    ],
  });

  const disabledChicken = withMode(chicken, "DISABLED");
  const disabledSnapshot = replaceFood(before, disabledChicken);
  await record({
    name: "required DISABLED se rechaza y jamás aparece espontáneamente",
    source: "ephemeral_overlay_real_food",
    note: "Sólo cambia mode de Pechuga en memoria; el catálogo persistido no contiene DISABLED.",
    action: async () => {
      const required = await attempt(() => generateFoodCombinationCandidates({
        mealType: "lunch",
        mode: FOOD_COMBINATION_MODES.ONLY_SELECTED_FOODS,
        requiredFoodIds: [primaryId(disabledChicken), primaryId(rice)],
        excludedFoodIds: [],
        limit: 32,
      }, { model: createSnapshotModel(disabledSnapshot) }));
      const spontaneous = await generateFoodCombinationCandidates({
        mealType: "lunch",
        mode: FOOD_COMBINATION_MODES.ALLOW_SUGGESTIONS,
        requiredFoodIds: [],
        excludedFoodIds: [],
        limit: 32,
      }, { model: createSnapshotModel(disabledSnapshot) });
      return {
        required,
        spontaneousContainsDisabled: spontaneous.candidates.some((candidate) =>
          candidate.foodIds.includes(primaryId(disabledChicken))
        ),
      };
    },
    verify: (actual) => [
      !actual.required.threw ? "disabled_required_not_rejected" : null,
      actual.required.error?.code !== "INVALID_FOOD_COMBINATION"
        ? `unexpected_error_code:${actual.required.error?.code}`
        : null,
      actual.spontaneousContainsDisabled ? "disabled_appeared_spontaneously" : null,
    ],
  });

  const unitCases = [
    { label: "gramos", food: chicken, quantity: 150 },
    { label: "ml", food: beer, quantity: 100 },
    { label: "discreto", food: bananaSmall, quantity: 1 },
  ];
  for (const unitCase of unitCases) {
    await record({
      name: `unidad ${unitCase.label}: recálculo y cantidad física`,
      action: async () => {
        const target = sumNutrition([{ food: unitCase.food, quantity: unitCase.quantity }]);
        const result = await recalculateMealAlternativeQuantities({
          mealType: "lunch",
          target,
          selectedFoodIds: [primaryId(unitCase.food)],
          fixedFoods: [],
        }, { model: createSnapshotModel(before) });
        return {
          food: {
            id: primaryId(unitCase.food),
            name: foodName(unitCase.food),
            sourceUnit: unitCase.food.unidad || unitCase.food.Unidad,
            normalizedUnit: normalizedUnit(unitCase.food),
            effectiveRule: effectiveRule(unitCase.food, result.relaxation?.level),
          },
          requestedQuantity: unitCase.quantity,
          target: roundedNutrition(target),
          result: resultSummary(result),
          constraintViolations: validateAlternativeConstraints(result, before),
        };
      },
      verify: (actual) => [
        actual.result.status !== "SUCCESS" ? `status:${actual.result.status}` : null,
        ...actual.constraintViolations,
        Math.abs((actual.result.alternative?.foods[0]?.quantity || 0) - actual.requestedQuantity) > EPS
          ? `quantity:${actual.result.alternative?.foods[0]?.quantity}`
          : null,
      ],
    });
  }

  const exactTarget = sumNutrition([
    { food: chicken, quantity: 150 },
    { food: rice, quantity: 100 },
  ]);
  await record({
    name: "MIN/MAX/STEP reales permanecen duros en STRICT",
    action: async () => {
      const result = await recalculateMealAlternativeQuantities({
        mealType: "lunch",
        target: exactTarget,
        selectedFoodIds: [primaryId(chicken), primaryId(rice)],
      }, { model: createSnapshotModel(before) });
      return {
        rules: [chicken, rice].map((food) => ({ id: primaryId(food), name: foodName(food), rule: effectiveRule(food) })),
        result: resultSummary(result),
        constraintViolations: validateAlternativeConstraints(result, before),
      };
    },
    verify: (actual) => [
      actual.result.status !== "SUCCESS" ? `status:${actual.result.status}` : null,
      actual.result.relaxation?.level !== "STRICT" ? `relaxation:${actual.result.relaxation?.level}` : null,
      ...actual.constraintViolations,
    ],
  });

  const chickenRule = effectiveRule(chicken);
  const hardLockCases = [
    { label: "MIN", quantity: Number(chickenRule.min) - 30 },
    { label: "MAX", quantity: Number(chickenRule.max) + Number(chickenRule.step || 10) },
    { label: "STEP", quantity: Number(chickenRule.min) + 3 },
  ];
  for (const lockCase of hardLockCases) {
    await record({
      name: `lock inválido por ${lockCase.label} termina NO_SOLUTION`,
      action: async () => {
        const target = sumNutrition([{ food: chicken, quantity: Math.max(1, lockCase.quantity) }]);
        const result = await recalculateMealAlternativeQuantities({
          mealType: "lunch",
          target,
          selectedFoodIds: [primaryId(chicken)],
          fixedFoods: [{ foodId: primaryId(chicken), quantity: lockCase.quantity }],
        }, { model: createSnapshotModel(before) });
        return { quantity: lockCase.quantity, strictRule: chickenRule, result: resultSummary(result) };
      },
      verify: ({ result }) => [
        result.status !== "NO_SOLUTION" ? `status:${result.status}` : null,
        result.usable !== false ? "unexpected_usable" : null,
        result.meta?.quantitySolutionsFound !== 0 ? `solutions:${result.meta?.quantitySolutionsFound}` : null,
      ],
    });
  }

  await record({
    name: "lock en grilla 5 requiere RELAX_STEP y queda exacto",
    action: async () => {
      const quantity = Number(chickenRule.min) + 5;
      const target = sumNutrition([{ food: chicken, quantity }]);
      const result = await recalculateMealAlternativeQuantities({
        mealType: "lunch",
        target,
        selectedFoodIds: [primaryId(chicken)],
        fixedFoods: [{ foodId: primaryId(chicken), quantity }],
      }, { model: createSnapshotModel(before) });
      return { quantity, target: roundedNutrition(target), result: resultSummary(result) };
    },
    verify: (actual) => [
      actual.result.status !== "SUCCESS" ? `status:${actual.result.status}` : null,
      actual.result.relaxation?.level !== "RELAX_STEP" ? `relaxation:${actual.result.relaxation?.level}` : null,
      actual.result.alternative?.foods[0]?.quantity !== actual.quantity ? "lock_not_preserved" : null,
    ],
  });

  await record({
    name: "lock 20 g bajo MIN requiere RELAX_MIN y queda exacto",
    action: async () => {
      const quantity = Number(chickenRule.min) - 20;
      const target = sumNutrition([{ food: chicken, quantity }]);
      const result = await recalculateMealAlternativeQuantities({
        mealType: "lunch",
        target,
        selectedFoodIds: [primaryId(chicken)],
        fixedFoods: [{ foodId: primaryId(chicken), quantity }],
      }, { model: createSnapshotModel(before) });
      return { quantity, target: roundedNutrition(target), result: resultSummary(result) };
    },
    verify: (actual) => [
      actual.result.status !== "SUCCESS" ? `status:${actual.result.status}` : null,
      actual.result.relaxation?.level !== "RELAX_MIN" ? `relaxation:${actual.result.relaxation?.level}` : null,
      actual.result.alternative?.foods[0]?.quantity !== actual.quantity ? "lock_not_preserved" : null,
    ],
  });

  const relaxStepTarget = sumNutrition([
    { food: chicken, quantity: 135 },
    { food: rice, quantity: 105 },
  ]);
  await record({
    name: "auto STRICT→RELAX_STEP sobre reglas reales",
    action: async () => {
      const result = await recalculateMealAlternativeQuantities({
        mealType: "lunch",
        target: relaxStepTarget,
        selectedFoodIds: [primaryId(chicken), primaryId(rice)],
      }, { model: createSnapshotModel(before) });
      return { target: roundedNutrition(relaxStepTarget), result: resultSummary(result) };
    },
    verify: ({ result }) => [
      result.status !== "SUCCESS" ? `status:${result.status}` : null,
      result.relaxation?.level !== "RELAX_STEP" ? `relaxation:${result.relaxation?.level}` : null,
    ],
  });

  const relaxMinTarget = sumNutrition([
    { food: chicken, quantity: 80 },
    { food: rice, quantity: 60 },
  ]);
  await record({
    name: "auto STRICT→RELAX_STEP→RELAX_MIN sobre reglas reales",
    action: async () => {
      const result = await recalculateMealAlternativeQuantities({
        mealType: "lunch",
        target: relaxMinTarget,
        selectedFoodIds: [primaryId(chicken), primaryId(rice)],
      }, { model: createSnapshotModel(before) });
      return { target: roundedNutrition(relaxMinTarget), result: resultSummary(result) };
    },
    verify: ({ result }) => [
      result.status !== "SUCCESS" ? `status:${result.status}` : null,
      result.relaxation?.level !== "RELAX_MIN" ? `relaxation:${result.relaxation?.level}` : null,
    ],
  });

  let lockBaseline = null;
  if (lockFoods.length === 5) {
    const baselineResult = await recalculateMealAlternativeQuantities({
      mealType: "lunch",
      target: { kcal: 700, proteina: 52, carbs: 82, grasas: 22 },
      selectedFoodIds: lockFoods.map(primaryId),
    }, { model: createSnapshotModel(before) });
    lockBaseline = resultSummary(baselineResult);
    const baselineQuantities = new Map((baselineResult.alternative?.foods || [])
      .map((food) => [String(food.foodId), Number(food.quantity)]));
    for (const lockCount of [0, 1, 2, 4, 5]) {
      await record({
        name: `locks ${lockCount}${lockCount === 5 ? " (all)" : ""}: fijos exactos y Auto recalculables`,
        action: async () => {
          const fixedFoods = lockFoods.slice(0, lockCount).map((food) => ({
            foodId: primaryId(food),
            quantity: baselineQuantities.get(primaryId(food)),
          }));
          const result = await recalculateMealAlternativeQuantities({
            mealType: "lunch",
            target: { kcal: 700, proteina: 52, carbs: 82, grasas: 22 },
            selectedFoodIds: lockFoods.map(primaryId),
            fixedFoods,
          }, { model: createSnapshotModel(before) });
          return {
            lockCount,
            fixedFoods,
            result: resultSummary(result),
            constraintViolations: validateAlternativeConstraints(result, before),
          };
        },
        verify: (actual) => {
          const output = new Map((actual.result.alternative?.foods || []).map((food) => [food.foodId, food.quantity]));
          return [
            actual.result.status !== "SUCCESS" ? `status:${actual.result.status}` : null,
            actual.result.meta?.fixedFoods !== lockCount ? `fixed_meta:${actual.result.meta?.fixedFoods}` : null,
            ...actual.fixedFoods
              .filter((fixed) => Math.abs((output.get(fixed.foodId) || 0) - fixed.quantity) > EPS)
              .map((fixed) => `lock_changed:${fixed.foodId}`),
            ...actual.constraintViolations,
          ];
        },
      });
    }
  } else {
    findings.push({
      severity: "BLOCKED",
      code: "LOCK_MATRIX_FOOD_COVERAGE",
      message: `No se encontraron cinco GENERIC lunch únicos para P1/C1/P2/V/G; sólo ${lockFoods.length}.`,
    });
  }

  const minimumTargetNutrition = sumNutrition([
    { food: chicken, quantity: Number(chickenRule.min) },
    { food: rice, quantity: Number(effectiveRule(rice).min) },
  ]);
  const minimumOvershootTarget = {
    ...minimumTargetNutrition,
    kcal: Math.max(1, minimumTargetNutrition.kcal - 50),
  };
  await record({
    name: "mínimos físicos > target+10 producen BEST_EFFORT usable",
    action: async () => {
      const result = await generateMealAlternative({
        mealType: "lunch",
        target: minimumOvershootTarget,
        requiredFoodIds: [primaryId(chicken), primaryId(rice)],
        excludedFoodIds: [],
        generationMode: FOOD_COMBINATION_MODES.ONLY_SELECTED_FOODS,
        limit: 32,
      }, { model: createSnapshotModel(before) });
      return {
        physicalMinimum: roundedNutrition(minimumTargetNutrition),
        target: roundedNutrition(minimumOvershootTarget),
        result: resultSummary(result),
        constraintViolations: validateAlternativeConstraints(result, before),
      };
    },
    verify: (actual) => [
      actual.result.status !== "SUCCESS" ? `status:${actual.result.status}` : null,
      actual.result.classification !== "BEST_EFFORT" ? `classification:${actual.result.classification}` : null,
      actual.result.usable !== true ? "not_usable" : null,
      !((actual.result.alternative?.difference?.kcal || 0) > 10) ? "overshoot_not_above_10" : null,
      ...actual.constraintViolations,
    ],
  });

  const discreteRuleFood = withRule(bananaSmall, { unit: "unidad", min: 1, max: 2, step: 1 });
  const discreteSnapshot = replaceFood(before, discreteRuleFood);
  const discreteTwo = nutritionAt(discreteRuleFood, 2);
  const discreteTarget = {
    ...discreteTwo,
    kcal: Math.max(1, discreteTwo.kcal - 20),
  };
  await record({
    name: "overshoot opcional discreto: +20 gana a déficit mayor",
    source: "ephemeral_overlay_real_food",
    note: "Usa macros reales de Banana chica; sólo completa min=1/max=2/step=1 en memoria.",
    action: async () => {
      const result = await recalculateMealAlternativeQuantities({
        mealType: "snack",
        target: discreteTarget,
        selectedFoodIds: [primaryId(discreteRuleFood)],
      }, { model: createSnapshotModel(discreteSnapshot) });
      return {
        kcalPerUnit: round(nutritionAt(discreteRuleFood, 1).kcal),
        target: roundedNutrition(discreteTarget),
        result: resultSummary(result),
      };
    },
    verify: ({ result }) => [
      result.status !== "SUCCESS" ? `status:${result.status}` : null,
      result.classification !== "BEST_EFFORT" ? `classification:${result.classification}` : null,
      result.alternative?.foods[0]?.quantity !== 2 ? `quantity:${result.alternative?.foods[0]?.quantity}` : null,
      Math.abs((result.alternative?.difference?.kcal || 0) - 20) > 0.02
        ? `kcal_difference:${result.alternative?.difference?.kcal}`
        : null,
    ],
  });

  await record({
    name: "lock válido con overshoot >+10 se conserva como BEST_EFFORT",
    action: async () => {
      const quantity = 200;
      const lockedNutrition = nutritionAt(chicken, quantity);
      const target = { ...lockedNutrition, kcal: Math.max(1, lockedNutrition.kcal - 20) };
      const result = await recalculateMealAlternativeQuantities({
        mealType: "lunch",
        target,
        selectedFoodIds: [primaryId(chicken)],
        fixedFoods: [{ foodId: primaryId(chicken), quantity }],
      }, { model: createSnapshotModel(before) });
      return { quantity, target: roundedNutrition(target), result: resultSummary(result) };
    },
    verify: (actual) => [
      actual.result.status !== "SUCCESS" ? `status:${actual.result.status}` : null,
      actual.result.classification !== "BEST_EFFORT" ? `classification:${actual.result.classification}` : null,
      actual.result.alternative?.foods[0]?.quantity !== actual.quantity ? "lock_not_preserved" : null,
      !((actual.result.alternative?.difference?.kcal || 0) > 10) ? "overshoot_not_above_10" : null,
    ],
  });

  const seedInput = {
    mealType: "lunch",
    target: standardTarget,
    requiredFoodIds: [],
    excludedFoodIds: [],
    generationMode: FOOD_COMBINATION_MODES.ALLOW_SUGGESTIONS,
    limit: 32,
    maxFoods: 6,
  };
  await record({
    name: "semillas: repetibilidad y diversidad dentro del variant pool",
    action: async () => {
      const seeds = Array.from({ length: 12 }, (_, index) => `contract-seed-${index}`);
      const runs = [];
      for (const seed of seeds) {
        const result = await generateMealAlternative({ ...seedInput, variantSeed: seed }, {
          model: createSnapshotModel(before),
        });
        runs.push({ seed, signature: solutionSignature(result), result: resultSummary(result) });
      }
      const repeatedA = await generateMealAlternative({ ...seedInput, variantSeed: seeds[0] }, {
        model: createSnapshotModel(before),
      });
      const repeatedB = await generateMealAlternative({ ...seedInput, variantSeed: seeds[0] }, {
        model: createSnapshotModel(before),
      });
      return {
        seeds,
        uniqueSignatures: new Set(runs.map((run) => run.signature)).size,
        deterministicSameSeed: solutionSignature(repeatedA) === solutionSignature(repeatedB),
        runs,
      };
    },
    verify: (actual) => [
      !actual.deterministicSameSeed ? "same_seed_not_deterministic" : null,
      actual.runs.some((run) => run.result.status !== "SUCCESS") ? "seed_run_failed" : null,
      actual.runs.some((run) => run.result.usable !== true) ? "seed_run_not_usable" : null,
    ],
  });

  await record({
    name: "preferredCombinations y excludedFoodIds conservan sus contratos",
    action: async () => {
      const base = await generateFoodCombinationCandidates({
        mealType: "lunch",
        mode: FOOD_COMBINATION_MODES.ALLOW_SUGGESTIONS,
        requiredFoodIds: [],
        excludedFoodIds: [],
        limit: 32,
      }, { model: createSnapshotModel(before) });
      const preferredSource = base.candidates.find((candidate, index, values) =>
        index > 0 && values.some((other, otherIndex) => otherIndex < index && other.structure === candidate.structure)
      ) || base.candidates.at(-1);
      const preferred = await generateFoodCombinationCandidates({
        mealType: "lunch",
        mode: FOOD_COMBINATION_MODES.ALLOW_SUGGESTIONS,
        requiredFoodIds: [],
        excludedFoodIds: [],
        preferredCombinations: [preferredSource.foodIds],
        limit: 32,
      }, { model: createSnapshotModel(before) });
      const excludedId = base.candidates[0]?.foodIds[0];
      const excluded = await generateFoodCombinationCandidates({
        mealType: "lunch",
        mode: FOOD_COMBINATION_MODES.ALLOW_SUGGESTIONS,
        requiredFoodIds: [],
        excludedFoodIds: [excludedId],
        limit: 32,
      }, { model: createSnapshotModel(before) });
      const preferredMatch = preferred.candidates.find((candidate) =>
        candidate.foodIds.slice().sort().join("|") === preferredSource.foodIds.slice().sort().join("|")
      );
      return {
        preferredSource,
        preferredMatch: preferredMatch || null,
        excludedId,
        excludedStillPresent: excluded.candidates.some((candidate) => candidate.foodIds.includes(excludedId)),
      };
    },
    verify: (actual) => [
      !actual.preferredMatch ? "preferred_combination_missing" : null,
      actual.preferredMatch?.preferredCombinationMatch !== true ? "preferred_flag_missing" : null,
      actual.excludedStillPresent ? "excluded_food_present" : null,
    ],
  });

  const snapshotHashAfterEngine = catalogFingerprint(before);
  if (snapshotHashAfterEngine !== snapshotHashBefore) {
    findings.push({
      severity: "BUG",
      code: "IN_MEMORY_CATALOG_MUTATED",
      message: "El motor mutó el snapshot del catálogo durante la auditoría.",
    });
  }

  const after = await databaseModel.obtenerAlimentos();
  const safety = {
    documentsBefore: before.length,
    documentsAfter: after.length,
    directMongoReads: 2,
    directMongoWrites: 0,
    snapshotFingerprintBefore: snapshotHashBefore,
    snapshotFingerprintAfterEngine: snapshotHashAfterEngine,
    snapshotUnchanged: snapshotHashBefore === snapshotHashAfterEngine,
    catalogFingerprintBefore: catalogFingerprint(before),
    catalogFingerprintAfter: catalogFingerprint(after),
    generationFingerprintBefore: generationFingerprint(before),
    generationFingerprintAfter: generationFingerprint(after),
  };
  safety.databaseUnchanged = safety.documentsBefore === safety.documentsAfter &&
    safety.catalogFingerprintBefore === safety.catalogFingerprintAfter &&
    safety.generationFingerprintBefore === safety.generationFingerprintAfter;

  const failures = scenarios.filter((scenario) => scenario.status === "FAIL");
  for (const failure of failures) {
    findings.push({
      severity: "BUG",
      code: `SCENARIO_${scenarios.indexOf(failure) + 1}_FAILED`,
      message: `${failure.name}: ${failure.violations.join("; ")}.`,
    });
  }
  if (!safety.databaseUnchanged) {
    findings.push({
      severity: "BUG",
      code: "DATABASE_FINGERPRINT_CHANGED",
      message: "El fingerprint del catálogo o de generation cambió durante la corrida.",
    });
  }
  if (!findings.some((finding) => finding.severity === "BUG")) {
    findings.unshift({
      severity: "OK",
      code: "NO_ENGINE_CONTRACT_BUG_REPRODUCED",
      message: "La matriz no reprodujo violaciones funcionales en los contratos auditados.",
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    database: process.env.MONGO_DB || process.env.BASE || "test",
    collection: "fooddatabase2",
    mode: "read-only real Mongo snapshot plus explicitly labeled ephemeral overlays",
    catalogInventory,
    selectedRealFoods: {
      core: [chicken, rice].map((food) => ({
        id: primaryId(food),
        name: foodName(food),
        generation: normalizeFoodGenerationForRead(food.generation),
        effectiveRule: effectiveRule(food),
      })),
      units: unitCases.map((entry) => ({
        id: primaryId(entry.food),
        name: foodName(entry.food),
        case: entry.label,
        normalizedUnit: normalizedUnit(entry.food),
        effectiveRule: effectiveRule(entry.food),
      })),
      locks: lockFoods.map((food) => ({
        id: primaryId(food),
        name: foodName(food),
        roles: normalizeFoodGenerationForRead(food.generation).roles,
        effectiveRule: effectiveRule(food),
      })),
    },
    lockBaseline,
    scenarios,
    findings,
    safety,
    timing: { totalMs: round(performance.now() - totalStartedAt, 2) },
  };
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    path.join(outputDirectory, "meal-generation-contract-audit.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(outputDirectory, "MEAL_GENERATION_CONTRACT_AUDIT.md"),
    markdown(report),
    "utf8",
  );
  console.log(JSON.stringify({
    outputDirectory,
    summary: {
      scenarios: scenarios.length,
      pass: scenarios.filter((scenario) => scenario.status === "PASS").length,
      fail: failures.length,
      observations: scenarios.filter((scenario) => scenario.status === "OBSERVATION").length,
      totalMs: report.timing.totalMs,
    },
    findings,
    safety,
  }, null, 2));
  if (failures.length || !safety.databaseUnchanged) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await CnxMongoDB.desconectar();
  });
