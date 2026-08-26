import assert from "node:assert/strict";
import test from "node:test";

import {
  FOOD_COMBINATION_MODES,
  FOOD_COMBINATION_STRUCTURES,
  generateFoodCombinationCandidates,
} from "../servicio/foodCombinationCandidates.js";
import { defaultFoodGeneration } from "../servicio/foodGenerationMetadata.js";

function food(id, role, overrides = {}) {
  const generation = defaultFoodGeneration();
  generation.mode = overrides.mode || "GENERIC";
  if (role) generation.roles[role] = true;
  for (const extraRole of overrides.extraRoles || []) generation.roles[extraRole] = true;
  generation.mealTypes.lunch = overrides.lunch !== false;
  generation.mealTypes.breakfast = overrides.breakfast === true;
  generation.mealTypes.snack = overrides.snack === true;
  generation.mealTypes.dinner = overrides.dinner === true;
  generation.mealTypes.extraSnack = overrides.extraSnack === true;
  return { _id: id, activo: overrides.activo !== false, generation, name: overrides.name || id };
}

const sevenFoods = [
  food("pollo", "P1"),
  food("huevo", "P2"),
  food("arroz", "C1"),
  food("pan", "C2"),
  food("tomate", "V"),
  food("banana", "F"),
  food("aceite", "G"),
];

function dependencies(catalog = sevenFoods, options = {}) {
  const byId = new Map(catalog.map((item) => [String(item._id), item]));
  return {
    poolLimitPerRole: options.poolLimitPerRole,
    model: {
      obtenerAlimentosPorIds: async (ids) => ids.map((id) => byId.get(String(id))).filter(Boolean),
      obtenerAlimentoPorId: async (id) => byId.get(String(id)) || null,
    },
    getAutomaticGenerationFoods: async () => options.providerResult || catalog,
  };
}

function request(overrides = {}) {
  return {
    mealType: "lunch",
    requiredFoodIds: [],
    excludedFoodIds: [],
    mode: FOOD_COMBINATION_MODES.ALLOW_SUGGESTIONS,
    limit: 100,
    ...overrides,
  };
}

function crowdedCatalog(optionalRoles = [], overrides = {}) {
  const catalog = [];
  for (let index = 0; index < 10; index += 1) {
    catalog.push(food(`P1-${String(index).padStart(2, "0")}`, "P1", overrides));
    catalog.push(food(`C1-${String(index).padStart(2, "0")}`, "C1", overrides));
  }
  optionalRoles.forEach((role, index) => catalog.push(food(`${role}-optional-${index}`, role, overrides)));
  return catalog;
}

test("A: genera programaticamente exactamente las 32 estructuras del nucleo P1+C1", () => {
  assert.equal(FOOD_COMBINATION_STRUCTURES.length, 32);
  assert.equal(new Set(FOOD_COMBINATION_STRUCTURES.map((roles) => roles.join("+"))).size, 32);
  assert.ok(FOOD_COMBINATION_STRUCTURES.every((roles) => roles.includes("P1") && roles.includes("C1")));
});

test("A/B: fixture de siete alimentos produce 32 candidatos y estructuras unicas", async () => {
  const result = await generateFoodCombinationCandidates(request(), dependencies());
  assert.equal(result.meta.structuresEvaluated, 32);
  assert.equal(result.meta.candidateCount, 32);
  assert.equal(new Set(result.candidates.map((candidate) => candidate.structure)).size, 32);
  assert.equal(new Set(result.candidates.map((candidate) => JSON.stringify(candidate))).size, 32);
  assert.ok(result.candidates.every((candidate) => candidate.quantities === undefined));
});

test("C: ONLY_SELECTED devuelve solamente pollo + arroz sin sugerencias", async () => {
  const result = await generateFoodCombinationCandidates(request({
    requiredFoodIds: ["pollo", "arroz"],
    mode: FOOD_COMBINATION_MODES.ONLY_SELECTED_FOODS,
  }), dependencies());
  assert.equal(result.candidates.length, 1);
  assert.deepEqual(result.candidates[0].foodIds, ["arroz", "pollo"]);
  assert.equal(result.candidates[0].structure, "P1+C1");
});

test("ONLY_SELECTED rechaza required vacio", async () => {
  await assert.rejects(() => generateFoodCombinationCandidates(request({
    mode: FOOD_COMBINATION_MODES.ONLY_SELECTED_FOODS,
  }), dependencies()), { code: "INVALID_FOOD_COMBINATION", field: "requiredFoodIds" });
});

