import dotenv from "dotenv";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

import CnxMongoDB from "../model/DBMongo.js";
import ModelMongoDBAlimentos from "../model/DAO/alimentosMongoDB.js";
import {
  FOOD_COMBINATION_MODES,
  generateFoodCombinationCandidates,
} from "../servicio/foodCombinationCandidates.js";
import {
  defaultFoodGeneration,
  normalizeFoodGenerationForRead,
} from "../servicio/foodGenerationMetadata.js";
import {
  generateMealAlternative,
  recalculateMealAlternativeQuantities,
} from "../servicio/mealAlternativeGenerator.js";
import {
  compareMealNutritionResults,
  evaluateMealNutritionResult,
} from "../servicio/mealNutritionPolicy.js";

dotenv.config();

const OUTPUT_DIRECTORY = path.resolve("artifacts", "central-contract-audit");
const JSON_FILE = path.join(OUTPUT_DIRECTORY, "nutrition-contract-functional-audit.json");
const MARKDOWN_FILE = path.join(OUTPUT_DIRECTORY, "NUTRITION_CONTRACT_FUNCTIONAL_AUDIT.md");
const CANONICAL_MEAL_TYPES = ["breakfast", "lunch", "snack", "dinner", "extraSnack"];

function round(value, digits = 2) {
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

function catalogFingerprint(documents = []) {
  return hash(sortedDocuments(documents));
}

function generationFingerprint(documents = []) {
  return hash(sortedDocuments(documents).map((document) => ({
    id: String(document._id),
    generation: document.generation ?? null,
  })));
}

function aliases(food = {}) {
  return new Set([food._id, food.id, food.alimentoId]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean));
}

function modelFor(source = []) {
  const byId = (id) => source.find((food) => aliases(food).has(String(id)));
  return {
    obtenerAlimentos: async () => source,
    obtenerAlimentosPorIds: async (ids = []) => ids.map(byId).filter(Boolean),
    obtenerAlimentoPorId: async (id) => byId(id) || null,
    obtenerAlimentosGeneracionAutomatica: async ({ mealType, roles = [] } = {}) => source.filter((food) => {
      if (food?.activo === false) return false;
      const generation = normalizeFoodGenerationForRead(food?.generation);
      return generation.mode === "GENERIC" &&
        generation.mealTypes[mealType] === true &&
        roles.some((role) => generation.roles[role] === true);
    }),
  };
}

function generation(role, { mode = "GENERIC", mealTypes = CANONICAL_MEAL_TYPES } = {}) {
  const value = defaultFoodGeneration();
  value.mode = mode;
  if (role) value.roles[role] = true;
  for (const mealType of mealTypes) value.mealTypes[mealType] = true;
  return value;
}

function fixtureFood(id, name, role, macros, {
  unit = "g",
  mode = "GENERIC",
  portionRule = null,
  active = true,
} = {}) {
  const value = {
    _id: id,
    alimentoId: id,
    nombre: name,
    Alimentos: name,
    unidad: unit,
    Unidad: unit,
    macroBasis: unit === "g" || unit === "ml" ? "perGram" : "perUnit",
    Calorias: macros.kcal,
    Proteinas: macros.proteina,
    Carbohidratos: macros.carbs,
    Grasas: macros.grasas,
    kcalUnidad: macros.kcal,
    proteinaUnidad: macros.proteina,
    carbohidratosUnidad: macros.carbs,
    grasasUnidad: macros.grasas,
    activo: active,
    generation: generation(role, { mode }),
  };
  if (portionRule) {
    value.generation.portionRule = { allowedValues: [], ...portionRule };
  }
  return value;
}

function foodName(food = {}) {
  return String(food.Alimentos || food.nombre || food.name || "Alimento").trim();
}

