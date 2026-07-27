import assert from "node:assert/strict";
import test from "node:test";

import ServicioAlimentos from "../servicio/alimentos.js";
import { TRACKING_OPTIMIZATION_POLICY } from "../menu2.js";

function quantityService(databaseFoods = []) {
  const service = new ServicioAlimentos("TEST");
  service.model = {
    obtenerAlimentos: async () => databaseFoods,
  };
  const generate = service.generarCantidades;
  service.generarCantidades = (payload = {}) => generate({
    ...payload,
    options: payload.options?.trackingPriority === true
      ? {
          ...payload.options,
          trackingOptimizationPolicy: TRACKING_OPTIMIZATION_POLICY,
        }
      : payload.options,
  });
  return service;
}

function fixedChicken() {
  return {
    foodId: "chicken",
    name: "Pechuga de pollo",
    unit: "g",
    quantity: 100,
    kcal: 165,
    protein: 31,
    carbs: 0,
    fat: 3.6,
    categoria: "proteina",
  };
}

function pendingRice() {
  return {
    foodId: "rice",
    name: "Arroz",
    unit: "g",
    kcalPerUnitOrGram: 3.4,
    proteinPerUnitOrGram: 0.07,
    carbsPerUnitOrGram: 0.76,
    fatPerUnitOrGram: 0.01,
    categoria: "carbohidrato",
  };
}

test("tracking usa menu2 con snapshots seleccionados y precision de 1 g", async () => {
  const service = quantityService([
    {
      id: "database-rice",
      nombre: "Arroz",
      unidad: "g",
      kcal: 50,
      proteina: 1,
      carbs: 10,
      grasas: 0,
      categoria: "carbohidrato",
    },
  ]);

  const result = await service.generarCantidades({
    mode: "kcal",
    generationType: "selectedOnly",
    target: { kcal: 500 },
    fixedFoods: [fixedChicken()],
    pendingFoods: [pendingRice()],
    options: { redondear: true, usarMinMax: true },
  });

  const chicken = result.foods.find((food) => food.nombre === "Pechuga de pollo");
  const rice = result.foods.find((food) => food.nombre === "Arroz");
  assert.equal(chicken.quantity, 100);
  assert.ok(rice.quantity >= 98 && rice.quantity <= 99);
  assert.ok(Math.abs(result.diff.calorias) <= 2);
});

test("devuelve la mejor aproximacion y el desvio cuando los macros no se pueden cuadrar", async () => {
  const service = quantityService();
  const result = await service.generarCantidades({
    mode: "full",
    generationType: "selectedOnly",
    target: { kcal: 500, proteina: 40, carbs: 60, grasas: 10 },
    fixedFoods: [fixedChicken()],
    pendingFoods: [
      {
        ...pendingRice(),
        kcalPerUnitOrGram: 1.26,
        proteinPerUnitOrGram: 0.027,
        carbsPerUnitOrGram: 0.282,
        fatPerUnitOrGram: 0.003,
      },
      {
        foodId: "banana",
        name: "Banana",
        unit: "g",
        kcalPerUnitOrGram: 0.99,
        proteinPerUnitOrGram: 0.013,
        carbsPerUnitOrGram: 0.228,
        fatPerUnitOrGram: 0.003,
        categoria: "carbohidrato",
      },
    ],
    options: { redondear: true, usarMinMax: true },
  });

  assert.equal(result.status, "warning");
  assert.equal(result.quality, "sin_solucion");
  assert.ok(Math.abs(result.diff.calorias) <= 10);
  assert.ok(Math.abs(result.diff.grasas) > 3);
  assert.match(result.message, /No se puede|No hay una solucion/i);
});

