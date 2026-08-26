const EPSILON = 1e-9;

export const MEAL_NUTRITION_POLICY = "meal_generation_balanced_v1";

export const MEAL_NUTRITION_CLASSIFICATIONS = Object.freeze({
  RECOMMENDED: "RECOMMENDED",
  BEST_EFFORT: "BEST_EFFORT",
  NO_SOLUTION: "NO_SOLUTION",
});

export const MEAL_NUTRITION_THRESHOLDS = Object.freeze({
  calorieExcellent: 5,
  calorieAcceptable: 10,
  proteinExcellent: 2.5,
  proteinReasonable: 5,
  proteinRelevant: 10,
  carbEnergyFloor: 48,
  carbEnergyRatio: 0.15,
  fatEnergyFloor: 45,
  fatEnergyRatio: 0.2,
});

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(number(value) * factor) / factor;
}

function nutrition(value = {}) {
  const nested = value?.totals || value?.totales || value?.macros || value;
  return {
    kcal: Math.max(0, number(nested?.kcal ?? nested?.calorias ?? nested?.calories)),
    proteina: Math.max(0, number(
      nested?.proteina ?? nested?.proteinas ?? nested?.protein ?? nested?.p
    )),
    carbs: Math.max(0, number(
      nested?.carbs ?? nested?.carbohidratos ?? nested?.carbohydrates ?? nested?.c
    )),
    grasas: Math.max(0, number(
      nested?.grasas ?? nested?.grasa ?? nested?.fat ?? nested?.g
    )),
  };
}

function calorieZone(error) {
  if (error <= MEAL_NUTRITION_THRESHOLDS.calorieExcellent + EPSILON) return "EXCELLENT";
  if (error <= MEAL_NUTRITION_THRESHOLDS.calorieAcceptable + EPSILON) return "ACCEPTABLE";
  return "OUTSIDE";
}

function proteinZone(distance, active) {
  if (!active || distance <= MEAL_NUTRITION_THRESHOLDS.proteinExcellent + EPSILON) {
    return "EXCELLENT";
  }
  if (distance <= MEAL_NUTRITION_THRESHOLDS.proteinReasonable + EPSILON) return "REASONABLE";
  if (distance <= MEAL_NUTRITION_THRESHOLDS.proteinRelevant + EPSILON) return "DEVIATED";
  return "WARNING";
}

function proteinZoneRank(zone) {
  return ({ EXCELLENT: 0, REASONABLE: 1, DEVIATED: 2, WARNING: 3 })[zone] ?? 4;
}

function macroTolerances(target) {
  return {
    carbsEnergy: target.carbs > 0
      ? Math.max(
        MEAL_NUTRITION_THRESHOLDS.carbEnergyFloor,
        target.carbs * 4 * MEAL_NUTRITION_THRESHOLDS.carbEnergyRatio
      )
      : Infinity,
    fatEnergy: target.grasas > 0
      ? Math.max(
        MEAL_NUTRITION_THRESHOLDS.fatEnergyFloor,
        target.grasas * 9 * MEAL_NUTRITION_THRESHOLDS.fatEnergyRatio
      )
      : Infinity,
  };
}

function signedText(label, value, unit = "g") {
  const absolute = round(Math.abs(value), 1);
  return `${label}: ${value < 0 ? "faltan" : "sobran"} ${absolute} ${unit}`;
}

function buildWarning({ difference, absoluteDifference, zones, macrosWithinRange }) {
  const reasons = [];
  const reasonCodes = [];

  if (zones.calories === "OUTSIDE") {
    reasonCodes.push("CALORIES_OUTSIDE_ACCEPTABLE_RANGE");
    reasons.push(signedText("Calorias", difference.kcal, "kcal"));
  }
  if (zones.protein === "DEVIATED" || zones.protein === "WARNING") {
    reasonCodes.push(difference.proteina < 0
      ? "PROTEIN_BELOW_REASONABLE_RANGE"
      : "PROTEIN_ABOVE_REASONABLE_RANGE");
    reasons.push(signedText("Proteina", difference.proteina));
  }
  if (!macrosWithinRange.carbs) {
    reasonCodes.push("CARBS_OUTSIDE_REASONABLE_RANGE");
    reasons.push(signedText("Carbohidratos", difference.carbs));
  }
  if (!macrosWithinRange.grasas) {
    reasonCodes.push("FAT_OUTSIDE_REASONABLE_RANGE");
    reasons.push(signedText("Grasas", difference.grasas));
  }

  const caloriesAligned = absoluteDifference.kcal <=
    MEAL_NUTRITION_THRESHOLDS.calorieAcceptable + EPSILON;
  const summary = caloriesAligned
    ? "Las calorias estan alineadas, pero el reparto de macros queda desbalanceado."
    : `La mejor opcion queda a ${round(absoluteDifference.kcal, 1)} kcal de la meta.`;

  return {
    code: "MEAL_NUTRITION_BEST_EFFORT",
    category: "nutrition",
    severity: "warning",
    title: "Revisa esta alternativa",
    summary,
    message: [summary, ...reasons].join(" "),
    reasons,
    reasonCodes,
  };
}

