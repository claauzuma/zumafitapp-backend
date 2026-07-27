import assert from "node:assert/strict";
import test from "node:test";
import { performance } from "node:perf_hooks";

import ServicioAlimentos from "../servicio/alimentos.js";
import { TRACKING_OPTIMIZATION_POLICY } from "../menu2.js";

const EPS = 1e-6;

function quantityService(databaseFoods = []) {
  const service = new ServicioAlimentos("TEST");
  service.model = { obtenerAlimentos: async () => databaseFoods };
  return service;
}

function trackingOptions(extra = {}) {
  return {
    redondear: true,
    usarMinMax: true,
    trackingOptimizationPolicy: TRACKING_OPTIMIZATION_POLICY,
    ...extra,
  };
}

function realRiceAndAlmonds(almondMax = 3) {
  return [
    {
      foodId: "rice",
      name: "Arroz",
      unit: "Grs",
      kcalPerUnitOrGram: 3.385,
      proteinPerUnitOrGram: 0.08,
      carbsPerUnitOrGram: 0.755,
      fatPerUnitOrGram: 0.005,
      categoria: "carbohidrato",
      minGramos: 30,
      maxGramos: 120,
      stepGramos: 5,
    },
    {
      foodId: "almonds",
      name: "Almendras",
      unit: "Unid",
      kcalPerUnitOrGram: 7.15,
      proteinPerUnitOrGram: 0.26,
      carbsPerUnitOrGram: 0.155,
      fatPerUnitOrGram: 0.61,
      categoria: "grasas",
      minGramos: 1,
      maxGramos: almondMax,
      stepGramos: 1,
    },
  ];
}

function quantityByName(result, name) {
  return result.foods.find((food) => food.nombre === name)?.quantity;
}

function alignedBounds(food) {
  const step = Number(food.stepGramos) || 1;
  return {
    step,
    min: Math.ceil(((Number(food.minGramos) || 0) - EPS) / step) * step,
    max: Math.floor(((Number(food.maxGramos) || 0) + EPS) / step) * step,
  };
}

function nutritionFor(food, quantity) {
  return {
    calorias: quantity * Number(food.kcalPerUnitOrGram || 0),
    proteina: quantity * Number(food.proteinPerUnitOrGram || 0),
    carbohidratos: quantity * Number(food.carbsPerUnitOrGram || 0),
    grasas: quantity * Number(food.fatPerUnitOrGram || 0),
  };
}

function addTotals(...values) {
  return values.reduce((total, value) => ({
    calorias: total.calorias + Number(value?.calorias || 0),
    proteina: total.proteina + Number(value?.proteina || 0),
    carbohidratos: total.carbohidratos + Number(value?.carbohidratos || 0),
    grasas: total.grasas + Number(value?.grasas || 0),
  }), { calorias: 0, proteina: 0, carbohidratos: 0, grasas: 0 });
}

function macroScore(totals, target) {
  const carbScale = target.carbs > 0 ? target.carbs : 25;
  const fatScale = target.grasas > 0 ? target.grasas : 10;
  return ((totals.carbohidratos - target.carbs) / carbScale) ** 2 +
    ((totals.grasas - target.grasas) / fatScale) ** 2;
}

function compareRanks(left, right) {
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const difference = (left[index] || 0) - (right[index] || 0);
    if (Math.abs(difference) > 1e-8) return difference;
  }
  return 0;
}

function enumerateCandidates(foods, fixedTotals, target) {
  const candidates = [];
  const quantities = new Array(foods.length).fill(0);
  function visit(index) {
    if (index === foods.length) {
      const totals = foods.reduce(
        (sum, food, foodIndex) => addTotals(sum, nutritionFor(food, quantities[foodIndex])),
        fixedTotals
      );
      if (totals.calorias <= target.kcal + EPS) {
        candidates.push({ quantities: [...quantities], totals });
      }
      return;
    }
    const { min, max, step } = alignedBounds(foods[index]);
    for (let quantity = min; quantity <= max + EPS; quantity += step) {
      quantities[index] = quantity;
      visit(index + 1);
    }
  }
  visit(0);
  return candidates;
}