test("D/E: ALLOW_SUGGESTIONS conserva todos los required en cada candidato", async () => {
  const result = await generateFoodCombinationCandidates(request({ requiredFoodIds: ["pollo", "arroz"] }), dependencies());
  assert.ok(result.candidates.length > 1);
  assert.ok(result.candidates.every((candidate) => candidate.foodIds.includes("pollo") && candidate.foodIds.includes("arroz")));
  assert.equal(result.candidates[0].structure, "P1+C1");
});

test("F: excluded es hard constraint en todas las estructuras", async () => {
  const result = await generateFoodCombinationCandidates(request({ excludedFoodIds: ["banana", "aceite"] }), dependencies());
  assert.ok(result.candidates.length > 0);
  assert.ok(result.candidates.every((candidate) => !candidate.foodIds.includes("banana") && !candidate.foodIds.includes("aceite")));
  assert.ok(result.candidates.every((candidate) => !candidate.structure.includes("F") && !candidate.structure.includes("G")));
});

test("G: required y excluded simultaneos devuelven error", async () => {
  await assert.rejects(() => generateFoodCombinationCandidates(request({
    requiredFoodIds: ["pollo"], excludedFoodIds: ["pollo"],
  }), dependencies()), { code: "INVALID_FOOD_COMBINATION", field: "excludedFoodIds" });
});

test("H/I: EXPLICIT_ONLY nunca se sugiere pero si puede entrar como required", async () => {
  const explicit = food("pan-marca", "C2", { mode: "EXPLICIT_ONLY" });
  const catalog = [...sevenFoods, explicit];
  const spontaneous = await generateFoodCombinationCandidates(request(), dependencies(catalog));
  assert.ok(spontaneous.candidates.every((candidate) => !candidate.foodIds.includes("pan-marca")));

  const required = await generateFoodCombinationCandidates(request({
    requiredFoodIds: ["pollo", "arroz", "pan-marca"],
    mode: FOOD_COMBINATION_MODES.ONLY_SELECTED_FOODS,
  }), dependencies(catalog));
  assert.equal(required.candidates.length, 1);
  assert.deepEqual(required.candidates[0].foodIds, ["arroz", "pan-marca", "pollo"]);
});

test("J: DISABLED nunca se sugiere y como required falla explicitamente", async () => {
  const disabled = food("bloqueado", "V", { mode: "DISABLED" });
  const catalog = [...sevenFoods, disabled];
  const spontaneous = await generateFoodCombinationCandidates(request(), dependencies(catalog));
  assert.ok(spontaneous.candidates.every((candidate) => !candidate.foodIds.includes("bloqueado")));
  await assert.rejects(() => generateFoodCombinationCandidates(request({ requiredFoodIds: ["bloqueado"] }), dependencies(catalog)), {
    code: "INVALID_FOOD_COMBINATION", field: "requiredFoodIds",
  });
});

test("K: Banana con F no puede cubrir C1", async () => {
  const catalog = [food("pollo", "P1"), food("banana", "F")];
  const result = await generateFoodCombinationCandidates(request(), dependencies(catalog));
  assert.equal(result.candidates.length, 0);
});

test("L: un P1 habilitado solo para lunch no aparece en dinner", async () => {
  const catalog = [food("pollo", "P1"), food("arroz", "C1", { dinner: true })];
  const result = await generateFoodCombinationCandidates(request({ mealType: "dinner" }), dependencies(catalog));
  assert.equal(result.candidates.length, 0);
});

test("alimento requerido para desayuno ignora aptitud general, pero una sugerencia no", async () => {
  const rice = food("arroz-desayuno-explicito", "C1", { lunch: true, breakfast: false });
  const protein = food("yogur-desayuno", "P1", { lunch: false, breakfast: true });
  const catalog = [rice, protein];

  const spontaneous = await generateFoodCombinationCandidates(request({
    mealType: "breakfast",
  }), dependencies(catalog));
  assert.ok(spontaneous.candidates.every((candidate) => !candidate.foodIds.includes(rice._id)));

  const explicit = await generateFoodCombinationCandidates(request({
    mealType: "breakfast",
    requiredFoodIds: [protein._id, rice._id],
    mode: FOOD_COMBINATION_MODES.ONLY_SELECTED_FOODS,
  }), dependencies(catalog));
  assert.equal(explicit.candidates.length, 1);
  assert.deepEqual(explicit.candidates[0].foodIds, [rice._id, protein._id].sort());
});