test("respeta alimentos por unidad sin tratarlos como gramos ni dividir sus kcal por 100", async () => {
  const service = quantityService();
  const result = await service.generarCantidades({
    mode: "kcal",
    generationType: "selectedOnly",
    target: { kcal: 156 },
    fixedFoods: [],
    pendingFoods: [{
      foodId: "egg",
      name: "Huevo",
      unit: "unidad",
      kcalPerUnitOrGram: 78,
      proteinPerUnitOrGram: 6,
      carbsPerUnitOrGram: 0.6,
      fatPerUnitOrGram: 5,
      categoria: "proteina",
    }],
    options: { redondear: true, usarMinMax: true },
  });

  assert.equal(result.foods.length, 1);
  assert.equal(result.foods[0].quantity, 2);
  assert.equal(result.foods[0].unit, "unidad");
  assert.equal(result.totals.calorias, 156);
});

test("tracking usa la zona calorica y C/G cuando la proteina restante es cero", async () => {
  const service = quantityService();
  const result = await service.generarCantidades({
    mode: "kcalProteina",
    generationType: "selectedOnly",
    target: { kcal: 355, proteina: 0, carbs: 4.2, grasas: 38.4 },
    fixedFoods: [],
    pendingFoods: [{
      ...pendingRice(),
      proteinPerUnitOrGram: 0.08,
      carbsPerUnitOrGram: 0.755,
      fatPerUnitOrGram: 0.005,
    }],
    options: { redondear: true, usarMinMax: true, trackingPriority: true },
  });

  assert.equal(result.foods[0].quantity, 103);
  assert.equal(result.totals.calorias, 350.2);
  assert.ok(result.totals.calorias <= 355);
  assert.equal(result.optimization.profile, "tracking_remaining");
  assert.equal(result.optimization.policy, "tracking_remaining_v2");
  assert.equal(result.optimization.calorieCeilingSatisfied, true);
  assert.equal(result.optimization.inCalorieZone, true);
  assert.equal(result.optimization.proteinTargetActive, false);
  assert.equal(result.optimization.proteinDeficit, 0);
  assert.match(result.message, /proteina restante ya estaba cubierta/i);
});

test("tracking llena calorias y declara el deficit cuando la proteina no es alcanzable", async () => {
  const service = quantityService();
  const result = await service.generarCantidades({
    mode: "kcalProteina",
    generationType: "selectedOnly",
    target: { kcal: 355, proteina: 40, carbs: 4.2, grasas: 38.4 },
    fixedFoods: [],
    pendingFoods: [{
      ...pendingRice(),
      proteinPerUnitOrGram: 0.08,
      carbsPerUnitOrGram: 0.755,
      fatPerUnitOrGram: 0.005,
    }],
    options: { redondear: true, usarMinMax: true, trackingPriority: true },
  });

  assert.equal(result.foods[0].quantity, 104);
  assert.equal(result.totals.calorias, 353.6);
  assert.equal(result.optimization.proteinReachable, false);
  assert.equal(result.optimization.proteinDeficit, 31.68);
  assert.equal(result.status, "warning");
});

test("tracking distribuye arroz y banana cerca del techo sin dejar ninguno en cantidad minima arbitraria", async () => {
  const service = quantityService();
  const result = await service.generarCantidades({
    mode: "kcalProteina",
    generationType: "selectedOnly",
    target: { kcal: 355, proteina: 0, carbs: 90, grasas: 0 },
    fixedFoods: [],
    pendingFoods: [
      {
        ...pendingRice(),
        proteinPerUnitOrGram: 0.08,
        carbsPerUnitOrGram: 0.755,
        fatPerUnitOrGram: 0.005,
      },
      {
        foodId: "banana",
        name: "Banana",
        unit: "g",
        kcalPerUnitOrGram: 0.89,
        proteinPerUnitOrGram: 0.011,
        carbsPerUnitOrGram: 0.228,
        fatPerUnitOrGram: 0.003,
        categoria: "fruta",
      },
    ],
    options: { redondear: true, usarMinMax: true, trackingPriority: true },
  });

  const rice = result.foods.find((food) => food.nombre === "Arroz");
  const banana = result.foods.find((food) => food.nombre === "Banana");
  assert.ok(rice.quantity > 20);
  assert.ok(banana.quantity > 20);
  assert.ok(result.totals.calorias <= 355);
  assert.ok(result.totals.calorias >= 352);
  assert.equal(result.optimization.calorieCeilingSatisfied, true);
});