function bruteForceOracle(foods, fixedTotals, target) {
  const candidates = enumerateCandidates(foods, fixedTotals, target);
  assert.ok(candidates.length > 0, "el fixture debe tener al menos un candidato valido");
  const tolerance = Math.max(5, target.kcal * 0.02);
  const normalFloor = Math.max(0, target.kcal - tolerance);
  const bestReachableCalories = Math.max(...candidates.map((candidate) => candidate.totals.calorias));
  const hasNormalZone = bestReachableCalories >= normalFloor - EPS;
  const zoneFloor = hasNormalZone ? normalFloor : bestReachableCalories;
  const proteinActive = target.proteina > 0;
  const proteinReachable = proteinActive && candidates.some((candidate) => (
    candidate.totals.calorias >= zoneFloor - EPS &&
    candidate.totals.proteina >= target.proteina - 0.05
  ));
  const rank = (candidate) => {
    const { totals } = candidate;
    const calorieDeficit = Math.max(0, target.kcal - totals.calorias);
    const proteinDeficit = proteinActive ? Math.max(0, target.proteina - totals.proteina) : 0;
    const proteinExcess = proteinActive ? Math.max(0, totals.proteina - target.proteina) : 0;
    const secondary = macroScore(totals, target);
    const inZone = totals.calorias >= zoneFloor - EPS;
    if (!hasNormalZone) {
      return [calorieDeficit, proteinDeficit, secondary, proteinExcess, proteinActive ? 0 : totals.proteina];
    }
    if (proteinReachable) {
      return [inZone ? 0 : 1, proteinDeficit > 0.05 ? 1 : 0, proteinDeficit, secondary, calorieDeficit, proteinExcess];
    }
    if (proteinActive) {
      return [inZone ? 0 : 1, proteinDeficit, secondary, calorieDeficit, proteinExcess];
    }
    return [inZone ? 0 : 1, secondary, calorieDeficit, totals.proteina];
  };
  return candidates.reduce((best, candidate) => (
    !best || compareRanks(rank(candidate), rank(best)) < 0 ? candidate : best
  ), null);
}

function resultCandidate(result, foods, fixedTotals) {
  const quantities = foods.map((food) => quantityByName(result, food.name));
  const totals = foods.reduce(
    (sum, food, index) => addTotals(sum, nutritionFor(food, quantities[index])),
    fixedTotals
  );
  return { quantities, totals };
}

function oracleRankContext(foods, fixedTotals, target) {
  const candidates = enumerateCandidates(foods, fixedTotals, target);
  const tolerance = Math.max(5, target.kcal * 0.02);
  const normalFloor = Math.max(0, target.kcal - tolerance);
  const bestReachableCalories = Math.max(...candidates.map((candidate) => candidate.totals.calorias));
  const hasNormalZone = bestReachableCalories >= normalFloor - EPS;
  const zoneFloor = hasNormalZone ? normalFloor : bestReachableCalories;
  const proteinActive = target.proteina > 0;
  const proteinReachable = proteinActive && candidates.some((candidate) => (
    candidate.totals.calorias >= zoneFloor - EPS &&
    candidate.totals.proteina >= target.proteina - 0.05
  ));
  const rank = ({ totals }) => {
    const calorieDeficit = Math.max(0, target.kcal - totals.calorias);
    const proteinDeficit = proteinActive ? Math.max(0, target.proteina - totals.proteina) : 0;
    const proteinExcess = proteinActive ? Math.max(0, totals.proteina - target.proteina) : 0;
    const secondary = macroScore(totals, target);
    const inZone = totals.calorias >= zoneFloor - EPS;
    if (!hasNormalZone) return [calorieDeficit, proteinDeficit, secondary, proteinExcess, proteinActive ? 0 : totals.proteina];
    if (proteinReachable) return [inZone ? 0 : 1, proteinDeficit > 0.05 ? 1 : 0, proteinDeficit, secondary, calorieDeficit, proteinExcess];
    if (proteinActive) return [inZone ? 0 : 1, proteinDeficit, secondary, calorieDeficit, proteinExcess];
    return [inZone ? 0 : 1, secondary, calorieDeficit, totals.proteina];
  };
  return { rank };
}