test("ALLOW_SUGGESTIONS conserva el required fuera de mealType y completa solo con sugerencias compatibles", async () => {
  const requiredRice = food("arroz-required-snack", "C1", { lunch: true, snack: false });
  const snackProtein = food("yogur-snack", "P1", { lunch: false, snack: true });
  const lunchOnlyProtein = food("pollo-lunch-only", "P1", { lunch: true, snack: false });
  const catalog = [requiredRice, snackProtein, lunchOnlyProtein];

  const result = await generateFoodCombinationCandidates(request({
    mealType: "snack",
    requiredFoodIds: [requiredRice._id],
    mode: FOOD_COMBINATION_MODES.ALLOW_SUGGESTIONS,
  }), dependencies(catalog));

  assert.ok(result.candidates.length > 0);
  assert.ok(result.candidates.every((candidate) => candidate.foodIds.includes(requiredRice._id)));
  assert.ok(result.candidates.some((candidate) => candidate.foodIds.includes(snackProtein._id)));
  assert.ok(result.candidates.every((candidate) => !candidate.foodIds.includes(lunchOnlyProtein._id)));
});

test("M: multirrol elige siempre la asignacion estructural estable", async () => {
  const catalog = [
    food("a-proteina", "P1", { extraRoles: ["P2"] }),
    food("b-proteina", "P2"),
    food("arroz", "C1"),
  ];
  const input = request({ requiredFoodIds: ["a-proteina", "b-proteina", "arroz"], mode: FOOD_COMBINATION_MODES.ONLY_SELECTED_FOODS });
  const first = await generateFoodCombinationCandidates(input, dependencies(catalog));
  const second = await generateFoodCombinationCandidates(input, dependencies([...catalog].reverse()));
  assert.deepEqual(first, second);
  assert.deepEqual(first.candidates[0].roleAssignments, { "a-proteina": "P1", "b-proteina": "P2", arroz: "C1" });
});

test("N: legacy sin generation no aparece espontaneamente", async () => {
  const legacy = { _id: "legacy", activo: true };
  const result = await generateFoodCombinationCandidates(request(), dependencies([...sevenFoods, legacy]));
  assert.ok(result.candidates.every((candidate) => !candidate.foodIds.includes("legacy")));
});

test("O: mismo input y catalogo desordenado producen mismo output", async () => {
  const first = await generateFoodCombinationCandidates(request({ limit: 17 }), dependencies(sevenFoods));
  const second = await generateFoodCombinationCandidates(request({ limit: 17 }), dependencies([...sevenFoods].reverse()));
  assert.deepEqual(first, second);
});

test("P: limit recorta despues del ranking y conserva metadata coherente", async () => {
  const result = await generateFoodCombinationCandidates(request({ limit: 5 }), dependencies());
  assert.equal(result.candidates.length, 5);
  assert.equal(result.meta.candidateCount, 5);
  assert.equal(result.meta.structuresEvaluated, 32);
});

test("diversidad: el batch normal conserva P1+C1 y representa todos los roles opcionales factibles", async () => {
  const catalog = crowdedCatalog(["P2", "C2", "V", "F", "G"]);
  const result = await generateFoodCombinationCandidates(request({ limit: 32 }), dependencies(catalog));
  const structures = result.candidates.map((candidate) => candidate.structure.split("+"));
  const optionalDegrees = new Set(structures.map((roles) => roles.length - 2));

  assert.equal(result.candidates.length, 32);
  assert.ok(result.candidates.some((candidate) => candidate.structure === "P1+C1"));
  for (const role of ["P2", "C2", "V", "F", "G"]) {
    assert.ok(structures.some((roles) => roles.includes(role)), `${role} debe entrar al batch normal`);
  }
  assert.ok(optionalDegrees.has(0));
  assert.ok(optionalDegrees.has(1));
  assert.ok([...optionalDegrees].some((degree) => degree >= 2));
  assert.ok(result.meta.candidatesGeneratedBeforeLimit > 32);
  assert.ok(result.meta.structuresSelected > 1);
  assert.equal(result.meta.selectionPolicy, "ranked_structural_frontier_v1");
});

for (const [role, mealType] of [
  ["P2", "lunch"],
  ["C2", "lunch"],
  ["V", "lunch"],
  ["F", "breakfast"],
  ["G", "lunch"],
]) {
  test(`diversidad ${role}: la estructura P1+C1+${role} entra con limite 32`, async () => {
    const mealOverrides = mealType === "breakfast" ? { breakfast: true } : {};
    const catalog = crowdedCatalog([role], mealOverrides);
    const result = await generateFoodCombinationCandidates(request({ mealType, limit: 32 }), dependencies(catalog));
    assert.ok(result.candidates.some((candidate) => candidate.structure === `P1+C1+${role}`));
    assert.ok(result.candidates.some((candidate) => candidate.structure === "P1+C1"));
  });
}