function findFood(snapshot, name) {
  const normalized = String(name).trim().toLowerCase();
  const food = snapshot.find((entry) => foodName(entry).toLowerCase() === normalized);
  if (!food) throw new Error(`No se encontró ${name} en el catálogo real.`);
  return food;
}

function resultSummary(result = {}) {
  return {
    status: result.status || null,
    classification: result.classification || null,
    code: result.code || null,
    recommended: result.recommended === true,
    usable: result.usable === true,
    relaxation: result.relaxation || null,
    totals: result.alternative?.totals || null,
    difference: result.alternative?.difference || null,
    warning: result.alternative?.nutrition?.warning || null,
    foods: (result.alternative?.foods || []).map((food) => ({
      id: food.foodId,
      name: food.name,
      quantity: food.quantity,
      unit: food.unit,
      role: food.role || null,
    })),
    meta: result.meta || null,
  };
}

async function capture(id, intent, operation, validate) {
  const startedAt = performance.now();
  try {
    const raw = await operation();
    const result = resultSummary(raw);
    const failures = validate ? validate(raw, result) : [];
    return {
      id,
      intent,
      status: failures.length ? "FAIL" : "PASS",
      failures,
      elapsedMs: round(performance.now() - startedAt),
      result,
    };
  } catch (error) {
    const caught = { code: error?.code || null, message: String(error?.publicMessage || error?.message || error) };
    const failures = validate ? validate(null, null, caught) : [caught.message];
    return {
      id,
      intent,
      status: failures.length ? "FAIL" : "PASS",
      failures,
      elapsedMs: round(performance.now() - startedAt),
      caught,
    };
  }
}

function request(overrides = {}) {
  return {
    mealType: "lunch",
    target: { kcal: 650, proteina: 45, carbs: 75, grasas: 18 },
    requiredFoodIds: [],
    excludedFoodIds: [],
    generationMode: FOOD_COMBINATION_MODES.ALLOW_SUGGESTIONS,
    limit: 32,
    maxFoods: 6,
    ...overrides,
  };
}

function policyCases() {
  const target = { kcal: 776, proteina: 57.6, carbs: 94.6, grasas: 15.6 };
  const examples = [
    {
      id: "policy-protein-band-wins",
      input: { target, a: { kcal: 775, proteina: 65, carbs: 94.6, grasas: 15.6 }, b: { kcal: 770, proteina: 59, carbs: 94.6, grasas: 15.6 } },
      expectedWinner: "B",
    },
    {
      id: "policy-kcal-wins-same-protein-band",
      input: { target, a: { kcal: 775, proteina: 58.5, carbs: 94.6, grasas: 15.6 }, b: { kcal: 770, proteina: 58, carbs: 94.6, grasas: 15.6 } },
      expectedWinner: "A",
    },
  ];
  return examples.map((entry) => {
    const comparison = compareMealNutritionResults(entry.input.a, entry.input.b, entry.input.target);
    const winner = comparison < 0 ? "A" : comparison > 0 ? "B" : "TIE";
    return {
      ...entry,
      status: winner === entry.expectedWinner ? "PASS" : "FAIL",
      winner,
      assessmentA: evaluateMealNutritionResult(entry.input.a, entry.input.target),
      assessmentB: evaluateMealNutritionResult(entry.input.b, entry.input.target),
    };
  });
}