test("caso real arroz y almendras respeta los limites reales y corrige el mensaje de P cero", async () => {
  const service = quantityService();
  const result = await service.generarCantidades({
    mode: "kcalProteina",
    generationType: "selectedOnly",
    target: { kcal: 356, proteina: 0, carbs: 19.3, grasas: 41 },
    fixedFoods: [],
    pendingFoods: realRiceAndAlmonds(),
    options: trackingOptions(),
  });

  assert.equal(quantityByName(result, "Arroz"), 100);
  assert.equal(quantityByName(result, "Almendras"), 2);
  assert.deepEqual(result.totals, {
    calorias: 352.8,
    proteina: 8.52,
    carbohidratos: 75.81,
    grasas: 1.72,
  });
  assert.equal(result.optimization.policy, TRACKING_OPTIMIZATION_POLICY);
  assert.equal(result.optimization.calorieZoneFloor, 348.88);
  assert.equal(result.optimization.inCalorieZone, true);
  assert.equal(result.optimization.proteinTargetActive, false);
  assert.equal(result.optimization.proteinReachable, false);
  assert.deepEqual(result.optimization.constraints, [
    {
      name: "Arroz",
      min: 30,
      max: 120,
      step: 5,
      minSource: "payload.minGramos",
      maxSource: "payload.maxGramos",
      stepSource: "payload.stepGramos",
      maxExplicit: true,
    },
    {
      name: "Almendras",
      min: 1,
      max: 3,
      step: 1,
      minSource: "payload.minGramos",
      maxSource: "payload.maxGramos",
      stepSource: "payload.stepGramos",
      maxExplicit: true,
    },
  ]);
  assert.equal(result.optimization.maxConstraintsLimited, true);
  assert.deepEqual(result.optimization.limitingConstraints, [{
    name: "Almendras",
    max: 3,
    maxSource: "payload.maxGramos",
    targets: ["grasas"],
  }]);
  assert.match(result.warnings.join(" "), /cantidades máximas configuradas/i);
  assert.match(result.message, /proteina restante ya estaba cubierta/i);
  const oracle = bruteForceOracle(realRiceAndAlmonds(), addTotals(), {
    kcal: 356,
    proteina: 0,
    carbs: 19.3,
    grasas: 41,
  });
  assert.deepEqual(oracle.quantities, [100, 2]);
});

test("la misma seleccion mejora C/G cuando el limite real de almendras permite competir", async () => {
  const service = quantityService();
  const result = await service.generarCantidades({
    mode: "kcalProteina",
    generationType: "selectedOnly",
    target: { kcal: 356, proteina: 0, carbs: 19.3, grasas: 41 },
    fixedFoods: [],
    pendingFoods: realRiceAndAlmonds(40),
    options: trackingOptions(),
  });

  assert.equal(quantityByName(result, "Arroz"), 30);
  assert.equal(quantityByName(result, "Almendras"), 35);
  assert.equal(result.totals.calorias, 351.8);
  assert.ok(result.optimization.macroScore < 0.5);
  assert.ok(result.optimization.macroScore < 9.49092);
});

test("Admin y Coach conservan la policy historica y la estructura de respuesta", async () => {
  const service = quantityService();
  const pendingFoods = [
    {
      foodId: "chicken",
      name: "Pechuga de pollo",
      unit: "g",
      kcalPerUnitOrGram: 1.65,
      proteinPerUnitOrGram: 0.31,
      carbsPerUnitOrGram: 0,
      fatPerUnitOrGram: 0.036,
      categoria: "proteina",
      minGramos: 50,
      maxGramos: 200,
      stepGramos: 10,
    },
    ...realRiceAndAlmonds(),
  ];
  const payload = {
    mode: "kcalProteina",
    generationType: "selectedOnly",
    target: { kcal: 500, proteina: 30, carbs: 50, grasas: 20 },
    fixedFoods: [],
    pendingFoods,
    options: { redondear: true, usarMinMax: true },
  };

  const admin = await service.generarCantidades(payload);
  const coach = await service.generarCantidades(structuredClone(payload));
  for (const result of [admin, coach]) {
    assert.deepEqual(result.foods.map((food) => [food.nombre, food.quantity, food.unit]), [
      ["Pechuga de pollo", 70, "g"],
      ["Arroz", 110, "Grs"],
      ["Almendras", 2, "Unid"],
    ]);
    assert.deepEqual(result.totals, {
      calorias: 502.15,
      proteina: 31.02,
      carbohidratos: 83.36,
      grasas: 4.29,
    });
    assert.equal(result.optimization, null);
    assert.equal(Object.hasOwn(result.foods[0], "minGramos"), false);
    assert.equal(Object.hasOwn(result.foods[0], "stepGramos"), false);
  }
  assert.deepEqual(admin, coach);
});