test("tracking reparte pollo arroz y almendras sin superar kcal y alcanza proteina", async () => {
  const service = quantityService();
  const result = await service.generarCantidades({
    mode: "kcalProteina",
    generationType: "selectedOnly",
    target: { kcal: 500, proteina: 30, carbs: 50, grasas: 20 },
    fixedFoods: [],
    pendingFoods: [
      {
        foodId: "chicken",
        name: "Pechuga de pollo",
        unit: "g",
        kcalPerUnitOrGram: 1.65,
        proteinPerUnitOrGram: 0.31,
        carbsPerUnitOrGram: 0,
        fatPerUnitOrGram: 0.036,
        categoria: "proteina",
      },
      {
        ...pendingRice(),
        proteinPerUnitOrGram: 0.08,
        carbsPerUnitOrGram: 0.755,
        fatPerUnitOrGram: 0.005,
      },
      {
        foodId: "almond",
        name: "Almendras",
        unit: "g",
        kcalPerUnitOrGram: 5.79,
        proteinPerUnitOrGram: 0.21,
        carbsPerUnitOrGram: 0.22,
        fatPerUnitOrGram: 0.5,
        categoria: "grasas",
      },
    ],
    options: { redondear: true, usarMinMax: true, trackingPriority: true },
  });

  assert.ok(result.totals.calorias <= 500);
  assert.ok(result.totals.calorias >= 490);
  assert.ok(result.totals.proteina >= 30);
  assert.ok(Math.abs(result.diff.carbohidratos) <= 2);
  assert.ok(Math.abs(result.diff.grasas) <= 1);
  assert.equal(result.optimization.proteinReachable, true);
  assert.equal(result.optimization.proteinDeficit, 0);
});

test("tracking no queda atrapado debajo de proteina cuando existe una combinacion discreta alcanzable", async () => {
  const service = quantityService();
  const result = await service.generarCantidades({
    mode: "kcalProteina",
    generationType: "selectedOnly",
    target: { kcal: 113, proteina: 85.3, carbs: 0, grasas: 0 },
    fixedFoods: [],
    pendingFoods: [
      {
        foodId: "discrete-a",
        name: "Fuente A",
        unit: "unidad",
        kcalPerUnitOrGram: 8,
        proteinPerUnitOrGram: 7.7,
        carbsPerUnitOrGram: 0,
        fatPerUnitOrGram: 0,
        categoria: "proteina",
        minGramos: 1,
        maxGramos: 7,
        stepGramos: 1,
      },
      {
        foodId: "discrete-b",
        name: "Fuente B",
        unit: "unidad",
        kcalPerUnitOrGram: 9,
        proteinPerUnitOrGram: 1.1,
        carbsPerUnitOrGram: 0,
        fatPerUnitOrGram: 0,
        categoria: "proteina",
        minGramos: 1,
        maxGramos: 2,
        stepGramos: 1,
      },
      {
        foodId: "discrete-c",
        name: "Fuente C",
        unit: "unidad",
        kcalPerUnitOrGram: 15,
        proteinPerUnitOrGram: 11.1,
        carbsPerUnitOrGram: 0,
        fatPerUnitOrGram: 0,
        categoria: "proteina",
        minGramos: 1,
        maxGramos: 7,
        stepGramos: 1,
      },
    ],
    options: { redondear: true, usarMinMax: true, trackingPriority: true },
  });

  assert.equal(result.optimization.proteinReachable, true);
  assert.ok(result.totals.calorias <= 113);
  assert.ok(result.totals.proteina >= 85.3);
  assert.equal(result.optimization.proteinDeficit, 0);
});