function catalogCoverage(snapshot) {
  const modes = {};
  const genericRoles = Object.fromEntries(["P1", "P2", "C1", "C2", "V", "F", "G"].map((key) => [key, 0]));
  const genericMealTypes = Object.fromEntries(CANONICAL_MEAL_TYPES.map((key) => [key, 0]));
  let persistedGeneration = 0;
  let explicitWithRoles = 0;
  let genericMl = 0;
  let genericDiscrete = 0;
  for (const food of snapshot) {
    const generationValue = normalizeFoodGenerationForRead(food?.generation);
    modes[generationValue.mode] = (modes[generationValue.mode] || 0) + 1;
    if (food?.generation) persistedGeneration += 1;
    if (generationValue.mode === "EXPLICIT_ONLY" && Object.values(generationValue.roles).some(Boolean)) {
      explicitWithRoles += 1;
    }
    if (generationValue.mode !== "GENERIC") continue;
    for (const key of Object.keys(genericRoles)) if (generationValue.roles[key]) genericRoles[key] += 1;
    for (const key of Object.keys(genericMealTypes)) if (generationValue.mealTypes[key]) genericMealTypes[key] += 1;
    const unit = String(food.Unidad || food.unidad || "").trim().toLowerCase();
    if (unit === "ml") genericMl += 1;
    if (!["g", "gr", "grs", "gramo", "gramos", "ml"].includes(unit)) genericDiscrete += 1;
  }
  return {
    documents: snapshot.length,
    persistedGeneration,
    modes,
    genericRoles,
    genericMealTypes,
    explicitWithAtLeastOneRole: explicitWithRoles,
    genericMl,
    genericDiscrete,
  };
}