test("la advertencia proteica distingue deficit suave y fuerte", async () => {
  const service = quantityService();
  const pendingFoods = [{
    foodId: "protein-warning",
    name: "Proteina limitada",
    unit: "unidad",
    kcalPerUnitOrGram: 10,
    proteinPerUnitOrGram: 4,
    carbsPerUnitOrGram: 0,
    fatPerUnitOrGram: 0,
    categoria: "proteina",
    minGramos: 1,
    maxGramos: 1,
    stepGramos: 1,
  }];
  const calculate = (proteina) => service.generarCantidades({
    mode: "kcalProteina",
    generationType: "selectedOnly",
    target: { kcal: 20, proteina, carbs: 0, grasas: 0 },
    fixedFoods: [],
    pendingFoods,
    options: trackingOptions(),
  });

  const soft = await calculate(10);
  const strong = await calculate(22);
  assert.equal(soft.optimization.proteinDeficit, 6);
  assert.match(soft.message, /Faltan aproximadamente 6 g/i);
  assert.equal(strong.optimization.proteinDeficit, 18);
  assert.match(strong.message, /18 g por debajo/i);
});

test("un deficit visual de 0,3 g no desplaza la advertencia real de zona", async () => {
  const service = quantityService();
  const result = await service.generarCantidades({
    mode: "kcalProteina",
    generationType: "selectedOnly",
    target: { kcal: 610, proteina: 60.3, carbs: 0, grasas: 40.4 },
    fixedFoods: [],
    pendingFoods: [{
      foodId: "tuna-pot",
      name: "Atun en lomitos al aceite",
      unit: "Pote",
      kcalPerUnitOrGram: 246,
      proteinPerUnitOrGram: 30,
      carbsPerUnitOrGram: 0,
      fatPerUnitOrGram: 14,
      categoria: "proteina",
      minGramos: 1,
      maxGramos: 2,
      stepGramos: 1,
    }],
    options: trackingOptions(),
  });

  assert.equal(result.optimization.proteinDeficit, 0.3);
  assert.equal(result.optimization.normalCalorieZoneReached, false);
  assert.doesNotMatch(result.message, /Faltan aproximadamente 0[.,]3 g/i);
  assert.match(result.message, /mejor nivel calorico alcanzable es 492 kcal/i);
});

test("oracle discreto coincide con el motor en fixtures representativos de 1 a 6 alimentos", async () => {
  const service = quantityService();
  const baseFoods = [
    ["Proteina", 7, 5, 0, 0],
    ["Carbo A", 5, 0, 4, 0],
    ["Grasa", 9, 0, 0, 1],
    ["Mixto", 8, 2, 1, 0.4],
    ["Carbo B", 3, 0.2, 2, 0.1],
    ["Mixto B", 11, 3, 1.5, 0.5],
  ].map(([name, kcal, protein, carbs, fat], index) => ({
    foodId: `oracle-${index}`,
    name,
    unit: index % 2 ? "g" : "unidad",
    kcalPerUnitOrGram: kcal,
    proteinPerUnitOrGram: protein,
    carbsPerUnitOrGram: carbs,
    fatPerUnitOrGram: fat,
    categoria: index === 0 ? "proteina" : index === 1 || index === 4 ? "carbohidrato" : "grasas",
    minGramos: 1,
    maxGramos: 3,
    stepGramos: 1,
  }));

  for (let count = 1; count <= 6; count++) {
    const foods = baseFoods.slice(0, count);
    const target = { kcal: 58 + count * 8, proteina: count % 2 ? 12 : 0, carbs: 11, grasas: 4 };
    const oracle = bruteForceOracle(foods, addTotals(), target);
    const context = oracleRankContext(foods, addTotals(), target);
    const result = await service.generarCantidades({
      mode: "kcalProteina",
      generationType: "selectedOnly",
      target,
      fixedFoods: [],
      pendingFoods: foods,
      options: trackingOptions(),
    });
    const actual = resultCandidate(result, foods, addTotals());
    assert.equal(compareRanks(context.rank(actual), context.rank(oracle)), 0, `oracle de ${count} alimentos`);
    assert.ok(actual.totals.calorias <= target.kcal + EPS);
  }
});

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