test("tracking detecta una combinacion proteica alcanzable aunque el greedy por densidad falle", async () => {
  const service = quantityService();
  const result = await service.generarCantidades({
    mode: "kcalProteina",
    generationType: "selectedOnly",
    target: { kcal: 83.2, proteina: 59.2, carbs: 0, grasas: 0 },
    fixedFoods: [],
    pendingFoods: [
      {
        foodId: "pareto-a",
        name: "Pareto A",
        unit: "unidad",
        kcalPerUnitOrGram: 8.2,
        proteinPerUnitOrGram: 5,
        carbsPerUnitOrGram: 0,
        fatPerUnitOrGram: 0,
        categoria: "proteina",
        minGramos: 1,
        maxGramos: 3,
        stepGramos: 1,
      },
      {
        foodId: "pareto-b",
        name: "Pareto B",
        unit: "unidad",
        kcalPerUnitOrGram: 13.7,
        proteinPerUnitOrGram: 9.2,
        carbsPerUnitOrGram: 0,
        fatPerUnitOrGram: 0,
        categoria: "proteina",
        minGramos: 1,
        maxGramos: 3,
        stepGramos: 1,
      },
      {
        foodId: "pareto-c",
        name: "Pareto C",
        unit: "unidad",
        kcalPerUnitOrGram: 15.6,
        proteinPerUnitOrGram: 12.9,
        carbsPerUnitOrGram: 0,
        fatPerUnitOrGram: 0,
        categoria: "proteina",
        minGramos: 1,
        maxGramos: 2,
        stepGramos: 1,
      },
    ],
    options: { redondear: true, usarMinMax: true, trackingPriority: true },
  });

  assert.equal(result.optimization.proteinReachable, true);
  assert.equal(result.totals.calorias, 83.2);
  assert.equal(result.totals.proteina, 59.2);
  assert.deepEqual(result.foods.map((food) => food.quantity), [3, 2, 2]);
});

test("tracking respeta el alimento fijo y optimiza solo arroz y banana bajo el techo", async () => {
  const service = quantityService();
  const result = await service.generarCantidades({
    mode: "kcalProteina",
    generationType: "selectedOnly",
    target: { kcal: 500, proteina: 40, carbs: 60, grasas: 10 },
    fixedFoods: [fixedChicken()],
    pendingFoods: [
      {
        ...pendingRice(),
        kcalPerUnitOrGram: 1.26,
        proteinPerUnitOrGram: 0.027,
        carbsPerUnitOrGram: 0.282,
        fatPerUnitOrGram: 0.003,
      },
      {
        foodId: "banana",
        name: "Banana",
        unit: "g",
        kcalPerUnitOrGram: 0.99,
        proteinPerUnitOrGram: 0.013,
        carbsPerUnitOrGram: 0.228,
        fatPerUnitOrGram: 0.003,
        categoria: "carbohidrato",
      },
    ],
    options: { redondear: true, usarMinMax: true, trackingPriority: true },
  });

  assert.equal(result.foods.find((food) => food.nombre === "Pechuga de pollo").quantity, 100);
  assert.ok(result.totals.calorias <= 500);
  assert.ok(result.totals.calorias >= 497);
  assert.equal(result.optimization.proteinReachable, false);
  assert.ok(result.optimization.proteinDeficit > 0);
});

test("tracking respeta unidades discretas y nunca elige la unidad que supera kcal", async () => {
  const service = quantityService();
  const result = await service.generarCantidades({
    mode: "kcalProteina",
    generationType: "selectedOnly",
    target: { kcal: 355, proteina: 0 },
    fixedFoods: [],
    pendingFoods: [{
      foodId: "egg",
      name: "Huevo",
      unit: "unidad",
      kcalPerUnitOrGram: 78,
      proteinPerUnitOrGram: 6,
      carbsPerUnitOrGram: 0.6,
      fatPerUnitOrGram: 5,
      categoria: "proteina",
    }],
    options: { redondear: true, usarMinMax: true, trackingPriority: true },
  });

  assert.equal(result.foods[0].quantity, 4);
  assert.equal(result.totals.calorias, 312);
  assert.ok(result.totals.calorias <= 355);
});