/**
 * Fuente unica para evaluar una solucion fisicamente valida. NO_SOLUTION no se
 * decide aqui: pertenece al orquestador y significa que no hubo ninguna
 * solucion que respetara las restricciones duras.
 */
export function rankMealNutritionResult(totalsValue = {}, targetValue = {}) {
  const totals = nutrition(totalsValue);
  const target = nutrition(targetValue);
  const difference = {
    kcal: round(totals.kcal - target.kcal, 6),
    proteina: round(totals.proteina - target.proteina, 6),
    carbs: round(totals.carbs - target.carbs, 6),
    grasas: round(totals.grasas - target.grasas, 6),
  };
  const absoluteDifference = Object.fromEntries(
    Object.entries(difference).map(([key, value]) => [key, round(Math.abs(value), 6)])
  );
  const proteinActive = target.proteina > 0;
  const zones = {
    calories: calorieZone(absoluteDifference.kcal),
    protein: proteinZone(absoluteDifference.proteina, proteinActive),
  };
  const tolerances = macroTolerances(target);
  const macroEnergyDifference = {
    carbs: round(absoluteDifference.carbs * 4, 6),
    grasas: round(absoluteDifference.grasas * 9, 6),
  };
  const macrosWithinRange = {
    carbs: target.carbs <= 0 || macroEnergyDifference.carbs <= tolerances.carbsEnergy + EPSILON,
    grasas: target.grasas <= 0 || macroEnergyDifference.grasas <= tolerances.fatEnergy + EPSILON,
  };
  const secondaryEnergyError = round(
    Math.hypot(macroEnergyDifference.carbs, macroEnergyDifference.grasas) /
      Math.max(target.kcal, 1),
    9
  );
  const recommended =
    absoluteDifference.kcal <= MEAL_NUTRITION_THRESHOLDS.calorieAcceptable + EPSILON &&
    (!proteinActive || absoluteDifference.proteina <=
      MEAL_NUTRITION_THRESHOLDS.proteinReasonable + EPSILON) &&
    macrosWithinRange.carbs &&
    macrosWithinRange.grasas;
  const status = recommended
    ? MEAL_NUTRITION_CLASSIFICATIONS.RECOMMENDED
    : MEAL_NUTRITION_CLASSIFICATIONS.BEST_EFFORT;
  return {
    policy: MEAL_NUTRITION_POLICY,
    status,
    recommended,
    usable: true,
    target,
    totals,
    difference,
    absoluteDifference,
    zones,
    proteinDistance: absoluteDifference.proteina,
    proteinZoneRank: proteinZoneRank(zones.protein),
    macroEnergyDifference,
    macroEnergyTolerances: {
      carbs: Number.isFinite(tolerances.carbsEnergy) ? round(tolerances.carbsEnergy, 6) : null,
      grasas: Number.isFinite(tolerances.fatEnergy) ? round(tolerances.fatEnergy, 6) : null,
    },
    macrosWithinRange,
    secondaryEnergyError,
  };
}

export function evaluateMealNutritionResult(totalsValue = {}, targetValue = {}) {
  const assessment = rankMealNutritionResult(totalsValue, targetValue);
  return {
    ...assessment,
    warning: assessment.recommended
      ? null
      : buildWarning(assessment),
    thresholds: MEAL_NUTRITION_THRESHOLDS,
  };
}

/**
 * Orden total y simetrico para soluciones que ya respetan los hard constraints.
 * Dentro de +/-10 kcal una mejora de banda proteica puede compensar unas pocas
 * kcal. Si ambas proteinas estan en la misma banda, vuelve a ganar la solucion
 * caloricamente mas cercana y luego deciden distancia proteica y C/G.
 */
export function compareMealNutritionAssessments(left, right) {
  const leftCaloriesClose = left.absoluteDifference.kcal <=
    MEAL_NUTRITION_THRESHOLDS.calorieAcceptable + EPSILON;
  const rightCaloriesClose = right.absoluteDifference.kcal <=
    MEAL_NUTRITION_THRESHOLDS.calorieAcceptable + EPSILON;

  if (left.recommended !== right.recommended) return left.recommended ? -1 : 1;
  if (leftCaloriesClose !== rightCaloriesClose) return leftCaloriesClose ? -1 : 1;

  const order = leftCaloriesClose
    ? [
      left.proteinZoneRank - right.proteinZoneRank,
      left.absoluteDifference.kcal - right.absoluteDifference.kcal,
      left.proteinDistance - right.proteinDistance,
      left.secondaryEnergyError - right.secondaryEnergyError,
    ]
    : [
      left.absoluteDifference.kcal - right.absoluteDifference.kcal,
      left.proteinZoneRank - right.proteinZoneRank,
      left.proteinDistance - right.proteinDistance,
      left.secondaryEnergyError - right.secondaryEnergyError,
    ];
  return order.find((difference) => Math.abs(difference) > EPSILON) || 0;
}

export function compareMealNutritionResults(leftValue = {}, rightValue = {}, targetValue = {}) {
  return compareMealNutritionAssessments(
    evaluateMealNutritionResult(leftValue, targetValue),
    evaluateMealNutritionResult(rightValue, targetValue)
  );
}