test("diversidad con required: todos los candidatos conservan el alimento exigido", async () => {
  const catalog = crowdedCatalog(["P2", "C2", "V", "F", "G"]);
  const result = await generateFoodCombinationCandidates(request({
    requiredFoodIds: ["P1-00"],
    limit: 32,
  }), dependencies(catalog));
  assert.equal(result.candidates.length, 32);
  assert.ok(result.candidates.every((candidate) => candidate.foodIds.includes("P1-00")));
  assert.ok(result.candidates.some((candidate) => candidate.structure.includes("P2")));
});

test("diversidad respeta mealTypes: P2 solo lunch no se sugiere en breakfast", async () => {
  const shared = crowdedCatalog([], { breakfast: true });
  const lunchOnlyP2 = food("P2-lunch-only", "P2", { lunch: true, breakfast: false });
  const catalog = [...shared, lunchOnlyP2];
  const breakfast = await generateFoodCombinationCandidates(request({
    mealType: "breakfast",
    limit: 32,
  }), dependencies(catalog));
  const lunch = await generateFoodCombinationCandidates(request({ mealType: "lunch", limit: 32 }), dependencies(catalog));

  assert.ok(breakfast.candidates.every((candidate) => !candidate.foodIds.includes(lunchOnlyP2._id)));
  assert.ok(lunch.candidates.some((candidate) => candidate.foodIds.includes(lunchOnlyP2._id)));
});

test("diversidad mantiene orden determinista, candidatos unicos y un alimento por rol", async () => {
  const catalog = crowdedCatalog(["P2", "C2", "V", "F", "G"]);
  const first = await generateFoodCombinationCandidates(request({ limit: 32 }), dependencies(catalog));
  const second = await generateFoodCombinationCandidates(request({ limit: 32 }), dependencies([...catalog].reverse()));
  assert.deepEqual(first, second);
  assert.equal(new Set(first.candidates.map((candidate) => JSON.stringify(candidate))).size, first.candidates.length);
  assert.ok(first.candidates.every((candidate) => new Set(candidate.foodIds).size === candidate.foodIds.length));
  assert.ok(first.candidates.every((candidate) => new Set(Object.values(candidate.roleAssignments)).size === candidate.foodIds.length));
});

test("contexto diario reserva representantes distintos sin ampliar ni romper el batch 32", async () => {
  const catalog = crowdedCatalog(["P2", "C2", "V", "F", "G"]);
  const result = await generateFoodCombinationCandidates(request({
    limit: 32,
    diversityContext: {
      previousMeals: [{
        foodIds: ["P1-00", "C1-00"],
        roleFoodPairs: ["P1-00:P1", "C1-00:C1"],
      }],
    },
  }), dependencies(catalog));

  assert.equal(result.candidates.length, 32);
  assert.equal(result.meta.selectionPolicy, "ranked_structural_frontier_daily_diversity_v1");
  assert.ok(result.meta.dailyDiversityRepresentativesSelected > 0);
  assert.ok(result.candidates.some((candidate) => candidate.diversity.repeatedFoodCount === 0));
  for (const role of ["P2", "C2", "V", "F", "G"]) {
    assert.ok(result.candidates.some((candidate) => candidate.structure.includes(role)));
  }
});

test("preferredCombinations da bonus sin transformarse en hard constraint", async () => {
  const result = await generateFoodCombinationCandidates(request({
    preferredCombinations: [["pollo", "arroz", "tomate"]],
  }), dependencies());
  assert.equal(result.candidates[0].structure, "P1+C1");
  const preferred = result.candidates.find((candidate) => candidate.preferredCombinationMatch);
  assert.deepEqual(preferred.foodIds, ["arroz", "pollo", "tomate"]);
  assert.equal(preferred.structure, "P1+C1+V");
  assert.ok(result.candidates.some((candidate) => candidate.preferredCombinationMatch === false));
});

test("Q: pool grande queda acotado por slot y termina sin producto cartesiano completo", async () => {
  const large = [];
  for (const role of ["P1", "P2", "C1", "C2", "V", "F", "G"]) {
    for (let index = 0; index < 80; index += 1) large.push(food(`${role}-${String(index).padStart(2, "0")}`, role));
  }
  const startedAt = performance.now();
  const result = await generateFoodCombinationCandidates(request({ limit: 30 }), dependencies(large, { poolLimitPerRole: 5 }));
  const elapsed = performance.now() - startedAt;
  assert.equal(result.candidates.length, 30);
  assert.ok(elapsed < 1000, `El motor tardo ${elapsed.toFixed(1)} ms`);
  assert.ok(result.candidates.every((candidate) => candidate.foodIds.length <= 7));
});