test("tracking alinea el minimo a la grilla del multiplo al evaluar proteina alcanzable", async () => {
  const service = quantityService();
  const result = await service.generarCantidades({
    mode: "kcalProteina",
    generationType: "selectedOnly",
    target: { kcal: 30, proteina: 30 },
    fixedFoods: [],
    pendingFoods: [{
      foodId: "step-protein",
      name: "Proteina por porcion",
      unit: "unidad",
      kcalPerUnitOrGram: 10,
      proteinPerUnitOrGram: 10,
      carbsPerUnitOrGram: 0,
      fatPerUnitOrGram: 0,
      categoria: "proteina",
      minGramos: 1,
      maxGramos: 6,
      stepGramos: 2,
    }],
    options: { redondear: true, usarMinMax: true, trackingPriority: true },
  });

  assert.equal(result.foods[0].quantity, 2);
  assert.equal(result.totals.calorias, 20);
  assert.equal(result.optimization.proteinReachable, false);
  assert.equal(result.optimization.proteinDeficit, 10);
});

test("tracking alinea tambien el maximo y nunca devuelve una cantidad fuera del multiplo", async () => {
  const service = quantityService();
  const result = await service.generarCantidades({
    mode: "kcalProteina",
    generationType: "selectedOnly",
    target: { kcal: 30, proteina: 30 },
    fixedFoods: [],
    pendingFoods: [{
      foodId: "step-maximum",
      name: "Maximo no alineado",
      unit: "unidad",
      kcalPerUnitOrGram: 10,
      proteinPerUnitOrGram: 10,
      categoria: "proteina",
      minGramos: 1,
      maxGramos: 3,
      stepGramos: 2,
    }],
    options: { redondear: true, usarMinMax: true, trackingPriority: true },
  });

  assert.equal(result.foods[0].quantity, 2);
  assert.equal(result.totals.calorias, 20);
  assert.equal(result.optimization.proteinReachable, false);
});

test("tracking informa error si minimo y maximo no contienen ningun multiplo valido", async () => {
  const service = quantityService();
  const result = await service.generarCantidades({
    mode: "kcalProteina",
    generationType: "selectedOnly",
    target: { kcal: 100, proteina: 20 },
    fixedFoods: [],
    pendingFoods: [{
      foodId: "invalid-grid",
      name: "Grilla invalida",
      unit: "unidad",
      kcalPerUnitOrGram: 10,
      proteinPerUnitOrGram: 10,
      categoria: "proteina",
      minGramos: 3,
      maxGramos: 3,
      stepGramos: 2,
    }],
    options: { redondear: true, usarMinMax: true, trackingPriority: true },
  });

  assert.equal(result.status, "error");
  assert.equal(result.foods.length, 0);
  assert.match(result.errors.join(" "), /minimos, maximos y multiplos/i);
});

test("tracking no tolera ni una unidad que exceda el techo por centesimas", async () => {
  const service = quantityService();
  const result = await service.generarCantidades({
    mode: "kcalProteina",
    generationType: "selectedOnly",
    target: { kcal: 10, proteina: 0 },
    fixedFoods: [],
    pendingFoods: [{
      foodId: "strict-ceiling",
      name: "Porcion indivisible",
      unit: "unidad",
      kcalPerUnitOrGram: 10.005,
      proteinPerUnitOrGram: 1,
      carbsPerUnitOrGram: 0,
      fatPerUnitOrGram: 0,
      categoria: "proteina",
      minGramos: 1,
      maxGramos: 1,
      stepGramos: 1,
    }],
    options: { redondear: true, usarMinMax: true, trackingPriority: true },
  });

  assert.equal(result.status, "error");
  assert.equal(result.foods.length, 0);
  assert.match(result.errors.join(" "), /techo calorico/i);
});