async function main() {
  await CnxMongoDB.conectar();
  if (!CnxMongoDB.connection || !CnxMongoDB.db) throw new Error("No se pudo conectar a MongoDB.");
  const databaseModel = new ModelMongoDBAlimentos();
  const before = await databaseModel.obtenerAlimentos();
  const cases = [];
  const target = { kcal: 776, proteina: 57.6, carbs: 94.6, grasas: 15.6 };
  const rice = findFood(before, "Arroz");
  const banana = findFood(before, "Banana");
  const chicken = findFood(before, "Pechuga de pollo");
  const realIds = [rice, banana, chicken].map((food) => String(food._id));

  cases.push(await capture(
    "real-only-selected-three-foods",
    "ONLY_SELECTED real conserva exactamente Arroz+Banana+Pechuga y devuelve la mejor solución física",
    () => generateMealAlternative(request({
      target,
      requiredFoodIds: realIds,
      generationMode: FOOD_COMBINATION_MODES.ONLY_SELECTED_FOODS,
      variantSeed: "central-audit-real-selected",
    }), { model: modelFor(before) }),
    (raw) => raw?.status === "SUCCESS" && raw?.usable === true && raw?.alternative?.foods?.length === 3
      ? [] : ["ONLY_SELECTED real no devolvió tres alimentos utilizables."],
  ));

  const lockScenarios = [
    { id: "real-locks-0", fixedFoods: [] },
    { id: "real-locks-1", fixedFoods: [{ foodId: realIds[2], quantity: 250 }] },
    { id: "real-locks-2", fixedFoods: [{ foodId: realIds[0], quantity: 100 }, { foodId: realIds[1], quantity: 180 }] },
    { id: "real-locks-all", fixedFoods: [{ foodId: realIds[0], quantity: 100 }, { foodId: realIds[1], quantity: 180 }, { foodId: realIds[2], quantity: 250 }] },
  ];
  for (const scenario of lockScenarios) {
    cases.push(await capture(
      scenario.id,
      `${scenario.fixedFoods.length} locks reales; cada cantidad fija debe conservarse exacta`,
      () => recalculateMealAlternativeQuantities({
        mealType: "lunch",
        target,
        selectedFoodIds: realIds,
        fixedFoods: scenario.fixedFoods,
      }, { model: modelFor(before) }),
      (raw) => {
        if (raw?.status !== "SUCCESS" || raw?.usable !== true) return ["El recálculo no fue utilizable."];
        const failures = [];
        for (const fixed of scenario.fixedFoods) {
          const output = raw.alternative.foods.find((food) => food.foodId === fixed.foodId);
          if (output?.quantity !== fixed.quantity) failures.push(`El lock ${fixed.foodId} cambió.`);
        }
        return failures;
      },
    ));
  }

  cases.push(await capture(
    "real-max-hard",
    "Arroz real locked en 250 g excede max=200 y debe quedar NO_SOLUTION sin corrección silenciosa",
    () => recalculateMealAlternativeQuantities({
      mealType: "lunch",
      target,
      selectedFoodIds: [realIds[0]],
      fixedFoods: [{ foodId: realIds[0], quantity: 250 }],
    }, { model: modelFor(before) }),
    (raw) => raw?.status === "NO_SOLUTION" && raw?.usable === false
      ? [] : ["MAX real no bloqueó la cantidad inválida."],
  ));

  const strictRice = fixtureFood("strict-rice", "Arroz strict", "C1", { kcal: 1, proteina: 0.1, carbs: 0.2, grasas: 0 }, {
    portionRule: { unit: "g", min: 80, max: 200, step: 10 },
  });
  const strictChicken = fixtureFood("strict-chicken", "Pollo strict", "P1", { kcal: 1, proteina: 0.2, carbs: 0, grasas: 0 }, {
    portionRule: { unit: "g", min: 100, max: 350, step: 10 },
  });
  const relaxationDefinitions = [
    { id: "round-strict", expected: "STRICT", target: { kcal: 200, proteina: 30, carbs: 20, grasas: 0 }, rice: strictRice, chicken: strictChicken },
    {
      id: "round-relax-step",
      expected: "RELAX_STEP",
      target: { kcal: 185, proteina: 105.1, carbs: 0, grasas: 0 },
      rice: fixtureFood("step-rice", "Arroz step", "C1", { kcal: 1, proteina: 0, carbs: 0, grasas: 0 }, { portionRule: { unit: "g", min: 80, max: 80, step: 10 } }),
      chicken: fixtureFood("step-chicken", "Pollo step", "P1", { kcal: 1, proteina: 1, carbs: 0, grasas: 0 }, { portionRule: { unit: "g", min: 100, max: 105, step: 10 } }),
    },
    {
      id: "round-relax-min",
      expected: "RELAX_MIN",
      target: { kcal: 165, proteina: 26.5, carbs: 13, grasas: 0 },
      rice: fixtureFood("min-rice", "Arroz min", "C1", { kcal: 1, proteina: 0.1, carbs: 0.2, grasas: 0 }, { portionRule: { unit: "g", min: 80, max: 200, step: 10 } }),
      chicken: fixtureFood("min-chicken", "Pollo min", "P1", { kcal: 1, proteina: 0.2, carbs: 0, grasas: 0 }, { portionRule: { unit: "g", min: 100, max: 350, step: 10 } }),
    },
  ];
  for (const definition of relaxationDefinitions) {
    const source = [definition.rice, definition.chicken];
    cases.push(await capture(
      definition.id,
      `La primera ronda capaz de recomendar debe ser ${definition.expected}; MAX permanece intacto`,
      () => generateMealAlternative(request({
        target: definition.target,
        requiredFoodIds: source.map((food) => food._id),
        generationMode: FOOD_COMBINATION_MODES.ONLY_SELECTED_FOODS,
      }), { model: modelFor(source) }),
      (raw) => raw?.relaxation?.level === definition.expected
        ? [] : [`Se obtuvo ${raw?.relaxation?.level}, esperado ${definition.expected}.`],
    ));
  }

  const overshootProtein = fixtureFood("overshoot-protein", "Proteína mínima discreta", "P1", { kcal: 60, proteina: 10, carbs: 0, grasas: 0 }, {
    unit: "unidad",
    portionRule: { unit: "unidad", min: 1, max: 2, step: 1 },
  });
  const overshootCarb = fixtureFood("overshoot-carb", "Carbo mínimo discreto", "C1", { kcal: 60, proteina: 0, carbs: 20, grasas: 0 }, {
    unit: "unidad",
    portionRule: { unit: "unidad", min: 1, max: 2, step: 1 },
  });
  cases.push(await capture(
    "minimum-discrete-overshoot",
    "Mínimos físicos fuerzan +20 kcal: BEST_EFFORT usable, no falso NO_SOLUTION",
    () => generateMealAlternative(request({
      target: { kcal: 100, proteina: 10, carbs: 20, grasas: 0 },
      requiredFoodIds: [overshootProtein._id, overshootCarb._id],
      generationMode: FOOD_COMBINATION_MODES.ONLY_SELECTED_FOODS,
    }), { model: modelFor([overshootProtein, overshootCarb]) }),
    (raw) => raw?.classification === "BEST_EFFORT" && raw?.usable === true && raw?.alternative?.totals?.kcal === 120
      ? [] : ["El overshoot físico no quedó como BEST_EFFORT usable de 120 kcal."],
  ));

  const discrete = fixtureFood("discrete-60", "Unidad de 60 kcal", "P1", { kcal: 60, proteina: 0, carbs: 0, grasas: 0 }, {
    unit: "unidad",
    portionRule: { unit: "unidad", min: 1, max: 2, step: 1 },
  });
  cases.push(await capture(
    "discrete-next-step",
    "Una unidad discreta elige 120 antes que 60 para target 100",
    () => recalculateMealAlternativeQuantities({
      mealType: "lunch",
      target: { kcal: 100, proteina: 0, carbs: 0, grasas: 0 },
      selectedFoodIds: [discrete._id],
    }, { model: modelFor([discrete]) }),
    (raw) => raw?.alternative?.foods?.[0]?.quantity === 2 && raw?.classification === "BEST_EFFORT"
      ? [] : ["La unidad discreta no eligió el paso físicamente más cercano."],
  ));

  const liquid = fixtureFood("liquid-ml", "Líquido ml", "P1", { kcal: 1, proteina: 0.1, carbs: 0, grasas: 0 }, {
    unit: "ml",
    portionRule: { unit: "ml", min: 100, max: 200, step: 10 },
  });
  cases.push(await capture(
    "milliliter-step",
    "Unidad ml continua respeta min/max/step",
    () => recalculateMealAlternativeQuantities({
      mealType: "lunch",
      target: { kcal: 150, proteina: 15, carbs: 0, grasas: 0 },
      selectedFoodIds: [liquid._id],
    }, { model: modelFor([liquid]) }),
    (raw) => raw?.alternative?.foods?.[0]?.quantity === 150 && raw?.relaxation?.level === "STRICT"
      ? [] : ["La cantidad ml no quedó en 150 dentro de la grilla estricta."],
  ));

  const explicitProtein = fixtureFood("explicit-protein", "Proteína explicit", "P1", { kcal: 1.1, proteina: 0.2, carbs: 0, grasas: 0 }, {
    mode: "EXPLICIT_ONLY",
    portionRule: { unit: "g", min: 100, max: 300, step: 10 },
  });
  const genericCarb = fixtureFood("generic-carb", "Carbo generic", "C1", { kcal: 3, proteina: 0.05, carbs: 0.7, grasas: 0 }, {
    portionRule: { unit: "g", min: 80, max: 200, step: 10 },
  });
  cases.push(await capture(
    "explicit-only-configured-selected",
    "EXPLICIT_ONLY con rol configurado entra cuando se selecciona explícitamente",
    () => generateMealAlternative(request({
      target: { kcal: 600, proteina: 45, carbs: 75, grasas: 10 },
      requiredFoodIds: [explicitProtein._id, genericCarb._id],
      generationMode: FOOD_COMBINATION_MODES.ONLY_SELECTED_FOODS,
    }), { model: modelFor([explicitProtein, genericCarb]) }),
    (raw) => raw?.status === "SUCCESS" && raw?.alternative?.foods?.some((food) => food.foodId === explicitProtein._id)
      ? [] : ["EXPLICIT_ONLY configurado no entró como required."],
  ));

  const disabled = fixtureFood("disabled-protein", "Proteína disabled", "P1", { kcal: 1, proteina: 0.2, carbs: 0, grasas: 0 }, { mode: "DISABLED" });
  cases.push(await capture(
    "disabled-hard-block",
    "DISABLED nunca es utilizable, ni siquiera requerido",
    () => generateMealAlternative(request({
      requiredFoodIds: [disabled._id, genericCarb._id],
      generationMode: FOOD_COMBINATION_MODES.ONLY_SELECTED_FOODS,
    }), { model: modelFor([disabled, genericCarb]) }),
    (_raw, _summary, caught) => caught?.message?.includes("DISABLED") ? [] : ["DISABLED no fue bloqueado explícitamente."],
  ));

  const structureCoverage = [];
  for (const mealType of CANONICAL_MEAL_TYPES) {
    const result = await generateFoodCombinationCandidates({
      mealType,
      target: { kcal: 620, proteina: 42, carbs: 72, grasas: 18 },
      requiredFoodIds: [],
      excludedFoodIds: [],
      mode: FOOD_COMBINATION_MODES.ALLOW_SUGGESTIONS,
      limit: 32,
    }, { model: modelFor(before) });
    const structures = result.candidates.map((candidate) => candidate.structure);
    const availableRoles = Object.fromEntries(["P2", "C2", "V", "F", "G"].map((role) => [
      role,
      before.some((food) => {
        const generationValue = normalizeFoodGenerationForRead(food?.generation);
        return food?.activo !== false &&
          generationValue.mode === "GENERIC" &&
          generationValue.mealTypes[mealType] === true &&
          generationValue.roles[role] === true;
      }),
    ]));
    structureCoverage.push({
      mealType,
      candidates: result.candidates.length,
      uniqueStructures: new Set(structures).size,
      availableRoles,
      roles: Object.fromEntries(["P2", "C2", "V", "F", "G"].map((role) => [
        role,
        structures.some((structure) => structure.split("+").includes(role)),
      ])),
      meta: result.meta,
    });
  }

  const warningCase = evaluateMealNutritionResult(
    { kcal: 772, proteina: 86.2, carbs: 76.5, grasas: 13.5 },
    target,
  );
  const warningConsistency = {
    status: warningCase.status,
    caloriesZone: warningCase.zones.calories,
    summary: warningCase.warning?.summary || null,
    reasonCodes: warningCase.warning?.reasonCodes || [],
    falselyClaimsCaloriesMissing: /no completa|faltan.*calor/i.test(String(warningCase.warning?.message || "")),
  };

  const after = await databaseModel.obtenerAlimentos();
  const safety = {
    documentsBefore: before.length,
    documentsAfter: after.length,
    directMongoReads: 2,
    directMongoWrites: 0,
    catalogFingerprintBefore: catalogFingerprint(before),
    catalogFingerprintAfter: catalogFingerprint(after),
    generationFingerprintBefore: generationFingerprint(before),
    generationFingerprintAfter: generationFingerprint(after),
  };
  safety.databaseUnchanged = safety.documentsBefore === safety.documentsAfter &&
    safety.catalogFingerprintBefore === safety.catalogFingerprintAfter &&
    safety.generationFingerprintBefore === safety.generationFingerprintAfter;
  const policy = policyCases();
  const report = {
    generatedAt: new Date().toISOString(),
    mode: "read-only central nutrition contract audit",
    safety,
    catalogCoverage: catalogCoverage(before),
    policyCases: policy,
    warningConsistency,
    structureCoverage,
    cases,
    summary: {
      policyPassed: policy.filter((entry) => entry.status === "PASS").length,
      policyTotal: policy.length,
      contractPassed: cases.filter((entry) => entry.status === "PASS").length,
      contractTotal: cases.length,
      structureCoveragePassed: structureCoverage.every((entry) =>
        entry.candidates === 32 && Object.entries(entry.availableRoles).every(([role, available]) =>
          !available || entry.roles[role] === true
        )),
      warningConsistencyPassed: warningCase.status === "BEST_EFFORT" &&
        warningCase.zones.calories !== "OUTSIDE" && !warningConsistency.falselyClaimsCaloriesMissing,
    },
  };
  await mkdir(OUTPUT_DIRECTORY, { recursive: true });
  await writeFile(JSON_FILE, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(MARKDOWN_FILE, renderMarkdown(report), "utf8");
  console.log(JSON.stringify({ json: JSON_FILE, markdown: MARKDOWN_FILE, safety, summary: report.summary, catalogCoverage: report.catalogCoverage, failures: cases.filter((entry) => entry.status === "FAIL") }, null, 2));
  if (
    !safety.databaseUnchanged ||
    report.summary.policyPassed !== report.summary.policyTotal ||
    report.summary.contractPassed !== report.summary.contractTotal ||
    !report.summary.structureCoveragePassed ||
    !report.summary.warningConsistencyPassed
  ) process.exitCode = 1;
}

function renderMarkdown(report) {
  const lines = [
    "# Auditoría de contratos del motor nutricional central",
    "",
    `Generado: ${report.generatedAt}`,
    "",
    `Mongo read-only: ${report.safety.documentsBefore} → ${report.safety.documentsAfter}; writes=0; unchanged=${report.safety.databaseUnchanged}.`,
    "",
    "## Catálogo real",
    "",
    `- Modos: ${JSON.stringify(report.catalogCoverage.modes)}.`,
    `- GENERIC por roles: ${JSON.stringify(report.catalogCoverage.genericRoles)}.`,
    `- GENERIC por mealTypes: ${JSON.stringify(report.catalogCoverage.genericMealTypes)}.`,
    `- EXPLICIT_ONLY con al menos un rol: ${report.catalogCoverage.explicitWithAtLeastOneRole}.`,
    `- Unidades discretas GENERIC: ${report.catalogCoverage.genericDiscrete}; ml GENERIC: ${report.catalogCoverage.genericMl}.`,
    "",
    "## Casos de ranking",
    "",
    "| caso | ganador | esperado | estado |",
    "|---|---|---|---|",
    ...report.policyCases.map((entry) => `| ${entry.id} | ${entry.winner} | ${entry.expectedWinner} | ${entry.status} |`),
    "",
    "## Contratos",
    "",
    "| caso | propósito | clasificación | relajación | resultado |",
    "|---|---|---|---|---|",
    ...report.cases.map((entry) => `| ${entry.id} | ${entry.intent.replaceAll("|", "\\|")} | ${entry.result?.classification || entry.caught?.code || "—"} | ${entry.result?.relaxation?.level || "—"} | ${entry.status}${entry.failures.length ? `: ${entry.failures.join("; ")}` : ""} |`),
    "",
    "## Cobertura estructural limit=32",
    "",
    "| mealType | candidatos | estructuras | P2 | C2 | V | F | G |",
    "|---|---:|---:|---|---|---|---|---|",
    ...report.structureCoverage.map((entry) => {
      const role = (key) => entry.availableRoles[key] ? String(entry.roles[key]) : "N/A";
      return `| ${entry.mealType} | ${entry.candidates} | ${entry.uniqueStructures} | ${role("P2")} | ${role("C2")} | ${role("V")} | ${role("F")} | ${role("G")} |`;
    }),
    "",
    "## Warning 772 vs 776",
    "",
    `- status=${report.warningConsistency.status}; kcal zone=${report.warningConsistency.caloriesZone}.`,
    `- resumen: ${report.warningConsistency.summary}.`,
    `- códigos: ${report.warningConsistency.reasonCodes.join(", ")}.`,
    `- afirma falsamente que faltan calorías: ${report.warningConsistency.falselyClaimsCaloriesMissing}.`,
    "",
  ];
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