test("fuzz determinista respeta techo, constraints, seleccion y el oracle pequeno", async () => {
  const service = quantityService();
  const random = seededRandom(0x5a17c0de);
  const steps = [1, 2, 5, 10, 25];
  const startedAt = performance.now();

  for (let caseIndex = 0; caseIndex < 120; caseIndex++) {
    const count = caseIndex % 6 + 1;
    const foods = Array.from({ length: count }, (_, index) => {
      const step = steps[Math.floor(random() * steps.length)];
      const min = step * (1 + Math.floor(random() * 2));
      const span = 1 + Math.floor(random() * (count >= 5 ? 1 : 2));
      return {
        foodId: `fuzz-${caseIndex}-${index}`,
        name: `Fuzz ${caseIndex} ${index}`,
        unit: random() < 0.5 ? "g" : "unidad",
        kcalPerUnitOrGram: 0.2 + Math.floor(random() * 35) / 10,
        proteinPerUnitOrGram: Math.floor(random() * 16) / 10,
        carbsPerUnitOrGram: Math.floor(random() * 20) / 10,
        fatPerUnitOrGram: Math.floor(random() * 10) / 10,
        categoria: index % 3 === 0 ? "proteina" : index % 3 === 1 ? "carbohidrato" : "grasas",
        minGramos: min,
        maxGramos: min + span * step + (caseIndex % 7 === 0 ? step * 0.4 : 0),
        stepGramos: step,
      };
    });
    const minimumTotals = foods.reduce((total, food) => {
      const { min } = alignedBounds(food);
      return addTotals(total, nutritionFor(food, min));
    }, addTotals());
    const target = {
      kcal: minimumTotals.calorias + 5 + Math.floor(random() * 80),
      proteina: caseIndex % 4 === 0 ? 0 : Math.floor(random() * 35),
      carbs: caseIndex % 5 === 0 ? 0 : Math.floor(random() * 45),
      grasas: caseIndex % 6 === 0 ? 0 : Math.floor(random() * 20),
    };
    const oracle = bruteForceOracle(foods, addTotals(), target);
    const context = oracleRankContext(foods, addTotals(), target);
    const payload = {
      mode: "kcalProteina",
      generationType: "selectedOnly",
      target,
      fixedFoods: [],
      pendingFoods: foods,
      options: trackingOptions(),
    };
    const first = await service.generarCantidades(payload);
    const second = await service.generarCantidades(structuredClone(payload));
    assert.deepEqual(first, second, `determinismo del caso ${caseIndex}`);
    assert.equal(first.foods.length, count, `seleccion completa del caso ${caseIndex}`);
    const actual = resultCandidate(first, foods, addTotals());
    assert.equal(compareRanks(context.rank(actual), context.rank(oracle)), 0, `oracle del caso ${caseIndex}`);
    assert.ok(actual.totals.calorias <= target.kcal + EPS, `techo del caso ${caseIndex}`);
    actual.quantities.forEach((quantity, index) => {
      const { min, max, step } = alignedBounds(foods[index]);
      assert.ok(quantity >= min - EPS && quantity <= max + EPS, `rango ${caseIndex}/${index}`);
      assert.ok(Math.abs(quantity / step - Math.round(quantity / step)) < EPS, `step ${caseIndex}/${index}`);
      assert.ok(Number.isFinite(quantity), `cantidad finita ${caseIndex}/${index}`);
    });
    Object.values(first.totals).forEach((value) => assert.ok(Number.isFinite(value)));
  }

  assert.ok(performance.now() - startedAt < 15000, "el fuzz debe terminar sin bloquear el proceso");
});