test("si la proteina es imposible tracking maximiza proteina dentro de la zona calorica", async () => {
  const service = quantityService();
  const result = await service.generarCantidades({
    mode: "kcalProteina",
    generationType: "selectedOnly",
    target: { kcal: 10, proteina: 100 },
    fixedFoods: [],
    pendingFoods: [
      {
        foodId: "calorie-source",
        name: "Fuente calorica",
        unit: "unidad",
        kcalPerUnitOrGram: 4,
        proteinPerUnitOrGram: 0,
        carbsPerUnitOrGram: 1,
        fatPerUnitOrGram: 0,
        categoria: "carbohidrato",
        minGramos: 1,
        maxGramos: 2,
        stepGramos: 1,
      },
      {
        foodId: "protein-source",
        name: "Fuente proteica",
        unit: "unidad",
        kcalPerUnitOrGram: 2,
        proteinPerUnitOrGram: 10,
        carbsPerUnitOrGram: 0,
        fatPerUnitOrGram: 0,
        categoria: "proteina",
        minGramos: 1,
        maxGramos: 2,
        stepGramos: 1,
      },
    ],
    options: { redondear: true, usarMinMax: true, trackingPriority: true },
  });

  assert.equal(result.foods.find((food) => food.nombre === "Fuente calorica").quantity, 1);
  assert.equal(result.foods.find((food) => food.nombre === "Fuente proteica").quantity, 2);
  assert.equal(result.totals.calorias, 8);
  assert.equal(result.totals.proteina, 20);
  assert.equal(result.optimization.inCalorieZone, true);
  assert.equal(result.optimization.proteinReachable, false);
});

test("si la proteina es imposible el knapsack calorico evita un optimo local", async () => {
  const service = quantityService();
  const result = await service.generarCantidades({
    mode: "kcalProteina",
    generationType: "selectedOnly",
    target: { kcal: 117.6, proteina: 84.4 },
    fixedFoods: [],
    pendingFoods: [
      {
        foodId: "local-a",
        name: "Local A",
        unit: "unidad",
        kcalPerUnitOrGram: 4.7,
        proteinPerUnitOrGram: 7.3,
        categoria: "proteina",
        minGramos: 1,
        maxGramos: 2,
        stepGramos: 1,
      },
      {
        foodId: "local-b",
        name: "Local B",
        unit: "unidad",
        kcalPerUnitOrGram: 18.7,
        proteinPerUnitOrGram: 11.6,
        categoria: "proteina",
        minGramos: 1,
        maxGramos: 4,
        stepGramos: 1,
      },
      {
        foodId: "local-c",
        name: "Local C",
        unit: "unidad",
        kcalPerUnitOrGram: 15.1,
        proteinPerUnitOrGram: 6.2,
        categoria: "proteina",
        minGramos: 1,
        maxGramos: 6,
        stepGramos: 1,
      },
    ],
    options: { redondear: true, usarMinMax: true, trackingPriority: true },
  });

  assert.equal(result.optimization.proteinReachable, false);
  assert.equal(result.totals.calorias, 114.4);
  assert.equal(result.totals.proteina, 73.4);
  assert.deepEqual(result.foods.map((food) => food.quantity), [2, 4, 2]);
});

test("tracking respeta el multiplo y elige la cantidad mas cercana por debajo", async () => {
  const service = quantityService();
  const result = await service.generarCantidades({
    mode: "kcalProteina",
    generationType: "selectedOnly",
    target: { kcal: 355, proteina: 0 },
    fixedFoods: [],
    pendingFoods: [{ ...pendingRice(), stepGramos: 25 }],
    options: { redondear: true, usarMinMax: true, trackingPriority: true },
  });

  assert.equal(result.foods[0].quantity, 100);
  assert.equal(result.totals.calorias, 340);
  assert.ok(result.totals.calorias <= 355);
});

test("tracking devuelve error si los minimos ya superan el techo calorico", async () => {
  const service = quantityService();
  const result = await service.generarCantidades({
    mode: "kcalProteina",
    generationType: "selectedOnly",
    target: { kcal: 50, proteina: 0 },
    fixedFoods: [],
    pendingFoods: [pendingRice()],
    options: { redondear: true, usarMinMax: true, trackingPriority: true },
  });

  assert.equal(result.status, "error");
  assert.equal(result.foods.length, 0);
  assert.match(result.errors.join(" "), /minimas.*techo calorico/i);
});
